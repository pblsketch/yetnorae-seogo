// 가사관 3D 모형(spec 3.1): 끝이 안 보이는 회랑. 기둥이 넷씩 반복되고, 걸을 때마다 기둥 넷과 처마가 생기며 길어진다.
// 회랑 너머로는 「상춘곡」·「면앙정가」의 봄 산수(연못, 물가 정자, 둔덕과 꽃나무)가 보인다.
//
// 그리는 것은 둘로 나뉜다.
//  · 움직이는 것(회랑 칸, 디딤돌, 서가의 책, 바구니 두루마리, 먹안개): InstancedMesh 몇 개를 사건마다 다시 쓴다.
//    상자(창방·공포·단청 띠·책) 하나, 원기둥(기둥·주춧돌·두루마리) 하나, 마루 칸 하나, 기와 처마 하나, 디딤돌 하나와 그 불빛 하나.
//    회랑 칸은 정해진 수만 다시 쓴다(gasa-corridor.js). 디딤돌은 칸마다 넷(한 행의 네 음보)이고, 걸음과 박마다 밝아진다.
//  · 서 있는 것(문루 지붕, 서가 틀, 바구니, 초가 문, 일각문, 연못과 정자): gfx 꾸러미로 재질 역할마다 합친 기하 하나.
//    첫 화면이 늦지 않게 두 번째 프레임에 짓는다. 먹빛 → 단청은 꾸러미 재질의 setDancheong이 맡는다.
import { TOKENS, dancheongColor, getDancheong, inkOf, mixHex } from '../palette.js';
import { createTextures } from '../gfx/textures.js';
import { createMaterials } from '../gfx/materials.js';
import { createKit, WOOD } from '../gfx/kit.js';
import { cheapFilter, createBakedMaterials, createLightBaker, createT36Props, makeSteppingStoneGeo, T36_COLORS } from '../gfx/t36-props.js';
import { createCorridor } from './gasa-corridor.js';
import {
  GATE_Z, SEG_LEN, SHELF, BONUS, RETURNED, BASKET, ROOM_DOOR, NEXT_DOOR, WAITING, titleOf, createWingState, popAmount,
} from './gasa-shared.js';

const BOX_CAP = 420;
const CYL_CAP = 128;
const FOG_COUNT = 7;
const PILLAR_IN = 1.15;   // 칸 앞뒤 끝에서 기둥까지(칸 안 기둥 사이 1.7m, 칸 사이 2.3m)
const STONE_DZ = [0.55, 1.5, 2.45, 3.4];   // 칸 앞머리에서 디딤돌 넷까지(음보 넷)
const STONE_DX = [-0.16, 0.14, -0.12, 0.17];
const STONE_S = [0.7, 0.64, 0.72, 0.66];
const EAVE_Y = 3.2;       // 처마 끝 높이
const SHELF_H = 2.3;
const HIDDEN_Z = -15;     // 칸 앞머리가 이보다 멀면 병풍 뒤로 넘어간 칸

// 먹빛 바탕(scene3d.js의 바탕색과 같은 식)
const INK_BG = mixHex(TOKENS.hanji, TOKENS.meokFog, 0.5);

// 부분마다 단청이 돌아왔을 때의 색. 건축 칠은 가라앉은 뇌록·석간주, 밝은 녹청은 누를 수 있는 것(서가 윗판, 바구니 테)에만.
const C = {
  pillar: T36_COLORS.accent,           // 석간주 기둥
  plinth: '#9a958c',
  beam: T36_COLORS.paint,              // 뇌록 창방
  bracket: mixHex(T36_COLORS.paint, '#2b2b2b', 0.15),
  band: mixHex(T36_COLORS.paint, TOKENS.hanji, 0.3),
  bandAlt: T36_COLORS.accent,
  roof: '#e4dfd6',                      // 기와 처마(무늬와 꼭짓점 색이 먹빛을 낸다)
  deck: '#efe6d4',
  stone: '#b3ada1',
  hanji: TOKENS.hanji,
  blank: mixHex(TOKENS.hanji, TOKENS.meokFog, 0.12),
  cover: '#3f4f5f',                     // 가사 책 표지(쪽빛)
  cord: TOKENS.meok,
  gold: TOKENS.gold,
  thread: TOKENS.juhong,
  tag: TOKENS.nokcheong,
  lit: mixHex(TOKENS.gold, TOKENS.hanji, 0.45),
  glow: '#ffd27a',
};

function fogCanvas(size = 128) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return c;
}

// 이름판 줄: 0 관 현판, 1 작품 방 문, 2 돌아온 노래, 3 칸 제목, 4 덤 칸 제목
const SIGN_ROWS = 5;
const SIGN_W = 512;
const SIGN_H = 96;
const PANEL_H = 256;   // 이름판 그림 아래쪽: 서가 뒤판 무늬(가사관 재질 무늬)
const ATLAS_H = SIGN_H * SIGN_ROWS + PANEL_H;

