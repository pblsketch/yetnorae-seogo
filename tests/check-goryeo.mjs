// 고려가요 노래 글 점검(T21).
// 검증기(js/core/validate.js)가 보는 형식·표·출처·기념품 위에, 고려가요관이 기대는 약속을 더 본다.
//  - 표에 있는 고려가요 여덟 편이 모두 있고, 검증기 오류가 없다
//  - evidences가 features·units에서 나오는 개념을 빠뜨리지 않는다(deriveConcepts와 같다)
//  - 후렴·여음 구간이 실제로 그 글자를 가리킨다(알려진 표기 차이만 따로 허용)
//  - 출처 종류: 「정석가」는 문학 교과서 자리(pending, 교체 예정 메모), 나머지는 옛 문헌(pending)
//  - 「정석가」: 6연(1연 3줄, 2~6연 6줄), 불가능한 조건들, 마지막 연이 「서경별곡」 둘째 연과 같은 사설
//  - 「동동」은 두 달치(정월·이월), 「정읍사」 카드 문구, 「사모곡」 보스 무리
//  - 「가시리」는 물건이 없어 '노래 속 마음' 카드(keepsake.kind: 'mind', 추가 제안 F1)이고 카드 한 줄(cardNote)이 있다
//  - 『분류 수첩』 고려가요 쪽이 형식에 맞고 개념 셋을 모두 다룬다
// 음성 사례: 데이터를 일부러 망가뜨려 이 점검이 실제로 잡는지 확인한다.
import { validateDataSet, validateNotebookPage } from '../js/core/validate.js';
import { deriveConcepts, squash } from '../js/core/song-shape.js';
import { SONG_TABLE } from '../js/data/song-table.js';
import { conceptsOfGenre } from '../js/data/concepts.js';

let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

let mod;
let nb;
try {
  mod = await import('../js/data/songs/goryeo.js');
  nb = await import('../js/data/notebook-goryeo.js');
} catch (e) {
  console.log('  ✗ 고려가요 데이터 파일을 읽을 수 없다: ' + e.message);
  process.exit(1);
}

const GENRE = 'goryeo';
const EXPECTED_IDS = Object.entries(SONG_TABLE.catalog).filter(([, e]) => e.genre === GENRE).map(([id]) => id).sort();
const CARD_NOTE_JEONGEUP = '백제 노래, 고려 궁중에서 불리며 여음이 붙어 전해짐';

// 후렴 글자와 구간 글자가 조금 다른, 원문 그대로의 표기 차이(바로잡지 않는다)
const KNOWN_VARIANTS = {
  // 『악장가사』 1연만 '얄랑셩', 2~8연은 '얄라셩'
  'cheongsan-byeolgok': ['얄리얄리얄랑셩얄라리얄라'],
  // 2연만 '님믈', 3~5연은 '님'
  'jeongseokga': ['有德ᄒᆞ신님믈여ᄒᆡᄋᆞ와지이다'],
};

const lineText = (song, u, l, from, to, layer = 'original') =>
  (song.units?.[u]?.lines?.[l]?.feet ?? []).slice(from, to + 1).map((f) => f?.[layer] ?? '').join(' ');
const stanzaText = (song, u, layer = 'original') =>
  (song.units?.[u]?.lines ?? []).map((l) => (layer === 'gloss' ? l.gloss : (l.feet ?? []).map((f) => f[layer]).join(' '))).join('\n');

