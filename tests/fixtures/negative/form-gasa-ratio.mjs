// 음성 사례: 가사 행 가운데 4음보 행이 절반뿐이다(기본 80% 이상이어야 한다).
import { fx } from '../valid-set.mjs';
export default {
  name: '가사 4음보 행 비율이 기준보다 낮음',
  expect: 'FORM',
  mutate(set) {
    const s = fx(set, 'fx-gs-b');
    s.units[0].feet.pop();
    s.units[1].feet.pop();
  },
};
