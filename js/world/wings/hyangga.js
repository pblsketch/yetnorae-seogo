// 향가관 모형(spec 3.1): 아래부터 4구·8구·10구 층이 쌓이는 탑. 층마다 칸(서가 자리) 하나,
// 10구 층의 마지막 두 칸(4·4·2의 마지막 무리) 앞에 글자 없는 표지만 새긴 '아아' 문이 있다.
// 공통 자리: 바구니(두 자리), 덤 서가(세 자리), 돌아온 노래 선반, 작품 방 「제망매가」 문, 다음 관 문.
//
// 3D는 저폴리 상자를 코드로 조립한다. 그리기 호출을 아끼려고 같은 재질의 상자는 InstancedMesh 하나로 모은다
// (정적 구조 1, 탑의 칸 불 1, 책·금박·문짝 1, 이름표 1, 먹안개 1, '아아' 문 2). 그림자는 쓰지 않는다.
// 색은 관의 단청 값(0 먹빛 ~ 1 단청)에 맞춰 먹빛에서 단청색으로 돌아온다.
// 2D 그림 판은 hyangga-board.js에 있다.
import { TOKENS, dancheongColor, getDancheong, mixHex } from '../palette.js';
import {
  FLOORS, GROUPING, DOOR_BAYS, TOTAL_BAYS, bayIndex, litPerFloor, createHyanggaState, snapshot,
  popShape, songTitle, roomTitle, WING_NAMES,
} from './hyangga-shared.js';
import { create2D as createBoard } from './hyangga-board.js';

export { REACTION_EVENTS } from './hyangga-shared.js';

// ── 배치(관 바닥 가운데가 원점, 1 = 1m, +z 카메라 쪽) ──
const TOWER = { x0: -4.4, width: 4.8, front: -2.0, back: -5.0, plinth: 0.3, floorH: 1.45 };
const BACK_Z = -6.3;
const BOOK = { w: 0.26, h: 0.62, d: 0.42 };
// 층마다 서가 자리(칸)가 놓인 칸 번호. 10구 층은 '아아' 문(8·9칸)을 비켜 둘째 무리에 둔다.
const NICHE_BAY = [0, 3, 6];
const BONUS_X = [3.6, 4.6, 5.6];
const BONUS = { z: -5.55, top: 1.05 };
const BASKET = { x: 2.1, z: 2.2 };
const ROOM_DOOR = { x: 1.9, w: 1.3, h: 2.3 };
const NEXT_DOOR = { z: -1.4, w: 1.3, h: 2.3 };
const RETURNED = { x: -5.9, z: 0.8 };

const bayWidth = (f) => TOWER.width / FLOORS[f];
const floorBase = (f) => TOWER.plinth + f * TOWER.floorH;
const bayX = (f, b) => TOWER.x0 + (b + 0.5) * bayWidth(f);
const nicheX = (f) => bayX(f, NICHE_BAY[f]);
const nicheY = (f) => floorBase(f) + 0.32;   // 선반 판 윗면
const NICHE_Z = TOWER.front + 0.32;
const DOOR_HINGE_X = TOWER.x0 + DOOR_BAYS[0] * bayWidth(2);
const DOOR_W = TOWER.width - (DOOR_HINGE_X - TOWER.x0);

const ease = (t) => 1 - (1 - t) * (1 - t);
// 삐져나오는 방향(왼쪽 앞)과 그 방향으로 돌린 각도
const POP_DIR = { x: -0.6, z: 0.8 };
const POP_ANGLE = Math.atan2(POP_DIR.x, POP_DIR.z);

// 상자 목록을 재질 하나의 InstancedMesh로. 색은 setColorAt으로 따로 칠한다.
function instanced(THREE, material, capacity) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, Math.max(1, capacity));
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, c);
  return mesh;
}

