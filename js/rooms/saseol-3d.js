// 작품 방 「님이 오마 하거늘」의 3D 장면: 달밤에 대문을 나서 건넌 산 쪽으로 뻗은 길, 길 끝에 서 있는 거무희뜩한 것.
// 공개하면 그림자가 걷히고, 그것이 껍질 벗겨 세워 둔 삼대 묶음이었음이 드러난다.
// 저폴리 상자·원뿔을 코드로 조립하고, 되풀이되는 것은 InstancedMesh 하나로 그린다. 그리기 호출은 열둘 안팎이다(예산 60).
// 그림자·후처리는 쓰지 않는다. 그리기는 부르는 쪽(세계 바탕)이 하고, 이 장면은 물체와 카메라만 움직인다.
import { TOKENS, mixHex } from '../world/palette.js';
import { createCharacter } from '../world/gfx/figures.js';

// ── 배치(1 = 1m, +y 위, +z 카메라 쪽) ──
const START_Z = 6.2;       // 학생이 서는 곳(중문 앞)
const STOP_Z = -11.6;      // 반전 바로 앞에서 멈추는 곳
const FIGURE = { x: 0.35, z: -14.2 };
const GATES_Z = [5.3, 3.6];   // 중문, 대문(첫 두 음보에 지나간다)
const GATE_HIDE_M = 2.2;      // 카메라가 문 앞 이만큼 안으로 들어오면 그 문을 감춘다
const WALL_X = 3.4;
const HEMP = mixHex(TOKENS.hanjiDeep, TOKENS.gold, 0.25);
const NIGHT = mixHex(TOKENS.meok, '#1c2230', 0.35);

const pathX = (z) => 0.55 * Math.sin(z * 0.22);

