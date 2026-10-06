# js/world — 세계 바탕(3D·2D)

여기는 관 모형을 끼우는 바탕이다. 관 모형 다섯의 건축과 손잡이 약속은 `wings/`가 맡는다.

## 맡는 것
- `world.js`: 바깥 손잡이. 다른 화면은 이 파일만 부른다. `mount(container, { wings, manifest, appearance, reduceMotion, onArrive })`, `enterWing`/`enterCorridor`, 상황 버튼 `setContext(label, handler)`, 반반 틀 `openSplit(panelEl)`/`closeSplit()`, 방 무대 `openRoom(el)`/`closeRoom()`, `setDancheong`, `getMode()`, `getQuality()`, `getWingHandle()`, `dispose()`. 사건 버스의 `diorama:*`를 지금 관 모형의 `react`로 넘기고, `wing:state`로 관 문을 열고 닫는다.
- `quality.js`: 화질 단계(자동). 세계가 그린 프레임을 재어 오래 느리면 픽셀 비율과 꾸밈 겹을 한 단계씩 낮춘다(내려가기만). `getQuality()`로 읽는다.
- `mode.js`: WebGL2 확인으로 `'3d'`/`'2d'`를 정한다(창마다 한 번, 바뀌지 않음). 3D 그림판을 못 만들면 `fallbackTo2D()`.
- `scene3d.js`: Three.js 장면, 따라가는 카메라와 제한 각도 회전, 학생 3D 인물, 관 문과 현판, 먹빛→단청 색. `board2d.js`: 같은 일을 16:9 그림 판 위 DOM 겹으로.
- `corridor-art.js`: 회랑 건축(그림만). 한옥 서고 회랑(마루, 서가와 창살 벽, 기둥·공포·서까래, 기와 처마, 문루, 초롱, 난간, 입구 문)과 언제나 보이는 바깥(마당, 관 자리 바닥돌과 길, 종이 나무, 관 뒤 수묵 병풍, 먼 산). 배치 값은 `scene3d.js`가 넘기고 여기서 바꾸지 않는다.
- `gfx/`: 그래픽 꾸러미. 캔버스 무늬(`textures.js`), 역할별 재질과 먹빛→단청 걸이(`materials.js`), 모서리를 깎은 부분을 역할마다 합치는 소품 틀(`kit.js`), 인물 무대(`figures.js`: 인물 고르기·종이 카드·무리, `figures-3d.js`: 절차 3D 인물, `cast.js`: 가객 표), 그리기 설정·빛·안개(`lighting.js`). 쓰는 법과 예산 요령은 `gfx/README.md`.
- `controls.js`: 탭 이동(도착 표시), 터치에서만 생기는 왼쪽 아래 조이스틱, 끌어 돌리기, 키보드(WASD·방향키, Enter·Space = 상황 버튼), 오른쪽 아래 상황 버튼.
- `screen.js`: 세로 화면이면 회전 안내를 덮고 `#app`을 `inert`로, `orientation:pause`·`audio:pause { reason: 'orientation' }`을 내고 가로로 돌아오면 `resume`. 전체 화면도 맡는다: `fullscreenSupported()`, `isFullscreen()`, `toggleFullscreen()`(문서 뿌리 `<html>`을 띄우고 가로 잠금을 한 번 시도, webkit 접두사 대신 쓰기), `onFullscreenChange(fn)`(`fullscreenchange`·`webkitfullscreenchange`). `#app`이 아니라 문서 뿌리를 띄우는 까닭은 body에 붙은 회전 안내가 전체 화면 안에서도 보여야 하기 때문이다.
- `portrait.js`: 견습 사서 모습 고르기의 3D 미리보기(`createPortraitStage()`, 3D가 아니면 null). 화면에 붙이지 않은 작은 WebGL 그림판 하나로 `student-a|b`를 그려 2D 캔버스 칸에 옮긴다(`attach(canvas, look)` → `setSelected`), 3/4 자세 정지 그림(`portrait(look)` → `data:` PNG, 창이 닫힐 때까지 다시 씀). 세계와 따로 돌며 세계가 뜨기 전에 `dispose()`로 그림판을 버린다.
- `motion.js`: 움직임 줄이기 전역 상태(기기 설정 또는 브라우저 `prefers-reduced-motion` 가운데 하나라도 켜지면 켜짐). `#app.reduce-motion`과 `settings:reduce-motion`.
- `palette.js`(색 토큰 사본과 단청 값, DOM 없음), `assets.js`(자산 목록에서 그림 주소·무늬 찾기), `sprites.js`(그림이 없을 때 쓰는 자리표시 종이 인형 캔버스), `tuning.js`(조정 값).

