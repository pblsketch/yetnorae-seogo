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
// 인물: 학생 a·b, 선대 사서(mentor), 가객 45명(singer-<노래 id>, cast.js의 틀 → 생김새 표로 짓는다), 좀(jom), 좀 대왕(jom-king).
//   뼈대는 셋(사람 HUMANOID, 좀 BUG, 좀 대왕 KING)이고 움직임도 뼈대마다 따로다(ANIMATE).
//   같은 조립법·같은 detail의 인물은 합친 기하를 나눠 쓴다. 무리(buildCrowd)는 서 있는 몸을 구워 한 기하로 합친다.
// 인물을 더할 때: RECIPES에 kind 이름으로 함수 하나를 더한다(gfx/README.md '절차 3D 인물').
//   RECIPES['mentor'] = (p) => person(p, { body: 'robe', … })
import { TOKENS } from '../palette.js';
import { SINGERS, LOOKS, resolveLook } from './cast.js';

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

// ───────── 나눠 쓰는 자원의 묶음(pool) ─────────
// 재질·무늬·기하는 같은 묶음 안의 인물끼리만 나눠 쓴다. 기본 묶음은 'main'(세계와 세계가 빌려주는 방 무대).
// 자기 그림판(WebGLRenderer)을 따로 가진 화면(보스)은 자기 묶음을 쓴다: 그림판은 처음 그린 재질·무늬·기하마다
// 'dispose' 듣기를 남기는데, 세계 학생이 살아 있는 동안 나눈 재질이 버려지지 않으면 치운 그림판이 그 듣기에 붙들려 남는다.
// 묶음이 따로면 그 화면의 인물이 모두 치워질 때 재질이 버려지고, 듣기도 그림판이 살아 있는 동안 풀린다.
const poolKey = (pool) => (typeof pool === 'string' && pool ? pool : 'main');

// ───────── 한지 결 무늬(색 없는 밝은 결, 꼭짓점 색이 색을 맡는다) ─────────
const clothPools = new Map();   // pool → { tex, users }
function clothTexture(THREE, pool) {
  const key = poolKey(pool);
  let entry = clothPools.get(key);
  if (!entry) {
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
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.name = 'figure-cloth';
    entry = { tex, users: 0 };
    clothPools.set(key, entry);
  }
  entry.users++;
  return entry.tex;
}
function releaseCloth(pool) {
  const key = poolKey(pool);
  const entry = clothPools.get(key);
  if (!entry) return;
  if (--entry.users <= 0) { entry.tex.dispose(); clothPools.delete(key); }
}

// ───────── 부분을 모으는 틀 ─────────
// 모든 부분은 설계 좌표로 놓는다. opts: color, flat(살갗처럼 결 없이), ao(바닥 AO 세기), cav(몸 안쪽 그늘),
//   line(먹 테두리 두께 배수, 0이면 테두리 없음), shade(밝기 배수), weights(v => [[뼈, 무게], …]), seg(둘레 나눔)
// detail: 둘레 나눔 배수(1 = 가까이, 0.55쯤 = 멀리 보는 간단한 몸). withMatrix(): 팔을 든 자세로 적은 소품을 쉼 자세로 되돌려 넣는다.
function partCollector(THREE, boneIndex, detail = 1) {
  const parts = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const tmpM = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let pre = null;
  const S = (seg, min) => Math.max(min, Math.round(seg * detail));

  const mat = (p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => {
    e.set(r[0], r[1], r[2]);
    q.setFromEuler(e);
    return new THREE.Matrix4().compose(new THREE.Vector3(...p), q.clone(), new THREE.Vector3(...s));
  };
  const push = (bone, geo, matrix, o = {}) => {
    if (!(bone in boneIndex)) throw new Error('[figure] 모르는 뼈: ' + bone);
    if (pre) matrix = pre.clone().multiply(matrix);
    parts.push({ bone: boneIndex[bone], geo, matrix, color: o.color ?? '#ffffff', flat: !!o.flat, ao: o.ao ?? 1, cav: !!o.cav, line: o.line ?? 1, shade: o.shade ?? 1, weights: o.weights ?? null });
  };

  return {
    THREE,
    parts,
    detail,
    // 타원체: 가운데 pos, 반지름 [rx, ry, rz]
    ell(bone, pos, radii, o = {}) {
      const seg = S(o.seg ?? 10, o.minSeg ?? 5);
      const g = new THREE.SphereGeometry(1, seg, Math.max(detail >= 1 ? 6 : 4, Math.round(seg * 0.7)), 0, Math.PI * 2, o.theta0 ?? 0, o.thetaLen ?? Math.PI);
      push(bone, g, mat(pos, o.r, radii), o);
    },
    // 두 점 사이 원기둥(a 쪽 반지름 ra, b 쪽 반지름 rb)
    tube(bone, a, b, ra, rb, o = {}) {
      const A = new THREE.Vector3(...a);
      const B = new THREE.Vector3(...b);
      const d = B.clone().sub(A);
      const len = d.length();
      const g = new THREE.CylinderGeometry(rb, ra, len, S(o.seg ?? 10, 4), 1, !!o.open);
      const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(o.sx ?? 1, 1, o.sz ?? 1));
      push(bone, g, m, o);
    },
    // 여러 점을 잇는 관(끈, 더듬이, 지팡이): 점마다 반지름 rs[i]
    path(bone, pts, rs, o = {}) {
      for (let i = 0; i < pts.length - 1; i++) this.tube(bone, pts[i], pts[i + 1], rs[i] ?? rs[rs.length - 1], rs[i + 1] ?? rs[rs.length - 1], o);
    },
    // 돌림 기하: pts = [[반지름, 높이], …](아래에서 위로 적으면 바깥을 본다). 가운데 pos, z 납작 sz. phi0·phiLen으로 앞을 터 둘 수 있다(0 = 정면)
    lathe(bone, pts, o = {}) {
      const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), S(o.seg ?? 16, 6), o.phi0 ?? 0, o.phiLen ?? Math.PI * 2);
      push(bone, g, mat(o.pos ?? [0, 0, 0], o.r, [o.sx ?? 1, 1, o.sz ?? 1]), o);
    },
    box(bone, pos, size, o = {}) {
      const g = new THREE.BoxGeometry(1, 1, 1);
      push(bone, g, mat(pos, o.r, size), o);
    },
    torus(bone, pos, R, tube, o = {}) {
      const g = new THREE.TorusGeometry(R, tube, o.radial ?? 4, S(o.tubular ?? 12, 6), o.arc ?? Math.PI * 2);
      push(bone, g, mat(pos, o.r, o.s ?? [1, 1, 1]), o);
    },
    // 어떤 기하든
    add(bone, geo, matrix, o = {}) { push(bone, geo, matrix ?? tmpM.identity().clone(), o); },
    // fn 안에서 넣는 부분에 행렬 m을 먼저 곱한다(소품을 '든 자세' 좌표로 적고 쉼 자세로 되돌릴 때)
    withMatrix(m, fn) {
      const old = pre;
      pre = old ? old.clone().multiply(m) : m.clone();
      fn();
      pre = old;
    },
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

