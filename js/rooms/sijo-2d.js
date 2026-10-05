// 작품 방 「십 년을 경영하야」 2D 장면. 그림 판 board/room-sijo(1600×900) 위에 칸 단추를 얹는다.
// - 그림 판은 화면을 덮는 16:9 판이다. 처음에는 초가 세 칸을 크게 당겨 보고(확대), pullBack()이면 그림이 넓어지며
//   강산이 둘러싼 온 그림이 보이고 병풍 테가 떠오른다(3D의 카메라 물러남을 2D로 옮긴 연출).
// - 칸 자리는 그림 판 백분율이라 확대와 함께 움직인다.
const NS = 'http://www.w3.org/2000/svg';
const PULL_MS = 2200;

// 그림 판에서 초가 세 칸이 있는 곳(백분율)
export const ROOM_RECTS = [
  { x: 32.5, y: 45.5, w: 10, h: 14 },
  { x: 43.5, y: 45.5, w: 12.5, h: 14 },
  { x: 57, y: 45.5, w: 10.5, h: 14 },
];
const ROOMS_MID_Y = 52.5;        // 세 칸 가운데 높이(%)
const ROOMS_HALF_W = 17.5;       // 세 칸 반너비(%)
const ROOMS_H = 14;
const MAX_ZOOM = 1.7;

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

// 그림 판이 없을 때의 자리표시(먹선 초가와 산)
function placeholder(parent) {
  const svg = svgEl('svg', { class: 'sj-board sj-board-placeholder', viewBox: '0 0 1600 900', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, parent);
  svgEl('rect', { x: 0, y: 0, width: 1600, height: 900, fill: 'var(--hanji)' }, svg);
  for (const [x, h] of [[120, 420], [380, 520], [640, 380], [960, 400], [1220, 540], [1480, 430]]) {
    svgEl('path', { d: `M${x - 260} 620 L${x} ${620 - h} L${x + 260} 620 Z`, fill: 'var(--hanji-deep)', stroke: 'var(--meok-fog)', 'stroke-width': 4 }, svg);
  }
  svgEl('rect', { x: 0, y: 600, width: 1600, height: 300, fill: 'var(--hanji)' }, svg);
  svgEl('path', { d: 'M470 410 L800 290 L1130 410 Z', fill: 'var(--hanji-deep)', stroke: 'var(--meok-soft)', 'stroke-width': 6 }, svg);
  svgEl('rect', { x: 512, y: 410, width: 576, height: 130, fill: 'var(--hanji)', stroke: 'var(--meok-soft)', 'stroke-width': 6 }, svg);
  for (const x of [688, 904]) svgEl('line', { x1: x, y1: 410, x2: x, y2: 540, stroke: 'var(--meok-soft)', 'stroke-width': 6 }, svg);
  svgEl('circle', { cx: 1300, cy: 150, r: 46, fill: 'var(--hanji)', stroke: 'var(--meok-fog)', 'stroke-width': 4 }, svg);
  return svg;
}

// 강산이 병풍처럼 둘러싸는 테: 그림 둘레에 병풍 폭을 나누는 선과 테두리
function screenFrame(parent) {
  const svg = svgEl('svg', { class: 'sj-screen', viewBox: '0 0 1600 900', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, parent);
  const ink = { stroke: 'var(--meok-soft)', 'stroke-linecap': 'round' };
  svgEl('rect', { x: 8, y: 8, width: 1584, height: 884, fill: 'none', 'stroke-width': 16, ...ink }, svg);
  svgEl('line', { x1: 8, y1: 34, x2: 1592, y2: 34, 'stroke-width': 6, ...ink }, svg);
  // 병풍 폭을 가르는 선: 양옆 산자락에만, 위에서 아래로 옅어지게
  for (const x of [200, 400, 1200, 1400]) svgEl('line', { x1: x, y1: 34, x2: x, y2: 420, 'stroke-width': 4, opacity: 0.55, ...ink }, svg);
  return svg;
}

// ctx: { container, imageUrl, reduceMotion() }
export function create2D({ container, imageUrl, reduceMotion }) {
  const stage = el('div', 'sj-stage', container);
  if (imageUrl) {
    const img = el('img', 'sj-board', stage);
    img.alt = '';
    img.draggable = false;
    img.src = imageUrl;
  } else placeholder(stage);
  screenFrame(stage);
  const slotLayer = el('div', 'sj-slots', stage);

  const state = { band: null, zoom: 1, dx: 0, dy: 0, wide: false, settled: false, anim: null, onSettled: null };

  const near = () => `translate(${state.dx.toFixed(1)}px, ${state.dy.toFixed(1)}px) scale(${state.zoom.toFixed(3)})`;
  const WIDE = 'translate(0px, 0px) scale(1)';

  function computeNear() {
    const r = container.getBoundingClientRect();
    const W = Math.max(1, r.width);
    const H = Math.max(1, r.height);
    const stageW = Math.max(W, (H * 16) / 9);
    const stageH = (stageW * 9) / 16;
    const band = state.band ?? { top: 0, bottom: H, right: W };
    const bandH = Math.max(60, band.bottom - band.top);
    const zH = (bandH * 0.8) / ((ROOMS_H / 100) * stageH);
    const halfW = Math.min(W / 2, band.right - W / 2) - 16;
    const zW = halfW / ((ROOMS_HALF_W / 100) * stageW);
    state.zoom = Math.max(1, Math.min(MAX_ZOOM, zH, zW));
    state.dx = 0;
    state.dy = (band.top + band.bottom) / 2 - (H / 2 + ((ROOMS_MID_Y - 50) / 100) * stageH * state.zoom);
    if (!state.wide) stage.style.transform = near();
  }

  const ro = new ResizeObserver(() => computeNear());
  ro.observe(container);
  computeNear();

  function settle() {
    state.anim?.cancel();
    state.anim = null;
    stage.style.transform = WIDE;
    stage.classList.add('is-wide');
    if (!state.settled) {
      state.settled = true;
      const fn = state.onSettled;
      state.onSettled = null;
      fn?.();
    }
  }

  return {
    kind: '2d',
    mountSlots(els) {
      els.forEach((b, i) => {
        const r = ROOM_RECTS[i];
        Object.assign(b.style, { left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%' });
        slotLayer.appendChild(b);
      });
    },
    setBand(band) { state.band = band; computeNear(); },
    setItems() { /* 2D는 칸 단추의 이름이 곧 놓인 물건이다 */ },
    pullBack(onSettled) {
      if (state.wide) return;
      state.wide = true;
      state.onSettled = onSettled;
      stage.classList.add('is-widening');
      if (reduceMotion() || typeof stage.animate !== 'function') { settle(); return; }
      state.anim = stage.animate([{ transform: near() }, { transform: WIDE }], { duration: PULL_MS, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' });
      state.anim.finished.then(settle, () => { /* 치움 */ });
    },
    setPaused(v) {
      if (!state.anim) return;
      if (v) state.anim.pause();
      else state.anim.play();
    },
    get settled() { return state.settled; },
    dispose() {
      ro.disconnect();
      state.anim?.cancel();
      state.anim = null;
      stage.remove();
    },
  };
}
