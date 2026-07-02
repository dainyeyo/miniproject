import { NextResponse } from 'next/server';
import pg from 'pg';

export async function GET(request) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const roomCode = searchParams.get('roomCode');
  const playerId = searchParams.get('playerId');

  if (!roomCode) {
    return NextResponse.json({ error: 'Room code is required.' }, { status: 400 });
  }

  const normalizedCode = roomCode.trim().toUpperCase();

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // 1. 하트비트: 호출한 플레이어의 활성 시간 갱신
    if (playerId) {
      // 강퇴 상태('kicked') 여부 검증
      const checkKicked = await client.query(
        'SELECT status FROM players WHERE id = $1 AND room_code = $2',
        [playerId, normalizedCode]
      );
      if (checkKicked.rows.length > 0 && checkKicked.rows[0].status === 'kicked') {
        // 클라이언트 감지 즉시 DB에서 물리 삭제하여 자원 반환
        await client.query('DELETE FROM players WHERE id = $1 AND room_code = $2', [playerId, normalizedCode]);
        await client.end();
        return NextResponse.json({ kicked: true, error: '강퇴당하였습니다.' }, { status: 403 });
      }

      await client.query('UPDATE players SET last_active = NOW() WHERE id = $1 AND room_code = $2', [playerId, normalizedCode]);
    }

    // 2. 비활성 유저 처리 (12초 이상 무응답 시, 봇은 제외)
    // 대기실(waiting)에서는 DB에서 즉시 삭제
    await client.query(
      "DELETE FROM players WHERE last_active < NOW() - INTERVAL '12 seconds' AND id NOT LIKE 'BOT-%' AND room_code IN (SELECT room_code FROM game_rooms WHERE status = 'waiting')"
    );
    // 게임중(game) 혹은 결과창(result)에서는 퇴장 처리하되 DB의 점수 랭킹 보존을 위해 is_active = false 처리
    await client.query(
      "UPDATE players SET is_active = FALSE WHERE last_active < NOW() - INTERVAL '12 seconds' AND id NOT LIKE 'BOT-%' AND is_active = TRUE AND room_code IN (SELECT room_code FROM game_rooms WHERE status != 'waiting')"
    );

    // 3. 만약 방에 활성 플레이어(is_active = true)가 한 명도 없다면 방 삭제 및 해당 방의 모든 플레이어 정보 제거 (봇은 카운트에서 제외)
    const activeCountRes = await client.query(
      "SELECT COUNT(*) as count FROM players WHERE room_code = $1 AND is_active = TRUE AND id NOT LIKE 'BOT-%'",
      [normalizedCode]
    );
    const activeCount = parseInt(activeCountRes.rows[0].count, 10);

    if (activeCount === 0) {
      await client.query("DELETE FROM players WHERE room_code = $1", [normalizedCode]);
      await client.query("DELETE FROM game_rooms WHERE room_code = $1", [normalizedCode]);
      await client.end();
      return NextResponse.json({ error: '방이 존재하지 않거나 만료되었습니다.' }, { status: 404 });
    }

    // 4. 방 정보 조회
    const roomRes = await client.query(
      'SELECT room_code, status, game_mode, current_round, max_round, round_time, max_players, current_keyword, current_drawer_id, canvas_data, ai_image_url FROM game_rooms WHERE room_code = $1',
      [normalizedCode]
    );

    if (roomRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: '방이 존재하지 않거나 만료되었습니다.' }, { status: 404 });
    }

    const room = roomRes.rows[0];
    
    // 보안: 출제자(drawer)이거나 결과 화면(result)인 경우에만 키워드 노출
    const amIDrawer = room.current_drawer_id === playerId;
    if (!amIDrawer && room.status !== 'result') {
      room.current_keyword = ''; // 비출제자에게는 키워드를 숨김
    }

    // 5. 현재 대기 중인 모든 플레이어 목록 조회
    const selectFields = 'id, nickname, avatar, score, is_host, status, is_active';
    let playersRes;
    if (room.status === 'result') {
      // 결과 화면에서는 나간 유저도 순위에 포함
      playersRes = await client.query(
        `SELECT ${selectFields} FROM players WHERE room_code = $1 ORDER BY score DESC, nickname ASC`,
        [normalizedCode]
      );
    } else {
      // 대기방/게임 중에는 현재 접속한(is_active = true) 플레이어만 필터링
      playersRes = await client.query(
        `SELECT ${selectFields} FROM players WHERE room_code = $1 AND is_active = TRUE ORDER BY is_host DESC, nickname ASC`,
        [normalizedCode]
      );
    }

    let players = playersRes.rows;

    // 6. 만약 방장(Host)이 지워졌거나 비활성화되었다면, 남아있는 가장 첫 번째 활성 플레이어를 방장으로 지정 (봇은 방장 위임에서 제외)
    if (room.status !== 'result') {
      const hasHost = players.some(p => p.is_host && p.is_active);
      if (!hasHost && players.length > 0) {
        const humanPlayers = players.filter(p => !p.id.startsWith('BOT-'));
        if (humanPlayers.length > 0) {
          const newHostId = humanPlayers[0].id;
          await client.query('UPDATE players SET is_host = true WHERE id = $1', [newHostId]);
          const targetPlayer = players.find(p => p.id === newHostId);
          if (targetPlayer) targetPlayer.is_host = true;
        }
      }
    }

    await client.end();

    return NextResponse.json({
      success: true,
      room: roomRes.rows[0],
      players
    });

  } catch (error) {
    console.error('Failed to query status:', error);
    try {
      await client.end();
    } catch (e) {}
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
