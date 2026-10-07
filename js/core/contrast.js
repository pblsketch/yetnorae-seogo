// 맞대어 보기(오답 뒤): 노래의 감정서 가운데 어느 줄이 그 자리(갈래 또는 향가관 탑의 층)와 어긋나는지 찾는다.
// 화면과 상관없는 순수 함수만 둔다(브라우저 전역을 쓰지 않는다). Node에서 바로 import된다.
// 감정서는 노래 데이터에서 계산한 값(song-shape.js deriveSheet)과 언제나 같으므로 노래와 동작 id만으로 계산한다.
//
// mismatches(song, target, actionIds) → [{ lineKind, conceptId, action? }]
//   target     { genre } — 칸·덤(그 관 갈래), 바구니(고른 행선지 관의 갈래), 보스 관 자리(그 자리 갈래)
//              { towerUnits: n } — 향가관 탑의 n구 층
//   actionIds  감정서에 실린 고유 동작 id. 문자열 하나(관), 목록(보스: 학생이 실제로 쓴 도구), null(고유 동작 줄 없음)
//   lineKind   감정서 줄의 종류: 'fold'(접기) · 'tap'(두드리기) · 'action'(고유 동작, action에 그 동작 id) · 'refrains'
//              ('refrains'는 형식에 둘 뿐 지금 규칙에는 없다)
//   conceptId  그 줄과 맞부딪치는 대상 갈래의 개념(『분류 수첩』 줄의 conceptIds와 짝을 짓는다)
//
// 건전성(어기면 안 되는 약속): 어떤 규칙도 대상 갈래의 노래를 걸지 않는다. 곧 모든 노래와 모든 동작에서
// mismatches(song, { genre: song.genre }, 동작)은 비어 있고, 향가 칸 노래는 자기 층에서 비어 있다.
// contrastSoundness가 이것을 실제 데이터로 확인한다(tests/check-data.mjs).
import { deriveFoldEvidence, deriveTapEvidence, deriveActionEvidence, HYANGGA_GU_COUNTS, GASA_FOUR_FOOT_MIN_RATIO } from './song-shape.js';

const arr = (v) => (Array.isArray(v) ? v : []);

// 두드리기 증거가 감정서에 보이는 모양 그대로의 두드린 수 목록.
// 향가는 덩이 하나에 한 번(구 수를 세는 두드리기라 음보가 아니다), 고려가요는 박에 드는 음보가 있는 줄마다, 나머지는 덩이마다 음보 수.
export function tapCounts(tap) {
  if (!tap) return [];
  if (tap.mode === 'gu') return Array.from({ length: tap.gu ?? 0 }, () => 1);
  if (tap.mode === 'lines') return arr(tap.feet).flat().filter((c) => c > 0);
  return arr(tap.feet);
}

// 대상의 갈래(탑은 향가)
export function targetGenre(target) {
  if (target && Number.isInteger(target.towerUnits)) return 'hyangga';
  return target?.genre ?? null;
}

// 규칙 하나: { genre | tower: true, lineKind, action?(고유 동작 줄일 때 그 동작), conceptId, test(증거, 동작 증거, 대상) }
// test가 참이면 그 줄이 대상과 어긋난다. 규칙을 더하거나 고치면 check-data의 건전성 점검을 다시 돌린다.
const tower = (lineKind, conceptId, test, action) => ({ tower: true, lineKind, conceptId, test, action });
const rule = (genre, lineKind, conceptId, test, action) => ({ genre, lineKind, conceptId, test, action });

