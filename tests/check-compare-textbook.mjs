// 교과서 대조 도구(tools/text/compare-textbook.mjs) 점검(T22). 단독 실행: node tests/check-compare-textbook.mjs
// 교과서 추출본(design/source/extract/)은 저장소에 없으므로, 가짜 추출본을 임시 폴더에 만들어 시험한다.
// - 같은 글이면 '일치', 한 글자라도 다르면 '어긋남'과 첫 어긋난 자리
// - 추출본이 없으면 건너뛰고 그 사실을 알린다
// - 명령줄로 돌렸을 때 어긋나면 종료 코드 1, 일치하거나 건너뛰면 0
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

const root = fileURLToPath(new URL('../', import.meta.url));
const toolPath = path.join(root, 'tools/text/compare-textbook.mjs');

let tool = null;
try {
  tool = await import('../tools/text/compare-textbook.mjs');
} catch (e) {
  fail('tools/text/compare-textbook.mjs를 불러올 수 없다: ' + e.message);
}

// 시험용 노래(데이터 형식은 js/data/README.md 4절)
const sijo = {
  id: 'fx-sijo', title: '시험 시조', genre: 'sijo', sourceType: 'textbook-common2',
  units: [
    { feet: [{ original: '십 년(十年)을', reading: '십 년을' }, { original: '경영(經營)하야', reading: '경영하야' }, { original: '초려삼간(草廬三間)', reading: '초려삼간' }, { original: '지어 내니', reading: '지어 내니' }], gloss: '풀이 하나' },
    { feet: [{ original: '나 한 간', reading: '나 한 간' }, { original: '달 한 간에', reading: '달 한 간에' }, { original: '청풍(淸風) 한 간', reading: '청풍 한 간' }, { original: '맛져 두고', reading: '맛져 두고' }], gloss: '풀이 둘' },
    { feet: [{ original: '강산(江山)은', reading: '강산은' }, { original: '드릴 듸 업스니', reading: '드릴 데 업스니' }, { original: '둘너 두고', reading: '둘러 두고' }, { original: '보리라', reading: '보리라' }], gloss: '풀이 셋' },
  ],
};
const hyangga = {
  id: 'fx-hy', title: '시험 향가', genre: 'hyangga', sourceType: 'textbook-common2',
  units: [
    { original: '生死路隱', decipherment: '생사(生死) 길은', reading: '생사 길은', gloss: 'ㄱ' },
    { original: '此矣有阿米次肹伊遣', decipherment: '예 있으매 머뭇거리고,', reading: '예 이시매 머뭇거리고', gloss: 'ㄴ' },
  ],
};
// 교과서 추출본처럼: 쪽 표시, 줄바꿈, 낱말 풀이 표시(●), 원문과 해독이 줄마다 엇갈림
const goodExtract = [
  '===== p7 =====', '송순', '십 년(十年)을 경영(經營)하야 초려', '● 삼간(草廬三間) 지어 내니',
  '나 한 간 달 한 간에 청풍(淸風) 한 간 맛져 두고', '강산(江山)은 드릴 듸 업스니 둘너 두고 보리라', '십 년을 경영하야',
  '===== p6 =====', '生死路隱', '생사(生死) 길은', '此矣有阿米次肹伊遣', '예 있으매 머뭇거리고,',
].join('\n');

