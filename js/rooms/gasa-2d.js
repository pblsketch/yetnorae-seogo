// 「상춘곡」 방의 2D 그림 판(spec 14): board/room-gasa 그림 위에 길(SVG), 머무는 곳 이름, 걷는 사람을 얹는다.
// 그림 판은 장면 칸을 덮도록 키우고, 걷는 사람이 화면 가운데 오도록 민다(카메라 따라가기의 2D 연출).
// 그림이 없으면 간단한 자리표시 그림을 그린다.
import { createRoute } from './gasa-route.js';
import { paperDollCanvas } from '../world/sprites.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 그림 판 백분율. 머무는 곳: 수간모옥(초가 앞) → 정자(돌계단 아래) → 시냇가(다리 옆) → 산봉우리(오솔길 위) → 마무리(꼭대기)
export const ROUTE_2D = [
  [[17, 64], [24, 68], [36, 70], [50, 70], [62, 67], [70, 63]],
  [[70, 63], [62, 70], [52, 70], [45, 65]],
  [[45, 65], [56, 71], [72, 70], [84, 62], [88, 48], [89, 30]],
  [[89, 30], [91, 22], [92, 16]],
];
// 머무는 곳 이름표 자리(그림 속 건물·물·봉우리 근처)
export const PLACE_LABELS_2D = { hut: [14, 40], pavilion: [68, 15], stream: [42, 50], peak: [83, 12] };

function sv(tag, attrs, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
}

function el(tag, className, parent, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

// 그림이 없을 때의 자리표시: 초가, 정자, 시내, 산
function placeholder(svg) {
  const g = sv('g', { class: 'rg-placeholder' }, svg);
  sv('rect', { x: 0, y: 0, width: 160, height: 90, style: 'fill:var(--hanji)' }, g);
  sv('path', { d: 'M100 60 L140 10 L160 40 L160 60 Z', style: 'fill:var(--meok-fog)' }, g);
  sv('path', { d: 'M30 0 C34 20 60 40 56 60 L64 60 C68 40 42 20 38 0 Z', style: 'fill:var(--meok-fog);opacity:0.4' }, g);
  sv('rect', { x: 14, y: 46, width: 16, height: 10, style: 'fill:var(--hanji-deep);stroke:var(--meok)' }, g);
  sv('path', { d: 'M11 47 L22 38 L33 47 Z', style: 'fill:var(--gold);stroke:var(--meok)' }, g);
  sv('rect', { x: 104, y: 44, width: 14, height: 10, style: 'fill:none;stroke:var(--meok)' }, g);
  sv('path', { d: 'M100 45 L111 37 L122 45 Z', style: 'fill:var(--meok-soft)' }, g);
}

export function createScene2D({ host, assets, appearance = 'a', stations, reduceMotion = () => false }) {
  const route = createRoute(ROUTE_2D);
  const stage = el('div', 'rg-stage');
  host.prepend(stage);

  const boardUrl = assets?.image?.('board/room-gasa') ?? null;
  const svg = sv('svg', { class: 'rg-route', viewBox: '0 0 160 90', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  if (boardUrl) {
    const img = el('img', 'rg-board', stage);
    img.alt = '';
    img.decoding = 'async';
    img.src = boardUrl;
  } else placeholder(svg);
  stage.append(svg);
  const d = 'M' + route.all().map(([x, y]) => (x * 1.6).toFixed(2) + ' ' + (y * 0.9).toFixed(2)).join(' L');
  sv('path', { d, class: 'rg-route-all', pathLength: 1000 }, svg);
  const walked = sv('path', { d, class: 'rg-route-walked', pathLength: 1000, 'stroke-dasharray': '0 1000' }, svg);

  const labels = {};
  for (const s of stations) {
    const at = PLACE_LABELS_2D[s.id];
    if (!at) continue;
    const lab = el('span', 'rg-place', stage, s.name);
    lab.style.left = at[0] + '%';
    lab.style.top = at[1] + '%';
    labels[s.id] = lab;
  }

  const walker = el('div', 'rg-walker', stage);
  const spriteUrl = assets?.image?.('sprite/student-' + (appearance === 'b' ? 'b' : 'a')) ?? null;
  if (spriteUrl) {
    const im = el('img', '', walker);
    im.alt = '';
    im.src = spriteUrl;
  } else walker.append(paperDollCanvas(appearance === 'b' ? 'student-b' : 'student-a', 64, 128));

  let s = 0;
  let dur = 0;

  function layout() {
    const sw = host.clientWidth;
    const sh = host.clientHeight;
    if (!sw || !sh) return;
    const W = Math.max(sw, (sh * 16) / 9);
    const H = (W * 9) / 16;
    const [px, py] = route.point(s);
    const cx = (px / 100) * W;
    const cy = ((py - 8) / 100) * H;
    const tx = Math.min(0, Math.max(sw - W, sw / 2 - cx));
    const ty = Math.min(0, Math.max(sh - H, sh / 2 - cy));
    stage.style.width = W + 'px';
    stage.style.height = H + 'px';
    stage.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
  }

  function place() {
    const [x, y] = route.point(s);
    const t = reduceMotion() ? 0 : dur;
    for (const e of [walker, stage]) e.style.transitionDuration = t + 's';
    walked.style.transitionDuration = t + 's';
    walker.style.left = x + '%';
    walker.style.top = y + '%';
    walked.setAttribute('stroke-dasharray', (route.walkedRatio(s) * 1000).toFixed(1) + ' 1000');
    layout();
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { dur = 0; place(); }) : null;
  ro?.observe(host);
  place();

  return {
    mode: '2d',
    // 길 위치 to까지 sec초 동안 걷는다
    walkTo(to, sec = 0) { s = to; dur = Math.max(0, sec); place(); },
    setStation(id) {
      for (const [k, lab] of Object.entries(labels)) lab.classList.toggle('is-here', k === id);
    },
    setPaused(v) { stage.classList.toggle('is-paused', !!v); },
    finale() { stage.classList.add('is-finale'); },
    info: () => ({ s, drawCalls: 0 }),
    dispose() { ro?.disconnect(); stage.remove(); },
  };
}
