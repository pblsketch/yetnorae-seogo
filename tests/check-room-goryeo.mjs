// 작품 방 「정석가」 점검(T13, spec 9·14·15·20, js/data/README.md 7.3).
// 점검 페이지(tests/pages/room-goryeo.html)가 실제 노래 데이터와 실제 소리 엔진(낭송 조각 없음)으로 방을 홀로 띄운다.
//  - 3D와 2D(3D를 끈 브라우저), 1366×768과 844×390(글자 크기 1.3)에서 클릭·터치·키보드로 끝까지 해 본다.
//  - 조건 카드를 고르면 임이 "그건 될 수도 있지 않소?" 하고 따지고, 더 불가능한 조건으로 맞서는 고리가 이어진다(실패 없음).
//  - 마지막 '구슬' 연과, 「서경별곡」에서 같은 연을 찾는 장면. 두 노래의 글은 노래 데이터와 글자 그대로 같아야 한다.
//  - record는 마지막으로 내세운 조건 카드(7.3 모양 그대로, 정답 여부 없음).
//  - 박자 없는 방식(소리 끔·빗금)에서도 같은 끝에 닿는다. 중간에 나가면 AbortError로 끝나고 다음에 처음부터 한다.
//  - 콘솔 오류·바깥 요청·점수 말이 없다. 3D 그리기 호출 60회 이하.
// 음성 사례: 검사 함수들이 잘못된 record, 점수 말, 화면 밖·작은 버튼, 잘못 가리킨 카드·연을 실제로 잡는지 먼저 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { songs } from '../js/data/songs/index.js';
import { room } from '../js/data/rooms-goryeo.js';
import { joinFeet } from '../js/core/song-shape.js';

const PAGE = 'tests/pages/room-goryeo.html';
const BUDGET = 60;
const SCORE_WORDS = ['점수', '정답', '오답', '등급', '순위', '실패', '틀렸', '맞혔', '게임 오버', '시간 초과', '등수'];

const song = songs.find((s) => s.id === room.songId);
const echoSong = songs.find((s) => s.id === room.echo.songId);
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// 줄 원문: 음보를 빈칸으로 잇되 낱말 안에서 나눈 음보(joined)는 붙인다(방이 보이는 글과 같다)
const lineText = (l) => joinFeet(l.feet, 'original');
const squash = (s) => String(s ?? '').replace(/\s+/g, '');

// ── 검사 함수 ──

// 7.3 「정석가」 record: { room: 'goryeo', lastConditionId, lastConditionText } — 다른 열쇠(정답 여부 등)는 없다.
function recordErrors(rec, expectId) {
  const out = [];
  if (!rec || typeof rec !== 'object') return ['record가 객체가 아니다'];
  const keys = Object.keys(rec).sort().join(',');
  if (keys !== 'lastConditionId,lastConditionText,room') out.push('열쇠가 7.3과 다르다: ' + keys);
  if (rec.room !== 'goryeo') out.push('room이 goryeo가 아니다');
  const card = room.cards.find((c) => c.id === rec.lastConditionId);
  if (!card) out.push('모르는 카드 id: ' + rec.lastConditionId);
  else if (rec.lastConditionText !== card.label) out.push('lastConditionText가 카드 이름과 다르다');
  if (expectId !== undefined && rec.lastConditionId !== expectId) out.push('마지막 카드가 ' + expectId + '가 아니라 ' + rec.lastConditionId);
  return out;
}

function scoreWordsIn(text) {
  return SCORE_WORDS.filter((w) => String(text).includes(w));
}

// 보이는 버튼이 화면 안에 다 들어오고 48px 이상인지
function boxProblems(boxes, vw, vh) {
  const out = [];
  for (const b of boxes) {
    if (b.w < 48 || b.h < 48) out.push(b.label + ' 크기 ' + Math.round(b.w) + '×' + Math.round(b.h));
    if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > vw + 0.5 || b.y + b.h > vh + 0.5) out.push(b.label + ' 화면 밖 ' + [b.x, b.y, b.w, b.h].map(Math.round).join(','));
  }
  return out;
}

