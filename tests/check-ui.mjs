// 화면·설정·접근성 점검(T30, spec 13 기기 공통 설정, 14 화면·조작·접근성, 20 기기와 설정, 21 '설정과 접근성'·'화면').
// 제품 그대로(index.html)를 연다. 특정 장면(관 안, 재기, 작품 방, 보스, 엔딩)에 가려고 점검 도구가 로컬 저장소에 기록을
// 넣는다(제품에는 그런 입구가 없다). 장면에 들어간 뒤의 조작은 실제 입력(누르기, 키보드)으로 한다.
//
// 확인하는 것
//   1. 설정 화면의 모든 항목(배경음·낭송·효과음 크기, 소리 끄기, 빗금 모드, 움직임 줄이기, 글자 크기 3단계, 박자 다시 맞추기)이
//      저장되고 바로 적용되며, 다시 열어도 적용된다(소리 판의 음량, 박자 없는 방식, 글자 크기, 움직임 줄이기).
//   2. 움직임 줄이기: 3D에서 카메라가 미끄러지지 않고 곧장 따라가며, 흔들림이 없고, 파티클 비율이 줄며, 움직이는 연출(CSS)이 멈춘다.
//      2D에서도 움직이는 연출이 멈추고 흔들림이 없다.
//   3. 글과 바탕의 대비 4.5:1 이상(보이는 글 모두, 계산된 스타일로. 그림 위 글은 그림 아래 받침 색으로 계산).
//   4. 갈래를 색 말고도 모양과 이름표로 구분한다(보스 관 자리, 바구니 행선지, 수첩 쪽, 엔딩의 관 고르기).
//   5. 세로로 돌리면 '기기를 돌려 주세요'가 덮고 게임(낭송·박자·조작)이 멈추며, 가로로 돌아오면 이어진다.
//   6. 터치 대상 48px 이상.
//   7. 글자 크기 3단계 × 844×390·1366×768에서 넘침 없음: 시작, 설정, 회랑, 관(한 판 화면), 대화 상자, 재기 반반 화면,
//      수첩·일지·도감, 작품 방, 보스, 엔딩.
// 음성 사례: 대비 낮은 글, 받침 없이 그림 위에 놓인 글, 화면 밖 요소, 잘린 글, 48px 미만 단추, 색만 다른 갈래 자리를
// 일부러 넣으면 검사가 잡는다.
import { startServer } from './lib/server.mjs';
import { openGame, VIEWPORTS } from './lib/browser.mjs';
import { defaultData, defaultProgress, SAVE_KEY } from '../js/core/save.js';
import { WING_TABLE, ROUTING, BOSS_TABLE } from '../js/data/song-table.js';
import { CONCEPTS } from '../js/data/concepts.js';
import { PLAY_WING_IDS, wingById } from '../js/data/wings.js';
import { seedFor } from './check-rooms-in-flow.mjs';
import { coverProblems, measureNext } from './check-playthrough.mjs';

const SCALES = [1, 1.15, 1.3];
const MIN_CONTRAST = 4.5;
let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
  return !!cond;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────── 기록 만들기(점검 도구 전용 상태 주입) ─────────
const ISO = '2026-10-01T09:00:00.000Z';
function wrap(p, device = {}, name = '점검') {
  const data = defaultData();
  Object.assign(data.device, { calibrated: true }, device);
  const id = 's-ui';
  data.slots[id] = { id, name, appearance: 'a', createdAt: ISO, updatedAt: ISO, progress: p };
  data.lastSlotId = id;
  return { [SAVE_KEY]: JSON.stringify(data) };
}
function doneWing(w) {
  const t = WING_TABLE[w];
  return {
    state: 'done', shelfBound: true, basketDone: true, roomDone: true, bonusDone: false, uniqueActionIntroSeen: true, doneAt: ISO,
    placements: { shelf: t.shelf.map((songId) => ({ songId, fixed: true })), basket: t.stray.map((s) => ({ songId: s.songId, to: s.to, fixed: true })), bonus: [null, null, null] },
    wrongCount: 0, measured: [...t.shelf, ...t.stray.map((s) => s.songId)],
  };
}
const ROOM_RECORDS = {
  hyangga: { room: 'hyangga', interpretationId: 'both', interpretationText: '점검용 해석', isInterpretation: true },
  goryeo: { room: 'goryeo', lastConditionId: 'a', lastConditionText: '점검용 조건' },
  sijo: { room: 'sijo', rooms: ['na', 'dal', 'cheongpung'], outside: ['gangsan'], interpretationId: 'as-written', interpretationText: '점검용 해석', isInterpretation: true },
  gasa: { room: 'gasa', words: ['점검'] },
  saseol: { room: 'saseol', predictionId: 'nim', predictionText: '점검용 예측' },
};
// 튜토리얼을 마치고 향가관이 막 열린 기록
function seedFresh(device = {}) {
  const p = defaultProgress();
  p.tutorialDone = true;
  p.wings.hyangga.state = 'open';
  p.concepts['sijo-3jang'] = { state: 'pencil', songs: ['taesan'] };
  return wrap(p, device);
}
// 다섯 관을 마친 기록. boss: 'stage1' | 'done'
function seedAllDone(boss, device = {}) {
  const p = defaultProgress();
  p.tutorialDone = true;
  for (const w of PLAY_WING_IDS) { p.wings[w] = doneWing(w); p.rooms[w] = ROOM_RECORDS[w]; p.keepsakes.push(...WING_TABLE[w].shelf); }
  p.prewaiting = JSON.parse(JSON.stringify(ROUTING.prewait));
  p.returned = JSON.parse(JSON.stringify(ROUTING.returned));
  for (const c of CONCEPTS) p.concepts[c.id] = { state: 'ink', songs: WING_TABLE[c.genre].shelf.slice(0, 2) };
  p.boss.state = boss;
  if (boss === 'done') for (const g of BOSS_TABLE.unseenOrder) p.boss.unseen[BOSS_TABLE.unseen[g]] = { done: true, firstTryCorrect: true, journalHelp: false, singerGroupCorrect: true };
  return wrap(p, device);
}
// 작품 방만 남은 기록(작품 방 점검의 기록을 그대로 쓰고 기기 설정만 바꾼다)
function seedRoom(W, device = {}) {
  const s = seedFor(W);
  const data = JSON.parse(s[SAVE_KEY]);
  Object.assign(data.device, device);
  return { [SAVE_KEY]: JSON.stringify(data) };
}

