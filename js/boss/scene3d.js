// 보스전 3D 장면: 먹안개 낀 밤의 서고. 세계 바탕과 따로 보스 화면 안에 작은 그림판을 만든다(spec 14).
// 그림은 gfx 꾸러미(js/world/gfx/t37-scenery.js)로 짓는다: 한옥 서고 안(마루 널, 기둥·공포, 달빛 비치는 창살 벽),
// 책이 꽂힌 서가 넷, 청사초롱과 등불 번짐, 가운데 보스 서가 다섯 칸. 실시간 그림자·후처리는 없고 안개(FogExp2)가 깊이를 준다.
// 인물은 종이 인형(gfx/figures.js): 좀 여덟, 좀 대왕, 선대 사서. 선대 사서는 갇혀 있는 동안 먹빛이고 풀려나면 제 빛깔이 돌아온다.
// 그리기 호출은 서른 남짓이다(역할마다 하나, 책등은 인스턴스 하나).
// 손잡이: setFog('normal'|'thick'), setKing('hidden'|'present'|'scattered'), setMentor('trapped'|'free'),
//         setFilled(칸 번호, bool), resize(), stats(), dispose()
import * as THREE from 'three';
import { TOKENS } from '../world/palette.js';
import { createAssets } from '../world/assets.js';
import { paperDollCanvas } from '../world/sprites.js';
import { createFigure } from '../world/gfx/figures.js';
import { createScenery, disposeGroupGeometry } from '../world/gfx/t37-scenery.js';

export const SCENE_TUNING = Object.freeze({
  pixelRatioMax: 1.5,
  fogDensity: { normal: 0.055, thick: 0.13 },
  puffOpacity: { normal: 0.45, thick: 0.85 },
  scatterSec: 1.6,
  mentorStepSec: 1.4,
});

const NIGHT = new THREE.Color(TOKENS.meok).multiplyScalar(0.55);