// ── 정적 구조 ──
// 상자 하나: { p: [x,y,z], s: [w,h,d], c: 색, r?: y축 회전 }
function staticBoxes() {
  const T = TOWER;
  const cx = T.x0 + T.width / 2;
  const out = [];
  const add = (p, s, c, r = 0) => out.push({ p, s, c, r });
  // 관 뒷벽(작품 방 문 자리는 비운다)과 오른쪽 벽 일부
  const wall = mixHex(TOKENS.hanji, TOKENS.meokFog, 0.3);
  const gapL = ROOM_DOOR.x - ROOM_DOOR.w / 2;
  const gapR = ROOM_DOOR.x + ROOM_DOOR.w / 2;
  add([(-6.5 + gapL) / 2, 1.5, BACK_Z], [gapL + 6.5, 3, 0.2], wall);
  add([(gapR + 6.5) / 2, 1.5, BACK_Z], [6.5 - gapR, 3, 0.2], wall);
  add([0, 3.05, BACK_Z], [13, 0.2, 0.36], TOKENS.meokSoft);
  // 작품 방 문틀(누를 수 있는 자리: 기둥 주홍, 인방 녹청)
  add([gapL - 0.1, 1.2, BACK_Z + 0.12], [0.2, 2.4, 0.3], TOKENS.juhong);
  add([gapR + 0.1, 1.2, BACK_Z + 0.12], [0.2, 2.4, 0.3], TOKENS.juhong);
  add([ROOM_DOOR.x, 2.45, BACK_Z + 0.12], [ROOM_DOOR.w + 0.5, 0.24, 0.34], TOKENS.nokcheong);
  // 다음 관 문(오른쪽 벽)
  const rx = 6.45;
  add([rx, 1.5, (BACK_Z + NEXT_DOOR.z - NEXT_DOOR.w / 2) / 2], [0.2, 3, NEXT_DOOR.z - NEXT_DOOR.w / 2 - BACK_Z], wall);
  add([rx - 0.05, 1.2, NEXT_DOOR.z - NEXT_DOOR.w / 2 - 0.1], [0.3, 2.4, 0.2], TOKENS.juhong);
  add([rx - 0.05, 1.2, NEXT_DOOR.z + NEXT_DOOR.w / 2 + 0.1], [0.3, 2.4, 0.2], TOKENS.juhong);
  add([rx - 0.05, 2.45, NEXT_DOOR.z], [0.34, 0.24, NEXT_DOOR.w + 0.5], TOKENS.nokcheong);
  add([rx + 0.02, 1.15, NEXT_DOOR.z], [0.08, 2.2, NEXT_DOOR.w - 0.1], TOKENS.meok);

  // 탑: 기단, 층마다 뒷벽·옆벽·기둥·인방, 층 사이 처마 판, 지붕
  add([cx, T.plinth / 2, (T.front + T.back) / 2], [T.width + 1.2, T.plinth, T.front - T.back + 1.4], TOKENS.hanjiDeep);
  add([cx, T.plinth / 2 + 0.02, T.front + 1.2], [1.4, T.plinth - 0.04, 1.2], TOKENS.hanjiDeep);   // 앞 계단 디딤
  FLOORS.forEach((n, f) => {
    const y0 = floorBase(f);
    const H = T.floorH;
    add([cx, y0 + H / 2, T.back + 0.05], [T.width, H, 0.1], TOKENS.meokSoft);
    add([T.x0 + 0.05, y0 + H / 2, (T.front + T.back) / 2], [0.1, H, T.front - T.back], TOKENS.meokSoft);
    add([T.x0 + T.width - 0.05, y0 + H / 2, (T.front + T.back) / 2], [0.1, H, T.front - T.back], TOKENS.meokSoft);
    const bw = bayWidth(f);
    for (let b = 0; b <= n; b++) {
      // 10구 층은 4·4·2 무리의 경계 기둥을 굵게 세운다.
      let edge = 0;
      if (f === FLOORS.length - 1) { let acc = 0; for (const g of GROUPING) { acc += g; if (acc === b && b < n) edge = 1; } }
      const t = edge ? 0.2 : 0.11;
      add([T.x0 + b * bw, y0 + (H - 0.14) / 2, T.front - 0.08], [t, H - 0.14, t], TOKENS.juhong);
    }
    add([cx, y0 + H - 0.2, T.front - 0.08], [T.width + 0.1, 0.16, 0.18], TOKENS.nokcheong);
    // 처마 판(층 지붕). 위층일수록 처마가 조금 더 나온다.
    add([cx, y0 + H - 0.03, (T.front + T.back) / 2 + 0.15], [T.width + 0.6 + f * 0.15, 0.12, T.front - T.back + 0.9], TOKENS.meok);
    // 서가 자리(층마다 하나): 받침 판과 양옆 기둥(누를 수 있는 것, 녹청)
    const nx = nicheX(f);
    const ny = nicheY(f);
    add([nx, ny - 0.04, NICHE_Z], [0.62, 0.08, 0.6], TOKENS.nokcheong);
    add([nx - 0.3, ny + 0.38, NICHE_Z + 0.24], [0.05, 0.84, 0.05], TOKENS.nokcheong);
    add([nx + 0.3, ny + 0.38, NICHE_Z + 0.24], [0.05, 0.84, 0.05], TOKENS.nokcheong);
    add([nx, ny + 0.8, NICHE_Z + 0.05], [0.66, 0.06, 0.5], TOKENS.nokcheong);
  });
  const top = floorBase(FLOORS.length);
  add([cx, top + 0.12, (T.front + T.back) / 2 + 0.1], [T.width + 1.4, 0.24, T.front - T.back + 1.6], TOKENS.meok);
  add([cx, top + 0.42, (T.front + T.back) / 2], [T.width * 0.7, 0.36, (T.front - T.back) * 0.7], TOKENS.meokSoft);
  add([cx, top + 0.75, (T.front + T.back) / 2], [0.5, 0.3, 0.5], TOKENS.meok);
  add([cx, top + 1.1, (T.front + T.back) / 2], [0.12, 0.5, 0.12], TOKENS.gold);

  // 층 이름 비석(땅). 서가 자리 앞에 하나씩, 그 위에 '4구 층' 이름표가 붙는다.
  FLOORS.forEach((_, f) => add([nicheX(f), 0.32, -1.0], [0.8, 0.64, 0.16], TOKENS.hanjiDeep));

  // 덤 서가: 낮은 장 위에 세 칸
  const bx0 = BONUS_X[0] - 0.55;
  const bx1 = BONUS_X.at(-1) + 0.55;
  add([(bx0 + bx1) / 2, BONUS.top / 2, BONUS.z], [bx1 - bx0, BONUS.top, 0.7], TOKENS.meokSoft);
  add([(bx0 + bx1) / 2, BONUS.top + 0.82, BONUS.z - 0.3], [bx1 - bx0, 1.64, 0.08], TOKENS.meokSoft);
  add([(bx0 + bx1) / 2, BONUS.top + 1.66, BONUS.z], [bx1 - bx0 + 0.1, 0.08, 0.72], TOKENS.meok);
  for (let i = 0; i <= BONUS_X.length; i++) {
    const x = i === 0 ? bx0 : i === BONUS_X.length ? bx1 : (BONUS_X[i - 1] + BONUS_X[i]) / 2;
    add([x, BONUS.top + 0.82, BONUS.z], [0.06, 1.64, 0.7], TOKENS.nokcheong);
  }

  // 바구니(대나무 결 상자)
  add([BASKET.x, 0.22, BASKET.z], [1.3, 0.44, 0.8], mixHex(TOKENS.hanjiDeep, TOKENS.gold, 0.35));
  add([BASKET.x, 0.46, BASKET.z], [1.36, 0.06, 0.86], mixHex(TOKENS.meokSoft, TOKENS.gold, 0.3));

  // 돌아온 노래 선반(왼쪽)
  add([RETURNED.x, 0.6, RETURNED.z], [0.5, 1.2, 1.8], TOKENS.meokSoft);
  add([RETURNED.x + 0.05, 1.22, RETURNED.z], [0.6, 0.06, 1.9], TOKENS.meok);

  // 기다리는 노래 자리(입구 쪽 낮은 받침)
  add([-1.6, 0.2, 4.4], [1.0, 0.4, 0.6], TOKENS.hanjiDeep);
  return out;
}

