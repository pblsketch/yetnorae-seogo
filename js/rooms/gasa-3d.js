// 「상춘곡」 방의 3D 장면(spec 14): 수묵 담채 봄 풍경. 초가(수간모옥) → 정자 → 시냇가 → 산봉우리 길을 걷는다.
// 풍경은 gfx 꾸러미(js/world/gfx/t37-scenery.js)로 짓는다: 초가지붕, 모임지붕 정자, 흐르는 시내와 나무다리,
// 높이 면 산봉우리(꼭대기 먹 → 밑동 한지색), 수묵 병풍 세 줄의 먼 산, 종이 오린 소나무·꽃나무, 떨어지는 꽃잎.
// 걷는 사람은 세계와 같은 절차 3D 인물(gfx/figures.js createCharacter). 그림자·후처리 없음, 그리기 호출 60 이하(역할마다 하나).
// three가 주어지면({ THREE, root, camera }) 그 root에 붙이고 카메라만 움직인다(그리기는 부르는 쪽).
// 없으면 장면 칸 안에 그림판을 스스로 만든다.
import { createRoute } from './gasa-route.js';
import { createScenery, disposeGroupGeometry } from '../world/gfx/t37-scenery.js';
import { createCharacter } from '../world/gfx/figures.js';
import { TOKENS } from '../world/palette.js';
import { createAssets } from '../world/assets.js';

export const PIXEL_RATIO_MAX = 1.5;
const CAMERA_OFFSET = [0, 6.6, 13.5];
const LOOK_UP = 1.5;

// 바닥 좌표(x, z). 머무는 곳: 수간모옥 → 정자 → 시냇가 → 산봉우리 → 마무리(꼭대기)
export const ROUTE_3D = [
  [[-14, 2.5], [-10, 3], [-6, 1], [-1, 0.5], [6, -2.5]],
  [[6, -2.5], [2, 2.5], [-4.5, 6]],
  [[-4.5, 6], [2, 8], [12, 4], [17, -6], [19.5, -11], [20.5, -14.2]],
  [[20.5, -14.2], [21.4, -16], [21.9, -17.2]],
];
const MOUNTAIN = { x: 22, z: -18, r: 9.5, h: 10 };
const STREAM_X = -6;
const LABEL_W = 2.4;
const LABEL_AT = { hut: [-14, 5.2, -1], pavilion: [6, 5, -6], stream: [-6, 2.4, 7], peak: [22, 11.6, -18] };

// 산 비탈 높이(원뿔). 장면이 산 덩이를 지으면 그 높이 면으로 바꾼다
function coneHeight(x, z) {
  const d = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
  return Math.max(0, MOUNTAIN.h * (1 - d / MOUNTAIN.r));
}

