// 노래 표(spec 4.2)와 길 잃은 노래의 행선지 규칙(spec 4.3)을 기계가 읽을 수 있게 옮긴 기준 데이터.
// 노래 데이터(js/data/songs/<갈래>.js)는 이 표와 정확히 일치해야 하고, tests/check-data.mjs가 확인한다.
// 노래 id는 여기서 정한 것만 쓴다. 형식의 기준은 js/data/README.md의 '노래 id 목록'·'노래 표' 절이다.

// 노래 목록: id → 제목(「」 없이), 갈래, 발췌 표시.
// title이 null인 노래는 출제 원문을 확인한 뒤 고르는 노래다(pendingSelection). 고른 노래의 제목을 데이터에 쓴다.
export const SONG_CATALOG = {
  // 입구
  'taesan': { title: '태산이 높다 하되', genre: 'sijo' },
  // 향가
  'seodongyo': { title: '서동요', genre: 'hyangga' },
  'cheoyongga': { title: '처용가', genre: 'hyangga' },
  'chan-giparangga': { title: '찬기파랑가', genre: 'hyangga' },
  'jemangmaega': { title: '제망매가', genre: 'hyangga' },
  'heonhwaga': { title: '헌화가', genre: 'hyangga' },
  'mojukjirangga': { title: '모죽지랑가', genre: 'hyangga' },
  'anminga': { title: '안민가', genre: 'hyangga' },
  'wonwangsaengga': { title: '원왕생가', genre: 'hyangga' },
  // 고려가요
  'cheongsan-byeolgok': { title: '청산별곡', genre: 'goryeo' },
  'seogyeong-byeolgok': { title: '서경별곡', genre: 'goryeo' },
  'gasiri': { title: '가시리', genre: 'goryeo' },
  'jeongseokga': { title: '정석가', genre: 'goryeo' },
  'dongdong': { title: '동동', genre: 'goryeo', excerpt: '두 달치' },
  'sangjeoga': { title: '상저가', genre: 'goryeo' },
  'jeongeupsa': { title: '정읍사', genre: 'goryeo' },
  'samogok': { title: '사모곡', genre: 'goryeo' },
  // 시조
  'cheongsanri-byeokgyesu': { title: '청산리 벽계수야', genre: 'sijo' },
  'dongjitdal': { title: '동짓달 기나긴 밤을', genre: 'sijo' },
  'ireondeul': { title: '이런들 어떠하며', genre: 'sijo' },
  'imomi-jukgo': { title: '이 몸이 죽고 죽어', genre: 'sijo' },
  'simnyeon-gyeongyeong': { title: '십 년을 경영하야', genre: 'sijo' }, // 제목은 교과서 표기를 따른다
  'ihwa-wolbaek': { title: '이화에 월백하고', genre: 'sijo' },
  'hanson-makdae': { title: '한 손에 막대 잡고', genre: 'sijo' },
  'sakpung': { title: '삭풍은 나무 끝을 불고', genre: 'sijo' },
  'obaengnyeon-doeupji': { title: '오백 년 도읍지를', genre: 'sijo' },
  'eojeo-nae-iriyeo': { title: '어져 내 일이여', genre: 'sijo' },
  'sinheum-sijo': { title: null, genre: 'sijo', pendingSelection: '신흠의 시조 한 수(2021학년도 수능 출제작). 출제 원문을 확인한 뒤 고른다' },
  // 가사
  'myeonangjeongga': { title: '면앙정가', genre: 'gasa', excerpt: '첫 대목' },
  'gwandong-byeolgok': { title: '관동별곡', genre: 'gasa', excerpt: '첫 대목' },
  'gyuwonga': { title: '규원가', genre: 'gasa' },
  'sangchungok': { title: '상춘곡', genre: 'gasa' },
  'samiingok': { title: '사미인곡', genre: 'gasa', excerpt: '첫 대목' },
  'seonsangtan': { title: '선상탄', genre: 'gasa' },
  'songmiingok': { title: '속미인곡', genre: 'gasa', excerpt: '첫 대목' },
  'nuhangsa': { title: '누항사', genre: 'gasa', excerpt: '한 대목' },
  'gapminga': { title: '갑민가', genre: 'gasa', excerpt: '한 대목' },
  // 사설시조
  'chang-naegoja': { title: '창 내고쟈', genre: 'saseol' },
  'namodo-bahi': { title: '나모도 바히 돌도', genre: 'saseol' },
  'daekdeul-dongnanji': { title: '댁들에 동난지이 사오', genre: 'saseol' },
  'nimi-oma': { title: '님이 오마 하거늘', genre: 'saseol' },
  'gwitturami': { title: '귀뚜라미 저 귀뚜라미', genre: 'saseol' },
  'nonbat-gara': { title: '논밭 갈아 김매고', genre: 'saseol' },
  'hansuma': { title: '한숨아 세한숨아', genre: 'saseol' },
  'suneung-saseol': { title: null, genre: 'saseol', pendingSelection: '2025·2026학년도 수능 출제 사설시조 가운데 한 편. 출제 원문을 확인한 뒤 고른다' },
};

