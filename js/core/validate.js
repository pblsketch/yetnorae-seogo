// 데이터 검증기. DOM 없이 Node에서 바로 import한다.
// 무엇을 지켜야 하는지는 js/data/README.md(노래 데이터 형식, 노래 표, 리믹스, 수첩)와 spec 4.4·7.3이 기준이다.
// 모든 함수는 오류 목록 [{ code, where, message }]을 돌려준다. 빈 목록이면 통과다.
//
// 오류 코드
//  FIELD       필드가 없거나 값이 약속한 집합 밖이다
//  FORM        갈래 형식 규칙(spec 4.4)을 어긴다
//  EVIDENCE    evidences가 features·units에서 나오지 않는다(형식이 맞는 노래만 본다)
//  KEEPSAKE    기념품 물건·구절이 노래 글에 없다
//  CITATION    citation 또는 verification이 없다
//  TABLE       노래가 노래 표(spec 4.2)와 어긋난다(모르는 id, 갈래, 제목, 역할, 행선지, 향가 층)
//  ROUTING     행선지 결과 목록이 행선지 규칙(spec 4.3)과 어긋난다
//  TABLE_SHAPE 노래 표 자체가 spec 4.2의 모양과 어긋난다
//  MISSING     갈래의 노래가 있는데 그 갈래의 표 노래 가운데 빠진 것이 있다
//  DUPLICATE   같은 id의 노래가 둘 이상이다
//  INK         반드시 지나는 길만으로 먹이 될 수 없는 개념이 있다(spec 7.3)
//  REMIX       리믹스 데이터 형식 위반
//  NOTEBOOK    수첩 쪽 형식 위반

import { GENRES, GENRE_IDS, PLAY_WING_IDS, BOSS_PLACE_ID, wingById, wingOfGenre } from '../data/wings.js';
import { CONCEPTS, CONCEPT_IDS, SINGER_GROUP_IDS, SINGER_CLASSES } from '../data/concepts.js';
import {
  GASA_FOUR_FOOT_MIN_RATIO, HYANGGA_GU_COUNTS, HYANGGA_TEN_GROUPING,
  deriveConcepts, feetCounts, finalFirstFootSyllables, songText, squash,
} from './song-shape.js';

export const SOURCE_TYPES = ['textbook-common2', 'textbook-literature', 'old-text', 'exam'];
export const VERIFICATION_VALUES = ['verified', 'pending'];
export const ROLE_IDS = ['tutorial', 'shelf', 'stray', 'room', 'bonus', 'unseen'];
export const REFRAIN_KINDS = ['refrain', 'yeoeum'];
export const SONG_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SONG_KEYS = new Set([
  'id', 'title', 'genre', 'excerpt', 'singer', 'sourceType', 'citation', 'citationNote', 'verification',
  'decipherment', 'units', 'features', 'evidences', 'singerGroups', 'keepsake', 'legend', 'roles', 'tempo', 'cardNote',
]);

