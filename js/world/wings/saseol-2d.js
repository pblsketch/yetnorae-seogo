// 사설시조관 2D 그림 판 모형(spec 14). 3D와 같은 상태(saseol-model.js)를 SVG 한 장에 겹으로 그린다.
// 진짜 그림(board/saseol)이 오기 전까지는 이 SVG가 자리표시 그림이다. 그림이 오면 바탕으로 깔리고 반응 겹은 그대로 쓴다.
// 먹빛→단청은 세계 바탕이 그림 판에 거는 회색 거르개(--dancheong)가 맡는다. 여기서는 본래 색으로 그린다.
import { SONG_CATALOG } from '../../data/song-table.js';
import { wingById } from '../../data/wings.js';
import { TOKENS, mixHex } from '../palette.js';
import { STAIR_STEPS, createModel, lanternStorey, taffy, unrollReach } from './saseol-model.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1600;
const H = 900;
const pct = (x, y) => ({ x: (x / W) * 100, y: (y / H) * 100 });

// 배치(그림 판 좌표, 1600×900)
const SEAM = 580;        // 시조 정자라면 가운데 층이 끝났을 자리
const XE = 1560;         // 늘어난 층이 장터 가게 위에 얹힌 끝
const SX0 = 276;
const SX1 = 1540;
const PILLARS = [270, 370, 470, 570];
const SHELF = { cx: 420, y0: 480, y1: 610, top: 497 };
const BONUS = { cx: 912, y0: 500, y1: 610, top: 506 };
const SLOT_DX = 80;
const BOOK_W = 46;
const BASKET = { cx: 224, y: 790 };
const WALL_X = 1318;

function mid(x) {
  const s = x <= SEAM ? 0 : (x - SEAM) / (XE - SEAM);
  const t = taffy(s);
  return { yc: 290 + 85 * t.sag + 60 * t.drop, hh: 60 * t.thick };
}

let fogSerial = 0;

export function scrollEnd2D(feet) {
  const r = unrollReach(feet);
  return SX0 + r.within * (SEAM - SX0) + r.beyond * (SX1 - SEAM);
}

const slotX = (area, i) => (area === 'basket' ? BASKET.cx + (i - 0.5) * 50 : (area === 'shelf' ? SHELF.cx : BONUS.cx) + (i - 1) * SLOT_DX);

function node(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
}

function edgePath(from, to, f, step = 16) {
  const pts = [];
  for (let x = from; x < to; x += step) pts.push([x, f(x)]);
  pts.push([to, f(to)]);
  return pts;
}

const ptsAttr = (pts) => pts.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ');

