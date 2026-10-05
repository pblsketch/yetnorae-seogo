// 작품 방 「제망매가」의 흐름 계산. 화면과 상관없다(Node에서 바로 시험한다).
// - 앞 여덟 구: 낭송을 들으며 떨어지는 잎을 붙잡지만 손안에서 흩어진다.
// - 9구 '아아': 잡으려던 손이 미타찰로 가는 길을 닦는 손이 된다. 10구로 끝난다.
// - 끝: 해석 고르기(채점하지 않음). 기록 모양은 js/data/README.md 7.3.
import { interpretations } from '../data/rooms-hyangga.js';

export const ROOM_ID = 'hyangga';

// 노래 데이터에서 방의 흐름을 정한다. 10구체이고 9구에 감탄사 표시가 있는 노래만 받는다.
export function roomPlan(song) {
  const n = song?.units?.length ?? 0;
  const ex = song?.features?.exclamation;
  if (song?.genre !== 'hyangga' || n !== 10) throw new Error('「제망매가」 방은 10구체 향가만 받는다');
  if (!ex || ex.unit !== n - 2 || typeof ex.text !== 'string' || !ex.text) throw new Error("9구 감탄사('아아') 표시가 없다");
  const aaUnit = ex.unit;
  return {
    catchUnits: Array.from({ length: aaUnit }, (_, i) => i),
    aaUnit,
    finalUnit: n - 1,
    exclamation: ex.text,
  };
}

// 구 글을 감탄사와 나머지로 나눈다. 감탄사로 시작하지 않으면 null. 두 조각을 이으면 원래 글 그대로다.
export function splitExclamation(text, head) {
  if (typeof text !== 'string' || !head || !text.startsWith(head)) return null;
  return { head, rest: text.slice(head.length) };
}

// 기록(js/data/README.md 7.3). 해석은 채점하지 않으므로 정답 여부를 담지 않는다.
export function makeRecord(interpretationId, list = interpretations) {
  const it = list.find((i) => i.id === interpretationId);
  if (!it) throw new Error('없는 해석: ' + interpretationId);
  return { room: ROOM_ID, interpretationId: it.id, interpretationText: it.text, isInterpretation: true };
}

// ── 떨어지는 잎 ──
// 잎 하나: { id, u(가로 0~1), v(떨어진 정도: 0 가지 ~ 1 땅), phase, speed }
// still이면(움직임 줄이기) 잎이 제자리에 떠 있다. 붙잡은 잎은 손안에 남지 않고 가지에서 새 잎으로 다시 시작한다.
export const LEAF_VISIBLE = { from: 0.06, to: 0.97 };

export function createLeafField({ count = 4, fallSeconds = 7, rng = Math.random, still = false } = {}) {
  let serial = 0;
  const spread = (i) => (count <= 1 ? 0.5 : 0.08 + (0.84 * i) / (count - 1));
  const make = (i, v) => ({
    id: 'leaf-' + serial++,
    u: still ? spread(i) : 0.08 + rng() * 0.84,
    v,
    phase: rng() * Math.PI * 2,
    speed: 0.8 + rng() * 0.4,
  });
  // 처음에는 이미 떨어지고 있는 잎들이 고르게 퍼져 보이게 한다.
  const leaves = Array.from({ length: count }, (_, i) => make(i, still ? 0.3 + 0.45 * ((i * 2) % count) / count : 0.12 + (0.7 * i) / Math.max(1, count - 1)));
  let time = 0;

  const visible = (l) => l.v >= LEAF_VISIBLE.from && l.v <= LEAF_VISIBLE.to;

  function respawn(l) {
    const i = leaves.indexOf(l);
    Object.assign(l, make(i, still ? l.v : 0), still ? { u: l.u } : {});
  }

  return {
    leaves,
    visible,
    step(dt) {
      if (still || !(dt > 0)) return;
      time += dt;
      for (const l of leaves) {
        l.v += (dt / fallSeconds) * l.speed;
        l.u = Math.min(0.95, Math.max(0.05, l.u + Math.sin(time * 1.3 + l.phase) * dt * 0.025));
        if (l.v > 1.02) respawn(l);
      }
    },
    // 바람에 흔들리는 각도(도)
    tilt(l) { return still ? 0 : Math.sin(time * 2 + l.phase) * 28; },
    // 붙잡기 단추가 고를 잎: 보이는 잎 가운데 가장 낮게 떨어진 잎
    nearest() {
      const vis = leaves.filter(visible);
      const pool = vis.length ? vis : leaves;
      return pool.reduce((a, b) => (b.v > a.v ? b : a), pool[0]) ?? null;
    },
    // 붙잡는다. 잡은 자리를 돌려주고, 잎은 가지로 돌아가 새로 떨어진다.
    catchLeaf(id) {
      const l = leaves.find((x) => x.id === id);
      if (!l) return null;
      const at = { u: l.u, v: l.v };
      respawn(l);
      return at;
    },
  };
}
