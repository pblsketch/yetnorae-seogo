// 글 확인 문서 만들기(spec 16.4, 21 '글 확인 문서'). 다시 돌려도 같은 문서가 나온다(날짜·시각을 넣지 않는다).
//
//   node tools/text/review-doc.mjs           docs/글-확인-문서.md를 새로 쓴다
//   node tools/text/review-doc.mjs --check   지금 파일이 생성 결과와 같은지만 본다(다르면 종료 1)
//
// 관별(입구와 공통 화면, 향가관, 고려가요관, 시조관, 가사관, 사설시조관, 보스, 엔딩)로 모은다.
//  - 게임이 새로 쓴 글 전부: 아래 SOURCES의 데이터·글 파일에서 한글·한자가 든 글을 하나도 빼지 않고 옮긴다.
//    함수로 된 글(예: 글자 수를 끼워 넣는 문장)은 함수 원문을 그대로 보인다.
//  - 노래마다: 원문·해독·오늘 소리·풀이(음보는 ' / '로 나눔), 출처와 제작 메모, 가객, 기념품, 카드 한 줄.
//    확인할 노래(verification: 'pending')와 확인을 마친 노래를 함께 싣되, 확인할 노래를 표시한다.
//  - 낭송 목소리 배정(tools/voice/voices.json의 승인 배정)과 먼저 들어 볼 낭송(받아쓰기 일치 0.6 아래, 음절 비율로 자른 조각)
//  - 보스전과 엔딩 화면 그림(docs/images/, tools/text/review-shots.mjs가 만든다)
// 점검: node tests/check-review-doc.mjs(문서가 최신인지, 빠진 글·노래가 없는지).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const DOC_PATH = path.join(ROOT, 'docs', '글-확인-문서.md');

export const SECTIONS = [
  { id: 'entrance', title: '입구와 공통 화면' },
  { id: 'hyangga', title: '향가관' },
  { id: 'goryeo', title: '고려가요관' },
  { id: 'sijo', title: '시조관' },
  { id: 'gasa', title: '가사관' },
  { id: 'saseol', title: '사설시조관' },
  { id: 'boss', title: '보스전 「서고의 밤」' },
  { id: 'ending', title: '엔딩' },
];

// 보스·엔딩 화면 그림(review-shots.mjs와 같은 이름)
export const SHOTS = {
  boss: [
    ['boss-1-intro.png', '첫째 밤 안내'],
    ['boss-1-song.png', '첫째 밤 · 낯선 노래 카드'],
    ['boss-2-intro.png', '둘째 밤 안내'],
    ['boss-2-remix.png', '둘째 밤 · 엉킨 낭송'],
    ['boss-3-intro.png', '셋째 밤 안내'],
    ['boss-3-king.png', '셋째 밤 · 좀 대왕'],
  ],
  ending: [
    ['ending-1-return.png', '선대 사서가 돌아옴'],
    ['ending-2-procession.png', '가객 행렬'],
    ['ending-3-write.png', '나의 노래 한 줄 짓기(예시 글을 넣은 모습)'],
    ['ending-4-complete.png', '서고 완성과 마지막 카드'],
  ],
};

