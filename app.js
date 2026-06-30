/**
 * EGGG - AI Drawing Quiz Game
 * Front-end Interaction & Mockup Engine (Room Setup Version)
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // 1. State Management
  // ==========================================
  const state = {
    currentScreen: 'screen-landing',
    selectedMode: 'human', // 'human', 'ai', 'liar', 'find-ai', 'icebreaker', 'speedrun', 'sandwich'
    nickname: '꼬마달걀',
    isDrawing: false,
    brushColor: '#2D3748',
    brushSize: 8,
    isEraser: false,
    myScore: 350,
    liarRole: 'citizen',   // 'citizen' or 'liar'
    liarTarget: 'Player 3', // 누가 라이어인지
    currentKeyword: '계란 후라이', // 시민 제시어 (동적 변경 예정)
    liarKeyword: '달걀말이',       // 라이어 제시어 (동적 변경 예정)
    currentRound: 1,               // 현재 라운드 수
    maxRound: 5,                   // 설정된 최대 라운드 수
    
    // Players list (index 0 is always 'Me')
    players: [
      { name: '꼬마달걀 (나)', avatar: '🥚', score: 350, isMe: true, isOwner: true, status: '그리는 중' }
    ],
    
    votes: {
      'Player 1': 0,
      'Player 2': 0,
      'Player 3': 0,
      'Player 4': 0,
      'Player 5': 0,
      'Player 6': 0
    },
    hasVoted: false,
    timerInterval: null,
    timerSeconds: 45,
    timerMax: 45
  };

  // Bot players list to invite in waiting room
  const botPool = [
    { name: '노랑병아리', avatar: '🐥', score: 280, status: '준비완료' },
    { name: '새벽수탉', avatar: '🐓', score: 190, status: '준비완료' },
    { name: '밤부엉이', avatar: '🦉', score: 420, status: '맞히는 중' },
    { name: '황금황새', avatar: '🦚', score: 150, status: '대기중' },
    { name: '불사조', avatar: '🦅', score: 310, status: '준비완료' },
    { name: '아기오리', avatar: '🦆', score: 90, status: '대기중' },
    { name: '날쌘매', avatar: '🦅', score: 200, status: '준비완료' }
  ];
  let invitedBotIndex = 0;

  // Simulated bot chats
  const botChats = [
    { type: 'chat', user: '새벽수탉', text: '이거 내가 그리는 차례는 언제 오지?' },
    { type: 'wrong', user: '노랑병아리', text: '노란 동그라미? (오답)' },
    { type: 'chat', user: '밤부엉이', text: '오 캔버스 반응 엄청 부드러움 ㅋㅋ' },
    { type: 'wrong', user: '새벽수탉', text: '우주선인가? (오답)' },
    { type: 'correct', user: '노랑병아리', text: '노랑병아리님이 정답을 맞혔습니다!' },
    { type: 'chat', user: '밤부엉이', text: '와 저걸 맞히네 ㄷㄷ' }
  ];
  let botChatIndex = 0;

  // ==========================================
  // Neon DB 연동 단어 풀 공급 및 방어적 폴백 지정
  // ==========================================
  const wordPool = (typeof EGGG_WORDS !== 'undefined' && Array.isArray(EGGG_WORDS) && EGGG_WORDS.length > 0)
    ? EGGG_WORDS
    : ['계란 후라이', '달걀말이', '오므라이스', '닭고기', '병아리', '달걀껍질', '둥지'];

  // 단어 풀에서 중복 없이 무작위 N개의 단어를 선택하는 헬퍼 함수 (SRP)
  function getRandomWords(count) {
    const shuffled = [...wordPool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  // 정답 판단을 위한 텍스트 노이즈 정제 헬퍼 (공백 및 특수문자 제거, 대소문자 통일)
  function normalizeText(txt) {
    return txt.toLowerCase().replace(/[^a-zA-Z0-9가-힣]/g, '');
  }

  // 라운드 정보 헤더 UI 갱신 함수 (SRP)
  function updateRoundUI() {
    const roundInfoEl = document.getElementById('round-info');
    if (roundInfoEl) {
      roundInfoEl.textContent = `Round ${state.currentRound} / ${state.maxRound}`;
    }
  }

  // 최종 등수 화면 렌더링 함수 (정렬 및 동적 바인딩)
  function renderGameResults() {
    const rankingContainer = document.getElementById('ranking-board-container');
    if (!rankingContainer) return;
    
    rankingContainer.innerHTML = '';
    
    // 점수 기준 내림차순 정렬
    const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
    
    sortedPlayers.forEach((player, index) => {
      const rank = index + 1;
      const card = document.createElement('div');
      
      // 순위별 그라데이션 하이라이팅 적용 및 본인 식별 보조 클래스 추가
      card.className = `ranking-card rank-${rank} ${player.isMe ? 'is-me-rank' : ''}`;
      
      const badgeIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
      
      card.innerHTML = `
        <div class="rank-badge">${badgeIcon}</div>
        <div class="rank-avatar">${player.avatar}</div>
        <div class="rank-name-wrapper">
          <span class="rank-name">${player.name}</span>
          <span class="rank-score">${player.score} pts</span>
        </div>
      `;
      rankingContainer.appendChild(card);
    });
  }




  // ==========================================
  // 2. DOM Elements Cache
  // ==========================================
  const screens = {
    landing: document.getElementById('screen-landing'),
    waiting: document.getElementById('screen-waiting'),
    game: document.getElementById('screen-game'),
    voting: document.getElementById('screen-voting'),
    result: document.getElementById('screen-result')
  };

  // Screen 1: Landing
  const nicknameInput = document.getElementById('player-nickname');
  const btnEnterLobby = document.getElementById('btn-enter-lobby');

  // Screen 2: Waiting Room
  const myLobbyName = document.getElementById('my-lobby-name');
  const lobbySlotsContainer = document.getElementById('lobby-slots-container');
  const lobbyPlayerCountEl = document.getElementById('lobby-player-count');
  const tabPreset = document.getElementById('tab-preset');
  const tabCustom = document.getElementById('tab-custom');
  const modeCardsGrid = document.querySelector('.mode-cards-grid');
  const customSettingsPanel = document.querySelector('.custom-settings-panel');
  const modeCards = document.querySelectorAll('.mode-select-card');
  const btnBackToLanding = document.getElementById('btn-back-to-landing');
  const btnLobbyInvite = document.getElementById('btn-lobby-invite');
  const btnLobbyStart = document.getElementById('btn-lobby-start');

  // Screen 3: Game Room
  const modeBadge = document.getElementById('current-mode-badge');
  const subviewCanvas = document.getElementById('subview-canvas');
  const subviewAi = document.getElementById('subview-ai');
  const canvas = document.getElementById('drawing-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const aiResultDisplay = document.getElementById('ai-result-display');
  const fryingPanLoader = document.querySelector('.frying-pan-loader');
  const aiStatusText = document.querySelector('.ai-status-text');

  // Drawing Tools
  const colorDots = document.querySelectorAll('.color-dot');
  const sizeDots = document.querySelectorAll('.size-dot');
  const toolPencil = document.getElementById('tool-pencil');
  const toolEraser = document.getElementById('tool-eraser');
  const toolClear = document.getElementById('tool-clear');

  // Topbar / Info
  const timerCountdown = document.getElementById('timer-countdown');
  const timerProgress = document.getElementById('timer-progress');
  const playerCountEl = document.getElementById('player-count');
  const playerListContainer = document.getElementById('player-list-container');

  // Chat Feed
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatLogContainer = document.getElementById('chat-log-container');

  // Screen 4: Voting Screen
  const voteTimerSec = document.getElementById('vote-timer-sec');
  const voteCards = document.querySelectorAll('.vote-card');
  const btnSubmitVotes = document.getElementById('btn-submit-votes');
  const btnResetVotes = document.getElementById('btn-reset-votes');


  // ==========================================
  // 3. Setup & Switch Screen Helper
  // ==========================================
  function switchScreen(targetScreenId) {
    Object.keys(screens).forEach(key => {
      const el = screens[key];
      if (el.id === targetScreenId) {
        el.classList.add('active-view');
        el.style.display = 'flex';
      } else {
        el.classList.remove('active-view');
        el.style.display = 'none';
      }
    });
    
    state.currentScreen = targetScreenId;

    // Trigger timer & canvas size based on screen
    if (targetScreenId === 'screen-game') {
      startTimer(45);
      setupCanvasSize();
      syncInGamePlayers();
    } else if (targetScreenId === 'screen-voting') {
      startTimer(20);
      
      // Dynamically set Voting Screen headers based on mode
      const vBadge = document.getElementById('vote-screen-badge');
      const vTitle = document.getElementById('vote-screen-title');
      const vDesc = document.getElementById('vote-screen-desc');
      
      if (state.selectedMode === 'liar') {
        if (vBadge) vBadge.textContent = 'LIAR GAME MODE';
        if (vTitle) vTitle.textContent = "누가 제시어와 다른 그림을 그린 '라이어'일까요? 🕵️‍♂️";
        if (vDesc) vDesc.textContent = "시민들과 다른 제시어(예: 달걀말이)를 비밀리에 부여받고 엉뚱한 그림을 그린 라이어 플레이어를 투표로 색출하세요.";
        
        // Setup anonymous author labels differently (Player 1 ~ 6)
        // If I am liar, my drawing is at Card 1, and Card 3 is a citizen
        // If Player 3 is liar, Card 3 has different drawing, etc.
        for (let i = 1; i <= 6; i++) {
          const authLabel = document.getElementById(`vote-author-p${i}`);
          if (authLabel) authLabel.textContent = i === 1 ? `${state.nickname} (나)` : `Player ${i} (익명)`;
          
          const badgeEl = document.getElementById(`vote-badge-p${i}`);
          if (badgeEl) badgeEl.textContent = `그림 ${String.fromCharCode(64 + i)}`;
        }
      } else if (state.selectedMode === 'find-ai') {
        if (vBadge) vBadge.textContent = 'AI FINDER MODE';
        if (vTitle) vTitle.textContent = '누가 진짜 AI가 그린 그림일까요? 👀';
        if (vDesc) vDesc.textContent = '플레이어들의 그림 사이에 숨어있는 진짜 AI의 가짜 그림(Player 6)을 찾아 투표하세요.';
        
        for (let i = 1; i <= 6; i++) {
          const authLabel = document.getElementById(`vote-author-p${i}`);
          if (authLabel) authLabel.textContent = i === 1 ? `${state.nickname} (나)` : `Player ${i} (익명)`;
          
          const badgeEl = document.getElementById(`vote-badge-p${i}`);
          if (badgeEl) badgeEl.textContent = i === 6 ? '그림 F (AI 추정)' : `그림 ${String.fromCharCode(64 + i)}`;
        }
      } else {
        // Fallback or other modes
        if (vBadge) vBadge.textContent = 'EGGG VOTE';
        if (vTitle) vTitle.textContent = '가장 마음에 드는 그림에 투표해 주세요! 👍';
        if (vDesc) vDesc.textContent = '이 라운드 최고의 작품을 뽑아 점수를 부여합니다.';
      }
    } else {
      stopTimer();
    }
  }


  // ==========================================
  // 4. Nickname & Lobby Navigation
  // ==========================================
  if (btnEnterLobby) {
    btnEnterLobby.addEventListener('click', () => {
      const nick = nicknameInput.value.trim();
      if (!nick) {
        alert('닉네임을 입력해 주세요!');
        return;
      }
      
      state.nickname = nick;
      state.players[0].name = nick + ' (나)';
      
      // Update waiting room slot UI for Owner
      if (myLobbyName) {
        myLobbyName.textContent = nick + ' (나)';
      }
      
      // Update in-game player card Name
      const myCardName = document.querySelector('.player-card.is-me .player-name');
      if (myCardName) {
        myCardName.textContent = nick + ' (나)';
      }

      switchScreen('screen-waiting');
      addSystemMsg(`${nick}님이 대기실에 입장했습니다.`);
    });
  }

  if (btnBackToLanding) {
    btnBackToLanding.addEventListener('click', () => {
      switchScreen('screen-landing');
    });
  }


  // ==========================================
  // 5. Waiting Room Sub-Tabs & Mode Cards Selection
  // ==========================================
  if (tabPreset && tabCustom) {
    tabPreset.addEventListener('click', () => {
      tabPreset.classList.add('active');
      tabCustom.classList.remove('active');
      modeCardsGrid.style.display = 'grid';
      customSettingsPanel.style.display = 'none';
    });

    tabCustom.addEventListener('click', () => {
      tabCustom.classList.add('active');
      tabPreset.classList.remove('active');
      modeCardsGrid.style.display = 'none';
      customSettingsPanel.style.display = 'flex';
    });
  }

  modeCards.forEach(card => {
    card.addEventListener('click', () => {
      modeCards.forEach(c => c.classList.remove('active-card'));
      card.classList.add('active-card');
      state.selectedMode = card.getAttribute('data-mode-key');
    });
  });


  // ==========================================
  // 6. Bot Invite ( 대기실 봇 초대 )
  // ==========================================
  if (btnLobbyInvite) {
    btnLobbyInvite.addEventListener('click', () => {
      if (invitedBotIndex >= botPool.length) {
        alert('모든 봇 플레이어가 초대되었습니다!');
        return;
      }

      const bot = botPool[invitedBotIndex++];
      state.players.push({
        name: bot.name,
        avatar: bot.avatar,
        score: bot.score,
        status: bot.status,
        isMe: false,
        isOwner: false
      });

      // Update lobby counts
      lobbyPlayerCountEl.textContent = state.players.length;

      // Render slots dynamically
      renderLobbySlots();
      addSystemMsg(`🐣 ${bot.name}님이 대기실에 참여했습니다.`);
      
      // Auto trigger a chat message simulation in game room later
      setTimeout(() => {
        simulateBotLobbyChat(bot.name);
      }, 500);
    });
  }

  function renderLobbySlots() {
    const slots = lobbySlotsContainer.querySelectorAll('.lobby-player-slot');
    
    // Reset all slots to empty first (except owner)
    for (let i = 1; i < slots.length; i++) {
      const slot = slots[i];
      const player = state.players[i];
      
      if (player) {
        slot.className = 'lobby-player-slot';
        slot.innerHTML = `
          <div class="slot-avatar">${player.avatar}</div>
          <div class="slot-name-wrapper">
            <span class="slot-name">${player.name}</span>
          </div>
        `;
      } else {
        slot.className = 'lobby-player-slot is-empty';
        slot.innerHTML = `
          <div class="slot-avatar">❓</div>
          <div class="slot-name-wrapper">
            <span class="slot-name">비어 있음</span>
          </div>
        `;
      }
    }
  }

  function simulateBotLobbyChat(botName) {
    const greetings = ['반가워요!', '안녕하세요~', '하이하이 🍳', '가보자고!'];
    const text = greetings[Math.floor(Math.random() * greetings.length)];
    appendFeed(`<span class="chat-user">${botName}:</span> ${text}`, 'chat-msg');
  }


  // ==========================================
  // 7. Lobby Start Game
  // ==========================================
  if (btnLobbyStart) {
    btnLobbyStart.addEventListener('click', () => {
      // 새로운 게임 세션 시작에 따른 채팅 로그 소거
      if (chatLogContainer) chatLogContainer.innerHTML = '';

      // 봇이 한 명도 없으면 재미를 위해 봇 3명을 강제로 자동 초대하고 시작
      if (state.players.length === 1) {
        for (let i = 0; i < 3; i++) {
          const bot = botPool[invitedBotIndex++];
          state.players.push({
            name: bot.name,
            avatar: bot.avatar,
            score: bot.score,
            status: bot.status,
            isMe: false,
            isOwner: false
          });
        }
        renderLobbySlots();
        lobbyPlayerCountEl.textContent = state.players.length;
      }

      // 대기실의 라운드 수 커스텀 설정 바인딩
      const roundSelect = document.querySelector('.custom-settings-panel select');
      if (roundSelect) {
        const roundText = roundSelect.value;
        const matchedNum = roundText.match(/\d+/);
        state.maxRound = matchedNum ? parseInt(matchedNum[0], 10) : 5;
      } else {
        state.maxRound = 5;
      }
      state.currentRound = 1;
      updateRoundUI();

      // Enter Room matching selected mode
      const keywordDisplay = document.getElementById('game-keyword-display');

      if (state.selectedMode === 'human') {
        modeBadge.textContent = '일반 모드';
        modeBadge.style.backgroundColor = 'var(--color-border)';
        restoreHumanDrawingMode();
        
        // 동적 단어 할당
        const [randWord] = getRandomWords(1);
        state.currentKeyword = randWord;
        if (keywordDisplay) keywordDisplay.textContent = randWord;
        
        switchScreen('screen-game');
      } else if (state.selectedMode === 'ai') {
        modeBadge.textContent = 'AI 드로잉 모드';
        modeBadge.style.backgroundColor = 'var(--color-secondary)';
        
        // 동적 단어 할당
        const [randWord] = getRandomWords(1);
        state.currentKeyword = randWord;
        if (keywordDisplay) keywordDisplay.textContent = randWord;
        
        triggerAiDrawingSimulation();
        switchScreen('screen-game');
      } else if (state.selectedMode === 'liar') {
        modeBadge.textContent = '라이어 게임';
        modeBadge.style.backgroundColor = 'var(--color-danger)';
        restoreHumanDrawingMode();
        
        // 50% chance to be Liar or Citizen
        state.liarRole = Math.random() > 0.5 ? 'liar' : 'citizen';
        
        // Neon DB 단어 풀에서 시민 단어와 라이어 단어 동적 무작위 추출
        const [citizenWord, liarWord] = getRandomWords(2);
        state.currentKeyword = citizenWord;
        state.liarKeyword = liarWord;
        
        if (state.liarRole === 'liar') {
          if (keywordDisplay) keywordDisplay.textContent = state.liarKeyword;
          switchScreen('screen-game');
          setTimeout(() => {
            addSystemMsg('😈 당신은 [라이어]입니다! 다른 제시어가 주어졌습니다.');
            addSystemMsg(`시민들이 모두 똑같이 그릴 때, 진짜 제시어가 무엇일지 눈치껏 유추하면서 들키지 않게 [${state.liarKeyword}]를 그리세요!`);
          }, 300);
        } else {
          if (keywordDisplay) keywordDisplay.textContent = state.currentKeyword;
          switchScreen('screen-game');
          setTimeout(() => {
            addSystemMsg(`📢 당신은 [시민]입니다. 시민의 제시어는 [${state.currentKeyword}]입니다.`);
            addSystemMsg('모두가 같은 그림을 그리는 가운데, 혼자 엉뚱한 그림을 그리는 라이어를 찾아내세요.');
          }, 300);
        }
        
        // Decide who the liar is among others (if I am citizen, a bot is liar)
        state.liarTarget = state.liarRole === 'liar' ? 'Player 1' : 'Player 3'; // Player 1 is Me, Player 3 is a bot
      } else if (state.selectedMode === 'find-ai') {
        modeBadge.textContent = 'AI 찾기';
        modeBadge.style.backgroundColor = 'var(--color-secondary)';
        restoreHumanDrawingMode();
        
        // 동적 단어 할당
        const [randWord] = getRandomWords(1);
        state.currentKeyword = randWord;
        if (keywordDisplay) keywordDisplay.textContent = randWord;
        
        switchScreen('screen-game');
        setTimeout(() => {
          addSystemMsg('📢 [AI 찾기] 모드에 오신 것을 환영합니다!');
          addSystemMsg(`제시어는 [${state.currentKeyword}]입니다. 플레이어들의 손그림 속에 숨어있는 진짜 AI의 그림을 찾아 투표하세요.`);
        }, 300);
      } else {
        // Fallback for speedrun, sandwich, icebreaker
        const modesMap = {
          'icebreaker': '아이스브레이커 모드',
          'speedrun': '스피드런 모드',
          'sandwich': '샌드위치 모드'
        };
        modeBadge.textContent = modesMap[state.selectedMode] || 'EGGG 모드';
        modeBadge.style.backgroundColor = 'var(--color-purple)';
        restoreHumanDrawingMode();
        
        // 동적 단어 할당
        const [randWord] = getRandomWords(1);
        state.currentKeyword = randWord;
        if (keywordDisplay) keywordDisplay.textContent = randWord;
        
        switchScreen('screen-game');
      }
    });
  }

  // Sync in-game players with state.players
  function syncInGamePlayers() {
    playerCountEl.textContent = state.players.length;
    
    // Clear list but keep owner
    playerListContainer.innerHTML = '';
    
    state.players.forEach(p => {
      const card = document.createElement('div');
      card.className = `player-card ${p.isMe ? 'is-me' : ''} status-${p.status === '그리는 중' ? 'drawing' : p.status === '맞히는 중' ? 'guessing' : 'ready'}`;
      card.innerHTML = `
        <div class="player-avatar">${p.avatar}</div>
        <div class="player-info">
          <span class="player-name">${p.name}</span>
          <span class="player-score">${p.score} pts</span>
        </div>
        <div class="player-status-badge">${p.status}</div>
      `;
      playerListContainer.appendChild(card);
    });
  }


  // ==========================================
  // 8. Timer Logic
  // ==========================================
  function startTimer(seconds) {
    stopTimer();
    state.timerSeconds = seconds;
    state.timerMax = seconds;
    
    updateTimerUI();

    state.timerInterval = setInterval(() => {
      state.timerSeconds--;
      if (state.timerSeconds <= 0) {
        state.timerSeconds = 0;
        stopTimer();
        handleTimerEnd();
      }
      updateTimerUI();
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function updateTimerUI() {
    if (state.currentScreen === 'screen-game') {
      timerCountdown.textContent = state.timerSeconds;
      const percent = (state.timerSeconds / state.timerMax) * 100;
      timerProgress.setAttribute('stroke-dasharray', `${percent}, 100`);
      
      if (state.timerSeconds <= 10) {
        timerCountdown.style.color = '#F56565';
        timerProgress.style.stroke = '#F56565';
      } else {
        timerCountdown.style.color = 'var(--color-text)';
        timerProgress.style.stroke = 'var(--color-secondary)';
      }
    } else if (state.currentScreen === 'screen-voting') {
      voteTimerSec.textContent = state.timerSeconds;
      const progressFill = document.querySelector('.vote-bar-fill');
      if (progressFill) {
        const percent = (state.timerSeconds / state.timerMax) * 100;
        progressFill.style.width = `${percent}%`;
      }
    }
  }

  function handleTimerEnd() {
    if (state.currentScreen === 'screen-game') {
      // 라이어 모드와 AI 찾기 모드는 기존대로 투표 단계로 넘어감
      if (state.selectedMode === 'liar' || state.selectedMode === 'find-ai') {
        addSystemMsg('⏳ 시간 초과! 투표 단계로 전환합니다.');
        setTimeout(() => {
          switchScreen('screen-voting');
        }, 1500);
      } else {
        // 일반, AI 드로잉, 스피드런 등 비투표 모드는 라운드 순환 루프 진행
        if (state.currentRound < state.maxRound) {
          addSystemMsg(`⏳ 라운드 종료! 2초 뒤 다음 라운드로 전환합니다.`);
          setTimeout(() => {
            state.currentRound++;
            updateRoundUI();
            
            // 다음 라운드용 새 단어 동적 할당
            const [randWord] = getRandomWords(1);
            state.currentKeyword = randWord;
            const keywordDisplay = document.getElementById('game-keyword-display');
            if (keywordDisplay) keywordDisplay.textContent = randWord;
            
            clearCanvas();
            startTimer(45);
            addSystemMsg(`🎨 Round ${state.currentRound} 시작! 제시어를 확인해 주세요.`);
          }, 2000);
        } else {
          // 최대 라운드 도달 시 게임 종료 및 최종 랭킹 표출
          addSystemMsg('🏆 모든 라운드가 종료되었습니다! 최종 결과를 발표합니다.');
          setTimeout(() => {
            renderGameResults();
            switchScreen('screen-result');
          }, 2000);
        }
      }
    } else if (state.currentScreen === 'screen-voting') {
      addSystemMsg('⏳ 투표가 종료되었습니다! 결과를 공개합니다.');
      revealVoteResults();
    }
  }


  // ==========================================
  // 9. Canvas Drawing Engine
  // ==========================================
  let lastX = 0;
  let lastY = 0;

  if (canvas && ctx) {
    setupCanvasSize();
    
    // Mouse Events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    // Touch Events for Mobile
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      lastX = touch.clientX - rect.left;
      lastY = touch.clientY - rect.top;
      state.isDrawing = true;
    });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!state.isDrawing) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.lineWidth = state.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = state.isEraser ? '#FFFFFF' : state.brushColor;
      ctx.stroke();
      
      lastX = x;
      lastY = y;
    });

    canvas.addEventListener('touchend', stopDrawing);
  }

  function setupCanvasSize() {
    if (!canvas) return;
    
    // 기존 캔버스 내용 임시 보존 (방어적 프로그래밍)
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
    
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, newWidth, newHeight);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // 보존된 내용 복원 (스케일 자동 매핑)
      if (tempCanvas) {
        ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, newWidth, newHeight);
      }
    }
  }

  // 창 크기 변경에 따른 캔버스 실시간 자동 반응형 리사이징 적용
  window.addEventListener('resize', setupCanvasSize);

  function startDrawing(e) {
    state.isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
  }

  function draw(e) {
    if (!state.isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.lineWidth = state.brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = state.isEraser ? '#FFFFFF' : state.brushColor;
    ctx.stroke();

    lastX = x;
    lastY = y;
  }

  function stopDrawing() {
    state.isDrawing = false;
  }

  function clearCanvas() {
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }


  // ==========================================
  // 10. Drawing Toolbar Handlers
  // ==========================================
  colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      state.brushColor = dot.getAttribute('data-color');
      
      state.isEraser = false;
      toolEraser.classList.remove('active');
      toolPencil.classList.add('active');
    });
  });

  sizeDots.forEach(dot => {
    dot.addEventListener('click', () => {
      sizeDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      state.brushSize = parseInt(dot.getAttribute('data-size'), 10);
    });
  });

  if (toolPencil) {
    toolPencil.addEventListener('click', () => {
      state.isEraser = false;
      toolEraser.classList.remove('active');
      toolPencil.classList.add('active');
    });
  }

  if (toolEraser) {
    toolEraser.addEventListener('click', () => {
      state.isEraser = true;
      toolPencil.classList.remove('active');
      toolEraser.classList.add('active');
    });
  }

  if (toolClear) {
    toolClear.addEventListener('click', clearCanvas);
  }


  // ==========================================
  // 11. Chat, Guessing & Feed Simulations
  // ==========================================
  function appendFeed(htmlContent, className = '') {
    const item = document.createElement('div');
    item.className = `feed-item ${className}`;
    item.innerHTML = htmlContent;
    chatLogContainer.appendChild(item);
    chatLogContainer.scrollTop = chatLogContainer.scrollHeight;
  }

  function addSystemMsg(text) {
    appendFeed(`<span class="feed-icon">📢</span> 시스템: ${text}`, 'system-msg');
  }

  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;

      chatInput.value = '';
      appendFeed(`<span class="chat-user">${state.nickname} (나):</span> ${text}`, 'chat-msg');

      // Trigger automatic reply from bots occasionally
      triggerAutoBotReply();

      // Check Correct Answer
      // Check Correct Answer
      const cleanText = normalizeText(text);
      const cleanKeyword = normalizeText(state.currentKeyword);
      
      // 입력 텍스트와 현재 제시어가 일치하거나 포함되는지 정답 대조
      if (cleanText === cleanKeyword || (cleanKeyword.length > 1 && cleanText.includes(cleanKeyword))) {
        setTimeout(() => {
          appendFeed(`🎉 <strong class="correct-user">${state.nickname} (나)</strong>님이 정답을 맞혔습니다! (+100점)`, 'correct-answer');
          state.myScore += 100;
          state.players[0].score = state.myScore;
          
          syncInGamePlayers();

          const meCard = document.querySelector('.player-card.is-me');
          if (meCard) {
            meCard.style.backgroundColor = '#E6FFFA';
            meCard.style.borderColor = 'var(--color-success)';
            setTimeout(() => {
              meCard.style.backgroundColor = '#FFFDEB';
              meCard.style.borderColor = 'var(--color-secondary)';
            }, 2000);
          }
        }, 300);
      } else {
        if (text.length <= 8) {
          setTimeout(() => {
            appendFeed(`<span class="wrong-user">${state.nickname} (나):</span> ${text} (오답)`, 'wrong-answer');
          }, 300);
        }
      }
    });
  }

  // Auto trigger bot chats in game room
  function triggerAutoBotReply() {
    if (state.players.length <= 1) return; // No bots to speak
    
    // 25% chance of bot speaking
    if (Math.random() > 0.3) {
      setTimeout(() => {
        simulateBotSpeech();
      }, 1000 + Math.random() * 1500);
    }
  }

  function simulateBotSpeech() {
    if (botChats.length === 0) return;
    
    // Pick active bot name from room
    const activeBots = state.players.filter(p => !p.isMe);
    if (activeBots.length === 0) return;
    const randomBot = activeBots[Math.floor(Math.random() * activeBots.length)];

    const chat = botChats[botChatIndex];
    botChatIndex = (botChatIndex + 1) % botChats.length;

    // Override simulated user with actual bot in room
    const speaker = randomBot.name;

    if (chat.type === 'chat') {
      appendFeed(`<span class="chat-user">${speaker}:</span> ${chat.text}`, 'chat-msg');
    } else if (chat.type === 'wrong') {
      appendFeed(`<span class="wrong-user">${speaker}:</span> ${chat.text} (오답)`, 'wrong-answer');
    } else if (chat.type === 'correct') {
      appendFeed(`🎉 <strong class="correct-user">${speaker}</strong>님이 정답을 맞혔습니다! (+100점)`, 'correct-answer');
      
      // Update scores
      state.players.forEach(p => {
        if (p.name === speaker) {
          p.score += 100;
        }
      });
      syncInGamePlayers();
    }
  }


  // ==========================================
  // 12. AI Drawing Simulation Trigger
  // ==========================================
  function triggerAiDrawingSimulation() {
    subviewCanvas.classList.remove('active-subview');
    subviewAi.classList.add('active-subview');
    
    fryingPanLoader.style.display = 'block';
    aiStatusText.style.display = 'block';
    aiResultDisplay.style.display = 'none';

    setTimeout(() => {
      fryingPanLoader.style.display = 'none';
      aiStatusText.style.display = 'none';
      aiResultDisplay.style.display = 'flex';
      addSystemMsg('🤖 AI가 그림을 모두 완성하여 전송했습니다!');
    }, 2500);
  }

  function restoreHumanDrawingMode() {
    subviewCanvas.classList.add('active-subview');
    subviewAi.classList.remove('active-subview');
  }


  // ==========================================
  // 13. Voting (Liar Game Mode & AI Finder) Logic
  // ==========================================
  voteCards.forEach(card => {
    const voteBtn = card.querySelector('.btn-vote');
    if (voteBtn) {
      voteBtn.addEventListener('click', () => {
        if (state.hasVoted) return;

        state.hasVoted = true;
        card.classList.add('voted-state');
        
        const targetName = voteBtn.getAttribute('data-target-name');
        
        voteCards.forEach(c => {
          if (c !== card) {
            c.querySelector('.btn-vote').style.opacity = '0.5';
            c.querySelector('.btn-vote').style.pointerEvents = 'none';
          }
        });

        state.votes[targetName]++;
        simulateBackgroundVotes(targetName);

        addSystemMsg(`🗳️ ${targetName}에게 투표하셨습니다.`);
        
        btnSubmitVotes.classList.remove('btn-secondary');
        btnSubmitVotes.classList.add('btn-primary');
      });
    }
  });

  function simulateBackgroundVotes(myChoice) {
    const players = Object.keys(state.votes);
    // Find the target to concentrate bot votes on
    const targetLiar = state.selectedMode === 'liar' ? state.liarTarget : 'Player 6';
    
    for (let i = 0; i < 11; i++) {
      const rand = Math.random();
      let pickedPlayer;
      // 45% chance to vote for the correct target (Liar or AI)
      if (rand < 0.45) {
        pickedPlayer = targetLiar;
      } else {
        const otherPlayers = players.filter(p => p !== targetLiar);
        pickedPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
      }
      state.votes[pickedPlayer]++;
    }
  }

  if (btnSubmitVotes) {
    btnSubmitVotes.addEventListener('click', () => {
      if (!state.hasVoted) {
        alert('먼저 의심스러운 플레이어의 그림에 투표해 주세요!');
        return;
      }
      revealVoteResults();
    });
  }

  if (btnResetVotes) {
    btnResetVotes.addEventListener('click', () => {
      state.hasVoted = false;
      Object.keys(state.votes).forEach(k => state.votes[k] = 0);

      voteCards.forEach((card, idx) => {
        card.classList.remove('voted-state');
        card.style.borderColor = 'var(--color-border)';
        card.style.boxShadow = 'var(--shadow-flat)';
        
        const btn = card.querySelector('.btn-vote');
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.display = 'block';
        
        const progress = card.querySelector('.vote-progress-wrapper');
        progress.style.display = 'none';
        
        // Reset card badges to default
        const badge = card.querySelector('.vote-card-badge');
        badge.className = 'vote-card-badge';
        badge.textContent = `그림 ${String.fromCharCode(65 + idx)}`;
      });

      btnSubmitVotes.style.display = 'block';
      btnResetVotes.style.display = 'none';
      
      startTimer(20);
      addSystemMsg('🗳️ 투표가 초기화되어 다시 시작합니다!');
    });
  }

  function revealVoteResults() {
    stopTimer();
    
    let totalVotes = 0;
    Object.keys(state.votes).forEach(k => totalVotes += state.votes[k]);

    const targetLiar = state.selectedMode === 'liar' ? state.liarTarget : 'Player 6';

    voteCards.forEach((card, idx) => {
      const voteBtn = card.querySelector('.btn-vote');
      const targetName = voteBtn.getAttribute('data-target-name');
      const voteCount = state.votes[targetName];
      const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
      
      const fillBar = card.querySelector('.vote-fill');
      const countText = card.querySelector('.vote-count-text');
      const progressWrapper = card.querySelector('.vote-progress-wrapper');

      fillBar.style.width = `${percentage}%`;
      countText.textContent = `${voteCount}표 (${percentage}%)`;
      progressWrapper.style.display = 'flex';
      
      voteBtn.style.display = 'none';

      // Highlight the correct Liar or AI
      if (targetName === targetLiar) {
        card.classList.add('voted-state');
        card.style.borderColor = 'var(--color-danger)';
        card.style.boxShadow = '0 6px 0 0 var(--color-danger)';
        
        const badge = card.querySelector('.vote-card-badge');
        badge.className = 'vote-card-badge liar-badge';
        
        if (state.selectedMode === 'liar') {
          badge.textContent = `👑 진짜 라이어 (${state.liarKeyword})`;
        } else {
          badge.textContent = `👑 진짜 AI (Liar)`;
        }
      }
    });

    btnSubmitVotes.style.display = 'none';
    btnResetVotes.style.display = 'block';

    // Output dynamic results to feed
    setTimeout(() => {
      const targetVotes = state.votes[targetLiar];
      const targetPercentage = totalVotes > 0 ? Math.round((targetVotes / totalVotes) * 100) : 0;
      
      if (state.selectedMode === 'liar') {
        if (state.liarRole === 'liar') {
          if (targetPercentage >= 40) {
            appendFeed(`📢 투표 결과: 시민 승리! 당신(라이어)은 ${targetPercentage}%의 표를 받아 검거되었습니다. (실제 제시어: ${state.liarKeyword})`, 'liar-reveal-msg');
          } else {
            appendFeed(`😈 투표 결과: 라이어 승리! 당신(라이어)은 단 ${targetPercentage}%의 표만 받으며 무사히 숨었습니다.`, 'citizen-reveal-msg');
          }
        } else {
          if (targetPercentage >= 40) {
            appendFeed(`📢 투표 결과: 시민 승리! 플레이어들이 ${targetPercentage}%의 표로 진짜 라이어였던 새벽수탉(Player 3)을 검거했습니다. (실제 제시어: ${state.liarKeyword})`, 'citizen-reveal-msg');
          } else {
            appendFeed(`😈 투표 결과: 라이어 승리! 진짜 라이어는 새벽수탉(Player 3)이었으나, 시민들이 엉뚱한 플레이어에게 투표했습니다.`, 'liar-reveal-msg');
          }
        }
      } else {
        // AI Finder Mode
        if (targetPercentage >= 40) {
          appendFeed(`🎉 시민 승리! 플레이어들이 ${targetPercentage}%의 득표율로 진짜 AI가 그린 그림(Player 6)을 성공적으로 찾아냈습니다!`, 'citizen-reveal-msg');
        } else {
          appendFeed(`😈 AI 승리! 플레이어들이 진짜 AI를 찾아내지 못했습니다. 기계가 튜링 테스트를 통과했습니다.`, 'liar-reveal-msg');
        }
      }

      // 투표 모드(라이어/AI 찾기)에서도 최종 결과 발표 스크린으로 자동 전환 처리 추가
      setTimeout(() => {
        addSystemMsg('🏆 3초 뒤 최종 등수 결과 화면으로 이동합니다...');
        setTimeout(() => {
          renderGameResults();
          switchScreen('screen-result');
        }, 3000);
      }, 2000);

    }, 500);
  }

  // Quick lobby shortcut in game room
  const gotoLobbyShortcut = document.getElementById('goto-lobby-shortcut');
  if (gotoLobbyShortcut) {
    gotoLobbyShortcut.addEventListener('click', () => {
      if (confirm('대기실로 나가시겠습니까? 현재 진행 상황이 초기화됩니다.')) {
        switchScreen('screen-waiting');
      }
    });
  }

  // Screen 5: Result Screen - Go Home Button Handler
  const btnResultGoHome = document.getElementById('btn-result-go-home');
  if (btnResultGoHome) {
    btnResultGoHome.addEventListener('click', () => {
      // 로비로 복귀 시 채팅창 초기화
      if (chatLogContainer) chatLogContainer.innerHTML = '';

      // 모든 플레이어 점수 초기값으로 리셋
      state.players.forEach(p => {
        if (p.isMe) {
          state.myScore = 350; // 원본 스코어 350으로 복구
          p.score = 350;
        } else {
          // 봇 스코어들은 적당한 범위로 무작위 리셋
          p.score = Math.floor(Math.random() * 200) + 150;
        }
        p.status = '준비완료';
      });
      state.currentRound = 1;
      
      // 대기실 화면으로 복귀
      switchScreen('screen-waiting');
      
      // 인게임 UI 동기화
      syncInGamePlayers();
      addSystemMsg('대기실로 돌아왔습니다. 다음 게임을 준비해 주세요.');
    });
  }

});