// ───────── 페이지 안 검사(문자열로 넘어간다) ─────────
// 넘침·화면 밖·잘린 글·작은 누를 것·대비. scope: 살필 범위(선택자, 없으면 문서 전체)
function uiScan(scope) {
  const out = { overflow: [], small: [], clipped: [], contrast: [], scene: [] };
  const roots = scope ? [...document.querySelectorAll(scope)] : [document.body];
  if (!roots.length) { out.overflow.push('범위 없음: ' + scope); return out; }
  const name = (e) => (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : e.tagName.toLowerCase());
  const short = (e) => (e.textContent || e.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 18);
  const opacityOf = (e) => { let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const visible = (e) => {
    if (e.closest('[hidden], [inert]') && !e.closest('.rotate-overlay:not([hidden])')) return false;
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1 && opacityOf(e) > 0.05;
  };
  const scrollBox = (n) => { const s = getComputedStyle(n); return /(auto|scroll)/.test(s.overflowX + s.overflowY); };
  const inScroll = (e) => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) if (scrollBox(n)) return true; return false; };
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1) out.overflow.push('문서 넘침 ' + de.scrollWidth + 'x' + de.scrollHeight);
  const all = roots.flatMap((r) => [r, ...r.querySelectorAll('*')]).filter((e) => !(e instanceof SVGElement) || e instanceof SVGSVGElement);
  for (const e of all) {
    if (!visible(e)) continue;
    const r = e.getBoundingClientRect();
    if (!inScroll(e) && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)) {
      if (!e.matches('canvas.world-canvas, .world, .world-view, .world-hud, .world-safe-area, .board, .board *')) out.overflow.push('화면 밖 ' + name(e) + ' "' + short(e) + '" ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
    }
    // 잘린 글: 넘침을 숨기는 상자(스크롤 상자가 아님)에서 글이 상자보다 크다
    const s = getComputedStyle(e);
    if (/(hidden|clip)/.test(s.overflowX + s.overflowY) && !scrollBox(e) && (e.textContent ?? '').trim()) {
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2)) out.clipped.push('잘린 글 ' + name(e) + ' "' + short(e) + '" ' + e.scrollWidth + 'x' + e.scrollHeight + ' > ' + e.clientWidth + 'x' + e.clientHeight);
      // 안쪽의 글 요소가 상자 밖으로 나가 잘리는지(꾸밈 그림이 넘치는 것은 보지 않는다)
      const box = e.getBoundingClientRect();
      for (const t of e.querySelectorAll('*')) {
        if (!visible(t) || ![...t.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        let scrolled = false;   // 상자 안의 스크롤 상자 속 글은 굴려서 볼 수 있다
        for (let n = t.parentElement; n && n !== e; n = n.parentElement) if (scrollBox(n)) scrolled = true;
        if (scrolled) continue;
        const r = t.getBoundingClientRect();
        if (r.left < box.left - 2 || r.top < box.top - 2 || r.right > box.right + 2 || r.bottom > box.bottom + 2) out.clipped.push('잘린 글 ' + name(t) + ' "' + short(t) + '" (상자 ' + name(e) + ' 밖)');
      }
    }
  }
  // 누를 것 48px
  for (const root of roots) {
    for (const b of root.querySelectorAll('button, [role="button"], a[href], input:not([type="hidden"]), select, textarea')) {
      if (!visible(b)) continue;
      const t = b.matches('input[type="checkbox"], input[type="radio"]') ? (b.closest('label') ?? b) : b;
      const r = t.getBoundingClientRect();
      if (r.width < 47.5 || r.height < 47.5) out.small.push('작은 누를 것 ' + name(b) + ' "' + short(b) + '" ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  }
  // 대비: 보이는 글(직접 글 마디가 있는 요소). 바탕은 그 점에서 실제로 아래에 칠해진 것을 위에서부터 겹친다.
  const parse = (v) => {
    if (!v || v === 'transparent') return [0, 0, 0, 0];
    let m = v.match(/^rgba?\(([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = v.match(/^color\(srgb ([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    return null;
  };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const over = (top, bottom) => { const a = top[3]; return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]; };
  const style = document.createElement('style');
  style.textContent = '* { pointer-events: auto !important; }';
  document.head.append(style);
  try {
    const texts = all.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    for (const e of texts) {
      if (!visible(e) || e.closest('[aria-hidden="true"]') || e.closest('button:disabled, input:disabled')) continue;
      const cs = getComputedStyle(e);
      const fg0 = parse(cs.color);
      if (!fg0 || fg0[3] === 0) continue;   // 일부러 지운 글(투명)
      const r = e.getBoundingClientRect();
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(r.width / 2, 12)));
      const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      const stack = document.elementsFromPoint(x, y);
      const at = stack.indexOf(e);
      if (at < 0) continue;
      const paints = (n) => {
        const ns = getComputedStyle(n);
        const bg = parse(ns.backgroundColor);
        return (bg && bg[3] > 0.05) || n instanceof HTMLCanvasElement || n instanceof HTMLImageElement || n instanceof HTMLVideoElement || ns.backgroundImage !== 'none';
      };
      // 다른 것(대화 상자의 그늘막 등)에 덮인 글은 지금 보이는 글이 아니다
      if (stack.slice(0, at).some((n) => !e.contains(n) && paints(n))) continue;
      const layers = [];
      let backed = false;
      let sceneUnder = null;
      for (const n of stack.slice(at)) {
        const ns = getComputedStyle(n);
        const bg = parse(ns.backgroundColor);
        const image = n instanceof HTMLCanvasElement || n instanceof HTMLImageElement || n instanceof HTMLVideoElement || ns.backgroundImage !== 'none';
        if (bg && bg[3] > 0) layers.push(bg);
        if (bg && bg[3] >= 0.99) { backed = true; break; }
        if (image) { sceneUnder = name(n); break; }
      }
      // 그림·장면 위: 반투명 받침 색이 있으면 그림이 가장 어두울 때(검정)와 가장 밝을 때(흰색) 둘 다 4.5:1이어야 한다
      let bottoms = [[255, 255, 255, 1]];
      if (!backed && sceneUnder) {
        const cover = 1 - layers.reduce((k, l) => k * (1 - l[3]), 1);
        if (cover < 0.6) { out.scene.push('받침 없이 그림·장면 위의 글 ' + name(e) + ' "' + short(e) + '" (아래: ' + sceneUnder + ', 받침 ' + Math.round(cover * 100) + '%)'); continue; }
        bottoms = [[0, 0, 0, 1], [255, 255, 255, 1]];
      }
      for (const bottom of bottoms) {
        const ls = [...layers];
        let bg = backed ? ls.pop() : bottom;
        while (ls.length) bg = over(ls.pop(), bg);
        const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * opacityOf(e)], bg);
        const L1 = lum(fg);
        const L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (ratio < 4.5) { out.contrast.push(ratio.toFixed(2) + ':1 ' + name(e) + ' "' + short(e) + '" 글 ' + cs.color + ' 바탕 rgb(' + bg.slice(0, 3).map(Math.round).join(',') + ')' + (sceneUnder ? ' (' + sceneUnder + ' 위)' : '')); break; }
      }
    }
  } finally {
    style.remove();
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 12);
  return out;
}

// 갈래 구분: 자리마다 보이는 이름표(글)가 있고 서로 다르며, 모양(svg 경로)이 서로 다른지. 색을 지워도(흑백) 남는 것만 본다.
function genreCues(sel, shapeSel) {
  const items = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0);
  const labels = items.map((e) => e.innerText.replace(/\s+/g, ' ').trim());
  const shapes = shapeSel ? items.map((e) => e.querySelector(shapeSel)?.innerHTML ?? '') : null;
  const bad = [];
  if (items.length < 5) bad.push('자리 ' + items.length + '개');
  if (labels.some((l) => !l)) bad.push('이름표 없는 자리');
  if (new Set(labels).size !== labels.length) bad.push('이름표가 겹침 ' + JSON.stringify(labels));
  if (shapes && (shapes.some((s) => !s) || new Set(shapes).size !== shapes.length)) bad.push('모양이 없거나 겹침');
  return { labels, bad };
}

// ───────── 도우미 ─────────
function makeUi(page, touch = false) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const waitFn = (fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
  const waitSel = (sel, timeout = 20000) => waitFn((s) => !!document.querySelector(s), sel, timeout);
  const waitGone = (sel, timeout = 20000) => waitFn((s) => !document.querySelector(s), sel, timeout);
  const has = (sel) => ev((s) => !!document.querySelector(s), sel);
  async function press(sel, timeout = 20000) {
    const loc = page.locator(sel).first();
    if (touch) await loc.tap({ timeout }); else await loc.click({ timeout });
  }
  const saved = () => ev((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE_KEY);
  const waitContext = (prefix, timeout = 30000) => waitFn((l) => { const b = document.querySelector('.world-context'); return !!b && !b.hidden && b.textContent.startsWith(l); }, prefix, timeout);
  return { ev, waitFn, waitSel, waitGone, has, press, saved, waitContext };
}

async function injectScan(page) {
  await page.evaluate(`window.__uiScan = ${uiScan.toString()}; window.__genreCues = ${genreCues.toString()};`);
}

// 지금 화면을 살핀다. what: 볼 것 목록(기본 넘침·잘림·누를 것·대비·받침)
async function scan(page, label, { scope = null, contrast = true } = {}) {
  // 나타나는 연출(희미하게 시작하는 것)이 끝난 뒤의 모습을 본다. 되풀이 연출은 기다리지 않는다.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 4000)),
  ]));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await injectScan(page);
  const s = await page.evaluate((sc) => window.__uiScan(sc), scope);
  const layout = [...s.overflow, ...s.clipped];
  ok(layout.length === 0, label + ': 넘침·화면 밖·잘린 글 없음 ' + JSON.stringify(layout));
  ok(s.small.length === 0, label + ': 누를 것이 모두 48px 이상 ' + JSON.stringify(s.small));
  if (contrast) {
    ok(s.contrast.length === 0, label + ': 글과 바탕의 대비 ' + MIN_CONTRAST + ':1 이상 ' + JSON.stringify(s.contrast));
    ok(s.scene.length === 0, label + ': 그림·장면 위의 글에는 받침 색이 있다 ' + JSON.stringify(s.scene));
  }
  return s;
}

// 소리 판의 음량 마디를 엿보는 귀(점검 도구 전용): 만든 GainNode를 모은다. 게임 상태는 바꾸지 않는다.
function installEars() {
  const Orig = window.AudioContext;
  if (!Orig || window.__ears) return;
  const ears = { ctx: null, gains: [] };
  Object.defineProperty(window, '__ears', { value: ears });
  window.AudioContext = class extends Orig {
    constructor(...a) { super(...a); ears.ctx = this; }
    createGain() { const g = super.createGain(); ears.gains.push(g); return g; }
  };
}
const gainValues = (page) => page.evaluate(() => (window.__ears?.gains ?? []).map((g) => Math.round(g.gain.value * 100) / 100));

async function openRecord(ui) {
  await ui.waitSel('.story-record-open', 30000);
  await ui.press('.story-record-open');
  await ui.waitFn(() => !!document.querySelector('.play')?.dataset.place, null, 30000);
}
async function closeIntro(ui) {
  await sleep(300);
  if (await ui.has('.story-wing-intro')) { await ui.press('.story-wing-intro .story-wing-intro-close'); await ui.waitGone('.story-wing-intro'); }
}

// ───────── 1. 설정: 저장·적용·다시 열기 ─────────
async function checkSettings(server) {
  console.log('\n── 설정: 모든 항목이 저장되고 적용된다(다시 열어도)');
  const game = await openGame(server.url, { viewport: VIEWPORTS.chromebook, seed: seedFresh() });
  const { page, context } = game;
  await context.addInitScript(installEars);
  await page.reload();
  const ui = makeUi(page);
  try {
    await ui.waitSel('.story-start', 30000);
    const fontBefore = await ui.ev(() => parseFloat(getComputedStyle(document.querySelector('.story-title')).fontSize));
    await ui.press('.story-open-settings');
    await ui.waitSel('.story-settings');
    // 음량: 키보드로 막대를 움직인다(한 번에 0.05)
    const steps = { bgm: ['ArrowLeft', 7], voice: ['ArrowLeft', 11], sfx: ['ArrowLeft', 3] };
    for (const [ch, [key, n]] of Object.entries(steps)) {
      await page.locator(`.story-settings input[data-setting="${ch}"]`).focus();
      for (let i = 0; i < n; i++) await page.keyboard.press(key);
    }
    for (const k of ['muted', 'slashMode', 'reduceMotion']) await ui.press(`.story-settings input[data-setting="${k}"]`);
    await ui.press('.story-settings [data-scale="1.3"]');
    let dev = (await ui.saved()).device;
    ok(dev.volume.bgm === 0.25 && dev.volume.voice === 0.45 && dev.volume.sfx === 0.65, '배경음·낭송·효과음 크기가 저장된다 ' + JSON.stringify(dev.volume));
    ok(dev.muted === true && dev.slashMode === true && dev.reduceMotion === true && dev.textScale === 1.3, '소리 끄기·빗금 모드·움직임 줄이기·글자 크기가 저장된다');
    const applied = await ui.ev(() => ({
      scale: getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim(),
      reduce: document.getElementById('app').classList.contains('reduce-motion'),
      font: parseFloat(getComputedStyle(document.querySelector('.story-title')).fontSize),
    }));
    ok(applied.scale === '1.3' && Math.abs(applied.font / fontBefore - 1.3) < 0.02, '글자 크기 1.3이 바로 적용된다(제목 ' + fontBefore + 'px → ' + applied.font + 'px)');
    ok(applied.reduce, '움직임 줄이기가 바로 적용된다(#app.reduce-motion)');
    const gains = await gainValues(page);
    ok(gains.includes(0.25) && gains.includes(0.45) && gains.includes(0.65), '소리 판의 음량 마디에 바로 적용된다 ' + JSON.stringify(gains));
    ok(gains.includes(0) , '소리 끄기가 소리 판에 적용된다(주 음량 0) ' + JSON.stringify(gains));
    // 박자 다시 맞추기: 열고 건너뛰면 보정값 0
    await ui.press('.story-settings .story-recalibrate');
    await ui.waitSel('.story-firstrun[data-step="calibrate"]');
    await ui.press('.story-cal-skip');
    await ui.waitGone('.story-firstrun');
    ok((await ui.saved()).device.calibrationOffsetMs === 0 && (await ui.saved()).device.calibrated === true, '박자 다시 맞추기를 열고 건너뛰면 보정값 0으로 저장된다');
    await ui.press('.story-settings .story-settings-close');
    await ui.waitGone('.story-settings');

    // 박자 없는 방식이 재기에 적용된다(소리 끔·빗금)
    await openRecord(ui);
    await closeIntro(ui);
    const first = WING_TABLE.hyangga.shelf[0];
    await ui.press(`.play-song[data-song="${first}"]`);
    await ui.waitContext('잡기');
    await ui.press('.world-context');
    await ui.waitSel('.world.is-split .measure');
    for (let i = 0; i < 40 && (await ui.ev(() => document.querySelector('.measure')?.dataset.step)) === 'fold'; i++) {
      if (await ui.has('.measure .m-intro-ok')) { await ui.press('.measure .m-intro-ok'); continue; }
      const gap = await ui.ev(() => { const g = [...document.querySelectorAll('.measure .m-text button.m-gap:not(.is-folded)')].find((x) => x.dataset.u !== x.dataset.nu); return g ? g.dataset.i : null; });
      if (gap !== null) await ui.press(`.measure .m-text button.m-gap[data-i="${gap}"]`);
      else await sleep(100);
    }
    await ui.waitFn(() => document.querySelector('.measure')?.dataset.step === 'tap', null, 20000);
    ok((await ui.ev(() => document.querySelector('.measure').dataset.tapMode)) === 'slash', '빗금 모드(소리 끔)에서는 두드리기 대신 빗금으로 잰다');

    // 다시 열기: 저장된 설정이 처음부터 적용된다
    await page.reload();
    await ui.waitSel('.story-start', 30000);
    const re = await ui.ev(() => ({
      scale: getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim(),
      reduce: document.getElementById('app').classList.contains('reduce-motion'),
    }));
    ok(re.scale === '1.3' && re.reduce, '다시 열어도 글자 크기와 움직임 줄이기가 적용된다 ' + JSON.stringify(re));
    await ui.press('.story-open-settings');   // 첫 조작이 소리 판을 연다
    await ui.waitSel('.story-settings');
    const ch = await ui.ev(() => Object.fromEntries([...document.querySelectorAll('.story-settings [data-setting]')].map((i) => [i.dataset.setting, i.type === 'checkbox' ? i.checked : Number(i.value)])));
    ok(ch.bgm === 0.25 && ch.voice === 0.45 && ch.sfx === 0.65 && ch.muted && ch.slashMode && ch.reduceMotion, '다시 연 설정 화면이 저장된 값을 보인다 ' + JSON.stringify(ch));
    const g2 = await gainValues(page);
    ok(g2.includes(0.25) && g2.includes(0.45) && g2.includes(0.65) && g2.includes(0), '다시 열어도 소리 판에 음량과 소리 끄기가 적용된다 ' + JSON.stringify(g2));
    // 소리를 다시 켜면 주 음량이 돌아오고, 빗금을 끄면 박자 방식으로 잰다
    await ui.press('.story-settings input[data-setting="muted"]');
    await ui.press('.story-settings input[data-setting="slashMode"]');
    await ui.press('.story-settings .story-settings-close');
    ok((await gainValues(page)).filter((v) => v === 1).length >= 1 && (await ui.saved()).device.muted === false, '소리 끄기를 풀면 주 음량이 돌아온다');
    await openRecord(ui);
    await closeIntro(ui);
    await ui.press(`.play-song[data-song="${WING_TABLE.hyangga.shelf[1]}"]`);
    await ui.waitContext('잡기');
    await ui.press('.world-context');
    await ui.waitSel('.world.is-split .measure');
    for (let i = 0; i < 60 && (await ui.ev(() => document.querySelector('.measure')?.dataset.step)) === 'fold'; i++) {
      const gap = await ui.ev(() => { const g = [...document.querySelectorAll('.measure .m-text button.m-gap:not(.is-folded)')].find((x) => x.dataset.u !== x.dataset.nu); return g ? g.dataset.i : null; });
      if (gap !== null) await ui.press(`.measure .m-text button.m-gap[data-i="${gap}"]`); else await sleep(100);
    }
    await ui.waitFn(() => !!document.querySelector('.measure')?.dataset.tapMode, null, 20000);
    ok((await ui.ev(() => document.querySelector('.measure').dataset.tapMode)) === 'beat' && (await ui.has('.measure .m-listen')), '소리를 켜고 빗금을 끄면 박자 두드리기로 잰다');
    ok(game.errors.length === 0 && game.external.length === 0, '설정: 콘솔 오류·바깥 요청 없음 ' + game.errors.slice(0, 3).join(' | '));
  } catch (e) {
    failures++;
    console.error('✗ 설정 점검 중단: ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | '));
  } finally {
    await game.close();
  }
}

// ───────── 2. 움직임 줄이기 ─────────
async function cameraLag(page, ui, touch) {
  // 바닥 한 점(그림판이 맨 위인 곳)을 눌러 걷게 하고, 걷는 동안 카메라가 따라갈 자리와 얼마나 떨어지는지 프레임마다 잰다
  await page.evaluate(async () => { window.__w = await import('/js/world/world.js'); });
  await ui.waitFn(() => !window.__w.getMarker().visible && (window.__w.getCamera().distanceToDesired ?? 0) < 0.01, null, 20000);
  const pt = await ui.ev(() => {
    const w = window.__w;
    const p = w.getPlayer();
    for (const [dx, dz] of [[2.5, 0.5], [-2.5, 0.5], [2, -1.5], [-2, -1.5], [1.5, 1.5], [-1.5, 1.5]]) {
      const s = w.toScreen({ x: p.x + dx, y: 0, z: p.z + dz });
      const hit = document.elementFromPoint(s.x, s.y);
      if (hit?.classList.contains('world-canvas')) return s;
    }
    return null;
  });
  if (!pt) throw new Error('누를 바닥 점이 없다');
  if (touch) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
  return page.evaluate(() => new Promise((res) => {
    const w = window.__w;
    let max = 0;
    let n = 0;
    const moved = w.getMarker().visible;
    const f = () => { const c = w.getCamera(); max = Math.max(max, c.distanceToDesired ?? 0); if (++n < 40) requestAnimationFrame(f); else res(moved ? max : -1); };
    requestAnimationFrame(f);
  }));
}

async function animatedDurations(page) {
  return page.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)].map((e) => { const s = getComputedStyle(e); return Math.max(...s.animationDuration.split(',').map(parseFloat), ...s.transitionDuration.split(',').map(parseFloat)); });
    return { songs: pick('.play-song'), jom: pick('.story-jom') };
  });
}

