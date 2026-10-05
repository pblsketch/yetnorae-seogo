// 관 모형 손잡이 약속 점검(F2, js/data/README.md '연결 결정(F2) — 관 모형 손잡이').
// js/registry.js에 등록된 다섯 관 모형을 3D와 3D를 끈 브라우저(2D 그림 판)에서 1366×768로 열어 확인한다:
//   맞춘 손잡이에 floatingSpots(다섯 이상)와 measureFocus가 있고, 떠도는 노래 자리가 anchors에 섞이지 않으며,
//   2D 누를 자리 이름표에 영어 글자가 없고, slot-set의 returned·mentor 자리가 오류 없이 처리되고,
//   world.getWingHandle()이 그 손잡이를 돌려주며, 반반 틀을 열면 재기 초점이 왼쪽 칸 안에 들어온다.
// 음성 사례: floatingSpots·measureFocus가 없거나 모자란 가짜 관 모형, 맞추지 않은 손잡이, 영어 이름표, 화면 밖 점을 잡아낸다.
// 점검 페이지 tests/pages/wing-contract.html이 등록된 관 모형으로 세계 바탕을 띄운다(제품 흐름에는 없다).
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';

const PAGE = 'tests/pages/wing-contract.html';
const WING_IDS = ['hyangga', 'goryeo', 'sijo', 'gasa', 'saseol'];
const SLOT_EVENTS = [
  { area: 'returned', index: 0, songId: 'seodongyo' },
  { area: 'returned', index: 3, songId: 'gasiri' },
  { area: 'mentor', index: 0, songId: 'taesan' },
  { area: 'returned', index: 0, songId: null },
  { area: 'mentor', index: 0, songId: null },
];

// ── 페이지 안에서 쓰는 검사 함수(문자열로 넘겨 페이지에 심는다) ──

// 맞춘 손잡이의 약속 위반 목록. mode: '3d' | '2d'
function wingContractProblems(h, mode) {
  const out = [];
  if (!h || typeof h !== 'object') return ['손잡이 없음'];
  const num = Number.isFinite;
  const pt3 = (p) => !!p && num(p.x) && num(p.y) && num(p.z);
  const pt2 = (p) => !!p && num(p.x) && num(p.y) && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100;
  const pt = mode === '3d' ? pt3 : pt2;
  if (typeof h.react !== 'function') out.push('react 없음');
  if (typeof h.dispose !== 'function') out.push('dispose 없음');
  if (!h.anchors || typeof h.anchors !== 'object') out.push('anchors 없음');
  for (const k of ['floating', 'songs', 'focus', 'floatingSpots', 'measureFocus']) {
    if (h.anchors && k in h.anchors) out.push('anchors에 ' + k + '가 섞여 있음');
  }
  const fs = h.floatingSpots;
  if (!Array.isArray(fs)) out.push('floatingSpots 없음');
  else {
    if (fs.length < 5) out.push('floatingSpots가 ' + fs.length + '개뿐');
    fs.forEach((p, i) => {
      if (!pt(p)) out.push('floatingSpots[' + i + '] 좌표가 아님');
      else if (mode === '3d' && (Math.abs(p.x) > 6.5 || Math.abs(p.z) > 6.5 || p.y < 0.3 || p.y > 4)) out.push('floatingSpots[' + i + '] 관 밖');
      else if (mode === '2d' && p.x > 78 && p.y > 78) out.push('floatingSpots[' + i + '] 상황 버튼 구석');
      for (let j = 0; j < i; j++) {
        const q = fs[j];
        if (!pt(q) || !pt(p)) continue;
        const d = mode === '3d' ? Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) : Math.hypot((p.x - q.x) * 16 / 9, p.y - q.y);
        if (d < (mode === '3d' ? 0.6 : 4)) out.push('floatingSpots[' + j + ']와 [' + i + ']가 겹침');
      }
    });
  }
  const f = h.measureFocus;
  if (!f) out.push('measureFocus 없음');
  else if (mode === '3d') {
    if (!pt3(f.target)) out.push('measureFocus.target 좌표가 아님');
    if (f.position !== undefined && !pt3(f.position)) out.push('measureFocus.position 좌표가 아님');
  } else if (!pt2(f)) out.push('measureFocus 좌표가 아님');
  return out;
}

