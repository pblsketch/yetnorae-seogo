// 검증기 시험용 '올바른' 가짜 데이터 묶음.
// ⚠ 여기 글은 모두 지어낸 시험용 글자다. 실제 노래가 아니며 게임 데이터로 쓰지 않는다.
// 표(table)도 시험용 작은 표다. 실제 노래 표(js/data/song-table.js)와 모양은 같지만 노래 수가 적다.
// makeValidSet()은 부를 때마다 새 객체를 돌려주므로, 음성 사례가 마음대로 고쳐도 된다.

const ft = (text) => ({ original: text, reading: text });

// 시조·사설시조 장, 가사 행: 음보 글자 목록과 풀이
const unit = (feet, gloss) => ({ feet: feet.map(ft), gloss });

// 고려가요 연: 줄마다 음보 목록과 풀이
const stanza = (lines) => ({ lines: lines.map(([feet, gloss]) => ({ feet: feet.map(ft), gloss })) });

// 향가 구
const gu = (n, reading) => ({
  original: '試驗' + n,
  decipherment: reading ?? '시험 구 ' + n,
  reading: reading ?? '시험 구 ' + n,
  gloss: '시험용 풀이 ' + n,
});

const common = (id, title, genre) => ({
  id,
  title,
  genre,
  sourceType: 'old-text',
  citation: '시험용 출처 문구',
  verification: 'pending',
  legend: false,
});

const keep = (name, word, phrase) => ({ name, word, phrase, classLine: '시험용 향유층 한 줄' });

function hyangga(id, title, count, roles, { exclaim = false } = {}) {
  const units = [];
  for (let i = 1; i <= count; i++) units.push(gu(i, exclaim && i === 9 ? '아아 시험 구 9' : undefined));
  units[0].reading = '시험 거울 하나';
  units[0].decipherment = '시험 거울 하나';
  units[0].gloss = '시험 거울 하나의 풀이';
  const features = {};
  const evidences = ['hyangga-lines'];
  if (count === 10) {
    features.grouping = [4, 4, 2];
    evidences.push('hyangga-442');
    if (exclaim) {
      features.exclamation = { unit: 8, text: '아아' };
      evidences.push('hyangga-exclaim');
    }
  }
  return {
    ...common(id, title, 'hyangga'),
    singer: { name: '이름 모를 승려', class: '승려' },
    decipherment: { scholar: '시험 학자', book: '시험용 해독서' },
    units,
    features,
    evidences,
    keepsake: keep('거울', '거울', '시험 거울 하나'),
    roles,
  };
}

function goryeo(id, title, roles) {
  const st = (n) => stanza([
    [['해금 켜는', '시험', '줄이로다'], '시험 연 ' + n + ' 첫 줄'],
    [['차카타', '파하가', '나다라'], '시험 연 ' + n + ' 둘째 줄'],
    [['다로', '다로', '다로리'], '뜻 없는 소리'],
  ]);
  return {
    ...common(id, title, 'goryeo'),
    singer: { name: '이름 모를 고려 백성', class: '고려 백성' },
    units: [st(1), st(2)],
    features: {
      refrains: [
        {
          kind: 'yeoeum',
          text: '다로 다로 다로리',
          ranges: [{ unit: 0, line: 2, from: 0, to: 2 }, { unit: 1, line: 2, from: 0, to: 2 }],
        },
      ],
    },
    evidences: ['goryeo-stanza', 'goryeo-refrain', 'goryeo-3beat'],
    keepsake: keep('해금', '해금', '해금 켜는 시험 줄'),
    roles,
  };
}

function sijo(id, title, roles) {
  return {
    ...common(id, title, 'sijo'),
    singer: { name: '시험 사대부', class: '사대부' },
    units: [
      unit(['가나다', '라마바사', '부채 들고', '아자차'], '시험 초장 풀이'),
      unit(['카타파', '하가나다', '라마바', '사아자차'], '시험 중장 풀이'),
      unit(['어즈버', '가나다라마', '바사아', '자차카'], '시험 종장 풀이'),
    ],
    features: { finalFirstFoot: { syllables: 3 } },
    evidences: ['sijo-3jang', 'sijo-4beat', 'sijo-final3'],
    keepsake: keep('부채', '부채', '부채 들고'),
    roles,
  };
}

