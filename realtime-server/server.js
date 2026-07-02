/**
 * EGGG - AI Drawing Quiz Game
 * Node.js & ws 라이브러리 기반 실시간 게임 동기화 서버 (server.js)
 * 
 * 1. 기존 Cloudflare Durable Objects 런타임 종속성을 제거하고, 일반 Node.js 프로세스 상에서 구동 가능하도록 재설계.
 * 2. 가상 인메모리 룸 매니저(Map)를 구축하여, 방 코드별 세션 격리 및 게임 루프 관리.
 * 3. 8787 포트에서 WebSocket 업그레이드 요청 청취.
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { URL } from 'url';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ES Module 환경에서의 __dirname 대체 처리
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 루트 디렉토리의 .env 파일을 로드하여 환경 변수 셋업
dotenv.config({ path: path.join(__dirname, '../.env') });

// 포트 설정 (기본 8787 포트 사용)
const PORT = process.env.PORT || 8787;

// Supabase / Neon 연결 문제 발생 시 사용할 로컬 폴백 단어 목록
const DEFAULT_FALLBACK_WORDS = [
  '계란 후라이', '달걀말이', '오므라이스', '닭고기', '병아리', '달걀껍질', '둥지', 
  '사운드오브뮤직', '클래식음악', '교향곡', '피아노', '바이올린', '첼로', '트럼펫'
];

// 가상 봇 참가용 데이터 풀
const BOT_POOL = [
  { name: '노랑병아리', avatar: '🐥', score: 280, status: '준비완료' },
  { name: '새벽수탉', avatar: '🐓', score: 190, status: '준비완료' },
  { name: '밤부엉이', avatar: '🦉', score: 420, status: '준비완료' },
  { name: '아기오리', avatar: '🦆', score: 250, status: '준비완료' },
  { name: '골든리트리버', avatar: '🐕', score: 310, status: '준비완료' }
];

// 전체 활성 룸 리스트 매니저 (Key: roomId, Value: Room 인스턴스)
const rooms = new Map();

/**
 * 방(Room)별 실시간 게임 세션 및 상태 머신 관리 클래스
 */
class Room {
  constructor(roomId) {
    this.id = roomId;
    
    // 이 방의 활성 웹소켓 연결 세션 목록
    this.roomSessions = []; 
    
    // 인메모리 게임 상태 구조체 (상태 머신)
    this.roomState = {
      status: 'waiting',       // 'waiting', 'game', 'result'
      players: [],             // { id, nickname, avatar, score, status, isHost }
      gameMode: 'human',       // 'human' (일반 모드), 'ai' (AI 모드)
      maxRound: 5,             // 설정 가능한 총 라운드 수
      currentRound: 1,         // 현재 진행 라운드
      currentKeyword: '',      // 이번 라운드 제시어 (정답)
      currentDrawerId: '',     // 현재 붓을 쥐고 있는 플레이어의 ID
      aiStatus: 'idle',        // AI 생성 상태: 'idle', 'generating', 'ready'
      aiImageUrl: '',          // 생성 완료된 AI 이미지 URL
      aiPrompt: '',            // 출제자가 입력한 최종 AI 프롬프트
      canvasPaths: [],         // 캔버스 그리기 히스토리 (신규 유저 진입 시 복구용)
      timerSeconds: 45,        // 라운드 남은 시간
    };

    // 백그라운드 타이머 및 바인딩 관리
    this.timerInterval = null;
    this.timerBlocker = false; // 중복 타이머 실행 제어 배리어
  }