## 맡지 않는 것
- 진행 규칙과 기록. 세계는 진행 기록을 읽지 않는다. 마친 관은 부르는 쪽이 `setDancheong(id, 1)`로, 관 문은 `wing:state`로 알려 준다.
- 떠도는 노래 그리기와 누르기(한 판 흐름이 `floatingSpots` 자리에 직접 그린다), 재기 화면 내용, 작품 방 내용.
- 자산 목록 내려받기. 세계는 `assets/manifest.json`을 스스로 읽지 않는다(없는 파일 요청이 콘솔 오류가 되지 않게). `mount`에 넘겨받은 목록만 쓰고, 없으면 모든 그림이 자리표시다.
- `js/play/`, `js/story/`, `js/boss/`를 import하지 않는다.

## 불변식
- 세계는 한 번에 하나다(`world.js`의 모듈 변수). 다시 띄우기 전에 `dispose()`를 부른다.
- 제품에는 2D를 강제하는 스위치가 없다. 점검은 WebGL을 끈 브라우저로 2D를 연다.
- 성능 상한: 관 하나의 그리기 호출 60회 이하, 픽셀 비율 1.5 이하, 실시간 그림자·후처리 없음(`TUNING.drawCallBudget`, `pixelRatioMax`). 회랑 건축은 재질 역할마다 합친 기하(책등은 `InstancedMesh`)를 관 자리 사이 x 구간으로 나눠 보이는 구간만 그린다(회랑 화면 36회 안팎). 관 문은 `InstancedMesh` 하나다. 접지는 그림자 번짐 카드가 맡는다.
- 회랑 건축(`gallery`)은 관 안에서 숨긴다. 관 카메라(`anchors.camera`)가 회랑 벽 위에 서므로 높은 처마가 관을 가린다. 마당·바닥돌·나무·병풍(`grounds`)은 관 안에서도 보인다. 첫 화면이 늦지 않게 `grounds`는 두 번째 프레임에 짓고 셰이더를 따로 엮은 뒤(`compileAsync`) 붙이고, `gallery`는 처음 회랑을 그릴 때 짓는다.
- 회랑·바깥·관 문은 꼭짓점 빛 재질(`gfx/t39-perf.js`의 `createRigLitMaterials`, 빛 묶음 'corridor'·'wing'과 같은 값)로 그린다. 회랑 건축은 관 자리 사이 경계로 x 구간을 나눠 화면 밖을 그리지 않는다.
- 그리기 판은 `NeutralToneMapping`·sRGB 출력이다(`gfx/lighting.js`). 승인된 그림(종이 인형, 현판)의 재질은 `toneMapped: false`로 색을 지킨다. 작품 방 무대가 열린 동안은 톤 매핑을 끄고 닫으면 되돌린다.
- 건축 단청 칠은 가라앉은 뇌록·석간주로 칠하고 단청 값 0에서 먹빛이다. 밝은 녹청·주홍은 누를 수 있는 것(관 문)에만 쓴다.
- 2D 누를 자리는 관 모형의 `anchors`마다 세계가 48px 이상으로 만들고, 이름표는 `board2d.js`의 `ANCHOR_LABELS`(모두 한국어)에서 온다. 그림 판 오른쪽 아래 구석(`x > 78`이면서 `y > 78`)에는 상황 버튼이 있다. 2D에서 학생은 그림 판 `y` 40~95% 띠 안에서만 걷는다.
- `openSplit`·`openRoom` 동안 이동 조작과 상황 버튼은 멈춘다. `closeRoom()`은 숨긴 것, 안개, 바탕, 카메라의 시야각·near·far·up·zoom, 그리기 판 크기를 열기 전으로 되돌린다.
- 회전 안내가 떠 있는 동안 그리기 고리는 프레임을 건너뛴다(`isPaused()`).
- 전체 화면에 들어가고 나올 때 그리기 판 크기는 따로 맞추지 않는다. 3D 그림판은 `ResizeObserver`(`scene3d.js`), 2D 그림 판은 CSS 크기로 창을 따라간다. 회전 안내는 `fullscreenchange` 때 창 크기로 다시 판단한다.
- 가림: `mount`에 넘긴 container 안에 `data-world-cover`가 붙은(hidden이 아닌) 요소가 있으면 그리기와 관 모형 update를 건너뛴다(단청 돌아오기 값은 계속). 세계를 꽉 덮는 겹(보스, 입구·엔딩 장면, 판 카드, 마지막 카드, 수첩·일지·도감 창)은 뿌리에 이 속성을 단다. 반투명 겹은 달지 않는다.
- 화질 단계는 픽셀 비율과 꾸밈 겹(`corridor-decor`)만 바꾼다. 누를 자리, 카메라, 관 모형, 그리기 호출 예산 검사는 그대로다. 소프트웨어 그리기(SwiftShader 등)에서는 세계 그림판이 MSAA 없이 만들어진다(`gfx/t39-perf.js`).
- `palette.js`의 `TOKENS`는 `css/base.css`의 색 토큰과 같은 값이다.