// 갈래마다 쓸 수 있는 features 열쇠
const FEATURE_KEYS = {
  hyangga: ['grouping', 'exclamation'],
  goryeo: ['refrains'],
  sijo: ['finalFirstFoot'],
  gasa: [],
  saseol: ['finalFirstFoot', 'stretched'],
};

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isInt = (v) => Number.isInteger(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const err = (code, where, message) => ({ code, where, message });

// ───────────────────────── 노래 한 편 ─────────────────────────

// opts.table이 있으면 노래 표와의 일치(TABLE)도 본다.
export function validateSong(song, opts = {}) {
  const out = [];
  if (!isObj(song)) return [err('FIELD', '?', '노래가 객체가 아니다')];
  const where = isStr(song.id) ? song.id : '(id 없음)';
  const add = (code, message) => out.push(err(code, where, message));

  // 필드
  for (const k of Object.keys(song)) if (!SONG_KEYS.has(k)) add('FIELD', '약속에 없는 필드 ' + k);
  if (!isStr(song.id) || !SONG_ID_PATTERN.test(song.id)) add('FIELD', 'id는 영문 소문자·숫자와 하이픈이어야 한다');
  if (!isStr(song.title) || /[「」]/.test(song.title)) add('FIELD', 'title은 「」 없이 쓴 제목이어야 한다');
  if (!GENRE_IDS.includes(song.genre)) { add('FIELD', 'genre가 ' + GENRE_IDS.join('·') + ' 가운데 하나가 아니다'); return out; }
  if (song.excerpt !== undefined && !isStr(song.excerpt)) add('FIELD', 'excerpt는 비어 있지 않은 글이어야 한다');
  if (song.tempo !== undefined && !(typeof song.tempo === 'number' && song.tempo > 0)) add('FIELD', 'tempo는 양수(1분당 박)여야 한다');
  for (const k of ['cardNote', 'citationNote']) if (song[k] !== undefined && !isStr(song[k])) add('FIELD', k + '는 비어 있지 않은 글이어야 한다');
  if (song.legend !== undefined && typeof song.legend !== 'boolean') add('FIELD', 'legend는 true/false여야 한다');
  validateSinger(song.singer, add);
  if (!SOURCE_TYPES.includes(song.sourceType)) add('FIELD', 'sourceType이 ' + SOURCE_TYPES.join('·') + ' 가운데 하나가 아니다');
  if (song.genre === 'hyangga') {
    if (!isObj(song.decipherment) || !isStr(song.decipherment.scholar) || !isStr(song.decipherment.book)) add('FIELD', '향가는 decipherment { scholar, book }이 있어야 한다');
  } else if (song.decipherment !== undefined) add('FIELD', 'decipherment는 향가에만 쓴다');

  // 출처와 확인 상태
  if (!isStr(song.citation)) add('CITATION', 'citation(출처 문구)이 없다');
  if (!VERIFICATION_VALUES.includes(song.verification)) add('CITATION', 'verification이 verified·pending 가운데 하나가 아니다');

  // 역할과 보스 무리
  const roles = validateRoles(song.roles, add);
  const isUnseen = roles.some((r) => r.role === 'unseen');
  if (isUnseen) {
    if (!Array.isArray(song.singerGroups) || song.singerGroups.length === 0 || !song.singerGroups.every((g) => SINGER_GROUP_IDS.includes(g)) || new Set(song.singerGroups).size !== song.singerGroups.length) {
      add('FIELD', '낯선 노래는 singerGroups에 ' + SINGER_GROUP_IDS.join('·') + ' 가운데 하나 이상을 겹치지 않게 적는다');
    }
  } else if (song.singerGroups !== undefined) add('FIELD', 'singerGroups는 보스 낯선 노래에만 쓴다');

  // 형식
  const features = isObj(song.features) ? song.features : null;
  if (!features) add('FIELD', 'features는 객체여야 한다(없으면 {})');
  else for (const k of Object.keys(features)) if (!FEATURE_KEYS[song.genre].includes(k)) add('FIELD', song.genre + ' 노래의 features에 쓸 수 없는 열쇠 ' + k);
  const formErrors = [];
  validateForm(song, features ?? {}, (m) => formErrors.push(err('FORM', where, m)));
  out.push(...formErrors);

  // 증거 개념
  if (!Array.isArray(song.evidences) || song.evidences.length === 0) add('EVIDENCE', 'evidences는 개념 id가 하나 이상 든 목록이어야 한다');
  else {
    const seen = new Set();
    for (const c of song.evidences) {
      const concept = CONCEPTS.find((x) => x.id === c);
      if (!concept) add('EVIDENCE', '모르는 개념 id ' + c);
      else if (concept.genre !== song.genre) add('EVIDENCE', c + '는 ' + concept.genre + ' 개념이라 ' + song.genre + ' 노래의 증거가 될 수 없다');
      if (seen.has(c)) add('EVIDENCE', '개념 id가 겹친다: ' + c);
      seen.add(c);
    }
    // 형식이 틀린 노래는 형식부터 고친다. 그 뒤에 features에서 나오는지 본다.
    if (formErrors.length === 0) {
      const derivable = deriveConcepts(song);
      for (const c of song.evidences) {
        const concept = CONCEPTS.find((x) => x.id === c);
        if (concept && concept.genre === song.genre && !derivable.has(c)) add('EVIDENCE', c + '는 이 노래의 features·units에서 나오지 않는다');
      }
    }
  }

  // 기념품
  validateKeepsake(song, add);

  // 노래 표
  if (opts.table) out.push(...validateSongAgainstTable(song, opts.table));
  return out;
}

function validateSinger(singer, add) {
  if (!isObj(singer)) { add('FIELD', 'singer { name, class }가 없다'); return; }
  if (!isStr(singer.name)) add('FIELD', "singer.name이 없다(이름이 없으면 '이름 모를 ~')");
  if (!SINGER_CLASSES.includes(singer.class)) add('FIELD', 'singer.class가 ' + SINGER_CLASSES.join(' / ') + ' 가운데 하나가 아니다');
  if (singer.traditional !== undefined && typeof singer.traditional !== 'boolean') add('FIELD', 'singer.traditional은 true/false여야 한다');
  for (const k of Object.keys(singer)) if (!['name', 'class', 'traditional'].includes(k)) add('FIELD', 'singer에 약속에 없는 열쇠 ' + k);
}

function validateRoles(roles, add) {
  if (!Array.isArray(roles) || roles.length === 0) { add('FIELD', 'roles는 하나 이상 있어야 한다'); return []; }
  const ok = [];
  for (const r of roles) {
    if (!isObj(r) || !ROLE_IDS.includes(r.role)) { add('FIELD', '역할이 ' + ROLE_IDS.join('·') + ' 가운데 하나가 아니다'); continue; }
    const placeOk = r.role === 'unseen' ? r.wing === BOSS_PLACE_ID
      : r.role === 'tutorial' ? r.wing === 'entrance'
        : PLAY_WING_IDS.includes(r.wing);
    if (!placeOk) add('FIELD', r.role + ' 역할의 자리(wing) ' + r.wing + '가 맞지 않다');
    if (r.role === 'stray') { if (!PLAY_WING_IDS.includes(r.to)) add('FIELD', '길 잃은 노래는 도착할 관(to)을 적는다'); } else if (r.to !== undefined) add('FIELD', 'to는 길 잃은 노래에만 쓴다');
    for (const k of Object.keys(r)) if (!['wing', 'role', 'to'].includes(k)) add('FIELD', '역할에 약속에 없는 열쇠 ' + k);
    ok.push(r);
  }
  return ok;
}

// 음보 하나: { original, reading }
function checkFeet(feet, label, form) {
  if (!Array.isArray(feet) || feet.length === 0) { form(label + '에 음보 표시가 없다'); return; }
  feet.forEach((f, i) => {
    if (!isObj(f) || !isStr(f.original) || !isStr(f.reading)) form(label + ' ' + (i + 1) + '번째 음보에 original·reading이 없다');
  });
}

function validateForm(song, f, form) {
  const units = Array.isArray(song.units) ? song.units : null;
  if (!units || units.length === 0) { form('units가 비어 있다'); return; }
  const n = units.length;
  switch (song.genre) {
    case 'hyangga': {
      if (!HYANGGA_GU_COUNTS.includes(n)) form('향가는 4구, 8구, 10구 가운데 하나여야 한다(지금 ' + n + '구)');
      units.forEach((u, i) => {
        for (const k of ['original', 'decipherment', 'reading', 'gloss']) if (!isStr(u?.[k])) form((i + 1) + '구에 ' + k + '가 없다');
        if (u?.feet !== undefined || u?.lines !== undefined) form((i + 1) + '구: 향가 구에는 음보·줄을 두지 않는다');
      });
      if (n === 10) {
        if (JSON.stringify(f.grouping) !== JSON.stringify(HYANGGA_TEN_GROUPING)) form('10구체는 features.grouping이 [4,4,2]여야 한다');
      } else if (f.grouping !== undefined) form('grouping은 10구체에만 쓴다');
      if (f.exclamation !== undefined && f.exclamation !== null) {
        const ex = f.exclamation;
        if (n !== 10) form('감탄사(exclamation)는 10구체에만 표시한다');
        else if (!isObj(ex) || ex.unit !== 8 || !isStr(ex.text)) form('감탄사는 { unit: 8, text } — 마지막 무리(9구)의 첫머리여야 한다');
        else if (!String(units[8]?.reading ?? '').trim().startsWith(ex.text.trim())) form('감탄사 글자 ' + ex.text + '가 9구 reading의 첫머리에 없다');
      }
      break;
    }
    case 'goryeo': {
      units.forEach((u, i) => {
        if (!Array.isArray(u?.lines) || u.lines.length === 0) { form((i + 1) + '연에 줄(lines)이 없다'); return; }
        if (u.feet !== undefined) form((i + 1) + '연: 고려가요는 음보를 줄마다 적는다');
        u.lines.forEach((l, j) => {
          checkFeet(l?.feet, (i + 1) + '연 ' + (j + 1) + '줄', form);
          if (!isStr(l?.gloss)) form((i + 1) + '연 ' + (j + 1) + '줄에 gloss가 없다');
        });
      });
      const refrains = f.refrains;
      if (!Array.isArray(refrains) || refrains.length === 0) form('고려가요는 후렴구나 여음 구간(features.refrains)이 하나 이상 있어야 한다');
      else refrains.forEach((r, k) => {
        if (!isObj(r) || !REFRAIN_KINDS.includes(r.kind) || !isStr(r.text) || !Array.isArray(r.ranges) || r.ranges.length === 0) {
          form('refrains[' + k + ']는 { kind: refrain|yeoeum, text, ranges: [하나 이상] }이어야 한다'); return;
        }
        for (const g of r.ranges) {
          const feet = units[g?.unit]?.lines?.[g?.line]?.feet;
          if (!isInt(g?.unit) || !isInt(g?.line) || !isInt(g?.from) || !isInt(g?.to) || !Array.isArray(feet) || g.from < 0 || g.from > g.to || g.to >= feet.length) {
            form('refrains[' + k + ']의 구간 ' + JSON.stringify(g) + '이 노래 밖을 가리킨다');
          }
        }
      });
      break;
    }
    case 'sijo':
    case 'saseol': {
      const name = song.genre === 'sijo' ? '시조' : '사설시조';
      if (n !== 3) form(name + '는 3장이어야 한다(지금 ' + n + '장)');
      units.forEach((u, i) => {
        checkFeet(u?.feet, (i + 1) + '장', form);
        if (!isStr(u?.gloss)) form((i + 1) + '장에 gloss가 없다');
      });
      const counts = feetCounts(song);
      if (song.genre === 'sijo' && counts.some((c) => c !== 4)) form('시조는 장마다 4음보여야 한다(지금 ' + counts.join('·') + ')');
      const syl = finalFirstFootSyllables(song);
      if (syl !== 3) form('종장 첫 음보는 3음절이어야 한다(지금 ' + syl + ')');
      if (!isObj(f.finalFirstFoot) || f.finalFirstFoot.syllables !== syl) form('features.finalFirstFoot.syllables가 종장 첫 음보 글자 수(' + syl + ')와 다르다');
      if (song.genre === 'saseol' && n === 3) {
        if (!(counts[0] > 4 || counts[1] > 4)) form('사설시조는 초장이나 중장 가운데 하나 이상이 4음보보다 길어야 한다(지금 ' + counts.join('·') + ')');
        const longer = counts.map((c, i) => (c > 4 ? i : -1)).filter((i) => i >= 0);
        if (JSON.stringify(f.stretched) !== JSON.stringify(longer)) form('features.stretched는 4음보보다 긴 장 번호 목록 ' + JSON.stringify(longer) + '이어야 한다');
      }
      break;
    }
    case 'gasa': {
      if (n < 4) form('가사는 행이 넷 이상이어야 한다(지금 ' + n + '행)');
      units.forEach((u, i) => {
        checkFeet(u?.feet, (i + 1) + '행', form);
        if (!isStr(u?.gloss)) form((i + 1) + '행에 gloss가 없다');
      });
      const counts = feetCounts(song);
      const ratio = counts.filter((c) => c === 4).length / n;
      if (ratio < GASA_FOUR_FOOT_MIN_RATIO) form('가사는 4음보 행이 ' + Math.round(GASA_FOUR_FOOT_MIN_RATIO * 100) + '% 이상이어야 한다(지금 ' + Math.round(ratio * 100) + '%)');
      break;
    }
    default:
  }
}

function validateKeepsake(song, add) {
  const k = song.keepsake;
  if (!isObj(k) || !['name', 'word', 'phrase', 'classLine'].every((x) => isStr(k[x]))) {
    add('KEEPSAKE', 'keepsake { name, word, phrase, classLine }이 모두 있어야 한다'); return;
  }
  for (const x of Object.keys(k)) if (!['name', 'word', 'phrase', 'classLine'].includes(x)) add('KEEPSAKE', 'keepsake에 약속에 없는 열쇠 ' + x);
  // 물건 낱말은 원문(향가는 해독문 포함)이나 풀이에 실제로 나와야 한다.
  const wordHome = [songText(song, 'original'), songText(song, 'gloss')];
  if (song.genre === 'hyangga') wordHome.push(songText(song, 'decipherment'));
  const word = squash(k.word);
  if (!wordHome.some((t) => squash(t).includes(word))) add('KEEPSAKE', '기념품 물건 ' + k.word + '가 원문이나 풀이에 나오지 않는다');
  // 구절은 그 낱말을 품고, 노래 글 어딘가(원문·해독·오늘 소리·풀이)에 그대로 있어야 한다.
  const phrase = squash(k.phrase);
  if (!phrase.includes(word)) add('KEEPSAKE', '기념품 구절에 물건 낱말 ' + k.word + '가 없다');
  const phraseHome = [...wordHome, songText(song, 'reading')];
  if (!phraseHome.some((t) => squash(t).includes(phrase))) add('KEEPSAKE', '기념품 구절 ' + k.phrase + '가 노래 글에 없다');
}

// ───────────────────────── 노래 표 ─────────────────────────

// 노래 표에서 이 노래가 맡아야 하는 역할 목록
export function expectedRoles(table, songId) {
  const roles = [];
  if (table.tutorial === songId) roles.push({ wing: 'entrance', role: 'tutorial' });
  for (const wingId of PLAY_WING_IDS) {
    const w = table.wings?.[wingId];
    if (!w) continue;
    if ((w.shelf ?? []).includes(songId)) roles.push({ wing: wingId, role: 'shelf' });
    for (const s of w.stray ?? []) if (s.songId === songId) roles.push({ wing: wingId, role: 'stray', to: s.to });
    if (w.room === songId) roles.push({ wing: wingId, role: 'room' });
    if ((w.bonus ?? []).includes(songId)) roles.push({ wing: wingId, role: 'bonus' });
  }
  for (const id of Object.values(table.boss?.unseen ?? {})) if (id === songId) roles.push({ wing: BOSS_PLACE_ID, role: 'unseen' });
  return roles;
}

const roleKey = (r) => r.wing + ':' + r.role + (r.to ? '>' + r.to : '');

export function validateSongAgainstTable(song, table) {
  const out = [];
  const where = song?.id ?? '?';
  const entry = table.catalog?.[song?.id];
  if (!entry) return [err('TABLE', where, '노래 표에 없는 노래 id다')];
  if (entry.genre !== song.genre) out.push(err('TABLE', where, '갈래가 노래 표(' + entry.genre + ')와 다르다'));
  if (entry.title !== null && entry.title !== song.title) out.push(err('TABLE', where, '제목이 노래 표(' + entry.title + ')와 다르다'));
  if ((entry.excerpt ?? null) !== (song.excerpt ?? null)) out.push(err('TABLE', where, '발췌 표시(excerpt)가 노래 표(' + (entry.excerpt ?? '없음') + ')와 다르다'));
  const want = expectedRoles(table, song.id).map(roleKey).sort();
  const have = (Array.isArray(song.roles) ? song.roles : []).map((r) => roleKey(r ?? {})).sort();
  if (JSON.stringify(want) !== JSON.stringify(have)) out.push(err('TABLE', where, '역할이 노래 표와 다르다. 표: [' + want.join(', ') + '] 데이터: [' + have.join(', ') + ']'));
  const hw = table.wings?.hyangga;
  const idx = (hw?.shelf ?? []).indexOf(song.id);
  if (idx >= 0 && Array.isArray(hw.shelfFloors) && Array.isArray(song.units) && song.units.length !== hw.shelfFloors[idx]) {
    out.push(err('TABLE', where, '향가관 ' + hw.shelfFloors[idx] + '구 층 노래인데 ' + song.units.length + '구다'));
  }
  return out;
}

// 행선지 규칙(spec 4.3)을 노래 표에 적용한다.
// 도착할 관이 지금 관보다 뒤(아직 마치지 않은 관)이고 그 관의 칸 노래면 미리 잰 대기, 그 밖은 '돌아온 노래' 선반.
export function deriveRouting(table) {
  const prewait = {};
  const returned = {};
  for (const wingId of PLAY_WING_IDS) {
    for (const s of table.wings?.[wingId]?.stray ?? []) {
      const later = (wingById(s.to)?.order ?? -1) > (wingById(wingId)?.order ?? 99);
      const isShelf = (table.wings?.[s.to]?.shelf ?? []).includes(s.songId);
      const bucket = later && isShelf ? prewait : returned;
      (bucket[s.to] ??= []).push(s.songId);
    }
  }
  return { prewait, returned };
}

export function validateRouting(table) {
  const out = [];
  const want = deriveRouting(table);
  for (const kind of ['prewait', 'returned']) {
    const have = table.routing?.[kind] ?? {};
    for (const wingId of new Set([...Object.keys(want[kind]), ...Object.keys(have)])) {
      const a = [...(want[kind][wingId] ?? [])].sort();
      const b = [...(have[wingId] ?? [])].sort();
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        out.push(err('ROUTING', 'routing.' + kind + '.' + wingId, '규칙으로 계산하면 [' + a.join(', ') + ']인데 표에는 [' + b.join(', ') + ']'));
      }
    }
  }
  return out;
}

