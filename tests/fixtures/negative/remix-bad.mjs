// 음성 사례: 리믹스 조각의 갈래가 겹친다(다섯 갈래에서 한 조각씩이어야 한다).
export default {
  name: '리믹스 형식 위반',
  expect: 'REMIX',
  mutate(set) {
    set.remix.fragments[4] = { genre: 'sijo', songId: 'fx-sijo-b', from: 1, to: 1 };
  },
};
