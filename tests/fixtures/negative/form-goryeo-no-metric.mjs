// 음성 사례: 모든 음보를 여음으로 표시해 두드릴 박이 하나도 없다.
import { fx } from '../valid-set.mjs';
export default {
  name: '고려가요 노래에 박에 드는 음보가 없음',
  expect: 'FORM',
  mutate(set) {
    const s = fx(set, 'fx-go-a');
    const ranges = [];
    s.units.forEach((u, unit) => u.lines.forEach((l, line) => {
      for (const f of l.feet) f.kind = 'yeoeum';
      ranges.push({ unit, line, from: 0, to: l.feet.length - 1 });
    }));
    s.features.refrains = [{ kind: 'yeoeum', text: '다로 다로 다로리', ranges }];
  },
};
