import { NextResponse } from 'next/server';
import pg from 'pg';
import crypto from 'crypto';

export async function POST(request) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured.' }, { status: 500 });
  }

  try {
    const { nickname, avatar } = await request.json();
    if (!nickname) {
      return NextResponse.json({ error: 'Nickname is required.' }, { status: 400 });
    }

    const client = new pg.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    // 1. 중복되지 않는 EGGG-XXXX 형식 코드 생성
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let roomCode = '';
    let codeExists = true;

    while (codeExists) {
      const code = Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
      roomCode = `EGGG-${code}`;
      const res = await client.query('SELECT room_code FROM game_rooms WHERE room_code = $1', [roomCode]);
      if (res.rows.length === 0) {
        codeExists = false;
      }
    }

    // 2. 방 생성 및 방장 플레이어 등록 (트랜잭션)
    await client.query('BEGIN');

    await client.query(
      'INSERT INTO game_rooms (room_code, status) VALUES ($1, $2)',
      [roomCode, 'waiting']
    );

    const playerId = crypto.randomUUID();
    await client.query(
      'INSERT INTO players (id, room_code, nickname, avatar, score, is_host, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [playerId, roomCode, nickname, avatar || '🥚', 0, true, 'ready']
    );

    await client.query('COMMIT');
    await client.end();

    return NextResponse.json({
      success: true,
      roomCode,
      playerId,
      nickname,
      avatar: avatar || '🥚'
    });

  } catch (error) {
    console.error('Failed to create room:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
