# js/boss — 보스전 「서고의 밤」

## 맡는 것
- `boss.js`: `start(ctx) → Promise<{ completed, reason?, already? }>`(앱 흐름이 쓰는 길), 화면 약속 `show(container, ctx)`(화면 이름 `boss`), 조정 값 `BOSS_TUNING`. 세 단계를 화면으로 잇는다.
  - 1단계: 낯선 노래 다섯을 회색 글줄로 → 재기(`openMeasure({ mode: 'boss', container: 보스 화면 오른쪽 반, journal, journalGlow })`, 세계의 반반 틀은 쓰지 않음) → 다섯 관 자리에 꽂기(노래마다 바로 판정) → 맞으면 '누가 불렀을까?'
  - 2단계: `remix-stage.js`의 `runRemixStage`로 엉킨 낭송에서 갈래가 바뀌는 순간 짚기
  - 3단계: 좀 대왕이 삼킨 「태산이 높다 하되」를 다시 재어(보스 방식, 다섯 도구) 시조 자리에 꽂기
- `scene3d.js`(보스 화면 안의 작은 그림판), `scene2d.js`(`board/boss` 그림 위 DOM 겹), `dom.js`(관 자리 모양, 일지 서랍).
- 보스 글은 `js/data/boss-text.js`(`BOSS_TEXT`, `BOSS_SPEAKERS`), 리믹스 조각은 `js/data/remix.js`.

## 맡지 않는 것
- 판정과 기록. 맞는지, 처음에 맞혔는지, 일지 도움, 단계 넘어가기, 보스 완료는 모두 진행 엔진(`bossPlaceUnseen`, `bossChooseSinger`, `bossStage2Tap`, `bossPlaceStage3`, `enterBoss`, `leaveBoss`, `currentUnseen`)이 한다. 이 화면은 결과를 보이기만 한다.
- 노래 순서. 1단계 순서는 노래 표의 `unseenOrder`와 `currentUnseen()`이 정한다. 화면에서 순서를 섞거나 고르지 않는다.
- 보스 문과 엔딩(앱 흐름 몫). 끝나면 앱이 `leaveBoss()`를 부르고 회랑이나 엔딩으로 간다.
- `js/story/`를 import하지 않는다.

## 불변식
- 보스 뿌리(`.boss`)에는 `data-world-cover`가 붙는다. 세계 바탕은 보스 화면이 떠 있는 동안 그리지 않는다(`js/world/world.js` '가림'). 보스 그림판은 소프트웨어 그리기에서 MSAA를 끄고(`world/gfx/t39-perf.js`), 열릴 때 세계의 화질 단계 픽셀 몫을 따른다.
- 이 폴더의 `.js` 파일과 `js/data/remix.js`·`js/data/boss-text.js`·`css/boss.css`의 글에는 주소 인자 읽기, 점검용 낱말(`__b`, `__test`, `stub`), 평가를 매기는 한국어 낱말, `http://`·`https://` 주소(SVG 이름공간 주소만 예외)가 **주석을 포함해** 하나도 없다(`check-boss`가 글 전체를 훑는다).
- 무작위가 없다. 모든 학생이 같은 순서로 같은 노래와 같은 리믹스를 만난다. 3단계 '지워진 글줄'도 정해진 무늬(`erasedEvery`)로 지운다.
- 시간 제한도 실패로 끝나는 판도 없다. 틀리면 먹안개가 `fogPulseMs`(1.4초) 동안 짙어질 뿐이다.
- 보스 동안 『분류 수첩』은 닫히고 사서 일지만 열린다. 보스 화면은 `container`를 꽉 덮고(`z-index: 28`), `container`와 세션 뿌리에 `has-boss`를 붙여 한 판 화면의 수첩 단추를 숨긴다.
- 1단계 재기 전에는 관 자리가 눌리지 않는다. '누가 불렀을까'는 맞게 꽂은 뒤에만 나오고, 틀려도 정답 무리(여럿일 수 있음)를 함께 보이고 다음으로 간다.
- 2단계 판정은 한 곳에서만 한다: 박자 방식이면 박자 엔진의 리믹스 회차(`createRemixSession`, 앞 700·뒤 1500ms)가 탭을 판정하고, 결과를 진행 엔진에 `{ line: 맞힌 지점의 단위 번호 | -1, switchLines: grid.switches }`로 넘긴다. 이미 맞힌 지점 근처(`repeat`)는 넘기지 않는다. 진행 엔진의 시각 입력(`tapMs`)은 쓰지 않는다. 박자 없는 방식(소리 끔·빗금·소리 판을 열 수 없음)이면 이어 붙은 글줄(단위마다 한 줄, 오늘 소리, 갈래 이름 없음)을 보이고 누른 줄의 단위 번호를 같은 모양으로 넘긴다.
- 2단계 틀림에 싣는 관련 개념은 틀린 탭이 난 조각(또는 누른 줄)의 갈래 개념이다.
- 이어 하기: 마친 단계와 1단계 노래별 기록은 엔진에 남고, 하던 1단계 노래·2단계·3단계는 처음부터 한다. 보스를 마쳤으면(`already`) 다시 열리지 않는다.
- 3단계에서 시조 자리에 꽂아 보스를 마치면 `diorama:slot-set { area: 'mentor', index: 0, songId: 'taesan' }`을 낸다(시조관 '선대 사서의 자리').

