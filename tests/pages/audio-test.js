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

// ── 가짜 소리 판: 손가락 기기의 '사용자 활성화' 규칙과 시계를 손으로 움직인다 ──
// resume()은 활성화 안(gate.active)에서만 돈다. 시각(currentTime)은 점검이 정하고, 재생 진행(tick)도 점검이 부른다.
const gate = { active: false };
class FakeParam { constructor(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
class FakeCtx extends EventTarget {
  constructor(state = 'suspended') {
    super();
    this.state = state;
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.destination = { connect() {} };
    this.starts = [];
    this.resumeCalls = 0;
  }
  setState(s) { if (this.state === s) return; this.state = s; this.dispatchEvent(new Event('statechange')); }
  resume() {
    this.resumeCalls++;
    if (!gate.active) return Promise.reject(new DOMException('사용자 활성화가 없다', 'NotAllowedError'));
    this.setState('running');
    return Promise.resolve();
  }
  suspend() { this.setState('suspended'); return Promise.resolve(); }
  close() { this.setState('closed'); return Promise.resolve(); }
  createGain() { return { gain: new FakeParam(1), connect() {}, disconnect() {} }; }
  createBuffer(ch, n, sr) { return { duration: n / sr, length: n, numberOfChannels: ch, sampleRate: sr, getChannelData: () => new Float32Array(n) }; }
  createBufferSource() {
    const c = this;
    const rec = { name: null, when: null, stopped: false };
    return {
      buffer: null, loop: false, connect() {}, disconnect() {},
      start(when = 0) { rec.when = when; rec.name = c.names.get(this.buffer) ?? 'synth'; rec.buf = this.buffer; c.starts.push(rec); },
      stop() { rec.stopped = true; },
    };
  }
}

// 가짜 소리 판 엔진 하나: 사건 버스와 재생 진행을 따로 둔다(다른 점검의 소리 엔진과 섞이지 않게)
// durOf(path) → 그 파일 소리의 길이(초). null이면 없는 파일. 주지 않으면 아주 짧은 소리(10표본)
function fakeEngine(initialState = 'suspended', durOf = null) {
  let tickFn = null;
  let c = null;
  const names = new WeakMap();
  const e = createAudioEngine({
    createContext: () => { c = new FakeCtx(initialState); c.names = names; return c; },
    loadBuffer: async (path, cx) => {
      const d = durOf ? durOf(path) : 10 / 8000;
      if (d === null) throw new Error('없는 파일');
      const b = cx.createBuffer(1, Math.max(1, Math.round(d * 8000)), 8000);
      names.set(b, path.replace(/^assets\/audio\//, '').replace(/\.mp3$/, ''));
      return b;
    },
    bus: { on: () => () => {}, emit: () => {} },
    timers: { setInterval: (fn) => { tickFn = fn; return 1; }, clearInterval: () => { tickFn = null; } },
  });
  // 시각을 옮기며 재생 진행을 부른다
  const advance = (to, step = 0.02) => { while (c.currentTime < to - 1e-9) { c.currentTime = Math.min(to, c.currentTime + step); tickFn?.(); } };
  return { e, ctx: () => c, advance, tick: () => tickFn?.() };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await wait(0); };

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

  // 손가락 기기에서 소리 판 열기: 손가락 pointerdown은 활성화가 아니고, 돌 때까지 조작을 기다린다
  async unlockCase() {
    const pad = document.createElement('div');
    document.body.append(pad);
    const fire = (el, type, init, active) => { gate.active = active; el.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init })); gate.active = false; };
    const out = {};
    const { e, ctx, advance } = fakeEngine('suspended');
    const detach = e.attachUnlock(pad);
    fire(pad, 'pointerdown', { pointerType: 'touch' }, false);
    await flush();
    out.afterTouchDown = { made: !!ctx(), unlocked: e.unlocked };
    // 활성화 밖의 누르기: 소리 판은 생기지만 돌지 못한다 → 열린 것으로 보지 않고 계속 기다린다
    fire(pad, 'click', {}, false);
    await flush();
    out.afterFailed = { state: ctx()?.state, unlocked: e.unlocked, resumeCalls: ctx()?.resumeCalls };
    // 그동안 낸 낭송은 소리 판이 돌 때까지 예약하지 않고 기다린다
    const g = R.buildGrid(song, { gapSec: 0.3 });
    const h = e.play(g, [0], {});
    let done = null;
    h.finished.then((r) => { done = r; });
    await flush();
    out.voiceWhileSuspended = ctx().starts.filter((s) => s.name.startsWith('voice/')).length;
    // 손가락 pointerup(활성화): 소리 판이 돌고, 기다리던 낭송을 낸다
    fire(pad, 'pointerup', { pointerType: 'touch' }, true);
    await flush();
    out.afterUp = { state: ctx().state, unlocked: e.unlocked, voice: ctx().starts.filter((s) => s.name.startsWith('voice/')).length };
    advance(ctx().currentTime + 2);
    await flush();
    out.playedAfterUnlock = done?.completed === true;
    // 돌기 시작하면 조작을 더 듣지 않는다
    let calls = ctx().resumeCalls;
    fire(pad, 'pointerup', { pointerType: 'touch' }, true);
    out.detachedAfterRunning = ctx().resumeCalls === calls;
    // 멈춤 까닭 없이 멈추면(interrupted) 다시 조작을 기다린다
    ctx().setState('interrupted');
    out.interruptedUnlocked = e.unlocked;
    fire(pad, 'pointerup', { pointerType: 'touch' }, true);
    await flush();
    out.afterInterrupt = { state: ctx().state, resumed: ctx().resumeCalls > calls };
    // 메뉴로 멈춘 동안: 조작이 소리 판을 돌리지 않고, 열린 것으로 본다
    e.pause('menu');
    await flush();
    calls = ctx().resumeCalls;
    fire(pad, 'pointerup', { pointerType: 'touch' }, true);
    out.pausedNoResume = ctx().resumeCalls === calls && ctx().state === 'suspended';
    out.pausedUnlocked = e.unlocked;
    // 재개가 활성화 밖이라 실패하면 다음 조작을 기다린다
    e.resume('menu');
    await flush();
    out.resumeFailedWaits = ctx().state === 'suspended';
    fire(pad, 'pointerup', { pointerType: 'touch' }, true);
    await flush();
    out.resumedByTap = ctx().state === 'running';
    detach();
    e.dispose();
    // 마우스 pointerdown은 활성화다
    const pad2 = document.createElement('div');
    document.body.append(pad2);
    const m = fakeEngine('suspended');
    m.e.attachUnlock(pad2);
    fire(pad2, 'pointerdown', { pointerType: 'mouse' }, true);
    await flush();
    out.mouseDown = m.ctx()?.state === 'running' && m.e.unlocked === true;
    m.e.dispose();
    // 음성 사례: 예전 방식(첫 조작 하나에 떼어 내고, 소리 판만 있으면 열린 것으로 봄)이면 손가락 기기에서 멈춘 채 남는다
    const pad3 = document.createElement('div');
    document.body.append(pad3);
    const o = fakeEngine('suspended');
    const kinds = ['pointerdown', 'keydown', 'touchend', 'mousedown'];
    const oldHandler = () => { o.e.unlock(); for (const k of kinds) pad3.removeEventListener(k, oldHandler, true); };
    for (const k of kinds) pad3.addEventListener(k, oldHandler, true);
    fire(pad3, 'pointerdown', { pointerType: 'touch' }, false);
    fire(pad3, 'pointerup', { pointerType: 'touch' }, true);
    await flush();
    out.oldStuck = { state: o.ctx()?.state, oldUnlocked: !!o.ctx() };
    o.e.dispose();
    pad.remove(); pad2.remove(); pad3.remove();
    return out;
  },

