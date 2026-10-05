// 점검 페이지: 세계 바탕에 사설시조관 모형을 끼워 띄우고, 점검 도구가 들여다볼 손잡이를 window.__t에 둔다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
import * as world from '../../js/world/world.js';
import * as events from '../../js/core/events.js';
import * as saseol from '../../js/world/wings/saseol.js';
import { anchorProblems2D } from '../../js/world/wings/saseol-model.js';

// 모형 손잡이를 엿보려고 create3D·create2D를 감싼다(모형 자체는 그대로).
const handles = [];
const wrapped = {
  create3D: (ctx) => { const h = saseol.create3D(ctx); handles.push(h); return h; },
  create2D: (ctx) => { const h = saseol.create2D(ctx); handles.push(h); return h; },
};

const arrivals = [];
world.mount(document.getElementById('app'), {
  wings: { saseol: wrapped },
  appearance: 'a',
  onArrive: (a) => arrivals.push(a),
});
world.enterWing('saseol');

window.__t = {
  world, events, arrivals, anchorProblems2D,
  handle: () => handles.at(-1),
  ready: true,
};
