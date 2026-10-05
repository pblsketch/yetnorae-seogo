// 시조관 모형 점검(T9, spec 3.1·5.4·6·8·14·17).
// 3D와 3D를 끈 브라우저(2D 그림 판)에서, 1366×768과 844×390 화면으로 확인한다:
//   모형이 끼워지고, 3층 정자(초장·중장·종장)·층마다 계단참 둘(모두 여섯)·종장 첫 계단 세 칸·앞기둥 열둘이 있고,
//   README의 디오라마 사건 전부가 콘솔 오류 없이 처리되며, 계단 오르기(고유 동작)가 계단을 한 칸씩 밝히고 등불을 올리며,
//   기둥 불·빈 책등·삐져나옴(갈래마다 다른 모양)·묶음·선대 사서의 자리·먹안개·단청이 눈에 보이게 바뀌고,
//   그리기 호출이 60회 이하이고, 자리가 모두 있고 2D 자리가 상황 버튼 구석을 피하며, 바깥 요청이 없다.
// 음성 사례: 모르는 사건과 엉터리 값은 아무것도 바꾸지 않고, 예산을 넘긴 장면과 구석의 자리는 점검이 잡아낸다.
// 점검 페이지 tests/pages/wing-sijo.html이 세계 바탕에 시조관 모형만 끼워 띄운다(제품 흐름에는 없다).
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { SONG_CATALOG } from '../js/data/song-table.js';

const PAGE = 'tests/pages/wing-sijo.html';
const BUDGET = 60;
const ANCHOR_KEYS = ['slots', 'bonus', 'basket', 'returnedShelf', 'roomDoor', 'entrance', 'nextDoor', 'mentorSeat'];
const DIORAMA = [
  ['diorama:fold', { unit: 0 }], ['diorama:fold', { unit: 1 }],
  ['diorama:pillar-light', { unit: 0, foot: 0 }], ['diorama:pillar-light', { unit: 1, line: 0, foot: 2 }], ['diorama:pillar-light', { unit: 7, foot: null }],
  ['diorama:floor-fill', { gu: 4 }],
  ['diorama:aa-door', { present: true, unit: 8 }],
  ['diorama:stair-step', { step: 1, total: 3 }],
  ['diorama:refrain-link', { from: { unit: 0, line: 1 }, to: { unit: 1, line: 1 } }],
  ['diorama:walk-step', { step: 2 }],
  ['diorama:unroll', { unit: 1, feet: 9 }],
  ['diorama:slot-set', { area: 'shelf', index: 1, songId: 'ireondeul' }], ['diorama:slot-set', { area: 'shelf', index: 1, songId: null }],
  ['diorama:slot-set', { area: 'basket', index: 0, songId: 'gwandong-byeolgok', to: 'gasa' }],
  ['diorama:shelf-bound', { area: 'bonus', songIds: ['ihwa-wolbaek', 'hanson-makdae', 'sakpung'] }],
  ['diorama:pop-out', { area: 'basket', index: 0, songId: 'gwandong-byeolgok', genre: 'gasa' }],
  ['diorama:fog-recede', {}],
  ['diorama:dancheong-restore', {}],
];
// 엉터리 값(오류 없이 넘어가야 한다)
const GARBAGE = [
  ['diorama:pillar-light', null], ['diorama:pillar-light', { unit: 'x', foot: -5 }], ['diorama:stair-step', { step: 0 }],
  ['diorama:stair-step', { step: 99, total: 'a' }], ['diorama:slot-set', { area: 'nowhere', index: 0 }],
  ['diorama:slot-set', { area: 'shelf', index: 9, songId: 'x' }], ['diorama:pop-out', {}], ['diorama:shelf-bound', { area: 'basket' }],
  ['diorama:fold', undefined],
];