if (tool) {
  console.log('\n[1] 비교 함수');
  const { compareSong, normalizeText } = tool;
  check(typeof compareSong === 'function' && typeof normalizeText === 'function', 'compareSong·normalizeText를 내보낸다');

  const ok = compareSong(sijo, normalizeText(goodExtract));
  check(ok.status === 'match', '줄바꿈·풀이 표시(●)가 끼어 있어도 같은 글이면 일치 (' + ok.status + ')');

  const okHy = compareSong(hyangga, normalizeText(goodExtract));
  check(okHy.status === 'match', '향가는 향찰과 해독문이 줄마다 엇갈려 있어도 층마다 따로 찾아 일치 (' + okHy.status + ')');

  const badExtract = goodExtract.replace('둘너 두고', '둘러 두고');
  const bad = compareSong(sijo, normalizeText(badExtract));
  check(bad.status === 'mismatch', '한 글자가 다르면 어긋남 (' + bad.status + ')');
  const first = bad.first ?? {};
  check(first.unit === 2 && first.layer === 'original', '첫 어긋난 자리가 3장 원문으로 나온다 (' + JSON.stringify({ unit: first.unit, layer: first.layer }) + ')');
  // 3장 원문 정규화: '강산(江山)은드릴듸업스니둘너두고보리라' → '너'는 15번째 글자
  check(first.offset === 15, '그 장 안에서 몇 번째 글자인지 나온다 (15번째, 지금 ' + first.offset + ')');
  check(first.expected?.startsWith('너') && first.actual?.startsWith('러'), '데이터 글자와 교과서 글자를 함께 보인다 (' + first.expected + ' / ' + first.actual + ')');

  const badHy = compareSong(hyangga, normalizeText(goodExtract.replace('머뭇거리고', '머뭇거리며')));
  check(badHy.status === 'mismatch' && badHy.first?.layer === 'decipherment' && badHy.first?.unit === 1, '향가 해독문이 다르면 2구 해독에서 어긋남');

  const notTextbook = compareSong({ ...sijo, sourceType: 'old-text' }, normalizeText(goodExtract));
  check(notTextbook.status === 'not-textbook', '교과서 노래가 아니면 대조하지 않는다');

  console.log('\n[2] 추출본 찾기');
  const { extractFilesFor } = tool;
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'yetnorae-extract-'));
  try {
    check(typeof extractFilesFor === 'function', 'extractFilesFor를 내보낸다');
    check(extractFilesFor('textbook-common2', path.join(empty, '없는 폴더')).length === 0, '폴더가 없으면 빈 목록');
    fs.writeFileSync(path.join(empty, '공통국어2_2단원_시험.txt'), goodExtract, 'utf8');
    fs.writeFileSync(path.join(empty, '다른 자료.txt'), 'x', 'utf8');
    check(extractFilesFor('textbook-common2', empty).length === 1, '공통국어2 추출본을 이름으로 찾는다');
    check(extractFilesFor('textbook-literature', empty).length === 0, '문학 교과서 추출본이 없으면 빈 목록');
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
}

console.log('\n[3] 명령줄 실행');
{
  const run = (env, args = []) => spawnSync(process.execPath, [toolPath, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, windowsHide: true });

  const missing = run({ YETNORAE_TEXTBOOK_EXTRACT: path.join(os.tmpdir(), 'yetnorae-없는-폴더-' + Date.now()) });
  check(missing.status === 0, '추출본 폴더가 없으면 종료 코드 0 (' + missing.status + ')');
  check(/건너뜀/.test(missing.stdout) && /추출본/.test(missing.stdout), '추출본이 없어 건너뛴다고 알린다');

  // 실제 「십 년을 경영하야」 데이터로 가짜 추출본을 만든다(데이터 글 그대로 → 일치, 한 글자 바꿈 → 어긋남)
  let room = null;
  try { room = (await import('../js/data/songs/sijo.js')).songs.find((s) => s.id === 'simnyeon-gyeongyeong'); } catch { /* 아래에서 실패로 센다 */ }
  check(!!room, '작품 방 노래(simnyeon-gyeongyeong) 데이터가 있다');
  if (room) {
    const lines = room.units.map((u) => u.feet.map((f) => f.original).join(' '));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yetnorae-extract-'));
    try {
      fs.writeFileSync(path.join(dir, '공통국어2_시험.txt'), '===== p1 =====\n' + lines.join('\n') + '\n', 'utf8');
      const same = run({ YETNORAE_TEXTBOOK_EXTRACT: dir }, ['--only', 'simnyeon-gyeongyeong']);
      check(same.status === 0 && /일치/.test(same.stdout), '같은 글이면 일치, 종료 코드 0 (' + same.status + ')');

      const changed = lines.join('\n').replace(/보리라/, '보오리라');
      fs.writeFileSync(path.join(dir, '공통국어2_시험.txt'), changed, 'utf8');
      const diff = run({ YETNORAE_TEXTBOOK_EXTRACT: dir }, ['--only', 'simnyeon-gyeongyeong']);
      check(diff.status === 1 && /어긋남/.test(diff.stdout), '한 글자가 다르면 어긋남, 종료 코드 1 (' + diff.status + ')');
      check(/3장/.test(diff.stdout), '어긋난 장을 알려 준다');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

console.log('\n' + (failures ? '✗ 실패 ' + failures + '건' : '✓ 교과서 대조 도구 점검 통과'));
process.exit(failures ? 1 : 0);
