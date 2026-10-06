// 절차 3D 인물: 코드로 조립한 낮은 다각형 인형(장난감 같은 약 3등신)과 코드로 움직이는 뼈대.
//  - 부분(머리, 저고리, 소매, 바지, 버선 신, 가방 …)은 모두 '설계 좌표'(발 가운데 원점, 정면 +z, 키 1.62m)로 적고
//    뼈 하나에 붙인다. 부분은 한 기하로 합치고 뼈 무게(skinIndex·skinWeight)를 달아 SkinnedMesh 하나로 그린다.
//    그래서 몸 전체가 그리기 호출 하나, 먹 테두리(뒤집은 껍질)가 하나, 발밑 그림자가 하나다.
//    무게는 거의 다 한 뼈에 1이다(굳은 부분). 긴 두루마기 자락처럼 다리를 따라야 하는 곳만 두 뼈에 나눈다.
//  - 재질은 한지 결 무늬 + 꼭짓점 색이다. 꼭짓점 색에 부드러운 AO(바닥 가까이, 아랫면, 몸 안쪽)가 구워진다.
//    살갗·얼굴 무늬는 결을 쓰지 않는다(무늬 좌표를 한 점에 둔다).
//  - 움직임: 걸음(다리·팔 흔들기, 무릎 굽힘, 몸 들썩임, 허리 비틀기, 소매·가방·술 흔들림)은 움직이는 빠르기에 맞춘다.
//    가만히 있으면 숨쉬기와 고개 돌리기. 가는 쪽을 부드럽게 돌아본다.
//    움직임 줄이기면 들썩임·흔들림·숨쉬기·고개 돌리기를 모두 끄고 팔다리만 작게 움직이며, 방향은 바로 바꾼다.
//
// 인물을 더할 때: RECIPES에 kind 이름으로 함수 하나를 더한다(gfx/README.md '절차 3D 인물').
//   RECIPES['mentor'] = (p) => { p.lathe('torso', …); p.ell('head', …); … }
import { TOKENS } from '../palette.js';

export const DESIGN_HEIGHT = 1.62;
const STRIDE = 1.25;        // 걸음 한 바퀴(두 걸음)에 나아가는 거리(설계 m)
const OUTLINE = 0.011;      // 먹 테두리 두께(설계 m)
const OUTLINE_COLOR = '#3a332d';

// 사람 뼈대: [이름, 부모, 설계 좌표(쉼 자세의 자리)]. 팔은 어깨, 다리는 엉덩이 관절에서 돈다.
const HUMANOID = [
  ['hips', null, [0, 0.62, 0]],
  ['torso', 'hips', [0, 0.62, 0]],
  ['head', 'torso', [0, 1.1, 0]],
  ['armL', 'torso', [0.175, 1.02, 0]],
  ['foreL', 'armL', [0.185, 0.83, 0]],
  ['sleeveL', 'armL', [0.19, 0.86, 0]],
  ['armR', 'torso', [-0.175, 1.02, 0]],
  ['foreR', 'armR', [-0.185, 0.83, 0]],
  ['sleeveR', 'armR', [-0.19, 0.86, 0]],
  ['thighL', 'hips', [0.085, 0.6, 0]],
  ['shinL', 'thighL', [0.085, 0.32, 0]],
  ['thighR', 'hips', [-0.085, 0.6, 0]],
  ['shinR', 'thighR', [-0.085, 0.32, 0]],
  ['bag', 'torso', [0, 1.0, 0]],
  ['tassel', 'torso', [0, 0.85, 0.14]],
];

// ───────── 한지 결 무늬(색 없는 밝은 결, 꼭짓점 색이 색을 맡는다) ─────────
let clothTex = null;
let clothUsers = 0;
function clothTexture(THREE) {
  if (!clothTex) {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    let s = 9127;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // 잔 얼룩
    for (let i = 0; i < 70; i++) {
      const v = 228 + rnd() * 27;
      g.fillStyle = `rgba(${v | 0},${v | 0},${(v - 4) | 0},0.35)`;
      const r = 6 + rnd() * 16;
      g.beginPath();
      g.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2);
      g.fill();
    }
    // 닥 섬유
    for (let i = 0; i < 90; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const a = rnd() * Math.PI * 2;
      const len = 5 + rnd() * 16;
      g.strokeStyle = rnd() < 0.65 ? 'rgba(120,110,95,0.16)' : 'rgba(255,255,255,0.6)';
      g.lineWidth = 0.5 + rnd() * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.7) * len * 0.5, y + Math.sin(a + 0.7) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    clothTex = new THREE.CanvasTexture(c);
    clothTex.colorSpace = THREE.SRGBColorSpace;
    clothTex.wrapS = THREE.RepeatWrapping;
    clothTex.wrapT = THREE.RepeatWrapping;
    clothTex.name = 'figure-cloth';
  }
  clothUsers++;
  return clothTex;
}
function releaseCloth() {
  if (--clothUsers <= 0) { clothTex?.dispose(); clothTex = null; clothUsers = 0; }
}