// 실제 노래 표가 spec 4.2의 모양을 갖췄는지(칸 셋, 길 잃은 노래 둘, 작품 방 하나, 덤 셋, 낯선 노래 다섯 등)
export function validateTableShape(table) {
  const out = [];
  const add = (where, m) => out.push(err('TABLE_SHAPE', where, m));
  const catalog = table.catalog ?? {};
  for (const [id, e] of Object.entries(catalog)) {
    if (!SONG_ID_PATTERN.test(id)) add(id, 'id 형식이 틀렸다');
    if (!GENRE_IDS.includes(e?.genre)) add(id, '갈래가 틀렸다');
    if (e?.title === null ? !isStr(e.pendingSelection) : !isStr(e?.title) || /[「」]/.test(e.title)) add(id, '제목이 없거나 「」가 있다(아직 고르지 않은 노래는 title: null과 pendingSelection)');
  }
  const genreOf = (id) => catalog[id]?.genre;
  const used = new Map(); // id → 쓰인 횟수
  const use = (id, where) => {
    if (!catalog[id]) add(where, '노래 목록에 없는 id ' + id);
    used.set(id, (used.get(id) ?? 0) + 1);
  };

  if (genreOf(table.tutorial) !== 'sijo') add('tutorial', '튜토리얼 노래는 시조여야 한다');
  use(table.tutorial, 'tutorial');

  const wingKeys = Object.keys(table.wings ?? {}).sort();
  if (JSON.stringify(wingKeys) !== JSON.stringify([...PLAY_WING_IDS].sort())) add('wings', '관 다섯(' + PLAY_WING_IDS.join('·') + ')이 모두 있어야 한다');
  for (const wingId of PLAY_WING_IDS) {
    const w = table.wings?.[wingId];
    if (!w) continue;
    const genre = wingById(wingId).genre;
    const inWing = [];
    if (!Array.isArray(w.shelf) || w.shelf.length !== 3) add(wingId, '칸 노래는 셋이어야 한다');
    for (const id of w.shelf ?? []) { use(id, wingId + '.shelf'); inWing.push(id); if (genreOf(id) !== genre) add(wingId, '칸 노래 ' + id + '의 갈래가 관 갈래와 다르다'); }
    if (wingId === 'hyangga') {
      const floors = w.shelfFloors;
      if (!Array.isArray(floors) || JSON.stringify([...floors].sort((a, b) => a - b)) !== JSON.stringify(HYANGGA_GU_COUNTS)) add(wingId, '향가관 shelfFloors는 4·8·10 층을 하나씩 가져야 한다');
    } else if (w.shelfFloors !== undefined) add(wingId, 'shelfFloors는 향가관에만 쓴다');
    if (!Array.isArray(w.stray) || w.stray.length !== 2) add(wingId, '길 잃은 노래는 둘이어야 한다');
    for (const s of w.stray ?? []) {
      use(s.songId, wingId + '.stray'); inWing.push(s.songId);
      if (!PLAY_WING_IDS.includes(s.to) || s.to === wingId) add(wingId, '길 잃은 노래 ' + s.songId + '의 도착할 관이 틀렸다');
      else if (genreOf(s.songId) !== wingById(s.to).genre) add(wingId, '길 잃은 노래 ' + s.songId + '의 갈래가 도착할 관의 갈래와 다르다');
      if (genreOf(s.songId) === genre) add(wingId, '길 잃은 노래 ' + s.songId + '가 이 관과 같은 갈래다');
    }
    if (!isStr(w.room)) add(wingId, '작품 방 노래가 하나 있어야 한다');
    else { use(w.room, wingId + '.room'); inWing.push(w.room); if (genreOf(w.room) !== genre) add(wingId, '작품 방 노래의 갈래가 관 갈래와 다르다'); }
    if (!Array.isArray(w.bonus) || w.bonus.length !== 3) add(wingId, '덤 노래는 셋이어야 한다');
    for (const id of w.bonus ?? []) { use(id, wingId + '.bonus'); inWing.push(id); if (genreOf(id) !== genre) add(wingId, '덤 노래 ' + id + '의 갈래가 관 갈래와 다르다'); }
    if (new Set(inWing).size !== inWing.length) add(wingId, '한 관 안에서 같은 노래가 두 역할을 맡는다');
  }

  const unseen = table.boss?.unseen ?? {};
  if (JSON.stringify(Object.keys(unseen).sort()) !== JSON.stringify([...GENRE_IDS].sort())) add('boss', '낯선 노래는 갈래마다 한 편, 다섯 편이어야 한다');
  for (const [g, id] of Object.entries(unseen)) { use(id, 'boss.unseen'); if (genreOf(id) !== g) add('boss', '낯선 노래 ' + id + '의 갈래가 ' + g + '가 아니다'); }
  const order = table.boss?.unseenOrder ?? [];
  if (JSON.stringify([...order].sort()) !== JSON.stringify([...GENRE_IDS].sort())) add('boss', 'unseenOrder는 다섯 갈래를 한 번씩 담아야 한다');
  else if (JSON.stringify(order.slice(3).sort()) !== JSON.stringify(['saseol', 'sijo'])) add('boss', '시조와 사설시조가 마지막 짝이어야 한다');
  if (table.boss?.stage3SongId !== table.tutorial) add('boss', '3단계 노래는 튜토리얼 노래여야 한다');

  for (const id of Object.keys(catalog)) if (!used.has(id)) add(id, '노래 표 어디에도 쓰이지 않는 노래다');
  return [...out, ...validateRouting(table)];
}

