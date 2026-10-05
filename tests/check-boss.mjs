// 보스전 「서고의 밤」 점검(T17, spec 2·10·11·12·14·15·20).
// 점검 페이지 tests/pages/boss.html이 제품의 한 판 세션 위에 보스전 화면(js/boss/boss.js)을 띄운다.
// 상태는 점검 도구가 로컬 저장소에 넣은 기록뿐이다(제품에는 점검용 입구가 없다). 다섯 관을 마친 기록은 엔진이 요구하는
// 표시(칸 묶음·바구니 통과·방 완료, 행선지 결과, 개념)를 맞춰 넣는다. 실제 노래 데이터와 실제 누르기로 진행한다.
//
// 확인하는 것
//  - 리믹스 데이터(js/data/remix.js): 형식, 갈래마다 칸 노래 한 조각, 조각마다 갈래 모양이 드러나는 범위
//  - 열림: 네 관만 마친 기록에서는 놀 수 있는 것이 없다
//  - 1단계(3D, 1366×768): 정해진 순서 다섯 편, 수첩 닫힘·일지 열림, 재기 전에는 꽂을 수 없음, 틀린 자리 → 먹안개,
//    세 번째 틀림 → 일지 반짝임·일지 도움 기록, '누가 불렀을까?' 맞음·틀림(틀려도 정답 무리를 보임),
//    맞게 꽂은 뒤 창을 다시 열면 그 노래를 다시 함(처음에 맞혔는지는 그대로)
//  - 2단계 박자 방식: 바뀌는 지점 탭, 지점이 아닌 곳의 탭은 틀림(기록 없음), 놓친 지점 다시 듣기
//  - 3단계: 좀 대왕, 다시 재기, 틀린 자리 → 먹안개, 시조 자리 → 좀 대왕이 흩어지고 선대 사서가 풀려남, slot-set(mentor)
//  - 마지막 카드 자료에 보스 1단계 기록 셋이 그대로 담김
//  - 2D 그림 판(844×390): 박자 없는 2단계(글줄 탭), 2단계·3단계 도중 다시 열기(spec 20)
//  - 3D 844×390, 2D 1366×768 화면 배치(넘침·48px)
//  - 콘솔 오류·바깥 요청 없음, 점수 말 없음, 제품 코드에 점검 입구 없음
// 음성 사례: 점검 도우미(배치 검사, 점수 말 찾기, 카드 비교, 리믹스 검증, 정적 검사)가 실제 실패를 잡는지도 본다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer, ROOT } from './lib/server.mjs';
import { openGame, VIEWPORTS } from './lib/browser.mjs';
import { songs } from '../js/data/songs/index.js';
import { defaultData, defaultProgress, SAVE_KEY } from '../js/core/save.js';
import { SONG_TABLE, WING_TABLE, ROUTING } from '../js/data/song-table.js';
import { PLAY_WING_IDS, GENRE_IDS } from '../js/data/wings.js';
import { CONCEPT_IDS, SINGER_GROUPS } from '../js/data/concepts.js';
import { buildFinalCard } from '../js/core/cards.js';
import { validateRemix } from '../js/core/validate.js';
import * as R from '../js/core/rhythm.js';

