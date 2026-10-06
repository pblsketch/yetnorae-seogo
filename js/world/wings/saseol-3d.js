// 사설시조관 3D 모형(spec 3.1·6·14). 시조 정자의 가운데 층(중장)이 엿가락처럼 늘어나 오른쪽 담을 뚫고
// 장터 엿 가게 좌판 위까지 늘어진다. '연타로 풀기'(diorama:unroll)를 하면 그 늘어난 층 앞에 걸린 큰 두루마리가
// 나무 굴대를 굴리며 길게 풀린다. 장터에는 기와·초가 가게, 좌판과 차양, 등줄, 종이 오린 장사꾼과 거드름 피우는 양반이 있다.
//
// 그리는 것은 셋으로 나뉜다.
//  · 반응하는 것: 정자 기둥·보·계단·문(상자 InstancedMesh 하나, 단청 색), 등불, 책, 삐져나옴, 두루마리와 굴대, 먹안개.
//  · 늘어난 층: 몸(띠살 창), 기와 처마, 녹청 도리, 민화 띠(사설시조관 재질 무늬), 장터 차양 천을 그림 한 장의 한 기하로.
//  · 서 있는 것(담, 정자 기단·지붕, 서가 틀, 바구니, 장터 가게·좌판·사람): gfx 꾸러미로 재질 역할마다 합친 기하 하나.
//    첫 화면이 늦지 않게 두 번째 프레임에 짓는다.
// 빛은 꼭짓점 색에 구워 빛 없는 재질로 그린다(t36-props.js '구운 빛'). 그림자 맵은 쓰지 않는다.
import { SONG_CATALOG } from '../../data/song-table.js';
import { TOKENS, dancheongColor, getDancheong, mixHex } from '../palette.js';
import { createTextures } from '../gfx/textures.js';
import { createMaterials, addInkHook } from '../gfx/materials.js';
import { createKit, WOOD } from '../gfx/kit.js';
import { cheapFilter, createBakedMaterials, createLightBaker, createT36Props, T36_COLORS } from '../gfx/t36-props.js';
import { fogDisc } from '../gfx/t39-perf.js';
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
const RETURNED = { x: 4.4, z: 2.6 };
const DESK = { x: 1.6, z: 4.7 };
const SCROLL = { x0: -4.95, x1: MID.x1 - 0.2 };
const BOOK = { w: 0.42, h: 1.0, d: 0.36, y0: 0.14 };
const POP_SEGS = 10;
const POP_UNIT_H = 0.33;
const CAM = { x: 2.4, z: 12.9 };

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

// 두루마리가 그 x에서 걸리는 높이: 처마 밑에서 늘어난 층 아래까지 길게 늘어진다
function scrollSpan(x) {
  const m = midAt(x);
  const top = m.yc + m.hh - 0.02;
  const bottom = m.yc - m.hh - 0.32 * (0.6 + 0.4 * (m.hh / MID.half));
  return { top, bottom, z: MID.zc + m.hd + 0.07 };
}

const slotX = (area, i) => (area === 'shelf' ? SHELF.x : area === 'bonus' ? BONUS.x : BASKET.x) + (area === 'basket' ? (i - 0.5) * 2 * BASKET_DX : (i - 1) * SLOT_DX);
const shelfZ = (area) => (area === 'shelf' ? SHELF.z : BONUS.z);

// ── 반응하는 상자들(정자의 칠한 부재, 계단, 문). 색은 단청 값을 따른다 ──
function gate(x, z0, z1, leaf, out) {
  const zc = (z0 + z1) / 2;
  out.push({ p: [x, 1.2, z0], s: [0.22, 2.4, 0.22], c: TOKENS.juhong });
  out.push({ p: [x, 1.2, z1], s: [0.22, 2.4, 0.22], c: TOKENS.juhong });
  out.push({ p: [x, 2.45, zc], s: [0.3, 0.25, z1 - z0 + 0.3], c: TOKENS.nokcheong });
  out.push({ p: [x + 0.05, 1.05, zc], s: [0.06, 2.1, z1 - z0 - 0.25], c: leaf });
}