// ───────────────────────── 먹 가능성 ─────────────────────────

// 반드시 지나는 길(튜토리얼, 칸, 길 잃은 노래, 작품 방)의 노래 id 집합
export function mandatorySongIds(table) {
  const ids = new Set([table.tutorial]);
  for (const wingId of PLAY_WING_IDS) {
    const w = table.wings?.[wingId];
    if (!w) continue;
    for (const id of w.shelf ?? []) ids.add(id);
    for (const s of w.stray ?? []) ids.add(s.songId);
    if (w.room) ids.add(w.room);
  }
  return ids;
}

// 갈래 하나의 개념이 모두 먹이 될 수 있는지(spec 7.3). 확인해 주는 서로 다른 노래가 둘 이상이어야 한다.
export function checkInkability(songs, table, genre) {
  const out = [];
  const mandatory = mandatorySongIds(table);
  for (const c of CONCEPTS.filter((x) => x.genre === genre)) {
    const confirming = songs.filter((s) => s.genre === genre && mandatory.has(s.id) && Array.isArray(s.evidences) && s.evidences.includes(c.id)).map((s) => s.id);
    if (new Set(confirming).size < 2) {
      out.push(err('INK', c.id, '반드시 지나는 길에서 이 개념을 확인해 주는 노래가 ' + confirming.length + '편뿐이다(' + confirming.join(', ') + '). 둘 이상이어야 먹이 된다'));
    }
  }
  return out;
}