const PAGE = 'tests/pages/boss.html';
const SCORE_RE = /점수|등급|순위|타이머|게임 오버|정답률|score|rank/i;
const ORDER = SONG_TABLE.boss.unseenOrder.map((g) => SONG_TABLE.boss.unseen[g]);
const RECORD_ID = 's-boss';

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
}
const song = (id) => songs.find((s) => s.id === id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fileExists = (rel) => fs.existsSync(path.join(ROOT, rel));

// ───────── 기록 만들기(점검 도구 전용 상태 주입) ─────────

const ROOM_RECORDS = {
  hyangga: { room: 'hyangga', interpretationId: 'both', interpretationText: '점검용 해석', isInterpretation: true },
  goryeo: { room: 'goryeo', lastConditionId: 'a', lastConditionText: '점검용 조건' },
  sijo: { room: 'sijo', rooms: ['na', 'dal', 'cheongpung'], outside: ['gangsan'], interpretationId: 'as-written', interpretationText: '점검용 해석', isInterpretation: true },
  gasa: { room: 'gasa', words: ['점검'] },
  saseol: { room: 'saseol', predictionId: 'nim', predictionText: '점검용 예측' },
};

function doneWing(w) {
  const t = WING_TABLE[w];
  return {
    state: 'done', shelfBound: true, basketDone: true, roomDone: true, bonusDone: false, uniqueActionIntroSeen: true,
    doneAt: '2026-10-01T09:00:00.000Z',
    placements: {
      shelf: t.shelf.map((songId) => ({ songId, fixed: true })),
      basket: t.stray.map((s) => ({ songId: s.songId, to: s.to, fixed: true })),
      bonus: [null, null, null],
    },
    wrongCount: 0,
    measured: [...t.shelf, ...t.stray.map((s) => s.songId)],
  };
}

// 다섯 관(wings가 4면 앞 넷)을 마친 기록. 개념은 반드시 지나는 길의 노래로 계산해 넣는다.
function seedBoss({ wings = 5, boss = null, slash = true, muted = false } = {}) {
  const data = defaultData();
  data.device.slashMode = slash;
  data.device.muted = muted;
  data.device.calibrated = true;
  const p = defaultProgress();
  p.tutorialDone = true;
  const doneIds = PLAY_WING_IDS.slice(0, wings);
  const passed = [SONG_TABLE.tutorial];
  for (const w of PLAY_WING_IDS) {
    if (doneIds.includes(w)) {
      p.wings[w] = doneWing(w);
      p.rooms[w] = ROOM_RECORDS[w];
      const t = WING_TABLE[w];
      passed.push(...t.shelf, ...t.stray.map((s) => s.songId), t.room);
      p.keepsakes.push(...t.shelf);
    } else if (PLAY_WING_IDS.indexOf(w) === wings) {
      p.wings[w].state = 'open';
    }
  }
  // 행선지 결과: 마친 관의 바구니에서 보낸 노래만
  for (const [kind, map] of Object.entries(ROUTING)) {
    for (const [to, ids] of Object.entries(map)) {
      const sent = ids.filter((id) => doneIds.some((w) => WING_TABLE[w].stray.some((s) => s.songId === id)));
      p[kind === 'prewait' ? 'prewaiting' : 'returned'][to] = sent;
    }
  }
  for (const c of CONCEPT_IDS) {
    const by = [...new Set(passed.filter((id) => song(id)?.evidences?.includes(c)))];
    p.concepts[c] = { state: by.length >= 2 ? 'ink' : by.length === 1 ? 'pencil' : 'none', songs: by };
  }
  if (boss) {
    p.boss.state = boss.state;
    if (boss.allUnseenDone) {
      for (const id of ORDER) p.boss.unseen[id] = { done: true, firstTryCorrect: true, journalHelp: false, singerGroupCorrect: true };
    }
  } else if (wings === 5) {
    p.boss.state = 'stage1';
  }
  data.slots[RECORD_ID] = { id: RECORD_ID, name: '점검', appearance: 'a', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', progress: p };
  data.lastSlotId = RECORD_ID;
  return { [SAVE_KEY]: JSON.stringify(data) };
}

// ───────── 페이지 안 도우미(문자열로 넘어간다) ─────────

// 보스 재기 화면을 끝까지: 접기 → 빗금 → 도구 하나(tool) → '다 쟀다'
async function solveBossMeasure(tool) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rewind = async () => { for (let k = 0; k < 200; k++) { const p = document.querySelector('.boss .measure .m-prev'); if (!p || p.disabled) return; p.click(); await sleep(2); } };
  let last = null;
  let used = false;
  const steps = [];
  for (let i = 0; i < 6000; i++) {
    const root = document.querySelector('.boss .measure');
    if (!root) return { done: true, steps };
    const step = root.dataset.step;
    if (step !== last) { last = step; steps.push(step); if (step !== 'tools') await rewind(); }
    if (step === 'fold') {
      const gap = [...root.querySelectorAll('.m-text button.m-gap:not(.is-folded)')].find((g) => g.dataset.u !== g.dataset.nu);
      if (gap) { gap.click(); await sleep(2); continue; }
      const next = root.querySelector('.m-next');
      if (next && !next.disabled) { next.click(); await sleep(2); continue; }
      root.querySelector('button.m-fold-none')?.click();
    } else if (step === 'tap' && root.dataset.tapMode === 'slash') {
      const groups = new Map();
      for (const w of root.querySelectorAll('.m-text button.m-word')) {
        const k = w.dataset.u + '|' + w.dataset.l + '|' + w.dataset.f;
        if (!groups.has(k) || Number(w.dataset.w) > Number(groups.get(k).dataset.w)) groups.set(k, w);
      }
      const target = [...groups.values()].find((w) => !w.classList.contains('has-slash'));
      if (target) { target.click(); await sleep(2); continue; }
      const next = root.querySelector('.m-next');
      if (next && !next.disabled) { next.click(); await sleep(2); continue; }
    } else if (step === 'tools') {
      if (!used) {
        const t = root.querySelector('.m-tool[data-action="' + tool + '"]');
        if (t) { used = true; t.click(); await sleep(30); continue; }
      } else {
        const f = root.querySelector('.m-finish');
        if (f && !f.disabled) { f.click(); await sleep(30); continue; }
      }
    } else if (step === 'action') {
      const box = root.querySelector('.m-action');
      const l = box?.querySelector('button.m-letter:not(.is-done)');
      if (l) { l.click(); await sleep(2); continue; }
      const none = box?.querySelector('button.m-none');
      if (none) { none.click(); await sleep(30); continue; }
    }
    await sleep(20);
  }
  return { done: false, step: document.querySelector('.boss .measure')?.dataset.step, steps };
}

// 보스 화면 배치 문제: 문서 넘침, 화면 밖으로 나간 것, 48px보다 작은 버튼, 넘친 글 상자(스크롤 상자 제외)
function bossLayoutProblems() {
  const out = [];
  const visible = (e) => {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('[hidden]');
  };
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1) out.push('문서 넘침');
  const root = document.querySelector('.boss');
  if (!root) return ['보스 화면 없음'];
  for (const e of root.querySelectorAll('.boss-ui *, .boss-panel *, .boss-journal *')) {
    if (!visible(e) || e.closest('.boss-scroll, .m-text, .m-drawer-body, .m-side')) continue;
    const r = e.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push('화면 밖: ' + e.className + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
  }
  for (const e of root.querySelectorAll('.boss-ui .boss-card, .boss-ui .boss-shelf, .boss-ui .boss-speech')) {
    if (!visible(e)) continue;
    if (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2) out.push('글 넘침: ' + e.className + ' ' + e.scrollWidth + 'x' + e.scrollHeight + ' > ' + e.clientWidth + 'x' + e.clientHeight);
  }
  for (const b of root.querySelectorAll('button')) {
    if (!visible(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.width < 47.5 || r.height < 47.5) out.push('작은 버튼: ' + (b.textContent || b.getAttribute('aria-label') || b.className).trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  return out.slice(0, 10);
}

// ───────── 도우미 ─────────
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const waitSel = (page, sel, timeout = 15000) => page.waitForFunction((s) => !!document.querySelector(s), sel, { timeout, polling: 100 });
const click = (page, sel) => ev(page, (s) => { const e = document.querySelector(s); if (!e || e.disabled) return false; e.click(); return true; }, sel);
const bossAttr = (page, k) => ev(page, (k) => document.querySelector('.boss')?.dataset[k] ?? null, k);
const saved = (page) => ev(page, (k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY).then((d) => d?.slots?.[RECORD_ID]?.progress ?? null);
const logOf = (page, name) => ev(page, (n) => window.__b.log.filter((e) => e.name === n).map((e) => e.detail), name);
const pageText = (page) => ev(page, () => document.body.innerText);

async function setup(page) {
  await page.waitForFunction(() => window.__b?.ready === true || !!window.__b?.error, null, { timeout: 30000, polling: 100 });
  const err = await ev(page, () => window.__b.error ?? null);
  if (err) throw new Error('점검 페이지가 열리지 않음: ' + err);
  await page.evaluate(`window.__solveBossMeasure = ${solveBossMeasure.toString()};
    window.__bossLayout = ${bossLayoutProblems.toString()};`);
  await waitSel(page, '.boss');
}

async function reload(page) {
  await page.reload();
  await setup(page);
}

async function layout(page, label) {
  const probs = await ev(page, () => window.__bossLayout());
  ok(probs.length === 0, '배치 문제 없음: ' + label + (probs.length ? ' ' + JSON.stringify(probs) : ''));
}

// 단계 안내(있으면) 넘기기
async function passIntro(page, stage) {
  await page.waitForFunction((s) => document.querySelector('.boss')?.dataset.stage === s, stage, { timeout: 20000, polling: 100 });
  if (await ev(page, () => !!document.querySelector('.boss .boss-go'))) await click(page, '.boss .boss-go');
}

async function measureCurrent(page, tool) {
  ok(await click(page, '.boss .boss-measure'), '재기 단추를 누를 수 있다');
  await waitSel(page, '.boss .measure.is-boss');
  const r = await ev(page, (t) => window.__solveBossMeasure(t), tool);
  if (!r.done) throw new Error('보스 재기가 끝나지 않음: ' + JSON.stringify(r));
  await page.waitForFunction(() => [...document.querySelectorAll('.boss .boss-slot')].some((b) => !b.disabled), null, { timeout: 10000, polling: 100 });
  return r;
}

async function placeAt(page, wing) {
  ok(await click(page, `.boss .boss-slot[data-wing="${wing}"]`), wing + ' 자리에 꽂는다');
  await page.waitForTimeout(80);
}

const bossRec = async (page) => (await saved(page))?.boss ?? null;

// 1단계 노래 한 편: 재기 → (틀린 자리들) → 맞는 자리 → 무리 고르기
async function playUnseen(page, { id, wrongs = [], group, reloadBeforeSinger = false, afterMeasure = null }) {
  ok((await ev(page, () => document.querySelector('.boss .boss-song')?.dataset.song)) === id, '지금 낯선 노래: ' + id);
  const slotsDisabled = await ev(page, () => [...document.querySelectorAll('.boss .boss-slot')].every((b) => b.disabled));
  ok(slotsDisabled, id + ': 재기 전에는 자리에 꽂을 수 없다(음성 사례)');
  const r = await measureCurrent(page, 'stairs');
  ok(r.steps[0] === 'fold' && r.steps.includes('tools'), id + ': 접기부터 시작해 도구를 고른다');
  if (afterMeasure) await afterMeasure();
  for (const w of wrongs) {
    await placeAt(page, w);
    ok((await bossAttr(page, 'fog')) === 'thick', id + ': 틀린 자리(' + w + ') → 먹안개가 짙어진다');
    ok(!(await ev(page, () => !!document.querySelector('.boss .boss-singer'))), id + ': 틀린 자리에서는 무리를 묻지 않는다');
  }
  const genre = song(id).genre;
  await placeAt(page, genre);
  await waitSel(page, '.boss .boss-singer');
  if (reloadBeforeSinger) return;
  const groups = await ev(page, () => [...document.querySelectorAll('.boss .boss-singer .boss-group')].map((b) => b.dataset.group + ':' + b.textContent.trim()));
  ok(same(groups, SINGER_GROUPS.map((g) => g.id + ':' + g.name)), id + ': "누가 불렀을까?" 다섯 무리(정해진 id와 이름)');
  await click(page, `.boss .boss-singer .boss-group[data-group="${group}"]`);
  await waitSel(page, '.boss .boss-singer-answer');
  const ans = await ev(page, () => { const a = document.querySelector('.boss .boss-singer-answer'); return { text: a.textContent, correct: a.dataset.correct }; });
  const right = song(id).singerGroups;
  const names = right.map((g) => SINGER_GROUPS.find((x) => x.id === g).name);
  ok(names.every((n) => ans.text.includes(n)), id + ': 맞든 틀리든 정답 무리(' + names.join(', ') + ')를 보인다');
  ok(ans.correct === String(right.includes(group)), id + ': 고른 무리의 맞음 표시가 데이터와 같다');
  ok(!SCORE_RE.test(ans.text), id + ': 무리 결과에 점수 말이 없다');
  await click(page, '.boss .boss-next');
}

// ───────── 1. 데이터와 정적 검사(Node) ─────────

async function checkData() {
  console.log('── 리믹스·보스 글 데이터');
  ok(fileExists('js/data/remix.js'), 'js/data/remix.js가 있다');
  if (!fileExists('js/data/remix.js')) return;
  const { remix } = await import(pathToFileURL(path.join(ROOT, 'js/data/remix.js')).href);
  const errs = validateRemix(remix, { songs, table: SONG_TABLE });
  ok(errs.length === 0, '리믹스 형식이 검증기를 통과한다 ' + JSON.stringify(errs));
  const fr = remix?.fragments ?? [];
  ok(fr.length === 5 && same([...fr.map((f) => f.genre)].sort(), [...GENRE_IDS].sort()), '조각 다섯, 갈래마다 하나');
  // 갈래 모양이 드러나는 범위인지
  const shows = (f) => {
    const s = song(f.songId);
    const units = [];
    for (let u = f.from; u <= f.to; u++) units.push(u);
    if (f.genre === 'hyangga') return units.length === s.units.length || units.includes(s.features?.exclamation?.unit);
    if (f.genre === 'goryeo') return (s.features?.refrains ?? []).some((r) => r.ranges.some((x) => units.includes(x.unit)));
    if (f.genre === 'sijo') return f.from === 0 && f.to === 2;
    if (f.genre === 'saseol') return f.from === 0 && f.to === 2 && (s.features?.stretched ?? []).length > 0;
    if (f.genre === 'gasa') return units.length >= 4;
    return false;
  };
  for (const f of fr) ok(shows(f), f.genre + ' 조각(' + f.songId + ' ' + f.from + '~' + f.to + ')은 갈래 모양이 드러나는 범위다');
  // 실제 노래로 박자 칸을 만들면 지점이 넷
  const grid = R.buildRemixGrid(remix, song);
  ok(grid.switches.length === 4, '리믹스 박자 칸의 바뀌는 지점 넷');
  // 음성 사례: 갈래가 겹친 리믹스는 검증기가 잡는다
  const bad = JSON.parse(JSON.stringify(remix));
  bad.fragments[4] = { ...bad.fragments[0] };
  ok(validateRemix(bad, { songs, table: SONG_TABLE }).length > 0, '음성 사례: 갈래가 겹친 리믹스를 잡는다');
  const bad2 = JSON.parse(JSON.stringify(remix));
  bad2.fragments[0] = { ...bad2.fragments[0], songId: 'gapminga' };
  ok(validateRemix(bad2, { songs, table: SONG_TABLE }).length > 0, '음성 사례: 칸 노래가 아닌 조각을 잡는다');

  ok(fileExists('js/data/boss-text.js'), 'js/data/boss-text.js가 있다');
  if (fileExists('js/data/boss-text.js')) {
    const mod = await import(pathToFileURL(path.join(ROOT, 'js/data/boss-text.js')).href);
    const strings = [];
    // 대사의 speaker 값(BOSS_SPEAKERS의 열쇠)은 화면에 보이는 글이 아니므로 뺀다
    const walk = (v) => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (k !== 'speaker') walk(x); }); };
    walk(mod);
    const speakers = [];
    const walkSp = (v) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'speaker') speakers.push(x); else walkSp(x); } };
    walkSp(mod.BOSS_TEXT);
    ok(speakers.length > 0 && speakers.every((s) => mod.BOSS_SPEAKERS?.[s]), '대사의 말하는 이는 모두 정해진 인물이다');
    ok(strings.length >= 20 && strings.every((s) => s.trim().length > 0), '보스 글이 데이터 파일에 모여 있다(' + strings.length + '개)');
    ok(strings.every((s) => !SCORE_RE.test(s)), '보스 글에 점수 말이 없다');
    ok(strings.some((s) => /[가-힣]/.test(s)) && strings.every((s) => !/[A-Za-z]{4,}/.test(s)), '보스 글은 한국어다');
  }

  // 정적 검사: 제품 코드(js/boss, 보스 데이터)에 점검 입구·주소 인자·점수 말이 없다
  const files = [];
  const bossDir = path.join(ROOT, 'js/boss');
  if (fs.existsSync(bossDir)) for (const f of fs.readdirSync(bossDir)) if (f.endsWith('.js')) files.push(path.join(bossDir, f));
  for (const rel of ['js/data/remix.js', 'js/data/boss-text.js', 'css/boss.css']) if (fileExists(rel)) files.push(path.join(ROOT, rel));
  const forbidden = [/location\.search/, /URLSearchParams/, /location\.hash/, /점수|등급|순위|타이머|게임 오버/, /__b\b|__test|stub/i, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/];
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const re of forbidden) if (re.test(text)) hits.push(path.basename(f) + ' ' + re);
  }
  ok(files.length >= 3 && hits.length === 0, '제품 코드에 점검 입구·주소 인자·점수 말·바깥 주소가 없다 ' + hits.join(' | '));
  ok(forbidden[3].test('점수: 10') && forbidden[4].test('window.__b.x') && forbidden[5].test('https://cdn.example'), '음성 사례: 정적 검사 규칙이 실제 위반을 잡는다');
}