// ── 페이지 안에서 쓰는 들여다보기 도구 ──
async function installProbe() {
  const THREE = await import('three');
  const t = window.__t;
  const p = {};
  p.mode = () => t.world.getMode();
  p.emit = (name, detail) => t.events.emit(name, detail);
  p.frames = (n = 2) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  // 3D
  p.root = () => t.world.getThree()?.root ?? null;
  p.mesh = (name) => p.root()?.getObjectByName(name) ?? null;
  p.color = (name, i) => { const m = p.mesh(name); return Array.from(m.instanceColor.array.slice(i * 3, i * 3 + 3)).map((v) => +v.toFixed(3)); };
  p.box = (name, i) => {
    const m = p.mesh(name);
    const M = new THREE.Matrix4();
    m.getMatrixAt(i, M);
    // 숨긴 조각은 크기 0 행렬이다. decompose는 그런 행렬에 크기 1을 돌려주므로 열 길이를 직접 잰다.
    const e = M.elements;
    const s = [Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10])];
    // 세 축 크기는 회전된 상자에서도 길이로 남는다. 서가 칸(회전 없음)은 그대로 범위가 된다.
    return { p: [e[12], e[13], e[14]], s, visible: s[0] * s[1] * s[2] > 1e-9 };
  };
  // 자리 하나의 조각들(관 기준 상자). 서가 칸은 회전이 없어 상자 범위를 바로 읽을 수 있다.
  p.segments = (key) => {
    const m = p.mesh('sijo-books');
    const start = m.userData.holders[key];
    const out = [];
    for (let k = 0; k < m.userData.segMax; k++) {
      const b = p.box('sijo-books', start + k);
      if (!b.visible) continue;
      out.push({ y0: b.p[1] - b.s[1] / 2, y1: b.p[1] + b.s[1] / 2, z0: b.p[2] - b.s[2] / 2, z1: b.p[2] + b.s[2] / 2, color: p.color('sijo-books', start + k) });
    }
    return out;
  };
  p.stats = () => t.world.getStats();
  // 2D
  p.svg = () => document.querySelector('.wing-sijo-art');
  p.q = (sel) => p.svg()?.querySelector(sel) ?? null;
  p.qa = (sel) => [...(p.svg()?.querySelectorAll(sel) ?? [])];
  p.attr = (sel, a) => p.q(sel)?.getAttribute(a) ?? null;
  p.holder2D = (area, index) => {
    const g = p.q(`g[data-area="${area}"][data-index="${index}"]`);
    if (!g) return null;
    const rects = [...g.querySelectorAll('rect')].filter((r) => r.getAttribute('display') !== 'none').map((r) => ({
      kind: r.dataset.kind, x0: +r.getAttribute('x'), x1: +r.getAttribute('x') + +r.getAttribute('width'), y0: +r.getAttribute('y'), y1: +r.getAttribute('y') + +r.getAttribute('height'), fill: r.getAttribute('fill'),
    }));
    return { state: g.dataset.state, genre: g.dataset.genre ?? null, title: g.querySelector('[data-part="title"]')?.textContent ?? '', tag: g.querySelector('[data-part="tag"]')?.textContent ?? '', rects };
  };
  p.hotspots = () => [...document.querySelectorAll('.board-hotspot')].map((b) => { const r = b.getBoundingClientRect(); return { key: b.dataset.anchor, label: b.getAttribute('aria-label'), l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
  window.__p = p;
  return true;
}

// ── 도우미 ──
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const withinBudget = (calls) => calls > 0 && calls <= BUDGET;
const inCorner = (a) => a.x > 78 && a.y > 78;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function open(server, opts) {
  const game = await openGame(server.url, { path: PAGE, ...opts });
  await game.page.waitForFunction(() => window.__t?.ready === true, null, { timeout: 20000 });
  await ev(game.page, installProbe);
  return game;
}

async function enter(page) {
  const ok = await ev(page, () => window.__t.world.enterWing('sijo'));
  await ev(page, () => window.__p.frames(4));
  // 카메라가 관 카메라 자리로 다 따라붙을 때까지 기다린다
  await page.waitForFunction(() => (window.__t.world.getCamera()?.distanceToDesired ?? 0) < 0.05, null, { timeout: 10000 });
  return ok;
}

const emit = (page, name, detail) => ev(page, ([n, d]) => { window.__p.emit(n, d); return window.__p.frames(2); }, [name, detail]);
const wait = (page, ms) => page.waitForTimeout(ms);

// ── 구조와 자리 ──
async function checkStructure(page, mode, label) {
  if (mode === '3d') {
    const s = await ev(page, () => {
      const p = window.__p;
      const fixed = p.mesh('sijo-fixed');
      const reactive = p.mesh('sijo-reactive');
      const pillars = p.mesh('sijo-pillars');
      return {
        names: p.root().children.map((c) => c.name),
        landings: fixed?.userData.tags.landing.length,
        finalSteps: reactive?.userData.index.finalSteps.length,
        beams: reactive?.userData.index.beams.length,
        pillars: pillars?.count,
        shadows: p.stats().shadows,
      };
    });
    assert(s.names.includes('sijo-diorama'), label + ': 시조관 모형이 관 자리에 끼워진다');
    assert(s.beams === 3, label + ': 정자가 세 층(초장·중장·종장)이다');
    assert(s.landings === 6, label + ': 층마다 계단참 둘, 모두 여섯이다(3장 6구) (' + s.landings + ')');
    assert(s.finalSteps === 3, label + ': 종장으로 오르는 첫 계단은 정확히 세 칸이다');
    assert(s.pillars === 24, label + ': 층마다 앞기둥 넷(음보)과 뒷기둥 넷이 있다');
    assert(s.shadows === false, label + ': 실시간 그림자를 쓰지 않는다');
  } else {
    const s = await ev(page, () => {
      const p = window.__p;
      return {
        svg: !!p.svg(),
        landings: p.qa('[data-part="landing"]').length,
        finalSteps: p.qa('[data-part="final-step"]').length,
        pillars: p.qa('[data-part="pillar"]').length,
        plaques: p.qa('[data-part="plaque"]').map((g) => g.textContent.trim()),
        text: p.svg().textContent,
      };
    });
    assert(s.svg, label + ': 2D 그림 판에 시조관 그림이 들어간다');
    assert(['초장', '중장', '종장'].every((n) => s.plaques.includes(n)), label + ': 세 층에 초장·중장·종장 이름표가 있다');
    assert(s.landings === 6, label + ': 층마다 계단참 둘, 모두 여섯이다 (' + s.landings + ')');
    assert(s.finalSteps === 3, label + ': 종장으로 오르는 첫 계단은 정확히 세 칸이다');
    assert(s.pillars === 12, label + ': 층마다 앞기둥 넷, 모두 열둘이다');
    assert(s.plaques.includes('「' + SONG_CATALOG['simnyeon-gyeongyeong'].title + '」'), label + ': 작품 방 문에 「십 년을 경영하야」 현판이 있다');
    assert(s.text.includes('선대 사서의 자리'), label + ': 선대 사서의 자리가 있다');
  }
}

async function checkAnchors(page, mode, label, vp) {
  const a = await ev(page, () => window.__t.world.getAnchors());
  assert(a && ANCHOR_KEYS.every((k) => a[k]), label + ': 자리가 모두 있다 (' + Object.keys(a ?? {}).join(', ') + ')');
  assert(a.slots.length === 3 && a.bonus.length === 3, label + ': 칸 자리 셋, 덤 자리 셋');
  const flat = Object.entries(a).flatMap(([k, v]) => (Array.isArray(v) ? v.map((p, i) => [k + i, p]) : [[k, v]]));
  if (mode === '3d') {
    const center = await ev(page, () => { const r = window.__p.root(); return { x: r.position.x, z: r.position.z }; });
    const inside = flat.every(([, p]) => Math.abs(p.x - center.x) <= 6.5 && Math.abs(p.z - center.z) <= 6.5);
    assert(inside, label + ': 3D 자리가 모두 관 안에 있다');
    const screens = await ev(page, (list) => list.map(([k, p]) => [k, window.__t.world.toScreen(p)]), flat);
    const off = screens.filter(([, s]) => s.x < 0 || s.y < 0 || s.x > vp.width || s.y > vp.height).map(([k]) => k);
    assert(off.length === 0, label + ': 3D 자리가 모두 처음 화면 안에 보인다 ' + JSON.stringify(off));
    const cam = await ev(page, () => window.__t.world.getCamera());
    assert(cam && cam.position, label + ': 관 카메라 자리가 쓰인다');
  } else {
    const bad = flat.filter(([, p]) => inCorner(p) || p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100).map(([k]) => k);
    assert(bad.length === 0, label + ': 2D 자리가 그림 판 안에 있고 상황 버튼 구석(x>78%, y>78%)을 피한다 ' + JSON.stringify(bad));
    const hs = await ev(page, () => window.__p.hotspots());
    assert(hs.length === 12, label + ': 누를 수 있는 자리가 열둘 만들어진다 (' + hs.length + ')');
    assert(hs.every((h) => h.w >= 47.5 && h.h >= 47.5), label + ': 누를 자리가 48px 이상이다');
    assert(hs.every((h) => /[가-힣]/.test(h.label)), label + ': 누를 자리 이름이 한국어다');
    const overlaps = [];
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      const A = hs[i]; const B = hs[j];
      if (Math.min(A.r, B.r) - Math.max(A.l, B.l) > 1 && Math.min(A.b, B.b) - Math.max(A.t, B.t) > 1) overlaps.push(A.label + '/' + B.label);
    }
    assert(overlaps.length === 0, label + ': 누를 자리끼리 겹치지 않는다 ' + JSON.stringify(overlaps));
  }
}

// ── 빈 책등과 선대 사서의 자리 ──
async function checkBlank(page, mode, label) {
  if (mode === '3d') {
    const r = await ev(page, () => {
      const p = window.__p;
      const one = (k) => p.segments(k);
      return { shelf: [0, 1, 2].map((i) => one('shelf:' + i)), bonus: [0, 1, 2].map((i) => one('bonus:' + i)), mentor: one('mentor:0'), basket: one('basket:0') };
    });
    const blank = r.shelf[0][0]?.color;
    assert([...r.shelf, ...r.bonus].every((s) => s.length === 1 && same(s[0].color, blank)), label + ': 빈 칸과 덤 칸은 제목 없는 빈 책등 하나씩이다');
    assert(r.mentor.length === 1 && same(r.mentor[0].color, blank), label + ': 선대 사서의 자리는 처음에 비어 있다(빈 책등)');
    assert(r.basket.length === 0, label + ': 빈 바구니에는 책이 없다');
  } else {
    const r = await ev(page, () => ({
      shelf: [0, 1, 2].map((i) => window.__p.holder2D('shelf', i)),
      bonus: [0, 1, 2].map((i) => window.__p.holder2D('bonus', i)),
      mentor: window.__p.holder2D('mentor', 0),
    }));
    assert([...r.shelf, ...r.bonus].every((h) => h.state === 'blank' && h.title === '' && h.rects.length === 1 && h.rects[0].kind === 'blank'), label + ': 빈 칸과 덤 칸은 제목 없는 빈 책등이다');
    assert(r.mentor.state === 'blank' && r.mentor.title === '', label + ': 선대 사서의 자리는 처음에 비어 있다');
  }
}

// ── 계단 오르기(고유 동작) ──
async function stairView(page, mode) {
  return ev(page, (mode) => {
    const p = window.__p;
    if (mode === '3d') {
      const idx = p.mesh('sijo-reactive').userData.index;
      const lan = p.box('sijo-reactive', idx.lantern);
      return {
        steps: idx.finalSteps.map((i) => p.color('sijo-reactive', i)),
        ghosts: idx.ghostSteps.map((i) => p.box('sijo-reactive', i).visible),
        lantern: lan.visible ? lan.p[1] : null,
      };
    }
    const lan = p.q('[data-part="lantern"]');
    return {
      steps: p.qa('[data-part="final-step"]').map((e) => e.getAttribute('fill') + (e.dataset.lit === '1' ? '*' : '')),
      ghosts: p.qa('[data-part="ghost-step"]').map((e) => e.getAttribute('display') !== 'none'),
      lantern: lan.getAttribute('display') === 'none' ? null : -Number(lan.getAttribute('cy')),
    };
  }, mode);
}

async function checkStairs(page, mode, label) {
  const before = await stairView(page, mode);
  assert(before.lantern === null && before.ghosts.every((g) => !g), label + ': 처음에는 등불이 없고 맞지 않는 계단도 없다');
  let prev = before;
  for (let step = 1; step <= 3; step++) {
    await emit(page, 'diorama:stair-step', { step, total: 3 });
    const now = await stairView(page, mode);
    assert(!same(now.steps[step - 1], prev.steps[step - 1]), label + `: 계단 ${step}칸째가 밝아진다`);
    if (step < 3) assert(same(now.steps[step], before.steps[step]), label + `: 아직 오르지 않은 ${step + 1}칸째는 그대로다`);
    assert(now.lantern !== null && (prev.lantern === null || now.lantern > prev.lantern), label + `: 등불이 ${step}칸째로 올라선다`);
    prev = now;
  }
  assert(prev.ghosts.every((g) => !g), label + ': 세 글자면 세 칸에 꼭 맞는다(맞지 않는 계단 없음)');
  // 네 글자 종장 첫 음보: 1칸째부터 다시, 네 번째는 세 칸을 넘는 '맞지 않는 계단'으로 보인다
  await emit(page, 'diorama:stair-step', { step: 1, total: 4 });
  const reset = await stairView(page, mode);
  assert(same(reset.steps[1], before.steps[1]) && same(reset.steps[2], before.steps[2]), label + ': 새로 오르면(1칸째) 앞서 밝힌 계단이 꺼진다');
  for (let step = 2; step <= 4; step++) await emit(page, 'diorama:stair-step', { step, total: 4 });
  const four = await stairView(page, mode);
  assert(four.ghosts[0] === true && four.ghosts.slice(1).every((g) => !g), label + ': 네 글자면 세 칸을 넘는 네 번째 계단이 따로 보인다');
}

// ── 기둥 불 ──
async function pillarView(page, mode) {
  return ev(page, (mode) => {
    const p = window.__p;
    if (mode === '3d') return Array.from({ length: 12 }, (_, i) => p.color('sijo-pillars', i));
    return p.qa('[data-part="pillar"]').map((e) => e.getAttribute('fill'));
  }, mode);
}

async function checkPillars(page, mode, label) {
  const before = await pillarView(page, mode);
  await emit(page, 'diorama:pillar-light', { unit: 1, foot: 0 });
  await emit(page, 'diorama:pillar-light', { unit: 1, foot: 2 });
  const after = await pillarView(page, mode);
  assert(!same(after[4], before[4]) && !same(after[6], before[6]), label + ': 두드린 음보(중장 1·3음보)의 기둥에 불이 켜진다');
  assert(same(after[7], before[7]) && same(after[0], before[0]), label + ': 두드리지 않은 기둥은 그대로다');
  await emit(page, 'diorama:pillar-light', { unit: 0, foot: 0 });
  const reset = await pillarView(page, mode);
  assert(same(reset[6], before[6]) && !same(reset[0], before[0]), label + ': 새 노래(초장 첫 음보)를 두드리면 앞서 켠 불이 꺼지고 다시 센다');
}

// ── 삐져나옴: 갈래마다 다른 모양 ──
async function checkPopOut(page, mode, label) {
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 0, songId: 'chang-naegoja' });
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 2, songId: 'gwandong-byeolgok' });
  await emit(page, 'diorama:pop-out', { area: 'shelf', index: 0, songId: 'chang-naegoja', genre: 'saseol' });
  await emit(page, 'diorama:pop-out', { area: 'shelf', index: 2, songId: 'gwandong-byeolgok', genre: 'gasa' });
  await wait(page, 700);
  if (mode === '3d') {
    const r = await ev(page, () => ({ saseol: window.__p.segments('shelf:0'), gasa: window.__p.segments('shelf:2'), plain: window.__p.segments('shelf:1') }));
    const front = Math.max(...r.plain.map((s) => s.z1));
    const sas = [...r.saseol].sort((a, b) => a.y0 - b.y0);
    assert(sas.length === 3, label + ': 사설시조는 세 장으로 나뉘어 삐져나온다');
    assert(sas[1].z1 - front > 0.6 && Math.abs(sas[0].z1 - front) < 0.05 && Math.abs(sas[2].z1 - front) < 0.05, label + ': 사설시조는 가운데 장(중장)만 서가 밖으로 튀어나온다');
    assert(r.gasa.length >= 5 && Math.max(...r.gasa.map((s) => s.z1)) - front > 1.2, label + ': 가사는 행이 이어져 서가 밖으로 줄줄이 길게 나온다');
  } else {
    const r = await ev(page, () => ({ saseol: window.__p.holder2D('shelf', 0), gasa: window.__p.holder2D('shelf', 2) }));
    const books = r.saseol.rects.filter((x) => x.kind === 'book');
    const sticks = r.saseol.rects.filter((x) => x.kind === 'stick');
    const bookRight = Math.max(...books.map((x) => x.x1));
    assert(r.saseol.state === 'popped' && r.saseol.genre === 'saseol', label + ': 사설시조 책이 삐져나온 모습이 된다');
    assert(books.length === 2 && sticks.length === 1 && sticks[0].x1 - bookRight > 50, label + ': 사설시조는 가운데 장(중장)만 칸 밖으로 튀어나온다');
    assert(sticks[0].y0 >= Math.min(...books.map((x) => x.y1)) - 1 && sticks[0].y1 <= Math.max(...books.map((x) => x.y0)) + 1, label + ': 튀어나온 부분이 초장과 종장 사이(중장)다');
    const gs = r.gasa.rects.filter((x) => x.kind === 'stick');
    assert(gs.length === 5 && r.gasa.genre === 'gasa', label + ': 가사는 행이 이어져 칸 밖으로 줄줄이 나온다(사설시조와 모양이 다르다)');
  }
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 0, songId: null });
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 2, songId: null });
}

