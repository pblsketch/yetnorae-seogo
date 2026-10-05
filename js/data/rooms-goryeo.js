// 작품 방 「정석가」(고려가요관, spec 9)에서 쓰는 글. 교사 확인 대상이다.
//
// - 노래 글(원문·풀이)은 여기에 다시 적지 않는다. 카드와 마지막 연은 노래 데이터(js/data/songs/goryeo.js)의
//   연·줄 번호만 가리키고, 화면은 그 번호로 노래 데이터의 원문과 풀이를 꺼내 보인다.
// - 여기에 새로 쓴 글: 카드의 짧은 오늘말 이름(label), 임의 대사, 안내 문구, 발견 장면의 설명.
// - 이 방에는 해석 고르기가 없다. 임의 반박은 채점이 아니라 약속을 더 단단하게 만들게 하는 장치다.
// - 번호는 0부터 센다(js/data/README.md). 화면에는 1부터 보인다.

export const room = {
  songId: 'jeongseokga',

  // 불가능한 조건 카드. 「정석가」 2~5연(units[1]~units[4])에서 하나씩.
  //  unit: 연 번호, lines: 내세운 조건 쪽지에 보일 줄 번호(되풀이 줄은 한 번만), conditionLine: 카드 앞면에 보일 조건 줄.
  //  label: 카드 이름(오늘말, 결과 카드에 '내세운 조건'으로 남는다), objection: 그 카드를 받은 임의 따짐.
  cards: [
    {
      id: 'gueun-bam',
      unit: 1,
      lines: [0, 2, 3],
      conditionLine: 3,
      label: '구운 밤에서 싹이 나면',
      objection: '모래가 따뜻하면 밤 한 톨쯤은 움이 틀지도 모르지 않소?',
    },
    {
      id: 'ok-yeonkkot',
      unit: 2,
      lines: [0, 2, 3],
      conditionLine: 3,
      label: '옥 연꽃이 피어나면',
      objection: '솜씨 좋은 장인이 새긴 꽃이라면 피어나 보일 수도 있지 않소?',
    },
    {
      id: 'musoe-cheollik',
      unit: 3,
      lines: [0, 2, 3],
      conditionLine: 3,
      label: '무쇠 철릭이 해어지면',
      objection: '오래오래 입으면 무쇠 옷도 언젠가는 닳아 해어지지 않겠소?',
    },
    {
      id: 'musoe-so',
      unit: 4,
      lines: [0, 2, 3],
      conditionLine: 3,
      label: '무쇠 소가 쇠풀을 먹으면',
      objection: '쇠나무 산이라면 무쇠 소가 먹을 쇠풀도 자라지 않겠소?',
    },
  ],

  // 마지막 '구슬' 연과, 같은 사설이 든 칸 노래의 연
  finalUnit: 5,
  echo: { songId: 'seogyeong-byeolgok', unit: 1 },

  // 조건 카드를 이만큼 내세운 뒤부터 '조건 대신 마음으로 답하기'를 고를 수 있다(조정 가능). 카드를 다 쓰면 그것만 남는다.
  minCardsBeforeFinal: 2,

  speaker: '임',
  text: {
    title: '끝나지 않을 약속',
    intro: '불가능한 조건 카드를 골라 내세우세요. 그 일이 이루어져야만 임과 헤어지겠다는 약속입니다.',
    nimIntro: '헤어지지 않겠다니, 그 약속이 정말 끝나지 않을 수 있소?',
    objection: '그건 될 수도 있지 않소?',
    escalate: '더 불가능한 조건으로 맞서 보세요.',
    allUsed: '「정석가」의 조건 카드를 모두 내세웠어요. 이제 조건이 아닌 것으로 답할 차례입니다.',
    toFinal: '조건 대신 마음으로 답하기',
    nimFinal: '그 일들이 모두 이루어진다면, 그때는 어찌하겠소?',
    finalHead: '마지막 연',
    finalNote: '조건을 쌓던 노래가 마지막 연에서는 끊어지지 않는 끈과 믿음을 노래한다.',
    discover: '이 연, 어디서 본 듯한데…',
    discoverHead: '칸에 꽂힌 「서경별곡」을 펼쳐 같은 연을 찾아보세요.',
    tabSuffix: '연',
    notHere: '이 연에는 구슬이 보이지 않아요. 다른 연을 펼쳐 보세요.',
    found: '찾았다! 「서경별곡」 둘째 연에 같은 사설이 있어요.',
    foundNote: '같은 사설이 두 노래에 함께 들어 있다. 「서경별곡」에서는 줄마다 여음 \'아즐가\'가 끼어들고 후렴이 붙는다.',
    refrainNote: '줄마다 후렴',
    repeated: '두 번',
    finish: '약속을 마친다',
    nimDone: '끈이 끊어지지 않듯, 그 믿음도 끊어지지 않겠구려.',
    slipHead: '내세운 조건',
    towerHead: '쌓인 약속',
    replay: '다시 듣기',
    leftSong: '「정석가」',
    rightSong: '「서경별곡」',
  },
};