// ───────── 2. 열림 조건 ─────────

async function checkGating(base) {
  console.log('── 열림 조건(네 관만 마침)');
  const g = await openGame(base, { path: PAGE, seed: seedBoss({ wings: 4 }) });
  try {
    await setup(g.page);
    await waitSel(g.page, '.boss .boss-locked');
    const ui = await ev(g.page, () => ({
      measure: !!document.querySelector('.boss .boss-measure'),
      slots: document.querySelectorAll('.boss .boss-slot').length,
      remix: !!document.querySelector('.boss .boss-remix'),
      engineOpen: window.__b.session.progress.isBossOpen(),
      enter: window.__b.session.progress.enterBoss(),
    }));
    ok(!ui.engineOpen && ui.enter.ok === false && ui.enter.reason === 'boss-locked', '엔진: 네 관만 마치면 보스가 닫혀 있다');
    ok(!ui.measure && ui.slots === 0 && !ui.remix, '닫힌 보스에는 놀 수 있는 것이 없다');
    ok((await bossRec(g.page)).state === 'locked', '닫힌 보스의 기록은 locked 그대로');
    await click(g.page, '.boss .boss-leave');
    await g.page.waitForFunction(() => window.__b.goCalls.length > 0, null, { timeout: 5000 });
    ok((await ev(g.page, () => window.__b.goCalls[0].name)) === 'play', '닫힌 보스에서 돌아가기 → 한 판 화면');
    ok(g.errors.length === 0, '콘솔 오류 없음(열림 조건) ' + g.errors.join(' | '));
    ok(g.external.length === 0, '바깥 요청 없음(열림 조건)');
  } finally {
    await g.close();
  }
}

