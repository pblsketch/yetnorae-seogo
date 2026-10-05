// 향가관 모형 점검(T7, spec 3.1·5.4·6·8·14·17).
// 4·8·10구 층의 탑과 층마다 서가 자리, 10구 층 마지막 두 칸 앞의 '아아' 문, 공통 자리(바구니·덤 서가·돌아온 노래 선반·작품 방 문),
// 반응 사건 전부, 먹빛→단청, 그리기 호출 예산, 2D 그림 판, 움직임 줄이기, 바깥 요청·콘솔 오류를 본다.
// 점검 페이지 tests/pages/wing-hyangga.html이 세계 바탕 위에 향가관 모형만 띄운다(제품 흐름에는 없다).
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { FLOORS, litPerFloor, bayForCount, popShape, REACTION_EVENTS } from '../js/world/wings/hyangga-shared.js';

const PAGE = 'tests/pages/wing-hyangga.html';
const BUDGET = 60;
const WING_REACH = 6.05;   // 관 안에서 학생이 걸을 수 있는 한계(관 반너비 6.5 - 벽 여유 0.45)
const withinBudget = (calls) => calls > 0 && calls <= BUDGET;
const REQUIRED_ANCHORS = ['slots', 'bonus', 'basket', 'returnedShelf', 'roomDoor', 'entrance', 'nextDoor', 'floating'];

// ── 엔진 쪽(브라우저 없이) ──
function checkShared() {
  console.log('\n▶ 공통 규칙');
  assert(JSON.stringify(FLOORS) === '[4,8,10]', '탑의 층은 아래부터 4구·8구·10구다');
  assert(JSON.stringify(litPerFloor(0)) === '[0,0,0]', '센 구가 없으면 불이 없다');
  assert(JSON.stringify(litPerFloor(4)) === '[4,0,0]', '4구 노래는 4구 층만 채운다');
  assert(JSON.stringify(litPerFloor(5)) === '[4,5,0]', '다섯째 구부터 8구 층이 차오른다');
  assert(JSON.stringify(litPerFloor(8)) === '[4,8,0]', '8구 노래는 4·8구 층을 채운다');
  assert(JSON.stringify(litPerFloor(10)) === '[4,8,10]', '10구 노래는 세 층을 모두 채운다');
  assert(JSON.stringify(bayForCount(9)) === '{"floor":2,"bay":8}', "아홉째 구는 10구 층 아홉째 칸('아아' 문 뒤)이다");
  // 갈래의 모양 차이: 사설시조는 가운데가 길고, 시조는 고르며, 가사는 길게 이어지고, 향가는 구 수만큼 쌓인다.
  const len = (segs) => Math.max(...segs.map((s) => s.z + s.d)) - Math.min(...segs.map((s) => s.z));
  const height = (segs) => Math.max(...segs.map((s) => s.y + s.h));
  const saseol = popShape('saseol', 'namodo-bahi', 10);
  const sijo = popShape('sijo', 'dongjitdal', 10);
  assert(saseol[1].d > 3 * saseol[0].d && saseol[1].d > 3 * saseol[2].d, '사설시조 모양은 가운데 마디만 길게 늘어난다');
  assert(sijo.every((s) => s.d === sijo[0].d) && len(saseol) > 1.8 * len(sijo), '시조 모양은 고른 세 마디이고 사설시조보다 훨씬 짧다');
  assert(len(popShape('gasa', 'gyuwonga', 10)) > len(sijo) * 2, '가사 모양은 길게 이어진다');
  assert(popShape('goryeo', 'gasiri', 10).length >= 4 && popShape('goryeo', 'gasiri', 10).some((s) => s.ring), '고려가요 모양은 같은 마디가 줄지어 고리로 이어진다');
  assert(height(popShape('hyangga', 'chan-giparangga', 4)) > 2, '10구 노래를 4구 층에 꽂으면 층 높이를 훌쩍 넘어 솟는다');
  assert(Math.abs(height(popShape('hyangga', 'seodongyo', 4)) - 1) < 0.1, '(대조) 4구 노래는 4구 층 높이에 맞는다');
  assert(REACTION_EVENTS.length === 13, '반응 사건 13개를 모두 안다');
}

