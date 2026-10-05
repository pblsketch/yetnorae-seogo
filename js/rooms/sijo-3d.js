// 작품 방 「십 년을 경영하야」 3D 장면. 방 안에서만 쓰는 작은 Three.js 장면이다(그림자·후처리 없음).
// - 초가 세 칸(앞이 트인 방 셋)과 마당. 칸에 들인 물건은 작은 저폴리 모양으로 보인다.
// - 처음에는 초가를 가까이 본다. pullBack()이면 카메라가 물러나며 산들이 솟아 병풍처럼 초가를 둘러싼다.
// - 칸 단추(DOM)는 부르는 쪽이 만들고, 이 장면이 칸 자리를 화면에 비춰 단추 위치를 맞춘다.
// 그리기 호출: 땅·기단·뒷벽·칸막이·기둥·지붕·강·달·산 아홉 + 물건 여섯 = 열다섯 이하.
import { TOKENS, mixHex } from '../world/palette.js';

const ROOM_W = 2.3;                          // 칸 너비(1 = 1m)
const ROOM_X = [-ROOM_W, 0, ROOM_W];         // 칸 가운데
const HUT = { w: ROOM_W * 3, d: 2.8, base: 0.45, wall: 2.0 };
const ROOM_BOX = { y0: HUT.base, y1: HUT.base + HUT.wall, z: 0.3 };   // 칸 단추를 맞출 범위
const FOV = 38;
const ROOMS_H = HUT.base + HUT.wall + 0.25;      // 기단부터 칸 위까지(지붕은 위 글 밑으로 들어가도 된다)
const NEAR_TARGET = { x: 0, y: ROOMS_H / 2, z: 0 };
const FAR = { pos: [0, 11, 31], target: [0, 2.2, -3] };
const PULL_SEC = 2.4;
const MOUNTAINS = 16;