  // 단위가 끝난 직후(재생 진행이 그 끝을 보기 전) 멈춰도 친 박이 놓친 것으로 세어지지 않는다
  async pauseEndCase() {
    const { e, ctx } = fakeEngine('running');
    e.unlock();
    const g = R.buildGrid(song, { gapSec: 0.3 });
    const s = R.createTapSession(g, {});
    let armAt = null;
    let closed = null;
    const judge = { arm: (seg, at) => { armAt = at; s.arm(seg, at); }, disarm: (seg) => s.disarm(seg) };
    const h = e.play(g, [0], { judge, onSegmentEnd: ({ segment }) => { closed = s.close(segment); } });
    await flush();
    [0, 1, 2, 3].forEach((k) => s.tap(armAt + k * 0.25));
    ctx().currentTime = armAt + 4 * 0.25 + 0.005;
    e.pause('menu');
    const r = await Promise.race([h.finished, wait(100).then(() => ({ pending: true }))]);
    e.dispose();
    // 음성 사례: 끝을 내기 전에 회차를 닫아 버리면(예전) 친 박이 모두 놓친 것이 된다
    const s2 = R.createTapSession(g, {});
    s2.arm(0, 10);
    [0, 1, 2, 3].forEach((k) => s2.tap(10 + k * 0.25));
    s2.disarm(0);
    const old = s2.close(0);
    return { closedOk: closed?.ok === true && closed?.missed === 0, completed: r?.completed === true, oldMissed: old.missed };
  },

