// 사설시조 노래 글 점검(T24).
// 1) js/data/songs/saseol.js가 노래 표의 사설시조 여덟 편을 모두 담고, 검증기(형식·표·기념품·먹 가능성)를 통과하는지
// 2) 출처 규칙: 교과서(공통국어2) 밖 노래는 모두 확인 대기(pending), 문학 교과서 노래는 교체 예정 메모, 수능 노래는 출제 연도와 제목
// 3) 「님이 오마 하거늘」 작품 방용 반전 표시(중장 units[1].reversal)가 반전(주추리 삼대)을 정확히 가르는지
// 4) 오늘 소리(reading)는 낭송용이므로 한자·옛한글 자모가 없어야 한다. 시험지의 표시 기호(ⓐ, ㉠, *)는 노래 글에 남기지 않는다
// 5) 음성 사례: 일부러 망가뜨린 사본을 이 점검이 실제로 잡는지
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateDataSet } from '../js/core/validate.js';
import { SONG_TABLE } from '../js/data/song-table.js';
import { CONCEPTS } from '../js/data/concepts.js';

const root = fileURLToPath(new URL('../', import.meta.url));
let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

const GENRE = 'saseol';
const REVERSAL_WORD = '주추리';
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

// 낭송용 글에 있으면 안 되는 글자: 한자, 옛한글 자모(첫·가운데·끝소리), 아래아 등
const NOT_FOR_TTS = /[㐀-䶿一-鿿豈-﫿ᄀ-ᇿꥠ-꥿ힰ-퟿ㆍᆞ]/u;
// 시험지·교재의 표시 기호
const MARKERS = /[ⓐ-ⓩ㉠-㉿*]/u;

function expectedIds(table) {
  return Object.entries(table.catalog).filter(([, e]) => e.genre === GENRE).map(([id]) => id).sort();
}

