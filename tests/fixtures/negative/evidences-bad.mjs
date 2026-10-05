// 음성 사례: 8구 향가인데 10구체 개념을 증거로 적었다(features에서 나오지 않는다).
import { fx } from '../valid-set.mjs';
export default {
  name: 'features에서 나오지 않는 evidences',
  expect: 'EVIDENCE',
  mutate(set) {
    fx(set, 'fx-hy-8').evidences.push('hyangga-442');
  },
};
