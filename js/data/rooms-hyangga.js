// 작품 방 「제망매가」(향가관, spec 9)에서 쓰는 글. 교사 확인 대상이다.
// 노래 글(향찰·해독문)은 여기에 다시 적지 않는다. 방은 노래 데이터(js/data/songs/hyangga.js)의 글만 화면에 보인다.
// 해석 고르기는 채점하지 않는다. 고른 해석은 결과 카드와 기록에 '해석'으로 남는다(js/data/README.md 7.3).

export const roomText = {
  title: '「제망매가」의 방',
  intro: '바람 부는 가지에서 잎이 떨어진다. 낭송을 들으며 떨어지는 잎을 붙잡아 보자.',
  start: '가지 아래로 가기',

  // 앞 여덟 구: 잎 붙잡기
  catchHint: '떨어지는 잎을 눌러 붙잡아 보자.',
  catchAction: '잎 잡기',
  catchLeaf: '떨어지는 잎',
  scattered: [
    '잡았는데, 손안에서 흩어져 버렸다.',
    '이번에도 손가락 사이로 흩어졌다.',
    '움켜쥐어도 남는 것이 없다.',
    '붙잡을 수가 없다. 잎은 바람을 따라간다.',
  ],
  waitRecite: '낭송이 끝나면 다음 구로 넘어간다.',

  // 9구 '아아'부터: 길 닦기
  turn: '잡으려던 손을 거두고, 미타찰로 가는 길을 닦아 보자.',
  sweepHint: '길에 쌓인 잎을 눌러 쓸어 내자.',
  sweepAction: '길 닦기',
  pile: '길에 쌓인 잎',
  pileLater: '아직 닿지 않은 길',
  swept: '길이 한 걸음 트였다.',
  pathClear: '미타찰로 가는 길이 트였다.',
  destination: '미타찰',

  // 끝의 물음(spec 9 문구 그대로)
  interpretationLabel: '해석',
  question: '마지막은 슬픔을 이겨 낸 것일까, 견디겠다는 다짐일까?',
  questionNote: '정해진 답은 없다. 내 생각에 가장 가까운 것을 골라 보자.',
  confirm: '이 해석으로 남기기',

  guLabel: (n) => n + '구',
  progressLabel: '낭송한 구',
};

// 해석 후보. id는 기록의 interpretationId로 저장된다(바꾸면 옛 기록의 id와 어긋나므로 글만 고친다).
export const interpretations = [
  {
    id: 'overcome',
    text: '슬픔을 이겨 낸 것이다. 미타찰에서 다시 만나리라 믿으며 마음을 추슬렀다.',
  },
  {
    id: 'endure',
    text: '견디겠다는 다짐이다. 슬픔은 그대로 남았지만 도를 닦으며 기다리겠다고 마음먹었다.',
  },
  {
    id: 'both',
    text: '둘 다이다. 슬픔을 품은 채로 그 너머를 바라보려 한다.',
  },
];

// 조정할 수 있는 값(spec 22)
export const roomTuning = {
  pileCount: 4,          // 미타찰로 가는 길에 쌓인 잎 무더기 수
  leafCount: 4,          // 한꺼번에 떨어지는 잎 수
  fallSeconds: 7,        // 잎이 가지에서 땅까지 떨어지는 시간(초)
  afterCatchMs: 700,     // 잎이 흩어진 뒤 다음 구로 넘어가기까지
  afterSweepMs: 350,
  beforeQuestionMs: 900, // 길이 트인 뒤 물음이 나오기까지
};
