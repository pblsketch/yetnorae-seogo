# js/rooms — 작품 방 다섯

## 맡는 것
관마다 작품 하나를 몸으로 겪는 방. 모듈 하나가 `start(ctx) → Promise<{ completed: true, record }>`를 내놓는다.

| 관 id | 방 | 파일 | 방 글(교사 확인 대상) | `record` |
| --- | --- | --- | --- | --- |
| `hyangga` | 「제망매가」 | `hyangga.js`, `hyangga-3d.js`, `hyangga-2d.js`, `hyangga-flow.js` | `js/data/rooms-hyangga.js` | `{ room, interpretationId, interpretationText, isInterpretation: true }` |
| `goryeo` | 「정석가」 | `goryeo.js`, `goryeo-3d.js`, `goryeo-2d.js` | `js/data/rooms-goryeo.js` | `{ room, lastConditionId, lastConditionText }` |
| `sijo` | 「십 년을 경영하야」 | `sijo.js`, `sijo-3d.js`, `sijo-2d.js`, `sijo-logic.js` | `js/data/rooms-sijo.js` | `{ room, rooms: [물건 id ×3], outside: [놓은 순서], interpretationId, interpretationText, isInterpretation: true }` |
| `gasa` | 「상춘곡」 | `gasa.js`, `gasa-3d.js`, `gasa-2d.js`, `gasa-model.js`, `gasa-route.js` | `js/data/rooms-gasa.js` | `{ room, words: [모은 시어, 작품 차례] }` |
| `saseol` | 「님이 오마 하거늘」 | `saseol.js`, `saseol-3d.js`, `saseol-2d.js` | `js/data/rooms-saseol.js` | `{ room, predictionId: 'nim' | 'other-person' | 'jujuri-samdae', predictionText }` |

`ctx`: `{ song, container, mode: '3d' | '2d', three?: { THREE, root, camera }, noBeat, reduceMotion, rhythm, signal, manifest?, assets?, appearance?, songs? }`.

## 맡지 않는 것
- 기록 저장, 진행 바꾸기. 방은 진행 엔진을 부르지 않는다. `record`를 돌려주면 한 판 흐름이 `completeRoom`으로 저장한다.
- 방을 여는 조건(칸 묶음), 방 문, 판의 끝 연출(한 판 흐름 몫).
- 세계 장면 그리기. 3D에서 방은 세계가 빌려준 무대에 물체를 붙이고 카메라를 움직일 뿐, 프레임마다 그리는 것은 세계다. 「십 년을 경영하야」 방만 `container` 안에 자기 그림판(WebGLRenderer)을 따로 만들고 `three.THREE`만 쓴다.
- 다른 방 파일을 import하지 않는다. `js/play/`, `js/boss/`, `js/story/`를 import하지 않는다.

## 불변식
- 해석은 채점하지 않는다. `record`에 정답 여부를 담지 않는다. 해석 문장에는 '해석' 표시를 붙인다. 「님이 오마 하거늘」의 예측이 틀려도 그대로 진행한다.
- 원작의 줄거리와 결말을 바꾸지 않는다.
- 노래 글(원문, 해독, 오늘 소리, 풀이)은 노래 데이터(`ctx.song`, 「정석가」 방은 `ctx.songs`의 「서경별곡」)에서만 가져오고 방 안에 다시 적지 않는다. 방이 새로 쓴 글은 `js/data/rooms-<관 id>.js`에만 둔다.
- 방 글의 id(`interpretationId`, 조건 카드 id, 시어 id, 예측 id, 물건 id `na`·`dal`·`cheongpung`·`gangsan`·`gold`·`robe`·`guest`)는 저장된 기록이 가리키므로 글을 고쳐도 id는 바꾸지 않는다.
- 방 도중 상태는 저장하지 않는다. `ctx.signal`이 중단되면 만든 것을 모두 치우고(3D 무대에 붙인 무리 떼기, 카메라를 처음 자리·방향·시야각으로 되돌리기) `AbortError`로 끝난다. 다음에는 처음부터 한다.
- 소리를 껐거나 빗금 모드(`noBeat`, 그 뒤로는 `rhythm:no-beat`), 또는 소리 판이 아직 없어도 끝까지 갈 수 있다. 낭송이 끝나기를 기다리는 곳은 박자 없는 방식이면 기다리지 않는다.
- 세로 회전 동안 방은 멈춰야 한다. 「제망매가」·「십 년을 경영하야」·「상춘곡」은 `orientation:pause`/`resume`을 들어 조작과 연출을 멈췄다 잇는다. 「정석가」·「님이 오마 하거늘」은 이 사건을 듣지 않고, 소리 엔진의 멈춤(낭송이 멈췄다가 그 단위를 처음부터)과 회전 안내 덮개(뒤 화면을 누를 수 없음)에 기댄다. 새 방에 시간에 따라 움직이는 연출이 있으면 사건을 직접 듣는다.
- 「십 년을 경영하야」: 강산은 어느 칸에도 들어가지 않고, 방을 마치면 `outside`에 언제나 `gangsan`이 있다. 해석 id는 `sijo-logic.js`의 `interpretationIdFor`가 정한다(`as-written` 나·달·청풍 · `nature-swapped` 재물·벼슬 없이 손님이 한 칸 · `worldly` 금붙이나 관복을 들였고 달이나 청풍이 남음 · `worldly-only`).
- 「상춘곡」: 머무는 곳은 작품 차례(수간모옥 1~13행 → 정자 14~21행 → 시냇가 22~30행 → 산봉우리 31~35행 → 마무리 36~39행)이고, 마무리를 뺀 네 곳에서 시어를 하나 이상 모아야 다음으로 간다. 시냇가부터는 교과서 밖 원문이므로 그 행에 '교과서 밖 원문'과 출처(`sourceNote`)를 보인다. `record.words`는 누른 차례가 아니라 작품 차례다.
- 「님이 오마 하거늘」: 중장 음보 0부터 `reversal.fromFoot - 1`까지만 달리고 멈춘다. 예측 전에는 반전(주추리 삼대)이 드러나는 글(`glossBefore` 밖의 풀이)을 보이지 않는다.
- 「정석가」: 카드는 노래의 연·줄 번호만 가리킨다. 마지막 연은 `finalUnit: 5`, 「서경별곡」의 같은 연은 `echo: { songId: 'seogyeong-byeolgok', unit: 1 }`이다. 노래 글이 교과서 수록본으로 바뀌어 연 나눔이 달라지면 이 번호를 고친다.

