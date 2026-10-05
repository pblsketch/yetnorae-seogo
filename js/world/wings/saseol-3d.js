// 사설시조관 3D 모형(spec 3.1·6·14). 저폴리 상자를 코드로 조립하고, 되풀이되는 것은 InstancedMesh 하나로 그린다.
// 시조 정자의 가운데 층(중장)이 엿가락처럼 늘어나 오른쪽 벽을 뚫고 장터 가게 지붕 위까지 늘어진다.
// '연타로 풀기'(diorama:unroll)를 하면 그 늘어난 층 앞면을 따라 두루마리가 길게 풀린다.
// 그리기 호출은 열다섯 안팎이다(예산 60). 그림자는 쓰지 않는다.
import { SONG_CATALOG } from '../../data/song-table.js';
import { TOKENS, dancheongColor, getDancheong, mixHex } from '../palette.js';
import {
  AREAS, LANTERN_COUNT, STAIR_STEPS, createModel, lanternStorey, taffy, unrollReach,
} from './saseol-model.js';

// ── 배치(1 = 1m, 관 바닥 가운데가 원점, +z가 카메라 쪽) ──
const MID = { x0: -5.1, seam: -1.7, x1: 10.8, zc: -3.6, yc: 2.55, half: 0.6, hd: 1.3 };
const PILLAR_X = [0, 1, 2, 3].map((i) => -5.0 + i * (3.2 / 3));
const FRONT_Z = -2.45;
const BACK_Z = -4.75;
const SHELF = { x: -3.4, z: -1.9 };
const BONUS = { x: 3.6, z: -1.0 };
const SLOT_DX = 0.68;
const BASKET = { x: -4.0, z: 3.0 };
const BASKET_DX = 0.27;
const SCROLL = { x0: -4.95, x1: MID.x1 - 0.2 };
const BOOK = { w: 0.42, h: 1.0, d: 0.36, y0: 0.14 };
const POP_SEGS = 10;
const POP_UNIT_H = 0.33;

// 늘어난 층의 x 자리에서의 생김새
function midAt(x) {
  const s = x <= MID.seam ? 0 : (x - MID.seam) / (MID.x1 - MID.seam);
  const t = taffy(s);
  return { s, yc: MID.yc - 0.75 * t.sag - 0.55 * t.drop, hh: MID.half * t.thick, hd: MID.hd * (0.55 + 0.45 * t.thick) };
}

// 풀린 음보 수 → 두루마리 끝의 x
export function scrollEndX(feet) {
  const r = unrollReach(feet);
  return SCROLL.x0 + r.within * (MID.seam - SCROLL.x0) + r.beyond * (SCROLL.x1 - MID.seam);
}

const slotX = (area, i) => (area === 'shelf' ? SHELF.x : area === 'bonus' ? BONUS.x : BASKET.x) + (area === 'basket' ? (i - 0.5) * 2 * BASKET_DX : (i - 1) * SLOT_DX);
const shelfZ = (area) => (area === 'shelf' ? SHELF.z : BONUS.z);

// ── 정적인 상자 목록 ──
function shelfBoxes(cx, cz, out) {
  const wood = TOKENS.meokSoft;
  out.push({ p: [cx, 0.75, cz - 0.23], s: [2.1, 1.5, 0.04], c: wood });
  out.push({ p: [cx - 1.03, 0.75, cz], s: [0.06, 1.5, 0.5], c: wood });
  out.push({ p: [cx + 1.03, 0.75, cz], s: [0.06, 1.5, 0.5], c: wood });
  out.push({ p: [cx - SLOT_DX / 2, 0.75, cz], s: [0.04, 1.3, 0.48], c: wood });
  out.push({ p: [cx + SLOT_DX / 2, 0.75, cz], s: [0.04, 1.3, 0.48], c: wood });
  out.push({ p: [cx, 0.07, cz], s: [2.1, 0.14, 0.5], c: wood });
  out.push({ p: [cx, 1.47, cz], s: [2.12, 0.06, 0.52], c: wood });
}

function gate(x, z0, z1, leaf, out) {
  const zc = (z0 + z1) / 2;
  out.push({ p: [x, 1.2, z0], s: [0.22, 2.4, 0.22], c: TOKENS.juhong });
  out.push({ p: [x, 1.2, z1], s: [0.22, 2.4, 0.22], c: TOKENS.juhong });
  out.push({ p: [x, 2.45, zc], s: [0.3, 0.25, z1 - z0 + 0.3], c: TOKENS.nokcheong });
  out.push({ p: [x + 0.05, 1.05, zc], s: [0.06, 2.1, z1 - z0 - 0.25], c: leaf });
}

