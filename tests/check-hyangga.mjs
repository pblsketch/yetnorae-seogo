// 향가 노래 글 점검(T20). spec 4.2·4.4·7.3·10.2·16절, js/data/README.md 4절.
// 1) 향가 노래 여덟 편이 노래 표대로 모두 있고, 검증기를 통과하며, 개념이 먹이 될 수 있다.
// 2) 향가만의 약속: 김완진 해독, 출처 종류와 확인 상태, 구 수, 9구 감탄사, 보스 낯선 노래의 무리, 수첩 쪽.
// 3) 음성 사례: 일부러 망가뜨린 사본을 이 점검이 실제로 잡아내는지 본다.
import { validateDataSet, validateSong, validateNotebookPage } from '../js/core/validate.js';
import { SONG_TABLE } from '../js/data/song-table.js';
import { HYANGGA_GU_COUNTS } from '../js/core/song-shape.js';

let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

// 출판사 이름은 글자 번호로만 다룬다(이 파일에도 글자 그대로 쓰지 않는다).
const FORBIDDEN = String.fromCodePoint(0xc9c0, 0xd559, 0xc0ac);

// 노래마다 기대하는 구 수와 출처 종류, 확인 상태
const EXPECT = {
  'seodongyo': { gu: 4, sourceType: 'old-text', verification: 'pending' },
  'cheoyongga': { gu: 8, sourceType: 'old-text', verification: 'pending' },
  'chan-giparangga': { gu: 10, sourceType: 'textbook-literature', verification: 'pending' },
  'jemangmaega': { gu: 10, sourceType: 'textbook-common2', verification: 'verified' },
  'heonhwaga': { gu: 4, sourceType: 'old-text', verification: 'pending' },
  'mojukjirangga': { gu: 8, sourceType: 'old-text', verification: 'pending' },
  'anminga': { gu: 10, sourceType: 'old-text', verification: 'pending' },
  'wonwangsaengga': { gu: 10, sourceType: 'old-text', verification: 'pending' },
};

// 향가만의 약속을 본다. 문제 목록을 돌려준다.
function checkHyangga(songs, notebookPage) {
  const out = [];
  const byId = new Map(songs.map((s) => [s?.id, s]));
  const tableIds = Object.entries(SONG_TABLE.catalog).filter(([, e]) => e.genre === 'hyangga').map(([id]) => id);
  for (const id of tableIds) if (!byId.has(id)) out.push(id + ': 노래가 없다');
  for (const s of songs) if (s?.genre !== 'hyangga') out.push((s?.id ?? '?') + ': 향가 파일에 다른 갈래 노래가 있다');

  for (const [id, exp] of Object.entries(EXPECT)) {
    const s = byId.get(id);
    if (!s) continue;
    const n = Array.isArray(s.units) ? s.units.length : 0;
    if (n !== exp.gu) out.push(id + ': ' + exp.gu + '구여야 하는데 ' + n + '구다');
    if (s.sourceType !== exp.sourceType) out.push(id + ': sourceType이 ' + exp.sourceType + '여야 한다');
    if (s.verification !== exp.verification) out.push(id + ': verification이 ' + exp.verification + '여야 한다');
    if (s.decipherment?.scholar !== '김완진') out.push(id + ': 해독 학자는 교과서와 같은 김완진이어야 한다');
    // 오늘 소리에는 옛한글 자모·한자가 남지 않는다(낭송 엔진이 읽을 수 있게)
    (s.units ?? []).forEach((u, i) => {
      if (/[ᄀ-ᇿꥠ-꥿ힰ-퟿㐀-鿿豈-﫿]/.test(u?.reading ?? '')) out.push(id + ' ' + (i + 1) + '구: reading에 옛한글 자모나 한자가 남아 있다');
    });
    // 10구체는 4·4·2 무리와 9구 감탄사를 표시하고, 증거 개념 셋을 모두 가진다
    if (n === 10) {
      if (JSON.stringify(s.features?.grouping) !== '[4,4,2]') out.push(id + ': 10구체 grouping [4,4,2]가 없다');
      const ex = s.features?.exclamation;
      if (!ex || ex.unit !== 8 || !String(s.units[8]?.reading ?? '').startsWith(ex.text)) out.push(id + ': 9구 감탄사 표시가 없거나 9구 reading 첫머리와 다르다');
      for (const c of ['hyangga-lines', 'hyangga-442', 'hyangga-exclaim']) if (!(s.evidences ?? []).includes(c)) out.push(id + ': evidences에 ' + c + '가 없다');
    } else if (!(s.evidences ?? []).includes('hyangga-lines')) out.push(id + ': evidences에 hyangga-lines가 없다');
    // 교과서 노래 출처 문구
    if (exp.sourceType === 'textbook-common2' && !String(s.citation ?? '').includes('고등학교 공통국어2 교과서 수록본')) out.push(id + ': 출처 문구가 "고등학교 공통국어2 교과서 수록본"이 아니다');
    if (exp.sourceType === 'textbook-literature' && !/문학 교과서/.test(String(s.citationNote ?? ''))) out.push(id + ': 문학 교과서 수록본으로 바꿀 예정이라는 메모가 없다');
    if (JSON.stringify(s).includes(FORBIDDEN)) out.push(id + ': 출판사 이름이 들어 있다');
  }

  // 보스 낯선 노래: 승려·화랑 무리, 근거 메모
  const boss = byId.get('wonwangsaengga');
  if (boss) {
    if (JSON.stringify(boss.singerGroups) !== JSON.stringify(['monk-hwarang'])) out.push('wonwangsaengga: singerGroups가 승려·화랑(monk-hwarang)이어야 한다');
    if (!/singerGroups/.test(String(boss.citationNote ?? ''))) out.push('wonwangsaengga: citationNote에 singerGroups 근거가 없다');
  }

  // 수첩 쪽
  if (!notebookPage) out.push('수첩 쪽이 없다');
  else {
    for (const e of validateNotebookPage(notebookPage, 'hyangga')) out.push('수첩: ' + e.message);
    const covered = new Set((notebookPage.lines ?? []).flatMap((l) => l.conceptIds ?? []));
    for (const c of ['hyangga-lines', 'hyangga-442', 'hyangga-exclaim']) if (!covered.has(c)) out.push('수첩: 개념 ' + c + '를 짚는 줄이 없다');
    if (JSON.stringify(notebookPage).includes(FORBIDDEN)) out.push('수첩: 출판사 이름이 들어 있다');
  }
  return out;
}

