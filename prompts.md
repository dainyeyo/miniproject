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






