// 작품 방 「제망매가」(향가관, spec 9). 약속은 js/data/README.md 7.3.
//   start(ctx) → Promise<{ completed: true, record }>
//   ctx: { song, container, mode: '3d' | '2d', three?: { THREE, root, camera }, noBeat, reduceMotion, rhythm, signal }
//        (선택) assets: { image(name) } 또는 manifest: 자산 목록 — 2D 그림 판 board/room-hyangga를 찾는다. 없으면 자리표시 그림.
//
// 흐름
// 1. 바람 부는 가지에서 잎이 떨어진다. 앞 여덟 구가 한 구씩 낭송되는 동안 학생은 잎을 붙잡지만, 잡은 잎은 손안에서 흩어진다.
//    구마다 잎을 한 번이라도 붙잡아 보고 낭송이 끝나면 다음 구로 간다(시간 제한·실패 없음).
// 2. 9구 '아아'에서 조작이 바뀐다. 잡으려던 손이 미타찰로 가는 길을 닦는 손이 되어, 길에 쌓인 잎을 쓸어 낸다.
//    길을 반쯤 닦으면 10구가 나온다. 다 닦으면 길이 트인다.
// 3. "마지막은 슬픔을 이겨 낸 것일까, 견디겠다는 다짐일까?"에 해석을 고른다('해석' 표시, 채점하지 않음).
//
// - 노래 글은 노래 데이터의 해독문·향찰만 보인다(다시 적지 않는다). 방 글은 js/data/rooms-hyangga.js.
// - 낭송은 ctx.rhythm(소리 엔진)으로 구마다 낸다. 박자 없는 방식(소리 끔·빗금)이거나 소리 판이 아직 없으면 낭송 없이 같은 끝까지 간다.
// - 세로로 돌리면(orientation:pause) 잎과 조작이 멈추고, 돌아오면 이어진다. 낭송은 소리 엔진이 멈추고 그 구를 처음부터 다시 낸다.
// - 중단 신호가 오면 만든 것을 모두 치우고 AbortError로 끝난다. 다음에는 처음부터 다시 한다(spec 20).
// - 진행 저장은 하지 않는다. 기록을 돌려주면 한 판 흐름이 저장한다.
import { on } from '../core/events.js';
import * as R from '../core/rhythm.js';
import { createAssets } from '../world/assets.js';
import { roomText as T, interpretations, roomTuning as TUNE } from '../data/rooms-hyangga.js';
import { roomPlan, splitExclamation, makeRecord, createLeafField } from './hyangga-flow.js';
import { create2DStage } from './hyangga-2d.js';
import { create3DStage } from './hyangga-3d.js';

export { roomPlan, makeRecord } from './hyangga-flow.js';

const STYLE_HREF = new URL('../../css/room-hyangga.css', import.meta.url).href;
const BOARD_NAME = 'board/room-hyangga';
const SVG_NS = 'http://www.w3.org/2000/svg';

const abortError = () => new DOMException('작품 방에서 나감', 'AbortError');

