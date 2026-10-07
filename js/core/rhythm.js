// 박자 엔진. 화면과 소리 판 없이 시각(초)만 다룬다. Node에서 바로 시험한다.
// 노래의 낭송 조각을 일정한 박자 칸에 놓고, 탭을 판정 창으로 판정하고, 박자 보정값과 리믹스 지점을 계산한다.
// 시각은 모두 '초'이고, 판정 창과 보정값만 'ms'다. 소리 판(audio.js)이 정한 시작 시각을 받아 칸을 연다(arm).
import { voiceClipPath, isMetricFoot } from './song-shape.js';

// ── 조정 가능한 기본값(spec 5.3, 10.1, 15, 22) ──
export const TAP_WINDOW_MS = 150;             // 두드리기 판정 창 ±ms(경계 포함)
export const MISS_SUGGEST_SLASH = 3;          // 놓친 박이 이만큼 쌓이면 빗금 모드를 권한다(한 번)
export const SEGMENT_GAP_SEC = 0.8;           // 단위(장·행·줄·구) 사이 쉼
export const DEFAULT_TEMPO = {                // 노래에 tempo가 없을 때의 빠르기(1분당 박 수). 향가는 구 하나가 한 박
  hyangga: 20,
  goryeo: 60,
  sijo: 50,
  gasa: 60,
  saseol: 60,
};
export const FALLBACK_TEMPO = 60;
export const CALIBRATION_BEATS = 8;           // 박자 보정 종소리 수
export const CALIBRATION_INTERVAL_SEC = 0.8;  // 종소리 간격
export const CALIBRATION_MIN_MATCHED = 5;     // 종과 짝지어진 탭이 이보다 적으면 보정 실패(보정값 0)
export const CALIBRATION_SKIP_OFFSET_MS = 0;  // 보정을 건너뛰면 쓰는 값
export const REMIX_WINDOW_MS = { before: 700, after: 1500 }; // 리믹스 바뀌는 지점 판정 창(지점 앞/뒤)

const arr = (v) => (Array.isArray(v) ? v : []);
// 부동소수 오차로 경계(정확히 150ms)가 밖으로 밀리지 않게 마이크로초 단위로 반올림한다.
const toMs = (sec) => Math.round(sec * 1e6) / 1e3;

// 노래 빠르기(1분당 박 수): 선택값 → 노래 tempo → 갈래 기본값
export function tempoOf(song, opts = {}) {
  const t = opts.tempo ?? song?.tempo ?? DEFAULT_TEMPO[song?.genre] ?? FALLBACK_TEMPO;
  if (!(t > 0)) throw new Error('빠르기는 0보다 커야 한다: ' + t);
  return t;
}

// 노래의 두드리기 단위 목록. 향가는 구, 고려가요는 줄, 나머지는 장·행.
// 단위 하나 = [{ unit, line, foot, path }]
// 고려가요의 여음·후렴·되풀이 머리(음보 kind)는 낭송 칸은 차지하지만 박이 아니다(offbeat: kind). 두드리기 판정 창을 열지 않는다.
function tapUnits(song) {
  const out = [];
  arr(song?.units).forEach((u, unit) => {
    if (song.genre === 'hyangga') out.push({ unit, line: null, beats: [{ unit, line: null, foot: null, path: voiceClipPath(song.id, unit) }] });
    else if (song.genre === 'goryeo') {
      arr(u?.lines).forEach((l, line) => out.push({ unit, line, beats: arr(l?.feet).map((f, foot) => {
        const b = { unit, line, foot, path: voiceClipPath(song.id, unit, line, foot) };
        if (!isMetricFoot(f)) b.offbeat = f.kind;
        return b;
      }) }));
    } else out.push({ unit, line: null, beats: arr(u?.feet).map((_, foot) => ({ unit, line: null, foot, path: voiceClipPath(song.id, unit, null, foot) })) });
  });
  return out;
}

