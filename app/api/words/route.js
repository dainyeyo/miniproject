import { NextResponse } from 'next/server';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  
  // 1. Neon DB 연결 시도
  if (dbUrl) {
    const client = new pg.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false } // Neon DB SSL 필수
    });
    
    try {
      await client.connect();
      // DB에서 150개의 무작위 단어를 동적으로 호출
      const res = await client.query('SELECT word FROM word_list ORDER BY RANDOM() LIMIT 150');
      await client.end();
      
      const words = res.rows.map(row => row.word);
      if (words.length > 0) {
        return NextResponse.json({ source: 'neon-db', words });
      }
    } catch (dbError) {
      console.error('Neon DB Query Failed, falling back to CSV:', dbError);
      try {
        await client.end();
      } catch (e) {}
    }
  }

  // 2. 로컬 words_sorted.csv 파일 기반 폴백 공급 (Neon DB 미지정/오류 대응)
  try {
    const csvPath = path.join(process.cwd(), 'words_sorted.csv');
    if (fs.existsSync(csvPath)) {
      const data = fs.readFileSync(csvPath, 'utf8');
      const lines = data.split(/\r?\n/);
      const words = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',');
        if (cols.length > 1) {
          words.push(cols[1].trim()); // 두 번째 열 (word) 추출
        }
      }
      
      // 150개 단어 무작위 셔플 추출
      const shuffled = words.sort(() => 0.5 - Math.random()).slice(0, 150);
      return NextResponse.json({ source: 'local-csv', words: shuffled });
    }
  } catch (csvError) {
    console.error('Fallback CSV parsing failed:', csvError);
  }

  // 3. 최후의 기본 배열 폴백 공급 (방어적 프로그래밍)
  const defaultFallback = ['계란 후라이', '달걀말이', '오므라이스', '닭고기', '병아리', '달걀껍질', '둥지'];
  return NextResponse.json({ source: 'default-fallback', words: defaultFallback });
}