// 방 데이터가 노래 데이터를 바르게 가리키는지: 카드는 '조건 연'(유덕하신 님 후렴이 붙은 연)이고, 가리킨 줄이 있으며,
// 마지막 연과 「서경별곡」의 연은 같은 풀이의 줄을 넷 이상 나눈다.
function roomDataErrors(r, s, echo) {
  const out = [];
  const refrainUnits = new Set((s.features?.refrains ?? []).flatMap((x) => x.ranges.map((g) => g.unit)));
  const ids = new Set();
  for (const c of r.cards) {
    if (ids.has(c.id)) out.push('카드 id 겹침: ' + c.id);
    ids.add(c.id);
    const u = s.units[c.unit];
    if (!u) { out.push(c.id + ': 없는 연 ' + c.unit); continue; }
    if (!refrainUnits.has(c.unit)) out.push(c.id + ': 연 ' + c.unit + '는 조건 연이 아니다');
    for (const li of [...c.lines, c.conditionLine]) if (!u.lines[li]) out.push(c.id + ': 없는 줄 ' + li);
    if (!c.label || !c.objection) out.push(c.id + ': 이름이나 대사가 비었다');
  }
  const fin = s.units[r.finalUnit];
  const eu = echo?.units?.[r.echo.unit];
  if (!fin || !eu) out.push('마지막 연이나 「서경별곡」 연이 없다');
  else {
    const g = new Set(eu.lines.map((l) => l.gloss));
    const shared = new Set(fin.lines.map((l) => l.gloss).filter((x) => g.has(x)));
    if (shared.size < 4) out.push('마지막 연과 「서경별곡」 연이 나누는 줄이 ' + shared.size + '개뿐');
    if (!squash(fin.lines.map(lineText).join('')).includes('구스리')) out.push('마지막 연에 구슬이 없다');
  }
  if (r.cards.some((c) => c.unit === r.finalUnit)) out.push('마지막 연이 카드로도 쓰였다');
  return out;
}

// 화면에 보일 줄(노래 데이터에서 계산)
const cardLines = (c) => c.lines.map((li) => ({ unit: c.unit, line: li, orig: lineText(song.units[c.unit].lines[li]), gloss: song.units[c.unit].lines[li].gloss }));
function distinctLines(s, unit) {
  const lines = s.units[unit].lines;
  return lines.map((l, i) => ({ unit, line: i, orig: lineText(l), gloss: l.gloss })).filter((x, i) => i === 0 || x.orig !== lineText(lines[i - 1]));
}
function refrainLineSet(s) {
  const set = new Set();
  for (const r of s.features?.refrains ?? []) {
    if (r.kind !== 'refrain') continue;
    for (const g of r.ranges) {
      const l = s.units[g.unit]?.lines?.[g.line];
      if (l && g.from === 0 && g.to === l.feet.length - 1) set.add(g.unit + '-' + g.line);
    }
  }
  return set;
}
function echoLines(unit) {
  const rset = refrainLineSet(echoSong);
  return echoSong.units[unit].lines.map((l, i) => ({ unit, line: i, orig: lineText(l), gloss: l.gloss })).filter((x) => !rset.has(unit + '-' + x.line));
}

// 줄마다 흐리게(.is-yeoeum) 보여야 하는 음보: 여음과 되풀이 머리(박에 들지 않는 말)
function dimProblems(lines) {
  const out = [];
  for (const x of lines) {
    const feet = echoSong.units[x.unit]?.lines?.[x.line]?.feet ?? [];
    const want = feet.map((f, i) => (f.kind === 'yeoeum' || f.kind === 'repeat' ? i : -1)).filter((i) => i >= 0);
    if (JSON.stringify(x.dim ?? []) !== JSON.stringify(want)) out.push((x.unit + 1) + '연 ' + (x.line + 1) + '줄 ' + JSON.stringify(x.dim) + ' ≠ ' + JSON.stringify(want));
  }
  return out;
}

