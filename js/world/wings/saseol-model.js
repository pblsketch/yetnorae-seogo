// 사설시조관 모형의 상태와 모양 계산. 3D(saseol-3d.js)와 2D(saseol-2d.js)가 같은 상태를 그린다.
// 화면에 기대지 않아 Node에서도 바로 시험할 수 있다.
//
// 건축(spec 3.1): 시조 정자인데 가운데 층(중장)만 엿가락처럼 늘어나 관 벽을 뚫고 장터까지 삐져나간다.
// 고유 동작 '연타로 풀기'(diorama:unroll)를 하면 늘어난 층을 따라 두루마리가 길게 풀린다.

// 정자 층마다 앞 기둥 넷(장마다 네 음보). 가운데 층은 정자 안 넷 + 늘어난 쪽 열둘.
export const STOREY_LANTERNS = [4, 16, 4];
export const LANTERN_COUNT = STOREY_LANTERNS.reduce((a, b) => a + b, 0);
const STOREY_OFFSET = [0, STOREY_LANTERNS[0], STOREY_LANTERNS[0] + STOREY_LANTERNS[1]];

// 시조 한 장의 음보 수. 두루마리에서 이만큼은 정자 안에 들어가고, 넘는 만큼 늘어난 층을 따라 나간다.
export const FOUR_FEET = 4;
// 4음보를 넘는 음보가 늘어난 층을 얼마나 빨리 채우는지(클수록 천천히). 36음보 중장이 장터 가까이까지 간다.
export const BEYOND_FEET_SCALE = 12;

// 종장으로 오르는 첫 계단 칸 수(시조관과 같은 틀: 종장 첫 음보 세 글자)
export const STAIR_STEPS = 3;

export const AREAS = { shelf: 3, bonus: 3, basket: 2 };

// 두루마리가 어디까지 풀렸는지. within: 정자 안 몫(0~1), beyond: 늘어난 층 몫(0~1).
export function unrollReach(feet) {
  const f = Math.max(0, Number(feet) || 0);
  const within = Math.min(f, FOUR_FEET) / FOUR_FEET;
  const beyond = f > FOUR_FEET ? 1 - Math.exp(-(f - FOUR_FEET) / BEYOND_FEET_SCALE) : 0;
  return { within, beyond };
}

// 늘어난 층의 생김새. s는 늘어나기 시작하는 곳(0)에서 장터 끝(1)까지.
// thick: 굵기 비율(가운데가 가늘게 늘어진 엿가락), sag: 처짐(가운데가 가장 깊다), drop: 끝으로 갈수록 내려앉음.
export function taffy(s) {
  const t = Math.min(1, Math.max(0, s));
  const bow = Math.sin(Math.PI * t);
  return { thick: 1 - 0.55 * Math.pow(bow, 0.8), sag: bow, drop: t };
}

// 등불 번호. 넘어온 사건의 자리를 정자 층의 등불 하나로 옮긴다. 맞는 자리가 없으면 -1.
export function lanternIndex(detail) {
  const unit = Number(detail?.unit);
  if (!Number.isInteger(unit) || unit < 0) return -1;
  const foot = detail?.foot;
  // 향가는 음보가 없다: 구마다 등불 하나를 차례로
  if (foot === null || foot === undefined) return unit % LANTERN_COUNT;
  const f = Number(foot);
  if (!Number.isInteger(f) || f < 0) return -1;
  const storey = unit % 3;
  const line = Number.isInteger(detail?.line) && detail.line > 0 ? detail.line : 0;
  const within = (line * 3 + f) % STOREY_LANTERNS[storey];
  return STOREY_OFFSET[storey] + within;
}

export function lanternStorey(index) {
  return index < STOREY_OFFSET[1] ? 0 : index < STOREY_OFFSET[2] ? 1 : 2;
}

