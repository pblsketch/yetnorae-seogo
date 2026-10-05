// 고려가요관 모형의 상태와 배치(3D·2D가 함께 쓴다). DOM과 Three.js에 기대지 않는다.
//
// 건축(spec 3.1): 똑같이 생긴 작은 방(연)이 한 줄로 늘어서 있고, 방 앞을 잇는 복도에서 후렴이 울린다.
// 고유 동작 '후렴 고리 걸기'(diorama:refrain-link)가 오면 두 방의 고리 걸이에 고리가 걸리고,
// 복도를 따라 끈이 이어지며 그 사이 등롱에 불이 들어온다.
//
// 연 번호(unit)는 방 번호로 바꿔 쓴다. 방은 STANZA_ROOMS개이고, 그보다 긴 노래는 앞 방부터 다시 쓴다(unit % 방 수).

export const STANZA_ROOMS = 7;          // 연 방의 수
export const MAX_LINKS = 12;            // 한꺼번에 보이는 후렴 고리 수(넘으면 오래된 것부터 거둔다)
export const FEET_PER_LINE = 3;         // 방마다 등불 구슬 수(고려가요 한 줄 세 음보)
export const AREAS = { shelf: 3, bonus: 3, basket: 2 };

// 시간(초). 움직임 줄이기에서는 자라기·퍼지기 없이 바로 끝 모습을 보인다.
export const TIMES = {
  linkGrow: 0.6,       // 끈이 한 방에서 다른 방까지 이어지는 시간
  ripple: 0.9,         // 후렴 울림이 복도를 지나가는 시간
  popGrow: 0.45,       // 삐져나오는 시간
  popHold: 2.2,        // 삐져나온 모양을 보여 주는 시간(이 뒤 그 자리는 빈다)
  fogFade: 2.0,        // 먹안개가 걷히는 시간
  doorOpen: 0.8,       // 작품 방 문이 열리는 시간
};

// ── 3D 배치(1 = 1m, 관 바닥 가운데가 원점, +z가 카메라 쪽) ──
const roomX = (i) => -5.4 + i * 1.45;
export const L3 = {
  roomX,
  room: { w: 1.2, d: 1.4, zFront: -4.25, zBack: -5.65, h: 1.5 },
  hookY: 1.3,
  hookZ: -4.17,
  beadY: 1.66,
  beadZ: -4.02,
  beadDx: 0.36,
  corridor: { x0: -6.3, x1: 6.3, z0: -4.25, z1: -2.95, top: 0.18 },
  // 방 사이 틈 일곱(여섯은 연 방 사이, 하나는 마지막 연 방과 작품 방 사이)
  gapX: (i) => (i < STANZA_ROOMS - 1 ? roomX(i) + 0.725 : (roomX(STANZA_ROOMS - 1) + 0.6 + 4.45) / 2),
  lanternY: 1.2,
  lanternZ: -3.0,
  seamX: (i) => roomX(i) - 0.725,
  roomDoor: { x: 5.3, w: 1.7, d: 1.6, zFront: -4.15, zBack: -5.75, h: 1.7 },
  shelves: {
    shelf: { cx: 0, cz: -0.4, pitch: 1.0, compW: 0.9, y0: 0.3, innerH: 1.0, depth: 0.55 },
    bonus: { cx: 3.6, cz: 1.0, pitch: 0.78, compW: 0.7, y0: 0.25, innerH: 0.8, depth: 0.45 },
  },
  basket: { cx: -3.4, cz: 1.4, w: 1.2, d: 0.8, h: 0.45, pitch: 0.6 },
  returnedShelf: { cx: -5.6, cz: 0.0 },
  lectern: { x: -1.8, z: 4.4 },
  nextDoor: { x: 6.1, z: 3.6 },
  songs: [[-4.4, -1.7], [-2.2, -1.9], [0, -2.0], [2.2, -1.9], [4.4, -1.7]],   // 떠도는 노래 다섯(칸 노래 셋, 길 잃은 노래 둘)
};

// 3D 자리 하나(칸·덤·바구니)의 책 크기와 가운데
export function slot3D(area, index) {
  if (area === 'basket') {
    const b = L3.basket;
    const h = 0.7;
    return { x: b.cx + (index - 0.5) * b.pitch, y: 0.12 + h / 2, z: b.cz, w: 0.26, h, d: 0.4 };
  }
  const s = L3.shelves[area];
  const h = s.innerH * 0.86;
  return { x: s.cx + (index - 1) * s.pitch, y: s.y0 + h / 2, z: s.cz, w: 0.3 * (s.pitch / 1.0), h, d: s.depth * 0.76 };
}

