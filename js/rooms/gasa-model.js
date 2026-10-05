// 작품 방 「상춘곡」의 진행(화면과 상관없음). Node에서 바로 시험한다.
// 방 글(js/data/rooms-gasa.js)과 노래 데이터(sangchungok)를 받아, 한 걸음에 한 행씩 걷고
// 머무는 곳마다 시어를 모으고, 공명·부귀를 떠나보낸 뒤 안빈낙도로 마무리하는 단계를 다룬다.
// 기록 모양은 js/data/README.md 7.3: { room: 'gasa', words: [모은 시어 …] }.
import { squash } from '../core/song-shape.js';

export const ROOM_ID = 'gasa';
export const STATION_ORDER = ['hut', 'pavilion', 'stream', 'peak', 'ending'];
// 수간모옥 대목(1~13행)은 초가 둘레를 거닌다. 길 위치 0에서 이만큼만 나아간다.
export const HUT_STROLL = 0.12;

const arr = (v) => (Array.isArray(v) ? v : []);

// 행 원문: 음보 원문을 띄어 이은 글(노래 데이터 그대로)
export function rowOriginal(unit) {
  return arr(unit?.feet).map((f) => f?.original ?? '').join(' ');
}

const inRow = (song, u, text) => {
  const unit = song?.units?.[u];
  return !!unit && squash(text).length > 0 && squash(rowOriginal(unit)).includes(squash(text));
};

// 모을 수 있는 시어(머무는 곳 차례, 그 안에서는 방 글 차례)
export function allWords(room) {
  return arr(room?.stations).flatMap((s) => arr(s.words).map((w) => ({ ...w, station: s.id })));
}

// 방 글 검사. 문제 목록(글)을 돌려준다. 비어 있으면 통과.
export function checkRoomData(room, song) {
  const errs = [];
  if (!room || room.room !== ROOM_ID) errs.push('room 값이 gasa가 아니다');
  if (!song || song.id !== room?.songId) errs.push('노래 id가 다르다: ' + song?.id + ' / ' + room?.songId);
  const n = arr(song?.units).length;
  const stations = arr(room?.stations);
  const ids = stations.map((s) => s.id);
  if (JSON.stringify(ids) !== JSON.stringify(STATION_ORDER)) errs.push('머무는 곳 차례가 작품 차례가 아니다: ' + ids.join(','));
  let next = 0;
  const wordIds = new Set();
  for (const s of stations) {
    if (!(typeof s.name === 'string' && s.name.trim())) errs.push(s.id + ': 이름 없음');
    if (s.from !== next) errs.push(s.id + ': ' + next + '행부터 이어지지 않는다(' + s.from + ')');
    if (!(Number.isInteger(s.to) && s.to >= s.from)) errs.push(s.id + ': 행 범위가 틀림');
    next = s.to + 1;
    const words = arr(s.words);
    if (s.id !== 'ending' && words.length === 0) errs.push(s.id + ': 모을 시어가 없다');
    for (const w of words) {
      if (wordIds.has(w.id)) errs.push(s.id + ': 시어 id가 겹친다 ' + w.id);
      wordIds.add(w.id);
      if (!(w.unit >= s.from && w.unit <= s.to)) errs.push(s.id + ': 시어 ' + w.text + '의 행이 이곳 밖이다');
      if (!inRow(song, w.unit, w.text)) errs.push(s.id + ': 시어 ' + w.text + '가 ' + (w.unit + 1) + '행 원문에 없다');
    }
  }
  if (next !== n) errs.push('머무는 곳이 노래 끝 행까지 닿지 않는다(' + next + '/' + n + ')');
  const texts = allWords(room).map((w) => w.text);
  if (new Set(texts).size !== texts.length) errs.push('같은 글의 시어가 둘 있다');
  const lg = room?.letGo;
  const ending = stations.find((s) => s.id === 'ending');
  if (!lg || !ending || !(lg.unit >= ending.from && lg.unit <= ending.to)) errs.push('떠나보내기 행이 마무리 안에 없다');
  if (arr(lg?.words).length === 0) errs.push('떠나보낼 말이 없다');
  for (const w of arr(lg?.words)) if (!inRow(song, lg.unit, w.text)) errs.push('떠나보낼 말 ' + w.text + '가 원문에 없다');
  for (const k of arr(room?.finale?.keep)) if (!inRow(song, k.unit, k.text)) errs.push('마무리 말 ' + k.text + '가 원문에 없다');
  return errs;
}

// 모은 시어 id로 기록을 만든다. 차례는 방 글 차례(작품 차례)이고 겹치지 않는다.
export function buildRecord(room, collectedIds) {
  const set = new Set(collectedIds);
  return { room: ROOM_ID, words: allWords(room).filter((w) => set.has(w.id)).map((w) => w.text) };
}

