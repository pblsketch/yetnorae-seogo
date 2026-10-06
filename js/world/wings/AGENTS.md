# js/world/wings — 관 모형 다섯

## 맡는 것
갈래의 형식을 닮은 건축을 3D와 2D 두 벌로 만든다. 판 상태에 따라 사건을 받아 연출만 한다.

| 관 | 파일 | 보여야 할 것 |
| --- | --- | --- |
| 향가관 | `hyangga.js`(3D), `hyangga-art.js`(3D 건축), `hyangga-board.js`(2D), `hyangga-shared.js` | 4·8·10구 층이 쌓이는 탑, 층마다 칸 한 자리, 10구 층 마지막 두 칸 앞의 '아아' 문 |
| 고려가요관 | `goryeo.js` → `goryeo-3d.js`, `goryeo-art.js`(3D 건축), `goryeo-2d.js`, `goryeo-state.js` | 똑같은 방이 줄지은 복도(연 방 일곱 칸), 방 사이 후렴 고리 |
| 시조관 | `sijo.js` → `sijo-3d.js`, `sijo-art.js`(3D 건축), `sijo-2d.js`, `sijo-model.js` | 3층 정자, 층마다 계단참 둘, 종장 첫 계단 세 칸, '선대 사서의 자리' |
| 가사관 | `gasa.js` → `gasa-3d.js`, `gasa-2d.js`, `gasa-shared.js`, `gasa-corridor.js` | 기둥이 넷씩 되풀이되는 끝없는 회랑. 걸을 때마다 기둥 넷과 처마가 생기며 길어진다 |
| 사설시조관 | `saseol.js` → `saseol-3d.js`, `saseol-2d.js`, `saseol-model.js` | 가운데 층만 엿가락처럼 늘어나 장터까지 삐져나간 정자 |
| 향가관 | `hyangga.js`(3D), `hyangga-board.js`(2D), `hyangga-shared.js` | 4·8·10구 층이 쌓이는 탑, 층마다 칸 한 자리, 10구 층 마지막 두 칸 앞의 '아아' 문 |
| 고려가요관 | `goryeo.js` → `goryeo-3d.js`, `goryeo-2d.js`, `goryeo-state.js` | 똑같은 방이 줄지은 복도(연 방 일곱 칸), 방 사이 후렴 고리 |
| 시조관 | `sijo.js` → `sijo-3d.js`, `sijo-2d.js`, `sijo-model.js` | 3층 정자, 층마다 계단참 둘, 종장 첫 계단 세 칸, '선대 사서의 자리' |
| 가사관 | `gasa.js` → `gasa-3d.js`, `gasa-2d.js`, `gasa-shared.js`, `gasa-corridor.js` | 기둥이 넷씩 되풀이되는 끝없는 회랑. 걸을 때마다 기둥 넷과 처마가 생기며 길어지고, 칸마다 디딤돌 넷(한 행의 네 음보)이 걸음과 박에 밝아진다. 회랑 너머 봄 산수(둔덕 위 정자, 벼랑·폭포·연못) |
| 사설시조관 | `saseol.js` → `saseol-3d.js`, `saseol-2d.js`, `saseol-model.js` | 가운데 층만 엿가락처럼 늘어나 장터 엿 좌판까지 삐져나간 정자. 연타하면 그 층 앞의 큰 두루마리가 나무 굴대를 굴리며 풀린다. 담 너머 장터(가게·좌판·등줄·종이 오린 사람들) |

`normalize.js`의 `normalizeWing(모듈)`은 다섯 모형이 저마다 다른 이름으로 내놓던 손잡이를 한 모양으로 맞춘다. `js/registry.js`는 모형을 반드시 이것으로 감싸 등록한다.

## 맡지 않는 것
- 진행 기록 읽기, 사건 버스 직접 듣기. 모형은 `ctx.restored`(마친 관으로 다시 들어온 것인지) 말고는 판 상태를 모른다. 사건은 세계 바탕이 `react(이름, detail)`로 넘긴다.
- 떠도는 노래 그리기와 누르기, 2D 누를 자리 만들기(세계 바탕 몫), 자산 목록 읽기(`ctx.assets`로 받는다).
- 다른 관 모형 파일을 import하지 않는다.

## 약속
- 모듈은 `create3D(ctx)`와 `create2D(ctx)`를 내놓는다. 3D `ctx`: `{ THREE, root, wing, assets, restored, reduceMotion() }`(원점은 관 바닥 가운데, 1 = 1m, +y 위, +z 카메라 쪽). 2D `ctx`: `root` 대신 `container`(16:9), `THREE` 없음.
- 맞춘 손잡이: `anchors`(누를 자리만: `slots` 셋 — 향가관은 4·8·10구 층 순, `bonus` 셋, `basket`, `returnedShelf`, `roomDoor`, `entrance`, `nextDoor`, 3D `camera`, 시조관만 `mentorSeat`), `floatingSpots`(떠도는 노래 자리, **다섯 이상**), `measureFocus`(재기 화면 왼쪽 반의 초점), `react`, `update(dt)`, `dispose()`. 좌표는 3D가 `root` 기준 `THREE.Vector3`, 2D가 그림 판 백분율 `{ x, y }`.
- 받는 사건: `diorama:fold`, `pillar-light`, `floor-fill`, `aa-door`, `stair-step`, `refrain-link`, `walk-step`, `unroll`, `slot-set`, `shelf-bound`, `pop-out`, `fog-recede`, `dancheong-restore`. 그 관에 해당 건축이 없는 사건과 모르는 사건은 오류 없이 넘긴다.
- `diorama:slot-set`의 `area`는 `shelf`·`bonus`·`basket`·`returned`(0~3)·`mentor`(0, 보스를 마치면 `taesan`) 다섯이다. **모든 모형이 다섯을 다 받는다.** 지금 `returned`를 그리는 것은 시조관·가사관, `mentor`는 시조관뿐이다.

