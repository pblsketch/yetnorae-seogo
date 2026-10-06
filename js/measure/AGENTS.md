# js/measure — 재기 화면

## 맡는 것
노래를 잡은 뒤의 증거 모으기 전부. 바깥 손잡이는 `measure.js`의 `openMeasure(ctx) → Promise<감정서>` 하나다.
- 흐름: 두루마리(원문 → 오늘 소리 → 풀이, 누를 때마다 바뀜) → 접기(`fold.js`) → 두드리기 또는 빗금(`tap.js`) → 고유 동작(`actions/<동작 id>.js`) → 감정서(`sheet.js`).
- 『분류 수첩』과 보스용 사서 일지 서랍(`book.js`), 첫 사용 손가락 안내(`intro.js`), 글 보기(`view.js`, `text.js`), 화면 글(`labels.js`).
- 고유 동작 다섯: `aa-door`('아아' 문 열기), `refrain-link`(후렴 고리 걸기), `stairs`(계단 오르기, 입구 튜토리얼도 이것), `walk`(걷기), `rapid-unroll`(연타로 풀기). 모두 `start(ctx) → Promise<증거>`.
- `mode: 'boss'`면 다섯 고유 동작을 도구로 골라 쓰고(결과에 쓴 순서대로 `actions`가 더 붙음), 수첩 대신 일지를 열며, 단위 이름을 갈래가 드러나지 않게 '덩이'로 쓴다.

## 맡지 않는 것
- 판정과 기록. 재기는 아무것도 저장하지 않고 진행 엔진을 부르지 않는다. 다 잰 사실(`markMeasured`)은 부르는 쪽(한 판 흐름, 입구, 보스)이 기록한다.
- 소리 재생과 박자 계산 자체(`js/core/audio.js`, `js/core/rhythm.js`를 `ctx.rhythm`으로 받는다).
- 세계 배치. 반반 틀은 `ctx.world.openSplit`/`closeSplit`으로 빌린다(없으면 `ctx.container`에 붙인다).
- 설정 저장. 빗금 권유를 받아들이면 `ctx.setSlashMode(true)`를 부를 뿐이다.
- `js/play/`, `js/boss/`, `js/story/`를 import하지 않는다.

## 불변식
- **다 잰 감정서는 언제나 `deriveSheet(song, 동작 id)`(`js/core/song-shape.js`)와 같다.** 재기는 노래의 실제 모양대로만 이끈다. 학생 입력으로 감정서 값이 달라지는 길을 만들지 않는다.
- 재기 중의 실수는 어떤 기록도 남기지 않는다. 실제 경계가 아닌 곳을 누르면 흔들림(`shake`)만 있다.
- 감정서에 갈래 이름 칸을 두지 않는다.
- 두드리기는 `createTapSession`(±150ms, 보정값 `ctx.rhythm.offsetMs`를 뺌)으로만 판정한다. 한 단위에서 박을 놓치면 그 단위만 다시 듣고, 놓친 박이 한 재기에서 모두 3개가 되는 순간 빗금을 한 번 권한다.
- 박자 없는 방식(소리 끔·빗금 모드, `rhythm:no-beat`)에서는 시간 제한 없이 빗금으로 같은 증거를 얻는다. 재기 도중 방식이 바뀌어도 마친 단위는 그대로 둔다.
- 낭송 조각이 없어도 막히지 않는다(소리 엔진이 딸깍 소리로 박을 이어 간다).
- 고유 동작은 다른 갈래의 노래라도 지금 관의 동작을 쓰고, 해당이 없으면 `applicable: false`로 끝낸다. 결과는 `deriveActionEvidence(동작 id, song)`과 같다.
- 동작마다 왼쪽 디오라마에 반응 사건을 낸다: 접힘마다 `diorama:fold { unit }`(접힌 경계 **앞** 단위 번호), 인정한 박·빗금마다 `diorama:pillar-light`, 향가 구를 마칠 때 `diorama:floor-fill { gu }`, 그리고 `aa-door`·`stair-step`·`refrain-link`·`walk-step`·`unroll`. 놓쳐서 다시 듣는 단위의 박은 다시 낸다.
- 미리 잰 노래(`ctx.preMeasured`)는 감정서가 채워진 채 열린다. `true`면 그 노래를 이 관으로 보낸 관의 동작으로 계산한다.
- 세로 회전(`orientation:pause`) 동안 판정이 멈추고, 돌아오면 진행 중이던 단위를 처음부터 다시 듣는다. 중단 신호(`ctx.signal`)가 오면 반반 틀을 닫고 `AbortError`로 끝난다.

## 구현 방식
- 화면 글은 모두 `labels.js`에 둔다(교사 확인 대상, 글 확인 문서가 이 파일을 읽는다). 글을 고치면 글 확인 문서를 다시 만든다.
- 고유 동작은 재기 화면이 넘기는 `{ view, controls, setHint, emit, getNoBeat }`가 있으면 그것을 쓰고, 없으면 `actions/common.js`로 `container` 안에 스스로 만든다(단독 점검용).
- 첫 사용 안내: 공통 동작(접기·두드리기)은 첫 노래(입구 튜토리얼) 하나뿐이고, 관의 고유 동작은 그 관에 처음 들어왔을 때만 보인다. 본 뒤 `ctx.onIntroSeen('common' | 'unique')`를 부르고, 저장은 부르는 쪽이 한다. 움직임 줄이기면 손가락이 움직이지 않는다.
- 수첩 서랍은 열려 있는 동안 `help:notebook-glow`를, 일지 서랍은 `help:journal-glow`·`concept:changed`를 듣고 반짝인다.
- 스타일은 `css/measure.css`.

## 점검
- `node tests/check-measure.mjs`(`tests/pages/measure.html`): 갈래별 시험 노래로 접기 경계, 음보 수, 고유 동작 증거가 데이터 계산과 같은지, 빗금 모드와 소리 끔에서 같은 증거, 놓친 박 처리와 빗금 권유, 반응 사건(크롬북 크기), 넘침 없음(844×390에서 글자 크기 1·1.15·1.3만 본다). `MEASURE_ONLY=phone`은 화면 크기 부분만 돌린다(손볼 때만).
- 재기를 고치면 `check-wingflow`, `check-boss`, `check-story`(입구 튜토리얼), `check-playthrough`가 함께 영향을 받는다.
