// 가사관 작품 방 「상춘곡」(spec 9, js/data/README.md 7.3).
// 수간모옥에서 출발해 화자의 발걸음을 작품 차례대로 따라 걷는다: 수간모옥 → 정자 → 시냇가 → 산봉우리 → 마무리.
// 걷기는 가사관의 걷기와 같다: '한 걸음'에 한 행(네 박)을 낭송하며 걷고, 박자 없는 방식이면 낭송 없이 바로 걷는다.
// 머무는 곳마다 봄 경치 시어를 모으고(하나 이상), 공명·부귀를 떠나보낸 뒤 안빈낙도로 마무리한다.
// 교과서 밖 원문 행(beyondTextbook)에는 '교과서 밖 원문' 표시와 출처(sourceNote)를 함께 보인다.
// 기록: { room: 'gasa', words: [모은 시어 …] }. 중단되면 AbortError로 끝나고 다음에 처음부터 한다(spec 20).
import { on as busOn } from '../core/events.js';
import * as R from '../core/rhythm.js';
import { createAssets } from '../world/assets.js';
import { roomGasa } from '../data/rooms-gasa.js';
import { createRoomState, routeProgress, rowOriginal } from './gasa-model.js';
import { createScene2D } from './gasa-2d.js';

const T = roomGasa.text;
const NO_BEAT_WALK_SEC = 0.6;   // 박자 없는 방식에서 걷는 사람이 옮겨 가는 시간(기다리지 않는다)
const LETGO_REMOVE_MS = 700;    // 떠나보낸 말이 사라지기까지
const PLAY_GRACE_MS = 5000;     // 낭송이 제 길이보다 이만큼 더 걸리면(소리 판이 멈춰 버린 기기 등) 낭송을 접고 걷기를 마친다
const WATCH_MS = 250;

