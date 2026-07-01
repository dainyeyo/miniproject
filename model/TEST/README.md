# AI 실시간 이미지 생성기 — SD-Turbo 프로토타입 & GPU 설정 가이드

텍스트 프롬프트를 입력하면 `stabilityai/sd-turbo` AI 모델이 실시간으로 512×512 이미지를 생성합니다.
정상적인 실시간 생성 속도를 확보하려면 **NVIDIA GPU + PyTorch CUDA 환경 설정**이 반드시 필요합니다. CUDA 가속이 비활성화될 경우 CPU로 연산이 대체되어 이미지 생성 속도가 매우 저하됩니다.

---

## 📁 폴더 구조

```
model/TEST/
├── backend/
│   ├── main.py              # FastAPI 서버 (WebSocket + HTTP API)
│   ├── image_generator.py   # SD-Turbo 이미지 생성 모듈 (교체 가능한 구조)
│   └── requirements.txt     # Python 의존성
├── frontend/
│   ├── index.html           # 메인 페이지
│   ├── style.css            # 다크 테마 스타일
│   └── app.js               # WebSocket/HTTP 통신 + 실시간 갱신 로직
└── README.md                # 통합 가이드 문서
```

---

## ⚙️ 1. 필수 시스템 설정

### NVIDIA 드라이버 확인
먼저 시스템에 NVIDIA 그래픽 드라이버가 정상적으로 구성되어 있는지 확인합니다. 터미널에서 아래 명령어를 실행하십시오.
```bash
nvidia-smi
```
정상 작동한다면 GPU 모델명, 드라이버 버전, 그리고 지원하는 최대 **CUDA Version**이 표기됩니다. 만약 `nvidia-smi` 명령어를 인식하지 못하거나 GPU 드바이스가 조회되지 않을 경우, NVIDIA 공식 홈페이지에서 최신 드라이버를 우선 설치해야 합니다.

### Python 환경 구성
Windows OS 기준 **Python 3.10** 또는 **3.11** 버전 사용을 강력히 권장합니다. 본 가이드는 **Python 3.11** 런타임을 기준으로 설명합니다.
```bash
python --version
```

---

## 🛠️ 2. 가상환경 구축

프로젝트 루트 디렉토리(`model/TEST`)로 이동한 뒤 독립된 가상환경을 구성합니다.
```powershell
cd model\TEST

# Python 3.11 가상환경 생성
python -m venv venv311

# PowerShell 환경에서 가상환경 활성화
.\venv311\Scripts\Activate.ps1

# pip 패키지 관리자 최신화
python -m pip install --upgrade pip
```

> [!NOTE]
> **PowerShell 스크립트 실행 에러 해결방안**
> 만약 PowerShell 보안 정책 제한으로 인해 가상환경 활성화 스크립트가 실행되지 않는다면, 아래 명령어를 실행하여 로컬 스크립트 실행 권한을 해제한 후 다시 활성화 명령어를 시도하십시오.
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```

---

## ⚡ 3. CUDA 가속 PyTorch 라이브러리 설치

PyTorch는 설치 환경의 CUDA 버전에 맞추어 최적화된 휠(Wheel) 파일을 받아야 하므로, 공통 `requirements.txt`에 포함하지 않고 독립적으로 설치를 진행합니다.

대부분의 최신 RTX GPU 계열은 **CUDA 12.8** 대응 바이너리 설치를 시도합니다.
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

만약 사용 중인 GPU 아키텍처나 그래픽 드라이버 버전과 충돌이 발생한다면, [PyTorch 공식 설치 가이드 페이지](https://pytorch.org/get-started/locally/)에서 본인 시스템에 호환되는 빌드 명령어를 참고하십시오.

*최신 아키텍처 GPU(예: Blackwell 등)를 사용하여 정식 릴리즈 버전의 PyTorch가 대응하지 못할 경우, 아래와 같이 나이트리(Nightly) 빌드로 수동 우회 설치를 시도할 수 있습니다.*
```bash
pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128
```

> [!WARNING]
> 기본 PyPI 패키지 인덱스인 `pip install torch`만 수행할 경우, GPU 가속이 불가능한 CPU 전용 빌드가 받아질 수 있으므로 반드시 `--index-url` 플래그를 동반해야 합니다.

---

## 📦 4. 백엔드 의존 패키지 인스톨

가상환경이 활성화된 상태에서 FastAPI 및 Diffusers 파이프라인 구동에 필요한 나머지 라이브러리들을 일괄 설치합니다.
```bash
pip install -r backend\requirements.txt
```
*`backend/requirements.txt` 목록: FastAPI, Uvicorn, Diffusers, Transformers, Accelerate, Pillow, deep_translator, safetensors 등.*

---

## 🔍 5. GPU 하드웨어 인식 무결성 검증

PyTorch가 NVIDIA CUDA 가속 엔진을 올바르게 바인딩했는지 파이썬 인터프리터 명령어로 직접 검증합니다.
```bash
python -c "import torch; print('torch:', torch.__version__); print('cuda available:', torch.cuda.is_available()); print('cuda:', torch.version.cuda); print('gpu:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none')"
```

**정상 출력 예시:**
```
torch: 2.x.x+cu128
cuda available: True
cuda: 12.8
gpu: NVIDIA GeForce RTX ...
```
> [!CAUTION]
> 만약 `cuda available: False`로 리턴된다면 백엔드 구동 시 CPU 텐서 연산으로 대체되어 극도로 느려집니다. 드라이버 버전과 PyTorch CUDA 휠의 버전 정합성을 다시 검토하십시오.

---

## 🚀 6. 백엔드 실행 및 서빙

```bash
cd backend
python main.py
```
* **최초 실행 시**: Hugging Face 허브로부터 `stabilityai/sd-turbo` 가중치 파일(약 1.6GB 이상)을 백그라운드 다운로드하므로 네트워크 환경에 따라 수 분의 딜레이가 발생할 수 있습니다.
* 다운로드가 정상 완료되면 `http://localhost:8000` 포트를 점유하여 API 서버가 리스닝 상태로 전환됩니다.

