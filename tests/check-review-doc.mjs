// 글 확인 문서 점검(spec 16.4, 21 '글 확인 문서'). docs/글-확인-문서.md와 만드는 도구 tools/text/review-doc.mjs를 본다.
//
// 확인하는 것
//  1) 문서가 있고, 도구로 지금 다시 만든 것과 한 글자도 다르지 않은지(데이터를 고치고 문서를 다시 만들지 않으면 실패).
//     화면 그림(docs/images/)은 대조에서 빼고, 문서가 가리키는 그림 파일이 있는지만 본다(PNG, 모두 2MB 아래).
//  2) 자동 대조(이 점검이 도구와 따로 모은다): 새로 쓴 글이 든 파일들의 모든 글(한글·한자가 든 문자열, 함수 글의 따옴표 안,
//     결과 카드의 말)과, 모든 노래의 모든 글(원문·해독·오늘 소리·풀이·출처·제작 메모·가객·기념품·카드 한 줄)이 문서에 있는지.
//     확인할 노래(pending)는 하나도 빠짐없이 '확인할 노래(pending)'로 표시되는지.
//  3) 낭송: 모든 노래의 목소리 배정, 받아쓰기 일치 0.6 아래 줄과 음절 비율로 자른 줄이 모두 '먼저 들어 볼 낭송'에 있는지.
//  4) 출판사 이름이 없는지.
// 음성 사례: 문서에서 글 한 줄이나 노래 하나를 빼면, 또 데이터와 다른 낡은 문서면 실제로 잡는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildReviewDoc, DOC_PATH, SHOTS } from '../tools/text/review-doc.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const FORBIDDEN = String.fromCodePoint(0xc9c0, 0xd559, 0xc0ac);
let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
}

// ───────── 따로 모으기(도구의 코드를 쓰지 않는다) ─────────
// 게임이 새로 쓴 글이 든 파일(spec 16.4: 수첩 설명, 일지 개념 문장, 가객 대사, 이야기, 작품 방 해석 문장, 기념품 카드 글, 화면 글)
const TEXT_FILES = [
  'js/data/story.js', 'js/data/boss-text.js', 'js/data/remix.js', 'js/data/concepts.js', 'js/data/wings.js', 'js/data/credits.js',
  'js/data/rooms-hyangga.js', 'js/data/rooms-goryeo.js', 'js/data/rooms-sijo.js', 'js/data/rooms-gasa.js', 'js/data/rooms-saseol.js',
  'js/data/notebook-hyangga.js', 'js/data/notebook-goryeo.js', 'js/data/notebook-sijo.js', 'js/data/notebook-gasa.js', 'js/data/notebook-saseol.js',
  'js/measure/labels.js', 'js/play/labels.js',
];
const TEXTY = /[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿一-鿿㐀-䶿]/u;
const LIT = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
const rawLiterals = (src) => [...src.matchAll(LIT)].map((m) => m[1] ?? m[2] ?? m[3]).filter((s) => TEXTY.test(s));
function strings(value, out = []) {
  if (typeof value === 'string') { if (TEXTY.test(value)) out.push(value); }
  else if (typeof value === 'function') out.push(...rawLiterals(value.toString()));
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out);
  return out;
}
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

export async function expectedItems() {
  const items = [];
  for (const f of TEXT_FILES) {
    const mod = await import(pathToFileURL(path.join(root, f)).href);
    for (const s of strings(Object.values(mod))) items.push({ from: f, text: s });
  }
  // 결과 카드의 말: js/result/card.js의 WORDS·SIJO_THINGS 블록 안 문자열
  const card = fs.readFileSync(path.join(root, 'js/result/card.js'), 'utf8');
  for (const name of ['WORDS', 'SIJO_THINGS']) {
    const at = card.indexOf('const ' + name + ' = {');
    const end = card.indexOf('};', at);
    const block = at >= 0 && end > at ? card.slice(at, end) : '';
    if (!block) items.push({ from: 'js/result/card.js', text: '(' + name + ' 블록을 찾지 못함)' });
    for (const s of rawLiterals(block)) items.push({ from: 'js/result/card.js ' + name, text: s });
  }
  return items;
}

// 문서(md)에서 빠진 것을 찾는다
export function judgeDoc(md, { items, songs, voiceRows, approved }) {
  const doc = norm(md);
  const missing = [];
  for (const it of items) if (!doc.includes(norm(it.text))) missing.push(it.from + ': ' + it.text.slice(0, 40));
  for (const s of songs) {
    const head = `\`${s.id}\` · ${s.verification === 'pending' ? '**확인할 노래(pending)**' : '확인 끝(verified)'}`;
    if (!doc.includes(head)) missing.push(`노래 ${s.id}의 절(${s.verification})`);
    for (const t of strings(s)) if (!doc.includes(norm(t))) missing.push(`노래 ${s.id}: ${t.slice(0, 40)}`);
    const v = approved.bySong?.[s.id] ?? approved.default;
    if (!new RegExp(`\\| \`${s.id}\` \\| [^|]*${v === 'narrator-a2' ? '여성' : '남성'}`).test(md)) missing.push(`낭송 배정 ${s.id}`);
  }
  for (const r of voiceRows) if (!doc.includes(norm(r.lineText))) missing.push(`먼저 들어 볼 낭송: ${r.songId} ${r.lineText.slice(0, 30)}`);
  return missing;
}

