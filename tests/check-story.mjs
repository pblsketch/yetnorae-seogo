// 입구·이야기·엔딩과 앱 흐름 점검(T18, spec 0·2·3.2·5.6·11·12·13·14·15·20).
// 제품 그대로(index.html)를 연다. 주된 길은 상태를 넣지 않고 실제 조작(누르기)으로만 간다.
// 상태 주입(로컬 저장소에 기록 넣기)은 점검 도구 안에서만, 특정 장면(보스 문, 엔딩, 서고 완성)을 볼 때만 쓴다.
//
// 확인하는 것
//  - 새 기록(모습 b) → 처음 켜는 기기의 이어폰 안내와 박자 맞추기(건너뛰기, 보정값 0) → 입구 이야기 → 미션 문장 그대로
//    → 튜토리얼(빗금 모드, 접기 → 두드리기 → 계단 순서의 안내) → 향가관 열림, 일지의 '선대 사서의 첫 노래'
//  - 이름 검사(빈 이름, 13자), 같은 이름 → 이어 할지 묻기, 지우기는 확인 한 번
//  - 설정이 저장되고 바로 적용된다(글자 크기, 움직임 줄이기, 소리 끄기, 빗금 모드), 다시 열어도 적용
//  - 다시 열면 시작 화면에서 그 기록을 골라 있던 자리로 이어 간다(입구를 다시 보지 않는다)
//  - 관에 처음 들어가면 들어가기 글(2D에서 실제로 문으로 걸어 들어간다)
//  - (상태 주입) 다섯 관을 마치면 보스 문이 생긴다. 마치기 전에는 없다. 일지 단서 다섯
//  - (상태 주입) 보스 도중의 기록을 다시 열면 회랑의 열린 보스 문 앞(보스로 곧장 가지 않음). 들어가면 하던 단계·노래부터, 나가면 문은 열린 채
//  - (상태 주입) 보스를 마치면 엔딩: 행렬 순서, 빈자리, 한 줄 1~40자, 한마디 0~60자, 고른 관 갈래의 먹 개념만 고를 수 있음,
//    꽂으면 서고 완성과 마지막 카드 내려받기(PNG), 시작 화면의 '서고 완성' 표시, 보스와 엔딩을 다시 할 수 없음, 카드는 다시 받음
//  - (상태 주입) 기록 화면에서 결과 카드 다시 받기: 마친 관마다 판 카드, 서고 완성이면 마지막 카드, 내려받을 때마다 지금의 기록으로
//    다시 그림(모습을 바꾸면 새 그림, 덤을 마친 기록이면 덤 줄이 바뀜), 마친 관이 없는 기록에는 단추 없음(음성 사례)
//  - 3D와 강제 2D, 1366×768과 844×390. 콘솔 오류·바깥 요청·점수 말 없음, 화면 넘침·48px 미만 단추 없음
// 음성 사례: 점검 도우미(미션 대조, 순서 대조, 점수 말 찾기, 배치 검사)가 실제 실패를 잡는지도 본다.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './lib/server.mjs';
import { openGame, VIEWPORTS } from './lib/browser.mjs';
import { defaultData, defaultProgress, SAVE_KEY } from '../js/core/save.js';
import { WING_TABLE, ROUTING, BOSS_TABLE } from '../js/data/song-table.js';
import { CONCEPTS, SINGER_GROUPS } from '../js/data/concepts.js';
import { PLAY_WING_IDS } from '../js/data/wings.js';

// spec 0절의 미션 문장(제품 데이터에서 가져오지 않고 명세에서 옮겨 적는다)
const MISSION_SPEC = '먹안개가 서고를 삼키기 전에, 흩어진 노래들을 제자리로 돌려보내 다시 불리게 하라.';
const SCORE_WORDS = /점수|등급|순위|랭킹|타이머|게임\s*오버|정답률|score|rank|grade/i;

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ───────── 점검 도우미(순수 함수) ─────────
const missionMatches = (text) => typeof text === 'string' && text.trim() === MISSION_SPEC;
const scoreWordsIn = (text) => (String(text).match(new RegExp(SCORE_WORDS.source, 'gi')) ?? []);
const PROCESSION_ORDER = SINGER_GROUPS.map((g) => g.id);
const orderMatches = (ids) => same(ids, PROCESSION_ORDER);

// ───────── 기록 만들기(점검 도구 전용 상태 주입) ─────────
function fixed(ids) { return ids.map((songId) => ({ songId, fixed: true })); }
function doneWing(w) {
  return {
    state: 'done', shelfBound: true, basketDone: true, roomDone: true, bonusDone: false, uniqueActionIntroSeen: true,
    doneAt: '2026-10-01T09:00:00.000Z',
    placements: { shelf: fixed(WING_TABLE[w].shelf), basket: WING_TABLE[w].stray.map((s) => ({ songId: s.songId, to: s.to, fixed: true })), bonus: [null, null, null] },
    wrongCount: 0, measured: [...WING_TABLE[w].shelf, ...WING_TABLE[w].stray.map((s) => s.songId)],
  };
}
const ROOM_RECORDS = {
  hyangga: { room: 'hyangga', interpretationId: 'both', interpretationText: '점검용 해석', isInterpretation: true },
  goryeo: { room: 'goryeo', lastConditionId: 'a', lastConditionText: '점검용 조건' },
  sijo: { room: 'sijo', rooms: ['na', 'dal', 'cheongpung'], outside: ['gangsan'], interpretationId: 'as-written', interpretationText: '점검용 해석', isInterpretation: true },
  gasa: { room: 'gasa', words: ['점검'] },
  saseol: { room: 'saseol', predictionId: 'nim', predictionText: '점검용 예측' },
};

