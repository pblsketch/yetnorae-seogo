// 점검 페이지: 세계 바탕(자리표시 관 모형)과 소리 엔진을 띄우고, 실제 노래로 재기 화면을 연다.
// 점검 도구가 들여다볼 손잡이를 window.__m에 둔다. 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
//
// - 낭송 조각 파일은 아직 없으므로, 소리 엔진의 불러오기는 낭송 조각을 '없는 파일'로 돌려준다(엔진은 딸깍 소리로 대신한다).
//   효과음·배경음은 짧은 무음 버퍼로 대신한다. 그래서 파일 요청이 없고 콘솔 오류도 없다.
// - 박자 칸은 빨리 돌도록 빠르기 240, 단위 사이 쉼 0.2초로 만든다(ctx.rhythm.buildGrid를 바꿔 끼운다).
// - 자동 두드리기: 엔진이 박을 낼 때(onBeat) 장구 버튼에 pointerdown을 보낸다. skip만큼 앞 박을 일부러 놓친다.
import * as world from '../../js/world/world.js';
import * as events from '../../js/core/events.js';
import * as R from '../../js/core/rhythm.js';
import { createAudioEngine } from '../../js/core/audio.js';
import { songs, notebook } from '../../js/data/songs/index.js';
import * as fixture from './wing-fixture.js';
import { openMeasure } from '../../js/measure/measure.js';

const log = [];
for (const name of [...world.DIORAMA_EVENTS, 'audio:missing', 'rhythm:no-beat']) {
  events.on(name, (detail) => log.push({ name, detail }));
}

world.mount(document.getElementById('app'), {
  wings: { hyangga: fixture, goryeo: fixture, sijo: fixture, gasa: fixture, saseol: fixture },
  appearance: 'a',
});

const engine = createAudioEngine({
  loadBuffer: async (path, c) => {
    if (path.startsWith('assets/audio/voice/')) throw new Error('낭송 조각 없음(점검)');
    return c.createBuffer(1, Math.max(1, Math.round(c.sampleRate * 0.03)), c.sampleRate);
  },
});
engine.attachUnlock(document);

const auto = { enabled: true, skip: 0, plays: [] };

function drumTap() {
  const drum = document.querySelector('.measure .m-drum');
  if (drum) drum.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }));
}

const wrappedEngine = new Proxy(engine, {
  get(target, key) {
    if (key === 'play') {
      return (grid, segs, opts = {}) => {
        auto.plays.push((segs ?? grid.segments.map((s) => s.index)).slice());
        return target.play(grid, segs, {
          ...opts,
          onBeat: (b) => {
            opts.onBeat?.(b);
            if (!auto.enabled) return;
            if (auto.skip > 0) { auto.skip--; return; }
            drumTap();
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

const state = { result: null, error: null, introCalls: [], flags: null, controller: null, slashCalls: [] };

function open(o) {
  const song = songs.find((s) => s.id === o.songId);
  if (!song) throw new Error('노래 없음: ' + o.songId);
  state.result = null;
  state.error = null;
  state.introCalls = [];
  if (o.keepFlags !== true || !state.flags) state.flags = { ...(o.introSeen ?? { common: true, unique: true }) };
  state.controller = new AbortController();
  log.length = 0;
  fixture.calls.react.length = 0;
  auto.plays.length = 0;
  auto.enabled = o.autoTap !== false;
  auto.skip = o.skip ?? 0;
  engine.setMuted(!!o.muted);
  engine.setSlashMode(!!o.slash);
  if (o.wing && o.wing !== 'entrance') world.enterWing(o.wing);
  const flags = state.flags;
  const p = openMeasure({
    song,
    wing: o.wing,
    mode: o.mode ?? 'wing',
    world,
    rhythm,
    noBeat: o.noBeat,
    preMeasured: o.preMeasured,
    notebook,
    notebookGlow: o.notebookGlow,
    journal: o.journal,
    introSeen: flags,
    onIntroSeen: (kind) => { flags[kind] = true; state.introCalls.push(kind); },
    setSlashMode: (v) => { state.slashCalls.push(v); engine.setSlashMode(v); },
    signal: state.controller.signal,
  });
  p.then((r) => { state.result = r; }, (e) => { state.error = (e?.name ?? 'Error') + ': ' + (e?.message ?? e); });
  return true;
}

window.__m = { ready: true, world, events, engine, log, auto, state, open, fixture: fixture.calls, songIds: songs.map((s) => s.id) };
