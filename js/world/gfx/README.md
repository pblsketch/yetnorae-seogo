# js/world/gfx — 그래픽 꾸러미

다섯 관, 다섯 방, 보스 장면을 다듬을 때 쓰는 공용 도구다. 회랑(`js/world/corridor-art.js`), 학생 3D 인물(`scene3d.js`와 「상춘곡」·「님이 오마 하거늘」 방), 「정석가」 방의 '임'(종이 카드)이 이미 이 꾸러미로 그려진다. 바깥 그림 파일과 바깥 요청 없이 코드로만 만든다.

순서는 **모양 → 재질 → 빛 → 효과**다. 안개나 빛으로 빈 모양을 덮지 않는다.

## 파일

| 파일 | 맡는 일 |
| --- | --- |
| `textures.js` | 캔버스 무늬: `hanji` 한지 섬유, `wood` 나뭇결(결이 u 방향), `planks` 마루 널, `roof` 기와 골, `stone` 돌 쌓기, `granite` 한 덩이 화강암 결(향가관 석탑), `plaster` 회벽, `foliage` 종이 나무 두 칸(왼쪽 소나무, 오른쪽 매화), `mountains` 수묵 산 세 줄, `contact` 접지 그림자, `glow` 등불 번짐. 씨앗이 있어서 늘 같은 그림이 나온다 |
| `materials.js` | 역할별 재질 하나씩과 먹빛 → 단청 걸이(`addInkHook`) |
| `kit.js` | 모서리를 깎은 부분을 역할마다 하나의 기하로 합치는 틀(`builder`)과 소품 함수 |
| `figures.js` | 인물 무대: 인물 고르기(`createFigure`·`createCharacter`, 조립법이 있는 그림은 저절로 3D), 종이 카드(`createPaperCard`), 발밑 그림자, 무리(`createFigureCrowd`) |
| `figures-3d.js` | 절차 3D 인물: 부분 조립법(`RECIPES`: 학생 둘, 선대 사서, 가객 45, 좀, 좀 대왕), 뼈대 셋(사람·좀·좀 대왕), 한 기하로 합친 SkinnedMesh와 먹 테두리, 코드로 하는 움직임, 무리 굽기 |
| `cast.js` | 가객 표: 틀(신분·직분 14) → 생김새(그림 25장) → 노래 45편. 검토용 데이터 |
| `lighting.js` | 그리기 설정(색 공간, 톤 매핑), 빛 묶음(반구광 + 주광 + 보조광), 장면별 안개 |
| `t39-perf.js` | 그리기 비용 줄이기: 회랑·바깥 꼭짓점 빛 재질(`createRigLitMaterials`), 밉맵 한 장 거르기(`mipNearest`), 긴 무리 x 구간 나누기(`splitByX`), 한 번에 칠하는 수묵 병풍(`createInkScreens`), 둥근 먹안개 판(`fogDisc`), 소프트웨어 그리기 알아보기(`softwareRendering`) |

## 기본 사용

```js
import { createTextures } from '../gfx/textures.js';
import { createMaterials } from '../gfx/materials.js';
import { createKit } from '../gfx/kit.js';

const textures = createTextures(THREE);
const materials = createMaterials(THREE, textures);
const kit = createKit(THREE, { materials });

const b = kit.builder();
kit.hanokFrame(b, { posts: [-4, 0, 4], z: -3, height: 3.6, eave: 1.35 });   // 기둥, 창방, 공포, 서까래
kit.giwaRoof(b, { x0: -5, x1: 5, zFront: -1.5, zBack: -3.9, yFront: 4.5, yBack: 5.4 });
kit.bookshelf(b, { x: -2, z: -2.7, width: 2.6, seed: 3 });
kit.latticeWindow(b, { x: 2, y: 1, z: -2.95, w: 1.6, h: 1.4, pattern: 'tti' });
const glows = [];
kit.lantern(b, glows, { x: 0, y: 2.7, z: -2 });
kit.glowCards(b, glows);
kit.paperTree(b, { x: 7, z: -6, h: 4, kind: 'pine' });
kit.inkScreen(b, { x: 0, z: -12, panels: 8 });          // 수묵 병풍(위에서 보는 카메라용 배경 막)
kit.contactShadow(b, { x: 0, z: 0, w: 2, d: 1 });
root.add(b.build('my-wing'));                            // 역할마다 Mesh 하나 + 책등 InstancedMesh 하나

materials.setDancheong(level);                           // 0 = 먹빛, 1 = 단청이 다 돌아옴
// 치울 때: 장면을 traverse해 geometry/material을 dispose하고, kit.dispose(), textures.dispose()
```

