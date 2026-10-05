// 음성 사례: 수첩 줄이 없는 개념 id를 가리킨다.
export default {
  name: '수첩 쪽 형식 위반',
  expect: 'NOTEBOOK',
  mutate(set) {
    set.notebook.sijo.lines[0].conceptIds.push('sijo-none');
  },
};
