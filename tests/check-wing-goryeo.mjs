// 고려가요관 모형 점검(T8, spec 3.1·5.4·6·8·14·17).
// 3D와 2D(3D를 끈 브라우저), 1366×768과 844×390에서:
//  관 모형이 붙는지, README 8.1의 반응 사건이 모두 콘솔 오류 없이 처리되는지,
//  고유 동작 '후렴 고리 걸기'가 눈에 보이는 변화(고리·끈·등롱, 화면 그림)를 만드는지,
//  빈자리는 제목 없는 빈 책등인지, 삐져나옴이 갈래마다 다른지, 먹빛→단청, 먹안개, 그리기 호출 60회 이하,
//  자리(anchors)가 있고 2D 자리가 상황 버튼 구석을 피하는지, 바깥 요청이 없는지.
// 음성 사례: 모르는 사건·어긋난 detail은 아무것도 바꾸지 않고, 효과 없는 사건은 화면을 바꾸지 않으며,
//            검사 함수들이 구석 침범·예산 초과·빠진 자리를 잡는다.
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { L3, STANZA_ROOMS, MAX_LINKS } from '../js/world/wings/goryeo-state.js';

const PAGE = 'tests/pages/wing-goryeo.html';
const BUDGET = 60;
const REQUIRED = ['slots', 'bonus', 'basket', 'returnedShelf', 'roomDoor', 'entrance', 'nextDoor', 'songs'];

// README 8.1의 디오라마 반응 사건 전부(예시 detail)
const ALL_EVENTS = [
  ['diorama:fold', { unit: 1 }],
  ['diorama:pillar-light', { unit: 1, line: 0, foot: 2 }],
  ['diorama:floor-fill', { gu: 4 }],
  ['diorama:aa-door', { present: true, unit: 8 }],
  ['diorama:stair-step', { step: 1, total: 3 }],
  ['diorama:refrain-link', { from: { unit: 1, line: 3 }, to: { unit: 3, line: 3 } }],
  ['diorama:walk-step', { step: 2 }],
  ['diorama:unroll', { unit: 1, feet: 6 }],
  ['diorama:slot-set', { area: 'basket', index: 0, songId: 'dongjitdal', to: 'sijo' }],
  ['diorama:shelf-bound', { area: 'bonus', songIds: ['dongdong', 'sangjeoga', 'jeongeupsa'] }],
  ['diorama:pop-out', { area: 'basket', index: 0, songId: 'dongjitdal', genre: 'sijo' }],
  ['diorama:fog-recede', {}],
  ['diorama:dancheong-restore', {}],
];

// ── 검사 함수(음성 사례로 스스로 시험한다) ──
const withinBudget = (calls) => calls > 0 && calls <= BUDGET;

function cornerViolations(anchors) {
  const out = [];
  for (const [k, v] of Object.entries(anchors ?? {})) {
    for (const p of Array.isArray(v) ? v : [v]) {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      if (p.x > 78 && p.y > 78) out.push(k + ' 상황 버튼 구석 ' + p.x + ',' + p.y);
      if (p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) out.push(k + ' 그림 판 밖 ' + p.x + ',' + p.y);
    }
  }
  return out;
}

