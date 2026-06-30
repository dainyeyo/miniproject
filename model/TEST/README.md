# AI 실시간 이미지 생성기 — SD-Turbo 프로토타입

텍스트 프롬프트를 입력하면 `stabilityai/sd-turbo` AI 모델이 실시간으로 512×512 이미지를 생성합니다.

---

## 📁 폴더 구조

```
project/
├── backend/
│   ├── main.py              # FastAPI 서버 (WebSocket + HTTP API)
│   ├── image_generator.py   # SD-Turbo 이미지 생성 모듈 (교체 가능한 구조)
│   └── requirements.txt     # Python 의존성
├── frontend/
│   ├── index.html           # 메인 페이지
│   ├── style.css            # 다크 테마 스타일
│   └── app.js               # WebSocket/HTTP 통신 + 실시간 갱신 로직
└── README.md
```

---

## ⚙️ 설치 방법

### 1. Python 가상환경 생성 (권장)

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python -m venv venv
source venv/bin/activate
```

### 2. PyTorch 설치 (CUDA 버전에 맞게 선택)

```bash
# CUDA 12.1 (RTX 30xx / 40xx 계열)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# CUDA 11.8
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# CPU만 사용 (매우 느림 — GPU 없을 때)
pip install torch torchvision
```

> **CUDA 버전 확인**: `nvidia-smi` 명령어 실행 후 오른쪽 상단 `CUDA Version` 확인

### 3. 나머지 의존성 설치

```bash
cd backend
pip install -r requirements.txt
```

---

## 🚀 실행 방법

### 백엔드 서버 시작

```bash
cd backend
python main.py
```

서버가 시작되면:
- SD-Turbo 모델을 자동으로 로드합니다 (첫 실행 시 약 1~5GB 다운로드)
- `http://localhost:8000` 에서 서버가 실행됩니다

> 모델은 `~/.cache/huggingface` 에 저장됩니다.

### 웹페이지 접속

브라우저에서 [`http://localhost:8000`](http://localhost:8000) 접속

---

## 🧪 테스트 방법

### 서버 상태 확인

```bash
curl http://localhost:8000/api/status
```

정상 응답 예시:
```json
{
  "status": "ok",
  "model": "stabilityai/sd-turbo",
  "device": "cuda",
  "ready": true
}
```

### HTTP API 직접 테스트

```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cat in space, digital art", "steps": 1}'
```

응답에 `"image": "data:image/png;base64,..."` 가 포함됩니다.

### 웹 UI 테스트

1. 브라우저에서 `http://localhost:8000` 접속
2. 상단 상태 뱃지가 **WebSocket 연결됨** (초록 점) 인지 확인
3. 프롬프트 입력창에 영어로 원하는 이미지 설명 입력
4. 700ms 후 자동으로 이미지가 생성됩니다
5. 또는 **이미지 생성** 버튼 클릭 (Ctrl+Enter 단축키 지원)

---

## 🔧 주요 설정 변경

### 생성 이미지 크기 변경 (`image_generator.py`)

```python
# 기본값: 512×512
result = self.pipe(prompt=prompt, height=512, width=512, ...)
```

### 추론 Steps 변경

웹 UI의 슬라이더로 1~4 사이 조절 가능.
- `1`: 가장 빠름 (품질 낮음)
- `2`: SD-Turbo 권장값 (품질/속도 균형)

### Debounce 시간 변경 (`app.js`)

```javascript
const CONFIG = {
  DEBOUNCE_MS: 700,  // 기본값 700ms, 원하는 값으로 변경
  ...
};
```

---

## 🔄 StreamDiffusion으로 업그레이드

현재는 일반 Diffusers 방식으로 구현되어 있습니다.
더 낮은 지연시간이 필요한 경우 StreamDiffusion으로 교체할 수 있습니다.

### 1. StreamDiffusion 설치

```bash
pip install git+https://github.com/cumulo-autumn/StreamDiffusion.git
python -m streamdiffusion.tools.install  # xformers, triton 등 설치
```

### 2. `image_generator.py` 에서 `StreamDiffusionGenerator` 구현

`image_generator.py` 파일 하단의 `StreamDiffusionGenerator` 클래스 스텁을 참고하여 구현합니다.

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

    def is_gpu(self): return True
```

### 3. `main.py` 에서 Generator 교체

```python
# 변경 전
from image_generator import create_generator
generator = create_generator(use_stream_diffusion=False)

# 변경 후
from image_generator import create_generator
generator = create_generator(use_stream_diffusion=True)
```

---

## 🖥️ 동작 구조

```
[웹 브라우저]                     [FastAPI 서버]
     │                                  │
     │──── WebSocket 연결 ─────────────▶│
     │                                  │
     │──── {"prompt": "..."} ──────────▶│
     │                                  │──▶ SD-Turbo 모델 (GPU/CPU)
     │                                  │      이미지 생성 (1~5초)
     │◀─── {"status": "generating"} ───│
     │◀─── {"status": "done",          │
     │       "image": "base64..."} ─────│
     │                                  │
     │  이미지 화면 표시                  │
     │  히스토리 추가                    │
```

---

## ⚠️ 주의사항

- **첫 실행 시** 모델 파일(약 1.6GB)이 자동으로 다운로드됩니다.
- **GPU 없이 CPU 모드**로 실행하면 이미지 1장 생성에 수십 초~수 분이 걸립니다.
- `sd-turbo` 모델 특성상 `guidance_scale=0.0`으로 고정되어 있습니다 (CFG 없음).
- 프롬프트는 **영어**로 입력하면 더 좋은 결과를 얻을 수 있습니다.

---

## 📋 API 엔드포인트 정리

| 방식 | 경로 | 설명 |
|------|------|------|
| GET | `/` | 웹 UI (index.html) |
| GET | `/api/status` | 서버/모델 상태 확인 |
| POST | `/api/generate` | HTTP 이미지 생성 |
| WebSocket | `/ws/generate` | 실시간 이미지 생성 |
| GET | `/static/*` | 프론트엔드 정적 파일 |
| GET | `/docs` | FastAPI Swagger UI |
