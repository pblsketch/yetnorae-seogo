// 보스전 3D 장면: 먹안개 낀 밤의 서고. 세계 바탕과 따로 보스 화면 안에 작은 그림판을 만든다(spec 14).
// 빛 계산 없는 재질만 쓰고 실시간 그림자·후처리는 없다. 그리기 호출은 열 번 남짓이다(인스턴스로 묶는다).
//   서가(책장·책·등불), 보스 서가 다섯 칸과 꽂힌 책, 먹안개 덩이, 좀, 좀 대왕, 선대 사서
// 손잡이: setFog('normal'|'thick'), setKing('hidden'|'present'|'scattered'), setMentor('trapped'|'free'),
//         setFilled(칸 번호, bool), resize(), stats(), dispose()
import * as THREE from 'three';
import { TOKENS } from '../world/palette.js';
import { createAssets } from '../world/assets.js';
import { paperDollCanvas } from '../world/sprites.js';

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
function blobTexture(kind) {
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
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

  // ── 바닥 ──
  const floor = new THREE.Mesh(plane, keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(TOKENS.meokSoft).multiplyScalar(0.55) }), mats));
  floor.rotation.x = -Math.PI / 2;
  floor.scale.set(40, 40, 1);
  scene.add(floor);

  // ── 서가: 양옆과 뒤의 책장, 책(먹빛 재질 하나의 인스턴스) ──
  const wood = new THREE.Color(TOKENS.meok).multiplyScalar(0.8).getHex();
  // 밤이라 책등은 먹빛으로 어둡게 본다
  const bookCols = [TOKENS.hanjiDeep, TOKENS.meokFog, TOKENS.meokSoft, TOKENS.hanji].map((c) => new THREE.Color(c).multiplyScalar(0.62).getHex());
  const shelfBoxes = [];
  const stack = (x, z, rotY, w) => {
    // 책장 하나: 옆판 둘, 선반 다섯, 그 위의 책
    const dx = Math.cos(rotY);
    const dz = -Math.sin(rotY);
    const at = (u, y, d) => [x + dx * u + Math.sin(rotY) * d, y, z + dz * u + Math.cos(rotY) * d];
    shelfBoxes.push({ p: at(-w / 2, 2, 0), s: [0.15, 4, 0.6], c: wood }, { p: at(w / 2, 2, 0), s: [0.15, 4, 0.6], c: wood });
    for (let k = 0; k < 5; k++) {
      const y = 0.15 + k * 0.85;
      shelfBoxes.push({ p: at(0, y, 0), s: rotY ? [0.6, 0.08, w] : [w, 0.08, 0.6], c: wood });
      let u = -w / 2 + 0.2;
      let n = 0;
      while (u < w / 2 - 0.2) {
        const bw = 0.12 + ((n * 7 + k * 3) % 5) * 0.03;
        const bh = 0.5 + ((n * 5 + k) % 4) * 0.07;
        shelfBoxes.push({ p: at(u + bw / 2, y + 0.04 + bh / 2, 0), s: rotY ? [0.45, bh, bw] : [bw, bh, 0.45], c: bookCols[(n + k) % bookCols.length] });
        u += bw + 0.02;
        n++;
      }
    }
  };
  stack(-6.5, 1.2, Math.PI / 2, 4);
  stack(6.5, 1.2, -Math.PI / 2, 4);
  stack(-4.2, -3.2, 0, 3.4);
  stack(4.2, -3.2, 0, 3.4);
  instanced(box, keep(new THREE.MeshBasicMaterial({ color: 0xffffff }), mats), shelfBoxes);

  // ── 보스 서가: 다섯 칸(관 자리) ──
  const SLOT_W = 1.1;
  const slotX = (i) => (i - 2) * (SLOT_W + 0.15);
  const frameBoxes = [];
  frameBoxes.push({ p: [0, 0.6, -0.8], s: [5 * (SLOT_W + 0.15) + 0.3, 0.12, 0.7], c: wood }, { p: [0, 1.95, -0.8], s: [5 * (SLOT_W + 0.15) + 0.3, 0.12, 0.7], c: wood });
  for (let i = 0; i <= 5; i++) frameBoxes.push({ p: [(i - 2.5) * (SLOT_W + 0.15), 1.27, -0.8], s: [0.1, 1.35, 0.7], c: TOKENS.gold });
  instanced(box, keep(new THREE.MeshBasicMaterial({ color: 0xffffff }), mats), frameBoxes);
  // 꽂힌 책(칸마다 하나, 빈 칸은 크기 0)
  const filledMesh = instanced(box, keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(TOKENS.hanji) }), mats),
    [0, 1, 2, 3, 4].map((i) => ({ p: [slotX(i), 1.25, -0.75], s: [0.0001, 0.0001, 0.0001] })));
  const filled = [false, false, false, false, false];
  function placeFilled(i, on) {
    m4.compose(new THREE.Vector3(slotX(i), 1.25, -0.75), q, on ? new THREE.Vector3(0.7, 1.1, 0.45) : new THREE.Vector3(0.0001, 0.0001, 0.0001));
    filledMesh.setMatrixAt(i, m4);
    filledMesh.instanceMatrix.needsUpdate = true;
  }

  // ── 등불 ──
  const lamps = [[-5.2, 2.6, 0.2], [5.2, 2.6, 0.2], [-2.6, 2.4, -2.6], [2.6, 2.4, -2.6], [0, 2.4, -0.6]];
  instanced(box, keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(TOKENS.gold).multiplyScalar(1.4), fog: false }), mats),
    lamps.map((p) => ({ p, s: [0.22, 0.32, 0.22] })));

  // ── 먹안개 덩이(정해진 자리, 무작위 없음) ──
  const puffTex = keep(puffTexture(), texs);
  const puffMat = keep(new THREE.MeshBasicMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: SCENE_TUNING.puffOpacity.normal, fog: false }), mats);
  const PUFFS = [];
  for (let i = 0; i < 14; i++) PUFFS.push({ x: -6 + (i % 7) * 2, y: 0.4 + (i % 3) * 0.5, z: 2.5 - Math.floor(i / 7) * 4, s: 3 + (i % 4) * 0.7, ph: i * 0.9 });
  const puffMesh = new THREE.InstancedMesh(plane, puffMat, PUFFS.length);
  puffMesh.frustumCulled = false;
  scene.add(puffMesh);

  // ── 좀(평면 인스턴스, 카메라를 본다) ──
  const jomTex = assets.texture('sprite/jom') ?? keep(blobTexture('jom'), texs);
  const jomMat = keep(new THREE.MeshBasicMaterial({ map: jomTex, transparent: true, alphaTest: 0.2, depthWrite: false }), mats);
  const JOMS = [[-5.6, 2.2, 1.0], [-5.6, 0.9, 2.2], [5.6, 1.6, 0.4], [5.6, 3.1, 2.0], [-3.4, 2.7, -2.8], [3.0, 1.0, -2.8], [-1.2, 0.08, 2.4], [1.8, 0.08, 1.6]];
  const jomMesh = new THREE.InstancedMesh(plane, jomMat, JOMS.length);
  jomMesh.frustumCulled = false;
  scene.add(jomMesh);

  // ── 좀 대왕, 선대 사서(종이 인형 빌보드) ──
  const kingTex = assets.texture('sprite/jom-king') ?? keep(blobTexture('king'), texs);
  const king = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: kingTex, transparent: true, depthWrite: false }), mats));
  king.position.set(-2.2, 3.0, 0.4);
  king.scale.set(3.2, 3.2, 1);
  king.visible = false;
  scene.add(king);
  let mentorTex = assets.texture('sprite/mentor');
  if (!mentorTex) { mentorTex = keep(new THREE.CanvasTexture(paperDollCanvas('mentor', 128, 256)), texs); mentorTex.colorSpace = THREE.SRGBColorSpace; }
  const mentor = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: mentorTex, transparent: true, depthWrite: false, opacity: 0.35 }), mats));
  const mentorTrapped = new THREE.Vector3(2.6, 1.1, -1.8);
  const mentorFree = new THREE.Vector3(2.2, 1.15, 2.2);
  mentor.position.copy(mentorTrapped);
  mentor.scale.set(0.9, 2.2, 1);
  scene.add(mentor);

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

  function layoutJoms(t) {
    const fly = scatterT >= 0 ? Math.min(1, scatterT / SCENE_TUNING.scatterSec) : 0;
    JOMS.forEach((p, i) => {
      const crawl = reduceMotion() ? 0 : Math.sin(t * 0.8 + i) * 0.25;
      const out = fly * (6 + i);
      const v = new THREE.Vector3(p[0] + crawl + Math.sign(p[0] || 1) * out, p[1] + fly * 3, p[2] + fly * 2);
      const s = (1 - fly) * 0.6;
      m4.compose(v, camera.quaternion, new THREE.Vector3(Math.max(0.0001, s), Math.max(0.0001, s), 1));
      jomMesh.setMatrixAt(i, m4);
    });
    jomMesh.instanceMatrix.needsUpdate = true;
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
    // 좀 대왕
    if (kingState === 'present') {
      king.visible = true;
      king.material.opacity = 1;
      king.position.y = 3.0 + (rm ? 0 : Math.sin(time * 0.9) * 0.12);
    } else if (kingState === 'scattered') {
      scatterT = rm ? SCENE_TUNING.scatterSec : scatterT + dt;
      const k = Math.min(1, scatterT / SCENE_TUNING.scatterSec);
      king.material.opacity = 1 - k;
      king.scale.setScalar(3.2 * (1 + k * 0.8));
      king.visible = k < 1;
    } else {
      king.visible = false;
    }
    // 선대 사서
    if (mentorState === 'free') {
      mentorT = rm ? SCENE_TUNING.mentorStepSec : mentorT + dt;
      const k = Math.min(1, mentorT / SCENE_TUNING.mentorStepSec);
      mentor.position.lerpVectors(mentorTrapped, mentorFree, k);
      mentor.material.opacity = 0.35 + 0.65 * k;
    }
    layoutPuffs(time);
    layoutJoms(time);
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
      if (v !== 'free') { mentorT = -1; mentor.position.copy(mentorTrapped); mentor.material.opacity = 0.35; }
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
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      assets.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