// 단위 목록을 칸에 놓는다. parts: [{ unit, line, beatSec, songId?, fragment?, beats:[{…}] }]
function layout(parts, gapSec) {
  const beats = [];
  const segments = [];
  let t = 0;
  parts.forEach((p, index) => {
    if (index > 0) t += gapSec;
    const seg = { index, unit: p.unit, line: p.line, start: t, beatSec: p.beatSec, duration: p.beats.length * p.beatSec, beats: [] };
    if (p.songId !== undefined) seg.songId = p.songId;
    if (p.fragment !== undefined) seg.fragment = p.fragment;
    p.beats.forEach((b, k) => {
      const beat = { index: beats.length, time: t + k * p.beatSec, segment: index, unit: b.unit, line: b.line, foot: b.foot, path: b.path ?? null };
      if (b.sound) beat.sound = b.sound;
      if (b.offbeat) beat.offbeat = b.offbeat;
      if (p.songId !== undefined) beat.songId = p.songId;
      seg.beats.push(beat.index);
      beats.push(beat);
    });
    t += seg.duration;
    segments.push(seg);
  });
  return { beats, segments, duration: t, gapSec };
}

// 노래 한 편의 박자 칸. opts: { tempo, gapSec }
// 돌려주는 값: { songId, genre, tempo, beatSec, gapSec, beats, segments, duration }
//  beats[i]: { index, time(노래 시작 기준 초), segment, unit, line, foot, path, offbeat? }
//    offbeat: 고려가요 여음·후렴·되풀이 머리의 표시(kind). 낭송만 하고 두드리지 않는 칸이다.
//  segments[i]: { index, unit, line, start, beatSec, duration, beats:[박 번호] } — 두드리기·다시 듣기 단위
export function buildGrid(song, opts = {}) {
  const tempo = tempoOf(song, opts);
  const beatSec = 60 / tempo;
  const parts = tapUnits(song).map((u) => ({ ...u, beatSec }));
  return { songId: song.id, genre: song.genre, tempo, beatSec, ...layout(parts, opts.gapSec ?? SEGMENT_GAP_SEC) };
}

// 단위 번호(고려가요는 연·줄)로 칸의 단위 번호를 찾는다. 없으면 -1.
export function segmentIndexOf(grid, unit, line = null) {
  return grid.segments.findIndex((s) => s.unit === unit && (line === null || s.line === line));
}

// 단위들을 차례로 이어 낼 때 단위마다 시작 시각. 첫 단위는 startAt, 다음은 앞 단위 끝 + 쉼.
export function scheduleSegments(grid, segIndices, startAt = 0) {
  const out = [];
  let t = startAt;
  segIndices.forEach((i, k) => {
    const seg = grid.segments[i];
    if (!seg) throw new Error('없는 단위: ' + i);
    if (k > 0) t += grid.gapSec;
    out.push({ segment: i, at: t });
    t += seg.duration;
  });
  return out;
}

// 단위들의 조각 배치: [{ beat, segment, path, sound, when }]. 단위 하나만 주면 그 단위를 다시 듣는 배치다.
export function clipSchedule(grid, segIndices, startAt = 0) {
  const out = [];
  for (const { segment, at } of scheduleSegments(grid, segIndices, startAt)) {
    const seg = grid.segments[segment];
    for (const bi of seg.beats) {
      const b = grid.beats[bi];
      out.push({ beat: bi, segment, path: b.path, sound: b.sound ?? null, when: at + (b.time - seg.start) });
    }
  }
  return out;
}

// 탭 하나를 박 하나에 대 본다. 보정값은 탭 시각에서 뺀다(spec 13 저장 형식 calibrationOffsetMs).
export function judgeTap(beatTime, tapTime, { offsetMs = 0, windowMs = TAP_WINDOW_MS } = {}) {
  const deltaMs = toMs(tapTime - offsetMs / 1000 - beatTime);
  return { inside: Math.abs(deltaMs) <= windowMs, deltaMs };
}

