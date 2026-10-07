// 저장 엔진과 이름별 기록(spec 13, 20 / js/data/README.md 9절).
// 로컬 저장소 열쇠 하나(yetnorae-seogo-v1)에 문서 전체를 JSON으로 둔다.
// 저장소와 시계, 사건 내기는 바깥에서 넣는다(브라우저에서는 localStorage, 시험에서는 흉내 낸 저장소).
// 저장할 수 없으면 save:failed를 내고 이번 창의 메모리로 계속한다.
// 여러 창은 막지 않는다. 쓸 때마다 저장소를 다시 읽어 이 창에서 바뀐 기록·설정만 얹으므로 다른 기록은 지워지지 않고,
// 같은 기록을 두 창에서 바꾸면 나중에 저장한 창이 이긴다(spec 13 '여러 창', 아래 createStore).
import { emit as busEmit } from './events.js';
import { AREA_SIZES } from './judge.js';
import { SONG_TABLE } from '../data/song-table.js';
import { PLAY_WING_IDS } from '../data/wings.js';
import { CONCEPT_IDS, CONCEPT_STATES } from '../data/concepts.js';
import { cleanText, graphemeCount } from './text.js';

export const SAVE_KEY = 'yetnorae-seogo-v1';
export const SAVE_VERSION = 1;

// 이름 길이(조정 가능, spec 22). 글자 수는 눈에 보이는 글자 단위(확장 자소 덩어리, ./text.js)로 센다.
export const NAME_LIMITS = Object.freeze({ nameMin: 1, nameMax: 12 });

export const APPEARANCES = ['a', 'b'];
export const WING_STATES = ['locked', 'open', 'done'];
export const BOSS_STATES = ['locked', 'stage1', 'stage2', 'stage3', 'done'];
export const TEXT_SCALES = [1, 1.15, 1.3];

// 옛 버전 → 다음 버전으로 옮기는 함수. 버전을 올릴 때 여기에 더한다(지금은 버전 1뿐이라 비어 있다).
// 예: MIGRATIONS[1] = (data) => ({ ...data, version: 2, … })
export const MIGRATIONS = {};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const uniqStrings = (a) => (Array.isArray(a) ? [...new Set(a.filter(isStr))] : []);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const charLength = graphemeCount;

// ───────────────────────── 기본값 ─────────────────────────

export function defaultDevice() {
  return {
    volume: { bgm: 0.6, voice: 1, sfx: 0.8 },
    muted: false,
    slashMode: false,
    textScale: 1,
    reduceMotion: false,
    calibrationOffsetMs: 0,
    calibrated: false,
  };
}

function defaultWing() {
  return {
    state: 'locked',
    shelfBound: false,
    basketDone: false,
    roomDone: false,
    bonusDone: false,
    uniqueActionIntroSeen: false,
    doneAt: null,
    placements: {
      shelf: Array(AREA_SIZES.shelf).fill(null),
      basket: Array(AREA_SIZES.basket).fill(null),
      bonus: Array(AREA_SIZES.bonus).fill(null),
    },
    wrongCount: 0,
    measured: [],
  };
}

export function defaultProgress(table = SONG_TABLE) {
  const unseenIds = (table.boss?.unseenOrder ?? []).map((g) => table.boss.unseen[g]);
  for (const id of Object.values(table.boss?.unseen ?? {})) if (!unseenIds.includes(id)) unseenIds.push(id);
  return {
    tutorialDone: false,
    wings: Object.fromEntries(PLAY_WING_IDS.map((w) => [w, defaultWing()])),
    prewaiting: Object.fromEntries(Object.keys(table.routing?.prewait ?? {}).map((w) => [w, []])),
    returned: Object.fromEntries(Object.keys(table.routing?.returned ?? {}).map((w) => [w, []])),
    concepts: Object.fromEntries(CONCEPT_IDS.map((c) => [c, { state: 'none', songs: [] }])),
    keepsakes: [],
    rooms: Object.fromEntries(PLAY_WING_IDS.map((w) => [w, null])),
    boss: {
      state: 'locked',
      stageWrong: 0,
      unseen: Object.fromEntries(unseenIds.map((id) => [id, { done: false, firstTryCorrect: null, journalHelp: false, singerGroupCorrect: null }])),
    },
    ending: { line: '', wing: null, conceptId: null, note: '', completed: false, completedAt: null },
  };
}

