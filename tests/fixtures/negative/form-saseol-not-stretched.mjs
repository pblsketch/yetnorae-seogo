// 음성 사례: 사설시조인데 초장과 중장이 모두 4음보다.
import { fx } from '../valid-set.mjs';
export default {
  name: '사설시조의 초장·중장이 늘어나지 않음',
  expect: 'FORM',
  mutate(set) {
    const s = fx(set, 'fx-ss-a');
    s.units[1].feet.splice(4);
    s.features.stretched = [];
  },
};