  /**
   * 신규 클라이언트 웹소켓 세션 가입 및 이벤트 리스너 바인딩
   */
  handleWebSocketSession(socket, playerId, nickname, avatar) {
    const session = { socket, playerId, nickname };
    this.roomSessions.push(session);

    console.log(`🔌 [소켓 연결] Room=${this.id}, User=${nickname} (${playerId})`);

    // 1. 플레이어가 방의 플레이어 리스트에 존재하지 않으면 신규 추가
    const isPlayerExists = this.roomState.players.some(player => player.id === playerId);
    if (!isPlayerExists) {
      // 최초 가입자에게 방장(isHost) 권한 부여
      const isHostPlayer = this.roomState.players.length === 0;
      this.roomState.players.push({
        id: playerId,
        nickname: nickname,
        avatar: avatar,
        score: 0,
        status: 'ready',
        isHost: isHostPlayer
      });
    }

    // 2. 신규 가입자에게 현재 방 상태 스냅샷 전송
    socket.send(JSON.stringify({
      type: 'room_state',
      state: this.roomState
    }));

    // 3. 그린 드로잉 궤적(Canvas) 복구 패킷 전송
    if (this.roomState.canvasPaths.length > 0) {
      socket.send(JSON.stringify({
        type: 'draw_history',
        points: this.roomState.canvasPaths
      }));
    }

    // 4. 입장 안내 시스템 메시지 브로드캐스트
    this.broadcastToRoom({
      type: 'chat',
      sender: 'System',
      message: `🔑 ${nickname}님이 대기실에 입장했습니다.`,
      isSystem: true
    });
    this.syncRoomStateToAll();

    // 5. 웹소켓 상태 관리 리스너 연동 (Node.js ws 규격 반영)
    socket.on("close", () => {
      console.log(`🚪 [소켓 닫힘] Room=${this.id}, User=${nickname}`);
      this.handlePlayerLeave(playerId, nickname);
    });

    socket.on("error", (err) => {
      console.error(`❌ [소켓 에러] Room=${this.id}, User=${nickname}:`, err);
      this.handlePlayerLeave(playerId, nickname);
    });

    socket.on("message", async (data) => {
      try {
        const payload = JSON.parse(data.toString());
        await this.processClientMessage(playerId, nickname, payload);
      } catch (err) {
        console.error(`⚠️ [메시지 파싱 실패] Room=${this.id}:`, err);
      }
    });
  }

  /**
   * 플레이어 이탈 처리 로직 (자원 클렌징 및 권한 승계)
   */
  handlePlayerLeave(playerId, nickname) {
    this.roomSessions = this.roomSessions.filter(session => session.playerId !== playerId);
    
    const targetPlayerIndex = this.roomState.players.findIndex(player => player.id === playerId);
    if (targetPlayerIndex !== -1) {
      const removedPlayer = this.roomState.players[targetPlayerIndex];
      this.roomState.players.splice(targetPlayerIndex, 1);

      this.broadcastToRoom({
        type: 'chat',
        sender: 'System',
        message: `🚪 ${nickname}님이 게임방에서 퇴장했습니다.`,
        isSystem: true
      });

      // 방장이 탈퇴하고 다른 참가자가 남아있는 경우 권한 양도
      if (removedPlayer.isHost && this.roomState.players.length > 0) {
        this.roomState.players[0].isHost = true;
        this.broadcastToRoom({
          type: 'chat',
          sender: 'System',
          message: `👑 ${this.roomState.players[0].nickname}님이 새로운 방장이 되었습니다.`,
          isSystem: true
        });
      }

      // 방의 모든 참가자가 퇴장한 경우 메모리 소멸 및 리셋
      if (this.roomState.players.length === 0) {
        this.resetGameLoop();
        rooms.delete(this.id);
        console.log(`🗑️ [룸 소멸] Room=${this.id}의 참가자가 모두 퇴장하여 방이 삭제되었습니다.`);
      } else {
        // 게임 진행 중에 출제자(Drawer)가 이탈한 경우 라운드 강제 강등 및 재시작
        if (this.roomState.status === 'game' && this.roomState.currentDrawerId === playerId) {
          this.broadcastToRoom({
            type: 'chat',
            sender: 'System',
            message: `⚠️ 출제자가 퇴장하여 라운드를 강제 리셋하고 재시작합니다.`,
            isSystem: true
          });
          this.triggerNextRoundOrEnd(true);
        } else {
          this.syncRoomStateToAll();
        }
      }
    }
  }