## 구현 방식
- 방 하나 = 흐름 모듈(`<관>.js`) + 3D 장면 + 2D 그림 판 + 화면 없는 규칙(`-logic`, `-model`, `-route`, `-flow`). 규칙 파일은 DOM 없이 Node에서 시험할 수 있게 둔다.
- 3D(`ctx.three`가 있음): 세계가 `openRoom`으로 빌려준 빈 무대 `root`(원점 둘레 약 ±35m)에 물체 무리 하나를 붙인다. 세계의 빛은 숨겨져 있으므로 빛을 쓰는 재질이면 자기 빛을 무리 안에 둔다. 장면 칸은 바탕을 투명하게 둔다. 누를 자리는 DOM 단추이고, 장면의 점을 `ctx.three.camera`로 투영해 `container` 위에 놓는다(`container`는 그리기 칸과 같은 자리, 같은 크기다). 3D를 만들 수 없으면 같은 방을 2D로 이어 간다.
- 2D: 자산 목록에서 `board/room-<관 id>` 그림을 `createAssets(ctx.manifest)`로 찾아 `container` 안에 그린다. 없으면 자리표시 풍경이다. 방은 자산 목록을 스스로 내려받지 않는다.
- `reduceMotion`은 함수와 참거짓 값 둘 다 받는다.
- 낭송은 `ctx.rhythm.engine.play(grid, [단위])`로 한다. 「님이 오마 하거늘」 박자 방식은 중장을 `RUN_CHUNK_FEET`(6) 음보씩 낭송하며 두드리고, 놓친 박은 실패가 아니다.
- 스타일은 `css/room-<관 id>.css`이고 모든 규칙을 그 방만의 범위에 둔다: 방 뿌리 클래스 아래(「정석가」 `.room-goryeo`, 「상춘곡」 `.rg-room`)이거나 그 방만 쓰는 머리글자(「제망매가」 `rh-`, 「십 년을 경영하야」 `sj-`, 「님이 오마 하거늘」 `rs-`). 다섯 방 CSS가 `index.html`에 함께 붙으므로 범위 밖 규칙이나 겹치는 머리글자는 다른 방에 번진다(「정석가」와 「상춘곡」이 `rg-`를 함께 써서 번진 일이 있다). 링크가 없으면 방이 스스로 `<link>`를 붙인다.
- 오른쪽 아래 상황 버튼 구석(가로 78%·세로 78% 너머)에는 누를 것을 두지 않는다.

## 점검
- `node tests/check-room-<관 id>.mjs`(방마다 `tests/pages/room-<관 id>.html`): 3D와 2D에서 끝까지 진행해 완료와 기록이 돌아오는지, 박자 없는 방식, 원문 구절이 노래 데이터와 같은지, 중단·완료 뒤 치우기, 방 규칙(강산, 시어 수, 반전 숨김, 연 번호). 카메라 되돌림은 「제망매가」·「정석가」·「님이 오마 하거늘」 점검만 본다(「상춘곡」 점검에는 없고, 「십 년을 경영하야」는 자기 그림판을 쓴다).
- `node tests/check-rooms-in-flow.mjs`: 실제 앱의 한 판 흐름 안에서 방 다섯을 실제 입력으로, 도중에 나갔다 다시 들어가기, 판 카드에 기록이 보이는지.
- 「님이 오마 하거늘」의 반전 표시는 `check-saseol`이, 방 글이 글 확인 문서에 다 있는지는 `check-review-doc`가 본다.
