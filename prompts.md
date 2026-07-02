# EGGG - AI Drawing Quiz Game 개발 이력

## 📌 1단계: 단어 데이터베이스 스키마 설계 수정 및 마이그레이션
### 사용자의 지시 프롬프트 원문
> 내가 neon db에 이 단어들을 넣어놨는데 이걸 db로 사용하자 해야되는거 말해봐
> neon db에는 이렇게 되어있어 이거 수정해줘야 하나?
> 승인

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **스키마 정규화**: 수평으로 나열되어 컬럼으로 오인된 단어 데이터를 데이터베이스의 행(Row) 단위로 저장하도록 스키마 설계 변경.
2. **마이그레이션 자동화**: 로컬 단어모음.csv 가로 배열 데이터를 파싱하여 세로 형태(Word, Length)의 레코드로 변환 후, PostgreSQL(Neon DB)에 Batch Insert하는 Node.js 기반 마이그레이션 유틸리티(`db_migrate.js`) 개발.
3. **환경 변수 격리**: DB 접속 정보를 소스코드에 하드코딩하지 않고 `.env` 파일로 격리하여 보안 강화.

---
## 🕒 작업 변경 이력 (Changelog)
### 🕒 2026-06-30 13:35 - prompts.md 초기 생성
- **변경 목적**: 데이터 스키마 및 마이그레이션 히스토리 추적 목적
- **수정/추가된 파일**: [prompts.md](file:///c:/MiniProject/miniproject/prompts.md) (신규)
- **세부 변경점**:
  - 마일스톤 1단계 내용 기록 개시

### 🕒 2026-06-30 13:36 - 단어 데이터베이스 정규화 및 마이그레이션 완료
- **변경 목적**: CSV 형식의 비구조화된 단어 데이터를 관계형 데이터베이스 형식(Row-based)으로 정규화하여 Neon DB에 일괄 적재
- **수정/추가된 파일**: 
  - [.env](file:///c:/MiniProject/miniproject/.env) (신규)
  - [package.json](file:///c:/MiniProject/miniproject/package.json) (수정)
  - [db_migrate.js](file:///c:/MiniProject/miniproject/db_migrate.js) (신규)
- **세부 변경점**:
  - 가로 정렬된 CSV 단어 데이터를 세로 행(Row)으로 자동 변환해주는 Node.js 마이그레이션 도구 개발 및 실행 완료.
  - Neon DB 상에 `word_list` 테이블을 재생성하고 정제된 총 6,495개의 고유 단어를 Bulk Insert 방식으로 일괄 적재 완료.
  - 검색 성능 향상을 위한 인덱스(`idx_word_length`) 설계 및 반영.

## 📌 2단계: 게임 제시어 Neon DB 연동 (정적 빌드 캐싱 아키텍처)
### 사용자의 지시 프롬프트 원문
> 이제 게임 플레이할때 db에 있는 단어들중에서만 나오게 해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **브라우저 CORS 및 보안 격리 우회**: 브라우저 환경에서 직접 PostgreSQL에 접속할 때 발생하는 보안 위협 및 로컬 파일 실행 정책(CORS) 충돌을 우회하기 위해, 마이그레이션 시점에 DB의 전체 단어를 정적 자바스크립트 전역 변수 파일(`words.js`)로 추출하는 **정적 데이터 캐싱 아키텍처** 채택.
2. **동적 키워드 공급 모델**: `app.js`에서 게임 구동 시 정적 하드코딩된 단어 대신, Neon DB에서 정제된 `EGGG_WORDS` 배열 내에서 무작위로 제시어를 선정하고 정답 검증 로직에 결합.

### 🕒 2026-06-30 13:40 - 게임 제시어 Neon DB 연동 완료
- **변경 목적**: 사용자가 게임을 시작할 때, 기존 하드코딩된 단어 대신 Neon DB의 단어 풀에서 무작위 단어가 출제되도록 변경하고 정답 판정을 동적 연동
- **수정/추가된 파일**:
  - [db_migrate.js](file:///c:/MiniProject/miniproject/db_migrate.js) (수정)
  - [words.js](file:///c:/MiniProject/miniproject/words.js) (신규 - 빌드 자동생성)
  - [index.html](file:///c:/MiniProject/miniproject/index.html) (수정)
  - [app.js](file:///c:/MiniProject/miniproject/app.js) (수정)
- **세부 변경점**:
  - `db_migrate.js`가 마이그레이션 완료 직후, DB 단어를 쿼리하여 전역 변수 `EGGG_WORDS`를 담은 `words.js`로 동적 추출하도록 마이그레이션 파이프라인 개량.
  - `index.html`에 `words.js` 스크립트를 `app.js` 구동 전에 미리 로드하도록 추가하여 로컬 CORS 오류 우회.
  - `app.js`에서 게임 및 라이어 모드 진입 시 `EGGG_WORDS` 풀에서 난수를 이용해 동적으로 제시어(시민 단어, 라이어 단어)를 추출하여 세팅.
  - 정답 검증 로직을 `normalizeText` 헬퍼 함수를 적용해 동적 키워드 매칭 방식으로 전환.

## 📌 3단계: 일반 모드 라운드 루프 및 최종 등수 화면 구현
### 사용자의 지시 프롬프트 원문
> 지금 해보니까 게임모드를 일반으로 했는데 왜 끝났을때 투표하는 화면이 나와 이게 아니라 다음라운드로 넘어가거나 남은 라운드가 없으면 점수에 따른 등수화면이 나오게 해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **일반 모드 게임 제어 흐름 분기**: 일반 모드(`human`) 및 기타 비투표성 게임 모드와 라이어/AI 찾기 등의 투표 기반 모드의 게임 제어 파이프라인을 조건부 격리.
2. **라운드 상태 및 생명주기 루프 설계**: `state`에 라운드(`currentRound`, `maxRound`) 정보 상태를 도입하여 라운드 완료 시 자동으로 다음 단어를 재생성하고 캔버스 및 타이머를 초기화하여 순환 동작 유도.
3. **최종 등수 스크린 마크업 및 스타일링 신설**: 게임 전 라운드가 완료되면 랭킹 및 등수 카드들을 출력하는 최종 결과 화면(`screen-result`)을 HTML/CSS로 구축하고, `state.players` 점수 정렬 알고리즘을 연동하여 시각화.

### 🕒 2026-06-30 13:48 - 일반 모드 라운드 순환 및 최종 등수 스크린 연동 완료
- **변경 목적**: 일반 게임 모드 등에서 라운드 간 순환이 일어나게 하고 라운드 한계 도달 시 최종 랭커를 렌더링하는 결과 화면 신설
- **수정/추가된 파일**:
  - [index.html](file:///c:/MiniProject/miniproject/index.html) (수정)
  - [style.css](file:///c:/MiniProject/miniproject/style.css) (수정)
  - [app.js](file:///c:/MiniProject/miniproject/app.js) (수정)
- **세부 변경점**:
  - `index.html`에 최종 랭커 순위를 렌더링할 `#screen-result` 마크업 구조 설계 및 신설.
  - `style.css`에 등수별 메달 아이콘 배정과 순위 카드 호버 애니메이션 관련 스타일을 정의.
  - `app.js`에서 일반 모드 구동 시 타이머 종료 조건에서 투표를 생략하고 라운드 상태 카운터를 누적시킨 후 다음 라운드를 가동하는 순환 루프 연동.
  - 라운드 도달 시 플레이어 점수를 내림차순 정렬하여 `#screen-result`에 바인딩하는 `renderGameResults` 알고리즘 개발.

## 📌 4단계: 채팅 로그 초기화 및 반응형 UI 리사이징 고도화
### 사용자의 지시 프롬프트 원문
> 게임 끝나면 채팅도 초기화 되게 해줘 지금 새로운 게임을 해도 그전에 한 채팅이 남아있네 그리고 화면크기에 맞춰서 ui 크기 조절좀 해줘 지금 너무 커 화면 크기를 조절해도 그크기에 딱 맞게로 바꿔줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **메모리 및 세션 자원 클렌징**: 새로운 세션 시작(`btnLobbyStart` 실행) 시 및 로비 복귀 시점에 기존 피드 컨테이너의 내용을 지워 데이터 잔류 현상 원천 차단.
2. **동적 뷰포트 비율 기반 CSS 캘리브레이션**: 모니터 해상도 및 윈도우 크기에 맞추어 레이아웃이 유동적으로 스케일링되도록 CSS의 격자 크기, 패딩, 여백 요소 및 최대 높이(`max-height`) 제한 고도화.
3. **윈도우 리사이즈 연동형 캔버스 해상도 보존 복원 알고리즘**: 브라우저 창 리사이즈(`resize`) 이벤트를 수신하여 캔버스의 해상도를 자동 재조정하는 동시에, 기존 이미지가 날아가지 않도록 메모리 임시 캔버스에 드로잉 데이터를 캐싱했다가 복구하는 복원(Scale Restoration) 로직 도입.

### 🕒 2026-06-30 13:58 - 채팅 로그 초기화 및 반응형 UI 리사이징 연동 완료
- **변경 목적**: 게임 플레이 리플레이 시 기존 채팅 기록이 남아있는 버그 해결 및 화면 크기 리사이징에 따른 유연한 반응형 UI 최적화
- **수정/추가된 파일**:
  - [app.js](file:///c:/MiniProject/miniproject/app.js) (수정)
  - [style.css](file:///c:/MiniProject/miniproject/style.css) (수정)
- **세부 변경점**:
  - `app.js`에서 게임 시작(`btnLobbyStart`) 및 대기실로 돌아갈 때(`btnResultGoHome`) `chatLogContainer` 내용을 공백 처리하여 이전 채팅 잔류 버그 정정.
  - `app.js`에서 `window` 리사이즈 이벤트를 수집하여 캔버스가 부모 레이아웃 너비/높이에 맞춰 재구성되도록 바인딩.
  - 리사이징 시 드로잉 자원이 초기화되는 문제를 해결하기 위해, 가상 임시 캔버스로 드로잉 픽셀을 백업하고 복원해 내는 이미지 스케일 보존형 `setupCanvasSize`로 개선.
  - `style.css`에서 `body`와 `.app-container`의 높이를 `100vh`로 강제하고 스크롤을 막아 반응형 틀 안에 구속 처리.
  - `.waiting-room-container`, `.voting-container`, `.result-card`에 최대 높이 `90vh` 및 자체 `overflow-y: auto` 스크롤을 탑재하여 브라우저 가로세로 높이가 협소할 때 찌그러지거나 잘리지 않도록 CSS 레이아웃 리밸런싱.

## 📌 5단계: 제시어 영역 중앙 정렬 및 인게임 UI 하단 짤림 방어 (min-height 캘리브레이션)
### 사용자의 지시 프롬프트 원문
> 일단 제시어 가운데로 정렬하고 ui도 지금 조금 커서 밑에가 짤린다 다시 정렬해줘봐

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **상단바 3분할 3열 그리드 레이아웃 전환**: `game-topbar`를 `display: grid; grid-template-columns: 1fr auto 1fr;` 구조로 재정의하여 좌우 내용물 크기와 무관하게 제시어 상자(`.topbar-center`)가 완벽한 수평 가로 기준 정중앙에 위치하도록 배치.
2. **세로 높이 유실 4px 오프셋 보정**: 헤더 높이(`70px`)와 하단 테두리 두께(`4px`)를 명확히 계산하여 `.game-layout` 높이를 `calc(100vh - 74px)`로 정확히 구속해 하단부 짤림 현상 차단.
3. **중첩 Flexbox 내부 하위 요소 축소 한계 해제 (min-height 캘리브레이션)**: flexbox 레이아웃 내에서 자식들의 세로 높이가 부모보다 커질 때 찌그러짐을 유발하는 `min-height: auto` 기본 동작을, `min-height: 0;` 주입으로 강제 캘리브레이션하여 브라우저 리사이징 시 캔버스와 스크롤 영역이 유연하게 핏을 맞추도록 최적화.

### 🕒 2026-06-30 14:09 - 제시어 영역 중앙 정렬 및 인게임 UI 짤림 방어 완료
- **변경 목적**: 제시어 영역의 수평 가로 기준 정중앙 정렬 및 세로 뷰포트가 좁은 환경에서 인게임 드로잉 툴바/채팅 입력창 짤림 방어
- **수정/추가된 파일**:
  - [style.css](file:///c:/MiniProject/miniproject/style.css) (수정)
- **세부 변경점**:
  - `game-topbar`를 기존 Flexbox에서 `display: grid; grid-template-columns: 1fr auto 1fr;` 구조로 변경하여 중앙 제시어 상자가 수평 대칭선상 정중앙에 위치하도록 교정.
  - 상단 헤더 보더 두께(4px)를 감안해 `.game-layout` 의 높이를 `calc(100vh - 74px)` 로 오프셋 캘리브레이션 진행.
  - flex 자식 요소의 최소 크기 제약(`min-height: auto`)으로 인해 축소가 불가능했던 문제를 해결하고자 `.game-sidebar-left`, `.game-main-area`, `.sub-game-view`, `.canvas-wrapper`, `.game-sidebar-right`, `.chat-log-container` 에 `min-height: 0;` 주입 완료.

## 📌 6단계: 제시어 컴포넌트 라운드 옆 재배치 및 캔버스 최대 높이 제약 설정
### 사용자의 지시 프롬프트 원문
> 가운데 그림 그리는 ui가 창이 커지면 창 크기보다 더 커져서 맨위로 올리면 그리는 도구가 안보여 이거 그림그리는 부분 크기를 더줄여봐 그리고 제시어 위치 그냥 라운드 옆에 붙여줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **제시어 컴포넌트 물리적 위치 이관**: `index.html`에서 상단바 정중앙 `.topbar-center` 내부의 제시어 상자(`.keyword-box`)를 좌측 영역(`.topbar-left`)의 `.round-indicator` 바로 뒤로 위치 변경.
2. **상단바 Flexbox 레이아웃 롤백**: 수평 중앙 정렬 그리드가 불필요해짐에 따라 `.game-topbar`를 `display: flex; justify-content: space-between;` 구조로 회귀하여 간결성 확보.
3. **캔버스 최대 한계 높이 지정 (max-height 제약)**: 화면 창이 과도하게 위아래로 길어질 때 캔버스 영역이 하단 툴바를 뷰포트 밑으로 유실시키는 현상을 방지하기 위해, `.canvas-wrapper`에 `max-height: 52vh;` (또는 480px) 수준의 상한선 제약을 설정하여 절대 잘림 현상 방지.

### 🕒 2026-06-30 14:14 - 제시어 돔 위치 이관 및 캔버스 최대 높이 스케일링 제약 완료
- **변경 목적**: 화면 창 최대 확장 시 캔버스가 지나치게 커져 드로잉 툴바가 아래로 이탈하지 않게 가두고, 제시어 박스를 시선 집중도가 높은 라운드 인디케이터 옆으로 재배치
- **수정/추가된 파일**:
  - [index.html](file:///c:/MiniProject/miniproject/index.html) (수정)
  - [style.css](file:///c:/MiniProject/miniproject/style.css) (수정)
- **세부 변경점**:
  - `index.html`에서 상단바 정중앙 `.topbar-center` 내부의 `keyword-box` 마크업을 `.topbar-left` 영역의 `.round-indicator` 바로 우측으로 이동시키고 빈 `.topbar-center` 마크업은 완전히 소거.
  - `style.css`에서 `game-topbar` 수평 중앙 그리드 배치를 flexbox(`justify-content: space-between`) 구조로 롤백.
  - `style.css`의 `.game-mode-tag` 내부 gap을 15px로 정량하여 정보 요소 간 가독 여백 부여.
  - `style.css`의 `.canvas-wrapper` 카드에 `max-height: 52vh; max-height: 480px;` 를 신설하여 창 크기 최대 확장 시 캔버스가 툴바를 밀어내는 현상 원천 차단.

## 📌 7단계: 제시어 캔버스 내부 오버레이 이관 및 뷰포트 고정형 인게임 레이아웃 전면 리팩토링
### 사용자의 지시 프롬프트 원문
> 아 그림그리는 쪽 박스 크기 계속 브라우저창보다 더 크게 되네 이거 조절 똑바로 못할거 같으면 그냥 제시어를 그림그리는 곳 왼쪽 맨위에 뜨는걸로 바꿔줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **제시어의 캔버스 뷰 오버레이(Canvas Overlay Box) 이관**: `index.html`에서 상단바의 제시어 영역(`keyword-box`)을 완전히 걷어내어, `.canvas-wrapper` 내부의 캔버스 위에 `position: absolute; top: 15px; left: 15px; z-index: 10;` 형태로 오버레이되도록 이관.
2. **뷰포트 고정형 Flex 레이아웃(Viewport Constraints Layout) 수립**:
   - `#screen-game`에 `height: 100vh; overflow: hidden;`을 엄격히 지정.
   - `.game-topbar`에 `flex-shrink: 0;`을 매핑해 헤더 세로가 강제 수축되거나 세로 픽셀을 추가로 먹지 않게 고정.
   - `.game-layout`을 `flex: 1; height: 0; min-height: 0; overflow: hidden;`으로 고쳐, 임의의 고정 수식(`calc(100vh - 74px)`)에 의존하지 않고 브라우저가 제공하는 남은 높이에 레이아웃 영역이 유기적이고 완전하게 갇히도록 재구조화.
3. **사용성 보장(pointer-events: none)**: 캔버스 위에 뜨는 제시어 오버레이 상자가 마우스 드로잉 드래그 조작을 방해하지 않도록 CSS `pointer-events: none;` 처리 반영.

### 🕒 2026-06-30 14:20 - 제시어 캔버스 오버레이 이관 및 뷰포트 고정형 레이아웃 리팩토링 완료
- **변경 목적**: 캔버스 크기 무제한 비대화에 따른 툴바 가려짐 현상 및 세로 스크롤 버그 전면 해결, 제시어 상자 캔버스 왼쪽 위 오버레이 결합
- **수정/추가된 파일**:
  - [index.html](file:///c:/MiniProject/miniproject/index.html) (수정)
  - [style.css](file:///c:/MiniProject/miniproject/style.css) (수정)
- **세부 변경점**:
  - `index.html`에서 상단바의 제시어 상자 `keyword-box` 돔 노드를 걷어내어 `.canvas-wrapper` 의 내부로 이관.
  - `style.css`에서 `#screen-game`에 `height: 100vh; overflow: hidden;`을 엄격히 지정.
  - `style.css`에서 `.game-topbar`에 `flex-shrink: 0;` 을 지정해 세로 높이 고정 격리.
  - `style.css`에서 `.game-layout` 의 height 수식을 `calc(100vh - 74px)` 에서 `height: 0; flex: 1; min-height: 0; overflow: hidden;` 으로 개편하여 브라우저 가로세로 축소에 정확히 가두어지도록 리팩토링.
  - `style.css`에서 `.canvas-keyword-overlay` 클래스에 `position: absolute; top: 15px; left: 15px; z-index: 10; pointer-events: none;`를 지정해 캔버스 위에 뜨는 제시어 상자가 캔버스 터치/마우스 입력을 차단하거나 방해하지 않도록 처리 완료.

## 📌 8단계: AI 프롬프트 모드 제시어 자동 입력 비활성화 및 사용자 자율 입력 전환
### 사용자의 지시 프롬프트 원문
> ai 프롬프트 모드 일때 제시어가 자동으로 프롬프트에 자동으로 정답이 들어가게 한걸 수정해줘 플레이어가 알아서 입력하게 하고 싶어

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **제시어 수동 입력 방식 전환**: 라운드가 전환되거나 AI 도메인 초기화 시점(`triggerAiDrawing`)에 게임 서버가 내려준 `keyword`를 프롬프트 상태 변수 `aiPrompt`에 자동 주입하던 바인딩을 제거하고 빈 문자열(`""`)로 초기화하여 플레이어의 조작 자율성을 보장.
2. **트리거 시점 격리**: 실시간 이미지 렌더링 옵션(`isAiRealtime`)이 켜져 있더라도, 라운드 진입 직후 제시어 텍스트를 이용해 Pollinations API 또는 Local AI WebSocket을 즉시 구동하던 자동 생성 분기를 비활성화하여 리소스 낭비 및 제시어 사전 노출 차단.

### 🕒 2026-07-01 10:12 - AI 프롬프트 모드 제시어 자동 입력 비활성화 및 사용자 자율 입력 전환 완료
- **변경 목적**: AI 프롬프트 모드에서 출제자의 창의적인 프롬프트 묘사를 가능하게 하고, 정답(제시어)이 즉시 렌더링되던 비즈니스 로직을 플레이어 수동 입력 위주로 개선.
- **수정/추가된 파일**:
  - [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
- **세부 변경점**:
  - `app/page.js`의 `triggerAiDrawing` 함수 내에서 `setAiPrompt(keyword)` 지시어를 공백 문자열(`""`)로 리셋하도록 전면 개정.
  - 라운드 로딩 시점에 Pollinations.ai API(`generateAiViaPollinations`) 또는 로컬 AI 서버(`requestAiGenerate`)로 자동 트리거되던 생성 조건 블록(`isAiRealtime && keyword`)을 제거하여 플레이어가 타이핑하기 전까지 대기 상태를 유지하도록 제어 흐름 수정.

## 📌 9단계: 프롬프트 내 정답(제시어) 직접 입력 차단 시스템 구현
### 사용자의 지시 프롬프트 원문
> 프롬프트에 정답을 직접적으로 적는걸 막고 싶은데 어떻게 해

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **텍스트 정규화 기반 비교 알고리즘**: 우회 목적의 띄어쓰기 또는 알파벳 대소문자 변형을 원천 차단하기 위해 입력받은 프롬프트와 현재 라운드 정답(`currentKeyword`)의 공백을 제거(`replace(/\s+/g, '')`)하고 소문자화(`toLowerCase()`)하여 상호 매칭 분석.
2. **부분 일치 차단 및 실시간 에러 전달**: 조건 검사에서 정제 프롬프트가 정제 정답 문자열을 포함하고 있는 경우 비동기 이미지 생성 파이프라인의 진행을 중단(`return`)하고, `setAiErrorMsg` API를 호출하여 UI 상의 경고 배너로 에러 메시지를 동적 바인딩.

### 🕒 2026-07-01 10:35 - 프롬프트 내 정답(제시어) 직접 입력 차단 시스템 구현 완료
- **변경 목적**: 게임의 의도에 맞지 않게 프롬프트에 제시어(정답)를 그대로 주입하여 문제를 불공정하게 통과시키는 치팅/어뷰징 문제를 원천 차단.
- **수정/추가된 파일**:
  - [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
- **세부 변경점**:
  - `app/page.js`의 `requestAiGenerate` 함수 진입부 최상단에 프롬프트 정규화 비교(공백 제거, 소문자 변환) 코드를 신설.
  - 정제된 프롬프트가 제시어를 담고 있는 경우, 에러 상태(`setAiErrorMsg`)를 갱신하고 생성을 중단하여 즉각적인 차단 및 시각적 피드백 제공.

## 📌 10단계: GPU 하드웨어 설정 가이드 작성 및 개발 문서 보완
### 사용자의 지시 프롬프트 원문
> AI 이미지 생성기 GPU 설정 가이드... 해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **문서 통합 및 환경 최적화 명세화**: 분산되어 있던 기존 SD-Turbo 실시간 프론트 가이드와 사용자가 전달한 CUDA 12.8 휠 빌드 및 `venv311` 가상환경 설치법을 구조적으로 통합.
2. **유실된 시스템 리소스 경로 규명**: Hugging Face 모델 캐시의 Windows 기본 스토리지 물리 주소(`C:\Users\<사용자명>\.cache\huggingface` 및 `%USERPROFILE%\.cache\huggingface`)를 확정 지어 문서화하여 트러블슈팅 효율성 증대.

### 🕒 2026-07-01 10:52 - GPU 하드웨어 설정 가이드 작성 및 개발 문서 보완 완료
- **변경 목적**: 로컬 및 클라우드 AI 서버 환경에서 NVIDIA CUDA 엔진 가속을 보장하기 위한 라이브러리 구성과 가상환경 초기화 시의 정책 설정 안내 강화.
- **수정/추가된 파일**:
  - [README.md](file:///c:/MiniProject/miniproject/model/TEST/README.md) (수정)
- **세부 변경점**:
  - `model/TEST/README.md` 내에 CUDA 12.8 대응 PyTorch 인스톨 커맨드와 PowerShell `RemoteSigned` 보안 정책 우회 스니펫 추가.
  - 가속 구동 검증을 위한 `torch.cuda.is_available()` 모니터링 원라인 파이썬 코드 및 `/api/status` 확인 방법 기술.
  - 미완성 상태였던 Hugging Face 모델 캐시 디스크 윈도우 스토리지 경로를 완성하여 기입.

## 📌 11단계: GPU 백엔드 가상환경 구축, 의존성 결함 해결 및 서빙 가동
### 사용자의 지시 프롬프트 원문
> 아니 이 내용대로 실행을 해달라고 설치할거 하고

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **인프라 셋업 및 GPU 가속 설치**: Python 3.13 및 NVIDIA RTX 5060 환경에 대응하는 CUDA 12.8 빌드 PyTorch와 관련 유틸 라이브러리를 가상환경(`venv311`)에 완전 적재.
2. **런타임 패키지 누락 결함 조치**: 백엔드 모델 초기화 시 `deep-translator` 모듈 누락(`ModuleNotFoundError`)으로 인해 서버가 에러 루프에 빠지는 장애를 진단하고, 해당 패키지를 수동 주입함과 동시에 `requirements.txt`에 명시적으로 영구 반영.
3. **백그라운드 영속 서빙**: Uvicorn 서빙 인스턴스를 비동기 백그라운드 태스크로 구동하고, 약 1.6GB의 `stabilityai/sd-turbo` 모델 가중치를 VRAM(float16)에 완전 적재 후 `/api/status` 헬스체크 응답 200을 정상 확인.

### 🕒 2026-07-01 12:45 - GPU 백엔드 가상환경 구축 및 서빙 가동 완료
- **변경 목적**: 사용자 로컬 그래픽 카드(GPU CUDA) 자원을 활용한 실시간 이미지 생성이 가능하도록 백엔드 실행 파일 및 파이썬 가상환경 초기화를 완성.
- **수정/추가된 파일**:
  - [requirements.txt](file:///c:/MiniProject/miniproject/model/TEST/backend/requirements.txt) (수정)
- **세부 변경점**:
  - `model/TEST` 내부 `venv311` 가상환경 생성 및 pip 최신화.
  - CUDA 12.8 대응 PyTorch, torchvision, torchaudio 휠 패키지 및 FastAPI 런타임 패키지 적재.
  - 가상환경 내에 `deep-translator` 강제 설치 후 FastAPI Uvicorn 백그라운드 서버 재가동 및 GPU 바인딩(status `cuda`) 완료.

## 📌 12단계: 로컬 런타임 충돌 우회를 위한 Node.js 기반 실시간 웹소켓 서버 아키텍처 전환
### 사용자의 지시 프롬프트 원문
> 승인

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **Cloudflare Workers 의존성 탈피**: Windows 환경에서 `workerd` 바이너리 실행 시의 Visual C++ Redistributable 구버전/누락 혹은 런타임 메모리 위반 크래시(Exception #0xc0000005) 현상을 해결하기 위해, Cloudflare Durable Objects 런타임 아키텍처를 순수 Node.js 아키텍처로 전면 교체.
2. **가상 인메모리 룸 매니저 에뮬레이션**: Node.js 표준 `http` 서버 및 `ws` 라이브러리를 바인딩하고, 전역 `Map` 객체를 통해 룸 단위 상태(roomState)와 클라이언트 소켓 세션을 인메모리에 관리하여 기존 Durable Objects의 데이터 생명주기 완벽 재현.
3. **일관된 프론트엔드 통합**: Vercel에 배포된 기존 프론트엔드 클라이언트가 기본적으로 사용하던 8787 포트 웹소켓 연결 스펙(Path: `/ws/:roomId`, Query Params)을 100% 보존하여 프론트엔드 소스코드 무수정 연동 성공.

---
## 🕒 작업 변경 이력 (Changelog)

### 🕒 2026-07-01 15:02 - Node.js 기반 실시간 웹소켓 서버 전환 완료
- **변경 목적**: Wrangler(workerd) Windows 런타임 메모리 액세스 충돌 오류를 방지하고, 로컬 환경에서 에러 없이 상시 가동 가능한 실시간 게임 동기화 서버 인프라 구축
- **수정/추가된 파일**:
  - [package.json](file:///c:/MiniProject/miniproject/package.json) (수정)
  - [package.json](file:///c:/MiniProject/miniproject/realtime-server/package.json) (신규)
  - [server.js](file:///c:/MiniProject/miniproject/realtime-server/server.js) (신규)
- **세부 변경점**:
  - `realtime-server/package.json` 신규 정의서 생성을 통해 `ws` 및 `dotenv` 패키지 의존성 공급.
  - `realtime-server/server.js`에 `http` & `ws` 모듈 기반 포트 8787 웹소켓 게이트웨이 구현 및 인메모리 룸 격리 클래스 설계.
  - 루트 `package.json` 에 `dev:realtime` 스크립트를 추가하여 `npm run dev:realtime` 명령어로 통합 기동이 가능하게 조치.

## 📌 13단계: Vercel - 로컬 AI 백엔드 도메인 터널링 및 프론트엔드 환경 변수 바인딩 적용
### 사용자의 지시 프롬프트 원문
> 1단계부터 자세하게 다시 알려줘
> 승인

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **유동적 AI 접속 종속성 분리**: `app/page.js`에 하드코딩되어 있던 로컬 AI 서버 주소(`localhost:8000`)를 런타임 환경변수(`NEXT_PUBLIC_AI_WS_URL`, `NEXT_PUBLIC_AI_API_BASE`) 기반으로 리팩토링하여 인프라 도메인 변경 시에도 코드 수정 없이 유연한 대처 보장.
2. **보안 샌드박스 보안 정책 우회**: HTTPS 환경인 Vercel과 로컬 AI 서버(HTTP) 통신 시 웹 브라우저가 유발하는 Mixed Content 차단 문제를 해결하기 위해, Localtunnel/ngrok 등을 경유한 SSL 암호화된 공인 HTTPS 게이트웨이 터널 연동 아키텍처 제시.
3. **OS 실행 정책 우회 기동 명세**: Windows PowerShell의 스크립트 실행 제한 정책(`PSSecurityException`)으로 가상환경 활성화가 거부될 경우를 대비해, 가상환경 내 격리된 파이썬 실행 파일을 수동 활성화 없이 물리적으로 직접 지목(`..\venv311\Scripts\python.exe main.py`)하여 런타임을 무사히 실행시키는 트러블슈팅 매뉴얼 수립.

---
## 🕒 작업 변경 이력 (Changelog)

### 🕒 2026-07-01 15:27 - Vercel용 AI 환경 변수 바인딩 적용 완료
- **변경 목적**: Vercel에 배포된 게임 프론트엔드가 암호화 보안 규칙(Mixed Content)을 만족하며 사용자의 고성능 로컬 GPU AI 모델을 무수정 상태로 연동 호출할 수 있도록 함.
- **수정/추가된 파일**:
  - [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
- **세부 변경점**:
  - `app/page.js`의 `AI_CONFIG`에서 `WS_URL`과 `API_BASE`를 `process.env.NEXT_PUBLIC_AI_WS_URL` 및 `process.env.NEXT_PUBLIC_AI_API_BASE` 환경 변수를 사용해 유동적으로 바인딩하도록 소스 코드 핫픽스 적용.

## 📌 14단계: 터널링 프록시 경고 화면 우회 헤더(Bypass Headers) 주입
### 사용자의 지시 프롬프트 원문
> 승인할게

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **터널 보안 검문소 하이패스**: 외부 플레이어가 개별적으로 도메인에 방문하여 IP 인증을 거치지 않더라도, API 비동기 통신(`fetch`) 요청 헤더에 터널링 보안 차단 우회 토큰(`bypass-tunnel-reminder`, `ngrok-skip-browser-warning`)을 함께 실어 보내게끔 설계하여 경고 웹페이지(HTML) 반환 문제를 원천 해결.
2. **JSON 파싱 안정성 복원**: 응답 형식이 일관된 JSON 데이터로 고정되도록 강제하여 `Unexpected token '<', "<html>..." is not valid JSON` 형태의 브라우저 예외 에러를 영구적으로 제거.

---
## 🕒 작업 변경 이력 (Changelog)

### 🕒 2026-07-01 15:47 - 터널링 경고 화면 우회 헤더 주입 완료
- **변경 목적**: 외부 플레이어가 게임 룸에 접속했을 때 AI 이미지 로딩 시 발생하는 JSON 파싱 에러 방지 및 그림 미표출 문제 해결
- **수정/추가된 파일**:
  - [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
- **세부 변경점**:
  - `app/page.js`의 `generateAiViaHTTP` 비동기 함수 내 `fetch` 통신부 `headers` 객체에 `'bypass-tunnel-reminder': 'true'` 및 `'ngrok-skip-browser-warning': 'true'` 속성 동적 주입 완료.

## 📌 15단계: Cloudflare Tunnel(cloudflared) 도입을 통한 프록시 보안 배리어 완전 제거
### 사용자의 지시 프롬프트 원문
> cloudflare Tunnel 도입하는거 해보고 싶은데 이거 해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **임시 터널링 도구 교체**: 경고 안내 웹페이지(HTML 배너)를 표시하여 잦은 통신 차단을 일으키던 Localtunnel/ngrok을 걷어내고, 보안 인증 스크린이 전혀 존재하지 않는 Cloudflare 공식 터널 솔루션(`cloudflared`)으로 전면 전환.
2. **무중단 인프라 포트 포워딩**: 로컬 8000번 포트의 AI 서버를 `trycloudflare.com` 공인 도메인과 1:1 매핑하여 외부 클라이언트(Vercel) 및 로컬 중계 서버(realtime-server)가 혼합 콘텐츠 차단(Mixed Content) 및 CORS 이슈 없이 통신할 수 있도록 조치.

---
## 🕒 작업 변경 이력 (Changelog)

### 🕒 2026-07-01 16:05 - Cloudflare Tunnel 도입 및 실시간 서버 동기화 완료
- **변경 목적**: 외부 참가자 접속 시 어떠한 중간 확인 배너 없이 다이렉트로 안전하게 로컬 GPU AI API 데이터(JSON)를 전파하기 위해 터널링 서버 인프라 최신화 적용
- **수정/추가된 파일**:
  - [.env](file:///c:/MiniProject/miniproject/.env) (수정)
- **세부 변경점**:
  - `npx.cmd cloudflared tunnel --url http://localhost:8000` 백그라운드 태스크 기동을 통해 신규 보안 터널(`https://airport-values-die-linear.trycloudflare.com`) 개방 완료.
  - 기존 로컬 `.env` 에 기록되어 있던 `AI_SERVER_URL`을 새로 발급된 Cloudflare Tunnel 도메인 주소로 갱신하여 `realtime-server` 가 해당 주소로 AI 생성을 정상 중계할 수 있게 수정 완료.
  - 구버전 localtunnel 백그라운드 태스크(`task-165`)를 종료하여 로컬 PC 시스템 네트워크 자원 확보.

## 📌 16단계: AI 이미지 로컬 static 파일 서빙 전환을 통한 Vercel 전송 한도 초과 해결
### 사용자의 지시 프롬프트 원문
> 지금 서로 둘다 websocket 연결중이라고는 뜨는데 서로가 그린그림이 서로한테 안보여 이거 왜 이래?

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **페이로드 부피 다이어트 (Base64 -> URL)**: 이미지 생성 성공 시 돌려주던 수백 KB ~ 수 MB 크기의 Base64 문자열 데이터를 배제하고, AI 백엔드의 로컬 폴더(`frontend/static_images/`)에 물리 파일로 저장한 뒤 URL 주소만 리턴하도록 구조를 최적화.
2. **Vercel 및 DB 페이로드 제약 회피**: 단 70바이트 내외의 경량화된 URL 문자열만 DB(`game_rooms` 테이블)에 저장 및 갱신되므로, Vercel의 서버리스 바디 크기 제한(HTTP 413 Payload Too Large) 및 Neon DB의 String 크기 제약을 우회하여 비출제자들의 폴링 렌더링을 완벽 보장.
3. **무중단 백엔드 배포**: 프론트엔드(`app/page.js`) 코드를 수정하지 않고 오직 파이썬 백엔드 코드(`main.py`, `image_generator.py`)의 가공 포맷만 보완했으므로, 사용자의 Vercel 재배포나 프론트 빌드 절차를 아예 생략하고 즉시 연동 가능한 호환성 실현.

---
## 🕒 작업 변경 이력 (Changelog)

### 🕒 2026-07-01 16:15 - AI 생성 이미지 로컬 호스팅 및 URL 서빙 패치 완료
- **변경 목적**: Vercel의 용량 제한으로 인해 DB의 `ai_image_url` 컬럼이 갱신되지 못해 플레이어 간 이미지가 서로 연동되지 않던 문제 해결
- **수정/추가된 파일**:
  - [image_generator.py](file:///c:/MiniProject/miniproject/model/TEST/backend/image_generator.py) (수정)
  - [main.py](file:///c:/MiniProject/miniproject/model/TEST/backend/main.py) (수정)
- **세부 변경점**:
  - `image_generator.py`에 생성된 PIL 이미지를 로컬 `frontend/static_images` 디렉토리에 고유 식별자(UUID) 파일명으로 즉시 저장하고 상대 경로(`/static/static_images/gen_xxx.png`)를 반환하는 루틴 구축.
  - `main.py`에 HTTP POST(`generate_image_http`) 및 WebSocket(`do_generate`) 요청 수신 시, Request 객체의 Headers(`x-forwarded-proto`, `host`)를 실시간 분석하여 공인 Cloudflare Tunnel 주소가 적용된 절대 URL 링크로 가공 후 리턴하는 가공 로직 보완.
  - 신규 로컬 백엔드 실행을 위해 기존 AI 백엔드 태스크(`task-163`)를 파괴하고 새 파이썬 바이너리 프로세스(`task-328`)로 무중단 재기동 완료.

## 📌 17단계: AI 생성 단일 HTTP POST 통신 단일화 및 헬스 체크 통합 폴러 도입
### 사용자의 지시 프롬프트 원문
> 이게 맨처음엔 한명이 그린게 상대한테 보였거든? 근데 다시 수정해서 그리니까 연결중이라고만 뜨고 수정된 그림이 안보여 그리고 나서 그 다음 라운드부터는 그리는 사람은 websocket 연결중이라고 뜨는데 문제를 맞춰야 하는 사람들은 재연결대기중이라고 뜨는데 이거 어떻게 해결해 이거 cloudeflare 서버가 불안정한건가?

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **소켓 하트비트 타임아웃 해소**: AI 생성 작업(PyTorch 추론) 시 발생하는 스레드 독점으로 인해 웹소켓 Ping/Pong 하트비트가 지연되어 연결이 폭파(Disconnection)되던 문제를 차단하기 위해, 불안정한 WebSocket 방식을 걷어내고 일회성 HTTP POST (`generateAiViaHTTP`) 기반 단일 통신 구조로 개편.
2. **동시성 락 뮤텍스(asyncio.Lock) 도입**: 여러 사용자가 프롬프트를 동시에 수정 및 재전송하더라도 PyTorch 파이프라인이 꼬이거나 데드락에 걸리지 않도록 `asyncio.Lock`을 장착하여 이미지 생성 연산을 백엔드 단에서 순차적으로 큐잉(Queueing) 직렬화 처리.
3. **비출제자 상태 뱃지 동기화**: 비출제자들의 화면이 최초 진입 시 무한 로딩(`loading` 및 `재연결 대기중`)에 갇히는 문제를 핫픽스하기 위해, 게임 진입 시 출제자/비출제자 구분 없이 AI 백엔드 서버 상태를 1회 체크하여 뱃지를 초록색(`AI 서버 연결됨`)으로 자동 활성화하는 `useEffect` 연동 장치 마련.

---
## 🕒 작업 변경 이력 (Changelog)

### 🕒 2026-07-01 16:22 - AI 서버 통신 HTTP POST 단일 채널 고도화 완료
- **변경 목적**: GPU 추론 스레드 락으로 인한 소켓 끊김 현상(`재연결대기중...` 등) 영구 제거 및 동시 생성 요청 데드락 방지
- **수정/추가된 파일**:
  - [main.py](file:///c:/MiniProject/miniproject/model/TEST/backend/main.py) (수정)
  - [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
- **세부 변경점**:
  - `main.py`에 `asyncio.Lock()` 기반의 전역 락 `generation_lock`을 선언하고, `generate_image_http` 연산 영역을 `async with generation_lock:` 블록으로 격리하여 순차 직렬화 보장.
  - `app/page.js`에서 AI 모델 웹소켓 강제 자동 바인딩(`connectAiWebSocket`)을 영구 주석 처리하여 하트비트 연결 유실에 따른 소켓 폭파 유발 원인을 아키텍처적으로 완전 소멸시킴.
  - `app/page.js`에 게임 진입 시 AI 백엔드 상태를 1회 조회해 뱃지를 세팅해 주는 공통 `useEffect`를 신설하여 비출제자 화면이 무한 로딩에 갇히던 상태 연동 버그 퇴치.
  - `requestAiGenerate` 함수를 HTTP 단일 통로(`generateAiViaHTTP`)만 사용하도록 단순화 조치.
  - 새 코드가 탑재된 AI 백엔드를 가동하기 위해 백그라운드 태스크(`task-328`)를 종료하고, `task-355`로 재기동 적용 완료.

## 📌 18단계: AI 이미지 생성 로컬 디스크 저장 비활성화 및 메모리 스트림 전송 전환
### 사용자의 지시 프롬프트 원문
> 그 다 작동은 잘하는데 ai가 그린 그림들이 내 컴퓨터에 저장이 되는거 같은데 이거 저장 안되게 하고싶어 지금 깃허브에 올리면서 하는중이라 계속 사진이 생성되면 올려야 하는게 있다고 오해할 수도 있어서 근데 혹시 이게 사진을 저장을 안하면 실행이 안되는건가?
> 진행하고 현재까지 만들어진 사진도 지워줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **메모리 내 바이너리 스트림 변환 (In-Memory Buffer Stream) 적용**: 생성된 `PIL.Image` 객체를 로컬 하드 디스크 드라이브에 임시 파일로 쓰지 않고, 메모리상에서 `io.BytesIO` 바이트 스트림 객체를 통해 PNG 바이너리화한 후 즉시 Base64 텍스트 문자열 데이터 URL(`data:image/png;base64,...`)로 인코딩하여 반환하도록 설계. 이를 통해 로컬 스토리지 누적과 불필요한 디스크 I/O 레이턴시를 원천 차단.
2. **Git 추적 방어막(Git Ignore) 설치**: 프로젝트 루트의 `.gitignore` 파일에 AI 자동 이미지 임시 생성 경로인 `model/TEST/frontend/static_images/`를 명시적으로 등록하여, 향후 개발 및 테스트 중 물리적인 이미지 저장이 발생하더라도 깃허브 원격 리포지토리에 오염되지 않도록 보장.
3. **기존 파일 시스템 클렌징**: 쉘 명령어를 활용하여 로컬 파일 시스템 내 정적 리소스 디렉토리(`static_images/`)에 잔류하던 이전 라운드 이미지 세션 파일들을 일괄 소거.

---
## 🕒 작업 변경 이력 (Changelog)

### 🕒 2026-07-01 16:55 - AI 이미지 로컬 저장 배제 및 In-Memory Base64 반환 완료
- **변경 목적**: 로컬 PC 내 생성 이미지 누적으로 인한 Git 관리 혼선 방지 및 I/O 오버헤드 완화
- **수정/추가된 파일**:
  - [image_generator.py](file:///c:/MiniProject/miniproject/model/TEST/backend/image_generator.py) (수정)
  - [.gitignore](file:///c:/MiniProject/miniproject/.gitignore) (수정)
- **세부 변경점**:
  - `model/TEST/backend/image_generator.py` 내 `SDTurboGenerator.generate` 함수에서 로컬 디스크 파일 저장 시도 블록과 이미지 무료 호스팅 API 업로드 루틴을 롤백(제거)하고, `pil_to_base64(image)` 메서드를 직접 호출하여 즉시 메모리 내 인코딩 스트림 문자열을 반환하도록 로직 개량.
  - `.gitignore` 최하단에 `model/TEST/frontend/static_images/` 경로를 추가하여 혹시 모를 로컬 이미지 캐시 생성이 Git 원격 리포지토리 변경이력에 간섭하는 현상 방지.
  - PowerShell 터미널을 경유하여 `static_images/` 내부의 `gen_*.png` 파일 28개를 일괄 제거하여 디스크 공간 클렌징 완료.

## 📌 19단계: 방장의 대기실 복귀 시 게스트 플레이어 대기실 자동 동기화 버그 수정
### 사용자의 지시 프롬프트 원문
> 방장이 대기실로 돌아가기 누르면 나머지 플레이어들은 대기실로 돌아가기 버튼을 안 눌러도 대기실로 돌아지는 버그가 있어 수정해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **결과 화면 상태 동기화 지연 전략(Deferred State Sync on Result Screen)**: 
   - 방장이 결과 화면(`screen-result`)에서 대기실로 돌아갈 때(`action: 'go-lobby'`), 게임 룸의 상태(`room.status`)가 `'waiting'`으로 전이되며 플레이어들의 스코어 및 개별 상태가 초기화됨.
   - 이때 게스트 플레이어들이 화면 폴링(`Polling`)을 통해 리셋된 상태를 주입받아 자동으로 대기실로 이동되거나 점수가 0으로 노출되는 것을 방어하기 위해, 현재 클라이언트 화면이 `screen-result`이고 룸 상태가 `waiting`인 조건에서는 상태 동기화 및 렌더링 갱신을 차단하는 가드 조건(Guard Condition)을 프론트엔드 폴링 루프 최상단에 주입.
2. **사용자 유도형 화면 전이 및 후속 동기화**:
   - 게스트가 결과 화면의 "대기실로 돌아가기" 버튼을 수동으로 누르면, `setCurrentScreen('screen-waiting')` 상태로 전이되어 방어 조건이 해제되고, 다음 폴링부터 대기실 상태를 정상 수신하도록 구조화.

---
## 🕒 작업 변경 이력 (Changelog)

### 🕒 2026-07-02 13:15 - 대기실 자동 동기화 방지 및 결과 화면 점수 유지 패치 완료
- **변경 목적**: 방장이 결과 화면에서 대기실로 이동하여 방 상태가 대기 중(waiting)으로 전환되더라도, 결과 화면에 남아 있는 게스트들의 화면이 조기에 동기화되어 튕기거나 점수가 0으로 노출되는 사용성 결함을 해결.
- **수정/추가된 파일**: [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
- **세부 변경점**:
  - `app/page.js` 내 상태 조회 폴링 이펙트(`useEffect`)에 `currentScreen === 'screen-result' && room.status === 'waiting'` 방어 코드 삽입.
  - 가드 발동 시 화면 강제 전환 및 플레이어 리액트 상태 업데이트를 스킵하여 결과 화면의 점수와 정보가 게스트가 수동으로 나가기 전까지 완벽히 보존되도록 개선.

## 📌 20단계: 전원 정답 시 라운드 조기 종료 및 실시간 다음 라운드/결과창 자동 이동 구현
### 사용자의 지시 프롬프트 원문
> 정답을 맞혀야 하는 플레이어들 모두가 정답을 맞추면 시간이 얼마나 남든 라운드가 종료되고 다음라운드로 넘어가게 해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **API 주도식 다음 라운드 동적 변환 (Backend-Driven Next Round Progression)**:
   - 다음 라운드로 넘어갈 때, 프론트엔드가 난수로 단어를 지정하여 `next-round` 액션을 보내던 기존 방식 대신, API 내에서 모든 게스트가 정답을 맞춘 시점에 단독으로 라운드 전이를 처리할 수 있도록 비즈니스 논리 이관.
   - 플레이어가 정답을 맞추는 시점에 해당 방의 전체 활성 게스트 수(`is_active = TRUE` 및 `id != drawerId`)와 정답을 맞춘 게스트 수(`status = 'correct'`)를 DB 상에서 즉각 대조.
   - 전원 정답이 확인될 경우, API 레벨에서 `word_list` 테이블을 `RANDOM()` 쿼리하여 무작위로 다음 제시어를 추출하고 다음 로테이션 출제자를 지정한 뒤, 트랜잭션(`BEGIN/COMMIT`)을 적용해 방 상태 및 플레이어 상태를 일괄 갱신.
   - 만약 마지막 라운드였을 경우, 방 상태를 `'result'`로 변경하여 최종 순위화면으로 전이되도록 연동.

---
### 🕒 2026-07-02 13:19 - 전원 정답 시 라운드 즉시 조기 종료 및 다음 라운드 전이 패치 완료
- **변경 목적**: 게스트 플레이어들이 시간 만료 전에 모두 정답을 맞춘 경우 불필요한 대기 레이턴시를 없애고, 라운드를 즉시 마쳐 다음 게임 단계로 자동으로 부드럽게 전이되도록 개선.
- **수정/추가된 파일**: [route.js](file:///c:/MiniProject/miniproject/app/api/rooms/action/route.js) (수정)
- **세부 변경점**:
  - `route.js` 상단에 데이터베이스 장애 및 누락 시 사용할 `DEFAULT_FALLBACK_WORDS` 배열 상수 선언.
  - `guess` 액션 분기 처리 영역에서 정답 수락 후 동일 방 내부의 출제자 제외 전체 활성 게스트와 정답자 수를 실시간 카운트 비교하는 체크 로직 신설.
  - 전원 정답 요건이 충족되면 `current_round < max_round` 분기 검사를 거쳐 `RANDOM()` 단어 조회, 다음 순번 출제자 쿼리, 트랜잭션 단위의 방/플레이어 리셋 업데이트를 실행하여 다음 라운드 조기 트리거 성공.
  - 라운드 도달 한계에 다다른 최종 라운드의 경우 방 상태를 `'result'`로 일괄 갱신하여 결과 창 전이 동기화.

## 📌 21단계: AI 생성 알림 소거 및 정답 중복 출력 버그 수정
### 사용자의 지시 프롬프트 원문
> ai가 그림을 생성할때마다 채팅에 그림이 생성되었습니다. 채팅이 생기는데 이거 없애주고 라운드가 끝날때 정답이 채팅으로 나오는데 이게 두번씩 나와 이거 하나만 나오게 해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **사용자 경험(UX) 최적화용 알림 메시지 배제(Minimal UI Notification)**:
   - AI 이미지 생성 시 캔버스 변경과 로딩 바, 이미지 메타정보 표시로도 이미지가 성공적으로 렌더링되었음을 플레이어가 인지할 수 있으므로, 채팅 로그에 중복해서 찍히던 `"AI가 새로운 그림 생성을 마쳤습니다"` 형태의 시스템 로그 제거 결정.
2. **소켓 및 폴링 간 채팅 노이즈 단일화 (Single Channel Notification System)**:
   - 타이머 만료 시 실시간 웹소켓 서버(`realtime-server`)에서 자체적으로 타이머 종료 문구를 쏘던 브로드캐스트와, Next.js 백엔드 `/api/rooms/action` 의 `reveal-answer` 시점에 DB `chat_messages` 테이블에 추가되던 데이터가 중복되어 두 번 출력되는 문제를 조치.
   - 웹소켓 서버 내의 타이머 만료 시 정답 브로드캐스트 부분을 소거하고, 오직 데이터베이스 폴링에 의한 단일 채널로 정답 메시지를 수집하도록 통합하여 중복 문제 제거.

---
### 🕒 2026-07-02 13:30 - AI 생성 알림 제거 및 정답 중복 출력 해결 완료
- **변경 목적**: 채팅 로그의 불필요한 시스템 안내를 제거하여 시인성을 높이고, 라운드 종료 시 정답 노출 문구의 이중 노출 문제를 조치하여 채팅 피드의 정확한 동기화 환경 제공.
- **수정/추가된 파일**:
  - [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
  - [server.js](file:///c:/MiniProject/miniproject/realtime-server/server.js) (수정)
- **세부 변경점**:
  - `app/page.js`의 `handleAiServerMessage` 의 `'done'` 케이스 및 `generateAiViaPollinations` 비동기 동작 완료 시 채팅 로그에 알림을 추가하던 `addSystemMsg` 구문 제거.
  - `realtime-server/server.js` 내 `requestAiImageGeneration` 성공 시점에 채팅 패킷을 쏘던 `this.broadcastToRoom` 구문 제거.
  - `realtime-server/server.js` 내 타이머 만료 핸들러 `handleTimerExpiration` 에서 정답을 전송하던 `this.broadcastToRoom` 구문을 삭제하여 Next.js 폴링에 의한 정답 1회 출력으로 일원화.

## 📌 22단계: 정답 미인식 SQL 바인딩 버그 수정 및 타이머 종료 중복 API 호출 제한
### 사용자의 지시 프롬프트 원문
> 정답을 입력해도 정답처리가 안되고 라운드가 끝날때 정답이 뭐였는지 알려주는 채팅이 2개씩 나와 이거 수정해

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **런타임 DB 바인딩 정밀화 (SQL Parameter Binding Correctness)**:
   - 전원 정답 시 라운드 조기 종료를 처리하던 `guess` 액션 내부에서 시스템 메시지(`chat_messages` 테이블) 인서트 쿼리 시, `$1` 위치에 들어갈 `[normalizedCode]` 매개변수 배열이 공급되지 않아 발생하던 500 DB 런타임 오류 해결.
   - 트랜잭션 롤백으로 인해 정답 상태 업데이트가 유실되던 문제를 바인딩 데이터 정상 주입을 통해 완치.
2. **참조 상태 기반 타이머 실행 조절기 (Timer Gate Lock via Ref)**:
   - React `timerSeconds` 상태 변화에 따라 인터벌 훅이 매초 재생성되며 임계치(0초) 도달 시 `handleTimerEnd`가 비동기 루프로 연속 실행되어, 방장 클라이언트가 `reveal-answer` API 요청을 2회 이상 보내던 버그 수정.
   - 컴포넌트 생명주기 동안 참조 정합성이 상시 유지되는 `timerEndTriggeredRef` 를 도입해, 1차 호출 즉시 게이트(Gate)를 잠그고, 새 라운드(`current_round` 변경)가 시작될 때 잠금을 풀어 중복 API 발송을 완전 차단.

---
### 🕒 2026-07-02 13:40 - 정답 미인식 롤백 오류 및 정답 이중 노출 버그 최종 해결
- **변경 목적**: 게스트가 정답을 맞춰도 백엔드 에러로 롤백되어 인정되지 않는 현상을 정상화하고, 타이머 만료 시 정답 공개 메시지가 두 번 나오는 중복 호출 해결.
- **수정/추가된 파일**:
  - [route.js](file:///c:/MiniProject/miniproject/app/api/rooms/action/route.js) (수정)
  - [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
- **세부 변경점**:
  - `route.js`의 `guess` 액션 내부에서 모든 참여자 정답 및 게임 오버 시스템 메시지 기록 쿼리에 `[normalizedCode]` 매개변수 인자를 공급하여 SQL 바인딩 크래시 방지.
  - `app/page.js`에 컴포넌트 레벨 가드 `timerEndTriggeredRef` 를 신설하여 `handleTimerEnd` 가 2회 이상 호출되는 동작을 조기 차단.
  - `app/page.js` 폴링 루프의 라운드 변경 감지 블록에 `timerEndTriggeredRef.current = false` 리셋 연동 장치 탑재.

## 📌 23단계: 대기실 봇 추가 영속화 및 봇 게임플레이 시뮬레이터 백엔드 연동
### 사용자의 지시 프롬프트 원문
> 게임 대기 화면에서 봇추가를 누르면 잠깐 생겼다가 지워진다 이거 수정해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **백엔드 DB 기반 봇 추가 기능 영속화**:
   - 프론트엔드 로컬 React 상태에만 봇 정보를 주입하던 기존의 불완전한 봇 추가 기능을 전면 개편.
   - `/api/rooms/action` API에 `invite-bot` 액션을 추가하여 봇 추가 요청 수신 시, 백엔드에서 봇 풀(`BOT_POOL`)을 기반으로 미사용 봇을 선정해 `players` 테이블과 `chat_messages` 테이블(입장 메시지)에 실제 레코드(`BOT-XXXX` 형태의 ID)로 인서트하여 영속화함으로써 폴링 동기화 시 봇이 소멸하는 버그 해결.
2. **봇 세션 만료 방지 및 생명주기 관리**:
   - `status/route.js` 의 하트비트 세션 만료 쿼리(12초 이상 비활성 정리)에 `id NOT LIKE 'BOT-%'` 조건을 주입하여 봇들이 방에서 자동으로 소멸되는 것을 차단.
   - 방에 살아있는 유저가 없어 방을 폭파하는 판단 기준 및 방장 위임 로직에서도 봇을 제외하고 실제 인간 플레이어 기준으로만 판정되도록 격리 처리.
3. **게임 플레이 내 봇의 출제자(Drawer) 배제**:
   - `start-game`, `next-round`, `guess`(조기종료) 액션의 출제자(Drawer) 선정 기준 쿼리에 `id NOT LIKE 'BOT-%'` 조건을 추가해 봇이 그릴 차례가 되어 게임이 멈추는 상황을 원천 예방.
4. **방장 대리형 봇 시뮬레이션 API 중계**:
   - 봇 시뮬레이터(`triggerBotGameplay`)가 방장(`isHost`) 화면에서 구동되어 봇의 정답 입력 타이밍이 도래하면 봇의 ID로 백엔드 `/api/rooms/action` (`action: 'guess'`) API를 호출하고, 잡담 발생 시에는 봇의 닉네임과 ID로 `/api/rooms/chat` API를 호출하도록 설계. 이를 통해 모든 게스트들의 화면에도 봇의 액션이 실시간 동기화되게 유도.

---
### 🕒 2026-07-02 13:48 - 대기실 봇 추가 영속화 및 봇 시뮬레이터 연동 완료
- **변경 목적**: 봇 추가 시 대기실 목록에서 봇이 사라지는 버그 해결 및 게임 진행 시 봇의 정답/잡담 시뮬레이션이 모든 플레이어 화면에 원활히 동기화되도록 연동.
- **수정/추가된 파일**:
  - [status/route.js](file:///c:/MiniProject/miniproject/app/api/rooms/status/route.js) (수정)
  - [action/route.js](file:///c:/MiniProject/miniproject/app/api/rooms/action/route.js) (수정)
  - [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
- **세부 변경점**:
  - `status/route.js`에서 비활성 유저 퇴장 및 방장 위임, 방 폭파 여부 검증 쿼리 시 봇을 검사 대상에서 일괄 예외 처리.
  - `action/route.js`에서 봇 추가(invite-bot) 로직을 개발하고, 게임 시작 및 라운드 전환 쿼리에서 출제자로 봇이 선정되지 않도록 보완.
  - `app/page.js`에서 봇 추가 시 `invite-bot` API를 쏘고, `triggerBotGameplay`에서 방장 브라우저 대행으로 봇의 채팅 및 정답 텍스트를 백엔드로 중계하도록 리팩토링.

## 📌 24단계: 대기실 내 방장 권한 강퇴 기능 및 알림 시스템 구현
### 사용자의 지시 프롬프트 원문
> 대기실에서 방장이 다른 플레이어들 강퇴하는 기능 생겼으면 좋겠어 강퇴 당한 플레이어는 강퇴 당하였습니다 알림창이 뜨게 해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **방장용 강퇴 UI 조건부 렌더링**: 대기실 플레이어 카드 렌더링 영역(`.lobby-player-slot`)에서 현재 사용자가 방장(`isHost === true`)이고 본인이 아닌 타인 플레이어 카드일 경우 강퇴 버튼(`.kick-player-btn`)을 활성화합니다.
2. **강퇴 트랜잭션 및 알림 발송 (Action API)**: `/api/rooms/action` 에 `kick-player` 액션을 신설하고 요청자가 방장인지 검증한 후, 대상 플레이어가 봇일 경우 물리적 삭제(`DELETE`), 유저일 경우 논리적 강퇴 상태(`status = 'kicked'`, `is_active = FALSE`)로 DB를 업데이트하고 퇴장 알림 시스템 메시지를 기록합니다.
3. **강퇴 자원 정리 및 상태 전파 (Status API)**: `/api/rooms/status` 호출 시, `playerId`가 강퇴당한 유저(`status = 'kicked'`)인 경우 자원 누수 방지를 위해 DB에서 해당 유저를 완전히 `DELETE` 하고, HTTP 403 status와 함께 `kicked: true` JSON 응답을 반환합니다.
4. **클라이언트 예외 처리 및 화면 리디렉션**: 프론트엔드 폴링 에러 분기에서 HTTP status가 403이면서 `kicked === true` 인 경우 폴링 루프를 `clearInterval` 하고 `"강퇴 당하였습니다"` alert를 표시한 뒤 상태값을 리셋하여 로비(`screen-landing`)로 세션을 퇴장시킵니다.

## 📌 25단계: 대기실 내 플레이어 준비 시스템 및 방장 시작 조건 강제 구현
### 사용자의 지시 프롬프트 원문
> 그리고 대기방에 준비버튼을 만들어서 방장을 제외한 플레이어들이 모두 준비 버튼을 눌러야 방장이 게임시작을 할 수 있게 해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **게스트 초기 준비 상태 설정 (Join API)**: 신규 플레이어가 방에 참가할 때(`join` API) 기본 `status`를 `'waiting'`으로 설정하여 입장 즉시 준비 완료로 오인되는 문제를 차단합니다.
2. **준비 상태 토글 분기 및 대기실 리셋 (Action API)**: `/api/rooms/action` 에 `toggle-ready` 액션을 추가하여 플레이어가 자신의 상태를 `'ready'`와 `'waiting'`으로 교차 토글할 수 있게 하고, `go-lobby` (결과창에서 대기실 복귀) 시 방장은 `'ready'`, 그 외 유저들은 `'waiting'`으로 리셋합니다.
3. **대기실 동적 뱃지 렌더링 (Frontend)**: 폴링 상태 매핑 시 대기방 상태일 경우 플레이어 뱃지 디자인(`.ready-badge`)을 분기(방장: `'방장'`, 준비 완료: `'준비완료'`, 준비 중: `'준비중'`)하여 렌더링하고, 게스트용 하단 바에 준비 토글 버튼을 제공합니다.
4. **시작 조건 강제화**: 방장을 제외한 모든 게스트(`!p.isOwner`)가 `'ready'` 상태에 도달할 때만 방장 화면의 "게임 시작" 버튼이 활성화되도록 제어하며, 비활성 시 가이드 배너를 표시합니다.

## 📌 26단계: 게임 진행 중 게스트 중도 입장 차단 시스템 구현
### 사용자의 지시 프롬프트 원문
> 그리고 게임시작하면 중간에 참여가 안되게 해줘 게임 대기중일때만 코드를 입력해서 방에 참가 할 수 있게 해줘

### 기술적 해결책 및 아키텍처 의사결정(ADR) 요약
1. **방 상태 검증 가드 추가 (Join API)**: 외부 게스트가 대기방 코드를 입력해 입장을 요청할 때(`join` API), 방 존재 여부 쿼리 직후 `room.status !== 'waiting'` 여부를 검증합니다.
2. **입장 권한 제약 피드백**: 방 상태가 대기방(`waiting`)이 아닐 경우(게임 진행 중이거나 최종 결과 화면 상태), 입장을 전면 거부하고 HTTP 400 Bad Request 에러(`error: '이미 게임이 진행 중이거나 종료된 방입니다.'`)를 즉각 전달합니다.
3. **클라이언트 에러 시인성 렌더링**: 프론트엔드는 400 에러 메시지를 수신하면 초대 코드 입력창 하단에 예외 오류를 빨간색 텍스트로 자연스럽게 렌더링하여 중도 난입 및 어뷰징 행위를 방지합니다.

---
## 🕒 작업 변경 이력 (Changelog)

### 🕒 2026-07-02 14:05 - 대기실 방장 권한 강퇴 기능 및 클라이언트 퇴장 알림 연동 완료
- **변경 목적**: 대기실에서 방장이 원치 않는 플레이어(실제 유저 및 봇)를 강퇴시킬 수 있게 하고, 강퇴당한 유저는 알림창 팝업 후 로비로 튕기도록 처리
- **수정/추가된 파일**:
  - [route.js](file:///c:/MiniProject/miniproject/app/api/rooms/action/route.js) (수정)
  - [route.js](file:///c:/MiniProject/miniproject/app/api/rooms/status/route.js) (수정)
  - [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
  - [globals.css](file:///c:/MiniProject/miniproject/app/globals.css) (수정)
  - [prd.md](file:///c:/MiniProject/miniproject/prd.md) (신규)
- **세부 변경점**:
  - `action/route.js` 내에 `kick-player` 액션을 추가하여 방장 권한 검증 후 봇은 물리 삭제(`DELETE`), 유저인 경우 `status = 'kicked'` 및 `is_active = FALSE`로 상태 업데이트 후 시스템 메시지를 전파하도록 구현.
  - `status/route.js` 내 하트비트 세션 갱신 로직 진입 전에 플레이어가 `status === 'kicked'`인지 검증하여 즉시 DB에서 삭제하고 HTTP 403 에러(`kicked: true`)를 돌려주도록 처리.
  - `app/page.js` 내 비동기 `kickPlayer` 함수를 구성하고 대기실 UI 플레이어 카드 내에 방장 전용 강퇴 버튼을 추가. 폴링 오류 시 403 status와 `kicked: true`를 감지하면 폴링 인터벌 클리어 및 `"강퇴 당하였습니다"` alert를 띄운 후 로비(`screen-landing`) 화면으로 상태를 리셋하여 튕겨내도록 예외 처리 보완.
  - `app/globals.css` 파일 하단에 카툰 테마에 맞추어 스타일링한 `.kick-player-btn` 속성을 추가하고, Next.js 프로덕션 빌드 성공 여부를 통해 정합성을 검증함.

### 🕒 2026-07-02 14:10 - 대기실 준비 시스템 및 방장 시작 조건 강제화 연동 완료
- **변경 목적**: 방장 이외의 게스트 유저들의 준비완료 상태에 따라 방장의 게임 시작을 조건부 제어하고 대기실에 직관적인 준비 뱃지 UI 노출
- **수정/추가된 파일**:
  - [route.js](file:///c:/MiniProject/miniproject/app/api/rooms/join/route.js) (수정)
  - [route.js](file:///c:/MiniProject/miniproject/app/api/rooms/action/route.js) (수정)
  - [page.js](file:///c:/MiniProject/miniproject/app/page.js) (수정)
  - [globals.css](file:///c:/MiniProject/miniproject/app/globals.css) (수정)
  - [prd.md](file:///c:/MiniProject/miniproject/prd.md) (수정)
- **세부 변경점**:
  - `join/route.js`에서 신규 유저가 조인할 때 초기 `status`를 `'waiting'`으로 설정하여 입장 즉시 준비상태가 되지 않도록 격리.
  - `action/route.js`에 `toggle-ready` 액션(status를 ready와 waiting으로 교차 업데이트)을 추가하고, `go-lobby` 시 방장은 `ready`, 게스트는 `waiting`으로 분기 초기화되도록 수정.
  - `app/page.js`에 `toggleReady` 비동기 통신을 추가하고, 폴링 루프 매핑 시 `displayStatus`와 `rawStatus`를 추출하도록 보완. UI 내에 준비 토글 버튼과 방장/준비완료/준비중 뱃지(`.ready-badge`)를 추가하였으며, 방장 시작 버튼 비활성화 및 경고 가이드를 바인딩함.
  - `app/globals.css` 파일 하단에 카툰 테마에 매칭되는 `.ready-badge`, `.lobby-player-slot.is-ready` 배경 카드 및 버튼 호버 스타일을 구축하여 디자인 완성도를 확보함.

### 🕒 2026-07-02 14:13 - 게임 진행 중 게스트 중도 입장 차단 연동 완료
- **변경 목적**: 게임이 시작된 이후 외부 참가자가 대기방 코드를 입력해 임의로 중도 참여(난입)하는 문제를 백엔드에서 원천 차단
- **수정/추가된 파일**:
  - [route.js](file:///c:/MiniProject/miniproject/app/api/rooms/join/route.js) (수정)
  - [prd.md](file:///c:/MiniProject/miniproject/prd.md) (수정)
- **세부 변경점**:
  - `join/route.js` 내 방 존재 확인 루틴 직후 `room.status !== 'waiting'` 가드 조건을 추가하여 대기실 상태가 아닐 경우 입장을 불허하고 HTTP 400 에러와 명확한 사유 메시지를 반환하도록 리팩토링 진행.