  /**
   * 웹소켓 클라이언트 메시지 라우터 및 상태 제어
   */
  async processClientMessage(playerId, nickname, payload) {
    const activePlayer = this.roomState.players.find(p => p.id === playerId);
    if (!activePlayer) return;

    switch (payload.type) {
      case 'update_settings':
        // 방장(Host) 권한 검증 및 대기실 상태 체크
        if (activePlayer.isHost && this.roomState.status === 'waiting') {
          if (payload.gameMode) this.roomState.gameMode = payload.gameMode;
          if (payload.maxRound) this.roomState.maxRound = payload.maxRound;
          this.syncRoomStateToAll();
        }
        break;

      case 'start_game':
        if (activePlayer.isHost && this.roomState.status === 'waiting') {
          await this.startGameLoop();
        }
        break;

      case 'submit_prompt':
        // AI 모드이고 현재 출제자인 경우에만 프롬프트 허용
        if (this.roomState.status === 'game' && this.roomState.currentDrawerId === playerId && this.roomState.gameMode === 'ai') {
          await this.requestAiImageGeneration(payload.prompt);
        }
        break;

      case 'guess':
        if (this.roomState.status === 'game') {
          await this.evaluatePlayerGuess(playerId, nickname, payload.message);
        } else {
          // 대기실 또는 결과 화면에서는 순수 브로드캐스트 채팅 수행
          this.broadcastToRoom({
            type: 'chat',
            sender: nickname,
            message: payload.message,
            isSystem: false
          });
        }
        break;

      case 'invite_bot':
        if (activePlayer.isHost && this.roomState.status === 'waiting') {
          if (this.roomState.players.length >= 6) return;
          const availableBots = BOT_POOL.filter(bp => !this.roomState.players.some(p => p.nickname === bp.name));
          if (availableBots.length > 0) {
            const bot = availableBots[0];
            const botId = 'BOT-' + Math.random().toString(36).substr(2, 9);
            this.roomState.players.push({
              id: botId,
              nickname: bot.name,
              avatar: bot.avatar,
              score: bot.score,
              status: 'ready',
              isHost: false
            });
            this.broadcastToRoom({
              type: 'chat',
              sender: 'System',
              message: `🐥 ${bot.name}님이 대기실에 입장했습니다.`,
              isSystem: true
            });
            this.syncRoomStateToAll();
          }
        }
        break;

      case 'draw':
        // 현재 라운드 출제자만 드로잉 데이터 브로드캐스트 허용
        if (this.roomState.status === 'game' && this.roomState.currentDrawerId === playerId) {
          if (payload.points && Array.isArray(payload.points)) {
            this.roomState.canvasPaths.push(...payload.points);
            // 메모리 오버헤드 방지를 위한 버퍼 링 누적 제한
            if (this.roomState.canvasPaths.length > 5000) {
              this.roomState.canvasPaths.splice(0, 1000);
            }
            this.broadcastToRoom({
              type: 'draw',
              playerId: playerId,
              points: payload.points
            }, playerId);
          }
        }
        break;

      case 'cursor':
        // 마우스 및 터치 포인터 동적 트랙킹 데이터 중계 (전송자 제외)
        this.broadcastToRoom({
          type: 'cursor',
          playerId: playerId,
          nickname: nickname,
          x: payload.x,
          y: payload.y
        }, playerId);
        break;

      case 'clear_canvas':
        if (this.roomState.status === 'game' && this.roomState.currentDrawerId === playerId) {
          this.roomState.canvasPaths = [];
          this.broadcastToRoom({
            type: 'clear_canvas'
          });
        }
        break;

      default:
        console.warn(`⚠️ 알 수 없는 웹소켓 전송 프로토콜: ${payload.type}`);
    }
  }

  /**
   * Supabase 또는 환경 변수로부터 임의의 단어 랜덤 추출
   */
  async getRandomKeywordFromDatabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    // Supabase 정보가 없는 경우 로컬 폴백 단어 목록 활용
    if (!supabaseUrl || !supabaseKey) {
      console.warn("⚠️ Supabase Credentials 누락. 로컬 폴백 제시어 단어를 가동합니다.");
      const fallbackShuffled = [...DEFAULT_FALLBACK_WORDS].sort(() => 0.5 - Math.random());
      return fallbackShuffled[0];
    }

    try {
      const targetApiUrl = `${supabaseUrl}/rest/v1/words?select=word`;
      const response = await fetch(targetApiUrl, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (response.ok) {
        const wordsList = await response.json();
        if (wordsList && wordsList.length > 0) {
          const randomIndex = Math.floor(Math.random() * wordsList.length);
          return wordsList[randomIndex].word;
        }
      }
    } catch (err) {
      console.error("❌ Supabase 단어 조회 트랜잭션 오류, 로컬 폴백 대체:", err);
    }

    const fallbackShuffled = [...DEFAULT_FALLBACK_WORDS].sort(() => 0.5 - Math.random());
    return fallbackShuffled[0];
  }

  /**
   * 게임 루프 시작 및 1라운드 진입
   */
  async startGameLoop() {
    this.roomState.status = 'game';
    this.roomState.currentRound = 1;
    this.roomState.players.forEach(p => p.score = 0);
    
    await this.setupNewRound();
  }