// ───────── 부분을 모으는 틀 ─────────
// 모든 부분은 설계 좌표로 놓는다. opts: color, flat(살갗처럼 결 없이), ao(바닥 AO 세기), cav(몸 안쪽 그늘),
//   line(먹 테두리 두께 배수, 0이면 테두리 없음), shade(밝기 배수), weights(v => [[뼈, 무게], …]), seg(둘레 나눔)
function partCollector(THREE, boneIndex) {
  const parts = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const tmpM = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  const mat = (p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => {
    e.set(r[0], r[1], r[2]);
    q.setFromEuler(e);
    return new THREE.Matrix4().compose(new THREE.Vector3(...p), q.clone(), new THREE.Vector3(...s));
  };
  const push = (bone, geo, matrix, o = {}) => {
    if (!(bone in boneIndex)) throw new Error('[figure] 모르는 뼈: ' + bone);
    parts.push({ bone: boneIndex[bone], geo, matrix, color: o.color ?? '#ffffff', flat: !!o.flat, ao: o.ao ?? 1, cav: !!o.cav, line: o.line ?? 1, shade: o.shade ?? 1, weights: o.weights ?? null });
  };

  return {
    parts,
    // 타원체: 가운데 pos, 반지름 [rx, ry, rz]
    ell(bone, pos, radii, o = {}) {
      const seg = o.seg ?? 10;
      const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)), 0, Math.PI * 2, o.theta0 ?? 0, o.thetaLen ?? Math.PI);
      push(bone, g, mat(pos, o.r, radii), o);
    },
    // 두 점 사이 원기둥(a 쪽 반지름 ra, b 쪽 반지름 rb)
    tube(bone, a, b, ra, rb, o = {}) {
      const A = new THREE.Vector3(...a);
      const B = new THREE.Vector3(...b);
      const d = B.clone().sub(A);
      const len = d.length();
      const g = new THREE.CylinderGeometry(rb, ra, len, o.seg ?? 10, 1, !!o.open);
      const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(o.sx ?? 1, 1, o.sz ?? 1));
      push(bone, g, m, o);
    },
    // 돌림 기하: pts = [[반지름, 높이], …](아래에서 위로 적으면 바깥을 본다). 가운데 pos, z 납작 sz
    lathe(bone, pts, o = {}) {
      const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), o.seg ?? 16);
      push(bone, g, mat(o.pos ?? [0, 0, 0], o.r, [o.sx ?? 1, 1, o.sz ?? 1]), o);
    },
    box(bone, pos, size, o = {}) {
      const g = new THREE.BoxGeometry(1, 1, 1);
      push(bone, g, mat(pos, o.r, size), o);
    },
    torus(bone, pos, R, tube, o = {}) {
      const g = new THREE.TorusGeometry(R, tube, o.radial ?? 4, o.tubular ?? 12, o.arc ?? Math.PI * 2);
      push(bone, g, mat(pos, o.r, o.s ?? [1, 1, 1]), o);
    },
    // 어떤 기하든
    add(bone, geo, matrix, o = {}) { push(bone, geo, matrix ?? tmpM.identity().clone(), o); },
  };
}

// 머리(타원체) 앞면 위의 점: 얼굴 장식을 붙일 때
const HEAD = { c: [0, 1.33, 0.005], r: [0.205, 0.215, 0.19] };
function onHead(x, y, out = 0) {
  const nx = x / HEAD.r[0];
  const ny = (y - HEAD.c[1]) / HEAD.r[1];
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const z = HEAD.c[2] + HEAD.r[2] * nz;
  // 겉면 법선 쪽 돌림(대략)
  const ry = Math.atan2(nx / HEAD.r[0], nz / HEAD.r[2]);
  const rx = -Math.atan2(ny / HEAD.r[1], nz / HEAD.r[2]);
  return { p: [x, y, z + out], r: [rx, ry, 0] };
}

// ───────── 공통 부분 ─────────
const SKIN = '#fde6d0';
const BLUSH = '#eaa596';
const EYE = '#231f1d';

function face(p, { brows = '#2b2622', glasses = null } = {}) {
  p.ell('head', HEAD.c, HEAD.r, { color: SKIN, flat: true, seg: 16, line: 1.1 });
  // 귀
  for (const s of [1, -1]) p.ell('head', [s * 0.198, 1.32, 0.0], [0.035, 0.05, 0.03], { color: SKIN, flat: true, seg: 8, shade: 0.95 });
  // 눈(검은 타원 + 작은 빛점), 눈썹, 볼, 코, 입
  for (const s of [1, -1]) {
    const eye = onHead(s * 0.075, 1.315, -0.004);
    p.ell('head', eye.p, [0.024, 0.034, 0.012], { color: EYE, flat: true, seg: 10, r: eye.r, line: 0 });
    const hi = onHead(s * 0.075 + 0.009, 1.328, 0.006);
    p.ell('head', hi.p, [0.008, 0.009, 0.004], { color: '#fbf6ec', flat: true, seg: 6, r: hi.r, line: 0 });
    const br = onHead(s * 0.078, 1.385, 0.0);
    p.box('head', br.p, [0.05, 0.011, 0.012], { color: brows, flat: true, r: [br.r[0], br.r[1], -s * 0.12], line: 0 });
    const ck = onHead(s * 0.118, 1.265, -0.004);
    p.ell('head', ck.p, [0.032, 0.018, 0.01], { color: BLUSH, flat: true, seg: 8, r: ck.r, line: 0 });
  }
  const nose = onHead(0, 1.285, -0.004);
  p.ell('head', nose.p, [0.014, 0.012, 0.012], { color: SKIN, flat: true, seg: 6, shade: 0.97, line: 0 });
  const mouth = onHead(0, 1.235, -0.002);
  p.torus('head', mouth.p, 0.022, 0.0045, { color: '#9c4c43', flat: true, r: [mouth.r[0], 0, Math.PI + 0.35], arc: Math.PI - 0.7, tubular: 6, radial: 3, line: 0 });
  // 목
  p.tube('head', [0, 1.05, -0.005], [0, 1.16, -0.005], 0.048, 0.05, { color: SKIN, flat: true, seg: 8, shade: 0.9 });
  if (glasses) {
    for (const s of [1, -1]) {
      const gl = onHead(s * 0.076, 1.318, 0.012);
      p.torus('head', gl.p, 0.044, 0.006, { color: glasses, flat: true, r: [0, gl.r[1] * 0.6, 0], tubular: 14, line: 0 });
      // 다리(귀까지)
      p.box('head', [s * 0.19, 1.33, 0.07], [0.008, 0.008, 0.16], { color: glasses, flat: true, r: [0, s * 0.1, 0], line: 0 });
    }
    const br = onHead(0, 1.322, 0.016);
    p.box('head', br.p, [0.04, 0.008, 0.008], { color: glasses, flat: true, line: 0 });
  }
}

