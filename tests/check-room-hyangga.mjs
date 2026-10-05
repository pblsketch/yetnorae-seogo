// 작품 방 「제망매가」 점검(T12, spec 9·14·15·20, js/data/README.md 7.3).
// - 엔진 쪽(브라우저 없이): 방의 흐름 계산(앞 여덟 구, 9구 '아아', 기록 모양), 방 글 데이터, 잎 흩날림 계산.
// - 화면 쪽: 점검 페이지 tests/pages/room-hyangga.html이 실제 노래 데이터와 실제 소리 엔진으로 방만 띄운다.
//   3D와 강제 2D, 1366×768과 844×390에서 실제 입력(마우스·터치·키보드)으로 끝까지 하고, 기록·낭송·박자 없는 길·
//   중단(처음부터 다시)·회전 멈춤·누를 자리 크기·넘침·점수 말·바깥 요청·콘솔 오류를 본다.
import fs from 'node:fs';
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { songs } from '../js/data/songs/hyangga.js';
import { roomText, interpretations, roomTuning } from '../js/data/rooms-hyangga.js';
import { roomPlan, splitExclamation, makeRecord, createLeafField } from '../js/rooms/hyangga-flow.js';

const PAGE = 'tests/pages/room-hyangga.html';
const QUESTION = '마지막은 슬픔을 이겨 낸 것일까, 견디겠다는 다짐일까?';
const SCORE_WORDS = ['점수', '등급', '순위', '정답', '오답', '맞았', '틀렸', '타이머', '제한 시간', '게임 오버', '실패'];
const song = songs.find((s) => s.id === 'jemangmaega');
const units = song.units;

const scoreWordsIn = (text) => SCORE_WORDS.filter((w) => String(text).includes(w));
// 데이터 파일에 노래 글(구 하나 통째)을 다시 적었는지
const poemLinesIn = (source) => units.flatMap((u) => [u.original, u.decipherment, u.gloss, u.reading]).filter((t) => t.length >= 6 && source.includes(t));
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

function allStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'function') out.push(String(v(1)));
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}

