import { NextResponse } from 'next/server';
import pg from 'pg';
import crypto from 'crypto';

export async function POST(request) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured.' }, { status: 500 });
  }

  try {
    const { roomCode, nickname, avatar } = await request.json();
    if (!roomCode || !nickname) {
      return NextResponse.json({ error: 'Room code and nickname are required.' }, { status: 400 });
    }

    const normalizedCode = roomCode.trim().toUpperCase();

    const client = new pg.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    // 1. 방 존재 여부 및 상태 확인
    const roomRes = await client.query('SELECT room_code, status, max_players FROM game_rooms WHERE room_code = $1', [normalizedCode]);
    if (roomRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: '존재하지 않는 방입니다.' }, { status: 404 });
    }

    const room = roomRes.rows[0];
    if (room.status !== 'waiting') {
      await client.end();
      return NextResponse.json({ error: '이미 게임이 진행 중이거나 종료된 방입니다.' }, { status: 400 });
    }

    // 2. 방 최대 인원 확인
    const maxPlayers = room.max_players || 6;
    const playersCountRes = await client.query('SELECT COUNT(*) FROM players WHERE room_code = $1', [normalizedCode]);
    const playerCount = parseInt(playersCountRes.rows[0].count, 10);
    if (playerCount >= maxPlayers) {
      await client.end();
      return NextResponse.json({ error: `방이 이미 가득 찼습니다. (최대 ${maxPlayers}명)` }, { status: 400 });
    }

    // 3. 플레이어 등록
    const playerId = crypto.randomUUID();
    await client.query(
      'INSERT INTO players (id, room_code, nickname, avatar, score, is_host, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [playerId, normalizedCode, nickname, avatar || '🐥', 0, false, 'waiting']
    );

    // 4. 입장 후 전체 플레이어 정보 리턴
    const playersRes = await client.query(
      'SELECT id, nickname, avatar, score, is_host, status FROM players WHERE room_code = $1',
      [normalizedCode]
    );

    await client.end();

    return NextResponse.json({
      success: true,
      roomCode: normalizedCode,
      playerId,
      players: playersRes.rows
    });

  } catch (error) {
    console.error('Failed to join room:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