// ───────── 3. 처음부터 끝까지(3D, 1366×768, 박자 방식 2단계) ─────────

async function checkFull3D(base) {
  console.log('── 1~3단계(3D, 1366×768)');
  const g = await openGame(base, { path: PAGE, seed: seedBoss(), viewport: VIEWPORTS.chromebook });
  const p = g.page;
  try {
    await setup(p);
    ok((await bossAttr(p, 'mode')) === '3d', '3D로 열린다');
    ok(await ev(p, () => !!document.querySelector('.boss .boss-scene canvas')), '3D 장면 그림판이 있다');
    await passIntro(p, 'stage1');
    await waitSel(p, '.boss .boss-song');
    // 수첩은 닫히고 일지는 보인다
    const books = await ev(p, () => {
      const nb = document.querySelector('.play-btn[data-open="notebook"]');
      let covered = true;
      if (nb) {
        const r = nb.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        covered = !!hit?.closest('.boss');
      }
      return { covered, journal: !!document.querySelector('.boss .boss-journal-btn'), notebook: !!document.querySelector('.boss .m-book-btn, .boss .boss-notebook') };
    });
    ok(books.covered && !books.notebook, '보스에서는 『분류 수첩』을 열 수 없다');
    ok(books.journal, '보스에서는 사서 일지를 연다');
    const fogText = await ev(p, () => { const t = document.querySelector('.boss .boss-song-text'); return { text: t?.textContent ?? '', grey: !!t, lines: t?.querySelectorAll('br').length ?? -1 }; });
    ok(fogText.grey && fogText.text.length > 10 && fogText.lines === 0 && !fogText.text.includes('\n'), '낯선 노래는 줄바꿈 없는 회색 글줄로 나온다');
    await layout(p, '1단계 첫 화면(3D 1366×768)');
    ok(!SCORE_RE.test(await pageText(p)), '화면에 점수 말이 없다(1단계)');

    const seen = [];
    const track = async () => seen.push(await ev(p, () => document.querySelector('.boss .boss-song')?.dataset.song));

    // 1편: 틀린 자리 하나 → 맞는 자리, 무리 맞음
    await track();
    await playUnseen(p, { id: ORDER[0], wrongs: ['hyangga'], group: song(ORDER[0]).singerGroups[0] });
    let b = await bossRec(p);
    ok(b.unseen[ORDER[0]].done && b.unseen[ORDER[0]].firstTryCorrect === false && b.unseen[ORDER[0]].singerGroupCorrect === true && b.unseen[ORDER[0]].journalHelp === false, '1편 기록: 처음엔 틀림, 일지 도움 없음, 무리 맞음');
    ok((await logOf(p, 'help:journal-glow')).length === 0, '틀림 하나로는 일지가 반짝이지 않는다');

    // 2편: 두 번 더 틀려 같은 단계 세 번째 틀림 → 일지 도움
    await waitSel(p, `.boss .boss-song[data-song="${ORDER[1]}"]`);
    await track();
    const wrongGroup = SINGER_GROUPS.map((x) => x.id).find((x) => !song(ORDER[1]).singerGroups.includes(x));
    await playUnseen(p, { id: ORDER[1], wrongs: ['goryeo', 'sijo'], group: wrongGroup });
    const glow = await logOf(p, 'help:journal-glow');
    ok(glow.length === 1 && glow[0].stage === 1 && glow[0].songId === ORDER[1] && glow[0].conceptIds.length > 0, '같은 단계 세 번째 틀림에 일지 도움 신호(그 노래, 관련 개념)');
    const jg = await ev(p, () => ({ btn: document.querySelector('.boss .boss-journal-btn')?.classList.contains('is-glow'), items: [...document.querySelectorAll('.boss .boss-journal-item.is-glow')].map((e) => e.dataset.concept) }));
    ok(jg.btn && jg.items.length > 0 && jg.items.every((c) => glow[0].conceptIds.includes(c)), '일지 단추와 관련 개념이 반짝인다');
    b = await bossRec(p);
    ok(b.unseen[ORDER[1]].journalHelp === true && b.unseen[ORDER[1]].firstTryCorrect === false && b.unseen[ORDER[1]].singerGroupCorrect === false, '2편 기록: 일지 도움, 처음엔 틀림, 무리 틀림');
    ok(b.unseen[ORDER[0]].journalHelp === false, '앞 노래의 일지 도움은 바뀌지 않는다');

    // 3편: 맞게 꽂은 뒤 '누가 불렀을까' 전에 창을 다시 연다 → 그 노래를 다시 한다
    await waitSel(p, `.boss .boss-song[data-song="${ORDER[2]}"]`);
    await track();
    await playUnseen(p, { id: ORDER[2], reloadBeforeSinger: true });
    await layout(p, '누가 불렀을까(3D 1366×768)');
    await reload(p);
    await passIntro(p, 'stage1');
    await waitSel(p, '.boss .boss-song');
    ok((await ev(p, () => document.querySelector('.boss .boss-song')?.dataset.song)) === ORDER[2], '다시 열면 진행 중이던 노래를 다시 한다(spec 20)');
    b = await bossRec(p);
    ok(b.unseen[ORDER[0]].done && b.unseen[ORDER[1]].done && !b.unseen[ORDER[2]].done && b.unseen[ORDER[2]].firstTryCorrect === true, '마친 노래 기록은 남고, 처음에 맞혔는지는 그대로다');
    ok(!(await ev(p, () => !!document.querySelector('.boss .boss-singer'))), '다시 열면 무리 묻기가 아니라 재기부터');
    await playUnseen(p, { id: ORDER[2], group: song(ORDER[2]).singerGroups[0] });
    b = await bossRec(p);
    ok(b.unseen[ORDER[2]].firstTryCorrect === true && b.unseen[ORDER[2]].singerGroupCorrect === true, '3편 기록: 처음에 맞힘(다시 해도 그대로), 무리 맞음');

    await waitSel(p, `.boss .boss-song[data-song="${ORDER[3]}"]`);
    await track();
    await playUnseen(p, { id: ORDER[3], group: song(ORDER[3]).singerGroups[0] });
    await waitSel(p, `.boss .boss-song[data-song="${ORDER[4]}"]`);
    await track();
    // 2단계는 박자 방식으로: 마지막 노래를 잰 뒤 빗금 모드를 끈다
    await playUnseen(p, { id: ORDER[4], group: song(ORDER[4]).singerGroups[0], afterMeasure: () => ev(p, () => window.__b.session.audio.setSlashMode(false)) });
    ok(same([...new Set(seen)], ORDER), '낯선 노래는 정해진 순서(가사 → 향가 → 고려가요 → 시조 → 사설시조)로 나온다');

    // ── 2단계(박자 방식) ──
    await passIntro(p, 'stage2');
    await waitSel(p, '.boss .boss-remix');
    ok((await ev(p, () => document.querySelector('.boss .boss-remix')?.dataset.mode)) === 'beat', '소리가 켜져 있으면 2단계는 박자 방식');
    await layout(p, '2단계 박자 방식(3D 1366×768)');
    const before = JSON.stringify((await bossRec(p)).unseen);
    await ev(p, () => { const a = window.__b.auto; a.wrongAtSegments.push(1); a.skipPoints.push(2); a.plays.length = 0; a.taps.length = 0; window.__b.fogSeen.clear(); });
    // 실제 누르기(pointerdown)여야 소리 판이 열린다(첫 조작)
    await p.click('.boss .boss-remix-listen');
    ok(true, '낭송 듣기를 누른다');
    await p.waitForFunction((k) => {
      const d = JSON.parse(localStorage.getItem(k));
      const b = Object.values(d.slots)[0].progress.boss;
      return b.state === 'stage2' && b.stageWrong >= 1;
    }, SAVE_KEY, { timeout: 30000, polling: 50 });
    ok(true, '지점이 아닌 곳의 탭은 틀림으로 센다');
    await p.waitForFunction(() => document.querySelector('.boss')?.dataset.stage === 'stage3', null, { timeout: 90000, polling: 200 });
    const auto = await ev(p, () => ({ plays: window.__b.auto.plays, taps: window.__b.auto.taps, fog: [...window.__b.fogSeen] }));
    const { remix } = await import(pathToFileURL(path.join(ROOT, 'js/data/remix.js')).href);
    const grid = R.buildRemixGrid(remix, song);
    ok(auto.plays[0] === null, '처음에는 리믹스 전체를 낭송한다');
    ok(auto.plays.slice(1).some((s) => same(s, R.remixReplaySegments(grid, 2))), '놓친 지점(2)은 그 앞뒤 단위를 다시 들려준다');
    ok(auto.taps.includes('wrong') && auto.fog.includes('thick'), '틀린 탭에 먹안개가 짙어진다');
    ok((await bossRec(p)).unseen && JSON.stringify((await bossRec(p)).unseen) === before, '2단계 틀림은 낯선 노래 기록을 바꾸지 않는다');

    // ── 3단계 ──
    await ev(p, () => window.__b.session.audio.setSlashMode(true));
    await passIntro(p, 'stage3');
    await waitSel(p, '.boss .boss-swallowed');
    ok((await bossAttr(p, 'king')) === 'present', '좀 대왕이 나타난다');
    const sw = await ev(p, () => ({ song: document.querySelector('.boss .boss-swallowed')?.dataset.song, erased: document.querySelectorAll('.boss .boss-swallowed .is-erased').length }));
    ok(sw.song === 'taesan' && sw.erased > 0, '좀 대왕이 「태산이 높다 하되」를 지워진 글줄로 삼키고 있다');
    ok((await bossAttr(p, 'mentor')) !== 'free', '선대 사서는 아직 갇혀 있다');
    await layout(p, '3단계(3D 1366×768)');
    await measureCurrent(p, 'stairs');
    await ev(p, () => { window.__b.log.length = 0; window.__b.fogSeen.clear(); });
    await placeAt(p, 'saseol');
    ok((await bossAttr(p, 'fog')) === 'thick' && (await bossRec(p)).stageWrong === 1 && (await bossRec(p)).state === 'stage3', '3단계 틀린 자리 → 먹안개, 틀림 하나');
    ok((await logOf(p, 'diorama:slot-set')).length === 0, '틀린 자리에서는 선대 사서의 자리가 채워지지 않는다(음성 사례)');
    await placeAt(p, 'sijo');
    await p.waitForFunction(() => document.querySelector('.boss')?.dataset.mentor === 'free', null, { timeout: 15000, polling: 100 });
    ok((await bossAttr(p, 'king')) === 'scattered', '시조 자리에 꽂으면 좀 대왕이 흩어진다');
    const sets = await logOf(p, 'diorama:slot-set');
    ok(sets.some((d) => d.area === 'mentor' && d.index === 0 && d.songId === 'taesan'), "slot-set { area: 'mentor', index: 0, songId: 'taesan' }을 낸다");
    ok((await bossRec(p)).state === 'done', '엔진이 보스를 마친 것으로 기록한다');
    await layout(p, '보스를 마침(3D 1366×768)');
    ok(!SCORE_RE.test(await pageText(p)), '화면에 점수 말이 없다(마침)');
    await waitSel(p, '.boss .boss-finish');
    await click(p, '.boss .boss-finish');
    await p.waitForFunction(() => window.__b.goCalls.length > 0, null, { timeout: 5000 });
    const go = await ev(p, () => window.__b.goCalls[0]);
    ok(go.name === 'ending' && go.hasSession, '보스를 마치면 엔딩 화면으로 세션을 넘긴다');

    // ── 마지막 카드 자료 ──
    const prog = await saved(p);
    const rec = { id: RECORD_ID, name: '점검', appearance: 'a', progress: JSON.parse(JSON.stringify(prog)) };
    rec.progress.ending = { line: '한 줄', wing: 'sijo', conceptId: 'sijo-3jang', note: '', completed: true, completedAt: '2026-10-06T00:00:00.000Z' };
    const card = buildFinalCard(rec);
    const expect = {
      [ORDER[0]]: [false, false, true],
      [ORDER[1]]: [false, true, false],
      [ORDER[2]]: [true, false, true],
      [ORDER[3]]: [true, false, true],
      [ORDER[4]]: [true, false, true],
    };
    const cardMatches = (c) => c && c.boss.length === 5 && c.boss.every((x) => same([x.firstTryCorrect, x.journalHelp, x.singerGroupCorrect], expect[x.songId]));
    ok(cardMatches(card), '마지막 카드 자료에 낯선 노래 다섯 편의 세 기록이 담긴다 ' + JSON.stringify(card?.boss?.map((x) => [x.songId, x.firstTryCorrect, x.journalHelp, x.singerGroupCorrect])));
    ok(!SCORE_RE.test(JSON.stringify(card)), '마지막 카드 자료에 점수 말이 없다');
    const tampered = JSON.parse(JSON.stringify(rec));
    tampered.progress.boss.unseen[ORDER[1]].journalHelp = false;
    ok(!cardMatches(buildFinalCard(tampered)), '음성 사례: 카드 비교가 바뀐 기록을 잡는다');

    ok(g.errors.length === 0, '콘솔 오류 없음(3D 전체) ' + g.errors.join(' | '));
    ok(g.external.length === 0, '바깥 요청 없음(3D 전체) ' + g.external.join(' | '));
  } finally {
    await g.close();
  }
}

