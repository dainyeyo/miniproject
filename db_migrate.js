/**
 * EGGG - AI Drawing Quiz Game
 * Neon DB 단어 데이터 정규화 및 마이그레이션 스크립트
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

// 1. 방어적 프로그래밍: 환경 변수 무결성 검증 (Validation)
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || databaseUrl.includes('your_neon_connection_string_here')) {
  console.error('\x1b[31m[오류] DATABASE_URL 환경 변수가 올바르게 설정되지 않았습니다.');
  console.error('.env 파일에서 실제 Neon DB Connection String으로 변경 후 재실행해주세요.\x1b[0m');
  process.exit(1);
}

// 마이그레이션 메인 비즈니스 로직 함수 (SRP 준수)
async function runMigration() {
  const csvFilePath = path.join(__dirname, 'words_sorted.csv');
  
  // 2. CSV 파일 데이터 적재 및 정제 (Parsing & Cleaning)
  if (!fs.existsSync(csvFilePath)) {
    console.error(`\x1b[31m[오류] 단어 파일('${csvFilePath}')이 존재하지 않습니다.\x1b[0m`);
    process.exit(1);
  }

  console.log('1. CSV 파일 분석 중...');
  const rawData = fs.readFileSync(csvFilePath, 'utf-8');
  
  // CSV 파일 행 단위 파싱 (첫 행은 헤더 'id,word,category,difficulty')
  const lines = rawData.split(/\r?\n/);
  const rawWords = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length > 1) {
      rawWords.push(cols[1].trim()); // 두 번째 열 (word) 추출
    }
  }
  
  const uniqueWords = [...new Set(rawWords)].filter(word => word.length > 0);

  console.log(`총 ${rawWords.length}개의 가공 전 단어 식별.`);
  console.log(`중복 및 빈 값을 정제한 최종 단어 수: ${uniqueWords.length}개.`);

  // 3. PostgreSQL(Neon) DB 연결 수립
  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false // Neon DB의 SSL 인증 보안 요구 사양 지원
    }
  });

  try {
    await client.connect();
    console.log('2. Neon DB 연결 성공. 트랜잭션 수립 중...');

    // 4. 스키마 정규화 및 리셋 (DDL 실행)
    // 트랜잭션 내에서 일괄 처리하여 원자성(Atomicity) 보장
    await client.query('BEGIN');

    console.log('3. 기존 단어 테이블 삭제 중 (DROP)...');
    await client.query('DROP TABLE IF EXISTS word_list CASCADE;');

    console.log('4. 정규화된 새 word_list 테이블 생성 중 (CREATE)...');
    await client.query(`
      CREATE TABLE word_list (
        id SERIAL PRIMARY KEY,
        word VARCHAR(100) NOT NULL UNIQUE,
        length INT NOT NULL
      );
    `);

    // 단어 길이(length)를 조건으로 삼아 빠른 인덱싱 탐색을 수행하도록 보조 인덱스 설정
    console.log('5. 탐색 성능 최적화를 위한 인덱스 생성 중 (CREATE INDEX)...');
    await client.query('CREATE INDEX idx_word_length ON word_list(length);');

    // 5. Bulk Insert 최적화
    // 많은 수의 단어를 하나씩 INSERT하면 RTT(Round Trip Time) 비용이 막대하므로, Bulk Insert 처리
    // PostgreSQL 파라미터 개수 한계(65535)를 초과하지 않도록 청크(Chunk) 단위로 분할하여 실행 (시간복잡도 및 자원 최적화)
    console.log('6. 정제된 단어 데이터베이스 적재 시작 (Bulk Insert)...');
    const chunkSize = 500;
    for (let i = 0; i < uniqueWords.length; i += chunkSize) {
      const chunk = uniqueWords.slice(i, i + chunkSize);
      
      // SQL 쿼리 빌딩: INSERT INTO word_list (word, length) VALUES ($1, $2), ($3, $4), ...
      const valueStrings = [];
      const valueParams = [];
      
      chunk.forEach((word, idx) => {
        const paramWordIdx = idx * 2 + 1;
        const paramLengthIdx = idx * 2 + 2;
        valueStrings.push(`($${paramWordIdx}, $${paramLengthIdx})`);
        valueParams.push(word, word.length);
      });

      const insertQuery = `
        INSERT INTO word_list (word, length) 
        VALUES ${valueStrings.join(', ')}
        ON CONFLICT (word) DO NOTHING;
      `;

      await client.query(insertQuery, valueParams);
      console.log(`   - 마이그레이션 진행도: ${Math.min(i + chunkSize, uniqueWords.length)} / ${uniqueWords.length} 완료`);
    }

    // 트랜잭션 정상 종료에 따른 최종 반영(Commit)
    await client.query('COMMIT');
    console.log('\x1b[32m[성공] Neon DB 단어 데이터 마이그레이션이 완료되었습니다!\x1b[0m');

    // 검증: 실제 적재된 행 개수 쿼리 실행
    const res = await client.query('SELECT COUNT(*) FROM word_list;');
    console.log(`[확인] DB에 적재된 최종 단어 개수: ${res.rows[0].count}개`);

    // 6. 정적 자바스크립트 전역 변수 파일(words.js)로 추출하여 캐싱
    console.log('8. DB에서 단어 목록 로드 및 words.js 빌드 중...');
    const wordsRes = await client.query('SELECT word FROM word_list ORDER BY word ASC;');
    const wordList = wordsRes.rows.map(row => row.word);
    
    const wordsJsContent = `/**
 * EGGG - AI Drawing Quiz Game
 * Neon DB로부터 추출된 정적 단어 캐시 파일
 * 빌드 타임: ${new Date().toISOString()}
 */

const EGGG_WORDS = ${JSON.stringify(wordList, null, 2)};
`;
    
    fs.writeFileSync(path.join(__dirname, 'words.js'), wordsJsContent, 'utf-8');
    console.log('\x1b[32m[성공] words.js 파일이 성공적으로 빌드되었습니다.\x1b[0m');


  } catch (error) {
    // 예외 발생 시 전 상태 롤백을 통한 데이터 일관성(Consistency) 유지
    await client.query('ROLLBACK');
    console.error('\x1b[31m[오류] 마이그레이션 중 오류가 발생하여 트랜잭션이 롤백되었습니다:\x1b[0m', error);
  } finally {
    // 데이터베이스 커넥션 풀 자원 반환
    await client.end();
    console.log('7. DB 연결 안전하게 종료.');
  }
}

// 스크립트 실행 시작
runMigration();
