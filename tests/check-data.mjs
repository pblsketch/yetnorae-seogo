// 데이터 점검(spec 4.4 데이터 검증 규칙, 7.3 먹 가능성, 21절 '데이터').
// 1) 실제 노래 표·관·개념 데이터의 모양
// 2) 계약 문서(js/data/README.md)의 예시 노래가 검증기를 통과하는지
// 3) 실제 노래 데이터: 갈래별로 본다. 노래가 하나도 없는 갈래는 '아직 없음'으로 넘어가고,
//    한 편이라도 있으면 그 갈래의 표 노래가 모두 있어야 하고 모두 올바르며 개념이 먹이 될 수 있어야 한다.
// 4) 시험용 가짜 묶음: 올바른 묶음은 통과하고, 음성 사례는 저마다 정해진 까닭으로 실패해야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateSong, validateTableShape, validateDataSet } from '../js/core/validate.js';
import { SONG_TABLE } from '../js/data/song-table.js';
import { WINGS, GENRES, ACTIONS } from '../js/data/wings.js';
import { CONCEPTS, SINGER_GROUPS } from '../js/data/concepts.js';
import { deriveSheet, deriveActionEvidence, deriveTapEvidence, syllableCount, voiceClips } from '../js/core/song-shape.js';
import { makeValidSet } from './fixtures/valid-set.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const showErrors = (errors, limit = 30) => {
  for (const e of errors.slice(0, limit)) console.log('      - [' + e.code + '] ' + (e.where ? e.where + ': ' : '') + e.message);
  if (errors.length > limit) console.log('      … 그 밖에 ' + (errors.length - limit) + '개');
};

// ── 1. 기준 데이터의 모양 ──
console.log('\n[1] 관·개념·노래 표 기준 데이터');
check(WINGS.length === 6 && WINGS.map((w) => w.order).join() === '0,1,2,3,4,5', '관 여섯이 순서 0~5로 있다');
check(GENRES.length === 5 && WINGS.slice(1).every((w, i) => w.genre === GENRES[i].id), '관 1~5의 갈래가 향가·고려가요·시조·가사·사설시조 순서다');
check(ACTIONS.length === 5 && WINGS.slice(1).every((w) => ACTIONS.some((a) => a.id === w.action && a.wing === w.id)), '관마다 고유 동작이 하나씩 있다');
check(CONCEPTS.length === 13 && new Set(CONCEPTS.map((c) => c.id)).size === 13, '개념 13개, id가 겹치지 않는다');
check(GENRES.every((g) => CONCEPTS.some((c) => c.genre === g.id)), '갈래마다 개념이 있다');
check(SINGER_GROUPS.length === 5, '향유층 무리 다섯');
{
  const errors = validateTableShape(SONG_TABLE);
  check(errors.length === 0, '실제 노래 표가 spec 4.2·4.3의 모양과 행선지 규칙에 맞다');
  showErrors(errors);
}