export function defaultData() {
  return { version: SAVE_VERSION, device: defaultDevice(), slots: {}, lastSlotId: null };
}

// ───────────────────────── 바로잡기(불러올 때) ─────────────────────────
// 모자란 열쇠는 기본값으로 채우고, 약속 밖의 값은 버린다.
// 진행 순서는 기록의 표시(칸 묶음·바구니·방)에서 다시 계산한다. 저장을 손대 순서를 건너뛴 상태는 잠긴다(spec 3.2).

const isVolume = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

// 기기 설정 값 하나가 약속 안인지 보고, 맞으면 정리한 값을 돌려준다(아니면 undefined).
function cleanDeviceValue(key, value, current) {
  switch (key) {
    case 'volume': {
      if (!isObj(value)) return undefined;
      const out = { ...current };
      for (const k of ['bgm', 'voice', 'sfx']) if (isVolume(value[k])) out[k] = value[k];
      return out;
    }
    case 'muted':
    case 'slashMode':
    case 'reduceMotion':
    case 'calibrated':
      return typeof value === 'boolean' ? value : undefined;
    case 'textScale':
      return TEXT_SCALES.includes(value) ? value : undefined;
    case 'calibrationOffsetMs':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    default:
      return undefined;
  }
}

export function normalizeDevice(raw) {
  const d = defaultDevice();
  if (!isObj(raw)) return d;
  for (const key of Object.keys(d)) {
    if (!(key in raw)) continue;
    const v = cleanDeviceValue(key, raw[key], d[key]);
    if (v !== undefined) d[key] = v;
  }
  return d;
}

function normalizeSlotArray(raw, size, withTo) {
  const out = Array(size).fill(null);
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < size; i++) {
    const s = raw[i];
    if (!isObj(s) || !isStr(s.songId)) continue;
    if (withTo && !PLAY_WING_IDS.includes(s.to)) continue;
    out[i] = withTo ? { songId: s.songId, to: s.to, fixed: s.fixed === true } : { songId: s.songId, fixed: s.fixed === true };
  }
  return out;
}

const higherState = (a, b) => (CONCEPT_STATES.indexOf(a) >= CONCEPT_STATES.indexOf(b) ? a : b);

