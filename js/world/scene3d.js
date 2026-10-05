// 3D 바탕(spec 3.1·14): 장면과 그리기, 자동으로 따라가는 카메라와 제한 각도 회전, 종이 인형 빌보드,
// 입구·회랑·관 문, 관 모형을 끼우는 자리, 먹빛→단청 색.
// 그리기 호출을 아끼려고 회랑의 상자들은 재질 하나의 InstancedMesh 하나로, 관 문도 하나로 그린다.
// 실시간 그림자와 후처리는 쓰지 않는다.
import * as THREE from 'three';
import { WINGS, wingById } from '../data/wings.js';
import { TOKENS, dancheongColor, getDancheong, meanDancheong, mixHex, inkOf } from './palette.js';
import { paperDollCanvas } from './sprites.js';
import { TUNING } from './tuning.js';

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

// 회랑, 입구 문, 관 자리 바닥(먹빛 재질 상자들)
function corridorBoxes() {
  const C = CORRIDOR;
  const len = C.x1 - C.x0;
  const cx = (C.x0 + C.x1) / 2;
  const floor = inkOf(TOKENS.hanjiDeep);
  const wall = mixHex(TOKENS.hanji, TOKENS.meokFog, 0.25);
  const wood = TOKENS.meokSoft;
  const pad = mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.35);
  const out = [];
  out.push({ p: [cx, -0.05, 0], s: [len, 0.1, C.z1 - C.z0], c: floor });
  // 북쪽 벽: 관 문 자리는 비운다
  let x = C.x0;
  for (let i = 0; i < WINGS.length; i++) {
    const a = slotX(i) - DOOR_HALF;
    if (a > x) out.push({ p: [(x + a) / 2, 1.5, WALL_Z], s: [a - x, 3, 0.2], c: wall });
    x = slotX(i) + DOOR_HALF;
  }
  if (C.x1 > x) out.push({ p: [(x + C.x1) / 2, 1.5, WALL_Z], s: [C.x1 - x, 3, 0.2], c: wall });
  out.push({ p: [cx, 3.1, WALL_Z], s: [len, 0.24, 0.4], c: wood });
  // 남쪽(카메라 쪽)은 낮은 난간만 둔다. 높으면 카메라를 가린다.
  for (let px = C.x0 + 2; px <= C.x1 - 0.5; px += 4) out.push({ p: [px, 0.35, C.z1 - 0.1], s: [0.2, 0.7, 0.2], c: wood });
  out.push({ p: [cx, 0.66, C.z1 - 0.1], s: [len, 0.1, 0.16], c: wood });
  // 입구 문(서고 문): 큰 기둥 둘, 인방, 지붕판
  const gx = C.x0 + 0.3;
  out.push({ p: [gx, 2, C.z0 + 0.2], s: [0.45, 4, 0.45], c: wood });
  out.push({ p: [gx, 2, C.z1 - 0.2], s: [0.45, 4, 0.45], c: wood });
  out.push({ p: [gx, 4.1, 0], s: [0.6, 0.35, 5.6], c: wood });
  out.push({ p: [gx, 4.45, 0], s: [1.6, 0.16, 6.4], c: TOKENS.meok });
  // 관 자리 바닥과 문에서 이어지는 통로
  WINGS.forEach((_, i) => {
    out.push({ p: [slotX(i), -0.04, SLOT_Z], s: [WING_HALF * 2 + 0.6, 0.06, WING_HALF * 2 + 0.6], c: pad });
    const z0 = WALL_Z;
    const z1 = SLOT_Z + WING_HALF;
    out.push({ p: [slotX(i), -0.045, (z0 + z1) / 2], s: [DOOR_HALF * 2, 0.06, Math.abs(z1 - z0)], c: pad });
  });
  return out;
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
    g.fillStyle = TOKENS.meok;
    g.fillRect(0, y, cellW, cellH);
    g.fillStyle = TOKENS.hanji;
    g.fillRect(8, y + 8, cellW - 16, cellH - 16);
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
    const y = 3.62;
    const z = WALL_Z + 0.26;
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
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
}

export function createScene3D({ view, assets, appearance = 'a', getWingModule, reduceMotion, onArrive }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TUNING.pixelRatioMax));
  renderer.shadowMap.enabled = false;
  view.prepend(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK_BG);
  scene.fog = new THREE.Fog(INK_BG, 28, 75);
  scene.add(new THREE.HemisphereLight(0xfff6e4, 0x4a4640, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-6, 12, 8);
  scene.add(sun);

  const boxMaterial = new THREE.MeshLambertMaterial();
  const corridor = instancedBoxes(boxMaterial, corridorBoxes());
  scene.add(corridor);

  const doorState = new Map(WINGS.map((w) => [w.id, w.id === 'entrance' ? 'open' : 'locked']));
  const doorList = [];
  WINGS.forEach((w, i) => { for (let p = 0; p < DOOR_PARTS; p++) doorList.push(doorBox(i, p, doorState.get(w.id), getDancheong(w.id))); });
  const doorMaterial = new THREE.MeshLambertMaterial();
  const doors = instancedBoxes(doorMaterial, doorList);
  scene.add(doors);
  const signs = signBoards();
  scene.add(signs);

  // 학생 종이 인형(빌보드)
  const dollTexture = assets.texture('sprite/student-' + (appearance === 'b' ? 'b' : 'a')) ?? new THREE.CanvasTexture(paperDollCanvas('student-' + (appearance === 'b' ? 'b' : 'a')));
  dollTexture.colorSpace = THREE.SRGBColorSpace;
  const doll = new THREE.Sprite(new THREE.SpriteMaterial({ map: dollTexture, alphaTest: 0.2 }));
  doll.center.set(0.5, 0);
  const DOLL_W = 0.95;
  doll.scale.set(DOLL_W, 1.9, 1);
  scene.add(doll);

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

  const START = new THREE.Vector3(CORRIDOR.x0 + 5, 0, 0.6);
  const player = START.clone();
  doll.position.copy(player);

  function bounds() {
    // 북쪽 벽에서는 1m 떨어진다(빌보드 윗부분이 벽 뒤로 기울어 가려지지 않게).
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
    renderer.render(scene, camera);
  }

  function updateBackground() {
    const level = place === 'corridor' ? meanDancheong() : getDancheong(place);
    const c = mixHex(INK_BG, TOKENS.hanji, level);
    scene.background.set(c);
    scene.fog.color.set(c);
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
    doll.position.copy(player);
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
    doll.position.copy(player);
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
    doll.position.copy(player);
    if (dir) {
      const side = dir.dot(right);
      if (Math.abs(side) > 0.05) doll.scale.x = side < 0 ? -DOLL_W : DOLL_W;
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
        distanceToDesired: camera.position.distanceTo(wantPos),
      };
    },
    getAnchors: worldAnchors,
    getWingHandle: () => wingHandle,
    getThree: () => ({ THREE, scene, camera, renderer, root: wingRoot }),
    getStats: () => ({
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      frames,
      pixelRatio: renderer.getPixelRatio(),
      shadows: renderer.shadowMap.enabled,
    }),
    toScreen,
    dispose() {
      ro.disconnect();
      unmountWing();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
