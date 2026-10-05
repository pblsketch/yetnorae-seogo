// 작품 방 「님이 오마 하거늘」(사설시조관, spec 9 · js/data/README.md 7.3 · '추가 제안(T24)').
// 님이 온다는 말에 허둥지둥 달려가는 늘어난 중장을 연타로 달리다가, 반전(주추리 삼대) 바로 앞에서 멈추고
// "무엇을 보게 될까?"를 예측한다. 어느 후보를 골라도 반전과 종장의 해학이 그대로 공개된다(채점하지 않는다).
//
// 흐름: 처음(초장) → 달리기(중장 음보 0 ~ reversal.fromFoot-1) → 예측 → 공개(반전 음보와 중장 전체 풀이) → 종장 → 완료
// - 박자 방식: 중장을 몇 음보씩 낭송하고, 학생은 낭송에 맞춰 「달리기」를 두드린다(맞은 박은 음보에 표시).
//   박을 놓쳐도 길은 이어진다(실패 없음).
// - 박자 없는 방식(소리 끔·빗금 모드): 「달리기」를 누를 때마다 한 음보씩 달린다. 달리는 도중 바뀌어도 그 자리에서 이어진다.
// - 노래 글은 노래 데이터에서만, 방에서 새로 쓴 글은 js/data/rooms-saseol.js에서만 가져온다.
// - 중단 신호가 오면 AbortError로 끝내고 모든 것을 치운다. 다음에는 처음부터 다시 한다(spec 20). 진행을 저장하지 않는다.
import { on } from '../core/events.js';
import * as Rhythm from '../core/rhythm.js';
import { roomSaseol as T } from '../data/rooms-saseol.js';
import { createAssets } from '../world/assets.js';
import { createRoomScene3D } from './saseol-3d.js';
import { createRoomBoard2D } from './saseol-2d.js';

// ── 조정 가능한 기본값 ──
export const RUN_CHUNK_FEET = 6;   // 박자 방식에서 한 번에 낭송하는 음보 수

const STYLE_HREF = new URL('../../css/room-saseol.css', import.meta.url).href;

function ensureStyle() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[href$="css/room-saseol.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  link.dataset.roomStyle = 'saseol';
  document.head.append(link);
}

function abortError(signal) {
  const r = signal?.reason;
  return r instanceof Error && r.name === 'AbortError' ? r : new DOMException('작품 방을 나갔다', 'AbortError');
}

// 노래가 방에 필요한 모양인지(세 장, 중장의 반전 표시)
function checkSong(song) {
  const mid = song?.units?.[1];
  const r = mid?.reversal;
  if (!Array.isArray(song?.units) || song.units.length !== 3) throw new Error('작품 방: 세 장으로 된 노래가 아니다');
  if (!r || !Number.isInteger(r.fromFoot) || r.fromFoot <= 0 || r.fromFoot >= mid.feet.length || typeof r.glossBefore !== 'string') {
    throw new Error('작품 방: 중장 반전 표시(units[1].reversal)가 없다');
  }
  return r.fromFoot;
}

