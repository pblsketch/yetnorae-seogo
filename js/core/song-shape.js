// 노래 데이터의 모양을 읽는 도우미. DOM 없이 Node에서도 바로 쓴다.
// 노래 데이터 형식은 js/data/README.md의 '노래 데이터 형식' 절이 기준이고,
// 여기 있는 함수는 그 약속을 코드로 옮긴 것이다(재기 화면, 소리, 검증기가 함께 쓴다).

// 조정 가능한 기준값(spec 4.4, 22절)
export const GASA_FOUR_FOOT_MIN_RATIO = 0.8;   // 가사: 4음보 행이 이 비율 이상
export const GORYEO_THREE_FOOT_MIN_RATIO = 0.8; // 고려가요 'goryeo-3beat': 3음보 줄이 이 비율 이상
export const HYANGGA_GU_COUNTS = [4, 8, 10];
export const HYANGGA_TEN_GROUPING = [4, 4, 2];

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);

// 글자 수(음절 수). 완성형 한글, 한자, 옛한글 첫소리 자모(음절의 시작)를 한 글자로 센다.
export function syllableCount(text) {
  let n = 0;
  for (const ch of String(text ?? '')) {
    const c = ch.codePointAt(0);
    if ((c >= 0xac00 && c <= 0xd7a3)
      || (c >= 0x1100 && c <= 0x115f) || (c >= 0xa960 && c <= 0xa97f)
      || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0xf900 && c <= 0xfaff)) n++;
  }
  return n;
}

// 비교용으로 글자를 고른다: 정규화(NFC)하고 공백을 모두 뺀다.
export function squash(text) {
  return String(text ?? '').normalize('NFC').replace(/\s+/g, '');
}

// ── 음보 표시(고려가요, js/data/README.md '추가 제안(T31)') ──
// 고려가요 음보에는 박에 들지 않는 조각이 있다. 낭송은 하지만 두드리지 않고, 음보 수에도 세지 않는다.
//  kind: 'yeoeum'(여음: 뜻 없는 소리) · 'refrain'(후렴) · 'repeat'(여음 앞에 미리 불러 두는 되풀이 머리)
// joined: true면 앞 음보와 한 낱말이다(낱말 안에서 3·3·2로 나눈 곳, 예: '가시리 / 잇고'). 글을 이을 때 띄우지 않는다.
export const OFFBEAT_KINDS = ['yeoeum', 'refrain', 'repeat'];
export const REFRAIN_FOOT_KINDS = ['yeoeum', 'refrain'];

// 박에 드는 음보인가(표시가 없으면 박에 든다)
export const isMetricFoot = (f) => !f?.kind;

// 음보들을 한 줄 글로 잇는다. joined인 음보 앞은 띄우지 않는다. layer: 'original' | 'reading'
export function joinFeet(feet, layer = 'original') {
  let out = '';
  arr(feet).forEach((f, i) => {
    if (i > 0 && !f?.joined) out += ' ';
    out += f?.[layer] ?? '';
  });
  return out;
}

// 고려가요 연의 줄을 모두 펼친다: [{ unit, line, feet, gloss }]
export function goryeoLines(song) {
  const out = [];
  arr(song?.units).forEach((u, unit) => arr(u?.lines).forEach((l, line) => out.push({ unit, line, feet: arr(l?.feet), gloss: l?.gloss })));
  return out;
}

// 단위마다 음보 수. 향가는 음보가 없으므로 null.
// 고려가요는 [[줄마다 박에 드는 음보 수], …](여음·후렴·되풀이 머리는 세지 않는다. 후렴만 있는 줄은 0), 나머지는 [단위마다 음보 수].
export function feetCounts(song) {
  if (song?.genre === 'hyangga') return null;
  if (song?.genre === 'goryeo') return arr(song.units).map((u) => arr(u?.lines).map((l) => arr(l?.feet).filter(isMetricFoot).length));
  return arr(song?.units).map((u) => arr(u?.feet).length);
}

