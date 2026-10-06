// 시조관 3D 모형(spec 3.1·6·8·14·17). 반응하는 부분은 InstancedMesh로 그린다:
//   고정 상자 · 기둥 · 반응 상자(창방·계단·등불) · 지붕 · 책 · 이름표(글자 그림 한 장) · 먹안개 → 일곱 번.
// 둘레 건축(돌 기단, 난간, 공포, 차양, 계단탑 기둥·보, 기와 담장, 소나무)은 sijo-art.js가 gfx 꾸러미로 두 번째 프레임에 짓는다(역할마다 한 번).
// 재질은 먹빛에서 시작해 세계 바탕의 단청 값(palette.js)에 맞춰 단청색으로 돌아온다. 그림자는 쓰지 않는다.
import { TOKENS, dancheongColor, getDancheong, mixHex, onDancheong } from '../palette.js';
import {
  AREAS, BINDABLE, FEET, FINAL_STEPS, MAX_STEPS, MENTOR_LABEL, ROOM_LABEL, STOREYS, createSijoModel,
} from './sijo-model.js';
import { createWingGfx } from '../gfx/t35-wing.js';
import { buildSijoArt, buildSijoRoof } from './sijo-art.js';

// ── 배치(1 = 1m, 원점은 관 바닥 가운데, +z가 카메라 쪽) ──
const F = [1.2, 2.4, 3.6];                 // 초장·중장·종장 마루 높이(누각처럼 들어 올린 정자)
const SH = 1.2;                            // 층 높이
const P = { x: -1.4, z: -3.8, hx: 1.9, hz: 1.4 };   // 정자 가운데와 반너비
const PILLAR_X = [-1.8, -0.6, 0.6, 1.8].map((d) => P.x + d);
const FRONT_Z = P.z + P.hz - 0.1;
const BACK_Z = P.z - P.hz + 0.1;
// 계단탑: 정자 오른쪽. 층마다 앞줄 계단 → 오른쪽 계단참 → 뒷줄 계단 → 왼쪽 계단참(그 층 마루 입구).
const ST = { x0: 1.45, x1: 3.85, lx0: 0.65, rx1: 4.65, laneA: -1.2, laneB: -2.0, laneW: 0.8, zf: -0.8, zb: -2.4, rise: 0.6 };
const RUN = ST.x1 - ST.x0;
const BOOK_T = 0.2;                        // 책 두께
const BOOK_H = 0.72;                       // 책 높이
const MERGE = 0.22;                        // 묶일 때 책 사이 간격(자리 간격 1m에 대한 비율)

// ── 색(먹빛 → 단청) ──
const C = {
  wood: mixHex(TOKENS.meokSoft, TOKENS.gold, 0.35),
  floor: mixHex(TOKENS.hanjiDeep, TOKENS.meokSoft, 0.45),
  wall: mixHex(TOKENS.hanji, TOKENS.hanjiDeep, 0.5),
  roof: mixHex(TOKENS.meok, TOKENS.nokcheong, 0.25),
  eave: mixHex(TOKENS.meok, TOKENS.nokcheong, 0.45),
  pillar: TOKENS.juhong,
  beam: TOKENS.nokcheong,
  step: mixHex(TOKENS.meokSoft, TOKENS.hanjiDeep, 0.35),
  finalStep: TOKENS.juhong,
  ghost: TOKENS.meokFog,
  shelf: mixHex(TOKENS.meokSoft, TOKENS.gold, 0.2),
  plate: TOKENS.nokcheong,
  basket: mixHex(TOKENS.gold, TOKENS.hanjiDeep, 0.45),
  cushion: mixHex(TOKENS.juhong, TOKENS.hanjiDeep, 0.5),
  door: TOKENS.meok,
  doorFrame: TOKENS.juhong,
  lintel: TOKENS.nokcheong,
  blank: TOKENS.hanji,
  book: TOKENS.meokSoft,
  stick: TOKENS.juhong,
  gold: TOKENS.gold,
  thread: TOKENS.juhong,
  tag: TOKENS.hanji,
};
const LIT = mixHex(TOKENS.gold, TOKENS.hanji, 0.45);    // 불 켜진 색(빛이므로 먹빛으로 바래지 않는다)
const GHOST_LIT = TOKENS.hanji;
const HINT = 0.45;   // 상호작용과 판정 표시(종장 첫 계단, 삐져나온 부분)는 먹빛에서도 이만큼 색이 남는다

