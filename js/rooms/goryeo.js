// 작품 방 「정석가」(고려가요관, spec 9). 약속: js/data/README.md 7.3.
//
// 흐름
//  1. 끝나지 않을 약속 만들기: 원문 2~5연의 불가능한 조건 카드를 하나 골라 내세운다. 카드는 '약속 탑'에 쌓이고
//     그 연이 낭송된다. 임이 "그건 될 수도 있지 않소?" 하고 따지면 더 불가능한 조건으로 맞선다(실패 없음).
//  2. 카드를 정해진 수(minCardsBeforeFinal) 이상 냈거나 다 쓰면 '조건 대신 마음으로 답하기'로 마지막 구슬 연을 만난다.
//  3. 칸의 「서경별곡」을 연마다 펼쳐 같은 사설이 든 연을 찾는다. 찾으면 두 연이 나란히 놓이고 같은 줄이 짝지어진다.
//  4. '약속을 마친다' → { completed: true, record: { room: 'goryeo', lastConditionId, lastConditionText } }.
//
// - 노래 글은 노래 데이터(ctx.song, js/data/songs/index.js)에서만 꺼낸다. 방의 글은 js/data/rooms-goryeo.js에 있다.
// - 박자에 맞춰 누르는 조작이 없다. 낭송은 듣기만 하므로 박자 없는 방식(소리 끔·빗금)에서도 같은 길로 끝까지 간다.
// - ctx.signal이 중단되면 만든 것을 모두 치우고 AbortError로 끝난다. 다음에는 처음부터 한다(spec 20).
// - 진행을 저장하지 않는다. record를 돌려주면 한 판 흐름이 저장한다.
import { room as DATA } from '../data/rooms-goryeo.js';
import { songs as REGISTERED } from '../data/songs/index.js';
import { buildGrid as baseBuildGrid } from '../core/rhythm.js';
import { createAssets } from '../world/assets.js';
import { createRoom3D } from './goryeo-3d.js';
import { createRoom2D } from './goryeo-2d.js';

const STYLE_HREF = new URL('../../css/room-goryeo.css', import.meta.url).href;

