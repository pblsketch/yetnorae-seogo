// 음성 사례: 음보 표시(kind)가 약속한 값(yeoeum·refrain·repeat) 밖이다.
import { fx } from '../valid-set.mjs';
export default {
  name: '고려가요 음보 표시가 약속 밖의 값',
  expect: 'FORM',
  mutate(set) {
    fx(set, 'fx-go-a').units[0].lines[0].feet[0].kind = 'chorus';
  },
};