// ── 묶음과 선대 사서의 자리 ──
async function checkBindAndMentor(page, mode, label) {
  const ids = ['dongjitdal', 'ireondeul', 'imomi-jukgo'];
  for (const [i, id] of ids.entries()) await emit(page, 'diorama:slot-set', { area: 'shelf', index: i, songId: id });
  if (mode === '2d') {
    const pre = await ev(page, () => [0, 1, 2].map((i) => window.__p.holder2D('shelf', i)));
    assert(pre.every((h) => h.state === 'book' && h.title === ''), label + ': 꽂았지만 묶기 전에는 제목이 보이지 않는다');
  }
  await emit(page, 'diorama:shelf-bound', { area: 'shelf', songIds: ids });
  await emit(page, 'diorama:slot-set', { area: 'mentor', index: 0, songId: 'taesan' });
  await wait(page, 1300);
  if (mode === '3d') {
    const r = await ev(page, () => {
      const p = window.__p;
      const m = p.mesh('sijo-books');
      const threads = [0, 1].map((t) => p.box('sijo-books', Object.keys(m.userData.holders).length * m.userData.segMax + t).visible);
      return { shelf: [0, 1, 2].map((i) => p.segments('shelf:' + i)), mentor: p.segments('mentor:0'), threads, blank: p.segments('bonus:0')[0]?.color };
    });
    assert(r.threads.every(Boolean), label + ': 칸 세 권이 실로 묶인다');
    assert(r.shelf.every((s) => s.length === 2), label + ': 묶인 책등마다 금박이 찍힌다');
    assert(r.mentor.length === 2 && !same(r.mentor[0].color, r.blank), label + ': 보스를 마치면 선대 사서의 자리에 책이 꽂힌다');
  } else {
    const r = await ev(page, () => ({ shelf: [0, 1, 2].map((i) => window.__p.holder2D('shelf', i)), mentor: window.__p.holder2D('mentor', 0), threads: window.__p.qa('[data-part="thread"][data-area="shelf"]').filter((e) => e.getAttribute('display') !== 'none').length }));
    assert(r.shelf.every((h, i) => h.title === SONG_CATALOG[ids[i]].title), label + ': 묶인 뒤에 책등 제목이 나타난다');
    assert(r.shelf.every((h) => h.rects.some((x) => x.kind === 'gold')), label + ': 묶인 책등마다 금박이 찍힌다');
    assert(r.threads === 2, label + ': 칸 세 권이 실로 묶인다');
    assert(r.mentor.state === 'book' && r.mentor.title === SONG_CATALOG.taesan.title, label + ': 보스를 마치면 선대 사서의 자리에 「태산이 높다 하되」가 꽂힌다');
  }
}

