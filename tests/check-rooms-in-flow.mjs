// 작품 방을 실제 관 흐름 안에서 잇는지 점검(F3, js/data/README.md '연결 결정(F3) — 작품 방 손잡이', 7.3, spec 9·12·20).
// 실제 앱 페이지(index.html)를 연다. 등록된 시작 화면이 아직 없으므로, 점검 도구가 등록된 한 판 화면(js/registry.js의
// screens.play)을 #app에 띄운다(제품 코드에는 점검 입구가 없다). 상태는 로컬 저장소에 넣은 기록뿐이다:
// 관마다 칸이 묶이고 바구니를 마친 기록(앞 관은 마침, 행선지 결과까지 엔진이 요구하는 대로 맞춘다).
//
// 관 다섯 × (3D 1366×768, 강제 2D 844×390)마다
//  1. 서가 띠의 '작품 방' 문으로 걸어가 상황 버튼으로 실제 방을 연다(등록된 실제 방 모듈).
//  2. 조금 하다가 '방에서 나가기' → 기록은 남지 않고 세계(카메라·관 모형·조작)가 돌아온다.
//  3. 다시 들어가면 방이 처음부터 시작한다.
//  4. 방이 보인다: 방 칸 안의 점들이 방 화면(또는 방이 빌린 3D 장면)을 보고, 가려지지 않고, 화면 그림에 바탕색 아닌 픽셀이 있다.
//     3D에서 세계 장면을 빌리는 방은 빈 방 무대에 물체를 붙이고, 관 모형은 숨는다.
//  5. 실제 입력(누르기)으로 방을 끝까지 한다(빠른 길, 박자 없는 방식).
//  6. 관을 마친다: 기록이 엔진으로 저장되고(방 기록 다섯 종류), 단청이 돌아오고, 판 카드에 방 기록이 보인다.
//  7. 세계가 돌아온다: 카메라·학생 자리·관 모형·조작.
//  8. 콘솔 오류·바깥 요청 없음.
// 음성 사례: 가리는 판을 덮으면 '보인다' 판정이 실패하고, 한 색 그림은 '바탕색 아닌 픽셀' 판정이 실패한다.
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { openGame, VIEWPORTS } from './lib/browser.mjs';
import { defaultData, defaultProgress, SAVE_KEY } from '../js/core/save.js';
import { WING_TABLE, ROUTING } from '../js/data/song-table.js';
import { PLAY_WING_IDS } from '../js/data/wings.js';
import { interpretations as HYANGGA_INTERP } from '../js/data/rooms-hyangga.js';
import { room as GORYEO } from '../js/data/rooms-goryeo.js';
import { roomSaseol } from '../js/data/rooms-saseol.js';

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
}

