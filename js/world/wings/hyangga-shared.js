// 향가관 모형의 3D·2D 공통 부분: 탑의 층 설정, 반응 사건을 받아 바꾸는 상태, 삐져나옴 모양, 이름표 글.
// 그리는 쪽(hyangga.js의 3D, hyangga-board.js의 2D)은 이 상태만 보고 그린다. 그래서 두 판이 같은 사건에 같은 뜻으로 반응한다.
import { WINGS } from '../../data/wings.js';
import { SONG_CATALOG, WING_TABLE } from '../../data/song-table.js';
import { songs } from '../../data/songs/index.js';

// 아래층부터 4구·8구·10구 층(노래 표의 shelfFloors). 층마다 칸(건축의 칸) 수가 그 층의 구 수다.
export const FLOORS = WING_TABLE.hyangga.shelfFloors.slice();
// 10구 층의 무리 나눔(4·4·2). '아아' 문은 마지막 무리(두 칸) 앞에 선다.
export const GROUPING = [4, 4, 2];
export const DOOR_BAYS = [8, 9];
export const TOTAL_BAYS = FLOORS.reduce((s, n) => s + n, 0);

// 관 모형이 받는 반응 사건(js/data/README.md 8.1). 이 밖의 이름은 조용히 넘긴다.
export const REACTION_EVENTS = [
  'diorama:fold', 'diorama:pillar-light', 'diorama:floor-fill', 'diorama:aa-door', 'diorama:stair-step',
  'diorama:refrain-link', 'diorama:walk-step', 'diorama:unroll', 'diorama:slot-set', 'diorama:shelf-bound',
  'diorama:pop-out', 'diorama:fog-recede', 'diorama:dancheong-restore',
];

// 다른 관의 고유 동작 사건. 향가관에서는 일어나지 않지만 와도 오류 없이 넘긴다.
const OTHER_ACTIONS = new Set(['diorama:stair-step', 'diorama:refrain-link', 'diorama:walk-step', 'diorama:unroll']);

const AREA_SIZE = { shelf: 3, bonus: 3, basket: 2 };

// 탑의 칸 번호(0부터, 아래층부터 이어 센다)
export function bayIndex(floor, bay) {
  let i = 0;
  for (let f = 0; f < floor; f++) i += FLOORS[f];
  return i + bay;
}

// n번째 구(1부터)를 셀 때 불이 들어갈 칸. 4구까지는 4구 층, 8구까지는 8구 층, 그 뒤는 10구 층이다.
export function bayForCount(n) {
  const k = Math.min(FLOORS.at(-1), Math.max(1, Math.round(n)));
  const floor = FLOORS.findIndex((s) => s >= k);
  return { floor, bay: k - 1 };
}

// 지금까지 센 구 수(fill)일 때 층마다 불이 들어온 칸 수.
// 4구 노래는 4구 층만, 8구 노래는 4·8구 층, 10구 노래는 세 층을 모두 채운다(탑이 아래부터 자란다).
export function litPerFloor(fill) {
  return FLOORS.map((size, f) => {
    const below = f === 0 ? 0 : FLOORS[f - 1];
    if (fill <= below) return 0;
    return Math.min(fill, size);
  });
}

export function songTitle(songId) {
  return SONG_CATALOG[songId]?.title ?? songs.find((s) => s.id === songId)?.title ?? '';
}

export function songUnits(songId) {
  return songs.find((s) => s.id === songId)?.units?.length ?? null;
}

export function roomTitle() {
  return songTitle(WING_TABLE.hyangga.room);
}

export const WING_NAMES = Object.fromEntries(WINGS.map((w) => [w.id, w.name]));

// 삐져나온 책의 모양. 갈래의 형식이 그대로 모양이 된다. 단위는 '책 한 권' 기준 비율이다.
//   x: 가로(책 두께 방향), y: 위로, z: 앞으로(서가 밖). w·h·d는 크기.
// 향가: 구마다 얇은 판이 층층이 쌓인다. 층의 구 수보다 많으면 위로 솟고, 적으면 빈 데가 남는다.
// 고려가요: 똑같은 마디가 줄지어 앞으로 이어진다(연이 여럿, 마디 사이 고리).
// 시조: 고른 마디 셋.  사설시조: 가운데 마디만 길게 늘어나 앞으로 튀어나온다.  가사: 끝없이 이어지는 긴 두루마리.
export function popShape(genre, songId, floorSize) {
  switch (genre) {
    case 'hyangga': {
      const n = songUnits(songId) ?? 10;
      const unit = 1 / Math.max(1, floorSize ?? 10);
      const out = [];
      for (let i = 0; i < n; i++) out.push({ x: 0, y: i * unit, z: 0.25, w: 1, h: unit * 0.82, d: 1 });
      return out;
    }
    case 'goryeo':
      return [0, 1, 2, 3].map((i) => ({ x: 0, y: 0.15, z: i * 0.62, w: 1, h: 0.7, d: 0.48, ring: i > 0 }));
    case 'sijo':
      return [0, 1, 2].map((i) => ({ x: 0, y: 0, z: 0.3 + i * 0.42, w: 1, h: 1, d: 0.36 }));
    case 'saseol':
      return [
        { x: 0, y: 0, z: 0.3, w: 1, h: 1, d: 0.36 },
        { x: 0, y: 0.05, z: 0.72, w: 1, h: 0.9, d: 1.9 },
        { x: 0, y: 0, z: 2.66, w: 1, h: 1, d: 0.36 },
      ];
    case 'gasa':
      return [{ x: 0, y: 0.1, z: 0.3, w: 0.7, h: 0.8, d: 3.2 }];
    default:
      return [{ x: 0, y: 0, z: 0.6, w: 1, h: 1, d: 1 }];
  }
}

