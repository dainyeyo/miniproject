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