async function setReduceViaHud(ui, on) {
  await ui.press('.story-hud-settings');
  await ui.waitSel('.story-settings');
  const checked = await ui.ev(() => document.querySelector('.story-settings input[data-setting="reduceMotion"]').checked);
  if (checked !== on) await ui.press('.story-settings input[data-setting="reduceMotion"]');
  await ui.press('.story-settings .story-settings-close');
  await ui.waitGone('.story-settings');
}

async function checkReduceMotion(server) {
  for (const mode of ['3d', '2d']) {
    console.log('\n── 움직임 줄이기(' + mode + ')');
    const game = await openGame(server.url, { viewport: VIEWPORTS.chromebook, disable3d: mode === '2d', seed: seedFresh() });
    const { page } = game;
    const ui = makeUi(page);
    try {
      await openRecord(ui);
      await closeIntro(ui);
      ok((await ui.ev(() => document.querySelector('.world')?.dataset.mode)) === mode, mode + '로 열린다');
      // 꺼진 상태
      const offAnim = await animatedDurations(page);
      ok(offAnim.songs.length > 0 && offAnim.songs.every((d) => d > 0.05), mode + ' 움직임 줄이기 끔: 떠도는 노래가 움직인다(연출 ' + offAnim.songs[0] + '초)');
      const offShake = await ui.ev(() => import('/js/world/world.js').then((w) => w.shake(0.3)));
      ok(offShake === true || mode === '2d', mode + ' 움직임 줄이기 끔: 흔들림이 있다');
      if (mode === '3d') {
        await sleep(600);
        const lag = await cameraLag(page, ui, false);
        ok(lag > 0.05, '3D 움직임 줄이기 끔: 카메라가 부드럽게 미끄러지며 따라간다(최대 거리 ' + lag.toFixed(3) + ')');
      }
      ok((await ui.ev(() => import('/js/world/world.js').then((w) => w.particleScale()))) === 1, mode + ' 움직임 줄이기 끔: 파티클 비율 1');

      // 켠다(게임 중 설정에서 실제로 누른다)
      await setReduceViaHud(ui, true);
      const onAnim = await animatedDurations(page);
      ok(onAnim.songs.every((d) => d < 0.01), mode + ' 움직임 줄이기 켬: 떠도는 노래의 연출이 멈춘다 ' + JSON.stringify(onAnim.songs.slice(0, 3)));
      ok(onAnim.jom.every((d) => d < 0.01), mode + ' 움직임 줄이기 켬: 먹안개 속 좀이 움직이지 않는다');
      const onShake = await ui.ev(() => import('/js/world/world.js').then((w) => w.shake(0.3)));
      ok(onShake === false, mode + ' 움직임 줄이기 켬: 흔들림이 없다');
      const scale = await ui.ev(() => import('/js/world/world.js').then((w) => w.particleScale()));
      ok(scale < 1, mode + ' 움직임 줄이기 켬: 파티클 비율이 줄어든다(' + scale + ')');
      if (mode === '3d') {
        const lag = await cameraLag(page, ui, false);
        ok(lag >= 0 && lag < 0.01, '3D 움직임 줄이기 켬: 카메라가 미끄러지지 않고 곧장 따라간다(최대 거리 ' + lag.toFixed(4) + ')');
      }
      ok(game.errors.length === 0, mode + ' 움직임 줄이기: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    } catch (e) {
      failures++;
      console.error('✗ 움직임 줄이기 점검 중단(' + mode + '): ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | '));
    } finally {
      await game.close();
    }
  }
}