// 머리 덮개(정수리에서 뒤통수까지 덮고 앞은 이마 위에서 끝난다)
function hairCap(p, color) {
  p.ell('head', [0, 1.336, -0.006], [0.224, 0.229, 0.212], { color, seg: 14, theta0: 0, thetaLen: Math.PI * 0.57, r: [-0.68, 0, 0], ao: 0.4 });
  // 뒤통수 아래(목덜미까지)
  p.ell('head', [0, 1.27, -0.07], [0.19, 0.13, 0.15], { color, seg: 12, ao: 0.5 });
}

// 소매 하나: 윗팔 + 넓게 퍼진 소매 + 끝동 + 안감, 손목과 손
function arm(p, s, { cloth, cuff, lining, inner, wide = 0.105 }) {
  const L = s > 0 ? 'L' : 'R';
  const x = s * 0.18;
  p.ell('arm' + L, [s * 0.165, 0.995, 0], [0.072, 0.07, 0.075], { color: cloth, seg: 10 });
  p.tube('arm' + L, [x, 1.0, 0], [s * 0.19, 0.84, 0], 0.062, 0.07, { color: cloth, seg: 10, cav: true });
  // 소매(아래로 넓어진다): 겉, 끝동, 안감(안쪽을 보는 면)
  p.lathe('sleeve' + L, [[wide, 0.66], [wide * 0.93, 0.72], [0.085, 0.8], [0.07, 0.875]], { pos: [s * 0.19, 0, 0], color: cloth, seg: 14, cav: true });
  p.lathe('sleeve' + L, [[wide + 0.003, 0.655], [wide * 0.985 + 0.003, 0.705]], { pos: [s * 0.19, 0, 0], color: cuff, seg: 14 });
  p.lathe('sleeve' + L, [[wide * 0.9, 0.73], [wide * 0.97, 0.656]], { pos: [s * 0.19, 0, 0], color: lining, seg: 14, line: 0, shade: 0.7 });
  // 손목(속옷 소매)과 손
  p.tube('fore' + L, [s * 0.19, 0.77, 0], [s * 0.195, 0.655, 0.0], 0.035, 0.034, { color: inner, seg: 8, line: 0.6 });
  p.ell('fore' + L, [s * 0.196, 0.615, 0.005], [0.04, 0.047, 0.042], { color: SKIN, flat: true, seg: 10 });
}

// 다리 하나: 넓은 바지, 대님, 버선코 신
function leg(p, s, { pants, cuffBand = null, daenim, shoe, sole, gather = false }) {
  const L = s > 0 ? 'L' : 'R';
  const x = s * 0.085;
  p.tube('thigh' + L, [x, 0.6, 0], [x, 0.31, 0], 0.088, 0.083, { color: pants, seg: 10, cav: true });
  p.tube('shin' + L, [x, 0.34, 0], [x, gather ? 0.15 : 0.12, 0.004], 0.083, gather ? 0.074 : 0.085, { color: pants, seg: 10, cav: true });
  if (gather) {
    // 대님으로 묶어 발목에서 오므린 바지
    p.ell('shin' + L, [x, 0.15, 0.004], [0.078, 0.04, 0.078], { color: pants, seg: 10 });
    p.tube('shin' + L, [x, 0.112, 0.004], [x, 0.135, 0.004], 0.064, 0.066, { color: daenim, seg: 10 });
    p.ell('shin' + L, [x + s * 0.06, 0.12, 0.035], [0.018, 0.016, 0.012], { color: daenim, seg: 6 });
    p.tube('shin' + L, [x, 0.07, 0.0], [x, 0.115, 0.0], 0.05, 0.058, { color: '#efe8d8', seg: 10, line: 0.6 });   // 버선목
  } else {
    // 걷어 올린 바짓단 + 그 위 대님
    p.tube('shin' + L, [x, 0.07, 0.004], [x, 0.145, 0.004], 0.092, 0.09, { color: cuffBand, seg: 10 });
    p.tube('shin' + L, [x, 0.155, 0.004], [x, 0.172, 0.004], 0.086, 0.086, { color: daenim, seg: 10, line: 0.5 });
    p.ell('shin' + L, [x + s * 0.075, 0.163, 0.03], [0.016, 0.014, 0.012], { color: daenim, seg: 6 });
    p.tube('shin' + L, [x + s * 0.078, 0.158, 0.033], [x + s * 0.085, 0.118, 0.04], 0.007, 0.005, { color: daenim, seg: 5, line: 0 });
  }
  // 버선코 신: 몸, 밑창, 위로 들린 코
  p.ell('shin' + L, [x, 0.045, 0.03], [0.058, 0.045, 0.1], { color: shoe, seg: 12, ao: 0.3 });
  p.ell('shin' + L, [x, 0.013, 0.03], [0.061, 0.014, 0.104], { color: sole, seg: 12, ao: 0 });
  p.tube('shin' + L, [x, 0.035, 0.11], [x, 0.07, 0.148], 0.03, 0.006, { color: shoe, seg: 8, ao: 0 });
}

