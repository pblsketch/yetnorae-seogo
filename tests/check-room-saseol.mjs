// 작품 방 「님이 오마 하거늘」 점검(T16, spec 9·14·15·20, js/data/README.md 7.3·'추가 제안(T24)').
// 점검 페이지 tests/pages/room-saseol.html이 실제 노래 데이터와 실제 소리 엔진으로 방 하나만 띄운다(제품 흐름에는 없다).
// 3D와 3D를 끈 2D 그림 판에서, 크롬북(1366×768)과 휴대폰 가로(844×390)로 실제 클릭·탭·키로 방을 끝까지 한다.
//  - 늘어난 중장을 반전 바로 앞(reversal.fromFoot)까지 달린다: 박자 방식(낭송에 맞춰 두드림)과 박자 없는 방식(누를 때마다 한 음보)
//  - 멈춘 뒤에는 반전 앞까지의 글과 glossBefore만 보이고, 반전 뒤 원문·전체 풀이·종장은 보이지 않는다
//  - "무엇을 보게 될까?" 후보 셋(님 / 다른 사람 / 주추리 삼대) 가운데 무엇을 골라도 공개와 종장으로 그대로 이어진다
//  - 공개 뒤 반전 음보·전체 풀이, 종장 원문·풀이가 노래 데이터 그대로 보인다
//  - 기록은 7.3의 { room: 'saseol', predictionId, predictionText }뿐이다(정답 여부 없음)
//  - 박자 방식 도중 빗금 모드로 바뀌면 박자 없는 방식으로 이어서 끝까지 간다
//  - 중단 신호: AbortError로 끝나고 화면과 3D 물체를 치우며, 다시 열면 처음부터 한다(spec 20)
//  - 그리기 호출 60회 이하, 터치 대상 48px, 글자 크기 1.3에서 넘침 없음, 점수 말 없음, 콘솔 오류·바깥 요청 없음
// 음성 사례: 기록·누설·점수 말·배치 검사가 실제 잘못을 잡는지, 반전 표시가 없는 노래면 방이 오류로 끝나는지 본다.
import { startServer } from './lib/server.mjs';
import { openGame, VIEWPORTS } from './lib/browser.mjs';
import { songs } from '../js/data/songs/saseol.js';
import { roomSaseol } from '../js/data/rooms-saseol.js';

const PAGE = 'tests/pages/room-saseol.html';
const BUDGET = 60;
const SONG = songs.find((s) => s.id === 'nimi-oma');
const MID = SONG.units[1];
const REV = MID.reversal.fromFoot;
const IDS = ['nim', 'other-person', 'jujuri-samdae'];
const SCORE_WORDS = ['점수', '등급', '순위', '게임 오버', '실패', '타이머', '남은 시간', '정답', '오답', '틀렸', '맞혔'];

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
}

// ── 검사 함수(음성 사례로 함께 시험한다) ──

// 7.3 기록 모양
function recordProblems(result, expectId) {
  const out = [];
  if (!result || result.completed !== true) out.push('completed: true가 아니다');
  const rec = result?.record;
  if (!rec || typeof rec !== 'object') return [...out, '기록이 없다'];
  const keys = Object.keys(rec).sort().join(',');
  if (keys !== 'predictionId,predictionText,room') out.push('기록 열쇠가 약속과 다르다: ' + keys);
  if (rec.room !== 'saseol') out.push('room이 saseol이 아니다');
  if (!IDS.includes(rec.predictionId)) out.push('모르는 predictionId: ' + rec.predictionId);
  if (expectId && rec.predictionId !== expectId) out.push('고른 예측과 다르다: ' + rec.predictionId);
  const c = roomSaseol.candidates.find((x) => x.id === rec.predictionId);
  if (!c || rec.predictionText !== c.text) out.push('predictionText가 후보 글과 다르다: ' + rec.predictionText);
  return out;
}

// 예측 전 글 상자에 반전 뒤 글이 새어 나왔는지
function leakProblems(text) {
  const out = [];
  MID.feet.slice(REV).forEach((f, i) => { if (text.includes(f.original) || text.includes(f.reading)) out.push('반전 뒤 음보 ' + (REV + i) + ' 노출: ' + f.original); });
  if (text.includes(MID.gloss)) out.push('중장 전체 풀이 노출');
  if (text.includes('주추리') || text.includes('삼대')) out.push('주추리 삼대 노출');
  for (const f of SONG.units[2].feet) if (text.includes(f.original)) out.push('종장 노출: ' + f.original);
  return out;
}

