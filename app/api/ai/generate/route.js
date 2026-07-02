import { NextResponse } from 'next/server';

/**
 * 비공식 무료 구글 번역 API를 이용하여 한글 텍스트를 영문으로 변환합니다.
 */
async function translateKoreanToEnglish(text) {
  // 한글 문자가 포함되어 있는지 체크
  const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);
  if (!hasKorean) return text;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    if (data && data[0] && data[0][0] && data[0][0][0]) {
      return data[0][0][0];
    }
  } catch (error) {
    console.error('구글 번역 호출 실패:', error.message);
  }
  return text; // 번역 실패 시 원본 텍스트 반환
}

/**
 * 입력 프롬프트와 스타일 지시어를 정교하게 정렬하여 고품질 프롬프트를 구성합니다.
 */
function buildPrompt(keyword, style) {
  const styleMap = {
    cute: 'cute kawaii cartoon, pastel colors, simple line art',
    funny: 'funny cartoon style, exaggerated features, bright colors',
    abstract: 'abstract art, modern style, creative interpretation',
    detailed: 'detailed illustration, rich colors, high quality',
    sketch: 'pencil sketch style, black and white, rough lines'
  };

  const styleInstruction = styleMap[style] || styleMap.cute;
  return `${keyword}, ${styleInstruction}, white background, game art`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { prompt, steps, style } = body;

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ success: false, error: '프롬프트를 입력해주세요.' }, { status: 400 });
    }

    // 1. 한국어 -> 영어 자동 번역
    const translatedPrompt = await translateKoreanToEnglish(prompt);

    // 2. 스타일 접미사 바인딩
    const finalPrompt = buildPrompt(translatedPrompt, style);
    console.log(`🤖 [AI 프록시] 최종 영문 프롬프트: "${finalPrompt}"`);

    // 3. 노트북 로컬 AI 서버 (localhost:8000) 통신 시도
    const localResponse = await fetch('http://localhost:8000/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: finalPrompt, steps: steps || 1 }),
      signal: AbortSignal.timeout(45000) // CPU 연산 속도를 감안하여 45초 대기
    });

    if (!localResponse.ok) {
      throw new Error(`로컬 AI 서버 오류 (HTTP ${localResponse.status})`);
    }

    const localData = await localResponse.json();
    if (!localData.success) {
      throw new Error(localData.error || '로컬 AI 이미지 생성 실패');
    }

    console.log('✅ 로컬 AI 이미지 생성 성공');
    return NextResponse.json({
      success: true,
      source: 'local-ai',
      image: localData.image,
      prompt: finalPrompt
    });

  } catch (error) {
    console.error('❌ 로컬 AI 연동 실패:', error.message);
    return NextResponse.json({ success: false, error: `로컬 AI 모델 생성 실패: ${error.message}` }, { status: 500 });
  }
}