// 가방끈: 앞과 뒤로 몸통을 감아 내려간다(from: 어깨 쪽 x 부호)
function strap(p, s, color) {
  const pts = [[s * 0.14, 1.04, 0.0], [s * 0.06, 0.97, 0.135], [-s * 0.08, 0.81, 0.15], [-s * 0.2, 0.7, 0.09]];
  for (let i = 0; i < pts.length - 1; i++) p.tube('torso', pts[i], pts[i + 1], 0.014, 0.014, { color, seg: 6, line: 0.5, sz: 0.5 });
  const back = [[s * 0.14, 1.04, 0.0], [s * 0.05, 0.96, -0.13], [-s * 0.1, 0.8, -0.14], [-s * 0.2, 0.7, -0.07]];
  for (let i = 0; i < back.length - 1; i++) p.tube('torso', back[i], back[i + 1], 0.014, 0.014, { color, seg: 6, line: 0.5 });
}

function satchel(p, s, { body, flap, tassel, ring = TOKENS.gold }) {
  const x = s * 0.24;
  p.box('bag', [x, 0.63, 0.01], [0.065, 0.16, 0.19], { color: body, ao: 0.5 });
  p.box('bag', [x + s * 0.004, 0.675, 0.01], [0.068, 0.08, 0.194], { color: flap, ao: 0.3 });
  p.ell('bag', [x + s * 0.036, 0.655, 0.01], [0.008, 0.016, 0.016], { color: ring, seg: 6, line: 0 });
  p.tube('bag', [x + s * 0.036, 0.64, 0.01], [x + s * 0.04, 0.5, 0.012], 0.005, 0.02, { color: tassel, seg: 7, line: 0.6 });
}

// 고름: 매듭 + 늘어진 두 가닥 + 술(술은 tassel 뼈에 달려 흔들린다)
function goreum(p, { ribbon, knot, tasselColor, long = 0.2 }) {
  p.ell('torso', [0.035, 0.845, 0.148], [0.024, 0.02, 0.016], { color: knot, seg: 8 });
  p.ell('torso', [0.012, 0.85, 0.146], [0.026, 0.014, 0.012], { color: ribbon, seg: 8, r: [0, 0, 0.4] });
  p.box('torso', [0.028, 0.845 - long / 2, 0.152], [0.024, long, 0.008], { color: ribbon, r: [-0.06, 0, -0.1] });
  p.box('torso', [0.052, 0.845 - long * 0.42, 0.15], [0.022, long * 0.84, 0.008], { color: ribbon, r: [-0.06, 0, 0.12] });
  p.tube('tassel', [0.035, 0.83, 0.155], [0.035, 0.67, 0.16], 0.005, 0.022, { color: tasselColor, seg: 8, line: 0.6 });
}

// ───────── 인물 조립법(kind → 부분) ─────────
// 학생 a: 녹청 저고리(크림 깃·끝동, 아랫단 석간주 띠), 크림 속옷, 짙은 바지(걷은 단), 흰 버선코 신,
//         짧고 흐트러진 검은 머리, 오른쪽 허리에 짙은 가방, 오른손에 두루마리.
function studentA(p) {
  const GREEN = '#3f6b5e';
  const CREAM = '#ebe0c8';
  const PANTS = '#4c4946';
  const HAIR = '#302c2c';
  face(p, { brows: '#2a2624' });
  hairCap(p, HAIR);
  // 앞머리 술(이마 위로 흐트러진 끝)
  [[-0.13, 0.25], [-0.07, 0.1], [-0.005, -0.05], [0.06, 0.08], [0.125, -0.2]].forEach(([x, tilt], i) => {
    const top = onHead(x * 0.9, 1.48, 0.012);
    const tip = onHead(x * 1.06 + tilt * 0.04, 1.39 - (i % 2) * 0.012, 0.02);
    p.tube('head', top.p, tip.p, 0.05, 0.008, { color: HAIR, seg: 7, ao: 0 });
  });
  // 옆머리, 정수리 삐침
  for (const s of [1, -1]) p.tube('head', [s * 0.2, 1.42, 0.02], [s * 0.214, 1.29, 0.06], 0.045, 0.01, { color: HAIR, seg: 7, ao: 0 });
  p.tube('head', [0.02, 1.53, -0.03], [0.07, 1.61, -0.09], 0.045, 0.006, { color: HAIR, seg: 7, ao: 0 });
  p.tube('head', [-0.05, 1.52, -0.08], [-0.1, 1.575, -0.15], 0.04, 0.006, { color: HAIR, seg: 7, ao: 0 });
  for (const s of [1, 0, -1]) p.tube('head', [s * 0.1, 1.24, -0.14], [s * 0.12, 1.17, -0.15], 0.04, 0.008, { color: HAIR, seg: 6, ao: 0 });

  // 저고리(겉옷): 몸통, 아랫단 띠, 깃(크림), 목둘레
  p.lathe('torso', [[0.214, 0.5], [0.207, 0.57], [0.188, 0.7], [0.176, 0.86], [0.186, 0.97], [0.16, 1.04], [0.09, 1.09], [0.05, 1.1]], { color: GREEN, sz: 0.72, seg: 14 });
  p.lathe('torso', [[0.218, 0.497], [0.214, 0.545]], { color: '#7d4a3c', sz: 0.73, seg: 14, line: 0.4 });
  p.lathe('torso', [[0.219, 0.546], [0.215, 0.556]], { color: CREAM, sz: 0.73, seg: 14, line: 0 });
  // 크림 속옷(앞섶 사이)
  p.ell('torso', [0, 0.84, 0.112], [0.06, 0.2, 0.05], { color: '#d6c7a8', seg: 10, line: 0.5 });
  // 흰 셔츠 깃
  for (const s of [1, -1]) p.box('torso', [s * 0.03, 1.06, 0.09], [0.05, 0.032, 0.012], { color: '#f3efe6', r: [0.5, 0, -s * 0.5], line: 0.5 });
  // 앞깃(크림 띠 둘)
  for (const s of [1, -1]) p.box('torso', [s * 0.074, 0.79, 0.124], [0.054, 0.58, 0.024], { color: CREAM, r: [0.06, s * 0.2, s * 0.05] });
  p.lathe('torso', [[0.102, 1.04], [0.095, 1.075], [0.07, 1.105]], { color: CREAM, sz: 0.85, seg: 14 });
  goreum(p, { ribbon: '#2f5248', knot: '#a8362c', tasselColor: '#a8362c', long: 0.16 });
  for (const s of [1, -1]) arm(p, s, { cloth: GREEN, cuff: CREAM, lining: CREAM, inner: '#d9cbae' });
  // 소매 끝 석간주 띠(구름무늬 자리)
  for (const s of [1, -1]) p.lathe(s > 0 ? 'sleeveL' : 'sleeveR', [[0.108, 0.705], [0.104, 0.725]], { pos: [s * 0.19, 0, 0], color: '#7d4a3c', seg: 14, line: 0 });

  // 바지
  p.ell('hips', [0, 0.57, 0], [0.17, 0.11, 0.125], { color: PANTS, seg: 12, line: 0.5 });
  for (const s of [1, -1]) leg(p, s, { pants: PANTS, cuffBand: '#aca69a', daenim: GREEN, shoe: '#f1ece2', sole: '#857e72' });

  // 가방(오른쪽 허리, 끈은 왼 어깨)
  strap(p, 1, '#3b3936');
  satchel(p, -1, { body: '#4d4a46', flap: '#5e5a55', tassel: '#a8362c' });
  // 오른손에 두루마리(크림 종이, 나무 축 끝, 붉은 끈)
  const rx = -0.2;
  p.tube('foreR', [rx, 0.6, -0.1], [rx, 0.61, 0.15], 0.032, 0.032, { color: '#eadfc6', seg: 10 });
  for (const z of [-0.108, 0.158]) p.tube('foreR', [rx, 0.6, z - 0.01], [rx, 0.61, z + 0.01], 0.036, 0.036, { color: '#6b5440', seg: 8 });
  p.tube('foreR', [rx, 0.6, 0.06], [rx, 0.6, 0.075], 0.034, 0.034, { color: '#a8362c', seg: 8, line: 0 });
}

