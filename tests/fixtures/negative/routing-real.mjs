// 음성 사례(실제 노래 표를 고침): '청산리 벽계수야'를 미리 잰 노래로 옮겨 적었다.
export default {
  name: '실제 노래 표의 행선지 결과 위반',
  target: 'realTable',
  expect: 'ROUTING',
  mutate(table) {
    table.routing.returned.sijo = table.routing.returned.sijo.filter((id) => id !== 'cheongsanri-byeokgyesu');
    table.routing.prewait.sijo.push('cheongsanri-byeokgyesu');
  },
};
