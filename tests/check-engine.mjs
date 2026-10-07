// 진행과 기록 엔진 점검(spec 3.2, 4.3, 6, 7.2~7.3, 10, 12, 13, 20 / plan T2).
// js/core/의 엔진을 Node에서 바로 불러 시험한다. 저장소와 시계, 사건은 모두 바깥에서 넣는다.
// 행동 약속마다 되는 경우와 막혀야 하는 경우를 함께 본다.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SONG_TABLE, ROUTING, WING_TABLE, BOSS_TABLE, SONG_CATALOG } from '../js/data/song-table.js';
import { PLAY_WING_IDS, wingById, wingOfGenre } from '../js/data/wings.js';
import { CONCEPTS, CONCEPT_IDS, conceptsOfGenre } from '../js/data/concepts.js';
import {
  SAVE_KEY, SAVE_VERSION, createStore, validateName, defaultProgress, normalizeData,
} from '../js/core/save.js';
import { createProgress, openRecord, TUNABLES } from '../js/core/progress.js';
import { mismatches, targetGenre, tapCounts, pairedLineIds, CONTRAST_RULES } from '../js/core/contrast.js';
import { notebookPage as SASEOL_PAGE } from '../js/data/notebook-saseol.js';
import { notebookPage as HYANGGA_PAGE } from '../js/data/notebook-hyangga.js';
import { songs as REAL_SONGS } from '../js/data/songs/index.js';
import {
  judgeArea, routeStray, judgeUnseenPlacement, judgeSingerGroup, judgeRemixTap, judgeRemixLine,
  judgeStage3Placement, REMIX_TAP_WINDOW_MS,
} from '../js/core/judge.js';
import { buildWingCard, buildFinalCard } from '../js/core/cards.js';
import { graphemeCount, fallbackGraphemeCount, cleanText } from '../js/core/text.js';
import { deriveTapEvidence, deriveFoldEvidence } from '../js/core/song-shape.js';

const root = fileURLToPath(new URL('../', import.meta.url));
let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (a) => [...a].sort();
const section = (t) => console.log('\n[' + t + ']');

// ── 시험 도구 ──

// 로컬 저장소 흉내. failSet: 'quota' | 'other' 이면 setItem이 던진다. failGet: true면 getItem이 던진다.
function memoryStorage({ failSet = null, failGet = false } = {}) {
  const map = new Map();
  return {
    map,
    writes: 0,
    failSet,
    getItem(k) {
      if (failGet) { const e = new Error('막힘'); e.name = 'SecurityError'; throw e; }
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (this.failSet === 'quota') { const e = new Error('가득 참'); e.name = 'QuotaExceededError'; throw e; }
      if (this.failSet === 'other') throw new Error('알 수 없음');
      this.writes++;
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
  };
}

// 고정 시계: 부를 때마다 1분씩 간다.
function clock(start = Date.UTC(2026, 9, 5, 9, 0, 0)) {
  let t = start;
  return () => { const d = new Date(t); t += 60000; return d; };
}

// 사건 기록기
function recorder() {
  const list = [];
  const emit = (name, detail) => list.push({ name, detail });
  emit.list = list;
  emit.of = (name) => list.filter((e) => e.name === name);
  emit.clear = () => { list.length = 0; };
  return emit;
}

// 실제 노래 표의 모든 노래에 대한 시험용 노래 자료(글은 없고, 엔진이 쓰는 필드만).
// 실제 노래 글이 아직 등록되지 않았으므로 evidences와 singerGroups만 정해 둔다.
const EVIDENCE_OVERRIDE = {
  seodongyo: ['hyangga-lines'],
  cheoyongga: ['hyangga-lines'],
  heonhwaga: ['hyangga-lines'],
  mojukjirangga: ['hyangga-lines'],
};
const SINGER_GROUPS = {
  gapminga: ['literati-women', 'singer-commoner'],
  wonwangsaengga: ['monk-hwarang'],
  samogok: ['court-goryeo'],
  'sinheum-sijo': ['literati-gisaeng'],
  'suneung-saseol': ['singer-commoner'],
};
function stubSongs() {
  return Object.entries(SONG_CATALOG).map(([id, c]) => {
    const s = {
      id,
      title: c.title ?? '(고를 노래 ' + id + ')',
      genre: c.genre,
      evidences: EVIDENCE_OVERRIDE[id] ?? conceptsOfGenre(c.genre).map((x) => x.id),
    };
    if (SINGER_GROUPS[id]) s.singerGroups = SINGER_GROUPS[id];
    return s;
  });
}
const SONGS = stubSongs();

// 엔진만(저장소 없이) 만들기
function bareEngine(opts = {}) {
  const emit = opts.emit ?? recorder();
  let saves = 0;
  const engine = createProgress({
    progress: opts.progress ?? defaultProgress(),
    songs: opts.songs ?? SONGS,
    table: SONG_TABLE,
    emit,
    now: opts.now ?? clock(),
    save: () => { saves++; return true; },
    tunables: opts.tunables,
  });
  return { engine, emit, saves: () => saves };
}

// 한 관을 바르게 끝낸다(칸 → 바구니 → 방).
function playWing(engine, wingId, { room = true } = {}) {
  const w = WING_TABLE[wingId];
  w.shelf.forEach((id, i) => engine.place(wingId, 'shelf', i, id));
  const r1 = engine.judge(wingId, 'shelf');
  w.stray.forEach((s, i) => engine.place(wingId, 'basket', i, s.songId, s.to));
  const r2 = engine.judge(wingId, 'basket');
  const r3 = room ? engine.completeRoom(wingId, { room: wingId }) : null;
  return { r1, r2, r3 };
}

// ── 1. 이름 기록 ──
section('1. 이름 기록: 만들기, 같은 이름, 길이, 생김새, 지우기 확인');
{
  check(validateName('  달빛  ').ok && validateName('  달빛  ').name === '달빛', '앞뒤 공백을 뺀 이름을 쓴다');
  check(!validateName('').ok && validateName('').reason === 'empty', '빈 이름은 막는다');
  check(!validateName('   ').ok, '공백만 있는 이름은 막는다');
  check(validateName('가'.repeat(12)).ok, '12자는 된다');
  check(!validateName('가'.repeat(13)).ok && validateName('가'.repeat(13)).reason === 'too-long', '13자는 막는다');
  check(!validateName('가나다라', { nameMax: 3 }).ok && validateName('가나다', { nameMax: 3 }).ok, '이름 길이 상한은 조정할 수 있다');
  check(!validateName(null).ok, '글이 아닌 이름은 막는다');
  // 글자 수는 눈에 보이는 글자 단위(확장 자소 덩어리)로 센다(js/core/text.js)
  const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';   // 사람 셋을 이은 이모지 하나(코드 포인트 5)
  const HAN_NFD = '한'.normalize('NFD');                        // ㅎ+ㅏ+ㄴ 첫가끝 셋
  check([...FAMILY].length === 5 && [...HAN_NFD].length === 3, '(음성) 코드 포인트로 세면 이모지 하나가 5자, 풀어 쓴 한 글자가 3자다(예전 세기)');
  check(graphemeCount(FAMILY) === 1 && graphemeCount(HAN_NFD) === 1 && graphemeCount('가나다') === 3 && graphemeCount('') === 0, "'" + FAMILY + "'와 풀어 쓴 '한'은 1자로 센다");
  check(fallbackGraphemeCount(FAMILY) === 1 && fallbackGraphemeCount(HAN_NFD) === 1 && fallbackGraphemeCount('é') === 1
    && fallbackGraphemeCount('\u{1F1F0}\u{1F1F7}\u{1F1F0}\u{1F1F7}') === 2 && fallbackGraphemeCount('\u{1F44B}\u{1F3FD}') === 1 && fallbackGraphemeCount('가 나') === 3,
  'Intl.Segmenter가 없을 때의 어림도 이음 이모지·결합 부호·국기 짝·피부색·풀어 쓴 한글을 한 글자로 센다');
  check(cleanText('  ' + HAN_NFD + '글 ') === '한글', '글은 NFC로 맞추고 앞뒤 공백을 뺀다');
  check(validateName(FAMILY.repeat(12)).ok, '이모지 12개 이름(코드 포인트 60)은 12자라 된다');
  check(!validateName(FAMILY.repeat(13)).ok && validateName(FAMILY.repeat(13)).reason === 'too-long', '이모지 13개 이름은 13자라 막는다');
  const nfdName = validateName(HAN_NFD.repeat(12));
  check(nfdName.ok && nfdName.name === '한'.repeat(12), '풀어 쓴 한글 12자(코드 포인트 36)는 12자이고 NFC로 맞춰 쓴다');
  for (const f of ['js/core/save.js', 'js/core/progress.js', 'js/story/dom.js']) {
    const src = fs.readFileSync(root + f, 'utf8');
    check(!/\[\.\.\.(?:s|String\([^)]*\))\]\.length/.test(src) && /graphemeCount/.test(src), f + ': 글자 수를 코드 포인트가 아니라 글자 단위 도우미로 센다');
  }

  const storage = memoryStorage();
  const emit = recorder();
  const store = createStore({ storage, emit, now: clock() });
  store.load();
  const a = store.createRecord('  달빛  ');
  check(a.status === 'created' && a.record.name === '달빛', '새 이름이면 기록을 만든다');
  check(a.record.appearance === 'a', '생김새 기본값은 a');
  check(store.data.lastSlotId === a.record.id, '만든 기록이 마지막으로 연 기록이 된다');
  const dup = store.createRecord('달빛 ');
  check(dup.status === 'exists' && dup.record.id === a.record.id, '같은 이름(공백 무시)은 새로 만들지 않고 그 기록을 알려 준다(이어 할지 묻기)');
  check(Object.keys(store.data.slots).length === 1, '같은 이름으로는 기록이 늘지 않는다');
  check(store.createRecord('').status === 'invalid', '빈 이름으로는 만들지 않는다');
  check(store.createRecord('가'.repeat(13)).status === 'invalid', '긴 이름으로는 만들지 않는다');
  const b = store.createRecord('별', { appearance: 'b' });
  check(b.status === 'created' && b.record.appearance === 'b', '생김새 b를 골라 만들 수 있다');
  check(store.createRecord('해', { appearance: 'c' }).status === 'invalid', '생김새는 a·b만 된다');
  check(store.setAppearance(b.record.id, 'a').status === 'changed' && store.getRecord(b.record.id).appearance === 'a', '기록 화면에서 생김새를 바꿀 수 있다');
  check(store.setAppearance(b.record.id, 'x').status === 'invalid' && store.getRecord(b.record.id).appearance === 'a', '잘못된 생김새로는 바꾸지 않는다');
  check(store.selectRecord(a.record.id).status === 'selected' && store.currentRecord().id === a.record.id, '기록을 고르면 이어 한다');
  check(store.selectRecord('없는-id').status === 'missing', '없는 기록은 고를 수 없다');
  const list = store.listRecords();
  check(list.length === 2 && list.every((r) => 'completed' in r && 'name' in r && 'appearance' in r), '기록 목록에 이름·생김새·서고 완성 표시가 있다');

  const del1 = store.deleteRecord(a.record.id);
  check(del1.status === 'needs-confirm' && store.getRecord(a.record.id), '확인 없이 지우지 않는다');
  const del2 = store.deleteRecord(a.record.id, { confirmed: true });
  check(del2.status === 'deleted' && !store.getRecord(a.record.id), '확인하면 지운다');
  check(store.data.lastSlotId === null, '지운 기록이 마지막 기록이었으면 비운다');
  check(buildFinalCard(store.getRecord(a.record.id)) === null, '지운 기록의 결과 카드 자료도 없다');
  const saved = JSON.parse(storage.map.get(SAVE_KEY));
  check(!saved.slots[a.record.id] && saved.slots[b.record.id], '지운 것이 저장소에도 반영된다');
  check(store.createRecord('달빛').status === 'created', '지운 이름은 다시 만들 수 있다');
}

