import { NextResponse } from 'next/server';
import pg from 'pg';

export async function POST(request) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured.' }, { status: 500 });
  }

  try {
    const { roomCode, playerId, nickname, message, type } = await request.json();
    if (!roomCode || !playerId || !nickname || !message) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const normalizedCode = roomCode.trim().toUpperCase();

    const client = new pg.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    // 1. 플레이어 권한 확인
    const playerCheck = await client.query(
      'SELECT id FROM players WHERE id = $1 AND room_code = $2',
      [playerId, normalizedCode]
    );

    if (playerCheck.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: '권한이 없습니다. 해당 방의 멤버가 아닙니다.' }, { status: 403 });
    }

    // 2. 메시지 삽입
    await client.query(
      'INSERT INTO chat_messages (room_code, player_id, nickname, message, type) VALUES ($1, $2, $3, $4, $5)',
      [normalizedCode, playerId, nickname, message, type || 'chat']
    );

    await client.end();
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to post chat message:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const roomCode = searchParams.get('roomCode');
  const lastMsgId = parseInt(searchParams.get('lastMsgId') || '0', 10);

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

    // 성능 유지: 3분 이상 지난 오래된 채팅 자동 정리
    await client.query("DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '3 minutes'");

    // lastMsgId보다 큰 신규 메시지만 조회
    const res = await client.query(
      'SELECT id, player_id, nickname, message, type, created_at FROM chat_messages WHERE room_code = $1 AND id > $2 ORDER BY id ASC LIMIT 50',
      [normalizedCode, lastMsgId]
    );

    await client.end();

    return NextResponse.json({
      success: true,
      messages: res.rows
    });

  } catch (error) {
    console.error('Failed to query chat messages:', error);
    try {
      await client.end();
    } catch (e) {}
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
