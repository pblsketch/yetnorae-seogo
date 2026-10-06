// 재기 화면에 보이는 짧은 글(버튼 이름, 안내 한 줄, 감정서 문구).
// 갈래를 알려 주는 말(갈래 이름)은 쓰지 않는다. 판단은 학생이 꽂는 자리로 한다(spec 5.5).

export const LAYERS = ['original', 'reading', 'gloss'];
// 박에 들지 않는 음보의 이름표(두루마리에 늘 보인다). 낭송은 하지만 장구를 치지 않고 빗금도 긋지 않는다.
export const MARK_NAMES = { yeoeum: '여음', refrain: '후렴', repeat: '되풀이' };
export const LAYER_NAMES = { original: '원문', reading: '오늘 소리', gloss: '풀이' };

export const L = {
  title: '재기',
  prev: '앞 쪽',
  next: '뒤 쪽',
  book: '수첩',
  bookTitle: '『분류 수첩』',
  journal: '일지',
  journalTitle: '사서 일지',
  close: '닫기',
  glossPaused: '풀이를 보는 중이에요. 두루마리 막대를 누르면 원문으로 돌아가요.',
  // 접기
  foldHint: '글줄이 이어져 있어요. 노래가 끊어지는 틈을 찾아 눌러 접어 보세요.',
  foldNone: '접을 곳이 없다',
  foldDone: '다 접었어요.',
  // 두드리기·빗금
  tapHint: '낭송을 들으며 소리 마디가 울릴 때마다 장구를 치세요.',
  tapHintOffbeat: '소리 마디가 울릴 때마다 장구를 치세요. 여음·후렴·되풀이 표시가 붙은 곳은 치지 않아요.',
  // 보스에서는 갈래가 드러나지 않게 이름표 없이 점선 테두리만 보인다. 그때의 안내
  tapHintPlain: '소리 마디가 울릴 때마다 장구를 치세요. 점선으로 묶인 곳은 치지 않아요.',
  listen: '낭송 듣기',
  drum: '장구',
  replay: '놓친 박이 있어요. 그 줄을 다시 들어요.',
  listenOnly: '후렴 줄이에요. 장구는 쉬고 들어 보세요.',
  listenOnlyPlain: '여기는 장구를 쉬고 들어 보세요.',
  slashHint: '마디가 끝나는 말 뒤를 눌러 빗금을 그으세요. 서두르지 않아도 돼요.',
  slashOffbeatHint: '마디가 끝나는 말 뒤를 눌러 빗금을 그으세요. 여음·후렴·되풀이 표시가 붙은 곳은 이미 나뉘어 있어요.',
  slashPlainHint: '마디가 끝나는 말 뒤를 눌러 빗금을 그으세요. 점선으로 묶인 곳은 이미 나뉘어 있어요.',
  suggest: '박이 잘 안 맞나요? 빗금으로 재도 같은 증거가 모여요.',
  suggestYes: '빗금으로 할래요',
  suggestNo: '계속 칠래요',
  noSound: '소리를 낼 수 없어 빗금으로 재요.',
  tapDone: '다 쟀어요.',
  // 보스 도구
  toolsHint: '쓸 도구를 고르세요. 여러 번 골라도 돼요.',
  finishBoss: '다 쟀다',
  finish: '감정서 받기',
  preMeasured: '미리 잰 노래예요. 감정서가 채워져 있어요.',
  sheetTitle: '감정서',
  // 감정서 줄: 박에 들지 않는 여음·후렴이 있다. 후렴 고리 걸기(고려가요관의 고유 동작)로 되풀이 구절을 찾았을 때만 적는다
  sheetRefrains: '[여음·후렴이 있다]',
  // 감정서 줄: 걷기. 걸음 수에 따라 셋 가운데 하나
  sheetWalk: {
    before: '세 걸음이 되기 전에 멈춘다',
    at: '세 걸음에서 멈춘다',
    beyond: '세 걸음에서 멈추지 않고 이어진다',
  },
  showScroll: '두루마리 보기',
  showSheet: '감정서 보기',
  // 첫 사용 안내
  introOk: '해 볼게요',
  intro: {
    fold: '이어진 글줄에서 노래가 끊어지는 틈을 눌러 접어요.',
    tap: '낭송을 들으며 소리 마디마다 장구를 쳐요. 빗금 모드에서는 마디 끝 말을 눌러요.',
    unique: '이 관의 도구예요. 손가락이 가리키는 곳부터 해 보세요.',
  },
};

// 고유 동작 화면 글
export const ACTION_TEXT = {
  'aa-door': {
    name: "'아아' 문 열기",
    hint: '노래 끝 무리의 첫머리를 눌러 문을 두드려 보세요.',
    open: '문이 열렸어요. 첫머리에 감탄사가 있어요.',
    shut: '문이 열리지 않아요. 첫머리에 감탄사가 없어요.',
  },
  'refrain-link': {
    name: '후렴 고리 걸기',
    hint: '되풀이되는 구절을 눌러 고리로 이어 보세요.',
    none: '되풀이되는 구절이 없다',
    done: '되풀이되는 구절을 모두 이었어요.',
    noneDone: '고리를 걸 구절이 없어요.',
  },
  stairs: {
    name: '계단 오르기',
    hint: '종장 첫 음보를 글자마다 눌러 계단을 오르세요.',
    absent: '종장이 없어 계단이 놓이지 않아요.',
    ok: '확인',
    done: '계단을 다 올랐어요.',
  },
  walk: {
    name: '걷기',
    hint: '한 걸음씩 걸어 보세요. 노래가 이어지는 동안 회랑이 이어져요.',
    step: '한 걸음',
    walking: '걷는 중',
    stop: '노래가 끝나 걸음이 멈췄어요.',
  },
  'rapid-unroll': {
    name: '연타로 풀기',
    hint: '가운데를 여러 번 두드려 두루마리를 풀어 보세요.',
    tap: '두드려 풀기',
    absent: '가운데 장을 찾을 수 없어요.',
    ok: '확인',
    done: '가운데가 다 풀렸어요.',
    count: (n) => '풀린 음보 ' + n,
  },
};

// 고유어 수(관형형). 열 넘으면 숫자로 쓴다.
const NATIVE = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
export function count(n, unit) {
  if (n >= 1 && n <= 10) return NATIVE[n] + ' ' + unit;
  return n + unit;
}
