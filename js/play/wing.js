// 관 한 판(spec 2·3.2·4.3·5·6·8·12·20). 관 하나에서 학생이 하는 일을 처음부터 끝까지 잇는다.
//   들어가기 → 떠도는 노래 잡기 → 재기(js/measure) → 칸·탑·바구니에 꽂기(바구니는 갈 관도 고른다)
//   → 다 차면 판정(진행 엔진) → 제본·금박·먹안개 / 틀린 노래만 삐져나와 손으로 → 가객과 기념품
//   → 작품 방(js/registry.js의 rooms, 세계는 방 무대가 된다 — README '연결 결정(F3)') → 판의 끝: 단청, 판 카드, 다음 관 문틈 소리, 덤 칸
// 마친 관에 다시 들어오면 덤 칸과 다시 듣기만 한다. 판정 기록은 바뀌지 않는다.
//
// 움직임은 세계 바탕의 약속을 따른다: 누른 곳으로 걸어가 멈추면 오른쪽 아래 상황 버튼("잡기", "꽂기" …)이 뜬다.
// 떠도는 노래는 관 모형의 자리(floatingSpots)에 이 화면이 직접 그린다(누를 자리가 아니므로 세계 바탕은 그리지 않는다).
// 디오라마 사건(diorama:*)은 이 화면이 낸다(진행 엔진은 내지 않는다). 관 모형은 판 상태를 모르므로 들어올 때 지금 상태를 다시 낸다.
import * as bus from '../core/events.js';
import { TUNABLES } from '../core/progress.js';
import { buildWingCard } from '../core/cards.js';
import { buildGrid, createTapSession } from '../core/rhythm.js';
import { SONG_TABLE } from '../data/song-table.js';
import { PLAY_WING_IDS, WINGS, wingById } from '../data/wings.js';
import { openMeasure } from '../measure/measure.js';
import { showCard } from '../result/card-view.js';
import { el, button, openPanel, quoted } from './dom.js';
import { playCeremony } from './ceremony.js';
import { renderListen } from './screens.js';
import { L } from './labels.js';

// 조정할 수 있는 값
export const PLAY_TUNING = Object.freeze({
  popOutMs: 2400,      // 삐져나온 모양을 보인 뒤 그 자리를 빈 책등으로 되돌리기까지
  sentMs: 1200,        // 바구니에서 보낸 노래가 떠나기까지
  leakMs: 8000,        // 문틈으로 다음 관 배경음이 새어 나오는 시간
  toastMs: 8000,       // 알림 한 줄이 머무는 시간
  toastMax: 4,
});

const AREA_OF_ANCHOR = { slots: 'shelf', bonus: 'bonus', basket: 'basket' };

