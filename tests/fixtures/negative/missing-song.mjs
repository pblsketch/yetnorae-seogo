// 음성 사례: 갈래의 노래가 하나라도 있으면 그 갈래의 표 노래가 모두 있어야 한다.
export default {
  name: '갈래의 표 노래 일부가 빠짐',
  expect: 'MISSING',
  mutate(set) {
    set.songs = set.songs.filter((s) => s.id !== 'fx-gs-b');
  },
};
