// 점검 페이지: 세계 바탕에 시조관 모형을 끼워 띄우고, 점검 도구가 들여다볼 손잡이를 window.__t에 둔다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
import * as world from '../../js/world/world.js';
import * as events from '../../js/core/events.js';
import * as sijo from '../../js/world/wings/sijo.js';

const arrivals = [];
world.mount(document.getElementById('app'), {
  wings: { sijo },
  appearance: 'a',
  onArrive: (a) => arrivals.push(a),
});

window.__t = { world, events, arrivals, ready: true };
