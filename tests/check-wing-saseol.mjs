// 사설시조관 모형 점검(T11, spec 3.1·5.4·6·8·14·17).
// 3D와 3D를 끈 2D 그림 판에서, 크롬북(1366×768)과 휴대폰 가로(844×390) 화면으로:
//   모형이 끼워지는지, 자리(칸 셋·덤 셋·바구니·돌아온 노래 선반·작품 방 문·입구·다음 관 문)가 있고 화면 안·구석 밖에 있는지,
//   README 8.1의 diorama:* 사건을 모두 오류 없이 받는지, '연타로 풀기'로 두루마리가 늘어난 층을 따라 길게 풀리는지,
//   삐져나옴이 갈래 모양대로 다른지, 먹안개·제본·단청 반응, 그리기 호출 60회 이하, 바깥 요청 없음.
// 음성 사례: 모르는 사건·망가진 detail은 조용히 넘기는지, 그리기 호출 초과와 구석 자리를 점검이 잡는지.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { anchorProblems2D, createModel, popShape, unrollReach } from '../js/world/wings/saseol-model.js';

const PAGE = 'tests/pages/wing-saseol.html';
const BUDGET = 60;
const here = fileURLToPath(new URL('./', import.meta.url));
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });

// README 8.1 표에 적힌 디오라마 사건 이름(문서가 기준이다)
const readme = fs.readFileSync(new URL('../js/data/README.md', import.meta.url), 'utf8');
const sec = readme.slice(readme.indexOf('### 8.1'), readme.indexOf('### 8.2'));
const EVENTS = [...new Set([...sec.matchAll(/`(diorama:[a-z-]+)`/g)].map((m) => m[1]))];

const SAMPLE = {
  'diorama:fold': { unit: 1 },
  'diorama:pillar-light': { unit: 1, foot: 2 },
  'diorama:floor-fill': { gu: 5 },
  'diorama:aa-door': { present: false, unit: null },
  'diorama:stair-step': { step: 2, total: 3 },
  'diorama:refrain-link': { from: { unit: 0, line: 1 }, to: { unit: 1, line: 1 } },
  'diorama:walk-step': { step: 3 },
  'diorama:unroll': { unit: 1, feet: 9 },
  'diorama:slot-set': { area: 'shelf', index: 0, songId: 'namodo-bahi' },
  'diorama:shelf-bound': { area: 'shelf', songIds: ['namodo-bahi', 'daekdeul-dongnanji', 'chang-naegoja'] },
  'diorama:pop-out': { area: 'bonus', index: 1, songId: 'dongjitdal', genre: 'sijo' },
  'diorama:fog-recede': {},
  'diorama:dancheong-restore': {},
};

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const withinBudget = (calls) => calls > 0 && calls <= BUDGET;

function frames(page, n = 2) {
  return page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
}

// ── 1. 상태 계산(Node) ──
function checkModel() {
  assert(EVENTS.length >= 13 && EVENTS.includes('diorama:unroll') && EVENTS.includes('diorama:pop-out'), 'README 8.1에서 디오라마 사건 ' + EVENTS.length + '개를 읽는다');
  const r4 = unrollReach(4);
  const r9 = unrollReach(9);
  const r36 = unrollReach(36);
  assert(r4.within === 1 && r4.beyond === 0, '네 음보까지는 정자 안에서 풀리고 늘어난 층으로 나가지 않는다');
  assert(r9.beyond > 0 && r36.beyond > r9.beyond && r36.beyond < 1, '네 음보를 넘으면 늘어난 층을 따라 더 멀리 풀린다(36음보 ' + r36.beyond.toFixed(2) + ')');
  const sa = popShape('saseol');
  const sj = popShape('sijo');
  assert(sa.length === 3 && sa[1].d > sa[0].d && sa[1].d > sa[2].d, '사설시조를 잘못 꽂으면 중장 마디가 길게 튀어나온다');
  assert(sj.length === 3 && sj.every((s) => s.d === sj[0].d), '시조는 세 마디가 고르게 튀어나온다');
  assert(popShape('gasa').length > 4 && popShape('goryeo').some((s) => s.ring) && popShape('hyangga').length === 3, '가사·고려가요·향가도 저마다 모양이 다르다');
  const m = createModel();
  for (const name of EVENTS) assert(m.apply(name, SAMPLE[name]) === true, '상태가 ' + name + ' 사건을 받는다');
  const v = m.state.version;
  // 음성 사례: 모르는 사건, 망가진 detail
  const bad = [['diorama:nope', {}], ['diorama:slot-set', { area: 'roof', index: 0 }], ['diorama:slot-set', { area: 'shelf', index: 7 }],
    ['diorama:pop-out', null], ['diorama:pillar-light', { unit: -1, foot: 0 }], ['diorama:fold', 'x'], ['', undefined]];
  for (const [n, d] of bad) m.apply(n, d);
  assert(m.state.version === v, '(음성) 모르는 사건과 망가진 detail은 상태를 바꾸지 않고 조용히 넘긴다');
  assert(anchorProblems2D({ basket: { x: 85, y: 85 } }).some((p) => p.includes('구석')), '(음성) 상황 버튼 구석의 2D 자리를 잡아낸다');
  assert(anchorProblems2D({ roomDoor: { x: 50, y: 20 } }).some((p) => p.includes('띠')), '(음성) 걷는 띠 밖의 2D 자리를 잡아낸다');
}

