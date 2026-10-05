// 결과 카드 점검(T19, spec 9·10.2·12·13).
// 점검 도구가 실제와 같은 모양의 기록(다섯 작품 방 기록, 보스 노래별 기록, 40자 한 줄, 60자 한마디, 생김새 b)을
// 로컬 저장소에 넣고, 결과 카드 화면에서 판 카드와 마지막 카드를 실제로 내려받는다.
// 내려받은 PNG의 서명·크기, 파일 이름, 그린 글 목록(그리는 쪽이 남긴 배치 기록), 화소, 잘림, 점수 말,
// 덤을 한 뒤 다시 내려받으면 덤 줄이 바뀌는지, 글자 크기 설정과 상관없는 배치를 확인한다.
// 점검 페이지 tests/pages/card.html이 카드 화면만 단독으로 띄운다(제품 흐름에는 없다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './lib/server.mjs';
import { openGame, assert, VIEWPORTS } from './lib/browser.mjs';
import { SAVE_KEY, SAVE_VERSION, defaultDevice, defaultProgress, normalizeData } from '../js/core/save.js';
import { buildWingCard, buildFinalCard } from '../js/core/cards.js';
import { SONG_TABLE } from '../js/data/song-table.js';
import { PLAY_WING_IDS, wingById } from '../js/data/wings.js';
import { CONCEPTS } from '../js/data/concepts.js';
import { songs } from '../js/data/songs/index.js';

const PAGE = 'tests/pages/card.html';
const W = 1600;
const H = 900;
const NAME = '달빛사서';
const SLOT = 's-test-card';
const FORBIDDEN = ['점', '점수', '등급', '순위'];

const chars = (s) => [...s].length;

// ── 실제와 같은 모양의 기록 만들기 ──

// 40자 한 줄과 60자 한마디(띄어쓰기 포함 글자 수). 길이를 맞춰 자른다.
const LONG_LINE = [...'서고 창가에 달이 오르면 옛 노래를 꺼내어 한 줄씩 다시 불러 보는 밤이 참 좋다 오래오래'].slice(0, 40).join('');
const LONG_NOTE = [...'종장 첫 음보가 세 글자로 시작하니 시조관이 이 노래의 집이라고 생각했고 친구들도 이 한 줄을 읽어 주면 좋겠다 그리고 또'].slice(0, 60).join('');

function sangchungokWords() {
  const s = songs.find((x) => x.id === 'sangchungok');
  return s.units.slice(0, 3).map((u) => u.feet[0].reading);
}

const ROOMS = {
  hyangga: { room: 'hyangga', interpretationId: 'vow', interpretationText: '다시 만날 날을 믿고 길을 닦으며 견디겠다는 다짐으로 읽었다', isInterpretation: true },
  goryeo: { room: 'goryeo', lastConditionId: 'iron-robe', lastConditionText: '무쇠로 지은 옷이 다 헐어 해어진다면' },
  sijo: { room: 'sijo', rooms: ['na', 'dal', 'cheongpung'], outside: ['gangsan'], interpretationId: 'original', interpretationText: '나와 달과 바람을 들이고 강산은 둘러 두니 욕심 없이 자연과 하나 된 삶이 보인다', isInterpretation: true },
  gasa: { room: 'gasa', words: sangchungokWords() },
  saseol: { room: 'saseol', predictionId: 'other-person', predictionText: '다른 사람' },
};

// 낯선 노래 다섯의 기록을 서로 다르게 둔다(모든 값의 글이 한 번씩 나오도록).
const UNSEEN = {
  gapminga: { done: true, firstTryCorrect: true, journalHelp: false, singerGroupCorrect: true },
  wonwangsaengga: { done: true, firstTryCorrect: false, journalHelp: true, singerGroupCorrect: true },
  samogok: { done: true, firstTryCorrect: true, journalHelp: false, singerGroupCorrect: false },
  'sinheum-sijo': { done: true, firstTryCorrect: false, journalHelp: false, singerGroupCorrect: true },
  'suneung-saseol': { done: true, firstTryCorrect: false, journalHelp: true, singerGroupCorrect: false },
};

// 연필에 머문 개념(나머지는 먹). 저장 엔진은 확인한 노래 수로도 상태를 다시 계산하므로 노래 수를 맞춘다.
const PENCIL = ['sijo-final3', 'gasa-nolimit'];