// ── 엔진 쪽 ──
function checkEngine() {
  console.log('\n▶ 방의 흐름과 기록(브라우저 없이)');
  const plan = roomPlan(song);
  assert(JSON.stringify(plan.catchUnits) === '[0,1,2,3,4,5,6,7]', '앞 여덟 구(1~8구)가 잎을 붙잡는 구간이다');
  assert(plan.aaUnit === 8 && plan.finalUnit === 9, "9구('아아')에서 조작이 바뀌고 10구로 끝난다");
  assert(plan.exclamation === '아아' && plan.exclamation === song.features.exclamation.text, "감탄사는 노래 데이터의 것('아아')을 그대로 쓴다");
  // 음성 사례: 10구체가 아니거나 감탄사 표시가 없는 노래로는 방을 열지 않는다.
  assert(throws(() => roomPlan(songs.find((s) => s.id === 'seodongyo'))), '(음성) 4구 노래로는 방 흐름을 만들지 않는다');
  assert(throws(() => roomPlan({ ...song, features: { grouping: [4, 4, 2] } })), "(음성) '아아' 표시가 없는 노래로는 방 흐름을 만들지 않는다");

  const nine = units[8].decipherment;
  const sp = splitExclamation(nine, plan.exclamation);
  assert(sp && sp.head === '아아' && sp.head + sp.rest === nine, "9구 해독문을 '아아'와 나머지로 나눠도 글자는 데이터 그대로다");
  assert(splitExclamation(units[7].decipherment, '아아') === null, "(음성) '아아'로 시작하지 않는 구는 나누지 않는다");

  for (const it of interpretations) {
    const rec = makeRecord(it.id);
    const keys = Object.keys(rec).sort().join(',');
    assert(keys === 'interpretationId,interpretationText,isInterpretation,room' && rec.room === 'hyangga' && rec.interpretationId === it.id
      && rec.interpretationText === it.text && rec.isInterpretation === true, '기록 모양이 README 7.3과 같다: ' + it.id);
  }
  assert(throws(() => makeRecord('nope')) && throws(() => makeRecord(undefined)), '(음성) 없는 해석 id로는 기록을 만들지 않는다');
  assert(!Object.keys(makeRecord(interpretations[0].id)).some((k) => /correct|score|right|answer/i.test(k)), '기록에 정답 여부가 없다(채점하지 않음)');

  console.log('\n▶ 방 글 데이터');
  assert(roomText.question === QUESTION, '끝의 물음이 spec 9의 문구 그대로다');
  assert(roomText.interpretationLabel === '해석', "해석 고르기에 '해석' 표시를 단다");
  const ids = interpretations.map((i) => i.id);
  assert(interpretations.length >= 2 && new Set(ids).size === ids.length && interpretations.every((i) => i.text.trim().length > 0), '해석 후보가 둘 이상이고 id가 겹치지 않는다');
  const texts = [...allStrings(roomText), ...allStrings(interpretations)];
  assert(scoreWordsIn(texts.join('\n')).length === 0, '방 글에 점수 말이 없다');
  assert(scoreWordsIn('점수를 얻었다').length === 1, '(음성) 점수 말 찾기가 실제 점수 말을 잡는다');
  const source = fs.readFileSync(new URL('../js/data/rooms-hyangga.js', import.meta.url), 'utf8');
  assert(poemLinesIn(source).length === 0, '방 글 파일에 노래 글을 다시 적지 않았다(노래 글은 노래 데이터에서만)');
  assert(poemLinesIn('x 예 있으매 머뭇거리고, x').length > 0, '(음성) 노래 글 찾기가 다시 적은 구를 잡는다');
  assert(roomTuning.pileCount >= 2 && roomTuning.pileCount % 2 === 0, '길의 잎 무더기 수가 짝수(절반에서 10구가 나온다)');

  console.log('\n▶ 잎 흩날림 계산');
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const field = createLeafField({ count: 4, fallSeconds: 7, rng });
  const v0 = field.leaves.map((l) => l.v);
  field.step(1);
  assert(field.leaves.every((l, i) => l.v > v0[i]), '잎은 시간이 가면 아래로 떨어진다');
  const target = field.nearest();
  assert(target && field.leaves.every((l) => !field.visible(l) || l.v <= target.v), '붙잡기 단추는 가장 낮게 떨어진(보이는) 잎을 고른다');
  const caught = field.catchLeaf(target.id);
  assert(caught && typeof caught.u === 'number', '잡은 잎의 자리를 돌려준다');
  const again = field.leaves.find((l) => l.id === target.id);
  assert(again.v < 0.05, '잡은 잎은 손안에 남지 않고 가지에서 새 잎으로 다시 떨어진다');
  assert(field.catchLeaf('없는 잎') === null, '(음성) 없는 잎은 잡히지 않는다');
  const still = createLeafField({ count: 4, rng, still: true });
  const s0 = still.leaves.map((l) => l.v + ',' + l.u).join('|');
  still.step(2);
  assert(still.leaves.map((l) => l.v + ',' + l.u).join('|') === s0, '움직임 줄이기면 잎이 움직이지 않는다');
}

// ── 페이지 도우미 ──
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const roomAttr = (page, name) => ev(page, (n) => document.querySelector('.rh-room')?.dataset[n] ?? null, name);
const waitAttr = (page, name, value, timeout = 15000) =>
  page.waitForFunction(([n, v]) => document.querySelector('.rh-room')?.dataset[n] === v, [name, String(value)], { timeout });
const text = (page, sel) => ev(page, (s) => document.querySelector(s)?.textContent ?? null, sel);

// 화면에 보이고 실제로 그 자리를 누르면 그 요소가 받는 점
async function hitPoint(page, sel, { timeout = 8000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const p = await ev(page, (s) => {
      for (const e of document.querySelectorAll(s)) {
        if (e.disabled || e.hidden) continue;
        const r = e.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (x < 4 || y < 4 || x > innerWidth - 4 || y > innerHeight - 4) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === e || e.contains(hit))) return { x, y };
      }
      return null;
    }, sel);
    if (p) return p;
    await sleep(60);
  }
  throw new Error('누를 수 있는 ' + sel + '이(가) 없다');
}

// 실제 입력으로 누른다: 마우스 클릭, 터치 탭, 키보드(초점 + Enter/Space)
async function press(page, sel, input, key = 'Enter') {
  if (input === 'keyboard') {
    await page.focus(sel);
    await page.keyboard.press(key);
    return;
  }
  const p = await hitPoint(page, sel);
  if (input === 'touch') await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

// 누를 자리가 48px 이상인지
async function smallTargets(page, sel) {
  return ev(page, (s) => [...document.querySelectorAll(s)].filter((e) => !e.hidden && e.offsetParent !== null)
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width < 47.5 || r.height < 47.5).map((r) => Math.round(r.width) + '×' + Math.round(r.height)), sel);
}