export function create3D(ctx) {
  const { THREE, root, wing, assets } = ctx;
  const wingId = wing?.id ?? 'gasa';
  const reduce = () => !!ctx.reduceMotion?.();
  const state = createWingState();
  const corridor = createCorridor();
  let level = ctx.restored ? 1 : getDancheong(wingId);
  let fogT = ctx.restored ? 1 : 0;      // 먹안개 물러남 진행(0 = 짙음, 1 = 다 물러남)
  let fogGoing = false;
  let dirty = true;
  let frames = 0;

  // ── 꾸러미(무늬, 재질, 소품 틀) ──
  const textures = cheapFilter(THREE, createTextures(THREE));
  const materials = createMaterials(THREE, textures);
  const kit = createKit(THREE, { materials });
  const props = createT36Props(THREE, kit);
  // 빛은 꼭짓점 색에 구워 두고 빛 없는 재질로 그린다(SwiftShader의 채움 비용을 줄인다, t36-props.js '구운 빛')
  const baker = createLightBaker(THREE, 'wing');
  const baked = createBakedMaterials(THREE, textures, materials);
  materials.setDancheong(level);
  const ownTextures = [];
  const ownGeos = [];
  const ownMats = [];

  // ── 움직이는 것: 상자, 원기둥, 마루 칸, 처마, 디딤돌 ──
  const boxGeo = baker.bake(props.unitBox(0.07));
  const boxMat = new THREE.MeshBasicMaterial({ map: textures.get('wood'), vertexColors: true });
  const boxes = new THREE.InstancedMesh(boxGeo, boxMat, BOX_CAP);
  boxes.name = 'gasa-boxes';
  const cylGeo = baker.bake(new THREE.CylinderGeometry(0.46, 0.5, 1, 14));
  const cylMat = new THREE.MeshBasicMaterial({ map: textures.get('wood'), vertexColors: true });
  const cyls = new THREE.InstancedMesh(cylGeo, cylMat, CYL_CAP);
  cyls.name = 'gasa-cylinders';
  const deckGeo = baker.bake(buildDeckGeometry());
  const deckMat = new THREE.MeshBasicMaterial({ map: textures.get('planks'), vertexColors: true });
  const decks = new THREE.InstancedMesh(deckGeo, deckMat, corridor.options.pool);
  decks.name = 'gasa-decks';
  const eaveGeo = baker.bake(buildEaveGeometry());
  const eaveMat = new THREE.MeshBasicMaterial({ map: textures.get('roof'), vertexColors: true, side: THREE.DoubleSide });
  const eaves = new THREE.InstancedMesh(eaveGeo, eaveMat, corridor.options.pool);
  eaves.name = 'gasa-eaves';
  const stoneGeo = baker.bake(makeSteppingStoneGeo(THREE, 4));
  const stoneMat = new THREE.MeshBasicMaterial({ map: textures.get('stone'), vertexColors: true });
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, corridor.options.pool * 4);
  stones.name = 'gasa-stepping-stones';
  const glowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const stoneGlow = new THREE.InstancedMesh(glowGeo, materials.get('glow'), corridor.options.pool * 4);
  stoneGlow.name = 'gasa-stone-glow';
  stoneGlow.renderOrder = 10;
  ownGeos.push(boxGeo, cylGeo, deckGeo, eaveGeo, stoneGeo, glowGeo);
  ownMats.push(boxMat, cylMat, deckMat, eaveMat, stoneMat);
  for (const m of [boxes, cyls, decks, eaves, stones, stoneGlow]) {
    m.frustumCulled = false;   // 인스턴스가 넓게 퍼져 있어 경계 구를 매번 다시 재지 않는다
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    root.add(m);
  }

  const fogTex = new THREE.CanvasTexture(fogCanvas());
  ownTextures.push(fogTex);
  const fogMat = new THREE.MeshBasicMaterial({ map: fogTex, color: TOKENS.meokFog, transparent: true, opacity: 0.45, depthWrite: false });
  const fog = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), fogMat, FOG_COUNT);
  fog.name = 'gasa-fog';
  fog.frustumCulled = false;
  root.add(fog);
  const FOG = [
    [-3.5, 0.5, 1.0, 5.5], [3.5, 0.6, 1.2, 5.5], [0, 0.4, 3.2, 6], [0, 0.9, -2.5, 6.5],
    [-4.5, 0.7, -3.5, 4.5], [4.5, 0.7, -3.5, 4.5], [0, 1.2, -7, 7],
  ];

  // 이름판(글자 그림 한 장에 사각형 다섯)
  const signCanvas = document.createElement('canvas');
  signCanvas.width = SIGN_W;
  signCanvas.height = ATLAS_H;
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  ownTextures.push(signTex);
  const SIGN_QUADS = [
    { row: 0, c: [0, 3.45, GATE_Z + 0.24], w: 1.5, h: 0.36 },
    { row: 1, c: [ROOM_DOOR.x, 2.42, ROOM_DOOR.z + 0.36], w: 1.3, h: 0.3 },
    { row: 2, c: [RETURNED.x, 1.42, RETURNED.z + 0.3], w: 1.5, h: 0.32 },
    { row: 3, c: [SHELF.x, SHELF_H + 0.3, SHELF.z + 0.4], w: 3.0, h: 0.4 },
    { row: 4, c: [BONUS.x, SHELF_H + 0.3, BONUS.z + 0.4], w: 3.0, h: 0.4 },
    // 서가 뒤판 둘(무늬 칸)
    { row: 'panel', c: [SHELF.x, 0.32 + (SHELF_H - 0.22) / 2, SHELF.z - 0.26], w: 2.98, h: SHELF_H - 0.22 },
    { row: 'panel', c: [BONUS.x, 0.32 + (SHELF_H - 0.22) / 2, BONUS.z - 0.26], w: 2.98, h: SHELF_H - 0.22 },
  ];
  const signs = new THREE.Mesh(signGeometry(THREE, SIGN_QUADS), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }));
  signs.name = 'gasa-signs';
  root.add(signs);

  function drawSigns() {
    const g = signCanvas.getContext('2d');
    const family = getComputedStyle(document.body).fontFamily || 'serif';
    g.clearRect(0, 0, SIGN_W, SIGN_H * SIGN_ROWS);
    drawPanel(g);
    const plate = (row) => {
      const y = row * SIGN_H;
      g.fillStyle = TOKENS.meok;
      g.fillRect(0, y, SIGN_W, SIGN_H);
      g.fillStyle = TOKENS.hanji;
      g.fillRect(6, y + 6, SIGN_W - 12, SIGN_H - 12);
      return y;
    };
    const text = (s, x, y, size) => {
      g.fillStyle = TOKENS.meok;
      g.font = `bold ${size}px ${family}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s, x, y);
    };
    let y = plate(0); text(wing?.name ?? '가사관', SIGN_W / 2, y + SIGN_H / 2 + 3, 54);
    y = plate(1); text('「상춘곡」', SIGN_W / 2, y + SIGN_H / 2 + 3, 50);
    y = plate(2); text('돌아온 노래', SIGN_W / 2, y + SIGN_H / 2 + 3, 46);
    // 칸 제목은 묶인 뒤에만 쓴다(빈자리에는 제목이 없다, spec 8).
    [['shelf', 3], ['bonus', 4]].forEach(([area, row]) => {
      y = plate(row);
      const ids = state.bound[area];
      if (!ids) return;
      ids.slice(0, 3).forEach((id, i) => text(titleOf(id), (SIGN_W / 3) * (i + 0.5), y + SIGN_H / 2 + 2, 30));
    });
    signTex.needsUpdate = true;
  }

  // 서가 뒤판: 가사관 재질 무늬(기둥 넷씩 되풀이하는 한지 벽)를 이름판 그림 아래 칸에 그린다(그리기 호출을 늘리지 않으려고).
  // 무늬가 아직 없거나 오지 않았으면 한지 바탕에 기둥 셋을 그린 자리표시. 먹빛일수록 회색으로 그린다.
  const pattern = assets?.texture?.('texture/gasa') ?? null;
  let panelDrawn = '';
  function patternReady() {
    const img = pattern?.image;
    return !!img && (img.width ?? 0) > 0 && img.complete !== false;
  }
  function drawPanel(g) {
    const y0 = SIGN_H * SIGN_ROWS;
    const ready = patternReady();
    panelDrawn = (ready ? 'img' : 'ph') + ':' + level.toFixed(2);
    g.save();
    g.filter = `grayscale(${Math.round((1 - level) * 85)}%)`;
    if (ready) g.drawImage(pattern.image, 0, y0, SIGN_W, PANEL_H);
    else {
      g.fillStyle = TOKENS.hanji;
      g.fillRect(0, y0, SIGN_W, PANEL_H);
      g.fillStyle = '#4a3e34';
      for (let i = 0; i < 3; i++) g.fillRect(SIGN_W / 6 + (i * SIGN_W) / 3 - 18, y0, 36, PANEL_H);
      g.fillStyle = T36_COLORS.paint;
      g.fillRect(0, y0 + 10, SIGN_W, 8);
    }
    g.restore();
    // 갓 밑 그늘: 위쪽을 어둡게(빛을 받지 않는 그림이라 그늘을 그려 넣는다)
    const sh = g.createLinearGradient(0, y0, 0, y0 + PANEL_H);
    sh.addColorStop(0, 'rgba(43,43,43,0.55)');
    sh.addColorStop(0.35, 'rgba(43,43,43,0.25)');
    sh.addColorStop(1, 'rgba(43,43,43,0.12)');
    g.fillStyle = sh;
    g.fillRect(0, y0, SIGN_W, PANEL_H);
  }
  function panelStale() {
    return panelDrawn !== (patternReady() ? 'img' : 'ph') + ':' + level.toFixed(2);
  }
  drawSigns();

  // ── 서 있는 것(두 번째 프레임에 짓는다) ──
  let staticGroup = null;
  function buildStatic() {
    const b = kit.builder();
    buildGate(b);
    buildShelfFrame(b, SHELF);
    buildShelfFrame(b, BONUS);
    buildReturnedFrame(b);
    buildBasketBody(b);
    buildRoomHut(b);
    buildNextGate(b);
    buildWaitingDesk(b);
    buildCourtyard(b);
    buildLandscape(b);
    staticGroup = baked.convert(b.build('gasa-static'), baker);
    root.add(staticGroup);
  }

  // 입구 문(홍살문처럼 지붕 없는 문): 공포, 살대, 초롱 둘. 기둥 둘과 인방은 움직이는 원기둥·상자에 있다(단청 반응을 같이 받는다).
  // 지붕을 얹지 않는 것은 걸을 때 회랑 안쪽에서 새 칸이 솟는 모습이 문 너머로 보여야 해서다.
  function buildGate(b) {
    for (let i = 0; i < 9; i++) b.box('paint', 0.05, 0.42, 0.05, { p: [-2.0 + i * 0.5, 3.9, GATE_Z], color: T36_COLORS.accent, ao: 0, bevel: 0.008 });
    b.box('wood', 6.0, 0.1, 0.16, { p: [0, 4.14, GATE_Z], color: WOOD.beam, ao: 0 });
    for (const x of [-2.6, 2.6]) {
      b.box('paint', 0.5, 0.18, 0.5, { p: [x, 3.72, GATE_Z], color: T36_COLORS.paint });
      b.box('paint', 1.2, 0.13, 0.24, { p: [x, 3.82, GATE_Z], color: T36_COLORS.accent });
      b.add('stone', kit.cylinder(0.32, 0.38, 0.24, 8), { p: [x, 0.12, GATE_Z], color: C.plinth, ao: 0.5 });
      kit.contactShadow(b, { x, z: GATE_Z, w: 1.1, d: 1.1 });
    }
    props.paperLantern(b, { x: -1.7, y: 2.85, z: GATE_Z + 0.25, scale: 0.7 });
    props.paperLantern(b, { x: 1.7, y: 2.85, z: GATE_Z + 0.25, scale: 0.7, red: true });
    // 문지방과 소맷돌
    b.box('stone', 5.4, 0.16, 0.5, { p: [0, 0.08, GATE_Z + 0.25], color: '#9a958c', ao: 0.3 });
  }

  // 서가 틀: 기단, 옆판, 칸막이, 윗판(누를 수 있는 서가는 녹청 테), 작은 기와 갓
  function buildShelfFrame(b, S) {
    const z = S.z;
    b.box('stone', 3.4, 0.16, 0.9, { p: [S.x, 0.08, z], color: '#9a958c', ao: 0.4 });
    b.box('wood', 3.2, 0.12, 0.7, { p: [S.x, 0.22, z], color: WOOD.beam });
    for (const dx of [-1.55, 1.55]) b.box('wood', 0.12, SHELF_H, 0.7, { p: [S.x + dx, SHELF_H / 2 + 0.1, z], color: WOOD.pillar });
    for (const dx of [-0.5, 0.5]) b.box('wood', 0.06, SHELF_H - 0.2, 0.58, { p: [S.x + dx, SHELF_H / 2 + 0.12, z], color: WOOD.beam, shade: 0.9 });
    b.box('wood', 3.1, 0.06, 0.6, { p: [S.x, 0.3, z], color: WOOD.beam, ao: 0 });
    b.box('paint', 3.3, 0.12, 0.76, { p: [S.x, SHELF_H + 0.12, z], color: TOKENS.nokcheong, ao: 0 });
    b.box('wood', 3.3, 0.3, 0.06, { p: [S.x, SHELF_H + 0.3, z + 0.36], color: WOOD.beam, ao: 0 });
    // 서가 갓(기와 한 자락): 이름판 뒤로 물러서 이름판을 가리지 않는다
    kit.giwaRoof(b, { x0: S.x - 1.85, x1: S.x + 1.85, zFront: z + 0.3, zBack: z - 0.55, yFront: SHELF_H + 0.55, yBack: SHELF_H + 0.85, lift: 0.18, flare: 0.12, sag: 0.05, ridge: false, color: '#6a665f' });
    // 칸마다 앞 아래의 작은 받침 장식(석간주)
    for (let i = 0; i < 3; i++) b.box('paint', 0.5, 0.05, 0.04, { p: [S.x - 1 + i, 0.4, z + 0.33], color: T36_COLORS.accent, ao: 0 });
    kit.contactShadow(b, { x: S.x, z: z + 0.2, w: 4.2, d: 1.8 });
  }

  function buildReturnedFrame(b) {
    const R = RETURNED;
    b.box('wood', 1.7, 1.2, 0.05, { p: [R.x, 0.62, R.z - 0.22], color: '#3a302a' });
    for (const dx of [-0.84, 0.84]) b.box('wood', 0.09, 1.24, 0.5, { p: [R.x + dx, 0.62, R.z], color: WOOD.dark });
    b.box('paint', 1.84, 0.08, 0.56, { p: [R.x, 1.25, R.z], color: TOKENS.nokcheong, ao: 0 });
    b.box('wood', 1.66, 0.04, 0.46, { p: [R.x, 0.62, R.z], color: WOOD.dark });
    b.box('wood', 1.8, 0.12, 0.54, { p: [R.x, 0.06, R.z], color: WOOD.dark });
    kit.contactShadow(b, { x: R.x, z: R.z + 0.15, w: 2.4, d: 1.3 });
  }

  // 바구니(짚 광주리): 돌림판 몸, 엮은 띠, 녹청 테(누를 수 있는 것)
  function buildBasketBody(b) {
    const B = BASKET;
    const prof = [[0, 0], [0.42, 0], [0.5, 0.06], [0.56, 0.3], [0.6, 0.44], [0.52, 0.44], [0.47, 0.1], [0, 0.1]].map(([x, y]) => new THREE.Vector2(x, y));
    const lathe = new THREE.LatheGeometry(prof, 16).toNonIndexed();
    lathe.deleteAttribute('uv');
    lathe.computeVertexNormals();
    ownGeos.push(lathe);
    b.add('wood', lathe, { p: [B.x, 0, B.z], color: T36_COLORS.straw, ao: 0.3 });
    for (const y of [0.14, 0.26, 0.38]) b.add('wood', kit.cylinder(0.535 + y * 0.12, 0.53 + y * 0.12, 0.03, 16), { p: [B.x, y, B.z], color: mixHex(T36_COLORS.straw, '#4a3a24', 0.4), ao: 0 });
    const ring = new THREE.TorusGeometry(0.58, 0.045, 5, 20).rotateX(Math.PI / 2).toNonIndexed();
    ring.deleteAttribute('uv');
    ownGeos.push(ring);
    b.add('paint', ring, { p: [B.x, 0.45, B.z], color: TOKENS.nokcheong, ao: 0 });
    // 광주리 안 바닥(짚 엮음)
    b.add('wood', kit.cylinder(0.47, 0.47, 0.02, 16), { p: [B.x, 0.11, B.z], color: mixHex(T36_COLORS.straw, '#3a3020', 0.2), ao: 0 });
    kit.contactShadow(b, { x: B.x, z: B.z, w: 1.7, d: 1.4 });
  }

  // 작품 방 「상춘곡」: 수간모옥(초가). 흙벽, 나무 틀, 창호 문, 둥근 이엉 지붕, 싸리 울
  function buildRoomHut(b) {
    const D = ROOM_DOOR;
    const z = D.z;
    b.box('stone', 3.0, 0.22, 1.5, { p: [D.x, 0.11, z - 0.35], color: '#9a958c', ao: 0.4 });
    b.box('paint', 2.8, 2.0, 1.2, { p: [D.x, 1.22, z - 0.45], color: T36_COLORS.mud, ao: 0.2 });
    for (const dx of [-1.38, -0.62, 0.62, 1.38]) b.box('wood', 0.14, 2.0, 0.16, { p: [D.x + dx, 1.22, z + 0.16], color: WOOD.pillar });
    b.box('wood', 2.9, 0.16, 0.2, { p: [D.x, 2.24, z + 0.16], color: WOOD.beam });
    props.lattice(b, { x: D.x, y: 0.26, z: z + 0.2, w: 1.1, h: 1.86, cols: 5 });
    props.thatch(b, { x: D.x, y: 2.28, z: z - 0.4, w: 3.7, d: 2.4, h: 0.95 });
    // 싸리 울(오른쪽)과 매화 한 그루
    for (let i = 0; i < 7; i++) b.box('wood', 0.05, 0.9 + (i % 2) * 0.12, 0.05, { p: [D.x + 1.75 + i * 0.12, 0.47, z + 0.5 - i * 0.05], color: '#7a6448', ao: 0.2, r: [0, 0, (i % 3 - 1) * 0.06] });
    b.box('wood', 0.9, 0.04, 0.04, { p: [D.x + 2.1, 0.75, z + 0.32], r: [0, 0.4, 0], color: '#6b5440', ao: 0 });
    kit.contactShadow(b, { x: D.x, z: z + 0.2, w: 3.4, d: 1.2 });
  }

  // 다음 관 문: 일각문(기와 지붕, 판문 두 짝)과 짧은 담
  function buildNextGate(b) {
    const D = NEXT_DOOR;
    const z = D.z;
    for (const dx of [-0.85, 0.85]) {
      b.add('wood', kit.cylinder(0.13, 0.14, 2.5, 10), { p: [D.x + dx, 1.25, z], color: WOOD.pillar });
      b.add('stone', kit.cylinder(0.22, 0.26, 0.18, 8), { p: [D.x + dx, 0.09, z], color: C.plinth, ao: 0.5 });
    }
    b.box('wood', 2.1, 0.22, 0.26, { p: [D.x, 2.5, z], color: WOOD.beam });
    b.box('paint', 2.1, 0.06, 0.27, { p: [D.x, 2.36, z], color: T36_COLORS.paint, ao: 0 });
    for (const dx of [-0.38, 0.38]) {
      b.box('wood', 0.74, 2.2, 0.07, { p: [D.x + dx, 1.17, z - 0.04], color: '#4a3e34' });
      for (const y of [0.5, 1.2, 1.9]) b.box('wood', 0.7, 0.05, 0.03, { p: [D.x + dx, y, z + 0.01], color: WOOD.dark, ao: 0 });
    }
    kit.giwaRoof(b, { x0: D.x - 1.45, x1: D.x + 1.45, zFront: z + 0.75, zBack: z - 0.75, yFront: 2.72, yBack: 3.25, lift: 0.22, flare: 0.18, color: '#6a665f' });
    props.wallRun(b, { x0: D.x - 1.0, z0: z, x1: D.x - 1.75, z1: z, h: 1.7 });
    props.wallRun(b, { x0: D.x + 1.0, z0: z, x1: D.x + 1.75, z1: z, h: 1.7 });
    kit.contactShadow(b, { x: D.x, z: z + 0.2, w: 3.2, d: 1.6 });
  }

  // 미리 잰 노래가 기다리는 서안과 책 한 권
  function buildWaitingDesk(b) {
    const W = WAITING;
    b.box('wood', 1.15, 0.07, 0.62, { p: [W.x, 0.44, W.z], color: WOOD.light });
    for (const dx of [-0.48, 0.48]) b.box('wood', 0.07, 0.42, 0.52, { p: [W.x + dx, 0.21, W.z], color: WOOD.beam });
    b.box('wood', 0.98, 0.05, 0.08, { p: [W.x, 0.06, W.z + 0.2], color: WOOD.beam, ao: 0 });
    b.box('paint', 0.34, 0.05, 0.46, { p: [W.x - 0.15, 0.5, W.z], r: [0, 0.18, 0], color: '#efe6d2', ao: 0 });
    b.box('paint', 0.36, 0.012, 0.48, { p: [W.x - 0.15, 0.48, W.z], r: [0, 0.18, 0], color: '#3f4f5f', ao: 0 });
    kit.contactShadow(b, { x: W.x, z: W.z, w: 1.7, d: 1.1 });
  }

  // 마당: 기다리는 자리에서 문루로 가는 디딤돌, 문 옆 작은 바위
  function buildCourtyard(b) {
    const path = [[-1.6, 3.3], [-1.05, 2.45], [-0.6, 1.55], [-0.2, 0.7], [0.1, -0.15]];
    path.forEach(([x, z], i) => props.flatStone(b, { x, z, s: 0.62 - i * 0.02, seed: i + 1 }));
    props.rock(b, { x: 2.95, z: -0.9, s: 0.45, sy: 0.7, seed: 2 });
    props.rock(b, { x: 3.35, z: -0.6, s: 0.26, seed: 5 });
    props.rock(b, { x: -3.05, z: -1.05, s: 0.38, sy: 0.8, seed: 3 });
  }

  // 회랑 너머 봄 산수(「상춘곡」·「면앙정가」): 오른쪽 둔덕 위 정자, 왼쪽 바위 벼랑과 폭포·연못, 뒤 먹빛 산줄기.
  // 관 카메라에서 이 띠는 문과 서가 뒤로 좁게 보이므로, 땅에 납작한 것보다 높이 솟는 것(정자 지붕, 벼랑, 솔)으로 짓는다.
  function buildLandscape(b) {
    // 오른쪽: 둔덕 위 정자(면앙정)와 솔
    props.hill(b, { x: 6.0, z: -9.2, w: 3.6, h: 1.1, d: 2.8, seed: 2, color: '#8f9a86' });
    props.pavilion(b, { x: 5.9, z: -9.1, size: 1.9, height: 1.9, base: 0.3, ground: 0.95 });
    props.pine(b, { x: 8.0, z: -8.6, h: 3.6, seed: 3, lean: 0.35 });
    props.rock(b, { x: 4.0, z: -7.9, s: 0.55, sy: 0.75, seed: 4 });
    props.rock(b, { x: 4.6, z: -7.5, s: 0.3, seed: 2 });
    // 왼쪽: 바위 벼랑, 폭포, 연못, 꽃나무
    props.rock(b, { x: -6.4, z: -9.7, s: 1.5, sy: 1.6, seed: 1, color: '#86827a' });
    props.rock(b, { x: -5.2, z: -9.9, s: 1.1, sy: 1.9, seed: 3, color: '#7d7972' });
    props.rock(b, { x: -7.4, z: -8.9, s: 1.0, sy: 1.1, seed: 5, color: '#8e8a82' });
    props.pine(b, { x: -6.2, z: -9.7, h: 3.0, seed: 7, lean: -0.3 });
    for (let i = 0; i < 5; i++) b.box('paint', 0.42 - i * 0.03, 0.62, 0.05, { p: [-5.75 + i * 0.03, 2.5 - i * 0.55, -9.15 + i * 0.12], r: [-0.2, 0, 0], color: '#cfdcd8', ao: 0, bevel: 0.01 });
    props.blossom(b, { x: -3.2, z: -7.3, h: 2.6, seed: 5 });
    props.blossom(b, { x: 3.4, z: -6.9, h: 2.2, seed: 9, color: '#e8c3b8' });
  }

  // ── 인스턴스 쓰기 ──
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pv = new THREE.Vector3();
  const sv = new THREE.Vector3();
  const col = new THREE.Color();
  let nb = 0;
  let nc = 0;
  let nd = 0;
  let ne = 0;
  let ns = 0;
  let ng = 0;
  const bg = () => mixHex(INK_BG, TOKENS.hanji, level);
  const paint = (hex) => dancheongColor(hex, level);
  // 나무·돌은 먹빛에서도 조금 바랜 정도(꾸러미 재질의 먹 바닥 0.55와 같은 뜻)
  const natural = (hex) => mixHex(inkOf(hex), hex, 0.55 + 0.45 * level);

  function box(x, y, z, sx, sy, sz, hex, rz = 0, rx = 0) {
    if (nb >= BOX_CAP || sx <= 0 || sy <= 0 || sz <= 0) return;
    e.set(rx, 0, rz);
    q.setFromEuler(e);
    m4.compose(pv.set(x, y, z), q, sv.set(sx, sy, sz));
    boxes.setMatrixAt(nb, m4);
    boxes.setColorAt(nb, col.set(hex));
    nb++;
  }

  // 원기둥. axis: 'y'(세움) | 'x'(눕힘, 좌우) | 'z'(눕힘, 앞뒤)
  function cyl(x, y, z, radius, length, hex, axis = 'y') {
    if (nc >= CYL_CAP || radius <= 0 || length <= 0) return;
    e.set(axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
    q.setFromEuler(e);
    m4.compose(pv.set(x, y, z), q, sv.set(radius * 2, length, radius * 2));
    cyls.setMatrixAt(nc, m4);
    cyls.setColorAt(nc, col.set(hex));
    nc++;
  }

  function put(mesh, i, x, y, z, sx, sy, sz, hex) {
    m4.compose(pv.set(x, y, z), q.identity(), sv.set(sx, sy, sz));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(hex));
  }

  // ── 회랑 ──
  function buildCorridor() {
    const back = bg();
    // 문(회랑 입구): 굵은 기둥 둘, 인방
    cyl(-2.6, 1.86, GATE_Z, 0.21, 3.5, paint(C.pillar));
    cyl(2.6, 1.86, GATE_Z, 0.21, 3.5, paint(C.pillar));
    box(0, 3.5, GATE_Z, 5.9, 0.32, 0.4, paint(C.beam));
    box(0, 3.3, GATE_Z, 5.6, 0.08, 0.42, paint(C.bandAlt));
    for (const s of corridor.segments()) {
      if (s.sink <= 0.001) continue;
      const zf = GATE_Z - 0.4 - s.rel * SEG_LEN;   // 칸 앞머리
      const zc = zf - SEG_LEN / 2;
      const fade = s.ghost ? 0.8 : Math.min(0.65, Math.max(0, (s.rel - 1.5) * 0.12));
      const tint = (hex) => mixHex(paint(hex), back, fade);
      const tintN = (hex) => mixHex(natural(hex), back, fade);
      const vy = s.sink;
      const rise = s.rise;
      const drop = (1 - rise) * 3;
      // 세계의 수묵 병풍(관 뒤 약 11m) 너머로 다 넘어간 칸은 마루·디딤돌·처마를 그리지 않는다(병풍에 가려 보이지 않고,
      // 넓은 면이라 SwiftShader 그리기 시간을 먹는다). 기둥과 작은 보는 그대로 둔다(수가 늘 같고, 칸이 미끄러지는 것이 배치에 드러나게).
      const hidden = zf < HIDDEN_Z;
      if (!hidden) put(decks, nd++, 0, 0, zc, 1, vy, 1, tintN(C.deck));
      // 디딤돌 넷: 한 행의 네 음보. 박(기둥 불)과 걸음마다 밝아진다
      for (let k = 0; k < (hidden ? 0 : 4); k++) {
        const lit = s.lit[k];
        const base = s.ghost ? tintN(C.stone) : mixHex(natural(C.stone), TOKENS.hanji, 0.25 * (1 - fade));
        const hex = lit > 0 ? mixHex(base, C.lit, Math.min(1, 0.35 + lit)) : base;
        const sc = STONE_S[k];
        put(stones, ns++, STONE_DX[k], 0.18 * vy, zf - STONE_DZ[k], sc, vy, sc * 0.85, hex);
        if (lit > 0) {
          const g = 1.5 + 1.1 * lit;
          put(stoneGlow, ng++, STONE_DX[k], 0.33 * vy, zf - STONE_DZ[k], g, 1, g, mixHex('#000000', C.glow, Math.min(1, lit * 1.4)));
        }
      }
      // 기둥 넷(앞 둘, 뒤 둘)과 주춧돌. 기둥 하나가 한 음보다. 칸 안 기둥 사이를 칸 사이보다 좁혀 넷씩 묶여 보이게 한다.
      const pz = [zf - PILLAR_IN, zf - SEG_LEN + PILLAR_IN];
      const px = [-2.2, 2.2];
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([xi, zi], k) => {
        const h = 2.78 * rise * vy;
        const lit = s.lit[k];
        const hex = lit > 0 ? mixHex(tint(C.pillar), C.lit, Math.min(1, lit * 1.5)) : tint(C.pillar);
        cyl(px[xi], 0.3 * vy + h / 2, pz[zi], lit > 0 ? 0.19 : 0.155, h, hex);
        cyl(px[xi], 0.24 * vy, pz[zi], 0.26, 0.14 * vy, tintN(C.plinth));
      });
      if (rise < 0.02) continue;
      const y0 = (3.0 + drop) * vy;
      const flash = s.flash;
      const bandHex = flash > 0 ? mixHex(tint(C.band), C.lit, flash) : tint(C.band);
      // 창방(긴 보), 공포(기둥머리), 가로 보
      const span = SEG_LEN - PILLAR_IN * 2 + 0.5;
      box(-2.2, y0, zc, 0.24, 0.26 * vy, span, tint(C.beam));
      box(2.2, y0, zc, 0.24, 0.26 * vy, span, tint(C.beam));
      for (const zz of pz) {
        for (const xx of px) box(xx, y0 + 0.18 * vy, zz, 0.42, 0.14 * vy, 0.42, tint(C.bracket));
        box(0, y0 + 0.05 * vy, zz, 4.7, 0.2 * vy, 0.22, bandHex);
      }
      // 기와 처마: 기둥 줄마다 바깥으로 흐르는 처마 한 자락. 가운데는 하늘로 열어 두어 위에서 회랑 안(디딤돌)이 들여다보인다.
      const ey = (EAVE_Y + drop) * vy;
      if (!hidden) put(eaves, ne++, 0, ey, zc, 1, vy, 1, tintN(C.roof));
      // 처마 단청 띠(바깥 평고대 밑, 안쪽 용마루 밑)
      const edge = s.n % 2 ? tint(C.bandAlt) : bandHex;
      box(-3.42, (EAVE_Y - 0.1 + drop) * vy, zc, 0.1, 0.1 * vy, SEG_LEN - 0.3, edge);
      box(3.42, (EAVE_Y - 0.1 + drop) * vy, zc, 0.1, 0.1 * vy, SEG_LEN - 0.3, edge);
      box(-1.5, (EAVE_Y + 0.7 + drop) * vy, zc, 0.12, 0.1 * vy, SEG_LEN - 0.3, edge);
      box(1.5, (EAVE_Y + 0.7 + drop) * vy, zc, 0.12, 0.1 * vy, SEG_LEN - 0.3, edge);
    }
  }

  // ── 서가와 자리(틀은 서 있는 것에, 책은 여기) ──
  function buildShelf(S, area) {
    const slots = state.slots[area];
    const bound = state.bound[area];
    for (let i = 0; i < 3; i++) {
      const x = S.x - 1 + i;
      const pop = state.pops.get(area + ':' + i);
      if (pop) { popShape(x, 0.36, S.z + 0.3, pop.genre, popAmount(pop.t)); continue; }
      if (!slots[i]) {
        // 빈자리: 제목 없는 빈 책등
        box(x, 1.1, S.z - 0.18, 0.58, 1.5, 0.08, paint(C.blank));
        box(x, 1.1, S.z - 0.13, 0.3, 1.2, 0.02, mixHex(paint(C.blank), TOKENS.meokFog, 0.2));
        continue;
      }
      // 꽂힌 책(가사는 긴 노래라 칸이 높다)
      box(x, 1.17, S.z, 0.58, 1.62, 0.5, paint(C.cover));
      box(x, 0.7, S.z, 0.6, 0.05, 0.52, paint(C.cord));
      box(x, 1.65, S.z, 0.6, 0.05, 0.52, paint(C.cord));
      box(x + 0.18, 1.3, S.z + 0.255, 0.12, 0.7, 0.012, paint(C.hanji));   // 제첨(제목 붙일 종이)
      if (bound) box(x, 1.17, S.z + 0.26, 0.3, 0.95, 0.02, C.gold);   // 금박
    }
    if (bound) {
      // 세 권을 한 권으로 묶는 실
      box(S.x, 0.95, S.z + 0.28, 2.9, 0.06, 0.05, paint(C.thread));
      box(S.x, 1.4, S.z + 0.28, 2.9, 0.06, 0.05, paint(C.thread));
    }
  }

  // 삐져나온 노래: 갈래의 모양 차이가 보이게(가사관 칸은 길고 이어진 두루마리 자리다).
  // ox, oy, oz는 자리의 바닥 앞머리, t는 튀어나온 정도(0~1)
  function popShape(ox, oy, oz, genre, t) {
    const cover = paint(C.cover);
    const cord = paint(C.cord);
    const out = t;
    switch (genre) {
      case 'sijo':   // 짧은 세 장: 칸 높이에 모자라 앞으로 쏟아진다
        for (let j = 0; j < 3; j++) box(ox, oy + 0.18 + j * 0.37, oz + 0.25 * out + j * 0.06 * out, 0.5, 0.34, 0.4, cover, 0, -0.25 * out);
        box(ox, oy + 0.55, oz + 0.3 * out, 0.52, 0.04, 0.42, cord);
        break;
      case 'saseol': // 초장·종장은 칸 안, 늘어난 중장만 길게 튀어나온다
        box(ox, oy + 0.18, oz - 0.2, 0.5, 0.34, 0.4, cover);
        box(ox, oy + 1.1, oz - 0.2, 0.5, 0.34, 0.4, cover);
        box(ox, oy + 0.64, oz - 0.4 + 0.85 * out, 0.5, 0.5, 0.4 + 1.5 * out, paint(TOKENS.juhong));
        box(ox, oy + 0.64, oz - 0.4 + 1.6 * out, 0.52, 0.52, 0.05, cord);
        break;
      case 'hyangga': // 4·4·2로 쌓인 탑: 칸 위로 솟는다
        [[0.6, 0.5], [0.6, 0.42], [0.32, 0.34]].reduce((y, [h, w]) => {
          box(ox, y + h / 2, oz - 0.1 + 0.3 * out, w, h, w * 0.8, cover);
          return y + h + 0.03;
        }, oy + 0.9 * out);
        break;
      case 'goryeo': // 똑같은 연이 고리로 이어져 줄줄이 늘어진다
        for (let j = 0; j < 4; j++) {
          const z = oz + 0.1 + j * 0.46 * out;
          const y = oy + 0.9 - j * 0.18 * out;
          box(ox, y, z, 0.42, 0.34, 0.3, cover);
          if (j < 3) box(ox, y - 0.05, z + 0.23 * out, 0.1, 0.1, 0.16, paint(C.thread));
        }
        break;
      case 'gasa':   // 끝없이 이어지는 두루마리: 권이 빠져나오고 종이가 바닥까지 풀린다
        box(ox, oy + 0.81, oz + 0.25 * out, 0.5, 1.62, 0.45, cover);
        box(ox, oy + 0.4, oz + 0.5 * out, 0.42, 0.8, 0.02, paint(C.hanji));
        box(ox, 0.02, oz + 0.5 * out + 0.7 * out, 0.42, 0.02, 1.4 * out, paint(C.hanji));
        break;
      default:
        box(ox, oy + 0.6, oz + 0.4 * out, 0.5, 1.0, 0.45, cover);
    }
  }

  function buildBasket() {
    const B = BASKET;
    for (let i = 0; i < 2; i++) {
      const pop = state.pops.get('basket:' + i);
      const x = B.x - 0.2 + i * 0.4;
      if (pop) { popShape(B.x - 1.1 + i * 2.2, 0, B.z + 0.4, pop.genre, popAmount(pop.t)); continue; }
      const it = state.slots.basket[i];
      if (!it) continue;
      cyl(x, 0.58, B.z, 0.13, 0.7, paint(C.hanji), 'z');
      if (it.to) box(x, 0.78, B.z + 0.2, 0.14, 0.2, 0.02, paint(C.tag));   // 행선지 표시
    }
  }

  function buildReturned() {
    const R = RETURNED;
    state.slots.returned.slice(0, 4).forEach((id, i) => {
      if (!id) return;
      box(R.x - 0.54 + i * 0.36, 0.9, R.z, 0.28, 0.5, 0.36, paint(C.cover));
    });
  }

  function buildFog() {
    const going = reduce() ? (fogT >= 1 ? 1 : fogT) : fogT;
    fog.visible = going < 1;
    fogMat.opacity = 0.45 * (1 - going);
    FOG.forEach(([x, y, z, s], i) => {
      e.set(-Math.PI / 2, 0, 0);
      q.setFromEuler(e);
      const push = 1 + going * 1.4;
      // 안개 자락은 화면을 넓게 덮는 투명 판이라 조금 작게(가장자리는 무늬가 이미 사라진다)
      m4.compose(pv.set(x * push, y, z + going * (z < 0 ? -6 : 3)), q, sv.set(s * 1.15, s * 0.85, 1));
      fog.setMatrixAt(i, m4);
    });
    fog.instanceMatrix.needsUpdate = true;
  }

  function rebuild() {
    nb = 0;
    nc = 0;
    nd = 0;
    ne = 0;
    ns = 0;
    ng = 0;
    buildCorridor();
    buildShelf(SHELF, 'shelf');
    buildShelf(BONUS, 'bonus');
    buildBasket();
    buildReturned();
    boxes.count = nb;
    cyls.count = nc;
    decks.count = nd;
    eaves.count = ne;
    stones.count = ns;
    stoneGlow.count = ng;
    for (const m of [boxes, cyls, decks, eaves, stones, stoneGlow]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    buildFog();
  }

  rebuild();

  // ── 사건 ──
  function react(name, detail) {
    const d = detail && typeof detail === 'object' ? detail : {};
    const r = state.apply(name, d, reduce());
    switch (name) {
      case 'diorama:walk-step':
        corridor.step(reduce());
        break;
      case 'diorama:pillar-light':
        corridor.light(d.unit, d.foot);
        break;
      case 'diorama:fold':
        corridor.flash(d.unit);
        break;
      case 'diorama:shelf-bound':
        drawSigns();
        break;
      case 'diorama:fog-recede':
      case 'diorama:dancheong-restore':
        if (fogT < 1) { fogGoing = true; if (reduce()) fogT = 1; }
        break;
      default:
        if (!r) return;   // 모르는 사건은 조용히 넘긴다
    }
    dirty = true;
  }

  function update(dt) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    const rm = reduce();
    // 서 있는 것은 두 번째 프레임에 짓는다(관 들어가기 글이 늦지 않게)
    if (!staticGroup && ++frames >= 2) buildStatic();
    if (corridor.tick(step, rm)) dirty = true;
    if (corridor.takeDirty()) dirty = true;
    if (state.tick(step, rm)) dirty = true;
    if (fogGoing) {
      fogT = rm ? 1 : Math.min(1, fogT + step / 1.6);
      if (fogT >= 1) fogGoing = false;
      dirty = true;
    }
    const now = getDancheong(wingId);
    if (now !== level) { level = now; materials.setDancheong(level); dirty = true; }
    if (panelStale()) drawSigns();
    if (dirty) { dirty = false; rebuild(); }
  }

  const V = (p) => new THREE.Vector3(p.x, 0, p.z);
  const anchors = {
    slots: [0, 1, 2].map((i) => new THREE.Vector3(SHELF.x - 1 + i, 0, SHELF.z + 1.0)),
    bonus: [0, 1, 2].map((i) => new THREE.Vector3(BONUS.x - 1 + i, 0, BONUS.z + 1.0)),
    basket: new THREE.Vector3(BASKET.x - 0.9, 0, BASKET.z + 0.6),
    returnedShelf: new THREE.Vector3(RETURNED.x, 0, RETURNED.z + 1.0),
    roomDoor: new THREE.Vector3(ROOM_DOOR.x, 0, ROOM_DOOR.z + 1.2),
    nextDoor: new THREE.Vector3(NEXT_DOOR.x, 0, NEXT_DOOR.z + 1.2),
    entrance: V({ x: WAITING.x, z: WAITING.z + 0.9 }),
    camera: {
      // 회랑 바깥벽 안쪽에서 비스듬히 내려다본다. 회랑은 화면 위쪽 먹안개 속으로 끝없이 이어진다.
      position: new THREE.Vector3(0, 7.2, 9),
      target: new THREE.Vector3(0, 1, -2),
      // 재기 화면 왼쪽 반이 볼 곳: 회랑 입구에서 안쪽을 바라본다(세계 바탕이 쓰기로 하면 쓴다)
      measure: { position: new THREE.Vector3(0, 2.6, 4.5), target: new THREE.Vector3(0, 1.8, -10) },
    },
  };

  root.userData.gasaDebug = () => ({
    corridor: corridor.snapshot(),
    level,
    fog: fogT,
    fogVisible: fog.visible,
    boxes: boxes.count,
    cylinders: cyls.count,
    stones: stones.count,
    litStones: stoneGlow.count,
    staticBuilt: !!staticGroup,
    capacity: { boxes: BOX_CAP, cylinders: CYL_CAP },
    slots: JSON.parse(JSON.stringify(state.slots)),
    bound: { ...state.bound },
    pops: [...state.pops.entries()].map(([k, v]) => ({ key: k, genre: v.genre, t: v.t })),
    // 점검용: 인스턴스 배치의 지문(바뀌었는지 비교)과, 가운데가 x0~x1 안인 상자들의 경계(삐져나온 모양 재기)
    signature() {
      const sum = (arr, n) => { let h = 0; for (let i = 0; i < n; i++) h += arr[i] * ((i % 97) + 1); return Math.round(h * 1000) / 1000; };
      return {
        boxes: sum(boxes.instanceMatrix.array, nb * 16),
        cylinders: sum(cyls.instanceMatrix.array, nc * 16),
        cylinderColors: sum(cyls.instanceColor.array, nc * 3),
        boxColors: sum(boxes.instanceColor.array, nb * 3),
        stoneColors: sum(stones.instanceColor.array, ns * 3),
      };
    },
    boundsX(x0, x1) {
      const b = { minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, n: 0 };
      const mm = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const qq = new THREE.Quaternion();
      const s = new THREE.Vector3();
      for (let i = 0; i < nb; i++) {
        boxes.getMatrixAt(i, mm);
        mm.decompose(p, qq, s);
        if (p.x < x0 || p.x > x1 || p.z < SHELF.z - 1 || p.z > SHELF.z + 2.6) continue;
        b.n++;
        b.minY = Math.min(b.minY, p.y - s.y / 2);
        b.maxY = Math.max(b.maxY, p.y + s.y / 2);
        b.minZ = Math.min(b.minZ, p.z - s.z / 2);
        b.maxZ = Math.max(b.maxZ, p.z + s.z / 2);
      }
      return b;
    },
    color: (mesh, i) => {
      const c = new THREE.Color();
      (mesh === 'cylinders' ? cyls : boxes).getColorAt(i, c);
      return '#' + c.getHexString();
    },
  });

  return {
    anchors,
    // 연결 결정(F2): 떠도는 노래 다섯이 머무는 곳(회랑 앞마당 위, y는 떠 있는 높이). 누를 자리가 아니다.
    floatingSpots: [
      new THREE.Vector3(-1.2, 1.6, 1.6), new THREE.Vector3(1.4, 1.9, 0.6), new THREE.Vector3(0, 1.5, 2.6),
      new THREE.Vector3(-2.6, 1.8, 2.8), new THREE.Vector3(2.1, 1.7, 2.8),
    ],
    react,
    update,
    dispose() {
      for (const o of [...root.children]) root.remove(o);
      if (staticGroup) staticGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const m of [boxes, cyls, decks, eaves, stones, stoneGlow, fog]) m.dispose?.();
      fog.geometry.dispose();
      signs.geometry.dispose();
      for (const g of ownGeos) g.dispose();
      for (const mt of [...ownMats, fogMat, signs.material]) mt.dispose();
      ownTextures.forEach((t) => t.dispose());
      props.dispose();
      kit.dispose();
      baked.dispose();
      materials.dispose();
      textures.dispose();
      delete root.userData.gasaDebug;
    },
  };

  // 마루 칸 하나(원점이 칸 가운데 바닥): 널마루, 양옆 귀틀, 칸 앞머리 문지방, 낮은 난간
  function buildDeckGeometry() {
    const tb = kit.builder();
    const L = SEG_LEN - 0.1;
    tb.box('floor', 4.9, 0.18, L, { p: [0, 0.09, 0], color: '#ffffff', ao: 0.2, bevel: 0.02 });
    for (const s of [-1, 1]) {
      tb.box('floor', 0.22, 0.24, L, { p: [s * 2.5, 0.12, 0], color: '#9a8468', ao: 0.3 });
      // 난간: 위 난간대, 아래 띠, 짧은 동자(기둥 사이에만)
      for (const [z0, z1] of [[-L / 2 + 0.1, -0.95], [-0.75, 0.75], [0.95, L / 2 - 0.1]]) {
        const len = z1 - z0;
        tb.box('floor', 0.07, 0.07, len, { p: [s * 2.42, 0.78, (z0 + z1) / 2], color: '#7d6852', ao: 0 });
        tb.box('floor', 0.05, 0.05, len, { p: [s * 2.42, 0.36, (z0 + z1) / 2], color: '#7d6852', ao: 0 });
        const n = Math.max(1, Math.round(len / 0.45));
        for (let i = 0; i <= n; i++) tb.box('floor', 0.045, 0.6, 0.045, { p: [s * 2.42, 0.48, z0 + (len * i) / n], color: '#7d6852', ao: 0, bevel: 0.008 });
      }
    }
    tb.box('floor', 4.9, 0.05, 0.16, { p: [0, 0.205, L / 2 - 0.08], color: '#8a745a', ao: 0 });
    const group = tb.build('gasa-deck-tmp');
    const geo = group.children[0].geometry;
    return geo;
  }

  // 처마 두 자락(원점은 칸 가운데의 처마 끝 높이). 안쪽(|x| 1.5)이 높고 바깥(|x| 3.55)으로 오목하게 흐른다.
  // 기와 면, 막새, 서까래, 평고대, 안쪽 마루 기와를 한 기하에 굽는다. 가운데는 열어 둔다.
  function buildEaveGeometry() {
    const tb = kit.builder();
    const L = SEG_LEN - 0.12;
    const NX = 6;
    const NZ = 4;
    const xi = 1.5;
    const xo = 3.55;
    const yAt = (u) => 0.72 * (1 - u) - 0.1 * Math.sin(Math.PI * u) + 0.06 * u ** 3;
    const made = [];
    for (const s of [-1, 1]) {
      const pos = [];
      const uv = [];
      const P = (u, w) => [s * (xi + (xo - xi) * u), yAt(u), -L / 2 + L * w];
      for (let j = 0; j < NZ; j++) {
        for (let i = 0; i < NX; i++) {
          const a = [i / NX, j / NZ];
          const bq = [(i + 1) / NX, j / NZ];
          const c = [i / NX, (j + 1) / NZ];
          const d = [(i + 1) / NX, (j + 1) / NZ];
          for (const [u, w] of [a, c, d, a, d, bq]) {
            pos.push(...P(u, w));
            uv.push((w * L) / 2.4, (u * (xo - xi)) / 1.4);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      if (g.attributes.normal.getY(0) < 0) {
        // 위를 보게 감김을 뒤집는다(왼쪽 자락은 x를 뒤집었으므로 감김이 거꾸로다)
        const p = g.attributes.position.array;
        const t = g.attributes.uv.array;
        for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
        for (let i = 0; i < t.length; i += 6) for (let k = 0; k < 2; k++) [t[i + 2 + k], t[i + 4 + k]] = [t[i + 4 + k], t[i + 2 + k]];
        g.computeVertexNormals();
      }
      made.push(g);
      tb.add('roof', g, { color: '#ffffff', uv: 'keep', ao: 0 });
      // 막새(처마 끝 기와 마구리)
      const n = Math.round(L / 0.4);
      for (let i = 0; i <= n; i++) tb.add('roof', kit.cylinder(0.07, 0.07, 0.12, 6), { p: [s * (xo + 0.03), yAt(1) + 0.02, -L / 2 + (L * i) / n], r: [0, 0, s * (Math.PI / 2 - 0.3)], color: '#6a665f', ao: 0 });
      // 서까래(처마 밑으로 보이는 둥근 나무)와 평고대
      const nr = Math.round(L / 0.5);
      for (let i = 0; i <= nr; i++) {
        const z = -L / 2 + 0.1 + ((L - 0.2) * i) / nr;
        props.rod(tb, 'roof', [s * 2.0, yAt(0.35) - 0.1, z], [s * (xo - 0.05), yAt(1) - 0.08, z], 0.05, '#8a7158', 4);
      }
      tb.box('roof', 0.09, 0.09, L, { p: [s * (xo - 0.02), yAt(1) - 0.06, 0], color: '#7d6852', ao: 0 });
      // 안쪽 마루 기와(용마루처럼 둥근 수키와 줄)
      tb.add('roof', kit.cylinder(0.11, 0.11, L, 8), { p: [s * xi, yAt(0) + 0.02, 0], r: [Math.PI / 2, 0, 0], color: '#5f5b54', ao: 0 });
    }
    const group = tb.build('gasa-eave-tmp');
    const geo = group.children[0].geometry;
    for (const m of group.children.slice(1)) m.geometry.dispose();
    made.forEach((g) => g.dispose());
    return geo;
  }
}

function signGeometry(THREE, quads) {
  const pos = [];
  const uv = [];
  const idx = [];
  quads.forEach(({ row, c: [x, y, z], w, h }) => {
    const top = row === 'panel' ? SIGN_H * SIGN_ROWS : row * SIGN_H;
    const bottom = row === 'panel' ? ATLAS_H : top + SIGN_H;
    const v0 = 1 - bottom / ATLAS_H;
    const v1 = 1 - top / ATLAS_H;
    const b = pos.length / 3;
    pos.push(x - w / 2, y - h / 2, z, x + w / 2, y - h / 2, z, x + w / 2, y + h / 2, z, x - w / 2, y + h / 2, z);
    uv.push(0, v0, 1, v0, 1, v1, 0, v1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
