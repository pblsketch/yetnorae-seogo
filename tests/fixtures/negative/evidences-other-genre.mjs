// 음성 사례: 시조에 가사 개념을 증거로 적었다.
import { fx } from '../valid-set.mjs';
export default {
  name: '다른 갈래의 개념을 evidences에 적음',
  expect: 'EVIDENCE',
  mutate(set) {
    fx(set, 'fx-sijo-b').evidences.push('gasa-4beat');
  },
};
