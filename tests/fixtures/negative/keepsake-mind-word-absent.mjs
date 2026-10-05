// 음성 사례: '노래 속 마음' 카드도 노래에 실제로 나오는 말을 담아야 한다(추가 제안 F1).
import { fx } from '../valid-set.mjs';
export default {
  name: '마음 카드 낱말이 노래에 없음',
  expect: 'KEEPSAKE',
  mutate(set) {
    const k = fx(set, 'fx-sijo-c').keepsake;
    k.word = '그리움';
    k.phrase = '그리움';
  },
};
