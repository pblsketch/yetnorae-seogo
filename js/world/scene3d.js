// 3D 바탕(spec 3.1·14): 장면과 그리기, 자동으로 따라가는 카메라와 제한 각도 회전, 학생 3D 인물,
// 입구·회랑·관 문, 관 모형을 끼우는 자리, 먹빛→단청 색.
// 회랑 건축은 gfx 꾸러미(js/world/gfx/)로 corridor-art.js가 짓는다: 재질 역할마다 합친 기하 하나라 그리기 호출이 적다.
// 관 문은 InstancedMesh 하나로 그린다. 실시간 그림자와 후처리는 쓰지 않는다(접지는 그림자 번짐 카드).
import * as THREE from 'three';
import { WINGS, wingById } from '../data/wings.js';
import { TOKENS, dancheongColor, getDancheong, meanDancheong, mixHex } from './palette.js';
import { paperDollCanvas } from './sprites.js';
import { TUNING } from './tuning.js';
import { createTextures } from './gfx/textures.js';
import { createKit } from './gfx/kit.js';
import { createCharacter, FIGURE_HEIGHT } from './gfx/figures.js';
import { applyRenderSettings, createLightRig, setFog } from './gfx/lighting.js';
import { buildCorridorGallery, buildCorridorGrounds } from './corridor-art.js';
import { addRigLight, createInkScreens, createRigLitMaterials, mipNearest, softwareRendering } from './gfx/t39-perf.js';
import { onQualityChange, qualityInfo } from './quality.js';

// 배치(1 = 1m). 회랑은 x축을 따라 뻗고, 관 자리는 회랑 북쪽(-z)에 순서대로 놓인다.
const SLOT_GAP = 16;
const SLOT_Z = -12;
const WING_HALF = 6.5;
const DOOR_HALF = 1.3;
const WALL_Z = -2.6;
const CORRIDOR = { x0: -10, x1: (WINGS.length - 1) * SLOT_GAP + 8, z0: -2.5, z1: 2.5 };
const EDGE = 0.45;   // 벽에서 떨어져 걷는 거리
const UP = new THREE.Vector3(0, 1, 0);

const slotX = (i) => i * SLOT_GAP;
const wingIndex = (id) => WINGS.findIndex((w) => w.id === id);

const INK_BG = mixHex(TOKENS.hanji, TOKENS.meokFog, 0.5);

