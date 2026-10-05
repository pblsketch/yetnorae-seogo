// 시조관 모형의 상태(3D·2D 공통). 디오라마 사건을 받아 상태를 바꾸고, 시간에 따라 연출 값을 움직인다.
// 그리는 일은 sijo-3d.js와 sijo-2d.js가 이 상태를 읽어서 한다. DOM과 Three.js에 기대지 않는다.
//
// 건축(spec 3.1): 3층 정자(초장·중장·종장). 층마다 계단참이 둘(3장 6구)이고, 종장으로 오르는 첫 계단은 세 칸이다.
// 층마다 앞기둥 넷(장마다 네 음보)이 두드리기 박마다 불을 켠다.
import { SONG_CATALOG } from '../../data/song-table.js';
import { wingById } from '../../data/wings.js';

export const STOREYS = ['초장', '중장', '종장'];
export const FEET = 4;              // 층마다 앞기둥 수(장마다 네 음보)
export const FINAL_STEPS = 3;       // 종장으로 오르는 첫 계단 칸 수(종장 첫 음보 세 글자)
export const GHOST_MAX = 4;         // 세 칸을 넘는 글자 수를 보여 줄 '맞지 않는 계단' 최대 수
export const MAX_STEPS = FINAL_STEPS + GHOST_MAX;

// 자리 묶음과 자리 수. shelf·bonus·basket은 js/data/README.md 8.1의 area 값이다.
// mentor(선대 사서의 자리)와 returned(돌아온 노래 선반)는 이 작업이 제안한 area 값이다(README '추가 제안(T9)').
export const AREAS = { shelf: 3, bonus: 3, basket: 2, mentor: 1, returned: 4 };
export const BINDABLE = ['shelf', 'bonus'];
// 빈자리에 제목 없는 빈 책등을 세워 두는 묶음(spec 8). 바구니와 돌아온 노래 선반은 비어 있으면 아무것도 없다.
const BLANK_WHEN_EMPTY = new Set(['shelf', 'bonus', 'mentor']);

export const ROOM_SONG_ID = 'simnyeon-gyeongyeong';
export const ROOM_LABEL = '「' + (SONG_CATALOG[ROOM_SONG_ID]?.title ?? '') + '」';
export const MENTOR_LABEL = '선대 사서의 자리';

// 연출 시간(초). 움직임 줄이기에서는 같은 시간 동안 켜 두었다가 끊는다(서서히 바뀌지 않는다).
export const TIMES = { pillarFlash: 0.9, beamFlash: 1.2, pop: 0.45, bind: 1.0, fog: 2.0, hop: 0.3, mentor: 1.6 };

export function songTitle(songId) {
  return SONG_CATALOG[songId]?.title ?? null;
}

export function wingName(wingId) {
  return wingById(wingId)?.name ?? null;
}

const mod = (n, m) => ((Math.trunc(n) % m) + m) % m;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - Math.pow(1 - t, 3);

// 책 하나의 바탕 모양(책 기준 좌표): y는 책 높이의 비율(0 아래 ~ 1 위), z는 m(뒤 -0.25 ~ 앞 0.25, +z가 서가 밖).
export const BOOK = { y: [0, 1], z: [-0.25, 0.25] };

// 판정에서 틀린 노래가 삐져나오는 모양(spec 6.1). 갈래의 생김새가 시조 칸과 어떻게 어긋나는지 보인다.
// stick: 서가에 맞지 않아 밖으로 나온 부분(눈에 띄는 색으로 그린다).
export function popShape(genre) {
  switch (genre) {
    case 'saseol':   // 초장·종장은 칸에 맞고, 늘어난 중장만 서가 밖으로 길게 튀어나온다
      return [
        { y: [2 / 3, 1], z: [-0.25, 0.25] },
        { y: [1 / 3, 2 / 3], z: [-0.25, 1.15], stick: true },
        { y: [0, 1 / 3], z: [-0.25, 0.25] },
      ];
    case 'gasa':     // 행이 끝없이 이어져 책이 서가 밖으로 줄줄이 이어진다
      return [
        { y: [0, 1], z: [-0.25, 0.25] },
        { y: [0.05, 0.95], z: [0.32, 0.6], stick: true },
        { y: [0.05, 0.95], z: [0.67, 0.95], stick: true },
        { y: [0.05, 0.95], z: [1.02, 1.3], stick: true },
        { y: [0.05, 0.95], z: [1.37, 1.65], stick: true },
        { y: [0.05, 0.95], z: [1.72, 2.0], stick: true },
      ];
    case 'hyangga':  // 4·4·2구로 쌓인 탑 모양이라 칸 위로 솟는다
      return [
        { y: [0, 0.55], z: [-0.1, 0.4] },
        { y: [0.6, 1.15], z: [-0.1, 0.4], stick: true },
        { y: [1.2, 1.48], z: [-0.1, 0.4], stick: true },
      ];
    case 'goryeo':   // 똑같은 연이 줄지어 이어져 칸 밖으로 나란히 나온다
      return [
        { y: [0, 1], z: [-0.25, 0.2] },
        { y: [0, 1], z: [0.3, 0.75], stick: true },
        { y: [0, 1], z: [0.85, 1.3], stick: true },
      ];
    default:         // 시조(바구니나 다른 자리에서 틀림): 세 장 그대로 앞으로 밀려 나온다
      return [
        { y: [2 / 3, 1], z: [0.1, 0.6], stick: true },
        { y: [1 / 3, 2 / 3], z: [0.1, 0.6], stick: true },
        { y: [0, 1 / 3], z: [0.1, 0.6], stick: true },
      ];
  }
}