`b.add(role, geometry, { p, r, s, color, shade, ao, uv })`로 어떤 기하든 넣을 수 있다. `b.box(role, w, h, d, opts)`는 모서리를 깎은 상자다(아주 가는 부분은 평범한 상자). 무늬 좌표는 부분의 긴 축을 따라 m 단위로 잡히므로 긴 보에도 결이 늘어나지 않는다. 꼭짓점 색에는 바닥 AO(바닥에 가까울수록 어둡게, `ao` 0~1)와 아랫면 그늘이 구워진다.

## 재질 역할

`wood`, `paint`(단청 칠), `plaster`, `roof`, `stone`, `floor`, `paper`(창호지, 조금 스스로 밝음), `books`(인스턴스 색), `lantern`(초롱 비단, 안에서 등불이 비침), `foliage`(알파 자르기), `backdrop`(빛 없음, 투명), `contact`, `glow`(더하기).

먹빛 걸이는 모든 재질이 같은 uniform 하나를 본다. 재질마다 '먹 바닥'이 있어서 `paint`·`lantern`은 단청 값 0에서 완전한 먹빛이고, 나무·돌·회벽은 조금만 바랜다. palette.js의 `dancheongColor(본색, 값)`과 같은 뜻이다. 다른 재질에 걸려면 `addInkHook(material, materials.shared, 먹바닥)`.

**색 규칙**: 밝은 녹청·주홍 토큰은 누를 수 있는 것(칸, 바구니, 고리, 문)에만 쓴다. 건축 단청 칠은 뇌록(`#5d6f62`)·석간주(`#7d4a3c`)처럼 가라앉은 색으로 칠한다(`corridor-art.js`의 `PAINT`, `ACCENT`).

## 종이 인형(figures.js)

```js
import { createFigure, FIGURE_HEIGHT } from '../world/gfx/figures.js';
const url = assets.image?.('sprite/singer-' + songId) ?? null;
const fig = createFigure(THREE, { url, canvas: url ? null : paperDollCanvas('singer'), height: FIGURE_HEIGHT.singer, reduceMotion, name: 'singer' });
fig.root.position.set(x, 0, z);   // 발 자리(바닥 위)
root.add(fig.root);
// 프레임마다(카메라를 움직인 뒤)
fig.update(dt, camera, { moving, flip });
fig.dispose();
```

- 그림은 `url`로 넘긴다. 꾸러미가 미리 곱한 알파로 따로 올려서 가장자리 검은 테가 생기지 않는다. `assets.texture()`로 받은 공용 무늬를 `texture`로 넘겨도 되지만, 그 무늬는 곧은 알파라 가장자리가 조금 어두울 수 있다.
- 카드는 세로축으로만 카메라를 보고(바닥에 선 채로), 위에서 보면 `lean`만큼 젖힌다. 테두리 두께는 `edge`(그림 너비에 대한 몫)로 바꾼다.
- 키 기준(m): 학생·가객 1.62, 선대 사서 1.7, 좀 0.7. 문 높이 2.6m, 기둥 3.6m와 눈높이를 맞춘 값이다. 방처럼 카메라가 가까운 곳은 화면 구성에 맞춰 키를 키워도 된다(「정석가」 임 2.05).
- 움직임 줄이기면 숨쉬기·살랑임·걸음 흔들림이 모두 꺼진다. `update`는 그래도 불러야 카메라를 본다.
- 방이나 보스에서 흔들기 같은 연출은 `fig.card.rotation.z`에 `update` 뒤에 더한다(「정석가」 방 참고).

`createFigure`는 그림 이름에 3D 조립법이 있으면 종이 카드 대신 3D 인물을 돌려준다(아래 '절차 3D 인물'). 지금 종이 카드로 남는 것은 조립법이 없는 그림뿐이다(「정석가」 방의 '임', 그림 자산이 없어 자리표시 캔버스를 넘긴 경우). 종이 카드를 꼭 써야 하면 `procedural: false`를 주거나 `createPaperCard`를 부른다.

## 절차 3D 인물(figures-3d.js)

학생(생김새 a·b)은 종이 카드가 아니라 코드로 조립한 낮은 다각형 인형이다. 약 3등신의 장난감 비례(머리 0.5m, 키 1.62m)에 저고리·고름·바지(또는 두루마기)·대님·버선코 신을 입었다. 색과 옷은 승인된 `sprite/student-a|b.webp`를 따른다(a: 녹청 저고리와 크림 깃·끝동, 붉은 매듭 술, 걷은 바짓단, 흰 신, 짙은 가방, 두루마리 / b: 크림 두루마기와 짙은 깃·흰 동정, 녹청 고름, 상투 머리, 둥근 안경, 녹청 가방, 붓과 책).

