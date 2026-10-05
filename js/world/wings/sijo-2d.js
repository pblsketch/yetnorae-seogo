// 시조관 2D 그림 판(spec 14). 3D 모형과 같은 상태(sijo-model.js)를 SVG 겹 그림으로 그린다.
// 그림 자산(board/sijo)이 오기 전까지 쓰는 자리표시 그림이다. 자산이 오면 벽과 바닥은 그 그림에 맡기고 나머지를 겹친다.
// 좌표는 그림 판 백분율(x 0~100, y 0~100)이고, SVG 보기 상자는 1600×900(16:9)이다.
import { TOKENS, dancheongColor, getDancheong, mixHex, onDancheong } from '../palette.js';
import {
  BINDABLE, FEET, FINAL_STEPS, MAX_STEPS, MENTOR_LABEL, ROOM_LABEL, STOREYS, createSijoModel,
} from './sijo-model.js';

const NS = 'http://www.w3.org/2000/svg';
const X = (x) => x * 16;
const Y = (y) => y * 9;

// ── 배치(백분율) ──
const GROUND = 66;
const F = [55, 42, 29];                    // 초장·중장·종장 마루
const SH = 13;                             // 층 높이
const PAV = { x0: 22, x1: 48 };
const PILLAR_X = [23.5, 31.2, 38.8, 46.5];
const ST = { x0: 51, x1: 66, lx0: 48, rx1: 70 };
const RUN = ST.x1 - ST.x0;
const MERGE = 0.39;                        // 묶일 때 책 사이 간격 비율

const C = {
  wall: TOKENS.hanji,
  floor: mixHex(TOKENS.hanjiDeep, TOKENS.meokSoft, 0.25),
  wood: mixHex(TOKENS.meokSoft, TOKENS.gold, 0.35),
  slab: mixHex(TOKENS.hanjiDeep, TOKENS.meokSoft, 0.45),
  roof: mixHex(TOKENS.meok, TOKENS.nokcheong, 0.25),
  eave: mixHex(TOKENS.meok, TOKENS.nokcheong, 0.45),
  pillar: TOKENS.juhong,
  beam: TOKENS.nokcheong,
  step: mixHex(TOKENS.meokSoft, TOKENS.hanjiDeep, 0.35),
  stepBack: mixHex(TOKENS.meokSoft, TOKENS.hanjiDeep, 0.6),
  finalStep: TOKENS.juhong,
  shelf: mixHex(TOKENS.meokSoft, TOKENS.gold, 0.2),
  plate: TOKENS.nokcheong,
  basket: mixHex(TOKENS.gold, TOKENS.hanjiDeep, 0.45),
  cushion: mixHex(TOKENS.juhong, TOKENS.hanjiDeep, 0.5),
  door: TOKENS.meok,
  doorFrame: TOKENS.juhong,
  lintel: TOKENS.nokcheong,
  blank: TOKENS.hanji,
  book: TOKENS.meokSoft,
  stick: TOKENS.juhong,
  gold: TOKENS.gold,
  thread: TOKENS.juhong,
  tag: TOKENS.hanji,
};
const LIT = mixHex(TOKENS.gold, TOKENS.hanji, 0.45);
const GHOST_LIT = TOKENS.hanji;
const HINT = 0.45;   // 종장 첫 계단과 삐져나온 부분은 먹빛에서도 이만큼 색이 남는다

// 자리: 가운데(cx, cy), 높이 축 hA와 크기 H(%), 서가 밖 축 dA와 1m당 크기 D(%)
const HOLDERS = [
  ...[26.3, 35, 43.7].map((cx, index) => ({ area: 'shelf', index, cx, cy: 74.5, hA: [0, -1], H: 11, dA: [1, 0], D: 6.4 })),
  ...[3.5, 11, 18.5].map((cx, index) => ({ area: 'bonus', index, cx, cy: 53, hA: [0, -1], H: 10, dA: [1, 0], D: 6 })),
  ...[59.5, 64.5].map((cx, index) => ({ area: 'basket', index, cx, cy: 86.2, hA: [1, 0], H: 4, dA: [0, -1], D: 3.4 })),
  { area: 'mentor', index: 0, cx: 38, cy: 23.3, hA: [0, -1], H: 5, dA: [1, 0], D: 3.4 },
  ...[82, 85, 88, 91].map((cx, index) => ({ area: 'returned', index, cx, cy: 55.5, hA: [0, -1], H: 9, dA: [1, 0], D: 4.4 })),
];

