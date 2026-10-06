// 가객 45명을 절차 3D 인물로 세우는 표(검토용). 그림이 아니라 '틀 + 인자'로 짓는다.
//  - ARCHETYPES: 신분·직분마다 기본 차림(몸 모양, 머리, 쓰개, 신, 옷 색)이다.
//  - LOOKS: 승인된 가객 그림(sprite/singer-*.webp) 하나에 생김새 하나. 같은 그림을 나눠 쓰는 노래들은 같은 생김새다(그림 25장 → 생김새 25).
//    틀의 기본값 위에 색·쓰개·수염·소품·손 자세만 덧쓴다. 색은 그 그림에서 눈으로 골랐다.
//  - SINGERS: 노래 id → 생김새. 가객 이름과 향유층(class)은 js/data/songs/*.js의 singer 값을 옮겨 적은 것이다(검토 편의).
// figures-3d.js가 이 표를 읽어 'singer-<노래 id>' 조립법을 만든다. 같은 생김새는 기하 하나를 나눠 쓴다.
//
// 값의 뜻(figures-3d.js의 person()이 해석한다)
//   body   : 'jacket'(저고리·바지) | 'robe'(도포·두루마기·승복처럼 긴 옷) | 'dallyeong'(단령, 관리의 둥근 깃 옷) | 'skirt'(치마저고리) | 'armor'(갑옷)
//   hair   : 'bald' | 'cap'(쓰개 밑 머리) | 'topknot'(상투) | 'bun'(쪽머리) | 'gache'(가체) | 'braid'(댕기 머리)
//   hat    : null | 'gat'(갓) | 'samo'(사모) | 'jeollip'(전립) | 'helmet'(투구) | 'headband'(머리띠) | 'wrap'(두건) | 'tall'(높은 검은 관) | 'flowercap'(꽃 꽂은 검은 관)
//   beard  : null | 'mustache' | 'goatee'(콧수염 + 턱수염) | 'full'(구레나룻) | 'long'(길게 늘어진 수염)
//   belt   : 'sash'(띠와 술) | 'cord'(세조대, 붉은 끈과 술) | 'gakdae'(관리의 각대) | 'rope'(새끼줄 띠)
//   legs   : 'gather'(대님으로 묶은 바지) | 'short'(걷어 올린 바짓단) | 'none'(치마 밑, 신만)
//   shoe   : 'straw'(짚신) | 'black'(흑혜) | 'white'(꽃신·버선)
//   layers : 'vest'(조끼·배자) | 'kasaya'(가사) | 'hyungbae'(흉배) | 'stole'(어깨에 건 붉은 띠) | 'panel'(앞섶 사이로 보이는 다른 색 겹옷)
//   props  : 'fan' | 'fanOpen' | 'cup' | 'bowl' | 'scroll' | 'brush' | 'book' | 'paper' | 'staff' | 'bamboo' | 'branch' | 'flower' | 'blossom' | 'drum'
//            | 'flute' | 'lantern' | 'basket' | 'jige' | 'pack' | 'pipe' | 'quiver' | 'sword' | 'swordFront' | 'orchid' | 'straw' | 'keys' | 'pouch'
//   hands  : 소품을 쥘 손을 바꾼다({ fan: 'L' }). 기본 손은 figures-3d.js의 DEFAULT_HAND
//   pose   : 아래팔을 얼마나 들었는지(라디안, 0 = 늘어뜨림). foreL/foreR(왼/오른 아래팔), outL/outR(팔을 옆으로 더 벌림)
//   old    : 흰 머리·흰 눈썹