```js
import { createCharacter, FIGURE_HEIGHT } from '../world/gfx/figures.js';
const fig = createCharacter(THREE, { kind: 'student-a', height: FIGURE_HEIGHT.student, reduceMotion, name: 'student' });
root.add(fig.root);                  // 발 가운데가 원점
fig.root.position.set(x, 0, z);
// 프레임마다(카메라를 움직인 뒤)
fig.update(dt, camera, { moving, dir: { x, z }, speed });   // 셋 다 빼면 root가 움직인 거리로 스스로 잰다
fig.dispose();
```

- `kind`에 조립법이 없으면 같은 인자로 종이 카드(`createPaperCard`)를 돌려준다. 그래서 `url`·`canvas`를 함께 넘겨 두면 언제든 카드로 돌아갈 수 있다. 두 손잡이는 `root`, `card`, `shadow`, `material.userData.ink`, `update`, `setTexture`, `dispose`가 같다. 3D의 `card`는 발 가운데를 축으로 하는 묶음이라 `update` 뒤에 `card.rotation.z`를 더하는 흔들기 연출이 그대로 먹고(다음 `update`가 0으로 되돌린다), `material.userData.ink.value`(0 먹빛 ~ 1 제 빛깔)도 종이 카드와 같이 쓴다. `body`에 뼈와 몸이 있다.
- 3D가 되는 이름: `student-a`·`student-b`, `mentor`, `jom`, `jom-king`, `singer-<노래 id>`(45), `look:<생김새>`(25). `createFigure({ url })`는 url의 `sprite/<이름>.webp`에서 이름을 읽는다(`spriteKind`). `sprite: 'sprite/mentor'`나 `kind`로 줘도 된다. 자산 목록이 없어 자리표시 캔버스만 넘기면 이름을 알 수 없으므로 종이 카드다.
- `height`를 빼면 `FIGURE_HEIGHT`에서 고른다(좀 0.7, 좀 대왕 3.2, 선대 사서 1.7, 그 밖 1.62). 좀·좀 대왕의 키는 종이 카드처럼 그림 전체 높이(더듬이·왕관 끝까지)다.
- 그리기: 몸 전체가 `SkinnedMesh` 하나(재질 하나: 한지 결 무늬 + 꼭짓점 색), 먹 테두리가 뒤집은 껍질 하나(같은 꼭짓점, 얼굴 장식·안경은 뺀 색인), 발밑 그림자 하나. 인물 하나에 그리기 호출 셋, 몸 삼각형 약 5.3천(a)·5.6천(b)에 테두리 몫이 더해져 화면에서 약 1만이다. 재질과 무늬는 모든 3D 인물이 나눠 쓴다(셰이더 둘).
- 뼈대(`HUMANOID`): hips → torso → head, armL/R → foreL/R·sleeveL/R, hips → thighL/R → shinL/R, torso → bag·tassel. 무게는 거의 한 뼈에 1이다. 두루마기 자락처럼 다리를 따라야 하는 곳만 `weights`로 두 뼈에 나눈다.
- 꼭짓점 색에 AO가 구워진다: 발 가까이, 아랫면, 몸 안쪽을 보는 팔다리 면(`cav`). 살갗·얼굴은 결 무늬를 쓰지 않는다(`flat`).
- 움직임: 걸음 위상은 빠르기 ÷ 보폭(1.25m)으로 돈다. 다리·팔 흔들기, 앞 다리 무릎 굽힘, 몸 들썩임, 허리 비틀기, 소매·가방·술이 조금 늦게 흔들린다. 가만히 있으면 숨쉬기, 2.4~5초마다 고개 돌리기. 가는 쪽을 부드럽게 돌아본다. `faceCamera`(기본 true)면 1.4초 넘게 서 있을 때 카메라 쪽으로 비스듬히(3/4) 돌아선다. 길을 걸어가는 방은 false로 둔다.
- 움직임 줄이기: 들썩임·비틀기·소매와 가방 흔들림·숨쉬기·고개 돌리기를 끄고, 다리·팔만 작게 움직이며, 방향은 바로 바꾼다.

시작 화면의 모습 고르기 미리보기와 기록 목록의 작은 그림(`js/world/portrait.js`)도 같은 `student-a|b` 인물을 `createCharacter`로 그린다. 고른 모습 카드는 `root.rotation.y`로 천천히 돌리고, 인사는 `update` 뒤에 `body.bones.torso`·`head`를 앞으로 숙여 더한다.

**선대 사서·가객·좀(T38).** 사용자가 학생 3D를 보고 '모든 인물로 넓힌다'고 정했다. 같은 틀(약 3등신, 한지 결, 꼭짓점 AO, 먹 테두리, 코드 움직임)로 다른 인물을 지었다.

