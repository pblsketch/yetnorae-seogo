// 가사 노래 글 점검(T23).
// 1) js/data/songs/gasa.js에 노래 표의 가사 노래가 모두, 표가 정한 역할대로 들어 있는지
// 2) 노래마다 검증기(형식·증거·기념품·출처·노래 표)를 통과하고, 가사 갈래만으로 먹이 될 수 있는지
// 3) 출처 규칙: 교과서 노래는 출판사 이름 없는 출처 문구와 verified, 그 밖은 pending
// 4) 「상춘곡」은 교과서 수록본 21행이 그대로·차례대로 있고(낱말 풀이 표시 ● 없음), 그 뒤에 옛 문헌 원문(교과서 밖 원문)이
//    산봉우리 대목과 공명·부귀 마무리까지 이어 붙어 있으며, 이어 붙인 행마다 beyondTextbook 표시와 출처가 있는지(추가 제안 F1)
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

// 「상춘곡」 교과서 수록본 21행(교사 대조를 마친 글). [음보 원문을 띄어 이은 글, 풀이]. 이 부분은 한 글자도 바뀌면 안 된다.
const SC_TEXTBOOK = [
  ['홍진(紅塵)에 뭇친 분네 이내 생애(生涯) 엇더ᄒᆞᆫ고', '속세에 묻힌 분들, 이내 생애 어떠한가.'],
  ['녯사ᄅᆞᆷ 풍류(風流)ᄅᆞᆯ 미ᄎᆞᆯ가 ᄆᆞᆺ 미ᄎᆞᆯ가', '옛사람 풍류에 미칠까 못 미칠까.'],
  ['천지간(天地間) 남자(男子) 몸이 날만 ᄒᆞᆫ 이 하건마ᄂᆞᆫ', '이 세상 남자 몸이 나만 한 이 많건마는'],
  ['산림(山林)에 뭇쳐 이셔 지락(至樂)을 ᄆᆞᄅᆞᆯ 것가', '자연에 묻혀 산다고 즐거움을 모르겠는가.'],
  ['수간모옥(數間茅屋)을 벽계수(碧溪水) 앏픠 두고', '초가집 몇 칸을 푸른 시내 앞에 두고'],
  ['송죽(松竹) 울울리(鬱鬱裏)에 풍월주인(風月主人) 되어셔라', '송죽 울창한 곳에 자연의 주인 되었구나.'],
  ['엇그제 겨을 지나 새봄이 도라오니', '엊그제 겨울 지나 새봄이 돌아오니'],
  ['도화 행화(桃花杏花)ᄂᆞᆫ 석양리(夕陽裏)에 퓌여 잇고', '복숭아꽃, 살구꽃은 석양에 피어 있고'],
  ['녹양방초(綠楊芳草)ᄂᆞᆫ 세우 중(細雨中)에 프르도다', '푸른 버들, 향긋한 풀은 가랑비에 푸르도다.'],
  ['칼로 ᄆᆞᆯ아 낸가 붓으로 그려 낸가', '칼로 재단했는가, 붓으로 그려 냈는가.'],
  ['조화 신공(造化神功)이 물물(物物)마다 헌ᄉᆞᄅᆞᆸ다', '조물주의 솜씨가 사물마다 신비롭구나.'],
  ['수풀에 우ᄂᆞᆫ 새ᄂᆞᆫ 춘기(春氣)ᄅᆞᆯ ᄆᆞᆺ내 계워 소ᄅᆡ마다 교태(嬌態)로다', '수풀에 우는 새는 봄 흥취에 겨워 소리마다 교태로다.'],
  ['물아일체(物我一體)어니 흥(興)이ᄋᆡ 다ᄅᆞᆯ소냐', '물아일체이니 흥이야 다를쏘냐.'],
  ['시비(柴扉)예 거러 보고 정자(亭子)애 안자 보니', '사립문 주변을 걸어 보고 정자에도 앉아 보고'],
  ['소요음영(逍遙吟詠)ᄒᆞ야 산일(山日)이 적적(寂寂)ᄒᆞᆫᄃᆡ', '산보하며 읊조리니 산중 생활 적적한데,'],
  ['한중진미(閒中眞味)ᄅᆞᆯ 알 니 업시 호재로다', '한가함 속 즐거움을 알 이 없이 혼자로다.'],
  ['이바 니웃드라 산수(山水) 구경 가쟈스라', '이봐, 이웃들아, 산수 구경 가자꾸나.'],
  ['답청(踏靑)으란 오ᄂᆞᆯ ᄒᆞ고 욕기(浴沂)란 내일(來日) ᄒᆞ새', '답청은 오늘 하고 욕기는 내일 하세.'],
  ['아ᄎᆞᆷ에 채산(採山)ᄒᆞ고 나조ᄒᆡ 조수(釣水)ᄒᆞ새', '아침에 나물 캐고 저녁에 낚시하세.'],
  ['ᄀᆞᆺ 괴여 닉은 술을 갈건(葛巾)으로 밧타 노코', '갓 익은 술을 갈건으로 걸러 놓고'],
  ['곳나모 가지 것거 수 노코 먹으리라', '꽃나무 가지 꺾어 잔 수 세며 먹으리라.'],
];
// 이어 붙인 교과서 밖 원문: 교과서 끝 행 바로 다음 행으로 시작해 작품 끝 행으로 끝나고, 산봉우리 대목과 공명·부귀 마무리를 품는다.
const SC_BEYOND_FIRST = '화풍(和風)이';
const SC_BEYOND_LAST = '이만ᄒᆞᆫᄃᆞᆯ 엇지ᄒᆞ리';
const SC_BEYOND_WORDS = ['봉두(峰頭)에', '구름 소긔', '공명(功名)도', '부귀(富貴)도', '단표누항(簞瓢陋巷)에'];
const unitOriginal = (u) => (u?.feet ?? []).map((f) => f?.original ?? '').join(' ');

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
      const beyond = (s.units ?? []).some((u) => u?.beyondTextbook === true);
      if (!beyond && s.verification !== 'verified') add(s.id + ': 교과서와 대조를 마친 노래는 verified여야 한다');
      if (beyond && s.verification !== 'pending') add(s.id + ': 교과서 밖 원문을 이어 붙인 노래는 그 부분이 확인 대기이므로 pending이어야 한다');
      if (beyond && !/교과서 밖 원문/.test(s.citationNote ?? '')) add(s.id + ': citationNote에 교과서 밖 원문의 출처와 확인 범위 설명이 없다');
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

  // 4) 「상춘곡」 교과서 수록본 모양, 이어 붙인 교과서 밖 원문, 방의 장소
  const sc = byId.sangchungok;
  if (sc) {
    const units = sc.units ?? [];
    const textbookUnits = units.slice(0, SC_TEXTBOOK.length);
    const beyondUnits = units.slice(SC_TEXTBOOK.length);
    // 교과서 수록본 21행: 그대로, 차례대로, 표시 없이
    SC_TEXTBOOK.forEach(([orig, gloss], i) => {
      const u = textbookUnits[i];
      if (unitOriginal(u) !== orig) add('sangchungok ' + (i + 1) + '행 원문이 교과서 수록본과 다르다(지금 ' + unitOriginal(u) + ')');
      if (u?.gloss !== gloss) add('sangchungok ' + (i + 1) + '행 풀이가 교과서 수록본과 다르다');
      if (u && u.beyondTextbook !== undefined) add('sangchungok ' + (i + 1) + '행은 교과서 수록본인데 교과서 밖 표시가 있다');
      if (u && u.sourceNote !== undefined) add('sangchungok ' + (i + 1) + '행은 교과서 수록본인데 sourceNote가 있다');
    });
    const textbookText = textbookUnits.map(unitOriginal).join(' ');
    if (/[●*]/.test(songText(sc, 'original'))) add('sangchungok 원문에 낱말 풀이 표시(●)나 별표가 남아 있다');
    for (const p of ROOM_PLACES) if (!textbookText.includes(p)) add('sangchungok 교과서 수록본에 방의 장소 낱말이 없다: ' + p);
    // 이어 붙인 부분: 행마다 표시와 출처, 이어지는 처음과 끝, 산봉우리·공명·부귀 대목
    if (beyondUnits.length === 0) add('sangchungok: 교과서 대목 뒤에 이어 붙인 교과서 밖 원문이 없다');
    beyondUnits.forEach((u, j) => {
      const n = SC_TEXTBOOK.length + j + 1;
      if (u?.beyondTextbook !== true) add('sangchungok ' + n + '행: 이어 붙인 행인데 beyondTextbook: true 표시가 없다');
      if (typeof u?.sourceNote !== 'string' || !u.sourceNote.includes('위키문헌')) add('sangchungok ' + n + '행: 이어 붙인 행의 출처(sourceNote)가 없다');
      if (typeof u?.gloss !== 'string' || !u.gloss.trim()) add('sangchungok ' + n + '행: 풀이가 없다');
    });
    const beyondText = beyondUnits.map(unitOriginal).join(' ');
    if (beyondUnits.length && !beyondText.startsWith(SC_BEYOND_FIRST)) add('sangchungok: 이어 붙인 원문이 교과서 끝 행 바로 다음 행(' + SC_BEYOND_FIRST + ' …)으로 시작하지 않는다');
    if (beyondUnits.length && !beyondText.endsWith(SC_BEYOND_LAST)) add('sangchungok: 이어 붙인 원문이 작품 끝 행(… ' + SC_BEYOND_LAST + ')으로 끝나지 않는다');
    for (const w of SC_BEYOND_WORDS) if (!beyondText.includes(w)) add('sangchungok: 이어 붙인 원문에 "' + w + '"가 없다');
    if (sc.keepsake && !textbookText.includes(sc.keepsake.phrase)) add('sangchungok: 기념품 구절은 교과서 수록본에서 골라야 한다');
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
    ['상춘곡 끝 행(이어 붙인 원문의 마지막)을 지운다', (l) => { l.find((s) => s.id === 'sangchungok').units.pop(); return l; }],
    ['상춘곡 교과서 행 하나를 지운다', (l) => { l.find((s) => s.id === 'sangchungok').units.splice(3, 1); return l; }],
    ['상춘곡 교과서 행 두 개의 차례를 바꾼다', (l) => { const u = l.find((s) => s.id === 'sangchungok').units; [u[1], u[2]] = [u[2], u[1]]; return l; }],
    ['상춘곡 교과서 행의 한 글자를 바꾼다', (l) => { l.find((s) => s.id === 'sangchungok').units[0].feet[1].original = '무친 분네'; return l; }],
    ['상춘곡 교과서 행 풀이를 바꾼다', (l) => { l.find((s) => s.id === 'sangchungok').units[20].gloss = '꽃가지 꺾어 먹으리라.'; return l; }],
    ['상춘곡 교과서 행에 교과서 밖 표시를 붙인다', (l) => { l.find((s) => s.id === 'sangchungok').units[20].beyondTextbook = true; return l; }],
    ['상춘곡 이어 붙인 행의 교과서 밖 표시를 지운다', (l) => { delete l.find((s) => s.id === 'sangchungok').units[25].beyondTextbook; return l; }],
    ['상춘곡 이어 붙인 행의 출처를 지운다', (l) => { delete l.find((s) => s.id === 'sangchungok').units[21].sourceNote; return l; }],
    ['상춘곡 이어 붙인 원문을 모두 지운다', (l) => { const s = l.find((x) => x.id === 'sangchungok'); s.units = s.units.slice(0, 21); return l; }],
    ['상춘곡 산봉우리(봉두) 행을 지운다', (l) => { const u = l.find((s) => s.id === 'sangchungok').units; u.splice(u.findIndex((x) => unitOriginal(x).includes('봉두')), 1); return l; }],
    ['상춘곡 이어 붙인 원문 첫 행을 건너뛴다', (l) => { l.find((s) => s.id === 'sangchungok').units.splice(21, 1); return l; }],
    ['상춘곡을 verified로 올린다(이어 붙인 부분은 확인 대기)', (l) => { l.find((s) => s.id === 'sangchungok').verification = 'verified'; return l; }],
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
