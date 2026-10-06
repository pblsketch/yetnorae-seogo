// 음성 사례: 박 밖 표시(kind)를 고려가요가 아닌 시조 음보에 썼다.
import { fx } from '../valid-set.mjs';
export default {
  name: '시조 음보에 kind 표시',
  expect: 'FORM',
  mutate(set) {
    fx(set, 'fx-sijo-b').units[0].feet[0].kind = 'yeoeum';
  },
};
