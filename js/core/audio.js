// 소리 엔진. Web Audio로 낭송 조각, 관 배경음, 장구와 효과음을 낸다.
// 소리 판(AudioContext)은 만드는 함수를 인자로 받는다(점검에서 바꿔 끼운다). 박자 계산은 rhythm.js가 한다.
//
// 약속
// - 사용자가 처음 조작하기 전에는 소리 판을 만들지 않는다(unlock). 그 전의 요청은 소리 없이 넘어가고, 배경음만 기억했다가 튼다.
// - 낭송이 나오는 동안 배경음을 줄인다.
// - 'orientation:pause'·'audio:pause'에 모든 재생과 판정을 멈추고, 다시 열리면 진행 중이던 단위를 처음부터 낸다.
// - 소리 끔이나 빗금 모드가 바뀌면 'rhythm:no-beat'를 낸다.
// - 없는 조각 파일은 'audio:missing'으로 알리고, 그 박 자리에는 딸깍 소리를 낸다(박자 칸은 그대로).
import { on as busOn, emit as busEmit } from './events.js';
import { noBeatState, scheduleSegments, calibrationGrid } from './rhythm.js';

// ── 조정 가능한 기본값 ──
export const DEFAULT_VOLUME = { bgm: 0.6, voice: 1, sfx: 0.8 };  // 저장 형식 device.volume 기본값과 같다
export const DUCK_LEVEL = 0.3;        // 낭송 중 배경음 배율
export const DUCK_RAMP_SEC = 0.15;
export const BGM_FADE_SEC = 0.6;
export const LEAD_IN_SEC = 0.15;      // 예약해 둘 여유(이만큼 뒤에 첫 박)
export const TICK_MS = 20;            // 재생 진행을 살피는 간격
export const SFX_NAMES = ['janggu', 'bell', 'place', 'bind', 'gold', 'basket', 'fog'];
const CHANNELS = ['bgm', 'voice', 'sfx'];

// 자산 경로(js/data/README.md '추가 제안(T3)')
export const bgmPath = (id) => 'assets/audio/bgm/' + id + '.mp3';
export const sfxPath = (name) => 'assets/audio/sfx/' + name + '.mp3';

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

// 파일이 없을 때 쓰는 합성 소리. 장구·종·딸깍만 만든다(박자를 이어 가야 하는 소리).
function synthesize(ctx, name) {
  const sr = ctx.sampleRate;
  const spec = {
    click: { dur: 0.03, fn: (t) => Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 160) },
    bell: { dur: 0.7, fn: (t) => (Math.sin(2 * Math.PI * 880 * t) * 0.6 + Math.sin(2 * Math.PI * 1320 * t) * 0.3) * Math.exp(-t * 6) },
    janggu: { dur: 0.25, fn: (t) => Math.sin(2 * Math.PI * (140 - 60 * t) * t) * Math.exp(-t * 18) },
  }[name];
  if (!spec) return null;
  const n = Math.max(1, Math.round(sr * spec.dur));
  const buf = ctx.createBuffer(1, n, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = spec.fn(i / sr) * 0.8;
  return buf;
}