export function normalizeProgress(raw, { table = SONG_TABLE } = {}) {
  const p = defaultProgress(table);
  const src = isObj(raw) ? raw : {};
  p.tutorialDone = src.tutorialDone === true;

  // 관: 표시를 옮기고 상태는 순서와 표시에서 다시 계산한다.
  let prevDone = p.tutorialDone;
  for (const w of PLAY_WING_IDS) {
    const s = isObj(src.wings?.[w]) ? src.wings[w] : {};
    const d = p.wings[w];
    for (const flag of ['shelfBound', 'basketDone', 'roomDone', 'bonusDone', 'uniqueActionIntroSeen']) d[flag] = s[flag] === true;
    d.doneAt = isStr(s.doneAt) ? s.doneAt : null;
    d.wrongCount = Number.isInteger(s.wrongCount) && s.wrongCount >= 0 ? s.wrongCount : 0;
    d.measured = uniqStrings(s.measured);
    const pl = isObj(s.placements) ? s.placements : {};
    d.placements = {
      shelf: normalizeSlotArray(pl.shelf, AREA_SIZES.shelf, false),
      basket: normalizeSlotArray(pl.basket, AREA_SIZES.basket, true),
      bonus: normalizeSlotArray(pl.bonus, AREA_SIZES.bonus, false),
    };
    if (!prevDone) d.state = 'locked';
    else d.state = d.shelfBound && d.basketDone && d.roomDone ? 'done' : 'open';
    if (d.state !== 'done') { d.bonusDone = false; d.doneAt = null; }
    prevDone = d.state === 'done';
  }

  for (const key of ['prewaiting', 'returned']) {
    if (!isObj(src[key])) continue;
    for (const w of PLAY_WING_IDS) if (Array.isArray(src[key][w])) p[key][w] = uniqStrings(src[key][w]);
  }

  // 개념: 되돌아가지 않는다. 저장된 상태와 확인한 노래 수에서 나오는 상태 가운데 높은 쪽을 쓴다.
  for (const c of CONCEPT_IDS) {
    const s = isObj(src.concepts?.[c]) ? src.concepts[c] : {};
    const songs = uniqStrings(s.songs);
    const byCount = songs.length >= 2 ? 'ink' : songs.length === 1 ? 'pencil' : 'none';
    const saved = CONCEPT_STATES.includes(s.state) ? s.state : 'none';
    p.concepts[c] = { state: higherState(saved, byCount), songs };
  }

  p.keepsakes = uniqStrings(src.keepsakes);
  for (const w of PLAY_WING_IDS) p.rooms[w] = isObj(src.rooms?.[w]) ? clone(src.rooms[w]) : null;

  // 보스: 다섯 관을 모두 마쳐야 열린다. 2단계 이상은 1단계 노래 다섯이 끝나 있어야 한다.
  const b = isObj(src.boss) ? src.boss : {};
  for (const id of Object.keys(p.boss.unseen)) {
    const u = isObj(b.unseen?.[id]) ? b.unseen[id] : {};
    p.boss.unseen[id] = {
      done: u.done === true,
      firstTryCorrect: typeof u.firstTryCorrect === 'boolean' ? u.firstTryCorrect : null,
      journalHelp: u.journalHelp === true,
      singerGroupCorrect: typeof u.singerGroupCorrect === 'boolean' ? u.singerGroupCorrect : null,
    };
  }
  p.boss.stageWrong = Number.isInteger(b.stageWrong) && b.stageWrong >= 0 ? b.stageWrong : 0;
  let bossState = BOSS_STATES.includes(b.state) ? b.state : 'locked';
  const allWingsDone = PLAY_WING_IDS.every((w) => p.wings[w].state === 'done');
  if (!allWingsDone) bossState = 'locked';
  else if (bossState === 'locked') bossState = 'stage1';
  if (BOSS_STATES.indexOf(bossState) > 1 && !Object.values(p.boss.unseen).every((u) => u.done)) bossState = 'stage1';
  if (bossState === 'locked') p.boss.stageWrong = 0;
  p.boss.state = bossState;

  // 엔딩: 보스를 마쳐야 완성될 수 있다.
  const e = isObj(src.ending) ? src.ending : {};
  p.ending = {
    line: isStr(e.line) ? e.line : '',
    wing: PLAY_WING_IDS.includes(e.wing) ? e.wing : null,
    conceptId: CONCEPT_IDS.includes(e.conceptId) ? e.conceptId : null,
    note: isStr(e.note) ? e.note : '',
    completed: e.completed === true && bossState === 'done',
    completedAt: isStr(e.completedAt) ? e.completedAt : null,
  };
  if (!p.ending.completed) p.ending.completedAt = null;
  return p;
}

function normalizeSlot(raw, opts) {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name)) return null;
  const name = raw.name.trim();
  if (!name) return null;
  return {
    id: raw.id,
    name,
    appearance: APPEARANCES.includes(raw.appearance) ? raw.appearance : 'a',
    createdAt: isStr(raw.createdAt) ? raw.createdAt : null,
    updatedAt: isStr(raw.updatedAt) ? raw.updatedAt : null,
    progress: normalizeProgress(raw.progress, opts),
  };
}

export function normalizeData(raw, opts = {}) {
  const d = defaultData();
  if (!isObj(raw)) return d;
  d.device = normalizeDevice(raw.device);
  if (isObj(raw.slots)) {
    for (const s of Object.values(raw.slots)) {
      const slot = normalizeSlot(s, opts);
      if (slot && !d.slots[slot.id]) d.slots[slot.id] = slot;
    }
  }
  d.lastSlotId = isStr(raw.lastSlotId) && d.slots[raw.lastSlotId] ? raw.lastSlotId : null;
  return d;
}

// ───────────────────────── 이름 ─────────────────────────

// 이름 검사: 앞뒤 공백을 빼고 1~12자(조정 가능). { ok, name, reason: 'empty' | 'too-short' | 'too-long' }
export function validateName(raw, limits = {}) {
  const { nameMin, nameMax } = { ...NAME_LIMITS, ...limits };
  if (!isStr(raw)) return { ok: false, name: '', reason: 'empty' };
  const name = cleanText(raw);
  const len = charLength(name);
  if (len === 0) return { ok: false, name, reason: 'empty' };
  if (len < nameMin) return { ok: false, name, reason: 'too-short' };
  if (len > nameMax) return { ok: false, name, reason: 'too-long' };
  return { ok: true, name, reason: null };
}

// ───────────────────────── 저장 엔진 ─────────────────────────