// ── 실제 데이터 ──
console.log('\n[1] 향가 노래 글');
let songs = [];
let notebookPage = null;
try {
  ({ songs } = await import('../js/data/songs/hyangga.js'));
  ({ notebookPage } = await import('../js/data/notebook-hyangga.js'));
} catch (e) {
  fail('향가 데이터 파일을 읽을 수 없다: ' + e.message);
}
{
  const { errors, genres } = validateDataSet({ songs, notebook: notebookPage ? { hyangga: notebookPage } : {} }, { table: SONG_TABLE });
  check(genres.hyangga?.status === 'present' && genres.hyangga.count === 8, '향가 노래 여덟 편이 들어와 있다 (' + (genres.hyangga?.count ?? 0) + '편)');
  check(errors.length === 0, '검증기(형식·증거·기념품·노래 표·먹 가능성·수첩) 오류 없음 (' + errors.length + '개)');
  for (const e of errors.slice(0, 40)) console.log('      - [' + e.code + '] ' + e.where + ': ' + e.message);
  const own = checkHyangga(songs, notebookPage);
  check(own.length === 0, '향가 약속(김완진 해독, 출처, 구 수, 감탄사, 보스 무리, 수첩) 문제 없음 (' + own.length + '개)');
  for (const m of own.slice(0, 40)) console.log('      - ' + m);
  check(songs.every((s) => HYANGGA_GU_COUNTS.includes(s.units?.length)), '모든 노래가 4·8·10구 가운데 하나다');
}

// ── 음성 사례 ──
console.log('\n[2] 음성 사례 (망가뜨린 사본을 잡는가)');
const negatives = [
  ['제망매가의 9구 감탄사 표시를 지움', (list) => { delete list.find((s) => s.id === 'jemangmaega').features.exclamation; }],
  ['찬기파랑가를 9구로 줄임', (list) => { list.find((s) => s.id === 'chan-giparangga').units.pop(); }],
  ['처용가 해독 학자를 다른 학자로 바꿈', (list) => { list.find((s) => s.id === 'cheoyongga').decipherment.scholar = '양주동'; }],
  ['제망매가를 pending으로 둠', (list) => { list.find((s) => s.id === 'jemangmaega').verification = 'pending'; }],
  ['원왕생가의 singerGroups를 다른 무리로 바꿈', (list) => { list.find((s) => s.id === 'wonwangsaengga').singerGroups = ['singer-commoner']; }],
  ['서동요를 뺌', (list) => { list.splice(list.findIndex((s) => s.id === 'seodongyo'), 1); }],
  ['헌화가 오늘 소리에 옛한글을 남김', (list) => { list.find((s) => s.id === 'heonhwaga').units[0].reading = 'ᄀᆞᅀᅢ'; }],
];
for (const [name, mutate] of negatives) {
  if (!songs.length) { fail(name + ' — 데이터가 없어 볼 수 없다'); continue; }
  const copy = structuredClone(songs);
  mutate(copy);
  const caught = checkHyangga(copy, notebookPage).length > 0 || validateDataSet({ songs: copy }, { table: SONG_TABLE }).errors.length > 0;
  check(caught, name + ' → ' + (caught ? '잡힘' : '잡히지 않음'));
}
{
  const bad = notebookPage ? { ...structuredClone(notebookPage), lines: [{ id: 'x', conceptIds: ['sijo-3jang'], text: '다른 갈래 개념' }] } : null;
  check(!!bad && checkHyangga(songs, bad).length > 0, '수첩 줄이 다른 갈래 개념을 쓰면 잡힘');
}
{
  const s = songs.find((x) => x.id === 'seodongyo');
  const broken = s ? { ...structuredClone(s), keepsake: { ...s.keepsake, word: '해금', phrase: '해금을 켜는' } } : null;
  check(!!broken && validateSong(broken, { table: SONG_TABLE }).some((e) => e.code === 'KEEPSAKE'), '노래에 없는 기념품 물건은 잡힘');
}

console.log('\n' + (failures ? '✗ 실패 ' + failures + '건' : '✓ 향가 점검 통과'));
process.exit(failures ? 1 : 0);