// 기록 검사(7.3 모양, 곳마다 하나 이상). 문제 목록을 돌려준다.
export function checkRecord(record, room) {
  const errs = [];
  if (!record || typeof record !== 'object') return ['기록이 객체가 아니다'];
  const keys = Object.keys(record);
  if (JSON.stringify(keys.slice().sort()) !== JSON.stringify(['room', 'words'])) errs.push('열쇠가 room·words가 아니다: ' + keys.join(','));
  if (record.room !== ROOM_ID) errs.push('room이 gasa가 아니다');
  if (!Array.isArray(record.words)) return [...errs, 'words가 배열이 아니다'];
  const words = allWords(room);
  const known = new Map(words.map((w) => [w.text, w]));
  if (new Set(record.words).size !== record.words.length) errs.push('겹친 시어가 있다');
  for (const t of record.words) if (!known.has(t)) errs.push('방 글에 없는 시어: ' + t);
  for (const s of arr(room?.stations).filter((x) => arr(x.words).length)) {
    if (!record.words.some((t) => known.get(t)?.station === s.id)) errs.push(s.name + '에서 모은 시어가 없다');
  }
  const order = words.map((w) => w.text).filter((t) => record.words.includes(t));
  if (JSON.stringify(order) !== JSON.stringify(record.words)) errs.push('시어 차례가 작품 차례가 아니다');
  return errs;
}

export function stationIndexOf(room, u) {
  const i = arr(room?.stations).findIndex((s) => u >= s.from && u <= s.to);
  return i < 0 ? 0 : i;
}

// 길 위치(0 = 수간모옥, k = k번째 머무는 곳). 행 u를 걷고 난 뒤의 자리. u = -1은 출발 전.
// 수간모옥 대목은 초가 둘레(0 ~ HUT_STROLL)를 거닐고, 그 뒤 대목은 앞 곳에서 그 곳까지 걸어 끝 행에서 닿는다.
export function routeProgress(room, u) {
  if (u < 0) return 0;
  const stations = arr(room?.stations);
  const k = stationIndexOf(room, u);
  const s = stations[k];
  const frac = (u - s.from + 1) / (s.to - s.from + 1);
  if (k === 0) return HUT_STROLL * frac;
  const start = k === 1 ? HUT_STROLL : k - 1;
  return start + (k - start) * frac;
}

// 방 진행 상태. 단계: intro → walk ⇄ collect / letgo → finale → done
export function createRoomState(room, song) {
  const n = arr(song?.units).length;
  const stations = arr(room.stations);
  const letGoWords = arr(room.letGo?.words);
  let phase = 'intro';
  let unit = -1;
  const collected = new Set();
  const gone = new Set();

  const station = () => stations[stationIndexOf(room, Math.max(unit, 0))];
  const stationWords = () => arr(station().words);

  function phaseAfter(u) {
    if (u >= n - 1) return 'finale';
    if (room.letGo && u === room.letGo.unit && letGoWords.length) return 'letgo';
    const s = stations[stationIndexOf(room, u)];
    if (s.to === u && arr(s.words).length) return 'collect';
    return 'walk';
  }

  function canStep() {
    if (phase === 'walk') return unit < n - 1;
    if (phase === 'collect') return stationWords().some((w) => collected.has(w.id));
    if (phase === 'letgo') return letGoWords.every((w) => gone.has(w.id));
    return false;
  }

  return {
    get phase() { return phase; },
    get unit() { return unit; },
    get total() { return n; },
    stationIndex: () => stationIndexOf(room, Math.max(unit, 0)),
    stationInfo: () => station(),
    begin() { if (phase === 'intro') phase = 'walk'; return phase; },
    canStep,
    // 한 걸음(다음 행). 걷지 못하면 null. 걸었으면 { unit, phase, enteredStation, enteredBeyond }
    step() {
      if (!canStep()) return null;
      const prevStation = unit < 0 ? -1 : stationIndexOf(room, unit);
      unit++;
      phase = phaseAfter(unit);
      const k = stationIndexOf(room, unit);
      const beyond = song.units[unit]?.beyondTextbook === true;
      const prevBeyond = unit > 0 && song.units[unit - 1]?.beyondTextbook === true;
      return { unit, phase, enteredStation: k !== prevStation ? k : null, enteredBeyond: beyond && !prevBeyond };
    },
    collectables: () => (phase === 'collect' ? stationWords().filter((w) => !collected.has(w.id)) : []),
    collect(id) {
      if (phase !== 'collect') return false;
      const w = stationWords().find((x) => x.id === id);
      if (!w || collected.has(id)) return false;
      collected.add(id);
      return true;
    },
    collectedIds: () => [...collected],
    collectedTexts: () => buildRecord(room, [...collected]).words,
    letGoLeft: () => (phase === 'letgo' ? letGoWords.filter((w) => !gone.has(w.id)) : []),
    letGo(id) {
      if (phase !== 'letgo' || !letGoWords.some((w) => w.id === id) || gone.has(id)) return false;
      gone.add(id);
      return true;
    },
    // 마치기: finale에서만. 기록을 돌려준다.
    finish() {
      if (phase !== 'finale') return null;
      phase = 'done';
      return buildRecord(room, [...collected]);
    },
  };
}
