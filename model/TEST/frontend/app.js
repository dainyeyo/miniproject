/**
 * app.js — AI 실시간 이미지 생성기 프론트엔드
 * ─────────────────────────────────────────────
 * 동작 흐름:
 *  1. 페이지 로드 시 서버 상태 확인 (/api/status)
 *  2. WebSocket 연결 시도 (ws://localhost:8000/ws/generate)
 *  3. WebSocket 실패 시 HTTP POST 폴백 모드로 전환
 *  4. 프롬프트 입력 → 700ms debounce → 이미지 생성 요청
 *  5. 생성 완료 시 이미지 표시 + 히스토리 추가
 */

'use strict';

// ─────────────────────────────────────────────
// 상수 설정
// ─────────────────────────────────────────────
const CONFIG = {
  WS_URL:          'ws://localhost:8000/ws/generate',
  API_BASE:        'http://localhost:8000',
  DEBOUNCE_MS:     700,      // 입력 후 대기 시간 (ms)
  MAX_HISTORY:     12,       // 히스토리 최대 개수
  WS_RECONNECT_MS: 3000,    // WebSocket 재연결 간격 (ms)
  MAX_RECONNECT:   5,        // 최대 재연결 시도 횟수
};

// ─────────────────────────────────────────────
// DOM 요소 참조
// ─────────────────────────────────────────────
const dom = {
  promptInput:     document.getElementById('prompt-input'),
  generateBtn:     document.getElementById('generate-btn'),
  btnText:         document.getElementById('btn-text'),
  btnIcon:         document.getElementById('btn-icon'),
  realtimeToggle:  document.getElementById('realtime-toggle'),
  stepsSlider:     document.getElementById('steps-slider'),
  stepsDisplay:    document.getElementById('steps-display'),
  statusBadge:     document.getElementById('status-badge'),
  statusText:      document.getElementById('status-text'),
  generatedImage:  document.getElementById('generated-image'),
  placeholder:     document.getElementById('placeholder'),
  loadingOverlay:  document.getElementById('loading-overlay'),
  loadingText:     document.getElementById('loading-text'),
  imageMeta:       document.getElementById('image-meta'),
  errorBox:        document.getElementById('error-box'),
  errorText:       document.getElementById('error-text'),
  charCount:       document.getElementById('char-count'),
  historyGrid:     document.getElementById('history-grid'),
};

// ─────────────────────────────────────────────
// 앱 상태
// ─────────────────────────────────────────────
const state = {
  ws:              null,      // WebSocket 인스턴스
  wsMode:          false,     // true: WebSocket 사용, false: HTTP 폴백
  isGenerating:    false,     // 현재 생성 중 여부
  debounceTimer:   null,      // debounce 타이머 ID
  reconnectCount:  0,         // WebSocket 재연결 시도 횟수
  reconnectTimer:  null,      // 재연결 타이머 ID
  history:         [],        // 생성 이미지 히스토리 [{image, prompt}]
  lastPrompt:      '',        // 마지막으로 생성한 프롬프트
};

// ─────────────────────────────────────────────
// 상태 UI 업데이트 헬퍼
// ─────────────────────────────────────────────
function setStatus(type, text) {
  dom.statusBadge.className = `status-badge ${type}`;
  dom.statusText.textContent = text;
}

function showError(msg) {
  dom.errorText.textContent = msg;
  dom.errorBox.classList.add('visible');
}

function clearError() {
  dom.errorBox.classList.remove('visible');
}

function setLoading(loading, text = '이미지 생성 중...') {
  state.isGenerating = loading;
  dom.loadingText.textContent = text;

  if (loading) {
    dom.loadingOverlay.classList.add('visible');
    dom.generateBtn.disabled = true;
    dom.btnText.textContent = '생성 중...';
    dom.btnIcon.textContent = '⏳';
    setStatus('generating', '생성 중');
  } else {
    dom.loadingOverlay.classList.remove('visible');
    dom.generateBtn.disabled = false;
    dom.btnText.textContent = '이미지 생성';
    dom.btnIcon.textContent = '⚡';
    setStatus('ready', state.wsMode ? 'WebSocket 연결됨' : 'HTTP 모드');
  }
}