export function create3D(ctx) {
  const { THREE, root } = ctx;
  const wingId = ctx.wing?.id ?? 'sijo';
  const reduce = () => !!ctx.reduceMotion?.();
  let level = ctx.restored ? 1 : getDancheong(wingId);
  const model = createSijoModel({ restored: ctx.restored || level >= 1 });

  const group = new THREE.Group();
  group.name = 'sijo-diorama';
  root.add(group);
  const gfx = createWingGfx(THREE, { assets: ctx.assets, wingId });
  const art = gfx.deferred(() => buildSijoArt(gfx, { F, SH, P, PILLAR_X, FRONT_Z, BACK_Z, ST }));
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Q0 = new THREE.Quaternion();
  const ZERO = V(0, 0, 0);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const qY = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a);
  const qZ = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a);

  function instanced(name, geo, mat, count) {
    const mesh = new THREE.InstancedMesh(geo === gfx.bevelBox() ? geo : keep(geo), keep(mat), count);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) { mesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); mesh.setColorAt(i, col.set(TOKENS.meokSoft)); }
    group.add(mesh);
    return mesh;
  }
  function setBox(mesh, i, pos, size, q = Q0) {
    mesh.setMatrixAt(i, m4.compose(pos, q, size));
  }
  function hide(mesh, i) { mesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); }
  const ink = (hex) => dancheongColor(hex, level);
  const hint = (hex) => dancheongColor(hex, Math.max(level, HINT));   // 먹빛에서도 조금 남는 단청 기운

  // ── 고정 상자: 벽, 마루, 누하주, 난간, 계단참, 서가, 바구니, 문, 서안 ──
  const fixed = [];
  const tags = {};   // 부분 이름 → 상자 번호들(점검과 다른 화면이 부분을 찾을 때 쓴다)
  const box = (p, s, c, tag) => {
    if (tag) (tags[tag] ??= []).push(fixed.length);
    fixed.push({ p, s, c });
  };
  // 벽(앞은 열어 둔다)
  box([0, 1.3, -6.4], [13, 2.6, 0.15], C.wall);
  box([-6.45, 1.3, -2.25], [0.15, 2.6, 8.3], C.wall);
  box([6.45, 1.3, -2.25], [0.15, 2.6, 8.3], C.wall);
  // 정자: 누하주(마루 아래 짧은 기둥), 마루 셋, 처마판, 난간, 종장 위 도리
  for (const x of PILLAR_X) {
    box([x, F[0] / 2, FRONT_Z], [0.2, F[0], 0.2], C.wood);
    box([x, F[0] / 2, BACK_Z], [0.2, F[0], 0.2], C.wood);
  }
  F.forEach((y, s) => {
    box([P.x, y - 0.07, P.z], [P.hx * 2 + 0.3, 0.14, P.hz * 2 + 0.3], C.floor);
    box([P.x, y + 0.4, FRONT_Z + 0.06], [P.hx * 2 - 0.2, 0.05, 0.05], C.wood);          // 난간대
  });
  box([P.x, F[2] + SH - 0.04, P.z], [P.hx * 2 + 0.3, 0.1, P.hz * 2 + 0.3], C.wood);
  // 계단참: 층마다 둘(오른쪽 중간참, 왼쪽 마루 입구참) → 3장 6구
  F.forEach((top) => {
    const mid = top - ST.rise;
    box([(ST.x1 + ST.rx1) / 2, mid - 0.06, (ST.zf + ST.zb) / 2], [ST.rx1 - ST.x1, 0.12, ST.zf - ST.zb], C.floor, 'landing');
    box([(ST.lx0 + ST.x0) / 2, top - 0.06, (ST.zf + ST.zb) / 2], [ST.x0 - ST.lx0, 0.12, ST.zf - ST.zb], C.floor, 'landing');
  });
  // 칸(서가, 자리 셋): 정자 앞. 자리마다 녹청 받침판
  box([-1.5, 0.06, -1.5], [3.1, 0.12, 0.6], C.shelf);
  box([-1.5, 1.04, -1.5], [3.1, 0.08, 0.6], C.shelf);
  box([-3.02, 0.55, -1.5], [0.08, 1.0, 0.6], C.shelf);
  box([0.02, 0.55, -1.5], [0.08, 1.0, 0.6], C.shelf);
  box([-1.5, 0.55, -1.78], [3.1, 1.0, 0.04], C.shelf);
  for (let i = 0; i < 3; i++) box([-2.5 + i, 0.125, -1.4], [0.5, 0.02, 0.3], C.plate);
  // 덤 칸(왼쪽 벽 서가)
  box([-6.0, 0.06, -1.6], [0.6, 0.12, 3.1], C.shelf);
  box([-6.0, 1.04, -1.6], [0.6, 0.08, 3.1], C.shelf);
  box([-6.0, 0.55, -3.12], [0.6, 1.0, 0.08], C.shelf);
  box([-6.0, 0.55, -0.08], [0.6, 1.0, 0.08], C.shelf);
  for (let i = 0; i < 3; i++) box([-5.9, 0.125, -2.6 + i], [0.3, 0.02, 0.5], C.plate);
  // 돌아온 노래 선반(오른쪽 벽)
  box([6.0, 0.06, 1.2], [0.6, 0.12, 2.7], C.shelf);
  box([6.0, 0.9, 1.2], [0.6, 0.06, 2.7], C.shelf);
  box([6.0, 0.48, -0.12], [0.6, 0.9, 0.06], C.shelf);
  box([6.0, 0.48, 2.52], [0.6, 0.9, 0.06], C.shelf);
  // 바구니(자리 둘)
  box([2.65, 0.16, 2.4], [1.8, 0.32, 1.0], C.basket);
  box([2.65, 0.33, 2.4], [0.06, 0.06, 1.0], C.wood);
  // 작품 방 문(오른쪽 벽) — 「십 년을 경영하야」
  box([6.36, 1.1, -4.2], [0.05, 2.0, 1.2], C.door);
  box([6.3, 1.15, -4.85], [0.16, 2.3, 0.14], C.doorFrame);
  box([6.3, 1.15, -3.55], [0.16, 2.3, 0.14], C.doorFrame);
  box([6.3, 2.33, -4.2], [0.2, 0.16, 1.5], C.lintel);
  // 다음 관 문(뒷벽)
  box([-5.0, 1.0, -6.31], [1.1, 2.0, 0.05], C.door);
  box([-5.62, 1.1, -6.25], [0.14, 2.2, 0.16], C.doorFrame);
  box([-4.38, 1.1, -6.25], [0.14, 2.2, 0.16], C.doorFrame);
  box([-5.0, 2.22, -6.25], [1.4, 0.16, 0.2], C.lintel);
  // 미리 잰 노래가 기다리는 서안(입구 쪽)
  box([-3.2, 0.4, 4.0], [0.7, 0.8, 0.45], C.wood);
  box([-3.2, 0.82, 4.0], [0.85, 0.05, 0.6], C.shelf);
  // 선대 사서의 자리(종장): 방석과 서안
  box([P.x - 0.3, F[2] + 0.05, P.z - 0.85], [0.7, 0.1, 0.7], C.cushion);
  box([P.x - 0.3, F[2] + 0.15, P.z - 0.2], [0.9, 0.3, 0.5], C.wood);

  // 판은 모서리를 깎은 상자에 회벽 결(인스턴스 크기로 무늬 좌표를 잡는다)
  const fixedMesh = instanced('sijo-fixed', gfx.bevelBox(), gfx.boxMaterial('plaster', { tile: 1.2 }), fixed.length);
  fixed.forEach((b, i) => setBox(fixedMesh, i, V(...b.p), V(...b.s)));
  fixedMesh.userData.tags = tags;

  // ── 기둥: 앞기둥 12(층마다 넷, 반응) + 뒷기둥 12 ──
  const pillarCount = STOREYS.length * FEET;
  const pillarGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  const pillars = instanced('sijo-pillars', pillarGeo, gfx.boxMaterial('wood', { tile: 1.6 }), pillarCount * 2);
  for (let s = 0; s < STOREYS.length; s++) {
    for (let c = 0; c < FEET; c++) {
      setBox(pillars, s * FEET + c, V(PILLAR_X[c], F[s] + SH / 2, FRONT_Z), V(0.18, SH, 0.18));
      setBox(pillars, pillarCount + s * FEET + c, V(PILLAR_X[c], F[s] + SH / 2, BACK_Z), V(0.16, SH, 0.16));
    }
  }

  // ── 반응 상자: 창방 셋, 계단 전부, 맞지 않는 계단, 등불 ──
  const steps = [];   // { p, s, base, final?: k, ghost?: k }
  F.forEach((top, s) => {
    const y0 = s === 0 ? 0 : F[s - 1];
    const nA = s === 2 ? FINAL_STEPS : 4;   // 종장으로 오르는 첫 계단만 세 칸
    for (let k = 0; k < nA; k++) {
      const h = ST.rise / nA;
      const t = y0 + (k + 1) * h;
      steps.push({ p: [ST.x0 + (k + 0.5) * RUN / nA, t - (h + 0.06) / 2, ST.laneA], s: [RUN / nA, h + 0.06, ST.laneW], base: s === 2 ? C.finalStep : C.step, final: s === 2 ? k : undefined });
    }
    for (let k = 0; k < 4; k++) {
      const h = ST.rise / 4;
      const t = y0 + ST.rise + (k + 1) * h;
      steps.push({ p: [ST.x1 - (k + 0.5) * RUN / 4, t - (h + 0.06) / 2, ST.laneB], s: [RUN / 4, h + 0.06, ST.laneW], base: C.step });
    }
  });
  for (let k = FINAL_STEPS; k < MAX_STEPS; k++) {
    const h = ST.rise / FINAL_STEPS;
    const t = F[1] + (k + 1) * h;
    steps.push({ p: [ST.x0 + (k + 0.5) * RUN / FINAL_STEPS, t - (h + 0.06) / 2, ST.laneA], s: [RUN / FINAL_STEPS * 0.9, h + 0.06, ST.laneW * 0.9], base: C.ghost, ghost: k });
  }
  const BEAM0 = 0;
  const STEP0 = STOREYS.length;
  const LANTERN = STEP0 + steps.length;
  const reactive = instanced('sijo-reactive', gfx.bevelBox(), gfx.boxMaterial('stone', { tile: 1.0 }), LANTERN + 1);
  for (let s = 0; s < STOREYS.length; s++) setBox(reactive, BEAM0 + s, V(P.x, F[s] + SH - 0.32, FRONT_Z + 0.02), V(P.hx * 2 + 0.2, 0.12, 0.16));
  const finalIdx = [];
  const ghostIdx = [];
  steps.forEach((st, i) => {
    if (st.final !== undefined) finalIdx[st.final] = STEP0 + i;
    if (st.ghost !== undefined) ghostIdx[st.ghost] = STEP0 + i;
    if (st.ghost === undefined) setBox(reactive, STEP0 + i, V(...st.p), V(...st.s));
  });
  reactive.userData.index = { beams: [BEAM0, BEAM0 + 1, BEAM0 + 2], finalSteps: finalIdx.slice(0, FINAL_STEPS), ghostSteps: ghostIdx.slice(FINAL_STEPS), lantern: LANTERN };
  const stepIndexOf = (k) => (k < FINAL_STEPS ? finalIdx[k] : ghostIdx[k]);
  const stepTop = (k) => {
    const st = steps[stepIndexOf(k) - STEP0];
    return V(st.p[0], st.p[1] + st.s[1] / 2, st.p[2]);
  };

  // ── 지붕(종장 위 모임지붕: 네 귀가 들린 기와지붕과 절병통). 색은 재질 색이 단청 값을 따른다 ──
  const roof = buildSijoRoof(gfx, { x: P.x, z: P.z, y: F[2] + SH + 0.12, w: P.hx * 2 + 1.9, d: P.hz * 2 + 1.9 });
  keep(roof.geometry);
  const roofMat = keep(gfx.materials.fresh('roof'));
  roof.material = roofMat;
  roof.name = 'sijo-roof';
  group.add(roof);

  // ── 책 자리 ──
  // rot: 책 기준 좌표(+x 두께, +y 높이, +z 서가 밖)를 관 좌표로 돌리는 회전
  const holders = [];
  const holderAt = (area, index, pos, rot, scale = 1) => holders.push({ area, index, pos, rot, scale });
  for (let i = 0; i < AREAS.shelf; i++) holderAt('shelf', i, V(-2.5 + i, 0.12 + BOOK_H / 2, -1.5), Q0);
  for (let i = 0; i < AREAS.bonus; i++) holderAt('bonus', i, V(-6.0, 0.12 + BOOK_H / 2, -2.6 + i), qY(Math.PI / 2));
  for (let i = 0; i < AREAS.basket; i++) holderAt('basket', i, V(2.25 + i * 0.8, 0.32 + BOOK_T / 2, 2.4), qZ(Math.PI / 2));
  holderAt('mentor', 0, V(P.x - 0.3, F[2] + 0.3 + BOOK_H * 0.7 / 2, P.z - 0.2), Q0, 0.7);
  for (let i = 0; i < AREAS.returned; i++) holderAt('returned', i, V(6.0, 0.12 + BOOK_H / 2, 0.3 + i * 0.6), qY(-Math.PI / 2));
  const SEG_MAX = 8;
  const THREADS = BINDABLE.length * 2;
  const books = instanced('sijo-books', new THREE.BoxGeometry(1, 1, 1), gfx.boxMaterial('hanji', { tile: 0.6 }), holders.length * SEG_MAX + THREADS);
  books.userData.holders = Object.fromEntries(holders.map((h, n) => [h.area + ':' + h.index, n * SEG_MAX]));
  books.userData.segMax = SEG_MAX;
  const middleOf = (area) => holders.find((h) => h.area === area && h.index === 1);

  // 자리의 실제 위치(묶일 때 가운데로 모인다, 바구니에서 튀어나올 때 들린다)
  function holderPos(h) {
    const pos = h.pos.clone();
    const p = BINDABLE.includes(h.area) ? model.bindProgress(h.area, reduce()) : 0;
    if (p > 0) {
      const mid = middleOf(h.area).pos;
      pos.sub(mid).multiplyScalar(1 + (MERGE - 1) * p).add(mid);
    }
    const st = model.state.holders[h.area][h.index];
    if (h.area === 'basket' && st.pop) pos.y += 0.5 * (reduce() ? 1 : Math.min(1, st.pop.p));
    return pos;
  }

  // ── 이름표(글자 그림 한 장): 층 이름 셋, 작품 방 문, 선대 사서의 자리, 책등 제목 ──
  const CELL = 256;
  const GRID = 4;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CELL * GRID;
  const g2 = canvas.getContext('2d');
  const labelTex = keep(new THREE.CanvasTexture(canvas));
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const labels = [];   // { kind: 'plaque'|'spine', w, h, place() → { pos, right, up } , text() }
  const fwd = (q) => V(0, 0, 1).applyQuaternion(q);
  const right = (q) => V(1, 0, 0).applyQuaternion(q);
  const up = (q) => V(0, 1, 0).applyQuaternion(q);
  STOREYS.forEach((name, s) => labels.push({ kind: 'plaque', w: 0.7, h: 0.18, text: () => name, place: () => ({ pos: V(P.x, F[s] + SH - 0.52, FRONT_Z + 0.1), right: V(1, 0, 0), up: V(0, 1, 0) }) }));
  labels.push({ kind: 'plaque', w: 1.6, h: 0.3, text: () => ROOM_LABEL, place: () => ({ pos: V(6.18, 2.6, -4.2), right: V(0, 0, 1), up: V(0, 1, 0) }) });
  labels.push({ kind: 'plaque', w: 0.85, h: 0.17, text: () => MENTOR_LABEL, place: () => ({ pos: V(P.x - 0.3, F[2] + 0.15, P.z + 0.06), right: V(1, 0, 0), up: V(0, 1, 0) }) });
  for (const h of holders) {
    if (h.area === 'basket') continue;
    labels.push({
      kind: 'spine', w: 0.15 * h.scale, h: 0.6 * h.scale, holder: h,
      text: () => model.titleOf(h.area, h.index),
      place: () => ({ pos: holderPos(h).add(fwd(h.rot).multiplyScalar(0.26 * h.scale)), right: right(h.rot), up: up(h.rot) }),
    });
  }
  const labelGeo = new THREE.BufferGeometry();
  const lpos = new Float32Array(labels.length * 4 * 3);
  const luv = new Float32Array(labels.length * 4 * 2);
  const lidx = [];
  labels.forEach((l, i) => {
    const cx = (i % GRID) * CELL;
    const cy = Math.floor(i / GRID) * CELL;
    const rw = l.kind === 'plaque' ? CELL : CELL * 0.25;
    const rh = l.kind === 'plaque' ? CELL * 0.25 : CELL;
    l.rect = { x: cx, y: cy, w: rw, h: rh };
    const u0 = cx / canvas.width; const u1 = (cx + rw) / canvas.width;
    const v1 = 1 - cy / canvas.height; const v0 = 1 - (cy + rh) / canvas.height;
    luv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    const b = i * 4;
    lidx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  labelGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3).setUsage(THREE.DynamicDrawUsage));
  labelGeo.setAttribute('uv', new THREE.BufferAttribute(luv, 2));
  labelGeo.setIndex(lidx);
  const labelMesh = new THREE.Mesh(keep(labelGeo), keep(new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, alphaTest: 0.08 })));
  labelMesh.name = 'sijo-labels';
  labelMesh.frustumCulled = false;
  group.add(labelMesh);
  let labelSig = '';
  const family = (typeof getComputedStyle === 'function' && document.body ? getComputedStyle(document.body).fontFamily : '') || 'serif';

  function drawLabels() {
    const texts = labels.map((l) => l.text() ?? '');
    const sig = texts.join('|') + '#' + level.toFixed(2);
    if (sig === labelSig) return false;
    labelSig = sig;
    g2.clearRect(0, 0, canvas.width, canvas.height);
    labels.forEach((l, i) => {
      const t = texts[i];
      if (!t) return;
      const r = l.rect;
      if (l.kind === 'plaque') {
        g2.fillStyle = ink(TOKENS.meok);
        g2.fillRect(r.x, r.y, r.w, r.h);
        g2.fillStyle = TOKENS.hanji;
        g2.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
        g2.fillStyle = TOKENS.meok;
        const size = Math.min(40, (r.w - 20) / Math.max(2, t.length) * 1.1);
        g2.font = `bold ${size}px ${family}`;
        g2.textAlign = 'center';
        g2.textBaseline = 'middle';
        g2.fillText(t, r.x + r.w / 2, r.y + r.h / 2 + 2);
      } else {
        const chars = [...t.replace(/\s+/g, '')];
        const size = Math.min(r.w * 0.8, (r.h - 12) / chars.length);
        g2.fillStyle = TOKENS.gold;
        g2.font = `bold ${size}px ${family}`;
        g2.textAlign = 'center';
        g2.textBaseline = 'middle';
        chars.forEach((ch, k) => g2.fillText(ch, r.x + r.w / 2, r.y + 6 + size * (k + 0.5)));
      }
    });
    labelTex.needsUpdate = true;
    return true;
  }

  function placeLabels() {
    labels.forEach((l, i) => {
      const { pos, right: rv, up: uv } = l.place();
      const rx = rv.multiplyScalar(l.w / 2);
      const uy = uv.multiplyScalar(l.h / 2);
      const pts = [pos.clone().sub(rx).sub(uy), pos.clone().add(rx).sub(uy), pos.clone().add(rx).add(uy), pos.clone().sub(rx).add(uy)];
      pts.forEach((p, k) => lpos.set([p.x, p.y, p.z], (i * 4 + k) * 3));
    });
    labelGeo.attributes.position.needsUpdate = true;
  }

  // ── 먹안개: 바닥에 깔린 반투명 판들 ──
  const FOG_N = 8;
  const fogMat = keep(new THREE.MeshBasicMaterial({ map: gfx.softSpot(), color: TOKENS.meokFog, transparent: true, opacity: 0.45, depthWrite: false }));
  const fogMesh = instanced('sijo-fog', new THREE.CircleGeometry(0.5, 20), fogMat, FOG_N);
  const fogSpots = [[-4.2, 0.12, 1.8, 4.5], [-1.0, 0.16, 3.2, 5], [2.6, 0.14, 0.6, 4], [4.4, 0.1, 3.8, 3.5], [-4.4, 0.18, -1.0, 3.8], [0.4, 0.2, -0.2, 3.2], [3.6, 0.13, -4.6, 3.6], [-2.6, 0.11, 5.2, 4.2]];
  const flat = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);

  function refreshFog() {
    const f = model.fog();
    fogMesh.visible = f > 0.001;
    fogMat.opacity = 0.45 * f;
    const spread = 1 + (1 - f) * 0.6;
    fogSpots.forEach(([x, y, z, s], i) => {
      setBox(fogMesh, i, V(x * spread, y, z * spread), V(s * spread, s * 0.7 * spread, 1), flat);
      fogMesh.setColorAt(i, col.set(TOKENS.meokFog));
    });
    fogMesh.instanceMatrix.needsUpdate = true;
    fogMesh.instanceColor.needsUpdate = true;
  }

  // ── 색과 모양 새로 그리기 ──
  function refreshFixedColors() {
    gfx.setDancheong(level);
    fixed.forEach((b, i) => fixedMesh.setColorAt(i, col.set(ink(b.c))));
    fixedMesh.instanceColor.needsUpdate = true;
    roofMat.color.set(ink(C.roof));
  }

  function refreshReactive() {
    const r = reduce();
    for (let i = 0; i < pillarCount; i++) {
      pillars.setColorAt(i, col.set(mixHex(ink(C.pillar), LIT, model.pillarGlow(i, r))));
      pillars.setColorAt(pillarCount + i, col.set(ink(C.pillar)));
    }
    pillars.instanceColor.needsUpdate = true;
    for (let s = 0; s < STOREYS.length; s++) reactive.setColorAt(BEAM0 + s, col.set(mixHex(ink(C.beam), LIT, model.beamGlow(s, r))));
    steps.forEach((st, i) => {
      const idx = STEP0 + i;
      let c = st.final !== undefined ? hint(st.base) : ink(st.base);
      if (st.final !== undefined && model.stepState(st.final) === 'lit') c = LIT;
      if (st.ghost !== undefined) {
        const state = model.stepState(st.ghost);
        if (state === 'hidden') hide(reactive, idx);
        else { setBox(reactive, idx, V(...st.p), V(...st.s)); c = GHOST_LIT; }
      }
      reactive.setColorAt(idx, col.set(c));
    });
    const lan = model.lantern(r);
    if (lan) {
      const top = stepTop(lan.step);
      setBox(reactive, LANTERN, top.add(V(0, 0.12 + 0.25 * lan.hop, 0)), V(0.16, 0.2, 0.16));
    } else {
      hide(reactive, LANTERN);
    }
    reactive.setColorAt(LANTERN, col.set(LIT));
    reactive.instanceMatrix.needsUpdate = true;
    reactive.instanceColor.needsUpdate = true;
  }

  const segColor = { blank: () => ink(C.blank), book: () => ink(C.book), stick: () => hint(C.stick), gold: () => C.gold, tag: () => ink(C.tag) };

  function refreshBooks() {
    const r = reduce();
    const mentorGlow = model.mentorGlow(r);
    holders.forEach((h, n) => {
      const segs = model.segmentsOf(h.area, h.index, r);
      const base = holderPos(h);
      for (let k = 0; k < SEG_MAX; k++) {
        const i = n * SEG_MAX + k;
        const sg = segs[k];
        if (!sg) { hide(books, i); continue; }
        const thick = sg.kind === 'gold' ? BOOK_T * 0.4 : sg.kind === 'tag' ? BOOK_T * 0.5 : sg.kind === 'blank' ? BOOK_T * 0.9 : BOOK_T;
        const local = V(0, ((sg.y[0] + sg.y[1]) / 2 - 0.5) * BOOK_H, (sg.z[0] + sg.z[1]) / 2).multiplyScalar(h.scale);
        const size = V(thick, (sg.y[1] - sg.y[0]) * BOOK_H, sg.z[1] - sg.z[0]).multiplyScalar(h.scale);
        setBox(books, i, base.clone().add(local.applyQuaternion(h.rot)), size, h.rot);
        let c = segColor[sg.kind]?.() ?? ink(C.book);
        if (h.area === 'mentor' && sg.kind !== 'blank' && mentorGlow > 0) c = mixHex(c, LIT, mentorGlow * 0.7);
        books.setColorAt(i, col.set(c));
      }
    });
    // 묶은 실: 가운데로 모인 세 권을 두 줄로 감는다
    BINDABLE.forEach((area, a) => {
      const p = model.bindProgress(area, r);
      const mid = middleOf(area);
      for (let t = 0; t < 2; t++) {
        const i = holders.length * SEG_MAX + a * 2 + t;
        if (p <= 0) { hide(books, i); continue; }
        const off = V(0, (t === 0 ? -0.2 : 0.2) * BOOK_H, 0.01).applyQuaternion(mid.rot);
        setBox(books, i, mid.pos.clone().add(off), V((BOOK_T * 3 + 0.12) * p, 0.035, 0.54), mid.rot);
        books.setColorAt(i, col.set(ink(C.thread)));
      }
    });
    books.instanceMatrix.needsUpdate = true;
    books.instanceColor.needsUpdate = true;
  }

  function refreshAll() {
    refreshReactive();
    refreshBooks();
    drawLabels();
    placeLabels();
    refreshFog();
  }

  refreshFixedColors();
  refreshAll();

  const offDancheong = onDancheong((id, v) => {
    if (id !== wingId) return;
    level = v;
    refreshFixedColors();
    refreshAll();
  });

  // ── 상호작용 자리(관 기준 좌표) ──
  const anchors = {
    slots: [0, 1, 2].map((i) => V(-2.5 + i, 0.5, -0.8)),
    bonus: [0, 1, 2].map((i) => V(-5.3, 0.5, -2.6 + i)),
    basket: V(2.65, 0.4, 3.2),
    returnedShelf: V(5.3, 0.5, 1.2),
    roomDoor: V(5.5, 1.1, -4.2),
    entrance: V(-3.2, 0.8, 4.6),
    nextDoor: V(-5.0, 1.0, -5.6),
    mentorSeat: V(P.x - 0.3, F[2] + 0.3, P.z + 0.6),
    camera: { position: V(0.2, 9.6, 12.6), target: V(0.2, 2.1, -1.6) },
  };
  // 약속 밖의 자리(누를 자리로 만들지 않는다): 떠도는 노래가 떠 있을 곳, 재기 화면 왼쪽 반이 비출 곳
  const areas = {
    floating: [V(-3.6, 1.5, 1.4), V(-1.2, 1.8, 2.4), V(0.9, 1.6, 0.9), V(2.6, 1.9, 1.3), V(4.3, 1.7, 3.9)],
    focus: { stairs: stepTop(1).clone(), pillars: V(P.x, F[1] + SH / 2, FRONT_Z), pavilion: V(P.x, F[1], P.z) },
  };

  return {
    anchors,
    areas,
    react(name, detail) {
      if (model.react(name, detail)) refreshAll();
    },
    update(dt) {
      art.tick(group);
      if (model.tick(dt, reduce())) refreshAll();
    },
    dispose() {
      offDancheong();
      root.remove(group);
      art.dispose();
      for (const d of disposables) d.dispose?.();
      disposables.length = 0;
      gfx.dispose();
    },
  };
}