// ── 음성 사례: 검사 함수가 실제로 잡는가 ──
console.log('\n[0] 검사 함수의 음성 사례');
const goodRec = { room: 'goryeo', lastConditionId: room.cards[1].id, lastConditionText: room.cards[1].label };
assert(recordErrors(goodRec).length === 0, '올바른 record는 통과한다');
assert(recordErrors({ ...goodRec, correct: true }).length > 0, '정답 여부 같은 열쇠가 붙은 record를 잡는다');
assert(recordErrors({ room: 'goryeo', lastConditionId: room.cards[1].id }).length > 0, '조건 글이 빠진 record를 잡는다');
assert(recordErrors({ ...goodRec, lastConditionText: '아무 글' }).length > 0, '카드 이름과 다른 조건 글을 잡는다');
assert(recordErrors({ ...goodRec, room: 'sijo' }).length > 0, '다른 방 이름을 잡는다');
assert(recordErrors(goodRec, room.cards[0].id).length > 0, '마지막 카드가 다르면 잡는다');
assert(scoreWordsIn('맞힌 점수 10점').length > 0 && scoreWordsIn('그건 될 수도 있지 않소?').length === 0, '점수 말을 잡고 보통 글은 통과한다');
assert(boxProblems([{ label: 'a', x: 10, y: 380, w: 100, h: 48 }], 844, 390).length === 1, '화면 아래로 넘친 버튼을 잡는다');
assert(boxProblems([{ label: 'a', x: 10, y: 10, w: 100, h: 40 }], 844, 390).length === 1, '48px보다 작은 버튼을 잡는다');
assert(boxProblems([{ label: 'a', x: 10, y: 10, w: 100, h: 48 }], 844, 390).length === 0, '알맞은 버튼은 통과한다');
assert(roomDataErrors({ ...room, cards: [{ ...room.cards[0], unit: 0 }] }, song, echoSong).length > 0, '조건 연이 아닌 연(서사)을 가리킨 카드를 잡는다');
assert(roomDataErrors({ ...room, cards: [{ ...room.cards[0], lines: [9] }] }, song, echoSong).length > 0, '없는 줄을 가리킨 카드를 잡는다');
assert(roomDataErrors({ ...room, echo: { ...room.echo, unit: 0 } }, song, echoSong).length > 0, '같은 사설이 없는 「서경별곡」 연을 잡는다');
assert(roomDataErrors({ ...room, finalUnit: 1 }, song, echoSong).length > 0, '구슬 연이 아닌 마지막 연을 잡는다');
assert(dimProblems([{ unit: 1, line: 0, dim: [0, 1] }]).length === 0, '여음과 되풀이 머리를 함께 흐리게 한 줄은 통과한다');
assert(dimProblems([{ unit: 1, line: 0, dim: [1] }]).length > 0, '되풀이 머리를 흐리게 하지 않은 줄(여음만 표시)을 잡는다');

console.log('\n[1] 방 데이터와 노래 데이터');
assert(song && echoSong, '「정석가」와 「서경별곡」이 등록된 노래 데이터에 있다');
const dataErr = roomDataErrors(room, song, echoSong);
assert(dataErr.length === 0, '카드는 원문의 조건 연을, 마지막 연과 「서경별곡」 연은 같은 사설을 가리킨다 ' + dataErr.join(' | '));
assert(room.cards.length >= 4, '조건 카드가 넷 이상(구운 밤, 옥 연꽃, 무쇠 철릭, 무쇠 소)');
assert(room.finalUnit === 5 && room.echo.unit === 1, '「정석가」 units[5]와 「서경별곡」 units[1]을 쓴다(T21 메모와 같다)');

// ── 화면 점검 도우미 ──
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, arg, what, timeout = 8000) {
  try {
    await page.waitForFunction(fn, arg, { timeout });
  } catch {
    throw new Error('✗ 기다림 시간 초과: ' + what);
  }
}

