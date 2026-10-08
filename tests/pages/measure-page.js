// 점검 페이지: 세계 바탕(자리표시 관 모형)과 소리 엔진을 띄우고, 실제 노래로 재기 화면을 연다.
// 점검 도구가 들여다볼 손잡이를 window.__m에 둔다. 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
//
// - 낭송 조각 파일은 아직 없으므로, 소리 엔진의 불러오기는 낭송 조각을 '없는 파일'로 돌려준다(엔진은 딸깍 소리로 대신한다).
//   효과음·배경음은 짧은 무음 버퍼로 대신한다. 그래서 파일 요청이 없고 콘솔 오류도 없다.
// - 박자 칸은 빨리 돌도록 빠르기 240, 단위 사이 쉼 0.2초로 만든다(ctx.rhythm.buildGrid를 바꿔 끼운다).
//   두드리기의 쉼 칸은 쉼 0.4초로 만든다(ctx.rhythm.buildPauseGrid).
// - 자동 두드리기: 엔진이 음보 조각을 낼 때(onBeat) 그 조각이 끝난 뒤 쉼 가운데쯤 장구 버튼에 pointerdown을 보낸다
//   (쉼에 두드리기). skip만큼 앞 음보를 일부러 놓친다.
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

// 쉼에 두드리기 점검용: 이 노래만 낭송 조각이 있는 것으로 둔다(0.6초 무음). 조각을 읽는 동안이 판정 창 밖이 되게
// (딸깍 소리 0.03초는 판정 창이 조각 끝 150ms 앞에서 열리므로 '읽는 동안'이 없다)
const VOICED = { 'imomi-jukgo': 0.6 };
const engine = createAudioEngine({
  loadBuffer: async (path, c) => {
    if (path.startsWith('assets/audio/voice/')) {
      const id = path.split('/')[3];
      if (!(id in VOICED)) throw new Error('낭송 조각 없음(점검)');
      return c.createBuffer(1, Math.round(c.sampleRate * VOICED[id]), c.sampleRate);
    }
    return c.createBuffer(1, Math.max(1, Math.round(c.sampleRate * 0.03)), c.sampleRate);
  },
});
engine.attachUnlock(document);

// 쉼 칸의 쉼(빠른 점검용)과 조각 끝에서 치기까지의 시간(쉼 가운데쯤)
const PAUSE_SEC = 0.4;
const TAP_AFTER_CLIP_SEC = 0.16;

// skipOffbeat: 고려가요 여음·후렴 칸(박자 칸의 offbeat)은 치지 않는다(학생처럼 박에만 친다)
// grids: 낸 박자 칸의 모양(낭송 조각이 있는지, 효과음 박, 박 수) — 걷기가 낭송 대신 장구를 내는지 본다
// tapAt: 'pause'(쉼에 친다, 기본) | 'onset'(음보가 울리기 시작할 때 친다: 예전 방식, 음성 사례)
// earlyTap: 첫 음보가 울리기 시작하자마자 한 번 더 친다(읽는 동안의 탭). 그 직후 안내 글을 earlyHint에 적는다
// slashCounts: 쉼에 칠 때마다 그 직후 두루마리의 빗금 수
const auto = { enabled: true, skip: 0, skipOffbeat: false, tapAt: 'pause', earlyTap: false, earlyHint: null, slashCounts: [], plays: [], grids: [], beats: 0, ends: [] };

function drumTap() {
  const drum = document.querySelector('.measure .m-drum');
  if (drum) drum.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }));
}

