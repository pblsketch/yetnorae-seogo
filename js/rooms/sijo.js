// 작품 방 「십 년을 경영하야」(시조관, spec 9). js/data/README.md 7.3의 start(ctx)를 따른다.
//
// 흐름
//  place     송순이 "초가 세 칸에 무엇을 들이겠소?" 하고 묻는다(초장 낭송). 물건 일곱을 칸 셋과 집 밖에 놓는다.
//            강산은 어느 칸에도 들어가지 않는다. 세 칸이 차면 '이대로 들이겠소'.
//  askback   재물·벼슬(금붙이·관복)을 들였으면 송순이 웃으며 되묻는다 → 다시 놓기 / 이대로 두기(어느 쪽도 맞고 틀림이 없다)
//  reveal    송순이 자기 배치를 들려준다(중장 낭송).
//  gangsan   "강산은 어디에 두겠소?" — 강산을 집 밖에 둔다(이미 밖에 있으면 건너뛴다).
//  pullback  강산을 밖에 두면 카메라가 물러나며(2D는 그림이 넓어짐) 강산이 병풍처럼 초가를 둘러싸고, 종장이 낭송된다.
//  interpret 배치에 따른 해석 문장('해석' 표시, 채점 없음) → 방을 나서면 { completed: true, record }.
//
// - 원문은 노래 데이터(ctx.song)에서만 가져온다. 방이 쓰는 글은 js/data/rooms-sijo.js.
// - 낭송은 ctx.rhythm.engine으로 한다. 낭송이 끝나야 '다음'이 열리지만, 박자 없는 방식(소리 끔·빗금)이면 기다리지 않는다.
// - 3D는 방 안에서만 쓰는 작은 장면을 container 안에 따로 만든다(ctx.three.THREE가 있으면 그것을 쓴다).
//   3D를 만들 수 없으면 2D 그림 판으로 한다. 규칙과 기록은 같다.
// - ctx.signal이 중단되면 모두 치우고 AbortError로 끝난다. 방은 다음에 처음부터 다시 한다(spec 20).
// - 진행을 저장하지 않는다. 기록을 돌려주면 한 판 흐름이 저장한다.
import { on as busOn } from '../core/events.js';
import { buildGrid as defaultBuildGrid, segmentIndexOf } from '../core/rhythm.js';
import { createAssets } from '../world/assets.js';
import { ROOM_SIJO as D } from '../data/rooms-sijo.js';
import * as L from './sijo-logic.js';
import { create2D } from './sijo-2d.js';

const BOARD = 'board/room-sijo';
const RECITE_SPARE_MS = 4000;   // 낭송이 끝났다는 소식을 기다리는 여유(조정 가능)
const STYLE_HREF = new URL('../../css/room-sijo.css', import.meta.url).href;

function abortError() {
  return new DOMException('작품 방을 나갔다', 'AbortError');
}

// 스타일이 문서에 없으면 붙인다(연결 단계가 index.html에 링크를 더하면 그것을 쓴다).
function ensureStyle() {
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === STYLE_HREF)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  document.head.appendChild(link);
}

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

const itemName = (id) => D.items.find((i) => i.id === id)?.name ?? id;
const placeName = (at) => (at === L.OUTSIDE ? D.outside : D.slots[at]);