async function snapshot(page) {
  return ev(page, () => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => [...document.querySelectorAll(s)];
    const root = q('#room .room-goryeo');
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const lineOf = (e) => ({ song: e.dataset.song, unit: Number(e.dataset.unit), line: Number(e.dataset.line), orig: e.querySelector('.rg-orig')?.textContent ?? '', gloss: e.querySelector('.rg-gloss')?.textContent ?? '', match: e.classList.contains('is-match'), pair: e.dataset.pair ?? null,
      dim: [...e.querySelectorAll('.rg-orig .rg-foot')].map((f, i) => (f.classList.contains('is-yeoeum') ? i : -1)).filter((i) => i >= 0) });
    return {
      exists: !!root,
      step: root?.dataset.step ?? null,
      mode: root?.dataset.mode ?? null,
      text: root?.innerText ?? '',
      say: q('#room .rg-say')?.textContent ?? '',
      hand: qa('#room button.rg-card').filter(vis).map((b) => ({ id: b.dataset.cardId, label: b.querySelector('.rg-card-label')?.textContent ?? '', orig: b.querySelector('.rg-orig')?.textContent ?? '' })),
      toFinal: qa('#room button.rg-to-final').some(vis),
      slip: qa('#room .rg-slip .rg-line').filter(vis).map(lineOf),
      slipCard: q('#room .rg-slip')?.dataset.cardId ?? null,
      tower: qa('#room .rg-tower-item').map((e) => e.dataset.cardId),
      finalLines: qa('#room .rg-final .rg-line').filter(vis).map(lineOf),
      echoLines: qa('#room .rg-echo .rg-line').filter(vis).map(lineOf),
      tabs: qa('#room button.rg-tab').filter(vis).map((b) => Number(b.dataset.unit)),
      compareMatch: !!q('#room .room-goryeo.is-match'),
      finish: qa('#room button.rg-finish').some(vis),
      buttons: qa('#room button').filter(vis).map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent.trim().slice(0, 14), x: r.x, y: r.y, w: r.width, h: r.height }; }),
      hOverflow: root ? qa('#room .room-goryeo, #room .room-goryeo *').filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && getComputedStyle(e).overflowX !== 'hidden').map((e) => e.className) : [],
      vw: innerWidth,
      vh: innerHeight,
      boardImage: getComputedStyle(q('#room .rg-art') ?? document.body).backgroundImage,
      childCount: q('#room').children.length,
    };
  });
}

function checkLines(actual, expected, what) {
  const a = actual.map((x) => x.unit + '-' + x.line + ':' + norm(x.orig) + '|' + norm(x.gloss));
  const e = expected.map((x) => x.unit + '-' + x.line + ':' + norm(x.orig) + '|' + norm(x.gloss));
  assert(JSON.stringify(a) === JSON.stringify(e), what + ' 글이 노래 데이터와 글자 그대로 같다' + (JSON.stringify(a) === JSON.stringify(e) ? '' : '\n   보임 ' + JSON.stringify(a) + '\n   기대 ' + JSON.stringify(e)));
}

// 화면 사진(tests/shots/room-goryeo/, 저장소에 올리지 않는다)
const SHOT_DIR = fileURLToPath(new URL('./shots/room-goryeo/', import.meta.url));
fs.mkdirSync(SHOT_DIR, { recursive: true });
async function shot(page, label) {
  const name = label.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') + '.png';
  await page.screenshot({ path: path.join(SHOT_DIR, name), animations: 'disabled', caret: 'hide' });
}

async function checkFrame(page, label) {
  await pause(80);
  await shot(page, label);
  const s = await snapshot(page);
  const probs = boxProblems(s.buttons, s.vw, s.vh);
  assert(probs.length === 0, label + ': 버튼이 모두 화면 안, 48px 이상 ' + probs.join(' | '));
  assert(s.hOverflow.length === 0, label + ': 가로로 넘치는 상자가 없다 ' + s.hOverflow.join(','));
  const sw = scoreWordsIn(s.text);
  assert(sw.length === 0, label + ': 점수·정답 같은 말이 없다 ' + sw.join(','));
  return s;
}