// ── 2. 화면 ──
async function open(server, opts) {
  const game = await openGame(server.url, { path: PAGE, ...opts });
  await game.page.waitForFunction(() => window.__t?.ready === true, null, { timeout: 20000 });
  await frames(game.page, 4);
  return game;
}

// 두루마리 상태: 3D는 메시 userData, 2D는 SVG 속성
function scrollState() {
  const t = window.__t;
  if (t.world.getMode() === '3d') {
    const s = t.world.getThree().root.getObjectByName('saseol-scroll');
    return { feet: s.userData.feet, length: s.userData.length, endX: s.userData.endX, visible: s.visible };
  }
  const svg = document.querySelector('svg.saseol2d');
  const poly = svg.querySelector('.saseol2d-scroll');
  const g = svg.querySelector('.saseol2d-scroll-group');
  return { feet: Number(svg.dataset.feet), length: Number(poly.dataset.length), endX: Number(poly.dataset.endX), visible: g.getAttribute('visibility') !== 'hidden', width: poly.getBoundingClientRect().width };
}

async function unrollTo(page, feet) {
  await ev(page, (f) => window.__t.events.emit('diorama:unroll', { unit: 1, feet: f }), feet);
  await page.waitForFunction((f) => {
    const t = window.__t;
    if (t.world.getMode() === '3d') return t.world.getThree().root.getObjectByName('saseol-scroll').userData.feet === f;
    return Number(document.querySelector('svg.saseol2d').dataset.feet) === f;
  }, feet, { timeout: 8000 });
  return ev(page, scrollState);
}