function gasa(id, title, roles, extra = {}) {
  return {
    ...common(id, title, 'gasa'),
    singer: { name: '시험 사대부', class: '사대부' },
    units: [
      unit(['가나다', '라마바', '사아자', '차카타'], '시험 행 1'),
      unit(['파하가', '나다라', '마바사', '아자차'], '시험 행 2'),
      unit(['카타파', '하가나', '다라마', '지팡이를'], '시험 행 3'),
      unit(['바사아', '자차카', '타파하', '가나다'], '시험 행 4'),
    ],
    features: {},
    evidences: ['gasa-4beat', 'gasa-nolimit'],
    keepsake: keep('지팡이', '지팡이', '다라마 지팡이를'),
    roles,
    ...extra,
  };
}

function saseol(id, title, roles) {
  return {
    ...common(id, title, 'saseol'),
    singer: { name: '이름 모를 가객', class: '가객' },
    units: [
      unit(['가나다', '라마바', '광주리를', '차카타'], '시험 초장 풀이'),
      unit(['파하가', '나다라', '마바사', '아자차', '카타파', '하가나', '사아자'], '시험 중장 풀이, 길게 늘어남'),
      unit(['두어라', '가나다라', '마바사', '아자'], '시험 종장 풀이'),
    ],
    features: { finalFirstFoot: { syllables: 3 }, stretched: [1] },
    evidences: ['saseol-middle', 'saseol-frame'],
    keepsake: keep('광주리', '광주리', '광주리를'),
    roles,
  };
}

