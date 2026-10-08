// 형식 분석 화면(spec 5): 노래를 잡으면 화면이 반으로 나뉘고, 오른쪽 두루마리에서 증거를 모은다.
//   ① 연·장·행·구 나누기(접기) → ② 음보 나누기(쉼에 두드리기, 박자 없는 방식이면 빗금) → ③ 관의 형식 확인(고유 동작)
//   → 분석표 → ④ 갈래 판별(ctx.decide가 있을 때: 관·입구)
// 분석은 노래가 실제로 가진 모양대로 이끌기 때문에 다 채운 분석표는 언제나 노래 데이터에서 계산한 값과 같다
// (js/core/song-shape.js deriveSheet). ①~③의 실수는 기록이 남지 않는다(spec 5.1). 판단은 ④ 갈래 판별에서 한다.
//
// openMeasure(ctx) → Promise<분석표>   (모양은 js/data/README.md 6절)
//   ctx.song          노래 객체
//   ctx.wing          지금 관 id('hyangga'…, 튜토리얼은 'entrance'). 그 관의 고유 동작을 쓴다
//   ctx.mode          'wing'(기본) | 'boss' — 보스는 다섯 고유 동작을 도구로 골라 쓰고, 수첩 대신 일지를 연다.
//                     갈래가 드러나지 않게 단위를 '부분'이라 부르고, 박 밖 음보의 이름표(여음·후렴·되풀이)를 달지 않는다.
//                     ④가 없다(보스 1단계는 관 자리에 꽂는 것이 갈래 판별이다)
//   ctx.revealed      그 노래가 드러났는지(갈래 판별에서 맞았거나 튜토리얼을 마친 튜토리얼 노래). 관·입구에서도 드러나기 전에는
//                     보스처럼 단위를 '부분'이라 부르고 박 밖 음보의 이름표를 달지 않는다. 드러났으면 갈래 단위 이름(구·연·장·행)
//   ctx.marksKnown    박 밖 음보의 이름표를 달아도 되는지(드러난 노래).
//                     관에서 후렴 고리 걸기가 되풀이 구절을 찾으면 그 자리에서 이름표를 단다
//   ctx.world         세계 바탕 손잡이(js/world/world.js). openSplit/closeSplit로 반반 틀을 연다. 없으면 ctx.container에 붙인다
//   ctx.rhythm        { engine, buildGrid?, createTapSession?, buildPauseGrid?, createPauseTapSession?, offsetMs? } — 소리 엔진과
//                     박자 함수(README 추가 제안(T3)). 두드리기는 쉼 칸(buildPauseGrid·createPauseTapSession)을 쓴다
//   ctx.noBeat        처음 박자 없는 방식인지(없으면 engine.noBeat). 그 뒤로는 rhythm:no-beat를 따른다
//   ctx.setSlashMode  빗금 모드 권유를 받아들였을 때 부른다(설정 저장은 부르는 쪽 몫)
//   ctx.preMeasured   미리 잰 노래: 감정서 객체, { action: 동작 id }, 또는 true(보낸 관의 동작으로 계산)
//   ctx.notebook      갈래 id → 『분류 수첩』 쪽. ctx.notebookGlow: [{ wing, genre, conceptIds }] 이미 받은 도움
//   ctx.journal       { concepts } (보스 일지). ctx.journalGlow: 개념 id 목록
//   ctx.introSeen     { common, unique } 첫 사용 안내를 이미 보았는지. ctx.onIntroSeen(kind)로 본 것을 알린다
//   ctx.reduceMotion  () → 움직임 줄이기
//   ctx.signal        중단 신호(AbortSignal). 중단되면 AbortError로 끝나고 반반 틀을 닫는다
//   ctx.canQuit       참이면 머리에 '분석 그만두기'를 둔다(관). 누르면 같은 중단 길로 AbortError로 끝난다:
//                     예약한 낭송·장구를 거두고 반반 틀을 닫으며, 감정서를 돌려주지 않으므로 부르는 쪽은 잰 것으로 기록하지 않는다
//   ctx.decide        (갈래 id, 분석표) → Promise<{ correct, note? }>. 있으면 ①~③ 뒤에 ④ 갈래 판별을 한다(관·입구, 교사 결정
//                     2026-10-08). 판별의 맞고 틀림과 기록은 부르는 쪽(진행 엔진)이 정하고, 틀렸을 때의 맞대어 보기 창도 부르는
//                     쪽이 열었다가 닫힌 뒤에 돌려준다. 이 화면은 답을 모른다. 맞으면 분석표를 갈래 단위 이름으로 다시 쓰고
//                     드러난 단위 이름(UNIT_TERMS)과 note를 보인 뒤 '확인'을 기다린다. 돌려주는 분석표에 decided(갈래 id)가 붙는다
//   ctx.decideGuide   입구 튜토리얼: 고를 갈래 id. 손가락 안내와 안내 글로 그 갈래를 가리킨다
import * as bus from '../core/events.js';
import { deriveSheet } from '../core/song-shape.js';
import { ACTION_IDS, GENRES, genreById, wingById, wingOfGenre } from '../data/wings.js';
import { createTextView } from './view.js';
import { runFold } from './fold.js';
import { runTap } from './tap.js';
import { renderSheet } from './sheet.js';
import { createNotebook, createJournal } from './book.js';
import { showIntro } from './intro.js';
import { ACTION_TEXT, LAYERS, LAYER_NAMES, L, UNIT_TERMS } from './labels.js';
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
  if (!song || !Array.isArray(song.units)) throw new Error('형식 분석할 노래가 없다');
  const boss = ctx.mode === 'boss';
  const outer = ctx.signal ?? null;
  if (outer?.aborted) throw abortError(outer);
  // 형식 분석 안의 중단 신호: 바깥 중단(관을 떠남 등)이나 '분석 그만두기'가 같은 길로 분석을 끝낸다
  const quitCtl = new AbortController();
  const onOuterAbort = () => quitCtl.abort(abortError(outer));
  outer?.addEventListener('abort', onOuterAbort, { once: true });
  const signal = quitCtl.signal;
  const emit = bus.emit;
  const wingAction = boss ? null : (actionForWing(ctx.wing) ?? actionForWing(wingOfGenre(song.genre)?.id));
  const engine = ctx.rhythm?.engine ?? null;
  const reduceMotion = () => !!(ctx.reduceMotion?.() ?? ctx.world?.reduceMotion?.() ?? document.getElementById('app')?.classList.contains('reduce-motion'));
  const offs = [];

  // ── 화면 뼈대 ──
  const root = el('section', 'measure' + (boss ? ' is-boss' : ''));
  root.setAttribute('aria-label', '형식 분석');
  const head = el('div', 'm-head');
  const layerBtn = button('m-layer', LAYER_NAMES.original);
  layerBtn.dataset.layer = 'original';
  const prev = button('m-prev', '‹', L.prev);
  const pageLabel = el('span', 'm-page', '1/1');
  const next = button('m-next', '›', L.next);
  const pager = el('div', 'm-pager');
  pager.append(prev, pageLabel, next);
  head.append(layerBtn, pager);
  if (ctx.canQuit && !boss) {
    const quit = button('m-quit', L.quit);
    quit.addEventListener('click', () => quitCtl.abort(new DOMException(L.quit, 'AbortError')), { once: true });
    head.append(quit);
  }
  // 지금 하는 형식 분석 단계(① 연·장·행·구 나누기 → ② 음보 나누기 → ③ 관의 형식 확인 → ④ 갈래 판별)
  const stepName = el('p', 'm-stepname');
  const hint = el('p', 'm-hint');
  hint.setAttribute('aria-live', 'polite');
  const main = el('div', 'm-main');
  const text = el('div', 'm-text');
  const side = el('div', 'm-side');
  side.hidden = true;
  const overlay = el('div', 'm-overlay');
  main.append(text, side, overlay);
  const controls = el('div', 'm-controls');
  root.append(head, stepName, hint, main, controls);

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

  // 단위 이름과 박 밖 음보 이름표: 드러나기 전에는 갈래를 알려 주지 않는다(보스는 늘)
  const unitNeutral = boss || !ctx.revealed;
  const view = createTextView(text, { song, layer: 'original', neutral: boss || !(ctx.revealed || ctx.marksKnown) });
  let hintText = '';
  const setHint = (t) => { hintText = t; hint.textContent = view.isGloss ? L.glossPaused : t; };
  const setStep = (s, actionId) => {
    root.dataset.step = s;
    const key = s === 'decided' ? 'decide' : s;
    const name = key === 'action' ? L.steps.action(actionId) : L.steps[key];
    stepName.textContent = name ? L.steps.lead + ' · ' + name : '';
    stepName.dataset.step = key;
  };

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
    // 지금 울리는 음보 표시는 입구 튜토리얼과 향가관에서만 늘 보인다(그 밖에서는 놓쳐서 다시 들을 때만).
    // '같은 걸음으로 넘기기'는 관에서만(입구 튜토리얼·보스는 아님).
    const scaffold = !boss && (ctx.wing === 'entrance' || ctx.wing === 'hyangga');
    const offerSkip = !boss && !!ctx.wing && ctx.wing !== 'entrance';
    const tapP = quiet(runTap({ song, view, root, controls, overlay, setHint, rhythm: ctx.rhythm ?? null, beat, setSlashMode, signal, emit, neutral: view.plainMarks, scaffold, offerSkip }));
    if (needIntro('common')) {
      await intro('tap', controls.querySelector('.m-listen') ?? text.querySelector('button.m-word'));
      ctx.onIntroSeen?.('common');
    }
    const tap = await tapP;

    // ── 고유 동작 ──
    const actions = [];
    if (!boss) {
      setStep('action', wingAction);
      const actionP = quiet(runAction(wingAction));
      if (needIntro('unique')) {
        await intro('unique', controls.querySelector('[data-intro-target]') ?? text.querySelector('.is-target') ?? controls);
        ctx.onIntroSeen?.('unique');
      }
      const done = await actionP;
      actions.push(done);
      // 후렴 고리 걸기가 되풀이 구절을 찾았으면 이제 두루마리에 여음·후렴·되풀이 이름표를 단다
      if (done?.action === 'refrain-link' && done.present) view.setPlainMarks(false);
    } else {
      await toolsLoop(actions);
    }

    const sheet = { songId: song.id, fold, tap, action: actions[actions.length - 1] };
    if (boss) {
      sheet.actions = actions;
      return sheet;
    }
    if (typeof ctx.decide === 'function') {
      sheet.decided = await decideStep(sheet);
      return sheet;
    }
    await showSheet(sheet);
    return sheet;
  } finally {
    outer?.removeEventListener('abort', onOuterAbort);
    for (const off of offs) off?.();
    view.dispose();
    if (useWorld) ctx.world.closeSplit();
    root.remove();
  }

  // 분석표를 보이고 '확인'을 기다린다(미리 분석한 노래, 판별을 하지 않는 단독 화면)
  async function showSheet(sheet, note) {
    setStep('sheet');
    renderSheet(side, sheet, song, { neutral: unitNeutral, note, title: L.sheetTitle });
    text.hidden = true;
    side.hidden = false;
    pager.hidden = true;
    setHint('');
    const finish = button('m-finish', L.finish);
    controls.replaceChildren(viewToggle(), finish);
    await clickOnce(finish, signal);
  }

  // 분석표와 두루마리를 오가는 단추
  function viewToggle() {
    const toggle = button('m-view-toggle', L.showScroll);
    toggle.addEventListener('click', () => {
      const showText = text.hidden;
      text.hidden = !showText;
      side.hidden = showText;
      pager.hidden = !showText;
      toggle.textContent = showText ? L.showSheet : L.showScroll;
      if (showText) view.relayout();
    });
    return toggle;
  }

  // ④ 갈래 판별: 분석표 아래 다섯 갈래 단추. 고르면 ctx.decide가 맞고 틀림을 알려 준다(틀리면 부르는 쪽이 맞대어 보기
  // 창을 열었다 닫은 뒤에 돌아온다). 맞을 때까지 다시 고른다. 맞으면 분석표를 갈래 단위 이름으로 다시 쓰고 '확인'을 기다린다.
  async function decideStep(sheet) {
    setStep('decide');
    text.hidden = true;
    side.hidden = false;
    pager.hidden = true;
    const sheetBox = el('div', 'm-decide-sheet');
    const box = el('section', 'm-decide');
    box.setAttribute('aria-label', L.decideTitle);
    const status = el('p', 'm-decide-status');
    status.setAttribute('aria-live', 'polite');
    const grid = el('div', 'm-decide-genres');
    const genreButtons = GENRES.map((g) => {
      const b = button('m-genre', g.name);
      b.dataset.genre = g.id;
      grid.append(b);
      return b;
    });
    box.append(el('h3', 'm-decide-title', L.decideTitle), el('p', 'm-decide-prompt', L.decidePrompt), status);
    // 분석표와 판별 안내는 스크롤되는 오른쪽 자리에, 다섯 갈래 단추는 늘 보이는 아래 조작 줄에 둔다(좁은 화면에서도 가려지지 않게)
    side.classList.add('is-scroll');
    side.replaceChildren(sheetBox, box);
    renderSheet(sheetBox, sheet, song, { neutral: unitNeutral, title: L.sheetTitle });
    controls.replaceChildren(viewToggle(), grid);
    const guide = ctx.decideGuide ? genreById(ctx.decideGuide) : null;
    setHint(guide ? L.decideGuide(guide.name) : L.decideHint);
    if (guide) {
      const target = genreButtons.find((b) => b.dataset.genre === guide.id);
      target?.classList.add('is-guide');
      await intro('decide', target);
    }
    for (;;) {
      const genre = await new Promise((resolve, reject) => {
        const onAbort = () => { grid.removeEventListener('click', onClick); reject(abortError(signal)); };
        function onClick(e) {
          const b = e.target.closest('.m-genre');
          if (!b || b.disabled) return;
          grid.removeEventListener('click', onClick);
          signal?.removeEventListener('abort', onAbort);
          resolve(b.dataset.genre);
        }
        if (signal?.aborted) { onAbort(); return; }
        grid.addEventListener('click', onClick);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      for (const b of genreButtons) b.disabled = true;
      status.textContent = '';
      let r = null;
      try {
        r = await ctx.decide(genre, sheet);
      } finally {
        for (const b of genreButtons) b.disabled = false;
      }
      if (signal?.aborted) throw abortError(signal);
      if (r?.correct) {
        // 맞음: 그 갈래의 단위 이름이 드러난다(분석표 줄도 '부분' 대신 갈래 단위 이름으로)
        setStep('decided');
        root.dataset.decided = genre;
        // 두루마리를 보던 중이었어도 분석표와 확인 글을 보인다
        text.hidden = true;
        side.hidden = false;
        pager.hidden = true;
        renderSheet(sheetBox, sheet, song, { neutral: false, title: L.sheetTitle });
        view.setPlainMarks?.(false);
        const name = genreById(genre)?.name ?? '';
        const result = el('div', 'm-decide-result');
        result.append(el('p', 'm-decide-right', L.decideRight(name)), el('p', 'm-decide-term', UNIT_TERMS[genre] ?? ''));
        if (r.note) result.append(el('p', 'm-decide-note', r.note));
        box.replaceChildren(el('h3', 'm-decide-title', L.decideTitle), result);
        side.scrollTop = side.scrollHeight;   // 확인 글이 분석표 아래에 보이게
        setHint('');
        const finish = button('m-finish', L.decideDone);
        controls.replaceChildren(viewToggle(), finish);
        finish.focus({ preventScroll: true });
        await clickOnce(finish, signal);
        return genre;
      }
      // 틀림: 고른 단추를 표시하고(색만이 아니라 글자 모양으로) 다시 고른다
      genreButtons.find((b) => b.dataset.genre === genre)?.classList.add('is-tried');
      status.textContent = L.decideAgain;
    }
  }

  // 보스: 다섯 고유 동작을 도구로 골라 쓴다. '분석 마치기'로 끝낸다(도구를 하나 이상 써야 한다)
  async function toolsLoop(actions) {
    for (;;) {
      setStep('tools');
      setHint(L.toolsHint);
      text.hidden = true;
      pager.hidden = true;
      const grid = el('div', 'm-tools');
      for (const id of ACTION_IDS) {
        const t = button('m-tool', ACTION_TEXT[id].name);
        t.append(el('span', 'm-tool-sub', ACTION_TEXT[id].sub));
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
      setStep('action', choice);
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