// ───────────────────────── 리믹스·수첩 ─────────────────────────

export function validateRemix(remix, { songs = [], table }) {
  const out = [];
  const add = (m) => out.push(err('REMIX', 'remix', m));
  if (!isObj(remix) || !Array.isArray(remix.fragments)) { add('remix { fragments: [...] }가 아니다'); return out; }
  const fr = remix.fragments;
  if (fr.length !== 5) add('조각은 다섯이어야 한다(바뀌는 지점 넷)');
  const genres = fr.map((f) => f?.genre);
  if (new Set(genres).size !== genres.length || !genres.every((g) => GENRE_IDS.includes(g))) add('조각의 갈래는 다섯 갈래에서 하나씩이어야 한다');
  fr.forEach((f, i) => {
    if (!isObj(f)) { add((i + 1) + '번째 조각이 객체가 아니다'); return; }
    for (const k of Object.keys(f)) if (!['genre', 'songId', 'from', 'to'].includes(k)) add((i + 1) + '번째 조각에 약속에 없는 열쇠 ' + k);
    const wing = wingOfGenre(f.genre);
    if (!wing || !(table.wings?.[wing.id]?.shelf ?? []).includes(f.songId)) add((i + 1) + '번째 조각 ' + f.songId + '는 ' + f.genre + '관의 칸 노래가 아니다');
    if (!isInt(f.from) || !isInt(f.to) || f.from < 0 || f.from > f.to) add((i + 1) + '번째 조각의 단위 범위가 틀렸다');
    const song = songs.find((s) => s?.id === f.songId);
    if (song && Array.isArray(song.units) && isInt(f.to) && f.to >= song.units.length) add((i + 1) + '번째 조각의 범위가 노래(' + song.units.length + '단위) 밖이다');
  });
  return out;
}

