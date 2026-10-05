// 가사관 2D 그림 판(spec 14): 3D와 같은 회랑 상태(gasa-corridor.js)를 한 점 투시로 그린다.
// 회랑은 SVG, 서가·바구니·문은 HTML 겹이다. 먹빛→단청은 그림 판(.board-art)의 회색 필터가 맡고,
// 이 파일은 본래 색을 칠한다. 자리표시 그림이며, board/gasa 그림이 오면 바탕에 깔린다(세계 바탕이 깐다).
import { createCorridor } from './gasa-corridor.js';
import { createWingState, titleOf, popAmount } from './gasa-shared.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VB = { w: 160, h: 90 };
const VP = { x: 80, y: 30 };       // 소실점
const F = 124;                     // 투시 세기
const EYE = 2.2;                   // 눈높이(m)
const Z0 = 7;                      // 회랑 입구까지의 거리(m)
const SEG = 4;

// 2D 자리(그림 판 백분율). 오른쪽 아래 상황 버튼 구석(x>78, y>78)은 비운다.
export const ANCHORS_2D = {
  slots: [{ x: 7.5, y: 68 }, { x: 15.5, y: 68 }, { x: 23.5, y: 68 }],
  bonus: [{ x: 76.5, y: 68 }, { x: 84.5, y: 68 }, { x: 92.5, y: 68 }],
  basket: { x: 68, y: 86 },
  returnedShelf: { x: 12, y: 86 },
  roomDoor: { x: 89, y: 42 },
  nextDoor: { x: 11, y: 42 },
  entrance: { x: 32, y: 90 },
};

let uid = 0;

function el(tag, className, parent) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  parent?.append(e);
  return e;
}

function sv(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
}

const proj = (X, Y, d) => {
  const z = Math.max(2.5, d);
  return [VP.x + (X * F) / z, VP.y + ((EYE - Y) * F) / z];
};
const pts = (list) => list.map(([x, y]) => x.toFixed(2) + ',' + y.toFixed(2)).join(' ');

