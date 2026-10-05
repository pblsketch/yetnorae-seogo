// 음성 사례: 고려가요 연 안의 줄에 음보가 표시되지 않았다.
import { fx } from '../valid-set.mjs';
export default {
  name: '고려가요 줄에 음보 표시가 없음',
  expect: 'FORM',
  mutate(set) {
    fx(set, 'fx-go-a').units[1].lines[0].feet = [];
  },
};
