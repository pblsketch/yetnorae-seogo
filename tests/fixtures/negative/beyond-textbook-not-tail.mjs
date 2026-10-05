// 음성 사례: 교과서 밖 원문 행이 교과서 행 사이에 끼었다. 이어 붙인 행은 노래 끝에 모여 있어야 한다(추가 제안 F1).
import { fx } from '../valid-set.mjs';
export default {
  name: '교과서 밖 원문 행이 끝이 아닌 자리에 있음',
  expect: 'FIELD',
  mutate(set) {
    const u = fx(set, 'fx-gs-b').units;
    u.unshift(u.pop());
  },
};