// 삐져나오는 책의 모양(spec 6.1). 아래부터 위로 쌓는 마디 목록이고 h는 높이 몫, d는 앞으로 튀어나오는 몫.
// 사설시조는 중장 마디가 길게 튀어나오고, 시조는 세 마디가 고르며, 가사는 마디가 끝없이 이어져 흘러내리고,
// 향가는 4·4·2 무리의 탑, 고려가요는 연 사이에 후렴 고리가 낀다.
export function popShape(genre) {
  switch (genre) {
    case 'saseol': return [{ h: 1, d: 1 }, { h: 1.7, d: 2.8, long: true }, { h: 1, d: 1 }];
    case 'sijo': return [{ h: 1, d: 1 }, { h: 1, d: 1 }, { h: 1, d: 1 }];
    case 'gasa': return Array.from({ length: 8 }, (_, i) => ({ h: 0.5, d: 1 + i * 0.22, long: i >= 4 }));
    case 'hyangga': return [{ h: 1.2, d: 1.2 }, { h: 1.2, d: 0.9 }, { h: 0.6, d: 0.6 }];
    case 'goryeo': {
      const out = [];
      for (let i = 0; i < 4; i++) {
        if (i) out.push({ h: 0.14, d: 1.35, ring: true });
        out.push({ h: 0.7, d: 1 });
      }
      return out;
    }
    default: return [{ h: 2, d: 1 }];
  }
}

const POP_TIME = 0.5;
const FOG_TIME = 1.5;
const FLASH_TIME = 0.45;
const UNROLL_SPEED = 14;   // 1초에 따라잡는 음보 수(연타가 빨라도 두루마리가 뒤따라 풀린다)