// ───────── 5. 세로 회전: 덮고 멈춘다 ─────────
async function checkPortrait(server) {
  console.log('\n── 세로로 돌리면 덮고 멈춘다');
  const game = await openGame(server.url, { viewport: VIEWPORTS.phone, touch: true, seed: seedFresh() });
  const { page, context } = game;
  await context.addInitScript(() => {
    const Orig = window.AudioContext;
    if (!Orig || window.__ears) return;
    const ears = { ctx: null };
    Object.defineProperty(window, '__ears', { value: ears });
    window.AudioContext = class extends Orig { constructor(...a) { super(...a); ears.ctx = this; } };
  });
  await page.reload();
  const ui = makeUi(page, true);
  try {
    await openRecord(ui);
    await closeIntro(ui);
    const id = WING_TABLE.hyangga.shelf[2];
    await ui.press(`.play-song[data-song="${id}"]`);
    await ui.waitContext('잡기');
    await ui.press('.world-context');
    await ui.waitSel('.world.is-split .measure');
    for (let i = 0; i < 80 && (await ui.ev(() => document.querySelector('.measure')?.dataset.step)) === 'fold'; i++) {
      if (await ui.has('.measure .m-intro-ok')) { await ui.press('.measure .m-intro-ok'); continue; }
      const gap = await ui.ev(() => { const g = [...document.querySelectorAll('.measure .m-text button.m-gap:not(.is-folded)')].find((x) => x.dataset.u !== x.dataset.nu); return g ? g.dataset.i : null; });
      if (gap !== null) await ui.press(`.measure .m-text button.m-gap[data-i="${gap}"]`); else await sleep(100);
    }
    await ui.waitSel('.measure .m-listen');
    await ui.press('.measure .m-listen');
    // 낭송이 흐르면 지금 구가 밝게 바뀐다
    await ui.waitFn(() => !!document.querySelector('.measure .m-word.is-current'), null, 20000);
    const curA = await ui.ev(() => window.__ears.ctx.currentTime);
    await page.setViewportSize({ width: 390, height: 844 });
    await ui.waitFn(() => { const o = document.querySelector('.rotate-overlay'); return !!o && !o.hidden; }, null, 10000);
    const st = await ui.ev(() => {
      const o = document.querySelector('.rotate-overlay');
      const r = o.getBoundingClientRect();
      return { text: o.textContent.trim(), cover: r.width >= innerWidth - 1 && r.height >= innerHeight - 1, inert: document.getElementById('app').inert };
    });
    ok(st.text.includes('기기를 돌려 주세요') && st.cover, '세로로 돌리면 "기기를 돌려 주세요"가 화면을 덮는다 ' + JSON.stringify(st));
    ok(st.inert, '덮인 동안 뒤의 화면은 누를 수 없다(inert)');
    await sleep(400);
    const p1 = await ui.ev(() => ({ t: window.__ears.ctx.currentTime, s: window.__ears.ctx.state, cur: document.querySelector('.measure .m-word.is-current')?.dataset.i ?? null }));
    await sleep(1500);
    const p2 = await ui.ev(() => ({ t: window.__ears.ctx.currentTime, s: window.__ears.ctx.state, cur: document.querySelector('.measure .m-word.is-current')?.dataset.i ?? null }));
    ok(p1.s === 'suspended' && Math.abs(p2.t - p1.t) < 0.05, '세로인 동안 소리(낭송·박자 시계)가 멈춘다 ' + JSON.stringify({ p1, p2, curA }));
    ok(p1.cur === p2.cur, '세로인 동안 박자 진행이 멈춘다');
    const marker = await ui.ev(() => import('/js/world/world.js').then((w) => w.isPaused()));
    ok(marker === true, '세계 바탕도 멈춘 상태다');
    const layout = await page.evaluate(`(${uiScan.toString()})('.rotate-overlay')`);
    ok(layout.overflow.length === 0 && layout.contrast.length === 0, '회전 안내 화면: 넘침 없고 대비 4.5:1 이상 ' + JSON.stringify([...layout.overflow, ...layout.contrast]));
    await page.setViewportSize(VIEWPORTS.phone);
    await ui.waitFn(() => document.querySelector('.rotate-overlay')?.hidden === true, null, 10000);
    await ui.waitFn(() => window.__ears.ctx.state === 'running', null, 10000);
    const t3 = await ui.ev(() => window.__ears.ctx.currentTime);
    await sleep(800);
    const t4 = await ui.ev(() => window.__ears.ctx.currentTime);
    ok(t4 - t3 > 0.3 && !(await ui.ev(() => document.getElementById('app').inert)), '가로로 돌아오면 소리와 조작이 이어진다');
    await ui.waitFn(() => !!document.querySelector('.measure .m-word.is-current'), null, 20000);
    ok(true, '가로로 돌아오면 진행 중이던 구를 다시 들려준다');
    ok(game.errors.length === 0, '세로 회전: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
  } catch (e) {
    failures++;
    console.error('✗ 세로 회전 점검 중단: ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | '));
  } finally {
    await game.close();
  }
}