// ── 페이지 도우미 ──
const ev = (page, fn, arg) => page.evaluate(fn, arg);

function frames(page, n = 2) {
  return page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
}

async function open(server, opts) {
  const game = await openGame(server.url, { path: PAGE, ...opts });
  await game.page.waitForFunction(() => window.__t?.ready === true, null, { timeout: 20000 });
  await ev(game.page, () => { window.__t.world.enterWing('hyangga'); window.__t.world.resetCamera(); });
  await frames(game.page, 4);
  return game;
}

const emit = (page, name, detail) => ev(page, ([n, d]) => window.__t.events.emit(n, d), [name, detail]);
const info = (page) => ev(page, () => window.__t.h().info());

// 화면의 한 부분을 찍는다(관찰할 수 있는 변화 확인용).
async function shot(page, r) {
  const vp = page.viewportSize();
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  const clip = { x, y, width: Math.max(8, Math.min(vp.width - x, Math.ceil(r.width))), height: Math.max(8, Math.min(vp.height - y, Math.ceil(r.height))) };
  return page.screenshot({ clip });
}

// '아아' 문이 화면에서 차지하는 자리
async function doorRect(page, mode) {
  if (mode === '2d') {
    return ev(page, () => { const r = document.querySelector('.hy-aa-door').getBoundingClientRect(); return { x: r.left - 6, y: r.top - 6, width: r.width + 12, height: r.height + 12 }; });
  }
  return ev(page, () => {
    const t = window.__t;
    const local = t.h().anchors.slots[0];
    const world = t.world.getAnchors().slots[0];
    const c = t.h().info().doorCenter;
    const p = { x: c.x + world.x - local.x, y: c.y + world.y - (local.y ?? 0), z: c.z + world.z - local.z };
    const s = t.world.toScreen(p);
    return { x: s.x - 50, y: s.y - 45, width: 100, height: 90 };
  });
}

