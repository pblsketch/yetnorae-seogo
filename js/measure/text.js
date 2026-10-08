// 노래를 두루마리에 펼칠 조각(말)으로 나눈다. 화면과 상관없는 계산만 둔다.
// 조각 하나 = 말 하나: { u(단위), l(줄, 고려가요만, 아니면 null), f(음보, 향가는 0), w(음보 안 말 번호), text,
//                       footEnd(음보의 끝 말), kind: 'word' | 'gloss',
//                       mark(박에 들지 않는 음보의 표시 'yeoeum'|'refrain'|'repeat', 아니면 null), markStart(같은 표시가 이어지는 첫 말),
//                       joined(앞 음보와 한 낱말이라 띄우지 않는 첫 말),
//                       unitStart·lineStart·footStart(새 단위·줄·음보의 첫 말), breakBefore(그 앞에서 쪽을 나눌 수 있는 말) }
// 원문·오늘 소리는 음보마다 말로 나누고, 풀이는 단위(고려가요는 줄)마다 말로 나눈다.
// 향가는 구 하나를 음보 하나(f = 0)로 다룬다. 향찰처럼 띄어 쓰지 않은 글은 세 글자씩 끊어 말로 삼는다.
import { genreById } from '../data/wings.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const HANJA_CHUNK = 3;

