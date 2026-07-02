import { NextResponse } from 'next/server';
import pg from 'pg';

const DEFAULT_FALLBACK_WORDS = [
  '계란 후라이', '달걀말이', '오므라이스', '닭고기', '병아리', '달걀껍질', '둥지', 
  '사운드오브뮤직', '클래식음악', '교향곡', '피아노', '바이올린', '첼로', '트럼펫'
];

async function assignNewHostByScore(client, roomCode) {
  // 1. 최고 점수 활성 인간 플레이어 찾기 (동점 시 닉네임 사전순)
  const topPlayerRes = await client.query(
    "SELECT id, nickname, score FROM players WHERE room_code = $1 AND is_active = TRUE AND id NOT LIKE 'BOT-%' ORDER BY score DESC, nickname ASC LIMIT 1",
    [roomCode]
  );

  if (topPlayerRes.rows.length > 0) {
    const topPlayer = topPlayerRes.rows[0];
    
    // 2. 기존 모든 플레이어 방장 권한 해제
    await client.query("UPDATE players SET is_host = FALSE WHERE room_code = $1", [roomCode]);
    
    // 3. 새 방장 권한 부여
    await client.query("UPDATE players SET is_host = TRUE WHERE id = $1", [topPlayer.id]);
    
    // 4. 시스템 메시지 안내
    await client.query(
      "INSERT INTO chat_messages (room_code, player_id, nickname, message, type) VALUES ($1, 'system', 'System', $2, 'system-msg')",
      [roomCode, `👑 최고 득점자인 [${topPlayer.nickname}]님이 새로운 방장이 되었습니다!`]
    );
  }
}