function missingAnchors(a) {
  const out = REQUIRED.filter((k) => !a?.[k]);
  if (a?.slots && a.slots.length !== 3) out.push('slots 수 ' + a.slots.length);
  if (a?.bonus && a.bonus.length !== 3) out.push('bonus 수 ' + a.bonus.length);
  if (a?.songs && a.songs.length < 1) out.push('songs 없음');
  return out;
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
function frames(page, n = 2) {
  return page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
}
const emit = (page, name, detail) => ev(page, ([n, d]) => window.__t.events.emit(n, d), [name, detail]);
const shot = async (page) => page.screenshot({ animations: 'disabled', caret: 'hide' });

// 지금 보이는 고리·끈·등롱 상태(3D는 그물 인스턴스, 2D는 SVG 요소)
async function linkProbe(page, mode) {
  if (mode === '3d') {
    return ev(page, () => {
      const t = window.__t;
      const cords = t.visibleInstances('goryeo-cords');
      const rings = t.visibleInstances('goryeo-rings');
      return { links: Math.round(cords.length / 14), cords, ringCount: rings.length };
    });
  }
  return ev(page, () => {
    const links = [...document.querySelectorAll('.goryeo-link')];
    return {
      links: links.length,
      pairs: links.map((l) => l.dataset.from + '-' + l.dataset.to),
      ringCount: document.querySelectorAll('.goryeo-ring').length,
      boxes: links.map((l) => { const b = l.querySelector('path').getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }),
      litGaps: [...document.querySelectorAll('.goryeo-lantern[data-lit="true"]')].map((n) => Number(n.dataset.gap)),
    };
  });
}

// ── 실행 ──
const server = await startServer();
let failed = false;

async function session(label, opts, body) {
  console.log('\n▶ ' + label);
  const game = await openGame(server.url, { path: PAGE, ...opts });
  try {
    await game.page.waitForFunction(() => window.__t?.ready === true, null, { timeout: 20000 });
    await ev(game.page, () => { window.__t.world.enterWing('goryeo'); window.__t.world.resetCamera(); });
    await frames(game.page, 4);
    await body(game);
    assert(game.external.length === 0, label + ': 바깥 주소 요청이 없다 ' + game.external.join(', '));
    assert(game.errors.length === 0, label + ': 콘솔 오류가 없다 ' + game.errors.join(' | '));
  } finally {
    await game.close();
  }
}

async function wingBody(game, label, mode, { animate = false } = {}) {
  const { page } = game;
  const vp = page.viewportSize();
  assert((await ev(page, () => window.__t.world.getMode())) === mode, label + ': ' + mode + '로 연다');
  assert((await ev(page, () => window.__t.world.getPlace())) === 'goryeo', label + ': 고려가요관에 들어가 있다');

  // 자리
  const anchors = await ev(page, () => window.__t.world.getAnchors());
  const miss = missingAnchors(anchors);
  assert(miss.length === 0, label + ': 자리(칸 셋, 덤 셋, 바구니, 돌아온 노래 선반, 작품 방 문, 입구, 다음 관 문, 떠다니는 노래)가 모두 있다 ' + JSON.stringify(miss));
  if (mode === '2d') {
    const corner = cornerViolations(anchors);
    assert(corner.length === 0, label + ': 2D 자리가 상황 버튼 구석(x>78%, y>78%)과 그림 판 밖을 피한다 ' + JSON.stringify(corner));
    const hs = await ev(page, () => document.querySelectorAll('.board-hotspot').length);
    assert(hs === 3 + 3 + 5 + anchors.songs.length, label + ': 자리마다 누를 수 있는 자리가 생긴다(' + hs + ')');
    const inBoard = await ev(page, () => {
      const b = document.querySelector('.board').getBoundingClientRect();
      return [...document.querySelectorAll('.board-hotspot')].every((h) => { const r = h.getBoundingClientRect(); return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1; });
    });
    assert(inBoard, label + ': 누를 수 있는 자리가 모두 그림 판 안에 있다');
  } else {
    const onScreen = await ev(page, ({ hooks }) => {
      const t = window.__t;
      const a = t.world.getAnchors();
      const root = t.world.getThree().root;
      const pts = [...a.slots, ...a.bonus, a.basket, a.roomDoor, a.returnedShelf, a.nextDoor,
        ...hooks.map((h) => ({ x: root.position.x + h.x, y: h.y, z: root.position.z + h.z }))];
      const r = document.querySelector('.world-canvas').getBoundingClientRect();
      return pts.filter((p) => { const s = t.world.toScreen(p); return !(s.x >= r.left && s.x <= r.right && s.y >= r.top && s.y <= r.bottom); }).length;
    }, { hooks: Array.from({ length: STANZA_ROOMS }, (_, i) => ({ x: L3.roomX(i), y: L3.hookY, z: L3.hookZ })) });
    assert(onScreen === 0, label + ': 연 방 고리 걸이와 칸·덤·바구니·작품 방 문이 첫 화면 안에 보인다 (밖: ' + onScreen + ')');
    const s0 = await ev(page, () => window.__t.world.getStats());
    console.log('  · ' + label + ' 처음 그리기 호출: ' + s0.drawCalls + '회');
    assert(withinBudget(s0.drawCalls), label + ': 처음 그리기 호출이 ' + BUDGET + '회 이하 (' + s0.drawCalls + ')');
  }

  // 똑같은 연 방이 줄지어 있다
  const rooms = mode === '2d'
    ? await ev(page, () => [...document.querySelectorAll('.goryeo-room')].map((g) => g.innerHTML.replace(/data-room="\d+"/g, '').replace(/\d+(\.\d+)?/g, 'N')))
    : null;
  if (rooms) assert(rooms.length === STANZA_ROOMS && rooms.every((r) => r === rooms[0]), label + ': 똑같이 생긴 연 방 ' + STANZA_ROOMS + '칸이 줄지어 있다');
  else {
    const n = await ev(page, () => window.__t.mesh('goryeo-static').count);
    assert(n > STANZA_ROOMS * 12, label + ': 연 방들을 고정 상자 하나(InstancedMesh)로 그린다 (' + n + '개)');
  }

  // 빈자리는 제목 없는 빈 책등
  if (mode === '2d') {
    const empty = await ev(page, () => ({ empty: document.querySelectorAll('.goryeo-spine[data-state="empty"]').length, titles: document.querySelectorAll('.goryeo-title').length }));
    assert(empty.empty === 6 && empty.titles === 0, label + ': 칸·덤 빈자리 여섯이 제목 없는 빈 책등이다 ' + JSON.stringify(empty));
  } else {
    const e = await ev(page, () => ({ titles: !!window.__t.mesh('goryeo-titles-shelf'), dyn: window.__t.mesh('goryeo-dynamic').count }));
    assert(!e.titles && e.dyn >= 6, label + ': 빈자리는 제목판 없이 빈 책등만 있다 ' + JSON.stringify(e));
  }

  // 움직임이 있을 때 끈이 자라며 이어진다(3D 크롬북에서만)
  if (animate) {
    // 사건을 내고 바로 다음 프레임에 본다(왕복 지연 동안 프레임이 흘러가지 않게 한 번에).
    const growing = await ev(page, () => new Promise((res) => {
      window.__t.events.emit('diorama:refrain-link', { from: { unit: 4, line: 0 }, to: { unit: 5, line: 0 } });
      requestAnimationFrame(() => res(window.__t.visibleInstances('goryeo-cords').length));
    }));
    await page.waitForTimeout(900);
    await frames(page, 2);
    const grown = await linkProbe(page, mode);
    assert(growing < 14 && grown.cords.length === 14, label + ': 움직임이 켜져 있으면 끈이 한 방에서 다른 방으로 자라며 이어진다 (' + growing + '→' + grown.cords.length + ')');
    await emit(page, 'diorama:slot-set', { area: 'shelf', index: 0, songId: null });   // 재기 흔적을 걷는다
    await frames(page, 2);
    assert((await linkProbe(page, mode)).links === 0, label + ': 노래를 꽂거나 빼면 재기 흔적(고리)이 걷힌다');
  }

  // 여기부터는 움직임 줄이기(잘라 바뀜)로 화면 그림을 견준다.
  await ev(page, () => window.__t.world.setDeviceReduceMotion(true));
  await frames(page, 4);

  // (음성) 효과 없는 사건은 화면을 바꾸지 않는다 → 화면 견주기가 '바뀜'만 말하는 게 아님을 확인
  const a0 = await shot(page);
  await emit(page, 'diorama:stair-step', { step: 1, total: 3 });
  await frames(page, 3);
  const a1 = await shot(page);
  assert(a0.equals(a1), label + ': (음성) 이 관과 상관없는 사건(계단 오르기)은 화면을 바꾸지 않는다');

  // (음성) 모르는 사건, 어긋난 detail
  const before = await linkProbe(page, mode);
  await emit(page, 'diorama:nothing', { from: { unit: 0 }, to: { unit: 1 } });
  await emit(page, 'diorama:refrain-link', { from: { unit: 1 } });
  await emit(page, 'diorama:refrain-link', null);
  await emit(page, 'diorama:refrain-link', { from: { unit: -1 }, to: { unit: 'x' } });
  await emit(page, 'diorama:slot-set', { area: 'roof', index: 9, songId: 'gasiri' });
  await emit(page, 'diorama:pop-out', {});
  await frames(page, 2);
  const after = await linkProbe(page, mode);
  assert(after.links === before.links && after.links === 0, label + ': (음성) 모르는 사건과 어긋난 detail은 조용히 넘기고 고리를 만들지 않는다');
  assert(game.errors.length === 0, label + ': 어긋난 사건에도 콘솔 오류가 없다 ' + game.errors.join(' | '));

  // 고유 동작: 후렴 고리 걸기 — 0연과 2연의 후렴을 잇는다
  const b0 = await shot(page);
  await emit(page, 'diorama:refrain-link', { from: { unit: 0, line: 3 }, to: { unit: 2, line: 3 } });
  await frames(page, 3);
  const b1 = await shot(page);
  assert(!b0.equals(b1), label + ': 후렴 고리를 걸면 화면 그림이 바뀐다');
  const link = await linkProbe(page, mode);
  assert(link.links === 1 && link.ringCount >= 2, label + ': 고리 하나와 양 끝 고리 둘이 생긴다 ' + JSON.stringify({ links: link.links, rings: link.ringCount }));
  if (mode === '3d') {
    const xs = link.cords.map((c) => c.x);
    const ys = link.cords.map((c) => c.y);
    const zs = link.cords.map((c) => c.z);
    const spanOk = Math.min(...xs) < L3.roomX(0) + 0.3 && Math.max(...xs) > L3.roomX(2) - 0.3;
    const sagOk = Math.min(...ys) < L3.hookY - 0.25;
    const corridorOk = zs.every((z) => z >= L3.room.zFront - 0.1 && z <= L3.corridor.z1 + 0.1) && Math.max(...zs) > L3.hookZ + 0.3;
    assert(spanOk && sagOk && corridorOk, label + ': 끈이 0연 방에서 2연 방까지 복도 쪽으로 처지며 이어진다 ' + JSON.stringify({ spanOk, sagOk, corridorOk }));
    const lamp = await ev(page, ({ beads }) => ({ g0: window.__t.colorAt('goryeo-lamps', beads + 0), g3: window.__t.colorAt('goryeo-lamps', beads + 3) }), { beads: STANZA_ROOMS * 3 });
    assert(lamp.g0[0] > lamp.g3[0] + 0.1, label + ': 끈이 지나는 복도 등롱에 불이 들어온다');
  } else {
    const box = link.boxes[0];
    const x0 = 130;
    const x2 = 130 + 2 * 165;
    assert(link.pairs[0] === '0-2' && Math.abs(box.x - x0) < 2 && Math.abs(box.x + box.w - x2) < 2 && box.y + box.h > 345, label + ': 끈이 0연 방 고리에서 2연 방 고리까지 복도로 처지며 이어진다 ' + JSON.stringify(box));
    assert(link.litGaps.includes(0) && link.litGaps.includes(1) && !link.litGaps.includes(3), label + ': 끈이 지나는 복도 등롱에만 불이 들어온다 ' + JSON.stringify(link.litGaps));
  }
  // 같은 연 안의 후렴, 많은 고리(상한)
  await emit(page, 'diorama:refrain-link', { from: { unit: 1, line: 0 }, to: { unit: 1, line: 2 } });
  for (let i = 0; i < MAX_LINKS + 3; i++) await emit(page, 'diorama:refrain-link', { from: { unit: i, line: 1 }, to: { unit: i + 1, line: 1 } });
  await frames(page, 3);
  const many = await linkProbe(page, mode);
  assert(many.links === MAX_LINKS, label + ': 고리가 많아지면 ' + MAX_LINKS + '개까지만 남긴다 (' + many.links + ')');

  // 모든 반응 사건이 오류 없이 처리된다
  for (const [name, detail] of ALL_EVENTS) await emit(page, name, detail);
  await frames(page, 3);
  assert(game.errors.length === 0, label + ': README 8.1의 반응 사건 ' + ALL_EVENTS.length + '가지를 오류 없이 처리한다 ' + game.errors.join(' | '));

  // 두드리기 등불, 접기 경계
  await emit(page, 'diorama:pillar-light', { unit: 2, line: 0, foot: 1 });
  await emit(page, 'diorama:fold', { unit: 3 });
  await frames(page, 2);
  if (mode === '2d') {
    const lamp = await ev(page, () => ({ bead: document.querySelector('.goryeo-bead[data-room="2"][data-foot="1"]').dataset.lit, seam: document.querySelector('.goryeo-seam[data-room="3"]').getAttribute('visibility') }));
    assert(lamp.bead === 'true' && lamp.seam === 'visible', label + ': 두드리면 그 연 방 음보 구슬에, 접으면 그 경계에 불이 들어온다 ' + JSON.stringify(lamp));
  } else {
    const lamp = await ev(page, ({ i, j }) => ({ on: window.__t.colorAt('goryeo-lamps', i), off: window.__t.colorAt('goryeo-lamps', j) }), { i: 2 * 3 + 1, j: 4 * 3 + 1 });
    assert(lamp.on[0] > lamp.off[0] + 0.1, label + ': 두드리면 그 연 방 음보 구슬에 불이 들어온다');
  }

  // 칸에 꽂기 → 삐져나옴(갈래마다 다른 모양) → 빈자리로 돌아감 → 묶기(실, 금박, 제목)
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 0, songId: 'chang-naegoja' });
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 1, songId: 'dongjitdal' });
  await emit(page, 'diorama:slot-set', { area: 'shelf', index: 2, songId: 'gasiri' });
  await frames(page, 2);
  if (mode === '2d') {
    const f = await ev(page, () => ({ filled: document.querySelectorAll('.goryeo-spine[data-area="shelf"][data-state="filled"]').length, titles: document.querySelectorAll('.goryeo-title').length }));
    assert(f.filled === 3 && !(await ev(page, () => [...document.querySelectorAll('.goryeo-title')].some((t) => t.closest('[data-area="shelf"]')))), label + ': 꽂힌 노래도 묶이기 전에는 제목이 없다 ' + JSON.stringify(f));
  }
  await emit(page, 'diorama:pop-out', { area: 'shelf', index: 0, songId: 'chang-naegoja', genre: 'saseol' });
  await emit(page, 'diorama:pop-out', { area: 'shelf', index: 1, songId: 'dongjitdal', genre: 'sijo' });
  await frames(page, 2);
  if (mode === '2d') {
    const p = await ev(page, () => {
      const box = (sel) => { const b = document.querySelector(sel).getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const mid = document.querySelector('.goryeo-pop[data-area="shelf"][data-genre="saseol"] [data-part="middle"]').getBBox();
      const top = document.querySelector('.goryeo-pop[data-area="shelf"][data-genre="saseol"] rect').getBBox();
      return { saseol: box('.goryeo-pop[data-area="shelf"][data-genre="saseol"]'), sijo: box('.goryeo-pop[data-area="shelf"][data-genre="sijo"]'), midW: mid.width, topW: top.width };
    });
    assert(p.midW > p.topW * 3 && p.saseol.w > 110, label + ': 사설시조는 가운데 장만 늘어나 칸 밖으로 삐져나온다 ' + JSON.stringify(p.saseol));
    assert(p.sijo.y < 500 && p.sijo.w < p.saseol.w, label + ': 시조는 다른 모양(짧은 세 장이 위로 빠짐)으로 삐져나온다 ' + JSON.stringify(p.sijo));
  } else {
    const p = await ev(page, ({ x0, x1 }) => {
      const list = window.__t.visibleInstances('goryeo-dynamic');
      const near = (x) => list.filter((b) => Math.abs(b.x - x) < 0.3 && b.y > 0.2 && b.y < 2);
      const front = (arr) => Math.max(...arr.map((b) => b.z + b.sz / 2));
      const a = near(x0);
      const b = near(x1);
      return { saseolFront: front(a), sijoFront: front(b), saseolLong: Math.max(...a.map((p) => p.sz)), saseolShort: Math.min(...a.map((p) => p.sz)) };
    }, { x0: -1, x1: 0 });
    assert(p.saseolLong > p.saseolShort * 3 && p.saseolFront > p.sijoFront + 0.4, label + ': 사설시조는 가운데 장만 칸 밖으로 길게 튀어나오고 시조와 모양이 다르다 ' + JSON.stringify(p));
  }
  await page.waitForTimeout(2600);
  await frames(page, 2);
  if (mode === '2d') {
    const s = await ev(page, () => [...document.querySelectorAll('.goryeo-spine[data-area="shelf"]')].map((n) => n.dataset.state));
    assert(s.join() === 'empty,empty,filled' && (await ev(page, () => document.querySelectorAll('.goryeo-pop').length)) === 0, label + ': 삐져나온 노래는 손으로 돌아가고 그 자리는 빈 책등이 된다 ' + s.join());
  }
  await emit(page, 'diorama:shelf-bound', { area: 'shelf', songIds: ['cheongsan-byeolgok', 'seogyeong-byeolgok', 'gasiri'] });
  await frames(page, 3);
  if (mode === '2d') {
    const b = await ev(page, () => ({
      titles: [...document.querySelectorAll('.goryeo-bound[data-area="shelf"] .goryeo-title')].map((t) => t.textContent),
      gold: document.querySelectorAll('.goryeo-bound[data-area="shelf"] .goryeo-gold').length,
      open: document.querySelector('.goryeo-room-door').dataset.open,
    }));
    assert(b.titles.join() === '청산별곡,서경별곡,가시리' && b.gold === 3, label + ': 칸이 묶이면 실로 묶이고 금박과 제목이 나타난다 ' + JSON.stringify(b));
    assert(b.open === 'true', label + ': 칸이 묶이면 작품 방 「정석가」 문이 열린다');
  } else {
    const t = await ev(page, () => ({ shelf: !!window.__t.mesh('goryeo-titles-shelf')?.visible, bonus: !!window.__t.mesh('goryeo-titles-bonus')?.visible }));
    assert(t.shelf && t.bonus, label + ': 칸·덤이 묶이면 제목판이 나타난다 ' + JSON.stringify(t));
  }
  const plaque = mode === '2d' ? await ev(page, () => document.querySelector('.goryeo-room-door text').textContent) : await ev(page, () => !!window.__t.mesh('goryeo-plaque'));
  assert(plaque === '「정석가」' || plaque === true, label + ': 작품 방 문에 「정석가」 현판이 있다');

  // 먹안개(위 사건 묶음에서 이미 걷혔다)
  const fogGone = mode === '2d'
    ? await ev(page, () => document.querySelector('.goryeo-fog').getAttribute('visibility') === 'hidden')
    : await ev(page, () => window.__t.mesh('goryeo-fog').visible === false);
  assert(fogGone, label + ': 먹안개가 물러난다');

  // 먹빛 → 단청
  const readDoor = () => (mode === '2d'
    ? ev(page, () => { const h = document.querySelector('[data-part="room-door"]').getAttribute('fill'); const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; })
    : ev(page, () => window.__t.colorAt('goryeo-static', window.__t.mesh('goryeo-static').userData.tags.roomDoorPost)));
  await ev(page, () => window.__t.world.setDancheong('goryeo', 0));
  await frames(page, 2);
  const ink = await readDoor();
  await ev(page, () => window.__t.world.setDancheong('goryeo', 1));
  await frames(page, 2);
  const dan = await readDoor();
  const sat = (c) => Math.max(...c) - Math.min(...c);
  assert(sat(ink) < 0.05 && sat(dan) > 0.3 && dan[0] > dan[1], label + ': 작품 방 문기둥이 먹빛에서 주홍으로 돌아온다 ' + JSON.stringify({ ink: ink.map((v) => +v.toFixed(2)), dan: dan.map((v) => +v.toFixed(2)) }));

  if (mode === '3d') {
    const s = await ev(page, () => window.__t.world.getStats());
    console.log('  · ' + label + ' 모든 반응 뒤 그리기 호출: ' + s.drawCalls + '회, 삼각형 ' + s.triangles);
    assert(withinBudget(s.drawCalls), label + ': 모든 반응 뒤에도 그리기 호출이 ' + BUDGET + '회 이하 (' + s.drawCalls + ')');
    assert(s.shadows === false, label + ': 실시간 그림자를 쓰지 않는다');
  }

  // 치우고 다시 들어가기(단청이 돌아온 관 → 먹안개 없이 시작)
  await ev(page, () => window.__t.world.enterCorridor());
  await frames(page, 2);
  const gone = mode === '2d' ? await ev(page, () => !document.querySelector('.goryeo-board')) : await ev(page, () => !window.__t.world.getThree().scene.getObjectByName('goryeo-wing'));
  assert(gone, label + ': 회랑으로 나가면 관 모형을 모두 치운다');
  await ev(page, () => window.__t.world.enterWing('goryeo'));
  await frames(page, 3);
  const fogAgain = mode === '2d'
    ? await ev(page, () => document.querySelector('.goryeo-fog').getAttribute('visibility'))
    : await ev(page, () => String(window.__t.mesh('goryeo-fog').visible));
  assert(fogAgain === 'hidden' || fogAgain === 'false', label + ': 단청이 돌아온 관에 다시 들어오면 먹안개 없이 시작한다');
  await ev(page, () => window.__t.world.setDancheong('goryeo', 0));
  console.log('  · ' + label + ' 화면 ' + vp.width + 'x' + vp.height);
}