function staticBoxes() {
  const out = [];
  const keys = {};
  // 정자: 초장 층·종장 층 기둥(주홍), 창방(녹청)
  for (const x of PILLAR_X) {
    out.push({ p: [x, 1.05, FRONT_Z], s: [0.2, 1.5, 0.2], c: TOKENS.juhong });
    out.push({ p: [x, 1.05, BACK_Z], s: [0.2, 1.5, 0.2], c: TOKENS.juhong });
    out.push({ p: [x, 3.87, FRONT_Z], s: [0.18, 1.06, 0.18], c: TOKENS.juhong });
    out.push({ p: [x, 3.87, BACK_Z], s: [0.18, 1.06, 0.18], c: TOKENS.juhong });
  }
  for (const z of [FRONT_Z, BACK_Z]) {
    out.push({ p: [-3.4, 1.72, z], s: [3.4, 0.16, 0.22], c: TOKENS.nokcheong });
    out.push({ p: [-3.4, 4.36, z], s: [3.4, 0.14, 0.2], c: TOKENS.nokcheong });
  }
  // 종장으로 오르는 첫 계단 세 칸(정자 왼쪽 바깥)과 받침 기둥
  out.push({ p: [-5.5, 1.3, -3.2], s: [0.12, 2.6, 0.12], c: TOKENS.meokSoft });
  for (let k = 0; k < STAIR_STEPS; k++) {
    keys['stair' + k] = out.length;
    out.push({ p: [-5.5, 2.25 + 0.45 * k, -2.7 - k * 0.5], s: [0.72, 0.16, 0.55], c: TOKENS.meokSoft });
  }
  // 시조라면 여기서 끝났을 자리(4음보 경계): 늘어난 층을 감는 금빛 띠
  out.push({ p: [MID.seam, MID.yc, MID.zc], s: [0.14, 1.35, 2.75], c: TOKENS.gold });
  // 늘어난 층을 받치는 가는 기둥(관 안)
  for (let k = 0; k < 8; k++) {
    const x = -0.8 + k * 0.95;
    if (x > 6.2) break;
    const m = midAt(x);
    const h = m.yc - m.hh;
    out.push({ p: [x, h / 2, MID.zc + m.hd - 0.15], s: [0.12, h, 0.12], c: TOKENS.juhong });
    out.push({ p: [x, h / 2, MID.zc - m.hd + 0.15], s: [0.12, h, 0.12], c: TOKENS.juhong });
  }
  // 작품 방 문(왼쪽 담), 다음 관 문(오른쪽 담)
  gate(-6.4, 0.2, 1.8, TOKENS.meokSoft, out);
  gate(6.4, 0.8, 2.4, TOKENS.meok, out);
  return { list: out, keys };
}

// 등불 자리: 초장 층 기둥 넷, 가운데 층(정자 안 넷 + 늘어난 쪽 열둘), 종장 층 기둥 넷
function lanternPositions() {
  const out = [];
  for (const x of PILLAR_X) out.push([x, 1.5, FRONT_Z + 0.18]);
  for (let i = 0; i < 4; i++) {
    const x = -4.75 + i * 0.95;
    const m = midAt(x);
    out.push([x, m.yc + m.hh + 0.02, MID.zc + m.hd + 0.16]);
  }
  for (let k = 0; k < 12; k++) {
    const x = -1.0 + k * (11.0 / 11);
    const m = midAt(x);
    out.push([x, m.yc + m.hh + 0.02, MID.zc + m.hd + 0.16]);
  }
  for (const x of PILLAR_X) out.push([x, 4.15, FRONT_Z + 0.16]);
  return out;
}

// ── 그림(캔버스 무늬) ──
function canvasTex(THREE, canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 두루마리 무늬: 위아래 비단 표구(녹청 띠와 금선), 한지 바탕에 세로 먹 글줄, 음보 경계마다 가는 금, 4음보 자리에 붉은 금
function scrollCanvas() {
  const W = 2048;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = TOKENS.hanji;
  g.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  // 세로 글줄(붓 획 덩이)
  g.fillStyle = 'rgba(43,43,43,0.78)';
  for (let x = 10; x < W - 6; x += 11) {
    let y = 26;
    while (y < H - 28) {
      const h = 4 + rnd() * 9;
      g.fillRect(x + (rnd() - 0.5) * 2, y, 3 + rnd() * 2, h);
      y += h + 2 + rnd() * 4;
    }
  }
  const u = (x) => ((x - SCROLL.x0) / (SCROLL.x1 - SCROLL.x0)) * W;
  g.fillStyle = 'rgba(43,43,43,0.55)';
  for (let f = 1; f <= 60; f++) g.fillRect(u(scrollEndX(f)) - 1, 18, 2, H - 36);
  g.fillStyle = TOKENS.juhong;
  g.fillRect(u(scrollEndX(4)) - 3, 18, 6, H - 36);
  // 표구: 위아래 녹청 비단과 금선
  for (const y of [0, H - 18]) {
    g.fillStyle = TOKENS.nokcheong;
    g.fillRect(0, y, W, 18);
    g.fillStyle = TOKENS.gold;
    g.fillRect(0, y === 0 ? 15 : H - 18, W, 3);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = 0; x < W; x += 24) g.fillRect(x, y + 5, 12, 2);
  }
  return c;
}