const ISO = '2026-10-01T09:00:00.000Z';
// 낭송 조각(T28)이 아직 자산 목록에 없는지
const MANIFEST = JSON.parse(fs.readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8'));
const VOICE_PENDING = !(MANIFEST.assets ?? []).some((a) => a.kind === 'voice');
const SAMPLE = {
  hyangga: { room: 'hyangga', interpretationId: 'overcome', interpretationText: '앞 관 해석', isInterpretation: true },
  goryeo: { room: 'goryeo', lastConditionId: 'gueun-bam', lastConditionText: '앞 관 조건' },
  sijo: { room: 'sijo', rooms: ['na', 'dal', 'cheongpung'], outside: ['gangsan'], interpretationId: 'as-written', interpretationText: '앞 관 해석', isInterpretation: true },
  gasa: { room: 'gasa', words: ['앞 관 시어'] },
};
// 3D에서 세계 장면을 빌리는 방(README '연결 결정(F3)'). 「십 년을 경영하야」는 방 안에 자기 그림판을 만든다.
const BORROWS = { hyangga: true, goryeo: true, sijo: false, gasa: true, saseol: true };

// ───────── 기록 만들기(점검 도구 전용 상태 주입) ─────────
// W 앞의 관은 마쳤고, W는 칸 묶음·바구니를 마친 채 작품 방만 남았다. 행선지 결과(prewaiting·returned)도 엔진 규칙대로 넣는다.
export function seedFor(W) {
  const data = defaultData();
  data.device.slashMode = true;   // 박자 없는 방식(빗금)으로 빠르게
  data.device.calibrated = true;
  const p = defaultProgress();
  p.tutorialDone = true;
  const idx = PLAY_WING_IDS.indexOf(W);
  for (let i = 0; i <= idx; i++) {
    const w = PLAY_WING_IDS[i];
    const t = WING_TABLE[w];
    const done = i < idx;
    Object.assign(p.wings[w], {
      state: done ? 'done' : 'open', shelfBound: true, basketDone: true, roomDone: done, bonusDone: false,
      uniqueActionIntroSeen: true, doneAt: done ? ISO : null,
      placements: {
        shelf: t.shelf.map((songId) => ({ songId, fixed: true })),
        basket: t.stray.map((s) => ({ songId: s.songId, to: s.to, fixed: true })),
        bonus: [null, null, null],
      },
      wrongCount: 0,
      measured: [...t.shelf, ...t.stray.map((s) => s.songId)],
    });
    for (const s of t.stray) {
      if (ROUTING.prewait[s.to]?.includes(s.songId)) p.prewaiting[s.to].push(s.songId);
      else if (ROUTING.returned[s.to]?.includes(s.songId)) p.returned[s.to].push(s.songId);
    }
    p.keepsakes.push(...t.shelf);
    if (done) p.rooms[w] = SAMPLE[w];
  }
  const id = 's-rooms';
  data.slots[id] = { id, name: '방점검', appearance: 'b', createdAt: ISO, updatedAt: ISO, progress: p };
  data.lastSlotId = id;
  return { [SAVE_KEY]: JSON.stringify(data) };
}

// ───────── 페이지 도우미 ─────────
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFn = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const waitSel = (page, sel, timeout = 15000) => waitFn(page, (s) => !!document.querySelector(s), sel, timeout);
const gone = (page, sel, timeout = 15000) => waitFn(page, (s) => !document.querySelector(s), sel, timeout);
const progressOf = (page) => ev(page, (k) => JSON.parse(localStorage.getItem(k)).slots['s-rooms'].progress, SAVE_KEY);

// 실제 입력으로 누른다(마우스 클릭, 보이고 움직임이 멈출 때까지 기다린다)
async function press(page, sel, timeout = 15000) {
  await page.locator(sel).first().click({ timeout });
}

// 실제 앱 페이지에서 등록된 한 판 화면을 띄운다
async function boot(page) {
  await page.waitForSelector('#app');
  await ev(page, async () => {
    const { registry } = await import('/js/registry.js');
    window.__world = await import('/js/world/world.js');
    const app = document.getElementById('app');
    app.replaceChildren();
    window.__play = registry.screens.play.show(app, {});
    window.__session = await window.__play.ready;
  });
}

// 세계 상태(점검용으로 읽기만)
const worldState = (page) => ev(page, () => {
  const w = window.__world;
  const cam = w.getCamera();
  return {
    mode: w.getMode(),
    place: w.getPlace(),
    player: w.getPlayer(),
    camera: cam,
    room: w.getRoomState?.() ?? null,
    split: !!document.querySelector('.world.is-split'),
    roomClass: !!document.querySelector('.world.is-room'),
    wingVisible: w.getThree?.()?.root?.visible ?? null,
  };
});

async function settledWorld(page) {
  await waitFn(page, () => { const c = window.__world.getCamera(); return !c || c.position === null || c.distanceToDesired < 0.02; }, null, 15000).catch(() => {});
  return worldState(page);
}

function sameWorld(a, b) {
  const near = (x, y, e = 0.06) => Math.abs((x ?? 0) - (y ?? 0)) < e;
  const out = [];
  if (a.place !== b.place) out.push('장소 ' + a.place + '→' + b.place);
  if (!near(a.player?.x, b.player?.x) || !near(a.player?.z ?? a.player?.y, b.player?.z ?? b.player?.y)) out.push('학생 자리 ' + JSON.stringify(a.player) + '→' + JSON.stringify(b.player));
  if (a.camera?.position) {
    const p = a.camera.position;
    const q = b.camera?.position ?? {};
    if (!near(p.x, q.x, 0.08) || !near(p.y, q.y, 0.08) || !near(p.z, q.z, 0.08)) out.push('카메라 자리 ' + JSON.stringify(p) + '→' + JSON.stringify(q));
    if (a.camera.fov !== undefined && !near(a.camera.fov, b.camera?.fov, 1e-3)) out.push('시야각 ' + a.camera.fov + '→' + b.camera?.fov);
    if (a.camera.aspect !== undefined && !near(a.camera.aspect, b.camera?.aspect, 1e-3)) out.push('카메라 비율 ' + a.camera.aspect + '→' + b.camera?.aspect);
  }
  if (b.roomClass || b.room?.open) out.push('세계가 아직 방 상태');
  if (a.wingVisible === true && b.wingVisible !== true) out.push('관 모형이 숨은 채');
  return out;
}

// 방 문으로 걸어가 상황 버튼으로 방을 연다(실제 입력)
async function enterRoomDoor(page) {
  await press(page, '.play-goto[data-anchor="roomDoor"]');
  await waitFn(page, () => { const b = document.querySelector('.world-context'); return b && !b.hidden && b.textContent.startsWith('작품 방'); }, null, 30000);
  const before = await settledWorld(page);
  await press(page, '.world-context');
  await waitSel(page, '.play-room .play-room-body > *');
  return before;
}

// ───────── 방이 보이는지 ─────────
// 방 칸 안의 점마다 '그 점에서 실제로 보이는 것'을 찾는다(투명한 겹은 지나쳐 처음으로 칠해진 것).
// 'room': 방 화면 안의 칠해진 것 · 'world': 세계 3D 그림판 · 'other': 그 밖(방 틀 바탕, 다른 화면 등 = 가려짐)
function samplePoints() {
  const body = document.querySelector('.play-room-body');
  if (!body) return null;
  const r = body.getBoundingClientRect();
  const style = document.createElement('style');
  style.textContent = '* { pointer-events: auto !important; }';
  document.head.append(style);
  const paints = (e) => {
    if (e instanceof HTMLCanvasElement || e instanceof HTMLImageElement || e instanceof HTMLVideoElement) return true;
    if (e instanceof SVGElement) return !(e instanceof SVGSVGElement) && !(e instanceof SVGGElement);
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || Number(s.opacity) < 0.3) return false;
    if (s.backgroundImage && s.backgroundImage !== 'none') return true;
    const m = s.backgroundColor.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return (parts.length < 4 ? 1 : parts[3]) > 0.5;
  };
  const pts = [];
  const NX = 16;
  const NY = 9;
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const x = r.left + r.width * (i + 0.5) / NX;
      const y = r.top + r.height * (j + 0.5) / NY;
      let kind = 'other';
      for (const e of document.elementsFromPoint(x, y)) {
        if (!paints(e)) continue;
        if (e.classList?.contains('world-canvas')) kind = 'world';
        else if (body.contains(e)) kind = 'room';
        break;
      }
      pts.push({ x: x - r.left, y: y - r.top, kind });
    }
  }
  style.remove();
  return { rect: { x: r.left, y: r.top, width: r.width, height: r.height }, pts };
}

