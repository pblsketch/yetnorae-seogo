// 음성 사례: 시조 중장이 다섯 음보다(장마다 네 음보여야 한다).
import { fx } from '../valid-set.mjs';
export default {
  name: '시조 장의 음보 수가 4가 아님',
  expect: 'FORM',
  mutate(set) {
    fx(set, 'fx-sijo-b').units[1].feet.push({ original: '더하기', reading: '더하기' });
  },
};