// bossState: 보스를 마치지 않은 기록의 보스 단계(기본 'stage1'), unseenDone: 1단계에서 이미 마친 낯선 노래 수(차례대로)
function seedAllDone({ name = '점검', bossDone = false, pencilConcept = null, appearance = 'a', bossState = 'stage1', unseenDone = 0 } = {}) {
  const data = defaultData();
  data.device.calibrated = true;
  data.device.slashMode = true;
  const p = defaultProgress();
  p.tutorialDone = true;
  for (const w of PLAY_WING_IDS) {
    p.wings[w] = doneWing(w);
    p.rooms[w] = ROOM_RECORDS[w];
    p.keepsakes.push(...WING_TABLE[w].shelf);
  }
  p.prewaiting = JSON.parse(JSON.stringify(ROUTING.prewait));
  p.returned = JSON.parse(JSON.stringify(ROUTING.returned));
  for (const c of CONCEPTS) {
    const g = c.genre;
    p.concepts[c.id] = c.id === pencilConcept ? { state: 'pencil', songs: ['taesan'] } : { state: 'ink', songs: WING_TABLE[g].shelf.slice(0, 2) };
  }
  p.boss.state = bossDone ? 'done' : bossState;
  const doneCount = bossDone || bossState !== 'stage1' ? BOSS_TABLE.unseenOrder.length : unseenDone;
  for (const g of BOSS_TABLE.unseenOrder.slice(0, doneCount)) {
    const id = BOSS_TABLE.unseen[g];
    p.boss.unseen[id] = { done: true, firstTryCorrect: g !== 'gasa', journalHelp: g === 'gasa', singerGroupCorrect: g !== 'saseol' };
  }
  const id = 's-story';
  data.slots[id] = { id, name, appearance, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', progress: p };
  data.lastSlotId = id;
  return { [SAVE_KEY]: JSON.stringify(data) };
}

// 기록 화면의 결과 카드 다시 받기용 기록 셋(점검 도구 전용 상태 주입).
//  s-cards '덤기록': 향가관·고려가요관을 마침(고려가요관 덤은 bonus 값), 시조관 진행 중, 서고 미완성
//  s-fresh '새기록': 튜토리얼만 마침(마친 관이 없다 → 카드 단추 없음)
//  s-all '완성기록': 다섯 관·보스·엔딩을 마침(판 카드 다섯과 마지막 카드)
function seedCards({ bonus = false, textScale = 1 } = {}) {
  const data = defaultData();
  data.device.calibrated = true;
  data.device.textScale = textScale;
  const at = '2026-10-02T09:00:00.000Z';
  const rec = (id, name, p, updatedAt) => ({ id, name, appearance: 'a', createdAt: at, updatedAt, progress: p });

  const p1 = defaultProgress();
  p1.tutorialDone = true;
  for (const w of ['hyangga', 'goryeo']) {
    p1.wings[w] = doneWing(w);
    p1.rooms[w] = ROOM_RECORDS[w];
  }
  if (bonus) {
    p1.wings.goryeo.bonusDone = true;
    p1.wings.goryeo.placements.bonus = fixed(WING_TABLE.goryeo.bonus);
  }
  const p2 = defaultProgress();
  p2.tutorialDone = true;
  const all = JSON.parse(seedAllDone({ name: '완성기록', bossDone: true })[SAVE_KEY]).slots['s-story'].progress;
  all.ending = { line: '서고에 내 노래 한 줄', wing: 'sijo', conceptId: 'sijo-3jang', note: '', completed: true, completedAt: '2026-10-03T09:00:00.000Z' };
  data.slots['s-cards'] = rec('s-cards', '덤기록', p1, '2026-10-03T09:00:00.000Z');
  data.slots['s-fresh'] = rec('s-fresh', '새기록', p2, '2026-10-02T09:00:00.000Z');
  data.slots['s-all'] = rec('s-all', '완성기록', all, '2026-10-01T09:00:00.000Z');
  data.lastSlotId = 's-fresh';
  return { [SAVE_KEY]: JSON.stringify(data) };
}

// ───────── 페이지 안 도우미(문자열로 넘어간다) ─────────

// 재기 화면을 끝까지(빗금 모드): 안내 → 접기 → 빗금 → 계단 → 감정서 받기. 본 안내의 종류를 차례로 남긴다.
async function solveMeasure() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rewind = async () => { for (let k = 0; k < 200; k++) { const p = document.querySelector('.measure .m-prev'); if (!p || p.disabled) return; p.click(); await sleep(2); } };
  const intros = [];
  let last = null;
  let tapMode = null;
  for (let i = 0; i < 6000; i++) {
    const root = document.querySelector('.measure');
    if (!root) return { done: true, intros, tapMode };
    const intro = root.querySelector('.m-intro');
    if (intro) { intros.push(intro.dataset.intro); intro.querySelector('.m-intro-ok').click(); await sleep(30); continue; }
    const step = root.dataset.step;
    if (step !== last) { last = step; await rewind(); }
    if (step === 'fold') {
      const gap = [...root.querySelectorAll('.m-text button.m-gap:not(.is-folded)')].find((g) => g.dataset.u !== g.dataset.nu);
      if (gap) { gap.click(); await sleep(2); continue; }
      const next = root.querySelector('.m-next');
      if (next && !next.disabled) { next.click(); await sleep(2); continue; }
      root.querySelector('button.m-fold-none')?.click();
    } else if (step === 'tap') {
      tapMode = root.dataset.tapMode ?? tapMode;
      if (root.dataset.tapMode === 'slash') {
        const groups = new Map();
        for (const w of root.querySelectorAll('.m-text button.m-word')) {
          const k = w.dataset.u + '|' + w.dataset.l + '|' + w.dataset.f;
          if (!groups.has(k) || Number(w.dataset.w) > Number(groups.get(k).dataset.w)) groups.set(k, w);
        }
        const target = [...groups.values()].find((w) => !w.classList.contains('has-slash'));
        if (target) { target.click(); await sleep(2); continue; }
        const next = root.querySelector('.m-next');
        if (next && !next.disabled) { next.click(); await sleep(2); continue; }
      }
    } else if (step === 'action') {
      const box = root.querySelector('.m-action');
      const l = box?.querySelector('button.m-letter:not(.is-done)');
      if (l) { l.click(); await sleep(2); continue; }
      const none = box?.querySelector('button.m-none');
      if (none) { none.click(); await sleep(30); continue; }
    } else if (step === 'sheet') {
      root.querySelector('.m-finish')?.click();
      await sleep(30);
      continue;
    }
    await sleep(20);
  }
  return { done: false, intros, step: document.querySelector('.measure')?.dataset.step };
}