function emptyArea(area) {
  return Array.from({ length: AREA_SIZE[area] }, () => null);
}

// 반응 사건으로 바뀌는 상태. apply는 바뀐 것이 있으면 무엇이 바뀌었는지 알려 주는 객체를, 없으면 null을 돌려준다.
export function createHyanggaState({ restored = false } = {}) {
  const state = {
    fill: 0,                 // 지금까지 센 구 수(0~10)
    door: 'closed',          // '아아' 문: 'closed' | 'open'(감탄사 있음) | 'absent'(감탄사 없음, 닫힌 채 표지가 흐려짐)
    doorUnit: null,
    shelf: emptyArea('shelf'),     // { songId, popped: 갈래 | null } | null
    bonus: emptyArea('bonus'),
    basket: emptyArea('basket'),   // { songId, to, popped } | null
    bound: { shelf: null, bonus: null },   // 묶인 노래 id 목록
    roomOpen: !!restored,    // 작품 방 문(칸이 묶이는 순간 열린다)
    fog: !restored,          // 먹안개
    restored: !!restored,
    pulses: [],              // 잠깐 켜지는 칸 불: { bay, strength }(그리는 쪽이 꺼 나간다)
    otherActions: 0,         // 다른 관의 고유 동작 사건을 받은 수(점검용)
  };

  function slotOf(area, index) {
    if (!(area in AREA_SIZE)) return null;
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= AREA_SIZE[area]) return null;
    return i;
  }

  function apply(name, detail) {
    const d = detail && typeof detail === 'object' ? detail : {};
    switch (name) {
      case 'diorama:fold': {
        const u = Number(d.unit);
        if (!Number.isFinite(u)) return null;
        const b = bayForCount(u + 1);
        state.pulses.push({ bay: bayIndex(b.floor, b.bay), strength: 0.5 });
        return { pulse: true };
      }
      case 'diorama:pillar-light': {
        const u = Number(d.unit);
        if (!Number.isFinite(u)) return null;
        const b = bayForCount(u + 1);
        state.pulses.push({ bay: bayIndex(b.floor, b.bay), strength: 1 });
        return { pulse: true };
      }
      case 'diorama:floor-fill': {
        const g = Math.min(FLOORS.at(-1), Math.max(0, Math.round(Number(d.gu) || 0)));
        // 처음부터 다시 세기 시작하면 새 노래다. '아아' 문도 닫힌 채로 돌아간다.
        if (g <= 1 && state.door !== 'closed') { state.door = 'closed'; state.doorUnit = null; }
        state.fill = g;
        return { fill: true, door: true };
      }
      case 'diorama:aa-door':
        state.door = d.present ? 'open' : 'absent';
        state.doorUnit = d.present && Number.isInteger(d.unit) ? d.unit : null;
        return { door: true };
      case 'diorama:slot-set': {
        const i = slotOf(d.area, d.index);
        if (i === null) return null;
        const id = typeof d.songId === 'string' && d.songId ? d.songId : null;
        state[d.area][i] = id ? { songId: id, popped: null, to: d.area === 'basket' ? (d.to ?? null) : undefined } : null;
        if (d.area !== 'basket' && state.bound[d.area] && !id) state.bound[d.area] = null;
        return { slots: true };
      }
      case 'diorama:shelf-bound': {
        if (d.area !== 'shelf' && d.area !== 'bonus') return null;
        const ids = Array.isArray(d.songIds) ? d.songIds.slice(0, 3) : [];
        state.bound[d.area] = ids;
        ids.forEach((id, i) => { if (id) state[d.area][i] = { songId: id, popped: null }; });
        if (d.area === 'shelf') state.roomOpen = true;
        return { slots: true, bound: true, room: d.area === 'shelf' };
      }
      case 'diorama:pop-out': {
        const i = slotOf(d.area, d.index);
        if (i === null) return null;
        const prev = state[d.area][i];
        const songId = d.songId ?? prev?.songId ?? null;
        const genre = d.genre ?? SONG_CATALOG[songId]?.genre ?? null;
        // 바구니에서 틀린 노래는 행선지 표시가 지워진다(spec 6.3).
        state[d.area][i] = { songId, popped: genre, to: d.area === 'basket' ? null : undefined };
        return { slots: true, pop: { area: d.area, index: i } };
      }
      case 'diorama:fog-recede':
        if (!state.fog) return null;
        state.fog = false;
        return { fog: true };
      case 'diorama:dancheong-restore':
        state.restored = true;
        state.fog = false;
        return { restore: true, fog: true };
      default:
        if (OTHER_ACTIONS.has(name)) { state.otherActions++; return null; }
        return null;
    }
  }

  return { state, apply };
}

// 점검과 화면이 읽을 수 있는 상태 요약(그림 객체는 담지 않는다).
export function snapshot(state) {
  const copy = (a) => a.map((s) => (s ? { ...s } : null));
  return {
    fill: state.fill,
    lit: litPerFloor(state.fill),
    door: state.door,
    doorUnit: state.doorUnit,
    shelf: copy(state.shelf),
    bonus: copy(state.bonus),
    basket: copy(state.basket),
    bound: { shelf: state.bound.shelf?.slice() ?? null, bonus: state.bound.bonus?.slice() ?? null },
    roomOpen: state.roomOpen,
    fog: state.fog,
    restored: state.restored,
    otherActions: state.otherActions,
  };
}