// ───────── 3·6·7. 화면마다: 넘침, 작은 누를 것, 대비 ─────────
async function scenesFor(server, vp, scale) {
  const tag = vp.label + ' 글자 ' + scale;
  const contrast = scale === 1;   // 대비는 글자 크기와 상관없다(크기 1에서 본다)
  const device = { textScale: scale };
  const touch = vp.touch;
  // A. 시작 → 설정 → 관(한 판 화면) → 수첩·일지·도감 → 재기 반반 화면 → 대화 상자 → 회랑
  {
    const game = await openGame(server.url, { viewport: vp.size, disable3d: vp.disable3d, touch, seed: seedFresh({ ...device, slashMode: true }) });
    const { page } = game;
    const ui = makeUi(page, touch);
    try {
      await ui.waitSel('.story-start', 30000);
      await scan(page, tag + ' 시작 화면', { contrast });
      await ui.press('.story-open-settings');
      await ui.waitSel('.story-settings');
      await scan(page, tag + ' 설정 화면', { contrast });
      await ui.press('.story-settings .story-settings-close');
      await openRecord(ui);
      await sleep(300);
      if (await ui.has('.story-wing-intro')) {
        await scan(page, tag + ' 관 들어가기 글', { contrast });
        await ui.press('.story-wing-intro .story-wing-intro-close');
      }
      await scan(page, tag + ' 관(한 판 화면)', { contrast });
      for (const p of ['notebook', 'journal', 'collection']) {
        await ui.press(`.play-btn[data-open="${p}"]`);
        await ui.waitSel(`.play-panel[data-panel="${p}"]`);
        await scan(page, tag + ' ' + { notebook: '『분류 수첩』', journal: '사서 일지', collection: '도감' }[p], { contrast });
        if (p === 'notebook' && scale === 1) {
          const cues = await ui.ev(() => window.__genreCues('.play-panel .play-nb-tab'));
          ok(cues.bad.length === 0, tag + ' 수첩 쪽은 갈래 이름표로 구분된다 ' + JSON.stringify(cues));
        }
        await ui.press('.play-panel .play-panel-close');
        await ui.waitGone('.play-panel');
      }
      await ui.press(`.play-song[data-song="${WING_TABLE.hyangga.shelf[0]}"]`);
      await ui.waitContext('잡기');
      await ui.press('.world-context');
      await ui.waitSel('.world.is-split .measure');
      await sleep(300);
      await scan(page, tag + ' 재기 반반 화면(접기)', { contrast });
      await ui.press('.measure .m-layer');
      await scan(page, tag + ' 재기 반반 화면(오늘 소리)', { contrast: false });
      await ui.press('.measure .m-layer');
      await ui.press('.measure .m-layer');
      await ui.press('.measure .m-book-btn, .measure .m-notebook-btn, .measure [aria-haspopup="dialog"]').catch(() => {});
      await sleep(200);
      await scan(page, tag + ' 재기 중 수첩', { contrast });
      await page.keyboard.press('Escape').catch(() => {});
      // 재기를 끝낸다(접기 → 빗금 → 문 → 감정서). 감정서에서 한 번 살핀다.
      if (await ui.has('.measure .m-drawer:not([hidden]) .m-drawer-close')) await ui.press('.measure .m-drawer:not([hidden]) .m-drawer-close');
      let sheetSeen = false;
      for (let i = 0; i < 300 && (await ui.has('.measure')); i++) {
        const n = await ui.ev(measureNext, { action: 'aa-door', tool: null, ranges: [], toolUsed: false });
        if (n.kind === 'done') break;
        if (n.kind === 'wait') { await sleep(100); continue; }
        if (n.kind === 'beat') throw new Error('박자 방식으로 열렸다(점검 기록은 빗금)');
        if (n.kind === 'sheet' && !sheetSeen) { sheetSeen = true; await scan(page, tag + ' 감정서', { contrast }); }
        await ui.press(n.sel, 8000).catch(() => {});
      }
      await ui.waitGone('.measure', 20000);
      await ui.press('.play-spine[data-area="shelf"][data-index="0"]');
      await ui.waitContext('꽂기');
      await ui.press('.world-context');
      await ui.waitSel('.play-dialog');
      await scan(page, tag + ' 꽂기 대화 상자', { contrast });
      await ui.press('.play-dialog .play-dialog-close');
      await ui.press('.play-btn-leave');
      await ui.waitFn(() => document.querySelector('.play')?.dataset.place === 'corridor', null, 20000);
      await sleep(300);
      await scan(page, tag + ' 회랑', { contrast });
      ok(game.errors.length === 0, tag + ' 관 화면들: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    } catch (e) {
      failures++;
      console.error('✗ ' + tag + ' 관 화면 점검 중단: ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | '));
    } finally {
      await game.close();
    }
  }
  // B. 작품 방(글자 1.3에서는 다섯 방 모두, 그 밖에는 하나)
  const rooms = scale === 1.3 ? PLAY_WING_IDS : [scale === 1 ? 'hyangga' : 'sijo'];
  for (const W of rooms) {
    const game = await openGame(server.url, { viewport: vp.size, disable3d: vp.disable3d, touch, seed: seedRoom(W, device) });
    const { page } = game;
    const ui = makeUi(page, touch);
    try {
      await openRecord(ui);
      await ui.waitFn((w) => document.querySelector('.play')?.dataset.place === w, W, 30000);
      await ui.press('.play-goto[data-anchor="roomDoor"]');
      await ui.waitContext('작품 방');
      await ui.press('.world-context');
      await ui.waitSel('.play-room .play-room-body > *', 30000);
      await sleep(1200);
      await scan(page, tag + ' 작품 방 「' + wingById(W).name + '」', { contrast });
      ok(game.errors.length === 0, tag + ' 작품 방 ' + W + ': 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    } catch (e) {
      failures++;
      console.error('✗ ' + tag + ' 작품 방 ' + W + ' 점검 중단: ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | '));
    } finally {
      await game.close();
    }
  }
  // C. 보스
  {
    const game = await openGame(server.url, { viewport: vp.size, disable3d: vp.disable3d, touch, seed: seedAllDone('stage1', { ...device, slashMode: true }) });
    const { page } = game;
    const ui = makeUi(page, touch);
    try {
      await openRecord(ui);
      await ui.waitSel('.story-boss-door');
      await scan(page, tag + ' 회랑의 보스 문', { contrast });
      await ui.press('.story-boss-door');
      await ui.waitSel('.story-boss-host .boss', 30000);
      const cov = await ui.ev(coverProblems, '.story-boss-host');
      ok(cov.length === 0, tag + ' 보스 화면이 회랑의 알림·위 띠를 덮는다 ' + JSON.stringify(cov));
      await ui.waitSel('.boss .boss-go, .boss .boss-song', 30000);
      await scan(page, tag + ' 보스 들어가기', { contrast });
      if (await ui.has('.boss .boss-go')) await ui.press('.boss .boss-go');
      await ui.waitSel('.boss .boss-song');
      await scan(page, tag + ' 보스 1단계', { contrast });
      if (scale === 1) {
        await injectScan(page);
        const cues = await ui.ev(() => window.__genreCues('.boss .boss-slot', '.boss-shape'));
        ok(cues.bad.length === 0, tag + ' 보스 관 자리는 모양과 이름표로 갈래를 구분한다 ' + JSON.stringify(cues.labels));
      }
      await ui.press('.boss .boss-journal-btn');
      await ui.waitSel('.boss .boss-journal:not([hidden])');
      await scan(page, tag + ' 보스 중 사서 일지', { contrast });
      await ui.press('.boss .boss-journal-close');
      await ui.press('.boss .boss-measure');
      await ui.waitSel('.boss .measure.is-boss');
      await sleep(300);
      await scan(page, tag + ' 보스 재기', { contrast });
      ok(game.errors.length === 0, tag + ' 보스: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    } catch (e) {
      failures++;
      console.error('✗ ' + tag + ' 보스 점검 중단: ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | '));
    } finally {
      await game.close();
    }
  }
  // D. 엔딩
  {
    const game = await openGame(server.url, { viewport: vp.size, disable3d: vp.disable3d, touch, seed: seedAllDone('done', device) });
    const { page } = game;
    const ui = makeUi(page, touch);
    try {
      await openRecord(ui);
      await ui.waitSel('.story-ending[data-step="return"]', 30000);
      const cov = await ui.ev(coverProblems, '.story-ending');
      ok(cov.length === 0, tag + ' 엔딩이 화면 전체를 덮는다(위 띠·회랑 장면이 비치지 않음) ' + JSON.stringify(cov));
      await scan(page, tag + ' 엔딩(돌아옴)', { contrast });
      await ui.press('.story-ending .story-next');
      await ui.waitSel('.story-ending[data-step="procession"]');
      await scan(page, tag + ' 엔딩(행렬)', { contrast });
      await ui.press('.story-ending .story-next');
      await ui.waitSel('.story-ending[data-step="write"]');
      await page.locator('.story-line-input').fill('노래 한 줄');
      await ui.press('.story-wing-choice [data-wing="sijo"]');
      await scan(page, tag + ' 엔딩(한 줄 짓기)', { contrast });
      if (scale === 1) {
        await injectScan(page);
        const cues = await ui.ev(() => window.__genreCues('.story-wing-choice [data-wing]'));
        ok(cues.bad.length === 0, tag + ' 엔딩의 관 고르기는 이름표로 구분된다 ' + JSON.stringify(cues.labels));
      }
      await ui.press('.story-concept-choice [data-concept="sijo-3jang"]');
      await ui.press('.story-shelve');
      await ui.waitSel('.story-ending[data-step="complete"] .card-view-download', 30000);
      await scan(page, tag + ' 엔딩(서고 완성과 마지막 카드)', { contrast });
      ok(game.errors.length === 0, tag + ' 엔딩: 콘솔 오류 없음 ' + game.errors.slice(0, 3).join(' | '));
    } catch (e) {
      failures++;
      console.error('✗ ' + tag + ' 엔딩 점검 중단: ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | '));
    } finally {
      await game.close();
    }
  }
}