export function create2D(ctx) {
  const wingId = ctx.wing?.id ?? 'sijo';
  const reduce = () => !!ctx.reduceMotion?.();
  let level = ctx.restored ? 1 : getDancheong(wingId);
  const model = createSijoModel({ restored: ctx.restored || level >= 1 });
  const ink = (hex) => dancheongColor(hex, level);
  const hint = (hex) => dancheongColor(hex, Math.max(level, HINT));

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1600 900');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'wing-sijo-art');
  svg.dataset.wing = wingId;
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  const fontFamily = 'var(--font-body)';

  function el(tag, attrs = {}, parent = svg) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    parent.append(e);
    return e;
  }
  // 칠할 부분을 적어 두고 단청 값이 바뀌면 다시 칠한다
  const painted = [];
  function rect(x0, y0, x1, y1, color, parent = svg, extra = {}) {
    const r = el('rect', { x: X(Math.min(x0, x1)), y: Y(Math.min(y0, y1)), width: X(Math.abs(x1 - x0)), height: Y(Math.abs(y1 - y0)), ...extra }, parent);
    if (color) painted.push([r, color]);
    return r;
  }
  function text(str, x, y, size, parent = svg, attrs = {}) {
    const t = el('text', { x: X(x), y: Y(y), 'font-size': size, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: TOKENS.meok, 'font-weight': 700, ...attrs }, parent);
    t.style.fontFamily = fontFamily;
    t.textContent = str;
    return t;
  }
  function plaque(str, cx, cy, w, h, size, parent = svg) {
    const g = el('g', { 'data-part': 'plaque' }, parent);
    rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, null, g, { fill: TOKENS.hanji, stroke: TOKENS.meok, 'stroke-width': 3 });
    text(str, cx, cy, size, g);
    return g;
  }

  // ── 바탕: 벽과 바닥 ──
  const bgImage = ctx.assets?.image?.('board/' + wingId) ?? null;
  if (!bgImage) {
    rect(0, 0, 100, 64, C.wall);
    for (let x = 8; x < 100; x += 12) rect(x, 0, x + 0.3, 64, C.wood, svg, { opacity: 0.5 });
    rect(0, 63, 100, 64.5, C.wood);
    rect(0, 64.5, 100, 100, C.floor);
  }

  // ── 정자 ──
  const pav = el('g', { 'data-part': 'pavilion' });
  for (const x of PILLAR_X) rect(x - 0.4, F[0], x + 0.4, GROUND, C.wood, pav);
  const pillarEls = [];
  const beamEls = [];
  F.forEach((f, s) => {
    const top = f - SH;
    if (s === 2) rect(PAV.x0 - 1, top - 0.6, PAV.x1 + 1, top + 0.4, C.wood, pav);
    PILLAR_X.forEach((x, c) => {
      const p = rect(x - 0.55, top + 1.5, x + 0.55, f, C.pillar, pav, { 'data-part': 'pillar', 'data-storey': s, 'data-foot': c });
      pillarEls[s * FEET + c] = p;
    });
    rect(PAV.x0 + 0.5, f - 3, PAV.x1 - 0.5, f - 2.6, C.wood, pav);                    // 난간대
    rect(PAV.x0 - 0.5, f, PAV.x1 + 0.5, f + 1.4, C.slab, pav);                        // 마루
    if (s > 0) rect(PAV.x0 - 2, f + 1.4, PAV.x1 + 2, f + 2.3, C.eave, pav);          // 아래층 처마판
    beamEls[s] = rect(PAV.x0 + 0.5, top + 0.2, PAV.x1 - 0.5, top + 1.7, C.beam, pav, { 'data-part': 'beam', 'data-storey': s });
    plaque(STOREYS[s], 35, top + 3.4, 6, 2.6, 22, pav).dataset.storey = String(s);
  });
  const roof = el('polygon', { points: [[PAV.x0 - 3, F[2] - SH - 0.6], [PAV.x1 + 3, F[2] - SH - 0.6], [PAV.x1 - 5, 5], [PAV.x0 + 5, 5]].map(([x, y]) => X(x) + ',' + Y(y)).join(' ') }, pav);
  painted.push([roof, C.roof]);
  // 선대 사서의 자리(종장 안): 방석과 서안
  rect(29.5, F[2] - 1.2, 34, F[2], C.cushion, pav);
  rect(34, F[2] - 3.4, 42, F[2], C.wood, pav);
  text(MENTOR_LABEL, 38, F[2] - 1.7, 13, pav, { fill: TOKENS.hanji });

  // ── 계단탑: 층마다 계단참 둘 ──
  const stairs = el('g', { 'data-part': 'stairs' });
  const finalEls = [];
  const ghostEls = [];
  F.forEach((f, s) => {
    const y0 = s === 0 ? GROUND : F[s - 1];
    const mid = (y0 + f) / 2;
    // 뒷줄(위로 꺾여 돌아오는 계단)을 먼저 그린다
    for (let k = 0; k < 4; k++) {
      const w = RUN / 4;
      const t = mid - (k + 1) * (mid - f) / 4;
      rect(ST.x1 - (k + 1) * w, t, ST.x1 - k * w, t + (mid - f) / 4 + 0.8, C.stepBack, stairs);
    }
    const n = s === 2 ? FINAL_STEPS : 4;
    for (let k = 0; k < n; k++) {
      const w = RUN / n;
      const t = y0 - (k + 1) * (y0 - mid) / n;
      const r = rect(ST.x0 + k * w, t, ST.x0 + (k + 1) * w, t + (y0 - mid) / n + 0.8, s === 2 ? null : C.step, stairs, { stroke: TOKENS.meok, 'stroke-width': 2 });
      if (s === 2) { r.dataset.part = 'final-step'; r.dataset.step = String(k + 1); finalEls[k] = r; }
    }
    rect(ST.x1, mid, ST.rx1, mid + 1.2, C.slab, stairs).dataset.part = 'landing';
    rect(ST.lx0, f, ST.x0, f + 1.2, C.slab, stairs).dataset.part = 'landing';
  });
  rect(ST.rx1 - 0.6, (F[1] + F[2]) / 2 + 1.2, ST.rx1 - 0.1, GROUND, C.wood, stairs);   // 오른쪽 계단참 기둥
  rect(ST.lx0, F[2] + 1.2, ST.lx0 + 0.5, GROUND, C.wood, stairs);
  {
    const w = RUN / FINAL_STEPS;
    const mid = (F[1] + F[2]) / 2;
    const h = (F[1] - mid) / FINAL_STEPS;
    for (let k = FINAL_STEPS; k < MAX_STEPS; k++) {
      const t = F[1] - (k + 1) * h;
      const r = rect(ST.x0 + k * w + 0.25, t, ST.x0 + (k + 1) * w - 0.25, t + h + 0.8, null, stairs, { fill: GHOST_LIT, stroke: TOKENS.meokSoft, 'stroke-width': 3, 'stroke-dasharray': '10 6', 'data-part': 'ghost-step', 'data-step': k + 1 });
      ghostEls[k] = r;
    }
  }
  const lanternEl = el('circle', { r: 13, fill: LIT, stroke: TOKENS.meok, 'stroke-width': 3, 'data-part': 'lantern' }, stairs);

  // ── 칸(서가 셋), 덤 칸, 돌아온 노래 선반, 바구니 ──
  const furn = el('g', { 'data-part': 'furniture' });
  function shelfFrame(x0, x1, y0, y1, plates, area) {
    const g = el('g', { 'data-part': 'shelf-frame', 'data-area': area }, furn);
    rect(x0, y0, x1, y1, C.shelf, g, { opacity: 0.35 });
    rect(x0, y0, x1, y0 + 1, C.shelf, g);
    rect(x0, y1 - 1, x1, y1, C.shelf, g);
    rect(x0, y0, x0 + 0.6, y1, C.shelf, g);
    rect(x1 - 0.6, y0, x1, y1, C.shelf, g);
    for (const x of plates) rect(x - 1.8, y1 - 1.6, x + 1.8, y1 - 1, C.plate, g);
  }
  shelfFrame(PAV.x0, PAV.x1, 67, 82, [26.3, 35, 43.7], 'shelf');
  shelfFrame(0.5, 21, 46.5, 60, [3.5, 11, 18.5], 'bonus');
  shelfFrame(80, 93, 49.5, 61.5, [], 'returned');
  rect(56, 85.5, 68, 91.5, C.basket, furn, { rx: 14 });
  rect(56, 85.5, 68, 86.5, C.wood, furn);
  // 작품 방 문 「십 년을 경영하야」
  const doorG = el('g', { 'data-part': 'room-door' }, furn);
  rect(72.5, 43, 78.5, 64, C.door, doorG);
  rect(71.8, 42.5, 72.6, 64, C.doorFrame, doorG);
  rect(78.4, 42.5, 79.2, 64, C.doorFrame, doorG);
  rect(71.5, 41.8, 79.5, 43, C.lintel, doorG);
  plaque(ROOM_LABEL, 75.5, 39.6, 14, 3, 21, doorG);
  // 다음 관 문
  const nextG = el('g', { 'data-part': 'next-door' }, furn);
  rect(95.3, 44, 99.3, 64, C.door, nextG);
  rect(94.8, 43.5, 95.5, 64, C.doorFrame, nextG);
  rect(99.1, 43.5, 99.8, 64, C.doorFrame, nextG);
  rect(94.6, 42.6, 100, 43.8, C.lintel, nextG);
  // 미리 잰 노래가 기다리는 서안
  rect(41.5, 88.5, 46.5, 89.5, C.shelf, furn);
  rect(42.3, 89.5, 45.7, 93.5, C.wood, furn);

  // ── 책 자리 ──
  const books = el('g', { 'data-part': 'books' });
  const SEG_MAX = 8;
  for (const h of HOLDERS) {
    h.g = el('g', { 'data-area': h.area, 'data-index': h.index, 'data-state': 'blank' }, books);
    h.rects = Array.from({ length: SEG_MAX }, () => el('rect', { 'stroke-width': 2 }, h.g));
    if (h.area !== 'basket') {
      h.title = el('text', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: TOKENS.gold, 'data-part': 'title' }, h.g);
      h.title.style.fontFamily = fontFamily;
      h.title.style.writingMode = 'vertical-rl';
    } else {
      h.tag = text('', h.cx, 94.5, 15, h.g, { 'data-part': 'tag' });
    }
  }
  const threadEls = BINDABLE.map((area) => [0, 1].map(() => el('rect', { 'data-part': 'thread', 'data-area': area }, books)));

  // ── 먹안개 ──
  const fogG = el('g', { 'data-part': 'fog' });
  const fogSpots = [[14, 86, 16, 5], [38, 95, 20, 4.5], [64, 76, 14, 4], [86, 90, 15, 5], [8, 70, 12, 4], [50, 70, 10, 3.5], [78, 70, 12, 3.5]];
  const fogEls = fogSpots.map(() => el('ellipse', { fill: TOKENS.meokFog }, fogG));

  ctx.container.append(svg);

  // ── 다시 그리기 ──
  function holderPos(h) {
    let cx = h.cx;
    let cy = h.cy;
    const p = BINDABLE.includes(h.area) ? model.bindProgress(h.area, reduce()) : 0;
    if (p > 0) {
      const mid = HOLDERS.find((o) => o.area === h.area && o.index === 1);
      cx = mid.cx + (cx - mid.cx) * (1 + (MERGE - 1) * p);
    }
    const st = model.state.holders[h.area][h.index];
    if (h.area === 'basket' && st.pop) cy -= 5 * (reduce() ? 1 : Math.min(1, st.pop.p));
    return { cx, cy };
  }

  function segRect(h, pos, sg) {
    const pts = [];
    for (const y of sg.y) for (const z of sg.z) {
      pts.push([pos.cx + h.hA[0] * (y - 0.5) * h.H + h.dA[0] * z * h.D, pos.cy + h.hA[1] * (y - 0.5) * h.H + h.dA[1] * z * h.D]);
    }
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }

  function setRect(r, b, attrs) {
    r.setAttribute('x', X(b.x0));
    r.setAttribute('y', Y(b.y0));
    r.setAttribute('width', Math.max(0, X(b.x1 - b.x0)));
    r.setAttribute('height', Math.max(0, Y(b.y1 - b.y0)));
    for (const [k, v] of Object.entries(attrs)) r.setAttribute(k, v);
  }

  function refreshBooks() {
    const r = reduce();
    const mentorGlow = model.mentorGlow(r);
    for (const h of HOLDERS) {
      const segs = model.segmentsOf(h.area, h.index, r);
      const pos = holderPos(h);
      h.g.dataset.state = model.holderState(h.area, h.index);
      const pop = model.state.holders[h.area][h.index].pop;
      if (pop) h.g.dataset.genre = pop.genre; else delete h.g.dataset.genre;
      h.rects.forEach((rr, k) => {
        const sg = segs[k];
        if (!sg) { rr.setAttribute('display', 'none'); return; }
        rr.removeAttribute('display');
        let b = segRect(h, pos, sg);
        if (sg.kind === 'gold') {
          // 금박은 책등 가운데에 세로로 찍는다
          const face = segRect(h, pos, { y: sg.y, z: [-0.25, 0.25] });
          const cx = (face.x0 + face.x1) / 2;
          b = { x0: cx - 0.3, x1: cx + 0.3, y0: face.y0, y1: face.y1 };
        }
        const fill = { blank: ink(C.blank), book: ink(C.book), stick: hint(C.stick), gold: C.gold, tag: ink(C.tag) }[sg.kind] ?? ink(C.book);
        const glow = h.area === 'mentor' && sg.kind !== 'blank' && mentorGlow > 0 ? mixHex(fill, LIT, mentorGlow * 0.7) : fill;
        setRect(rr, b, {
          fill: glow,
          stroke: sg.kind === 'gold' ? 'none' : TOKENS.meok,
          'stroke-dasharray': sg.kind === 'blank' ? '8 6' : 'none',
          'data-kind': sg.kind,
        });
      });
      if (h.title) {
        const t = model.titleOf(h.area, h.index);
        h.title.textContent = t ?? '';
        if (t) {
          const face = segRect(h, pos, { y: [0.06, 0.94], z: [-0.25, 0.25] });
          h.title.setAttribute('x', X((face.x0 + face.x1) / 2));
          h.title.setAttribute('y', Y((face.y0 + face.y1) / 2));   // 세로쓰기에서 text-anchor middle은 세로 가운데
          h.title.setAttribute('textLength', Y(face.y1 - face.y0));
          h.title.setAttribute('lengthAdjust', 'spacingAndGlyphs');
          h.title.setAttribute('font-size', h.area === 'mentor' ? 13 : 18);
        }
      }
      if (h.tag) h.tag.textContent = model.basketTag(h.index) ?? '';
    }
    BINDABLE.forEach((area, a) => {
      const p = model.bindProgress(area, r);
      const row = HOLDERS.filter((o) => o.area === area);
      const mid = row[1];
      const left = holderPos(row[0]).cx;
      const right = holderPos(row[2]).cx;
      // 모인 세 권을 감는 길이(자라면서 감긴다)
      const half = ((right - left) / 2 + mid.D * 0.25 + 0.5) * p;
      threadEls[a].forEach((rr, t) => {
        if (p <= 0) { rr.setAttribute('display', 'none'); return; }
        rr.removeAttribute('display');
        const y = mid.cy + (t === 0 ? 0.2 : -0.2) * mid.H;
        setRect(rr, { x0: mid.cx - half, x1: mid.cx + half, y0: y - 0.4, y1: y + 0.4 }, { fill: ink(C.thread) });
      });
    });
  }

  function refreshReactive() {
    const r = reduce();
    pillarEls.forEach((p, i) => {
      const glow = model.pillarGlow(i, r);
      p.setAttribute('fill', mixHex(ink(C.pillar), LIT, glow));
      p.dataset.lit = glow > 0 ? '1' : '0';
    });
    beamEls.forEach((b, s) => b.setAttribute('fill', mixHex(ink(C.beam), LIT, model.beamGlow(s, r))));
    finalEls.forEach((e, k) => {
      const lit = model.stepState(k) === 'lit';
      e.setAttribute('fill', lit ? LIT : hint(C.finalStep));
      e.dataset.lit = lit ? '1' : '0';
    });
    for (let k = FINAL_STEPS; k < MAX_STEPS; k++) {
      const vis = model.stepState(k) !== 'hidden';
      if (vis) ghostEls[k].removeAttribute('display'); else ghostEls[k].setAttribute('display', 'none');
      ghostEls[k].dataset.lit = vis ? '1' : '0';
    }
    const lan = model.lantern(r);
    if (lan) {
      const e = lan.step < FINAL_STEPS ? finalEls[lan.step] : ghostEls[lan.step];
      const x = Number(e.getAttribute('x')) + Number(e.getAttribute('width')) / 2;
      const y = Number(e.getAttribute('y')) - 14 - 28 * lan.hop;
      lanternEl.setAttribute('cx', x);
      lanternEl.setAttribute('cy', y);
      lanternEl.removeAttribute('display');
      lanternEl.dataset.step = String(lan.step + 1);
    } else {
      lanternEl.setAttribute('display', 'none');
      lanternEl.dataset.step = '0';
    }
  }

  function refreshFog() {
    const f = model.fog();
    fogG.dataset.level = f.toFixed(2);
    if (f <= 0.001) { fogG.setAttribute('display', 'none'); return; }
    fogG.removeAttribute('display');
    const spread = 1 + (1 - f) * 0.5;
    fogEls.forEach((e, i) => {
      const [x, y, rx, ry] = fogSpots[i];
      e.setAttribute('cx', X(50 + (x - 50) * spread));
      e.setAttribute('cy', Y(y));
      e.setAttribute('rx', X(rx * spread));
      e.setAttribute('ry', Y(ry));
      e.setAttribute('opacity', (0.45 * f).toFixed(3));
    });
  }

  function refreshPaint() {
    for (const [e, c] of painted) e.setAttribute('fill', ink(c));
    svg.dataset.dancheong = level.toFixed(2);
  }

  function refreshAll() {
    refreshReactive();
    refreshBooks();
    refreshFog();
  }

  refreshPaint();
  refreshAll();

  const offDancheong = onDancheong((id, v) => {
    if (id !== wingId) return;
    level = v;
    refreshPaint();
    refreshAll();
  });

  // ── 상호작용 자리(그림 판 백분율). 오른쪽 아래 상황 버튼 구석(x>78, y>78)은 피한다 ──
  const anchors = {
    slots: [26.3, 35, 43.7].map((x) => ({ x, y: 75 })),
    bonus: [3.5, 11, 18.5].map((x) => ({ x, y: 54 })),
    basket: { x: 62, y: 87 },
    returnedShelf: { x: 86.5, y: 59 },
    roomDoor: { x: 75.5, y: 57 },
    entrance: { x: 44, y: 91 },
    nextDoor: { x: 97, y: 58 },
    mentorSeat: { x: 36, y: 26 },
  };
  const areas = {
    floating: [{ x: 10, y: 70 }, { x: 54, y: 72 }, { x: 70, y: 74 }, { x: 88, y: 72 }],
    focus: { stairs: { x: 58, y: 38 }, pillars: { x: 35, y: 36 }, pavilion: { x: 35, y: 35 } },
  };

  return {
    anchors,
    areas,
    react(name, detail) {
      if (model.react(name, detail)) refreshAll();
    },
    update(dt) {
      if (model.tick(dt, reduce())) refreshAll();
    },
    dispose() {
      offDancheong();
      svg.remove();
    },
  };
}
