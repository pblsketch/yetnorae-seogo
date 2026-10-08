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
import { mismatches, contrastSoundness, tapCounts, CONTRAST_RULES } from '../js/core/contrast.js';
import { wingById } from '../js/data/wings.js';
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
  check(same(deriveTapEvidence(hy10), { mode: 'gu', gu: 10 }) && same(deriveTapEvidence(go), { mode: 'lines', feet: [[3, 3, 0], [3, 3, 0]], refrains: 6 }), '두드리기 증거: 향가는 구 수, 고려가요는 줄마다 박에 드는 음보 수(여음 줄은 0)와 여음·후렴 음보 수');
  check(syllableCount('어른 님') === 3 && syllableCount('ᄒᆞᆫ 잔') === 2 && syllableCount('春風') === 2, '글자 수 세기(한글·옛한글·한자)');
  const clips = voiceClips(go);
  check(clips.length === 18 && clips[0].path === 'assets/audio/voice/fx-go-a/0-0-0.mp3' && voiceClips(hy10)[9].path === 'assets/audio/voice/fx-hy-10/9.mp3' && voiceClips(sijo)[8].path === 'assets/audio/voice/fx-sijo-b/2-0.mp3', '낭송 조각 경로 규칙');
}

// ── 6. 맞대어 보기 규칙의 건전성(js/core/contrast.js) ──
// 어떤 규칙도 대상 갈래의 노래를 걸면 안 된다: 모든 노래 × 모든 고유 동작(없음·하나씩·모두)에서
// mismatches(노래, { genre: 노래 갈래 }, 동작)이 비어 있고, 향가관 탑의 칸 노래는 자기 층에서 비어 있다.
console.log('\n[6] 맞대어 보기 규칙의 건전성과 맞대어 볼 줄이 없는 경우');
{
  const real = await loadRealData();
  const actionIds = ACTIONS.map((a) => a.id);
  const v = contrastSoundness(real.songs, actionIds, { tableWings: SONG_TABLE.wings });
  check(real.songs.length === 45 && v.length === 0, '실제 노래 ' + real.songs.length + '편 × 동작: 자기 갈래(탑은 자기 층)와 어긋난다고 나오는 줄이 없다 (위반 ' + v.length + '개)');
  for (const x of v.slice(0, 10)) console.log('      - ' + x.songId + ' ' + JSON.stringify(x.target) + ' ' + JSON.stringify(x.actionId) + ' → ' + x.found.map((m) => m.lineKind + '/' + m.conceptId).join(', '));
  const fx = makeValidSet();
  const vf = contrastSoundness(fx.songs, actionIds, { tableWings: fx.table.wings });
  check(vf.length === 0, '시험 묶음 노래도 건전하다 (위반 ' + vf.length + '개)');
  // 음성 사례: 처음 제안된 '세 음보 줄이 80% 미만이면 고려가요와 어긋남' 규칙은 「동동」·「정읍사」·「사모곡」을 건다
  const ratioRule = { genre: 'goryeo', lineKind: 'tap', conceptId: 'goryeo-3beat', test: (e) => { const c = tapCounts(e.tap); return c.filter((x) => x === 3).length / c.length < 0.8; } };
  const bad = contrastSoundness(real.songs, actionIds, { rules: [...CONTRAST_RULES, ratioRule], tableWings: SONG_TABLE.wings });
  const badIds = [...new Set(bad.map((x) => x.songId))];
  check(badIds.includes('dongdong') && badIds.includes('jeongeupsa'), '(음성) 건전하지 않은 규칙을 넣으면 잡는다: ' + badIds.join(', '));
  const towerBad = contrastSoundness(real.songs, actionIds, { rules: [...CONTRAST_RULES, { tower: true, lineKind: 'fold', conceptId: 'hyangga-lines', test: (e) => e.fold.units !== 10 }], tableWings: SONG_TABLE.wings });
  check(towerBad.some((x) => x.songId === 'seodongyo'), '(음성) 탑 규칙이 제 층의 향가를 걸면 잡는다');

  // 반드시 지나는 길의 노래 × 그 관에서 할 수 있는 틀린 고르기(교사 결정 2026-10-08):
  //  - 갈래 판별: 그 관에서 분석하는 노래(미리 분석한 노래는 판별하지 않는다)마다 틀린 갈래 넷. 대상은 고른 갈래, 동작은 그 관의 동작
  //  - 향가관 탑: 판별을 마친 칸 노래를 다른 두 층에
  // 맞대어 볼 줄이 없으면 창은 짝짓기 없이 분석표와 고른 갈래 쪽을 나란히 보인다(탑에는 그런 경우가 없어야 한다).
  const byId = new Map(real.songs.map((x) => [x.id, x]));
  let total = 0;
  const empty = [];
  for (const [w, t] of Object.entries(SONG_TABLE.wings)) {
    const pre = SONG_TABLE.routing.prewait[w] ?? [];
    const action = wingById(w).action;
    for (const id of [...t.shelf, ...t.stray.map((x) => x.songId)]) {
      const song = byId.get(id);
      if (!song) continue;
      const targets = [];
      if (!pre.includes(id)) for (const d of GENRES.map((g) => g.id)) if (d !== song.genre) targets.push(['판별 → ' + d, { genre: d }]);
      if (Array.isArray(t.shelfFloors) && t.shelf.includes(id)) t.shelfFloors.forEach((n, k) => { if (t.shelf[k] !== id) targets.push(['탑 ' + n + '구 층', { towerUnits: n }]); });
      for (const [name, target] of targets) {
        total++;
        if (!mismatches(song, target, action).length) empty.push(w + ' ' + id + ' → ' + name);
      }
    }
  }
  // 학생의 분석에서 고른 갈래와 어긋나는 증거가 나오지 않는 경우(2026-10-07, Codex 점검 C2·C3 반영 뒤).
  // 두드리기 방식(향가의 구 세기)은 프로그램이 고른 것이라 증거로 쓰지 않고, 고려가요는 세 음보 줄이 하나도 없을 때만 어긋난다.
  // 그래서 아래 여섯 가지는 짝짓기 없이 나란히 견준다(수첩 도움은 고른 갈래 개념 모두). 목록과 실제가 한 가지라도 다르면 실패한다.
  const NO_EVIDENCE = [
    'hyangga seodongyo → 판별 → goryeo',          // 향가(구 세기)·'아아' 문 열기: 고려가요의 연·후렴·세 음보를 가를 증거 없음
    'hyangga cheoyongga → 판별 → goryeo',
    'hyangga chan-giparangga → 판별 → goryeo',
    'hyangga gasiri → 판별 → hyangga',            // 네 부분(연)은 4구 향가와 같은 수
    'goryeo cheongsan-byeolgok → 판별 → hyangga', // 여덟 부분은 8구 향가와 같은 수
    'gasa gyuwonga → 판별 → goryeo',              // 세 음보 행이 섞여 있고 걷기는 고려가요 개념과 맞대지 않는다
  ];
  console.log('  · 틀린 고르기 ' + total + '가지 가운데 맞대어 볼 줄이 없는 것 ' + empty.length + '가지(짝짓기 없이 나란히 견준다)');
  for (const e of empty) console.log('      - ' + e + (NO_EVIDENCE.includes(e) ? '  (어긋나는 증거 없음)' : ''));
  const unexpected = empty.filter((e) => !NO_EVIDENCE.includes(e));
  const vanished = NO_EVIDENCE.filter((e) => !empty.includes(e));
  check(total === 82 && !unexpected.length && !vanished.length, '틀린 고르기 82가지(판별 76, 탑 6) 가운데 맞대어 볼 줄이 없는 것은 어긋나는 증거가 없는 정해진 ' + NO_EVIDENCE.length + '가지뿐이다 (모두 ' + total + ', 뜻밖 ' + JSON.stringify(unexpected) + ', 사라짐 ' + JSON.stringify(vanished) + ')');
  check(!empty.some((e) => e.includes('탑 ')), '탑의 틀린 층에는 언제나 맞대어 볼 줄이 있다');
  // 음성 사례: 예전 '향가는 구마다 한 번이 아니면 어긋남' 규칙을 다시 넣으면 목록의 향가 자리가 사라진다(목록이 실제를 따라가는지)
  const oldHyangga = [...CONTRAST_RULES, { genre: 'hyangga', lineKind: 'tap', conceptId: 'hyangga-lines', test: (e) => e.tap.mode !== 'gu' }];
  check(mismatches(byId.get('gasiri'), { genre: 'hyangga' }, 'aa-door', oldHyangga).length > 0 && mismatches(byId.get('gasiri'), { genre: 'hyangga' }, 'aa-door').length === 0, "(음성) 두드리기 방식을 증거로 쓰던 예전 향가 규칙은 「가시리」를 향가로 판별할 때 걸고, 지금 규칙은 걸지 않는다");
  // 고려가요 세 음보 규칙: 네 음보 줄이 섞여 있어도 세 음보 줄이 있으면 걸지 않고, 세 음보 줄이 하나도 없으면 건다
  const goryeoTap = CONTRAST_RULES.find((r) => r.genre === 'goryeo' && r.lineKind === 'tap');
  check(!goryeoTap.test({ tap: { mode: 'lines', feet: [[3, 4], [2]] } }) && goryeoTap.test({ tap: { mode: 'feet', feet: [4, 4, 4] } }) && !goryeoTap.test({ tap: { mode: 'gu', gu: 10 } }), '고려가요 두드리기 규칙: 세 음보 줄이 하나라도 있으면 걸지 않고(네 음보 줄이 섞여도), 하나도 없을 때만 건다. 향가의 구 세기는 증거로 쓰지 않는다');
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