function seedRecord() {
  const p = defaultProgress();
  p.tutorialDone = true;
  PLAY_WING_IDS.forEach((w, i) => {
    const t = SONG_TABLE.wings[w];
    const ws = p.wings[w];
    Object.assign(ws, { state: 'done', shelfBound: true, basketDone: true, roomDone: true, bonusDone: w !== 'sijo', uniqueActionIntroSeen: true });
    ws.doneAt = `2026-10-0${i + 1}T03:00:00.000Z`;
    ws.placements.shelf = t.shelf.map((songId) => ({ songId, fixed: true }));
    ws.placements.basket = t.stray.map((s) => ({ songId: s.songId, to: s.to, fixed: true }));
    ws.placements.bonus = w === 'sijo' ? [null, null, null] : t.bonus.map((songId) => ({ songId, fixed: true }));
    ws.wrongCount = i;
    ws.measured = [...t.shelf];
  });
  for (const c of CONCEPTS) {
    const genreSongs = songs.filter((s) => s.genre === c.genre).map((s) => s.id);
    p.concepts[c.id] = PENCIL.includes(c.id) ? { state: 'pencil', songs: genreSongs.slice(0, 1) } : { state: 'ink', songs: genreSongs.slice(0, 2) };
  }
  p.rooms = JSON.parse(JSON.stringify(ROOMS));
  p.boss.state = 'done';
  p.boss.unseen = JSON.parse(JSON.stringify(UNSEEN));
  p.ending = { line: LONG_LINE, wing: 'sijo', conceptId: 'sijo-3jang', note: LONG_NOTE, completed: true, completedAt: '2026-10-05T03:00:00.000Z' };
  return { id: SLOT, name: NAME, appearance: 'b', createdAt: '2026-09-28T03:00:00.000Z', updatedAt: '2026-10-05T03:00:00.000Z', progress: p };
}

function seedData() {
  return { version: SAVE_VERSION, device: { ...defaultDevice(), textScale: 1.3 }, slots: { [SLOT]: seedRecord() }, lastSlotId: SLOT };
}

// ── 검사 도우미 ──

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// PNG 서명과 IHDR의 가로·세로. PNG가 아니면 null.
function pngSize(buf) {
  if (!buf || buf.length < 24) return null;
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIG[i]) return null;
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const textItems = (layout) => layout.items.filter((it) => it.type === 'text');
const drawnStrings = (layout) => textItems(layout).flatMap((it) => it.lines.map((l) => l.text));
const byRole = (layout, role) => textItems(layout).filter((it) => it.role === role);
const oneRole = (layout, role, ref) => textItems(layout).find((it) => it.role === role && (ref === undefined || it.ref === ref));
const squash = (s) => s.replace(/\s+/g, '');

// 점수 말이 들어간 그린 글 목록.
function scoreWords(layout) {
  return drawnStrings(layout).filter((s) => FORBIDDEN.some((w) => s.includes(w)));
}

// 잘림·넘침·겹침 문제 목록.
function layoutProblems(layout) {
  const out = [];
  if (layout.width !== W || layout.height !== H) out.push('카드 크기 ' + layout.width + 'x' + layout.height);
  const rects = [];
  textItems(layout).forEach((it, idx) => {
    const b = it.box;
    if (!it.lines?.length) { out.push('줄 없음: ' + it.role); return; }
    if (squash(it.lines.map((l) => l.text).join('')) !== squash(it.text)) out.push('글이 잘렸다: ' + it.role + ' «' + it.text + '»');
    if (b.x < 0 || b.y < 0 || b.x + b.w > W + 0.5 || b.y + b.h > H + 0.5) out.push('상자가 카드 밖: ' + it.role);
    if (!(it.size >= 14)) out.push('글자가 너무 작다: ' + it.role + ' ' + it.size);
    for (const l of it.lines) {
      if (l.x < b.x - 0.5 || l.x + l.w > b.x + b.w + 0.5 || l.y < b.y - 0.5 || l.y + l.h > b.y + b.h + 0.5) out.push('줄이 상자 밖: ' + it.role + ' «' + l.text + '» w=' + Math.round(l.w) + '/' + Math.round(b.w));
      if (l.x < 0 || l.x + l.w > W || l.y < 0 || l.y + l.h > H) out.push('줄이 카드 밖: ' + it.role);
      rects.push({ idx, role: it.role, text: l.text, ...l });
    }
  });
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const c = rects[j];
      if (a.idx === c.idx) continue;
      const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
      const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
      if (ox > 1 && oy > 1) out.push('글이 겹친다: «' + a.text + '» / «' + c.text + '»');
    }
  }
  return out;
}