// ───────── 4. 2D 그림 판(844×390): 박자 없는 2단계, 2·3단계 도중 다시 열기 ─────────

async function checkNoBeat2D(base) {
  console.log('── 박자 없는 2단계와 3단계(2D, 844×390)');
  const g = await openGame(base, { path: PAGE, seed: seedBoss({ boss: { state: 'stage2', allUnseenDone: true }, slash: false, muted: true }), viewport: VIEWPORTS.phone, disable3d: true, touch: true });
  const p = g.page;
  try {
    await setup(p);
    ok((await bossAttr(p, 'mode')) === '2d', '3D가 없으면 2D 그림 판');
    const bg = await ev(p, () => getComputedStyle(document.querySelector('.boss .boss-board')).backgroundImage);
    ok(/board\/boss/.test(bg), '2D 그림 판은 board/boss 그림을 쓴다');
    await passIntro(p, 'stage2');
    await waitSel(p, '.boss .boss-remix');
    ok((await ev(p, () => document.querySelector('.boss .boss-remix').dataset.mode)) === 'line', '소리를 끄면 2단계는 글줄을 탭하는 방식');
    const { remix } = await import(pathToFileURL(path.join(ROOT, 'js/data/remix.js')).href);
    const grid = R.buildRemixGrid(remix, song);
    const rows = await ev(p, () => [...document.querySelectorAll('.boss .boss-remix-row')].map((r) => Number(r.dataset.seg)));
    ok(rows.length === grid.segments.length, '이어 붙은 글줄이 단위마다 한 줄씩 보인다(' + rows.length + ')');
    const rowText = await ev(p, () => document.querySelector('.boss .boss-remix-lines')?.textContent ?? '');
    ok(!/향가|고려가요|시조|가사|사설시조/.test(rowText), '글줄에 갈래 이름이 드러나지 않는다');
    await layout(p, '2단계 글줄(2D 844×390)');
    await ev(p, () => window.__b.fogSeen.clear());
    await click(p, '.boss .boss-remix-row[data-seg="0"]');
    await p.waitForTimeout(80);
    ok((await bossRec(p)).stageWrong === 1 && (await ev(p, () => [...window.__b.fogSeen])).includes('thick'), '바뀌는 줄이 아닌 줄을 탭하면 틀림(먹안개)');
    await click(p, `.boss .boss-remix-row[data-seg="${grid.switches[0]}"]`);
    await click(p, `.boss .boss-remix-row[data-seg="${grid.switches[1]}"]`);
    await p.waitForTimeout(80);
    ok((await ev(p, () => document.querySelectorAll('.boss .boss-remix-row.is-found').length)) === 2, '찾은 바뀌는 줄이 표시된다');
    // 2단계 도중에 나갔다 오면 2단계를 처음부터
    await reload(p);
    await passIntro(p, 'stage2');
    await waitSel(p, '.boss .boss-remix');
    ok((await bossRec(p)).state === 'stage2' && (await ev(p, () => document.querySelectorAll('.boss .boss-remix-row.is-found').length)) === 0, '2단계 도중에 다시 열면 2단계를 처음부터 한다(spec 20)');
    for (const s of grid.switches) await click(p, `.boss .boss-remix-row[data-seg="${s}"]`);
    await passIntro(p, 'stage3');
    ok((await bossRec(p)).state === 'stage3', '바뀌는 줄 넷을 다 찾으면 3단계');
    await waitSel(p, '.boss .boss-swallowed');
    await layout(p, '3단계(2D 844×390)');
    // 3단계 도중(재기 뒤, 꽂기 전)에 다시 열면 3단계를 처음부터
    await measureCurrent(p, 'stairs');
    await reload(p);
    await passIntro(p, 'stage3');
    await waitSel(p, '.boss .boss-swallowed');
    ok(await ev(p, () => [...document.querySelectorAll('.boss .boss-slot')].every((b) => b.disabled)), '3단계 도중에 다시 열면 다시 재기부터 한다');
    await measureCurrent(p, 'stairs');
    await ev(p, () => { window.__b.log.length = 0; });
    await placeAt(p, 'sijo');
    await p.waitForFunction(() => document.querySelector('.boss')?.dataset.mentor === 'free', null, { timeout: 15000, polling: 100 });
    // 풀려나는 연출(서서히 또렷해짐)이 끝나기를 기다린다
    await p.waitForFunction(() => { const e = document.querySelector('.boss .boss-board .boss-mentor'); return e && Number(getComputedStyle(e).opacity) > 0.9; }, null, { timeout: 6000, polling: 100 }).catch(() => {});
    const vis = await ev(p, () => {
      const v = (s) => { const e = document.querySelector(s); if (!e) return false; const st = getComputedStyle(e); return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.5; };
      return { mentor: v('.boss .boss-board .boss-mentor'), king: document.querySelector('.boss')?.dataset.king };
    });
    ok(vis.mentor && vis.king === 'scattered', '2D: 좀 대왕이 흩어지고 선대 사서 그림이 보인다');
    ok((await logOf(p, 'diorama:slot-set')).some((d) => d.area === 'mentor' && d.songId === 'taesan'), '2D에서도 선대 사서의 자리 사건을 낸다');
    await layout(p, '보스를 마침(2D 844×390)');
    ok(g.errors.length === 0, '콘솔 오류 없음(2D) ' + g.errors.join(' | '));
    ok(g.external.length === 0, '바깥 요청 없음(2D)');
  } finally {
    await g.close();
  }
}

