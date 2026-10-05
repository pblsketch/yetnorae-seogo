// 교과서 대조 도구. 교과서에 실린 노래(sourceType: textbook-common2 · textbook-literature)의 글을
// 교과서 추출본(design/source/extract/의 .txt)과 글자 단위로 맞춰 보고, 노래마다 일치·어긋남을 출력한다.
//
// 쓰는 법: node tools/text/compare-textbook.mjs [--only 노래id,노래id] [--with-gloss]
//   --only        이 노래들만 대조한다
//   --with-gloss  풀이(gloss)도 대조한다. 교과서에 풀이 전문이 없는 노래가 많아 기본은 끈다
//
// 추출본 폴더 찾는 순서
//   1) 환경 변수 YETNORAE_TEXTBOOK_EXTRACT
//   2) 본 저장소(작업 트리라면 그 원래 저장소)의 design/source/extract
//   3) 이 저장소의 design/source/extract
// 추출본(design/)은 저장소에 올리지 않는다. 폴더나 파일이 없으면 대조를 건너뛰고 그 사실을 출력한다.
// 이 도구는 tests/run-all.mjs에 넣지 않는다(추출본이 있는 제작 기기에서만 손으로 돌린다).
//
// 대조 방법
//   - 공백, 줄바꿈, 쪽 표시 줄(===== pN =====), 낱말 풀이 표시(●, *), 폭 없는 글자는 비교에서 뺀다.
//   - 단위(장·행·구, 고려가요는 줄)마다, 층(원문, 향가는 해독문도)마다 추출본에서 차례대로 찾는다.
//     향가처럼 원문과 해독문이 줄마다 엇갈려 있어도 층마다 따로 찾으므로 맞출 수 있다.
//   - 찾지 못한 단위는 그 단위 글의 앞부분이 추출본에서 가장 길게 이어지는 곳을 찾아,
//     그 다음 글자를 '첫 어긋난 자리'로 보인다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TEXTBOOK_SOURCE_TYPES = ['textbook-common2', 'textbook-literature'];

// 추출본 파일 이름에 들어 있는 글자로 교과서를 가린다.
const EXTRACT_NAME_HINT = {
  'textbook-common2': '공통국어2',
  'textbook-literature': '문학',
};

const LAYER_NAME = { original: '원문', decipherment: '해독', gloss: '풀이' };
const UNIT_NAME = { hyangga: '구', goryeo: '연', sijo: '장', saseol: '장', gasa: '행' };

// 비교용 글: NFC로 맞추고, 쪽 표시 줄·공백·풀이 표시·폭 없는 글자를 뺀다.
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/^=+\s*p\d+\s*=+\s*$/gm, '')
    .replace(/[\s 　]+/g, '')
    .replace(/[●*­​-‍⁠﻿]/g, '');
}

// 노래를 비교할 조각으로 나눈다: [{ unit, line, layer, label, text }]
export function songSegments(song, { withGloss = false } = {}) {
  const layers = song.genre === 'hyangga' ? ['original', 'decipherment'] : ['original'];
  if (withGloss) layers.push('gloss');
  const unitName = UNIT_NAME[song.genre] ?? '단위';
  const out = [];
  for (const layer of layers) {
    (song.units ?? []).forEach((u, unit) => {
      if (u?.beyondTextbook === true) return; // 교과서 뒤에 이어 붙인 옛 문헌 원문은 교과서와 대조하지 않는다
      if (song.genre === 'hyangga') {
        out.push({ unit, line: null, layer, label: (unit + 1) + unitName + ' ' + LAYER_NAME[layer], text: u?.[layer] ?? '' });
      } else if (song.genre === 'goryeo') {
        (u?.lines ?? []).forEach((l, line) => {
          const text = layer === 'gloss' ? l?.gloss : (l?.feet ?? []).map((f) => f?.[layer] ?? '').join(' ');
          out.push({ unit, line, layer, label: (unit + 1) + unitName + ' ' + (line + 1) + '줄 ' + LAYER_NAME[layer], text: text ?? '' });
        });
      } else {
        const text = layer === 'gloss' ? u?.gloss : (u?.feet ?? []).map((f) => f?.[layer] ?? '').join(' ');
        out.push({ unit, line: null, layer, label: (unit + 1) + unitName + ' ' + LAYER_NAME[layer], text: text ?? '' });
      }
    });
  }
  return out;
}

// 앞부분이 haystack(from부터)에서 가장 길게 이어지는 길이와 그 자리. 앞부분이 있으면 더 짧은 앞부분도 있으므로 이분 탐색한다.
function longestPrefix(needle, haystack, from) {
  let lo = 0, hi = needle.length, at = -1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const i = haystack.indexOf(needle.slice(0, mid), from);
    if (i >= 0) { lo = mid; at = i; } else hi = mid - 1;
  }
  if (lo > 0 && at < 0) at = haystack.indexOf(needle.slice(0, lo), from);
  return { length: lo, at };
}