export const CONTRAST_RULES = Object.freeze([
  // ── 향가: 4·8·10구, 10구체 9구 첫머리 감탄사 ──
  // 두드리기 방식(구 하나에 한 번 두드려 구 수를 셈)은 프로그램이 노래 갈래를 보고 고른 것이라 학생의 증거가 아니다.
  // 그래서 '구마다 한 번이 아니다'를 향가와 어긋나는 근거로 쓰지 않는다(Codex 점검 C3, 2026-10-07).
  rule('hyangga', 'fold', 'hyangga-lines', (e) => !HYANGGA_GU_COUNTS.includes(e.fold.units)),
  rule('hyangga', 'action', 'hyangga-exclaim', (e, a) => e.fold.units === 10 && !a.present, 'aa-door'),
  // ── 향가관 탑의 n구 층 ──
  tower('fold', 'hyangga-lines', (e, a, t) => e.fold.units !== t.towerUnits),
  tower('action', 'hyangga-exclaim', (e, a, t) => t.towerUnits === 10 && !a.present, 'aa-door'),
  // ── 고려가요: 한 줄이 대개 세 음보, 후렴·여음이 있다 ──
  // 세 음보가 중심이지만 네 음보·두 음보 줄도 끼는 갈래라(한국민족문화대백과사전 「속요」) 비율이나 '네 음보 줄 하나'로 걸지 않는다.
  // 음보로 센 두드리기(향가의 구 세기가 아님)에서 세 음보인 줄·덩이가 하나도 없을 때만 어긋난다(Codex 점검 C2, 2026-10-07).
  rule('goryeo', 'tap', 'goryeo-3beat', (e) => { if (e.tap.mode === 'gu') return false; const c = tapCounts(e.tap); return c.length > 0 && !c.includes(3); }),
  rule('goryeo', 'action', 'goryeo-refrain', (e, a) => !a.present, 'refrain-link'),
  // ── 시조: 세 장, 장마다 네 음보, 종장 첫 음보 세 글자 ──
  rule('sijo', 'fold', 'sijo-3jang', (e) => e.fold.units !== 3),
  rule('sijo', 'tap', 'sijo-4beat', (e) => tapCounts(e.tap).some((c) => c !== 4)),
  rule('sijo', 'action', 'sijo-final3', (e, a) => !a.applicable || a.syllables !== 3, 'stairs'),
  rule('sijo', 'action', 'sijo-3jang', (e, a) => a.steps !== 3, 'walk'),
  rule('sijo', 'action', 'sijo-3jang', (e, a) => !a.applicable, 'rapid-unroll'),
  rule('sijo', 'action', 'sijo-4beat', (e, a) => a.applicable && a.overFour, 'rapid-unroll'),
  // ── 가사: 네 음보가 이어진다, 행 수에 끝이 없다(세 장에서 멈추지 않는다) ──
  rule('gasa', 'tap', 'gasa-4beat', (e) => { const c = tapCounts(e.tap); return !c.length || c.filter((x) => x === 4).length / c.length < GASA_FOUR_FOOT_MIN_RATIO; }),
  rule('gasa', 'fold', 'gasa-nolimit', (e) => e.fold.units < 4),
  rule('gasa', 'action', 'gasa-nolimit', (e, a) => a.steps < 4, 'walk'),
  rule('gasa', 'action', 'gasa-nolimit', (e, a) => a.applicable, 'stairs'),
  rule('gasa', 'action', 'gasa-nolimit', (e, a) => a.applicable, 'rapid-unroll'),
  // ── 사설시조: 초장이나 중장이 늘어난다, 세 장에서 멈추고 종장 첫 음보는 세 글자 ──
  rule('saseol', 'tap', 'saseol-middle', (e) => { const c = tapCounts(e.tap); return !((c[0] ?? 0) > 4 || (c[1] ?? 0) > 4); }),
  rule('saseol', 'fold', 'saseol-frame', (e) => e.fold.units !== 3),
  rule('saseol', 'action', 'saseol-middle', (e, a) => !a.applicable || !a.overFour, 'rapid-unroll'),
  rule('saseol', 'action', 'saseol-frame', (e, a) => !a.applicable || a.syllables !== 3, 'stairs'),
  rule('saseol', 'action', 'saseol-frame', (e, a) => a.steps !== 3, 'walk'),
]);