// 고려가요 데이터 묶음을 점검해 문제 목록을 돌려준다(음성 사례에도 그대로 쓴다).
function inspect(songs, page) {
  const problems = [];
  const bad = (m) => problems.push(m);
  const get = (id) => songs.find((s) => s?.id === id);

  // 1) 검증기
  const { errors, genres } = validateDataSet({ songs, notebook: { [GENRE]: page } }, { table: SONG_TABLE });
  for (const e of errors) bad('검증기 [' + e.code + '] ' + e.where + ': ' + e.message);
  if (genres[GENRE]?.status !== 'present') bad('고려가요 노래가 들어와 있지 않다');

  // 2) id 목록
  const ids = songs.map((s) => s?.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(EXPECTED_IDS)) bad('노래 id가 표와 다르다: ' + ids.join(', '));

  for (const s of songs) {
    if (!s || s.genre !== GENRE) { bad((s?.id ?? '?') + ': 고려가요가 아닌 노래가 섞였다'); continue; }
    // 3) evidences = 나올 수 있는 개념 전부
    const want = [...deriveConcepts(s)].sort();
    const have = [...(s.evidences ?? [])].sort();
    if (JSON.stringify(want) !== JSON.stringify(have)) bad(s.id + ': evidences ' + have.join(',') + ' ≠ 나올 수 있는 개념 ' + want.join(','));

    // 4) 후렴·여음 구간이 그 글자를 가리킨다
    for (const r of s.features?.refrains ?? []) {
      for (const g of r.ranges ?? []) {
        const got = squash(lineText(s, g.unit, g.line, g.from, g.to));
        if (got !== squash(r.text) && !(KNOWN_VARIANTS[s.id] ?? []).includes(got)) {
          bad(s.id + ': 후렴 "' + r.text + '"의 구간 ' + JSON.stringify(g) + '이 "' + got + '"를 가리킨다');
        }
      }
    }

    // 5) 출처
    if (s.verification !== 'pending') bad(s.id + ': 교과서 밖 글이므로 verification은 pending이어야 한다');
    if (s.id === 'jeongseokga') {
      if (s.sourceType !== 'textbook-literature') bad('jeongseokga: sourceType은 textbook-literature여야 한다');
      if (!/문학 교과서/.test(s.citation + (s.citationNote ?? '')) || !/교체|바꾼다|바꿀/.test(s.citation + (s.citationNote ?? ''))) bad('jeongseokga: 문학 교과서 수록본으로 바꿀 예정이라는 메모가 없다');
    } else if (s.sourceType !== 'old-text') bad(s.id + ': sourceType은 old-text여야 한다');
  }

  // 6) 「정석가」 작품 방
  const js = get('jeongseokga');
  const sg = get('seogyeong-byeolgok');
  if (js) {
    const shape = (js.units ?? []).map((u) => (u.lines ?? []).length).join(',');
    if (shape !== '3,6,6,6,6,6') bad('jeongseokga: 연 모양이 1연 3줄, 2~6연 6줄이 아니다(' + shape + ')');
    const all = squash(stanzaText(js, 1) + stanzaText(js, 2) + stanzaText(js, 3) + stanzaText(js, 4));
    for (const w of ['구은밤닷되를심고이다', '玉으로蓮ㅅ고즐사교이다', '므쇠로텰릭을ᄆᆞᆯ아', '므쇠로한쇼를디여다가']) {
      if (!all.includes(w)) bad('jeongseokga: 불가능한 조건 "' + w + '"가 2~5연에 없다');
    }
    const last = squash(stanzaText(js, 5));
    for (const w of ['구스리', '바회예', '디신ᄃᆞᆯ', '그츠리잇가', '즈믄', '외오곰', '녀신ᄃᆞᆯ', '信잇ᄃᆞᆫ']) {
      if (!last.includes(w)) bad('jeongseokga: 마지막 연에 "' + w + '"가 없다');
    }
    if (sg) {
      const sgSecond = squash(stanzaText(sg, 1));
      for (const w of ['구스리', '바회예', '디신ᄃᆞᆯ', '그츠리잇가', '즈믄', '외오곰', '녀신ᄃᆞᆯ', '信잇ᄃᆞᆫ']) {
        if (!sgSecond.includes(w)) bad('seogyeong-byeolgok: 둘째 연에 "' + w + '"가 없다(「정석가」 마지막 연과 같은 사설이어야 한다)');
      }
      // 같은 사설이므로 풀이도 같아야 한다: 「정석가」 마지막 연의 풀이 줄은 모두 「서경별곡」 둘째 연 풀이에 있다
      const sgGloss = new Set((sg.units?.[1]?.lines ?? []).map((l) => l.gloss));
      for (const l of js.units?.[5]?.lines ?? []) if (!sgGloss.has(l.gloss)) bad('jeongseokga: 마지막 연 풀이 "' + l.gloss + '"가 「서경별곡」 둘째 연 풀이와 다르다');
    }
  }

  // 7) 덤과 보스
  const dd = get('dongdong');
  if (dd) {
    if (dd.excerpt !== '두 달치') bad('dongdong: excerpt가 두 달치가 아니다');
    if ((dd.units ?? []).length !== 2) bad('dongdong: 두 달치이므로 연이 둘이어야 한다');
    const firsts = (dd.units ?? []).map((u) => u.lines?.[0]?.feet?.[0]?.original ?? '');
    if (!firsts[0]?.startsWith('正月') || !firsts[1]?.startsWith('二月')) bad('dongdong: 정월·이월 연이 아니다(' + firsts.join(', ') + ')');
  }
  const jy = get('jeongeupsa');
  if (jy) {
    if (jy.cardNote !== CARD_NOTE_JEONGEUP) bad('jeongeupsa: cardNote가 "' + CARD_NOTE_JEONGEUP + '"가 아니다');
    if (!/백제/.test(jy.keepsake?.classLine ?? '')) bad('jeongeupsa: 기념품 향유층 줄에 백제 노래라는 말이 없다');
  }
  // '노래 속 마음' 카드(추가 제안 F1): 물건이 나오지 않는 「가시리」만
  for (const s of songs) {
    if (!s) continue;
    const mind = s.keepsake?.kind === 'mind';
    if (s.id === 'gasiri') {
      if (!mind) bad('gasiri: 물건이 없는 노래라 기념품이 노래 속 마음 카드(kind: mind)여야 한다');
      if (!String(s.keepsake?.phrase ?? '').includes('셜온 님')) bad('gasiri: 마음 카드 구절에 노래 속 말 "셜온 님"이 없다');
      if (typeof s.cardNote !== 'string' || !s.cardNote.trim()) bad('gasiri: 마음 카드에 붙일 한 줄(cardNote)이 없다');
    } else if (mind) bad(s.id + ': 물건이 나오는 노래인데 노래 속 마음 카드로 되어 있다');
  }
  const sm = get('samogok');
  if (sm) {
    if (!(sm.singerGroups ?? []).includes('court-goryeo')) bad('samogok: singerGroups에 court-goryeo가 없다');
    if (!(sm.features?.refrains ?? []).some((r) => squash(r.text) === squash('위 덩더둥셩'))) bad('samogok: 여음 "위 덩더둥셩"이 표시되지 않았다');
  }

  // 8) 수첩
  for (const e of validateNotebookPage(page, GENRE)) bad('수첩: ' + e.message);
  const covered = new Set((page?.lines ?? []).flatMap((l) => l.conceptIds ?? []));
  for (const c of conceptsOfGenre(GENRE)) if (!covered.has(c.id)) bad('수첩: 개념 ' + c.id + '를 다루는 줄이 없다');
  return problems;
}

