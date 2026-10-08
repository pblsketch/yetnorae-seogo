// 작품 방 「상춘곡」 점검(T15, spec 9·14·15·20, js/data/README.md 7.3·'추가 제안(F1)').
// 1) 방 글과 진행(Node): 머무는 곳이 작품의 차례(수간모옥 → 정자 → 시냇가 → 산봉우리 → 마무리)이고
//    교과서 대목은 정자에서 끝나며, 시어는 그 행 원문에 그대로 있고, 기록은 7.3 모양이다. 음성 사례 포함.
// 2) 브라우저: 점검 페이지(tests/pages/room-gasa.html)에서 실제 노래 데이터와 실제 소리 엔진으로 방을 띄워
//    3D와 강제 2D, 1366×768과 844×390에서 실제 조작(클릭·탭·키)으로 끝까지 가고, 기록·원문·'교과서 밖 원문' 표시,
//    박자 없는 길, 중단 뒤 처음부터, 바깥 요청·콘솔 오류·점수 말 없음을 확인한다.
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { songs as gasaSongs } from '../js/data/songs/gasa.js';
import { roomGasa } from '../js/data/rooms-gasa.js';
import * as M from '../js/rooms/gasa-model.js';
import { squash } from '../js/core/song-shape.js';

const PAGE = 'tests/pages/room-gasa.html';
const song = gasaSongs.find((s) => s.id === 'sangchungok');
const rowOf = (u) => song.units[u].feet.map((f) => f.original).join(' ');
const clone = (v) => JSON.parse(JSON.stringify(v));
const SCORE_WORDS = /점수|등급|순위|정답|오답|실패|게임\s*오버|시간\s*제한|타이머|맞았|틀렸/;
const hasScoreWord = (t) => SCORE_WORDS.test(String(t ?? ''));

let failures = 0;
function check(cond, msg) {
  try { assert(cond, msg); } catch (e) { failures++; console.error(e.message); }
}