// session: js/play/session.js가 넘기는 손잡이. 돌려주는 것: { wingId, onArrive(a), dispose() }
export function createWingPlay(session, wingId) {
  const { world, audio, progress: P, layer, hud } = session;
  const p = P.progress;
  const t = (session.table ?? SONG_TABLE).wings[wingId];
  const wing = wingById(wingId);
  const strayIds = t.stray.map((s) => s.songId);
  const ws = () => p.wings[wingId];
  const isDone = () => ws().state === 'done';
  const song = (id) => session.songById(id);
  const title = (id) => song(id)?.title ?? id;
  const ac = new AbortController();
  const timers = new Set();
  let disposed = false;
  let busy = false;
  let pending = null;
  let raf = 0;
  let dialog = null;
  let leakEl = null;
  let chain = Promise.resolve();

  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms);
    timers.add(id);
  };
  const enqueue = (fn) => { chain = chain.then(() => (disposed ? null : fn())).catch((e) => console.error('[play]', e)); return chain; };

  // ───────── 노래 목록 ─────────
  function placedSet() {
    const out = new Set();
    for (const area of ['shelf', 'basket', 'bonus']) for (const s of ws().placements[area]) if (s) out.add(s.songId);
    return out;
  }
  const poolOf = () => (isDone() ? t.bonus : [...t.shelf, ...strayIds]);
  const prewaitHere = () => (isDone() ? [] : p.prewaiting[wingId] ?? []);

  // 입구에서 미리 잰 채 기다리는 노래(아직 잡지 않은 것)
  function waitingSongs() {
    const placed = placedSet();
    return prewaitHere().filter((id) => !ws().measured.includes(id) && !placed.has(id) && t.shelf.includes(id));
  }
  // 떠도는 노래: 판 중이면 칸 노래와 길 잃은 노래, 마친 관이면 덤 노래. 잰 노래·꽂힌 노래·입구 노래는 빼고.
  function floatingSongs() {
    if (isDone() && ws().bonusDone) return [];
    const placed = placedSet();
    const pre = new Set(prewaitHere());
    return poolOf().filter((id) => !ws().measured.includes(id) && !placed.has(id) && !pre.has(id));
  }
  // 손에 든 노래: 잰 노래 가운데 아직 꽂지 않은 것
  function handSongs() {
    const placed = placedSet();
    const pool = poolOf();
    return ws().measured.filter((id) => pool.includes(id) && !placed.has(id));
  }

  // 자리를 바꿀 수 있는지(판정을 지난 자리, 열리지 않은 덤은 못 바꾼다)
  function areaLocked(area) {
    if (area === 'shelf') return ws().shelfBound || isDone();
    if (area === 'basket') return ws().basketDone || isDone();
    if (area === 'bonus') return !isDone() || ws().bonusDone;
    return true;
  }
  const isFull = (area) => ws().placements[area].every(Boolean);

  // ───────── 디오라마 사건 ─────────
  function emitSet(area, index, songId, to) {
    const d = { area, index, songId: songId ?? null };
    if (area === 'basket' && songId && to) d.to = to;
    bus.emit('diorama:slot-set', d);
  }

  // 들어올 때 지금 상태를 다시 낸다(관 모형은 판 상태를 모른다)
  function replayVisuals() {
    const pl = ws().placements;
    for (const area of ['shelf', 'bonus', 'basket']) {
      pl[area].forEach((s, i) => {
        if (!s || (area === 'basket' && s.fixed)) return;   // 보낸 노래는 이미 떠났다
        emitSet(area, i, s.songId, s.to);
      });
    }
    (p.returned[wingId] ?? []).forEach((id, i) => emitSet('returned', i, id));
    if (p.boss?.state === 'done' && wingId === 'sijo') emitSet('mentor', 0, SONG_TABLE.boss.stage3SongId);
    if (ws().shelfBound) {
      bus.emit('diorama:shelf-bound', { area: 'shelf', songIds: pl.shelf.map((s) => s.songId) });
      bus.emit('diorama:fog-recede', {});
    }
    if (ws().bonusDone) bus.emit('diorama:shelf-bound', { area: 'bonus', songIds: pl.bonus.map((s) => s.songId) });
  }

  // ───────── 화면 뼈대 ─────────
  const floatBox = el('div', 'play-floating');
  const handBox = el('section', 'play-handbox');
  handBox.setAttribute('aria-label', L.hand);
  const strip = el('nav', 'play-strip play-scroll');
  strip.setAttribute('aria-label', '서가');
  const toasts = el('div', 'play-toasts');
  toasts.setAttribute('aria-live', 'polite');
  layer.replaceChildren(floatBox, handBox, strip, toasts);

  const listenBtn = button('play-btn', L.listen);
  listenBtn.dataset.open = 'listen';
  const leaveBtn = button('play-btn play-btn-leave', L.leave);
  hud.extras.replaceChildren(listenBtn, leaveBtn);
  listenBtn.addEventListener('click', () => openListen());
  leaveBtn.addEventListener('click', () => session.enterCorridor());

  function toast(text) {
    const n = el('p', 'play-toast', text);
    toasts.append(n);
    while (toasts.children.length > PLAY_TUNING.toastMax) toasts.firstChild.remove();
    later(() => n.remove(), PLAY_TUNING.toastMs);
  }

  // ───────── 그리기 ─────────
  function spineLabel(area, i) {
    if (area === 'shelf') return t.shelfFloors ? L.floor(t.shelfFloors[i]) : L.slot(i);
    if (area === 'bonus') return L.bonus(i);
    return L.basketPlace(i);
  }

  function spine(area, i) {
    const s = ws().placements[area][i];
    const b = button('play-spine');
    b.dataset.area = area;
    b.dataset.index = String(i);
    const bound = (area === 'shelf' && ws().shelfBound) || (area === 'bonus' && ws().bonusDone);
    if (!s) {
      b.classList.add('is-empty');
      b.setAttribute('aria-label', spineLabel(area, i) + ', ' + L.spineEmpty);
    } else {
      b.dataset.song = s.songId;
      b.classList.toggle('is-fixed', !!s.fixed);
      b.classList.toggle('is-bound', bound);
      b.append(el('span', 'play-spine-title', title(s.songId)));
      if (area === 'basket' && s.to) b.append(el('span', 'play-tag', wingById(s.to)?.name ?? ''));
      b.setAttribute('aria-label', spineLabel(area, i) + ', ' + quoted(title(s.songId)) + (area === 'basket' && s.to ? ' → ' + wingById(s.to)?.name : ''));
    }
    b.addEventListener('click', () => goToAnchor(area === 'shelf' ? 'slots' : area, area === 'basket' ? undefined : i));
    return b;
  }

  function group(name, nodes) {
    const g = el('div', 'play-strip-group');
    g.append(el('span', 'play-strip-name', name), ...nodes);
    return g;
  }

  function gotoButton(anchor, text) {
    const b = button('play-goto', text);
    b.dataset.anchor = anchor;
    b.addEventListener('click', () => goToAnchor(anchor));
    return b;
  }

  function render() {
    if (disposed) return;
    session.root.dataset.wingState = ws().state;
    // 손에 든 노래
    const hand = handSongs();
    handBox.replaceChildren(el('h2', 'play-hand-title', L.hand));
    if (!hand.length) handBox.append(el('p', 'play-hand-empty', L.handEmpty));
    else {
      const ul = el('ul', 'play-hand-list');
      for (const id of hand) {
        const li = el('li', 'play-hand-song', title(id));
        li.dataset.song = id;
        ul.append(li);
      }
      handBox.append(ul);
    }
    // 서가 띠
    const groups = [group(t.shelfFloors ? '탑' : '칸', [0, 1, 2].map((i) => spine('shelf', i)))];
    if (!ws().basketDone) groups.push(group(L.basket, [0, 1].map((i) => spine('basket', i))));
    if (isDone()) groups.push(group('덤', [0, 1, 2].map((i) => spine('bonus', i))));
    const doors = [];
    if (ws().shelfBound && !ws().roomDone) doors.push(gotoButton('roomDoor', L.roomDoor));
    if ((p.returned[wingId] ?? []).length) doors.push(gotoButton('returnedShelf', L.returned));
    if (waitingSongs().length) doors.push(gotoButton('entrance', L.entrance));
    const next = nextWingId();
    if (isDone() && next && P.canEnter(next)) doors.push(gotoButton('nextDoor', L.nextDoor));
    if (doors.length) groups.push(group('문', doors));
    strip.replaceChildren(...groups);
    // 떠도는 노래와 입구에서 기다리는 노래
    const items = [
      ...floatingSongs().map((id, i) => ({ id, i, waiting: false })),
      ...waitingSongs().map((id, i) => ({ id, i, waiting: true })),
    ];
    floatBox.replaceChildren(...items.map(({ id, i, waiting }) => {
      const b = button('play-song' + (waiting ? ' is-premeasured' : ''), null, waiting ? L.waitingLabel(title(id)) : L.floatingLabel(title(id)));
      b.dataset.song = id;
      b.dataset.spot = String(i);
      if (waiting) b.append(el('span', 'play-pencil', '✎'));
      b.append(el('span', 'play-song-title', title(id)));
      b.addEventListener('click', () => goToSong(id, waiting, i));
      return b;
    }));
    positionSongs();
  }

  // ───────── 자리와 걸어가기 ─────────
  const is3D = () => world.getMode() === '3d';

  // 떠도는 노래 자리 i의 세계 점(3D: 세계 좌표 {x,y,z}, 2D: 그림 판 백분율 {x,y})
  function floatingPoint(i) {
    const spots = world.getWingHandle()?.floatingSpots ?? [];
    if (!spots.length) return null;
    const s = spots[i % spots.length];
    const lap = Math.floor(i / spots.length);
    if (is3D()) {
      const three = world.getThree();
      if (!three?.root) return null;
      const v = three.root.localToWorld(new three.THREE.Vector3(s.x + lap * 0.8, s.y, s.z));
      return { x: v.x, y: v.y, z: v.z };
    }
    return { x: s.x + lap * 5, y: s.y };
  }

  function anchorPoint(key, index) {
    const a = world.getAnchors()?.[key];
    if (!a) return null;
    const v = Array.isArray(a) ? a[index ?? 0] : a;
    return v && typeof v.x === 'number' ? v : null;
  }

  function waitingPoint(i) {
    const e = anchorPoint('entrance');
    if (!e) return null;
    return is3D() ? { x: e.x + i * 0.9, y: (e.y ?? 0) + 1.2, z: e.z } : { x: e.x + i * 6, y: e.y };
  }

  function positionSongs() {
    const rr = session.root.getBoundingClientRect();
    const placed = [];   // 이미 놓은 노래 자리(가운데 좌표와 크기)
    for (const b of floatBox.children) {
      const i = Number(b.dataset.spot);
      const pt = b.classList.contains('is-premeasured') ? waitingPoint(i) : floatingPoint(i);
      const sp = pt ? world.toScreen(pt) : null;
      if (!sp) { b.style.left = (12 + i * 12) + '%'; b.style.top = '45%'; continue; }
      let x = sp.x - rr.left;
      let y = sp.y - rr.top;
      if (b.classList.contains('is-premeasured') && !is3D()) y -= 56;   // 입구 자리 표시와 겹치지 않게 위로
      const w = b.offsetWidth;
      const h = b.offsetHeight;
      // 가운데 좌표를 쓰므로 노래 폭의 반만큼 화면 안쪽에 둔다(가장자리에서 잘리지 않게)
      const clampX = (v) => Math.min(rr.width - Math.max(40, w / 2 + 4), Math.max(Math.max(40, w / 2 + 4), v));
      const clampY = (v) => Math.min(rr.height - 96, Math.max(90, v));
      x = clampX(x);
      y = clampY(y);
      // 다른 노래와 겹치면 옆(자리가 없으면 아래)으로 비킨다. 작은 화면 3D에서는 입구에 기다리는 노래 둘이 한 자리에
      // 포개져 아래 노래를 누를 수 없었다.
      for (let k = 0; k <= placed.length; k++) {
        const hit = placed.find((q) => Math.abs(q.x - x) < (q.w + w) / 2 + 4 && Math.abs(q.y - y) < (q.h + h) / 2 + 4);
        if (!hit) break;
        const right = hit.x + (hit.w + w) / 2 + 6;
        if (right <= rr.width - Math.max(40, w / 2 + 4)) x = right;
        else y = clampY(hit.y + (hit.h + h) / 2 + 6);
      }
      placed.push({ x, y, w, h });
      b.style.left = x + 'px';
      b.style.top = y + 'px';
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!session.root.classList.contains('is-measuring')) positionSongs();
  }

  function goTo(point, intent) {
    world.setContext(null);
    if (!point) { act(intent); return; }   // 자리가 없으면 걷지 않고 바로
    const walk = is3D() ? { x: point.x, z: point.z } : { x: point.x, y: point.y };
    const target = world.moveTo(walk);
    pending = target ? { target, intent } : null;
    if (!target) act(intent);
  }

  function goToSong(id, waiting, i) {
    if (busy) return;
    goTo(waiting ? anchorPoint('entrance') : floatingPoint(i), { type: 'catch', id });
  }

  function goToAnchor(key, index) {
    if (busy) return;
    goTo(anchorPoint(key, index), { type: 'anchor', anchor: index === undefined ? { key } : { key, index } });
  }

  const near = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 0.2 && Math.abs((a.z ?? a.y) - (b.z ?? b.y)) < 0.2;

  function onArrive(a) {
    if (disposed) return;
    let intent = null;
    if (pending && near(a?.position, pending.target)) intent = pending.intent;
    pending = null;
    if (!intent && a?.anchor) intent = { type: 'anchor', anchor: a.anchor };
    offer(intent);
  }

  // 도착한 곳에 맞는 상황 버튼을 띄운다
  function offer(intent) {
    if (busy || !intent) { world.setContext(null); return; }
    const c = contextFor(intent);
    if (c) world.setContext(c.label, () => { world.setContext(null); c.run(); });
    else world.setContext(null);
  }

  function act(intent) {
    const c = intent && contextFor(intent);
    c?.run();
  }

  function contextFor(intent) {
    if (intent.type === 'catch') {
      const id = intent.id;
      if (!floatingSongs().includes(id) && !waitingSongs().includes(id)) return null;
      return { label: L.catch, run: () => catchSong(id) };
    }
    const { key, index } = intent.anchor ?? {};
    const area = AREA_OF_ANCHOR[key];
    if (area) {
      if (area === 'bonus' && !isDone()) return null;
      const slot = area === 'basket' ? null : ws().placements[area][index ?? 0];
      const removable = area === 'basket' ? ws().placements.basket.some((s) => s && !s.fixed) : !!slot && !slot.fixed;
      const actionable = !areaLocked(area) && (handSongs().length > 0 || removable);
      return { label: actionable ? L.place : L.look, run: () => (area === 'basket' ? openBasketDialog() : openSlotDialog(area, index ?? 0)) };
    }
    if (key === 'roomDoor') return ws().shelfBound && !ws().roomDone ? { label: L.room, run: () => openRoom() } : null;
    if (key === 'nextDoor') {
      const next = nextWingId();
      return isDone() && next && P.canEnter(next) ? { label: L.next + ' — ' + wingById(next).name, run: () => session.playWing(next) } : null;
    }
    if (key === 'returnedShelf') return (p.returned[wingId] ?? []).length ? { label: L.listen, run: () => openListen(p.returned[wingId]) } : null;
    if (key === 'entrance') return waitingSongs().length ? { label: L.catch, run: () => openEntranceDialog() } : null;
    return null;
  }

  function nextWingId() {
    return PLAY_WING_IDS[PLAY_WING_IDS.indexOf(wingId) + 1] ?? null;
  }

  // ───────── 잡기와 재기 ─────────
  async function catchSong(id) {
    if (busy || disposed) return;
    const s = song(id);
    if (!s) return;
    busy = true;
    closeDialog();
    const pre = waitingSongs().includes(id);
    session.root.classList.add('is-measuring');
    try {
      await openMeasure({
        song: s,
        wing: wingId,
        world,
        rhythm: session.rhythm,
        setSlashMode: session.setSlashMode,
        preMeasured: pre ? true : undefined,
        notebook: session.notebook,
        notebookGlow: session.glows,
        // 공통 동작 안내는 입구 튜토리얼에서 본다(튜토리얼을 마쳤으면 본 것). 고유 동작 안내는 관마다 한 번.
        introSeen: { common: p.tutorialDone === true, unique: ws().uniqueActionIntroSeen === true },
        onIntroSeen: (kind) => { if (kind === 'unique') P.markUniqueActionIntroSeen(wingId); },
        reduceMotion: () => world.reduceMotion(),
        signal: ac.signal,
      });
      if (!disposed) P.markMeasured(wingId, id);
    } catch (e) {
      if (e?.name !== 'AbortError') console.error('[play] 재기 실패', e);
    } finally {
      session.root.classList.remove('is-measuring');
      busy = false;
      render();
    }
  }

  // ───────── 대화 상자 ─────────
  function closeDialog() {
    dialog?.remove();
    dialog = null;
  }

  function openDialog(kind, heading) {
    closeDialog();
    const box = el('section', 'play-dialog');
    box.dataset.kind = kind;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', heading);
    const body = el('div', 'play-dialog-body play-scroll');
    const close = button('play-dialog-close', L.close);
    close.addEventListener('click', closeDialog);
    const actions = el('div', 'play-dialog-actions');
    actions.append(close);
    box.append(el('h2', 'play-dialog-title', heading), body, actions);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDialog(); });
    session.root.append(box);
    dialog = box;
    return { box, body, close };
  }

  function occupantRow(area, i, s) {
    const row = el('div', 'play-occupant');
    row.append(el('span', 'play-occupant-place', spineLabel(area, i)));
    if (!s) { row.append(el('span', 'play-occupant-empty', L.spineEmpty)); return row; }
    row.append(el('span', 'play-occupant-title', quoted(title(s.songId))));
    if (area === 'basket' && s.to) row.append(el('span', 'play-tag', '→ ' + (wingById(s.to)?.name ?? '')));
    if (s.fixed || areaLocked(area)) row.append(el('span', 'play-occupant-fixed', L.fixed));
    else {
      const rm = button('play-remove', L.remove, quoted(title(s.songId)) + ' ' + L.remove);
      rm.dataset.area = area;
      rm.dataset.index = String(i);
      rm.addEventListener('click', () => removeSong(area, i));
      row.append(rm);
    }
    return row;
  }

  function picks(onPick) {
    const hand = handSongs();
    if (!hand.length) return [el('p', 'play-empty', L.nothingInHand)];
    const wrap = el('div', 'play-picks');
    for (const id of hand) {
      const b = button('play-pick', title(id), quoted(title(id)));
      b.dataset.song = id;
      b.addEventListener('click', () => onPick(id));
      wrap.append(b);
    }
    return [el('h3', 'play-dialog-sub', L.pickTitle), wrap];
  }

  function openSlotDialog(area, index) {
    const d = openDialog('slot', spineLabel(area, index));
    const draw = () => {
      const s = ws().placements[area][index];
      d.body.replaceChildren(occupantRow(area, index, s));
      if (!areaLocked(area) && !s?.fixed) d.body.append(...picks((id) => { closeDialog(); placeSong(area, index, id); }));
    };
    dialog.redraw = draw;
    draw();
  }

  function openBasketDialog() {
    const d = openDialog('basket', L.basket);
    let chosen = null;
    const draw = () => {
      const pl = ws().placements.basket;
      d.body.replaceChildren(...pl.map((s, i) => occupantRow('basket', i, s)));
      if (areaLocked('basket')) return;
      const free = pl.findIndex((s) => !s);
      if (free < 0) { d.body.append(el('p', 'play-empty', L.basketFull)); return; }
      if (!chosen) {
        const parts = picks((id) => { chosen = id; draw(); });
        if (parts[0]?.classList?.contains('play-dialog-sub')) parts[0].textContent = L.pickBasket;
        d.body.append(...parts);
        return;
      }
      const dests = el('div', 'play-dests');
      for (const w of WINGS.filter((x) => PLAY_WING_IDS.includes(x.id))) {
        const b = button('play-dest', w.name);
        b.dataset.wing = w.id;
        b.addEventListener('click', () => { const id = chosen; closeDialog(); placeSong('basket', free, id, w.id); });
        dests.append(b);
      }
      d.body.append(el('h3', 'play-dialog-sub', L.destTitle(title(chosen))), dests);
    };
    dialog.redraw = () => { chosen = null; draw(); };
    draw();
  }

  function openEntranceDialog() {
    const d = openDialog('entrance', L.waitingTitle);
    const wrap = el('div', 'play-picks');
    for (const id of waitingSongs()) {
      const b = button('play-pick', null, L.waitingLabel(title(id)));
      b.dataset.song = id;
      b.append(el('span', 'play-pencil', '✎'), el('span', null, title(id)));
      b.addEventListener('click', () => { closeDialog(); catchSong(id); });
      wrap.append(b);
    }
    d.body.replaceChildren(el('h3', 'play-dialog-sub', L.premeasured), wrap);
  }

  // ───────── 꽂기·빼기·판정 ─────────
  function placeSong(area, index, id, to) {
    const r = P.place(wingId, area, index, id, to);
    if (!r.ok) { render(); return r; }
    if (r.movedFrom) emitSet(r.movedFrom.area, r.movedFrom.index, null);
    emitSet(area, index, id, to);
    audio.sfx(area === 'basket' ? 'basket' : 'place');
    render();
    if (isFull(area)) enqueue(() => judge(area));
    return r;
  }

  function removeSong(area, index) {
    const r = P.unplace(wingId, area, index);
    if (!r.ok) return;
    emitSet(area, index, null);
    render();
    dialog?.redraw?.();
  }

  async function judge(area) {
    const wasDone = isDone();
    const r = P.judge(wingId, area);
    if (!r.ok) return;
    busy = true;
    world.setContext(null);
    try {
      for (const x of r.returned) {
        bus.emit('diorama:pop-out', { area, index: x.index, songId: x.songId, genre: x.genre });
        toast(area === 'basket' ? L.popOutBasket(title(x.songId)) : L.popOut(title(x.songId)));
        later(() => { if (!ws().placements[area][x.index]) emitSet(area, x.index, null); }, PLAY_TUNING.popOutMs);
      }
      if (r.returned.length && ws().wrongCount >= TUNABLES.wingWrongHelp) {
        toast(L.helpGlow);
        hud.glow(true);
      }
      if (area === 'basket' && r.routes?.length) {
        audio.sfx('basket');
        for (const route of r.routes) {
          const name = wingById(route.wing)?.name ?? '';
          toast(route.kind === 'prewait' ? L.sentPrewait(title(route.songId), name) : L.sentReturned(title(route.songId), name));
          const i = ws().placements.basket.findIndex((s) => s?.songId === route.songId);
          if (i >= 0) later(() => emitSet('basket', i, null), PLAY_TUNING.sentMs);
        }
      }
      render();
      if (r.bound) {
        const ids = ws().placements[area].map((s) => s.songId);
        bus.emit('diorama:shelf-bound', { area, songIds: ids });
        audio.sfx('bind');
        audio.sfx('gold');
        if (area === 'shelf') {
          bus.emit('diorama:fog-recede', {});
          audio.sfx('fog');
        }
        toast(area === 'shelf' ? L.bound : L.bonusBound);
        await playCeremony(session.root, { list: ids.map(song).filter(Boolean), manifest: session.manifest, engine: audio, signal: ac.signal, reduceMotion: () => world.reduceMotion() });
        if (area === 'shelf' && !disposed) toast(L.roomOpen);
        render();
      }
      if (!wasDone && isDone()) await finishWing();
    } finally {
      busy = false;
      render();
    }
  }

  // ───────── 작품 방 ─────────
  // 방 손잡이(README 7.3, '연결 결정(F3)'): 방 칸(container)을 세계 위에 겹치고, 세계는 world.openRoom으로 방 무대가 된다.
  // 3D면 세계가 원점의 빈 무대 { THREE, root, camera }를 내주고 프레임마다 방 칸 자리에 그린다(관 모형·회랑은 숨는다).
  // 방을 마치거나 나가면 world.closeRoom으로 카메라·관 모형·조작을 되돌린다. 도중에 나가면 다음에 처음부터 한다.
  function roomRhythm() {
    const device = session.store?.data?.device ?? {};
    return { ...session.rhythm, engine: audio, buildGrid, createTapSession, offsetMs: device.calibrationOffsetMs ?? session.rhythm?.offsetMs ?? 0 };
  }

  async function openRoom() {
    if (busy || disposed || !ws().shelfBound || ws().roomDone) return;
    busy = true;
    closeDialog();
    world.setContext(null);
    const roomSong = song(t.room);
    const box = el('section', 'play-room');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', L.roomTitle(roomSong?.title ?? ''));
    const head = el('div', 'play-room-head');
    const leave = button('play-room-leave', L.roomLeave);
    head.append(el('h2', 'play-room-title', L.roomTitle(roomSong?.title ?? '')), leave);
    const body = el('div', 'play-room-body');
    box.append(head, body);
    session.root.append(box);
    const roomAc = new AbortController();
    const onAbort = () => roomAc.abort(ac.signal.reason);
    ac.signal.addEventListener('abort', onAbort, { once: true });
    let stageOpen = false;
    let closed = false;
    const closeRoom = () => {
      if (closed) return;
      closed = true;
      box.remove();
      ac.signal.removeEventListener('abort', onAbort);
      session.root.classList.remove('is-in-room');
      if (stageOpen && !disposed) world.closeRoom();   // 관을 떠날 때는 dispose가 거둔다
      stageOpen = false;
      busy = false;
      render();
    };
    leave.addEventListener('click', () => { roomAc.abort(new DOMException('방에서 나감', 'AbortError')); closeRoom(); });
    const mod = session.rooms?.[wingId];
    if (typeof mod?.start !== 'function') {
      // 아직 등록되지 않은 방: 자리표시만 보이고 마칠 길은 없다.
      body.append(el('p', 'play-room-placeholder', L.roomPlaceholder));
      return;
    }
    session.root.classList.add('is-in-room');
    const stage = world.openRoom(body);
    stageOpen = true;
    box.classList.toggle('is-world-stage', !!stage);
    const record = session.store?.currentRecord?.() ?? null;
    let res = null;
    try {
      res = await mod.start({
        song: roomSong,
        container: body,
        mode: world.getMode(),
        three: stage ?? undefined,
        noBeat: !!audio.noBeat?.value,
        reduceMotion: () => world.reduceMotion(),
        rhythm: roomRhythm(),
        signal: roomAc.signal,
        manifest: session.manifest ?? undefined,
        appearance: record?.appearance ?? 'a',
        songs: session.songs,
      });
    } catch (e) {
      if (e?.name !== 'AbortError') console.error('[play] 작품 방 실패', e);
    }
    if (roomAc.signal.aborted || disposed) { closeRoom(); return; }
    closeRoom();
    if (!res?.completed) return;
    const wasDone = isDone();
    P.completeRoom(wingId, res.record);
    render();
    if (!wasDone && isDone()) await enqueue(() => finishWing());
  }

  // ───────── 판의 끝 ─────────
  async function finishWing() {
    busy = true;
    bus.emit('diorama:dancheong-restore', {});
    audio.sfx('gold');
    await new Promise((resolve) => {
      const host = el('div', 'play-card');
      host.setAttribute('role', 'dialog');
      session.root.append(host);
      const view = showCard(host, () => buildWingCard(session.store.currentRecord(), wingId), {
        manifest: session.manifest,
        onClose: () => { view.dispose(); host.remove(); resolve(); },
      });
      ac.signal.addEventListener('abort', () => { view.dispose(); host.remove(); resolve(); }, { once: true });
    });
    if (disposed) return;
    const next = nextWingId();
    if (next) showLeak(next);
    toast(L.bonusOpen);
    busy = false;
    render();
  }

  // 다음 관 문틈으로 그 관의 소리가 새어 나온다(spec 3.2)
  function showLeak(next) {
    leakEl?.remove();
    leakEl = el('p', 'play-leak', L.leak(wingById(next).name));
    leakEl.dataset.wing = next;
    session.root.append(leakEl);
    audio.playBgm(next);
    later(() => audio.playBgm(wingId), PLAY_TUNING.leakMs);
  }

  // ───────── 다시 듣기 ─────────
  function listenable() {
    const ids = [];
    const pl = ws().placements;
    for (const area of ['shelf', 'bonus']) for (const s of pl[area]) if (s?.fixed && !ids.includes(s.songId)) ids.push(s.songId);
    for (const id of p.returned[wingId] ?? []) if (!ids.includes(id)) ids.push(id);
    if (p.boss?.state === 'done' && wingId === 'sijo') ids.push(SONG_TABLE.boss.stage3SongId);
    return ids;
  }

  function openListen(only = null) {
    closeDialog();
    session.closePanel();
    const list = (only ?? listenable()).map(song).filter(Boolean);
    let stop = () => {};
    const panel = openPanel(session.root, { kind: 'listen', title: L.listenTitle, onClose: () => { stop(); session.forgetPanel(panel); } });
    session.trackPanel(panel);
    stop = renderListen(panel.body, { list, onPlay: (s) => audio.play(buildGrid(s)) });
  }

  // ───────── 들어가기 ─────────
  if (isDone()) world.setDancheong(wingId, 1);
  world.enterWing(wingId);
  audio.playBgm(wingId);
  session.root.dataset.place = wingId;
  hud.setPlace(wing.name);
  hud.glow(ws().wrongCount >= TUNABLES.wingWrongHelp && !isDone());
  replayVisuals();
  render();
  if (isDone()) toast(L.doneWing);
  raf = requestAnimationFrame(loop);
  const offGlow = bus.on('help:notebook-glow', () => hud.glow(true));

  function dispose() {
    if (disposed) return;
    disposed = true;
    ac.abort(new DOMException('관에서 나감', 'AbortError'));
    for (const id of timers) clearTimeout(id);
    timers.clear();
    cancelAnimationFrame(raf);
    offGlow();
    closeDialog();
    leakEl?.remove();
    for (const sel of ['.play-room', '.play-card', '.play-singers', '.play-keepsakes']) session.root.querySelectorAll(sel).forEach((n) => n.remove());
    session.root.classList.remove('is-in-room');
    world.closeRoom?.();
    layer.replaceChildren();
    hud.extras.replaceChildren();
    session.root.classList.remove('is-measuring');
    world.setContext(null);
  }

  return { wingId, onArrive, dispose, render };
}
