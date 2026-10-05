// 음성 사례(실제 노래 표를 고침): 시조관 칸 노래가 둘뿐이다.
export default {
  name: '실제 노래 표의 모양 위반',
  target: 'realTable',
  expect: 'TABLE_SHAPE',
  mutate(table) {
    table.wings.sijo.shelf.pop();
  },
};