// 노래 박자 칸에서 한 장의 음보 [from, to)만 떼어 chunk 음보씩 단위로 다시 놓은 칸(rhythm.js buildGrid 모양)
export function subGrid(full, unit, from, to, chunk) {
  const seg = full.segments.find((s) => s.unit === unit);
  if (!seg) throw new Error('박자 칸에 없는 장: ' + unit);
  const src = seg.beats.map((bi) => full.beats[bi]).filter((b) => b.foot >= from && b.foot < to);
  const beats = [];
  const segments = [];
  let t = 0;
  for (let k = 0; k < src.length; k += chunk) {
    if (k > 0) t += full.gapSec;
    const part = src.slice(k, k + chunk);
    const s = { index: segments.length, unit, line: null, start: t, beatSec: seg.beatSec, duration: part.length * seg.beatSec, beats: [] };
    part.forEach((b, j) => {
      const nb = { index: beats.length, time: t + j * seg.beatSec, segment: s.index, unit, line: null, foot: b.foot, path: b.path };
      s.beats.push(nb.index);
      beats.push(nb);
    });
    t += s.duration;
    segments.push(s);
  }
  return { ...full, beats, segments, duration: t };
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

export function start(ctx) {
  const signal = ctx?.signal;
  if (signal?.aborted) return Promise.reject(abortError(signal));
  let rev;
  try { rev = checkSong(ctx?.song); } catch (e) { return Promise.reject(e); }
  ensureStyle();
  const room = createRoom(ctx, rev);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      room.dispose();
      fn(v);
    };
    const onAbort = () => finish(reject, abortError(signal));
    signal?.addEventListener('abort', onAbort, { once: true });
    room.flow().then((record) => finish(resolve, { completed: true, record }), (e) => finish(reject, e));
  });
}

