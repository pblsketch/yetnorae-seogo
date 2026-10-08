# js/play — 세션과 관 한 판

## 맡는 것
- `session.js`: 앱 하나에 하나뿐인 **세션** `createSession(...) → Promise<세션>`. 저장 엔진 하나, 그 기록의 진행 엔진 하나, 소리 엔진 하나, 세계 바탕 하나를 묶고, 입구·보스·엔딩·기록 화면이 함께 쓴다. 로컬 저장소 고르기(`safeLocalStorage`, 읽기만 해도 오류면 `null` → 메모리로만), 자산 목록 한 번 읽기(`loadManifest`), 장소마다 배경음, 창 숨김의 `audio:pause`/`resume { reason: 'hidden' }`, 저장 실패 알림.
- `wing.js`: 관 한 판 `createWingPlay(세션, 관 id)`. 들어가기(전제 알림 `L.premise`) → 뒤섞인 노래 잡기 → 형식 분석(`openMeasure`) → ④ 갈래 판별(`ctx.decide` → 진행 엔진 `decideGenre`. 틀리면 `openGenreContrast`) → 그 관 갈래는 손에, 다른 갈래는 행선지와 함께 바구니에 저절로(차면 판정·보냄) → 칸·탑 꽂기 → 다 차면 판정(진행 엔진) → 제본·금박·먹안개 / 틀린 노래만 삐져나옴 → 가객과 기념품 → 작품 방 → 판의 끝(단청, 판 카드, 다음 관 문틈 소리, 덤). 조정 값 `PLAY_TUNING`.
- `play-screen.js`(화면 이름 `play`), `screens.js`(『분류 수첩』·사서 일지·도감·다시 듣기 화면, 이름 `notebook`·`journal`·`collection`), `ceremony.js`(가객 한 소절과 기념품 석 장, 칸이 묶일 때 단위 이름 한 줄 `lead`), `keepsake.js`(기념품 카드 한 장), `contrast-panel.js`(오답 뒤 맞대어 보기 창), `labels.js`(화면 글), `dom.js`.

## 맡지 않는 것
- 규칙 판단. 맞는지, 무엇이 고정되는지, 어디로 보내지는지, 개념이 어떻게 바뀌는지는 모두 진행 엔진(`js/core/progress.js`)이 정한다. 이 폴더는 엔진의 공개 함수를 부르고 결과를 보일 뿐, `progress` 객체의 값을 직접 고치지 않는다.
- 재기 내용(`js/measure/`), 작품 방 내용(`js/rooms/`, `registry.rooms`로 받음), 카드 그림(`js/result/`), 세계 그리기(`js/world/world.js`만 부름).
- 시작 화면, 입구 문, 보스 문, 엔딩(`js/story/`가 세션 갈고리 `store`·`audio`·`onCorridorArrive`·`clues`로 얹는다).

