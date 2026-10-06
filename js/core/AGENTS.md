# js/core — 화면 없는 엔진

## 맡는 것
- `save.js`: 로컬 저장소 열쇠 하나(`yetnorae-seogo-v1`)의 문서 읽기·쓰기, 이름 기록(만들기·고르기·지우기·모습 바꾸기), 기기 공통 설정, 불러올 때 바로잡기(`normalizeData`·`normalizeProgress`), 버전 옮기기(`MIGRATIONS`).
- `progress.js`: 기록 하나의 진행 규칙(관 열림, 꽂기·빼기·판정, 행선지, 개념 확인, 작품 방 완료, 보스 단계, 엔딩, 이어 하기 위치). 조정 값은 `TUNABLES`.
- `judge.js`: 판정 규칙 순수 함수(`judgeArea`, `routeStray`, `judgeUnseenPlacement`, `judgeSingerGroup` 등)와 자리 수 `AREA_SIZES`.
- `rhythm.js`: 박자 칸(`buildGrid`), 탭 판정 회차(`createTapSession`, ±150ms), 박자 보정(`calibrationOffset`), 리믹스 칸과 회차(`buildRemixGrid`, `createRemixSession`), 박자 없는 상태(`noBeatState`). 시각만 다루고 소리를 내지 않는다.
- `audio.js`: Web Audio 소리 엔진(낭송 조각 예약, 배경음과 낭송 중 줄이기, 장구·효과음, 첫 조작 잠금 풀기, 멈춤과 재개, `rhythm:no-beat`·`audio:missing` 내기).
- `events.js`: 앱 하나의 사건 버스(`on`, `off`, `emit`).
- `cards.js`: 결과 카드 자료(`buildWingCard`, `buildFinalCard`), 파일 이름.
- `song-shape.js`: 노래 모양 계산(글자 수, 낭송 조각 경로, 감정서 `deriveSheet`, 개념 도출). 재기 화면·소리·검증기·도구가 함께 쓴다.
- `validate.js`: 데이터 검증기(오류 코드 `FIELD`·`FORM`·`EVIDENCE`·`KEEPSAKE`·`CITATION`·`TABLE`·`ROUTING`·`TABLE_SHAPE`·`MISSING`·`DUPLICATE`·`INK`·`REMIX`·`NOTEBOOK`).

## 맡지 않는 것
- 화면, DOM, 사건에 따른 연출. 디오라마 사건(`diorama:*`)을 내지 않는다. 그것은 `js/play/`, `js/measure/`, `js/boss/`가 낸다.
- 카드 그림(`js/result/`), 세계와 화면 방향(`js/world/`), 노래 데이터 자체(`js/data/`).
- 이 폴더는 `js/data/`와 자기 폴더만 import한다. `js/world/`, `js/play/`, `js/registry.js`를 import하지 않는다.

## 불변식
- `save.js`·`progress.js`·`judge.js`·`cards.js`는 `location`, `URLSearchParams`, `document`, `window`, `localStorage`, `sessionStorage`, `navigator`를 쓰지 않는다(주석 빼고 낱말 검사). 저장소·시계·사건 내기·id 만들기는 인자(`createStore({ storage, emit, now, makeId })`, `createProgress({ progress, songs, table, emit, now, save, tunables })`)로 받는다.
- 진행 엔진 객체는 얼려 있고(`Object.freeze`), 관 상태를 직접 바꾸는 공개 함수가 없다. 이름에 `unlock`·`setState`·`setWing`·`skip`·`force`·`debug`·`cheat`가 든 공개 함수를 만들면 점검이 실패한다. 관은 `completeTutorial`과 판 마치기(`checkWingDone`)로만 열린다.
- 모든 행동은 `{ ok, reason?, … }`을 돌려준다. `ok: false`인 행동은 아무것도 바꾸지 않고 저장하지 않는다. 기록을 바꾼 행동은 끝에서 `save()`를 부른다(보스 2단계의 중간 지점 맞힘만 저장하지 않는다).
- 개념 상태는 되돌아가지 않는다. 여러 노래를 한꺼번에 확인하면 다 더한 뒤 상태를 정한다.
- 불러올 때 관·보스·엔딩 상태는 저장된 `state`가 아니라 표시와 순서에서 다시 계산한다. 앞 관이 `done`이 아니면 `locked`, 다섯 관이 `done`이 아니면 보스 `locked`, 낯선 노래 다섯이 `done`이 아니면 보스는 `stage1`을 넘지 않는다, 보스가 `done`이 아니면 `ending.completed`는 거짓.
- 더 새 버전의 저장 문서는 절대 덮어쓰지 않는다(`writable = false`).
- 보스 1단계의 '누가 불렀을까' 전 상태(`pendingSinger`)와 2단계 찾은 지점(`stage2Found`)은 메모리에만 둔다. 보스를 나갔다 오면 그 노래와 2단계를 처음부터 한다.
- 카드 자료에 매기는 값이 없다. `check-engine`은 카드 자료의 모든 열쇠 이름(속까지)에서 `score|grade|rank|point|percent`와 한국어 낱말을 찾으므로, 새 열쇠 이름에 `point` 같은 말을 쓰지 않는다.