// 바구니 행선지도 갈래 이름표로 고른다(색만이 아님)
async function checkBasketCues(server) {
  const game = await openGame(server.url, { viewport: VIEWPORTS.chromebook, disable3d: true, seed: seedFresh({ slashMode: true }) });
  const { page } = game;
  const ui = makeUi(page);
  try {
    await openRecord(ui);
    await closeIntro(ui);
    // 떠도는 노래 하나를 재어 손에 든다(빠르게: 길 잃은 시조 한 편)
    await ui.press('.play-song[data-song="cheongsanri-byeokgyesu"]');
    await ui.waitContext('잡기');
    await ui.press('.world-context');
    await ui.waitSel('.world.is-split .measure');
    for (let i = 0; i < 200 && (await ui.has('.measure')); i++) {
      const n = await ui.ev(() => {
        const root = document.querySelector('.measure');
        if (!root) return null;
        if (root.querySelector('.m-intro-ok')) return '.measure .m-intro-ok';
        const step = root.dataset.step;
        if (step === 'fold') { const g = [...root.querySelectorAll('.m-text button.m-gap:not(.is-folded)')].find((x) => x.dataset.u !== x.dataset.nu); if (g) return '.measure .m-text button.m-gap[data-i="' + g.dataset.i + '"]'; }
        if (step === 'tap') {
          const groups = new Map();
          for (const w of root.querySelectorAll('.m-text button.m-word')) { const k = w.dataset.u + '|' + w.dataset.f; if (!groups.has(k) || Number(w.dataset.w) > Number(groups.get(k).dataset.w)) groups.set(k, w); }
          const w = [...groups.values()].find((x) => !x.classList.contains('has-slash'));
          if (w) return '.measure .m-text button.m-word[data-i="' + w.dataset.i + '"]';
        }
        if (step === 'action') { const h = [...root.querySelectorAll('.m-text button.m-word.is-target')].find((w) => w.dataset.w === '0' && w.dataset.f === '0'); if (h) return '.measure .m-text button.m-word[data-i="' + h.dataset.i + '"]'; }
        if (step === 'sheet') return '.measure .m-finish';
        return 'wait';
      });
      if (n === null) break;
      if (n === 'wait') { await sleep(100); continue; }
      await ui.press(n).catch(() => {});
    }
    await ui.waitGone('.measure', 20000);
    await ui.press('.play-spine[data-area="basket"][data-index="0"]');
    await ui.waitContext('꽂기');
    await ui.press('.world-context');
    await ui.press('.play-dialog .play-pick[data-song="cheongsanri-byeokgyesu"]');
    await ui.waitSel('.play-dialog .play-dest');
    await injectScan(page);
    const cues = await ui.ev(() => window.__genreCues('.play-dialog .play-dest'));
    ok(cues.bad.length === 0, '바구니의 갈 관 고르기는 관 이름표로 구분된다 ' + JSON.stringify(cues.labels));
    await scan(page, '2D 1366 바구니 행선지 대화 상자');
  } catch (e) {
    failures++;
    console.error('✗ 바구니 행선지 점검 중단: ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | '));
  } finally {
    await game.close();
  }
}