// ── 먹안개와 단청 ──
async function checkFogAndDancheong(page, mode, label) {
  const view = () => ev(page, (mode) => {
    const p = window.__p;
    if (mode === '3d') return { fog: p.mesh('sijo-fog').visible, wall: p.color('sijo-fixed', 0), roof: p.mesh('sijo-roof').material.color.getHexString() };
    return { fog: p.svg().querySelector('[data-part="fog"]').getAttribute('display') !== 'none', wall: p.svg().dataset.dancheong, roof: p.attr('polygon', 'fill') };
  }, mode);
  const before = await view();
  assert(before.fog, label + ': 처음에는 먹안개가 깔려 있다');
  await emit(page, 'diorama:fog-recede', {});
  await wait(page, 2400);
  const mid = await view();
  assert(!mid.fog, label + ': 먹안개가 물러난다');
  await emit(page, 'diorama:dancheong-restore', {});
  await wait(page, 2000);
  const after = await view();
  assert(!same(after.roof, before.roof) && !same(after.wall, before.wall), label + ': 단청이 돌아오면 먹빛 재질이 단청색으로 바뀐다');
}

// ── 사건 전부 ──
async function checkAllEvents(page, label, errors) {
  const n = errors.length;
  for (const [name, detail] of [...DIORAMA, ...GARBAGE]) await emit(page, name, detail);
  await wait(page, 300);
  assert(errors.length === n, label + ': 디오라마 사건 열셋과 엉터리 값이 콘솔 오류 없이 처리된다 (' + errors.slice(n).join(' | ') + ')');
}