function stall(x, z, h, out) {
  const wood = mixHex(TOKENS.meokSoft, TOKENS.hanjiDeep, 0.3);
  for (const dx of [-0.75, 0.75]) for (const dz of [-0.45, 0.45]) out.push({ p: [x + dx, h / 2, z + dz], s: [0.1, h, 0.1], c: wood });
  out.push({ p: [x, 0.42, z], s: [1.5, 0.08, 0.95], c: TOKENS.hanjiDeep });
  out.push({ p: [x, 0.2, z], s: [1.3, 0.4, 0.8], c: wood });
  // 좌판의 물건(게젓 항아리, 꾸러미 따위를 닮은 작은 상자)
  [TOKENS.juhong, TOKENS.gold, TOKENS.nokcheong].forEach((c, i) => out.push({ p: [x - 0.45 + i * 0.45, 0.58, z + 0.1], s: [0.26, 0.24, 0.26], c }));
}

function person(x, z, c, out) {
  out.push({ p: [x, 0.5, z], s: [0.42, 1.0, 0.3], c });
  out.push({ p: [x, 1.17, z], s: [0.28, 0.3, 0.28], c: TOKENS.hanjiDeep });
  out.push({ p: [x, 1.35, z], s: [0.52, 0.04, 0.52], c: TOKENS.meok });
}

function staticBoxes() {
  const out = [];
  const keys = {};
  const wall = mixHex(TOKENS.hanji, TOKENS.meokFog, 0.22);
  const stone = mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.5);
  // 바닥, 장터 바닥(벽 너머)
  out.push({ p: [0, -0.04, 0], s: [13, 0.08, 13], c: TOKENS.hanjiDeep });
  out.push({ p: [10.1, -0.035, -2.9], s: [7.2, 0.07, 7.6], c: mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.35) });
  // 벽: 뒤, 왼쪽(작품 방 문 자리 비움), 오른쪽(늘어난 층이 뚫고 나간 자리와 다음 관 문 자리 비움)
  out.push({ p: [0, 0.8, -6.45], s: [13, 1.6, 0.15], c: wall });
  out.push({ p: [-6.45, 1.1, -3.15], s: [0.15, 2.2, 6.7], c: wall });
  out.push({ p: [-6.45, 1.1, 4.15], s: [0.15, 2.2, 4.7], c: wall });
  out.push({ p: [6.45, 1.1, -5.65], s: [0.15, 2.2, 1.7], c: wall });
  out.push({ p: [6.45, 0.3, -3.6], s: [0.15, 0.6, 2.4], c: wall });
  out.push({ p: [6.45, 1.1, -0.8], s: [0.15, 2.2, 3.2], c: wall });
  out.push({ p: [6.45, 1.1, 4.45], s: [0.15, 2.2, 4.1], c: wall });
  // 뚫린 벽의 부스러기
  [[6.5, 0.7, -4.5, 0.35], [6.7, 0.18, -2.7, 0.3], [6.3, 0.75, -2.65, 0.25], [6.9, 0.12, -3.9, 0.22]].forEach(([x, y, z, k]) => out.push({ p: [x, y, z], s: [k, k * 0.7, k], c: wall }));
  // 정자: 기단, 초장 층 기둥과 인방, 난간, 층 사이 마루
  out.push({ p: [-3.4, 0.15, MID.zc], s: [3.8, 0.3, 3.0], c: stone });
  for (const x of PILLAR_X) {
    out.push({ p: [x, 1.05, FRONT_Z], s: [0.18, 1.5, 0.18], c: TOKENS.juhong });
    out.push({ p: [x, 1.05, BACK_Z], s: [0.18, 1.5, 0.18], c: TOKENS.juhong });
    out.push({ p: [x, 3.87, FRONT_Z], s: [0.16, 1.06, 0.16], c: TOKENS.juhong });
    out.push({ p: [x, 3.87, BACK_Z], s: [0.16, 1.06, 0.16], c: TOKENS.juhong });
  }
  for (const z of [FRONT_Z, BACK_Z]) {
    out.push({ p: [-3.4, 1.72, z], s: [3.4, 0.14, 0.2], c: TOKENS.nokcheong });
    out.push({ p: [-3.4, 4.36, z], s: [3.4, 0.12, 0.18], c: TOKENS.nokcheong });
  }
  out.push({ p: [-3.4, 0.6, FRONT_Z], s: [3.2, 0.06, 0.06], c: TOKENS.meokSoft });
  out.push({ p: [-3.4, 1.88, MID.zc], s: [3.8, 0.16, 2.9], c: TOKENS.meokSoft });
  // 종장으로 오르는 첫 계단 세 칸(정자 왼쪽 바깥)과 받침 기둥
  out.push({ p: [-5.5, 1.3, -3.2], s: [0.12, 2.6, 0.12], c: TOKENS.meokSoft });
  for (let k = 0; k < STAIR_STEPS; k++) {
    keys['stair' + k] = out.length;
    out.push({ p: [-5.5, 2.25 + 0.45 * k, -2.7 - k * 0.5], s: [0.7, 0.2, 0.55], c: TOKENS.meokSoft });
  }
  // 시조라면 여기서 끝났을 자리(4음보 경계): 늘어난 층을 감는 금빛 띠
  out.push({ p: [MID.seam, MID.yc, MID.zc], s: [0.14, 1.35, 2.75], c: TOKENS.gold });
  // 늘어난 층을 받치는 가는 기둥(관 안)과 장터 가게(층 끝이 얹힌 가게 포함)
  for (let k = 0; k < 8; k++) {
    const x = -0.8 + k * 0.95;
    if (x > 6.2) break;
    const m = midAt(x);
    const h = m.yc - m.hh;
    out.push({ p: [x, h / 2, MID.zc + m.hd - 0.15], s: [0.12, h, 0.12], c: TOKENS.juhong });
    out.push({ p: [x, h / 2, MID.zc - m.hd + 0.15], s: [0.12, h, 0.12], c: TOKENS.juhong });
  }
  const endM = midAt(MID.x1 - 0.4);
  stall(10.2, MID.zc, endM.yc - endM.hh, out);
  stall(8.6, -0.6, 1.7, out);
  stall(12.1, -1.4, 1.7, out);
  stall(8.5, -5.7, 1.7, out);
  // 장터 사람들(낮은 상자 인형), 장터 팻말 기둥
  person(7.6, 0.4, TOKENS.meokSoft, out);
  person(9.7, -1.6, mixHex(TOKENS.meokSoft, TOKENS.nokcheong, 0.5), out);
  person(11.3, 0.3, mixHex(TOKENS.meokSoft, TOKENS.juhong, 0.4), out);
  person(10.6, -5.9, TOKENS.meokSoft, out);
  person(12.6, -3.3, mixHex(TOKENS.meokSoft, TOKENS.gold, 0.4), out);
  out.push({ p: [7.2, 1.3, 0.4], s: [0.1, 2.6, 0.1], c: TOKENS.meokSoft });
  // 칸(서가)과 덤 칸
  shelfBoxes(SHELF.x, SHELF.z, out);
  shelfBoxes(BONUS.x, BONUS.z, out);
  // 바구니(두 자리)
  out.push({ p: [BASKET.x, 0.18, BASKET.z], s: [1.1, 0.36, 0.6], c: mixHex(TOKENS.hanjiDeep, TOKENS.gold, 0.35) });
  out.push({ p: [BASKET.x, 0.3, BASKET.z], s: [0.04, 0.22, 0.56], c: TOKENS.meokSoft });
  // 돌아온 노래 선반
  out.push({ p: [4.4, 0.45, 2.6], s: [1.3, 0.9, 0.4], c: TOKENS.meokSoft });
  out.push({ p: [4.4, 0.92, 2.6], s: [1.4, 0.05, 0.46], c: TOKENS.meokSoft });
  out.push({ p: [4.4, 0.47, 2.81], s: [1.2, 0.04, 0.02], c: TOKENS.hanjiDeep });
  // 작품 방 문(왼쪽 벽), 다음 관 문(오른쪽 벽)
  gate(-6.4, 0.2, 1.8, TOKENS.meokSoft, out);
  gate(6.4, 0.8, 2.4, TOKENS.meok, out);
  // 미리 잰 노래가 기다리는 서안
  out.push({ p: [1.6, 0.35, 4.7], s: [0.9, 0.7, 0.45], c: TOKENS.meokSoft });
  out.push({ p: [1.6, 0.72, 4.7], s: [1.1, 0.06, 0.55], c: TOKENS.meokSoft });
  return { list: out, keys };
}