function createRoom(ctx, REV) {
  const { song, container } = ctx;
  const mid = song.units[1];
  const reduced = () => (typeof ctx.reduceMotion === 'function' ? !!ctx.reduceMotion() : !!ctx.reduceMotion);

  // 소리·박자 손잡이(README '추가 제안(T3)'·'추가 제안(T5)'의 rhythm 모양). 엔진을 바로 넘겨도 받는다.
  const rh = ctx.rhythm ?? {};
  const engine = rh.engine ?? (typeof rh.play === 'function' ? rh : null);
  const buildGrid = rh.buildGrid ?? Rhythm.buildGrid;
  const createTapSession = rh.createTapSession ?? Rhythm.createTapSession;
  const offsetMs = rh.offsetMs ?? 0;
  let noBeat = !!(ctx.noBeat ?? engine?.noBeat?.value ?? false);

  let alive = true;
  const cleanups = [];
  let reciting = null;
  let onNoBeat = null;
  cleanups.push(on('rhythm:no-beat', (d) => { noBeat = !!d?.value; onNoBeat?.(noBeat); }));

  // 자산: 넘겨받은 손잡이, 없으면 자산 목록으로 만든다
  let assets = ctx.assets ?? null;
  if (!assets && ctx.manifest) {
    assets = createAssets(ctx.manifest, ctx.three?.THREE ?? null);
    cleanups.push(() => assets.dispose());
  }

  // ── 화면 뼈대 ──
  const root = el('div', 'rs-room');
  root.dataset.phase = 'intro';
  const sceneEl = el('div', 'rs-scene');
  sceneEl.setAttribute('role', 'img');
  sceneEl.setAttribute('aria-label', T.labels.scene);
  const panel = el('section', 'rs-panel');
  panel.setAttribute('aria-label', '「' + song.title + '」 ' + T.heading);
  const head = el('header', 'rs-head');
  head.append(el('span', 'rs-tag', T.heading), el('h2', 'rs-title', '「' + song.title + '」'));
  const line = el('p', 'rs-line');
  line.setAttribute('aria-live', 'polite');
  const text = el('div', 'rs-text');
  const ask = el('div', 'rs-ask');
  ask.hidden = true;
  const predicted = el('div', 'rs-predicted');
  predicted.hidden = true;
  const humor = el('div', 'rs-humor');
  humor.hidden = true;
  const controls = el('div', 'rs-controls');
  panel.append(head, line, text, ask, predicted, humor, controls);
  root.append(sceneEl, panel);
  container.append(root);

  // ── 장면(3D 또는 2D 그림 판) ──
  let scene = null;
  const appearance = ctx.appearance === 'b' ? 'b' : 'a';
  if (ctx.mode === '3d' && ctx.three?.THREE && ctx.three.root && ctx.three.camera) {
    try {
      scene = createRoomScene3D({ ...ctx.three, assets, appearance, reduceMotion: reduced, total: REV });
      root.dataset.mode = '3d';
    } catch (e) {
      console.warn('[작품 방] 3D 장면을 만들지 못해 2D 그림 판으로 그린다', e);
      scene = null;
    }
  }
  if (!scene) {
    scene = createRoomBoard2D({ host: sceneEl, assets, appearance, reduceMotion: reduced, total: REV });
    root.dataset.mode = '2d';
  }
  // 3D는 글 판이 화면 오른쪽을 덮으므로, 장면이 왼쪽 빈자리 가운데에 오도록 판의 몫을 알린다
  const updateFrame = () => {
    const w = root.clientWidth || 1;
    scene.setPanelFraction?.(Math.min(0.8, panel.offsetWidth / w));
  };
  updateFrame();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(updateFrame);
    ro.observe(root);
    cleanups.push(() => ro.disconnect());
  }
  root.classList.toggle('is-reduced', reduced());

  // ── 글 상자 ──
  const footEls = new Map();   // 'u-f' → 음보 요소
  const hits = new Set();      // 박에 맞춘 중장 음보

  function jangBox(u, name) {
    const box = el('div', 'rs-jang');
    box.dataset.u = String(u);
    box.append(el('span', 'rs-jang-name', name), el('div', 'rs-feet'));
    text.append(box);
    return box;
  }

  function addFoot(box, u, f, extraClass) {
    const foot = song.units[u].feet[f];
    const e = el('span', 'rs-foot' + (extraClass ? ' ' + extraClass : ''));
    e.dataset.u = String(u);
    e.dataset.f = String(f);
    e.append(el('span', 'rs-orig', foot.original), el('span', 'rs-read', foot.reading));
    if (u === 1 && hits.has(f)) e.classList.add('is-hit');
    box.querySelector('.rs-feet').append(e);
    footEls.set(u + '-' + f, e);
    return e;
  }

  function setGloss(box, kind, value) {
    box.querySelector('.rs-gloss-row')?.remove();
    const row = el('div', 'rs-gloss-row');
    const g = el('p', 'rs-gloss', value);
    g.dataset.kind = kind;
    row.append(el('span', 'rs-label', kind === 'before' ? T.labels.glossSoFar : T.labels.gloss), g);
    box.append(row);
  }

  // target이 있으면 그 요소의 위가 글 상자 위에 오게, alignEnd면 그 요소의 아래가 글 상자 아래에 오게, 없으면 끝까지
  function scrollText(target = null, alignEnd = false) {
    let top = text.scrollHeight;
    if (target) {
      const y = target.offsetTop - text.offsetTop;
      top = alignEnd ? Math.min(y - 4, y + target.offsetHeight - text.clientHeight + 8) : y - 4;
    }
    text.scrollTo?.({ top, behavior: reduced() ? 'auto' : 'smooth' });
    if (!text.scrollTo) text.scrollTop = top;
  }

  const setPhase = (p) => { root.dataset.phase = p; };
  const clicked = (b) => new Promise((res) => {
    b.addEventListener('click', () => { if (!alive || b.disabled) return; b.disabled = true; res(); }, { once: true });
  });
  const focus = (b) => { try { b.focus({ preventScroll: true }); } catch { /* 초점을 줄 수 없음 */ } };

  // 낭송(기다리지 않는다). 소리 판이 아직 열리지 않았으면 내지 않는다.
  function recite(grid, segs) {
    stopRecite();
    if (!engine || !engine.unlocked) return;
    try { reciting = engine.play(grid, segs); } catch (e) { console.warn('[작품 방] 낭송을 내지 못했다', e); reciting = null; }
  }
  function stopRecite() { reciting?.stop?.(); reciting = null; }

  // ── 달리기: 중장 음보 0 ~ REV-1 ──
  function runMiddle(midBox) {
    return new Promise((done) => {
      let shown = 0;
      let mode = !engine || noBeat ? 'untimed' : 'beat';
      let playing = null;
      let session = null;
      let finished = false;
      const runBtn = button('rs-run rs-primary', T.runButton);
      const count = el('span', 'rs-count');
      const updateCount = () => { count.textContent = T.runCount + ' ' + shown + ' / ' + REV; };
      updateCount();
      controls.replaceChildren(runBtn, count);
      focus(runBtn);

      const setMode = (m) => {
        mode = m;
        root.dataset.runMode = m;
        line.textContent = m === 'beat' ? T.runHint.beat : T.runHint.noBeat;
      };
      setMode(mode);

      const finishRun = () => {
        if (finished || !alive) return;
        finished = true;
        onNoBeat = null;
        playing?.stop?.();
        playing = null;
        done();
      };
      const showUpTo = (f) => {
        while (shown <= f && shown < REV) {
          addFoot(midBox, 1, shown);
          shown++;
        }
        updateCount();
        scene.setProgress(shown / REV);
        scrollText();
      };
      const toUntimed = () => {
        if (mode === 'untimed' || finished) return;
        setMode('untimed');
        const p = playing;
        playing = null;
        session = null;
        p?.stop?.();
      };
      onNoBeat = (v) => { if (v) toUntimed(); };

      // 박자 방식의 두드림: 소리 판 시각으로 판정하고, 맞은 박은 그 음보에 표시한다
      const beatTap = (e) => {
        if (mode !== 'beat' || finished || !engine) return;
        const t = engine.tap(e.timeStamp);
        const res = session?.tap(t);
        if (res?.hit && res.foot !== null) {
          hits.add(res.foot);
          footEls.get('1-' + res.foot)?.classList.add('is-hit');
          scene.hit?.();
        }
      };
      runBtn.addEventListener('pointerdown', (e) => beatTap(e));
      runBtn.addEventListener('keydown', (e) => {
        if (mode !== 'beat' || (e.key !== ' ' && e.key !== 'Enter')) return;
        e.preventDefault();
        if (!e.repeat) beatTap(e);
      });
      // 박자 없는 방식: 누를 때마다 한 음보
      runBtn.addEventListener('click', () => {
        if (mode !== 'untimed' || finished || !alive) return;
        showUpTo(shown);
        scene.step?.();
        if (shown >= REV) finishRun();
      });

      if (mode === 'beat') {
        (async () => {
          const grid = subGrid(buildGrid(song), 1, 0, REV, RUN_CHUNK_FEET);
          for (let k = 0; k < grid.segments.length; k++) {
            if (mode !== 'beat' || !alive) return;
            session = createTapSession(grid, { offsetMs });
            const h = engine.play(grid, [k], { judge: session, onBeat: ({ beat }) => { if (mode === 'beat' && alive) showUpTo(grid.beats[beat].foot); } });
            playing = h;
            const r = await h.finished;
            if (!alive || mode !== 'beat') return;
            if (!r?.completed) { toUntimed(); return; }   // 소리 판이 잠겼거나 멈춤: 그 자리에서 박자 없는 방식으로
            session.close(k);
            const last = grid.segments[k].beats.at(-1);
            showUpTo(grid.beats[last].foot);
          }
          if (alive && mode === 'beat') finishRun();
        })().catch((e) => { console.warn('[작품 방] 낭송 달리기를 이어 가지 못해 박자 없는 방식으로 바꾼다', e); toUntimed(); });
      }
    });
  }

  // ── 예측 ──
  function choose() {
    return new Promise((res) => {
      const q = el('p', 'rs-question');
      q.append(el('span', 'rs-qtag', T.questionTag), document.createTextNode(T.question));
      const list = el('div', 'rs-choices');
      for (const c of T.candidates) {
        const b = button('rs-choice');
        b.dataset.id = c.id;
        b.append(el('span', 'rs-choice-text', c.text), el('span', 'rs-choice-note', c.note));
        b.addEventListener('click', () => {
          if (!alive) return;
          for (const x of list.querySelectorAll('button')) x.disabled = true;
          res(c);
        }, { once: true });
        list.append(b);
      }
      ask.replaceChildren(q, list);
      ask.hidden = false;
      focus(list.firstChild);
    });
  }

  // ── 흐름 ──
  async function flow() {
    const fullGrid = () => buildGrid(song);

    // 처음: 초장
    setPhase('intro');
    line.textContent = T.intro;
    const first = jangBox(0, T.labels.firstJang);
    song.units[0].feet.forEach((_, f) => addFoot(first, 0, f));
    setGloss(first, 'first', song.units[0].gloss);
    const startBtn = button('rs-start rs-primary', T.startButton);
    controls.replaceChildren(startBtn);
    focus(startBtn);
    await clicked(startBtn);

    // 달리기: 늘어난 중장
    setPhase('run');
    const midBox = jangBox(1, T.labels.middleJang);
    scrollText(midBox);
    await runMiddle(midBox);

    // 멈춤과 예측
    setPhase('predict');
    delete root.dataset.runMode;
    controls.replaceChildren();
    line.textContent = T.stopLine;
    setGloss(midBox, 'before', mid.reversal.glossBefore);
    scene.stop?.();
    scrollText();
    const pick = await choose();
    const record = { room: 'saseol', predictionId: pick.id, predictionText: pick.text };

    // 공개: 반전 음보와 중장 전체 풀이
    setPhase('reveal');
    ask.hidden = true;
    ask.replaceChildren();
    line.textContent = T.revealHead;
    const mine = el('p', 'rs-mine');
    mine.append(el('span', 'rs-qtag', T.myPrediction), el('strong', 'rs-mine-text', pick.text));
    predicted.replaceChildren(mine, el('p', 'rs-reaction', T.reactions[pick.id] ?? ''));
    predicted.hidden = false;
    let firstRev = null;
    for (let f = REV; f < mid.feet.length; f++) {
      const e = addFoot(midBox, 1, f, 'is-reversal');
      firstRev ??= e;
    }
    setGloss(midBox, 'middle', mid.gloss);
    scene.reveal();
    scrollText(firstRev);
    recite(subGrid(fullGrid(), 1, REV, mid.feet.length, mid.feet.length), [0]);
    const nextBtn = button('rs-next rs-primary', T.nextButton);
    controls.replaceChildren(nextBtn);
    focus(nextBtn);
    await clicked(nextBtn);

    // 종장: 해학
    setPhase('final');
    predicted.hidden = true;
    line.textContent = T.finalHead;
    const fin = jangBox(2, T.labels.finalJang);
    song.units[2].feet.forEach((_, f) => addFoot(fin, 2, f));
    setGloss(fin, 'final', song.units[2].gloss);
    fin.append(el('p', 'rs-frame-text', T.frameNote));
    humor.replaceChildren(el('p', 'rs-humor-text', T.humorNote));
    humor.hidden = false;
    scrollText(fin.querySelector('.rs-gloss-row'), true);   // 종장 풀이(해학)가 다 보이게
    const g = fullGrid();
    const finSeg = Rhythm.segmentIndexOf(g, 2);
    if (finSeg >= 0) recite(g, [finSeg]);
    const finishBtn = button('rs-finish rs-primary', T.finishButton);
    controls.replaceChildren(finishBtn);
    focus(finishBtn);
    await clicked(finishBtn);
    return record;
  }

  function dispose() {
    if (!alive) return;
    alive = false;
    onNoBeat = null;
    stopRecite();
    for (const fn of cleanups.splice(0)) { try { fn(); } catch { /* 이미 치움 */ } }
    try { scene?.dispose(); } catch (e) { console.warn('[작품 방] 장면을 치우다 오류', e); }
    root.remove();
  }

  return { flow, dispose };
}