// ─────────────────────────────────────────────
// 이미지 표시
// ─────────────────────────────────────────────
function displayImage(base64Data, prompt) {
  // 플레이스홀더 숨기기
  dom.placeholder.style.display = 'none';

  // 이미지 교체 (fade-in 효과를 위해 잠깐 숨겼다가 표시)
  dom.generatedImage.style.display = 'none';
  dom.generatedImage.src = base64Data;
  dom.generatedImage.style.display = 'block';

  // 메타 정보 업데이트
  dom.imageMeta.textContent = `"${prompt}" — ${new Date().toLocaleTimeString('ko-KR')}`;

  // 히스토리 추가
  addToHistory(base64Data, prompt);
}

// ─────────────────────────────────────────────
// 생성 히스토리
// ─────────────────────────────────────────────
function addToHistory(base64Data, prompt) {
  // 최대 개수 초과 시 가장 오래된 것 제거
  if (state.history.length >= CONFIG.MAX_HISTORY) {
    state.history.shift();
  }
  state.history.push({ image: base64Data, prompt });

  renderHistory();
}

function renderHistory() {
  dom.historyGrid.innerHTML = '';

  if (state.history.length === 0) {
    dom.historyGrid.innerHTML = '<p style="color: var(--text-muted); font-size: 0.82rem; align-self: center;">아직 생성된 이미지가 없습니다.</p>';
    return;
  }

  // 최신 순으로 역순 표시
  [...state.history].reverse().forEach(({ image, prompt }) => {
    const img = document.createElement('img');
    img.src = image;
    img.alt = prompt;
    img.title = prompt;
    img.className = 'history-thumb';
    img.addEventListener('click', () => {
      displayImage(image, prompt);
    });
    dom.historyGrid.appendChild(img);
  });
}

// ─────────────────────────────────────────────
// WebSocket 관련
// ─────────────────────────────────────────────
function connectWebSocket() {
  if (state.reconnectCount >= CONFIG.MAX_RECONNECT) {
    console.warn('WebSocket 재연결 한도 초과 → HTTP 모드로 전환');
    state.wsMode = false;
    setStatus('ready', 'HTTP 모드 (WebSocket 불가)');
    return;
  }

  console.log(`WebSocket 연결 시도 (${state.reconnectCount + 1}/${CONFIG.MAX_RECONNECT})`);
  setStatus('loading', 'WebSocket 연결 중...');

  const ws = new WebSocket(CONFIG.WS_URL);
  state.ws = ws;

  ws.addEventListener('open', () => {
    console.log('✅ WebSocket 연결됨');
    state.wsMode = true;
    state.reconnectCount = 0;
    setStatus('ready', 'WebSocket 연결됨');
    clearError();
  });

  ws.addEventListener('message', (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      console.error('WebSocket 메시지 파싱 실패:', event.data);
      return;
    }

    handleServerMessage(data);
  });

  ws.addEventListener('close', (event) => {
    console.warn('WebSocket 연결 종료:', event.code, event.reason);
    state.wsMode = false;
    setLoading(false);

    // 비정상 종료 시 재연결 시도
    if (event.code !== 1000) {
      setStatus('loading', `재연결 대기 중... (${state.reconnectCount + 1}/${CONFIG.MAX_RECONNECT})`);
      state.reconnectCount++;
      state.reconnectTimer = setTimeout(connectWebSocket, CONFIG.WS_RECONNECT_MS);
    } else {
      setStatus('ready', 'HTTP 모드');
    }
  });

  ws.addEventListener('error', (err) => {
    console.error('WebSocket 오류:', err);
    // close 이벤트가 뒤따르므로 여기서는 로깅만 함
  });
}

// ─────────────────────────────────────────────
// 서버 메시지 처리 (WebSocket + HTTP 공통)
// ─────────────────────────────────────────────
function handleServerMessage(data) {
  switch (data.status) {
    case 'generating':
      setLoading(true, '이미지 생성 중...');
      clearError();
      break;

    case 'done':
      setLoading(false);
      if (data.image) {
        displayImage(data.image, data.prompt || state.lastPrompt);
      }
      break;

    case 'error':
      setLoading(false);
      showError(data.error || '알 수 없는 오류가 발생했습니다.');
      setStatus('error', '오류');
      break;

    default:
      console.warn('알 수 없는 메시지 status:', data.status);
  }
}

