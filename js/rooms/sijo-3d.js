// 작품 방 「십 년을 경영하야」 3D 장면. 방 안에서만 쓰는 작은 Three.js 장면이다(그림자·후처리 없음).
// - 초가삼간: 막돌 기단, 둥근 기둥, 흙벽과 칸막이, 장판, 볏짚 초가지붕(gfx 꾸러미, js/world/gfx/t37-scenery.js).
//   칸에 들인 물건은 작은 모양으로 보인다. 마당가에 소나무와 매화.
// - 처음에는 초가를 가까이 본다. pullBack()이면 카메라가 물러나며 수묵 산 병풍(먹으로 그린 산 판)이 솟아 초가를 둘러싸고,
//   시냇물이 마당을 휘감으며 달이 뜬다(강산).
// - 칸 단추(DOM)는 부르는 쪽이 만들고, 이 장면이 칸 자리를 화면에 비춰 단추 위치를 맞춘다.
// 그리기 호출: 풍경 역할 열 남짓 + 강·달·달무리·산 병풍 + 물건 여섯 = 스물다섯 이하.
import { TOKENS, mixHex } from '../world/palette.js';
import { createScenery, disposeGroupGeometry } from '../world/gfx/t37-scenery.js';

const ROOM_W = 2.3;                          // 칸 너비(1 = 1m)
const ROOM_X = [-ROOM_W, 0, ROOM_W];         // 칸 가운데
const HUT = { w: ROOM_W * 3, d: 2.8, base: 0.45, wall: 2.0 };
const ROOM_BOX = { y0: HUT.base, y1: HUT.base + HUT.wall, z: 0.3 };   // 칸 단추를 맞출 범위
const FOV = 38;
const ROOMS_H = HUT.base + HUT.wall + 0.25;      // 기단부터 칸 위까지(지붕은 위 글 밑으로 들어가도 된다)
const NEAR_TARGET = { x: 0, y: ROOMS_H / 2, z: 0 };
const FAR = { pos: [0, 11, 31], target: [0, 2.2, -3] };
const PULL_SEC = 2.4;
const MOUNTAINS = 11;

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

  // ── 땅과 초가(gfx 꾸러미) ──
  // 가까이 본 초가가 화면을 꽉 채우므로 흙벽·장판·기단은 무늬 없이 빛만 받게 그린다(무늬 읽기가 가장 비싸다). 지붕은 볏짚 결을 남긴다
  const sc = createScenery(THREE, { untextured: ['plaster', 'floor', 'stone'] });
  sc.materials.setDancheong(1);
  const kb = sc.kit.builder();
  sc.groundDisc(kb, { x: 0, z: -2, r: 46, color: mixHex(TOKENS.hanjiDeep, '#c9c3a2', 0.5), rings: 4 });
  sc.thatchedHut(kb, { x: 0, z: 0, bays: 3, bayW: ROOM_W, depth: HUT.d, wall: HUT.wall, base: HUT.base, open: true, roofColor: '#c8ab72' });
  // 마당가: 소나무 둘, 매화 하나, 장독 몇, 돌
  sc.kit.paperTree(kb, { x: -6.4, z: -1.8, h: 4.6, kind: 'pine', seed: 2, layers: 2 });
  sc.kit.paperTree(kb, { x: 6.6, z: -2.4, h: 4.2, kind: 'pine', seed: 5, layers: 1 });
  sc.kit.paperTree(kb, { x: -5.2, z: 2.2, h: 3.0, kind: 'blossom', seed: 7, layers: 1 });
  for (const [x, z, r] of [[5.2, -0.6, 0.32], [5.75, -0.9, 0.26], [5.5, -0.2, 0.22]]) {
    kb.add('stone', sc.kit.cylinder(r * 0.75, r * 0.7, r * 1.4, 10), { p: [x, r * 0.7, z], color: '#5a4a3e', ao: 0.3 });
    kb.add('stone', sc.kit.cylinder(r * 0.55, r * 0.9, r * 0.25, 10), { p: [x, r * 1.5, z], color: '#4e4036', ao: 0 });
  }
  sc.rock(kb, { x: -3.6, z: 2.6, s: 0.4, seed: 1, color: '#9f998d' });
  // 싸리 울타리: 마당 앞을 반달꼴로 두르고, 가운데는 사립문 자리로 비운다
  for (let i = 0; i <= 44; i++) {
    const a = Math.PI * (0.06 + 0.88 * (i / 44));
    const x = Math.cos(a) * 7.4;
    const z = Math.sin(a) * 5.2 + 0.4;
    if (Math.abs(x) < 0.9) continue;
    kb.box('wood', 0.07, 0.95 + (i % 3) * 0.1, 0.07, { p: [x, 0.5, z], r: [0, 0, i % 2 ? 0.05 : -0.05], color: '#7a6a56', ao: 0 });
  }
  kb.add('plain', new THREE.PlaneGeometry(1.4, 7).rotateX(-Math.PI / 2).toNonIndexed(), { p: [0, 0.01, 6.2], color: '#e2d6b6', ao: 0 });
  const hutGroup = sc.build(kb, 'sijo-room-hut');
  scene.add(hutGroup);
  const M = new THREE.Matrix4();

  // ── 강산(처음에는 숨어 있다) ──
  // 시냇물: 마당 앞을 휘감아 흐르는 띠(무늬가 흘러간다)
  const waterTex = sc.waterTexture();
  const riverMat = new THREE.MeshBasicMaterial({ map: waterTex, color: 0xffffff });
  mats.push(riverMat);
  const river = new THREE.Mesh(geo(new THREE.RingGeometry(9, 10.8, 64, 1, Math.PI * 1.08, Math.PI * 0.84)), riverMat);
  {
    const rp = river.geometry.attributes.position;
    const ru = river.geometry.attributes.uv;
    for (let i = 0; i < rp.count; i++) {
      const r = Math.hypot(rp.getX(i), rp.getY(i));
      ru.setXY(i, (r - 10) / 1.8, (Math.atan2(rp.getY(i), rp.getX(i)) * r) / 3);
    }
  }
  river.name = 'sijo-room-river';
  // 징검다리: 시내를 건너는 길목의 돌(시내와 함께 나타난다)
  const steppingMat = new THREE.MeshLambertMaterial({ color: '#a29c90' });
  mats.push(steppingMat);
  const stepping = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 7)), steppingMat, 4);
  [[-0.25, 9.2], [0.3, 9.85], [-0.2, 10.5], [0.25, 11.15]].forEach(([x, z], i) => stepping.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.07, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 0.8))));
  stepping.visible = false;
  scene.add(stepping);
  river.rotation.x = -Math.PI / 2;
  river.position.y = 0.02;
  river.visible = false;
  scene.add(river);
  const moon = mesh(new THREE.CircleGeometry(1.3, 32), C.moon, 'sijo-room-moon');
  moon.material = new THREE.MeshBasicMaterial({ color: C.moon });
  mats.push(moon.material);
  moon.position.set(8, 13.2, -30);
  moon.visible = false;
  const haloMat = new THREE.MeshBasicMaterial({ color: '#fbf3dc', transparent: true, opacity: 0.5, depthWrite: false });
  mats.push(haloMat);
  const halo = new THREE.Mesh(geo(new THREE.CircleGeometry(2.6, 32)), haloMat);
  halo.position.z = -0.1;
  moon.add(halo);
  // 강산: 먹으로 그린 산 판(수묵 산 무늬의 가운데 줄)을 병풍처럼 둘러 세운다. 판마다 먹 짙기가 다르다(가까울수록 짙게)
  const mountainGeo = geo(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));
  {
    const uv = mountainGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + 0.1 * (i % 2), 1 / 3 + uv.getY(i) * (1 / 3 - 0.004));
  }
  const mountainMat = new THREE.MeshBasicMaterial({ map: sc.textures.get('mountains'), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mats.push(mountainMat);
  const mountains = new THREE.InstancedMesh(mountainGeo, mountainMat, MOUNTAINS);
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
    return { x: Math.sin(a) * r, z: -Math.cos(a) * r, h: h * 1.6, w: 8.5 + (i % 3) * 1.2, rot: Math.atan2(-Math.sin(a) * r, Math.cos(a) * r) + (i % 2 ? 0.08 : -0.08) };
  });
  const tone = new THREE.Color();
  peaks.forEach((p, i) => mountains.setColorAt(i, tone.set(i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#d9d6d0' : '#b8b4ac')));
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();
  const P = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  function setRise(k) {
    mountains.userData.rise = k;
    const v = Math.max(0.001, k);
    peaks.forEach((p, i) => {
      Q.setFromAxisAngle(UP, p.rot);
      S.set(p.w, p.h * v, 1);
      P.set(p.x, -0.6, p.z);
      mountains.setMatrixAt(i, M.compose(P, Q, S));
    });
    mountains.instanceMatrix.needsUpdate = true;
    mountains.visible = k > 0;
    river.visible = k > 0;
    stepping.visible = k > 0;
    moon.visible = k > 0;
    river.scale.setScalar(0.6 + 0.4 * k);
    mountainMat.opacity = Math.min(1, k * 1.6);
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
  // 그릴 것이 바뀐 때만 그린다(가만히 있는 장면을 매 프레임 다시 그리지 않는다: 느린 기기와 SwiftShader에서 화면 반응을 지킨다)
  let dirty = true;
  function setItems(hut) {
    dirty = true;
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
    dirty = true;
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
    state.prev = state.last || now;
    state.last = now;
    if (state.pulling && !state.paused && !reduceMotion()) waterTex.offset.y -= dt * 0.15;
    if (state.pulling && !state.paused) {
      // 물러나기는 실제 시간으로 잰다(프레임이 느려도 PULL_SEC 안에 끝난다. 프레임 간격은 0.5초까지만 센다)
      state.pull = Math.min(1, state.pull + Math.min(0.5, (now - (state.prev ?? now)) / 1000) / PULL_SEC);
      applyCamera();
      if (state.pull >= 1) settle();
    }
    placeSlots();
    if (!dirty) return;
    dirty = false;
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
      disposeGroupGeometry(hutGroup);
      sc.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
