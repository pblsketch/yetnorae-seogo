// 재기 화면 점검(T5, spec 5·6.4·8·10.2·14·20).
// 점검 페이지 tests/pages/measure.html이 세계 바탕(자리표시 관 모형)과 소리 엔진 위에 재기 화면을 띄운다(제품 흐름에는 없다).
// 실제 노래 데이터로 다음을 확인한다.
//  - 갈래마다 노래 한 편: 접기 경계, 두드리기 음보 수, 그 관 고유 동작의 증거가 js/core/song-shape.js의 deriveSheet와 같다
//  - 엉뚱한 곳은 접히지 않고 흔들리기만 한다(기록 없음)
//  - 빗금 모드와 소리 끔에서도 두드리기와 같은 감정서가 나온다(박은 박자 칸에 맞춰 자동으로 친다)
//  - 박을 세 번 놓치면 빗금 모드를 권하고, 놓친 단위를 다시 듣는다
//  - 고유 동작 다섯을 다른 갈래 노래에 쓰면 '해당 없음'을 포함한 증거가 나온다
//  - 보스 방식: 도구 고르기, 수첩 닫힘·일지 열림
//  - 미리 잰 노래는 감정서가 채워진 채 열린다
//  - 첫 사용 안내는 깃발마다 한 번만
//  - 수첩 다섯 쪽과 반짝이는 줄
//  - 844×390, 글자 크기 1.3에서 넘침 없음, 48px 터치 대상, 움직임 줄이기
//  - 중단 신호, 콘솔 오류·바깥 요청 없음
// 음성 사례: 점검 도구의 비교·넘침 검사가 실제 실패를 잡는지도 함께 본다.
import { startServer } from './lib/server.mjs';
import { openGame, VIEWPORTS } from './lib/browser.mjs';
import { songs } from '../js/data/songs/index.js';
import { deriveSheet, deriveActionEvidence, deriveFoldEvidence, deriveTapEvidence } from '../js/core/song-shape.js';
import { sheetLines, walkWords } from '../js/measure/sheet.js';
import { L } from '../js/measure/labels.js';
import { buildGrid } from '../js/core/rhythm.js';

const PAGE = 'tests/pages/measure.html';
const GENRE_SONGS = { hyangga: 'chan-giparangga', goryeo: 'gasiri', sijo: 'dongjitdal', gasa: 'myeonangjeongga', saseol: 'chang-naegoja' };
const ACTION_OF = { hyangga: 'aa-door', goryeo: 'refrain-link', sijo: 'stairs', gasa: 'walk', saseol: 'rapid-unroll', entrance: 'stairs' };
const GENRE_NAMES = ['향가', '고려가요', '시조', '가사', '사설시조'];

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
}
const song = (id) => songs.find((s) => s.id === id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 객체 열쇠 순서와 상관없이 비교한다
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return same(ka, kb) && ka.every((k) => deepEqual(a[k], b[k]));
}

// ── 페이지 안에서 쓰는 도우미(문자열로 넘어간다) ──

async function solveFold() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rewind = async () => { for (let k = 0; k < 200; k++) { const p = document.querySelector('.measure .m-prev'); if (!p || p.disabled) return; p.click(); await sleep(2); } };
  await rewind();
  for (let i = 0; i < 600; i++) {
    const root = document.querySelector('.measure');
    if (!root || root.dataset.step !== 'fold') return 'done';
    if (document.querySelector('.measure .m-intro')) { await sleep(30); continue; }
    const gap = [...root.querySelectorAll('.m-text button.m-gap:not(.is-folded)')].find((g) => g.dataset.u !== g.dataset.nu);
    if (gap) { gap.click(); await sleep(2); continue; }
    const next = root.querySelector('.m-next');
    if (next && !next.disabled) { next.click(); await sleep(2); continue; }
    // 마지막 쪽까지 접을 경계가 없으면 '접을 곳이 없다'
    root.querySelector('button.m-fold-none')?.click();
    await sleep(30);
  }
  return 'stuck';
}

async function solveSlash() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rewind = async () => { for (let k = 0; k < 200; k++) { const p = document.querySelector('.measure .m-prev'); if (!p || p.disabled) return; p.click(); await sleep(2); } };
  await rewind();
  for (let i = 0; i < 2000; i++) {
    const root = document.querySelector('.measure');
    if (!root || root.dataset.step !== 'tap') return 'done';
    if (root.dataset.tapMode !== 'slash' || document.querySelector('.measure .m-intro')) { await sleep(30); continue; }
    const groups = new Map();
    for (const w of root.querySelectorAll('.m-text button.m-word')) {
      const k = w.dataset.u + '|' + w.dataset.l + '|' + w.dataset.f;
      if (!groups.has(k) || Number(w.dataset.w) > Number(groups.get(k).dataset.w)) groups.set(k, w);
    }
    const target = [...groups.values()].find((w) => !w.classList.contains('has-slash'));
    if (target) { target.click(); await sleep(2); continue; }
    const next = root.querySelector('.m-next');
    if (next && !next.disabled) { next.click(); await sleep(2); continue; }
    await sleep(30);
  }
  return 'stuck';
}

async function solveAction(info) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rewind = async () => { for (let k = 0; k < 200; k++) { const p = document.querySelector('.measure .m-prev'); if (!p || p.disabled) return; p.click(); await sleep(2); } };
  await rewind();
  const inRange = (w) => info.ranges.some((r) => r.unit === Number(w.dataset.u) && r.line === Number(w.dataset.l) && Number(w.dataset.f) >= r.from && Number(w.dataset.f) <= r.to);
  for (let i = 0; i < 2000; i++) {
    const root = document.querySelector('.measure');
    if (!root || root.dataset.step !== 'action') return 'done';
    if (document.querySelector('.measure .m-intro')) { await sleep(30); continue; }
    const box = root.querySelector('.m-action');
    if (!box) { await sleep(30); continue; }
    const none = box.querySelector('button.m-none');
    if (info.action === 'aa-door') {
      const w = root.querySelector('.m-text button.m-word[data-u="' + info.aaUnit + '"]');
      if (w) { w.click(); await sleep(30); continue; }
    } else if (info.action === 'refrain-link') {
      if (!info.ranges.length) { if (none) { none.click(); await sleep(30); continue; } } else {
        const w = [...root.querySelectorAll('.m-text button.m-word:not(.is-linked)')].find(inRange);
        if (w) { w.click(); await sleep(2); continue; }
        const next = root.querySelector('.m-next');
        if (next && !next.disabled) { next.click(); await sleep(2); continue; }
      }
    } else if (info.action === 'stairs') {
      const l = box.querySelector('button.m-letter:not(.is-done)');
      if (l) { l.click(); await sleep(2); continue; }
      if (none) { none.click(); await sleep(30); continue; }
    } else if (info.action === 'walk') {
      const b = box.querySelector('button.m-walk-step');
      if (b && !b.disabled) { b.click(); await sleep(10); continue; }
    } else if (info.action === 'rapid-unroll') {
      const b = box.querySelector('button.m-unroll-btn');
      if (b && !b.disabled) { b.click(); await sleep(2); continue; }
      if (none) { none.click(); await sleep(30); continue; }
    }
    await sleep(30);
  }
  return 'stuck';
}

// 두드리기 동안 보인 것을 모은다: 지금 울리는 음보 표시(is-current)가 난 단위, '같은 걸음으로 넘기기'가 처음 보인 때
// (그때 밝은 말 가운데 가장 뒤 단위). 걷기 같은 다른 단계의 is-current는 세지 않는다.
function watchTap() {
  window.__watch?.stop?.();
  const w = { current: [], skipSeen: false, skipAt: null };
  const look = () => {
    const m = document.querySelector('.measure');
    if (!m || m.dataset.step !== 'tap') return;
    for (const c of m.querySelectorAll('.m-text .m-word.is-current')) { const k = c.dataset.u + '|' + c.dataset.l; if (!w.current.includes(k)) w.current.push(k); }
    if (!w.skipSeen && m.querySelector('.m-skip-same')) {
      w.skipSeen = true;
      w.skipAt = Math.max(-1, ...[...m.querySelectorAll('.m-text .m-word.is-lit')].map((e) => Number(e.dataset.u)));
    }
  };
  const mo = new MutationObserver(look);
  mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'data-step'], childList: true });
  w.stop = () => mo.disconnect();
  window.__watch = w;
  return true;
}

