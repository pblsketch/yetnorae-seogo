// 감정서(spec 5.5): 모은 증거를 말로 옮긴다. 갈래 이름 칸은 없다.
// 증거 객체의 모양은 js/data/README.md 6절이다. 이 파일은 보이는 글만 만든다.
import { count } from './labels.js';
import { unitName } from './text.js';

const MAX_LIST = 5;

function mostCommon(list) {
  const m = new Map();
  for (const v of list) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0, 0];
}

function foldLine(sheet, unit) {
  return '[' + count(sheet.fold.units, unit) + ']';
}

function tapLine(sheet, unit) {
  const t = sheet.tap;
  if (t.mode === 'gu') return '[' + unit + '마다 한 박, 모두 ' + count(t.gu, '박') + ']';
  const list = t.mode === 'lines' ? t.feet.flat() : t.feet;
  const per = t.mode === 'lines' ? '줄' : unit;
  if (list.length && list.every((c) => c === list[0])) return '[' + per + '마다 ' + count(list[0], '음보') + ']';
  if (list.length <= MAX_LIST) return '[' + per + '마다 음보 ' + list.join(' · ') + ']';
  const [value, times] = mostCommon(list);
  return '[' + per + ' ' + list.length + '개 가운데 ' + times + '개가 ' + count(value, '음보') + ']';
}

function actionLine(a, song, unit) {
  switch (a.action) {
    case 'aa-door':
      if (!a.present) return '[첫머리 감탄사 없음]';
      return '[' + (a.unit + 1) + '번째 ' + unit + ' 첫머리에 감탄사 ‘' + (song.features?.exclamation?.text ?? '') + '’]';
    case 'refrain-link': {
      if (!a.present) return '[되풀이 구절 없음]';
      const first = song.features?.refrains?.[0]?.text ?? '';
      return '[되풀이 구절 있음: ‘' + first + '’ 등 ' + a.ranges.length + '곳]';
    }
    case 'stairs':
      return a.applicable ? '[종장 첫 음보 ' + count(a.syllables, '글자') + ']' : '[종장 없음]';
    case 'walk':
      return '[' + a.steps + '걸음 — ' + (a.stopsAtThree ? '세 걸음에서 멈춘다' : '세 걸음에서 멈추지 않고 이어진다') + ']';
    case 'rapid-unroll':
      if (!a.applicable) return '[가운데 장 없음]';
      return '[가운데 장 ' + count(a.middleFeet, '음보') + ' — ' + (a.overFour ? '네 음보를 넘는다' : '네 음보를 넘지 않는다') + ']';
    default:
      return '';
  }
}

// [{ kind: 'fold' | 'tap' | 'action', text }]
export function sheetLines(sheet, song, { neutral = false } = {}) {
  const unit = unitName(song, neutral);
  const out = [];
  if (sheet.fold) out.push({ kind: 'fold', text: foldLine(sheet, unit) });
  if (sheet.tap) out.push({ kind: 'tap', text: tapLine(sheet, unit) });
  const actions = sheet.actions ?? (sheet.action ? [sheet.action] : []);
  for (const a of actions) out.push({ kind: 'action', action: a.action, text: actionLine(a, song, unit) });
  return out;
}

export function renderSheet(container, sheet, song, opts = {}) {
  const box = document.createElement('section');
  box.className = 'm-sheet';
  const h = document.createElement('h3');
  h.className = 'm-sheet-title';
  h.textContent = opts.title ?? '감정서';
  box.append(h);
  if (opts.note) {
    const n = document.createElement('p');
    n.className = 'm-sheet-note';
    n.textContent = opts.note;
    box.append(n);
  }
  const ul = document.createElement('ul');
  ul.className = 'm-sheet-lines';
  for (const line of sheetLines(sheet, song, opts)) {
    const li = document.createElement('li');
    li.className = 'm-sheet-line';
    li.dataset.kind = line.kind;
    if (line.action) li.dataset.action = line.action;
    li.textContent = line.text;
    ul.append(li);
  }
  box.append(ul);
  container.replaceChildren(box);
  return box;
}
