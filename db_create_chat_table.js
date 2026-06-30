const { Client } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;

async function run() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Neon DB 연결 성공. chat_messages 테이블 생성 시도...');

    // chat_messages 테이블 생성
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

    // 인덱스 추가
    await client.query('CREATE INDEX IF NOT EXISTS idx_chat_room_code ON chat_messages(room_code);');

    console.log('[성공] chat_messages 테이블이 정상적으로 생성되었습니다.');
  } catch (error) {
    console.error('[오류] 테이블 생성 실패:', error);
  } finally {
    await client.end();
  }
}

run();
