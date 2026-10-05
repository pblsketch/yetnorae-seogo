// 결과 카드 자료(spec 12). 카드 그림은 저장하지 않고, 부를 때마다 지금의 기록으로 다시 모은다.
// 점수·등급·순위는 담지 않는다. 그림으로 그리는 일은 결과 카드 화면(js/result/)이 한다.
import { SONG_TABLE } from '../data/song-table.js';
import { PLAY_WING_IDS, wingById } from '../data/wings.js';
import { CONCEPTS, conceptById, conceptsOfGenre } from '../data/concepts.js';
import { songs as registeredSongs } from '../data/songs/index.js';

// 카드 파일 이름 기본값(조정 가능, spec 12)
export const CARD_FILE_PREFIX = '옛노래서고';

const clone = (v) => (v === null || v === undefined ? null : JSON.parse(JSON.stringify(v)));

function titleOf(songs, table, id) {
  const list = Array.isArray(songs) ? songs : Object.values(songs ?? {});
  return list.find((s) => s?.id === id)?.title ?? table.catalog?.[id]?.title ?? id;
}

// 판 카드: 기록 이름, 관 이름, 꽂은 칸 노래 세 편, 그 관 갈래의 개념 상태, 작품 방 기록, 덤 여부, 날짜.
// 판을 마치지 않은 관이면 null.
export function buildWingCard(record, wingId, { songs = registeredSongs, table = SONG_TABLE } = {}) {
  const p = record?.progress;
  const ws = p?.wings?.[wingId];
  if (!ws || ws.state !== 'done') return null;
  const wing = wingById(wingId);
  return {
    kind: 'wing',
    recordName: record.name,
    appearance: record.appearance,
    wingId,
    wingName: wing.name,
    genre: wing.genre,
    shelfSongs: ws.placements.shelf.filter(Boolean).map((s) => ({ id: s.songId, title: titleOf(songs, table, s.songId) })),
    concepts: conceptsOfGenre(wing.genre).map((c) => ({ id: c.id, text: c.text, state: p.concepts[c.id]?.state ?? 'none' })),
    room: clone(p.rooms?.[wingId]),
    bonusDone: ws.bonusDone === true,
    date: ws.doneAt,
    fileName: CARD_FILE_PREFIX + '_' + record.name + '_' + wing.name + '.png',
  };
}

// 마지막 카드: 기록 이름, 다섯 관 완료, 먹 개념, 보스 1단계 노래별 세 기록, 엔딩 선택, 날짜.
// 서고가 완성되지 않았으면 null.
export function buildFinalCard(record, { songs = registeredSongs, table = SONG_TABLE } = {}) {
  const p = record?.progress;
  if (!p?.ending?.completed) return null;
  const e = p.ending;
  return {
    kind: 'final',
    recordName: record.name,
    appearance: record.appearance,
    wings: PLAY_WING_IDS.map((w) => ({ id: w, name: wingById(w).name, done: p.wings[w].state === 'done' })),
    inkConcepts: CONCEPTS.filter((c) => p.concepts[c.id]?.state === 'ink').map((c) => ({ id: c.id, genre: c.genre, text: c.text })),
    boss: (table.boss.unseenOrder ?? []).map((g) => {
      const id = table.boss.unseen[g];
      const u = p.boss.unseen[id] ?? {};
      return {
        songId: id,
        title: titleOf(songs, table, id),
        genre: g,
        firstTryCorrect: u.firstTryCorrect ?? null,
        journalHelp: u.journalHelp === true,
        singerGroupCorrect: u.singerGroupCorrect ?? null,
      };
    }),
    ending: {
      line: e.line,
      wing: e.wing,
      wingName: wingById(e.wing)?.name ?? null,
      conceptId: e.conceptId,
      conceptText: conceptById(e.conceptId)?.text ?? null,
      note: e.note,
    },
    date: e.completedAt,
    fileName: CARD_FILE_PREFIX + '_' + record.name + '_마지막.png',
  };
}