// 지붕(네모뿔): 정자 지붕, 장터 차양
function roofList() {
  return [
    { p: [-3.4, 5.0, MID.zc], hw: 2.4, h: 1.1, hd: 2.0, c: TOKENS.meok },
    { p: [8.6, 2.0, -0.6], hw: 1.05, h: 0.6, hd: 0.75, c: TOKENS.juhong },
    { p: [12.1, 2.0, -1.4], hw: 1.05, h: 0.6, hd: 0.75, c: TOKENS.nokcheong },
    { p: [8.5, 2.0, -5.7], hw: 1.05, h: 0.6, hd: 0.75, c: TOKENS.gold },
  ];
}

// 등불 자리: 초장 층 기둥 넷, 가운데 층(정자 안 넷 + 늘어난 쪽 열둘), 종장 층 기둥 넷
function lanternPositions() {
  const out = [];
  for (const x of PILLAR_X) out.push([x, 1.5, FRONT_Z + 0.16]);
  for (let i = 0; i < 4; i++) {
    const x = -4.75 + i * 0.95;
    const m = midAt(x);
    out.push([x, m.yc + m.hh - 0.14, MID.zc + m.hd + 0.08]);
  }
  for (let k = 0; k < 12; k++) {
    const x = -1.0 + k * (11.0 / 11);
    const m = midAt(x);
    out.push([x, m.yc + m.hh - 0.1, MID.zc + m.hd + 0.08]);
  }
  for (const x of PILLAR_X) out.push([x, 4.15, FRONT_Z + 0.14]);
  return out;
}

