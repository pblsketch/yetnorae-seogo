// 음성 사례: 보스 낯선 노래가 아닌데 singerGroups가 있다.
import { fx } from '../valid-set.mjs';
export default {
  name: '낯선 노래가 아닌 노래의 singerGroups',
  expect: 'FIELD',
  mutate(set) {
    fx(set, 'fx-sijo-b').singerGroups = ['literati-gisaeng'];
  },
};
