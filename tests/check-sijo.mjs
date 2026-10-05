// 시조 노래 글 점검(T22). 단독 실행: node tests/check-sijo.mjs
// 1) 시조 갈래 파일이 검증기를 오류 없이 통과하고, 노래 표의 시조 열두 편이 모두 있다.
// 2) 시조에만 해당하는 약속: 교과서 노래의 출처·제목, 교과서 밖 노래의 확인 상태, 보스 낯선 노래, 설화 표시.
// 3) 음성 사례: 실제 시조 데이터를 일부러 망가뜨리면 이 점검과 검증기가 잡아낸다.
import { validateDataSet } from '../js/core/validate.js';
import { SONG_TABLE } from '../js/data/song-table.js';
import { finalFirstFootSyllables, songText, squash } from '../js/core/song-shape.js';

let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

let songs = [];
let notebookPage = null;
try {
  ({ songs } = await import('../js/data/songs/sijo.js'));
} catch (e) {
  fail('js/data/songs/sijo.js를 불러올 수 없다: ' + e.message);
}
try {
  ({ notebookPage } = await import('../js/data/notebook-sijo.js'));
} catch (e) {
  fail('js/data/notebook-sijo.js를 불러올 수 없다: ' + e.message);
}

const SIJO_IDS = Object.entries(SONG_TABLE.catalog).filter(([, e]) => e.genre === 'sijo').map(([id]) => id).sort();
const TEXTBOOK_TITLE = '십 년을 경영하야';
const LEGEND_IDS = ['imomi-jukgo', 'ireondeul'];

// 시조에만 해당하는 약속을 보고, 어긋난 까닭 목록을 돌려준다(빈 목록이면 통과).
function sijoRules(list) {
  const out = [];
  const byId = new Map((Array.isArray(list) ? list : []).map((s) => [s?.id, s]));
  const ids = [...byId.keys()].sort();
  if (JSON.stringify(ids) !== JSON.stringify(SIJO_IDS)) out.push('시조 id가 노래 표와 다르다: ' + ids.join(','));

  const room = byId.get('simnyeon-gyeongyeong');
  if (!room) out.push('작품 방 노래가 없다');
  else {
    if (room.title !== TEXTBOOK_TITLE) out.push('작품 방 노래 제목이 교과서 표기(' + TEXTBOOK_TITLE + ')가 아니다');
    if (room.sourceType !== 'textbook-common2') out.push('작품 방 노래의 sourceType이 textbook-common2가 아니다');
    if (!String(room.citation ?? '').includes('고등학교 공통국어2 교과서 수록본')) out.push('작품 방 노래의 출처 문구가 교과서 수록본 표기가 아니다');
    const words = squash(songText(room, 'original') + songText(room, 'gloss'));
    for (const w of ['나', '달', '청풍', '강산']) if (!words.includes(w)) out.push('작품 방이 쓰는 물건 ' + w + '가 노래 글에 없다');
  }

  for (const s of byId.values()) {
    if (!s) continue;
    const textbook = s.sourceType === 'textbook-common2' || s.sourceType === 'textbook-literature';
    if (!textbook && s.verification !== 'pending') out.push(s.id + ': 교과서 밖 노래는 verification이 pending이어야 한다');
    if (finalFirstFootSyllables(s) !== 3) out.push(s.id + ': 종장 첫 음보가 세 글자가 아니다');
    const legend = s.legend === true;
    if (legend !== LEGEND_IDS.includes(s.id)) out.push(s.id + ': legend 표시가 맞지 않다(설화 장면은 「이런들 어떠하며」·「이 몸이 죽고 죽어」만)');
  }

  const boss = byId.get('sinheum-sijo');
  if (!boss) out.push('보스 낯선 노래가 없다');
  else {
    if (typeof boss.title !== 'string' || !boss.title.trim()) out.push('보스 낯선 노래의 제목을 정하지 않았다');
    if (boss.sourceType !== 'exam') out.push('보스 낯선 노래의 sourceType이 exam이 아니다');
    if (!String(boss.citation ?? '').includes('2021학년도')) out.push('보스 낯선 노래 출처에 출제 시험(2021학년도)이 없다');
    if (boss.singer?.name !== '신흠') out.push('보스 낯선 노래의 가객이 신흠이 아니다');
    if (!Array.isArray(boss.singerGroups) || !boss.singerGroups.includes('literati-gisaeng')) out.push('보스 낯선 노래의 singerGroups에 사대부·기녀 무리가 없다');
  }
  return out;
}

