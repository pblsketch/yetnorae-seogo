// 음성 사례: 줄 끝 음보를 여음으로 빼면 세 음보 줄이 80%가 안 되는데 'goryeo-3beat'를 증거로 적었다.
import { fx } from '../valid-set.mjs';
export default {
  name: '여음을 뺀 음보 수로는 나오지 않는 3음보 증거',
  expect: 'EVIDENCE',
  mutate(set) {
    const s = fx(set, 'fx-go-a');
    for (const unit of [0, 1]) {
      s.units[unit].lines[0].feet[2].kind = 'yeoeum';
      s.features.refrains[0].ranges.push({ unit, line: 0, from: 2, to: 2 });
    }
  },
};