// ── 2. 계약 문서의 예시 노래 ──
console.log('\n[2] 계약 문서 예시');
{
  const readmePath = path.join(root, 'js/data/README.md');
  const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
  const blocks = [...readme.matchAll(/```json example-song\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
  check(blocks.length === 1, 'README에 예시 노래(json example-song) 블록이 하나 있다');
  if (blocks.length === 1) {
    let example = null;
    try { example = JSON.parse(blocks[0]); } catch (e) { fail('예시 노래 JSON을 읽을 수 없다: ' + e.message); }
    if (example) {
      const errors = validateSong(example, { table: SONG_TABLE });
      check(errors.length === 0, '예시 노래가 노래 검증기를 통과한다');
      showErrors(errors);
    }
  }
}

// ── 3. 실제 데이터 ──
console.log('\n[3] 실제 노래 데이터');
{
  const real = await loadRealData();
  for (const e of real.loadErrors) fail(e);
  const { errors, genres } = validateDataSet(real, { table: SONG_TABLE });
  for (const g of GENRES) {
    const st = genres[g.id];
    if (!st || st.status === 'absent') console.log('  · ' + g.name + ': 아직 없음');
    else console.log('  · ' + g.name + ': ' + st.count + '편 / 표 ' + st.expected + '편');
  }
  if (real.remix === undefined) console.log('  · 리믹스(js/data/remix.js): 아직 없음');
  check(errors.length === 0, '실제 데이터 검증 오류 없음 (' + errors.length + '개)');
  showErrors(errors, 80);
}

// ── 4. 시험용 가짜 묶음 ──
console.log('\n[4] 시험용 묶음 (양성·음성 사례)');
{
  const valid = makeValidSet();
  const { errors } = validateDataSet(valid, { table: valid.table });
  check(errors.length === 0, '올바른 시험 묶음은 통과한다');
  showErrors(errors);

  const negDir = path.join(root, 'tests/fixtures/negative');
  const files = fs.readdirSync(negDir).filter((f) => f.endsWith('.mjs')).sort();
  check(files.length >= 6, '음성 사례가 있다 (' + files.length + '개)');
  for (const file of files) {
    const neg = (await import(pathToFileURL(path.join(negDir, file)).href)).default;
    let errs;
    if (neg.target === 'realTable') {
      const table = structuredClone(SONG_TABLE);
      neg.mutate(table);
      errs = validateTableShape(table);
    } else {
      const set = makeValidSet();
      neg.mutate(set);
      errs = validateDataSet(set, { table: set.table }).errors;
    }
    const codes = [...new Set(errs.map((e) => e.code))];
    const ok = errs.length > 0 && codes.every((c) => c === neg.expect);
    check(ok, file + ' — ' + neg.name + ' → ' + (errs.length ? codes.join(',') : '잡히지 않음') + ' (기대 ' + neg.expect + ')');
    if (!ok) showErrors(errs);
  }
}

// ── 5. 감정서·낭송 조각 계산(계약 문서 6절·10절) ──
console.log('\n[5] 감정서와 낭송 조각 계산');
{
  const set = makeValidSet();
  const get = (id) => set.songs.find((s) => s.id === id);
  const sijo = get('fx-sijo-b'), saseol = get('fx-ss-a'), hy10 = get('fx-hy-10'), go = get('fx-go-a'), gasa = get('fx-gs-a');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check(same(deriveSheet(sijo, 'stairs'), { songId: 'fx-sijo-b', fold: { units: 3 }, tap: { mode: 'feet', feet: [4, 4, 4] }, action: { action: 'stairs', applicable: true, syllables: 3 } }), '시조를 시조관에서 재면 [세 장][네 음보][종장 첫 음보 세 글자]');
  check(same(deriveActionEvidence('stairs', gasa), { action: 'stairs', applicable: false, syllables: null }), '가사를 계단으로 재면 해당 없음(종장 없음)');
  check(same(deriveActionEvidence('rapid-unroll', saseol), { action: 'rapid-unroll', applicable: true, middleFeet: 7, overFour: true }), '사설시조 연타: 가운데 장 7음보, 4음보를 넘음');
  check(same(deriveActionEvidence('rapid-unroll', sijo), { action: 'rapid-unroll', applicable: true, middleFeet: 4, overFour: false }), '시조 연타: 가운데 장 4음보');
  check(same(deriveActionEvidence('aa-door', hy10), { action: 'aa-door', applicable: true, present: true, unit: 8 }), '10구체 향가: 9구에 감탄사');
  check(deriveActionEvidence('aa-door', sijo).present === false, '시조에는 감탄사 표시가 없다');
  check(deriveActionEvidence('refrain-link', go).present === true && deriveActionEvidence('refrain-link', sijo).present === false, '후렴 고리: 고려가요 있음, 시조 없음');
  check(same(deriveActionEvidence('walk', gasa), { action: 'walk', applicable: true, steps: 4, stopsAtThree: false }) && deriveActionEvidence('walk', sijo).stopsAtThree === true, '걷기: 가사는 이어지고 시조는 세 장에서 멈춤');
  check(same(deriveTapEvidence(hy10), { mode: 'gu', gu: 10 }) && same(deriveTapEvidence(go), { mode: 'lines', feet: [[3, 3, 3], [3, 3, 3]] }), '두드리기 증거: 향가는 구 수, 고려가요는 줄마다 음보 수');
  check(syllableCount('어른 님') === 3 && syllableCount('ᄒᆞᆫ 잔') === 2 && syllableCount('春風') === 2, '글자 수 세기(한글·옛한글·한자)');
  const clips = voiceClips(go);
  check(clips.length === 18 && clips[0].path === 'assets/audio/voice/fx-go-a/0-0-0.mp3' && voiceClips(hy10)[9].path === 'assets/audio/voice/fx-hy-10/9.mp3' && voiceClips(sijo)[8].path === 'assets/audio/voice/fx-sijo-b/2-0.mp3', '낭송 조각 경로 규칙');
}

console.log('\n' + (failures ? '✗ 실패 ' + failures + '건' : '✓ 데이터 점검 통과'));
process.exit(failures ? 1 : 0);

// 실제 데이터를 모은다. 등록 파일(js/data/songs/index.js)과 함께, 아직 등록되지 않은
// 갈래별 파일(js/data/songs/<갈래>.js, js/data/notebook-<갈래>.js)과 리믹스(js/data/remix.js)도 직접 읽는다.
// 같은 노래 객체가 두 경로로 들어오면 한 번만 센다.
async function loadRealData() {
  const loadErrors = [];
  const songs = [];
  const seen = new Set();
  const addSongs = (list, from, genre) => {
    if (!Array.isArray(list)) { loadErrors.push(from + ': songs 배열을 내보내지 않는다'); return; }
    for (const s of list) {
      if (seen.has(s)) continue;
      seen.add(s);
      if (genre && s?.genre !== genre) loadErrors.push(from + ': ' + (s?.id ?? '?') + '의 갈래가 파일 갈래(' + genre + ')와 다르다');
      songs.push(s);
    }
  };
  const notebook = {};
  const index = await import(pathToFileURL(path.join(root, 'js/data/songs/index.js')).href);
  addSongs(index.songs, 'js/data/songs/index.js', null);
  Object.assign(notebook, index.notebook ?? {});

  const genreIds = GENRES.map((g) => g.id);
  const songDir = path.join(root, 'js/data/songs');
  for (const f of fs.readdirSync(songDir)) {
    if (f === 'index.js' || !f.endsWith('.js')) continue;
    const genre = f.slice(0, -3);
    if (!genreIds.includes(genre)) { loadErrors.push('js/data/songs/' + f + ': 갈래 id가 아닌 파일 이름'); continue; }
    const mod = await import(pathToFileURL(path.join(songDir, f)).href);
    addSongs(mod.songs, 'js/data/songs/' + f, genre);
  }
  for (const g of genreIds) {
    const p = path.join(root, 'js/data/notebook-' + g + '.js');
    if (!fs.existsSync(p)) continue;
    const mod = await import(pathToFileURL(p).href);
    if (!mod.notebookPage) loadErrors.push('js/data/notebook-' + g + '.js: notebookPage를 내보내지 않는다');
    else if (notebook[g] && notebook[g] !== mod.notebookPage) loadErrors.push('수첩 쪽 ' + g + '가 두 가지로 등록되었다');
    else notebook[g] = mod.notebookPage;
  }
  let remix;
  const remixPath = path.join(root, 'js/data/remix.js');
  if (fs.existsSync(remixPath)) {
    const mod = await import(pathToFileURL(remixPath).href);
    remix = mod.remix ?? null;
    if (!remix) loadErrors.push('js/data/remix.js: remix를 내보내지 않는다');
  }
  return { songs, notebook, remix, loadErrors };
}
