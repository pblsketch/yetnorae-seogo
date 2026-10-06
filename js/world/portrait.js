// 견습 사서 모습 고르기의 3D 미리보기(spec 13). 게임 속 학생과 같은 절차 3D 인물(gfx/figures-3d.js, student-a·b)을 그린다.
//
//   const stage = createPortraitStage();          // 3D를 못 쓰면(2D 그림 판 기기, 그림판 만들기 실패) null
//   const v = stage.attach(canvas, 'a');          // 2D 캔버스 하나를 미리보기 칸으로 붙인다
//   v.setSelected(true);                          // 고른 칸: 천천히 돌고, 고를 때 한 번 고개 숙여 인사한 뒤 숨만 쉰다
//   v.detach();                                   // 고르지 않은 칸은 3/4 자세로 멈춰 있다(흐리게는 CSS가 맡는다)
//   stage.portrait('a') → 약속(그림 주소)          // 3/4 자세 정지 그림(기록 목록의 작은 그림). 한 번 만들면 창이 닫힐 때까지 다시 쓴다
//   stage.pause(true|false), stage.dispose()
//
// 가볍게: WebGL 그림판은 화면에 붙이지 않은 하나만 만들고(작은 크기), 칸마다 그린 결과를 2D 캔버스로 옮긴다.
// 프레임마다 다시 그리는 것은 고른 칸 하나뿐이다. 움직임 줄이기면 돌지도 인사하지도 않고, 바뀔 때만 한 번 그린다.
// 세로 회전 안내가 떠 있거나 창이 숨으면 그리지 않는다. 세계(world.js)와 따로 돌며, 세계가 뜨기 전에 치운다.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { createCharacter, FIGURE_HEIGHT } from './gfx/figures.js';
import { applyRenderSettings, createLightRig } from './gfx/lighting.js';
import { softwareRendering } from './gfx/t39-perf.js';
import { detectMode } from './mode.js';
import { reduceMotion } from './motion.js';
import { isPaused } from './screen.js';

export const PORTRAIT_TUNING = Object.freeze({
  turnSpeed: 0.55,        // 고른 칸이 도는 빠르기(rad/s)
  restYaw: 0.55,          // 3/4 자세(카메라에서 비켜 선 각, rad)
  bowSeconds: 1.5,        // 고를 때 한 번 하는 인사 길이
  bowTorso: 0.42,         // 인사할 때 몸통을 숙이는 각(rad)
  bowHead: 0.22,
  pixelRatioMax: 1.5,
  fov: 22,
  camera: [0, 0.98, 4.9],
  target: [0, 0.8, 0],
  portraitSize: [96, 144], // 기록 목록 작은 그림(CSS px의 1.5배쯤)
});

const portraitCache = new Map();   // 'a'|'b' → 그림 주소(창이 닫힐 때까지)

// 그린 정지 그림이 이미 있으면 바로 준다(없으면 null). 2D 기기에서는 늘 null이다.
export function cachedPortrait(look) {
  return portraitCache.get(look === 'b' ? 'b' : 'a') ?? null;
}

