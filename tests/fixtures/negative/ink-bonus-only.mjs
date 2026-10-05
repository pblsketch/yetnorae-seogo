// 음성 사례: 개념을 먹으로 만들려면 보스 노래가 있어야 한다(반드시 지나는 길만으로는 한 편뿐).
import { fx } from '../valid-set.mjs';
export default {
  name: '반드시 지나는 길만으로 먹이 되지 않는 개념',
  expect: 'INK',
  mutate(set) {
    const s = fx(set, 'fx-gs-b');
    s.evidences = s.evidences.filter((c) => c !== 'gasa-nolimit');
  },
};