function ensureStyle() {
  if (document.querySelector('link[href$="css/room-goryeo.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  link.dataset.roomStyle = 'goryeo';
  document.head.append(link);
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(className, text, onPress) {
  const b = el('button', 'rg-btn ' + className, text);
  b.type = 'button';
  b.addEventListener('click', onPress);
  return b;
}

function abortError() {
  return new DOMException('작품 방을 나갔다', 'AbortError');
}

const lineOriginal = (line) => line.feet.map((f) => f.original).join(' ');

// 후렴이 줄 전체를 덮는 줄(「서경별곡」의 '위 두어렁셩…' 줄)과, 줄 안에 끼어든 여음 음보
function refrainMarks(song) {
  const wholeLines = new Set();
  const yeoeumFeet = new Map(); // 'unit-line' → Set(음보 번호)
  for (const r of song?.features?.refrains ?? []) {
    for (const g of r.ranges ?? []) {
      const line = song.units[g.unit]?.lines?.[g.line];
      if (!line) continue;
      const key = g.unit + '-' + g.line;
      if (r.kind === 'refrain' && g.from === 0 && g.to === line.feet.length - 1) wholeLines.add(key);
      else if (r.kind === 'yeoeum') {
        if (!yeoeumFeet.has(key)) yeoeumFeet.set(key, new Set());
        for (let i = g.from; i <= g.to; i++) yeoeumFeet.get(key).add(i);
      }
    }
  }
  return { wholeLines, yeoeumFeet };
}

// 줄 하나: 원문(음보마다 칸)과 풀이. 원문 칸의 글은 노래 데이터의 음보 원문을 빈칸 하나로 이은 것과 같다.
function lineView(song, unit, index, { yeoeum = null, repeated = false, pair = null, repeatedLabel = '' } = {}) {
  const line = song.units[unit].lines[index];
  const box = el('div', 'rg-line');
  box.dataset.song = song.id;
  box.dataset.unit = String(unit);
  box.dataset.line = String(index);
  if (pair !== null) {
    box.dataset.pair = String(pair);
    box.classList.add('is-match');
    const badge = el('span', 'rg-pair', String(pair + 1));
    badge.setAttribute('aria-hidden', 'true');
    box.append(badge);
  }
  const orig = el('p', 'rg-orig');
  line.feet.forEach((f, i) => {
    if (i > 0) orig.append(' ');
    const span = el('span', 'rg-foot' + (yeoeum?.has(i) ? ' is-yeoeum' : ''), f.original);
    orig.append(span);
  });
  box.append(orig);
  if (repeated) box.append(el('span', 'rg-tag', repeatedLabel));
  box.append(el('p', 'rg-gloss', line.gloss));
  return box;
}

// 연의 줄 가운데 바로 앞 줄을 되풀이한 줄은 한 번만 보인다(되풀이 표시를 붙인다).
function distinctLines(song, unit) {
  const lines = song.units[unit].lines;
  const out = [];
  lines.forEach((l, i) => {
    if (i > 0 && lineOriginal(l) === lineOriginal(lines[i - 1])) { out[out.length - 1].repeated = true; return; }
    out.push({ index: i, repeated: false });
  });
  return out;
}

export function start(ctx = {}) {
  return new Promise((resolve, reject) => {
    const { signal } = ctx;
    if (signal?.aborted) { reject(abortError()); return; }
    const song = ctx.song;
    if (!song || song.id !== DATA.songId) { reject(new Error('「정석가」 노래 데이터가 필요하다')); return; }
    const container = ctx.container;
    if (!container) { reject(new Error('방을 그릴 container가 필요하다')); return; }

    ensureStyle();
    const T = DATA.text;
    const pool = Array.isArray(ctx.songs) ? ctx.songs : REGISTERED;
    const echoSong = pool.find((s) => s.id === DATA.echo.songId) ?? null;
    const echoMarks = refrainMarks(echoSong);
    const cards = DATA.cards.filter((c) => song.units[c.unit]?.lines?.[c.conditionLine]);
    const minCards = Math.max(1, Math.min(DATA.minCardsBeforeFinal ?? 2, cards.length));
    const reduceMotion = () => (typeof ctx.reduceMotion === 'function' ? !!ctx.reduceMotion() : !!ctx.reduceMotion);
    const mode = ctx.mode === '3d' && ctx.three?.THREE ? '3d' : '2d';

    // ── 자산 ──
    const ownAssets = !ctx.assets;
    const assets = ctx.assets ?? createAssets(ctx.manifest ?? null, mode === '3d' ? ctx.three.THREE : null);

    // ── 낭송(ctx.rhythm: 소리 엔진 + 박자 칸 함수) ──
    const engine = ctx.rhythm?.engine ?? (typeof ctx.rhythm?.play === 'function' ? ctx.rhythm : null);
    const buildGrid = ctx.rhythm?.buildGrid ?? baseBuildGrid;
    const grids = new Map();
    let playing = null;
    function stopRecital() {
      try { playing?.stop(); } catch { /* 이미 멈춤 */ }
      playing = null;
    }
    function recite(s, unit) {
      if (!engine?.play || !s) return;
      stopRecital();
      try {
        if (!grids.has(s.id)) grids.set(s.id, buildGrid(s));
        const grid = grids.get(s.id);
        const segs = grid.segments.filter((g) => g.unit === unit).map((g) => g.index);
        if (segs.length) playing = engine.play(grid, segs);
      } catch {
        playing = null; // 낭송을 못 해도 방은 이어진다
      }
    }

    // ── 화면 뼈대 ──
    container.replaceChildren();
    const root = el('div', 'room-goryeo');
    root.dataset.mode = mode;
    root.dataset.step = 'pick';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', '작품 방 「' + song.title + '」');
    const stage = el('div', 'rg-stage');
    const left = el('div', 'rg-left');
    const panel = el('div', 'rg-panel');
    root.append(stage, left, panel);
    container.append(root);

    const bubble = el('div', 'rg-bubble');
    bubble.append(el('span', 'rg-speaker', DATA.speaker));
    const say = el('p', 'rg-say');
    say.setAttribute('aria-live', 'polite');
    bubble.append(say);
    const leftBody = el('div', 'rg-left-body');
    left.append(bubble, leftBody);

    let view = null;
    try {
      view = mode === '3d'
        ? createRoom3D({ ...ctx.three, assets, reduceMotion, cards })
        : createRoom2D({ stage, assets, reduceMotion, cards });
    } catch {
      view = createRoom2D({ stage, assets, reduceMotion, cards });
      root.dataset.mode = '2d';
    }

    // ── 상태 ──
    const used = [];
    let finished = false;

    function setSay(text) {
      say.textContent = text;
      view.speak?.();
    }

    function focusFirst(scope) {
      const b = scope.querySelector('button:not([disabled])');
      b?.focus({ preventScroll: true });
    }

    // 1단계: 조건 카드
    function renderPick() {
      root.dataset.step = 'pick';
      panel.replaceChildren();
      panel.append(el('h2', 'rg-title', T.title));
      const remaining = cards.filter((c) => !used.includes(c.id));
      const prompt = used.length === 0 ? T.intro : remaining.length ? T.escalate : T.allUsed;
      panel.append(el('p', 'rg-prompt', prompt));
      if (remaining.length) {
        const hand = el('div', 'rg-hand');
        for (const c of remaining) {
          const b = el('button', 'rg-card');
          b.type = 'button';
          b.dataset.cardId = c.id;
          b.append(el('span', 'rg-card-label', c.label));
          b.append(el('span', 'rg-orig', lineOriginal(song.units[c.unit].lines[c.conditionLine])));
          b.addEventListener('click', () => putForward(c));
          hand.append(b);
        }
        panel.append(hand);
      }
      if (used.length >= minCards || (used.length && !remaining.length)) {
        panel.append(button('rg-to-final', T.toFinal, renderFinal));
      }
    }

    function renderSlip(card) {
      leftBody.replaceChildren();
      const slip = el('section', 'rg-slip');
      slip.dataset.cardId = card.id;
      const head = el('div', 'rg-slip-head');
      head.append(el('span', 'rg-slip-title', T.slipHead + ' ' + used.length), el('span', 'rg-slip-label', card.label));
      slip.append(head);
      for (const li of card.lines) slip.append(lineView(song, card.unit, li));
      leftBody.append(slip);
    }

    function putForward(card) {
      if (finished || used.includes(card.id)) return;
      used.push(card.id);
      view.placeCard(card, used.length - 1);
      renderSlip(card);
      setSay(T.objection + ' ' + card.objection);
      view.object?.();
      recite(song, card.unit);
      renderPick();
      focusFirst(panel);
    }

    // 마지막 구슬 연(왼쪽에 놓여 발견 장면에서도 그대로 남는다)
    let finalBox = null;
    function renderFinalStanza(pairs = null) {
      leftBody.replaceChildren();
      finalBox = el('section', 'rg-final');
      finalBox.append(el('h3', 'rg-col-head', T.leftSong + ' ' + (DATA.finalUnit + 1) + T.tabSuffix));
      for (const { index, repeated } of distinctLines(song, DATA.finalUnit)) {
        const pair = pairs?.get(index) ?? null;
        finalBox.append(lineView(song, DATA.finalUnit, index, { repeated, pair, repeatedLabel: T.repeated }));
      }
      leftBody.append(finalBox);
    }

    function renderFinal() {
      if (finished) return;
      root.dataset.step = 'final';
      setSay(T.nimFinal);
      renderFinalStanza();
      view.showFinal();
      recite(song, DATA.finalUnit);
      panel.replaceChildren();
      panel.append(el('h2', 'rg-title', T.finalHead), el('p', 'rg-prompt', T.finalNote));
      const row = el('div', 'rg-row');
      row.append(button('rg-replay rg-quiet', T.replay, () => recite(song, DATA.finalUnit)));
      if (echoSong) row.append(button('rg-discover', T.discover, renderDiscover));
      else row.append(button('rg-finish', T.finish, finish));
      panel.append(row);
      focusFirst(row);
    }

    // 같은 풀이를 가진 줄끼리 짝을 짓는다(왼쪽 줄 번호 → 짝 번호, 오른쪽 줄 번호 → 짝 번호)
    function pairUp(unit) {
      const leftPairs = new Map();
      const rightPairs = new Map();
      const rightLines = echoSong.units[unit].lines;
      let n = 0;
      for (const { index } of distinctLines(song, DATA.finalUnit)) {
        const gloss = song.units[DATA.finalUnit].lines[index].gloss;
        const r = rightLines.findIndex((l, i) => !rightPairs.has(i) && !echoMarks.wholeLines.has(unit + '-' + i) && l.gloss === gloss);
        if (r < 0) continue;
        leftPairs.set(index, n);
        rightPairs.set(r, n);
        n++;
      }
      return { leftPairs, rightPairs, count: n };
    }

    function renderDiscover() {
      if (finished) return;
      root.dataset.step = 'discover';
      root.classList.remove('is-match');
      panel.replaceChildren();
      panel.append(el('p', 'rg-prompt', T.discoverHead));
      const tabs = el('div', 'rg-tabs');
      tabs.setAttribute('role', 'group');
      tabs.setAttribute('aria-label', T.rightSong);
      echoSong.units.forEach((_, u) => {
        const b = button('rg-tab rg-quiet', (u + 1) + T.tabSuffix, () => openEcho(u));
        b.dataset.unit = String(u);
        tabs.append(b);
      });
      panel.append(tabs);
      const echoBox = el('section', 'rg-echo');
      const message = el('div', 'rg-message');
      message.setAttribute('aria-live', 'polite');
      panel.append(echoBox, message);
      focusFirst(tabs);

      function openEcho(u) {
        if (finished) return;
        for (const t of tabs.children) t.setAttribute('aria-pressed', String(t.dataset.unit === String(u)));
        const isMatch = u === DATA.echo.unit;
        const { leftPairs, rightPairs, count } = isMatch ? pairUp(u) : { leftPairs: null, rightPairs: new Map(), count: 0 };
        const found = isMatch && count > 0;
        echoBox.replaceChildren();
        echoBox.dataset.unit = String(u);
        echoBox.append(el('h3', 'rg-col-head', T.rightSong + ' ' + (u + 1) + T.tabSuffix));
        echoSong.units[u].lines.forEach((_, i) => {
          if (echoMarks.wholeLines.has(u + '-' + i)) return;
          echoBox.append(lineView(echoSong, u, i, { yeoeum: echoMarks.yeoeumFeet.get(u + '-' + i) ?? null, pair: found ? rightPairs.get(i) ?? null : null }));
        });
        const refrain = (echoSong.features?.refrains ?? []).find((r) => r.kind === 'refrain');
        if (refrain && echoSong.units[u].lines.some((_, i) => echoMarks.wholeLines.has(u + '-' + i))) {
          echoBox.append(el('p', 'rg-refrain-note', T.refrainNote + ' ‘' + refrain.text + '’'));
        }
        message.replaceChildren();
        renderFinalStanza(found ? leftPairs : null);
        root.classList.toggle('is-match', found);
        if (found) {
          message.append(el('p', 'rg-found', T.found));
          finalBox.append(el('p', 'rg-note', T.foundNote));
          const fin = button('rg-finish', T.finish, finish);
          message.append(fin);
          view.showMatch?.();
          recite(echoSong, u);
          fin.focus({ preventScroll: true });
        } else {
          message.append(el('p', 'rg-not-here', T.notHere));
        }
      }
    }

    // ── 끝과 치우기 ──
    function cleanup() {
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      stopRecital();
      try { view?.dispose(); } catch { /* 이미 치움 */ }
      if (ownAssets) assets.dispose?.();
      root.remove();
    }

    function finish() {
      if (finished) return;
      const last = cards.find((c) => c.id === used[used.length - 1]);
      cleanup();
      resolve({ completed: true, record: { room: 'goryeo', lastConditionId: last.id, lastConditionText: last.label } });
    }

    function onAbort() {
      if (finished) return;
      cleanup();
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    setSay(T.nimIntro);
    renderPick();
  });
}
