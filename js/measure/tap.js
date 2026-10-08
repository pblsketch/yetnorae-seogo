// 두드리기와 빗금(spec 5.3, 20).
//  - 두드리기(쉼에 두드리기, 교사 결정 2026-10-07): 낭송이 음보(향가는 구) 하나를 읽고 정해진 쉼(약 1초,
//    rhythm.js TAP_PAUSE_SEC)을 두면, 학생은 그 쉼에 장구를 친다. 쉼에 친 탭은 그 음보 뒤에 빗금을 긋는다(빗금 모드와 같은 모습).
//    판정 창은 [조각 끝 − 150ms, 쉼 끝 + 150ms]이고 보정값을 뺀다(createPauseTapSession). 낭송하는 동안(창 밖) 친 탭은
//    놓친 것으로 세지 않고 '쉬는 사이에 치세요' 안내만 한다. 쉼에 치지 않은 음보가 있으면 그 단위가 끝난 자리에서 멈추고
//    그 단위부터 다시 듣는다(한 단위 = 향가 구, 고려가요 줄, 나머지 장·행). 놓친 음보가 기준(3)에 닿으면 빗금을 권한다.
//    남은 단위를 한 번에 이어 낸다(단위 사이에는 마지막 쉼과 짧은 틈만). 새로 시작할 때마다(듣기, 놓쳐서 다시 듣기,
//    멈췄다 재개) '준비' 딱 소리(판정 없음) 한 번 뒤 약 1초에 첫 음보가 나온다.
//  - 지금 울리는 음보 표시(is-current)는 입구 튜토리얼·향가관(ctx.scaffold)과 놓쳐서 다시 듣는 단위에서만 보인다.
//    그 밖에서는 귀로 듣고 친다. 맞은 음보는 어디서나 밝아진다.
//  - 관(ctx.offerSkip): 박 수가 같은(2 이상) 단위 둘을 잇달아 마쳤고 남은 단위가 모두 그 박 수이면 '같은 걸음으로 넘기기'를 둔다.
//    감정서는 노래 데이터에서 나오므로 넘겨도 같다.
//  - 빗금: 박자 없는 방식(소리 끔·빗금 모드). 음보가 끝나는 말 뒤를 눌러 빗금을 긋는다. 시간 제한이 없다.
//    음보 경계가 아닌 곳은 흔들리기만 하고 기록이 남지 않는다.
// 두 방식은 도중에 바뀔 수 있고(rhythm:no-beat), 마친 단위는 그대로 둔다. 결과는 같은 증거다(README 6절 tap).
// 낭송 조각이 없어도 엔진이 딸깍 소리로 박자를 이어 가므로 막히지 않는다.
// 고려가요의 여음·후렴·되풀이 머리(음보 kind)는 낭송은 하지만 박이 아니다. 쉼 없이 이어 읽고, 판정 창이 없으며, 빗금도
// 긋지 않고, 놓친 박으로도 세지 않는다. 후렴만 있는 줄은 듣기만 한다(빗금 방식에서는 처음부터 마친 줄로 둔다).
import { emit as busEmit } from '../core/events.js';
import * as R from '../core/rhythm.js';
import { refrainFootCount } from '../core/song-shape.js';
import { feetOf, footKey, segmentsOf } from './text.js';
import { shake } from './view.js';
import { L } from './labels.js';

// 낭송이 나야 하는데 소리 판 시각이 이만큼 멈춰 있으면(조작 전 손가락 기기 등) '낭송 듣기'를 다시 보인다
export const STUCK_MS = 3000;
// 낭송하는 동안 친 탭에 '쉬는 사이에 치세요'를 보이는 시간(그 뒤 원래 안내로 돌아간다)
export const TAP_WAIT_HINT_MS = 2500;

