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
    console.log('Neon DB 연결 성공. game_mode 컬럼 추가 시도...');

    // 1. game_rooms 테이블에 game_mode 컬럼 추가
    await client.query(`
      ALTER TABLE game_rooms 
      ADD COLUMN IF NOT EXISTS game_mode VARCHAR(20) DEFAULT 'human';
    `);

    console.log('[성공] game_rooms 테이블에 game_mode 컬럼이 추가되었습니다.');
  } catch (error) {
    console.error('[오류] 컬럼 추가 실패:', error);
  } finally {
    await client.end();
  }
}

run();
