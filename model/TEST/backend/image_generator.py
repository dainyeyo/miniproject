"""
image_generator.py
------------------
stabilityai/sd-turbo 모델을 사용하여 텍스트 프롬프트로 이미지를 생성합니다.
이 파일은 나중에 StreamDiffusion으로 교체하기 쉽도록 인터페이스를 분리해 놓았습니다.

[StreamDiffusion으로 교체 방법]
1. StreamDiffusionGenerator 클래스를 구현합니다.
2. main.py에서 SDTurboGenerator 대신 StreamDiffusionGenerator를 import합니다.
"""

import io
import base64
import logging
import time
import re
import urllib.request
import uuid

import torch
from PIL import Image
from deep_translator import GoogleTranslator

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────
# 헬퍼 함수: Catbox.moe 이미지 업로드
# ─────────────────────────────────────────
def upload_to_catbox(image: Image.Image) -> str:
    """Catbox.moe에 이미지를 업로드하고 영구 이미지 URL을 반환합니다. 실패 시 None을 반환합니다."""
    try:
        # 이미지를 바이너리로 저장
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        file_data = img_byte_arr.read()
        
        boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
        
        # multipart/form-data 빌드
        body = []
        
        # field: reqtype
        body.append(f"--{boundary}".encode('utf-8'))
        body.append(b'Content-Disposition: form-data; name="reqtype"')
        body.append(b'')
        body.append(b'fileupload')
        
        # field: fileToUpload
        body.append(f"--{boundary}".encode('utf-8'))
        body.append(b'Content-Disposition: form-data; name="fileToUpload"; filename="generated.png"')
        body.append(b'Content-Type: image/png')
        body.append(b'')
        body.append(file_data)
        
        # end boundary
        body.append(f"--{boundary}--".encode('utf-8'))
        body.append(b'')
        
        data = b'\r\n'.join(body)
        
        req = urllib.request.Request(
            'https://catbox.moe/user/api.php',
            data=data,
            headers={
                'Content-Type': f'multipart/form-data; boundary={boundary}',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        )
        
        with urllib.request.urlopen(req, timeout=10) as response:
            res_url = response.read().decode('utf-8').strip()
            if res_url.startswith('https://'):
                logger.info(f"☁️ [Catbox 업로드 성공]: {res_url}")
                return res_url
    except Exception as e:
        logger.error(f"⚠️ [Catbox 업로드 실패]: {e}")
    return None


# ─────────────────────────────────────────
# 헬퍼 함수: PIL 이미지 → base64 문자열
# ─────────────────────────────────────────
def pil_to_base64(image: Image.Image, fmt: str = "PNG") -> str:
    """PIL Image를 base64 인코딩 문자열로 변환합니다."""
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    buffer.seek(0)
    b64 = base64.b64encode(buffer.read()).decode("utf-8")
    return f"data:image/{fmt.lower()};base64,{b64}"


# ─────────────────────────────────────────
# 기본 구현: stabilityai/sd-turbo (Diffusers)
# ─────────────────────────────────────────
class SDTurboGenerator:
    """
    stabilityai/sd-turbo를 사용하는 이미지 생성기.
    서버 시작 시 한 번만 인스턴스를 만들어서 재사용합니다.
    """

    MODEL_ID = "stabilityai/sd-turbo"

    def __init__(self):
        self.pipe = None
        self.device = None
        self.dtype = None
        self._load_model()

    def _check_cuda_compatible(self) -> bool:
        """
        현재 GPU가 설치된 PyTorch 빌드와 호환되는지 확인합니다.
        RTX 5060(sm_120, Blackwell)처럼 최신 GPU는 nightly + CUDA 13.x 드라이버가 필요합니다.
        """
        if not torch.cuda.is_available():
            return False
        try:
            major, minor = torch.cuda.get_device_capability(0)
            sm = major * 10 + minor  # e.g. sm_120 → 120

            # PyTorch가 이 GPU의 CUDA 커널을 포함하고 있는지 간단히 테스트
            test_tensor = torch.tensor([1.0], device="cuda")
            _ = test_tensor + test_tensor  # 실제 CUDA 연산 실행
            return True
        except Exception as e:
            logger.warning(f"⚠️  GPU CUDA 커널 호환성 테스트 실패: {e}")
            return False

    def _load_model(self):
        """모델을 로드합니다. GPU가 있으면 CUDA + float16, 없으면 CPU + float32를 사용합니다."""
        from diffusers import AutoPipelineForText2Image

        if self._check_cuda_compatible():
            self.device = "cuda"
            self.dtype = torch.float16
            gpu_name = torch.cuda.get_device_name(0)
            cap = torch.cuda.get_device_capability(0)
            logger.info(f"✅ CUDA GPU 감지됨: {gpu_name} (sm_{cap[0]}{cap[1]}) — float16 모드")
        else:
            self.device = "cpu"
            self.dtype = torch.float32
            if torch.cuda.is_available():
                gpu_name = torch.cuda.get_device_name(0)
                cap = torch.cuda.get_device_capability(0)
                logger.warning(
                    f"⚠️  GPU({gpu_name}, sm_{cap[0]}{cap[1]})가 감지됐지만 현재 PyTorch 빌드와 "
                    f"호환되지 않습니다. CPU 모드로 실행합니다.\n"
                    f"   → GPU 사용을 원하면 NVIDIA 드라이버를 582.06 이상으로 업데이트 후\n"
                    f"     pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/cu130 을 실행하세요."
                )
            else:
                logger.warning(
                    "⚠️  GPU를 찾을 수 없습니다. CPU 모드로 실행합니다. "
                    "이미지 생성이 매우 느릴 수 있습니다 (수십 초 이상)."
                )

        logger.info(f"모델 로드 중: {self.MODEL_ID} — 첫 실행 시 시간이 걸릴 수 있습니다...")
        start = time.time()

        # CPU 모드에서도 캐시된 fp16 파일을 로드 후 float32로 변환
        # (variant=None 시 float32 파일을 새로 다운로드하므로 비효율적)
        load_dtype = torch.float16  # 항상 fp16 파일로 로드 (캐시 재사용)
        self.pipe = AutoPipelineForText2Image.from_pretrained(
            self.MODEL_ID,
            torch_dtype=load_dtype,
            variant="fp16",
        )
        # CPU 모드: fp16 가중치를 float32로 변환 (CPU는 float16 연산 미지원)
        if self.device == "cpu":
            self.pipe = self.pipe.to(torch.float32)
        self.pipe = self.pipe.to(self.device)

        # 메모리 절약: attention slicing (GPU 메모리가 부족할 때 유용)
        if self.device == "cuda":
            self.pipe.enable_attention_slicing()

        elapsed = time.time() - start
        logger.info(f"✅ 모델 로드 완료 ({elapsed:.1f}초)")

    def generate(self, prompt: str, num_inference_steps: int = 1) -> str:
        """
        프롬프트를 받아 512×512 이미지를 생성하고 base64 문자열로 반환합니다.

        Parameters
        ----------
        prompt : str
            이미지 생성에 사용할 텍스트 프롬프트
        num_inference_steps : int
            추론 스텝 수 (sd-turbo는 1~2 권장)

        Returns
        -------
        str
            "data:image/png;base64,..." 형식의 문자열
        """
        if not prompt or not prompt.strip():
            prompt = "a beautiful landscape"

        # 한글 감지 및 구글 번역 적용
        if re.search(r"[ㄱ-ㅎㅏ-ㅣ가-힣]", prompt):
            try:
                translated = GoogleTranslator(source="ko", target="en").translate(prompt)
                logger.info(f"📝 [한글 감지 자동 번역]: '{prompt}' ➔ '{translated}'")
                prompt = translated
            except Exception as e:
                logger.error(f"⚠️ [번역 오류]: {e}. 원본 프롬프트로 진행합니다.")

        logger.info(f"이미지 생성 시작: '{prompt[:60]}...' (steps={num_inference_steps})")
        start = time.time()

        # sd-turbo는 guidance_scale=0.0 권장 (CFG 비활성화)
        result = self.pipe(
            prompt=prompt,
            num_inference_steps=num_inference_steps,
            guidance_scale=0.0,
            height=512,
            width=512,
        )
        image: Image.Image = result.images[0]

        elapsed = time.time() - start
        # 1안: 로컬 static 폴더에 파일 저장 (Vercel Payload Limit 우회를 위한 절대 권장 구조)
        try:
            from pathlib import Path
            static_dir = Path(__file__).parent.parent / "frontend" / "static_images"
            static_dir.mkdir(parents=True, exist_ok=True)
            
            filename = f"gen_{uuid.uuid4().hex}.png"
            file_path = static_dir / filename
            
            image.save(file_path, format="PNG")
            logger.info(f"💾 [로컬 파일 저장 성공]: {file_path}")
            
            # 절대 경로가 아닌, 상대 경로 형식으로 리턴 후 main.py에서 절대 주소로 빌드
            return f"/static/static_images/{filename}"
        except Exception as local_save_err:
            logger.error(f"❌ [로컬 파일 저장 실패]: {local_save_err}")

        # 2안: 이미지 공유를 위해 무료 이미지 호스팅(Catbox)에 먼저 업로드 시도
        shared_url = upload_to_catbox(image)
        if shared_url:
            return shared_url

        # 업로드 실패 시 폴백으로 로컬용 base64 문자열 반환
        return pil_to_base64(image)

    def is_gpu(self) -> bool:
        return self.device == "cuda"


# ─────────────────────────────────────────
# [확장 포인트] StreamDiffusion Generator
# 아래 클래스를 구현하면 main.py에서 교체만 하면 됩니다.
# ─────────────────────────────────────────
class StreamDiffusionGenerator:
    """
    StreamDiffusion 기반 실시간 이미지 생성기 (미구현 스텁).

    StreamDiffusion을 설치한 후 아래를 참고하여 구현하세요:
    https://github.com/cumulo-autumn/StreamDiffusion

    설치:
        pip install git+https://github.com/cumulo-autumn/StreamDiffusion.git
        python -m streamdiffusion.tools.install

    구현 후 main.py에서:
        from image_generator import StreamDiffusionGenerator as Generator
    로 변경하면 됩니다.
    """

    def __init__(self):
        raise NotImplementedError(
            "StreamDiffusionGenerator는 아직 구현되지 않았습니다. "
            "SDTurboGenerator를 사용하세요."
        )

    def generate(self, prompt: str, num_inference_steps: int = 1) -> str:
        raise NotImplementedError


# ─────────────────────────────────────────
# 팩토리 함수: main.py에서 이것만 호출하면 됩니다
# ─────────────────────────────────────────
def create_generator(use_stream_diffusion: bool = False) -> SDTurboGenerator:
    """
    이미지 생성기를 생성합니다.
    use_stream_diffusion=True로 설정하면 StreamDiffusion 기반 생성기를 반환합니다.
    """
    if use_stream_diffusion:
        return StreamDiffusionGenerator()
    return SDTurboGenerator()