// ── 2. 저장 형식 ──
section('2. 저장 형식(js/data/README.md 9절)과 의미 있는 행동마다 저장');
{
  const storage = memoryStorage();
  const emit = recorder();
  const store = createStore({ storage, emit, now: clock() });
  const info = store.load();
  check(info.status === 'new', '저장이 없으면 새로 시작한다');
  const { record } = store.createRecord('하늘');
  const raw = storage.map.get(SAVE_KEY);
  check(typeof raw === 'string' && storage.map.size === 1, '열쇠 하나(' + SAVE_KEY + ')에만 저장한다');
  const d = JSON.parse(raw);
  check(d.version === 1 && SAVE_VERSION === 1, '버전 1');
  check(same(sorted(Object.keys(d)), sorted(['version', 'device', 'slots', 'lastSlotId'])), '맨 위 열쇠가 약속과 같다');
  check(same(sorted(Object.keys(d.device)), sorted(['volume', 'muted', 'slashMode', 'textScale', 'reduceMotion', 'calibrationOffsetMs', 'calibrated'])), '기기 설정 열쇠가 약속과 같다');
  const s = d.slots[record.id];
  check(same(sorted(Object.keys(s)), sorted(['id', 'name', 'appearance', 'createdAt', 'updatedAt', 'progress'])), '기록 열쇠가 약속과 같다');
  const p = s.progress;
  check(same(sorted(Object.keys(p)), sorted(['tutorialDone', 'wings', 'prewaiting', 'returned', 'concepts', 'keepsakes', 'rooms', 'boss', 'ending'])), 'progress 열쇠가 약속과 같다');
  check(same(Object.keys(p.wings), PLAY_WING_IDS) && PLAY_WING_IDS.every((w) => p.wings[w].state === 'locked'), '관 다섯이 모두 잠긴 채 시작한다');
  const w0 = p.wings.hyangga;
  check(same(sorted(Object.keys(w0)), sorted(['state', 'shelfBound', 'basketDone', 'roomDone', 'bonusDone', 'uniqueActionIntroSeen', 'doneAt', 'placements', 'wrongCount', 'measured'])), '관 기록 열쇠가 약속과 같다');
  check(w0.placements.shelf.length === 3 && w0.placements.basket.length === 2 && w0.placements.bonus.length === 3, '자리 수: 칸 3, 바구니 2, 덤 3');
  check(same(sorted(Object.keys(p.concepts)), sorted(CONCEPT_IDS)) && CONCEPT_IDS.every((c) => p.concepts[c].state === 'none'), '개념 13개 모두 none');
  check(same(sorted(Object.keys(p.boss.unseen)), sorted(Object.values(BOSS_TABLE.unseen))), '낯선 노래 다섯의 기록 자리가 있다');
  check(same(sorted(Object.keys(p.boss.unseen.gapminga)), sorted(['done', 'firstTryCorrect', 'journalHelp', 'singerGroupCorrect'])), '낯선 노래 기록 열쇠가 약속과 같다');
  check(same(sorted(Object.keys(p.ending)), sorted(['line', 'wing', 'conceptId', 'note', 'completed', 'completedAt'])), '엔딩 열쇠가 약속과 같다');
  check(p.boss.state === 'locked' && p.boss.stageWrong === 0, '보스는 잠긴 채 시작한다');

  // 의미 있는 행동마다 저장
  const game = openRecord(store, record.id, { songs: SONGS, emit, now: clock() });
  let before = storage.writes;
  game.completeTutorial();
  check(storage.writes > before, '튜토리얼을 마치면 저장한다');
  before = storage.writes;
  game.place('hyangga', 'shelf', 0, 'seodongyo');
  check(storage.writes === before + 1, '꽂으면 저장한다');
  before = storage.writes;
  game.unplace('hyangga', 'shelf', 0);
  check(storage.writes === before + 1, '빼면 저장한다');
  before = storage.writes;
  game.markMeasured('hyangga', 'seodongyo');
  check(storage.writes === before + 1, '재기를 마치면 저장한다');
  before = storage.writes;
  game.judge('hyangga', 'shelf');
  check(storage.writes === before, '판정이 일어나지 않으면(덜 참) 저장할 것도 없다');
  before = storage.writes;
  game.place('goryeo', 'shelf', 0, 'gasiri');
  check(storage.writes === before, '막힌 행동은 저장하지 않는다');
  const reloaded = JSON.parse(storage.map.get(SAVE_KEY)).slots[record.id];
  check(reloaded.progress.tutorialDone === true && reloaded.progress.wings.hyangga.measured.includes('seodongyo'), '저장된 값이 진행과 같다');
  check(reloaded.updatedAt > reloaded.createdAt, '저장할 때 기록의 updatedAt이 바뀐다');

  // 기기 설정
  store.updateDevice({ slashMode: true, textScale: 1.3 });
  const dev = JSON.parse(storage.map.get(SAVE_KEY)).device;
  check(dev.slashMode === true && dev.textScale === 1.3, '기기 설정을 바꾸면 저장한다');
  store.updateDevice({ textScale: 2, hacked: 1 });
  const dev2 = JSON.parse(storage.map.get(SAVE_KEY)).device;
  check(dev2.textScale === 1.3 && !('hacked' in dev2), '약속 밖의 기기 설정 값은 받지 않는다');
}

// ── 3. 저장 실패, 버전, 여러 창 ──
section('3. 저장 실패, 버전이 다를 때, 여러 창(다른 기록은 남고, 같은 기록은 나중 쓴 쪽이 이긴다)');
{
  // 가득 참
  const storage = memoryStorage();
  const emit = recorder();
  const store = createStore({ storage, emit, now: clock() });
  store.load();
  const { record } = store.createRecord('바람');
  const game = openRecord(store, record.id, { songs: SONGS, emit, now: clock() });
  storage.failSet = 'quota';
  emit.clear();
  game.completeTutorial();
  const failed = emit.of('save:failed');
  check(failed.length >= 1 && failed[0].detail.reason === 'quota', '저장소가 가득 차면 save:failed { reason: quota }를 낸다');
  check(game.wingState('hyangga') === 'open' && store.getRecord(record.id).progress.tutorialDone, '저장에 실패해도 이번 창 메모리에서 계속된다');
  check(store.failure === 'quota', '저장 실패 상태를 물어볼 수 있다');
  const r = game.place('hyangga', 'shelf', 0, 'seodongyo');
  check(r.ok && game.progress.wings.hyangga.placements.shelf[0]?.songId === 'seodongyo', '실패 뒤에도 행동은 계속 된다');
  storage.failSet = null;
  game.place('hyangga', 'shelf', 1, 'cheoyongga');
  check(store.failure === null && JSON.parse(storage.map.get(SAVE_KEY)).slots[record.id].progress.tutorialDone === true, '저장소가 돌아오면 다시 저장한다');
  storage.failSet = 'other';
  emit.clear();
  game.unplace('hyangga', 'shelf', 1);
  check(emit.of('save:failed')[0]?.detail.reason === 'unknown', '그 밖의 실패는 reason: unknown');

  // 저장소가 없음
  const emit2 = recorder();
  const s2 = createStore({ storage: null, emit: emit2, now: clock() });
  const info2 = s2.load();
  check(info2.status === 'unavailable' && emit2.of('save:failed')[0]?.detail.reason === 'unavailable', '저장소가 없으면 불러올 때 save:failed { reason: unavailable }');
  const c2 = s2.createRecord('구름');
  check(c2.status === 'created' && s2.save() === false, '저장소가 없어도 기록을 만들어 메모리로 진행한다');
  // 읽기부터 막힘(사생활 보호 모드 등)
  const emit3 = recorder();
  const s3 = createStore({ storage: memoryStorage({ failGet: true }), emit: emit3, now: clock() });
  check(s3.load().status === 'unavailable' && emit3.of('save:failed')[0]?.detail.reason === 'unavailable', '읽기가 막히면 unavailable');
  // 음성 사례: 정상 저장소에서는 실패 사건이 없어야 한다
  const emit4 = recorder();
  const s4 = createStore({ storage: memoryStorage(), emit: emit4, now: clock() });
  s4.load(); s4.createRecord('비');
  check(emit4.of('save:failed').length === 0, '정상 저장소에서는 save:failed가 없다');

  // 망가진 글
  const st5 = memoryStorage();
  st5.map.set(SAVE_KEY, '{망가진');
  const s5 = createStore({ storage: st5, emit: recorder(), now: clock() });
  const i5 = s5.load();
  check(i5.status === 'reset' && i5.reason === 'corrupt' && Object.keys(s5.data.slots).length === 0, '읽을 수 없는 저장은 새로 시작한다(corrupt)');
  // 옛 버전(옮길 길 없음)
  const st6 = memoryStorage();
  st6.map.set(SAVE_KEY, JSON.stringify({ version: 0, slots: { x: { id: 'x', name: '옛' } } }));
  const s6 = createStore({ storage: st6, emit: recorder(), now: clock() });
  const i6 = s6.load();
  check(i6.status === 'reset' && i6.reason === 'version' && i6.foundVersion === 0, '옮길 수 없는 옛 버전은 새로 시작한다');
  s6.createRecord('새');
  check(JSON.parse(st6.map.get(SAVE_KEY)).version === 1, '새로 시작한 뒤 저장하면 현재 버전으로 덮어쓴다');
  // 새 버전(이 게임보다 나중 것)
  const st7 = memoryStorage();
  const future = JSON.stringify({ version: 2, slots: { y: { id: 'y', name: '미래' } } });
  st7.map.set(SAVE_KEY, future);
  const emit7 = recorder();
  const s7 = createStore({ storage: st7, emit: emit7, now: clock() });
  const i7 = s7.load();
  check(i7.status === 'newer' && i7.foundVersion === 2, '더 새 버전의 저장은 newer로 알린다');
  s7.createRecord('지금');
  check(st7.map.get(SAVE_KEY) === future, '더 새 버전의 저장은 덮어쓰지 않는다(이번 창 메모리로만 진행)');
  check(emit7.of('save:failed').length >= 1, '더 새 버전이면 저장되지 않는다고 알린다');
  // 같은 버전은 그대로 읽는다(음성 사례)
  const st8 = memoryStorage();
  const sA = createStore({ storage: st8, emit: recorder(), now: clock() });
  sA.load(); const ra = sA.createRecord('강');
  const sB = createStore({ storage: st8, emit: recorder(), now: clock() });
  const iB = sB.load();
  check(iB.status === 'loaded' && sB.getRecord(ra.record.id)?.name === '강', '같은 버전 저장은 그대로 이어 읽는다');

  // 여러 창: 막지 않는다. 쓸 때마다 저장소를 다시 읽어 이 창에서 바뀐 기록·설정만 얹는다(읽고 고쳐 쓰기).
  const stored = (st) => JSON.parse(st.map.get(SAVE_KEY));
  const storedNames = (st) => sorted(Object.values(stored(st).slots).map((x) => x.name));
  const st9 = memoryStorage();
  const tab1 = createStore({ storage: st9, emit: recorder(), now: clock() });
  const tab2 = createStore({ storage: st9, emit: recorder(), now: clock() });
  tab1.load(); tab2.load();
  tab1.createRecord('첫 창');
  tab2.createRecord('둘째 창');
  check(same(storedNames(st9), sorted(['첫 창', '둘째 창'])), '두 창이 저마다 새 기록을 만들면 둘 다 남는다');

  // Codex B3 재현: 창 A가 기록을 만들고, 창 B가 다른 기록을 만든 뒤, 창 A가 설정(박자 맞추기 건너뛰기)과 진행을 저장한다
  const st10 = memoryStorage();
  const winA = createStore({ storage: st10, emit: recorder(), now: clock() });
  winA.load();
  const recA = winA.createRecord('열두글자별명기록이에요').record;
  const winB = createStore({ storage: st10, emit: recorder(), now: clock() });
  winB.load();
  const recB = winB.createRecord('다른별명기록').record;
  winA.updateDevice({ calibrated: true, calibrationOffsetMs: 0 });
  const gameA = openRecord(winA, recA.id, { songs: SONGS, emit: recorder(), now: clock() });
  gameA.completeTutorial();
  check(!!stored(st10).slots[recB.id] && stored(st10).slots[recA.id].progress.tutorialDone === true, '오래 열린 창의 설정·진행 저장이 다른 창이 만든 기록을 지우지 않는다(B3)');
  const reloadA = createStore({ storage: st10, emit: recorder(), now: clock() });
  reloadA.load();
  check(same(sorted(reloadA.listRecords().map((r) => r.name)), sorted(['열두글자별명기록이에요', '다른별명기록'])), '창 A를 새로 열어도 두 기록이 목록에 있다');
  check(winA.listRecords().some((r) => r.id === recB.id), '열려 있던 창 A의 기록 목록에도 다른 창의 기록이 들어온다');
  // 음성 사례: 예전 방식(메모리 문서 전체를 그대로 쓰기)이면 다른 창의 기록이 사라진다 — 위 점검이 그 차이를 잡는다
  const stOld = memoryStorage();
  const oldA = createStore({ storage: stOld, emit: recorder(), now: clock() });
  oldA.load(); oldA.createRecord('옛 창 A');
  const oldB = createStore({ storage: stOld, emit: recorder(), now: clock() });
  oldB.load(); oldB.createRecord('옛 창 B');
  stOld.setItem(SAVE_KEY, JSON.stringify(oldA.data));   // 예전 save(): 이 창의 메모리 문서 전체를 덮어씀
  check(same(storedNames(stOld), ['옛 창 A']), '음성 사례: 문서 전체를 덮어쓰면 다른 창의 기록이 사라진다(예전 방식은 점검에 걸린다)');

  // 기기 설정은 이 창에서 바꾼 값만 얹는다(소리 크기는 갈래마다)
  const st11 = memoryStorage();
  const d1 = createStore({ storage: st11, emit: recorder(), now: clock() });
  const d2 = createStore({ storage: st11, emit: recorder(), now: clock() });
  d1.load(); d2.load();
  d2.updateDevice({ textScale: 1.3, volume: { voice: 0.5 } });
  d1.updateDevice({ muted: true, volume: { bgm: 0.2 } });
  const dev11 = stored(st11).device;
  check(dev11.muted === true && dev11.textScale === 1.3 && dev11.volume.bgm === 0.2 && dev11.volume.voice === 0.5 && dev11.volume.sfx === 0.8, '두 창이 서로 다른 설정을 바꾸면 둘 다 남는다(바꾸지 않은 설정은 덮지 않는다)');
  d2.updateDevice({ muted: false });
  check(stored(st11).device.muted === false, '같은 설정은 나중에 바꾼 창이 이긴다');

  // 지우기: 저장소를 다시 읽고 그 기록의 자리만 뺀다
  const st12 = memoryStorage();
  const e1 = createStore({ storage: st12, emit: recorder(), now: clock() });
  e1.load();
  const keepRec = e1.createRecord('남을 기록').record;
  const e2 = createStore({ storage: st12, emit: recorder(), now: clock() });
  e2.load();
  const goneRec = e2.createRecord('지울 기록').record;
  const lateRec = e2.createRecord('늦게 만든 기록').record;
  e1.listRecords();
  check(e1.deleteRecord(goneRec.id, { confirmed: true }).status === 'deleted', '다른 창이 만든 기록도 목록에서 골라 지울 수 있다');
  check(same(storedNames(st12), sorted(['남을 기록', '늦게 만든 기록'])), '지우기는 그 기록만 빼고 다른 창이 만든 기록은 남긴다');
  const gameE2 = openRecord(e2, lateRec.id, { songs: SONGS, emit: recorder(), now: clock() });
  gameE2.completeTutorial();
  check(!stored(st12).slots[goneRec.id] && !!stored(st12).slots[keepRec.id], '다른 창이 지운 기록은 이 창이 다른 기록을 저장해도 되살아나지 않는다');
  check(!e2.getRecord(goneRec.id), '다른 창이 지운 기록은 이 창의 메모리에서도 빠진다');

  // 같은 기록 충돌: 막지 않고 나중에 쓴 창이 이긴다(spec 13)
  const st13 = memoryStorage();
  const w1 = createStore({ storage: st13, emit: recorder(), now: clock() });
  w1.load();
  const shared = w1.createRecord('같은 기록').record;
  const w2 = createStore({ storage: st13, emit: recorder(), now: clock() });
  w2.load();
  const g1 = openRecord(w1, shared.id, { songs: SONGS, emit: recorder(), now: clock() });
  const g2 = openRecord(w2, shared.id, { songs: SONGS, emit: recorder(), now: clock() });
  g1.completeTutorial();
  g2.place('sijo', 'shelf', 0, 'dongjitdal');   // 막힌 행동: 저장하지 않는다
  check(stored(st13).slots[shared.id].progress.tutorialDone === true, '막힌 행동은 같은 기록을 덮어쓰지 않는다');
  w2.setAppearance(shared.id, 'b');
  check(stored(st13).slots[shared.id].appearance === 'b' && stored(st13).slots[shared.id].progress.tutorialDone === false, '같은 기록을 두 창에서 바꾸면 나중에 쓴 창이 이긴다(막지 않음)');

  // 고르면 다른 창이 이어 한 최신 진행을 새로 읽는다(오래 열린 목록에서 골라도 진행이 뒤로 가지 않는다)
  const st14 = memoryStorage();
  const f1 = createStore({ storage: st14, emit: recorder(), now: clock() });
  f1.load();
  const fr = f1.createRecord('이어 할 기록').record;
  const other = f1.createRecord('다른 기록').record;
  const f2 = createStore({ storage: st14, emit: recorder(), now: clock() });
  f2.load();
  openRecord(f2, fr.id, { songs: SONGS, emit: recorder(), now: clock() }).completeTutorial();
  const gf1 = openRecord(f1, fr.id, { songs: SONGS, emit: recorder(), now: clock() });
  check(gf1.progress.tutorialDone === true && stored(st14).slots[fr.id].progress.tutorialDone === true, '오래 열린 창에서 기록을 골라도 다른 창의 진행을 새로 읽는다');
  check(!!stored(st14).slots[other.id], '고르기만 해서는 다른 기록을 건드리지 않는다');

  // 더 새 버전 보호는 쓰기 직전에 다시 읽어도 지킨다
  const st15 = memoryStorage();
  const n1 = createStore({ storage: st15, emit: recorder(), now: clock() });
  n1.load(); n1.createRecord('지금 버전');
  const newer = JSON.stringify({ version: 2, slots: {} });
  st15.map.set(SAVE_KEY, newer);
  const emit15 = recorder();
  const n2 = createStore({ storage: st15, emit: emit15, now: clock() });
  n1.updateDevice({ muted: true });
  check(st15.map.get(SAVE_KEY) === newer && n1.failure === 'unknown', '다른 창이 더 새 버전으로 저장했으면 덮어쓰지 않는다');
}

