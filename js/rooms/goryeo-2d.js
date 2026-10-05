// 작품 방 「정석가」 2D 그림 판 겹(spec 14). 그림 판 board/room-goryeo 위에 임 종이 인형, 약속 탑, 구슬과 바위를 DOM·SVG로 올린다.
// 3D 장면(goryeo-3d.js)과 같은 손잡이를 돌려준다: placeCard, object, speak, showFinal, showMatch, dispose.
import { paperDollCanvas } from '../world/sprites.js';

const SVG = 'http://www.w3.org/2000/svg';

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function svg(tag, attrs) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export function createRoom2D({ stage, assets, reduceMotion }) {
  stage.replaceChildren();
  const art = el('div', 'rg-art');
  const board = assets?.image?.('board/room-goryeo');
  if (board) art.style.backgroundImage = 'url("' + board + '")';
  else art.classList.add('is-placeholder');

  const nim = el('img', 'rg-nim');
  nim.alt = '';
  nim.src = paperDollCanvas('nim').toDataURL();

  const tower = el('div', 'rg-tower');
  tower.setAttribute('aria-hidden', 'true');

  // 구슬 연: 위에서 끈에 매달린 구슬이 바위로 떨어지고, 끈은 끊어지지 않는다.
  const pearl = svg('svg', { class: 'rg-pearl', viewBox: '0 0 100 160', 'aria-hidden': 'true' });
  const rock = svg('path', { class: 'rg-pearl-rock', d: 'M8 158 L18 128 L40 116 L66 120 L88 134 L94 158 Z' });
  const drop = svg('g', { class: 'rg-pearl-drop' });
  const string = svg('line', { class: 'rg-pearl-string', x1: 50, y1: -40, x2: 50, y2: 100 });
  const bead = svg('circle', { class: 'rg-pearl-bead', cx: 50, cy: 104, r: 11 });
  const shine = svg('circle', { class: 'rg-pearl-shine', cx: 46, cy: 100, r: 3.5 });
  drop.append(string, bead, shine);
  pearl.append(rock, drop);
  pearl.style.display = 'none';

  stage.append(art, nim, tower, pearl);

  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  function pulse(node, cls, ms) {
    if (reduceMotion()) return;
    node.classList.remove(cls);
    node.getBoundingClientRect(); // 애니메이션을 처음부터
    node.classList.add(cls);
    later(() => node.classList.remove(cls), ms);
  }

  return {
    placeCard(card) {
      const item = el('div', 'rg-tower-item');
      item.dataset.cardId = card.id;
      item.textContent = card.label;
      tower.append(item);
      pulse(item, 'is-dropping', 600);
    },
    object() { pulse(nim, 'is-shaking', 700); },
    speak() {},
    showFinal() {
      tower.classList.add('is-dim');
      pearl.style.display = '';
      pulse(pearl, 'is-falling', 1400);
    },
    showMatch() { pulse(pearl, 'is-glowing', 1200); },
    dispose() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      stage.replaceChildren();
    },
  };
}