## 구현 방식
- `start`는 `ctx`에서 `session`, `container`, `signal`, `rhythm`(없으면 `session.rhythm`)을 본다. 나가기와 바깥 중단을 하나의 `AbortController`로 묶고, 끝날 때 스스로 치운 뒤 `progress.leaveBoss()`를 부른다(앱이 다시 불러도 해가 없다). 마치면 `{ completed: true }`, 이미 마친 기록이면 `{ completed: true, already: true }`, 나가면 `{ completed: false, reason: 'left' }`, 들어갈 수 없으면 `enterBoss()`가 돌려준 까닭 그대로(`{ completed: false, reason: entered.reason }`, 예: `'boss-locked'`), 중단 신호면 `AbortError`.
- `show`는 세션이 없으면 만들고, 끝나면 `ctx.go('ending' | 'play', { session })`.
- 2단계 놓친 지점은 한 바퀴가 끝나면 `remixReplaySegments`(앞 조각의 끝 단위 + 뒤 조각의 첫 단위)를 바로 다시 들려주고, 그래도 남으면 '놓친 곳 다시 듣기' 단추를 둔다.
- 3단계 다시 재기도 다섯 도구 방식이다(재기 화면에 도구를 시조 것만으로 줄이는 방법이 없다. 계단 오르기를 그 가운데 하나로 쓴다).
- 박자 손잡이는 재기 화면의 `{ engine, buildGrid?, createTapSession?, offsetMs? }`에 `buildRemixGrid`·`createRemixSession`을 더 받는다(점검 페이지가 빠른 박자 칸을 끼우는 데 쓴다).
- 배경음 `boss`, 효과음 `fog`(틀림), `place`, `gold`. 그림 `sprite/jom`, `sprite/jom-king`, `sprite/mentor`, `board/boss`.

## 점검
- `node tests/check-boss.mjs`(`tests/pages/boss.html`): 열림 조건, 단계별 진행과 기록(처음 맞힘, 일지 도움, 누가 불렀을까), 같은 단계 세 번 틀림의 일지 반짝임, 박자 방식과 박자 없는 2단계, 중간에 나갔다 들어오기, 3D와 2D, 화면·카드 자료에 매기는 말이 없는지, 소스 정적 검사와 그 음성 사례.
- 보스를 고치면 `check-story`(보스 문과 엔딩 연결)와 `check-playthrough`도 돌린다.
