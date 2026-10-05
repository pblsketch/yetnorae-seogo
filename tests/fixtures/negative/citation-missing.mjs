// 음성 사례: 출처 문구가 없다.
import { fx } from '../valid-set.mjs';
export default {
  name: '출처(citation) 누락',
  expect: 'CITATION',
  mutate(set) {
    delete fx(set, 'fx-ss-b').citation;
  },
};