// ── 2D 배치(viewBox 0 0 1600 900, 그림 판 백분율 = 좌표 / 16, / 9) ──
export const L2 = {
  roomCx: (i) => 130 + i * 165,
  roomW: 140,
  roofTop: 95,
  wallTop: 150,
  wallBottom: 335,
  hookY: 210,
  beadY: 172,
  beadDx: 35,
  corridor: { y0: 345, y1: 435 },
  gapX: (i) => (i < STANZA_ROOMS - 1 ? 130 + i * 165 + 82.5 : (130 + (STANZA_ROOMS - 1) * 165 + 70 + 1270) / 2),
  seamX: (i) => 130 + i * 165 - 82.5,
  roomDoor: { cx: 1380, x0: 1270, x1: 1490 },
  shelves: {
    shelf: { xs: [640, 768, 896], y0: 500, h: 160, compW: 110 },
    bonus: { xs: [1056, 1184, 1312], y0: 506, h: 140, compW: 100 },
  },
  basket: { cx: 320, y: 648, xs: [290, 350] },
  returnedShelf: { cx: 112, y: 540 },
  lectern: { cx: 512, y: 774 },
  nextDoor: { cx: 1536, y: 540 },
  songs: [[13, 46], [30, 47], [50, 47], [70, 46], [88, 47]],   // 떠도는 노래 다섯
};

// 2D 자리 하나의 책 크기(왼쪽 위 기준)
export function slot2D(area, index) {
  if (area === 'basket') {
    const b = L2.basket;
    return { cx: b.xs[index], top: 560, w: 36, h: 90 };
  }
  const s = L2.shelves[area];
  const h = Math.round(s.h * 0.85);
  const w = Math.round(s.compW * 0.42);
  return { cx: s.xs[index], top: s.y0 + (s.h - h) - 8, w, h };
}

// ── 상태 ──

const isInt = (v) => Number.isInteger(v) && v >= 0;
export const roomOf = (unit) => ((unit % STANZA_ROOMS) + STANZA_ROOMS) % STANZA_ROOMS;

export function createState({ restored = false } = {}) {
  return {
    slots: { shelf: [null, null, null], bonus: [null, null, null], basket: [null, null] },
    bound: { shelf: null, bonus: null },
    links: [],          // { a, b, same, age }
    ripples: [],        // { a, b, age }
    beads: new Set(),   // '방:음보'
    seams: new Set(),   // 방 번호(접힌 경계는 그 방 왼쪽)
    pops: [],           // { area, index, genre, songId, age }
    fog: !restored,
    fogLevel: restored ? 0 : 1,
    roomOpen: !!restored,
    doorLevel: restored ? 1 : 0,
    linkSerial: 0,
  };
}

function clearTraces(s) {
  s.links.length = 0;
  s.ripples.length = 0;
  s.beads.clear();
  s.seams.clear();
}

function validSlot(area, index) {
  return Object.prototype.hasOwnProperty.call(AREAS, area) && isInt(index) && index < AREAS[area];
}