// ── 바뀌지 않는 그림 ──
function drawStatic(svg) {
  const g = node('g', { class: 'saseol2d-static' }, svg);
  // 관 안 뒤 벽과 바닥, 벽 너머 장터
  node('rect', { x: 0, y: 0, width: W, height: 470, fill: TOKENS.hanji }, g);
  node('rect', { x: WALL_X, y: 0, width: W - WALL_X, height: 560, fill: mixHex(TOKENS.hanji, '#ffffff', 0.4) }, g);
  node('rect', { x: WALL_X, y: 560, width: W - WALL_X, height: 80, fill: mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.35) }, g);
  node('rect', { x: 0, y: 470, width: WALL_X, height: H - 470, fill: TOKENS.hanjiDeep }, g);
  node('rect', { x: WALL_X, y: 640, width: W - WALL_X, height: H - 640, fill: TOKENS.hanjiDeep }, g);
  for (let x = 40; x < W; x += 96) node('line', { x1: x, y1: 470, x2: x - 60, y2: H, stroke: TOKENS.hanji, 'stroke-width': 3 }, g);
  node('line', { x1: 0, y1: 470, x2: WALL_X, y2: 470, stroke: TOKENS.meokSoft, 'stroke-width': 5 }, g);

  // 작품 방 문(왼쪽)과 현판
  const room = node('g', { class: 'saseol2d-room-door' }, g);
  node('rect', { x: 48, y: 440, width: 104, height: 200, fill: TOKENS.meokSoft }, room);
  node('rect', { x: 30, y: 420, width: 18, height: 220, fill: TOKENS.juhong }, room);
  node('rect', { x: 152, y: 420, width: 18, height: 220, fill: TOKENS.juhong }, room);
  node('rect', { x: 22, y: 412, width: 156, height: 18, fill: TOKENS.nokcheong }, room);
  node('line', { x1: 100, y1: 440, x2: 100, y2: 640, stroke: TOKENS.meok, 'stroke-width': 3 }, room);
  node('rect', { x: 18, y: 362, width: 234, height: 42, fill: TOKENS.hanji, stroke: TOKENS.meok, 'stroke-width': 4 }, room);
  const title = node('text', { x: 135, y: 390, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: TOKENS.meok, style: 'font-family: var(--font-body)' }, room);
  title.textContent = '「' + (SONG_CATALOG['nimi-oma']?.title ?? '') + '」';

  // 정자: 지붕, 종장 층, 초장 층, 기단
  const pav = node('g', { class: 'saseol2d-pavilion' }, g);
  node('polygon', { points: '220,112 300,46 530,46 610,112', fill: TOKENS.meok }, pav);
  node('rect', { x: 262, y: 112, width: 316, height: 10, fill: TOKENS.nokcheong }, pav);
  for (const x of PILLARS) node('rect', { x: x - 7, y: 122, width: 14, height: 100, fill: TOKENS.juhong }, pav);
  node('rect', { x: 262, y: 200, width: 316, height: 4, fill: TOKENS.meokSoft }, pav);
  node('rect', { x: 240, y: 350, width: 360, height: 12, fill: TOKENS.meokSoft }, pav);
  for (const x of PILLARS) node('rect', { x: x - 8, y: 362, width: 16, height: 108, fill: TOKENS.juhong }, pav);
  node('rect', { x: 262, y: 362, width: 316, height: 10, fill: TOKENS.nokcheong }, pav);
  node('rect', { x: 262, y: 432, width: 316, height: 5, fill: TOKENS.meokSoft }, pav);
  node('rect', { x: 236, y: 462, width: 368, height: 16, fill: mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.5) }, pav);

  // 늘어난 가운데 층: 받침 기둥(관 안), 지붕 띠, 몸, 위 도리, 아래 인방
  const st = node('g', { class: 'saseol2d-stretched-storey' }, g);
  for (let x = 650; x < WALL_X - 20; x += 80) {
    const m = mid(x);
    node('line', { x1: x, y1: m.yc + m.hh, x2: x, y2: 470, stroke: TOKENS.juhong, 'stroke-width': 8 }, st);
  }
  const top = edgePath(262, XE, (x) => mid(x).yc - mid(x).hh);
  const bot = edgePath(262, XE, (x) => mid(x).yc + mid(x).hh);
  const eaveTop = edgePath(248, XE + 10, (x) => mid(Math.min(x, XE)).yc - mid(Math.min(x, XE)).hh - 16);
  node('polygon', { points: ptsAttr([...eaveTop, ...top.slice().reverse()]), fill: TOKENS.meok }, st);
  node('polygon', { points: ptsAttr([...top, ...bot.slice().reverse()]), fill: mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.3), stroke: TOKENS.meok, 'stroke-width': 3 }, st);
  // 창살: 늘어난 만큼 칸도 늘어지고 가늘어진다
  for (let x = 282; x < XE - 10; x += 26) {
    const m = mid(x);
    node('line', { x1: x, y1: m.yc - m.hh * 0.75, x2: x, y2: m.yc + m.hh * 0.75, stroke: TOKENS.meokSoft, 'stroke-width': 2, opacity: 0.6 }, st);
  }
  node('polyline', { points: ptsAttr(top.map(([x, y]) => [x, y + 5])), fill: 'none', stroke: TOKENS.nokcheong, 'stroke-width': 9 }, st);
  node('polyline', { points: ptsAttr(bot.map(([x, y]) => [x, y - 5])), fill: 'none', stroke: TOKENS.juhong, 'stroke-width': 8 }, st);
  // 4음보 경계(시조라면 여기서 끝났다)
  const sm = mid(SEAM);
  node('rect', { x: SEAM - 5, y: sm.yc - sm.hh - 8, width: 10, height: sm.hh * 2 + 16, fill: TOKENS.gold, class: 'saseol2d-seam' }, st);

  // 오른쪽 벽: 늘어난 층이 뚫고 나간 자리와 다음 관 문
  const wall = node('g', { class: 'saseol2d-wall' }, g);
  const wm = mid(WALL_X + 14);
  const wallC = mixHex(TOKENS.hanji, TOKENS.meokFog, 0.45);
  node('rect', { x: WALL_X, y: 150, width: 28, height: wm.yc - wm.hh - 172, fill: wallC }, wall);
  node('rect', { x: WALL_X - 6, y: 142, width: 40, height: 10, fill: TOKENS.meokSoft }, wall);
  node('rect', { x: WALL_X, y: wm.yc + wm.hh + 22, width: 28, height: 470 - (wm.yc + wm.hh + 22), fill: wallC }, wall);
  node('polygon', { points: `${WALL_X - 6},${wm.yc - wm.hh - 22} ${WALL_X + 34},${wm.yc - wm.hh - 22} ${WALL_X + 22},${wm.yc - wm.hh - 6} ${WALL_X + 8},${wm.yc - wm.hh - 14}`, fill: wallC }, wall);
  node('polygon', { points: `${WALL_X - 6},${wm.yc + wm.hh + 22} ${WALL_X + 34},${wm.yc + wm.hh + 22} ${WALL_X + 20},${wm.yc + wm.hh + 8} ${WALL_X + 6},${wm.yc + wm.hh + 14}`, fill: wallC }, wall);
  node('rect', { x: 1300, y: 470, width: 64, height: 170, fill: TOKENS.meok }, wall);
  node('rect', { x: 1292, y: 462, width: 14, height: 178, fill: TOKENS.juhong }, wall);
  node('rect', { x: 1358, y: 462, width: 14, height: 178, fill: TOKENS.juhong }, wall);
  node('rect', { x: 1286, y: 454, width: 92, height: 14, fill: TOKENS.nokcheong }, wall);

  // 장터: 늘어난 층 끝이 얹힌 가게, 차양 가게, 사람들, 팻말
  const mk = node('g', { class: 'saseol2d-market' }, g);
  const em = mid(XE - 20);
  for (const x of [1498, 1586]) node('rect', { x: x - 5, y: em.yc + em.hh, width: 10, height: 560 - (em.yc + em.hh), fill: TOKENS.meokSoft }, mk);
  node('rect', { x: 1486, y: 506, width: 110, height: 54, fill: TOKENS.hanjiDeep, stroke: TOKENS.meokSoft, 'stroke-width': 3 }, mk);
  [TOKENS.juhong, TOKENS.gold, TOKENS.nokcheong].forEach((c, i) => node('rect', { x: 1496 + i * 34, y: 488, width: 24, height: 20, rx: 6, fill: c }, mk));
  node('polygon', { points: '1358,488 1410,456 1462,488', fill: TOKENS.juhong }, mk);
  for (const x of [1366, 1454]) node('rect', { x: x - 3, y: 488, width: 6, height: 72, fill: TOKENS.meokSoft }, mk);
  node('rect', { x: 1362, y: 528, width: 96, height: 32, fill: TOKENS.hanjiDeep, stroke: TOKENS.meokSoft, 'stroke-width': 3 }, mk);
  [[1432, TOKENS.meokSoft], [1472, mixHex(TOKENS.meokSoft, TOKENS.nokcheong, 0.5)], [1392, mixHex(TOKENS.meokSoft, TOKENS.juhong, 0.4)]].forEach(([x, c], i) => {
    const y = 600 + (i % 2) * 18;
    node('rect', { x: x - 11, y: y - 44, width: 22, height: 44, rx: 6, fill: c }, mk);
    node('circle', { cx: x, cy: y - 54, r: 10, fill: TOKENS.hanjiDeep }, mk);
    node('rect', { x: x - 16, y: y - 66, width: 32, height: 4, fill: TOKENS.meok }, mk);
  });
  node('line', { x1: 1430, y1: 248, x2: 1430, y2: 300, stroke: TOKENS.meokSoft, 'stroke-width': 5 }, mk);
  node('rect', { x: 1382, y: 236, width: 96, height: 40, fill: TOKENS.hanji, stroke: TOKENS.meok, 'stroke-width': 4 }, mk);
  const sign = node('text', { x: 1430, y: 264, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 700, fill: TOKENS.meok, style: 'font-family: var(--font-body)' }, mk);
  sign.textContent = '장터';

  // 칸, 덤 칸, 돌아온 노래 선반의 틀
  const shelves = node('g', { class: 'saseol2d-shelves' }, g);
  for (const s of [SHELF, BONUS]) {
    node('rect', { x: s.cx - 120, y: s.y0, width: 240, height: s.y1 - s.y0, fill: TOKENS.meokSoft }, shelves);
    node('rect', { x: s.cx - 112, y: s.y0 + 8, width: 224, height: s.y1 - s.y0 - 16, fill: mixHex(TOKENS.meokSoft, TOKENS.meok, 0.4) }, shelves);
    for (const dx of [-SLOT_DX / 2, SLOT_DX / 2]) node('rect', { x: s.cx + dx - 3, y: s.y0 + 8, width: 6, height: s.y1 - s.y0 - 16, fill: TOKENS.meokSoft }, shelves);
  }
  const plate = (x, y, w, text) => {
    node('rect', { x: x - w / 2, y, width: w, height: 32, fill: TOKENS.hanji, stroke: TOKENS.meok, 'stroke-width': 3 }, shelves);
    const t = node('text', { x, y: y + 23, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: TOKENS.meok, style: 'font-family: var(--font-body)' }, shelves);
    t.textContent = text;
  };
  plate(BONUS.cx, 462, 80, '덤');
  node('rect', { x: 1060, y: 548, width: 120, height: 62, fill: TOKENS.meokSoft }, shelves);
  node('rect', { x: 1068, y: 556, width: 104, height: 46, fill: mixHex(TOKENS.meokSoft, TOKENS.meok, 0.4) }, shelves);
  plate(1120, 508, 150, '돌아온 노래');

  // 바구니, 기다리는 노래의 서안
  node('ellipse', { cx: BASKET.cx, cy: 800, rx: 76, ry: 20, fill: mixHex(TOKENS.hanjiDeep, TOKENS.gold, 0.45), stroke: TOKENS.meokSoft, 'stroke-width': 3 }, g);
  node('rect', { x: BASKET.cx - 76, y: 760, width: 152, height: 40, fill: mixHex(TOKENS.hanjiDeep, TOKENS.gold, 0.35), stroke: TOKENS.meokSoft, 'stroke-width': 3 }, g);
  node('ellipse', { cx: BASKET.cx, cy: 760, rx: 76, ry: 16, fill: mixHex(TOKENS.hanjiDeep, TOKENS.meokSoft, 0.4), stroke: TOKENS.meokSoft, 'stroke-width': 3 }, g);
  node('rect', { x: 628, y: 700, width: 88, height: 10, fill: TOKENS.meokSoft }, g);
  node('rect', { x: 636, y: 710, width: 10, height: 40, fill: TOKENS.meokSoft }, g);
  node('rect', { x: 698, y: 710, width: 10, height: 40, fill: TOKENS.meokSoft }, g);
}