// 새로 쓴 글이 든 파일. route(경로) → 절 id. 경로는 [내보낸 이름, 열쇠, …]다.
const GENRE_WING = { hyangga: 'hyangga', goryeo: 'goryeo', sijo: 'sijo', gasa: 'gasa', saseol: 'saseol' };
export const SOURCES = [
  {
    file: 'js/data/story.js', what: '이야기와 앱 화면 글',
    route: (p) => (p[0] === 'STORY' && (p[1] === 'wingIntro' || p[1] === 'clues') ? p[2] : p[0] === 'STORY' && p[1] === 'boss' ? 'boss' : p[0] === 'STORY' && p[1] === 'ending' ? 'ending' : 'entrance'),
  },
  { file: 'js/data/notebook-hyangga.js', what: '『분류 수첩』 향가 쪽', route: () => 'hyangga' },
  { file: 'js/data/notebook-goryeo.js', what: '『분류 수첩』 고려가요 쪽', route: () => 'goryeo' },
  { file: 'js/data/notebook-sijo.js', what: '『분류 수첩』 시조 쪽', route: () => 'sijo' },
  { file: 'js/data/notebook-gasa.js', what: '『분류 수첩』 가사 쪽', route: () => 'gasa' },
  { file: 'js/data/notebook-saseol.js', what: '『분류 수첩』 사설시조 쪽', route: () => 'saseol' },
  { file: 'js/data/rooms-hyangga.js', what: '작품 방 「제망매가」 글', route: () => 'hyangga' },
  { file: 'js/data/rooms-goryeo.js', what: '작품 방 「정석가」 글', route: () => 'goryeo' },
  { file: 'js/data/rooms-sijo.js', what: '작품 방 「십 년을 경영하야」 글', route: () => 'sijo' },
  { file: 'js/data/rooms-gasa.js', what: '작품 방 「상춘곡」 글', route: () => 'gasa' },
  { file: 'js/data/rooms-saseol.js', what: '작품 방 「님이 오마 하거늘」 글', route: () => 'saseol' },
  { file: 'js/data/concepts.js', what: '사서 일지의 개념 문장과 향유층 무리', route: (p, v, mod) => (p[0] === 'CONCEPTS' ? GENRE_WING[mod.CONCEPTS[p[1]]?.genre] ?? 'entrance' : p[0] === 'SINGER_GROUPS' ? 'boss' : 'entrance') },
  { file: 'js/data/wings.js', what: '갈래·관·고유 동작 이름', route: () => 'entrance' },
  { file: 'js/data/boss-text.js', what: '보스전 글', route: () => 'boss' },
  { file: 'js/data/remix.js', what: '보스 2단계 리믹스', route: () => 'boss' },
  { file: 'js/data/credits.js', what: '출처 화면 글', route: () => 'entrance' },
  { file: 'js/measure/labels.js', what: '재기 화면의 짧은 글', route: () => 'entrance' },
  { file: 'js/play/labels.js', what: '한 판 화면의 짧은 글', route: () => 'entrance' },
];
// 결과 카드의 말(js/result/card.js 안의 상수, 내보내지 않으므로 파일에서 읽는다)
export const CARD_SOURCE = { file: 'js/result/card.js', consts: ['WORDS', 'SIJO_THINGS'], what: '결과 카드의 말', route: () => 'ending' };

export const HAS_TEXT = /[가-힣ᄀ-ᇿㄱ-ㆎꥠ-꥿ힰ-퟿㐀-鿿豈-﫿]/;
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

