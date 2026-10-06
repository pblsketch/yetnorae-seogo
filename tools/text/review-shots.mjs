// 글 확인 문서에 넣을 보스전·엔딩 화면 그림을 만든다(spec 16.4). 결과: docs/images/*.png
//
//   node tools/text/review-shots.mjs
//
// 점검 도구(tests/lib/server.mjs의 로컬 서버, tests/lib/browser.mjs의 설치된 Chrome)를 쓴다. Playwright는 tests/node_modules에 있다
// (처음 한 번 `cd tests && npm ci`). 장면에 가려고 이 도구 안에서만 로컬 저장소에 기록을 넣는다(제품에는 그런 입구가 없다).
// 그림은 1024×576으로 찍고, 문서가 무겁지 않게 Python(Pillow)으로 128색 PNG로 줄인다(없으면 그대로 둔다).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../tests/lib/server.mjs';
import { openGame } from '../../tests/lib/browser.mjs';
import { defaultData, defaultProgress, SAVE_KEY } from '../../js/core/save.js';
import { WING_TABLE, ROUTING, BOSS_TABLE } from '../../js/data/song-table.js';
import { CONCEPTS } from '../../js/data/concepts.js';
import { PLAY_WING_IDS } from '../../js/data/wings.js';
import { SHOTS } from './review-doc.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const OUT = path.join(ROOT, 'docs', 'images');
const VIEWPORT = { width: 1024, height: 576 };