async function towerRect(page, mode) {
  if (mode === '2d') return ev(page, () => { const r = document.querySelector('.hy-tower').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  return ev(page, () => {
    const t = window.__t;
    const a = t.world.getAnchors().slots;
    const s0 = t.world.toScreen({ x: a[0].x - 0.8, y: 5, z: a[0].z - 1.7 });
    const s1 = t.world.toScreen({ x: a[2].x + 1.8, y: 0.3, z: a[2].z - 1.7 });
    return { x: s0.x, y: s0.y, width: s1.x - s0.x, height: s1.y - s0.y };
  });
}

// ── 자리(anchors) ──
async function checkAnchors(page, mode, label) {
  const a = await ev(page, () => {
    const h = window.__t.h();
    const plain = (p) => (p ? { x: p.x, y: p.y, z: p.z } : p);
    const out = {};
    for (const [k, v] of Object.entries(h.anchors)) {
      if (k === 'camera') out.camera = { position: plain(v.position), target: plain(v.target) };
      else out[k] = Array.isArray(v) ? v.map(plain) : plain(v);
    }
    return { local: out, world: window.__t.world.getAnchors() };
  });
  const missing = REQUIRED_ANCHORS.filter((k) => !(k in a.local));
  assert(missing.length === 0, label + ': 자리가 모두 있다(칸·덤·바구니·돌아온 노래 선반·작품 방 문·기다리는 자리·다음 문·떠도는 노래) ' + JSON.stringify(missing));
  assert(a.local.slots.length === 3 && a.local.bonus.length === 3 && a.local.floating.length === 5, label + ': 층 자리 셋, 덤 자리 셋, 떠도는 노래 다섯');
  const pts = [];
  for (const k of REQUIRED_ANCHORS) (Array.isArray(a.local[k]) ? a.local[k] : [a.local[k]]).forEach((p, i) => pts.push({ k: k + (Array.isArray(a.local[k]) ? i : ''), p }));
  if (mode === '3d') {
    assert(a.local.camera?.position && a.local.camera?.target, label + ': 카메라 자리(position, target)가 있다');
    const out = pts.filter(({ p }) => Math.abs(p.x) > WING_REACH || Math.abs(p.z) > WING_REACH);
    assert(out.length === 0, label + ': 모든 자리가 학생이 걸어갈 수 있는 관 안이다 ' + JSON.stringify(out.map((o) => o.k)));
    assert(Array.isArray(a.world.slots) && a.world.slots.length === 3 && typeof a.world.slots[0].z === 'number', label + ': 세계 바탕이 자리를 세계 좌표로 돌려준다');
    let min = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) min = Math.min(min, Math.hypot(pts[i].p.x - pts[j].p.x, pts[i].p.z - pts[j].p.z));
    assert(min >= 0.8, label + ': 자리끼리 0.8m 이상 떨어져 있어 도착한 자리가 헷갈리지 않는다 (' + min.toFixed(2) + ')');
    // 서가 자리는 층 순서대로(4·8·10구 층) 그 층 서가 아래에 있다: 왼쪽에서 오른쪽으로 놓인다.
    assert(a.local.slots[0].x < a.local.slots[1].x && a.local.slots[1].x < a.local.slots[2].x, label + ': 층 자리가 4·8·10구 층 순서다');
  } else {
    const out = pts.filter(({ p }) => p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100);
    assert(out.length === 0, label + ': 모든 자리가 그림 판 안이다');
    const corner = pts.filter(({ p }) => p.x > 78 && p.y > 78);
    assert(corner.length === 0, label + ': 상황 버튼 구석(x>78%, y>78%)에 자리가 없다 ' + JSON.stringify(corner.map((o) => o.k)));
    let min = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) min = Math.min(min, Math.hypot((pts[i].p.x - pts[j].p.x) * 16 / 9, pts[i].p.y - pts[j].p.y));
    assert(min >= 7, label + ': 자리끼리 도착 반경(7) 이상 떨어져 있다 (' + min.toFixed(1) + ')');
    const hs = await ev(page, () => document.querySelectorAll('.board-hotspot').length);
    assert(hs === pts.length, label + ': 자리마다 누를 수 있는 자리가 생긴다 (' + hs + ')');
  }
  // 층 자리로 걸어가면 그 자리에 도착했다고 알려 준다.
  for (const [key, index] of [['slots', 2], ['floating', 0], ['roomDoor', null]]) {
    const before = await ev(page, () => window.__t.arrivals.length);
    await ev(page, ([k, i]) => { const w = window.__t.world.getAnchors()[k]; window.__t.world.moveTo(i === null ? w : w[i]); }, [key, index]);
    await page.waitForFunction((n) => window.__t.arrivals.length > n, before, { timeout: 15000 });
    const got = await ev(page, () => window.__t.arrivals.at(-1).anchor);
    const ok = got && got.key === key && (index === null ? got.index === undefined : got.index === index);
    assert(ok, label + ': ' + key + (index === null ? '' : ' ' + index) + ' 자리로 가면 그 자리에 도착했다고 알린다 ' + JSON.stringify(got));
  }
}

