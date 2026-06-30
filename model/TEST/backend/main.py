"""
main.py
-------
FastAPI 백엔드 서버.
- 서버 시작 시 SD-Turbo 모델을 한 번만 로드합니다.
- WebSocket(/ws/generate)으로 실시간 이미지 생성 요청을 처리합니다.
- HTTP POST(/api/generate)로도 이미지를 생성할 수 있습니다.
- 프론트엔드 파일(/frontend)을 정적으로 제공합니다.
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ─────────────────────────────────────────────────────
# 로깅 설정
# ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────
# 모델 인스턴스 (전역 — 한 번만 로드)
# ─────────────────────────────────────────────────────
generator = None  # SDTurboGenerator 인스턴스


@asynccontextmanager
async def lifespan(app: FastAPI):
    """서버 시작/종료 시 실행되는 라이프사이클 핸들러."""
    global generator
    logger.info("🚀 서버 시작 중 — 모델 로드를 시작합니다...")

    # 모델 로드는 blocking I/O이므로 별도 스레드에서 실행
    loop = asyncio.get_event_loop()
    try:
        from image_generator import create_generator
        generator = await loop.run_in_executor(None, create_generator)
        device_info = "GPU (CUDA)" if generator.is_gpu() else "CPU (느림 주의)"
        logger.info(f"✅ 모델 로드 완료 — 실행 장치: {device_info}")
    except Exception as e:
        logger.error(f"❌ 모델 로드 실패: {e}")
        generator = None

    yield  # 서버 실행

    logger.info("🛑 서버 종료 중...")


# ─────────────────────────────────────────────────────
# FastAPI 앱 생성
# ─────────────────────────────────────────────────────
app = FastAPI(
    title="AI 실시간 이미지 생성 서버",
    description="SD-Turbo 기반 실시간 이미지 생성 프로토타입",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 설정 (개발용 — 프로덕션에서는 origins를 제한하세요)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 프론트엔드 정적 파일 서빙
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# ─────────────────────────────────────────────────────
# 라우트: 루트 → index.html 반환
# ─────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """프론트엔드 index.html을 반환합니다."""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>frontend/index.html 파일을 찾을 수 없습니다.</h1>", status_code=404)


# ─────────────────────────────────────────────────────
# 라우트: 서버 상태 확인
# ─────────────────────────────────────────────────────
@app.get("/api/status")
async def get_status():
    """서버 및 모델 상태를 반환합니다."""
    if generator is None:
        return JSONResponse(
            content={"status": "error", "message": "모델이 로드되지 않았습니다."},
            status_code=503,
        )
    return {
        "status": "ok",
        "model": "stabilityai/sd-turbo",
        "device": "cuda" if generator.is_gpu() else "cpu",
        "ready": True,
    }


# ─────────────────────────────────────────────────────
# HTTP API: 이미지 생성 (WebSocket이 어려운 환경용)
# ─────────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    prompt: str
    steps: int = 1  # 1~2 권장


@app.post("/api/generate")
async def generate_image_http(req: GenerateRequest):
    """
    HTTP POST 방식으로 이미지를 생성합니다.
    WebSocket을 사용할 수 없는 환경에서 대안으로 사용하세요.
    """
    if generator is None:
        return JSONResponse(
            content={"success": False, "error": "모델이 로드되지 않았습니다. 서버 로그를 확인하세요."},
            status_code=503,
        )

    prompt = req.prompt.strip()
    if not prompt:
        return JSONResponse(
            content={"success": False, "error": "프롬프트를 입력해주세요."},
            status_code=400,
        )

    steps = max(1, min(req.steps, 4))  # 1~4 사이로 제한

    try:
        loop = asyncio.get_event_loop()
        # 이미지 생성은 CPU/GPU 집약 작업이므로 executor에서 실행
        image_b64 = await loop.run_in_executor(
            None, lambda: generator.generate(prompt, num_inference_steps=steps)
        )
        return {"success": True, "image": image_b64, "prompt": prompt}
    except Exception as e:
        logger.error(f"이미지 생성 오류: {e}", exc_info=True)
        return JSONResponse(
            content={"success": False, "error": f"이미지 생성 중 오류가 발생했습니다: {str(e)}"},
            status_code=500,
        )


# ─────────────────────────────────────────────────────
# WebSocket: 실시간 이미지 생성
# ─────────────────────────────────────────────────────
@app.websocket("/ws/generate")
async def websocket_generate(websocket: WebSocket):
    """
    WebSocket을 통해 실시간으로 이미지를 생성합니다.

    클라이언트 → 서버: {"prompt": "...", "steps": 1}
    서버 → 클라이언트: {"status": "generating", "prompt": "..."}
                       {"status": "done", "image": "data:image/png;base64,...", "prompt": "..."}
                       {"status": "error", "error": "..."}
    """
    await websocket.accept()
    logger.info(f"WebSocket 연결됨: {websocket.client}")

    # 현재 생성 중인 태스크 (새 요청이 오면 취소)
    current_task: asyncio.Task | None = None

    try:
        while True:
            # 클라이언트 메시지 수신
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                prompt = data.get("prompt", "").strip()
                steps = max(1, min(int(data.get("steps", 1)), 4))
            except (json.JSONDecodeError, ValueError):
                await websocket.send_json({"status": "error", "error": "잘못된 요청 형식입니다."})
                continue

            if not prompt:
                await websocket.send_json({"status": "error", "error": "프롬프트를 입력해주세요."})
                continue

            # 이전 생성 태스크가 있으면 취소 (새 프롬프트 우선)
            if current_task and not current_task.done():
                current_task.cancel()
                logger.info("이전 생성 태스크 취소됨")

            if generator is None:
                await websocket.send_json(
                    {"status": "error", "error": "모델이 로드되지 않았습니다."}
                )
                continue

            # 생성 중 상태 전송
            await websocket.send_json({"status": "generating", "prompt": prompt})

            async def do_generate(p: str, s: int):
                """실제 이미지 생성을 비동기로 실행합니다."""
                try:
                    loop = asyncio.get_event_loop()
                    image_b64 = await loop.run_in_executor(
                        None, lambda: generator.generate(p, num_inference_steps=s)
                    )
                    await websocket.send_json(
                        {"status": "done", "image": image_b64, "prompt": p}
                    )
                except asyncio.CancelledError:
                    logger.info(f"생성 취소됨: '{p[:40]}'")
                except Exception as e:
                    logger.error(f"생성 오류: {e}", exc_info=True)
                    try:
                        await websocket.send_json(
                            {"status": "error", "error": f"이미지 생성 실패: {str(e)}"}
                        )
                    except Exception:
                        pass

            current_task = asyncio.create_task(do_generate(prompt, steps))

    except WebSocketDisconnect:
        logger.info("WebSocket 연결 종료")
        if current_task and not current_task.done():
            current_task.cancel()
    except Exception as e:
        logger.error(f"WebSocket 오류: {e}", exc_info=True)


# ─────────────────────────────────────────────────────
# 직접 실행 시 진입점
# ─────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # reload=True 시 모델이 매번 재로드되므로 False 권장
        log_level="info",
    )
