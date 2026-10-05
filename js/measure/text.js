// 노래를 두루마리에 펼칠 조각(말)으로 나눈다. 화면과 상관없는 계산만 둔다.
// 조각 하나 = 말 하나: { u(단위), l(줄, 고려가요만, 아니면 null), f(음보, 향가는 0), w(음보 안 말 번호), text,
//                       footEnd(음보의 끝 말), kind: 'word' | 'gloss' }
// 원문·오늘 소리는 음보마다 말로 나누고, 풀이는 단위(고려가요는 줄)마다 말로 나눈다.
// 향가는 구 하나를 음보 하나(f = 0)로 다룬다. 향찰처럼 띄어 쓰지 않은 글은 세 글자씩 끊어 말로 삼는다.
import { genreById } from '../data/wings.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const HANJA_CHUNK = 3;

// 띄어쓰기로 나누고, 띄어 쓰지 않은 긴 글은 몇 글자씩 끊는다.
export function splitWords(text) {
  const parts = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts;
  const chars = [...(parts[0] ?? '')];
  if (chars.length <= HANJA_CHUNK + 1) return parts.length ? parts : [''];
  const out = [];
  for (let i = 0; i < chars.length; i += HANJA_CHUNK) out.push(chars.slice(i, i + HANJA_CHUNK).join(''));
  return out;
}

// 음보 목록(재생 순서): [{ u, l, f, original, reading }]
export function feetOf(song) {
  const out = [];
  arr(song?.units).forEach((unit, u) => {
    if (song.genre === 'hyangga') out.push({ u, l: null, f: 0, original: unit.original, reading: unit.reading });
    else if (song.genre === 'goryeo') arr(unit.lines).forEach((line, l) => arr(line.feet).forEach((ft, f) => out.push({ u, l, f, original: ft.original, reading: ft.reading })));
    else arr(unit.feet).forEach((ft, f) => out.push({ u, l: null, f, original: ft.original, reading: ft.reading }));
  });
  return out;
}

// 두드리기 단위(rhythm.js buildGrid의 단위와 같은 순서): 향가는 구, 고려가요는 줄, 나머지는 장·행
export function segmentsOf(song) {
  const out = [];
  arr(song?.units).forEach((unit, u) => {
    if (song.genre === 'hyangga') out.push({ u, l: null, feet: 1 });
    else if (song.genre === 'goryeo') arr(unit.lines).forEach((line, l) => out.push({ u, l, feet: arr(line.feet).length }));
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
      words.forEach((text, w) => out.push({ kind: 'word', u: ft.u, l: ft.l, f: ft.f, w, text, footEnd: w === words.length - 1 }));
    }
  }
  // 쪽을 나눌 수 있는 자리 표시
  out.forEach((p, i) => {
    const prev = out[i - 1];
    p.index = i;
    p.unitStart = !prev || prev.u !== p.u;
    p.lineStart = p.unitStart || prev.l !== p.l;
    p.footStart = p.lineStart || (p.kind === 'word' && prev.f !== p.f);
  });
  return out;
}

export const footKey = (u, l, f) => u + '|' + (l ?? '-') + '|' + f;
export const lineKey = (u, l) => u + '|' + (l ?? '-');

// 단위 이름. 보스에서는 갈래가 드러나지 않게 '덩이'라고 부른다.
export function unitName(song, neutral = false) {
  if (neutral) return '덩이';
  return genreById(song?.genre)?.unitName ?? '덩이';
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