// deps
//  createContext() → AudioContext   (기본: new AudioContext())
//  loadBuffer(path, ctx) → Promise<AudioBuffer>   실패(reject)하면 없는 파일로 본다(기본: fetch + decodeAudioData)
//  baseUrl        기본 불러오기의 기준 주소(없으면 문서 기준 상대 경로)
//  bus            { on, emit } (기본: js/core/events.js)
//  timers         { setInterval, clearInterval } (기본: 전역)
//  now() → ms     탭 사건 시각과 같은 시계(기본: performance.now)
export function createAudioEngine(deps = {}) {
  const createContext = deps.createContext ?? (() => new globalThis.AudioContext());
  const loadBuffer = deps.loadBuffer ?? (async (path, ctx) => {
    const url = deps.baseUrl ? new URL(path, deps.baseUrl).href : path;
    const res = await globalThis.fetch(url);
    if (!res.ok) throw new Error('불러오기 실패 ' + res.status + ': ' + path);
    return ctx.decodeAudioData(await res.arrayBuffer());
  });
  const bus = deps.bus ?? { on: busOn, emit: busEmit };
  const timers = deps.timers ?? globalThis;
  const nowMs = deps.now ?? (() => globalThis.performance?.now?.() ?? Date.now());

  let ctx = null;
  let nodes = null;
  const volume = { ...DEFAULT_VOLUME };
  let muted = false;
  let slashMode = false;
  let noBeat = noBeatState({ muted, slashMode });
  const cache = new Map();      // 경로 → Promise<AudioBuffer|null>
  const resolved = new Map();   // 경로 → AudioBuffer|null (불러오기를 마친 것)
  const reported = new Set();
  const synth = new Map();      // 이름 → 합성 AudioBuffer
  const pauseReasons = new Set();
  const playbacks = new Set();
  let duckTarget = 1;
  let ticker = null;
  let bgmWanted = null;
  let bgm = null;               // { id, src, gain }
  let bgmToken = 0;

  // ── 소리 판 열기 ──
  function buildGraph() {
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    nodes = { master: g(muted ? 0 : 1), bgm: g(volume.bgm), duck: g(duckTarget), voice: g(volume.voice), sfx: g(volume.sfx) };
    nodes.master.connect(ctx.destination);
    nodes.bgm.connect(nodes.duck);
    nodes.duck.connect(nodes.master);
    nodes.voice.connect(nodes.master);
    nodes.sfx.connect(nodes.master);
  }

  // 사용자 조작 처리기 안에서 부른다. 처음이면 소리 판을 만들고, 기억해 둔 배경음을 튼다.
  function unlock() {
    if (!ctx) {
      ctx = createContext();
      buildGraph();
      for (const name of ['janggu', 'bell']) sfxBuffer(name);
    }
    if (pauseReasons.size) { if (ctx.state === 'running') ctx.suspend?.(); }
    else if (ctx.state === 'suspended') ctx.resume?.();
    if (bgmWanted && !bgm) startBgm(bgmWanted);
  }

  // 첫 조작을 기다린다. target은 사건을 받을 수 있는 것(문서 등). 돌려주는 함수로 떼어 낸다.
  function attachUnlock(target) {
    const kinds = ['pointerdown', 'keydown', 'touchend', 'mousedown'];
    const handler = () => { unlock(); detach(); };
    function detach() { for (const k of kinds) target.removeEventListener(k, handler, true); }
    for (const k of kinds) target.addEventListener(k, handler, true);
    return detach;
  }

  // ── 불러오기 ──
  function reportMissing(path, kind) {
    if (reported.has(path)) return;
    reported.add(path);
    bus.emit('audio:missing', { path, kind });
  }

  function getBuffer(path, kind) {
    if (!ctx) return Promise.resolve(null);
    if (!cache.has(path)) {
      cache.set(path, Promise.resolve()
        .then(() => loadBuffer(path, ctx))
        .then((buf) => buf ?? Promise.reject(new Error('빈 소리')))
        .catch(() => { reportMissing(path, kind); return null; })
        .then((buf) => { resolved.set(path, buf); return buf; }));
    }
    return cache.get(path);
  }

  function synthBuffer(name) {
    if (!synth.has(name)) synth.set(name, synthesize(ctx, name));
    return synth.get(name);
  }

  // 효과음 버퍼: 파일이 없으면 합성 소리(장구·종), 그것도 없으면 null
  async function sfxBuffer(name) {
    const buf = await getBuffer(sfxPath(name), 'sfx');
    return buf ?? synthBuffer(name);
  }

  // 낭송 조각을 미리 불러 둔다
  function preload(paths) {
    return Promise.all([...new Set(paths)].filter(Boolean).map((p) => getBuffer(p, 'voice')));
  }

  // ── 음량과 박자 없는 상태 ──
  function setVolume(channel, value) {
    if (!CHANNELS.includes(channel)) throw new Error('모르는 음량 통로: ' + channel);
    volume[channel] = clamp01(value);
    if (nodes) nodes[channel].gain.value = volume[channel];
  }

  function updateNoBeat() {
    const next = noBeatState({ muted, slashMode });
    if (next.value === noBeat.value && next.reason === noBeat.reason) return;
    noBeat = next;
    bus.emit('rhythm:no-beat', { ...noBeat });
  }

  function setMuted(value) {
    muted = !!value;
    if (nodes) nodes.master.gain.value = muted ? 0 : 1;
    updateNoBeat();
  }

  function setSlashMode(value) {
    slashMode = !!value;
    updateNoBeat();
  }

  // 저장의 device 설정을 한 번에 적용한다
  function applySettings(device = {}) {
    for (const ch of CHANNELS) if (device.volume && device.volume[ch] !== undefined) setVolume(ch, device.volume[ch]);
    if (device.slashMode !== undefined) slashMode = !!device.slashMode;
    if (device.muted !== undefined) setMuted(device.muted); else updateNoBeat();
  }

  // ── 배경음 ──
  function fadeOut(track) {
    if (!track || !ctx) return;
    const t = ctx.currentTime;
    track.gain.gain.cancelScheduledValues(t);
    track.gain.gain.setValueAtTime(track.gain.gain.value, t);
    track.gain.gain.linearRampToValueAtTime(0, t + BGM_FADE_SEC);
    try { track.src.stop(t + BGM_FADE_SEC + 0.05); } catch { /* 이미 멈춤 */ }
  }

  function startBgm(id) {
    const token = ++bgmToken;
    getBuffer(bgmPath(id), 'bgm').then((buf) => {
      if (token !== bgmToken || !ctx) return;
      fadeOut(bgm);
      bgm = null;
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + BGM_FADE_SEC);
      src.connect(gain);
      gain.connect(nodes.bgm);
      src.start(t);
      bgm = { id, src, gain };
    });
  }

  // 관 배경음(관 id나 'boss' 같은 장면 이름). 조작 전이면 기억했다가 첫 조작 뒤 튼다.
  function playBgm(id) {
    if (bgmWanted === id) return;
    bgmWanted = id;
    if (ctx) startBgm(id);
  }

  function stopBgm() {
    bgmWanted = null;
    bgmToken++;
    fadeOut(bgm);
    bgm = null;
  }

  // ── 효과음과 장구 ──
  function playBuffer(buf, dest, when) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    src.start(when);
    return src;
  }

  // 효과음 하나. 조작 전·멈춤·소리 끔이면 내지 않는다. 낸 요청이면 true.
  function sfx(name) {
    if (!ctx || pauseReasons.size || muted) return false;
    sfxBuffer(name).then((buf) => { if (buf && ctx && !pauseReasons.size) playBuffer(buf, nodes.sfx, ctx.currentTime); });
    return true;
  }

  // 소리 판 시각(초). 조작 전이면 null.
  function now() { return ctx ? ctx.currentTime : null; }

  // 장구를 두드린다. 탭 시각(소리 판 시계, 초)을 돌려준다. eventTimeMs는 탭 사건의 timeStamp(performance 시계).
  // 조작 전이나 멈춘 동안은 null이고, 판정 쪽은 null 탭을 무시한다.
  function tap(eventTimeMs) {
    if (!ctx || pauseReasons.size) return null;
    const lag = typeof eventTimeMs === 'number' ? Math.max(0, nowMs() - eventTimeMs) / 1000 : 0;
    sfx('janggu');
    return Math.max(0, ctx.currentTime - lag);
  }

  // ── 낭송 재생 ──
  function updateDuck() {
    duckTarget = playbacks.size > 0 ? DUCK_LEVEL : 1;
    if (!nodes) return;
    const p = nodes.duck.gain;
    const t = ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(duckTarget, t + DUCK_RAMP_SEC);
  }

  function beatBuffer(beat) {
    if (beat.path) return resolved.get(beat.path) ?? synthBuffer('click');
    if (beat.sound) return resolved.get(sfxPath(beat.sound)) ?? synthBuffer(beat.sound) ?? synthBuffer('click');
    return synthBuffer('click');
  }

  function scheduleFrom(pb, pos, startAt) {
    const { grid, list, opts } = pb;
    pb.plan = scheduleSegments(grid, list.slice(pos), startAt).map((p, k) => {
      const seg = grid.segments[p.segment];
      const beats = seg.beats.map((bi) => ({ beat: bi, when: p.at + (grid.beats[bi].time - seg.start), fired: false }));
      return { ...p, pos: pos + k, end: p.at + seg.duration, beats, started: false, ended: false };
    });
    for (const item of pb.plan) {
      opts.judge?.arm(item.segment, item.at);
      for (const b of item.beats) {
        const beat = grid.beats[b.beat];
        const dest = beat.path ? nodes.voice : nodes.sfx;
        pb.sources.push(playBuffer(beatBuffer(beat), dest, b.when));
      }
    }
    pb.waiting = false;
  }

  function stopSources(pb) {
    for (const src of pb.sources) {
      try { src.stop(); } catch { /* 이미 멈춤 */ }
      try { src.disconnect(); } catch { /* 이미 끊김 */ }
    }
    pb.sources = [];
  }

  function finish(pb, result) {
    if (pb.done) return;
    pb.done = true;
    playbacks.delete(pb);
    updateDuck();
    if (!playbacks.size && ticker !== null) { timers.clearInterval(ticker); ticker = null; }
    pb.resolve(result);
  }

  function tick() {
    if (!ctx || pauseReasons.size) return;
    const t = ctx.currentTime;
    for (const pb of [...playbacks]) {
      if (pb.waiting || pb.done) continue;
      for (const item of pb.plan) {
        if (!item.started && t >= item.at) { item.started = true; pb.opts.onSegmentStart?.({ segment: item.segment, at: item.at }); }
        for (const b of item.beats) if (!b.fired && t >= b.when) { b.fired = true; pb.opts.onBeat?.({ beat: b.beat, segment: item.segment, when: b.when }); }
        if (!item.ended && t >= item.end) { item.ended = true; pb.opts.onSegmentEnd?.({ segment: item.segment }); }
      }
      if (pb.plan.length && pb.plan.every((i) => i.ended)) finish(pb, { completed: true });
    }
  }

  // 박자 칸의 단위들을 차례로 낸다(rhythm.js buildGrid·buildRemixGrid·calibrationGrid의 칸).
  // opts: { judge, onSegmentStart, onBeat, onSegmentEnd, onRestart }
  //  judge: { arm(단위, 시작 시각), disarm(단위) } — createTapSession·createRemixSession을 그대로 넘긴다.
  //         단위를 예약할 때 arm, 멈출 때 disarm, 재개해 다시 낼 때 다시 arm 한다.
  // 돌려주는 값: { finished: Promise<{ completed, reason? }>, stop() }
  function play(grid, segIndices = null, opts = {}) {
    const list = segIndices ?? grid.segments.map((s) => s.index);
    let resolve;
    const finished = new Promise((r) => { resolve = r; });
    const pb = { grid, list, opts, plan: [], sources: [], waiting: true, resumePos: null, done: false, resolve };
    const handle = { finished, stop: () => { stopSources(pb); for (const i of pb.plan) opts.judge?.disarm?.(i.segment); finish(pb, { completed: false, reason: 'stopped' }); } };
    if (!ctx) { resolve({ completed: false, reason: 'locked' }); return handle; }
    if (!list.length) { resolve({ completed: true }); return handle; }
    playbacks.add(pb);
    updateDuck();
    if (ticker === null) ticker = timers.setInterval(tick, TICK_MS);
    const beats = list.flatMap((i) => grid.segments[i].beats.map((bi) => grid.beats[bi]));
    const sounds = [...new Set(beats.filter((b) => !b.path && b.sound).map((b) => b.sound))];
    Promise.all([preload(beats.map((b) => b.path)), ...sounds.map((s) => sfxBuffer(s))]).then(() => {
      if (pb.done || !pb.waiting || pauseReasons.size) return; // 멈춘 동안이면 재개 때 처음부터 낸다
      scheduleFrom(pb, 0, ctx.currentTime + LEAD_IN_SEC);
    });
    return handle;
  }

  // 박자 보정 종소리. finished는 { completed, bells: [소리 판 시각…] }로 끝난다.
  // 멈췄다 재개하면 종소리를 처음부터 다시 내므로, bells는 언제나 마지막으로 낸 시각이다.
  function playCalibration({ count, intervalSec } = {}) {
    const grid = calibrationGrid({ count, intervalSec });
    let bells = [];
    const judge = { arm: (seg, at) => { bells = grid.beats.map((b) => at + b.time); }, disarm: () => {} };
    const h = play(grid, null, { judge });
    return { stop: h.stop, bells: () => bells.slice(), finished: h.finished.then((r) => ({ ...r, bells: bells.slice() })) };
  }

  // ── 멈춤과 재개 ──
  function pause(reason = 'menu') {
    const was = pauseReasons.size > 0;
    pauseReasons.add(reason);
    if (was || !ctx) return;
    const t = ctx.currentTime;
    for (const pb of playbacks) {
      if (pb.waiting) continue; // 아직 예약 전: 재개 때 처음부터
      const current = pb.plan.find((i) => i.end > t);
      pb.resumePos = current ? current.pos : pb.list.length;
      stopSources(pb);
      for (const i of pb.plan) pb.opts.judge?.disarm?.(i.segment);
      pb.plan = [];
      pb.waiting = true;
    }
    ctx.suspend?.();
  }

  function resume(reason = 'menu') {
    if (!pauseReasons.delete(reason) || pauseReasons.size || !ctx) return;
    Promise.resolve(ctx.resume?.()).then(() => {
      if (pauseReasons.size) return;
      for (const pb of [...playbacks]) {
        if (!pb.waiting || pb.done) continue;
        const pos = pb.resumePos ?? 0;
        if (pb.resumePos !== null) {
          if (pos >= pb.list.length) { finish(pb, { completed: true }); continue; }
          pb.opts.onRestart?.({ segment: pb.list[pos] });
        }
        pb.resumePos = null;
        // 불러오기가 끝나지 않았으면 play의 불러오기 뒤에 예약된다
        const paths = pb.list.flatMap((i) => pb.grid.segments[i].beats.map((bi) => pb.grid.beats[bi].path)).filter(Boolean);
        preload(paths).then(() => { if (!pb.done && pb.waiting && !pauseReasons.size) scheduleFrom(pb, pos, ctx.currentTime + LEAD_IN_SEC); });
      }
    });
  }

  const offs = [
    bus.on('orientation:pause', () => pause('orientation')),
    bus.on('orientation:resume', () => resume('orientation')),
    bus.on('audio:pause', (d) => pause(d?.reason ?? 'menu')),
    bus.on('audio:resume', (d) => resume(d?.reason ?? 'menu')),
  ];

  function dispose() {
    for (const off of offs) off?.();
    for (const pb of [...playbacks]) { stopSources(pb); finish(pb, { completed: false, reason: 'disposed' }); }
    stopBgm();
    if (ticker !== null) { timers.clearInterval(ticker); ticker = null; }
    ctx?.close?.();
  }

  return {
    get unlocked() { return !!ctx; },
    get paused() { return pauseReasons.size > 0; },
    get noBeat() { return { ...noBeat }; },
    get muted() { return muted; },
    get slashMode() { return slashMode; },
    unlock, attachUnlock,
    applySettings, setVolume, getVolume: () => ({ ...volume }), setMuted, setSlashMode,
    playBgm, stopBgm, sfx, tap, now, preload,
    play, playCalibration,
    pause, resume, dispose,
    // 점검용 들여다보기(제품 흐름은 쓰지 않는다)
    debug: () => ({ ctx, nodes, duckTarget, synth, bgm }),
  };
}