// 방 안의 보이는 글·조작이 화면 밖으로 넘치는지
async function overflowing(page) {
  return ev(page, () => {
    const out = [];
    for (const e of document.querySelectorAll('.rh-room .rh-text, .rh-room .rh-hint, .rh-room .rh-act, .rh-room .rh-ask, .rh-room .rh-intro, .rh-room .rh-msg:not(:empty), .rh-room .rh-choice, .rh-room .rh-confirm, .rh-room .rh-start')) {
      if (e.hidden || e.offsetParent === null) continue;
      const r = e.getBoundingClientRect();
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(e.className + ' 화면 밖');
      if (e.scrollHeight > e.clientHeight + 2 && getComputedStyle(e).overflowY !== 'auto') out.push(e.className + ' 글 넘침');
      if (e.scrollWidth > e.clientWidth + 2) out.push(e.className + ' 가로 넘침');
    }
    return out;
  });
}

async function checkScreen(page, label, sels) {
  const small = [];
  for (const s of sels) small.push(...(await smallTargets(page, s)).map((x) => s + ' ' + x));
  assert(small.length === 0, label + ': 누를 자리가 48px 이상 ' + small.join(', '));
  const of = await overflowing(page);
  assert(of.length === 0, label + ': 글과 조작이 화면 안에 들어가고 넘치지 않는다 ' + of.join(', '));
  const visible = await ev(page, () => document.querySelector('.rh-room')?.innerText ?? '');
  assert(scoreWordsIn(visible).length === 0, label + ': 점수 말이 없다 ' + scoreWordsIn(visible).join(','));
}

async function leafPositions(page) {
  return ev(page, () => [...document.querySelectorAll('.rh-leaf')].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); }).join('|'));
}

async function open(server, run) {
  const game = await openGame(server.url, { path: PAGE, viewport: run.viewport, disable3d: run.disable3d, touch: run.touch });
  game.notFound = [];
  game.page.on('response', (res) => { if (res.status() === 404) game.notFound.push(new URL(res.url()).pathname); });
  await game.page.waitForFunction(() => window.__r?.ready === true, null, { timeout: 20000 });
  return game;
}

async function startRoom(page, run) {
  await ev(page, (o) => window.__r.start(o), { noBeat: !!run.noBeat, reduceMotion: !!run.reduceMotion, textScale: run.textScale ?? 1 });
  await waitAttr(page, 'phase', 'intro');
}

// 앞 여덟 구: 잎을 붙잡으면 흩어진다
async function catchPhase(page, run, label, hooks = {}) {
  await press(page, '.rh-start', run.input);
  await waitAttr(page, 'phase', 'catch');
  assert(await roomAttr(page, 'mode') === run.expectMode, label + ': ' + run.expectMode + ' 방식으로 그린다');
  await checkScreen(page, label + ' 잎 붙잡기', ['.rh-leaf', '.rh-act']);
  for (let i = 0; i < 8; i++) {
    await waitAttr(page, 'unit', i);
    const line = await text(page, '.rh-line');
    const orig = await text(page, '.rh-original');
    const gu = await text(page, '.rh-gu');
    assert(line === units[i].decipherment && orig === units[i].original && gu.includes(String(i + 1) + '구'),
      label + ': ' + (i + 1) + '구 글이 노래 데이터(해독문·향찰) 그대로다');
    if (i === 0) {
      // 음성 사례: 잎을 붙잡아 보지 않으면 낭송이 끝나도 다음 구로 가지 않는다(시간 제한도 없다).
      await sleep(1200);
      assert(await roomAttr(page, 'unit') === '0', label + ': (음성) 잎을 붙잡아 보기 전에는 다음 구로 넘어가지 않는다');
      assert(await ev(page, () => document.querySelectorAll('.rh-leaf').length) >= 2, label + ': 잎 여럿이 떨어지고 있다');
    }
    if (hooks.beforeCatch) await hooks.beforeCatch(i);
    const before = Number(await roomAttr(page, 'scattered'));
    // 키보드는 상황 단추(Enter·Space 번갈아), 마우스·터치는 떨어지는 잎을 직접 누른다(마지막 구만 상황 단추).
    const sel = run.input === 'keyboard' || i === 7 ? '.rh-act' : '.rh-leaf';
    await press(page, sel, run.input, i % 2 ? ' ' : 'Enter');
    await page.waitForFunction((b) => Number(document.querySelector('.rh-room').dataset.scattered) > b, before, { timeout: 8000 });
    assert(await roomAttr(page, 'held') === '0', label + ': ' + (i + 1) + '구에서 잡은 잎이 손안에서 흩어져 남지 않는다');
    if (i === 0) {
      const frags = await page.waitForFunction(() => document.querySelectorAll('.rh-frag').length > 0, null, { timeout: 2000 }).then(() => true, () => false);
      assert(frags, label + ': 흩어지는 잎 조각이 보인다');
    }
  }
}

