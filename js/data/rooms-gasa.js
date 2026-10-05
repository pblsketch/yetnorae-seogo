// 가사관 작품 방 「상춘곡」의 글(spec 9, js/data/README.md 7.3). 교사 확인 대상이다.
// 노래 글(원문·풀이)은 여기에 다시 쓰지 않는다. 방은 노래 데이터(sangchungok)에서 행을 읽고,
// 여기에는 머무는 곳의 나눔, 모을 시어(노래 원문에 그대로 나오는 말), 안내 글만 둔다.
//
// - 행 번호(from·to·unit)는 노래 데이터 units의 번호로 0부터 센다(화면에는 1부터 보인다).
// - 머무는 곳은 작품에 나오는 차례 그대로다: 수간모옥 → 정자 → 시냇가 → 산봉우리 → 마무리.
//   교과서 대목(1~21행)은 정자에서 끝나고, 시냇가부터는 교과서 밖 원문(22~39행)이다.
// - 시어의 text는 그 행 원문(음보를 띄어 이은 글)에 그대로 들어 있어야 한다(공백은 무시하고 비교).
//   점검(tests/check-room-gasa.mjs)과 js/rooms/gasa-model.js의 checkRoomData가 확인한다.
// - 모은 시어는 결과 카드에 그대로 남는다(record.words = 모은 시어의 text, 아래 차례대로).