// 두드리기 회차. 소리 판이 단위를 낼 때 arm(단위, 시작 시각)으로 열고, 단위가 끝나면 close(단위)로 닫는다.
// close 결과의 replay가 true면 그 단위를 다시 듣게 한다(spec 5.3). 놓친 박은 회차 전체로 쌓아
// 기준(MISS_SUGGEST_SLASH)에 닿는 순간 한 번 suggestSlash: true를 돌려준다.
// 박이 아닌 칸(offbeat: 고려가요 여음·후렴)에는 판정 창을 열지 않고, 놓친 박으로도 세지 않는다.
// 그래서 후렴만 있는 줄은 듣기만 하면 통과한다.
export function createTapSession(grid, { offsetMs = 0, windowMs = TAP_WINDOW_MS, missLimit = MISS_SUGGEST_SLASH } = {}) {
  const armed = new Map();          // 단위 → [{ beat, time, hit }]
  const passed = new Set();
  const missesBy = grid.segments.map(() => 0);
  let totalMissed = 0;
  let suggested = false;

  return {
    arm(segIndex, at) {
      const seg = grid.segments[segIndex];
      if (!seg) throw new Error('없는 단위: ' + segIndex);
      armed.set(segIndex, seg.beats.filter((bi) => !grid.beats[bi].offbeat).map((bi) => ({ beat: bi, time: at + (grid.beats[bi].time - seg.start), hit: false })));
    },
    disarm(segIndex) { armed.delete(segIndex); },
    tap(tapTime) {
      if (typeof tapTime !== 'number' || !Number.isFinite(tapTime)) return { hit: false, ignored: true };
      let best = null;
      for (const [segIndex, list] of armed) {
        for (const e of list) {
          if (e.hit) continue;
          const j = judgeTap(e.time, tapTime, { offsetMs, windowMs });
          if (j.inside && (!best || Math.abs(j.deltaMs) < Math.abs(best.deltaMs))) best = { e, segIndex, deltaMs: j.deltaMs };
        }
      }
      if (!best) return { hit: false };
      best.e.hit = true;
      const b = grid.beats[best.e.beat];
      return { hit: true, beat: b.index, segment: best.segIndex, unit: b.unit, line: b.line, foot: b.foot, deltaMs: best.deltaMs };
    },
    close(segIndex) {
      const list = armed.get(segIndex) ?? grid.segments[segIndex].beats.filter((bi) => !grid.beats[bi].offbeat).map((bi) => ({ beat: bi, hit: false }));
      armed.delete(segIndex);
      const missedBeats = list.filter((e) => !e.hit).map((e) => e.beat);
      const missed = missedBeats.length;
      missesBy[segIndex] += missed;
      totalMissed += missed;
      let suggestSlash = false;
      if (!suggested && totalMissed >= missLimit) { suggested = true; suggestSlash = true; }
      if (missed === 0) passed.add(segIndex);
      return { segment: segIndex, ok: missed === 0, missed, missedBeats, totalMissed, suggestSlash, replay: missed > 0 };
    },
    // 박이 하나도 없는 단위(후렴만 있는 줄): 두드릴 것이 없어 듣기만 한다
    listenOnly: (segIndex) => (grid.segments[segIndex]?.beats ?? []).every((bi) => !!grid.beats[bi].offbeat),
    missesBySegment: () => missesBy.slice(),
    totalMissed: () => totalMissed,
    done: () => passed.size === grid.segments.length,
  };
}

// ── 박자 보정(spec 15) ──

// 종소리 시각들
export function calibrationBells({ count = CALIBRATION_BEATS, intervalSec = CALIBRATION_INTERVAL_SEC, startAt = 0 } = {}) {
  return Array.from({ length: count }, (_, i) => startAt + i * intervalSec);
}