  // 박 알림(countIn): 새로 시작할 때 첫 박보다 min(박 길이, 1.5초) 앞에 장구 한 번(박 1초면 한 박 앞). 판정·onBeat 없음. 이어 내면 한 번뿐
  async countInCase() {
    const { e, ctx, advance } = fakeEngine('running');
    e.unlock();
    const g = R.buildGrid({ ...song, tempo: 60 }, { gapSec: 0.3 });   // 박 1초
    const s = R.createTapSession(g, { offsetMs: -300 });
    let armCall = null;
    let armAt = null;
    const judge = { arm: (seg, at) => { if (armCall === null) { armCall = ctx().currentTime; armAt = at; } s.arm(seg, at); }, disarm: (seg) => s.disarm(seg) };
    const beats = [];
    const segStarts = [];
    const t0 = ctx().currentTime;
    const h = e.play(g, [0, 1, 2], { judge, countIn: true, onBeat: (b) => beats.push(b.beat), onSegmentStart: (x) => segStarts.push(x.segment) });
    await flush();
    const first = ctx().starts.slice();
    const countIn = first.filter((x) => x.name === 'sfx/janggu');
    const firstVoice = first.find((x) => x.name.startsWith('voice/'));
    // 보정값 -300ms면 첫 박 판정 창은 박 앞 450ms부터다. 회차는 그보다 먼저 열려 있어야 한다
    const earlyHit = s.tap(armAt - 0.44).hit;
    advance(ctx().currentTime + 20);
    const r = await h.finished;
    const allCountIns = ctx().starts.filter((x) => x.name === 'sfx/janggu').length;
    // 멈췄다 재개하면 다시 박 알림
    const h2 = e.play(g, [0, 1], { countIn: true });
    await flush();
    advance(ctx().currentTime + 1.6);
    e.pause('menu');
    gate.active = true; e.resume('menu'); gate.active = false;
    await flush();
    advance(ctx().currentTime + 20);
    const r2 = await h2.finished;
    const afterResume = ctx().starts.filter((x) => x.name === 'sfx/janggu').length - allCountIns;
    e.dispose();
    return {
      countIns: countIn.length, allCountIns, countInAt: countIn[0]?.when - t0, firstVoiceAt: firstVoice ? firstVoice.when - t0 : null,
      beatSec: g.beatSec, lead: armAt - armCall, earlyHit, beats: beats.length, segStarts, completed: r.completed,
      afterResume, completed2: r2.completed,
    };
  },

