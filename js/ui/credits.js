// 출처 화면(spec 16.5, README '추가 제안(T18)'의 출처 화면 약속).
//   show(container, { go, params: { back: 'start' } }) → { dispose(), ready }
//   '돌아가기'(또는 Esc)를 누르면 go()를 부른다. 화면 이름은 registry.screens.credits.
// 고정 글은 js/data/credits.js에 두고, 목록(교과서 노래, 학자별·문헌별 노래, 수능 지문, 노래마다 출처, 쓴 곡)은
// 노래 데이터와 자산 목록에서 그때그때 만든다. 그래서 데이터가 바뀌어도 화면이 함께 바뀐다.
// 바깥 주소로 요청하지 않는다(주소는 글로만 보인다). 자산 목록은 같은 사이트의 assets/manifest.json을 읽는다.
import { songs as ALL_SONGS } from '../data/songs/index.js';
import { CREDITS } from '../data/credits.js';

const C = CREDITS;
const MANIFEST_URL = new URL('../../assets/manifest.json', import.meta.url);
let manifestPromise = null;

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return manifestPromise;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

const quoted = (title) => '「' + title + '」';
const titled = (s) => quoted(s.title) + (s.excerpt ? '(' + s.excerpt + ')' : '');
// 노래의 출처 문구(화면에 보이는 citation과 교과서 밖에서 이어 붙인 대목의 sourceNote). 제작 메모(citationNote)는 넣지 않는다.
export function sourceText(s) {
  const notes = (s.units ?? []).map((u) => u?.sourceNote ?? '').join(' ');
  return [s.citation, notes].join(' ');
}

// ───────── 목록 만들기(순수 함수, 점검도 쓴다) ─────────
export function buildCredits(songs = ALL_SONGS) {
  const textbook = Object.entries(C.textbook.groups).map(([type, label]) => ({
    type, label, songs: songs.filter((s) => s.sourceType === type).map(titled),
  })).filter((g) => g.songs.length);
  const beyond = songs.filter((s) => (s.units ?? []).some((u) => u?.beyondTextbook === true)).map((s) => ({
    title: s.title,
    notes: [...new Set(s.units.filter((u) => u?.beyondTextbook).map((u) => u.sourceNote))],
  }));
  const scholars = C.scholars.people.map((p) => ({
    ...p,
    songs: songs.filter((s) => s.decipherment?.scholar === p.name || s.citation.includes(p.name)).map(titled),
  }));
  const oldTexts = C.oldTexts.books.map((b) => ({
    book: '『' + b + '』',
    songs: songs.filter((s) => sourceText(s).includes('『' + b + '』')).map(titled),
  }));
  const exam = songs.filter((s) => s.sourceType === 'exam').map((s) => ({ title: titled(s), citation: s.citation }));
  const references = C.references.items.map((name) => ({
    name, count: songs.filter((s) => sourceText(s).includes(name)).length,
  }));
  const perSong = songs.map((s) => ({ id: s.id, title: titled(s), citation: s.citation }));
  return { textbook, beyond, scholars, oldTexts, exam, references, perSong };
}

// 자산 목록에서 소리·목소리·그림 출처를 뽑는다(없으면 빈 목록)
export function buildAssetCredits(manifest) {
  const assets = manifest?.assets ?? [];
  const music = assets.filter((a) => a.kind === 'bgm' || a.kind === 'sfx').map((a) => {
    const where = String(a.notes ?? '').split('.')[0].trim();
    const from = String(a.source ?? '').replace(/^국립국악원 「국악기 디지털 음원」\s*/, '').replace(/\s*악구\s+[A-Za-z0-9-]+(?:,\s*[A-Za-z0-9-]+)*/, '').trim();
    return { kind: a.kind, where, from: from || C.music.synthesized, file: a.path.split('/').pop() };
  });
  const first = (kind) => assets.find((a) => a.kind === kind);
  return { music, voiceSource: first('voice')?.source ?? null, artSource: first('image')?.source ?? null };
}

// ───────── 그리기 ─────────
function section(id, title, lead) {
  const s = el('section', 'credits-section');
  s.dataset.section = id;
  s.setAttribute('aria-labelledby', 'credits-h-' + id);
  const h = el('h2', 'credits-h', title);
  h.id = 'credits-h-' + id;
  s.append(h);
  if (lead) s.append(el('p', 'credits-p', lead));
  return s;
}
function list(items, className = 'credits-list') {
  const ul = el('ul', className);
  for (const it of items) {
    const li = el('li', 'credits-item');
    if (typeof it === 'string') li.textContent = it;
    else li.append(...it);
    ul.append(li);
  }
  return ul;
}
const strong = (t) => el('strong', 'credits-name', t);
const span = (t, c = 'credits-songs') => el('span', c, t);

