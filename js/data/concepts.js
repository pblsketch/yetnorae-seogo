// 개념 목록(spec 7.1)과 향유층 무리(spec 10.2). 화면과 상관없는 순수 데이터다.
// text는 사서 일지에 그대로 보이는 문장이며 교사 확인(spec 16.4) 대상이다.

export const CONCEPTS = [
  { id: 'hyangga-lines', genre: 'hyangga', text: '향가는 4구체, 8구체, 10구체로 나뉜다' },
  { id: 'hyangga-442', genre: 'hyangga', text: '10구체는 4구·4구·2구로 나뉜다' },
  { id: 'hyangga-exclaim', genre: 'hyangga', text: "10구체 마지막 무리의 첫머리에 '아아' 같은 감탄사가 온다" },
  { id: 'goryeo-stanza', genre: 'goryeo', text: '대부분 여러 연으로 나뉜다' },
  { id: 'goryeo-refrain', genre: 'goryeo', text: '후렴구나 여음(뜻 없는 소리)이 들어간다' },
  { id: 'goryeo-3beat', genre: 'goryeo', text: '한 줄이 대개 세 음보로 읽힌다' },
  { id: 'sijo-3jang', genre: 'sijo', text: '초장·중장·종장, 세 장이다' },
  { id: 'sijo-4beat', genre: 'sijo', text: '장마다 네 음보다' },
  { id: 'sijo-final3', genre: 'sijo', text: '종장 첫 음보는 세 글자다' },
  { id: 'gasa-4beat', genre: 'gasa', text: '네 음보가 끊이지 않고 이어진다' },
  { id: 'gasa-nolimit', genre: 'gasa', text: '행의 수가 정해져 있지 않다' },
  { id: 'saseol-middle', genre: 'saseol', text: '초장이나 중장이 길게 늘어난다' },
  { id: 'saseol-frame', genre: 'saseol', text: '세 장에서 맺고, 종장은 시조처럼 세 글자로 시작한다' },
];

export const CONCEPT_IDS = CONCEPTS.map((c) => c.id);

// 개념 상태. none → pencil → ink 순서로만 간다(spec 7.2).
export const CONCEPT_STATES = ['none', 'pencil', 'ink'];

// 보스 1단계 '누가 불렀을까?'의 다섯 무리(spec 10.2). 엔딩 가객 행렬도 이 순서로 지나간다(spec 2).
export const SINGER_GROUPS = [
  { id: 'monk-hwarang', name: '승려·화랑' },
  { id: 'court-goryeo', name: '궁중·고려 백성' },
  { id: 'literati-gisaeng', name: '사대부·기녀' },
  { id: 'literati-women', name: '사대부·규방 여성' },
  { id: 'singer-commoner', name: '가객·서민' },
];

export const SINGER_GROUP_IDS = SINGER_GROUPS.map((g) => g.id);

// 노래 singer.class에 쓸 수 있는 향유층(spec 4.4). '낭도'는 화랑을 따르던 무리(「모죽지랑가」의 득오는 죽지랑의 낭도,
// 한국민족문화대백과사전 「득오」[S3], Codex 점검 C5). 보스 무리로는 '승려·화랑'에 든다.
export const SINGER_CLASSES = ['승려', '화랑', '낭도', '민간', '궁중', '고려 백성', '사대부', '기녀', '규방 여성', '가객', '서민'];

export function conceptById(id) {
  return CONCEPTS.find((c) => c.id === id) ?? null;
}

export function conceptsOfGenre(genre) {
  return CONCEPTS.filter((c) => c.genre === genre);
}