// 사설시조 노래 묶음의 문제 목록을 돌려준다. 빈 목록이면 통과.
export function checkSaseol(songs, notebookPage, table = SONG_TABLE) {
  const out = [];
  if (!Array.isArray(songs)) return ['songs 배열이 없다'];
  const ids = songs.map((s) => s?.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds(table))) out.push('노래 id가 표의 사설시조 목록과 다르다: ' + ids.join(', '));

  // 검증기(형식, 표, 기념품, 먹 가능성, 수첩)
  const { errors } = validateDataSet({ songs, notebook: { [GENRE]: notebookPage } }, { table });
  for (const e of errors) out.push('[' + e.code + '] ' + e.where + ': ' + e.message);

  const byId = Object.fromEntries(songs.map((s) => [s?.id, s]));
  for (const s of songs) {
    if (!s || s.genre !== GENRE) { out.push((s?.id ?? '?') + ': 사설시조가 아니다'); continue; }
    if (s.sourceType !== 'textbook-common2' && s.verification !== 'pending') out.push(s.id + ': 교과서(공통국어2) 밖 노래는 verification이 pending이어야 한다');
    if (!isStr(s.citation)) out.push(s.id + ': citation이 없다');
    (s.units ?? []).forEach((u, ui) => {
      if (u?.reversal !== undefined && !(s.id === 'nimi-oma' && ui === 1)) out.push(s.id + ': reversal 표시는 「님이 오마 하거늘」 중장에만 둔다');
      if (MARKERS.test(u?.gloss ?? '')) out.push(s.id + ' ' + (ui + 1) + '장 풀이에 표시 기호가 남아 있다');
      (u?.feet ?? []).forEach((f, fi) => {
        const where = s.id + ' ' + (ui + 1) + '장 ' + (fi + 1) + '음보';
        if (NOT_FOR_TTS.test(f?.reading ?? '')) out.push(where + ': 오늘 소리에 한자나 옛한글 자모가 있다 (' + f.reading + ')');
        if (MARKERS.test(f?.original ?? '') || MARKERS.test(f?.reading ?? '')) out.push(where + ': 표시 기호가 남아 있다');
      });
    });
  }

  // 문학 교과서 노래
  const namo = byId['namodo-bahi'];
  if (namo) {
    if (namo.sourceType !== 'textbook-literature') out.push('namodo-bahi: sourceType은 textbook-literature여야 한다');
    if (!/문학 교과서/.test((namo.citation ?? '') + (namo.citationNote ?? ''))) out.push('namodo-bahi: 문학 교과서 수록본으로 바꿀 예정이라는 메모가 없다');
  }

  // 보스 낯선 노래(수능)
  const exam = byId['suneung-saseol'];
  if (exam) {
    if (exam.sourceType !== 'exam') out.push('suneung-saseol: sourceType은 exam이어야 한다');
    if (!isStr(exam.title)) out.push('suneung-saseol: 고른 작품의 제목(title)이 없다');
    if (!/(2025|2026)학년도/.test(exam.citation ?? '') || !/수능|대학수학능력시험/.test(exam.citation ?? '')) out.push('suneung-saseol: citation에 출제 학년도와 수능이 없다');
    if (!/\d+\s*[～~-]\s*\d+/.test((exam.citation ?? '') + (exam.citationNote ?? ''))) out.push('suneung-saseol: 출제 지문 범위(문항 번호)가 없다');
    if (!(exam.singerGroups ?? []).includes('singer-commoner')) out.push('suneung-saseol: singerGroups에 가객·서민(singer-commoner)이 없다');
  }

  // 「님이 오마 하거늘」 반전 표시
  const nimi = byId['nimi-oma'];
  if (nimi) {
    const mid = nimi.units?.[1];
    const r = mid?.reversal;
    const feet = mid?.feet ?? [];
    if (!r || typeof r !== 'object') out.push('nimi-oma: 중장(units[1])에 reversal 표시가 없다');
    else {
      const k = r.fromFoot;
      if (!Number.isInteger(k) || k <= 4 || k >= feet.length) out.push('nimi-oma: reversal.fromFoot은 4보다 크고 중장 음보 수보다 작은 정수여야 한다(지금 ' + k + ')');
      else {
        const before = feet.slice(0, k).map((f) => f.original + f.reading).join(' ');
        const after = feet.slice(k).map((f) => f.original + ' ' + f.reading).join(' ');
        if (before.includes(REVERSAL_WORD)) out.push('nimi-oma: 반전 앞 음보에 이미 주추리 삼대가 나온다');
        if (!after.includes(REVERSAL_WORD)) out.push('nimi-oma: 반전 뒤 음보에 주추리 삼대가 없다');
        if (/보니$/.test(feet[k - 1]?.reading ?? '') === false) out.push('nimi-oma: 반전 바로 앞 음보는 \'흘긧 보니\'(곁눈으로 보니)여야 한다');
      }
      for (const k2 of Object.keys(r)) if (!['fromFoot', 'glossBefore'].includes(k2)) out.push('nimi-oma: reversal에 약속에 없는 열쇠 ' + k2);
      if (!isStr(r.glossBefore)) out.push('nimi-oma: reversal.glossBefore(반전 앞까지의 풀이)가 없다');
      else if (r.glossBefore.includes(REVERSAL_WORD) || r.glossBefore.includes('삼대')) out.push('nimi-oma: glossBefore가 반전을 미리 드러낸다');
      if (!(mid?.gloss ?? '').includes(REVERSAL_WORD)) out.push('nimi-oma: 중장 전체 풀이(gloss)에 주추리 삼대가 없다');
    }
  }

  // 수첩 쪽: 사설시조 개념 둘을 모두 다룬다
  const covered = new Set((notebookPage?.lines ?? []).flatMap((l) => l?.conceptIds ?? []));
  for (const c of CONCEPTS.filter((x) => x.genre === GENRE)) if (!covered.has(c.id)) out.push('수첩 쪽이 개념 ' + c.id + '를 다루지 않는다');
  return out;
}

