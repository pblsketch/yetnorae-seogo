// 고려가요관 건축(그림만): 똑같이 생긴 한옥 방이 줄지은 행랑. gfx 꾸러미(js/world/gfx/)의 역할별 합친 기하로 짓는다.
// 배치는 goryeo-state.js의 L3를 그대로 따르고 바꾸지 않는다. 방의 벽·창호지·문틀처럼 '똑같은 방'을 이루는 판은
// goryeo-3d.js의 고정 상자 하나(InstancedMesh)에 남고, 여기는 그 위에 얹는 한옥의 뼈대만 맡는다.
//
//   방마다(일곱 번 똑같이): 주춧돌·둥근 기둥·주두·첨차·창방·도리·서까래(반 크기 한옥 뼈대), 맞배 기와지붕(앞뒤 두 면),
//     띠살 문 한 쌍과 양옆 살창, 문 위의 후렴 현판(되울림 무늬).
//   복도: 돌 기단 위 툇마루, 방 사이 등롱 기둥의 갓과 받침.
//   작품 방 「정석가」: 더 큰 뼈대와 지붕. 칸·덤 서가의 갓판·발, 바구니의 대살, 다음 관 문 지붕, 매화와 소나무.
import { TOKENS, mixHex } from '../palette.js';
import { WOOD } from '../gfx/t35-wing.js';

const STONE = '#a49e93';
const STONE_LIGHT = '#bab4a8';
const NOK = '#5d6f62';
const SEOK = '#7d4a3c';
const ROOF = '#55524d';
const S = 0.5;   // 한옥 뼈대 축척(관 방은 사람 키보다 작은 모형이다)

// 되울림 무늬(후렴 현판): 고리 하나에서 퍼지는 물결 세 겹. 글자가 아닌 무늬다.
function echoCanvas() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 96);
  g.strokeStyle = TOKENS.meok;
  g.lineCap = 'round';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(36, 48, 13, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 3; i++) {
    g.lineWidth = 5 - i;
    g.globalAlpha = 1 - i * 0.22;
    g.beginPath();
    g.arc(36, 48, 26 + i * 16, -0.75, 0.75);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#9b3a2e';
  g.fillRect(104, 66, 14, 14);
  return c;
}