function ensureStyle() {
  if (document.querySelector('link[href$="css/room-hyangga.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  link.dataset.roomStyle = 'hyangga';
  document.head.append(link);
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(className, text) {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

// 손 그림: 잎을 붙잡는 손(catch)과 비를 쥐고 길을 닦는 손(sweep)
function handSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = [
    '<g class="rh-hand__broom">',
    '<rect x="62" y="4" width="7" height="62" rx="3" transform="rotate(24 65 35)"/>',
    '<path d="M70 60 L96 92 L64 98 L52 70 Z"/>',
    '</g>',
    '<g class="rh-hand__palm">',
    '<rect x="26" y="44" width="44" height="42" rx="18"/>',
    '<rect class="rh-hand__finger" x="27" y="16" width="10" height="38" rx="5"/>',
    '<rect class="rh-hand__finger" x="39" y="10" width="10" height="42" rx="5"/>',
    '<rect class="rh-hand__finger" x="51" y="12" width="10" height="40" rx="5"/>',
    '<rect class="rh-hand__finger" x="62" y="20" width="9" height="34" rx="4.5"/>',
    '<rect x="10" y="48" width="22" height="10" rx="5" transform="rotate(-35 20 53)"/>',
    '</g>',
  ].join('');
  return svg;
}

function readReduce(v) {
  try { return typeof v === 'function' ? !!v() : !!v; } catch { return false; }
}

export function start(ctx = {}) {
  const { song, container, signal } = ctx;
  if (signal?.aborted) return Promise.reject(abortError());
  let plan;
  try {
    if (!container) throw new Error('작품 방을 그릴 container가 없다');
    plan = roomPlan(song);
  } catch (e) {
    return Promise.reject(e);
  }
  ensureStyle();

  const units = song.units;
  const reduce = () => readReduce(ctx.reduceMotion);
  const engine = ctx.rhythm?.engine ?? null;
  const buildGrid = ctx.rhythm?.buildGrid ?? R.buildGrid;
  const pileCount = Math.max(2, TUNE.pileCount | 0);
  const half = Math.ceil(pileCount / 2);
  const use3D = ctx.mode === '3d' && ctx.three?.THREE && ctx.three?.root && ctx.three?.camera;

  // ── 상태 ──
  const state = {
    phase: 'intro',
    unit: null,
    scattered: 0,      // 붙잡았지만 흩어진 잎 수(모두)
    caughtHere: false, // 이 구에서 잎을 붙잡아 보았는지
    swept: 0,
    paused: false,
    noBeat: !!ctx.noBeat,
    choice: null,
    confirmed: null,
    started: false,
  };
  const waiters = new Set();
  const notify = () => { for (const w of [...waiters]) if (w.pred()) { waiters.delete(w); w.resolve(); } };
  const waitUntil = (pred) => (pred() ? Promise.resolve() : new Promise((resolve) => waiters.add({ pred, resolve })));

  // ── 화면 ──
  const root = el('div', 'rh-room');
  root.dataset.mode = use3D ? '3d' : '2d';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', T.title);
  const layer = el('div', 'rh-layer');
  const fragLayer = el('div', 'rh-frags');
  fragLayer.setAttribute('aria-hidden', 'true');

  const textBox = el('div', 'rh-text');
  const guLabel = el('p', 'rh-gu');
  const line = el('p', 'rh-line');
  const original = el('p', 'rh-original');
  original.lang = 'zh-Hant';
  const progress = el('div', 'rh-progress');
  progress.setAttribute('aria-label', T.progressLabel);
  progress.setAttribute('role', 'img');
  const dots = units.map(() => progress.appendChild(el('span', 'rh-dot')));
  const head = el('div', 'rh-head');
  head.append(guLabel, progress);
  const msg = el('p', 'rh-msg');
  msg.setAttribute('aria-live', 'polite');
  textBox.append(head, line, original, msg);
  textBox.hidden = true;

  const hint = el('p', 'rh-hint');
  const act = button('rh-act');
  act.hidden = true;

  const hand = el('div', 'rh-hand');
  hand.dataset.kind = 'catch';
  hand.append(handSvg());
  hand.setAttribute('aria-hidden', 'true');

  const intro = el('section', 'rh-intro');
  const startBtn = button('rh-start', T.start);
  intro.append(el('h2', 'rh-title', T.title), el('p', 'rh-intro__text', T.intro), startBtn);

  const ask = el('section', 'rh-ask');
  ask.hidden = true;
  const qId = 'rh-question-' + Math.random().toString(36).slice(2, 8);
  const question = el('h2', 'rh-question', T.question);
  question.id = qId;
  ask.setAttribute('aria-labelledby', qId);
  const choiceBox = el('div', 'rh-choices');
  choiceBox.setAttribute('role', 'group');
  choiceBox.setAttribute('aria-labelledby', qId);
  const choiceBtns = interpretations.map((it) => {
    const b = button('rh-choice');
    b.dataset.id = it.id;
    b.setAttribute('aria-pressed', 'false');
    b.append(el('span', 'rh-choice__text', it.text));
    choiceBox.append(b);
    return b;
  });
  const confirm = button('rh-confirm', T.confirm);
  confirm.disabled = true;
  ask.append(el('span', 'rh-label', T.interpretationLabel), question, el('p', 'rh-note', T.questionNote), choiceBox, confirm);

  root.append(layer, fragLayer, hand, textBox, hint, act, intro, ask);
  container.append(root);

  // ── 무대(3D 장면 또는 2D 그림 판) ──
  let art = null;
  try {
    const assets = ctx.assets?.image ? ctx.assets : (ctx.manifest ? createAssets(ctx.manifest) : null);
    art = assets?.image(BOARD_NAME) ?? null;
  } catch { art = null; }
  const stage = use3D
    ? create3DStage({ root, three: ctx.three, plan, pileCount, reduceMotion: reduce })
    : create2DStage({ root, art, pileCount, reduceMotion: reduce });
  root.prepend(stage.element);

  // 잎과 길의 잎 무더기(누를 자리)
  const field = createLeafField({ count: TUNE.leafCount, fallSeconds: TUNE.fallSeconds, still: reduce() });
  const leafBtns = field.leaves.map((l, i) => {
    const b = button('rh-leaf rh-leaf--' + (i % 3));
    b.setAttribute('aria-label', T.catchLeaf);
    b.append(stage.leafVisual(i));
    b.addEventListener('click', () => catchLeaf(i));
    layer.append(b);
    return b;
  });
  const pileBtns = Array.from({ length: pileCount }, (_, k) => {
    const b = button('rh-pile');
    b.setAttribute('aria-label', T.pile);
    b.append(stage.pileVisual(k));
    b.hidden = true;
    b.addEventListener('click', () => sweep(k));
    layer.append(b);
    return b;
  });
  const dest = el('span', 'rh-dest', T.destination);
  dest.hidden = true;
  layer.append(dest);

  // ── 낭송 ──
  let grid = null;
  const playing = new Set();
  function recite(unit) {
    if (state.noBeat || !engine?.unlocked) return Promise.resolve();
    try {
      grid ??= buildGrid(song);
      const seg = grid.segments.findIndex((s) => s.unit === unit);
      if (seg < 0) return Promise.resolve();
      const h = engine.play(grid, [seg]);
      playing.add(h);
      return Promise.resolve(h.finished).catch(() => {}).then(() => { playing.delete(h); });
    } catch {
      return Promise.resolve(); // 소리가 없어도 방은 이어진다
    }
  }
  const stopRecite = () => { for (const h of [...playing]) { try { h.stop(); } catch { /* 이미 멈춤 */ } } playing.clear(); };

  // ── 화면 갱신 ──
  function sync() {
    root.dataset.phase = state.phase;
    root.dataset.unit = state.unit === null ? '' : String(state.unit);
    root.dataset.scattered = String(state.scattered);
    root.dataset.held = '0'; // 잡은 잎은 손안에 남지 않는다
    root.dataset.swept = String(state.swept);
    root.dataset.paused = state.paused ? '1' : '0';
    dots.forEach((d, i) => { d.dataset.state = state.unit === null ? '' : i < state.unit ? 'done' : i === state.unit ? 'now' : ''; });
    pileBtns.forEach((b, k) => {
      b.hidden = state.phase !== 'sweep' && state.phase !== 'clear';
      b.dataset.state = k < state.swept ? 'swept' : k === state.swept ? 'next' : 'later';
      b.disabled = k !== state.swept || state.phase !== 'sweep';
      b.setAttribute('aria-label', k === state.swept ? T.pile : T.pileLater);
      if (k < state.swept) b.hidden = true;
    });
    const leavesGone = state.phase !== 'catch' && state.phase !== 'intro';
    leafBtns.forEach((b) => { if (leavesGone) b.remove(); });
    act.hidden = !(state.phase === 'catch' || state.phase === 'sweep');
    act.textContent = state.phase === 'sweep' ? T.sweepAction : T.catchAction;
  }

  function showUnit(u) {
    state.unit = u;
    const u0 = units[u];
    guLabel.textContent = T.guLabel(u + 1);
    const sp = u === plan.aaUnit ? splitExclamation(u0.decipherment, plan.exclamation) : null;
    line.replaceChildren();
    if (sp) {
      const aa = el('span', 'rh-aa', sp.head);
      line.append(aa, document.createTextNode(sp.rest));
    } else {
      line.textContent = u0.decipherment;
    }
    original.textContent = u0.original;
    textBox.hidden = false;
    textBox.classList.toggle('is-aa', !!sp);
    sync();
  }

  function setMsg(t) { msg.textContent = t ?? ''; }

  // ── 붙잡기: 잡은 잎은 손안에서 흩어진다 ──
  function point(p) { return { x: p.x, y: p.y }; }
  function scatterAt(p, tint) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const f = el('span', 'rh-frag rh-leaf--' + tint);
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
      const dist = 40 + Math.random() * 50;
      f.style.left = p.x + 'px';
      f.style.top = p.y + 'px';
      f.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px');
      f.style.setProperty('--dy', Math.round(Math.sin(ang) * dist + 30) + 'px');
      f.style.setProperty('--r', Math.round(Math.random() * 300 - 150) + 'deg');
      fragLayer.append(f);
      setTimeout(() => f.remove(), reduce() ? 450 : 1100);
    }
  }

  let handTimer = 0;
  function moveHand(p, kind) {
    hand.dataset.kind = kind;
    hand.style.setProperty('--hx', Math.round(p.x) + 'px');
    hand.style.setProperty('--hy', Math.round(p.y) + 'px');
  }
  function restHand() {
    const r = root.getBoundingClientRect();
    if (state.phase === 'sweep' || state.phase === 'clear') {
      const k = Math.min(state.swept, pileCount - 1);
      const p = stage.pilePoint(k, r);
      moveHand({ x: p.x - 60, y: p.y + 10 }, 'sweep');
    } else {
      moveHand({ x: r.width * 0.62, y: r.height * 0.88 }, 'catch');
    }
  }

  const scatterLines = T.scattered;
  function catchLeaf(i) {
    if (state.phase !== 'catch' || state.paused) return;
    const l = field.leaves[i];
    if (!l) return;
    const r = root.getBoundingClientRect();
    const p = point(stage.leafPoint(l, r));
    field.catchLeaf(l.id);
    state.scattered++;
    state.caughtHere = true;
    hand.classList.add('is-closed');
    moveHand(p, 'catch');
    clearTimeout(handTimer);
    handTimer = setTimeout(() => {
      hand.classList.remove('is-closed');
      scatterAt(p, i % 3);
      stage.scatter?.(i);
      handTimer = setTimeout(restHand, 500);
    }, reduce() ? 0 : 180);
    setMsg(scatterLines[(state.scattered - 1) % scatterLines.length]);
    sync();
    notify();
  }

  function catchNearest() {
    const l = field.nearest();
    if (l) catchLeaf(field.leaves.indexOf(l));
  }

  // ── 길 닦기 ──
  function sweep(k) {
    if (state.phase !== 'sweep' || state.paused || k !== state.swept || state.swept >= pileCount) return;
    const r = root.getBoundingClientRect();
    const p = stage.pilePoint(k, r);
    moveHand({ x: p.x - 40, y: p.y }, 'sweep');
    hand.classList.remove('is-sweeping');
    void hand.offsetWidth; // 비질 움직임을 다시 시작한다
    hand.classList.add('is-sweeping');
    stage.sweep(k);
    state.swept++;
    setMsg(T.swept);
    sync();
    notify();
    clearTimeout(handTimer);
    handTimer = setTimeout(restHand, reduce() ? 0 : TUNE.afterSweepMs);
  }

  act.addEventListener('click', () => {
    if (state.phase === 'catch') catchNearest();
    else if (state.phase === 'sweep') sweep(state.swept);
  });

  // ── 해석 고르기 ──
  choiceBtns.forEach((b) => b.addEventListener('click', () => {
    if (state.phase !== 'ask' || state.paused) return;
    state.choice = b.dataset.id;
    choiceBtns.forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    confirm.disabled = false;
  }));
  confirm.addEventListener('click', () => {
    if (state.phase !== 'ask' || state.paused || !state.choice) return;
    state.confirmed = state.choice;
    notify();
  });
  startBtn.addEventListener('click', () => {
    if (state.paused) return;
    try { engine?.unlock?.(); } catch { /* 소리 판이 없어도 이어진다 */ }
    state.started = true;
    notify();
  });

  // Enter·Space: 초점이 단추에 없으면 상황 단추와 같은 동작(spec 14)
  function onKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target;
    if (t && t.closest?.('button, input, textarea, select, a')) return;
    if (!root.isConnected || act.hidden || state.paused) return;
    e.preventDefault();
    act.click();
  }
  document.addEventListener('keydown', onKey);

  // ── 사건 ──
  const offs = [
    on('orientation:pause', () => { state.paused = true; sync(); }),
    on('orientation:resume', () => { state.paused = false; sync(); }),
    on('rhythm:no-beat', (d) => {
      state.noBeat = !!d?.value;
      if (state.noBeat) stopRecite();
    }),
  ];

  // ── 프레임 ──
  let raf = 0;
  let last = null;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - (last ?? now)) / 1000));
    last = now;
    const active = !state.paused && !document.hidden;
    const falling = state.phase === 'catch' || state.phase === 'intro';
    if (active && falling) field.step(dt);
    const r = root.getBoundingClientRect();
    stage.update(active ? dt : 0, { field, phase: state.phase, swept: state.swept, rect: r });
    if (falling) {
      field.leaves.forEach((l, i) => {
        const b = leafBtns[i];
        const p = stage.leafPoint(l, r);
        const shown = field.visible(l) && p;
        b.hidden = !shown;
        if (shown) b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%) rotate(${Math.round(stage.leafTilt ? field.tilt(l) : 0)}deg)`;
      });
    }
    if (state.phase === 'sweep' || state.phase === 'clear' || state.phase === 'ask') {
      pileBtns.forEach((b, k) => {
        const p = stage.pilePoint(k, r);
        b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
      });
      const d = stage.destPoint(r);
      dest.style.transform = `translate(${Math.round(d.x)}px, ${Math.round(d.y)}px) translate(-50%, -100%)`;
    }
  }

  // ── 흐름 ──
  let abortListener = null;
  const aborted = new Promise((_, reject) => {
    abortListener = () => reject(abortError());
    signal?.addEventListener('abort', abortListener, { once: true });
  });
  aborted.catch(() => {});
  const race = (p) => Promise.race([p, aborted]);
  const delay = (ms) => race(new Promise((r) => setTimeout(r, ms)));

  async function run() {
    sync();
    raf = requestAnimationFrame(frame);
    restHand();
    await race(waitUntil(() => state.started));
    intro.remove();
    state.phase = 'catch';
    hint.textContent = T.catchHint;
    stage.setPhase('catch');
    restHand();

    // 1~8구: 잎을 붙잡지만 흩어진다
    for (const u of plan.catchUnits) {
      state.caughtHere = false;
      showUnit(u);
      if (u === 0) setMsg('');
      const recited = recite(u);
      await race(Promise.all([recited, waitUntil(() => state.caughtHere)]));
      await delay(reduce() ? 250 : TUNE.afterCatchMs);
    }

    // 9구 '아아': 잡으려던 손이 길을 닦는 손이 된다
    state.phase = 'sweep';
    stage.setPhase('sweep');
    showUnit(plan.aaUnit);
    hint.textContent = T.sweepHint;
    setMsg(T.turn);
    dest.hidden = false;
    restHand();
    const aaRecited = recite(plan.aaUnit);
    await race(waitUntil(() => state.swept >= half));
    await race(aaRecited);
    showUnit(plan.finalUnit);
    const finalRecited = recite(plan.finalUnit);
    await race(waitUntil(() => state.swept >= pileCount));
    await race(finalRecited);

    // 길이 트였다
    state.phase = 'clear';
    stage.setPhase('clear');
    dest.classList.add('is-open');
    setMsg(T.pathClear);
    hint.textContent = '';
    sync();
    await delay(reduce() ? 300 : TUNE.beforeQuestionMs);

    // 해석 고르기
    state.phase = 'ask';
    ask.hidden = false;
    sync();
    choiceBtns[0]?.focus({ preventScroll: true });
    await race(waitUntil(() => state.confirmed !== null));
    return makeRecord(state.confirmed);
  }

  function cleanup() {
    cancelAnimationFrame(raf);
    clearTimeout(handTimer);
    stopRecite();
    for (const off of offs) off?.();
    document.removeEventListener('keydown', onKey);
    if (abortListener) signal?.removeEventListener('abort', abortListener);
    waiters.clear();
    try { stage.dispose(); } catch { /* 이미 치움 */ }
    root.remove();
  }

  return run().then(
    (record) => { cleanup(); return { completed: true, record }; },
    (e) => { cleanup(); throw (signal?.aborted ? abortError() : e); },
  );
}