- 선대 사서(`mentor`, `sprite/mentor`): 흰 상투와 긴 흰 수염, 구름무늬 먹빛 장삼, 붉은 띠와 금 장식, 녹청 띠와 술, 왼손에 든 책, 허리의 열쇠.
- 가객(`singer-<노래 id>`): 45명을 따로 짓지 않고 `cast.js`의 표로 짓는다. 틀(`ARCHETYPES`: 승려, 화랑, 신라 민간, 장사꾼·서민, 노인, 고려 궁중 악공, 신라 귀족(처용), 여인, 기녀, 규방 여성, 양반 선비·가객, 사대부 관리, 무인, 장수)이 몸 모양·머리·쓰개·옷 색을 정하고, 생김새(`LOOKS`, 승인된 가객 그림 25장에 하나씩)가 색·쓰개·수염·소품·손 자세만 덧쓴다. `SINGERS`가 노래 45편을 생김새에 잇는다(같은 그림을 쓰는 노래는 같은 생김새). 표를 고치면 바로 3D가 바뀐다. 「오백 년 도읍지를」 그림의 말은 넣지 않았다(따로 걷는 몸이 필요해서).
- 사람 몸은 `person(p, 인자)` 하나가 짓는다: 몸(`jacket` 저고리·바지, `robe` 도포·장삼·철릭, `dallyeong` 단령, `skirt` 치마저고리, `armor` 두정갑), 머리(민머리, 상투, 쪽머리, 가체, 댕기), 쓰개(갓, 사모, 전립, 투구, 머리띠, 두건, 높은 관, 꽃 꽂은 관), 수염, 겹옷(조끼, 가사, 흉배, 붉은 띠, 앞섶 겹), 띠(띠와 술, 세조대, 각대, 새끼줄), 신(짚신, 흑혜, 꽃신), 소품(부채, 펼친 부채, 잔, 바리때, 두루마리, 붓, 책, 종이, 지팡이, 대지팡이, 가시 가지, 꽃, 매화 가지, 북, 피리, 초롱, 바구니, 지게, 걸망, 곰방대, 화살통, 칼, 세운 칼, 난 화분, 짚 묶음, 열쇠, 주머니).
- 손에 든 소품은 '팔을 든 자세 그대로'의 좌표로 적고(`inHand`), 틀이 쉼 자세로 되돌려 아래팔 뼈에 붙인다. 팔을 얼마나 드는지는 생김새의 `pose`(foreL/foreR 아래팔, outL/outR 벌림)가 정하고 움직임이 그 자세를 쉼 자세로 쓴다. 들어 올린 소매는 천처럼 조금만 따라 든다. 치마 입은 인물은 다리를 덜 흔든다(`legScale`).
- 좀(`jom`, 뼈대 `BUG`): 비늘 마디 여섯(붉은·녹청 테와 금 점), 긴 더듬이, 큰 눈과 웃는 입, 다리 세 쌍, 앞발에 든 종이 한 장. 걸으면 마디가 물결치고 다리 두 무리가 번갈아 빠르게 딛는다. 서 있으면 이따금 바르르 종종거리고 더듬이가 따로 살랑인다.
- 좀 대왕(`jom-king`, 뼈대 `KING`): 먹구름 덩이 몸과 밝은 먹 소용돌이, 찌푸린 눈두덩 아래 빛나는 눈, 녹청 띠·금 테·붉은 꽃 장식의 왕관과 양옆 술, 끝이 말린 연기 팔, 몸을 천천히 도는 좀과 종잇조각. 늘 카메라를 마주 보고 천천히 떠올랐다 가라앉으며, 이따금 앞으로 몸을 기울여 내려다본다. 겁주기보다 으스스하게, 학생용으로 둥근 모양을 지켰다.
- 움직임 줄이기: 좀의 물결·종종거림·더듬이, 좀 대왕의 떠오름·기울임·도는 좀이 모두 멈춘다(사람은 위와 같다).

**인물을 더하는 법.** 가객 하나를 바꾸거나 더하려면 `cast.js`의 `LOOKS`·`SINGERS`만 고친다. 새 몸을 만들려면 `figures-3d.js`의 `RECIPES`에 kind 이름으로 함수 하나를 더한다. 함수는 부분 모으는 틀 `p`를 받아 설계 좌표(발 가운데 원점, 정면 +z, 사람 키 1.62m)로 부분을 놓는다.

