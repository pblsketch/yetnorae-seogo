// 회랑 건축(그림만): 한옥 서고 회랑을 gfx 꾸러미로 짓는다. 배치 값(관 자리, 문, 벽 줄)은 scene3d.js가 넘겨주고,
// 여기서는 그 값을 바꾸지 않는다. 걷는 범위·문 도착·탭 바닥면은 모두 scene3d.js에 그대로 있다.
//
// 돌려주는 무리 둘:
//   gallery  — 회랑에서만 보이는 것: 마루, 벽과 서가, 창살, 기둥·공포·서까래, 기와 처마, 초롱, 난간, 입구 문. 관 안에서는 숨긴다
//              (관 카메라가 회랑 벽 위에 서므로 높은 처마가 관을 가린다).
//   grounds  — 언제나 보이는 것: 마당 바닥, 관 자리 바닥돌과 길, 종이 나무, 수묵 병풍 산.
//
// 단청 칠은 뇌록·석간주처럼 가라앉은 색으로 칠한다. 밝은 녹청·주홍 토큰은 누를 수 있는 것(관 문)에만 남긴다.
// 칠은 단청 값 0에서 먹빛이고 값이 오르면 돌아온다(재질 묶음의 먹빛 걸이).
import { TOKENS, mixHex } from './palette.js';
import { WOOD } from './gfx/kit.js';
import { splitByX } from './gfx/t39-perf.js';

// 관 자리 사이 경계(x). 길게 합친 무리를 이 경계로 나눠 화면 밖 구간을 그리지 않는다(t39-perf.js splitByX)
const chunkEdges = (slotXs) => slotXs.slice(0, -1).map((x, i) => (x + slotXs[i + 1]) / 2);

const PAINT = '#5d6f62';    // 뇌록(가라앉은 녹색)
const ACCENT = '#7d4a3c';   // 석간주(가라앉은 붉은 흙색)
const PLASTER = '#efe6d2';
const GROUND = '#b9ad95';

