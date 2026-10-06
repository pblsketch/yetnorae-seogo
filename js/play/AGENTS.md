# js/play — 세션과 관 한 판

## 맡는 것
- `session.js`: 앱 하나에 하나뿐인 **세션** `createSession(...) → Promise<세션>`. 저장 엔진 하나, 그 기록의 진행 엔진 하나, 소리 엔진 하나, 세계 바탕 하나를 묶고, 입구·보스·엔딩·기록 화면이 함께 쓴다. 로컬 저장소 고르기(`safeLocalStorage`, 읽기만 해도 오류면 `null` → 메모리로만), 자산 목록 한 번 읽기(`loadManifest`), 장소마다 배경음, 창 숨김의 `audio:pause`/`resume { reason: 'hidden' }`, 저장 실패 알림.
- `wing.js`: 관 한 판 `createWingPlay(세션, 관 id)`. 들어가기 → 떠도는 노래 잡기 → 재기(`openMeasure`) → 칸·탑·바구니 꽂기(바구니는 갈 관도 고름) → 다 차면 판정(진행 엔진) → 제본·금박·먹안개 / 틀린 노래만 삐져나옴 → 가객과 기념품 → 작품 방 → 판의 끝(단청, 판 카드, 다음 관 문틈 소리, 덤). 조정 값 `PLAY_TUNING`.
- `play-screen.js`(화면 이름 `play`), `screens.js`(『분류 수첩』·사서 일지·도감·다시 듣기 화면, 이름 `notebook`·`journal`·`collection`), `ceremony.js`(가객 한 소절과 기념품 석 장), `keepsake.js`(기념품 카드 한 장), `labels.js`(화면 글), `dom.js`.

## 맡지 않는 것
- 규칙 판단. 맞는지, 무엇이 고정되는지, 어디로 보내지는지, 개념이 어떻게 바뀌는지는 모두 진행 엔진(`js/core/progress.js`)이 정한다. 이 폴더는 엔진의 공개 함수를 부르고 결과를 보일 뿐, `progress` 객체의 값을 직접 고치지 않는다.
- 재기 내용(`js/measure/`), 작품 방 내용(`js/rooms/`, `registry.rooms`로 받음), 카드 그림(`js/result/`), 세계 그리기(`js/world/world.js`만 부름).
- 시작 화면, 입구 문, 보스 문, 엔딩(`js/story/`가 세션 갈고리 `store`·`audio`·`onCorridorArrive`·`clues`로 얹는다).

## 불변식
- 세계를 꽉 덮는 겹(판 카드 `.play-card`, 수첩·일지·도감 창 `.play-panel`)의 뿌리에는 `data-world-cover`를 단다. 세계 바탕이 그 뒤에서 그리지 않는다(`js/world/world.js` '가림'). 반투명 겹(노래 부른 이 소개, 기념품 줄)에는 달지 않는다.
- 이 폴더의 `.js` 파일에는 주소 인자 읽기(`location.search`, `location.hash`, `URLSearchParams`), 점검용 낱말(`__wf`, `__test`, `stub`), 평가를 매기는 한국어 낱말이 **주석을 포함해** 하나도 없다(`check-wingflow`가 파일 글 전체를 훑는다).
- 디오라마 사건(`diorama:*`)은 이 화면이 낸다. 관에 들어온 직후 지금 상태를 다시 낸다: `diorama:slot-set`(칸·덤·판정 전 바구니, `returned` 0~3, 보스를 마쳤으면 시조관 `mentor`) → 묶였으면 `diorama:shelf-bound` → `diorama:fog-recede`. 바구니에서 이미 보낸 노래는 다시 그리지 않는다. 처음 띄울 때 기록의 관 상태를 `wing:state`로 한 번씩 다시 내고 마친 관은 `setDancheong(관, 1)`로 알린다.
- 판정에서 돌아온 노래마다 `diorama:pop-out`을 내고, `popOutMs`(2.4초) 뒤 그 자리가 비어 있으면 `slot-set { songId: null }`. 바구니에서 보낸 노래는 `sentMs`(1.2초) 뒤 비운다.
- 서가 빈자리는 제목 없는 빈 책등이고, 제목은 묶인 뒤에만 보인다.
- 떠도는 노래: 판 중이면 칸 노래와 길 잃은 노래, 마친 관이면 덤 노래. 이미 잰 노래, 꽂힌 노래, 입구에서 기다리는 미리 잰 노래는 빼고 관 모형의 `floatingSpots`에 이 화면이 직접 그린다. 손에 든 노래 = 그 관에서 잰 노래 가운데 아직 꽂지 않은 것.
- 미리 잰 노래를 잡으면 `preMeasured: true`로 재기 화면을 열고 마치면 `markMeasured`로 손에 든다.
- 작품 방은 칸이 묶여야 열리고, 방 도중의 상태는 저장하지 않는다. '방에서 나가기'나 관을 떠나면 방 신호를 중단하고 `world.closeRoom()`을 부르며 기록을 남기지 않는다.
- 마친 관에 다시 들어오면 덤과 다시 듣기만 된다. 판정 기록은 바뀌지 않는다.
- 저장 실패 알림("이 기기에 저장되지 않아요. 이번 창에서만 이어집니다")은 `save:failed`를 처음 받을 때 한 번만 보인다.

