// 글 나누기 점검: 두루마리(재기 화면)와 보스 3단계가 노래 글을 조각낼 때 옛한글 글자가 흩어지지 않는지.
// 옛한글은 첫소리·가운뎃소리·끝소리 자모가 따로 된 코드 포인트라서, 코드 포인트로 자르면 'ᄂᆞᆫ'이
// 'ᄂ' / 'ᆞᆫ'처럼 갈라져 화면에서 자모가 흩어져 보인다. 한글 말은 끊지 않고, 띄어 쓰지 않은 향찰만 끊는다.
import { songs } from '../js/data/songs/index.js';
import { splitWords, graphemes, piecesOf, feetOf, segmentsOf } from '../js/measure/text.js';
import { joinFeet } from '../js/core/song-shape.js';

let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

// 가운뎃소리·끝소리 자모(앞 글자에 붙어야 하는 것)로 시작하거나, 첫소리 자모로 끝나 다음 조각에 붙을 것이 남은 조각
const JOINING = /^[ᅠ-ᇿힰ-퟿〮〯]/u;
const DANGLING_LEAD = /[ᄀ-ᅟꥠ-꥿]$/u;
const broken = (pieces) => pieces.filter((t, i) => JOINING.test(t) || (DANGLING_LEAD.test(t) && JOINING.test(pieces[i + 1] ?? '')));
// 한글이 든 글을 띄어쓰기 아닌 곳에서 끊었는가
const cutsHangulWord = (text, pieces) => hasHangul(text) && pieces.join(' ') !== String(text).trim().split(/s+/).join(' ');
const hasHangul = (t) => /[가-힣ᄀ-ᇿꥠ-꥿ힰ-퟿]/u.test(t);

console.log('\n[1] 글자 묶음 나누기');
check(JSON.stringify(graphemes('보내ᄋᆞᆸ노니')) === JSON.stringify(['보', '내', 'ᄋᆞᆸ', '노', '니']), '옛한글 한 글자(첫·가운데·끝 자모)를 한 묶음으로 센다');
check(JSON.stringify(splitWords('날러ᄂᆞᆫ')) === JSON.stringify(['날러ᄂᆞᆫ']), '띄어 쓰지 않은 한글 말은 끊지 않는다');
check(splitWords('東京明期月良').length === 2, '띄어 쓰지 않은 향찰은 세 글자씩 끊는다');

console.log('\n[2] 모든 노래 · 원문/오늘 소리/풀이 조각');
let pieceCount = 0;
const bad = [];
for (const song of songs) {
  for (const layer of ['original', 'reading', 'gloss']) {
    const ps = piecesOf(song, layer);
    pieceCount += ps.length;
    const texts = ps.map((p) => p.text);
    for (const t of broken(texts)) bad.push(`${song.id}/${layer}: "${t}"`);
  }
}
check(bad.length === 0, `조각 ${pieceCount}개 가운데 자모가 흩어진 조각이 없다` + (bad.length ? ' — ' + bad.slice(0, 8).join(' | ') : ''));

// 한글이 든 음보는 띄어쓰기에서만 나뉜다: 조각을 띄어쓰기로 이은 글이 음보 글과 같아야 한다
const norm = (t) => String(t ?? '').trim().split(/s+/).join(' ');
const splitInside = [];
for (const song of songs) {
  for (const layer of ['original', 'reading']) {
    const byFoot = new Map();
    for (const p of piecesOf(song, layer)) {
      const k = `${p.u}|${p.l}|${p.f}`;
      if (!byFoot.has(k)) byFoot.set(k, []);
      byFoot.get(k).push(p.text);
    }
    for (const ft of feetOf(song)) {
      const text = norm(ft[layer] ?? ft.reading);
      const words = byFoot.get(`${ft.u}|${ft.l}|${ft.f}`) ?? [];
      if (cutsHangulWord(text, words)) splitInside.push(`${song.id}/${layer}: ${JSON.stringify(words)}`);
    }
  }
}
check(splitInside.length === 0, '한글이 든 음보는 띄어쓰기에서만 나뉜다' + (splitInside.length ? ' — ' + splitInside.slice(0, 6).join(' | ') : ''));