const wrappedEngine = new Proxy(engine, {
  get(target, key) {
    if (key === 'play') {
      return (grid, segs, opts = {}) => {
        auto.plays.push((segs ?? grid.segments.map((s) => s.index)).slice());
        auto.grids.push({ voice: grid.beats.some((b) => !!b.path), sounds: [...new Set(grid.beats.map((b) => b.sound).filter(Boolean))], beats: grid.beats.length, countIn: !!opts.countIn });
        const h = target.play(grid, segs, {
          ...opts,
          onBeat: (b) => {
            auto.beats++;
            opts.onBeat?.(b);
            if (!auto.enabled) return;
            if (auto.skipOffbeat && grid.beats[b.beat]?.offbeat) return;
            if (auto.skip > 0) { auto.skip--; return; }
            // 쉼 칸(두드리기): 학생처럼 음보 조각이 끝난 뒤 쉬는 사이에 친다. 박자 칸(걷기 등)은 박에 친다
            if (typeof b.clipEnd === 'number' && auto.tapAt === 'pause') {
              if (auto.earlyTap && auto.earlyHint === null) {
                drumTap();
                auto.earlyHint = document.querySelector('.measure .m-hint')?.textContent ?? '';
              }
              const wait = Math.max(0, (b.clipEnd + TAP_AFTER_CLIP_SEC - (target.now() ?? 0)) * 1000);
              // 그사이 점검이 자동 치기를 껐으면(멈춤·빗금 바꿈 점검) 예약해 둔 탭도 치지 않는다
              setTimeout(() => { if (!auto.enabled) return; drumTap(); auto.slashCounts.push(document.querySelectorAll('.measure .m-text .m-word.has-slash').length); }, wait);
            } else drumTap();
          },
        });
        Promise.resolve(h?.finished).then((r) => auto.ends.push(r ?? 'done'), () => auto.ends.push('error'));
        return h;
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
  // 두드리기(쉼 칸)도 빨리 돌도록 쉼 0.4초, '준비' 뒤 0.3초로 만든다
  buildPauseGrid: (song, o = {}) => R.buildPauseGrid(song, { pauseSec: PAUSE_SEC, readySec: 0.3, ...o }),
  createPauseTapSession: R.createPauseTapSession,
  offsetMs: 0,
};

const state = { result: null, error: null, introCalls: [], flags: null, controller: null, slashCalls: [], decideCalls: [] };

function open(o) {
  const song = songs.find((s) => s.id === o.songId);
  if (!song) throw new Error('노래 없음: ' + o.songId);
  state.result = null;
  state.error = null;
  state.introCalls = [];
  state.decideCalls = [];
  if (o.keepFlags !== true || !state.flags) state.flags = { ...(o.introSeen ?? { common: true, unique: true }) };
  state.controller = new AbortController();
  log.length = 0;
  fixture.calls.react.length = 0;
  auto.plays.length = 0;
  auto.grids.length = 0;
  auto.beats = 0;
  auto.ends.length = 0;
  auto.enabled = o.autoTap !== false;
  auto.skip = o.skip ?? 0;
  auto.skipOffbeat = !!o.skipOffbeat;
  auto.tapAt = o.tapAt ?? 'pause';
  auto.earlyTap = !!o.earlyTap;
  auto.earlyHint = null;
  auto.slashCounts.length = 0;
  auto.plays.length = 0;
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
    revealed: o.revealed,
    marksKnown: o.marksKnown,
    notebook,
    notebookGlow: o.notebookGlow,
    journal: o.journal,
    introSeen: flags,
    onIntroSeen: (kind) => { flags[kind] = true; state.introCalls.push(kind); },
    setSlashMode: (v) => { state.slashCalls.push(v); engine.setSlashMode(v); },
    signal: state.controller.signal,
    canQuit: o.canQuit,
    // ④ 갈래 판별: o.decide면 점검용 판별(노래 갈래와 같으면 맞음)을 넘긴다. 부른 갈래를 decideCalls에 남긴다
    decide: o.decide ? async (genre) => { state.decideCalls.push(genre); return { correct: genre === song.genre, note: o.decideNote }; } : undefined,
    decideGuide: o.decideGuide,
  });
  p.then((r) => { state.result = r; }, (e) => { state.error = (e?.name ?? 'Error') + ': ' + (e?.message ?? e); });
  return true;
}

window.__m = { ready: true, world, events, engine, log, auto, state, open, fixture: fixture.calls, songIds: songs.map((s) => s.id) };