## 구현 방식
- 작품 방 `ctx`: `{ song, container(.play-room-body), mode: world.getMode(), three(3D면 world.openRoom(container)의 결과), noBeat, reduceMotion: () => world.reduceMotion(), rhythm: { engine, buildGrid, createTapSession, offsetMs }, signal, manifest, appearance, songs }`. 방을 마치면(`{ completed: true, record }`) 방이 스스로 치운 뒤 `world.closeRoom()` → `progress.completeRoom(관, record)`.
- 판의 끝: `diorama:dancheong-restore` → 판 카드(`showCard`에 **함수** `() => buildWingCard(store.currentRecord(), 관)`을 넘겨 내려받을 때마다 다시 그림) → 다음 관 배경음을 `leakMs`(8초) 동안 틀었다 되돌림 → 덤 노래가 떠다닌다.
- 첫 사용 안내 깃발: 재기 화면에 `introSeen: { common: progress.tutorialDone, unique: wings[관].uniqueActionIntroSeen }`을 넘기고, `onIntroSeen('unique')`면 `markUniqueActionIntroSeen(관)`.
- 회랑에서 열린 관 문 앞에 서면 상황 버튼이 '들어가기 — 관 이름'이 된다. 입구 문은 다루지 않는다.
- 화면 글은 `labels.js`에 둔다(교사 확인 대상). 가객 이름, 소절, 기념품 글은 노래 데이터에서 그대로 가져온다. 설화 장면(`legend`)에는 '전해지는 이야기'를 붙인다.
- 스타일은 `css/play.css`. 보스 동안에는 보스 화면이 세션 뿌리에 `has-boss`를 붙여 이 화면의 위 띠(수첩 단추)를 숨긴다.

## 점검
- `node tests/check-wingflow.mjs`(`tests/pages/wingflow.html`): 시험용 노래 묶음으로 한 판 전체, 오답 경로(칸에 길 잃은 노래, 바구니에 칸 노래, 행선지 틀림), 미리 잰 노래와 돌아온 노래, 오답 도움, 덤, 다시 들어가기, 저장 실패 알림, 소스 정적 검사.
- `node tests/check-rooms-in-flow.mjs`: 실제 앱 페이지에서 관 다섯 × (3D 1366×768, 강제 2D 844×390)로 방을 실제 입력으로 끝까지 하고, 도중에 나갔다 들어오기, 방 기록·판 카드·단청, 세계 되돌림.
- `check-playthrough`가 세 화면에서 이 흐름을 상태 주입 없이 끝까지 간다.
