// 향가관 2D 그림 판(spec 14): 3D와 같은 자리와 같은 반응을 SVG 겹으로 그린다.
// 그림 판 그림(board/hyangga)이 오면 바탕과 탑 몸체 자리표시는 숨기고, 반응하는 겹(칸 불, '아아' 문, 책, 먹안개)만 남긴다.
// 먹빛→단청은 세계 바탕이 그림 판 전체에 거는 단청 값(--dancheong) 필터가 맡는다. 모양과 밝기로도 반응이 보이게 그린다.
// 좌표: 그림 판 백분율 { x, y }. SVG는 viewBox 0 0 1600 900(가로 1% = 16, 세로 1% = 9).
import {
  FLOORS, GROUPING, DOOR_BAYS, bayIndex, litPerFloor, createHyanggaState, snapshot, popShape, songTitle, roomTitle, WING_NAMES,
} from './hyangga-shared.js';

const NS = 'http://www.w3.org/2000/svg';
const STYLE_HREF = new URL('../../../css/wing-hyangga.css', import.meta.url).href;
const X = (p) => p * 16;
const Y = (p) => p * 9;

// 배치(백분율)
const TOWER = { x0: 24, width: 26, base: 70, floorH: 15 };
const NICHE_BAY = [0, 3, 6];
const BONUS = { x: [74, 82, 90], shelfY: 47 };
const BASKET = { x: 63, y: 84 };
const PULSE_MS = 600;

const bayW = (f) => TOWER.width / FLOORS[f];
const floorTop = (f) => TOWER.base - (f + 1) * TOWER.floorH;
const nicheX = (f) => TOWER.x0 + (NICHE_BAY[f] + 0.5) * bayW(f);

function s(tag, attrs = {}, children = []) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, String(v));
  for (const c of children) if (c) e.append(c);
  return e;
}

function text(str, attrs) {
  const t = s('text', attrs);
  t.textContent = str;
  return t;
}

function rect(x, y, w, h, cls, extra = {}) {
  return s('rect', { x: X(x), y: Y(y), width: X(w), height: Y(h), class: cls, ...extra });
}

// 묶인 뒤에만 보이는 노래 제목 이름표(빈 칸에는 제목이 없다)
function titlePlaque(cx, top) {
  return s('g', { class: 'hy-title-plaque', 'data-on': 'false' }, [
    rect(cx - 3.6, top, 7.2, 3.2, 'hy-plaque'),
    text('', { x: X(cx), y: Y(top + 2.35), class: 'hy-title' }),
  ]);
}

