import { NextResponse } from 'next/server';
import pg from 'pg';

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
      case 'start-game': {
        if (!player.is_host) {
          await client.end();
          return NextResponse.json({ error: '방장만 게임을 시작할 수 있습니다.' }, { status: 403 });
        }

        const { maxRound, keyword } = payload;
        
        // 무작위로 첫 출제자(drawer) 지정
        const playersRes = await client.query('SELECT id FROM players WHERE room_code = $1', [normalizedCode]);
        const drawerId = playersRes.rows[Math.floor(Math.random() * playersRes.rows.length)].id;

        await client.query('BEGIN');
        
        // 방 상태를 게임중으로 업데이트하고 키워드, 출제자 정보 세팅
        await client.query(
          'UPDATE game_rooms SET status = $1, current_round = 1, max_round = $2, current_keyword = $3, current_drawer_id = $4, canvas_data = $5, ai_image_url = $6 WHERE room_code = $7',
          ['game', maxRound || 5, keyword, drawerId, '', '', normalizedCode]
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

        // 정답을 맞춘 플레이어가 있으면, 출제자(drawer)에게도 보너스 점수 가산 (+50점)
        const roomRes = await client.query('SELECT current_drawer_id FROM game_rooms WHERE room_code = $1', [normalizedCode]);
        if (roomRes.rows.length > 0) {
          const drawerId = roomRes.rows[0].current_drawer_id;
          if (drawerId && drawerId !== playerId) {
            await client.query(
              'UPDATE players SET score = score + 50 WHERE id = $1 AND room_code = $2',
              [drawerId, normalizedCode]
            );
          }
        }

        await client.query('COMMIT');
        break;
      }

      case 'guess': {
        const { guess } = payload;
        
        // 1. 방의 현재 제시어 조회
        const roomRes = await client.query(
          'SELECT current_keyword, current_drawer_id FROM game_rooms WHERE room_code = $1',
          [normalizedCode]
        );
        if (roomRes.rows.length === 0) {
          await client.end();
          return NextResponse.json({ error: '방 정보가 없습니다.' }, { status: 404 });
        }
        
        const { current_keyword, current_drawer_id } = roomRes.rows[0];
        
        // 2. 정답 판단
        const normalize = (txt) => txt ? txt.toLowerCase().replace(/[^a-zA-Z0-9가-힣]/g, '') : '';
        const isCorrect = normalize(guess) === normalize(current_keyword);
        
        if (isCorrect) {
          // 이미 정답을 맞춘 상태인지 확인 (중복 가산 방지)
          const meRes = await client.query('SELECT status FROM players WHERE id = $1', [playerId]);
          if (meRes.rows.length > 0 && meRes.rows[0].status !== 'correct') {
            await client.query('BEGIN');
            
            // 본인 점수 가산 및 정답 상태 업데이트
            await client.query(
              "UPDATE players SET score = score + 100, status = 'correct' WHERE id = $1",
              [playerId]
            );
            
            // 출제자에게도 보너스 점수 가산 (+50점)
            if (current_drawer_id && current_drawer_id !== playerId) {
              await client.query(
                'UPDATE players SET score = score + 50 WHERE id = $1',
                [current_drawer_id]
              );
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

      case 'next-round': {
        if (!player.is_host) {
          await client.end();
          return NextResponse.json({ error: '방장만 다음 라운드를 시작할 수 있습니다.' }, { status: 403 });
        }

        const { nextRound, keyword } = payload;

        // 다음 라운드 출제자 결정
        const playersRes = await client.query('SELECT id FROM players WHERE room_code = $1 ORDER BY nickname ASC', [normalizedCode]);
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

        await client.query(
          "UPDATE game_rooms SET status = 'result' WHERE room_code = $1",
          [normalizedCode]
        );
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
        await client.query(
          "UPDATE players SET score = 0, status = 'ready' WHERE room_code = $1",
          [normalizedCode]
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
