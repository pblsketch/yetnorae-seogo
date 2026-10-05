// 음성 사례: 교과서 밖 원문 표시의 모양이 틀렸다(추가 제안 F1).
// 교과서 노래가 아닌데 표시함, 출처(sourceNote) 없음, 표시 값이 true가 아님, 표시 없는 행에 sourceNote.
import { fx } from '../valid-set.mjs';
export default {
  name: '교과서 밖 원문 표시 모양 오류',
  expect: 'FIELD',
  mutate(set) {
    fx(set, 'fx-gs-a').units[3].beyondTextbook = true;
    fx(set, 'fx-gs-a').units[3].sourceNote = '시험용 출처';
    delete fx(set, 'fx-gs-b').units[4].sourceNote;
    fx(set, 'fx-boss-gs').units[0].sourceNote = '표시 없는 행의 출처';
    fx(set, 'fx-sijo-a').units[2].beyondTextbook = 'yes';
  },
};