// 모형 상태. apply(사건 이름, detail)로 바꾸고 step(dt, 줄이기)로 움직임을 진행한다.
export function createModel({ fog = true } = {}) {
  const s = {
    lanterns: new Array(LANTERN_COUNT).fill(false),
    flash: [0, 0, 0],
    stairs: 0,
    feet: 0,           // 풀린 음보 수(목표)
    feetShown: 0,      // 지금 그려진 음보 수(움직임 중간값)
    unrollPulse: 0,    // 연타 한 번마다 굴대가 튀는 정도
    slots: { shelf: [null, null, null], bonus: [null, null, null], basket: [null, null] },
    bound: { shelf: false, bonus: false },
    boundIds: { shelf: [], bonus: [] },
    pops: new Map(),   // 'area:index' → { area, index, songId, genre, shape, t }
    fog: fog ? 1 : 0,
    fogShown: fog ? 1 : 0,
    aaDoor: null,
    links: 0,
    walkSteps: 0,
    restored: false,
    version: 0,
  };

  const validSlot = (area, index) => Object.hasOwn(AREAS, area) && Number.isInteger(index) && index >= 0 && index < AREAS[area];

  const handlers = {
    'diorama:fold'(d) {
      const u = Number(d.unit);
      if (!Number.isInteger(u) || u < 0) return false;
      s.flash[u % 3] = FLASH_TIME;
      return true;
    },
    'diorama:pillar-light'(d) {
      const i = lanternIndex(d);
      if (i < 0) return false;
      // 노래 하나를 새로 두드리기 시작하면(첫 단위의 첫 박) 등불을 모두 끄고 다시 켠다.
      const first = d.unit === 0 && (d.foot === 0 || d.foot === null || d.foot === undefined) && !(d.line > 0);
      if (first) s.lanterns.fill(false);
      s.lanterns[i] = true;
      return true;
    },
    'diorama:floor-fill'(d) {
      const gu = Math.max(0, Math.min(LANTERN_COUNT, Number(d.gu) || 0));
      s.lanterns.fill(false);
      for (let i = 0; i < gu; i++) s.lanterns[i] = true;
      return true;
    },
    'diorama:aa-door'(d) {
      s.aaDoor = { present: !!d.present, unit: d.unit ?? null };
      return true;
    },
    'diorama:stair-step'(d) {
      const step = Number(d.step);
      if (!Number.isFinite(step) || step < 0) return false;
      s.stairs = Math.min(STAIR_STEPS, Math.floor(step));
      return true;
    },
    'diorama:refrain-link'() { s.links++; return true; },
    'diorama:walk-step'(d) { s.walkSteps = Math.max(0, Number(d.step) || 0); return true; },
    'diorama:unroll'(d) {
      const feet = Math.max(0, Math.floor(Number(d.feet) || 0));
      if (feet === 0 || feet < s.feet) s.feetShown = Math.min(s.feetShown, feet);   // 새 노래: 감긴 데서 다시
      if (feet > s.feet) s.unrollPulse = 1;
      s.feet = feet;
      return true;
    },
    'diorama:slot-set'(d) {
      if (!validSlot(d.area, d.index)) return false;
      s.slots[d.area][d.index] = d.songId ? { songId: String(d.songId), to: d.to ?? null } : null;
      s.pops.delete(d.area + ':' + d.index);
      if (d.area !== 'basket' && s.bound[d.area] && !d.songId) s.bound[d.area] = false;
      return true;
    },
    'diorama:shelf-bound'(d) {
      if (d.area !== 'shelf' && d.area !== 'bonus') return false;
      const ids = Array.isArray(d.songIds) ? d.songIds.slice(0, 3).map(String) : [];
      s.bound[d.area] = true;
      s.boundIds[d.area] = ids;
      ids.forEach((id, i) => { s.slots[d.area][i] = { songId: id, to: null }; });
      for (let i = 0; i < 3; i++) s.pops.delete(d.area + ':' + i);
      return true;
    },
    'diorama:pop-out'(d) {
      if (!validSlot(d.area, d.index)) return false;
      const genre = typeof d.genre === 'string' ? d.genre : null;
      s.pops.set(d.area + ':' + d.index, { area: d.area, index: d.index, songId: d.songId ?? null, genre, shape: popShape(genre), t: 0 });
      if (d.area === 'basket' && s.slots.basket[d.index]) s.slots.basket[d.index] = { ...s.slots.basket[d.index], to: null };   // 행선지 표시가 지워진다
      return true;
    },
    'diorama:fog-recede'() { s.fog = 0; return true; },
    'diorama:dancheong-restore'() { s.restored = true; s.fog = 0; return true; },
  };

  function apply(name, detail) {
    const fn = handlers[name];
    if (!fn) return false;
    const ok = fn(detail && typeof detail === 'object' ? detail : {});
    if (ok) s.version++;
    return ok;
  }

  // 움직임을 진행한다. 바뀐 것이 있으면 true.
  function step(dt, reduce) {
    let changed = false;
    const t = Math.max(0, Number(dt) || 0);
    if (s.feetShown !== s.feet) {
      if (reduce) s.feetShown = s.feet;
      else {
        const dir = Math.sign(s.feet - s.feetShown);
        const next = s.feetShown + dir * Math.max(UNROLL_SPEED, Math.abs(s.feet - s.feetShown) * 3) * t;
        s.feetShown = dir > 0 ? Math.min(s.feet, next) : Math.max(s.feet, next);
      }
      changed = true;
    }
    if (s.unrollPulse > 0) {
      s.unrollPulse = reduce ? 0 : Math.max(0, s.unrollPulse - t * 5);
      changed = true;
    }
    if (s.fogShown !== s.fog) {
      s.fogShown = reduce ? s.fog : Math.max(0, Math.min(1, s.fogShown + Math.sign(s.fog - s.fogShown) * (t / FOG_TIME)));
      if (Math.abs(s.fogShown - s.fog) < 1e-3) s.fogShown = s.fog;
      changed = true;
    }
    for (const p of s.pops.values()) {
      if (p.t < 1) { p.t = reduce ? 1 : Math.min(1, p.t + t / POP_TIME); changed = true; }
    }
    for (let i = 0; i < 3; i++) {
      if (s.flash[i] > 0) { s.flash[i] = reduce ? 0 : Math.max(0, s.flash[i] - t); changed = true; }
    }
    return changed;
  }

  return { state: s, apply, step };
}

// 2D 자리가 상황 버튼 구석(오른쪽 아래)이나 걷는 띠 밖에 있는지. 문제 목록을 돌려준다.
export function anchorProblems2D(anchors) {
  const out = [];
  for (const [key, v] of Object.entries(anchors ?? {})) {
    (Array.isArray(v) ? v : [v]).forEach((p, i) => {
      const name = key + (Array.isArray(v) ? '[' + i + ']' : '');
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') { out.push(name + ': 좌표 없음'); return; }
      if (p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) out.push(name + ': 그림 판 밖');
      if (p.x > 78 && p.y > 78) out.push(name + ': 상황 버튼 구석');
      if (p.y < 40 || p.y > 95) out.push(name + ': 걷는 띠 밖');
    });
  }
  return out;
}