// ── 그림(캔버스 무늬) ──
function canvasTex(THREE, canvas, repeatX = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeatX !== 1) { t.wrapS = THREE.RepeatWrapping; t.repeat.set(repeatX, 1); }
  return t;
}

function grainCanvas() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(90,86,80,0.18)';
  for (let y = 4; y < 64; y += 9) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(20, y + 3, 40, y - 3, 64, y); g.stroke(); }
  return c;
}

function latticeCanvas() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = 'rgba(43,43,43,0.55)';
  g.lineWidth = 3;
  g.strokeRect(8, 10, 112, 44);
  g.lineWidth = 1.5;
  for (let x = 22; x < 120; x += 14) { g.beginPath(); g.moveTo(x, 10); g.lineTo(x, 54); g.stroke(); }
  for (let y = 21; y < 54; y += 11) { g.beginPath(); g.moveTo(8, y); g.lineTo(120, y); g.stroke(); }
  return c;
}

// 두루마리 무늬: 한지 바탕에 먹 글줄, 음보 경계마다 가는 금, 4음보 자리에 붉은 금
function scrollCanvas() {
  const W = 2048;
  const c = document.createElement('canvas');
  c.width = W; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = TOKENS.hanji;
  g.fillRect(0, 0, W, 64);
  g.fillStyle = 'rgba(43,43,43,0.75)';
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let x = 6; x < W - 4; x += 9) {
    const h = 16 + rnd() * 26;
    g.fillRect(x, 32 - h / 2, 3, h);
  }
  const u = (x) => ((x - SCROLL.x0) / (SCROLL.x1 - SCROLL.x0)) * W;
  g.fillStyle = TOKENS.meok;
  for (let f = 1; f <= 60; f++) g.fillRect(u(scrollEndX(f)) - 1, 0, 2, 64);
  g.fillStyle = TOKENS.juhong;
  g.fillRect(u(scrollEndX(4)) - 3, 0, 6, 64);
  return c;
}

// 먹안개 한 자락: 가운데가 짙고 가장자리로 갈수록 사라지는 둥근 얼룩
function fogCanvas() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.translate(64, 32);
  g.scale(2, 1);
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.55, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(-32, -32, 64, 64);
  return c;
}

function plaqueAtlas(texts) {
  const cw = 512;
  const ch = 128;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch * texts.length;
  const g = c.getContext('2d');
  const family = getComputedStyle(document.body).fontFamily || 'serif';
  texts.forEach((t, i) => {
    const y = i * ch;
    g.fillStyle = TOKENS.meok;
    g.fillRect(0, y, cw, ch);
    g.fillStyle = TOKENS.hanji;
    g.fillRect(8, y + 8, cw - 16, ch - 16);
    g.fillStyle = TOKENS.meok;
    let size = 60;
    g.font = `bold ${size}px ${family}`;
    while (g.measureText(t).width > cw - 40 && size > 20) { size -= 4; g.font = `bold ${size}px ${family}`; }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, cw / 2, y + ch / 2 + 3);
  });
  return c;
}