// 늘 같은 자리가 나오는 난수(장면이 매번 같아 보이게)
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function labelTexture(THREE, text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = TOKENS.hanji;
  g.strokeStyle = TOKENS.meok;
  g.lineWidth = 6;
  g.beginPath();
  if (g.roundRect) g.roundRect(4, 4, 248, 72, 14); else g.rect(4, 4, 248, 72);
  g.fill();
  g.stroke();
  g.fillStyle = TOKENS.meok;
  g.font = 'bold 40px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createScene3D({ host, three = null, assets = null, manifest = null, appearance = 'a', stations, reduceMotion = () => false, onCalls = () => {} }) {
  const THREE = three?.THREE ?? (await import('three'));
  const route = createRoute(ROUTE_3D);
  let heightAt = coneHeight;
  const art = manifest ? createAssets(manifest, THREE) : assets;
  const owned = [];   // 치울 것(geometry, material, texture)
  const own = (x) => { owned.push(x); return x; };
  const basic = (color, extra = {}) => own(new THREE.MeshBasicMaterial({ color, ...extra }));

  // ── 그림판 ──
  let renderer = null;
  let scene = null;
  let camera = three?.camera ?? null;
  let canvas = null;
  if (!three) {
    canvas = document.createElement('canvas');
    canvas.className = 'rg-canvas';
    host.prepend(canvas);
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    } catch (e) {
      canvas.remove();
      throw e;
    }
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, PIXEL_RATIO_MAX));
    renderer.shadowMap.enabled = false;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(TOKENS.hanji);
    camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 300);
  }
  const group = new THREE.Group();
  group.name = 'room-gasa';
  (three?.root ?? scene).add(group);

  const add = (geo, mat, pos = [0, 0, 0], rot = null) => {
    own(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    group.add(m);
    return m;
  };

  // ── 풍경(gfx 꾸러미): 역할마다 그리기 호출 하나 ──
  const sc = createScenery(THREE);
  sc.materials.setDancheong(1);   // 방은 봄빛 그대로(먹빛 걸이를 풀어 둔다)
  const b = sc.kit.builder();

  // 빛(그룹 안에 둔다): 반구광 + 왼쪽 앞 위의 봄 햇살 + 서늘한 보조광
  const hemi = new THREE.HemisphereLight(0xfff6e6, 0x8a8576, 1.9);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
  sun.position.set(-10, 20, 12);
  const fill = new THREE.DirectionalLight(0xd6e0e6, 0.35);
  fill.position.set(12, 6, -10);
  group.add(hemi, sun, fill);

  // 땅: 봄 들판색이 가장자리에서 한지 바탕으로 번진다
  sc.groundDisc(b, { x: 4, z: -10, r: 52, color: '#d2cca4', rings: 4 });

  // 먼 산: 수묵 먼 산 두 줄(먼 줄은 엷고 크게, 가까운 줄은 짙게) — 길 뒤로 겹겹이 물러난다
  sc.inkRanges(b, { x0: -110, x1: 120, z: -50, height: 20, gap: 14, y: -3 });

  // 산봉우리: 높이 면 산 덩이(꼭대기 짙은 먹 → 밑동 한지색). 길은 이 산의 높이를 따라 오른다
  const peak = sc.mountainMass(sc.materials, { x: MOUNTAIN.x, z: MOUNTAIN.z, r: MOUNTAIN.r * 1.35, h: MOUNTAIN.h, seed: 11, top: '#4d4b44', foot: '#d2cca4', peaks: 4 });
  heightAt = (x, z) => peak.height(x, z);
  group.add(peak.mesh);
  // 봉우리 바위와 소나무
  for (const [dx, dz, s, k] of [[1.6, 1.2, 0.8, 1], [-1.8, 0.6, 0.6, 2], [0.4, -1.9, 0.9, 3], [2.6, -1.2, 0.55, 4]]) {
    const x = MOUNTAIN.x + dx;
    const z = MOUNTAIN.z + dz;
    sc.rock(b, { x, y: heightAt(x, z) - 0.15, z, s, seed: k, color: '#6f6b62', shadow: false });
  }

  // 시내: 산 쪽에서 흘러 내려와 길 아래를 지난다(다리)
  const streamPts = [];
  for (let z = -30; z <= 18; z += 2) streamPts.push([STREAM_X - 0.3 + 0.6 * Math.sin(z * 0.2), z]);
  sc.stream(b, { points: streamPts, width: 2.3, seed: 4 });
  // 나무다리: 길이 시내를 건너는 쪽(x)으로 놓인 널판 + 난간
  b.box('wood', 3.8, 0.18, 1.9, { p: [STREAM_X, 0.32, 1], color: '#7a5f46', ao: 0.2 });
  for (const dz of [-0.85, 0.85]) {
    b.box('wood', 3.8, 0.08, 0.08, { p: [STREAM_X, 0.85, 1 + dz], color: '#5e4a3a', ao: 0 });
    for (const dx of [-1.7, 0, 1.7]) b.box('wood', 0.09, 0.55, 0.09, { p: [STREAM_X + dx, 0.6, 1 + dz], color: '#5e4a3a', ao: 0 });
  }
  for (const dx of [-1.6, 1.6]) b.add('wood', sc.kit.cylinder(0.1, 0.12, 0.6, 8), { p: [STREAM_X + dx, 0.05, 1], color: '#4f3f32' });

  // 수간모옥: 초가 세 칸, 싸리 울타리
  sc.thatchedHut(b, { x: -15, z: -1.2, bays: 3, bayW: 1.5, depth: 2.4, wall: 1.75, base: 0.36 });
  for (let i = 0; i < 15; i++) {
    const x = -20.2 + i * 0.75;
    if (x > -15.8 && x < -13.4) continue;   // 사립문 자리
    b.box('wood', 0.06, 0.8 + (i % 3) * 0.08, 0.06, { p: [x, 0.42, 2.2], r: [0, 0, (i % 2 ? 0.05 : -0.04)], color: '#6b5b4a', ao: 0 });
  }
  b.box('wood', 9.6, 0.05, 0.05, { p: [-15.8, 0.65, 2.2], color: '#5e4e40', ao: 0 });

  // 정자: 모임지붕, 붉은 기둥(석간주), 뇌록 창방
  sc.pavilion(b, { x: 6, z: -5.5, size: 3.0, height: 2.3 });

  // 종이 나무: 소나무와 꽃나무(봄). 길과 집 둘레를 비워 둔다. 알파 카드라 겹을 두 장으로 줄인다
  const trees = [
    [-19.5, -4.5, 4.4, 'pine'], [-11, -4.5, 3.6, 'blossom'], [-23, 0.5, 4.6, 'pine'], [-8.6, -7, 3.4, 'blossom'],
    [-2.5, -8.5, 4.2, 'pine'], [1.5, -11, 3.8, 'blossom'], [10.5, -1.5, 3.2, 'blossom'], [10.5, -10, 4.6, 'pine'],
    [14.5, -4.5, 4.4, 'pine'], [-14, -10.5, 4.6, 'pine'], [16.5, -13, 3.2, 'blossom'], [-17, -6.5, 3.0, 'blossom'],
  ];
  trees.forEach(([x, z, h, kind], i) => sc.kit.paperTree(b, { x, z, h, kind, seed: i + 3, layers: i < 2 ? 2 : 1 }));
  // 산비탈 소나무(땅 높이에 앉힌다)
  for (const [dx, dz, h] of [[-4.5, 3.5, 3.4], [4.2, 3.8, 3.0], [-5.6, -2.6, 3.8], [5.8, -1.8, 3.6]]) {
    const x = MOUNTAIN.x + dx;
    const z = MOUNTAIN.z + dz;
    const y = heightAt(x, z);
    b.add('foliage', sc.kit.card(0, 0, 0.5, 1), { p: [x, y - 0.2, z], s: [h, h, 1], uv: 'keep', shade: 0.85, ao: 0.2 });
  }
  // 꽃 덤불·풀 무더기: 길가의 진달래(작은 꽃나무 카드)
  for (const [x, z] of [[-11, -0.4], [-3, 3.2], [9, -1.2], [-8.2, 7.6], [13, 1.6], [18, -8.5], [19, -12.5]]) {
    const y = heightAt(x, z);
    b.add('foliage', sc.kit.card(0.5, 0, 1, 1), { p: [x, y - 0.05, z], s: [1.5, 1.4, 1], uv: 'keep', shade: 1, ao: 0.1 });
  }
  for (const [x, z, s, k] of [[-3.4, 7.2, 0.5, 1], [2, 9, 0.45, 2], [15, -2, 0.6, 3], [-9.5, -2.2, 0.55, 4], [8.6, -8.4, 0.7, 2]]) sc.rock(b, { x, z, s, seed: k, color: '#a29c90' });

  const scenery = sc.build(b, 'room-gasa-scenery');
  group.add(scenery);
  // 시냇물 흐름(무늬만 흘러간다)
  const water = sc.waterTexture();

  // 달(청풍명월): 한지색 둥근 달과 엷은 달무리
  const moon = add(new THREE.CircleGeometry(2.2, 32), basic('#f6edd2'), [34, 22, -46]);
  const halo = add(new THREE.CircleGeometry(4.2, 32), basic('#fbf3dc', { transparent: true, opacity: 0.45, depthWrite: false }), [34, 22, -46.2]);
  moon.add(halo);
  halo.position.set(0, 0, -0.2);
  halo.renderOrder = -11;

  // 길 띠: 전체와 걸은 부분(같은 모양, 그리는 범위만 다르다)
  const samples = route.samples(0.4);
  const W = 0.7;
  const pos = [];
  samples.forEach(({ p }, i) => {
    const a = samples[Math.max(0, i - 1)].p;
    const b = samples[Math.min(samples.length - 1, i + 1)].p;
    const dx = b[0] - a[0]; const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l; const nz = dx / l;
    for (const sgn of [-1, 1]) {
      const x = p[0] + nx * W * sgn; const z = p[1] + nz * W * sgn;
      const y = heightAt(x, z);
      pos.push(x, y + (y > 0.02 ? 0.16 : 0.06), z);
    }
  });
  const idx = [];
  for (let i = 0; i < samples.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const pathGeo = own(new THREE.BufferGeometry());
  pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pathGeo.setIndex(idx);
  pathGeo.computeVertexNormals();
  const pathMesh = new THREE.Mesh(pathGeo, basic('#e6d8b4', { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  group.add(pathMesh);
  const walkedGeo = own(pathGeo.clone());
  const walkedMesh = new THREE.Mesh(walkedGeo, basic(TOKENS.nokcheong, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  walkedMesh.position.y = 0.02;
  group.add(walkedMesh);
  const sampleS = samples.map((x) => x.s);
  function setWalked(s) {
    let i = 0;
    while (i < sampleS.length - 1 && sampleS[i + 1] <= s + 1e-9) i++;
    walkedGeo.setDrawRange(0, i * 6);
  }

  // 머무는 곳 이름표
  const labels = {};
  for (const st of stations) {
    const at = LABEL_AT[st.id];
    if (!at) continue;
    const tex = own(labelTexture(THREE, st.name));
    const sp = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: tex, depthTest: false })));
    sp.scale.set(LABEL_W, LABEL_W * 0.3125, 1);
    sp.position.set(...at);
    sp.renderOrder = 2;
    group.add(sp);
    labels[st.id] = sp;
  }

  // 걷는 사람: 세계와 같은 절차 3D 인물(gfx/figures-3d.js). 카메라가 멀어서 조금 크게 세우고, 움직인 거리로 걸음을 맞춘다
  const student = createCharacter(THREE, { kind: appearance === 'b' ? 'student-b' : 'student-a', height: 1.85, reduceMotion, name: 'rg-walker', faceCamera: false });
  const walker = student.root;
  group.add(walker);

  // 떨어지는 꽃잎(움직임 줄이기면 멈춘다): 다섯 장 꽃잎 모양 하나를 인스턴스로
  const rnd = seeded(15);
  const m4 = new THREE.Matrix4();
  const petalEuler = new THREE.Euler();
  const PETALS = 36;
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0, -0.1);
  petalShape.bezierCurveTo(0.11, -0.05, 0.1, 0.07, 0.03, 0.1);
  petalShape.lineTo(0, 0.07);
  petalShape.lineTo(-0.03, 0.1);
  petalShape.bezierCurveTo(-0.1, 0.07, -0.11, -0.05, 0, -0.1);
  const petalGeo = own(new THREE.ShapeGeometry(petalShape, 3));
  const petals = new THREE.InstancedMesh(petalGeo, basic('#eab8b3', { side: THREE.DoubleSide }), PETALS);
  const petalState = [...Array(PETALS)].map(() => ({ x: rnd() * 24 - 12, y: rnd() * 8, z: rnd() * 12 - 8, sp: 0.4 + rnd() * 0.5, ph: rnd() * 6 }));
  const pc = new THREE.Color();
  for (let i = 0; i < PETALS; i++) petals.setColorAt(i, pc.set(i % 3 ? '#efc9c2' : '#f7e8df'));
  petals.frustumCulled = false;
  group.add(petals);

  // ── 움직임 ──
  let s = 0;
  let from = 0;
  let to = 0;
  let t = 0;
  let dur = 0;
  let paused = false;
  let finale = false;
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function walkerAt(sv) {
    const [x, z] = route.point(sv);
    return tmp.set(x, heightAt(x, z) + 0.05, z);
  }

  function aimCamera(snap) {
    const w = walkerAt(s);
    walker.position.copy(w);
    look.set(w.x, w.y + LOOK_UP, w.z);
    const target = new THREE.Vector3(w.x + CAMERA_OFFSET[0], w.y + CAMERA_OFFSET[1], w.z + CAMERA_OFFSET[2]);
    if (snap) camPos.copy(target); else camPos.lerp(target, 0.08);
    camera.position.copy(camPos);
    camera.lookAt(look);
  }

  function update(dt) {
    if (paused) return;
    const rm = reduceMotion();
    if (!rm) water.offset.y -= dt * 0.22;
    if (t < dur && !rm) { t = Math.min(dur, t + dt); s = from + (to - from) * (t / dur); } else s = to;
    setWalked(s);
    aimCamera(rm);
    student.update(dt, camera);
    // 꽃잎
    const time = performance.now() / 1000;
    petalState.forEach((p, i) => {
      if (!rm) { p.y -= p.sp * dt; if (p.y < 0) p.y = 8; }
      m4.makeRotationFromEuler(petalEuler.set(time * p.sp + p.ph, p.ph, 0));
      m4.setPosition(walker.position.x + p.x, walker.position.y + p.y, walker.position.z + p.z);
      petals.setMatrixAt(i, m4);
    });
    petals.instanceMatrix.needsUpdate = true;
    if (finale) { const k = Math.min(1.6, moon.scale.x + (rm ? 1 : dt * 0.6)); moon.scale.set(k, k, k); }
  }

  let raf = 0;
  let last = performance.now();
  let lastCalls = -1;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    update(dt);
    if (renderer) {
      const w = canvas.clientWidth; const h = canvas.clientHeight;
      if (w && h && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()))) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
      const calls = renderer.info.render.calls;
      if (calls !== lastCalls) { lastCalls = calls; onCalls(calls); }
    }
    raf = requestAnimationFrame(frame);
  }
  aimCamera(true);
  raf = requestAnimationFrame(frame);

  return {
    mode: '3d',
    walkTo(next, sec = 0) { from = s; to = next; t = 0; dur = Math.max(0, sec); if (!dur) s = to; },
    setStation(id) {
      for (const [k, sp] of Object.entries(labels)) { const w = k === id ? LABEL_W * 1.2 : LABEL_W; sp.scale.set(w, w * 0.3125, 1); }
    },
    setPaused(v) { paused = !!v; },
    finale() { finale = true; },
    info: () => ({ s, drawCalls: lastCalls }),
    dispose() {
      cancelAnimationFrame(raf);
      student.dispose();
      group.parent?.remove(group);
      for (const x of owned) x.dispose?.();
      petals.dispose();
      disposeGroupGeometry(scenery);
      peak.mesh.geometry.dispose();
      sc.dispose();
      if (art !== assets) art?.dispose?.();
      renderer?.dispose();
      canvas?.remove();
    },
  };
}
