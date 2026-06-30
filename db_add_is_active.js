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
    console.log('Neon DB 연결 성공. players 테이블에 is_active 컬럼 추가 시도...');

    // is_active 컬럼 추가
    await client.query(`
      ALTER TABLE players ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
    `);

    console.log('[성공] players 테이블에 is_active 컬럼이 성공적으로 추가되었습니다.');
  } catch (error) {
    console.error('[오류] 컬럼 추가 실패:', error);
  } finally {
    await client.end();
  }
}

run();