// ── 반응 사건 ──
async function checkReactions(page, mode, label) {
  const i0 = await info(page);
  assert(i0.fill === 0 && i0.door === 'closed' && i0.fog === true && i0.roomOpen === false, label + ': 처음에는 불 없음, 문 닫힘, 먹안개, 작품 방 닫힘');
  assert([...i0.shelf, ...i0.bonus, ...i0.basket].every((s) => s === null), label + ': 처음에는 모든 자리가 비어 있다');
  if (mode === '2d') {
    const ghosts = await ev(page, () => document.querySelectorAll('.hy-slot[data-state="empty"] .hy-slot__ghost').length);
    const titles = await ev(page, () => [...document.querySelectorAll('.hy-title')].map((t) => t.textContent).join(''));
    assert(ghosts === 6 && titles === '', label + ': 빈 자리는 제목 없는 빈 책등으로만 보인다 (' + ghosts + ')');
    const letters = await ev(page, () => document.querySelectorAll('.hy-aa-door text').length + document.querySelector('.hy-aa-door').textContent.trim().length);
    assert(letters === 0, label + ": '아아' 문 표지에 글자가 없다");
  }

  // 접기·두드리기·층 차오름
  const tower = await towerRect(page, mode);
  const t0 = await shot(page, tower);
  await emit(page, 'diorama:fold', { unit: 0 });
  await emit(page, 'diorama:pillar-light', { unit: 0, foot: null });
  for (let g = 1; g <= 4; g++) await emit(page, 'diorama:floor-fill', { gu: g });
  let i1 = await info(page);
  assert(JSON.stringify(i1.lit) === '[4,0,0]', label + ': 넷째 구까지 세면 4구 층만 찬다 ' + JSON.stringify(i1.lit));
  for (let g = 5; g <= 10; g++) await emit(page, 'diorama:floor-fill', { gu: g });
  i1 = await info(page);
  assert(JSON.stringify(i1.lit) === '[4,8,10]', label + ': 열째 구까지 세면 세 층이 다 찬다 ' + JSON.stringify(i1.lit));
  if (mode === '2d') {
    const lit = await ev(page, () => document.querySelectorAll('.hy-bay.is-lit').length);
    assert(lit === 22, label + ': 그림 판의 칸 불 22개가 모두 켜진다 (' + lit + ')');
  }
  await page.waitForTimeout(700);
  await frames(page, 2);
  const t1 = await shot(page, tower);
  assert(!t0.equals(t1), label + ': 층이 차오르면 탑 모습이 바뀐다');

  // 고유 동작: '아아' 문 열기
  const dr = await doorRect(page, mode);
  const d0 = await shot(page, dr);
  await page.waitForTimeout(250);
  await frames(page, 2);
  const d0b = await shot(page, dr);
  assert(d0.equals(d0b), label + ': (대조) 아무 사건이 없으면 문 자리 모습이 그대로다');
  await emit(page, 'diorama:aa-door', { present: true, unit: 8 });
  await page.waitForTimeout(1400);
  await frames(page, 2);
  const d1 = await shot(page, dr);
  const i2 = await info(page);
  assert(i2.door === 'open' && i2.doorUnit === 8, label + ": '아아' 문 사건(present)이면 문이 열린 상태가 된다");
  assert(!d0.equals(d1), label + ": '아아' 문이 열리는 것이 화면에 보인다");
  if (mode === '3d') {
    assert(i2.doorAngle < -1.5, label + ': 3D 문짝이 경첩을 축으로 돌아 열린다 (' + i2.doorAngle.toFixed(2) + ')');
  } else {
    const d = await ev(page, () => ({
      state: document.querySelector('.hy-aa-door').dataset.state,
      transform: getComputedStyle(document.querySelector('.hy-aa-door__leaf')).transform,
      revealed: document.querySelectorAll('.hy-bay.is-revealed').length,
    }));
    assert(d.state === 'open' && d.transform !== 'none' && d.revealed === 2, label + ': 2D 문짝이 젖혀지고 문 뒤 두 칸이 빛난다 ' + JSON.stringify(d));
  }
  // 새 노래를 세기 시작하면 문이 닫히고, 감탄사가 없으면 닫힌 채 표지가 흐려진다.
  await emit(page, 'diorama:floor-fill', { gu: 1 });
  await emit(page, 'diorama:aa-door', { present: false });
  await page.waitForTimeout(1400);
  await frames(page, 2);
  const i3 = await info(page);
  assert(i3.door === 'absent', label + ': 감탄사가 없으면(present: false) 문은 열리지 않고 없음 상태가 된다');
  if (mode === '3d') assert(Math.abs(i3.doorAngle) < 0.05, label + ': 없음이면 3D 문짝이 닫힌 채다 (' + i3.doorAngle.toFixed(3) + ')');
  else {
    const stroke = await ev(page, () => [getComputedStyle(document.querySelector('.hy-aa-sign circle')).stroke, getComputedStyle(document.body).getPropertyValue('--meok-fog')]);
    assert(stroke[0] === 'rgb(141, 138, 133)', label + ': 없음이면 2D 표지가 먹안개 빛으로 흐려진다 ' + JSON.stringify(stroke));
  }
  const d2 = await shot(page, dr);
  assert(!d1.equals(d2), label + ': 없음 상태도 열림과 다르게 보인다');

  // 다른 관의 고유 동작 사건은 오류 없이 넘긴다.
  await emit(page, 'diorama:stair-step', { step: 1, total: 3 });
  await emit(page, 'diorama:refrain-link', { from: { unit: 0, line: 1 }, to: { unit: 1, line: 1 } });
  await emit(page, 'diorama:walk-step', { step: 1 });
  await emit(page, 'diorama:unroll', { unit: 1, feet: 5 });
  assert((await info(page)).otherActions === 4, label + ': 다른 관의 고유 동작 사건 넷을 오류 없이 받는다');

  // 꽂기·바구니·삐져나옴
  const booksBefore = (await info(page)).books;
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 0, songId: 'chan-giparangga' });
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 1, songId: 'cheoyongga' });
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 2, songId: 'namodo-bahi' });
  await emit(page, 'diorama:slot-set', { area: 'basket', index: 0, songId: 'gasiri', to: 'goryeo' });
  await emit(page, 'diorama:slot-set', { area: 'basket', index: 1, songId: 'dongjitdal', to: 'sijo' });
  await emit(page, 'diorama:slot-set', { area: 'bonus', index: 0, songId: 'heonhwaga' });
  await emit(page, 'diorama:slot-set', { area: 'bonus', index: 1, songId: 'dongjitdal' });
  let i4 = await info(page);
  assert(i4.shelf.map((s) => s.songId).join() === 'chan-giparangga,cheoyongga,namodo-bahi' && i4.basket[0].to === 'goryeo', label + ': 꽂은 노래와 바구니 행선지가 자리에 들어간다');
  if (mode === '2d') {
    const s = await ev(page, () => ({
      states: [...document.querySelectorAll('.hy-slot[data-area="shelf"]')].map((g) => g.dataset.state).join(),
      titles: [...document.querySelectorAll('.hy-title')].map((t) => t.textContent).join(''),
      tag: document.querySelector('.hy-slot[data-area="basket"][data-index="0"] .hy-tag__text').textContent,
    }));
    assert(s.states === 'filled,filled,filled' && s.titles === '' && s.tag === '고려가요관', label + ': 꽂힌 책은 묶이기 전까지 제목이 없고, 바구니에는 행선지 표가 붙는다 ' + JSON.stringify(s));
  } else {
    assert(i4.books > booksBefore, label + ': 꽂으면 3D 책이 늘어난다');
  }
  await emit(page, 'diorama:pop-out', { area: 'shelf', index: 0, songId: 'chan-giparangga', genre: 'hyangga' });
  await emit(page, 'diorama:pop-out', { area: 'shelf', index: 2, songId: 'namodo-bahi', genre: 'saseol' });
  await emit(page, 'diorama:pop-out', { area: 'bonus', index: 1, songId: 'dongjitdal', genre: 'sijo' });
  await emit(page, 'diorama:pop-out', { area: 'basket', index: 1, songId: 'dongjitdal', genre: 'sijo' });
  await page.waitForTimeout(800);
  i4 = await info(page);
  assert(i4.shelf[2].popped === 'saseol' && i4.shelf[0].popped === 'hyangga' && i4.basket[1].popped === 'sijo' && i4.basket[1].to === null, label + ': 틀린 노래만 삐져나오고 바구니 행선지 표시는 지워진다');
  assert(i4.shelf[1].popped === null, label + ': 맞은 노래는 그대로 꽂혀 있다');
  if (mode === '2d') {
    const box = await ev(page, () => {
      const bb = (sel) => document.querySelector(sel + ' .hy-slot__pop').getBBox();
      return {
        saseol: bb('.hy-slot[data-area="shelf"][data-index="2"]').width,
        sijo: bb('.hy-slot[data-area="bonus"][data-index="1"]').width,
        hyangga: bb('.hy-slot[data-area="shelf"][data-index="0"]').height,
        book: document.querySelector('.hy-slot[data-area="shelf"][data-index="1"] .hy-slot__book').getBBox().height,
      };
    });
    assert(box.saseol > box.sijo * 1.5, label + ': 사설시조는 가운데가 길게 삐져나와 시조보다 훨씬 길다 ' + JSON.stringify(box));
    assert(box.hyangga > box.book * 1.8, label + ': 10구 노래는 4구 층 자리 위로 높이 솟는다');
  } else {
    assert(i4.books > booksBefore + 8, label + ': 삐져나온 노래가 갈래 모양 마디로 그려진다 (' + i4.books + ')');
  }

  // 묶기: 제본·금박, 제목이 나타나고 작품 방 문이 열린다.
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 0, songId: 'seodongyo' });
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 2, songId: 'chan-giparangga' });
  await emit(page, 'diorama:shelf-bound', { area: 'shelf', songIds: ['seodongyo', 'cheoyongga', 'chan-giparangga'] });
  await emit(page, 'diorama:slot-set', { area: 'bonus', index: 1, songId: 'mojukjirangga' });
  await emit(page, 'diorama:slot-set', { area: 'bonus', index: 2, songId: 'anminga' });
  await emit(page, 'diorama:shelf-bound', { area: 'bonus', songIds: ['heonhwaga', 'mojukjirangga', 'anminga'] });
  await page.waitForTimeout(1300);
  const i5 = await info(page);
  assert(i5.bound.shelf?.join() === 'seodongyo,cheoyongga,chan-giparangga' && i5.bound.bonus?.length === 3, label + ': 탑과 덤 서가가 묶인다');
  assert(i5.roomOpen === true, label + ': 탑이 묶이면 작품 방 문이 열린다');
  if (mode === '2d') {
    const s = await ev(page, () => ({
      titles: [...document.querySelectorAll('.hy-title')].map((t) => t.textContent),
      bound: document.querySelectorAll('.hy-slot[data-state="bound"]').length,
      cord: getComputedStyle(document.querySelector('.hy-bind')).display,
      room: document.querySelector('.hy-room-door').dataset.open,
      roomTitle: document.querySelector('.hy-room-door .hy-plaque__text').textContent,
    }));
    assert(s.titles.slice(0, 3).join() === '서동요,처용가,찬기파랑가' && s.bound === 6 && s.cord !== 'none', label + ': 묶이면 금박 띠·실과 함께 제목이 나타난다 ' + JSON.stringify(s));
    assert(s.room === 'true' && s.roomTitle === '제망매가', label + ': 작품 방 「제망매가」 문이 열린다');
  }

  // 먹안개가 물러나고 단청이 돌아온다.
  await emit(page, 'diorama:fog-recede', {});
  await emit(page, 'diorama:dancheong-restore', {});
  await page.waitForTimeout(2600);
  await frames(page, 2);
  const i6 = await info(page);
  assert(i6.fog === false && i6.restored === true, label + ': 먹안개가 물러나고 단청 돌아옴을 받는다');
  if (mode === '3d') {
    assert(i6.fogOpacity === 0, label + ': 3D 먹안개가 완전히 걷힌다 (' + i6.fogOpacity + ')');
    assert(i6.level === 1, label + ': 3D 재질 색이 단청(1)까지 돌아온다 (' + i6.level + ')');
  } else {
    const s = await ev(page, () => ({ fog: getComputedStyle(document.querySelector('.hy-fog')).opacity, level: getComputedStyle(document.querySelector('.board')).getPropertyValue('--dancheong').trim() }));
    assert(s.fog === '0' && s.level === '1', label + ': 2D 먹안개가 걷히고 그림 판 단청 값이 1이 된다 ' + JSON.stringify(s));
  }
  const t2 = await shot(page, tower);
  assert(!t1.equals(t2), label + ': 단청이 돌아오면 탑 빛깔이 바뀐다');

  // 음성 사례: 모르는 사건과 잘못된 detail은 조용히 넘기고 상태를 바꾸지 않는다.
  const before = JSON.stringify(await info(page));
  const threw = await ev(page, () => {
    const h = window.__t.h();
    try {
      h.react('diorama:no-such-event', { unit: 1 });
      h.react('diorama:slot-set', { area: 'attic', index: 9, songId: 'x' });
      h.react('diorama:slot-set', { area: 'shelf', index: 7, songId: 'x' });
      h.react('diorama:pop-out', null);
      h.react('diorama:aa-door');
      h.react(undefined, undefined);
      return false;
    } catch (e) { return String(e); }
  });
  assert(threw === false, label + ': (음성) 모르는 사건·빈 detail에도 오류를 내지 않는다 ' + threw);
  const after = await info(page);
  // aa-door detail이 없으면 present가 없으므로 '없음'으로 받는다. 그 밖은 그대로여야 한다.
  const a2 = { ...after, door: JSON.parse(before).door, doorUnit: JSON.parse(before).doorUnit, doorAngle: JSON.parse(before).doorAngle };
  assert(JSON.stringify(a2) === before, label + ': (음성) 모르는 사건은 상태를 바꾸지 않는다');
}

