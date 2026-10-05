// 작품 방 「십 년을 경영하야」 점검(T14, spec 9·14·15·20, README 7.3).
// 1) Node: 방 글(교사 확인 대상)과 배치 → 해석 규칙, 기록 모양. 점검이 따로 계산한 답과 맞춰 본다.
// 2) 브라우저: 점검 페이지(tests/pages/room-sijo.html)가 실제 노래 데이터와 실제 소리 엔진(낭송 조각 없음)으로 방만 띄운다.
//    3D와 3D를 끈 브라우저(2D 그림 판)에서, 1366×768과 844×390(터치) 화면으로 실제 누르기만으로 끝까지 간다.
//    - 원작대로 / 손님을 들임 / 재물·벼슬을 들임(되묻기 → 다시 놓기, 이대로 두기) / 강산을 먼저 밖에 둠
//    - 강산은 어느 칸에도 들어가지 않고, 밖에 두면 물러나며(2D는 그림이 넓어짐) 종장이 낭송된다
//    - 초장·중장·종장 글이 노래 데이터와 글자 그대로 같다
//    - 박자 없는 방식(소리 끔)에서도 끝까지 간다
//    - 도중에 나가면 AbortError로 끝나고 깨끗이 치우며, 다시 열면 처음부터다
//    - 글자 크기 1.3에서 넘침이 없고 누를 것은 48px 이상, 점수 말·바깥 요청·콘솔 오류가 없다
// 음성 사례: 엉터리 기록, 한 글자 바뀐 원문, 점수 말은 이 점검의 판별 함수가 잡아낸다. 칸이 덜 찼을 때 들이기 단추는 막혀 있다.
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { ROOM_SIJO } from '../js/data/rooms-sijo.js';
import { songs as sijoSongs } from '../js/data/songs/sijo.js';
import * as logic from '../js/rooms/sijo-logic.js';

const PAGE = 'tests/pages/room-sijo.html';
const SONG = sijoSongs.find((s) => s.id === 'simnyeon-gyeongyeong');
const ITEM_IDS = ['na', 'dal', 'cheongpung', 'gangsan', 'gold', 'robe', 'guest'];
const ITEM_NAMES = { na: '나', dal: '달', cheongpung: '청풍', gangsan: '강산', gold: '금붙이', robe: '관복', guest: '손님' };
// 결과 카드 점검(check-card)과 같은 점수 말 + 판정 말
const FORBIDDEN = ['점', '점수', '등급', '순위', '정답', '오답', '틀렸', '맞았', '실패', '게임 오버'];
const BUDGET = 60;

let failed = 0;
function check(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { console.error('✗ ' + msg); failed++; }
}

// ── 점검이 따로 세운 답(구현을 베끼지 않는다) ──
function expectedInterpretation(rooms) {
  const set = new Set(rooms);
  if (set.size === 3 && ['na', 'dal', 'cheongpung'].every((id) => set.has(id))) return 'as-written';
  const worldly = set.has('gold') || set.has('robe');
  if (!worldly) return 'nature-swapped';
  return set.has('dal') || set.has('cheongpung') ? 'worldly' : 'worldly-only';
}

const verseOf = (unit) => SONG.units[unit].feet.map((f) => f.original).join(' ');
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const scoreWords = (text) => FORBIDDEN.filter((w) => String(text).includes(w));
const interpText = (id) => ROOM_SIJO.interpretations.find((i) => i.id === id)?.text;

