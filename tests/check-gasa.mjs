// 가사 노래 글 점검(T23).
// 1) js/data/songs/gasa.js에 노래 표의 가사 노래가 모두, 표가 정한 역할대로 들어 있는지
// 2) 노래마다 검증기(형식·증거·기념품·출처·노래 표)를 통과하고, 가사 갈래만으로 먹이 될 수 있는지
// 3) 출처 규칙: 교과서 노래는 출판사 이름 없는 출처 문구와 verified, 그 밖은 pending
// 4) 「상춘곡」은 교과서 수록본 21행 그대로(낱말 풀이 표시 ● 없음)이고, 작품 방이 걷는 장소 낱말이 글에 있는지
// 5) '오늘 소리'(reading)는 낭송 엔진이 읽을 수 있게 한자·괄호·옛한글 자모가 없는지
// 6) 『분류 수첩』 가사 쪽 형식
// 7) 음성 사례: 일부러 망가뜨린 사본을 이 점검이 실제로 잡아내는지
import { validateSong, validateDataSet, validateNotebookPage, expectedRoles } from '../js/core/validate.js';
import { SONG_TABLE } from '../js/data/song-table.js';
import { songText } from '../js/core/song-shape.js';

let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

let songs = null;
let notebookPage = null;
try {
  ({ songs } = await import('../js/data/songs/gasa.js'));
  ({ notebookPage } = await import('../js/data/notebook-gasa.js'));
} catch (e) {
  fail('가사 데이터 파일을 읽을 수 없다: ' + e.message);
}

const GASA_IDS = Object.entries(SONG_TABLE.catalog).filter(([, e]) => e.genre === 'gasa').map(([id]) => id);
const TEXTBOOK_COMMON2 = '고등학교 공통국어2 교과서 수록본';
const ROOM_PLACES = ['수간모옥', '벽계수', '정자'];   // 「상춘곡」 방이 걷는 장소 가운데 교과서 수록 범위에 있는 것

// ── 점검 묶음(노래 목록과 수첩 쪽을 받아 문제 목록을 돌려준다) ──
function problems(list, page) {
  const out = [];
  const add = (m) => out.push(m);
  if (!Array.isArray(list)) return ['songs 배열이 없다'];

  // 1) 표의 가사 노래가 모두 있고, 남는 노래가 없다
  const ids = list.map((s) => s?.id);
  for (const id of GASA_IDS) if (!ids.includes(id)) add('표의 가사 노래가 없다: ' + id);
  for (const id of ids) if (!GASA_IDS.includes(id)) add('표에 없는 가사 노래: ' + id);

  // 2) 검증기와 역할
  for (const s of list) {
    const errs = validateSong(s, { table: SONG_TABLE });
    for (const e of errs) add('[' + e.code + '] ' + e.where + ': ' + e.message);
    const want = expectedRoles(SONG_TABLE, s?.id).map((r) => JSON.stringify(r)).sort();
    const got = (s?.roles ?? []).map((r) => JSON.stringify(r)).sort();
    if (JSON.stringify(want) !== JSON.stringify(got)) add(s?.id + ': 역할이 노래 표와 다르다');
    if (s?.genre !== 'gasa') add(s?.id + ': 가사 파일에 다른 갈래 노래');
  }
  const set = validateDataSet({ songs: list, notebook: page ? { gasa: page } : {} }, { table: SONG_TABLE });
  for (const e of set.errors) add('[' + e.code + '] ' + e.where + ': ' + e.message);

  // 3) 출처 규칙
  for (const s of list) {
    if (!s) continue;
    if (s.sourceType === 'textbook-common2') {
      if (s.citation !== TEXTBOOK_COMMON2) add(s.id + ': 공통국어2 교과서 노래의 출처 문구는 "' + TEXTBOOK_COMMON2 + '"여야 한다');
      if (s.verification !== 'verified') add(s.id + ': 교과서와 대조를 마친 노래는 verified여야 한다');
    } else if (s.verification !== 'pending') add(s.id + ': 교과서 밖 노래는 pending이어야 한다');
    if (s.sourceType === 'textbook-literature' && !/문학 교과서/.test(s.citationNote ?? '')) add(s.id + ': 문학 교과서 수록본으로 바꿀 예정이라는 메모가 없다');
    if (s.sourceType === 'exam' && !/2025학년도/.test(s.citation)) add(s.id + ': 수능 출제 연도가 출처 문구에 없다');
  }
  const byId = Object.fromEntries(list.filter(Boolean).map((s) => [s.id, s]));
  if (byId.sangchungok && byId.sangchungok.sourceType !== 'textbook-common2') add('sangchungok은 공통국어2 교과서 수록본이어야 한다');
  if (byId.samiingok && byId.samiingok.sourceType !== 'textbook-literature') add('samiingok은 문학 교과서 노래(textbook-literature)여야 한다');
  if (byId.gapminga) {
    if (byId.gapminga.sourceType !== 'exam') add('gapminga는 수능 출제작(exam)이어야 한다');
    if (!(byId.gapminga.singerGroups ?? []).includes('singer-commoner')) add('gapminga의 정답 무리에 가객·서민이 있어야 한다');
  }
  for (const id of ['gyuwonga', 'sangchungok']) if (byId[id] && byId[id].singer?.traditional !== true) add(id + ': 전해지는 귀속이므로 singer.traditional이 true여야 한다');

  // 4) 「상춘곡」 교과서 수록본 모양과 방의 장소
  const sc = byId.sangchungok;
  if (sc) {
    if (sc.units?.length !== 21) add('sangchungok은 교과서 수록본대로 21행이어야 한다(지금 ' + sc.units?.length + ')');
    const text = songText(sc, 'original');
    if (/[●*]/.test(text)) add('sangchungok 원문에 낱말 풀이 표시(●)나 별표가 남아 있다');
    if (!text.startsWith('홍진(紅塵)에 뭇친 분네') || !text.endsWith('곳나모 가지 것거 수 노코 먹으리라')) add('sangchungok의 처음과 끝이 교과서 수록 범위와 다르다');
    for (const p of ROOM_PLACES) if (!text.includes(p)) add('sangchungok 원문에 방의 장소 낱말이 없다: ' + p);
  }

  // 5) 오늘 소리
  const BAD_READING = /[㐀-䶿一-鿿豈-﫿()（）●*ᄀ-ᇿꥠ-꥿ힰ-퟿ㄱ-ㆎ]/;
  for (const s of list) {
    (s?.units ?? []).forEach((u, i) => (u?.feet ?? []).forEach((f, j) => {
      if (BAD_READING.test(f?.reading ?? '')) add(s.id + ' ' + (i + 1) + '행 ' + (j + 1) + '음보: 오늘 소리에 한자·괄호·옛한글 자모가 있다 (' + f.reading + ')');
    }));
  }

  // 6) 수첩 쪽
  if (!page) add('notebook-gasa.js의 notebookPage가 없다');
  else {
    for (const e of validateNotebookPage(page, 'gasa')) add('[' + e.code + '] ' + e.message);
    const covered = new Set((page.lines ?? []).flatMap((l) => l.conceptIds ?? []));
    for (const c of ['gasa-4beat', 'gasa-nolimit']) if (!covered.has(c)) add('수첩 쪽 줄이 개념 ' + c + '를 다루지 않는다');
  }
  return out;
}