// 삐져나옴 진행값 p(0~1)에 맞춘 조각들. p=0이면 모든 조각이 책 하나 안에 눌려 있다가 p=1에서 제 모양이 된다.
export function popSegments(genre, p) {
  const shape = popShape(genre);
  const maxY = Math.max(1, ...shape.map((s) => s.y[1]));
  const minZ = Math.min(...shape.map((s) => s.z[0]));
  const maxZ = Math.max(...shape.map((s) => s.z[1]));
  const zs = (z) => BOOK.z[0] + ((z - minZ) / (maxZ - minZ || 1)) * (BOOK.z[1] - BOOK.z[0]);
  return shape.map((s) => ({
    y: [lerp(s.y[0] / maxY, s.y[0], p), lerp(s.y[1] / maxY, s.y[1], p)],
    z: [lerp(zs(s.z[0]), s.z[0], p), lerp(zs(s.z[1]), s.z[1], p)],
    kind: s.stick ? 'stick' : 'book',
  }));
}

// 두드리기 박 하나가 어느 기둥에 불을 켜는지. 장 갈래는 장 = 층, 음보 = 기둥.
// 다른 갈래(시조관에서 다른 갈래 노래를 잴 때)도 오류 없이 층과 기둥을 돌아가며 켠다.
export function pillarOf(detail) {
  const d = detail ?? {};
  if (isNum(d.foot)) {
    const row = isNum(d.line) ? d.line : isNum(d.unit) ? d.unit : 0;
    return { storey: mod(row, STOREYS.length), foot: mod(d.foot, FEET) };
  }
  const idx = mod(isNum(d.unit) ? d.unit : 0, STOREYS.length * FEET);
  return { storey: Math.floor(idx / FEET), foot: idx % FEET };
}

function holderList(area) {
  return Array.from({ length: AREAS[area] }, () => ({ songId: null, to: null, pop: null }));
}