// ── 1. 검증기 ──
console.log('\n[1] 시조 갈래 데이터 검증');
{
  const { errors, genres } = validateDataSet({ songs, notebook: notebookPage ? { sijo: notebookPage } : {} }, { table: SONG_TABLE });
  const st = genres.sijo;
  check(st?.status === 'present' && st.count === SIJO_IDS.length, '시조 ' + SIJO_IDS.length + '편이 모두 있다 (' + (st?.count ?? 0) + '편)');
  check(errors.length === 0, '검증 오류 없음 (' + errors.length + '개)');
  for (const e of errors.slice(0, 40)) console.log('      - [' + e.code + '] ' + e.where + ': ' + e.message);
  check(!!notebookPage && notebookPage.genre === 'sijo', '『분류 수첩』 시조 쪽이 있다');
}

// ── 2. 시조 약속 ──
console.log('\n[2] 시조 약속');
{
  const problems = sijoRules(songs);
  check(problems.length === 0, '교과서 노래·교과서 밖 노래·보스 낯선 노래·설화 표시 약속을 지킨다');
  for (const p of problems) console.log('      - ' + p);
}

// ── 3. 음성 사례 ──
console.log('\n[3] 음성 사례 (망가뜨린 데이터를 잡아내는지)');
{
  const mutated = (fn) => { const copy = structuredClone(songs); fn(copy); return copy; };
  const get = (list, id) => list.find((s) => s.id === id);
  const codesOf = (list) => [...new Set(validateDataSet({ songs: list }, { table: SONG_TABLE }).errors.map((e) => e.code))];
  const ruleHits = (list, needle) => sijoRules(list).some((p) => p.includes(needle));

  if (songs.length === 0) fail('시조 데이터가 없어 음성 사례를 돌릴 수 없다');
  else {
    const a = mutated((l) => get(l, 'simnyeon-gyeongyeong').units[1].feet.pop());
    check(codesOf(a).includes('FORM'), '중장 음보 하나를 빼면 형식 오류(FORM)');

    const b = mutated((l) => { const k = get(l, 'dongjitdal').keepsake; k.word = '비단'; k.phrase = '비단 이불'; });
    check(codesOf(b).includes('KEEPSAKE'), '노래에 없는 기념품 물건이면 KEEPSAKE');

    const c = mutated((l) => { get(l, 'ireondeul').legend = false; });
    check(ruleHits(c, 'legend'), '「이런들 어떠하며」의 설화 표시를 빼면 잡는다');

    const d = mutated((l) => { get(l, 'simnyeon-gyeongyeong').title = '십 년을 경영하여'; });
    check(ruleHits(d, '교과서 표기'), '작품 방 제목을 교과서 표기와 다르게 쓰면 잡는다');

    const e = mutated((l) => { get(l, 'sakpung').verification = 'verified'; });
    check(ruleHits(e, 'pending'), '교과서 밖 노래를 verified로 두면 잡는다');

    const f = mutated((l) => { get(l, 'sinheum-sijo').singerGroups = ['singer-commoner']; });
    check(ruleHits(f, 'singerGroups'), '신흠 시조의 향유층 무리가 틀리면 잡는다');

    const g = mutated((l) => { get(l, 'taesan').units[2].feet[0].reading = '사람이여'; });
    check(codesOf(g).includes('FORM') && ruleHits(g, '세 글자'), '종장 첫 음보가 네 글자면 잡는다');

    const h = mutated((l) => l.splice(l.findIndex((s) => s.id === 'eojeo-nae-iriyeo'), 1));
    check(codesOf(h).includes('MISSING'), '시조 한 편이 빠지면 MISSING');
  }
}

console.log('\n' + (failures ? '✗ 실패 ' + failures + '건' : '✓ 시조 점검 통과'));
process.exit(failures ? 1 : 0);