export function makeValidSet() {
  const table = {
    catalog: {
      'fx-sijo-a': { title: '시험 시조 가', genre: 'sijo' },
      'fx-sijo-b': { title: '시험 시조 나', genre: 'sijo' },
      'fx-sijo-c': { title: '시험 시조 다', genre: 'sijo' },
      'fx-hy-4': { title: '시험 향가 넷', genre: 'hyangga' },
      'fx-hy-8': { title: '시험 향가 여덟', genre: 'hyangga' },
      'fx-hy-10': { title: '시험 향가 열', genre: 'hyangga' },
      'fx-hy-10b': { title: '시험 향가 열 둘째', genre: 'hyangga' },
      'fx-go-a': { title: '시험 고려가요 가', genre: 'goryeo' },
      'fx-go-b': { title: '시험 고려가요 나', genre: 'goryeo' },
      'fx-gs-a': { title: '시험 가사 가', genre: 'gasa', excerpt: '첫 대목' },
      'fx-gs-b': { title: '시험 가사 나', genre: 'gasa' },
      'fx-boss-gs': { title: '시험 가사 낯선', genre: 'gasa' },
      'fx-ss-a': { title: '시험 사설시조 가', genre: 'saseol' },
      'fx-ss-b': { title: '시험 사설시조 나', genre: 'saseol' },
    },
    tutorial: 'fx-sijo-a',
    wings: {
      hyangga: {
        shelf: ['fx-hy-4', 'fx-hy-8', 'fx-hy-10'],
        shelfFloors: [4, 8, 10],
        stray: [{ songId: 'fx-go-b', to: 'goryeo' }],
        room: 'fx-hy-10b',
        bonus: [],
      },
      goryeo: { shelf: ['fx-go-a', 'fx-go-b'], stray: [], room: null, bonus: [] },
      sijo: { shelf: ['fx-sijo-b'], stray: [{ songId: 'fx-ss-b', to: 'saseol' }], room: null, bonus: ['fx-sijo-c'] },
      gasa: { shelf: ['fx-gs-a', 'fx-gs-b'], stray: [], room: null, bonus: [] },
      saseol: { shelf: ['fx-ss-a', 'fx-ss-b'], stray: [], room: null, bonus: [] },
    },
    boss: { unseen: { gasa: 'fx-boss-gs' }, unseenOrder: ['gasa'], stage3SongId: 'fx-sijo-a' },
    routing: {
      prewait: { goryeo: ['fx-go-b'], saseol: ['fx-ss-b'] },
      returned: {},
    },
  };

  const songs = [
    sijo('fx-sijo-a', '시험 시조 가', [{ wing: 'entrance', role: 'tutorial' }]),
    sijo('fx-sijo-b', '시험 시조 나', [{ wing: 'sijo', role: 'shelf' }]),
    sijo('fx-sijo-c', '시험 시조 다', [{ wing: 'sijo', role: 'bonus' }]),
    hyangga('fx-hy-4', '시험 향가 넷', 4, [{ wing: 'hyangga', role: 'shelf' }]),
    hyangga('fx-hy-8', '시험 향가 여덟', 8, [{ wing: 'hyangga', role: 'shelf' }]),
    hyangga('fx-hy-10', '시험 향가 열', 10, [{ wing: 'hyangga', role: 'shelf' }], { exclaim: true }),
    hyangga('fx-hy-10b', '시험 향가 열 둘째', 10, [{ wing: 'hyangga', role: 'room' }], { exclaim: true }),
    goryeo('fx-go-a', '시험 고려가요 가', [{ wing: 'goryeo', role: 'shelf' }]),
    goryeo('fx-go-b', '시험 고려가요 나', [{ wing: 'hyangga', role: 'stray', to: 'goryeo' }, { wing: 'goryeo', role: 'shelf' }]),
    gasa('fx-gs-a', '시험 가사 가', [{ wing: 'gasa', role: 'shelf' }], { excerpt: '첫 대목' }),
    gasa('fx-gs-b', '시험 가사 나', [{ wing: 'gasa', role: 'shelf' }]),
    gasa('fx-boss-gs', '시험 가사 낯선', [{ wing: 'boss', role: 'unseen' }], { singerGroups: ['literati-women'] }),
    saseol('fx-ss-a', '시험 사설시조 가', [{ wing: 'saseol', role: 'shelf' }]),
    saseol('fx-ss-b', '시험 사설시조 나', [{ wing: 'sijo', role: 'stray', to: 'saseol' }, { wing: 'saseol', role: 'shelf' }]),
  ];

  // 추가 제안(F1)의 올바른 모양
  // - '노래 속 마음' 카드: keepsake.kind 'mind'. 낱말·구절 규칙은 물건 카드와 같다
  // - 교과서 밖 원문 이어 붙이기: 교과서 노래 끝에 beyondTextbook 행을 붙이고, 노래는 확인 대기(pending)
  const byId = (id) => songs.find((s) => s.id === id);
  byId('fx-sijo-c').keepsake.kind = 'mind';
  byId('fx-sijo-b').keepsake.kind = 'object';
  const gsB = byId('fx-gs-b');
  gsB.sourceType = 'textbook-common2';
  gsB.citationNote = '시험용: 1~4행은 교과서 수록본, 5행은 교과서 밖 원문(확인 대기)';
  gsB.units.push({ ...unit(['가가가', '나나나', '다다다', '라라라'], '시험 행 5'), beyondTextbook: true, sourceNote: '시험용 옛 문헌 출처' });

  const remix = {
    fragments: [
      { genre: 'hyangga', songId: 'fx-hy-4', from: 0, to: 1 },
      { genre: 'goryeo', songId: 'fx-go-a', from: 0, to: 0 },
      { genre: 'sijo', songId: 'fx-sijo-b', from: 0, to: 0 },
      { genre: 'gasa', songId: 'fx-gs-a', from: 0, to: 1 },
      { genre: 'saseol', songId: 'fx-ss-a', from: 1, to: 1 },
    ],
  };

  const notebook = {
    sijo: {
      genre: 'sijo',
      name: '시조',
      body: ['시험용 수첩 설명 문단.'],
      lines: [{ id: 'sijo-shape', conceptIds: ['sijo-3jang', 'sijo-4beat'], text: '시험용 수첩 줄' }],
    },
  };

  return { table, songs, remix, notebook };
}

export const fx = (set, id) => set.songs.find((s) => s.id === id);
