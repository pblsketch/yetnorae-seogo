// 점검 페이지: 연결 단계가 js/registry.js에 더할 한 줄(registry.screens.credits = 출처 화면)을 이 페이지 안에서만 해 보고,
// 제품의 시작 화면(js/main.js와 같은 길)을 띄운다. 시작 화면의 '출처' 문 → 출처 화면 → 돌아가기를 점검한다.
import { registry } from '../../js/registry.js';
import * as credits from '../../js/ui/credits.js';

registry.screens.credits = credits;
const app = document.getElementById('app');
registry.screens.start.show(app);