function face(p, { brows = '#2b2622', glasses = null, skin = SKIN } = {}) {
  p.ell('head', HEAD.c, HEAD.r, { color: skin, flat: true, seg: 16, minSeg: 12, line: 1.1 });
  // 귀
  for (const s of [1, -1]) p.ell('head', [s * 0.198, 1.32, 0.0], [0.035, 0.05, 0.03], { color: skin, flat: true, seg: 8, shade: 0.95 });
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
  p.ell('head', nose.p, [0.014, 0.012, 0.012], { color: skin, flat: true, seg: 6, shade: 0.97, line: 0 });
  const mouth = onHead(0, 1.235, -0.002);
  p.torus('head', mouth.p, 0.022, 0.0045, { color: '#9c4c43', flat: true, r: [mouth.r[0], 0, Math.PI + 0.35], arc: Math.PI - 0.7, tubular: 6, radial: 3, line: 0 });
  // 목
  p.tube('head', [0, 1.05, -0.005], [0, 1.16, -0.005], 0.048, 0.05, { color: skin, flat: true, seg: 8, shade: 0.9 });
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
  p.ell('head', [0, 1.336, -0.006], [0.224, 0.229, 0.212], { color, seg: 14, minSeg: 12, theta0: 0, thetaLen: Math.PI * 0.57, r: [-0.68, 0, 0], ao: 0.4 });
  // 뒤통수 아래(목덜미까지)
  p.ell('head', [0, 1.27, -0.07], [0.19, 0.13, 0.15], { color, seg: 12, minSeg: 10, ao: 0.5 });
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
function leg(p, s, { pants, cuffBand = null, daenim, shoe, sole, gather = false, straw = false }) {
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
  shoeOf(p, s, { shoe, sole, straw });
}

// 신 하나: 버선코 신(기본) 또는 짚신(straw: 흰 버선 + 짚 바닥 + 엇갈린 짚 끈)
function shoeOf(p, s, { shoe, sole, straw = false }) {
  const L = s > 0 ? 'L' : 'R';
  const x = s * 0.085;
  if (straw) {
    p.ell('shin' + L, [x, 0.045, 0.03], [0.054, 0.042, 0.095], { color: '#f1ece2', seg: 10, ao: 0.3 });
    p.box('shin' + L, [x, 0.012, 0.03], [0.118, 0.024, 0.215], { color: '#b89c66', ao: 0 });
    for (const z of [0.0, 0.07]) p.torus('shin' + L, [x, 0.04, z], 0.056, 0.008, { color: '#8a6d42', r: [0, 0, 0], s: [1, 0.85, 1], tubular: 10, radial: 3, line: 0.4 });
    return;
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

// ───────── 틀로 짓는 사람(가객·선대 사서): cast.js의 인자를 해석한다 ─────────
const HAT = '#2a2826';
const GOLD = '#c9a14a';
const RED = '#a8362c';
const TEAL = '#2f6d66';
const WHITE_COLLAR = '#f5f1e8';
const darker = (hex, k = 0.82) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// 허리 아래 긴 자락이 다리를 따라가는 무게(top 높이부터 span 아래까지 0 → k0)
function skirtWeights(top = 0.6, span = 0.33, k0 = 1) {
  return (v) => {
    const t = Math.min(1, Math.max(0, (top - v.y) / span));
    if (t <= 0) return null;
    const side = Math.min(1, Math.max(0, 0.5 + v.x / 0.16));
    const k = t * k0;
    return [['thighL', k * side], ['thighR', k * (1 - side)], ['torso', 1 - k]];
  };
}

// 아래팔을 든 자세(cast.js pose)에서 팔 전체의 변환. 쉼 자세의 손목 기울기(0.18)와 팔 벌림(0.13)까지 넣는다(HUMANOID 움직임과 같은 값).
const REST_FORE = 0.18;
const REST_OUT = 0.13;
function armPoseMatrix(THREE, s, a, out) {
  const sh = [s * 0.175, 1.02, 0];
  const el = [s * 0.185, 0.83, 0];
  const arm = new THREE.Matrix4().makeTranslation(...sh).multiply(new THREE.Matrix4().makeRotationZ(s * (REST_OUT + out))).multiply(new THREE.Matrix4().makeTranslation(-sh[0], -sh[1], -sh[2]));
  const fore = new THREE.Matrix4().makeTranslation(...el).multiply(new THREE.Matrix4().makeRotationX(-(REST_FORE + a))).multiply(new THREE.Matrix4().makeTranslation(-el[0], -el[1], -el[2]));
  return arm.multiply(fore);
}

// 소품을 손에 쥐어 준다: fn(뼈, 손 자리)의 좌표는 '팔을 든 그 자세 그대로'의 설계 좌표다. 쉼 자세로 되돌려 아래팔 뼈에 붙인다.
function inHand(p, L, s, fn) {
  const THREE = p.THREE;
  const key = s > 0 ? 'L' : 'R';
  const M = armPoseMatrix(THREE, s, L.pose?.['fore' + key] ?? 0, L.pose?.['out' + key] ?? 0);
  const hand = new THREE.Vector3(s * 0.196, 0.615, 0.005).applyMatrix4(M);
  p.withMatrix(M.clone().invert(), () => fn('fore' + key, [hand.x, hand.y, hand.z]));
}

function hairDo(p, style, color) {
  if (style === 'bald') {
    p.ell('head', [0, 1.336, -0.006], [0.212, 0.224, 0.199], { color: '#ecd6c2', flat: true, seg: 14, minSeg: 12, theta0: 0, thetaLen: Math.PI * 0.55, r: [-0.6, 0, 0], ao: 0.3, line: 0 });
    return;
  }
  hairCap(p, color);
  const parted = () => {
    for (const s of [1, -1]) {
      const a = onHead(s * 0.025, 1.5, 0.008);
      const b = onHead(s * 0.16, 1.37, 0.016);
      p.tube('head', a.p, b.p, 0.05, 0.02, { color, seg: 8, ao: 0 });
    }
  };
  if (style === 'topknot') {
    p.ell('head', [0, 1.585, -0.035], [0.068, 0.072, 0.068], { color, seg: 10, ao: 0 });
    p.tube('head', [-0.075, 1.6, -0.035], [0.075, 1.6, -0.035], 0.008, 0.008, { color: GOLD, seg: 5, line: 0 });   // 동곳
  } else if (style === 'bun') {
    parted();
    p.ell('head', [0, 1.2, -0.19], [0.1, 0.07, 0.07], { color, seg: 10, ao: 0 });
    p.tube('head', [-0.16, 1.2, -0.215], [0.16, 1.2, -0.215], 0.009, 0.009, { color: GOLD, seg: 5, line: 0.4 });   // 비녀
  } else if (style === 'braid') {
    parted();
    p.path('head', [[0, 1.27, -0.17], [0, 1.1, -0.205], [0, 0.92, -0.21]], [0.048, 0.042, 0.032], { color, seg: 7, ao: 0 });
    p.box('head', [0, 0.87, -0.21], [0.065, 0.11, 0.012], { color: RED, r: [0.05, 0, 0] });   // 댕기
  } else if (style === 'gache') {
    parted();
    p.torus('head', [0, 1.53, -0.035], 0.165, 0.078, { color, r: [Math.PI / 2, 0, 0], radial: 6, tubular: 16 });
    p.ell('head', [0, 1.6, -0.05], [0.13, 0.07, 0.12], { color, seg: 10, ao: 0 });
    for (const s of [1, -1]) p.tube('head', [s * 0.08, 1.56, 0.05], [s * 0.25, 1.52, -0.02], 0.009, 0.007, { color: GOLD, seg: 5, line: 0.4 });
    for (const [x, y, z, c] of [[0.13, 1.6, 0.1, RED], [0.17, 1.57, 0.07, '#d98f8a'], [-0.12, 1.62, 0.08, GOLD]]) p.ell('head', [x, y, z], [0.03, 0.03, 0.025], { color: c, seg: 7, line: 0.5 });
  }
}

function hatOf(p, kind) {
  if (kind === 'gat') {
    p.tube('head', [0, 1.488, 0], [0, 1.503, 0], 0.37, 0.36, { color: HAT, seg: 22, line: 0.45, ao: 0 });   // 테
    p.tube('head', [0, 1.5, 0], [0, 1.72, 0], 0.145, 0.125, { color: HAT, seg: 16, ao: 0 });                  // 대우
    p.tube('head', [0, 1.5, 0], [0, 1.53, 0], 0.148, 0.147, { color: '#3d3935', seg: 16, ao: 0, line: 0 });   // 띠
    for (const s of [1, -1]) p.path('head', [[s * 0.16, 1.49, 0.05], [s * 0.13, 1.3, 0.125], [s * 0.035, 1.13, 0.135]], [0.006, 0.006, 0.006], { color: HAT, seg: 4, line: 0 });
    p.path('head', [[0, 1.13, 0.14], [0.01, 0.95, 0.18]], [0.007, 0.006], { color: HAT, seg: 4, line: 0 });
  } else if (kind === 'samo') {
    p.lathe('head', [[0.216, 1.4], [0.214, 1.47], [0.19, 1.525], [0.02, 1.535]], { color: HAT, seg: 16, sz: 0.96, ao: 0 });
    p.ell('head', [0, 1.55, -0.07], [0.165, 0.13, 0.14], { color: HAT, seg: 12, ao: 0 });
    for (const s of [1, -1]) p.ell('head', [s * 0.275, 1.57, -0.11], [0.12, 0.045, 0.012], { color: HAT, seg: 10, r: [0, 0, s * 0.1], ao: 0 });
  } else if (kind === 'jeollip') {
    p.tube('head', [0, 1.478, 0], [0, 1.493, 0], 0.28, 0.27, { color: HAT, seg: 20, line: 0.45, ao: 0 });
    p.ell('head', [0, 1.49, 0], [0.175, 0.18, 0.175], { color: HAT, seg: 12, thetaLen: Math.PI * 0.5, ao: 0 });
    p.tube('head', [0, 1.495, 0], [0, 1.53, 0], 0.178, 0.176, { color: '#b89b5e', seg: 14, line: 0 });
    p.tube('head', [0, 1.66, 0], [0, 1.71, 0], 0.03, 0.02, { color: GOLD, seg: 6, line: 0 });
    p.path('head', [[0, 1.7, 0], [-0.04, 1.77, -0.07], [-0.12, 1.8, -0.19], [-0.22, 1.76, -0.3]], [0.03, 0.026, 0.016, 0.004], { color: '#a8562c', seg: 6 });   // 상모 깃
  } else if (kind === 'helmet') {
    p.ell('head', [0, 1.43, -0.005], [0.232, 0.24, 0.222], { color: '#4a4643', seg: 14, thetaLen: Math.PI * 0.52, ao: 0 });
    p.torus('head', [0, 1.44, -0.005], 0.232, 0.016, { color: '#b89b5e', r: [Math.PI / 2, 0, 0], s: [1, 0.96, 1], tubular: 16, radial: 3, line: 0 });
    p.tube('head', [0, 1.65, 0], [0, 1.84, 0], 0.035, 0.006, { color: '#b89b5e', seg: 6 });
    p.ell('head', [0, 1.81, 0], [0.04, 0.05, 0.04], { color: '#b5493a', seg: 8 });
    p.lathe('head', [[0.262, 1.16], [0.25, 1.3], [0.236, 1.44]], { color: '#3e3a36', seg: 16, phi0: 0.95, phiLen: Math.PI * 2 - 1.9, ao: 0.4 });
    p.lathe('head', [[0.266, 1.15], [0.264, 1.19]], { color: '#b5493a', seg: 16, phi0: 0.95, phiLen: Math.PI * 2 - 1.9, line: 0 });
  } else if (kind === 'headband') {
    p.torus('head', [0, 1.44, -0.005], 0.212, 0.026, { color: '#eee8dc', r: [Math.PI / 2 + 0.12, 0, 0], s: [1, 0.93, 1], tubular: 16, radial: 4 });
    p.ell('head', [0, 1.425, -0.205], [0.04, 0.03, 0.025], { color: '#eee8dc', seg: 8 });
    for (const s of [1, -1]) p.box('head', [s * 0.045, 1.35, -0.215], [0.032, 0.13, 0.01], { color: '#eee8dc', r: [0.1, 0, s * 0.3] });
  } else if (kind === 'wrap') {
    p.ell('head', [0, 1.47, -0.01], [0.228, 0.155, 0.218], { color: '#d9ccb0', seg: 12, thetaLen: Math.PI * 0.6, ao: 0 });
    p.torus('head', [0, 1.44, -0.005], 0.214, 0.022, { color: '#c4b593', r: [Math.PI / 2 + 0.08, 0, 0], s: [1, 0.93, 1], tubular: 16, radial: 4 });
    p.ell('head', [0, 1.59, -0.05], [0.09, 0.06, 0.08], { color: '#d9ccb0', seg: 8 });
  } else if (kind === 'tall') {
    p.lathe('head', [[0.216, 1.4], [0.214, 1.48], [0.2, 1.52]], { color: HAT, seg: 16, sz: 0.96, ao: 0 });
    p.box('head', [0, 1.62, -0.02], [0.3, 0.24, 0.28], { color: HAT, ao: 0 });
    p.box('head', [0, 1.765, -0.02], [0.22, 0.06, 0.24], { color: HAT, ao: 0 });
    p.box('head', [0, 1.805, -0.02], [0.035, 0.04, 0.25], { color: HAT, ao: 0 });
  } else if (kind === 'flowercap') {
    p.ell('head', [0, 1.47, -0.01], [0.228, 0.17, 0.218], { color: HAT, seg: 12, thetaLen: Math.PI * 0.6, ao: 0 });
    p.tube('head', [0, 1.6, -0.03], [0, 1.69, -0.04], 0.1, 0.08, { color: HAT, seg: 10, ao: 0 });
    const c = [0.15, 1.63, 0.1];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      p.ell('head', [c[0] + Math.cos(a) * 0.04, c[1] + Math.sin(a) * 0.04, c[2]], [0.034, 0.034, 0.018], { color: '#d98f8a', seg: 7, line: 0.5 });
    }
    p.ell('head', [c[0], c[1], c[2] + 0.012], [0.02, 0.02, 0.016], { color: GOLD, seg: 6, line: 0 });
    p.ell('head', [0.2, 1.57, 0.06], [0.05, 0.02, 0.012], { color: '#4f7a52', seg: 6, r: [0, 0, -0.6], line: 0.4 });
  }
}

function beardOf(p, kind, color) {
  for (const s of [1, -1]) p.path('head', [[s * 0.01, 1.258, 0.188], [s * 0.05, 1.25, 0.179], [s * 0.078, 1.224, 0.16]], [0.012, 0.009, 0.003], { color, seg: 5, line: 0.4 });
  if (kind === 'goatee') p.tube('head', [0, 1.178, 0.128], [0, 1.07, 0.15], 0.034, 0.006, { color, seg: 7, line: 0.5 });
  else if (kind === 'full') {
    p.ell('head', [0, 1.19, 0.06], [0.175, 0.12, 0.125], { color, seg: 12, theta0: Math.PI * 0.5, thetaLen: Math.PI * 0.5, ao: 0 });
    p.tube('head', [0, 1.12, 0.11], [0, 1.0, 0.15], 0.07, 0.012, { color, seg: 8 });
  } else if (kind === 'long') {
    p.tube('head', [0, 1.185, 0.122], [0, 0.9, 0.18], 0.07, 0.012, { color, seg: 8 });
    for (const s of [1, -1]) p.tube('head', [s * 0.15, 1.25, 0.08], [s * 0.1, 1.11, 0.12], 0.03, 0.008, { color, seg: 6 });
  }
}

// 겉섶 V 깃 + 흰 동정
function collarV(p, color) {
  for (const s of [1, -1]) {
    p.box('torso', [s * 0.052, 0.94, 0.122], [0.04, 0.27, 0.022], { color, r: [-0.2, s * 0.22, s * 0.36] });
    p.box('torso', [s * 0.036, 0.955, 0.13], [0.012, 0.25, 0.02], { color: WHITE_COLLAR, r: [-0.2, s * 0.22, s * 0.36], line: 0 });
  }
}

// 짧은 저고리(바지는 person이 단다). jacketHem이 0.5보다 낮으면 넓적다리까지 내려와 다리를 조금 따라간다
function jacketBody(p, L) {
  const hem = L.jacketHem ?? 0.5;
  const W = hem < 0.5 ? skirtWeights(0.6, 0.6 - hem + 0.05, 0.8) : null;
  p.lathe('torso', [[0.224, hem], [0.216, hem + 0.07], [0.194, 0.7], [0.178, 0.86], [0.186, 0.97], [0.16, 1.04], [0.09, 1.09], [0.05, 1.1]], { color: L.coat, sz: 0.74, seg: 14, weights: W });
  p.lathe('torso', [[0.228, hem - 0.003], [0.224, hem + 0.03]], { color: L.collar, sz: 0.75, seg: 14, line: 0.4, weights: W });
  p.ell('torso', [0, 0.88, 0.11], [0.06, 0.17, 0.05], { color: L.inner, seg: 10, line: 0.5 });
  collarV(p, L.collar);
}

// 긴 옷: 도포·장삼·철릭(robe), 단령(dallyeong), 갑옷(armor)
function robeBody(p, L) {
  const hem = L.hem ?? 0.2;
  const W = skirtWeights(0.6, 0.6 - hem, 0.85);
  const flare = L.body === 'dallyeong' ? 0.025 : 0.045;
  const pts = [[0.25 + flare, hem], [0.245 + flare * 0.6, hem + 0.04], [0.224, 0.45], [0.2, 0.62], [0.182, 0.8], [0.188, 0.96], [0.16, 1.04], [0.09, 1.09], [0.05, 1.1]];
  if (L.body === 'armor') {
    // 두정갑: 띠마다 색을 엇갈리고 앞에 금빛 못
    const rAt = (y) => {
      for (let i = 0; i < pts.length - 1; i++) if (y <= pts[i + 1][1]) return pts[i][0] + (pts[i + 1][0] - pts[i][0]) * ((y - pts[i][1]) / (pts[i + 1][1] - pts[i][1]));
      return pts[pts.length - 1][0];
    };
    for (let i = 0, y0 = hem; y0 < 0.96; i++, y0 += 0.095) {
      const y1 = Math.min(0.96, y0 + 0.095);
      p.lathe('torso', [[rAt(y0) + 0.004, y0], [rAt(y1) + 0.004, y1]], { color: i % 2 ? L.coat : L.inner, sz: 0.76, seg: 16, weights: W, line: 0.8 });
      const yy = (y0 + y1) / 2;
      const r = rAt(yy) + 0.008;
      for (let k = -2; k <= 2; k++) p.ell('torso', [Math.sin(k * 0.32) * r, yy, Math.cos(k * 0.32) * r * 0.76], [0.012, 0.012, 0.008], { color: GOLD, seg: 4, line: 0, weights: W });
    }
    p.lathe('torso', pts.filter(([, y]) => y >= 0.96), { color: L.coat, sz: 0.76, seg: 16 });
    p.box('torso', [0, (hem + 0.95) / 2, 0.19], [0.05, 0.95 - hem, 0.014], { color: L.collar, r: [-0.12, 0, 0], line: 0.5, weights: W });
    for (const s of [1, -1]) p.ell(s > 0 ? 'armL' : 'armR', [s * 0.19, 0.99, 0], [0.1, 0.075, 0.1], { color: L.coat, seg: 10 });   // 어깨 가리개
    p.lathe('torso', [[0.11, 1.03], [0.13, 1.07], [0.07, 1.1]], { color: L.collar, sz: 0.9, seg: 12 });   // 붉은 목도리
    return;
  }
  p.lathe('torso', pts, { color: L.coat, sz: 0.76, seg: 16, weights: W });
  p.lathe('torso', [[0.254 + flare, hem - 0.002], [0.25 + flare, hem + 0.025]], { color: L.trim ?? darker(L.coat, 0.85), sz: 0.77, seg: 16, line: 0, weights: W });
  p.box('torso', [0.05, (hem + 0.62) / 2, 0.182], [0.012, 0.62 - hem, 0.012], { color: darker(L.coat, 0.78), r: [-0.16, 0, 0.05], line: 0, weights: W });
  if (L.body === 'dallyeong') {
    p.torus('torso', [0, 1.06, 0.005], 0.105, 0.026, { color: L.coat, r: [Math.PI / 2 - 0.3, 0, 0], s: [1, 0.85, 1], tubular: 14, radial: 4 });
    p.torus('torso', [0, 1.075, 0.0], 0.085, 0.012, { color: L.collar, r: [Math.PI / 2 - 0.3, 0, 0], s: [1, 0.85, 1], tubular: 14, radial: 3, line: 0 });
  } else collarV(p, L.collar);
}

// 치마저고리(치마는 가슴께에서 매고 다리를 덮는다)
function skirtBody(p, L) {
  const W = skirtWeights(0.62, 0.55, 0.45);
  p.lathe('torso', [[0.31, 0.03], [0.316, 0.07], [0.288, 0.25], [0.244, 0.5], [0.205, 0.72], [0.182, 0.86], [0.172, 0.92], [0.06, 0.935]], { color: L.skirt, sz: 0.86, seg: 18, weights: W });
  p.lathe('torso', [[0.318, 0.027], [0.316, 0.06]], { color: L.skirt2, sz: 0.87, seg: 18, line: 0, weights: W });
  p.box('torso', [0.07, 0.42, 0.232], [0.1, 0.72, 0.012], { color: L.skirt2, r: [-0.22, 0.25, 0], line: 0.5, weights: W });   // 앞으로 여민 겹
  p.lathe('torso', [[0.192, 0.84], [0.19, 0.9], [0.186, 0.97], [0.16, 1.04], [0.09, 1.09], [0.05, 1.1]], { color: L.coat, sz: 0.78, seg: 14 });
  p.lathe('torso', [[0.196, 0.835], [0.194, 0.86]], { color: L.collar, sz: 0.79, seg: 14, line: 0.4 });
  collarV(p, L.collar);
  goreum(p, { ribbon: L.goreum, knot: L.goreum, tasselColor: L.goreum, long: 0.32 });
}

function beltOf(p, L) {
  if (L.belt === 'sash' || L.belt === 'rope') {
    const rope = L.belt === 'rope';
    p.lathe('torso', [[0.198, 0.75], [0.194, rope ? 0.77 : 0.8]], { color: L.sash, sz: 0.8, seg: 16, line: 0.6 });
    p.ell('torso', [0.04, 0.77, 0.16], [0.03, 0.025, 0.02], { color: L.sash, seg: 8 });
    p.box('torso', [0.03, 0.66, 0.165], [0.026, 0.2, 0.01], { color: L.sash, r: [-0.05, 0, -0.08] });
    p.box('torso', [0.06, 0.68, 0.163], [0.024, 0.16, 0.01], { color: L.sash, r: [-0.05, 0, 0.12] });
    p.tube('tassel', [0.045, 0.6, 0.17], [0.045, 0.44, 0.175], 0.006, 0.024, { color: L.tassel, seg: 8, line: 0.6 });
    p.ell('tassel', [0.045, 0.61, 0.17], [0.018, 0.018, 0.015], { color: L.tassel === RED ? GOLD : RED, seg: 6, line: 0 });
  } else if (L.belt === 'cord') {
    p.lathe('torso', [[0.19, 0.852], [0.19, 0.868]], { color: L.sash, sz: 0.8, seg: 16, line: 0.4 });
    p.ell('torso', [0.0, 0.86, 0.155], [0.028, 0.022, 0.018], { color: L.sash, seg: 8 });
    for (const x of [-0.025, 0.025]) {
      p.tube('tassel', [x, 0.85, 0.16], [x * 1.4, 0.6, 0.175], 0.006, 0.006, { color: L.sash, seg: 4, line: 0.4 });
      p.tube('tassel', [x * 1.4, 0.6, 0.175], [x * 1.4, 0.47, 0.18], 0.006, 0.022, { color: L.tassel, seg: 8, line: 0.6 });
    }
  } else if (L.belt === 'gakdae') {
    p.torus('torso', [0, 0.74, 0.02], 0.222, 0.022, { color: L.sash, r: [Math.PI / 2 + 0.14, 0, 0], s: [1, 0.86, 1], tubular: 18, radial: 4 });
    for (const a of [-0.5, 0, 0.5]) p.box('torso', [Math.sin(a) * 0.222, 0.72, 0.02 + Math.cos(a) * 0.191], [0.05, 0.04, 0.012], { color: GOLD, r: [0.14, a, 0], line: 0 });
    p.tube('tassel', [0.0, 0.7, 0.21], [0.0, 0.5, 0.215], 0.007, 0.026, { color: L.tassel, seg: 8, line: 0.6 });
  }
}

function layerOf(p, L, kind) {
  if (kind === 'vest') {
    const hem = L.body === 'robe' ? 0.34 : Math.max(0.48, (L.jacketHem ?? 0.5) + 0.02);
    p.lathe('torso', [[0.236, hem], [0.21, 0.68], [0.194, 0.86], [0.198, 0.97], [0.17, 1.04], [0.11, 1.075]], { color: L.vest, sz: 0.77, seg: 14, phi0: 0.42, phiLen: Math.PI * 2 - 0.84, weights: hem < 0.5 ? skirtWeights(0.6, 0.6 - hem, 0.85) : null });
  } else if (kind === 'kasaya') {
    const c = L.kasaya ?? '#b8533f';
    p.box('torso', [0.0, 0.82, 0.162], [0.15, 0.62, 0.02], { color: c, r: [-0.08, 0, -0.5] });
    p.box('torso', [0.0, 0.82, -0.155], [0.15, 0.62, 0.02], { color: c, r: [0.08, 0, 0.5] });
    p.box('torso', [0.205, 0.66, 0.02], [0.05, 0.72, 0.3], { color: c, r: [0, 0, 0.05] });
    p.ell('torso', [0.15, 1.0, 0.0], [0.09, 0.06, 0.13], { color: c, seg: 10 });
    p.torus('torso', [0.1, 0.96, 0.168], 0.032, 0.008, { color: GOLD, tubular: 10, radial: 3, line: 0, r: [-0.1, 0, 0] });
  } else if (kind === 'hyungbae') {
    p.box('torso', [0, 0.87, 0.168], [0.2, 0.17, 0.014], { color: '#b89b5e', r: [-0.1, 0, 0] });
    p.box('torso', [0, 0.87, 0.175], [0.16, 0.13, 0.008], { color: '#5e5a52', r: [-0.1, 0, 0], line: 0 });
  } else if (kind === 'stole') {
    for (const s of [1, -1]) p.box('torso', [s * 0.078, 0.78, 0.152], [0.06, 0.52, 0.016], { color: RED, r: [-0.07, 0, s * 0.04] });
    p.torus('torso', [0.08, 0.92, 0.165], 0.026, 0.008, { color: GOLD, tubular: 10, radial: 3, line: 0, r: [-0.07, 0, 0] });
  } else if (kind === 'panel') {
    p.box('torso', [0, 0.52, 0.19], [0.13, 0.72, 0.014], { color: L.inner, r: [-0.15, 0, 0], line: 0.5, weights: skirtWeights(0.6, 0.6 - (L.hem ?? 0.2), 0.85) });
  } else if (kind === 'clouds') {
    for (const [x, y, z, ry] of [[0.12, 0.33, 0.2, 0.5], [-0.15, 0.42, 0.19, -0.6], [0.2, 0.28, -0.15, 2.3], [-0.05, 0.62, -0.18, 3.1]]) {
      p.ell('torso', [x, y, z], [0.075, 0.045, 0.012], { color: '#8f897e', seg: 8, r: [0, ry, 0], line: 0, weights: skirtWeights(0.6, 0.4, 0.85) });
    }
  }
}

// 소품. 손: L = 왼손(+x), R = 오른손(-x). 생김새의 hands로 바꿀 수 있다
const DEFAULT_HAND = { fan: 'R', fanOpen: 'R', cup: 'R', brush: 'R', book: 'L', paper: 'L', scroll: 'L', staff: 'L', bamboo: 'R', branch: 'R', flower: 'L', blossom: 'R', flute: 'R', lantern: 'R', pipe: 'R' };
const PROPS = {
  fan(p, L, s) {
    inHand(p, L, s, (b, h) => p.tube(b, add3(h, [0, -0.02, 0.01]), add3(h, [0, 0.19, 0.05]), 0.016, 0.03, { color: '#8a6a3c', seg: 6, sz: 0.4 }));
  },
  fanOpen(p, L, s) {
    const THREE = p.THREE;
    inHand(p, L, s, (b, h) => {
      const g = new THREE.CylinderGeometry(0.2, 0.2, 0.01, Math.max(6, Math.round(12 * p.detail)), 1, false, -Math.PI / 2, Math.PI);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(...add3(h, [0, 0.03, 0.04])), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.2, 0, 0)), new THREE.Vector3(1, 1, 1));
      p.add(b, g, m, { color: '#efe6d0', line: 0.6 });
      for (const [x, y] of [[-0.08, 0.1], [0.05, 0.13], [0.1, 0.06], [-0.02, 0.16]]) p.ell(b, add3(h, [x, 0.03 + y, 0.06 - y * 0.2]), [0.018, 0.018, 0.006], { color: '#b5493a', seg: 6, line: 0 });
      p.tube(b, add3(h, [0, -0.04, 0.035]), add3(h, [0, 0.04, 0.04]), 0.012, 0.012, { color: '#6b4e32', seg: 6, line: 0.5 });
    });
  },
  cup(p, L, s) {
    inHand(p, L, s, (b, h) => p.lathe(b, [[0.005, 0], [0.032, 0.0], [0.046, 0.05], [0.043, 0.054]], { pos: add3(h, [0, 0.025, 0.02]), color: '#ece8dc', seg: 12, line: 0.6 }));
  },
  bowl(p, L) {
    inHand(p, L, -1, (b, h) => p.lathe(b, [[0.01, 0], [0.05, 0.005], [0.075, 0.045], [0.072, 0.05]], { pos: [h[0] * 0.25, h[1] + 0.03, h[2] + 0.03], color: '#5d7f74', seg: 14, line: 0.6 }));
  },
  scroll(p, L, s) {
    inHand(p, L, s, (b, h) => {
      p.tube(b, add3(h, [0, -0.13, 0.03]), add3(h, [0, 0.15, 0.03]), 0.03, 0.03, { color: '#eadfc6', seg: 10 });
      for (const y of [-0.14, 0.16]) p.tube(b, add3(h, [0, y - 0.01, 0.03]), add3(h, [0, y + 0.01, 0.03]), 0.035, 0.035, { color: '#6b5440', seg: 8 });
      p.tube(b, add3(h, [0, 0.04, 0.03]), add3(h, [0, 0.055, 0.03]), 0.033, 0.033, { color: RED, seg: 8, line: 0 });
    });
  },
  brush(p, L, s) {
    inHand(p, L, s, (b, h) => {
      p.tube(b, add3(h, [0, -0.06, 0.02]), add3(h, [0, 0.19, 0.04]), 0.009, 0.009, { color: '#7a5a3a', seg: 6, line: 0.6 });
      p.tube(b, add3(h, [0, 0.19, 0.04]), add3(h, [0, 0.235, 0.044]), 0.013, 0.002, { color: '#2b2b2b', seg: 6, line: 0 });
    });
  },
  book(p, L, s) {
    inHand(p, L, s, (b, h) => {
      p.box(b, add3(h, [-s * 0.03, 0.07, 0.04]), [0.15, 0.2, 0.04], { color: '#6b4a32', r: [-0.15, 0, 0] });
      p.box(b, add3(h, [-s * 0.024, 0.07, 0.034]), [0.145, 0.19, 0.036], { color: '#efe6d0', r: [-0.15, 0, 0], line: 0 });
    });
  },
  paper(p, L, s) {
    inHand(p, L, s, (b, h) => p.box(b, add3(h, [0, 0.08, 0.03]), [0.14, 0.18, 0.006], { color: '#f1ead8', r: [-0.2, 0, 0.1] }));
  },
  staff(p, L, s) {
    inHand(p, L, s, (b, h) => {
      const x = h[0] + s * 0.01;
      const z = h[2] + 0.03;
      p.path(b, [[x, 0.02, z], [x + s * 0.02, h[1] - 0.2, z], [x - s * 0.01, h[1] + 0.12, z], [x + s * 0.02, h[1] + 0.3, z - 0.02]], [0.02, 0.022, 0.024, 0.03], { color: '#6b4e32', seg: 6 });
      p.ell(b, [x + s * 0.02, h[1] + 0.31, z - 0.02], [0.04, 0.035, 0.035], { color: '#6b4e32', seg: 7 });
    });
  },
  bamboo(p, L, s) {
    inHand(p, L, s, (b, h) => {
      const z = h[2] + 0.03;
      p.tube(b, [h[0], 0.02, z], [h[0], h[1] + 0.42, z], 0.018, 0.016, { color: '#b59a5a', seg: 6 });
      for (let y = 0.25; y < h[1] + 0.4; y += 0.3) p.tube(b, [h[0], y, z], [h[0], y + 0.02, z], 0.022, 0.022, { color: '#8a7240', seg: 6, line: 0 });
    });
  },
  branch(p, L, s) {
    inHand(p, L, s, (b, h) => {
      p.path(b, [h, add3(h, [0.03, 0.16, 0.03]), add3(h, [-0.02, 0.32, 0.02]), add3(h, [0.02, 0.42, 0.0])], [0.014, 0.011, 0.008, 0.004], { color: '#4a3a2c', seg: 5, line: 0.6 });
      for (const [y, d] of [[0.14, 1], [0.24, -1], [0.33, 1]]) p.tube(b, add3(h, [0.0, y, 0.025]), add3(h, [d * 0.08, y + 0.06, 0.03]), 0.006, 0.002, { color: '#4a3a2c', seg: 4, line: 0.4 });
    });
  },
  flower(p, L, s) {
    inHand(p, L, s, (b, h) => {
      for (const [x, y, z] of [[0, 0.11, 0.04], [0.04, 0.09, 0.05], [-0.035, 0.1, 0.03], [0.01, 0.15, 0.02]]) {
        p.tube(b, add3(h, [0, 0, 0.03]), add3(h, [x, y, z]), 0.004, 0.004, { color: '#4f7a52', seg: 4, line: 0 });
        p.ell(b, add3(h, [x, y + 0.01, z]), [0.03, 0.026, 0.026], { color: '#e39aa8', seg: 7, line: 0.5 });
      }
    });
  },
  blossom(p, L, s) {
    inHand(p, L, s, (b, h) => {
      p.path(b, [h, add3(h, [0.02, 0.12, 0.04]), add3(h, [-0.02, 0.22, 0.03])], [0.009, 0.007, 0.004], { color: '#4a3a2c', seg: 5, line: 0.5 });
      for (const [x, y, z] of [[0.03, 0.1, 0.06], [-0.03, 0.15, 0.05], [0.0, 0.22, 0.045], [0.05, 0.17, 0.035], [-0.04, 0.07, 0.045]]) p.ell(b, add3(h, [x, y, z]), [0.024, 0.024, 0.018], { color: '#f6ece6', seg: 7, line: 0.5 });
      p.ell(b, add3(h, [0.06, 0.08, 0.04]), [0.035, 0.014, 0.01], { color: '#4f7a52', seg: 6, r: [0, 0, 0.5], line: 0 });
    });
  },
  drum(p, L) {
    const A = [0.02, 0.7, 0.21];
    const B = [0.32, 0.72, 0.14];
    p.tube('torso', A, B, 0.15, 0.15, { color: '#a8362c', seg: 12 });
    p.tube('torso', add3(A, [-0.012, 0, 0.003]), add3(A, [0.012, 0, -0.003]), 0.16, 0.16, { color: '#e8dcc0', seg: 12, line: 0.5 });
    p.tube('torso', add3(B, [-0.012, 0, 0.003]), add3(B, [0.012, 0, -0.003]), 0.16, 0.16, { color: '#e8dcc0', seg: 12, line: 0.5 });
    p.path('torso', [[0.16, 0.86, 0.2], [0.05, 1.0, 0.14], [-0.14, 1.04, 0.0]], [0.012, 0.012, 0.012], { color: RED, seg: 4, line: 0.4 });
    inHand(p, L, -1, (b, h) => {
      p.tube(b, h, add3(h, [0.14, 0.12, 0.08]), 0.01, 0.01, { color: '#7a5a3a', seg: 5, line: 0.5 });
      p.ell(b, add3(h, [0.15, 0.13, 0.085]), [0.022, 0.022, 0.022], { color: '#e8dcc0', seg: 6 });
    });
  },
  flute(p, L, s) {
    inHand(p, L, s, (b, h) => {
      p.tube(b, add3(h, [0, -0.08, 0.02]), add3(h, [-s * 0.07, 0.36, 0.02]), 0.014, 0.014, { color: '#b59a5a', seg: 6, line: 0.6 });
      for (const y of [0.02, 0.2]) p.tube(b, add3(h, [-s * 0.07 * (y + 0.08) / 0.44, y, 0.02]), add3(h, [-s * 0.07 * (y + 0.1) / 0.44, y + 0.015, 0.02]), 0.017, 0.017, { color: '#8a7240', seg: 6, line: 0 });
    });
  },
  lantern(p, L, s) {
    inHand(p, L, s, (b, h) => {
      p.tube(b, add3(h, [0, 0, 0.02]), add3(h, [0, -0.08, 0.05]), 0.007, 0.007, { color: '#6b4e32', seg: 4, line: 0.4 });
      const c = add3(h, [0, -0.19, 0.06]);
      p.tube(b, add3(c, [0, -0.08, 0]), add3(c, [0, 0.08, 0]), 0.075, 0.07, { color: '#f4e2b0', seg: 6, shade: 1.25, line: 0.6 });
      p.tube(b, add3(c, [0, 0.08, 0]), add3(c, [0, 0.11, 0]), 0.07, 0.03, { color: RED, seg: 6 });
      p.tube(b, add3(c, [0, -0.11, 0]), add3(c, [0, -0.08, 0]), 0.03, 0.075, { color: RED, seg: 6 });
      p.tube(b, add3(c, [0, -0.2, 0]), add3(c, [0, -0.11, 0]), 0.02, 0.004, { color: RED, seg: 5, line: 0 });
    });
  },
  basket(p) {
    p.lathe('bag', [[0.12, 0.0], [0.16, 0.05], [0.2, 0.3], [0.21, 0.33]], { pos: [0, 0.66, -0.29], color: '#9a7a4e', seg: 12, sz: 0.75 });
    p.torus('bag', [0, 0.99, -0.29], 0.21, 0.016, { color: '#7a5c3c', r: [Math.PI / 2, 0, 0], s: [1, 0.75, 1], tubular: 14, radial: 3, line: 0.5 });
    for (const [x, y, z] of [[-0.08, 1.0, -0.28], [0.06, 1.02, -0.3], [0.0, 1.05, -0.25], [0.1, 0.98, -0.22], [-0.04, 1.06, -0.33]]) p.ell('bag', [x, y, z], [0.07, 0.04, 0.045], { color: '#8c4a52', seg: 8, r: [0, x * 8, 0.3] });
    for (const s of [1, -1]) p.path('torso', [[s * 0.11, 1.05, -0.05], [s * 0.13, 1.03, 0.1], [s * 0.15, 0.82, 0.14], [s * 0.17, 0.7, 0.0]], [0.014, 0.014, 0.014, 0.014], { color: '#7a5c3c', seg: 4, line: 0.4 });
  },
  pouch(p) {
    p.ell('torso', [-0.2, 0.64, 0.1], [0.05, 0.07, 0.04], { color: RED, seg: 8 });
    p.tube('torso', [-0.2, 0.71, 0.1], [-0.19, 0.76, 0.12], 0.012, 0.008, { color: '#7a5c3c', seg: 4, line: 0 });
  },
  jige(p) {
    for (const s of [1, -1]) p.tube('bag', [s * 0.15, 0.22, -0.23], [s * 0.1, 1.45, -0.25], 0.022, 0.018, { color: '#7a5c3c', seg: 6 });
    for (const y of [0.55, 0.85, 1.25]) p.tube('bag', [0.14, y, -0.235], [-0.14, y, -0.235], 0.014, 0.014, { color: '#6b4e32', seg: 5 });
    p.ell('bag', [0, 1.02, -0.36], [0.19, 0.25, 0.13], { color: '#cdbf9f', seg: 10 });
    p.torus('bag', [0, 1.02, -0.36], 0.19, 0.012, { color: '#8a6d42', r: [Math.PI / 2, 0, 0], s: [1, 0.7, 1], tubular: 12, radial: 3, line: 0 });
    p.torus('bag', [0.2, 0.62, -0.2], 0.07, 0.018, { color: '#b89c66', r: [0, Math.PI / 2, 0], tubular: 10, radial: 3 });
    p.ell('bag', [-0.22, 0.6, -0.18], [0.05, 0.08, 0.05], { color: '#d7b45c', seg: 8 });
    for (const s of [1, -1]) p.path('torso', [[s * 0.11, 1.05, -0.05], [s * 0.13, 1.03, 0.1], [s * 0.15, 0.82, 0.14], [s * 0.17, 0.7, 0.0]], [0.014, 0.014, 0.014, 0.014], { color: '#8a6d42', seg: 4, line: 0.4 });
  },
  pack(p) {
    p.box('bag', [0, 0.92, -0.25], [0.3, 0.36, 0.15], { color: '#7a5c3c', ao: 0.5 });
    p.box('bag', [0, 1.12, -0.25], [0.32, 0.03, 0.17], { color: '#5e4630', line: 0.5 });
    p.ell('bag', [0.06, 1.17, -0.25], [0.07, 0.05, 0.06], { color: '#cdbf9f', seg: 8 });
    for (const s of [1, -1]) p.path('torso', [[s * 0.11, 1.05, -0.05], [s * 0.13, 1.03, 0.1], [s * 0.15, 0.82, 0.14]], [0.013, 0.013, 0.013], { color: '#5e4630', seg: 4, line: 0.4 });
  },
  pipe(p, L, s) {
    inHand(p, L, s, (b, h) => {
      p.tube(b, h, [-0.025, 1.225, 0.19], 0.007, 0.006, { color: '#4a3a2c', seg: 5, line: 0.5 });
      p.lathe(b, [[0.005, 0], [0.022, 0.0], [0.024, 0.035]], { pos: add3(h, [0, -0.01, 0.0]), color: '#b89b5e', seg: 8 });
    });
  },
  quiver(p) {
    p.tube('bag', [0.17, 0.52, -0.21], [-0.13, 1.18, -0.21], 0.055, 0.06, { color: '#6b3a2c', seg: 8 });
    for (const [dx, dz] of [[0, 0], [0.04, 0.02], [-0.03, 0.03]]) p.ell('bag', [-0.15 + dx, 1.25, -0.21 + dz], [0.018, 0.06, 0.01], { color: '#efe8dc', seg: 6, r: [0, 0, 0.42] });
    p.tube('bag', [0.17, 0.52, -0.16], [0.18, 0.4, -0.15], 0.006, 0.022, { color: RED, seg: 6, line: 0.5 });
    p.path('torso', [[-0.14, 1.04, 0.0], [-0.05, 0.97, 0.15], [0.12, 0.72, 0.15], [0.2, 0.6, 0.05]], [0.012, 0.012, 0.012, 0.012], { color: '#5e3a2c', seg: 4, line: 0.4 });
  },
  sword(p) {
    p.tube('torso', [0.24, 0.8, 0.07], [0.3, 0.22, -0.13], 0.022, 0.018, { color: '#2e2a28', seg: 6 });
    p.tube('torso', [0.23, 0.82, 0.08], [0.21, 0.98, 0.14], 0.016, 0.016, { color: '#6b4e32', seg: 6 });
    p.tube('torso', [0.235, 0.8, 0.075], [0.238, 0.815, 0.08], 0.04, 0.04, { color: GOLD, seg: 8, line: 0.4 });
    p.tube('torso', [0.29, 0.28, -0.11], [0.3, 0.22, -0.13], 0.022, 0.012, { color: GOLD, seg: 6, line: 0 });
  },
  swordFront(p) {
    p.tube('torso', [0, 0.05, 0.3], [0, 0.66, 0.3], 0.018, 0.024, { color: '#2e2a28', seg: 6 });
    p.tube('torso', [0, 0.66, 0.3], [0, 0.68, 0.3], 0.055, 0.055, { color: GOLD, seg: 10, line: 0.5 });
    p.tube('torso', [0, 0.68, 0.3], [0, 0.82, 0.3], 0.017, 0.017, { color: '#6b4e32', seg: 6 });
    p.ell('torso', [0, 0.835, 0.3], [0.024, 0.02, 0.024], { color: GOLD, seg: 6 });
    p.tube('torso', [0.01, 0.68, 0.3], [0.03, 0.5, 0.31], 0.006, 0.02, { color: RED, seg: 6, line: 0.5 });
  },
  orchid(p, L) {
    inHand(p, L, -1, (b, h) => {
      const c = [h[0] * 0.15, h[1], h[2] + 0.05];
      p.lathe(b, [[0.03, 0], [0.06, 0.01], [0.065, 0.09], [0.062, 0.095]], { pos: c, color: '#7fa79a', seg: 10 });
      for (const [x, y, z] of [[0.08, 0.28, 0.02], [-0.07, 0.25, 0.03], [0.02, 0.33, -0.02], [-0.1, 0.18, 0.06]]) p.path(b, [add3(c, [0, 0.09, 0]), add3(c, [x * 0.5, y * 0.7, z]), add3(c, [x, y, z])], [0.008, 0.006, 0.002], { color: '#4f7a52', seg: 4, line: 0.4 });
      p.ell(b, add3(c, [0.03, 0.24, 0.04]), [0.025, 0.02, 0.02], { color: '#f6f0dc', seg: 6, line: 0.4 });
    });
  },
  straw(p, L) {
    inHand(p, L, 1, (b, h) => {
      p.tube(b, add3(h, [0, -0.1, 0.04]), add3(h, [0.02, 0.26, 0.03]), 0.04, 0.03, { color: '#c9a85a', seg: 8 });
      for (const y of [0.0, 0.14]) p.tube(b, add3(h, [0.003 * y, y, 0.035]), add3(h, [0.003 * y, y + 0.015, 0.035]), 0.044, 0.044, { color: '#8a6d42', seg: 8, line: 0 });
    });
    inHand(p, L, -1, (b, h) => p.torus(b, add3(h, [0, 0.04, 0.05]), 0.07, 0.022, { color: '#b89c66', s: [0.7, 1, 1], tubular: 10, radial: 4 }));
  },
  keys(p) {
    p.tube('torso', [0.14, 0.76, 0.15], [0.15, 0.62, 0.16], 0.005, 0.005, { color: GOLD, seg: 4, line: 0 });
    for (const [x, y] of [[0.15, 0.6], [0.17, 0.57], [0.13, 0.56]]) p.torus('torso', [x, y, 0.165], 0.022, 0.006, { color: GOLD, tubular: 8, radial: 3, line: 0.4 });
    p.box('torso', [0.155, 0.5, 0.165], [0.012, 0.07, 0.008], { color: GOLD, line: 0 });
  },
};