// 기록 모양(README 7.3). 문제 목록을 돌려준다.
function recordProblems(rec, expect = {}) {
  const out = [];
  if (!rec || typeof rec !== 'object') return ['기록이 객체가 아님'];
  const keys = Object.keys(rec).sort().join(',');
  if (keys !== 'interpretationId,interpretationText,isInterpretation,outside,room,rooms') out.push('열쇠가 다름: ' + keys);
  if (rec.room !== 'sijo') out.push('room 값');
  if (!Array.isArray(rec.rooms) || rec.rooms.length !== 3) out.push('rooms는 셋');
  else {
    if (rec.rooms.some((id) => !ITEM_IDS.includes(id))) out.push('rooms에 모르는 물건');
    if (new Set(rec.rooms).size !== 3) out.push('rooms에 같은 물건');
    if (rec.rooms.includes('gangsan')) out.push('강산이 칸에 있음');
  }
  if (!Array.isArray(rec.outside) || !rec.outside.includes('gangsan')) out.push('강산이 집 밖에 없음');
  else {
    if (rec.outside.some((id) => !ITEM_IDS.includes(id))) out.push('outside에 모르는 물건');
    if (Array.isArray(rec.rooms) && rec.outside.some((id) => rec.rooms.includes(id))) out.push('같은 물건이 안팎에 있음');
    if (new Set(rec.outside).size !== rec.outside.length) out.push('outside에 같은 물건');
  }
  if (rec.isInterpretation !== true) out.push('isInterpretation');
  if (Array.isArray(rec.rooms) && rec.interpretationId !== expectedInterpretation(rec.rooms)) out.push('해석 id가 배치와 안 맞음: ' + rec.interpretationId);
  if (rec.interpretationText !== interpText(rec.interpretationId)) out.push('해석 문장이 데이터와 다름');
  if (expect.rooms && JSON.stringify(rec.rooms) !== JSON.stringify(expect.rooms)) out.push('rooms ' + JSON.stringify(rec.rooms));
  if (expect.outside && JSON.stringify(rec.outside) !== JSON.stringify(expect.outside)) out.push('outside ' + JSON.stringify(rec.outside));
  return out;
}

// ═════════ 1) Node ═════════
function nodeChecks() {
  check(!!SONG && SONG.units.length === 3, '노래 데이터에 「십 년을 경영하야」 세 장이 있다');
  // 방 글
  check(JSON.stringify(ROOM_SIJO.items.map((i) => i.id)) === JSON.stringify(ITEM_IDS), '물건 id가 README 7.3과 같다(순서 포함)');
  check(ROOM_SIJO.items.every((i) => ITEM_NAMES[i.id] === i.name), '물건 이름이 결과 카드가 쓰는 이름과 같다');
  check(ROOM_SIJO.lines.ask === '십 년 걸려 지은 초가 세 칸에 무엇을 들이겠소?', '송순의 물음이 spec 9 그대로다');
  const ids = ROOM_SIJO.interpretations.map((i) => i.id);
  check(ids.length >= 3 && ids.length <= 4 && new Set(ids).size === ids.length, '해석 문장은 셋에서 넷, id가 겹치지 않는다');
  check(ROOM_SIJO.interpretationLabel === '해석', "해석 표시 글은 '해석'");
  const allText = JSON.stringify(ROOM_SIJO);
  check(scoreWords(allText).length === 0, '방 글에 점수·판정 말이 없다 ' + scoreWords(allText).join(','));
  check(ROOM_SIJO.interpretations.every((i) => i.text.length <= 90), '해석 문장은 카드에 들어갈 만큼 짧다(90자 이하)');
  // 원문을 방 글에 다시 쓰지 않았다(원문은 노래 데이터에서만)
  const retyped = SONG.units.flatMap((u) => u.feet.map((f) => f.original)).filter((o) => o.length >= 4 && allText.includes(o));
  check(retyped.length === 0, '방 글에 노래 원문 음보를 옮겨 적지 않았다 ' + retyped.join(','));

  // 해석 규칙: 강산을 뺀 여섯 물건으로 세 칸을 채우는 모든 배치(120가지)
  const six = ITEM_IDS.filter((id) => id !== 'gangsan');
  let all = 0;
  let same = 0;
  const seen = new Set();
  for (const a of six) for (const b of six) for (const c of six) {
    if (new Set([a, b, c]).size !== 3) continue;
    all++;
    const got = logic.interpretationIdFor([a, b, c]);
    seen.add(got);
    if (got === expectedInterpretation([a, b, c])) same++;
  }
  check(all === 120 && same === 120, '세 칸 배치 120가지 모두 해석이 점검의 답과 같다 (' + same + '/' + all + ')');
  check(seen.size === ids.length && [...seen].every((id) => ids.includes(id)), '모든 해석 문장이 어떤 배치에서든 나온다');

  // 놓기 규칙
  const hut = logic.createHut();
  check(logic.place(hut, 'gangsan', 0).ok === false && logic.locate(hut, 'gangsan') === null, '강산은 칸에 들어가지 않는다');
  check(logic.place(hut, 'gangsan', 2).reason === 'gangsan-no-room', '강산을 칸에 넣으면 까닭이 gangsan-no-room');
  check(logic.place(hut, 'na', 0).ok && logic.place(hut, 'dal', 0).ok && hut.rooms[0] === 'dal' && logic.locate(hut, 'na') === null, '찬 칸에 넣으면 먼저 있던 것은 도로 나온다');
  check(logic.place(hut, 'dal', 1).ok && hut.rooms[0] === null && hut.rooms[1] === 'dal', '놓인 물건을 다른 칸으로 옮긴다');
  check(logic.place(hut, 'gold', 'outside').ok && logic.place(hut, 'gangsan', 'outside').ok && JSON.stringify(hut.outside) === '["gold","gangsan"]', '집 밖에는 여럿을 놓는다(놓은 순서)');
  check(!logic.roomsFull(hut), '두 칸이 비면 다 찬 것이 아니다');
  logic.place(hut, 'gold', 0);
  logic.place(hut, 'robe', 2);
  check(logic.roomsFull(hut) && JSON.stringify(hut.outside) === '["gangsan"]', '밖에 있던 물건도 칸으로 옮긴다');
  check(logic.place(hut, 'zzz', 0).ok === false, '모르는 물건은 놓지 않는다');
  const rec = logic.buildRecord(hut, ROOM_SIJO);
  check(recordProblems(rec, { rooms: ['gold', 'dal', 'robe'], outside: ['gangsan'] }).length === 0, '기록이 README 7.3 모양이다 ' + recordProblems(rec).join('; '));
  check(rec.interpretationId === 'worldly', '금붙이·달·관복 → worldly');
  hut.confirmed = true;
  check(logic.place(hut, 'na', 0).reason === 'locked', '들이기를 마친 칸은 바뀌지 않는다');

  // 음성 사례: 판별 함수가 엉터리를 잡는다
  const good = { room: 'sijo', rooms: ['na', 'dal', 'cheongpung'], outside: ['gangsan'], interpretationId: 'as-written', interpretationText: interpText('as-written'), isInterpretation: true };
  check(recordProblems(good).length === 0, '음성 사례 기준: 올바른 기록은 통과');
  const bad = [
    ['강산이 칸에', { ...good, rooms: ['gangsan', 'dal', 'cheongpung'], outside: ['na'] }],
    ['두 칸', { ...good, rooms: ['na', 'dal'] }],
    ['강산이 밖에 없음', { ...good, outside: [] }],
    ['해석 id가 배치와 다름', { ...good, interpretationId: 'worldly', interpretationText: interpText('worldly') }],
    ['해석 표시 없음', { ...good, isInterpretation: false }],
    ['점수 열쇠', { ...good, score: 3 }],
    ['방 이름', { ...good, room: 'gasa' }],
  ];
  for (const [name, r] of bad) check(recordProblems(r).length > 0, '음성 사례: ' + name + ' 기록을 잡아낸다');
  check(squash(verseOf(1)) !== squash(verseOf(1).replace('달', '닭')), '음성 사례: 한 글자 바뀐 원문은 같지 않다고 본다');
  check(scoreWords('당신의 점수는 3').length > 0, '음성 사례: 점수 말을 잡아낸다');
}