function instancedBoxes(material, list) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  list.forEach((b, i) => {
    m.compose(new THREE.Vector3(...b.p), q, new THREE.Vector3(...b.s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(b.c));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// 관 문 하나마다 상자 넷: 기둥 둘(주홍), 인방(녹청), 문짝(잠기면 먹)
const DOOR_PARTS = 4;
function doorBox(i, part, state, level) {
  const x = slotX(i);
  const open = state !== 'locked';
  switch (part) {
    case 0: return { p: [x - DOOR_HALF, 1.5, WALL_Z], s: [0.3, 3, 0.42], c: dancheongColor(TOKENS.juhong, level) };
    case 1: return { p: [x + DOOR_HALF, 1.5, WALL_Z], s: [0.3, 3, 0.42], c: dancheongColor(TOKENS.juhong, level) };
    case 2: return { p: [x, 2.95, WALL_Z], s: [DOOR_HALF * 2 + 0.4, 0.34, 0.5], c: dancheongColor(TOKENS.nokcheong, level) };
    default: return open
      ? { p: [x - DOOR_HALF + 0.12, 1.3, WALL_Z - 0.9], s: [0.08, 2.6, 1.6], c: TOKENS.meokSoft }   // 열린 문짝은 옆으로 젖힌다
      : { p: [x, 1.3, WALL_Z], s: [DOOR_HALF * 2 - 0.3, 2.6, 0.12], c: TOKENS.meokSoft };
  }
}

// 관 이름 현판: 글자 그림 한 장(아틀라스)에 사각형 여섯을 붙여 그리기 호출 하나로 그린다.
function signBoards() {
  const cellW = 512;
  const cellH = 128;
  const canvas = document.createElement('canvas');
  canvas.width = cellW;
  canvas.height = cellH * WINGS.length;
  const g = canvas.getContext('2d');
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  WINGS.forEach((w, i) => {
    const y = i * cellH;
    // 현판: 먹빛 테 안에 한지 바탕, 안쪽에 가는 금빛 줄
    g.fillStyle = TOKENS.meok;
    g.fillRect(0, y, cellW, cellH);
    g.fillStyle = TOKENS.hanji;
    g.fillRect(8, y + 8, cellW - 16, cellH - 16);
    g.strokeStyle = TOKENS.gold;
    g.lineWidth = 2;
    g.strokeRect(16, y + 16, cellW - 32, cellH - 32);
    g.fillStyle = TOKENS.meok;
    g.font = `bold 64px ${family}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(w.name, cellW / 2, y + cellH / 2 + 4);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const pos = [];
  const uv = [];
  const idx = [];
  const W = 2.2;
  const H = W * cellH / cellW;
  WINGS.forEach((_, i) => {
    const x = slotX(i);
    const y = 3.36;
    const z = WALL_Z + 0.29;
    const v0 = 1 - (i + 1) / WINGS.length;
    const v1 = 1 - i / WINGS.length;
    const b = pos.length / 3;
    pos.push(x - W / 2, y - H / 2, z, x + W / 2, y - H / 2, z, x + W / 2, y + H / 2, z, x - W / 2, y + H / 2, z);
    uv.push(0, v0, 1, v0, 1, v1, 0, v1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  mesh.name = 'corridor-signs';
  return mesh;
}

export function createScene3D({ view, assets, appearance = 'a', getWingModule, reduceMotion, onArrive }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  // 소프트웨어 그리기(GPU를 못 쓰는 기기)에서는 MSAA가 프레임 시간의 약 3분의 1이라 끈다(gfx/t39-perf.js)
  const software = softwareRendering();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !software, powerPreference: 'low-power' });
  // 픽셀 비율 = min(기기 비율, 1.5) × 화질 단계 몫(quality.js)
  const basePixelRatio = Math.min(window.devicePixelRatio || 1, TUNING.pixelRatioMax);
  let quality = qualityInfo();
  renderer.setPixelRatio(basePixelRatio * quality.pixelScale);
  applyRenderSettings(renderer, THREE);
  view.prepend(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK_BG);
  scene.fog = new THREE.Fog(INK_BG, 28, 75);
  const lights = createLightRig(THREE, scene);

  // 회랑 건축(gfx 꾸러미). grounds(마당·나무·병풍·먼 산)는 언제나 보이고 바로 짓는다.
  // gallery(회랑 벽·처마·서가)는 회랑에서만 보이고 무거우므로 처음 회랑을 그릴 때 짓는다(관에서 시작하면 첫 화면이 늦지 않게).
  // 회랑·바깥은 꼭짓점 빛 재질(빛 묶음과 같은 램버트 빛을 꼭짓점에서 계산)과 밉맵 한 장 안 거르기로 그린다(gfx/t39-perf.js)
  const gfxTextures = createTextures(THREE);
  const gfxTex = mipNearest(THREE, gfxTextures);
  const gfxMaterials = createRigLitMaterials(THREE, gfxTex);
  const inkScreens = createInkScreens(THREE, gfxMaterials, gfxTex);
  const kit = createKit(THREE, { materials: gfxMaterials });
  const artLayout = { corridor: CORRIDOR, wallZ: WALL_Z, slotXs: WINGS.map((_, i) => slotX(i)), doorHalf: DOOR_HALF, slotZ: SLOT_Z, wingHalf: WING_HALF };
  const art = { grounds: null, gallery: null, groundsAdded: false };
  // 바깥(grounds)은 두 번째 프레임에 짓고, 셰이더를 먼저 따로 엮은 뒤(compileAsync) 장면에 붙인다.
  // 첫 화면(관 들어가기 글 등)이 늦어지지 않게 한다.
  function addGroundsLater() {
    if (art.grounds) return;
    art.grounds = buildCorridorGrounds(THREE, kit, artLayout, { screens: inkScreens });
    const attach = () => {
      if (disposed || art.groundsAdded) return;
      art.groundsAdded = true;
      scene.add(art.grounds);
      applyDecor();
      if (room) { art.grounds.visible = false; room.hidden.push(art.grounds); }
    };
    Promise.resolve().then(() => renderer.compileAsync(art.grounds, camera, scene)).then(attach, attach);
  }
  let disposed = false;
  function ensureGallery() {
    if (art.gallery) return;
    art.gallery = buildCorridorGallery(THREE, kit, artLayout);
    scene.add(art.gallery);
  }

  const doorState = new Map(WINGS.map((w) => [w.id, w.id === 'entrance' ? 'open' : 'locked']));
  const doorList = [];
  WINGS.forEach((w, i) => { for (let p = 0; p < DOOR_PARTS; p++) doorList.push(doorBox(i, p, doorState.get(w.id), getDancheong(w.id))); });
  const doorMaterial = addRigLight(new THREE.MeshBasicMaterial({ map: gfxTextures.get('wood') }), gfxMaterials.light);
  const doors = instancedBoxes(doorMaterial, doorList);
  scene.add(doors);
  const signs = signBoards();
  scene.add(signs);

  // 학생: 절차 3D 인물(gfx/figures-3d.js, 생김새 a·b) + 발밑 그림자. 조립법이 없는 생김새면 종이 카드로 돌아간다.
  const look = 'student-' + (appearance === 'b' ? 'b' : 'a');
  const doll = createCharacter(THREE, {
    kind: look,
    url: assets.image?.('sprite/' + look) ?? null,
    canvas: assets.image?.('sprite/' + look) ? null : paperDollCanvas(look),
    height: FIGURE_HEIGHT.student, reduceMotion, name: 'student',
  });
  scene.add(doll.root);
  let dollFlip = false;

  // 도착 표시(바닥의 녹청 고리, 누를 수 있는 것을 알리는 색)
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.5, 32),
    new THREE.MeshBasicMaterial({ color: TOKENS.nokcheong, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.03;
  marker.visible = false;
  scene.add(marker);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const camLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(UP, 0);

  let place = 'corridor';
  let wingRoot = null;
  let wingHandle = null;
  let yaw = 0;
  let target = null;
  let freeMoving = false;
  let frames = 0;
  let aspect = 1;
  let shakeLeft = 0;
  let measureFocusOn = false;
  // 작품 방 무대(README '연결 결정(F3)'). 열려 있으면 { root, el, hidden, fog, background, cam }
  let room = null;

  const START = new THREE.Vector3(CORRIDOR.x0 + 5, 0, 0.6);
  const player = START.clone();
  doll.root.position.copy(player);

  function bounds() {
    // 북쪽 벽에서는 1m 떨어진다(인물 윗부분이 벽 처마에 가려지지 않게).
    if (place === 'corridor') return { x0: CORRIDOR.x0 + 1, x1: CORRIDOR.x1 - EDGE, z0: CORRIDOR.z0 + 1, z1: CORRIDOR.z1 - EDGE };
    const x = slotX(wingIndex(place));
    return { x0: x - WING_HALF + EDGE, x1: x + WING_HALF - EDGE, z0: SLOT_Z - WING_HALF + EDGE, z1: SLOT_Z + WING_HALF - EDGE };
  }

  function clamp(v) {
    const b = bounds();
    v.x = Math.min(b.x1, Math.max(b.x0, v.x));
    v.z = Math.min(b.z1, Math.max(b.z0, v.z));
    v.y = 0;
    return v;
  }

  // 관 모형 자리를 세계 좌표 평범한 객체로
  function worldAnchors() {
    const a = wingHandle?.anchors;
    if (!a || !wingRoot) return null;
    const out = {};
    const conv = (v) => { const w = wingRoot.localToWorld(new THREE.Vector3(v.x, v.y ?? 0, v.z)); return { x: w.x, y: w.y, z: w.z }; };
    for (const [k, v] of Object.entries(a)) {
      if (k === 'camera' || !v) continue;
      if (Array.isArray(v)) out[k] = v.filter((p) => p && typeof p.x === 'number').map(conv);
      else if (typeof v.x === 'number' && typeof v.z === 'number') out[k] = conv(v);
    }
    return out;
  }

  function anchorNear(pos) {
    if (place === 'corridor') {
      const i = WINGS.findIndex((_, k) => Math.abs(pos.x - slotX(k)) < DOOR_HALF + 0.3);
      if (i >= 0 && pos.z < CORRIDOR.z0 + 1.3) return { key: 'door', wing: WINGS[i].id };
      return null;
    }
    const a = worldAnchors();
    if (!a) return null;
    let best = null;
    let bestD = TUNING.arriveAnchorRadius;
    for (const [key, v] of Object.entries(a)) {
      const list = Array.isArray(v) ? v : [v];
      list.forEach((p, index) => {
        const d = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (d < bestD) { bestD = d; best = Array.isArray(v) ? { key, index } : { key }; }
      });
    }
    return best;
  }

  function arrive() {
    marker.visible = false;
    target = null;
    onArrive?.({ position: { x: player.x, z: player.z }, anchor: anchorNear(player), place });
  }

  // 반반 틀의 재기 초점: 관 모형의 measureFocus({ target, position? }, root 기준)를 바라본다.
  // position이 없으면 target 앞 위에서(TUNING.measureOffset) 내려다본다. 끌어 돌린 각도는 쓰지 않는다.
  function measureView(outPos, outLook) {
    const f = measureFocusOn && place !== 'corridor' && wingRoot ? wingHandle?.measureFocus : null;
    if (!f?.target) return false;
    outLook.copy(wingRoot.localToWorld(new THREE.Vector3().copy(f.target)));
    if (f.position) outPos.copy(wingRoot.localToWorld(new THREE.Vector3().copy(f.position)));
    else outPos.copy(outLook).add(new THREE.Vector3(...TUNING.measureOffset));
    return true;
  }

  function desired(outPos, outLook) {
    if (measureView(outPos, outLook)) return;
    const head = new THREE.Vector3(player.x, 1, player.z);
    let offset;
    const cam = wingHandle?.anchors?.camera;
    if (place !== 'corridor' && cam?.position && cam?.target && wingRoot) {
      const t = wingRoot.localToWorld(new THREE.Vector3().copy(cam.target));
      offset = new THREE.Vector3().copy(cam.position).sub(cam.target);
      outLook.copy(t).lerp(head, 0.35);
    } else {
      offset = place === 'corridor' ? new THREE.Vector3(0, 6, 9.5) : new THREE.Vector3(0, 9, 13);
      outLook.copy(head);
    }
    if (aspect < 1.4) offset.multiplyScalar(1.4 / aspect);   // 좁은 화면(반반 틀)에서는 조금 물러선다
    offset.applyAxisAngle(UP, yaw);
    outPos.copy(outLook).add(offset);
  }

  function snapCamera() {
    desired(wantPos, wantLook);
    camera.position.copy(wantPos);
    camLook.copy(wantLook);
    camera.lookAt(camLook);
  }

  // 화질 단계: 픽셀 비율과 꾸밈 겹(관 사이 종이 나무·먼 수묵 산, corridor-art.js의 'corridor-decor')
  function applyDecor() {
    const decor = art.grounds?.getObjectByName('corridor-decor');
    if (decor) decor.visible = quality.decor;
  }
  const offQuality = onQualityChange((q) => {
    quality = q;
    renderer.setPixelRatio(basePixelRatio * q.pixelScale);
    applyDecor();
    resize();
    if (room) fitRoomView();
  });

  function resize() {
    const w = Math.max(1, view.clientWidth);
    const h = Math.max(1, view.clientHeight);
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(() => { resize(); render(); });
  ro.observe(view);
  resize();
  snapCamera();

  function render() {
    // 첫 두 프레임은 건너뛴다: 세션이 곧바로 관으로 들어가면 회랑 건축을 짓지 않아도 된다
    if (!room && place === 'corridor' && frames >= 2) ensureGallery();
    if (room) fitRoomView();
    renderer.render(scene, camera);
  }

  // ───────── 작품 방 무대 ─────────
  // 방이 열린 동안 세계의 다른 것(회랑·관 모형·학생·빛)은 모두 숨기고, 원점에 빈 무대(root) 하나만 둔다.
  // 그림은 방 칸(el)의 자리·크기에만 그리고, 카메라 비율도 그 칸에 맞춘다. 카메라는 방이 움직이고 세계는 손대지 않는다.
  function fitRoomView() {
    const vr = view.getBoundingClientRect();
    const r = room.el?.isConnected ? room.el.getBoundingClientRect() : vr;
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    const x = r.left - vr.left;
    const y = vr.height - (r.top - vr.top) - h;   // 그리기 판의 세로는 아래에서부터
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.setScissorTest(true);
    if (Math.abs(camera.aspect - w / h) > 1e-6) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function beginRoom(el) {
    if (room) endRoom();
    const hidden = scene.children.filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    const stage = new THREE.Group();
    stage.name = 'room-stage';
    scene.add(stage);
    room = {
      root: stage,
      el,
      hidden,
      fog: scene.fog,
      background: scene.background.getHex(),
      toneMapping: renderer.toneMapping,
      cam: {
        position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(),
        fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom,
      },
    };
    scene.fog = null;
    scene.background.set(TOKENS.hanji);
    // 작품 방은 톤 매핑 없이 만든 그림(방 그림 판)을 그대로 보인다. 방을 다듬을 때 gfx/lighting.js로 옮길 수 있다.
    renderer.toneMapping = THREE.NoToneMapping;
    target = null;
    marker.visible = false;
    freeMoving = false;
    fitRoomView();
    return { THREE, root: stage, camera };
  }

  function endRoom() {
    if (!room) return;
    const r = room;
    room = null;
    scene.remove(r.root);
    for (const o of r.hidden) o.visible = true;
    scene.fog = r.fog;
    scene.background.setHex(r.background);
    renderer.toneMapping = r.toneMapping;
    camera.position.copy(r.cam.position);
    camera.quaternion.copy(r.cam.quaternion);
    camera.up.copy(r.cam.up);
    Object.assign(camera, { fov: r.cam.fov, near: r.cam.near, far: r.cam.far, zoom: r.cam.zoom });
    camera.clearViewOffset();
    renderer.setScissorTest(false);
    resize();
    updateBackground();
    snapCamera();
    render();
  }

  function updateBackground() {
    if (room) return;   // 작품 방 무대는 한지색 바탕을 그대로 둔다
    const inCorridor = place === 'corridor';
    const level = inCorridor ? meanDancheong() : getDancheong(place);
    const c = mixHex(INK_BG, TOKENS.hanji, level);
    scene.background.set(c);
    setFog(scene, inCorridor ? 'corridor' : 'wing', c);
    gfxMaterials.setDancheong(level);
    gfxMaterials.setPreset(inCorridor ? 'corridor' : 'wing');
    lights.setPreset(inCorridor ? 'corridor' : 'wing');
    // 관 카메라는 회랑 벽 위에 서므로, 관 안에서는 회랑 건축(처마·벽)을 숨긴다
    if (art.gallery) art.gallery.visible = inCorridor;
    signs.visible = inCorridor;
  }
  updateBackground();

  function refreshDoors(wingId) {
    const i = wingIndex(wingId);
    if (i < 0) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    for (let p = 0; p < DOOR_PARTS; p++) {
      const b = doorBox(i, p, doorState.get(wingId), getDancheong(wingId));
      m.compose(new THREE.Vector3(...b.p), q, new THREE.Vector3(...b.s));
      doors.setMatrixAt(i * DOOR_PARTS + p, m);
      doors.setColorAt(i * DOOR_PARTS + p, c.set(b.c));
    }
    doors.instanceMatrix.needsUpdate = true;
    doors.instanceColor.needsUpdate = true;
  }

  function unmountWing() {
    if (wingHandle) {
      try { wingHandle.dispose?.(); } catch (e) { console.error('[world] 관 모형 치우기 실패', e); }
    }
    wingHandle = null;
    if (wingRoot) scene.remove(wingRoot);
    wingRoot = null;
  }

  function enterWing(id) {
    const i = wingIndex(id);
    if (i < 0) return false;
    unmountWing();
    place = id;
    wingRoot = new THREE.Group();
    wingRoot.name = 'wing-' + id;
    wingRoot.position.set(slotX(i), 0, SLOT_Z);
    scene.add(wingRoot);
    const mod = getWingModule(id);
    if (typeof mod?.create3D === 'function') {
      try {
        wingHandle = mod.create3D({ THREE, root: wingRoot, wing: wingById(id), assets, restored: getDancheong(id) >= 1, reduceMotion }) ?? null;
      } catch (e) {
        console.error('[world] 관 모형 만들기 실패', id, e);
        wingHandle = null;
      }
    }
    target = null;
    marker.visible = false;
    freeMoving = false;
    player.set(slotX(i), 0, SLOT_Z + WING_HALF - 1.2);
    doll.root.position.copy(player);
    updateBackground();
    if (reduceMotion()) snapCamera();
    return true;
  }

  function enterCorridor(fromWing = null) {
    const i = wingIndex(fromWing ?? place);
    unmountWing();
    place = 'corridor';
    target = null;
    marker.visible = false;
    freeMoving = false;
    if (i >= 0) player.set(slotX(i), 0, CORRIDOR.z0 + 1);
    else player.copy(START);
    doll.root.position.copy(player);
    updateBackground();
    if (reduceMotion()) snapCamera();
  }

  function moveTo(x, z) {
    target = clamp(new THREE.Vector3(x, 0, z));
    marker.position.set(target.x, 0.03, target.z);
    marker.scale.setScalar(1);
    marker.visible = true;
    freeMoving = false;
    return { x: target.x, z: target.z };
  }

  function tapAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(floorPlane, hit)) return null;
    return moveTo(hit.x, hit.z);
  }

  function rotateBy(dxPx) {
    yaw = Math.min(TUNING.yawLimit, Math.max(-TUNING.yawLimit, yaw - dxPx * TUNING.yawPerPixel));
    if (reduceMotion()) snapCamera();
  }

  function frame(dt, input) {
    frames++;
    if (frames >= 2) addGroundsLater();
    if (room) { render(); return; }   // 방이 열린 동안은 그리기만 한다(학생·카메라·관 모형을 움직이지 않는다)
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    let dir = null;
    if (input.x || input.y) {
      dir = right.clone().multiplyScalar(input.x).addScaledVector(fwd, input.y);
      if (dir.lengthSq() > 1) dir.normalize();
      player.addScaledVector(dir, TUNING.moveSpeed * dt);
      clamp(player);
      target = null;
      marker.visible = false;
      freeMoving = true;
    } else {
      if (freeMoving) { freeMoving = false; arrive(); }
      if (target) {
        const d = target.clone().sub(player);
        const len = d.length();
        const step = TUNING.moveSpeed * dt;
        if (len <= step || len < 0.02) {
          player.copy(target);
          arrive();
        } else {
          dir = d.multiplyScalar(1 / len);
          player.addScaledVector(dir, step);
        }
      }
    }
    doll.root.position.copy(player);
    if (dir) {
      const side = dir.dot(right);
      if (Math.abs(side) > 0.05) dollFlip = side < 0;
    }
    if (marker.visible && !reduceMotion()) marker.scale.setScalar(1 + 0.12 * Math.sin(frames / 6));

    if (wingHandle?.update) {
      try { wingHandle.update(dt); } catch (e) { console.error('[world] 관 모형 update 실패', e); }
    }

    desired(wantPos, wantLook);
    const k = reduceMotion() ? 1 : 1 - Math.exp(-dt * TUNING.cameraFollow);
    camera.position.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    if (shakeLeft > 0 && !reduceMotion()) {
      shakeLeft = Math.max(0, shakeLeft - dt);
      camera.position.x += (Math.random() - 0.5) * 0.12 * shakeLeft;
      camera.position.y += (Math.random() - 0.5) * 0.12 * shakeLeft;
    }
    camera.lookAt(camLook);
    doll.update(dt, camera, { moving: !!dir, flip: dollFlip, dir, speed: dir ? TUNING.moveSpeed * Math.min(1, dir.length()) : 0 });
    lights.aim(player);
    render();
  }

  function toScreen(p) {
    const v = new THREE.Vector3(p.x, p.y ?? 0, p.z).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  return {
    mode: '3d',
    frame,
    tapAt,
    rotateBy,
    enterWing,
    enterCorridor,
    moveTo: (p) => moveTo(p.x, p.z),
    resize,
    render,
    setMeasureFocus(on) {
      measureFocusOn = !!on;
      if (reduceMotion()) snapCamera();
    },
    forward(name, detail) {
      if (!wingHandle?.react) return;
      try { wingHandle.react(name, detail); } catch (e) { console.error('[world] 관 모형 react 실패', name, e); }
    },
    setWingState(id, state) {
      if (!doorState.has(id) || !state) return;
      doorState.set(id, state);
      refreshDoors(id);
    },
    dancheongChanged(id) {
      refreshDoors(id);
      updateBackground();
    },
    shake(seconds = 0.4) {
      if (reduceMotion()) return false;
      shakeLeft = Math.max(shakeLeft, seconds);
      return true;
    },
    resetCamera() {
      yaw = 0;
      snapCamera();
    },
    clearTarget() {
      target = null;
      marker.visible = false;
    },
    getPlace: () => place,
    getPlayer: () => ({ x: player.x, z: player.z }),
    getMarker: () => ({ visible: marker.visible, x: marker.position.x, z: marker.position.z }),
    getCamera() {
      desired(wantPos, wantLook);
      return {
        yaw,
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        fov: camera.fov,
        aspect: camera.aspect,
        distanceToDesired: room ? 0 : camera.position.distanceTo(wantPos),
      };
    },
    getAnchors: worldAnchors,
    getWingHandle: () => wingHandle,
    getThree: () => ({ THREE, scene, camera, renderer, root: wingRoot }),
    beginRoom,
    endRoom,
    getRoomState: () => ({
      open: !!room,
      children: room ? room.root.children.length : 0,
      wingHidden: room ? !!wingRoot && !wingRoot.visible : false,
    }),
    getRenderInfo: () => ({ pixelRatio: renderer.getPixelRatio(), software, antialias: !software }),
    getStats: () => ({
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      frames,
      pixelRatio: renderer.getPixelRatio(),
      shadows: renderer.shadowMap.enabled,
      quality: quality.tier,
    }),
    toScreen,
    dispose() {
      disposed = true;
      offQuality();
      ro.disconnect();
      if (art.grounds && !art.groundsAdded) scene.add(art.grounds);   // 아래 traverse가 함께 치운다
      endRoom();
      unmountWing();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
      });
      kit.dispose();
      inkScreens.dispose();
      gfxMaterials.dispose();
      gfxTextures.dispose();
      doll.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