// 입구 튜토리얼 노래(역할 tutorial, 자리 entrance).
export const TUTORIAL_SONG_ID = 'taesan';

// 관마다 칸·길 잃은 노래·작품 방·덤(spec 4.2).
// shelf는 칸 노래 셋. 향가관은 shelfFloors가 같은 순서의 층(구 수)이다.
// stray의 to는 도착할 관 id다.
export const WING_TABLE = {
  hyangga: {
    shelf: ['seodongyo', 'cheoyongga', 'chan-giparangga'],
    shelfFloors: [4, 8, 10],
    stray: [
      { songId: 'gasiri', to: 'goryeo' },
      { songId: 'cheongsanri-byeokgyesu', to: 'sijo' },
    ],
    room: 'jemangmaega',
    bonus: ['heonhwaga', 'mojukjirangga', 'anminga'],
  },
  goryeo: {
    shelf: ['cheongsan-byeolgok', 'seogyeong-byeolgok', 'gasiri'],
    stray: [
      { songId: 'dongjitdal', to: 'sijo' },
      { songId: 'myeonangjeongga', to: 'gasa' },
    ],
    room: 'jeongseokga',
    bonus: ['dongdong', 'sangjeoga', 'jeongeupsa'],
  },
  sijo: {
    shelf: ['dongjitdal', 'ireondeul', 'imomi-jukgo'],
    stray: [
      { songId: 'chang-naegoja', to: 'saseol' },
      { songId: 'gwandong-byeolgok', to: 'gasa' },
    ],
    room: 'simnyeon-gyeongyeong',
    bonus: ['ihwa-wolbaek', 'hanson-makdae', 'sakpung'],
  },
  gasa: {
    shelf: ['myeonangjeongga', 'gwandong-byeolgok', 'gyuwonga'],
    stray: [
      { songId: 'daekdeul-dongnanji', to: 'saseol' },
      { songId: 'obaengnyeon-doeupji', to: 'sijo' },
    ],
    room: 'sangchungok',
    bonus: ['samiingok', 'seonsangtan', 'songmiingok'],
  },
  saseol: {
    shelf: ['namodo-bahi', 'daekdeul-dongnanji', 'chang-naegoja'],
    stray: [
      { songId: 'nuhangsa', to: 'gasa' },
      { songId: 'eojeo-nae-iriyeo', to: 'sijo' },
    ],
    room: 'nimi-oma',
    bonus: ['gwitturami', 'nonbat-gara', 'hansuma'],
  },
};

// 보스전(spec 10.2). unseen은 갈래 → 낯선 노래 id.
// unseenOrder는 1단계에서 나오는 갈래 순서의 기본값(조정 가능). 시조와 사설시조가 마지막 짝인 것은 고정이다.
// stage3SongId는 3단계에서 좀 대왕이 삼키고 있는 노래(튜토리얼 노래)다.
export const BOSS_TABLE = {
  unseen: {
    hyangga: 'wonwangsaengga',
    goryeo: 'samogok',
    sijo: 'sinheum-sijo',
    gasa: 'gapminga',
    saseol: 'suneung-saseol',
  },
  unseenOrder: ['gasa', 'hyangga', 'goryeo', 'sijo', 'saseol'],
  stage3SongId: 'taesan',
};

// 행선지 규칙(spec 4.3)을 노래 표에 적용한 결과. 관 id → 노래 id 목록.
// prewait: 그 관 입구에서 미리 잰 상태로 기다리는 노래. returned: 그 관 '돌아온 노래' 선반에 꽂히는 노래.
// 검증기가 규칙으로 다시 계산해 이 목록과 맞는지 확인한다.
export const ROUTING = {
  prewait: {
    goryeo: ['gasiri'],
    sijo: ['dongjitdal'],
    gasa: ['myeonangjeongga', 'gwandong-byeolgok'],
    saseol: ['chang-naegoja', 'daekdeul-dongnanji'],
  },
  returned: {
    sijo: ['cheongsanri-byeokgyesu', 'obaengnyeon-doeupji', 'eojeo-nae-iriyeo'],
    gasa: ['nuhangsa'],
  },
};

// 검증기와 엔진이 한 덩어리로 받는 표.
export const SONG_TABLE = {
  catalog: SONG_CATALOG,
  tutorial: TUTORIAL_SONG_ID,
  wings: WING_TABLE,
  boss: BOSS_TABLE,
  routing: ROUTING,
};