// 사람 하나(가객·선대 사서). L = cast.js의 resolveLook 결과(또는 같은 모양의 인자)
function person(p, L) {
  const old = !!L.old;
  face(p, { brows: old ? '#d9d3c8' : '#2b2622' });
  hairDo(p, L.hair, old ? '#dcd6cb' : (L.hairColor ?? '#2e2a29'));
  if (L.hat) hatOf(p, L.hat);
  if (L.beard) beardOf(p, L.beard, old ? '#ebe6dd' : '#2b2622');
  if (L.body === 'jacket') jacketBody(p, L);
  else if (L.body === 'skirt') skirtBody(p, L);
  else robeBody(p, L);
  // 다리와 신
  const straw = L.shoe === 'straw';
  const shoe = L.shoe === 'black' ? '#34312e' : L.shoe === 'white' ? '#efe8dc' : '#f1ece2';
  const sole = L.shoe === 'black' ? '#d6ccb8' : L.shoe === 'white' ? '#7d4a3c' : '#857e72';
  if (L.legs === 'none') for (const s of [1, -1]) shoeOf(p, s, { shoe, sole, straw });
  else {
    p.ell('hips', [0, 0.57, 0], [0.17, 0.11, 0.125], { color: L.pants, seg: 12, line: 0.5 });
    for (const s of [1, -1]) leg(p, s, { pants: L.pants, cuffBand: darker(L.pants, 0.9), daenim: L.daenim ?? TEAL, shoe, sole, gather: L.legs !== 'short', straw });
  }
  for (const k of L.layers ?? []) layerOf(p, L, k);
  if (L.body !== 'skirt') beltOf(p, L);
  for (const s of [1, -1]) arm(p, s, { cloth: L.coat, cuff: L.cuff ?? L.collar, lining: L.lining ?? L.inner, inner: L.inner, wide: L.wide ?? 0.105 });
  for (const k of L.props ?? []) PROPS[k]?.(p, L, (L.hands?.[k] ?? DEFAULT_HAND[k] ?? 'R') === 'L' ? 1 : -1);
}

