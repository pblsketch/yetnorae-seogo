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
//  - 모습 고르기: 새 이름(옛 '모습 하나·둘'이 아님), 라디오 묶음(누르기·화살표 키, aria-checked), 고른 표시(체크와 글),
//    3D면 게임 속 3D 인물 미리보기(비어 있지 않음, 고른 칸만 돌고 고르지 않은 칸은 멈춤, 움직임 줄이기면 돌지 않음),
//    강제 2D면 승인된 그림. 기록 목록의 작은 그림(3D 정지 그림 / 2D 그림), '모습 바꾸기' 상자(그대로 두기는 바꾸지 않음)
//  - 전체 화면: 시작 화면·위 띠·설정의 단추(이름표, 48px), 누르면 전체 화면(document.fullscreenElement), 이름이 바뀜,
//    exitFullscreen으로 나가도 이름이 따라옴, 전체 화면 중 창 크기가 바뀌면 3D 그림판·2D 그림 판이 따라 커짐,
//    전체 화면을 쓸 수 없는 브라우저(fullscreenEnabled = false)에서는 단추가 아예 없음(음성 사례)
// 음성 사례: 점검 도우미(미션 대조, 순서 대조, 점수 말 찾기, 배치 검사)가 실제 실패를 잡는지도 본다.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './lib/server.mjs';
import { openGame, VIEWPORTS } from './lib/browser.mjs';
import { defaultData, defaultProgress, SAVE_KEY } from '../js/core/save.js';
import { WING_TABLE, ROUTING, BOSS_TABLE } from '../js/data/song-table.js';
import { CONCEPTS, SINGER_GROUPS } from '../js/data/concepts.js';
import { PLAY_WING_IDS } from '../js/data/wings.js';
import { STORY } from '../js/data/story.js';

const LOOK_NAMES = { a: STORY.start.looks.a.name, b: STORY.start.looks.b.name };
const LOOK_LINES = { a: STORY.start.looks.a.line, b: STORY.start.looks.b.line };
const OLD_LOOK_LABELS = ['모습 하나', '모습 둘'];
const FS = STORY.fullscreen;

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
  let sheet = null;
  for (let i = 0; i < 6000; i++) {
    const root = document.querySelector('.measure');
    if (!root) return { done: true, intros, tapMode, sheet };
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
      sheet = [...root.querySelectorAll('.m-sheet-line')].map((e) => e.textContent);
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

// ───────── 모습 고르기 ─────────
// 캔버스 그림의 지문: 칠해진 픽셀 수와 간단한 해시(같은 그림인지 비교)
function canvasPrint(sel) {
  const c = document.querySelector(sel);
  if (!c || !c.width || !c.height) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  let h = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 10) n++;
    h = (h * 31 + d[i - 3] + d[i - 2] * 7 + d[i - 1] * 13 + d[i]) >>> 0;
  }
  return { n, h, total: c.width * c.height };
}
const print = (page, sel) => ev(page, canvasPrint, sel);
const canvasDrawn = (p) => !!p && p.n > p.total * 0.03;

const pickerState = (page, scope) => ev(page, (sc) => {
  const g = document.querySelector(sc + ' .story-looks');
  if (!g) return null;
  return {
    role: g.getAttribute('role'),
    render: g.dataset.render,
    cards: [...g.querySelectorAll('.story-look')].map((c) => {
      const r = c.getBoundingClientRect();
      const img = c.querySelector('img.story-look-img');
      const mark = c.querySelector('.story-look-mark');
      return {
        k: c.dataset.appearance, role: c.getAttribute('role'), checked: c.getAttribute('aria-checked'), tab: c.tabIndex,
        name: c.querySelector('.story-look-name')?.textContent ?? '', line: c.querySelector('.story-look-line')?.textContent ?? '',
        mark: mark && getComputedStyle(mark).display !== 'none' ? mark.textContent.trim() : '',
        canvas: !!c.querySelector('canvas.story-look-canvas'), img: img?.getAttribute('src') ?? null, imgLoaded: (img?.naturalWidth ?? 0) > 0,
        w: Math.round(r.width), h: Math.round(r.height),
      };
    }),
    focused: document.activeElement?.dataset?.appearance ?? null,
  };
}, scope);