## 불변식
- 떠도는 노래 자리와 재기 초점은 `anchors`에 넣지 않는다. 넣으면 2D에 이름표 없는 누를 자리가 생긴다. 새 누를 자리 열쇠를 만들면 `js/world/board2d.js`의 `ANCHOR_LABELS`에 한국어 이름을 더한다.
- 2D의 누를 자리와 떠도는 노래 자리는 그림 판 오른쪽 아래 구석(`x > 78`이면서 `y > 78`)을 피한다.
- 빈 칸·덤 칸은 제목 없는 빈 책등으로만 보인다. 제목은 `shelf-bound` 뒤에 나타난다. 돌아온 노래 선반은 꽂히면 바로 제목이 보인다.
- `diorama:pop-out { genre }`은 갈래마다 다른 모양으로 삐져나온다: 사설시조는 중장만 길게, 가사는 조각이 줄줄이, 향가는 4·4·2 탑 모양으로 위로, 고려가요는 같은 조각이 나란히, 시조는 세 장이 통째로. 바구니에서는 행선지 표시가 지워진다.
- 3D 모형 하나의 그리기 호출은 세계의 예산(60회) 안에 들어야 한다. 실시간 그림자와 후처리를 쓰지 않는다.
- 재질 무늬가 없으면(`ctx.assets.texture(name)`이 `null`) 자리표시 무늬로 그린다.
- 움직임 줄이기(`ctx.reduceMotion()`)면 흔들림과 큰 움직임을 줄인다.

## 구현 방식
- 3D 건축과 반응을 나눈다(향가관·고려가요관·시조관). `*-art.js`는 gfx 꾸러미(`js/world/gfx/t35-wing.js`를 거쳐)로 돌·나무·기와·창호를 역할마다 합친 기하로 짓고, 모형 파일은 반응하는 부분(칸 불, 기둥 불, 계단, 고리, 책, 이름표, 먹안개)만 InstancedMesh로 그린다. 건축은 관에 들어간 뒤 두 번째 프레임에 짓고(`gfx.deferred`), 단청 값은 `gfx.setDancheong`으로 같은 값을 건축 재질에 옮긴다. 점검이 찾는 메시 이름(`goryeo-static`의 `roomDoorPost` 꼬리표와 개수, `sijo-fixed`의 0번 벽과 `landing` 꼬리표, `sijo-roof`의 재질 색 등)은 그대로 둔다.
- 관 건축 재질은 꼭짓점에서 빛을 계산하는 빛 없는 재질(`t35-wing.js`의 `vertexLightHook`)이다. 점검 브라우저(SwiftShader)에서 픽셀마다 빛을 계산하는 램버트 재질과 삼선형 무늬 거르기가 관 화면 비용의 큰 몫이었다. 가려지는 넓은 면(기단 가운데, 탑신 윗면)은 아예 짓지 않는다(가려진 면도 칠한다).
- 판 도중에 관을 나갔다 들어오면 한 판 화면이 지금 상태를 `slot-set` → `shelf-bound` → `fog-recede` 순으로 다시 낸다. 모형은 이 순서로 받아도 같은 그림이 되게 만든다.
- 재기 흔적(후렴 고리, 음보 표시, 접힌 경계 빛)은 `slot-set`·`shelf-bound`가 오면 걷는다. 새 노래의 첫 박(`pillar-light { unit: 0, foot: 0 }`, 향가 `floor-fill { gu ≤ 1 }`)이 오면 앞 노래의 흔적을 지운다.
- 시조관 `stair-step`: 첫 계단 세 칸을 `step`마다 밝히고, `step: 1`이 오면 새로 시작한다. `step`이 3을 넘으면 '맞지 않는 계단'이 하나씩(최대 넷) 드러난다.
- 고려가요관 `refrain-link`: 연 번호는 `unit % 7` 방에 그리고, 한꺼번에 12개까지 보인 뒤 오래된 것부터 거둔다.
- 2D 그림 판 스타일: 향가관·가사관은 `css/wing-hyangga.css`·`css/wing-gasa.css`(`index.html`에 링크), 고려가요관·시조관·사설시조관은 SVG 요소에 직접 단다. 어느 쪽이든 색은 base.css 토큰을, 글자 크기는 `--text-scale`을 따른다.
- 새 손잡이 열쇠를 바깥에 내놓아야 하면 `normalize.js`에서 한 이름으로 맞추고, 같은 값이 두 이름으로 돌아다니지 않게 옛 열쇠는 맞춘 손잡이에서 뺀다.

## 점검
- `node tests/check-wing-<관>.mjs`(관마다 `tests/pages/wing-<관>.html`): 반응 사건 전부가 오류 없이 처리되는지, 3D와 2D에서 같은 사건이 보이는지, 그리기 호출 예산, 갈래 모양의 삐져나옴. 스크린숏은 `tests/shots/`.
- `node tests/check-wing-contract.mjs`: 등록된 다섯 모형의 맞춘 손잡이(`floatingSpots` 다섯 이상, `measureFocus`), `anchors`에 떠도는 자리가 섞이지 않는지, 2D 이름표가 한국어인지, `returned`·`mentor` 자리, 반반 틀 초점이 왼쪽 칸 안에 오는지.