## 구현 방식
- 판정은 `judge.js`의 순수 함수가 하고, `progress.js`가 결과를 기록(고정·비움·오답 수·개념·기념품·행선지)과 사건으로 옮긴다. 판정 규칙을 고칠 때는 `judge.js`를, 기록 방식을 고칠 때는 `progress.js`를 고친다.
- `audio.js`의 바깥 기댐은 `deps`(`createContext`, `loadBuffer`, `bus`, `timers`, `now`, `baseUrl`)로 바꿔 끼운다. 점검 페이지는 가짜 소리 판과 빠른 시계를 끼운다. 첫 조작 전에는 소리 판을 만들지 않고, 그 전의 배경음 요청만 기억한다.
- 소리 엔진은 `orientation:pause`와 `audio:pause`(까닭: `orientation`·`hidden`·`menu`)를 스스로 듣고, 까닭이 모두 풀려야 다시 연다. 다시 열면 진행 중이던 단위를 처음부터 내고 판정 회차의 `arm`을 다시 부른다.
- 보스 2단계는 `rhythm.js`의 `createRemixSession`(`REMIX_WINDOW_MS` 앞 700·뒤 1500ms)으로만 판정한다. `progress.js`의 `bossStage2Tap` 시각 입력 갈래와 `judge.js`의 `judgeRemixTap`·`REMIX_TAP_WINDOW_MS`는 제품에서 쓰이지 않는다. 판정 창을 바꾸려면 `rhythm.js`를 고친다.
- 저장 형식을 바꾸면 `SAVE_VERSION`을 올리고 `MIGRATIONS[옛 버전]`에 옮기는 함수를 더한다. 저장 열쇠를 바꾸면 `js/world/motion.js`의 같은 상수도 바꾼다(움직임 줄이기를 저장에서 직접 읽는다). 기본 소리 크기는 `save.js`의 `defaultDevice`와 `audio.js`의 `DEFAULT_VOLUME`이 같아야 한다.
- 조정 값은 `TUNABLES`(진행), `rhythm.js` 머리의 상수(박자), `audio.js` 머리의 상수(소리), `song-shape.js` 머리의 비율에 모여 있다. 값만 바꾸고 규칙 모양은 바꾸지 않는다.

## 점검
- `node tests/check-engine.mjs`: 행동마다 양성·음성 사례(건너뛰기 시도, 덜 찬 칸, 행선지 표 전체, 먹 전환, 보스 열림과 단계 기록, 같은 이름, 저장 실패, 더 새 버전, 손댄 저장 바로잡기, 소스의 금지 낱말). Node만, 브라우저 없음.
- `node tests/check-rhythm.mjs`: 일정 박자 배치, 판정 창 경계 안팎(정확히 150ms 포함), 보정값 적용, 멈춤·재개 때 단위 처음부터, 리믹스 지점. 일부는 `tests/pages/audio-test.html`을 브라우저로 연다.
- `node tests/check-data.mjs`: 검증기를 실제 데이터와 시험용 묶음(`tests/fixtures/valid-set.mjs`, `tests/fixtures/negative/*.mjs`)으로 시험한다. 검증 규칙을 더하면 그 규칙에 걸리는 음성 사례 파일을 `negative/`에 더한다.
- 엔진을 고치면 이 셋과 함께 `check-wingflow`, `check-boss`, `check-story`(엔진을 쓰는 화면)를 돌린다.