export function createSijoModel({ restored = false } = {}) {
  const s = {
    pillarsLit: new Array(STOREYS.length * FEET).fill(false),
    pillarFlash: new Array(STOREYS.length * FEET).fill(0),
    beamFlash: new Array(STOREYS.length).fill(0),
    stair: { step: 0, total: FINAL_STEPS, lit: new Array(MAX_STEPS).fill(false), hop: 0 },
    holders: Object.fromEntries(Object.keys(AREAS).map((a) => [a, holderList(a)])),
    bound: Object.fromEntries(BINDABLE.map((a) => [a, { on: false, p: 0 }])),
    fog: restored ? 0 : 1,
    fogTarget: restored ? 0 : 1,
    mentorFlash: 0,
    reactions: 0,      // 연출로 이어진 사건 수(점검용 아님, 다시 그릴지 판단에 쓴다)
  };
  let dirty = true;

  function holder(area, index) {
    const list = s.holders[area];
    if (!list || !isNum(index)) return null;
    return list[Math.trunc(index)] ?? null;
  }

  const handlers = {
    'diorama:fold'(d) {
      if (!isNum(d?.unit)) return false;
      s.beamFlash[mod(d.unit, STOREYS.length)] = TIMES.beamFlash;
      return true;
    },
    'diorama:pillar-light'(d) {
      const { storey, foot } = pillarOf(d);
      // 새 장(층)의 첫 음보면 그 층 기둥을 끄고 다시 센다. 초장 첫 음보면 모두 끈다(새 노래).
      if (foot === 0) {
        for (let i = 0; i < s.pillarsLit.length; i++) {
          if (storey === 0 || Math.floor(i / FEET) === storey) { s.pillarsLit[i] = false; s.pillarFlash[i] = 0; }
        }
      }
      const i = storey * FEET + foot;
      s.pillarsLit[i] = true;
      s.pillarFlash[i] = TIMES.pillarFlash;
      return true;
    },
    'diorama:stair-step'(d) {
      const step = Math.trunc(Number(d?.step));
      if (!(step >= 1)) return false;
      if (step === 1) s.stair.lit.fill(false);
      const total = Math.trunc(Number(d?.total));
      s.stair.total = Math.min(MAX_STEPS, Math.max(step, total >= 1 ? total : FINAL_STEPS));
      s.stair.step = Math.min(step, MAX_STEPS);
      for (let k = 0; k < s.stair.step; k++) s.stair.lit[k] = true;
      s.stair.hop = TIMES.hop;
      return true;
    },
    'diorama:slot-set'(d) {
      const h = holder(d?.area, d?.index);
      if (!h) return false;
      const id = typeof d.songId === 'string' && d.songId ? d.songId : null;
      h.songId = id;
      h.to = id && typeof d.to === 'string' ? d.to : null;
      h.pop = null;
      if (s.bound[d.area] && !id) s.bound[d.area] = { on: false, p: 0 };
      if (d.area === 'mentor' && id) s.mentorFlash = TIMES.mentor;
      return true;
    },
    'diorama:shelf-bound'(d) {
      const b = s.bound[d?.area];
      if (!b) return false;
      if (Array.isArray(d.songIds)) {
        d.songIds.slice(0, AREAS[d.area]).forEach((id, i) => {
          if (typeof id === 'string' && id) s.holders[d.area][i].songId = id;
        });
      }
      s.holders[d.area].forEach((h) => { h.pop = null; });
      if (!b.on) s.bound[d.area] = { on: true, p: 0 };
      return true;
    },
    'diorama:pop-out'(d) {
      const h = holder(d?.area, d?.index);
      if (!h) return false;
      if (typeof d.songId === 'string' && d.songId) h.songId = d.songId;
      const genre = typeof d.genre === 'string' ? d.genre : (SONG_CATALOG[h.songId]?.genre ?? 'sijo');
      h.pop = { genre, p: 0 };
      h.to = null;   // 바구니: 행선지 표시가 지워진다(spec 6.3)
      return true;
    },
    'diorama:fog-recede'() {
      s.fogTarget = 0;
      return true;
    },
    'diorama:dancheong-restore'() {
      // 단청색은 세계 바탕의 단청 값으로 돌아온다(onDancheong). 남은 먹안개도 함께 걷힌다.
      s.fogTarget = 0;
      return true;
    },
    // 다른 관의 고유 동작 사건: 시조관에는 해당하는 건축이 없어 연출하지 않는다.
    'diorama:floor-fill'() { return false; },
    'diorama:aa-door'() { return false; },
    'diorama:refrain-link'() { return false; },
    'diorama:walk-step'() { return false; },
    'diorama:unroll'() { return false; },
  };

  // 사건 하나를 받는다. 모르는 사건은 조용히 넘긴다. 연출이 바뀌었으면 true.
  function react(name, detail) {
    const fn = Object.hasOwn(handlers, name) ? handlers[name] : null;
    if (!fn) return false;
    const changed = !!fn(detail);
    if (changed) { s.reactions++; dirty = true; }
    return changed;
  }

  // 시간을 흘린다. 다시 그려야 하면 true.
  function tick(dt, reduce) {
    let moving = false;
    const dec = (v) => Math.max(0, v - dt);
    for (let i = 0; i < s.pillarFlash.length; i++) if (s.pillarFlash[i] > 0) { s.pillarFlash[i] = dec(s.pillarFlash[i]); moving = true; }
    for (let i = 0; i < s.beamFlash.length; i++) if (s.beamFlash[i] > 0) { s.beamFlash[i] = dec(s.beamFlash[i]); moving = true; }
    if (s.stair.hop > 0) { s.stair.hop = dec(s.stair.hop); moving = true; }
    if (s.mentorFlash > 0) { s.mentorFlash = dec(s.mentorFlash); moving = true; }
    for (const list of Object.values(s.holders)) {
      for (const h of list) {
        if (h.pop && h.pop.p < 1) { h.pop.p = reduce ? 1 : Math.min(1, h.pop.p + dt / TIMES.pop); moving = true; }
      }
    }
    for (const b of Object.values(s.bound)) {
      if (b.on && b.p < 1) { b.p = reduce ? 1 : Math.min(1, b.p + dt / TIMES.bind); moving = true; }
    }
    if (s.fog !== s.fogTarget) {
      s.fog = reduce ? s.fogTarget : Math.max(s.fogTarget, s.fog - dt / TIMES.fog);
      moving = true;
    }
    const need = moving || dirty;
    dirty = false;
    return need;
  }

  // 반짝임 세기(0~1). 움직임 줄이기에서는 켜짐·꺼짐 둘만 있다.
  function flash(timer, total, reduce) {
    if (timer <= 0) return 0;
    return reduce ? 1 : ease(timer / total);
  }

  // 기둥 불 세기(0~1): 켜진 기둥은 은은히 남고, 막 켜진 기둥은 더 밝게 반짝인다.
  function pillarGlow(i, reduce) {
    const f = flash(s.pillarFlash[i], TIMES.pillarFlash, reduce);
    return s.pillarsLit[i] ? 0.6 + 0.4 * f : f;
  }

  function beamGlow(i, reduce) {
    return flash(s.beamFlash[i], TIMES.beamFlash, reduce);
  }

  // 계단 k(0부터)의 상태: 'off' | 'lit'. k ≥ 3은 세 칸을 넘는 글자의 '맞지 않는 계단'이고, 밟았을 때만 보인다.
  function stepState(k) {
    if (k >= FINAL_STEPS) return k < s.stair.step ? 'ghost-lit' : 'hidden';
    return s.stair.lit[k] ? 'lit' : 'off';
  }

  // 등불이 올라선 계단(0부터)과 뛰어오르는 높이(0~1). 아직 오르지 않았으면 null.
  function lantern(reduce) {
    if (s.stair.step < 1) return null;
    const hop = reduce ? 0 : Math.sin(Math.PI * (s.stair.hop / TIMES.hop));
    return { step: s.stair.step - 1, hop: Math.max(0, hop) };
  }

  // 자리 하나에 그릴 조각들(책 기준 좌표). kind: 'blank' | 'book' | 'stick' | 'gold' | 'tag'.
  function segmentsOf(area, index, reduce) {
    const h = s.holders[area]?.[index];
    if (!h) return [];
    if (h.pop) return popSegments(h.pop.genre, reduce ? 1 : ease(h.pop.p));
    if (!h.songId) return BLANK_WHEN_EMPTY.has(area) ? [{ ...BOOK, kind: 'blank' }] : [];
    const out = [{ ...BOOK, kind: 'book' }];
    const bound = s.bound[area];
    if ((bound?.on && bound.p > 0) || area === 'mentor') out.push({ y: [0.08, 0.92], z: [0.25, 0.27], kind: 'gold' });
    if (area === 'basket' && h.to) out.push({ y: [0.7, 1.0], z: [0.25, 0.45], kind: 'tag' });
    return out;
  }

  // 자리의 모습 이름(그리는 쪽의 표시용): 'blank' | 'book' | 'popped' | 'empty'
  function holderState(area, index) {
    const h = s.holders[area]?.[index];
    if (!h) return 'empty';
    if (h.pop) return 'popped';
    if (h.songId) return 'book';
    return BLANK_WHEN_EMPTY.has(area) ? 'blank' : 'empty';
  }

  // 책등에 보일 제목. 칸·덤은 묶인 뒤에만, 선대 사서의 자리와 돌아온 노래 선반은 꽂히면 보인다(spec 8).
  function titleOf(area, index) {
    const h = s.holders[area]?.[index];
    if (!h?.songId || h.pop) return null;
    if (BINDABLE.includes(area) && !s.bound[area].on) return null;
    if (area === 'basket') return null;
    return songTitle(h.songId);
  }

  // 묶임 진행값(0~1). 세 권이 가운데로 모여 실로 묶인다.
  function bindProgress(area, reduce) {
    const b = s.bound[area];
    if (!b?.on) return 0;
    return reduce ? 1 : ease(b.p);
  }

  return {
    state: s,
    react,
    tick,
    pillarGlow,
    beamGlow,
    stepState,
    lantern,
    segmentsOf,
    holderState,
    titleOf,
    bindProgress,
    fog: () => s.fog,
    mentorGlow: (reduce) => flash(s.mentorFlash, TIMES.mentor, reduce),
    basketTag: (index) => {
      const h = s.holders.basket[index];
      return h && !h.pop && h.to ? wingName(h.to) : null;
    },
  };
}