export const ARCHETYPES = {
  // 승려: 민머리, 회색 장삼 + 붉은 가사, 크림 바지, 짚신
  monk: { body: 'robe', hem: 0.2, hair: 'bald', hat: null, beard: null, coat: '#7d776d', collar: '#e6dcc6', inner: '#e9dfc9', pants: '#e9dfc9', belt: 'sash', sash: '#2f6d66', tassel: '#2f6d66', legs: 'gather', daenim: '#2f6d66', shoe: 'straw', layers: ['kasaya'], kasaya: '#b8533f', wide: 0.125 },
  // 화랑: 머리띠와 상투, 녹색 짧은 저고리, 흰 띠, 넓은 바지
  hwarang: { body: 'jacket', jacketHem: 0.44, hair: 'topknot', hat: 'headband', coat: '#3f6b5e', collar: '#ebe0c8', inner: '#e9dfc9', pants: '#e9dfc9', belt: 'sash', sash: '#efe8dc', tassel: '#a8362c', legs: 'gather', daenim: '#2f6d66', shoe: 'straw', wide: 0.095 },
  // 신라 민간(서동 같은 젊은이): 머리띠, 베 저고리, 새끼 띠
  villager: { body: 'jacket', jacketHem: 0.46, hair: 'topknot', hat: 'headband', coat: '#d8c9a8', collar: '#8b857b', inner: '#e9dfc9', pants: '#e3d6bb', belt: 'rope', sash: '#a98a55', tassel: '#a98a55', legs: 'gather', daenim: '#2f6d66', shoe: 'straw', wide: 0.095 },
  // 장사꾼·서민: 머리띠, 크림 저고리 + 회색 조끼, 걷은 바짓단, 지게
  peddler: { body: 'jacket', jacketHem: 0.5, hair: 'topknot', hat: 'headband', coat: '#e4d9c2', collar: '#cfc3a8', inner: '#e9dfc9', pants: '#e4d9c2', belt: 'sash', sash: '#2f6d66', tassel: '#2f6d66', legs: 'short', daenim: '#2f6d66', shoe: 'straw', layers: ['vest'], vest: '#77726a', wide: 0.09 },
  // 노인(민간): 흰 상투와 흰 수염, 크림 옷 + 조끼, 지팡이
  elder: { body: 'jacket', jacketHem: 0.42, old: true, hair: 'topknot', hat: null, beard: 'long', coat: '#e6dcc4', collar: '#cfc3a8', inner: '#e9dfc9', pants: '#e4d9c2', belt: 'sash', sash: '#2f6d66', tassel: '#2f6d66', legs: 'gather', daenim: '#2f6d66', shoe: 'straw', layers: ['vest'], vest: '#8b8172', wide: 0.1 },
  // 고려 궁중 악공: 머리띠, 넓적다리까지 오는 회색 저고리, 크림 바지, 북
  musician: { body: 'jacket', jacketHem: 0.4, hair: 'topknot', hat: 'headband', coat: '#77726a', collar: '#4b4846', inner: '#e9dfc9', pants: '#e9dfc9', belt: 'sash', sash: '#2f6d66', tassel: '#2f6d66', legs: 'gather', daenim: '#2f6d66', shoe: 'straw', wide: 0.105 },
  // 신라 귀족·처용: 겹겹의 긴 옷, 꽃 꽂은 관, 구레나룻
  noble: { body: 'robe', hem: 0.2, hair: 'cap', hat: 'flowercap', beard: 'full', coat: '#b5493a', collar: '#e6dcc6', inner: '#6e6a62', pants: '#e9dfc9', belt: 'sash', sash: '#2f6d66', tassel: '#2f6d66', legs: 'gather', daenim: '#2f6d66', shoe: 'straw', layers: ['panel'], wide: 0.13 },
  // 여인(민간): 댕기 머리, 크림 저고리, 회색 치마
  woman: { body: 'skirt', hair: 'braid', hat: null, coat: '#e7dcc4', collar: '#7d776d', inner: '#e9dfc9', skirt: '#77726a', skirt2: '#e6dcc6', goreum: '#a8362c', legs: 'none', shoe: 'white', wide: 0.085 },
  // 기녀: 가체, 녹청 저고리, 붉은 고름, 겹친 치마
  gisaeng: { body: 'skirt', hair: 'gache', hat: null, coat: '#2f6d66', collar: '#ebe0c8', inner: '#e9dfc9', skirt: '#6e6a62', skirt2: '#e9dfc9', goreum: '#a8362c', legs: 'none', shoe: 'white', wide: 0.09 },
  // 규방 여성: 쪽머리, 크림 저고리와 녹청 깃, 회색 치마
  lady: { body: 'skirt', hair: 'bun', hat: null, coat: '#efe6d2', collar: '#2f6d66', inner: '#e9dfc9', skirt: '#6e6a62', skirt2: '#8b857b', goreum: '#a8362c', legs: 'none', shoe: 'white', wide: 0.085 },
  // 양반 선비·가객: 갓, 도포, 세조대(붉은 끈), 흑혜 대신 짚신(그림이 짚신)
  seonbi: { body: 'robe', hem: 0.19, hair: 'cap', hat: 'gat', beard: 'goatee', coat: '#a9aaa8', collar: '#4b4846', inner: '#e9dfc9', pants: '#e9dfc9', belt: 'cord', sash: '#a8362c', tassel: '#2f6d66', legs: 'gather', daenim: '#2f6d66', shoe: 'straw', wide: 0.13 },
  // 사대부 관리: 사모, 단령, 각대
  official: { body: 'dallyeong', hem: 0.12, hair: 'cap', hat: 'samo', beard: 'goatee', coat: '#2f6d66', collar: '#e9dfc9', inner: '#e9dfc9', pants: '#e9dfc9', belt: 'gakdae', sash: '#b89b5e', tassel: '#2f6d66', legs: 'gather', daenim: '#2f6d66', shoe: 'black', wide: 0.13 },
  // 무인: 전립, 군복(철릭), 붉은 띠, 칼
  warrior: { body: 'robe', hem: 0.24, hair: 'cap', hat: 'jeollip', beard: 'goatee', coat: '#3d4a6b', collar: '#b89b5e', inner: '#2e3650', pants: '#e9dfc9', belt: 'sash', sash: '#b5493a', tassel: '#b5493a', legs: 'gather', daenim: '#2f6d66', shoe: 'straw', wide: 0.1 },
  // 장수: 투구, 두정갑, 칼을 세워 짚음
  armored: { body: 'armor', hem: 0.22, hair: 'cap', hat: 'helmet', beard: 'full', coat: '#3e3a36', collar: '#b5493a', inner: '#56514b', pants: '#e9dfc9', belt: 'sash', sash: '#b5493a', tassel: '#2f6d66', legs: 'gather', daenim: '#b5493a', shoe: 'black', wide: 0.11 },
};