## 구현 방식
- 3D와 2D는 `createScene3D`/`createBoard2D`가 같은 손잡이 모양을 돌려주고, `world.js`가 그 위에 같은 바깥 함수를 얹는다. 3D 쪽에 기능을 더하면 2D 쪽에도 같은 함수가 있어야 한다.
- 관 모형은 `registry.wings`(이미 `normalizeWing`으로 감싼 것)에서 가져온다. 점검 페이지가 감싸지 않은 모형을 직접 넘기면 옛 손잡이 모양이 그대로 보인다.
- 방 무대(3D): `openRoom(el)`은 세계의 다른 것(회랑, 관 문, 현판, 관 모형, 학생, 표시, 빛)을 숨기고 안개를 끈 뒤 세계 원점에 빈 무리를 붙여 `{ THREE, root, camera }`를 돌려준다. 세계는 방이 열린 동안에도 프레임마다 그리되 `el`의 자리와 크기에만(viewport·scissor) 그리고 카메라 비율을 그 칸에 맞춘다. 카메라 자리·방향·시야각은 방이 정한다. 2D면 `null`을 돌려준다.
- 반반 틀: 지금 관 모형에 `measureFocus`가 있으면 왼쪽 반이 그곳을 비춘다. 3D는 카메라가 `target`을 보고(`position`이 없으면 `TUNING.measureOffset`만큼 떨어져), 2D는 그림 판을 왼쪽 칸에 꽉 차게 키우고 초점을 가운데로 민다.
- 단청: `diorama:dancheong-restore`를 받으면 지금 관을 0→1로 `TUNING.dancheongRestoreSeconds` 동안 올린다(움직임 줄이기면 바로). 색은 `dancheongColor(본색, 값)`으로 먹빛과 본색 사이를 섞는다.
- 움직임 줄이기면 카메라 이동은 잘라 바꾸고, `shake()`는 아무것도 하지 않고 `false`를 돌려주며, 파티클은 `particleScale()`(0.3)배로 줄인다. 인물의 숨쉬기·들썩임·소매 흔들림·고개 돌리기도 끄고, 3D 학생은 팔다리만 작게 움직이며 방향을 바로 바꾼다.
- 학생은 `gfx/figures.js`의 `createCharacter`로 만든 절차 3D 인물이다(`gfx/figures-3d.js`, 생김새 a·b는 기록의 `appearance`). 몸 하나 + 먹 테두리 하나 + 발밑 그림자 하나로 그리기 호출 셋이다. 걷는 쪽을 부드럽게 돌아보고, 오래 서 있으면 카메라 쪽으로 비스듬히 돌아선다. 키 1.62m(문 2.6m, 기둥 3.6m 기준), 발 가운데가 자리다. 선대 사서·가객 45명·좀·좀 대왕도 같은 틀의 3D 인물이다. `createFigure`에 그림 주소(`sprite/<이름>.webp`)를 넘기면 저절로 3D가 되고, 조립법이 없는 그림(「정석가」 방의 '임', 자리표시 캔버스)만 종이 카드로 남는다. 가객은 `gfx/cast.js`의 표(틀 → 생김새 → 노래)로 짓는다. 2D 그림 판, DOM 화면(엔딩 행렬, 도감, 입구, 회랑의 좀 알림, 시조 방 얼굴)과 결과 카드는 승인된 그림 그대로다.
- `motion.js`는 처음 설치될 때 저장 문서에서 `device.reduceMotion`을 직접 읽는다(열쇠 `yetnorae-seogo-v1`을 상수로 따로 가진다). 저장 열쇠가 바뀌면 이 상수도 바꾼다.

## 점검
- `node tests/check-world.mjs`(`tests/pages/world.html`): 세 화면 크기에서 탭 이동, 조이스틱, 키보드, 회전 안내와 멈춤, 3D를 끈 브라우저에서 2D 전환, 반반 틀 넘침, 그리기 호출 수, 움직임 줄이기, 색 토큰이 base.css와 같은지. 페이지가 도착을 알리는 값은 동기 판별 함수로 기다린다.
- `node tests/check-wing-contract.mjs`: 등록된 관 모형 손잡이와 2D 이름표, 반반 틀 초점.
- 세계를 고치면 `check-wingflow`, `check-rooms-in-flow`, `check-ui`도 영향을 받는다.