async function checkBudget(page, mode, label) {
  if (mode !== '3d') return;
  await ev(page, () => window.__p.frames(3));
  const calls = await ev(page, () => window.__p.stats().drawCalls);
  assert(withinBudget(calls), label + ': 그리기 호출이 ' + calls + '회로 ' + BUDGET + '회 이하다');
}

// ── 음성 사례 ──
async function checkNegatives(page, mode, label) {
  // 1) 모르는 사건과 엉터리 값은 모형을 바꾸지 않는다(모형을 따로 하나 만들어 직접 넣어 본다)
  const r = await ev(page, async (mode) => {
    const mod = await import('../../js/world/wings/sijo.js');
    const { wingById } = await import('../../js/data/wings.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;width:320px;height:180px;left:-9999px';
    document.body.append(host);
    const h = mod.create2D({ container: host, wing: wingById('sijo'), assets: { image: () => null, texture: () => null }, restored: false, reduceMotion: () => false });
    const snap = () => host.innerHTML;
    const a = snap();
    let threw = null;
    try {
      h.react('diorama:nope', { step: 3 });
      h.react('stair-step', { step: 1 });
      h.react('diorama:stair-step', { step: 0 });
      h.react('diorama:slot-set', { area: 'nowhere', index: 0, songId: 'x' });
      h.react('diorama:pop-out', { area: 'shelf', index: 7 });
      h.react(undefined, undefined);
      h.update(0.016);
    } catch (e) { threw = String(e); }
    const b = snap();
    h.react('diorama:stair-step', { step: 1, total: 3 });
    const c = snap();
    h.dispose();
    host.remove();
    return { threw, unchanged: a === b, changed: b !== c, mode };
  }, mode);
  assert(r.threw === null && r.unchanged, label + ': 모르는 사건과 엉터리 값은 오류 없이 무시되고 아무것도 바꾸지 않는다');
  assert(r.changed, label + ': (대조) 올바른 계단 사건은 그림을 바꾼다');
  // 2) 구석 자리 판별이 실제로 잡는다
  assert(inCorner({ x: 90, y: 90 }) && !inCorner({ x: 90, y: 60 }), label + ': 구석 자리 판별이 상황 버튼 구석의 자리를 잡는다');
  // 3) 예산을 넘긴 장면은 점검이 잡는다
  if (mode === '3d') {
    const over = await ev(page, async () => {
      const THREE = await import('three');
      const root = window.__p.root();
      const extra = new THREE.Group();
      const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      for (let i = 0; i < 70; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x777777 }));
        m.position.set((i % 10) - 5, 0.2 + Math.floor(i / 10) * 0.3, 3);
        extra.add(m);
      }
      root.add(extra);
      await window.__p.frames(3);
      const calls = window.__p.stats().drawCalls;
      root.remove(extra);
      extra.traverse((o) => { o.material?.dispose?.(); });
      geo.dispose();
      await window.__p.frames(3);
      return { calls, after: window.__p.stats().drawCalls };
    });
    assert(!withinBudget(over.calls), label + ': 예산을 넘긴 장면(' + over.calls + '회)을 점검이 잡아낸다');
    assert(withinBudget(over.after), label + ': 덧붙인 것을 빼면 다시 예산 안이다(' + over.after + '회)');
  }
}