// ═════════ 2) 브라우저 ═════════
async function open(server, { disable3d = false, viewport = VIEWPORTS.chromebook, touch = false } = {}) {
  const g = await openGame(server.url, { path: PAGE, disable3d, viewport, touch });
  await g.page.waitForFunction(() => window.__r?.ready === true);
  g.touch = touch;
  return g;
}

async function act(g, sel) {
  const loc = g.page.locator(sel).first();
  if (g.touch) await loc.tap({ timeout: 5000 });
  else await loc.click({ timeout: 5000 });
}

const phase = (g, p) => g.page.waitForSelector(`.room-sijo[data-phase="${p}"]`, { timeout: 15000 });
const text = (g, sel) => g.page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);

async function start(g, opts = {}) {
  await g.page.evaluate((o) => window.__r.start(o), opts);
  await phase(g, 'place');
}

async function put(g, item, slot) {
  await act(g, `.sj-item[data-item="${item}"]`);
  await act(g, `.sj-slot[data-slot="${slot}"]`);
}

// 지금 보이는 것들의 넘침·크기·점수 말
async function layoutIssues(g) {
  return g.page.evaluate((forbidden) => {
    const root = document.querySelector('.room-sijo');
    if (!root) return ['방이 없음'];
    const out = [];
    const R = root.getBoundingClientRect();
    const visible = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
    for (const b of root.querySelectorAll('button')) {
      if (!visible(b)) continue;
      const r = b.getBoundingClientRect();
      const name = b.className + ' ' + (b.dataset.item ?? b.dataset.slot ?? b.dataset.choice ?? '');
      if (r.width < 47.5 || r.height < 47.5) out.push('작은 단추 ' + name + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      if (r.left < R.left - 1 || r.right > R.right + 1 || r.top < R.top - 1 || r.bottom > R.bottom + 1) out.push('화면 밖 단추 ' + name);
      if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1) out.push('단추 글 넘침 ' + name);
      if (!b.disabled && !b.classList.contains('sj-slot')) {
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || !(hit === b || b.contains(hit))) out.push('가려진 단추 ' + name);
      }
    }
    for (const el of root.querySelectorAll('.sj-panel')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < R.left - 1 || r.right > R.right + 1 || r.top < R.top - 1 || r.bottom > R.bottom + 1) out.push('화면 밖 글 ' + el.className);
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.push('글 넘침 ' + el.className);
    }
    const t = root.textContent;
    for (const w of forbidden) if (t.includes(w)) out.push('점수 말 ' + w);
    return out;
  }, FORBIDDEN);
}