export function validateNotebookPage(page, genre) {
  const out = [];
  const add = (m) => out.push(err('NOTEBOOK', 'notebook.' + genre, m));
  if (!isObj(page)) { add('수첩 쪽이 객체가 아니다'); return out; }
  if (page.genre !== genre) add('genre가 등록된 갈래(' + genre + ')와 다르다');
  if (!isStr(page.name)) add('name이 없다');
  if (!Array.isArray(page.body) || page.body.length === 0 || !page.body.every(isStr)) add('body는 비어 있지 않은 문단 목록이어야 한다');
  if (!Array.isArray(page.lines) || page.lines.length === 0) { add('lines가 하나 이상 있어야 한다'); return out; }
  const ids = new Set();
  for (const l of page.lines) {
    if (!isStr(l?.id) || ids.has(l.id)) add('줄 id가 없거나 겹친다');
    ids.add(l?.id);
    if (!isStr(l?.text)) add('줄 ' + l?.id + '에 text가 없다');
    if (!Array.isArray(l?.conceptIds) || l.conceptIds.length === 0) add('줄 ' + l?.id + '에 conceptIds가 없다');
    else for (const c of l.conceptIds) if (!CONCEPT_IDS.includes(c) || CONCEPTS.find((x) => x.id === c).genre !== genre) add('줄 ' + l.id + '의 개념 ' + c + '가 이 갈래 개념이 아니다');
  }
  return out;
}

