// 음성 사례: 가사가 세 행뿐이다(넷 이상이어야 한다).
import { fx } from '../valid-set.mjs';
export default {
  name: '가사 행이 넷보다 적음',
  expect: 'FORM',
  mutate(set) {
    fx(set, 'fx-gs-a').units.splice(3);
  },
};