// 버튼 하나를 실제 입력으로 누른다. how: 'click' | 'tap' | 'key'
async function press(page, selector, how) {
  const loc = page.locator('#room ' + selector).first();
  await loc.waitFor({ state: 'visible', timeout: 5000 });
  if (how === 'tap') await loc.tap();
  else if (how === 'key') { await loc.focus(); await page.keyboard.press('Enter'); }
  else await loc.click();
}

async function openRoom(page, opts = {}) {
  await waitFor(page, () => window.__r?.ready === true, null, '점검 페이지 준비');
  await ev(page, (o) => window.__r.open(o), opts);
  await waitFor(page, () => !!document.querySelector('#room .room-goryeo[data-step="pick"]'), null, '방 시작');
}

// 한 번 끝까지 하기. order: 내세울 카드 id 순서(둘 이상). how: 입력 방식 목록(돌아가며 쓴다)
async function playThrough(page, { order, how, label, expectMode }) {
  const hows = Array.isArray(how) ? how : [how];
  const h = (i) => hows[i % hows.length];
  let k = 0;
  let s = await checkFrame(page, label + ' 시작');
  assert(s.mode === expectMode, label + ': 방이 ' + expectMode + ' 모드로 열린다');
  assert(s.hand.length === room.cards.length, label + ': 조건 카드 ' + room.cards.length + '장이 손에 있다');
  for (const c of room.cards) {
    const hc = s.hand.find((x) => x.id === c.id);
    assert(hc && norm(hc.label) === c.label && norm(hc.orig) === lineText(song.units[c.unit].lines[c.conditionLine]), label + ': 카드 ' + c.id + ' 앞면 = 이름 + 원문 조건 줄(노래 데이터)');
  }
  assert(norm(s.say) === room.text.nimIntro, label + ': 임이 처음 말을 건넨다');
  assert(!s.toFinal, label + ': 카드를 내기 전에는 마지막 연으로 넘어갈 수 없다');

  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const card = room.cards.find((c) => c.id === id);
    const before = await ev(page, () => window.__r.plays.length);
    await press(page, `button.rg-card[data-card-id="${id}"]`, h(k++));
    await waitFor(page, (n) => document.querySelector('#room .rg-slip')?.dataset.cardId === n, id, '카드 ' + id + ' 내세움');
    s = await checkFrame(page, label + ' 카드 ' + (i + 1));
    assert(s.say.includes(room.text.objection) && s.say.includes(card.objection), label + ': 임이 "그건 될 수도 있지 않소?" 하고 따진다(' + id + ')');
    checkLines(s.slip, cardLines(card), label + ': 내세운 조건 쪽지(' + id + ')');
    assert(!s.hand.some((x) => x.id === id) && s.hand.length === room.cards.length - (i + 1), label + ': 낸 카드는 손에서 빠진다');
    const expectFinal = i + 1 >= room.minCardsBeforeFinal;
    assert(s.toFinal === expectFinal, label + ': ' + (i + 1) + '장 뒤 마지막 연 버튼 ' + (expectFinal ? '보임' : '안 보임'));
    if (i + 1 === room.cards.length) assert(s.hand.length === 0 && s.text.includes(room.text.allUsed), label + ': 카드를 다 쓰면 마음으로 답할 차례를 알린다');
    if (expectMode === '2d') assert(JSON.stringify(s.tower) === JSON.stringify(order.slice(0, i + 1)), label + ': 2D 약속 탑에 낸 차례대로 쌓인다');
    else {
      const t = await ev(page, () => window.__r.threeInfo());
      assert(order.slice(0, i + 1).every((x) => t.names.includes('rg-card-' + x)), label + ': 3D 약속 탑에 카드 판이 쌓인다');
    }
    const p = await ev(page, (b) => window.__r.plays.slice(b), before);
    assert(p.some((x) => x.songId === 'jeongseokga' && x.units.length === 1 && x.units[0] === card.unit), label + ': 그 연을 소리 엔진으로 낭송한다(' + card.unit + '연)');
  }

  await press(page, 'button.rg-to-final', h(k++));
  await waitFor(page, () => document.querySelector('#room .room-goryeo')?.dataset.step === 'final', null, '마지막 연');
  s = await checkFrame(page, label + ' 마지막 연');
  assert(norm(s.say) === room.text.nimFinal, label + ': 임이 모든 일이 이루어진다면 어찌하겠느냐고 묻는다');
  checkLines(s.finalLines, distinctLines(song, room.finalUnit), label + ': 마지막 구슬 연(units[' + room.finalUnit + '])');
  assert(s.hand.length === 0, label + ': 마지막 연에서는 조건 카드가 사라진다');
  if (expectMode === '3d') {
    const t = await ev(page, () => window.__r.threeInfo());
    assert(t.names.includes('rg-bead') && t.names.includes('rg-rock') && t.names.includes('rg-string'), label + ': 3D에 구슬·바위·끈이 나온다');
  }

  await press(page, 'button.rg-discover', h(k++));
  await waitFor(page, () => document.querySelector('#room .room-goryeo')?.dataset.step === 'discover', null, '발견 장면');
  s = await checkFrame(page, label + ' 발견 장면');
  assert(JSON.stringify(s.tabs) === JSON.stringify(echoSong.units.map((_, i) => i)), label + ': 「서경별곡」의 연마다 펼칠 자리가 있다');
  assert(!s.finish, label + ': 같은 연을 찾기 전에는 마칠 수 없다');
  const wrong = echoSong.units.map((_, i) => i).filter((i) => i !== room.echo.unit);
  for (const u of wrong) {
    await press(page, `button.rg-tab[data-unit="${u}"]`, h(k++));
    await waitFor(page, (n) => document.querySelector('#room .rg-echo')?.dataset.unit === String(n), u, '「서경별곡」 ' + u + '연 펼침');
    s = await checkFrame(page, label + ' 서경별곡 ' + (u + 1) + '연');
    checkLines(s.echoLines, echoLines(u), label + ': 「서경별곡」 ' + (u + 1) + '연(후렴 줄 뺌)');
    assert(!s.finish && !s.compareMatch && s.text.includes(room.text.notHere), label + ': 다른 연은 같은 연이 아니라고 알리고 그대로 찾게 한다(실패 없음)');
  }
  await press(page, `button.rg-tab[data-unit="${room.echo.unit}"]`, h(k++));
  await waitFor(page, () => !!document.querySelector('#room .room-goryeo.is-match'), null, '같은 연 발견');
  s = await checkFrame(page, label + ' 같은 연 발견');
  checkLines(s.echoLines, echoLines(room.echo.unit), label + ': 「서경별곡」 같은 연(units[' + room.echo.unit + '])');
  {
    const bad = dimProblems(s.echoLines);
    assert(bad.length === 0, label + ': 「서경별곡」 줄의 여음과 되풀이 머리가 같은 모양(흐리게)으로 표시된다' + (bad.length ? ' — ' + bad.join(' | ') : ''));
  }
  checkLines(s.finalLines, distinctLines(song, room.finalUnit), label + ': 나란히 놓인 「정석가」 마지막 연');
  const leftPairs = s.finalLines.filter((x) => x.match).map((x) => x.pair).sort();
  const rightPairs = s.echoLines.filter((x) => x.match).map((x) => x.pair).sort();
  assert(leftPairs.length >= 4 && JSON.stringify(leftPairs) === JSON.stringify(rightPairs), label + ': 두 노래의 같은 줄이 짝지어 표시된다(' + leftPairs.length + '쌍)');
  for (const L of s.finalLines.filter((x) => x.match)) {
    const Rl = s.echoLines.find((x) => x.pair === L.pair);
    assert(Rl && norm(Rl.gloss) === norm(L.gloss), label + ': 짝 ' + L.pair + '은 같은 사설(풀이가 같다)');
  }
  assert(s.text.includes(room.text.found) && s.finish, label + ': 발견을 알리고 마칠 수 있다');
  const pl = await ev(page, () => window.__r.plays);
  assert(pl.some((x) => x.songId === 'jeongseokga' && x.units.length === 1 && x.units[0] === room.finalUnit), label + ': 마지막 연을 낭송했다');

  await press(page, 'button.rg-finish', h(k++));
  await waitFor(page, () => !!window.__r.state.result || !!window.__r.state.error, null, '방 완료');
  const st = await ev(page, () => window.__r.state);
  assert(!st.error, label + ': 오류 없이 끝난다 ' + (st.error ?? ''));
  assert(st.result?.completed === true, label + ': { completed: true }로 끝난다');
  const errs = recordErrors(st.result?.record, order[order.length - 1]);
  assert(errs.length === 0, label + ': record = 마지막으로 내세운 카드 ' + JSON.stringify(st.result?.record) + ' ' + errs.join(' | '));
  s = await snapshot(page);
  assert(s.childCount === 0, label + ': 끝나면 방이 컨테이너를 비운다');
  if (expectMode === '3d') {
    const t = await ev(page, () => window.__r.threeInfo());
    assert(t.rootChildren === 0, label + ': 끝나면 3D 장면에서 방이 만든 것을 모두 치운다');
    assert(JSON.stringify(t.camera) === JSON.stringify([0, 3, 8]), label + ': 카메라를 원래 자리로 돌려놓는다');
  }
  return st.result.record;
}

