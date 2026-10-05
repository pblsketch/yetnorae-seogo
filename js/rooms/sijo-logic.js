// 작품 방 「십 년을 경영하야」의 규칙(화면과 상관없음, Node에서도 시험한다).
// - 초가 세 칸에 물건을 하나씩 들이고, 집 밖에는 여럿을 둘 수 있다.
// - 강산은 어느 칸에도 들어가지 않는다(spec 9).
// - 세 칸 배치에 따라 해석 문장 id가 정해진다(채점하지 않는다).
// - 기록 모양은 js/data/README.md 7.3.

export const ITEM_IDS = ['na', 'dal', 'cheongpung', 'gangsan', 'gold', 'robe', 'guest'];
export const ROOM_COUNT = 3;
export const OUTSIDE = 'outside';

const ORIGINAL = ['na', 'dal', 'cheongpung'];
const WORLDLY = ['gold', 'robe'];
const NATURE = ['dal', 'cheongpung'];

export function createHut() {
  return { rooms: [null, null, null], outside: [], confirmed: false };
}

// 물건이 지금 있는 곳: 칸 번호(0~2), 'outside', 아직 놓지 않았으면 null.
export function locate(hut, item) {
  const i = hut.rooms.indexOf(item);
  if (i >= 0) return i;
  return hut.outside.includes(item) ? OUTSIDE : null;
}

function takeOut(hut, item) {
  const i = hut.rooms.indexOf(item);
  if (i >= 0) hut.rooms[i] = null;
  const k = hut.outside.indexOf(item);
  if (k >= 0) hut.outside.splice(k, 1);
}

const isRoom = (t) => Number.isInteger(t) && t >= 0 && t < ROOM_COUNT;

// 물건을 칸이나 집 밖에 놓는다. 찬 칸에 놓으면 먼저 있던 물건은 도로 나온다(displaced).
// 돌려주는 값: { ok, reason?, displaced? }
//  reason: 'unknown'(모르는 물건·자리) · 'gangsan-no-room'(강산을 칸에) · 'locked'(들이기를 마친 뒤 칸을 바꾸려 함)
export function place(hut, item, target) {
  if (!ITEM_IDS.includes(item) || !(isRoom(target) || target === OUTSIDE)) return { ok: false, reason: 'unknown' };
  if (item === 'gangsan' && isRoom(target)) return { ok: false, reason: 'gangsan-no-room' };
  if (hut.confirmed && (item !== 'gangsan' || isRoom(locate(hut, item)))) return { ok: false, reason: 'locked' };
  let displaced = null;
  if (isRoom(target) && hut.rooms[target] && hut.rooms[target] !== item) displaced = hut.rooms[target];
  takeOut(hut, item);
  if (isRoom(target)) hut.rooms[target] = item;
  else hut.outside.push(item);
  return displaced ? { ok: true, displaced } : { ok: true };
}

// 놓인 물건을 도로 꺼낸다.
export function unplace(hut, item) {
  if (hut.confirmed) return { ok: false, reason: 'locked' };
  if (locate(hut, item) === null) return { ok: false, reason: 'unknown' };
  takeOut(hut, item);
  return { ok: true };
}

export const roomsFull = (hut) => hut.rooms.every((id) => id !== null);

// 세 칸에 든 재물·벼슬(README 7.3 순서)
export const worldlyIn = (rooms) => WORLDLY.filter((id) => rooms.includes(id));

// 세 칸 배치 → 해석 문장 id(js/data/rooms-sijo.js interpretations)
export function interpretationIdFor(rooms) {
  const set = new Set(rooms);
  if (set.size === 3 && ORIGINAL.every((id) => set.has(id))) return 'as-written';
  if (worldlyIn(rooms).length === 0) return 'nature-swapped';
  return NATURE.some((id) => set.has(id)) ? 'worldly' : 'worldly-only';
}

// 방 기록(README 7.3). data는 js/data/rooms-sijo.js의 ROOM_SIJO.
export function buildRecord(hut, data) {
  const rooms = hut.rooms.slice();
  const interpretationId = interpretationIdFor(rooms);
  const text = data.interpretations.find((i) => i.id === interpretationId)?.text ?? '';
  return {
    room: 'sijo',
    rooms,
    outside: hut.outside.slice(),
    interpretationId,
    interpretationText: text,
    isInterpretation: true,
  };
}
