// 음성 사례: 줄의 첫 음보를 앞 음보에 붙여 쓴다고(joined) 표시했다.
import { fx } from '../valid-set.mjs';
export default {
  name: '고려가요 줄 첫 음보에 joined',
  expect: 'FORM',
  mutate(set) {
    fx(set, 'fx-go-a').units[0].lines[0].feet[0].joined = true;
  },
};