// 스타일 파일은 관 모형이 스스로 붙인다(한 번만). 연결 단계가 index.html에 넣어도 겹치지 않는다.
function ensureStyle() {
  const href = new URL('../../../css/wing-gasa.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.wing = 'gasa';
  document.head.append(link);
}

export function create2D(ctx) {
  ensureStyle();
  const { container, wing } = ctx;
  const reduce = () => !!ctx.reduceMotion?.();
  const state = createWingState();
  const corridor = createCorridor();
  const id = 'gasa2d-' + ++uid;
  let dirty = true;

  const rootEl = el('div', 'gasa2d', container);
  rootEl.dataset.wing = wing?.id ?? 'gasa';

  // ── 회랑(SVG) ──
  const svg = sv('svg', { class: 'gasa2d__corridor', viewBox: `0 0 ${VB.w} ${VB.h}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, rootEl);
  const defs = sv('defs', {}, svg);
  const mist = sv('radialGradient', { id: id + '-mist', cx: VP.x / VB.w, cy: VP.y / VB.h, r: 0.42 }, defs);
  sv('stop', { offset: '0', class: 'gasa2d__mist-in' }, mist);
  sv('stop', { offset: '0.55', class: 'gasa2d__mist-mid' }, mist);
  sv('stop', { offset: '1', class: 'gasa2d__mist-out' }, mist);
  sv('rect', { class: 'gasa2d__sky', x: 0, y: 0, width: VB.w, height: VB.h }, svg);
  sv('polygon', { class: 'gasa2d__ground', points: pts([[0, VP.y + 6], [VB.w, VP.y + 6], [VB.w, VB.h], [0, VB.h]]) }, svg);
  const segLayer = sv('g', { class: 'gasa2d__segs' }, svg);
  const segs = [];
  for (let i = 0; i < corridor.options.pool; i++) {
    const g = sv('g', { class: 'gasa2d__seg' }, segLayer);
    const part = (cls, tag = 'polygon') => sv(tag, { class: cls }, g);
    segs.push({
      g,
      deck: part('gasa2d__deck'),
      backPillars: [part('gasa2d__pillar', 'rect'), part('gasa2d__pillar', 'rect')],
      roofL: part('gasa2d__roof'),
      roofR: part('gasa2d__roof'),
      beamL: part('gasa2d__beam'),
      beamR: part('gasa2d__beam'),
      bandBack: part('gasa2d__band'),
      bandFront: part('gasa2d__band'),
      frontPillars: [part('gasa2d__pillar', 'rect'), part('gasa2d__pillar', 'rect')],
    });
  }
  sv('rect', { class: 'gasa2d__mist', x: 0, y: 0, width: VB.w, height: VB.h, fill: `url(#${id}-mist)` }, svg);
  // 회랑 입구 문
  const gate = sv('g', { class: 'gasa2d__gate' }, svg);
  const g0 = proj(-2.6, 0, Z0);
  const g1 = proj(-2.6, 3.6, Z0);
  const g2 = proj(2.6, 0, Z0);
  const gw = 0.44 * F / Z0;
  sv('rect', { class: 'gasa2d__pillar', x: g0[0] - gw / 2, y: g1[1], width: gw, height: g0[1] - g1[1] }, gate);
  sv('rect', { class: 'gasa2d__pillar', x: g2[0] - gw / 2, y: g1[1], width: gw, height: g0[1] - g1[1] }, gate);
  sv('rect', { class: 'gasa2d__beam', x: g0[0] - gw, y: g1[1] - 2.2, width: g2[0] - g0[0] + gw * 2, height: 2.6 }, gate);
  sv('polygon', { class: 'gasa2d__roof', points: pts([[g0[0] - 12, g1[1] - 2.2], [g2[0] + 12, g1[1] - 2.2], [g2[0] + 4, g1[1] - 8], [g0[0] - 4, g1[1] - 8]]) }, gate);

  const gateSign = el('div', 'gasa2d__sign gasa2d__sign--gate', rootEl);
  gateSign.textContent = wing?.name ?? '가사관';

  // ── 먹안개 ──
  const fog = el('div', 'gasa2d__fog', rootEl);
  for (let i = 0; i < 3; i++) el('span', 'gasa2d__fog-cloud', fog);

  // ── 문 ──
  const nextDoor = el('div', 'gasa2d__door gasa2d__door--next', rootEl);
  el('span', 'gasa2d__door-panel', nextDoor);
  const roomDoor = el('div', 'gasa2d__door gasa2d__door--room', rootEl);
  el('span', 'gasa2d__door-roof', roomDoor);
  el('span', 'gasa2d__door-panel', roomDoor);
  const roomSign = el('span', 'gasa2d__sign gasa2d__sign--room', roomDoor);
  roomSign.textContent = '「상춘곡」';

  // ── 서가 ──
  function makeShelf(area, cls) {
    const shelf = el('div', 'gasa2d__shelf ' + cls, rootEl);
    shelf.dataset.area = area;
    const cells = [0, 1, 2].map((i) => {
      const cell = el('div', 'gasa2d__cell', shelf);
      const vol = el('span', 'gasa2d__vol', cell);
      vol.dataset.area = area;
      vol.dataset.index = String(i);
      vol.dataset.state = 'empty';
      const t = el('span', 'gasa2d__title', vol);
      return { cell, vol, t };
    });
    el('span', 'gasa2d__thread', shelf);
    el('span', 'gasa2d__thread gasa2d__thread--low', shelf);
    return { shelf, cells };
  }
  const shelves = { shelf: makeShelf('shelf', 'gasa2d__shelf--main'), bonus: makeShelf('bonus', 'gasa2d__shelf--bonus') };

  const basket = el('div', 'gasa2d__basket', rootEl);
  const basketItems = [0, 1].map((i) => {
    const r = el('span', 'gasa2d__roll', basket);
    r.dataset.index = String(i);
    r.dataset.state = 'empty';
    el('span', 'gasa2d__tag', r);
    return r;
  });
  const basketPops = [0, 1].map((i) => {
    const p = el('span', 'gasa2d__basket-pop', rootEl);
    p.dataset.index = String(i);
    return p;
  });

  const returned = el('div', 'gasa2d__returned', rootEl);
  const returnedSign = el('span', 'gasa2d__sign gasa2d__sign--returned', returned);
  returnedSign.textContent = '돌아온 노래';
  const returnedBooks = el('div', 'gasa2d__returned-books', returned);

  const waiting = el('div', 'gasa2d__waiting', rootEl);
  el('span', 'gasa2d__waiting-top', waiting);

  // 삐져나온 노래 모양(갈래마다 조각 수가 다르다)
  const PIECES = { sijo: 3, saseol: 3, hyangga: 3, goryeo: 4, gasa: 2 };
  function setPop(host, pop) {
    let p = host.querySelector(':scope > .gasa2d__pop');
    if (!pop) { p?.remove(); return; }
    const genre = pop.genre ?? 'unknown';
    if (!p || p.dataset.genre !== genre) {
      p?.remove();
      p = el('span', 'gasa2d__pop', host);
      p.dataset.genre = genre;
      for (let i = 0; i < (PIECES[genre] ?? 1); i++) el('i', '', p);
    }
    p.style.setProperty('--pop', popAmount(pop.t).toFixed(3));
  }

  // ── 그리기 ──
  function drawCorridor() {
    const list = corridor.segments().sort((a, b) => b.rel - a.rel);
    list.forEach((s, i) => {
      const v = segs[i];
      segLayer.append(v.g);   // 먼 칸부터 그린다
      v.g.dataset.n = String(s.n);
      v.g.classList.toggle('is-ghost', s.ghost);
      const fade = s.ghost ? 0.22 : Math.max(0.35, 1 - Math.max(0, s.rel - 1.5) * 0.14);
      v.g.style.opacity = s.sink <= 0.001 ? '0' : String(fade * s.sink);
      const vy = s.sink;
      const rise = s.rise;
      const drop = (1 - rise) * 3;
      const dA = Z0 + 0.4 + s.rel * SEG + 0.25;
      const dB = dA + SEG - 0.5;
      const d1 = Z0 + 0.4 + s.rel * SEG + 1.15;   // 칸 안 기둥 사이를 칸 사이보다 좁혀 넷씩 묶여 보이게
      const d2 = Z0 + 0.4 + s.rel * SEG + SEG - 1.15;
      v.deck.setAttribute('points', pts([proj(-2.7, 0, dA), proj(2.7, 0, dA), proj(2.7, 0, dB), proj(-2.7, 0, dB)]));
      const pillar = (r, X, d, k) => {
        const [x, yb] = proj(X, 0.15 * vy, d);
        const [, yt] = proj(X, (0.15 + 2.8 * rise) * vy, d);
        const w = (0.34 * F) / Math.max(2.5, d);
        r.setAttribute('x', (x - w / 2).toFixed(2));
        r.setAttribute('y', yt.toFixed(2));
        r.setAttribute('width', w.toFixed(2));
        r.setAttribute('height', Math.max(0, yb - yt).toFixed(2));
        r.classList.toggle('is-lit', s.lit[k] > 0);
      };
      pillar(v.backPillars[0], -2.2, d2, 2);
      pillar(v.backPillars[1], 2.2, d2, 3);
      pillar(v.frontPillars[0], -2.2, d1, 0);
      pillar(v.frontPillars[1], 2.2, d1, 1);
      const show = rise > 0.02;
      for (const part of [v.roofL, v.roofR, v.beamL, v.beamR, v.bandBack, v.bandFront]) part.style.display = show ? '' : 'none';
      if (!show) return;
      const Y = (y) => (y + drop) * vy;
      v.roofL.setAttribute('points', pts([proj(-3.2, Y(3.05), dA), proj(0, Y(4.4), dA), proj(0, Y(4.4), dB), proj(-3.2, Y(3.05), dB)]));
      v.roofR.setAttribute('points', pts([proj(3.2, Y(3.05), dA), proj(0, Y(4.4), dA), proj(0, Y(4.4), dB), proj(3.2, Y(3.05), dB)]));
      v.beamL.setAttribute('points', pts([proj(-2.2, Y(2.95), d1), proj(-2.2, Y(3.25), d1), proj(-2.2, Y(3.25), d2), proj(-2.2, Y(2.95), d2)]));
      v.beamR.setAttribute('points', pts([proj(2.2, Y(2.95), d1), proj(2.2, Y(3.25), d1), proj(2.2, Y(3.25), d2), proj(2.2, Y(2.95), d2)]));
      const band = (p, d) => p.setAttribute('points', pts([proj(-2.3, Y(2.95), d), proj(2.3, Y(2.95), d), proj(2.3, Y(3.22), d), proj(-2.3, Y(3.22), d)]));
      band(v.bandBack, d2);
      band(v.bandFront, d1);
      v.bandFront.classList.toggle('is-flash', s.flash > 0);
      v.bandBack.classList.toggle('is-flash', s.flash > 0);
    });
    const snap = corridor.snapshot();
    rootEl.dataset.built = String(snap.built);
    rootEl.dataset.steps = String(snap.steps);
    rootEl.dataset.offset = String(snap.offset);
  }

  function drawPlaces() {
    for (const area of ['shelf', 'bonus']) {
      const { shelf, cells } = shelves[area];
      const bound = state.bound[area];
      shelf.classList.toggle('is-bound', !!bound);
      cells.forEach(({ vol, t }, i) => {
        const pop = state.pops.get(area + ':' + i);
        vol.dataset.state = pop ? 'popped' : state.slots[area][i] ? 'filled' : 'empty';
        setPop(vol, pop);
        // 제목은 묶인 뒤에만 보인다(spec 8)
        t.textContent = bound ? titleOf(bound[i]) : '';
      });
    }
    basketItems.forEach((r, i) => {
      const it = state.slots.basket[i];
      const pop = state.pops.get('basket:' + i);
      r.dataset.state = pop ? 'popped' : it ? 'filled' : 'empty';
      r.classList.toggle('has-tag', !!it?.to);
      setPop(basketPops[i], pop);
    });
    const books = state.slots.returned.filter(Boolean);
    if (returnedBooks.childElementCount !== books.length) {
      returnedBooks.replaceChildren(...books.map(() => el('span', 'gasa2d__returned-book')));
    }
  }

  function react(name, detail) {
    const d = detail && typeof detail === 'object' ? detail : {};
    const known = state.apply(name, d, reduce());
    switch (name) {
      case 'diorama:walk-step': corridor.step(reduce()); break;
      case 'diorama:pillar-light': corridor.light(d.unit, d.foot); break;
      case 'diorama:fold': corridor.flash(d.unit); break;
      case 'diorama:fog-recede':
      case 'diorama:dancheong-restore':
        fog.classList.add('is-receded');
        break;
      default:
        if (!known) return;
    }
    dirty = true;
  }
  if (ctx.restored) fog.classList.add('is-receded');

  function update(dt) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    const rm = reduce();
    if (corridor.tick(step, rm)) dirty = true;
    if (corridor.takeDirty()) dirty = true;
    if (state.tick(step, rm)) dirty = true;
    if (dirty) {
      dirty = false;
      drawCorridor();
      drawPlaces();
    }
  }
  update(0);

  return {
    anchors: JSON.parse(JSON.stringify(ANCHORS_2D)),
    react,
    update,
    dispose() {
      rootEl.remove();
    },
  };
}