// 늘어난 층 그림 한 장(512×512): 위부터 띠살 창(0), 기와 골(1), 민화 띠(2, 사설시조관 재질 무늬), 흰 칸(3)
const ATLAS_ROWS = 4;
function drawAtlas(g, pattern) {
  const S = 512;
  const R = S / ATLAS_ROWS;
  g.clearRect(0, 0, S, S);
  // 0: 띠살 창(한지 + 먹 살)
  g.fillStyle = '#f2ead8';
  g.fillRect(0, 0, S, R);
  g.strokeStyle = 'rgba(43,43,43,0.75)';
  g.lineWidth = 6;
  g.strokeRect(6, 10, S - 12, R - 20);
  g.lineWidth = 2.5;
  for (let x = 6; x < S; x += 21) { g.beginPath(); g.moveTo(x, 10); g.lineTo(x, R - 10); g.stroke(); }
  for (const y of [R * 0.25, R * 0.5, R * 0.75]) for (const d of [-4, 4]) { g.beginPath(); g.moveTo(6, y + d); g.lineTo(S - 6, y + d); g.stroke(); }
  // 1: 기와 골(수키와 줄과 그늘)
  for (let x = 0; x < S; x += 32) {
    const gr = g.createLinearGradient(x, 0, x + 32, 0);
    gr.addColorStop(0, '#5a5650');
    gr.addColorStop(0.5, '#9a958c');
    gr.addColorStop(1, '#4a4642');
    g.fillStyle = gr;
    g.fillRect(x, R, 32, R);
  }
  g.fillStyle = 'rgba(30,30,30,0.35)';
  for (let y = R + 20; y < 2 * R; y += 26) g.fillRect(0, y, S, 3);
  // 2: 민화 띠
  if (pattern) {
    g.drawImage(pattern, 0, 2 * R, S, R);
  } else {
    g.fillStyle = '#f0e6cf';
    g.fillRect(0, 2 * R, S, R);
    g.lineWidth = 14;
    for (const [col, dy] of [[TOKENS.nokcheong, 0.35], [TOKENS.juhong, 0.7]]) {
      g.strokeStyle = col;
      g.beginPath();
      for (let x = 0; x <= S; x += 8) g.lineTo(x, 2 * R + R * dy + Math.sin((x / S) * Math.PI * 4) * 16);
      g.stroke();
    }
    g.fillStyle = TOKENS.gold;
    for (let x = 32; x < S; x += 96) { g.beginPath(); g.arc(x, 2 * R + R * 0.52, 10, 0, Math.PI * 2); g.fill(); }
  }
  // 3: 흰 칸(꼭짓점 색만 보인다)
  g.fillStyle = '#ffffff';
  g.fillRect(0, 3 * R, S, R);
}

// 나무판 간판 그림(한지 바탕 + 먹 테 + 먹 글씨). texts 하나가 한 칸
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
// row는 그림 칸, repeat는 u 되풀이 수, color는 꼭짓점 색. 색인 없는 기하로 돌려준다.
function taffyPart(THREE, place, { row, repeat, color }) {
  const geo = new THREE.BoxGeometry(1, 1, 1, 64, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const X = MID.x0 + (pos.getX(i) + 0.5) * (MID.x1 - MID.x0);
    const m = midAt(X);
    const q = place(m);
    pos.setXYZ(i, X, q.y + pos.getY(i) * 2 * q.hy, MID.zc + pos.getZ(i) * 2 * q.hz);
  }
  geo.computeVertexNormals();
  const out = geo.toNonIndexed();
  geo.dispose();
  const uv = out.attributes.uv;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + 0.01;
  const v1 = 1 - row / ATLAS_ROWS - 0.01;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat, v0 + uv.getY(i) * (v1 - v0));
  const c = new THREE.Color(color);
  const col = new Float32Array(out.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// 비스듬한 천 한 장(차양, 깃발). 네 모서리 [x,y,z]와 그림 칸
function clothPart(THREE, corners, { row, repeat = 1, color = '#ffffff' }) {
  const [a, b, c, d] = corners;   // 왼아래, 오른아래, 오른위, 왼위
  const pos = [...a, ...b, ...c, ...a, ...c, ...d];
  const v0 = 1 - (row + 1) / ATLAS_ROWS + 0.01;
  const v1 = 1 - row / ATLAS_ROWS - 0.01;
  const uv = [0, v0, repeat, v0, repeat, v1, 0, v0, repeat, v1, 0, v1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const cc = new THREE.Color(color);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(18).map((_, i) => [cc.r, cc.g, cc.b][i % 3]), 3));
  return g;
}

