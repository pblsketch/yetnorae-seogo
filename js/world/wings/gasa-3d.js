// 가사관 3D 모형(spec 3.1): 끝이 안 보이는 회랑. 기둥이 넷씩 반복되고, 걸을 때마다 기둥 넷과 처마가 생기며 길어진다.
// 그리기 호출을 아끼려고 상자는 모두 InstancedMesh 하나, 원기둥(기둥·두루마리·바구니)도 하나로 그린다.
// 그 밖에는 먹안개 판(하나)과 이름판 글자 그림(하나)뿐이다. 회랑 칸은 정해진 수만 다시 쓴다(gasa-corridor.js).
import { TOKENS, dancheongColor, getDancheong, mixHex } from '../palette.js';
import { createCorridor } from './gasa-corridor.js';
import {
  GATE_Z, SEG_LEN, SHELF, BONUS, RETURNED, BASKET, ROOM_DOOR, NEXT_DOOR, WAITING, titleOf, createWingState, popAmount,
} from './gasa-shared.js';

const BOX_CAP = 360;
const CYL_CAP = 64;
const FOG_COUNT = 7;
const PILLAR_IN = 1.15;   // 칸 앞뒤 끝에서 기둥까지(칸 안 기둥 사이 1.7m, 칸 사이 2.3m)

// 먹빛 바탕(scene3d.js의 바탕색과 같은 식)
const INK_BG = mixHex(TOKENS.hanji, TOKENS.meokFog, 0.5);

// 부분마다 단청이 돌아왔을 때의 색
const C = {
  wood: mixHex(TOKENS.gold, TOKENS.meokSoft, 0.45),
  deck: mixHex(TOKENS.hanjiDeep, TOKENS.gold, 0.25),
  pillar: mixHex(TOKENS.juhong, TOKENS.meokSoft, 0.2),
  beam: TOKENS.nokcheong,
  band: mixHex(TOKENS.nokcheong, TOKENS.hanji, 0.25),
  bandAlt: TOKENS.juhong,
  roof: mixHex(TOKENS.meok, TOKENS.meokSoft, 0.4),
  hanji: TOKENS.hanji,
  blank: mixHex(TOKENS.hanji, TOKENS.meokFog, 0.12),
  cover: TOKENS.hanjiDeep,
  cord: TOKENS.meok,
  gold: TOKENS.gold,
  thread: TOKENS.juhong,
  trim: TOKENS.nokcheong,
  thatch: mixHex(TOKENS.gold, TOKENS.hanjiDeep, 0.5),
  door: TOKENS.meokSoft,
  lit: mixHex(TOKENS.gold, TOKENS.hanji, 0.45),
  tag: TOKENS.nokcheong,
};

