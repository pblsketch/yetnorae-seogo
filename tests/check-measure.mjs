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
    window.__scanAllPages = ${scanAllPages.toString()};`);
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
    const { result, sheetText, expected } = await measureSong(page, { songId: id, wing: genre }, 'beat');
    beatSheets[id] = result;
    ok(deepEqual(result, expected), genre + ' ' + id + ': 감정서가 deriveSheet와 같다 ' + JSON.stringify(result));
    const folds = (await events(page, 'diorama:fold')).map((d) => d.unit).sort((a, b) => a - b);
    ok(same(folds, Array.from({ length: s.units.length - 1 }, (_, i) => i)), genre + ': 실제 단위 경계에서만 접혔다(diorama:fold ' + JSON.stringify(folds) + ')');
    const lights = await events(page, 'diorama:pillar-light');
    const keys = new Set(lights.map((d) => d.unit + '|' + (d.line ?? '-') + '|' + (d.foot ?? '-')));
    const total = genre === 'hyangga' ? s.units.length : (genre === 'goryeo' ? s.units.flatMap((u) => u.lines.flatMap((l) => l.feet)).length : s.units.flatMap((u) => u.feet).length);
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

  console.log('— 박을 세 번 놓치면 빗금 모드를 권한다');
  {
    await openM(page, { songId: 'dongjitdal', wing: 'sijo', skip: 3 });
    await ev(page, () => window.__solveFold());
    await waitStep(page, 'tap');
    ok(!(await ev(page, () => !!document.querySelector('.measure .m-suggest:not([hidden])'))), '처음에는 권하지 않는다');
    await page.click('.measure .m-listen');
    await page.waitForFunction(() => !!document.querySelector('.measure .m-suggest:not([hidden])'), null, { timeout: 30000 });
    ok(true, '세 박을 놓치자 빗금 모드 권유가 보인다');
    await page.waitForFunction(() => document.querySelector('.measure')?.dataset.step !== 'tap', null, { timeout: 60000 });
    const plays = await ev(page, () => window.__m.auto.plays);
    ok(same(plays[0], [0]) && same(plays[1], [0]), '놓친 단위(초장)를 다시 듣는다 ' + JSON.stringify(plays.slice(0, 4)));
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
    await ev(page, () => window.__solveSlash());
    await waitStep(page, 'tools');
    await page.click('.measure .m-tool[data-action="refrain-link"]');
    await ev(page, (i) => window.__solveAction(i), actionInfo('refrain-link', s));
    await waitStep(page, 'tools');
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
      await openM(pp, { songId: id, wing, slash: true });
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
    await openM(pp, { songId: 'nimi-oma', wing: 'saseol', preMeasured: true });
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
