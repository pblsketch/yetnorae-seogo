// 향가관 건축(그림만): 신라 절 마당의 돌탑. gfx 꾸러미(js/world/gfx/)의 역할별 합친 기하로 짓는다.
// 탑의 배치(층 높이, 칸 너비, 서가 자리)는 hyangga.js가 넘기고 여기서 바꾸지 않는다. 반응하는 부분(칸 불, 책, 문, 이름표, 먹안개)은
// hyangga.js에 그대로 있고, 여기는 그 뒤와 둘레의 돌·나무·기와만 맡는다.
//
//   탑: 이층 기단(갑석과 탱주 새김) → 층마다 탑신(돌 몸, 우주·탱주, 감실 창) → 층급받침 → 네 귀가 들린 옥개석, 귀마다 풍탁
//       → 꼭대기 상륜부(노반·복발·앙화·보륜·보주).
//   마당: 돌담(돌 기단 + 회벽 + 기와 지붕)과 단청 무늬 판, 작품 방 일주문(기와 지붕·공포), 경장(덤 서가), 석등 둘, 소나무,
//         층 이름 비석, 배례석(기다리는 노래 자리), 박석 길, 대바구니, 돌아온 노래 선반.
import { TOKENS, mixHex } from '../palette.js';
import { WOOD } from '../gfx/t35-wing.js';

const STONE = '#a7a196';        // 화강암
const STONE_DARK = '#8f897f';
const STONE_LIGHT = '#bdb7ab';
const PLASTER = '#e9e0cc';
const NOK = '#5d6f62';          // 뇌록(가라앉은 단청 칠)
const SEOK = '#7d4a3c';         // 석간주
const BRONZE = '#6f6a4e';

