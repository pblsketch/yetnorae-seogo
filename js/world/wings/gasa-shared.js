// 가사관 3D·2D가 함께 쓰는 배치와 자리 상태. 화면과 Three.js에 기대지 않는다.
import { SONG_CATALOG } from '../../data/song-table.js';

// 3D 배치(관 바닥 가운데가 원점, 1 = 1m, +z가 카메라 쪽). 걸을 수 있는 곳은 x·z 모두 약 ±6m다.
export const GATE_Z = -1.6;      // 회랑 입구 문
export const SEG_LEN = 4;        // 칸 하나(기둥 넷)의 길이
export const SHELF = { x: -4.4, z: 0.4 };      // 칸(세 자리)
export const BONUS = { x: 4.4, z: 0.4 };       // 덤 칸(세 자리)
export const RETURNED = { x: -4.9, z: 3.5 };    // 돌아온 노래 선반
export const BASKET = { x: 4.6, z: 3.6 };       // 바구니(두 자리)
export const ROOM_DOOR = { x: 4.7, z: -4.9 };   // 작품 방 「상춘곡」 문
export const NEXT_DOOR = { x: -4.7, z: -4.9 };  // 다음 관 문
export const WAITING = { x: -2.0, z: 4.4 };     // 미리 잰 노래가 기다리는 자리

export const AREAS = ['shelf', 'bonus', 'basket'];
const SIZE = { shelf: 3, bonus: 3, basket: 2 };
const POP_SECONDS = 0.55;

export function titleOf(songId) {
  return SONG_CATALOG[songId]?.title ?? '';
}

// 자리 상태: 꽂힌 노래, 묶임, 삐져나옴. 사건을 받아 바꾸고, 바뀌었으면 true를 돌려준다.
export function createWingState() {
  const slots = {
    shelf: [null, null, null],
    bonus: [null, null, null],
    basket: [null, null],
    returned: [],
  };
  const bound = { shelf: null, bonus: null };
  const pops = new Map();   // 'area:index' → { genre, songId, t(0~1) }

  const validIndex = (area, index) => Number.isInteger(index) && index >= 0 && index < SIZE[area];

  function apply(name, d, reduce = false) {
    switch (name) {
      case 'diorama:slot-set': {
        // 돌아온 노래 선반은 약속에 자리 사건이 없어, area 'returned'가 오면 받아 둔다(제안).
        if (d.area === 'returned') {
          const i = Number.isInteger(d.index) ? d.index : slots.returned.length;
          if (i >= 0 && i < 8) slots.returned[i] = typeof d.songId === 'string' ? d.songId : null;
          return true;
        }
        if (!SIZE[d.area] || !validIndex(d.area, d.index)) return true;
        const id = typeof d.songId === 'string' ? d.songId : null;
        if (d.area === 'basket') slots.basket[d.index] = id ? { songId: id, to: typeof d.to === 'string' ? d.to : null } : null;
        else slots[d.area][d.index] = id;
        pops.delete(d.area + ':' + d.index);
        if (d.area !== 'basket' && !id) bound[d.area] = null;
        return true;
      }
      case 'diorama:shelf-bound': {
        if (d.area !== 'shelf' && d.area !== 'bonus') return true;
        const ids = Array.isArray(d.songIds) ? d.songIds.filter((s) => typeof s === 'string').slice(0, 3) : [];
        ids.forEach((id, i) => { slots[d.area][i] = id; pops.delete(d.area + ':' + i); });
        bound[d.area] = ids;
        return true;
      }
      case 'diorama:pop-out': {
        if (!SIZE[d.area] || !validIndex(d.area, d.index)) return true;
        pops.set(d.area + ':' + d.index, { genre: typeof d.genre === 'string' ? d.genre : null, songId: d.songId ?? null, t: reduce ? 1 : 0 });
        if (d.area === 'basket' && slots.basket[d.index]) slots.basket[d.index] = { ...slots.basket[d.index], to: null };   // 행선지 표시가 지워진다
        return true;
      }
      case 'diorama:fold':
      case 'diorama:pillar-light':
      case 'diorama:floor-fill':
      case 'diorama:aa-door':
      case 'diorama:stair-step':
      case 'diorama:refrain-link':
      case 'diorama:walk-step':
      case 'diorama:unroll':
      case 'diorama:fog-recede':
      case 'diorama:dancheong-restore':
        return true;
      default:
        return false;
    }
  }

  // 삐져나오는 움직임. 바뀐 것이 있으면 true
  function tick(dt, reduce = false) {
    let changed = false;
    for (const p of pops.values()) {
      if (p.t >= 1) continue;
      p.t = reduce ? 1 : Math.min(1, p.t + dt / POP_SECONDS);
      changed = true;
    }
    return changed;
  }

  return { slots, bound, pops, apply, tick };
}

// 삐져나옴의 튀는 정도(조금 넘쳤다가 자리 잡는다)
export function popAmount(t) {
  const x = Math.min(1, Math.max(0, t));
  return 1 + 0.25 * Math.sin(x * Math.PI) * (1 - x) * 2 - (1 - x) ** 2;
}
