// 점검 페이지: 실제 노래 데이터와 실제 소리 엔진으로 작품 방 「상춘곡」을 단독으로 띄운다.
// 점검 도구가 들여다볼 손잡이를 window.__r에 둔다. 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
//
// - 낭송 조각 파일은 아직 없으므로, 소리 엔진의 불러오기는 낭송 조각을 '없는 파일'로 돌려준다(엔진은 딸깍 소리로 대신한다).
//   효과음은 짧은 무음 버퍼로 대신한다. 그래서 파일 요청이 없고 콘솔 오류도 없다.
// - fast: 박자 칸을 빨리 돌도록 빠르기 240, 단위 사이 쉼 0.2초로 만든다(ctx.rhythm.buildGrid를 바꿔 끼운다).
// - hostThree: README 7.3대로 부르는 쪽이 { THREE, root, camera }를 넘기는 경우를 흉내 낸다(그림은 이 페이지가 그린다).
import * as THREE from 'three';
import * as events from '../../js/core/events.js';
import * as R from '../../js/core/rhythm.js';
import { createAudioEngine } from '../../js/core/audio.js';
import { createAssets } from '../../js/world/assets.js';
import { songs } from '../../js/data/songs/index.js';
import * as room from '../../js/rooms/gasa.js';

const engine = createAudioEngine({
  loadBuffer: async (path, c) => {
    if (path.startsWith('assets/audio/voice/')) throw new Error('낭송 조각 없음(점검)');
    return c.createBuffer(1, Math.max(1, Math.round(c.sampleRate * 0.03)), c.sampleRate);
  },
});
engine.attachUnlock(document);

const plays = [];
const missing = [];
events.on('audio:missing', (d) => missing.push(d.path));

// 엔진의 play를 감싸 어떤 단위를 냈는지 적는다(엔진 동작은 그대로)
const loggedEngine = new Proxy(engine, {
  get(target, key) {
    if (key === 'play') {
      return (grid, segs, opts) => {
        const h = target.play(grid, segs, opts);
        const rec = { segs: (segs ?? []).slice(), units: (segs ?? []).map((i) => grid.segments[i].unit), at: performance.now(), end: null, result: null };
        plays.push(rec);
        h.finished.then((r) => { rec.end = performance.now(); rec.result = r; });
        return h;
      };
    }
    const v = target[key];
    return typeof v === 'function' ? v.bind(target) : v;
  },
});

const manifest = await fetch('../../assets/manifest.json').then((r) => r.json());
const song = songs.find((s) => s.id === 'sangchungok');

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

const state = { result: null, error: null, settled: false, controller: null, host: null, container: null };

function makeHost(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'test-host-canvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  container.parentElement.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 300);
  let raf = 0;
  const loop = () => {
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return { THREE, root, camera, renderer, canvas, stop() { cancelAnimationFrame(raf); renderer.dispose(); canvas.remove(); } };
}

function open(o = {}) {
  const app = document.getElementById('app');
  state.host?.stop();
  app.replaceChildren();
  const container = document.createElement('div');
  container.className = 'test-room-box';
  container.style.cssText = 'position:absolute;inset:0';
  app.append(container);
  state.container = container;
  state.result = null;
  state.error = null;
  state.settled = false;
  plays.length = 0;
  if (o.textScale) document.documentElement.style.setProperty('--text-scale', String(o.textScale));
  engine.setMuted(!!o.muted);
  const mode = o.mode === 'auto' || !o.mode ? (hasWebGL2() ? '3d' : '2d') : o.mode;
  state.host = mode === '3d' && o.hostThree ? makeHost(container) : null;
  state.controller = new AbortController();
  const rhythm = {
    engine: loggedEngine,
    buildGrid: o.fast ? (s, opt = {}) => R.buildGrid(s, { tempo: 240, gapSec: 0.2, ...opt }) : R.buildGrid,
    createTapSession: R.createTapSession,
    offsetMs: 0,
  };
  const ctx = {
    song,
    container,
    mode,
    noBeat: !!o.noBeat,
    reduceMotion: !!o.reduceMotion,
    rhythm,
    signal: state.controller.signal,
    manifest,
    appearance: o.appearance ?? 'a',
  };
  if (state.host) ctx.three = { THREE, root: state.host.root, camera: state.host.camera };
  room.start(ctx).then(
    (r) => { state.result = r; state.settled = true; },
    (e) => { state.error = { name: e?.name, message: e?.message }; state.settled = true; },
  );
  return mode;
}

window.__r = {
  open,
  abort: () => state.controller?.abort(),
  state,
  plays,
  missing,
  events,
  engine,
  song,
  hostChildren: () => state.host?.root.children.length ?? null,
  hostCalls: () => state.host?.renderer.info.render.calls ?? null,
  assets: createAssets(manifest),
  ready: true,
};
