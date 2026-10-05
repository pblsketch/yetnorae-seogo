// 음성 사례: 교과서 밖 원문을 이어 붙인 노래를 verified로 두었다. 이어 붙인 부분은 확인 대기여야 한다(추가 제안 F1).
import { fx } from '../valid-set.mjs';
export default {
  name: '교과서 밖 원문이 있는데 verified',
  expect: 'CITATION',
  mutate(set) {
    fx(set, 'fx-gs-b').verification = 'verified';
  },
};