function ensureStyle() {
  const href = new URL('../../css/room-gasa.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.room = 'gasa';
  document.head.append(link);
}

function el(tag, className, parent, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

function button(className, text, parent) {
  const b = el('button', className, parent, text);
  b.type = 'button';
  return b;
}

const abortError = (signal) => {
  const r = signal?.reason;
  return r instanceof Error && r.name === 'AbortError' ? r : new DOMException('작품 방을 나갔습니다', 'AbortError');
};

export function start(ctx) {
  const { song, container, signal } = ctx;
  if (signal?.aborted) return Promise.reject(abortError(signal));
  if (!song || song.id !== roomGasa.songId) return Promise.reject(new Error('「상춘곡」 노래 데이터가 아닙니다: ' + song?.id));
  ensureStyle();

  return new Promise((resolve, reject) => {
    const state = createRoomState(roomGasa, song);
    const stations = roomGasa.stations;
    const rhythm = ctx.rhythm ?? null;
    const engine = rhythm?.engine ?? (typeof rhythm?.play === 'function' ? rhythm : null);
    let noBeat = ctx.noBeat ?? engine?.noBeat?.value ?? false;
    let reduce = typeof ctx.reduceMotion === 'function' ? null : !!ctx.reduceMotion;
    const reduceMotion = () => (reduce ?? !!ctx.reduceMotion?.()) || !!document.getElementById('app')?.classList.contains('reduce-motion');
    let grid = null;
    let playing = null;
    let busy = false;
    let closed = false;
    let scene = null;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

    // ── 틀 ──
    const root = el('div', 'rg-room');
    root.dataset.mode = ctx.mode === '3d' ? '3d' : '2d';
    root.dataset.phase = 'intro';
    root.dataset.unit = '-1';
    root.dataset.station = stations[0].id;
    root.dataset.busy = '0';
    root.dataset.walkerS = '0';
    root.dataset.drawCalls = '0';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', T.title);
    const sceneEl = el('div', 'rg-scene', root);
    // 부르는 쪽의 3D 장면을 빌리면 방 바탕과 장면 칸을 투명하게 두어 그 그림판이 보이게 한다(README '연결 결정(F3)')
    if (ctx.three && ctx.mode === '3d') { root.classList.add('is-host-3d'); sceneEl.classList.add('is-host-3d'); }

    const strip = el('ol', 'rg-stations', sceneEl);
    strip.setAttribute('aria-label', T.stationsLabel);
    const stripItems = stations.map((s) => {
      const li = el('li', '', strip);
      li.dataset.station = s.id;
      el('span', 'rg-st-mark', li).setAttribute('aria-hidden', 'true');
      el('span', 'rg-st-name', li, s.name);
      return li;
    });
    const chipsEl = el('div', 'rg-chips', sceneEl);
    chipsEl.setAttribute('role', 'group');

    const panel = el('div', 'rg-panel', root);
    const controls = el('div', 'rg-controls', panel);
    const stepBtn = button('rg-step', T.step, controls);
    stepBtn.disabled = true;
    const pouch = el('div', 'rg-pouch', controls);
    el('span', 'rg-pouch-label', pouch, T.pouch + ' ');
    const pouchCount = el('span', 'rg-pouch-count', pouch, T.pouchCount(0));
    const pouchWords = el('span', 'rg-pouch-words', pouch);
    const textCol = el('div', 'rg-text', panel);
    const hint = el('p', 'rg-hint', textCol);
    hint.setAttribute('aria-live', 'polite');
    const row = el('div', 'rg-row', textCol);
    row.hidden = true;
    const rowHead = el('div', 'rg-row-head', row);
    const rowNo = el('span', 'rg-row-no', rowHead);
    const rowPlace = el('span', 'rg-row-place', rowHead);
    const original = el('p', 'rg-original', row);
    original.lang = 'ko';
    const gloss = el('p', 'rg-gloss', row);
    const source = el('p', 'rg-source', row);

    // 시작 안내
    const intro = el('div', 'rg-cover rg-intro', root);
    const introCard = el('div', 'rg-card', intro);
    const introBody = el('div', 'rg-card-body', introCard);
    el('h2', '', introBody, T.title);
    el('p', '', introBody, T.intro);
    el('p', 'rg-intro-beyond', introBody, T.introBeyond);
    const beginBtn = button('rg-begin', T.begin, introCard);

    container.append(root);

    // ── 소리·설정 사건 ──
    const offs = [
      busOn('rhythm:no-beat', (d) => { noBeat = !!d?.value; if (!busy && state.phase === 'walk') setHint(defaultHint()); }),
      busOn('settings:reduce-motion', (d) => { reduce = !!d?.value; root.classList.toggle('rg-reduce', reduceMotion()); }),
      busOn('orientation:pause', () => { scene?.setPaused(true); root.classList.add('is-paused'); }),
      busOn('orientation:resume', () => { scene?.setPaused(false); root.classList.remove('is-paused'); }),
    ];
    root.classList.toggle('rg-reduce', reduceMotion());

    // ── 정리 ──
    function cleanup() {
      if (closed) return;
      closed = true;
      signal?.removeEventListener('abort', onAbort);
      for (const off of offs) off?.();
      for (const id of timers) { clearTimeout(id); clearInterval(id); }
      timers.clear();
      try { playing?.stop(); } catch { /* 이미 멈춤 */ }
      playing = null;
      try { scene?.dispose(); } catch { /* 이미 치움 */ }
      root.remove();
    }
    function onAbort() {
      cleanup();
      reject(abortError(signal));
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    // ── 장면(3D가 안 되면 2D) ──
    const manifest = ctx.manifest ?? null;
    const assets2d = ctx.assets ?? (manifest ? createAssets(manifest) : null);
    const make2D = () => createScene2D({ host: sceneEl, assets: assets2d, appearance: ctx.appearance, stations, reduceMotion });
    if (ctx.mode === '3d') {
      import('./gasa-3d.js')
        .then((m) => m.createScene3D({
          host: sceneEl,
          three: ctx.three ?? null,
          assets: ctx.assets ?? null,
          manifest,
          appearance: ctx.appearance,
          stations,
          reduceMotion,
          onCalls: (n) => { root.dataset.drawCalls = String(n); },
        }))
        .catch(() => { root.dataset.mode = '2d'; root.classList.remove('is-host-3d'); sceneEl.classList.remove('is-host-3d'); return make2D(); })
        .then((sc) => {
          if (closed) { sc.dispose(); return; }
          scene = sc;
          syncScene(0);
        });
    } else {
      scene = make2D();
    }

    function syncScene(sec) {
      if (!scene) return;
      const s = routeProgress(roomGasa, state.unit);
      root.dataset.walkerS = String(s);
      scene.walkTo(s, sec);
      scene.setStation(stations[state.stationIndex()].id);
    }

    // ── 화면 갱신 ──
    function setHint(text) { hint.textContent = text; }
    const defaultHint = () => (noBeat ? T.stepHintNoBeat : T.stepHint);

    function setPhase(p) { root.dataset.phase = p; }

    function updateStrip() {
      const k = state.unit < 0 ? 0 : state.stationIndex();
      stripItems.forEach((li, i) => {
        li.classList.toggle('is-here', i === k);
        li.classList.toggle('is-past', i < k);
        li.querySelector('.rg-st-mark').textContent = i < k ? '◆' : i === k ? '●' : '○';
        if (i === k) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
      root.dataset.station = stations[k].id;
    }

    function updatePouch() {
      const words = state.collectedTexts();
      pouchCount.textContent = T.pouchCount(words.length);
      pouchWords.textContent = words.join(' · ');
    }

    // 행 u를 보인다. word가 있으면 원문 속 그 말을 표시한다.
    function showRow(u, word = null) {
      const unit = song.units[u];
      const text = rowOriginal(unit);
      row.hidden = false;
      rowNo.textContent = T.rowLabel(u + 1);
      rowPlace.textContent = '· ' + stations.find((s) => u >= s.from && u <= s.to).name;
      rowHead.querySelector('.rg-badge')?.remove();
      if (unit.beyondTextbook === true) {
        const badge = el('span', 'rg-badge', rowHead, T.beyondLabel);
        badge.title = unit.sourceNote;
        source.textContent = T.sourceLabel + ': ' + unit.sourceNote;
        source.hidden = false;
        row.classList.add('is-beyond');
      } else {
        source.textContent = '';
        source.hidden = true;
        row.classList.remove('is-beyond');
      }
      original.replaceChildren();
      const at = word ? text.indexOf(word) : -1;
      if (at >= 0) {
        original.append(text.slice(0, at));
        el('mark', '', original, word);
        original.append(text.slice(at + word.length));
      } else original.textContent = text;
      gloss.textContent = unit.gloss ?? '';
    }

    function focusLater(target) {
      later(() => { if (!closed && target.isConnected && !target.disabled) target.focus({ preventScroll: true }); }, 0);
    }

    function refreshStep() {
      stepBtn.disabled = busy || !state.canStep();
      stepBtn.textContent = busy && !noBeat ? T.walking : T.step;
    }

    // ── 시어 모으기 ──
    function showCollect() {
      const st = state.stationInfo();
      setPhase('collect');
      chipsEl.setAttribute('aria-label', st.collect);
      chipsEl.replaceChildren();
      for (const w of st.words) {
        const b = button('rg-chip', w.text, chipsEl);
        b.dataset.wordId = w.id;
        b.lang = 'ko';
        b.addEventListener('click', () => {
          if (closed || !state.collect(w.id)) return;
          b.classList.add('is-taken');
          b.disabled = true;
          b.setAttribute('aria-pressed', 'true');
          showRow(w.unit, w.text);
          updatePouch();
          setHint(T.collectMore);
          refreshStep();
          const next = [...chipsEl.querySelectorAll('.rg-chip:not(.is-taken)')][0];
          focusLater(next ?? stepBtn);
        });
      }
      setHint(st.collect + ' ' + T.collectNeed);
      refreshStep();
      focusLater(chipsEl.querySelector('.rg-chip'));
    }

    // ── 공명·부귀 떠나보내기 ──
    function showLetGo() {
      setPhase('letgo');
      chipsEl.setAttribute('aria-label', roomGasa.letGo.prompt);
      chipsEl.replaceChildren();
      for (const w of roomGasa.letGo.words) {
        const b = button('rg-chip rg-letgo', w.text, chipsEl);
        b.dataset.wordId = w.id;
        b.addEventListener('click', () => {
          if (closed || !state.letGo(w.id)) return;
          b.classList.add('is-gone');
          b.disabled = true;
          later(() => b.remove(), reduceMotion() ? 0 : LETGO_REMOVE_MS);
          if (state.letGoLeft().length === 0) {
            setHint(roomGasa.letGo.done);
            setPhase('walk');
            refreshStep();
            focusLater(stepBtn);
          } else focusLater(chipsEl.querySelector('.rg-letgo:not(.is-gone)'));
        });
      }
      setHint(roomGasa.letGo.prompt);
      refreshStep();
      focusLater(chipsEl.querySelector('.rg-letgo'));
    }

    // ── 마무리 ──
    function showFinale() {
      setPhase('finale');
      chipsEl.replaceChildren();
      scene?.finale();
      const f = roomGasa.finale;
      const cover = el('div', 'rg-cover rg-finale', root);
      const card = el('div', 'rg-card', cover);
      const body = el('div', 'rg-card-body', card);
      el('h2', '', body, f.title);
      el('p', '', body, f.body);
      const keep = el('ul', 'rg-keep', body);
      for (const k of f.keep) {
        const li = el('li', '', keep);
        el('strong', '', li, k.text);
        li.append(' — ' + k.note);
      }
      el('h3', '', body, f.wordsTitle);
      const list = el('div', 'rg-finale-words', body);
      for (const t of state.collectedTexts()) el('span', 'rg-finale-word', list, t);
      const fin = button('rg-finish', f.finish, card);
      fin.addEventListener('click', () => {
        if (closed) return;
        const record = state.finish();
        if (!record) return;
        cleanup();
        resolve({ completed: true, record });
      }, { once: true });
      focusLater(fin);
    }

    // ── 걷기 ──
    async function onStep() {
      if (closed || busy || !state.canStep()) return;
      const leaving = state.phase;
      const r = state.step();
      if (!r) return;
      busy = true;
      root.dataset.busy = '1';
      if (leaving === 'collect' || leaving === 'letgo') chipsEl.replaceChildren();
      setPhase('walk');
      root.dataset.unit = String(r.unit);
      refreshStep();
      showRow(r.unit);
      updateStrip();
      const st = stations[state.stationIndex()];
      if (r.enteredBeyond) setHint(T.beyondStart);
      else if (r.enteredStation !== null) setHint(st.arrive);
      else setHint(defaultHint());

      // 박자 방식이면 그 행을 낭송하는 동안(네 박) 걷는다
      let walked = false;
      if (!noBeat && engine?.unlocked) {
        try {
          grid ??= (rhythm?.buildGrid ?? R.buildGrid)(song);
          const segs = grid.segments.filter((s) => s.unit === r.unit).map((s) => s.index);
          const dur = segs.reduce((a, i) => a + grid.segments[i].duration, 0);
          syncScene(dur);
          walked = true;
          playing = engine.play(grid, segs);
          // 지켜보기: 멈춘 동안(화면 회전 등)은 세지 않는다
          const handle = playing;
          let waited = 0;
          const watch = setInterval(() => {
            if (!engine.paused) waited += WATCH_MS;
            if (waited > dur * 1000 + PLAY_GRACE_MS) handle.stop();
          }, WATCH_MS);
          timers.add(watch);
          try { await handle.finished; } finally { clearInterval(watch); timers.delete(watch); }
        } catch { /* 소리가 없어도 걷는다 */ }
        playing = null;
      }
      if (closed) return;
      if (!walked) syncScene(NO_BEAT_WALK_SEC);
      busy = false;
      root.dataset.busy = '0';
      if (state.phase === 'collect') showCollect();
      else if (state.phase === 'letgo') showLetGo();
      else if (state.phase === 'finale') { setHint(T.lastRow); refreshStep(); showFinale(); }
      else { setPhase('walk'); refreshStep(); focusLater(stepBtn); }
    }

    stepBtn.addEventListener('click', onStep);
    beginBtn.addEventListener('click', () => {
      if (closed || state.phase !== 'intro') return;
      engine?.unlock?.();
      state.begin();
      intro.remove();
      setPhase('walk');
      updateStrip();
      setHint(stations[0].arrive + ' ' + defaultHint());
      refreshStep();
      focusLater(stepBtn);
    }, { once: true });
    updateStrip();
    focusLater(beginBtn);
  });
}