// ── 4. 관 열림과 건너뛰기 ──
section('4. 관 열림 순서(spec 3.2)와 건너뛰기 불가');
{
  const { engine, emit } = bareEngine();
  check(PLAY_WING_IDS.every((w) => engine.wingState(w) === 'locked'), '처음에는 다섯 관이 모두 잠겨 있다');
  check(!engine.place('hyangga', 'shelf', 0, 'seodongyo').ok, '튜토리얼 전에는 향가관에 꽂을 수 없다');
  check(!engine.markMeasured('hyangga', 'seodongyo').ok, '튜토리얼 전에는 향가관에서 잴 수 없다');
  check(!engine.canEnter('hyangga'), '튜토리얼 전에는 향가관에 들어갈 수 없다');
  check(!engine.completeRoom('hyangga', {}).ok, '잠긴 관의 방은 마칠 수 없다');
  check(!engine.enterBoss().ok, '처음부터 보스에 들어갈 수 없다');
  check(!engine.completeEnding({ line: '노래', wing: 'sijo', conceptId: 'sijo-3jang', note: '' }).ok, '처음부터 엔딩을 할 수 없다');
  engine.completeTutorial();
  check(engine.wingState('hyangga') === 'open' && engine.wingState('goryeo') === 'locked', '튜토리얼을 마치면 향가관만 열린다');
  check(emit.of('wing:state').some((e) => e.detail.wing === 'hyangga' && e.detail.state === 'open'), 'wing:state { hyangga, open }을 낸다');
  check(!engine.place('goryeo', 'shelf', 0, 'cheongsan-byeolgok').ok, '고려가요관은 아직 꽂을 수 없다');
  check(!engine.place('saseol', 'shelf', 0, 'namodo-bahi').ok, '먼 관도 건너뛸 수 없다');

  // 칸만 묶음 → 아직
  WING_TABLE.hyangga.shelf.forEach((id, i) => engine.place('hyangga', 'shelf', i, id));
  engine.judge('hyangga', 'shelf');
  check(engine.progress.wings.hyangga.shelfBound && engine.wingState('goryeo') === 'locked', '칸만 묶어서는 다음 관이 열리지 않는다');
  // 방을 먼저 마쳐도 바구니 없이는 아직
  check(engine.completeRoom('hyangga', { room: 'hyangga' }).ok, '칸이 묶이면 방을 마칠 수 있다');
  check(engine.wingState('hyangga') === 'open' && engine.wingState('goryeo') === 'locked', '바구니 판정 없이는 판이 끝나지 않는다');
  WING_TABLE.hyangga.stray.forEach((s, i) => engine.place('hyangga', 'basket', i, s.songId, s.to));
  engine.judge('hyangga', 'basket');
  check(engine.wingState('hyangga') === 'done' && engine.wingState('goryeo') === 'open', '칸·바구니·방을 다 마치면 판이 끝나고 다음 관이 열린다');
  check(engine.progress.wings.hyangga.doneAt && !engine.progress.wings.hyangga.bonusDone, '덤 없이도 판이 끝난다(덤은 조건 아님)');
  check(engine.wingState('sijo') === 'locked', '다다음 관은 여전히 잠겨 있다');
  check(engine.canEnter('hyangga'), '마친 관에는 다시 들어갈 수 있다');

  // 방은 칸이 묶이기 전에는 마칠 수 없다
  check(!engine.completeRoom('goryeo', { room: 'goryeo' }).ok, '칸이 묶이기 전에는 방을 마칠 수 없다');

  // 상태를 바꾸는 공개 길이 없다
  const forbidden = Object.keys(engine).filter((k) => /unlock|setState|setWing|skip|force|debug|cheat/i.test(k));
  check(forbidden.length === 0, '엔진에 관 상태를 직접 바꾸는 길이 없다(' + forbidden.join(', ') + ')');
  check(Object.isFrozen(engine), '엔진 객체에 메서드를 덧붙일 수 없다');

  // 주소 인자, 창, 문서를 읽지 않는다(소스 검사). 검사기가 실제로 잡는지도 본다.
  const banned = /\b(location|URLSearchParams|document|window|localStorage|sessionStorage|navigator)\b/;
  const files = ['save.js', 'progress.js', 'judge.js', 'cards.js', 'contrast.js'].map((f) => root + 'js/core/' + f);
  const hits = files.filter((f) => {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return banned.test(src);
  });
  check(hits.length === 0, '엔진 파일이 주소·창·문서·저장소 전역을 직접 읽지 않는다(' + hits.join(', ') + ')');
  check(banned.test('const q = new URLSearchParams(location.search)'), '(음성) 소스 검사기가 주소 인자 읽기를 잡는다');

  // 손댄 저장: 순서를 어긴 상태는 불러올 때 바로잡는다
  const storage = memoryStorage();
  const p = defaultProgress();
  p.tutorialDone = true;
  p.wings.gasa.state = 'open';
  p.wings.saseol = { ...p.wings.saseol, state: 'done', shelfBound: true, basketDone: true, roomDone: true };
  p.boss.state = 'stage2';
  p.ending.completed = true;
  storage.map.set(SAVE_KEY, JSON.stringify({ version: 1, device: {}, slots: { t: { id: 't', name: '손댐', appearance: 'a', createdAt: 'x', updatedAt: 'x', progress: p } }, lastSlotId: 't' }));
  const st = createStore({ storage, emit: recorder(), now: clock() });
  st.load();
  const tp = st.getRecord('t').progress;
  check(tp.wings.hyangga.state === 'open' && tp.wings.gasa.state === 'locked' && tp.wings.saseol.state === 'locked', '저장을 고쳐 건너뛴 관은 불러올 때 잠긴다');
  check(tp.boss.state === 'locked' && tp.ending.completed === false, '저장을 고쳐 연 보스·엔딩도 잠긴다');
  // 음성 사례: 올바른 저장은 그대로
  const p2 = defaultProgress();
  p2.tutorialDone = true;
  p2.wings.hyangga = { ...p2.wings.hyangga, state: 'done', shelfBound: true, basketDone: true, roomDone: true, doneAt: '2026-10-05T09:00:00.000Z' };
  p2.wings.goryeo.state = 'open';
  const n2 = normalizeData({ version: 1, device: {}, slots: { u: { id: 'u', name: '바름', appearance: 'b', createdAt: 'x', updatedAt: 'x', progress: p2 } }, lastSlotId: 'u' });
  check(n2.slots.u.progress.wings.hyangga.state === 'done' && n2.slots.u.progress.wings.goryeo.state === 'open' && n2.slots.u.appearance === 'b', '순서가 맞는 저장은 그대로 읽는다');
}