export const roomGasa = {
  room: 'gasa',
  songId: 'sangchungok',

  stations: [
    {
      id: 'hut',
      name: '수간모옥',
      from: 0,
      to: 12,
      arrive: '초가 몇 칸, 수간모옥에서 길을 나섭니다. 집 둘레에 새봄이 와 있어요.',
      collect: '수간모옥 둘레에서 본 봄 경치의 시어를 모아 보세요.',
      words: [
        { id: 'saebom', text: '새봄', unit: 6 },
        { id: 'dohwa-haenghwa', text: '도화 행화(桃花杏花)', unit: 7 },
        { id: 'nogyang-bangcho', text: '녹양방초(綠楊芳草)', unit: 8 },
        { id: 'chungi', text: '춘기(春氣)', unit: 11 },
      ],
    },
    {
      id: 'pavilion',
      name: '정자',
      from: 13,
      to: 20,
      arrive: '사립문 밖을 거닐다 정자에 앉아 봅니다. 이웃에게 산수 구경을 가자고 부르지요.',
      collect: '정자에서 꾸린 봄나들이의 시어를 모아 보세요.',
      words: [
        { id: 'sansu', text: '산수(山水)', unit: 16 },
        { id: 'dapcheong', text: '답청(踏靑)', unit: 17 },
        { id: 'chaesan', text: '채산(採山)', unit: 18 },
        { id: 'gonnamo', text: '곳나모', unit: 20 },
      ],
    },
    {
      id: 'stream',
      name: '시냇가',
      from: 21,
      to: 29,
      arrive: '봄바람이 시냇물을 건너옵니다. 시냇가에 앉아 잔을 씻고 흐르는 물을 굽어봅니다.',
      collect: '시냇가에서 만난 봄 경치의 시어를 모아 보세요.',
      words: [
        { id: 'hwapung', text: '화풍(和風)', unit: 21 },
        { id: 'noksu', text: '녹수(綠水)', unit: 21 },
        { id: 'cheonghyang', text: '청향(淸香)', unit: 22 },
        { id: 'nakhong', text: '낙홍(落紅)', unit: 22 },
        { id: 'cheongnyu', text: '청류(淸流)', unit: 28 },
        { id: 'dohwa', text: '도화(桃花)', unit: 28 },
      ],
    },
    {
      id: 'peak',
      name: '산봉우리',
      from: 30,
      to: 34,
      arrive: '소나무 사이 좁은 길로 산봉우리에 올라 구름 속에 앉습니다. 마을과 들판이 한눈에 보여요.',
      collect: '산봉우리에서 내려다본 봄 경치의 시어를 모아 보세요.',
      words: [
        { id: 'dugyeonhwa', text: '두견화(杜鵑花)', unit: 30 },
        { id: 'cheonchon-mallak', text: '천촌만락(千村萬落)', unit: 32 },
        { id: 'yeonha-ilhwi', text: '연하일휘(煙霞日輝)', unit: 33 },
        { id: 'geumsu', text: '금수(錦繡)', unit: 33 },
        { id: 'bombit', text: '봄빗', unit: 34 },
      ],
    },
    {
      id: 'ending',
      name: '마무리',
      from: 35,
      to: 38,
      arrive: '봄 경치를 다 보고 난 화자가 자기 삶을 돌아봅니다.',
      collect: '',
      words: [],
    },
  ],

  // 마무리: 공명과 부귀가 나를 꺼린다는 행(36행)을 읊은 뒤, 두 말을 멀리 떠나보낸다(원작의 결말 그대로).
  letGo: {
    unit: 35,
    prompt: '공명도 부귀도 나를 꺼린다고 하네요. 두 말을 눌러 멀리 떠나보내세요.',
    words: [
      { id: 'gongmyeong', text: '공명(功名)', unit: 35 },
      { id: 'bugwi', text: '부귀(富貴)', unit: 35 },
    ],
    done: '공명과 부귀를 멀리 보냈습니다. 남은 행을 마저 걸어 보세요.',
  },

  // 끝에서 만나는 태도(안빈낙도). keep의 text도 노래 원문에 그대로 나오는 말이다.
  finale: {
    title: '안빈낙도(安貧樂道)',
    body: '공명과 부귀는 멀리하고, 가난한 살림 속에서도 마음 편히 자연을 벗 삼아 즐기는 태도입니다. 화자는 봄 경치를 거닌 끝에 이 마음에 이릅니다.',
    keep: [
      { id: 'cheongpung-myeongwol', text: '청풍명월(淸風明月)', unit: 36, note: '맑은 바람과 밝은 달만이 벗' },
      { id: 'danpyo-nuhang', text: '단표누항(簞瓢陋巷)', unit: 37, note: '가난한 살림에도 허튼 생각을 하지 않음' },
    ],
    wordsTitle: '길에서 모은 봄 시어',
    finish: '방 마치기',
  },

  // 화면 글
  text: {
    title: '「상춘곡」 — 봄을 즐기는 길',
    intro: '화자의 발걸음을 따라 수간모옥에서 정자, 시냇가, 산봉우리까지 작품에 나오는 차례대로 걷습니다. 한 걸음에 한 행(네 박)을 읊어요. 머무는 곳마다 봄 경치를 담은 시어를 모읍니다.',
    introBeyond: '교과서에 실린 대목은 정자까지입니다. 시냇가부터는 옛 문헌의 원문을 이어 붙인 \'교과서 밖 원문\'이에요.',
    begin: '길 나서기',
    step: '한 걸음',
    walking: '걷는 중…',
    stepHint: '\'한 걸음\'을 누르면 한 행을 읊으며 걷습니다.',
    stepHintNoBeat: '\'한 걸음\'을 누르면 한 행씩 걷습니다.',
    collectMore: '더 모아도 되고, \'한 걸음\'으로 다음 곳으로 가도 됩니다.',
    collectNeed: '시어를 하나 이상 모으면 다음 곳으로 걸을 수 있어요.',
    beyondStart: '여기부터는 교과서 밖 원문입니다. 교과서에 실린 대목은 정자까지예요.',
    beyondLabel: '교과서 밖 원문',
    sourceLabel: '출처',
    rowLabel: (n) => n + '행',
    pouch: '모은 시어',
    pouchCount: (n) => n + '개',
    lastRow: '끝 행까지 걸었습니다.',
    stationsLabel: '머무는 곳',
    collectedMark: '모음',
  },
};