console.log('\n[고려가요] 실제 데이터');
{
  const problems = inspect(mod.songs, nb.notebookPage);
  check(problems.length === 0, '고려가요 노래 글과 수첩 쪽이 약속을 지킨다 (문제 ' + problems.length + '개)');
  for (const p of problems.slice(0, 40)) console.log('      - ' + p);
}

console.log('\n[고려가요] 음성 사례 (망가뜨린 데이터를 잡아야 한다)');
{
  const negatives = [
    ['정석가 마지막 연(구슬)을 지움', (songs) => { songs.find((s) => s.id === 'jeongseokga').units.pop(); }],
    ['서경별곡 둘째 연 풀이를 바꿈', (songs) => { songs.find((s) => s.id === 'seogyeong-byeolgok').units[1].lines[0].gloss = '다른 풀이'; }],
    ['정읍사 카드 문구를 바꿈', (songs) => { songs.find((s) => s.id === 'jeongeupsa').cardNote = '고려 노래'; }],
    ['청산별곡 evidences에서 3음보를 뺌', (songs) => { const s = songs.find((x) => x.id === 'cheongsan-byeolgok'); s.evidences = s.evidences.filter((c) => c !== 'goryeo-3beat'); }],
    ['가시리 후렴 구간을 엉뚱한 줄로 옮김', (songs) => { songs.find((s) => s.id === 'gasiri').features.refrains[0].ranges[0].line = 0; }],
    ['정석가를 옛 문헌 출처로 바꿈', (songs) => { songs.find((s) => s.id === 'jeongseokga').sourceType = 'old-text'; }],
    ['동동에 한 달을 더함', (songs) => { const s = songs.find((x) => x.id === 'dongdong'); s.units.push(structuredClone(s.units[1])); }],
    ['사모곡 보스 무리를 바꿈', (songs) => { songs.find((s) => s.id === 'samogok').singerGroups = ['singer-commoner']; }],
    ['노래 한 편을 뺌', (songs) => { songs.splice(songs.findIndex((s) => s.id === 'sangjeoga'), 1); }],
    ['상저가를 verified로 올림', (songs) => { songs.find((s) => s.id === 'sangjeoga').verification = 'verified'; }],
    ['가시리 마음 카드 표시를 지움', (songs) => { delete songs.find((s) => s.id === 'gasiri').keepsake.kind; }],
    ['가시리 마음 카드 한 줄을 지움', (songs) => { delete songs.find((s) => s.id === 'gasiri').cardNote; }],
    ['가시리 마음 카드 낱말을 노래에 없는 말로 바꿈', (songs) => { const k = songs.find((s) => s.id === 'gasiri').keepsake; k.word = '이별'; k.phrase = '셜온 님 이별'; }],
    ['청산별곡을 마음 카드로 바꿈', (songs) => { songs.find((s) => s.id === 'cheongsan-byeolgok').keepsake.kind = 'mind'; }],
  ];
  for (const [name, mutate] of negatives) {
    const songs = structuredClone(mod.songs);
    mutate(songs);
    const problems = inspect(songs, nb.notebookPage);
    check(problems.length > 0, name + ' → ' + (problems.length ? '잡힘: ' + problems[0] : '잡히지 않음'));
  }
  const page = structuredClone(nb.notebookPage);
  page.lines = page.lines.filter((l) => !l.conceptIds.includes('goryeo-refrain'));
  const problems = inspect(structuredClone(mod.songs), page);
  check(problems.some((p) => p.includes('goryeo-refrain')), '수첩에서 후렴 줄을 뺌 → ' + (problems.length ? '잡힘' : '잡히지 않음'));
}

console.log('\n' + (failures ? '✗ 실패 ' + failures + '건' : '✓ 고려가요 점검 통과'));
process.exit(failures ? 1 : 0);
