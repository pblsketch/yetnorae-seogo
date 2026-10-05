// 음성 사례: 길 잃은 노래의 도착할 관이 노래 표와 다르다.
import { fx } from '../valid-set.mjs';
export default {
  name: '노래의 역할·행선지가 노래 표와 다름',
  expect: 'TABLE',
  mutate(set) {
    fx(set, 'fx-go-b').roles[0].to = 'sijo';
  },
};