// 저장 실패의 까닭을 사건 값(unavailable | quota | unknown)으로 나눈다.
function failureReason(e) {
  const name = e?.name ?? '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22 || e?.code === 1014) return 'quota';
  if (name === 'SecurityError') return 'unavailable';
  return 'unknown';
}

// storage: getItem/setItem을 가진 저장소(브라우저에서는 localStorage). 없거나 쓸 수 없으면 메모리로만 진행한다.
// emit: 사건 내기(기본은 사건 버스). now: Date를 돌려주는 시계. makeId: 기록 id 만들기(선택).
//
// 저장은 '읽고 고쳐 쓰기'다(여러 창, spec 13). 쓸 때마다 저장소의 문서를 다시 읽고, 이 창에서 바뀐 것만 그 위에 얹는다:
//  - 이 창에서 바뀐 기록(만들기·진행·모습 바꾸기)의 자리만 바꾸고, 다른 기록은 저장소에 있는 그대로 둔다.
//  - 기기 설정은 이 창에서 바꾼 값(열쇠마다, 소리 크기는 갈래마다)만 바꾼다.
//  - 지우기는 그 기록의 자리만 뺀다.
//  - 같은 기록을 두 창에서 바꾸면 나중에 쓴 창이 이긴다(막지 않음).
// 다른 창이 남긴 기록은 쓸 때·목록을 볼 때·기록을 고를 때 이 창의 메모리에도 들인다.
// 단 지금 연 기록(lastSlotId)의 객체는 바꾸지 않는다: 진행 엔진이 그 객체를 쥐고 고친다. 고를 때(진행 엔진을 붙이기 전)만 새로 읽는다.
export function createStore({ storage = null, emit = busEmit, now = () => new Date(), makeId = null, table = SONG_TABLE, limits = {} } = {}) {
  let data = defaultData();
  let failure = null;
  let writable = true;      // 더 새 버전의 저장을 만나면 덮어쓰지 않는다
  const dirtySlots = new Set();     // 이 창에서 바뀌어 아직 쓰지 못한 기록 id
  const removedSlots = new Set();   // 이 창에서 지워 아직 쓰지 못한 기록 id
  const dirtyDevice = new Set();    // 이 창에서 바꾸어 아직 쓰지 못한 기기 설정('muted', 'volume.bgm' …)
  let pointerDirty = false;         // 이 창에서 마지막으로 연 기록을 바꿈
  const iso = () => now().toISOString();

  const fail = (reason) => {
    failure = reason;
    emit('save:failed', { reason });
    return false;
  };

  // 저장소의 문서를 읽어 이 버전의 모양으로 맞춘다. 돌려주는 값의 status
  //   new: 저장 없음 · loaded: 그대로 읽음 · migrated: 옛 버전을 옮김
  //   reset: 읽을 수 없어(corrupt) 또는 옮길 수 없는 옛 버전이라(version) 남길 것이 없음
  //   newer: 이 게임보다 새 버전 · unavailable: 저장소를 쓸 수 없음
  function readStored() {
    let raw;
    try {
      raw = storage.getItem(SAVE_KEY);
    } catch (e) {
      return { status: 'unavailable' };
    }
    if (raw === null || raw === undefined) return { status: 'new', doc: null };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'reset', reason: 'corrupt' };
    }
    if (!isObj(parsed)) return { status: 'reset', reason: 'corrupt' };
    const found = parsed.version;
    if (found === SAVE_VERSION) return { status: 'loaded', doc: normalizeData(parsed, { table }) };
    if (typeof found === 'number' && found > SAVE_VERSION) return { status: 'newer', foundVersion: found };
    let cur = parsed;
    while (isObj(cur) && typeof MIGRATIONS[cur.version] === 'function' && cur.version !== SAVE_VERSION) cur = MIGRATIONS[cur.version](cur);
    if (isObj(cur) && cur.version === SAVE_VERSION) return { status: 'migrated', doc: normalizeData(cur, { table }), foundVersion: found };
    return { status: 'reset', reason: 'version', foundVersion: found };
  }

  // 저장소에서 읽는다. 돌려주는 값의 status
  //   new: 저장 없음 · loaded: 그대로 읽음 · migrated: 옛 버전을 옮김
  //   reset: 읽을 수 없어(corrupt) 또는 옮길 수 없는 옛 버전이라(version) 새로 시작 — 다음 저장에서 덮어쓴다
  //   newer: 이 게임보다 새 버전 — 덮어쓰지 않고 이번 창 메모리로만 진행
  //   unavailable: 저장소를 쓸 수 없음 — 이번 창 메모리로만 진행
  function load() {
    data = defaultData();
    failure = null;
    writable = true;
    dirtySlots.clear();
    removedSlots.clear();
    dirtyDevice.clear();
    pointerDirty = false;
    if (!storage) { fail('unavailable'); return { status: 'unavailable' }; }
    const r = readStored();
    if (r.status === 'unavailable') { fail('unavailable'); return { status: 'unavailable' }; }
    if (r.status === 'newer') {
      writable = false;
      fail('unknown');
      return { status: 'newer', foundVersion: r.foundVersion };
    }
    if (r.doc) data = r.doc;
    const out = { status: r.status };
    if (r.reason) out.reason = r.reason;
    if (r.foundVersion !== undefined) out.foundVersion = r.foundVersion;
    return out;
  }

  // 다른 창이 남긴 기록을 메모리에 들인다. 이 창에서 바뀐 기록과 지금 연 기록(진행 엔진이 쥔 객체)은 그대로 둔다.
  function adopt(doc, keep = data.lastSlotId) {
    for (const [id, slot] of Object.entries(doc.slots)) {
      if (id === keep || dirtySlots.has(id) || removedSlots.has(id)) continue;
      data.slots[id] = slot;
    }
    for (const id of Object.keys(data.slots)) {
      if (id === keep || dirtySlots.has(id) || id in doc.slots) continue;
      delete data.slots[id];
    }
  }

  // 저장소를 다시 읽어 다른 창의 기록을 들인다(쓰지는 않는다). 읽을 수 없으면 아무것도 하지 않는다.
  function sync(keep = data.lastSlotId) {
    if (!storage || !writable) return;
    const r = readStored();
    if (r.status === 'loaded' || r.status === 'migrated') adopt(r.doc, keep);
    else if (r.status === 'new') adopt(defaultData(), keep);
  }

  // 쓴다: 저장소의 문서를 다시 읽고 이 창에서 바뀐 것만 얹어 쓴다. 성공하면 true.
  // 실패하면 save:failed를 내고 false(메모리의 값은 그대로, 바뀐 표시도 남아 다음에 다시 쓴다).
  function write() {
    if (!writable) return fail('unknown');
    if (!storage) return fail('unavailable');
    const r = readStored();
    if (r.status === 'unavailable') return fail('unavailable');
    if (r.status === 'newer') { writable = false; return fail('unknown'); }
    // 읽을 수 없는 저장(reset)이면 남길 다른 기록이 없으므로 이 창의 문서를 바탕으로 쓴다
    const base = r.doc ?? (r.status === 'reset' ? { ...data, slots: { ...data.slots }, device: clone(data.device) } : defaultData());
    for (const id of removedSlots) delete base.slots[id];
    for (const id of dirtySlots) if (data.slots[id]) base.slots[id] = data.slots[id];
    for (const path of dirtyDevice) {
      const [key, sub] = path.split('.');
      if (sub) base.device[key] = { ...base.device[key], [sub]: data.device[key][sub] };
      else base.device[key] = clone(data.device[key]);
    }
    if (pointerDirty) base.lastSlotId = data.lastSlotId;
    if (!isStr(base.lastSlotId) || !base.slots[base.lastSlotId]) base.lastSlotId = null;
    base.version = SAVE_VERSION;
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(base));
    } catch (e) {
      return fail(failureReason(e));
    }
    failure = null;
    dirtySlots.clear();
    removedSlots.clear();
    dirtyDevice.clear();
    pointerDirty = false;
    adopt(base);
    return true;
  }

  // 지금 연 기록을 쓴다(바깥에서 부르는 저장). 성공하면 true.
  function save() {
    if (isStr(data.lastSlotId) && data.slots[data.lastSlotId]) dirtySlots.add(data.lastSlotId);
    return write();
  }

  const getRecord = (id) => (isStr(id) ? data.slots[id] ?? null : null);

  function findRecordByName(name) {
    const v = validateName(name, { nameMax: Infinity });
    if (!v.ok) return null;
    return Object.values(data.slots).find((s) => s.name === v.name) ?? null;
  }

  function newId() {
    let id = makeId ? makeId() : 's-' + now().getTime().toString(36) + Math.random().toString(36).slice(2, 8);
    while (data.slots[id]) id += Math.random().toString(36).slice(2, 4);
    return id;
  }

  // 새 기록. 같은 이름(앞뒤 공백 무시)이 있으면 만들지 않고 { status: 'exists', record }를 돌려준다(이어 할지 묻기).
  function createRecord(name, { appearance = 'a' } = {}) {
    const v = validateName(name, limits);
    if (!v.ok) return { status: 'invalid', reason: v.reason };
    sync();   // 다른 창이 만든 같은 이름도 찾는다
    const existing = findRecordByName(v.name);
    if (existing) return { status: 'exists', record: existing };
    if (!APPEARANCES.includes(appearance)) return { status: 'invalid', reason: 'appearance' };
    const at = iso();
    const record = { id: newId(), name: v.name, appearance, createdAt: at, updatedAt: at, progress: defaultProgress(table) };
    data.slots[record.id] = record;
    data.lastSlotId = record.id;
    dirtySlots.add(record.id);
    pointerDirty = true;
    write();
    return { status: 'created', record };
  }

  // 기록을 고른다. 이 창에서 바꾸지 않은 기록이면 저장소의 최신 값으로 새로 읽는다(다른 창이 이어 한 진행).
  // 진행 엔진은 고른 뒤의 객체에 붙인다(openRecord). 다른 창이 지운 기록이면 이 창의 것을 그대로 쓴다.
  function selectRecord(id) {
    const before = getRecord(id);
    if (!before) return { status: 'missing' };
    sync(null);
    if (!getRecord(id)) data.slots[id] = before;
    const record = getRecord(id);
    if (data.lastSlotId !== id) {
      data.lastSlotId = id;
      pointerDirty = true;
      write();
    }
    return { status: 'selected', record };
  }

  // 지우기는 확인을 한 번 거친다. confirmed가 없으면 지우지 않고 { status: 'needs-confirm' }.
  // 결과 카드는 기록으로 다시 그리므로 기록을 지우면 카드 자료도 함께 지워진다(spec 20).
  function deleteRecord(id, { confirmed = false } = {}) {
    const record = getRecord(id);
    if (!record) return { status: 'missing' };
    if (confirmed !== true) return { status: 'needs-confirm', record };
    delete data.slots[id];
    dirtySlots.delete(id);
    removedSlots.add(id);
    if (data.lastSlotId === id) { data.lastSlotId = null; pointerDirty = true; }
    write();   // 저장소를 다시 읽고 이 기록의 자리만 뺀다
    return { status: 'deleted' };
  }

  function setAppearance(id, appearance) {
    const record = getRecord(id);
    if (!record) return { status: 'missing' };
    if (!APPEARANCES.includes(appearance)) return { status: 'invalid', reason: 'appearance' };
    record.appearance = appearance;
    touchRecord(id);
    return { status: 'changed', record };
  }

  // 기록의 진행이 바뀐 뒤 부른다. updatedAt을 고치고 저장한다.
  function touchRecord(id) {
    const record = getRecord(id);
    if (record) {
      record.updatedAt = iso();
      dirtySlots.add(id);
    }
    return write();
  }

  // 시작 화면의 기록 목록. 서고 완성 표시를 함께 준다. 최근에 저장한 것부터.
  function listRecords() {
    sync();
    return Object.values(data.slots)
      .map((s) => ({ id: s.id, name: s.name, appearance: s.appearance, completed: s.progress.ending.completed, updatedAt: s.updatedAt }))
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  }

  // 기기 공통 설정을 바꾼다. 약속 밖의 열쇠와 값은 받지 않는다. 바뀐 열쇠 목록을 돌려준다.
  function updateDevice(patch) {
    const changed = [];
    if (isObj(patch)) {
      for (const [key, value] of Object.entries(patch)) {
        if (!(key in data.device)) continue;
        const v = cleanDeviceValue(key, value, data.device[key]);
        if (v === undefined) continue;
        if (key === 'volume') {
          for (const ch of Object.keys(value)) if (isVolume(value[ch]) && ch in v) dirtyDevice.add('volume.' + ch);
        } else {
          dirtyDevice.add(key);
        }
        data.device[key] = v;
        changed.push(key);
      }
    }
    if (changed.length) write();
    return { changed };
  }

  return Object.freeze({
    load,
    save,
    get data() { return data; },
    get failure() { return failure; },
    getRecord,
    findRecordByName,
    createRecord,
    selectRecord,
    deleteRecord,
    setAppearance,
    touchRecord,
    currentRecord: () => getRecord(data.lastSlotId),
    listRecords,
    updateDevice,
  });
}