async function abortCheck(page, label, expectMode) {
  await openRoom(page, {});
  await press(page, `button.rg-card[data-card-id="${room.cards[2].id}"]`, 'click');
  await waitFor(page, (n) => document.querySelector('#room .rg-slip')?.dataset.cardId === n, room.cards[2].id, '카드 내세움(나가기 전)');
  await ev(page, () => window.__r.abort());
  await waitFor(page, () => !!window.__r.state.error || !!window.__r.state.result, null, '나가기 처리');
  const st = await ev(page, () => window.__r.state);
  assert(st.result === null && /^AbortError/.test(st.error ?? ''), label + ': 방 도중에 나가면 AbortError로 끝나고 record가 없다');
  const s = await snapshot(page);
  assert(s.childCount === 0, label + ': 나가면 컨테이너를 비운다');
  if (expectMode === '3d') {
    const t = await ev(page, () => window.__r.threeInfo());
    assert(t.rootChildren === 0, label + ': 나가면 3D 장면에서 방이 만든 것을 치운다');
  }
  // 다음에 들어오면 처음부터(spec 20)
  await openRoom(page, {});
  const s2 = await snapshot(page);
  assert(s2.step === 'pick' && s2.hand.length === room.cards.length && s2.tower.length === 0 && !s2.slipCard, label + ': 다시 들어오면 처음부터 한다(카드 넷, 쌓인 약속 없음)');
  await ev(page, () => window.__r.abort());
  await waitFor(page, () => !!window.__r.state.error, null, '두 번째 나가기');
  // 이미 중단된 신호로 열면 바로 AbortError
  await ev(page, () => window.__r.open({ preAbort: true }));
  await waitFor(page, () => !!window.__r.state.error || !!window.__r.state.result, null, '중단된 신호');
  const st3 = await ev(page, () => window.__r.state);
  assert(/^AbortError/.test(st3.error ?? '') && (await snapshot(page)).childCount === 0, label + ': 이미 중단된 신호로 열면 바로 AbortError로 끝나고 아무것도 그리지 않는다');
}