// ── 5. 판정: 칸·탑·바구니 ──
section('5. 판정(spec 6): 다 찼을 때만, 틀린 것만 돌려보냄, 맞은 것은 고정');
{
  // 순수 판정기
  const t = SONG_TABLE;
  const slots3 = (ids) => ids.map((id) => (id ? { songId: id, fixed: false } : null));
  check(judgeArea({ table: t, wingId: 'sijo', area: 'shelf', slots: slots3(['dongjitdal', 'ireondeul', null]) }).judged === false, '칸이 덜 차면 판정하지 않는다');
  const j1 = judgeArea({ table: t, wingId: 'sijo', area: 'shelf', slots: slots3(['imomi-jukgo', 'dongjitdal', 'ireondeul']) });
  check(j1.judged && j1.allCorrect, '시조관 칸: 칸 노래는 어느 자리든 맞다');
  const j2 = judgeArea({ table: t, wingId: 'sijo', area: 'shelf', slots: slots3(['dongjitdal', 'chang-naegoja', 'ireondeul']) });
  check(j2.judged && !j2.allCorrect && same(j2.wrong.map((x) => x.songId), ['chang-naegoja']) && j2.wrong[0].genre === 'saseol', '길 잃은 노래(사설시조)를 칸에 꽂으면 그 노래만 틀린다');
  const tower = judgeArea({ table: t, wingId: 'hyangga', area: 'shelf', slots: slots3(['cheoyongga', 'seodongyo', 'chan-giparangga']) });
  check(tower.judged && same(tower.wrong.map((x) => x.index), [0, 1]), '향가 탑: 층(구 수)이 틀린 노래는 그 층에서 틀린다');
  const towerOk = judgeArea({ table: t, wingId: 'hyangga', area: 'shelf', slots: slots3(['seodongyo', 'cheoyongga', 'chan-giparangga']) });
  check(towerOk.allCorrect, '향가 탑: 4·8·10구 층에 맞게 꽂으면 맞다');
  const bk = (a, b) => [a && { songId: a[0], to: a[1], fixed: false }, b && { songId: b[0], to: b[1], fixed: false }];
  check(judgeArea({ table: t, wingId: 'goryeo', area: 'basket', slots: bk(['dongjitdal', 'sijo'], null) }).judged === false, '바구니가 덜 차면 판정하지 않는다');
  const b1 = judgeArea({ table: t, wingId: 'goryeo', area: 'basket', slots: bk(['dongjitdal', 'sijo'], ['myeonangjeongga', 'saseol']) });
  check(b1.judged && same(b1.wrong.map((x) => x.songId), ['myeonangjeongga']), '바구니는 고른 행선지로 판정한다(틀린 행선지만 돌아옴)');
  const b2 = judgeArea({ table: t, wingId: 'goryeo', area: 'basket', slots: bk(['gasiri', 'goryeo'], ['myeonangjeongga', 'gasa']) });
  check(same(b2.wrong.map((x) => x.songId), ['gasiri']), '칸 노래를 바구니에 넣으면 틀린다');
  // 실제 표 전체: 칸 노래는 맞고 길 잃은 노래는 칸에서 틀리며, 바른 행선지만 바구니에서 맞다
  let tableOk = true;
  for (const w of PLAY_WING_IDS) {
    const T = WING_TABLE[w];
    if (!judgeArea({ table: t, wingId: w, area: 'shelf', slots: slots3(T.shelf) }).allCorrect) tableOk = false;
    for (const s of T.stray) {
      const sl = slots3(T.shelf); sl[2] = { songId: s.songId, fixed: false };
      const r = judgeArea({ table: t, wingId: w, area: 'shelf', slots: sl });
      if (!same(r.wrong.map((x) => x.songId), [s.songId])) tableOk = false;
      for (const to of PLAY_WING_IDS) {
        const rb = judgeArea({ table: t, wingId: w, area: 'basket', slots: [{ songId: s.songId, to, fixed: false }, { songId: T.stray.find((x) => x !== s).songId, to: T.stray.find((x) => x !== s).to, fixed: false }] });
        if ((to === s.to) !== rb.allCorrect) tableOk = false;
      }
    }
  }
  check(tableOk, '실제 노래 표 전체에서 칸·바구니 판정이 표와 맞다');

  // 엔진에서
  const { engine, emit } = bareEngine();
  engine.completeTutorial();
  engine.place('hyangga', 'shelf', 0, 'seodongyo');
  engine.place('hyangga', 'shelf', 1, 'gasiri');
  const pre = JSON.stringify(engine.progress);
  const nf = engine.judge('hyangga', 'shelf');
  check(!nf.ok && nf.reason === 'not-full' && JSON.stringify(engine.progress) === pre, '엔진: 덜 찬 칸은 판정하지 않고 아무것도 바꾸지 않는다');
  engine.place('hyangga', 'shelf', 2, 'chan-giparangga');
  const r = engine.judge('hyangga', 'shelf');
  const pl = engine.progress.wings.hyangga.placements.shelf;
  check(r.ok && r.judged && same(r.returned.map((x) => x.songId), ['gasiri']), '엔진: 틀린 노래만 돌려보낸다');
  check(pl[1] === null && pl[0].fixed && pl[2].fixed, '틀린 자리는 비고, 맞은 노래는 고정된다');
  check(engine.progress.wings.hyangga.wrongCount === 1, '돌아온 노래 하나 = 오답 하나');
  check(!engine.progress.wings.hyangga.shelfBound, '틀린 것이 있으면 묶이지 않는다');
  check(!engine.unplace('hyangga', 'shelf', 0).ok, '고정된 노래는 뺄 수 없다');
  check(!engine.place('hyangga', 'shelf', 0, 'cheoyongga').ok, '고정된 자리에는 꽂을 수 없다');
  check(!engine.place('hyangga', 'basket', 0, 'seodongyo', 'goryeo').ok, '고정된 노래를 다른 자리로 옮길 수 없다');
  // 판정 전에는 빼고 꽂기 자유, 같은 노래는 옮겨진다
  engine.place('hyangga', 'basket', 0, 'cheoyongga', 'goryeo');
  check(engine.place('hyangga', 'shelf', 1, 'cheoyongga').ok && engine.progress.wings.hyangga.placements.basket[0] === null, '판정 전 노래를 다른 자리에 꽂으면 옮겨진다');
  check(!engine.place('hyangga', 'shelf', 1, 'jemangmaega').ok, '그 관 판에 없는 노래(작품 방 작품)는 칸에 꽂을 수 없다');
  check(!engine.place('hyangga', 'shelf', 3, 'cheoyongga').ok, '없는 자리 번호는 막는다');
  check(!engine.place('hyangga', 'basket', 0, 'gasiri').ok, '바구니에는 갈 관을 함께 골라야 한다');
  check(!engine.place('hyangga', 'basket', 0, 'gasiri', 'entrance').ok, '갈 관은 판을 하는 관 다섯 가운데 하나다');
  const r2 = engine.judge('hyangga', 'shelf');
  check(r2.ok && r2.bound && engine.progress.wings.hyangga.shelfBound, '모두 맞으면 칸(탑)이 묶인다');
  check(!engine.place('hyangga', 'shelf', 1, 'gasiri').ok, '묶인 칸에는 더 꽂을 수 없다');
  check(same(engine.progress.keepsakes, WING_TABLE.hyangga.shelf), '칸이 묶이면 세 노래의 기념품을 받는다');
  check(engine.isRoomOpen('hyangga'), '칸이 묶이는 순간 작품 방 문이 열린다');
  // 바구니: 하나만 틀림
  engine.place('hyangga', 'basket', 0, 'gasiri', 'goryeo');
  engine.place('hyangga', 'basket', 1, 'cheongsanri-byeokgyesu', 'gasa');
  const rb = engine.judge('hyangga', 'basket');
  const bp = engine.progress.wings.hyangga.placements.basket;
  check(same(rb.returned.map((x) => x.songId), ['cheongsanri-byeokgyesu']) && bp[1] === null && bp[0].fixed && bp[0].to === 'goryeo', '바구니: 행선지가 틀린 노래만 행선지가 지워진 채 돌아오고 맞은 노래는 고정된다');
  check(same(engine.progress.prewaiting.goryeo, ['gasiri']), '맞은 쪽은 이미 보내진 것으로 처리된다(spec 20)');
  check(!engine.progress.wings.hyangga.basketDone && engine.progress.wings.hyangga.wrongCount === 2, '바구니가 다 통과하기 전에는 basketDone이 아니다');
  const nf2 = engine.judge('hyangga', 'basket');
  check(nf2.reason === 'not-full', '돌아온 자리가 비면 다시 채울 때까지 판정하지 않는다');
  engine.place('hyangga', 'basket', 1, 'cheongsanri-byeokgyesu', 'sijo');
  const rb2 = engine.judge('hyangga', 'basket');
  check(rb2.ok && rb2.passed && engine.progress.wings.hyangga.basketDone, '바르게 다시 보내면 바구니 판정을 통과한다');
  check(!engine.judge('hyangga', 'basket').ok, '통과한 바구니는 다시 판정하지 않는다');

  // 덤은 판이 끝난 관에서만
  check(!engine.place('hyangga', 'bonus', 0, 'heonhwaga').ok, '판이 끝나기 전에는 덤 칸이 열리지 않는다');
  engine.completeRoom('hyangga', { room: 'hyangga' });
  check(engine.place('hyangga', 'bonus', 0, 'heonhwaga').ok, '판이 끝난 관에서는 덤 칸에 꽂을 수 있다');
  check(!engine.place('hyangga', 'bonus', 1, 'seodongyo').ok, '덤 칸에는 덤 노래만 꽂는다');
  check(engine.judge('hyangga', 'bonus').reason === 'not-full', '덤 칸도 다 찼을 때만 판정한다');
  engine.place('hyangga', 'bonus', 1, 'mojukjirangga');
  engine.place('hyangga', 'bonus', 2, 'anminga');
  const rbo = engine.judge('hyangga', 'bonus');
  check(rbo.ok && rbo.bound && engine.progress.wings.hyangga.bonusDone, '덤 칸을 묶는다');
  check(WING_TABLE.hyangga.bonus.every((id) => engine.progress.keepsakes.includes(id)), '덤이 묶이면 덤 노래 기념품을 받는다');
}