// ───────────────────────── 묶음 전체 ─────────────────────────

// set: { songs, remix?, notebook? }. remix가 undefined면 아직 없는 것으로 보고 넘어간다.
// 갈래별 완결성: 노래가 하나도 없는 갈래는 'absent'(아직 없음)로 넘어간다.
// 한 편이라도 있으면 그 갈래의 표 노래가 모두 있어야 하고(MISSING), 모두 있을 때 먹 가능성(INK)을 본다.
export function validateDataSet(set, { table }) {
  const errors = [...validateRouting(table)];
  const songs = Array.isArray(set.songs) ? set.songs : [];
  const ids = new Map();
  for (const s of songs) ids.set(s?.id, (ids.get(s?.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) errors.push(err('DUPLICATE', id, '같은 id의 노래가 ' + n + '편이다'));
  for (const s of songs) errors.push(...validateSong(s, { table }));

  const genres = {};
  for (const g of GENRES) {
    const present = songs.filter((s) => s?.genre === g.id);
    const expected = Object.entries(table.catalog ?? {}).filter(([, e]) => e.genre === g.id).map(([id]) => id);
    if (present.length === 0) { genres[g.id] = { status: 'absent', count: 0, expected: expected.length }; continue; }
    genres[g.id] = { status: 'present', count: present.length, expected: expected.length };
    const missing = expected.filter((id) => !present.some((s) => s.id === id));
    for (const id of missing) errors.push(err('MISSING', id, g.name + ' 노래가 들어와 있는데 표의 이 노래가 없다'));
    if (missing.length === 0) errors.push(...checkInkability(present, table, g.id));
  }

  if (set.remix !== undefined) errors.push(...validateRemix(set.remix, { songs, table }));
  for (const [genre, page] of Object.entries(set.notebook ?? {})) errors.push(...validateNotebookPage(page, genre));
  return { errors, genres };
}