// 학생 b: 크림 두루마기(짙은 깃·흰 동정, 녹청 고름과 술), 짙은 목폴라, 짙은 바지(대님으로 묶음), 짙은 버선코 신,
//         뒤로 묶어 올린 상투 머리와 옆머리, 둥근 안경, 왼쪽 허리에 녹청 가방, 오른손 붓, 왼손 책.
function studentB(p) {
  const COAT = '#e4d8bc';
  const COLLAR = '#4b4846';
  const PANTS = '#4f4a45';
  const TEAL = '#2f6d66';
  const HAIR = '#33292a';
  face(p, { brows: '#3a302c', glasses: '#3a332d' });
  hairCap(p, HAIR);
  // 가르마 앞머리(옆으로 넘김), 옆머리, 상투
  for (const s of [1, -1]) {
    const a = onHead(s * 0.03, 1.5, 0.006);
    const b = onHead(s * 0.15, 1.4, 0.016);
    p.tube('head', a.p, b.p, 0.055, 0.016, { color: HAIR, seg: 8, ao: 0 });
    p.tube('head', [s * 0.19, 1.4, 0.04], [s * 0.2, 1.22, 0.075], 0.04, 0.014, { color: HAIR, seg: 8, ao: 0 });
  }
  p.ell('head', [0, 1.575, -0.07], [0.072, 0.068, 0.072], { color: HAIR, seg: 10, ao: 0 });
  p.tube('head', [0, 1.53, -0.055], [0, 1.555, -0.065], 0.05, 0.05, { color: '#5a4636', seg: 10, ao: 0 });

  // 두루마기: 무릎 아래까지. 허리 아래 자락은 다리를 반쯤 따라간다(두 뼈에 나눈 무게)
  const skirtW = (v) => {
    const t = Math.min(1, Math.max(0, (0.6 - v.y) / 0.33));
    if (t <= 0) return null;
    const side = Math.min(1, Math.max(0, 0.5 + v.x / 0.16));
    const k = t;
    return [['thighL', k * side], ['thighR', k * (1 - side)], ['torso', 1 - k]];
  };
  p.lathe('torso', [[0.25, 0.27], [0.245, 0.31], [0.218, 0.48], [0.195, 0.62], [0.178, 0.8], [0.186, 0.96], [0.16, 1.04], [0.09, 1.09], [0.05, 1.1]], { color: COAT, sz: 0.75, seg: 14, weights: skirtW });
  p.lathe('torso', [[0.254, 0.268], [0.25, 0.29]], { color: '#cfc2a3', sz: 0.76, seg: 14, line: 0, weights: skirtW });
  // 앞섶이 겹친 줄
  p.box('torso', [0.05, 0.5, 0.17], [0.012, 0.42, 0.012], { color: '#cdbf9f', r: [-0.16, 0, 0.05], line: 0, weights: skirtW });
  // 짙은 목폴라와 V 깃(짙은 깃 + 흰 동정)
  p.tube('torso', [0, 1.02, -0.005], [0, 1.12, -0.005], 0.058, 0.056, { color: '#393634', seg: 12 });
  p.ell('torso', [0, 0.95, 0.098], [0.06, 0.12, 0.045], { color: '#393634', seg: 10, line: 0 });
  for (const s of [1, -1]) {
    p.box('torso', [s * 0.052, 0.94, 0.122], [0.04, 0.27, 0.022], { color: COLLAR, r: [-0.2, s * 0.22, s * 0.36] });
    p.box('torso', [s * 0.036, 0.955, 0.13], [0.012, 0.25, 0.02], { color: '#f5f1e8', r: [-0.2, s * 0.22, s * 0.36], line: 0 });
  }
  goreum(p, { ribbon: TEAL, knot: TEAL, tasselColor: TEAL, long: 0.24 });
  for (const s of [1, -1]) arm(p, s, { cloth: COAT, cuff: '#d8cbab', lining: '#5a5550', inner: '#393634', wide: 0.112 });

  // 바지(대님으로 묶은 발목), 짙은 버선코 신
  p.ell('hips', [0, 0.57, 0], [0.17, 0.11, 0.125], { color: PANTS, seg: 12, line: 0.5 });
  for (const s of [1, -1]) leg(p, s, { pants: PANTS, daenim: TEAL, shoe: '#3c3936', sole: '#d6ccb8', gather: true });

  // 가방(왼쪽 허리, 끈은 오른 어깨), 붉은 술
  strap(p, -1, '#2f5a53');
  satchel(p, 1, { body: '#3e6a62', flap: '#355c55', tassel: '#a8362c' });
  // 오른손 붓(대 + 먹 묻은 끝), 왼손 책
  p.tube('foreR', [-0.2, 0.58, -0.02], [-0.2, 0.69, 0.12], 0.009, 0.009, { color: '#7a5a3a', seg: 6, line: 0.6 });
  p.tube('foreR', [-0.2, 0.69, 0.12], [-0.2, 0.715, 0.155], 0.012, 0.002, { color: '#2b2b2b', seg: 6, line: 0 });
  p.box('foreL', [0.235, 0.63, 0.02], [0.04, 0.17, 0.13], { color: '#8a6a3c', r: [0.1, 0, 0] });
  p.box('foreL', [0.235, 0.633, 0.022], [0.036, 0.16, 0.135], { color: '#efe6d0', r: [0.1, 0, 0], line: 0 });
}

