// 음성 사례: 기념품 물건이 원문에도 풀이에도 나오지 않는다.
import { fx } from '../valid-set.mjs';
export default {
  name: '기념품 물건이 노래에 없음',
  expect: 'KEEPSAKE',
  mutate(set) {
    const k = fx(set, 'fx-go-a').keepsake;
    k.name = '비파';
    k.word = '비파';
  },
};
