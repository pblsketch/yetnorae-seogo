# js/world — 세계 바탕(3D·2D)

여기는 관 모형을 끼우는 바탕이다. 관 모형 다섯의 건축과 손잡이 약속은 `wings/`가 맡는다.

## 맡는 것
- `world.js`: 바깥 손잡이. 다른 화면은 이 파일만 부른다. `mount(container, { wings, manifest, appearance, reduceMotion, onArrive })`, `enterWing`/`enterCorridor`, 상황 버튼 `setContext(label, handler)`, 반반 틀 `openSplit(panelEl)`/`closeSplit()`, 방 무대 `openRoom(el)`/`closeRoom()`, `setDancheong`, `getMode()`, `getWingHandle()`, `dispose()`. 사건 버스의 `diorama:*`를 지금 관 모형의 `react`로 넘기고, `wing:state`로 관 문을 열고 닫는다.
- `mode.js`: WebGL2 확인으로 `'3d'`/`'2d'`를 정한다(창마다 한 번, 바뀌지 않음). 3D 그림판을 못 만들면 `fallbackTo2D()`.
- `scene3d.js`: Three.js 장면, 따라가는 카메라와 제한 각도 회전, 종이 인형 빌보드, 입구·회랑·관 문, 먹빛→단청 색. `board2d.js`: 같은 일을 16:9 그림 판 위 DOM 겹으로.
- `controls.js`: 탭 이동(도착 표시), 터치에서만 생기는 왼쪽 아래 조이스틱, 끌어 돌리기, 키보드(WASD·방향키, Enter·Space = 상황 버튼), 오른쪽 아래 상황 버튼.
- `screen.js`: 세로 화면이면 회전 안내를 덮고 `#app`을 `inert`로, `orientation:pause`·`audio:pause { reason: 'orientation' }`을 내고 가로로 돌아오면 `resume`.
- `motion.js`: 움직임 줄이기 전역 상태(기기 설정 또는 브라우저 `prefers-reduced-motion` 가운데 하나라도 켜지면 켜짐). `#app.reduce-motion`과 `settings:reduce-motion`.
- `palette.js`(색 토큰 사본과 단청 값, DOM 없음), `assets.js`(자산 목록에서 그림 주소·무늬 찾기), `sprites.js`(자리표시 종이 인형), `tuning.js`(조정 값).

## 맡지 않는 것
- 진행 규칙과 기록. 세계는 진행 기록을 읽지 않는다. 마친 관은 부르는 쪽이 `setDancheong(id, 1)`로, 관 문은 `wing:state`로 알려 준다.
- 떠도는 노래 그리기와 누르기(한 판 흐름이 `floatingSpots` 자리에 직접 그린다), 재기 화면 내용, 작품 방 내용.
- 자산 목록 내려받기. 세계는 `assets/manifest.json`을 스스로 읽지 않는다(없는 파일 요청이 콘솔 오류가 되지 않게). `mount`에 넘겨받은 목록만 쓰고, 없으면 모든 그림이 자리표시다.
- `js/play/`, `js/story/`, `js/boss/`를 import하지 않는다.

## 불변식
- 세계는 한 번에 하나다(`world.js`의 모듈 변수). 다시 띄우기 전에 `dispose()`를 부른다.
- 제품에는 2D를 강제하는 스위치가 없다. 점검은 WebGL을 끈 브라우저로 2D를 연다.
- 성능 상한: 관 하나의 그리기 호출 60회 이하, 픽셀 비율 1.5 이하, 실시간 그림자·후처리 없음(`TUNING.drawCallBudget`, `pixelRatioMax`). 회랑 상자는 재질 하나의 `InstancedMesh` 하나로, 관 문도 하나로 그린다.
- 2D 누를 자리는 관 모형의 `anchors`마다 세계가 48px 이상으로 만들고, 이름표는 `board2d.js`의 `ANCHOR_LABELS`(모두 한국어)에서 온다. 그림 판 오른쪽 아래 구석(`x > 78`이면서 `y > 78`)에는 상황 버튼이 있다. 2D에서 학생은 그림 판 `y` 40~95% 띠 안에서만 걷는다.
- `openSplit`·`openRoom` 동안 이동 조작과 상황 버튼은 멈춘다. `closeRoom()`은 숨긴 것, 안개, 바탕, 카메라의 시야각·near·far·up·zoom, 그리기 판 크기를 열기 전으로 되돌린다.
- 회전 안내가 떠 있는 동안 그리기 고리는 프레임을 건너뛴다(`isPaused()`).
- `palette.js`의 `TOKENS`는 `css/base.css`의 색 토큰과 같은 값이다.

## 구현 방식
- 3D와 2D는 `createScene3D`/`createBoard2D`가 같은 손잡이 모양을 돌려주고, `world.js`가 그 위에 같은 바깥 함수를 얹는다. 3D 쪽에 기능을 더하면 2D 쪽에도 같은 함수가 있어야 한다.
- 관 모형은 `registry.wings`(이미 `normalizeWing`으로 감싼 것)에서 가져온다. 점검 페이지가 감싸지 않은 모형을 직접 넘기면 옛 손잡이 모양이 그대로 보인다.
- 방 무대(3D): `openRoom(el)`은 세계의 다른 것(회랑, 관 문, 현판, 관 모형, 학생, 표시, 빛)을 숨기고 안개를 끈 뒤 세계 원점에 빈 무리를 붙여 `{ THREE, root, camera }`를 돌려준다. 세계는 방이 열린 동안에도 프레임마다 그리되 `el`의 자리와 크기에만(viewport·scissor) 그리고 카메라 비율을 그 칸에 맞춘다. 카메라 자리·방향·시야각은 방이 정한다. 2D면 `null`을 돌려준다.
- 반반 틀: 지금 관 모형에 `measureFocus`가 있으면 왼쪽 반이 그곳을 비춘다. 3D는 카메라가 `target`을 보고(`position`이 없으면 `TUNING.measureOffset`만큼 떨어져), 2D는 그림 판을 왼쪽 칸에 꽉 차게 키우고 초점을 가운데로 민다.
- 단청: `diorama:dancheong-restore`를 받으면 지금 관을 0→1로 `TUNING.dancheongRestoreSeconds` 동안 올린다(움직임 줄이기면 바로). 색은 `dancheongColor(본색, 값)`으로 먹빛과 본색 사이를 섞는다.
- 움직임 줄이기면 카메라 이동은 잘라 바꾸고, `shake()`는 아무것도 하지 않고 `false`를 돌려주며, 파티클은 `particleScale()`(0.3)배로 줄인다.
- `motion.js`는 처음 설치될 때 저장 문서에서 `device.reduceMotion`을 직접 읽는다(열쇠 `yetnorae-seogo-v1`을 상수로 따로 가진다). 저장 열쇠가 바뀌면 이 상수도 바꾼다.

## 점검
- `node tests/check-world.mjs`(`tests/pages/world.html`): 세 화면 크기에서 탭 이동, 조이스틱, 키보드, 회전 안내와 멈춤, 3D를 끈 브라우저에서 2D 전환, 반반 틀 넘침, 그리기 호출 수, 움직임 줄이기, 색 토큰이 base.css와 같은지. 페이지가 도착을 알리는 값은 동기 판별 함수로 기다린다.
- `node tests/check-wing-contract.mjs`: 등록된 관 모형 손잡이와 2D 이름표, 반반 틀 초점.
- 세계를 고치면 `check-wingflow`, `check-rooms-in-flow`, `check-ui`도 영향을 받는다.
