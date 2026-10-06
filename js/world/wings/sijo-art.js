// 시조관 건축(그림만): 돌 기단 위 3층 정자와 돌 받침 계단탑. gfx 꾸러미(js/world/gfx/)의 역할별 합친 기하로 짓는다.
// 배치(층 높이, 기둥 자리, 계단 자리)는 sijo-3d.js가 넘기고 여기서 바꾸지 않는다. 반응하는 부분(앞기둥 불, 창방 불, 계단, 등불, 책,
// 이름표, 먹안개, 지붕 색)은 sijo-3d.js에 그대로 있고, 여기는 그 둘레의 돌·나무·기와만 맡는다.
//
//   정자: 두 단 돌 기단(갑석), 누하주 주춧돌, 층마다 귀틀과 계자 난간, 기둥머리 공포(주두·첨차).
//   아래층 차양 지붕은 두지 않는다: 관 카메라 높이에서 차양이 아래층 창방 불과 층 이름표를 가린다.
//   계단탑: 돌 받침(장대석), 모서리 둥근 기둥과 주춧돌, 오름마다 옆판(층계 보), 앞 난간.
//   담: 돌 기단 + 기와 담장 지붕 + 나무 기둥. 칸 서가의 갓판·발, 대바구니 살, 소나무 한 그루.
import { mixHex } from '../palette.js';
import { WOOD } from '../gfx/t35-wing.js';

const STONE = '#a49e93';
const STONE_DARK = '#8d877d';
const STONE_LIGHT = '#bcb6aa';
const NOK = '#5d6f62';
const SEOK = '#7d4a3c';
const ROOF = '#55524d';

// 정자 지붕(모임지붕): 네 귀가 들린 오목한 지붕과 꼭대기 절병통. sijo-3d.js가 'sijo-roof'로 따로 그린다(색이 단청 값을 따른다)
export function buildSijoRoof(gfx, { x, z, y, w, d }) {
  const { kit } = gfx;
  const b = kit.builder();
  b.add('roof', gfx.roofStoneGeometry(w, d, 1.35, 0.42, 0.16, 14), { p: [x, y, z], color: '#ffffff', ao: 0 });
  // 절병통(꼭대기 항아리 모양 장식)
  b.add('roof', kit.cylinder(0.16, 0.24, 0.16, 8), { p: [x, y + 1.38, z], color: '#d8d2c8', ao: 0 });
  b.add('roof', kit.cylinder(0.08, 0.17, 0.26, 8), { p: [x, y + 1.58, z], color: '#d8d2c8', ao: 0 });
  b.add('roof', kit.cylinder(0.05, 0.08, 0.12, 8), { p: [x, y + 1.76, z], color: '#d8d2c8', ao: 0 });
  return b.build('sijo-roof-art').children[0];
}

