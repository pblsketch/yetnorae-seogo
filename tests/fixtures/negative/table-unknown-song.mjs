// 음성 사례: 노래 표에 없는 id의 노래가 들어 있다.
import { fx } from '../valid-set.mjs';
export default {
  name: '노래 표에 없는 노래',
  expect: 'TABLE',
  mutate(set) {
    const extra = structuredClone(fx(set, 'fx-sijo-c'));
    extra.id = 'fx-sijo-unknown';
    set.songs.push(extra);
  },
};