// ── 6. 오답 도움 ──
section('6. 오답 도움(spec 6.4): 관에서 오답 3번부터 틀릴 때마다 수첩 반짝임');
{
  // 어긋나는 개념은 감정서(노래 글)에서 계산하므로 실제 노래 데이터로 본다
  const { engine, emit } = bareEngine({ songs: REAL_SONGS });
  engine.completeTutorial();
  const wrongOnce = () => {
    engine.place('hyangga', 'shelf', 0, 'seodongyo');
    engine.place('hyangga', 'shelf', 1, 'cheoyongga');
    engine.place('hyangga', 'shelf', 2, 'gasiri');
    return engine.judge('hyangga', 'shelf');
  };
  wrongOnce();
  check(emit.of('help:notebook-glow').length === 0, '오답 1번: 반짝이지 않는다');
  engine.place('hyangga', 'shelf', 2, 'cheongsanri-byeokgyesu');
  engine.judge('hyangga', 'shelf');
  check(emit.of('help:notebook-glow').length === 0, '오답 2번: 반짝이지 않는다');
  engine.place('hyangga', 'shelf', 2, 'gasiri');
  engine.judge('hyangga', 'shelf');
  const g = emit.of('help:notebook-glow');
  // 「가시리」(고려가요, 네 연)를 탑의 10구 층에: 대상은 향가(그 층), 실리는 개념은 감정서와 어긋나는 향가 개념
  const gasiri = REAL_SONGS.find((x) => x.id === 'gasiri');
  const expect3 = [...new Set(mismatches(gasiri, { towerUnits: 10 }, 'aa-door').map((m) => m.conceptId))];
  check(g.length === 1 && g[0].detail.wing === 'hyangga' && g[0].detail.genre === 'hyangga' && same(g[0].detail.conceptIds, expect3) && same(expect3, ['hyangga-lines', 'hyangga-exclaim']), '오답 3번: 그 자리(탑 10구 층)의 갈래 쪽에서 감정서와 어긋나는 개념으로 반짝인다 ' + JSON.stringify(g[0]?.detail));
  check(g[0].detail.genre !== 'goryeo' && !g[0].detail.conceptIds.some((c) => c.startsWith('goryeo')), '(음성) 틀린 노래 자기 갈래(고려가요) 쪽이나 그 개념으로 반짝이지 않는다');
  engine.place('hyangga', 'shelf', 2, 'cheongsanri-byeokgyesu');
  engine.judge('hyangga', 'shelf');
  check(emit.of('help:notebook-glow').length === 2 && emit.of('help:notebook-glow')[1].detail.genre === 'hyangga', '오답 4번: 또 반짝인다(시조 노래여도 대상인 향가 쪽)');
  check(engine.progress.wings.hyangga.wrongCount === 4, '관별 오답 수가 쌓인다');
  // 다른 관의 오답 수는 따로 센다
  const { engine: e2, emit: em2 } = bareEngine({ tunables: { wingWrongHelp: 1 } });
  e2.completeTutorial();
  e2.place('hyangga', 'shelf', 0, 'gasiri');
  e2.place('hyangga', 'shelf', 1, 'cheongsanri-byeokgyesu');
  e2.place('hyangga', 'shelf', 2, 'chan-giparangga');
  e2.judge('hyangga', 'shelf');
  check(em2.of('help:notebook-glow').length === 2, '한 판정에 돌아온 노래가 둘이면 오답 둘(기준을 넘은 만큼 반짝임). 기준값은 조정할 수 있다');
  check(TUNABLES.wingWrongHelp === 3 && TUNABLES.bossWrongHelp === 3, '기본 기준값은 3');
  // 바구니: 대상은 고른 행선지 관의 갈래. 칸 노래를 자기 갈래 행선지로 넣으면 어긋나는 줄이 없어 그 갈래 개념 모두
  const { engine: e3, emit: em3 } = bareEngine({ songs: REAL_SONGS, tunables: { wingWrongHelp: 1 } });
  e3.completeTutorial();
  e3.place('hyangga', 'basket', 0, 'cheongsanri-byeokgyesu', 'gasa');
  e3.place('hyangga', 'basket', 1, 'seodongyo', 'hyangga');
  const rb3 = e3.judge('hyangga', 'basket');
  const bg = em3.of('help:notebook-glow').map((x) => x.detail);
  const cheong = REAL_SONGS.find((x) => x.id === 'cheongsanri-byeokgyesu');
  const expGasa = [...new Set(mismatches(cheong, { genre: 'gasa' }, 'aa-door').map((m) => m.conceptId))];
  check(rb3.returned.length === 2 && same(rb3.returned.map((x) => x.target), [{ genre: 'gasa' }, { genre: 'hyangga' }]), '판정 결과의 돌아온 노래마다 대상(행선지 갈래)이 실린다');
  check(bg.length === 2 && bg[0].genre === 'gasa' && expGasa.length > 0 && same(bg[0].conceptIds, expGasa), '바구니: 고른 행선지(가사관) 갈래 쪽의 어긋나는 개념 ' + JSON.stringify(bg[0]));
  check(bg[1].genre === 'hyangga' && same(bg[1].conceptIds, conceptsOfGenre('hyangga').map((c) => c.id)), '어긋나는 줄이 없으면 대상 갈래 개념 모두(칸 노래를 자기 갈래 행선지로 바구니에)');
  check(bg.every((d) => d.songId), '도움 신호에 그 노래 id가 실린다');
}

// ── 6-2. 맞대어 보기 규칙(js/core/contrast.js) ──
section('6-2. 맞대어 보기: 감정서에서 그 자리와 어긋나는 줄 찾기(순수 함수)');
{
  const S = (id) => REAL_SONGS.find((x) => x.id === id);
  const kinds = (list) => list.map((m) => m.lineKind + '/' + m.conceptId + (m.action ? '/' + m.action : '')).sort();
  check(same(kinds(mismatches(S('chang-naegoja'), { genre: 'sijo' }, 'stairs')), ['tap/sijo-4beat']), '사설시조를 시조 칸에(시조관): 두드리기 줄만 어긋난다(가운데 장이 네 음보를 넘음)');
  check(same(kinds(mismatches(S('gwandong-byeolgok'), { genre: 'sijo' }, 'stairs')), ['action/sijo-final3/stairs', 'fold/sijo-3jang']), '가사를 시조 칸에: 접기(세 장이 아님)와 계단(종장 없음)');
  check(same(kinds(mismatches(S('dongjitdal'), { genre: 'goryeo' }, 'refrain-link')), ['action/goryeo-refrain/refrain-link', 'tap/goryeo-3beat']), '시조를 고려가요 칸에(고려가요관): 네 음보와 되풀이 구절 없음');
  check(same(kinds(mismatches(S('seodongyo'), { towerUnits: 8 }, 'aa-door')), ['fold/hyangga-lines']), '4구 향가를 8구 층에: 접기 줄만');
  check(mismatches(S('chan-giparangga'), { towerUnits: 10 }, 'aa-door').length === 0, '제 층의 향가는 어긋나는 줄이 없다');
  check(mismatches(S('dongdong'), { genre: 'goryeo' }, ['refrain-link', 'walk']).length === 0, '세 음보 줄이 80%가 안 되는 고려가요(「동동」)도 고려가요 칸과 어긋나지 않는다');
  // 보스: 쓴 도구만 본다
  const gap = S('gapminga');
  check(!mismatches(gap, { genre: 'sijo' }, []).some((m) => m.lineKind === 'action') && mismatches(gap, { genre: 'sijo' }, ['stairs']).some((m) => m.conceptId === 'sijo-final3'), '쓰지 않은 도구의 줄은 어긋남에 들지 않는다');
  check(targetGenre({ towerUnits: 4 }) === 'hyangga' && targetGenre({ genre: 'gasa' }) === 'gasa', '대상 갈래: 탑은 향가');
  check(same(tapCounts({ mode: 'gu', gu: 3 }), [1, 1, 1]) && same(tapCounts({ mode: 'lines', feet: [[3, 0], [2]] }), [3, 2]), '두드린 수: 향가는 덩이 하나에 한 번(구 세기), 고려가요는 후렴만 있는 줄을 뺀다');
  // 향가의 두드리기 방식(구 세기)은 프로그램이 고른 것이라 증거가 아니다(C3): 두드리기 줄로 향가·탑과 어긋난다고 하지 않는다
  check(!mismatches(S('gasiri'), { genre: 'hyangga' }, 'aa-door').some((m) => m.lineKind === 'tap') && !mismatches(S('dongjitdal'), { towerUnits: 4 }, 'aa-door').some((m) => m.lineKind === 'tap'), '두드리기 방식(구마다 한 번이 아님)을 향가·탑과 어긋나는 근거로 쓰지 않는다');
  check(same(kinds(mismatches(S('dongjitdal'), { towerUnits: 4 }, 'aa-door')), ['fold/hyangga-lines']), '시조를 4구 층에: 접기 줄(세 덩이)만 어긋난다');
  // 고려가요 세 음보(C2): 음보로 센 줄에 세 음보가 하나도 없을 때만. 향가의 구 세기는 증거가 아니다
  check(!mismatches(S('seodongyo'), { genre: 'goryeo' }, 'aa-door').some((m) => m.conceptId === 'goryeo-3beat'), '향가(구 세기)를 고려가요 바구니에: 세 음보 줄로 어긋난다고 하지 않는다');
  check(mismatches(S('gwandong-byeolgok'), { genre: 'goryeo' }, 'walk').some((m) => m.conceptId === 'goryeo-3beat') === !tapCounts(deriveTapEvidence(S('gwandong-byeolgok'))).includes(3), '가사를 고려가요 바구니에: 세 음보 행이 하나도 없을 때만 세 음보 줄과 어긋난다');

  // 맞대어 보기의 짝(B2): 어긋남의 개념을 가장 좁게 설명하는 수첩 줄만 밝힌다
  const nuhang = mismatches(S('nuhangsa'), { genre: 'saseol' }, 'rapid-unroll');
  const foldMis = nuhang.find((m) => m.lineKind === 'fold');
  check(foldMis?.conceptId === 'saseol-frame' && deriveFoldEvidence(S('nuhangsa')).units === 15, '「누항사」(15덩이)를 사설시조 칸에: 접기 줄이 세 장 개념(saseol-frame)과 어긋난다');
  const foldPair = pairedLineIds([foldMis?.conceptId], SASEOL_PAGE.lines);
  const lineText = (id) => SASEOL_PAGE.lines.find((l) => l.id === id)?.text ?? '';
  check(same(foldPair, ['saseol-frame']) && /세 장/.test(lineText('saseol-frame')), '[15 덩이]는 세 장을 말하는 수첩 줄과만 짝이 된다 ' + JSON.stringify(foldPair.map(lineText)));
  check(!foldPair.includes('saseol-stretch') && !foldPair.includes('saseol-vs-gasa'), '덩이 수 어긋남이 늘어나는 장 줄이나 가사와 견주는 줄을 함께 밝히지 않는다');
  const stairsMis = mismatches(S('gwandong-byeolgok'), { genre: 'saseol' }, 'stairs').find((m) => m.lineKind === 'action');
  const stairsPair = pairedLineIds([stairsMis?.conceptId], SASEOL_PAGE.lines);
  check(stairsMis?.action === 'stairs' && same(stairsPair, ['saseol-frame']) && /종장/.test(lineText('saseol-frame')), '계단(종장 첫 음보) 어긋남은 종장을 말하는 수첩 줄과 짝이 된다');
  check(same(pairedLineIds(['saseol-middle'], SASEOL_PAGE.lines), ['saseol-stretch']), '늘어나는 장 어긋남은 늘어나는 장 줄과 짝이 된다');
  // 음성 사례: 예전 짝짓기(개념이 하나라도 같으면 모두)는 가사와 견주는 줄까지 밝힌다
  const oldPair = SASEOL_PAGE.lines.filter((l) => l.conceptIds.includes('saseol-frame')).map((l) => l.id);
  check(oldPair.includes('saseol-vs-gasa') && oldPair.length > foldPair.length, '(음성) 예전 짝짓기는 같은 개념을 묶은 넓은 줄까지 밝힌다 ' + JSON.stringify(oldPair));
  const towerLines = [{ id: 'floor', conceptIds: ['hyangga-lines'] }, ...HYANGGA_PAGE.lines];
  check(same(pairedLineIds(['hyangga-lines'], towerLines), ['floor', 'hyangga-count']), '좁기가 같은 줄(층 줄과 구 세기 줄)은 함께 짝이 된다');
  // 음성 사례: 처음 제안된 '세 음보 줄 80% 미만' 규칙은 고려가요 노래를 건다(건전하지 않다)
  const ratioRule = { genre: 'goryeo', lineKind: 'tap', conceptId: 'goryeo-3beat', test: (e) => { const c = tapCounts(e.tap); return c.filter((x) => x === 3).length / c.length < 0.8; } };
  check(mismatches(S('dongdong'), { genre: 'goryeo' }, null, [...CONTRAST_RULES, ratioRule]).length > 0, '(음성) 비율 규칙을 넣으면 「동동」이 자기 갈래 칸과 어긋난다고 나온다');
}