// ─────────────────────────────────────────────
// 이미지 생성 요청
// ─────────────────────────────────────────────
function requestGenerate(prompt) {
  if (!prompt || state.isGenerating) return;

  const steps = parseInt(dom.stepsSlider.value, 10);
  state.lastPrompt = prompt;
  clearError();

  if (state.wsMode && state.ws && state.ws.readyState === WebSocket.OPEN) {
    // ── WebSocket 방식 ──
    state.ws.send(JSON.stringify({ prompt, steps }));
    setLoading(true, '이미지 생성 중...');
  } else {
    // ── HTTP 폴백 방식 ──
    generateViaHTTP(prompt, steps);
  }
}

async function generateViaHTTP(prompt, steps) {
  setLoading(true, '이미지 생성 중 (HTTP)...');

  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, steps }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `서버 오류 (${response.status})`);
    }

    handleServerMessage({ status: 'done', image: data.image, prompt: data.prompt });
  } catch (err) {
    handleServerMessage({ status: 'error', error: err.message });
  } finally {
    setLoading(false);
  }
}

// ─────────────────────────────────────────────
// Debounce 유틸리티
// ─────────────────────────────────────────────
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ─────────────────────────────────────────────
// 서버 상태 확인
// ─────────────────────────────────────────────
async function checkServerStatus() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/status`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log('서버 상태:', data);
    return data;
  } catch (err) {
    console.error('서버 상태 확인 실패:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// 이벤트 바인딩
// ─────────────────────────────────────────────

// 프롬프트 입력 — 실시간 모드 debounce
const debouncedGenerate = debounce((prompt) => {
  if (dom.realtimeToggle.checked && prompt.trim()) {
    requestGenerate(prompt.trim());
  }
}, CONFIG.DEBOUNCE_MS);

dom.promptInput.addEventListener('input', () => {
  const len = dom.promptInput.value.length;
  dom.charCount.textContent = `${len} / 500`;
  debouncedGenerate(dom.promptInput.value);
});

// 생성 버튼 클릭
dom.generateBtn.addEventListener('click', () => {
  const prompt = dom.promptInput.value.trim();
  if (!prompt) {
    showError('프롬프트를 입력해주세요.');
    dom.promptInput.focus();
    return;
  }
  requestGenerate(prompt);
});

// Ctrl+Enter / Cmd+Enter 단축키
dom.promptInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    dom.generateBtn.click();
  }
});

// Steps 슬라이더
dom.stepsSlider.addEventListener('input', () => {
  dom.stepsDisplay.textContent = dom.stepsSlider.value;
});

// 실시간 모드 토글 — 켜면 현재 프롬프트로 즉시 생성
dom.realtimeToggle.addEventListener('change', () => {
  if (dom.realtimeToggle.checked) {
    const prompt = dom.promptInput.value.trim();
    if (prompt) requestGenerate(prompt);
  }
});

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
async function init() {
  setStatus('loading', '서버 연결 중...');

  // 1. 서버 상태 확인
  const serverStatus = await checkServerStatus();

  if (!serverStatus) {
    setStatus('error', '서버 연결 실패');
    showError(
      '백엔드 서버에 연결할 수 없습니다. ' +
      'backend/ 폴더에서 "python main.py" 명령으로 서버를 먼저 시작하세요.'
    );
    return;
  }

  if (!serverStatus.ready) {
    setStatus('error', '모델 로드 실패');
    showError('AI 모델 로드에 실패했습니다. 서버 로그를 확인하세요.');
    return;
  }

  console.log(`AI 모델 준비됨 — 디바이스: ${serverStatus.device}`);

  // 2. WebSocket 연결 시도
  connectWebSocket();

  // 3. 슬라이더 초기값 표시
  dom.stepsDisplay.textContent = dom.stepsSlider.value;
}

// 페이지 로드 후 초기화
window.addEventListener('DOMContentLoaded', init);
