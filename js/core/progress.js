// 진행 엔진(spec 3.2, 4.3, 6, 7.2, 10, 11, 13, 20). 기록 하나의 progress를 받아 규칙대로만 바꾼다.
// 관의 노래는 형식 분석 뒤 갈래 판별(decideGenre)이 맞아야 손에 들거나 바구니에 담긴다(교사 결정 2026-10-08).
// 화면과 상관없다. 노래 자료, 시계, 저장, 사건 내기는 모두 바깥에서 넣는다.
// 관 상태를 직접 바꾸는 길은 없다. 관은 튜토리얼과 판 마치기로만 순서대로 열린다(건너뛰기 없음).
// 의미 있는 행동(꽂기, 빼기, 판정, 재기 완료, 방 완료, 보스 행동, 엔딩)이 기록을 바꾸면 그때마다 save()를 부른다.
import { emit as busEmit } from './events.js';
import {
  AREA_SIZES, judgeArea, routeStray, judgeUnseenPlacement, judgeSingerGroup, judgeRemixTap, judgeRemixLine,
  judgeStage3Placement, genreOfSong, REMIX_TAP_WINDOW_MS,
} from './judge.js';
import { SONG_TABLE } from '../data/song-table.js';
import { GENRE_IDS, PLAY_WING_IDS, wingById, wingOfGenre } from '../data/wings.js';
import { CONCEPT_IDS, CONCEPT_STATES, SINGER_GROUP_IDS, conceptById, conceptsOfGenre } from '../data/concepts.js';
import { songs as registeredSongs } from '../data/songs/index.js';
import { cleanText, graphemeCount } from './text.js';
import { mismatches, targetGenre } from './contrast.js';