// 화면 배치 문제(이야기 화면): 문서 넘침, 화면 밖 요소, 48px보다 작은 단추. 스크롤 상자 안은 넘침을 보지 않는다.
function storyLayout(scope) {
  const out = [];
  const visible = (e) => {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('[hidden]');
  };
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1) out.push('문서 넘침');
  const roots = [...document.querySelectorAll(scope)];
  if (!roots.length) return ['화면 없음: ' + scope];
  for (const root of roots) {
    for (const e of root.querySelectorAll('*')) {
      if (!visible(e) || e.closest('.story-scroll') || e.closest('.card-view-frame')) continue;
      const r = e.getBoundingClientRect();
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push('화면 밖: ' + e.className + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
    }
    for (const b of root.querySelectorAll('button, input[type="range"], input[type="checkbox"]')) {
      if (!visible(b)) continue;
      const target = b.matches('input[type="checkbox"]') ? (b.closest('label') ?? b) : b;
      const r = target.getBoundingClientRect();
      if (r.width < 47.5 || r.height < 47.5) out.push('작은 누를 것: ' + (b.textContent || b.getAttribute('aria-label') || b.className).trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    for (const s of root.querySelectorAll('.story-scroll')) {
      if (!visible(s)) continue;
      const r = s.getBoundingClientRect();
      if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1) out.push('스크롤 상자가 화면 밖: ' + s.className);
    }
  }
  return out.slice(0, 10);
}

// ───────── 도우미 ─────────
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const waitSel = (page, sel, timeout = 15000) => page.waitForFunction((s) => !!document.querySelector(s), sel, { timeout, polling: 100 });
const waitGone = (page, sel, timeout = 15000) => page.waitForFunction((s) => !document.querySelector(s), sel, { timeout, polling: 100 });
const click = (page, sel) => ev(page, (s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
const text = (page, sel) => ev(page, (s) => document.querySelector(s)?.textContent ?? null, sel);
const saved = (page) => ev(page, (k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE_KEY);
const record = async (page) => { const d = await saved(page); return d?.slots?.[d.lastSlotId] ?? null; };
const place = (page) => ev(page, () => document.querySelector('.play')?.dataset.place ?? null);
const layout = async (page, scope) => { await page.evaluate(`window.__storyLayout = ${storyLayout.toString()}`); return ev(page, (s) => window.__storyLayout(s), scope); };
const bodyScoreWords = (page) => ev(page, (src) => (document.body.innerText.match(new RegExp(src, 'gi')) ?? []), SCORE_WORDS.source);

async function setValue(page, sel, value) {
  const loc = page.locator(sel);
  await loc.fill(value);
}

async function waitStart(page) {
  await waitSel(page, '.story-start', 20000);
}

async function createRecord(page, name, appearance) {
  await setValue(page, '.story-name-input', name);
  if (appearance) await click(page, `.story-look[data-appearance="${appearance}"]`);
  await click(page, '.story-create');
}

async function skipFirstRun(page, label) {
  await waitSel(page, '.story-firstrun[data-step="earphone"]');
  const t1 = await text(page, '.story-firstrun');
  ok(t1.includes('이어폰'), label + ': 처음 켜는 기기에 이어폰 안내');
  await click(page, '.story-firstrun .story-next');
  await waitSel(page, '.story-firstrun[data-step="calibrate"]');
  const t2 = await text(page, '.story-firstrun');
  ok(t2.includes('여덟') && !!(await ev(page, () => document.querySelector('.story-cal-start'))), label + ': 박자 맞추기(종 여덟 번) 단계');
  await click(page, '.story-cal-skip');
  await waitGone(page, '.story-firstrun');
  const d = await saved(page);
  ok(d.device.calibrated === true && d.device.calibrationOffsetMs === 0, label + ': 건너뛰면 보정값 0으로 저장하고 다시 묻지 않는다');
}

// 입구 이야기 → 미션 → 튜토리얼 → 회랑. 돌려주는 값: { mission, intros, lines }
async function playEntrance(page, label) {
  await waitSel(page, '.story-entrance');
  const lines = [];
  for (let i = 0; i < 30 && !(await ev(page, () => !!document.querySelector('.story-tutorial-start'))); i++) {
    lines.push(await text(page, '.story-entrance .story-card'));
    if (!(await click(page, '.story-entrance .story-next'))) break;
    await page.waitForTimeout(50);
  }
  const mission = await text(page, '.story-entrance .story-mission');
  ok(missionMatches(mission), label + ': 미션 문장이 spec 0절과 한 글자도 다르지 않다 ' + JSON.stringify(mission));
  ok(lines.some((l) => l?.includes('편지')) && lines.some((l) => l?.includes('목소리')), label + ': 선대 사서의 편지와 안개 속 목소리');
  const ly = await layout(page, '.story-entrance');
  ok(ly.length === 0, label + ': 입구 화면 배치 문제 없음 ' + JSON.stringify(ly));
  await click(page, '.story-tutorial-start');
  await waitSel(page, '.world.is-split .measure', 15000);
  const hidden = await ev(page, () => { const e = document.querySelector('.story-entrance'); return !e || e.hidden || getComputedStyle(e).display === 'none'; });
  ok(hidden, label + ': 재는 동안 입구 이야기 겹은 비킨다');
  const r = await ev(page, () => window.__solve());
  ok(r.done, label + ': 튜토리얼 재기를 마친다 ' + JSON.stringify(r));
  ok(r.tapMode === 'slash', label + ': 빗금 모드로 잰다');
  ok(same(r.intros, ['fold', 'tap', 'unique']), label + ': 접기 → 두드리기 → 계단 순서로 하나씩 안내 ' + JSON.stringify(r.intros));
  await waitSel(page, '.story-entrance[data-step="done"]');
  const doneText = await text(page, '.story-entrance');
  ok(doneText.includes('선대 사서의 첫 노래') && doneText.includes('향가관'), label + ': 첫 노래가 일지에 담기고 향가관이 열린다는 글');
  const rec = await record(page);
  ok(rec.progress.tutorialDone === true && rec.progress.wings.hyangga.state === 'open' && rec.progress.wings.goryeo.state === 'locked', label + ': 튜토리얼을 마치면 향가관만 열린다');
  ok(rec.progress.concepts['sijo-3jang'].songs.includes('taesan'), label + ': 첫 노래가 개념을 확인해 준다');
  ok(Object.values(rec.progress.wings).every((w) => [...w.placements.shelf, ...w.placements.bonus].every((s) => !s || s.songId !== 'taesan')), label + ': 첫 노래는 어느 칸도 차지하지 않는다');
  await click(page, '.story-to-corridor');
  await waitGone(page, '.story-entrance');
  await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'corridor', null, { timeout: 10000, polling: 100 });
  return { mission, intros: r.intros };
}

async function openSettingsAndCheck(page, label, openSel) {
  await click(page, openSel);
  await waitSel(page, '.story-settings');
  const ly = await layout(page, '.story-settings');
  ok(ly.length === 0, label + ': 설정 화면 배치 문제 없음 ' + JSON.stringify(ly));
  const items = await ev(page, () => ({
    volumes: [...document.querySelectorAll('.story-settings input[type="range"]')].map((e) => e.dataset.setting),
    checks: [...document.querySelectorAll('.story-settings input[type="checkbox"]')].map((e) => e.dataset.setting),
    scales: [...document.querySelectorAll('.story-settings [data-scale]')].map((e) => Number(e.dataset.scale)),
    recal: !!document.querySelector('.story-settings .story-recalibrate'),
  }));
  ok(same(items.volumes, ['bgm', 'voice', 'sfx']) && same(items.checks.sort(), ['muted', 'reduceMotion', 'slashMode']) && same(items.scales, [1, 1.15, 1.3]) && items.recal,
    label + ': 설정 항목이 모두 있다(배경음·낭송·효과음, 소리 끄기, 빗금, 글자 크기 3단계, 움직임 줄이기, 박자 다시 맞추기) ' + JSON.stringify(items));
}

// 게임 중: 설정을 열고 그 안의 단추(기록 목록으로, 마지막 카드)를 누른다
async function menu(page, sel) {
  await click(page, '.story-hud-settings');
  await waitSel(page, '.story-settings');
  if (!(await click(page, '.story-settings ' + sel))) throw new Error('설정에 단추가 없음: ' + sel);
  await waitGone(page, '.story-settings');
}

async function closeSettings(page) {
  await click(page, '.story-settings .story-settings-close');
  await waitGone(page, '.story-settings');
}

// ───────── 실행 ─────────
const server = await startServer();
const sessions = [];
try {
  // ══════════ 음성 사례: 점검 도우미가 실패를 잡는가 ══════════
  console.log('— 음성 사례: 점검 도우미');
  ok(missionMatches(MISSION_SPEC) && !missionMatches(MISSION_SPEC.replace('흩어진', '흩어졌던')) && !missionMatches(MISSION_SPEC.slice(0, -1)), '미션 대조가 한 글자 차이도 잡는다');
  ok(orderMatches(PROCESSION_ORDER) && !orderMatches([...PROCESSION_ORDER].reverse()) && !orderMatches(PROCESSION_ORDER.slice(1)), '행렬 순서 대조가 뒤바뀐 순서와 빠진 무리를 잡는다');
  ok(scoreWordsIn('오늘의 점수는 90점').length === 1 && scoreWordsIn('서고 완성').length === 0, '점수 말 찾기가 점수 말을 잡고 보통 글은 넘긴다');

  // ══════════ 제품 코드 정적 점검 ══════════
  console.log('— 제품 코드: 점검 입구·주소 인자·점수 말 없음');
  {
    const files = [path.join(ROOT, 'js/data/story.js'), ...fs.readdirSync(path.join(ROOT, 'js/story')).map((f) => path.join(ROOT, 'js/story', f))];
    const bad = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      if (/location\.(search|hash)|URLSearchParams|__test|window\.__/.test(src)) bad.push('입구: ' + path.basename(f));
      const words = scoreWordsIn(src.replace(/^\s*\/\/.*$/gm, ''));
      if (words.length) bad.push('점수 말: ' + path.basename(f) + ' ' + words.join(','));
    }
    ok(bad.length === 0, '이야기·앱 코드에 점검 입구, 주소 인자, 점수 말이 없다 ' + JSON.stringify(bad));
    const story = await import('../js/data/story.js');
    ok(story.MISSION === MISSION_SPEC, '이야기 데이터의 미션 문장이 spec 0절 그대로다');
  }

  // ══════════ 처음부터: 3D, 1366×768 ══════════
  console.log('— 처음부터(3D, 1366×768): 시작 화면 → 처음 켜는 기기 → 입구 → 튜토리얼');
  {
    const game = await openGame(server.url, { viewport: VIEWPORTS.chromebook });
    sessions.push(game);
    const { page } = game;
    await waitStart(page);
    await page.evaluate(`window.__solve = ${solveMeasure.toString()}`);
    const t = await ev(page, () => ({ title: document.querySelector('.story-title')?.textContent, none: !!document.querySelector('.story-records-none') }));
    ok(t.title === '옛 노래 서고' && t.none, '시작 화면: 제목과 빈 기록 목록 ' + JSON.stringify(t));
    let ly = await layout(page, '.story-start');
    ok(ly.length === 0, '시작 화면 배치 문제 없음 ' + JSON.stringify(ly));
    const credits = await ev(page, async () => !!(await import('/js/registry.js')).registry.screens.credits);
    ok((await ev(page, () => !!document.querySelector('.story-open-credits'))) === credits, '출처 화면 문은 출처 화면이 등록됐을 때만 보인다');

    // 이름 검사(음성 사례)
    await createRecord(page, '   ');
    ok((await text(page, '.story-msg'))?.includes('한 글자') && !(await saved(page))?.slots?.length && Object.keys((await saved(page))?.slots ?? {}).length === 0, '빈 이름은 만들지 않고 알린다');
    await createRecord(page, '가나다라마바사아자차카타파');
    ok((await text(page, '.story-msg'))?.includes('12자') && Object.keys((await saved(page))?.slots ?? {}).length === 0, '13자 이름은 만들지 않고 알린다');

    // 설정: 빗금 모드를 켠다(시작 화면에서)
    await openSettingsAndCheck(page, '시작 화면', '.story-open-settings');
    await page.locator('.story-settings input[data-setting="slashMode"]').check();
    ok((await saved(page))?.device?.slashMode === true, '시작 화면 설정: 빗금 모드가 저장된다');
    await closeSettings(page);

    // 새 기록(모습 b)
    await createRecord(page, '  하늘  ', 'b');
    await skipFirstRun(page, '3D');
    const rec = await record(page);
    ok(rec?.name === '하늘' && rec?.appearance === 'b', '새 기록: 앞뒤 공백을 뺀 이름, 고른 모습 b ' + JSON.stringify({ name: rec?.name, appearance: rec?.appearance }));
    await playEntrance(page, '3D');

    // 일지: 선대 사서의 첫 노래, 단서 없음
    await click(page, '.play-btn[data-open="journal"]');
    await waitSel(page, '.play-panel[data-panel="journal"]');
    const j = await ev(page, () => ({ first: document.querySelector('.play-journal-first')?.textContent ?? '', clues: document.querySelectorAll('.play-clue').length }));
    ok(j.first.includes('선대 사서의 첫 노래') && j.first.includes('태산이 높다 하되') && j.clues === 0, '일지: 선대 사서의 첫 노래, 아직 단서 없음 ' + JSON.stringify(j));
    await click(page, '.play-panel .play-panel-close');
    ok(!(await ev(page, () => !!document.querySelector('.story-boss-door'))), '음성 사례: 다섯 관을 마치기 전에는 보스 문이 없다');

    // 게임 중 설정: 글자 크기, 움직임 줄이기, 소리 끄기
    await openSettingsAndCheck(page, '게임 중', '.story-hud-settings');
    await click(page, '.story-settings [data-scale="1.3"]');
    await page.locator('.story-settings input[data-setting="reduceMotion"]').check();
    await page.locator('.story-settings input[data-setting="muted"]').check();
    await ev(page, () => { const r = document.querySelector('.story-settings input[data-setting="bgm"]'); r.value = '0.25'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
    const applied = await ev(page, () => ({
      scale: getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim(),
      reduce: document.getElementById('app').classList.contains('reduce-motion'),
      pressed: document.querySelector('.story-settings [data-scale="1.3"]').getAttribute('aria-pressed'),
    }));
    ok(applied.scale === '1.3' && applied.reduce && applied.pressed === 'true', '설정이 바로 적용된다(글자 크기 1.3, 움직임 줄이기) ' + JSON.stringify(applied));
    const dev = (await saved(page)).device;
    ok(dev.textScale === 1.3 && dev.reduceMotion === true && dev.muted === true && dev.volume.bgm === 0.25 && dev.slashMode === true, '설정이 저장된다 ' + JSON.stringify(dev));
    ly = await layout(page, '.story-settings');
    ok(ly.length === 0, '글자 크기 1.3에서도 설정 화면 배치 문제 없음 ' + JSON.stringify(ly));
    await click(page, '.story-settings .story-recalibrate');
    await waitSel(page, '.story-firstrun[data-step="calibrate"]');
    await click(page, '.story-cal-skip');
    await waitGone(page, '.story-firstrun');
    ok((await saved(page)).device.calibrationOffsetMs === 0, '박자 다시 맞추기를 열고 건너뛸 수 있다');
    await closeSettings(page);

    // 다시 열기: 시작 화면 → 그 기록 → 있던 자리(회랑), 설정은 그대로 적용
    await page.reload();
    await waitStart(page);
    const re = await ev(page, () => ({
      names: [...document.querySelectorAll('.story-record')].map((r) => r.querySelector('.story-record-name')?.textContent),
      look: document.querySelector('.story-record .story-record-thumb')?.dataset.appearance,
      badge: !!document.querySelector('.story-record .story-badge'),
      scale: getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim(),
      reduce: document.getElementById('app').classList.contains('reduce-motion'),
    }));
    ok(same(re.names, ['하늘']) && re.look === 'b' && !re.badge, '다시 열면 기록 목록에 이름과 모습, 아직 서고 완성 표시는 없다 ' + JSON.stringify(re));
    ok(re.scale === '1.3' && re.reduce, '다시 열어도 글자 크기와 움직임 줄이기가 적용된다 ' + JSON.stringify(re));
    ly = await layout(page, '.story-start');
    ok(ly.length === 0, '글자 크기 1.3 시작 화면 배치 문제 없음 ' + JSON.stringify(ly));
    await click(page, '.story-record .story-record-open');
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'hyangga', null, { timeout: 15000, polling: 100 });
    ok(!(await ev(page, () => !!document.querySelector('.story-entrance, .story-firstrun'))), '이어 하면 입구와 박자 맞추기를 다시 보지 않고, 판 중인 관(향가관)으로 이어 간다');

    // 같은 이름 → 이어 할지 묻기
    await menu(page, '.story-go-home');
    await waitStart(page);
    await createRecord(page, ' 하늘', 'a');
    await waitSel(page, '.story-confirm[data-kind="continue"]');
    ok((await text(page, '.story-confirm'))?.includes('하늘'), '같은 이름(앞뒤 공백 무시)이면 그 기록을 이어 할지 묻는다');
    await click(page, '.story-confirm .story-confirm-no');
    await waitGone(page, '.story-confirm');
    ok(Object.keys((await saved(page)).slots).length === 1 && (await record(page)).appearance === 'b', '음성 사례: 묻고 나서 거절하면 새 기록을 만들지 않고 모습도 그대로');
    await createRecord(page, '하늘');
    await waitSel(page, '.story-confirm[data-kind="continue"]');
    await click(page, '.story-confirm .story-confirm-yes');
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'hyangga', null, { timeout: 15000, polling: 100 });
    ok(Object.keys((await saved(page)).slots).length === 1, '이어 하기를 고르면 그 기록으로 들어간다');

    // 모습 바꾸기(기록 목록에서), 지우기 확인 한 번
    await menu(page, '.story-go-home');
    await waitStart(page);
    await click(page, '.story-record .story-record-look');
    await page.waitForFunction(() => document.querySelector('.story-record .story-record-thumb')?.dataset.appearance === 'a', null, { timeout: 5000, polling: 100 });
    ok((await record(page)).appearance === 'a', '기록 목록에서 모습을 바꾸면 저장된다');
    await click(page, '.story-record .story-record-delete');
    await waitSel(page, '.story-confirm[data-kind="delete"]');
    await click(page, '.story-confirm .story-confirm-no');
    await waitGone(page, '.story-confirm');
    ok(Object.keys((await saved(page)).slots).length === 1, '음성 사례: 지우기 확인에서 그대로 두면 지우지 않는다');
    await click(page, '.story-record .story-record-delete');
    await waitSel(page, '.story-confirm[data-kind="delete"]');
    ok((await layout(page, '.story-confirm')).length === 0, '확인 상자 배치 문제 없음');
    await click(page, '.story-confirm .story-confirm-yes');
    await waitSel(page, '.story-records-none');
    ok(Object.keys((await saved(page)).slots).length === 0, '확인하면 기록이 지워진다');

    ok((await bodyScoreWords(page)).length === 0, '점수 말이 화면에 없다');
    ok(game.errors.length === 0, '3D 처음부터: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    ok(game.external.length === 0, '3D 처음부터: 바깥 요청 없음 ' + game.external.slice(0, 3).join(' '));
    await game.close();
    sessions.pop();
  }

  // ══════════ 처음부터: 강제 2D, 844×390 ══════════
  console.log('— 처음부터(강제 2D, 844×390): 입구 → 튜토리얼 → 향가관 문으로 걸어 들어가기');
  {
    const game = await openGame(server.url, { viewport: VIEWPORTS.phone, disable3d: true, touch: true });
    sessions.push(game);
    const { page } = game;
    await waitStart(page);
    await page.evaluate(`window.__solve = ${solveMeasure.toString()}`);
    let ly = await layout(page, '.story-start');
    ok(ly.length === 0, '2D 휴대폰: 시작 화면 배치 문제 없음 ' + JSON.stringify(ly));
    await openSettingsAndCheck(page, '2D 휴대폰', '.story-open-settings');
    await page.locator('.story-settings input[data-setting="slashMode"]').check();
    await closeSettings(page);
    await createRecord(page, '바다', 'b');
    await waitSel(page, '.story-firstrun');
    ly = await layout(page, '.story-firstrun');
    ok(ly.length === 0, '2D 휴대폰: 이어폰 안내 배치 문제 없음 ' + JSON.stringify(ly));
    await skipFirstRun(page, '2D');
    await playEntrance(page, '2D');
    ok((await ev(page, () => document.querySelector('.world')?.dataset.mode)) === '2d', '2D 그림 판으로 진행한다');
    ok((await ev(page, () => document.querySelector('.board-door[data-wing="hyangga"]')?.dataset.state)) === 'open', '2D: 향가관 문이 열려 있다');
    ok((await ev(page, () => document.querySelector('.board-door[data-wing="goryeo"]')?.dataset.state)) === 'locked', '음성 사례: 고려가요관 문은 잠겨 있다');

    // 입구 문으로 가면 편지를 다시 읽을 수 있다(튜토리얼은 다시 하지 않는다)
    await click(page, '.board-door[data-wing="entrance"]');
    await page.waitForFunction(() => { const b = document.querySelector('.world-context'); return b && !b.hidden && b.textContent.includes('편지'); }, null, { timeout: 15000, polling: 100 });
    await click(page, '.world-context');
    await waitSel(page, '.story-entrance[data-step="letter"]');
    for (let i = 0; i < 5 && !(await ev(page, () => !!document.querySelector('.story-entrance .story-close'))); i++) await click(page, '.story-entrance .story-next');
    ok(missionMatches(await text(page, '.story-entrance .story-mission')) && !(await ev(page, () => !!document.querySelector('.story-tutorial-start'))), '입구 문: 편지와 미션을 다시 읽고, 튜토리얼은 다시 하지 않는다');
    await click(page, '.story-entrance .story-close');
    await waitGone(page, '.story-entrance');

    // 향가관 문으로 걸어가 들어간다 → 들어가기 글
    await click(page, '.board-door[data-wing="hyangga"]');
    await page.waitForFunction(() => { const b = document.querySelector('.world-context'); return b && !b.hidden && b.textContent.includes('향가관'); }, null, { timeout: 15000, polling: 100 });
    await click(page, '.world-context');
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'hyangga', null, { timeout: 15000, polling: 100 });
    await waitSel(page, '.story-wing-intro[data-wing="hyangga"]');
    ok((await text(page, '.story-wing-intro'))?.includes('향가관'), '관에 처음 들어가면 짧은 들어가기 글');
    ly = await layout(page, '.story-wing-intro');
    ok(ly.length === 0, '들어가기 글 배치 문제 없음 ' + JSON.stringify(ly));
    await click(page, '.story-wing-intro .story-wing-intro-close');
    await waitGone(page, '.story-wing-intro');
    ly = await layout(page, '.play-hud');
    ok(ly.length === 0, '2D 휴대폰: 관 안의 위 띠(설정 단추 포함) 배치 문제 없음 ' + JSON.stringify(ly));
    await click(page, '.story-hud-settings');
    await waitSel(page, '.story-settings');
    await click(page, '.story-settings [data-scale="1.3"]');
    await closeSettings(page);
    ly = await layout(page, '.play-hud');
    ok(ly.length === 0, '2D 휴대폰: 글자 크기 1.3에서도 관 안의 위 띠 배치 문제 없음 ' + JSON.stringify(ly));
    ok((await bodyScoreWords(page)).length === 0, '2D: 점수 말이 화면에 없다');
    ok(game.errors.length === 0, '2D 처음부터: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    ok(game.external.length === 0, '2D 처음부터: 바깥 요청 없음');
    await game.close();
    sessions.pop();
  }

  // ══════════ 저장할 수 없는 환경 ══════════
  console.log('— 저장할 수 없는 환경: 알리고 이번 창에서 이어 간다');
  {
    const game = await openGame(server.url, { viewport: VIEWPORTS.chromebook, disable3d: true });
    sessions.push(game);
    const { page, context } = game;
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('막힘(점검)', 'SecurityError'); } });
    });
    await page.reload();
    await waitStart(page);
    ok((await text(page, '.story-start'))?.includes('이 기기에 저장되지 않아요. 이번 창에서만 이어집니다'), '시작 화면에서 저장되지 않는다고 알린다');
    await createRecord(page, '구름');
    await waitSel(page, '.story-firstrun');
    await click(page, '.story-firstrun .story-next');
    await click(page, '.story-cal-skip');
    await waitSel(page, '.story-entrance');
    ok(true, '저장 없이도 새 기록으로 입구까지 간다');
    ok(game.errors.length === 0, '저장 불가: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
  }

  // ══════════ (상태 주입) 다섯 관을 마침 → 보스 문 ══════════
  for (const v of [{ label: '3D 1366', viewport: VIEWPORTS.chromebook, disable3d: false }, { label: '2D 844', viewport: VIEWPORTS.phone, disable3d: true }]) {
    console.log('— 다섯 관을 마친 기록(' + v.label + '): 보스 문');
    const game = await openGame(server.url, { viewport: v.viewport, disable3d: v.disable3d, seed: seedAllDone() });
    sessions.push(game);
    const { page } = game;
    await waitStart(page);
    await click(page, '.story-record .story-record-open');
    await waitSel(page, '.story-boss-door');
    ok((await ev(page, () => document.querySelector('.story-boss-door')?.dataset.state)) === 'open', v.label + ': 다섯 관을 모두 마치면 보스 문이 열려 있다');
    const ly = await layout(page, '.play-hud, .story-boss-door');
    ok(ly.length === 0, v.label + ': 보스 문과 위 띠 배치 문제 없음 ' + JSON.stringify(ly));
    await click(page, '.play-btn[data-open="journal"]');
    await waitSel(page, '.play-panel[data-panel="journal"]');
    const clues = await ev(page, () => [...document.querySelectorAll('.play-clue')].map((e) => e.textContent));
    ok(clues.length === 5 && clues[4].includes('첫 노래'), v.label + ': 관마다 단서 하나씩, 선대 사서가 갇힌 까닭으로 이어진다 ' + clues.length);
    await click(page, '.play-panel .play-panel-close');
    const hasBoss = await ev(page, async () => !!(await import('/js/registry.js')).registry.screens.boss);
    await click(page, '.story-boss-door');
    if (hasBoss) {
      await waitSel(page, '.story-boss-host');
      ok(true, v.label + ': 보스 문을 열면 보스 화면이 열린다');
    } else {
      await waitSel(page, '.story-toast');
      ok((await text(page, '.story-toast'))?.length > 0 && (await place(page)) === 'corridor', v.label + ': 보스 화면이 아직 없으면 알리고 회랑에 머문다');
    }
    ok(game.errors.length === 0, v.label + ' 보스 문: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
  }

  // ══════════ (상태 주입) 보스 도중의 기록 → 회랑의 열린 보스 문 → 들어가면 그 단계부터 ══════════
  // 다시 열면 보스로 곧장 가지 않고 회랑에서 열린 보스 문을 보인다. 문으로 들어가면 마친 단계와 1단계 노래 기록은 그대로, 하던 노래부터.
  // 도중에 나가면 회랑으로 돌아오고 문은 열린 채 남는다.
  for (const v of [
    { label: '3D 1366 1단계 셋째 노래', viewport: VIEWPORTS.chromebook, disable3d: false, bossState: 'stage1', unseenDone: 2 },
    { label: '2D 844 2단계', viewport: VIEWPORTS.phone, disable3d: true, bossState: 'stage2', unseenDone: 0 },
  ]) {
    console.log('— 보스 도중의 기록(' + v.label + '): 회랑의 열린 문으로 이어 간다');
    const game = await openGame(server.url, { viewport: v.viewport, disable3d: v.disable3d, seed: seedAllDone({ bossState: v.bossState, unseenDone: v.unseenDone }) });
    sessions.push(game);
    const { page } = game;
    await waitStart(page);
    await click(page, '.story-record .story-record-open');
    await waitSel(page, '.story-boss-door');
    let s = await ev(page, () => ({ place: document.querySelector('.play')?.dataset.place, door: document.querySelector('.story-boss-door')?.dataset.state, boss: !!document.querySelector('.story-boss-host, .boss'), hasBoss: !!document.querySelector('.play.has-boss') }));
    ok(s.place === 'corridor' && s.door === 'open' && !s.boss && !s.hasBoss, v.label + ': 다시 열면 회랑에 서고 보스 문이 열려 있다(보스로 곧장 가지 않는다) ' + JSON.stringify(s));
    await click(page, '.story-boss-door');
    await waitSel(page, '.story-boss-host .boss');
    await page.waitForFunction((st) => document.querySelector('.boss')?.dataset.stage === st, v.bossState, { timeout: 20000, polling: 100 });
    ok(true, v.label + ': 문으로 들어가면 보스가 ' + v.bossState + '부터 이어진다');
    if (v.bossState === 'stage1') {
      if (await ev(page, () => !!document.querySelector('.boss .boss-go'))) await click(page, '.boss .boss-go');
      await waitSel(page, '.boss .boss-song[data-song]');
      const want = BOSS_TABLE.unseen[BOSS_TABLE.unseenOrder[v.unseenDone]];
      const got = await ev(page, () => document.querySelector('.boss .boss-song')?.dataset.song);
      ok(got === want, v.label + ': 마친 노래는 건너뛰고 하던 노래부터 한다 ' + JSON.stringify({ got, want }));
    }
    await click(page, '.boss .boss-leave');
    await waitGone(page, '.story-boss-host');
    await waitSel(page, '.story-boss-door');
    s = await ev(page, () => ({ place: document.querySelector('.play')?.dataset.place, door: document.querySelector('.story-boss-door')?.dataset.state, hasBoss: !!document.querySelector('.play.has-boss') }));
    ok(s.place === 'corridor' && s.door === 'open' && !s.hasBoss, v.label + ': 도중에 나가면 회랑으로 돌아오고 보스 문은 열린 채다 ' + JSON.stringify(s));
    const rec = await record(page);
    const doneIds = Object.entries(rec.progress.boss.unseen).filter(([, u]) => u.done).map(([id]) => id).sort();
    const wantDone = BOSS_TABLE.unseenOrder.slice(0, v.bossState === 'stage1' ? v.unseenDone : BOSS_TABLE.unseenOrder.length).map((g) => BOSS_TABLE.unseen[g]).sort();
    ok(rec.progress.boss.state === v.bossState && same(doneIds, wantDone), v.label + ': 나가도 보스 단계와 마친 노래 기록은 그대로 ' + JSON.stringify({ state: rec.progress.boss.state, doneIds }));
    ok(game.errors.length === 0, v.label + ': 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
  }

  // ══════════ (상태 주입) 보스를 마침 → 엔딩 ══════════
  for (const v of [{ label: '2D 1366', viewport: VIEWPORTS.chromebook, disable3d: true }, { label: '3D 844', viewport: VIEWPORTS.phone, disable3d: false }]) {
    console.log('— 보스를 마친 기록(' + v.label + '): 엔딩');
    const game = await openGame(server.url, { viewport: v.viewport, disable3d: v.disable3d, seed: seedAllDone({ name: '별빛', bossDone: true, pencilConcept: 'sijo-final3' }) });
    sessions.push(game);
    const { page } = game;
    await waitStart(page);
    await click(page, '.story-record .story-record-open');
    await waitSel(page, '.story-ending[data-step="return"]');
    const ret = await text(page, '.story-ending');
    ok(ret.includes('선대 사서') && !!(await ev(page, () => document.querySelector('.story-ending .story-mentor'))), v.label + ': 선대 사서가 돌아온다');
    let ly = await layout(page, '.story-ending');
    ok(ly.length === 0, v.label + ': 엔딩(돌아옴) 배치 문제 없음 ' + JSON.stringify(ly));
    await click(page, '.story-ending .story-next');
    await waitSel(page, '.story-ending[data-step="procession"]');
    const proc = await ev(page, () => ({
      groups: [...document.querySelectorAll('.story-procession > *')].map((e) => e.dataset.group ?? (e.classList.contains('story-empty-spot') ? 'empty' : '?')),
      names: [...document.querySelectorAll('.story-group .story-group-name')].map((e) => e.textContent),
      sprites: [...document.querySelectorAll('.story-group')].map((g) => g.querySelectorAll('img.story-singer').length),
    }));
    ok(orderMatches(proc.groups.slice(0, 5)) && proc.groups[5] === 'empty' && proc.groups.length === 6, v.label + ': 가객 행렬이 spec 2절 순서로 지나가고 끝에 빈자리 하나 ' + JSON.stringify(proc.groups));
    ok(same(proc.names, SINGER_GROUPS.map((g) => g.name)) && proc.sprites.every((n) => n >= 1), v.label + ': 무리 이름과 가객 종이 인형 ' + JSON.stringify(proc));
    ly = await layout(page, '.story-ending');
    ok(ly.length === 0, v.label + ': 행렬 배치 문제 없음 ' + JSON.stringify(ly));
    await click(page, '.story-ending .story-next');
    await waitSel(page, '.story-ending[data-step="write"]');
    ly = await layout(page, '.story-ending');
    ok(ly.length === 0, v.label + ': 한 줄 짓기 배치 문제 없음 ' + JSON.stringify(ly));

    const state = () => ev(page, () => ({
      disabled: document.querySelector('.story-shelve')?.disabled,
      concepts: [...document.querySelectorAll('.story-concept-choice [data-concept]')].map((b) => ({ id: b.dataset.concept, disabled: b.disabled })),
      msg: document.querySelector('.story-ending .story-msg')?.textContent ?? '',
    }));
    let s = await state();
    ok(s.disabled === true && s.concepts.length === 0, v.label + ': 아무것도 안 고르면 꽂을 수 없고, 관을 고르기 전에는 근거가 없다');
    await setValue(page, '.story-line-input', '가'.repeat(41));
    await click(page, '.story-wing-choice [data-wing="sijo"]');
    s = await state();
    ok(s.disabled === true && s.msg.includes('40'), v.label + ': 한 줄 41자는 꽂을 수 없다(음성 사례) ' + JSON.stringify(s.msg));
    const enabledSijo = s.concepts.filter((c) => !c.disabled).map((c) => c.id).sort();
    ok(same(enabledSijo, ['sijo-3jang', 'sijo-4beat']) && !s.concepts.some((c) => !c.disabled && c.id === 'sijo-final3'), v.label + ': 시조관을 고르면 시조의 먹 개념만 근거로 고를 수 있다(연필 개념은 못 고른다) ' + JSON.stringify(s.concepts));
    await setValue(page, '.story-line-input', '   ');
    await click(page, '.story-concept-choice [data-concept="sijo-4beat"]');
    s = await state();
    ok(s.disabled === true, v.label + ': 공백만 있는 한 줄은 꽂을 수 없다(음성 사례)');
    await setValue(page, '.story-line-input', '가'.repeat(40));
    s = await state();
    ok(s.disabled === false, v.label + ': 40자 한 줄, 관, 먹 개념이 있으면 꽂을 수 있다');
    await click(page, '.story-wing-choice [data-wing="gasa"]');
    s = await state();
    ok(same(s.concepts.filter((c) => !c.disabled).map((c) => c.id).sort(), ['gasa-4beat', 'gasa-nolimit']) && s.disabled === true, v.label + ': 관을 바꾸면 그 관의 먹 개념으로 바뀌고 고른 근거는 비워진다 ' + JSON.stringify(s));
    await click(page, '.story-concept-choice [data-concept="gasa-nolimit"]');
    await setValue(page, '.story-note-input', '나'.repeat(61));
    s = await state();
    ok(s.disabled === true && s.msg.includes('60'), v.label + ': 한마디 61자는 꽂을 수 없다(음성 사례)');
    await setValue(page, '.story-note-input', '');
    s = await state();
    ok(s.disabled === false, v.label + ': 한마디는 쓰지 않아도 된다(0자)');
    await setValue(page, '.story-note-input', '나'.repeat(60));
    await setValue(page, '.story-line-input', '바람 부는 서고에 내 노래 한 줄');
    ok((await state()).disabled === false, v.label + ': 한마디 60자까지 된다');
    await click(page, '.story-shelve');
    await waitSel(page, '.story-ending[data-step="complete"] .card-view-download', 20000);
    const done = await text(page, '.story-ending');
    ok(done.includes('서고 완성'), v.label + ': 꽂으면 서고 완성');
    const rec = await record(page);
    ok(rec.progress.ending.completed === true && rec.progress.ending.line === '바람 부는 서고에 내 노래 한 줄' && rec.progress.ending.wing === 'gasa' && rec.progress.ending.conceptId === 'gasa-nolimit' && rec.progress.ending.note === '나'.repeat(60),
      v.label + ': 엔딩 선택이 기록된다 ' + JSON.stringify(rec.progress.ending));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), click(page, '.story-ending .card-view-download')]);
    const file = await dl.path();
    const head = fs.readFileSync(file).subarray(0, 8);
    ok(dl.suggestedFilename() === '옛노래서고_별빛_마지막.png' && head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), v.label + ': 마지막 카드를 PNG로 내려받는다 ' + dl.suggestedFilename());
    ok((await bodyScoreWords(page)).length === 0, v.label + ': 엔딩에 점수 말이 없다');
    const reduceCheck = await ev(page, () => ({ hasClass: document.getElementById('app').classList.contains('reduce-motion') }));
    ok(reduceCheck.hasClass === false, v.label + ': (기본) 움직임 줄이기 꺼짐');

    // 서고로 돌아가기 → 완성된 서고, 보스·엔딩은 다시 할 수 없음, 카드는 다시
    await click(page, '.story-ending .story-to-library');
    await waitGone(page, '.story-ending');
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'corridor', null, { timeout: 15000, polling: 100 });
    const door = await ev(page, () => { const d = document.querySelector('.story-boss-door'); return d ? { state: d.dataset.state, disabled: d.disabled } : null; });
    ok(!door || (door.state === 'done' && door.disabled), v.label + ': 서고 완성 뒤 보스 문은 다시 열리지 않는다 ' + JSON.stringify(door));
    ok((await ev(page, () => { document.querySelector('.story-hud-settings').click(); return !!document.querySelector('.story-settings .story-open-final'); })), v.label + ': 서고 완성 뒤 설정에 마지막 카드 단추');
    await closeSettings(page);
    await menu(page, '.story-open-final');
    await waitSel(page, '.story-final-card .card-view-download', 20000);
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), click(page, '.story-final-card .card-view-download')]);
    ok(dl2.suggestedFilename() === '옛노래서고_별빛_마지막.png', v.label + ': 서고 완성 뒤에도 마지막 카드를 다시 내려받는다');
    await click(page, '.story-final-card .card-view-close');
    await waitGone(page, '.story-final-card');

    await page.reload();
    await waitStart(page);
    const badge = await ev(page, () => document.querySelector('.story-record .story-badge')?.textContent ?? null);
    ok(badge === '서고 완성', v.label + ": 시작 화면 그 이름 옆에 '서고 완성'");
    await click(page, '.story-record .story-record-open');
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'corridor', null, { timeout: 15000, polling: 100 });
    await page.waitForTimeout(400);
    ok(!(await ev(page, () => !!document.querySelector('.story-ending'))), v.label + ': 서고 완성 뒤 다시 열어도 엔딩을 다시 하지 않는다');
    const after = await record(page);
    ok(same(after.progress.ending, rec.progress.ending), v.label + ': 엔딩 선택은 바뀌지 않는다');
    ok(game.errors.length === 0, v.label + ' 엔딩: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    ok(game.external.length === 0, v.label + ' 엔딩: 바깥 요청 없음');
    await game.close();
    sessions.pop();
  }

  // ══════════ (상태 주입) 기록 화면에서 결과 카드 다시 받기(spec 12·13) ══════════
  // 판 카드는 마친 관마다, 마지막 카드는 서고를 완성한 기록에만. 내려받을 때마다 지금의 기록으로 다시 그린다.
  {
    const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const cardLabel = (page) => ev(page, () => document.querySelector('.story-record-card .card-view-canvas')?.getAttribute('aria-label') ?? '');
    const picks = (page) => ev(page, () => [...document.querySelectorAll('.story-cards .story-card-pick')].map((b) => (b.dataset.card === 'final' ? 'final' : b.dataset.wing)));
    async function downloadFrom(page) {
      await waitSel(page, '.story-record-card .card-view-download', 20000);
      await page.waitForFunction(() => (document.querySelector('.story-record-card .card-view-canvas')?.getAttribute('aria-label') ?? '').length > 0, null, { timeout: 20000, polling: 100 });
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), click(page, '.story-record-card .card-view-download')]);
      const buf = fs.readFileSync(await dl.path());
      return { name: dl.suggestedFilename(), buf, png: buf.subarray(0, 8).equals(PNG_HEAD), label: await cardLabel(page) };
    }
    const openPicker = async (page, id) => {
      if (!(await click(page, `.story-record[data-id="${id}"] .story-record-cards`))) throw new Error('결과 카드 단추 없음: ' + id);
      await waitSel(page, '.story-cards');
    };
    const closePicker = async (page) => { await click(page, '.story-cards .story-cards-close'); await waitGone(page, '.story-cards-shade'); };
    const closeCard = async (page) => { await click(page, '.story-record-card .card-view-close'); await waitGone(page, '.story-record-card'); };

    console.log('— 기록 화면의 결과 카드(844×390, 글자 크기 1.3)');
    let game = await openGame(server.url, { viewport: VIEWPORTS.phone, disable3d: true, seed: seedCards({ bonus: false, textScale: 1.3 }) });
    sessions.push(game);
    let page = game.page;
    await waitStart(page);
    const btns = await ev(page, () => Object.fromEntries([...document.querySelectorAll('.story-record')].map((li) => [li.dataset.id, !!li.querySelector('.story-record-cards')])));
    ok(btns['s-cards'] === true && btns['s-all'] === true, '마친 관이 있는 기록에는 결과 카드 단추가 있다 ' + JSON.stringify(btns));
    ok(btns['s-fresh'] === false, '음성 사례: 마친 관이 없는 기록에는 결과 카드 단추가 없다');
    let ly = await layout(page, '.story-start');
    ok(ly.length === 0, '결과 카드 단추가 있는 기록 목록 배치 문제 없음(844×390, 1.3) ' + JSON.stringify(ly));

    await openPicker(page, 's-cards');
    let pk = await picks(page);
    ok(same(pk, ['hyangga', 'goryeo']), "마친 관마다 '판 카드' 단추(마치지 않은 시조관은 없음) " + JSON.stringify(pk));
    ok(!pk.includes('final'), "음성 사례: 서고를 완성하지 않은 기록에는 '마지막 카드' 단추가 없다");
    const pickText = await ev(page, () => [...document.querySelectorAll('.story-cards .story-card-pick')].map((b) => b.textContent));
    ok(same(pickText, ['향가관 판 카드', '고려가요관 판 카드']), '단추 글: 관 이름 + 판 카드 ' + JSON.stringify(pickText));
    ly = await layout(page, '.story-cards-shade');
    ok(ly.length === 0, '카드 고르기 상자 배치 문제 없음(844×390, 1.3) ' + JSON.stringify(ly));

    await click(page, '.story-cards .story-card-pick[data-wing="goryeo"]');
    const first = await downloadFrom(page);
    ok(first.png && first.name === '옛노래서고_덤기록_고려가요관.png', '기록 화면에서 고려가요관 판 카드를 PNG로 내려받는다 ' + first.name);
    ok(first.label.includes('덤 칸은 아직 비어 있다') && first.label.includes('덤기록'), '판 카드: 넣은 기록 그대로(덤 아직) ' + first.label.slice(0, 80));
    ly = await layout(page, '.story-record-card');
    ok(ly.length === 0, '기록 화면의 카드 화면 배치 문제 없음 ' + JSON.stringify(ly));
    await closeCard(page);
    ok(await ev(page, () => !!document.querySelector('.story-cards')), '카드를 닫으면 카드 고르기 상자로 돌아온다');
    await closePicker(page);

    // 지금의 기록으로 다시 그린다: 기록 화면에서 모습을 바꾸고 다시 내려받으면 그림이 바뀐다(실제 조작, 상태 주입 없음)
    await click(page, '.story-record[data-id="s-cards"] .story-record-look');
    await page.waitForFunction(() => document.querySelector('.story-record[data-id="s-cards"] .story-record-thumb')?.dataset.appearance === 'b', null, { timeout: 5000, polling: 100 });
    await openPicker(page, 's-cards');
    await click(page, '.story-cards .story-card-pick[data-wing="goryeo"]');
    const again = await downloadFrom(page);
    ok(again.png && again.name === first.name && !again.buf.equals(first.buf), '모습을 바꾼 뒤 다시 내려받으면 지금의 기록으로 새로 그린 PNG다');
    await closeCard(page);
    await closePicker(page);

    await openPicker(page, 's-all');
    pk = await picks(page);
    ok(same(pk, [...PLAY_WING_IDS, 'final']), "서고를 완성한 기록: 판 카드 다섯과 '마지막 카드' " + JSON.stringify(pk));
    ly = await layout(page, '.story-cards-shade');
    ok(ly.length === 0, '단추 여섯의 카드 고르기 상자 배치 문제 없음(844×390, 1.3) ' + JSON.stringify(ly));
    await click(page, '.story-cards .story-card-pick[data-card="final"]');
    const fin = await downloadFrom(page);
    ok(fin.png && fin.name === '옛노래서고_완성기록_마지막.png' && fin.label.includes('서고에 내 노래 한 줄'), '기록 화면에서 마지막 카드를 PNG로 내려받는다 ' + fin.name);
    await closeCard(page);
    await closePicker(page);
    ok((await bodyScoreWords(page)).length === 0, '기록 화면에 점수 말이 없다');
    ok(game.errors.length === 0, '기록 화면 카드: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    ok(game.external.length === 0, '기록 화면 카드: 바깥 요청 없음');
    await game.close();
    sessions.pop();

    // 덤을 마친 기록을 넣으면 같은 판 카드의 덤 줄이 바뀐다(카드 그림을 저장하지 않고 기록으로 그린다)
    console.log('— 기록 화면의 결과 카드: 덤을 마친 기록');
    game = await openGame(server.url, { viewport: VIEWPORTS.phone, disable3d: true, seed: seedCards({ bonus: true }) });
    sessions.push(game);
    page = game.page;
    await waitStart(page);
    await openPicker(page, 's-cards');
    await click(page, '.story-cards .story-card-pick[data-wing="goryeo"]');
    const bonus = await downloadFrom(page);
    ok(bonus.png && bonus.name === first.name, '덤을 마친 기록에서도 같은 이름의 PNG ' + bonus.name);
    ok(bonus.label.includes('덤 칸도 채웠다') && !bonus.label.includes('덤 칸은 아직'), "판 카드의 '덤'이 지금의 기록을 따라 바뀐다 " + bonus.label.slice(0, 80));
    ok(!bonus.buf.equals(first.buf), '덤 전과 다른 그림이다');
    await closeCard(page);
    await click(page, '.story-cards .story-card-pick[data-wing="hyangga"]');
    const hy = await downloadFrom(page);
    ok(hy.label.includes('덤 칸은 아직 비어 있다'), '음성 사례: 덤을 하지 않은 향가관 판 카드는 그대로 아직이다');
    ly = await layout(page, '.story-record-card');
    ok(ly.length === 0, '카드 화면 배치 문제 없음(844×390, 1) ' + JSON.stringify(ly));
    ok(game.errors.length === 0, '덤 기록 카드: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
  }

  // ══════════ 움직임 줄이기: 행렬이 움직이지 않는다 ══════════
  console.log('— 움직임 줄이기: 엔딩 행렬');
  {
    const seed = JSON.parse(seedAllDone({ bossDone: true })[SAVE_KEY]);
    seed.device.reduceMotion = true;
    const game = await openGame(server.url, { viewport: VIEWPORTS.chromebook, disable3d: true, seed: { [SAVE_KEY]: JSON.stringify(seed) } });
    sessions.push(game);
    const { page } = game;
    await waitStart(page);
    await click(page, '.story-record .story-record-open');
    await waitSel(page, '.story-ending[data-step="return"]');
    await click(page, '.story-ending .story-next');
    await waitSel(page, '.story-ending[data-step="procession"]');
    const anim = await ev(page, () => [...document.querySelectorAll('.story-group')].map((g) => { const s = getComputedStyle(g); return { name: s.animationName, dur: parseFloat(s.animationDuration) }; }));
    ok(anim.every((a) => a.name === 'none' || a.dur < 0.01), '움직임 줄이기면 행렬이 움직이지 않는다 ' + JSON.stringify(anim[0]));
    ok(game.errors.length === 0, '움직임 줄이기: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
  }
} catch (e) {
  failures++;
  console.error('✗ 점검 도중 오류: ' + (e?.stack ?? e));
} finally {
  for (const g of sessions) await g.close().catch(() => {});
  await server.close();
}

if (failures) {
  console.error('\n실패 ' + failures + '건');
  process.exitCode = 1;
} else {
  console.log('\n이야기·앱 흐름 점검 통과');
}
