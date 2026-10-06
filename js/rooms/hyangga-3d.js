// 작품 방 「제망매가」 3D 무대: 가을 산사 앞, 바람 부는 가지 하나에서 잎이 떨어진다. 길 끝은 미타찰로 가는 일주문,
// 그 너머 산사(법당·석탑)와 안개 낀 수묵 산이 겹겹이 물러난다. 풍경은 gfx 꾸러미(js/world/gfx/t37-scenery.js)로 짓는다.
// 부르는 쪽이 넘긴 root에 모형을 붙이고 camera를 잠시 빌린다(끝나면 처음 자리로 되돌린다). 그리기는 부르는 쪽이 한다.
// 누를 자리(잎·무더기)는 방이 DOM 단추로 만들고, 이 무대는 그 자리를 화면 좌표로 투영해 준다.
// 그리기 호출: 풍경 역할 열 남짓 + 줄기·가지 + 가지의 잎 + 떨어지는 잎 넷 + 길 다섯 + 무더기 넷 + 해·빛무리 = 서른 안팎(예산 60).
import { createScenery, disposeGroupGeometry } from '../world/gfx/t37-scenery.js';
import { seeded } from '../world/gfx/textures.js';

const COLORS = {
  sun: 0xe9c48a,
  wood: '#4a3c33',
  leaf: [0xc4462f, 0xb88a2a, 0x8a4a2c],
  pathCovered: 0x8a6a4c,
  pathClear: 0xefe5cb,
  pile: [0xb4502f, 0xc4462f, 0xb88a2a, 0x8a4a2c, 0xa35a2a],
  glow: 0xf0c56a,
};

// 길의 점: 앞마당에서 미타찰 문까지(무더기는 가운데 점들)
const PATH_POINTS = [
  [0, 6.2],
  [0, 3.5],
  [0.2, 0.5],
  [0.35, -3],
  [0.5, -7],
  [0.8, -12],
];
const GATE = { x: 0.8, z: -12 };
const POSE_CATCH = { position: [0, 1.8, 7.2], target: [-0.2, 2.4, 0] };
const POSE_SWEEP = { position: [0.2, 2.0, 8.5], target: [0.5, 1.6, -6] };
const POSE_CLEAR = { position: [0.6, 1.9, -1.5], target: [0.8, 1.4, -12] };

