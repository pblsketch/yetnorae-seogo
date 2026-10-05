// 점검 페이지: 세계 바탕을 단독으로 띄우고, 점검 도구가 들여다볼 손잡이를 window.__t에 둔다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
import * as world from '../../js/world/world.js';
import * as events from '../../js/core/events.js';
import * as fixture from './wing-fixture.js';

const log = [];
for (const name of ['orientation:pause', 'orientation:resume', 'audio:pause', 'audio:resume', 'settings:reduce-motion']) {
  events.on(name, (detail) => log.push({ name, detail }));
}

const arrivals = [];
const contextCalls = [];

world.mount(document.getElementById('app'), {
  wings: { hyangga: fixture, goryeo: fixture },
  appearance: 'a',
  onArrive: (a) => arrivals.push(a),
});

window.__t = { world, events, log, arrivals, contextCalls, fixture: fixture.calls, ready: true };
