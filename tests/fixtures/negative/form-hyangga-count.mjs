// 음성 사례: 향가가 여섯 구다(4·8·10구 가운데 하나여야 한다).
import { fx } from '../valid-set.mjs';
export default {
  name: '향가 구 수가 4·8·10이 아님',
  expect: 'FORM',
  mutate(set) {
    fx(set, 'fx-hy-10b').units.splice(6);
  },
};