```js
RECIPES.mentor = (p) => person(p, { body: 'robe', hair: 'topknot', beard: 'long', coat: '#66615a', … });   // 사람은 person으로
function jom(p) { p.ell('seg1', [0, 0.16, 0.1], [0.21, 0.1, 0.1], { color: '#9d978c' }); … }
jom.rig = 'bug'; jom.designHeight = 0.62; jom.shadow = [0.8, 1.0]; jom.stride = 0.4;                 // 사람이 아닌 몸
```

- 틀의 부분: `ell`(타원체), `tube`(두 점 사이 원기둥·원뿔), `path`(여러 점을 잇는 관), `lathe`(돌림, z 납작 `sz`, 앞을 터 두는 `phi0`·`phiLen`), `box`, `torus`, `add`(어떤 기하든), `withMatrix`(행렬을 먼저 곱해 넣기). 옵션은 `color`, `flat`, `ao`, `cav`, `line`(테두리 두께 배수, 0이면 테두리 없음), `shade`, `weights`, `seg`, `minSeg`(먼 몸에서도 지킬 둘레 나눔).
- 조립법 함수에 붙이는 값: `rig`(`humanoid` 기본, `bug`, `king`), `designHeight`, `shadow`, `stride`(걸음 한 바퀴 거리), `faceOffset`(서 있을 때 카메라에서 비켜 서는 각), `alwaysFace`, `pose`, `cacheKey`. 새 뼈대는 `RIGS`에 표를, `ANIMATE`에 움직임 함수를 더한다.

**나눠 쓰기와 예산.**

- 같은 조립법(`cacheKey`, 가객은 생김새)·같은 `detail`의 인물은 합친 기하 하나를 나눠 쓴다(마지막 인물이 치울 때 버린다). 재질은 모든 3D 인물이 둘(몸·테두리)을 나눠 쓴다. 인물 하나만 먹빛으로 바꿀 때만 같은 셰이더의 몸 재질 사본을 쓴다(셰이더는 늘지 않는다).
- 인물 하나: 그리기 호출 셋(몸, 테두리, 발밑 그림자). 몸 삼각형은 가까운 몸 3.5천(좀)~7천(장수), 가객 대부분 4.1천~5.6천이다. `detail: 0.55`(먼 몸)이면 2.2천~2.6천이다. 머리와 머리 덮개는 먼 몸에서도 둘레 나눔을 줄이지 않는다(살갗이 머리카락 사이로 비치지 않게).
- 무리(`createFigureCrowd(THREE, members, { detail, reduceMotion, outline })`): 엔딩 행렬처럼 많은 인물을 한꺼번에 세울 때. 서 있는 자세로 구운 몸을 기하 하나로 합쳐 몇 명이든 그리기 호출 셋(몸, 테두리, 그림자 인스턴스)이다. 사람마다 위상이 다른 작은 들썩임은 꼭짓점 셰이더가 하고(셰이더 둘 더), 움직임 줄이기면 멈춘다. 45명 먼 몸: 몸 삼각형 약 11만(테두리 포함 화면 약 20만).
- SwiftShader에서 잰 수(다른 점검이 함께 돌던 때, 1600×900): 빈 장면 51fps, 가까운 3인(선대 사서·좀·좀 대왕) 22~24fps, 7인 한 줄 13~20fps, 가객 45명 개별 인물 136회·4~6fps, 같은 45명 무리 4회·8~10fps(844×390에서 16.5fps). 무리는 테두리를 빼도(`outline: false`) 빨라지지 않았다. 이 크기에서는 삼각형보다 채움이 무겁다.

## 빛과 그리기

- `applyRenderSettings(renderer, THREE)`: sRGB 출력, `NeutralToneMapping`(노출 1.0), 그림자 맵 끔. 세계 그리기 판에 한 번 적용되어 있으므로 관 모형은 따로 부를 필요가 없다. 작품 방 무대(`openRoom`)가 열린 동안은 세계가 톤 매핑을 끈다(방 그림 판을 승인된 색 그대로 보이려고). 방을 다듬으며 톤 매핑을 쓰려면 `scene3d.js`의 `beginRoom`에서 이 줄을 바꾼다. 승인된 그림(종이 인형, 현판, 방 그림 판)이 색을 그대로 지켜야 하면 그 재질에 `toneMapped: false`.
- `createLightRig(THREE, scene)` → `setPreset('corridor' | 'wing' | 'room')`, `aim(자리)`. 세계가 회랑·관을 오갈 때 바꾼다. 관 모형이 자기 빛을 더하면 이 빛과 합쳐지므로 밝기를 낮춰 잡는다.
- `setFog(scene, 'corridor' | 'wing', 색)`: 회랑 16~62m, 관 26~110m. 관 뒤 수묵 병풍(관 뒤 약 4.5m)과 사이 나무가 안개에 조금 녹는다.