// 회랑에서만 보이는 건축. 무거워서(부분 수백 개) 처음 회랑을 그릴 때 짓는다(scene3d.js).
export function buildCorridorGallery(THREE, kit, L) {
  const { corridor: C, wallZ, slotXs, doorHalf, slotZ, wingHalf } = L;
  const gallery = kit.builder();
  const glows = [];
  const height = 3.6;
  const sideGap = doorHalf + 0.32;   // 문 둘레 기둥 자리(문틀 기둥 바깥)

  // ── 기둥 자리: 문 양옆과 그 사이를 고르게 나눈 칸 ──
  const segments = [];
  let x = C.x0 + 0.6;
  for (const sx of slotXs) {
    segments.push([x, sx - sideGap]);
    x = sx + sideGap;
  }
  segments.push([x, C.x1 - 0.3]);
  const posts = [];
  const bays = [];
  for (const [a, b] of segments) {
    const n = Math.max(1, Math.round((b - a) / 3.2));
    for (let i = 0; i <= n; i++) posts.push(a + ((b - a) * i) / n);
    for (let i = 0; i < n; i++) bays.push([a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n]);
  }

  // ── 마루와 기단 ──
  const len = C.x1 - C.x0;
  const cx = (C.x0 + C.x1) / 2;
  const depth = C.z1 - wallZ;
  gallery.box('floor', len, 0.12, depth, { p: [cx, -0.06, (wallZ + C.z1) / 2], color: '#c2ab8c', ao: 0, bevel: 0.01 });
  // 귀틀(마루 둘레 굵은 나무)과 남쪽 기단
  gallery.box('wood', len, 0.14, 0.22, { p: [cx, -0.05, C.z1 - 0.05], color: WOOD.beam, ao: 0 });
  gallery.box('stone', len + 0.4, 0.46, 0.5, { p: [cx, -0.27, C.z1 + 0.2], color: '#a29b8f', ao: 0, bevel: 0.03 });
  // 벽 아래·난간 아래 그늘
  kit.contactShadow(gallery, { x: cx, z: wallZ + 0.25, w: len, d: 1.1, strength: 1 });
  kit.contactShadow(gallery, { x: cx, z: C.z1 - 0.2, w: len, d: 0.7, strength: 1 });

  // ── 벽: 칸마다 서가 또는 창 ──
  bays.forEach(([a, b], i) => {
    const w = b - a;
    const mx = (a + b) / 2;
    const kind = i % 3 === 1 ? 'window' : 'shelf';
    gallery.box('plaster', w, height, 0.14, { p: [mx, height / 2, wallZ - 0.06], color: PLASTER, ao: 0.35 });
    gallery.box('wood', w, 0.24, 0.2, { p: [mx, 0.12, wallZ + 0.02], color: WOOD.beam });   // 하인방
    if (kind === 'shelf') {
      kit.bookshelf(gallery, { x: mx, z: wallZ + 0.3, width: Math.min(2.7, w - 0.45), height: 2.35, seed: i + 3 });
      // 서가 위 가로 광창
      kit.latticeWindow(gallery, { x: mx, y: 2.68, z: wallZ + 0.03, w: Math.min(2.4, w - 0.6), h: 0.62, cols: 10, rows: 2 });
    } else {
      // 머름(창 아래 낮은 판벽) + 띠살 창
      gallery.box('wood', w - 0.36, 0.7, 0.12, { p: [mx, 0.59, wallZ + 0.04], color: mixHex(WOOD.beam, '#ffffff', 0.08) });
      for (const k of [-0.25, 0.25]) gallery.box('wood', 0.05, 0.56, 0.14, { p: [mx + k * (w - 0.4), 0.59, wallZ + 0.06], color: WOOD.dark, ao: 0 });
      gallery.box('wood', w - 0.36, 0.1, 0.16, { p: [mx, 0.98, wallZ + 0.05], color: WOOD.beam, ao: 0 });   // 중방
      const ww = (w - 0.6) / 2;
      for (const s of [-1, 1]) kit.latticeWindow(gallery, { x: mx + s * (ww / 2 + 0.02), y: 1.05, z: wallZ + 0.04, w: ww, h: 1.45, pattern: 'tti', cols: 7 });
      gallery.box('wood', w - 0.36, 0.1, 0.16, { p: [mx, 2.55, wallZ + 0.05], color: WOOD.beam, ao: 0 });   // 상방
    }
    // 칸 가운데 앞에 초롱(두 칸마다)
    if (i % 2 === 0) {
      kit.lantern(gallery, glows, { x: mx, y: 2.72, z: wallZ + 0.85, scale: 1 });
      gallery.add('wood', kit.cylinder(0.01, 0.01, 1.2, 4), { p: [mx, 3.65, wallZ + 0.85], color: WOOD.dark, ao: 0 });
    }
  });

  // 문 양옆 좁은 벽과 문 위 벽(인방 위 ~ 창방 아래)
  for (const sx of slotXs) {
    for (const s of [-1, 1]) {
      const a = sx + s * (doorHalf + 0.15);
      const b = sx + s * sideGap;
      gallery.box('plaster', Math.abs(b - a) + 0.02, height, 0.14, { p: [(a + b) / 2, height / 2, wallZ - 0.06], color: PLASTER, ao: 0.35 });
    }
    gallery.box('plaster', sideGap * 2, height - 3.12, 0.14, { p: [sx, (height + 3.12) / 2, wallZ - 0.06], color: PLASTER, ao: 0 });
    // 현판 틀(글자는 scene3d의 현판 그림이 앞에 붙는다)
    gallery.box('wood', 2.42, 0.72, 0.08, { p: [sx, 3.36, wallZ + 0.24], color: WOOD.dark, ao: 0 });
    gallery.box('paint', 2.56, 0.08, 0.1, { p: [sx, 3.74, wallZ + 0.24], color: ACCENT, ao: 0 });
    gallery.box('paint', 2.56, 0.08, 0.1, { p: [sx, 2.98, wallZ + 0.24], color: ACCENT, ao: 0 });
    // 문 앞 디딤돌
    gallery.box('stone', doorHalf * 2 + 0.2, 0.06, 0.55, { p: [sx, 0.03, wallZ + 0.42], color: '#a8a296', ao: 0, bevel: 0.02 });
  }

  // ── 뼈대와 지붕 ──
  const frame = kit.hanokFrame(gallery, { posts, z: wallZ, height, eave: 1.35, paint: PAINT, accent: ACCENT });
  for (const px of posts) kit.contactShadow(gallery, { x: px, z: wallZ + 0.1, w: 0.9, d: 0.7, strength: 1 });
  kit.giwaRoof(gallery, { x0: C.x0 - 0.4, x1: C.x1 + 0.4, zFront: frame.eaveZ + 0.12, zBack: wallZ - 0.9, yFront: frame.eaveY + 0.14, yBack: frame.eaveY + 1.05, lift: 0.3, flare: 0.25, color: '#5b5852' });
  // 관 문 위의 솟은 문루 지붕
  for (const sx of slotXs) {
    kit.giwaRoof(gallery, { x0: sx - 2.3, x1: sx + 2.3, zFront: wallZ + 1.85, zBack: wallZ - 0.5, yFront: frame.eaveY + 0.62, yBack: frame.eaveY + 1.55, lift: 0.32, flare: 0.3, color: '#4f4c47', segX: 12 });
    for (const s of [-1, 1]) {
      // 문루를 받치는 짧은 기둥과 보
      gallery.box('paint', 0.3, 0.22, 2.0, { p: [sx + s * 1.9, frame.eaveY + 0.42, wallZ + 0.75], color: ACCENT });
    }
    gallery.box('paint', 4.0, 0.2, 0.22, { p: [sx, frame.eaveY + 0.5, wallZ + 1.6], color: PAINT });
  }

  // ── 남쪽 난간(낮게: 카메라를 가리지 않게) ──
  const rz = C.z1 - 0.12;
  for (let px = C.x0 + 0.4; px <= C.x1 - 0.2; px += 1.6) {
    gallery.box('wood', 0.1, 0.56, 0.1, { p: [px, 0.28, rz], color: WOOD.beam });
    gallery.box('wood', 0.16, 0.05, 0.16, { p: [px, 0.58, rz], color: WOOD.dark, ao: 0 });
  }
  gallery.add('wood', kit.cylinder(0.035, 0.035, len - 0.4, 8), { p: [cx, 0.53, rz], r: [0, 0, Math.PI / 2], color: WOOD.beam, ao: 0 });
  gallery.box('wood', len - 0.4, 0.06, 0.08, { p: [cx, 0.16, rz], color: WOOD.beam });
  gallery.box('wood', len - 0.4, 0.035, 0.05, { p: [cx, 0.36, rz], color: WOOD.dark, ao: 0 });

  // ── 서쪽 입구 문(서고 문): 큰 기둥 둘, 겹 인방, 공포 ──
  const gx = C.x0 + 0.3;
  for (const gz of [C.z0 + 0.2, C.z1 - 0.2]) {
    gallery.add('stone', kit.cylinder(0.32, 0.38, 0.26, 8), { p: [gx, 0.13, gz], ao: 0.5 });
    gallery.add('wood', kit.cylinder(0.2, 0.22, 4.2, 14), { p: [gx, 2.3, gz], color: WOOD.pillar });
    gallery.box('paint', 0.5, 0.2, 0.5, { p: [gx, 4.45, gz], color: PAINT });
    kit.contactShadow(gallery, { x: gx, z: gz, w: 1.1, d: 1.1 });
  }
  gallery.box('wood', 0.36, 0.34, C.z1 - C.z0 + 0.6, { p: [gx, 4.1, (C.z0 + C.z1) / 2], color: WOOD.beam });
  gallery.box('paint', 0.38, 0.08, C.z1 - C.z0 + 0.62, { p: [gx, 3.9, (C.z0 + C.z1) / 2], color: PAINT, ao: 0 });
  gallery.box('wood', 0.42, 0.24, C.z1 - C.z0 + 1.2, { p: [gx, 4.66, (C.z0 + C.z1) / 2], color: WOOD.beam });
  gallery.box('roof', 1.8, 0.16, C.z1 - C.z0 + 1.8, { p: [gx, 4.9, (C.z0 + C.z1) / 2], color: '#4f4c47', ao: 0 });
  gallery.box('roof', 0.5, 0.26, C.z1 - C.z0 + 1.9, { p: [gx, 5.08, (C.z0 + C.z1) / 2], color: '#45423e', ao: 0 });
  // 동쪽 끝 막는 벽
  gallery.box('plaster', 0.16, height, C.z1 - wallZ, { p: [C.x1 + 0.1, height / 2, (wallZ + C.z1) / 2], color: PLASTER, ao: 0.35 });
  gallery.box('wood', 0.24, height, 0.24, { p: [C.x1 + 0.1, height / 2, C.z1 - 0.1], color: WOOD.pillar });

  kit.glowCards(gallery, glows);
  return splitByX(THREE, gallery.build('corridor-gallery'), chunkEdges(slotXs));
}