export function buildSijoArt(gfx, L) {
  const { THREE, kit } = gfx;
  const b = kit.builder();
  const { F, SH, P, PILLAR_X, FRONT_Z, BACK_Z, ST } = L;
  const pw = P.hx * 2 + 0.3;
  const pd = P.hz * 2 + 0.3;

  // 가려지는 가운데를 빼고 테만 짓는 돌판(소프트웨어 그리기에서 가려진 면도 칠하므로)
  const ring = (cx, cz, y, h, w, d, band, color, ao = 0.3) => {
    b.box('stone', w, h, band, { p: [cx, y, cz + d / 2 - band / 2], color, ao, bevel: 0.002 });
    b.box('stone', w, h, band, { p: [cx, y, cz - d / 2 + band / 2], color, ao, bevel: 0.002 });
    b.box('stone', band, h, d - 2 * band, { p: [cx - w / 2 + band / 2, y, cz], color, ao, bevel: 0.002 });
    b.box('stone', band, h, d - 2 * band, { p: [cx + w / 2 - band / 2, y, cz], color, ao, bevel: 0.002 });
  };

  // ── 정자 돌 기단: 두 단, 갑석 ──
  ring(P.x, P.z, 0.1, 0.2, pw + 1.4, pd + 1.2, 0.7, STONE_DARK, 0.6);
  ring(P.x, P.z, 0.21, 0.03, pw + 1.48, pd + 1.28, 0.12, STONE_LIGHT, 0);
  b.box('stone', pw + 0.6, 0.14, pd + 0.4, { p: [P.x, 0.27, P.z], color: STONE, ao: 0.2, bevel: 0.02 });
  // 기단 앞 디딤돌
  b.box('stone', 1.2, 0.12, 0.42, { p: [P.x - 0.6, 0.06, P.z + (pd + 1.2) / 2 + 0.2], color: STONE_LIGHT, ao: 0.3, bevel: 0.02 });
  kit.contactShadow(b, { x: P.x, z: P.z + 0.9, w: pw + 2.2, d: 1.6, strength: 0.9 });
  // 누하주 주춧돌
  for (const x of PILLAR_X) for (const z of [FRONT_Z, BACK_Z]) b.add('stone', kit.cylinder(0.17, 0.22, 0.14, 8), { p: [x, 0.41, z], color: STONE_LIGHT, ao: 0.3 });

  // ── 층마다: 귀틀, 계자 난간, 기둥머리 공포, 아래층 차양 ──
  F.forEach((y, s) => {
    // 귀틀(마루 가장자리 나무 띠)
    b.box('wood', pw + 0.04, 0.1, 0.12, { p: [P.x, y - 0.1, P.z + pd / 2], color: WOOD.beam, ao: 0 });
    for (const sx of [-1, 1]) b.box('wood', 0.12, 0.1, pd, { p: [P.x + sx * (pw / 2), y - 0.1, P.z], color: WOOD.beam, ao: 0 });
    // 계자 난간: 앞과 옆, 기둥 사이 짧은 살과 위 난간대
    const rz = FRONT_Z + 0.12;
    for (let i = 0; i <= 12; i++) {
      const x = P.x - P.hx + 0.1 + (i * (P.hx * 2 - 0.2)) / 12;
      b.box('wood', 0.035, 0.36, 0.035, { p: [x, y + 0.2, rz], color: WOOD.dark, ao: 0, bevel: 0.004 });
    }
    b.box('wood', P.hx * 2 - 0.1, 0.04, 0.06, { p: [P.x, y + 0.06, rz], color: WOOD.dark, ao: 0 });
    for (const sx of [-1, 1]) {
      const rx = P.x + sx * (P.hx - 0.02);
      for (let i = 0; i <= 6; i++) b.box('wood', 0.035, 0.36, 0.035, { p: [rx, y + 0.2, BACK_Z + 0.1 + (i * (FRONT_Z - BACK_Z - 0.2)) / 6], color: WOOD.dark, ao: 0, bevel: 0.004 });
      b.box('wood', 0.05, 0.05, FRONT_Z - BACK_Z, { p: [rx, y + 0.4, (FRONT_Z + BACK_Z) / 2], color: WOOD.dark, ao: 0 });
    }
    // 기둥머리 공포(앞기둥마다): 주두와 첨차. 반응하는 창방(sijo-3d.js) 바로 위
    for (const x of PILLAR_X) {
      b.box('paint', 0.26, 0.1, 0.26, { p: [x, y + SH - 0.2, FRONT_Z], color: NOK, ao: 0 });
      b.box('paint', 0.6, 0.08, 0.16, { p: [x, y + SH - 0.11, FRONT_Z + 0.02], color: SEOK, ao: 0 });
      b.box('paint', 0.1, 0.07, 0.36, { p: [x, y + SH - 0.12, FRONT_Z + 0.18], r: [0.25, 0, 0], color: NOK, ao: 0 });
    }
  });
  // 꼭대기 층 기둥 위 도리와 처마 받침
  b.box('wood', pw + 0.3, 0.14, 0.18, { p: [P.x, F[2] + SH + 0.04, FRONT_Z], color: WOOD.beam, ao: 0 });

  // ── 계단탑: 돌 받침, 둥근 모서리 기둥, 층계 보, 앞 난간 ──
  const stW = ST.rx1 - ST.lx0;
  const stCx = (ST.rx1 + ST.lx0) / 2;
  const stCz = (ST.zf + ST.zb) / 2;
  b.box('stone', stW + 0.3, 0.12, ST.zf - ST.zb + 0.3, { p: [stCx, 0.06, stCz], color: STONE, ao: 0.5, bevel: 0.02 });
  kit.contactShadow(b, { x: stCx, z: ST.zf + 0.3, w: stW + 1, d: 1.2, strength: 0.8 });
  const top = F[2];
  for (const [x, h] of [[ST.lx0 + 0.05, top], [ST.rx1 - 0.05, top - ST.rise]]) {
    for (const z of [ST.zb + 0.05, ST.zf - 0.05]) {
      b.add('stone', kit.cylinder(0.12, 0.15, 0.12, 8), { p: [x, 0.18, z], color: STONE_LIGHT, ao: 0.3 });
      b.add('wood', kit.cylinder(0.07, 0.08, h - 0.12, 10), { p: [x, 0.12 + (h - 0.12) / 2, z], color: WOOD.pillar });
    }
  }
  // 층계 보(오름마다 바깥쪽 옆판): 앞줄은 왼→오 오르고 뒷줄은 오→왼 오른다
  const RUN = ST.x1 - ST.x0;
  const slope = Math.atan2(ST.rise, RUN);
  const len = Math.hypot(RUN, ST.rise);
  F.forEach((ftop, s) => {
    const y0 = s === 0 ? 0 : F[s - 1];
    b.box('wood', len, 0.12, 0.06, { p: [(ST.x0 + ST.x1) / 2, y0 + ST.rise / 2 - 0.06, ST.laneA + ST.laneW / 2 + 0.03], r: [0, 0, slope], color: WOOD.beam, ao: 0 });
    b.box('wood', len, 0.12, 0.06, { p: [(ST.x0 + ST.x1) / 2, y0 + ST.rise * 1.5 - 0.06, ST.laneB - ST.laneW / 2 - 0.03], r: [0, 0, -slope], color: WOOD.beam, ao: 0 });
    // 앞 난간(층계를 따라 비스듬히)
    b.box('wood', len, 0.04, 0.04, { p: [(ST.x0 + ST.x1) / 2, y0 + ST.rise / 2 + 0.5, ST.laneA + ST.laneW / 2 + 0.03], r: [0, 0, slope], color: WOOD.dark, ao: 0 });
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      b.box('wood', 0.04, 0.5, 0.04, { p: [ST.x0 + t * RUN, y0 + t * ST.rise + 0.25, ST.laneA + ST.laneW / 2 + 0.03], color: WOOD.dark, ao: 0, bevel: 0.004 });
    }
    // 계단참 귀틀
    b.box('wood', ST.rx1 - ST.x1, 0.06, 0.06, { p: [(ST.x1 + ST.rx1) / 2, ftop - ST.rise + 0.02, ST.zf + 0.02], color: WOOD.beam, ao: 0 });
    b.box('wood', ST.x0 - ST.lx0, 0.06, 0.06, { p: [(ST.lx0 + ST.x0) / 2, ftop + 0.02, ST.zf + 0.02], color: WOOD.beam, ao: 0 });
  });

  // ── 담: 돌 기단, 나무 기둥, 기와 담장 지붕(뒤·왼쪽·오른쪽) ──
  const WALL_H = 2.6;
  const walls = [
    { M: new THREE.Matrix4().makeTranslation(0, 0, -6.4), len: 13 },
    { M: new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(-6.45, 0, -2.25)), len: 8.3 },
    { M: new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(6.45, 0, -2.25)), len: 8.3 },
  ];
  for (const { M, len: wl } of walls) {
    const r = gfx.transformed(b, M);
    r.box('stone', wl, 0.5, 0.24, { p: [0, 0.25, 0.04], color: STONE_DARK, ao: 0.5, bevel: 0.02 });
    const n = Math.round(wl / 2.2);
    for (let i = 0; i <= n; i++) r.box('wood', 0.14, WALL_H - 0.5, 0.2, { p: [-wl / 2 + 0.07 + (i * (wl - 0.14)) / n, 0.5 + (WALL_H - 0.5) / 2, 0.06], color: WOOD.pillar, ao: 0.1 });
    r.box('wood', wl, 0.1, 0.22, { p: [0, WALL_H - 0.05, 0.05], color: WOOD.beam, ao: 0 });
    kit.giwaRoof(r, { x0: -wl / 2 - 0.05, x1: wl / 2 + 0.05, zFront: 0.42, zBack: -0.2, yFront: WALL_H, yBack: WALL_H + 0.3, lift: 0.06, flare: 0.04, sag: 0.03, color: ROOF });
  }

  // ── 칸 서가: 갓판과 발 ──
  b.box('wood', 3.32, 0.06, 0.7, { p: [-1.5, 1.11, -1.5], color: WOOD.dark, ao: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('wood', 0.1, 0.12, 0.1, { p: [-1.5 + sx * 1.5, 0.06, -1.5 + sz * 0.25], color: WOOD.dark, ao: 0.3 });
  kit.contactShadow(b, { x: -1.5, z: -1.3, w: 3.8, d: 1.1, strength: 0.9 });

  // ── 대바구니 살 ──
  const bamboo = '#b29b6c';
  for (let k = 0; k < 11; k++) b.box('wood', 0.03, 0.32, 0.025, { p: [1.85 + k * 0.16, 0.16, 2.92], color: mixHex(bamboo, '#ffffff', 0.1), ao: 0.2, bevel: 0.004 });
  b.box('wood', 1.86, 0.05, 1.06, { p: [2.65, 0.34, 2.4], color: mixHex(bamboo, '#3f3530', 0.4), ao: 0 });
  kit.contactShadow(b, { x: 2.65, z: 2.5, w: 2.4, d: 1.5, strength: 0.9 });

  // ── 덤 칸·돌아온 노래 선반·서안 그림자 ──
  kit.contactShadow(b, { x: -5.9, z: -1.6, w: 1.0, d: 3.4, strength: 0.8 });
  kit.contactShadow(b, { x: 5.9, z: 1.2, w: 1.0, d: 3.0, strength: 0.8 });
  kit.contactShadow(b, { x: -3.2, z: 4.0, w: 1.2, d: 0.9, strength: 0.8 });

  // ── 소나무 한 그루(오른쪽 뒤) ──
  kit.paperTree(b, { x: 5.4, z: -5.7, h: 3.6, kind: 'pine', seed: 23, layers: 1 });

  return b.build('sijo-art');
}