console.log('\n[1] 실제 가사 데이터');
if (songs) {
  const list = problems(songs, notebookPage);
  check(list.length === 0, '가사 노래 ' + songs.length + '편과 수첩 쪽이 모든 점검을 통과한다');
  for (const m of list.slice(0, 60)) console.log('      - ' + m);
}

// ── 음성 사례: 망가뜨린 사본은 반드시 걸려야 한다 ──
console.log('\n[2] 음성 사례');
if (songs) {
  const cases = [
    ['노래 하나를 뺀다', (l) => l.filter((s) => s.id !== 'gyuwonga')],
    ['상춘곡 원문에 ● 표시를 남긴다', (l) => { l.find((s) => s.id === 'sangchungok').units[4].feet[0].original += '●'; return l; }],
    ['상춘곡 한 행을 지운다', (l) => { l.find((s) => s.id === 'sangchungok').units.pop(); return l; }],
    ['교과서 밖 노래를 verified로 바꾼다', (l) => { l.find((s) => s.id === 'seonsangtan').verification = 'verified'; return l; }],
    ['교과서 출처 문구에 다른 말을 붙인다', (l) => { l.find((s) => s.id === 'sangchungok').citation += '(어느 출판사)'; return l; }],
    ['오늘 소리에 한자를 남긴다', (l) => { l.find((s) => s.id === 'gwandong-byeolgok').units[0].feet[0].reading = '강호(江湖)에'; return l; }],
    ['오늘 소리에 옛한글 자모를 남긴다', (l) => { l.find((s) => s.id === 'myeonangjeongga').units[0].feet[1].reading = 'ᄒᆞᆫ 활기 뫼히'; return l; }],
    ['기념품 낱말을 노래에 없는 말로 바꾼다', (l) => { const k = l.find((s) => s.id === 'gyuwonga').keepsake; k.word = '거울'; k.phrase = '거울'; return l; }],
    ['역할을 바꾼다(길 잃은 노래의 도착 관)', (l) => { l.find((s) => s.id === 'nuhangsa').roles[0].to = 'sijo'; return l; }],
    ['4음보 행을 80% 밑으로 떨어뜨린다', (l) => { const s = l.find((x) => x.id === 'gwandong-byeolgok'); s.units.forEach((u, i) => { if (i % 3 === 0) u.feet = u.feet.slice(0, 3); }); return l; }],
    ['갑민가의 정답 무리를 지운다', (l) => { l.find((s) => s.id === 'gapminga').singerGroups = ['monk-hwarang']; return l; }],
    ['상춘곡의 전해지는 귀속 표시를 지운다', (l) => { delete l.find((s) => s.id === 'sangchungok').singer.traditional; return l; }],
  ];
  for (const [name, mutate] of cases) {
    const found = problems(mutate(structuredClone(songs)), structuredClone(notebookPage));
    check(found.length > 0, name + ' → ' + (found.length ? '잡힘 (' + found[0].slice(0, 60) + ')' : '잡히지 않음'));
  }
  const brokenPage = structuredClone(notebookPage);
  brokenPage.lines = brokenPage.lines.filter((l) => !l.conceptIds.includes('gasa-nolimit'));
  const found = brokenPage.lines.length ? problems(structuredClone(songs), brokenPage) : ['빈 줄'];
  check(found.length > 0, '수첩 쪽에서 개념 하나를 빼면 잡힌다');
}

console.log('\n' + (failures ? '✗ 실패 ' + failures + '건' : '✓ 가사 점검 통과'));
process.exit(failures ? 1 : 0);