// 화면 그림(스크린숏)의 점 색을 읽는다(페이지 안에서 PNG를 풀어 읽는다)
async function pixelsAt(page, rect, pts) {
  const png = await page.screenshot({ clip: rect });
  return ev(page, async ({ b64, pts: ps }) => {
    const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const k = bmp.width / ps.rectW;
    return ps.list.map((p) => [...g.getImageData(Math.min(bmp.width - 1, Math.round(p.x * k)), Math.min(bmp.height - 1, Math.round(p.y * k)), 1, 1).data].slice(0, 3));
  }, { b64: png.toString('base64'), pts: { list: pts, rectW: rect.width } });
}

// 색 무리: 가장 흔한 색(16단계로 묶음)이 차지하는 몫과 서로 다른 색 수
export function colorStats(colors) {
  if (!colors.length) return { modal: 1, distinct: 0 };
  const key = (c) => c.map((v) => v >> 4).join(',');
  const count = new Map();
  for (const c of colors) count.set(key(c), (count.get(key(c)) ?? 0) + 1);
  return { modal: Math.max(...count.values()) / colors.length, distinct: count.size };
}

// 방이 보이는지: 방 칸의 점 가운데 방(또는 빌린 세계 장면)을 보는 몫, 그 점들 색의 다양함
async function roomVisibility(page, { borrows }) {
  const s = await ev(page, samplePoints);
  if (!s) return { visible: false, why: '방 칸 없음' };
  const n = s.pts.length;
  const roomPts = s.pts.filter((p) => p.kind === 'room');
  const worldPts = s.pts.filter((p) => p.kind === 'world');
  const seen = borrows ? [...roomPts, ...worldPts] : roomPts;
  const colors = await pixelsAt(page, s.rect, s.pts);
  const at = (list) => list.map((p) => colors[s.pts.indexOf(p)]);
  const all = colorStats(at(seen));
  const world = colorStats(at(worldPts));
  const why = [];
  if (seen.length / n < 0.6) why.push('방을 보는 점 ' + seen.length + '/' + n);
  if (worldPts.length && !borrows) why.push('방이 빌리지 않았는데 세계 그림판이 보이는 점 ' + worldPts.length);
  if (borrows && worldPts.length / n < 0.2) why.push('빌린 3D 장면이 보이는 점 ' + worldPts.length + '/' + n);
  if (all.modal > 0.9 || all.distinct < 3) why.push('보이는 점이 거의 한 색(가장 흔한 색 ' + Math.round(all.modal * 100) + '%, ' + all.distinct + '색)');
  if (borrows && worldPts.length && (world.modal > 0.85 || world.distinct < 3)) why.push('빌린 3D 장면이 거의 한 색(바탕만, ' + Math.round(world.modal * 100) + '%, ' + world.distinct + '색)');
  return { visible: why.length === 0, why: why.join(' / '), room: roomPts.length, world: worldPts.length, n, modal: all.modal, distinct: all.distinct };
}

