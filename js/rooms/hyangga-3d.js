// 작품 방 「제망매가」 3D 무대: 바람 부는 가지, 떨어지는 잎, 미타찰로 가는 길(저폴리, 그림자 없음, 빛 계산 없는 재질).
// 부르는 쪽이 넘긴 root에 모형을 붙이고 camera를 잠시 빌린다(끝나면 처음 자리로 되돌린다). 그리기는 부르는 쪽이 한다.
// 누를 자리(잎·무더기)는 방이 DOM 단추로 만들고, 이 무대는 그 자리를 화면 좌표로 투영해 준다.
// 그리기 호출: 땅·하늘·해·산 셋·가지 넷·가지의 잎·떨어지는 잎 넷·길 다섯·무더기 넷·문 셋·빛 하나 = 약 28회.

const COLORS = {
  sky: 0xead6b0,
  sun: 0xe0a64a,
  hill: [0x8d8a85, 0x9a948a, 0x7f7a73],
  ground: 0xa79f90,
  wood: 0x3d3632,
  leaf: [0xc4462f, 0xb88a2a, 0x8a4a2c],
  pathCovered: 0x7d6650,
  pathClear: 0xefe5cb,
  pile: 0x9c4b32,
  gate: 0xc4462f,
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

  // ── 배경: 하늘, 해, 산, 땅 ──
  const sky = mesh(new THREE.PlaneGeometry(180, 70), basic(COLORS.sky));
  sky.position.set(0, 20, -48);
  const sunMat = basic(COLORS.sun, { transparent: true, opacity: 0.85 });
  const sun = mesh(new THREE.CircleGeometry(3.2, 24), sunMat);
  sun.position.set(2, 4.5, -46);
  [[-14, 3, -34, 7, 6], [12, 3.5, -36, 8, 7], [1, 2.2, -38, 6, 4.5]].forEach(([x, y, z, r, h], i) => {
    const hill = mesh(new THREE.ConeGeometry(r, h, 5), basic(COLORS.hill[i]));
    hill.position.set(x, y - 0.6, z);
  });
  const ground = mesh(new THREE.PlaneGeometry(70, 70), basic(COLORS.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -18);

  // ── 바람 부는 가지 ──
  const wood = basic(COLORS.wood);
  const trunk = mesh(new THREE.CylinderGeometry(0.22, 0.4, 3.7, 7), wood);
  trunk.position.set(-4.1, 1.85, -0.6);
  const branch = new THREE.Group();          // 줄기 끝을 축으로 흔들린다
  branch.position.set(-4.0, 3.3, -0.5);
  group.add(branch);
  const limb = (len, r0, r1, x, y, rz) => {
    const m = mesh(new THREE.CylinderGeometry(r1, r0, len, 6), wood, branch);
    m.position.set(x, y, 0);
    m.rotation.z = rz;
    return m;
  };
  limb(6.4, 0.18, 0.07, 3.1, 0.15, -Math.PI / 2 + 0.06);
  limb(2.0, 0.08, 0.035, 2.4, 0.75, -0.75);
  limb(1.6, 0.07, 0.03, 4.9, 0.5, -1.0);
  // 가지에 남은 잎(한 번에 그리는 묶음)
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -0.22);
  leafShape.bezierCurveTo(0.17, -0.08, 0.15, 0.12, 0, 0.24);
  leafShape.bezierCurveTo(-0.15, 0.12, -0.17, -0.08, 0, -0.22);
  const leafGeo = keep(new THREE.ShapeGeometry(leafShape));
  const onBranch = new THREE.InstancedMesh(leafGeo, basic(COLORS.leaf[0], { side: THREE.DoubleSide }), 12);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < 12; i++) {
    const x = 0.6 + i * 0.5;
    e.set(0.3 * Math.sin(i * 1.7), 0.5 * Math.cos(i), Math.PI * (i % 2 ? 0.75 : 1.2));
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, -0.05 - 0.18 * Math.sin(i * 2.1), 0.15 * Math.cos(i * 1.3)), q, new THREE.Vector3(1.1, 1.1, 1.1));
    onBranch.setMatrixAt(i, m4);
  }
  branch.add(onBranch);

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
  const pileMat = basic(COLORS.pile);
  const piles = [];
  for (let k = 0; k < pileCount; k++) {
    const [x, z] = pts[k + 1];
    const p = mesh(new THREE.DodecahedronGeometry(0.55, 0), pileMat);
    p.scale.set(1.25, 0.35, 1);
    p.position.set(x, 0.14, z);
    piles.push({ mesh: p, shrink: null });
  }
  const gateMat = basic(COLORS.gate);
  [-1.1, 1.1].forEach((dx) => { const p = mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), gateMat); p.position.set(GATE.x + dx, 1.3, GATE.z); });
  const lintel = mesh(new THREE.BoxGeometry(3.0, 0.3, 0.45), gateMat);
  lintel.position.set(GATE.x, 2.7, GATE.z);
  const glowMat = basic(COLORS.glow, { transparent: true, opacity: 0.18, depthWrite: false });
  const glow = mesh(new THREE.CircleGeometry(2.0, 24), glowMat);
  glow.position.set(GATE.x, 1.4, GATE.z - 0.3);

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
        p.mesh.scale.set(1.25 * s, 0.35 * s, s);
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