## 불변식
- 세계를 꽉 덮는 겹(판 카드 `.play-card`, 수첩·일지·도감 창 `.play-panel`)의 뿌리에는 `data-world-cover`를 단다. 세계 바탕이 그 뒤에서 그리지 않는다(`js/world/world.js` '가림'). 반투명 겹(노래 부른 이 소개, 기념품 줄)에는 달지 않는다.
- 이 폴더의 `.js` 파일에는 주소 인자 읽기(`location.search`, `location.hash`, `URLSearchParams`), 점검용 낱말(`__wf`, `__test`, `stub`), 평가를 매기는 한국어 낱말이 **주석을 포함해** 하나도 없다(`check-wingflow`가 파일 글 전체를 훑는다).
- 디오라마 사건(`diorama:*`)은 이 화면이 낸다. 관에 들어온 직후 지금 상태를 다시 낸다: `diorama:slot-set`(칸·덤·판정 전 바구니, `returned` 0~3, 보스를 마쳤으면 시조관 `mentor`) → 묶였으면 `diorama:shelf-bound` → `diorama:fog-recede`. 바구니에서 이미 보낸 노래는 다시 그리지 않는다. 처음 띄울 때 기록의 관 상태를 `wing:state`로 한 번씩 다시 내고 마친 관은 `setDancheong(관, 1)`로 알린다.
- 판정에서 돌아온 노래마다 `diorama:pop-out`을 내고, `popOutMs`(2.4초) 뒤 그 자리가 비어 있으면 `slot-set { songId: null }`. 바구니에서 보낸 노래는 `sentMs`(1.2초) 뒤 비운다.
- 갈래 판별(교사 결정 2026-10-08): 분석 화면에 `decide: (갈래, 분석표) => …`를 넘긴다(미리 분석한 노래는 넘기지 않는다). 맞으면 `{ correct: true, note }`(note: 칸 `L.decidedOwn`, 탑 `L.decidedTower`, 덤 `L.decidedBonus`, 다른 갈래 `L.decidedStray(행선지 관)`). 틀리면 수첩 도움 알림(`r.help`) 뒤 `openGenreContrast(session.root, { song, sheet, genre: 고른 갈래, notebook, neutral })`가 닫힐 때까지 기다리고 `{ correct: false }`(분석 화면에서 다시 고름). 분석 화면이 닫히면(확인 전에 그만두어도) 판별로 바구니에 담긴 노래를 `slot-set { area: 'basket', to }`·`basket` 효과음·`L.toBasket`으로 보이고 바구니가 차면 `judge('basket')`. 바구니 대화 상자는 보기만 한다(행선지 고르기·빼기·꽂기 없음, `L.basketReady`·`L.basketAuto`). 손 목록 제목은 `L.hand`('판별한 노래'), 노래마다 판별한 갈래 이름(`.play-hand-genre`), 아래에 남은 뒤섞인 노래 수(`.play-hand-left`, `L.mixedLeft`). 떠도는 노래의 이름은 `L.floatingLabel`('뒤섞인 노래 「…」'). 판을 마치기 전 관에 들어올 때마다 `L.premise(관 이름)`을 알린다(마친 관은 `L.doneWing`).
- 맞대어 보기: 돌아온 노래마다 `mismatches(노래, 결과의 target, 감정서 동작)`(`js/core/contrast.js`)가 비지 않으면 `contrastAfterMs`(1.2초, 움직임 줄이기면 0) 뒤 `openContrast`를 하나씩 연다. 어긋나는 줄을 눌러야 짝이 밝아지고 '손에 다시 들기'가 나온다. 짝이 되는 수첩 줄은 `pairedLineIds`(그 개념의 가장 좁은 줄)로만 고른다. 어긋나지 않는 줄은 흔들림만(두 번이면 어긋나는 줄이 살짝 빛남). 짝을 짓기 전에도 오른쪽 위 X(`.play-contrast-close`)나 Esc로 닫힌다(노래는 이미 손에, 교사 의견 2026-10-07). 진행 엔진을 부르지 않고 저장하지 않으며 오답 수에도 들지 않는다. 판정 중(`busy`)이라 그동안 다른 조작은 받지 않는다.
- 위 띠의 수첩 단추가 도움으로 반짝이는 동안(`is-glow`) 수첩을 열면 가장 최근 도움(`session.glows`의 끝)의 대상 갈래 쪽부터 펼친다. 노래 자기 갈래는 쓰지 않는다. 반짝임이 없으면 지금 관의 갈래 쪽부터(Codex 점검 B1).
- 관의 분석에는 `canQuit: true`를 넘긴다('재기 그만두기'). 판별 전에 그만두면 아무것도 기록되지 않아 노래는 다시 떠다닌다(④에서 맞힌 뒤면 판별은 이미 기록되어 있다). 그만두면 `openMeasure`가 `AbortError`로 끝나므로 `markMeasured`를 부르지 않고 노래는 다시 떠다닌다. 관의 중단 신호(`ac`)는 그대로다.
- 가객 이름은 `ceremony.js`의 `singerHeading`(`.play-singer-name`은 이름만, `singer.traditional`이면 앞에 `L.traditionalSinger` '전하는 작자: ')으로 보인다. 엔딩 행렬 그림의 대체 글도 `L.singerName`을 쓴다.
- 분석 화면에 `revealed: P.isRevealed(id)`, `marksKnown: P.marksKnown(id)`를 넘긴다. 드러나기 전에는 단위를 '부분'으로 부른다. 칸(탑)이 묶이면 `L.unitReveal[갈래]`를 가객 연출 첫 카드 위에 보인다.
- 서가 빈자리는 제목 없는 빈 책등이고, 제목은 묶인 뒤에만 보인다.
- 겹 창(수첩·일지·도감·다시 듣기 `openPanel`)과 맞대어 보기 창의 닫기는 오른쪽 위 X(`dom.js` `closeButton`, `css/base.css` `.x-close`, 이름 '닫기', 48px, 먹 바탕)다. 글자 '닫기' 단추는 쪽 단추와 같아 보여 교사가 닫는 곳을 찾지 못했다(2026-10-07). 겹 창은 Esc(초점이 창 밖이어도, 다른 창에 초점이 있으면 그 창의 것)로도 닫히고, 닫으면 초점을 연 단추로 돌려준다.
- 떠도는 노래: 판 중이면 칸 노래와 길 잃은 노래, 마친 관이면 덤 노래. 이미 잰 노래, 꽂힌 노래, 입구에서 기다리는 미리 잰 노래는 빼고 관 모형의 `floatingSpots`에 이 화면이 직접 그린다. 손에 든 노래 = 그 관에서 잰 노래 가운데 아직 꽂지 않은 것.
- 미리 분석한 노래를 잡으면 `preMeasured: true`로 분석 화면을 열고(④ 없음) 마치면 `markMeasured`로 손에 든다.
- 작품 방은 칸이 묶여야 열리고, 방 도중의 상태는 저장하지 않는다. '방에서 나가기'나 관을 떠나면 방 신호를 중단하고 `world.closeRoom()`을 부르며 기록을 남기지 않는다.
- 마친 관에 다시 들어오면 덤과 다시 듣기만 된다. 판정 기록은 바뀌지 않는다.
- 저장 실패 알림("이 기기에 저장되지 않아요. 이번 창에서만 이어집니다")은 앱이 열려 있는 동안 `save:failed`를 처음 받을 때 한 번만 보인다(모듈 변수. 기록 목록으로 갔다 와서 세션을 다시 띄워도 다시 보이지 않는다).
- 세계가 3D 그림판을 잃고 2D로 바뀌면(`onModeChange`) 판 중인 관에 `playWing`으로 다시 들어간다(관을 나갔다 들어오는 흐름. 재기와 작품 방은 처음부터, 기록은 그대로). 회랑이면 아무것도 하지 않는다(보스 화면이 떠 있어도 건드리지 않는다).
- 떠도는 노래 자리 맞추기(`wing.js`의 `positionSongs`)는 프레임마다 돌므로 모든 노래의 자리·크기를 먼저 읽고 그다음 한꺼번에 쓴다(읽기와 쓰기를 섞으면 노래마다 레이아웃을 다시 계산한다). 재기 중, 세계가 가려졌을 때(`world.isCovered()`), 회전 안내 동안(`world.isPaused()`)은 건너뛴다.