const hasAscii = (s) => /[A-Za-z]/.test(String(s ?? ''));
// 화면 점이 사각형 안(가장자리 margin 비율만큼 안쪽)에 있는지
const inRect = (p, r, margin = 0.04) => !!p && p.x >= r.left + r.width * margin && p.x <= r.right - r.width * margin
  && p.y >= r.top + r.height * margin && p.y <= r.bottom - r.height * margin;

// ── 도우미 ──

const ev = (page, fn, arg) => page.evaluate(fn, arg);

function frames(page, n = 2) {
  return page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
}

function rectOf(selector) {
  const e = document.querySelector(selector);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

async function open(server, opts) {
  const game = await openGame(server.url, { path: PAGE, viewport: VIEWPORTS.chromebook, ...opts });
  await game.page.waitForFunction(() => window.__t?.ready === true, null, { timeout: 20000 });
  await game.page.evaluate('window.__contract = ' + wingContractProblems.toString());
  await frames(game.page, 2);
  return game;
}

// 3D 카메라가 바라는 자리에 붙을 때까지 기다린다.
async function settleCamera(page) {
  await page.waitForFunction(() => (window.__t.world.getCamera()?.distanceToDesired ?? 0) < 0.03, null, { timeout: 8000 });
  await frames(page, 2);
}

// 재기 초점의 화면 좌표(3D는 root 기준 target을 세계 좌표로 바꿔서)
function focusScreen() {
  const t = window.__t;
  const f = t.world.getWingHandle()?.measureFocus;
  if (!f) return null;
  if (t.world.getMode() === '3d') {
    const root = t.world.getThree().root;
    const w = root.localToWorld(new t.THREE.Vector3(f.target.x, f.target.y, f.target.z));
    return { ...t.world.toScreen(w), world: { x: w.x, y: w.y, z: w.z } };
  }
  return t.world.toScreen(f);
}

function cameraDistanceTo(p) {
  const c = window.__t.world.getCamera().position;
  return Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
}

async function checkWing(game, id, mode) {
  const { page } = game;
  const label = mode + ' ' + id;
  await ev(page, (id) => { window.__t.world.enterCorridor(); window.__t.world.enterWing(id); window.__t.world.resetCamera(); }, id);
  await frames(page, 3);

  const problems = await ev(page, (mode) => window.__contract(window.__t.world.getWingHandle(), mode), mode);
  assert(problems.length === 0, label + ': 맞춘 손잡이가 약속을 따른다 ' + JSON.stringify(problems));
  const info = await ev(page, () => {
    const h = window.__t.world.getWingHandle();
    const anchors = window.__t.world.getAnchors() ?? {};
    return {
      same: h === window.__t.world.getWingHandle(),
      floating: h.floatingSpots.length,
      handleKeys: Object.keys(h.anchors).filter((k) => k !== 'camera').sort(),
      anchorKeys: Object.keys(anchors).sort(),
    };
  });
  assert(info.same && JSON.stringify(info.handleKeys) === JSON.stringify(info.anchorKeys),
    label + ': getWingHandle()이 지금 관 모형의 손잡이를 돌려준다 (떠도는 자리 ' + info.floating + ', 자리 ' + info.anchorKeys.join(',') + ')');

  if (mode === '2d') {
    const labels = await ev(page, () => [...document.querySelectorAll('.board-hotspot')].flatMap((b) => [b.getAttribute('aria-label'), b.title]));
    const english = labels.filter(hasAscii);
    assert(labels.length >= 2 * 8 && english.length === 0, label + ': 누를 자리 이름표가 모두 한국어다 (' + labels.length / 2 + '개) ' + JSON.stringify(english));
  }

  const e0 = game.errors.length;
  for (const d of SLOT_EVENTS) await ev(page, (d) => window.__t.events.emit('diorama:slot-set', d), d);
  await frames(page, 3);
  assert(game.errors.length === e0, label + ': slot-set의 returned·mentor 자리를 오류 없이 받는다 ' + game.errors.slice(e0).join(' | '));

  // 반반 틀: 재기 화면 왼쪽 반이 재기 초점을 비춘다.
  let before = null;
  if (mode === '3d') {
    await settleCamera(page);
    const s = await ev(page, focusScreen);
    before = await ev(page, cameraDistanceTo, s.world);
  }
  await ev(page, () => {
    const p = document.createElement('div');
    p.innerHTML = '<p>두루마리 패널 자리</p>';
    window.__t.world.openSplit(p);
  });
  await frames(page, 3);
  if (mode === '3d') await settleCamera(page);
  const view = await ev(page, rectOf, '.world-view');
  const s = await ev(page, focusScreen);
  assert(inRect(s, view), label + ': 반반 틀에서 재기 초점이 왼쪽 칸 안에 보인다 (' + Math.round(s.x) + ',' + Math.round(s.y) + ' / 칸 ' + Math.round(view.width) + 'x' + Math.round(view.height) + ')');
  if (mode === '3d') {
    const after = await ev(page, cameraDistanceTo, s.world);
    assert(after < before, label + ': 반반 틀에서 카메라가 재기 초점으로 다가간다 (' + before.toFixed(1) + 'm → ' + after.toFixed(1) + 'm)');
  } else {
    const b = await ev(page, rectOf, '.board');
    assert(b.left <= view.left + 1 && b.right >= view.right - 1 && b.top <= view.top + 1 && b.bottom >= view.bottom - 1 && Math.abs(b.width / b.height - 16 / 9) < 0.02,
      label + ': 반반 틀에서 그림 판이 16:9를 지킨 채 확대되어 왼쪽 칸을 채운다 (' + Math.round(b.width) + 'x' + Math.round(b.height) + ')');
  }
  await ev(page, () => window.__t.world.closeSplit());
  await frames(page, 3);
  if (mode === '2d') {
    const view2 = await ev(page, rectOf, '.world-view');
    const b = await ev(page, rectOf, '.board');
    assert(b.left >= view2.left - 1 && b.right <= view2.right + 1 && b.top >= view2.top - 1 && b.bottom <= view2.bottom + 1, label + ': 반반 틀을 닫으면 그림 판이 원래 크기로 돌아온다');
  }
}

// 음성 사례: 약속을 어기는 가짜 관 모형과 손잡이를 점검이 잡아낸다.
async function checkNegatives(game, mode) {
  const { page } = game;
  const r = await ev(page, (mode) => {
    const { normalize, THREE } = window.__t;
    const is3d = mode === '3d';
    const P = (x, y, z) => (is3d ? new THREE.Vector3(x, y, z) : { x, y });
    const ctx = is3d ? { THREE, root: new THREE.Group(), wing: { id: 'hyangga' }, assets: {}, restored: false, reduceMotion: () => false }
      : { container: document.createElement('div'), wing: { id: 'hyangga' }, assets: {}, restored: false, reduceMotion: () => false };
    const base = () => ({ slots: [P(10, 1, 50), P(20, 1, 50), P(30, 1, 50)], basket: P(40, 0, 60) });
    const make = (extra) => normalize.normalizeWing({
      create3D: () => ({ anchors: base(), react() {}, dispose() {}, ...extra }),
      create2D: () => ({ anchors: base(), react() {}, dispose() {}, ...extra }),
    })[is3d ? 'create3D' : 'create2D'](ctx);
    const five = [-4, -2, 0, 2, 4].map((x) => (is3d ? P(x, 1.5, 1) : P(50 + x * 8, 60)));
    const focus = is3d ? P(0, 1, 0) : P(50, 40);
    const fourFloating = make({ anchors: { ...base(), floating: five.slice(0, 4) }, focus });
    return {
      missingFloating: window.__contract(make({ focus }), mode),
      missingFocus: window.__contract(make({ floatingSpots: five }), mode),
      fourFloating: window.__contract(fourFloating, mode),
      fourFloatingAnchors: Object.keys(fourFloating.anchors),
      rawLegacy: window.__contract({ anchors: { ...base(), floating: five }, focus, react() {}, dispose() {} }, mode),
      good: window.__contract(make({ floatingSpots: five, focus }), mode),
      twice: normalize.normalizeWing(window.__t.registry.wings.hyangga) === window.__t.registry.wings.hyangga,
    };
  }, mode);
  const has = (list, word) => list.some((s) => s.includes(word));
  assert(r.good.length === 0, mode + ': 약속을 지키는 가짜 관 모형은 통과한다 ' + JSON.stringify(r.good));
  assert(has(r.missingFloating, 'floatingSpots'), mode + ': (음성) 떠도는 노래 자리를 내놓지 않는 관 모형을 잡는다 ' + JSON.stringify(r.missingFloating));
  assert(has(r.missingFocus, 'measureFocus 없음'), mode + ': (음성) measureFocus가 없는 관 모형을 잡는다');
  assert(has(r.fourFloating, '4개뿐') && !r.fourFloatingAnchors.includes('floating'), mode + ': (음성) 떠도는 자리가 넷뿐이면 잡고, 옛 자리 열쇠는 anchors에서 빠진다');
  assert(has(r.rawLegacy, 'anchors에 floating'), mode + ': (음성) 맞추지 않은 옛 손잡이(anchors.floating)를 잡는다');
  assert(r.twice, mode + ': 이미 맞춘 관 모형은 다시 감싸지 않는다');

  // 세계에 약속을 어기는 관 모형을 끼우면 getWingHandle()로 본 점검이 잡는다.
  const world = await ev(page, (mode) => {
    const { world, normalize } = window.__t;
    const bad = normalize.normalizeWing({
      create3D: ({ THREE }) => ({ anchors: { slots: [new THREE.Vector3(0, 0, 0)] }, react() {}, dispose() {} }),
      create2D: () => ({ anchors: { slots: [{ x: 50, y: 60 }], mystery: { x: 30, y: 60 } }, react() {}, dispose() {} }),
    });
    world.mount(document.getElementById('app'), { wings: { hyangga: bad } });
    world.enterWing('hyangga');
    const out = {
      problems: window.__contract(world.getWingHandle(), mode),
      labels: [...document.querySelectorAll('.board-hotspot')].map((b) => b.getAttribute('aria-label')),
    };
    world.mount(document.getElementById('app'), {});
    return out;
  }, mode);
  assert(world.problems.length > 0, mode + ': (음성) 세계에 끼운 엉터리 관 모형을 점검이 잡는다 ' + JSON.stringify(world.problems));
  if (mode === '2d') assert(world.labels.length === 2 && !world.labels.some(hasAscii), '2d: 모르는 자리 열쇠도 영어 그대로 보이지 않는다 ' + JSON.stringify(world.labels));
  assert(hasAscii('floating 1') && !hasAscii('떠도는 노래 1'), '(음성) 영어 이름표 검사가 "floating 1"을 잡는다');
  const r0 = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
  assert(inRect({ x: 50, y: 50 }, r0) && !inRect({ x: 150, y: 50 }, r0) && !inRect(null, r0), '(음성) 화면 안 검사가 칸 밖 점을 잡는다');
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
  for (const [mode, opts] of [['3d', {}], ['2d', { disable3d: true }]]) {
    await session(mode + ' 1366x768', opts, async (game) => {
      const { page } = game;
      assert((await ev(page, () => window.__t.world.getMode())) === mode, mode + ': 이 방식으로 연다');
      const reg = await ev(page, (ids) => ids.map((id) => {
        const m = window.__t.registry.wings[id];
        return !!m && typeof m.create3D === 'function' && typeof m.create2D === 'function' && window.__t.normalize.isNormalizedWing(m);
      }), WING_IDS);
      assert(reg.every(Boolean), mode + ': 다섯 관 모형이 맞춘 모양으로 등록되어 있다 ' + JSON.stringify(reg));
      for (const id of WING_IDS) await checkWing(game, id, mode);
      await checkNegatives(game, mode);
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