// 선대 사서: 흰 상투와 긴 흰 수염, 구름무늬 먹빛 장삼, 붉은 띠와 금빛 장식, 녹청 띠와 술, 왼손에 책, 허리에 열쇠(sprite/mentor)
const MENTOR = {
  body: 'robe', hem: 0.17, old: true, hair: 'topknot', hat: null, beard: 'long',
  coat: '#66615a', collar: '#e6dcc6', inner: '#e9dfc9', pants: '#e9dfc9', belt: 'sash', sash: TEAL, tassel: TEAL,
  legs: 'gather', daenim: TEAL, shoe: 'straw', wide: 0.13, layers: ['stole', 'clouds'], props: ['book', 'keys'],
  pose: { foreL: 1.3, outL: -0.12 },
};

// ───────── 좀(sprite/jom): 비늘 마디 몸, 긴 더듬이, 큰 눈, 앞발에 든 종이 한 장 ─────────
const BUG = [
  ['body', null, [0, 0.12, 0]],
  ['head', 'body', [0, 0.16, 0.18]],
  ['antL', 'head', [0.05, 0.31, 0.33]],
  ['antR', 'head', [-0.05, 0.31, 0.33]],
  ['seg1', 'body', [0, 0.15, 0.08]],
  ['seg2', 'seg1', [0, 0.15, -0.1]],
  ['seg3', 'seg2', [0, 0.14, -0.36]],
  ['seg4', 'seg3', [0, 0.13, -0.48]],
  ['tail', 'seg4', [0, 0.13, -0.58]],
  ['legsA', 'body', [0, 0.1, 0]],
  ['legsB', 'body', [0, 0.1, 0]],
];
function jom(p) {
  const PL = ['#9d978c', '#c9bfa8', '#8a857b', '#b5ad9c', '#9a9488', '#c2b9a5'];
  const segs = [['seg1', 0.1], ['seg1', -0.04], ['seg2', -0.17], ['seg2', -0.3], ['seg3', -0.42], ['seg4', -0.53]];
  segs.forEach(([b, z], i) => {
    const w = 0.21 - i * 0.022;
    const y = 0.165 - i * 0.008;
    p.ell(b, [0, y, z], [w, 0.105 - i * 0.008, 0.1], { color: PL[i], seg: 12, r: [-0.2, 0, 0], ao: 0.5 });
    p.torus(b, [0, y - 0.005, z + 0.012], w * 0.97, 0.014, { color: i % 2 ? TEAL : RED, r: [Math.PI / 2 - 0.2, 0, 0], s: [1, 0.1 / w, 1], tubular: 16, radial: 3, line: 0.4 });
    for (const s of [1, -1]) p.ell(b, [s * w * 0.55, y + 0.07, z + 0.03], [0.018, 0.012, 0.012], { color: GOLD, seg: 5, line: 0 });
  });
  p.ell('body', [0, 0.09, -0.16], [0.15, 0.055, 0.42], { color: '#e3d8c2', seg: 10, ao: 0.3 });   // 배
  // 머리, 눈, 웃는 입, 볼, 큰턱
  p.ell('head', [0, 0.2, 0.28], [0.17, 0.145, 0.15], { color: '#cfc5ae', seg: 14 });
  for (const s of [1, -1]) {
    p.ell('head', [s * 0.07, 0.255, 0.385], [0.056, 0.066, 0.03], { color: '#fbf6ec', flat: true, seg: 10, line: 0.8 });
    p.ell('head', [s * 0.066, 0.25, 0.41], [0.033, 0.042, 0.014], { color: EYE, flat: true, seg: 8, line: 0 });
    p.ell('head', [s * 0.056, 0.268, 0.423], [0.011, 0.012, 0.005], { color: '#ffffff', flat: true, seg: 6, line: 0 });
    p.ell('head', [s * 0.125, 0.19, 0.37], [0.03, 0.015, 0.01], { color: BLUSH, flat: true, seg: 6, line: 0, r: [0, s * 0.5, 0] });
    p.tube('head', [s * 0.04, 0.12, 0.4], [s * 0.02, 0.09, 0.44], 0.012, 0.004, { color: '#8a7f6c', seg: 5, line: 0.4 });
  }
  p.torus('head', [0, 0.165, 0.418], 0.04, 0.007, { color: '#7a3a33', flat: true, r: [0.2, 0, Math.PI + 0.3], arc: Math.PI - 0.6, tubular: 6, radial: 3, line: 0 });
  for (const s of [1, -1]) p.path(s > 0 ? 'antL' : 'antR', [[s * 0.05, 0.31, 0.33], [s * 0.11, 0.45, 0.42], [s * 0.2, 0.58, 0.34], [s * 0.28, 0.62, 0.16], [s * 0.32, 0.6, 0.0]], [0.013, 0.01, 0.007, 0.004, 0.002], { color: '#b5ad9c', seg: 5, line: 0.6 });
  for (const s of [1, 0, -1]) p.path('tail', [[0, 0.13, -0.6], [s * 0.06, 0.15, -0.78], [s * 0.13, 0.18, -0.95]], [0.012, 0.007, 0.002], { color: '#a39d92', seg: 5, line: 0.5 });
  // 다리 세 쌍(엇갈린 두 무리가 번갈아 딛는다)
  [0.12, -0.02, -0.16].forEach((z, i) => {
    for (const s of [1, -1]) {
      const bone = (i + (s > 0 ? 0 : 1)) % 2 ? 'legsB' : 'legsA';
      p.path(bone, [[s * 0.14, 0.11, z], [s * 0.25, 0.09, z + 0.03], [s * 0.3, 0.005, z + 0.06]], [0.015, 0.011, 0.006], { color: '#d9cdb4', seg: 5, line: 0.6 });
    }
  });
  p.box('head', [0, 0.1, 0.47], [0.24, 0.18, 0.008], { color: '#eadfc6', r: [-0.45, 0, 0.08] });
  for (const y of [0.13, 0.1, 0.07]) p.box('head', [0, y, 0.476 + (0.1 - y) * 0.45], [0.16, 0.008, 0.004], { color: '#5b5550', r: [-0.45, 0, 0.08], line: 0 });
}
jom.rig = 'bug';
jom.designHeight = 0.62;
jom.shadow = [0.8, 1.0];
jom.stride = 0.4;
jom.faceOffset = 0.4;

