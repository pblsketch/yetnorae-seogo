// 가사관 모형 점검(T10, spec 3.1·5.4·6·8·14·17).
// 1) 회랑 상태(Node): 걸을 때마다 칸이 하나씩 지어지고, 그리는 칸 수는 늘지 않는다(다시 쓰기).
// 2) 브라우저: 3D와 2D(3D 끔), 1366×768과 844×390에서 모형이 뜨고, README의 반응 사건을 모두 오류 없이 받으며,
//    걷기 반응이 눈에 보이게 바뀌고, 많이 걸어도 그리기 호출이 60 이하이며, 자리가 있고(2D는 상황 버튼 구석 밖),
//    삐져나옴이 갈래마다 다른 모양이고, 빈자리에 제목이 없으며, 바깥 요청이 없다.
// 점검 페이지 tests/pages/wing-gasa.html이 세계 바탕에 가사관 모형만 끼워 띄운다(제품 흐름에는 없다).
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { createCorridor, CORRIDOR_DEFAULTS } from '../js/world/wings/gasa-corridor.js';
import { createWingState } from '../js/world/wings/gasa-shared.js';

const PAGE = 'tests/pages/wing-gasa.html';
const BUDGET = 60;
const SIZES = { chromebook: VIEWPORTS.chromebook, phone: VIEWPORTS.phone };
const ANCHOR_KEYS = ['slots', 'bonus', 'basket', 'returnedShelf', 'roomDoor', 'entrance', 'nextDoor'];
const GENRES = ['sijo', 'saseol', 'hyangga', 'goryeo', 'gasa'];

// README 8.1의 반응 사건과 그럴듯한 detail
const EVENTS = [
  ['diorama:fold', { unit: 0 }],
  ['diorama:pillar-light', { unit: 0, line: null, foot: 2 }],
  ['diorama:floor-fill', { gu: 4 }],
  ['diorama:aa-door', { present: false, unit: null }],
  ['diorama:stair-step', { step: 1, total: 3 }],
  ['diorama:refrain-link', { from: { unit: 0, line: 1 }, to: { unit: 1, line: 1 } }],
  ['diorama:walk-step', { step: 1 }],
  ['diorama:unroll', { unit: 1, feet: 5 }],
  ['diorama:slot-set', { area: 'shelf', index: 0, songId: 'myeonangjeongga' }],
  ['diorama:slot-set', { area: 'basket', index: 0, songId: 'daekdeul-dongnanji', to: 'saseol' }],
  ['diorama:shelf-bound', { area: 'shelf', songIds: ['myeonangjeongga', 'gwandong-byeolgok', 'gyuwonga'] }],
  ['diorama:pop-out', { area: 'bonus', index: 1, songId: 'dongjitdal', genre: 'sijo' }],
  ['diorama:fog-recede', {}],
  ['diorama:dancheong-restore', {}],
];

const withinBudget = (calls) => calls > 0 && calls <= BUDGET;
// 2D 자리 가운데 상황 버튼 구석(x>78, y>78)에 있거나 걷는 띠(y 40~95) 밖에 있는 것
function anchorProblems(anchors) {
  const out = [];
  for (const [k, v] of Object.entries(anchors ?? {})) {
    (Array.isArray(v) ? v : [v]).forEach((p, i) => {
      if (!p || typeof p.x !== 'number') return;
      if (p.x > 78 && p.y > 78) out.push(k + i + ' 구석');
      if (p.y < 40 || p.y > 95 || p.x < 0 || p.x > 100) out.push(k + i + ' 띠 밖');
    });
  }
  return out;
}