// 소스 코드 조각에서 한글·한자가 든 문자열 글자 그대로를 뽑는다(함수 글, 카드 상수)
export function literalsIn(src) {
  const out = [];
  for (const m of String(src).matchAll(STRING_LITERAL)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    if (!HAS_TEXT.test(raw)) continue;
    let s = raw;
    try { s = m[3] !== undefined ? raw : JSON.parse('"' + raw.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'); } catch { s = raw; }
    out.push(s);
  }
  return out;
}

// 모듈의 내보낸 값을 훑어 글 항목을 모은다: { path, text, fn? }
export function walkStrings(value, at = [], out = []) {
  if (typeof value === 'string') { if (HAS_TEXT.test(value)) out.push({ path: at, text: value }); }
  else if (typeof value === 'function') {
    const src = value.toString();
    if (literalsIn(src).length) out.push({ path: at, text: src, fn: true });
  } else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, [...at, i], out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walkStrings(v, [...at, k], out);
  return out;
}

// js/result/card.js에서 const NAME = { … }; 블록을 잘라 낸다
export function constBlock(src, name) {
  const start = src.indexOf('const ' + name + ' = ');
  if (start < 0) return '';
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return '';
}

const oneLine = (s) => String(s).replace(/\s*\n\s*/g, ' ').trim();
const code = (s) => (String(s).includes('`') ? '`` ' + s + ' ``' : '`' + s + '`');
const pathLabel = (p) => p.map((k, i) => (typeof k === 'number' ? '[' + k + ']' : (i ? '.' : '') + k)).join('');
const quoted = (t) => '「' + t + '」';

// ───────── 모으기 ─────────
export async function collect(root = ROOT) {
  const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
  const texts = Object.fromEntries(SECTIONS.map((s) => [s.id, []]));   // 절 → [{ source, what, items }]
  for (const src of SOURCES) {
    const mod = await imp(src.file);
    const groups = {};
    for (const [name, value] of Object.entries(mod)) {
      for (const it of walkStrings(value, [name])) {
        const sec = src.route(it.path, it.text, mod) ?? 'entrance';
        (groups[sec] ??= []).push(it);
      }
    }
    for (const [sec, items] of Object.entries(groups)) texts[sec].push({ source: src.file, what: src.what, items });
  }
  {
    const src = fs.readFileSync(path.join(root, CARD_SOURCE.file), 'utf8').replace(/\r\n/g, '\n');   // 꺼낸 줄 끝(CRLF)과 상관없이 같은 문서
    const items = CARD_SOURCE.consts.map((n) => ({ path: [n], text: constBlock(src, n), block: true })).filter((it) => it.text);
    texts[CARD_SOURCE.route()].push({ source: CARD_SOURCE.file, what: CARD_SOURCE.what, items });
  }
  const { songs } = await imp('js/data/songs/index.js');
  const { WING_TABLE, BOSS_TABLE, TUTORIAL_SONG_ID } = await imp('js/data/song-table.js');
  const { remix } = await imp('js/data/remix.js');
  const { GENRES, WINGS } = await imp('js/data/wings.js');
  const voices = JSON.parse(fs.readFileSync(path.join(root, 'tools/voice/voices.json'), 'utf8'));
  const vmPath = path.join(root, 'assets/audio/voice/manifest.json');
  const voiceManifest = fs.existsSync(vmPath) ? JSON.parse(fs.readFileSync(vmPath, 'utf8')) : { clips: [] };
  return { texts, songs, WING_TABLE, BOSS_TABLE, TUTORIAL_SONG_ID, remix, GENRES, WINGS, voices, voiceManifest };
}

// ───────── 노래 한 편 ─────────
const UNIT = { hyangga: '구', goryeo: '연', sijo: '장', saseol: '장', gasa: '행' };
const JANG = ['초장', '중장', '종장'];
const ROLE = { tutorial: '튜토리얼', shelf: '칸', stray: '길 잃은 노래', room: '작품 방', bonus: '덤', unseen: '낯선 노래' };

// 음보를 ' / '로 나눠 보인다. 고려가요의 박에 들지 않는 음보(여음·후렴·되풀이 머리)는 [여음 …]처럼 이름을 붙여 묶는다.
// 낱말 안에서 나눈 음보(joined, 예: '가시리 / 잇고')도 ' / '로 나누어 보인다. 줄 끝에 박에 드는 음보 수를 적는다.
const MARK = { yeoeum: '여음', refrain: '후렴', repeat: '되풀이' };
function feetLine(feet, key) {
  return (feet ?? []).map((f) => (f?.kind ? `[${MARK[f.kind] ?? f.kind} ${f?.[key] ?? ''}]` : f?.[key] ?? '')).join(' / ');
}

export function songBlock(s, ctx) {
  const L = [];
  const pending = s.verification === 'pending';
  const genre = ctx.GENRES.find((g) => g.id === s.genre)?.name ?? s.genre;
  L.push(`### ${quoted(s.title)}${s.excerpt ? '(' + s.excerpt + ')' : ''} — \`${s.id}\` · ${pending ? '**확인할 노래(pending)**' : '확인 끝(verified)'}`);
  L.push('');
  const PLACE = { boss: '보스', entrance: '입구' };
  const roles = (s.roles ?? []).map((r) => {
    const w = ctx.WINGS.find((x) => x.id === r.wing)?.name ?? PLACE[r.wing] ?? r.wing;
    const to = r.to ? ' → ' + (ctx.WINGS.find((x) => x.id === r.to)?.name ?? r.to) : '';
    return `${w} ${ROLE[r.role] ?? r.role}${to}`;
  }).join(', ');
  L.push(`- 갈래·쓰임: ${genre} · ${roles}`);
  L.push(`- 가객: ${s.singer?.name} (${s.singer?.class})${s.singer?.traditional ? ' — 전해지는 귀속' : ''}`);
  if (s.decipherment) L.push(`- 해독: ${s.decipherment.scholar}, ${s.decipherment.book}`);
  L.push(`- 출처(화면에 보임): ${s.citation}`);
  if (s.citationNote) L.push(`- 제작 메모: ${oneLine(s.citationNote)}`);
  if (s.excerpt) L.push(`- 발췌: ${s.excerpt}(노래 표의 발췌 범위)`);
  const k = s.keepsake ?? {};
  L.push(`- 기념품(${k.kind === 'mind' ? '노래 속 마음' : '물건'}): ${k.name} · 낱말 ${k.word} · 구절 ${k.phrase}`);
  L.push(`- 기념품 카드의 향유층 한 줄: ${k.classLine}`);
  if (s.cardNote) L.push(`- 카드 한 줄: ${s.cardNote}`);
  if (s.legend) L.push('- 설화 장면 있음(화면에 \'전해지는 이야기\'로 표시)');
  if (s.singerGroups) L.push(`- 보스 '누가 불렀을까' 정답 무리: ${s.singerGroups.join(', ')}`);
  const f = s.features ?? {};
  if (Object.keys(f).length) L.push(`- 형식 표시: ${code(JSON.stringify(f))}`);
  if (s.tempo) L.push(`- 낭송 빠르기: 1분에 ${s.tempo}박`);
  L.push('');
  const unitName = UNIT[s.genre] ?? '단위';
  (s.units ?? []).forEach((u, i) => {
    const name = (s.genre === 'sijo' || s.genre === 'saseol') && s.units.length === 3 ? JANG[i] : (i + 1) + unitName;
    const beyond = u?.beyondTextbook ? ` _(교과서 밖 원문 — ${u.sourceNote})_` : '';
    if (s.genre === 'hyangga') {
      L.push(`- **${name}**${beyond}`);
      L.push(`  - 원문: ${u.original}`);
      L.push(`  - 해독: ${u.decipherment}`);
      L.push(`  - 오늘 소리: ${u.reading}`);
      L.push(`  - 풀이: ${u.gloss}`);
    } else if (s.genre === 'goryeo') {
      L.push(`- **${name}**${beyond}`);
      (u.lines ?? []).forEach((l, j) => {
        const beats = (l.feet ?? []).filter((x) => !x?.kind).length;
        L.push(`  - ${j + 1}줄 원문: ${feetLine(l.feet, 'original')} · ${beats ? '박 ' + beats + '개' : '듣기만 하는 줄(박 없음)'}`);
        L.push(`    - 오늘 소리: ${feetLine(l.feet, 'reading')}`);
        L.push(`    - 풀이: ${l.gloss}`);
      });
    } else {
      L.push(`- **${name}**${beyond}`);
      L.push(`  - 원문: ${feetLine(u.feet, 'original')}`);
      L.push(`  - 오늘 소리: ${feetLine(u.feet, 'reading')}`);
      L.push(`  - 풀이: ${u.gloss}`);
      if (u.reversal) L.push(`  - 반전 표시: ${code(JSON.stringify(u.reversal))}`);
    }
  });
  L.push('');
  return L;
}

// ───────── 낭송 ─────────
const VOICE_LABEL = { 'narrator-a2': '가2 — 차분한 30대 여성', 'narrator-b2': '나2 — 따뜻하고 낮은 50대 남성' };
const LISTEN_FIRST = ['wonwangsaengga', 'songmiingok', 'dongdong', 'cheongsan-byeolgok'];

function voiceSection(ctx) {
  const L = [];
  const ap = ctx.voices.approved ?? {};
  const voiceOf = (id) => ap.bySong?.[id] ?? ap.default;
  L.push('## 낭송 목소리 배정', '');
  L.push(`승인 기록: ${ap.decided ?? '(없음)'}. 배정은 \`tools/voice/voices.json\`의 \`approved\`이고, 바꾸면 그 노래의 낭송 조각을 다시 만든다.`, '');
  L.push('| 노래 | id | 목소리 |', '| --- | --- | --- |');
  for (const s of ctx.songs) L.push(`| ${quoted(s.title)} | \`${s.id}\` | ${VOICE_LABEL[voiceOf(s.id)] ?? voiceOf(s.id)} |`);
  L.push('');

  const clips = ctx.voiceManifest.clips ?? [];
  const lineKey = (c) => c.songId + '|' + c.unit + '|' + (c.line ?? '');
  const byLine = new Map();
  for (const c of clips) {
    const k = lineKey(c);
    if (!byLine.has(k)) byLine.set(k, { songId: c.songId, unit: c.unit, line: c.line, lineText: c.lineText ?? c.text, lineAsr: c.lineAsr ?? '', match: c.lineAsrMatch, energy: false, paths: [] });
    const r = byLine.get(k);
    if (c.cut === 'energy') r.energy = true;
    r.paths.push(c.path.split('/').pop());
  }
  const title = (id) => quoted(ctx.songs.find((s) => s.id === id)?.title ?? id);
  const where = (r) => (r.line !== null && r.line !== undefined ? `${r.unit + 1}연 ${r.line + 1}줄` : `${r.unit + 1}${UNIT[ctx.songs.find((s) => s.id === r.songId)?.genre] ?? ''}`);
  const low = [...byLine.values()].filter((r) => typeof r.match === 'number' && r.match < 0.6);
  const energy = [...byLine.values()].filter((r) => r.energy);
  L.push('## 먼저 들어 볼 낭송', '');
  L.push('낭송은 줄 단위로 읽힌 뒤 음보로 잘랐다. 받아쓰기(Fish ASR)가 다른 말로 들은 줄(일치 0.6 아래)과, 받아쓰기로 자르지 못해 음절 비율로 자른 줄(`cut: \'energy\'`)을 먼저 들어 보면 된다. 받아쓰기는 옛말을 오늘말로 바꿔 듣는 일이 많아 일치가 낮아도 낭송은 맞을 수 있다.', '');
  L.push(`- 받아쓰기 일치 0.6 아래: ${low.length}줄, 음절 비율로 자른 줄: ${energy.length}줄 (모든 조각 ${clips.length}개)`);
  L.push(`- 특히 먼저: ${LISTEN_FIRST.map((id) => `${title(id)} ${low.filter((r) => r.songId === id).length}줄`).join(', ')}`, '');
  L.push('### 음절 비율로 자른 줄(cut: energy)', '');
  if (!energy.length) L.push('- 없음');
  for (const r of energy) L.push(`- ${title(r.songId)} ${where(r)} — ${r.lineText} (조각 ${r.paths.join(', ')})`);
  L.push('');
  const order = [...LISTEN_FIRST, ...ctx.songs.map((s) => s.id).filter((id) => !LISTEN_FIRST.includes(id))];
  L.push('### 받아쓰기 일치 0.6 아래인 줄(노래별)', '');
  for (const id of order) {
    const rows = low.filter((r) => r.songId === id);
    if (!rows.length) continue;
    L.push(`#### ${title(id)} — ${rows.length}줄${LISTEN_FIRST.includes(id) ? ' (특히 먼저)' : ''}`, '');
    for (const r of rows) L.push(`- ${where(r)} · 일치 ${r.match.toFixed(2)}${r.energy ? ' · 음절 비율로 자름' : ''} — 낭송 글: ${r.lineText} / 받아쓰기: ${r.lineAsr}`);
    L.push('');
  }
  return L;
}

// ───────── 문서 ─────────
export async function buildReviewDoc(root = ROOT) {
  const ctx = await collect(root);
  const L = [];
  const pending = ctx.songs.filter((s) => s.verification === 'pending');
  L.push('# 글 확인 문서', '');
  L.push('> 이 문서는 `node tools/text/review-doc.mjs`가 게임 데이터에서 만든다. 손으로 고치지 말고 데이터를 고친 뒤 다시 만든다.');
  L.push('> 보스·엔딩 화면 그림은 `node tools/text/review-shots.mjs`가 만든다(`docs/images/`). 빠진 글이 없는지는 `node tests/check-review-doc.mjs`가 대조한다.', '');
  L.push('교사가 확인할 것(spec 16.4)', '');
  L.push('1. 게임이 새로 쓴 글: 이야기, 수첩 설명, 일지 개념 문장, 가객 대사, 작품 방 해석 문장, 기념품 카드 글, 화면의 짧은 글, 노래마다 오늘 소리와 제작진 풀이');
  L.push(`2. 확인할 노래(pending) ${pending.length}편의 원문·해독·풀이와 출처. 확인을 마치면 노래 데이터의 \`verification\`을 \`'verified'\`로 바꾼다(모두 바뀐 뒤 공개).`);
  L.push('3. 보스전과 엔딩 화면 그림', '');
  L.push('글 항목의 `파일 · 경로`는 고칠 곳이다. 함수로 된 글은 함수 원문을 그대로 보인다(따옴표 안이 화면 글).', '');

  // 먼저 볼 출처 메모
  L.push('## 먼저 볼 출처 메모', '');
  const flags = [
    ['나무위키', '해독·현대어역을 2차 자료(나무위키)에서 옮김(원저 대조 전)'],
    ['원저 대조 전', '원저와 대조하지 않음'],
    ['다음 카페', '학습 자료(다음 카페)의 반현대 표기를 옮김'],
    ['교과서 파일을 받으면', '문학 교과서 파일이 오면 교과서 수록본으로 바꿀 노래'],
    ['교과서 수록본으로 바꿀', '문학 교과서 파일이 오면 교과서 수록본으로 바꿀 노래'],
  ];
  for (const s of ctx.songs) {
    const hay = s.citation + ' ' + (s.citationNote ?? '');
    const why = [...new Set(flags.filter(([k]) => hay.includes(k)).map(([, w]) => w))];
    if (s.units?.some((u) => u?.beyondTextbook)) why.push('교과서 대목 뒤에 교과서 밖 원문을 이어 붙임');
    if (s.excerpt) why.push(`발췌(${s.excerpt}) — 범위는 제작 메모 참고`);
    if (s.sourceType === 'exam') why.push('수능 출제 지문의 발췌 범위');
    if (/5·3·2|5구·3구·2구/.test(hay)) why.push('무리 나눔: 뜻으로는 5·3·2, 게임은 형식 구분 4·4·2를 따름');
    if (why.length) L.push(`- ${quoted(s.title)} \`${s.id}\` — ${why.join('; ')}`);
  }
  L.push('');

  for (const sec of SECTIONS) {
    L.push(`## ${sec.title}`, '');
    const groups = ctx.texts[sec.id];
    if (groups.length) L.push('### 새로 쓴 글', '');
    for (const g of groups) {
      L.push(`#### ${g.what} — \`${g.source}\``, '');
      for (const it of g.items) {
        if (it.block) { L.push('```js', it.text, '```'); continue; }
        L.push(`- \`${pathLabel(it.path)}\` — ${it.fn ? code(oneLine(it.text)) : oneLine(it.text)}`);
      }
      L.push('');
    }
    if (sec.id === 'entrance') {
      const t = ctx.songs.find((s) => s.id === ctx.TUTORIAL_SONG_ID);
      if (t) L.push(`튜토리얼 노래(선대 사서의 첫 노래): ${quoted(t.title)} \`${t.id}\` — 글은 그 갈래 절에 있다.`, '');
    }
    if (GENRE_WING[sec.id]) {
      const list = ctx.songs.filter((s) => s.genre === sec.id);
      const table = ctx.WING_TABLE[sec.id];
      L.push('### 노래', '');
      if (table) L.push(`칸: ${table.shelf.map((id) => '`' + id + '`').join(', ')} · 길 잃은 노래: ${table.stray.map((x) => '`' + x.songId + '`').join(', ')} · 작품 방: \`${table.room}\` · 덤: ${table.bonus.map((id) => '`' + id + '`').join(', ')}`, '');
      for (const s of list) L.push(...songBlock(s, ctx));
    }
    if (sec.id === 'boss') {
      const b = ctx.BOSS_TABLE;
      L.push('### 낯선 노래와 리믹스', '');
      L.push(`- 1단계 낯선 노래(차례대로): ${b.unseenOrder.map((g) => '`' + b.unseen[g] + '`').join(', ')} — 글은 각 갈래 절에 있다.`);
      L.push(`- 3단계 노래(좀 대왕이 삼킨 첫 노래): \`${b.stage3SongId}\``);
      L.push(`- 2단계 리믹스 조각(차례대로): ${ctx.remix.fragments.map((f) => `\`${f.songId}\` ${f.from + 1}~${f.to + 1}${UNIT[f.genre] ?? ''}`).join(', ')}`, '');
    }
    if (SHOTS[sec.id]) {
      L.push('### 화면 그림', '');
      for (const [file, cap] of SHOTS[sec.id]) L.push(`![${cap}](images/${file})`, '', `_${cap}_`, '');
    }
  }
  L.push(...voiceSection(ctx));
  return { markdown: L.join('\n').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', ctx };
}

async function main() {
  const { markdown } = await buildReviewDoc();
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(DOC_PATH) ? fs.readFileSync(DOC_PATH, 'utf8').replace(/\r\n/g, '\n') : '';
    if (now !== markdown) { console.log('글 확인 문서가 최신이 아니다. node tools/text/review-doc.mjs로 다시 만드세요.'); return 1; }
    console.log('글 확인 문서가 최신이다.');
    return 0;
  }
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  fs.writeFileSync(DOC_PATH, markdown, 'utf8');
  console.log(`docs/글-확인-문서.md 씀 (${markdown.split('\n').length}줄)`);
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
}
