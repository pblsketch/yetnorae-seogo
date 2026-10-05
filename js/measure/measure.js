// 재기 화면(spec 5): 노래를 잡으면 화면이 반으로 나뉘고, 오른쪽 두루마리에서 증거를 모은다.
//   접기 → 두드리기(박자 없는 방식이면 빗금) → 고유 동작 → 감정서
// 재기는 노래가 실제로 가진 모양대로 이끌기 때문에 다 잰 감정서는 언제나 노래 데이터에서 계산한 값과 같다
// (js/core/song-shape.js deriveSheet). 재기 자체로 틀렸다는 기록은 남지 않는다(spec 5.1).
//
// openMeasure(ctx) → Promise<감정서>   (모양은 js/data/README.md 6절)
//   ctx.song          노래 객체
//   ctx.wing          지금 관 id('hyangga'…, 튜토리얼은 'entrance'). 그 관의 고유 동작을 쓴다
//   ctx.mode          'wing'(기본) | 'boss' — 보스는 다섯 고유 동작을 도구로 골라 쓰고, 수첩 대신 일지를 연다
//   ctx.world         세계 바탕 손잡이(js/world/world.js). openSplit/closeSplit로 반반 틀을 연다. 없으면 ctx.container에 붙인다
//   ctx.rhythm        { engine, buildGrid?, createTapSession?, offsetMs? } — 소리 엔진과 박자 함수(README 추가 제안(T3))
//   ctx.noBeat        처음 박자 없는 방식인지(없으면 engine.noBeat). 그 뒤로는 rhythm:no-beat를 따른다
//   ctx.setSlashMode  빗금 모드 권유를 받아들였을 때 부른다(설정 저장은 부르는 쪽 몫)
//   ctx.preMeasured   미리 잰 노래: 감정서 객체, { action: 동작 id }, 또는 true(보낸 관의 동작으로 계산)
//   ctx.notebook      갈래 id → 『분류 수첩』 쪽. ctx.notebookGlow: [{ wing, genre, conceptIds }] 이미 받은 도움
//   ctx.journal       { concepts } (보스 일지). ctx.journalGlow: 개념 id 목록
//   ctx.introSeen     { common, unique } 첫 사용 안내를 이미 보았는지. ctx.onIntroSeen(kind)로 본 것을 알린다
//   ctx.reduceMotion  () → 움직임 줄이기
//   ctx.signal        중단 신호(AbortSignal). 중단되면 AbortError로 끝나고 반반 틀을 닫는다
import * as bus from '../core/events.js';
import { deriveSheet } from '../core/song-shape.js';
import { ACTION_IDS, wingById, wingOfGenre } from '../data/wings.js';
import { createTextView } from './view.js';
import { runFold } from './fold.js';
import { runTap } from './tap.js';
import { renderSheet } from './sheet.js';
import { createNotebook, createJournal } from './book.js';
import { showIntro } from './intro.js';
import { ACTION_TEXT, LAYERS, LAYER_NAMES, L } from './labels.js';
import * as aaDoor from './actions/aa-door.js';
import * as refrainLink from './actions/refrain-link.js';
import * as stairs from './actions/stairs.js';
import * as walk from './actions/walk.js';
import * as rapidUnroll from './actions/rapid-unroll.js';

export const ACTION_MODULES = { 'aa-door': aaDoor, 'refrain-link': refrainLink, stairs, walk, 'rapid-unroll': rapidUnroll };

