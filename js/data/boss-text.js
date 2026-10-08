// 보스전 「서고의 밤」에 보이는 글(spec 10, 11). 교사 확인 대상이다.
// 대사는 새로 쓴 글이다(spec 11 글 쓰는 규칙). 학생을 매기는 말은 쓰지 않는다.
// speaker는 BOSS_SPEAKERS의 열쇠다. 관 이름과 무리 이름은 js/data/wings.js·concepts.js의 것을 그대로 쓴다.

export const BOSS_SPEAKERS = {
  mentor: '선대 사서',
  king: '좀 대왕',
  fog: '먹안개',
};

export const BOSS_TEXT = {
  title: '서고의 밤',
  journal: '일지',
  journalTitle: '사서 일지',
  journalEmpty: '아직 비어 있는 개념',
  journalMarks: { none: '빈칸', pencil: '연필', ink: '먹' },
  close: '닫기',
  leave: '나가기',

  // 다섯 관을 다 마치기 전
  locked: {
    title: '아직 열리지 않은 문',
    body: '서고 깊은 곳의 문은 다섯 관을 모두 마쳐야 열려요.',
    back: '돌아가기',
  },

  // 단계 안내(단계를 시작하거나 이어 할 때)
  stages: {
    stage1: {
      name: '첫째 밤 · 낯선 노래',
      lines: [
        { speaker: 'mentor', text: '들리느냐, 견습 사서야. 먹안개가 처음 보는 노래 다섯 편을 몰고 왔구나.' },
        { speaker: 'mentor', text: '수첩은 안개에 젖어 펼칠 수 없다. 네 일지를 믿고 노래의 형식을 분석해 보아라.' },
        { speaker: 'mentor', text: '분석표로 갈래를 판별하고, 그 노래가 돌아갈 관 자리에 꽂아 주렴.' },
      ],
      go: '시작하기',
    },
    stage2: {
      name: '둘째 밤 · 엉킨 낭송',
      lines: [
        { speaker: 'king', text: '배운 노래쯤이야 한데 섞어 버리면 그만이지!' },
        { speaker: 'mentor', text: '노래들이 엉켜 흘러온다. 갈래가 바뀌는 그 순간을 짚어 다오.' },
      ],
      go: '시작하기',
    },
    stage3: {
      name: '셋째 밤 · 좀 대왕',
      lines: [
        { speaker: 'king', text: '마지막 노래는 내 차지다. 글자 하나 남기지 않고 갉아 먹어 주마.' },
        { speaker: 'mentor', text: '그 노래는 내가 너에게 처음 건넨 노래다. 형식을 다시 분석해 제자리를 찾아 다오.' },
      ],
      go: '맞서기',
    },
  },

  // 1단계
  stage1: {
    unseenLabel: '낯선 노래',
    measure: '형식 분석하기',
    needMeasure: '먼저 노래의 형식을 분석해 보세요. 분석을 마치면 관 자리에 꽂아 갈래를 판별할 수 있어요.',
    // 1단계의 갈래 판별: 분석표를 보고 그 갈래의 관 자리에 꽂는다(꽂는 것이 곧 판별)
    pickSlot: '분석표를 보고 갈래를 판별해, 이 노래가 돌아갈 관 자리에 꽂으세요.',
    wrong: '먹안개가 짙어졌어요. 다른 관 자리를 찾아보세요.',
    help: '일지를 펼쳐 보세요. 반짝이는 개념이 길을 알려 줄 거예요.',
    right: '제자리를 찾았어요.',
    singerQuestion: '누가 불렀을까?',
    singerLead: '이 노래를 즐겨 부른 사람들을 골라 보세요.',
    singerRight: '그 무리가 맞아요.',
    singerOther: '이번에는 다른 무리였어요.',
    answerLead: '이 노래를 부른 무리',
    next: '다음 노래',
    toStage2: '둘째 밤으로',
  },

  // 2단계
  stage2: {
    beatHint: '낭송을 들으며 갈래가 바뀌는 순간에 「바뀌었다」를 누르세요.',
    lineHint: '이어 붙은 글줄을 읽고, 갈래가 바뀌어 시작하는 줄을 누르세요.',
    listen: '낭송 듣기',
    listening: '낭송을 듣는 중',
    tap: '바뀌었다',
    replayNotice: '놓친 곳을 다시 들려줄게요.',
    replay: '놓친 곳 다시 듣기',
    found: '바뀌는 곳을 짚었어요.',
    wrong: '먹안개가 짙어졌어요. 그곳은 갈래가 바뀌는 곳이 아니었어요.',
    help: '일지를 펼쳐 보세요. 반짝이는 개념을 떠올리며 들어 보세요.',
    pointsLabel: '짚은 바뀌는 곳',
    soundOff: '소리를 낼 수 없어 글줄을 읽는 방식으로 바꿨어요.',
    toStage3: '셋째 밤으로',
  },

  // 3단계
  stage3: {
    swallowedLabel: '좀 대왕이 삼킨 노래',
    measure: '다시 분석하기',
    needMeasure: '지워진 노래의 형식을 다시 분석해 보세요.',
    pickSlot: '되찾은 노래가 돌아갈 관 자리를 골라 꽂으세요.',
    wrong: '좀 대왕이 낄낄 웃어요. 먹안개가 짙어졌어요.',
    help: '일지를 펼쳐 보세요. 반짝이는 개념이 보일 거예요.',
    kingScatter: '안 돼, 노래가 다시 불리다니…… 흩어진다!',
    mentorFree: '고맙구나. 네가 노래를 다시 분석해 불러 준 덕에 내가 풀려났다.',
    mentorSeat: '「태산이 높다 하되」가 시조관의 선대 사서 자리에 꽂혔어요.',
  },

  // 보스를 마침
  finale: {
    title: '서고의 밤이 지나갔어요',
    lines: [
      { speaker: 'mentor', text: '먹안개가 걷히는구나. 이제 서고를 끝까지 함께 둘러보자.' },
    ],
    finish: '선대 사서와 함께 나가기',
  },

  // 이미 마친 보스에 다시 들어왔을 때
  already: {
    title: '서고의 밤은 이미 지나갔어요',
    body: '선대 사서는 풀려나 시조관 자리를 지키고 있어요.',
    finish: '돌아가기',
  },
};
