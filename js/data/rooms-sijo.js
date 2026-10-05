// 작품 방 「십 년을 경영하야」(시조관, spec 9)에서 쓰는 글. 교사 확인 대상이다.
// - 물건 id는 js/data/README.md 7.3을 따른다. 결과 카드(js/result/card.js)도 같은 id로 이름을 찾는다.
// - 노래 원문은 여기에 쓰지 않는다. 방은 원문을 노래 데이터(js/data/songs/sijo.js)에서만 가져온다.
// - 해석 문장은 채점하지 않는다. 화면에 '해석'으로 표시하고, 맞고 틀림을 말하지 않는다.

export const ROOM_SIJO = {
  songId: 'simnyeon-gyeongyeong',
  speaker: '송순',

  // 물건(README 7.3 순서). note는 물건 아래 작게 보이는 한 마디.
  items: [
    { id: 'na', name: '나', note: '집주인' },
    { id: 'dal', name: '달', note: '밤하늘 달' },
    { id: 'cheongpung', name: '청풍', note: '맑은 바람' },
    { id: 'gangsan', name: '강산', note: '강과 산' },
    { id: 'gold', name: '금붙이', note: '재물' },
    { id: 'robe', name: '관복', note: '벼슬' },
    { id: 'guest', name: '손님', note: '찾아온 벗' },
  ],
  // 재물이나 벼슬(송순이 웃으며 되묻는 물건)
  worldlyItems: ['gold', 'robe'],
  // 자연물(원작의 세 칸 가운데 자연인 것)
  natureItems: ['dal', 'cheongpung'],
  // 원작의 세 칸(순서와 상관없이 이 셋이면 '원작대로')
  originalRooms: ['na', 'dal', 'cheongpung'],

  slots: ['첫째 칸', '둘째 칸', '셋째 칸'],
  outside: '집 밖',
  tray: '들일 것',
  summaryRooms: '세 칸',
  title: '작품 방 「십 년을 경영하야」',

  lines: {
    ask: '십 년 걸려 지은 초가 세 칸에 무엇을 들이겠소?',
    hint: '물건을 고른 다음 칸이나 집 밖을 누르세요. 놓인 자리를 한 번 더 누르면 도로 꺼냅니다.',
    chosen: '어디에 둘까요? 칸이나 집 밖을 누르세요.',
    gangsanNoRoom: '강산을 어찌 한 칸에 들이겠소. 들일 데가 없구려.',
    gangsanWaiting: '강산은 밖에 두셨구려. 세 칸도 마저 채워 주시오.',
    gangsanOutsideReady: '강산은 밖에 두셨구려. 세 칸이 다 찼으니 들여 보시오.',
    needThree: '세 칸을 모두 채우면 들일 수 있소.',
    accepted: '좋소, 그리 들이리다.',
    askBack: {
      gold: '허허, 초가 한 칸에 금붙이를 들이시겠다? 그 칸에 달빛 들 자리는 남겠소?',
      robe: '허허, 관복을 들이시겠다? 이 초가에서도 벼슬 옷을 걸어 두고 살겠소?',
      both: '허허, 금붙이에 관복까지 들이시겠다? 세 칸 초가가 꽤 무겁겠구려.',
    },
    keepReply: '허허, 그 또한 한 가지 생각이오.',
    reveal: '나는 이렇게 맡겨 두었소.',
    askGangsan: '그럼 강산은 어디에 두겠소?',
    pullback: '한 걸음 물러서서 보시오. 강산이 병풍처럼 집을 둘렀소.',
    interpretLead: '세 칸에 들인 것을 보니, 이렇게 읽을 수도 있겠소.',
  },

  buttons: {
    confirm: '이대로 들이겠소',
    redo: '다시 놓아 보겠소',
    keep: '이대로 두겠소',
    next: '다음',
    finish: '방을 나서기',
  },

  interpretationLabel: '해석',
  interpretationNote: '해석은 하나로 정해져 있지 않아요.',

  // 해석 문장(spec 9: 셋에서 넷, 조정 가능). 어느 문장이 나오는지는 js/rooms/sijo-logic.js의 interpretationIdFor가 정한다.
  //  as-written     세 칸이 나·달·청풍(원작대로)
  //  nature-swapped 재물·벼슬 없이 손님이 한 칸을 차지함(자연물 일부를 바꿈)
  //  worldly        재물이나 벼슬을 들였고, 달이나 청풍이 아직 한 칸 이상 있음
  //  worldly-only   재물이나 벼슬을 들였고, 달도 청풍도 집 안에 없음
  interpretations: [
    {
      id: 'as-written',
      text: '송순이 노래한 그대로, 나와 달과 맑은 바람이 한 칸씩 나누어 산다. 사람과 자연이 한집에 어울려 욕심 없이 사는 삶으로 읽을 수 있다.',
    },
    {
      id: 'nature-swapped',
      text: '세 칸 가운데 한 자리를 손님에게 내주었다. 자연을 벗 삼아 살면서도 사람과 정을 나누고 싶은 마음으로 읽을 수 있다.',
    },
    {
      id: 'worldly',
      text: '재물이나 벼슬이 초가 한 칸을 차지했다. 자연 속에 살면서도 세상의 것을 놓지 못하는 마음으로 읽을 수 있다.',
    },
    {
      id: 'worldly-only',
      text: '달도 맑은 바람도 들지 못한 초가가 되었다. 집 안은 세상의 것으로 채우고 자연은 밖에만 둔 삶으로 읽을 수 있다.',
    },
  ],
};
