// 관 한 판 흐름 점검(T6, spec 2·3.2·4.3·5.1·6·7·8·12·13·14·15·20).
// 점검 페이지 tests/pages/wingflow.html이 제품의 한 판 화면(js/play/session.js)을 띄운다.
// 상태는 점검 도구가 로컬 저장소에 넣은 기록뿐이고(제품에는 점검용 입구가 없다), 실제 노래 데이터와 실제 조작(누르기)으로 진행한다.
// 작품 방은 아직 만들어지지 않았으므로 점검 페이지가 점검용 방을 끼운다(제품에는 없다).
//
// 확인하는 것
//  - 시조관 한 판 전체(3D, 1366×768): 들어갈 때의 전제 알림, 뒤섞인 노래 잡기 → 형식 분석(빗금) → ④ 갈래 판별,
//    틀린 판별(관 오답, 고른 갈래의 수첩 쪽과 맞대어 보기: 어긋나는 줄을 누르면 짝이 밝아지고 '다시 판별하기',
//    어긋나지 않는 줄은 흔들림만, 두 번이면 살짝 빛남, 기록 없음) → 다시 판별, 맞은 판별(단위 이름이 드러남, 그 관
//    갈래는 손에, 다른 갈래는 행선지가 정해져 바구니에 저절로), 판별 전·다른 갈래 노래를 엔진이 칸에 꽂지 않음,
//    바구니는 보기만(행선지 고르기·빼기 없음), 미리 분석한 노래(입구, 연필 표시, 판별 없음), 다시 열어도 남는 판별,
//    오답 도움(고른 갈래 쪽 수첩 반짝임), 판정 전 자유로운 넣고 빼기, 칸이 묶일 때 단위 이름을 다시 보임,
//    제본·먹안개, 가객(전해지는 이야기)과 기념품, 창을 다시 열어 이어 하기, 작품 방, 판 끝(단청·카드·문틈 소리·덤 칸),
//    덤 묶기, 다음 관 입구의 미리 분석한 노래, 다시 들어가기(모습 되살리기, 판정 기록 그대로), 일지·도감·수첩
//  - 향가관 탑 한 판(2D 그림 판, 844×390): 판별 뒤 바구니가 차면 보냄(미리 분석한 대기·돌아온 노래 선반), 탑은 판별 뒤에도
//    판정(층이 틀린 노래만 삐져나와 그 층과 맞대어 보기), 짚을 줄이 없는 판별(분석표와 고른 갈래 쪽을 나란히), 판 끝
//  - 2D 1366×768, 3D 844×390 화면 배치(넘침·48px)
//  - 저장 실패 알림은 한 번만, 저장소를 쓸 수 없어도 열린다
//  - 등록되지 않은 작품 방은 자리표시만 보이고 마칠 길이 없다
//  - 콘솔 오류·바깥 요청 없음, 제품 코드에 점검 입구·점수 말 없음
// 음성 사례: 점검 도우미(빈 책등 제목 찾기, 알림 세기, 배치 검사)가 실제 실패를 잡는지도 본다.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './lib/server.mjs';
import { openGame, VIEWPORTS } from './lib/browser.mjs';
import { songs } from '../js/data/songs/index.js';
import { defaultData, defaultProgress, SAVE_KEY } from '../js/core/save.js';
import { WING_TABLE } from '../js/data/song-table.js';
import { L as PL } from '../js/play/labels.js';