try {
  // 검사 함수 음성 사례
  assert(!withinBudget(BUDGET + 1) && !withinBudget(0) && withinBudget(12), '(음성) 그리기 호출 검사가 초과와 0을 잡는다');
  assert(cornerViolations({ basket: { x: 90, y: 90 } }).length === 1 && cornerViolations({ basket: { x: 90, y: 50 } }).length === 0, '(음성) 구석 검사가 상황 버튼 구석의 자리를 잡는다');
  assert(cornerViolations({ songs: [{ x: 50, y: 120 }] }).length === 1, '(음성) 구석 검사가 그림 판 밖 자리를 잡는다');
  assert(missingAnchors({ slots: [1, 2], bonus: [1, 2, 3] }).length > 0, '(음성) 자리 검사가 빠진 자리와 모자란 칸을 잡는다');

  await session('3D 크롬북 1366x768', { viewport: VIEWPORTS.chromebook }, (g) => wingBody(g, '3D 크롬북', '3d', { animate: true }));
  await session('3D 휴대폰 844x390', { viewport: VIEWPORTS.phone }, (g) => wingBody(g, '3D 휴대폰', '3d'));
  await session('2D 크롬북 1366x768', { viewport: VIEWPORTS.chromebook, disable3d: true }, (g) => wingBody(g, '2D 크롬북', '2d'));
  await session('2D 휴대폰 844x390', { viewport: VIEWPORTS.phone, disable3d: true }, (g) => wingBody(g, '2D 휴대폰', '2d'));
} catch (e) {
  failed = true;
  console.error(e.stack || e.message);
} finally {
  await server.close();
}
process.exitCode = failed ? 1 : 0;
