// 분석표(감정서, spec 5.5): 모은 증거를 말로 옮긴다. 갈래 이름 칸은 없다.
// 증거 객체의 모양은 js/data/README.md 6절이다. 이 파일은 보이는 글만 만든다.
import { count, L } from './labels.js';
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

// 두드리기 증거. 고려가요 줄은 박에 드는 음보만 센다(여음·후렴만 있는 줄은 빼고 센다).
// '부분'으로 부를 때(neutral: 보스, 그리고 관·입구에서 드러나기 전의 노래)는 '줄'이라는 말도 갈래를 드러내므로 '부분'으로 쓴다.
function tapLine(sheet, unit, neutral) {
  const t = sheet.tap;
  // 향가는 구 수를 세려고 구 하나에 한 번씩 두드린다(향가의 운율이 '구마다 한 박'이라는 뜻이 아니다, Codex 점검 C3)
  if (t.mode === 'gu') return L.sheetTapGu(unit, count(t.gu, '번'));
  const list = t.mode === 'lines' ? t.feet.flat().filter((c) => c > 0) : t.feet;
  const per = t.mode === 'lines' && !neutral ? '줄' : unit;
  if (list.length && list.every((c) => c === list[0])) return '[' + per + '마다 ' + count(list[0], '음보') + ']';
  if (list.length <= MAX_LIST) return '[' + per + '마다 음보 ' + list.join(' · ') + ']';
  const [value, times] = mostCommon(list);
  return '[' + per + ' ' + list.length + '개 가운데 ' + times + '개가 ' + count(value, '음보') + ']';
}

// 걷기: 세 걸음 전에 멈춤 / 세 걸음에서 멈춤 / 세 걸음을 넘어 이어짐
export function walkWords(steps) {
  if (steps < 3) return L.sheetWalk.before;
  if (steps === 3) return L.sheetWalk.at;
  return L.sheetWalk.beyond;
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
      return '[' + a.steps + '걸음 — ' + walkWords(a.steps) + ']';
    case 'rapid-unroll':
      if (!a.applicable) return '[가운데 장 없음]';
      return '[가운데 장 ' + count(a.middleFeet, '음보') + ' — ' + (a.overFour ? '네 음보를 넘는다' : '네 음보를 넘지 않는다') + ']';
    default:
      return '';
  }
}

// [{ kind: 'fold' | 'tap' | 'action' | 'refrains', text }]
// '[여음·후렴이 있다]'는 후렴 고리 걸기(고려가요관의 고유 동작)가 되풀이 구절을 찾았을 때만 그 줄 뒤에 붙인다.
// 두드리기에서 여음·후렴을 건너뛴 것만으로는 적지 않는다. 그래야 고유 동작이 그 증거를 맡고(spec 5.4),
// 보스에서도 그 도구를 쓰기 전에는 갈래를 알려 주는 줄이 나오지 않는다.
// neutral: 단위를 '부분'이라 부른다(드러나기 전의 노래, 보스). 감정서 줄에 갈래 단위 이름(구·연·줄·장·행)이 나오지 않는다.
export function sheetLines(sheet, song, { neutral = false } = {}) {
  const unit = unitName(song, neutral);
  const out = [];
  if (sheet.fold) out.push({ kind: 'fold', text: foldLine(sheet, unit) });
  if (sheet.tap) out.push({ kind: 'tap', text: tapLine(sheet, unit, neutral) });
  const actions = sheet.actions ?? (sheet.action ? [sheet.action] : []);
  let refrains = false;
  for (const a of actions) {
    out.push({ kind: 'action', action: a.action, text: actionLine(a, song, unit) });
    if (a.action === 'refrain-link' && a.present && !refrains) {
      refrains = true;
      out.push({ kind: 'refrains', action: a.action, text: L.sheetRefrains });
    }
  }
  return out;
}

export function renderSheet(container, sheet, song, opts = {}) {
  const box = document.createElement('section');
  box.className = 'm-sheet';
  const h = document.createElement('h3');
  h.className = 'm-sheet-title';
  h.textContent = opts.title ?? L.sheetTitle;
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