export function createPortraitStage() {
  if (detectMode() !== '3d') return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !softwareRendering(), alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  applyRenderSettings(renderer, THREE);
  renderer.setClearColor(0x000000, 0);
  const T = PORTRAIT_TUNING;
  const scene = new THREE.Scene();
  const lights = createLightRig(THREE, scene);
  lights.setPreset('room');
  const camera = new THREE.PerspectiveCamera(T.fov, 2 / 3, 0.1, 30);
  camera.position.set(...T.camera);
  camera.lookAt(new THREE.Vector3(...T.target));

  const figures = new Map();
  function figureOf(look) {
    const k = look === 'b' ? 'b' : 'a';
    if (!figures.has(k)) {
      const fig = createCharacter(THREE, { kind: 'student-' + k, height: FIGURE_HEIGHT.student, reduceMotion, faceCamera: false, name: 'portrait-' + k });
      fig.root.visible = false;
      scene.add(fig.root);
      fig.update(0, camera);
      figures.set(k, fig);
    }
    return figures.get(k);
  }

  // 한 번 그리기: 그 인물만 보이게 하고 크기를 맞춰 그린 뒤 대상 2D 캔버스에 옮긴다.
  function drawTo(ctx, w, h, look, yaw, bow, dt) {
    const fig = figureOf(look);
    for (const f of figures.values()) f.root.visible = f === fig;
    fig.root.rotation.y = yaw;
    fig.update(dt, camera);
    if (bow > 0 && fig.body?.bones) {
      const B = fig.body.bones;
      if (B.torso) B.torso.rotation.x += T.bowTorso * bow;
      if (B.head) B.head.rotation.x += T.bowHead * bow;
    }
    const size = renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(renderer.domElement, 0, 0, w, h);
  }

  const views = new Set();
  let disposed = false;
  let paused = false;
  let raf = 0;
  let last = 0;

  function sizeOf(canvas) {
    const pr = Math.min(window.devicePixelRatio || 1, T.pixelRatioMax);
    const w = Math.max(1, Math.round((canvas.clientWidth || 120) * pr));
    const h = Math.max(1, Math.round((canvas.clientHeight || 180) * pr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return [w, h];
  }

  function paint(v, dt) {
    if (!v.canvas.isConnected) return false;
    const [w, h] = sizeOf(v.canvas);
    const calm = reduceMotion();
    let bow = 0;
    if (v.selected && !calm) {
      v.angle += dt * T.turnSpeed;
      if (v.bowLeft > 0) {
        v.bowLeft = Math.max(0, v.bowLeft - dt);
        bow = Math.sin(Math.PI * (1 - v.bowLeft / T.bowSeconds));
      }
    } else {
      v.angle = T.restYaw;
      v.bowLeft = 0;
    }
    drawTo(v.ctx, w, h, v.look, v.angle, bow, calm ? 0 : dt);
    v.painted = true;
    v.canvas.dataset.painted = 'true';
    return true;
  }

  function loop(now) {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const live = [...views].filter((v) => v.selected && v.canvas.isConnected);
    const calm = reduceMotion();
    if (!paused && !isPaused() && !document.hidden) {
      for (const v of views) if (!v.painted || v.dirty) { v.dirty = false; paint(v, 0); }
      if (!calm) for (const v of live) paint(v, dt);
    }
    if (live.length && !calm) raf = requestAnimationFrame(loop);
    else last = 0;
  }

  function kick() {
    if (!disposed && !raf) raf = requestAnimationFrame(loop);
  }

  // 움직임 줄이기를 바꾸면 모든 칸을 그 상태로 다시 그린다(돌던 칸은 3/4 자세로 돌아온다)
  const offMotion = on('settings:reduce-motion', () => { for (const v of views) v.dirty = true; kick(); });

  function attach(canvas, look) {
    const v = {
      canvas, ctx: canvas.getContext('2d'), look: look === 'b' ? 'b' : 'a',
      selected: false, angle: T.restYaw, bowLeft: 0, painted: false, dirty: true,
    };
    canvas.dataset.render = '3d';
    views.add(v);
    kick();
    return {
      setSelected(on, { greet = true } = {}) {
        const was = v.selected;
        v.selected = !!on;
        if (v.selected && !was) { v.angle = T.restYaw; v.bowLeft = greet ? T.bowSeconds : 0; }
        v.dirty = true;
        kick();
      },
      refresh() { v.dirty = true; kick(); },
      detach() { views.delete(v); },
    };
  }

  // 정지 그림(3/4 자세). 한 번 만들면 창이 닫힐 때까지 다시 쓴다.
  function portrait(look) {
    const k = look === 'b' ? 'b' : 'a';
    if (portraitCache.has(k)) return Promise.resolve(portraitCache.get(k));
    if (disposed) return Promise.resolve(null);
    const [w, h] = T.portraitSize;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    drawTo(c.getContext('2d'), w, h, k, T.restYaw, 0, 0);
    const url = c.toDataURL('image/png');
    portraitCache.set(k, url);
    for (const v of views) v.dirty = true;   // 그림판 크기가 바뀌었으니 칸을 다시 그린다
    kick();
    return Promise.resolve(url);
  }

  return {
    attach,
    portrait,
    pause(on) { paused = !!on; if (!paused) { for (const v of views) v.dirty = true; kick(); } },
    get canvas() { return renderer.domElement; },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      offMotion?.();
      views.clear();
      for (const f of figures.values()) f.dispose();
      figures.clear();
      lights.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
