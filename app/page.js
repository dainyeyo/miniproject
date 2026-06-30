"use client";

import React, { useState, useEffect, useRef } from 'react';

// Neon DB 연동 실패 시 사용할 최후의 로컬 폴백 단어 풀 지정
const DEFAULT_FALLBACK_WORDS = [
  '계란 후라이', '달걀말이', '오므라이스', '닭고기', '병아리', '달걀껍질', '둥지', 
  '사운드오브뮤직', '클래식음악', '교향곡', '피아노', '바이올린', '첼로', '트럼펫'
];

export default function GamePage() {
  // ==========================================
  // 1. React 상태(State) 설계
  // ==========================================
  const [currentScreen, setCurrentScreen] = useState('screen-landing'); // landing, waiting, game, voting, result
  const [selectedMode, setSelectedMode] = useState('human'); // human 고정 (일반 모드로 단일화)
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
  const [myScore, setMyScore] = useState(350);
  const [players, setPlayers] = useState([
    { name: '꼬마달걀 (나)', avatar: '🥚', score: 350, isMe: true, isOwner: true, status: '그리는 중' }
  ]);
  
  // 타이머 및 채팅창 피드 상태
  const [timerSeconds, setTimerSeconds] = useState(45);
  const [timerMax, setTimerMax] = useState(45);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState([
    { type: 'system-msg', text: '🔔 게임방에 접속했습니다!' }
  ]);
  
  // Neon DB 로딩 단어 풀 캐싱
  const [wordPool, setWordPool] = useState([]);

  // ==========================================
  // 2. React Refs 선언 (Canvas, Scroll, Bot interval)
  // ==========================================
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
  }, [currentScreen, timerSeconds]);

  // ==========================================
  // 6. 게임 진행 흐름 제어 로직 (Game Controller)
  // ==========================================

  // 게임 시작 버튼 이벤트
  const startGame = () => {
    // 세션 초기화 클렌징
    setChatLog([{ type: 'system-msg', text: `🎮 새로운 게임이 시작되었습니다! (모드: 일반 모드)` }]);
    setCurrentRound(1);

    // 최소 플레이어 수(봇 포함 4명) 충족
    let currentPlayers = [...players];
    if (currentPlayers.length === 1) {
      let bIdx = invitedBotIndex;
      for (let i = 0; i < 3; i++) {
        const bot = botPool[bIdx % botPool.length];
        bIdx++;
        currentPlayers.push({
          name: bot.name,
          avatar: bot.avatar,
          score: bot.score,
          status: bot.status,
          isMe: false,
          isOwner: false
        });
      }
      setInvitedBotIndex(bIdx);
      setPlayers(currentPlayers);
    }

    // 제시어 무작위 선정
    const [randWord] = getRandomWords(wordPool, 1);
    setCurrentKeyword(randWord);
    addSystemMsg(`🎨 제시어: [${randWord}]`);

    // 타이머 45초 세팅 후 인게임 전환
    setTimerSeconds(45);
    setTimerMax(45);
    gameRunningRef.current = true;
    setCurrentScreen('screen-game');
    
    // 봇 시뮬레이션 연동 시작
    triggerBotGameplay(randWord);
  };

  // 타이머 만료 시 흐름 제어 분기
  const handleTimerEnd = () => {
    if (currentScreen === 'screen-game') {
      if (currentRound < maxRound) {
        addSystemMsg(`⏳ 라운드 종료! 2초 뒤 다음 라운드로 전환합니다.`);
        setTimeout(() => {
          setCurrentRound(prev => {
            const nextRound = prev + 1;
            // 새 제시어 재할당
            const [newWord] = getRandomWords(wordPool, 1);
            setCurrentKeyword(newWord);
            clearCanvas();
            setTimerSeconds(45);
            setTimerMax(45);
            addSystemMsg(`🎨 Round ${nextRound} 시작! 제시어를 확인해 주세요.`);
            triggerBotGameplay(newWord);
            return nextRound;
          });
        }, 2000);
      } else {
        addSystemMsg('🏆 모든 라운드가 종료되었습니다! 최종 결과를 발표합니다.');
        setTimeout(() => {
          setCurrentScreen('screen-result');
        }, 2000);
      }
    }
  };

  // 대기실 복귀 리셋
  const goHome = () => {
    setChatLog([{ type: 'system-msg', text: '대기실로 돌아왔습니다. 다음 게임을 준비해 주세요.' }]);
    setPlayers(prev => prev.map(p => {
      if (p.isMe) {
        setMyScore(350);
        return { ...p, score: 350, status: '준비완료' };
      }
      return { ...p, score: Math.floor(Math.random() * 200) + 150, status: '준비완료' };
    }));
    setCurrentRound(1);
    setCurrentScreen('screen-waiting');
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
  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const normalizedInput = normalizeText(chatInput);
    const normalizedKeyword = normalizeText(currentKeyword);

    if (normalizedInput === normalizedKeyword && currentScreen === 'screen-game') {
      appendFeed(nickname, chatInput, 'correct-answer');
      addSystemMsg(`🎉 축하합니다! 정답 [${currentKeyword}]을(를) 맞혔습니다! (+100 pts)`);
      setMyScore(prev => prev + 100);
      setPlayers(prev => prev.map(p => {
        if (p.isMe) return { ...p, score: p.score + 100 };
        return p;
      }));
    } else {
      appendFeed(nickname, chatInput, 'chat-msg');
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const pos = getMousePos(e);
    lastPosRef.current = pos;
    isDrawingRef.current = true;
  };

  const handleDrawingMove = (e) => {
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

            <form className="lobby-form" onSubmit={(e) => { e.preventDefault(); setCurrentScreen('screen-waiting'); }}>
              <div className="input-group">
                <label className="input-label" htmlFor="player-nickname">사용할 닉네임</label>
                <input
                  type="text"
                  id="player-nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={10}
                  required
                />
              </div>
              <button type="submit" className="btn-primary btn-bounce">
                대기실 입장하기 (Lobby)
              </button>
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
              <div className="room-invite-code">
                초대 코드: <span style={{ color: 'var(--color-secondary)' }}>EGGG-9988</span>
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
                <h3 className="section-title" style={{ margin: 0 }}>게임 모드</h3>
                
                <div className="mode-desc-card">
                  <h4>🎨 일반 모드 (바닐라 드로잉)</h4>
                  <p>참가자들이 순서대로 돌아가며 캔버스에 단어 그림을 그리고, 다른 플레이어들이 정답을 입력하여 맞추는 가장 기본적이고 직관적인 드로잉 퀴즈입니다.</p>
                </div>
              </section>

              {/* 3열(우측): 세부 게임 규칙 설정 (신설 서브창) */}
              <section className="waiting-settings-section">
                <h3 className="section-title" style={{ margin: 0 }}>게임 규칙 설정</h3>
                
                <div className="custom-settings-panel">
                  <div className="custom-option">
                    <label>라운드 수</label>
                    <select value={`${maxRound} 라운드`} onChange={(e) => setMaxRound(parseInt(e.target.value, 10))}>
                      <option value="3 라운드">3 라운드</option>
                      <option value="5 라운드">5 라운드</option>
                      <option value="8 라운드">8 라운드</option>
                    </select>
                  </div>
                  <div className="custom-option">
                    <label>인공지능 난이도</label>
                    <select><option>보통 (Soft)</option><option>매우 창의적 (Wild)</option></select>
                  </div>
                </div>
              </section>
            </div>

            <footer className="waiting-room-footer">
              <button className="btn-secondary" onClick={() => setCurrentScreen('screen-landing')}>
                ◀ 뒤로 (Lobby)
              </button>
              <div className="footer-actions-right">
                <button className="btn-secondary btn-bounce" onClick={inviteBot}>
                  ➕ 초대하기 (봇 추가)
                </button>
                <button className="btn-primary btn-bounce" onClick={startGame}>
                  ▶ 게임 시작 (Start)
                </button>
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
                <span className="mode-badge" style={{ backgroundColor: 'var(--color-border)' }}>
                  일반 모드
                </span>
                <span className="round-indicator">Round {currentRound} / {maxRound}</span>
              </div>
            </div>

            <div className="topbar-right">
              <div className="timer-container">
                <svg className="timer-svg" viewBox="0 0 36 36">
                  <path className="timer-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path
                    className="timer-progress"
                    strokeDasharray={`${(timerSeconds / timerMax) * 100}, 100`}
                    style={{ stroke: timerSeconds <= 10 ? '#F56565' : 'var(--color-secondary)' }}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="timer-text" style={{ color: timerSeconds <= 10 ? '#F56565' : 'var(--color-text)' }}>
                  {timerSeconds}
                </div>
              </div>
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

            {/* 가운데: 그림판 그리기 영역 (제시어 캔버스 좌상단 플로팅 포함) */}
            <section className="game-main-area">
              <div className="sub-game-view active-subview">
                <div className="canvas-wrapper">
                  {/* 제시어 오버레이 카드 */}
                  <div className="keyword-box canvas-keyword-overlay">
                    <span className="keyword-label">제시어</span>
                    <span className="keyword-text">{currentKeyword}</span>
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
              </div>
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
