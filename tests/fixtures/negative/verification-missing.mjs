// 음성 사례: 확인 상태가 verified·pending 가운데 하나가 아니다.
import { fx } from '../valid-set.mjs';
export default {
  name: '확인 상태(verification) 누락',
  expect: 'CITATION',
  mutate(set) {
    fx(set, 'fx-hy-4').verification = '';
  },
};