export function start(ctx) {
  return new Promise((resolve, reject) => {
    const signal = ctx.signal ?? null;
    if (signal?.aborted) { reject(abortError()); return; }
    const container = ctx.container;
    const song = ctx.song;
    const reduce = () => {
      if (typeof ctx.reduceMotion === 'function') return !!ctx.reduceMotion();
      if (ctx.reduceMotion !== undefined) return !!ctx.reduceMotion;
      return !!document.getElementById('app')?.classList.contains('reduce-motion');
    };
    let noBeat = !!(ctx.noBeat ?? ctx.rhythm?.engine?.noBeat?.value);
    let closed = false;
    const offs = [];
    const timers = new Set();
    const hut = L.createHut();
    let phase = 'place';
    let selected = null;
    let view = null;
    let playing = null;
    let gateToken = 0;
    let replyPrefix = D.lines.accepted;
    let placedOnce = false;     // 한 번 놓아 보면 놓는 법 안내를 거둔다

    ensureStyle();
    const assets = ctx.assets ?? createAssets(ctx.manifest ?? null);

    // ── 화면 뼈대 ──
    const root = el('section', 'room-sijo', container);
    root.setAttribute('aria-label', D.title);
    root.dataset.phase = phase;
    root.dataset.view = 'near';
    root.dataset.settled = 'false';
    const viewport = el('div', 'sj-viewport', root);
    const slotLayer = el('div', 'sj-slot-layer', root);

    const top = el('div', 'sj-top sj-panel', root);
    const faceUrl = assets.image?.('sprite/singer-' + D.songId);
    if (faceUrl) {
      const face = el('img', 'sj-face', top);
      face.src = faceUrl;
      face.alt = D.speaker;
    } else el('div', 'sj-face sj-face-placeholder', top, D.speaker.slice(0, 1));
    const talk = el('div', 'sj-talk', top);
    el('div', 'sj-name', talk, D.speaker);
    const say = el('p', 'sj-say', talk);
    say.setAttribute('aria-live', 'polite');
    const hint = el('p', 'sj-hint', talk, D.lines.hint);
    const verse = el('div', 'sj-verse', talk);
    const verseOriginal = el('p', 'sj-original', verse);
    const verseGloss = el('p', 'sj-gloss', verse);

    const interp = el('div', 'sj-interp sj-panel', root);
    interp.hidden = true;
    const interpHead = el('div', 'sj-interp-head', interp);
    el('span', 'sj-tag', interpHead, D.interpretationLabel);
    const interpText = el('p', 'sj-interp-text', interp);
    const interpLayout = el('p', 'sj-interp-layout', interp);
    el('p', 'sj-interp-note', interp, D.interpretationNote);

    const bottom = el('div', 'sj-bottom sj-panel', root);
    const tray = el('div', 'sj-tray', bottom);
    tray.setAttribute('role', 'group');
    tray.setAttribute('aria-label', D.tray);
    const chips = new Map();
    for (const item of D.items) {
      const b = el('button', 'sj-item', tray);
      b.type = 'button';
      b.dataset.item = item.id;
      b.dataset.at = 'tray';
      b.setAttribute('aria-pressed', 'false');
      el('span', 'sj-item-name', b, item.name);
      el('span', 'sj-item-note', b, item.note);
      b.addEventListener('click', () => choose(item.id));
      chips.set(item.id, b);
    }
    const actions = el('div', 'sj-actions', bottom);
    const confirmBtn = el('button', 'sj-confirm', actions, D.buttons.confirm);
    confirmBtn.type = 'button';
    confirmBtn.addEventListener('click', () => confirmRooms());
    const redoBtn = el('button', 'sj-choice', actions, D.buttons.redo);
    redoBtn.type = 'button';
    redoBtn.dataset.choice = 'redo';
    redoBtn.addEventListener('click', () => answerAskBack('redo'));
    const keepBtn = el('button', 'sj-choice', actions, D.buttons.keep);
    keepBtn.type = 'button';
    keepBtn.dataset.choice = 'keep';
    keepBtn.addEventListener('click', () => answerAskBack('keep'));
    const nextBtn = el('button', 'sj-next', actions, D.buttons.next);
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', () => next());
    const finishBtn = el('button', 'sj-finish', actions, D.buttons.finish);
    finishBtn.type = 'button';
    finishBtn.addEventListener('click', () => finish());

    // 칸 셋과 집 밖
    const slots = D.slots.map((label, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sj-slot sj-room';
      b.dataset.slot = String(i);
      el('span', 'sj-slot-label', b, label);
      el('span', 'sj-slot-item', b);
      b.addEventListener('click', () => target(i));
      return b;
    });
    const outsideBtn = el('button', 'sj-slot sj-outside', root);
    outsideBtn.type = 'button';
    outsideBtn.dataset.slot = L.OUTSIDE;
    el('span', 'sj-slot-label', outsideBtn, D.outside);
    el('span', 'sj-slot-item', outsideBtn);
    outsideBtn.addEventListener('click', () => target(L.OUTSIDE));

    // ── 장면(3D 또는 2D) ──
    function make2D() {
      return create2D({ container: viewport, imageUrl: assets.image?.(BOARD) ?? null, reduceMotion: reduce });
    }
    async function makeView() {
      if (ctx.mode === '3d') {
        try {
          const THREE = ctx.three?.THREE ?? await import('three');
          if (closed) return null;
          const { create3D } = await import('./sijo-3d.js');
          if (closed) return null;
          return create3D({ THREE, container: viewport, reduceMotion: reduce });
        } catch {
          viewport.replaceChildren();   // 3D를 만들 수 없으면 2D로 한다
        }
      }
      return make2D();
    }

    // ── 화면 갱신 ──
    function setSay(text) { say.textContent = text; }

    function showVerse(unit) {
      if (unit === null) { verse.hidden = true; verse.removeAttribute('data-unit'); return; }
      const u = song.units[unit];
      verse.hidden = false;
      verse.dataset.unit = String(unit);
      verseOriginal.textContent = u.feet.map((f) => f.original).join(' ');
      verseGloss.textContent = u.gloss;
    }

    function render() {
      root.dataset.phase = phase;
      root.classList.toggle('sj-reduce', reduce());
      const placing = phase === 'place';
      const choosingGangsan = phase === 'gangsan';
      const wide = root.dataset.view === 'wide';
      for (const [id, b] of chips) {
        const at = L.locate(hut, id);
        b.dataset.at = at === null ? 'tray' : String(at);
        b.classList.toggle('is-placed', at !== null);
        b.classList.toggle('is-selected', selected === id);
        b.setAttribute('aria-pressed', selected === id ? 'true' : 'false');
        b.querySelector('.sj-item-note').textContent = at === null ? D.items.find((i) => i.id === id).note : placeName(at);
        b.disabled = !(placing || (choosingGangsan && id === 'gangsan'));
      }
      tray.hidden = !(placing || choosingGangsan);
      hint.hidden = !(placing && !placedOnce);
      confirmBtn.hidden = !placing;
      confirmBtn.disabled = !L.roomsFull(hut);
      redoBtn.hidden = keepBtn.hidden = phase !== 'askback';
      nextBtn.hidden = !(phase === 'reveal' || phase === 'pullback');
      finishBtn.hidden = phase !== 'interpret';
      slots.forEach((b, i) => {
        const id = hut.rooms[i];
        b.querySelector('.sj-slot-item').textContent = id ? itemName(id) : '';
        b.classList.toggle('is-filled', !!id);
        b.setAttribute('aria-label', D.slots[i] + (id ? ' — ' + itemName(id) : ''));
        b.disabled = !(placing || choosingGangsan);
        b.hidden = wide;
        b.classList.toggle('is-target', !!selected);
      });
      const outs = hut.outside.map(itemName).join(' · ');
      outsideBtn.querySelector('.sj-slot-item').textContent = outs;
      outsideBtn.setAttribute('aria-label', D.outside + (outs ? ' — ' + outs : ''));
      outsideBtn.disabled = !(placing || choosingGangsan);
      outsideBtn.hidden = wide;
      outsideBtn.classList.toggle('is-target', !!selected);
      view?.setItems(hut);
      if (phase !== bandPhase) { bandPhase = phase; queueBand(); }
    }

    // 칸이 보여야 할 띠: 위 글 아래 ~ 아래 줄 위, 집 밖 단추 왼쪽.
    // 놓는 도중에 칸이 움직이지 않도록 단계가 바뀔 때와 화면 크기가 바뀔 때만 다시 잰다.
    let bandRaf = 0;
    let bandPhase = null;
    function queueBand() {
      if (bandRaf) return;
      bandRaf = requestAnimationFrame(() => { bandRaf = 0; updateBand(); });
    }
    function updateBand() {
      if (closed || !view) return;
      const R = root.getBoundingClientRect();
      const t = top.getBoundingClientRect();
      const b = bottom.getBoundingClientRect();
      const topEdge = t.bottom - R.top;
      const bottomEdge = bottom.hidden ? R.height : b.top - R.top;
      root.style.setProperty('--sj-band-top', topEdge.toFixed(0) + 'px');
      root.style.setProperty('--sj-band-bottom', (R.height - bottomEdge).toFixed(0) + 'px');
      const o = outsideBtn.getBoundingClientRect();
      const right = outsideBtn.hidden || !o.width ? R.width : o.left - R.left;
      view.setBand({ top: topEdge + 8, bottom: bottomEdge - 8, right });
    }
    const ro = new ResizeObserver(() => queueBand());
    ro.observe(root);
    document.fonts?.ready?.then(() => queueBand());

    // ── 낭송 ──
    function stopRecite() {
      const h = playing;
      playing = null;
      h?.stop?.();
    }
    function recite(unit) {
      stopRecite();
      const engine = ctx.rhythm?.engine;
      if (!engine?.play) return Promise.resolve();
      let grid;
      try { grid = (ctx.rhythm.buildGrid ?? defaultBuildGrid)(song); } catch { return Promise.resolve(); }
      const seg = segmentIndexOf(grid, unit);
      if (seg < 0) return Promise.resolve();
      const h = engine.play(grid, [seg]);
      playing = h;
      const done = Promise.resolve(h.finished).then(() => { if (playing === h) playing = null; }, () => {});
      // 소리 판이 멈춰 있는 등으로 끝 소식이 오지 않아도 방이 막히지 않게, 낭송 길이에 여유를 더한 뒤에는 넘어간다
      const spare = new Promise((r) => { const t = setTimeout(r, grid.segments[seg].duration * 1000 + RECITE_SPARE_MS); timers.add(t); });
      return Promise.race([done, spare]);
    }
    // '다음'은 낭송이 끝나면 열린다. 박자 없는 방식이면 곧바로 열린다.
    function gateNext(done) {
      const token = ++gateToken;
      nextBtn.disabled = !noBeat;
      done.then(() => { if (!closed && token === gateToken) nextBtn.disabled = false; });
    }

    // ── 조작 ──
    function choose(id) {
      if (closed) return;
      if (phase !== 'place' && !(phase === 'gangsan' && id === 'gangsan')) return;
      selected = selected === id ? null : id;
      setSay(selected ? D.lines.chosen : phase === 'gangsan' ? D.lines.askGangsan : D.lines.ask);
      render();
    }

    function target(at) {
      if (closed || !(phase === 'place' || phase === 'gangsan')) return;
      if (!selected) {
        // 고른 것 없이 찬 칸을 누르면 그 물건을 도로 꺼낸다
        const id = at === L.OUTSIDE ? null : hut.rooms[at];
        if (id && phase === 'place') { L.unplace(hut, id); render(); }
        return;
      }
      const id = selected;
      if (L.locate(hut, id) === at && phase === 'place') {
        L.unplace(hut, id);
        selected = null;
        setSay(D.lines.ask);
        render();
        return;
      }
      const r = L.place(hut, id, at);
      if (!r.ok) {
        if (r.reason === 'gangsan-no-room') {
          setSay(D.lines.gangsanNoRoom);
          const b = slots[at];
          b.classList.remove('is-refused');
          void b.offsetWidth;
          b.classList.add('is-refused');
        }
        selected = null;
        render();
        return;
      }
      selected = null;
      placedOnce = true;
      ctx.rhythm?.engine?.sfx?.('place');
      if (id === 'gangsan' && at === L.OUTSIDE) {
        if (phase === 'gangsan') { render(); pullBack(); return; }
        setSay(L.roomsFull(hut) ? D.lines.gangsanOutsideReady : D.lines.gangsanWaiting);
      } else setSay(D.lines.ask);
      render();
    }

    function confirmRooms() {
      if (closed || phase !== 'place' || !L.roomsFull(hut)) return;
      selected = null;
      const worldly = L.worldlyIn(hut.rooms);
      if (worldly.length) {
        phase = 'askback';
        setSay(worldly.length === 2 ? D.lines.askBack.both : D.lines.askBack[worldly[0]]);
        render();
        return;
      }
      replyPrefix = D.lines.accepted;
      toReveal();
    }

    function answerAskBack(choice) {
      if (closed || phase !== 'askback') return;
      if (choice === 'redo') {
        phase = 'place';
        setSay(D.lines.ask);
        render();
        return;
      }
      replyPrefix = D.lines.keepReply;
      toReveal();
    }

    function toReveal() {
      hut.confirmed = true;
      phase = 'reveal';
      setSay(replyPrefix + ' ' + D.lines.reveal);
      showVerse(1);
      render();
      gateNext(recite(1));
    }

    function next() {
      if (closed || nextBtn.disabled) return;
      if (phase === 'reveal') {
        if (L.locate(hut, 'gangsan') === L.OUTSIDE) { pullBack(); return; }
        phase = 'gangsan';
        stopRecite();
        setSay(D.lines.askGangsan);
        showVerse(null);
        render();
      } else if (phase === 'pullback') {
        stopRecite();
        phase = 'interpret';
        setSay(D.lines.interpretLead);
        showVerse(null);
        const rec = L.buildRecord(hut, D);
        interpText.textContent = rec.interpretationText;
        interpLayout.textContent = D.summaryRooms + ': ' + rec.rooms.map(itemName).join(' · ') + '  /  ' + D.outside + ': ' + rec.outside.map(itemName).join(' · ');
        interp.hidden = false;
        render();
      }
    }

    function pullBack() {
      phase = 'pullback';
      selected = null;
      root.dataset.view = 'wide';
      setSay(D.lines.pullback);
      showVerse(2);
      render();
      gateNext(recite(2));
      view?.pullBack(() => { if (!closed) root.dataset.settled = 'true'; });
    }

    function finish() {
      if (closed || phase !== 'interpret') return;
      const record = L.buildRecord(hut, D);
      close();
      resolve({ completed: true, record });
    }

    // ── 사건 ──
    offs.push(busOn('rhythm:no-beat', (d) => {
      noBeat = !!d?.value;
      if (noBeat && !nextBtn.hidden) nextBtn.disabled = false;
    }));
    offs.push(busOn('orientation:pause', () => view?.setPaused(true)));
    offs.push(busOn('orientation:resume', () => view?.setPaused(false)));

    // ── 치우기와 중단 ──
    function close() {
      if (closed) return;
      closed = true;
      signal?.removeEventListener('abort', onAbort);
      for (const off of offs) off?.();
      ro.disconnect();
      if (bandRaf) cancelAnimationFrame(bandRaf);
      stopRecite();
      for (const t of timers) clearTimeout(t);
      view?.dispose();
      view = null;
      root.remove();
    }
    function onAbort() {
      close();
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    // ── 시작 ──
    setSay(D.lines.ask);
    showVerse(0);
    render();
    makeView().then((v) => {
      if (closed) { v?.dispose(); return; }
      view = v;
      root.dataset.mode = v.kind;
      if (v.kind === '3d') for (const b of slots) slotLayer.appendChild(b);
      v.mountSlots(slots);
      render();
      queueBand();
      recite(0);
    }, (e) => {
      close();
      reject(e);
    });
  });
}