// 고려가요에서 여음·후렴으로 표시한 음보 수(되풀이 머리는 빼고). 다른 갈래는 0.
export function refrainFootCount(song) {
  if (song?.genre !== 'goryeo') return 0;
  return arr(song.units).reduce((n, u) => n + arr(u?.lines).reduce((m, l) => m + arr(l?.feet).filter((f) => REFRAIN_FOOT_KINDS.includes(f?.kind)).length, 0), 0);
}

// 노래의 한 층(layer) 글을 모두 이어 붙인다.
// layer: 'original' | 'reading' | 'gloss' | 'decipherment'(향가만)
export function songText(song, layer) {
  const parts = [];
  for (const u of arr(song?.units)) {
    if (song.genre === 'hyangga') {
      parts.push(u?.[layer] ?? '');
    } else if (song.genre === 'goryeo') {
      for (const l of arr(u?.lines)) {
        if (layer === 'gloss') parts.push(l?.gloss ?? '');
        else parts.push(joinFeet(l?.feet, layer));
      }
    } else if (layer === 'gloss') {
      parts.push(u?.gloss ?? '');
    } else {
      parts.push(arr(u?.feet).map((f) => f?.[layer] ?? '').join(' '));
    }
  }
  return parts.join('\n');
}

// 낭송 조각 경로(spec 15). 번호는 모두 0부터 센다.
//  향가: assets/audio/voice/<노래 id>/<구 번호>.mp3
//  고려가요: assets/audio/voice/<노래 id>/<연 번호>-<줄 번호>-<음보 번호>.mp3
//  시조·사설시조·가사: assets/audio/voice/<노래 id>/<단위 번호>-<음보 번호>.mp3
export function voiceClipPath(songId, unit, line = null, foot = null) {
  const base = 'assets/audio/voice/' + songId + '/';
  if (foot === null) return base + unit + '.mp3';
  if (line === null) return base + unit + '-' + foot + '.mp3';
  return base + unit + '-' + line + '-' + foot + '.mp3';
}

// 노래 한 편의 낭송 조각 목록(재생 순서). [{ path, unit, line, foot, text }]
export function voiceClips(song) {
  const out = [];
  arr(song?.units).forEach((u, unit) => {
    if (song.genre === 'hyangga') out.push({ path: voiceClipPath(song.id, unit), unit, line: null, foot: null, text: u?.reading });
    else if (song.genre === 'goryeo') arr(u?.lines).forEach((l, line) => arr(l?.feet).forEach((f, foot) => out.push({ path: voiceClipPath(song.id, unit, line, foot), unit, line, foot, text: f?.reading })));
    else arr(u?.feet).forEach((f, foot) => out.push({ path: voiceClipPath(song.id, unit, null, foot), unit, line: null, foot, text: f?.reading }));
  });
  return out;
}

// 종장(마지막 장) 첫 음보의 글자 수. 장이 아닌 갈래나 음보가 없으면 null.
export function finalFirstFootSyllables(song) {
  if (song?.genre !== 'sijo' && song?.genre !== 'saseol') return null;
  const units = arr(song.units);
  const first = arr(units[units.length - 1]?.feet)[0];
  return first ? syllableCount(first.reading) : null;
}

function sameArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