// ── 6-3. 드러남(판정에서 맞은 노래는 갈래 단위 이름으로 부른다) ──
section('6-3. 드러남: 판정에서 맞아 고정된 노래, 바구니로 보낸 노래, 튜토리얼 노래');
{
  const { engine } = bareEngine();
  check(!engine.isRevealed('taesan'), '튜토리얼 전에는 튜토리얼 노래도 드러나지 않았다');
  engine.completeTutorial();
  check(engine.isRevealed('taesan'), '튜토리얼을 마치면 튜토리얼 노래가 드러난다');
  engine.place('hyangga', 'shelf', 0, 'seodongyo');
  engine.place('hyangga', 'shelf', 1, 'gasiri');
  check(!engine.isRevealed('seodongyo'), '(음성) 꽂기만 하고 판정 전이면 드러나지 않는다');
  engine.place('hyangga', 'shelf', 2, 'chan-giparangga');
  engine.judge('hyangga', 'shelf');
  check(engine.isRevealed('seodongyo') && engine.isRevealed('chan-giparangga') && !engine.isRevealed('gasiri'), '판정에서 맞아 고정된 노래만 드러난다(틀린 노래는 아니다)');
  engine.place('hyangga', 'basket', 0, 'gasiri', 'goryeo');
  engine.place('hyangga', 'basket', 1, 'cheongsanri-byeokgyesu', 'gasa');
  engine.judge('hyangga', 'basket');
  check(engine.isRevealed('gasiri') && !engine.isRevealed('cheongsanri-byeokgyesu'), '바구니에서 맞게 보낸 노래는 드러나고, 틀린 노래는 아니다');
  check(engine.marksKnown('gasiri') && !engine.marksKnown('cheongsan-byeolgok'), '박 밖 음보 이름표: 드러난 노래는 단다, 고려가요관에서 재지 않은 노래는 달지 않는다');
  const p2 = JSON.parse(JSON.stringify(engine.progress));
  p2.wings.goryeo.measured = ['cheongsan-byeolgok'];
  const { engine: e2 } = bareEngine({ progress: p2 });
  check(e2.marksKnown('cheongsan-byeolgok') && !e2.isRevealed('cheongsan-byeolgok'), '고려가요관에서 잰 노래(후렴 고리 걸기를 거침)는 드러나기 전에도 이름표를 단다');
}

// ── 7. 길 잃은 노래의 행선지 ──
section('7. 길 잃은 노래 행선지(spec 4.3): 실제 노래 표 전체');
{
  // 규칙 함수: 관 상태를 넣어 본다
  let ruleOk = true;
  for (const w of PLAY_WING_IDS) {
    for (const s of WING_TABLE[w].stray) {
      const states = {};
      for (const x of PLAY_WING_IDS) states[x] = wingById(x).order < wingById(w).order ? 'done' : wingById(x).order === wingById(w).order ? 'open' : 'locked';
      const r = routeStray({ table: SONG_TABLE, songId: s.songId, to: s.to, wingStates: states });
      const want = (ROUTING.prewait[s.to] ?? []).includes(s.songId) ? 'prewait' : 'returned';
      const wantList = want === 'prewait' ? ROUTING.prewait[s.to] : ROUTING.returned[s.to];
      if (r.kind !== want || r.wing !== s.to || !(wantList ?? []).includes(s.songId)) { ruleOk = false; console.log('      ' + s.songId + ' → ' + r.kind); }
    }
  }
  check(ruleOk, '길 잃은 노래 열 편 모두 표(ROUTING)대로 미리 잰 대기 또는 돌아온 노래 선반으로 간다');
  const doneGoryeo = routeStray({ table: SONG_TABLE, songId: 'gasiri', to: 'goryeo', wingStates: { goryeo: 'done' } });
  check(doneGoryeo.kind === 'returned', '(음성) 도착할 관을 이미 마쳤다면 칸 노래라도 돌아온 노래 선반으로 간다');

  // 엔진으로 다섯 관을 끝까지 하고 결과를 표와 맞춘다
  const { engine } = bareEngine();
  engine.completeTutorial();
  for (const w of PLAY_WING_IDS) playWing(engine, w);
  const pw = engine.progress.prewaiting;
  const rt = engine.progress.returned;
  const norm = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v.length).map(([k, v]) => [k, sorted(v)]));
  check(same(norm(pw), norm(ROUTING.prewait)), '엔진의 미리 잰 대기 목록이 표와 같다');
  check(same(norm(rt), norm(ROUTING.returned)), '엔진의 돌아온 노래 선반 목록이 표와 같다');
  check(same(engine.returnedAt('sijo').sort(), sorted(ROUTING.returned.sijo)), '시조관 돌아온 노래 선반: 청산리 벽계수야, 오백 년 도읍지를, 어져 내 일이여');

  // 미리 잰 노래는 그 관에서 잰 것으로 친다
  const { engine: e3 } = bareEngine();
  e3.completeTutorial();
  playWing(e3, 'hyangga');
  check(e3.isMeasured('goryeo', 'gasiri') && !e3.isMeasured('goryeo', 'cheongsan-byeolgok'), '미리 잰 노래(가시리)는 고려가요관에서 다시 재지 않아도 된다');
  check(same(e3.waitingAt('goryeo'), ['gasiri']), '고려가요관 입구에 가시리가 기다린다');
  e3.place('goryeo', 'shelf', 0, 'gasiri');
  e3.place('goryeo', 'shelf', 1, 'cheongsan-byeolgok');
  e3.place('goryeo', 'shelf', 2, 'seogyeong-byeolgok');
  e3.judge('goryeo', 'shelf');
  check(e3.waitingAt('goryeo').length === 0, '칸에 묶이면 더는 입구에서 기다리지 않는다');
  check(e3.progress.wings.goryeo.shelfBound, '미리 잰 노래도 칸 판정은 똑같이 받는다');
}

// ── 8. 개념: 연필과 먹 ──
section('8. 개념(spec 7.2): 확인한 서로 다른 노래 1편 = 연필, 2편 이상 = 먹, 되돌아가지 않음');
{
  const { engine, emit } = bareEngine();
  check(engine.conceptState('sijo-3jang') === 'none', '처음에는 none');
  engine.completeTutorial();
  check(engine.conceptState('sijo-3jang') === 'pencil' && same(engine.progress.concepts['sijo-3jang'].songs, ['taesan']), '튜토리얼 재기를 마치면 튜토리얼 노래의 개념이 연필이 된다');
  check(emit.of('concept:changed').some((e) => e.detail.conceptId === 'sijo-final3' && e.detail.state === 'pencil' && same(e.detail.songs, ['taesan'])), 'concept:changed { conceptId, state, songs }를 낸다');
  check(engine.conceptState('hyangga-lines') === 'none', '다른 갈래 개념은 그대로 none');
  emit.clear();
  WING_TABLE.hyangga.shelf.forEach((id, i) => engine.place('hyangga', 'shelf', i, id));
  engine.judge('hyangga', 'shelf');
  check(engine.conceptState('hyangga-lines') === 'ink', '칸이 묶이면 세 편이 한꺼번에 확인되어 공통 개념은 바로 먹');
  check(engine.conceptState('hyangga-442') === 'pencil' && engine.conceptState('hyangga-exclaim') === 'pencil', '한 편만 가진 개념은 연필');
  check(!emit.of('concept:changed').some((e) => e.detail.conceptId === 'hyangga-lines' && e.detail.state === 'pencil'), '묶임으로 바로 먹이 되면 연필 단계 사건 없이 먹을 낸다');
  engine.completeRoom('hyangga', { room: 'hyangga' });
  check(engine.conceptState('hyangga-442') === 'ink' && engine.conceptState('hyangga-exclaim') === 'ink', '작품 방을 마치면 작품이 확인되어 먹이 된다');
  // 길 잃은 노래: 바구니 통과 때 자기 갈래 개념
  engine.place('hyangga', 'basket', 0, 'gasiri', 'goryeo');
  engine.place('hyangga', 'basket', 1, 'cheongsanri-byeokgyesu', 'goryeo');
  engine.judge('hyangga', 'basket');
  check(engine.conceptState('goryeo-refrain') === 'pencil', '바구니를 통과한 길 잃은 노래는 자기 갈래 개념을 확인한다');
  check(engine.conceptState('sijo-3jang') === 'pencil', '행선지가 틀려 돌아온 노래는 확인하지 않는다');
  engine.place('hyangga', 'basket', 1, 'cheongsanri-byeokgyesu', 'sijo');
  engine.judge('hyangga', 'basket');
  check(engine.conceptState('sijo-3jang') === 'ink', '두 번째 서로 다른 노래가 확인하면 먹');
  // 같은 노래가 두 번 확인해도 한 편
  engine.place('goryeo', 'shelf', 0, 'gasiri');
  engine.place('goryeo', 'shelf', 1, 'cheongsan-byeolgok');
  engine.place('goryeo', 'shelf', 2, 'seogyeong-byeolgok');
  engine.judge('goryeo', 'shelf');
  check(same(sorted(engine.progress.concepts['goryeo-refrain'].songs), sorted(['gasiri', 'cheongsan-byeolgok', 'seogyeong-byeolgok'])), '같은 노래(가시리)는 두 번 확인해도 한 편으로 센다');
  // 되돌아가지 않음
  const p = defaultProgress();
  p.concepts['gasa-4beat'] = { state: 'ink', songs: [] };
  p.concepts['gasa-nolimit'] = { state: 'none', songs: ['gyuwonga', 'sangchungok'] };
  const n = normalizeData({ version: 1, device: {}, slots: { z: { id: 'z', name: 'z', appearance: 'a', createdAt: 'x', updatedAt: 'x', progress: p } }, lastSlotId: null });
  check(n.slots.z.progress.concepts['gasa-4beat'].state === 'ink', '불러올 때 먹은 먹으로 남는다(노래 목록이 짧아도)');
  check(n.slots.z.progress.concepts['gasa-nolimit'].state === 'ink', '불러올 때 노래 수보다 낮은 상태는 맞춰 올린다');
  const { engine: e2 } = bareEngine({ progress: n.slots.z.progress });
  const em = e2.conceptState('gasa-4beat');
  check(em === 'ink', '먹은 어떤 행동으로도 연필로 내려가지 않는다');
  // 덤과 보스는 확인에 들지 않아도 먹이 될 수 있다(반드시 지나는 길만으로): 다섯 관 + 튜토리얼 뒤 모든 개념이 먹
  const { engine: e3 } = bareEngine();
  e3.completeTutorial();
  for (const w of PLAY_WING_IDS) playWing(e3, w);
  check(CONCEPT_IDS.every((c) => e3.conceptState(c) === 'ink'), '반드시 지나는 길만으로 모든 개념이 먹이 된다(덤·보스 없이)');
}