function frames(page, n = 2) {
  return page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const emit = (page, name, detail) => ev(page, ([n, d]) => window.__t.events.emit(n, d), [name, detail]);
const dbg = (page) => ev(page, () => { const d = window.__t.world.getThree().root.userData.gasaDebug(); const { color, signature, boundsX, ...rest } = d; return { ...rest, sig: signature() }; });

// ── 1) 회랑 상태 ──
function checkCorridorModel() {
  console.log('\n▶ 회랑 상태(Node)');
  const c = createCorridor();
  const o = CORRIDOR_DEFAULTS;
  assert(c.built === o.initialBuilt && c.segments().length === o.pool, '처음에는 칸 ' + o.initialBuilt + '개가 지어져 있고 칸 ' + o.pool + '개를 그린다');
  const n = c.step();
  assert(c.built === o.initialBuilt + 1 && n === o.initialBuilt, '걷기 한 걸음에 칸 하나(기둥 넷과 처마)가 새로 지어진다');
  const seg = c.segments().find((s) => s.n === n);
  assert(seg && seg.built && seg.rise < 1 && seg.lit.every((v) => v > 0), '새 칸은 솟아오르는 중이고 기둥 넷에 불이 켜진다');
  for (let i = 0; i < 200; i++) c.step();
  for (let i = 0; i < 400; i++) c.tick(0.1);
  const segs = c.segments();
  assert(segs.length === o.pool, '200걸음을 걸어도 그리는 칸 수는 ' + o.pool + '개 그대로다(다시 쓰기)');
  assert(c.offset === c.built - o.front && c.shown === c.offset, '앞머리를 넘으면 회랑이 미끄러져 새 칸이 늘 같은 자리에서 지어진다');
  const newest = segs.find((s) => s.n === c.built - 1);
  assert(newest && Math.abs(newest.rel - (o.front - 1)) < 1e-9, '가장 새 칸은 앞머리 자리(' + (o.front - 1) + '번째)에 있다');
  assert(segs.every((s) => s.rel >= 0 && s.rel <= o.pool - 1) && new Set(segs.map((s) => s.n)).size === o.pool, '그리는 칸은 겹치지 않고 문 안쪽에 있다');
  assert(segs.filter((s) => s.ghost).length === o.pool - o.front, '지은 칸 너머는 먹안개 속 흐린 칸으로 끝없이 이어 보인다');
  // 미끄러지는 중에는 문 앞 칸이 가라앉는다
  const d = createCorridor();
  for (let i = 0; i < 6; i++) d.step(true);
  d.step();
  d.tick(0.3);
  const sinking = d.segments().find((s) => s.rel < 0);
  assert(sinking && sinking.sink > 0 && sinking.sink < 1, '회랑이 미끄러지는 동안 문 앞으로 밀린 칸이 바닥으로 가라앉는다');
  // 기둥 불: 그려진 지은 칸이면 그 칸, 아니면 가장 새 칸
  const l = createCorridor();
  assert(l.light(0, 6).n === 0 && l.light(0, 6).k === 2, '기둥 불은 단위의 칸, 음보를 넷으로 나눈 기둥에 켜진다');
  assert(l.light(99, 0).n === l.built - 1 && l.light(undefined, undefined).n === l.built - 1, '(음성) 없는 단위나 빈 값이 와도 가장 새 칸에 켜고 깨지지 않는다');
  // 음성: 다시 쓰지 않고 칸을 계속 늘리는 모형이면 같은 검사가 잡는다
  const leaky = { built: 2, step() { this.built++; }, segments() { return Array.from({ length: this.built }, (_, n) => ({ n })); } };
  for (let i = 0; i < 50; i++) leaky.step();
  assert(leaky.segments().length !== o.pool, '(음성) 칸을 다시 쓰지 않는 모형은 그리는 칸 수 검사에 걸린다');

  // 자리 상태
  const st = createWingState();
  st.apply('diorama:slot-set', { area: 'shelf', index: 1, songId: 'gyuwonga' });
  st.apply('diorama:pop-out', { area: 'shelf', index: 1, songId: 'gyuwonga', genre: 'saseol' }, true);
  assert(st.slots.shelf[1] === 'gyuwonga' && st.pops.get('shelf:1')?.genre === 'saseol', '꽂기와 삐져나옴을 자리마다 기억한다');
  st.apply('diorama:slot-set', { area: 'shelf', index: 1, songId: null });
  assert(st.slots.shelf[1] === null && !st.pops.has('shelf:1'), '노래를 빼면 삐져나옴도 사라진다');
  st.apply('diorama:slot-set', { area: 'basket', index: 0, songId: 'x', to: 'sijo' });
  st.apply('diorama:pop-out', { area: 'basket', index: 0, songId: 'x', genre: 'sijo' }, true);
  assert(st.slots.basket[0].to === null, '바구니에서 삐져나온 노래는 행선지 표시가 지워진다');
  assert(st.apply('diorama:nothing', {}) === false && st.apply('diorama:slot-set', { area: 'roof', index: 9 }) === true && st.slots.shelf.length === 3, '(음성) 모르는 사건과 없는 자리는 조용히 넘긴다');
}

// ── 2) 브라우저 ──
async function open(server, opts) {
  const game = await openGame(server.url, { path: PAGE, ...opts });
  await game.page.waitForFunction(() => window.__t?.ready === true, null, { timeout: 20000 });
  await frames(game.page, 3);
  return game;
}

async function check3D(page, label) {
  assert((await ev(page, () => window.__t.world.getMode())) === '3d', label + ': 3D로 연다');
  assert((await ev(page, () => window.__t.world.getPlace())) === 'gasa', label + ': 가사관에 들어와 있다');
  const vp = page.viewportSize();

  // 자리
  const a = await ev(page, () => window.__t.world.getAnchors());
  assert(ANCHOR_KEYS.every((k) => a && k in a) && a.slots.length === 3 && a.bonus.length === 3 && !('camera' in a), label + ': 자리(칸 셋, 덤 셋, 바구니, 돌아온 노래 선반, 작품 방 문, 기다리는 자리, 다음 문)가 있다');
  const rootPos = await ev(page, () => { const p = window.__t.world.getThree().root.position; return { x: p.x, z: p.z }; });
  const all = ANCHOR_KEYS.flatMap((k) => (Array.isArray(a[k]) ? a[k] : [a[k]]));
  assert(all.every((p) => Math.abs(p.x - rootPos.x) <= 6.05 && Math.abs(p.z - rootPos.z) <= 6.05), label + ': 자리가 모두 관 안 걸을 수 있는 곳에 있다');
  const onScreen = await ev(page, (pts) => pts.map((p) => window.__t.world.toScreen(p)), all);
  assert(onScreen.every((s) => s.x > 0 && s.x < vp.width && s.y > 0 && s.y < vp.height), label + ': 처음 카메라에서 자리가 모두 화면 안에 보인다');

  // 반응 사건 전부
  const before = await dbg(page);
  for (const [name, detail] of EVENTS) await emit(page, name, detail);
  for (const [name] of EVENTS) { await emit(page, name, null); await emit(page, name, {}); await emit(page, name, { area: 'x', index: -1, unit: 'a' }); }
  await frames(page, 3);
  const afterAll = await dbg(page);
  assert(afterAll.corridor.built > before.corridor.built, label + ': README의 반응 사건을 모두(이상한 detail까지) 오류 없이 받는다');

  // 걷기: 칸이 지어지고 기둥 불이 켜지며 배치가 바뀐다
  const s0 = await dbg(page);
  await emit(page, 'diorama:walk-step', { step: 1 });
  await frames(page, 2);
  const s1 = await dbg(page);
  assert(s1.corridor.built === s0.corridor.built + 1, label + ': 걷기 한 걸음에 칸 하나가 늘어난다 (' + s0.corridor.built + '→' + s1.corridor.built + ')');
  assert(s1.sig.cylinderColors !== s0.sig.cylinderColors, label + ': 새 칸의 기둥 넷에 불이 켜진다(기둥 색이 바뀐다)');
  await page.waitForTimeout(1200);
  const s2 = await dbg(page);
  assert(s2.sig.cylinders !== s0.sig.cylinders && s2.sig.boxes !== s0.sig.boxes, label + ': 기둥과 처마가 솟고 회랑 배치가 실제로 바뀐다');

  // 많이 걸어도 예산 안
  const c10 = s2.cylinders;
  await ev(page, () => { for (let i = 0; i < 60; i++) window.__t.events.emit('diorama:walk-step', { step: i + 2 }); });
  await page.waitForTimeout(400);
  await frames(page, 3);
  const s3 = await dbg(page);
  const stats = await ev(page, () => window.__t.world.getStats());
  console.log('  · ' + label + ' 60걸음 뒤 그리기 호출 ' + stats.drawCalls + '회, 원기둥 ' + s3.cylinders + '개, 상자 ' + s3.boxes + '개, 지은 칸 ' + s3.corridor.built);
  assert(withinBudget(stats.drawCalls), label + ': 60걸음을 걸어도 그리기 호출이 ' + BUDGET + ' 이하다 (' + stats.drawCalls + ')');
  assert(s3.cylinders === c10 && s3.boxes <= s3.capacity.boxes && s3.cylinders <= s3.capacity.cylinders, label + ': 칸을 다시 써서 그리는 양이 늘지 않는다');
  assert(s3.corridor.offset > 0, label + ': 회랑이 앞으로 미끄러지며 끝없이 길어진다 (offset ' + s3.corridor.offset + ')');
  assert(stats.shadows === false && stats.pixelRatio <= 1.5, label + ': 그림자 없음, 픽셀 비율 1.5 이하');

  // 기둥 불(두드리기)
  await page.waitForTimeout(1600);
  const p0 = await dbg(page);
  await emit(page, 'diorama:pillar-light', { unit: 0, foot: 1 });
  await frames(page, 2);
  const p1 = await dbg(page);
  assert(p1.sig.cylinderColors !== p0.sig.cylinderColors, label + ': 기둥 불 사건에 기둥 하나가 밝아진다');

  // 칸: 빈자리는 제목 없음, 묶이면 제목과 금박(앞의 dancheong-restore로 돌아온 단청을 되돌리고 다시 들어간다)
  await ev(page, () => { window.__t.world.setDancheong('gasa', 0); window.__t.world.enterWing('gasa'); });
  await frames(page, 2);
  const e0 = await dbg(page);
  assert(e0.slots.shelf.every((x) => x === null) && e0.bound.shelf === null && e0.bound.bonus === null, label + ': 처음 칸과 덤 칸은 제목 없는 빈 책등이다');
  // 삐져나옴: 갈래마다 다른 모양(움직임 줄이기로 바로 끝 모양을 본다)
  await ev(page, () => window.__t.world.setDeviceReduceMotion(true));
  const shapes = {};
  const SX = await ev(page, () => { const r = window.__t.world.getThree().root.position; return r.x; });
  for (const g of GENRES) {
    await emit(page, 'diorama:slot-set', { area: 'shelf', index: 0, songId: 'x-' + g });
    await emit(page, 'diorama:pop-out', { area: 'shelf', index: 0, songId: 'x-' + g, genre: g });
    await frames(page, 2);
    shapes[g] = await ev(page, () => window.__t.world.getThree().root.userData.gasaDebug().boundsX(-5.85, -4.95));
  }
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 0, songId: null });
  await frames(page, 2);
  const empty = await ev(page, () => window.__t.world.getThree().root.userData.gasaDebug().boundsX(-5.85, -4.95));
  const key = (b) => [b.n, b.minY, b.maxY, b.maxZ].map((v) => Math.round(v * 100)).join('/');
  assert(new Set(GENRES.map((g) => key(shapes[g]))).size === GENRES.length, label + ': 삐져나온 모양이 갈래 다섯 모두 다르다');
  assert(shapes.saseol.maxZ > empty.maxZ + 1.2, label + ': 사설시조를 꽂으면 늘어난 중장이 서가 밖으로 길게 튀어나온다 (' + (shapes.saseol.maxZ - empty.maxZ).toFixed(2) + 'm)');
  assert(shapes.hyangga.maxY > empty.maxY + 0.3, label + ': 향가는 4·4·2 탑이 칸 위로 솟는다');
  assert(shapes.sijo.maxY < shapes.gasa.maxY - 0.3, label + ': 시조는 짧은 세 장이라 긴 가사 칸에 모자란다');
  assert(SX !== null, label + ': 관 자리 좌표를 읽었다');
  await emit(page, 'diorama:shelf-bound', { area: 'shelf', songIds: ['myeonangjeongga', 'gwandong-byeolgok', 'gyuwonga'] });
  await frames(page, 2);
  const b1 = await dbg(page);
  assert(JSON.stringify(b1.bound.shelf) === JSON.stringify(['myeonangjeongga', 'gwandong-byeolgok', 'gyuwonga']) && b1.sig.boxColors !== e0.sig.boxColors, label + ': 칸이 묶이면 세 권이 실로 묶이고 금박과 제목이 나온다');

  // 먹안개와 단청
  assert(b1.fogVisible === true, label + ': 처음에는 먹안개가 깔려 있다');
  await emit(page, 'diorama:fog-recede', {});
  await frames(page, 2);
  assert((await dbg(page)).fogVisible === false, label + ': 먹안개가 물러난다(움직임 줄이기에서는 바로)');
  const ink = await ev(page, () => window.__t.world.getThree().root.userData.gasaDebug().color('cylinders', 0));
  await ev(page, () => window.__t.world.setDancheong('gasa', 1));
  await frames(page, 2);
  const lit = await dbg(page);
  const red = await ev(page, () => window.__t.world.getThree().root.userData.gasaDebug().color('cylinders', 0));
  assert(lit.level === 1 && ink !== red, label + ': 단청 값을 따라 먹빛 기둥이 단청색으로 바뀐다 (' + ink + '→' + red + ')');
  // 움직임 줄이기: 걷기 반응이 바로 끝 모양이 된다
  await emit(page, 'diorama:walk-step', { step: 99 });
  await frames(page, 1);
  const rm = await dbg(page);
  assert(rm.corridor.shown === rm.corridor.offset, label + ': 움직임 줄이기에서는 회랑이 미끄러지지 않고 잘라 바뀐다');
  await ev(page, () => { window.__t.world.setDeviceReduceMotion(false); window.__t.world.setDancheong('gasa', 0); });

  // 음성: 모르는 사건은 조용히 넘긴다(관 모형을 세계 밖에서 따로 만들어 직접 부른다)
  const unknown = await ev(page, () => {
    const { THREE, gasa } = window.__t;
    const root = new THREE.Group();
    const h = gasa.create3D({ THREE, root, wing: { id: 'gasa', name: '가사관' }, assets: { texture: () => null, image: () => null }, restored: false, reduceMotion: () => false });
    h.update(0.016);
    const sig = root.userData.gasaDebug().signature();
    let threw = false;
    try { h.react('diorama:nothing', { step: 3 }); h.react('wing:state', {}); h.react(undefined, undefined); h.update(0.016); } catch { threw = true; }
    const same = JSON.stringify(root.userData.gasaDebug().signature()) === JSON.stringify(sig);
    const keys = Object.keys(h).sort();
    h.dispose();
    return { threw, same, keys, left: root.children.length };
  });
  assert(!unknown.threw && unknown.same, label + ': (음성) 모르는 사건은 오류 없이 넘기고 아무것도 바꾸지 않는다');
  assert(JSON.stringify(unknown.keys) === JSON.stringify(['anchors', 'dispose', 'react', 'update']) && unknown.left === 0, label + ': 손잡이가 약속대로이고 dispose가 만든 것을 모두 치운다');

  // 음성: 예산을 넘기는 그물을 넣으면 그리기 호출 검사가 잡는다
  await ev(page, () => {
    const { THREE } = window.__t;
    const root = window.__t.world.getThree().root;
    const g = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); m.name = 'heavy'; m.position.set((i % 10) - 4.5, 0.5, 2); root.add(m); }
  });
  await frames(page, 3);
  const heavy = await ev(page, () => window.__t.world.getStats().drawCalls);
  assert(!withinBudget(heavy), label + ': (음성) 그물을 80개 더 넣으면 예산 초과(' + heavy + ')를 잡는다');
  await ev(page, () => { const r = window.__t.world.getThree().root; r.children.filter((c) => c.name === 'heavy').forEach((c) => r.remove(c)); });
  await frames(page, 3);
  assert(withinBudget(await ev(page, () => window.__t.world.getStats().drawCalls)), label + ': 그물을 빼면 다시 예산 안이다');

  // 자리로 가면 도착 알림이 그 자리를 알려 준다
  const before2 = await ev(page, () => window.__t.arrivals.length);
  const target = await ev(page, () => window.__t.world.toScreen(window.__t.world.getAnchors().slots[1]));
  await page.mouse.click(target.x, target.y);
  await page.waitForFunction((n) => window.__t.arrivals.length > n, before2, { timeout: 10000 });
  const arr = await ev(page, () => window.__t.arrivals.at(-1));
  assert(arr.anchor?.key === 'slots' && arr.anchor?.index === 1, label + ': 칸 자리를 누르면 그 자리에 가서 알려 준다 ' + JSON.stringify(arr.anchor));
}

