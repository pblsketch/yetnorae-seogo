// 점검 페이지: 작품 방 「님이 오마 하거늘」을 실제 노래 데이터와 실제 소리 엔진으로 단독으로 띄운다.
// 점검 도구가 들여다볼 손잡이를 window.__r에 둔다. 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
//
// - 3D를 쓸 수 있으면 Three.js 그림판(장면·카메라·root)을 만들어 매 프레임 그린다. 3D를 끈 브라우저면 2D다.
// - 낭송 조각 파일은 아직 없으므로 소리 엔진의 불러오기가 낭송 조각을 '없는 파일'로 돌려준다(엔진은 딸깍 소리로 대신한다).
//   효과음은 짧은 무음 버퍼로 대신한다. 그래서 없는 파일 요청과 콘솔 오류가 없다.
// - 박자 칸은 빨리 돌도록 빠르기 240, 단위 사이 쉼 0.2초로 만든다(ctx.rhythm.buildGrid를 바꿔 끼운다).
// - 자동 두드리기(박자 방식 점검용): 엔진이 박을 낼 때(onBeat) 달리기 버튼에 pointerdown을 보낸다.
import * as THREE from 'three';
import * as events from '../../js/core/events.js';
import * as R from '../../js/core/rhythm.js';
import { createAudioEngine } from '../../js/core/audio.js';
import { songs } from '../../js/data/songs/index.js';
import { detectMode } from '../../js/world/mode.js';
import { createAssets } from '../../js/world/assets.js';
import * as room from '../../js/rooms/saseol.js';

const mode = detectMode();
const manifest = await fetch(new URL('../../assets/manifest.json', import.meta.url)).then((r) => r.json());
const container = document.getElementById('room');

// ── 3D 그림판 ──
let three = null;
let renderer = null;
const frame = { calls: 0, maxCalls: 0, frames: 0 };
if (mode === '3d') {
  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  document.getElementById('stage').append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 1, 0);
  const root = new THREE.Group();
  scene.add(root);
  three = { THREE, root, camera, scene };
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  const loop = () => {
    renderer.render(scene, camera);
    frame.calls = renderer.info.render.calls;
    frame.maxCalls = Math.max(frame.maxCalls, frame.calls);
    frame.frames++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ── 소리 엔진 ──
const engine = createAudioEngine({
  loadBuffer: async (path, c) => {
    if (path.startsWith('assets/audio/voice/')) throw new Error('낭송 조각 없음(점검)');
    return c.createBuffer(1, Math.max(1, Math.round(c.sampleRate * 0.03)), c.sampleRate);
  },
});
engine.attachUnlock(document);

const missing = [];
events.on('audio:missing', (d) => missing.push(d));

const auto = { enabled: false, skip: 0, plays: [], beats: 0 };
function runTap() {
  const b = document.querySelector('.rs-room .rs-run');
  if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }));
}
const wrappedEngine = new Proxy(engine, {
  get(target, key) {
    if (key === 'play') {
      return (grid, segs, opts = {}) => {
        const list = segs ?? grid.segments.map((s) => s.index);
        auto.plays.push(list.flatMap((i) => grid.segments[i].beats.map((bi) => ({ unit: grid.beats[bi].unit, foot: grid.beats[bi].foot }))));
        return target.play(grid, segs, {
          ...opts,
          onBeat: (b) => {
            opts.onBeat?.(b);
            auto.beats++;
            if (!auto.enabled) return;
            if (auto.skip > 0) { auto.skip--; return; }
            runTap();
          },
        });
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

const assets = createAssets(manifest, mode === '3d' ? THREE : null);
const state = { result: null, error: null, controller: null, running: false, starts: 0 };

function start(o = {}) {
  let song = songs.find((s) => s.id === 'nimi-oma');
  if (o.dropReversal) {
    song = JSON.parse(JSON.stringify(song));
    delete song.units[1].reversal;
  }
  state.result = null;
  state.error = null;
  state.running = true;
  state.starts++;
  state.controller = new AbortController();
  if (o.preAbort) state.controller.abort();
  auto.enabled = !!o.autoTap;
  auto.skip = o.skip ?? 0;
  auto.plays.length = 0;
  auto.beats = 0;
  engine.setMuted(!!o.muted);
  engine.setSlashMode(!!o.slash);
  document.documentElement.style.setProperty('--text-scale', String(o.textScale ?? 1));
  document.getElementById('app').classList.toggle('reduce-motion', !!o.reduceMotion);
  const p = room.start({
    song,
    container,
    mode,
    three: three ? { THREE, root: three.root, camera: three.camera } : undefined,
    noBeat: engine.noBeat.value,
    reduceMotion: () => !!o.reduceMotion,
    rhythm,
    signal: state.controller.signal,
    assets,
    appearance: o.appearance ?? 'a',
  });
  p.then(
    (r) => { state.result = r; state.running = false; },
    (e) => { state.error = { name: e?.name ?? 'Error', message: String(e?.message ?? e) }; state.running = false; },
  );
  return true;
}

// 3D 장면 안의 이름 붙은 물체 상태(점검용)
function sceneInfo() {
  if (!three) return null;
  const named = {};
  three.root.traverse((o) => {
    if (!o.name) return;
    named[o.name] = { visible: o.visible, opacity: o.material?.opacity ?? null, color: o.material?.color?.getHexString?.() ?? null, x: o.position.x, z: o.position.z };
  });
  return { children: three.root.children.length, named, camera: three.camera.position.toArray(), calls: frame.calls, maxCalls: frame.maxCalls, frames: frame.frames };
}

window.__r = {
  ready: true,
  mode,
  engine,
  events,
  auto,
  state,
  missing,
  start,
  abort: () => state.controller?.abort(),
  sceneInfo,
  resetCalls: () => { frame.maxCalls = 0; },
  cameraStart: three ? three.camera.position.toArray() : null,
};