// ───────── 음성 사례: 검사가 실제 실패를 잡는다 ─────────
async function negatives(server) {
  console.log('── 음성 사례: 검사 도우미');
  const game = await openGame(server.url, { viewport: VIEWPORTS.chromebook, disable3d: true });
  const { page } = game;
  try {
    await page.waitForSelector('.story-start', { timeout: 30000 });
    await injectScan(page);
    const clean = await page.evaluate(() => window.__uiScan('.story-start'));
    ok(Object.values(clean).every((v) => v.length === 0), '아무것도 넣지 않은 시작 화면은 검사를 통과한다 ' + JSON.stringify(clean));
    const r = await page.evaluate(() => {
      const box = document.createElement('div');
      box.className = 'neg-box';
      box.style.cssText = 'position:fixed;left:10px;top:10px;width:300px;height:200px;background:#f3ead6;z-index:99';
      box.innerHTML = '<p class="neg-low" style="color:#bdb6a6;margin:0">흐린 글</p>'
        + '<button class="neg-small" style="min-width:0;min-height:0;width:30px;height:30px;padding:0">작</button>'
        + '<div class="neg-clip" style="width:40px;height:20px;overflow:hidden;white-space:nowrap">아주 긴 글이 잘린다 아주 긴 글</div>'
        + '<p class="neg-off" style="position:fixed;left:-300px;top:40px;margin:0">화면 밖 글</p>';
      const pic = document.createElement('div');
      pic.className = 'neg-pic';
      pic.style.cssText = 'position:fixed;left:400px;top:10px;width:200px;height:100px;background-image:linear-gradient(#000,#fff);z-index:99';
      pic.innerHTML = '<span class="neg-over" style="color:#2b2b2b">그림 위 글</span>';
      document.body.append(box, pic);
      const out = window.__uiScan('.neg-box, .neg-pic');
      box.remove();
      pic.remove();
      return out;
    });
    ok(r.contrast.some((x) => x.includes('흐린 글')), '(음성) 대비가 낮은 글을 잡는다 ' + JSON.stringify(r.contrast));
    ok(r.small.some((x) => x.includes('neg-small')), '(음성) 48px 미만 단추를 잡는다');
    ok(r.clipped.some((x) => x.includes('neg-clip')), '(음성) 잘린 글을 잡는다');
    ok(r.overflow.some((x) => x.includes('neg-off')), '(음성) 화면 밖 요소를 잡는다');
    ok(r.scene.some((x) => x.includes('그림 위 글')), '(음성) 받침 색 없이 그림 위에 놓인 글을 잡는다');
    const coverNeg = await page.evaluate(`(() => {
      const scene = document.createElement('section');
      scene.className = 'neg-scene';
      scene.style.cssText = 'position:fixed;left:0;right:0;top:60px;bottom:0;background:#2b2b2b;z-index:50';
      const t = document.createElement('p');
      t.className = 'story-toast';
      t.textContent = '남은 알림';
      t.style.cssText = 'position:fixed;top:100px;left:100px;z-index:60;background:#2b2b2b;color:#f3ead6';
      document.body.append(scene, t);
      const out = (${coverProblems.toString()})('.neg-scene');
      scene.remove(); t.remove();
      return out;
    })()`);
    ok(coverNeg.some((x) => x.startsWith('화면 전체를 덮지 않음')) && coverNeg.some((x) => x.includes('남은 알림')), '(음성) 화면을 다 덮지 않는 장면과 그 위에 남은 알림을 잡는다 ' + JSON.stringify(coverNeg));
    const cue = await page.evaluate(() => {
      const box = document.createElement('div');
      box.className = 'neg-slots';
      for (const c of ['#2f7d6d', '#c4462f', '#b88a2a', '#5a5650', '#2b2b2b']) {
        const b = document.createElement('button');
        b.className = 'neg-slot';
        b.style.cssText = 'width:60px;height:60px;background:' + c;
        b.innerHTML = '<svg class="boss-shape" viewBox="0 0 32 32"><path d="M4 16h24"/></svg>';
        box.append(b);
      }
      document.body.append(box);
      const out = window.__genreCues('.neg-slot', '.boss-shape');
      box.remove();
      return out;
    });
    ok(cue.bad.length >= 2, '(음성) 색만 다르고 모양·이름표가 같은 갈래 자리를 잡는다 ' + JSON.stringify(cue.bad));
  } finally {
    await game.close();
  }
}

// ───────── 실행 ─────────
const VPS = [
  { label: '844×390', size: VIEWPORTS.phone, disable3d: false, touch: true },
  { label: '1366×768', size: VIEWPORTS.chromebook, disable3d: false, touch: false },
];

const server = await startServer();
const started = Date.now();
try {
  await negatives(server);
  await checkSettings(server);
  await checkReduceMotion(server);
  await checkPortrait(server);
  await checkBasketCues(server);
  for (const vp of VPS) {
    for (const scale of SCALES) {
      console.log('\n── 화면 ' + vp.label + ', 글자 크기 ' + scale);
      await scenesFor(server, vp, scale);
    }
  }
  const ext = server.requests.filter((r) => !r.startsWith('/'));
  ok(ext.length === 0, '서버 밖 요청 없음');
} catch (e) {
  failures++;
  console.error('✗ 점검 도중 오류: ' + (e?.stack ?? e));
} finally {
  await server.close();
}
console.log('\n걸린 시간 ' + Math.round((Date.now() - started) / 1000) + '초');
if (failures) {
  console.error('\n화면 점검 실패 ' + failures + '건');
  process.exit(1);
}
console.log('\n화면 점검 통과');
