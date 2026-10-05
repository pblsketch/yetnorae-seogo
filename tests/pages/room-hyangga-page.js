// 점검 페이지: 작품 방 「제망매가」를 단독으로 띄운다. tests/check-room-hyangga.mjs가 window.__r를 부른다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
//
// - 노래는 실제 등록 데이터(js/data/songs/index.js)의 「제망매가」다.
// - 소리 엔진은 실제 엔진(js/core/audio.js)이다. 낭송 조각 파일은 아직 없으므로 불러오기가 '없는 파일'로 돌려주고
//   (엔진이 딸깍 소리로 대신한다), 효과음·배경음은 짧은 무음 버퍼로 대신한다. 그래서 파일 요청이 없다.
// - 박자 칸은 빨리 돌도록 빠르기 240, 단위 사이 쉼 0.2초로 만든다(ctx.rhythm.buildGrid를 바꿔 끼운다).
// - 3D를 쓸 수 있으면 작은 장면(렌더러·카메라·root)을 만들어 ctx.three로 넘기고 프레임마다 그린다.
import * as THREE from 'three';
import * as events from '../../js/core/events.js';
import * as R from '../../js/core/rhythm.js';
import { createAudioEngine } from '../../js/core/audio.js';
import { songs } from '../../js/data/songs/index.js';
import * as room from '../../js/rooms/hyangga.js';

const song = songs.find((s) => s.id === 'jemangmaega');
const stageEl = document.getElementById('stage');
const roomEl = document.getElementById('room');

const engine = createAudioEngine({
  loadBuffer: async (path, c) => {
    if (path.startsWith('assets/audio/voice/')) throw new Error('낭송 조각 없음(점검)');
    return c.createBuffer(1, Math.max(1, Math.round(c.sampleRate * 0.03)), c.sampleRate);
  },
});
engine.attachUnlock(document);

const plays = [];
const spyEngine = new Proxy(engine, {
  get(target, key) {
    if (key === 'play') return (grid, segs, opts) => { plays.push((segs ?? []).slice()); return target.play(grid, segs, opts); };
    const v = target[key];
    return typeof v === 'function' ? v.bind(target) : v;
  },
});
const rhythm = { engine: spyEngine, buildGrid: (s) => R.buildGrid(s, { tempo: 240, gapSec: 0.2 }) };

// ── 3D 장면(쓸 수 있을 때만) ──
let three = null;
function make3D() {
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return null;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    stageEl.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3ead6);
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
    camera.position.set(0, 5, 12);
    camera.lookAt(0, 0, 0);
    const root = new THREE.Group();
    scene.add(root);
    const resize = () => {
      const w = stageEl.clientWidth || 1;
      const h = stageEl.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);
    let calls = 0;
    const loop = () => { requestAnimationFrame(loop); renderer.render(scene, camera); calls = renderer.info.render.calls; };
    requestAnimationFrame(loop);
    return { THREE, renderer, scene, camera, root, calls: () => calls };
  } catch {
    return null;
  }
}
three = make3D();

const manifest = await fetch('../../assets/manifest.json').then((r) => r.json()).catch(() => null);

const r = {
  song,
  events,
  plays,
  has3d: !!three,
  state: 'idle',
  result: null,
  error: null,
  controller: null,
  start(opts = {}) {
    const mode = opts.mode ?? (three ? '3d' : '2d');
    r.state = 'running';
    r.result = null;
    r.error = null;
    plays.length = 0;
    r.controller = new AbortController();
    if (opts.textScale) document.documentElement.style.setProperty('--text-scale', String(opts.textScale));
    const reduce = !!opts.reduceMotion;
    document.getElementById('app').classList.toggle('reduce-motion', reduce);
    const ctx = {
      song,
      container: roomEl,
      mode,
      three: mode === '3d' && three ? { THREE, root: three.root, camera: three.camera } : undefined,
      noBeat: !!opts.noBeat,
      reduceMotion: () => reduce,
      rhythm,
      signal: r.controller.signal,
      manifest: opts.noManifest ? undefined : manifest,
    };
    let p;
    try { p = room.start(ctx); } catch (e) { r.state = 'error'; r.error = { name: e.name, message: e.message }; return; }
    p.then(
      (res) => { r.state = 'done'; r.result = res; },
      (e) => { r.state = 'error'; r.error = { name: e?.name, message: e?.message }; },
    );
  },
  abort() { r.controller?.abort(); },
  rootChildren: () => (three ? three.root.children.length : 0),
  cameraPose: () => (three ? [...three.camera.position.toArray(), ...three.camera.quaternion.toArray(), three.camera.fov].map((v) => +v.toFixed(5)) : null),
  drawCalls: () => (three ? three.calls() : 0),
  containerChildren: () => roomEl.children.length,
  ready: true,
};
window.__r = r;
