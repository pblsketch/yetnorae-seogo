// 점검 페이지: 세계 바탕을 띄우고 가사관 모형으로 들어간다. 점검 도구가 들여다볼 손잡이를 window.__t에 둔다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
import * as THREE from 'three';
import * as world from '../../js/world/world.js';
import * as events from '../../js/core/events.js';
import * as gasa from '../../js/world/wings/gasa.js';

const arrivals = [];
world.mount(document.getElementById('app'), {
  wings: { gasa },
  appearance: 'a',
  onArrive: (a) => arrivals.push(a),
});
world.enterWing('gasa');
world.resetCamera();

// gasa·THREE는 관 모형을 세계 밖에서 따로 만들어 보는 음성 사례(모르는 사건)에 쓴다.
window.__t = { world, events, arrivals, gasa, THREE, ready: true };
