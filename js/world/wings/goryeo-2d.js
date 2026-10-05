// 고려가요관 2D 그림 판(spec 14). 3D와 같은 상태(goryeo-state.js)와 같은 자리를 SVG 겹으로 그린다.
// 그림 자산 board/goryeo가 오면 세계 바탕이 바탕 그림으로 깔고, 이 겹은 반응(고리, 등불, 책등, 먹안개)을 그 위에 그린다.
// 색은 SVG 속성으로 직접 주므로 따로 CSS 파일이 없어도 그려진다.
import { SONG_CATALOG } from '../../data/song-table.js';
import { wingById } from '../../data/wings.js';
import { TOKENS, dancheongColor, getDancheong, mixHex, onDancheong } from '../palette.js';
import {
  AREAS, FEET_PER_LINE, L2, STANZA_ROOMS, TIMES,
  advance, applyEvent, createState, linkProgress, linkedRooms, litGaps, popProgress, slot2D,
} from './goryeo-state.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1600;
const H = 900;

const C = {
  wall: TOKENS.hanji,
  paper: TOKENS.hanjiDeep,
  wood: TOKENS.meokSoft,
  woodLight: mixHex(TOKENS.hanjiDeep, TOKENS.meokSoft, 0.45),
  roof: TOKENS.meok,
  floor: mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.2),
  ghost: mixHex(TOKENS.hanji, TOKENS.meokFog, 0.55),
  band: TOKENS.meok,
  gold: TOKENS.gold,
  nok: TOKENS.nokcheong,
  ju: TOKENS.juhong,
  lampOff: TOKENS.meokFog,
  fog: TOKENS.meokFog,
};
const litColor = (level) => mixHex(TOKENS.hanji, TOKENS.gold, 0.35 + 0.45 * level);