// 언제나 보이는 바깥(관 안에서도): 마당, 관 자리 바닥돌과 길, 종이 나무, 수묵 병풍, 먼 산
// opts.screens: gfx/t39-perf.js createInkScreens. 주면 관 뒤 수묵 병풍의 한지·산을 한 번에 칠하는 판으로 짓는다(없으면 kit.inkScreen).
export function buildCorridorGrounds(THREE, kit, L, opts = {}) {
  const { corridor: C, wallZ, slotXs, doorHalf, slotZ, wingHalf } = L;
  const grounds = kit.builder();
  // 꾸밈 겹(관 사이 종이 나무, 먼 수묵 산): 화질 단계 '가장 가볍게'에서 숨기므로 따로 모은다(scene3d.js, quality.js)
  const decor = kit.builder();
  // ── 언제나 보이는 바깥: 마당, 관 자리 바닥돌과 길, 나무, 먼 산 ──
  // 마당(북쪽, 관 바닥보다 조금 낮게)과 회랑 앞(남쪽, 기단 아래)
  // 넓은 마당 바닥면은 두지 않는다: 관 화면의 절반을 덮어 SwiftShader에서 프레임이 1/3로 떨어졌다(점검의 '멈춘 단추' 판정이 흔들림).
  // 마당은 장면 바탕색(한지 먹빛)이 맡는다. 회랑 앞(남쪽)만 기단 아래 좁은 땅을 깐다.
  grounds.box('ground', C.x1 - C.x0 + 20, 0.1, 3.2, { p: [(C.x0 + C.x1) / 2, -0.55, C.z1 + 2.1], color: mixHex(GROUND, '#6f6658', 0.35), ao: 0, bevel: 0.01, uvScale: 0.35 });
  slotXs.forEach((sx, i) => {
    // 관 자리 바닥돌: 관 바닥이 가운데를 덮으므로 둘레 테두리만(겹쳐 그리기를 줄인다)
    const half = wingHalf + 0.3;
    for (const [dx, dz, w, d] of [[0, -half + 0.3, half * 2, 0.6], [0, half - 0.3, half * 2, 0.6], [-half + 0.3, 0, 0.6, half * 2 - 1.2], [half - 0.3, 0, 0.6, half * 2 - 1.2]]) {
      grounds.box('stone', w, 0.08, d, { p: [sx + dx, -0.05, slotZ + dz], color: '#b4ad9f', ao: 0, bevel: 0.03 });
    }
    const z0 = wallZ;
    const z1 = slotZ + wingHalf;
    grounds.box('stone', doorHalf * 2, 0.08, Math.abs(z1 - z0), { p: [sx, -0.045, (z0 + z1) / 2], color: '#aaa396', ao: 0, bevel: 0.02 });
    // 관 사이 마당의 종이 나무(관 둘레를 액자처럼 두른다)
    const mid = sx + 8;
    if (i < slotXs.length - 1) {
      kit.paperTree(decor, { x: mid, z: slotZ - 4.5, h: 3.8, kind: i % 2 ? 'blossom' : 'pine', seed: i + 1, layers: 2 });
      kit.paperTree(decor, { x: mid + 0.4, z: slotZ + 2.5, h: 2.8, kind: i % 2 ? 'pine' : 'blossom', seed: i + 11, layers: 2 });
    }
    // 관 뒤 수묵 병풍(위에서 내려다보는 관 카메라에 보이는 배경 막)과 그 양옆 소나무
    const screen = { x: sx, z: slotZ - wingHalf - 4.5, panels: 8, panelW: 2.3, height: 4.4 };
    if (opts.screens) opts.screens.add(kit, grounds, screen);
    else kit.inkScreen(grounds, screen);
    kit.paperTree(decor, { x: sx - 10.5, z: slotZ - wingHalf - 3.5, h: 4.6, kind: 'pine', seed: i * 7 + 3, layers: 2 });
  });
  // 서쪽 입구 바깥 나무
  kit.paperTree(decor, { x: C.x0 - 3.5, z: -3.5, h: 5, kind: 'pine', seed: 41 });
  kit.paperTree(decor, { x: C.x0 - 5, z: 2.5, h: 4, kind: 'blossom', seed: 42 });
  // 먼 산(수묵 병풍): 관 뒤 멀리
  kit.inkBackdrop(decor, { x0: -120, x1: 220, z: slotZ - 30, height: 18, depthGap: 10 });
  const group = grounds.build('corridor-grounds');
  const decorGroup = decor.build('corridor-decor');
  // 바깥은 관 모형 다음에 그린다(불투명끼리 renderOrder가 크면 나중에). 관 바닥이 덮은 자리는 깊이 검사로 건너뛰어
  // 넓은 마당을 겹쳐 칠하지 않는다. 마당이 가장 마지막.
  if (opts.screens) group.add(opts.screens.build('corridor-grounds-screens'));
  for (const m of [...group.children, ...decorGroup.children]) if (!m.material.transparent) m.renderOrder = m.name.endsWith('-ground') ? 2 : 1;
  group.add(decorGroup);
  return group;
}

export function buildCorridorArt(THREE, kit, L) {
  return { gallery: buildCorridorGallery(THREE, kit, L), grounds: buildCorridorGrounds(THREE, kit, L) };
}


export const CORRIDOR_ART_COLORS = { PAINT, ACCENT, PLASTER, GROUND, ink: TOKENS.meok };
