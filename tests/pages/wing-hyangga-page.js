// 점검 페이지: 세계 바탕에 향가관 모형을 끼워 띄우고, 점검 도구가 들여다볼 손잡이를 window.__t에 둔다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
// globalThis.__hyHeavy에 수를 넣고 관에 들어가면 그만큼 상자를 더 붙여 그리기 호출 예산 초과(음성 사례)를 만든다.
import * as world from '../../js/world/world.js';
import * as events from '../../js/core/events.js';
import * as wing from '../../js/world/wings/hyangga.js';

const handles = [];
const arrivals = [];

const wrapper = {
  create3D(ctx) {
    const h = wing.create3D(ctx);
    const extra = [];
    const heavy = Number(globalThis.__hyHeavy) || 0;
    for (let i = 0; i < heavy; i++) {
      const m = new ctx.THREE.Mesh(new ctx.THREE.BoxGeometry(0.2, 0.2, 0.2), new ctx.THREE.MeshLambertMaterial());
      m.position.set(-5 + (i % 20) * 0.5, 0.3 + Math.floor(i / 20) * 0.3, 3);
      ctx.root.add(m);
      extra.push(m);
    }
    handles.push({ mode: '3d', h, root: ctx.root });
    return { ...h, dispose() { h.dispose(); extra.forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); } };
  },
  create2D(ctx) {
    const h = wing.create2D(ctx);
    handles.push({ mode: '2d', h, container: ctx.container });
    return h;
  },
};

world.mount(document.getElementById('app'), {
  wings: { hyangga: wrapper },
  appearance: 'a',
  onArrive: (a) => arrivals.push(a),
});

window.__t = { world, events, wing, handles, arrivals, h: () => handles.at(-1)?.h ?? null, ready: true };