## 세계가 이미 깔아 둔 것

`corridor-art.js`의 `grounds` 무리는 관 안에서도 보인다: 관 자리 바닥돌 테(13.6m 네모의 둘레 0.6m)와 문에서 오는 돌길, 관 사이 종이 나무(두 겹), 관 뒤 수묵 병풍, 먼 수묵 산, 회랑 앞 좁은 땅. 넓은 마당면은 없고 장면 바탕색(먹빛 한지)이 마당이다. `gallery`(회랑 벽·처마·서가·초롱·난간)는 관 안에서 숨는다. 관 카메라가 회랑 벽 위에 서기 때문이다. 관 모형은 자기 바닥 둘레(±6.5m) 안만 짓는다.

## 예산 요령

- 상한: 장면 하나 그리기 호출 60회, 픽셀 비율 1.5, 그림자 맵·후처리 없음.
- 첫 화면을 늦추지 않는다. SwiftShader에서 셰이더 하나를 엮는 데 수십 ms가 든다. 세계는 `grounds`를 두 번째 프레임에 짓고 `renderer.compileAsync`로 엮은 뒤 붙이며, `gallery`는 처음 회랑을 그릴 때 짓는다. `check-ui`는 관에 들어간 뒤 300ms 안에 '관 들어가기 글'이 뜬다고 보고 닫으므로, 관 모형이 처음 만들 때 무거운 일을 몰아 하면 이 점검이 흔들린다. 새 재질(셰이더)을 늘리기보다 기존 역할을 쓴다.
- 지금 수(SwiftShader, 1366×768): 회랑 23회·삼각형 약 10.1만·무늬 15·셰이더 11, 고려가요관 17회·삼각형 약 2.2만(세계 바탕 8 + 관 모형 9). 학생 3D 인물이 3회·약 1만 삼각형이다(T34). 같은 화면에서 학생을 숨겼다 보였다 하며 재면 fps 차이는 약 1(다른 점검이 함께 돌 때 회랑 약 9~10, 고려가요관 약 10~17fps).
- **채움 비용을 잰다.** SwiftShader(점검 브라우저)는 화면을 넓게 덮는 면 하나에 프레임당 10ms 넘게 쓴다. 관 화면의 절반을 덮던 마당 바닥면 하나로 35fps가 13fps까지 떨어져 `check-ui`의 '단추가 멈춰 있어야 누른다' 판정이 흔들렸다. 그래서 마당 바닥면을 빼고 바탕색에 맡겼다. 넓은 면, 알파 자르기 카드 여러 겹(나무), 큰 투명 카드는 꼭 필요한 곳에만 둔다. 확인은 관 화면에서 `requestAnimationFrame` 수를 세어 본다(지금 향가관 약 18fps, 바깥 무리를 끄면 32fps).
- 무늬 비등방 필터(`anisotropy`)는 1로 둔다(비스듬한 넓은 면에서 비싸다). 수치는 `renderer.info`(세계 `getThree().renderer`)로 잰다.
- 그리기 호출은 '역할 수'만큼 든다. 한 무리 안의 부분을 아무리 많이 넣어도 역할이 같으면 하나다. 새 역할(재질)을 만들기보다 꼭짓점 색으로 칠을 나눈다.
- 되풀이되는 작은 것(책, 기와 막새, 발자국)은 인스턴스로. 움직이는 것은 합친 기하에 넣지 말고 따로 둔다(합친 기하는 `matrixAutoUpdate = false`).
- 삼각형이 많은 것은 책등과 서까래·막새다. 카메라가 멀면 `bookshelf`의 `fill`을 낮추거나 `hanokFrame`의 `rafterGap`을 넓힌다.
- 투명 재질(`backdrop`, `contact`, `glow`)은 `renderOrder`로 순서를 잡아 두었다. 투명한 것끼리 많이 겹치게 하지 않는다.
- 무늬는 역할마다 한 장을 나눠 쓴다. 관마다 새 캔버스 무늬를 만들면 `textures.js`에 그리기 함수를 더하고 이름으로 받는다.

## 가사관·사설시조관 소품과 구운 빛(`t36-props.js`)

`createT36Props(THREE, kit)`는 kit 틀에 부분을 더하는 소품을 준다: 모임지붕 `hipRoof`, 물가 정자 `pavilion`, 연못 `pond`, 둔덕 `hill`, 바위 `rock`, 디딤돌 `flatStone`, 초가 이엉 `thatch`, 담장 `wallRun`, 띠살 문 `lattice`, 종이 초롱 `paperLantern`, 등줄 `lanternString`, 장터 좌판 `stall`, 옹기 `jar`, 종이 오린 사람 `cutout`(지게꾼·광주리 인 아낙·부채 든 양반·아이), 덩이 솔 `pine`, 꽃나무 `blossom`, InstancedMesh용 무늬 좌표 있는 깎은 상자 `unitBox`. 역할은 wood·paint·roof·stone·contact 다섯만 쓴다(회벽·창호지·초롱은 'paint'에 밝은 색).

