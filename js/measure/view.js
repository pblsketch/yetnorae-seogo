// 두루마리의 글 보기. 노래 조각(text.js)을 쪽으로 나누어 보이고, 틈·말 누르기를 단계(접기·빗금·고유 동작)에 넘긴다.
//
// 보이는 방식 둘
//  - 이어진 글줄(flow): 단위 경계가 지워진 채 말이 이어진다. 말과 말 사이마다 누를 수 있는 틈(.m-gap)이 있다(접기).
//  - 단위 덩이(blocks): 단위마다 한 덩이, 고려가요는 줄마다 한 줄. 말(.m-word)을 누를 수 있게 할 수 있다(빗금·고유 동작).
// 쪽 나누기: 지금 글 상자에 들어가는 만큼 단위를 담는다. 한 단위가 넘치면 음보(풀이는 말) 경계에서 나눈다.
// 이어진 글줄에서는 다음 쪽 첫 말을 흐리게 함께 보여, 쪽 끝의 틈도 누를 수 있게 한다.
// 꾸밈(불 켜짐, 빗금, 고리, 접힘)은 글자 배치를 바꾸지 않는 표시만 쓴다. 그래서 꾸밈을 바꿔도 쪽이 넘치지 않는다.
// 고려가요의 여음·후렴·되풀이 머리(박에 들지 않는 음보)는 단위 덩이에서 이름표(글자)와 점선 테두리로 늘 표시한다.
// 색에만 기대지 않는다. 이름표는 같은 표시가 이어지는 첫 음보(쪽이 그 가운데서 시작하면 쪽 첫 음보)에만 붙인다.
// 낱말 안에서 나눈 음보(joined)는 앞 음보와 띄우지 않고 가는 경계선만 보인다.
import { piecesOf } from './text.js';
import { MARK_NAMES } from './labels.js';

