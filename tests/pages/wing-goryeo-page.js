// 점검 페이지: 세계 바탕에 고려가요관 모형을 끼워 띄우고, 점검 도구가 들여다볼 손잡이를 window.__t에 둔다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
import * as world from '../../js/world/world.js';
import * as events from '../../js/core/events.js';
import * as goryeo from '../../js/world/wings/goryeo.js';
import * as layout from '../../js/world/wings/goryeo-state.js';

const arrivals = [];
world.mount(document.getElementById('app'), {
  wings: { goryeo },
  appearance: 'a',
  onArrive: (a) => arrivals.push(a),
});

// 3D면 관 모형의 그물(이름으로 찾는다)을, 2D면 SVG 요소를 들여다본다.
function mesh(name) {
  return world.getThree()?.root?.getObjectByName(name) ?? null;
}

// 인스턴스 가운데 크기가 0이 아닌 것들의 자리
function visibleInstances(name) {
  const m = mesh(name);
  if (!m) return null;
  const out = [];
  const M = new m.instanceMatrix.array.constructor(16);
  for (let i = 0; i < m.count; i++) {
    const a = m.instanceMatrix.array.subarray(i * 16, i * 16 + 16);
    M.set(a);
    const sx = Math.hypot(M[0], M[1], M[2]);
    const sy = Math.hypot(M[4], M[5], M[6]);
    if (sx > 1e-6 && sy > 1e-6) out.push({ x: M[12], y: M[13], z: M[14], sx, sy, sz: Math.hypot(M[8], M[9], M[10]) });
  }
  return out;
}

function colorAt(name, index) {
  const m = mesh(name);
  const a = m?.instanceColor?.array;
  if (!a) return null;
  return [a[index * 3], a[index * 3 + 1], a[index * 3 + 2]];
}

window.__t = { world, events, arrivals, layout, mesh, visibleInstances, colorAt, ready: true };
