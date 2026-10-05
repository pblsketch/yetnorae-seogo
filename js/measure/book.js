// 『분류 수첩』과 사서 일지(spec 8, 6.4, 10.1). 재기 화면 위에 펼치는 서랍이다.
//  - 수첩: 다섯 갈래 쪽이 처음부터 모두 보인다. 오답 도움(help:notebook-glow)을 받으면 관련 줄이 반짝인다.
//  - 일지: 보스에서 수첩 대신 열린다. 개념의 연필·먹 상태를 보이고, 일지 도움(help:journal-glow)에 그 개념이 반짝인다.
import { GENRES } from '../data/wings.js';
import { CONCEPTS } from '../data/concepts.js';
import { L } from './labels.js';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(className, text) {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

function drawer(kind, title) {
  const box = el('section', 'm-drawer m-' + kind);
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', title);
  const head = el('div', 'm-drawer-head');
  const h = el('h3', 'm-drawer-title', title);
  const close = button('m-' + kind + '-close m-drawer-close', L.close);
  const body = el('div', 'm-drawer-body m-' + kind + '-body');
  head.append(h, close);
  box.append(head, body);
  return { box, head, body, close };
}

// 수첩. notebook: 갈래 id → 쪽(js/data/notebook-<갈래>.js). glow: [{ genre, conceptIds }]
export function createNotebook(host, { notebook = {}, glow = [], genre = null } = {}) {
  const d = drawer('book', L.bookTitle);
  const tabs = el('div', 'm-book-tabs');
  tabs.setAttribute('role', 'tablist');
  d.head.insertBefore(tabs, d.close);
  const btn = button('m-book-btn', L.book);
  btn.setAttribute('aria-haspopup', 'dialog');
  const glowing = new Map(GENRES.map((g) => [g.id, new Set()]));
  let current = genre && notebook[genre] ? genre : GENRES.find((g) => notebook[g.id])?.id ?? GENRES[0].id;

  const lineGlows = (g, line) => (line.conceptIds ?? []).some((c) => glowing.get(g)?.has(c));
  const genreGlows = (g) => (notebook[g]?.lines ?? []).some((line) => lineGlows(g, line));

  function renderTabs() {
    tabs.replaceChildren(...GENRES.map((g) => {
      const t = button('m-book-tab', notebook[g.id]?.name ?? g.name);
      t.dataset.genre = g.id;
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(g.id === current));
      t.classList.toggle('is-current', g.id === current);
      t.classList.toggle('is-glow', genreGlows(g.id));
      t.addEventListener('click', () => { current = g.id; render(); });
      return t;
    }));
  }

  function renderPage() {
    const p = notebook[current];
    if (!p) { d.body.replaceChildren(el('p', 'm-book-empty', '이 쪽은 아직 비어 있다.')); return; }
    const body = (p.body ?? []).map((t) => el('p', 'm-book-para', t));
    const ul = el('ul', 'm-book-lines');
    for (const line of p.lines ?? []) {
      const li = el('li', 'm-book-line', line.text);
      li.dataset.lineId = line.id;
      li.classList.toggle('is-glow', lineGlows(current, line));
      ul.append(li);
    }
    d.body.replaceChildren(...body, ul);
  }

  function render() {
    renderTabs();
    renderPage();
    btn.classList.toggle('is-glow', GENRES.some((g) => genreGlows(g.id)));
  }

  function addGlow(detail) {
    if (!detail?.genre || !glowing.has(detail.genre)) return;
    for (const c of detail.conceptIds ?? []) glowing.get(detail.genre).add(c);
    if (d.box.hidden) current = detail.genre;
    render();
  }

  for (const g of glow ?? []) addGlow(g);
  const firstGlow = (glow ?? []).find((g) => glowing.has(g?.genre));
  if (firstGlow) current = firstGlow.genre;
  render();

  btn.addEventListener('click', () => { d.box.hidden = false; render(); d.close.focus(); });
  d.close.addEventListener('click', () => { d.box.hidden = true; btn.focus(); });
  host.append(d.box);
  return { button: btn, drawer: d.box, addGlow, close: () => { d.box.hidden = true; } };
}

// 일지. concepts: progress.concepts(개념 id → { state, songs }). glow: 개념 id 목록
export function createJournal(host, { concepts = {}, glow = [] } = {}) {
  const d = drawer('journal', L.journalTitle);
  const btn = button('m-journal-btn', L.journal);
  btn.setAttribute('aria-haspopup', 'dialog');
  const state = new Map(CONCEPTS.map((c) => [c.id, concepts?.[c.id]?.state ?? 'none']));
  const glowing = new Set(glow ?? []);
  const MARK = { none: '빈칸', pencil: '연필', ink: '먹' };

  function render() {
    const groups = GENRES.map((g) => {
      const sec = el('section', 'm-journal-group');
      sec.append(el('h4', 'm-journal-genre', g.name));
      const ul = el('ul', 'm-journal-list');
      for (const c of CONCEPTS.filter((x) => x.genre === g.id)) {
        const s = state.get(c.id);
        const li = el('li', 'm-journal-item');
        li.dataset.concept = c.id;
        li.dataset.state = s;
        li.classList.toggle('is-glow', glowing.has(c.id));
        const mark = el('span', 'm-journal-mark', MARK[s] ?? s);
        const text = el('span', 'm-journal-text', s === 'none' ? '……' : c.text);
        li.append(mark, text);
        ul.append(li);
      }
      sec.append(ul);
      return sec;
    });
    d.body.replaceChildren(...groups);
    btn.classList.toggle('is-glow', glowing.size > 0);
  }

  function addGlow(ids) {
    for (const id of ids ?? []) glowing.add(id);
    render();
  }
  function setState(id, s) {
    if (!state.has(id)) return;
    state.set(id, s);
    render();
  }

  render();
  btn.addEventListener('click', () => { d.box.hidden = false; render(); d.close.focus(); });
  d.close.addEventListener('click', () => { d.box.hidden = true; btn.focus(); });
  host.append(d.box);
  return { button: btn, drawer: d.box, addGlow, setState, close: () => { d.box.hidden = true; } };
}
