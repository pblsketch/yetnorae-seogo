// 점검 페이지: wings를 넘기지 않고 세계 바탕을 띄워 js/registry.js에 등록된 관 모형을 그대로 쓴다.
// 점검 도구가 들여다볼 손잡이를 window.__t에 둔다. 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
import * as THREE from 'three';
import * as world from '../../js/world/world.js';
import * as events from '../../js/core/events.js';
import { registry } from '../../js/registry.js';
import * as normalize from '../../js/world/wings/normalize.js';

const arrivals = [];
world.mount(document.getElementById('app'), { appearance: 'a', onArrive: (a) => arrivals.push(a) });

window.__t = { world, events, registry, normalize, THREE, arrivals, ready: true };