  /**
   * 신규 라운드 파라미터 초기화 및 타이머 개시
   */
  async setupNewRound() {
    this.roomState.canvasPaths = [];
    this.roomState.aiStatus = 'idle';
    this.roomState.aiImageUrl = '';
    this.roomState.aiPrompt = '';
    this.roomState.timerSeconds = 45;

    // 1. 데이터 풀로부터 신규 단어(정답) 공급
    const newKeyword = await this.getRandomKeywordFromDatabase();
    this.roomState.currentKeyword = newKeyword;

    // 2. 출제자 순환 배정 알고리즘
    const playersCount = this.roomState.players.length;
    const currentDrawerIndex = (this.roomState.currentRound - 1) % playersCount;
    const selectedDrawer = this.roomState.players[currentDrawerIndex];
    this.roomState.currentDrawerId = selectedDrawer.id;

    // 참가자 상태 갱신
    this.roomState.players.forEach(player => {
      if (player.id === selectedDrawer.id) {
        player.status = 'drawing';
      } else {
        player.status = 'ready';
      }
    });

    this.broadcastToRoom({
      type: 'chat',
      sender: 'System',
      message: `🎨 Round ${this.roomState.currentRound}이 시작되었습니다! 출제자는 [${selectedDrawer.nickname}]님 입니다.`,
      isSystem: true
    });

    // 출제자 귓속말 패킷 전송 (단어 정답 전달)
    const drawerSession = this.roomSessions.find(s => s.playerId === selectedDrawer.id);
    if (drawerSession) {
      try {
        drawerSession.socket.send(JSON.stringify({
          type: 'chat',
          sender: 'System',
          message: `📢 당신은 그리는 차례입니다! 이번 라운드 제시어는 [${newKeyword}] 입니다.`,
          isSystem: true
        }));
      } catch (e) {}
    }

    this.syncRoomStateToAll();
    this.startRoundTimer();
  }

  /**
   * 라운드 카운트다운 타이머 구동 (1초단위 폴백 브로드캐스트)
   */
  startRoundTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      if (this.roomState.status !== 'game') {
        clearInterval(this.timerInterval);
        return;
      }

