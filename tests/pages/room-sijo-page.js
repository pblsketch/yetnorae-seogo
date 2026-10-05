// 점검 페이지: 실제 노래 데이터와 실제 소리 엔진으로 작품 방 「십 년을 경영하야」만 띄운다.
// 점검 도구가 들여다볼 손잡이를 window.__r에 둔다. 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
//
// - 낭송 조각 파일은 아직 없으므로 소리 엔진의 불러오기는 낭송 조각을 '없는 파일'로 돌려준다(엔진은 딸깍 소리로 대신한다).
//   효과음은 짧은 무음 버퍼로 대신한다. 그래서 파일 요청이 없고 콘솔 오류도 없다.
// - 박자 칸은 빨리 돌도록 빠르기 240, 단위 사이 쉼 0.2초로 만든다(ctx.rhythm.buildGrid를 바꿔 끼운다).
// - 3D 그림판을 들여다보려고 WebGLRenderer를 감싼 THREE를 ctx.three.THREE로 넘긴다(그린 카메라·장면·그리기 호출을 적어 둔다).
import * as THREE from 'three';
import * as R from '../../js/core/rhythm.js';
import { createAudioEngine } from '../../js/core/audio.js';
import { songs } from '../../js/data/songs/index.js';
import { detectMode } from '../../js/world/mode.js';
import * as room from '../../js/rooms/sijo.js';

const manifest = await fetch(new URL('../../assets/manifest.json', import.meta.url)).then((r) => r.json());

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
        plays.push((segs ?? grid.segments.map((s) => s.index)).map((i) => grid.segments[i].unit));
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
  offsetMs: 0,
};

// 그린 것을 적어 두는 렌더러
const seen = { renderer: null, camera: null, scene: null, frames: 0, calls: 0 };
// three의 render는 생성자 안에서 인스턴스에 붙는 함수라, 생성자에서 감싼다.
class ProbeRenderer extends THREE.WebGLRenderer {
  constructor(o) {
    super(o);
    seen.renderer = this;
    const render = this.render;
    this.render = (scene, camera) => {
      render.call(this, scene, camera);
      seen.scene = scene;
      seen.camera = camera;
      seen.frames++;
      seen.calls = this.info.render.calls;
    };
  }
}
const PROBE_THREE = { ...THREE, WebGLRenderer: ProbeRenderer };

const host = document.getElementById('host');
const state = { result: null, error: null, controller: null };

function start(o = {}) {
  const song = songs.find((s) => s.id === 'simnyeon-gyeongyeong');
  state.result = null;
  state.error = null;
  plays.length = 0;
  document.documentElement.style.setProperty('--text-scale', String(o.textScale ?? 1));
  engine.setMuted(!!o.muted);
  const mode = o.mode ?? detectMode();
  state.controller = new AbortController();
  const reduce = !!o.reduceMotion;
  room.start({
    song,
    container: host,
    mode,
    three: mode === '3d' ? { THREE: PROBE_THREE } : undefined,
    noBeat: !!o.noBeat,
    reduceMotion: () => reduce,
    rhythm,
    signal: state.controller.signal,
    manifest,
  }).then((r) => { state.result = r; }, (e) => { state.error = e?.name ?? String(e); });
}

function view3d() {
  const cam = seen.camera;
  if (!cam || !seen.scene) return null;
  const m = seen.scene.getObjectByName('sijo-room-mountains');
  const root = document.querySelector('.room-sijo');
  return {
    calls: seen.calls,
    camera: { x: cam.position.x, y: cam.position.y, z: cam.position.z, dist: cam.position.length() },
    mountains: m?.count ?? 0,
    mountainsUp: !!m && m.visible && (m.userData.rise ?? 0) > 0.99,
    settled: root?.dataset.settled === 'true',
  };
}

window.__r = {
  ready: true,
  start,
  abort: () => state.controller?.abort(),
  state,
  plays,
  mode: () => detectMode(),
  view3d,
  frames: () => seen.frames,
};