// 조정할 수 있는 값(spec 22).
export const TUNABLES = Object.freeze({
  wingWrongHelp: 3,        // 관에서 오답이 이만큼 쌓이면 그때부터 틀릴 때마다 수첩이 반짝인다
  bossWrongHelp: 3,        // 보스 같은 단계에서 이만큼 틀리면 그때부터 틀릴 때마다 일지가 반짝인다
  endingLineMin: 1,        // 엔딩 한 줄 글자 수
  endingLineMax: 40,
  endingNoteMax: 60,       // 엔딩 한마디 글자 수(0부터)
  remixWindow: REMIX_TAP_WINDOW_MS,
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
// 글자 수는 눈에 보이는 글자 단위로 센다(./text.js, 이름과 같은 방식)
const charLength = graphemeCount;

function toSongMap(songs) {
  if (songs instanceof Map) return songs;
  const m = new Map();
  for (const s of Array.isArray(songs) ? songs : Object.values(songs ?? {})) if (s?.id) m.set(s.id, s);
  return m;
}

// progress: 기록의 progress 객체(그 자리에서 바꾼다). save: 바뀐 뒤 부를 저장 함수.
export function createProgress({
  progress,
  songs = registeredSongs,
  table = SONG_TABLE,
  emit = busEmit,
  now = () => new Date(),
  save = () => true,
  tunables = {},
} = {}) {
  if (!isObj(progress)) throw new Error('진행 엔진: progress 객체가 필요하다');
  const p = progress;
  const T = { ...TUNABLES, ...tunables };
  const songMap = toSongMap(songs);
  const iso = () => now().toISOString();

  // 저장하지 않는 진행 중 상태. 창을 닫거나 보스를 나가면 사라진다(spec 20: 진행 중이던 노래·단계는 다시 한다).
  let pendingSinger = null;          // 보스 1단계에서 맞게 꽂고 '누가 불렀을까'를 기다리는 노래
  const stage2Found = new Set();     // 보스 2단계에서 찾은 바뀌는 지점

  const ok = (extra = {}) => ({ ok: true, ...extra });
  const no = (reason) => ({ ok: false, reason });
  const commit = (result) => { save(); return result; };

  const isCompleted = () => p.ending.completed === true;
  const wingOk = (w) => PLAY_WING_IDS.includes(w);
  const wingStates = () => Object.fromEntries(PLAY_WING_IDS.map((w) => [w, p.wings[w].state]));

  // 노래가 확인해 주는 개념. 노래 자료가 없으면 아무것도 확인하지 않는다.
  const evidencesOf = (id) => (songMap.get(id)?.evidences ?? []).filter((c) => CONCEPT_IDS.includes(c));
  // 도움 신호에 실을 관련 개념(오답 뒤): 노래 자기 갈래가 아니라 **대상**(학생이 고른 자리의 갈래, 탑은 그 층)의 개념 가운데
  // 그 노래의 감정서와 어긋나는 것(js/core/contrast.js). 어긋나는 줄이 없으면 대상 갈래 개념 모두.
  // 노래 자기 갈래의 개념을 실으면 반짝임이 곧 답이 되므로 싣지 않는다.
  const targetHelp = (songId, target, actionIds) => {
    const song = songMap.get(songId);
    const found = song ? mismatches(song, target, actionIds) : [];
    const ids = [...new Set(found.map((m) => m.conceptId))];
    return ids.length ? ids : conceptsOfGenre(targetGenre(target)).map((c) => c.id);
  };
  // 그 관에서 그 노래의 감정서에 실린 고유 동작: 미리 잰 노래는 보낸 관의 동작, 나머지는 그 관의 동작
  const measuredAction = (w, songId) => {
    if ((p.prewaiting[w] ?? []).includes(songId)) {
      for (const [from, t] of Object.entries(table.wings ?? {})) {
        if ((t.stray ?? []).some((s) => s.songId === songId && s.to === w)) return wingById(from)?.action ?? null;
      }
    }
    return wingById(w)?.action ?? null;
  };
  // 노래의 갈래(노래 표의 목록, 없으면 노래 자료)
  const genreOf = (id) => genreOfSong(table, id) ?? songMap.get(id)?.genre ?? null;
  // 판정에서 틀린 자리의 대상: 탑은 그 층, 바구니는 행선지 관의 갈래, 칸·덤은 그 관 갈래
  const wrongTarget = (w, area, x) => {
    const floors = table.wings?.[w]?.shelfFloors;
    if (area === 'shelf' && Array.isArray(floors)) return { towerUnits: floors[x.index] };
    if (area === 'basket') return { genre: wingById(x.to)?.genre ?? wingById(w)?.genre ?? null };
    return { genre: wingById(w)?.genre ?? null };
  };

  // ── 개념 확인(spec 7.2): 서로 다른 노래 1편 = 연필, 2편 이상 = 먹. 되돌아가지 않는다.
  // 칸이 묶일 때처럼 여러 편이 한꺼번에 확인되면 다 더한 뒤에 상태를 정한다(공통 개념은 바로 먹).
  function confirmSongs(songIds) {
    const touched = new Set();
    for (const songId of songIds) {
      for (const c of evidencesOf(songId)) {
        const entry = p.concepts[c];
        if (!entry.songs.includes(songId)) { entry.songs.push(songId); touched.add(c); }
      }
    }
    for (const c of CONCEPT_IDS) {
      if (!touched.has(c)) continue;
      const entry = p.concepts[c];
      const byCount = entry.songs.length >= 2 ? 'ink' : 'pencil';
      if (CONCEPT_STATES.indexOf(byCount) > CONCEPT_STATES.indexOf(entry.state)) {
        entry.state = byCount;
        emit('concept:changed', { conceptId: c, state: byCount, songs: [...entry.songs] });
      }
    }
  }
  const confirmSong = (songId) => confirmSongs([songId]);

  function grantKeepsake(songId) {
    if (!p.keepsakes.includes(songId)) p.keepsakes.push(songId);
  }

  function setWingState(w, state) {
    p.wings[w].state = state;
    emit('wing:state', { wing: w, state });
  }

  // 칸 묶음·바구니 통과·방 완료가 모두 되면 판이 끝나고 다음 관이 열린다(spec 3.2). 다섯 관을 다 마치면 보스가 열린다.
  function checkWingDone(w) {
    const ws = p.wings[w];
    if (ws.state !== 'open' || !ws.shelfBound || !ws.basketDone || !ws.roomDone) return false;
    ws.doneAt = iso();
    setWingState(w, 'done');
    const next = PLAY_WING_IDS[PLAY_WING_IDS.indexOf(w) + 1];
    if (next && p.wings[next].state === 'locked') setWingState(next, 'open');
    if (PLAY_WING_IDS.every((x) => p.wings[x].state === 'done') && p.boss.state === 'locked') p.boss.state = 'stage1';
    return true;
  }

  // 그 관 판에서 다룰 수 있는 노래. 칸·바구니는 칸 노래와 길 잃은 노래, 덤은 덤 노래.
  function areaSongs(w, area) {
    const t = table.wings[w];
    if (area === 'bonus') return t.bonus ?? [];
    return [...(t.shelf ?? []), ...(t.stray ?? []).map((s) => s.songId)];
  }

  function findPlaced(w, songId) {
    for (const area of Object.keys(AREA_SIZES)) {
      const i = p.wings[w].placements[area].findIndex((s) => s?.songId === songId);
      if (i >= 0) return { area, index: i, slot: p.wings[w].placements[area][i] };
    }
    return null;
  }

  // 자리를 바꿀 수 있는지(꽂기·빼기·판정 공통). 막히면 까닭, 되면 null.
  function areaBlocked(w, area, index) {
    if (!wingOk(w)) return 'bad-wing';
    const ws = p.wings[w];
    if (ws.state === 'locked') return 'locked';
    if (!(area in AREA_SIZES)) return 'bad-area';
    if (index !== undefined && !(Number.isInteger(index) && index >= 0 && index < AREA_SIZES[area])) return 'bad-index';
    if (area === 'bonus') {
      if (ws.state !== 'done') return 'bonus-locked';       // 덤은 판을 마친 관에서만(spec 6.6)
      if (ws.bonusDone) return 'bound';
      return null;
    }
    if (isCompleted()) return 'completed';                   // 서고 완성 뒤 판정 기록은 바뀌지 않는다
    if (area === 'shelf' && ws.shelfBound) return 'bound';
    if (area === 'basket' && ws.basketDone) return 'done';
    return null;
  }

  // ───────────── 입구 ─────────────

  // 튜토리얼 노래 재기를 마침 → 그 노래가 확인된다(spec 7.2).
  function finishTutorialMeasure() {
    if (p.tutorialDone) return no('done');
    confirmSong(table.tutorial);
    return commit(ok());
  }

  // 튜토리얼을 마침 → 향가관이 열린다(spec 3.2).
  function completeTutorial() {
    if (p.tutorialDone) return no('done');
    confirmSong(table.tutorial);
    p.tutorialDone = true;
    const first = PLAY_WING_IDS[0];
    if (p.wings[first].state === 'locked') setWingState(first, 'open');
    return commit(ok());
  }

  // ───────────── 관 한 판 ─────────────

  function markUniqueActionIntroSeen(w) {
    if (!wingOk(w)) return no('bad-wing');
    if (p.wings[w].state === 'locked') return no('locked');
    p.wings[w].uniqueActionIntroSeen = true;
    return commit(ok());
  }

  // 미리 분석한 노래(바구니로 보내져 그 관 입구에서 기다리는 칸 노래)를 잡음. 보낸 관에서 이미 갈래를 판별했으므로
  // 판별 없이 손에 든다. 그 밖의 노래는 형식 분석 뒤 갈래 판별(decideGenre)이 맞아야 손에 든다.
  function markMeasured(w, songId) {
    if (!wingOk(w)) return no('bad-wing');
    const ws = p.wings[w];
    if (ws.state === 'locked') return no('locked');
    if (!areaSongs(w, 'shelf').includes(songId)) return no('not-in-wing');
    if (!(p.prewaiting[w] ?? []).includes(songId)) return no('not-decided');
    if (!ws.measured.includes(songId)) ws.measured.push(songId);
    return commit(ok());
  }

  // 그 관에서 다시 분석하지 않는 노래(갈래 판별을 마쳤거나 미리 분석한 노래).
  const isMeasured = (w, songId) => wingOk(w) && (p.wings[w].measured.includes(songId) || (p.prewaiting[w] ?? []).includes(songId));
  // 그 관에서 갈래 판별을 마치고 손에 든(든 적이 있는) 노래. 저장의 measured가 곧 판별 기록이다(다시 열어도 그대로).
  const isDecided = (w, songId) => wingOk(w) && p.wings[w].measured.includes(songId);

  // 갈래 판별(형식 분석의 ④). 학생이 고른 갈래가 노래 갈래와 같으면 맞다.
  //  - 맞음: measured에 남기고(판별 기록) 그 노래가 드러난다. 그 관 갈래면 칸·탑·덤 후보로 손에 들고, 다른 갈래면
  //    행선지(그 갈래의 관)를 정해 바구니에 담는다(학생이 행선지를 고르지 않는다). 바구니가 차면 부르는 쪽이 판정한다.
  //  - 틀림: 관 오답 하나. 기준 이상이면 **고른 갈래** 쪽의 어긋나는 개념으로 수첩 도움을 낸다(노래 갈래 쪽이 아니다).
  function decideGenre(w, songId, genre) {
    if (!wingOk(w)) return no('bad-wing');
    const ws = p.wings[w];
    if (ws.state === 'locked') return no('locked');
    const pool = ws.state === 'done' ? areaSongs(w, 'bonus') : areaSongs(w, 'shelf');
    if (!pool.includes(songId)) return no('not-in-wing');
    if (ws.state === 'done' && ws.bonusDone) return no('bound');
    if (isMeasured(w, songId) || findPlaced(w, songId)?.slot.fixed) return no('decided');
    if (!GENRE_IDS.includes(genre)) return no('invalid');
    if (genre !== genreOf(songId)) {
      ws.wrongCount += 1;
      const target = { genre };
      let help = false;
      if (ws.wrongCount >= T.wingWrongHelp) {
        emit('help:notebook-glow', { wing: w, genre, conceptIds: targetHelp(songId, target, measuredAction(w, songId)), songId });
        help = true;
      }
      return commit(ok({ correct: false, target, help }));
    }
    ws.measured.push(songId);
    const out = { correct: true, genre, own: genre === wingById(w).genre };
    if (!out.own) {
      const to = wingOfGenre(genre)?.id ?? null;
      out.to = to;
      const pl = ws.placements.basket;
      let i = pl.findIndex((s) => s?.songId === songId);
      if (i < 0) i = pl.findIndex((s) => !s);
      if (i >= 0 && !ws.basketDone && to) {
        pl[i] = { songId, to, fixed: false };
        out.basket = { index: i, full: pl.every(Boolean) };
      }
    }
    return commit(ok(out));
  }

  // 그 관 입구에서 기다리는 미리 잰 노래(아직 칸에 고정되지 않은 것)
  const waitingAt = (w) => (p.prewaiting[w] ?? []).filter((id) => !p.wings[w]?.placements.shelf.some((s) => s?.songId === id && s.fixed));
  const returnedAt = (w) => [...(p.returned[w] ?? [])];

  // 드러난 노래: 갈래 판별에서 맞았거나(measured), 판정에서 맞아 고정되었거나(칸·탑·덤, 바구니에서 보낸 노래),
  // 튜토리얼을 마친 튜토리얼 노래. 드러난 노래의 단위는 그 갈래 이름(구·연·줄·장·행)으로 부르고, 그 전에는 '부분'이라
  // 부른다(형식 분석 화면). 저장에 새 값을 두지 않고 기록의 판별·고정·행선지에서 다시 계산한다.
  function isRevealed(songId) {
    if (songId === table.tutorial && p.tutorialDone) return true;
    for (const w of PLAY_WING_IDS) {
      if (p.wings[w].measured.includes(songId)) return true;
      for (const area of Object.keys(AREA_SIZES)) if (p.wings[w].placements[area].some((s) => s?.fixed && s.songId === songId)) return true;
      if ((p.prewaiting[w] ?? []).includes(songId) || (p.returned[w] ?? []).includes(songId)) return true;
    }
    return false;
  }
  // 두루마리의 여음·후렴·되풀이 이름표를 달 수 있는가: 드러난(판별을 마친) 노래. 분석 도중에는 고려가요관의
  // 후렴 고리 걸기가 되풀이 구절을 찾은 순간부터 그 화면에서 단다(js/measure).
  const marksKnown = (songId) => isRevealed(songId);

  // 자리에 꽂는다. 갈래 판별을 마친 노래만 꽂는다: 칸·탑·덤은 그 관 갈래로 판별한 노래, 바구니는 다른 갈래로 판별한 노래.
  // 바구니의 행선지(to)는 그 노래 갈래의 관으로 정해진다(넘긴 to가 다르면 막는다). 판정 전 노래는 다른 자리로 옮길 수 있다.
  // 이미 다른 노래가 있던 자리면 그 노래는 손으로 돌아온다(displaced).
  function place(w, area, index, songId, to) {
    const blocked = areaBlocked(w, area, index);
    if (blocked) return no(blocked);
    if (!areaSongs(w, area).includes(songId)) return no('not-in-wing');
    if (!isDecided(w, songId)) return no('not-decided');
    const genre = genreOf(songId);
    const own = genre === wingById(w).genre;
    if (area === 'basket' && own) return no('own-genre');
    if (area !== 'basket' && !own) return no('other-genre');
    const autoTo = wingOfGenre(genre)?.id ?? null;
    if (area === 'basket' && to !== undefined && to !== null && to !== autoTo) return no('bad-destination');
    to = autoTo;
    const pl = p.wings[w].placements;
    const target = pl[area][index];
    if (target?.fixed) return no('fixed');
    const existing = findPlaced(w, songId);
    if (existing?.slot.fixed) return no('fixed');
    if (existing) pl[existing.area][existing.index] = null;
    pl[area][index] = area === 'basket' ? { songId, to, fixed: false } : { songId, fixed: false };
    const displaced = target && target.songId !== songId ? target.songId : null;
    return commit(ok({ displaced, movedFrom: existing ? { area: existing.area, index: existing.index } : null }));
  }

  // 판정 전 자리에서 뺀다. 바구니는 판별이 담은 자리라 빼지 않는다(손으로 돌아와도 갈 곳이 바구니뿐이다).
  function unplace(w, area, index) {
    const blocked = areaBlocked(w, area, index);
    if (blocked) return no(blocked);
    if (area === 'basket') return no('auto-basket');
    const pl = p.wings[w].placements;
    const slot = pl[area][index];
    if (!slot) return no('empty');
    if (slot.fixed) return no('fixed');
    pl[area][index] = null;
    return commit(ok({ songId: slot.songId }));
  }

  // 판정(spec 6). 모든 자리가 찼을 때만 한다. 틀린 노래만 돌려보내고(자리 비움) 맞은 노래는 고정한다.
  // 돌아온 노래 하나 = 오답 하나. 관 오답이 기준 이상이 된 뒤로 오답마다 수첩 도움 신호를 낸다.
  function judge(w, area) {
    const blocked = areaBlocked(w, area);
    if (blocked) return no(blocked);
    const ws = p.wings[w];
    const slots = ws.placements[area];
    const r = judgeArea({ table, wingId: w, area, slots });
    if (!r.judged) return no('not-full');

    const fixed = [];
    for (const res of r.results) {
      if (res.correct && !slots[res.index].fixed) {
        slots[res.index].fixed = true;
        fixed.push(res.songId);
      }
    }
    const returned = r.wrong.map((x) => ({ ...x }));
    for (const x of returned) {
      slots[x.index] = null;
      ws.wrongCount += 1;
      const target = wrongTarget(w, area, x);
      x.target = target;
      // 수첩은 대상 갈래 쪽의 어긋나는 개념으로 반짝인다(노래 갈래 쪽이 아니다)
      if (ws.wrongCount >= T.wingWrongHelp) {
        emit('help:notebook-glow', { wing: w, genre: targetGenre(target), conceptIds: targetHelp(x.songId, target, measuredAction(w, x.songId)), songId: x.songId });
      }
    }

    const out = { judged: true, allCorrect: r.allCorrect, returned, fixed };
    if (area === 'shelf' && r.allCorrect) {
      ws.shelfBound = true;
      confirmSongs(slots.map((s) => s.songId));
      for (const s of slots) grantKeepsake(s.songId);
      out.bound = true;
    }
    if (area === 'basket') {
      // 맞은 길 잃은 노래는 그 자리에서 보내진다(spec 20). 판정을 통과했으므로 자기 갈래 개념을 확인한다.
      out.routes = [];
      for (const songId of fixed) {
        const slot = slots.find((s) => s?.songId === songId);
        const route = routeStray({ table, songId, to: slot.to, wingStates: wingStates() });
        const bucket = route.kind === 'prewait' ? p.prewaiting : p.returned;
        bucket[route.wing] ??= [];
        if (!bucket[route.wing].includes(songId)) bucket[route.wing].push(songId);
        confirmSong(songId);
        out.routes.push({ songId, ...route });
      }
      if (r.allCorrect) { ws.basketDone = true; out.passed = true; }
    }
    if (area === 'bonus' && r.allCorrect) {
      ws.bonusDone = true;
      confirmSongs(slots.map((s) => s.songId));
      for (const s of slots) grantKeepsake(s.songId);
      out.bound = true;
    }
    checkWingDone(w);
    return commit(ok(out));
  }

  // 작품 방의 문은 칸이 묶이는 순간 열린다(spec 6.5).
  const isRoomOpen = (w) => wingOk(w) && p.wings[w].shelfBound;

  // 작품 방을 마침. 방 도중의 상태는 저장하지 않으므로 도중에 나가면 처음부터 다시 한다(spec 20).
  function completeRoom(w, record) {
    if (!wingOk(w)) return no('bad-wing');
    if (isCompleted()) return no('completed');
    const ws = p.wings[w];
    if (ws.state === 'locked') return no('locked');
    if (!ws.shelfBound) return no('not-bound');
    if (ws.roomDone) return no('done');
    if (!isObj(record)) return no('invalid');
    p.rooms[w] = clone(record);
    ws.roomDone = true;
    confirmSong(table.wings[w].room);
    checkWingDone(w);
    return commit(ok());
  }

  // ───────────── 보스 ─────────────

  const isBossOpen = () => PLAY_WING_IDS.every((w) => p.wings[w].state === 'done');
  const unseenOrder = () => (table.boss.unseenOrder ?? []).map((g) => table.boss.unseen[g]);

  // 1단계에서 지금 차례인 낯선 노래(정해진 순서, 무작위 없음)
  function currentUnseen() {
    if (p.boss.state !== 'stage1') return null;
    return unseenOrder().find((id) => !p.boss.unseen[id]?.done) ?? null;
  }

  function bossWrong(stage, conceptIds, songId) {
    p.boss.stageWrong += 1;
    if (p.boss.stageWrong < T.bossWrongHelp) return false;
    const detail = { stage, conceptIds };
    if (songId) detail.songId = songId;
    emit('help:journal-glow', detail);
    return true;
  }

  function nextStage(state) {
    p.boss.state = state;
    p.boss.stageWrong = 0;
    pendingSinger = null;
    stage2Found.clear();
  }

  // 보스에 들어감(다시 들어옴). 진행 중이던 노래와 2단계는 처음부터, 마친 단계와 노래 기록은 그대로.
  function enterBoss() {
    if (isCompleted()) return no('completed');
    if (!isBossOpen()) return no('boss-locked');
    if (p.boss.state === 'done') return no('done');
    if (p.boss.state === 'locked') p.boss.state = 'stage1';
    pendingSinger = null;
    stage2Found.clear();
    return commit(ok({ stage: p.boss.state, songId: currentUnseen() }));
  }

  function leaveBoss() {
    pendingSinger = null;
    stage2Found.clear();
    return ok();
  }

  // 1단계: 낯선 노래를 관 자리에 꽂으면 바로 판정한다. 처음 꽂은 결과를 '처음에 맞혔는지'로 남긴다.
  // 같은 단계 오답이 기준 이상이면 일지가 반짝이고 그 노래에 '일지 도움'을 남긴다.
  // actions: 그 노래를 잴 때 학생이 실제로 쓴 도구(고유 동작 id 목록). 일지 도움의 개념은 꽂은 자리 갈래의 개념 가운데
  // 접기·두드리기와 이 도구들의 증거에 어긋나는 것만 싣는다(쓰지 않은 도구로 알 수 있는 것은 알려 주지 않는다).
  function bossPlaceUnseen(songId, wingId, { actions = [] } = {}) {
    if (isCompleted()) return no('completed');
    if (p.boss.state !== 'stage1') return no('wrong-stage');
    if (songId !== currentUnseen()) return no('not-current');
    if (pendingSinger === songId) return no('placed');
    if (!wingOk(wingId)) return no('bad-wing');
    const rec = p.boss.unseen[songId];
    const correct = judgeUnseenPlacement({ table, songId, wingId });
    if (rec.firstTryCorrect === null) rec.firstTryCorrect = correct;
    let help = false;
    if (correct) pendingSinger = songId;
    else if (bossWrong(1, targetHelp(songId, { genre: wingById(wingId).genre }, actions), songId)) { rec.journalHelp = true; help = true; }
    return commit(ok({ correct, help }));
  }

  // 1단계 '누가 불렀을까?': 맞았는지만 남기고, 틀려도 정답 무리를 알려 주고 다음 노래로 간다.
  function bossChooseSinger(songId, groupId) {
    if (isCompleted()) return no('completed');
    if (p.boss.state !== 'stage1') return no('wrong-stage');
    if (pendingSinger !== songId) return no('not-placed');
    if (!SINGER_GROUP_IDS.includes(groupId)) return no('invalid');
    const song = songMap.get(songId);
    const correct = judgeSingerGroup(song, groupId);
    const rec = p.boss.unseen[songId];
    rec.singerGroupCorrect = correct;
    rec.done = true;
    pendingSinger = null;
    if (Object.values(p.boss.unseen).every((u) => u.done)) nextStage('stage2');
    return commit(ok({ correct, answer: [...(song?.singerGroups ?? [])], stage: p.boss.state }));
  }

  // 2단계: 갈래가 바뀌는 지점 근처가 아닌 곳을 탭하면 틀림(spec 10.1).
  // 박자 방식 { tapMs, switchesMs } 또는 박자 없는 방식 { line, switchLines }.
  // conceptIds: 틀림이 기준을 넘어 일지가 반짝일 때 실을 관련 개념(리믹스를 아는 쪽이 넣는다).
  function bossStage2Tap(input, { conceptIds = [] } = {}) {
    if (isCompleted()) return no('completed');
    if (p.boss.state !== 'stage2') return no('wrong-stage');
    let idx;
    let total;
    if (isObj(input) && 'line' in input) {
      if (!Array.isArray(input.switchLines) || !input.switchLines.length) return no('invalid');
      idx = judgeRemixLine(input.line, input.switchLines);
      total = input.switchLines.length;
    } else if (isObj(input) && typeof input.tapMs === 'number' && Array.isArray(input.switchesMs) && input.switchesMs.length) {
      idx = judgeRemixTap(input.tapMs, input.switchesMs, T.remixWindow);
      total = input.switchesMs.length;
    } else {
      return no('invalid');
    }
    if (idx === null) {
      const help = bossWrong(2, [...conceptIds]);
      return commit(ok({ wrong: true, help }));
    }
    stage2Found.add(idx);
    if (stage2Found.size < total) return ok({ wrong: false, found: idx, complete: false });
    nextStage('stage3');
    return commit(ok({ wrong: false, found: idx, complete: true }));
  }

  // 3단계: 좀 대왕이 삼킨 노래를 다시 재어 시조 자리에 꽂으면 보스를 마친다.
  // 3단계도 1단계처럼 꽂은 자리 갈래의 어긋나는 개념을 싣는다(actions: 쓴 도구).
  function bossPlaceStage3(wingId, { actions = [] } = {}) {
    if (isCompleted()) return no('completed');
    if (p.boss.state !== 'stage3') return no('wrong-stage');
    if (!wingOk(wingId)) return no('bad-wing');
    if (!judgeStage3Placement({ table, wingId })) {
      const help = bossWrong(3, targetHelp(table.boss.stage3SongId, { genre: wingById(wingId).genre }, actions), table.boss.stage3SongId);
      return commit(ok({ correct: false, help }));
    }
    nextStage('done');
    return commit(ok({ correct: true }));
  }

  // ───────────── 엔딩 ─────────────

  // 자기 노래 한 줄(1~40자), 꽂을 관, 그 관 갈래의 먹 개념 하나, 한마디(0~60자). 채점하지 않는다.
  // 글은 이름처럼 NFC로 맞추고 앞뒤 공백을 뺀 뒤 글자 단위로 센다(cleanText·graphemeCount).
  function completeEnding({ line, wing, conceptId, note = '' } = {}) {
    if (isCompleted()) return no('completed');
    if (p.boss.state !== 'done') return no('boss-not-done');
    const lineT = typeof line === 'string' ? cleanText(line) : '';
    const lineLen = charLength(lineT);
    if (lineLen < T.endingLineMin || lineLen > T.endingLineMax) return no('line-length');
    if (note !== null && note !== undefined && typeof note !== 'string') return no('note-length');
    const noteT = cleanText(note ?? '');
    if (charLength(noteT) > T.endingNoteMax) return no('note-length');
    if (!wingOk(wing)) return no('bad-wing');
    const concept = conceptById(conceptId);
    if (!concept || concept.genre !== wingById(wing).genre) return no('bad-concept');
    if (p.concepts[conceptId].state !== 'ink') return no('not-ink');
    p.ending = { line: lineT, wing, conceptId, note: noteT, completed: true, completedAt: iso() };
    return commit(ok());
  }

  // ───────────── 이어 하기 ─────────────

  // 다시 열었을 때 어디서 시작할지(spec 20). room: 'restart'면 작품 방을 처음부터 한다.
  function resumeInfo() {
    if (isCompleted()) return { scene: 'complete' };
    if (!p.tutorialDone) return { scene: 'entrance' };
    if (['stage1', 'stage2', 'stage3'].includes(p.boss.state)) return { scene: 'boss', stage: p.boss.state, songId: currentUnseen() };
    if (p.boss.state === 'done') return { scene: 'ending' };
    const w = PLAY_WING_IDS.find((x) => p.wings[x].state === 'open');
    if (w) return { scene: 'wing', wing: w, room: p.wings[w].shelfBound && !p.wings[w].roomDone ? 'restart' : null };
    return { scene: 'entrance' };
  }

  return Object.freeze({
    get progress() { return p; },
    wingState: (w) => p.wings[w]?.state ?? null,
    canEnter: (w) => wingOk(w) && p.wings[w].state !== 'locked',
    conceptState: (c) => p.concepts[c]?.state ?? 'none',
    isBossOpen,
    isCompleted,
    isRoomOpen,
    isMeasured,
    isDecided,
    isRevealed,
    marksKnown,
    waitingAt,
    returnedAt,
    currentUnseen,
    resumeInfo,
    finishTutorialMeasure,
    completeTutorial,
    markUniqueActionIntroSeen,
    markMeasured,
    decideGenre,
    place,
    unplace,
    judge,
    completeRoom,
    enterBoss,
    leaveBoss,
    bossPlaceUnseen,
    bossChooseSinger,
    bossStage2Tap,
    bossPlaceStage3,
    completeEnding,
  });
}

// 저장 엔진의 기록 하나에 진행 엔진을 붙인다. 행동마다 기록의 updatedAt을 고치고 저장한다.
// 고르면서 저장소의 최신 값으로 새로 읽으므로(save.js selectRecord) 기록 객체는 고른 뒤에 받는다.
export function openRecord(store, recordId, opts = {}) {
  if (!store.getRecord(recordId)) return null;
  store.selectRecord(recordId);
  const record = store.getRecord(recordId);
  if (!record) return null;
  return createProgress({ ...opts, progress: record.progress, save: () => store.touchRecord(recordId) });
}