// 노래 한 편을 정규화된 추출본 글과 대조한다.
// 결과: { status: 'match' | 'mismatch' | 'not-textbook', segments, failed, first? }
//   first: { unit, line, layer, label, offset(그 단위 글에서 1부터 센 글자 자리), expected, actual }
export function compareSong(song, extractNormalized, opts = {}) {
  if (!TEXTBOOK_SOURCE_TYPES.includes(song?.sourceType)) return { status: 'not-textbook', segments: 0, failed: 0 };
  const segments = songSegments(song, opts);
  const cursor = {}; // 층마다 다음에 찾기 시작할 자리
  let failed = 0;
  let first = null;
  for (const seg of segments) {
    const needle = normalizeText(seg.text);
    const from = cursor[seg.layer] ?? 0;
    if (!needle) continue;
    const at = extractNormalized.indexOf(needle, from);
    if (at >= 0) { cursor[seg.layer] = at + needle.length; continue; }
    failed++;
    if (!first) {
      const p = longestPrefix(needle, extractNormalized, from);
      first = {
        unit: seg.unit, line: seg.line, layer: seg.layer, label: seg.label,
        offset: p.length + 1,
        expected: needle.slice(p.length, p.length + 12),
        actual: p.at >= 0 ? extractNormalized.slice(p.at + p.length, p.at + p.length + 12) : '',
        found: p.length > 0,
      };
    }
  }
  return failed === 0 ? { status: 'match', segments: segments.length, failed } : { status: 'mismatch', segments: segments.length, failed, first };
}

// 그 교과서의 추출본 파일 목록(이름순). 폴더가 없으면 빈 목록.
export function extractFilesFor(sourceType, dir) {
  const hint = EXTRACT_NAME_HINT[sourceType];
  if (!hint || !dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.txt') && f.normalize('NFC').includes(hint))
    .sort()
    .map((f) => path.join(dir, f));
}

// 추출본 폴더를 정한다. { dir, how }
export function resolveExtractDir(repoRoot, env = process.env) {
  if (env.YETNORAE_TEXTBOOK_EXTRACT) return { dir: path.resolve(env.YETNORAE_TEXTBOOK_EXTRACT), how: '환경 변수 YETNORAE_TEXTBOOK_EXTRACT' };
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
  if (r.status === 0 && r.stdout.trim()) {
    const mainRoot = path.dirname(r.stdout.trim());
    const dir = path.join(mainRoot, 'design', 'source', 'extract');
    if (fs.existsSync(dir)) return { dir, how: '본 저장소의 design/source/extract' };
  }
  return { dir: path.join(repoRoot, 'design', 'source', 'extract'), how: '이 저장소의 design/source/extract' };
}

// 노래 데이터를 모은다: 등록 파일과 갈래별 파일. 같은 id는 한 번만.
export async function loadSongs(repoRoot) {
  const songs = new Map();
  const songDir = path.join(repoRoot, 'js', 'data', 'songs');
  const files = fs.existsSync(songDir) ? fs.readdirSync(songDir).filter((f) => f.endsWith('.js')).sort() : [];
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(songDir, f)).href);
    for (const s of Array.isArray(mod.songs) ? mod.songs : []) if (s?.id && !songs.has(s.id)) songs.set(s.id, s);
  }
  return [...songs.values()];
}

function parseArgs(argv) {
  const opts = { only: null, withGloss: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') opts.only = new Set(String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (argv[i] === '--with-gloss') opts.withGloss = true;
  }
  return opts;
}

async function main() {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const opts = parseArgs(process.argv.slice(2));
  const { dir, how } = resolveExtractDir(repoRoot);
  console.log('교과서 대조: 추출본 폴더 ' + dir + ' (' + how + ')');
  if (!opts.withGloss) console.log('  (풀이는 대조하지 않는다. 함께 보려면 --with-gloss)');

  const all = await loadSongs(repoRoot);
  const targets = all.filter((s) => TEXTBOOK_SOURCE_TYPES.includes(s.sourceType) && (!opts.only || opts.only.has(s.id)));
  if (targets.length === 0) { console.log('  교과서 노래가 아직 없다. 대조할 것이 없음'); return 0; }

  const extractCache = new Map();
  const extractOf = (sourceType) => {
    if (!extractCache.has(sourceType)) {
      const files = extractFilesFor(sourceType, dir);
      const text = files.map((f) => normalizeText(fs.readFileSync(f, 'utf8'))).join('\u0000');
      extractCache.set(sourceType, { files, text });
    }
    return extractCache.get(sourceType);
  };

  let mismatches = 0, matches = 0, skips = 0;
  for (const song of targets) {
    const name = song.id + ' 「' + song.title + '」';
    const ex = extractOf(song.sourceType);
    if (ex.files.length === 0) {
      skips++;
      console.log('  - 건너뜀 ' + name + ': ' + song.sourceType + ' 추출본(이름에 \'' + EXTRACT_NAME_HINT[song.sourceType] + '\'이 든 .txt)이 ' + dir + '에 없다');
      continue;
    }
    const r = compareSong(song, ex.text, { withGloss: opts.withGloss });
    if (r.status === 'match') {
      matches++;
      console.log('  ✓ 일치 ' + name + ' — 조각 ' + r.segments + '개 (' + ex.files.map((f) => path.basename(f)).join(', ') + ')');
    } else {
      mismatches++;
      const f = r.first;
      console.log('  ✗ 어긋남 ' + name + ' — 조각 ' + r.segments + '개 가운데 ' + r.failed + '개');
      console.log('      첫 어긋난 자리: ' + f.label + ' ' + f.offset + '번째 글자(공백 뺀 기준)');
      if (f.found) console.log('      데이터: ' + f.expected + ' …  / 교과서: ' + (f.actual || '(끝)') + ' …');
      else console.log('      이 단위의 첫 글자부터 추출본에서 찾지 못했다(데이터: ' + f.expected + ' …)');
    }
  }
  console.log('결과: 일치 ' + matches + ', 어긋남 ' + mismatches + ', 건너뜀 ' + skips);
  return mismatches > 0 ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