---

## 🧪 7. 런타임 가동 상태 디버깅

### 1) API 서버 헬스체크 및 장치 매핑 확인
새 터미널 환경에서 아래 status 엔드포인트를 호출하여 바인딩된 연산 장치를 점검합니다.
```bash
curl http://localhost:8000/api/status
```
**정상 응답 JSON:**
```json
{
  "status": "ok",
  "model": "stabilityai/sd-turbo",
  "device": "cuda",
  "ready": true
}
```
*`device` 값이 `"cuda"`로 표시되어야 정상적으로 GPU 텐서 코어가 서빙 인프라에 할당된 상태를 의미합니다.*

### 2) 이미지 생성 단위 기능 검증 (Direct Curl Request)
```bash
curl -X POST http://localhost:8000/api/generate -H "Content-Type: application/json" -d "{\"prompt\":\"a cinematic robot chef cooking ramen, detailed digital art\",\"steps\":1}"
```
**정상 응답 JSON:**
```json
{
  "success": true,
  "image": "data:image/png;base64,iVBORw0KGgoAAAAN..."
}
```

### 3) GPU 자원 점유 모니터링
추론 태스크가 실행되는 도중 GPU의 메모리 할당 상태 및 연산 전력 상황을 상시 모니터링하여 병목 현상을 판단합니다.
```bash
nvidia-smi
```
*모델 가중치가 VRAM에 적재된 시점부터 약 2GB 내외의 메모리 점유 및 프로세스 할당 내역이 모니터링됩니다.*

---

## 🔧 8. 런타임 하이퍼파라미터 설정 변경

### 생성 해상도 조정 (`image_generator.py`)
```python
# 기본 해상도는 512x512 해상도로 핏이 고정되어 있습니다.
result = self.pipe(prompt=prompt, height=512, width=512, ...)
```

### 추론 Steps 스케일링
프론트엔드 UI 컨트롤 바를 통해 `1`부터 `4`까지의 추론 스케일 조정을 지원합니다.
* `1 Step`: 초고속 디버깅 및 실시간 드로잉 인터렉션 대응 (가장 빠름, 품질 낮음)
* `2 Steps`: SD-Turbo 기본 최적 해상도 및 디테일 보장 (속도와 품질의 균형)

### Debounce 버퍼 타임 설정 (`app.js`)
사용자의 연속된 키 입력에 대해 무분별한 추론 요청이 몰리는 현상을 방지하기 위한 Debounce 버퍼 시간입니다.
```javascript
const CONFIG = {
  DEBOUNCE_MS: 700, // 기본값 700ms, 필요 시 축소 조정 가능
  ...
};
```

---

## 🔄 9. StreamDiffusion 가속 모듈 업그레이드 가이드

