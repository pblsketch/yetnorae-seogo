// 판정 규칙(spec 6, 4.3, 10). 화면과 저장에 기대지 않는 순수 함수만 둔다.
// 진행 엔진(js/core/progress.js)이 이 함수들로 판정하고, 결과를 기록과 사건으로 옮긴다.
import { SONG_TABLE } from '../data/song-table.js';
import { PLAY_WING_IDS, wingById, wingOfGenre } from '../data/wings.js';

// 보스 2단계에서 '바뀌는 지점 근처'로 인정하는 판정 창(밀리초, 조정 가능, spec 10.1).
// 갈래가 바뀐 것을 듣고 알아차린 뒤 탭하므로 지점 뒤쪽을 더 넉넉히 둔다.
// 탭 시각은 박자 보정값을 뺀 값(소리 엔진이 계산한 낭송 시각 기준)으로 넘긴다.
export const REMIX_TAP_WINDOW_MS = { before: 500, after: 1500 };

// 자리마다 수(js/data/README.md 9.1)
export const AREA_SIZES = { shelf: 3, basket: 2, bonus: 3 };

// 노래 id의 갈래. 노래 표의 목록에서 찾는다.
export function genreOfSong(table, songId) {
  return table?.catalog?.[songId]?.genre ?? null;
}

// 자리 하나가 맞는지. slot은 { songId, to? }.
// - 칸(향가관 제외)과 덤: 그 관 갈래의 노래면 맞다.
// - 향가관 탑: 그 층(구 수)의 노래여야 맞다. 층 노래는 노래 표의 shelf 순서(shelfFloors)와 같다.
// - 바구니: 다른 갈래의 노래이고, 고른 행선지가 그 노래 갈래의 관이어야 맞다. 칸 노래를 넣으면 틀린다.
function slotCorrect(table, wingId, area, index, slot) {
  const wing = wingById(wingId);
  const genre = genreOfSong(table, slot.songId);
  if (!wing?.genre || !genre) return false;
  if (area === 'basket') {
    return genre !== wing.genre && slot.to === wingOfGenre(genre)?.id;
  }
  if (area === 'shelf' && Array.isArray(table.wings?.[wingId]?.shelfFloors)) {
    return table.wings[wingId].shelf[index] === slot.songId;
  }
  return genre === wing.genre;
}

// 칸·탑·바구니·덤 판정(spec 6.1~6.3, 6.6). 모든 자리가 찼을 때만 판정한다.
// slots: 자리 배열. 각 자리는 null 또는 { songId, to?, fixed }. 이미 고정된 자리는 맞은 것으로 친다.
// 돌려주는 값
//   { judged: false, reason: 'not-full' }
//   { judged: true, allCorrect, results: [{ index, songId, to?, correct }], wrong: [{ index, songId, to?, genre }] }
export function judgeArea({ table = SONG_TABLE, wingId, area, slots }) {
  if (!Array.isArray(slots) || slots.length !== AREA_SIZES[area] || slots.some((s) => !s)) {
    return { judged: false, reason: 'not-full' };
  }
  const results = slots.map((slot, index) => {
    const correct = slot.fixed === true || slotCorrect(table, wingId, area, index, slot);
    const r = { index, songId: slot.songId, correct };
    if (area === 'basket') r.to = slot.to;
    return r;
  });
  const wrong = results.filter((r) => !r.correct).map((r) => ({ ...r, genre: genreOfSong(table, r.songId) }));
  for (const w of wrong) delete w.correct;
  return { judged: true, allCorrect: wrong.length === 0, results, wrong };
}

// 바구니 판정을 통과한 길 잃은 노래의 행선지(spec 4.3).
// 도착할 관이 아직 마치지 않은 관이고 그 노래가 그 관의 칸 노래면 미리 잰 대기(prewait), 그 밖은 돌아온 노래 선반(returned).
// wingStates: 관 id → 'locked' | 'open' | 'done'
export function routeStray({ table = SONG_TABLE, songId, to, wingStates = {} }) {
  const notDone = wingStates[to] !== 'done';
  const isShelf = (table.wings?.[to]?.shelf ?? []).includes(songId);
  return { kind: notDone && isShelf ? 'prewait' : 'returned', wing: to };
}

// 보스 1단계: 낯선 노래를 꽂은 관 자리가 그 노래 갈래의 관이면 맞다.
export function judgeUnseenPlacement({ table = SONG_TABLE, songId, wingId }) {
  if (!PLAY_WING_IDS.includes(wingId)) return false;
  return wingById(wingId).genre === genreOfSong(table, songId);
}

// 보스 1단계 '누가 불렀을까?': 노래 데이터의 singerGroups에 든 무리면 맞다(여럿일 수 있음).
export function judgeSingerGroup(song, groupId) {
  return Array.isArray(song?.singerGroups) && song.singerGroups.includes(groupId);
}

// 보스 2단계(박자 방식): 탭 시각이 바뀌는 지점 근처면 그 지점 번호, 아니면 null(틀림, spec 10.1).
// switchesMs: 바뀌는 지점 시각 목록(밀리초). 여러 지점에 걸치면 가장 가까운 지점.
export function judgeRemixTap(tapMs, switchesMs, win = REMIX_TAP_WINDOW_MS) {
  let best = null;
  let bestDist = Infinity;
  (switchesMs ?? []).forEach((t, i) => {
    const d = tapMs - t;
    if (d >= -win.before && d <= win.after && Math.abs(d) < bestDist) {
      best = i;
      bestDist = Math.abs(d);
    }
  });
  return best;
}

// 보스 2단계(박자 없는 방식): 이어 붙은 글줄에서 갈래가 바뀌는 줄을 탭하면 그 지점 번호, 아니면 null(틀림).
export function judgeRemixLine(line, switchLines) {
  const i = (switchLines ?? []).indexOf(line);
  return i >= 0 ? i : null;
}

// 보스 3단계: 좀 대왕이 삼킨 노래(튜토리얼 노래)를 그 갈래 관 자리(시조)에 꽂으면 맞다.
export function judgeStage3Placement({ table = SONG_TABLE, wingId }) {
  return judgeUnseenPlacement({ table, songId: table.boss?.stage3SongId, wingId });
}
