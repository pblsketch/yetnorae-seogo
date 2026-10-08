// 한 판 화면에 보이는 짧은 글(버튼 이름, 알림 한 줄, 자리 이름).
// 교사 확인을 받을 글(수첩 설명, 개념 문장, 기념품 글, 가객 이름)은 js/data/의 데이터에서 그대로 가져온다.
// 갈래를 미리 알려 주는 말은 쓰지 않는다. 판단은 학생이 형식 분석의 ④ 갈래 판별에서 한다(교사 결정 2026-10-08).
import { UNIT_TERMS } from '../measure/labels.js';

export const L = {
  // 위 띠
  notebook: '수첩',
  journal: '일지',
  collection: '도감',
  listen: '다시 듣기',
  leave: '회랑으로',
  close: '닫기',
  // 손에 든 노래 = 갈래 판별을 마친 노래(판별 전의 노래는 관 안을 떠도는 '뒤섞인 노래')
  hand: '판별한 노래',
  handEmpty: '아직 판별한 노래가 없어요.',
  mixedLeft: (n) => '뒤섞인 노래 ' + n + '편이 남았어요. 잡아서 형식을 분석하고 갈래를 판별하세요.',
  // 관에 들어올 때마다(판을 마치기 전) 알리는 전제(교사 결정 2026-10-08)
  premise: (wing) => '먹안개가 다섯 관을 휘저어 노래들이 뒤섞였어요. ' + wing + '에도 다른 관의 노래가 섞여 있어요. 노래마다 형식을 분석하고 갈래를 판별한 뒤 제자리로 보내세요.',

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
  // 바구니: 다른 관의 노래로 판별한 노래가 저절로 담기고 행선지도 정해진다(학생이 고르지 않는다)
  basketAuto: '다른 관의 노래로 판별한 노래가 여기에 담기고, 그 갈래의 관이 행선지가 돼요. 두 자리가 차면 보내요.',
  basketReady: '보낼 준비',
  nothingInHand: '판별한 노래가 없어요. 뒤섞인 노래를 잡아 형식을 분석하고 갈래를 판별하세요.',
  waitingTitle: '입구에서 기다리는 노래',
  premeasured: '미리 분석한 노래',
  floatingLabel: (title) => '뒤섞인 노래 「' + title + '」',
  // 판을 마친 관에서 떠다니는 덤 노래(모두 그 관 갈래라 '뒤섞인 노래'가 아니다)
  bonusSongLabel: (title) => '덤 노래 「' + title + '」',
  waitingLabel: (title) => '미리 분석한 노래 「' + title + '」(연필 표시)',

  // 갈래 판별(형식 분석의 ④)이 맞았을 때 분석 화면의 확인 글에 덧붙이는 한 줄과 알림
  decidedOwn: (wing) => wing + '의 노래예요. 손에 들고 칸에 꽂으세요.',
  decidedTower: '향가관의 노래예요. 손에 들고 탑의 알맞은 층에 꽂으세요.',
  decidedBonus: (wing) => wing + '의 노래예요. 손에 들고 덤 칸에 꽂으세요.',
  decidedStray: (wing) => '다른 관의 노래예요. 바구니에 담아 ' + wing + '으로 보내요.',
  toBasket: (title, wing) => '「' + title + '」을(를) ' + wing + '으로 보낼 바구니에 담았어요.',

  // 판정
  popOut: (title) => '「' + title + '」이(가) 모양이 맞지 않아 삐져나왔어요. 손으로 돌아왔어요.',
  popOutBasket: (title) => '「' + title + '」은(는) 그 관으로 갈 노래가 아니었어요. 손으로 돌아왔어요.',
  bound: '세 권이 실로 묶이고 책등에 금박이 찍혔어요. 먹안개가 물러나요.',
  bonusBound: '덤 칸이 묶였어요.',
  roomOpen: '작품 방 문이 열렸어요.',
  sentPrewait: (title, wing) => '「' + title + '」은(는) ' + wing + ' 입구에서 미리 분석한 채로 기다려요.',
  sentReturned: (title, wing) => '「' + title + '」은(는) ' + wing + " '돌아온 노래' 선반에 꽂혔어요.",
  helpGlow: '『분류 수첩』의 관련 줄이 반짝여요. 펼쳐 보세요.',

  // 맞대어 보기(틀린 갈래 판별 뒤, 그리고 탑의 층이 틀린 노래). 틀렸다는 말이나 기록은 없다
  contrastTitle: (title) => '「' + title + '」 맞대어 보기',
  contrastPrompt: '이 노래의 분석표에서 이 자리와 맞지 않는 줄을 짚어 보자.',
  // 갈래 판별에서 고른 갈래와 견줄 때(name: 고른 갈래 이름)
  contrastPromptGenre: (name) => '이 노래의 분석표에서 『분류 수첩』 ' + name + ' 쪽과 맞지 않는 줄을 짚어 보자.',
  // 짚을 줄이 없을 때: 분석표와 고른 갈래 쪽을 나란히 보인다(짝짓기 없음)
  contrastNoPair: (name) => '분석표를 『분류 수첩』 ' + name + ' 쪽과 나란히 견주어 보고 다시 판별해 보자.',
  contrastSheet: '이 노래의 분석표',
  contrastPage: (name) => '『분류 수첩』 ' + name + ' 쪽',
  contrastFloor: (gu) => gu + '구 층',
  // unit: 판별 전이면 '부분', 판별을 마친 향가면 '구'
  floorLine: (gu, unit = '구') => '이 층은 ' + ({ 4: '네', 8: '여덟', 10: '열' }[gu] ?? gu) + ' ' + unit + (unit === '구' ? '로' : '으로') + ' 된 노래의 자리다.',
  contrastFound: '이 줄이 이 자리와 어긋나요. 수첩의 줄과 견주어 보세요.',
  contrastFoundGenre: '이 줄이 고른 갈래와 어긋나요. 수첩의 줄과 견주어 보세요.',
  contrastNudge: '살짝 빛나는 줄을 다시 읽어 보세요.',
  contrastBack: '손에 다시 들기',
  contrastRetry: '다시 판별하기',

  // 칸이 묶일 때 첫 가객 카드 위에 그 관의 단위 이름을 한 번 더 보인다(갈래 판별에서 맞힐 때 처음 드러난다)
  unitReveal: UNIT_TERMS,

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
  bonusOpen: '덤 칸이 열렸어요. 다시 와서 덤 노래도 분석해 볼 수 있어요.',
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
