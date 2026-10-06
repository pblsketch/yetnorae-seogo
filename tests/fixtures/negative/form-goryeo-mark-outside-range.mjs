// 음성 사례: 여음으로 표시한 음보가 features.refrains의 여음 구간에 없다(표시와 구간이 어긋남).
import { fx } from '../valid-set.mjs';
export default {
  name: '고려가요 여음 표시가 구간 밖에 있음',
  expect: 'FORM',
  mutate(set) {
    fx(set, 'fx-go-a').units[0].lines[0].feet[2].kind = 'yeoeum';
  },
};