  // 느린 노래(박 3.75초, 향가 빠르기 16): 박 알림은 첫 박보다 1.5초(COUNT_IN_MAX_SEC) 앞. 판정 회차는 그보다 먼저 열린다
  async countInSlowCase() {
    const { e, ctx, advance } = fakeEngine('running');
    e.unlock();
    const g = R.buildGrid({ id: 't-slow', genre: 'hyangga', tempo: 16, units: [{ original: '가', reading: '가', gloss: 'ㄱ' }, { original: '나', reading: '나', gloss: 'ㄴ' }] }, { gapSec: 0.3 });
    let armCall = null;
    let armAt = null;
    const judge = { arm: (seg, at) => { if (armCall === null) { armCall = ctx().currentTime; armAt = at; } }, disarm: () => {} };
    const t0 = ctx().currentTime;
    const h = e.play(g, [0, 1], { judge, countIn: true });
    await flush();
    const countIn = ctx().starts.find((x) => x.name === 'sfx/janggu');
    advance(ctx().currentTime + 15);
    const r = await h.finished;
    e.dispose();
    return { beatSec: g.beatSec, countInAt: countIn ? countIn.when - t0 : null, firstAt: armAt - t0, gap: armAt - (countIn?.when ?? 0), armBeforeCountIn: armCall <= (countIn?.when ?? -1), completed: r.completed };
  },

  // 쉼에 두드리기 칸(rhythm.js buildPauseGrid): '준비' 딱 소리 → 1초 뒤 첫 음보 → 조각마다 실제 길이 + 쉼 1초.
  // 판정 회차는 단위 시각을 정할 때 시각표와 함께 열린다. 없는 조각은 딸깍 소리 길이로 셈한다. 멈췄다 재개하면 '준비'부터 다시
  async pauseGridCase() {
    const durs = { '0-0': 0.4, '0-1': 0.6, '0-2': 0.5, '0-3': 0.3, '1-1': null };
    const { e, ctx, advance } = fakeEngine('running', (p) => {
      const m = /t-sijo\/(\d-\d)\.mp3$/.exec(p);
      if (!m) return 0.05;
      return m[1] in durs ? durs[m[1]] : 0.5;
    });
    e.unlock();
    const g = R.buildPauseGrid(song);
    const s = R.createPauseTapSession(g, {});
    const arms = [];
    const judge = { arm: (seg, at, tm) => { arms.push({ seg, at, now: ctx().currentTime, beats: tm?.beats?.length ?? 0, firstOpen: tm ? tm.beats[0].clipEnd - 0.15 : null }); s.arm(seg, at, tm); }, disarm: (seg) => s.disarm(seg) };
    const beats = [];
    const closes = [];
    const t0 = ctx().currentTime;
    const h = e.play(g, [0, 1, 2], {
      judge,
      countIn: true,
      // 학생처럼 조각이 끝난 뒤 쉼 가운데(조각 끝 + 0.4초)에 친다
      onBeat: (b) => { beats.push(b); s.tap(b.clipEnd + 0.4); },
      onSegmentEnd: ({ segment }) => closes.push(s.close(segment)),
    });
    await flush();
    const tickBuf = e.debug().synth.get('tick');
    const first = ctx().starts.slice();
    const ready = first.filter((x) => x.buf === tickBuf);
    advance(ctx().currentTime + 40);
    const r = await h.finished;
    const voices = ctx().starts.filter((x) => x.name.startsWith('voice/'));
    const clickBuf = e.debug().synth.get('click');
    const clicks = ctx().starts.filter((x) => x.buf && x.buf === clickBuf);
    // 멈췄다 재개: '준비'부터 다시, 진행 중이던 단위를 새 시각에 다시 연다
    const arms2 = [];
    const restarts = [];
    const s2 = R.createPauseTapSession(g, {});
    const h2 = e.play(g, [0, 1], { judge: { arm: (seg, at, tm) => { arms2.push({ seg, at }); s2.arm(seg, at, tm); }, disarm: (seg) => s2.disarm(seg) }, countIn: true, onRestart: (x) => restarts.push(x.segment) });
    await flush();
    const readyBefore = ctx().starts.filter((x) => x.buf === tickBuf).length;
    advance(ctx().currentTime + 2.0);
    e.pause('menu');
    gate.active = true; e.resume('menu'); gate.active = false;
    await flush();
    const readyAfter = ctx().starts.filter((x) => x.buf === tickBuf).length;
    advance(ctx().currentTime + 40);
    const r2 = await h2.finished;
    e.dispose();
    return {
      ready: ready.map((x) => x.when - t0),
      voiceWhen: voices.slice(0, 9).map((x) => +(x.when - t0).toFixed(4)),
      voiceNames: voices.slice(0, 9).map((x) => x.name),
      clickWhen: clicks.map((x) => +(x.when - t0).toFixed(4)),
      beat0: beats[0] ? { when: beats[0].when - t0, clipEnd: beats[0].clipEnd - t0, pauseEnd: beats[0].pauseEnd - t0 } : null,
      arms: arms.map((a) => ({ seg: a.seg, at: +(a.at - t0).toFixed(4), now: +(a.now - t0).toFixed(4), beats: a.beats, firstOpen: +(a.firstOpen - t0).toFixed(4) })),
      closes: closes.map((c) => ({ seg: c.segment, ok: c.ok, missed: c.missed })),
      completed: r.completed,
      restarts, readyBefore, readyAfter,
      rearmed: arms2.filter((a) => a.seg === 0).length,
      completed2: r2.completed,
    };
  },