// ───────── 방마다: 처음 모습, 조금 하기, 끝까지 하기, 기대하는 기록 ─────────
const ROOMS = {
  hyangga: {
    root: '.rh-room',
    atStart: () => document.querySelector('.rh-room')?.dataset.phase === 'intro' && !!document.querySelector('.rh-room .rh-start') && document.querySelector('.rh-room').dataset.scattered === '0',
    async partial(page) {
      await press(page, '.rh-room .rh-start');
      await waitFn(page, () => document.querySelector('.rh-room')?.dataset.phase === 'catch');
      await press(page, '.rh-room .rh-act');
      await waitFn(page, () => Number(document.querySelector('.rh-room')?.dataset.scattered) > 0);
    },
    async solve(page) {
      await press(page, '.rh-room .rh-start');
      await waitFn(page, () => document.querySelector('.rh-room')?.dataset.phase === 'catch');
      for (let i = 0; i < 8; i++) {
        await waitFn(page, (u) => document.querySelector('.rh-room')?.dataset.unit === String(u), i);
        await press(page, '.rh-room .rh-act');
        await waitFn(page, (u) => document.querySelector('.rh-room')?.dataset.unit !== String(u) || document.querySelector('.rh-room')?.dataset.phase !== 'catch', i);
      }
      await waitFn(page, () => document.querySelector('.rh-room')?.dataset.phase === 'sweep');
      for (let k = 0; k < 8 && (await ev(page, () => document.querySelector('.rh-room')?.dataset.phase)) === 'sweep'; k++) {
        const before = await ev(page, () => document.querySelector('.rh-room').dataset.swept);
        await press(page, '.rh-room .rh-act');
        await waitFn(page, (b) => document.querySelector('.rh-room')?.dataset.swept !== b, before);
      }
      await waitFn(page, () => document.querySelector('.rh-room')?.dataset.phase === 'ask', null, 20000);
      await press(page, `.rh-room .rh-choice[data-id="${HYANGGA_INTERP[1].id}"]`);
      await press(page, '.rh-room .rh-confirm');
    },
    expect: { room: 'hyangga', interpretationId: HYANGGA_INTERP[1].id, interpretationText: HYANGGA_INTERP[1].text, isInterpretation: true },
    cardTexts: [HYANGGA_INTERP[1].text],
  },
  goryeo: {
    root: '.room-goryeo',
    atStart: () => document.querySelector('.room-goryeo')?.dataset.step === 'pick' && !document.querySelector('.room-goryeo .rg-slip[data-card-id]') && document.querySelectorAll('.room-goryeo button.rg-card').length >= 4,
    async partial(page) {
      await press(page, `.room-goryeo button.rg-card[data-card-id="${GORYEO.cards[0].id}"]`);
      await waitFn(page, (id) => document.querySelector('.room-goryeo .rg-slip')?.dataset.cardId === id, GORYEO.cards[0].id);
    },
    async solve(page) {
      for (const c of [GORYEO.cards[1], GORYEO.cards[3]]) {
        await press(page, `.room-goryeo button.rg-card[data-card-id="${c.id}"]`);
        await waitFn(page, (id) => document.querySelector('.room-goryeo .rg-slip')?.dataset.cardId === id, c.id);
      }
      await press(page, '.room-goryeo button.rg-to-final');
      await waitFn(page, () => document.querySelector('.room-goryeo')?.dataset.step === 'final');
      await press(page, '.room-goryeo button.rg-discover');
      await waitFn(page, () => document.querySelector('.room-goryeo')?.dataset.step === 'discover');
      await press(page, `.room-goryeo button.rg-tab[data-unit="${GORYEO.echo.unit}"]`);
      await waitSel(page, '.room-goryeo.is-match');
      await press(page, '.room-goryeo button.rg-finish');
    },
    expect: { room: 'goryeo', lastConditionId: GORYEO.cards[3].id, lastConditionText: GORYEO.cards[3].label },
    cardTexts: [GORYEO.cards[3].label],
  },
  sijo: {
    root: '.room-sijo',
    atStart: () => document.querySelector('.room-sijo')?.dataset.phase === 'place' && [...document.querySelectorAll('.room-sijo .sj-item')].every((b) => b.dataset.at === 'tray'),
    async partial(page) {
      await waitFn(page, () => document.querySelector('.room-sijo')?.dataset.phase === 'place');
      await press(page, '.room-sijo .sj-item[data-item="na"]');
      await press(page, '.room-sijo .sj-slot[data-slot="0"]');
      await waitFn(page, () => document.querySelector('.room-sijo .sj-item[data-item="na"]')?.dataset.at !== 'tray');
    },
    async solve(page) {
      await waitFn(page, () => document.querySelector('.room-sijo')?.dataset.phase === 'place');
      for (const [item, slot] of [['na', 0], ['dal', 1], ['cheongpung', 2]]) {
        await press(page, `.room-sijo .sj-item[data-item="${item}"]`);
        await press(page, `.room-sijo .sj-slot[data-slot="${slot}"]`);
      }
      await press(page, '.room-sijo .sj-confirm');
      await waitFn(page, () => document.querySelector('.room-sijo')?.dataset.phase === 'reveal');
      await press(page, '.room-sijo .sj-next');
      await waitFn(page, () => document.querySelector('.room-sijo')?.dataset.phase === 'gangsan');
      await press(page, '.room-sijo .sj-item[data-item="gangsan"]');
      await press(page, '.room-sijo .sj-slot[data-slot="outside"]');
      await waitFn(page, () => document.querySelector('.room-sijo')?.dataset.phase === 'pullback');
      await press(page, '.room-sijo .sj-next');
      await waitFn(page, () => document.querySelector('.room-sijo')?.dataset.phase === 'interpret');
      await press(page, '.room-sijo .sj-finish');
    },
    expect: { room: 'sijo', rooms: ['na', 'dal', 'cheongpung'], outside: ['gangsan'], interpretationId: 'as-written', isInterpretation: true },
    cardTexts: ['나 · 달 · 청풍', '강산'],
  },
  gasa: {
    root: '.rg-room',
    atStart: () => !!document.querySelector('.rg-room .rg-begin') && document.querySelector('.rg-room')?.dataset.phase === 'intro' && document.querySelector('.rg-room').dataset.walkerS === '0',
    async partial(page) {
      await press(page, '.rg-room .rg-begin');
      await waitFn(page, () => document.querySelector('.rg-room')?.dataset.phase === 'walk');
      await waitFn(page, () => !document.querySelector('.rg-room .rg-step').disabled);
      await press(page, '.rg-room .rg-step');
      await waitFn(page, () => Number(document.querySelector('.rg-room')?.dataset.unit) >= 0);
    },
    async solve(page) {
      await press(page, '.rg-room .rg-begin');
      const words = [];
      for (let guard = 0; guard < 300; guard++) {
        const ph = await ev(page, () => document.querySelector('.rg-room')?.dataset.phase ?? null);
        if (ph === null) break;
        if (ph === 'walk' || ph === 'collect') {
          if (ph === 'collect') {
            const chip = await ev(page, () => { const c = document.querySelector('.rg-room .rg-chip:not(.is-taken):not(.rg-letgo)'); return c ? { id: c.dataset.wordId, text: c.textContent } : null; });
            const taken = await ev(page, () => document.querySelectorAll('.rg-room .rg-chip.is-taken').length);
            if (chip && taken === 0) {
              await press(page, `.rg-room .rg-chip[data-word-id="${chip.id}"]`);
              words.push(chip.text);
              await waitFn(page, (i) => !document.querySelector(`.rg-room .rg-chip[data-word-id="${i}"]`) || document.querySelector(`.rg-room .rg-chip[data-word-id="${i}"]`).classList.contains('is-taken'), chip.id);
            }
          }
          await waitFn(page, () => { const b = document.querySelector('.rg-room .rg-step'); return !b || !b.disabled; }, null, 20000);
          const u = await ev(page, () => document.querySelector('.rg-room')?.dataset.unit ?? null);
          if (u === null) break;
          await press(page, '.rg-room .rg-step');
          await waitFn(page, (n) => !document.querySelector('.rg-room') || document.querySelector('.rg-room').dataset.unit !== n || document.querySelector('.rg-room').dataset.phase === 'letgo' || document.querySelector('.rg-room').dataset.phase === 'finale', u, 20000);
          await waitFn(page, () => !document.querySelector('.rg-room') || document.querySelector('.rg-room').dataset.busy !== '1', null, 20000);
        } else if (ph === 'letgo') {
          const ids = await ev(page, () => [...document.querySelectorAll('.rg-room .rg-letgo:not(.is-gone)')].map((c) => c.dataset.wordId));
          for (const id of ids) await press(page, `.rg-room .rg-letgo[data-word-id="${id}"]`);
          await waitFn(page, () => document.querySelector('.rg-room')?.dataset.phase !== 'letgo', null, 20000);
        } else if (ph === 'finale') {
          await press(page, '.rg-room .rg-finish');
          break;
        } else {
          await sleep(80);
        }
      }
      ROOMS.gasa.words = words;
    },
    get expect() { return { room: 'gasa', words: ROOMS.gasa.words ?? [] }; },
    get cardTexts() { return ROOMS.gasa.words ?? []; },
  },
  saseol: {
    root: '.rs-room',
    atStart: () => document.querySelector('.rs-room')?.dataset.phase === 'intro' && !document.querySelector('.rs-room .rs-foot[data-u="1"]'),
    async partial(page) {
      await press(page, '.rs-room .rs-start');
      await waitFn(page, () => document.querySelector('.rs-room')?.dataset.phase === 'run');
      await press(page, '.rs-room .rs-run');
      await waitSel(page, '.rs-room .rs-foot[data-u="1"]');
    },
    async solve(page) {
      await press(page, '.rs-room .rs-start');
      await waitFn(page, () => document.querySelector('.rs-room')?.dataset.phase === 'run');
      for (let i = 0; i < 80 && (await ev(page, () => document.querySelector('.rs-room')?.dataset.phase)) === 'run'; i++) {
        await press(page, '.rs-room .rs-run');
      }
      await waitFn(page, () => document.querySelector('.rs-room')?.dataset.phase === 'predict', null, 30000);
      await press(page, '.rs-room .rs-choice[data-id="jujuri-samdae"]');
      await waitFn(page, () => document.querySelector('.rs-room')?.dataset.phase === 'reveal');
      await press(page, '.rs-room .rs-next');
      await waitFn(page, () => document.querySelector('.rs-room')?.dataset.phase === 'final');
      await press(page, '.rs-room .rs-finish');
    },
    expect: { room: 'saseol', predictionId: 'jujuri-samdae', predictionText: roomSaseol.candidates.find((c) => c.id === 'jujuri-samdae').text },
    cardTexts: [roomSaseol.candidates.find((c) => c.id === 'jujuri-samdae').text],
  },
};