## 구현 방식
- 작품 방 `ctx`: `{ song, container(.play-room-body), mode: world.getMode(), three(3D면 world.openRoom(container)의 결과), noBeat, reduceMotion: () => world.reduceMotion(), rhythm: { engine, buildGrid, createTapSession, offsetMs }, signal, manifest, appearance, songs }`. 방을 마치면(`{ completed: true, record }`) 방이 스스로 치운 뒤 `world.closeRoom()` → `progress.completeRoom(관, record)`.
- 판의 끝: `diorama:dancheong-restore` → 판 카드(`showCard`에 **함수** `() => buildWingCard(store.currentRecord(), 관)`을 넘겨 내려받을 때마다 다시 그림) → 다음 관 배경음을 `leakMs`(8초) 동안 틀었다 되돌림 → 덤 노래가 떠다닌다.
- 첫 사용 안내 깃발: 재기 화면에 `introSeen: { common: progress.tutorialDone, unique: wings[관].uniqueActionIntroSeen }`을 넘기고, `onIntroSeen('unique')`면 `markUniqueActionIntroSeen(관)`.
- 회랑에서 열린 관 문 앞에 서면 상황 버튼이 '들어가기 — 관 이름'이 된다. 입구 문은 다루지 않는다.
- 화면 글은 `labels.js`에 둔다(교사 확인 대상). 가객 이름, 소절, 기념품 글은 노래 데이터에서 그대로 가져온다. 설화 장면(`legend`)에는 '전해지는 이야기'를 붙인다.
- 스타일은 `css/play.css`. 보스 동안에는 보스 화면이 세션 뿌리에 `has-boss`를 붙여 이 화면의 위 띠(수첩 단추)를 숨긴다.

## 점검
- `node tests/check-wingflow.mjs`(`tests/pages/wingflow.html`): 실제 노래로 한 판 전체, 전제 알림, ④ 갈래 판별(틀림 → 고른 갈래와 맞대어 보기 → 다시, 맞음 → 단위 이름·손 또는 바구니), 짚을 줄이 없는 판별(나란히), 판별하지 않은·다른 갈래 노래를 엔진이 막음, 바구니는 보기만, 다시 열어도 남는 판별, 탑의 틀린 층 판정, 예전 오답 경로(칸에 길 잃은 노래, 바구니에 칸 노래, 행선지 틀림), 맞대어 보기(어긋나는 줄 → 짝·손으로, 어긋나지 않는 줄 → 흔들림, 두 번 뒤 살짝 빛남, 어긋나는 줄이 없으면 창 없음, Esc, Tab 가둠, 기록 그대로, 탑 두 노래), 단위 이름(드러나기 전 '덩이', 드러난 노래·칸 묶음 한 줄), 미리 잰 노래와 돌아온 노래, 오답 도움(대상 갈래 쪽), 덤, 다시 들어가기, 저장 실패 알림(세션을 다시 띄워도 한 번), 소스 정적 검사.
- `node tests/check-rooms-in-flow.mjs`: 실제 앱 페이지에서 관 다섯 × (3D 1366×768, 강제 2D 844×390)로 방을 실제 입력으로 끝까지 하고, 도중에 나갔다 들어오기, 방 기록·판 카드·단청, 세계 되돌림.
- `check-playthrough`가 세 화면에서 이 흐름을 상태 주입 없이 끝까지 간다.