async function checkDrawCalls(page, label) {
  await frames(page, 3);
  const s = await ev(page, () => window.__t.world.getStats());
  console.log('  · ' + label + ' 그리기 호출 ' + s.drawCalls + '회, 삼각형 ' + s.triangles);
  assert(withinBudget(s.drawCalls), label + ': 그리기 호출이 예산(' + BUDGET + ') 안이다');
  assert(s.shadows === false, label + ': 실시간 그림자를 쓰지 않는다');
}

async function checkReentry(page, mode, label) {
  await ev(page, () => { window.__t.world.setDancheong('hyangga', 1); window.__t.world.enterCorridor(); window.__t.world.enterWing('hyangga'); });
  await frames(page, 3);
  const i = await info(page);
  assert(i.fog === false && i.roomOpen === true && i.restored === true, label + ': 마친 관에 다시 들어오면 먹안개 없이 단청과 열린 작품 방으로 시작한다');
  if (mode === '3d') {
    const left = await ev(page, () => window.__t.handles.at(-2).root.children.length);
    assert(left === 0, label + ': 나갈 때 만든 것을 모두 치운다 (' + left + ')');
  } else {
    const boards = await ev(page, () => document.querySelectorAll('.hy-board').length);
    assert(boards === 1, label + ': 나갈 때 그림 판을 치우고 하나만 남는다 (' + boards + ')');
  }
}