export function create2D(ctx) {
  const { container, wing } = ctx;
  const wingId = wing?.id ?? 'goryeo';
  const reduce = () => !!ctx.reduceMotion?.();
  const state = createState({ restored: !!ctx.restored || getDancheong(wingId) >= 1 });
  let level = ctx.restored ? 1 : getDancheong(wingId);
  const painted = [];   // 단청 값에 따라 다시 칠할 요소: [요소, { fill, stroke }]

  function node(tag, attrs = {}, parent = null, paint = null) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
    if (paint) { painted.push([n, paint]); applyPaint(n, paint); }
    parent?.append(n);
    return n;
  }
  function applyPaint(n, paint) {
    if (paint.fill) n.setAttribute('fill', dancheongColor(paint.fill, level));
    if (paint.stroke) n.setAttribute('stroke', dancheongColor(paint.stroke, level));
  }
  const rect = (parent, x, y, w, h, paint, extra = {}) => node('rect', { x, y, width: w, height: h, ...extra }, parent, paint);

  const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', class: 'goryeo-board' });
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden';
  const hasArt = !!ctx.assets?.image?.('board/' + wingId);

  // ── 바탕(그림 자산이 있으면 그리지 않는다) ──
  const base = node('g', { 'data-layer': 'base' }, svg);
  if (!hasArt) {
    rect(base, 0, 0, W, 440, { fill: C.wall });
    rect(base, 0, 440, W, 460, { fill: C.floor });
    for (let x = 40; x < W; x += 80) node('line', { x1: x, y1: 440, x2: x - 30, y2: 900, 'stroke-width': 2, opacity: 0.35 }, base, { stroke: C.wood });
  }

  // ── 똑같은 연 방 일곱: 같은 함수가 같은 모양을 찍는다 ──
  const rooms = node('g', { 'data-layer': 'rooms' }, svg);
  const hooks = [];
  const beads = [];
  for (let i = 0; i < STANZA_ROOMS; i++) {
    const cx = L2.roomCx(i);
    const half = L2.roomW / 2;
    const g = node('g', { class: 'goryeo-room', 'data-room': i }, rooms);
    node('polygon', { points: `${cx - half - 15},${L2.wallTop} ${cx + half + 15},${L2.wallTop} ${cx + half - 10},${L2.roofTop} ${cx - half + 10},${L2.roofTop}` }, g, { fill: C.roof });
    rect(g, cx - half, L2.wallTop, L2.roomW, L2.wallBottom - L2.wallTop, { fill: C.wall, stroke: C.wood }, { 'stroke-width': 3 });
    rect(g, cx - 25, 222, 50, L2.wallBottom - 222, { fill: C.wood });
    for (const dx of [-12, 0, 12]) node('line', { x1: cx + dx, y1: 226, x2: cx + dx, y2: L2.wallBottom - 4, 'stroke-width': 2 }, g, { stroke: C.paper });
    rect(g, cx - half - 4, L2.wallTop, 8, L2.wallBottom - L2.wallTop, { fill: C.wood });
    rect(g, cx + half - 4, L2.wallTop, 8, L2.wallBottom - L2.wallTop, { fill: C.wood });
    rect(g, cx - half - 6, L2.wallBottom, L2.roomW + 12, 12, { fill: C.woodLight });
    for (let f = 0; f < FEET_PER_LINE; f++) {
      beads.push(node('circle', { cx: cx + (f - 1) * L2.beadDx, cy: L2.beadY, r: 8, class: 'goryeo-bead', 'data-room': i, 'data-foot': f }, g));
    }
    hooks.push(node('circle', { cx, cy: L2.hookY - 6, r: 8, fill: 'none', 'stroke-width': 4, class: 'goryeo-hook', 'data-room': i }, g));
  }

  // 작품 방 「정석가」
  const RD = L2.roomDoor;
  const door = node('g', { class: 'goryeo-room-door' }, svg);
  node('polygon', { points: `${RD.x0 - 20},140 ${RD.x1 + 20},140 ${RD.x1 - 15},75 ${RD.x0 + 15},75` }, door, { fill: C.roof });
  rect(door, RD.x0, 140, RD.x1 - RD.x0, 205, { fill: C.wall, stroke: C.wood }, { 'stroke-width': 3 });
  const leaves = [rect(door, RD.cx - 36, 194, 36, 151, { fill: C.roof }), rect(door, RD.cx, 194, 36, 151, { fill: C.roof })];
  rect(door, RD.cx - 46, 186, 10, 159, { fill: C.ju }, { 'data-part': 'room-door' });
  rect(door, RD.cx + 36, 186, 10, 159, { fill: C.ju });
  rect(door, RD.cx - 52, 178, 104, 12, { fill: C.nok });
  rect(door, RD.cx - 54, 144, 108, 30, { fill: C.wall, stroke: C.roof }, { 'stroke-width': 2 });
  const plaque = node('text', { x: RD.cx, y: 166, 'text-anchor': 'middle', 'font-weight': 700 }, door, { fill: C.roof });
  plaque.style.cssText = 'font-family: var(--font-body, serif); font-size: calc(20px * var(--text-scale, 1))';
  plaque.textContent = '「정석가」';

  // ── 복도(방 앞을 잇는 마루), 등롱, 접힌 경계 ──
  const CO = L2.corridor;
  const corridor = node('g', { 'data-layer': 'corridor' }, svg);
  rect(corridor, 0, CO.y0, W, CO.y1 - CO.y0, { fill: C.paper });
  for (const y of [CO.y0 + 30, CO.y0 + 60]) node('line', { x1: 0, y1: y, x2: W, y2: y, 'stroke-width': 2, opacity: 0.4 }, corridor, { stroke: C.wood });
  node('line', { x1: 0, y1: CO.y1, x2: W, y2: CO.y1, 'stroke-width': 5 }, corridor, { stroke: C.wood });
  const lanterns = [];
  for (let gI = 0; gI < STANZA_ROOMS; gI++) {
    const x = L2.gapX(gI);
    rect(corridor, x - 4, CO.y0 + 22, 8, CO.y1 - CO.y0 - 22, { fill: C.wood });
    lanterns.push(rect(corridor, x - 12, CO.y0 + 4, 24, 30, null, { rx: 7, class: 'goryeo-lantern', 'data-gap': gI }));
  }
  const seams = [];
  for (let r = 0; r < STANZA_ROOMS; r++) {
    const x = L2.seamX(r);
    seams.push(node('line', { x1: x, y1: L2.wallTop, x2: x, y2: CO.y0, 'stroke-width': 6, 'stroke-linecap': 'round', class: 'goryeo-seam', 'data-room': r, visibility: 'hidden' }, corridor));
  }

  // ── 서가: 칸(셋), 덤 칸(셋) ──
  const shelfLayer = node('g', { 'data-layer': 'shelves' }, svg);
  for (const area of ['shelf', 'bonus']) {
    const s = L2.shelves[area];
    const x0 = s.xs[0] - s.compW / 2 - 8;
    const x1 = s.xs[2] + s.compW / 2 + 8;
    const g = node('g', { class: 'goryeo-shelf-frame', 'data-area': area }, shelfLayer);
    rect(g, x0, s.y0 - 12, x1 - x0, s.h + 24, { fill: C.wood });
    for (const x of s.xs) {
      rect(g, x - s.compW / 2, s.y0, s.compW, s.h, { fill: C.wall });
      node('line', { x1: x - s.compW / 2 + 6, y1: s.y0 + s.h - 3, x2: x + s.compW / 2 - 6, y2: s.y0 + s.h - 3, 'stroke-width': 5 }, g, { stroke: area === 'shelf' ? C.nok : C.ju });
    }
  }

  // 바구니
  const BK = L2.basket;
  const basket = node('g', { class: 'goryeo-basket' }, svg);
  node('path', { d: `M${BK.cx - 95},${BK.y - 38} L${BK.cx + 95},${BK.y - 38} L${BK.cx + 75},${BK.y + 52} L${BK.cx - 75},${BK.y + 52} Z`, 'stroke-width': 5 }, basket, { fill: C.woodLight, stroke: C.nok });
  for (const dy of [-8, 22]) node('line', { x1: BK.cx - 85, y1: BK.y + dy, x2: BK.cx + 85, y2: BK.y + dy, 'stroke-width': 3 }, basket, { stroke: C.wood });

  // 돌아온 노래 선반, 기다리는 노래 받침대, 다음 관 문
  const RS = L2.returnedShelf;
  const misc = node('g', { 'data-layer': 'misc' }, svg);
  rect(misc, RS.cx - 62, RS.y - 70, 124, 150, { fill: C.wood });
  rect(misc, RS.cx - 52, RS.y - 60, 104, 130, { fill: C.wall });
  for (const dx of [-22, 14]) rect(misc, RS.cx + dx, RS.y - 40, 22, 104, { stroke: C.ghost }, { fill: 'none', 'stroke-width': 3, 'stroke-dasharray': '6 5' });
  const LE = L2.lectern;
  node('path', { d: `M${LE.cx - 48},${LE.y - 30} L${LE.cx + 48},${LE.y - 46} L${LE.cx + 48},${LE.y - 36} L${LE.cx - 48},${LE.y - 20} Z` }, misc, { fill: C.woodLight });
  rect(misc, LE.cx - 5, LE.y - 30, 10, 70, { fill: C.wood });
  rect(misc, LE.cx - 30, LE.y + 36, 60, 8, { fill: C.wood });
  const ND = L2.nextDoor;
  rect(misc, ND.cx - 44, ND.y - 100, 10, 170, { fill: C.ju });
  rect(misc, ND.cx + 34, ND.y - 100, 10, 170, { fill: C.ju });
  rect(misc, ND.cx - 54, ND.y - 112, 108, 14, { fill: C.nok });

  // ── 움직이는 겹: 책등, 끈과 고리, 울림, 삐져나옴, 먹안개 ──
  const books = node('g', { 'data-layer': 'books' }, svg);
  const links = node('g', { 'data-layer': 'links' }, svg);
  const ripples = node('g', { 'data-layer': 'ripples' }, svg);
  const pops = node('g', { 'data-layer': 'pops' }, svg);
  const fog = node('g', { 'data-layer': 'fog', class: 'goryeo-fog' }, svg);
  [[300, 560, 380, 120], [900, 700, 460, 140], [1300, 520, 360, 110], [600, 330, 520, 110], [1150, 300, 420, 100], [150, 800, 300, 90]]
    .forEach(([cx, cy, rx, ry]) => node('ellipse', { cx, cy, rx, ry }, fog, { fill: C.fog }));

  container.append(svg);

  // ── 그리기 ──
  function drawBooks() {
    books.replaceChildren();
    for (const area of Object.keys(AREAS)) {
      for (let i = 0; i < AREAS[area]; i++) {
        if (state.pops.some((p) => p.area === area && p.index === i)) continue;
        const sl = slot2D(area, i);
        const filled = state.slots[area][i];
        if (!filled && area === 'basket') continue;   // 바구니 빈자리는 아무것도 없다
        const g = node('g', { class: 'goryeo-spine', 'data-area': area, 'data-index': i, 'data-state': filled ? 'filled' : 'empty' }, books);
        if (filled) {
          rect(g, sl.cx - sl.w / 2, sl.top, sl.w, sl.h, { fill: C.paper, stroke: C.wood }, { 'stroke-width': 2 });
          for (const f of [0.12, 0.88]) rect(g, sl.cx - sl.w / 2, sl.top + sl.h * f - 2, sl.w, 4, { fill: C.band });
          if (area === 'basket' && filled.to) {
            const name = wingById(filled.to)?.name ?? '';
            rect(g, sl.cx - 30, sl.top - 30, 60, 24, { fill: C.wall, stroke: C.nok }, { 'stroke-width': 2, rx: 4 });
            const t = node('text', { x: sl.cx, y: sl.top - 13, 'text-anchor': 'middle', class: 'goryeo-basket-to' }, g, { fill: C.roof });
            t.style.cssText = 'font-family: var(--font-ui, sans-serif); font-size: calc(13px * var(--text-scale, 1)); font-weight: 700';
            t.textContent = name;
          }
        } else {
          // 빈자리: 제목 없는 빈 책등
          rect(g, sl.cx - sl.w / 2, sl.top, sl.w, sl.h, { stroke: C.ghost }, { fill: 'none', 'stroke-width': 3, 'stroke-dasharray': '6 5' });
        }
      }
    }
    for (const area of ['shelf', 'bonus']) {
      const ids = state.bound[area];
      if (!ids) continue;
      const s = L2.shelves[area];
      const a = slot2D(area, 0);
      const g = node('g', { class: 'goryeo-bound', 'data-area': area }, books);
      for (const f of [0.2, 0.8]) node('line', { x1: s.xs[0] - 40, y1: a.top + a.h * f, x2: s.xs[2] + 40, y2: a.top + a.h * f, 'stroke-width': 4 }, g, { stroke: C.band });
      ids.forEach((id, i) => {
        const sl = slot2D(area, i);
        rect(g, sl.cx - sl.w / 2 + 3, sl.top + 4, sl.w - 6, 9, { fill: C.gold }, { class: 'goryeo-gold' });
        const title = (SONG_CATALOG[id]?.title ?? '').replace(/\s+/g, '');
        if (!title) return;
        const t = node('text', { x: sl.cx, y: sl.top + sl.h * 0.25, class: 'goryeo-title', 'data-song': id }, g, { fill: C.roof });
        const size = Math.min(18, Math.floor((sl.h * 0.52) / title.length));
        t.style.cssText = `writing-mode: vertical-rl; text-orientation: upright; font-family: var(--font-body, serif); font-weight: 700; font-size: calc(${size}px * var(--text-scale, 1))`;
        t.textContent = title;
      });
    }
    // 작품 방 문짝: 열리면 양옆으로 좁아지며 젖혀진다
    const k = state.doorLevel;
    leaves[0].setAttribute('x', String(RD.cx - 36 - 6 * k));
    leaves[0].setAttribute('width', String(36 - 26 * k));
    leaves[1].setAttribute('x', String(RD.cx + 6 * k + 26 * k));
    leaves[1].setAttribute('width', String(36 - 26 * k));
    door.dataset.open = state.roomOpen ? 'true' : 'false';
  }

  const hookPoint = (room) => ({ x: L2.roomCx(room), y: L2.hookY });

  function drawLinks() {
    links.replaceChildren();
    const linked = linkedRooms(state);
    hooks.forEach((h, i) => h.setAttribute('stroke', dancheongColor(linked.has(i) ? C.ju : C.wood, level)));
    state.links.forEach((l, k) => {
      let A = hookPoint(l.a);
      let B = hookPoint(l.b);
      if (l.same) { A = { x: A.x - 22, y: A.y }; B = { x: B.x + 22, y: B.y }; }
      const tier = k % 3;
      const midY = l.same ? 300 : CO.y0 + 45 + 12 * tier;
      const cy = 2 * midY - (A.y + B.y) / 2;
      const g = node('g', { class: 'goryeo-link', 'data-from': l.a, 'data-to': l.b }, links);
      const path = node('path', { d: `M${A.x},${A.y} Q${(A.x + B.x) / 2},${cy} ${B.x},${B.y}`, fill: 'none', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
      path.setAttribute('stroke', dancheongColor(C.nok, level));
      const prog = linkProgress(l);
      if (prog < 1) {
        let len = 0;
        try { len = path.getTotalLength(); } catch { len = 0; }
        if (len > 0) {
          path.setAttribute('stroke-dasharray', String(len));
          path.setAttribute('stroke-dashoffset', String(len * (1 - prog)));
        }
      }
      const ends = prog >= 1 ? [A, B] : [A];
      for (const p of ends) node('circle', { cx: p.x, cy: p.y + 4, r: 12, fill: 'none', 'stroke-width': 5, class: 'goryeo-ring', stroke: dancheongColor(C.ju, level) }, g);
    });
  }

  function drawLamps() {
    const lit = litColor(level);
    const off = dancheongColor(C.lampOff, level);
    beads.forEach((b) => {
      const on = state.beads.has(b.dataset.room + ':' + b.dataset.foot);
      b.setAttribute('fill', on ? lit : off);
      b.setAttribute('r', on ? '10' : '7');
      b.dataset.lit = on ? 'true' : 'false';
    });
    const gaps = litGaps(state);
    lanterns.forEach((n, gI) => {
      const on = gaps.has(gI) || (gI === STANZA_ROOMS - 1 && state.roomOpen);
      n.setAttribute('fill', on ? lit : off);
      n.dataset.lit = on ? 'true' : 'false';
    });
    seams.forEach((n, r) => {
      n.setAttribute('stroke', lit);
      n.setAttribute('visibility', state.seams.has(r) ? 'visible' : 'hidden');
    });
  }

  function drawRipples() {
    ripples.replaceChildren();
    const lit = litColor(level);
    for (const rp of state.ripples) {
      const t = Math.min(1, rp.age / TIMES.ripple);
      const ax = L2.roomCx(rp.a);
      const bx = L2.roomCx(rp.b);
      node('ellipse', { cx: ax + (bx - ax) * t, cy: CO.y0 + 45, rx: 18 + 30 * Math.sin(Math.PI * t), ry: 34, fill: 'none', stroke: lit, 'stroke-width': 4, opacity: 0.8 * (1 - t) }, ripples);
    }
  }

  // 갈래마다 다른 '삐져나온 모양'. 서가 밖으로(옆·위로) 튀어나온다.
  function popShape(g, sl, genre, k) {
    const { cx, top, w, h } = sl;
    const piece = (x, y, ww, hh, extra = {}) => rect(g, x, y, ww, hh, { fill: C.paper, stroke: C.roof }, { 'stroke-width': 2, ...extra });
    const third = h / 3;
    switch (genre) {
      case 'saseol':   // 가운데 장만 엿가락처럼 늘어나 양옆으로 삐져나온다
        piece(cx - w / 2, top, w, third - 2);
        piece(cx - w / 2 - 70 * k, top + third, w + 140 * k, third - 2, { 'data-part': 'middle' });
        piece(cx - w / 2, top + 2 * third, w, third - 2);
        break;
      case 'sijo':     // 짧은 세 장이 한 덩이로 위로 빠지며 기운다
        for (let j = 0; j < 3; j++) piece(cx - w / 2, top - 60 * k + j * third * 0.75, w, third * 0.7, { transform: `rotate(${-12 * k} ${cx} ${top})` });
        break;
      case 'gasa':     // 끝없이 이어져 위로 길게 솟는다
        piece(cx - w / 2, top - 200 * k, w, h + 200 * k);
        break;
      case 'hyangga':  // 층이 쌓인 탑 모양으로 솟는다
        [1.5, 1.15, 0.8].forEach((f, j) => piece(cx - (w * f) / 2, top + h - (j + 1) * third - 90 * k, w * f, third - 2));
        break;
      case 'goryeo':   // 똑같은 연 덩이가 옆으로 줄지어 빠진다
        for (let j = 0; j < 4; j++) piece(cx - w / 2 + (j - 1.5) * (8 + 40 * k), top + h * 0.25 - 30 * k, w * 0.8, h * 0.45);
        break;
      default:
        piece(cx - w / 2, top - 70 * k, w, h);
    }
  }

  function drawPops() {
    pops.replaceChildren();
    for (const p of state.pops) {
      const g = node('g', { class: 'goryeo-pop', 'data-area': p.area, 'data-index': p.index, 'data-genre': p.genre ?? '' }, pops);
      popShape(g, slot2D(p.area, p.index), p.genre, popProgress(p));
    }
  }

  function drawFog() {
    fog.setAttribute('opacity', String(0.45 * state.fogLevel));
    fog.setAttribute('visibility', state.fogLevel > 0.001 ? 'visible' : 'hidden');
  }

  function repaint() {
    for (const [n, paint] of painted) applyPaint(n, paint);
  }

  function drawAll() {
    drawBooks();
    drawLinks();
    drawLamps();
    drawRipples();
    drawPops();
    drawFog();
  }
  drawAll();

  const offDancheong = onDancheong((id, v) => {
    if (id !== wingId) return;
    level = v;
    repaint();
    drawAll();
  });

  const pct = (x, y) => ({ x: Math.round((x / W) * 1000) / 10, y: Math.round((y / H) * 1000) / 10 });
  const anchors = {
    slots: L2.shelves.shelf.xs.map((x) => pct(x, 576)),
    bonus: L2.shelves.bonus.xs.map((x) => pct(x, 576)),
    basket: pct(BK.cx, BK.y),
    returnedShelf: pct(RS.cx, RS.y),
    roomDoor: pct(RD.cx, 306),
    entrance: pct(LE.cx, LE.y),
    nextDoor: pct(ND.cx, ND.y),
    // 추가 제안(T8): 떠다니는 노래 자리, 재기 화면 왼쪽 반이 비출 곳(그림 판 백분율 사각형)
    songs: L2.songs.map(([x, y]) => ({ x, y })),
    focus: { left: 0, top: 6, width: 78, height: 44 },
  };

  return {
    anchors,
    react(name, detail) {
      if (!applyEvent(state, name, detail)) return;
      advance(state, 0, reduce());
      drawAll();
    },
    update(dt) {
      if (advance(state, dt, reduce())) drawAll();
    },
    dispose() {
      offDancheong();
      svg.remove();
    },
  };
}
