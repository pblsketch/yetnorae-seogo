// 부분 글꼴 점검(spec 16.6, 19-11·12). tools/fonts/build_fonts.py가 만든 assets/fonts/를 본다.
//
// 확인하는 것
//  1) 글꼴 파일(굵기 400·700), 라이선스 전문(OFL), 이름을 바꿨는지(OFL: 고친 글꼴에 원래 이름을 쓰지 않음)
//  2) 옛한글을 한 글자로 모으는 GSUB 기능(ljmo·vjmo·tjmo·ccmp)이 남았는지
//  3) 게임 글(js·css·index.html·manifest.webmanifest)의 글자가 모두 글꼴의 글자 지도(cmap)에 있는지.
//     원본 글꼴(Noto Serif KR)에 아예 없는 글자는 아래 FALLBACK에 하나하나 적어 두고, 그 밖의 글자가 빠지면 실패한다.
//     FALLBACK에 적은 글자가 더는 안 쓰이거나 글꼴에 들어왔으면 목록을 고치라고 실패한다.
//  4) css/base.css의 @font-face가 같은 사이트의 글꼴 파일을 부르는지(바깥 주소 없음)
//  5) 브라우저에서 글꼴을 실제로 읽고, 노래 글의 옛 글자(「상춘곡」 포함)가 자모 따로가 아니라 한 글자로 모여 그려지는지
//     (모인 너비 ≤ 1.2em, 그리고 자모를 따로 그린 너비의 합보다 확연히 좁음). 바깥 요청과 콘솔 오류가 없는지
// 음성 사례: 빠진 글자, 빠진 기능, 원래 이름, 바깥 주소, 모이지 않은 자모를 실제로 잡는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { openGame } from './lib/browser.mjs';
import { readWoff2Tables, readCmap, readGsubFeatures, readNames } from './lib/woff2.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const FONT_DIR = path.join(root, 'assets', 'fonts');
const WEIGHTS = [400, 700];
const fontFile = (w) => `yetnorae-text-${w}.woff2`;
const FAMILY = 'Yetnorae Text';
const FEATURES = ['ljmo', 'vjmo', 'tjmo', 'ccmp'];

// 원본 글꼴(Noto Serif KR)에 없어 기기 글꼴로 그려지는 글자. 향찰의 이체자 9자와 연필 표시.
// 새 원본 글꼴(예: 한·중·일 전체 글꼴)을 쓰기로 하면 이 목록을 비운다.
const FALLBACK = new Map([
  ['✎', 'js/play/wing.js 연필 표시(화면 글 기호)'],
  ['内', '향찰'], ['夘', '향찰'], ['扵', '향찰'], ['数', '향찰'], ['湌', '향찰'],
  ['肹', '향찰'], ['过', '향찰'], ['隠', '향찰'], ['髙', '향찰'],
]);

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
}

// ───────── 게임 글의 글자 ─────────
function walk(dir, test, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(p)) out.push(p);
  }
  return out;
}
// build_fonts.py의 TEXT_GLOBS와 같은 범위
export function shippedTextFiles() {
  return [
    ...walk(path.join(root, 'js'), (p) => p.endsWith('.js')),
    ...fs.readdirSync(path.join(root, 'css')).filter((n) => n.endsWith('.css')).map((n) => path.join(root, 'css', n)),
    path.join(root, 'index.html'),
    path.join(root, 'manifest.webmanifest'),
  ];
}
export function usedChars(files = shippedTextFiles()) {
  const set = new Set();
  for (const f of files) for (const ch of fs.readFileSync(f, 'utf8')) if (ch.codePointAt(0) >= 0x20) set.add(ch);
  return set;
}