// ───────── 기록 넣기(이 도구 안에서만) ─────────
const fixed = (ids) => ids.map((songId) => ({ songId, fixed: true }));
function doneWing(w) {
  return {
    state: 'done', shelfBound: true, basketDone: true, roomDone: true, bonusDone: false, uniqueActionIntroSeen: true,
    doneAt: '2026-10-01T09:00:00.000Z',
    placements: { shelf: fixed(WING_TABLE[w].shelf), basket: WING_TABLE[w].stray.map((s) => ({ songId: s.songId, to: s.to, fixed: true })), bonus: [null, null, null] },
    wrongCount: 0, measured: [...WING_TABLE[w].shelf, ...WING_TABLE[w].stray.map((s) => s.songId)],
  };
}
const ROOM_RECORDS = {
  hyangga: { room: 'hyangga', interpretationId: 'both', interpretationText: '슬픔과 다짐이 함께 있다', isInterpretation: true },
  goryeo: { room: 'goryeo', lastConditionId: 'a', lastConditionText: '구운 밤에 싹이 나면' },
  sijo: { room: 'sijo', rooms: ['na', 'dal', 'cheongpung'], outside: ['gangsan'], interpretationId: 'as-written', interpretationText: '쓰인 그대로', isInterpretation: true },
  gasa: { room: 'gasa', words: ['도화', '녹양방초'] },
  saseol: { room: 'saseol', predictionId: 'nim', predictionText: '님이 오셨다' },
};
function seed({ bossState = 'stage1', bossDone = false } = {}) {
  const data = defaultData();
  data.device.calibrated = true;
  data.device.slashMode = true;
  data.device.reduceMotion = true;
  data.device.muted = true;
  const p = defaultProgress();
  p.tutorialDone = true;
  for (const w of PLAY_WING_IDS) {
    p.wings[w] = doneWing(w);
    p.rooms[w] = ROOM_RECORDS[w];
    p.keepsakes.push(...WING_TABLE[w].shelf);
  }
  p.prewaiting = JSON.parse(JSON.stringify(ROUTING.prewait));
  p.returned = JSON.parse(JSON.stringify(ROUTING.returned));
  for (const c of CONCEPTS) p.concepts[c.id] = { state: 'ink', songs: WING_TABLE[c.genre].shelf.slice(0, 2) };
  p.boss.state = bossDone ? 'done' : bossState;
  if (bossDone || bossState !== 'stage1') {
    for (const g of BOSS_TABLE.unseenOrder) {
      p.boss.unseen[BOSS_TABLE.unseen[g]] = { done: true, firstTryCorrect: g !== 'gasa', journalHelp: g === 'gasa', singerGroupCorrect: g !== 'saseol' };
    }
  }
  const id = 's-review';
  data.slots[id] = { id, name: '확인', appearance: 'a', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', progress: p };
  data.lastSlotId = id;
  return { [SAVE_KEY]: JSON.stringify(data) };
}

// ───────── 페이지 도우미 ─────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitSel = (page, sel, timeout = 30000) => page.waitForFunction((s) => !!document.querySelector(s), sel, { timeout, polling: 100 });
const click = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
async function shot(page, name) {
  await sleep(700);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file });
  console.log('  찍음 docs/images/' + name);
}
async function openRecord(server, s) {
  const g = await openGame(server.url, { viewport: VIEWPORT, seed: s });
  await waitSel(g.page, '.story-start');
  await click(g.page, '.story-record .story-record-open');
  return g;
}
async function toBoss(server, bossState) {
  const g = await openRecord(server, seed({ bossState }));
  await waitSel(g.page, '.story-boss-door');
  // 회랑의 알림 한 줄이 사라진 뒤에 문을 연다(알림이 보스 화면 그림을 가리지 않게)
  await g.page.waitForFunction(() => !document.querySelector('.story-toast'), null, { timeout: 30000, polling: 200 });
  await click(g.page, '.story-boss-door');
  await waitSel(g.page, `.story-boss-host .boss[data-stage="${bossState}"] .boss-go`);
  return g;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const problems = [];
  const run = async (label, fn) => {
    let g = null;
    try { g = await fn(); if (g.external.length) problems.push(label + ': 바깥 요청 ' + g.external.join(', ')); if (g.errors.length) problems.push(label + ': 콘솔 오류 ' + g.errors.join(' | ')); }
    catch (e) { problems.push(label + ': ' + e.message); }
    finally { await g?.close(); }
  };
  try {
    console.log('보스전');
    await run('첫째 밤', async () => {
      const g = await toBoss(server, 'stage1');
      await shot(g.page, 'boss-1-intro.png');
      await click(g.page, '.boss .boss-go');
      await waitSel(g.page, '.boss .boss-song[data-song]');
      await shot(g.page, 'boss-1-song.png');
      return g;
    });
    await run('둘째 밤', async () => {
      const g = await toBoss(server, 'stage2');
      await shot(g.page, 'boss-2-intro.png');
      await click(g.page, '.boss .boss-go');
      await sleep(2500);
      await shot(g.page, 'boss-2-remix.png');
      return g;
    });
    await run('셋째 밤', async () => {
      const g = await toBoss(server, 'stage3');
      await shot(g.page, 'boss-3-intro.png');
      await click(g.page, '.boss .boss-go');
      await sleep(2500);
      await shot(g.page, 'boss-3-king.png');
      return g;
    });
    console.log('엔딩');
    await run('엔딩', async () => {
      const g = await openRecord(server, seed({ bossDone: true }));
      const { page } = g;
      await waitSel(page, '.story-ending[data-step="return"]');
      await shot(page, 'ending-1-return.png');
      await click(page, '.story-ending .story-next');
      await waitSel(page, '.story-ending[data-step="procession"]');
      await shot(page, 'ending-2-procession.png');
      await click(page, '.story-ending .story-next');
      await waitSel(page, '.story-ending[data-step="write"]');
      await page.locator('.story-line-input').fill('바람 부는 서고에 내 노래 한 줄');
      await click(page, '.story-wing-choice [data-wing="gasa"]');
      await click(page, '.story-concept-choice [data-concept="gasa-nolimit"]');
      await page.locator('.story-note-input').fill('오래 걸어도 끝나지 않는 노래');
      await shot(page, 'ending-3-write.png');
      await click(page, '.story-shelve');
      await waitSel(page, '.story-ending[data-step="complete"] .card-view-download');
      await shot(page, 'ending-4-complete.png');
      return g;
    });
  } finally {
    await server.close();
  }
  // 128색으로 줄이기
  const names = Object.values(SHOTS).flat().map(([f]) => f);
  const py = spawnSync('python', ['-c', [
    'import sys', 'from PIL import Image',
    'for p in sys.argv[1:]:',
    '    im = Image.open(p).convert("RGB")',
    '    im.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(p, optimize=True)',
  ].join('\n'), ...names.map((n) => path.join(OUT, n)).filter((p) => fs.existsSync(p))], { encoding: 'utf8', windowsHide: true });
  if (py.status !== 0) console.log('  (128색으로 줄이지 못함 — Python Pillow가 필요하다) ' + (py.stderr ?? '').slice(0, 200));
  const missing = names.filter((n) => !fs.existsSync(path.join(OUT, n)));
  const total = names.filter((n) => fs.existsSync(path.join(OUT, n))).reduce((a, n) => a + fs.statSync(path.join(OUT, n)).size, 0);
  console.log(`그림 ${names.length - missing.length}/${names.length}장, 모두 ${Math.round(total / 1024)}KB`);
  if (missing.length) problems.push('찍지 못한 그림: ' + missing.join(', '));
  if (problems.length) { console.log('문제:\n  ' + problems.join('\n  ')); return 1; }
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