// 사각형 여럿을 글자 그림 한 장에 붙인 메시(그리기 호출 하나). quads: { c: [x,y,z], r: [x,y,z](오른쪽 단위 벡터), w, h, cell }
function quadMesh(THREE, quads, cells, material) {
  const pos = [];
  const uv = [];
  const idx = [];
  quads.forEach((q) => {
    const [rx, ry, rz] = q.r;
    const hw = q.w / 2;
    const hh = q.h / 2;
    const v0 = 1 - (q.cell + 1) / cells;
    const v1 = 1 - q.cell / cells;
    const b = pos.length / 3;
    const P = (sx, sy) => [q.c[0] + rx * hw * sx, q.c[1] + hh * sy + ry * hw * sx, q.c[2] + rz * hw * sx];
    pos.push(...P(-1, -1), ...P(1, -1), ...P(1, 1), ...P(-1, 1));
    uv.push(0, v0, 1, v0, 1, v1, 0, v1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, material);
}

// 늘어난 층 한 덩이: 상자를 x로 잘게 나눈 뒤 마디마다 굵기와 처짐을 준다. place(m) → { y, hy, hz }(가운데 높이, 반높이, 반깊이)
function taffyMesh(THREE, place, material) {
  const geo = new THREE.BoxGeometry(1, 1, 1, 64, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const X = MID.x0 + (pos.getX(i) + 0.5) * (MID.x1 - MID.x0);
    const m = midAt(X);
    const q = place(m);
    pos.setXYZ(i, X, q.y + pos.getY(i) * 2 * q.hy, MID.zc + pos.getZ(i) * 2 * q.hz);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, material);
}

export function create3D(ctx) {
  const { THREE, root } = ctx;
  const wingId = ctx.wing?.id ?? 'saseol';
  const reduce = () => !!ctx.reduceMotion?.();
  const model = createModel({ fog: !ctx.restored });
  const S = model.state;
  const own = { geos: [], mats: [], texs: [] };
  const keep = (obj) => {
    if (obj.geometry) own.geos.push(obj.geometry);
    if (obj.material) own.mats.push(obj.material);
    root.add(obj);
    return obj;
  };
  const tex = (t) => { own.texs.push(t); return t; };
  const M4 = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const V = new THREE.Vector3();
  const SC = new THREE.Vector3();
  const COL = new THREE.Color();
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  let level = getDancheong(wingId);
  const dc = (hex) => dancheongColor(hex, level);

  // 정적인 상자들(재질 하나, 그리기 호출 하나)
  const grain = ctx.assets?.texture?.('texture/saseol') ?? tex(canvasTex(THREE, grainCanvas()));
  const { list: boxes, keys } = staticBoxes();
  const boxMesh = keep(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: grain }), boxes.length));
  boxMesh.name = 'saseol-static';
  boxes.forEach((b, i) => {
    boxMesh.setMatrixAt(i, M4.compose(V.set(...b.p), Q.identity(), SC.set(...b.s)));
    boxMesh.setColorAt(i, COL.set(b.c));
  });

  // 지붕(네모뿔 하나를 늘여 쓴다)
  const cone = new THREE.ConeGeometry(1, 1, 4);
  cone.rotateY(Math.PI / 4);
  const roofs = roofList();
  const roofMesh = keep(new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial(), roofs.length));
  roofMesh.name = 'saseol-roofs';
  roofs.forEach((r, i) => roofMesh.setMatrixAt(i, M4.compose(V.set(...r.p), Q.identity(), SC.set(r.hw / Math.SQRT1_2, r.h, r.hd / Math.SQRT1_2))));

  // 늘어난 가운데 층: 몸(창살 무늬), 지붕 띠, 위 도리(녹청), 아래 인방(주홍)
  const lattice = tex(canvasTex(THREE, latticeCanvas(), 18));
  const bodyMat = new THREE.MeshLambertMaterial({ map: lattice });
  const body = keep(taffyMesh(THREE, (m) => ({ y: m.yc, hy: m.hh, hz: m.hd }), bodyMat));
  body.name = 'saseol-stretched-storey';
  const eaveMat = new THREE.MeshLambertMaterial();
  keep(taffyMesh(THREE, (m) => ({ y: m.yc + m.hh + 0.1, hy: 0.09, hz: m.hd + 0.3 * (m.hh / MID.half) }), eaveMat)).name = 'saseol-stretched-eave';
  const topMat = new THREE.MeshLambertMaterial();
  keep(taffyMesh(THREE, (m) => ({ y: m.yc + m.hh - 0.06, hy: 0.06, hz: m.hd + 0.04 }), topMat));
  const botMat = new THREE.MeshLambertMaterial();
  keep(taffyMesh(THREE, (m) => ({ y: m.yc - m.hh + 0.06, hy: 0.06, hz: m.hd + 0.04 }), botMat));

  // 현판: 작품 방 문, 장터, 덤, 돌아온 노래(그림 한 장)
  const roomTitle = '「' + (SONG_CATALOG['nimi-oma']?.title ?? '') + '」';
  const plaqueTex = tex(canvasTex(THREE, plaqueAtlas([roomTitle, '장터', '덤', '돌아온 노래'])));
  const plaques = keep(quadMesh(THREE, [
    { c: [-6.0, 2.95, 1.0], r: [Math.SQRT1_2, 0, -Math.SQRT1_2], w: 2.0, h: 0.5, cell: 0 },
    { c: [7.2, 2.55, 0.47], r: [1, 0, 0], w: 1.2, h: 0.3, cell: 1 },
    { c: [BONUS.x, 1.78, BONUS.z + 0.27], r: [1, 0, 0], w: 1.2, h: 0.3, cell: 2 },
    { c: [4.4, 1.2, 2.84], r: [1, 0, 0], w: 1.4, h: 0.35, cell: 3 },
  ], 4, new THREE.MeshBasicMaterial({ map: plaqueTex })));
  plaques.name = 'saseol-plaques';

  // 두루마리와 굴대 둘
  const SEG = 96;
  const scrollGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array((SEG + 1) * 2 * 3);
  const sUv = new Float32Array((SEG + 1) * 2 * 2);
  const sIdx = [];
  for (let j = 0; j < SEG; j++) { const a = j * 2; sIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  scrollGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  scrollGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));
  scrollGeo.setIndex(sIdx);
  const scrollTex = tex(canvasTex(THREE, scrollCanvas()));
  const scroll = keep(new THREE.Mesh(scrollGeo, new THREE.MeshLambertMaterial({ map: scrollTex, side: THREE.DoubleSide })));
  scroll.name = 'saseol-scroll';
  scroll.visible = false;
  const rollers = keep(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8), new THREE.MeshLambertMaterial(), 2));
  rollers.name = 'saseol-rollers';

  // 등불
  const lanternPos = lanternPositions();
  const lanterns = keep(new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial(), LANTERN_COUNT));
  lanterns.name = 'saseol-lanterns';
  lanternPos.forEach((p, i) => lanterns.setMatrixAt(i, M4.compose(V.set(...p), Q.identity(), SC.set(1, 1.25, 1))));

  // 책(칸 셋, 덤 셋, 바구니 두루마리 둘과 행선지 표, 제본 실과 금박)
  const BOOK_N = 16;
  const books = keep(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), BOOK_N));
  books.name = 'saseol-books';

  // 묶인 책등의 제목(묶인 뒤에만 보인다)
  const titleCanvas = document.createElement('canvas');
  titleCanvas.width = 64 * 6; titleCanvas.height = 256;
  const titleTex = tex(canvasTex(THREE, titleCanvas));
  const titleQuads = [];
  for (const area of ['shelf', 'bonus']) {
    for (let i = 0; i < 3; i++) titleQuads.push({ c: [slotX(area, i), BOOK.y0 + BOOK.h / 2, shelfZ(area) + BOOK.d / 2 + 0.005], r: [1, 0, 0], w: 0.3, h: 0.9, cell: 0 });
  }
  // 칸이 가로로 놓이므로 uv를 직접 맞춘다
  const titles = keep(quadMesh(THREE, titleQuads, 1, new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, alphaTest: 0.1 })));
  {
    const uvs = titles.geometry.attributes.uv;
    for (let k = 0; k < 6; k++) {
      const u0 = k / 6;
      const u1 = (k + 1) / 6;
      uvs.setXY(k * 4, u0, 0); uvs.setXY(k * 4 + 1, u1, 0); uvs.setXY(k * 4 + 2, u1, 1); uvs.setXY(k * 4 + 3, u0, 1);
    }
    uvs.needsUpdate = true;
  }
  titles.name = 'saseol-titles';
  let titlesDrawn = '';

  // 삐져나오는 책 마디
  const popKeys = [...Object.entries(AREAS)].flatMap(([a, n]) => Array.from({ length: n }, (_, i) => a + ':' + i));
  const pops = keep(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), popKeys.length * POP_SEGS));
  pops.name = 'saseol-popout';
  for (let i = 0; i < pops.count; i++) { pops.setMatrixAt(i, HIDE); pops.setColorAt(i, COL.set(TOKENS.hanji)); }

  // 먹안개
  const FOG = [
    [-3.4, 3.0, -1.2, 5.5, 3.4], [1.8, 2.2, -2.2, 6, 2.8], [5.8, 2.0, -2.6, 5, 2.6], [9.8, 2.0, -2.4, 6, 3.2],
    [0.2, 1.1, 1.6, 7, 1.5], [-1.5, 3.8, -4.6, 7, 3], [8.6, 1.0, 1.0, 4.5, 1.6],
  ];
  const fogMat = new THREE.MeshBasicMaterial({ color: TOKENS.meokFog, map: tex(canvasTex(THREE, fogCanvas())), transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const fog = keep(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), fogMat, FOG.length));
  fog.name = 'saseol-fog';
  FOG.forEach(([x, y, z, w, h], i) => fog.setMatrixAt(i, M4.compose(V.set(x, y, z), Q.identity(), SC.set(w, h, 1))));

  // ── 그리기 ──
  function recolorStatic() {
    boxes.forEach((b, i) => boxMesh.setColorAt(i, COL.set(dc(b.c))));
    roofs.forEach((r, i) => roofMesh.setColorAt(i, COL.set(dc(r.c))));
    roofMesh.instanceColor.needsUpdate = true;
    bodyMat.color.set(dc(mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.35)));   // 두루마리(한지)가 또렷하게 보이도록 벽은 한 톤 어둡게
    eaveMat.color.set(dc(TOKENS.meok));
    topMat.color.set(dc(TOKENS.nokcheong));
    botMat.color.set(dc(TOKENS.juhong));
    plaques.material.color.set(mixHex('#9a9a9a', '#ffffff', 0.55 + 0.45 * level));
  }

  function drawStairs() {
    for (let k = 0; k < STAIR_STEPS; k++) {
      const lit = k < S.stairs;
      boxMesh.setColorAt(keys['stair' + k], COL.set(lit ? TOKENS.gold : dc(TOKENS.meokSoft)));
    }
    boxMesh.instanceColor.needsUpdate = true;
  }

  function drawLanterns() {
    const lit = mixHex(TOKENS.gold, TOKENS.hanji, 0.35);
    const off = dc(TOKENS.meokSoft);
    for (let i = 0; i < LANTERN_COUNT; i++) {
      const f = S.flash[lanternStorey(i)];
      const base = S.lanterns[i] ? lit : off;
      lanterns.setColorAt(i, COL.set(f > 0 ? mixHex(base, TOKENS.hanji, Math.min(1, f / 0.45)) : base));
    }
    lanterns.instanceColor.needsUpdate = true;
  }

  function drawScroll() {
    const feet = S.feetShown;
    const end = scrollEndX(feet);
    scroll.visible = feet > 0.01;
    for (let j = 0; j <= SEG; j++) {
      const x = SCROLL.x0 + (end - SCROLL.x0) * (j / SEG);
      const m = midAt(x);
      const half = Math.max(0.14, 0.7 * m.hh);
      const z = MID.zc + m.hd + 0.05;
      sPos.set([x, m.yc + half, z, x, m.yc - half, z], j * 6);
      const u = (x - SCROLL.x0) / (SCROLL.x1 - SCROLL.x0);
      sUv.set([u, 1, u, 0], j * 4);
    }
    scrollGeo.attributes.position.needsUpdate = true;
    scrollGeo.attributes.uv.needsUpdate = true;
    scrollGeo.computeVertexNormals();
    scrollGeo.computeBoundingSphere();
    scroll.userData = { feet, endX: end, length: end - SCROLL.x0, overFour: feet > 4 };
    // 굴대: 시작과 끝. 연타 한 번마다 끝 굴대가 잠깐 굵어진다.
    [SCROLL.x0, end].forEach((x, i) => {
      const m = midAt(x);
      const h = Math.max(0.14, 0.7 * m.hh) * 2 + 0.24;
      const k = i === 1 ? 1 + 0.8 * S.unrollPulse : 1;
      rollers.setMatrixAt(i, scroll.visible ? M4.compose(V.set(x, m.yc, MID.zc + m.hd + 0.09), Q.identity(), SC.set(k, h, k)) : HIDE);
      rollers.setColorAt(i, COL.set(dc(TOKENS.meokSoft)));
    });
    rollers.instanceMatrix.needsUpdate = true;
    rollers.instanceColor.needsUpdate = true;
  }

  function drawBooks() {
    let n = 0;
    const put = (p, s, c) => {
      books.setMatrixAt(n, s ? M4.compose(V.set(...p), Q.identity(), SC.set(...s)) : HIDE);
      books.setColorAt(n, COL.set(c ?? TOKENS.hanji));
      n++;
    };
    for (const area of ['shelf', 'bonus']) {
      for (let i = 0; i < 3; i++) {
        const slot = S.slots[area][i];
        const popped = S.pops.has(area + ':' + i);
        // 빈자리는 제목 없는 빈 책등, 꽂은 책은 녹청 표지, 묶인 책은 먹 표지
        const c = S.bound[area] ? TOKENS.meok : slot ? TOKENS.nokcheong : TOKENS.hanji;
        put([slotX(area, i), BOOK.y0 + BOOK.h / 2, shelfZ(area)], popped ? null : [BOOK.w, BOOK.h, BOOK.d], dc(c));
      }
    }
    for (let i = 0; i < 2; i++) {
      const slot = S.slots.basket[i];
      const show = slot && !S.pops.has('basket:' + i);
      put([slotX('basket', i), 0.5, BASKET.z], show ? [0.17, 0.48, 0.17] : null, dc(TOKENS.hanji));
    }
    for (let i = 0; i < 2; i++) {
      const slot = S.slots.basket[i];
      const show = slot?.to && !S.pops.has('basket:' + i);
      put([slotX('basket', i) + 0.1, 0.62, BASKET.z + 0.1], show ? [0.13, 0.17, 0.02] : null, dc(TOKENS.nokcheong));
    }
    for (const area of ['shelf', 'bonus']) {
      const x = area === 'shelf' ? SHELF.x : BONUS.x;
      const z = shelfZ(area) + 0.25;
      for (const y of [0.45, 0.9]) put([x, y, z], S.bound[area] ? [1.8, 0.035, 0.02] : null, dc(TOKENS.hanjiDeep));
    }
    for (const area of ['shelf', 'bonus']) {
      const x = area === 'shelf' ? SHELF.x : BONUS.x;
      put([x, 1.06, shelfZ(area) + 0.27], S.bound[area] ? [1.85, 0.07, 0.02] : null, TOKENS.gold);
    }
    books.instanceMatrix.needsUpdate = true;
    books.instanceColor.needsUpdate = true;
  }

  function drawTitles() {
    const want = ['shelf', 'bonus'].map((a) => (S.bound[a] ? S.boundIds[a].join('|') : '')).join('/');
    if (want === titlesDrawn) return;
    titlesDrawn = want;
    const g = titleCanvas.getContext('2d');
    g.clearRect(0, 0, titleCanvas.width, titleCanvas.height);
    const family = getComputedStyle(document.body).fontFamily || 'serif';
    ['shelf', 'bonus'].forEach((area, a) => {
      if (!S.bound[area]) return;
      S.boundIds[area].forEach((id, i) => {
        const title = SONG_CATALOG[id]?.title ?? '';
        const chars = [...title.replace(/\s+/g, '')];
        if (!chars.length) return;
        const cx = (a * 3 + i) * 64 + 32;
        const size = Math.min(40, Math.floor(236 / chars.length));
        g.font = `bold ${size}px ${family}`;
        g.fillStyle = TOKENS.hanji;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        chars.forEach((ch, k) => g.fillText(ch, cx, 10 + size * (k + 0.5)));
      });
    });
    titleTex.needsUpdate = true;
  }

  function drawPops() {
    popKeys.forEach((key, k) => {
      const p = S.pops.get(key);
      for (let j = 0; j < POP_SEGS; j++) {
        const at = k * POP_SEGS + j;
        const seg = p?.shape[j];
        if (!seg) { pops.setMatrixAt(at, HIDE); continue; }
        const t = p.t;
        const basket = p.area === 'basket';
        const x = slotX(p.area, p.index);
        let y0 = basket ? 0.36 + 0.55 * t : BOOK.y0 + 0.05 * t;
        for (let q = 0; q < j; q++) y0 += p.shape[q].h * POP_UNIT_H;
        const h = seg.h * POP_UNIT_H;
        const depth = BOOK.d * (1 + (seg.d - 1) * t);
        const back = (basket ? BASKET.z - 0.1 : shelfZ(p.area) - BOOK.d / 2) + (basket ? 0.25 : 0.35) * t;
        const w = seg.ring ? BOOK.w + 0.1 : BOOK.w;
        pops.setMatrixAt(at, M4.compose(V.set(x, y0 + h / 2, back + depth / 2), Q.identity(), SC.set(w, h * 0.96, depth)));
        pops.setColorAt(at, COL.set(dc(seg.ring ? TOKENS.gold : seg.long ? TOKENS.juhong : TOKENS.hanji)));
      }
    });
    pops.instanceMatrix.needsUpdate = true;
    pops.instanceColor.needsUpdate = true;
    pops.computeBoundingSphere();
    pops.userData = { active: [...S.pops.values()].map((p) => ({ area: p.area, index: p.index, genre: p.genre, t: p.t, depths: p.shape.map((s) => s.d) })) };
  }

  function drawFog() {
    fogMat.opacity = 0.6 * S.fogShown;
    fog.visible = S.fogShown > 0.01;
  }

  function drawAll() {
    drawStairs();
    drawLanterns();
    drawScroll();
    drawBooks();
    drawTitles();
    drawPops();
    drawFog();
    boxMesh.instanceMatrix.needsUpdate = true;
    boxMesh.instanceColor.needsUpdate = true;
  }

  recolorStatic();
  drawAll();
  [boxMesh, roofMesh, lanterns, books, pops, fog, rollers].forEach((m) => m.computeBoundingSphere());
  // 인스턴스 경계는 처음 자리로 정해지므로 움직이는 것들은 화면 밖 잘림을 끈다.
  [books, pops, rollers, scroll].forEach((m) => { m.frustumCulled = false; });

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const anchors = {
    slots: [0, 1, 2].map((i) => v(slotX('shelf', i), 0, SHELF.z + 1.0)),
    bonus: [0, 1, 2].map((i) => v(slotX('bonus', i), 0, BONUS.z + 0.95)),
    basket: v(BASKET.x, 0, BASKET.z + 0.9),
    returnedShelf: v(4.4, 0, 3.5),
    roomDoor: v(-5.6, 0, 1.0),
    entrance: v(1.6, 0, 3.95),
    nextDoor: v(5.6, 0, 1.6),
    camera: { position: v(2.4, 9.8, 12.9), target: v(2.4, 2.0, -1.6) },
  };

  return {
    anchors,
    // 추가 제안(T11): 떠도는 노래가 머무는 곳(다섯, 연결 결정 F2), 재기 화면 왼쪽 반이 바라볼 곳(늘어난 층 한가운데)
    spots: {
      floatingSongs: [v(0.4, 1.4, 1.6), v(-2.0, 1.6, 0.6), v(-1.0, 1.8, 2.6), v(1.9, 1.7, 0.5), v(2.6, 1.5, 2.3)],
      measureFocus: v(2.6, midAt(2.6).yc, MID.zc),
    },
    react(name, detail) {
      if (!model.apply(name, detail)) return;
      if (reduce()) model.step(0, true);
      drawAll();
    },
    update(dt) {
      const moved = model.step(dt, reduce());
      const now = getDancheong(wingId);
      if (now !== level) { level = now; recolorStatic(); drawAll(); return; }
      if (moved) drawAll();
    },
    dispose() {
      for (const o of [...root.children]) root.remove(o);
      own.geos.forEach((g) => g.dispose());
      own.mats.forEach((m) => m.dispose());
      own.texs.forEach((t) => t.dispose());
    },
  };
}
