// 보스전 화면의 작은 도우미: 요소 만들기, 누르기 기다리기, 관 자리 모양, 사서 일지 서랍.
import * as bus from '../core/events.js';
import { GENRES } from '../data/wings.js';
import { CONCEPTS } from '../data/concepts.js';
import { BOSS_TEXT as T } from '../data/boss-text.js';

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

export function button(className, text, label) {
  const b = el('button', className, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

export const abortError = (signal) => signal?.reason ?? new DOMException('중단', 'AbortError');

// 버튼 하나를 누를 때까지. 중단 신호면 거절한다.
export function waitClick(btn, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError(signal)); return; }
    const onAbort = () => { btn.removeEventListener('click', onClick); reject(abortError(signal)); };
    const onClick = () => { signal?.removeEventListener('abort', onAbort); resolve(); };
    btn.addEventListener('click', onClick, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// box 안에서 selector에 맞는(눌러진) 버튼을 기다린다. 비활성 버튼은 넘긴다.
export function waitPick(box, selector, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError(signal)); return; }
    const onAbort = () => { box.removeEventListener('click', onClick); reject(abortError(signal)); };
    function onClick(e) {
      const t = e.target.closest(selector);
      if (!t || !box.contains(t) || t.disabled) return;
      box.removeEventListener('click', onClick);
      signal?.removeEventListener('abort', onAbort);
      resolve(t);
    }
    box.addEventListener('click', onClick);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// 관 자리 표시의 작은 모양(갈래를 색만이 아니라 모양으로도 구분, spec 14). 글이 아니라 그림이다.
const SHAPES = {
  hyangga: 'M6 26h20M9 26V16h14v10M12 16V9h8v7M14 9V5h4v4',          // 4·4·2로 쌓인 탑
  goryeo: 'M5 16a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M17 16a5 5 0 1 0 10 0a5 5 0 1 0 -10 0', // 이어진 고리
  sijo: 'M4 26h8v-6h8v-6h8',                                            // 세 칸 계단
  gasa: 'M3 22c5-6 9 6 14 0s9-6 12 0M3 14c5-6 9 6 14 0s9-6 12 0',      // 끝없이 이어지는 길
  saseol: 'M9 9h14M2 16h28M9 23h14',                                    // 가운데가 길게 늘어난 세 줄
};
const NS = 'http://www.w3.org/2000/svg';
export function wingShape(genre) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('boss-shape');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', SHAPES[genre] ?? 'M4 16h24');
  svg.append(path);
  return svg;
}

// 사서 일지 서랍(spec 8: 보스전에서도 보인다). 연필·먹 개념과 도움 반짝임.
// concepts: progress.concepts. 'help:journal-glow'와 'concept:changed'를 스스로 듣는다.
export function createJournalDrawer(host, { concepts = {}, onGlow } = {}) {
  const btn = button('boss-journal-btn', T.journal);
  btn.setAttribute('aria-haspopup', 'dialog');
  const box = el('section', 'boss-journal');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', T.journalTitle);
  box.hidden = true;
  const head = el('div', 'boss-journal-head');
  const close = button('boss-journal-close', T.close);
  head.append(el('h2', 'boss-journal-title', T.journalTitle), close);
  const body = el('div', 'boss-journal-body boss-scroll');
  box.append(head, body);
  host.append(box);

  const state = new Map(CONCEPTS.map((c) => [c.id, concepts?.[c.id]?.state ?? 'none']));
  const glowing = new Set();

  function render() {
    body.replaceChildren(...GENRES.map((g) => {
      const sec = el('section', 'boss-journal-group');
      sec.append(el('h3', 'boss-journal-genre', g.name));
      const ul = el('ul', 'boss-journal-list');
      for (const c of CONCEPTS.filter((x) => x.genre === g.id)) {
        const s = state.get(c.id);
        const li = el('li', 'boss-journal-item');
        li.dataset.concept = c.id;
        li.dataset.state = s;
        li.classList.toggle('is-glow', glowing.has(c.id));
        li.append(el('span', 'boss-journal-mark', T.journalMarks[s] ?? s), el('span', 'boss-journal-text', s === 'none' ? T.journalEmpty : c.text));
        ul.append(li);
      }
      sec.append(ul);
      return sec;
    }));
    btn.classList.toggle('is-glow', glowing.size > 0);
  }

  const offs = [
    bus.on('help:journal-glow', (d) => {
      for (const id of d?.conceptIds ?? []) glowing.add(id);
      render();
      onGlow?.(d);
    }),
    bus.on('concept:changed', (d) => { if (state.has(d?.conceptId)) { state.set(d.conceptId, d.state); render(); } }),
  ];

  btn.addEventListener('click', () => { box.hidden = false; render(); close.focus(); });
  close.addEventListener('click', () => { box.hidden = true; btn.focus(); });
  render();

  return {
    button: btn,
    glowing: () => [...glowing],
    close: () => { box.hidden = true; },
    dispose() { for (const off of offs) off(); box.remove(); btn.remove(); },
  };
}
