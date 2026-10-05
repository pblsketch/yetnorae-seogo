// 보스 2단계 리믹스(spec 10.2, js/data/README.md 5절). 다섯 갈래의 칸 노래에서 한 조각씩, 이 순서대로 이어 붙인다.
// 바뀌는 지점은 조각 사이의 넷이고, 시각은 소리 엔진이 낭송 조각 배치에서 계산한다(js/core/rhythm.js buildRemixGrid).
// 무작위는 없다. 조각 선택과 순서는 여기서만 고친다(교사 확인 대상).
//
// 고른 까닭(조각마다 갈래 모양이 귀와 눈에 드러나도록)
//  - 가사 「규원가」 1~4행: 네 음보가 끊이지 않고 이어지는 흐름
//  - 향가 「찬기파랑가」 9~10구: 마지막 무리 첫머리의 감탄사 '아야', 구 하나가 한 박인 느린 걸음
//  - 시조 「동짓달 기나긴 밤을」 초장~종장: 세 장, 장마다 네 음보, 종장 첫 음보 세 글자
//  - 고려가요 「청산별곡」 1연: 한 줄 세 음보와 후렴 '얄리얄리 얄랑셩 얄라리 얄라'
//  - 사설시조 「창 내고쟈」 초장~종장: 길게 늘어난 중장, 시조처럼 세 글자로 여는 종장
// 시조와 사설시조는 서로 붙여 놓지 않았다(바뀌는 순간이 가장 헷갈리는 짝이라 고려가요를 사이에 둔다).
export const remix = {
  fragments: [
    { genre: 'gasa', songId: 'gyuwonga', from: 0, to: 3 },
    { genre: 'hyangga', songId: 'chan-giparangga', from: 8, to: 9 },
    { genre: 'sijo', songId: 'dongjitdal', from: 0, to: 2 },
    { genre: 'goryeo', songId: 'cheongsan-byeolgok', from: 0, to: 0 },
    { genre: 'saseol', songId: 'chang-naegoja', from: 0, to: 2 },
  ],
};