export function create3DStage({ three, pileCount = 4, reduceMotion = () => false }) {
  const { THREE, root, camera } = three;
  const group = new THREE.Group();
  group.name = 'room-hyangga';
  root.add(group);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const basic = (color, extra = {}) => keep(new THREE.MeshBasicMaterial({ color, ...extra }));
  const mesh = (geo, mat, parent = group) => { const m = new THREE.Mesh(keep(geo), mat); parent.add(m); return m; };

  // 카메라를 빌리기 전 자리
  const saved = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  };

  // ── 빛(그리기 호출 없음): 늦가을 낮은 햇살 ──
  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x7a6a58, 1.9);
  const sunLight = new THREE.DirectionalLight(0xffe2b8, 1.5);
  sunLight.position.set(-6, 9, 8);
  const fill = new THREE.DirectionalLight(0xc9d2dc, 0.35);
  fill.position.set(6, 4, -8);
  group.add(hemi, sunLight, fill);

  // ── 풍경: 땅, 먼 산, 안개, 산사 ──
  const sc = createScenery(THREE);
  sc.materials.setDancheong(0.75);   // 가을 산사: 단청이 조금 바랜 빛
  const b = sc.kit.builder();
  sc.groundDisc(b, { x: 0, z: -14, r: 44, color: '#c2b49a', rings: 4 });
  sc.inkRanges(b, { x0: -90, x1: 90, z: -46, height: 24, gap: 14, y: -3 });
  sc.mistBand(b, { x0: -40, x1: 40, z: -30, y: 1.2, h: 3.6, count: 3, seed: 5 });
  // 산사: 법당 한 채(기둥·공포·서까래·기와), 창살 문, 석탑
  const hallZ = -21;
  const posts = [-4.2, -1.4, 1.4, 4.2];
  sc.kit.stoneBase(b, { x0: -5.4, x1: 5.4, z: hallZ + 1.6, h: 0.45, depth: 3.6 });
  for (let i = 0; i < posts.length - 1; i++) {
    const cx = (posts[i] + posts[i + 1]) / 2;
    sc.kit.latticeWindow(b, { x: cx, y: 0.5, z: hallZ + 0.05, w: 2.4, h: 2.3, pattern: i === 1 ? 'tti' : 'grid', cols: 6, rows: 6 });
  }
  b.box('plaster', 8.6, 0.6, 0.16, { p: [0, 3.15, hallZ - 0.02], color: '#e1d6bd', ao: 0 });
  sc.kit.hanokFrame(b, { posts, z: hallZ + 0.2, height: 3.1, eave: 1.3, paint: '#5d6f62', accent: '#7d4a3c', rafterGap: 0.5 });
  sc.kit.giwaRoof(b, { x0: -6.2, x1: 6.2, zFront: hallZ + 2.0, zBack: hallZ - 1.4, yFront: 4.15, yBack: 5.6, color: '#57544e' });
  // 석탑(삼층): 기단 + 몸돌 + 지붕돌 세 겹
  const tx = 5.8;
  const tz = -15.5;
  b.box('stone', 1.6, 0.5, 1.6, { p: [tx, 0.25, tz], color: '#a8a296', ao: 0.5 });
  b.box('stone', 1.3, 0.4, 1.3, { p: [tx, 0.7, tz], color: '#b0aa9e', ao: 0.3 });
  for (let k = 0; k < 3; k++) {
    const y = 0.9 + k * 0.78;
    const sz = 0.78 - k * 0.12;
    b.box('stone', sz, 0.52 - k * 0.05, sz, { p: [tx, y + 0.26, tz], color: '#aaa498', ao: 0 });
    b.box('stone', sz + 0.6, 0.12, sz + 0.6, { p: [tx, y + 0.58, tz], color: '#9c968a', ao: 0 });
    b.box('stone', sz + 0.3, 0.08, sz + 0.3, { p: [tx, y + 0.68, tz], color: '#9c968a', ao: 0 });
  }
  b.add('stone', sc.kit.cylinder(0.04, 0.07, 0.7, 6), { p: [tx, 3.55, tz], color: '#8f897d', ao: 0 });
  sc.kit.contactShadow(b, { x: tx, z: tz, w: 2.6, d: 2.2 });
  // 일주문(미타찰 문): 두 기둥, 창방·공포, 작은 맞배 기와지붕
  const gx = GATE.x;
  const gz = GATE.z;
  for (const dx of [-1.25, 1.25]) {
    b.add('stone', sc.kit.cylinder(0.28, 0.34, 0.3, 8), { p: [gx + dx, 0.15, gz], color: '#a49e92', ao: 0.4 });
    b.add('paint', sc.kit.cylinder(0.16, 0.18, 2.75, 12), { p: [gx + dx, 1.67, gz], color: '#a8473a' });
  }
  b.box('paint', 3.2, 0.26, 0.3, { p: [gx, 2.95, gz], color: '#5d6f62', ao: 0 });
  b.box('paint', 3.0, 0.14, 0.32, { p: [gx, 3.15, gz], color: '#7d4a3c', ao: 0 });
  for (let k = 0; k < 5; k++) b.box('paint', 0.24, 0.24, 0.5, { p: [gx - 1.2 + k * 0.6, 3.36, gz], color: '#5d6f62', ao: 0 });
  b.box('wood', 0.9, 0.42, 0.06, { p: [gx, 2.62, gz + 0.18], color: '#3c3229', ao: 0 });   // 현판
  sc.hipRoof(b, { x: gx, z: gz, y: 3.42, w: 3.0, d: 0.6, h: 0.7, overhang: 0.6, style: 'giwa', color: '#57544e', lift: 0.3, seg: 12 });
  sc.kit.contactShadow(b, { x: gx, z: gz, w: 4, d: 1.6 });
  // 둘레 나무: 단풍(꽃나무 칸을 붉게 물들임)과 소나무. 길과 가지 앞을 비워 둔다
  const trees = [[-7.5, -9, 4.6, 'pine', '#ffffff'], [-5, -15, 4.2, 'blossom', '#e2905f'], [8.5, -11, 4.4, 'blossom', '#d8794e'], [-9.5, -18, 5.2, 'pine', '#ffffff'], [10, -19, 5, 'pine', '#ffffff'], [3.8, -8, 3.2, 'blossom', '#e0a060']];
  trees.forEach(([x, z, h, kind, tint]) => {
    const cell = kind === 'pine' ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1];
    b.add('foliage', sc.kit.card(...cell), { p: [x, 0, z], s: [h, h, 1], color: tint, uv: 'keep', ao: 0.2, shade: 1 });
    sc.kit.contactShadow(b, { x, z, w: h * 0.45, d: h * 0.25, strength: 0.7 });
  });
  for (const [x, z, s, k] of [[-2.2, -4, 0.45, 1], [2.6, -9.5, 0.6, 2], [-3.4, 1.5, 0.5, 3], [3.2, 2.5, 0.4, 4]]) sc.rock(b, { x, z, s, seed: k, color: '#a29b8e' });
  const scenery = sc.build(b, 'room-hyangga-scenery');
  group.add(scenery);

  // 엷은 가을 해
  const sunMat = basic(COLORS.sun, { transparent: true, opacity: 0.85, depthWrite: false });
  const sun = mesh(new THREE.CircleGeometry(3.0, 32), sunMat);
  sun.position.set(13, 15, -62);
  sun.renderOrder = -12;

  // ── 바람 부는 가지: 줄기(꾸러미 나무 재질)와 흔들리는 가지 무리 ──
  const tb = sc.kit.builder();
  const wood = COLORS.wood;
  tb.add('wood', sc.kit.cylinder(0.3, 0.42, 1.6, 10), { p: [-4.15, 0.8, -0.6], r: [0, 0, 0.04], color: wood, ao: 0.5 });
  tb.add('wood', sc.kit.cylinder(0.25, 0.3, 1.5, 10), { p: [-4.12, 2.2, -0.58], r: [0, 0, -0.06], color: wood, ao: 0.2 });
  tb.add('wood', sc.kit.cylinder(0.2, 0.25, 0.8, 10), { p: [-4.05, 3.1, -0.55], r: [0, 0, 0.1], color: wood, ao: 0 });
  tb.add('stone', sc.kit.cylinder(0.7, 0.95, 0.25, 9), { p: [-4.15, 0.08, -0.6], color: '#8e8577', ao: 0.6 });
  sc.kit.contactShadow(tb, { x: -4.1, z: -0.4, w: 2.6, d: 1.8 });
  const trunkGroup = tb.build('rh-trunk');
  group.add(trunkGroup);
  const branch = new THREE.Group();          // 줄기 끝을 축으로 흔들린다
  branch.position.set(-4.0, 3.3, -0.5);
  group.add(branch);
  const bb = sc.kit.builder();
  const limb = (len, r0, r1, x, y, rz) => bb.add('wood', sc.kit.cylinder(r1, r0, len, 8), { p: [x, y, 0], r: [0, 0, rz], color: wood, ao: 0 });
  limb(6.4, 0.18, 0.07, 3.1, 0.15, -Math.PI / 2 + 0.06);
  limb(2.0, 0.08, 0.035, 2.4, 0.75, -0.75);
  limb(1.6, 0.07, 0.03, 4.9, 0.5, -1.0);
  limb(1.1, 0.05, 0.02, 1.4, -0.35, -2.2);
  limb(0.9, 0.04, 0.015, 5.6, -0.15, -2.0);
  const branchMesh = bb.build('rh-branch');
  branch.add(branchMesh);
  // 가지에 남은 잎(한 번에 그리는 묶음, 잎마다 빛깔이 조금씩 다르다)
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -0.22);
  leafShape.bezierCurveTo(0.17, -0.08, 0.15, 0.12, 0, 0.24);
  leafShape.bezierCurveTo(-0.15, 0.12, -0.17, -0.08, 0, -0.22);
  const leafGeo = keep(new THREE.ShapeGeometry(leafShape));
  const onBranch = new THREE.InstancedMesh(leafGeo, basic(0xffffff, { side: THREE.DoubleSide }), 14);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const lc = new THREE.Color();
  for (let i = 0; i < 14; i++) {
    const x = 0.5 + i * 0.44;
    e.set(0.3 * Math.sin(i * 1.7), 0.5 * Math.cos(i), Math.PI * (i % 2 ? 0.75 : 1.2));
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, -0.05 - 0.18 * Math.sin(i * 2.1), 0.15 * Math.cos(i * 1.3)), q, new THREE.Vector3(1.1, 1.1, 1.1));
    onBranch.setMatrixAt(i, m4);
    onBranch.setColorAt(i, lc.setHex(COLORS.leaf[i % 3]).multiplyScalar(0.9 + (i % 4) * 0.05));
  }
  branch.add(onBranch);

  // 땅에 떨어진 잎: 가지 아래와 길가에 흩어진 낙엽(인스턴스 하나, 길 위는 비운다)
  const fallen = new THREE.InstancedMesh(leafGeo, basic(0xffffff, { side: THREE.DoubleSide }), 70);
  const fr = seeded(31);
  for (let i = 0; i < 70; i++) {
    const near = i < 40;
    let x = near ? -4 + (fr() - 0.3) * 7 : (fr() - 0.5) * 14;
    const z = near ? -0.5 + (fr() - 0.5) * 5 : 4 - fr() * 16;
    if (Math.abs(x - 0.3) < 1.0) x += x < 0.3 ? -1.1 : 1.1;
    e.set(-Math.PI / 2 + (fr() - 0.5) * 0.5, fr() * Math.PI * 2, 0, 'YXZ');
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, 0.02 + fr() * 0.02, z), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.9 + fr() * 0.4));
    fallen.setMatrixAt(i, m4);
    fallen.setColorAt(i, lc.setHex(COLORS.pile[i % COLORS.pile.length]).multiplyScalar(0.75 + fr() * 0.3));
  }
  e.order = 'XYZ';
  fallen.name = 'rh-fallen';
  group.add(fallen);

  // ── 떨어지는 잎(방의 잎 계산을 따라 움직인다) ──
  const fallingGroup = new THREE.Group();
  group.add(fallingGroup);
  const falling = [];
  const leafMats = COLORS.leaf.map((c) => basic(c, { side: THREE.DoubleSide }));
  const leafPos = (l) => ({
    x: -2.8 + l.u * 5.4,
    y: 3.1 - l.v * 2.95,
    z: 0.6 + Math.sin(l.phase + l.v * 6) * 0.35,
  });

  // ── 길과 무더기, 미타찰 문 ──
  const pts = PATH_POINTS.slice(0, pileCount + 2);
  pts[pts.length - 1] = [GATE.x, GATE.z];
  const segMats = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const mat = basic(COLORS.pathCovered);
    segMats.push(mat);
    const seg = mesh(new THREE.PlaneGeometry(1.3, len + 0.2), mat);
    seg.rotation.order = 'YXZ';
    seg.rotation.set(-Math.PI / 2, Math.atan2(x1 - x0, z1 - z0), 0);
    seg.position.set((x0 + x1) / 2, 0.012 + i * 0.001, (z0 + z1) / 2);
  }
  // 잎 무더기: 낙엽 여러 장이 둔덕처럼 쌓인 묶음(무더기마다 인스턴스 하나)
  const piles = [];
  const pileRnd = seeded(23);
  const pileMat = basic(0xffffff, { side: THREE.DoubleSide });
  for (let k = 0; k < pileCount; k++) {
    const [x, z] = pts[k + 1];
    const n = 16;
    const p = new THREE.InstancedMesh(leafGeo, pileMat, n);
    for (let i = 0; i < n; i++) {
      const a = pileRnd() * Math.PI * 2;
      const r = Math.sqrt(pileRnd()) * 0.62;
      const y = 0.05 + (1 - r / 0.62) * 0.18 + pileRnd() * 0.04;
      e.set(-Math.PI / 2 + (pileRnd() - 0.5) * 0.9, pileRnd() * Math.PI * 2, (pileRnd() - 0.5) * 0.6, 'YXZ');
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(Math.cos(a) * r * 1.25, y, Math.sin(a) * r), q, new THREE.Vector3(1.15, 1.15, 1.15));
      p.setMatrixAt(i, m4);
      p.setColorAt(i, lc.setHex(COLORS.pile[(i + k) % COLORS.pile.length]).multiplyScalar(0.85 + pileRnd() * 0.2));
    }
    p.position.set(x, 0, z);
    p.name = 'rh-pile-' + k;
    group.add(p);
    piles.push({ mesh: p, shrink: null });
  }
  const glowMat = basic(COLORS.glow, { transparent: true, opacity: 0.18, depthWrite: false });
  const glow = mesh(new THREE.CircleGeometry(2.0, 24), glowMat);
  glow.position.set(GATE.x, 1.6, GATE.z - 0.3);

  // ── 카메라 ──
  const look = new THREE.Vector3();
  const pose = { from: null, to: null, t: 1, dur: 1.6 };
  function applyPose(p) {
    camera.position.set(...p.position);
    look.set(...p.target);
    camera.lookAt(look);
    camera.updateMatrixWorld();
  }
  function glideTo(p) {
    if (reduceMotion()) { applyPose(p); pose.t = 1; return; }
    pose.from = { position: camera.position.toArray(), target: look.toArray() };
    pose.to = p;
    pose.t = 0;
  }
  applyPose(POSE_CATCH);

  // ── 투영 ──
  const v = new THREE.Vector3();
  function project(x, y, z, rect) {
    group.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    v.set(x, y, z);
    group.localToWorld(v);
    v.project(camera);
    if (!(v.z > -1 && v.z < 1)) return null;
    return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height };
  }

  let time = 0;
  let phase = 'intro';
  const hiddenLeaf = new Set();

  return {
    element: Object.assign(document.createElement('div'), { className: 'rh-stage rh-stage--3d' }),
    leafTilt: false,
    leafVisual: () => document.createElement('span'),
    pileVisual: () => document.createElement('span'),
    leafPoint(l, rect) {
      const p = leafPos(l);
      return project(p.x, p.y, p.z, rect);
    },
    pilePoint(k, rect) {
      const [x, z] = pts[Math.min(Math.max(0, k), pileCount - 1) + 1];
      return project(x, 0.35, z, rect) ?? { x: rect.width / 2, y: rect.height * 0.8 };
    },
    destPoint(rect) {
      return project(GATE.x, 3.1, GATE.z, rect) ?? { x: rect.width / 2, y: rect.height * 0.4 };
    },
    update(dt, { field }) {
      const still = reduceMotion();
      if (dt > 0) time += dt;
      // 바람: 가지가 흔들린다
      branch.rotation.z = still ? 0 : Math.sin(time * 1.6) * 0.035 + Math.sin(time * 0.7) * 0.02;
      // 떨어지는 잎
      if (field && (phase === 'catch' || phase === 'intro')) {
        while (falling.length < field.leaves.length) {
          const m = new THREE.Mesh(leafGeo, leafMats[falling.length % leafMats.length]);
          fallingGroup.add(m);
          falling.push(m);
        }
        field.leaves.forEach((l, i) => {
          const m = falling[i];
          const p = leafPos(l);
          m.visible = field.visible(l) && !hiddenLeaf.has(i);
          m.position.set(p.x, p.y, p.z);
          m.rotation.set(still ? 0.3 : Math.sin(time * 2 + l.phase) * 0.8, still ? 0 : time * 1.5 + l.phase, still ? 0.4 : Math.cos(time * 1.7 + l.phase) * 0.9);
        });
      }
      // 쓸린 무더기는 줄어들어 사라진다
      for (const p of piles) {
        if (p.shrink === null) continue;
        p.shrink = still ? 1 : Math.min(1, p.shrink + dt / 0.4);
        const s = 1 - p.shrink;
        p.mesh.scale.set(s, s, s);
        p.mesh.visible = s > 0.01;
      }
      // 카메라 미끄러짐
      if (pose.t < 1 && pose.to) {
        pose.t = Math.min(1, pose.t + dt / pose.dur);
        const k = pose.t * pose.t * (3 - 2 * pose.t);
        const lerp = (a, b) => a.map((x, i) => x + (b[i] - x) * k);
        applyPose({ position: lerp(pose.from.position, pose.to.position), target: lerp(pose.from.target, pose.to.target) });
      }
      if (phase === 'clear') {
        glowMat.opacity = Math.min(0.9, glowMat.opacity + (still ? 1 : dt * 0.8));
        sunMat.opacity = 1;
      }
    },
    setPhase(next) {
      phase = next;
      if (next === 'sweep') { fallingGroup.visible = false; applyPose(POSE_SWEEP); }
      if (next === 'catch') { fallingGroup.visible = true; applyPose(POSE_CATCH); }
      if (next === 'clear') {
        segMats.forEach((m) => m.color.setHex(COLORS.pathClear));
        glideTo(POSE_CLEAR);
      }
    },
    sweep(k) {
      const p = piles[k];
      if (!p) return;
      p.shrink = 0;
      segMats[k]?.color.setHex(COLORS.pathClear);
    },
    // 잡은 잎은 잠깐 사라졌다가 가지에서 새로 떨어진다(조각은 방이 그린다)
    scatter(i) {
      hiddenLeaf.add(i);
      setTimeout(() => hiddenLeaf.delete(i), 250);
    },
    dispose() {
      root.remove(group);
      onBranch.dispose();
      for (const p of piles) p.mesh.dispose();
      fallen.dispose();
      disposeGroupGeometry(scenery);
      disposeGroupGeometry(trunkGroup);
      disposeGroupGeometry(branchMesh);
      sc.dispose();
      for (const d of disposables) d.dispose?.();
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.fov = saved.fov;
      camera.near = saved.near;
      camera.far = saved.far;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    },
  };
}
