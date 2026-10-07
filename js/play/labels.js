// 한 판 화면에 보이는 짧은 글(버튼 이름, 알림 한 줄, 자리 이름).
// 교사 확인을 받을 글(수첩 설명, 개념 문장, 기념품 글, 가객 이름)은 js/data/의 데이터에서 그대로 가져온다.
// 갈래를 미리 알려 주는 말은 쓰지 않는다. 판단은 학생이 꽂는 자리로 한다(spec 5.5).

export const L = {
  // 위 띠
  notebook: '수첩',
  journal: '일지',
  collection: '도감',
  listen: '다시 듣기',
  leave: '회랑으로',
  close: '닫기',
  hand: '손에 든 노래',
  handEmpty: '손이 비어 있어요',

  // 상황 버튼
  catch: '잡기',
  place: '꽂기',
  look: '살펴보기',
  room: '작품 방 들어가기',
  next: '다음 관으로',
  enter: '들어가기',

  // 자리
  spineEmpty: '빈 책등',
  slot: (i) => '칸 ' + (i + 1),
  floor: (gu) => gu + '구 층',
  bonus: (i) => '덤 칸 ' + (i + 1),
  basket: '바구니',
  basketPlace: (i) => '바구니 ' + (i + 1),
  returned: "돌아온 노래",
  roomDoor: '작품 방',
  nextDoor: '다음 관',
  entrance: '입구',
  fixed: '고정됨',
  remove: '빼기',
  pickTitle: '어느 노래를 꽂을까요?',
  pickBasket: '바구니에 넣을 노래',
  destTitle: (title) => '「' + title + '」을(를) 어느 관으로 보낼까요?',
  basketFull: '바구니가 찼어요. 먼저 하나를 빼세요.',
  nothingInHand: '손에 든 노래가 없어요. 떠도는 노래를 먼저 잡아 재 보세요.',
  waitingTitle: '입구에서 기다리는 노래',
  premeasured: '미리 잰 노래',
  floatingLabel: (title) => '떠도는 노래 「' + title + '」',
  waitingLabel: (title) => '미리 잰 노래 「' + title + '」(연필 표시)',

  // 판정
  popOut: (title) => '「' + title + '」이(가) 모양이 맞지 않아 삐져나왔어요. 손으로 돌아왔어요.',
  popOutBasket: (title) => '「' + title + '」은(는) 그 관으로 갈 노래가 아니었어요. 행선지 표시가 지워졌어요.',
  bound: '세 권이 실로 묶이고 책등에 금박이 찍혔어요. 먹안개가 물러나요.',
  bonusBound: '덤 칸이 묶였어요.',
  roomOpen: '작품 방 문이 열렸어요.',
  sentPrewait: (title, wing) => '「' + title + '」은(는) ' + wing + ' 입구에서 미리 잰 채로 기다려요.',
  sentReturned: (title, wing) => '「' + title + '」은(는) ' + wing + " '돌아온 노래' 선반에 꽂혔어요.",
  helpGlow: '『분류 수첩』의 관련 줄이 반짝여요. 펼쳐 보세요.',

  // 맞대어 보기(판정에서 돌아온 노래를 그 자리와 견주어 본다). 틀렸다는 말이나 기록은 없다
  contrastTitle: (title) => '「' + title + '」 맞대어 보기',
  contrastPrompt: '이 노래의 감정서에서 이 자리와 맞지 않는 줄을 짚어 보자.',
  contrastSheet: '이 노래의 감정서',
  contrastPage: (name) => '『분류 수첩』 ' + name + ' 쪽',
  contrastFloor: (gu) => gu + '구 층',
  floorLine: (gu) => '이 층은 ' + ({ 4: '네', 8: '여덟', 10: '열' }[gu] ?? gu) + ' 덩이로 된 노래의 자리다.',
  contrastFound: '이 줄이 이 자리와 어긋나요. 수첩의 줄과 견주어 보세요.',
  contrastNudge: '살짝 빛나는 줄을 다시 읽어 보세요.',
  contrastBack: '손에 다시 들기',

  // 칸이 묶일 때 그 관의 단위 이름이 드러난다(그 전에는 '덩이'라 부른다)
  unitReveal: {
    hyangga: '이 관의 덩이는 ‘구’라 부른다.',
    goryeo: '이 관의 큰 덩이는 ‘연’, 연 안의 작은 덩이는 ‘줄’이라 부른다.',
    sijo: '이 관의 덩이는 ‘장’이라 부른다.',
    gasa: '이 관의 덩이는 ‘행’이라 부른다.',
    saseol: '이 관의 덩이도 ‘장’이라 부른다.',
  },

  // 가객과 기념품
  singersTitle: '가객이 나타났어요',
  legend: '전해지는 이야기',
  // 가객 이름: 지은이가 전해지는 귀속(singer.traditional)이면 한정해 적는다(「규원가」 허난설헌 등). 이름 자체는 바꾸지 않는다
  traditionalSinger: '전하는 작자: ',
  // 이름 없이 '이름 모를 …'로 전해지는 귀속(「정읍사」 행상인의 아내)은 '작자'가 아니라 전하는 이야기 속 인물로 적는다
  traditionalUnnamed: '전하는 이야기 속 ',
  singerPrefix: (singer) => (!singer?.traditional ? '' : String(singer.name ?? '').startsWith('이름 모를') ? L.traditionalUnnamed : L.traditionalSinger),
  singerName: (singer) => L.singerPrefix(singer) + (singer?.name ?? ''),
  nextSinger: '다음',
  keepsakesTitle: '기념품을 남겼어요',
  keepsakesDone: '도감에 담기',
  kindObject: '노래 속 물건',
  kindMind: '노래 속 마음',

  // 작품 방
  roomLeave: '방에서 나가기',
  roomPlaceholder: '이 작품 방은 아직 준비하고 있어요. 다음에 다시 들어와 주세요.',
  roomTitle: (title) => '작품 방 「' + title + '」',

  // 판의 끝
  leak: (wing) => '문틈으로 ' + wing + '의 소리가 새어 나와요.',
  bonusOpen: '덤 칸이 열렸어요. 다시 와서 덤 노래도 재어 볼 수 있어요.',
  doneWing: '판을 마쳤어요. 덤과 다시 듣기만 할 수 있어요.',

  // 저장 실패(spec 13·20, 이 문장 그대로)
  saveFailed: '이 기기에 저장되지 않아요. 이번 창에서만 이어집니다',

  // 화면들
  notebookTitle: '『분류 수첩』',
  journalTitle: '사서 일지',
  journalConcepts: '연필과 먹',
  journalNone: '아직 확인한 생김새가 없어요.',
  pencil: '연필',
  ink: '먹',
  confirmedBy: '확인해 준 노래: ',
  firstSong: '선대 사서의 첫 노래',
  clues: '이야기 단서',
  cluesNone: '아직 찾은 단서가 없어요.',
  collectionTitle: '도감',
  collectionNone: '아직 모은 기념품이 없어요.',
  listenTitle: '다시 듣기',
  listenNone: '아직 다시 들을 노래가 없어요.',
  play: '듣기',
  stop: '멈추기',
  corridor: '회랑',
};
