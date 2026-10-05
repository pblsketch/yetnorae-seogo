// 음성 사례: 고려가요에 후렴·여음 구간이 하나도 없다.
import { fx } from '../valid-set.mjs';
export default {
  name: '고려가요에 후렴·여음 구간이 없음',
  expect: 'FORM',
  mutate(set) {
    fx(set, 'fx-go-a').features.refrains = [];
  },
};