// ── 1) 방 글과 진행(Node) ──
function checkModel() {
  console.log('\n▶ 방 글과 진행(Node)');
  check(!!song, '노래 데이터에 「상춘곡」(sangchungok)이 있다');
  const errs = M.checkRoomData(roomGasa, song);
  check(errs.length === 0, '방 글이 노래 데이터와 맞다 ' + errs.slice(0, 3).join(' | '));

  const ids = roomGasa.stations.map((s) => s.id);
  check(JSON.stringify(ids) === JSON.stringify(['hut', 'pavilion', 'stream', 'peak', 'ending']), '머무는 곳이 작품 차례다: 수간모옥 → 정자 → 시냇가 → 산봉우리 → 마무리');
  const st = Object.fromEntries(roomGasa.stations.map((s) => [s.id, s]));
  const firstBeyond = song.units.findIndex((u) => u.beyondTextbook === true);
  check(firstBeyond === 21 && st.pavilion.to === firstBeyond - 1, '교과서 대목(1~21행)은 정자에서 끝난다');
  check(st.stream.from === firstBeyond, '시냇가부터 교과서 밖 원문(22행~)이다');
  check(song.units.slice(firstBeyond).every((u) => u.beyondTextbook === true) && song.units.slice(0, firstBeyond).every((u) => !u.beyondTextbook), '교과서 밖 원문은 노래 끝에 모여 있다');
  check(rowOf(st.hut.from + 4).includes('수간모옥') && st.hut.from === 0, '수간모옥에서 출발한다(5행 수간모옥)');
  check(rowOf(st.pavilion.from).includes('정자'), '정자는 14행(정자애 안자 보니)에서 시작한다');
  check([...Array(st.stream.to - st.stream.from + 1)].some((_, i) => rowOf(st.stream.from + i).includes('시냇')), '시냇가 대목에 시냇가가 나온다');
  check([...Array(st.peak.to - st.peak.from + 1)].some((_, i) => rowOf(st.peak.from + i).includes('봉두')), '산봉우리 대목(31~35행)에 봉두가 나온다');
  check(st.peak.from === 30 && st.peak.to === 34, '산봉우리는 31~35행이다');
  check(rowOf(roomGasa.letGo.unit).includes('공명') && rowOf(roomGasa.letGo.unit).includes('부귀') && roomGasa.letGo.unit === 35, '공명·부귀 행(36행)에서 두 말을 떠나보낸다');
  check(roomGasa.finale.keep.some((k) => k.unit === 37 && rowOf(37).includes(k.text)), '마무리에 단표누항(38행)이 나온다');
  check(st.ending.to === song.units.length - 1, '마무리는 끝 행(39행)까지다');
  for (const s of roomGasa.stations.filter((x) => x.words.length)) {
    const bad = s.words.filter((w) => !squash(rowOf(w.unit)).includes(squash(w.text)) || w.unit < s.from || w.unit > s.to);
    check(bad.length === 0, s.name + ': 시어 ' + s.words.length + '개가 모두 그곳 행 원문에 그대로 있다 ' + bad.map((w) => w.text).join(','));
  }

  // 음성 사례: 검사가 실제로 잡는지
  const neg = (label, mutate) => {
    const r = clone(roomGasa);
    r.text = roomGasa.text;
    mutate(r);
    check(M.checkRoomData(r, song).length > 0, '음성: 잡는다 — ' + label);
  };
  neg('행 원문에 없는 시어', (r) => { r.stations[0].words[0].text = '가을바람'; });
  neg('머무는 곳 밖 행의 시어', (r) => { r.stations[0].words[0].unit = 21; });
  neg('행이 빠진 나눔', (r) => { r.stations[1].from = 14; });
  neg('작품 차례와 다른 순서', (r) => { [r.stations[1], r.stations[2]] = [r.stations[2], r.stations[1]]; });
  neg('시어가 없는 머무는 곳', (r) => { r.stations[2].words = []; });
  neg('같은 id의 시어', (r) => { r.stations[3].words[1].id = r.stations[3].words[0].id; });
  neg('행 원문에 없는 떠나보낼 말', (r) => { r.letGo.words[0].text = '벼슬'; });

  // 진행: 모두 모으는 길
  const all = M.createRoomState(roomGasa, song);
  check(all.phase === 'intro' && all.unit === -1 && !all.canStep(), '처음에는 소개 단계이고 걷지 못한다');
  check(all.step() === null && all.unit === -1, '음성: 시작 전 걸음은 무시된다');
  all.begin();
  let guard = 0;
  const seen = [];
  while (all.phase !== 'finale' && guard++ < 200) {
    if (all.phase === 'collect') {
      check(!all.canStep(), all.stationInfo().name + ': 시어를 하나도 모으지 않으면 다음 곳으로 걷지 못한다');
      const other = roomGasa.stations.find((s) => s.words.length && s.id !== all.stationInfo().id).words[0].id;
      check(all.collect(other) === false, '음성: 다른 곳의 시어는 모아지지 않는다');
      const left = all.collectables().map((w) => w.id).reverse();
      for (const id of left) all.collect(id);
      check(all.collect(left[0]) === false, '음성: 같은 시어를 두 번 모으지 않는다');
      seen.push(all.stationInfo().id);
    } else if (all.phase === 'letgo') {
      check(!all.canStep(), '공명·부귀를 떠나보내기 전에는 걷지 못한다');
      for (const w of all.letGoLeft()) all.letGo(w.id);
    }
    const before = all.unit;
    const r = all.step();
    if (r && all.unit !== before + 1) check(false, '한 걸음에 한 행씩 간다(' + (before + 2) + '행)');
  }
  check(JSON.stringify(seen) === JSON.stringify(['hut', 'pavilion', 'stream', 'peak']), '네 곳(수간모옥·정자·시냇가·산봉우리)에서 시어를 모은다');
  check(all.unit === song.units.length - 1, '끝 행까지 걸었다');
  const rec = all.finish();
  const allWords = roomGasa.stations.flatMap((s) => s.words.map((w) => w.text));
  check(JSON.stringify(Object.keys(rec)) === JSON.stringify(['room', 'words']) && rec.room === 'gasa', '기록 모양이 7.3의 { room: \'gasa\', words }다');
  check(JSON.stringify(rec.words) === JSON.stringify(allWords), '모은 시어가 작품 차례대로 기록된다(누른 차례와 상관없이)');
  check(M.checkRecord(rec, roomGasa).length === 0, '기록 검사 통과');
  check(all.phase === 'done' && all.finish() === null, '마친 뒤에는 다시 마치지 않는다');

  // 진행: 곳마다 하나만 모으는 길
  const one = M.createRoomState(roomGasa, song);
  one.begin();
  check(one.finish() === null, '음성: 끝 행 전에는 마칠 수 없다');
  guard = 0;
  while (one.phase !== 'finale' && guard++ < 200) {
    if (one.phase === 'collect') one.collect(one.collectables().at(-1).id);
    if (one.phase === 'letgo') for (const w of one.letGoLeft()) one.letGo(w.id);
    one.step();
  }
  const rec1 = one.finish();
  const lastOf = roomGasa.stations.filter((s) => s.words.length).map((s) => s.words.at(-1).text);
  check(JSON.stringify(rec1.words) === JSON.stringify(lastOf), '곳마다 하나만 모으면 네 개가 남는다');

  // 기록 검사 음성 사례
  const badRecs = [
    ['빈 시어', { room: 'gasa', words: [] }],
    ['다른 방', { ...rec1, room: 'sijo' }],
    ['덧붙은 열쇠', { ...rec1, score: 3 }],
    ['방 글에 없는 시어', { room: 'gasa', words: [...rec1.words, '가을바람'] }],
    ['겹친 시어', { room: 'gasa', words: [...rec1.words, rec1.words[0]] }],
    ['한 곳이 빠진 기록', { room: 'gasa', words: rec1.words.slice(1) }],
    ['배열이 아닌 words', { room: 'gasa', words: 'abc' }],
  ];
  for (const [label, r] of badRecs) check(M.checkRecord(r, roomGasa).length > 0, '음성: 기록 검사가 잡는다 — ' + label);

  // 길 위치: 걸을수록 앞으로, 곳의 끝 행에서 그곳에 닿는다
  const ss = [-1, ...song.units.map((_, i) => i)].map((u) => M.routeProgress(roomGasa, u));
  check(ss.every((v, i) => i === 0 || v >= ss[i - 1]) && ss[0] === 0, '걸을수록 길 위치가 앞으로 간다');
  check(roomGasa.stations.slice(1).every((s, k) => Math.abs(M.routeProgress(roomGasa, s.to) - (k + 1)) < 1e-9), '곳마다 끝 행에서 그곳에 닿는다');
  check(!hasScoreWord(JSON.stringify(roomGasa, (k, v) => (typeof v === 'function' ? v(1) : v))), '방 글에 점수·정답 같은 말이 없다');
  check(hasScoreWord('정답입니다'), '음성: 점수 말 찾기가 실제로 잡는다');
}

