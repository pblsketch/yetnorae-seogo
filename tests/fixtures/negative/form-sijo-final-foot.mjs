// 음성 사례: 시조 종장 첫 음보가 두 글자다(세 글자여야 한다).
import { fx } from '../valid-set.mjs';
export default {
  name: '시조 종장 첫 음보가 세 글자가 아님',
  expect: 'FORM',
  mutate(set) {
    const s = fx(set, 'fx-sijo-b');
    s.units[2].feet[0] = { original: '어즈', reading: '어즈' };
    s.features.finalFirstFoot.syllables = 2;
  },
};