// 새 기록의 모습 고르기를 살핀다. mode: '3d' | '2d'
async function checkPicker(page, label, mode) {
  const scope = '.story-start-new';
  if (mode === '3d') await page.waitForFunction(() => [...document.querySelectorAll('.story-start-new .story-look-canvas')].every((c) => c.dataset.painted === 'true'), null, { timeout: 15000, polling: 100 });
  let s = await pickerState(page, scope);
  ok(same(s.cards.map((c) => c.name), [LOOK_NAMES.a, LOOK_NAMES.b]) && same(s.cards.map((c) => c.line), [LOOK_LINES.a, LOOK_LINES.b]), label + ': 모습마다 새 이름과 한 줄 소개 ' + JSON.stringify(s.cards.map((c) => c.name)));
  const body = await ev(page, () => document.body.innerText);
  ok(!OLD_LOOK_LABELS.some((w) => body.includes(w)), label + ": 음성 사례: 옛 이름 '모습 하나·둘'은 화면에 없다");
  ok(s.role === 'radiogroup' && s.cards.every((c) => c.role === 'radio') && same(s.cards.map((c) => c.checked), ['true', 'false']) && same(s.cards.map((c) => c.tab), [0, -1]),
    label + ': 라디오 묶음으로 알린다(처음은 녹청 저고리, 고른 카드에만 Tab이 멈춤) ' + JSON.stringify(s.cards.map((c) => [c.role, c.checked, c.tab])));
  ok(s.cards[0].mark.includes('고른 모습') && s.cards[1].mark === '', label + ": 고른 카드에만 체크와 '고른 모습' 글(색만으로 알리지 않음)");
  ok(s.cards.every((c) => c.w >= 120 && c.h >= 48), label + ': 카드 하나가 통째로 큰 누를 자리 ' + JSON.stringify(s.cards.map((c) => [c.w, c.h])));
  if (mode === '3d') {
    ok(s.render === '3d' && s.cards.every((c) => c.canvas && !c.img), label + ': 3D 기기에서는 3D 미리보기 캔버스(그림 대신)');
    const a0 = await print(page, scope + ' .story-look[data-appearance="a"] canvas');
    const b0 = await print(page, scope + ' .story-look[data-appearance="b"] canvas');
    ok(canvasDrawn(a0) && canvasDrawn(b0), label + ': 3D 미리보기가 비어 있지 않다 ' + JSON.stringify([a0?.n, b0?.n, a0?.total]));
    await page.waitForTimeout(700);
    const a1 = await print(page, scope + ' .story-look[data-appearance="a"] canvas');
    const b1 = await print(page, scope + ' .story-look[data-appearance="b"] canvas');
    ok(a1.h !== a0.h, label + ': 고른 카드의 인물은 천천히 돈다(그림이 바뀐다)');
    ok(b1.h === b0.h, label + ': 고르지 않은 카드는 멈춰 있다');
  } else {
    ok(s.render === '2d' && s.cards.every((c) => !c.canvas && c.img && c.imgLoaded) && s.cards.every((c) => c.img.includes('sprite/student-' + c.k)),
      label + ': 2D 기기에서는 승인된 그림을 같은 이름으로 ' + JSON.stringify(s.cards.map((c) => [c.img?.slice(-30), c.imgLoaded])));
  }
  // 키보드: 고른 카드에서 화살표로 옮기면 고름도 따라간다
  await page.locator(scope + ' .story-look[aria-checked="true"]').focus();
  await page.keyboard.press('ArrowRight');
  s = await pickerState(page, scope);
  ok(same(s.cards.map((c) => c.checked), ['false', 'true']) && s.focused === 'b' && same(s.cards.map((c) => c.tab), [-1, 0]), label + ': 오른쪽 화살표로 흰 두루마기를 고른다(초점도 옮김)');
  await page.keyboard.press('ArrowLeft');
  s = await pickerState(page, scope);
  ok(same(s.cards.map((c) => c.checked), ['true', 'false']) && s.focused === 'a', label + ': 왼쪽 화살표로 되돌린다');
  await page.keyboard.press('Space');
  s = await pickerState(page, scope);
  ok(same(s.cards.map((c) => c.checked), ['true', 'false']), label + ': 음성 사례: 고른 카드를 다시 눌러도 고름이 풀리지 않는다');
  await page.locator(scope + ' .story-look[data-appearance="b"]').click();
  s = await pickerState(page, scope);
  ok(same(s.cards.map((c) => c.checked), ['false', 'true']) && s.cards[1].mark.includes('고른 모습'), label + ': 누르면 그 카드를 고른다');
  if (mode === '3d') {
    await page.waitForTimeout(300);
    const a2 = await print(page, scope + ' .story-look[data-appearance="a"] canvas');
    await page.waitForTimeout(500);
    const a3 = await print(page, scope + ' .story-look[data-appearance="a"] canvas');
    ok(canvasDrawn(a2) && a2.h === a3.h, label + ': 고름이 풀린 카드는 3/4 자세로 멈춘다');
  }
  await page.locator(scope + ' .story-look[data-appearance="a"]').click();
}