  // 이어 내다가 단위 끝(onSegmentEnd)에서 멈추면 다음 단위를 내지 않는다(놓친 단위에서 멈추기)
  async stopOnEndCase() {
    const { e, ctx, advance } = fakeEngine('running');
    e.unlock();
    const g = R.buildGrid(song, { gapSec: 0.3 });
    const starts = [];
    let h = null;
    h = e.play(g, [0, 1, 2], { countIn: true, onSegmentStart: (x) => starts.push(x.segment), onSegmentEnd: (x) => { if (x.segment === 0) h.stop(); } });
    await flush();
    advance(ctx().currentTime + 6);
    const r = await h.finished;
    const later = ctx().starts.filter((x) => /^voice\/t-sijo\/[12]-/.test(x.name));
    e.dispose();
    return { starts, reason: r.reason, laterFed: later.length, laterStopped: later.every((v) => v.stopped) };
  },

  // 박자 보정 종소리를 멈췄다 재개하면 onRestart를 부른다(그 전의 탭을 버리게)
  async calibrationRestartCase() {
    const { e, ctx, advance } = fakeEngine('running');
    e.unlock();
    let restarts = 0;
    const cal = e.playCalibration({ count: 4, intervalSec: 0.2, onRestart: () => restarts++ });
    await flush();
    advance(ctx().currentTime + 0.3);
    e.pause('menu');
    gate.active = true; e.resume('menu'); gate.active = false;
    await flush();
    advance(ctx().currentTime + 2);
    const r = await cal.finished;
    e.dispose();
    return { restarts, completed: r.completed, bells: r.bells.length };
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
    const calBeats = [];
    const cal = await engine.playCalibration({ count: 8, intervalSec: 0.2, onBeat: (b) => calBeats.push(b) }).finished;
    const calLog = log.slice(from);
    const calNames = calLog.map((r) => r.name);
    const bellSound = calNames.find((n) => n !== 'tick');
    const firstBellAt = calLog.find((r) => r.name === 'sfx:bell')?.when ?? null;
    const countAt = calLog.filter((r) => r.name === 'tick').map((r) => r.when);

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
      tapTime, tapSound, bells: cal.bells, bellSound, sfxMissing, calNames, firstBellAt, countAt,
      calBeats: calBeats.map((b) => b.kind + (b.kind === 'count' ? b.n : b.index)),
      tickMissing: missing.includes('assets/audio/sfx/tick.mp3'),
      fetch404Missing, fetch404Completed: r2.completed === true,
    };
  },
};