// ── 실행 ──
const songsPath = path.join(root, 'js/data/songs/saseol.js');
const notebookPath = path.join(root, 'js/data/notebook-saseol.js');
console.log('\n[1] 사설시조 노래 글');
if (!fs.existsSync(songsPath) || !fs.existsSync(notebookPath)) {
  fail('js/data/songs/saseol.js 또는 js/data/notebook-saseol.js가 없다');
} else {
  const { songs } = await import(pathToFileURL(songsPath).href);
  const { notebookPage } = await import(pathToFileURL(notebookPath).href);
  const problems = checkSaseol(songs, notebookPage);
  check(problems.length === 0, '사설시조 여덟 편과 수첩 쪽이 약속을 지킨다 (문제 ' + problems.length + '개)');
  for (const p of problems.slice(0, 40)) console.log('      - ' + p);

  const nimi = songs.find((s) => s.id === 'nimi-oma');
  if (nimi?.units?.[1]?.reversal) {
    const k = nimi.units[1].reversal.fromFoot;
    console.log('  · 「님이 오마 하거늘」 중장 ' + nimi.units[1].feet.length + '음보, 반전은 ' + (k + 1) + '번째 음보(fromFoot ' + k + ') \'' + nimi.units[1].feet[k].original + '\'부터');
  }

  console.log('\n[2] 음성 사례 (망가뜨린 사본을 잡는지)');
  const negatives = [
    ['반전 표시를 지움', (ss) => { delete ss.find((s) => s.id === 'nimi-oma').units[1].reversal; }],
    ['반전 위치를 주추리 삼대 뒤로 옮김', (ss) => { const m = ss.find((s) => s.id === 'nimi-oma').units[1]; m.reversal.fromFoot = m.feet.length - 1; }],
    ['반전 앞 풀이가 반전을 드러냄', (ss) => { ss.find((s) => s.id === 'nimi-oma').units[1].reversal.glossBefore += ' 알고 보니 주추리 삼대였다'; }],
    ['수능 노래의 제목을 비움', (ss) => { ss.find((s) => s.id === 'suneung-saseol').title = null; }],
    ['수능 노래 citation에서 학년도를 지움', (ss) => { const e = ss.find((s) => s.id === 'suneung-saseol'); e.citation = e.citation.replace(/20\d\d학년도/g, ''); }],
    ['오늘 소리에 한자가 섞임', (ss) => { ss.find((s) => s.id === 'gwitturami').units[1].feet[0].reading = '紗窓'; }],
    ['시험지 표시 기호가 남음', (ss) => { const f = ss.find((s) => s.id === 'suneung-saseol').units[0].feet; f[f.length - 1].original = 'ⓐ' + f[f.length - 1].original; }],
    ['한 편이 빠짐', (ss) => { ss.splice(ss.findIndex((s) => s.id === 'hansuma'), 1); }],
    ['확인 전 노래를 verified로 둠', (ss) => { ss.find((s) => s.id === 'chang-naegoja').verification = 'verified'; }],
    ['문학 교과서 노래의 출처 종류가 틀림', (ss) => { ss.find((s) => s.id === 'namodo-bahi').sourceType = 'old-text'; }],
    ['종장 첫 음보가 네 글자', (ss) => { ss.find((s) => s.id === 'daekdeul-dongnanji').units[2].feet[0].reading = '장사야아'; }],
  ];
  for (const [name, mutate] of negatives) {
    const copy = structuredClone(songs);
    mutate(copy);
    const n = checkSaseol(copy, notebookPage).length;
    check(n > 0, name + ' → ' + (n > 0 ? '잡힘 (' + n + '개)' : '잡히지 않음'));
  }
  {
    const page = structuredClone(notebookPage);
    page.lines = page.lines.filter((l) => !l.conceptIds.includes('saseol-frame'));
    const n = page.lines.length ? checkSaseol(songs, page).length : 1;
    check(n > 0, '수첩 쪽에서 종장 개념 줄을 지움 → ' + (n > 0 ? '잡힘' : '잡히지 않음'));
  }
}

console.log('\n' + (failures ? '✗ 실패 ' + failures + '건' : '✓ 사설시조 점검 통과'));
process.exit(failures ? 1 : 0);