// ── 2) 브라우저 ──
const attr = (page, name) => page.$eval('.rg-room', (e, n) => e.getAttribute(n), name);

async function readRow(page) {
  return page.$eval('.rg-row', (r) => ({
    no: r.querySelector('.rg-row-no')?.textContent ?? '',
    original: r.querySelector('.rg-original')?.textContent ?? '',
    gloss: r.querySelector('.rg-gloss')?.textContent ?? '',
    badge: r.querySelector('.rg-badge') ? getComputedStyle(r.querySelector('.rg-badge')).display !== 'none' && r.querySelector('.rg-badge').textContent : null,
    source: r.querySelector('.rg-source')?.textContent ?? '',
  }));
}

function rowProblems(u, row) {
  const unit = song.units[u];
  const out = [];
  if (!row.no.includes(String(u + 1))) out.push(u + 1 + '행 번호');
  if (row.original !== rowOf(u)) out.push(u + 1 + '행 원문');
  if (row.gloss !== unit.gloss) out.push(u + 1 + '행 풀이');
  if (unit.beyondTextbook) {
    if (row.badge !== '교과서 밖 원문') out.push(u + 1 + '행 교과서 밖 표시 없음');
    if (!row.source.includes(unit.sourceNote)) out.push(u + 1 + '행 출처 없음');
  } else if (row.badge) out.push(u + 1 + '행 교과서 대목에 교과서 밖 표시');
  return out;
}

// 화면 점검: 버튼 크기·화면 안·상황 버튼 구석·넘침
async function layoutProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const room = document.querySelector('.rg-room');
    const box = room.getBoundingClientRect();
    if (room.scrollHeight > room.clientHeight + 1 || room.scrollWidth > room.clientWidth + 1) out.push('방이 넘침');
    for (const b of room.querySelectorAll('button')) {
      const r = b.getBoundingClientRect();
      if (!r.width || getComputedStyle(b).visibility === 'hidden') continue;
      if (r.width < 47.5 || r.height < 47.5) out.push('작은 버튼 ' + b.className + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) out.push('화면 밖 버튼 ' + b.className);
      const cx = (r.left + r.right) / 2 - box.left; const cy = (r.top + r.bottom) / 2 - box.top;
      if (cx > box.width * 0.78 && cy > box.height * 0.78) out.push('상황 버튼 구석의 버튼 ' + b.className);
    }
    for (const t of room.querySelectorAll('.rg-original, .rg-gloss, .rg-hint, .rg-finale h2')) {
      if (t.scrollWidth > t.clientWidth + 1) out.push('가로로 잘린 글 ' + t.className);
    }
    return out;
  });
}

async function clickLike(page, sel, how) {
  if (how === 'tap') await page.tap(sel);
  else if (how === 'key') { await page.focus(sel); await page.keyboard.press('Enter'); }
  else await page.click(sel);
}

