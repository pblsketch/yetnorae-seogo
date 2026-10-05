// 작품 방 「님이 오마 하거늘」(사설시조관, spec 9)에서 새로 쓴 글. 교사 확인 대상이다.
// 노래 글(원문·오늘 소리·풀이)은 여기에 두지 않는다. 방은 노래 데이터(js/data/songs/saseol.js)에서만 가져온다.
// 예측은 채점하지 않는다. 어느 후보를 골라도 그대로 이어지고, 기록에는 고른 후보만 남는다(js/data/README.md 7.3).
export const roomSaseol = {
  songId: 'nimi-oma',
  heading: '작품 방',

  // 처음: 초장을 보여 주며 건네는 말
  intro: '님이 온다는 기별을 받은 화자가 되어 밤길을 달려 봅시다. 중장은 숨 돌릴 틈도 없이 길게 이어집니다.',
  startButton: '달려 나가기',

  // 달리기: 늘어난 중장을 연타로 달린다
  runButton: '달리기',
  runHint: {
    beat: '낭송에 맞춰 「달리기」를 두드리세요. 박을 놓쳐도 길은 이어집니다.',
    noBeat: '「달리기」를 누를 때마다 한 음보씩 달려 나갑니다.',
  },
  runCount: '달린 음보',

  // 멈춤과 예측(반전 바로 앞)
  stopLine: '곁눈으로 흘깃 본 그 순간, 잠깐 멈춥니다.',
  questionTag: '예측',
  question: '무엇을 보게 될까?',
  candidates: [
    { id: 'nim', text: '님', note: '기다리던 바로 그 님' },
    { id: 'other-person', text: '다른 사람', note: '님이 아닌 낯선 누군가' },
    { id: 'jujuri-samdae', text: '주추리 삼대', note: '껍질을 벗겨 세워 둔 삼대 묶음' },
  ],

  // 공개: 고른 예측에 건네는 말(어느 쪽이든 그대로 이어진다)
  myPrediction: '내 예측',
  reactions: {
    nim: '화자도 꼭 그렇게 믿었답니다. 그런데 가까이 가서 보니…',
    'other-person': '누군가 서 있기는 했지요. 그런데 가까이 가서 보니…',
    'jujuri-samdae': '눈치챘군요. 화자는 끝까지 님인 줄만 알았답니다.',
  },
  revealHead: '서 있던 것의 정체',
  nextButton: '종장 보기',

  // 종장: 해학 확인
  finalHead: '종장 — 웃음으로 맺기',
  humorNote: '허둥지둥 달려간 자기 모습을 화자 스스로 웃음거리로 삼습니다. 이렇게 웃음으로 맺는 것이 사설시조의 해학입니다.',
  frameNote: '중장은 한없이 늘어났지만, 종장은 시조처럼 세 글자로 시작해 노래를 맺습니다.',
  finishButton: '방 마치기',

  labels: {
    original: '원문',
    reading: '오늘 소리',
    gloss: '풀이',
    glossSoFar: '여기까지의 풀이',
    firstJang: '초장',
    middleJang: '중장',
    finalJang: '종장',
    scene: '님을 기다리며 달려가는 밤길',
  },
};