// 그림 하나 = 생김새 하나. sprite: 대표 그림(같은 그림을 쓰는 노래는 SINGERS에서 확인)
export const LOOKS = {
  'monk-bowl': { type: 'monk', sprite: 'singer-anminga', props: ['bowl', 'pack'], pose: { foreL: 1.15, foreR: 1.15 } },
  'monk-flute': { type: 'monk', sprite: 'singer-jemangmaega', props: ['flute'], hands: { flute: 'L' }, pose: { foreL: 1.55, foreR: 0.9 } },
  'monk-straw': { type: 'monk', sprite: 'singer-wonwangsaengga', coat: '#857d70', layers: [], belt: 'rope', sash: '#c9a85a', tassel: '#2f6d66', props: ['straw'], pose: { foreL: 1.1, foreR: 1.1 } },
  hwarang: { type: 'hwarang', sprite: 'singer-mojukjirangga', props: ['quiver'] },
  seodong: { type: 'villager', sprite: 'singer-seodongyo', props: ['basket', 'pouch'], pose: { foreR: 2.4, outR: 0.12 } },
  'old-cowherd': { type: 'elder', sprite: 'singer-heonhwaga', props: ['staff', 'flower'], hands: { staff: 'R', flower: 'L' }, pose: { foreR: 0.9, foreL: 1.2 } },
  'goryeo-drummer': { type: 'musician', sprite: 'singer-cheongsan-byeolgok', props: ['drum'], pose: { foreR: 1.0, foreL: 0.7 } },
  'jeongeup-wife': { type: 'woman', sprite: 'singer-jeongeupsa', props: ['lantern'], pose: { foreR: 0.55, foreL: 1.2 } },
  cheoyong: { type: 'noble', sprite: 'singer-cheoyongga', pose: { foreR: 2.1, outR: 0.18, foreL: 0.6, outL: 0.2 } },
  hwangjini: { type: 'gisaeng', sprite: 'singer-dongjitdal', props: ['fan'], pose: { foreR: 1.25 } },
  'nanseolheon': { type: 'lady', sprite: 'singer-gyuwonga', props: ['brush', 'paper'], pose: { foreR: 1.2, foreL: 1.2 } },
  'jeongcheol': { type: 'seonbi', sprite: 'singer-gwandong-byeolgok', coat: '#4d8a82', collar: '#e9dfc9', sash: '#a8362c', props: ['cup', 'scroll'], pose: { foreR: 1.6, foreL: 1.0 } },
  'gagaek-fan': { type: 'seonbi', sprite: 'singer-chang-naegoja', coat: '#a9aab0', collar: '#e9dfc9', belt: 'sash', sash: '#2f6d66', props: ['fanOpen'], pose: { foreR: 1.9, outR: 0.12, foreL: 1.0, outL: 0.15 } },
  'songsun': { type: 'seonbi', sprite: 'singer-myeonangjeongga', old: true, beard: 'long', coat: '#e9e0cc', collar: '#4b4846', props: ['fan'], pose: { foreR: 1.0, foreL: 1.3, outL: 0.25 } },
  'sinheum': { type: 'seonbi', sprite: 'singer-sinheum-sijo', coat: '#9fa7ad', collar: '#e9dfc9', props: ['orchid'], pose: { foreR: 1.2, foreL: 1.2 } },
  'yangsaeon': { type: 'seonbi', sprite: 'singer-taesan', coat: '#5f5a54', collar: '#2f6d66', props: ['brush'], pose: { foreR: 1.4 } },
  'parkinro': { type: 'warrior', sprite: 'singer-nuhangsa', props: ['sword'] },
  'utak': { type: 'seonbi', sprite: 'singer-hanson-makdae', old: true, hat: 'tall', beard: 'long', coat: '#8a857c', collar: '#e9dfc9', belt: 'sash', sash: '#2f6d66', tassel: '#a8362c', props: ['branch'], pose: { foreR: 1.7 } },
  'giljae': { type: 'seonbi', sprite: 'singer-obaengnyeon-doeupji', hat: 'tall', coat: '#ece4d2', collar: '#4b4846', belt: 'sash', sash: '#2f6d66', note: '그림의 말은 넣지 않았다(따로 걷는 몸이 필요해서)' },
  'jeonggeugin': { type: 'elder', sprite: 'singer-sangchungok', body: 'robe', hem: 0.2, hat: 'wrap', coat: '#e6dcc4', vest: '#8b857b', props: ['bamboo', 'blossom'], hands: { bamboo: 'R', blossom: 'L' }, pose: { foreR: 0.9, foreL: 1.25 } },
  'leejonyeon': { type: 'official', sprite: 'singer-ihwa-wolbaek', old: true, coat: '#2f6d66', props: ['blossom'], pose: { foreR: 1.3 } },
  'jeongmongju': { type: 'official', sprite: 'singer-imomi-jukgo', beard: 'full', coat: '#56524d', layers: ['hyungbae'], pose: { foreR: 1.35, foreL: 1.35 } },
  'leebangwon': { type: 'official', sprite: 'singer-ireondeul', beard: 'mustache', coat: '#b5493a', props: ['cup'], pose: { foreR: 1.75, foreL: 0.5 } },
  'kimjongseo': { type: 'armored', sprite: 'singer-sakpung', props: ['swordFront'], pose: { foreR: 1.25, foreL: 1.25 } },
  'commoner-jige': { type: 'peddler', sprite: 'singer-daekdeul-dongnanji', props: ['jige', 'pipe'], pose: { foreR: 2.0 } },
};

