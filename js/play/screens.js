// 한 판 화면에서 펼치는 화면 넷: 『분류 수첩』, 사서 일지, 도감(기념품), 다시 듣기.
// 각 render 함수는 겹 창(openPanel)의 몸통을 채운다. 화면 약속(README 7.4)의 show(container, ctx)로도 열 수 있다.
//  - 수첩(spec 8): 다섯 갈래 쪽이 처음부터 모두 보인다. 오답 도움(help:notebook-glow)을 받은 줄이 반짝인다.
//  - 일지(spec 7·8): 연필·먹 개념과 확인해 준 노래, 선대 사서의 첫 노래, 이야기 단서(이야기 작업이 채운다).
//  - 도감(spec 8): 받은 기념품 카드(물건·노래 속 마음).
//  - 다시 듣기(spec 6.7·3.2): 묶인 노래와 돌아온 노래를 다시 듣는다.
import { GENRES } from '../data/wings.js';
import { CONCEPTS } from '../data/concepts.js';
import { songText } from '../core/song-shape.js';
import { el, button, openPanel, quoted } from './dom.js';
import { keepsakeCard } from './keepsake.js';
import { L } from './labels.js';

// ── 『분류 수첩』 ──
// notebook: 갈래 id → 쪽. glows: [{ genre, conceptIds }]. genre: 처음 펼칠 쪽.
export function renderNotebook(body, { notebook = {}, glows = [], genre = null } = {}) {
  const glowing = new Map(GENRES.map((g) => [g.id, new Set()]));
  for (const g of glows) for (const c of g?.conceptIds ?? []) glowing.get(g.genre)?.add(c);
  const lineGlows = (g, line) => (line.conceptIds ?? []).some((c) => glowing.get(g)?.has(c));
  const pageGlows = (g) => (notebook[g]?.lines ?? []).some((line) => lineGlows(g, line));
  let current = genre && notebook[genre] ? genre : GENRES.find((g) => pageGlows(g.id))?.id ?? GENRES[0].id;

  const tabs = el('div', 'play-nb-tabs');
  tabs.setAttribute('role', 'tablist');
  const page = el('div', 'play-nb-page');
  body.replaceChildren(tabs, page);

  function render() {
    tabs.replaceChildren(...GENRES.map((g) => {
      const t = button('play-nb-tab', notebook[g.id]?.name ?? g.name);
      t.dataset.genre = g.id;
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(g.id === current));
      t.classList.toggle('is-current', g.id === current);
      t.classList.toggle('is-glow', pageGlows(g.id));
      t.addEventListener('click', () => { current = g.id; render(); });
      return t;
    }));
    const p = notebook[current];
    if (!p) { page.replaceChildren(el('p', 'play-empty', '이 쪽은 아직 비어 있어요.')); return; }
    const ul = el('ul', 'play-nb-lines');
    for (const line of p.lines ?? []) {
      const li = el('li', 'play-nb-line', line.text);
      li.dataset.lineId = line.id;
      li.classList.toggle('is-glow', lineGlows(current, line));
      ul.append(li);
    }
    page.replaceChildren(el('h3', 'play-nb-name', p.name ?? ''), ...(p.body ?? []).map((t) => el('p', 'play-nb-para', t)), ul);
  }
  render();
}