// 효과음 박만 있는 박자 칸: 단위 하나, sound 박 count개(낭송 조각 없음)
export function pulseGrid({ count, intervalSec, sound }) {
  if (!(count > 0) || !(intervalSec > 0)) throw new Error('박 수와 간격은 0보다 커야 한다');
  const beats = Array.from({ length: count }, (_, i) => ({ unit: 0, line: null, foot: i, path: null, sound }));
  return { songId: null, genre: null, tempo: 60 / intervalSec, beatSec: intervalSec, ...layout([{ unit: 0, line: null, beatSec: intervalSec, beats }], 0) };
}

// 보정용 박자 칸: 단위 하나, 종소리 박 count개(낭송 조각 없음)
export function calibrationGrid({ count = CALIBRATION_BEATS, intervalSec = CALIBRATION_INTERVAL_SEC } = {}) {
  return pulseGrid({ count, intervalSec, sound: 'bell' });
}

// 걷기 한 걸음의 박자 칸: 노래 빠르기로 장구 네 번(spec 5.4 '네 박마다 한 걸음')
export const WALK_STEP_BEATS = 4;
export function walkStepGrid(song, opts = {}) {
  return pulseGrid({ count: WALK_STEP_BEATS, intervalSec: 60 / tempoOf(song, opts), sound: 'janggu' });
}

// 종소리 시각과 탭 시각으로 보정값(ms)을 계산한다. 보정값 = 탭 - 종의 중앙값(늦게 치는 기기면 양수).
// 탭마다 가장 가까운 종에 짝짓고, 한 종에는 가장 가까운 탭 하나만 둔다. 너무 먼 탭은 버린다.
// 평균이 아니라 중앙값을 쓴다: 미리 알 수 없는 첫 종에 늦게 반응한 탭 하나가 보정값을 끌고 가지 않게.
// 짝이 minMatched보다 적으면(건너뜀 포함) ok: false, 보정값 0.
export function calibrationOffset(bellTimes, tapTimes, opts = {}) {
  const bells = arr(bellTimes);
  const minGap = bells.slice(1).reduce((m, b, i) => Math.min(m, b - bells[i]), Infinity);
  const maxDeltaMs = opts.maxDeltaMs ?? (Number.isFinite(minGap) ? Math.min(400, (minGap * 1000) / 2) : 400);
  const minMatched = opts.minMatched ?? CALIBRATION_MIN_MATCHED;
  const best = new Map(); // 종 번호 → 차이(ms)
  for (const t of arr(tapTimes)) {
    if (typeof t !== 'number' || !bells.length) continue;
    let bi = 0;
    for (let i = 1; i < bells.length; i++) if (Math.abs(t - bells[i]) < Math.abs(t - bells[bi])) bi = i;
    const d = toMs(t - bells[bi]);
    if (Math.abs(d) > maxDeltaMs) continue;
    if (!best.has(bi) || Math.abs(d) < Math.abs(best.get(bi))) best.set(bi, d);
  }
  const deltas = [...best.values()];
  if (deltas.length < minMatched) return { ok: false, offsetMs: CALIBRATION_SKIP_OFFSET_MS, matched: deltas.length };
  const sorted = deltas.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { ok: true, offsetMs: Math.round(median), matched: deltas.length };
}

// ── 리믹스(spec 10.2 2단계, js/data/README.md 5절) ──