// 먹안개 무늬(가운데가 짙고 가장자리가 흐린 둥근 얼룩)
function fogCanvas() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 32, 4, 64, 32, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.scale(1, 0.5);
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  return c;
}

// '아아' 문의 표지: 글자가 아닌 무늬. 둥근 테 안에 벌어진 입 모양 호와, 위로 퍼지는 짧은 획 셋.
export function drawAaSign(g, size, color) {
  const s = size / 100;
  g.save();
  g.scale(s, s);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = 'round';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(50, 54, 38, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(50, 50, 18, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
  for (const a of [-0.55, 0, 0.55]) {
    const x = 50 + Math.sin(a) * 6;
    const y = 36 - Math.cos(a) * 6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(50 + Math.sin(a) * 22, 36 - Math.cos(a) * 22);
    g.stroke();
  }
  g.beginPath();
  g.arc(50, 76, 4.5, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function signCanvas() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  drawAaSign(c.getContext('2d'), 128, '#ffffff');
  return c;
}

// ── 이름표 아틀라스: 칸 하나에 이름표 하나. 글이 없으면 투명하게 비운다. ──
const CELL = { w: 256, h: 64 };
const LABEL = { shelf: 0, bonus: 3, basket: 6, returned: 8, room: 9, floor: 10 };
const LABEL_COUNT = 13;

function labelQuads() {
  const q = [];
  // 칸 노래 이름(묶인 뒤에만): 서가 자리 받침 아래
  FLOORS.forEach((_, f) => q.push({ x: nicheX(f), y: nicheY(f) - 0.2, z: NICHE_Z + 0.31, w: 0.9, h: 0.22 }));
  BONUS_X.forEach((x) => q.push({ x, y: BONUS.top - 0.16, z: BONUS.z + 0.36, w: 0.92, h: 0.23 }));
  [-0.3, 0.3].forEach((dx) => q.push({ x: BASKET.x + dx, y: 1.05, z: BASKET.z + 0.1, w: 0.62, h: 0.16 }));
  q.push({ x: RETURNED.x + 0.4, y: 1.52, z: RETURNED.z + 0.2, w: 1.1, h: 0.28 });
  q.push({ x: ROOM_DOOR.x, y: 2.82, z: BACK_Z + 0.32, w: 1.25, h: 0.31 });
  FLOORS.forEach((_, f) => q.push({ x: nicheX(f), y: 0.44, z: -0.91, w: 0.74, h: 0.185 }));
  return q;
}

function labelGeometry(THREE) {
  const pos = [];
  const uv = [];
  const idx = [];
  labelQuads().forEach((r, i) => {
    const v0 = 1 - (i + 1) / LABEL_COUNT;
    const v1 = 1 - i / LABEL_COUNT;
    const b = pos.length / 3;
    pos.push(r.x - r.w / 2, r.y - r.h / 2, r.z, r.x + r.w / 2, r.y - r.h / 2, r.z, r.x + r.w / 2, r.y + r.h / 2, r.z, r.x - r.w / 2, r.y + r.h / 2, r.z);
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

function drawLabels(canvas, texts) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  const family = getComputedStyle(document.body).fontFamily || 'serif';
  texts.forEach((t, i) => {
    if (!t) return;
    const y = i * CELL.h;
    g.fillStyle = TOKENS.meok;
    g.fillRect(0, y, CELL.w, CELL.h);
    g.fillStyle = TOKENS.hanji;
    g.fillRect(5, y + 5, CELL.w - 10, CELL.h - 10);
    g.fillStyle = TOKENS.meok;
    let size = 34;
    g.font = `bold ${size}px ${family}`;
    while (g.measureText(t).width > CELL.w - 24 && size > 14) { size -= 2; g.font = `bold ${size}px ${family}`; }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, CELL.w / 2, y + CELL.h / 2 + 2);
  });
}

export function create3D(ctx) {
  const { THREE, root, wing } = ctx;
  const wingId = wing?.id ?? 'hyangga';
  const rm = () => !!ctx.reduceMotion?.();
  const { state, apply } = createHyanggaState({ restored: !!ctx.restored });
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // 정적 구조(재질 무늬가 오면 입힌다. 없으면 자리표시로 색만 쓴다)
  const staticMat = keep(new THREE.MeshLambertMaterial());
  const tex = ctx.assets?.texture?.('texture/' + wingId) ?? null;
  if (tex) staticMat.map = tex;
  const sList = staticBoxes();
  const sMesh = instanced(THREE, staticMat, sList.length);
  sMesh.name = 'hyangga-structure';
  keep(sMesh.geometry);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  sList.forEach((b, i) => {
    q.setFromEuler(e.set(0, b.r, 0));
    m4.compose(v.set(...b.p), q, sc.set(...b.s));
    sMesh.setMatrixAt(i, m4);
  });
  sMesh.instanceMatrix.needsUpdate = true;
  sMesh.computeBoundingSphere();
  root.add(sMesh);

  // 탑의 칸 불: 칸마다 앞면 창호 한 장(구를 셀 때 차오른다). 빛이라 조명의 영향을 받지 않는 재질.
  const bayMat = keep(new THREE.MeshBasicMaterial());
  const bays = instanced(THREE, bayMat, TOTAL_BAYS);
  bays.name = 'hyangga-bays';
  keep(bays.geometry);
  const bayList = [];
  FLOORS.forEach((n, f) => {
    for (let b = 0; b < n; b++) {
      const bw = bayWidth(f);
      bayList.push({ f, b });
      m4.compose(v.set(bayX(f, b), floorBase(f) + TOWER.floorH * 0.5, TOWER.front - 0.26), q.identity(), sc.set(bw * 0.78, TOWER.floorH * 0.62, 0.04));
      bays.setMatrixAt(bayIndex(f, b), m4);
    }
  });
  bays.instanceMatrix.needsUpdate = true;
  bays.computeBoundingSphere();
  root.add(bays);

  // 책, 금박, 묶는 실, 작품 방 문짝, 바구니 두루마리, 돌아온 노래들
  const dynMat = keep(new THREE.MeshLambertMaterial());
  const DYN_CAP = 128;
  const dyn = instanced(THREE, dynMat, DYN_CAP);
  dyn.name = 'hyangga-books';
  keep(dyn.geometry);
  dyn.frustumCulled = false;
  root.add(dyn);

  // 먹안개
  const fogTex = keep(new THREE.CanvasTexture(fogCanvas()));
  fogTex.colorSpace = THREE.SRGBColorSpace;
  const fogMat = keep(new THREE.MeshBasicMaterial({ map: fogTex, color: TOKENS.meokFog, transparent: true, depthWrite: false, opacity: state.fog ? 0.6 : 0 }));
  const fogGeo = keep(new THREE.PlaneGeometry(1, 1));
  const FOG = [[-3.6, 0.6, -0.4, 3.4, 1.4], [-0.6, 0.8, -0.6, 3.2, 1.6], [-5.2, 1.4, -3, 2.6, 1.6], [0.8, 1.6, -3.6, 3, 1.5],
    [-2.4, 2.6, -1.4, 3.6, 1.5], [-2, 4.1, -1.8, 4.2, 1.6], [3.4, 0.9, -1.2, 3, 1.3], [-4.4, 0.7, 2.2, 2.6, 1.1]];
  const fog = new THREE.InstancedMesh(fogGeo, fogMat, FOG.length);
  fog.name = 'hyangga-fog';
  FOG.forEach(([x, y, z, w, h], i) => { m4.compose(v.set(x, y, z), q.identity(), sc.set(w, h, 1)); fog.setMatrixAt(i, m4); });
  fog.instanceMatrix.needsUpdate = true;
  fog.computeBoundingSphere();
  fog.renderOrder = 2;
  fog.visible = state.fog;
  root.add(fog);

  // '아아' 문: 10구 층 마지막 두 칸(8·9칸) 앞. 왼쪽 경첩을 축으로 앞쪽(카메라 쪽)으로 열린다.
  const doorPivot = new THREE.Group();
  doorPivot.name = 'hyangga-aa-door';
  doorPivot.position.set(DOOR_HINGE_X, floorBase(2) + 0.02, TOWER.front + 0.06);
  const doorH = TOWER.floorH - 0.26;
  const doorMat = keep(new THREE.MeshLambertMaterial());
  const doorGeo = keep(new THREE.BoxGeometry(DOOR_W - 0.04, doorH, 0.07));
  const doorLeaf = new THREE.Mesh(doorGeo, doorMat);
  doorLeaf.position.set(DOOR_W / 2, doorH / 2, 0);
  const signTex = keep(new THREE.CanvasTexture(signCanvas()));
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signMat = keep(new THREE.MeshBasicMaterial({ map: signTex, transparent: true, alphaTest: 0.2 }));
  const signGeo = keep(new THREE.PlaneGeometry(0.62, 0.62));
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(DOOR_W / 2, doorH * 0.55, 0.045);
  doorPivot.add(doorLeaf, sign);
  root.add(doorPivot);

  // 이름표
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = CELL.w;
  labelCanvas.height = CELL.h * LABEL_COUNT;
  const labelTex = keep(new THREE.CanvasTexture(labelCanvas));
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const labelMat = keep(new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, alphaTest: 0.2 }));
  const labelGeo = keep(labelGeometry(THREE));
  const labels = new THREE.Mesh(labelGeo, labelMat);
  labels.name = 'hyangga-labels';
  root.add(labels);

  // ── 움직임 상태 ──
  const anim = {
    level: -1,
    door: 0,              // 문이 열린 정도 0~1
    doorShake: 0,
    room: state.roomOpen ? 1 : 0,
    fog: state.fog ? 1 : 0,
    pop: { shelf: [0, 0, 0], bonus: [0, 0, 0], basket: [0, 0] },
    pulses: [],           // { bay, strength, life }
  };
  let bayDirty = true;
  let dynDirty = true;
  let labelsDirty = true;
  const PULSE_TIME = 0.6;

  function labelTexts() {
    const t = Array(LABEL_COUNT).fill('');
    (state.bound.shelf ?? []).forEach((id, i) => { t[LABEL.shelf + i] = songTitle(id); });
    (state.bound.bonus ?? []).forEach((id, i) => { t[LABEL.bonus + i] = songTitle(id); });
    state.basket.forEach((s, i) => { if (s?.to && !s.popped) t[LABEL.basket + i] = WING_NAMES[s.to] ?? ''; });
    t[LABEL.returned] = '돌아온 노래';
    t[LABEL.room] = roomTitle();
    FLOORS.forEach((n, f) => { t[LABEL.floor + f] = n + '구 층'; });
    return t;
  }

  function paintStatic(level) {
    sList.forEach((b, i) => sMesh.setColorAt(i, col.set(dancheongColor(b.c, level))));
    sMesh.instanceColor.needsUpdate = true;
    doorMat.color.set(dancheongColor(TOKENS.meokSoft, level));
  }

  function paintBays(level) {
    const lit = litPerFloor(state.fill);
    const dark = dancheongColor(TOKENS.meok, level);
    const glow = mixHex(TOKENS.hanji, TOKENS.gold, 0.35);
    const pulse = new Map();
    for (const p of anim.pulses) {
      const k = rm() ? p.strength : p.strength * (p.life / PULSE_TIME);
      pulse.set(p.bay, Math.max(pulse.get(p.bay) ?? 0, k));
    }
    bayList.forEach(({ f, b }) => {
      const i = bayIndex(f, b);
      let c = b < lit[f] ? mixHex(dark, glow, 0.85) : dark;
      // 문이 열려 감탄사가 드러나면 문 뒤 두 칸이 밝게 빛난다.
      if (f === FLOORS.length - 1 && DOOR_BAYS.includes(b) && state.door === 'open') c = mixHex(dark, TOKENS.hanji, anim.door);
      const k = pulse.get(i);
      if (k) c = mixHex(c, TOKENS.gold, Math.min(1, k));
      bays.setColorAt(i, col.set(c));
    });
    bays.instanceColor.needsUpdate = true;
    signMat.color.set(state.door === 'absent' ? TOKENS.meokFog : dancheongColor(TOKENS.juhong, level));
  }

  // 책과 그 밖의 움직이는 상자를 다시 늘어놓는다.
  function layoutDynamic(level) {
    let n = 0;
    const put = (x, y, z, w, h, d, c, ry = 0, rz = 0) => {
      if (n >= DYN_CAP) return;
      q.setFromEuler(e.set(0, ry, rz));
      m4.compose(v.set(x, y, z), q, sc.set(w, h, d));
      dyn.setMatrixAt(n, m4);
      dyn.setColorAt(n, col.set(dancheongColor(c, level)));
      n++;
    };
    // 한 자리의 책: 비었으면 제목 없는 빈 책등, 꽂혔으면 책, 삐져나오면 갈래 모양
    const book = (area, i, base, bound, floorSize) => {
      const s = state[area][i];
      if (!s) {
        put(base.x, base.y + BOOK.h * 0.48, base.z - 0.06, BOOK.w * 0.55, BOOK.h * 0.96, BOOK.d * 0.8, TOKENS.hanjiDeep);
        return;
      }
      if (s.popped) {
        const t = ease(anim.pop[area][i]);
        const H = area === 'shelf' ? BOOK.h * 1.15 : BOOK.h;
        // 카메라에서 잘 보이게 왼쪽 앞으로 비스듬히 빠져나온다(문과 겹치지 않게 왼쪽).
        for (const seg of popShape(s.popped, s.songId, floorSize)) {
          const L = t * (seg.z + seg.d / 2) * BOOK.d;
          put(base.x + POP_DIR.x * L, base.y + (seg.y + seg.h / 2) * H, base.z + POP_DIR.z * L,
            seg.w * BOOK.w, seg.h * H, Math.max(0.02, seg.d * BOOK.d * (0.35 + 0.65 * t)), TOKENS.meokSoft, POP_ANGLE);
          if (seg.ring) {
            const R = t * seg.z * BOOK.d - 0.05;
            put(base.x + POP_DIR.x * R, base.y + (seg.y + seg.h / 2) * H, base.z + POP_DIR.z * R, BOOK.w * 0.4, 0.05, 0.12, TOKENS.gold, POP_ANGLE);
          }
        }
        return;
      }
      put(base.x, base.y + BOOK.h / 2, base.z, BOOK.w, BOOK.h, BOOK.d, TOKENS.meokSoft);
      put(base.x + BOOK.w * 0.51, base.y + BOOK.h / 2, base.z + BOOK.d * 0.5, 0.012, BOOK.h * 0.9, 0.04, TOKENS.hanji);
      if (bound) {
        put(base.x, base.y + BOOK.h * 0.72, base.z, BOOK.w * 1.08, 0.06, BOOK.d * 1.06, TOKENS.gold);
        put(base.x, base.y + BOOK.h * 0.28, base.z, BOOK.w * 1.08, 0.06, BOOK.d * 1.06, TOKENS.gold);
      }
    };
    FLOORS.forEach((size, f) => book('shelf', f, { x: nicheX(f), y: nicheY(f), z: NICHE_Z }, !!state.bound.shelf, size));
    BONUS_X.forEach((x, i) => book('bonus', i, { x, y: BONUS.top, z: BONUS.z + 0.05 }, !!state.bound.bonus, 10));
    // 탑이 묶이면 세 자리를 금빛 실이 잇는다.
    if (state.bound.shelf) {
      for (let f = 0; f < FLOORS.length - 1; f++) {
        const a = { x: nicheX(f), y: nicheY(f) + BOOK.h * 0.5 };
        const b = { x: nicheX(f + 1), y: nicheY(f + 1) + BOOK.h * 0.5 };
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        put((a.x + b.x) / 2, (a.y + b.y) / 2, NICHE_Z + BOOK.d * 0.56, 0.035, len, 0.035, TOKENS.gold, 0, -Math.atan2(b.x - a.x, b.y - a.y));
      }
    }
    // 바구니의 두루마리 둘
    [-0.3, 0.3].forEach((dx, i) => {
      const s = state.basket[i];
      if (!s) return;
      const bx = BASKET.x + dx;
      if (s.popped) {
        const t = ease(anim.pop.basket[i]);
        for (const seg of popShape(s.popped, s.songId, 10)) {
          put(bx, 0.55 + t * 0.3 + (seg.y + seg.h / 2) * 0.4, BASKET.z + t * (seg.z + seg.d / 2) * 0.35, 0.16, seg.h * 0.4, Math.max(0.02, seg.d * 0.35), TOKENS.meokSoft);
        }
        return;
      }
      put(bx, 0.56, BASKET.z, 0.5, 0.17, 0.17, TOKENS.hanji);
      put(bx, 0.56, BASKET.z, 0.08, 0.2, 0.2, TOKENS.meokSoft);
      if (s.to) put(bx, 0.78, BASKET.z + 0.1, 0.02, 0.36, 0.02, TOKENS.meokSoft);   // 행선지 표 끈
    });
    // 돌아온 노래 선반의 빈 책등(장식)
    for (let i = 0; i < 4; i++) put(RETURNED.x + 0.05, 1.45, RETURNED.z - 0.6 + i * 0.4, 0.36, 0.4, 0.14, TOKENS.hanjiDeep);
    // 작품 방 문짝: 칸이 묶이면 안쪽으로 열린다.
    const ra = ease(anim.room) * 1.6;
    const hinge = ROOM_DOOR.x - ROOM_DOOR.w / 2;
    put(hinge + Math.cos(ra) * ROOM_DOOR.w / 2, ROOM_DOOR.h / 2, BACK_Z - Math.sin(ra) * ROOM_DOOR.w / 2, ROOM_DOOR.w - 0.05, ROOM_DOOR.h, 0.08, TOKENS.meok, ra);
    dyn.count = n;
    dyn.instanceMatrix.needsUpdate = true;
    dyn.instanceColor.needsUpdate = true;
  }

  function refresh(force = false) {
    const level = getDancheong(wingId);
    if (force || level !== anim.level) {
      anim.level = level;
      paintStatic(level);
      bayDirty = true;
      dynDirty = true;
    }
    if (bayDirty) { paintBays(level); bayDirty = false; }
    if (dynDirty) { layoutDynamic(level); dynDirty = false; }
    if (labelsDirty) { drawLabels(labelCanvas, labelTexts()); labelTex.needsUpdate = true; labelsDirty = false; }
  }

  function snapAll() {
    anim.door = state.door === 'open' ? 1 : 0;
    anim.room = state.roomOpen ? 1 : 0;
    anim.fog = state.fog ? 1 : 0;
    for (const a of ['shelf', 'bonus', 'basket']) anim.pop[a] = anim.pop[a].map((_, i) => (state[a][i]?.popped ? 1 : 0));
  }

  function setDoorPose() {
    const shake = anim.doorShake > 0 && !rm() ? Math.sin(anim.doorShake * 40) * 0.04 * anim.doorShake : 0;
    doorPivot.rotation.y = -1.75 * ease(anim.door) + shake;
  }

  refresh(true);
  setDoorPose();

  function react(name, detail) {
    const change = apply(name, detail);
    if (!change) return;
    if (change.pulse) {
      for (const p of state.pulses.splice(0)) anim.pulses.push({ ...p, life: PULSE_TIME });
      bayDirty = true;
    }
    if (change.fill || change.door) bayDirty = true;
    if (change.door && state.door === 'absent') anim.doorShake = 0.6;
    if (change.slots) { dynDirty = true; labelsDirty = true; }
    if (change.pop) anim.pop[change.pop.area][change.pop.index] = 0;
    if (change.slots) for (const a of ['shelf', 'bonus', 'basket']) state[a].forEach((s, i) => { if (!s?.popped) anim.pop[a][i] = 0; });
    if (rm()) snapAll();
    refresh();
    setDoorPose();
    fogMat.opacity = 0.6 * anim.fog;
    fog.visible = anim.fog > 0.001;
  }

  function step(cur, target, dt, speed) {
    if (rm()) return target;
    if (cur < target) return Math.min(target, cur + dt * speed);
    return Math.max(target, cur - dt * speed);
  }

  function update(dt) {
    const doorT = state.door === 'open' ? 1 : 0;
    if (anim.door !== doorT) { anim.door = step(anim.door, doorT, dt, 1.6); bayDirty = true; }
    if (anim.doorShake > 0) anim.doorShake = rm() ? 0 : Math.max(0, anim.doorShake - dt);
    const roomT = state.roomOpen ? 1 : 0;
    if (anim.room !== roomT) { anim.room = step(anim.room, roomT, dt, 1.2); dynDirty = true; }
    const fogT = state.fog ? 1 : 0;
    if (anim.fog !== fogT) {
      anim.fog = step(anim.fog, fogT, dt, 0.5);
      fogMat.opacity = 0.6 * anim.fog;
      fog.visible = anim.fog > 0.001;
    }
    for (const a of ['shelf', 'bonus', 'basket']) {
      anim.pop[a].forEach((p, i) => {
        const t = state[a][i]?.popped ? 1 : 0;
        if (p !== t) { anim.pop[a][i] = step(p, t, dt, 2.2); dynDirty = true; }
      });
    }
    if (anim.pulses.length) {
      for (const p of anim.pulses) p.life -= dt;
      anim.pulses = anim.pulses.filter((p) => p.life > 0);
      bayDirty = true;
    }
    refresh();
    setDoorPose();
  }

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const anchors = {
    // 서가 자리: 층 이름 비석 앞에 선다(4·8·10구 층 순).
    slots: FLOORS.map((_, f) => V(nicheX(f), 0, -0.3)),
    bonus: BONUS_X.map((x) => V(x, 0, BONUS.z + 1.25)),
    basket: V(BASKET.x, 0, BASKET.z + 0.9),
    returnedShelf: V(RETURNED.x + 0.9, 0, RETURNED.z),
    roomDoor: V(ROOM_DOOR.x, 0, BACK_Z + 1.1),
    entrance: V(-1.6, 0, 3.6),
    nextDoor: V(5.6, 0, NEXT_DOOR.z),
    // 떠도는 노래 다섯(칸 노래 셋, 길 잃은 노래 둘)이 떠 있는 자리. y는 떠 있는 높이, 학생은 그 아래 땅(x, z)에 선다.
    floating: [V(1.0, 1.7, -0.6), V(2.6, 2.1, -1.8), V(4.4, 1.8, -0.4), V(0.2, 2.2, 1.4), V(3.7, 2.4, 1.0)],
    camera: { position: V(0, 9.9, 10.5), target: V(0, 2.9, -1.0) },
  };

  return {
    anchors,
    // 재기 화면 왼쪽 반이 비출 곳(탑 가운데)
    focus: V(TOWER.x0 + TOWER.width / 2, 2.6, TOWER.front),
    react,
    update,
    // 점검용 상태 요약. doorCenter는 '아아' 문 가운데(root 기준)다.
    info: () => ({
      ...snapshot(state), doorOpen: anim.door, doorAngle: doorPivot.rotation.y, fogOpacity: fogMat.opacity, books: dyn.count, level: anim.level,
      doorCenter: { x: DOOR_HINGE_X + DOOR_W / 2, y: floorBase(2) + doorH / 2, z: TOWER.front },
    }),
    dispose() {
      root.remove(sMesh, bays, dyn, fog, doorPivot, labels);
      for (const d of disposables) d.dispose?.();
      [sMesh, bays, dyn, fog].forEach((m) => m.dispose?.());
    },
  };
}

export function create2D(ctx) {
  return createBoard(ctx);
}