// 맞대어 보기에서 어긋나는 줄의 개념과 짝지을 『분류 수첩』 줄을 고른다.
// 개념마다 그 개념을 가진 줄 가운데 가장 좁은 줄(개념 수가 가장 적은 줄)만 고른다. 여러 개념을 묶은 줄(예: 사설시조와 가사를
// 견주는 줄)은 더 좁은 줄이 없을 때만 짝이 된다(Codex 점검 B2: 덩이 수 어긋남에 무관한 줄까지 밝아지지 않게).
// lines: [{ id, conceptIds }] → 짝이 되는 줄 id 목록(수첩 순서)
export function pairedLineIds(conceptIds, lines) {
  const ids = new Set();
  const list = arr(lines);
  for (const c of arr(conceptIds)) {
    const having = list.filter((l) => arr(l?.conceptIds).includes(c));
    if (!having.length) continue;
    const narrow = Math.min(...having.map((l) => arr(l.conceptIds).length));
    for (const l of having) if (arr(l.conceptIds).length === narrow) ids.add(l.id);
  }
  return list.filter((l) => ids.has(l.id)).map((l) => l.id);
}

function evidenceOf(song, actionIds) {
  const ids = actionIds == null ? [] : (Array.isArray(actionIds) ? actionIds : [actionIds]);
  const actions = [];
  for (const id of ids) if (typeof id === 'string' && !actions.some((a) => a.action === id)) actions.push(deriveActionEvidence(id, song));
  return { fold: deriveFoldEvidence(song), tap: deriveTapEvidence(song), actions };
}

export function mismatches(song, target, actionIds = null, rules = CONTRAST_RULES) {
  if (!song || !target) return [];
  const isTower = Number.isInteger(target.towerUnits);
  const genre = targetGenre(target);
  const e = evidenceOf(song, actionIds);
  const out = [];
  const push = (m) => {
    if (!out.some((x) => x.lineKind === m.lineKind && x.conceptId === m.conceptId && x.action === m.action)) out.push(m);
  };
  for (const r of rules) {
    if (isTower ? !r.tower : (r.tower || r.genre !== genre)) continue;
    if (r.lineKind === 'action') {
      for (const a of e.actions) {
        if (a.action !== r.action) continue;
        if (r.test(e, a, target)) push({ lineKind: 'action', conceptId: r.conceptId, action: a.action });
      }
    } else if (r.test(e, null, target)) {
      push({ lineKind: r.lineKind, conceptId: r.conceptId });
    }
  }
  return out;
}

// 건전성: 규칙이 대상 갈래의 노래를 걸면 위반이다. songs: 노래 목록, actionIds: 볼 동작 id 목록.
// 향가관 탑은 shelfFloors가 있는 관의 칸 노래를 자기 층으로 본다(tableWings: 노래 표의 wings).
// 돌려주는 것: [{ songId, target, actionId, found }]
export function contrastSoundness(songs, actionIds, { rules = CONTRAST_RULES, tableWings = {} } = {}) {
  const out = [];
  const actionSets = [null, ...actionIds.map((a) => [a]), actionIds];
  for (const song of arr(songs)) {
    for (const ids of actionSets) {
      const found = mismatches(song, { genre: song.genre }, ids, rules);
      if (found.length) out.push({ songId: song.id, target: { genre: song.genre }, actionId: ids, found });
    }
  }
  for (const w of Object.values(tableWings ?? {})) {
    if (!Array.isArray(w?.shelfFloors)) continue;
    w.shelf.forEach((id, i) => {
      const song = arr(songs).find((s) => s.id === id);
      if (!song) return;
      for (const ids of actionSets) {
        const found = mismatches(song, { towerUnits: w.shelfFloors[i] }, ids, rules);
        if (found.length) out.push({ songId: id, target: { towerUnits: w.shelfFloors[i] }, actionId: ids, found });
      }
    });
  }
  return out;
}