// ───────── 좀 대왕(sprite/jom-king): 먹구름 몸, 빛나는 눈, 단청 왕관, 몸을 도는 좀과 종잇조각 ─────────
const KING = [
  ['base', null, [0, 0, 0]],
  ['body', 'base', [0, 0.5, 0]],
  ['head', 'body', [0, 1.85, 0]],
  ['crown', 'head', [0, 2.38, 0]],
  ['armL', 'body', [0.5, 1.45, 0]],
  ['armR', 'body', [-0.5, 1.45, 0]],
  ['swirl', 'base', [0, 1.2, 0]],
];
function jomKing(p) {
  const INK = ['#46423e', '#55504a', '#4a4541', '#5d5852', '#46423e'];
  [[[0, 0.32, 0], [0.32, 0.36, 0.3]], [[0, 0.76, 0], [0.56, 0.46, 0.5]], [[0.15, 1.15, -0.05], [0.66, 0.5, 0.55]], [[-0.2, 1.2, 0.05], [0.56, 0.46, 0.5]], [[0, 1.55, 0], [0.6, 0.42, 0.5]]]
    .forEach(([c, r], i) => p.ell('body', c, r, { color: INK[i], seg: 14, ao: 0.3 }));
  for (const s of [1, -1]) {
    p.ell('body', [s * 0.45, 1.6, 0], [0.33, 0.28, 0.3], { color: '#4e4945', seg: 10 });
    p.tube('body', [s * 0.12, 0.25, 0.1], [s * 0.28, 0.02, 0.2], 0.12, 0.01, { color: '#46423e', seg: 8 });
  }
  // 밝은 먹 소용돌이
  for (const [x, y, z, R, rot] of [[0.3, 0.9, 0.46, 0.16, 0.4], [-0.36, 1.25, 0.42, 0.14, 2.2], [0.1, 1.5, 0.48, 0.12, 4.0], [-0.2, 0.62, 0.42, 0.15, 1.1], [0.5, 1.33, 0.32, 0.12, 3.0], [-0.55, 0.85, 0.2, 0.14, 5.1]]) {
    p.torus('body', [x, y, z], R, 0.028, { color: '#9a958c', r: [0, Math.atan2(x, z), rot], arc: Math.PI * 1.4, tubular: 10, radial: 3, line: 0.4 });
  }
  // 머리, 찌푸린 눈두덩, 빛나는 눈
  p.ell('head', [0, 2.0, 0.05], [0.5, 0.42, 0.42], { color: '#3a3633', seg: 16 });
  for (const s of [1, -1]) {
    p.ell('head', [s * 0.2, 2.16, 0.36], [0.19, 0.06, 0.08], { color: '#1c1a19', seg: 8, r: [0, 0, s * -0.38] });
    p.ell('head', [s * 0.19, 2.06, 0.415], [0.15, 0.08, 0.04], { color: '#8a6a2c', flat: true, shade: 1.2, seg: 10, r: [0, s * 0.3, s * 0.35], line: 0 });
    p.ell('head', [s * 0.19, 2.065, 0.435], [0.12, 0.052, 0.035], { color: '#fff0b0', flat: true, shade: 2.2, seg: 10, r: [0, s * 0.3, s * 0.35], line: 0 });
  }
  // 왕관: 녹청 띠, 금 테, 붉은 꽃 장식, 가운데 금 꼭지, 양옆 술
  p.ell('crown', [0, 2.38, 0], [0.34, 0.12, 0.34], { color: '#1f1c1a', seg: 12, line: 0 });
  p.tube('crown', [0, 2.34, 0], [0, 2.58, 0], 0.35, 0.4, { color: TEAL, seg: 16 });
  for (const [y, R] of [[2.34, 0.355], [2.58, 0.4]]) p.torus('crown', [0, y, 0], R, 0.026, { color: GOLD, r: [Math.PI / 2, 0, 0], tubular: 18, radial: 3, line: 0.4 });
  for (let k = -2; k <= 2; k++) {
    const a = k * 0.62;
    const x = Math.sin(a) * 0.4;
    const z = Math.cos(a) * 0.4;
    p.tube('crown', [x, 2.56, z], [x * 1.05, 2.78, z * 1.05], 0.07, 0.012, { color: TEAL, seg: 6 });
    p.ell('crown', [x * 1.06, 2.8, z * 1.06], [0.03, 0.03, 0.03], { color: GOLD, seg: 6, line: 0.4 });
    if (Math.abs(k) <= 1) {
      p.ell('crown', [Math.sin(a) * 0.385, 2.46, Math.cos(a) * 0.385], [0.065, 0.065, 0.025], { color: RED, seg: 8, r: [0, a, 0] });
      p.ell('crown', [Math.sin(a) * 0.41, 2.46, Math.cos(a) * 0.41], [0.025, 0.025, 0.012], { color: GOLD, seg: 6, r: [0, a, 0], line: 0 });
    }
  }
  p.tube('crown', [0, 2.58, 0.03], [0, 3.0, 0.03], 0.05, 0.006, { color: GOLD, seg: 6 });
  p.ell('crown', [0, 2.82, 0.03], [0.05, 0.05, 0.05], { color: GOLD, seg: 8 });
  for (const s of [1, -1]) {
    p.torus('crown', [s * 0.44, 2.52, 0], 0.09, 0.02, { color: GOLD, r: [0, Math.PI / 2, 0], arc: Math.PI * 1.5, tubular: 10, radial: 3, line: 0.4 });
    p.path('crown', [[s * 0.38, 2.4, 0.12], [s * 0.43, 2.15, 0.17], [s * 0.45, 1.92, 0.17]], [0.02, 0.02, 0.045], { color: s > 0 ? RED : TEAL, seg: 6 });
    p.ell('crown', [s * 0.39, 2.4, 0.13], [0.04, 0.04, 0.03], { color: s > 0 ? TEAL : RED, seg: 6 });
  }
  // 연기 팔(끝이 말린다)
  for (const s of [1, -1]) {
    const b = s > 0 ? 'armL' : 'armR';
    p.path(b, [[s * 0.5, 1.45, 0], [s * 0.82, 1.32, 0.14], [s * 0.98, 1.02, 0.26], [s * 0.88, 0.76, 0.32]], [0.22, 0.16, 0.11, 0.06], { color: '#4a4541', seg: 10 });
    p.torus(b, [s * 0.86, 0.72, 0.34], 0.07, 0.03, { color: '#9a958c', r: [0, Math.PI / 2, 0], arc: Math.PI * 1.5, tubular: 8, radial: 3 });
  }
  // 몸에 붙은 종잇조각, 둘레를 천천히 도는 좀과 종잇조각
  for (const [x, y, z, rz] of [[0.42, 1.05, 0.38, 0.4], [-0.3, 0.55, 0.42, -0.6], [0.05, 1.32, 0.5, 0.2]]) p.box('body', [x, y, z], [0.18, 0.22, 0.008], { color: '#e6dcc4', r: [0, Math.atan2(x, z), rz] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const R = 0.78 + (i % 3) * 0.06;
    const y = 0.5 + (i % 4) * 0.33;
    p.ell('swirl', [Math.sin(a) * R, y, Math.cos(a) * R], [0.03, 0.022, 0.1], { color: '#cfc8bb', seg: 6, r: [0, a + Math.PI / 2, 0], line: 0.6 });
    if (i % 2) p.box('swirl', [Math.sin(a + 0.4) * (R + 0.1), y + 0.15, Math.cos(a + 0.4) * (R + 0.1)], [0.14, 0.17, 0.006], { color: '#e6dcc4', r: [0.3, a, 0.5] });
  }
}
jomKing.rig = 'king';
jomKing.designHeight = 3.0;
jomKing.shadow = [1.8, 1.4];
jomKing.faceOffset = 0;
jomKing.alwaysFace = true;


// 조립법 표. 함수에 붙인 값: rig(뼈대 이름, 기본 사람), designHeight(설계 키), shadow([너비, 깊이] 설계 m),
//   stride(걸음 한 바퀴 거리), faceOffset(서 있을 때 카메라에서 비켜 서는 각), alwaysFace(늘 카메라 쪽), pose(쉼 자세 팔 들기), cacheKey(같은 기하를 나눠 쓰는 열쇠)
export const RECIPES = {
  'student-a': studentA,
  'student-b': studentB,
};

function personRecipe(L, cacheKey) {
  const r = (p) => person(p, L);
  r.pose = L.pose;
  r.cacheKey = cacheKey;
  if (L.body === 'skirt') r.pose = { ...L.pose, legScale: 0.55 };
  return r;
}
RECIPES.mentor = personRecipe(MENTOR, 'mentor');
RECIPES.jom = jom;
RECIPES['jom-king'] = jomKing;
// 가객: 'singer-<노래 id>'. 같은 그림(생김새)의 노래는 기하 하나를 나눠 쓴다(cast.js)
for (const [songId, { look }] of Object.entries(SINGERS)) RECIPES['singer-' + songId] = personRecipe(resolveLook(look), 'look:' + look);
// 생김새로 바로 부르는 이름(줄 세우기·점검용): 'look:<생김새>'
for (const look of Object.keys(LOOKS)) RECIPES['look:' + look] = personRecipe(resolveLook(look), 'look:' + look);

export function hasProceduralFigure(kind) {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(RECIPES, kind);
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

// 재질(모든 절차 인물이 나눠 쓴다). 몸 재질에는 먹빛 걸이(uInk: 1 = 제 빛깔, 0 = 먹빛 회색)가 있다.
// 인물 하나만 먹빛으로 바꿀 때는 그 인물만 같은 셰이더의 재질 사본을 쓴다(setInk).
function bodyMaterial(THREE, map, ink = 1) {
  const uInk = { value: ink };
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, emissive: new THREE.Color('#2a241e') });
  m.name = 'figure3d-body';
  m.userData.uInk = uInk;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uInk = uInk;
    shader.fragmentShader = 'uniform float uInk;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n  diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, uInk);',
    );
  };
  m.customProgramCacheKey = () => 'figure3d-body';
  return m;
}