async function finish(g) {
  await phase(g, 'interpret');
  await act(g, '.sj-finish');
  await g.page.waitForFunction(() => window.__r.state.result || window.__r.state.error);
  return g.page.evaluate(() => window.__r.state);
}

// 2D: 그림 판 확대 배율(변환 행렬의 a)
const stageScale = (g) => g.page.evaluate(() => {
  const st = document.querySelector('.sj-stage');
  const m = getComputedStyle(st).transform;
  if (!m || m === 'none') return 1;
  return +m.match(/matrix\(([^,]+)/)[1];
});

// 3D: 마지막으로 그린 카메라와 그리기 호출
const view3d = (g) => g.page.evaluate(() => window.__r.view3d());

// ── 시나리오 ──
// A) 3D 1366×768 — 원작대로, 강산을 칸에 넣으려다 막힘, 종장 낭송, 기록
async function scenarioAsWritten(server) {
  const g = await open(server);
  try {
    const mode = await g.page.evaluate(() => window.__r.mode());
    check(mode === '3d', '[3D 1366] 3D로 열린다');
    await start(g, { mode: '3d' });
    check(squash(await text(g, '.sj-say')).includes(ROOM_SIJO.lines.ask), '[3D 1366] 송순이 "무엇을 들이겠소?" 하고 묻는다');
    check(squash(await text(g, '.sj-verse[data-unit="0"] .sj-original')) === squash(verseOf(0)), '[3D 1366] 초장 글이 노래 데이터 그대로다');
    check(await g.page.locator('.sj-item').count() === 7, '[3D 1366] 물건 일곱이 놓여 있다');
    check(await g.page.locator('.sj-confirm').isDisabled(), '[3D 1366] 칸이 비면 들이기 단추가 막혀 있다(음성 사례)');
    const v0 = await view3d(g);
    check(v0 && v0.calls > 0 && v0.calls <= BUDGET, '[3D 1366] 그리기 호출 ' + v0?.calls + ' ≤ ' + BUDGET);
    // 강산을 칸에 넣어 본다 → 막힘
    await put(g, 'gangsan', 1);
    check(await g.page.evaluate(() => document.querySelector('.sj-item[data-item="gangsan"]').dataset.at) === 'tray', '[3D 1366] 강산은 칸에 들어가지 않고 그대로 남는다');
    check(squash(await text(g, '.sj-say')) === ROOM_SIJO.lines.gangsanNoRoom, '[3D 1366] 송순이 "들일 데가 없구려" 한다');
    await put(g, 'na', 0);
    await put(g, 'dal', 1);
    check(await g.page.locator('.sj-confirm').isDisabled(), '[3D 1366] 두 칸만 차면 아직 들일 수 없다(음성 사례)');
    await put(g, 'cheongpung', 2);
    check(squash(await text(g, '.sj-slot[data-slot="2"]')).includes('청풍'), '[3D 1366] 칸에 놓은 물건 이름이 칸에 보인다');
    check((await layoutIssues(g)).length === 0, '[3D 1366] 넘침·작은 단추·점수 말 없음 ' + (await layoutIssues(g)).join('; '));
    await act(g, '.sj-confirm');
    await phase(g, 'reveal');
    check(squash(await text(g, '.sj-verse[data-unit="1"] .sj-original')) === squash(verseOf(1)), '[3D 1366] 중장 글이 노래 데이터 그대로다');
    await act(g, '.sj-next');
    await phase(g, 'gangsan');
    check(squash(await text(g, '.sj-say')) === ROOM_SIJO.lines.askGangsan, '[3D 1366] "강산은 어디에 두겠소?"');
    check(await g.page.evaluate(() => [...document.querySelectorAll('.sj-item')].filter((b) => !b.disabled).map((b) => b.dataset.item).join()) === 'gangsan', '[3D 1366] 이제 강산만 고를 수 있다');
    await put(g, 'gangsan', 0);
    check(await g.page.evaluate(() => document.querySelector('.room-sijo').dataset.phase) === 'gangsan', '[3D 1366] 강산을 칸에 넣어도 넘어가지 않는다(음성 사례)');
    const nearV = await view3d(g);
    const nearZ = nearV.camera.z;
    await put(g, 'gangsan', 'outside');
    await phase(g, 'pullback');
    check(await g.page.evaluate(() => document.querySelector('.room-sijo').dataset.view) === 'wide', '[3D 1366] 강산을 밖에 두자 시선이 넓어진다(data-view=wide)');
    check(squash(await text(g, '.sj-verse[data-unit="2"] .sj-original')) === squash(verseOf(2)), '[3D 1366] 종장 글이 노래 데이터 그대로다');
    await g.page.waitForFunction(() => window.__r.view3d()?.settled === true, null, { timeout: 10000 });
    const v1 = await view3d(g);
    check(v1.camera.dist > nearV.camera.dist * 1.8 && v1.camera.z > nearZ, '[3D 1366] 카메라가 물러난다 (' + nearZ.toFixed(1) + ' → ' + v1.camera.z.toFixed(1) + ')');
    check(v1.mountains >= 6 && v1.mountainsUp, '[3D 1366] 강산이 병풍처럼 초가를 둘러싼다(산 ' + v1.mountains + ')');
    check(v1.calls <= BUDGET, '[3D 1366] 물러난 뒤 그리기 호출 ' + v1.calls + ' ≤ ' + BUDGET);
    const plays = await g.page.evaluate(() => window.__r.plays.map((p) => p.join(',')));
    check(plays.includes('2'), '[3D 1366] 종장을 소리 엔진으로 낭송한다 (낸 단위: ' + plays.join(' | ') + ')');
    check(plays.includes('1'), '[3D 1366] 중장을 낭송한다');
    await act(g, '.sj-next');
    await phase(g, 'interpret');
    check(squash(await text(g, '.sj-interp .sj-tag')) === '해석', "[3D 1366] 해석 문장에 '해석' 표시가 붙는다");
    check(squash(await text(g, '.sj-interp .sj-interp-text')) === interpText('as-written'), '[3D 1366] 원작대로 놓은 해석 문장이 나온다');
    check((await layoutIssues(g)).length === 0, '[3D 1366] 끝 화면 넘침·점수 말 없음 ' + (await layoutIssues(g)).join('; '));
    const st = await finish(g);
    check(st.result?.completed === true, '[3D 1366] 방이 { completed: true }로 끝난다');
    check(recordProblems(st.result?.record, { rooms: ['na', 'dal', 'cheongpung'], outside: ['gangsan'] }).length === 0, '[3D 1366] 기록이 README 7.3과 같다 ' + recordProblems(st.result?.record).join('; '));
    check(await g.page.evaluate(() => !document.querySelector('.room-sijo') && !document.querySelector('#host canvas')), '[3D 1366] 끝나면 방을 치운다');
    check(g.external.length === 0, '[3D 1366] 바깥 요청 없음 ' + g.external.join(','));
    check(g.errors.length === 0, '[3D 1366] 콘솔 오류 없음 ' + g.errors.join(' | '));
  } finally { await g.close(); }
}

// B) 3D 1366×768 — 재물·벼슬: 되묻기 → 다시 놓기 → 손님 → 이대로 두기, 강산을 먼저 밖에, 움직임 줄이기
async function scenarioWorldly3D(server) {
  const g = await open(server);
  try {
    await start(g, { mode: '3d', reduceMotion: true });
    await put(g, 'gold', 0);
    await put(g, 'na', 1);
    await put(g, 'dal', 2);
    await put(g, 'robe', 'outside');
    await act(g, '.sj-confirm');
    await phase(g, 'askback');
    check(squash(await text(g, '.sj-say')) === ROOM_SIJO.lines.askBack.gold, '[3D 재물] 금붙이를 들이면 송순이 웃으며 되묻는다');
    check(await g.page.locator('.sj-choice').count() === 2, '[3D 재물] 다시 놓기와 이대로 두기 둘 중에 고른다');
    await act(g, '.sj-choice[data-choice="redo"]');
    await phase(g, 'place');
    check(await g.page.evaluate(() => document.querySelector('.sj-item[data-item="gold"]').dataset.at) === '0', '[3D 재물] 다시 놓을 때 놓아 둔 것은 그대로다');
    // 같은 자리를 다시 누르면 도로 꺼낸다
    await act(g, '.sj-slot[data-slot="0"]');
    check(await g.page.evaluate(() => document.querySelector('.sj-item[data-item="gold"]').dataset.at) === 'tray', '[3D 재물] 놓인 칸을 누르면 도로 꺼낸다');
    // 강산을 먼저 밖에 둔다 → 아직 물러나지 않는다
    await put(g, 'gangsan', 'outside');
    check(squash(await text(g, '.sj-say')) === ROOM_SIJO.lines.gangsanWaiting, '[3D 재물] 칸이 덜 찼을 때 강산을 밖에 두면 마저 채우라 한다');
    check(await g.page.evaluate(() => document.querySelector('.room-sijo').dataset.view) === 'near', '[3D 재물] 칸을 들이기 전에는 아직 물러나지 않는다');
    await put(g, 'robe', 0);
    await act(g, '.sj-confirm');
    await phase(g, 'askback');
    check(squash(await text(g, '.sj-say')) === ROOM_SIJO.lines.askBack.robe, '[3D 재물] 관복을 들이면 관복을 두고 되묻는다');
    await act(g, '.sj-choice[data-choice="keep"]');
    await phase(g, 'reveal');
    await act(g, '.sj-next');
    // 강산이 이미 밖에 있으므로 묻지 않고 바로 물러난다
    await phase(g, 'pullback');
    await g.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const v = await view3d(g);
    check(v.settled === true, '[3D 재물] 움직임 줄이기에서는 카메라가 곧바로 물러난 자리에 있다');
    await act(g, '.sj-next');
    await phase(g, 'interpret');
    check(squash(await text(g, '.sj-interp .sj-interp-text')) === interpText('worldly'), '[3D 재물] 재물·벼슬을 들인 해석 문장이 나온다');
    const st = await finish(g);
    check(recordProblems(st.result?.record, { rooms: ['robe', 'na', 'dal'], outside: ['gangsan'] }).length === 0, '[3D 재물] 기록(관복·나·달 / 강산) ' + recordProblems(st.result?.record).join('; ') + ' ' + JSON.stringify(st.result?.record));
    check(g.errors.length === 0, '[3D 재물] 콘솔 오류 없음 ' + g.errors.join(' | '));
  } finally { await g.close(); }
}

// C) 2D 844×390 터치, 글자 1.3 — 손님 들이기, 나를 밖에, 그림이 넓어짐
async function scenario2DPhone(server) {
  const g = await open(server, { disable3d: true, viewport: VIEWPORTS.phone, touch: true });
  try {
    check(await g.page.evaluate(() => window.__r.mode()) === '2d', '[2D 844] 3D를 끈 브라우저는 2D다');
    await start(g, { textScale: 1.3 });
    check(await g.page.evaluate(() => !!document.querySelector('.sj-stage img.sj-board') && document.querySelector('.sj-stage img.sj-board').src.includes('board/room-sijo')), '[2D 844] 작품 방 그림 판(board/room-sijo)을 쓴다');
    check(await g.page.evaluate(() => !document.querySelector('.room-sijo canvas')), '[2D 844] 3D 그림판을 만들지 않는다');
    const near = await stageScale(g);
    check(near > 1.2, '[2D 844] 처음에는 초가를 가까이 본다(배율 ' + near.toFixed(2) + ')');
    check((await layoutIssues(g)).length === 0, '[2D 844 ×1.3] 시작 화면 넘침·작은 단추 없음 ' + (await layoutIssues(g)).join('; '));
    await put(g, 'guest', 0);
    await put(g, 'dal', 1);
    await put(g, 'cheongpung', 2);
    await put(g, 'na', 'outside');
    check((await layoutIssues(g)).length === 0, '[2D 844 ×1.3] 놓은 뒤 넘침 없음 ' + (await layoutIssues(g)).join('; '));
    await act(g, '.sj-confirm');
    await phase(g, 'reveal');
    check((await layoutIssues(g)).length === 0, '[2D 844 ×1.3] 중장 화면 넘침 없음 ' + (await layoutIssues(g)).join('; '));
    await act(g, '.sj-next');
    await phase(g, 'gangsan');
    await put(g, 'gangsan', 'outside');
    await phase(g, 'pullback');
    await g.page.waitForFunction(() => document.querySelector('.room-sijo').dataset.settled === 'true', null, { timeout: 10000 });
    const wide = await stageScale(g);
    check(wide < near && Math.abs(wide - 1) < 0.02, '[2D 844] 강산을 밖에 두자 그림이 넓어진다(배율 ' + near.toFixed(2) + ' → ' + wide.toFixed(2) + ')');
    check(await g.page.evaluate(() => { const s = document.querySelector('.sj-screen'); return !!s && +getComputedStyle(s).opacity > 0.5; }), '[2D 844] 강산이 병풍처럼 둘러싸는 그림이 보인다');
    check(squash(await text(g, '.sj-verse[data-unit="2"] .sj-original')) === squash(verseOf(2)), '[2D 844] 종장 글이 노래 데이터 그대로다');
    check((await layoutIssues(g)).length === 0, '[2D 844 ×1.3] 종장 화면 넘침 없음 ' + (await layoutIssues(g)).join('; '));
    await act(g, '.sj-next');
    await phase(g, 'interpret');
    check((await layoutIssues(g)).length === 0, '[2D 844 ×1.3] 해석 화면 넘침 없음 ' + (await layoutIssues(g)).join('; '));
    check(squash(await text(g, '.sj-interp .sj-interp-text')) === interpText('nature-swapped'), '[2D 844] 손님을 들인 해석 문장이 나온다');
    const st = await finish(g);
    check(recordProblems(st.result?.record, { rooms: ['guest', 'dal', 'cheongpung'], outside: ['na', 'gangsan'] }).length === 0, '[2D 844] 기록(손님·달·청풍 / 나·강산) ' + recordProblems(st.result?.record).join('; '));
    check(g.external.length === 0, '[2D 844] 바깥 요청 없음 ' + g.external.join(','));
    check(g.errors.length === 0, '[2D 844] 콘솔 오류 없음 ' + g.errors.join(' | '));
  } finally { await g.close(); }
}

// D) 2D 1366×768 — 박자 없는 방식(소리 끔), 재물만, 두 가지 되묻기
async function scenario2DNoBeat(server) {
  const g = await open(server, { disable3d: true });
  try {
    await start(g, { noBeat: true, muted: true });
    await put(g, 'gold', 0);
    await put(g, 'robe', 1);
    await put(g, 'guest', 2);
    await act(g, '.sj-confirm');
    await phase(g, 'askback');
    check(squash(await text(g, '.sj-say')) === ROOM_SIJO.lines.askBack.both, '[2D 박자 없음] 금붙이와 관복을 함께 들이면 둘을 두고 되묻는다');
    await act(g, '.sj-choice[data-choice="keep"]');
    await phase(g, 'reveal');
    // 박자 없는 방식: 낭송을 기다리지 않고 바로 다음으로 갈 수 있다
    check(await g.page.locator('.sj-next').isEnabled(), '[2D 박자 없음] 낭송을 기다리지 않고 다음 단추가 열려 있다');
    await act(g, '.sj-next');
    await phase(g, 'gangsan');
    await put(g, 'gangsan', 'outside');
    await phase(g, 'pullback');
    check(await g.page.locator('.sj-next').isEnabled(), '[2D 박자 없음] 종장에서도 바로 다음으로 갈 수 있다');
    await act(g, '.sj-next');
    await phase(g, 'interpret');
    check(squash(await text(g, '.sj-interp .sj-interp-text')) === interpText('worldly-only'), '[2D 박자 없음] 자연이 집 안에 없는 해석 문장이 나온다');
    const st = await finish(g);
    check(recordProblems(st.result?.record, { rooms: ['gold', 'robe', 'guest'], outside: ['gangsan'] }).length === 0, '[2D 박자 없음] 끝까지 가서 기록을 돌려준다 ' + recordProblems(st.result?.record).join('; '));
    check(g.errors.length === 0, '[2D 박자 없음] 콘솔 오류 없음 ' + g.errors.join(' | '));
  } finally { await g.close(); }
}

// E) 3D 844×390 터치 — 도중에 나가기(AbortError) → 다시 열면 처음부터 → 끝까지
async function scenarioAbort(server) {
  const g = await open(server, { viewport: VIEWPORTS.phone, touch: true });
  try {
    await start(g, { mode: '3d', textScale: 1.3 });
    check((await layoutIssues(g)).length === 0, '[3D 844 ×1.3] 시작 화면 넘침·작은 단추·가림 없음 ' + (await layoutIssues(g)).join('; '));
    await put(g, 'na', 0);
    await put(g, 'gold', 1);
    await put(g, 'cheongpung', 2);
    await put(g, 'guest', 'outside');
    await put(g, 'robe', 'outside');
    check((await layoutIssues(g)).length === 0, '[3D 844 ×1.3] 칸과 집 밖을 채운 뒤 넘침 없음 ' + (await layoutIssues(g)).join('; '));
    await put(g, 'dal', 1);
    await act(g, '.sj-confirm');
    await phase(g, 'reveal');
    await g.page.evaluate(() => window.__r.abort());
    await g.page.waitForFunction(() => window.__r.state.error || window.__r.state.result);
    const st = await g.page.evaluate(() => window.__r.state);
    check(st.error === 'AbortError' && !st.result, '[3D 844] 도중에 나가면 AbortError로 끝난다 (' + st.error + ')');
    const after = await g.page.evaluate(() => new Promise((res) => {
      const f0 = window.__r.frames();
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res({ empty: document.querySelector('#host').children.length === 0, framesMoved: window.__r.frames() !== f0 }))));
    }));
    check(after.empty && !after.framesMoved, '[3D 844] 나가면 그림판과 단추를 치우고 그리기를 멈춘다');
    // 다시 열면 처음부터
    await start(g, { mode: '3d', textScale: 1.3 });
    const fresh = await g.page.evaluate(() => [...document.querySelectorAll('.sj-item')].every((b) => b.dataset.at === 'tray'));
    check(fresh, '[3D 844] 다시 열면 모든 물건이 처음 자리에 있다(처음부터)');
    await put(g, 'cheongpung', 0);
    await put(g, 'na', 1);
    await put(g, 'dal', 2);
    await act(g, '.sj-confirm');
    await phase(g, 'reveal');
    await act(g, '.sj-next');
    await phase(g, 'gangsan');
    await put(g, 'gangsan', 'outside');
    await phase(g, 'pullback');
    check((await layoutIssues(g)).length === 0, '[3D 844 ×1.3] 종장 화면 넘침 없음 ' + (await layoutIssues(g)).join('; '));
    await act(g, '.sj-next');
    await phase(g, 'interpret');
    check((await layoutIssues(g)).length === 0, '[3D 844 ×1.3] 해석 화면 넘침 없음 ' + (await layoutIssues(g)).join('; '));
    const done = await finish(g);
    check(recordProblems(done.result?.record, { rooms: ['cheongpung', 'na', 'dal'], outside: ['gangsan'] }).length === 0 && done.result.record.interpretationId === 'as-written', '[3D 844] 순서를 바꿔도 나·달·청풍이면 원작대로다');
    check(g.external.length === 0, '[3D 844] 바깥 요청 없음 ' + g.external.join(','));
    check(g.errors.length === 0, '[3D 844] 콘솔 오류 없음 ' + g.errors.join(' | '));
  } finally { await g.close(); }
}

nodeChecks();
const server = await startServer();
try {
  for (const s of [scenarioAsWritten, scenarioWorldly3D, scenario2DPhone, scenario2DNoBeat, scenarioAbort]) {
    try { await s(server); } catch (e) { console.error('✗ ' + s.name + ': ' + e.message); failed++; }
  }
} finally {
  await server.close();
}
if (failed) { console.error(`실패 ${failed}건`); process.exitCode = 1; } else console.log('작품 방 「십 년을 경영하야」 점검 통과');