// ───────── 5. 다른 화면 크기 배치 ─────────

async function checkLayouts(base) {
  console.log('── 화면 배치(3D 844×390, 2D 1366×768)');
  for (const o of [
    { label: '3D 844×390', viewport: VIEWPORTS.phone, disable3d: false, touch: true },
    { label: '2D 1366×768', viewport: VIEWPORTS.chromebook, disable3d: true },
  ]) {
    const g = await openGame(base, { path: PAGE, seed: seedBoss(), viewport: o.viewport, disable3d: o.disable3d, touch: o.touch });
    const p = g.page;
    try {
      await setup(p);
      await passIntro(p, 'stage1');
      await waitSel(p, '.boss .boss-song');
      await layout(p, '1단계 첫 화면(' + o.label + ')');
      await ev(p, () => document.querySelector('.boss .boss-journal-btn')?.click());
      await layout(p, '일지 열림(' + o.label + ')');
      await ev(p, () => document.querySelector('.boss .boss-journal-close')?.click());
      // 재기 화면(오른쪽 반)
      await click(p, '.boss .boss-measure');
      await waitSel(p, '.boss .measure.is-boss');
      await p.waitForTimeout(100);
      await layout(p, '재기 화면 접기(' + o.label + ')');
      const r = await ev(p, (t) => window.__solveBossMeasure(t), 'stairs');
      ok(r.done, '재기를 마친다(' + o.label + ')');
      await p.waitForFunction(() => [...document.querySelectorAll('.boss .boss-slot')].some((b) => !b.disabled), null, { timeout: 10000, polling: 100 });
      await placeAt(p, song(ORDER[0]).genre);
      await waitSel(p, '.boss .boss-singer');
      await layout(p, '누가 불렀을까(' + o.label + ')');
      await ev(p, () => document.documentElement.style.setProperty('--text-scale', '1.3'));
      await p.waitForTimeout(50);
      await layout(p, '누가 불렀을까, 글자 1.3(' + o.label + ')');
      ok(g.errors.length === 0, '콘솔 오류 없음(' + o.label + ') ' + g.errors.join(' | '));
    } finally {
      await g.close();
    }
  }
}

