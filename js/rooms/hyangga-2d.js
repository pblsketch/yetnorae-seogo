// 작품 방 「제망매가」 2D 무대: 그림 판 board/room-hyangga 위에 길과 미타찰 빛을 겹친다.
// 잎·무더기의 자리는 방 상자 기준 비율로 정하고, 화면 좌표(px)로 돌려준다(누를 자리는 방이 만든다).
const SVG_NS = 'http://www.w3.org/2000/svg';

// 길: 앞마당에서 서쪽 하늘(그림 판의 해가 지는 곳)로 굽어 가는 길. 무더기는 가까운 것부터.
export const PATH_START = { x: 0.47, y: 1.0 };
export const PILES_2D = [
  { x: 0.5, y: 0.87 },
  { x: 0.54, y: 0.77 },
  { x: 0.57, y: 0.68 },
  { x: 0.59, y: 0.6 },
];
export const DEST_2D = { x: 0.6, y: 0.5 };
// 잎이 떨어지는 띠(오른쪽 아래 상황 단추 구석은 피한다)
const LEAF_BOX = { left: 0.1, width: 0.66, top: 0.2, height: 0.62 };

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export function leafSvg() {
  const svg = svgEl('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', class: 'rh-leaf__art' });
  svg.append(
    svgEl('path', { class: 'rh-leaf__blade', d: 'M50 6 C76 24 84 60 50 94 C16 60 24 24 50 6 Z' }),
    svgEl('path', { class: 'rh-leaf__vein', d: 'M50 14 L50 90 M50 40 L36 30 M50 40 L64 30 M50 60 L34 50 M50 60 L66 50' }),
  );
  return svg;
}

export function pileSvg() {
  const svg = svgEl('svg', { viewBox: '0 0 100 60', 'aria-hidden': 'true', class: 'rh-pile__art' });
  const bits = [[22, 38, -30], [40, 30, 20], [58, 36, -10], [76, 40, 35], [34, 46, 60], [52, 48, -50], [68, 28, 5]];
  bits.forEach(([x, y, r], i) => svg.append(svgEl('ellipse', { class: 'rh-pile__leaf rh-pile__leaf--' + (i % 3), cx: x, cy: y, rx: 16, ry: 8, transform: `rotate(${r} ${x} ${y})` })));
  return svg;
}

export function create2DStage({ art, pileCount = PILES_2D.length }) {
  const piles = Array.from({ length: pileCount }, (_, k) => PILES_2D[Math.min(k, PILES_2D.length - 1)]);
  const element = document.createElement('div');
  element.className = 'rh-stage rh-stage--2d';
  element.setAttribute('aria-hidden', 'true');

  if (art) {
    const img = new Image();
    img.className = 'rh-art';
    img.alt = '';
    img.decoding = 'async';
    img.addEventListener('error', () => { element.classList.add('no-art'); img.remove(); }, { once: true });
    img.src = art;
    element.append(img);
  } else {
    element.classList.add('no-art');
  }

  // 그림 판이 없을 때의 자리표시 풍경과, 길·미타찰 빛(항상)
  const svg = svgEl('svg', { class: 'rh-scene', viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
  const fallback = svgEl('g', { class: 'rh-fallback' });
  fallback.append(
    svgEl('rect', { class: 'rh-fallback__sky', x: 0, y: 0, width: 100, height: 72 }),
    svgEl('rect', { class: 'rh-fallback__ground', x: 0, y: 72, width: 100, height: 28 }),
    svgEl('ellipse', { class: 'rh-fallback__sun', cx: 60, cy: 48, rx: 3, ry: 5 }),
    svgEl('path', { class: 'rh-fallback__hill', d: 'M0 72 L18 56 L34 66 L50 54 L66 64 L82 52 L100 64 L100 72 Z' }),
    svgEl('path', { class: 'rh-fallback__branch', d: 'M0 8 C20 6 40 14 60 10 C70 8 78 12 84 18 L82 20 C74 15 66 13 58 15 C40 19 20 12 0 14 Z' }),
  );
  const pts = [PATH_START, ...piles, DEST_2D];
  const trail = svgEl('g', { class: 'rh-trail' });
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = svgEl('line', { class: 'rh-trail__seg', x1: a.x * 100, y1: a.y * 100, x2: b.x * 100, y2: b.y * 100 });
    trail.append(seg);
    segs.push(seg);
  }
  svg.append(fallback, trail);
  const glow = document.createElement('div');
  glow.className = 'rh-glow';
  glow.style.left = DEST_2D.x * 100 + '%';
  glow.style.top = DEST_2D.y * 100 + '%';
  element.append(svg, glow);

  const at = (f, rect) => ({ x: f.x * rect.width, y: f.y * rect.height });

  return {
    element,
    leafTilt: true,
    leafVisual: () => leafSvg(),
    pileVisual: () => pileSvg(),
    leafPoint(l, rect) {
      return { x: rect.width * (LEAF_BOX.left + l.u * LEAF_BOX.width), y: rect.height * (LEAF_BOX.top + l.v * LEAF_BOX.height) };
    },
    pilePoint: (k, rect) => at(piles[Math.min(Math.max(0, k), piles.length - 1)], rect),
    destPoint: (rect) => at(DEST_2D, rect),
    update() {},
    setPhase(phase) {
      element.dataset.phase = phase;
      if (phase === 'clear') segs.forEach((s) => s.classList.add('is-clear'));
    },
    // 무더기 k를 쓸면 그 무더기까지의 길이 트인다
    sweep(k) { segs[k]?.classList.add('is-clear'); },
    dispose() { element.remove(); },
  };
}
