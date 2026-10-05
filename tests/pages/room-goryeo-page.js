// 점검 페이지: 작품 방 「정석가」를 홀로 띄운다. 3D를 쓸 수 있으면 Three.js 장면을 이 페이지가 직접 만들어 그리고,
// 3D를 끈 브라우저면 2D 그림 판으로 연다. 점검 도구가 들여다볼 손잡이를 window.__r에 둔다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
//
// - 낭송 조각 파일은 '없는 파일'로 돌려준다(엔진은 딸깍 소리로 대신한다). 효과음·배경음은 짧은 무음 버퍼다.
// - 소리 엔진의 play를 감싸 어떤 노래의 어느 단위를 낭송했는지 적어 둔다.
import * as THREE from 'three';
import * as events from '../../js/core/events.js';
import * as R from '../../js/core/rhythm.js';
import { createAudioEngine } from '../../js/core/audio.js';
import { songs } from '../../js/data/songs/index.js';
import { detectMode } from '../../js/world/mode.js';
import { start } from '../../js/rooms/goryeo.js';

const mode = detectMode();
const sceneEl = document.getElementById('scene');
const roomEl = document.getElementById('room');
const manifest = await fetch(new URL('../../assets/manifest.json', import.meta.url)).then((r) => r.json());

// ── 3D: 이 페이지가 그리는 판(제품에서는 세계 바탕이 그린다) ──
let three = null;
let renderer = null;
let scene = null;
let lastCalls = 0;
let maxCalls = 0;
if (mode === '3d') {
  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  sceneEl.append(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#2b2b2b');
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 0, 0);
  const root = new THREE.Group();
  scene.add(root);
  const resize = () => {
    const w = sceneEl.clientWidth || innerWidth;
    const h = sceneEl.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);
  const loop = () => {
    renderer.render(scene, camera);
    lastCalls = renderer.info.render.calls;
    maxCalls = Math.max(maxCalls, lastCalls);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  three = { THREE, root, camera };
}

// ── 소리 ──
const engine = createAudioEngine({
  loadBuffer: async (path, c) => {
    if (path.startsWith('assets/audio/voice/')) throw new Error('낭송 조각 없음(점검)');
    return c.createBuffer(1, Math.max(1, Math.round(c.sampleRate * 0.03)), c.sampleRate);
  },
});
engine.attachUnlock(document);

const plays = [];
const wrappedEngine = new Proxy(engine, {
  get(target, key) {
    if (key === 'play') {
      return (grid, segs, opts = {}) => {
        const list = segs ?? grid.segments.map((s) => s.index);
        plays.push({ songId: grid.songId, units: [...new Set(list.map((i) => grid.segments[i].unit))], lines: list.map((i) => grid.segments[i].line) });
        return target.play(grid, segs, opts);
      };
    }
    const v = target[key];
    return typeof v === 'function' ? v.bind(target) : v;
  },
});
const rhythm = {
  engine: wrappedEngine,
  buildGrid: (song, o = {}) => R.buildGrid(song, { tempo: 240, gapSec: 0.2, ...o }),
  createTapSession: R.createTapSession,
  offsetMs: 0,
};

const log = [];
for (const name of ['audio:missing', 'rhythm:no-beat']) events.on(name, (detail) => log.push({ name, detail }));

const state = { result: null, error: null, controller: null, runs: 0 };

// o: { muted, slash, reduceMotion, preAbort }
function open(o = {}) {
  state.result = null;
  state.error = null;
  state.runs++;
  plays.length = 0;
  maxCalls = 0;
  engine.setMuted(!!o.muted);
  engine.setSlashMode(!!o.slash);
  state.controller = new AbortController();
  if (o.preAbort) state.controller.abort();
  const song = songs.find((s) => s.id === 'jeongseokga');
  const p = start({
    song,
    container: roomEl,
    mode,
    three: mode === '3d' ? three : undefined,
    noBeat: engine.noBeat.value,
    reduceMotion: () => !!o.reduceMotion,
    rhythm,
    signal: state.controller.signal,
    manifest,
  });
  p.then((r) => { state.result = r; }, (e) => { state.error = (e?.name ?? 'Error') + ': ' + (e?.message ?? e); });
  return true;
}

function abort() { state.controller?.abort(); }

function threeInfo() {
  if (!three) return null;
  let meshes = 0;
  const names = [];
  three.root.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh || o.isSprite || o.isLine) meshes++;
    if (o.name && o.visible) names.push(o.name);
  });
  return {
    names,
    rootChildren: three.root.children.length,
    meshes,
    lastCalls,
    maxCalls,
    camera: three.camera.position.toArray().map((v) => Math.round(v * 1000) / 1000),
  };
}

window.__r = { ready: true, mode, open, abort, state, plays, log, engine, threeInfo, songs };