async function check2D(page, label) {
  assert((await ev(page, () => window.__t.world.getMode())) === '2d', label + ': 3D가 없으면 2D 그림 판으로 연다');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.gasa2d')).position === 'absolute', null, { timeout: 5000 });
  assert(true, label + ': 2D 모형이 스스로 css/wing-gasa.css를 붙인다');
  const a = await ev(page, () => window.__t.world.getAnchors());
  assert(ANCHOR_KEYS.every((k) => a && k in a) && a.slots.length === 3 && a.bonus.length === 3, label + ': 2D 자리가 모두 있다');
  assert(anchorProblems(a).length === 0, label + ': 2D 자리가 상황 버튼 구석 밖, 걷는 띠 안에 있다 ' + JSON.stringify(anchorProblems(a)));
  assert(anchorProblems({ bad: { x: 85, y: 85 } }).length === 1 && anchorProblems({ bad: { x: 50, y: 20 } }).length === 1, '(음성) 구석이나 띠 밖 자리를 검사가 잡는다');
  const hs = await ev(page, () => [...document.querySelectorAll('.board-hotspot')].map((b) => { const r = b.getBoundingClientRect(); return { k: b.dataset.anchor + (b.dataset.index ?? ''), l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
  assert(hs.length === 11, label + ': 자리마다 누를 수 있는 자리가 생긴다 (' + hs.length + ')');
  const overlap = [];
  hs.forEach((p, i) => hs.slice(i + 1).forEach((q) => { if (p.l < q.r - 1 && q.l < p.r - 1 && p.t < q.b - 1 && q.t < p.b - 1) overlap.push(p.k + '×' + q.k); }));
  assert(overlap.length === 0, label + ': 누를 자리끼리 겹치지 않는다 ' + JSON.stringify(overlap));
  const vp = page.viewportSize();
  const docOk = await ev(page, () => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1);
  assert(docOk && vp.width > 0, label + ': 그림이 문서를 넘치게 하지 않는다');

  // 반응 사건 전부
  const built0 = Number(await ev(page, () => document.querySelector('.gasa2d').dataset.built));
  for (const [name, detail] of EVENTS) await emit(page, name, detail);
  for (const [name] of EVENTS) { await emit(page, name, null); await emit(page, name, {}); await emit(page, name, { area: 'x', index: -1, unit: 'a' }); }
  await frames(page, 3);
  const built1 = Number(await ev(page, () => document.querySelector('.gasa2d').dataset.built));
  assert(built1 > built0, label + ': README의 반응 사건을 모두(이상한 detail까지) 오류 없이 받는다');

  // 걷기
  const pts0 = await ev(page, () => [...document.querySelectorAll('.gasa2d__deck')].map((p) => p.getAttribute('points')).join('|'));
  await emit(page, 'diorama:walk-step', { step: 2 });
  await frames(page, 2);
  assert(Number(await ev(page, () => document.querySelector('.gasa2d').dataset.built)) === built1 + 1, label + ': 걷기 한 걸음에 칸 하나가 늘어난다');
  assert((await ev(page, () => document.querySelectorAll('.gasa2d__pillar.is-lit').length)) >= 4, label + ': 새 칸의 기둥 넷에 불이 켜진다');
  await page.waitForTimeout(1100);
  const pts1 = await ev(page, () => [...document.querySelectorAll('.gasa2d__deck')].map((p) => p.getAttribute('points')).join('|'));
  assert(pts1 !== pts0, label + ': 회랑 그림이 실제로 바뀐다');
  await ev(page, () => { for (let i = 0; i < 60; i++) window.__t.events.emit('diorama:walk-step', { step: i + 3 }); });
  await frames(page, 3);
  const segCount = await ev(page, () => document.querySelectorAll('.gasa2d__seg').length);
  const pillars = await ev(page, () => document.querySelectorAll('.gasa2d__seg .gasa2d__pillar').length);
  assert(segCount === CORRIDOR_DEFAULTS.pool && pillars === CORRIDOR_DEFAULTS.pool * 4, label + ': 60걸음 뒤에도 칸 ' + segCount + '개, 기둥 ' + pillars + '개를 다시 쓴다(넷씩)');
  assert(Number(await ev(page, () => document.querySelector('.gasa2d').dataset.offset)) > 0, label + ': 회랑이 앞으로 미끄러지며 끝없이 길어진다');

  // 칸과 삐져나옴
  await ev(page, () => { window.__t.world.setDancheong('gasa', 0); window.__t.world.enterWing('gasa'); });
  await frames(page, 2);
  const titles0 = await ev(page, () => [...document.querySelectorAll('.gasa2d__shelf--main .gasa2d__title')].map((t) => t.textContent).join(''));
  const empties = await ev(page, () => [...document.querySelectorAll('.gasa2d__vol')].filter((v) => v.dataset.state === 'empty').length);
  assert(titles0 === '' && empties === 6, label + ': 처음 칸과 덤 칸은 제목 없는 빈 책등 여섯이다');
  await ev(page, () => window.__t.world.setDeviceReduceMotion(true));
  const rects = {};
  for (const g of GENRES) {
    await emit(page, 'diorama:slot-set', { area: 'shelf', index: 1, songId: 'x-' + g });
    await emit(page, 'diorama:pop-out', { area: 'shelf', index: 1, songId: 'x-' + g, genre: g });
    await frames(page, 2);
    rects[g] = await ev(page, () => {
      const vol = document.querySelector('.gasa2d__vol[data-index="1"][data-area="shelf"]');
      const v = vol.getBoundingClientRect();
      const pieces = [...vol.querySelectorAll('.gasa2d__pop i')].map((i) => i.getBoundingClientRect());
      const u = pieces.reduce((o, r) => ({ l: Math.min(o.l, r.left), t: Math.min(o.t, r.top), r: Math.max(o.r, r.right), b: Math.max(o.b, r.bottom) }), { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
      return { n: pieces.length, w: u.r - u.l, h: u.b - u.t, top: u.t, bottom: u.b, vw: v.width, vh: v.height, vt: v.top, vb: v.bottom, state: vol.dataset.state };
    });
  }
  assert(GENRES.every((g) => rects[g].state === 'popped' && rects[g].n > 0), label + ': 삐져나온 노래가 그 자리에 보인다');
  assert(new Set(GENRES.map((g) => [rects[g].n, Math.round(rects[g].w), Math.round(rects[g].h), Math.round(rects[g].top)].join('/'))).size === GENRES.length, label + ': 삐져나온 모양이 갈래 다섯 모두 다르다');
  assert(rects.saseol.w > rects.saseol.vw * 2.5, label + ': 사설시조는 늘어난 중장이 칸 밖으로 길게 튀어나온다');
  assert(rects.hyangga.top < rects.hyangga.vt - 5, label + ': 향가는 탑이 칸 위로 솟는다');
  assert(rects.gasa.bottom > rects.gasa.vb + 5, label + ': 가사는 두루마리가 바닥까지 풀린다');
  assert(rects.goryeo.n === 4, label + ': 고려가요는 똑같은 연 넷이 고리로 이어진다');
  await ev(page, () => window.__t.world.setDeviceReduceMotion(false));
  await emit(page, 'diorama:shelf-bound', { area: 'shelf', songIds: ['myeonangjeongga', 'gwandong-byeolgok', 'gyuwonga'] });
  await frames(page, 2);
  const titles = await ev(page, () => [...document.querySelectorAll('.gasa2d__shelf--main .gasa2d__title')].map((t) => t.textContent));
  const bound = await ev(page, () => document.querySelector('.gasa2d__shelf--main').classList.contains('is-bound') && getComputedStyle(document.querySelector('.gasa2d__shelf--main .gasa2d__thread')).display !== 'none');
  assert(bound && titles.join(',') === '면앙정가,관동별곡,규원가', label + ': 묶이면 실로 묶이고 책등에 금박 제목이 나온다 ' + JSON.stringify(titles));

  // 바구니, 먹안개, 단청
  await emit(page, 'diorama:slot-set', { area: 'basket', index: 1, songId: 'obaengnyeon-doeupji', to: 'sijo' });
  await frames(page, 2);
  assert(await ev(page, () => document.querySelector('.gasa2d__roll[data-index="1"]').classList.contains('has-tag')), label + ': 바구니 노래에 행선지 표시가 붙는다');
  await emit(page, 'diorama:pop-out', { area: 'basket', index: 1, songId: 'obaengnyeon-doeupji', genre: 'sijo' });
  await frames(page, 2);
  assert(await ev(page, () => !!document.querySelector('.gasa2d__basket-pop[data-index="1"] .gasa2d__pop[data-genre="sijo"]') && !document.querySelector('.gasa2d__roll[data-index="1"]').classList.contains('has-tag')), label + ': 바구니에서 틀린 노래는 행선지 표시가 지워진 채 삐져나온다');
  assert(await ev(page, () => !document.querySelector('.gasa2d__fog').classList.contains('is-receded')), label + ': 처음에는 먹안개가 깔려 있다');
  await emit(page, 'diorama:fog-recede', {});
  assert(await ev(page, () => document.querySelector('.gasa2d__fog').classList.contains('is-receded')), label + ': 먹안개가 물러난다');
  await ev(page, () => window.__t.world.setDancheong('gasa', 1));
  const filter = await ev(page, () => getComputedStyle(document.querySelector('.board-art')).filter);
  assert(/grayscale\(0\)/.test(filter), label + ': 단청이 돌아오면 그림 판의 먹빛 필터가 풀린다 (' + filter + ')');
  await ev(page, () => window.__t.world.setDancheong('gasa', 0));
  const room = await ev(page, () => document.querySelector('.gasa2d__sign--room')?.textContent);
  assert(room === '「상춘곡」', label + ': 작품 방 문에 「상춘곡」 이름판이 있다');
  // 음성: 2D 모형도 모르는 사건을 조용히 넘긴다
  const unknown = await ev(page, () => {
    const box = document.createElement('div');
    const h = window.__t.gasa.create2D({ container: box, wing: { id: 'gasa', name: '가사관' }, assets: { texture: () => null, image: () => null }, restored: false, reduceMotion: () => false });
    const html = box.innerHTML;
    let threw = false;
    try { h.react('diorama:nothing', {}); h.react(null, null); h.update(0.016); } catch { threw = true; }
    const same = box.innerHTML === html;
    h.dispose();
    return { threw, same, left: box.childElementCount };
  });
  assert(!unknown.threw && unknown.same && unknown.left === 0, label + ': (음성) 모르는 사건은 오류 없이 넘기고, dispose가 그림을 치운다');
}

const server = await startServer();
const sessions = [];
let failed = false;

async function session(label, opts, body) {
  console.log('\n▶ ' + label);
  const game = await open(server, opts);
  sessions.push(game);
  try {
    await body(game.page);
    assert(game.external.length === 0, label + ': 바깥 주소 요청이 없다 ' + game.external.join(', '));
    assert(game.errors.length === 0, label + ': 콘솔 오류가 없다 ' + game.errors.join(' | '));
  } finally {
    await game.close();
  }
}

try {
  checkCorridorModel();
  for (const [key, vp] of Object.entries(SIZES)) {
    await session('3D ' + key + ' ' + vp.width + 'x' + vp.height, { viewport: vp }, (page) => check3D(page, '3D ' + key));
    await session('2D ' + key + ' ' + vp.width + 'x' + vp.height, { viewport: vp, disable3d: true }, (page) => check2D(page, '2D ' + key));
  }
} catch (e) {
  failed = true;
  console.error(e.stack || e.message);
} finally {
  for (const g of sessions) await g.close().catch(() => {});
  await server.close();
}
process.exitCode = failed ? 1 : 0;