// 관의 고유 동작(입구는 튜토리얼 동작)
export function actionForWing(wingId) {
  const w = wingById(wingId);
  return w?.action ?? w?.tutorialAction ?? null;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(className, text, label) {
  const b = el('button', className, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

const abortError = (signal) => signal?.reason ?? new DOMException('중단', 'AbortError');

// 버튼 하나를 누를 때까지(중단되면 거절)
function clickOnce(btn, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => { btn.removeEventListener('click', onClick); reject(abortError(signal)); };
    const onClick = () => { signal?.removeEventListener('abort', onAbort); resolve(); };
    if (signal?.aborted) { onAbort(); return; }
    btn.addEventListener('click', onClick, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function openMeasure(ctx = {}) {
  const song = ctx.song;
  if (!song || !Array.isArray(song.units)) throw new Error('재기할 노래가 없다');
  const boss = ctx.mode === 'boss';
  const signal = ctx.signal ?? null;
  if (signal?.aborted) throw abortError(signal);
  const emit = bus.emit;
  const wingAction = boss ? null : (actionForWing(ctx.wing) ?? actionForWing(wingOfGenre(song.genre)?.id));
  const engine = ctx.rhythm?.engine ?? null;
  const reduceMotion = () => !!(ctx.reduceMotion?.() ?? ctx.world?.reduceMotion?.() ?? document.getElementById('app')?.classList.contains('reduce-motion'));
  const offs = [];

  // ── 화면 뼈대 ──
  const root = el('section', 'measure' + (boss ? ' is-boss' : ''));
  root.setAttribute('aria-label', '노래 재기');
  const head = el('div', 'm-head');
  const layerBtn = button('m-layer', LAYER_NAMES.original);
  layerBtn.dataset.layer = 'original';
  const prev = button('m-prev', '‹', L.prev);
  const pageLabel = el('span', 'm-page', '1/1');
  const next = button('m-next', '›', L.next);
  const pager = el('div', 'm-pager');
  pager.append(prev, pageLabel, next);
  head.append(layerBtn, pager);
  const hint = el('p', 'm-hint');
  hint.setAttribute('aria-live', 'polite');
  const main = el('div', 'm-main');
  const text = el('div', 'm-text');
  const side = el('div', 'm-side');
  side.hidden = true;
  const overlay = el('div', 'm-overlay');
  main.append(text, side, overlay);
  const controls = el('div', 'm-controls');
  root.append(head, hint, main, controls);

  // 수첩(관) 또는 일지(보스)
  let book = null;
  let journal = null;
  if (boss) {
    journal = createJournal(root, { concepts: ctx.journal?.concepts ?? ctx.journal ?? {}, glow: ctx.journalGlow ?? [] });
    head.append(journal.button);
    offs.push(bus.on('help:journal-glow', (d) => journal.addGlow(d?.conceptIds)));
    offs.push(bus.on('concept:changed', (d) => journal.setState(d?.conceptId, d?.state)));
  } else {
    book = createNotebook(root, { notebook: ctx.notebook ?? {}, glow: ctx.notebookGlow ?? [], genre: wingById(ctx.wing)?.genre ?? null });
    head.append(book.button);
    offs.push(bus.on('help:notebook-glow', (d) => book.addGlow(d)));
  }

  // 반반 틀에 올린다
  const useWorld = typeof ctx.world?.openSplit === 'function';
  if (useWorld) ctx.world.openSplit(root);
  else (ctx.container ?? document.body).append(root);

  const view = createTextView(text, { song, layer: 'original' });
  let hintText = '';
  const setHint = (t) => { hintText = t; hint.textContent = view.isGloss ? L.glossPaused : t; };
  const setStep = (s) => { root.dataset.step = s; };

  function updatePager() {
    pageLabel.textContent = (view.page + 1) + '/' + view.pageCount;
    prev.disabled = view.page <= 0;
    next.disabled = view.page >= view.pageCount - 1;
  }
  offs.push(view.onChange(updatePager));
  prev.addEventListener('click', () => view.prev());
  next.addEventListener('click', () => view.next());
  layerBtn.addEventListener('click', () => {
    const k = (LAYERS.indexOf(view.layer) + 1) % LAYERS.length;
    view.setLayer(LAYERS[k]);
    layerBtn.dataset.layer = LAYERS[k];
    layerBtn.textContent = LAYER_NAMES[LAYERS[k]];
    layerBtn.setAttribute('aria-label', '두루마리: ' + LAYER_NAMES[LAYERS[k]] + ' (누르면 ' + LAYER_NAMES[LAYERS[(k + 1) % LAYERS.length]] + ')');
    setHint(hintText);
  });
  offs.push(bus.on('settings:text-scale', () => requestAnimationFrame(() => view.relayout())));

  // 박자 없는 방식(소리 끔·빗금 모드)
  let engineNoBeat = ctx.noBeat ?? (engine ? !!engine.noBeat?.value : true);
  const beatListeners = new Set();
  const beat = {
    get: () => engineNoBeat,
    on(fn) { beatListeners.add(fn); return () => beatListeners.delete(fn); },
  };
  offs.push(bus.on('rhythm:no-beat', (d) => {
    engineNoBeat = !!d?.value;
    for (const fn of [...beatListeners]) fn(engineNoBeat);
  }));
  const setSlashMode = (v) => {
    if (typeof ctx.setSlashMode === 'function') ctx.setSlashMode(v);
    else engine?.setSlashMode?.(v);
  };

  // 첫 사용 안내
  const needIntro = (kind) => !!ctx.introSeen && !ctx.introSeen[kind];
  const intro = (kind, target) => showIntro(root, { kind, target, reduceMotion: reduceMotion(), signal });

  function runAction(actionId) {
    const mod = ACTION_MODULES[actionId];
    if (!mod) throw new Error('알 수 없는 고유 동작: ' + actionId);
    const box = el('div', 'm-action');
    box.dataset.action = actionId;
    controls.replaceChildren(box);
    return mod.start({
      song, container: text, noBeat: beat.get(), getNoBeat: beat.get, rhythm: ctx.rhythm ?? null, signal,
      view, controls: box, setHint, emit,
    });
  }

  const quiet = (p) => { p.catch(() => {}); return p; };

  try {
    // ── 미리 잰 노래: 감정서가 채워진 채로 연다 ──
    if (ctx.preMeasured) {
      const sheet = preSheet(ctx.preMeasured, song, ctx.wing, wingAction);
      await showSheet(sheet, L.preMeasured);
      return sheet;
    }

    // ── 접기 ──
    setStep('fold');
    const foldP = quiet(runFold({ song, view, controls, setHint, signal, grey: boss, emit }));
    if (needIntro('common')) await intro('fold', text.querySelector('.m-gap'));
    const fold = await foldP;

    // ── 두드리기·빗금 ──
    setStep('tap');
    const tapP = quiet(runTap({ song, view, root, controls, overlay, setHint, rhythm: ctx.rhythm ?? null, beat, setSlashMode, signal, emit }));
    if (needIntro('common')) {
      await intro('tap', controls.querySelector('.m-listen') ?? text.querySelector('button.m-word'));
      ctx.onIntroSeen?.('common');
    }
    const tap = await tapP;

    // ── 고유 동작 ──
    const actions = [];
    if (!boss) {
      setStep('action');
      const actionP = quiet(runAction(wingAction));
      if (needIntro('unique')) {
        await intro('unique', controls.querySelector('[data-intro-target]') ?? text.querySelector('.is-target') ?? controls);
        ctx.onIntroSeen?.('unique');
      }
      actions.push(await actionP);
    } else {
      await toolsLoop(actions);
    }

    const sheet = { songId: song.id, fold, tap, action: actions[actions.length - 1] };
    if (boss) {
      sheet.actions = actions;
      return sheet;
    }
    await showSheet(sheet);
    return sheet;
  } finally {
    for (const off of offs) off?.();
    view.dispose();
    if (useWorld) ctx.world.closeSplit();
    root.remove();
  }

  // 감정서를 보이고 '감정서 받기'를 기다린다
  async function showSheet(sheet, note) {
    setStep('sheet');
    renderSheet(side, sheet, song, { neutral: boss, note, title: L.sheetTitle });
    text.hidden = true;
    side.hidden = false;
    pager.hidden = true;
    setHint('');
    const toggle = button('m-view-toggle', L.showScroll);
    toggle.addEventListener('click', () => {
      const showText = text.hidden;
      text.hidden = !showText;
      side.hidden = showText;
      pager.hidden = !showText;
      toggle.textContent = showText ? L.showSheet : L.showScroll;
      if (showText) view.relayout();
    });
    const finish = button('m-finish', L.finish);
    controls.replaceChildren(toggle, finish);
    await clickOnce(finish, signal);
  }

  // 보스: 다섯 고유 동작을 도구로 골라 쓴다. '다 쟀다'로 끝낸다(도구를 하나 이상 써야 한다)
  async function toolsLoop(actions) {
    for (;;) {
      setStep('tools');
      setHint(L.toolsHint);
      text.hidden = true;
      pager.hidden = true;
      const grid = el('div', 'm-tools');
      for (const id of ACTION_IDS) {
        const t = button('m-tool', ACTION_TEXT[id].name);
        t.dataset.action = id;
        t.classList.toggle('is-used', actions.some((a) => a.action === id));
        grid.append(t);
      }
      const usedLines = el('div', 'm-tools-sheet');
      if (actions.length) renderSheet(usedLines, { action: null, actions }, song, { neutral: true, title: L.sheetTitle });
      side.replaceChildren(grid, usedLines);
      side.hidden = false;
      const finish = button('m-finish', L.finishBoss);
      finish.disabled = actions.length === 0;
      controls.replaceChildren(finish);
      const choice = await new Promise((resolve, reject) => {
        const onAbort = () => reject(abortError(signal));
        if (signal?.aborted) { onAbort(); return; }
        signal?.addEventListener('abort', onAbort, { once: true });
        grid.addEventListener('click', (e) => {
          const t = e.target.closest('.m-tool');
          if (t) { signal?.removeEventListener('abort', onAbort); resolve(t.dataset.action); }
        });
        finish.addEventListener('click', () => { signal?.removeEventListener('abort', onAbort); resolve(null); }, { once: true });
      });
      if (!choice) return;
      setStep('action');
      side.hidden = true;
      text.hidden = false;
      pager.hidden = false;
      view.relayout();
      actions.push(await runAction(choice));
    }
  }
}

// 미리 잰 노래의 감정서. 보낸 관(이 노래가 길 잃은 노래로 섞여 있던 관)의 고유 동작으로 잰다.
function preSheet(pm, song, wingId, fallbackAction) {
  if (pm && typeof pm === 'object' && pm.fold && pm.tap && pm.action) return JSON.parse(JSON.stringify(pm));
  let actionId = pm && typeof pm === 'object' && typeof pm.action === 'string' ? pm.action : null;
  if (!actionId) {
    const stray = (song.roles ?? []).find((r) => r.role === 'stray' && r.to === wingId);
    actionId = actionForWing(stray?.wing) ?? fallbackAction ?? actionForWing(wingOfGenre(song.genre)?.id);
  }
  return deriveSheet(song, actionId);
}