// 방을 끝까지 걷는다. pick(곳, 남은 시어) → 모을 id 목록(누를 차례)
async function walkThrough(page, { pick, how = 'click', label, beat = false, layoutAt = [] }) {
  const problems = [];
  const layout = [];
  let rows = 0;
  let maxCalls = 0;
  const collectedSeen = [];
  const sampleCalls = async () => {
    const c = await page.evaluate(() => Math.max(Number(document.querySelector('.rg-room')?.dataset.drawCalls ?? 0), Number(window.__r.hostCalls() ?? 0)));
    maxCalls = Math.max(maxCalls, c);
  };
  await clickLike(page, '.rg-begin', how === 'key' ? 'click' : how);
  await page.waitForFunction(() => document.querySelector('.rg-room')?.getAttribute('data-phase') === 'walk');
  const shots = new Set(layoutAt);
  // 박자 방식이면 걷는 동안(낭송 중) 다음 걸음이 막혀 있어야 한다: 걸음 단추가 열릴 때 끝나지 않은 낭송이 있으면 적는다
  await page.evaluate(() => {
    window.__openWhilePlaying = [];
    const b = document.querySelector('.rg-step');
    new MutationObserver(() => {
      if (!b.disabled && window.__r.plays.some((p) => p.end === null)) window.__openWhilePlaying.push(document.querySelector('.rg-room')?.dataset.unit);
    }).observe(b, { attributes: true, attributeFilter: ['disabled'] });
  });
  try {
    await walkLoop();
  } catch (e) {
    const where = await page.evaluate(() => JSON.stringify({ ...(document.querySelector('.rg-room')?.dataset ?? {}), hint: document.querySelector('.rg-hint')?.textContent, plays: window.__r.plays.slice(-2) })).catch(() => '?');
    throw new Error(label + ': 걷다가 멈춤 ' + where + ' / ' + e.message);
  }
  async function walkLoop() {
  for (let guard = 0; guard < 400; guard++) {
    const phase = await attr(page, 'data-phase');
    if (phase === 'walk') {
      const u = Number(await attr(page, 'data-unit'));
      await page.waitForFunction(() => !document.querySelector('.rg-step').disabled);
      await clickLike(page, '.rg-step', how);
      await page.waitForFunction((n) => Number(document.querySelector('.rg-room').getAttribute('data-unit')) === n, u + 1);
      problems.push(...rowProblems(u + 1, await readRow(page)));
      rows++;
      if ((u + 1) % 5 === 0) await sampleCalls();
      if (shots.has(u + 1)) layout.push(...(await layoutProblems(page)).map((p) => (u + 2) + '행: ' + p));
      await page.waitForFunction(() => { const r = document.querySelector('.rg-room'); return r.getAttribute('data-busy') !== '1'; });
    } else if (phase === 'collect') {
      const station = await attr(page, 'data-station');
      const chips = await page.$$eval('.rg-chip', (cs) => cs.map((c) => ({ id: c.dataset.wordId, text: c.textContent })));
      const stepDisabled = await page.$eval('.rg-step', (b) => b.disabled);
      if (!stepDisabled) problems.push(station + ': 시어를 모으기 전에 걸음이 열려 있음');
      const want = pick(station, chips);
      for (const id of want) {
        await clickLike(page, `.rg-chip[data-word-id="${id}"]`, how);
        await page.waitForFunction((i) => !document.querySelector(`.rg-chip[data-word-id="${i}"]`) || document.querySelector(`.rg-chip[data-word-id="${i}"]`).classList.contains('is-taken'), id);
        const mark = await page.$eval('.rg-row', (r) => r.querySelector('mark')?.textContent ?? '');
        const w = chips.find((c) => c.id === id);
        if (mark !== w.text) problems.push(station + ': 모은 시어 ' + w.text + '가 원문에서 표시되지 않음(' + mark + ')');
        collectedSeen.push(w.text);
      }
      if (shots.has(station)) layout.push(...(await layoutProblems(page)).map((p) => station + ': ' + p));
      await page.waitForFunction(() => !document.querySelector('.rg-step').disabled);
      const u = Number(await attr(page, 'data-unit'));
      await clickLike(page, '.rg-step', how);
      await page.waitForFunction((n) => Number(document.querySelector('.rg-room').getAttribute('data-unit')) === n, u + 1);
      problems.push(...rowProblems(u + 1, await readRow(page)));
      rows++;
      await page.waitForFunction(() => document.querySelector('.rg-room').getAttribute('data-busy') !== '1');
    } else if (phase === 'letgo') {
      if (!(await page.$eval('.rg-step', (b) => b.disabled))) problems.push('공명·부귀를 보내기 전에 걸음이 열려 있음');
      const ids = await page.$$eval('.rg-letgo', (cs) => cs.map((c) => c.dataset.wordId));
      if (ids.length !== 2) problems.push('떠나보낼 말이 둘이 아님: ' + ids.length);
      for (const id of ids) await clickLike(page, `.rg-letgo[data-word-id="${id}"]`, how);
      await page.waitForFunction(() => document.querySelector('.rg-room').getAttribute('data-phase') !== 'letgo');
    } else if (phase === 'finale') {
      if (shots.has('finale')) layout.push(...(await layoutProblems(page)).map((p) => '마무리: ' + p));
      const fin = await page.$eval('.rg-finale', (f) => ({ text: f.textContent, words: [...f.querySelectorAll('.rg-finale-word')].map((w) => w.textContent) }));
      if (!fin.text.includes('안빈낙도')) problems.push('마무리에 안빈낙도가 없음');
      if (!fin.text.includes('단표누항(簞瓢陋巷)')) problems.push('마무리에 단표누항이 없음');
      if (JSON.stringify(fin.words) !== JSON.stringify(expectedOrder(collectedSeen))) problems.push('마무리의 모은 시어가 다름 ' + fin.words.join(','));
      await clickLike(page, '.rg-finish', how);
      await page.waitForFunction(() => window.__r.state.settled);
      break;
    } else {
      await page.waitForTimeout(50);
    }
  }
  }
  if (beat) {
    const open = await page.evaluate(() => window.__openWhilePlaying);
    const plays = await page.evaluate(() => window.__r.plays.map((p) => p.end - p.at));
    check(open.length === 0 && plays.length === song.units.length, label + ': 낭송하는 동안에는 다음 걸음이 막혀 있다 ' + open.slice(0, 5).join(','));
    check(plays.every((ms) => ms >= 0.9 * 1000 * 3 / 4), label + ': 걸음마다 그 행의 박만큼 걷는다(빠르기 240에서 네 박 ≈ 1초, 가장 짧은 걸음 ' + Math.round(Math.min(...plays)) + 'ms)');
  }
  check(rows === song.units.length, label + ': 39행을 한 걸음에 한 행씩 모두 걸었다(' + rows + ')');
  check(problems.length === 0, label + ': 행마다 원문·풀이·\'교과서 밖 원문\' 표시와 출처가 노래 데이터와 같다 ' + problems.slice(0, 4).join(' | '));
  if (layoutAt.length) check(layout.length === 0, label + ': 버튼 48px 이상, 화면 안, 상황 버튼 구석 비움, 넘침 없음 ' + layout.slice(0, 4).join(' | '));
  return { collectedSeen, maxCalls };
}

