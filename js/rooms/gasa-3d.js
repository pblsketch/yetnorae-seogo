// 「상춘곡」 방의 3D 장면(spec 14): 저폴리 디오라마. 초가(수간모옥) → 정자 → 시냇가 → 산봉우리 길을 걷는다.
// 인물은 2D 종이 인형 스프라이트, 그림자·후처리 없음, 그리기 호출 60 이하.
// three가 주어지면({ THREE, root, camera }) 그 root에 붙이고 카메라만 움직인다(그리기는 부르는 쪽).
// 없으면 장면 칸 안에 그림판을 스스로 만든다.
import { createRoute } from './gasa-route.js';
import { createCharacter } from '../world/gfx/figures.js';
import { TOKENS } from '../world/palette.js';
import { createAssets } from '../world/assets.js';

export const PIXEL_RATIO_MAX = 1.5;
const CAMERA_OFFSET = [0, 8.5, 14];
const LOOK_UP = 1.2;

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

// 산 비탈 높이(원뿔)
function heightAt(x, z) {
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
  const art = manifest ? createAssets(manifest, THREE) : assets;
  const owned = [];   // 치울 것(geometry, material, texture)
  const own = (x) => { owned.push(x); return x; };
  const lambert = (color, extra = {}) => own(new THREE.MeshLambertMaterial({ color, ...extra }));
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

  // 빛(그룹 안에 둔다)
  group.add(new THREE.HemisphereLight(0xfff6e6, 0x8d8a85, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-10, 20, 12);
  group.add(sun);

  const add = (geo, mat, pos = [0, 0, 0], rot = null) => {
    own(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    group.add(m);
    return m;
  };

  // 바닥, 먼 산, 큰 산
  add(new THREE.PlaneGeometry(140, 120), lambert(TOKENS.hanjiDeep), [0, 0, -10], [-Math.PI / 2, 0, 0]);
  const far = lambert(TOKENS.meokFog);
  add(new THREE.ConeGeometry(14, 16, 5), far, [-20, 8, -50]);
  add(new THREE.ConeGeometry(12, 20, 5), far, [4, 10, -58]);
  add(new THREE.ConeGeometry(16, 14, 5), far, [40, 7, -52]);
  add(new THREE.ConeGeometry(MOUNTAIN.r, MOUNTAIN.h, 7), lambert('#7d7a72', { flatShading: true }), [MOUNTAIN.x, MOUNTAIN.h / 2, MOUNTAIN.z]);
  // 봉우리 꼭대기 작은 정자
  add(new THREE.ConeGeometry(1.1, 0.7, 4), lambert(TOKENS.meokSoft), [MOUNTAIN.x + 0.6, MOUNTAIN.h + 0.2, MOUNTAIN.z - 0.6], [0, Math.PI / 4, 0]);

  // 시내와 다리
  add(new THREE.PlaneGeometry(2.4, 44), lambert('#8fb5b0'), [STREAM_X, 0.03, -6], [-Math.PI / 2, 0, 0]);
  add(new THREE.BoxGeometry(2.0, 0.35, 3.4), lambert('#8a6a48'), [STREAM_X, 0.25, 1]);

  // 초가(수간모옥)
  add(new THREE.BoxGeometry(4.2, 2.0, 3), lambert(TOKENS.hanji), [-15, 1, -1]);
  add(new THREE.ConeGeometry(3.6, 1.8, 4), lambert('#c9a45c', { flatShading: true }), [-15, 2.9, -1], [0, Math.PI / 4, 0]);
  add(new THREE.PlaneGeometry(0.9, 1.4), lambert(TOKENS.meokSoft), [-14.2, 0.7, 0.52]);

  // 정자
  add(new THREE.BoxGeometry(4.2, 0.5, 4.2), lambert('#a9a59a'), [6, 0.25, -5.5]);
  const postGeo = own(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 6));
  const posts = new THREE.InstancedMesh(postGeo, lambert('#a8473a'), 4);
  const m4 = new THREE.Matrix4();
  [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach(([dx, dz], i) => { m4.makeTranslation(6 + dx, 1.7, -5.5 + dz); posts.setMatrixAt(i, m4); });
  group.add(posts);
  add(new THREE.ConeGeometry(3.6, 1.5, 4), lambert('#3f4a48', { flatShading: true }), [6, 3.6, -5.5], [0, Math.PI / 4, 0]);

  // 나무·꽃·돌(모양마다 한 번에 그린다)
  const rnd = seeded(15);
  const trees = [];
  for (let i = 0; i < 28; i++) {
    const x = -30 + rnd() * 62;
    const z = -30 + rnd() * 30;
    if (Math.abs(x - STREAM_X) < 2.5 || Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) < MOUNTAIN.r + 1) continue;
    if (Math.hypot(x + 15, z + 1) < 4 || Math.hypot(x - 6, z + 5.5) < 4) continue;
    trees.push([x, z, 0.8 + rnd() * 0.6]);
  }
  const trunkGeo = own(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 5));
  const crownGeo = own(new THREE.ConeGeometry(1.2, 3, 6));
  const trunks = new THREE.InstancedMesh(trunkGeo, lambert('#5b4636'), trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, lambert('#3e5b4a', { flatShading: true }), trees.length);
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  trees.forEach(([x, z, k], i) => {
    m4.compose(v.set(x, 0.7 * k, z), q, sc.set(k, k, k)); trunks.setMatrixAt(i, m4);
    m4.compose(v.set(x, 2.6 * k, z), q, sc.set(k, k, k)); crowns.setMatrixAt(i, m4);
  });
  group.add(trunks, crowns);

  const blossomSpots = [[-11, 0], [-17, 2], [-8, -3], [-3, 3], [3, -7], [9, -2], [-2, 9], [-7.5, 8], [13, 2], [18, -8], [19, -12.5], [17.5, -10]];
  const blossomGeo = own(new THREE.IcosahedronGeometry(0.65, 0));
  const pinks = new THREE.InstancedMesh(blossomGeo, lambert('#e7a3a8', { flatShading: true }), blossomSpots.length);
  blossomSpots.forEach(([x, z], i) => { const y = heightAt(x, z) + 1.2 + (i % 3) * 0.3; m4.compose(v.set(x, y, z), q, sc.set(1, 0.8, 1)); pinks.setMatrixAt(i, m4); });
  group.add(pinks);
  const stoneGeo = own(new THREE.DodecahedronGeometry(0.45, 0));
  const stoneSpots = [[STREAM_X - 1.6, 4], [STREAM_X + 1.5, 6], [STREAM_X + 1.6, -4], [STREAM_X - 1.5, -8], [-3.4, 7.2], [2, 9], [15, -2], [18.4, -9]];
  const stones = new THREE.InstancedMesh(stoneGeo, lambert(TOKENS.meokSoft, { flatShading: true }), stoneSpots.length);
  stoneSpots.forEach(([x, z], i) => { m4.compose(v.set(x, heightAt(x, z) + 0.2, z), q, sc.set(1, 0.7, 1)); stones.setMatrixAt(i, m4); });
  group.add(stones);

  // 달(청풍명월)
  const moon = add(new THREE.CircleGeometry(2.2, 20), basic(TOKENS.gold), [34, 22, -46]);

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
      pos.push(x, heightAt(x, z) + 0.06, z);
    }
  });
  const idx = [];
  for (let i = 0; i < samples.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const pathGeo = own(new THREE.BufferGeometry());
  pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pathGeo.setIndex(idx);
  pathGeo.computeVertexNormals();
  const pathMesh = new THREE.Mesh(pathGeo, lambert('#d8c79f', { side: THREE.DoubleSide }));
  group.add(pathMesh);
  const walkedGeo = own(pathGeo.clone());
  const walkedMesh = new THREE.Mesh(walkedGeo, lambert(TOKENS.nokcheong, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
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

  // 떨어지는 꽃잎(움직임 줄이기면 멈춘다)
  const PETALS = 36;
  const petalGeo = own(new THREE.PlaneGeometry(0.18, 0.12));
  const petals = new THREE.InstancedMesh(petalGeo, basic('#e7a3a8', { side: THREE.DoubleSide }), PETALS);
  const petalState = [...Array(PETALS)].map(() => ({ x: rnd() * 24 - 12, y: rnd() * 8, z: rnd() * 12 - 8, sp: 0.4 + rnd() * 0.5, ph: rnd() * 6 }));
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
    if (t < dur && !rm) { t = Math.min(dur, t + dt); s = from + (to - from) * (t / dur); } else s = to;
    setWalked(s);
    aimCamera(rm);
    student.update(dt, camera);
    // 꽃잎
    const time = performance.now() / 1000;
    petalState.forEach((p, i) => {
      if (!rm) { p.y -= p.sp * dt; if (p.y < 0) p.y = 8; }
      m4.makeRotationFromEuler(new THREE.Euler(time * p.sp + p.ph, p.ph, 0));
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
      posts.dispose(); trunks.dispose(); crowns.dispose(); pinks.dispose(); stones.dispose(); petals.dispose();
      if (art !== assets) art?.dispose?.();
      renderer?.dispose();
      canvas?.remove();
    },
  };
}
