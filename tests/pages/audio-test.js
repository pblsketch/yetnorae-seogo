// 소리 엔진 점검 쪽의 스크립트. tests/check-rhythm.mjs가 window.__audioTest의 함수를 부른다.
// 소리 파일 대신 브라우저 안에서 무음·삑 소리 버퍼를 만들어 끼우고, 소리 판의 예약(start)과 멈춤(stop)을 기록한다.
import { createAudioEngine } from '../../js/core/audio.js';
import * as R from '../../js/core/rhythm.js';
import { on, emit } from '../../js/core/events.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) {
  const t0 = performance.now();
  while (!fn()) { if (performance.now() - t0 > ms) throw new Error('기다림 시간 초과'); await wait(10); }
}

// 형식만 갖춘 가짜 시조(빠르기 240 → 박 0.25초)
const feet = (n) => Array.from({ length: n }, (_, i) => ({ original: '가' + i, reading: '가' + i }));
const song = { id: 't-sijo', genre: 'sijo', tempo: 240, units: [0, 1, 2].map(() => ({ feet: feet(4), gloss: 'ㄱ' })) };
const grid = R.buildGrid(song, { gapSec: 0.3 });

// 없는 파일로 칠 경로
const MISSING = new Set(['assets/audio/voice/t-sijo/1-2.mp3', 'assets/audio/sfx/fog.mp3']);

const names = new WeakMap();
const log = [];               // 예약된 소리: { name, when, stopped, loop }
let factoryCalls = 0;
let ctx = null;
let engine = null;

function nameOf(buf) {
  if (names.has(buf)) return names.get(buf);
  for (const [k, v] of engine.debug().synth) if (v === buf) return k;
  return '?';
}

// 소리 판을 만들되 버퍼 소리의 예약과 멈춤을 기록한다
function factory() {
  factoryCalls++;
  const c = new AudioContext();
  const orig = c.createBufferSource.bind(c);
  c.createBufferSource = () => {
    const s = orig();
    const rec = { name: null, when: null, stopped: false, loop: false };
    const start = s.start.bind(s);
    s.start = (when = 0, ...rest) => { rec.when = when; rec.name = nameOf(s.buffer); rec.loop = s.loop; log.push(rec); return start(when, ...rest); };
    const stop = s.stop.bind(s);
    s.stop = (...a) => { rec.stopped = true; return stop(...a); };
    return s;
  };
  ctx = c;
  return c;
}

// 파일 대신 버퍼를 만든다: 낭송 조각은 0.1초 삑, 배경음은 1초 무음, 효과음은 0.05초 삑
async function loader(path, c) {
  if (MISSING.has(path)) throw new Error('없는 파일');
  let name;
  let dur;
  let freq;
  if (path.startsWith('assets/audio/voice/')) { name = path.slice('assets/audio/voice/'.length).replace(/\.mp3$/, ''); dur = 0.1; freq = 440; }
  else if (path.startsWith('assets/audio/bgm/')) { name = 'bgm:' + path.slice('assets/audio/bgm/'.length).replace(/\.mp3$/, ''); dur = 1; freq = 0; }
  else { name = 'sfx:' + path.slice('assets/audio/sfx/'.length).replace(/\.mp3$/, ''); dur = 0.05; freq = 660; }
  const n = Math.round(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  if (freq) { const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * freq * i / c.sampleRate) * 0.2; }
  names.set(buf, name);
  return buf;
}

const missing = [];
const noBeat = [];
on('audio:missing', (d) => missing.push(d.path));
on('rhythm:no-beat', (d) => noBeat.push(d));

engine = createAudioEngine({ createContext: factory, loadBuffer: loader });
engine.attachUnlock(document);

const isVoice = (r) => r.name && (r.name.startsWith('t-sijo/') || r.name === 'click');

