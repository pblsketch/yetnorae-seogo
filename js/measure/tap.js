// 두드리기와 빗금(spec 5.3, 20).
//  - 두드리기: 낭송을 들으며 음보(향가는 구)마다 장구를 친다. 박자 엔진(js/core/rhythm.js)의 판정 창 안의 탭만 인정한다.
//    한 단위(향가 구, 고려가요 줄, 나머지 장·행)에서 박을 놓치면 그 단위를 다시 듣는다. 놓친 박이 기준(3)에 닿으면 빗금을 권한다.
//  - 빗금: 박자 없는 방식(소리 끔·빗금 모드). 음보가 끝나는 말 뒤를 눌러 빗금을 긋는다. 시간 제한이 없다.
//    음보 경계가 아닌 곳은 흔들리기만 하고 기록이 남지 않는다.
// 두 방식은 도중에 바뀔 수 있고(rhythm:no-beat), 마친 단위는 그대로 둔다. 결과는 같은 증거다(README 6절 tap).
// 낭송 조각이 없어도 엔진이 딸깍 소리로 박자를 이어 가므로 막히지 않는다.
// 고려가요의 여음·후렴·되풀이 머리(음보 kind)는 낭송은 하지만 박이 아니다. 두드리지 않고, 빗금도 긋지 않으며,
// 놓친 박으로도 세지 않는다. 후렴만 있는 줄은 듣기만 한다(빗금 방식에서는 처음부터 마친 줄로 둔다).
import { emit as busEmit } from '../core/events.js';
import * as R from '../core/rhythm.js';
import { refrainFootCount } from '../core/song-shape.js';
import { feetOf, footKey, segmentsOf } from './text.js';
import { shake } from './view.js';
import { L } from './labels.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ctx: { song, view, root, controls, overlay, setHint, rhythm, beat, setSlashMode, signal, emit }
//  beat: { get() → 박자 없는 방식인지, on(fn) → 떼기 }   (measure.js가 만든다)
export async function runTap(ctx) {
  const { song, view, root, controls, overlay, setHint, rhythm, beat, signal } = ctx;
  const emit = ctx.emit ?? busEmit;
  const engine = rhythm?.engine ?? null;
  const buildGrid = rhythm?.buildGrid ?? R.buildGrid;
  const createTapSession = rhythm?.createTapSession ?? R.createTapSession;
  const offsetMs = rhythm?.offsetMs ?? 0;
  const hyangga = song.genre === 'hyangga';
  const goryeo = song.genre === 'goryeo';

  const segs = segmentsOf(song);
  const feet = feetOf(song);
  // 단위마다 박에 드는 음보 열쇠(여음·후렴·되풀이 머리는 뺀다). 비어 있으면 듣기만 하는 단위다.
  const feetOfSeg = segs.map((s) => feet.filter((f) => !f.mark && f.u === s.u && (s.l === null || f.l === s.l)).map((f) => footKey(f.u, f.l, f.f)));
  const listenOnly = (i) => feetOfSeg[i].length === 0;
  const hasOffbeat = feet.some((f) => f.mark);
  const tapHint = hasOffbeat ? L.tapHintOffbeat : L.tapHint;
  const segOf = (u, l) => segs.findIndex((s) => s.u === u && (s.l === null || s.l === l));
  const done = new Set();     // 인정된 음보(빗금, 또는 통과한 단위의 박)
  const lit = new Set();      // 이번에 친 박(다시 들으면 지운다)
  const passed = new Set();   // 마친 단위
  let sounding = null;        // 지금 울리는 음보
  let noEngine = !engine;
  let grid = null;
  let session = null;

  const abortP = new Promise((_, rej) => {
    if (signal?.aborted) rej(signal.reason ?? new DOMException('중단', 'AbortError'));
    signal?.addEventListener('abort', () => rej(signal.reason ?? new DOMException('중단', 'AbortError')), { once: true });
  });
  abortP.catch(() => {});

  // ── 꾸밈 ──
  function decorateWord(el, p) {
    if (p.kind !== 'word') return;
    const k = footKey(p.u, p.l, p.f);
    el.classList.toggle('is-lit', done.has(k) || lit.has(k));
    el.classList.toggle('has-slash', p.footEnd && done.has(k));
    el.classList.toggle('is-current', sounding === k);
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
  yes.addEventListener('click', () => { suggest.hidden = true; ctx.setSlashMode?.(true); });
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
  const drum = document.createElement('button');
  drum.type = 'button';
  drum.className = 'm-drum';
  drum.textContent = L.drum;
  drum.setAttribute('aria-label', '장구 치기');

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
      view.refresh();
    }
  }
  drum.addEventListener('pointerdown', onDrum);
  drum.addEventListener('keydown', (ev) => {
    if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); if (!ev.repeat) onDrum(ev); }
  });

  async function beatPhase() {
    root.dataset.tapMode = 'beat';
    view.setMode({ flow: false, interactive: null, decorateWord });
    controls.replaceChildren(listen, drum);
    setHint(tapHint);
    listen.disabled = false;
    const sw = switchWhen(false);
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
        grid = buildGrid(song);
        session = createTapSession(grid, { offsetMs });
      }
      for (let i = 0; i < segs.length; i++) {
        if (passed.has(i)) continue;
        const s = segs[i];
        const gi = R.segmentIndexOf(grid, s.u, s.l);
        view.goTo((p) => p.u === s.u && (s.l === null || p.l === s.l));
        setHint(listenOnly(i) ? L.listenOnly : tapHint);
        for (;;) {
          for (const k of feetOfSeg[i]) lit.delete(k);
          view.refresh();
          const h = engine.play(grid, [gi], {
            judge: session,
            onBeat: ({ beat: bi }) => { const b = grid.beats[bi]; sounding = footKey(b.unit, b.line ?? null, b.foot ?? 0); view.refresh(); },
            onSegmentEnd: () => { sounding = null; view.refresh(); },
          });
          const r = await Promise.race([h.finished, sw.p, abortP.catch((e) => { h.stop(); throw e; })]);
          if (r === 'switch') { h.stop(); sounding = null; return 'switch'; }
          if (!r.completed) return r.reason === 'locked' ? 'locked' : 'switch';
          const c = session.close(gi);
          if (c.suggestSlash) suggest.hidden = false;
          if (c.ok) { pass(i); view.refresh(); break; }
          setHint(L.replay);
          await Promise.race([sleep(350), abortP]);
          setHint(tapHint);
        }
      }
      return 'done';
    } finally {
      sw.off();
      sounding = null;
    }
  }

  // ── 빗금 ──
  function slashPhase() {
    root.dataset.tapMode = 'slash';
    controls.replaceChildren();
    setHint(noEngine && !beat.get() ? L.noSound : (hasOffbeat ? L.slashOffbeatHint : L.slashHint));
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
      const slash = noEngine || beat.get();
      const r = slash ? await slashPhase() : await beatPhase();
      if (r === 'locked') noEngine = true;
    }
  } finally {
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