// 화면 배치 문제(재기 화면 안). 패널·두루마리 넘침, 화면 밖 요소, 48px보다 작은 버튼.
function layoutProblems() {
  const out = [];
  const visible = (e) => {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('[hidden]');
  };
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1) out.push('문서 넘침');
  const panel = document.querySelector('.world.is-split .world-panel');
  const root = document.querySelector('.measure');
  if (!panel || !root) return ['재기 화면 없음'];
  if (panel.scrollHeight > panel.clientHeight + 1 || panel.scrollWidth > panel.clientWidth + 1) out.push('패널 넘침 ' + panel.scrollWidth + 'x' + panel.scrollHeight + ' > ' + panel.clientWidth + 'x' + panel.clientHeight);
  const text = root.querySelector('.m-text');
  if (text && visible(text) && (text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1)) out.push('두루마리 넘침 ' + text.scrollWidth + 'x' + text.scrollHeight + ' > ' + text.clientWidth + 'x' + text.clientHeight);
  const rr = root.getBoundingClientRect();
  for (const e of root.querySelectorAll('*')) {
    if (!visible(e) || e.closest('.m-book-body, .m-journal-body')) continue;
    const r = e.getBoundingClientRect();
    if (r.left < rr.left - 1 || r.right > rr.right + 1 || r.top < rr.top - 1 || r.bottom > rr.bottom + 1) out.push('재기 화면 밖: ' + e.className + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
  }
  if (rr.right > innerWidth + 1 || rr.bottom > innerHeight + 1) out.push('재기 화면이 화면 밖');
  for (const b of root.querySelectorAll('button')) {
    if (!visible(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.width < 47.5 || r.height < 47.5) out.push('작은 버튼: ' + (b.textContent || b.getAttribute('aria-label') || b.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  return out.slice(0, 8);
}

// 모든 쪽, 모든 층(원문·오늘 소리·풀이)을 넘기며 배치 문제를 모은다
async function scanAllPages() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  const root = document.querySelector('.measure');
  let pages = 0;
  for (let layer = 0; layer < 3; layer++) {
    for (let k = 0; k < 100; k++) { const p = root.querySelector('.m-prev'); if (!p || p.disabled) break; p.click(); await sleep(5); }
    for (let k = 0; k < 100; k++) {
      await sleep(5);
      pages++;
      const label = root.querySelector('.m-layer')?.dataset.layer + ' ' + (root.querySelector('.m-page')?.textContent ?? '');
      for (const p of window.__layoutProblems()) problems.push(label + ': ' + p);
      const n = root.querySelector('.m-next');
      if (!n || n.disabled) break;
      n.click();
    }
    root.querySelector('.m-layer').click();
    await sleep(10);
  }
  return { problems: problems.slice(0, 10), pages };
}

// ── 도우미 ──
const ev = (page, fn, arg) => page.evaluate(fn, arg);

async function setup(page) {
  await page.waitForFunction(() => window.__m?.ready === true, null, { timeout: 20000 });
  await page.evaluate(`window.__solveFold = ${solveFold.toString()};
    window.__solveSlash = ${solveSlash.toString()};
    window.__solveAction = ${solveAction.toString()};
    window.__layoutProblems = ${layoutProblems.toString()};
    window.__scanAllPages = ${scanAllPages.toString()};
    window.__watchTap = ${watchTap.toString()};`);
}

async function openM(page, o) {
  await ev(page, (o) => window.__m.open(o), o);
  await page.waitForSelector('.world.is-split .measure', { timeout: 5000 });
}
const step = (page) => ev(page, () => document.querySelector('.measure')?.dataset.step ?? null);
async function waitStep(page, s, timeout = 10000) {
  await page.waitForFunction((s) => document.querySelector('.measure')?.dataset.step === s, s, { timeout });
}
async function waitResult(page, timeout = 10000) {
  await page.waitForFunction(() => window.__m.state.result || window.__m.state.error, null, { timeout });
  return ev(page, () => ({ result: window.__m.state.result, error: window.__m.state.error }));
}
const events = (page, name) => ev(page, (n) => window.__m.log.filter((e) => e.name === n).map((e) => e.detail), name);
const watchTapOn = (page) => ev(page, () => window.__watchTap());
const watched = (page) => ev(page, () => { const w = window.__watch; w?.stop?.(); return w ? { current: w.current, skipSeen: w.skipSeen, skipAt: w.skipAt } : null; });
// 다시 들은 단위(첫 낭송 뒤의 낭송마다 맨 앞 단위)를 '단위|줄' 열쇠로
function replayedKeys(s, plays) {
  const g = buildGrid(s);
  return plays.slice(1).map((p) => { const seg = g.segments[p[0]]; return seg.unit + '|' + (seg.line ?? ''); });
}

function actionInfo(actionId, s) {
  const n = s.units.length;
  return {
    action: actionId,
    aaUnit: s.genre === 'hyangga' && n === 10 ? 8 : n - 1,
    ranges: (s.features?.refrains ?? []).flatMap((r) => r.ranges),
  };
}

// 한 편을 처음부터 끝까지 잰다. tapWith: 'beat' | 'slash'
async function measureSong(page, o, tapWith) {
  await openM(page, o);
  const s = song(o.songId);
  const r1 = await ev(page, () => window.__solveFold());
  if (r1 !== 'done') throw new Error('접기가 끝나지 않음: ' + r1);
  await waitStep(page, 'tap');
  if (tapWith === 'beat') {
    await page.click('.measure .m-listen');
    await page.waitForFunction(() => document.querySelector('.measure')?.dataset.step !== 'tap', null, { timeout: 120000 });
  } else {
    const r2 = await ev(page, () => window.__solveSlash());
    if (r2 !== 'done') throw new Error('빗금이 끝나지 않음: ' + r2);
  }
  const actionId = ACTION_OF[o.wing];
  await waitStep(page, 'action');
  const r3 = await ev(page, (i) => window.__solveAction(i), actionInfo(actionId, s));
  if (r3 !== 'done') throw new Error('고유 동작이 끝나지 않음: ' + r3);
  await waitStep(page, 'sheet');
  const sheetText = await ev(page, () => document.querySelector('.measure .m-sheet')?.textContent ?? '');
  await page.click('.measure .m-finish');
  const { result, error } = await waitResult(page);
  if (error) throw new Error('재기 실패: ' + error);
  return { result, sheetText, expected: deriveSheet(s, actionId) };
}

// ═══════════════ 점검 ═══════════════
console.log('— 점검 도구 음성 사례');
ok(!deepEqual(deriveSheet(song('dongjitdal'), 'stairs'), deriveSheet(song('chang-naegoja'), 'stairs')), '비교 도우미가 다른 감정서를 다르다고 본다');
ok(!deepEqual(deriveFoldEvidence(song('gasiri')), { units: 3 }), '비교 도우미가 틀린 단위 수를 잡는다');
ok(deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), '비교 도우미는 열쇠 순서를 가리지 않는다');
ok(deriveActionEvidence('stairs', song('myeonangjeongga')).applicable === false && deriveTapEvidence(song('chan-giparangga')).mode === 'gu', '기대값 계산이 README 6절 모양을 따른다');

console.log('— 감정서 글(화면 없이 sheetLines로)');
{
  const lineTexts = (sheet, s, opts) => sheetLines(sheet, s, opts).map((l) => l.text);
  // 걷기: 세 걸음 전에 멈춤 / 세 걸음에서 멈춤 / 넘어서 이어짐
  const walkText = (id) => lineTexts(deriveSheet(song(id), 'walk'), song(id)).find((t) => t.includes('걸음')) ?? '';
  const one = walkText('samogok');
  const three = walkText('dongjitdal');
  const many = walkText('myeonangjeongga');
  ok(one.includes('세 걸음이 되기 전에 멈춘다') && !one.includes('이어진다'), '걷기: 한 연짜리 「사모곡」은 세 걸음이 되기 전에 멈춘다 ' + one);
  ok(three.includes('세 걸음에서 멈춘다') && !three.includes('이어진다'), '걷기: 세 장의 「동짓달 기나긴 밤을」은 세 걸음에서 멈춘다 ' + three);
  ok(many.includes('세 걸음에서 멈추지 않고 이어진다'), '걷기: 「면앙정가」는 세 걸음에서 멈추지 않고 이어진다 ' + many);
  // 음성 사례: 두 가지 말만 쓰던 예전 감정서는 한 연짜리 노래에 '이어진다'를 붙여 잡힌다
  const oldWalk = (a) => '[' + a.steps + '걸음 — ' + (a.stopsAtThree ? '세 걸음에서 멈춘다' : '세 걸음에서 멈추지 않고 이어진다') + ']';
  ok(oldWalk(deriveActionEvidence('walk', song('samogok'))).includes('이어진다'), '음성 사례: 예전 두 가지 말은 한 연짜리 노래를 이어진다고 적어 잡힌다');
  ok(walkWords(2) !== walkWords(3) && walkWords(3) !== walkWords(4) && walkWords(2) !== walkWords(4), '걷기 말은 세 가지가 서로 다르다');
  // 향가 두드리기 줄: 구 수를 세는 두드리기임을 밝히고 '박'이 아니라 '번'으로 센다(C3)
  const guNeutral = lineTexts(deriveSheet(song('chan-giparangga'), 'aa-door'), song('chan-giparangga'), { neutral: true }).find((t) => t.includes('두드려')) ?? '';
  const guRevealed = lineTexts(deriveSheet(song('seodongyo'), 'aa-door'), song('seodongyo'), { neutral: false }).find((t) => t.includes('두드려')) ?? '';
  ok(guNeutral === '[덩이 하나에 한 번씩 두드려 셈, 모두 열 번]' && guRevealed === '[구 하나에 한 번씩 두드려 셈, 모두 네 번]', '향가 두드리기 줄은 구 수를 세는 두드리기로 적는다 ' + JSON.stringify([guNeutral, guRevealed]));
  ok(!lineTexts(deriveSheet(song('chan-giparangga'), 'aa-door'), song('chan-giparangga'), { neutral: true }).some((t) => /박/.test(t)), "(음성) 향가 감정서에 '박'이라는 말이 없다(예전 '[덩이마다 한 박, 모두 열 박]'은 걸린다)");

  // 보스(neutral): 「사모곡」 감정서에 '줄'이 없고 단위는 '덩이'. 후렴 고리 걸기를 쓰기 전에는 여음·후렴 줄이 없다
  const sm = song('samogok');
  const full = deriveSheet(sm, 'refrain-link');
  const beforeTool = { fold: full.fold, tap: full.tap, action: null, actions: [] };
  const bossBefore = lineTexts(beforeTool, sm, { neutral: true });
  ok(bossBefore.length === 2 && bossBefore.every((t) => !t.includes('줄')) && bossBefore[1].includes('덩이'), '보스 「사모곡」: 두드리기 줄이 \'줄\' 대신 \'덩이\'를 쓴다 ' + JSON.stringify(bossBefore));
  ok(!bossBefore.includes(L.sheetRefrains) && bossBefore.every((t) => !/여음|후렴|되풀이/.test(t)), '보스 「사모곡」: 도구를 쓰기 전에는 여음·후렴 줄이 없다 ' + JSON.stringify(bossBefore));
  const bossOther = lineTexts({ ...beforeTool, actions: [deriveActionEvidence('stairs', sm)] }, sm, { neutral: true });
  ok(!bossOther.includes(L.sheetRefrains), '보스 「사모곡」: 다른 도구(계단 오르기)를 써도 여음·후렴 줄은 없다 ' + JSON.stringify(bossOther));
  const bossAfter = lineTexts({ ...beforeTool, actions: [deriveActionEvidence('refrain-link', sm)] }, sm, { neutral: true });
  ok(bossAfter.includes(L.sheetRefrains), '음성 사례: 후렴 고리 걸기를 쓰면 여음·후렴 줄이 나온다(위 점검이 줄을 늘 숨기는 것이 아니다) ' + JSON.stringify(bossAfter));
  const wingLines = lineTexts(beforeTool, sm);
  ok(wingLines.some((t) => t.includes('줄마다') || t.includes('줄 ')), "음성 사례: 관(neutral 아님)에서는 같은 증거를 '줄'로 적는다 " + JSON.stringify(wingLines));
  // 관: 여음·후렴 줄은 후렴 고리 걸기의 증거로만(고려가요 노래를 다른 관 동작으로 재면 없다)
  const gs = song('gasiri');
  ok(lineTexts(deriveSheet(gs, 'refrain-link'), gs).includes(L.sheetRefrains), '관: 고려가요관 동작(후렴 고리 걸기)으로 잰 「가시리」 감정서에는 여음·후렴 줄이 있다');
  ok(!lineTexts(deriveSheet(gs, 'stairs'), gs).includes(L.sheetRefrains), '관: 계단 오르기로 잰 「가시리」 감정서에는 여음·후렴 줄이 없다(두드리기만으로는 적지 않음)');
}

const server = await startServer();
const sessions = [];
try {
  // ── 크롬북 크기: 동작 점검 ──
  // MEASURE_ONLY=phone이면 화면 크기 점검만 한다(점검을 고칠 때 빨리 돌리려고)
  if (process.env.MEASURE_ONLY !== 'phone') {
  const game = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.chromebook });
  sessions.push(game);
  const { page } = game;
  await setup(page);

  console.log('— 갈래마다 한 편: 두드리기(박자 칸에 맞춘 자동 탭)');
  const beatSheets = {};
  for (const [genre, id] of Object.entries(GENRE_SONGS)) {
    const s = song(id);
    await watchTapOn(page);
    const { result, sheetText, expected } = await measureSong(page, { songId: id, wing: genre }, 'beat');
    beatSheets[id] = result;
    const seen = await watched(page);
    const plays = await ev(page, () => window.__m.auto.plays);
    const grids = await ev(page, () => window.__m.auto.grids);
    const tapPlays = grids.filter((g) => g.voice);
    ok(tapPlays.length >= 1 && tapPlays.every((g) => g.countIn), genre + ': 두드리기 낭송은 새로 시작할 때마다 박 알림(countIn)을 단다');
    ok(plays[0].length === buildGrid(s).segments.length, genre + ': 처음에는 남은 단위를 한 번에 이어 낸다(' + plays[0].length + '단위)');
    if (genre === 'hyangga') ok(seen.current.length > 0, '향가관: 지금 울리는 구가 보인다(늘 보이는 도움) ' + JSON.stringify(seen.current.slice(0, 3)));
    else {
      const replayed = replayedKeys(s, plays);
      ok(seen.current.every((k) => replayed.includes(k)), genre + ': 지금 울리는 음보 표시는 놓쳐서 다시 듣는 단위에서만 보인다(귀로 듣기) ' + JSON.stringify({ current: seen.current, replayed }));
    }
    // 구마다 한 박인 향가는 넘기기가 없다(박 수 2 이상일 때만)
    const skipExpected = { hyangga: false, goryeo: false, sijo: true, gasa: true, saseol: false }[genre];
    ok(seen.skipSeen === skipExpected, genre + ": '같은 걸음으로 넘기기'는 남은 단위가 모두 같은 박 수일 때만 " + (skipExpected ? '보인다' : '보이지 않는다') + ' ' + JSON.stringify(seen));
    if (genre === 'gasa') {
      ok(seen.skipAt === 4, '가사 「면앙정가」(4·4·3·4·4…): 세 음보 행 뒤 같은 박 수 두 행(4·5행 번호 3·4)을 마친 뒤에야 보인다 (' + seen.skipAt + ')');
      const walkPlays = grids.filter((g) => !g.voice);
      ok(walkPlays.length === s.units.length && walkPlays.every((g) => g.beats === 4 && g.sounds.length === 1 && g.sounds[0] === 'janggu' && !g.countIn), '가사: 걷기 한 걸음마다 낭송 대신 장구 네 번 ' + JSON.stringify(walkPlays.slice(0, 2)));
      ok(tapPlays.length >= 1 && tapPlays.every((g) => g.voice), '음성 사례: 두드리기 칸에는 낭송 조각이 있어 걷기 칸과 구별된다');
    }
    ok(deepEqual(result, expected), genre + ' ' + id + ': 감정서가 deriveSheet와 같다 ' + JSON.stringify(result));
    const folds = (await events(page, 'diorama:fold')).map((d) => d.unit).sort((a, b) => a - b);
    ok(same(folds, Array.from({ length: s.units.length - 1 }, (_, i) => i)), genre + ': 실제 단위 경계에서만 접혔다(diorama:fold ' + JSON.stringify(folds) + ')');
    const lights = await events(page, 'diorama:pillar-light');
    const keys = new Set(lights.map((d) => d.unit + '|' + (d.line ?? '-') + '|' + (d.foot ?? '-')));
    // 고려가요는 박에 드는 음보만 기둥 불을 켠다(여음·후렴·되풀이 머리는 두드리지 않는다)
    const total = genre === 'hyangga' ? s.units.length : (genre === 'goryeo' ? s.units.flatMap((u) => u.lines.flatMap((l) => l.feet.filter((f) => !f.kind))).length : s.units.flatMap((u) => u.feet).length);
    ok(keys.size === total, genre + ': 박마다 기둥 불(diorama:pillar-light) ' + keys.size + '/' + total);
    if (genre === 'hyangga') {
      ok(lights.every((d) => d.foot === null && d.line === undefined || d.foot === null), '향가: 기둥 불의 foot은 null');
      const fills = await events(page, 'diorama:floor-fill');
      ok(fills.length > 0 && fills.at(-1).gu === s.units.length, '향가: 구를 세며 탑 층이 찬다(diorama:floor-fill ' + JSON.stringify(fills.at(-1)) + ')');
      const aa = await events(page, 'diorama:aa-door');
      ok(aa.length === 1 && aa[0].present === true && aa[0].unit === 8, "향가: '아아' 문이 열린다 " + JSON.stringify(aa));
    }
    if (genre === 'goryeo') {
      const links = await events(page, 'diorama:refrain-link');
      ok(links.length >= 1 && links.every((d) => d.from && d.to && Number.isInteger(d.to.unit) && Number.isInteger(d.to.line)), '고려가요: 후렴 고리 사건 ' + links.length + '개');
    }
    if (genre === 'sijo') {
      const st = await events(page, 'diorama:stair-step');
      ok(st.length === 3 && same(st.at(-1), { step: 3, total: 3 }), '시조: 계단 세 칸 ' + JSON.stringify(st));
    }
    if (genre === 'gasa') {
      const ws = await events(page, 'diorama:walk-step');
      ok(ws.length === s.units.length && ws.at(-1).step === s.units.length, '가사: 행마다 한 걸음 ' + ws.length);
    }
    if (genre === 'saseol') {
      const un = await events(page, 'diorama:unroll');
      ok(un.length === s.units[1].feet.length && same(un.at(-1), { unit: 1, feet: s.units[1].feet.length }), '사설시조: 가운데 장이 음보마다 풀린다 ' + JSON.stringify(un.at(-1)));
    }
    const reacted = await ev(page, () => window.__m.fixture.react.map((r) => r.name));
    ok(reacted.includes('diorama:fold') && reacted.includes('diorama:pillar-light'), genre + ': 반응 사건이 왼쪽 관 모형(react)에 닿는다');
    ok(!GENRE_NAMES.some((g) => sheetText.includes(g)), genre + ': 감정서에 갈래 이름이 없다');
    ok(await ev(page, () => !document.querySelector('.world.is-split') && !document.querySelector('.measure')), genre + ': 마치면 반반 틀이 닫힌다');
  }
  const missing = await ev(page, () => window.__m.log.filter((e) => e.name === 'audio:missing').length);
  ok(missing > 0, '낭송 조각이 없어도(audio:missing ' + missing + '건) 두드리기가 막히지 않는다');

  console.log('— 엉뚱한 곳은 접히지 않는다');
  {
    await openM(page, { songId: 'dongjitdal', wing: 'sijo' });
    const r = await ev(page, () => {
      const gap = [...document.querySelectorAll('.measure .m-text button.m-gap')].find((g) => g.dataset.u === g.dataset.nu);
      gap.click();
      return { shake: gap.classList.contains('is-shake'), folded: gap.classList.contains('is-folded'), folds: window.__m.log.filter((e) => e.name === 'diorama:fold').length, step: document.querySelector('.measure').dataset.step };
    });
    ok(r.shake && !r.folded, '단위 안의 틈을 누르면 흔들리기만 한다');
    ok(r.folds === 0 && r.step === 'fold', '기록(diorama:fold)이 남지 않고 접기가 이어진다');
    const real = await ev(page, () => {
      const gap = [...document.querySelectorAll('.measure .m-text button.m-gap')].find((g) => g.dataset.u !== g.dataset.nu);
      gap.click();
      return { folded: gap.classList.contains('is-folded'), folds: window.__m.log.filter((e) => e.name === 'diorama:fold').map((e) => e.detail) };
    });
    ok(real.folded && same(real.folds, [{ unit: 0 }]), '실제 경계(초장 끝)는 접힌다 ' + JSON.stringify(real.folds));
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
  }

  console.log('— 빗금 모드·소리 끔은 두드리기와 같은 감정서');
  for (const [genre, id] of Object.entries(GENRE_SONGS)) {
    const a = await measureSong(page, { songId: id, wing: genre, slash: true }, 'slash');
    ok(deepEqual(a.result, beatSheets[id]) && deepEqual(a.result, a.expected), genre + ': 빗금 모드 감정서 = 두드리기 감정서');
    const b = await measureSong(page, { songId: id, wing: genre, muted: true }, 'slash');
    ok(deepEqual(b.result, beatSheets[id]), genre + ': 소리 끔 감정서 = 두드리기 감정서');
  }
  {
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', slash: true });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    const r = await ev(page, () => {
      const words = [...document.querySelectorAll('.measure .m-text button.m-word')];
      const byFoot = new Map();
      for (const w of words) { const k = w.dataset.u + '|' + w.dataset.f; byFoot.set(k, [...(byFoot.get(k) ?? []), w]); }
      const multi = [...byFoot.values()].find((ws) => ws.length > 1);
      const inner = multi[0];
      inner.click();
      return { shake: inner.classList.contains('is-shake'), slash: inner.classList.contains('has-slash'), lights: window.__m.log.filter((e) => e.name === 'diorama:pillar-light').length };
    });
    ok(r.shake && !r.slash && r.lights === 0, '빗금: 음보 경계가 아닌 곳은 흔들리기만 하고 기록이 없다');
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
  }

  console.log('— 고려가요 여음·후렴: 표시, 박 없음, 빗금의 답이 아님(추가 제안 T31)');
  {
    // 박에만 치고 여음·후렴 칸은 치지 않는다: 놓친 박이 없어 다시 듣지도, 빗금을 권하지도 않는다
    const gs = song('gasiri');
    await openM(page, { songId: 'gasiri', wing: 'goryeo', skipOffbeat: true });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    const marks = await ev(page, () => [...document.querySelectorAll('.measure .m-text .m-foot.is-offbeat')].map((e) => ({
      mark: e.dataset.mark, label: e.querySelector('.m-mark')?.textContent ?? null, border: getComputedStyle(e).borderTopStyle,
    })));
    // 드러나기 전(판정에서 맞기 전)이고 후렴 고리 걸기도 아직이면 이름표 없이 점선 테두리만(보스와 같다)
    ok(marks.length > 0 && marks.every((m) => !m.mark && m.label === null), '드러나기 전: 두루마리의 박 밖 음보에 여음·후렴 이름표가 없다 ' + JSON.stringify(marks.slice(0, 4)));
    ok(marks.every((m) => m.border !== 'none' && m.border !== ''), '여음·후렴은 색만이 아니라 테두리 모양으로도 구분된다');
    const hintNow = await ev(page, () => document.querySelector('.measure .m-hint')?.textContent ?? '');
    ok(!/여음|후렴/.test(hintNow), '드러나기 전: 두드리기 안내에 여음·후렴이라는 말이 없다 — ' + hintNow);
    await page.click('.measure .m-listen');
    await page.waitForFunction(() => document.querySelector('.measure')?.dataset.step !== 'tap', null, { timeout: 120000 });
    const plays = await ev(page, () => window.__m.auto.plays);
    const segCount = gs.units.reduce((n, u) => n + u.lines.length, 0);
    ok(plays.length === 1 && plays[0].length === segCount, '여음·후렴을 치지 않아도 다시 듣는 줄이 없다(한 번에 이어 낸 낭송 ' + plays.length + '번, ' + (plays[0]?.length ?? 0) + '/' + segCount + '줄, 후렴 줄도 들려준다)');
    ok(!(await ev(page, () => !!document.querySelector('.measure .m-suggest:not([hidden])'))), '여음·후렴 때문에 빗금 권유가 뜨지 않는다');
    const lights = await events(page, 'diorama:pillar-light');
    const offbeatLit = lights.filter((d) => gs.units[d.unit]?.lines?.[d.line]?.feet?.[d.foot]?.kind);
    ok(offbeatLit.length === 0, '여음·후렴 칸에는 기둥 불이 켜지지 않는다');
    await ev(page, (i) => window.__solveAction(i), actionInfo('refrain-link', gs));
    await waitStep(page, 'sheet');
    const sheetText = await ev(page, () => document.querySelector('.measure .m-sheet')?.textContent ?? '');
    ok(sheetText.includes('[네 덩이]') && sheetText.includes('[덩이마다 세 음보]') && sheetText.includes('[여음·후렴이 있다]') && !/연\]|줄마다/.test(sheetText), '드러나기 전 감정서: [네 덩이] [덩이마다 세 음보] [여음·후렴이 있다](연·줄이라는 말 없음) — ' + sheetText);
    const labelsAfter = await ev(page, () => [...document.querySelectorAll('.measure .m-text .m-mark')].map((e) => e.textContent));
    ok(labelsAfter.includes('여음') && labelsAfter.includes('후렴'), '고려가요관의 후렴 고리 걸기가 되풀이 구절을 찾으면 두루마리에 이름표가 붙는다 ' + JSON.stringify([...new Set(labelsAfter)]));
    await page.click('.measure .m-finish');
    const { result } = await waitResult(page);
    ok(deepEqual(result, deriveSheet(gs, 'refrain-link')), '박에만 쳐도 감정서는 노래 모양 그대로');
  }
  {
    // 드러난 노래(판정에서 맞음): 처음부터 이름표가 붙고, 감정서는 갈래 단위 이름(연·줄)
    await openM(page, { songId: 'gasiri', wing: 'goryeo', revealed: true, marksKnown: true });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    const marks = await ev(page, () => [...document.querySelectorAll('.measure .m-text .m-foot.is-offbeat')].map((e) => ({ mark: e.dataset.mark, label: e.querySelector('.m-mark')?.textContent ?? null })));
    ok(marks.some((m) => m.label === '여음') && marks.some((m) => m.label === '후렴'), '드러난 노래: 두루마리에 여음·후렴 이름표가 처음부터 보인다 ' + JSON.stringify(marks.slice(0, 3)));
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    // 고려가요관에서 이미 잰 노래(marksKnown)는 드러나기 전이라도 이름표를 단다
    await openM(page, { songId: 'gasiri', wing: 'goryeo', marksKnown: true });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    const known = await ev(page, () => document.querySelectorAll('.measure .m-text .m-mark').length);
    ok(known > 0, '고려가요관에서 이미 잰 노래는 이름표를 단다(' + known + ')');
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    // 감정서 단위 이름: 드러나기 전에는 '덩이', 드러난 뒤에는 갈래 단위 이름(음성 사례: 드러나면 '장'이 나온다)
    const ds = song('dongjitdal');
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', preMeasured: deriveSheet(ds, 'stairs') });
    await waitStep(page, 'sheet');
    const plain = await ev(page, () => [...document.querySelectorAll('.measure .m-sheet-line')].map((e) => e.textContent));
    ok(plain[0] === '[세 덩이]' && plain[1] === '[덩이마다 네 음보]', '드러나기 전 감정서: [세 덩이] [덩이마다 네 음보] ' + JSON.stringify(plain));
    ok(!plain.slice(0, 2).some((t) => /[구연장행줄]마다|[구연장행]\]/.test(t)), '드러나기 전 접기·두드리기 줄에 갈래 단위 이름이 없다');
    await page.click('.measure .m-finish');
    await waitResult(page);
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', preMeasured: deriveSheet(ds, 'stairs'), revealed: true });
    await waitStep(page, 'sheet');
    const named = await ev(page, () => [...document.querySelectorAll('.measure .m-sheet-line')].map((e) => e.textContent));
    ok(named[0] === '[세 장]' && named[1] === '[장마다 네 음보]', '드러난 노래 감정서: [세 장] [장마다 네 음보] ' + JSON.stringify(named));
    await page.click('.measure .m-finish');
    await waitResult(page);
  }
  {
    // 음성 사례: 박 칸을 일부러 놓치면(skip) 놓친 박으로 세어 다시 듣는다 — 위 점검이 '아무 것도 세지 않는' 것이 아님을 보인다
    await openM(page, { songId: 'gasiri', wing: 'goryeo', skipOffbeat: true, skip: 1 });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    await page.click('.measure .m-listen');
    await page.waitForFunction(() => document.querySelector('.measure')?.dataset.step !== 'tap', null, { timeout: 120000 });
    const plays = await ev(page, () => window.__m.auto.plays);
    ok(plays.length >= 2 && plays[1][0] === plays[0][0], '음성 사례: 박을 하나 놓치면 그 줄에서 멈추고 그 줄부터 다시 듣는다 ' + JSON.stringify(plays.slice(0, 3)));
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
  }
  {
    // 빗금: 여음·후렴·되풀이 말은 누를 수 없고(답이 아님), 후렴 줄은 처음부터 마친 줄이다
    await openM(page, { songId: 'seogyeong-byeolgok', wing: 'goryeo', slash: true });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    const r = await ev(page, () => {
      const off = [...document.querySelectorAll('.measure .m-text .m-foot.is-offbeat')];
      return { off: off.length, buttons: off.reduce((n, e) => n + e.querySelectorAll('button.m-word').length, 0), metricButtons: document.querySelectorAll('.measure .m-text .m-foot:not(.is-offbeat) button.m-word').length };
    });
    ok(r.off > 0 && r.buttons === 0 && r.metricButtons > 0, '빗금: 여음·후렴·되풀이 말은 누를 수 없고 박 음보만 누른다 ' + JSON.stringify(r));
    const r2 = await ev(page, () => window.__solveSlash());
    ok(r2 === 'done', '빗금: 박 음보 끝에만 빗금을 그어도 두드리기를 마친다');
    await ev(page, (i) => window.__solveAction(i), actionInfo('refrain-link', song('seogyeong-byeolgok')));
    await waitStep(page, 'sheet');
    await page.click('.measure .m-finish');
    const { result } = await waitResult(page);
    ok(deepEqual(result, deriveSheet(song('seogyeong-byeolgok'), 'refrain-link')) && same(result.tap.feet[0], [3, 0, 3, 0, 3, 0, 3, 0]), '빗금 감정서: 「서경별곡」 줄마다 세 음보(되풀이 머리·아즐가·후렴 줄 제외) ' + JSON.stringify(result.tap.feet[0]));
  }

  console.log('— 박을 세 번 놓치면 빗금 모드를 권한다');
  {
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', skip: 3 });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    await watchTapOn(page);
    ok(!(await ev(page, () => !!document.querySelector('.measure .m-suggest:not([hidden])'))), '처음에는 권하지 않는다');
    await page.click('.measure .m-listen');
    await page.waitForFunction(() => !!document.querySelector('.measure .m-suggest:not([hidden])'), null, { timeout: 30000 });
    ok(true, '세 박을 놓치자 빗금 모드 권유가 보인다');
    await page.waitForFunction(() => document.querySelector('.measure')?.dataset.step !== 'tap', null, { timeout: 60000 });
    const plays = await ev(page, () => window.__m.auto.plays);
    ok(same(plays[0], [0, 1, 2]) && same(plays[1], [0, 1, 2]) && plays.length === 2, '놓친 단위(초장)에서 멈추고 초장부터 다시 들은 뒤 중장·종장으로 이어 간다 ' + JSON.stringify(plays.slice(0, 4)));
    const seenReplay = await watched(page);
    ok(same(seenReplay.current, ['0|']), '다시 듣는 초장에서만 지금 울리는 음보가 보인다(시조관) ' + JSON.stringify(seenReplay.current));
    await ev(page, (i) => window.__solveAction(i), actionInfo('stairs', song('dongjitdal')));
    await waitStep(page, 'sheet');
    await page.click('.measure .m-finish');
    const { result } = await waitResult(page);
    ok(deepEqual(result, deriveSheet(song('dongjitdal'), 'stairs')), '놓쳐도 감정서는 노래 모양 그대로(채점 없음)');
  }
  {
    await openM(page, { songId: 'chang-naegoja', wing: 'saseol', skip: 3 });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    await page.click('.measure .m-listen');
    await page.waitForSelector('.measure .m-suggest:not([hidden]) .m-suggest-yes', { timeout: 30000 });
    await page.click('.measure .m-suggest-yes');
    await page.waitForFunction(() => document.querySelector('.measure')?.dataset.tapMode === 'slash', null, { timeout: 5000 });
    ok(true, '권유를 받아들이면 빗금으로 바뀐다');
    ok(same(await ev(page, () => window.__m.state.slashCalls.slice(-1)), [true]), '빗금 모드 설정을 ctx.setSlashMode로 알린다');
    await ev(page, () => window.__solveSlash());
    await ev(page, (i) => window.__solveAction(i), actionInfo('rapid-unroll', song('chang-naegoja')));
    await waitStep(page, 'sheet');
    await page.click('.measure .m-finish');
    const { result } = await waitResult(page);
    ok(deepEqual(result, deriveSheet(song('chang-naegoja'), 'rapid-unroll')), '두드리다 빗금으로 바꿔도 같은 감정서');
    await ev(page, () => window.__m.engine.setSlashMode(false));
  }

  console.log("— '같은 걸음으로 넘기기': 누르면 남은 단위를 마치고 감정서는 그대로");
  {
    const s = song('myeonangjeongga');
    await openM(page, { songId: 'myeonangjeongga', wing: 'gasa' });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    await page.click('.measure .m-listen');
    await page.waitForSelector('.measure .m-skip-same', { timeout: 30000 });
    const before = await ev(page, () => Math.max(...[...document.querySelectorAll('.measure .m-text .m-word.is-lit')].map((e) => Number(e.dataset.u))));
    await page.click('.measure .m-skip-same');
    await waitStep(page, 'action', 10000);
    ok(before < s.units.length - 1, '넘기기 전에는 남은 행이 있었다 (밝은 행 ' + before + ')');
    const lights = await events(page, 'diorama:pillar-light');
    const keys = new Set(lights.map((d) => d.unit + '|' + d.foot));
    const total = s.units.flatMap((u) => u.feet).length;
    ok(keys.size === total, '넘긴 행의 음보에도 기둥 불이 켜진다 ' + keys.size + '/' + total);
    await ev(page, (i) => window.__solveAction(i), actionInfo('walk', s));
    await waitStep(page, 'sheet');
    await page.click('.measure .m-finish');
    const { result } = await waitResult(page);
    ok(deepEqual(result, deriveSheet(s, 'walk')), '넘겨도 감정서는 노래 모양 그대로');
  }
  {
    // 입구 튜토리얼: 지금 울리는 음보가 늘 보이고, 넘기기는 없다
    await openM(page, { songId: 'taesan', wing: 'entrance' });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    await watchTapOn(page);
    await page.click('.measure .m-listen');
    await page.waitForFunction(() => document.querySelector('.measure')?.dataset.step !== 'tap', null, { timeout: 60000 });
    const seen = await watched(page);
    ok(seen.current.length === 3 && !seen.skipSeen, "입구 튜토리얼: 세 장 모두 지금 울리는 음보가 보이고 '같은 걸음으로 넘기기'는 없다 " + JSON.stringify(seen));
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    // 향가 노래를 다른 관(시조관)에서 재도 구마다 한 박이라 넘기기가 없다. 음성 사례: 같은 관의 시조(박 넷)에는 나온다
    await watchTapOn(page);
    await measureSong(page, { songId: 'chan-giparangga', wing: 'sijo' }, 'beat');
    const oneBeat = await watched(page);
    ok(!oneBeat.skipSeen, "향가 노래(구마다 한 박)는 시조관에서 재도 '같은 걸음으로 넘기기'가 없다 " + JSON.stringify(oneBeat));
    await watchTapOn(page);
    await measureSong(page, { songId: 'dongjitdal', wing: 'sijo' }, 'beat');
    ok((await watched(page)).skipSeen === true, '음성 사례: 같은 시조관에서 박 넷인 시조에는 넘기기가 나온다');
    // 보스: 지금 울리는 음보(다시 들을 때 빼고)도 넘기기도 없다
    await openM(page, { songId: 'dongjitdal', wing: null, mode: 'boss', journal: { concepts: {} } });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    await watchTapOn(page);
    await page.click('.measure .m-listen');
    await page.waitForFunction(() => document.querySelector('.measure')?.dataset.step !== 'tap', null, { timeout: 60000 });
    const bossSeen = await watched(page);
    const bossPlays = await ev(page, () => window.__m.auto.plays);
    ok(bossSeen.current.every((k) => replayedKeys(song('dongjitdal'), bossPlays).includes(k)) && !bossSeen.skipSeen, "보스: 지금 울리는 음보 표시(다시 들을 때 빼고)와 '같은 걸음으로 넘기기'가 없다 " + JSON.stringify(bossSeen));
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
  }

  console.log('— 멈췄다 재개·빗금으로 바꿀 때 지난 친 박 표시를 지운다');
  {
    // 첫 박이 밝아지는 순간 메뉴 멈춤 → 재개: 진행 중이던 초장을 처음부터 다시 들으므로 그 밝힘이 사라진다
    await openM(page, { songId: 'dongjitdal', wing: 'sijo' });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    await ev(page, () => new Promise((resolve) => {
      const mo = new MutationObserver(() => {
        if (!document.querySelector('.measure .m-text .m-word.is-lit[data-u="0"]')) return;
        mo.disconnect();
        window.__m.auto.enabled = false;
        window.__m.events.emit('audio:pause', { reason: 'menu' });
        resolve(true);
      });
      mo.observe(document.querySelector('.measure'), { subtree: true, attributes: true, attributeFilter: ['class'] });
      document.querySelector('.measure .m-listen').click();
    }));
    const litPaused = await ev(page, () => document.querySelectorAll('.measure .m-text .m-word.is-lit[data-u="0"]').length);
    ok(litPaused > 0, '멈춘 동안에는 친 박 표시가 남아 있다(음성 사례: 지우기 전 상태) ' + litPaused);
    await ev(page, () => window.__m.events.emit('audio:resume', { reason: 'menu' }));
    await page.waitForFunction(() => document.querySelectorAll('.measure .m-text .m-word.is-lit[data-u="0"]').length === 0, null, { timeout: 5000 }).catch(() => {});
    const litResumed = await ev(page, () => document.querySelectorAll('.measure .m-text .m-word.is-lit[data-u="0"]').length);
    ok(litResumed === 0, '재개하면 진행 중이던 단위의 친 박 표시를 지우고 처음부터 다시 듣는다 ' + litResumed);
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    // 빗금으로 바꿀 때: 마치지 않은 단위의 친 박 표시가 빗금 화면에 남지 않는다
    await openM(page, { songId: 'dongjitdal', wing: 'sijo' });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    await ev(page, () => new Promise((resolve) => {
      const mo = new MutationObserver(() => {
        if (!document.querySelector('.measure .m-text .m-word.is-lit[data-u="0"]')) return;
        mo.disconnect();
        window.__m.auto.enabled = false;
        window.__m.engine.setSlashMode(true);
        resolve(true);
      });
      mo.observe(document.querySelector('.measure'), { subtree: true, attributes: true, attributeFilter: ['class'] });
      document.querySelector('.measure .m-listen').click();
    }));
    await page.waitForFunction(() => document.querySelector('.measure')?.dataset.tapMode === 'slash', null, { timeout: 5000 });
    const slashLit = await ev(page, () => ({ lit: document.querySelectorAll('.measure .m-text .m-word.is-lit').length, cur: document.querySelectorAll('.measure .m-text .m-word.is-current').length }));
    ok(slashLit.lit === 0 && slashLit.cur === 0, '빗금으로 바꾸면 마치지 않은 단위의 친 박·지금 음보 표시가 남지 않는다 ' + JSON.stringify(slashLit));
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    await ev(page, () => window.__m.engine.setSlashMode(false));
  }

  console.log('— 소리 판이 멈춰 낭송이 나오지 않으면 낭송 듣기를 다시 보인다');
  {
    await openM(page, { songId: 'dongjitdal', wing: 'sijo' });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    await page.click('.measure .m-listen');
    // 멈춤 까닭 없이 소리 판이 멈춘다(손가락 기기에서 첫 누르기가 소리 판을 돌리지 못한 것과 같은 상태)
    await page.waitForFunction(() => !!document.querySelector('.measure .m-text .m-word.is-lit'), null, { timeout: 10000 });
    await ev(page, () => window.__m.engine.debug().ctx.suspend());
    await page.waitForFunction(() => { const b = document.querySelector('.measure .m-listen'); return !!b && !b.disabled; }, null, { timeout: 8000 });
    const hint = await ev(page, () => document.querySelector('.measure .m-hint')?.textContent ?? '');
    ok(hint === L.soundStuck, '약 3초 동안 소리 판 시각이 멈추면 낭송 듣기가 다시 눌리고 안내가 바뀐다 ' + JSON.stringify(hint));
    await page.click('.measure .m-listen');
    await page.waitForFunction(() => document.querySelector('.measure .m-listen')?.disabled === true, null, { timeout: 5000 });
    ok((await ev(page, () => window.__m.engine.debug().ctx.state)) === 'running', '낭송 듣기를 누르면 소리 판이 다시 돈다');
    await page.waitForFunction(() => document.querySelector('.measure')?.dataset.step !== 'tap', null, { timeout: 60000 });
    ok(true, '두드리기가 멈추지 않고 끝까지 간다');
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
  }

  console.log("— 고유 동작 다섯을 다른 갈래 노래에: '해당 없음'도 증거");
  const cross = [
    ['hyangga', 'seodongyo'], ['hyangga', 'dongjitdal'],
    ['goryeo', 'dongjitdal'], ['goryeo', 'chan-giparangga'],
    ['sijo', 'myeonangjeongga'], ['sijo', 'gasiri'], ['sijo', 'chang-naegoja'],
    ['gasa', 'dongjitdal'], ['gasa', 'gasiri'],
    ['saseol', 'chan-giparangga'], ['saseol', 'dongjitdal'], ['saseol', 'myeonangjeongga'],
  ];
  for (const [wing, id] of cross) {
    const { result, expected } = await measureSong(page, { songId: id, wing, slash: true }, 'slash');
    ok(deepEqual(result.action, expected.action) && deepEqual(result, expected), wing + ' 관 동작으로 ' + id + ': ' + JSON.stringify(result.action));
  }
  {
    // 음성 사례: 되풀이 구절이 있는데 '없다'를 누르면 흔들리기만 한다 / 아아 문에서 첫머리가 아닌 말은 흔들린다
    await openM(page, { songId: 'gasiri', wing: 'goryeo', slash: true });
    await ev(page, () => window.__solveFold());
    await ev(page, () => window.__solveSlash());
    await waitStep(page, 'action');
    const r = await ev(page, () => {
      const none = document.querySelector('.measure .m-action button.m-none');
      none.click();
      return { shake: none.classList.contains('is-shake'), step: document.querySelector('.measure').dataset.step };
    });
    ok(r.shake && r.step === 'action', "되풀이 구절이 있는 노래에서 '없다'는 받아들이지 않는다");
    const w = await ev(page, () => {
      const ws = [...document.querySelectorAll('.measure .m-text button.m-word')];
      const plain = ws.find((x) => Number(x.dataset.l) === 0);
      plain.click();
      return { shake: plain.classList.contains('is-shake'), links: window.__m.log.filter((e) => e.name === 'diorama:refrain-link').length };
    });
    ok(w.shake && w.links === 0, '되풀이 구절이 아닌 말은 고리가 걸리지 않는다');
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);

    await openM(page, { songId: 'chan-giparangga', wing: 'hyangga', slash: true });
    await ev(page, () => window.__solveFold());
    await ev(page, () => window.__solveSlash());
    await waitStep(page, 'action');
    const a = await ev(page, () => {
      const ws = [...document.querySelectorAll('.measure .m-text button.m-word[data-u="8"]')];
      const second = ws[1] ?? [...document.querySelectorAll('.measure .m-text button.m-word')].find((x) => x.dataset.u !== '8');
      second.click();
      return { shake: second.classList.contains('is-shake'), doors: window.__m.log.filter((e) => e.name === 'diorama:aa-door').length };
    });
    ok(a.shake && a.doors === 0, "'아아' 문: 첫머리가 아닌 말은 흔들리기만 한다");
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
  }

  console.log('— 보스 방식: 도구 고르기, 수첩 닫힘·일지 열림');
  {
    const journal = { concepts: { 'hyangga-exclaim': { state: 'ink', songs: ['a', 'b'] }, 'sijo-3jang': { state: 'pencil', songs: ['a'] } } };
    await openM(page, { songId: 'wonwangsaengga', wing: null, mode: 'boss', slash: true, journal });
    const ui = await ev(page, () => ({
      book: !!document.querySelector('.measure .m-book-btn'),
      journal: !!document.querySelector('.measure .m-journal-btn'),
    }));
    ok(!ui.book, '보스에서는 『분류 수첩』을 펼 수 없다');
    ok(ui.journal, '보스에서는 사서 일지가 열려 있다');
    await page.click('.measure .m-journal-btn');
    const items = await ev(page, () => [...document.querySelectorAll('.measure .m-journal .m-journal-item')].map((e) => e.dataset.concept + ':' + e.dataset.state));
    ok(items.includes('hyangga-exclaim:ink') && items.includes('sijo-3jang:pencil'), '일지에 개념 상태(연필·먹)가 보인다 ' + JSON.stringify(items.slice(0, 4)));
    await ev(page, () => window.__m.events.emit('help:journal-glow', { stage: 1, conceptIds: ['hyangga-exclaim'], songId: 'wonwangsaengga' }));
    ok(await ev(page, () => document.querySelector('.measure .m-journal-item[data-concept="hyangga-exclaim"]')?.classList.contains('is-glow')), '일지 도움(help:journal-glow)에 그 개념이 반짝인다');
    await page.click('.measure .m-journal-close');
    await ev(page, () => window.__solveFold());
    await ev(page, () => window.__solveSlash());
    await waitStep(page, 'tools');
    const tools = await ev(page, () => [...document.querySelectorAll('.measure .m-tool')].map((t) => t.dataset.action));
    ok(same(tools, ['aa-door', 'refrain-link', 'stairs', 'walk', 'rapid-unroll']), '다섯 고유 동작을 모두 도구로 고를 수 있다');
    const s = song('wonwangsaengga');
    await page.click('.measure .m-tool[data-action="stairs"]');
    await ev(page, (i) => window.__solveAction(i), actionInfo('stairs', s));
    await waitStep(page, 'tools');
    await page.click('.measure .m-tool[data-action="aa-door"]');
    await ev(page, (i) => window.__solveAction(i), actionInfo('aa-door', s));
    await waitStep(page, 'tools');
    await page.click('.measure .m-finish');
    const { result } = await waitResult(page);
    const exp = deriveSheet(s, 'aa-door');
    ok(deepEqual(result.fold, exp.fold) && deepEqual(result.tap, exp.tap), '보스: 접기·두드리기 증거가 노래 모양과 같다');
    ok(deepEqual(result.action, exp.action), '보스: 마지막으로 쓴 도구의 증거가 action이다 ' + JSON.stringify(result.action));
    ok(Array.isArray(result.actions) && result.actions.length === 2 && deepEqual(result.actions[0], deriveActionEvidence('stairs', s)) && deepEqual(result.actions[1], exp.action), '보스: 쓴 도구 모두의 증거가 actions에 순서대로 담긴다');
  }

  console.log('— 단위가 하나뿐인 노래(접을 곳이 없다)');
  {
    // 음성 사례: 접을 곳이 남아 있으면 '접을 곳이 없다'는 흔들리기만 한다
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', slash: true });
    const r = await ev(page, () => {
      const b = document.querySelector('.measure button.m-fold-none');
      b.click();
      return { shake: b.classList.contains('is-shake'), step: document.querySelector('.measure').dataset.step };
    });
    ok(r.shake && r.step === 'fold', "접을 곳이 남았으면 '접을 곳이 없다'를 받아들이지 않는다");
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    const s = song('samogok');
    await openM(page, { songId: 'samogok', wing: null, mode: 'boss', slash: true, journal: { concepts: {} } });
    ok(await ev(page, () => document.querySelectorAll('.measure .m-text button.m-gap').length > 0 && [...document.querySelectorAll('.measure .m-text button.m-gap')].every((g) => g.dataset.u === g.dataset.nu)), '한 연짜리 노래의 틈은 모두 단위 안이다');
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    // 보스에서는 갈래가 드러나지 않는다(spec 10.2): 여음 '위 덩더둥셩'에 이름표가 없고 종류도 가리지 않는다.
    // 점선 테두리로만 묶여 있고 그 말은 누를 수 없다(박에 들지 않는 곳은 여전히 빗금의 답이 아니다).
    const bossTap = await ev(page, () => {
      const root = document.querySelector('.measure');
      const off = [...root.querySelectorAll('.m-text .m-foot.is-offbeat')];
      return {
        off: off.length,
        offButtons: off.reduce((n, e) => n + e.querySelectorAll('button.m-word').length, 0),
        tags: root.querySelectorAll('.m-text .m-mark').length,
        kinds: root.querySelectorAll('.m-text .is-yeoeum, .m-text .is-refrain, .m-text .is-repeat, .m-text [data-mark]').length,
        words: (root.querySelector('.m-text').textContent + ' ' + root.querySelector('.m-hint').textContent).match(/여음|후렴|되풀이/g) ?? [],
      };
    });
    ok(bossTap.off > 0 && bossTap.offButtons === 0, '보스 「사모곡」: 박 밖 음보는 따로 묶여 누를 수 없다 ' + JSON.stringify(bossTap));
    ok(bossTap.tags === 0 && bossTap.kinds === 0 && bossTap.words.length === 0, "보스 「사모곡」: 두루마리와 안내에 '여음'·'후렴'·'되풀이' 이름표와 종류 표시가 없다 " + JSON.stringify(bossTap));
    await ev(page, () => window.__solveSlash());
    await waitStep(page, 'tools');
    const toolsSheet = () => ev(page, () => document.querySelector('.measure .m-tools-sheet')?.textContent ?? '');
    const before = await toolsSheet();
    ok(!before.includes('[여음·후렴이 있다]') && !before.includes('줄'), "보스 「사모곡」: 도구를 쓰기 전 감정서에 '줄'도 여음·후렴 줄도 없다 " + JSON.stringify(before));
    await page.click('.measure .m-tool[data-action="refrain-link"]');
    await ev(page, (i) => window.__solveAction(i), actionInfo('refrain-link', s));
    await waitStep(page, 'tools');
    const after = await toolsSheet();
    ok(after.includes('[여음·후렴이 있다]') && !after.includes('줄'), '음성 사례: 후렴 고리 걸기를 쓴 뒤에는 여음·후렴 줄이 나온다(위 점검이 늘 비어 있는 감정서를 본 것이 아니다) ' + JSON.stringify(after));
    await page.click('.measure .m-finish');
    const { result } = await waitResult(page);
    const exp = deriveSheet(s, 'refrain-link');
    ok(deepEqual(result.fold, exp.fold) && deepEqual(result.tap, exp.tap) && deepEqual(result.action, exp.action), '보스 「사모곡」(한 연): 감정서가 노래 모양과 같다 ' + JSON.stringify(result.fold));
  }

  console.log('— 미리 잰 노래');
  {
    const pre = deriveSheet(song('dongjitdal'), 'refrain-link');
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', preMeasured: pre });
    const r = await ev(page, () => ({ step: document.querySelector('.measure').dataset.step, lines: document.querySelectorAll('.measure .m-sheet .m-sheet-line').length }));
    ok(r.step === 'sheet' && r.lines === 3, '감정서가 채워진 채로 열린다 ' + JSON.stringify(r));
    await page.click('.measure .m-finish');
    const { result } = await waitResult(page);
    ok(deepEqual(result, pre), '들고 온 감정서를 그대로 돌려준다');
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', preMeasured: true });
    ok((await step(page)) === 'sheet', 'preMeasured: true도 채워진 채로 열린다');
    await page.click('.measure .m-finish');
    const r2 = await waitResult(page);
    ok(deepEqual(r2.result, pre), 'preMeasured: true면 보낸 관(고려가요관)의 고유 동작으로 잰 감정서다');
  }

  console.log('— 첫 사용 안내는 깃발마다 한 번');
  {
    await openM(page, { songId: 'taesan', wing: 'entrance', slash: true, introSeen: { common: false, unique: false } });
    const seen = [];
    for (const kind of ['fold', 'tap', 'unique']) {
      await page.waitForSelector('.measure .m-intro[data-intro="' + kind + '"] .m-finger', { timeout: 5000 });
      seen.push(kind);
      await page.click('.measure .m-intro-ok');
      if (kind === 'fold') await ev(page, () => window.__solveFold());
      if (kind === 'tap') await ev(page, () => window.__solveSlash());
    }
    ok(same(seen, ['fold', 'tap', 'unique']), '첫 노래: 접기 → 두드리기 → 고유 동작 순서로 하나씩 보여 준다');
    await ev(page, (i) => window.__solveAction(i), actionInfo('stairs', song('taesan')));
    await waitStep(page, 'sheet');
    await page.click('.measure .m-finish');
    const r = await waitResult(page);
    ok(deepEqual(r.result, deriveSheet(song('taesan'), 'stairs')), '튜토리얼(입구)은 시조 계단을 쓴다');
    ok(same(await ev(page, () => window.__m.state.introCalls), ['common', 'unique']), '본 안내를 ctx.onIntroSeen으로 알린다');
    // 같은 깃발로 다시 열면 안내가 없다
    await openM(page, { songId: 'ireondeul', wing: 'sijo', slash: true, keepFlags: true });
    await page.waitForTimeout(400);
    ok(!(await ev(page, () => !!document.querySelector('.measure .m-intro'))), '이미 본 안내는 다시 보이지 않는다');
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    // 관에 처음 들어감: 고유 동작만
    await openM(page, { songId: 'gasiri', wing: 'goryeo', slash: true, introSeen: { common: true, unique: false } });
    await page.waitForTimeout(300);
    ok(!(await ev(page, () => !!document.querySelector('.measure .m-intro'))), '관 첫 입장: 접기 안내는 없다');
    await ev(page, () => window.__solveFold());
    await ev(page, () => window.__solveSlash());
    await page.waitForSelector('.measure .m-intro[data-intro="unique"]', { timeout: 5000 });
    ok(true, '관 첫 입장: 그 관의 고유 동작만 새로 보여 준다');
    await page.click('.measure .m-intro-ok');
    ok(same(await ev(page, () => window.__m.state.introCalls), ['unique']), '관 첫 입장: unique 깃발만 쓴다');
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
  }

  console.log('— 『분류 수첩』과 반짝이는 줄');
  {
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', notebookGlow: [{ wing: 'sijo', genre: 'sijo', conceptIds: ['sijo-final3'] }] });
    ok(!(await ev(page, () => !!document.querySelector('.measure .m-journal-btn'))), '관에서는 일지 대신 수첩을 둔다');
    ok(await ev(page, () => document.querySelector('.measure .m-book-btn')?.classList.contains('is-glow')), '반짝이는 줄이 있으면 수첩 버튼이 알린다');
    await page.click('.measure .m-book-btn');
    const tabs = await ev(page, () => [...document.querySelectorAll('.measure .m-book .m-book-tab')].map((t) => t.dataset.genre));
    ok(same(tabs, ['hyangga', 'goryeo', 'sijo', 'gasa', 'saseol']), '수첩 다섯 쪽이 모두 보인다');
    await page.click('.measure .m-book-tab[data-genre="sijo"]');
    ok(await ev(page, () => document.querySelector('.measure .m-book-line[data-line-id="sijo-final"]')?.classList.contains('is-glow')), '처음 받은 도움 줄(sijo-final)이 반짝인다');
    ok(!(await ev(page, () => document.querySelector('.measure .m-book-line[data-line-id="sijo-shape"]')?.classList.contains('is-glow'))), '관련 없는 줄은 반짝이지 않는다');
    await ev(page, () => window.__m.events.emit('help:notebook-glow', { wing: 'sijo', genre: 'gasa', conceptIds: ['gasa-4beat'] }));
    await page.click('.measure .m-book-tab[data-genre="gasa"]');
    const g = await ev(page, () => [...document.querySelectorAll('.measure .m-book-line.is-glow')].map((e) => e.dataset.lineId));
    ok(g.length >= 1, 'help:notebook-glow를 받으면 그 쪽의 관련 줄이 반짝인다 ' + JSON.stringify(g));
    const lp = await ev(page, () => window.__layoutProblems());
    ok(lp.length === 0, '수첩을 펼쳐도 배치 문제가 없다 ' + JSON.stringify(lp));
    await page.click('.measure .m-book-close');
    await ev(page, () => window.__m.state.controller.abort());
    const r = await waitResult(page);
    ok(/AbortError/.test(r.error ?? ''), '중단 신호에 AbortError로 끝난다');
    ok(await ev(page, () => !document.querySelector('.world.is-split') && !document.querySelector('.measure')), '중단되면 반반 틀을 닫는다');
  }

  console.log("— '재기 그만두기'(관, B5): 낭송 도중 그만두면 감정서 없이 끝나고 소리·사건이 남지 않는다");
  {
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', canQuit: true });
    const qb = await ev(page, () => { const b = document.querySelector('.measure .m-head .m-quit'); return b ? { tag: b.tagName, text: b.textContent, w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height } : null; });
    ok(qb?.tag === 'BUTTON' && qb.text === '재기 그만두기' && qb.h >= 48, "관 재기 머리에 '재기 그만두기' 단추(48px 이상)가 있다 " + JSON.stringify(qb));
    ok((await ev(page, () => window.__layoutProblems())).length === 0, '그만두기 단추가 있어도 배치 문제가 없다 ' + JSON.stringify(await ev(page, () => window.__layoutProblems())));
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    await page.click('.measure .m-listen');
    await page.waitForFunction(() => window.__m.auto.beats >= 2, null, { timeout: 10000 });
    await page.focus('.measure .m-quit');
    await page.keyboard.press('Enter');
    const r = await waitResult(page);
    ok(/AbortError/.test(r.error ?? '') && !r.result, "낭송 도중 '재기 그만두기'(키보드 Enter)를 누르면 감정서 없이 AbortError로 끝난다 " + r.error);
    ok(await ev(page, () => !document.querySelector('.world.is-split') && !document.querySelector('.measure')), '그만두면 반반 틀을 닫는다');
    await page.waitForFunction(() => window.__m.auto.ends.length >= window.__m.auto.plays.length, null, { timeout: 5000 });
    const before = await ev(page, () => ({ beats: window.__m.auto.beats, log: window.__m.log.length, ends: window.__m.auto.ends.slice(), plays: window.__m.auto.plays.length }));
    await new Promise((res) => setTimeout(res, 1500));
    const after = await ev(page, () => ({ beats: window.__m.auto.beats, log: window.__m.log.length, plays: window.__m.auto.plays.length }));
    ok(before.ends.length === before.plays && after.beats === before.beats && after.log === before.log && after.plays === before.plays, '그만둔 뒤 예약한 낭송은 거두어지고 박·디오라마 사건이 더 나지 않는다 ' + JSON.stringify({ before, after }));
    const again = await measureSong(page, { songId: 'dongjitdal', wing: 'sijo', canQuit: true }, 'beat');
    ok(deepEqual(again.result, again.expected), '그만둔 뒤 다시 잡으면 처음부터 재어 같은 감정서를 받는다');
    // 음성 사례: canQuit이 없으면(입구 튜토리얼), 보스이면 단추가 없다
    await openM(page, { songId: 'dongjitdal', wing: 'sijo' });
    const noQuit = await ev(page, () => !document.querySelector('.measure .m-quit'));
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    await openM(page, { songId: 'dongjitdal', mode: 'boss', canQuit: true });
    const noQuitBoss = await ev(page, () => !document.querySelector('.measure .m-quit'));
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    ok(noQuit && noQuitBoss, "(음성) 그만두기를 허락하지 않은 재기와 보스 재기에는 '재기 그만두기'가 없다");
  }

  console.log('— 움직임 줄이기');
  {
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', introSeen: { common: false, unique: true } });
    await page.waitForSelector('.measure .m-intro .m-finger');
    const moving = await ev(page, () => getComputedStyle(document.querySelector('.measure .m-finger')).animationName);
    ok(moving !== 'none', '평소에는 손가락이 움직인다 (' + moving + ')');
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    await ev(page, () => window.__m.world.setDeviceReduceMotion(true));
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', introSeen: { common: false, unique: true } });
    await page.waitForSelector('.measure .m-intro .m-finger');
    const still = await ev(page, () => getComputedStyle(document.querySelector('.measure .m-finger')).animationName);
    ok(still === 'none', '움직임 줄이기에서는 손가락이 움직이지 않는다 (' + still + ')');
    await ev(page, () => window.__m.state.controller.abort());
    await waitResult(page);
    await ev(page, () => window.__m.world.setDeviceReduceMotion(false));
  }

  ok(game.external.length === 0, '바깥 주소 요청이 없다 ' + game.external.slice(0, 3).join(', '));
  ok(game.errors.length === 0, '콘솔 오류가 없다 ' + game.errors.slice(0, 3).join(' | '));

  }

  // ── 휴대폰 가로 844×390: 글자 크기 세 단계에서 넘침 없음 ──
  console.log('— 844×390 글자 크기 1 / 1.15 / 1.3');
  const phone = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.phone, touch: true });
  sessions.push(phone);
  const pp = phone.page;
  await setup(pp);
  // 음성 사례: 넘침 검사가 실제 넘침을 잡는다
  await openM(pp, { songId: 'dongjitdal', wing: 'sijo' });
  const caught = await ev(pp, () => {
    const t = document.querySelector('.measure .m-text');
    const extra = document.createElement('div');
    extra.style.height = '2000px';
    t.append(extra);
    const p = window.__layoutProblems();
    extra.remove();
    return p;
  });
  ok(caught.some((p) => p.includes('넘침')), '넘침 검사가 일부러 넣은 넘침을 잡는다');
  await ev(pp, () => window.__m.state.controller.abort());
  await waitResult(pp);
  const long = [['saseol', 'nimi-oma'], ['gasa', 'sangchungok'], ['goryeo', 'cheongsan-byeolgok'], ['hyangga', 'chan-giparangga'], ['goryeo', 'seogyeong-byeolgok']];
  for (const scale of [1, 1.15, 1.3]) {
    await ev(pp, (v) => { document.documentElement.style.setProperty('--text-scale', String(v)); window.__m.events.emit('settings:text-scale', { value: v }); }, scale);
    const list = scale === 1.3 ? long : long.slice(0, 2);
    for (const [wing, id] of list) {
      await openM(pp, { songId: id, wing, slash: true, canQuit: true });   // 관 재기처럼 '재기 그만두기'가 머리에 있다
      const a = await ev(pp, () => window.__scanAllPages());
      ok(a.problems.length === 0, scale + ' ' + id + ' 접기 전(이어진 글줄): ' + a.pages + '쪽 넘침 없음 ' + JSON.stringify(a.problems));
      await ev(pp, () => window.__solveFold());
      await waitStep(pp, 'tap');
      const b = await ev(pp, () => window.__scanAllPages());
      ok(b.problems.length === 0, scale + ' ' + id + ' 접은 뒤(빗금): ' + b.pages + '쪽 넘침 없음 ' + JSON.stringify(b.problems));
      if (scale === 1.3) {
        await ev(pp, () => window.__solveSlash());
        await waitStep(pp, 'action');
        const c = await ev(pp, () => window.__layoutProblems());
        ok(c.length === 0, scale + ' ' + id + ' 고유 동작 화면 넘침 없음 ' + JSON.stringify(c));
      }
      await ev(pp, () => window.__m.state.controller.abort());
      await waitResult(pp);
    }
  }
  {
    // 감정서·보스 도구 화면도 1.3에서
    await openM(pp, { songId: 'nimi-oma', wing: 'saseol', preMeasured: true, canQuit: true });
    const s1 = await ev(pp, () => window.__layoutProblems());
    ok(s1.length === 0, '1.3 감정서 화면 넘침 없음 ' + JSON.stringify(s1));
    await pp.click('.measure .m-finish');
    await waitResult(pp);
    await openM(pp, { songId: 'gapminga', wing: null, mode: 'boss', slash: true, journal: { concepts: {} } });
    await ev(pp, () => window.__solveFold());
    await ev(pp, () => window.__solveSlash());
    await waitStep(pp, 'tools');
    const s2 = await ev(pp, () => window.__layoutProblems());
    ok(s2.length === 0, '1.3 보스 도구 화면 넘침 없음 ' + JSON.stringify(s2));
    await pp.click('.measure .m-journal-btn');
    const s3 = await ev(pp, () => window.__layoutProblems());
    ok(s3.length === 0, '1.3 일지 화면 넘침 없음 ' + JSON.stringify(s3));
    await ev(pp, () => window.__m.state.controller.abort());
    await waitResult(pp);
  }
  ok(phone.external.length === 0, '휴대폰: 바깥 주소 요청이 없다');
  ok(phone.errors.length === 0, '휴대폰: 콘솔 오류가 없다 ' + phone.errors.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('✗ ' + (e.stack || e.message));
} finally {
  for (const g of sessions) await g.close().catch(() => {});
  await server.close();
}

if (failures) {
  console.error('\n✗ 재기 화면 점검 실패 ' + failures + '건');
  process.exitCode = 1;
} else {
  console.log('\n✓ 재기 화면 점검 통과');
}