const sharedPools = new Map();   // pool → { map, body, outline, users }
function sharedMaterials(THREE, pool) {
  const key = poolKey(pool);
  let shared = sharedPools.get(key);
  if (!shared) {
    const map = clothTexture(THREE, key);
    // 그늘이 먹처럼 죽지 않게 아주 조금 스스로 밝다(한지 인형 느낌)
    const body = bodyMaterial(THREE, map);
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
    shared = { map, body, outline, users: 0 };
    sharedPools.set(key, shared);
  }
  shared.users++;
  return shared;
}
function releaseMaterials(pool) {
  const key = poolKey(pool);
  const shared = sharedPools.get(key);
  if (!shared) return;
  if (--shared.users <= 0) {
    shared.body.dispose();
    shared.outline.dispose();
    sharedPools.delete(key);
    releaseCloth(key);
  }
}

// ───────── 기하 나눠 쓰기 ─────────
// 같은 조립법(cacheKey)·같은 detail의 인물은 합친 기하 하나를 나눠 쓴다. 마지막 인물이 치울 때 버린다.
const RIGS = { humanoid: HUMANOID, bug: BUG, king: KING };
const geoCache = new Map();
function acquireGeometry(THREE, kind, recipe, rigDef, detail, pool) {
  const key = (recipe.cacheKey ?? kind) + '@' + detail + '#' + poolKey(pool);
  let c = geoCache.get(key);
  if (!c) {
    const boneIndex = {};
    rigDef.forEach(([n], i) => { boneIndex[n] = i; });
    const p = partCollector(THREE, boneIndex, detail);
    recipe(p);
    for (const it of p.parts) it.boneIndexOf = (b) => boneIndex[b];
    c = { ...mergeParts(THREE, p.parts), users: 0 };
    geoCache.set(key, c);
  }
  c.users++;
  let released = false;
  return {
    geo: c.geo,
    line: c.line,
    triangles: c.triangles,
    release() {
      if (released) return;
      released = true;
      if (--c.users <= 0) {
        c.geo.dispose();
        c.line.dispose();
        geoCache.delete(key);
      }
    },
  };
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ───────── 움직임(뼈대마다) ─────────
// st: { time, walk, cycle, headYaw, headPitch, spin, seed }. calm = 움직임 줄이기.
const ANIMATE = {
  // 사람: 걸음, 숨쉬기, 고개 돌리기. off(조립법 pose): 아래팔 들기(foreL/R), 팔 벌리기(outL/R), 다리 흔들기 배수(legScale)
  humanoid(B, rest, st, calm, off = {}) {
    const s = Math.sin(st.cycle);
    const c = Math.cos(st.cycle);
    const w = st.walk;
    const legAmp = (calm ? 0.2 : 0.5) * (off.legScale ?? 1);
    const armAmp = calm ? 0.12 : 0.42;
    const breath = calm ? 0 : Math.sin(st.time * 1.7);
    const motion = calm ? 0 : 1;
    const fL = off.foreL ?? 0;
    const fR = off.foreR ?? 0;
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
    B.shinL.rotation.set(w * (calm ? 0.15 : 0.62) * (off.legScale ?? 1) * Math.max(0, c) + w * 0.06, 0, 0);
    B.shinR.rotation.set(w * (calm ? 0.15 : 0.62) * (off.legScale ?? 1) * Math.max(0, -c) + w * 0.06, 0, 0);
    // 팔: 다리와 반대로(소품을 든 팔은 덜 흔든다), 쉴 때는 몸에서 조금 떨어져 숨에 맞춰
    const out = 0.13 + breath * 0.012;
    const swingL = armAmp * w * s * (fL > 0.5 ? 0.35 : 1);
    const swingR = -armAmp * w * s * (fR > 0.5 ? 0.35 : 1);
    B.armL.rotation.set(swingL, 0, out + w * 0.04 + (off.outL ?? 0));
    B.armR.rotation.set(swingR, 0, -out - w * 0.04 - (off.outR ?? 0));
    B.foreL.rotation.set(-0.18 - fL - w * 0.25 * (fL > 0.5 ? 0.3 : 1) - (calm ? 0 : 0.15 * w * Math.max(0, -s)), 0, 0);
    B.foreR.rotation.set(-0.18 - fR - w * 0.25 * (fR > 0.5 ? 0.3 : 1) - (calm ? 0 : 0.15 * w * Math.max(0, s)), 0, 0);
    // 소매·가방·술: 조금 늦게 따라 흔들린다. 아래팔을 들면 소매는 조금만 따라 든다(천은 늘어진다)
    const lag = Math.sin(st.cycle - 0.9);
    const idleSway = Math.sin(st.time * 1.15) * 0.03 * (1 - w);
    B.sleeveL.rotation.set(-Math.min(0.22, fL * 0.2) + motion * (w * 0.3 * lag + idleSway), 0, motion * w * 0.06 * Math.abs(lag));
    B.sleeveR.rotation.set(-Math.min(0.22, fR * 0.2) + motion * (-w * 0.3 * lag + idleSway), 0, -motion * w * 0.06 * Math.abs(lag));
    B.bag.rotation.set(motion * (w * (0.1 + 0.12 * Math.sin(2 * st.cycle - 0.8)) + idleSway * 0.5), 0, motion * w * 0.05 * s);
    B.tassel.rotation.set(motion * (w * (0.25 + 0.2 * Math.sin(2 * st.cycle - 1.2)) + idleSway), 0, motion * w * 0.12 * lag);
    // 머리: 걸을 때는 몸 비틀기를 되돌려 앞을 보고, 쉴 때는 이따금 둘러본다
    B.head.rotation.set(st.headPitch - w * 0.04, st.headYaw + motion * w * 0.16 * s, motion * (1 - w) * Math.sin(st.time * 0.7) * 0.03);
  },
  // 좀: 걸을 때 마디가 물결치고 다리 두 무리가 번갈아 빠르게 딛는다.
  // 서 있을 때는 이따금 짧게 바르르 떨며 제자리 걸음(종종거림), 더듬이는 따로따로 살랑인다.
  bug(B, rest, st, calm) {
    const t = st.time;
    const w = st.walk;
    const m = calm ? 0 : 1;
    const ph = (t * 0.42 + st.seed * 0.37) % 1;
    const burst = m * (1 - w) * (ph < 0.14 ? Math.sin((ph / 0.14) * Math.PI) : 0);
    B.body.position.copy(rest.body);
    B.body.position.y += m * (w * 0.012 * Math.abs(Math.sin(st.cycle * 2)) + (1 - w) * 0.004 * Math.sin(t * 2.2)) + burst * 0.006 * Math.abs(Math.sin(t * 31));
    B.body.rotation.set(0, m * w * 0.05 * Math.sin(st.cycle) + burst * 0.08 * Math.sin(t * 17), 0);
    const wave = (k) => m * (w * 0.22 * Math.sin(st.cycle - k * 0.9) + (1 - w) * 0.05 * Math.sin(t * 1.3 - k * 0.7));
    B.seg1.rotation.set(0, wave(0) * 0.5, 0);
    B.seg2.rotation.set(0, wave(1), 0);
    B.seg3.rotation.set(0, wave(2), 0);
    B.seg4.rotation.set(0, wave(3), 0);
    B.tail.rotation.set(m * 0.1 * Math.sin(t * 3), wave(4) * 1.3, 0);
    const la = (calm ? 0.12 : 0.45) * w * Math.sin(st.cycle * 2) + burst * 0.35 * Math.sin(t * 34);
    B.legsA.rotation.set(la, 0, 0);
    B.legsB.rotation.set(-la, 0, 0);
    B.antL.rotation.set(m * (0.12 * Math.sin(t * 2.7) + w * 0.2 + burst * 0.15), 0, m * 0.1 * Math.sin(t * 1.9));
    B.antR.rotation.set(m * (0.12 * Math.sin(t * 2.3 + 1) + w * 0.2 + burst * 0.15), 0, -m * 0.1 * Math.sin(t * 2.1 + 0.5));
    B.head.rotation.set(st.headPitch * 0.6, st.headYaw * 0.7, m * 0.06 * Math.sin(t * 0.9));
  },
  // 좀 대왕: 천천히 떠올랐다 가라앉고, 이따금 앞으로 몸을 기울여 다가오듯 내려다본다(무섭기보다 으스스하게).
  king(B, rest, st, calm) {
    const t = st.time;
    const m = calm ? 0 : 1;
    const loom = m * Math.max(0, Math.sin(t * 0.55 + st.seed)) ** 3;
    B.base.position.copy(rest.base);
    B.base.position.y += m * 0.06 * Math.sin(t * 0.7);
    B.body.rotation.set(m * 0.03 * Math.sin(t * 0.5) + loom * 0.14, 0, m * 0.04 * Math.sin(t * 0.43));
    B.body.scale.setScalar(1 + m * 0.025 * Math.sin(t * 1.1));
    B.head.rotation.set(-loom * 0.1 + m * 0.04 * Math.sin(t * 0.8), st.headYaw * 0.4, m * 0.05 * Math.sin(t * 0.6));
    B.crown.rotation.set(0, 0, m * 0.03 * Math.sin(t * 0.9 + 1));
    B.armL.rotation.set(-loom * 0.4 + m * 0.1 * Math.sin(t * 0.7), 0, m * 0.15 * Math.sin(t * 0.6));
    B.armR.rotation.set(-loom * 0.4 + m * 0.1 * Math.sin(t * 0.7 + 1.3), 0, -m * 0.15 * Math.sin(t * 0.6 + 0.8));
    B.swirl.rotation.set(0, st.spin * 0.35, 0);
  },
};

// 절차 인물 하나를 만든다(발밑 그림자는 부르는 쪽 figures.js가 붙인다).
// 돌려주는 update(dt, camera, { moving, dir: {x, z}, speed }): moving·dir·speed를 주지 않으면 root가 움직인 거리로 스스로 잰다.
// 묶음: root → sway(부르는 쪽이 흔들기 연출을 더하는 곳, update마다 0으로) → pivot(방향·키) → 몸, 먹 테두리
// detail: 둘레 나눔 배수(1 = 가까이). 멀리 보이는 무리는 0.55쯤.
// pool: 나눠 쓰는 재질·무늬·기하의 묶음(머리글 '나눠 쓰는 자원의 묶음'). 자기 그림판을 가진 화면은 자기 이름을 준다.
export function buildProceduralFigure(THREE, { kind = 'student-a', height = null, reduceMotion = () => false, name = 'figure', phase = 0, faceCamera = true, detail = 1, pool = 'main' } = {}) {
  const recipe = RECIPES[kind] ?? RECIPES['student-a'];
  const rigName = recipe.rig ?? 'humanoid';
  const rigDef = RIGS[rigName];
  const designH = recipe.designHeight ?? DESIGN_HEIGHT;
  const G = acquireGeometry(THREE, kind, recipe, rigDef, detail, pool);
  const { geo, line, triangles } = G;

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
  const mats = sharedMaterials(THREE, pool);
  const mesh = new THREE.SkinnedMesh(geo, mats.body);
  mesh.name = name + '-body';
  mesh.frustumCulled = false;
  mesh.add(bones[rigDef[0][0]]);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  mesh.bind(skeleton);
  const outline = new THREE.SkinnedMesh(line, mats.outline);
  outline.name = name + '-outline';
  outline.frustumCulled = false;
  outline.bind(skeleton, mesh.bindMatrix);

  const root = new THREE.Group();
  root.name = name;
  const sway = new THREE.Group();
  sway.name = name + '-sway';
  const pivot = new THREE.Group();   // 세로축으로 도는 몸(가는 쪽을 본다)
  pivot.name = name + '-pivot';
  const scale = (height ?? designH) / designH;
  pivot.scale.setScalar(scale);
  pivot.add(mesh, outline);
  sway.add(pivot);
  root.add(sway);

  // 먹빛(0)~제 빛깔(1). 1이 아니면 이 인물만 같은 셰이더의 재질 사본을 쓴다
  let inkMat = null;
  function setInk(v) {
    const k = Math.min(1, Math.max(0, Number(v)));
    if (k >= 0.999) { mesh.material = mats.body; return; }
    inkMat ??= bodyMaterial(THREE, mats.map, k);
    inkMat.userData.uInk.value = k;
    mesh.material = inkMat;
  }

  // ── 움직임 상태 ──
  const stride = recipe.stride ?? STRIDE;
  const faceOff = recipe.faceOffset ?? 0.55;
  const st = { time: phase, walk: 0, cycle: phase * 3.1, headYaw: 0, headPitch: 0, spin: phase, seed: phase };
  const animate = ANIMATE[rigName];
  let spd = 0;             // 잰 빠르기(설계 m/s)
  let yaw = 0;
  let targetYaw = 0;
  let idle = 0;
  let headGoal = [0, 0];
  let nextLook = 2 + (phase % 1) * 2;
  const last = new THREE.Vector3(NaN, 0, 0);
  const camLocal = new THREE.Vector3();

  function update(dt, camera, opts = {}) {
    const calm = reduceMotion();
    dt = Math.min(0.1, Math.max(0, dt || 0));
    st.time += dt;
    if (!calm) st.spin += dt;
    sway.position.set(0, 0, 0);
    sway.rotation.set(0, 0, 0);
    sway.scale.set(1, 1, 1);
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
    st.walk = calm ? want : st.walk + (want - st.walk) * (1 - Math.exp(-dt * 9));
    if (st.walk > 0.01) {
      const hz = Math.min(2.6 * STRIDE / stride, Math.max(1.1, (moving ? Math.max(spd, 0.8) : 1.2) / stride));
      st.cycle += dt * Math.PI * 2 * hz;
    } else st.cycle = 0;

    // 방향: 가는 쪽(부르는 쪽이 dir을 주면 서 있을 때도 그쪽). 오래 서 있으면 카메라 쪽으로 비스듬히 돌아선다.
    // alwaysFace(좀 대왕)는 늘 카메라를 마주 본다.
    if (dir && (dir.x || dir.z) && (moving || opts.dir) && !recipe.alwaysFace) targetYaw = Math.atan2(dir.x, dir.z);
    if (moving) idle = 0;
    else idle += dt;
    if (camera && (recipe.alwaysFace || (faceCamera && !moving && idle > 1.4))) {
      camLocal.copy(camera.position);
      root.parent?.worldToLocal(camLocal);
      const cy = Math.atan2(camLocal.x - root.position.x, camLocal.z - root.position.z);
      const off = wrapAngle(targetYaw - cy);
      if (recipe.alwaysFace) targetYaw = cy;
      else if (Math.abs(off) > faceOff + 0.15) targetYaw = cy + Math.sign(off || 1) * faceOff;
    }
    if (calm || first) yaw = targetYaw;
    else yaw += wrapAngle(targetYaw - yaw) * (1 - Math.exp(-dt * (moving ? 11 : 4)));
    pivot.rotation.y = yaw;

    // 고개: 쉴 때 이따금 둘러보기(움직임 줄이기면 앞만)
    if (calm) { headGoal = [0, 0]; st.headYaw = 0; st.headPitch = 0; } else {
      if (st.walk > 0.3) headGoal = [0, 0];
      else if ((nextLook -= dt) <= 0) {
        const r = Math.sin(st.time * 12.9898 + phase * 78.233) * 43758.5453;
        const f = r - Math.floor(r);
        headGoal = f < 0.33 ? [0, 0] : f < 0.66 ? [0.38, -0.04] : [-0.34, 0.05];
        nextLook = 2.4 + f * 2.6;
      }
      const hk = 1 - Math.exp(-dt * 3);
      st.headYaw += (headGoal[0] - st.headYaw) * hk;
      st.headPitch += (headGoal[1] - st.headPitch) * hk;
    }
    animate(bones, rest, st, calm, recipe.pose);
  }

  animate(bones, rest, st, reduceMotion(), recipe.pose);

  function dispose() {
    G.release();
    skeleton.dispose();
    inkMat?.dispose();
    releaseMaterials(pool);
    root.removeFromParent();
  }

  return {
    root, sway, pivot, mesh, outline, bones, skeleton, material: mats.body, update, dispose, setInk,
    rig: rigName,
    designHeight: designH,
    shadowSize: recipe.shadow ?? [0.78, 0.5],
    get triangles() { return triangles; },
    get yaw() { return yaw; },
    get walk() { return st.walk; },
  };
}

// ───────── 무리(엔딩 행렬처럼 한꺼번에 많이 보이는 인물) ─────────
// 서 있는 자세로 구운 몸들을 기하 하나로 합친다: 몸 그리기 1회 + 먹 테두리 1회.
// 움직임은 꼭짓점 셰이더의 작은 들썩임·흔들림뿐(사람마다 위상이 다르다). 움직임 줄이기면 멈춘다.
const bakeCache = new Map();
let crowdCount = 0;
function bakeStanding(THREE, kind, detail) {
  const key = kind + '@' + detail;
  if (bakeCache.has(key)) return bakeCache.get(key);
  const recipe = RECIPES[kind];
  const fig = buildProceduralFigure(THREE, { kind, detail, reduceMotion: () => true, height: recipe.designHeight ?? DESIGN_HEIGHT });
  fig.update(0, null, {});
  fig.root.updateMatrixWorld(true);
  const g = fig.mesh.geometry;
  const P = g.attributes.position;
  const N = g.attributes.normal;
  const n = P.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i);
    w.fromBufferAttribute(N, i).multiplyScalar(0.01).add(v);
    fig.mesh.applyBoneTransform(i, v);
    fig.mesh.applyBoneTransform(i, w);
    w.sub(v).normalize();
    pos.set([v.x, v.y, v.z], i * 3);
    nor.set([w.x, w.y, w.z], i * 3);
  }
  const out = {
    pos, nor, count: n,
    uv: g.attributes.uv.array.slice(),
    col: g.attributes.color.array.slice(),
    lw: g.attributes.outlineW.array.slice(),
    index: g.index.array.slice(),
    lineIndex: fig.outline.geometry.index.array.slice(),
    designH: fig.designHeight,
  };
  fig.dispose();
  bakeCache.set(key, out);
  return out;
}

