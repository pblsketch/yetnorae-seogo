// 권리 점검(spec 16.3, 19-10·12, 21절 '권리').
// 1) 교과서 출판사 이름이 저장소에 올라가는 파일(이름과 내용), 커밋 이력의 변경 내용, 커밋 글, 브랜치 이름에 없는지
// 2) 자산 목록(assets/manifest.json, assets/manifest.parts/*.json)의 항목마다 출처·사용권이 있고 상업 이용이 가능한지
// 이 파일에도 그 이름을 글자 그대로 쓰지 않는다. 글자 번호로 만들어 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const FORBIDDEN = String.fromCodePoint(0xc9c0, 0xd559, 0xc0ac);
const MANIFEST_KINDS = ['image', 'voice', 'bgm', 'sfx', 'font', 'other'];

let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

// 글 안에 금지어가 있는지. 풀어 쓴 자모(NFD)로 들어와도 잡도록 NFC로 맞춘 뒤 찾는다.
function containsForbidden(text) {
  const s = String(text ?? '');
  return s.includes(FORBIDDEN) || s.normalize('NFC').includes(FORBIDDEN);
}

// 자산 목록 하나를 검사해 문제 목록을 돌려준다.
function validateManifest(manifest, label) {
  const out = [];
  if (manifest === null || typeof manifest !== 'object' || !Array.isArray(manifest.assets)) return [label + ': { assets: [...] } 모양이 아니다'];
  manifest.assets.forEach((a, i) => {
    const where = label + ' #' + i + ' ' + (a?.path ?? '(경로 없음)');
    const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
    if (!nonEmpty(a?.path)) out.push(where + ': path가 없다');
    if (!MANIFEST_KINDS.includes(a?.kind)) out.push(where + ': kind가 ' + MANIFEST_KINDS.join('·') + ' 가운데 하나가 아니다');
    if (!nonEmpty(a?.source)) out.push(where + ': source(출처)가 비어 있다');
    if (!nonEmpty(a?.license)) out.push(where + ': license(사용권)가 비어 있다');
    if (a?.commercialUse !== true) out.push(where + ': commercialUse가 true가 아니다');
  });
  return out;
}

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ' 실패: ' + (r.stderr?.toString('utf8') ?? r.error?.message));
  return r.stdout;
}

// ── 0. 점검 자체가 실제로 잡는지(음성 사례). 금지어는 메모리에서만 만든다 ──
console.log('\n[0] 점검의 음성 사례');
check(containsForbidden('교과서 ' + FORBIDDEN + ' 수록본'), '금지어가 든 글을 잡는다');
check(containsForbidden(('앞' + FORBIDDEN + '뒤').normalize('NFD')), '자모로 풀어 쓴(NFD) 금지어도 잡는다');
check(!containsForbidden('고등학교 문학 교과서 수록본'), '금지어가 없는 글은 통과한다');
check(validateManifest({ assets: [{ path: 'a.png', kind: 'image', source: 'x', license: '', commercialUse: true }] }, '시험').length === 1, '사용권이 빈 자산을 잡는다');
check(validateManifest({ assets: [{ path: 'a.png', kind: 'image', source: 'x', license: 'CC0', commercialUse: false }] }, '시험').length === 1, '상업 이용 불가 자산을 잡는다');
check(validateManifest({ assets: [{ path: 'a.png', kind: 'image', license: 'CC0', commercialUse: true }] }, '시험').length === 1, '출처가 빈 자산을 잡는다');
check(validateManifest({ assets: [{ path: 'a.png', kind: 'image', source: 'x', license: 'CC0', commercialUse: true }] }, '시험').length === 0, '올바른 자산은 통과한다');

// ── 1. 파일 ──
console.log('\n[1] 저장소에 올라가는 파일');
{
  const list = (args) => git(args).toString('utf8').split('\0').filter(Boolean);
  const tracked = list(['ls-files', '-z']);
  const untracked = list(['ls-files', '-z', '--others', '--exclude-standard']); // 아직 추가하지 않았지만 올라갈 수 있는 파일
  const files = [...new Set([...tracked, ...untracked])];
  const bad = [];
  for (const f of files) {
    if (containsForbidden(f)) { bad.push(f + ' (파일 이름)'); continue; }
    const p = path.join(root, f);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    if (containsForbidden(fs.readFileSync(p).toString('utf8'))) bad.push(f);
  }
  check(bad.length === 0, '파일 ' + files.length + '개의 이름과 내용에 출판사 이름이 없다' + (bad.length ? ': ' + bad.join(', ') : ''));
}

// ── 2. 커밋 이력 ──
console.log('\n[2] 커밋 이력');
{
  const messages = git(['log', '--all', '--format=%H%x00%B%x00']).toString('utf8').split('\0');
  const badMsg = [];
  for (let i = 0; i + 1 < messages.length; i += 2) if (containsForbidden(messages[i + 1])) badMsg.push(messages[i].trim().slice(0, 8));
  check(badMsg.length === 0, '커밋 글에 출판사 이름이 없다' + (badMsg.length ? ': ' + badMsg.join(', ') : ''));

  const diff = git(['log', '--all', '-p', '--text', '--no-color', '--no-ext-diff', '--format=commit %H']).toString('utf8');
  const badCommits = [];
  let current = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('commit ')) current = line.slice(7, 15);
    else if (containsForbidden(line) && !badCommits.includes(current)) badCommits.push(current);
  }
  check(badCommits.length === 0, '커밋 이력의 변경 내용에 출판사 이름이 없다' + (badCommits.length ? ': ' + badCommits.join(', ') : ''));

  const refs = git(['for-each-ref', '--format=%(refname)']).toString('utf8');
  check(!containsForbidden(refs), '브랜치·태그 이름에 출판사 이름이 없다');
}

// ── 3. 자산 목록 ──
console.log('\n[3] 자산 목록');
{
  const targets = [];
  const main = path.join(root, 'assets/manifest.json');
  if (fs.existsSync(main)) targets.push(main);
  const partsDir = path.join(root, 'assets/manifest.parts');
  if (fs.existsSync(partsDir)) for (const f of fs.readdirSync(partsDir)) if (f.endsWith('.json')) targets.push(path.join(partsDir, f));
  if (targets.length === 0) console.log('  · 자산 목록: 아직 없음');
  for (const t of targets) {
    const label = path.relative(root, t).replace(/\\/g, '/');
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(t, 'utf8')); } catch (e) { fail(label + ': JSON을 읽을 수 없다 — ' + e.message); continue; }
    const problems = validateManifest(manifest, label);
    check(problems.length === 0, label + ': 자산 ' + (manifest.assets?.length ?? 0) + '개의 출처·사용권·상업 이용');
    for (const p of problems.slice(0, 30)) console.log('      - ' + p);
  }
}

console.log('\n' + (failures ? '✗ 실패 ' + failures + '건' : '✓ 권리 점검 통과'));
process.exit(failures ? 1 : 0);