const C = {
  ground: TOKENS.hanji,
  base: mixHex(TOKENS.hanjiDeep, TOKENS.meokSoft, 0.4),
  wall: mixHex(TOKENS.hanji, TOKENS.hanjiDeep, 0.6),
  wood: mixHex(TOKENS.meokSoft, TOKENS.gold, 0.3),
  thatch: mixHex(TOKENS.hanjiDeep, TOKENS.gold, 0.45),
  mountain: mixHex(TOKENS.meokFog, TOKENS.hanjiDeep, 0.3),
  river: mixHex(TOKENS.hanji, TOKENS.meokFog, 0.35),
  moon: mixHex(TOKENS.hanji, TOKENS.gold, 0.25),
};
// 물건 모양 색(상호작용한 결과라 단청색을 쓴다)
const ITEM_LOOK = {
  na: { color: TOKENS.meok },
  dal: { color: mixHex(TOKENS.hanji, TOKENS.gold, 0.35) },
  cheongpung: { color: TOKENS.nokcheong },
  gold: { color: TOKENS.gold },
  robe: { color: TOKENS.juhong },
  guest: { color: TOKENS.meokSoft },
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ctx: { THREE, container, reduceMotion() }
export function create3D({ THREE, container, reduceMotion }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'sj-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(TOKENS.hanji);
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-6, 12, 9);
  scene.add(sun);

  const geos = [];
  const mats = [];
  const mat = (color) => { const m = new THREE.MeshLambertMaterial({ color }); mats.push(m); return m; };
  const geo = (g) => { geos.push(g); return g; };
  function mesh(g, color, name) {
    const m = new THREE.Mesh(geo(g), mat(color));
    m.name = name;
    scene.add(m);
    return m;
  }

  // ── 땅과 초가 ──
  const ground = mesh(new THREE.CircleGeometry(60, 32), C.ground, 'sijo-room-ground');
  ground.rotation.x = -Math.PI / 2;
  const base = mesh(new THREE.BoxGeometry(HUT.w + 0.8, HUT.base, HUT.d + 0.6), C.base, 'sijo-room-base');
  base.position.set(0, HUT.base / 2, 0);
  const back = mesh(new THREE.BoxGeometry(HUT.w, HUT.wall, 0.14), C.wall, 'sijo-room-back');
  back.position.set(0, HUT.base + HUT.wall / 2, -HUT.d / 2 + 0.1);

  const sideXs = [-1.5, -0.5, 0.5, 1.5].map((k) => k * ROOM_W);
  const walls = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(0.14, HUT.wall, HUT.d - 0.2)), mat(C.wall), sideXs.length);
  walls.name = 'sijo-room-walls';
  const pillars = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.12, 0.14, HUT.wall + 0.2, 8)), mat(C.wood), sideXs.length);
  pillars.name = 'sijo-room-pillars';
  const M = new THREE.Matrix4();
  sideXs.forEach((x, i) => {
    walls.setMatrixAt(i, M.makeTranslation(x, HUT.base + HUT.wall / 2, 0));
    pillars.setMatrixAt(i, M.makeTranslation(x, HUT.base + HUT.wall / 2 + 0.1, HUT.d / 2 - 0.1));
  });
  walls.frustumCulled = false;
  pillars.frustumCulled = false;
  scene.add(walls, pillars);

  // 초가지붕: 반구를 눌러 둥근 볏짚 지붕 모양으로
  const roof = mesh(new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.thatch, 'sijo-room-roof');
  roof.scale.set(HUT.w / 2 + 0.9, 1.5, HUT.d / 2 + 0.8);
  roof.position.set(0, HUT.base + HUT.wall - 0.05, 0);

  // ── 강산(처음에는 숨어 있다) ──
  const river = mesh(new THREE.RingGeometry(10, 11.6, 48, 1, Math.PI * 0.1, Math.PI * 0.8), C.river, 'sijo-room-river');
  river.rotation.x = -Math.PI / 2;
  river.position.y = 0.02;
  river.visible = false;
  const moon = mesh(new THREE.CircleGeometry(1.3, 24), C.moon, 'sijo-room-moon');
  moon.position.set(9, 9.5, -26);
  moon.visible = false;
  const mountains = new THREE.InstancedMesh(geo(new THREE.ConeGeometry(1, 1, 7, 1)), mat(C.mountain), MOUNTAINS);
  mountains.geometry.computeVertexNormals();
  mountains.name = 'sijo-room-mountains';
  mountains.userData.rise = 0;
  mountains.visible = false;
  mountains.frustumCulled = false;   // 솟는 동안 경계 구가 바뀌므로 잘라 내지 않는다
  scene.add(mountains);
  // 뒤와 양옆을 두르는 병풍 모양 자리: 가운데(뒤)는 높고 멀게, 양 끝은 낮고 가깝게
  const peaks = Array.from({ length: MOUNTAINS }, (_, i) => {
    const t = i / (MOUNTAINS - 1);                 // 0~1
    const a = (-100 + 200 * t) * (Math.PI / 180);  // 0이 바로 뒤
    const r = 19 + 2 * Math.cos(a) + (i % 2) * 1.5;
    const h = 5 + 2 * Math.cos(a) + (i % 3) * 0.9;
    return { x: Math.sin(a) * r, z: -Math.cos(a) * r, h, w: 4.4 + (i % 3) * 0.7, rot: i * 0.7 };
  });
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();
  const P = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  function setRise(k) {
    mountains.userData.rise = k;
    const v = Math.max(0.001, k);
    peaks.forEach((p, i) => {
      Q.setFromAxisAngle(UP, p.rot);
      S.set(p.w, p.h * v, p.w);
      P.set(p.x, (p.h * v) / 2, p.z);
      mountains.setMatrixAt(i, M.compose(P, Q, S));
    });
    mountains.instanceMatrix.needsUpdate = true;
    mountains.visible = k > 0;
    river.visible = k > 0;
    moon.visible = k > 0;
    river.scale.setScalar(0.6 + 0.4 * k);
  }
  setRise(0);

  // ── 물건 모양 ──
  const tokenGeo = {
    na: new THREE.CapsuleGeometry(0.22, 0.6, 3, 8),
    dal: new THREE.CircleGeometry(0.42, 20),
    cheongpung: new THREE.TorusGeometry(0.34, 0.08, 6, 18),
    gold: new THREE.BoxGeometry(0.5, 0.32, 0.36),
    robe: new THREE.ConeGeometry(0.4, 0.95, 6),
    guest: new THREE.CapsuleGeometry(0.2, 0.55, 3, 8),
  };
  const tokens = {};
  for (const [id, g] of Object.entries(tokenGeo)) {
    const m = mesh(g, ITEM_LOOK[id].color, 'sijo-room-item-' + id);
    m.visible = false;
    tokens[id] = m;
  }
  const TOKEN_Y = { na: 0.52, dal: 1.25, cheongpung: 1.15, gold: 0.16, robe: 0.48, guest: 0.5 };

  // 칸·집 밖 배치를 모양으로 보인다
  function setItems(hut) {
    for (const [id, m] of Object.entries(tokens)) {
      const room = hut.rooms.indexOf(id);
      const out = hut.outside.indexOf(id);
      if (room >= 0) {
        m.position.set(ROOM_X[room], HUT.base + TOKEN_Y[id], -0.2);
        m.visible = true;
      } else if (out >= 0) {
        const k = hut.outside.filter((x) => x !== 'gangsan').indexOf(id);
        m.position.set(HUT.w / 2 + 1.4 + (k % 2) * 1.1, TOKEN_Y[id], 1.6 + Math.floor(k / 2) * 1.1);
        m.visible = true;
      } else m.visible = false;
    }
  }

  // ── 카메라 ──
  const state = {
    width: 1, height: 1,
    band: null,                 // { top, bottom, right } — 칸이 보여야 할 띠(컨테이너 기준 px)
    near: { pos: new THREE.Vector3(0, 3, 9), target: new THREE.Vector3(NEAR_TARGET.x, NEAR_TARGET.y, NEAR_TARGET.z), shift: 0 },
    pull: 0,                    // 0 가까이 ~ 1 물러남
    pulling: false,
    paused: false,
    settled: false,
    onSettled: null,
    raf: 0,
    last: 0,
    disposed: false,
  };
  const target = new THREE.Vector3();
  const farPos = new THREE.Vector3(...FAR.pos);
  const farTarget = new THREE.Vector3(...FAR.target);

  // 세 칸(기단부터 칸 위까지)이 띠 안에 들어오는 거리와 화면 밀기
  function computeNear() {
    const { width: W, height: H } = state;
    const band = state.band ?? { top: 0, bottom: H, right: W };
    const bandH = Math.max(60, band.bottom - band.top);
    const tan = Math.tan((FOV * Math.PI) / 360);
    const dH = (ROOMS_H * H) / (2 * tan * bandH * 0.88);
    const halfW = Math.max(80, Math.min(W / 2, band.right - W / 2) - 16);
    const dW = ((HUT.w / 2 + 0.8) * H) / (2 * tan * halfW);
    const d = Math.min(24, Math.max(6, dH, dW));
    const pitch = 0.14;                                  // 조금 내려다본다
    state.near.pos.set(NEAR_TARGET.x, NEAR_TARGET.y + d * Math.sin(pitch), NEAR_TARGET.z + d * Math.cos(pitch));
    state.near.shift = (band.top + band.bottom) / 2 - H / 2;    // 세 칸 가운데를 띠 가운데로
  }

  function applyCamera() {
    const k = ease(state.pull);
    camera.position.lerpVectors(state.near.pos, farPos, k);
    target.lerpVectors(state.near.target, farTarget, k);
    camera.lookAt(target);
    const shift = state.near.shift * (1 - k);
    if (Math.abs(shift) > 0.5) camera.setViewOffset(state.width, state.height, 0, -shift, state.width, state.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    setRise(k);
  }

  function resize() {
    const r = container.getBoundingClientRect();
    state.width = Math.max(1, Math.round(r.width));
    state.height = Math.max(1, Math.round(r.height));
    renderer.setSize(state.width, state.height, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    camera.aspect = state.width / state.height;
    computeNear();
    applyCamera();
  }

  // ── 칸 단추 맞추기 ──
  let slotEls = [];
  const corner = new THREE.Vector3();
  function placeSlots() {
    if (!slotEls.length || state.pull > 0) return;
    camera.updateMatrixWorld();
    slotEls.forEach((el, i) => {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const dx of [-ROOM_W / 2 + 0.15, ROOM_W / 2 - 0.15]) {
        for (const y of [ROOM_BOX.y0, ROOM_BOX.y1]) {
          corner.set(ROOM_X[i] + dx, y, ROOM_BOX.z).project(camera);
          const sx = ((corner.x + 1) / 2) * state.width;
          const sy = ((1 - corner.y) / 2) * state.height;
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
      }
      const w = Math.max(48, x1 - x0);
      const h = Math.max(48, y1 - y0);
      el.style.left = Math.round((x0 + x1) / 2 - w / 2) + 'px';
      el.style.top = Math.round((y0 + y1) / 2 - h / 2) + 'px';
      el.style.width = Math.round(w) + 'px';
      el.style.height = Math.round(h) + 'px';
    });
  }

  function frame(now) {
    if (state.disposed) return;
    state.raf = requestAnimationFrame(frame);
    const dt = state.last ? Math.min(0.1, (now - state.last) / 1000) : 0;
    state.last = now;
    if (state.pulling && !state.paused) {
      state.pull = Math.min(1, state.pull + dt / PULL_SEC);
      applyCamera();
      if (state.pull >= 1) settle();
    }
    placeSlots();
    renderer.render(scene, camera);
  }

  function settle() {
    state.pulling = false;
    state.pull = 1;
    applyCamera();
    if (!state.settled) {
      state.settled = true;
      const fn = state.onSettled;
      state.onSettled = null;
      fn?.();
    }
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();
  state.raf = requestAnimationFrame(frame);

  return {
    kind: '3d',
    // 칸 단추 셋(DOM)을 받아 칸 자리에 맞춘다. 단추는 이 장면 위 겹 층에 부르는 쪽이 붙인다.
    mountSlots(els) { slotEls = els; placeSlots(); },
    setBand(band) { state.band = band; computeNear(); applyCamera(); placeSlots(); },
    setItems,
    // 물러나기. 움직임 줄이기면 곧바로. 끝나면 onSettled.
    pullBack(onSettled) {
      if (state.settled || state.pulling) return;
      state.onSettled = onSettled;
      if (reduceMotion()) settle();
      else state.pulling = true;
    },
    setPaused(v) { state.paused = !!v; },
    get settled() { return state.settled; },
    dispose() {
      state.disposed = true;
      cancelAnimationFrame(state.raf);
      ro.disconnect();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