function recordProblems(W, rec) {
  const want = ROOMS[W].expect;
  const out = [];
  if (!rec || typeof rec !== 'object') return ['기록 없음'];
  for (const [k, v] of Object.entries(want)) {
    if (JSON.stringify(rec[k]) !== JSON.stringify(v)) out.push(k + ': ' + JSON.stringify(rec[k]) + ' ≠ ' + JSON.stringify(v));
  }
  if (W === 'sijo' && !(typeof rec.interpretationText === 'string' && rec.interpretationText.length)) out.push('해석 문장 없음');
  if (W === 'gasa' && !(rec.words?.length >= 4)) out.push('모은 시어가 넷보다 적음');
  if (Object.keys(rec).some((k) => /score|correct|grade|rank/i.test(k))) out.push('점수 열쇠');
  return out;
}

// 화면 그림은 tests/shots/(저장소에 넣지 않는다)에 남긴다
const shotPath = (name) => fileURLToPath(new URL('./shots/rooms-in-flow-' + name + '.png', import.meta.url));

// ───────── 관 하나 ─────────
async function runWing(server, run, W, extra = {}) {
  const L = `[${run.label} ${W}]`;
  const game = await openGame(server.url, { viewport: run.viewport, disable3d: run.disable3d, seed: seedFor(W) });
  const { page } = game;
  // 낭송 조각(T28)이 아직 자산 목록에 없으면, 소리 엔진이 그 조각을 찾다 받은 404(와 그 콘솔 줄)만 따로 센다.
  // 그 밖의 404·콘솔 오류는 모두 실패다. 낭송 조각이 목록에 들어오면 이 예외도 없어진다.
  const notFound = [];
  const voicePending = [];
  const consoleErrors = [];
  page.on('response', (res) => {
    if (res.status() < 400) return;
    const path = new URL(res.url()).pathname;
    if (VOICE_PENDING && path.startsWith('/assets/audio/voice/')) voicePending.push(path);
    else notFound.push(res.status() + ' ' + path);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const path = (() => { try { return new URL(m.location()?.url ?? '').pathname; } catch { return ''; } })();
    if (VOICE_PENDING && path.startsWith('/assets/audio/voice/') && m.text().startsWith('Failed to load resource')) return;
    consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  try {
    await boot(page);
    await waitFn(page, (w) => document.querySelector('.play')?.dataset.place === w, W, 30000);
    const w0 = await worldState(page);
    ok(w0.mode === run.mode, L + ' 세계가 ' + run.mode + '로 열린다');
    const dan0 = await ev(page, (w) => window.__world.getDancheong(w), W);
    ok(dan0 === 0, L + ' 판을 마치기 전 관은 먹빛이다');

    // 1·2. 들어가서 조금 하다가 나가기
    const before = await enterRoomDoor(page);
    await waitFn(page, (sel) => !!document.querySelector('.play-room-body ' + sel), ROOMS[W].root, 30000);
    const inRoom = await worldState(page);
    ok(inRoom.roomClass && inRoom.room?.open === true, L + ' 방이 열린 동안 세계는 방 상태(조작 멈춤)');
    if (run.mode === '3d') {
      ok(inRoom.room?.wingHidden === true, L + ' 방이 열린 동안 관 모형을 숨긴다');
      await sleep(400);
      const c1 = await ev(page, () => window.__world.getStats().frames);
      // 방을 막 연 뒤 첫 프레임은 셰이더를 만드느라 소프트웨어 그리기에서 0.6초를 넘길 수 있다. 3초 안에 다음 프레임이 오는지 본다.
      let c2 = c1;
      for (let t = 0; t < 30 && c2 <= c1; t++) { await sleep(100); c2 = await ev(page, () => window.__world.getStats().frames); }
      ok(c2 > c1, L + ' 방이 열린 동안에도 세계가 프레임마다 그린다(' + c1 + '→' + c2 + ')');
    }
    await ROOMS[W].partial(page);
    if (run.mode === '3d' && BORROWS[W]) {
      const mid = await worldState(page);
      ok((mid.room?.children ?? 0) > 0, L + ' 방이 빈 방 무대(root)에 장면을 붙였다');
      const cam = mid.camera.position;
      const p0 = before.camera.position;
      const moved = Math.hypot(cam.x - p0.x, cam.y - p0.y, cam.z - p0.z);
      await sleep(300);
      const mid2 = await worldState(page);
      const drift = Math.hypot(mid2.camera.position.x - cam.x, mid2.camera.position.y - cam.y, mid2.camera.position.z - cam.z);
      ok(moved > 0.01 && (W !== 'hyangga' || drift < 0.01), L + ' 카메라는 방이 움직이고, 세계는 따로 움직이지 않는다(옮김 ' + moved.toFixed(2) + ', 흔들림 ' + drift.toFixed(3) + ')');
    }
    await press(page, '.play-room .play-room-leave');
    await gone(page, '.play-room');
    await gone(page, ROOMS[W].root);
    await sleep(200);
    const afterAbort = await settledWorld(page);
    const d1 = sameWorld(before, afterAbort);
    ok(d1.length === 0, L + ' 방에서 나가면 세계가 돌아온다 ' + d1.join(' / '));
    if (run.mode === '3d') ok(afterAbort.room?.open === false && afterAbort.room?.wingHidden !== true, L + ' 나간 뒤 방 무대를 거두고 관 모형이 다시 보인다');
    const pa = await progressOf(page);
    ok(pa.wings[W].roomDone === false && pa.rooms[W] === null, L + ' 도중에 나가면 방 기록이 남지 않는다');

    // 3. 다시 들어가면 처음부터
    const before2 = await enterRoomDoor(page);
    await waitFn(page, (sel) => !!document.querySelector('.play-room-body ' + sel), ROOMS[W].root, 30000);
    await sleep(run.mode === '3d' ? 1500 : 600);
    const fresh = await ev(page, ROOMS[W].atStart);
    ok(fresh === true, L + ' 다시 들어가면 방이 처음부터 시작한다');

    // 4. 방이 보인다
    const vis = await roomVisibility(page, { borrows: run.mode === '3d' && BORROWS[W] });
    await page.screenshot({ path: shotPath(run.mode + '-' + W + '-room') });
    ok(vis.visible, L + ' 방이 보인다(가려지지 않음, 방 점 ' + vis.room + '·세계 장면 점 ' + vis.world + '/' + vis.n + ', ' + vis.distinct + '색) ' + (vis.why ?? ''));
    if (extra.negative) {
      // 음성 사례: 방 칸을 한 색 판으로 덮으면 '보인다' 판정이 실패한다
      await ev(page, () => {
        const c = document.createElement('div');
        c.id = '__cover';
        c.style.cssText = 'position:absolute;inset:0;background:#f3ead6;z-index:999';
        document.querySelector('.play-room').append(c);
      });
      const neg = await roomVisibility(page, { borrows: run.mode === '3d' && BORROWS[W] });
      ok(!neg.visible, L + ' (음성) 방 칸을 덮으면 보이지 않는다고 판정한다: ' + neg.why);
      await ev(page, () => document.getElementById('__cover')?.remove());
      if (run.mode === '3d' && BORROWS[W]) {
        // 음성 사례: 방 틀이 바탕을 칠하면(옛 모양) 빌린 3D 장면이 가려진다
        await ev(page, () => { document.querySelector('.play-room').style.background = '#f3ead6'; document.querySelector('.play-room-body').style.background = '#f3ead6'; });
        const neg2 = await roomVisibility(page, { borrows: true });
        ok(!neg2.visible, L + ' (음성) 방 틀이 바탕을 칠하면 빌린 장면이 가려졌다고 판정한다: ' + neg2.why);
        await ev(page, () => { document.querySelector('.play-room').style.background = ''; document.querySelector('.play-room-body').style.background = ''; });
      }
    }
    if (run.mode === '3d') {
      const st = await worldState(page);
      if (BORROWS[W]) ok((st.room?.children ?? 0) > 0 && st.room?.wingHidden === true, L + ' 빌린 장면: 방 무대에 물체가 있고 관 모형은 숨었다');
      else ok((st.room?.children ?? 0) === 0 && !!(await ev(page, () => document.querySelector('.play-room-body canvas'))), L + ' 방이 자기 그림판을 방 칸 안에 만든다');
    }

    // 5. 끝까지
    await ROOMS[W].solve(page);
    await waitSel(page, '.play-card', 30000);
    await gone(page, '.play-room');

    // 6. 기록·단청·판 카드
    const pr = await progressOf(page);
    const rp = recordProblems(W, pr.rooms[W]);
    ok(pr.wings[W].roomDone === true && pr.wings[W].state === 'done', L + ' 방을 마치자 관을 마친다(엔진이 저장)');
    ok(rp.length === 0, L + ' 저장된 방 기록이 7.3 모양이다 ' + JSON.stringify(pr.rooms[W]) + ' ' + rp.join(' / '));
    const next = PLAY_WING_IDS[PLAY_WING_IDS.indexOf(W) + 1];
    if (next) ok(pr.wings[next].state === 'open', L + ' 다음 관이 열린다');
    await waitFn(page, () => (document.querySelector('.play-card canvas')?.getAttribute('aria-label') ?? '').length > 0, null, 20000);
    const label = await ev(page, () => document.querySelector('.play-card canvas').getAttribute('aria-label'));
    const missing = ROOMS[W].cardTexts.filter((t) => !label.includes(t));
    ok(ROOMS[W].cardTexts.length > 0 && missing.length === 0 && !label.includes('작품 방 기록이 없'), L + ' 판 카드에 방 기록이 보인다 (' + ROOMS[W].cardTexts.join(', ') + ')' + (missing.length ? ' 빠짐: ' + missing.join(',') : ''));
    await waitFn(page, (w) => window.__world.getDancheong(w) >= 0.999, W, 15000).catch(() => {});
    ok((await ev(page, (w) => window.__world.getDancheong(w), W)) >= 0.999, L + ' 단청이 돌아온다');
    await press(page, '.play-card .card-view-close');
    await gone(page, '.play-card');

    // 7. 세계가 돌아온다
    await sleep(200);
    const after = await settledWorld(page);
    const d2 = sameWorld(before2, after);
    ok(d2.length === 0, L + ' 방을 마친 뒤 세계(카메라·학생 자리·관 모형)가 돌아온다 ' + d2.join(' / '));
    ok(!(await ev(page, () => !!document.querySelector('.play-goto[data-anchor="roomDoor"]'))), L + ' 마친 방의 문은 다시 열리지 않는다');
    ok(await ev(page, () => !document.querySelector('.play.is-in-room') && getComputedStyle(document.querySelector('.play-layer')).display !== 'none'), L + ' 한 판 화면의 띠·떠도는 노래 겹이 돌아온다');

    // 8. 오류·바깥 요청
    ok(game.external.length === 0, L + ' 바깥 요청 없음 ' + game.external.join(', '));
    ok(consoleErrors.length === 0 && notFound.length === 0, L + ' 콘솔 오류·없는 파일 요청 없음 ' + consoleErrors.slice(0, 3).join(' | ') + ' ' + notFound.slice(0, 4).join(', '));
    if (voicePending.length) console.log('  (참고) 아직 없는 낭송 조각 요청 ' + voicePending.length + '건 — 낭송 조각(T28)이 자산 목록에 오르기 전');
  } catch (e) {
    failures++;
    console.error('✗ ' + L + ' 진행 실패: ' + e.message.split('\n')[0]);
    try { await page.screenshot({ path: shotPath(run.mode + '-' + W + '-fail') }); } catch { /* 그림 못 남김 */ }
    if (game.errors.length) console.error('   콘솔: ' + game.errors.slice(0, 3).join(' | '));
  } finally {
    await game.close();
  }
}

// ───────── 실행 ─────────
const RUNS = [
  { label: '3D 1366×768', mode: '3d', disable3d: false, viewport: VIEWPORTS.chromebook },
  { label: '2D 844×390', mode: '2d', disable3d: true, viewport: VIEWPORTS.phone },
];

export { RUNS, runWing, startServer };
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();

async function main() {
// 음성 사례(브라우저 없이): 색 무리 계산이 한 색 그림을 잡는다
{
  const flat = colorStats(Array.from({ length: 50 }, () => [243, 234, 214]));
  ok(flat.modal === 1 && flat.distinct === 1, '(음성) 한 색 그림은 가장 흔한 색 100%로 잡힌다');
  const varied = colorStats([[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [243, 234, 214]]);
  ok(varied.modal <= 0.2 && varied.distinct === 5, '여러 색 그림은 여러 색으로 잡힌다');
  const seed = JSON.parse(seedFor('gasa')[SAVE_KEY]).slots['s-rooms'].progress;
  ok(seed.wings.gasa.shelfBound && seed.wings.gasa.basketDone && !seed.wings.gasa.roomDone && seed.wings.sijo.state === 'done'
    && seed.prewaiting.gasa.includes('myeonangjeongga') && seed.returned.sijo.includes('obaengnyeon-doeupji'), '기록 주입: 가사관은 방만 남았고 앞 관은 마쳤다(행선지 결과 포함)');
}

const server = await startServer();
try {
  for (const run of RUNS) {
    for (const W of PLAY_WING_IDS) {
      console.log('\n▶ ' + run.label + ' — ' + W);
      await runWing(server, run, W, { negative: W === 'hyangga' });
    }
  }
} finally {
  await server.close();
}

console.log(failures ? `\n${failures}개 실패` : '\n모두 통과');
process.exit(failures ? 1 : 0);
}