      if (this.roomState.timerSeconds > 0) {
        this.roomState.timerSeconds--;
        this.syncRoomStateToAll();
      } else {
        clearInterval(this.timerInterval);
        this.handleTimerExpiration();
      }
    }, 1000);
  }

  /**
   * 타이머 한계 도달 시 정답 공표 및 강제 라운드 교체
   */
  async handleTimerExpiration() {
    if (this.timerBlocker) return;
    this.timerBlocker = true;

    // 정답 공개 메시지는 Next.js API (reveal-answer)를 통해서만 삽입 및 폴링 연동되도록 이관하고 웹소켓 직접 전송은 생략합니다.

    setTimeout(async () => {
      this.timerBlocker = false;
      await this.triggerNextRoundOrEnd(false);
    }, 3500);
  }

  /**
   * 다음 라운드 진입 혹은 랭킹 결과 스크린 정렬 및 기록 적재
   */
  async triggerNextRoundOrEnd(forceRestartSameRound = false) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    if (forceRestartSameRound) {
      await this.setupNewRound();
      return;
    }

    if (this.roomState.currentRound < this.roomState.maxRound) {
      this.roomState.currentRound++;
      await this.setupNewRound();
    } else {
      // 게임 종료 상태 전이
      this.roomState.status = 'result';
      this.syncRoomStateToAll();

      this.broadcastToRoom({
        type: 'chat',
        sender: 'System',
        message: `🏆 게임이 완전히 끝났습니다! 최종 스코어가 기록됩니다.`,
        isSystem: true
      });

      // 최종 결과를 Supabase 기록 저장
      await this.saveGameRecordToSupabase();
    }
  }

  /**
   * 플레이어 답안 정규화 매칭 및 차등 점수 정산
   */
  async evaluatePlayerGuess(playerId, nickname, guessMessage) {
    const evaluatingPlayer = this.roomState.players.find(p => p.id === playerId);
    if (!evaluatingPlayer) return;

    // 출제자는 정답 매칭 대상에서 완전 격리
    if (this.roomState.currentDrawerId === playerId) {
      this.broadcastToRoom({
        type: 'chat',
        sender: nickname,
        message: guessMessage,
        isSystem: false
      });
      return;
    }

    // 이미 맞춘 사용자는 일반 채팅 처리
    if (evaluatingPlayer.status === 'correct') {
      this.broadcastToRoom({
        type: 'chat',
        sender: nickname,
        message: guessMessage,
        isSystem: false
      });
      return;
    }

    // 텍스트 정규화 비교 (공백 소거, 소문자 매칭)
    const cleanNormalize = (text) => text ? text.replace(/\s+/g, '').toLowerCase() : '';
    const isGuessCorrect = cleanNormalize(guessMessage) === cleanNormalize(this.roomState.currentKeyword);

    if (isGuessCorrect) {
      evaluatingPlayer.status = 'correct';

      // 득점 순위별 점수 가산 룰 적용 (1등: 80, 2등: 60, 3등: 40, 이후: 20)
      const correctPlayersCount = this.roomState.players.filter(p => p.status === 'correct').length;
      let awardedScore = 100;
      if (correctPlayersCount === 1) awardedScore = 80;
      else if (correctPlayersCount === 2) awardedScore = 60;
      else if (correctPlayersCount === 3) awardedScore = 40;
      else if (correctPlayersCount >= 4) awardedScore = 20;

      evaluatingPlayer.score += awardedScore;

      this.broadcastToRoom({
        type: 'chat',
        sender: 'System',
        message: `🎉 ${nickname}님이 정답을 맞혔습니다! (+${awardedScore} pts)`,
        isSystem: true
      });

      this.syncRoomStateToAll();

      // 출제자 제외 참여인원 전원 정답 여부 검사
      const totalParticipants = this.roomState.players.filter(p => p.id !== this.roomState.currentDrawerId).length;
      const totalCorrectParticipants = this.roomState.players.filter(p => p.id !== this.roomState.currentDrawerId && p.status === 'correct').length;

      if (totalParticipants > 0 && totalCorrectParticipants === totalParticipants) {
        this.broadcastToRoom({
          type: 'chat',
          sender: 'System',
          message: `⚡ 모든 참여자가 정답을 맞혔습니다! 다음 라운드로 이동합니다.`,
          isSystem: true
        });
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        setTimeout(async () => {
          await this.triggerNextRoundOrEnd(false);
        }, 2000);
      }
    } else {
      // 오답인 경우 일반 채팅으로 방 전체에 브로드캐스트
      this.broadcastToRoom({
        type: 'chat',
        sender: nickname,
        message: guessMessage,
        isSystem: false
      });
    }
  }

  /**
   * 로컬 AI 이미지 생성 서버(FastAPI Uvicorn) 연동 대리인
   */
  async requestAiImageGeneration(prompt) {
    if (this.roomState.aiStatus === 'generating') {
      console.warn("⚠️ AI 이미지 생성이 이미 동작 중입니다. 중복 요청을 방어합니다.");
      return;
    }

    this.roomState.aiStatus = 'generating';
    this.roomState.aiPrompt = prompt;
    this.syncRoomStateToAll();

    // AI 로컬 서버 주소
    const aiServerBaseUrl = process.env.AI_SERVER_URL || "http://127.0.0.1:8000";
    const generateEndpoint = `${aiServerBaseUrl}/api/generate`;

    try {
      console.log(`🤖 [AI 이미지 생성 시도] Prompt: '${prompt}' (정답 제시어: '${this.roomState.currentKeyword}')`);
      const response = await fetch(generateEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: prompt,
          keyword: this.roomState.currentKeyword || "",
          steps: 1
        })
      });

      if (response.ok) {
        const responseData = await response.json();
        if (responseData.success && responseData.image) {
          this.roomState.aiStatus = 'ready';
          this.roomState.aiImageUrl = responseData.image; // AI 서버가 내려준 이미지 URL 적재
          
          // AI 생성 성공 시 시스템 채팅 메시지 안내는 소거 처리합니다.
          
          this.broadcastToRoom({
            type: 'ai_image',
            imageUrl: responseData.image,
            prompt: prompt
          });
          
          this.syncRoomStateToAll();
          return;
        }
      }
      
      const errorText = await response.text();
      throw new Error(`AI 서버 오류: ${response.status} - ${errorText}`);
    } catch (apiError) {
      console.error("❌ AI 이미지 생성 실패:", apiError);
      this.roomState.aiStatus = 'idle';
      this.broadcastToRoom({
        type: 'chat',
        sender: 'System',
        message: `❌ AI 이미지 생성에 실패했습니다: ${apiError.message}`,
        isSystem: true
      });
      this.syncRoomStateToAll();
    }
  }

  /**
   * 최종 스코어 랭킹을 Supabase PostgreSQL 테이블에 기입
   */
  async saveGameRecordToSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn("⚠️ Supabase 환경 변수 설정 누락. 최종 결과 저장을 스킵합니다.");
      return;
    }

    const rankingScores = this.roomState.players.map(player => ({
      nickname: player.nickname,
      score: player.score
    }));

    const targetApiUrl = `${supabaseUrl}/rest/v1/game_records`;
    try {
      const response = await fetch(targetApiUrl, {
        method: "POST",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          room_code: this.id ? this.id.toString() : 'UNKNOWN',
          game_mode: this.roomState.gameMode,
          player_scores: rankingScores
        })
      });

      if (response.ok) {
        console.log("✅ Supabase DB 최종 게임 결과 영구 기록 완료!");
      } else {
        const errTxt = await response.text();
        console.error("❌ Supabase 저장 실패:", errTxt);
      }
    } catch (saveError) {
      console.error("❌ Supabase 기록 중 네트워크 오류:", saveError);
    }
  }

  /**
   * 라운드 변수 리셋
   */
  resetGameLoop() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.roomState.status = 'waiting';
    this.roomState.currentRound = 1;
    this.roomState.currentKeyword = '';
    this.roomState.currentDrawerId = '';
    this.roomState.aiStatus = 'idle';
    this.roomState.aiImageUrl = '';
    this.roomState.aiPrompt = '';
    this.roomState.canvasPaths = [];
  }

  /**
   * 룸 전체 상태 전파 동기화
   */
  syncRoomStateToAll() {
    this.broadcastToRoom({
      type: 'room_state',
      state: this.roomState
    });
  }

  /**
   * 룸 소속 웹소켓 세션 전체에 직렬화 메시지 송신 (일부 세션 예외 가능)
   */
  broadcastToRoom(messagePayload, excludePlayerId = null) {
    const serializedMessage = JSON.stringify(messagePayload);

    this.roomSessions.forEach(session => {
      if (excludePlayerId && session.playerId === excludePlayerId) {
        return;
      }

      try {
        session.socket.send(serializedMessage);
      } catch (err) {
        console.error(`⚠️ 세션 전송 오류로 세션 제거: ${session.nickname}`, err);
        this.removeSession(session.socket);
      }
    });
  }

  removeSession(socket) {
    this.roomSessions = this.roomSessions.filter(session => session.socket !== socket);
  }
}