// 먹안개 덩이 무늬(가운데가 짙고 가장자리가 투명)
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(43,43,43,0.95)');
  grad.addColorStop(0.55, 'rgba(90,86,80,0.55)');
  grad.addColorStop(1, 'rgba(141,138,133,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 그림이 없을 때의 자리표시(좀, 좀 대왕)
function blobCanvas(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = TOKENS.meok;
  g.beginPath();
  if (kind === 'king') { g.arc(64, 70, 54, 0, Math.PI * 2); } else { g.ellipse(64, 64, 50, 18, 0, 0, Math.PI * 2); }
  g.fill();
  g.fillStyle = TOKENS.hanji;
  g.beginPath();
  g.arc(48, 60, 6, 0, Math.PI * 2);
  g.arc(80, 60, 6, 0, Math.PI * 2);
  g.fill();
  return c;
}

export function createScene3D(host, { manifest = null, reduceMotion = () => false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, SCENE_TUNING.pixelRatioMax));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'boss-canvas';
  host.append(renderer.domElement);

  const assets = createAssets(manifest, THREE);
  const scene = new THREE.Scene();
  scene.background = NIGHT;
  scene.fog = new THREE.FogExp2(NIGHT, SCENE_TUNING.fogDensity.normal);
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 80);
  const camBase = new THREE.Vector3(0, 2.4, 9);
  const lookAt = new THREE.Vector3(0, 1.9, 0);
  camera.position.copy(camBase);
  camera.lookAt(lookAt);

  const geos = [];
  const mats = [];
  const texs = [];
  const keep = (x, list) => { list.push(x); return x; };
  const box = keep(new THREE.BoxGeometry(1, 1, 1), geos);
  const plane = keep(new THREE.PlaneGeometry(1, 1), geos);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();

  function instanced(geo, mat, list) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, i) => {
      m4.compose(new THREE.Vector3(...b.p), q, new THREE.Vector3(...b.s));
      mesh.setMatrixAt(i, m4);
      if (b.c) mesh.setColorAt(i, col.set(b.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  }

  // ── 빛: 서고의 넓은 면은 빛 계산 없는 재질이라 빛을 받지 않는다. 밝기는 꼭짓점 색(굽은 그늘)과 등불·창호지가 맡는다 ──
  // 빛은 초롱·창호지와 인물(3D 인물은 빛을 받는 재질)을 위한 것이다: 서늘한 반구광, 초롱 쪽 따뜻한 주광,
  // 뒤 위에서 비추는 달빛 테두리 빛(어두운 방에서 좀 대왕·선대 사서의 윤곽을 떼어 낸다). 그림자는 없다.
  const hemi = new THREE.HemisphereLight(0xaab4c8, 0x2a2622, 1.5);
  const keyLight = new THREE.DirectionalLight(0xffd6a0, 1.6);
  keyLight.position.set(-3, 5, 8);
  const rimLight = new THREE.DirectionalLight(0xcfe0ff, 2.2);
  rimLight.position.set(1.5, 6, -8);
  scene.add(hemi, keyLight, rimLight);

  // ── 서고 건축(gfx 꾸러미) ──
  // 밤 장면은 넓은 면(마루, 벽, 서가)이 많고 빛의 결이 작으므로 빛 계산 없는 꼴로 그린다(채움 비용)
  const sc = createScenery(THREE, { unlit: ['wood', 'paint', 'plaster', 'roof', 'stone', 'floor', 'books'] });
  sc.materials.setDancheong(0.8);   // 밤의 서고: 단청이 조금 가라앉은 빛
  const b = sc.kit.builder();
  // 마루 널
  b.box('floor', 18, 0.12, 16, { p: [0, -0.06, 0], color: '#6d5a48', ao: 0, bevel: 0.02 });
  // 뒷벽: 어둠 속에 달빛 비치는 창살 창 셋과 기둥·공포·서까래(벽면은 밤의 어둠과 안개가 맡는다: 넓은 면 채움을 아낀다)
  const wallZ = -4.6;
  b.box('plaster', 16, 0.5, 0.2, { p: [0, 0.25, wallZ - 0.15], color: '#6d6558', ao: 0.4 });
  for (const x of [-4.6, 0, 4.6]) sc.kit.latticeWindow(b, { x, y: 1.0, z: wallZ, w: 2.4, h: 2.2, pattern: 'grid', cols: 7, rows: 6, frame: '#2f2722' });
  sc.kit.hanokFrame(b, { posts: [-7.2, -2.3, 2.3, 7.2], z: wallZ + 0.1, height: 3.9, eave: 0.9, paint: '#3f4b44', accent: '#5a3a32', rafterGap: 0.55 });
  // 서가 넷: 양옆은 비스듬히, 뒤 둘은 창 사이
  const shelves = [
    { x: -6.3, z: 0.8, rot: Math.PI / 2 - 0.25, w: 3.6, seed: 2 },
    { x: 6.3, z: 0.8, rot: -Math.PI / 2 + 0.25, w: 3.6, seed: 4 },
    { x: -3.6, z: -3.6, rot: 0, w: 2.4, seed: 6 },
    { x: 3.6, z: -3.6, rot: 0, w: 2.4, seed: 8 },
  ];
  for (const s of shelves) {
    const sb = sc.kit.builder();
    sc.kit.bookshelf(sb, { x: 0, z: 0, width: s.w, height: 3.4, levels: 5, seed: s.seed, fill: 0.88 });
    for (const [role, list] of sb.parts) for (const it of list) b.add(role, it.geo, { matrix: new THREE.Matrix4().makeRotationY(s.rot).setPosition(s.x, 0, s.z).multiply(it.matrix), color: it.color, shade: it.shade, ao: it.ao, uv: it.uv });
    for (const [role, { geo, items }] of sb.instanced) for (const it of items) b.instance(role, geo, { matrix: new THREE.Matrix4().makeRotationY(s.rot).setPosition(s.x, 0, s.z).multiply(it.matrix), color: it.color });
  }
  // 보스 서가: 다섯 칸(관 자리). 나무 틀 + 칸막이(금빛 칠, 누를 수 있는 자리의 표시) + 받침
  const SLOT_W = 1.1;
  const slotX = (i) => (i - 2) * (SLOT_W + 0.15);
  const FRAME_W = 5 * (SLOT_W + 0.15) + 0.3;
  b.box('wood', FRAME_W, 0.14, 0.72, { p: [0, 0.6, -0.8], color: '#4a3c32', ao: 0.2 });
  b.box('wood', FRAME_W + 0.2, 0.16, 0.8, { p: [0, 1.98, -0.8], color: '#4a3c32', ao: 0 });
  b.box('wood', FRAME_W, 1.35, 0.06, { p: [0, 1.27, -1.13], color: '#2f2722', ao: 0.2 });
  for (const dx of [-FRAME_W / 2 + 0.1, FRAME_W / 2 - 0.1]) b.box('wood', 0.16, 0.6, 0.6, { p: [dx, 0.3, -0.8], color: '#3e332b', ao: 0.4 });
  for (let i = 0; i <= 5; i++) b.box('paint', 0.1, 1.35, 0.7, { p: [(i - 2.5) * (SLOT_W + 0.15), 1.27, -0.8], color: TOKENS.gold, ao: 0 });
  sc.kit.contactShadow(b, { x: 0, z: -0.6, w: FRAME_W + 1, d: 1.6 });
  // 청사초롱: 서가 사이 기둥에 걸린 등불(따뜻한 빛 번짐)
  const glows = [];
  for (const [x, y, z] of [[-5.0, 2.7, 0.4], [5.0, 2.7, 0.4], [-2.3, 2.9, -3.9], [2.3, 2.9, -3.9], [0, 2.75, -0.55]]) sc.kit.lantern(b, glows, { x, y, z, scale: 0.9 });
  sc.kit.glowCards(b, glows);
  const hall = sc.build(b, 'boss-hall');
  scene.add(hall);
  // 등불 번짐과 창호지는 안개에 묻히지 않게(먼 데서도 밝게 남는다)
  for (const m of hall.children) if (m.material?.name === 'gfx-glow') { m.material.fog = false; m.material.opacity = 0.65; }

  // 꽂힌 책(칸마다 하나, 빈 칸은 크기 0)
  const filledMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(TOKENS.hanji).multiplyScalar(0.85) }), mats);
  const filledMesh = instanced(box, filledMat, [0, 1, 2, 3, 4].map((i) => ({ p: [slotX(i), 1.25, -0.75], s: [0.0001, 0.0001, 0.0001] })));
  const filled = [false, false, false, false, false];
  function placeFilled(i, on) {
    m4.compose(new THREE.Vector3(slotX(i), 1.25, -0.75), q, on ? new THREE.Vector3(0.7, 1.1, 0.45) : new THREE.Vector3(0.0001, 0.0001, 0.0001));
    filledMesh.setMatrixAt(i, m4);
    filledMesh.instanceMatrix.needsUpdate = true;
  }

  // ── 먹안개 덩이(정해진 자리, 무작위 없음) ──
  const puffTex = keep(puffTexture(), texs);
  const puffMat = keep(new THREE.MeshBasicMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: SCENE_TUNING.puffOpacity.normal, fog: false }), mats);
  const PUFFS = [];
  for (let i = 0; i < 14; i++) PUFFS.push({ x: -6 + (i % 7) * 2, y: 0.4 + (i % 3) * 0.5, z: 2.5 - Math.floor(i / 7) * 4, s: 3 + (i % 4) * 0.7, ph: i * 0.9 });
  const puffMesh = new THREE.InstancedMesh(plane, puffMat, PUFFS.length);
  puffMesh.frustumCulled = false;
  puffMesh.renderOrder = 20;
  scene.add(puffMesh);

  // ── 종이 인형: 좀 여덟, 좀 대왕, 선대 사서 ──
  const figure = (name, kind, height, opts = {}) => {
    const url = assets.image('sprite/' + kind);
    const canvas = url ? null : kind === 'mentor' ? paperDollCanvas('mentor', 128, 256) : blobCanvas(kind === 'jom-king' ? 'king' : 'jom');
    const f = createFigure(THREE, { url, canvas, height, reduceMotion, name, ...opts });
    scene.add(f.root);
    return f;
  };
  const JOMS = [[-5.6, 2.2, 1.0], [-5.6, 0.9, 2.2], [5.6, 1.6, 0.4], [5.6, 3.1, 2.0], [-3.4, 2.7, -2.8], [3.0, 1.0, -2.8], [-1.2, 0.08, 2.4], [1.8, 0.08, 1.6]];
  const joms = JOMS.map((p, i) => figure('boss-jom-' + i, 'jom', 0.6, { shadow: p[1] < 0.5, phase: i * 0.7, lean: 0.2 }));
  const king = figure('boss-king', 'jom-king', 3.4, { shadow: false, lean: 0.1 });
  const kingBase = new THREE.Vector3(-2.2, 1.35, 0.4);
  king.root.position.copy(kingBase);
  king.root.visible = false;
  // 좀 대왕 뒤의 달빛 번짐: 어두운 서고에서 먹구름 몸의 윤곽이 읽히게 뒤를 밝힌다(더하기 섞기, 안개에 묻히지 않음)
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 128;
  {
    const g = haloCanvas.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(214,226,240,0.75)');
    gr.addColorStop(0.45, 'rgba(170,186,210,0.32)');
    gr.addColorStop(1, 'rgba(120,130,150,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  const haloTex = keep(new THREE.CanvasTexture(haloCanvas), texs);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const haloMat = keep(new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.9 }), mats);
  const halo = new THREE.Mesh(plane, haloMat);
  halo.renderOrder = 15;
  halo.visible = false;
  scene.add(halo);
  const haloBack = new THREE.Vector3();
  function placeHalo(k = 1) {
    // 카메라에서 본 좀 대왕 바로 뒤(1.2m)에, 몸 가운데 높이로
    haloBack.copy(king.root.position).sub(camera.position).setY(0).normalize().multiplyScalar(1.2);
    halo.position.set(king.root.position.x + haloBack.x, king.root.position.y + 1.75 * king.root.scale.y, king.root.position.z + haloBack.z);
    halo.quaternion.copy(camera.quaternion);
    halo.scale.setScalar(6.2 * king.root.scale.y);
    haloMat.opacity = 0.9 * k;
    halo.visible = king.root.visible;
  }
  const mentor = figure('boss-mentor', 'mentor', 2.0, { lean: 0.15 });
  const mentorTrapped = new THREE.Vector3(3.9, 0, -2.0);
  const mentorFree = new THREE.Vector3(2.2, 0, 2.2);
  mentor.root.position.copy(mentorTrapped);
  // 갇힌 선대 사서는 먹빛(그림의 빛깔을 걷음), 풀려나면 제 빛깔이 돌아온다
  const setInk = (f, v) => { const u = f.material?.userData?.ink; if (u) u.value = v; };
  setInk(mentor, 0);

  // ── 상태 ──
  let fog = 'normal';
  let fogNow = SCENE_TUNING.fogDensity.normal;
  let kingState = 'hidden';
  let scatterT = -1;
  let mentorState = 'trapped';
  let mentorT = -1;
  let time = 0;
  let last = performance.now();
  let raf = 0;
  let disposed = false;
  let calls = 0;

  function layoutPuffs(t) {
    PUFFS.forEach((p, i) => {
      const drift = reduceMotion() ? 0 : Math.sin(t * 0.25 + p.ph) * 0.6;
      m4.compose(new THREE.Vector3(p.x + drift, p.y, p.z), camera.quaternion, new THREE.Vector3(p.s, p.s * 0.6, 1));
      puffMesh.setMatrixAt(i, m4);
    });
    puffMesh.instanceMatrix.needsUpdate = true;
  }

  function layoutJoms(t, dt) {
    const fly = scatterT >= 0 ? Math.min(1, scatterT / SCENE_TUNING.scatterSec) : 0;
    JOMS.forEach((p, i) => {
      const crawl = reduceMotion() ? 0 : Math.sin(t * 0.8 + i) * 0.25;
      const out = fly * (6 + i);
      const f = joms[i];
      f.root.position.set(p[0] + crawl + Math.sign(p[0] || 1) * out, p[1] + fly * 3 - 0.3, p[2] + fly * 2);
      const s = Math.max(0.0001, 1 - fly);
      f.root.scale.setScalar(s);
      f.root.visible = fly < 1;
      f.update(dt, camera, { moving: !reduceMotion() && fly === 0 });
    });
  }

  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    const rm = reduceMotion();
    // 먹안개 짙기
    const target = SCENE_TUNING.fogDensity[fog];
    fogNow = rm ? target : fogNow + (target - fogNow) * Math.min(1, dt * 6);
    scene.fog.density = fogNow;
    puffMat.opacity = SCENE_TUNING.puffOpacity[fog];
    // 카메라 살짝 흔들림(움직임 줄이기면 멈춤)
    camera.position.set(camBase.x + (rm ? 0 : Math.sin(time * 0.2) * 0.25), camBase.y, camBase.z);
    camera.lookAt(lookAt);
    // 좀 대왕: 떠서 숨 쉬듯 오르내리고, 흩어질 때는 부풀며 솟았다가 사라진다
    if (kingState === 'present') {
      king.root.visible = true;
      king.root.scale.setScalar(1);
      king.root.position.set(kingBase.x, kingBase.y + (rm ? 0 : Math.sin(time * 0.9) * 0.12), kingBase.z);
      king.update(dt, camera);
      placeHalo(1);
    } else if (kingState === 'scattered') {
      scatterT = rm ? SCENE_TUNING.scatterSec : scatterT + dt;
      const k = Math.min(1, scatterT / SCENE_TUNING.scatterSec);
      const grow = 1 + k * 0.8;
      const fade = k < 0.6 ? grow : grow * Math.max(0.0001, (1 - k) / 0.4);
      king.root.scale.setScalar(fade);
      king.root.position.set(kingBase.x, kingBase.y + k * 1.2, kingBase.z);
      king.update(dt, camera);
      if (!rm && king.card) king.card.rotation.z += Math.sin(k * Math.PI) * 0.25;
      king.root.visible = k < 1;
      placeHalo(1 - k);
    } else {
      king.root.visible = false;
      halo.visible = false;
    }
    // 선대 사서: 풀려나면 걸어 나오며 빛깔이 돌아온다
    if (mentorState === 'free') {
      mentorT = rm ? SCENE_TUNING.mentorStepSec : mentorT + dt;
      const k = Math.min(1, mentorT / SCENE_TUNING.mentorStepSec);
      mentor.root.position.lerpVectors(mentorTrapped, mentorFree, k);
      setInk(mentor, k);
      mentor.update(dt, camera, { moving: k < 1 && !rm });
    } else {
      mentor.update(dt, camera);
    }
    layoutPuffs(time);
    layoutJoms(time, dt);
    renderer.render(scene, camera);
    calls = renderer.info.render.calls;
  }

  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 좁은 화면에서도 보스 서가와 좀 대왕이 들어오게 시야를 넓힌다
    camera.fov = w / h < 1.2 ? 64 : 48;
    camera.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(host);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    mode: '3d',
    setFog(v) { fog = v === 'thick' ? 'thick' : 'normal'; },
    setKing(v) {
      if (v === 'scattered' && kingState !== 'scattered') scatterT = 0;
      if (v !== 'scattered') scatterT = -1;
      kingState = v;
    },
    setMentor(v) {
      if (v === 'free' && mentorState !== 'free') mentorT = 0;
      if (v !== 'free') { mentorT = -1; mentor.root.position.copy(mentorTrapped); setInk(mentor, 0); }
      mentorState = v;
    },
    setFilled(i, on) {
      if (i < 0 || i > 4 || filled[i] === !!on) return;
      filled[i] = !!on;
      placeFilled(i, !!on);
    },
    resize,
    stats: () => ({ mode: '3d', calls }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      for (const f of [...joms, king, mentor]) f.dispose();
      disposeGroupGeometry(hall);
      sc.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      assets.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