// ───────── 판단(순수 함수) ─────────
// used: Set(글자), cmap: Set(코드 포인트), fallback: Map → { missing, stale }
export function judgeCoverage(used, cmap, fallback) {
  const missing = [...used].filter((c) => !cmap.has(c.codePointAt(0)) && !fallback.has(c));
  const stale = [...fallback.keys()].filter((c) => !used.has(c) || cmap.has(c.codePointAt(0)));
  return { missing, stale };
}
export const judgeFeatures = (features) => FEATURES.filter((t) => !features.has(t));
export function judgeNames(names) {
  const out = [];
  if (names.get(1) !== FAMILY) out.push(`글꼴 이름(1)이 '${names.get(1)}'`);
  for (const id of [1, 3, 4, 6, 16]) if (/noto/i.test(names.get(id) ?? '')) out.push(`이름표 ${id}에 원래 이름이 남음: ${names.get(id)}`);
  return out;
}
export function judgeCss(css) {
  const out = [];
  if (/url\(\s*['"]?(https?:)?\/\//i.test(css)) out.push('바깥 주소를 부른다');
  for (const w of WEIGHTS) {
    const re = new RegExp(`@font-face\\s*{[^}]*font-family:\\s*'YetnoraeText'[^}]*url\\('\\.\\./assets/fonts/${fontFile(w).replace('.', '\\.')}'\\)[^}]*font-weight:\\s*${w}`);
    if (!re.test(css)) out.push(`YetnoraeText ${w}의 @font-face가 없다`);
  }
  if (!/font-family:\s*'YetnoraeUI'[^}]*unicode-range:[^}]*U\+1100-11FF/i.test(css)) out.push('YetnoraeUI의 옛한글 범위 @font-face가 없다');
  return out;
}
// 옛 글자 한 묶음이 모여 그려졌는가: 모인 너비 ≤ 1.2em, 자모를 따로 그린 합의 75% 미만
export const composed = (row, size) => row.whole <= size * 1.2 && row.whole < row.loose * 0.75;

// 노래 글에서 옛 글자 묶음을 뽑는다(첫소리+가운뎃소리(+끝소리), 또는 완성형 글자+끝소리 자모)
const CLUSTER = /[ᄀ-ᅟꥠ-ꥼ]+[ᅠ-ᆧힰ-ퟆ]+[ᆨ-ᇿퟋ-ퟻ]*|[가-힣][ᆨ-ᇿퟋ-ퟻ]+/g;
export const clustersIn = (text) => [...new Set(text.match(CLUSTER) ?? [])];

// ───────── 1~4. 파일 ─────────
console.log('[1] 글꼴 파일과 라이선스');
const tables = {};
for (const w of WEIGHTS) {
  const p = path.join(FONT_DIR, fontFile(w));
  ok(fs.existsSync(p), `assets/fonts/${fontFile(w)} 있음` + (fs.existsSync(p) ? ` (${Math.round(fs.statSync(p).size / 1024)}KB)` : ''));
  if (fs.existsSync(p)) {
    try { tables[w] = readWoff2Tables(fs.readFileSync(p)); } catch (e) { ok(false, `${fontFile(w)}를 읽을 수 없다 — ${e.message}`); }
  }
}
const ofl = fs.existsSync(path.join(FONT_DIR, 'OFL.txt')) ? fs.readFileSync(path.join(FONT_DIR, 'OFL.txt'), 'utf8') : '';
ok(/SIL Open Font License/.test(ofl) && /Noto Serif KR/.test(ofl), 'assets/fonts/OFL.txt에 원래 글꼴과 라이선스 전문');
for (const w of WEIGHTS) {
  if (!tables[w]) continue;
  const problems = judgeNames(readNames(tables[w].get('name')));
  ok(problems.length === 0, `${fontFile(w)}: 이름을 '${FAMILY}'로 바꿈` + (problems.length ? ' — ' + problems.join('; ') : ''));
}

console.log('\n[2] 옛한글 기능(GSUB)');
for (const w of WEIGHTS) {
  if (!tables[w]) continue;
  const lost = judgeFeatures(readGsubFeatures(tables[w].get('GSUB')));
  ok(lost.length === 0, `${fontFile(w)}: ${FEATURES.join('·')} 남음` + (lost.length ? ' — 빠짐: ' + lost.join(', ') : ''));
}

console.log('\n[3] 게임 글의 글자가 모두 글꼴에 있는지');
const used = usedChars();
const cmaps = {};
for (const w of WEIGHTS) {
  if (!tables[w]) continue;
  cmaps[w] = readCmap(tables[w].get('cmap'));
  const { missing, stale } = judgeCoverage(used, cmaps[w], FALLBACK);
  ok(missing.length === 0, `${fontFile(w)}: 게임 글 ${used.size}자가 모두 있음(기기 글꼴로 그리는 ${FALLBACK.size}자 제외)` +
    (missing.length ? ` — 빠진 글자 ${missing.length}개: ${missing.slice(0, 40).join('')} (python tools/fonts/build_fonts.py를 다시 돌리세요)` : ''));
  ok(stale.length === 0, `${fontFile(w)}: 기기 글꼴 목록(FALLBACK)이 지금과 맞음` + (stale.length ? ' — 고칠 글자: ' + stale.join('') : ''));
}
const jamo = [...used].filter((c) => /[ᄀ-ᇿꥠ-꥿ힰ-퟿]/.test(c));
ok(jamo.length > 0 && cmaps[400] && jamo.every((c) => cmaps[400].has(c.codePointAt(0))), `옛한글 자모 ${jamo.length}종이 모두 글꼴에 있음`);
const coverage = fs.existsSync(path.join(FONT_DIR, 'coverage.json')) ? JSON.parse(fs.readFileSync(path.join(FONT_DIR, 'coverage.json'), 'utf8')) : null;
ok(coverage && [...coverage.missingInSource].every((c) => FALLBACK.has(c)), '만들 때 원본에 없던 글자가 모두 FALLBACK에 적혀 있음' +
  (coverage ? ` (${coverage.missingInSource})` : ' — coverage.json 없음'));

console.log('\n[4] css/base.css의 @font-face');
const baseCss = fs.readFileSync(path.join(root, 'css', 'base.css'), 'utf8');
const cssProblems = judgeCss(baseCss);
ok(cssProblems.length === 0, '같은 사이트의 글꼴 파일을 부름' + (cssProblems.length ? ' — ' + cssProblems.join('; ') : ''));
const otherCss = fs.readdirSync(path.join(root, 'css')).filter((n) => /url\(\s*['"]?(https?:)?\/\//i.test(fs.readFileSync(path.join(root, 'css', n), 'utf8')));
ok(otherCss.length === 0, 'css 어디에도 바깥 주소 없음' + (otherCss.length ? ' — ' + otherCss.join(', ') : ''));

// ───────── 음성 사례 ─────────
console.log('\n[음성 사례]');
{
  const cmap = new Set([0x41, 0xAC00]);
  const r1 = judgeCoverage(new Set(['A', '가', '뷁']), cmap, new Map());
  ok(r1.missing.join('') === '뷁', '글꼴에 없는 글자를 잡는다');
  const r2 = judgeCoverage(new Set(['A']), cmap, new Map([['✎', '']]));
  ok(r2.stale.join('') === '✎', '더는 안 쓰는 FALLBACK 글자를 잡는다');
  const r3 = judgeCoverage(new Set(['A', '가']), cmap, new Map([['가', '']]));
  ok(r3.stale.join('') === '가', '글꼴에 들어온 FALLBACK 글자를 잡는다');
  if (cmaps[400]) {
    const removed = new Set(cmaps[400]);
    removed.delete('ᆞ'.codePointAt(0));
    ok(judgeCoverage(used, removed, FALLBACK).missing.includes('ᆞ'), '실제 글꼴에서 아래아(ᆞ)를 빼면 잡는다');
  }
  ok(judgeFeatures(new Set(['ccmp', 'vjmo', 'tjmo'])).join() === 'ljmo', '빠진 ljmo 기능을 잡는다');
  ok(judgeNames(new Map([[1, 'Noto Serif KR']])).length >= 1, '원래 이름(Noto)을 잡는다');
  ok(judgeCss(baseCss.replace(/url\('\.\.\/assets\/fonts\/yetnorae-text-400\.woff2'\)/, "url('https://example.com/a.woff2')")).length >= 2, '바깥 주소 글꼴을 잡는다');
  ok(composed({ whole: 40, loose: 120 }, 40) && !composed({ whole: 118, loose: 120 }, 40), '모이지 않고 자모 따로 그린 너비를 잡는다');
  ok(clustersIn('나ᄒᆞᆫ 허ᇰ ᄆᆞᄋᆞᆷ').join(' ') === 'ᄒᆞᆫ 허ᇰ ᄆᆞ ᄋᆞᆷ', '노래 글에서 옛 글자 묶음을 뽑는다');
}

// ───────── 5. 브라우저 ─────────
console.log('\n[5] 브라우저에서 옛 글자가 한 글자로 모이는지');
{
  const { songs } = await import('../js/data/songs/index.js');
  const sangClusters = clustersIn(JSON.stringify(songs.find((s) => s.id === 'sangchungok') ?? {}));
  const clusters = clustersIn(JSON.stringify(songs));
  ok(sangClusters.length > 0, `「상춘곡」 글에서 옛 글자 ${sangClusters.length}종을 찾음(예: ${sangClusters.slice(0, 5).join(' ')})`);
  ok(clusters.length > 0, `노래 글 전체의 옛 글자 ${clusters.length}종을 잰다`);

  const server = await startServer();
  let g = null;
  try {
    g = await openGame(server.url, { path: 'tests/pages/fonts.html' });
    await g.page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    const r = await g.page.evaluate((cs) => window.__fonts.run(cs), clusters);
    const size = await g.page.evaluate(() => window.__fonts.SIZE);
    ok(r.body.startsWith("'YetnoraeText'") || r.body.startsWith('YetnoraeText'), `본문 글꼴 맨 앞이 YetnoraeText (${r.body})`);
    ok(r.loaded.some((s) => s === 'YetnoraeText|400|loaded') && r.loaded.some((s) => s === 'YetnoraeText|700|loaded'), 'YetnoraeText 400·700을 읽음');
    ok(r.loaded.some((s) => s.startsWith('YetnoraeUI|') && s.endsWith('|loaded')), '화면 글(YetnoraeUI)도 옛 글자에 부분 글꼴을 읽음');
    ok(r.checkBody && r.checkUi, 'document.fonts.check: 옛 글자를 그릴 글꼴이 준비됨');
    const distinct = await g.page.evaluate((cs) => window.__fonts.distinct(cs), clusters);
    ok(distinct === clusters.length, `옛 글자 ${clusters.length}종이 모두 기기 명조가 아닌 부분 글꼴로 그려짐(화소 비교, 다른 것 ${distinct}종)`);
    for (const w of WEIGHTS) ok(server.requests.includes('/assets/fonts/' + fontFile(w)), `같은 사이트에서 ${fontFile(w)}를 받음`);
    // 완성형 글자 + 끝소리 자모(예: 허ᇰ)는 화면 글 글꼴(YetnoraeUI, 옛한글 범위만)에서 완성형이 기기 고딕으로 가므로 모이지 않는다.
    // 그런 글자는 향가 해독문에만 있고 해독문은 본문 글꼴로 보인다. 그래서 본문 글꼴로만 재고, 화면 글 글꼴에서 모이지 않는 것은 음성 사례로 쓴다.
    const mixed = (c) => /^[가-힣]/.test(c);
    const rows = r.rows.filter((row) => !(mixed(row.cluster) && row.face === 'ui'));
    const bad = rows.filter((row) => !composed(row, size));
    ok(bad.length === 0, `옛 글자 ${clusters.length}종 × (본문·화면 글 × 400·700, DOM)이 모두 한 글자로 모임(완성형+끝소리 자모는 본문 글꼴만)` +
      (bad.length ? ` — 모이지 않음 ${bad.length}건: ` + bad.slice(0, 8).map((b) => `${b.cluster}(${b.face} ${b.weight}: ${b.whole.toFixed(1)}/${b.loose.toFixed(1)})`).join(', ') : ''));
    const uiMixed = r.rows.filter((row) => mixed(row.cluster) && row.face === 'ui');
    ok(uiMixed.length > 0 && uiMixed.every((row) => !composed(row, size)), `음성 사례: 기기 글꼴과 섞여 모이지 않은 글자를 실제 화면에서 잡는다(${uiMixed[0]?.cluster} ${uiMixed[0]?.whole.toFixed(1)}/${uiMixed[0]?.loose.toFixed(1)}px)`);
    const sangRows = r.rows.filter((row) => sangClusters.includes(row.cluster));
    ok(sangRows.length > 0 && sangRows.every((row) => composed(row, size)), `「상춘곡」의 옛 글자가 한 글자로 모임(예: ${sangRows[0]?.cluster} 모인 너비 ${sangRows[0]?.whole.toFixed(1)}px, 자모 따로 ${sangRows[0]?.loose.toFixed(1)}px)`);
    ok(g.external.length === 0, '바깥 주소 요청 없음' + (g.external.length ? ' — ' + g.external.slice(0, 3).join(', ') : ''));
    ok(g.errors.length === 0, '콘솔 오류 없음' + (g.errors.length ? ' — ' + g.errors.slice(0, 3).join(' | ') : ''));
  } catch (e) {
    ok(false, '브라우저 점검 실패 — ' + e.message);
  } finally {
    await g?.close();
    await server.close();
  }
}

console.log(failures ? `\n실패 ${failures}건` : '\n모두 통과');
process.exit(failures ? 1 : 0);
