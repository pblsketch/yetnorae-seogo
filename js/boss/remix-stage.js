// 보스 2단계 '엉킨 낭송'(spec 10.2): 다섯 갈래 칸 노래 조각을 이어 붙인 리믹스에서 갈래가 바뀌는 순간을 짚는다.
//
// 판정은 한 곳에서만 한다(js/data/README.md '추가 제안(T17)').
//  - 박자 방식: 소리·박자 엔진의 리믹스 회차(createRemixSession, 판정 창 REMIX_WINDOW_MS)가 탭을 판정하고,
//    그 결과(맞힌 지점의 단위 번호 또는 틀림)를 진행 엔진 bossStage2Tap의 글줄 방식 입력으로 넘긴다.
//    진행 엔진의 시각 판정 창(REMIX_TAP_WINDOW_MS)은 쓰지 않는다.
//  - 박자 없는 방식(소리 끔·빗금 모드·소리 판을 열 수 없음): 이어 붙은 글줄을 보고 바뀌는 줄을 누른다.
//  두 방식 모두 진행 엔진에 { line: 단위 번호, switchLines: 바뀌는 지점의 단위 번호 넷 }을 넘긴다. 틀림은 line: -1.
// 놓친 지점은 그 앞뒤 단위를 다시 들려준다. 찾은 지점은 저장하지 않는다(나갔다 오면 2단계를 처음부터).
// 박자 방식에서 틀린 탭 뒤에는 '바뀌었다' 북이 판정 창 길이(REMIX_WINDOW_MS 앞+뒤)만큼 튕겨 나가 탭을 받지 않는다
// (마구 두드려 지점을 찾는 것을 막는다). 기록도 벌도 아니고, 그동안의 탭을 받지 않을 뿐이다. 글줄 방식은 그대로다.
import * as bus from '../core/events.js';
import * as Rh from '../core/rhythm.js';
import { joinFeet } from '../core/song-shape.js';
import { conceptsOfGenre } from '../data/concepts.js';
import { BOSS_TEXT as T } from '../data/boss-text.js';
import { el, button, waitClick, abortError } from './dom.js';

// 리믹스 단위마다 화면에 보일 글(오늘 소리). 갈래 이름은 보이지 않는다.
export function remixLines(grid, songById) {
  return grid.segments.map((seg) => {
    const song = songById(seg.songId);
    const u = song?.units?.[seg.unit];
    let text = '';
    if (song?.genre === 'hyangga') text = u?.reading ?? '';
    else if (song?.genre === 'goryeo') text = joinFeet(u?.lines?.[seg.line]?.feet ?? [], 'reading');
    else text = (u?.feet ?? []).map((f) => f.reading).join(' ');
    return { seg: seg.index, fragment: seg.fragment, text };
  });
}