async function checkSession(server, label, opts) {
  const game = await open(server, opts);
  const { page } = game;
  try {
    const want = opts.disable3d ? '2d' : '3d';
    assert((await ev(page, () => window.__t.world.getMode())) === want, label + ': ' + want + ' 모드로 열린다');
    assert((await ev(page, () => window.__t.world.getPlace())) === 'saseol' && (await ev(page, () => !!window.__t.handle())), label + ': 사설시조관 모형이 끼워진다');

    // 자리
    const a = await ev(page, () => window.__t.world.getAnchors());
    assert(a?.slots?.length === 3 && a?.bonus?.length === 3, label + ': 칸 자리 셋, 덤 자리 셋이 있다');
    for (const k of ['basket', 'returnedShelf', 'roomDoor', 'entrance', 'nextDoor']) assert(a[k] && typeof a[k].x === 'number', label + ': 자리 ' + k + '가 있다');
    const spots = await ev(page, () => Object.keys(window.__t.handle().spots ?? {}));
    assert(spots.includes('floatingSongs') && spots.includes('measureFocus'), label + ': 떠도는 노래 자리와 재기 초점 자리를 알려 준다');
    const vp = page.viewportSize();
    if (want === '2d') {
      const probs = await ev(page, () => window.__t.anchorProblems2D(window.__t.world.getAnchors()));
      assert(probs.length === 0, label + ': 2D 자리가 모두 걷는 띠 안, 상황 버튼 구석 밖이다 ' + JSON.stringify(probs));
      const blank = await ev(page, () => ({ empty: document.querySelectorAll('.saseol2d-book[data-state="empty"]').length, titles: document.querySelectorAll('.saseol2d-title').length }));
      assert(blank.empty === 6 && blank.titles === 0, label + ': 칸과 덤 칸의 빈자리는 제목 없는 빈 책등 여섯으로 보인다');
      const n = await ev(page, () => document.querySelectorAll('.board-hotspot').length);
      assert(n === 11, label + ': 2D 자리마다 누를 수 있는 자리가 생긴다 (' + n + ')');
    } else {
      const cam = await ev(page, () => window.__t.handle().anchors.camera);
      assert(cam?.position && cam?.target, label + ': 3D 카메라 자리가 있다');
      await ev(page, () => window.__t.world.resetCamera());
      await frames(page, 2);
      const off = await ev(page, (vp) => {
        const out = [];
        for (const [k, v] of Object.entries(window.__t.world.getAnchors())) {
          (Array.isArray(v) ? v : [v]).forEach((p, i) => {
            const s = window.__t.world.toScreen(p);
            if (s.x < 0 || s.x > vp.width || s.y < 0 || s.y > vp.height) out.push(k + i + ' ' + Math.round(s.x) + ',' + Math.round(s.y));
          });
        }
        return out;
      }, vp);
      assert(off.length === 0, label + ': 들어선 화면에서 3D 자리가 모두 화면 안에 보인다 ' + JSON.stringify(off));
    }
    await page.screenshot({ path: path.join(shots, `wing-saseol-${want}-${vp.width}x${vp.height}-ink.png`) });

    // 고유 동작: 연타로 풀기
    const s0 = await unrollTo(page, 0);
    assert(!s0.visible, label + ': 풀기 전에는 두루마리가 감겨 있다');
    const s4 = await unrollTo(page, 4);
    const s12 = await unrollTo(page, 12);
    const s36 = await unrollTo(page, 36);
    assert(s4.visible && s4.length > 0, label + ': 네 음보를 풀면 두루마리가 정자 안에서 펼쳐진다 (' + s4.length.toFixed(2) + ')');
    assert(s12.length > s4.length * 1.5 && s36.length > s12.length, label + ': 음보가 늘수록 늘어난 층을 따라 더 길게 풀린다 (' + [s4, s12, s36].map((s) => s.length.toFixed(1)).join(' → ') + ')');
    const beyondWall = want === '3d' ? s36.endX > 6.45 : s36.endX > 1318;
    assert(beyondWall, label + ': 긴 중장(36음보)은 관 벽을 넘어 장터 쪽까지 풀린다 (끝 ' + s36.endX.toFixed(1) + ')');
    if (want === '2d') assert(s36.width > s4.width * 3, label + ': 2D에서도 풀린 두루마리의 화면 너비가 실제로 늘어난다 (' + Math.round(s4.width) + 'px → ' + Math.round(s36.width) + 'px)');
    await page.screenshot({ path: path.join(shots, `wing-saseol-${want}-${vp.width}x${vp.height}-unroll.png`) });

    // README의 사건 전부 + 관찰할 수 있는 반응
    for (const name of EVENTS) await ev(page, ([n, d]) => window.__t.events.emit(n, d), [name, SAMPLE[name]]);
    await ev(page, () => {
      const e = window.__t.events;
      e.emit('diorama:slot-set', { area: 'bonus', index: 0, songId: 'gwitturami' });
      e.emit('diorama:slot-set', { area: 'basket', index: 0, songId: 'nuhangsa', to: 'gasa' });
      e.emit('diorama:slot-set', { area: 'basket', index: 1, songId: 'eojeo-nae-iriyeo', to: 'gasa' });
      e.emit('diorama:pop-out', { area: 'basket', index: 1, songId: 'eojeo-nae-iriyeo', genre: 'sijo' });
      e.emit('diorama:pop-out', { area: 'bonus', index: 2, songId: 'chang-naegoja', genre: 'saseol' });
      e.emit('diorama:pop-out', { area: 'bonus', index: 1, songId: 'gyuwonga', genre: 'gasa' });
      e.emit('diorama:pillar-light', { unit: 0, foot: 0 });
      e.emit('diorama:pillar-light', { unit: 0, foot: 1 });
    });
    await page.waitForTimeout(1800);   // 삐져나옴·먹안개·단청 움직임이 끝나도록
    await frames(page, 3);
    const obs = await ev(page, () => {
      const t = window.__t;
      if (t.world.getMode() === '3d') {
        const root = t.world.getThree().root;
        const pops = root.getObjectByName('saseol-popout').userData.active;
        const lan = root.getObjectByName('saseol-lanterns');
        const c = [0, 1, 2].map((i) => { const col = new (t.world.getThree().THREE.Color)(); lan.getColorAt(i, col); return col.r + col.g + col.b; });
        return { pops, litDiff: c[0] !== c[2] && c[1] !== c[2], fogGone: !root.getObjectByName('saseol-fog').visible };
      }
      const pops = [...document.querySelectorAll('.saseol2d-pop')].map((g) => ({ area: g.dataset.area, index: +g.dataset.index, genre: g.dataset.genre, depths: g.dataset.widths.split(',').map(Number) }));
      const lit = [...document.querySelectorAll('.saseol2d-lantern')].map((c) => c.dataset.lit);
      return {
        pops, litDiff: lit[0] === '1' && lit[1] === '1' && lit[2] === '0',
        fogGone: document.querySelector('.saseol2d-fog').getAttribute('visibility') === 'hidden',
        titles: document.querySelectorAll('.saseol2d-title').length,
        gold: document.querySelectorAll('.saseol2d-gold').length,
        tag: [...document.querySelectorAll('.saseol2d-books text')].some((t) => t.textContent === '가사관'),
      };
    });
    assert(obs.litDiff, label + ': 두드리기 박마다 정자 기둥 등불이 켜진다(새 노래 첫 박이면 앞 불은 꺼진다)');
    assert(obs.fogGone, label + ': 먹안개가 물러난다');
    const pop = (area, index) => obs.pops.find((p) => p.area === area && p.index === index);
    const pSa = pop('bonus', 2);
    const pSj = pop('basket', 1);
    const pGa = pop('bonus', 1);
    assert(pSa && pSa.depths[1] > pSa.depths[0] * 1.5 && pSa.depths[1] > pSa.depths[2] * 1.5, label + ': 사설시조가 삐져나오면 중장 마디가 길게 튀어나온다 ' + JSON.stringify(pSa?.depths));
    assert(pSj && pSj.depths.length === 3 && pSj.depths.every((d) => d === pSj.depths[0]), label + ': 시조가 삐져나오면 세 마디가 고르다 ' + JSON.stringify(pSj?.depths));
    assert(pGa && pGa.depths.length > 4, label + ': 가사가 삐져나오면 마디가 줄줄이 이어진다 (' + pGa?.depths.length + ')');
    assert(obs.pops.length === 3, label + ': 같은 자리에 새로 꽂거나 새로 삐져나오면 앞 삐져나옴은 치워진다 (' + obs.pops.length + ')');
    if (want === '2d') {
      assert(obs.titles > 0 && obs.gold === 1, label + ': 칸이 묶이면 금박이 찍히고 책등에 제목이 나타난다');
      assert(obs.tag, label + ': 바구니 노래에 행선지 표시가 붙는다');
    }

    if (want === '3d') {
      // 단청: 먹빛과 단청색이 다르다
      // 채도 있는 상자 수(불 켜진 계단처럼 반응으로 빛나는 것 몇 개만 먹빛에서도 색이 있다)
      const col = () => ev(page, () => {
        const m = window.__t.world.getThree().root.getObjectByName('saseol-static');
        const c = new (window.__t.world.getThree().THREE.Color)();
        let n = 0;
        for (let i = 0; i < m.count; i++) { m.getColorAt(i, c); if (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 0.15) n++; }
        return n;
      });
      await ev(page, () => window.__t.world.setDancheong('saseol', 0));
      await frames(page, 2);
      const ink = await col();
      await ev(page, () => window.__t.world.setDancheong('saseol', 1));
      await frames(page, 2);
      const dan = await col();
      assert(ink <= 3 && dan >= 20, label + ': 먹빛(색 있는 상자 ' + ink + '개)에서 단청색(' + dan + '개)으로 돌아온다');
      const s = await ev(page, () => window.__t.world.getStats());
      console.log('  · ' + label + ' 사설시조관 그리기 호출: ' + s.drawCalls + '회, 삼각형 ' + s.triangles);
      assert(withinBudget(s.drawCalls), label + ': 반응이 모두 켜진 상태에서도 그리기 호출이 ' + BUDGET + '회 이하다 (' + s.drawCalls + ')');
      assert(s.shadows === false, label + ': 실시간 그림자를 쓰지 않는다');
    } else {
      await ev(page, () => window.__t.world.setDancheong('saseol', 1));
      await frames(page, 2);
      const lv = await ev(page, () => getComputedStyle(document.querySelector('.board')).getPropertyValue('--dancheong').trim());
      assert(lv === '1', label + ': 2D 그림 판도 단청 값을 받는다');
    }
    await page.screenshot({ path: path.join(shots, `wing-saseol-${want}-${vp.width}x${vp.height}-dancheong.png`) });

    // 움직임 줄이기: 두루마리가 움직임 없이 바로 그 자리
    await ev(page, () => window.__t.world.setDeviceReduceMotion(true));
    await ev(page, () => window.__t.events.emit('diorama:unroll', { unit: 1, feet: 20 }));
    const now = await ev(page, scrollState);
    assert(now.feet === 20, label + ': 움직임 줄이기에서는 두루마리가 움직임 없이 바로 풀린다');
    await ev(page, () => window.__t.world.setDeviceReduceMotion(false));

    // 음성 사례: 모르는 사건과 망가진 detail은 조용히 넘긴다
    const thrown = await ev(page, () => {
      const h = window.__t.handle();
      try {
        h.react('diorama:nope', { x: 1 });
        h.react('diorama:slot-set', null);
        h.react('diorama:pop-out', { area: 'roof', index: 9 });
        h.react('diorama:unroll', { feet: 'many' });
        h.react(undefined, undefined);
        return null;
      } catch (e) { return String(e); }
    });
    assert(thrown === null, label + ': (음성) 모르는 사건과 망가진 detail은 오류 없이 넘긴다');

    if (want === '3d') {
      // 음성 사례: 그리기 호출이 예산을 넘으면 점검이 잡는다
      const heavy = await ev(page, async () => {
        const { THREE, root } = window.__t.world.getThree();
        const extra = [];
        for (let i = 0; i < 80; i++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0x888888 }));
          m.position.set((i % 10) - 4.5, 0.2 + Math.floor(i / 10) * 0.3, 2);
          root.add(m);
          extra.push(m);
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const calls = window.__t.world.getStats().drawCalls;
        extra.forEach((m) => { root.remove(m); m.geometry.dispose(); m.material.dispose(); });
        return calls;
      });
      assert(!withinBudget(heavy), label + ': (음성) 상자를 80개 더 얹으면 예산 초과를 잡는다 (' + heavy + ')');
    }

    // 치우기: 회랑으로 나가면 모형이 사라진다
    await ev(page, () => window.__t.world.enterCorridor());
    await frames(page, 2);
    const gone = await ev(page, () => !document.querySelector('svg.saseol2d') && (window.__t.world.getMode() === '2d' || !window.__t.world.getThree().root));
    assert(gone, label + ': 관을 나가면 모형을 치운다');

    assert(game.external.length === 0, label + ': 바깥 주소 요청이 없다 ' + JSON.stringify(game.external));
    assert(game.errors.length === 0, label + ': 콘솔 오류가 없다 ' + JSON.stringify(game.errors));
  } finally {
    await game.close();
  }
}

const server = await startServer();
try {
  checkModel();
  for (const [key, vp] of [['chromebook', VIEWPORTS.chromebook], ['phone', VIEWPORTS.phone]]) {
    await checkSession(server, '3D ' + key, { viewport: vp });
    await checkSession(server, '2D ' + key, { viewport: vp, disable3d: true });
  }
  console.log('\n사설시조관 모형 점검 통과');
} catch (e) {
  console.error(e.stack || e.message);
  process.exitCode = 1;
} finally {
  await server.close();
}
