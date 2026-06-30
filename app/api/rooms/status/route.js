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
      await client.query('UPDATE players SET last_active = NOW() WHERE id = $1 AND room_code = $2', [playerId, normalizedCode]);
    }

    // 2. 비활성 유저 정리 (12초 이상 무응답 시 자동 제거)
    await client.query("DELETE FROM players WHERE last_active < NOW() - INTERVAL '12 seconds'");

    // 3. 만약 방에 플레이어가 한 명도 없다면 방 삭제
    await client.query("DELETE FROM game_rooms WHERE room_code NOT IN (SELECT DISTINCT room_code FROM players)");

    // 4. 방 정보 조회
    const roomRes = await client.query(
      'SELECT room_code, status, current_round, max_round, current_keyword, current_drawer_id, canvas_data, ai_image_url FROM game_rooms WHERE room_code = $1',
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
    const playersRes = await client.query(
      'SELECT id, nickname, avatar, score, is_host, status FROM players WHERE room_code = $1 ORDER BY is_host DESC, nickname ASC',
      [normalizedCode]
    );

    // 6. 만약 방장(Host)이 지워졌다면(비활성화되어 탈퇴됨), 남아있는 가장 첫 번째 플레이어를 방장으로 지정
    let players = playersRes.rows;
    const hasHost = players.some(p => p.is_host);
    if (!hasHost && players.length > 0) {
      const newHostId = players[0].id;
      await client.query('UPDATE players SET is_host = true WHERE id = $1', [newHostId]);
      players[0].is_host = true;
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