const allTexts = roomGasa.stations.flatMap((s) => s.words.map((w) => w.text));
const expectedOrder = (texts) => allTexts.filter((t) => texts.includes(t));

async function result(page) {
  return page.evaluate(() => window.__r.state);
}

async function open(page, opts) {
  await page.waitForFunction(() => window.__r?.ready);
  const mode = await page.evaluate((o) => window.__r.open(o), opts);
  await page.waitForSelector('.rg-room .rg-begin');
  return mode;
}

async function scoreWordsIn(page) {
  return page.evaluate((src) => {
    const re = new RegExp(src);
    const room = document.querySelector('.rg-room');
    const texts = [room?.innerText ?? '', ...[...(room?.querySelectorAll('[aria-label],[title]') ?? [])].map((e) => (e.getAttribute('aria-label') ?? '') + (e.getAttribute('title') ?? ''))];
    return texts.filter((t) => re.test(t));
  }, SCORE_WORDS.source);
}

async function runBrowser(server) {
  // A) 크롬북 3D, 박자 방식(빠르기 240), 모두 모으기, 클릭
  {
    console.log('\n▶ 1366×768 3D · 박자 방식 · 모두 모으기(클릭)');
    const g = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.chromebook });
    try {
      const { page } = g;
      page.setDefaultTimeout(20000);
      const mode = await open(page, { mode: 'auto', fast: true });
      check(mode === '3d' && (await attr(page, 'data-mode')) === '3d', '3D 방으로 열린다');
      check(await page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href.endsWith('/css/room-gasa.css'))), '방이 스스로 css/room-gasa.css를 붙인다');
      const introText = await page.$eval('.rg-intro', (e) => e.textContent);
      check(introText.includes('교과서 밖 원문'), '시작 안내에 교과서 밖 원문 이야기가 있다');
      // 그림판은 gasa-3d.js를 불러온 뒤에 생긴다(시작 안내는 먼저 그려진다). 생길 때까지 기다린 뒤 본다.
      await page.waitForSelector('canvas.rg-canvas', { timeout: 15000 }).catch(() => {});
      check(await page.$('canvas.rg-canvas') !== null, '3D 장면을 그린다');
      const word = await walkThrough(page, { pick: (_, chips) => chips.map((c) => c.id), label: '3D 박자', beat: true, layoutAt: [0, 21, 'stream', 'finale'] });
      const st = await result(page);
      check(st.result?.completed === true, '방을 마치면 { completed: true }로 끝난다');
      check(JSON.stringify(st.result?.record) === JSON.stringify({ room: 'gasa', words: allTexts }), '기록 = { room: \'gasa\', words: 모은 시어 전부(작품 차례) }');
      check(M.checkRecord(st.result.record, roomGasa).length === 0 && word.collectedSeen.length === allTexts.length, '기록 검사 통과');
      const plays = await page.evaluate(() => window.__r.plays.map((p) => p.units));
      check(plays.length === song.units.length && plays.every((u, i) => u.length === 1 && u[0] === i), '한 걸음마다 그 행 하나를 낭송한다(행 39개, 차례대로)');
      const missing = await page.evaluate(() => window.__r.missing.length);
      check(missing > 0, '낭송 조각이 없어도 막히지 않는다(딸깍 소리로 대신, 없는 조각 ' + missing + '개)');
      check(word.maxCalls > 0 && word.maxCalls <= 60, '그리기 호출이 60 이하(가장 많을 때 ' + word.maxCalls + ')');
      check(await page.$('.rg-room') === null, '마친 뒤 방 화면을 치운다');
      check(g.external.length === 0, '바깥 주소 요청이 없다 ' + g.external.slice(0, 2).join(', '));
      check(g.errors.length === 0, '콘솔 오류가 없다 ' + g.errors.slice(0, 3).join(' | '));
    } finally { await g.close(); }
  }

  // B) 크롬북 강제 2D, 박자 없는 방식(소리 끔), 곳마다 하나, 키보드
  {
    console.log('\n▶ 1366×768 강제 2D · 박자 없는 방식 · 곳마다 하나(키보드)');
    const g = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.chromebook, disable3d: true });
    try {
      const { page } = g;
      page.setDefaultTimeout(20000);
      const mode = await open(page, { mode: 'auto', noBeat: true, muted: true });
      check(mode === '2d' && (await attr(page, 'data-mode')) === '2d', '3D를 끈 브라우저에서 2D 그림 판 방으로 열린다');
      const board = await page.$eval('img.rg-board', (i) => ({ src: i.getAttribute('src') ?? i.src, ok: i.complete && i.naturalWidth > 0 }));
      check(board.src.endsWith('assets/img/board/room-gasa.webp') && board.ok, '2D 바탕이 board/room-gasa 그림이다');
      const s0 = Number(await page.$eval('.rg-room', (e) => e.dataset.walkerS));
      const t0 = Date.now();
      await walkThrough(page, { pick: (_, chips) => [chips[0].id], how: 'key', label: '2D 박자 없음', layoutAt: [5, 30, 'peak', 'finale'] });
      const st = await result(page);
      const firstOf = roomGasa.stations.filter((s) => s.words.length).map((s) => s.words[0].text);
      check(JSON.stringify(st.result?.record) === JSON.stringify({ room: 'gasa', words: firstOf }), '곳마다 하나만 모으면 기록에 네 개가 남는다');
      check(await page.evaluate(() => window.__r.plays.length) === 0, '박자 없는 방식에서는 낭송을 기다리지 않는다(박자 없는 길)');
      check(Date.now() - t0 < 60000, '박자 없는 길은 낭송 시간 없이 끝난다');
      check(s0 === 0, '처음 걷는 사람은 수간모옥(길 위치 0)에 있다');
      check(g.external.length === 0, '바깥 주소 요청이 없다');
      check(g.errors.length === 0, '콘솔 오류가 없다 ' + g.errors.slice(0, 3).join(' | '));
    } finally { await g.close(); }
  }

  // C) 휴대폰 3D, 박자 없는 방식, 글자 1.3, 곳마다 둘, 탭
  {
    console.log('\n▶ 844×390 3D · 박자 없는 방식 · 글자 1.3 · 곳마다 둘(탭)');
    const g = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.phone, touch: true });
    try {
      const { page } = g;
      page.setDefaultTimeout(20000);
      const mode = await open(page, { mode: 'auto', noBeat: true, textScale: 1.3, reduceMotion: true });
      check(mode === '3d', '휴대폰에서 3D 방으로 열린다');
      const intro = await layoutProblems(page);
      check(intro.length === 0, '시작 안내가 휴대폰·글자 1.3에서 넘치지 않는다 ' + intro.slice(0, 3).join(' | '));
      const w = await walkThrough(page, { pick: (_, chips) => chips.slice(0, 2).map((c) => c.id).reverse(), how: 'tap', label: '휴대폰 3D', layoutAt: [0, 12, 'hut', 25, 'stream', 36, 'finale'] });
      const st = await result(page);
      const two = roomGasa.stations.filter((s) => s.words.length).flatMap((s) => s.words.slice(0, 2).map((w) => w.text));
      check(JSON.stringify(st.result?.record?.words) === JSON.stringify(two), '거꾸로 눌러도 기록은 작품 차례다');
      check(w.maxCalls > 0 && w.maxCalls <= 60, '휴대폰에서도 그리기 호출 60 이하(' + w.maxCalls + ')');
      check(g.external.length === 0 && g.errors.length === 0, '바깥 요청·콘솔 오류가 없다 ' + g.errors.slice(0, 2).join(' | '));
    } finally { await g.close(); }
  }

  // D) 휴대폰 강제 2D, 박자 방식(빠르게), 글자 1.3, 탭 + 중간에 박자 없는 방식으로 바뀜
  {
    console.log('\n▶ 844×390 강제 2D · 박자 방식에서 박자 없는 방식으로 · 글자 1.3(탭)');
    const g = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.phone, disable3d: true, touch: true });
    try {
      const { page } = g;
      page.setDefaultTimeout(20000);
      await open(page, { mode: 'auto', fast: true, textScale: 1.3 });
      // 세 걸음은 박자 방식으로 걷고, 그 뒤 소리를 끈다(rhythm:no-beat)
      await page.tap('.rg-begin');
      for (let i = 0; i < 3; i++) {
        await page.waitForFunction(() => !document.querySelector('.rg-step').disabled);
        await page.tap('.rg-step');
        await page.waitForFunction((n) => Number(document.querySelector('.rg-room').dataset.unit) === n, i);
      }
      await page.waitForFunction(() => !document.querySelector('.rg-step').disabled);
      const before = await page.evaluate(() => window.__r.plays.length);
      check(before === 3, '박자 방식에서는 걸음마다 낭송한다(' + before + ')');
      await page.evaluate(() => { window.__r.engine.setMuted(true); });
      const s1 = Number(await page.$eval('.rg-room', (e) => e.dataset.walkerS));
      await page.tap('.rg-step');
      await page.waitForFunction(() => Number(document.querySelector('.rg-room').dataset.unit) === 3);
      check(await page.evaluate(() => window.__r.plays.length) === 3, '소리를 끄면(rhythm:no-beat) 바로 박자 없는 길로 걷는다');
      const s2 = Number(await page.$eval('.rg-room', (e) => e.dataset.walkerS));
      check(s2 >= s1, '걸으면 걷는 사람이 길 위에서 앞으로 간다');
      const walkerBox = await page.$eval('.rg-walker', (w) => { const r = w.getBoundingClientRect(); const s = document.querySelector('.rg-scene').getBoundingClientRect(); return r.bottom > s.top && r.top < s.bottom && r.right > s.left && r.left < s.right; });
      check(walkerBox, '2D 그림 판이 걷는 사람을 따라가 화면 안에 둔다');
      // 나머지는 이어서 끝까지(이미 4행을 걸었다)
      const problems = [];
      for (let guard = 0; guard < 400; guard++) {
        const phase = await attr(page, 'data-phase');
        if (phase === 'finale') { await page.tap('.rg-finish'); break; }
        if (phase === 'collect') { const id = await page.$eval('.rg-chip', (c) => c.dataset.wordId); await page.tap(`.rg-chip[data-word-id="${id}"]`); }
        if (phase === 'letgo') { for (const id of await page.$$eval('.rg-letgo', (cs) => cs.map((c) => c.dataset.wordId))) await page.tap(`.rg-letgo[data-word-id="${id}"]`); await page.waitForFunction(() => document.querySelector('.rg-room').dataset.phase !== 'letgo'); continue; }
        await page.waitForFunction(() => !document.querySelector('.rg-step').disabled);
        const u = Number(await attr(page, 'data-unit'));
        await page.tap('.rg-step');
        await page.waitForFunction((n) => Number(document.querySelector('.rg-room').dataset.unit) === n, u + 1);
        problems.push(...rowProblems(u + 1, await readRow(page)));
        if (u + 1 === 33) problems.push(...(await layoutProblems(page)));
      }
      await page.waitForFunction(() => window.__r.state.settled);
      check(problems.length === 0, '2D 휴대폰: 원문·표시·화면이 맞다 ' + problems.slice(0, 3).join(' | '));
      const st = await result(page);
      check(st.result?.completed === true && st.result.record.words.length === 4, '2D 휴대폰에서도 끝까지 가서 기록을 돌려준다');
      check(g.external.length === 0 && g.errors.length === 0, '바깥 요청·콘솔 오류가 없다 ' + g.errors.slice(0, 2).join(' | '));
    } finally { await g.close(); }
  }

  // E) 실제 빠르기: 한 걸음 = 네 박. 낭송 중 다시 눌러도 걷지 않는다. 중단하면 처음부터
  {
    console.log('\n▶ 실제 빠르기 한 걸음, 중단과 다시 하기, 점수 말');
    const g = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.chromebook });
    try {
      const { page } = g;
      page.setDefaultTimeout(20000);
      await open(page, { mode: 'auto' });
      await page.click('.rg-begin');
      const t0 = await page.evaluate(() => performance.now());
      await page.click('.rg-step');
      await page.waitForFunction(() => Number(document.querySelector('.rg-room').dataset.unit) === 0);
      await page.click('.rg-step', { force: true }).catch(() => {});
      await page.waitForTimeout(300);
      check(Number(await attr(page, 'data-unit')) === 0, '음성: 낭송 중에 다시 눌러도 한 걸음 더 가지 않는다');
      await page.waitForFunction(() => !document.querySelector('.rg-step').disabled);
      const dt = (await page.evaluate(() => performance.now())) - t0;
      check(dt >= 3500, '실제 빠르기(1분에 60박)에서 한 걸음은 네 박 동안 걷는다(' + Math.round(dt) + 'ms)');
      const sw = await scoreWordsIn(page);
      check(sw.length === 0, '방 화면에 점수·정답 같은 말이 없다 ' + sw.slice(0, 2).join(' | '));
      // 낭송 중에 중단
      await page.click('.rg-step');
      await page.waitForFunction(() => Number(document.querySelector('.rg-room').dataset.unit) === 1);
      await page.evaluate(() => window.__r.abort());
      await page.waitForFunction(() => window.__r.state.settled);
      const st = await result(page);
      check(st.error?.name === 'AbortError' && !st.result, '나가면(중단 신호) 방은 AbortError로 끝나고 기록을 돌려주지 않는다');
      check(await page.$('.rg-room') === null, '중단하면 방 화면을 치운다');
      await page.waitForTimeout(200);
      const last = await page.evaluate(() => window.__r.plays.at(-1)?.result);
      check(last && last.completed === false, '중단하면 낭송도 멈춘다');
      // 다시 들어오면 처음부터
      await open(page, { mode: 'auto', noBeat: true });
      check(Number(await attr(page, 'data-unit')) === -1 && (await attr(page, 'data-phase')) === 'intro', '다시 들어오면 방은 처음부터다(spec 20)');
      await page.click('.rg-begin');
      await page.click('.rg-step');
      await page.waitForFunction(() => Number(document.querySelector('.rg-room').dataset.unit) === 0);
      const row = await readRow(page);
      check(rowProblems(0, row).length === 0, '처음 행(1행)부터 다시 걷는다');
      check(await page.$eval('.rg-pouch-count', (e) => e.textContent.trim()) === '0개', '앞서 걷던 기록(모은 시어)은 남지 않는다');
      // 음성: 원문 대조가 실제로 잡는다(화면 글을 바꿔 보면)
      await page.$eval('.rg-original', (e) => { e.textContent = e.textContent.replace('홍진', '홍지'); });
      check(rowProblems(0, await readRow(page)).length > 0, '음성: 원문 대조가 바뀐 글을 잡는다');
      await page.$eval('.rg-room', (e) => { const b = document.createElement('button'); b.className = 'test-bad'; b.textContent = '점수 보기'; b.style.cssText = 'position:absolute;right:0;bottom:0;width:20px;height:20px'; e.append(b); });
      check((await layoutProblems(page)).length > 0 && (await scoreWordsIn(page)).length > 0, '음성: 화면 점검이 작은 버튼·구석 버튼·점수 말을 잡는다');
      await page.evaluate(() => window.__r.abort());
      await page.waitForFunction(() => window.__r.state.settled);
      // 시작 전에 이미 중단된 신호
      const pre = await page.evaluate(async () => {
        const { start } = await import('../../js/rooms/gasa.js');
        const c = new AbortController(); c.abort();
        const box = document.createElement('div'); document.body.append(box);
        try { await start({ song: window.__r.song, container: box, mode: '2d', noBeat: true, reduceMotion: true, rhythm: null, signal: c.signal }); return 'resolved'; } catch (e) { return e.name + ':' + box.childElementCount; }
      });
      check(pre === 'AbortError:0', '이미 중단된 신호로 열면 바로 AbortError로 끝나고 아무것도 그리지 않는다');
      // 소리 판이 멈춰 버려 낭송이 끝나지 않는 기기: 멈춘(회전) 동안은 기다리고, 그 밖에는 제 길이 + 여유 뒤에 낭송을 접고 걷는다
      const stuck = await page.evaluate(async () => {
        const { start } = await import('../../js/rooms/gasa.js');
        const R = await import('../../js/core/rhythm.js');
        const box = document.createElement('div');
        box.style.cssText = 'position:absolute;inset:0';
        document.getElementById('app').append(box);
        const fake = {
          unlocked: true, paused: true, stopped: false, noBeat: { value: false }, unlock() {},
          play() { let res; const finished = new Promise((r) => { res = r; }); return { finished, stop: () => { fake.stopped = true; res({ completed: false, reason: 'stopped' }); } }; },
        };
        setTimeout(() => { fake.paused = false; }, 2000);
        const c = new AbortController();
        const p = start({ song: window.__r.song, container: box, mode: '2d', noBeat: false, reduceMotion: true, rhythm: { engine: fake, buildGrid: (x) => R.buildGrid(x, { tempo: 240 }) }, signal: c.signal }).catch((e) => e.name);
        box.querySelector('.rg-begin').click();
        const t0 = performance.now();
        box.querySelector('.rg-step').click();
        await new Promise((r) => { const iv = setInterval(() => { if (box.querySelector('.rg-room')?.dataset.busy === '0' || performance.now() - t0 > 20000) { clearInterval(iv); r(); } }, 100); });
        const out = { dt: performance.now() - t0, busy: box.querySelector('.rg-room')?.dataset.busy, stopped: fake.stopped, unit: box.querySelector('.rg-room')?.dataset.unit };
        c.abort();
        out.end = await p;
        box.remove();
        return out;
      });
      check(stuck.busy === '0' && stuck.stopped && stuck.unit === '0' && stuck.dt >= 7000 && stuck.dt < 15000 && stuck.end === 'AbortError', '낭송이 끝나지 않아도 걸음이 막히지 않는다(멈춘 동안은 세지 않음, ' + Math.round(stuck.dt) + 'ms)');
      check(g.external.length === 0 && g.errors.length === 0, '바깥 요청·콘솔 오류가 없다 ' + g.errors.slice(0, 2).join(' | '));
    } finally { await g.close(); }
  }

  // F) 부르는 쪽이 3D 장면을 넘기는 경우(README 7.3 ctx.three)
  {
    console.log('\n▶ 부르는 쪽의 3D 장면(ctx.three)에 붙기');
    const g = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.chromebook });
    try {
      const { page } = g;
      page.setDefaultTimeout(20000);
      await open(page, { mode: '3d', hostThree: true, noBeat: true, reduceMotion: true });
      // 3D 장면은 gasa-3d.js를 불러온 뒤에 붙는다(시작 단추는 그보다 먼저 그려진다). 붙을 때까지 기다린 뒤 본다.
      await page.waitForFunction(() => (window.__r.hostChildren() ?? 0) >= 1, null, { timeout: 15000 }).catch(() => {});
      check(await page.evaluate(() => window.__r.hostChildren()) >= 1, '방 장면을 부르는 쪽의 root에 붙인다');
      // 장면이 붙은 뒤에 본다(일찍 보면 늦게 생기는 그림판을 놓친다)
      check(await page.$('canvas.rg-canvas') === null, 'ctx.three가 있으면 그림판을 따로 만들지 않는다');
      const w = await walkThrough(page, { pick: (_, chips) => [chips.at(-1).id], label: 'ctx.three' });
      check(w.maxCalls > 0 && w.maxCalls <= 60, '부르는 쪽 그림판에서도 그리기 호출 60 이하(' + w.maxCalls + ')');
      const st = await result(page);
      check(st.result?.record?.words?.length === 4, '기록을 돌려준다');
      check(await page.evaluate(() => window.__r.hostChildren()) === 0, '마치면 root에 붙인 것을 치운다');
      check(g.errors.length === 0, '콘솔 오류가 없다 ' + g.errors.slice(0, 2).join(' | '));
    } finally { await g.close(); }
  }
}

checkModel();
const server = await startServer();
try {
  await runBrowser(server);
} catch (e) {
  failures++;
  console.error('✗ ' + (e.stack ?? e.message));
} finally {
  await server.close();
}
if (failures) {
  console.error('\n실패 ' + failures + '건');
  process.exitCode = 1;
} else console.log('\n모두 통과');