// ───────── 점검 ─────────
console.log('[1] 문서가 있고 최신인지');
const exists = fs.existsSync(DOC_PATH);
ok(exists, 'docs/글-확인-문서.md 있음');
// git이 줄 끝을 CRLF로 바꿔 꺼내도 같은 문서로 본다
const md = exists ? fs.readFileSync(DOC_PATH, 'utf8').replace(/\r\n/g, '\n') : '';
const { markdown: fresh } = await buildReviewDoc();
ok(md === fresh, '지금 데이터로 다시 만든 문서와 같음' + (md === fresh ? '' : ' — node tools/text/review-doc.mjs로 다시 만드세요'));
const imgs = Object.values(SHOTS).flat().map(([f]) => f);
const imgMissing = imgs.filter((f) => !md.includes(`](images/${f})`) || !fs.existsSync(path.join(root, 'docs/images', f)));
ok(imgMissing.length === 0, `보스·엔딩 화면 그림 ${imgs.length}장이 문서에 걸려 있고 파일이 있음` + (imgMissing.length ? ' — 없음: ' + imgMissing.join(', ') + ' (node tools/text/review-shots.mjs)' : ''));
const pngOk = imgs.every((f) => { const p = path.join(root, 'docs/images', f); return fs.existsSync(p) && fs.readFileSync(p).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); });
const total = imgs.reduce((a, f) => a + (fs.existsSync(path.join(root, 'docs/images', f)) ? fs.statSync(path.join(root, 'docs/images', f)).size : 0), 0);
ok(pngOk && total < 2 * 1024 * 1024, `그림은 PNG이고 모두 ${Math.round(total / 1024)}KB(2MB 아래)`);

console.log('\n[2] 빠진 글과 노래가 없는지(자동 대조)');
const items = await expectedItems();
const { songs } = await import('../js/data/songs/index.js');
const voices = JSON.parse(fs.readFileSync(path.join(root, 'tools/voice/voices.json'), 'utf8'));
const vm = JSON.parse(fs.readFileSync(path.join(root, 'assets/audio/voice/manifest.json'), 'utf8'));
const voiceRows = vm.clips.filter((c) => c.lineAsrMatch < 0.6 || c.cut === 'energy').map((c) => ({ songId: c.songId, lineText: c.lineText ?? c.text }));
const ctx = { items, songs, voiceRows, approved: voices.approved };
const pending = songs.filter((s) => s.verification === 'pending');
const missing = judgeDoc(md, ctx);
ok(missing.length === 0, `새로 쓴 글 ${items.length}개, 노래 ${songs.length}편(확인할 노래 ${pending.length}편)의 모든 글, 낭송 배정, 먼저 들어 볼 줄 ${new Set(voiceRows.map((r) => r.lineText)).size}개가 모두 문서에 있음` +
  (missing.length ? ` — 빠짐 ${missing.length}개: ` + missing.slice(0, 8).join(' | ') : ''));
ok(items.length > 500 && items.some((i) => i.from === 'js/result/card.js WORDS'), `대조할 글을 실제로 모았음(${items.length}개, 결과 카드의 말 포함)`);
ok(['wonwangsaengga', 'songmiingok', 'dongdong', 'cheongsan-byeolgok'].every((id) => md.includes(`(특히 먼저)`) && md.includes(`「${songs.find((s) => s.id === id).title}」 — `)), "「원왕생가」·「속미인곡」·「동동」·「청산별곡」을 먼저 들어 볼 낭송으로 앞세움");
ok(!md.includes(FORBIDDEN) && !md.normalize('NFC').includes(FORBIDDEN), '출판사 이름 없음');

console.log('\n[음성 사례]');
{
  const pick = items.find((i) => i.from === 'js/data/story.js' && i.text.length > 12);
  const lines = md.split('\n');
  const dropped = lines.filter((l) => !l.includes(pick.text)).join('\n');
  ok(judgeDoc(dropped, ctx).some((m) => m.includes(pick.text.slice(0, 40))), `글 한 줄을 빼면 잡는다(${pick.text.slice(0, 20)}…)`);
  const cardWord = items.find((i) => i.from === 'js/result/card.js WORDS' && i.text === '덤 칸도 채웠다');
  ok(cardWord && judgeDoc(md.replace("'덤 칸도 채웠다'", "'덤 칸 채움'"), ctx).some((m) => m.includes('덤 칸도 채웠다')), '결과 카드의 말 하나가 바뀌면 잡는다');
  const ps = pending[pending.length - 1];
  const noSong = md.replace(`\`${ps.id}\` · **확인할 노래(pending)**`, `\`${ps.id}\``);
  ok(judgeDoc(noSong, ctx).some((m) => m.includes(`노래 ${ps.id}의 절`)), `확인할 노래(${ps.id}) 표시를 빼면 잡는다`);
  const gloss = ps.units.at(-1).gloss ?? ps.units.at(-1).lines?.at(-1)?.gloss;
  ok(judgeDoc(md.split(gloss).join('(지움)'), ctx).some((m) => m.includes(gloss.slice(0, 40))), '확인할 노래의 풀이 한 줄을 빼면 잡는다');
  const vr = voiceRows.find((r) => r.songId === 'dongdong');
  ok(judgeDoc(md.split(vr.lineText).join('(지움)'), ctx).some((m) => m.includes('먼저 들어 볼 낭송')), '먼저 들어 볼 낭송 줄을 빼면 잡는다');
  const stale = md.replace('# 글 확인 문서', '# 글 확인 문서(옛판)');
  ok(stale !== fresh, '낡은 문서는 다시 만든 문서와 달라 잡힌다');
}

console.log(failures ? `\n실패 ${failures}건` : '\n모두 통과');
process.exit(failures ? 1 : 0);