더 극단적인 제로 지연(Sub-second Latency) 성능이 요구되는 경우, 일반 Diffusers 모듈을 StreamDiffusion 아키텍처로 스왑할 수 있습니다.

### 1) 가속 의존성 수동 빌드
```bash
pip install git+https://github.com/cumulo-autumn/StreamDiffusion.git
python -m streamdiffusion.tools.install  # xformers 및 triton 커스텀 빌드 자동 설치
```

### 2) `image_generator.py` 내 StreamDiffusion Generator 스텁 교체
`image_generator.py` 하단부에 명시된 `StreamDiffusionGenerator` 클래스를 구체화합니다.
```python
from streamdiffusion import StreamDiffusion
from streamdiffusion.image_utils import postprocess_image

class StreamDiffusionGenerator:
    def __init__(self):
        from diffusers import AutoPipelineForText2Image
        pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sd-turbo", torch_dtype=torch.float16
        )
        self.stream = StreamDiffusion(pipe, t_index_list=[0], torch_dtype=torch.float16)
        self.stream.load_lcm_lora()
        self.stream.fuse_lora()
        self.stream.prepare("", num_inference_steps=50)

    def generate(self, prompt: str, **kwargs) -> str:
        x = self.stream.txt2img(prompt)
        image = postprocess_image(x, output_type="pil")[0]
        return pil_to_base64(image)

    def is_gpu(self):
        return True
```

### 3) `main.py` 내 생성 인터페이스 객체 바인딩 교체
```python
# 기존
from image_generator import create_generator
generator = create_generator(use_stream_diffusion=False)

# 변경
from image_generator import create_generator
generator = create_generator(use_stream_diffusion=True)
```

---

## 🖥️ 10. 네트워크 아키텍처 및 제어 흐름

```
[클라이언트 웹 브라우저]                     [FastAPI 백엔드 엔진]
      │                                             │
      │──────── WebSocket 연결 수립 ────────────────▶│
      │                                             │
      │──────── 프롬프트 패킷 송신 ─────────────────▶│
      │         {"prompt": "...", "steps": 1}       │──▶ Diffusers Pipeline (GPU)
      │                                             │    GPU 가속 연산 (0.2s ~ 1s)
      │◀──────── 이미지 생성 상태 피드백 ───────────│
      │◀──────── 생성 완료 및 Base64 이미지 송신 ────│
      │         {"status": "done", "image": "..."}  │
      │                                             │
```

---

## 🚨 11. 문제 해결 (Troubleshooting)

### `cuda available: False` 또는 디바이스 에러
* **원인**: PyTorch 빌드가 CUDA 드라이버 라이브러리를 감지하지 못해 발생합니다.
* **해결책**:
  ```bash
  # 기존 CPU용 또는 깨진 PyTorch 제거
  pip uninstall -y torch torchvision torchaudio
  # CUDA 12.8 대응 PyTorch 재설치
  pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
  ```

### `/api/status` 체크 시 device가 계속 `cpu`인 현상
* 파이썬 스크립트 실행 권한을 가진 시스템 터미널 내에서 `python -c "import torch; print(torch.cuda.is_available())"`가 `True`를 출력하는지 확인하십시오. 만약 True가 나옴에도 FastAPI에서 cpu로 잡힌다면, 가상환경 `venv311` 내에 정상적인 PyTorch 라이브러리가 로드되지 않고 전역 Python 라이브러리가 로드되었을 가능성이 큽니다. 가상환경 활성화 상태를 재검토하십시오.

### `ModuleNotFoundError: deep_translator`
* 백엔드 의존성 파일이 누락되었거나 정상 인스톨되지 않은 상태입니다. 가상환경을 켠 뒤 아래 명령어로 패키지를 강제 재설치하십시오.
  ```bash
  pip install -r backend\requirements.txt
  ```

### 허깅페이스 모델 다운로드 지연 및 캐시 경로 확인
* 모델 가중치는 한 번 완전히 빌드되고 나면 Hugging Face 캐시 스토리지에 아카이빙됩니다.
* **Windows OS 기본 캐시 저장 경로**:
  `C:\Users\<사용자명>\.cache\huggingface` (또는 PowerShell 환경변수 기준 `%USERPROFILE%\.cache\huggingface`)
* 디스크 공간 부족 이슈가 발생할 경우 위 캐시 스토리지 디렉토리를 정리하거나 환경 변수 `HF_HOME`을 시스템에 별도 구성하여 저장용 오프셋 드라이브 경로를 재지정할 수 있습니다.