// ── 움직임 줄이기와 다시 들어오기(단청이 돌아온 관) ──
async function checkReduceMotionAndRestored(page, mode, label) {
  await ev(page, () => { window.__t.world.setDeviceReduceMotion(true); window.__t.world.setDancheong('sijo', 0); window.__t.world.enterCorridor(); });
  await enter(page);
  await emit(page, 'diorama:pop-out', { area: 'shelf', index: 0, songId: 'chang-naegoja', genre: 'saseol' });
  await ev(page, () => window.__p.frames(2));
  if (mode === '3d') {
    const segs = await ev(page, () => window.__p.segments('shelf:0'));
    const sorted = [...segs].sort((a, b) => a.y0 - b.y0);
    assert(sorted.length === 3 && sorted[1].z1 - sorted[0].z1 > 0.85, label + ': 움직임 줄이기에서는 삐져나옴이 서서히가 아니라 바로 끝 모양이 된다');
  } else {
    const h = await ev(page, () => window.__p.holder2D('shelf', 0));
    const book = h.rects.find((x) => x.kind === 'book');
    const stick = h.rects.find((x) => x.kind === 'stick');
    assert(stick && stick.x1 - book.x1 > 80, label + ': 움직임 줄이기에서는 삐져나옴이 서서히가 아니라 바로 끝 모양이 된다');
  }
  await ev(page, () => { window.__t.world.setDeviceReduceMotion(false); window.__t.world.setDancheong('sijo', 1); window.__t.world.enterCorridor(); });
  await enter(page);
  const fog = await ev(page, (mode) => (mode === '3d' ? window.__p.mesh('sijo-fog').visible : window.__p.svg().querySelector('[data-part="fog"]').getAttribute('display') !== 'none'), mode);
  assert(!fog, label + ': 단청이 돌아온 관에 다시 들어오면 먹안개가 없다');
}