// ── 9. 보스 ──
section('9. 보스(spec 10): 열림 조건, 단계, 1단계 기록, 일지 도움, 2단계 틀림 정의');
{
  const { engine, emit } = bareEngine();
  engine.completeTutorial();
  for (const w of PLAY_WING_IDS.slice(0, 4)) playWing(engine, w);
  check(!engine.isBossOpen() && engine.progress.boss.state === 'locked' && !engine.enterBoss().ok, '네 관만 마치면 보스는 잠겨 있다');
  playWing(engine, 'saseol', { room: false });
  check(!engine.isBossOpen(), '마지막 관의 방을 마치기 전에는 잠겨 있다');
  engine.completeRoom('saseol', { room: 'saseol' });
  check(engine.isBossOpen() && engine.progress.boss.state === 'stage1', '다섯 관을 모두 마치면 보스가 열리고 1단계로 시작한다');
  check(engine.enterBoss().ok && engine.enterBoss().stage === 'stage1', '보스에 들어간다');
  check(!engine.bossStage2Tap({ tapMs: 0, switchesMs: [0] }).ok && !engine.bossPlaceStage3('sijo').ok, '1단계에서 2·3단계 행동은 막힌다');

  // 1단계: 정해진 순서 가사 → 향가 → 고려가요 → 시조 → 사설시조
  const order = BOSS_TABLE.unseenOrder.map((g) => BOSS_TABLE.unseen[g]);
  check(engine.currentUnseen() === order[0] && order[0] === 'gapminga', '1단계 첫 노래는 가사(갑민가)');
  check(!engine.bossPlaceUnseen('wonwangsaengga', 'hyangga').ok, '차례가 아닌 노래는 꽂을 수 없다(무작위·건너뛰기 없음)');
  emit.clear();
  const w1 = engine.bossPlaceUnseen('gapminga', 'sijo');
  check(w1.ok && w1.correct === false && engine.progress.boss.unseen.gapminga.firstTryCorrect === false && engine.progress.boss.stageWrong === 1, '틀리게 꽂으면 바로 판정하고 처음에 못 맞힘으로 기록한다');
  check(!engine.bossChooseSinger('gapminga', 'literati-women').ok, '맞게 꽂기 전에는 누가 불렀을까를 고를 수 없다');
  const c1 = engine.bossPlaceUnseen('gapminga', 'gasa');
  check(c1.ok && c1.correct && engine.progress.boss.unseen.gapminga.firstTryCorrect === false, '뒤에 맞혀도 처음 기록은 바뀌지 않는다');
  check(!engine.bossPlaceUnseen('gapminga', 'gasa').ok, '맞게 꽂은 뒤에는 다시 꽂지 않는다');
  const s1 = engine.bossChooseSinger('gapminga', 'singer-commoner');
  check(s1.ok && s1.correct === true && same(s1.answer, SINGER_GROUPS.gapminga), '정답 무리가 여럿이면 그 가운데 어느 것도 맞다');
  check(engine.progress.boss.unseen.gapminga.done && engine.progress.boss.unseen.gapminga.singerGroupCorrect === true, '노래 기록이 끝난다');
  // 향가: 처음에 맞힘, 무리 틀림
  const c2 = engine.bossPlaceUnseen('wonwangsaengga', 'hyangga');
  check(c2.correct && engine.progress.boss.unseen.wonwangsaengga.firstTryCorrect === true, '처음에 맞히면 firstTryCorrect: true');
  const s2 = engine.bossChooseSinger('wonwangsaengga', 'singer-commoner');
  check(s2.ok && s2.correct === false && same(s2.answer, ['monk-hwarang']) && engine.progress.boss.unseen.wonwangsaengga.done, '무리를 틀려도 정답 무리를 알려 주고 다음 노래로 간다');
  check(engine.progress.boss.unseen.wonwangsaengga.singerGroupCorrect === false, '무리 정답 여부만 기록한다');
  // 고려가요: 두 번 틀려 같은 단계 오답 3번 → 일지 도움
  check(emit.of('help:journal-glow').length === 0, '같은 단계 오답이 3번 전에는 일지가 반짝이지 않는다');
  engine.bossPlaceUnseen('samogok', 'sijo');
  const w3 = engine.bossPlaceUnseen('samogok', 'saseol');
  const jg = emit.of('help:journal-glow');
  const samo = REAL_SONGS.find((x) => x.id === 'samogok');
  const expSaseol = [...new Set(mismatches(samo, { genre: 'saseol' }, []).map((m) => m.conceptId))];
  check(engine.progress.boss.stageWrong === 3 && jg.length === 1 && jg[0].detail.stage === 1 && jg[0].detail.songId === 'samogok' && expSaseol.length > 0 && same(jg[0].detail.conceptIds, expSaseol), '같은 단계에서 3번 틀리면 일지가 반짝인다: 꽂은 자리(사설시조) 갈래의 어긋나는 개념 ' + JSON.stringify(jg[0]?.detail));
  check(!jg[0].detail.conceptIds.some((c) => c.startsWith('goryeo')), '(음성) 노래 자기 갈래(고려가요) 개념은 싣지 않는다');
  check(engine.progress.boss.unseen.samogok.journalHelp === true && engine.progress.boss.unseen.gapminga.journalHelp === false, '1단계에서는 그 노래에 일지 도움을 기록한다');
  engine.bossPlaceUnseen('samogok', 'goryeo');
  engine.bossChooseSinger('samogok', 'court-goryeo');
  check(engine.currentUnseen() === 'sinheum-sijo', '다음은 시조');

  // 이어 하기: 저장에서 다시 불러오면 마친 노래 기록은 유지, 진행 중이던 노래는 다시
  const saved = JSON.parse(JSON.stringify(engine.progress));
  engine.bossPlaceUnseen('sinheum-sijo', 'sijo'); // 맞게 꽂았지만 무리를 고르기 전에 나감
  const savedMid = JSON.parse(JSON.stringify(engine.progress));
  const { engine: back, emit: backEmit } = bareEngine({ progress: savedMid });
  check(back.progress.boss.state === 'stage1' && back.currentUnseen() === 'sinheum-sijo', '보스 도중에 나갔다 오면 진행 중이던 노래를 다시 한다');
  check(back.progress.boss.unseen.gapminga.done && back.progress.boss.unseen.samogok.journalHelp, '마친 노래의 기록은 유지된다');
  check(back.progress.boss.unseen['sinheum-sijo'].firstTryCorrect === true && !back.progress.boss.unseen['sinheum-sijo'].done, '진행 중이던 노래의 처음 기록은 남고 노래는 다시 한다');
  check(!back.bossChooseSinger('sinheum-sijo', 'literati-gisaeng').ok, '다시 들어오면 꽂기부터 다시 한다');
  back.bossPlaceUnseen('sinheum-sijo', 'sijo');
  check(back.progress.boss.unseen['sinheum-sijo'].firstTryCorrect === true, '다시 꽂아도 처음 기록은 그대로');
  back.bossChooseSinger('sinheum-sijo', 'literati-gisaeng');
  back.bossPlaceUnseen('suneung-saseol', 'saseol');
  const last = back.bossChooseSinger('suneung-saseol', 'singer-commoner');
  check(last.ok && back.progress.boss.state === 'stage2' && back.progress.boss.stageWrong === 0, '다섯 편을 마치면 2단계로 가고 단계 오답 수는 0으로 돌아간다');
  void saved;

  // 2단계: 바뀌는 지점 근처가 아닌 곳을 탭하면 틀림
  const sw = [10000, 20000, 30000, 40000];
  check(judgeRemixTap(10000, sw) === 0 && judgeRemixTap(15000, sw) === null, '판정기: 지점 근처면 그 지점, 아니면 틀림(null)');
  check(judgeRemixTap(20000 + REMIX_TAP_WINDOW_MS.after, sw) === 1 && judgeRemixTap(20000 + REMIX_TAP_WINDOW_MS.after + 1, sw) === null, '판정 창 끝 경계');
  check(judgeRemixTap(30000 - REMIX_TAP_WINDOW_MS.before, sw) === 2 && judgeRemixTap(30000 - REMIX_TAP_WINDOW_MS.before - 1, sw) === null, '판정 창 앞 경계');
  check(judgeRemixTap(10100, sw, { before: 0, after: 50 }) === null, '판정 창은 조정할 수 있다');
  check(judgeRemixLine(3, [1, 3, 5, 7]) === 1 && judgeRemixLine(2, [1, 3, 5, 7]) === null, '박자 없는 방식: 바뀌는 줄을 탭하면 맞고, 아니면 틀림');
  backEmit.clear();
  const t1 = back.bossStage2Tap({ tapMs: 15000, switchesMs: sw }, { conceptIds: ['gasa-4beat'] });
  check(t1.ok && t1.wrong && back.progress.boss.stageWrong === 1, '2단계: 지점 근처가 아닌 탭은 틀림으로 센다');
  back.bossStage2Tap({ tapMs: 25000, switchesMs: sw });
  back.bossStage2Tap({ tapMs: 35000, switchesMs: sw }, { conceptIds: ['sijo-3jang'] });
  const jg2 = backEmit.of('help:journal-glow');
  check(jg2.length === 1 && jg2[0].detail.stage === 2 && same(jg2[0].detail.conceptIds, ['sijo-3jang']), '2단계에서도 3번 틀리면 일지가 반짝인다');
  check(Object.values(back.progress.boss.unseen).every((u) => typeof u.journalHelp === 'boolean') && back.progress.boss.unseen.gapminga.journalHelp === false, '2단계 도움은 노래 기록에 남기지 않는다');
  const hit = back.bossStage2Tap({ tapMs: 10200, switchesMs: sw });
  check(hit.ok && !hit.wrong && hit.found === 0 && back.progress.boss.state === 'stage2', '지점을 찾으면 기록하고, 다 찾을 때까지 2단계');
  back.bossStage2Tap({ tapMs: 10300, switchesMs: sw });
  check(back.progress.boss.stageWrong === 3, '이미 찾은 지점 근처를 다시 탭해도 틀림이 아니다');
  // 2단계 도중에 나가면 2단계는 처음부터(마친 단계는 유지)
  const mid2 = JSON.parse(JSON.stringify(back.progress));
  const { engine: back2 } = bareEngine({ progress: mid2 });
  check(back2.progress.boss.state === 'stage2', '2단계 도중에 나가도 마친 1단계는 유지된다');
  back2.bossStage2Tap({ line: 1, switchLines: [1, 3, 5, 7] });
  back2.bossStage2Tap({ line: 3, switchLines: [1, 3, 5, 7] });
  back2.bossStage2Tap({ line: 5, switchLines: [1, 3, 5, 7] });
  check(back2.progress.boss.state === 'stage2', '넷 가운데 셋만 찾으면 아직 2단계');
  back2.bossStage2Tap({ line: 7, switchLines: [1, 3, 5, 7] });
  check(back2.progress.boss.state === 'stage3' && back2.progress.boss.stageWrong === 0, '바뀌는 지점 넷을 다 찾으면 3단계(박자 없는 방식으로도 끝까지)');
  // 3단계
  check(judgeStage3Placement({ table: SONG_TABLE, wingId: 'sijo' }) && !judgeStage3Placement({ table: SONG_TABLE, wingId: 'saseol' }), '판정기: 3단계 노래(태산)는 시조 자리만 맞다');
  emit.clear();
  const s3w = back2.bossPlaceStage3('saseol');
  check(s3w.ok && s3w.correct === false && back2.progress.boss.stageWrong === 1 && back2.progress.boss.state === 'stage3', '3단계: 잘못된 자리는 틀림');
  const s3 = back2.bossPlaceStage3('sijo');
  check(s3.ok && s3.correct && back2.progress.boss.state === 'done', '시조 자리에 꽂으면 보스를 마친다');
  check(!back2.enterBoss().ok, '마친 보스는 다시 할 수 없다');
  check(back2.resumeInfo().scene === 'ending', '보스 뒤 이어 하기는 엔딩부터');

  // 순수 판정기
  check(judgeUnseenPlacement({ table: SONG_TABLE, songId: 'gapminga', wingId: 'gasa' }) && !judgeUnseenPlacement({ table: SONG_TABLE, songId: 'gapminga', wingId: 'goryeo' }), '판정기: 낯선 노래는 자기 갈래 관 자리만 맞다');
  check(judgeSingerGroup({ singerGroups: ['monk-hwarang'] }, 'monk-hwarang') && !judgeSingerGroup({ singerGroups: ['monk-hwarang'] }, 'court-goryeo') && !judgeSingerGroup({}, 'monk-hwarang'), '판정기: 누가 불렀을까');
}