window.__audioTest = {
  ready: true,
  engine,

  async beforeGesture() {
    let sfxThrew = false;
    try { engine.sfx('janggu'); engine.tap(); } catch { sfxThrew = true; }
    engine.playBgm('sijo');
    const r = await engine.play(grid).finished;
    return { factoryCalls, unlocked: engine.unlocked, sfxThrew, started: log.length, playLocked: r.completed === false && r.reason === 'locked' };
  },

  async afterGesture() {
    await until(() => ctx && ctx.state === 'running' && log.some((r) => r.name && r.name.startsWith('bgm:')), 3000).catch(() => {});
    const bgm = log.find((r) => r.name && r.name.startsWith('bgm:'));
    return { factoryCalls, ctxState: ctx?.state, bgmLoop: !!bgm?.loop, bgmName: bgm?.name };
  },

  async schedulingCase() {
    const from = log.length;
    const t0 = ctx.currentTime;
    const h = engine.play(grid, [0, 1]);
    // 벽시계가 아니라 소리 판 시계로 기다린다(줄이기는 소리 판 시각으로 움직인다)
    await until(() => ctx.currentTime > t0 + 0.45);
    const duckTargetDuring = engine.debug().duckTarget;
    const duckValueDuring = engine.debug().nodes.duck.gain.value;
    const r = await h.finished;
    const t1 = ctx.currentTime;
    await until(() => ctx.currentTime > t1 + 0.4);
    const recs = log.slice(from).filter(isVoice);
    const whens = recs.map((x) => x.when);
    const expected = [0, 1].flatMap((u) => [0, 1, 2, 3].map((f) => (u === 1 && f === 2 ? 'click' : 't-sijo/' + u + '-' + f)));
    return {
      count: recs.length,
      names: recs.map((x) => x.name),
      expected,
      withinSegment: [1, 2, 3, 5, 6, 7].map((i) => whens[i] - whens[i - 1]),
      segmentGap: whens[4] - whens[0],
      missing: missing.slice(),
      duckTargetDuring, duckValueDuring,
      duckTargetAfter: engine.debug().duckTarget,
      duckValueAfter: engine.debug().nodes.duck.gain.value,
      completed: r.completed,
    };
  },

  async pauseCase() {
    const session = R.createTapSession(grid, {});
    const starts = [];
    const restarts = [];
    const from = log.length;
    const h = engine.play(grid, [0, 1, 2], { judge: session, onSegmentStart: (d) => starts.push(d), onRestart: (d) => restarts.push(d.segment) });
    await until(() => { const s1 = starts.find((s) => s.segment === 1); return s1 && ctx.currentTime > s1.at + 0.3; });
    const pauseAt = ctx.currentTime;
    emit('orientation:pause', {});
    await wait(250);
    const pausedState = ctx.state;
    const enginePaused = engine.paused;
    const before = log.slice(from).filter(isVoice);
    const stoppedFuture = before.filter((r) => r.when >= pauseAt).length > 0 && before.filter((r) => r.when >= pauseAt).every((r) => r.stopped);
    const tapWhilePaused = engine.tap();
    const judgeWhilePaused = session.tap(ctx.currentTime).hit;
    const mark = log.length;
    emit('orientation:resume', {});
    await until(() => starts.filter((s) => s.segment === 1).length >= 2);
    const s1 = starts.filter((s) => s.segment === 1)[1];
    const re = session.tap(s1.at + 2 * 0.25 + 0.01);
    const rearmedHit = re.hit === true && re.segment === 1 && re.foot === 2;
    const r = await h.finished;
    const after = log.slice(mark).filter(isVoice);
    const s2 = starts.filter((s) => s.segment === 2).pop();
    [0, 1, 2, 3].forEach((k) => session.tap(s2.at + k * 0.25));
    const closed = session.close(2);
    return {
      pausedState, enginePaused, stoppedFuture, tapWhilePaused, judgeWhilePaused,
      restartSegment: restarts[0],
      afterResume: after.map((x) => x.name),
      resumeStartOk: after.length > 0 && after[0].when > pauseAt && Math.abs(after[0].when - s1.at) < 1e-6,
      rearmedHit,
      completed: r.completed,
      closedOk: closed.ok === true && closed.segment === 2,
    };
  },

  async miscCase() {
    noBeat.length = 0;
    engine.setMuted(true);
    const masterMuted = engine.debug().nodes.master.gain.value;
    engine.setMuted(false);
    const masterOn = engine.debug().nodes.master.gain.value;
    engine.setSlashMode(true);
    engine.setSlashMode(true); // 같은 값은 다시 알리지 않는다
    engine.setSlashMode(false);
    const vol = engine.getVolume();
    engine.setVolume('bgm', 0.25);
    const volSet = engine.getVolume().bgm;
    engine.setVolume('voice', 3);
    const volClamped = engine.getVolume().voice;
    engine.setVolume('bgm', 0.6);
    engine.setVolume('voice', 1);

    let from = log.length;
    const tapTime = engine.tap();
    await wait(150);
    const tapSound = log.slice(from).map((r) => r.name).pop();

    from = log.length;
    const cal = await engine.playCalibration({ count: 8, intervalSec: 0.2 }).finished;
    const bellSound = log.slice(from).map((r) => r.name)[0];

    engine.sfx('fog');
    await wait(150);
    const sfxMissing = missing.includes('assets/audio/sfx/fog.mp3');

    // 실제 서버의 없는 파일(404): 기본 불러오기로 시험한다
    const e2 = createAudioEngine({ createContext: () => new AudioContext(), baseUrl: location.origin + '/' });
    e2.unlock();
    const ghost = { id: 'no-such-song', genre: 'sijo', tempo: 240, units: [{ feet: feet(2), gloss: 'ㄱ' }] };
    const r2 = await e2.play(R.buildGrid(ghost, { gapSec: 0.1 })).finished;
    const fetch404Missing = missing.includes('assets/audio/voice/no-such-song/0-0.mp3');
    e2.dispose();

    return {
      noBeat: noBeat.slice(), masterMuted, masterOn, vol, volSet, volClamped,
      tapTime, tapSound, bells: cal.bells, bellSound, sfxMissing,
      fetch404Missing, fetch404Completed: r2.completed === true,
    };
  },
};