// 글자 묶음(화면에 한 글자로 보이는 단위)으로 나눈다. 옛한글은 첫소리·가운뎃소리·끝소리 자모가
// 따로 된 코드 포인트라서 코드 포인트로 자르면 'ᄂᆞᆫ'이 'ᄂ', 'ᆞ', 'ᆫ'으로 흩어진다.
const graphemeSeg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
export function graphemes(text) {
  const s = String(text ?? '');
  if (graphemeSeg) return [...graphemeSeg.segment(s)].map((g) => g.segment);
  return splitByJamo(s);
}
// Intl.Segmenter가 없을 때: 가운뎃소리·끝소리 자모를 앞 글자에 붙인다.
function splitByJamo(s) {
  const out = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    const joining = (c >= 0x1160 && c <= 0x11ff) || (c >= 0xd7b0 && c <= 0xd7ff) || c === 0x302e || c === 0x302f;
    if (joining && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}
const isHangul = (g) => { const c = g.codePointAt(0); return (c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0xa960 && c <= 0xa97f) || (c >= 0xd7b0 && c <= 0xd7ff) || (c >= 0x3131 && c <= 0x318e); };

// 띄어쓰기로 나누고, 띄어 쓰지 않은 긴 한자 글(향찰)만 몇 글자씩 끊는다. 한글이 섞인 말은 끊지 않는다.
export function splitWords(text) {
  const parts = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts;
  const chars = graphemes(parts[0] ?? '');
  if (chars.length <= HANJA_CHUNK + 1 || chars.some(isHangul)) return parts.length ? parts : [''];
  const out = [];
  for (let i = 0; i < chars.length; i += HANJA_CHUNK) out.push(chars.slice(i, i + HANJA_CHUNK).join(''));
  return out;
}

// 음보 목록(재생 순서): [{ u, l, f, original, reading, mark, joined }]
//  mark: 고려가요에서 박에 들지 않는 음보(여음·후렴·되풀이 머리)의 표시. 박에 드는 음보는 null.
export function feetOf(song) {
  const out = [];
  arr(song?.units).forEach((unit, u) => {
    if (song.genre === 'hyangga') out.push({ u, l: null, f: 0, original: unit.original, reading: unit.reading, mark: null, joined: false });
    else if (song.genre === 'goryeo') arr(unit.lines).forEach((line, l) => arr(line.feet).forEach((ft, f) => out.push({ u, l, f, original: ft.original, reading: ft.reading, mark: ft.kind ?? null, joined: !!ft.joined })));
    else arr(unit.feet).forEach((ft, f) => out.push({ u, l: null, f, original: ft.original, reading: ft.reading, mark: null, joined: false }));
  });
  return out;
}

// 두드리기 단위(rhythm.js buildGrid의 단위와 같은 순서): 향가는 구, 고려가요는 줄, 나머지는 장·행
//  feet: 그 단위에서 박에 드는 음보 수(고려가요 후렴만 있는 줄은 0, 듣기만 한다)
export function segmentsOf(song) {
  const out = [];
  arr(song?.units).forEach((unit, u) => {
    if (song.genre === 'hyangga') out.push({ u, l: null, feet: 1 });
    else if (song.genre === 'goryeo') arr(unit.lines).forEach((line, l) => out.push({ u, l, feet: arr(line.feet).filter((ft) => !ft?.kind).length }));
    else out.push({ u, l: null, feet: arr(unit.feet).length });
  });
  return out;
}

// 층(layer)의 조각 목록
export function piecesOf(song, layer) {
  const out = [];
  if (layer === 'gloss') {
    arr(song?.units).forEach((unit, u) => {
      if (song.genre === 'goryeo') {
        arr(unit.lines).forEach((line, l) => splitWords(line.gloss).forEach((text, w) => out.push({ kind: 'gloss', u, l, f: null, w, text, footEnd: false })));
      } else {
        splitWords(unit.gloss).forEach((text, w) => out.push({ kind: 'gloss', u, l: null, f: null, w, text, footEnd: false }));
      }
    });
  } else {
    for (const ft of feetOf(song)) {
      const words = splitWords(ft[layer] ?? ft.reading);
      words.forEach((text, w) => out.push({ kind: 'word', u: ft.u, l: ft.l, f: ft.f, w, text, footEnd: w === words.length - 1, mark: ft.mark, joined: w === 0 && ft.joined }));
    }
  }
  // 쪽을 나눌 수 있는 자리 표시
  //  footStart: 새 음보가 시작하는 말. breakBefore: 이 말 앞에서 쪽을 나눌 수 있는가.
  //  낱말 안에서 나눈 음보의 첫 말(joined)은 새 음보이지만 앞 말과 한 낱말이므로 그 앞에서는 쪽을 나누지 않는다.
  //  풀이는 말마다 나눌 수 있다.
  out.forEach((p, i) => {
    const prev = out[i - 1];
    p.index = i;
    p.unitStart = !prev || prev.u !== p.u;
    p.lineStart = p.unitStart || prev.l !== p.l;
    p.footStart = p.lineStart || (p.kind === 'word' && prev.f !== p.f);
    if (p.kind === 'word') {
      p.mark = p.mark ?? null;
      p.joined = !!p.joined && !p.lineStart;
      p.markStart = !!p.mark && (p.lineStart || prev.mark !== p.mark);
    }
    p.breakBefore = p.kind === 'gloss' || (p.footStart && !p.joined);
  });
  return out;
}

export const footKey = (u, l, f) => u + '|' + (l ?? '-') + '|' + f;
export const lineKey = (u, l) => u + '|' + (l ?? '-');

// 단위 이름. 갈래 판별 전(관·입구)과 보스에서는 갈래가 드러나지 않게 '부분'이라고 부른다(교사 결정 2026-10-08).
export const NEUTRAL_UNIT = '부분';
export function unitName(song, neutral = false) {
  if (neutral) return NEUTRAL_UNIT;
  return genreById(song?.genre)?.unitName ?? NEUTRAL_UNIT;
}

// 종장 첫 음보의 글자들. 글자 수를 셀 때(song-shape.js syllableCount)와 같은 글자를 하나로 치고,
// 옛한글 첫소리 뒤에 붙는 가운뎃소리·끝소리 자모는 앞 글자에 붙여 한 글자로 보인다.
export function syllableChars(text) {
  const out = [];
  for (const ch of String(text ?? '')) {
    const c = ch.codePointAt(0);
    const counted = (c >= 0xac00 && c <= 0xd7a3)
      || (c >= 0x1100 && c <= 0x115f) || (c >= 0xa960 && c <= 0xa97f)
      || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0xf900 && c <= 0xfaff);
    const joining = (c >= 0x1160 && c <= 0x11ff) || (c >= 0xd7b0 && c <= 0xd7ff);
    if (counted) out.push(ch);
    else if (joining && out.length) out[out.length - 1] += ch;
  }
  return out;
}