function render(body, data) {
  // 교과서 수록본
  const tb = section('textbook', C.textbook.title, C.textbook.lead);
  tb.append(list(data.textbook.map((g) => [strong(g.label), span(' — ' + g.songs.join(', '))])));
  const notes = [];
  if (data.textbook.some((g) => g.type === 'textbook-literature')) notes.push(C.textbook.literatureNote);
  for (const b of data.beyond) notes.push(C.textbook.beyondNote(b.title) + ' (' + b.notes.join(' / ') + ')');
  for (const n of notes) tb.append(el('p', 'credits-note', n));

  // 해독과 풀이
  const sc = section('scholars', C.scholars.title, C.scholars.lead);
  sc.append(list(data.scholars.map((p) => [strong(p.name), span(' — ' + p.role + ': ' + p.works.join('; ')), el('br'), span(p.songs.join(', '), 'credits-songs credits-sub')])));

  // 옛 문헌
  const ot = section('old-texts', C.oldTexts.title, C.oldTexts.lead);
  ot.append(list(data.oldTexts.map((b) => [strong(b.book), span(' — ' + b.songs.join(', '))])));

  // 수능 출제 지문
  if (data.exam.length) {
    const ex = section('exam', C.exam.title, C.exam.lead);
    ex.append(list(data.exam.map((e) => [strong(e.title), span(' — ' + e.citation)])));
    body.append(tb, sc, ot, ex);
  } else body.append(tb, sc, ot);

  // 찾아본 공개 자료
  const rf = section('references', C.references.title, C.references.lead);
  rf.append(list(data.references.filter((r) => r.count > 0).map((r) => r.name), 'credits-list credits-inline'));
  body.append(rf);

  // 노래마다 출처(접어 둔다)
  const ps = section('songs', C.songs.title);
  const det = el('details', 'credits-details');
  const sum = el('summary', 'credits-summary', C.songs.summary(data.perSong.length));
  det.append(sum, list(data.perSong.map((s) => {
    const name = strong(s.title);
    name.dataset.song = s.id;
    return [name, span(' — ' + s.citation)];
  })));
  ps.append(det);
  body.append(ps);

  // 배경음과 장구 소리(곡 목록은 자산 목록을 읽은 뒤 채운다)
  const mu = section('music', C.music.title, C.music.lead);
  const kogl = el('blockquote', 'credits-kogl', C.music.kogl);
  mu.append(kogl, el('p', 'credits-note', C.music.license), el('p', 'credits-note', C.music.notAffiliated));
  const musicList = el('div', 'credits-music');
  mu.append(musicList);
  body.append(mu);

  // 낭송 목소리
  const vo = section('voice', C.voice.title, C.voice.lead);
  vo.append(el('p', 'credits-p', C.voice.design));
  const voiceModel = el('p', 'credits-note');
  vo.append(voiceModel);
  body.append(vo);

  // 그림
  const ar = section('art', C.art.title, C.art.lead);
  const artMethod = el('p', 'credits-note');
  ar.append(artMethod);
  body.append(ar);

  // 글꼴
  const fo = section('fonts', C.fonts.title, C.fonts.lead);
  fo.append(el('p', 'credits-note', C.fonts.license), el('p', 'credits-note', C.fonts.fallback));
  body.append(fo);

  // 프로그램
  const co = section('code', C.code.title);
  co.append(list(C.code.lines));
  body.append(co);

  return {
    fillAssets(a) {
      if (a.music.length) {
        musicList.append(el('h3', 'credits-h3', C.music.listTitle));
        musicList.append(list(a.music.map((m) => [strong(m.where), span(' — ' + m.from)])));
      }
      if (a.voiceSource) voiceModel.textContent = C.voice.model(a.voiceSource);
      if (a.artSource) artMethod.textContent = C.art.method(a.artSource);
    },
  };
}

// 화면 약속(README 7.4)
export function show(container, ctx = {}) {
  const root = el('section', 'credits');
  root.setAttribute('aria-label', C.title);
  const top = el('header', 'credits-top');
  const title = el('h1', 'credits-title', C.title);
  const back = el('button', 'credits-back', C.back);
  back.type = 'button';
  back.setAttribute('aria-label', C.backLabel);
  top.append(title, back);
  const body = el('div', 'credits-body');
  body.tabIndex = 0;
  body.setAttribute('role', 'document');
  body.append(el('p', 'credits-intro', C.intro));
  root.append(top, body);
  container.append(root);

  const view = render(body, buildCredits());
  let disposed = false;
  const ready = loadManifest().then((m) => { if (!disposed) view.fillAssets(buildAssetCredits(m)); });

  const goBack = () => { if (!disposed) ctx.go?.(ctx.params?.back ?? 'start', {}); };
  back.addEventListener('click', goBack);
  const onKey = (e) => { if (e.key === 'Escape') goBack(); };
  document.addEventListener('keydown', onKey);
  back.focus({ preventScroll: true });

  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