// 그린 글 상자마다 바탕과 다른 화소가 있는지(내려받은 PNG를 다시 풀어 센다).
async function inkProblems(page, b64, layout) {
  const lines = textItems(layout).flatMap((it) => it.lines.map((l) => ({ role: it.role, text: l.text, x: l.x, y: l.y, w: l.w, h: l.h })));
  const images = layout.items.filter((it) => it.type === 'image');
  const boxes = [...lines, ...images];
  const counts = await page.evaluate(([b, bx]) => window.__t.inkCounts(b, bx), [b64, boxes]);
  const out = [];
  boxes.forEach((b, i) => {
    const need = b.type === 'image' ? 200 : Math.max(4, Math.min(30, chars(squash(b.text ?? '')) * 3));
    if (counts[i] < need) out.push('그려지지 않음: ' + (b.role ?? b.name) + ' «' + (b.text ?? b.name) + '» ' + counts[i]);
  });
  return out;
}

async function download(page, selector, dir) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click(selector)]);
  const name = dl.suggestedFilename();
  const file = path.join(dir, String(Date.now()) + '-' + Math.random().toString(36).slice(2) + '.png');
  await dl.saveAs(file);
  const buf = fs.readFileSync(file);
  return { name, buf, b64: buf.toString('base64') };
}

async function viewLayout(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__view.layout)));
}

// ── 점검 ──