let crowdShared = null;
function crowdMaterials(THREE) {
  if (!crowdShared) {
    const map = clothTexture(THREE, 'main');
    const uTime = { value: 0 };
    const uMotion = { value: 1 };
    const hook = (outline) => (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uMotion = uMotion;
      if (outline) shader.uniforms.uOutline = { value: OUTLINE };
      shader.vertexShader = 'attribute vec4 aRoot;\nuniform float uTime;\nuniform float uMotion;\n' + (outline ? 'attribute float outlineW;\nuniform float uOutline;\n' : '') + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position)${outline ? ' + normalize(normal) * (uOutline * outlineW)' : ''};
        float crowdH = max(0.0, transformed.y - aRoot.y);
        transformed.y += uMotion * abs(sin(uTime * 3.2 + aRoot.w)) * 0.022 * smoothstep(0.0, 0.25, crowdH);
        transformed.x += uMotion * sin(uTime * 1.6 + aRoot.w) * 0.018 * crowdH;`,
      );
    };
    const body = new THREE.MeshLambertMaterial({ map, vertexColors: true, emissive: new THREE.Color('#2a241e') });
    body.name = 'figure3d-crowd';
    body.onBeforeCompile = hook(false);
    body.customProgramCacheKey = () => 'figure3d-crowd';
    const outline = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    outline.name = 'figure3d-crowd-outline';
    outline.onBeforeCompile = hook(true);
    outline.customProgramCacheKey = () => 'figure3d-crowd-outline';
    crowdShared = { body, outline, uTime, uMotion, users: 0 };
  }
  crowdShared.users++;
  return crowdShared;
}

// members: [{ kind, x, z, y = 0, yaw = 0, height, phase }]. 돌려주는 것: { root, update(dt, calm), dispose(), triangles, members }
export function buildCrowd(THREE, members, { detail = 0.55, name = 'crowd', outline = true } = {}) {
  const list = members.filter((m) => hasProceduralFigure(m.kind)).map((m, i) => ({ m, b: bakeStanding(THREE, m.kind, detail), i }));
  let vCount = 0;
  let iCount = 0;
  let lCount = 0;
  for (const { b } of list) { vCount += b.count; iCount += b.index.length; lCount += b.lineIndex.length; }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const lw = new Float32Array(vCount);
  const rootA = new Float32Array(vCount * 4);
  const big = vCount > 65535;
  const index = big ? new Uint32Array(iCount) : new Uint16Array(iCount);
  const lineIndex = big ? new Uint32Array(lCount) : new Uint16Array(lCount);
  let o = 0;
  let io = 0;
  let lo = 0;
  for (const { m, b, i } of list) {
    const s = (m.height ?? b.designH) / b.designH;
    const cy = Math.cos(m.yaw ?? 0);
    const sy = Math.sin(m.yaw ?? 0);
    const x0 = m.x ?? 0;
    const y0 = m.y ?? 0;
    const z0 = m.z ?? 0;
    const ph = m.phase ?? i * 1.37;
    for (let k = 0; k < b.count; k++) {
      const px = b.pos[k * 3] * s;
      const py = b.pos[k * 3 + 1] * s;
      const pz = b.pos[k * 3 + 2] * s;
      const nx = b.nor[k * 3];
      const nz = b.nor[k * 3 + 2];
      const at = (o + k) * 3;
      pos[at] = x0 + px * cy + pz * sy;
      pos[at + 1] = y0 + py;
      pos[at + 2] = z0 - px * sy + pz * cy;
      nor[at] = nx * cy + nz * sy;
      nor[at + 1] = b.nor[k * 3 + 1];
      nor[at + 2] = -nx * sy + nz * cy;
      lw[o + k] = b.lw[k] * s;
      rootA.set([x0, y0, z0, ph], (o + k) * 4);
    }
    uv.set(b.uv, o * 2);
    col.set(b.col, o * 3);
    for (let k = 0; k < b.index.length; k++) index[io + k] = b.index[k] + o;
    for (let k = 0; k < b.lineIndex.length; k++) lineIndex[lo + k] = b.lineIndex[k] + o;
    o += b.count;
    io += b.index.length;
    lo += b.lineIndex.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('outlineW', new THREE.BufferAttribute(lw, 1));
  geo.setAttribute('aRoot', new THREE.BufferAttribute(rootA, 4));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  const lineGeo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'outlineW', 'aRoot']) lineGeo.setAttribute(k, geo.getAttribute(k));
  lineGeo.setIndex(new THREE.BufferAttribute(lineIndex, 1));
  lineGeo.boundingSphere = geo.boundingSphere.clone();
  if (lineGeo.boundingSphere) lineGeo.boundingSphere.radius += 0.2;

  const mats = crowdMaterials(THREE);
  crowdCount++;
  const root = new THREE.Group();
  root.name = name;
  const bodyMesh = new THREE.Mesh(geo, mats.body);
  bodyMesh.name = name + '-body';
  const lineMesh = new THREE.Mesh(lineGeo, mats.outline);
  lineMesh.name = name + '-outline';
  root.add(bodyMesh);
  if (outline) root.add(lineMesh);
  let disposed = false;
  return {
    root,
    members: list.map(({ m }) => m),
    triangles: iCount / 3,
    update(dt, calm = false) {
      mats.uMotion.value = calm ? 0 : 1;
      if (!calm) mats.uTime.value += Math.min(0.1, Math.max(0, dt || 0));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geo.dispose();
      lineGeo.dispose();
      root.removeFromParent();
      if (--mats.users <= 0) {
        mats.body.dispose();
        mats.outline.dispose();
        crowdShared = null;
        releaseCloth('main');
      }
      if (--crowdCount <= 0) { crowdCount = 0; bakeCache.clear(); }
    },
  };
}