// 노래 id → 생김새. 같은 그림 파일을 쓰는 노래는 같은 생김새다.
export const SINGERS = {
  // 향가관
  seodongyo: { look: 'seodong', singer: '서동', class: '민간' },
  cheoyongga: { look: 'cheoyong', singer: '처용', class: '민간' },
  'chan-giparangga': { look: 'monk-bowl', singer: '충담사', class: '승려' },
  jemangmaega: { look: 'monk-flute', singer: '월명사', class: '승려' },
  heonhwaga: { look: 'old-cowherd', singer: '이름 모를 노인', class: '민간' },
  mojukjirangga: { look: 'hwarang', singer: '득오', class: '화랑' },
  anminga: { look: 'monk-bowl', singer: '충담사', class: '승려' },
  wonwangsaengga: { look: 'monk-straw', singer: '광덕', class: '승려' },
  // 고려가요관(지은이를 모르는 속요는 궁중 악공 한 그림)
  'cheongsan-byeolgok': { look: 'goryeo-drummer', singer: '이름 모를 고려 백성', class: '고려 백성' },
  'seogyeong-byeolgok': { look: 'goryeo-drummer', singer: '이름 모를 고려 백성', class: '고려 백성' },
  gasiri: { look: 'goryeo-drummer', singer: '이름 모를 고려 백성', class: '고려 백성' },
  jeongseokga: { look: 'goryeo-drummer', singer: '이름 모를 고려 백성', class: '고려 백성' },
  dongdong: { look: 'goryeo-drummer', singer: '이름 모를 고려 백성', class: '고려 백성' },
  sangjeoga: { look: 'goryeo-drummer', singer: '이름 모를 고려 백성', class: '고려 백성' },
  samogok: { look: 'goryeo-drummer', singer: '이름 모를 고려 백성', class: '고려 백성' },
  jeongeupsa: { look: 'jeongeup-wife', singer: '이름 모를 정읍 행상인의 아내', class: '민간' },
  // 시조관
  taesan: { look: 'yangsaeon', singer: '양사언', class: '사대부' },
  dongjitdal: { look: 'hwangjini', singer: '황진이', class: '기녀' },
  ireondeul: { look: 'leebangwon', singer: '이방원', class: '사대부' },
  'imomi-jukgo': { look: 'jeongmongju', singer: '정몽주', class: '사대부' },
  'simnyeon-gyeongyeong': { look: 'songsun', singer: '송순', class: '사대부' },
  'cheongsanri-byeokgyesu': { look: 'hwangjini', singer: '황진이', class: '기녀' },
  'obaengnyeon-doeupji': { look: 'giljae', singer: '길재', class: '사대부' },
  'eojeo-nae-iriyeo': { look: 'hwangjini', singer: '황진이', class: '기녀' },
  'ihwa-wolbaek': { look: 'leejonyeon', singer: '이조년', class: '사대부' },
  'hanson-makdae': { look: 'utak', singer: '우탁', class: '사대부' },
  sakpung: { look: 'kimjongseo', singer: '김종서', class: '사대부' },
  'sinheum-sijo': { look: 'sinheum', singer: '신흠', class: '사대부' },
  // 가사관
  myeonangjeongga: { look: 'songsun', singer: '송순', class: '사대부' },
  'gwandong-byeolgok': { look: 'jeongcheol', singer: '정철', class: '사대부' },
  gyuwonga: { look: 'nanseolheon', singer: '허난설헌', class: '규방 여성' },
  sangchungok: { look: 'jeonggeugin', singer: '정극인', class: '사대부' },
  samiingok: { look: 'jeongcheol', singer: '정철', class: '사대부' },
  seonsangtan: { look: 'parkinro', singer: '박인로', class: '사대부' },
  songmiingok: { look: 'jeongcheol', singer: '정철', class: '사대부' },
  nuhangsa: { look: 'parkinro', singer: '박인로', class: '사대부' },
  gapminga: { look: 'commoner-jige', singer: '이름 모를 서민', class: '서민' },
  // 사설시조관(이름 모를 가객은 부채 든 가객 한 그림, 서민은 지게 진 서민 한 그림)
  'namodo-bahi': { look: 'gagaek-fan', singer: '이름 모를 가객', class: '가객' },
  'daekdeul-dongnanji': { look: 'commoner-jige', singer: '이름 모를 서민', class: '서민' },
  'chang-naegoja': { look: 'gagaek-fan', singer: '이름 모를 가객', class: '가객' },
  'nimi-oma': { look: 'gagaek-fan', singer: '이름 모를 가객', class: '가객' },
  gwitturami: { look: 'gagaek-fan', singer: '이름 모를 가객', class: '가객' },
  'nonbat-gara': { look: 'commoner-jige', singer: '이름 모를 서민', class: '서민' },
  hansuma: { look: 'gagaek-fan', singer: '이름 모를 가객', class: '가객' },
  'suneung-saseol': { look: 'gagaek-fan', singer: '이름 모를 가객', class: '가객' },
};

// 생김새 하나의 최종 인자(틀 기본값 + 생김새 덧쓰기)
export function resolveLook(lookId) {
  const look = LOOKS[lookId];
  if (!look) return null;
  const base = ARCHETYPES[look.type];
  return { ...base, ...look, pose: { ...(base.pose ?? {}), ...(look.pose ?? {}) }, layers: look.layers ?? base.layers ?? [], props: look.props ?? base.props ?? [] };
}