function placeholderCanvas(size = 64) {
  // 자리표시 무늬(texture/gasa가 오기 전까지): 한지 섬유 같은 옅은 결
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(0,0,0,0.07)';
  g.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const y = (i * 37) % size;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(size * 0.3, y + 3, size * 0.6, y - 3, size, y + 1);
    g.stroke();
  }
  return c;
}

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

  // ── 재질과 그물 ──
  const ownTextures = [];
  let pattern = assets?.texture?.('texture/gasa') ?? null;
  if (!pattern) {
    pattern = new THREE.CanvasTexture(placeholderCanvas());
    ownTextures.push(pattern);
  }
  pattern.wrapS = pattern.wrapT = THREE.RepeatWrapping;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshLambertMaterial({ map: pattern });
  const boxes = new THREE.InstancedMesh(boxGeo, boxMat, BOX_CAP);
  boxes.name = 'gasa-boxes';
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const cylMat = new THREE.MeshLambertMaterial({ map: pattern });
  const cyls = new THREE.InstancedMesh(cylGeo, cylMat, CYL_CAP);
  cyls.name = 'gasa-cylinders';
  for (const m of [boxes, cyls]) {
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
  signCanvas.height = SIGN_H * SIGN_ROWS;
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  ownTextures.push(signTex);
  const SIGN_QUADS = [
    { row: 0, c: [0, 3.45, GATE_Z + 0.24], w: 1.5, h: 0.36 },
    { row: 1, c: [ROOM_DOOR.x, 2.72, ROOM_DOOR.z + 0.2], w: 1.5, h: 0.36 },
    { row: 2, c: [RETURNED.x, 1.42, RETURNED.z + 0.3], w: 1.5, h: 0.32 },
    { row: 3, c: [SHELF.x, 2.62, SHELF.z + 0.34], w: 3.1, h: 0.42 },
    { row: 4, c: [BONUS.x, 2.62, BONUS.z + 0.34], w: 3.1, h: 0.42 },
  ];
  const signs = new THREE.Mesh(signGeometry(THREE, SIGN_QUADS), new THREE.MeshBasicMaterial({ map: signTex }));
  signs.name = 'gasa-signs';
  root.add(signs);
  drawSigns();

  function drawSigns() {
    const g = signCanvas.getContext('2d');
    const family = getComputedStyle(document.body).fontFamily || 'serif';
    g.clearRect(0, 0, SIGN_W, SIGN_H * SIGN_ROWS);
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

  // ── 인스턴스 쓰기 ──
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pv = new THREE.Vector3();
  const sv = new THREE.Vector3();
  const col = new THREE.Color();
  let nb = 0;
  let nc = 0;
  const bg = () => mixHex(INK_BG, TOKENS.hanji, level);
  const paint = (hex) => dancheongColor(hex, level);

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

  // ── 회랑 ──
  function buildCorridor() {
    const back = bg();
    // 문(회랑 입구): 굵은 기둥 둘, 인방, 지붕
    cyl(-2.6, 1.8, GATE_Z, 0.22, 3.6, paint(C.pillar));
    cyl(2.6, 1.8, GATE_Z, 0.22, 3.6, paint(C.pillar));
    box(0, 3.45, GATE_Z, 5.8, 0.34, 0.42, paint(C.beam));
    for (const s of corridor.segments()) {
      if (s.sink <= 0.001) continue;
      const zf = GATE_Z - 0.4 - s.rel * SEG_LEN;   // 칸 앞머리
      const zc = zf - SEG_LEN / 2;
      const fade = s.ghost ? 0.8 : Math.min(0.65, Math.max(0, (s.rel - 1.5) * 0.12));
      const tint = (hex) => mixHex(paint(hex), back, fade);
      const vy = s.sink;
      const rise = s.rise;
      const drop = (1 - rise) * 3;
      // 마루
      box(0, 0.09 * vy, zc, 5.4, 0.18 * vy, SEG_LEN - 0.5, tint(C.deck));
      // 기둥 넷(앞 둘, 뒤 둘). 기둥 하나가 한 음보다. 칸 안 기둥 사이를 칸 사이보다 좁혀 넷씩 묶여 보이게 한다.
      const pz = [zf - PILLAR_IN, zf - SEG_LEN + PILLAR_IN];
      const px = [-2.2, 2.2];
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([xi, zi], k) => {
        const h = 2.8 * rise * vy;
        const lit = s.lit[k];
        const hex = lit > 0 ? mixHex(tint(C.pillar), C.lit, Math.min(1, lit * 1.5)) : tint(C.pillar);
        cyl(px[xi], 0.18 * vy + h / 2, pz[zi], lit > 0 ? 0.2 : 0.16, h, hex);
      });
      if (rise < 0.02) continue;
      const y0 = (3.0 + drop) * vy;
      const flash = s.flash;
      const bandHex = flash > 0 ? mixHex(tint(C.band), C.lit, flash) : tint(C.band);
      // 창방(긴 보)과 가로 보
      const span = SEG_LEN - PILLAR_IN * 2 + 0.5;
      box(-2.2, y0, zc, 0.24, 0.26 * vy, span, tint(C.beam));
      box(2.2, y0, zc, 0.24, 0.26 * vy, span, tint(C.beam));
      box(0, y0 + 0.05 * vy, pz[0], 4.7, 0.2 * vy, 0.22, bandHex);
      box(0, y0 + 0.05 * vy, pz[1], 4.7, 0.2 * vy, 0.22, bandHex);
      // 처마: 기둥 줄마다 바깥으로 기운 지붕 한 자락. 가운데는 하늘로 열어 두어 위에서 회랑 안이 들여다보인다.
      const ry = (3.42 + drop) * vy;
      box(-2.35, ry, zc, 2.1, 0.14 * vy, SEG_LEN - 0.4, tint(C.roof), 0.3);
      box(2.35, ry, zc, 2.1, 0.14 * vy, SEG_LEN - 0.4, tint(C.roof), -0.3);
      const edge = s.n % 2 ? tint(C.bandAlt) : bandHex;
      box(-3.33, (3.12 + drop) * vy, zc, 0.14, 0.12 * vy, SEG_LEN - 0.16, edge);
      box(3.33, (3.12 + drop) * vy, zc, 0.14, 0.12 * vy, SEG_LEN - 0.16, edge);
      box(-1.38, (3.7 + drop) * vy, zc, 0.12, 0.1 * vy, SEG_LEN - 0.16, edge);
      box(1.38, (3.7 + drop) * vy, zc, 0.12, 0.1 * vy, SEG_LEN - 0.16, edge);
    }
  }

  // ── 서가와 자리 ──
  function buildShelf(S, area) {
    const wood = paint(C.wood);
    const trim = paint(C.trim);
    const zb = S.z - 0.3;
    box(S.x, 1.15, zb, 3.1, 2.3, 0.08, wood);                   // 뒤판
    box(S.x - 1.52, 1.15, S.z, 0.1, 2.3, 0.62, wood);           // 옆판
    box(S.x + 1.52, 1.15, S.z, 0.1, 2.3, 0.62, wood);
    box(S.x, 2.33, S.z, 3.2, 0.1, 0.68, trim);                  // 윗판(누를 수 있는 서가는 녹청 테)
    box(S.x, 0.1, S.z, 3.2, 0.2, 0.68, wood);                   // 받침
    box(S.x - 0.5, 1.2, S.z, 0.06, 2.1, 0.56, wood);            // 칸막이
    box(S.x + 0.5, 1.2, S.z, 0.06, 2.1, 0.56, wood);
    const slots = state.slots[area];
    const bound = state.bound[area];
    for (let i = 0; i < 3; i++) {
      const x = S.x - 1 + i;
      const pop = state.pops.get(area + ':' + i);
      if (pop) { popShape(x, 0.2, S.z + 0.3, pop.genre, popAmount(pop.t)); continue; }
      if (!slots[i]) {
        // 빈자리: 제목 없는 빈 책등
        box(x, 1.0, S.z - 0.18, 0.58, 1.5, 0.08, paint(C.blank));
        box(x, 1.0, S.z - 0.13, 0.3, 1.2, 0.02, mixHex(paint(C.blank), TOKENS.meokFog, 0.2));
        continue;
      }
      // 꽂힌 두루마리 책(가사는 긴 노래라 칸이 높다)
      box(x, 1.02, S.z, 0.58, 1.62, 0.5, paint(C.cover));
      box(x, 0.55, S.z, 0.6, 0.05, 0.52, paint(C.cord));
      box(x, 1.5, S.z, 0.6, 0.05, 0.52, paint(C.cord));
      if (bound) box(x, 1.02, S.z + 0.26, 0.3, 0.95, 0.02, C.gold);   // 금박
    }
    if (bound) {
      // 세 권을 한 권으로 묶는 실
      box(S.x, 0.8, S.z + 0.28, 2.9, 0.06, 0.05, paint(C.thread));
      box(S.x, 1.25, S.z + 0.28, 2.9, 0.06, 0.05, paint(C.thread));
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
        box(ox, oy + 0.64, oz - 0.4 + 0.85 * out, 0.5, 0.5, 0.4 + 1.5 * out, cover);
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
    cyl(B.x, 0.22, B.z, 0.55, 0.44, paint(C.thatch));
    cyl(B.x, 0.46, B.z, 0.6, 0.06, paint(C.trim));      // 테(누를 수 있는 것)
    for (let i = 0; i < 2; i++) {
      const pop = state.pops.get('basket:' + i);
      const x = B.x - 0.2 + i * 0.4;
      if (pop) { popShape(B.x - 1.1 + i * 2.2, 0, B.z + 0.4, pop.genre, popAmount(pop.t)); continue; }
      const it = state.slots.basket[i];
      if (!it) continue;
      cyl(x, 0.58, B.z, 0.13, 0.7, paint(C.cover), 'z');
      if (it.to) box(x, 0.78, B.z + 0.2, 0.14, 0.2, 0.02, paint(C.tag));   // 행선지 표시
    }
  }

  function buildReturned() {
    const R = RETURNED;
    const wood = paint(C.wood);
    box(R.x, 0.6, R.z - 0.22, 1.7, 1.2, 0.06, wood);
    box(R.x - 0.82, 0.6, R.z, 0.08, 1.2, 0.48, wood);
    box(R.x + 0.82, 0.6, R.z, 0.08, 1.2, 0.48, wood);
    box(R.x, 1.2, R.z, 1.74, 0.08, 0.5, paint(C.trim));
    box(R.x, 0.62, R.z, 1.64, 0.05, 0.46, wood);
    box(R.x, 0.06, R.z, 1.74, 0.12, 0.5, wood);
    state.slots.returned.slice(0, 4).forEach((id, i) => {
      if (!id) return;
      box(R.x - 0.54 + i * 0.36, 0.9, R.z, 0.28, 0.5, 0.36, paint(C.cover));
    });
  }

  function buildDoor(D, label) {
    const frame = paint(label ? C.trim : C.wood);
    box(D.x - 0.8, 1.2, D.z, 0.18, 2.4, 0.2, frame);
    box(D.x + 0.8, 1.2, D.z, 0.18, 2.4, 0.2, frame);
    box(D.x, 2.42, D.z, 1.9, 0.2, 0.26, frame);
    box(D.x, 1.08, D.z - 0.04, 1.4, 2.16, 0.07, paint(C.door));
    if (label) {
      // 작품 방 「상춘곡」: 수간모옥(초가)의 이엉 지붕
      box(D.x, 3.05, D.z - 0.2, 2.5, 0.42, 1.2, paint(C.thatch));
      box(D.x - 2.0, 1.1, D.z - 0.5, 1.6, 2.2, 0.1, paint(C.thatch));   // 흙담 한 자락
    } else {
      box(D.x, 2.75, D.z - 0.1, 2.3, 0.14, 1.0, paint(C.roof));
    }
  }

  function buildWaiting() {
    const W = WAITING;
    box(W.x, 0.42, W.z, 1.1, 0.07, 0.62, paint(C.wood));
    box(W.x, 0.2, W.z, 0.8, 0.38, 0.4, paint(C.wood));
  }

  function buildFog() {
    const going = reduce() ? (fogT >= 1 ? 1 : fogT) : fogT;
    fog.visible = going < 1;
    fogMat.opacity = 0.45 * (1 - going);
    FOG.forEach(([x, y, z, s], i) => {
      e.set(-Math.PI / 2, 0, 0);
      q.setFromEuler(e);
      const push = 1 + going * 1.4;
      m4.compose(pv.set(x * push, y, z + going * (z < 0 ? -6 : 3)), q, sv.set(s * 1.4, s, 1));
      fog.setMatrixAt(i, m4);
    });
    fog.instanceMatrix.needsUpdate = true;
  }

  function rebuild() {
    nb = 0;
    nc = 0;
    buildCorridor();
    buildShelf(SHELF, 'shelf');
    buildShelf(BONUS, 'bonus');
    buildBasket();
    buildReturned();
    buildDoor(ROOM_DOOR, true);
    buildDoor(NEXT_DOOR, false);
    buildWaiting();
    boxes.count = nb;
    cyls.count = nc;
    boxes.instanceMatrix.needsUpdate = true;
    cyls.instanceMatrix.needsUpdate = true;
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
    if (cyls.instanceColor) cyls.instanceColor.needsUpdate = true;
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
    if (corridor.tick(step, rm)) dirty = true;
    if (corridor.takeDirty()) dirty = true;
    if (state.tick(step, rm)) dirty = true;
    if (fogGoing) {
      fogT = rm ? 1 : Math.min(1, fogT + step / 1.6);
      if (fogT >= 1) fogGoing = false;
      dirty = true;
    }
    const now = getDancheong(wingId);
    if (now !== level) { level = now; dirty = true; }
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
    react,
    update,
    dispose() {
      for (const o of [boxes, cyls, fog, signs]) root.remove(o);
      for (const g of [boxGeo, cylGeo, fog.geometry, signs.geometry]) g.dispose();
      for (const mt of [boxMat, cylMat, fogMat, signs.material]) mt.dispose();
      ownTextures.forEach((t) => t.dispose());
      boxes.dispose?.();
      cyls.dispose?.();
      fog.dispose?.();
      delete root.userData.gasaDebug;
    },
  };
}

function signGeometry(THREE, quads) {
  const pos = [];
  const uv = [];
  const idx = [];
  quads.forEach(({ row, c: [x, y, z], w, h }) => {
    const v0 = 1 - (row + 1) / SIGN_ROWS;
    const v1 = 1 - row / SIGN_ROWS;
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
