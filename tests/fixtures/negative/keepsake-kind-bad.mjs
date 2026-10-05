// 음성 사례: 기념품 종류(kind)가 'object'·'mind' 밖이다(추가 제안 F1).
import { fx } from '../valid-set.mjs';
export default {
  name: '기념품 종류(kind)가 약속 밖',
  expect: 'KEEPSAKE',
  mutate(set) {
    fx(set, 'fx-go-a').keepsake.kind = 'feeling';
  },
};
