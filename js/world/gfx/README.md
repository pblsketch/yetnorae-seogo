# js/world/gfx — 그래픽 꾸러미

다섯 관, 다섯 방, 보스 장면을 다듬을 때 쓰는 공용 도구다. 회랑(`js/world/corridor-art.js`), 학생 3D 인물(`scene3d.js`와 「상춘곡」·「님이 오마 하거늘」 방), 「정석가」 방의 '임'(종이 카드)이 이미 이 꾸러미로 그려진다. 바깥 그림 파일과 바깥 요청 없이 코드로만 만든다.

순서는 **모양 → 재질 → 빛 → 효과**다. 안개나 빛으로 빈 모양을 덮지 않는다.

## 파일

| 파일 | 맡는 일 |
| --- | --- |
| `textures.js` | 캔버스 무늬: `hanji` 한지 섬유, `wood` 나뭇결(결이 u 방향), `planks` 마루 널, `roof` 기와 골, `stone` 돌 쌓기, `plaster` 회벽, `foliage` 종이 나무 두 칸(왼쪽 소나무, 오른쪽 매화), `mountains` 수묵 산 세 줄, `contact` 접지 그림자, `glow` 등불 번짐. 씨앗이 있어서 늘 같은 그림이 나온다 |
| `materials.js` | 역할별 재질 하나씩과 먹빛 → 단청 걸이(`addInkHook`) |
| `kit.js` | 모서리를 깎은 부분을 역할마다 하나의 기하로 합치는 틀(`builder`)과 소품 함수 |
| `figures.js` | 인물 무대: 종이 카드(한지 테두리, 숨쉬기와 걸음), 발밑 그림자, 인물 고르기 `createCharacter` |
| `figures-3d.js` | 절차 3D 인물: 부분 조립법(`RECIPES`), 사람 뼈대, 한 기하로 합친 SkinnedMesh와 먹 테두리, 코드로 하는 걸음·숨쉬기·고개 돌리기 |
| `lighting.js` | 그리기 설정(색 공간, 톤 매핑), 빛 묶음(반구광 + 주광 + 보조광), 장면별 안개 |

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

아직 옮기지 않은 인물: 보스의 좀·좀 왕·선대 사서(`js/boss/scene3d.js`).

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

- `kind`에 조립법이 없으면 같은 인자로 종이 카드(`createFigure`)를 돌려준다. 그래서 `url`·`canvas`를 함께 넘겨 두면 언제든 카드로 돌아갈 수 있다. 두 손잡이는 `root`, `shadow`, `update`, `dispose`가 같다(3D는 `card`가 `null`, `body`에 뼈와 몸이 있다).
- 그리기: 몸 전체가 `SkinnedMesh` 하나(재질 하나: 한지 결 무늬 + 꼭짓점 색), 먹 테두리가 뒤집은 껍질 하나(같은 꼭짓점, 얼굴 장식·안경은 뺀 색인), 발밑 그림자 하나. 인물 하나에 그리기 호출 셋, 몸 삼각형 약 5.3천(a)·5.6천(b)에 테두리 몫이 더해져 화면에서 약 1만이다. 재질과 무늬는 모든 3D 인물이 나눠 쓴다(셰이더 둘).
- 뼈대(`HUMANOID`): hips → torso → head, armL/R → foreL/R·sleeveL/R, hips → thighL/R → shinL/R, torso → bag·tassel. 무게는 거의 한 뼈에 1이다. 두루마기 자락처럼 다리를 따라야 하는 곳만 `weights`로 두 뼈에 나눈다.
- 꼭짓점 색에 AO가 구워진다: 발 가까이, 아랫면, 몸 안쪽을 보는 팔다리 면(`cav`). 살갗·얼굴은 결 무늬를 쓰지 않는다(`flat`).
- 움직임: 걸음 위상은 빠르기 ÷ 보폭(1.25m)으로 돈다. 다리·팔 흔들기, 앞 다리 무릎 굽힘, 몸 들썩임, 허리 비틀기, 소매·가방·술이 조금 늦게 흔들린다. 가만히 있으면 숨쉬기, 2.4~5초마다 고개 돌리기. 가는 쪽을 부드럽게 돌아본다. `faceCamera`(기본 true)면 1.4초 넘게 서 있을 때 카메라 쪽으로 비스듬히(3/4) 돌아선다. 길을 걸어가는 방은 false로 둔다.
- 움직임 줄이기: 들썩임·비틀기·소매와 가방 흔들림·숨쉬기·고개 돌리기를 끄고, 다리·팔만 작게 움직이며, 방향은 바로 바꾼다.

**인물을 더하는 법(선대 사서, 가객, 좀).** `figures-3d.js`의 `RECIPES`에 kind 이름으로 함수 하나를 더한다. 함수는 부분 모으는 틀 `p`를 받아 설계 좌표(발 가운데 원점, 정면 +z, 키 1.62m)로 부분을 놓는다.

```js
RECIPES.mentor = (p) => {
  face(p, { brows: '#3a3430' });                                                 // 얼굴·귀·목 공통
  p.lathe('torso', [[0.26, 0.05], [0.2, 0.6], [0.18, 0.96], [0.05, 1.1]], { color: '#6e6a62', sz: 0.75, weights: … });   // 도포
  p.ell('head', [0, 1.6, 0], [0.3, 0.02, 0.3], { color: '#2b2b2b' });            // 갓 테
  for (const s of [1, -1]) arm(p, s, { cloth: '#6e6a62', cuff: '#e9e0cc', lining: '#e9e0cc', inner: '#d9cbae' });
};
```

- 틀의 부분: `ell`(타원체), `tube`(두 점 사이 원기둥·원뿔), `lathe`(돌림, z 납작 `sz`), `box`, `torus`, `add`(어떤 기하든). 옵션은 `color`, `flat`, `ao`, `cav`, `line`(테두리 두께 배수, 0이면 테두리 없음), `shade`, `weights`.
- 공통 조각 `face`, `hairCap`, `arm`, `leg`, `goreum`, `strap`, `satchel`을 다시 쓴다. 키가 다르면 `height`만 바꾼다(설계 좌표는 그대로 두고 통째로 키운다).
- 사람이 아닌 몸(좀)은 `HUMANOID` 옆에 뼈대 표를 하나 더 두고 조립법이 그 표를 고르게 하면 된다(지금은 사람 뼈대 하나뿐).
- 가객(`sprite/singer-<노래>`)처럼 사람마다 조금씩 다른 인물은 조립법 하나에 색·소품만 바꾸는 인자를 받게 한다. 종이 카드에서 3D로 옮길 때는 부르는 곳의 `createFigure`를 `createCharacter({ kind, …같은 인자 })`로 바꾸면 된다.
- 승인: 학생 3D는 사용자가 학생부터 보고 정하기로 했다. 다른 인물은 그 결정 뒤에 옮긴다.

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

## 점수 기록

다듬기 전후 스크린숏과 10항목 점수는 `tests/shots/gfx-before/`, `tests/shots/gfx-after/`(커밋하지 않음)에 있다. 찍는 도구는 `tests/shots/gfx-capture.mjs`(같은 폴더, 커밋하지 않음)다.