console.log('\n[3] 음성 사례: 코드 포인트로 세 글자씩 자르던 옛 방식은 잡힌다');
const oldSplit = (text) => {
  const chars = [...String(text)];
  const out = [];
  for (let i = 0; i < chars.length; i += 3) out.push(chars.slice(i, i + 3).join(''));
  return out;
};
check(broken(oldSplit('날러ᄂᆞᆫ')).length > 0, '코드 포인트로 자른 \'날러ᄂᆞᆫ\'은 흩어진 조각으로 잡힌다');
check(broken(oldSplit('보내ᄋᆞᆸ노니')).length > 0, '코드 포인트로 자른 \'보내ᄋᆞᆸ노니\'는 흩어진 조각으로 잡힌다');
check(cutsHangulWord('두어리마ᄂᆞᄂᆞᆫ', oldSplit('두어리마ᄂᆞᄂᆞᆫ')), '자모는 안 흩어져도 한글 말 \'두어리마ᄂᆞᄂᆞᆫ\'을 가운데서 끊으면 잡힌다');
check(broken(graphemes('잡ᄉᆞ와')).length === 0, '글자 묶음으로 자른 \'잡ᄉᆞ와\'는 잡히지 않는다');

console.log('\n[4] 고려가요 박 밖 음보 표시와 낱말 안 나눔(추가 제안 T31)');
// 두루마리 조각을 줄마다 다시 이은 글(joined 조각 앞은 띄우지 않음)
function linesFromPieces(ps) {
  const out = new Map();
  for (const p of ps) {
    if (p.kind !== 'word') continue;
    const k = p.u + '|' + p.l;
    out.set(k, (out.has(k) ? out.get(k) + (p.joined ? '' : ' ') : '') + p.text);
  }
  return out;
}
function markProblems(song) {
  const out = [];
  for (const layer of ['original', 'reading']) {
    const ps = piecesOf(song, layer);
    const lines = linesFromPieces(ps);
    song.units.forEach((u, ui) => (u.lines ?? []).forEach((l, li) => {
      const want = joinFeet(l.feet, layer);
      if (lines.get(ui + '|' + li) !== want) out.push(`${song.id}/${layer} ${ui + 1}연 ${li + 1}줄: 두루마리 글 "${lines.get(ui + '|' + li)}" ≠ "${want}"`);
    }));
    for (const p of ps) {
      if (p.kind !== 'word') continue;
      const kind = song.units[p.u]?.lines?.[p.l]?.feet?.[p.f]?.kind ?? null;
      if ((p.mark ?? null) !== kind) out.push(`${song.id}/${layer}: 조각 "${p.text}"의 표시 ${p.mark} ≠ 음보 kind ${kind}`);
    }
  }
  segmentsOf(song).forEach((sg) => {
    const want = song.units[sg.u].lines[sg.l].feet.filter((f) => !f.kind).length;
    if (sg.feet !== want) out.push(`${song.id}: 두드리기 단위 ${sg.u + 1}연 ${sg.l + 1}줄의 박 수 ${sg.feet} ≠ ${want}`);
  });
  return out;
}
const goryeoSongs = songs.filter((s) => s.genre === 'goryeo');
const markBad = goryeoSongs.flatMap(markProblems);
check(markBad.length === 0, '고려가요 두루마리 조각에 여음·후렴·되풀이 표시가 음보대로 붙고, 줄 글이 원문 그대로 이어진다' + (markBad.length ? ' — ' + markBad.slice(0, 6).join(' | ') : ''));
check(songs.filter((s) => s.genre !== 'goryeo').every((s) => piecesOf(s, 'original').every((p) => !p.mark && !p.joined)), '다른 갈래의 조각에는 표시와 붙임이 없다');
{
  // 음성 사례: 두루마리 조각이 표시를 잃었을 때와 붙임을 잃었을 때 잡히는지(조각을 직접 바꿔 본다)
  const g = goryeoSongs.find((s) => s.id === 'gasiri');
  const ps = piecesOf(g, 'original');
  const lost = ps.map((p) => ({ ...p, mark: null }));
  const lostJoin = ps.map((p) => ({ ...p, joined: false }));
  check(lost.some((p) => p.kind === 'word' && (p.mark ?? null) !== (g.units[p.u]?.lines?.[p.l]?.feet?.[p.f]?.kind ?? null)), '음성 사례: 표시를 잃은 조각은 음보 kind와 달라 잡힌다');
  check(linesFromPieces(lostJoin).get('0|0') !== joinFeet(g.units[0].lines[0].feet, 'original'), '음성 사례: 붙임을 잃은 조각을 이으면 원문과 달라("가시리 잇고") 잡힌다');
}

console.log(failures ? `\n글 나누기 점검 실패 ${failures}건` : '\n글 나누기 점검 통과');
process.exit(failures ? 1 : 0);
