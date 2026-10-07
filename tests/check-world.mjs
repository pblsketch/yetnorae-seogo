// 세계 바탕 점검(T4, spec 3.1·5.2·14·17·20·22).
// 탭 이동, 조이스틱(터치에서만), 키보드(마우스 기기), 상황 버튼, 끌어 돌리기 제한, 회전 안내와 멈춤·이어 하기,
// 3D를 끈 브라우저에서 2D 그림 판, 반반 틀의 넘침, 움직임 줄이기, 그리기 호출 예산, 관 모형 약속, 바깥 요청·콘솔 오류.
// 점검 페이지 tests/pages/world.html이 세계 바탕을 단독으로 띄운다(제품 흐름에는 없다).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { TOKENS } from '../js/world/palette.js';
import { TUNING } from '../js/world/tuning.js';

const PAGE = 'tests/pages/world.html';
const BUDGET = 60;
const SIZES = { ...VIEWPORTS, fourThree: { width: 1024, height: 768 } };

// ── 페이지 안에서 쓰는 검사 함수들 ──

// 화면 배치 문제 목록. 문서 넘침, 화면 밖으로 나간 주요 요소, 48px보다 작은 버튼, 반반 패널 안의 가로 넘침.
function layoutProblems() {
  const out = [];
  const vw = innerWidth;
  const vh = innerHeight;
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1 || de.scrollHeight > vh + 1) out.push('문서 넘침 ' + de.scrollWidth + 'x' + de.scrollHeight);
  const visible = (e) => {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('[hidden]');
  };
  const sel = '.world, .world-view, .world-panel, .world-safe, .world-context, .board, .world-canvas, .rotate-overlay, .world-panel > *';
  for (const e of document.querySelectorAll(sel)) {
    if (!visible(e)) continue;
    const r = e.getBoundingClientRect();
    // 패널 안 내용은 세로로 스크롤되므로 가로만 본다.
    const inPanel = e.parentElement?.classList.contains('world-panel');
    if (r.left < -1 || r.right > vw + 1 || (!inPanel && (r.top < -1 || r.bottom > vh + 1))) out.push('화면 밖: ' + e.className + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
  }
  for (const b of document.querySelectorAll('.world button')) {
    if (!visible(b)) continue;
    const r = b.getBoundingClientRect();
    if (r.width < 47.5 || r.height < 47.5) out.push('작은 버튼: ' + (b.textContent || b.getAttribute('aria-label')) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  const panel = document.querySelector('.world.is-split .world-panel');
  if (panel && panel.scrollWidth > panel.clientWidth + 1) out.push('패널 가로 넘침 ' + panel.scrollWidth + '>' + panel.clientWidth);
  return out;
}

function rectOf(selector) {
  const e = document.querySelector(selector);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  const s = getComputedStyle(e);
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, display: s.display, visible: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && !e.closest('[hidden]') };
}

// ── 도우미 ──

async function open(server, opts = {}) {
  const game = await openGame(server.url, { path: PAGE, ...opts });
  await game.page.waitForFunction(() => window.__t?.ready === true, null, { timeout: 20000 });
  await frames(game.page, 3);
  return game;
}

function frames(page, n = 2) {
  return page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const withinBudget = (calls) => calls > 0 && calls <= BUDGET;

async function waitArrival(page, before, timeout = 10000) {
  await page.waitForFunction((n) => window.__t.arrivals.length > n, before, { timeout });
  return ev(page, () => window.__t.arrivals.at(-1));
}

// 탭(또는 클릭)으로 이동해 도착하는지. how: 'mouse' | 'touch'. 목표 지점은 걸을 수 있는 곳 안에서 고른다.
// 카메라와 학생이 멈춘 상태(카메라가 따라갈 자리에 닿았고, 학생 자리가 프레임 사이에 바뀌지 않음)를 기다린다.
// 시간으로 기다리지 않는다: 바쁜 기기에서는 카메라가 늦게 자리 잡으므로, 움직이는 카메라로 계산한 화면 좌표를 누르면 엇나간다.
async function settled(page, timeout = 20000) {
  // 판별 함수는 동기여야 한다(약속을 돌려주면 waitForFunction이 값을 보지 않고 끝난다). 프레임마다 앞 프레임과 비교한다.
  await ev(page, () => { window.__settle = null; });
  await page.waitForFunction(() => {
    const w = window.__t.world;
    const p = w.getPlayer();
    const c = w.getCamera();
    const last = window.__settle;
    window.__settle = p;
    const still = !!last && Math.abs(last.x - p.x) < 1e-4 && Math.abs((last.z ?? last.y) - (p.z ?? p.y)) < 1e-4;
    return still && (!c || c.position === null || c.distanceToDesired < 0.005) && !w.getMarker().visible;
  }, null, { timeout, polling: 'raf' });
}

async function checkTapMove(page, how, label) {
  const mode = await ev(page, () => window.__t.world.getMode());
  await settled(page);
  // 누를 화면 좌표와 그 자리의 세계 좌표, 그리고 그 자리에서 8px이 세계에서 얼마인지(카메라가 멈춘 상태에서 잰다)
  const goal = await ev(page, (mode) => {
    const w = window.__t.world;
    const p = w.getPlayer();
    const g = mode === '3d' ? { x: p.x + 2.2, z: p.z + 0.6 } : { x: Math.min(90, p.x + 18), y: 86 };
    const s = w.toScreen(g);
    const one = w.toScreen(mode === '3d' ? { x: g.x + 1, z: g.z } : { x: g.x + 1, y: g.y });
    const pxPerUnit = Math.hypot(one.x - s.x, one.y - s.y);
    return { g, s, tol: 8 / pxPerUnit };
  }, mode);
  const before = await ev(page, () => window.__t.arrivals.length);
  if (how === 'touch') await page.touchscreen.tap(goal.s.x, goal.s.y);
  else await page.mouse.click(goal.s.x, goal.s.y);
  const marker = await ev(page, () => window.__t.world.getMarker());
  assert(marker.visible, label + ': 탭한 곳에 도착 표시가 생긴다');
  // 도착 표시는 세계에 놓인다. 탭 뒤로 카메라가 학생을 따라 움직이므로 화면 좌표가 아니라 세계 좌표로 대 본다(허용 오차 = 누른 때의 8px).
  const k = mode === '3d' ? 'z' : 'y';
  const dist = Math.hypot(marker.x - goal.g.x, marker[k] - goal.g[k]);
  assert(dist <= goal.tol, label + ': 도착 표시가 탭한 자리에 있다 (어긋남 ' + dist.toFixed(3) + ' ≤ ' + goal.tol.toFixed(3) + ', 8px)');
  const arrived = await waitArrival(page, before);
  const p = await ev(page, () => window.__t.world.getPlayer());
  const k2 = mode === '3d' ? 'z' : 'y';
  const tol = mode === '3d' ? 0.15 : 1.5;
  assert(near(p.x, marker.x, tol) && near(p[k2], marker[k2], tol), label + ': 학생이 목표에 도착한다 (' + p.x.toFixed(2) + ',' + p[k2].toFixed(2) + ')');
  assert(arrived && arrived.position, label + ': 도착 알림(onArrive)이 온다');
  const after = await ev(page, () => window.__t.world.getMarker());
  assert(!after.visible, label + ': 도착하면 도착 표시가 사라진다');
}

async function checkLayout(page, label) {
  const probs = await ev(page, layoutProblems);
  assert(probs.length === 0, label + ': 배치가 화면 안에 있고 넘침과 작은 버튼이 없다 ' + JSON.stringify(probs));
}

async function checkSafeBox(page, label, vp) {
  const r = await ev(page, rectOf, '.world-safe');
  assert(r && near(r.width / r.height, 16 / 9, 0.02), label + ': 안전 상자가 16:9다 (' + Math.round(r?.width) + 'x' + Math.round(r?.height) + ')');
  assert(near(r.width, vp.width, 1) || near(r.height, vp.height, 1), label + ': 안전 상자가 화면 한쪽 길이를 꽉 채운다');
}

async function checkContextButton(page, label) {
  await ev(page, () => window.__t.world.setContext('잡기', () => window.__t.contextCalls.push('잡기')));
  const b = await ev(page, rectOf, '.world-context');
  assert(b?.visible, label + ': 상황 버튼이 보인다');
  const text = await page.textContent('.world-context');
  assert(text.trim() === '잡기', label + ': 상황 버튼 이름표를 부르는 쪽이 정한다');
  const safe = await ev(page, rectOf, '.world-safe');
  const vp = page.viewportSize();
  assert(b.right > vp.width * 0.6 && b.bottom > vp.height * 0.6, label + ': 상황 버튼이 오른쪽 아래에 있다');
  assert(b.left >= safe.left - 1 && b.right <= safe.right + 1 && b.top >= safe.top - 1 && b.bottom <= safe.bottom + 1, label + ': 상황 버튼이 안전 상자 안에 있다');
  assert(b.width >= 48 && b.height >= 48, label + ': 상황 버튼이 48px 이상이다');
  const before = await ev(page, () => window.__t.contextCalls.length);
  await page.click('.world-context');
  const m = await ev(page, () => window.__t.world.getMarker());
  assert((await ev(page, () => window.__t.contextCalls.length)) === before + 1, label + ': 상황 버튼을 누르면 맡긴 동작이 한 번 불린다');
  assert(!m.visible, label + ': 상황 버튼을 눌러도 이동하지 않는다(탭 이동은 세계 영역에서만)');
}

async function checkSplit(page, label) {
  await ev(page, () => {
    const p = document.createElement('div');
    p.className = 'test-panel';
    p.innerHTML = '<h2>두루마리</h2>' + '<p>긴 글줄이 이어지는 두루마리 패널의 시험용 내용입니다.</p>'.repeat(40);
    window.__t.world.openSplit(p);
  });
  await frames(page, 3);
  const vp = page.viewportSize();
  const view = await ev(page, rectOf, '.world-view');
  const panel = await ev(page, rectOf, '.world-panel');
  assert(view.visible && panel.visible, label + ': 반반 틀에서 왼쪽 디오라마와 오른쪽 패널이 보인다');
  assert(view.left >= -1 && view.right <= panel.left + 1 && panel.right <= vp.width + 1, label + ': 왼쪽 디오라마와 오른쪽 패널이 겹치지 않고 나란하다');
  assert(near(view.width, panel.width, vp.width * 0.06), label + ': 화면이 반씩 나뉜다 (' + Math.round(view.width) + '/' + Math.round(panel.width) + ')');
  const controls = await ev(page, rectOf, '.world-controls');
  const ctx = await ev(page, rectOf, '.world-context');
  assert(!controls?.visible && !ctx?.visible, label + ': 반반 틀에서는 이동 조작과 상황 버튼이 숨는다');
  await checkLayout(page, label + ' 반반');
  const mode = await ev(page, () => window.__t.world.getMode());
  if (mode === '3d') {
    const c = await ev(page, rectOf, '.world-canvas');
    assert(near(c.width, view.width, 2), label + ': 3D 그림이 왼쪽 칸 크기로 맞춰진다');
  } else {
    const b = await ev(page, rectOf, '.board');
    assert(b.right <= view.right + 1 && near(b.width / b.height, 16 / 9, 0.02), label + ': 2D 그림 판이 왼쪽 칸 안에서 16:9를 지킨다');
  }
  await page.mouse.click(view.left + view.width / 2, view.top + view.height * 0.7);
  await frames(page, 2);
  assert(!(await ev(page, () => window.__t.world.getMarker())).visible, label + ': 반반 틀에서는 탭해도 이동하지 않는다');
  // 2D 누를 자리(관 문·관 모형 자리)도 3D 탭과 같은 조건을 따른다: 반반 틀 동안 눌러도 걷지 않는다
  const hotspot = mode === '2d' ? await ev(page, () => { const h = document.querySelector('.board-hotspot, .board-door'); return h ? (h.dataset.anchor ? '.board-hotspot[data-anchor="' + h.dataset.anchor + '"]' + (h.dataset.index ? '[data-index="' + h.dataset.index + '"]' : '') : '.board-door[data-wing="' + h.dataset.wing + '"]') : null; }) : null;
  if (hotspot) {
    const a0 = await ev(page, () => window.__t.arrivals.length);
    await ev(page, (sel) => document.querySelector(sel).click(), hotspot);
    await frames(page, 4);
    const r = await ev(page, () => ({ marker: window.__t.world.getMarker().visible, arrivals: window.__t.arrivals.length }));
    assert(!r.marker && r.arrivals === a0, label + ': 반반 틀에서는 2D 누를 자리를 눌러도 걷지 않는다 (' + hotspot + ')');

  }
  // 음성 사례: 패널 안에 넓은 내용을 넣으면 넘침 검사가 잡아야 한다.
  await ev(page, () => { const w = document.createElement('div'); w.id = 'too-wide'; w.style.minWidth = '3000px'; w.style.height = '10px'; document.querySelector('.test-panel').append(w); });
  const bad = await ev(page, layoutProblems);
  assert(bad.length > 0, label + ': (음성) 패널 넘침을 넣으면 넘침 검사가 잡는다');
  await ev(page, () => document.getElementById('too-wide').remove());
  await ev(page, () => window.__t.world.closeSplit());
  await frames(page, 3);
  const back = await ev(page, rectOf, '.world-view');
  assert(near(back.width, vp.width, 2), label + ': 반반 틀을 닫으면 디오라마가 다시 화면을 채운다');
  const ctx2 = await ev(page, rectOf, '.world-context');
  assert(ctx2?.visible, label + ': 반반 틀을 닫으면 상황 버튼이 돌아온다');
  if (hotspot) {
    // 음성 사례: 반반 틀을 닫으면 같은 자리를 눌러 걸어간다(누르기가 실제로 닿는지)
    const a0 = await ev(page, () => window.__t.arrivals.length);
    await ev(page, (sel) => document.querySelector(sel).click(), hotspot);
    await waitArrival(page, a0);
    assert(true, label + ': (음성) 반반 틀을 닫으면 같은 2D 누를 자리로 걸어간다');
    await settled(page);
  }
}

async function checkOrientation(page, label, vp) {
  const n0 = await ev(page, () => window.__t.log.length);
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForFunction(() => { const o = document.querySelector('.rotate-overlay'); return o && !o.hidden; }, null, { timeout: 5000 });
  const text = await page.textContent('.rotate-overlay');
  assert(text.includes('기기를 돌려 주세요'), label + ': 세로로 들면 "기기를 돌려 주세요"가 뜬다');
  const evs = await ev(page, (n) => window.__t.log.slice(n), n0);
  assert(evs.some((e) => e.name === 'orientation:pause'), label + ': 세로로 들면 orientation:pause를 낸다');
  assert(evs.some((e) => e.name === 'audio:pause' && e.detail?.reason === 'orientation'), label + ': 소리 엔진에 audio:pause(orientation)를 보낸다');
  const o = await ev(page, rectOf, '.rotate-overlay');
  assert(o.width >= vp.height - 1 && o.height >= vp.width - 1, label + ': 회전 안내가 화면 전체를 덮는다');
  const f1 = await ev(page, () => window.__t.world.getStats().frames);
  await page.waitForTimeout(300);
  const f2 = await ev(page, () => window.__t.world.getStats().frames);
  assert(f1 === f2, label + ': 세로일 때 세계가 멈춘다 (프레임 ' + f1 + '→' + f2 + ')');
  const n1 = await ev(page, () => window.__t.log.length);
  await page.setViewportSize(vp);
  await page.waitForFunction(() => document.querySelector('.rotate-overlay')?.hidden === true, null, { timeout: 5000 });
  const evs2 = await ev(page, (n) => window.__t.log.slice(n), n1);
  assert(evs2.some((e) => e.name === 'orientation:resume'), label + ': 가로로 돌아오면 orientation:resume을 낸다');
  assert(evs2.some((e) => e.name === 'audio:resume' && e.detail?.reason === 'orientation'), label + ': 소리 엔진에 audio:resume(orientation)을 보낸다');
  await page.waitForTimeout(200);
  const f3 = await ev(page, () => window.__t.world.getStats().frames);
  assert(f3 > f2, label + ': 가로로 돌아오면 세계가 다시 움직인다');
}

async function checkKeyboard(page, label) {
  const fine = await ev(page, () => matchMedia('(pointer: fine)').matches);
  assert(fine, label + ': 마우스 기기로 열렸다((pointer: fine))');
  const p0 = await ev(page, () => window.__t.world.getPlayer());
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyD');
  await frames(page, 3);
  const p1 = await ev(page, () => window.__t.world.getPlayer());
  assert(p1.x > p0.x + 0.3, label + ': D 키로 오른쪽으로 걷는다 (' + p0.x.toFixed(2) + '→' + p1.x.toFixed(2) + ')');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(450);
  await page.keyboard.up('ArrowLeft');
  await frames(page, 3);
  const p2 = await ev(page, () => window.__t.world.getPlayer());
  assert(p2.x < p1.x - 0.3, label + ': 왼쪽 방향키로 왼쪽으로 걷는다');
  const c0 = await ev(page, () => window.__t.contextCalls.length);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  const c1 = await ev(page, () => window.__t.contextCalls.length);
  assert(c1 === c0 + 2, label + ': Enter와 Space가 상황 버튼을 누른다 (' + (c1 - c0) + '번)');
}

// 꽉 덮는 겹(수첩·일지·도감·보스 창처럼 data-world-cover를 단 요소)이 떠 있으면 키보드가 세계에 닿지 않는다:
// Enter·Space가 상황 버튼을 누르지 않고(뒤에서 꽂기·들어가기가 일어나지 않게), 방향키를 가로채지 않아 겹 창이 스크롤된다.
async function checkKeyboardBehindCover(page, label) {
  await ev(page, () => {
    window.__t.world.setContext('잡기', () => window.__t.contextCalls.push('잡기'));
    const c = document.createElement('section');
    c.className = 'test-cover';
    c.dataset.worldCover = '';
    c.tabIndex = -1;
    c.style.cssText = 'position:absolute;inset:0;z-index:50;overflow:auto;background:#fff';
    c.innerHTML = '<p style="height:4000px;margin:0">수첩 쪽</p>';
    document.getElementById('app').append(c);
    c.focus();
    // 세계의 keydown 듣기(window)보다 나중에 붙여서, 세계가 기본 동작을 막았는지 본다
    window.__keyLog = [];
    window.__keyListen = (e) => window.__keyLog.push({ code: e.code, prevented: e.defaultPrevented });
    window.addEventListener('keydown', window.__keyListen);
  });
  await frames(page, 2);
  const c0 = await ev(page, () => window.__t.contextCalls.length);
  const p0 = await ev(page, () => window.__t.world.getPlayer());
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(200);
  await page.keyboard.up('KeyW');
  await frames(page, 2);
  const r = await ev(page, () => ({
    calls: window.__t.contextCalls.length,
    prevented: window.__keyLog.filter((k) => k.prevented).map((k) => k.code),
    keys: window.__keyLog.length,
    scroll: document.querySelector('.test-cover').scrollTop,
    covered: window.__t.world.isCovered(),
    player: window.__t.world.getPlayer(),
  }));
  assert(r.covered, label + ': data-world-cover 겹이 뜨면 세계가 가려진 것으로 본다');
  assert(r.keys >= 4, label + ': 눌린 키가 페이지에 닿았다 (' + r.keys + ')');
  assert(r.calls === c0, label + ': 가려진 동안 Enter·Space가 상황 버튼을 누르지 않는다 (' + (r.calls - c0) + '번)');
  assert(r.prevented.length === 0, label + ': 가려진 동안 방향키·Space의 기본 동작을 막지 않는다 ' + JSON.stringify(r.prevented));
  assert(r.scroll > 0, label + ': 가려진 동안 방향키로 겹 창이 스크롤된다 (scrollTop ' + r.scroll + ')');
  assert(Math.abs(r.player.x - p0.x) < 1e-6 && Math.abs((r.player.z ?? r.player.y) - (p0.z ?? p0.y)) < 1e-6, label + ': 가려진 동안 키로 학생이 움직이지 않는다');
  // 음성 사례: 겹을 걷으면 같은 키가 다시 세계에 닿는다(점검이 키 누름을 제대로 세는지)
  await ev(page, () => { document.querySelector('.test-cover').remove(); document.activeElement?.blur?.(); window.__keyLog.length = 0; });
  await frames(page, 2);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  const r2 = await ev(page, () => ({ calls: window.__t.contextCalls.length, prevented: window.__keyLog.filter((k) => k.prevented).map((k) => k.code), covered: window.__t.world.isCovered() }));
  await ev(page, () => window.removeEventListener('keydown', window.__keyListen));
  assert(!r2.covered && r2.calls === c0 + 1, label + ': (음성) 겹을 걷으면 Enter가 다시 상황 버튼을 누른다');
  assert(r2.prevented.includes('ArrowDown'), label + ': (음성) 겹을 걷으면 방향키를 다시 세계가 받는다');
}

// 3D 그림판을 잃었다가 되찾으면 그 자리에서 다시 그리고, 2D로 바꾸지 않는다(js/world/webgl.js, world.js '그림판 잃음').
async function checkContextRestore(page, label) {
  await ev(page, () => {
    const gl = window.__t.world.getThree().renderer.getContext();
    window.__lose = gl.getExtension('WEBGL_lose_context');
    window.__lose.loseContext();
  });
  await page.waitForFunction(() => window.__t.world.getThree().renderer.getContext().isContextLost(), null, { timeout: 5000 });
  await ev(page, () => window.__t.world.getThree().renderer.info.reset());
  const f1 = await ev(page, () => window.__t.world.getStats().frames);
  await page.waitForTimeout(400);
  const lost = await ev(page, () => ({ frames: window.__t.world.getStats().frames, calls: window.__t.world.getStats().drawCalls }));
  assert(lost.frames === f1 && lost.calls === 0, label + ': (음성) 그림판을 잃은 동안은 그리지 않는다 (프레임 ' + f1 + '→' + lost.frames + ', 그리기 ' + lost.calls + ')');
  await page.waitForTimeout(800);
  assert((await ev(page, () => window.__t.world.getMode())) === '3d' && (await ev(page, () => window.__t.modeChanges.length)) === 0, label + ': 기다리는 시간 안에는 2D로 바꾸지 않는다');
  await ev(page, () => window.__lose.restoreContext());
  await page.waitForFunction(() => !window.__t.world.getThree().renderer.getContext().isContextLost(), null, { timeout: 5000 });
  await page.waitForFunction(() => window.__t.world.getStats().drawCalls > 0, null, { timeout: 5000, polling: 'raf' });
  const back = await ev(page, () => window.__t.world.getStats());
  assert(back.drawCalls > 0 && back.frames > lost.frames, label + ': 되찾으면 다시 그린다 (그리기 ' + back.drawCalls + '회)');
  await page.waitForTimeout(3500);
  const after = await ev(page, () => ({ mode: window.__t.world.getMode(), changes: window.__t.modeChanges.length, canvas: !!document.querySelector('canvas.world-canvas') }));
  assert(after.mode === '3d' && after.changes === 0 && after.canvas, label + ': 되찾았으면 기다리는 시간이 지나도 3D 그대로다');
}

// 3D 그림판을 잃고 되찾지 못하면 이번 창은 2D 그림 판으로 가고, 지금 자리(관)와 관 문 상태를 다시 놓은 뒤 onModeChange로 알린다.
async function checkContextGiveUp(page, label) {
  await ev(page, () => {
    window.__t.events.emit('wing:state', { wing: 'hyangga', state: 'open' });
    window.__t.world.enterWing('hyangga');
  });
  await frames(page, 3);
  const t0 = Date.now();
  await ev(page, () => window.__t.world.getThree().renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await page.waitForTimeout(Math.max(0, TUNING.contextRestoreMs - 1200));
  assert((await ev(page, () => window.__t.world.getMode())) === '3d', label + ': (음성) ' + TUNING.contextRestoreMs + 'ms가 지나기 전에는 3D 그대로 기다린다');
  await page.waitForFunction(() => window.__t.world.getMode() === '2d', null, { timeout: 6000 });
  const waited = Date.now() - t0;
  const r = await ev(page, async () => ({
    canvas: !!document.querySelector('canvas.world-canvas'),
    board: !!document.querySelector('.board'),
    rootMode: document.querySelector('.world')?.dataset.mode,
    changes: window.__t.modeChanges.slice(),
    place: window.__t.world.getPlace(),
    hotspots: document.querySelectorAll('.board-hotspot').length,
    detected: (await import('/js/world/mode.js')).detectMode(),
    saved: Object.keys(localStorage).length,
  }));
  assert(waited >= TUNING.contextRestoreMs - 50, label + ': 되찾기를 ' + TUNING.contextRestoreMs + 'ms 기다린 뒤 바꾼다 (' + waited + 'ms)');
  assert(!r.canvas && r.board && r.rootMode === '2d', label + ': 3D 그림판을 치우고 2D 그림 판을 세운다');
  assert(r.changes.length === 1 && r.changes[0].mode === '2d' && r.changes[0].place === 'hyangga', label + ': 바꾼 뒤 onModeChange로 한 번 알린다 ' + JSON.stringify(r.changes));
  assert(r.place === 'hyangga' && r.hotspots > 0, label + ': 있던 관에 그대로 서 있고 관 모형 자리가 2D로 다시 생긴다 (' + r.hotspots + ')');
  assert(r.detected === '2d' && r.saved === 0, label + ': 이번 창은 2D로 정하고 기기에 저장하지 않는다');
  await ev(page, () => window.__t.world.enterCorridor());
  const door = await ev(page, () => document.querySelector('.board-door[data-wing="hyangga"]')?.dataset.state ?? null);
  assert(door === 'open', label + ': 관 문 상태(wing:state)를 새 그림 판에 다시 놓는다 (' + door + ')');
  await checkTapMove(page, 'mouse', label + ' 2D로 바꾼 뒤');
}

async function checkNoJoystickWithMouse(page, label) {
  const vp = page.viewportSize();
  await page.mouse.move(vp.width * 0.12, vp.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(vp.width * 0.12 + 40, vp.height * 0.8, { steps: 4 });
  const j = await ev(page, rectOf, '.world-joystick');
  await page.mouse.up();
  assert(!j?.visible, label + ': 마우스로는 조이스틱이 나타나지 않는다');
}

async function checkDragRotate(page, label) {
  const vp = page.viewportSize();
  const yaw0 = (await ev(page, () => window.__t.world.getCamera())).yaw;
  await page.mouse.move(vp.width * 0.5, vp.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(vp.width * 0.5 + 900, vp.height * 0.45, { steps: 12 });
  await page.mouse.up();
  await frames(page, 2);
  const cam = await ev(page, () => window.__t.world.getCamera());
  assert(Math.abs(cam.yaw) > Math.abs(yaw0) + 0.05, label + ': 끌면 카메라가 돈다');
  assert(Math.abs(cam.yaw) <= TUNING.yawLimit + 1e-6 && near(Math.abs(cam.yaw), TUNING.yawLimit, 1e-3), label + ': 회전이 제한 각도(' + TUNING.yawLimit + ')에서 멈춘다 (' + cam.yaw.toFixed(3) + ')');
  assert(!(await ev(page, () => window.__t.world.getMarker())).visible, label + ': 끌기는 이동으로 치지 않는다');
  await ev(page, () => window.__t.world.resetCamera());
}

async function checkDrawCalls(page, label) {
  await frames(page, 4);
  const s = await ev(page, () => window.__t.world.getStats());
  console.log('  · ' + label + ' 빈 회랑 그리기 호출: ' + s.drawCalls + '회 (예산 ' + BUDGET + '), 삼각형 ' + s.triangles + ', 픽셀 비율 ' + s.pixelRatio);
  assert(withinBudget(s.drawCalls), label + ': 빈 회랑 그리기 호출이 예산 안이다 (' + s.drawCalls + ')');
  assert(s.pixelRatio <= 1.5, label + ': 픽셀 비율이 1.5 이하다');
  assert(s.shadows === false, label + ': 실시간 그림자를 쓰지 않는다');
}

async function checkWingContract3D(page, label) {
  await ev(page, () => { window.__t.world.enterWing('hyangga'); window.__t.world.resetCamera(); });
  await frames(page, 4);
  const c = await ev(page, () => window.__t.fixture.create3D.at(-1));
  assert(c && c.wingId === 'hyangga', label + ': 관에 들어가면 관 모형 create3D가 불린다');
  assert(JSON.stringify(c.keys) === JSON.stringify(['THREE', 'assets', 'reduceMotion', 'restored', 'root', 'wing']), label + ': 3D ctx 열쇠가 약속과 같다 ' + JSON.stringify(c.keys));
  assert(c.rootIsGroup && c.hasTexture && c.hasImage && c.restored === false, label + ': root는 Group이고 assets.texture/image가 있으며 처음엔 restored=false');
  const u = await ev(page, () => window.__t.fixture.update);
  assert(u > 0, label + ': 관 모형 update(dt)가 프레임마다 불린다');
  const s = await ev(page, () => window.__t.world.getStats());
  console.log('  · ' + label + ' 자리표시 관 안 그리기 호출: ' + s.drawCalls + '회');
  assert(withinBudget(s.drawCalls), label + ': 관 안에서도 그리기 호출이 예산 안이다');
  const r0 = await ev(page, () => window.__t.fixture.react.length);
  await ev(page, () => { window.__t.events.emit('diorama:fold', { unit: 1 }); window.__t.events.emit('diorama:pillar-light', { unit: 0, foot: 2 }); window.__t.events.emit('orientation:nothing', {}); });
  const reacts = await ev(page, (n) => window.__t.fixture.react.slice(n), r0);
  assert(reacts.length === 2 && reacts[0].name === 'diorama:fold' && reacts[0].detail.unit === 1, label + ': 사건 버스의 diorama:* 사건이 지금 관 모형 react로 넘어간다');
  const anchors = await ev(page, () => window.__t.world.getAnchors());
  assert(anchors && Array.isArray(anchors.slots) && anchors.slots.length === 3 && typeof anchors.slots[0].z === 'number' && !('camera' in anchors), label + ': 관 모형의 상호작용 자리(anchors)를 세계 좌표로 돌려준다');
  // 칸 자리 가까이 탭하면 도착 알림이 그 자리를 알려 준다.
  const before = await ev(page, () => window.__t.arrivals.length);
  const s1 = await ev(page, () => window.__t.world.toScreen(window.__t.world.getAnchors().slots[1]));
  await page.mouse.click(s1.x, s1.y);
  const a = await waitArrival(page, before);
  assert(a.anchor && a.anchor.key === 'slots' && a.anchor.index === 1, label + ': 칸 자리에 도착하면 어느 자리인지 알려 준다 ' + JSON.stringify(a.anchor));
  const d0 = await ev(page, () => window.__t.fixture.dispose);
  await ev(page, () => window.__t.world.enterWing('goryeo'));
  assert((await ev(page, () => window.__t.fixture.dispose)) === d0 + 1, label + ': 다른 관으로 가면 앞 관 모형을 치운다');
  await ev(page, () => window.__t.world.setDancheong('goryeo', 1));
  assert((await ev(page, () => window.__t.world.getDancheong('goryeo'))) === 1, label + ': 관마다 단청 상태를 바꾸고 읽는다');
  await ev(page, () => window.__t.world.enterWing('hyangga'));
  await ev(page, () => window.__t.world.enterWing('goryeo'));
  const c2 = await ev(page, () => window.__t.fixture.create3D.at(-1));
  assert(c2.restored === true, label + ': 단청이 돌아온 관에 다시 들어가면 restored=true');
  await ev(page, () => { window.__t.world.setDancheong('goryeo', 0); window.__t.world.enterCorridor(); });
  await frames(page, 2);
}

async function checkReduceMotion(page, label) {
  const has = () => ev(page, () => document.getElementById('app').classList.contains('reduce-motion'));
  assert(!(await has()), label + ': 처음에는 움직임 줄이기가 꺼져 있다');
  // 움직임 줄이기가 꺼져 있으면 관으로 갈 때 카메라가 미끄러지며 옮겨 간다.
  await ev(page, () => window.__t.world.enterWing('hyangga'));
  await frames(page, 2);
  const moving = await ev(page, () => window.__t.world.getCamera());
  assert(moving.distanceToDesired > 0.5, label + ': 기본 상태에서는 카메라가 이어서 움직인다 (남은 거리 ' + moving.distanceToDesired.toFixed(2) + ')');
  await ev(page, () => window.__t.world.enterCorridor());
  const n0 = await ev(page, () => window.__t.log.length);
  await ev(page, () => window.__t.world.setDeviceReduceMotion(true));
  assert(await has(), label + ': 기기 설정을 켜면 #app에 reduce-motion이 붙는다');
  const evs = await ev(page, (n) => window.__t.log.slice(n), n0);
  assert(evs.some((e) => e.name === 'settings:reduce-motion' && e.detail.value === true), label + ': settings:reduce-motion {value:true}를 낸다');
  assert(await ev(page, () => window.__t.world.reduceMotion()), label + ': 다른 모듈이 reduceMotion()으로 지금 값을 읽는다');
  assert((await ev(page, () => window.__t.world.particleScale())) < 1, label + ': 움직임 줄이기에서 파티클 비율이 줄어든다');
  await ev(page, () => window.__t.world.enterWing('hyangga'));
  await frames(page, 2);
  const cut = await ev(page, () => window.__t.world.getCamera());
  assert(cut.distanceToDesired < 0.01, label + ': 움직임 줄이기에서는 카메라가 잘라 바뀐다 (남은 거리 ' + cut.distanceToDesired.toFixed(3) + ')');
  assert((await ev(page, () => window.__t.world.shake(1))) === false, label + ': 움직임 줄이기에서는 흔들림이 없다');
  await ev(page, () => window.__t.world.enterCorridor());
  await ev(page, () => window.__t.world.setDeviceReduceMotion(false));
  assert(!(await has()), label + ': 기기 설정을 끄면 reduce-motion이 빠진다');
  // 설정 화면이 사건으로 알려도 따른다.
  await ev(page, () => window.__t.events.emit('settings:reduce-motion', { value: true }));
  assert(await has(), label + ': 설정 사건(settings:reduce-motion)을 받으면 따른다');
  await ev(page, () => window.__t.events.emit('settings:reduce-motion', { value: false }));
  assert(!(await has()), label + ': 설정 사건으로 다시 끈다');
  // 브라우저의 움직임 줄이기 선호
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.getElementById('app').classList.contains('reduce-motion'), null, { timeout: 3000 });
  assert(true, label + ': 브라우저의 prefers-reduced-motion을 따른다');
  await ev(page, () => window.__t.events.emit('settings:reduce-motion', { value: false }));
  assert(await has(), label + ': 기기 설정을 꺼도 브라우저 선호가 있으면 줄인 채로 둔다');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => !document.getElementById('app').classList.contains('reduce-motion'), null, { timeout: 3000 });
}

async function checkJoystickTouch(game, label) {
  const { page, context } = game;
  const cdp = await context.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 })) });
  const vp = page.viewportSize();
  const x0 = Math.round(vp.width * 0.14);
  const y0 = Math.round(vp.height * 0.78);
  const p0 = await ev(page, () => window.__t.world.getPlayer());
  await touch('touchStart', [[x0, y0]]);
  await frames(page, 1);
  const j = await ev(page, rectOf, '.world-joystick');
  assert(j?.visible, label + ': 왼쪽 아래를 엄지로 누르면 조이스틱이 나타난다');
  assert(near((j.left + j.right) / 2, x0, 3) && near((j.top + j.bottom) / 2, y0, 3), label + ': 조이스틱이 엄지가 닿은 자리에 생긴다');
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[x0 + i * 12, y0]]);
  await page.waitForTimeout(450);
  const p1 = await ev(page, () => window.__t.world.getPlayer());
  await touch('touchEnd', []);
  await frames(page, 3);
  const j2 = await ev(page, rectOf, '.world-joystick');
  assert(p1.x > p0.x + 0.3, label + ': 조이스틱을 오른쪽으로 밀면 오른쪽으로 걷는다 (' + p0.x.toFixed(2) + '→' + p1.x.toFixed(2) + ')');
  assert(!j2?.visible, label + ': 손을 떼면 조이스틱이 사라진다');
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
  // 색 토큰이 css/base.css와 같은지(3D는 CSS 변수를 못 읽는 곳에서도 같은 색을 써야 한다).
  const baseCss = fs.readFileSync(fileURLToPath(new URL('../css/base.css', import.meta.url)), 'utf8');
  for (const [k, css] of [['hanji', '--hanji'], ['meok', '--meok'], ['nokcheong', '--nokcheong'], ['juhong', '--juhong'], ['meokFog', '--meok-fog']]) {
    const m = new RegExp(css + ':\\s*(#[0-9a-f]{6})', 'i').exec(baseCss);
    assert(m && m[1].toLowerCase() === TOKENS[k].toLowerCase(), '팔레트 ' + k + '가 base.css ' + css + '와 같다');
  }
  assert(TUNING.drawCallBudget === BUDGET && TUNING.pixelRatioMax === 1.5, '조정값: 그리기 호출 60, 픽셀 비율 1.5');
  assert(!withinBudget(BUDGET + 1) && !withinBudget(0), '(음성) 예산 검사가 초과와 0을 잡는다');

  for (const [key, vp] of Object.entries(SIZES)) {
    await session('마우스 ' + key + ' ' + vp.width + 'x' + vp.height, { viewport: vp }, async ({ page }) => {
      const label = key;
      assert((await ev(page, () => window.__t.world.getMode())) === '3d', label + ': WebGL이 되면 3D로 연다');
      assert(await ev(page, () => !!document.querySelector('.world-canvas')), label + ': 3D 그림판(canvas)이 있다');
      await checkSafeBox(page, label, vp);
      await checkLayout(page, label);
      await checkDrawCalls(page, label);
      await checkContextButton(page, label);
      await checkTapMove(page, 'mouse', label);
      await checkNoJoystickWithMouse(page, label);
      await checkKeyboard(page, label);
      if (key === 'chromebook') await checkKeyboardBehindCover(page, label);
      await checkDragRotate(page, label);
      await checkSplit(page, label);
      await checkOrientation(page, label, vp);
      await checkLayout(page, label + ' 회전 뒤');
      if (key === 'chromebook') {
        await checkWingContract3D(page, label);
        await checkReduceMotion(page, label);
      }
    });
  }

  for (const key of ['phone', 'tablet']) {
    const vp = SIZES[key];
    await session('터치 ' + key, { viewport: vp, touch: true }, async (game) => {
      const label = key + ' 터치';
      await checkTapMove(game.page, 'touch', label);
      await checkJoystickTouch(game, label);
      await checkLayout(game.page, label);
    });
  }

  // 움직임 줄이기 선호가 켜진 채 처음 열 때
  await session('움직임 줄이기 선호로 열기', { viewport: SIZES.phone }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => window.__t?.ready === true);
    assert(await ev(page, () => document.getElementById('app').classList.contains('reduce-motion')), '선호가 있으면 처음부터 reduce-motion이 붙는다');
    assert(await ev(page, () => window.__t.log.some((e) => e.name === 'settings:reduce-motion' && e.detail.value === true)), '처음 상태를 settings:reduce-motion으로 알린다');
  });

  // 3D 그림판을 잃음(GPU 재시작 등): 되찾으면 다시 그리고, 되찾지 못하면 이번 창은 2D로 간다
  await session('3D 그림판 잃고 되찾기', { viewport: SIZES.chromebook }, async ({ page }) => {
    await checkContextRestore(page, '그림판 되찾기');
  });
  await session('3D 그림판 잃고 되찾지 못함 → 2D', { viewport: SIZES.chromebook }, async ({ page }) => {
    await checkContextGiveUp(page, '그림판 못 되찾음');
  });

  // 음성 사례: 관 모형이 그리기 호출을 너무 많이 쓰면 예산 검사가 잡는다.
  await session('그리기 호출 초과(음성)', { viewport: SIZES.chromebook }, async ({ page }) => {
    await ev(page, () => { globalThis.__fixtureHeavy = 120; window.__t.world.enterWing('hyangga'); window.__t.world.resetCamera(); });
    await frames(page, 4);
    const s = await ev(page, () => window.__t.world.getStats());
    console.log('  · 무거운 자리표시 관 그리기 호출: ' + s.drawCalls + '회');
    assert(!withinBudget(s.drawCalls), '(음성) 그리기 호출이 예산을 넘으면 점검이 잡는다');
  });

  // 3D를 끈 브라우저: 게임 전체가 2D 그림 판으로 간다.
  for (const key of ['tablet', 'phone']) {
    const vp = SIZES[key];
    await session('2D 그림 판 ' + key, { viewport: vp, disable3d: true }, async ({ page }) => {
      const label = key + ' 2D';
      assert((await ev(page, () => window.__t.world.getMode())) === '2d', label + ': WebGL이 없으면 2D 그림 판으로 연다');
      assert(await ev(page, () => !document.querySelector('canvas.world-canvas')), label + ': 3D 그림판을 만들지 않는다');
      const b = await ev(page, rectOf, '.board');
      assert(b?.visible && near(b.width / b.height, 16 / 9, 0.02), label + ': 그림 판이 16:9다');
      await checkSafeBox(page, label, vp);
      await checkLayout(page, label);
      const doors = await ev(page, () => [...document.querySelectorAll('.board-door')].map((d) => d.dataset.wing));
      assert(doors.length === 6 && doors[0] === 'entrance', label + ': 회랑 그림 판에 관 문 여섯이 있다 ' + JSON.stringify(doors));
      await checkContextButton(page, label);
      await checkTapMove(page, 'mouse', label);
      await checkKeyboard(page, label);
      if (key === 'tablet') await checkKeyboardBehindCover(page, label);
      // 문 누르기 → 문 앞으로 가서 도착 알림
      let before = await ev(page, () => window.__t.arrivals.length);
      await page.click('.board-door[data-wing="hyangga"]');
      let a = await waitArrival(page, before);
      assert(a.anchor?.key === 'door' && a.anchor?.wing === 'hyangga', label + ': 관 문을 누르면 문 앞에 가서 그 문을 알려 준다 ' + JSON.stringify(a));
      await ev(page, () => window.__t.world.enterWing('hyangga'));
      const c = await ev(page, () => window.__t.fixture.create2D.at(-1));
      assert(c && c.wingId === 'hyangga' && c.isElement, label + ': 관 모형 create2D가 그림 판 요소를 받는다');
      assert(JSON.stringify(c.keys) === JSON.stringify(['assets', 'container', 'reduceMotion', 'restored', 'wing']), label + ': 2D ctx 열쇠가 약속과 같다 ' + JSON.stringify(c.keys));
      const hs = await ev(page, () => [...document.querySelectorAll('.board-hotspot')].map((h) => h.dataset.anchor + ':' + (h.dataset.index ?? '')));
      assert(hs.length === 5, label + ': 관 모형 자리(anchors)마다 누를 수 있는 자리가 생긴다 ' + JSON.stringify(hs));
      await checkLayout(page, label + ' 관 안');
      before = await ev(page, () => window.__t.arrivals.length);
      await page.click('.board-hotspot[data-anchor="slots"][data-index="1"]');
      a = await waitArrival(page, before);
      assert(a.anchor?.key === 'slots' && a.anchor?.index === 1, label + ': 칸 자리를 누르면 그 자리에 가서 알려 준다');
      const r0 = await ev(page, () => window.__t.fixture.react.length);
      await ev(page, () => window.__t.events.emit('diorama:slot-set', { area: 'shelf', index: 0, songId: 'seodongyo' }));
      assert((await ev(page, () => window.__t.fixture.react.length)) === r0 + 1, label + ': diorama:* 사건이 2D 관 모형 react로 넘어간다');
      await ev(page, () => window.__t.world.setDancheong('hyangga', 1));
      const lvl = await ev(page, () => getComputedStyle(document.querySelector('.board')).getPropertyValue('--dancheong').trim());
      assert(lvl === '1', label + ': 단청 상태가 그림 판에 반영된다 (' + lvl + ')');
      await checkSplit(page, label);
      await checkOrientation(page, label, vp);
    });
  }
} catch (e) {
  failed = true;
  console.error(e.stack || e.message);
} finally {
  for (const g of sessions) await g.close().catch(() => {});
  await server.close();
}
process.exitCode = failed ? 1 : 0;