// ───────── 6. 앱 흐름의 보스 화면 약속: start(ctx) ─────────

async function checkStartContract(base) {
  console.log('── 앱 흐름 약속 start(ctx)(README 추가 제안(T18))');
  const viaPath = PAGE + '?via=start';
  // 닫힌 보스: 돌아가기 → 약속이 { completed: false }로 끝난다
  let g = await openGame(base, { path: viaPath, seed: seedBoss({ wings: 4 }), disable3d: true });
  try {
    await setup(g.page);
    ok(await ev(g.page, () => !!document.querySelector('.story-boss-host > .boss .boss-locked')), 'start(ctx): ctx.container 안에 보스 화면을 그린다');
    await click(g.page, '.boss .boss-leave');
    await g.page.waitForFunction(() => window.__b.via.result || window.__b.via.error, null, { timeout: 5000 });
    const r = await ev(g.page, () => ({ result: window.__b.via.result, left: !!document.querySelector('.boss') }));
    ok(r.result?.completed === false && r.result.reason === 'locked' && !r.left, 'start(ctx): 닫힌 보스에서 돌아가면 약속이 끝나고 화면을 치운다');
    ok(g.errors.length === 0, '콘솔 오류 없음(start 닫힘) ' + g.errors.join(' | '));
  } finally { await g.close(); }
  // 나가기: 약속이 { completed: false, reason: 'left' }로 끝나고 기록은 그대로
  g = await openGame(base, { path: viaPath, seed: seedBoss(), disable3d: true });
  try {
    await setup(g.page);
    await passIntro(g.page, 'stage1');
    ok(await ev(g.page, () => document.querySelector('.play')?.classList.contains('has-boss') && getComputedStyle(document.querySelector('.play-hud')).visibility === 'hidden'), 'start(ctx): 보스 동안 한 판 위 띠(수첩 단추)를 숨긴다');
    await click(g.page, '.boss .boss-top .boss-leave');
    await g.page.waitForFunction(() => window.__b.via.result || window.__b.via.error, null, { timeout: 5000 });
    const r = await ev(g.page, () => window.__b.via.result);
    ok(r?.completed === false && r.reason === 'left' && (await bossRec(g.page)).state === 'stage1', 'start(ctx): 나가기 → 약속이 끝나고 보스 기록은 그대로');
    ok(await ev(g.page, () => !document.querySelector('.play')?.classList.contains('has-boss')), 'start(ctx): 끝나면 위 띠를 되돌린다');
  } finally { await g.close(); }
  // 중단 신호: AbortError로 끝나고 화면을 치운다
  g = await openGame(base, { path: viaPath, seed: seedBoss(), disable3d: true });
  try {
    await setup(g.page);
    await ev(g.page, () => window.__b.via.ac.abort(new DOMException('닫음', 'AbortError')));
    await g.page.waitForFunction(() => window.__b.via.result || window.__b.via.error, null, { timeout: 5000 });
    const r = await ev(g.page, () => ({ error: window.__b.via.error, left: !!document.querySelector('.boss') }));
    ok(r.error === 'AbortError' && !r.left, 'start(ctx): 중단 신호를 따른다(AbortError, 화면 치움)');
    ok(g.errors.length === 0, '콘솔 오류 없음(start 중단) ' + g.errors.join(' | '));
  } finally { await g.close(); }
}

