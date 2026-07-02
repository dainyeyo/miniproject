/**
 * EGGG - AI Drawing Quiz Game
 * Neon DB 멀티플레이어 테이블 마이그레이션 스크립트
 */

const { Client } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('\x1b[31m[오류] DATABASE_URL 환경 변수가 설정되지 않았습니다.\x1b[0m');
  console.error('로컬에 .env 파일을 만들고 Neon DB 연결 문자열을 입력해주세요.');
  console.error('예: DATABASE_URL=postgresql://user:password@project-id.neon.tech/dbname?sslmode=require');
  process.exit(1);
}

async function runMigration() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Neon DB 연결 성공. 테이블 생성 시작...');

    await client.query('BEGIN');

    // 1. game_rooms 테이블 생성
    console.log('1. game_rooms 테이블 생성 중...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_rooms (
        room_code VARCHAR(10) PRIMARY KEY,
        status VARCHAR(20) DEFAULT 'waiting',
        game_mode VARCHAR(20) DEFAULT 'human',
        current_round INT DEFAULT 1,
        max_round INT DEFAULT 5,
        round_time INT DEFAULT 45,
        current_keyword VARCHAR(100) DEFAULT '',
        current_drawer_id VARCHAR(50) DEFAULT '',
        canvas_data TEXT DEFAULT '',
        ai_image_url TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. players 테이블 생성
    console.log('2. players 테이블 생성 중...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id VARCHAR(50) PRIMARY KEY,
        room_code VARCHAR(10) REFERENCES game_rooms(room_code) ON DELETE CASCADE,
        nickname VARCHAR(50) NOT NULL,
        avatar VARCHAR(10) NOT NULL,
        score INT DEFAULT 0,
        is_host BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'ready',
        last_active TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN DEFAULT TRUE
      );
    `);

    // 인덱스 설정
    console.log('3. 성능 탐색 최적화를 위한 인덱스 생성 중...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_players_room_code ON players(room_code);');

    // 4. chat_messages 테이블 생성
    console.log('4. chat_messages 테이블 생성 중...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        room_code VARCHAR(10) NOT NULL,
        player_id VARCHAR(50) NOT NULL,
        nickname VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'chat',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_chat_room_code ON chat_messages(room_code);');

    await client.query('COMMIT');
    console.log('\x1b[32m[성공] 멀티플레이어 테이블 마이그레이션이 완료되었습니다!\x1b[0m');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\x1b[31m[오류] 테이블 생성 실패 및 트랜잭션 롤백:\x1b[0m', error);
  } finally {
    await client.end();
    console.log('DB 연결 안전하게 종료.');
  }
}

runMigration();