// features와 units에서 나올 수 있는 개념 id 집합(spec 7.1). 노래의 evidences는 이 집합의 부분집합이어야 한다.
export function deriveConcepts(song) {
  const out = new Set();
  const units = arr(song?.units);
  const n = units.length;
  const f = song?.features ?? {};
  const counts = feetCounts(song);
  switch (song?.genre) {
    case 'hyangga': {
      if (HYANGGA_GU_COUNTS.includes(n)) out.add('hyangga-lines');
      const grouped = n === 10 && sameArray(f.grouping, HYANGGA_TEN_GROUPING);
      if (grouped) out.add('hyangga-442');
      const ex = f.exclamation;
      if (grouped && ex && ex.unit === 8 && isStr(ex.text) && String(units[8]?.reading ?? '').trim().startsWith(ex.text.trim())) out.add('hyangga-exclaim');
      break;
    }
    case 'goryeo': {
      if (n >= 2) out.add('goryeo-stanza');
      if (arr(f.refrains).length >= 1) out.add('goryeo-refrain');
      // 박에 드는 음보가 있는 줄만 센다(후렴만 있는 줄은 듣기만 하는 줄이다)
      const lines = counts.flat().filter((c) => c > 0);
      if (lines.length && lines.filter((c) => c === 3).length / lines.length >= GORYEO_THREE_FOOT_MIN_RATIO) out.add('goryeo-3beat');
      break;
    }
    case 'sijo': {
      if (n === 3) {
        out.add('sijo-3jang');
        if (counts.every((c) => c === 4)) out.add('sijo-4beat');
        if (finalFirstFootSyllables(song) === 3) out.add('sijo-final3');
      }
      break;
    }
    case 'gasa': {
      if (n >= 4) {
        out.add('gasa-nolimit');
        if (counts.filter((c) => c === 4).length / n >= GASA_FOUR_FOOT_MIN_RATIO) out.add('gasa-4beat');
      }
      break;
    }
    case 'saseol': {
      if (n === 3) {
        if (counts[0] > 4 || counts[1] > 4) out.add('saseol-middle');
        if (finalFirstFootSyllables(song) === 3) out.add('saseol-frame');
      }
      break;
    }
    default:
  }
  return out;
}

// ── 재기의 증거(감정서)를 노래 데이터에서 계산한다 ──
// 재기는 노래가 실제로 가진 모양대로 이끌기 때문에(spec 5.1), 다 잰 감정서는 언제나 이 값과 같다.

// 접기: 단위 수
export function deriveFoldEvidence(song) {
  return { units: arr(song?.units).length };
}

// 두드리기(빗금 모드도 같음): 향가는 구 수, 고려가요는 연마다 줄마다 박에 드는 음보 수와 여음·후렴 음보 수,
// 나머지는 단위마다 음보 수
export function deriveTapEvidence(song) {
  if (song?.genre === 'hyangga') return { mode: 'gu', gu: arr(song.units).length };
  if (song?.genre === 'goryeo') return { mode: 'lines', feet: feetCounts(song), refrains: refrainFootCount(song) };
  return { mode: 'feet', feet: feetCounts(song) };
}

// 고유 동작의 증거(spec 5.4). applicable이 false면 '해당 없음'이며, 그것도 증거다.
export function deriveActionEvidence(actionId, song) {
  const units = arr(song?.units);
  const f = song?.features ?? {};
  switch (actionId) {
    case 'aa-door': {
      const ex = f.exclamation ?? null;
      return { action: actionId, applicable: true, present: !!ex, unit: ex ? ex.unit : null };
    }
    case 'refrain-link': {
      const refrains = arr(f.refrains);
      return { action: actionId, applicable: true, present: refrains.length > 0, ranges: refrains.flatMap((r) => arr(r.ranges)) };
    }
    case 'stairs': {
      const syllables = finalFirstFootSyllables(song);
      return { action: actionId, applicable: syllables !== null, syllables };
    }
    case 'walk': {
      return { action: actionId, applicable: true, steps: units.length, stopsAtThree: units.length === 3 };
    }
    case 'rapid-unroll': {
      const hasMiddle = units.length === 3 && (song.genre === 'sijo' || song.genre === 'saseol');
      const middleFeet = hasMiddle ? arr(units[1]?.feet).length : null;
      return { action: actionId, applicable: hasMiddle, middleFeet, overFour: hasMiddle ? middleFeet > 4 : null };
    }
    default:
      throw new Error('알 수 없는 고유 동작: ' + actionId);
  }
}

// 감정서 한 장: 접기, 두드리기, 그 관의 고유 동작
export function deriveSheet(song, actionId) {
  return { songId: song.id, fold: deriveFoldEvidence(song), tap: deriveTapEvidence(song), action: deriveActionEvidence(actionId, song) };
}