const PAGE = 'tests/pages/wingflow.html';
const SAVE_FAIL_TEXT = '이 기기에 저장되지 않아요. 이번 창에서만 이어집니다';

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
}
const song = (id) => songs.find((s) => s.id === id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (a) => [...a].sort();

// ───────── 기록 만들기(점검 도구 전용 상태 주입) ─────────

function fixedShelf(ids) { return ids.map((songId) => ({ songId, fixed: true })); }
function doneWing(w, basket, room) {
  return {
    state: 'done', shelfBound: true, basketDone: true, roomDone: true, bonusDone: false, uniqueActionIntroSeen: true,
    doneAt: '2026-10-01T09:00:00.000Z',
    placements: { shelf: fixedShelf(WING_TABLE[w].shelf), basket: basket.map(([songId, to]) => ({ songId, to, fixed: true })), bonus: [null, null, null] },
    wrongCount: 0, measured: [...WING_TABLE[w].shelf, ...WING_TABLE[w].stray.map((s) => s.songId)],
  };
}

function seedWith(mutate) {
  const data = defaultData();
  data.device.slashMode = true;      // 빠르게 재려고 빗금 모드로 잰다(박자 없는 방식)
  data.device.calibrated = true;
  const p = defaultProgress();
  p.tutorialDone = true;
  p.concepts['sijo-3jang'] = { state: 'pencil', songs: ['taesan'] };
  p.concepts['sijo-4beat'] = { state: 'pencil', songs: ['taesan'] };
  p.concepts['sijo-final3'] = { state: 'pencil', songs: ['taesan'] };
  mutate(p);
  const id = 's-check';
  data.slots[id] = { id, name: '점검', appearance: 'a', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', progress: p };
  data.lastSlotId = id;
  return { [SAVE_KEY]: JSON.stringify(data) };
}

// 시조관이 열린 기록: 향가관·고려가요관을 마쳤다(행선지 결과까지 맞춰 넣는다).
function seedSijo(extra = () => {}) {
  return seedWith((p) => {
    p.wings.hyangga = doneWing('hyangga', [['gasiri', 'goryeo'], ['cheongsanri-byeokgyesu', 'sijo']]);
    p.wings.goryeo = doneWing('goryeo', [['dongjitdal', 'sijo'], ['myeonangjeongga', 'gasa']]);
    p.wings.sijo.state = 'open';
    p.prewaiting.goryeo = ['gasiri'];
    p.prewaiting.sijo = ['dongjitdal'];
    p.prewaiting.gasa = ['myeonangjeongga'];
    p.returned.sijo = ['cheongsanri-byeokgyesu'];
    p.rooms.hyangga = { room: 'hyangga', interpretationId: 'a', interpretationText: '해석', isInterpretation: true };
    p.rooms.goryeo = { room: 'goryeo', lastConditionId: 'a', lastConditionText: '조건' };
    p.keepsakes = [...WING_TABLE.hyangga.shelf, ...WING_TABLE.goryeo.shelf];
    extra(p);
  });
}

// 향가관만 열린 새 기록(튜토리얼을 마쳤다)
const seedHyangga = () => seedWith((p) => { p.wings.hyangga.state = 'open'; });

// ───────── 페이지 안 도우미(문자열로 넘어간다) ─────────

// 형식 분석 화면을 끝까지: 안내 → ① 나누기 → ② 빗금 → ③ 고유 동작 → ④ 갈래 판별(info.picks 차례로, 그다음 info.genre.
// 틀린 판별 뒤의 맞대어 보기 창은 풀고 다시 고른다) → 확인. 미리 분석한 노래는 분석표 → 확인.
// info.stopAtDecide면 ④에서 멈추고 돌려준다(점검이 직접 고른다).
async function solveMeasure(info) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rewind = async () => { for (let k = 0; k < 200; k++) { const p = document.querySelector('.measure .m-prev'); if (!p || p.disabled) return; p.click(); await sleep(2); } };
  const inRange = (w) => info.ranges.some((r) => r.unit === Number(w.dataset.u) && r.line === Number(w.dataset.l) && Number(w.dataset.f) >= r.from && Number(w.dataset.f) <= r.to);
  let intros = 0;
  let last = null;
  let firstStep = null;
  let sheet = null;
  let decided = null;
  let pickIdx = 0;
  const steps = [];
  for (let i = 0; i < 6000; i++) {
    const root = document.querySelector('.measure');
    if (!root) return { done: true, intros, firstStep, sheet, decided, steps };
    if (root.dataset.step && steps.at(-1) !== root.dataset.step) steps.push(root.dataset.step);
    const introOk = root.querySelector('.m-intro-ok');
    if (introOk) { introOk.click(); intros++; await sleep(20); continue; }
    const step = root.dataset.step;
    if (firstStep === null && step) firstStep = step;
    if (step !== last) { last = step; await rewind(); }
    if (step === 'fold') {
      const gap = [...root.querySelectorAll('.m-text button.m-gap:not(.is-folded)')].find((g) => g.dataset.u !== g.dataset.nu);
      if (gap) { gap.click(); await sleep(2); continue; }
      const next = root.querySelector('.m-next');
      if (next && !next.disabled) { next.click(); await sleep(2); continue; }
      root.querySelector('button.m-fold-none')?.click();
    } else if (step === 'tap') {
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
      const none = box?.querySelector('button.m-none');
      if (box && info.action === 'aa-door') {
        const w = root.querySelector('.m-text button.m-word[data-u="' + info.aaUnit + '"]');
        if (w) { w.click(); await sleep(30); continue; }
        const next = root.querySelector('.m-next');
        if (next && !next.disabled) { next.click(); await sleep(2); continue; }
      } else if (box && info.action === 'refrain-link') {
        if (!info.ranges.length) { if (none) { none.click(); await sleep(30); continue; } } else {
          const w = [...root.querySelectorAll('.m-text button.m-word:not(.is-linked)')].find(inRange);
          if (w) { w.click(); await sleep(2); continue; }
          const next = root.querySelector('.m-next');
          if (next && !next.disabled) { next.click(); await sleep(2); continue; }
        }
      } else if (box && info.action === 'stairs') {
        const l = box.querySelector('button.m-letter:not(.is-done)');
        if (l) { l.click(); await sleep(2); continue; }
        if (none) { none.click(); await sleep(30); continue; }
      } else if (box && info.action === 'walk') {
        const b = box.querySelector('button.m-walk-step');
        if (b && !b.disabled) { b.click(); await sleep(10); continue; }
      } else if (box && info.action === 'rapid-unroll') {
        const b = box.querySelector('button.m-unroll-btn');
        if (b && !b.disabled) { b.click(); await sleep(2); continue; }
        if (none) { none.click(); await sleep(30); continue; }
      }
    } else if (step === 'decide') {
      if (!sheet) sheet = [...root.querySelectorAll('.m-sheet-line')].map((e) => e.textContent);
      if (info.stopAtDecide) return { done: false, atDecide: true, intros, firstStep, sheet, steps };
      if (document.querySelector('.play-contrast')) { await window.__solveContrast(1); continue; }
      const g = (info.picks ?? [])[pickIdx] ?? info.genre;
      const b = root.querySelector('.m-genre[data-genre="' + g + '"]:not([disabled])');
      if (b) { b.click(); pickIdx++; await sleep(80); continue; }
    } else if (step === 'decided') {
      decided = {
        genre: root.dataset.decided,
        sheet: [...root.querySelectorAll('.m-sheet-line')].map((e) => e.textContent),
        right: root.querySelector('.m-decide-right')?.textContent ?? '',
        term: root.querySelector('.m-decide-term')?.textContent ?? '',
        note: root.querySelector('.m-decide-note')?.textContent ?? '',
      };
      root.querySelector('.m-finish')?.click();
      await sleep(30);
      continue;
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

// 맞대어 보기 창을 실제 누르기로 푼다: 감정서 줄을 차례로 눌러 짝이 지어지면 '손에 다시 들기'. 푼 창 수를 돌려준다
async function solveContrast(maxPanels) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let panels = 0;
  for (let i = 0; i < 400 && panels < maxPanels; i++) {
    const box = document.querySelector('.play-contrast');
    if (!box) { await sleep(50); continue; }
    const back = box.querySelector('.play-contrast-back:not([hidden])');
    if (back) { back.click(); panels++; await sleep(30); continue; }
    const b = [...box.querySelectorAll('.play-contrast-line:not([disabled])')].find((x) => !x.dataset.tried);
    if (!b) return { panels, stuck: true };
    b.dataset.tried = '1';
    b.click();
    await sleep(30);
  }
  return { panels };
}

// 화면 배치 문제(한 판 화면). 문서 넘침, 화면 밖으로 나간 것, 48px보다 작은 버튼.
function playLayoutProblems() {
  const out = [];
  const visible = (e) => {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('[hidden]');
  };
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1) out.push('문서 넘침');
  const root = document.querySelector('.play');
  if (!root) return ['한 판 화면 없음'];
  for (const e of root.querySelectorAll('.play-hud *, .play-strip *, .play-dialog *, .play-panel *, .play-singers *, .play-keepsakes *, .play-notice *, .play-contrast *')) {
    if (!visible(e) || e.closest('.play-scroll')) continue;
    const r = e.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push('화면 밖: ' + e.className + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
  }
  for (const b of root.querySelectorAll('button')) {
    if (!visible(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.width < 47.5 || r.height < 47.5) out.push('작은 버튼: ' + (b.textContent || b.getAttribute('aria-label') || b.className).trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  for (const s of root.querySelectorAll('.play-scroll')) {
    if (!visible(s)) continue;
    const r = s.getBoundingClientRect();
    if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1) out.push('스크롤 상자가 화면 밖: ' + s.className);
  }
  return out.slice(0, 10);
}

// 서가 띠의 빈 책등에 보이는 노래 제목(빈 책등에는 제목이 없어야 한다)
function emptySpineTitles(titles) {
  const found = [];
  for (const s of document.querySelectorAll('.play-spine.is-empty')) {
    const text = (s.textContent + ' ' + (s.getAttribute('aria-label') ?? '') + ' ' + (s.title ?? '')).replace(/\s+/g, '');
    for (const t of titles) if (text.includes(t.replace(/\s+/g, ''))) found.push(t);
  }
  return found;
}

// ───────── 도우미 ─────────
const ev = (page, fn, arg) => page.evaluate(fn, arg);
// 요소가 나타날 때까지(시간 간격으로 살핀다. 3D 소프트웨어 그리기에서 화면 틀이 느려도 기다림이 밀리지 않게)
const waitSel = (page, sel, timeout = 10000) => page.waitForFunction((s) => !!document.querySelector(s), sel, { timeout, polling: 100 });

async function setup(page) {
  await page.waitForFunction(() => window.__wf?.ready === true || !!window.__wf?.error, null, { timeout: 30000, polling: 100 });
  const err = await ev(page, () => window.__wf.error ?? null);
  if (err) throw new Error('점검 페이지가 열리지 않음: ' + err);
  await page.evaluate(`window.__solveMeasure = ${solveMeasure.toString()};
    window.__solveContrast = ${solveContrast.toString()};
    window.__playLayout = ${playLayoutProblems.toString()};
    window.__emptySpineTitles = ${emptySpineTitles.toString()};`);
}

const progressOf = (page) => ev(page, () => JSON.parse(JSON.stringify(window.__wf.session.progress.progress)));
const place = (page) => ev(page, () => document.querySelector('.play')?.dataset.place ?? null);
const floating = (page) => ev(page, () => [...document.querySelectorAll('.play-song:not(.is-premeasured)')].map((e) => e.dataset.song));
const waiting = (page) => ev(page, () => [...document.querySelectorAll('.play-song.is-premeasured')].map((e) => ({ id: e.dataset.song, pencil: !!e.querySelector('.play-pencil') })));
const hand = (page) => ev(page, () => [...document.querySelectorAll('.play-hand-song')].map((e) => e.dataset.song));
const clearLog = (page) => ev(page, () => { window.__wf.log.length = 0; });
const logOf = (page, name) => ev(page, (n) => window.__wf.log.filter((e) => e.name === n).map((e) => e.detail), name);
const click = (page, sel) => ev(page, (s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);

async function waitContext(page, label, timeout = 20000) {
  await page.waitForFunction((l) => {
    const b = document.querySelector('.world-context');
    return b && !b.hidden && b.textContent.startsWith(l);
  }, label, { timeout });
}

function actionInfo(actionId, s) {
  const n = s.units.length;
  return { action: actionId, aaUnit: s.genre === 'hyangga' && n === 10 ? 8 : n - 1, ranges: (s.features?.refrains ?? []).flatMap((r) => r.ranges) };
}

const ACTION_OF = { hyangga: 'aa-door', goryeo: 'refrain-link', sijo: 'stairs', gasa: 'walk', saseol: 'rapid-unroll' };
const WING_GENRE = { hyangga: 'hyangga', goryeo: 'goryeo', sijo: 'sijo', gasa: 'gasa', saseol: 'saseol' };

// 떠도는(또는 입구에서 기다리는) 노래를 잡아 형식을 분석하고 갈래를 판별한다. 돌려주는 값: 분석 도우미의 결과
// opts.picks: 맞는 갈래 앞에 먼저 골라 볼(틀린) 갈래들. opts.stopAtDecide: ④에서 멈춘다(점검이 직접 고른다)
async function catchAndMeasure(page, wing, id, opts = {}) {
  if (!(await click(page, `.play-song[data-song="${id}"]`))) throw new Error('잡을 노래가 없음: ' + id);
  await waitContext(page, '잡기');
  await click(page, '.world-context');
  await waitSel(page, '.world.is-split .measure', 10000);
  const r = await ev(page, (i) => window.__solveMeasure(i), { ...actionInfo(ACTION_OF[wing], song(id)), genre: song(id).genre, picks: opts.picks ?? [], stopAtDecide: !!opts.stopAtDecide });
  if (opts.stopAtDecide) {
    if (!r.atDecide) throw new Error('④에 닿지 않음: ' + id + ' ' + JSON.stringify(r));
    return r;
  }
  if (!r.done) throw new Error('분석이 끝나지 않음: ' + id + ' ' + JSON.stringify(r));
  await afterMeasure(page, wing, id);
  return r;
}

// 분석 화면이 닫힌 뒤: 그 관 갈래면 손에, 다른 갈래면 바구니(또는 이미 보내짐)에 있을 때까지
async function afterMeasure(page, wing, id) {
  await page.waitForFunction(() => !document.querySelector('.measure') && !document.querySelector('.play')?.classList.contains('is-measuring'), null, { timeout: 5000, polling: 100 });
  if (song(id).genre === WING_GENRE[wing]) await page.waitForFunction((s) => !!document.querySelector(`.play-hand-song[data-song="${s}"]`), id, { timeout: 5000, polling: 100 });
  else {
    await page.waitForFunction(([w, s]) => {
      const p = window.__wf.session.progress.progress;
      return p.wings[w].placements.basket.some((x) => x?.songId === s) || Object.values(p.prewaiting).some((l) => l.includes(s)) || Object.values(p.returned).some((l) => l.includes(s));
    }, [wing, id], { timeout: 5000, polling: 100 });
  }
}

// 서가 띠의 자리로 가서 상황 버튼으로 연다
async function openSpot(page, selector, label) {
  if (!(await click(page, selector))) throw new Error('자리가 없음: ' + selector);
  await waitContext(page, label);
  await click(page, '.world-context');
}

// 칸·탑·덤에 손에 든(판별한) 노래를 꽂는다. 바구니는 판별이 저절로 채우므로 여기서 꽂지 않는다
async function placeInto(page, area, index, id) {
  if (area === 'basket') throw new Error('바구니는 갈래 판별이 저절로 채운다');
  const sel = `.play-spine[data-area="${area}"][data-index="${index}"]`;
  await openSpot(page, sel, '꽂기');
  await waitSel(page, '.play-dialog', 5000);
  if (!(await click(page, `.play-dialog .play-pick[data-song="${id}"]`))) throw new Error('손에 든 노래가 대화 상자에 없음: ' + id);
  await page.waitForFunction(() => !document.querySelector('.play-dialog'), null, { timeout: 5000, polling: 100 });
}

// 가객 → 기념품 연출을 넘기며 본 것을 모은다
async function ceremony(page) {
  await waitSel(page, '.play-singers', 10000);
  const singers = [];
  let reveal = null;
  for (let i = 0; i < 6; i++) {
    if (i === 0) reveal = await ev(page, () => document.querySelector('.play-singers .play-reveal')?.textContent ?? null);
    const s = await ev(page, () => {
      const e = document.querySelector('.play-singers .play-singer');
      return e ? { id: e.dataset.song, name: e.querySelector('.play-singer-name')?.textContent ?? '', legend: !!e.querySelector('.play-legend'), legendText: e.querySelector('.play-legend')?.textContent ?? '', line: e.querySelector('.play-singer-line')?.textContent ?? '', img: !!e.querySelector('img') } : null;
    });
    if (!s) break;
    singers.push(s);
    await click(page, '.play-singers .play-next');
    await page.waitForFunction((id) => document.querySelector('.play-singers .play-singer')?.dataset.song !== id, s.id, { timeout: 5000, polling: 100 });
  }
  await waitSel(page, '.play-keepsakes', 5000);
  const cards = await ev(page, () => [...document.querySelectorAll('.play-keepsakes .play-keepsake')].map((e) => ({ id: e.dataset.song, kind: e.dataset.kind, kindText: e.querySelector('.play-keepsake-kind')?.textContent ?? '', name: e.querySelector('.play-keepsake-name')?.textContent ?? '', note: e.querySelector('.play-keepsake-note')?.textContent ?? '' })));
  await click(page, '.play-keepsakes .play-close');
  await page.waitForFunction(() => !document.querySelector('.play-keepsakes'), null, { timeout: 5000, polling: 100 });
  return { singers, cards, reveal };
}

async function closeCard(page) {
  await waitSel(page, '.play-card .card-view', 10000);
  const info = await ev(page, () => ({ canvas: !!document.querySelector('.play-card canvas'), download: !!document.querySelector('.play-card .card-view-download') }));
  await click(page, '.play-card .card-view-close');
  await page.waitForFunction(() => !document.querySelector('.play-card'), null, { timeout: 5000, polling: 100 });
  return info;
}

// ═══════════════ 점검 ═══════════════

console.log('— 점검 도우미 음성 사례');
{
  // 정적 검사: 제품 코드(js/play)에 점검 입구·주소 인자·점수 말이 없다
  const dir = path.join(ROOT, 'js', 'play');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')) : [];
  ok(files.includes('session.js') && files.includes('wing.js'), 'js/play/session.js와 wing.js가 있다 (' + files.join(', ') + ')');
  const forbidden = [/location\.search/, /URLSearchParams/, /location\.hash/, /점수|등급|순위|타이머|게임 오버/, /__wf|__test|stub/i];
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const re of forbidden) if (re.test(text)) hits.push(f + ' ' + re);
  }
  ok(hits.length === 0, '제품 코드에 점검 입구·주소 인자·점수 말이 없다 ' + hits.join(' | '));
  ok(forbidden[3].test('점수: 10') && forbidden[4].test('window.__wf'), '정적 검사 규칙이 실제 위반을 잡는다');
}

const server = await startServer();
const sessions = [];
try {
  // ── 도우미 음성 사례(페이지 안) ──
  {
    const game = await openGame(server.url, { path: 'tests/pages/world.html' });
    sessions.push(game);
    const { page } = game;
    await page.evaluate(`window.__emptySpineTitles = ${emptySpineTitles.toString()}; window.__playLayout = ${playLayoutProblems.toString()};`);
    const r = await ev(page, () => {
      const play = document.createElement('div');
      play.className = 'play';
      play.innerHTML = '<div class="play-strip"><button class="play-spine is-empty" style="width:20px;height:20px;min-width:0;min-height:0;padding:0">동짓달 기나긴 밤을</button></div>';
      document.body.append(play);
      const titles = window.__emptySpineTitles(['동짓달 기나긴 밤을', '이런들 어떠하며']);
      const layout = window.__playLayout();
      play.remove();
      return { titles, layout };
    });
    ok(same(r.titles, ['동짓달 기나긴 밤을']), '빈 책등 검사가 보이는 제목을 잡는다');
    ok(r.layout.some((p) => p.startsWith('작은 버튼')), '배치 검사가 48px보다 작은 버튼을 잡는다 ' + JSON.stringify(r.layout));
    await game.close();
    sessions.pop();
  }

  // ══════════ 시조관 한 판(3D, 1366×768) ══════════
  {
    const game = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.chromebook, seed: seedSijo() });
    sessions.push(game);
    const { page } = game;
    await setup(page);
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'sijo', null, { timeout: 15000, polling: 100 });
    ok(await ev(page, () => document.querySelector('.world')?.dataset.mode === '3d'), '시조관: 3D로 열린다');

    console.log('— 들어가기: 전제 알림, 뒤섞인 노래, 입구의 미리 분석한 노래, 빈 책등, 돌아온 노래 선반');
    const toastsNow = () => ev(page, () => [...document.querySelectorAll('.play-toast')].map((t) => t.textContent));
    ok((await toastsNow()).includes(PL.premise('시조관')), '관에 들어오면 전제를 알린다: 노래가 뒤섞여 이 관에도 다른 관의 노래가 있고, 형식 분석 → 갈래 판별 → 제자리 ' + JSON.stringify(await toastsNow()));
    ok(/뒤섞/.test(PL.premise('시조관')) && /다른 관의 노래/.test(PL.premise('시조관')) && /형식을 분석/.test(PL.premise('시조관')) && /판별/.test(PL.premise('시조관')), '전제 글이 세 가지(뒤섞임, 다른 관의 노래, 분석·판별 뒤 제자리)를 모두 말한다');
    ok(same(sorted(await floating(page)), sorted(['ireondeul', 'imomi-jukgo', 'chang-naegoja', 'gwandong-byeolgok'])), '칸 노래 둘과 길 잃은 노래 둘이 뒤섞인 채 떠다닌다(미리 분석한 「동짓달」은 떠다니지 않는다) ' + JSON.stringify(await floating(page)));
    ok(await ev(page, () => document.querySelector('.play-song[data-song="ireondeul"]')?.getAttribute('aria-label')?.startsWith('뒤섞인 노래')), "떠도는 노래의 이름은 '뒤섞인 노래 「…」'다");
    const hb0 = await ev(page, () => ({ title: document.querySelector('.play-hand-title')?.textContent, left: document.querySelector('.play-hand-left')?.textContent ?? '' }));
    ok(hb0.title === PL.hand && hb0.left === PL.mixedLeft(4), '손 목록: 판별한 노래 칸과 남은 뒤섞인 노래 수 ' + JSON.stringify(hb0));
    ok(same(await waiting(page), [{ id: 'dongjitdal', pencil: true }]), '「동짓달」은 입구에 연필 표시로 기다린다');
    const shelfTitles = WING_TABLE.sijo.shelf.map((id) => song(id).title);
    ok(await ev(page, () => document.querySelectorAll('.play-spine[data-area="shelf"].is-empty').length === 3), '칸 세 자리는 빈 책등이다');
    ok((await ev(page, (t) => window.__emptySpineTitles(t), shelfTitles)).length === 0, '빈 책등에는 제목이 없다');
    const returnedSet = (await logOf(page, 'diorama:slot-set')).filter((d) => d.area === 'returned');
    ok(same(returnedSet, [{ area: 'returned', index: 0, songId: 'cheongsanri-byeokgyesu' }]), "돌아온 노래 선반을 다시 그린다(slot-set area 'returned') " + JSON.stringify(returnedSet));
    ok(await ev(page, () => !!document.querySelector('.play-goto[data-anchor="returnedShelf"]')), "'돌아온 노래' 선반 자리가 보인다");
    ok((await logOf(page, 'wing:state')).some((d) => d.wing === 'sijo' && d.state === 'open'), '관 문 상태를 세계에 맞춰 알린다');
    ok((await playLayoutCheck(page)).length === 0, '1366×768 3D 배치 문제 없음 ' + JSON.stringify(await playLayoutCheck(page)));
    {
      const r = await ev(page, () => window.__wf.session.progress.place('sijo', 'shelf', 0, 'ireondeul'));
      ok(!r.ok && r.reason === 'not-decided', '(음성) 갈래를 판별하지 않은 노래는 엔진도 칸에 꽂지 않는다 (' + r.reason + ')');
    }

    console.log('— 잡기, 형식 분석 ①~③, ④ 갈래 판별(틀리면 고른 갈래와 맞대어 보기, 다시 판별)');
    const first = await catchAndMeasure(page, 'sijo', 'ireondeul', { stopAtDecide: true });
    ok(first.intros === 1, '관에 처음 들어와 처음 분석하면 고유 동작 안내를 한 번 본다 (' + first.intros + ')');
    ok(same(first.steps, ['fold', 'tap', 'action', 'decide']), '① 나누기 → ② 음보 나누기 → ③ 계단 오르기 → ④ 갈래 판별 차례 ' + JSON.stringify(first.steps));
    ok(first.sheet?.[0] === '[세 부분]' && first.sheet?.[1] === '[부분마다 네 음보]', "판별 전 분석표는 단위를 '부분'이라 부른다 " + JSON.stringify(first.sheet));
    ok((await progressOf(page)).wings.sijo.uniqueActionIntroSeen === true, '고유 동작 안내를 본 것을 기록한다(uniqueActionIntroSeen)');
    const beforeWrong = await progressOf(page);
    await clearLog(page);
    await click(page, '.measure .m-genre[data-genre="saseol"]');
    await waitSel(page, '.play-contrast', 8000);
    const cp = await ev(page, () => {
      const box = document.querySelector('.play-contrast');
      return {
        song: box?.dataset.song,
        mode: box?.dataset.mode,
        modal: box?.getAttribute('aria-modal'),
        lines: [...box.querySelectorAll('.play-contrast-line')].map((b) => ({ kind: b.dataset.kind, text: b.textContent })),
        notes: [...box.querySelectorAll('.play-contrast-note')].map((n) => n.dataset.lineId),
        sub: [...box.querySelectorAll('.play-contrast-sub')].map((n) => n.textContent),
        focusIn: box.contains(document.activeElement),
        prompt: box.querySelector('.play-contrast-prompt')?.textContent ?? '',
        back: box.querySelector('.play-contrast-back')?.textContent ?? '',
        backHidden: box.querySelector('.play-contrast-back')?.hidden,
        measuring: !!document.querySelector('.measure'),
      };
    });
    let pr = await progressOf(page);
    ok(pr.wings.sijo.wrongCount === beforeWrong.wings.sijo.wrongCount + 1 && !pr.wings.sijo.measured.includes('ireondeul'), '틀린 갈래 판별은 관 오답 하나이고 판별 기록(손에 듦)이 아니다');
    ok(cp.song === 'ireondeul' && cp.mode === 'decide' && cp.modal === 'true' && cp.focusIn && cp.measuring, '틀린 판별 뒤 맞대어 보기 창이 분석 화면 위에 열리고 초점이 창 안에 있다 ' + JSON.stringify({ song: cp.song, mode: cp.mode, focusIn: cp.focusIn }));
    ok(same(cp.notes, ['saseol-stretch', 'saseol-frame', 'saseol-vs-gasa']) && cp.sub[1] === PL.contrastPage('사설시조') && cp.prompt === PL.contrastPromptGenre('사설시조'), '오른쪽은 고른 갈래(사설시조)의 『분류 수첩』 쪽이다(노래 갈래인 시조 쪽이 아니다) ' + JSON.stringify({ notes: cp.notes, sub: cp.sub }));
    ok(same(cp.lines.map((l) => l.kind), ['fold', 'tap', 'action']) && cp.lines[0].text === '[세 부분]' && cp.sub[0] === PL.contrastSheet, "왼쪽은 그 노래의 분석표 줄('부분'으로) " + JSON.stringify(cp.lines));
    ok(cp.back === PL.contrastRetry && cp.backHidden, "짝을 짓기 전에는 '다시 판별하기'가 숨어 있다");
    ok((await playLayoutCheck(page)).length === 0, '맞대어 보기 창 배치 문제 없음 ' + JSON.stringify(await playLayoutCheck(page)));
    const beforeContrast = JSON.stringify(await progressOf(page));
    for (let k = 0; k < 6; k++) await page.keyboard.press('Tab');
    ok(await ev(page, () => document.querySelector('.play-contrast')?.contains(document.activeElement)), 'Tab을 여러 번 눌러도 초점이 창 밖으로 나가지 않는다');
    // 어긋나지 않는 줄(세 부분 = 사설시조도 세 장): 흔들림만
    await click(page, '.play-contrast-line[data-kind="fold"]');
    const miss1 = await ev(page, () => ({ shake: document.querySelector('.play-contrast-line[data-kind="fold"]')?.classList.contains('is-shake'), pair: !!document.querySelector('.play-contrast .is-pair'), hint: !!document.querySelector('.play-contrast .is-hint'), open: !!document.querySelector('.play-contrast'), status: document.querySelector('.play-contrast-status')?.textContent ?? '' }));
    ok(miss1.shake && !miss1.pair && !miss1.hint && miss1.open && miss1.status === '', '어긋나지 않는 줄을 누르면 흔들리기만 하고 아무 말도 없다 ' + JSON.stringify(miss1));
    await click(page, '.play-contrast-line[data-kind="action"]');
    const miss2 = await ev(page, () => ({ hints: [...document.querySelectorAll('.play-contrast-line.is-hint')].map((b) => b.dataset.kind), pair: !!document.querySelector('.play-contrast .is-pair'), status: document.querySelector('.play-contrast-status')?.textContent ?? '' }));
    ok(same(miss2.hints, ['tap']) && !miss2.pair && miss2.status === PL.contrastNudge, '두 번째로 어긋나지 않는 줄을 누르면 어긋나는 줄이 살짝 빛난다(아직 눌러야 한다) ' + JSON.stringify(miss2));
    ok(JSON.stringify(await progressOf(page)) === beforeContrast, '맞대어 보기 창 안의 누르기는 기록을 바꾸지 않는다(오답에 들지 않는다)');
    await click(page, '.play-contrast-line[data-kind="tap"]');
    const paired = await ev(page, () => ({ left: [...document.querySelectorAll('.play-contrast-line.is-pair')].map((b) => b.dataset.kind), right: [...document.querySelectorAll('.play-contrast-note.is-pair')].map((n) => n.dataset.lineId), back: !document.querySelector('.play-contrast-back')?.hidden, status: document.querySelector('.play-contrast-status')?.textContent ?? '' }));
    ok(same(paired.left, ['tap']) && same(paired.right, ['saseol-stretch']) && paired.back && paired.status === PL.contrastFoundGenre, '어긋나는 줄(음보 수)을 누르면 고른 갈래 수첩의 같은 개념 줄(늘어나는 장)과 짝으로 밝아진다 ' + JSON.stringify(paired));
    await click(page, '.play-contrast-back');
    await page.waitForFunction(() => !document.querySelector('.play-contrast'), null, { timeout: 5000, polling: 100 });
    const again = await ev(page, () => ({ step: document.querySelector('.measure')?.dataset.step, status: document.querySelector('.measure .m-decide-status')?.textContent ?? '', enabled: [...document.querySelectorAll('.measure .m-genre')].every((b) => !b.disabled) }));
    ok(again.step === 'decide' && again.enabled && again.status.length > 0 && JSON.stringify(await progressOf(page)) === beforeContrast, "'다시 판별하기'로 창이 닫히고 분석 화면에서 다시 고른다 " + JSON.stringify(again));
    await click(page, '.measure .m-genre[data-genre="sijo"]');
    await waitSel(page, '.measure[data-step="decided"]', 5000);
    const right1 = await ev(page, () => ({ sheet: [...document.querySelectorAll('.measure .m-sheet-line')].map((e) => e.textContent), term: document.querySelector('.measure .m-decide-term')?.textContent, note: document.querySelector('.measure .m-decide-note')?.textContent }));
    ok(right1.sheet[0] === '[세 장]' && right1.sheet[1] === '[장마다 네 음보]' && right1.term === PL.unitReveal.sijo && right1.note === PL.decidedOwn('시조관'), '맞게 판별하면 갈래 단위 이름(장)이 드러나고 칸 후보가 된다고 알린다 ' + JSON.stringify(right1));
    ok((await progressOf(page)).wings.sijo.measured.includes('ireondeul') && (await ev(page, () => window.__wf.session.progress.isRevealed('ireondeul'))), "판별은 '확인' 전에 이미 기록된다(그만두어도 남는다)");
    await click(page, '.measure .m-finish');
    await afterMeasure(page, 'sijo', 'ireondeul');
    const hb1 = await ev(page, () => [...document.querySelectorAll('.play-hand-song')].map((e) => e.dataset.song + ':' + (e.querySelector('.play-hand-genre')?.textContent ?? '')));
    ok(same(hb1, ['ireondeul:시조']), '판별한 노래는 판별한 갈래와 함께 손에 든다 ' + JSON.stringify(hb1));
    ok(await ev(page, (t) => document.querySelector('.play-hand-left')?.textContent === t, PL.mixedLeft(3)), '남은 뒤섞인 노래 수가 줄어든다');

    // 「이 몸이 죽고 죽어」: 고려가요로 잘못 판별(오답 둘) → 다시 시조
    const im = await catchAndMeasure(page, 'sijo', 'imomi-jukgo', { picks: ['goryeo'] });
    ok(im.intros === 0 && im.decided?.genre === 'sijo', '「이 몸이 죽고 죽어」: 안내 없이 분석하고, 틀린 판별 뒤 다시 골라 시조로 판별한다');
    // 「창 내고쟈」: 시조로 잘못 판별(오답 셋째 → 수첩 도움은 고른 갈래인 시조 쪽) → 사설시조 → 바구니에 저절로(행선지 사설시조관)
    await clearLog(page);
    const ch = await catchAndMeasure(page, 'sijo', 'chang-naegoja', { picks: ['sijo'] });
    pr = await progressOf(page);
    ok(ch.decided?.genre === 'saseol' && ch.decided.note === PL.decidedStray('사설시조관'), '다른 갈래로 판별하면 바구니에 담겨 그 갈래의 관으로 간다고 알린다 ' + JSON.stringify(ch.decided));
    ok(same(pr.wings.sijo.placements.basket[0], { songId: 'chang-naegoja', to: 'saseol', fixed: false }) && !(await hand(page)).includes('chang-naegoja'), '행선지(사설시조관)가 저절로 정해져 바구니에 담긴다(손에 들지 않는다)');
    ok((await logOf(page, 'diorama:slot-set')).some((d) => d.area === 'basket' && d.songId === 'chang-naegoja' && d.to === 'saseol'), '바구니 slot-set에 행선지(to)를 싣는다');
    ok((await toastsNow()).includes(PL.toBasket(song('chang-naegoja').title, '사설시조관')), '바구니에 담은 것을 알린다');
    const glows = await logOf(page, 'help:notebook-glow');
    ok(pr.wings.sijo.wrongCount === 3 && glows.length === 1 && glows[0].genre === 'sijo' && glows[0].songId === 'chang-naegoja' && same(glows[0].conceptIds, ['sijo-4beat']), '오답 셋째부터 수첩 도움: 고른 갈래(시조) 쪽에서 분석표와 어긋나는 개념 ' + JSON.stringify(glows));
    ok(!glows.some((d) => d.genre === 'saseol'), '(음성) 수첩 도움이 노래 갈래(사설시조) 쪽으로 가지 않는다');
    // 바구니는 보기만: 행선지를 고르지 않고 뺄 수도 없다
    await openSpot(page, '.play-spine[data-area="basket"][data-index="0"]', '살펴보기');
    await waitSel(page, '.play-dialog', 5000);
    const bd = await ev(page, () => ({ dest: !!document.querySelector('.play-dialog .play-dest'), remove: !!document.querySelector('.play-dialog .play-remove'), pick: !!document.querySelector('.play-dialog .play-pick'), text: document.querySelector('.play-dialog')?.textContent ?? '' }));
    ok(!bd.dest && !bd.remove && !bd.pick && bd.text.includes('사설시조관') && bd.text.includes(PL.basketReady), '(음성) 바구니에는 행선지 고르기·빼기·꽂기가 없고 정해진 행선지만 보인다 ' + JSON.stringify(bd));
    await click(page, '.play-dialog .play-dialog-close');
    // 미리 분석한 「동짓달」: 판별 없이 분석표만 보고 손에
    const pre = await catchAndMeasure(page, 'sijo', 'dongjitdal');
    ok(pre.firstStep === 'sheet' && !pre.steps.includes('decide'), '미리 분석한 「동짓달」은 분석표가 채워진 채 열리고 갈래 판별이 없다 (단계 ' + JSON.stringify(pre.steps) + ')');
    ok(pre.sheet?.[0] === '[세 장]' && pre.sheet?.[1] === '[장마다 네 음보]', '바구니에서 보내진(이미 판별한) 노래는 갈래 단위 이름으로 부른다 ' + JSON.stringify(pre.sheet));
    ok(same(sorted(await hand(page)), sorted(['ireondeul', 'imomi-jukgo', 'dongjitdal'])), '판별한 시조 셋이 손에 있다');
    ok(same(sorted((await progressOf(page)).wings.sijo.measured), sorted(['ireondeul', 'imomi-jukgo', 'chang-naegoja', 'dongjitdal'])), '판별을 기록한다(measured)');
    ok((await ev(page, () => window.__wf.session.progress.place('sijo', 'shelf', 0, 'chang-naegoja'))).reason === 'other-genre', '(음성) 다른 갈래로 판별한 노래는 칸에 꽂지 않는다');

    console.log('— 창을 다시 열어도 판별 결과가 남는다');
    await page.reload();
    await setup(page);
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'sijo', null, { timeout: 15000, polling: 100 });
    const reHand = await ev(page, () => [...document.querySelectorAll('.play-hand-song')].map((e) => e.dataset.song + ':' + (e.querySelector('.play-hand-genre')?.textContent ?? '')));
    ok(same(sorted(reHand), sorted(['dongjitdal:시조', 'imomi-jukgo:시조', 'ireondeul:시조'])), '다시 열면 판별한 노래가 판별한 갈래와 함께 손에 있다 ' + JSON.stringify(reHand));
    ok(same(await floating(page), ['gwandong-byeolgok']) && (await logOf(page, 'diorama:slot-set')).some((d) => d.area === 'basket' && d.songId === 'chang-naegoja' && d.to === 'saseol'), '판별한 노래는 다시 떠다니지 않고, 바구니의 노래와 행선지도 다시 그린다');
    ok((await progressOf(page)).wings.sijo.wrongCount === 3, '오답 수도 그대로다');
    ok((await toastsNow()).includes(PL.premise('시조관')), '다시 들어와도(판을 마치기 전) 전제를 다시 알린다');

    console.log('— 바구니가 차면 보낸다(행선지는 판별한 갈래의 관)');
    await catchAndMeasure(page, 'sijo', 'gwandong-byeolgok');
    await page.waitForFunction(() => window.__wf.session.progress.progress.wings.sijo.basketDone === true, null, { timeout: 5000, polling: 100 });
    pr = await progressOf(page);
    ok(pr.prewaiting.saseol.includes('chang-naegoja') && pr.prewaiting.gasa.includes('gwandong-byeolgok'), '길 잃은 노래가 그 관 입구로 미리 분석한 채 간다 ' + JSON.stringify(pr.prewaiting));
    ok(pr.wings.sijo.wrongCount === 3 && (await logOf(page, 'diorama:pop-out')).length === 0, '바구니는 판별한 노래만 담으므로 돌아오는 노래도 오답도 없다');
    ok((await toastsNow()).some((t) => t.includes('사설시조관') && t.includes('미리 분석한')), '보낸 곳을 알린다');
    ok(await ev(page, () => !document.querySelector('.play-spine[data-area="basket"]')), '바구니를 보낸 뒤에는 서가 띠에서 바구니가 사라진다');

    console.log('— 수첩: 도움은 고른 갈래 쪽');
    await click(page, '.play-btn[data-open="notebook"]');
    await waitSel(page, '.play-panel[data-panel="notebook"]', 5000);
    const nb = await ev(page, () => ({ tabs: [...document.querySelectorAll('.play-nb-tab')].map((t) => t.dataset.genre), glowLines: document.querySelectorAll('.play-panel[data-panel="notebook"] .is-glow').length, current: document.querySelector('.play-nb-tab.is-current')?.dataset.genre, glowTabs: [...document.querySelectorAll('.play-nb-tab.is-glow')].map((t) => t.dataset.genre) }));
    ok(same(nb.tabs, ['hyangga', 'goryeo', 'sijo', 'gasa', 'saseol']), '『분류 수첩』 다섯 갈래 쪽이 모두 있다');
    ok(nb.current !== 'saseol' && !nb.glowTabs.includes('saseol'), '(음성) 수첩은 틀린 노래의 갈래(사설시조) 쪽으로 넘어가거나 반짝이지 않는다 ' + JSON.stringify({ current: nb.current, glowTabs: nb.glowTabs }));
    await click(page, '.play-panel .play-panel-close');
    await page.waitForFunction(() => !document.querySelector('.play-panel[data-panel="notebook"]'), null, { timeout: 5000, polling: 100 });

    console.log('— 판정 전에는 넣고 빼기가 자유롭다, 칸 묶기: 제본, 먹안개, 가객, 기념품');
    await clearLog(page);
    await placeInto(page, 'shelf', 0, 'imomi-jukgo');
    await placeInto(page, 'shelf', 1, 'ireondeul');
    ok(same((await progressOf(page)).wings.sijo.placements.shelf, [{ songId: 'imomi-jukgo', fixed: false }, { songId: 'ireondeul', fixed: false }, null]), '두 자리에 꽂았다(아직 판정 없음)');
    await openSpot(page, '.play-spine[data-area="shelf"][data-index="1"]', '꽂기');
    await waitSel(page, '.play-dialog .play-remove', 5000);
    await click(page, '.play-dialog .play-remove');
    await page.waitForFunction(() => !!document.querySelector('.play-hand-song[data-song="ireondeul"]'), null, { timeout: 5000, polling: 100 });
    ok((await progressOf(page)).wings.sijo.placements.shelf[1] === null, '판정 전에는 뺄 수 있다(손으로 돌아온다)');
    await click(page, '.play-dialog .play-dialog-close');
    ok((await logOf(page, 'diorama:slot-set')).some((d) => d.area === 'shelf' && d.index === 1 && d.songId === null), '뺀 자리를 비운다(slot-set songId null)');
    await placeInto(page, 'shelf', 1, 'ireondeul');
    await placeInto(page, 'shelf', 2, 'dongjitdal');
    await page.waitForFunction(() => window.__wf.log.some((e) => e.name === 'diorama:shelf-bound'), null, { timeout: 5000, polling: 100 });
    const bound = await logOf(page, 'diorama:shelf-bound');
    ok(same(bound, [{ area: 'shelf', songIds: ['imomi-jukgo', 'ireondeul', 'dongjitdal'] }]) && (await logOf(page, 'diorama:pop-out')).length === 0, '판별한 시조 셋이 묶인다(shelf-bound, 삐져나오는 노래 없음) ' + JSON.stringify(bound));
    ok((await logOf(page, 'diorama:fog-recede')).length === 1, '먹안개가 물러난다(fog-recede)');
    const c1 = await ceremony(page);
    ok(c1.reveal === PL.unitReveal.sijo, '칸이 묶이면 그 관의 단위 이름을 한 번 더 보인다: ' + c1.reveal);
    ok(same(c1.singers.map((s) => s.id), ['imomi-jukgo', 'ireondeul', 'dongjitdal']), '가객 셋이 차례로 나온다 ' + JSON.stringify(c1.singers.map((s) => s.id)));
    ok(c1.singers.every((s) => s.name === song(s.id).singer.name && s.img && s.line.length > 0), '가객은 이름과 종이 인형, 한 소절로 나온다');
    ok(same(c1.singers.map((s) => s.legend), [true, true, false]) && c1.singers.filter((s) => s.legend).every((s) => s.legendText === '전해지는 이야기'), "설화 장면에는 '전해지는 이야기'를 붙인다");
    // 지은이가 전해지는 귀속(singer.traditional)이면 가객 머리에 '전하는 작자: '를 붙인다(Codex 점검 B4·C7). 이름은 그대로 둔다
    const trad = await page.evaluate(async () => {
      const at = (f) => new URL('../../js/' + f, document.baseURI).href;
      const { singerHeading } = await import(at('play/ceremony.js'));
      const { L } = await import(at('play/labels.js'));
      const { songs } = await import(at('data/songs/index.js'));
      const gyu = songs.find((x) => x.id === 'gyuwonga');
      const jin = songs.find((x) => x.id === 'dongjitdal');
      const jeong = songs.find((x) => x.singer?.traditional && String(x.singer.name).startsWith('이름 모를'));
      const a = singerHeading(gyu.singer);
      const b = singerHeading(jin.singer);
      return { a: a.textContent, aName: a.querySelector('.play-singer-name')?.textContent, b: b.textContent, bTrad: !!b.querySelector('.play-singer-traditional'), alt: L.singerName(gyu.singer), altPlain: L.singerName(jin.singer), name: gyu.singer.name, unnamed: jeong ? singerHeading(jeong.singer).textContent : null, unnamedName: jeong?.singer.name ?? null };
    });
    ok(trad.a === '전하는 작자: 허난설헌' && trad.aName === trad.name && trad.alt === trad.a, "전해지는 귀속인 가객(「규원가」)은 '전하는 작자: 허난설헌'으로 보이고 이름 자체는 그대로다 " + JSON.stringify(trad));
    ok(trad.unnamed === '전하는 이야기 속 ' + trad.unnamedName && !trad.unnamed.includes('작자'), "이름 없이 전해지는 귀속('이름 모를 …')은 '전하는 작자'가 아니라 '전하는 이야기 속'으로 보인다 " + JSON.stringify(trad));
    ok(!trad.bTrad && trad.b === trad.altPlain && !trad.b.includes('전하는'), '(음성) 귀속이 분명한 가객(「동짓달 기나긴 밤을」)에는 한정 말이 붙지 않는다 ' + JSON.stringify(trad));
    ok(same(c1.cards.map((c) => c.id), ['imomi-jukgo', 'ireondeul', 'dongjitdal']) && c1.cards[2].name === song('dongjitdal').keepsake.name, '기념품 카드 석 장 ' + JSON.stringify(c1.cards.map((c) => c.name)));
    pr = await progressOf(page);
    ok(pr.wings.sijo.shelfBound && ['dongjitdal', 'ireondeul', 'imomi-jukgo'].every((id) => pr.keepsakes.includes(id)), '칸 묶음과 기념품을 기록한다');
    ok(['sijo-3jang', 'sijo-4beat', 'sijo-final3'].every((c) => pr.concepts[c].state === 'ink'), '칸의 공통 개념이 먹이 된다');
    ok(await ev(page, (t) => t.every((title) => [...document.querySelectorAll('.play-spine[data-area="shelf"].is-bound')].some((s) => s.textContent.includes(title))), shelfTitles), '묶인 뒤에 책등에 제목이 나타난다');
    ok(await ev(page, () => !!document.querySelector('.play-goto[data-anchor="roomDoor"]')), '작품 방 문이 열린다');
    {
      const r = await ev(page, () => window.__wf.session.progress.place('sijo', 'shelf', 0, 'chang-naegoja'));
      ok(r.ok === false, '음성 사례: 묶인 칸은 엔진도 바꾸지 않는다 (' + r.reason + ')');
    }

    console.log('— 창을 다시 열어 이어 하기(판 도중)');
    await page.reload();
    await setup(page);
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'sijo', null, { timeout: 15000, polling: 100 });
    const reSet = await logOf(page, 'diorama:slot-set');
    ok(['imomi-jukgo', 'ireondeul', 'dongjitdal'].every((id, i) => reSet.some((d) => d.area === 'shelf' && d.index === i && d.songId === id)), '다시 열면 꽂힌 자리를 다시 그린다(slot-set)');
    ok((await logOf(page, 'diorama:shelf-bound')).some((d) => d.area === 'shelf') && (await logOf(page, 'diorama:fog-recede')).length >= 1, '묶음과 먹안개 걷힘을 다시 그린다');
    ok((await hand(page)).length === 0 && (await floating(page)).length === 0, '손도 비고 떠도는 노래도 없다(모두 판별해 꽂거나 보냈다)');

    console.log('— 작품 방, 판의 끝');
    await clearLog(page);
    await openSpot(page, '.play-goto[data-anchor="roomDoor"]', '작품 방');
    await waitSel(page, '.play-room .stub-room-done', 10000);
    const call = await ev(page, () => window.__wf.roomCalls.at(-1));
    ok(call.wing === 'sijo' && call.song === 'simnyeon-gyeongyeong' && call.mode === '3d' && call.hasContainer && call.hasRhythm && call.hasSignal, '작품 방을 README 7.3 ctx로 연다 ' + JSON.stringify(call));
    await click(page, '.play-room .stub-room-done');
    const card = await closeCard(page);
    ok(card.canvas && card.download, '판을 마치면 판 결과 카드가 뜬다(그림, 내려받기)');
    pr = await progressOf(page);
    ok(pr.wings.sijo.state === 'done' && pr.wings.gasa.state === 'open' && pr.rooms.sijo?.room === 'sijo', '판을 마치고 다음 관이 열린다, 방 기록을 저장한다');
    ok((await logOf(page, 'diorama:dancheong-restore')).length === 1, '단청색이 돌아온다(dancheong-restore)');
    ok((await logOf(page, 'wing:state')).some((d) => d.wing === 'gasa' && d.state === 'open'), '다음 관 문이 열린다(wing:state)');
    ok(await ev(page, () => document.querySelector('.play-leak')?.dataset.wing === 'gasa'), '다음 관 문틈으로 소리가 새어 나온다');
    ok(same(sorted(await floating(page)), sorted(WING_TABLE.sijo.bonus)), '덤 칸이 열리고 덤 노래가 떠다닌다');
    ok(await ev(page, () => document.querySelectorAll('.play-spine[data-area="bonus"].is-empty').length === 3), '덤 칸 세 자리는 빈 책등이다');
    ok((await ev(page, (t) => window.__emptySpineTitles(t), WING_TABLE.sijo.bonus.map((id) => song(id).title))).length === 0, '덤 빈 책등에도 제목이 없다');

    console.log('— 덤 묶기');
    for (const id of WING_TABLE.sijo.bonus) await catchAndMeasure(page, 'sijo', id);
    await clearLog(page);
    for (const [i, id] of WING_TABLE.sijo.bonus.entries()) await placeInto(page, 'bonus', i, id);
    await page.waitForFunction(() => window.__wf.log.some((e) => e.name === 'diorama:shelf-bound'), null, { timeout: 5000, polling: 100 });
    ok(same(await logOf(page, 'diorama:shelf-bound'), [{ area: 'bonus', songIds: WING_TABLE.sijo.bonus }]), '덤 칸이 묶인다');
    const c2 = await ceremony(page);
    ok(c2.singers.length === 3 && c2.cards.length === 3, '덤을 묶어도 가객과 기념품이 나온다');
    ok(c2.reveal === null, '덤 묶음에는 단위 이름 줄이 없다(칸이 묶일 때 한 번)');
    ok((await progressOf(page)).wings.sijo.bonusDone === true, '덤 완료를 기록한다');

    console.log('— 일지와 도감');
    await click(page, '.play-btn[data-open="journal"]');
    await waitSel(page, '.play-panel[data-panel="journal"]', 5000);
    const j = await ev(page, () => ({
      concepts: [...document.querySelectorAll('.play-concept')].map((e) => ({ id: e.dataset.concept, state: e.dataset.state, songs: e.querySelector('.play-concept-songs')?.textContent ?? '' })),
      first: document.querySelector('.play-journal-first')?.textContent ?? '',
      clues: !!document.querySelector('.play-clues'),
    }));
    const ink = j.concepts.find((c) => c.id === 'sijo-3jang');
    ok(ink?.state === 'ink' && ink.songs.includes('동짓달'), '일지: 먹 개념과 확인해 준 노래 ' + JSON.stringify(ink));
    ok(j.first.includes('태산이 높다 하되'), "일지: '선대 사서의 첫 노래'");
    ok(j.clues, '일지: 이야기 단서 자리');
    await click(page, '.play-panel .play-panel-close');
    await click(page, '.play-btn[data-open="collection"]');
    await waitSel(page, '.play-panel[data-panel="collection"]', 5000);
    const col = await ev(page, () => [...document.querySelectorAll('.play-panel[data-panel="collection"] .play-keepsake')].map((e) => ({ id: e.dataset.song, kind: e.dataset.kind, kindText: e.querySelector('.play-keepsake-kind')?.textContent ?? '', note: e.querySelector('.play-keepsake-note')?.textContent ?? '' })));
    const gasiri = col.find((c) => c.id === 'gasiri');
    ok(col.length === (await progressOf(page)).keepsakes.length, '도감에 받은 기념품이 모두 있다 (' + col.length + ')');
    ok(gasiri?.kind === 'mind' && gasiri.kindText === '노래 속 마음' && gasiri.note === song('gasiri').cardNote, "도감: 「가시리」는 '노래 속 마음' 카드와 설명 한 줄 " + JSON.stringify(gasiri));
    ok(col.find((c) => c.id === 'dongjitdal')?.kind === 'object', '도감: 물건 카드');
    await click(page, '.play-panel .play-panel-close');

    console.log('— 다음 관: 입구의 미리 분석한 노래');
    await clearLog(page);
    await openSpot(page, '.play-goto[data-anchor="nextDoor"]', '다음 관');
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'gasa', null, { timeout: 15000, polling: 100 });
    ok(same(sorted((await waiting(page)).map((w) => w.id)), sorted(['myeonangjeongga', 'gwandong-byeolgok'])) && (await waiting(page)).every((w) => w.pencil), '가사관 입구에 「면앙정가」와 「관동별곡」이 연필 표시로 기다린다');
    ok(same(sorted(await floating(page)), sorted(['gyuwonga', 'daekdeul-dongnanji', 'obaengnyeon-doeupji'])), '가사관: 나머지 노래가 떠다닌다');

    console.log('— 마친 관에 다시 들어가기');
    await clearLog(page);
    await ev(page, () => window.__wf.session.playWing('sijo'));
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'sijo', null, { timeout: 15000, polling: 100 });
    const sets = await logOf(page, 'diorama:slot-set');
    ok(['imomi-jukgo', 'ireondeul', 'dongjitdal'].every((id, i) => sets.some((d) => d.area === 'shelf' && d.index === i && d.songId === id)) && WING_TABLE.sijo.bonus.every((id, i) => sets.some((d) => d.area === 'bonus' && d.index === i && d.songId === id)), '다시 들어가면 칸과 덤 자리를 다시 그린다');
    ok(sets.some((d) => d.area === 'returned' && d.songId === 'cheongsanri-byeokgyesu'), '돌아온 노래 선반도 다시 그린다');
    ok(same(sorted((await logOf(page, 'diorama:shelf-bound')).map((d) => d.area)), ['bonus', 'shelf']), '묶음을 다시 그린다');
    ok((await floating(page)).length === 0 && (await hand(page)).length === 0, '마친 관에서는 더 분석할 노래가 없다(덤을 마쳤다)');
    {
      const ts = await ev(page, () => [...document.querySelectorAll('.play-toast')].map((t) => t.textContent));
      ok(ts.includes(PL.doneWing) && !ts.includes(PL.premise('시조관')), '(음성) 판을 마친 관에 다시 들어오면 전제 대신 판을 마쳤다고 알린다 ' + JSON.stringify(ts));
    }
    await openSpot(page, '.play-spine[data-area="shelf"][data-index="0"]', '살펴보기');
    await waitSel(page, '.play-dialog', 5000);
    ok(await ev(page, () => !document.querySelector('.play-dialog .play-remove') && !document.querySelector('.play-dialog .play-pick')), '판정 기록은 바뀌지 않는다(빼기·꽂기 없음)');
    await click(page, '.play-dialog .play-dialog-close');
    await click(page, '.play-btn[data-open="listen"]');
    await waitSel(page, '.play-panel[data-panel="listen"]', 5000);
    const listen = await ev(page, () => [...document.querySelectorAll('.play-listen-song')].map((e) => e.dataset.song));
    ok(['dongjitdal', 'ireondeul', 'imomi-jukgo', 'cheongsanri-byeokgyesu', ...['ihwa-wolbaek']].every((id) => listen.includes(id)), '다시 듣기: 칸·덤·돌아온 노래 ' + JSON.stringify(listen));
    await click(page, '.play-listen-song[data-song="dongjitdal"] .play-listen-play');
    await click(page, '.play-panel .play-panel-close');
    ok((await progressOf(page)).wings.sijo.wrongCount === 3, '다시 들어가도 오답 기록은 그대로다');

    ok(await ev(page, () => document.querySelectorAll('.play-notice').length === 0), '저장이 되면 저장 실패 알림이 없다');
    ok(game.errors.length === 0, '시조관: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    ok(game.external.length === 0, '시조관: 바깥 요청 없음 ' + game.external.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
  }

  // ══════════ 향가관 탑 한 판(2D, 844×390) ══════════
  {
    const game = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.phone, seed: seedHyangga(), disable3d: true });
    sessions.push(game);
    const { page } = game;
    await setup(page);
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'hyangga', null, { timeout: 15000, polling: 100 });
    ok(await ev(page, () => document.querySelector('.world')?.dataset.mode === '2d'), '향가관: 2D 그림 판으로 열린다');
    ok(same(sorted(await floating(page)), sorted([...WING_TABLE.hyangga.shelf, 'gasiri', 'cheongsanri-byeokgyesu'])) && (await waiting(page)).length === 0, '탑 노래 셋과 길 잃은 노래 둘이 뒤섞인 채 떠다닌다');
    ok(await ev(page, (t) => [...document.querySelectorAll('.play-toast')].some((x) => x.textContent === t), PL.premise('향가관')), '향가관에 들어올 때도 전제를 알린다(이 관에도 다른 관의 노래가 섞여 있다)');
    ok((await playLayoutCheck(page)).length === 0, '844×390 2D 배치 문제 없음 ' + JSON.stringify(await playLayoutCheck(page)));

    console.log('— 짚을 줄이 없는 틀린 판별: 분석표와 고른 갈래 쪽을 나란히');
    await catchAndMeasure(page, 'hyangga', 'seodongyo', { stopAtDecide: true });
    await click(page, '.measure .m-genre[data-genre="goryeo"]');
    await waitSel(page, '.play-contrast', 8000);
    const pl0 = await ev(page, () => {
      const box = document.querySelector('.play-contrast');
      return { pairless: box.hasAttribute('data-pairless'), prompt: box.querySelector('.play-contrast-prompt')?.textContent, back: box.querySelector('.play-contrast-back')?.textContent, backShown: !box.querySelector('.play-contrast-back')?.hidden, notes: [...box.querySelectorAll('.play-contrast-note')].map((n) => n.dataset.lineId), lines: [...box.querySelectorAll('.play-contrast-line')].map((b) => b.textContent) };
    });
    ok(pl0.pairless && pl0.prompt === PL.contrastNoPair('고려가요') && pl0.backShown && pl0.back === PL.contrastRetry && pl0.notes.length > 0 && pl0.notes.every((id) => id.startsWith('goryeo')) && pl0.lines[0] === '[네 부분]', '어긋나는 줄이 없는 판별(4구 향가 → 고려가요): 짝짓기 없이 분석표와 고려가요 쪽을 나란히 보이고 바로 다시 판별하게 한다 ' + JSON.stringify(pl0));
    ok((await playLayoutCheck(page)).length === 0, '844×390 2D: 맞대어 보기 창 배치 문제 없음 ' + JSON.stringify(await playLayoutCheck(page)));
    await click(page, '.play-contrast-line');
    ok(await ev(page, () => !document.querySelector('.play-contrast .is-pair')), '(음성) 짚을 줄이 없는 창에서는 줄을 눌러도 짝이 지어지지 않는다');
    await click(page, '.play-contrast-back');
    await page.waitForFunction(() => !document.querySelector('.play-contrast'), null, { timeout: 5000, polling: 100 });
    await click(page, '.measure .m-genre[data-genre="hyangga"]');
    await waitSel(page, '.measure[data-step="decided"]', 5000);
    ok(await ev(page, (t) => document.querySelector('.measure .m-decide-note')?.textContent === t, PL.decidedTower), '향가로 판별하면 탑의 알맞은 층에 꽂으라고 알린다');
    await click(page, '.measure .m-finish');
    await afterMeasure(page, 'hyangga', 'seodongyo');
    for (const id of ['cheoyongga', 'chan-giparangga', 'gasiri']) await catchAndMeasure(page, 'hyangga', id);
    ok(same((await progressOf(page)).wings.hyangga.placements.basket, [{ songId: 'gasiri', to: 'goryeo', fixed: false }, null]) && !(await progressOf(page)).wings.hyangga.basketDone, '「가시리」를 고려가요로 판별하면 행선지 고려가요관으로 바구니에 담기고, 바구니가 차기 전에는 보내지 않는다');

    console.log('— 바구니가 차면 보낸다: 미리 분석한 대기와 돌아온 노래 선반');
    await catchAndMeasure(page, 'hyangga', 'cheongsanri-byeokgyesu');
    await page.waitForFunction(() => window.__wf.session.progress.progress.wings.hyangga.basketDone === true, null, { timeout: 5000, polling: 100 });
    let pr = await progressOf(page);
    ok(same(pr.prewaiting.goryeo, ['gasiri']) && same(pr.returned.sijo, ['cheongsanri-byeokgyesu']), '「가시리」는 고려가요관 입구, 「청산리 벽계수야」는 시조관 돌아온 노래 선반 ' + JSON.stringify({ pre: pr.prewaiting, ret: pr.returned }));
    ok(await ev(page, () => [...document.querySelectorAll('.play-toast')].some((t) => t.textContent.includes('돌아온 노래'))), '돌아온 노래 선반으로 간 것을 알린다');
    ok(await ev(page, () => [...document.querySelectorAll('.play-spine[data-area="shelf"]')].map((s) => s.getAttribute('aria-label')).join(',').includes('4구')), '탑의 층 이름(4구·8구·10구)으로 자리를 부른다');

    console.log('— 탑: 판별 뒤에도 층을 판정한다(층이 틀린 노래만 삐져나온다)');
    await clearLog(page);
    await placeInto(page, 'shelf', 0, 'cheoyongga');
    await placeInto(page, 'shelf', 1, 'seodongyo');
    await placeInto(page, 'shelf', 2, 'chan-giparangga');
    await page.waitForFunction(() => window.__wf.log.filter((e) => e.name === 'diorama:pop-out').length >= 2, null, { timeout: 5000, polling: 100 });
    const pops = await logOf(page, 'diorama:pop-out');
    ok(same(pops.map((d) => d.index + ':' + d.songId + ':' + d.genre), ['0:cheoyongga:hyangga', '1:seodongyo:hyangga']), '층이 바뀐 두 노래만 삐져나온다 ' + JSON.stringify(pops));
    await waitSel(page, '.play-contrast', 8000);
    const towerPanel = await ev(page, () => ({ song: document.querySelector('.play-contrast')?.dataset.song, mode: document.querySelector('.play-contrast')?.dataset.mode, notes: [...document.querySelectorAll('.play-contrast-note')].map((n) => n.dataset.lineId + ':' + n.textContent), back: document.querySelector('.play-contrast-back')?.textContent }));
    ok(towerPanel.song === 'cheoyongga' && towerPanel.mode === 'place' && towerPanel.notes[0] === 'floor:' + PL.floorLine(4) && towerPanel.notes[0].includes('네 구로') && towerPanel.back === PL.contrastBack, "탑: 오른쪽 첫 줄은 그 층('이 층은 네 구로 된 노래의 자리다.', 판별을 마친 노래라 '구') " + JSON.stringify(towerPanel.notes.slice(0, 2)));
    const solved = await ev(page, () => window.__solveContrast(2));
    ok(solved.panels === 2 && !solved.stuck, '탑에서 돌아온 두 노래를 차례로 맞대어 본다(분석표 줄을 차례로 눌러 풀기) ' + JSON.stringify(solved));
    pr = await progressOf(page);
    ok(pr.wings.hyangga.placements.shelf[2]?.fixed === true && pr.wings.hyangga.wrongCount === 3, '10구 층 노래는 고정되고, 틀린 층은 오답으로 센다(판별 오답 하나 + 층 둘)');
    await placeInto(page, 'shelf', 0, 'seodongyo');
    await placeInto(page, 'shelf', 1, 'cheoyongga');
    await page.waitForFunction(() => window.__wf.log.some((e) => e.name === 'diorama:shelf-bound'), null, { timeout: 5000, polling: 100 });
    const c = await ceremony(page);
    ok(same(c.singers.map((s) => s.legend), [true, true, false]), "탑 묶음: 「서동요」·「처용가」에 '전해지는 이야기'");

    console.log('— 저장된 상태로 다시 열기(2D)');
    await page.reload();
    await setup(page);
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'hyangga', null, { timeout: 15000, polling: 100 });
    ok((await logOf(page, 'diorama:shelf-bound')).some((d) => d.area === 'shelf'), '2D: 다시 열면 탑 묶음을 다시 그린다');

    console.log('— 작품 방(2D)과 판의 끝');
    await openSpot(page, '.play-goto[data-anchor="roomDoor"]', '작품 방');
    await waitSel(page, '.play-room .stub-room-done', 10000);
    ok((await ev(page, () => window.__wf.roomCalls.at(-1))).mode === '2d', '2D에서는 작품 방을 2D로 연다');
    ok((await playLayoutCheck(page)).length === 0, '작품 방 화면 배치 문제 없음');
    await click(page, '.play-room .stub-room-done');
    await closeCard(page);
    pr = await progressOf(page);
    ok(pr.wings.hyangga.state === 'done' && pr.wings.goryeo.state === 'open', '향가관을 마치고 고려가요관이 열린다');
    ok(await ev(page, () => document.querySelector('.play-leak')?.dataset.wing === 'goryeo'), '고려가요관 문틈으로 소리가 새어 나온다');
    ok(same(sorted(await floating(page)), sorted(WING_TABLE.hyangga.bonus)), '향가관 덤 노래가 떠다닌다');
    ok((await playLayoutCheck(page)).length === 0, '판을 마친 뒤 배치 문제 없음 ' + JSON.stringify(await playLayoutCheck(page)));

    console.log('— 회랑과 관 문(2D 실제 누르기)');
    await click(page, '.play-btn-leave');
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'corridor', null, { timeout: 10000, polling: 100 });
    await click(page, '.board-door[data-wing="goryeo"]');
    await waitContext(page, '들어가기');
    await click(page, '.world-context');
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'goryeo', null, { timeout: 15000, polling: 100 });
    ok(same(await waiting(page), [{ id: 'gasiri', pencil: true }]), '고려가요관 입구에 「가시리」가 연필 표시로 기다린다');

    console.log('— 창 숨김: 소리 멈춤');
    await clearLog(page);
    await ev(page, () => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    ok(same(await logOf(page, 'audio:pause'), [{ reason: 'hidden' }]) && same(await logOf(page, 'audio:resume'), [{ reason: 'hidden' }]), '창이 숨으면 소리를 멈추고 돌아오면 잇는다');

    ok(game.errors.length === 0, '향가관: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    ok(game.external.length === 0, '향가관: 바깥 요청 없음');
    await game.close();
    sessions.pop();
  }

  // ══════════ 2D 1366×768, 3D 844×390: 배치와 한 번 꽂기 ══════════
  for (const [label, opts] of [['2D 1366×768', { viewport: VIEWPORTS.chromebook, disable3d: true }], ['3D 844×390', { viewport: VIEWPORTS.phone }]]) {
    const game = await openGame(server.url, { path: PAGE, seed: seedSijo(), ...opts });
    sessions.push(game);
    const { page } = game;
    await setup(page);
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'sijo', null, { timeout: 15000, polling: 100 });
    ok((await playLayoutCheck(page)).length === 0, label + ': 배치 문제 없음 ' + JSON.stringify(await playLayoutCheck(page)));
    // '분석 그만두기'(B5): 형식 분석 도중 그만두면 분석한 것으로 기록하지 않고 관으로 돌아오며, 다시 잡아 분석할 수 있다
    if (!(await click(page, '.play-song[data-song="dongjitdal"]'))) throw new Error('잡을 노래가 없음');
    await waitContext(page, '잡기');
    await click(page, '.world-context');
    await waitSel(page, '.world.is-split .measure .m-quit', 10000);
    const quitSeen = await ev(page, () => ({ hudHidden: getComputedStyle(document.querySelector('.play-hud')).display === 'none', text: document.querySelector('.measure .m-quit')?.textContent }));
    ok(quitSeen.hudHidden && quitSeen.text === '분석 그만두기', label + ": 형식 분석 동안 위 띠는 숨고 분석 화면 머리에 '분석 그만두기'가 있다 " + JSON.stringify(quitSeen));
    await page.focus('.measure .m-quit');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.world.is-split') && !document.querySelector('.measure') && !document.querySelector('.play')?.classList.contains('is-measuring'), null, { timeout: 5000, polling: 100 });
    const quitAfter = await ev(page, () => ({ hud: getComputedStyle(document.querySelector('.play-hud')).display !== 'none', hand: [...document.querySelectorAll('.play-hand-song')].map((e) => e.dataset.song), floating: !!document.querySelector('.play-song[data-song="dongjitdal"]') }));
    ok(quitAfter.hud && !quitAfter.hand.includes('dongjitdal') && quitAfter.floating && !(await progressOf(page)).wings.sijo.measured.includes('dongjitdal'), label + ': 그만두면(키보드 Enter) 관으로 돌아오고 위 띠가 보이며, 잰 것으로 기록하지 않아 노래가 다시 떠다닌다 ' + JSON.stringify(quitAfter));
    await catchAndMeasure(page, 'sijo', 'dongjitdal');
    await placeInto(page, 'shelf', 0, 'dongjitdal');
    ok(same((await progressOf(page)).wings.sijo.placements.shelf[0], { songId: 'dongjitdal', fixed: false }), label + ': 잡고 꽂는다');
    await openSpot(page, '.play-spine[data-area="basket"][data-index="0"]', '살펴보기');
    await waitSel(page, '.play-dialog', 5000);
    ok((await playLayoutCheck(page)).length === 0, label + ': 대화 상자 배치 문제 없음 ' + JSON.stringify(await playLayoutCheck(page)));
    await click(page, '.play-dialog .play-dialog-close');
    // 도움이 기다리는 중(위 띠 반짝임)에 열면 그 도움의 대상 갈래(여기서는 향가) 쪽이, 아니면 지금 관 쪽이 펼쳐진다(B1)
    await ev(page, () => window.__wf.events.emit('help:notebook-glow', { wing: 'sijo', genre: 'hyangga', conceptIds: ['hyangga-lines'], songId: 'chang-naegoja' }));
    await page.waitForFunction(() => document.querySelector('.play-btn[data-open="notebook"]')?.classList.contains('is-glow'), null, { timeout: 5000, polling: 100 });
    await click(page, '.play-btn[data-open="notebook"]');
    await waitSel(page, '.play-panel[data-panel="notebook"]', 5000);
    ok((await playLayoutCheck(page)).length === 0, label + ': 수첩 배치 문제 없음 ' + JSON.stringify(await playLayoutCheck(page)));
    const firstTab = await ev(page, () => document.querySelector('.play-nb-tab.is-current')?.dataset.genre);
    ok(firstTab === 'hyangga', label + ': 도움이 기다리는 중에 열면 도움의 대상 갈래(향가) 쪽이 펼쳐진다 ' + firstTab);
    await click(page, '.play-panel .play-panel-close');
    await page.waitForFunction(() => !document.querySelector('.play-panel[data-panel="notebook"]'), null, { timeout: 5000, polling: 100 });
    await click(page, '.play-btn[data-open="notebook"]');
    await waitSel(page, '.play-panel[data-panel="notebook"]', 5000);
    const plainTab = await ev(page, () => document.querySelector('.play-nb-tab.is-current')?.dataset.genre);
    ok(plainTab === 'sijo', label + ': (음성) 기다리는 도움이 없으면 지금 관(시조) 쪽이 펼쳐진다 ' + plainTab);
    await click(page, '.play-panel .play-panel-close');
    ok(game.errors.length === 0 && game.external.length === 0, label + ': 콘솔 오류·바깥 요청 없음 ' + game.errors.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
  }

  // ══════════ 저장 실패 알림 ══════════
  console.log('— 저장 실패: 한 번만 알린다');
  {
    const game = await openGame(server.url, { path: PAGE, seed: seedSijo() });
    sessions.push(game);
    const { page, context } = game;
    await setup(page);
    await context.addInitScript(() => {
      Storage.prototype.setItem = function () { throw new DOMException('가득 참(점검)', 'QuotaExceededError'); };
    });
    await page.reload();
    await setup(page);
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'sijo', null, { timeout: 15000, polling: 100 });
    await catchAndMeasure(page, 'sijo', 'dongjitdal');
    await placeInto(page, 'shelf', 0, 'dongjitdal');
    const fails = await logOf(page, 'save:failed');
    const notices = await ev(page, () => [...document.querySelectorAll('.play-notice')].map((n) => n.textContent));
    ok(fails.length >= 2 && fails.every((f) => f.reason === 'quota'), '저장할 때마다 실패 신호가 온다 (' + fails.length + ')');
    ok(notices.length === 1 && notices[0].includes(SAVE_FAIL_TEXT), '알림은 한 번만, 정해진 문장으로 ' + JSON.stringify(notices));
    ok(same((await progressOf(page)).wings.sijo.placements.shelf[0], { songId: 'dongjitdal', fixed: false }), '저장이 안 돼도 이번 창에서 이어진다');
    ok((await playLayoutCheck(page)).length === 0, '알림이 화면을 넘지 않는다');
    // 규칙 11절 '한 번': 기록 목록으로 갔다 돌아오는 것처럼 세션을 치우고 다시 띄워도 다시 알리지 않는다(앱이 열려 있는 동안 한 번)
    const again = await ev(page, async () => {
      const wf = window.__wf;
      wf.session.dispose();
      const n0 = wf.log.filter((e) => e.name === 'save:failed').length;
      wf.session = await wf.createSession({ container: document.getElementById('app'), rooms: {}, audioDeps: wf.audioDeps });
      wf.events.emit('save:failed', { reason: 'quota' });
      return { delivered: wf.log.filter((e) => e.name === 'save:failed').length - n0, notices: document.querySelectorAll('.play-notice').length };
    });
    ok(again.delivered >= 1 && again.notices === 0, '세션을 다시 띄워도 저장 실패 알림은 다시 뜨지 않는다(실패 신호는 왔다) ' + JSON.stringify(again));
    ok(game.errors.length === 0, '저장 실패: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
  }
  {
    const game = await openGame(server.url, { path: PAGE });
    sessions.push(game);
    const { page, context } = game;
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('막힘(점검)', 'SecurityError'); } });
    });
    await page.reload();
    await setup(page);
    const r = await ev(page, () => ({ notices: [...document.querySelectorAll('.play-notice')].map((n) => n.textContent), place: document.querySelector('.play')?.dataset.place ?? null }));
    ok(r.notices.length === 1 && r.notices[0].includes(SAVE_FAIL_TEXT), '저장소를 쓸 수 없어도(SecurityError) 열리고 한 번 알린다 ' + JSON.stringify(r));
    ok(game.errors.length === 0, 'SecurityError: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
  }

  // ══════════ 등록되지 않은 작품 방 ══════════
  console.log('— 음성 사례: 등록되지 않은 작품 방은 자리표시만');
  {
    const seed = seedSijo((p) => {
      p.wings.sijo.shelfBound = true;
      p.wings.sijo.placements.shelf = fixedShelf(WING_TABLE.sijo.shelf);
      p.wings.sijo.measured = [...WING_TABLE.sijo.shelf];
    });
    const game = await openGame(server.url, { path: PAGE + '?rooms=none', seed });
    sessions.push(game);
    const { page } = game;
    await setup(page);
    await page.waitForFunction(() => document.querySelector('.play')?.dataset.place === 'sijo', null, { timeout: 15000, polling: 100 });
    await openSpot(page, '.play-goto[data-anchor="roomDoor"]', '작품 방');
    await waitSel(page, '.play-room .play-room-placeholder', 10000);
    const r = await ev(page, () => ({
      stub: !!document.querySelector('.stub-room-done'),
      buttons: [...document.querySelectorAll('.play-room button')].map((b) => b.className),
      text: document.querySelector('.play-room-placeholder').textContent,
    }));
    ok(!r.stub && same(r.buttons, ['play-room-leave']), '자리표시에는 나가기만 있다(마칠 길이 없다) ' + JSON.stringify(r.buttons));
    await click(page, '.play-room .play-room-leave');
    await page.waitForFunction(() => !document.querySelector('.play-room'), null, { timeout: 5000, polling: 100 });
    ok((await progressOf(page)).wings.sijo.roomDone === false, '방을 마친 것으로 기록하지 않는다');
    ok(game.errors.length === 0, '자리표시: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    await game.close();
    sessions.pop();
  }
} catch (e) {
  failures++;
  console.error('✗ 점검 중단: ' + (e?.stack ?? e));
} finally {
  for (const s of sessions) await s.close().catch(() => {});
  await server.close();
}

async function playLayoutCheck(page) {
  return ev(page, () => window.__playLayout());
}

if (failures) {
  console.error('\n실패 ' + failures + '건');
  process.exit(1);
}
console.log('\n관 한 판 흐름 점검 통과');
