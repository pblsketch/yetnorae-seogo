// 음성 사례: 행선지 결과 목록이 행선지 규칙(spec 4.3)과 다르다.
// 아직 마치지 않은 관의 칸 노래인데 '돌아온 노래' 선반으로 적었다.
export default {
  name: '행선지 결과 목록이 규칙과 다름',
  expect: 'ROUTING',
  mutate(set) {
    set.table.routing.prewait.goryeo = [];
    set.table.routing.returned.goryeo = ['fx-go-b'];
  },
};