// ── 10. 엔딩과 서고 완성 뒤 ──
section('10. 엔딩과 서고 완성 뒤(spec 11, 13): 덤과 다시 듣기는 되고 기록은 바뀌지 않음');
let finishedProgress = null;
{
  const { engine } = bareEngine();
  engine.completeTutorial();
  for (const w of PLAY_WING_IDS) playWing(engine, w);
  check(!engine.completeEnding({ line: '노래', wing: 'sijo', conceptId: 'sijo-3jang', note: '' }).ok, '보스를 마치기 전에는 엔딩을 할 수 없다');
  engine.enterBoss();
  for (const g of BOSS_TABLE.unseenOrder) {
    const id = BOSS_TABLE.unseen[g];
    engine.bossPlaceUnseen(id, wingOfGenre(g).id);
    engine.bossChooseSinger(id, SINGER_GROUPS[id][0]);
  }
  ['a', 'b', 'c', 'd'].forEach((_, i) => engine.bossStage2Tap({ line: i, switchLines: [0, 1, 2, 3] }));
  engine.bossPlaceStage3('sijo');
  check(engine.progress.boss.state === 'done', '보스를 마쳤다');
  const bad = [
    [{ line: '', wing: 'sijo', conceptId: 'sijo-3jang', note: '' }, '빈 한 줄'],
    [{ line: '   ', wing: 'sijo', conceptId: 'sijo-3jang', note: '' }, '공백만 있는 한 줄'],
    [{ line: '가'.repeat(41), wing: 'sijo', conceptId: 'sijo-3jang', note: '' }, '41자 한 줄'],
    [{ line: '노래', wing: 'sijo', conceptId: 'sijo-3jang', note: '나'.repeat(61) }, '61자 한마디'],
    [{ line: '노래', wing: 'sijo', conceptId: 'gasa-4beat', note: '' }, '그 관 갈래가 아닌 개념'],
    [{ line: '노래', wing: 'entrance', conceptId: 'sijo-3jang', note: '' }, '판을 하는 관이 아닌 자리'],
    [{ line: '노래', wing: 'sijo', conceptId: 'nope', note: '' }, '없는 개념'],
  ];
  for (const [arg, label] of bad) check(!engine.completeEnding(arg).ok && !engine.progress.ending.completed, '엔딩 입력 막힘: ' + label);
  // 먹이 아닌 개념은 근거가 될 수 없다
  const { engine: eP } = bareEngine({ progress: (() => { const x = JSON.parse(JSON.stringify(engine.progress)); x.concepts['sijo-final3'] = { state: 'pencil', songs: ['taesan'] }; return x; })() });
  check(!eP.completeEnding({ line: '노래', wing: 'sijo', conceptId: 'sijo-final3', note: '' }).ok, '먹이 아닌 개념은 근거로 고를 수 없다');
  // 엔딩 글도 글자 단위로 세고 NFC로 맞춰 저장한다
  {
    const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    const fresh = () => bareEngine({ progress: JSON.parse(JSON.stringify(engine.progress)) }).engine;
    check(fresh().completeEnding({ line: FAMILY.repeat(40), wing: 'sijo', conceptId: 'sijo-final3', note: FAMILY.repeat(60) }).ok, '이모지 40개 한 줄(코드 포인트 200), 60개 한마디는 40자·60자라 된다');
    const long = fresh().completeEnding({ line: FAMILY.repeat(41), wing: 'sijo', conceptId: 'sijo-final3', note: '' });
    check(!long.ok && long.reason === 'line-length', '이모지 41개 한 줄은 41자라 막는다');
    const longNote = fresh().completeEnding({ line: '노래', wing: 'sijo', conceptId: 'sijo-final3', note: FAMILY.repeat(61) });
    check(!longNote.ok && longNote.reason === 'note-length', '이모지 61개 한마디는 61자라 막는다');
    const eN = fresh();
    const rN = eN.completeEnding({ line: ' ' + '한글 노래'.normalize('NFD') + '  ', wing: 'sijo', conceptId: 'sijo-final3', note: '마음'.normalize('NFD') });
    check(rN.ok && eN.progress.ending.line === '한글 노래' && eN.progress.ending.note === '마음', '풀어 쓴(NFD) 한 줄과 한마디는 NFC로 맞춰 저장한다');
  }
  const okEnd = engine.completeEnding({ line: '  '.concat('가'.repeat(40), ' '), wing: 'sijo', conceptId: 'sijo-final3', note: '나'.repeat(60) });
  check(okEnd.ok && engine.progress.ending.completed && engine.isCompleted() && engine.progress.ending.line === '가'.repeat(40), '40자 한 줄, 60자 한마디로 꽂으면 서고가 완성된다');
  check(engine.progress.ending.completedAt && engine.progress.ending.wing === 'sijo' && engine.progress.ending.conceptId === 'sijo-final3', '엔딩 선택을 기록한다');
  check(engine.completeEnding({ line: '노래', wing: 'sijo', conceptId: 'sijo-3jang', note: '' }).ok === false, '한마디 없이(0자)도 되지만, 완성 뒤 엔딩은 다시 할 수 없다');

  // 완성 뒤
  const snapshot = JSON.stringify({ wings: PLAY_WING_IDS.map((w) => ({ ...engine.progress.wings[w], bonusDone: null, placements: { ...engine.progress.wings[w].placements, bonus: null }, measured: null })), boss: engine.progress.boss, ending: engine.progress.ending, rooms: engine.progress.rooms });
  check(!engine.enterBoss().ok && !engine.bossPlaceStage3('sijo').ok && !engine.bossPlaceUnseen('gapminga', 'gasa').ok, '완성 뒤 보스는 다시 할 수 없다');
  check(!engine.completeRoom('sijo', { room: 'sijo', changed: true }).ok, '완성 뒤 작품 방 기록은 바뀌지 않는다');
  check(!engine.place('sijo', 'shelf', 0, 'dongjitdal').ok && !engine.unplace('sijo', 'shelf', 0).ok && !engine.judge('sijo', 'shelf').ok, '완성 뒤 칸 판정 기록은 바뀌지 않는다');
  check(engine.canEnter('sijo') && engine.markMeasured('sijo', 'ihwa-wolbaek').ok, '완성 뒤에도 관에 다시 들어가 노래를 다시 들을(잴) 수 있다');
  check(engine.place('sijo', 'bonus', 0, 'ihwa-wolbaek').ok, '완성 뒤에도 덤을 할 수 있다');
  engine.place('sijo', 'bonus', 1, 'hanson-makdae');
  engine.place('sijo', 'bonus', 2, 'sakpung');
  check(engine.judge('sijo', 'bonus').bound && engine.progress.wings.sijo.bonusDone, '완성 뒤 덤을 묶는다');
  const after = JSON.stringify({ wings: PLAY_WING_IDS.map((w) => ({ ...engine.progress.wings[w], bonusDone: null, placements: { ...engine.progress.wings[w].placements, bonus: null }, measured: null })), boss: engine.progress.boss, ending: engine.progress.ending, rooms: engine.progress.rooms });
  check(snapshot === after, '덤을 해도 판정·보스·엔딩·방 기록은 그대로다');
  check(engine.resumeInfo().scene === 'complete', '완성된 기록의 이어 하기 상태는 complete');
  finishedProgress = engine.progress;
}

// ── 11. 이어 하기 ──
section('11. 이어 하기(spec 20): 저장한 곳부터, 작품 방은 처음부터');
{
  const storage = memoryStorage();
  const store = createStore({ storage, emit: recorder(), now: clock() });
  store.load();
  const { record } = store.createRecord('이음');
  const g = openRecord(store, record.id, { songs: SONGS, emit: recorder(), now: clock() });
  check(g.resumeInfo().scene === 'entrance', '새 기록은 입구부터');
  g.completeTutorial();
  WING_TABLE.hyangga.shelf.forEach((id, i) => g.place('hyangga', 'shelf', i, id));
  g.judge('hyangga', 'shelf');
  g.place('hyangga', 'basket', 0, 'gasiri', 'goryeo');
  // 창을 닫았다가 다시 연다(방에 들어갔다가 도중에 나감 = 방 기록 없음)
  const store2 = createStore({ storage, emit: recorder(), now: clock() });
  store2.load();
  const g2 = openRecord(store2, record.id, { songs: SONGS, emit: recorder(), now: clock() });
  const info = g2.resumeInfo();
  check(info.scene === 'wing' && info.wing === 'hyangga', '판 도중에 닫으면 그 관부터 이어 한다');
  check(g2.progress.wings.hyangga.shelfBound && g2.progress.wings.hyangga.placements.basket[0]?.songId === 'gasiri' && !g2.progress.wings.hyangga.placements.basket[0].fixed, '마지막으로 저장한 꽂기 상태가 남는다');
  check(info.room === 'restart' && g2.progress.rooms.hyangga === null && !g2.progress.wings.hyangga.roomDone, '작품 방은 처음부터 다시 하고 칸 묶음은 유지된다');
  check(g2.isRoomOpen('hyangga'), '다시 와도 방 문은 열려 있다');
  // 덤 도중에 나가도 덤 칸 상태가 남는다
  g2.place('hyangga', 'basket', 1, 'cheongsanri-byeokgyesu', 'sijo');
  g2.judge('hyangga', 'basket');
  g2.completeRoom('hyangga', { room: 'hyangga', interpretationId: 'x' });
  g2.place('hyangga', 'bonus', 0, 'heonhwaga');
  const store3 = createStore({ storage, emit: recorder(), now: clock() });
  store3.load();
  const g3 = openRecord(store3, record.id, { songs: SONGS, emit: recorder(), now: clock() });
  check(g3.progress.wings.hyangga.placements.bonus[0]?.songId === 'heonhwaga', '덤 칸 중간에 나가도 꽂아 둔 상태가 남는다');
  check(same(g3.progress.rooms.hyangga, { room: 'hyangga', interpretationId: 'x' }), '마친 방의 기록이 남는다');
  check(g3.resumeInfo().scene === 'wing' && g3.resumeInfo().wing === 'goryeo', '마친 관 다음 관부터 이어 한다');
  // 마친 방은 다시 마칠 수 없다(기록 고정)
  check(!g3.completeRoom('hyangga', { room: 'hyangga', interpretationId: 'y' }).ok && g3.progress.rooms.hyangga.interpretationId === 'x', '마친 방의 기록은 바뀌지 않는다');
  // 고유 동작 안내
  check(g3.markUniqueActionIntroSeen('goryeo').ok && g3.progress.wings.goryeo.uniqueActionIntroSeen, '고유 동작 안내를 본 것을 기록한다');
  check(!g3.markUniqueActionIntroSeen('sijo').ok, '잠긴 관의 안내는 기록하지 않는다');
}

// ── 12. 결과 카드 자료 ──
section('12. 결과 카드 자료(spec 12): 지금 기록으로 다시 만들고 점수는 없다');
{
  const now = clock();
  const rec = { id: 'r', name: '달빛', appearance: 'b', createdAt: 'x', updatedAt: 'x', progress: JSON.parse(JSON.stringify(finishedProgress)) };
  rec.progress.wings.hyangga.bonusDone = false;
  const card = buildWingCard(rec, 'hyangga', { songs: SONGS, table: SONG_TABLE });
  check(card && card.recordName === '달빛' && card.appearance === 'b' && card.wingName === '향가관', '판 카드: 기록 이름, 생김새, 관 이름');
  check(same(card.shelfSongs.map((s) => s.id), WING_TABLE.hyangga.shelf) && card.shelfSongs.every((s) => s.title), '판 카드: 꽂은 칸 노래 세 편(층 순)과 제목');
  check(same(card.concepts.map((c) => c.id), conceptsOfGenre('hyangga').map((c) => c.id)) && card.concepts.every((c) => ['pencil', 'ink'].includes(c.state) && c.text), '판 카드: 그 관 갈래의 개념 상태');
  check(same(card.room, rec.progress.rooms.hyangga), '판 카드: 작품 방 기록');
  check(card.bonusDone === false && card.date === rec.progress.wings.hyangga.doneAt, '판 카드: 덤 여부와 날짜');
  check(card.fileName === '옛노래서고_달빛_향가관.png', '판 카드 파일 이름 기본값');
  rec.progress.wings.hyangga.bonusDone = true;
  check(buildWingCard(rec, 'hyangga', { songs: SONGS, table: SONG_TABLE }).bonusDone === true, '나중에 덤을 하면 다시 만든 카드에 반영된다');
  const fresh = { id: 'f', name: '새', appearance: 'a', progress: defaultProgress() };
  check(buildWingCard(fresh, 'hyangga', { songs: SONGS, table: SONG_TABLE }) === null, '마치지 않은 관은 판 카드가 없다');
  check(buildFinalCard(fresh, { songs: SONGS, table: SONG_TABLE }) === null, '서고 완성 전에는 마지막 카드가 없다');

  const fin = buildFinalCard(rec, { songs: SONGS, table: SONG_TABLE });
  check(fin && fin.recordName === '달빛' && fin.appearance === 'b', '마지막 카드: 기록 이름과 생김새');
  check(same(fin.wings.map((w) => w.id), PLAY_WING_IDS) && fin.wings.every((w) => w.done && w.name), '마지막 카드: 다섯 관 완료 표시');
  check(same(fin.inkConcepts.map((c) => c.id), CONCEPT_IDS) && fin.inkConcepts.every((c) => c.text), '마지막 카드: 먹 개념 목록');
  check(same(fin.boss.map((b) => b.songId), BOSS_TABLE.unseenOrder.map((g) => BOSS_TABLE.unseen[g])) && fin.boss.every((b) => typeof b.firstTryCorrect === 'boolean' && typeof b.journalHelp === 'boolean' && typeof b.singerGroupCorrect === 'boolean' && b.title), '마지막 카드: 낯선 노래 다섯 편의 세 기록');
  check(fin.ending.line === rec.progress.ending.line && fin.ending.wingName === '시조관' && fin.ending.conceptText && fin.ending.note === rec.progress.ending.note, '마지막 카드: 엔딩 한 줄·관·근거·한마디');
  check(fin.date === rec.progress.ending.completedAt && fin.fileName === '옛노래서고_달빛_마지막.png', '마지막 카드: 날짜와 파일 이름');
  const scoreLike = /score|grade|rank|point|percent|점수|등급|순위/i;
  const keysOf = (o) => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => [k, ...keysOf(v)]) : []);
  check(![...keysOf(card), ...keysOf(fin)].some((k) => scoreLike.test(k)), '카드 자료에 점수·등급·순위가 없다');
  check(scoreLike.test('totalScore'), '(음성) 점수 검사기가 점수 열쇠를 잡는다');
  void now;
}

console.log('\n' + (failures === 0 ? '모두 통과' : failures + '개 실패'));
process.exitCode = failures === 0 ? 0 : 1;