export async function POST(request) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured.' }, { status: 500 });
  }

  try {
    const { roomCode, playerId, action, payload } = await request.json();
    if (!roomCode || !playerId || !action) {
      return NextResponse.json({ error: 'roomCode, playerId, action are required.' }, { status: 400 });
    }

    const normalizedCode = roomCode.trim().toUpperCase();

    const client = new pg.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    // 1. 플레이어 권한 확인
    const playerCheck = await client.query(
      'SELECT id, is_host, nickname FROM players WHERE id = $1 AND room_code = $2',
      [playerId, normalizedCode]
    );

    if (playerCheck.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: '권한이 없습니다. 해당 방의 멤버가 아닙니다.' }, { status: 403 });
    }

    const player = playerCheck.rows[0];

    // 2. 액션별 분기 처리
    switch (action) {
      case 'update-settings': {
        if (!player.is_host) {
          await client.end();
          return NextResponse.json({ error: '방장만 방 설정을 변경할 수 있습니다.' }, { status: 403 });
        }

        const { gameMode, maxRound, roundTime, maxPlayers } = payload;

        if (maxPlayers) {
          // 허용 범위(2~10명) 검증
          if (maxPlayers < 2 || maxPlayers > 10) {
            await client.end();
            return NextResponse.json({ error: '최대 인원은 2명 이상 10명 이하로 설정할 수 있습니다.' }, { status: 400 });
          }

          // 현재 접속 중인 인원보다 적은 값으로는 낮출 수 없음
          const activeCountRes = await client.query(
            "SELECT COUNT(*) as count FROM players WHERE room_code = $1 AND is_active = TRUE",
            [normalizedCode]
          );
          const activeCount = parseInt(activeCountRes.rows[0].count, 10);
          if (maxPlayers < activeCount) {
            await client.end();
            return NextResponse.json({ error: `현재 인원(${activeCount}명)보다 적게 설정할 수 없습니다.` }, { status: 400 });
          }
        }

        await client.query(
          'UPDATE game_rooms SET game_mode = COALESCE($1, game_mode), max_round = COALESCE($2, max_round), round_time = COALESCE($3, round_time), max_players = COALESCE($4, max_players) WHERE room_code = $5',
          [gameMode, maxRound, roundTime, maxPlayers, normalizedCode]
        );
        break;
      }

      case 'invite-bot': {
        if (!player.is_host) {
          await client.end();
          return NextResponse.json({ error: '방장만 봇을 초대할 수 있습니다.' }, { status: 403 });
        }

        // 1. 현재 대기실 인원 수 및 방 최대 인원 확인
        const roomLimitRes = await client.query(
          'SELECT max_players FROM game_rooms WHERE room_code = $1',
          [normalizedCode]
        );
        const maxPlayersLimit = roomLimitRes.rows[0]?.max_players || 6;

        const countRes = await client.query(
          "SELECT COUNT(*) as count FROM players WHERE room_code = $1 AND is_active = TRUE",
          [normalizedCode]
        );
        const playerCount = parseInt(countRes.rows[0].count, 10);
        if (playerCount >= maxPlayersLimit) {
          await client.end();
          return NextResponse.json({ error: `더 이상 플레이어를 초대할 수 없습니다. (최대 ${maxPlayersLimit}명)` }, { status: 400 });
        }

        // 2. 현재 방에 초대되어 있는 플레이어들의 닉네임 파악
        const activePlayersRes = await client.query(
          "SELECT nickname FROM players WHERE room_code = $1 AND is_active = TRUE",
          [normalizedCode]
        );
        const activeNicknames = activePlayersRes.rows.map(p => p.nickname);

        const BOT_POOL = [
          { name: '노랑병아리 (봇)', avatar: '🐥', score: 280, status: 'ready' },
          { name: '새벽수탉 (봇)', avatar: '🐓', score: 190, status: 'ready' },
          { name: '밤부엉이 (봇)', avatar: '🦉', score: 420, status: 'ready' },
          { name: '아기오리 (봇)', avatar: '🦆', score: 250, status: 'ready' },
          { name: '골든리트리버 (봇)', avatar: '🐕', score: 310, status: 'ready' }
        ];

        const availableBots = BOT_POOL.filter(bp => !activeNicknames.includes(bp.name));
        if (availableBots.length === 0) {
          await client.end();
          return NextResponse.json({ error: '초대할 수 있는 봇이 더 이상 없습니다.' }, { status: 400 });
        }

        const bot = availableBots[0];
        const botId = `BOT-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

        await client.query('BEGIN');

        // 봇 플레이어 추가
        await client.query(
          "INSERT INTO players (id, room_code, nickname, avatar, score, is_host, status, is_active, last_active) VALUES ($1, $2, $3, $4, $5, FALSE, 'ready', TRUE, NOW())",
          [botId, normalizedCode, bot.name, bot.avatar, 0]
        );

        // 시스템 메시지 추가
        await client.query(
          "INSERT INTO chat_messages (room_code, player_id, nickname, message, type) VALUES ($1, $2, $3, $4, 'system-msg')",
          [normalizedCode, botId, bot.name, `🐥 ${bot.name}님이 대기실에 입장했습니다.`]
        );

        await client.query('COMMIT');
        break;
      }

      case 'start-game': {
        if (!player.is_host) {
          await client.end();
          return NextResponse.json({ error: '방장만 게임을 시작할 수 있습니다.' }, { status: 403 });
        }

        const { maxRound, roundTime, keyword } = payload;

        // 순서대로 첫 출제자(drawer) 지정 (닉네임 기준 1번째 플레이어, 봇은 제외)
        const playersRes = await client.query("SELECT id FROM players WHERE room_code = $1 AND id NOT LIKE 'BOT-%' ORDER BY nickname ASC", [normalizedCode]);
        const drawerId = playersRes.rows[0].id;

        await client.query('BEGIN');

        // 방 상태를 게임중으로 업데이트하고 키워드, 출제자 정보 세팅
        await client.query(
          'UPDATE game_rooms SET status = $1, current_round = 1, max_round = $2, round_time = $3, current_keyword = $4, current_drawer_id = $5, canvas_data = $6, ai_image_url = $7 WHERE room_code = $8',
          ['game', maxRound || 5, roundTime || 45, keyword, drawerId, '', '', normalizedCode]
        );

        // 플레이어들 상태 초기화
        await client.query(
          "UPDATE players SET score = 0, status = CASE WHEN id = $1 THEN 'drawing' ELSE 'ready' END WHERE room_code = $2",
          [drawerId, normalizedCode]
        );

        await client.query('COMMIT');
        break;
      }

      case 'draw-canvas': {
        const { canvasData } = payload;
        await client.query(
          'UPDATE game_rooms SET canvas_data = $1 WHERE room_code = $2 AND current_drawer_id = $3',
          [canvasData, normalizedCode, playerId]
        );
        break;
      }

      case 'draw-ai': {
        const { aiImageUrl } = payload;
        await client.query(
          'UPDATE game_rooms SET ai_image_url = $1 WHERE room_code = $2 AND current_drawer_id = $3',
          [aiImageUrl, normalizedCode, playerId]
        );
        break;
      }

      case 'guess-correct': {
        const { addScore } = payload;
        
        await client.query('BEGIN');

        // 플레이어 점수 가산 및 정답 상태 업데이트
        await client.query(
          "UPDATE players SET score = score + $1, status = 'correct' WHERE id = $2 AND room_code = $3",
          [addScore || 100, playerId, normalizedCode]
        );

        // 출제자 보너스 포인트 가산 제거됨 (그리는 사람에게 포인트 주지 않음)

        await client.query('COMMIT');
        break;
      }

      case 'guess': {
        const { guess } = payload;
        
        // 1. 방의 현재 제시어 및 진행 정보 조회
        const roomRes = await client.query(
          'SELECT current_keyword, current_drawer_id, current_round, max_round FROM game_rooms WHERE room_code = $1',
          [normalizedCode]
        );
        if (roomRes.rows.length === 0) {
          await client.end();
          return NextResponse.json({ error: '방 정보가 없습니다.' }, { status: 404 });
        }
        
        const { current_keyword, current_drawer_id, current_round, max_round } = roomRes.rows[0];
        
        // 2. 정답 판단
        const normalize = (txt) => txt ? txt.toLowerCase().replace(/[^a-zA-Z0-9가-힣]/g, '') : '';
        const isCorrect = normalize(guess) === normalize(current_keyword);
        
        if (isCorrect) {
          // 이미 정답을 맞춘 상태인지 확인 (중복 가산 방지)
          const meRes = await client.query('SELECT status FROM players WHERE id = $1', [playerId]);
          if (meRes.rows.length > 0 && meRes.rows[0].status !== 'correct') {
            await client.query('BEGIN');

            // 현재까지 정답을 맞춘 플레이어 수 조회 (차등 득점 계산용)
            const countRes = await client.query(
              "SELECT COUNT(*) as count FROM players WHERE room_code = $1 AND status = 'correct'",
              [normalizedCode]
            );
            const correctCount = parseInt(countRes.rows[0].count, 10);

            let addScore = 100;
            if (correctCount === 1) addScore = 80;
            else if (correctCount === 2) addScore = 60;
            else if (correctCount === 3) addScore = 40;
            else if (correctCount >= 4) addScore = 20;
            
            // 본인 점수 가산 및 정답 상태 업데이트
            await client.query(
              "UPDATE players SET score = score + $1, status = 'correct' WHERE id = $2",
              [addScore, playerId]
            );
            
            // 챗 로그에도 정답 알림 기록 추가 (다른 유저 피드 동기화용)
            await client.query(
              "INSERT INTO chat_messages (room_code, player_id, nickname, message, type) VALUES ($1, $2, $3, $4, 'system-msg')",
              [normalizedCode, playerId, player.nickname, `🎉 ${player.nickname}님이 정답을 맞혔습니다! (+${addScore} pts)`]
            );

            // --- 전원 정답 여부 실시간 검증 및 라운드 강제 강등/종료 ---
            // 출제자를 제외하고 활성화된(is_active = true) 플레이어 수
            const totalGuesserRes = await client.query(
              "SELECT COUNT(*) as count FROM players WHERE room_code = $1 AND id != $2 AND is_active = TRUE",
              [normalizedCode, current_drawer_id]
            );
            const totalGuesserCount = parseInt(totalGuesserRes.rows[0].count, 10);

            // 출제자를 제외하고 활성화된 플레이어 중 정답을 맞춘(status = 'correct') 플레이어 수
            const correctGuesserRes = await client.query(
              "SELECT COUNT(*) as count FROM players WHERE room_code = $1 AND id != $2 AND is_active = TRUE AND status = 'correct'",
              [normalizedCode, current_drawer_id]
            );
            const correctGuesserCount = parseInt(correctGuesserRes.rows[0].count, 10);

            if (totalGuesserCount > 0 && correctGuesserCount === totalGuesserCount) {
              await client.query(
                "INSERT INTO chat_messages (room_code, player_id, nickname, message, type) VALUES ($1, 'system', 'System', '⚡ 모든 참여자가 정답을 맞혔습니다! 다음 라운드로 이동합니다.', 'system-msg')",
                [normalizedCode]
              );

              if (current_round < max_round) {
                // 1) 다음 라운드 처리 진행
                let nextKeyword = '계란 후라이';
                try {
                  const wordRes = await client.query('SELECT word FROM word_list ORDER BY RANDOM() LIMIT 1');
                  if (wordRes.rows.length > 0) {
                    nextKeyword = wordRes.rows[0].word;
                  } else {
                    const fallbackShuffled = [...DEFAULT_FALLBACK_WORDS].sort(() => 0.5 - Math.random());
                    nextKeyword = fallbackShuffled[0];
                  }
                } catch (e) {
                  const fallbackShuffled = [...DEFAULT_FALLBACK_WORDS].sort(() => 0.5 - Math.random());
                  nextKeyword = fallbackShuffled[0];
                }

                const nextRound = current_round + 1;
                // 다음 라운드 출제자 결정 (봇은 제외)
                const playersRes = await client.query("SELECT id FROM players WHERE room_code = $1 AND id NOT LIKE 'BOT-%' ORDER BY nickname ASC", [normalizedCode]);
                const playerIds = playersRes.rows.map(p => p.id);
                const drawerIndex = (nextRound - 1) % playerIds.length;
                const drawerId = playerIds[drawerIndex];

                await client.query(
                  'UPDATE game_rooms SET current_round = $1, current_keyword = $2, current_drawer_id = $3, canvas_data = $4, ai_image_url = $5 WHERE room_code = $6',
                  [nextRound, nextKeyword, drawerId, '', '', normalizedCode]
                );

                await client.query(
                  "UPDATE players SET status = CASE WHEN id = $1 THEN 'drawing' ELSE 'ready' END WHERE room_code = $2",
                  [drawerId, normalizedCode]
                );
              } else {
                // 2) 게임 오버 처리
                await client.query(
                  "UPDATE game_rooms SET status = 'result' WHERE room_code = $1",
                  [normalizedCode]
                );
                await client.query(
                  "INSERT INTO chat_messages (room_code, player_id, nickname, message, type) VALUES ($1, 'system', 'System', '🏆 게임이 완전히 끝났습니다! 최종 스코어가 기록됩니다.', 'system-msg')",
                  [normalizedCode]
                );
                // 최고 득점자에게 방장 자동 위임
                await assignNewHostByScore(client, normalizedCode);
              }
            }
            
            await client.query('COMMIT');
          }
        }
        
        await client.end();
        return NextResponse.json({
          success: true,
          isCorrect,
          keyword: isCorrect ? current_keyword : ''
        });
      }

      case 'reveal-answer': {
        if (!player.is_host) {
          await client.end();
          return NextResponse.json({ error: '방장만 정답을 공개할 수 있습니다.' }, { status: 403 });
        }

        const roomRes = await client.query('SELECT current_keyword FROM game_rooms WHERE room_code = $1', [normalizedCode]);
        const oldKeyword = roomRes.rows[0]?.current_keyword || '';

        if (oldKeyword) {
          await client.query(
            "INSERT INTO chat_messages (room_code, player_id, nickname, message, type) VALUES ($1, $2, $3, $4, 'system-msg')",
            [normalizedCode, 'system', 'System', `📢 이번 라운드 정답은 [${oldKeyword}] 이었습니다!`]
          );
        }
        break;
      }

      case 'next-round': {
        if (!player.is_host) {
          await client.end();
          return NextResponse.json({ error: '방장만 다음 라운드를 시작할 수 있습니다.' }, { status: 403 });
        }

        const { nextRound, keyword } = payload;

        // 다음 라운드 출제자 결정 (봇은 제외)
        const playersRes = await client.query("SELECT id FROM players WHERE room_code = $1 AND id NOT LIKE 'BOT-%' ORDER BY nickname ASC", [normalizedCode]);
        const playerIds = playersRes.rows.map(p => p.id);
        
        // 현재 라운드 번호에 따라 출제자를 순환하며 지정
        const drawerIndex = (nextRound - 1) % playerIds.length;
        const drawerId = playerIds[drawerIndex];

        await client.query('BEGIN');

        await client.query(
          'UPDATE game_rooms SET current_round = $1, current_keyword = $2, current_drawer_id = $3, canvas_data = $4, ai_image_url = $5 WHERE room_code = $6',
          [nextRound, keyword, drawerId, '', '', normalizedCode]
        );

        // 플레이어들 상태 갱신
        await client.query(
          "UPDATE players SET status = CASE WHEN id = $1 THEN 'drawing' ELSE 'ready' END WHERE room_code = $2",
          [drawerId, normalizedCode]
        );

        await client.query('COMMIT');
        break;
      }

      case 'game-over': {
        if (!player.is_host) {
          await client.end();
          return NextResponse.json({ error: '방장만 게임을 종료할 수 있습니다.' }, { status: 403 });
        }

        await client.query('BEGIN');

        await client.query(
          "UPDATE game_rooms SET status = 'result' WHERE room_code = $1",
          [normalizedCode]
        );

        await client.query(
          "INSERT INTO chat_messages (room_code, player_id, nickname, message, type) VALUES ($1, 'system', 'System', '🏆 게임이 완전히 끝났습니다! 최종 스코어가 기록됩니다.', 'system-msg')",
          [normalizedCode]
        );

        // 최고 득점자에게 방장 자동 위임
        await assignNewHostByScore(client, normalizedCode);

        await client.query('COMMIT');
        break;
      }

      case 'go-lobby': {
        await client.query('BEGIN');

        // 방 상태를 대기실로 초기화
        await client.query(
          "UPDATE game_rooms SET status = 'waiting', current_round = 1, current_keyword = '', current_drawer_id = '', canvas_data = '', ai_image_url = '' WHERE room_code = $1",
          [normalizedCode]
        );

        // 플레이어들의 점수 및 상태 초기화
        // 방장은 ready, 일반 참가자들은 waiting으로 설정
        await client.query(
          "UPDATE players SET score = 0, status = CASE WHEN is_host = TRUE THEN 'ready' ELSE 'waiting' END WHERE room_code = $1",
          [normalizedCode]
        );

        // 비활성 유저 완전 퇴장 정리
        await client.query(
          "DELETE FROM players WHERE room_code = $1 AND is_active = FALSE",
          [normalizedCode]
        );

        await client.query('COMMIT');
        break;
      }

      case 'toggle-ready': {
        // 준비 상태 토글
        await client.query(
          "UPDATE players SET status = CASE WHEN status = 'ready' THEN 'waiting' ELSE 'ready' END WHERE id = $1 AND room_code = $2",
          [playerId, normalizedCode]
        );
        break;
      }

      case 'kick-player': {
        if (!player.is_host) {
          await client.end();
          return NextResponse.json({ error: '방장만 강퇴할 수 있습니다.' }, { status: 403 });
        }

        const { targetPlayerId } = payload;
        if (!targetPlayerId) {
          await client.end();
          return NextResponse.json({ error: '강퇴 대상 플레이어 ID가 유효하지 않습니다.' }, { status: 400 });
        }

        // 강퇴 대상 플레이어가 해당 방에 실제로 존재하는지 확인
        const targetCheck = await client.query(
          'SELECT nickname FROM players WHERE id = $1 AND room_code = $2 AND is_active = TRUE',
          [targetPlayerId, normalizedCode]
        );

        if (targetCheck.rows.length === 0) {
          await client.end();
          return NextResponse.json({ error: '대상 플레이어가 존재하지 않거나 이미 방을 나갔습니다.' }, { status: 404 });
        }

        const targetNickname = targetCheck.rows[0].nickname;

        await client.query('BEGIN');

        if (targetPlayerId.startsWith('BOT-')) {
          // 봇인 경우: 바로 players 테이블에서 제거하여 영속성 소멸
          await client.query(
            'DELETE FROM players WHERE id = $1 AND room_code = $2',
            [targetPlayerId, normalizedCode]
          );
        } else {
          // 실제 유저인 경우: status = 'kicked', is_active = FALSE 처리 (이후 폴링에서 감지하도록 유도)
          await client.query(
            "UPDATE players SET status = 'kicked', is_active = FALSE WHERE id = $1 AND room_code = $2",
            [targetPlayerId, normalizedCode]
          );
        }

        // 시스템 메시지로 대기실 전체에 강퇴 소식 전파
        await client.query(
          "INSERT INTO chat_messages (room_code, player_id, nickname, message, type) VALUES ($1, 'system', 'System', $2, 'system-msg')",
          [normalizedCode, `🚫 ${targetNickname}님이 방장에 의해 강퇴당했습니다.`]
        );

        await client.query('COMMIT');
        break;
      }

      case 'transfer-host': {
        if (!player.is_host) {
          await client.end();
          return NextResponse.json({ error: '방장만 방장 권한을 넘길 수 있습니다.' }, { status: 403 });
        }

        const { targetPlayerId } = payload;
        if (!targetPlayerId) {
          await client.end();
          return NextResponse.json({ error: '위임 대상 플레이어 ID가 유효하지 않습니다.' }, { status: 400 });
        }

        if (targetPlayerId === playerId) {
          await client.end();
          return NextResponse.json({ error: '자기 자신에게는 방장을 넘길 수 없습니다.' }, { status: 400 });
        }

        if (targetPlayerId.startsWith('BOT-')) {
          await client.end();
          return NextResponse.json({ error: '봇에게는 방장을 넘길 수 없습니다.' }, { status: 400 });
        }

        // 위임 대상 플레이어가 해당 방에 실제로 존재하는지 확인
        const targetCheck = await client.query(
          'SELECT nickname FROM players WHERE id = $1 AND room_code = $2 AND is_active = TRUE',
          [targetPlayerId, normalizedCode]
        );

        if (targetCheck.rows.length === 0) {
          await client.end();
          return NextResponse.json({ error: '대상 플레이어가 존재하지 않거나 이미 방을 나갔습니다.' }, { status: 404 });
        }

        const targetNickname = targetCheck.rows[0].nickname;

        await client.query('BEGIN');

        await client.query("UPDATE players SET is_host = FALSE WHERE room_code = $1", [normalizedCode]);
        await client.query("UPDATE players SET is_host = TRUE WHERE id = $1 AND room_code = $2", [targetPlayerId, normalizedCode]);

        await client.query(
          "INSERT INTO chat_messages (room_code, player_id, nickname, message, type) VALUES ($1, 'system', 'System', $2, 'system-msg')",
          [normalizedCode, `👑 ${targetNickname}님이 새로운 방장이 되었습니다.`]
        );

        await client.query('COMMIT');
        break;
      }

      default:
        await client.end();
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    await client.end();
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error(`Failed to handle action ${request.body?.action}:`, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
