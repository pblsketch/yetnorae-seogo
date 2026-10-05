// 가사관 회랑의 상태(3D와 2D가 함께 쓴다). 화면과 Three.js에 기대지 않아 Node에서도 시험할 수 있다.
//
// 회랑은 '칸'(기둥 넷과 처마 한 덩이)이 줄지어 이어진다. 기둥 넷은 가사 한 행의 네 음보와 짝이다.
// 걷기 한 걸음(diorama:walk-step)마다 칸이 하나 새로 지어진다.
// 그리는 칸은 늘 POOL개뿐이다. 지어진 칸이 앞머리(front)를 넘으면 회랑 전체가 한 칸씩 앞으로 미끄러지고,
// 문 앞으로 밀려난 칸은 바닥으로 가라앉아 맨 끝의 아직 안 지은 칸(먹안개 속 흐린 칸)으로 다시 쓰인다.
// 그래서 몇 걸음을 걸어도 그리는 양은 같고, 끝은 언제나 먹안개 속으로 이어져 끝이 없어 보인다.

export const CORRIDOR_DEFAULTS = {
  pool: 10,            // 그리는 칸 수(다시 쓰는 칸)
  front: 3,            // 새 칸이 지어지는 가장 먼 자리(문에서 몇 번째 칸, 카메라에 보이는 곳)
  initialBuilt: 2,     // 처음부터 지어져 있는 칸 수
  riseSeconds: 0.7,    // 새 칸이 솟아오르는 시간
  slideSeconds: 0.8,   // 회랑이 한 칸 미끄러지는 시간
  litSeconds: 1.4,     // 기둥 불이 켜져 있는 시간
  flashSeconds: 0.9,   // 처마 띠가 반짝이는 시간
};

const ease = (t) => 1 - (1 - t) ** 3;

export function createCorridor(options = {}) {
  const o = { ...CORRIDOR_DEFAULTS, ...options };
  let built = o.initialBuilt;
  let steps = 0;
  let offset = Math.max(0, built - o.front);
  let shown = offset;                 // 미끄러지는 중인 지금 위치(칸 단위, 소수)
  const rises = new Map();            // 칸 번호 → 솟아오름 진행(0~1)
  const lit = new Map();              // '칸:기둥' → 남은 시간
  const flashes = new Map();          // 칸 번호 → 남은 시간
  let dirty = true;

  // 걷기 한 걸음: 칸 하나를 짓고, 새 칸의 기둥 넷에 불을 켠다. 새 칸 번호를 돌려준다.
  function step(reduce = false) {
    steps++;
    built++;
    const n = built - 1;
    offset = Math.max(0, built - o.front);
    if (reduce) shown = offset;
    rises.set(n, reduce ? 1 : 0);
    for (let k = 0; k < 4; k++) lit.set(n + ':' + k, o.litSeconds);
    dirty = true;
    return n;
  }

  // 박 하나(기둥 불). unit이 그려진 지은 칸이면 그 칸, 아니면 가장 새 칸의 기둥에 켠다.
  function light(unit, foot) {
    const n = targetSegment(unit);
    const k = ((Number(foot) || 0) % 4 + 4) % 4;
    lit.set(n + ':' + k, o.litSeconds);
    dirty = true;
    return { n, k };
  }

  function flash(unit) {
    const n = targetSegment(unit);
    flashes.set(n, o.flashSeconds);
    dirty = true;
    return n;
  }

  function targetSegment(unit) {
    const u = Number.isInteger(unit) ? unit : -1;
    const first = Math.ceil(shown);
    return u >= first && u < built ? u : built - 1;
  }

  function tick(dt, reduce = false) {
    let changed = false;
    if (shown !== offset) {
      // 한꺼번에 여러 걸음이 오면 밀린 만큼 빨리 따라잡는다
      shown = reduce ? offset : Math.min(offset, shown + (dt / o.slideSeconds) * Math.max(1, offset - shown));
      changed = true;
    }
    for (const [n, t] of rises) {
      const v = reduce ? 1 : Math.min(1, t + dt / o.riseSeconds);
      if (v >= 1) rises.delete(n); else rises.set(n, v);
      changed = true;
    }
    for (const map of [lit, flashes]) {
      for (const [k, t] of map) {
        const v = t - dt;
        if (v <= 0) map.delete(k); else map.set(k, v);
        changed = true;
      }
    }
    if (changed) dirty = true;
    return changed;
  }

  // 그릴 칸 목록. rel은 문에서 떨어진 칸 수(0이 문 바로 안쪽, 음수면 문 앞으로 밀려나 가라앉는 중).
  // sink는 세로 크기(1이 온전, 0이 다 가라앉음), rise는 솟아오름 진행(지어진 칸만), ghost는 아직 안 지은 칸.
  function segments() {
    const base = Math.floor(shown);
    const out = [];
    for (let slot = 0; slot < o.pool; slot++) {
      const n = base + (((slot - base) % o.pool) + o.pool) % o.pool;
      const rel = n - shown;
      const isBuilt = n < built;
      const r = rises.has(n) ? ease(rises.get(n)) : 1;
      out.push({
        slot,
        n,
        rel,
        built: isBuilt,
        ghost: !isBuilt,
        rise: isBuilt ? r : 1,
        sink: rel < 0 ? Math.max(0, 1 + rel) : 1,
        lit: [0, 1, 2, 3].map((k) => (lit.get(n + ':' + k) ?? 0) / o.litSeconds),
        flash: (flashes.get(n) ?? 0) / o.flashSeconds,
      });
    }
    return out;
  }

  return {
    options: o,
    step,
    light,
    flash,
    tick,
    segments,
    get built() { return built; },
    get steps() { return steps; },
    get offset() { return offset; },
    get shown() { return shown; },
    get animating() { return shown !== offset || rises.size > 0 || lit.size > 0 || flashes.size > 0; },
    takeDirty() { const d = dirty; dirty = false; return d; },
    markDirty() { dirty = true; },
    snapshot: () => ({ built, steps, offset, shown, pool: o.pool, front: o.front }),
  };
}