`createLightBaker(THREE, 'wing')`는 관 빛 묶음(반구광 + 주광 + 보조광)을 꼭짓점 색에 굽고, `createBakedMaterials(THREE, textures, materials).convert(무리, baker)`는 kit이 지은 무리의 빛 재질을 빛 없는 재질(먹빛 걸이 그대로)로 바꾼다. SwiftShader에서 같은 그물의 그리기 시간이 대략 절반이 된다(`docs/engineering-notes.md`). 빛이 움직이는 장면(작품 방 연출 등)에는 쓰지 않는다.

## 점수 기록

다듬기 전후 스크린숏과 10항목 점수는 `tests/shots/gfx-before/`, `tests/shots/gfx-after/`(커밋하지 않음)에 있다. 찍는 도구는 `tests/shots/gfx-capture.mjs`(같은 폴더, 커밋하지 않음)다.

## 관 내부 층(`t35-wing.js`)

향가관·고려가요관·시조관 모형은 세계의 그림 도구를 넘겨받지 않으므로(`ctx`에 없다) `createWingGfx(THREE, { assets, wingId })`로 관마다 무늬·재질·소품 틀을 하나씩 만든다. 꾸러미 함수는 그대로 쓰고, 다음만 덧붙인다.

- **꼭짓점 빛 재질**: 빛을 받는 역할(wood, paint, plaster, roof, stone, floor, paper, books, lantern, foliage)을 `MeshBasicMaterial` + 꼭짓점 빛(`LIGHT_PRESETS.wing`과 같은 반구광·주광·보조광) + 먹빛 걸이로 바꿔 쓴다. 평평한 면에서는 램버트와 같은 색이고 SwiftShader에서 훨씬 싸다. 관 안에서만 쓰므로 빛 묶음이 'wing'일 때를 기준으로 한다. 무늬는 `LinearMipmapNearest`로 거른다.
- `boxMaterial(무늬, { tile })`: 크기를 바꾼 상자 인스턴스에 무늬가 늘어나지 않게 인스턴스 크기로 무늬 좌표를 잡는 재질(꼭짓점 빛 포함, 먹빛 걸이 없음 — 인스턴스 색이 이미 먹빛→단청으로 칠해져 있다). `bevelBox()`는 모서리를 깎은 단위 상자.
- `transformed(b, 행렬)`: 꾸러미 소품 함수를 돌리거나 축척을 바꿔 넣는다(지붕 뒷면, 옆을 보는 담, 반 크기 한옥 뼈대).
- `roofStone`·`roofStoneGeometry`(네 귀가 들린 오목한 돌·기와 지붕), `stoneLantern`(석등), `softSpot`(먹안개 번짐 무늬), `mural()`(관 그림 자산 `texture/<관>`을 먹빛 걸이 단 단청 판으로, 없으면 단청 칠).
- `deferred(짓기)`: 관에 들어간 뒤 두 번째 프레임에 짓는다. `materials.fresh(역할)`은 색을 따로 바꿀 새 재질(시조관 지붕).
- 수(SwiftShader, 1366×768, 점검 페이지 첫 화면): 그리기 호출 향가관 27, 고려가요관 27, 시조관 23. 비용 요령은 `docs/engineering-notes.md`의 '관 건축을 gfx 꾸러미로 짓자…'.

## 작품 방·보스 풍경(t37-scenery.js)

작품 방 다섯과 보스 장면이 함께 쓰는 풍경 꾸러미다. `createScenery(THREE, { unlit })`가 무늬·재질·소품 틀을 한 벌 만들고, 꾸러미에 없는 역할 넷(`thatch` 볏짚, `water` 흐르는 시냇물, `ink` 먹 번짐 땅·산, `plain` 무늬 없는 땅, `mist` 안개 띠)을 더한다. 꾸러미 builder가 역할 이름으로 재질을 찾으므로 `sc.kit.builder()`에 그대로 넣으면 된다.