async function checkReduceMotion(page, label) {
  await ev(page, () => window.__t.world.setDeviceReduceMotion(true));
  await emit(page, 'diorama:floor-fill', { gu: 1 });
  await emit(page, 'diorama:aa-door', { present: true, unit: 8 });
  await frames(page, 2);
  const i = await info(page);
  assert(Math.abs(i.doorAngle + 1.75) < 1e-6, label + ': 움직임 줄이기면 문이 애니메이션 없이 바로 열린다 (' + i.doorAngle.toFixed(3) + ')');
  await ev(page, () => window.__t.world.setDeviceReduceMotion(false));
}

// ── 실행 ──
const server = await startServer();
const sessions = [];
let failed = false;

async function session(label, opts, body) {
  console.log('\n▶ ' + label);
  const game = await open(server, opts);
  sessions.push(game);
  try {
    await body(game);
    assert(game.external.length === 0, label + ': 바깥 주소 요청이 없다 ' + game.external.join(', '));
    assert(game.errors.length === 0, label + ': 콘솔 오류가 없다 ' + game.errors.join(' | '));
  } finally {
    await game.close();
  }
}

try {
  checkShared();
  assert(!withinBudget(BUDGET + 1) && !withinBudget(0), '(음성) 예산 검사가 초과와 0을 잡는다');

  for (const [key, vp] of [['chromebook', VIEWPORTS.chromebook], ['phone', VIEWPORTS.phone]]) {
    await session('3D ' + key + ' ' + vp.width + 'x' + vp.height, { viewport: vp }, async ({ page }) => {
      const label = '3D ' + key;
      assert((await ev(page, () => window.__t.world.getMode())) === '3d' && (await ev(page, () => window.__t.h() !== null)), label + ': 3D로 열고 향가관 모형을 끼운다');
      await checkAnchors(page, '3d', label);
      await ev(page, () => { window.__t.world.enterCorridor(); window.__t.world.enterWing('hyangga'); window.__t.world.resetCamera(); });
      await frames(page, 4);
      await checkDrawCalls(page, label + ' 처음');
      await checkReactions(page, '3d', label);
      await checkDrawCalls(page, label + ' 반응 뒤');
      if (key === 'chromebook') await checkReduceMotion(page, label);
      await checkReentry(page, '3d', label);
    });
  }

  for (const [key, vp] of [['chromebook', VIEWPORTS.chromebook], ['phone', VIEWPORTS.phone]]) {
    await session('2D ' + key + ' ' + vp.width + 'x' + vp.height, { viewport: vp, disable3d: true }, async ({ page }) => {
      const label = '2D ' + key;
      assert((await ev(page, () => window.__t.world.getMode())) === '2d' && (await ev(page, () => !!document.querySelector('.hy-board svg'))), label + ': 3D가 없으면 2D 그림 판에 향가관을 그린다');
      await checkAnchors(page, '2d', label);
      await ev(page, () => { window.__t.world.enterCorridor(); window.__t.world.enterWing('hyangga'); });
      await frames(page, 3);
      await checkReactions(page, '2d', label);
      await checkReentry(page, '2d', label);
    });
  }

  // 음성 사례: 관 모형이 그리기 호출을 너무 많이 쓰면 예산 검사가 잡는다.
  await session('그리기 호출 초과(음성)', { viewport: VIEWPORTS.chromebook }, async ({ page }) => {
    await ev(page, () => { globalThis.__hyHeavy = 80; window.__t.world.enterCorridor(); window.__t.world.enterWing('hyangga'); window.__t.world.resetCamera(); });
    await frames(page, 4);
    const s = await ev(page, () => window.__t.world.getStats());
    console.log('  · 상자를 더 붙인 향가관 그리기 호출: ' + s.drawCalls + '회');
    assert(!withinBudget(s.drawCalls), '(음성) 그리기 호출이 예산을 넘으면 점검이 잡는다');
  });
} catch (e) {
  failed = true;
  console.error(e.stack || e.message);
} finally {
  for (const g of sessions) await g.close().catch(() => {});
  await server.close();
}
process.exitCode = failed ? 1 : 0;