// 사건 하나를 상태에 반영한다. 보이는 것이 바뀌었으면 true. 모르는 사건이나 어긋난 detail은 조용히 넘긴다.
export function applyEvent(s, name, detail) {
  const d = detail && typeof detail === 'object' ? detail : {};
  switch (name) {
    case 'diorama:refrain-link': {
      const fu = d.from?.unit;
      const tu = d.to?.unit;
      if (!isInt(fu) || !isInt(tu)) return false;
      const a = roomOf(fu);
      const b = roomOf(tu);
      s.links.push({ a, b, same: a === b, age: 0, serial: s.linkSerial++ });
      if (s.links.length > MAX_LINKS) s.links.splice(0, s.links.length - MAX_LINKS);
      s.ripples.push({ a, b, age: 0 });
      if (s.ripples.length > 4) s.ripples.splice(0, s.ripples.length - 4);
      return true;
    }
    case 'diorama:pillar-light': {
      if (!isInt(d.unit)) return false;
      const foot = isInt(d.foot) ? d.foot % FEET_PER_LINE : null;
      if (d.unit === 0 && (d.line ?? 0) === 0 && (d.foot === 0 || d.foot === null || d.foot === undefined)) s.beads.clear();
      const room = roomOf(d.unit);
      if (foot === null) for (let f = 0; f < FEET_PER_LINE; f++) s.beads.add(room + ':' + f);
      else s.beads.add(room + ':' + foot);
      return true;
    }
    case 'diorama:fold': {
      if (!isInt(d.unit)) return false;
      s.seams.add(roomOf(d.unit));
      return true;
    }
    case 'diorama:slot-set': {
      if (!validSlot(d.area, d.index)) return false;
      const id = typeof d.songId === 'string' && d.songId ? d.songId : null;
      s.slots[d.area][d.index] = id ? { songId: id, to: typeof d.to === 'string' ? d.to : null } : null;
      s.pops = s.pops.filter((p) => !(p.area === d.area && p.index === d.index));
      clearTraces(s);
      return true;
    }
    case 'diorama:shelf-bound': {
      if (d.area !== 'shelf' && d.area !== 'bonus') return false;
      const ids = Array.isArray(d.songIds) ? d.songIds.slice(0, 3) : [];
      s.bound[d.area] = ids.map((v) => (typeof v === 'string' ? v : null));
      ids.forEach((id, i) => { if (typeof id === 'string' && !s.slots[d.area][i]) s.slots[d.area][i] = { songId: id, to: null }; });
      s.pops = s.pops.filter((p) => p.area !== d.area);
      if (d.area === 'shelf') s.roomOpen = true;   // 칸이 묶이는 순간 작품 방 문이 열린다(spec 6.5)
      clearTraces(s);
      return true;
    }
    case 'diorama:pop-out': {
      if (!validSlot(d.area, d.index)) return false;
      s.pops = s.pops.filter((p) => !(p.area === d.area && p.index === d.index));
      s.pops.push({ area: d.area, index: d.index, genre: typeof d.genre === 'string' ? d.genre : null, songId: d.songId ?? null, age: 0 });
      return true;
    }
    case 'diorama:fog-recede':
    case 'diorama:dancheong-restore': {
      if (!s.fog) return false;
      s.fog = false;
      return true;
    }
    // 다른 관의 고유 동작 반응: 고려가요관에는 해당하는 모양이 없다.
    case 'diorama:floor-fill':
    case 'diorama:aa-door':
    case 'diorama:stair-step':
    case 'diorama:walk-step':
    case 'diorama:unroll':
    default:
      return false;
  }
}

// 시간을 흘린다. 모양이 바뀌었으면 true(그때만 다시 그린다).
export function advance(s, dt, reduce) {
  let changed = false;
  for (const l of s.links) {
    if (l.age < TIMES.linkGrow) { l.age = reduce ? TIMES.linkGrow : l.age + dt; changed = true; }
  }
  if (reduce && s.ripples.length) { s.ripples.length = 0; changed = true; }
  for (const r of s.ripples) { r.age += dt; changed = true; }
  const before = s.ripples.length;
  s.ripples = s.ripples.filter((r) => r.age < TIMES.ripple);
  if (s.ripples.length !== before) changed = true;
  for (const p of s.pops) {
    const was = p.age;
    p.age = reduce && p.age < TIMES.popGrow ? TIMES.popGrow : p.age + dt;
    if (was < TIMES.popGrow) changed = true;
  }
  const done = s.pops.filter((p) => p.age >= TIMES.popHold);
  if (done.length) {
    // 삐져나온 노래는 학생 손으로 돌아가고 그 자리는 빈다(spec 6.1).
    for (const p of done) s.slots[p.area][p.index] = null;
    s.pops = s.pops.filter((p) => p.age < TIMES.popHold);
    changed = true;
  }
  const fogTarget = s.fog ? 1 : 0;
  if (s.fogLevel !== fogTarget) {
    s.fogLevel = reduce ? fogTarget : Math.max(0, Math.min(1, s.fogLevel + Math.sign(fogTarget - s.fogLevel) * dt / TIMES.fogFade));
    changed = true;
  }
  const doorTarget = s.roomOpen ? 1 : 0;
  if (s.doorLevel !== doorTarget) {
    s.doorLevel = reduce ? doorTarget : Math.max(0, Math.min(1, s.doorLevel + Math.sign(doorTarget - s.doorLevel) * dt / TIMES.doorOpen));
    changed = true;
  }
  return changed;
}

// 끈이 자란 정도(0~1)
export const linkProgress = (l) => Math.min(1, l.age / TIMES.linkGrow);
// 삐져나온 정도(0~1)
export const popProgress = (p) => Math.min(1, p.age / TIMES.popGrow);

// 어떤 틈(등롱)이 고리 끈 아래에 있는지: 두 방 사이를 지나는 끈이 하나라도 있으면 불이 켜진다.
export function litGaps(s) {
  const lit = new Set();
  for (const l of s.links) {
    if (linkProgress(l) < 1) continue;
    const lo = Math.min(l.a, l.b);
    const hi = Math.max(l.a, l.b);
    for (let g = lo; g < hi; g++) lit.add(g);
  }
  return lit;
}

// 고리가 걸린 방
export function linkedRooms(s) {
  const out = new Set();
  for (const l of s.links) { out.add(l.a); out.add(l.b); }
  return out;
}