/**
 * ----------------------------------------------------
 * HTTP Server 및 WebSocket Server 초기화 및 라우팅 바인딩
 * ----------------------------------------------------
 */

const server = http.createServer((req, res) => {
  // 상태 진단용 헬스체크 앤드포인트 지원
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'healthy', service: 'EGGG Realtime Server' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// ws 웹소켓 서버 선언 (noServer 옵션으로 http 서버 업그레이드 수동 바인딩)
const wss = new WebSocketServer({ noServer: true });

// HTTP Upgrade 요청 핸들링 및 라우팅 검증
server.on('upgrade', (request, socket, head) => {
  const parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  
  // 경로 검증: "/ws/:roomId" 정규표현식 매칭
  const pathMatch = pathname.match(/^\/ws\/([^/]+)$/);
  if (pathMatch) {
    const roomId = pathMatch[1];
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, roomId);
    });
  } else {
    // 적절하지 않은 핸드셰이크 요청의 경우 커넥션 파괴
    socket.destroy();
  }
});

// 소켓 커넥션 처리 이벤트 바인딩
wss.on('connection', (ws, request, roomId) => {
  const parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const queryParameters = parsedUrl.searchParams;
  const playerId = queryParameters.get("playerId");
  const nickname = queryParameters.get("nickname");
  const avatar = queryParameters.get("avatar") || '🥚';

  if (!playerId || !nickname) {
    ws.close(1008, "Missing playerId or nickname");
    return;
  }

  // 룸 인스턴스 할당 (존재하지 않으면 신규 생성)
  let room = rooms.get(roomId);
  if (!room) {
    room = new Room(roomId);
    rooms.set(roomId, room);
    console.log(`🏠 [신규 방 생성] Code=${roomId}`);
  }

  // 소켓 핸들링 위임
  room.handleWebSocketSession(ws, playerId, nickname, avatar);
});

// 서버 바인딩 가동
server.listen(PORT, () => {
  console.log(`🚀 [서버 가동] EGGG Realtime Node.js Server가 포트 ${PORT}에서 실행 중입니다.`);
});