export function create2D(ctx) {
  const reduce = () => !!ctx.reduceMotion?.();
  const model = createModel({ fog: !ctx.restored });
  const S = model.state;

  const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'saseol2d', 'aria-hidden': 'true', focusable: 'false' });
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  ctx.container.append(svg);
  // 진짜 그림이 있으면 바탕 그림을 세계 바탕이 깔므로, 자리표시 바탕은 그리지 않고 반응 겹만 둔다.
  if (!ctx.assets?.image?.('board/saseol')) drawStatic(svg);

  const live = node('g', { class: 'saseol2d-live' }, svg);
  const stairsG = node('g', { class: 'saseol2d-stairs' }, live);
  const stairs = Array.from({ length: STAIR_STEPS }, (_, k) => node('rect', { x: 196 + k * 20, y: 318 - k * 42, width: 64 - k * 20, height: 30, stroke: TOKENS.meok, 'stroke-width': 3 }, stairsG));

  const scrollG = node('g', { class: 'saseol2d-scroll-group' }, live);
  const scroll = node('polygon', { class: 'saseol2d-scroll', fill: mixHex(TOKENS.hanji, '#ffffff', 0.5), stroke: TOKENS.meok, 'stroke-width': 2.5 }, scrollG);
  const script = node('path', { fill: 'none', stroke: TOKENS.meok, 'stroke-width': 3, opacity: 0.7 }, scrollG);
  const ticks = node('path', { fill: 'none', stroke: TOKENS.meok, 'stroke-width': 2 }, scrollG);
  const four = node('line', { stroke: TOKENS.juhong, 'stroke-width': 6 }, scrollG);
  const rollerA = node('rect', { fill: TOKENS.meokSoft, rx: 4 }, scrollG);
  const rollerB = node('rect', { fill: TOKENS.meokSoft, rx: 4, class: 'saseol2d-roller' }, scrollG);

  const lanternG = node('g', { class: 'saseol2d-lanterns' }, live);
  const lanternXY = [];
  for (const x of PILLARS) lanternXY.push([x, 380]);
  for (let i = 0; i < 4; i++) { const x = 300 + i * 80; const m = mid(x); lanternXY.push([x, m.yc - m.hh + 16]); }
  for (let k = 0; k < 12; k++) { const x = 640 + k * (860 / 11); const m = mid(x); lanternXY.push([x, m.yc - m.hh + 14]); }
  for (const x of PILLARS) lanternXY.push([x, 140]);
  const lanterns = lanternXY.map(([cx, cy]) => node('circle', { cx, cy, r: 10, stroke: TOKENS.meok, 'stroke-width': 2, class: 'saseol2d-lantern' }, lanternG));

  const booksG = node('g', { class: 'saseol2d-books' }, live);
  const fogG = node('g', { class: 'saseol2d-fog' }, live);
  const FOG = [[900, 300, 380, 130], [1250, 260, 280, 140], [1460, 380, 220, 150], [520, 180, 320, 120], [980, 540, 350, 90], [300, 560, 280, 80]];
  // 가장자리가 흐린 먹안개(그림 판마다 다른 id)
  const fogId = 'saseol2d-fog-' + (++fogSerial);
  const grad = node('radialGradient', { id: fogId }, node('defs', {}, svg));
  node('stop', { offset: '0%', 'stop-color': TOKENS.meokFog, 'stop-opacity': 1 }, grad);
  node('stop', { offset: '60%', 'stop-color': TOKENS.meokFog, 'stop-opacity': 0.7 }, grad);
  node('stop', { offset: '100%', 'stop-color': TOKENS.meokFog, 'stop-opacity': 0 }, grad);
  FOG.forEach(([cx, cy, rx, ry]) => node('ellipse', { cx, cy, rx, ry, fill: `url(#${fogId})` }, fogG));

  function drawStairs() {
    stairs.forEach((r, k) => r.setAttribute('fill', k < S.stairs ? TOKENS.gold : TOKENS.meokSoft));
  }

  function drawLanterns() {
    const lit = mixHex(TOKENS.gold, TOKENS.hanji, 0.3);
    lanterns.forEach((c, i) => {
      const f = S.flash[lanternStorey(i)];
      const base = S.lanterns[i] ? lit : TOKENS.meokSoft;
      c.setAttribute('fill', f > 0 ? mixHex(base, TOKENS.hanji, Math.min(1, f / 0.45)) : base);
      c.dataset.lit = S.lanterns[i] ? '1' : '0';
    });
  }

  function drawScroll() {
    const feet = S.feetShown;
    const end = scrollEnd2D(feet);
    const on = feet > 0.01;
    scrollG.setAttribute('visibility', on ? 'visible' : 'hidden');
    const half = (x) => Math.max(14, 0.7 * mid(x).hh);
    const top = edgePath(SX0, end, (x) => mid(x).yc - half(x), 12);
    const bot = edgePath(SX0, end, (x) => mid(x).yc + half(x), 12);
    scroll.setAttribute('points', ptsAttr([...top, ...bot.reverse()]));
    scroll.dataset.length = (end - SX0).toFixed(1);
    scroll.dataset.endX = end.toFixed(1);
    let d = '';
    let seed = 11;
    for (let x = SX0 + 8; x < end - 6; x += 11) {
      seed = (seed * 9301 + 49297) % 233280;
      const m = mid(x);
      const h = half(x) * (0.35 + 0.5 * (seed / 233280));
      d += `M${x.toFixed(1)} ${(m.yc - h).toFixed(1)}V${(m.yc + h).toFixed(1)}`;
    }
    script.setAttribute('d', d);
    let t = '';
    for (let f = 1; f <= Math.floor(feet + 1e-6); f++) {
      const x = scrollEnd2D(f);
      const m = mid(x);
      t += `M${x.toFixed(1)} ${(m.yc - half(x)).toFixed(1)}V${(m.yc + half(x)).toFixed(1)}`;
    }
    ticks.setAttribute('d', t);
    const fx = scrollEnd2D(4);
    const fm = mid(fx);
    four.setAttribute('visibility', feet >= 4 ? 'visible' : 'hidden');
    Object.entries({ x1: fx, x2: fx, y1: fm.yc - half(fx) - 6, y2: fm.yc + half(fx) + 6 }).forEach(([k, v]) => four.setAttribute(k, v.toFixed(1)));
    const roller = (r, x, k) => {
      const m = mid(x);
      const h = half(x) * 2 + 24;
      const w = 12 * k;
      r.setAttribute('x', (x - w / 2).toFixed(1));
      r.setAttribute('y', (m.yc - h / 2).toFixed(1));
      r.setAttribute('width', w.toFixed(1));
      r.setAttribute('height', h.toFixed(1));
    };
    roller(rollerA, SX0, 1);
    roller(rollerB, end, 1 + 0.8 * S.unrollPulse);
    svg.dataset.feet = feet.toFixed(2);
  }

  function drawBooks() {
    booksG.replaceChildren();
    for (const [area, s] of [['shelf', SHELF], ['bonus', BONUS]]) {
      const h = s.y1 - 10 - s.top;
      for (let i = 0; i < 3; i++) {
        const x = slotX(area, i);
        const slot = S.slots[area][i];
        if (S.pops.has(area + ':' + i)) continue;
        const bound = S.bound[area];
        const fill = bound ? TOKENS.meok : slot ? TOKENS.nokcheong : TOKENS.hanji;
        const r = node('rect', { x: x - BOOK_W / 2, y: s.top, width: BOOK_W, height: h, rx: 3, fill, stroke: TOKENS.meokSoft, 'stroke-width': 2, class: 'saseol2d-book', 'data-area': area, 'data-index': i, 'data-state': bound ? 'bound' : slot ? 'placed' : 'empty' }, booksG);
        if (!slot && !bound) r.setAttribute('stroke-dasharray', '6 4');   // 제목 없는 빈 책등
        if (bound) {
          const title = SONG_CATALOG[S.boundIds[area][i]]?.title ?? '';
          const chars = [...title.replace(/\s+/g, '')];
          const size = Math.min(18, Math.floor((h - 10) / Math.max(1, chars.length)));
          chars.forEach((ch, k) => {
            const t = node('text', { x, y: s.top + 6 + size * (k + 0.85), 'text-anchor': 'middle', 'font-size': size, fill: TOKENS.hanji, style: 'font-family: var(--font-body)', class: 'saseol2d-title' }, booksG);
            t.textContent = ch;
          });
        }
      }
      if (S.bound[area]) {
        for (const k of [0.3, 0.7]) node('line', { x1: s.cx - 112, x2: s.cx + 112, y1: s.top + h * k, y2: s.top + h * k, stroke: TOKENS.hanjiDeep, 'stroke-width': 3, class: 'saseol2d-thread' }, booksG);
        node('rect', { x: s.cx - 114, y: s.top - 12, width: 228, height: 9, fill: TOKENS.gold, class: 'saseol2d-gold' }, booksG);
      }
    }
    for (let i = 0; i < 2; i++) {
      const slot = S.slots.basket[i];
      if (!slot || S.pops.has('basket:' + i)) continue;
      const x = slotX('basket', i);
      node('rect', { x: x - 9, y: 712, width: 18, height: 58, rx: 8, fill: TOKENS.hanji, stroke: TOKENS.meokSoft, 'stroke-width': 2, class: 'saseol2d-basket-song' }, booksG);
      const name = slot.to ? wingById(slot.to)?.name : null;
      if (name) {
        node('rect', { x: x + 6, y: 716, width: 22 + name.length * 13, height: 22, fill: TOKENS.nokcheong }, booksG);
        const t = node('text', { x: x + 17, y: 732, 'font-size': 13, fill: TOKENS.hanji, style: 'font-family: var(--font-ui)' }, booksG);
        t.textContent = name;
      }
    }
    // 삐져나온 노래: 갈래의 모양대로 마디가 튀어나온다
    for (const p of S.pops.values()) {
      const basket = p.area === 'basket';
      const x = slotX(p.area, p.index);
      const base = basket ? 772 : (p.area === 'shelf' ? SHELF : BONUS).y1 - 10;
      const lift = (basket ? 70 : 26) * p.t;
      const g = node('g', { class: 'saseol2d-pop', 'data-area': p.area, 'data-index': p.index, 'data-genre': p.genre ?? '' }, booksG);
      let y = base - lift;
      const widths = [];
      for (const seg of p.shape) {
        const h = seg.h * 33;
        const w = BOOK_W * (1 + (seg.d - 1) * p.t) + (seg.ring ? 10 : 0);
        widths.push(+w.toFixed(1));
        y -= h;
        node('rect', { x: x - w / 2, y, width: w, height: h - 2, rx: 3, fill: seg.ring ? TOKENS.gold : seg.long ? TOKENS.juhong : TOKENS.hanji, stroke: TOKENS.meok, 'stroke-width': 2 }, g);
      }
      g.dataset.widths = widths.join(',');
    }
  }

  function drawFog() {
    fogG.setAttribute('opacity', (0.7 * S.fogShown).toFixed(3));
    fogG.setAttribute('visibility', S.fogShown > 0.01 ? 'visible' : 'hidden');
  }

  let drawnBooks = -1;
  function drawAll() {
    drawStairs();
    drawLanterns();
    drawScroll();
    if (drawnBooks !== S.version || S.pops.size) { drawBooks(); drawnBooks = S.version; }
    drawFog();
  }
  drawAll();

  const anchors = {
    slots: [0, 1, 2].map((i) => pct(slotX('shelf', i), 630)),
    bonus: [0, 1, 2].map((i) => pct(slotX('bonus', i), 634)),
    basket: pct(BASKET.cx, 826),
    returnedShelf: pct(1120, 640),
    roomDoor: pct(100, 540),
    entrance: pct(672, 776),
    nextDoor: pct(1344, 560),
  };

  return {
    anchors,
    // 추가 제안(T11): 떠도는 노래가 머무는 곳(다섯, 연결 결정 F2), 재기 화면 왼쪽 반이 바라볼 곳(늘어난 층 한가운데)
    spots: {
      floatingSongs: [pct(700, 600), pct(416, 738), pct(576, 666), pct(864, 756), pct(1056, 720)],
      measureFocus: pct(1000, mid(1000).yc),
    },
    react(name, detail) {
      if (!model.apply(name, detail)) return;
      if (reduce()) model.step(0, true);
      drawAll();
    },
    update(dt) {
      if (model.step(dt, reduce())) drawAll();
    },
    dispose() {
      svg.remove();
    },
  };
}