const server = await startServer();
const RUNS = [
  { label: '3D 1366×768', disable3d: false, viewport: VIEWPORTS.chromebook, touch: false, scale: 1, mode: '3d', order: [room.cards[0].id, room.cards[2].id], how: ['click', 'key'] },
  { label: '3D 844×390 글자 1.3', disable3d: false, viewport: VIEWPORTS.phone, touch: true, scale: 1.3, mode: '3d', order: [room.cards[3].id, room.cards[1].id, room.cards[0].id, room.cards[2].id], how: ['tap'] },
  { label: '2D 1366×768 글자 1.3', disable3d: true, viewport: VIEWPORTS.chromebook, touch: false, scale: 1.3, mode: '2d', order: [room.cards[1].id, room.cards[3].id, room.cards[2].id], how: ['key', 'click'] },
  { label: '2D 844×390 글자 1.3', disable3d: true, viewport: VIEWPORTS.phone, touch: true, scale: 1.3, mode: '2d', order: [room.cards[2].id, room.cards[0].id, room.cards[3].id, room.cards[1].id], how: ['tap'] },
];

try {
  for (const run of RUNS) {
    console.log('\n[' + run.label + ']');
    const game = await openGame(server.url, { path: PAGE, disable3d: run.disable3d, viewport: run.viewport, touch: run.touch });
    const { page } = game;
    try {
      await waitFor(page, () => window.__r?.ready === true, null, '점검 페이지 준비', 15000);
      await ev(page, (v) => document.documentElement.style.setProperty('--text-scale', String(v)), run.scale);
      const mode = await ev(page, () => window.__r.mode);
      assert(mode === run.mode, run.label + ': 페이지가 ' + run.mode + ' 모드다');

      await openRoom(page, {});
      if (run.mode === '2d') {
        const s = await snapshot(page);
        assert(/room-goryeo\.webp/.test(s.boardImage), run.label + ': 2D 그림 판 board/room-goryeo를 깐다');
      } else {
        await pause(300);
        const t = await ev(page, () => window.__r.threeInfo());
        assert(t.rootChildren > 0 && t.names.includes('rg-nim'), run.label + ': 3D 장면에 방(임 종이 인형 포함)을 짓는다');
      }
      await playThrough(page, { order: run.order, how: run.how, label: run.label, expectMode: run.mode });
      if (run.mode === '3d') {
        const t = await ev(page, () => window.__r.threeInfo());
        assert(t.maxCalls > 0 && t.maxCalls <= BUDGET, run.label + ': 그리기 호출 ' + t.maxCalls + '회(60회 이하)');
      }

      // 박자 없는 방식(소리 끔): 같은 끝에 닿는다. 움직임 줄이기도 함께.
      console.log('  · 박자 없는 방식(소리 끔, 움직임 줄이기)');
      await openRoom(page, { muted: true, reduceMotion: true });
      const nb = await ev(page, () => window.__r.engine.noBeat);
      assert(nb.value === true && nb.reason === 'muted', run.label + ': 소리 끔이면 박자 없는 방식이다');
      await playThrough(page, { order: [room.cards[3].id, room.cards[0].id], how: run.touch ? ['tap'] : ['click'], label: run.label + ' 박자 없음', expectMode: run.mode });

      if (run.viewport === VIEWPORTS.chromebook) {
        console.log('  · 빗금 모드');
        await openRoom(page, { slash: true });
        await playThrough(page, { order: [room.cards[1].id, room.cards[2].id], how: ['click'], label: run.label + ' 빗금', expectMode: run.mode });
      }

      console.log('  · 나가기와 다시 하기');
      await abortCheck(page, run.label, run.mode);

      const missing = await ev(page, () => window.__r.log.filter((x) => x.name === 'audio:missing').length);
      assert(missing >= 0, run.label + ': 낭송 조각이 없어도 막히지 않는다(없는 조각 알림 ' + missing + '건)');
      assert(game.external.length === 0, run.label + ': 바깥 주소 요청이 없다 ' + game.external.join(', '));
      assert(game.errors.length === 0, run.label + ': 콘솔 오류가 없다 ' + game.errors.join(' | '));
    } finally {
      await game.close();
    }
  }
  console.log('\n작품 방 「정석가」 점검 통과');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await server.close();
}