export function createTextView(area, { song, layer = 'original' } = {}) {
  let curLayer = layer;
  let pieces = piecesOf(song, curLayer);
  let mode = { flow: false, interactive: null };
  let pages = [[0, pieces.length]];
  let page = 0;
  let dirty = true;
  const wordEls = new Map();   // 조각 번호 → 요소
  const gapEls = new Map();    // 왼쪽 조각 번호 → 틈 요소
  const listeners = new Set();
  let disposed = false;

  const isGloss = () => curLayer === 'gloss';
  const interactiveWords = () => mode.interactive === 'word' && !isGloss();
  const interactiveGaps = () => mode.flow && mode.interactive === 'gap' && !isGloss();

  function makeWord(p, lookahead = false) {
    const button = interactiveWords() && !lookahead && (!mode.wordFilter || mode.wordFilter(p));
    const el = document.createElement(button ? 'button' : 'span');
    if (button) el.type = 'button';
    el.className = 'm-word' + (lookahead ? ' is-lookahead' : '');
    el.dataset.u = p.u;
    el.dataset.l = p.l ?? '';
    el.dataset.f = p.f ?? '';
    el.dataset.w = p.w;
    el.dataset.i = p.index;
    el.textContent = p.text;
    if (!lookahead) wordEls.set(p.index, el);
    return el;
  }

  function makeGap(i) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'm-gap';
    el.dataset.i = i;
    el.dataset.u = pieces[i].u;
    el.dataset.nu = pieces[i + 1].u;
    el.setAttribute('aria-label', '틈 ' + (i + 1));
    gapEls.set(i, el);
    return el;
  }

  function renderFlow(a, e) {
    const p = document.createElement('p');
    p.className = 'm-flow';
    const gaps = interactiveGaps();
    for (let i = a; i < e; i++) {
      p.append(makeWord(pieces[i]));
      if (i + 1 < pieces.length && (i + 1 < e || gaps)) {
        // 낱말 안에서 나눈 음보 사이에는 틈(접을 자리)도 띄어쓰기도 두지 않는다
        if (pieces[i + 1].joined) continue;
        if (gaps) p.append(makeGap(i));
        else p.append(' ');
      }
    }
    if (e < pieces.length && gaps) p.append(makeWord(pieces[e], true));
    return [p];
  }

  function renderBlocks(a, e) {
    const out = [];
    let unitEl = null;
    let lineEl = null;
    let footEl = null;
    for (let i = a; i < e; i++) {
      const p = pieces[i];
      const first = i === a;
      if (first || p.unitStart) {
        unitEl = document.createElement('div');
        unitEl.className = 'm-unit' + (!p.unitStart ? ' is-cont' : '');
        unitEl.dataset.u = p.u;
        out.push(unitEl);
        lineEl = null;
      }
      if (first || p.lineStart) {
        lineEl = document.createElement('div');
        lineEl.className = 'm-line' + (!p.lineStart ? ' is-cont' : '');
        lineEl.dataset.l = p.l ?? '';
        unitEl.append(lineEl);
        footEl = null;
      }
      if (p.kind === 'word' && (first || p.footStart || !footEl)) {
        footEl = document.createElement('span');
        footEl.className = 'm-foot' + (p.mark ? ' is-offbeat is-' + p.mark : '') + (p.joined ? ' is-joined' : '');
        footEl.dataset.u = p.u;
        footEl.dataset.l = p.l ?? '';
        footEl.dataset.f = p.f;
        if (p.mark) {
          footEl.dataset.mark = p.mark;
          if (p.markStart || first) {
            const tag = document.createElement('span');
            tag.className = 'm-mark';
            tag.textContent = MARK_NAMES[p.mark] ?? p.mark;
            footEl.append(tag);
          }
        }
        if (lineEl.childNodes.length && !p.joined) lineEl.append(' ');
        lineEl.append(footEl);
      }
      const host = p.kind === 'word' ? footEl : lineEl;
      if ([...host.childNodes].some((n) => !(n.classList?.contains('m-mark')))) host.append(' ');
      host.append(makeWord(p));
    }
    return out;
  }

  function render(a, e) {
    wordEls.clear();
    gapEls.clear();
    area.classList.toggle('is-flow', !!mode.flow);
    area.classList.toggle('is-grey', !!(mode.flow && mode.grey));
    area.classList.toggle('is-gloss', isGloss());
    area.classList.toggle('is-words', interactiveWords());
    area.replaceChildren(...(mode.flow ? renderFlow(a, e) : renderBlocks(a, e)));
    decorate();
  }

  function decorate() {
    for (const [i, el] of wordEls) mode.decorateWord?.(el, pieces[i]);
    for (const [i, el] of gapEls) mode.decorateGap?.(el, pieces[i], pieces[i + 1]);
  }

  const fits = () => area.scrollHeight <= area.clientHeight + 1 && area.scrollWidth <= area.clientWidth + 1;

  // 쪽 나누기
  function paginate() {
    const n = pieces.length;
    if (!area.isConnected || area.clientHeight < 8 || n === 0) { pages = [[0, n]]; dirty = true; return; }
    const unitEnds = [];
    for (let i = 1; i <= n; i++) if (i === n || pieces[i].unitStart) unitEnds.push(i);
    const breakable = (i) => i === n || (isGloss() ? true : pieces[i].footStart);
    const lineBreak = (i) => i === n || pieces[i].lineStart;
    const out = [];
    let a = 0;
    while (a < n) {
      let best = -1;
      for (const e of unitEnds) {
        if (e <= a) continue;
        render(a, e);
        if (fits()) best = e; else break;
      }
      if (best < 0) {
        const nextEnd = unitEnds.find((e) => e > a);
        // 단위 하나가 넘친다: 줄 경계를 먼저, 안 되면 음보(풀이는 말) 경계에서 나눈다
        let cands = [];
        for (let i = a + 1; i <= nextEnd; i++) if (lineBreak(i) && breakable(i)) cands.push(i);
        let found = search(a, cands);
        if (found < 0) {
          cands = [];
          for (let i = a + 1; i <= nextEnd; i++) if (breakable(i)) cands.push(i);
          found = search(a, cands);
          if (found < 0) found = cands[0] ?? nextEnd;
        }
        best = found;
      }
      out.push([a, best]);
      a = best;
    }
    pages = out;
    dirty = false;
  }

  // cands 가운데 들어가는 가장 먼 끝(없으면 -1)
  function search(a, cands) {
    let lo = 0;
    let hi = cands.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      render(a, cands[mid]);
      if (fits()) { found = cands[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
  }

  function pageOfIndex(i) {
    const k = pages.findIndex(([a, e]) => i >= a && i < e);
    return k < 0 ? 0 : k;
  }

  function show(k) {
    page = Math.max(0, Math.min(pages.length - 1, k));
    const [a, e] = pages[page];
    render(a, e);
    for (const fn of listeners) fn();
  }

  // 지금 쪽의 첫 조각을 기준으로 다시 나눈다
  function relayout() {
    if (disposed) return;
    const anchor = pieces[pages[page]?.[0] ?? 0];
    paginate();
    let k = 0;
    if (anchor) {
      const i = pieces.findIndex((p) => p.u === anchor.u && (p.l ?? null) === (anchor.l ?? null) && (p.f === null || anchor.f === null || p.f >= anchor.f));
      if (i >= 0) k = pageOfIndex(i);
    }
    show(k);
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!disposed) relayout(); }) : null;
  ro?.observe(area);

  function onClick(ev) {
    const gap = ev.target.closest?.('.m-gap');
    if (gap && area.contains(gap)) {
      const i = Number(gap.dataset.i);
      mode.onGap?.(pieces[i], pieces[i + 1], gap);
      return;
    }
    const word = ev.target.closest?.('button.m-word');
    if (word && area.contains(word)) mode.onWord?.(pieces[Number(word.dataset.i)], word);
  }
  area.addEventListener('click', onClick);

  return {
    get layer() { return curLayer; },
    get pieces() { return pieces; },
    get page() { return page; },
    get pageCount() { return pages.length; },
    get range() { return pages[page] ?? [0, 0]; },
    get isGloss() { return isGloss(); },
    setLayer(next) {
      if (next === curLayer) return;
      const anchor = pieces[pages[page]?.[0] ?? 0];
      curLayer = next;
      pieces = piecesOf(song, curLayer);
      pages = [[0, pieces.length]];
      page = 0;
      paginate();
      let k = 0;
      if (anchor) {
        const i = pieces.findIndex((p) => p.u === anchor.u && (anchor.l === null || p.l === null || p.l >= anchor.l));
        if (i >= 0) k = pageOfIndex(i);
      }
      show(k);
    },
    // 보이는 방식과 누르기 처리를 바꾼다. { flow, interactive: 'gap'|'word'|null, grey, onGap, onWord, decorateWord, decorateGap,
    //   wordFilter(조각) → 그 말을 누를 수 있게 할지(없으면 모두) }
    setMode(next) {
      mode = { flow: false, interactive: null, ...next };
      relayout();
    },
    relayout,
    refresh: decorate,
    show,
    next() { show(page + 1); },
    prev() { show(page - 1); },
    // 조건에 맞는 첫 조각이 있는 쪽으로
    goTo(pred) {
      if (dirty) paginate();
      const i = pieces.findIndex(pred);
      if (i >= 0) show(pageOfIndex(i));
    },
    // 조건(쪽 범위 [a, e]를 받는 함수)에 맞는 첫 쪽으로. 없으면 false
    goToPageWhere(fn) {
      const k = pages.findIndex((r) => fn(r));
      if (k < 0) return false;
      if (k !== page) show(k);
      return true;
    },
    pageRanges: () => pages.slice(),
    wordEl: (i) => wordEls.get(i) ?? null,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() {
      disposed = true;
      ro?.disconnect();
      area.removeEventListener('click', onClick);
      listeners.clear();
    },
  };
}

// 흔들기: 틀린 곳은 살짝 흔들리기만 하고 기록은 남기지 않는다(spec 5.3)
export function shake(el) {
  if (!el) return;
  el.classList.remove('is-shake');
  // 다시 붙여 애니메이션을 처음부터
  void el.offsetWidth;
  el.classList.add('is-shake');
  clearTimeout(el._shakeTimer);
  el._shakeTimer = setTimeout(() => el.classList.remove('is-shake'), 450);
}