// 결정된 의사 난수(장면이 열 때마다 같게)
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function createRoomScene3D({ THREE, root, camera, assets, appearance = 'a', reduceMotion = () => false }) {
  const group = new THREE.Group();
  group.name = 'rs-room';
  root.add(group);
  const owned = [];   // 치울 기하·재질·무늬
  const own = (x) => { owned.push(x); return x; };
  const saved = { pos: camera.position.clone(), quat: camera.quaternion.clone(), up: camera.up.clone() };
  const rand = rng(41);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const color = new THREE.Color();

  // 빛(그리기 호출 없음)
  const hemi = new THREE.HemisphereLight(TOKENS.hanji, NIGHT, 0.85);
  const moonLight = new THREE.DirectionalLight(TOKENS.hanji, 0.9);
  moonLight.position.set(8, 12, -20);
  group.add(hemi, moonLight);

  // 밤하늘: 장면 전체를 감싸는 안쪽 구
  const sky = new THREE.Mesh(own(new THREE.SphereGeometry(90, 16, 8)), own(new THREE.MeshBasicMaterial({ color: NIGHT, side: THREE.BackSide, depthWrite: false })));
  sky.name = 'rs-sky';
  group.add(sky);

  // 땅과 길
  const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(70, 70)), own(new THREE.MeshLambertMaterial({ color: mixHex(TOKENS.meokSoft, TOKENS.meok, 0.35) })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -10;
  group.add(ground);
  const pathGeo = own(new THREE.PlaneGeometry(1.9, 26, 1, 26));
  pathGeo.rotateX(-Math.PI / 2);
  const pos = pathGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i) - 5;
    pos.setZ(i, z);
    pos.setX(i, pos.getX(i) + pathX(z));
    pos.setY(i, 0.01);
  }
  pathGeo.computeVertexNormals();
  const path = new THREE.Mesh(pathGeo, own(new THREE.MeshLambertMaterial({ color: mixHex(TOKENS.hanjiDeep, TOKENS.meokSoft, 0.35) })));
  path.name = 'rs-path';
  group.add(path);

  // 중문·대문: 문마다 상자 다섯(기둥 둘, 인방, 양옆 담). 카메라가 문을 지나갈 때는 그 문을 감춘다(화면을 가리지 않게).
  const gateBoxes = [];
  for (const [gi, gz] of GATES_Z.entries()) {
    const c = gi === 0 ? TOKENS.meokSoft : mixHex(TOKENS.meokSoft, TOKENS.juhong, 0.35);
    const side = mixHex(TOKENS.hanjiDeep, TOKENS.meokSoft, 0.5);
    gateBoxes.push({ g: gi, p: [-1.25, 1.2, gz], s: [0.24, 2.4, 0.24], c });
    gateBoxes.push({ g: gi, p: [1.25, 1.2, gz], s: [0.24, 2.4, 0.24], c });
    gateBoxes.push({ g: gi, p: [0, 2.48, gz], s: [2.9, 0.22, 0.3], c: TOKENS.meok });
    gateBoxes.push({ g: gi, p: [-1.9, 0.9, gz], s: [1.2, 1.8, 0.2], c: side });
    gateBoxes.push({ g: gi, p: [1.9, 0.9, gz], s: [1.2, 1.8, 0.2], c: side });
  }
  const boxGeo = own(new THREE.BoxGeometry(1, 1, 1));
  const gates = new THREE.InstancedMesh(boxGeo, own(new THREE.MeshLambertMaterial({ color: '#ffffff' })), gateBoxes.length);
  const gateShown = GATES_Z.map(() => null);
  function showGates(camZ) {
    let changed = false;
    GATES_Z.forEach((gz, gi) => {
      const want = camZ - gz > GATE_HIDE_M;
      if (gateShown[gi] === want) return;
      gateShown[gi] = want;
      changed = true;
      gateBoxes.forEach((b, i) => {
        if (b.g !== gi) return;
        m4.compose(v.set(...b.p), q.identity(), want ? sc.set(...b.s) : sc.set(0, 0, 0));
        gates.setMatrixAt(i, m4);
      });
    });
    if (changed) gates.instanceMatrix.needsUpdate = true;
  }
  gateBoxes.forEach((b, i) => gates.setColorAt(i, color.set(b.c)));
  gates.name = 'rs-gates';
  group.add(gates);

  // 돌담
  const boxes = [];
  for (let z = 1.2; z > -22; z -= 1.0) {
    for (const side of [-1, 1]) {
      const g = 0.25 + rand() * 0.3;
      boxes.push({ p: [side * (WALL_X + rand() * 0.2) + pathX(z) * 0.5, 0.28, z], s: [0.7, 0.55 + rand() * 0.15, 0.9], c: mixHex(TOKENS.meokFog, TOKENS.meok, g) });
    }
  }
  const boxMesh = new THREE.InstancedMesh(boxGeo, own(new THREE.MeshLambertMaterial({ color: '#ffffff' })), boxes.length);
  boxes.forEach((b, i) => {
    m4.compose(v.set(...b.p), q.identity(), sc.set(...b.s));
    boxMesh.setMatrixAt(i, m4);
    boxMesh.setColorAt(i, color.set(b.c));
  });
  boxMesh.name = 'rs-walls';
  group.add(boxMesh);

  // 풀숲
  const tufts = [];
  for (let i = 0; i < 90; i++) {
    const z = 7 - rand() * 30;
    const side = rand() < 0.5 ? -1 : 1;
    const x = pathX(z) + side * (1.3 + rand() * 1.8 + (rand() < 0.4 ? 3 : 0));
    tufts.push({ x, z, h: 0.4 + rand() * 0.6, c: mixHex(TOKENS.meokSoft, rand() < 0.3 ? TOKENS.nokcheong : TOKENS.hanjiDeep, 0.2 + rand() * 0.2) });
  }
  const grass = new THREE.InstancedMesh(own(new THREE.ConeGeometry(0.16, 1, 4)), own(new THREE.MeshLambertMaterial({ color: '#ffffff' })), tufts.length);
  tufts.forEach((t, i) => {
    m4.compose(v.set(t.x, t.h / 2, t.z), q.identity(), sc.set(1, t.h, 1));
    grass.setMatrixAt(i, m4);
    grass.setColorAt(i, color.set(t.c));
  });
  group.add(grass);

  // 건넌 산
  const hillSpec = [[-14, -34, 9, 5.5], [-3, -40, 12, 7.5], [10, -36, 10, 6], [20, -42, 12, 7]];
  const hills = new THREE.InstancedMesh(own(new THREE.ConeGeometry(1, 1, 7)), own(new THREE.MeshLambertMaterial({ color: '#ffffff' })), hillSpec.length);
  hillSpec.forEach(([x, z, r, h], i) => {
    m4.compose(v.set(x, h / 2 - 0.2, z), q.identity(), sc.set(r, h, r * 0.6));
    hills.setMatrixAt(i, m4);
    hills.setColorAt(i, color.set(mixHex(TOKENS.meokSoft, NIGHT, 0.3 + i * 0.1)));
  });
  group.add(hills);

  // 달
  const moon = new THREE.Mesh(own(new THREE.CircleGeometry(1.7, 24)), own(new THREE.MeshBasicMaterial({ color: TOKENS.hanji })));
  moon.position.set(9, 12, -45);
  group.add(moon);

  // 삼대 묶음: 가는 대 여럿을 위쪽에서 모아 묶은 모양(공개 전에는 먹빛)
  const STALKS = 22;
  const stalkMat = own(new THREE.MeshLambertMaterial({ color: TOKENS.meok }));
  const bundle = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.03, 0.045, 2.6, 5)), stalkMat, STALKS);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < STALKS; i++) {
    const a = (i / STALKS) * Math.PI * 2 + rand() * 0.3;
    const r = 0.18 + rand() * 0.12;
    const foot = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const top = new THREE.Vector3(Math.cos(a) * 0.05, 2.6, Math.sin(a) * 0.05);
    const dir = top.clone().sub(foot);
    const len = dir.length();
    q.setFromUnitVectors(up, dir.normalize());
    m4.compose(foot.clone().add(top).multiplyScalar(0.5), q, sc.set(1, len / 2.6, 1));
    bundle.setMatrixAt(i, m4);
  }
  bundle.position.set(FIGURE.x, 0, FIGURE.z);
  bundle.name = 'rs-bundle';
  group.add(bundle);

  // 그림자 덮개: 멀리서 보면 사람이 서 있는 듯한 거무희뜩한 모양
  const veilMat = own(new THREE.MeshBasicMaterial({ color: mixHex(TOKENS.meok, NIGHT, 0.4), transparent: true, opacity: 0.92, depthWrite: false }));
  const veil = new THREE.Mesh(own(new THREE.CapsuleGeometry(0.42, 1.9, 4, 10)), veilMat);
  veil.position.set(FIGURE.x, 1.38, FIGURE.z);
  veil.name = 'rs-veil';
  group.add(veil);

  // 학생: 세계와 같은 절차 3D 인물(gfx/figures-3d.js). 발 자리가 원점이고, 움직인 거리로 걸음을 스스로 맞춘다
  const FIGURE_H = 1.55;
  const student = createCharacter(THREE, { kind: 'student-' + (appearance === 'b' ? 'b' : 'a'), height: FIGURE_H, reduceMotion, name: 'rs-runner', faceCamera: false });
  const runner = student.root;
  group.add(runner);

  // 발자국: 박에 맞춰 두드린 자리마다 작은 금빛 점
  const MAX_STEPS = 40;
  const steps = new THREE.InstancedMesh(own(new THREE.CircleGeometry(0.11, 8)), own(new THREE.MeshBasicMaterial({ color: TOKENS.gold })), MAX_STEPS);
  steps.count = 0;
  steps.name = 'rs-steps';
  group.add(steps);

  // ── 상태와 움직임 ──
  let target = 0;        // 0~1(멈출 곳까지의 몫)
  let shown = 0;
  let panelFrac = 0.45;
  let revealT = -1;      // 공개 진행(0~1), 공개 전 -1
  let hop = 0;
  let raf = 0;
  let last = 0;
  const hempColor = new THREE.Color(HEMP);
  const darkColor = new THREE.Color(TOKENS.meok);
  const lookAt = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const right = new THREE.Vector3();

  const zAt = (p) => START_Z + (STOP_Z - START_Z) * p;

  function placeCamera(snap, dt) {
    const rz = runner.position.z;
    const rx = runner.position.x;
    const revealing = revealT >= 0;
    // 공개 때는 학생 어깨 너머로 서 있는 것을 가까이 본다
    const want = revealing
      ? camPos.set(rx + 1.4, 2.1, rz + 3.6)
      : camPos.set(rx + 1.3, 2.5, rz + 5.6);
    if (snap) camera.position.copy(want);
    else camera.position.lerp(want, 1 - Math.exp(-dt * 4));
    lookAt.set(revealing ? FIGURE.x : rx, 1.15, revealing ? FIGURE.z + 0.5 : rz - 4);
    // 글 판이 오른쪽을 덮으므로 바라보는 점을 오른쪽으로 밀어 장면이 왼쪽 빈자리 가운데에 오게 한다
    const dist = camera.position.distanceTo(lookAt);
    const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * (camera.aspect || 16 / 9));
    right.set(1, 0, 0);
    lookAt.addScaledVector(right, panelFrac * Math.tan(hfov / 2) * dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookAt);
    showGates(camera.position.z);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
    last = now;
    const snap = reduceMotion();
    const tz = zAt(target);
    if (snap) runner.position.z = tz;
    else runner.position.z += (tz - runner.position.z) * (1 - Math.exp(-dt * 7));
    runner.position.x = pathX(runner.position.z) - 0.25;
    hop = snap ? 0 : Math.max(0, hop - dt * 5);
    runner.position.y = Math.sin(hop * Math.PI) * 0.12;
    if (revealT >= 0 && revealT < 1) {
      revealT = snap ? 1 : Math.min(1, revealT + dt / 1.2);
      veilMat.opacity = 0.92 * (1 - revealT);
      stalkMat.color.copy(darkColor).lerp(hempColor, revealT);
      if (revealT >= 1) veil.visible = false;
    }
    placeCamera(snap, dt);
    student.update(dt, camera, { dir: { x: 0, z: -1 } });
  }

  runner.position.set(pathX(START_Z) - 0.25, 0, START_Z);
  placeCamera(true, 0);
  raf = requestAnimationFrame(frame);

  function markStep() {
    if (steps.count >= MAX_STEPS) return;
    const z = runner.position.z;
    m4.compose(v.set(pathX(z) + (steps.count % 2 ? 0.18 : -0.18), 0.03, z), q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), sc.set(1, 1, 1));
    steps.setMatrixAt(steps.count, m4);
    steps.count++;
    steps.instanceMatrix.needsUpdate = true;
  }

  return {
    setProgress(p) { shown = p; target = Math.min(1, Math.max(0, p)); hop = 1; },
    step() { hop = 1; },
    hit() { hop = 1; markStep(); },
    stop() { target = 1; },
    reveal() {
      if (revealT >= 0) return;
      revealT = 0;
      if (reduceMotion()) { revealT = 1; veilMat.opacity = 0; veil.visible = false; stalkMat.color.copy(hempColor); }
    },
    setPanelFraction(f) { panelFrac = Number.isFinite(f) ? f : panelFrac; },
    info: () => ({ shown, target, revealT }),
    dispose() {
      cancelAnimationFrame(raf);
      root.remove(group);
      student.dispose();
      for (const x of owned) x.dispose?.();
      owned.length = 0;
      camera.position.copy(saved.pos);
      camera.quaternion.copy(saved.quat);
      camera.up.copy(saved.up);
      camera.updateMatrixWorld?.();
    },
  };
}