function ensureStyle() {
  if (document.querySelector('link[href$="css/wing-hyangga.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  link.dataset.wingStyle = 'hyangga';
  document.head.append(link);
}

// '아아' 문 표지(글자 없는 무늬): 둥근 테, 벌어진 입 모양 호, 위로 퍼지는 획 셋, 아래 점. 100×100 기준.
function aaSign(cx, cy, size) {
  const k = size / 100;
  const g = s('g', { class: 'hy-aa-sign', transform: `translate(${cx - size / 2} ${cy - size / 2}) scale(${k})` });
  g.append(
    s('circle', { cx: 50, cy: 54, r: 38 }),
    s('path', { d: 'M 66.3 57.9 A 18 18 0 0 1 33.7 57.9' }),
  );
  for (const a of [-0.55, 0, 0.55]) {
    g.append(s('line', { x1: 50 + Math.sin(a) * 6, y1: 36 - Math.cos(a) * 6, x2: 50 + Math.sin(a) * 22, y2: 36 - Math.cos(a) * 22 }));
  }
  g.append(s('circle', { cx: 50, cy: 76, r: 4.5, class: 'hy-aa-sign__dot' }));
  return g;
}

// 한 자리의 책 겹: 빈 책등(제목 없음), 꽂힌 책, 금박 띠, 삐져나온 모양
function slotGroup(area, index, x, y, opts = {}) {
  const w = opts.w ?? 1.6;
  const h = opts.h ?? 8;
  const g = s('g', { class: 'hy-slot', 'data-area': area, 'data-index': index, 'data-state': 'empty' });
  g.append(
    rect(x - w * 0.3, y - h * 0.96, w * 0.6, h * 0.96, 'hy-slot__ghost'),
    rect(x - w / 2, y - h, w, h, 'hy-slot__book'),
    rect(x - w * 0.6, y - h * 0.75, w * 1.2, 0.7, 'hy-slot__gold'),
    rect(x - w * 0.6, y - h * 0.32, w * 1.2, 0.7, 'hy-slot__gold'),
    s('g', { class: 'hy-slot__pop' }),
  );
  g.dataset.x = String(x);
  g.dataset.y = String(y);
  g.dataset.w = String(w);
  g.dataset.h = String(h);
  return g;
}

// 삐져나온 모양: 3D의 앞(z)은 그림 판에서 왼쪽('아아' 문과 겹치지 않게), 향가 층은 위로 쌓인다.
function drawPop(g, genre, songId, floorSize) {
  const pop = g.querySelector('.hy-slot__pop');
  pop.replaceChildren();
  if (!genre) return;
  const x = Number(g.dataset.x);
  const y = Number(g.dataset.y);
  const w = Number(g.dataset.w);
  const h = Number(g.dataset.h) * 1.1;
  const E = w * 1.2;
  const right = x + w / 2;
  for (const seg of popShape(genre, songId, floorSize)) {
    const x1 = right - seg.z * E;
    const width = Math.max(0.3, seg.d * E);
    const sy = y - (seg.y + seg.h) * h;
    pop.append(rect(x1 - width, sy, width, seg.h * h, 'hy-pop__seg'));
    if (seg.ring) pop.append(s('circle', { cx: X(x1 + 0.15), cy: Y(sy + seg.h * h / 2), r: 7, class: 'hy-pop__ring' }));
  }
  pop.dataset.genre = genre;
}

export function create2D(ctx) {
  ensureStyle();
  const { state, apply } = createHyanggaState({ restored: !!ctx.restored });
  const rm = () => !!ctx.reduceMotion?.();
  const timers = new Set();

  const root = document.createElement('div');
  root.className = 'hy-board';
  if (ctx.assets?.image?.('board/' + (ctx.wing?.id ?? 'hyangga'))) root.classList.add('has-art');
  const svg = s('svg', { viewBox: '0 0 1600 900', preserveAspectRatio: 'none', class: 'hy-svg', 'aria-hidden': 'true' });
  const defs = s('defs', {}, [
    s('radialGradient', { id: 'hy-fog-grad' }, [
      s('stop', { offset: '0%', class: 'hy-fog__stop-in' }),
      s('stop', { offset: '100%', class: 'hy-fog__stop-out' }),
    ]),
  ]);
  svg.append(defs);

  // ── 바탕(뒷벽·바닥) ──
  const backdrop = s('g', { class: 'hy-backdrop' }, [
    rect(0, 0, 100, 50, 'hy-wall'),
    rect(0, 50, 100, 50, 'hy-floor'),
    rect(0, 49, 100, 1.2, 'hy-wall__sill'),
  ]);
  svg.append(backdrop);

  // ── 다음 관 문(왼쪽 뒷벽), 돌아온 노래 선반 ──
  svg.append(s('g', { class: 'hy-next-door' }, [
    rect(3, 22, 8, 28, 'hy-door__frame'),
    rect(4, 24, 6, 26, 'hy-door__leaf'),
  ]));
  const returned = s('g', { class: 'hy-returned' }, [
    rect(12, 40, 9.5, 14, 'hy-shelf'),
    rect(11.6, 39, 10.3, 1.4, 'hy-shelf__top'),
  ]);
  for (let i = 0; i < 4; i++) returned.append(rect(13 + i * 2.1, 43, 1.4, 7, 'hy-slot__ghost'));
  returned.append(rect(11.6, 33, 10.3, 5, 'hy-plaque'), text('돌아온 노래', { x: X(16.75), y: Y(36.6), class: 'hy-plaque__text' }));
  svg.append(returned);

  // ── 탑 ──
  const tower = s('g', { class: 'hy-tower' });
  const body = s('g', { class: 'hy-tower-body' });
  body.append(rect(TOWER.x0 - 2, TOWER.base, TOWER.width + 4, 4, 'hy-plinth'));
  const bays = s('g', { class: 'hy-bays' });
  const pillars = s('g', { class: 'hy-pillars' });
  FLOORS.forEach((n, f) => {
    const top = floorTop(f);
    body.append(rect(TOWER.x0, top, TOWER.width, TOWER.floorH, 'hy-floor-wall'));
    for (let b = 0; b < n; b++) {
      const bx = TOWER.x0 + b * bayW(f);
      bays.append(rect(bx + bayW(f) * 0.12, top + 2, bayW(f) * 0.76, TOWER.floorH - 4, 'hy-bay', { 'data-floor': f, 'data-bay': b, 'data-i': bayIndex(f, b) }));
    }
    let acc = 0;
    const edges = new Set();
    if (f === FLOORS.length - 1) for (const gsz of GROUPING) { acc += gsz; if (acc < n) edges.add(acc); }
    for (let b = 0; b <= n; b++) {
      const t = edges.has(b) ? 0.9 : 0.5;
      pillars.append(rect(TOWER.x0 + b * bayW(f) - t / 2, top + 0.6, t, TOWER.floorH - 0.6, edges.has(b) ? 'hy-pillar hy-pillar--group' : 'hy-pillar'));
    }
    pillars.append(rect(TOWER.x0 - 0.3, top + 0.4, TOWER.width + 0.6, 1.1, 'hy-beam'));
    body.append(rect(TOWER.x0 - 1.4 - f * 0.4, top - 0.6, TOWER.width + 2.8 + f * 0.8, 1.2, 'hy-eave'));
  });
  const roofY = floorTop(FLOORS.length - 1);
  body.append(s('path', {
    class: 'hy-roof',
    d: `M ${X(TOWER.x0 - 3)} ${Y(roofY)} Q ${X(TOWER.x0 + TOWER.width / 2)} ${Y(roofY - 6)} ${X(TOWER.x0 + TOWER.width + 3)} ${Y(roofY)} L ${X(TOWER.x0 + TOWER.width - 4)} ${Y(roofY - 10)} L ${X(TOWER.x0 + 4)} ${Y(roofY - 10)} Z`,
  }));
  body.append(rect(TOWER.x0 + TOWER.width / 2 - 0.4, roofY - 15, 0.8, 5, 'hy-finial'));
  tower.append(body, bays, pillars);

  // '아아' 문: 10구 층의 마지막 두 칸(8·9칸) 앞
  const f2 = FLOORS.length - 1;
  const dx0 = TOWER.x0 + DOOR_BAYS[0] * bayW(f2);
  const dw = TOWER.width - DOOR_BAYS[0] * bayW(f2);
  const dTop = floorTop(f2) + 1.6;
  const dH = TOWER.floorH - 1.8;
  const door = s('g', { class: 'hy-aa-door', 'data-state': 'closed' });
  const leaf = s('g', { class: 'hy-aa-door__leaf' }, [rect(dx0 + 0.15, dTop, dw - 0.3, dH, 'hy-aa-door__panel')]);
  leaf.append(aaSign(X(dx0 + dw / 2), Y(dTop + dH * 0.5), Math.min(X(dw - 1.2), Y(dH - 2))));
  door.append(leaf);
  tower.append(door);

  // 층마다 서가 자리(칸 하나)와 층 이름 비석
  const slotEls = { shelf: [], bonus: [], basket: [] };
  const titleEls = { shelf: [], bonus: [] };
  FLOORS.forEach((n, f) => {
    const nx = nicheX(f);
    const top = floorTop(f);
    const shelfY = top + TOWER.floorH - 2.6;
    tower.append(rect(nx - 1.9, top + 2.4, 3.8, 10.2, 'hy-niche'));
    tower.append(rect(nx - 2.2, shelfY, 4.4, 0.9, 'hy-niche__board'));
    const g = slotGroup('shelf', f, nx, shelfY, { w: 1.7, h: 8 });
    slotEls.shelf.push(g);
    tower.append(g);
    // 비석과 이어 주는 끈(이 층의 자리가 저 비석 앞이라는 표시)
    tower.append(s('line', { x1: X(nx), y1: Y(shelfY + 0.9), x2: X(nx), y2: Y(76), class: 'hy-cord' }));
    tower.append(rect(nx - 2.35, 76, 4.7, 4.2, 'hy-plaque'), text(n + '구 층', { x: X(nx), y: Y(79.1), class: 'hy-plaque__text hy-plaque__text--small' }));
    const title = titlePlaque(nx, shelfY + 1.1);
    titleEls.shelf.push(title);
    tower.append(title);
  });
  // 탑이 묶이면 세 자리를 잇는 금빛 실
  const bindCord = s('polyline', {
    class: 'hy-bind',
    points: FLOORS.map((_, f) => `${X(nicheX(f))},${Y(floorTop(f) + TOWER.floorH - 6.6)}`).join(' '),
  });
  tower.append(bindCord);
  svg.append(tower);

  // ── 작품 방 문 「제망매가」 ──
  const room = s('g', { class: 'hy-room-door', 'data-open': String(state.roomOpen) }, [
    rect(55.5, 21, 9, 29, 'hy-door__frame'),
    rect(56.5, 23, 7, 27, 'hy-room-door__dark'),
    s('g', { class: 'hy-room-door__leaf' }, [rect(56.5, 23, 7, 27, 'hy-door__leaf')]),
    rect(54.5, 15, 11, 5, 'hy-plaque'),
    text(roomTitle(), { x: X(60), y: Y(18.6), class: 'hy-plaque__text' }),
  ]);
  svg.append(room);

  // ── 덤 서가 ──
  const bonus = s('g', { class: 'hy-bonus' }, [
    rect(70, 26, 24, 26, 'hy-shelf'),
    rect(69.5, 25, 25, 1.6, 'hy-shelf__top'),
    rect(70, BONUS.shelfY, 24, 1, 'hy-niche__board'),
  ]);
  for (let i = 1; i < 3; i++) bonus.append(rect(70 + i * 8 - 0.3, 26, 0.6, 26, 'hy-shelf__divider'));
  BONUS.x.forEach((x, i) => {
    const g = slotGroup('bonus', i, x, BONUS.shelfY, { w: 1.7, h: 9 });
    slotEls.bonus.push(g);
    bonus.append(g);
    const title = titlePlaque(x, BONUS.shelfY + 1.2);
    titleEls.bonus.push(title);
    bonus.append(title);
  });
  svg.append(bonus);

  // ── 바구니(두 자리, 행선지 표) ──
  const basket = s('g', { class: 'hy-basket' }, [
    s('path', { class: 'hy-basket__body', d: `M ${X(57)} ${Y(80)} L ${X(69)} ${Y(80)} L ${X(67.5)} ${Y(89)} L ${X(58.5)} ${Y(89)} Z` }),
    rect(56.6, 79.2, 12.8, 1.4, 'hy-basket__rim'),
  ]);
  const tagEls = [];
  [-2.6, 2.6].forEach((dx, i) => {
    const x = BASKET.x + dx;
    const g = s('g', { class: 'hy-slot hy-scroll', 'data-area': 'basket', 'data-index': i, 'data-state': 'empty' });
    g.append(
      rect(x - 2, 76.4, 4, 2.8, 'hy-slot__book'),
      rect(x - 0.4, 76, 0.8, 3.6, 'hy-scroll__core'),
      s('g', { class: 'hy-slot__pop' }),
    );
    g.dataset.x = String(x - 0.6);
    g.dataset.y = '79';
    g.dataset.w = '1.2';
    g.dataset.h = '6';
    const tag = s('g', { class: 'hy-tag' }, [rect(x - 2.4, 70.5, 4.8, 3.6, 'hy-tag__card'), text('', { x: X(x), y: Y(73.1), class: 'hy-tag__text' })]);
    tagEls.push(tag);
    g.append(tag);
    slotEls.basket.push(g);
    basket.append(g);
  });
  svg.append(basket);

  // ── 기다리는 노래 자리(입구 쪽 받침) ──
  svg.append(rect(43, 92, 8, 2.4, 'hy-stand'));

  // ── 먹안개 ──
  const fog = s('g', { class: 'hy-fog', 'data-on': String(state.fog) });
  for (const [x, y, rx, ry] of [[30, 66, 16, 7], [44, 58, 12, 6], [22, 48, 10, 6], [38, 36, 15, 6], [50, 30, 10, 5], [66, 64, 12, 6], [86, 70, 12, 6], [14, 76, 10, 5]]) {
    fog.append(s('ellipse', { cx: X(x), cy: Y(y), rx: X(rx), ry: Y(ry), fill: 'url(#hy-fog-grad)' }));
  }
  svg.append(fog);

  root.append(svg);
  ctx.container.append(root);

  // ── 상태 → 그림 ──
  const bayEls = [...bays.querySelectorAll('.hy-bay')];

  function renderBays() {
    const lit = litPerFloor(state.fill);
    for (const el of bayEls) {
      const f = Number(el.dataset.floor);
      const b = Number(el.dataset.bay);
      el.classList.toggle('is-lit', b < lit[f]);
      el.classList.toggle('is-revealed', f === FLOORS.length - 1 && DOOR_BAYS.includes(b) && state.door === 'open');
    }
  }

  function pulse(i, strong) {
    const el = bayEls.find((x) => Number(x.dataset.i) === i);
    if (!el) return;
    el.classList.remove('is-pulse', 'is-pulse-soft');
    void el.getBBox?.();
    el.classList.add(strong ? 'is-pulse' : 'is-pulse-soft');
    const t = setTimeout(() => { timers.delete(t); el.classList.remove('is-pulse', 'is-pulse-soft'); }, PULSE_MS);
    timers.add(t);
  }

  function renderDoor() {
    door.dataset.state = state.door;
    if (state.door === 'absent' && !rm()) {
      door.classList.remove('is-shaking');
      void door.getBBox?.();
      door.classList.add('is-shaking');
    }
  }

  function renderSlots() {
    for (const area of ['shelf', 'bonus', 'basket']) {
      slotEls[area].forEach((g, i) => {
        const sl = state[area][i];
        const bound = area !== 'basket' && !!state.bound[area];
        g.dataset.state = !sl ? 'empty' : sl.popped ? 'popped' : bound ? 'bound' : 'filled';
        drawPop(g, sl?.popped ?? null, sl?.songId, area === 'shelf' ? FLOORS[i] : 10);
        if (area === 'basket') {
          const to = sl && !sl.popped ? sl.to : null;
          tagEls[i].dataset.on = String(!!to);
          tagEls[i].querySelector('text').textContent = to ? WING_NAMES[to] ?? '' : '';
        } else {
          const t = bound && sl ? songTitle(sl.songId) : '';
          titleEls[area][i].dataset.on = String(!!t);
          titleEls[area][i].querySelector('text').textContent = t;
        }
      });
    }
    bindCord.dataset.on = String(!!state.bound.shelf);
    room.dataset.open = String(state.roomOpen);
  }

  function renderAll() {
    renderBays();
    door.dataset.state = state.door;
    renderSlots();
    fog.dataset.on = String(state.fog);
    root.dataset.restored = String(state.restored);
  }
  renderAll();

  function react(name, detail) {
    const change = apply(name, detail);
    if (!change) return;
    if (change.pulse) for (const p of state.pulses.splice(0)) pulse(p.bay, p.strength >= 1);
    if (change.fill || change.door) renderBays();
    if (change.door) renderDoor();
    if (change.slots) renderSlots();
    if (change.fog || change.restore) { fog.dataset.on = String(state.fog); root.dataset.restored = String(state.restored); }
  }

  return {
    anchors: {
      slots: FLOORS.map((_, f) => ({ x: nicheX(f), y: 84 })),
      bonus: BONUS.x.map((x) => ({ x, y: 60 })),
      basket: { x: BASKET.x, y: 92 },
      returnedShelf: { x: 16.75, y: 62 },
      roomDoor: { x: 60, y: 56 },
      entrance: { x: 47, y: 95 },
      nextDoor: { x: 7, y: 56 },
      floating: [{ x: 51, y: 66 }, { x: 68, y: 66 }, { x: 76, y: 71 }, { x: 86, y: 66 }, { x: 93, y: 73 }],
    },
    focus: { x: TOWER.x0 + TOWER.width / 2, y: 45 },
    react,
    info: () => snapshot(state),
    dispose() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      root.remove();
    },
  };
}