export const RECIPES = {
  'student-a': studentA,
  'student-b': studentB,
};

export function hasProceduralFigure(kind) {
  return Object.prototype.hasOwnProperty.call(RECIPES, kind);
}

// ───────── 합치기 ─────────
function mergeParts(THREE, parts) {
  let vCount = 0;
  let iCount = 0;
  for (const it of parts) {
    vCount += it.geo.attributes.position.count;
    iCount += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const cols = new Float32Array(vCount * 3);
  const sIdx = new Uint16Array(vCount * 4);
  const sW = new Float32Array(vCount * 4);
  const lineW = new Float32Array(vCount);
  const index = [];
  const lineIndex = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const col = new THREE.Color();
  let o = 0;
  for (const it of parts) {
    const P = it.geo.attributes.position;
    const N = it.geo.attributes.normal;
    nm.getNormalMatrix(it.matrix);
    col.set(it.color);
    const base = o;
    for (let i = 0; i < P.count; i++, o++) {
      v.fromBufferAttribute(P, i).applyMatrix4(it.matrix);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      pos.set([v.x, v.y, v.z], o * 3);
      nor.set([n.x, n.y, n.z], o * 3);
      // 무늬 좌표: 법선이 큰 축을 빼고 남은 두 축(m 단위, 0.22m에 한 장). 살갗은 한 점
      if (it.flat) { uvs[o * 2] = 0.5; uvs[o * 2 + 1] = 0.5; } else {
        const ax = Math.abs(n.x) > Math.abs(n.y) ? (Math.abs(n.x) > Math.abs(n.z) ? 0 : 2) : Math.abs(n.y) > Math.abs(n.z) ? 1 : 2;
        const a = ax === 0 ? v.z : v.x;
        const b = ax === 1 ? v.z : v.y;
        uvs[o * 2] = a / 0.22;
        uvs[o * 2 + 1] = b / 0.22;
      }
      // 굽은 AO: 바닥 가까이(발), 아랫면, 몸 안쪽을 보는 면, 위에서 오는 빛
      const ground = 1 - 0.28 * it.ao * (1 - Math.min(1, Math.max(0, v.y / 0.4))) ** 1.5;
      const under = n.y < -0.35 ? 0.78 : 1;
      let cav = 1;
      if (it.cav) {
        const rl = Math.hypot(v.x, v.z) || 1;
        const inward = -(n.x * v.x + n.z * v.z) / rl;
        if (inward > 0.2) cav = 1 - 0.22 * Math.min(1, (inward - 0.2) / 0.6);
      }
      const top = 0.9 + 0.1 * Math.max(-1, Math.min(1, n.y));
      const k = it.shade * ground * under * cav * top;
      cols.set([col.r * k, col.g * k, col.b * k], o * 3);
      // 뼈 무게
      const ws = it.weights?.(v);
      if (ws) {
        let sum = 0;
        ws.slice(0, 4).forEach(([, w]) => { sum += w; });
        ws.slice(0, 4).forEach(([b, w], j) => { sIdx[o * 4 + j] = it.boneIndexOf(b); sW[o * 4 + j] = w / (sum || 1); });
      } else {
        sIdx[o * 4] = it.bone;
        sW[o * 4] = 1;
      }
      lineW[o] = it.line;
    }
    const I = it.geo.index;
    const cnt = I ? I.count : P.count;
    for (let i = 0; i < cnt; i++) {
      const vi = base + (I ? I.getX(i) : i);
      index.push(vi);
      if (it.line > 0) lineIndex.push(vi);
    }
    it.geo.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
  geo.setAttribute('outlineW', new THREE.BufferAttribute(lineW, 1));
  geo.setIndex(vCount > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  // 먹 테두리는 같은 꼭짓점을 쓰고 색인만 따로(얼굴 장식·안경 같은 잔 부분은 뺀다)
  const line = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'outlineW']) line.setAttribute(k, geo.getAttribute(k));
  line.setIndex(vCount > 65535 ? new THREE.Uint32BufferAttribute(lineIndex, 1) : new THREE.Uint16BufferAttribute(lineIndex, 1));
  line.boundingSphere = geo.boundingSphere.clone();
  return { geo, line, triangles: index.length / 3 };
}

// 재질(모든 절차 인물이 나눠 쓴다)
let shared = null;
function sharedMaterials(THREE) {
  if (!shared) {
    const map = clothTexture(THREE);
    // 그늘이 먹처럼 죽지 않게 아주 조금 스스로 밝다(한지 인형 느낌)
    const body = new THREE.MeshLambertMaterial({ map, vertexColors: true, emissive: new THREE.Color('#2a241e') });
    body.name = 'figure3d-body';
    const outline = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    outline.name = 'figure3d-outline';
    const uOutline = { value: OUTLINE };
    outline.onBeforeCompile = (shader) => {
      shader.uniforms.uOutline = uOutline;
      shader.vertexShader = 'attribute float outlineW;\nuniform float uOutline;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        'vec3 transformed = vec3(position) + normalize(normal) * (uOutline * outlineW);',
      );
    };
    outline.customProgramCacheKey = () => 'figure3d-outline';
    shared = { body, outline, users: 0 };
  }
  shared.users++;
  return shared;
}
function releaseMaterials() {
  if (!shared) return;
  if (--shared.users <= 0) {
    shared.body.dispose();
    shared.outline.dispose();
    shared = null;
    releaseCloth();
  }
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 절차 인물 하나를 만든다(발밑 그림자는 부르는 쪽 figures.js가 붙인다).
// 돌려주는 update(dt, camera, { moving, dir: {x, z}, speed }): moving·dir·speed를 주지 않으면 root가 움직인 거리로 스스로 잰다.
export function buildProceduralFigure(THREE, { kind = 'student-a', height = DESIGN_HEIGHT, reduceMotion = () => false, name = 'figure', phase = 0, faceCamera = true } = {}) {
  const recipe = RECIPES[kind] ?? RECIPES['student-a'];
  const rigDef = HUMANOID;
  const boneIndex = {};
  rigDef.forEach(([n], i) => { boneIndex[n] = i; });
  const p = partCollector(THREE, boneIndex);
  recipe(p);
  for (const it of p.parts) it.boneIndexOf = (b) => boneIndex[b];
  const { geo, line, triangles } = mergeParts(THREE, p.parts);

  // 뼈: 설계 좌표(쉼 자세)에서 부모와의 차이로 놓는다
  const bones = {};
  const rest = {};
  const list = rigDef.map(([n, parent, at]) => {
    const b = new THREE.Bone();
    b.name = name + '-' + n;
    bones[n] = b;
    const pp = parent ? rigDef.find((d) => d[0] === parent)[2] : [0, 0, 0];
    b.position.set(at[0] - pp[0], at[1] - pp[1], at[2] - pp[2]);
    rest[n] = b.position.clone();
    if (parent) bones[parent].add(b);
    return b;
  });
  const mats = sharedMaterials(THREE);
  const mesh = new THREE.SkinnedMesh(geo, mats.body);
  mesh.name = name + '-body';
  mesh.frustumCulled = false;
  mesh.add(bones.hips);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  mesh.bind(skeleton);
  const outline = new THREE.SkinnedMesh(line, mats.outline);
  outline.name = name + '-outline';
  outline.frustumCulled = false;
  outline.bind(skeleton, mesh.bindMatrix);

  const root = new THREE.Group();
  root.name = name;
  const pivot = new THREE.Group();   // 세로축으로 도는 몸(가는 쪽을 본다)
  pivot.name = name + '-pivot';
  const scale = height / DESIGN_HEIGHT;
  pivot.scale.setScalar(scale);
  pivot.add(mesh, outline);
  root.add(pivot);

  // ── 움직임 상태 ──
  let time = phase;
  let walk = 0;            // 0 = 가만히, 1 = 걷기
  let cycle = phase * 3.1;  // 걸음 위상
  let spd = 0;             // 잰 빠르기(설계 m/s)
  let yaw = 0;
  let targetYaw = 0;
  let idle = 0;
  let headYaw = 0;
  let headPitch = 0;
  let headGoal = [0, 0];
  let nextLook = 2 + (phase % 1) * 2;
  const last = new THREE.Vector3(NaN, 0, 0);
  const camLocal = new THREE.Vector3();
  const B = bones;

  function pose(calm) {
    const s = Math.sin(cycle);
    const c = Math.cos(cycle);
    const w = walk;
    const legAmp = calm ? 0.2 : 0.5;
    const armAmp = calm ? 0.12 : 0.42;
    const breath = calm ? 0 : Math.sin(time * 1.7);
    const motion = calm ? 0 : 1;
    // 엉덩이: 들썩임(두 걸음에 두 번), 좌우 기울기, 비틀기
    B.hips.position.copy(rest.hips);
    B.hips.position.y += motion * w * (0.03 * c * c - 0.012);
    B.hips.rotation.set(0, motion * w * 0.12 * s, motion * w * 0.035 * s);
    // 몸통: 걸을 때 조금 앞으로, 반대로 비틀기, 숨쉬기
    B.torso.position.copy(rest.torso);
    B.torso.position.y += breath * 0.004 * (1 - w);
    B.torso.rotation.set(w * (calm ? 0.03 : 0.08) + breath * 0.012 * (1 - w), -motion * w * 0.2 * s, -motion * w * 0.03 * s);
    // 다리: 허벅지 흔들기, 앞으로 내딛는 다리의 무릎 굽힘
    B.thighL.rotation.set(-legAmp * w * s, 0, 0);
    B.thighR.rotation.set(legAmp * w * s, 0, 0);
    B.shinL.rotation.set(w * (calm ? 0.15 : 0.62) * Math.max(0, c) + w * 0.06, 0, 0);
    B.shinR.rotation.set(w * (calm ? 0.15 : 0.62) * Math.max(0, -c) + w * 0.06, 0, 0);
    // 팔: 다리와 반대로, 쉴 때는 몸에서 조금 떨어져 숨에 맞춰
    const out = 0.13 + breath * 0.012;
    B.armL.rotation.set(armAmp * w * s, 0, out + w * 0.04);
    B.armR.rotation.set(-armAmp * w * s, 0, -out - w * 0.04);
    B.foreL.rotation.set(-0.18 - w * 0.25 - (calm ? 0 : 0.15 * w * Math.max(0, -s)), 0, 0);
    B.foreR.rotation.set(-0.18 - w * 0.25 - (calm ? 0 : 0.15 * w * Math.max(0, s)), 0, 0);
    // 소매·가방·술: 조금 늦게 따라 흔들린다
    const lag = Math.sin(cycle - 0.9);
    const idleSway = Math.sin(time * 1.15) * 0.03 * (1 - w);
    B.sleeveL.rotation.set(motion * (w * 0.3 * lag + idleSway), 0, motion * w * 0.06 * Math.abs(lag));
    B.sleeveR.rotation.set(motion * (-w * 0.3 * lag + idleSway), 0, -motion * w * 0.06 * Math.abs(lag));
    B.bag.rotation.set(motion * (w * (0.1 + 0.12 * Math.sin(2 * cycle - 0.8)) + idleSway * 0.5), 0, motion * w * 0.05 * s);
    B.tassel.rotation.set(motion * (w * (0.25 + 0.2 * Math.sin(2 * cycle - 1.2)) + idleSway), 0, motion * w * 0.12 * lag);
    // 머리: 걸을 때는 몸 비틀기를 되돌려 앞을 보고, 쉴 때는 이따금 둘러본다
    B.head.rotation.set(headPitch - w * 0.04, headYaw + motion * w * 0.16 * s, motion * (1 - w) * Math.sin(time * 0.7) * 0.03);
  }

  function update(dt, camera, opts = {}) {
    const calm = reduceMotion();
    dt = Math.min(0.1, Math.max(0, dt || 0));
    time += dt;
    // 움직인 거리(부모 좌표). 1m 넘게 한 번에 옮기면 순간 이동으로 본다
    let dx = 0;
    let dz = 0;
    const first = !Number.isFinite(last.x);
    if (!first) { dx = root.position.x - last.x; dz = root.position.z - last.z; }
    last.copy(root.position);
    let dist = Math.hypot(dx, dz);
    if (dist > 1) { dist = 0; dx = 0; dz = 0; }
    const measured = dt > 0 ? dist / dt / scale : 0;
    const k = 1 - Math.exp(-dt * 10);
    spd += ((opts.speed != null ? opts.speed / scale : measured) - spd) * k;
    const moving = opts.moving ?? spd > 0.25;
    const dir = opts.dir ?? (dist > 1e-4 ? { x: dx, z: dz } : null);

    // 걷기 섞기와 걸음 위상(빠르기에 맞춘다)
    const want = moving ? Math.min(1, Math.max(0.45, spd / 1.6)) : 0;
    walk = calm ? want : walk + (want - walk) * (1 - Math.exp(-dt * 9));
    if (walk > 0.01) {
      const hz = Math.min(2.6, Math.max(1.1, (moving ? Math.max(spd, 0.8) : 1.2) / STRIDE));
      cycle += dt * Math.PI * 2 * hz;
    } else cycle = 0;

    // 방향: 가는 쪽(부르는 쪽이 dir을 주면 서 있을 때도 그쪽). 오래 서 있으면 카메라 쪽으로 비스듬히(3/4) 돌아선다
    if (dir && (dir.x || dir.z) && (moving || opts.dir)) targetYaw = Math.atan2(dir.x, dir.z);
    if (moving) idle = 0;
    else {
      idle += dt;
      if (faceCamera && camera && idle > 1.4) {
        camLocal.copy(camera.position);
        root.parent?.worldToLocal(camLocal);
        const cy = Math.atan2(camLocal.x - root.position.x, camLocal.z - root.position.z);
        const off = wrapAngle(targetYaw - cy);
        if (Math.abs(off) > 0.7) targetYaw = cy + Math.sign(off || 1) * 0.55;
      }
    }
    if (calm || first) yaw = targetYaw;
    else yaw += wrapAngle(targetYaw - yaw) * (1 - Math.exp(-dt * (moving ? 11 : 4)));
    pivot.rotation.y = yaw;

    // 고개: 쉴 때 이따금 둘러보기(움직임 줄이기면 앞만)
    if (calm) { headGoal = [0, 0]; headYaw = 0; headPitch = 0; } else {
      if (walk > 0.3) headGoal = [0, 0];
      else if ((nextLook -= dt) <= 0) {
        const r = Math.sin(time * 12.9898 + phase * 78.233) * 43758.5453;
        const f = r - Math.floor(r);
        headGoal = f < 0.33 ? [0, 0] : f < 0.66 ? [0.38, -0.04] : [-0.34, 0.05];
        nextLook = 2.4 + f * 2.6;
      }
      const hk = 1 - Math.exp(-dt * 3);
      headYaw += (headGoal[0] - headYaw) * hk;
      headPitch += (headGoal[1] - headPitch) * hk;
    }
    pose(calm);
  }

  pose(reduceMotion());

  function dispose() {
    geo.dispose();
    line.dispose();
    skeleton.dispose();
    releaseMaterials();
    root.removeFromParent();
  }

  return {
    root, pivot, mesh, outline, bones, skeleton, material: mats.body, update, dispose,
    get triangles() { return triangles; },
    get yaw() { return yaw; },
    get walk() { return walk; },
  };
}