function mergeNonIndexed(THREE, parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
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
  let frames = 0;

  // ── 꾸러미 ──
  const textures = cheapFilter(THREE, createTextures(THREE));
  const materials = createMaterials(THREE, textures);
  const kit = createKit(THREE, { materials });
  const props = createT36Props(THREE, kit);
  const baker = createLightBaker(THREE, 'wing');
  const baked = createBakedMaterials(THREE, textures, materials);
  materials.setDancheong(level);
  const unit = baker.bake(props.unitBox(0.06));
  const basic = (opts) => new THREE.MeshBasicMaterial({ vertexColors: true, ...opts });

  // 정자의 칠한 부재(재질 하나, 그리기 호출 하나)
  const { list: boxes, keys } = staticBoxes();
  const boxMesh = keep(new THREE.InstancedMesh(unit, basic({ map: textures.get('wood') }), boxes.length));
  boxMesh.name = 'saseol-static';
  boxes.forEach((b, i) => {
    boxMesh.setMatrixAt(i, M4.compose(V.set(...b.p), Q.identity(), SC.set(...b.s)));
    boxMesh.setColorAt(i, COL.set(b.c));
  });

  // 늘어난 가운데 층: 몸(띠살 창), 기와 처마, 녹청 도리, 민화 띠(+ 장터 차양 천) — 그림 한 장, 그리기 호출 하나
  const pattern = ctx.assets?.texture?.('texture/saseol') ?? null;
  const patternReady = () => { const img = pattern?.image; return !!img && (img.width ?? 0) > 0 && img.complete !== false; };
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = 512; atlasCanvas.height = 512;
  let atlasHasPattern = patternReady();
  drawAtlas(atlasCanvas.getContext('2d'), atlasHasPattern ? pattern.image : null);
  const atlas = tex(canvasTex(THREE, atlasCanvas));
  atlas.wrapS = THREE.RepeatWrapping;
  const stretchParts = [
    taffyPart(THREE, (m) => ({ y: m.yc, hy: m.hh, hz: m.hd }), { row: 0, repeat: 18, color: '#e8dcc0' }),
    taffyPart(THREE, (m) => ({ y: m.yc + m.hh + 0.1, hy: 0.09, hz: m.hd + 0.3 * (m.hh / MID.half) }), { row: 1, repeat: 24, color: '#d0cac0' }),
    taffyPart(THREE, (m) => ({ y: m.yc + m.hh - 0.07, hy: 0.07, hz: m.hd + 0.04 }), { row: 3, repeat: 1, color: TOKENS.nokcheong }),
    taffyPart(THREE, (m) => ({ y: m.yc - m.hh + 0.1, hy: 0.12, hz: m.hd + 0.05 }), { row: 2, repeat: 14, color: '#ffffff' }),
    ...awningParts(),
  ];
  const stretchGeo = baker.bake(mergeNonIndexed(THREE, stretchParts));
  stretchParts.forEach((g) => g.dispose());
  const stretchMat = addInkHook(basic({ map: atlas }), materials.shared, 0);
  const body = keep(new THREE.Mesh(stretchGeo, stretchMat));
  body.name = 'saseol-stretched-storey';

  // 장터 차양 천(민화 무늬) 넷: 좌판 셋 위와 엿 가게 앞
  function awningParts() {
    const out = [];
    const tilt = (x, z, w, d, y, drop) => [[x - w / 2, y - drop, z + d / 2], [x + w / 2, y - drop, z + d / 2], [x + w / 2, y, z - d / 2], [x - w / 2, y, z - d / 2]];
    out.push(clothPart(THREE, tilt(8.4, -0.4, 2.0, 1.4, 2.05, 0.35), { row: 2, repeat: 0.6 }));
    out.push(clothPart(THREE, tilt(12.0, -1.2, 2.0, 1.4, 2.05, 0.35), { row: 2, repeat: 0.6 }));
    out.push(clothPart(THREE, tilt(10.2, -6.0, 2.2, 1.0, 2.55, 0.3), { row: 2, repeat: 0.7 }));
    // 주막 깃발(장대에 늘어뜨린 천)
    out.push(clothPart(THREE, [[13.32, 2.2, -4.6], [13.32, 2.2, -3.95], [13.32, 3.3, -3.95], [13.32, 3.3, -4.6]], { row: 3, color: '#efe4c8' }));
    return out;
  }

  // 현판·간판: 작품 방 문, 장터, 덤, 돌아온 노래, 장터 가게 넷(그림 한 장)
  const roomTitle = '「' + (SONG_CATALOG['nimi-oma']?.title ?? '') + '」';
  const PLAQUES = [roomTitle, '장터', '덤', '돌아온 노래', '게젓', '엿', '짚신', '주막'];
  const plaqueTex = tex(canvasTex(THREE, plaqueAtlas(PLAQUES)));
  const plaques = keep(quadMesh(THREE, [
    { c: [-6.0, 2.95, 1.0], r: [Math.SQRT1_2, 0, -Math.SQRT1_2], w: 2.0, h: 0.5, cell: 0 },
    { c: [7.2, 2.55, 0.47], r: [1, 0, 0], w: 1.2, h: 0.3, cell: 1 },
    { c: [BONUS.x, 1.78, BONUS.z + 0.27], r: [1, 0, 0], w: 1.2, h: 0.3, cell: 2 },
    { c: [RETURNED.x, 1.2, RETURNED.z + 0.24], r: [1, 0, 0], w: 1.4, h: 0.35, cell: 3 },
    { c: [7.7, 2.25, -5.66], r: [1, 0, 0], w: 1.3, h: 0.36, cell: 4 },
    { c: [10.2, midAt(10.2).yc - midAt(10.2).hh - 0.35, MID.zc + 0.62], r: [1, 0, 0], w: 0.9, h: 0.3, cell: 5 },
    { c: [12.6, 2.25, -5.66], r: [1, 0, 0], w: 1.3, h: 0.36, cell: 6 },
    { c: [13.34, 2.75, -4.27], r: [0, 0, 1], w: 0.6, h: 0.2, cell: 7 },
  ], PLAQUES.length, new THREE.MeshBasicMaterial({ map: plaqueTex, toneMapped: false, side: THREE.DoubleSide })));
  plaques.name = 'saseol-plaques';

  // 두루마리와 굴대(굴대 둘 + 굴대 머리 넷)
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
  const scroll = keep(new THREE.Mesh(scrollGeo, new THREE.MeshBasicMaterial({ map: scrollTex, side: THREE.DoubleSide })));
  scroll.name = 'saseol-scroll';
  scroll.visible = false;
  const rollerGeo = baker.bake(new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
  const rollers = keep(new THREE.InstancedMesh(rollerGeo, basic({ map: textures.get('wood') }), 6));
  rollers.name = 'saseol-rollers';

  // 등불(종이 초롱 꼴, 빛 없는 재질: 켜지면 스스로 밝다)
  const lanternPos = lanternPositions();
  const lanternGeo = new THREE.LatheGeometry([[0, -0.16], [0.07, -0.16], [0.13, -0.08], [0.14, 0.04], [0.1, 0.13], [0.05, 0.16], [0, 0.16]].map(([x, y]) => new THREE.Vector2(x, y)), 8);
  const lanterns = keep(new THREE.InstancedMesh(lanternGeo, new THREE.MeshBasicMaterial(), LANTERN_COUNT));
  lanterns.name = 'saseol-lanterns';
  lanternPos.forEach((p, i) => lanterns.setMatrixAt(i, M4.compose(V.set(...p), Q.identity(), SC.set(1, 1, 1))));

  // 책(칸 셋, 덤 셋, 바구니 두루마리 둘과 행선지 표, 제본 실과 금박)
  const BOOK_N = 16;
  const books = keep(new THREE.InstancedMesh(unit, basic({ map: textures.get('hanji') }), BOOK_N));
  books.name = 'saseol-books';

  // 묶인 책등의 제목(묶인 뒤에만 보인다)
  const titleCanvas = document.createElement('canvas');
  titleCanvas.width = 64 * 6; titleCanvas.height = 256;
  const titleTex = tex(canvasTex(THREE, titleCanvas));
  const titleQuads = [];
  for (const area of ['shelf', 'bonus']) {
    for (let i = 0; i < 3; i++) titleQuads.push({ c: [slotX(area, i), BOOK.y0 + BOOK.h / 2, shelfZ(area) + BOOK.d / 2 + 0.012], r: [1, 0, 0], w: 0.3, h: 0.9, cell: 0 });
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
  // 마디가 많고 대부분 숨어 있으므로 깎지 않은 상자(삼각형 12개)로
  const popGeo = baker.bake(new THREE.BoxGeometry(1, 1, 1));
  const pops = keep(new THREE.InstancedMesh(popGeo, basic({ map: textures.get('hanji') }), popKeys.length * POP_SEGS));
  pops.name = 'saseol-popout';
  for (let i = 0; i < pops.count; i++) { pops.setMatrixAt(i, HIDE); pops.setColorAt(i, COL.set(TOKENS.hanji)); }

  // 먹안개
  const FOG = [
    [-3.4, 3.0, -1.2, 5.5, 3.4], [1.8, 2.2, -2.2, 6, 2.8], [5.8, 2.0, -2.6, 5, 2.6], [9.8, 2.0, -2.4, 6, 3.2],
    [0.2, 1.1, 1.6, 7, 1.5], [-1.5, 3.8, -4.6, 7, 3], [8.6, 1.0, 1.0, 4.5, 1.6],
  ];
  const fogMat = new THREE.MeshBasicMaterial({ color: TOKENS.meokFog, map: tex(canvasTex(THREE, fogCanvas())), transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const fog = keep(new THREE.InstancedMesh(fogDisc(THREE, 0.49), fogMat, FOG.length));   // 둥글게 자른 판(gfx/t39-perf.js)
  fog.name = 'saseol-fog';
  FOG.forEach(([x, y, z, w, h], i) => fog.setMatrixAt(i, M4.compose(V.set(x, y, z), Q.identity(), SC.set(w, h, 1))));

  // ── 서 있는 것(두 번째 프레임에 짓는다) ──
  let staticGroup = null;
  function buildStatic() {
    const b = kit.builder();
    buildWalls(b);
    buildPavilion(b);
    buildShelves(b);
    buildMarket(b);
    staticGroup = baked.convert(b.build('saseol-kit'), baker);
    root.add(staticGroup);
  }

  // 담: 돌 기단 + 회벽 + 기와. 오른쪽 담은 장터가 보이게 낮고, 늘어난 층이 뚫고 나간 자리는 부서져 있다
  function buildWalls(b) {
    const W = 6.45;
    props.wallRun(b, { x0: -W, z0: -W, x1: W, z1: -W, h: 1.7 });
    props.wallRun(b, { x0: -W, z0: -W, x1: -W, z1: 0.05, h: 1.9 });
    props.wallRun(b, { x0: -W, z0: 1.95, x1: -W, z1: W, h: 1.9 });
    props.wallRun(b, { x0: W, z0: -W, x1: W, z1: -5.0, h: 1.15 });
    props.wallRun(b, { x0: W, z0: -2.2, x1: W, z1: 0.65, h: 1.15 });
    props.wallRun(b, { x0: W, z0: 2.55, x1: W, z1: W, h: 1.15 });
    // 뚫린 자리: 낮게 남은 담 밑동과 흩어진 부스러기
    b.box('stone', 0.44, 0.45, 2.6, { p: [W, 0.22, -3.6], color: '#8f8a80', ao: 0.5 });
    [[6.6, -4.6, 0.35, 1], [6.95, -2.6, 0.3, 2], [6.2, -2.5, 0.26, 3], [7.1, -3.9, 0.22, 4], [6.0, -4.9, 0.2, 5], [7.4, -3.1, 0.16, 6]].forEach(([x, z, s, seed]) => props.rock(b, { x, z, s, sy: 0.6, seed, color: '#cfc5b0' }));
    for (const [x0, z0] of [[W, -5.0], [W, -2.2]]) b.box('paint', 0.36, 0.6, 0.36, { p: [x0, 1.1, z0], r: [0, 0, 0.25], color: '#d9cfbb', ao: 0 });
    // 문 위 작은 기와 지붕
    props.hipRoof(b, { x: -6.4, y: 2.62, z: 1.0, w: 0.9, d: 2.4, h: 0.4, lift: 0.12, flare: 0.08, sag: 0.04, color: '#6a665f', finial: false, ns: 3, nt: 6 });
    props.hipRoof(b, { x: 6.4, y: 2.62, z: 1.6, w: 0.9, d: 2.4, h: 0.4, lift: 0.12, flare: 0.08, sag: 0.04, color: '#6a665f', finial: false, ns: 3, nt: 6 });
  }

  // 정자: 기단, 주춧돌, 층 사이 마루, 종장 층 난간, 모임지붕
  function buildPavilion(b) {
    b.box('stone', 3.9, 0.3, 3.1, { p: [-3.4, 0.15, MID.zc], color: '#9a958c', ao: 0.4 });
    b.box('stone', 4.1, 0.08, 3.3, { p: [-3.4, 0.04, MID.zc], color: '#8f8a80', ao: 0.4 });
    for (const x of PILLAR_X) for (const z of [FRONT_Z, BACK_Z]) b.add('stone', kit.cylinder(0.17, 0.2, 0.12, 8), { p: [x, 0.36, z], color: '#a8a296', ao: 0.2 });
    b.box('wood', 3.8, 0.16, 2.9, { p: [-3.4, 1.88, MID.zc], color: WOOD.light, ao: 0 });
    b.box('wood', 3.9, 0.1, 3.0, { p: [-3.4, 3.3, MID.zc], color: WOOD.light, ao: 0 });
    // 종장 층 난간(앞)
    b.box('wood', 3.3, 0.05, 0.06, { p: [-3.4, 3.78, FRONT_Z + 0.08], color: WOOD.dark, ao: 0 });
    for (let i = 0; i < 12; i++) b.box('wood', 0.03, 0.42, 0.03, { p: [-4.95 + i * 0.28, 3.56, FRONT_Z + 0.08], color: WOOD.dark, ao: 0, bevel: 0.006 });
    // 공포(기둥머리)
    for (const x of PILLAR_X) for (const z of [FRONT_Z, BACK_Z]) b.box('paint', 0.34, 0.14, 0.34, { p: [x, 4.5, z], color: T36_COLORS.paint, ao: 0 });
    props.hipRoof(b, { x: -3.4, y: 4.62, z: MID.zc, w: 4.9, d: 4.0, h: 1.05, lift: 0.36, flare: 0.3, color: '#5f5b54' });
    // 정자 앞 초롱
    props.paperLantern(b, { x: -5.15, y: 3.05, z: FRONT_Z + 0.25, scale: 0.6 });
    kit.contactShadow(b, { x: -3.4, z: MID.zc + 0.3, w: 5, d: 4.2 });
  }

  // 서가(칸·덤), 바구니, 돌아온 노래 선반, 서안
  function buildShelves(b) {
    for (const [cx, cz] of [[SHELF.x, SHELF.z], [BONUS.x, BONUS.z]]) {
      b.box('wood', 2.1, 1.5, 0.04, { p: [cx, 0.79, cz - 0.23], color: '#3f3530' });
      for (const dx of [-1.03, 1.03]) b.box('wood', 0.08, 1.56, 0.52, { p: [cx + dx, 0.78, cz], color: WOOD.pillar });
      for (const dx of [-SLOT_DX / 2, SLOT_DX / 2]) b.box('wood', 0.04, 1.3, 0.48, { p: [cx + dx, 0.79, cz], color: WOOD.beam });
      b.box('wood', 2.16, 0.12, 0.54, { p: [cx, 0.06, cz], color: WOOD.beam });
      b.box('paint', 2.2, 0.08, 0.58, { p: [cx, 1.58, cz], color: TOKENS.nokcheong, ao: 0 });
      kit.contactShadow(b, { x: cx, z: cz + 0.15, w: 2.8, d: 1.2 });
    }
    // 바구니(짚 광주리)와 녹청 테
    const prof = [[0, 0], [0.5, 0], [0.56, 0.06], [0.6, 0.3], [0.55, 0.32], [0.5, 0.08], [0, 0.08]].map(([x, y]) => new THREE.Vector2(x, y));
    const lathe = new THREE.LatheGeometry(prof, 16).toNonIndexed();
    lathe.deleteAttribute('uv');
    lathe.computeVertexNormals();
    own.geos.push(lathe);
    b.add('wood', lathe, { p: [BASKET.x, 0, BASKET.z], s: [1.05, 1.1, 0.62], color: T36_COLORS.straw, ao: 0.3 });
    const ring = new THREE.TorusGeometry(0.6, 0.04, 5, 20).rotateX(Math.PI / 2).toNonIndexed();
    ring.deleteAttribute('uv');
    own.geos.push(ring);
    b.add('paint', ring, { p: [BASKET.x, 0.34, BASKET.z], s: [1.05, 1, 0.62], color: TOKENS.nokcheong, ao: 0 });
    kit.contactShadow(b, { x: BASKET.x, z: BASKET.z, w: 1.8, d: 1.1 });
    // 돌아온 노래 선반
    const R = RETURNED;
    b.box('wood', 1.3, 0.9, 0.4, { p: [R.x, 0.45, R.z], color: WOOD.beam });
    b.box('paint', 1.4, 0.06, 0.46, { p: [R.x, 0.93, R.z], color: TOKENS.nokcheong, ao: 0 });
    b.box('wood', 1.2, 0.04, 0.02, { p: [R.x, 0.47, R.z + 0.21], color: WOOD.dark, ao: 0 });
    kit.contactShadow(b, { x: R.x, z: R.z + 0.1, w: 1.9, d: 1.0 });
    // 미리 잰 노래가 기다리는 서안
    b.box('wood', 1.1, 0.06, 0.55, { p: [DESK.x, 0.72, DESK.z], color: WOOD.light });
    for (const dx of [-0.46, 0.46]) b.box('wood', 0.07, 0.7, 0.45, { p: [DESK.x + dx, 0.35, DESK.z], color: WOOD.beam });
    b.box('paint', 0.36, 0.04, 0.46, { p: [DESK.x - 0.1, 0.77, DESK.z], r: [0, 0.2, 0], color: '#efe6d2', ao: 0 });
    kit.contactShadow(b, { x: DESK.x, z: DESK.z, w: 1.6, d: 1.0 });
  }

  // 장터: 뒤로 기와·초가 가게 셋, 엿 가게 좌판(늘어난 층 끝이 얹힌 자리), 좌판 둘과 차양, 등줄, 장대, 종이 오린 사람들
  function buildMarket(b) {
    const zf = -6.6;
    // 가게 셋(앞 +z): 게젓(기와), 주막(초가), 짚신(기와)
    [[7.7, 'tile'], [10.15, 'thatch'], [12.6, 'tile']].forEach(([x, roof], i) => {
      b.box('stone', 2.3, 0.2, 1.7, { p: [x, 0.1, zf - 0.7], color: '#9a958c', ao: 0.4 });
      b.box('paint', 2.2, 2.0, 1.4, { p: [x, 1.2, zf - 0.85], color: i === 1 ? T36_COLORS.mud : '#ddd3bf', ao: 0.15 });
      for (const dx of [-1.05, 1.05]) b.box('wood', 0.14, 2.1, 0.16, { p: [x + dx, 1.25, zf], color: WOOD.pillar });
      b.box('wood', 2.3, 0.16, 0.2, { p: [x, 2.3, zf], color: WOOD.beam });
      props.lattice(b, { x: x - 0.45, y: 0.22, z: zf + 0.02, w: 0.82, h: 1.6, cols: 4 });
      props.lattice(b, { x: x + 0.45, y: 0.22, z: zf + 0.02, w: 0.82, h: 1.6, cols: 4 });
      if (roof === 'tile') kit.giwaRoof(b, { x0: x - 1.4, x1: x + 1.4, zFront: zf + 0.7, zBack: zf - 1.6, yFront: 2.45, yBack: 3.15, lift: 0.2, flare: 0.14, color: '#6a665f' });
      else props.thatch(b, { x, y: 2.35, z: zf - 0.6, w: 2.9, d: 2.2, h: 0.8, ropes: 4 });
      // 가게 앞 물건
      props.jar(b, { x: x - 0.75, z: zf + 0.5, h: 0.55, r: 0.24 });
      if (i !== 1) props.jar(b, { x: x - 0.35, z: zf + 0.65, h: 0.4, r: 0.18, color: '#6b4a34' });
    });
    // 엿 가게 좌판: 늘어난 층 끝이 그 위에 얹혀 있다(엿가락처럼 늘어나 엿 좌판에 기댄 꼴)
    const endM = midAt(MID.x1 - 0.4);
    props.stall(b, { x: 10.2, z: MID.zc, h: endM.yc - endM.hh, w: 1.6, d: 1.0, goods: ['yeot', 'jar', 'yeot'], seed: 2 });
    props.stall(b, { x: 8.4, z: -0.4, h: 1.75, goods: ['fish', 'jar', 'bundle'], seed: 3 });
    props.stall(b, { x: 12.0, z: -1.2, h: 1.75, goods: ['shoes', 'bundle', 'shoes'], seed: 4 });
    // 장터 팻말 장대와 주막 깃대
    b.box('wood', 0.1, 2.6, 0.1, { p: [7.2, 1.3, 0.4], color: WOOD.pillar });
    b.box('wood', 0.08, 3.4, 0.08, { p: [13.32, 1.7, -4.65], color: WOOD.pillar });
    kit.contactShadow(b, { x: 13.32, z: -4.65, w: 0.6, d: 0.6 });
    // 등줄 둘: 가게 앞을 따라, 장터를 가로질러
    props.lanternString(b, { from: [6.9, 2.75, -5.7], to: [13.4, 2.75, -5.7], sag: 0.35, count: 5, scale: 0.42 });
    props.lanternString(b, { from: [7.2, 2.6, 0.4], to: [13.32, 3.2, -4.4], sag: 0.6, count: 4, scale: 0.42 });
    // 종이 오린 사람들(카메라 쪽을 본다)
    const face = (x, z) => Math.atan2(CAM.x - x, CAM.z - z);
    props.cutout(b, { x: 7.7, z: 1.0, kind: 'jige', color: '#5b6b7e', facing: face(7.7, 1.0) });
    props.cutout(b, { x: 9.5, z: -2.0, kind: 'woman', facing: face(9.5, -2.0) });
    props.cutout(b, { x: 11.3, z: 0.4, kind: 'yangban', color: '#3d4f6b', facing: face(11.3, 0.4) + 0.25, scale: 1.05 });
    props.cutout(b, { x: 12.8, z: -3.1, kind: 'child', color: '#9a6a3c', facing: face(12.8, -3.1) });
    props.cutout(b, { x: 8.7, z: -4.6, kind: 'jige', color: '#6e5a48', facing: face(8.7, -4.6) - 0.3, scale: 0.95 });
  }

  // ── 그리기 ──
  function recolorStatic() {
    boxes.forEach((b, i) => boxMesh.setColorAt(i, COL.set(dc(b.c))));
    plaques.material.color.set(mixHex('#9a9a9a', '#ffffff', 0.55 + 0.45 * level));
    scroll.material.color.set(mixHex('#d8d2c6', '#ffffff', level));
    materials.setDancheong(level);
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
    const off = dc(mixHex(TOKENS.meokSoft, TOKENS.juhong, 0.3));
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
      const sp = scrollSpan(x);
      // 풀린 끝 가까이는 조금 들떠 굴대 쪽으로 말려 든다
      const lift = Math.max(0, 1 - (end - x) / 0.6) * 0.08;
      sPos.set([x, sp.top, sp.z + lift, x, sp.bottom, sp.z + lift], j * 6);
      const u = (x - SCROLL.x0) / (SCROLL.x1 - SCROLL.x0);
      sUv.set([u, 1, u, 0], j * 4);
    }
    scrollGeo.attributes.position.needsUpdate = true;
    scrollGeo.attributes.uv.needsUpdate = true;
    scrollGeo.computeBoundingSphere();
    scroll.userData = { feet, endX: end, length: end - SCROLL.x0, overFour: feet > 4 };
    // 굴대: 시작과 끝, 위아래 굴대 머리. 연타 한 번마다 끝 굴대가 잠깐 굵어진다.
    let n = 0;
    [SCROLL.x0, end].forEach((x, i) => {
      const sp = scrollSpan(x);
      const h = sp.top - sp.bottom + 0.3;
      const mid = (sp.top + sp.bottom) / 2;
      const k = i === 1 ? 1 + 0.8 * S.unrollPulse : 1;
      // 끝 굴대에는 아직 감긴 종이가 남아 굵다(풀릴수록 가늘어진다)
      const left = i === 1 ? Math.max(0, 1 - (end - SCROLL.x0) / (SCROLL.x1 - SCROLL.x0)) : 0;
      const d = (0.2 + 0.32 * left) * k;
      const z = sp.z + 0.04 + d / 2;
      const show = scroll.visible;
      rollers.setMatrixAt(n, show ? M4.compose(V.set(x, mid, z), Q.identity(), SC.set(d, h, d)) : HIDE);
      rollers.setColorAt(n++, COL.set(i === 1 && left > 0.02 ? dc(mixHex(TOKENS.hanji, WOOD.beam, 0.25)) : dc(WOOD.beam)));
      for (const y of [sp.top + 0.17, sp.bottom - 0.17]) {
        rollers.setMatrixAt(n, show ? M4.compose(V.set(x, y, z), Q.identity(), SC.set(0.3 * k, 0.12, 0.3 * k)) : HIDE);
        rollers.setColorAt(n++, COL.set(dc(TOKENS.juhong)));
      }
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
        const c = S.bound[area] ? TOKENS.meok : slot ? TOKENS.nokcheong : mixHex(TOKENS.hanji, TOKENS.meokFog, 0.1);
        put([slotX(area, i), BOOK.y0 + BOOK.h / 2, shelfZ(area)], popped ? null : [BOOK.w, BOOK.h, BOOK.d], dc(c));
      }
    }
    for (let i = 0; i < 2; i++) {
      const slot = S.slots.basket[i];
      const show = slot && !S.pops.has('basket:' + i);
      put([slotX('basket', i), 0.42, BASKET.z], show ? [0.17, 0.48, 0.17] : null, dc(TOKENS.hanji));
    }
    for (let i = 0; i < 2; i++) {
      const slot = S.slots.basket[i];
      const show = slot?.to && !S.pops.has('basket:' + i);
      put([slotX('basket', i) + 0.1, 0.56, BASKET.z + 0.1], show ? [0.13, 0.17, 0.02] : null, dc(TOKENS.nokcheong));
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
  [boxMesh, lanterns, books, pops, fog, rollers].forEach((m) => m.computeBoundingSphere());
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
      // 서 있는 것은 두 번째 프레임에 짓는다(관 들어가기 글이 늦지 않게)
      if (!staticGroup && ++frames >= 2) buildStatic();
      // 재질 무늬가 뒤늦게 도착하면 늘어난 층 그림의 민화 띠를 다시 그린다
      if (!atlasHasPattern && patternReady()) {
        atlasHasPattern = true;
        drawAtlas(atlasCanvas.getContext('2d'), pattern.image);
        atlas.needsUpdate = true;
      }
      const moved = model.step(dt, reduce());
      const now = getDancheong(wingId);
      if (now !== level) { level = now; recolorStatic(); drawAll(); return; }
      if (moved) drawAll();
    },
    dispose() {
      for (const o of [...root.children]) root.remove(o);
      if (staticGroup) staticGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      own.geos.forEach((g) => g.dispose());
      own.mats.forEach((m) => m.dispose());
      own.texs.forEach((t) => t.dispose());
      for (const m of [boxMesh, lanterns, books, pops, fog, rollers]) m.dispose?.();
      props.dispose();
      kit.dispose();
      baked.dispose();
      materials.dispose();
      textures.dispose();
    },
  };
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
