// 소리 엔진. Web Audio로 낭송 조각, 관 배경음, 장구와 효과음을 낸다.
// 소리 판(AudioContext)은 만드는 함수를 인자로 받는다(점검에서 바꿔 끼운다). 박자 계산은 rhythm.js가 한다.
//
// 약속
// - 사용자가 처음 조작하기 전에는 소리 판을 만들지 않는다(unlock). 그 전의 요청은 소리 없이 넘어가고, 배경음만 기억했다가 튼다.
//   소리 판이 실제로 돌기('running') 전까지는 조작을 계속 기다린다. 손가락 기기에서는 첫 pointerdown이 '사용자 활성화'가
//   아니어서 resume이 실패하므로, 활성화가 되는 사건(pointerup·touchend·click·keydown·mousedown, 마우스 pointerdown)을 듣는다.
//   멈춤 까닭 없이 소리 판이 멈추면(suspended·interrupted) 다시 조작을 기다리고, 돌기 시작하면 기다리던 낭송을 낸다.
// - 낭송이 나오는 동안 배경음을 줄인다.
// - 'orientation:pause'·'audio:pause'에 모든 재생과 판정을 멈추고, 다시 열리면 진행 중이던 단위를 처음부터 낸다.
//   멈추기 직전에 이미 끝난 단위의 끝(onSegmentEnd)을 먼저 내므로, 막 끝난 단위가 놓친 것으로 세어지지 않는다.
// - countIn을 주면 새로 시작할 때마다(처음, 재개) 첫 박 앞에 알림 소리 한 번을 낸다(판정하지 않는다). 박자 칸은
//   첫 박보다 min(박 길이, COUNT_IN_MAX_SEC) 앞에 장구, 쉼 칸(rhythm.js buildPauseGrid)은 grid.countInSec 앞에 grid.countInSound('준비').
// - 쉼 칸(grid.pause)은 음보 조각마다 그 조각의 실제 길이 뒤에 쉼을 둔다. 단위의 시각은 그 단위 조각을 다 불러왔거나 때가
//   가까워지면 정하고(pauseSegmentTiming), 그때 판정 회차를 연다(arm(단위, 시작, 시각표)).
// - 소리 끔이나 빗금 모드가 바뀌면 'rhythm:no-beat'를 낸다.
// - 없는 조각 파일은 'audio:missing'으로 알리고, 그 박 자리에는 딸깍 소리를 낸다(박자 칸은 그대로).
import { on as busOn, emit as busEmit } from './events.js';
import { noBeatState, scheduleSegments, calibrationGrid, pauseSegmentTiming, CALIBRATION_COUNTDOWN } from './rhythm.js';

