// 음성 사례: 여음 구간 안의 음보에 박 밖 표시(kind)가 없다(여음·후렴은 음보에서 빼고 표시해야 한다).
import { fx } from '../valid-set.mjs';
export default {
  name: '고려가요 여음 구간의 음보를 박으로 셈',
  expect: 'FORM',
  mutate(set) {
    for (const f of fx(set, 'fx-go-a').units[0].lines[2].feet) delete f.kind;
  },
};