export function buildHyanggaArt(gfx, L) {
  const { THREE, kit } = gfx;
  const b = kit.builder();
  const glows = [];
  const T = L.TOWER;
  const cx = T.x0 + T.width / 2;
  const cz = (T.front + T.back) / 2;
  const depth = T.front - T.back;
  const floors = L.FLOORS.length;

  // 가운데가 덮여 보이지 않는 판은 테(앞·옆·뒤 띠 넷)로만 짓는다. 소프트웨어 그리기(SwiftShader)는 가려진 면도 칠하므로
  // 겹치는 넓은 면을 줄이는 것이 프레임을 지킨다. 모서리는 크게 보이는 부분만 깎는다(깎은 상자는 삼각형이 다섯 배).
  const ring = (y, h, w, d, band, color, ao = 0.3, zc = cz) => {
    b.box('stone', w, h, band, { p: [cx, y, zc + d / 2 - band / 2], color, ao, bevel: 0.002 });
    b.box('stone', w, h, band, { p: [cx, y, zc - d / 2 + band / 2], color, ao, bevel: 0.002 });
    b.box('stone', band, h, d - 2 * band, { p: [cx - w / 2 + band / 2, y, zc], color, ao, bevel: 0.002 });
    b.box('stone', band, h, d - 2 * band, { p: [cx + w / 2 - band / 2, y, zc], color, ao, bevel: 0.002 });
  };

  // ── 기단: 하층(넓고 낮게) + 상층(갑석) ──
  ring(0.08, 0.16, T.width + 1.6, depth + 1.3, 0.75, STONE_DARK, 0.6, cz - 0.05);
  ring(0.17, 0.04, T.width + 1.72, depth + 1.42, 0.14, STONE_LIGHT, 0, cz - 0.05);
  ring(0.24, 0.1, T.width + 1.0, depth + 0.8, 0.5, STONE, 0.2, cz - 0.05);
  ring(T.plinth - 0.012, 0.035, T.width + 1.12, depth + 0.92, 0.12, STONE_LIGHT, 0, cz - 0.05);
  // 기단 앞면의 우주·탱주 새김
  for (let i = 0; i <= 6; i++) {
    const x = cx - (T.width + 1.6) / 2 + 0.05 + (i * (T.width + 1.5)) / 6;
    b.box('stone', i % 6 === 0 ? 0.12 : 0.07, 0.12, 0.03, { p: [x, 0.08, cz - 0.05 + (depth + 1.3) / 2 + 0.01], color: STONE_LIGHT, ao: 0, bevel: 0.002 });
  }
  // 앞 계단 두 단
  b.box('stone', 1.5, 0.1, 0.5, { p: [cx, 0.05, T.front + 1.0], color: STONE, ao: 0.4, bevel: 0.02 });
  b.box('stone', 1.3, 0.1, 0.36, { p: [cx, 0.15, T.front + 0.72], color: STONE_LIGHT, ao: 0.3, bevel: 0.02 });
  kit.contactShadow(b, { x: cx, z: cz + 0.6, w: T.width + 2.2, d: 1.6, strength: 1 });

  // ── 탑신과 옥개석 ──
  L.FLOORS.forEach((n, f) => {
    const y0 = L.floorBase(f);
    const H = T.floorH;
    const bw = T.width / n;
    const bodyH = H - 0.24;
    // 돌 몸: 앞·옆 면만(윗면은 옥개석이 덮는다). 감실 창이 그 앞에 붙는다
    const bodyD = depth - 0.34;
    b.add('stone', kit.card(), { p: [cx, y0, T.front - 0.3], s: [T.width - 0.06, bodyH, 1], color: STONE, ao: 0.25 });
    for (const sx of [-1, 1]) b.add('stone', kit.card(), { p: [cx + sx * (T.width / 2 - 0.03), y0, cz - 0.15], r: [0, sx * Math.PI / 2, 0], s: [bodyD, bodyH, 1], color: STONE_DARK, ao: 0.25 });
    // 칸 사이 탱주, 양 끝 우주(10구 층은 4·4·2 무리 경계를 굵게)
    let acc = 0;
    const edges = new Set();
    if (f === floors - 1) for (const g of L.GROUPING) { acc += g; if (acc < n) edges.add(acc); }
    for (let k = 0; k <= n; k++) {
      const corner = k === 0 || k === n;
      const t = corner ? 0.24 : edges.has(k) ? 0.18 : 0.1;
      b.box('stone', t, bodyH, 0.24, { p: [T.x0 + k * bw, y0 + bodyH / 2, T.front - 0.12], color: corner ? STONE_LIGHT : STONE, ao: 0.2, bevel: corner ? 0.02 : 0.002 });
    }
    // 감실 창 테(창 위·아래 돌 띠)
    b.box('stone', T.width + 0.1, 0.08, 0.26, { p: [cx, y0 + 0.2, T.front - 0.12], color: STONE_LIGHT, ao: 0, bevel: 0.002 });
    b.box('stone', T.width + 0.1, 0.1, 0.26, { p: [cx, y0 + bodyH - 0.05, T.front - 0.12], color: STONE_LIGHT, ao: 0, bevel: 0.002 });
    // 층급받침: 위로 갈수록 넓어지는 돌 세 단(앞·옆 띠만, 가운데는 옥개석에 가린다)
    for (let s = 0; s < 3; s++) {
      const grow = 0.12 + s * 0.14;
      const w = T.width + grow;
      const d = depth + grow - 0.2;
      const y = y0 + bodyH + 0.03 + s * 0.06;
      const c = s % 2 ? STONE_LIGHT : STONE_DARK;
      b.box('stone', w, 0.06, 0.3, { p: [cx, y, cz + d / 2 - 0.15], color: c, ao: 0, bevel: 0.002 });
      for (const sx of [-1, 1]) b.box('stone', 0.3, 0.06, d - 0.6, { p: [cx + sx * (w / 2 - 0.15), y, cz], color: c, ao: 0, bevel: 0.002 });
    }
    // 옥개석: 네 귀가 들린 얕은 돌 지붕(아래층일수록 크다)
    const rw = T.width + 1.55 - f * 0.18;
    const rd = depth + 1.45 - f * 0.18;
    // 옥개석은 한 덩이 돌이라 쌓은 돌 무늬 대신 매끈한 결(회벽 역할)에 돌 색을 칠한다
    b.add('plaster', gfx.roofStoneGeometry(rw, rd, 0.34, 0.24, 0.13), { p: [cx, y0 + H + 0.03, cz], color: f % 2 ? '#a39d92' : '#b3ada1', ao: 0.15 });
    // 풍탁(귀마다 매단 작은 종): 청동이 뇌록빛으로 삭았다. 단청 값이 오르면 색이 돌아온다
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = cx + sx * (rw / 2 - 0.05);
        const z = cz + sz * (rd / 2 - 0.05);
        const y = y0 + H + 0.03 + 0.24 - 0.18;
        b.add('wood', kit.cylinder(0.008, 0.008, 0.16, 4), { p: [x, y + 0.08, z], color: WOOD.dark, ao: 0 });
        b.add('paint', kit.cylinder(0.035, 0.06, 0.12, 8), { p: [x, y - 0.02, z], color: NOK, ao: 0 });
      }
    }
  });

  // ── 상륜부 ──
  const top = L.floorBase(floors) + 0.03 + 0.34;
  b.box('stone', 0.8, 0.26, 0.8, { p: [cx, top + 0.1, cz], color: STONE, ao: 0, bevel: 0.03 });                 // 노반
  b.add('stone', new THREE.SphereGeometry(0.32, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(), { p: [cx, top + 0.23, cz], color: STONE_LIGHT, ao: 0 });   // 복발
  b.add('stone', kit.cylinder(0.3, 0.16, 0.14, 8), { p: [cx, top + 0.6, cz], color: STONE, ao: 0 });                   // 앙화
  b.add('paint', kit.cylinder(0.035, 0.035, 1.2, 6), { p: [cx, top + 1.2, cz], color: BRONZE, ao: 0 });                // 찰주
  for (let i = 0; i < 5; i++) b.add('paint', kit.cylinder(0.17 - i * 0.015, 0.19 - i * 0.015, 0.06, 10), { p: [cx, top + 0.78 + i * 0.16, cz], color: BRONZE, ao: 0 });   // 보륜
  b.add('paint', new THREE.SphereGeometry(0.11, 10, 8).toNonIndexed(), { p: [cx, top + 1.86, cz], color: mixHex(BRONZE, TOKENS.gold, 0.5), ao: 0 });   // 보주

  // ── 돌담(뒤): 돌 기단 + 회벽 + 기와 지붕. 작품 방 일주문 자리는 비운다 ──
  const Z = L.BACK_Z;
  const gapL = L.ROOM_DOOR.x - L.ROOM_DOOR.w / 2 - 0.2;
  const gapR = L.ROOM_DOOR.x + L.ROOM_DOOR.w / 2 + 0.2;
  // 탑(가로 4.8m) 바로 뒤 3.4m는 늘 탑에 가리므로 짓지 않는다(가려진 면도 칠하는 비용). 양옆은 카메라를 돌려도 비지 않게 넉넉히 겹친다.
  // 경장(덤 서가, x 3.05~6.15) 뒤도 같은 까닭으로 비운다.
  const wallRuns = [[-6.5, -3.6], [-0.2, gapL], [gapR, 3.5], [5.7, 6.5]];
  const WALL_H = 2.3;
  for (const [x0, x1] of wallRuns) {
    const w = x1 - x0;
    const x = (x0 + x1) / 2;
    b.box('stone', w, 0.62, 0.42, { p: [x, 0.31, Z], color: STONE_DARK, ao: 0.6, bevel: 0.04 });
    b.box('plaster', w, WALL_H - 0.62, 0.3, { p: [x, 0.62 + (WALL_H - 0.62) / 2, Z], color: PLASTER, ao: 0.1, bevel: 0.02 });
    // 벽 기둥(나무)과 그 사이 단청 무늬 판
    const posts = Math.max(1, Math.round(w / 2.2));
    for (let i = 0; i <= posts; i++) b.box('wood', 0.16, WALL_H - 0.62, 0.34, { p: [x0 + 0.08 + (i * (w - 0.16)) / posts, 0.62 + (WALL_H - 0.62) / 2, Z + 0.02], color: WOOD.pillar, ao: 0.1 });
    b.box('wood', w, 0.12, 0.36, { p: [x, WALL_H - 0.06, Z + 0.02], color: WOOD.beam, ao: 0 });
    kit.giwaRoof(b, { x0: x0 - 0.1, x1: x1 + 0.1, zFront: Z + 0.38, zBack: Z - 0.2, yFront: WALL_H + 0.02, yBack: WALL_H + 0.42, lift: 0.08, flare: 0.05, sag: 0.04, color: '#5a5650' });
  }
  // 무늬 판(관 그림 자산이 있으면 그 단청 무늬, 없으면 단청 칠): 먹빛에서 시작해 단청 값과 함께 돌아온다
  const muralB = kit.builder();
  const muralColor = gfx.hasMuralArt() ? '#ffffff' : NOK;
  const panel = (bb, x, y, z) => {
    bb.box('wood', 1.62, 0.06, 0.05, { p: [x, y - 0.55, z + 0.01], color: WOOD.dark, ao: 0 });
    bb.box('wood', 1.62, 0.06, 0.05, { p: [x, y + 0.55, z + 0.01], color: WOOD.dark, ao: 0 });
  };
  muralB.add('paint', kit.card(0, 0, 1.4, 0.8), { p: [-5.45, 0.86, Z + 0.16], s: [1.5, 1.05, 1], uv: 'keep', color: muralColor, ao: 0 });
  panel(b, -5.45, 1.385, Z + 0.16);
  {
    // 오른쪽 담의 무늬 판(관 안쪽을 본다)
    const M = new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(6.29, 0, -3.7));
    gfx.transformed(muralB, M).add('paint', kit.card(0, 0, 1.4, 0.8), { p: [0, 0.86, 0], s: [1.5, 1.05, 1], uv: 'keep', color: muralColor, ao: 0 });
    panel(gfx.transformed(b, M), 0, 1.385, 0);
  }

  // ── 일주문(작품 방): 문기둥(누를 자리, hyangga.js의 인스턴스 상자) 위 공포와 기와 지붕 ──
  const gx = L.ROOM_DOOR.x;
  const gz = Z + 0.12;
  for (const dx of [-1, 1]) {
    b.add('stone', kit.cylinder(0.2, 0.24, 0.16, 8), { p: [gx + dx * (L.ROOM_DOOR.w / 2 + 0.1), 0.08, gz], color: STONE, ao: 0.5 });
    b.box('paint', 0.36, 0.14, 0.36, { p: [gx + dx * (L.ROOM_DOOR.w / 2 + 0.1), 2.66, gz], color: NOK, ao: 0 });
    b.box('paint', 0.8, 0.11, 0.2, { p: [gx + dx * (L.ROOM_DOOR.w / 2 + 0.1), 2.79, gz], color: SEOK, ao: 0 });
  }
  muralB.box('paint', L.ROOM_DOOR.w + 1.0, 0.16, 0.22, { p: [gx, 2.93, gz], color: muralColor, ao: 0 });
  b.box('wood', L.ROOM_DOOR.w + 1.3, 0.14, 0.26, { p: [gx, 3.06, gz], color: WOOD.beam, ao: 0 });
  kit.giwaRoof(b, { x0: gx - 1.35, x1: gx + 1.35, zFront: gz + 0.75, zBack: gz - 0.2, yFront: 3.05, yBack: 3.5, lift: 0.22, flare: 0.18, sag: 0.06, color: '#4f4c47' });
  kit.giwaRoof(gfx.transformed(b, new THREE.Matrix4().makeRotationY(Math.PI).premultiply(new THREE.Matrix4().makeTranslation(2 * gx, 0, 2 * (gz - 0.2) + 0.0))), {
    x0: gx - 1.35, x1: gx + 1.35, zFront: gz - 0.2 + 0.75, zBack: gz - 0.2 + 0.0, yFront: 3.05, yBack: 3.5, lift: 0.22, flare: 0.18, sag: 0.06, color: '#4f4c47', ridge: false,
  });

  // ── 오른쪽 담(다음 관 문까지) ──
  {
    const zA = L.BACK_Z;
    const zB = L.NEXT_DOOR.z - L.NEXT_DOOR.w / 2 - 0.2;
    const w = zB - zA;
    const M = new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(6.45, 0, (zA + zB) / 2));
    const r = gfx.transformed(b, M);
    r.box('stone', w, 0.62, 0.42, { p: [0, 0.31, 0], color: STONE_DARK, ao: 0.6, bevel: 0.04 });
    r.box('plaster', w, WALL_H - 0.62, 0.3, { p: [0, 0.62 + (WALL_H - 0.62) / 2, 0], color: PLASTER, ao: 0.1, bevel: 0.02 });
    r.box('wood', w, 0.12, 0.36, { p: [0, WALL_H - 0.06, 0.02], color: WOOD.beam, ao: 0 });
    for (const t of [-0.5, 0, 0.5]) r.box('wood', 0.16, WALL_H - 0.62, 0.34, { p: [t * (w - 0.16), 0.62 + (WALL_H - 0.62) / 2, 0.02], color: WOOD.pillar, ao: 0.1 });
    kit.giwaRoof(r, { x0: -w / 2 - 0.1, x1: w / 2 + 0.1, zFront: 0.38, zBack: -0.2, yFront: WALL_H + 0.02, yBack: WALL_H + 0.42, lift: 0.08, flare: 0.05, sag: 0.04, color: '#5a5650' });
    // 다음 관 문 위 작은 지붕
    const ND = L.NEXT_DOOR;
    const M2 = new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(6.4, 0, ND.z));
    kit.giwaRoof(gfx.transformed(b, M2), { x0: -ND.w / 2 - 0.55, x1: ND.w / 2 + 0.55, zFront: 0.6, zBack: -0.25, yFront: 2.62, yBack: 2.95, lift: 0.16, flare: 0.12, sag: 0.04, color: '#4f4c47' });
  }

  // ── 경장(덤 서가): 돌 받침 위 나무 장, 세 칸, 작은 기와 지붕 ──
  {
    const bx0 = L.BONUS_X[0] - 0.55;
    const bx1 = L.BONUS_X.at(-1) + 0.55;
    const x = (bx0 + bx1) / 2;
    const w = bx1 - bx0;
    const z = L.BONUS.z;
    const top = L.BONUS.top;
    b.box('stone', w + 0.3, 0.2, 1.0, { p: [x, 0.1, z], color: STONE, ao: 0.5, bevel: 0.03 });
    b.box('wood', w, top - 0.2, 0.74, { p: [x, 0.2 + (top - 0.2) / 2, z], color: WOOD.beam, ao: 0.3 });
    for (let i = 0; i < 3; i++) {
      // 아래 장 문짝(띠살)
      kit.latticeWindow(b, { x: L.BONUS_X[i], y: 0.3, z: z + 0.38, w: 0.86, h: top - 0.42, pattern: 'tti', cols: 5, frame: WOOD.dark });
    }
    b.box('wood', w, 1.66, 0.08, { p: [x, top + 0.83, z - 0.32], color: WOOD.dark, ao: 0 });
    b.box('wood', w + 0.12, 0.1, 0.8, { p: [x, top + 1.68, z], color: WOOD.beam, ao: 0 });
    b.box('wood', w + 0.06, 0.06, 0.78, { p: [x, top + 0.02, z], color: WOOD.beam, ao: 0 });
    kit.giwaRoof(b, { x0: bx0 - 0.3, x1: bx1 + 0.3, zFront: z + 0.75, zBack: z - 0.15, yFront: top + 1.74, yBack: top + 2.1, lift: 0.16, flare: 0.12, sag: 0.04, color: '#55524d' });
    kit.contactShadow(b, { x, z: z + 0.2, w: w + 1, d: 1.6, strength: 0.9 });
  }

  // ── 돌아온 노래 선반(왼쪽): 낮은 나무 장 ──
  {
    const R = L.RETURNED;
    b.box('stone', 0.7, 0.12, 2.0, { p: [R.x, 0.06, R.z], color: STONE, ao: 0.5, bevel: 0.02 });
    b.box('wood', 0.5, 1.08, 1.8, { p: [R.x, 0.66, R.z], color: WOOD.beam, ao: 0.3 });
    b.box('wood', 0.66, 0.06, 1.94, { p: [R.x + 0.05, 1.22, R.z], color: WOOD.dark, ao: 0 });
    for (const dz of [-0.6, 0, 0.6]) kit.latticeWindow(gfx.transformed(b, new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(R.x + 0.26, 0, R.z + dz))), { x: 0, y: 0.24, z: 0, w: 0.52, h: 0.86, pattern: 'grid', cols: 3, rows: 4, frame: WOOD.dark });
    kit.contactShadow(b, { x: R.x + 0.1, z: R.z, w: 1.2, d: 2.4, strength: 0.9 });
  }

  // ── 대바구니 ──
  {
    const B = L.BASKET;
    const bamboo = '#b29b6c';
    b.box('wood', 1.3, 0.4, 0.8, { p: [B.x, 0.22, B.z], color: bamboo, ao: 0.3 });
    for (let i = 0; i < 4; i++) b.box('wood', 1.32, 0.03, 0.82, { p: [B.x, 0.08 + i * 0.1, B.z], color: mixHex(bamboo, '#3f3530', 0.35), ao: 0, bevel: 0.006 });
    for (let i = 0; i < 7; i++) b.box('wood', 0.025, 0.4, 0.82, { p: [B.x - 0.6 + i * 0.2, 0.22, B.z], color: mixHex(bamboo, '#ffffff', 0.15), ao: 0, bevel: 0.005 });
    b.box('wood', 1.38, 0.06, 0.88, { p: [B.x, 0.45, B.z], color: mixHex(bamboo, '#3f3530', 0.45), ao: 0 });
    kit.contactShadow(b, { x: B.x, z: B.z, w: 1.8, d: 1.3, strength: 0.9 });
  }

  // ── 층 이름 비석(층마다 하나, 이름표가 앞에 붙는다) ──
  for (let f = 0; f < floors; f++) {
    const x = L.nicheX(f);
    b.box('stone', 0.96, 0.12, 0.34, { p: [x, 0.06, -1.0], color: STONE_DARK, ao: 0.5, bevel: 0.02 });
    b.box('stone', 0.8, 0.56, 0.14, { p: [x, 0.4, -1.0], color: STONE, ao: 0.3, bevel: 0.02 });
    b.box('stone', 0.9, 0.12, 0.22, { p: [x, 0.74, -1.0], color: STONE_LIGHT, ao: 0, bevel: 0.03 });
  }

  // ── 배례석(기다리는 노래 자리) ──
  b.box('stone', 1.1, 0.3, 0.66, { p: [-1.6, 0.15, 4.4], color: STONE, ao: 0.5, bevel: 0.04 });
  b.box('stone', 1.2, 0.08, 0.76, { p: [-1.6, 0.34, 4.4], color: STONE_LIGHT, ao: 0, bevel: 0.03 });
  kit.contactShadow(b, { x: -1.6, z: 4.4, w: 1.6, d: 1.1, strength: 0.8 });

  // ── 디딤돌(입구 → 탑 계단) ──
  const rnd = gfx.seeded(41);
  for (let z = 3.6, i = 0; z > 0.2; z -= 0.85, i++) {
    const w = 0.62 + rnd() * 0.16;
    b.box('stone', w, 0.06, 0.46 + rnd() * 0.08, { p: [-1.85 + (i % 2 ? 0.16 : -0.16), 0.03, z], r: [0, (rnd() - 0.5) * 0.3, 0], color: mixHex(STONE_LIGHT, STONE, rnd()), ao: 0, bevel: 0.02 });
  }

  // ── 석등 둘, 소나무 ──
  gfx.stoneLantern(b, glows, { x: -5.4, z: -1.7, scale: 1.05 });
  gfx.stoneLantern(b, glows, { x: 5.4, z: 3.4, scale: 1.0 });
  kit.glowCards(b, glows);

  const group = b.build('hyangga-art');
  const mural = muralB.build('hyangga-mural');
  const muralMesh = mural.children[0];
  if (muralMesh) muralMesh.material = gfx.mural();
  group.add(mural);
  return group;
}