// ctx: { song, view, root, controls, overlay, setHint, rhythm, beat, setSlashMode, signal, emit, neutral, scaffold, offerSkip }
//  rhythm: { engine, buildPauseGrid?, createPauseTapSession?, offsetMs? } (없으면 rhythm.js의 것)
//  neutral: 박 밖 음보에 이름표가 없는 방식(보스, 관·입구에서 드러나기 전의 노래). 안내에 여음·후렴이라는 말을 쓰지 않는다
//  scaffold: 지금 울리는 음보를 늘 보인다(입구 튜토리얼·향가관)
//  offerSkip: '같은 걸음으로 넘기기'를 둘 수 있다(관. 입구·보스는 아님)
//  beat: { get() → 박자 없는 방식인지, on(fn) → 떼기 }   (measure.js가 만든다)
export async function runTap(ctx) {
  const { song, view, root, controls, overlay, setHint, rhythm, beat, signal } = ctx;
  const emit = ctx.emit ?? busEmit;
  const engine = rhythm?.engine ?? null;
  const buildPauseGrid = rhythm?.buildPauseGrid ?? R.buildPauseGrid;
  const createPauseTapSession = rhythm?.createPauseTapSession ?? R.createPauseTapSession;
  const offsetMs = rhythm?.offsetMs ?? 0;
  const hyangga = song.genre === 'hyangga';
  const goryeo = song.genre === 'goryeo';

  const segs = segmentsOf(song);
  const feet = feetOf(song);
  // 단위마다 박에 드는 음보 열쇠(여음·후렴·되풀이 머리는 뺀다). 비어 있으면 듣기만 하는 단위다.
  const footsOfSeg = segs.map((s) => feet.filter((f) => !f.mark && f.u === s.u && (s.l === null || f.l === s.l)));
  const feetOfSeg = footsOfSeg.map((fs) => fs.map((f) => footKey(f.u, f.l, f.f)));
  const listenOnly = (i) => feetOfSeg[i].length === 0;
  const hasOffbeat = feet.some((f) => f.mark);
  // 이름표가 없는 방식(neutral)에서는 안내도 여음·후렴이라는 말을 쓰지 않는다
  const neutral = !!ctx.neutral;
  const tapHint = hasOffbeat ? (neutral ? L.tapHintPlain : L.tapHintOffbeat) : L.tapHint;
  const listenOnlyHint = neutral ? L.listenOnlyPlain : L.listenOnly;
  const slashOffbeatHint = neutral ? L.slashPlainHint : L.slashOffbeatHint;
  const segOf = (u, l) => segs.findIndex((s) => s.u === u && (s.l === null || s.l === l));
  const done = new Set();     // 인정된 음보(빗금, 또는 통과한 단위의 박)
  const lit = new Set();      // 이번에 친 박(다시 들으면 지운다)
  const passed = new Set();   // 마친 단위
  let sounding = null;        // 지금 울리는 음보(보일 때만 값이 있다)
  let replayUnit = null;      // 놓쳐서 다시 듣는 단위(그 단위 동안은 지금 울리는 음보를 보인다)
  const scaffold = !!ctx.scaffold;
  const offerSkip = !!ctx.offerSkip;
  let noEngine = !engine;
  let grid = null;
  let session = null;
  let giOf = [];              // 두루마리 단위 → 박자 칸 단위
  const iOf = new Map();      // 박자 칸 단위 → 두루마리 단위

  const abortP = new Promise((_, rej) => {
    if (signal?.aborted) rej(signal.reason ?? new DOMException('중단', 'AbortError'));
    signal?.addEventListener('abort', () => rej(signal.reason ?? new DOMException('중단', 'AbortError')), { once: true });
  });
  abortP.catch(() => {});
  // 중단되었으면 곧바로 던진다(멈춘 낭송의 '멈춤' 결과가 중단보다 먼저 와도 다시 돌지 않게)
  const throwIfAborted = () => { if (signal?.aborted) throw signal.reason ?? new DOMException('중단', 'AbortError'); };

  // ── 꾸밈 ──
  // 쉼에 친 음보는 바로 빗금이 그어진다(빗금 모드와 같은 모습). 그 단위를 다시 들으면 지운다.
  function decorateWord(el, p) {
    if (p.kind !== 'word') return;
    const k = footKey(p.u, p.l, p.f);
    el.classList.toggle('is-lit', done.has(k) || lit.has(k));
    el.classList.toggle('has-slash', p.footEnd && (done.has(k) || lit.has(k)));
    el.classList.toggle('is-current', sounding !== null && sounding === k);
  }

  function light(u, l, f) {
    emit('diorama:pillar-light', goryeo ? { unit: u, line: l, foot: f } : { unit: u, foot: hyangga ? null : f });
  }

  function pass(i) {
    if (passed.has(i)) return;
    for (const k of feetOfSeg[i]) done.add(k);
    passed.add(i);
    if (hyangga) emit('diorama:floor-fill', { gu: passed.size });
  }

  // 아직 마치지 않은 단위의 친 박 표시를 지운다(다시 듣기·재개·빗금으로 바꿀 때 지난 표시가 남지 않게)
  function clearUnpassedLit() {
    for (const k of [...lit]) if (!done.has(k)) lit.delete(k);
  }

  // ── 빗금 권하기 ──
  const suggest = document.createElement('div');
  suggest.className = 'm-suggest';
  suggest.hidden = true;
  suggest.setAttribute('role', 'status');
  const sText = document.createElement('p');
  sText.textContent = L.suggest;
  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'm-suggest-yes';
  yes.textContent = L.suggestYes;
  const no = document.createElement('button');
  no.type = 'button';
  no.className = 'm-suggest-no';
  no.textContent = L.suggestNo;
  const sRow = document.createElement('div');
  sRow.className = 'm-suggest-row';
  sRow.append(yes, no);
  suggest.append(sText, sRow);
  overlay.append(suggest);
  yes.addEventListener('click', () => { suggest.hidden = true; clearUnpassedLit(); sounding = null; view.refresh(); ctx.setSlashMode?.(true); });
  no.addEventListener('click', () => { suggest.hidden = true; });

  // 박자 방식이 바뀌면 끝나는 약속
  function switchWhen(slashNow) {
    let off = null;
    const p = new Promise((res) => { off = beat.on((v) => { if (!!v !== slashNow) res('switch'); }); });
    return { p, off: () => off?.() };
  }

  // ── 두드리기 ──
  const listen = document.createElement('button');
  listen.type = 'button';
  listen.className = 'm-listen';
  listen.textContent = L.listen;
  // 누를 때마다 소리 판을 연다(멈춰 버린 소리 판도 이 누르기로 다시 돈다)
  listen.addEventListener('click', () => { try { engine?.unlock?.(); } catch { /* 소리 판을 열 수 없음 */ } });
  const drum = document.createElement('button');
  drum.type = 'button';
  drum.className = 'm-drum';
  drum.textContent = L.drum;
  drum.setAttribute('aria-label', '장구 치기');
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'm-skip-same';
  skipBtn.textContent = L.skipSame;

  // 지금 안내. 낭송하는 동안 친 탭의 안내(L.tapWait)는 잠깐 보인 뒤 이것으로 되돌린다
  let hintNow = tapHint;
  let waitTimer = null;
  function showHint(text) {
    hintNow = text;
    clearTimeout(waitTimer);
    waitTimer = null;
    setHint(text);
  }
  function onDrum(ev) {
    if (!session || !engine) return;
    const t = engine.tap(ev.timeStamp);
    const r = session.tap(t);
    drum.classList.remove('is-hit');
    void drum.offsetWidth;
    drum.classList.add('is-hit');
    if (r?.hit) {
      const f = r.foot ?? 0;
      lit.add(footKey(r.unit, r.line ?? null, f));
      light(r.unit, r.line ?? null, f);
      if (waitTimer) showHint(hintNow);
      view.refresh();
    } else if (r?.outside && typeof t === 'number') {
      // 낭송하는 동안(쉼 밖)의 탭: 놓친 것으로 세지 않고 쉬는 사이에 치라고만 알린다
      setHint(L.tapWait);
      clearTimeout(waitTimer);
      waitTimer = setTimeout(() => { waitTimer = null; setHint(hintNow); }, TAP_WAIT_HINT_MS);
    }
  }
  drum.addEventListener('pointerdown', onDrum);
  drum.addEventListener('keydown', (ev) => {
    if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); if (!ev.repeat) onDrum(ev); }
  });

  // 같은 걸음으로 넘기기: 가장 최근에 마친 단위와 그 앞 단위(잇단 둘)를 마쳤고 두 박 수가 같으며(2 이상),
  // 남은 단위가 모두 그 박 수일 때만. 구마다 한 박인 노래(향가)는 구를 하나씩 세며 치는 것이 핵심이라 두지 않는다
  function skipReady() {
    if (!offerSkip) return false;
    const rest = segs.map((_, j) => j).filter((j) => !passed.has(j));
    if (!rest.length) return false;
    const last = Math.max(...passed);
    if (!(last >= 1) || !passed.has(last - 1)) return false;
    const n = feetOfSeg[last].length;
    if (n < 2 || feetOfSeg[last - 1].length !== n) return false;
    return rest.every((j) => feetOfSeg[j].length === n);
  }
  function showSkipIfReady() {
    if (!skipBtn.isConnected && root.dataset.tapMode === 'beat' && skipReady()) controls.append(skipBtn);
  }
  // 남은 단위를 모두 마친 것으로 둔다(맞은 박처럼 기둥 불을 켠다)
  function skipRest() {
    for (let i = 0; i < segs.length; i++) {
      if (passed.has(i)) continue;
      for (const f of footsOfSeg[i]) light(f.u, f.l, f.f);
      pass(i);
    }
    view.refresh();
  }

  // 소리 판 시각이 STUCK_MS 동안 멈춰 있으면(멈춤 까닭 없이) '낭송 듣기'를 다시 보인다. 누르면 소리 판이 돈다.
  function watchStuck(hintNow) {
    let last = engine.now?.() ?? null;
    let since = Date.now();
    let shown = false;
    const id = setInterval(() => {
      const t = engine.now?.() ?? null;
      if (engine.paused || t !== last) {
        last = t;
        since = Date.now();
        if (shown && !engine.paused) { shown = false; listen.disabled = true; showHint(hintNow()); }
        return;
      }
      if (!shown && Date.now() - since >= STUCK_MS) { shown = true; listen.disabled = false; clearTimeout(waitTimer); waitTimer = null; setHint(L.soundStuck); }
    }, 250);
    return () => clearInterval(id);
  }

  async function beatPhase() {
    root.dataset.tapMode = 'beat';
    view.setMode({ flow: false, interactive: null, decorateWord });
    controls.replaceChildren(listen, drum);
    showHint(tapHint);
    listen.disabled = false;
    const sw = switchWhen(false);
    let skipClick = null;
    const skipP = new Promise((res) => { skipClick = () => res('skip'); });
    skipBtn.addEventListener('click', skipClick);
    let stopWatch = null;
    try {
      // 첫 조작(듣기)을 기다린다. 이 누르기가 소리 판을 연다.
      if (!grid || !engine.unlocked) {
        const clicked = new Promise((res) => listen.addEventListener('click', () => res('go'), { once: true }));
        const r = await Promise.race([clicked, sw.p, abortP]);
        if (r === 'switch') return 'switch';
        try { engine.unlock?.(); } catch { return 'locked'; }
      }
      listen.disabled = true;
      if (!grid) {
        grid = buildPauseGrid(song, { offsetMs });
        session = createPauseTapSession(grid, { offsetMs });
        giOf = segs.map((s) => R.segmentIndexOf(grid, s.u, s.l));
        giOf.forEach((gi, i) => iOf.set(gi, i));
      }
      showSkipIfReady();
      stopWatch = watchStuck(() => hintNow);
      let missedBefore = false;
      for (;;) {
        const rest = segs.map((_, i) => i).filter((i) => !passed.has(i));
        if (!rest.length) return 'done';
        const first = segs[rest[0]];
        view.goTo((p) => p.u === first.u && (first.l === null || p.l === first.l));
        clearUnpassedLit();
        sounding = null;
        view.refresh();
        // '준비' 소리 뒤 첫 음보가 나온다(놓쳐서 다시 들을 때는 그 안내를 남겨 둔다)
        showHint(missedBefore ? L.replay : L.ready);
        let missed = false;
        let h = null;
        h = engine.play(grid, rest.map((i) => giOf[i]), {
          judge: session,
          countIn: true,
          onSegmentStart: ({ segment }) => {
            const i = iOf.get(segment);
            const s = segs[i];
            if (!s) return;
            view.goTo((p) => p.u === s.u && (s.l === null || p.l === s.l));
            showHint(listenOnly(i) ? listenOnlyHint : tapHint);
          },
          onBeat: ({ beat: bi, segment }) => {
            const b = grid.beats[bi];
            const show = scaffold || replayUnit === iOf.get(segment);
            const next = show ? footKey(b.unit, b.line ?? null, b.foot ?? 0) : null;
            if (next === sounding) return;
            sounding = next;
            view.refresh();
          },
          onSegmentEnd: ({ segment }) => {
            const i = iOf.get(segment);
            sounding = null;
            const c = session.close(segment);
            if (c.suggestSlash) suggest.hidden = false;
            if (c.ok) {
              pass(i);
              if (replayUnit === i) replayUnit = null;
              view.refresh();
              showSkipIfReady();
              return;
            }
            // 박을 놓쳤다: 이 단위에서 멈추고 이 단위부터 다시 듣는다
            missed = true;
            replayUnit = i;
            for (const k of feetOfSeg[i]) lit.delete(k);
            showHint(L.replay);
            view.refresh();
            h?.stop();
          },
          onRestart: () => {
            // 멈췄다 재개: 진행 중이던 단위를 처음부터 다시 들으므로 그 단위의 친 박 표시를 지운다('준비' 소리부터)
            clearUnpassedLit();
            sounding = null;
            showHint(L.ready);
            view.refresh();
          },
        });
        const r = await Promise.race([h.finished, sw.p, skipP, abortP.catch((e) => { h.stop(); throw e; })]);
        throwIfAborted();
        if (r === 'switch') { h.stop(); return 'switch'; }
        if (r === 'skip') { h.stop(); sounding = null; skipRest(); return 'done'; }
        missedBefore = missed;
        if (r.completed || missed) continue;
        return r.reason === 'locked' ? 'locked' : 'switch';
      }
    } finally {
      stopWatch?.();
      clearTimeout(waitTimer);
      waitTimer = null;
      skipBtn.removeEventListener('click', skipClick);
      skipBtn.remove();
      sw.off();
      sounding = null;
      clearUnpassedLit();
    }
  }

  // ── 빗금 ──
  function slashPhase() {
    root.dataset.tapMode = 'slash';
    controls.replaceChildren();
    setHint(noEngine && !beat.get() ? L.noSound : (hasOffbeat ? slashOffbeatHint : L.slashHint));
    // 후렴만 있는 줄은 빗금을 그을 곳이 없으므로 마친 줄로 둔다
    segs.forEach((_, i) => { if (listenOnly(i)) pass(i); });
    const sw = switchWhen(true);
    const pageHasWork = ([a, e]) => view.pieces.slice(a, e).some((p) => p.kind === 'word' && !p.mark && p.footEnd && !done.has(footKey(p.u, p.l, p.f)));
    return new Promise((resolve, reject) => {
      let finished = false;
      const end = (v) => { if (finished) return; finished = true; sw.off(); resolve(v); };
      if (!noEngine) sw.p.then(end);
      abortP.catch((e) => { if (!finished) { finished = true; sw.off(); reject(e); } });
      if (passed.size === segs.length) { end('done'); return; }
      view.setMode({
        flow: false,
        interactive: 'word',
        // 여음·후렴·되풀이 머리는 미리 나뉘어 있어 빗금의 답이 아니다(누를 수 없는 말로 보인다)
        wordFilter: (p) => !p.mark,
        decorateWord,
        onWord(p, el) {
          if (finished || p.kind !== 'word' || p.mark) return;
          const k = footKey(p.u, p.l, p.f);
          if (done.has(k)) return;
          if (!p.footEnd) { shake(el); return; }
          done.add(k);
          light(p.u, p.l, p.f);
          engine?.sfx?.('janggu');
          const i = segOf(p.u, p.l);
          if (i >= 0 && feetOfSeg[i].every((x) => done.has(x))) pass(i);
          view.refresh();
          if (passed.size === segs.length) { end('done'); return; }
          if (!pageHasWork(view.range)) view.goToPageWhere(pageHasWork);
        },
      });
      if (!pageHasWork(view.range)) view.goToPageWhere(pageHasWork);
    });
  }

  try {
    while (passed.size < segs.length) {
      throwIfAborted();
      const slash = noEngine || beat.get();
      const r = slash ? await slashPhase() : await beatPhase();
      if (r === 'locked') noEngine = true;
    }
  } finally {
    clearTimeout(waitTimer);
    suggest.remove();
    drum.removeEventListener('pointerdown', onDrum);
    delete root.dataset.tapMode;
  }
  setHint(L.tapDone);

  // ── 증거 ──
  const countIn = (u, l) => feet.filter((f) => !f.mark && f.u === u && (l === undefined || f.l === l) && done.has(footKey(f.u, f.l, f.f))).length;
  if (hyangga) return { mode: 'gu', gu: passed.size };
  // 여음·후렴은 두루마리에 표시되어 들으며 확인한 것이므로 그 수도 증거에 담는다(song-shape.js deriveTapEvidence와 같은 모양)
  if (goryeo) return { mode: 'lines', feet: song.units.map((unit, u) => unit.lines.map((_, l) => countIn(u, l))), refrains: refrainFootCount(song) };
  return { mode: 'feet', feet: song.units.map((_, u) => countIn(u)) };
}