// ───────── 7. 음성 사례: 점검 도우미 ─────────

async function checkNegatives(base) {
  console.log('── 음성 사례(점검 도우미)');
  const g = await openGame(base, { path: PAGE, seed: seedBoss(), viewport: VIEWPORTS.chromebook, disable3d: true });
  const p = g.page;
  try {
    await setup(p);
    await passIntro(p, 'stage1');
    await waitSel(p, '.boss .boss-song');
    const caught = await ev(p, () => {
      const ui = document.querySelector('.boss .boss-ui');
      const tiny = document.createElement('button');
      tiny.textContent = 'x';
      tiny.style.cssText = 'position:absolute;left:10px;top:10px;width:20px;height:20px;min-width:0;min-height:0';
      const off = document.createElement('span');
      off.textContent = '밖';
      off.style.cssText = 'position:fixed;left:-200px;top:10px';
      ui.append(tiny, off);
      const probs = window.__bossLayout();
      tiny.remove();
      off.remove();
      return probs;
    });
    ok(caught.some((x) => x.startsWith('작은 버튼')) && caught.some((x) => x.startsWith('화면 밖')), '음성 사례: 배치 검사가 작은 버튼과 화면 밖 요소를 잡는다');
    const t = await ev(p, () => { const s = document.createElement('p'); s.textContent = '점수 10'; document.querySelector('.boss .boss-ui').append(s); const text = document.body.innerText; s.remove(); return text; });
    ok(SCORE_RE.test(t), '음성 사례: 점수 말 찾기가 실제 점수 말을 잡는다');
    ok(g.errors.length === 0, '콘솔 오류 없음(음성 사례) ' + g.errors.join(' | '));
  } finally {
    await g.close();
  }
}

// ───────── 실행 ─────────

const server = await startServer();
try {
  await checkData();
  const base = server.url;
  await checkGating(base);
  await checkFull3D(base);
  await checkNoBeat2D(base);
  await checkLayouts(base);
  await checkStartContract(base);
  await checkNegatives(base);
  const ext = server.requests.filter((r) => !r.startsWith('/'));
  ok(ext.length === 0, '서버 밖 요청 없음');
} catch (e) {
  failures++;
  console.error('✗ 점검 도중 오류: ' + (e?.stack ?? e));
} finally {
  await server.close();
}

if (failures) {
  console.error(`\n보스전 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log('\n보스전 점검 통과');