// 리믹스 박자 칸. getSong(id) → 노래 객체. 조각마다 그 노래의 빠르기로 단위를 놓는다.
// 더해지는 값: fragments[i] = { index, songId, genre, segments:[단위 번호] }, switches[k] = 조각 k+1의 첫 단위 번호(지점 k)
export function buildRemixGrid(remix, getSong, opts = {}) {
  const parts = [];
  const fragments = [];
  arr(remix?.fragments).forEach((f, fi) => {
    const song = getSong(f.songId);
    if (!song) throw new Error('리믹스 조각의 노래가 없다: ' + f.songId);
    const beatSec = 60 / tempoOf(song);
    const units = tapUnits(song).filter((u) => u.unit >= f.from && u.unit <= f.to);
    if (!units.length) throw new Error('리믹스 조각의 단위 범위가 비었다: ' + f.songId + ' ' + f.from + '~' + f.to);
    const segs = [];
    for (const u of units) { segs.push(parts.length); parts.push({ ...u, beatSec, songId: song.id, fragment: fi }); }
    fragments.push({ index: fi, songId: song.id, genre: song.genre, segments: segs });
  });
  const grid = { songId: null, genre: null, ...layout(parts, opts.gapSec ?? SEGMENT_GAP_SEC) };
  grid.fragments = fragments;
  grid.switches = fragments.slice(1).map((f) => f.segments[0]);
  return grid;
}

// 지점들의 시각(리믹스를 startAt부터 끊김 없이 낼 때)
export function remixSwitchTimes(grid, startAt = 0) {
  const plan = scheduleSegments(grid, grid.segments.map((s) => s.index), startAt);
  return grid.switches.map((seg) => plan.find((p) => p.segment === seg).at);
}

// 놓친 지점을 다시 들려줄 단위: 앞 조각의 끝 단위 + 뒤 조각의 첫 단위
export function remixReplaySegments(grid, point) {
  const before = grid.fragments[point]?.segments;
  const after = grid.fragments[point + 1]?.segments;
  if (!before || !after) throw new Error('없는 리믹스 지점: ' + point);
  return [before[before.length - 1], after[0]];
}

// 리믹스 회차. 소리 판이 단위를 낼 때 arm(단위, 시작 시각)을 부르면, 그 단위가 조각의 첫 단위일 때 지점 시각이 정해진다.
// tap 결과 kind: 'hit'(지점 근처, 처음 맞힘) | 'repeat'(이미 맞힌 지점 근처) | 'wrong'(지점 근처가 아님, 보스 '틀림') | 'ignored'
export function createRemixSession(grid, { offsetMs = 0, window = REMIX_WINDOW_MS } = {}) {
  const pointOf = new Map(grid.switches.map((seg, p) => [seg, p]));
  const at = grid.switches.map(() => null);
  const hit = grid.switches.map(() => false);
  return {
    arm(segIndex, startAt) { if (pointOf.has(segIndex)) at[pointOf.get(segIndex)] = startAt; },
    disarm() {},
    tap(tapTime) {
      if (typeof tapTime !== 'number' || !Number.isFinite(tapTime)) return { kind: 'ignored' };
      const t = tapTime - offsetMs / 1000;
      let open = null;
      let repeat = null;
      at.forEach((pt, p) => {
        if (pt === null) return;
        const d = toMs(t - pt);
        if (d < -window.before || d > window.after) return;
        if (hit[p]) { if (!repeat || Math.abs(d) < Math.abs(repeat.d)) repeat = { p, d }; }
        else if (!open || Math.abs(d) < Math.abs(open.d)) open = { p, d };
      });
      if (open) { hit[open.p] = true; return { kind: 'hit', point: open.p, deltaMs: open.d }; }
      if (repeat) return { kind: 'repeat', point: repeat.p, deltaMs: repeat.d };
      return { kind: 'wrong' };
    },
    isHit: (p) => hit[p],
    missedPoints: () => hit.map((h, p) => (h ? -1 : p)).filter((p) => p >= 0),
    done: () => hit.every(Boolean),
  };
}

// ── 박자 없는 상태(spec 20): 소리 끔이나 빗금 모드면 박자에 기대는 곳이 박자 없는 방식으로 바뀐다 ──
export function noBeatState({ muted = false, slashMode = false } = {}) {
  if (muted) return { value: true, reason: 'muted' };
  if (slashMode) return { value: true, reason: 'slash' };
  return { value: false, reason: null };
}
