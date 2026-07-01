"use client";

import React, { useState, useEffect, useRef } from 'react';

// Neon DB 연동 실패 시 사용할 최후의 로컬 폴백 단어 풀 지정
const DEFAULT_FALLBACK_WORDS = [
  '계란 후라이', '달걀말이', '오므라이스', '닭고기', '병아리', '달걀껍질', '둥지', 
  '사운드오브뮤직', '클래식음악', '교향곡', '피아노', '바이올린', '첼로', '트럼펫'
];

export default function GamePage() {
  // ==========================================
  // AI Image Generator Configuration & State
  // ==========================================
  const AI_CONFIG = {
    WS_URL:          'ws://localhost:8000/ws/generate',
    API_BASE:        'http://localhost:8000',
    DEBOUNCE_MS:     700,      // 입력 후 대기 시간 (ms)
    WS_RECONNECT_MS: 3000,    // WebSocket 재연결 간격 (ms)
    MAX_RECONNECT:   5,        // 최대 재연결 시도 횟수
  };

  // ==========================================
  // 1. React 상태(State) 설계
  // ==========================================
  const [currentScreen, setCurrentScreen] = useState('screen-landing'); // landing, waiting, game, voting, result
  const [selectedMode, setSelectedMode] = useState('human'); // human, ai
  const [nickname, setNickname] = useState('꼬마달걀');
  
  // 브러시 도구 설정 상태
  const [brushColor, setBrushColor] = useState('#2D3748');
  const [brushSize, setBrushSize] = useState(8);
  const [isEraser, setIsEraser] = useState(false);
  
  // 게임 내 동적 키워드 및 라운드 상태
  const [currentKeyword, setCurrentKeyword] = useState('계란 후라이');
  const [currentRound, setCurrentRound] = useState(1);
  const [maxRound, setMaxRound] = useState(5);
  
  // 플레이어 상태
  const [myScore, setMyScore] = useState(0);
  const [players, setPlayers] = useState([]);
  
  // 타이머 및 채팅창 피드 상태
  const [timerSeconds, setTimerSeconds] = useState(45);
  const [timerMax, setTimerMax] = useState(45);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState([
    { type: 'system-msg', text: '🔔 게임방에 접속했습니다!' }
  ]);
  
  // Neon DB 로딩 단어 풀 캐싱
  const [wordPool, setWordPool] = useState([]);

  // AI 관련 React 상태
  const [aiStatus, setAiStatus] = useState('loading'); // 'loading', 'ready', 'generating', 'error'
  const [aiStatusText, setAiStatusText] = useState('서버 연결 중...');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiRealtime, setIsAiRealtime] = useState(true);
  const [aiSteps, setAiSteps] = useState(1);
  const [aiImageSrc, setAiImageSrc] = useState(null);
  const [aiImageMeta, setAiImageMeta] = useState('');
  const [aiErrorMsg, setAiErrorMsg] = useState('');
  const [aiIsGenerating, setAiIsGenerating] = useState(false);

  // ==========================================
  // 2. React Refs 선언 (Canvas, Scroll, Bot interval)
  // ==========================================
  const aiWsRef = useRef(null);
  const aiReconnectCountRef = useRef(0);
  const aiReconnectTimerRef = useRef(null);
  const aiDebounceTimerRef = useRef(null);
  const lastAiPromptRef = useRef('');
  const lastChatMsgIdRef = useRef(0);
  const localRoundRef = useRef(1);

  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const chatEndRef = useRef(null);
  
  // 봇 게임 루프 상태 보존용 refs
  const botGameplayTimeoutRef = useRef(null);
  const botChatIntervalRef = useRef(null);
  const gameRunningRef = useRef(false);

  // 봇 초대용 풀
  const botPool = [
    { name: '노랑병아리', avatar: '🐥', score: 280, status: '준비완료' },
    { name: '새벽수탉', avatar: '🐓', score: 190, status: '준비완료' },
    { name: '밤부엉이', avatar: '🦉', score: 420, status: '준비완료' },
    { name: '아기오리', avatar: '🦆', score: 250, status: '준비완료' },
    { name: '골든리트리버', avatar: '🐕', score: 310, status: '준비완료' }
  ];
  const [invitedBotIndex, setInvitedBotIndex] = useState(0);

  // 초대 코드 관련 상태
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinCodeError, setJoinCodeError] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [isDrawer, setIsDrawer] = useState(false);
  const [currentDrawerId, setCurrentDrawerId] = useState('');
  const [canvasDataFromDb, setCanvasDataFromDb] = useState('');

  // ==========================================
  // 3. 헬퍼 및 유틸리티 함수 (SRP 원칙)
  // ==========================================
  
  // 시스템 메시지 추가
  const addSystemMsg = (text) => {
    setChatLog(prev => [...prev, { type: 'system-msg', text }]);
  };

  // 일반 채팅 피드 추가
  const appendFeed = (user, text, className = 'chat-msg') => {
    setChatLog(prev => [...prev, { type: className, user, text }]);
  };

  // 정답 및 판정 텍스트 노이즈 정제 (Defensive Programming)
  const normalizeText = (txt) => {
    if (!txt) return '';
    return txt.toLowerCase().replace(/[^a-zA-Z0-9가-힣]/g, '');
  };

  // 단어 풀에서 중복 없이 무작위 N개의 단어 공급
  const getRandomWords = (pool, count) => {
    const activePool = pool.length > 0 ? pool : DEFAULT_FALLBACK_WORDS;
    const shuffled = [...activePool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  // 캔버스 클리어 헬퍼
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  // 초대 코드 생성 (EGGG-XXXX 형식, 혼동 가능한 문자 제외)
  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `EGGG-${code}`;
  };

  // 초대 코드 클립보드 복사
  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      alert(`초대 코드 [${roomCode}] 가 복사되었습니다! 친구에게 공유하세요.`);
    } catch {
      prompt('아래 코드를 직접 복사하세요:', roomCode);
    }
  };

  // ==========================================
  // AI 이미지 생성기 엔진 (SD-Turbo Integration)
  // ==========================================
  const checkAiServerStatus = async () => {
    try {
      const res = await fetch(`${AI_CONFIG.API_BASE}/api/status`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('AI 서버 상태 확인 실패:', err.message);
      return null;
    }
  };

  const connectAiWebSocket = () => {
    if (aiReconnectCountRef.current >= AI_CONFIG.MAX_RECONNECT) {
      console.warn('WebSocket 재연결 한도 초과 → HTTP 모드로 전환');
      setAiStatus('ready');
      setAiStatusText('HTTP 모드 (WebSocket 불가)');
      return;
    }

    console.log(`AI WebSocket 연결 시도 (${aiReconnectCountRef.current + 1}/${AI_CONFIG.MAX_RECONNECT})`);
    setAiStatus('loading');
    setAiStatusText('WebSocket 연결 중...');

    const ws = new WebSocket(AI_CONFIG.WS_URL);
    aiWsRef.current = ws;

    ws.addEventListener('open', () => {
      console.log('✅ AI WebSocket 연결됨');
      aiReconnectCountRef.current = 0;
      setAiStatus('ready');
      setAiStatusText('WebSocket 연결됨');
      setAiErrorMsg('');
    });

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        handleAiServerMessage(data);
      } catch (err) {
        console.error('WebSocket 메시지 파싱 실패:', event.data);
      }
    });

    ws.addEventListener('close', (event) => {
      console.warn('AI WebSocket 연결 종료:', event.code, event.reason);
      setAiIsGenerating(false);

      if (event.code !== 1000) {
        setAiStatusText(`재연결 대기 중... (${aiReconnectCountRef.current + 1}/${AI_CONFIG.MAX_RECONNECT})`);
        aiReconnectCountRef.current++;
        aiReconnectTimerRef.current = setTimeout(connectAiWebSocket, AI_CONFIG.WS_RECONNECT_MS);
      } else {
        setAiStatus('ready');
        setAiStatusText('HTTP 모드');
      }
    });

    ws.addEventListener('error', (err) => {
      console.error('AI WebSocket 오류:', err);
    });
  };

  const handleAiServerMessage = (data) => {
    switch (data.status) {
      case 'generating':
        setAiIsGenerating(true);
        setAiStatus('generating');
        setAiStatusText('생성 중');
        setAiErrorMsg('');
        break;

      case 'done':
        setAiIsGenerating(false);
        setAiStatus('ready');
        setAiStatusText(aiWsRef.current && aiWsRef.current.readyState === WebSocket.OPEN ? 'WebSocket 연결됨' : 'HTTP 모드');
        if (data.image) {
          setAiImageSrc(data.image);
          setAiImageMeta(`"${data.prompt || lastAiPromptRef.current}" — ${new Date().toLocaleTimeString('ko-KR')}`);
          addSystemMsg(`🤖 AI가 새로운 그림 "${data.prompt || lastAiPromptRef.current}" 생성을 마쳤습니다!`);
          
          if (isDrawer) {
            fetch('/api/rooms/action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roomCode,
                playerId,
                action: 'draw-ai',
                payload: { aiImageUrl: data.image }
              })
            }).catch(err => console.error('Failed to sync AI image:', err));
          }
        }
        break;

      case 'error':
        setAiIsGenerating(false);
        setAiStatus('error');
        setAiStatusText('오류');
        setAiErrorMsg(data.error || '알 수 없는 오류가 발생했습니다.');
        break;

      default:
        console.warn('알 수 없는 메시지 status:', data.status);
    }
  };

  const generateAiViaHTTP = async (prompt, steps) => {
    setAiIsGenerating(true);
    setAiStatus('generating');
    setAiStatusText('생성 중 (HTTP)');
    try {
      const response = await fetch(`${AI_CONFIG.API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, steps }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `서버 오류 (${response.status})`);
      }
      handleAiServerMessage({ status: 'done', image: data.image, prompt: data.prompt });
    } catch (err) {
      handleAiServerMessage({ status: 'error', error: err.message });
    } finally {
      setAiIsGenerating(false);
    }
  };

  const generateAiViaPollinations = async (prompt) => {
    setAiIsGenerating(true);
    setAiStatus('generating');
    setAiStatusText('생성 중 (무료 AI)');
    try {
      const encodedPrompt = encodeURIComponent(prompt);
      const seed = Math.floor(Math.random() * 100000);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${seed}`;

      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        setAiIsGenerating(false);
        setAiStatus('ready');
        setAiStatusText('공공 AI 모드 (서버리스)');
        setAiImageSrc(imageUrl);
        setAiImageMeta(`"${prompt}" — Pollinations.ai`);
        addSystemMsg(`🤖 AI가 새로운 그림 "${prompt}" 생성을 마쳤습니다!`);

        if (isDrawer) {
          fetch('/api/rooms/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomCode,
              playerId,
              action: 'draw-ai',
              payload: { aiImageUrl: imageUrl }
            })
          }).catch(err => console.error('Failed to sync AI image:', err));
        }
      };
      img.onerror = () => {
        throw new Error('공공 AI 이미지 로딩에 실패했습니다.');
      };
    } catch (err) {
      setAiIsGenerating(false);
      setAiStatus('error');
      setAiStatusText('오류');
      setAiErrorMsg(err.message);
    }
  };

  const requestAiGenerate = (prompt) => {
    if (!prompt || aiIsGenerating) return;

    // 제시어(정답)를 프롬프트에 직접 작성하는 어뷰징 행위를 차단하기 위한 정규화 필터링
    const normalizedPrompt = prompt.replace(/\s+/g, '').toLowerCase();
    const normalizedKeyword = currentKeyword.replace(/\s+/g, '').toLowerCase();
    
    if (normalizedKeyword && normalizedPrompt.includes(normalizedKeyword)) {
      setAiErrorMsg(`프롬프트에 제시어("${currentKeyword}")를 직접 포함할 수 없습니다! 다른 방식으로 묘사해 주세요.`);
      return;
    }

    lastAiPromptRef.current = prompt;
    setAiErrorMsg('');

    if (aiWsRef.current && aiWsRef.current.readyState === WebSocket.OPEN) {
      aiWsRef.current.send(JSON.stringify({ prompt, steps: aiSteps }));
      setAiIsGenerating(true);
      setAiStatus('generating');
      setAiStatusText('생성 중');
    } else if (aiStatusText.includes('공공 AI')) {
      generateAiViaPollinations(prompt);
    } else {
      generateAiViaHTTP(prompt, aiSteps);
    }
  };

  const cleanupAiGenerator = () => {
    if (aiWsRef.current) {
      aiWsRef.current.close();
      aiWsRef.current = null;
    }
    if (aiReconnectTimerRef.current) {
      clearTimeout(aiReconnectTimerRef.current);
      aiReconnectTimerRef.current = null;
    }
    if (aiDebounceTimerRef.current) {
      clearTimeout(aiDebounceTimerRef.current);
      aiDebounceTimerRef.current = null;
    }
    aiReconnectCountRef.current = 0;
  };

  const triggerAiDrawing = async (keyword) => {
    setAiImageSrc(null);
    setAiImageMeta('');
    setAiErrorMsg('');
    setAiIsGenerating(false);
    setAiStatus('loading');
    setAiStatusText('서버 연결 중...');

    const serverStatus = await checkAiServerStatus();

    if (!serverStatus) {
      console.log('로컬 AI 서버가 감지되지 않아 Pollinations.ai API로 대체합니다.');
      setAiStatus('ready');
      setAiStatusText('공공 AI 모드 (서버리스)');
      // 플레이어 자율 입력 보장을 위해 자동 프롬프트 세팅 및 즉시 자동 생성을 비활성화하고 입력창을 비웁니다.
      setAiPrompt('');
      return;
    }

    if (!serverStatus.ready) {
      setAiStatus('error');
      setAiStatusText('모델 로드 실패');
      setAiErrorMsg('AI 모델 로드에 실패했습니다. 서버 로그를 확인하세요.');
      return;
    }

    console.log(`AI 모델 준비됨 — 디바이스: ${serverStatus.device}`);
    connectAiWebSocket();

    // 플레이어 자율 입력 보장을 위해 자동 프롬프트 세팅 및 즉시 자동 생성을 비활성화하고 입력창을 비웁니다.
    setAiPrompt('');
  };

  // ==========================================
  // 4. 리사이즈형 드로잉 캔버스 해상도 보존 복원 엔진
  // ==========================================
  const setupCanvasSize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 기존 캔버스 픽셀 보존
    let tempCanvas = null;
    if (canvas.width > 0 && canvas.height > 0) {
      tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(canvas, 0, 0);
    }

    const rect = canvas.parentNode.getBoundingClientRect();
    const newWidth = rect.width || 700;
    const newHeight = rect.height || 460;

    canvas.width = newWidth;
    canvas.height = newHeight;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, newWidth, newHeight);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tempCanvas) {
      ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, newWidth, newHeight);
    }
  };

  // ==========================================
  // 5. React 라이프사이클 Effect
  // ==========================================

  // 최초 로딩 시 Neon DB API를 통해 서버사이드 단어 로드
  useEffect(() => {
    const fetchWords = async () => {
      try {
        const response = await fetch('/api/words');
        const data = await response.json();
        if (data && Array.isArray(data.words)) {
          setWordPool(data.words);
          console.log(`Neon DB API 단어 공급 성공 (출처: ${data.source}, 개수: ${data.words.length})`);
        } else {
          setWordPool(DEFAULT_FALLBACK_WORDS);
        }
      } catch (err) {
        console.error('Next.js words API 연동 실패, 로컬 폴백 매핑:', err);
        setWordPool(DEFAULT_FALLBACK_WORDS);
      }
    };
    fetchWords();
  }, []);

  // 캔버스 마운트 시 윈도우 리사이즈 바인딩
  useEffect(() => {
    if (currentScreen === 'screen-game' && canvasRef.current) {
      setupCanvasSize();
      window.addEventListener('resize', setupCanvasSize);
    }
    return () => {
      window.removeEventListener('resize', setupCanvasSize);
    };
  }, [currentScreen]);

  // 채팅 추가 시 스크롤 자동 최하단 핏칭
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  // 타이머 실행 루프 제어
  useEffect(() => {
    if (currentScreen !== 'screen-game') return;

    const timer = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimerEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentScreen, timerSeconds, isHost, currentRound, maxRound]);

  // AI 연결 생명주기 관리용 Effect
  useEffect(() => {
    return () => {
      cleanupAiGenerator();
    };
  }, []);

  // 멀티플레이어 DB 상태 조회 Polling Effect
  useEffect(() => {
    if (!roomCode || !playerId) return;

    const pollInterval = setInterval(async () => {
      try {
        const [statusRes, chatRes] = await Promise.all([
          fetch(`/api/rooms/status?roomCode=${roomCode}&playerId=${playerId}`),
          fetch(`/api/rooms/chat?roomCode=${roomCode}&lastMsgId=${lastChatMsgIdRef.current}`)
        ]);

        const data = await statusRes.json();
        const chatData = await chatRes.json();
        
        if (!statusRes.ok) {
          clearInterval(pollInterval);
          alert(data.error || '방에서 퇴장되었거나 존재하지 않는 방입니다.');
          cleanupAiGenerator();
          setCurrentScreen('screen-landing');
          return;
        }

        // 0. 신규 채팅 로그 반영
        if (chatRes.ok && chatData.messages && chatData.messages.length > 0) {
          const newMessages = chatData.messages.filter(msg => msg.id > lastChatMsgIdRef.current);
          if (newMessages.length > 0) {
            const newLogs = newMessages.map(msg => {
              if (msg.id > lastChatMsgIdRef.current) {
                lastChatMsgIdRef.current = msg.id;
              }
              if (msg.type === 'system-msg') {
                return { type: 'system-msg', text: msg.message };
              }
              return {
                type: 'chat-msg',
                user: msg.nickname + (msg.player_id === playerId ? ' (나)' : ''),
                text: msg.message
              };
            });
            setChatLog(prev => [...prev, ...newLogs]);
          }
        }

        const room = data.room;
        const serverPlayers = data.players;

        // 1. 플레이어 목록 및 본인 권한 업데이트
        const mappedPlayers = serverPlayers.map(p => ({
          name: p.nickname,
          avatar: p.avatar,
          score: p.score,
          isMe: p.id === playerId,
          isOwner: p.is_host,
          status: p.status === 'drawing' ? '그리는 중' : p.status === 'correct' ? '정답!' : '대기중',
          id: p.id
        }));
        setPlayers(mappedPlayers);

        const me = serverPlayers.find(p => p.id === playerId);
        if (me) {
          setMyScore(me.score);
          setIsHost(me.is_host);
        }

        // 1.5. 방장이 아닌 경우에만 데이터베이스의 게임 설정 동기화
        if (me && !me.is_host) {
          if (room.game_mode) setSelectedMode(room.game_mode);
          if (room.max_round) setMaxRound(room.max_round);
        }

        // 2. 출제자 상태 업데이트
        const amIDrawer = room.current_drawer_id === playerId;
        setIsDrawer(amIDrawer);
        setCurrentDrawerId(room.current_drawer_id);

        // 3. 화면 상태 전환
        if (room.status === 'waiting' && currentScreen !== 'screen-waiting' && currentScreen !== 'screen-landing' && currentScreen !== 'screen-join') {
          setCurrentScreen('screen-waiting');
        } else if (room.status === 'game' && currentScreen !== 'screen-game') {
          setCurrentScreen('screen-game');
          setTimerSeconds(45);
          setTimerMax(45);
          if (amIDrawer) {
            if (selectedMode === 'ai') {
              triggerAiDrawing(room.current_keyword);
            }
          }
        } else if (room.status === 'result' && currentScreen !== 'screen-result') {
          setCurrentScreen('screen-result');
          cleanupAiGenerator();
        }

        // 4. 세부 라운드 및 그림 데이터 동기화
        if (room.status === 'game') {
          setMaxRound(room.max_round);

          // 라운드가 변경되었을 때 타이머 및 화면 리셋
          if (room.current_round !== localRoundRef.current) {
            localRoundRef.current = room.current_round;
            setCurrentRound(room.current_round);
            setTimerSeconds(45);
            setTimerMax(45);
            setCanvasDataFromDb('');
            setAiImageSrc(null);
            clearCanvas();
            
            if (amIDrawer) {
              addSystemMsg(`🎨 Round ${room.current_round} 시작! 제시어를 확인해 주세요.`);
              if (selectedMode === 'ai') {
                triggerAiDrawing(room.current_keyword);
              }
            } else {
              addSystemMsg(`🎨 Round ${room.current_round} 시작! 출제자가 그림을 그리고 있습니다.`);
            }
          }

          if (amIDrawer) {
            setCurrentKeyword(room.current_keyword);
          } else {
            setCurrentKeyword('');
            if (selectedMode === 'ai') {
              setAiImageSrc(room.ai_image_url || null);
            } else {
              setCanvasDataFromDb(room.canvas_data || '');
            }
          }
        }

      } catch (err) {
        console.error('Polling 상태 업데이트 중 에러 발생:', err);
      }
    }, 1200);

    return () => clearInterval(pollInterval);
  }, [roomCode, playerId, currentScreen, selectedMode, currentRound]);

  // 비비출제자용 캔버스 동기화 Effect
  useEffect(() => {
    if (!isDrawer && canvasRef.current && canvasDataFromDb) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = canvasDataFromDb;
    } else if (!isDrawer && canvasRef.current && !canvasDataFromDb) {
      clearCanvas();
    }
  }, [canvasDataFromDb, isDrawer]);

  // ==========================================
  // 6. 게임 진행 흐름 제어 로직 (Game Controller)
  // ==========================================

  // 게임 시작 버튼 이벤트 (방장만 전송)
  const startGame = async () => {
    setChatLog([{ type: 'system-msg', text: `🎮 새로운 게임이 시작되었습니다! (모드: ${selectedMode === 'ai' ? 'AI 드로잉 모드' : '일반 모드'})` }]);

    const [randWord] = getRandomWords(wordPool, 1);

    try {
      const res = await fetch('/api/rooms/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          playerId,
          action: 'start-game',
          payload: { maxRound, keyword: randWord }
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '게임 시작 요청에 실패했습니다.');

      setTimerSeconds(45);
      setTimerMax(45);
      setCurrentScreen('screen-game');
    } catch (err) {
      alert(err.message);
    }
  };

  // 타이머 만료 시 흐름 제어 (방장 서버 연동 / 게스트 대기)
  const handleTimerEnd = async () => {
    if (currentScreen === 'screen-game' && isHost) {
      try {
        // 1. 먼저 DB에 정답 공개 로그 기록 삽입
        await fetch('/api/rooms/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode,
            playerId,
            action: 'reveal-answer'
          })
        });
      } catch (err) {
        console.error('Failed to reveal answer:', err);
      }

      // 2. 3.5초 대기 후 다음 라운드 또는 게임 종료 처리 진행 (유저들이 정답을 인지할 시간 확보)
      setTimeout(async () => {
        if (currentRound < maxRound) {
          cleanupAiGenerator();
          const [newWord] = getRandomWords(wordPool, 1);
          
          try {
            await fetch('/api/rooms/action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roomCode,
                playerId,
                action: 'next-round',
                payload: { nextRound: currentRound + 1, keyword: newWord }
              })
            });
          } catch (err) {
            console.error('Next round API trigger failed:', err);
          }
        } else {
          cleanupAiGenerator();
          try {
            await fetch('/api/rooms/action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roomCode,
                playerId,
                action: 'game-over'
              })
            });
          } catch (err) {
            console.error('Game over API trigger failed:', err);
          }
        }
      }, 3500);
    }
  };

  // 대기실 복귀 리셋 (방장의 경우 전체 동기화)
  const goHome = async () => {
    cleanupAiGenerator();
    setChatLog([{ type: 'system-msg', text: '대기실로 돌아왔습니다. 다음 게임을 준비해 주세요.' }]);
    
    localRoundRef.current = 1;
    setCurrentRound(1);
    
    if (isHost) {
      try {
        await fetch('/api/rooms/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode,
            playerId,
            action: 'go-lobby'
          })
        });
      } catch (err) {
        console.error('Go lobby API trigger failed:', err);
      }
    }
    setCurrentScreen('screen-waiting');
  };

  // 방 설정 동기화 업데이트 API 호출 (방장용)
  const updateRoomSettings = async (newMode, newMaxRound) => {
    if (!roomCode || !playerId) return;
    try {
      await fetch('/api/rooms/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          playerId,
          action: 'update-settings',
          payload: {
            gameMode: newMode || selectedMode,
            maxRound: newMaxRound || maxRound
          }
        })
      });
    } catch (err) {
      console.error('Failed to sync settings:', err);
    }
  };

  // ==========================================
  // 6.5. 방 생성 / 초대 코드 참여 핸들러
  // ==========================================

  // 방 만들기: Neon DB 생성 후 대기실 입장
  const handleCreateRoom = async () => {
    if (!nickname.trim()) return;
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, avatar: '🥚' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '방 생성에 실패했습니다.');

      setRoomCode(data.roomCode);
      setPlayerId(data.playerId);
      setIsHost(true);
      setMyScore(0);
      localRoundRef.current = 1;
      setCurrentRound(1);
      lastChatMsgIdRef.current = 0;
      setChatLog([{ type: 'system-msg', text: `🎮 방이 생성되었습니다! 초대 코드: [${data.roomCode}]` }]);
      setCurrentScreen('screen-waiting');
    } catch (err) {
      alert(err.message);
    }
  };

  // 초대 코드 입력 화면으로 이동
  const handleJoinRoom = () => {
    setJoinCodeInput('');
    setJoinCodeError('');
    setCurrentScreen('screen-join');
  };

  // 초대 코드 제출: Neon DB 검증 후 대기실 입장
  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toUpperCase();
    if (!/^EGGG-[A-Z0-9]{4}$/.test(code)) {
      setJoinCodeError('올바른 초대 코드 형식이 아닙니다. (예: EGGG-A4X9)');
      return;
    }
    
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code, nickname, avatar: '🐥' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '방 입장에 실패했습니다.');

      setRoomCode(data.roomCode);
      setPlayerId(data.playerId);
      setIsHost(false);
      setMyScore(0);
      localRoundRef.current = 1;
      setCurrentRound(1);
      lastChatMsgIdRef.current = 0;
      setChatLog([{ type: 'system-msg', text: `🔑 초대 코드 [${data.roomCode}] 로 방에 입장했습니다!` }]);
      
      const dbPlayers = data.players.map(p => ({
        name: p.nickname,
        avatar: p.avatar,
        score: p.score,
        isMe: p.id === data.playerId,
        isOwner: p.is_host,
        status: p.status === 'drawing' ? '그리는 중' : p.status === 'correct' ? '정답!' : '대기중',
        id: p.id
      }));
      setPlayers(dbPlayers);

      setCurrentScreen('screen-waiting');
    } catch (err) {
      setJoinCodeError(err.message);
    }
  };

  // ==========================================
  // 7. 봇 상호작용 및 정답 타이밍 시뮬레이션
  // ==========================================
  const triggerBotGameplay = (keyword) => {
    if (botGameplayTimeoutRef.current) clearTimeout(botGameplayTimeoutRef.current);
    if (botChatIntervalRef.current) clearInterval(botChatIntervalRef.current);

    // 봇 정답 타이밍 설계 (10~25초 내에 무작위 시뮬레이션)
    const guessDelay = Math.floor(Math.random() * 15000) + 10000;
    botGameplayTimeoutRef.current = setTimeout(() => {
      if (currentScreen === 'screen-game') {
        const correctBot = players.find(p => !p.isMe);
        if (correctBot) {
          appendFeed(correctBot.name, `${keyword}!`, 'correct-answer');
          addSystemMsg(`🎉 ${correctBot.name}님이 정답을 맞혔습니다! (+100 pts)`);
          
          setPlayers(prev => prev.map(p => {
            if (p.name === correctBot.name) {
              return { ...p, score: p.score + 100 };
            }
            return p;
          }));
        }
      }
    }, guessDelay);

    // 봇 잡담 시뮬레이터
    const chatQuotes = ['와 진짜 잘 그린다', '혹시 프라이팬인가?', '오리 같기도 하고...', '어려운데요 ㅋㅋㅋ', '지우개 지우는 거 보소', '사운드오브뮤직?'];
    botChatIntervalRef.current = setInterval(() => {
      const activeBots = players.filter(p => !p.isMe);
      if (activeBots.length > 0) {
        const randBot = activeBots[Math.floor(Math.random() * activeBots.length)];
        const randQuote = chatQuotes[Math.floor(Math.random() * chatQuotes.length)];
        appendFeed(randBot.name, randQuote, 'chat-msg');
      }
    }, 12000);
  };

  // 봇 추가 초대 핸들러
  const inviteBot = () => {
    if (players.length >= 6) {
      alert('더 이상 플레이어를 초대할 수 없습니다. (최대 6명)');
      return;
    }
    const availableBots = botPool.filter(bp => !players.some(p => p.name === bp.name));
    if (availableBots.length > 0) {
      const bot = availableBots[0];
      setPlayers(prev => [...prev, {
        name: bot.name,
        avatar: bot.avatar,
        score: bot.score,
        status: bot.status,
        isMe: false,
        isOwner: false
      }]);
      addSystemMsg(`🐥 ${bot.name}님이 대기실에 입장했습니다.`);
    }
  };

  // ==========================================
  // 8. 클라이언트 채팅 메시지 송신 & 정답 매칭
  // ==========================================
  const sendChatMessage = async (message, type = 'chat') => {
    if (!roomCode || !playerId) return;
    try {
      await fetch('/api/rooms/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          playerId,
          nickname,
          message,
          type
        })
      });
    } catch (err) {
      console.error('Failed to send chat message:', err);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    if (currentScreen === 'screen-game') {
      if (isDrawer) {
        sendChatMessage(chatInput, 'chat');
        setChatInput('');
        return;
      }

      try {
        const res = await fetch('/api/rooms/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode,
            playerId,
            action: 'guess',
            payload: { guess: chatInput }
          })
        });
        const data = await res.json();
        
        if (res.ok && data.isCorrect) {
          // 정답 처리 시, action API 내부에서 chat_messages 테이블에 알림을 삽입하므로 대기
        } else {
          sendChatMessage(chatInput, 'chat');
        }
      } catch (err) {
        console.error('Failed to submit guess:', err);
        sendChatMessage(chatInput, 'chat');
      }
    } else {
      sendChatMessage(chatInput, 'chat');
    }
    setChatInput('');
  };

  // ==========================================
  // 9. 마우스 & 터치 드로잉 핸들러
  // ==========================================
  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const handleDrawingStart = (e) => {
    if (!isDrawer) return; // 출제자만 그리기 가능
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const pos = getMousePos(e);
    lastPosRef.current = pos;
    isDrawingRef.current = true;
  };

  const handleDrawingMove = (e) => {
    if (!isDrawer) return; // 출제자만 그리기 가능
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const pos = getMousePos(e);
    
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isEraser ? '#FFFFFF' : brushColor;
    ctx.stroke();

    lastPosRef.current = pos;
  };

  const handleDrawingEnd = () => {
    isDrawingRef.current = false;

    if (isDrawer && canvasRef.current) {
      const canvas = canvasRef.current;
      const canvasData = canvas.toDataURL();

      fetch('/api/rooms/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          playerId,
          action: 'draw-canvas',
          payload: { canvasData }
        })
      }).catch(err => console.error('Failed to sync canvas:', err));
    }
  };

  // ==========================================
  // 10. React UI 렌더링 (JSX 마크업)
  // ==========================================

  return (
    <div className="app-container">
      
      {/* ========================================== */}
      {/* 1. LANDING SCREEN (NICKNAME ENTRY)        */}
      {/* ========================================== */}
      {currentScreen === 'screen-landing' && (
        <main id="screen-landing" className="screen-view active-view">
          <div className="lobby-card">
            <header className="brand-header">
              <div className="logo-wrapper">
                <span className="brand-logo" style={{ fontSize: '4.5rem', display: 'block', lineHeight: '120px' }}>🍳</span>
              </div>
              <h1 className="brand-title">EGGG</h1>
              <p className="brand-tagline">AI와 함께하는 드로잉 퀴즈 게임</p>
            </header>

            <div className="lobby-form">
              <div className="input-group">
                <label className="input-label" htmlFor="player-nickname">사용할 닉네임</label>
                <input
                  type="text"
                  id="player-nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={10}
                />
              </div>
              <div className="lobby-btn-group">
                <button
                  id="btn-create-room"
                  type="button"
                  className="btn-primary btn-bounce"
                  onClick={handleCreateRoom}
                  disabled={!nickname.trim()}
                >
                  🎮 방 만들기
                </button>
                <button
                  id="btn-join-room"
                  type="button"
                  className="btn-secondary btn-bounce"
                  onClick={handleJoinRoom}
                  disabled={!nickname.trim()}
                >
                  🔑 초대 코드로 입장
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ========================================== */}
      {/* 1.5. JOIN ROOM SCREEN (INVITE CODE ENTRY) */}
      {/* ========================================== */}
      {currentScreen === 'screen-join' && (
        <main id="screen-join" className="screen-view active-view">
          <div className="lobby-card">
            <header className="brand-header">
              <div className="logo-wrapper">
                <span className="brand-logo" style={{ fontSize: '4.5rem', display: 'block', lineHeight: '120px' }}>🔑</span>
              </div>
              <h1 className="brand-title">방 입장</h1>
              <p className="brand-tagline">친구에게 받은 초대 코드를 입력하세요</p>
            </header>

            <form className="lobby-form" onSubmit={handleJoinSubmit}>
              <div className="input-group">
                <label className="input-label" htmlFor="join-code-input">초대 코드</label>
                <input
                  type="text"
                  id="join-code-input"
                  value={joinCodeInput}
                  onChange={(e) => {
                    setJoinCodeInput(e.target.value.toUpperCase());
                    setJoinCodeError('');
                  }}
                  placeholder="예: EGGG-A4X9"
                  maxLength={9}
                  autoFocus
                />
                {joinCodeError && (
                  <p style={{ color: '#E53E3E', fontSize: '0.82rem', margin: '4px 0 0 0', fontWeight: 700 }}>
                    ⚠️ {joinCodeError}
                  </p>
                )}
              </div>
              <div className="lobby-btn-group">
                <button
                  id="btn-join-submit"
                  type="submit"
                  className="btn-primary btn-bounce"
                  disabled={!joinCodeInput.trim()}
                >
                  ✅ 입장하기
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCurrentScreen('screen-landing')}
                >
                  ◀ 뒤로
                </button>
              </div>
            </form>
          </div>
        </main>
      )}

      {/* ========================================== */}
      {/* 2. WAITING ROOM SCREEN                    */}
      {/* ========================================== */}
      {currentScreen === 'screen-waiting' && (
        <main id="screen-waiting" className="screen-view active-view">
          <div className="waiting-room-container">
            
            <header className="waiting-room-header">
              <h2 className="lobby-logo-mini">🥚 EGGG 대기실</h2>
              <div className="room-invite-code" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                초대 코드: <span style={{ color: 'var(--color-secondary)', fontFamily: 'var(--font-brand)', letterSpacing: '0.1em' }}>{roomCode}</span>
                <button
                  onClick={copyRoomCode}
                  className="copy-code-btn"
                  title="초대 코드 복사"
                >
                  📋
                </button>
              </div>
            </header>

            <div className="waiting-room-body">
              {/* 1열: 참여 유저 목록 */}
              <section className="waiting-players-section">
                <h3 className="section-title">참여자 ({players.length} / 6명)</h3>
                <div className="player-slots-list">
                  {players.map((p, idx) => (
                    <div key={idx} className={`lobby-player-slot ${p.isMe ? 'is-me' : ''}`}>
                      <div className="slot-avatar">{p.avatar}</div>
                      <div className="slot-name-wrapper">
                        <span className="slot-name">{p.isMe ? `${nickname} (나)` : p.name}</span>
                        {p.isOwner && <span className="slot-badge">방장</span>}
                      </div>
                    </div>
                  ))}
                  {Array.from({ length: 6 - players.length }).map((_, idx) => (
                    <div key={idx} className="lobby-player-slot is-empty">
                      <div className="slot-avatar">?</div>
                      <div className="slot-name-wrapper">
                        <span className="slot-name" style={{ color: 'var(--color-gray-dark)' }}>비어 있음</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 2열(메인): 게임 모드 설명 */}
              <section className="waiting-modes-section">
                <h3 className="section-title" style={{ margin: 0, marginBottom: '12px' }}>게임 모드 선택</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div 
                    className={`mode-desc-card ${selectedMode === 'human' ? 'active-mode' : ''}`}
                    onClick={() => {
                      if (isHost) {
                        setSelectedMode('human');
                        updateRoomSettings('human', null);
                      }
                    }}
                    style={{ 
                      cursor: isHost ? 'pointer' : 'not-allowed', 
                      border: selectedMode === 'human' ? '3px solid var(--color-primary)' : '2px solid var(--color-border)',
                      borderRadius: '16px',
                      padding: '14px',
                      transition: 'all 0.2s ease',
                      boxShadow: selectedMode === 'human' ? '0 4px 0 0 var(--color-primary)' : 'none'
                    }}
                  >
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem' }}>🎨 일반 모드 (바닐라 드로잉)</h4>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-gray-dark)', lineHeight: '1.4' }}>참가자들이 직접 캔버스에 마우스나 터치로 그림을 그리고, 다른 플레이어가 정답을 맞추는 클래식 모드입니다.</p>
                  </div>
                  <div 
                    className={`mode-desc-card ${selectedMode === 'ai' ? 'active-mode' : ''}`}
                    onClick={() => {
                      if (isHost) {
                        setSelectedMode('ai');
                        updateRoomSettings('ai', null);
                      }
                    }}
                    style={{ 
                      cursor: isHost ? 'pointer' : 'not-allowed', 
                      border: selectedMode === 'ai' ? '3px solid var(--color-secondary)' : '2px solid var(--color-border)',
                      borderRadius: '16px',
                      padding: '14px',
                      transition: 'all 0.2s ease',
                      boxShadow: selectedMode === 'ai' ? '0 4px 0 0 var(--color-secondary)' : 'none'
                    }}
                  >
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem' }}>⚡ AI 드로잉 모드 (SD-Turbo 연동)</h4>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-gray-dark)', lineHeight: '1.4' }}>실시간 AI 이미지 생성을 활용하여 프롬프트를 입력하면 AI가 실시간으로 그림을 그려내는 모드입니다.</p>
                  </div>
                </div>
              </section>

              {/* 3열(우측): 세부 게임 규칙 설정 (신설 서브창) */}
              <section className="waiting-settings-section">
                <h3 className="section-title" style={{ margin: 0 }}>게임 규칙 설정</h3>
                
                <div className="custom-settings-panel">
                  <div className="custom-option">
                    <label>라운드 수</label>
                    <select 
                      value={`${maxRound} 라운드`} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (isHost) {
                          setMaxRound(val);
                          updateRoomSettings(null, val);
                        }
                      }}
                      disabled={!isHost}
                    >
                      <option value="3 라운드">3 라운드</option>
                      <option value="5 라운드">5 라운드</option>
                      <option value="8 라운드">8 라운드</option>
                    </select>
                  </div>
                  <div className="custom-option">
                    <label>인공지능 난이도</label>
                    <select disabled={!isHost}><option>보통 (Soft)</option><option>매우 창의적 (Wild)</option></select>
                  </div>
                </div>
              </section>
            </div>

            <footer className="waiting-room-footer">
              <button className="btn-secondary" onClick={() => setCurrentScreen('screen-landing')}>
                ◀ 뒤로 (Lobby)
              </button>
              <div className="footer-actions-right">
                {isHost ? (
                  <>
                    <button className="btn-secondary btn-bounce" onClick={inviteBot}>
                      ➕ 초대하기 (봇 추가)
                    </button>
                    <button className="btn-primary btn-bounce" onClick={startGame}>
                      ▶ 게임 시작 (Start)
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: '0.95rem', color: 'var(--color-gray-dark)', fontWeight: 700, alignSelf: 'center', marginRight: '10px' }}>
                    방장이 게임을 시작하기를 기다리는 중... ⏳
                  </span>
                )}
              </div>
            </footer>

          </div>
        </main>
      )}

      {/* ========================================== */}
      {/* 3. GAME ROOM (MAIN GAMEPLAY SCREEN)        */}
      {/* ========================================== */}
      {currentScreen === 'screen-game' && (
        <main id="screen-game" className="screen-view active-view">
          
          <header className="game-topbar">
            <div className="topbar-left">
              <div className="logo-mini" onClick={() => { if (confirm('대기실로 나가시겠습니까?')) goHome(); }}>
                <span className="logo-egg-icon">🥚</span>
                <span className="logo-text">EGGG</span>
              </div>
              <div className="game-mode-tag">
                <span className="mode-badge" style={{ backgroundColor: selectedMode === 'ai' ? 'var(--color-secondary)' : 'var(--color-border)' }}>
                  {selectedMode === 'ai' ? 'AI 드로잉 모드' : '일반 모드'}
                </span>
                <span className="round-indicator">Round {currentRound} / {maxRound}</span>
              </div>
            </div>

            <div className="topbar-right">
              {/* 타이머가 드로잉 박스 내부로 이동됨 */}
            </div>
          </header>

          <div className="game-layout">
            {/* 왼쪽: 플레이어 스코어 보드 */}
            <aside className="game-sidebar-left">
              <div className="sidebar-header">
                <h3>참가자 <span style={{ color: 'var(--color-secondary)' }}>({players.length})</span></h3>
              </div>
              <div className="player-list">
                {players.map((p, idx) => (
                  <div key={idx} className={`player-card ${p.isMe ? 'is-me' : ''} status-${p.status === '그리는 중' ? 'drawing' : 'ready'}`}>
                    <div className="player-avatar">{p.avatar}</div>
                    <div className="player-info">
                      <span className="player-name">{p.isMe ? `${nickname} (나)` : p.name}</span>
                      <span className="player-score">{p.isMe ? myScore : p.score} pts</span>
                    </div>
                    <div className="player-status-badge">{p.status}</div>
                  </div>
                ))}
              </div>
            </aside>

            {/* 가운데: 그림판 그리기 영역 혹은 AI 이미지 생성기 */}
            <section className="game-main-area">
              {selectedMode === 'ai' ? (
                /* View B: AI Drawing & Loading Area (AI Drawing Mode) — SD-Turbo 연동 */
                <div id="subview-ai" className="sub-game-view active-subview">
                  <div className="ai-gen-layout">

                    {/* 서버 상태 뱃지 */}
                    <div id="ai-status-badge" className={`ai-status-badge ai-st-${aiStatus}`} role="status" aria-live="polite">
                      <span className="ai-status-dot"></span>
                      <span id="ai-status-text">{aiStatusText}</span>
                    </div>

                    {/* 중앙: 이미지 표시 영역 */}
                    <div className="ai-gen-image-area" id="ai-image-container">
                      {/* 제시어 오버레이 카드 */}
                      <div className="keyword-box canvas-keyword-overlay">
                        <span className="keyword-label">{isDrawer ? '제시어' : '맞혀보세요!'}</span>
                        <span className="keyword-text">{isDrawer ? currentKeyword : '❓'}</span>
                      </div>

                      {/* 타이머 오버레이 */}
                      <div className="timer-overlay-badge" style={{
                        position: 'absolute',
                        top: '15px',
                        right: '15px',
                        zIndex: 10,
                        backgroundColor: timerSeconds <= 10 ? '#F56565' : 'var(--color-secondary)',
                        color: 'white',
                        border: '3px solid var(--color-border)',
                        borderRadius: '12px',
                        padding: '6px 12px',
                        fontWeight: 800,
                        fontFamily: 'var(--font-brand)',
                        fontSize: '1.2rem',
                        boxShadow: '0 3px 0 0 var(--color-border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        pointerEvents: 'none'
                      }}>
                        ⏱️ {timerSeconds}초
                      </div>

                      {/* 빈 상태 플레이스홀더 */}
                      {!aiImageSrc && (
                        <div className="ai-gen-placeholder" id="ai-placeholder">
                          <div className="ai-gen-placeholder-icon">🎨</div>
                          <p>프롬프트를 입력하면<br />AI가 이미지를 생성합니다</p>
                        </div>
                      )}

                      {/* 생성된 이미지 */}
                      {aiImageSrc && (
                        <img 
                          id="ai-generated-image" 
                          src={aiImageSrc} 
                          alt="AI가 생성한 이미지" 
                          title="생성된 이미지" 
                          style={{ display: 'block' }}
                        />
                      )}

                      {/* 로딩 오버레이 */}
                      <div className={`ai-gen-loading-overlay ${aiIsGenerating ? 'visible' : ''}`} id="ai-loading-overlay" aria-live="polite">
                        <div className="ai-gen-spinner"></div>
                        <span className="ai-gen-loading-text" id="ai-loading-text">이미지 생성 중...</span>
                      </div>

                      {/* 이미지 메타 정보 (hover 시 표시) */}
                      {aiImageMeta && (
                        <div className="ai-gen-image-meta" id="ai-image-meta">
                          {aiImageMeta}
                        </div>
                      )}
                    </div>

                    {/* 에러 메시지 */}
                    <div id="ai-error-box" className={`ai-gen-error-box ${aiErrorMsg ? 'visible' : ''}`} role="alert" aria-live="assertive">
                      <span className="ai-gen-error-icon">⚠️</span>
                      <span id="ai-error-text">{aiErrorMsg}</span>
                    </div>

                    {/* 하단: 프롬프트 입력 + 옵션 */}
                    {isDrawer && (
                      <div className="ai-gen-controls">
                        <div className="ai-gen-prompt-row">
                          <textarea
                            id="ai-prompt-input"
                            placeholder="원하는 이미지를 설명하세요&#10;예: a cute fried egg character, kawaii style, pastel colors"
                            maxLength={500}
                            aria-label="이미지 생성 프롬프트 입력"
                            rows={2}
                            value={aiPrompt}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAiPrompt(val);
                              
                              // 실시간 자동 생성 처리 (Debounced)
                              if (aiDebounceTimerRef.current) clearTimeout(aiDebounceTimerRef.current);
                              aiDebounceTimerRef.current = setTimeout(() => {
                                if (isAiRealtime && val.trim()) {
                                  requestAiGenerate(val.trim());
                                }
                              }, AI_CONFIG.DEBOUNCE_MS);
                            }}
                            onKeyDown={(e) => {
                              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault();
                                requestAiGenerate(aiPrompt.trim());
                              }
                            }}
                          ></textarea>
                          <button 
                            id="ai-generate-btn" 
                            className="btn-primary ai-gen-btn" 
                            aria-label="이미지 생성"
                            disabled={aiIsGenerating}
                            onClick={() => {
                              const prompt = aiPrompt.trim();
                              if (!prompt) {
                                setAiErrorMsg('프롬프트를 입력해주세요.');
                                return;
                              }
                              requestAiGenerate(prompt);
                            }}
                          >
                            <span id="ai-btn-icon">{aiIsGenerating ? '⏳' : '⚡'}</span>
                            <span id="ai-btn-text">{aiIsGenerating ? '생성 중...' : '생성'}</span>
                          </button>
                        </div>

                        <div className="ai-gen-options-row">
                          {/* 실시간 자동 생성 토글 */}
                          <label class="ai-gen-toggle-label">
                            <input 
                              type="checkbox" 
                              id="ai-realtime-toggle" 
                              checked={isAiRealtime} 
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setIsAiRealtime(checked);
                                if (checked && aiPrompt.trim()) {
                                  requestAiGenerate(aiPrompt.trim());
                                }
                              }}
                            />
                            <span className="ai-gen-toggle-switch"></span>
                            <span>실시간</span>
                          </label>

                          {/* Steps 슬라이더 */}
                          <div className="ai-gen-steps-group">
                            <span>Steps</span>
                            <input 
                              type="range" 
                              id="ai-steps-slider" 
                              min="1" 
                              max="4" 
                              value={aiSteps} 
                              step="1"
                              onChange={(e) => setAiSteps(parseInt(e.target.value, 10))}
                            />
                            <span className="ai-gen-steps-value" id="ai-steps-display">{aiSteps}</span>
                          </div>

                          {/* 글자 수 */}
                          <span className="ai-gen-char-count" id="ai-char-count">
                            {aiPrompt.length} / 500
                          </span>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              ) : (
                /* View A: 일반 드로잉 캔버스 */
                <div className="sub-game-view active-subview">
                  <div className="canvas-wrapper">
                    {/* 제시어 오버레이 카드 */}
                    <div className="keyword-box canvas-keyword-overlay">
                      <span className="keyword-label">{isDrawer ? '제시어' : '맞혀보세요!'}</span>
                      <span className="keyword-text">{isDrawer ? currentKeyword : '❓'}</span>
                    </div>

                    {/* 타이머 오버레이 */}
                    <div className="timer-overlay-badge" style={{
                      position: 'absolute',
                      top: '15px',
                      right: '15px',
                      zIndex: 10,
                      backgroundColor: timerSeconds <= 10 ? '#F56565' : 'var(--color-secondary)',
                      color: 'white',
                      border: '3px solid var(--color-border)',
                      borderRadius: '12px',
                      padding: '6px 12px',
                      fontWeight: 800,
                      fontFamily: 'var(--font-brand)',
                      fontSize: '1.2rem',
                      boxShadow: '0 3px 0 0 var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      pointerEvents: 'none'
                    }}>
                      ⏱️ {timerSeconds}초
                    </div>
                    
                    <canvas
                      id="drawing-canvas"
                      ref={canvasRef}
                      onMouseDown={handleDrawingStart}
                      onMouseMove={handleDrawingMove}
                      onMouseUp={handleDrawingEnd}
                      onMouseLeave={handleDrawingEnd}
                      onTouchStart={handleDrawingStart}
                      onTouchMove={handleDrawingMove}
                      onTouchEnd={handleDrawingEnd}
                    />
                  </div>

                  {isDrawer && (
                    <div className="drawing-tools">
                      <div className="tool-group colors">
                        {['#2D3748', '#E53E3E', '#DD6B20', '#FFD23F', '#38A169', '#3182CE', '#9F7AEA', '#FF69B4'].map((col) => (
                          <button
                            key={col}
                            className={`color-dot ${brushColor === col && !isEraser ? 'active' : ''}`}
                            style={{ backgroundColor: col }}
                            onClick={() => { setBrushColor(col); setIsEraser(false); }}
                          />
                        ))}
                      </div>
                      
                      <div className="tool-group brush-sizes">
                        {[{ size: 4, label: 'small' }, { size: 10, label: 'medium' }, { size: 20, label: 'large' }].map((s) => (
                          <button
                            key={s.size}
                            className={`size-dot size-${s.label} ${brushSize === s.size ? 'active' : ''}`}
                            onClick={() => setBrushSize(s.size)}
                          />
                        ))}
                      </div>

                      <div className="tool-group action-tools">
                        <button className={`btn-secondary ${isEraser ? 'active' : ''}`} onClick={() => setIsEraser(true)}>
                          🧹 지우개
                        </button>
                        <button className="btn-secondary" onClick={clearCanvas}>
                          🗑️ 전체 지우기
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* 오른쪽: 채팅 피드 및 정답 창 */}
            <aside className="game-sidebar-right">
              <div className="sidebar-header">
                <h3>실시간 피드 & 정답</h3>
              </div>
              
              <div className="chat-log-container">
                {chatLog.map((log, idx) => (
                  <div key={idx} className={`feed-item ${log.type}`}>
                    {log.user ? (
                      <>
                        <span className="chat-user">{log.user}:</span>
                        <span>{log.text}</span>
                      </>
                    ) : (
                      <span>{log.text}</span>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <form className="chat-input-bar" onSubmit={handleChatSubmit}>
                <input
                  type="text"
                  placeholder="추측되는 정답을 영어/한글로 입력하세요!"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button type="submit" id="chat-submit-btn">전송</button>
              </form>
            </aside>
          </div>
        </main>
      )}

      {/* ========================================== */}
      {/* 5. RESULT SCREEN (RANKINGS)                */}
      {/* ========================================== */}
      {currentScreen === 'screen-result' && (
        <main id="screen-result" className="screen-view active-view">
          <div className="result-card">
            
            <header className="result-header">
              <div className="trophy-wrapper">🏆</div>
              <h2 className="result-title">최종 순위 발표</h2>
              <p className="result-desc">플레이어들의 총 득점에 따라 메달이 주어집니다!</p>
            </header>

            <div className="ranking-board">
              {[...players]
                .sort((a, b) => {
                  const scoreA = a.isMe ? myScore : a.score;
                  const scoreB = b.isMe ? myScore : b.score;
                  return scoreB - scoreA;
                })
                .map((p, idx) => {
                  const rank = idx + 1;
                  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
                  return (
                    <div key={idx} className={`ranking-card rank-${rank} ${p.isMe ? 'is-me-rank' : ''}`}>
                      <div className="rank-badge">{medal}</div>
                      <div className="rank-avatar">{p.avatar}</div>
                      <div className="rank-name-wrapper">
                        <span className="rank-name">{p.isMe ? `${nickname} (나)` : p.name}</span>
                        <span className="rank-score">{p.isMe ? myScore : p.score} pts</span>
                      </div>
                    </div>
                  );
                })
              }
            </div>

            <footer className="result-footer">
              <button id="btn-result-go-home" className="btn-primary btn-bounce" onClick={goHome}>
                대기실로 돌아가기 (Lobby)
              </button>
            </footer>

          </div>
        </main>
      )}

    </div>
  );
}
