// 관 설정(spec 3.1)과 갈래 설정. 화면과 상관없는 순수 데이터다.
// 형식의 기준은 js/data/README.md의 '관 설정'·'갈래' 절이다.

// 갈래 다섯. unitKind는 그 갈래의 형식 단위 종류, unitName은 화면에 쓰는 단위 이름이다.
export const GENRES = [
  { id: 'hyangga', name: '향가', unitKind: 'gu', unitName: '구' },
  { id: 'goryeo', name: '고려가요', unitKind: 'stanza', unitName: '연' },
  { id: 'sijo', name: '시조', unitKind: 'jang', unitName: '장' },
  { id: 'gasa', name: '가사', unitKind: 'haeng', unitName: '행' },
  { id: 'saseol', name: '사설시조', unitKind: 'jang', unitName: '장' },
];

export const GENRE_IDS = GENRES.map((g) => g.id);

// 고유 동작 다섯(spec 5.4). wing은 그 동작을 쓰는 관이다.
export const ACTIONS = [
  { id: 'aa-door', wing: 'hyangga', name: "'아아' 문 열기" },
  { id: 'refrain-link', wing: 'goryeo', name: '후렴 고리 걸기' },
  { id: 'stairs', wing: 'sijo', name: '계단 오르기' },
  { id: 'walk', wing: 'gasa', name: '걷기' },
  { id: 'rapid-unroll', wing: 'saseol', name: '연타로 풀기' },
];

export const ACTION_IDS = ACTIONS.map((a) => a.id);

// 관 여섯(입구 포함). order 순서로만 열린다(spec 3.2).
// 입구는 갈래와 고유 동작이 없고, 튜토리얼은 시조 계단(stairs)을 쓴다.
export const WINGS = [
  { id: 'entrance', order: 0, name: '입구', genre: null, action: null, tutorialAction: 'stairs' },
  { id: 'hyangga', order: 1, name: '향가관', genre: 'hyangga', action: 'aa-door' },
  { id: 'goryeo', order: 2, name: '고려가요관', genre: 'goryeo', action: 'refrain-link' },
  { id: 'sijo', order: 3, name: '시조관', genre: 'sijo', action: 'stairs' },
  { id: 'gasa', order: 4, name: '가사관', genre: 'gasa', action: 'walk' },
  { id: 'saseol', order: 5, name: '사설시조관', genre: 'saseol', action: 'rapid-unroll' },
];

export const WING_IDS = WINGS.map((w) => w.id);

// 판을 하는 관 다섯(입구 제외), 순서대로.
export const PLAY_WING_IDS = WINGS.filter((w) => w.genre).map((w) => w.id);

// 노래의 roles에서만 쓰는 자리 id. 보스전은 관이 아니지만 낯선 노래의 자리를 이 id로 적는다.
export const BOSS_PLACE_ID = 'boss';

export function wingById(id) {
  return WINGS.find((w) => w.id === id) ?? null;
}

export function wingOfGenre(genre) {
  return WINGS.find((w) => w.genre === genre) ?? null;
}

export function genreById(id) {
  return GENRES.find((g) => g.id === id) ?? null;
}