// ── 실행 ──
const server = await startServer();
const combos = [
  { mode: '3d', vp: 'chromebook' },
  { mode: '3d', vp: 'phone' },
  { mode: '2d', vp: 'chromebook' },
  { mode: '2d', vp: 'phone' },
];
let failed = false;
for (const { mode, vp } of combos) {
  const label = `${mode.toUpperCase()} ${VIEWPORTS[vp].width}×${VIEWPORTS[vp].height}`;
  let game;
  try {
    game = await open(server, { viewport: VIEWPORTS[vp], disable3d: mode === '2d' });
    const { page, errors, external } = game;
    assert(await ev(page, () => window.__p.mode()) === mode, label + ': ' + (mode === '3d' ? '3D로 열린다' : '3D가 없으면 2D 그림 판으로 열린다'));
    assert(await enter(page), label + ': 시조관에 들어간다');
    assert(await ev(page, () => window.__t.world.getPlace()) === 'sijo', label + ': 지금 자리가 시조관이다');
    await checkStructure(page, mode, label);
    await checkAnchors(page, mode, label, VIEWPORTS[vp]);
    await checkBlank(page, mode, label);
    await checkStairs(page, mode, label);
    await checkPillars(page, mode, label);
    await checkPopOut(page, mode, label);
    await checkBindAndMentor(page, mode, label);
    await checkBudget(page, mode, label);
    await checkFogAndDancheong(page, mode, label);
    await checkAllEvents(page, label, errors);
    await checkBudget(page, mode, label);
    await checkNegatives(page, mode, label);
    if (vp === 'chromebook') await checkReduceMotionAndRestored(page, mode, label);
    assert(external.length === 0, label + ': 바깥 주소 요청이 없다 (' + external.join(', ') + ')');
    assert(errors.length === 0, label + ': 콘솔 오류가 없다 (' + errors.join(' | ') + ')');
  } catch (e) {
    console.error(e.message);
    failed = true;
  } finally {
    await game?.close();
  }
}
await server.close();
if (failed) process.exitCode = 1;