function scoreWordProblems(text) {
  return SCORE_WORDS.filter((w) => text.includes(w)).map((w) => '점수 말: ' + w);
}

// 화면 배치 측정값 → 문제 목록
function layoutProblems(m) {
  const out = [];
  for (const b of m.buttons) {
    if (b.w < 47.5 || b.h < 47.5) out.push('터치 대상이 48px보다 작다: ' + b.label + ' ' + Math.round(b.w) + '×' + Math.round(b.h));
    if (b.left < -1 || b.top < -1 || b.right > m.vw + 1 || b.bottom > m.vh + 1) out.push('버튼이 화면 밖: ' + b.label);
  }
  for (const o of m.overflow) out.push('넘침: ' + o);
  if (m.panel && (m.panel.right > m.vw + 1 || m.panel.bottom > m.vh + 1 || m.panel.left < -1 || m.panel.top < -1)) out.push('글 판이 화면 밖');
  return out;
}

// 페이지 안에서 재는 배치(문자열로 넘어간다)
function measureLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const root = document.querySelector('.rs-room');
  const r = (e) => e.getBoundingClientRect();
  const visible = (e) => { const b = r(e); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const buttons = [...(root?.querySelectorAll('button') ?? [])].filter(visible).map((b) => { const x = r(b); return { label: b.textContent.trim().slice(0, 12), w: x.width, h: x.height, left: x.left, top: x.top, right: x.right, bottom: x.bottom }; });
  const overflow = [];
  for (const e of root?.querySelectorAll('.rs-panel, .rs-panel *') ?? []) {
    if (!visible(e)) continue;
    const cs = getComputedStyle(e);
    const scrollsX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    const scrollsY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
    if (!scrollsX && e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible') overflow.push((e.className || e.tagName) + ' 가로');
    if (!scrollsY && cs.overflowY === 'hidden' && e.scrollHeight > e.clientHeight + 1) overflow.push((e.className || e.tagName) + ' 세로');
    if (e.matches('.rs-panel *') && cs.position !== 'absolute') {
      const p = e.closest('.rs-panel').getBoundingClientRect();
      const b = r(e);
      if (b.right > p.right + 1 || b.left < p.left - 1) overflow.push((e.className || e.tagName) + ' 판 밖으로');
    }
  }
  const pe = root?.querySelector('.rs-panel');
  const panel = pe ? (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(r(pe)) : null;
  return { vw, vh, buttons, overflow, panel };
}

// ── 음성 사례: 검사 함수가 실제 잘못을 잡는가 ──
{
  const good = { completed: true, record: { room: 'saseol', predictionId: 'nim', predictionText: '님' } };
  ok(recordProblems(good, 'nim').length === 0, '검사: 올바른 기록은 통과한다');
  ok(recordProblems({ completed: true, record: { ...good.record, correct: false } }).length > 0, '음성: 정답 여부를 담은 기록을 잡는다');
  ok(recordProblems({ completed: true, record: { ...good.record, predictionText: '다른 사람' } }).length > 0, '음성: 고른 후보와 다른 글을 잡는다');
  ok(recordProblems({ completed: true, record: { predictionId: 'nim', predictionText: '님' } }).length > 0, '음성: room이 빠진 기록을 잡는다');
  ok(recordProblems({ completed: true, record: { ...good.record, predictionId: 'ghost' } }).length > 0, '음성: 모르는 예측 id를 잡는다');
  ok(recordProblems(good, 'jujuri-samdae').length > 0, '음성: 고른 것과 다른 예측을 잡는다');
  ok(leakProblems(MID.feet.slice(0, REV).map((f) => f.original).join(' ') + MID.reversal.glossBefore).length === 0, '검사: 반전 앞 글만 있으면 누설이 아니다');
  ok(leakProblems('… ' + MID.feet[REV].original).length > 0, '음성: 반전 첫 음보 누설을 잡는다');
  ok(leakProblems(MID.gloss).length > 0, '음성: 중장 전체 풀이 누설을 잡는다');
  ok(scoreWordProblems('점수 10점').length > 0 && scoreWordProblems(roomSaseol.intro).length === 0, '음성: 점수 말을 잡는다');
  const lay = { vw: 844, vh: 390, panel: { left: 0, top: 0, right: 844, bottom: 390 }, overflow: [], buttons: [{ label: '작은 버튼', w: 40, h: 48, left: 0, top: 0, right: 40, bottom: 48 }] };
  ok(layoutProblems(lay).length === 1, '음성: 48px보다 작은 버튼을 잡는다');
  ok(layoutProblems({ ...lay, buttons: [{ label: '밖', w: 60, h: 60, left: 800, top: 350, right: 860, bottom: 410 }] }).length === 1, '음성: 화면 밖 버튼을 잡는다');
}

// ── 데이터(방 글) ──
{
  ok(JSON.stringify(roomSaseol.candidates.map((c) => c.id)) === JSON.stringify(IDS), '방 글: 후보 id가 7.3 약속(nim / other-person / jujuri-samdae) 그대로다');
  ok(JSON.stringify(roomSaseol.candidates.map((c) => c.text)) === JSON.stringify(['님', '다른 사람', '주추리 삼대']), '방 글: 후보 글이 spec 9의 셋이다');
  ok(roomSaseol.question === '무엇을 보게 될까?', '방 글: 예측 질문이 spec 9 그대로다');
  ok(IDS.every((id) => typeof roomSaseol.reactions[id] === 'string' && roomSaseol.reactions[id].length > 0), '방 글: 후보마다 공개 때 건네는 말이 있다');
  const pre = [roomSaseol.intro, roomSaseol.runHint.beat, roomSaseol.runHint.noBeat, roomSaseol.stopLine, roomSaseol.question].join(' ');
  ok(leakProblems(pre).length === 0, '방 글: 예측 전 글이 반전을 드러내지 않는다');
  ok(scoreWordProblems(JSON.stringify(roomSaseol)).length === 0, '방 글: 점수 말이 없다');
  ok(MID.reversal && REV === 30, '노래 데이터: 중장 반전 표시(fromFoot 30)가 있다');
}

// ── 브라우저에서 방을 끝까지 ──

const server = await startServer();
const games = [];

async function open(viewport, opts = {}) {
  const g = await openGame(server.url, { path: PAGE, viewport, ...opts });
  games.push(g);
  await g.page.waitForFunction(() => window.__r?.ready === true, null, { timeout: 20000 });
  return g;
}

const phase = (page) => page.evaluate(() => document.querySelector('.rs-room')?.dataset.phase ?? null);
const waitPhase = (page, p, timeout = 30000) => page.waitForSelector(`.rs-room[data-phase="${p}"]`, { timeout });
const textOf = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);

// 글 상자의 음보 읽기: [{ u, f, orig, read, hit }]
const feetOf = (page) => page.evaluate(() => [...document.querySelectorAll('.rs-room .rs-text .rs-foot')].map((e) => ({
  u: Number(e.dataset.u), f: Number(e.dataset.f), orig: e.querySelector('.rs-orig')?.textContent ?? null, read: e.querySelector('.rs-read')?.textContent ?? null, hit: e.classList.contains('is-hit'),
})));

function feetMatch(list, u, from, to) {
  const want = SONG.units[u].feet.slice(from, to);
  const got = list.filter((x) => x.u === u).sort((a, b) => a.f - b.f);
  if (got.length !== want.length) return false;
  return got.every((x, i) => x.f === from + i && x.orig === want[i].original && x.read === want[i].reading);
}

// 박자 없는 달리기를 실제 입력으로: 'click' | 'key' | 'tap'
async function runUntimed(page, how, max = 80) {
  for (let i = 0; i < max; i++) {
    if ((await phase(page)) !== 'run') return i;
    const btn = page.locator('.rs-room .rs-run');
    if (how === 'tap') await btn.tap();
    else if (how === 'key') { await btn.focus(); await page.keyboard.press('Space'); }
    else await btn.click();
  }
  return max;
}

// 방 하나를 처음부터 끝까지. o: { label, start: {...}, run: 'auto'|'click'|'key'|'tap', choice, how: 'click'|'tap' }
async function playThrough(g, o) {
  const { page } = g;
  const L = o.label;
  await page.evaluate((s) => window.__r.start(s), o.start ?? {});
  await waitPhase(page, 'intro');
  // 처음: 초장과 그 풀이, 중장은 아직 없다
  let feet = await feetOf(page);
  ok(feetMatch(feet, 0, 0, 4) && !feet.some((x) => x.u === 1), L + ': 처음에는 초장만 노래 데이터 그대로 보인다');
  ok((await textOf(page, '.rs-room .rs-gloss[data-kind="first"]')) === SONG.units[0].gloss, L + ': 초장 풀이가 데이터 그대로다');
  ok(layoutProblems(await page.evaluate(measureLayout)).length === 0, L + ': 처음 화면 배치 ' + layoutProblems(await page.evaluate(measureLayout)).join(' / '));
  const press = (sel) => (o.how === 'tap' ? page.locator(sel).tap() : page.locator(sel).click());
  await press('.rs-room .rs-start');
  await waitPhase(page, 'run');
  const runMode = await page.evaluate(() => document.querySelector('.rs-room').dataset.runMode);
  ok(runMode === (o.run === 'auto' ? 'beat' : 'untimed'), L + ': 달리기 방식이 ' + runMode);
  ok(layoutProblems(await page.evaluate(measureLayout)).length === 0, L + ': 달리는 화면 배치 ' + layoutProblems(await page.evaluate(measureLayout)).join(' / '));
  if (o.midSwitch) {
    await page.waitForFunction(() => document.querySelectorAll('.rs-room .rs-foot[data-u="1"]').length >= 8, null, { timeout: 20000 });
    await page.evaluate(() => window.__r.engine.setSlashMode(true));
    await page.waitForSelector('.rs-room[data-run-mode="untimed"]', { timeout: 5000 });
    ok(true, L + ': 달리는 도중 빗금 모드로 바뀌면 박자 없는 방식으로 이어진다');
    await runUntimed(page, 'click');
  } else if (o.run !== 'auto') {
    const taps = await runUntimed(page, o.run);
    ok(taps === REV, L + ': 실제 입력 ' + REV + '번으로 반전 앞까지 달린다(' + taps + '번)');
  }
  await waitPhase(page, 'predict', 40000);

  // 멈춤: 반전 앞까지만
  feet = await feetOf(page);
  ok(feetMatch(feet, 1, 0, REV), L + ': 중장 음보 0~' + (REV - 1) + '이 노래 데이터 그대로 보인다');
  const textBefore = await textOf(page, '.rs-room .rs-text');
  const leaks = leakProblems(textBefore);
  ok(leaks.length === 0, L + ': 예측 전에는 반전 뒤 글·전체 풀이·종장이 보이지 않는다 ' + leaks.join(' / '));
  ok((await textOf(page, '.rs-room .rs-gloss[data-kind="before"]')) === MID.reversal.glossBefore, L + ': 반전 앞까지의 풀이(glossBefore)가 데이터 그대로다');
  if (o.run === 'auto' && !o.midSwitch) {
    const hits = feet.filter((x) => x.u === 1 && x.hit).length;
    ok(hits >= REV - 3, L + ': 박에 맞춘 두드림이 음보에 표시된다(' + hits + '/' + REV + ')');
    const plays = await page.evaluate(() => window.__r.auto.plays);
    const ran = plays.flat().filter((b) => b.unit === 1 && b.foot < 30).map((b) => b.foot);
    ok(JSON.stringify(ran) === JSON.stringify([...Array(REV).keys()]), L + ': 낭송이 중장 0~' + (REV - 1) + '음보를 차례로 한 번씩 낸다');
  }
  if (o.run !== 'auto' && !o.midSwitch) ok(!feet.some((x) => x.hit), L + ': 박자 없는 방식에는 박 표시가 없다');
  const q = await page.evaluate(() => ({
    question: document.querySelector('.rs-room .rs-question')?.textContent ?? '',
    choices: [...document.querySelectorAll('.rs-room .rs-choice')].map((b) => ({ id: b.dataset.id, text: b.querySelector('.rs-choice-text')?.textContent ?? '' })),
  }));
  ok(q.question.includes('무엇을 보게 될까?'), L + ': "무엇을 보게 될까?"를 묻는다');
  ok(JSON.stringify(q.choices.map((c) => c.id)) === JSON.stringify(IDS) && q.choices.every((c, i) => c.text === roomSaseol.candidates[i].text), L + ': 후보 셋(님 / 다른 사람 / 주추리 삼대)');
  ok(layoutProblems(await page.evaluate(measureLayout)).length === 0, L + ': 예측 화면 배치 ' + layoutProblems(await page.evaluate(measureLayout)).join(' / '));
  const scene0 = await page.evaluate(() => window.__r.sceneInfo());
  const veil0 = await page.evaluate(() => { const v = document.querySelector('.rs-room .rs-veil'); return v ? !v.classList.contains('is-gone') && getComputedStyle(v).display !== 'none' : null; });
  if (scene0) ok(scene0.named['rs-veil']?.visible === true && scene0.named['rs-veil'].opacity > 0.5, L + ': 3D: 공개 전에는 서 있는 것이 거먹한 그림자로 가려져 있다');
  else ok(veil0 === true, L + ': 2D: 공개 전에는 서 있는 것이 그림자로 가려져 있다');

  // 예측 → 공개
  await press(`.rs-room .rs-choice[data-id="${o.choice}"]`);
  await waitPhase(page, 'reveal');
  ok(await page.evaluate(() => window.__r.state.result === null), L + ': 예측만으로는 방이 끝나지 않는다');
  feet = await feetOf(page);
  ok(feetMatch(feet, 1, 0, MID.feet.length), L + ': 공개 뒤 반전 음보(' + REV + '~)까지 중장 전체가 데이터 그대로다');
  ok((await textOf(page, '.rs-room .rs-gloss[data-kind="middle"]')) === MID.gloss, L + ': 중장 전체 풀이가 데이터 그대로다');
  const chosen = roomSaseol.candidates.find((c) => c.id === o.choice);
  const predicted = await textOf(page, '.rs-room .rs-predicted');
  ok(predicted?.includes(chosen.text) && predicted.includes(roomSaseol.reactions[o.choice]), L + ': 고른 예측과 그에 건네는 말이 보인다');
  ok(!feet.some((x) => x.u === 2), L + ': 종장은 아직이다');
  ok(layoutProblems(await page.evaluate(measureLayout)).length === 0, L + ': 공개 화면 배치 ' + layoutProblems(await page.evaluate(measureLayout)).join(' / '));
  await page.waitForTimeout(o.start?.reduceMotion ? 50 : 1300);
  const scene1 = await page.evaluate(() => window.__r.sceneInfo());
  if (scene1) ok(scene1.named['rs-veil']?.visible === false || scene1.named['rs-veil']?.opacity < 0.05, L + ': 3D: 공개되면 그림자가 걷힌다');
  else ok(await page.evaluate(() => document.querySelector('.rs-room .rs-veil')?.classList.contains('is-gone') === true), L + ': 2D: 공개되면 그림자가 걷힌다');

  // 종장
  await press('.rs-room .rs-next');
  await waitPhase(page, 'final');
  feet = await feetOf(page);
  ok(feetMatch(feet, 2, 0, 4), L + ': 종장 원문·오늘 소리가 데이터 그대로다');
  ok((await textOf(page, '.rs-room .rs-gloss[data-kind="final"]')) === SONG.units[2].gloss, L + ': 종장 풀이(해학)가 데이터 그대로다');
  ok((await textOf(page, '.rs-room .rs-humor'))?.includes(roomSaseol.humorNote), L + ': 종장의 해학을 짚는 말이 보인다');
  ok(layoutProblems(await page.evaluate(measureLayout)).length === 0, L + ': 종장 화면 배치 ' + layoutProblems(await page.evaluate(measureLayout)).join(' / '));
  const allText = await textOf(page, '.rs-room');
  ok(scoreWordProblems(allText).length === 0, L + ': 화면에 점수 말이 없다 ' + scoreWordProblems(allText).join(' '));
  if (scene1) {
    const s = await page.evaluate(() => window.__r.sceneInfo());
    ok(s.maxCalls > 0 && s.maxCalls <= BUDGET, L + ': 그리기 호출 ' + s.maxCalls + '회(예산 ' + BUDGET + ')');
  }
  await press('.rs-room .rs-finish');
  await page.waitForFunction(() => window.__r.state.running === false, null, { timeout: 5000 });
  const result = await page.evaluate(() => window.__r.state.result);
  const rp = recordProblems(result, o.choice);
  ok(rp.length === 0, L + ': 기록이 7.3 약속대로다 ' + JSON.stringify(result) + ' ' + rp.join(' / '));
  ok(result?.record?.predictionText === chosen.text, L + ': predictionText = ' + chosen.text);
  const after = await page.evaluate(() => ({ kids: document.getElementById('room').childElementCount, scene: window.__r.sceneInfo(), cam0: window.__r.cameraStart }));
  ok(after.kids === 0, L + ': 마치면 방 화면을 치운다');
  if (after.scene) {
    ok(after.scene.children === 0, L + ': 마치면 3D 물체를 치운다');
    ok(after.scene.camera.every((v, i) => Math.abs(v - after.cam0[i]) < 1e-6), L + ': 마치면 카메라를 제자리로 돌린다');
  }
  return result;
}

try {
  // 1) 크롬북 3D, 박자 두드리기(낭송에 맞춰 자동으로 두드림), 예측 '님'
  {
    const g = await open(VIEWPORTS.chromebook);
    ok((await g.page.evaluate(() => window.__r.mode)) === '3d', '크롬북: 3D로 열린다');
    await playThrough(g, { label: '크롬북 3D 박자', start: { autoTap: true }, run: 'auto', choice: 'nim' });
    const plays = await g.page.evaluate(() => window.__r.auto.plays.flat());
    ok(plays.some((b) => b.unit === 1 && b.foot === REV) && plays.some((b) => b.unit === 2), '크롬북 3D 박자: 공개 뒤 반전 음보와 종장을 낭송한다');
    const sc = await g.page.evaluate(() => window.__r.sceneInfo());
    ok(sc.maxCalls <= BUDGET, '크롬북 3D: 그리기 호출 최대 ' + sc.maxCalls + '회');

    // 중단: 달리는 도중 → AbortError, 화면·물체 치움, 다시 열면 처음부터
    await g.page.evaluate(() => window.__r.start({ slash: true }));
    await waitPhase(g.page, 'intro');
    await g.page.locator('.rs-room .rs-start').click();
    await waitPhase(g.page, 'run');
    for (let i = 0; i < 5; i++) await g.page.locator('.rs-room .rs-run').click();
    ok((await g.page.evaluate(() => document.querySelectorAll('.rs-room .rs-foot[data-u="1"]').length)) === 5, '중단 전: 다섯 음보를 달렸다');
    await g.page.evaluate(() => window.__r.abort());
    await g.page.waitForFunction(() => window.__r.state.running === false, null, { timeout: 5000 });
    const ab = await g.page.evaluate(() => ({ err: window.__r.state.error, res: window.__r.state.result, kids: document.getElementById('room').childElementCount, scene: window.__r.sceneInfo(), cam0: window.__r.cameraStart }));
    ok(ab.err?.name === 'AbortError' && ab.res === null, '중단하면 AbortError로 끝나고 기록이 없다');
    ok(ab.kids === 0 && ab.scene.children === 0, '중단하면 방 화면과 3D 물체를 치운다');
    ok(ab.scene.camera.every((v, i) => Math.abs(v - ab.cam0[i]) < 1e-6), '중단하면 카메라를 제자리로 돌린다');
    await g.page.evaluate(() => window.__r.start({ slash: true }));
    await waitPhase(g.page, 'intro');
    ok((await g.page.evaluate(() => document.querySelectorAll('.rs-room .rs-foot[data-u="1"]').length)) === 0, '다시 열면 처음부터 한다(달린 음보 없음)');
    // 중단: 처음 화면에서
    await g.page.evaluate(() => window.__r.abort());
    await g.page.waitForFunction(() => window.__r.state.running === false, null, { timeout: 5000 });
    ok((await g.page.evaluate(() => window.__r.state.error?.name)) === 'AbortError', '처음 화면에서 중단해도 AbortError로 끝난다');
    // 이미 중단된 신호
    await g.page.evaluate(() => window.__r.start({ preAbort: true }));
    await g.page.waitForFunction(() => window.__r.state.running === false, null, { timeout: 5000 });
    ok((await g.page.evaluate(() => [window.__r.state.error?.name, document.getElementById('room').childElementCount])).join() === 'AbortError,0', '이미 중단된 신호면 바로 AbortError로 끝난다');
    // 음성: 반전 표시가 없는 노래
    await g.page.evaluate(() => window.__r.start({ dropReversal: true }));
    await g.page.waitForFunction(() => window.__r.state.running === false, null, { timeout: 5000 });
    const bad = await g.page.evaluate(() => [window.__r.state.error, document.getElementById('room').childElementCount]);
    ok(bad[0] && bad[0].name !== 'AbortError' && bad[1] === 0, '음성: 반전 표시가 없는 노래면 방이 오류로 끝난다(' + bad[0]?.message + ')');

    ok(g.external.length === 0, '크롬북 3D: 바깥 요청이 없다 ' + g.external.join(', '));
    ok(g.errors.length === 0, '크롬북 3D: 콘솔 오류가 없다 ' + g.errors.slice(0, 3).join(' | '));
    await g.close();
  }

  // 2) 휴대폰 3D, 빗금 모드(박자 없음), 글자 1.3, 터치로 달림, 예측 '주추리 삼대'
  {
    const g = await open(VIEWPORTS.phone, { touch: true });
    ok((await g.page.evaluate(() => window.__r.mode)) === '3d', '휴대폰: 3D로 열린다');
    await playThrough(g, { label: '휴대폰 3D 빗금', start: { slash: true, textScale: 1.3 }, run: 'tap', how: 'tap', choice: 'jujuri-samdae' });
    ok(g.external.length === 0, '휴대폰 3D: 바깥 요청이 없다');
    ok(g.errors.length === 0, '휴대폰 3D: 콘솔 오류가 없다 ' + g.errors.slice(0, 3).join(' | '));
    await g.close();
  }

  // 3) 크롬북 강제 2D, 소리 끔(박자 없음), 키보드로 달림, 예측 '다른 사람' / 도중에 빗금 모드로 바뀜
  {
    const g = await open(VIEWPORTS.chromebook, { disable3d: true });
    ok((await g.page.evaluate(() => window.__r.mode)) === '2d', '3D를 끄면 2D 그림 판으로 열린다');
    await g.page.evaluate(() => window.__r.start({ muted: true }));
    await waitPhase(g.page, 'intro');
    const bg = await g.page.evaluate(() => getComputedStyle(document.querySelector('.rs-room .rs-board')).backgroundImage);
    ok(bg.includes('board/room-saseol'), '2D: 그림 판 board/room-saseol을 쓴다');
    await g.page.evaluate(() => window.__r.abort());
    await g.page.waitForFunction(() => window.__r.state.running === false);
    await playThrough(g, { label: '크롬북 2D 소리 끔', start: { muted: true }, run: 'key', choice: 'other-person' });
    await playThrough(g, { label: '크롬북 2D 박자→빗금', start: { autoTap: true }, run: 'auto', midSwitch: true, choice: 'nim' });
    ok(g.external.length === 0, '크롬북 2D: 바깥 요청이 없다');
    ok(g.errors.length === 0, '크롬북 2D: 콘솔 오류가 없다 ' + g.errors.slice(0, 3).join(' | '));
    await g.close();
  }

  // 4) 휴대폰 강제 2D, 박자 두드리기, 글자 1.3, 움직임 줄이기, 예측 '님'
  {
    const g = await open(VIEWPORTS.phone, { disable3d: true, touch: true });
    await playThrough(g, { label: '휴대폰 2D 박자', start: { autoTap: true, textScale: 1.3, reduceMotion: true }, run: 'auto', how: 'tap', choice: 'nim' });
    ok(g.external.length === 0, '휴대폰 2D: 바깥 요청이 없다');
    ok(g.errors.length === 0, '휴대폰 2D: 콘솔 오류가 없다 ' + g.errors.slice(0, 3).join(' | '));
    await g.close();
  }
} catch (e) {
  failures++;
  console.error('✗ 점검 중 예외: ' + (e?.stack ?? e));
} finally {
  for (const g of games) await g.close().catch(() => {});
  await server.close();
}

if (failures) {
  console.error(`\n작품 방 「님이 오마 하거늘」 점검 실패 ${failures}건`);
  process.exitCode = 1;
} else {
  console.log('\n작품 방 「님이 오마 하거늘」 점검 통과');
}