const server = await startServer();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'card-'));
let game;
try {
  // 0) 넣을 기록이 저장 엔진을 거쳐도 그대로 남는지(관 다섯 완료, 서고 완성, 시조관 덤은 아직)
  const normalized = normalizeData(seedData()).slots[SLOT];
  assert(PLAY_WING_IDS.every((w) => normalized.progress.wings[w].state === 'done'), '넣을 기록: 다섯 관이 모두 끝남');
  assert(normalized.progress.ending.completed === true && normalized.progress.boss.state === 'done', '넣을 기록: 서고 완성');
  assert(normalized.progress.wings.sijo.bonusDone === false, '넣을 기록: 시조관 덤은 아직');
  assert(chars(LONG_LINE) === 40 && chars(LONG_NOTE) === 60, '한 줄 40자, 한마디 60자');
  const expectWing = buildWingCard(normalized, 'sijo');
  const expectFinal = buildFinalCard(normalized);
  assert(expectWing && expectFinal, '카드 자료가 만들어진다');

  game = await openGame(server.url, { path: PAGE, seed: { [SAVE_KEY]: seedData() }, viewport: VIEWPORTS.chromebook });
  const { page } = game;
  await page.waitForFunction(() => window.__t?.ready === true, null, { timeout: 20000 });
  const scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim());
  assert(scale === '1.3', '기기 설정의 글자 크기 1.3이 화면에 적용됨');

  // 1) 판 카드(시조관): 화면에 띄우고 내려받기
  await page.evaluate(() => {
    window.__view = window.__t.showCard(document.getElementById('app'), () => window.__t.wingCard('sijo'));
    return window.__view.ready;
  });
  const btn = await page.evaluate(() => {
    const b = document.querySelector('.card-view-download');
    const r = b.getBoundingClientRect();
    return { w: r.width, h: r.height, text: b.textContent.trim() };
  });
  assert(btn.w >= 48 && btn.h >= 48, '내려받기 버튼이 48px 이상 (' + Math.round(btn.w) + 'x' + Math.round(btn.h) + ')');
  assert(btn.text.length > 0 && !FORBIDDEN.some((w) => btn.text.includes(w)), '내려받기 버튼 글: ' + btn.text);

  const wing1 = await download(page, '.card-view-download', tmp);
  assert(wing1.name === '옛노래서고_' + NAME + '_시조관.png', '판 카드 파일 이름: ' + wing1.name);
  const size1 = pngSize(wing1.buf);
  assert(size1 && size1.width === W && size1.height === H, '판 카드 PNG 서명과 크기 ' + JSON.stringify(size1));
  const wl1 = await viewLayout(page);
  assert(layoutProblems(wl1).length === 0, '판 카드: 잘림·넘침·겹침 없음 ' + layoutProblems(wl1).join(' | '));
  assert(oneRole(wl1, 'record-name')?.text === NAME, '판 카드: 기록 이름');
  assert(oneRole(wl1, 'wing-name')?.text === '시조관', '판 카드: 관 이름');
  const shelf = byRole(wl1, 'shelf-song').map((it) => it.text);
  assert(expectWing.shelfSongs.every((s) => shelf.some((t) => t.includes(s.title))) && shelf.length === 3, '판 카드: 꽂은 칸 노래 세 편 ' + shelf.join(', '));
  for (const c of expectWing.concepts) {
    const label = { ink: '먹', pencil: '연필', none: '아직' }[c.state];
    assert(oneRole(wl1, 'concept', c.id)?.text === c.text && oneRole(wl1, 'concept-state', c.id)?.text === label, '판 카드: 개념 «' + c.text + '» ' + label);
  }
  assert(oneRole(wl1, 'room-text', 'interpretation')?.text === ROOMS.sijo.interpretationText, '판 카드: 작품 방 해석 문장');
  assert(byRole(wl1, 'interpretation-tag').some((it) => it.text === '해석'), "판 카드: '해석' 표시");
  assert(oneRole(wl1, 'room-text', 'rooms')?.text === '나 · 달 · 청풍' && oneRole(wl1, 'room-text', 'outside')?.text === '강산', '판 카드: 세 칸 배치와 집 밖');
  assert(byRole(wl1, 'room-title')[0]?.text.includes('십 년을 경영하야'), '판 카드: 작품 방 제목');
  const bonusBefore = oneRole(wl1, 'bonus')?.text;
  assert(bonusBefore === '덤 칸은 아직 비어 있다', '판 카드: 덤 아직 — ' + bonusBefore);
  assert(/2026년 10월 3일/.test(oneRole(wl1, 'date')?.text ?? ''), '판 카드: 만든 날짜 ' + oneRole(wl1, 'date')?.text);
  const student1 = wl1.items.find((it) => it.type === 'image' && it.role === 'student');
  assert(student1?.name === 'sprite/student-b', '판 카드: 고른 생김새 b의 학생 그림');
  assert(scoreWords(wl1).length === 0, '판 카드: 점수 말 없음 ' + scoreWords(wl1).join(','));
  const ink1 = await inkProblems(page, wing1.b64, wl1);
  assert(ink1.length === 0, '판 카드 PNG: 글 상자와 학생 그림 자리에 실제로 그려짐 ' + ink1.slice(0, 5).join(' | '));

  // 2) 덤을 한 뒤 다시 내려받으면 지금의 기록으로 다시 그린다
  await page.evaluate((key) => {
    const d = JSON.parse(localStorage.getItem(key));
    const ws = d.slots[d.lastSlotId].progress.wings.sijo;
    ws.bonusDone = true;
    ws.placements.bonus = ['ihwa-wolbaek', 'hanson-makdae', 'sakpung'].map((songId) => ({ songId, fixed: true }));
    localStorage.setItem(key, JSON.stringify(d));
  }, SAVE_KEY);
  const wing2 = await download(page, '.card-view-download', tmp);
  const wl2 = await viewLayout(page);
  assert(wing2.name === wing1.name, '다시 내려받기: 같은 파일 이름');
  assert(oneRole(wl2, 'bonus')?.text === '덤 칸도 채웠다', '다시 내려받기: 덤 줄이 바뀜 — ' + oneRole(wl2, 'bonus')?.text);
  assert(!wing2.buf.equals(wing1.buf), '다시 내려받기: 그림이 새로 그려짐');
  assert(pngSize(wing2.buf)?.width === W, '다시 내려받기: PNG');

  // 3) 다섯 판 카드 모두: 작품 방 기록의 종류마다 글이 들어가고 잘리지 않는다
  const roomExpect = {
    hyangga: [['interpretation', ROOMS.hyangga.interpretationText]],
    goryeo: [['condition', ROOMS.goryeo.lastConditionText]],
    sijo: [['interpretation', ROOMS.sijo.interpretationText]],
    gasa: [['words', ROOMS.gasa.words.join(' · ')]],
    saseol: [['prediction', ROOMS.saseol.predictionText]],
  };
  for (const w of PLAY_WING_IDS) {
    const lay = await page.evaluate(async (id) => {
      const { layout } = await window.__t.card.renderCard(window.__t.wingCard(id));
      return JSON.parse(JSON.stringify(layout));
    }, w);
    const probs = layoutProblems(lay);
    const okRoom = roomExpect[w].every(([ref, text]) => oneRole(lay, 'room-text', ref)?.text === text);
    const hasTag = w === 'hyangga' || w === 'sijo' ? byRole(lay, 'interpretation-tag').length > 0 : byRole(lay, 'interpretation-tag').length === 0;
    assert(probs.length === 0 && okRoom && hasTag && oneRole(lay, 'wing-name')?.text === wingById(w).name && scoreWords(lay).length === 0,
      wingById(w).name + ' 판 카드: 작품 방 기록·해석 표시·잘림 없음 ' + probs.join(' | '));
  }

  // 4) 마지막 카드
  await page.evaluate(() => {
    window.__view.dispose();
    window.__view = window.__t.showCard(document.getElementById('app'), () => window.__t.finalCard());
    return window.__view.ready;
  });
  const fin = await download(page, '.card-view-download', tmp);
  assert(fin.name === '옛노래서고_' + NAME + '_마지막.png', '마지막 카드 파일 이름: ' + fin.name);
  const fsz = pngSize(fin.buf);
  assert(fsz && fsz.width === W && fsz.height === H, '마지막 카드 PNG 서명과 크기 ' + JSON.stringify(fsz));
  const fl = await viewLayout(page);
  assert(layoutProblems(fl).length === 0, '마지막 카드: 잘림·넘침·겹침 없음 ' + layoutProblems(fl).join(' | '));
  assert(oneRole(fl, 'record-name')?.text === NAME, '마지막 카드: 기록 이름');
  assert(oneRole(fl, 'complete')?.text === '서고 완성', "마지막 카드: '서고 완성'");
  const doneMarks = byRole(fl, 'wing-done');
  assert(doneMarks.length === 5 && doneMarks.every((it) => it.done === true) && PLAY_WING_IDS.every((w) => doneMarks.some((it) => it.ref === w && it.text === wingById(w).name)), '마지막 카드: 다섯 관 완료 표시');
  const inkTexts = byRole(fl, 'ink-concept').map((it) => it.text);
  assert(inkTexts.length === CONCEPTS.length - PENCIL.length && expectFinal.inkConcepts.every((c) => inkTexts.includes(c.text)) && !PENCIL.some((id) => inkTexts.includes(CONCEPTS.find((c) => c.id === id).text)), '마지막 카드: 먹 개념 목록(연필 개념은 빠짐) ' + inkTexts.length);
  const FIRST = { true: '맞힘', false: '다시 꽂음' };
  const HELP = { true: '받음', false: '안 받음' };
  const SINGER = { true: '맞힘', false: '못 맞힘' };
  for (const b of expectFinal.boss) {
    const u = UNSEEN[b.songId];
    const ok = oneRole(fl, 'boss-title', b.songId)?.text === b.title
      && oneRole(fl, 'boss-first', b.songId)?.text === FIRST[u.firstTryCorrect]
      && oneRole(fl, 'boss-help', b.songId)?.text === HELP[u.journalHelp]
      && oneRole(fl, 'boss-singer', b.songId)?.text === SINGER[u.singerGroupCorrect];
    assert(ok, '마지막 카드: 낯선 노래 «' + b.title + '» 처음에·일지 도움·누가 불렀을까');
  }
  const order = byRole(fl, 'boss-title').map((it) => it.ref);
  assert(JSON.stringify(order) === JSON.stringify(expectFinal.boss.map((b) => b.songId)), '마지막 카드: 낯선 노래 순서가 보스 순서');
  const line = oneRole(fl, 'ending-line');
  assert(line?.text === LONG_LINE && line.lines.length >= 2, '마지막 카드: 40자 한 줄이 줄바꿈되어 잘리지 않음 (' + line?.lines.length + '줄, ' + line?.size + 'px)');
  assert(line.size >= 28, '마지막 카드: 한 줄이 큰 글씨로 남음 ' + line.size);
  const note = oneRole(fl, 'ending-note');
  assert(note?.text === LONG_NOTE && note.lines.length >= 2, '마지막 카드: 60자 한마디가 줄바꿈되어 잘리지 않음 (' + note?.lines.length + '줄)');
  assert(oneRole(fl, 'ending-wing')?.text === '시조관', '마지막 카드: 고른 관');
  assert(oneRole(fl, 'ending-concept')?.text === CONCEPTS.find((c) => c.id === 'sijo-3jang').text, '마지막 카드: 근거 개념');
  assert(/2026년 10월 5일/.test(oneRole(fl, 'date')?.text ?? ''), '마지막 카드: 만든 날짜');
  assert(fl.items.find((it) => it.type === 'image')?.name === 'sprite/student-b', '마지막 카드: 생김새 b');
  assert(scoreWords(fl).length === 0, '마지막 카드: 점수 말 없음 ' + scoreWords(fl).join(','));
  const inkF = await inkProblems(page, fin.b64, fl);
  assert(inkF.length === 0, '마지막 카드 PNG: 글 상자와 학생 그림 자리에 실제로 그려짐 ' + inkF.slice(0, 5).join(' | '));

  // 5) 글자 크기 설정과 상관없이 카드 배치와 그림이 같다
  const same = await page.evaluate(async () => {
    const t = window.__t;
    t.applyTextScale(1);
    const a = await t.card.renderCard(t.finalCard());
    const pa = await t.canvasBase64(a.canvas);
    t.applyTextScale(1.3);
    document.body.style.fontSize = '40px';
    const b = await t.card.renderCard(t.finalCard());
    const pb = await t.canvasBase64(b.canvas);
    document.body.style.fontSize = '';
    return { layout: JSON.stringify(a.layout) === JSON.stringify(b.layout), png: pa === pb };
  });
  assert(same.layout && same.png, '글자 크기 1과 1.3에서 카드 배치와 그림이 같다');

  // 6) 생김새 a와 b는 다른 학생 그림을 그린다
  const appear = await page.evaluate(async () => {
    const t = window.__t;
    const d = t.finalCard();
    const b = await t.card.renderCard(d);
    const a = await t.card.renderCard({ ...d, appearance: 'a' });
    const img = (l) => l.items.find((it) => it.type === 'image');
    const ib = img(b.layout);
    const crop = (c) => c.getContext('2d').getImageData(ib.x, ib.y, ib.w, ib.h).data.join(',');
    return { a: img(a.layout).name, b: ib.name, differ: crop(a.canvas) !== crop(b.canvas) };
  });
  assert(appear.a === 'sprite/student-a' && appear.b === 'sprite/student-b' && appear.differ, '생김새 a와 b의 학생 그림이 다르다');

  // 7) 휴대폰 가로 화면에서도 카드와 버튼이 화면 안에 있다
  await page.setViewportSize(VIEWPORTS.phone);
  const fit = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const c = r('.card-view-canvas');
    const b = r('.card-view-download');
    const de = document.documentElement;
    return { c: [c.left, c.top, c.right, c.bottom], b: [b.left, b.top, b.right, b.bottom, b.width, b.height], vw: innerWidth, vh: innerHeight, over: de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1 };
  });
  const inside = (q) => q[0] >= -1 && q[1] >= -1 && q[2] <= fit.vw + 1 && q[3] <= fit.vh + 1;
  assert(!fit.over && inside(fit.c) && inside(fit.b) && fit.b[4] >= 48 && fit.b[5] >= 48, '휴대폰 가로(844×390): 카드와 버튼이 화면 안, 버튼 48px 이상 ' + JSON.stringify(fit));
  await page.setViewportSize(VIEWPORTS.chromebook);

  // ── 음성 사례: 점검이 실제 실패를 잡는지 ──

  // 7-1) 줄바꿈 없이 그린 한 줄은 잘림 검사에 걸린다
  const naive = JSON.parse(JSON.stringify(fl));
  const nl = oneRole(naive, 'ending-line');
  nl.lines = [{ text: nl.text, x: nl.box.x, y: nl.box.y, w: nl.box.w * 1.6, h: nl.lines[0].h }];
  assert(layoutProblems(naive).some((p) => p.startsWith('줄이 상자 밖')), '음성: 줄바꿈 없는 긴 한 줄을 잡아낸다');
  const cut = JSON.parse(JSON.stringify(fl));
  oneRole(cut, 'ending-note').lines.pop();
  assert(layoutProblems(cut).some((p) => p.startsWith('글이 잘렸다')), '음성: 마지막 줄이 빠진 한마디를 잡아낸다');

  // 7-2) 점수 말이 들어간 글은 점수 말 검사에 걸린다
  const scored = await page.evaluate(async () => {
    const t = window.__t;
    const d = t.finalCard();
    const { layout } = await t.card.renderCard({ ...d, ending: { ...d.ending, note: '내 점수는 높다' } });
    return JSON.parse(JSON.stringify(layout));
  });
  assert(scoreWords(scored).length === 1, '음성: 그린 글의 점수 말을 잡아낸다');

  // 7-3) 글을 그리지 않은 PNG는 화소 검사에 걸린다
  const blank = await page.evaluate(async () => {
    const t = window.__t;
    const P = CanvasRenderingContext2D.prototype;
    const keep = P.fillText;
    P.fillText = function () {};
    try {
      const { canvas, layout } = await t.card.renderCard(t.finalCard());
      return { b64: await t.canvasBase64(canvas), layout: JSON.parse(JSON.stringify(layout)) };
    } finally {
      P.fillText = keep;
    }
  });
  const blankProbs = await inkProblems(page, blank.b64, blank.layout);
  assert(blankProbs.filter((p) => p.includes('ending-line')).length > 0 && blankProbs.length >= textItems(blank.layout).length, '음성: 글이 그려지지 않은 PNG를 잡아낸다 (' + blankProbs.length + ')');

  // 7-4) PNG가 아닌 파일, 크기가 다른 카드
  assert(pngSize(Buffer.from('not a png file at all, really')) === null, '음성: PNG가 아닌 파일을 잡아낸다');
  const wrongSize = Buffer.from(fin.buf);
  wrongSize.writeUInt32BE(800, 16);
  assert(pngSize(wrongSize).width !== W, '음성: 크기가 다른 PNG를 잡아낸다');

  // 7-5) 판을 마치지 않은 관, 완성되지 않은 서고: 카드가 없고 내려받기 버튼도 없다
  const none = await page.evaluate(async () => {
    const t = window.__t;
    const rec = t.record();
    rec.progress.wings.saseol.state = 'open';
    const { buildWingCard } = await import('../../js/core/cards.js');
    const data = buildWingCard(rec, 'saseol');
    window.__view.dispose();
    const box = document.getElementById('app');
    const v = t.showCard(box, data);
    await v.ready;
    const res = { data, button: !!box.querySelector('.card-view-download'), text: box.textContent.trim() };
    let threw = false;
    try { await t.card.renderCard(null); } catch { threw = true; }
    v.dispose();
    return { ...res, threw, empty: box.children.length === 0 };
  });
  assert(none.data === null && !none.button && none.text.length > 0, '음성: 카드 자료가 없으면 내려받기 버튼 없이 안내만 보인다');
  assert(none.threw, '음성: 자료 없이 그리기를 부르면 오류');
  assert(none.empty, '화면을 닫으면 container를 비운다');

  // 7-6) 파일 이름: 파일 이름에 쓸 수 없는 글자는 바꾼다(기본값의 모양은 그대로)
  const fname = await page.evaluate(() => window.__t.card.cardFileName({ fileName: '옛노래서고_달/빛:사서_향가관.png' }));
  assert(fname === '옛노래서고_달_빛_사서_향가관.png', '파일 이름에 쓸 수 없는 글자를 바꾼다: ' + fname);
  assert(fname !== wing1.name, '음성: 다른 파일 이름은 같다고 보지 않는다');

  assert(game.external.length === 0, '바깥 주소 요청이 없다 (' + game.external.join(', ') + ')');
  assert(game.errors.length === 0, '콘솔 오류가 없다 (' + game.errors.join(' | ') + ')');
} catch (e) {
  console.error(e.stack || e.message);
  process.exitCode = 1;
} finally {
  await game?.close();
  await server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