async function sweepPhase(page, run, label) {
  await waitAttr(page, 'phase', 'sweep');
  assert(await roomAttr(page, 'unit') === '8', label + ": 9구에서 조작이 바뀐다");
  const line = await text(page, '.rh-line');
  const aa = await text(page, '.rh-line .rh-aa');
  assert(line === units[8].decipherment, label + ': 9구 글이 노래 데이터 그대로다 (' + line + ')');
  assert(aa === song.features.exclamation.text && line.startsWith(aa), label + ": '아아'가 데이터 그대로 따로 드러난다");
  assert(await ev(page, () => document.querySelector('.rh-hand')?.dataset.kind) === 'sweep', label + ': 잡으려던 손이 길을 닦는 손으로 바뀐다');
  assert(await ev(page, () => document.querySelectorAll('.rh-leaf').length) === 0, label + ': 이제 붙잡을 잎은 없다');
  assert(await text(page, '.rh-act') === roomText.sweepAction, label + ': 상황 단추가 \'' + roomText.sweepAction + '\'로 바뀐다');
  const n = roomTuning.pileCount;
  assert(await ev(page, () => document.querySelectorAll('.rh-pile').length) === n, label + ': 길에 잎 무더기 ' + n + '개');
  await checkScreen(page, label + ' 길 닦기', ['.rh-pile:not([disabled])', '.rh-act']);
  // 음성 사례: 아직 닿지 않은 무더기는 눌러도 쓸리지 않는다.
  if (run.input !== 'keyboard') {
    const far = await ev(page, () => { const e = [...document.querySelectorAll('.rh-pile[disabled]')].at(-1); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (run.input === 'touch') await page.touchscreen.tap(far.x, far.y); else await page.mouse.click(far.x, far.y);
    await sleep(300);
    assert(await roomAttr(page, 'swept') === '0', label + ': (음성) 아직 닿지 않은 길은 쓸리지 않는다');
  }
  for (let k = 0; k < n; k++) {
    await press(page, run.input === 'keyboard' || k === n - 1 ? '.rh-act' : '.rh-pile:not([disabled])', run.input, k % 2 ? ' ' : 'Enter');
    await waitAttr(page, 'swept', k + 1);
    if (k + 1 === n / 2) {
      await waitAttr(page, 'unit', 9);
      assert(await text(page, '.rh-line') === units[9].decipherment && await text(page, '.rh-original') === units[9].original, label + ': 길을 반쯤 닦으면 10구가 노래 데이터 그대로 나온다');
    }
  }
}

async function askPhase(page, run, label) {
  await waitAttr(page, 'phase', 'ask');
  assert(await text(page, '.rh-ask .rh-label') === '해석', label + ": 물음에 '해석' 표시가 있다");
  assert(await text(page, '.rh-question') === QUESTION, label + ': 끝의 물음이 spec 9 문구 그대로다');
  const shown = await ev(page, () => [...document.querySelectorAll('.rh-choice')].map((e) => ({ id: e.dataset.id, t: e.textContent })));
  assert(shown.length === interpretations.length && shown.every((c, i) => c.id === interpretations[i].id && c.t.includes(interpretations[i].text)), label + ': 해석 후보가 모두 보인다');
  assert(await ev(page, () => document.querySelector('.rh-confirm').disabled) === true, label + ': (음성) 고르기 전에는 남길 수 없다');
  await checkScreen(page, label + ' 해석 고르기', ['.rh-choice', '.rh-confirm']);
  for (const id of run.choices) await press(page, `.rh-choice[data-id="${id}"]`, run.input, ' ');
  const pressed = await ev(page, () => [...document.querySelectorAll('.rh-choice[aria-pressed="true"]')].map((e) => e.dataset.id));
  assert(pressed.length === 1 && pressed[0] === run.choices.at(-1), label + ': 마지막으로 고른 해석 하나만 골라져 있다');
  assert(await ev(page, () => window.__r.state) === 'running', label + ': 남기기 전에는 방이 끝나지 않는다');
  await press(page, '.rh-confirm', run.input);
  await page.waitForFunction(() => window.__r.state !== 'running', null, { timeout: 8000 });
  const res = await ev(page, () => ({ state: window.__r.state, result: window.__r.result, error: window.__r.error }));
  const expected = { completed: true, record: makeRecord(run.choices.at(-1)) };
  assert(res.state === 'done' && JSON.stringify(res.result) === JSON.stringify(expected), label + ': 방이 고른 해석의 기록으로 끝난다 ' + JSON.stringify(res.result ?? res.error));
}

async function runFull(server, run) {
  const label = run.name;
  console.log('\n▶ ' + label);
  const game = await open(server, run);
  const { page } = game;
  try {
    const base = { children: await ev(page, () => window.__r.rootChildren()), camera: await ev(page, () => window.__r.cameraPose()) };
    if (run.abort) await abortCase(page, run, label, base);
    await startRoom(page, run);
    await checkScreen(page, label + ' 시작', ['.rh-start']);
    let positions = null;
    await catchPhase(page, run, label, {
      beforeCatch: async (i) => {
        if (i === 2 && run.orientation) await orientationCase(page, label);
        if (i === 2 && run.reduceMotion) {
          positions = await leafPositions(page);
          await sleep(400);
          assert(await leafPositions(page) === positions, label + ': 움직임 줄이기면 잎이 제자리에 있다');
        }
        if (i === 2 && run.switchNoBeat) {
          await ev(page, () => window.__r.events.emit('rhythm:no-beat', { value: true, reason: 'slash' }));
          run.playsAtSwitch = await ev(page, () => window.__r.plays.length);
        }
      },
    });
    if (!run.reduceMotion && !run.orientation) {
      positions = await leafPositions(page);
      await sleep(250);
      // 아직 잎이 남아 있으면(9구 직전) 움직이는지 본다
      if (positions) assert(await leafPositions(page) !== positions || positions === '', label + ': 잎이 바람에 떨어지며 움직인다');
    }
    await sweepPhase(page, run, label);
    if (run.expectMode === '3d') {
      const calls = await ev(page, () => window.__r.drawCalls());
      assert(calls > 0 && calls <= 60, label + ': 그리기 호출 60회 이하 (' + calls + ')');
    }
    await askPhase(page, run, label);
    const plays = await ev(page, () => window.__r.plays.flat());
    if (run.noBeat) assert(plays.length === 0, label + ': 박자 없는 방식이면 낭송 없이 끝까지 간다');
    else if (run.switchNoBeat) {
      assert(run.playsAtSwitch >= 3 && plays.length === run.playsAtSwitch, label + ': 도중에 박자 없는 방식으로 바뀌면 낭송을 멈추고 그대로 끝까지 간다 (' + run.playsAtSwitch + '→' + plays.length + ')');
    } else {
      const segs = [...new Set(plays)].sort((a, b) => a - b);
      assert(JSON.stringify(segs) === '[0,1,2,3,4,5,6,7,8,9]', label + ': 열 구를 모두 실제 소리 엔진으로 낭송한다 ' + JSON.stringify(segs));
    }
    const after = { children: await ev(page, () => window.__r.rootChildren()), camera: await ev(page, () => window.__r.cameraPose()), dom: await ev(page, () => window.__r.containerChildren()) };
    assert(after.dom === 0 && after.children === base.children && JSON.stringify(after.camera) === JSON.stringify(base.camera), label + ': 끝나면 만든 것을 모두 치우고 카메라를 되돌린다');
    const audio404 = game.notFound.filter((p) => !p.includes('/assets/audio/'));
    assert(audio404.length === 0, label + ': 없는 파일 요청이 없다 ' + audio404.join(', '));
    assert(game.external.length === 0, label + ': 바깥 주소 요청이 없다 ' + game.external.join(', '));
    const errs = game.errors;
    assert(errs.length === 0, label + ': 콘솔 오류가 없다 ' + errs.slice(0, 3).join(' | '));
  } finally {
    await game.close();
  }
}

// 중단: 방 도중에 나가면 Promise가 AbortError로 끝나고, 다음에는 처음부터 다시 한다(spec 20)
async function abortCase(page, run, label, base) {
  await startRoom(page, run);
  await press(page, '.rh-start', run.input);
  await waitAttr(page, 'phase', 'catch');
  await press(page, '.rh-leaf', run.input);
  await waitAttr(page, 'unit', 1);
  await ev(page, () => window.__r.abort());
  await page.waitForFunction(() => window.__r.state !== 'running', null, { timeout: 5000 });
  const r = await ev(page, () => ({ state: window.__r.state, error: window.__r.error, dom: window.__r.containerChildren(), children: window.__r.rootChildren(), camera: window.__r.cameraPose() }));
  assert(r.state === 'error' && r.error?.name === 'AbortError', label + ': 도중에 나가면 AbortError로 끝난다');
  assert(r.dom === 0 && r.children === base.children && JSON.stringify(r.camera) === JSON.stringify(base.camera), label + ': 나가면 방이 만든 것을 모두 치운다');
  const playsBefore = await ev(page, () => window.__r.plays.length);
  await sleep(400);
  assert(await ev(page, () => window.__r.state) === 'error', label + ': 나간 뒤에는 기록이 돌아오지 않는다');
  // 이미 중단된 신호로 시작하면 바로 AbortError
  const pre = await ev(page, async () => {
    const mod = await import('../../js/rooms/hyangga.js');
    const c = new AbortController(); c.abort();
    const box = document.createElement('div');
    try { await mod.start({ song: window.__r.song, container: box, mode: '2d', noBeat: true, reduceMotion: () => true, signal: c.signal }); return 'resolved'; } catch (e) { return e.name + ':' + box.children.length; }
  });
  assert(pre === 'AbortError:0', label + ': 이미 중단된 신호로는 방을 열지 않는다 (' + pre + ')');
  void playsBefore;
  await startRoom(page, run);
  await press(page, '.rh-start', run.input);
  await waitAttr(page, 'phase', 'catch');
  assert(await roomAttr(page, 'unit') === '0' && await roomAttr(page, 'scattered') === '0', label + ': 다시 들어오면 1구부터 처음부터 한다');
  await ev(page, () => window.__r.abort());
  await page.waitForFunction(() => window.__r.state === 'error', null, { timeout: 5000 });
}

// 세로로 돌리면 멈추고(누름·잎 움직임), 가로로 돌아오면 이어진다
async function orientationCase(page, label) {
  await ev(page, () => { window.__r.events.emit('orientation:pause', {}); window.__r.events.emit('audio:pause', { reason: 'orientation' }); });
  await waitAttr(page, 'paused', '1');
  const pos = await leafPositions(page);
  const sc = await roomAttr(page, 'scattered');
  await page.focus('.rh-act');
  await page.keyboard.press('Enter');
  await sleep(350);
  assert(await leafPositions(page) === pos && await roomAttr(page, 'scattered') === sc, label + ': 세로로 돌린 동안 잎과 조작이 멈춘다');
  await ev(page, () => { window.__r.events.emit('orientation:resume', {}); window.__r.events.emit('audio:resume', { reason: 'orientation' }); });
  await waitAttr(page, 'paused', '0');
}

const RUNS = [
  { name: '3D 1366×768 마우스·박자', viewport: VIEWPORTS.chromebook, expectMode: '3d', input: 'mouse', choices: ['both', 'overcome'], abort: true, orientation: true },
  { name: '3D 844×390 터치·소리 끔·글자 1.3', viewport: VIEWPORTS.phone, touch: true, expectMode: '3d', input: 'touch', noBeat: true, textScale: 1.3, choices: ['endure'] },
  { name: '2D 1366×768 키보드·도중 빗금·글자 1.3', viewport: VIEWPORTS.chromebook, disable3d: true, expectMode: '2d', input: 'keyboard', switchNoBeat: true, textScale: 1.3, choices: ['overcome', 'both'] },
  { name: '2D 844×390 터치·박자 없음·움직임 줄이기·글자 1.3', viewport: VIEWPORTS.phone, touch: true, disable3d: true, expectMode: '2d', input: 'touch', noBeat: true, reduceMotion: true, textScale: 1.3, choices: ['endure'], abort: true },
];

let server;
try {
  checkEngine();
  server = await startServer();
  for (const run of RUNS) await runFull(server, run);
  console.log('\n작품 방 「제망매가」 점검 통과');
} catch (e) {
  console.error(e.stack ?? e.message);
  process.exitCode = 1;
} finally {
  await server?.close();
}