// ── 조정 가능한 기본값 ──
export const DEFAULT_VOLUME = { bgm: 0.6, voice: 1, sfx: 0.8 };  // 저장 형식 device.volume 기본값과 같다
export const DUCK_LEVEL = 0.3;        // 낭송 중 배경음 배율
export const DUCK_RAMP_SEC = 0.15;
export const BGM_FADE_SEC = 0.6;
export const LEAD_IN_SEC = 0.15;      // 예약해 둘 여유(이만큼 뒤에 첫 박)
export const SCHEDULE_AHEAD_SEC = 1.5; // 이만큼 앞의 단위부터 소리를 예약한다(나머지는 미리 불러 두기만 한다)
export const COUNT_IN_SOUND = 'janggu'; // 새로 시작할 때 첫 박 앞에 내는 소리(판정하지 않는다)
export const COUNT_IN_MAX_SEC = 1.5;    // 박 알림은 첫 박보다 min(박 길이, 이 값) 앞(느린 노래에서 알림 뒤가 길게 비지 않게)
export const TICK_MS = 20;            // 재생 진행을 살피는 간격
export const SFX_NAMES = ['janggu', 'bell', 'place', 'bind', 'gold', 'basket', 'fog'];
// 파일 없이 합성해서만 내는 소리('준비'·'셋·둘·하나' 딱 소리). 파일을 찾지 않는다(없는 파일 요청을 만들지 않게)
const SYNTH_ONLY = new Set(['tick']);
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
    // 나무 딱 소리: 장구·종과 다르게 짧고 여리다
    tick: { dur: 0.08, fn: (t) => (Math.sin(2 * Math.PI * 1250 * t) * 0.45 + Math.sin(2 * Math.PI * 2500 * t) * 0.12) * Math.exp(-t * 60) },
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

  // 소리 판이 실제로 도는지. state가 없는 소리 판(점검의 단순한 가짜)은 도는 것으로 본다.
  const isRunning = () => !!ctx && (ctx.state === undefined || ctx.state === 'running');
  let everRan = false;          // 한 번이라도 돌았는지(멈춤 까닭으로 잠시 세운 것과 아직 못 연 것을 가른다)

  function suspendCtx() {
    try { Promise.resolve(ctx.suspend?.()).catch(() => {}); } catch { /* 세울 수 없음 */ }
  }

  // 소리 판을 돌린다. 사용자 활성화 안이 아니면 실패할 수 있다(그때는 다음 조작을 기다린다).
  function resumeCtx() {
    let p;
    try { p = ctx.resume?.(); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(() => {
      if (!ctx) return;
      if (isRunning()) { everRan = true; if (!pauseReasons.size) disarmUnlock(); }
      kick();
    }, () => { if (ctx && !pauseReasons.size) armUnlock(); });
  }

  // 소리 판 상태가 바뀔 때: 돌기 시작하면 기다리던 낭송을 내고, 멈춤 까닭 없이 멈추면 다시 조작을 기다린다.
  function onState() {
    if (!ctx) return;
    if (isRunning()) { everRan = true; if (!pauseReasons.size) disarmUnlock(); kick(); }
    else if ((ctx.state === 'suspended' || ctx.state === 'interrupted') && !pauseReasons.size) armUnlock();
  }

  // 사용자 조작 처리기 안에서 부른다. 처음이면 소리 판을 만들고, 기억해 둔 배경음을 튼다.
  function unlock() {
    if (!ctx) {
      ctx = createContext();
      if (typeof ctx.addEventListener === 'function') ctx.addEventListener('statechange', onState);
      else ctx.onstatechange = onState;
      buildGraph();
      for (const name of ['janggu', 'bell']) sfxBuffer(name);
      if (isRunning()) everRan = true;
    }
    if (pauseReasons.size) { if (ctx.state === 'running') suspendCtx(); }
    else if (!isRunning() && ctx.state !== 'closed') resumeCtx();
    else kick();
    if (bgmWanted && !bgm) startBgm(bgmWanted);
  }

  // 조작 기다리기. 활성화가 되는 사건만 듣는다(손가락 pointerdown은 활성화가 아니다).
  const UNLOCK_KINDS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown', 'mousedown'];
  const unlockTargets = new Set();
  let unlockArmed = false;
  function onGesture(e) {
    if (e?.type === 'pointerdown' && e.pointerType && e.pointerType !== 'mouse') return;
    unlock();
    if (isRunning() && !pauseReasons.size) disarmUnlock();
  }
  function armUnlock() {
    if (unlockArmed || !unlockTargets.size) return;
    unlockArmed = true;
    for (const t of unlockTargets) for (const k of UNLOCK_KINDS) t.addEventListener(k, onGesture, true);
  }
  function disarmUnlock() {
    if (!unlockArmed) return;
    unlockArmed = false;
    for (const t of unlockTargets) for (const k of UNLOCK_KINDS) t.removeEventListener(k, onGesture, true);
  }

  // 첫 조작을 기다린다. target은 사건을 받을 수 있는 것(문서 등). 소리 판이 돌 때까지(그리고 멈춤 까닭 없이
  // 다시 멈추면 또) 기다린다. 돌려주는 함수로 아주 떼어 낸다.
  function attachUnlock(target) {
    if (!target?.addEventListener) return () => {};
    const wasArmed = unlockArmed;
    disarmUnlock();
    unlockTargets.add(target);
    if (wasArmed || !isRunning()) armUnlock();
    return () => {
      const armed = unlockArmed;
      disarmUnlock();
      unlockTargets.delete(target);
      if (armed) armUnlock();
    };
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

  // 효과음 버퍼: 파일이 없으면 합성 소리(장구·종), 그것도 없으면 null. 합성만 하는 소리는 파일을 찾지 않는다
  async function sfxBuffer(name) {
    if (SYNTH_ONLY.has(name)) return synthBuffer(name);
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

  // 단위들을 startAt부터 칸대로 놓는다. 박자 칸은 판정 회차를 모두 지금 연다(첫 박 앞 판정 창이 잘리지 않게).
  // 쉼 칸은 단위의 시각이 정해질 때(앞 단위가 정해졌고, 그 단위 조각을 다 불러왔거나 때가 가까울 때) 하나씩 연다.
  // 소리는 SCHEDULE_AHEAD_SEC 안에 든 단위만 지금 예약하고, 나머지는 tick이 때가 되면 예약한다(feed).
  // countIn이면 첫 박 앞에 알림 소리 한 번(박자 칸: min(박 길이, COUNT_IN_MAX_SEC) 앞 장구, 쉼 칸: grid.countInSec 앞 '준비').
  // 판정하지 않고 onBeat도 내지 않는다. 판정 회차는 알림보다 먼저(예약할 때) 열린다.
  function scheduleFrom(pb, pos, startAt) {
    const { grid, list, opts } = pb;
    let at = startAt;
    if (opts.countIn) {
      const first = grid.segments[list[pos]];
      const lead = grid.countInSec ?? Math.min(first?.beatSec ?? grid.beatSec ?? 0, COUNT_IN_MAX_SEC);
      if (lead > 0) {
        const sound = grid.countInSound ?? COUNT_IN_SOUND;
        const buf = resolved.get(sfxPath(sound)) ?? synthBuffer(sound);
        if (buf) pb.sources.push(playBuffer(buf, nodes.sfx, startAt));
        at = startAt + lead;
      }
    }
    if (grid.pause) {
      pb.plan = list.slice(pos).map((segment, k) => ({ segment, pos: pos + k, at: null, end: null, beats: [], timed: false, fed: false, started: false, ended: false }));
      timePlan(pb, ctx.currentTime, at);
    } else {
      pb.plan = scheduleSegments(grid, list.slice(pos), at).map((p, k) => {
        const seg = grid.segments[p.segment];
        const beats = seg.beats.map((bi) => ({ beat: bi, when: p.at + (grid.beats[bi].time - seg.start), fired: false }));
        return { ...p, pos: pos + k, end: p.at + seg.duration, beats, timed: true, fed: false, started: false, ended: false };
      });
      for (const item of pb.plan) opts.judge?.arm(item.segment, item.at);
    }
    pb.waiting = false;
    feed(pb, ctx.currentTime);
  }

  // 쉼 칸: 조각의 실제 길이(불러온 버퍼, 없거나 덜 불러왔으면 대신 내는 딸깍 소리의 길이)
  const clipSec = (beat) => beatBuffer(beat)?.duration ?? null;
  const clipsReady = (grid, segIndex) => grid.segments[segIndex].beats.every((bi) => { const p = grid.beats[bi].path; return !p || resolved.has(p); });

  // 쉼 칸의 단위 시각을 차례로 정한다. 첫 단위는 firstAt, 다음은 앞 단위 끝 + 단위 사이 쉼.
  // 조각을 다 불러온 단위는 바로, 덜 불러온 단위는 때가 가까워지면(SCHEDULE_AHEAD_SEC) 정한다. 정할 때 판정 회차를 연다.
  function timePlan(pb, t, firstAt = null) {
    const { grid, opts } = pb;
    let prevEnd = null;
    for (const item of pb.plan) {
      if (item.timed) { prevEnd = item.end; continue; }
      const at = prevEnd === null ? firstAt : prevEnd + grid.gapSec;
      if (at === null) break;
      if (prevEnd !== null && !clipsReady(grid, item.segment) && at > t + SCHEDULE_AHEAD_SEC) break;
      const tm = pauseSegmentTiming(grid, item.segment, at, clipSec);
      item.at = at;
      item.end = tm.end;
      item.beats = tm.beats.map((b) => ({ ...b, fired: false }));
      item.timed = true;
      opts.judge?.arm(item.segment, at, tm);
      prevEnd = item.end;
    }
  }

  // 때가 가까운 단위의 소리를 예약한다. 불러오기가 아직 안 끝난 조각은 딸깍 소리로 박을 지킨다.
  function feed(pb, t) {
    if (pb.grid.pause) timePlan(pb, t);
    for (const item of pb.plan) {
      if (!item.timed) break;
      if (item.fed) continue;
      if (item.at > t + SCHEDULE_AHEAD_SEC) break;
      item.fed = true;
      for (const b of item.beats) {
        const beat = pb.grid.beats[b.beat];
        pb.sources.push(playBuffer(beatBuffer(beat), beat.path ? nodes.voice : nodes.sfx, b.when));
      }
    }
  }

  // 기다리던 재생을 낸다: 불러오기를 마쳤고, 멈춤 까닭이 없고, 소리 판이 돌 때. 재개면 진행 중이던 단위부터.
  function kick() {
    if (!ctx || pauseReasons.size || !isRunning()) return;
    for (const pb of [...playbacks]) {
      if (pb.done || !pb.waiting || !pb.ready) continue;
      let pos = 0;
      if (pb.resumePos !== null) {
        pos = pb.resumePos;
        pb.resumePos = null;
        if (pos >= pb.list.length) { finish(pb, { completed: true }); continue; }
        pb.opts.onRestart?.({ segment: pb.list[pos] });
        if (pb.done || !pb.waiting || pauseReasons.size) continue;
      }
      scheduleFrom(pb, pos, ctx.currentTime + LEAD_IN_SEC);
    }
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
      feed(pb, t);
      // 알림 처리기가 재생을 멈출 수 있다(stop). 멈추면 남은 알림을 내지 않는다.
      for (const item of pb.plan) {
        if (pb.done || pb.waiting || !item.timed) break;
        if (!item.started && t >= item.at) { item.started = true; pb.opts.onSegmentStart?.({ segment: item.segment, at: item.at }); }
        // 쉼 칸의 박에는 조각 끝(clipEnd, 쉼 시작)과 쉼 끝(pauseEnd)도 싣는다
        for (const b of item.beats) if (!pb.done && !b.fired && t >= b.when) { b.fired = true; pb.opts.onBeat?.({ beat: b.beat, segment: item.segment, when: b.when, clipEnd: b.clipEnd, pauseEnd: b.pauseEnd }); }
        if (!pb.done && !item.ended && t >= item.end) { item.ended = true; pb.opts.onSegmentEnd?.({ segment: item.segment, pos: item.pos }); }
      }
      if (!pb.done && !pb.waiting && pb.plan.length && pb.plan.every((i) => i.ended)) finish(pb, { completed: true });
    }
  }

  // 박자 칸의 단위들을 차례로 낸다(rhythm.js buildGrid·buildPauseGrid·buildRemixGrid·calibrationGrid의 칸).
  // opts: { judge, countIn, onSegmentStart, onBeat, onSegmentEnd, onRestart }
  //  judge: { arm(단위, 시작 시각, 시각표?), disarm(단위) } — createTapSession·createPauseTapSession·createRemixSession을 그대로 넘긴다.
  //         단위를 예약할 때 arm(쉼 칸은 시각을 정할 때, 시각표 { beats: [{ beat, when, clipEnd, pauseEnd }] }와 함께),
  //         멈출 때 disarm(이미 끝난 단위는 그대로 둔다), 재개해 다시 낼 때 다시 arm 한다.
  //  countIn: 새로 시작할 때마다(처음, 재개) 첫 박 앞에 알림 한 번(판정 없음, onBeat 없음). 박자 칸은 min(박 길이,
  //           COUNT_IN_MAX_SEC) 앞 장구, 쉼 칸은 grid.countInSec 앞 grid.countInSound.
  //  onBeat({ beat, segment, when, clipEnd?, pauseEnd? }): 조각이 울리기 시작한 때(쉼 칸이면 조각 끝·쉼 끝 시각도).
  //  onSegmentEnd({ segment, pos }): 단위가 끝난 때. 여기서 stop()을 부르면 다음 단위를 내지 않는다.
  //  onRestart({ segment }): 멈췄다 재개해 그 단위부터 다시 낼 때(다시 예약하기 직전).
  // 소리 판이 아직 돌지 않으면(조작 전 손가락 기기 등) 돌 때까지 기다렸다가 낸다.
  // 첫 단위의 조각만 불러오면 시작하고, 나머지 조각은 그동안 미리 불러 둔다.
  // 돌려주는 값: { finished: Promise<{ completed, reason? }>, stop() }
  function play(grid, segIndices = null, opts = {}) {
    const list = segIndices ?? grid.segments.map((s) => s.index);
    let resolve;
    const finished = new Promise((r) => { resolve = r; });
    const pb = { grid, list, opts, plan: [], sources: [], waiting: true, ready: false, resumePos: null, done: false, resolve };
    const handle = { finished, stop: () => { if (pb.done) return; stopSources(pb); for (const i of pb.plan) opts.judge?.disarm?.(i.segment); finish(pb, { completed: false, reason: 'stopped' }); } };
    if (!ctx) { resolve({ completed: false, reason: 'locked' }); return handle; }
    if (!list.length) { resolve({ completed: true }); return handle; }
    playbacks.add(pb);
    updateDuck();
    if (ticker === null) ticker = timers.setInterval(tick, TICK_MS);
    const beatsOf = (segs) => segs.flatMap((i) => grid.segments[i].beats.map((bi) => grid.beats[bi]));
    const sounds = [...new Set(beatsOf(list).filter((b) => !b.path && b.sound).map((b) => b.sound).concat(opts.countIn ? [grid.countInSound ?? COUNT_IN_SOUND] : []))];
    const first = preload(beatsOf(list.slice(0, 1)).map((b) => b.path));
    preload(beatsOf(list.slice(1)).map((b) => b.path));   // 기다리지 않는다(앞 단위를 내는 동안 불러 둔다)
    Promise.all([first, ...sounds.map((s) => sfxBuffer(s))]).then(() => {
      pb.ready = true;
      kick(); // 멈춘 동안이거나 소리 판이 아직 돌지 않으면 재개·활성화 때 낸다
    });
    return handle;
  }

  // 박자 보정 종소리. 종보다 먼저 같은 간격으로 '셋·둘·하나'(countdown개, 딱 소리)를 세고 종을 낸다.
  // finished는 { completed, bells: [종소리 시각…] }로 끝난다(세는 소리는 bells에 들지 않는다).
  // 멈췄다 재개하면 처음(세기)부터 다시 내므로, bells는 언제나 마지막으로 낸 시각이다.
  // onRestart(): 재개해 처음부터 다시 낼 때(그 전의 탭은 버려야 한다).
  // onBeat({ kind: 'count' | 'bell', n, index, when }): 세는 소리(n: 3, 2, 1)나 종(index: 0부터)이 울린 때.
  function playCalibration({ count, intervalSec, countdown = CALIBRATION_COUNTDOWN, onRestart, onBeat } = {}) {
    const grid = calibrationGrid({ count, intervalSec, countdown });
    const bellBeats = grid.beats.filter((b) => b.sound === 'bell');
    let bells = [];
    const judge = { arm: (seg, at) => { bells = bellBeats.map((b) => at + b.time); }, disarm: () => {} };
    const h = play(grid, null, {
      judge,
      onRestart: () => onRestart?.(),
      onBeat: ({ beat, when }) => {
        const b = grid.beats[beat];
        if (b.cue === 'count') onBeat?.({ kind: 'count', n: b.n, when });
        else onBeat?.({ kind: 'bell', index: bellBeats.indexOf(b), when });
      },
    });
    return { stop: h.stop, bells: () => bells.slice(), finished: h.finished.then((r) => ({ ...r, bells: bells.slice() })) };
  }

  // ── 멈춤과 재개 ──
  function pause(reason = 'menu') {
    const was = pauseReasons.size > 0;
    // 멈추기 전에 지금까지 지난 박·단위 끝을 먼저 낸다(막 끝난 단위를 놓친 것으로 세지 않게)
    if (!was && ctx) tick();
    pauseReasons.add(reason);
    if (was || !ctx) return;
    for (const pb of [...playbacks]) {
      if (pb.done || pb.waiting) continue; // 아직 예약 전: 재개 때 처음부터
      const current = pb.plan.find((i) => !i.ended);
      pb.resumePos = current ? current.pos : pb.list.length;
      stopSources(pb);
      for (const i of pb.plan) if (!i.ended) pb.opts.judge?.disarm?.(i.segment);
      pb.plan = [];
      pb.waiting = true;
    }
    suspendCtx();
  }

  function resume(reason = 'menu') {
    if (!pauseReasons.delete(reason) || pauseReasons.size || !ctx) return;
    resumeCtx();   // 돌면 kick이 진행 중이던 단위부터 다시 낸다. 실패하면 다음 조작을 기다린다
  }

  const offs = [
    bus.on('orientation:pause', () => pause('orientation')),
    bus.on('orientation:resume', () => resume('orientation')),
    bus.on('audio:pause', (d) => pause(d?.reason ?? 'menu')),
    bus.on('audio:resume', (d) => resume(d?.reason ?? 'menu')),
  ];

  function dispose() {
    for (const off of offs) off?.();
    disarmUnlock();
    unlockTargets.clear();
    if (ctx) { if (typeof ctx.removeEventListener === 'function') ctx.removeEventListener('statechange', onState); else ctx.onstatechange = null; }
    for (const pb of [...playbacks]) { stopSources(pb); finish(pb, { completed: false, reason: 'disposed' }); }
    stopBgm();
    if (ticker !== null) { timers.clearInterval(ticker); ticker = null; }
    ctx?.close?.();
  }

  return {
    // 소리 판이 돌고 있는지(멈춤 까닭으로 잠시 세운 동안은, 한 번 돌았으면 열린 것으로 본다)
    get unlocked() { return !!ctx && (isRunning() || (pauseReasons.size > 0 && everRan)); },
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