// ctx: { box(그릴 곳), P(진행 엔진), remix, songById, engine, rhythm, signal, onWrong(help), onFound() }
// 돌려주는 Promise는 네 지점을 다 찾아 진행 엔진이 3단계로 넘어가면 끝난다.
export function runRemixStage(ctx) {
  const { box, P, remix, songById, engine, rhythm = {}, signal } = ctx;
  const buildRemixGrid = rhythm.buildRemixGrid ?? Rh.buildRemixGrid;
  const createRemixSession = rhythm.createRemixSession ?? Rh.createRemixSession;
  const grid = buildRemixGrid(remix, songById);
  const switches = grid.switches.slice();
  const lines = remixLines(grid, songById);
  const genreOfSeg = (seg) => remix.fragments[grid.segments[seg]?.fragment]?.genre ?? null;
  const conceptsAt = (seg) => conceptsOfGenre(genreOfSeg(seg)).map((c) => c.id);
  const found = new Set();   // 찾은 지점 번호(0~3)
  const offs = [];
  let mode = null;
  let handle = null;          // 지금 낭송 손잡이
  let finish;
  let fail;
  const done = new Promise((res, rej) => { finish = res; fail = rej; });
  let completed = false;

  const root = el('div', 'boss-remix');
  const hint = el('p', 'boss-remix-hint');
  hint.setAttribute('aria-live', 'polite');
  const points = el('ol', 'boss-remix-points');
  points.setAttribute('aria-label', T.stage2.pointsLabel);
  const pointEls = switches.map(() => { const li = el('li', 'boss-remix-point'); points.append(li); return li; });
  const body = el('div', 'boss-remix-body');
  root.append(hint, points, body);
  box.replaceChildren(root);

  function markFound() {
    pointEls.forEach((li, i) => li.classList.toggle('is-found', found.has(i)));
    for (const r of body.querySelectorAll('.boss-remix-row')) {
      const i = switches.indexOf(Number(r.dataset.seg));
      if (i >= 0 && found.has(i)) { r.classList.add('is-found'); r.disabled = true; }
    }
  }

  // 진행 엔진에 판정 결과를 넘긴다. seg: 맞힌 지점의 단위 번호 또는 -1(틀림). wrongAt: 틀린 탭이 난 단위(관련 개념)
  function send(seg, wrongAt) {
    if (completed) return null;
    const r = P.bossStage2Tap({ line: seg, switchLines: switches }, { conceptIds: wrongAt === undefined ? [] : conceptsAt(wrongAt) });
    if (!r?.ok) return r;
    if (r.wrong) {
      ctx.onWrong?.(!!r.help);
      return r;
    }
    found.add(r.found);
    markFound();
    ctx.onFound?.();
    if (r.complete) {
      completed = true;
      handle?.stop();
      finish();
    }
    return r;
  }

  // ── 박자 없는 방식: 글줄을 누른다 ──
  function lineMode(note) {
    mode = 'line';
    root.dataset.mode = 'line';
    hint.textContent = note ? note + ' ' + T.stage2.lineHint : T.stage2.lineHint;
    const list = el('div', 'boss-remix-lines boss-scroll');
    for (const l of lines) {
      const row = button('boss-remix-row', l.text);
      row.dataset.seg = String(l.seg);
      list.append(row);
    }
    list.addEventListener('click', (e) => {
      const row = e.target.closest('.boss-remix-row');
      if (!row || row.disabled || mode !== 'line') return;
      const seg = Number(row.dataset.seg);
      if (switches.includes(seg)) send(seg);
      else { send(-1, seg); row.classList.remove('is-wrong'); void row.offsetWidth; row.classList.add('is-wrong'); }
    });
    body.replaceChildren(list);
    markFound();
  }

  // ── 박자 방식: 낭송을 들으며 '바뀌었다'를 탭한다 ──
  function beatMode() {
    mode = 'beat';
    root.dataset.mode = 'beat';
    hint.textContent = T.stage2.beatHint;
    const myMode = {};
    beatMode.current = myMode;
    const now = el('p', 'boss-remix-now');
    now.setAttribute('aria-live', 'off');
    const listen = button('boss-remix-listen', T.stage2.listen);
    const tap = button('boss-remix-tap', T.stage2.tap);
    tap.disabled = true;
    const row = el('div', 'boss-remix-controls');
    row.append(listen, tap);
    body.replaceChildren(now, row);

    // 박자 방식으로 (다시) 들어올 때마다 새 회차. 이미 찾은 지점을 다시 맞혀도 진행 엔진의 기록은 그대로다.
    const session = createRemixSession(grid, { offsetMs: rhythm.offsetMs ?? 0 });
    let current = 0;
    let playing = false;
    // 틀린 탭 뒤 튕김: 판정 창 길이(앞+뒤)만큼 탭을 받지 않는다
    const bounceMs = Rh.REMIX_WINDOW_MS.before + Rh.REMIX_WINDOW_MS.after;
    let bounceUntil = 0;
    let bounceEnd = null;
    const unbounce = () => {
      clearTimeout(bounceEnd);
      bounceEnd = null;
      bounceUntil = 0;
      tap.classList.remove('is-bounced');
      tap.removeAttribute('aria-disabled');
    };
    const bounce = () => {
      bounceUntil = performance.now() + bounceMs;
      tap.classList.add('is-bounced');
      tap.setAttribute('aria-disabled', 'true');
      clearTimeout(bounceEnd);
      bounceEnd = setTimeout(unbounce, bounceMs);
    };
    offs.push(unbounce);

    function onTap(ev) {
      if (!playing || mode !== 'beat') return;
      ev.preventDefault?.();
      if (bounceUntil && performance.now() < bounceUntil) return;   // 튕겨 나간 동안은 받지 않는다
      const t = engine.tap(ev.timeStamp);
      if (t === null || t === undefined) return;
      tap.classList.remove('is-hit');
      void tap.offsetWidth;
      tap.classList.add('is-hit');
      const r = session.tap(t);
      if (r.kind === 'hit') send(switches[r.point]);
      else if (r.kind === 'wrong') { send(-1, current); if (!completed) bounce(); }
    }
    tap.addEventListener('pointerdown', onTap);
    tap.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (e.repeat) return;   // 누른 채 있는 키의 되풀이는 탭이 아니다
      onTap(e);
    });

    async function pass(segs) {
      playing = true;
      tap.disabled = false;
      listen.disabled = true;
      listen.textContent = T.stage2.listening;
      handle = engine.play(grid, segs, {
        judge: session,
        onSegmentStart: ({ segment }) => { current = segment; now.textContent = lines[segment]?.text ?? ''; },
      });
      const res = await handle.finished;
      handle = null;
      playing = false;
      tap.disabled = true;
      listen.disabled = false;
      return res;
    }

    const missed = () => switches.map((_, i) => i).filter((i) => !found.has(i));

    (async () => {
      let label = T.stage2.listen;
      let segs = null;
      for (;;) {
        listen.textContent = label;
        await waitClick(listen, signal);
        if (beatMode.current !== myMode || completed) return;
        let res = await pass(segs);
        if (beatMode.current !== myMode || completed) return;
        if (!res.completed) {
          // 소리 판을 열 수 없으면 글줄 방식으로
          if (res.reason === 'locked') { lineMode(T.stage2.soundOff); return; }
          segs = null;
          label = T.stage2.listen;
          continue;
        }
        // 놓친 지점은 그 앞뒤 단위를 다시 들려준다
        const left = missed();
        if (left.length) {
          hint.textContent = T.stage2.replayNotice;
          for (const p of left) {
            if (completed || beatMode.current !== myMode) return;
            res = await pass(Rh.remixReplaySegments(grid, p));
            if (!res.completed) break;
          }
          if (completed || beatMode.current !== myMode) return;
          hint.textContent = T.stage2.beatHint;
        }
        const still = missed();
        segs = still.length ? still.flatMap((p) => Rh.remixReplaySegments(grid, p)) : null;
        label = still.length ? T.stage2.replay : T.stage2.listen;
      }
    })().catch((e) => { if (e?.name !== 'AbortError') fail(e); });
  }

  function chooseMode() {
    const noBeat = !engine || !!engine.noBeat?.value;
    if (noBeat) lineMode();
    else beatMode();
  }

  offs.push(bus.on('rhythm:no-beat', (d) => {
    if (completed) return;
    const want = d?.value ? 'line' : 'beat';
    if (want === mode) return;
    beatMode.current = null;
    handle?.stop();
    if (want === 'line') lineMode(d?.reason === 'muted' ? T.stage2.soundOff : undefined);
    else beatMode();
  }));

  const onAbort = () => { handle?.stop(); fail(abortError(signal)); };
  signal?.addEventListener('abort', onAbort, { once: true });

  chooseMode();

  return done.finally(() => {
    beatMode.current = null;
    for (const off of offs) off();
    signal?.removeEventListener('abort', onAbort);
    handle?.stop();
  });
}
