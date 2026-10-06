// 음성 사례: 되풀이 머리(repeat) 뒤에 여음이 없다(뒤 음보를 미리 불러 두는 모양이 아니다).
import { fx } from '../valid-set.mjs';
export default {
  name: '고려가요 되풀이 머리 뒤에 여음이 없음',
  expect: 'FORM',
  mutate(set) {
    fx(set, 'fx-go-a').units[0].lines[0].feet[0].kind = 'repeat';
  },
};