- 소품: `hipRoof`(오목한 모임지붕 `giwa`, 둥근 초가지붕 `thatch`), `thatchedHut`(초가 n칸, `open`이면 앞이 트인 칸), `pavilion`(정자), `rock`, `stream`(시내 띠와 물가 돌), `groundDisc`(가장자리가 한지 바탕으로 녹는 땅), `mountainMass`(높이 면 산 덩이와 그 높이 함수), `inkRanges`(수묵 먼 산 두 줄, `inkBackdrop`의 가벼운 꼴), `mistBand`.
- `unlit`: 밤 장면처럼 넓은 면이 많고 빛의 결이 작은 곳은 역할을 빛 없는 꼴(MeshBasic + 같은 무늬 + 먹빛 걸이)로 그린다.
- 방마다 `sc.materials.setDancheong(값)`을 따로 둔다(방은 세계와 다른 재질 묶음을 쓴다).
- 넓은 땅은 무늬 없는 `plain`으로 그린다. SwiftShader에서 비스듬히 보이는 넓은 면의 무늬 읽기가 가장 비쌌다(「상춘곡」 방에서 무늬 땅을 빼자 약 1.5배).
- 보스의 좀·좀 대왕·선대 사서는 `figures.js`의 `createFigure`로 만든다(조립법이 있으면 3D 인물로 나온다, 방의 학생은 `createCharacter`). 종이 카드일 때 선대 사서는 갇힌 동안 `material.userData.ink`를 0으로 두어 먹빛이고, 풀려나면 1로 돌아온다(그 값이 없으면 빛깔 바꾸기만 건너뛴다).

## 그리기 비용 줄이기(t39-perf.js, T39)

SwiftShader(점검 브라우저, GPU 없는 기기)에서 모든 3D 화면이 1366×768 20fps를 넘게 하려고 더한 도구다. 모양은 그대로 두고 칠하는 비용만 줄인다.

- `createRigLitMaterials(THREE, textures)`: `createMaterials`와 같은 손잡이(`get`, `shared`, `setDancheong`, `dispose`)에 `setPreset('corridor'|'wing')`를 더했다. 빛을 받는 역할을 MeshBasic + 꼭짓점 램버트 빛(uniform) + 먹빛 걸이로 그린다. 창호지·초롱의 스스로 빛은 빛을 곱한 뒤 더한다(꾸러미 재질의 emissive와 같다). 세계(`scene3d.js`)가 회랑·바깥·관 문에 쓴다. 빛 묶음 색을 바꾸면 `RIG_COLORS`도 바꾼다.
- `addRigLight(재질, light, emit)`: 다른 MeshBasic 재질에 같은 꼭짓점 빛을 단다(관 문 인스턴스).
- `mipNearest(THREE, textures)`: 무늬를 `LinearMipmapNearest`로 거른다(`t35-wing.js`와 같은 값).
- `splitByX(THREE, 무리, 경계)`: 역할마다 합친 그물을 x 구간으로 나눠 화면 밖 구간을 시야 거르기로 뺀다. 회랑 건축(`corridor-gallery`)만 관 자리 사이 경계로 나눈다(회랑 그리기 호출 25 → 보이는 구간만 36 안팎, 삼각형 10만 → 5만, 12 → 33fps). 바깥(`grounds`)은 관 화면에서 그리기 호출만 늘어 나누지 않는다.
- `createInkScreens(THREE, materials, textures)`: 관 뒤 수묵 병풍(나무 테·그림자는 꾸러미 틀에, 한지 판은 따로). 한지와 먼 산·가까운 산을 판 하나에서 한 번에 칠한다(예전에는 한지 판 + 투명 산 카드 둘). 자리·크기는 `kit.inkScreen`과 같다.
- `fogDisc(THREE, 반지름 = 0.48)`: `PlaneGeometry(1, 1)`과 같은 무늬 좌표의 둥근 판. 둥근 번짐 무늬(먹안개, 보스 먹 덩이, 달무리)의 투명한 네 귀를 칠하지 않는다(약 28% 덜 칠함).
- `softwareRendering()`: 세계·보스 그림판이 MSAA를 끌지 정한다(소프트웨어 그리기에서만 끈다).

화질 단계(`js/world/quality.js`)는 세계가 그린 프레임을 재어 5초 평균이 18fps 아래면 픽셀 비율을 ×0.8, 다시 ×0.65로 낮추고 두 번째에는 꾸밈 겹(`corridor-decor`: 관 사이 종이 나무, 먼 수묵 산)을 숨긴다. 내려가기만 한다. 보스 그림판은 열릴 때 지금 단계의 픽셀 몫을 따른다. 자세한 규칙은 그 파일 머리글과 `docs/engineering-notes.md`.

잰 값과 재는 법은 `docs/engineering-notes.md`의 '회랑과 바깥을 꼭짓점 빛으로…', '보스 화면 뒤에서 세계가…'. 그리기 한 번의 시간은 `tests/shots/t39-prof.mjs`, 화면 fps는 `tests/shots/t39-fps.mjs`(둘 다 커밋하지 않음)로 잰다.