// 기록 목록의 작은 그림
const thumbState = (page) => ev(page, () => [...document.querySelectorAll('.story-record .story-record-thumb')].map((i) => {
  const src = i.getAttribute('src') ?? '';
  return { k: i.dataset.appearance, render: i.dataset.render, src: src.startsWith('data:') ? src.slice(0, 22) : src.replace(/^.*\/assets\//, 'assets/'), loaded: i.naturalWidth > 0, alt: i.alt };
}));

// '모습 바꾸기' 상자: to를 고르고 apply면 바꾸기, 아니면 그대로 두기
async function changeLook(page, sel, to, apply = true) {
  await page.locator(sel + ' .story-record-look').click();
  await waitSel(page, '.story-look-change');
  await page.locator(`.story-look-change .story-look[data-appearance="${to}"]`).click();
  await page.locator('.story-look-change ' + (apply ? '.story-look-apply' : '.story-look-cancel')).click();
  await waitGone(page, '.story-look-change');
}

// ───────── 전체 화면 ─────────
const fsState = (page, sel) => ev(page, (s) => {
  const b = document.querySelector(s);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { label: b.getAttribute('aria-label'), text: b.textContent.trim(), state: b.dataset.fullscreen, w: r.width, h: r.height, icon: b.querySelector('path')?.getAttribute('d') ?? '', fs: !!document.fullscreenElement, root: document.fullscreenElement === document.documentElement };
}, sel);
const waitFs = (page, on) => page.waitForFunction((v) => !!document.fullscreenElement === v, on, { timeout: 10000, polling: 50 });

// 단추를 눌러 전체 화면에 들어간다. 이름과 그림이 따라 바뀌는지 본다. visibleText: 단추에 이름 글이 보이는 화면인지
async function enterFullscreenAndCheck(page, label, sel, { visibleText = true } = {}) {
  const s0 = await fsState(page, sel);
  ok(!!s0 && s0.label === FS.on && s0.state === 'off' && (!visibleText || s0.text === FS.on), label + ': 전체 화면 단추에 이름이 있다 ' + JSON.stringify(s0 && { label: s0.label, text: s0.text }));
  ok(!!s0 && s0.w >= 47.5 && s0.h >= 47.5, label + ': 전체 화면 단추가 48px 이상 ' + JSON.stringify(s0 && [Math.round(s0.w), Math.round(s0.h)]));
  await page.locator(sel).click();
  await waitFs(page, true);
  await page.waitForFunction((a) => document.querySelector(a.sel)?.dataset.fullscreen === 'on', { sel }, { timeout: 5000, polling: 50 }).catch(() => {});
  const s1 = await fsState(page, sel);
  ok(s1.fs && s1.root, label + ': 누르면 전체 화면이 된다(document.fullscreenElement = 문서 뿌리)');
  ok(s1.label === FS.off && s1.state === 'on' && (!visibleText || s1.text === FS.off) && s1.icon !== s0.icon, label + ": 이름과 그림이 '전체 화면 끄기'로 바뀐다 " + JSON.stringify({ label: s1.label, text: s1.text }));
}
// exitFullscreen(Esc·시스템 뒤로 가기 몸짓과 같은 fullscreenchange 사건)으로 나오면 단추 이름이 따라 돌아오는지
async function exitFullscreenAndCheck(page, label, sel) {
  await ev(page, () => document.exitFullscreen());
  await waitFs(page, false);
  await page.waitForFunction((a) => document.querySelector(a.sel)?.getAttribute('aria-label') === a.on, { sel, on: FS.on }, { timeout: 5000, polling: 50 });
  const s = await fsState(page, sel);
  ok(!s.fs && s.label === FS.on && s.state === 'off', label + ': 바깥에서 전체 화면을 끄면(Esc·뒤로 가기와 같은 사건) 단추 이름이 따라 돌아온다');
}
// 전체 화면 중 창 크기가 바뀌면(전체 화면이 실제로 창을 키우는 것과 같은 일) 세계가 따라 커지고, 나오면 되돌아온다.
// 점검 브라우저(headless)는 전체 화면이 되어도 창 크기가 그대로라 크기를 점검 도구가 바꾼다.
const worldSize = (page) => ev(page, () => {
  const c = document.querySelector('canvas.world-canvas');
  const b = document.querySelector('.board');
  const r = b?.getBoundingClientRect();
  return { canvas: c ? [c.width, c.height, c.clientWidth, c.clientHeight] : null, board: r ? [Math.round(r.width), Math.round(r.height)] : null, iw: innerWidth, ih: innerHeight };
});
async function checkWorldResize(page, label, base, big) {
  const before = await worldSize(page);
  await page.setViewportSize(big);
  await page.waitForFunction((w) => {
    const c = document.querySelector('canvas.world-canvas');
    const b = document.querySelector('.board');
    return c ? c.clientWidth === w && c.width >= w : b ? Math.round(b.getBoundingClientRect().height) === innerHeight || Math.round(b.getBoundingClientRect().width) === innerWidth : false;
  }, big.width, { timeout: 10000, polling: 50 });
  const during = await worldSize(page);
  const grew = during.canvas ? during.canvas[2] === big.width && during.canvas[3] === big.height && during.canvas[0] / during.canvas[2] === before.canvas[0] / before.canvas[2]
    : during.board[0] > before.board[0] && during.board[1] > before.board[1];
  ok(grew, label + ': 전체 화면 중 창이 커지면 ' + (during.canvas ? '3D 그림판' : '2D 그림 판') + '이 따라 커진다 ' + JSON.stringify({ before, during }));
  await page.setViewportSize(base);
  // 그리기 판 크기는 ResizeObserver가 다음 그리기 때 맞춘다(소프트웨어 그리기에서는 큰 화면 한 장이 느려 조금 걸린다)
  await page.waitForFunction((want) => {
    if (innerWidth !== want.iw) return false;
    const c = document.querySelector('canvas.world-canvas');
    const b = document.querySelector('.board');
    if (c) return JSON.stringify([c.width, c.height, c.clientWidth, c.clientHeight]) === JSON.stringify(want.canvas);
    const r = b?.getBoundingClientRect();
    return !!r && JSON.stringify([Math.round(r.width), Math.round(r.height)]) === JSON.stringify(want.board);
  }, before, { timeout: 10000, polling: 100 }).catch(() => {});
  const after = await worldSize(page);
  ok(same(after.canvas ?? after.board, before.canvas ?? before.board), label + ': 창이 돌아오면 원래 크기로 ' + JSON.stringify(after));
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
  ok(r.sheet?.[0] === '[세 덩이]' && r.sheet?.[1] === '[덩이마다 네 음보]', label + ": 튜토리얼 감정서도 단위를 '덩이'라 부른다 " + JSON.stringify(r.sheet));
  await waitSel(page, '.story-entrance[data-step="done"]');
  const doneText = await text(page, '.story-entrance');
  ok(doneText.includes(STORY.entrance.unitReveal) && (await text(page, '.story-entrance .story-reveal')) === STORY.entrance.unitReveal, label + ': 재기를 마치면 이 노래의 단위 이름(장)이 드러난다');
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

    // 모습 고르기(3D 미리보기)와 시작 화면의 전체 화면 단추
    await checkPicker(page, '3D 1366', '3d');
    await enterFullscreenAndCheck(page, '시작 화면', '.story-open-fullscreen');
    ly = await layout(page, '.story-start');
    ok(ly.length === 0, "시작 화면: '전체 화면 끄기' 이름에서도 배치 문제 없음 " + JSON.stringify(ly));
    await exitFullscreenAndCheck(page, '시작 화면', '.story-open-fullscreen');

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

    // 게임 중 위 띠의 전체 화면 단추: 들어가기, 세계 그림판 크기 따라가기, 나오기. 설정의 항목도 같은 상태를 보인다
    await enterFullscreenAndCheck(page, '3D 위 띠', '.story-hud-fullscreen');
    await checkWorldResize(page, '3D 위 띠', VIEWPORTS.chromebook, { width: 1600, height: 900 });
    await exitFullscreenAndCheck(page, '3D 위 띠', '.story-hud-fullscreen');
    await click(page, '.story-hud-settings');
    await waitSel(page, '.story-settings');
    await enterFullscreenAndCheck(page, '설정', '.story-settings .story-settings-fullscreen');
    const hudSynced = await page.waitForFunction((off) => document.querySelector('.story-hud-fullscreen')?.getAttribute('aria-label') === off, FS.off, { timeout: 5000, polling: 50 }).then(() => true, () => false);
    ok(hudSynced, '설정에서 켜면 위 띠 단추 이름도 함께 바뀐다(fullscreenchange)');
    ok((await saved(page))?.device && !JSON.stringify((await saved(page)).device).toLowerCase().includes('fullscreen'), '전체 화면은 저장하지 않는다(기기 설정에 없음)');
    await exitFullscreenAndCheck(page, '설정', '.story-settings .story-settings-fullscreen');
    await closeSettings(page);

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
    await page.waitForFunction(() => (document.querySelector('.story-record-thumb')?.naturalWidth ?? 0) > 0, null, { timeout: 10000, polling: 100 });
    const th = await thumbState(page);
    ok(th.length === 1 && th[0].k === 'b' && th[0].render === '3d' && th[0].src.startsWith('data:image/png') && th[0].loaded && th[0].alt.includes(LOOK_NAMES.b),
      '3D 기록 목록의 작은 그림은 게임 속 3D 인물의 정지 그림이다 ' + JSON.stringify(th));
    await page.waitForFunction(() => [...document.querySelectorAll('.story-start-new .story-look-canvas')].every((c) => c.dataset.painted === 'true'), null, { timeout: 15000, polling: 100 });
    const calm0 = await print(page, '.story-start-new .story-look[aria-checked="true"] canvas');
    await page.waitForTimeout(800);
    const calm1 = await print(page, '.story-start-new .story-look[aria-checked="true"] canvas');
    ok(canvasDrawn(calm0) && calm0.h === calm1.h, '움직임 줄이기면 고른 카드의 인물도 돌지 않고 3/4 자세로 서 있다');
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
    await changeLook(page, '.story-record', 'a', false);
    ok((await record(page)).appearance === 'b' && (await thumbState(page))[0]?.k === 'b', "음성 사례: '모습 바꾸기'에서 다른 모습을 골라도 '그대로 두기'면 바뀌지 않는다");
    await page.locator('.story-record .story-record-look').click();
    await waitSel(page, '.story-look-change');
    await page.waitForFunction(() => [...document.querySelectorAll('.story-look-change .story-look-canvas')].every((c) => c.dataset.painted === 'true'), null, { timeout: 15000, polling: 100 });
    const dlg = await pickerState(page, '.story-look-change');
    ok(dlg.render === '3d' && same(dlg.cards.map((c) => c.checked), ['false', 'true']) && same(dlg.cards.map((c) => c.name), [LOOK_NAMES.a, LOOK_NAMES.b]) && canvasDrawn(await print(page, '.story-look-change .story-look[data-appearance="b"] canvas')),
      "'모습 바꾸기' 상자: 같은 이름과 3D 미리보기, 지금 모습이 골라져 있다 " + JSON.stringify(dlg.cards.map((c) => c.checked)));
    ok((await layout(page, '.story-look-shade')).length === 0, "'모습 바꾸기' 상자 배치 문제 없음(글자 크기 1.3)");
    await page.locator('.story-look-change .story-look[data-appearance="a"]').click();
    await page.locator('.story-look-change .story-look-apply').click();
    await waitGone(page, '.story-look-change');
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
    await checkPicker(page, '2D 844', '2d');
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
    // 좁은 위 띠에서는 전체 화면 단추가 그림만 보이고 이름은 읽어 주기(aria-label)로 남는다
    await enterFullscreenAndCheck(page, '2D 휴대폰 위 띠', '.story-hud-fullscreen', { visibleText: false });
    ly = await layout(page, '.play-hud');
    ok(ly.length === 0, '2D 휴대폰: 전체 화면 중(글자 크기 1.3) 위 띠 배치 문제 없음 ' + JSON.stringify(ly));
    await checkWorldResize(page, '2D 휴대폰', VIEWPORTS.phone, { width: 1000, height: 460 });
    await exitFullscreenAndCheck(page, '2D 휴대폰 위 띠', '.story-hud-fullscreen');
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

  // ══════════ 이 게임보다 새 버전의 저장 ══════════
  // 저장 엔진은 새 버전의 저장을 덮어쓰지 않고 이번 창 메모리로만 간다(failure 'unknown'). 시작 화면도 같은 글로 알린다.
  console.log('— 더 새 버전의 저장: 덮어쓰지 않고 이번 창에서만 이어 간다고 알린다');
  {
    const newer = { ...defaultData(), version: 99 };
    const game = await openGame(server.url, { viewport: VIEWPORTS.chromebook, disable3d: true, seed: { [SAVE_KEY]: newer } });
    sessions.push(game);
    const { page } = game;
    await waitStart(page);
    ok((await text(page, '.story-start'))?.includes(STORY.start.saveFailed), '더 새 버전의 저장이면 시작 화면에서 저장되지 않는다고 알린다');
    ok((await ev(page, (k) => JSON.parse(localStorage.getItem(k)).version, SAVE_KEY)) === 99, '더 새 버전의 저장은 그대로 남는다');
    ok(game.errors.length === 0, '더 새 버전: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
    // 음성 사례: 보통 저장(지금 버전)에서는 알림이 없다
    const plain = await openGame(server.url, { viewport: VIEWPORTS.chromebook, disable3d: true, seed: seedAllDone({ name: '보통' }) });
    sessions.push(plain);
    await waitStart(plain.page);
    const notice = await ev(plain.page, () => { const n = document.querySelector('.story-start .story-notice'); return { text: document.querySelector('.story-start')?.textContent ?? '', hidden: n ? n.hidden : true }; });
    ok(notice.hidden && !notice.text.includes(STORY.start.saveFailed), '(음성) 지금 버전의 저장이면 저장 실패 알림이 없다');
    await plain.close();
    sessions.pop();
  }

  // ══════════ 전체 화면을 쓸 수 없는 브라우저 ══════════
  console.log('— 전체 화면을 쓸 수 없는 브라우저(iPhone Safari처럼): 단추가 없다');
  {
    const game = await openGame(server.url, { viewport: VIEWPORTS.phone, seed: seedAllDone() });
    sessions.push(game);
    const { page, context } = game;
    // 점검 도구에서만: 이 브라우저가 문서 전체 화면을 못 쓰는 것처럼 꾸민다
    await context.addInitScript(() => {
      for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(Document.prototype, k, { configurable: true, get: () => false });
    });
    await page.reload();
    await waitStart(page);
    const st = await ev(page, () => ({ enabled: document.fullscreenEnabled, start: !!document.querySelector('.story-open-fullscreen, .story-fs') }));
    ok(st.enabled === false && !st.start, '음성 사례: 전체 화면을 쓸 수 없으면 시작 화면에 전체 화면 단추가 없다 ' + JSON.stringify(st));
    await click(page, '.story-open-settings');
    await waitSel(page, '.story-settings');
    ok(!(await ev(page, () => !!document.querySelector('.story-settings .story-fs'))), '음성 사례: 설정에도 전체 화면 항목이 없다');
    await closeSettings(page);
    await click(page, '.story-record .story-record-open');
    await page.waitForFunction(() => !!document.querySelector('.story-hud-settings'), null, { timeout: 20000, polling: 100 });
    ok(!(await ev(page, () => !!document.querySelector('.story-hud-fullscreen, .play-hud .story-fs'))), '음성 사례: 게임 중 위 띠에도 전체 화면 단추가 없다');
    const ly = await layout(page, '.play-hud');
    ok(ly.length === 0, '전체 화면 단추가 없는 위 띠 배치 문제 없음 ' + JSON.stringify(ly));
    ok(game.errors.length === 0, '전체 화면 없음: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
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

    // 2D 기록 목록의 작은 그림은 승인된 그림이다
    const th2 = await thumbState(page);
    ok(th2.length === 3 && th2.every((t) => t.render === '2d' && t.src === 'assets/img/sprite/student-' + t.k + '.webp' && t.loaded), '2D 기록 목록의 작은 그림은 승인된 그림 ' + JSON.stringify(th2.map((t) => t.src)));
    // 지금의 기록으로 다시 그린다: 기록 화면에서 모습을 바꾸고 다시 내려받으면 그림이 바뀐다(실제 조작, 상태 주입 없음)
    await changeLook(page, '.story-record[data-id="s-cards"]', 'b');
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