// ── 사서 일지 ──
// progress: 기록의 progress. songs: 노래 id → 노래(제목을 찾는다). clues: 이야기 단서 글 목록(이야기 작업이 넘긴다).
export function renderJournal(body, { progress, songs, clues = [], tutorialSongId = 'taesan' } = {}) {
  const title = (id) => songs.get(id)?.title ?? id;
  const parts = [];

  if (progress?.tutorialDone) {
    const first = el('section', 'play-journal-first');
    first.append(el('h3', 'play-journal-h', L.firstSong), el('p', 'play-journal-song', quoted(title(tutorialSongId))));
    parts.push(first);
  }

  const conceptBox = el('section', 'play-journal-concepts');
  conceptBox.append(el('h3', 'play-journal-h', L.journalConcepts));
  let any = false;
  for (const g of GENRES) {
    const found = CONCEPTS.filter((c) => c.genre === g.id && ['pencil', 'ink'].includes(progress?.concepts?.[c.id]?.state));
    if (!found.length) continue;
    any = true;
    const group = el('div', 'play-journal-genre');
    group.dataset.genre = g.id;
    group.append(el('h4', 'play-journal-genre-name', g.name));
    const ul = el('ul', 'play-concepts');
    for (const c of found) {
      const entry = progress.concepts[c.id];
      const li = el('li', 'play-concept');
      li.dataset.concept = c.id;
      li.dataset.state = entry.state;
      const mark = el('span', 'play-concept-mark', entry.state === 'ink' ? L.ink : L.pencil);
      const text = el('span', 'play-concept-text', c.text);
      const by = el('span', 'play-concept-songs', L.confirmedBy + entry.songs.map((id) => quoted(title(id))).join(', '));
      li.append(mark, text, by);
      ul.append(li);
    }
    group.append(ul);
    conceptBox.append(group);
  }
  if (!any) conceptBox.append(el('p', 'play-empty', L.journalNone));
  parts.push(conceptBox);

  const clueBox = el('section', 'play-clues');
  clueBox.append(el('h3', 'play-journal-h', L.clues));
  if (clues.length) {
    const ul = el('ul', 'play-clue-list');
    for (const c of clues) ul.append(el('li', 'play-clue', c));
    clueBox.append(ul);
  } else {
    clueBox.append(el('p', 'play-empty', L.cluesNone));
  }
  parts.push(clueBox);
  body.replaceChildren(...parts);
}

// ── 도감 ──
export function renderCollection(body, { progress, songs, manifest } = {}) {
  const ids = progress?.keepsakes ?? [];
  if (!ids.length) { body.replaceChildren(el('p', 'play-empty', L.collectionNone)); return; }
  const grid = el('div', 'play-keepsake-grid');
  for (const id of ids) {
    const s = songs.get(id);
    if (s) grid.append(keepsakeCard(s, manifest));
  }
  body.replaceChildren(grid);
}

// ── 다시 듣기 ──
// list: 노래 객체 목록. onPlay(song) → { stop() } (소리 엔진으로 낭송을 낸다)
export function renderListen(body, { list = [], onPlay } = {}) {
  if (!list.length) { body.replaceChildren(el('p', 'play-empty', L.listenNone)); return () => {}; }
  let playing = null;
  const stop = () => { playing?.handle?.stop?.(); playing?.btn && (playing.btn.textContent = L.play); playing = null; };
  const ul = el('ul', 'play-listen-list');
  for (const s of list) {
    const li = el('li', 'play-listen-song');
    li.dataset.song = s.id;
    const head = el('div', 'play-listen-head');
    const play = button('play-listen-play', L.play, quoted(s.title) + ' ' + L.play);
    head.append(el('h3', 'play-listen-title', quoted(s.title)), play);
    const text = el('p', 'play-listen-text', songText(s, 'original'));
    li.append(head, text);
    play.addEventListener('click', () => {
      const was = playing?.song === s.id;
      stop();
      if (was) return;
      const handle = onPlay?.(s) ?? null;
      play.textContent = L.stop;
      playing = { song: s.id, handle, btn: play };
      handle?.finished?.then(() => { if (playing?.song === s.id) stop(); });
    });
    ul.append(li);
  }
  body.replaceChildren(ul);
  return stop;
}

// 화면 약속(README 7.4)으로 여는 길. ctx.params에 위 render 함수의 인자를 넣는다. kind: 'notebook' | 'journal' | 'collection'
function screen(kind, title, render) {
  return function show(container, ctx = {}) {
    const p = openPanel(container, { kind, title, onClose: () => ctx.go?.(ctx.params?.back ?? null) });
    render(p.body, ctx.params ?? {});
    return { dispose: () => p.box.remove() };
  };
}

export const notebookScreen = { show: screen('notebook', L.notebookTitle, renderNotebook) };
export const journalScreen = { show: screen('journal', L.journalTitle, renderJournal) };
export const collectionScreen = { show: screen('collection', L.collectionTitle, renderCollection) };