export function buildGoryeoArt(gfx, L3, STANZA_ROOMS) {
  const { THREE, kit } = gfx;
  const b = kit.builder();
  const glows = [];
  const R = L3.room;
  const scaled = (x, z, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(S, S, S));
  // 기와지붕도 반 크기 축척으로 짓는다(막새·망와가 방 크기에 맞게 작아진다). 값은 m로 받아 축척으로 나눈다
  const smallRoof = (bb, M, r) => kit.giwaRoof(gfx.transformed(bb, M.clone().multiply(new THREE.Matrix4().makeScale(S, S, S))), {
    ...r, x0: r.x0 / S, x1: r.x1 / S, zFront: r.zFront / S, zBack: r.zBack / S, yFront: r.yFront / S, yBack: r.yBack / S, lift: r.lift / S, flare: r.flare / S, sag: r.sag / S,
  });
  const I = new THREE.Matrix4();
  const mirrorZ = (x, z) => new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeRotationY(Math.PI)).multiply(new THREE.Matrix4().makeTranslation(-x, 0, -z));

  // ── 돌 기단과 툇마루(방 줄 전체) ──
  const CO = L3.corridor;
  const D = L3.roomDoor;
  const x0 = CO.x0 - 0.1;
  const x1 = Math.max(CO.x1, D.x + D.w / 2) + 0.1;
  b.box('stone', x1 - x0, 0.12, D.zFront - D.zBack + 1.55, { p: [(x0 + x1) / 2, 0.06, (CO.z1 + D.zBack - 0.2) / 2], color: STONE, ao: 0.5, bevel: 0.03 });
  b.box('stone', x1 - x0 + 0.08, 0.03, 0.18, { p: [(x0 + x1) / 2, 0.12, CO.z1 + 0.02], color: STONE_LIGHT, ao: 0, bevel: 0.01 });
  b.box('floor', CO.x1 - CO.x0, 0.06, CO.z1 - CO.z0, { p: [(CO.x0 + CO.x1) / 2, CO.top - 0.03, (CO.z0 + CO.z1) / 2], color: WOOD.light, ao: 0, bevel: 0.01 });
  // 툇마루 귀틀(앞 가장자리 나무 띠)
  b.box('wood', CO.x1 - CO.x0, 0.07, 0.1, { p: [(CO.x0 + CO.x1) / 2, CO.top - 0.03, CO.z1 - 0.03], color: WOOD.beam, ao: 0 });
  kit.contactShadow(b, { x: (x0 + x1) / 2, z: CO.z1 + 0.25, w: x1 - x0 + 0.6, d: 0.9, strength: 0.7 });

  // ── 똑같은 연 방 일곱 ──
  const frameOpts = { posts: [-R.w, R.w], z: 0, height: (R.h + 0.2) / S, eave: 1.35, paint: NOK, accent: SEOK, rafterGap: 0.4 };
  const decal = [];
  for (let i = 0; i < STANZA_ROOMS; i++) {
    const x = L3.roomX(i);
    roomShell(b, x, R.zFront, R.zBack, R.w, frameOpts, i);
    // 띠살 문 한 쌍(가운데)과 양옆 살창
    kit.latticeWindow(b, { x: x - 0.125, y: 0.22, z: R.zFront + 0.06, w: 0.25, h: 0.98, pattern: 'tti', cols: 3 });
    kit.latticeWindow(b, { x: x + 0.125, y: 0.22, z: R.zFront + 0.06, w: 0.25, h: 0.98, pattern: 'tti', cols: 3 });
    for (const dx of [-0.425, 0.425]) kit.latticeWindow(b, { x: x + dx, y: 0.62, z: R.zFront + 0.06, w: 0.3, h: 0.6, pattern: 'grid', cols: 3, rows: 4 });
    // 후렴 현판: 문 위 나무 테 + 한지 판(무늬는 따로 한 장)
    b.box('wood', 0.56, 0.3, 0.04, { p: [x, 1.38, R.zFront + 0.07], color: WOOD.dark, ao: 0 });
    b.box('paper', 0.48, 0.23, 0.02, { p: [x, 1.38, R.zFront + 0.095], color: '#f4ecd8', ao: 0 });
    decal.push([x, 1.38, R.zFront + 0.108]);
  }
  // 방 사이 등롱: 갓과 받침(불빛은 goryeo-3d.js의 등불 인스턴스가 반응해 켠다)
  for (let g = 0; g < STANZA_ROOMS; g++) {
    const gx = L3.gapX(g);
    b.add('stone', kit.cylinder(0.08, 0.1, 0.06, 8), { p: [gx, CO.top + 0.03, L3.lanternZ], color: STONE, ao: 0.4 });
    b.add('wood', kit.cylinder(0.05, 0.2, 0.07, 8), { p: [gx, L3.lanternY + 0.17, L3.lanternZ], color: WOOD.dark, ao: 0 });
    b.add('wood', kit.cylinder(0.14, 0.12, 0.04, 8), { p: [gx, L3.lanternY - 0.15, L3.lanternZ], color: WOOD.dark, ao: 0 });
    b.add('paint', kit.cylinder(0.012, 0.03, 0.08, 5), { p: [gx, L3.lanternY - 0.21, L3.lanternZ], color: SEOK, ao: 0 });
    glows.push({ x: gx, y: L3.lanternY, z: L3.lanternZ + 0.15, size: 0.55 });
  }

  // ── 작품 방 「정석가」: 더 큰 뼈대와 지붕 ──
  roomShell(b, D.x, D.zFront, D.zBack, D.w, { ...frameOpts, posts: [-D.w, D.w], height: (D.h + 0.2) / S }, 'door');
  for (const dx of [-0.68, 0.68]) kit.latticeWindow(b, { x: D.x + dx, y: 0.7, z: D.zFront + 0.05, w: 0.3, h: 0.7, pattern: 'grid', cols: 3, rows: 4 });

  function roomShell(bb, x, zFront, zBack, w, opts, tag) {
    kit.hanokFrame(gfx.transformed(bb, scaled(x, zFront)), opts);
    const zr = (zFront + zBack) / 2;
    const eaveY = (opts.height + 1.08 - 1.35 * 0.24) * S + 0.02;
    const ridgeY = eaveY + 0.55 + (tag === 'door' ? 0.08 : 0);
    const half = w / 2 + 0.1;
    const roof = { x0: x - half, x1: x + half, zFront: zFront + 0.72, zBack: zr, yFront: eaveY, yBack: ridgeY, lift: 0.1, flare: 0.08, sag: 0.05, color: ROOF };
    smallRoof(bb, I, roof);
    smallRoof(bb, mirrorZ(x, zr), { ...roof, ridge: false });
    // 박공(옆 삼각 벽)은 회벽
    for (const sx of [-1, 1]) {
      const tri = new THREE.BufferGeometry();
      const yb = (opts.height * S);
      const px = x + sx * (w / 2 - 0.01);
      const verts = sx < 0
        ? [px, yb, zFront, px, yb, zBack, px, ridgeY - 0.05, zr]
        : [px, yb, zBack, px, yb, zFront, px, ridgeY - 0.05, zr];
      tri.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      tri.computeVertexNormals();
      bb.add('plaster', tri, { color: '#e2d8c2', ao: 0 });
    }
    kit.contactShadow(bb, { x, z: zr, w: w + 0.7, d: zFront - zBack + 0.7, strength: 0.6 });
  }

  // ── 칸·덤 서가: 갓판(위로 조금 내민 판), 발, 옆 귀 장식 ──
  for (const area of ['shelf', 'bonus']) {
    const s = L3.shelves[area];
    const W = s.pitch * 3 - 0.1;
    const yTop = s.y0 + s.innerH;
    b.box('wood', W + 0.22, 0.06, s.depth + 0.1, { p: [s.cx, yTop + 0.13, s.cz], color: WOOD.dark, ao: 0 });
    for (const sx of [-1, 1]) {
      b.box('wood', 0.1, 0.1, s.depth + 0.12, { p: [s.cx + sx * (W / 2 + 0.06), yTop + 0.19, s.cz], r: [0, 0, sx * 0.5], color: WOOD.dark, ao: 0 });
      for (const sz of [-1, 1]) b.box('wood', 0.1, 0.12, 0.1, { p: [s.cx + sx * (W / 2 - 0.05), 0.06, s.cz + sz * (s.depth / 2 - 0.05)], color: WOOD.dark, ao: 0.3 });
    }
    // 뒤판의 살(창호 결)
    for (let k = 1; k < 6; k++) b.box('wood', 0.02, s.innerH, 0.02, { p: [s.cx - W / 2 + (W * k) / 6, (s.y0 + yTop) / 2, s.cz - s.depth / 2 + 0.04], color: WOOD.rafter, ao: 0 });
    kit.contactShadow(b, { x: s.cx, z: s.cz + 0.1, w: W + 0.8, d: s.depth + 0.8, strength: 0.9 });
  }

  // ── 바구니: 대살과 테 ──
  {
    const B = L3.basket;
    const bamboo = '#b29b6c';
    for (let k = 0; k < 9; k++) {
      const x = B.cx - B.w / 2 + 0.08 + (k * (B.w - 0.16)) / 8;
      b.box('wood', 0.03, B.h, 0.025, { p: [x, B.h / 2, B.cz + B.d / 2 + 0.035], color: mixHex(bamboo, '#ffffff', 0.1), ao: 0.2, bevel: 0.005 });
      b.box('wood', 0.03, B.h, 0.025, { p: [x, B.h / 2, B.cz - B.d / 2 - 0.035], color: bamboo, ao: 0.2, bevel: 0.005 });
    }
    b.box('wood', B.w + 0.1, 0.05, 0.06, { p: [B.cx, B.h, B.cz + B.d / 2 + 0.03], color: mixHex(bamboo, '#3f3530', 0.4), ao: 0 });
    b.box('wood', B.w + 0.1, 0.05, 0.06, { p: [B.cx, B.h, B.cz - B.d / 2 - 0.03], color: mixHex(bamboo, '#3f3530', 0.4), ao: 0 });
    kit.contactShadow(b, { x: B.cx, z: B.cz, w: B.w + 0.6, d: B.d + 0.6, strength: 0.9 });
  }

  // ── 돌아온 노래 선반, 기다리는 노래 서안: 갓판과 그림자 ──
  {
    const RS = L3.returnedShelf;
    b.box('wood', 1.1, 0.05, 0.56, { p: [RS.cx, 0.77, RS.cz], color: WOOD.dark, ao: 0 });
    kit.contactShadow(b, { x: RS.cx, z: RS.cz, w: 1.4, d: 0.9, strength: 0.9 });
    const LE = L3.lectern;
    b.box('wood', 0.5, 0.06, 0.32, { p: [LE.x, 0.04, LE.z], color: WOOD.dark, ao: 0.3 });
    kit.contactShadow(b, { x: LE.x, z: LE.z, w: 0.9, d: 0.7, strength: 0.8 });
  }

  // ── 다음 관 문: 문지방 돌과 작은 지붕 ──
  {
    const ND = L3.nextDoor;
    b.box('stone', 0.4, 0.08, 1.5, { p: [ND.x, 0.04, ND.z], color: STONE, ao: 0.3, bevel: 0.02 });
    const M = new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(ND.x, 0, ND.z));
    const nr = { x0: -0.9, x1: 0.9, zFront: 0.45, zBack: -0.25, yFront: 2.3, yBack: 2.62, lift: 0.12, flare: 0.08, sag: 0.03, color: ROOF };
    smallRoof(b, M, nr);
    smallRoof(b, M.clone().multiply(mirrorZ(0, -0.25)), { ...nr, ridge: false });
  }

  // ── 나무: 매화 한 그루(왼쪽 앞). 둘레의 소나무는 세계 바탕이 심어 두었다 ──
  kit.paperTree(b, { x: -5.9, z: 3.5, h: 3.2, kind: 'blossom', seed: 5, layers: 2 });
  kit.glowCards(b, glows);

  const group = b.build('goryeo-art');

  // 후렴 현판 무늬(한 장 무늬를 일곱 판이 나눠 쓴다). 먹빛 걸이를 달아 단청 값과 함께 붉은 낙관이 돌아온다
  const tex = new THREE.CanvasTexture(echoCanvas());
  tex.colorSpace = THREE.SRGBColorSpace;
  const decalMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3, depthWrite: false });
  gfx.inkHook(decalMat, 0.3);
  const quad = new THREE.PlaneGeometry(0.42, 0.315);
  const decals = new THREE.InstancedMesh(quad, decalMat, decal.length);
  const m4 = new THREE.Matrix4();
  decal.forEach(([x, y, z], i) => decals.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  decals.name = 'goryeo-art-refrain';
  decals.renderOrder = 3;
  decals.userData.own = [tex, decalMat];
  group.add(decals);
  return group;
}
