// 배경음·효과음 점검(spec 15, 16.5, 19-12, plan T29).
// 1) 자산 목록 조각(assets/manifest.parts/audio.json)에 약속한 이름의 배경음 9곡과 효과음이 모두 있고,
//    목록의 파일이 모두 있으며 목록 밖 소리 파일이 없는지
// 2) 파일마다 ffprobe로 풀리는지(MP3, 모노, 길이)
// 3) 음량: 배경음은 통합 음량이 목표 ±1.5 LU 안, True Peak가 한도 아래. 효과음은 봉우리가 한도 아래이고 너무 작지 않은지
// 4) 효과음 시작: 앞 무음이 20ms 미만(두드리기 지연)
// 5) 출처 문서(assets/audio/CREDITS.md)에 공공누리 출처 문구, 파일 이름, 배경음의 악구 번호가 모두 있는지
// ffmpeg·ffprobe가 없으면 음량을 잴 수 없으므로 실패로 끝낸다(PATH, FFMPEG_BIN, %USERPROFILE%/ffmpeg/bin 순으로 찾음).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// ── 조정할 수 있는 기준(tools/bgm/build_bgm.py의 TARGET_I·TARGET_TP와 맞춘다) ──
export const LIMITS = {
  bgmLufs: -20, bgmLufsTol: 1.5, bgmTruePeak: -1.5, bgmMinSec: 45,
  sfxTruePeak: -1.5, sfxMinPeak: -24, sfxMaxSec: 3.5, sfxMaxLeadMs: 20,
};
export const BGM_NAMES = ['start', 'entrance', 'hyangga', 'goryeo', 'sijo', 'gasa', 'saseol', 'boss', 'ending'];
export const SFX_REQUIRED = ['janggu', 'bell', 'place', 'bind', 'gold', 'basket', 'fog'];
const KOGL_SENTENCE = "본 저작물은 '국립국악원'에서 공공누리 제1유형으로 개방한 '국악기 디지털 음원(작성자: 국립국악원)'을 이용하였으며";

let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

function findTool(name) {
  const exe = name + (process.platform === 'win32' ? '.exe' : '');
  for (const dir of [process.env.FFMPEG_BIN, path.join(os.homedir(), 'ffmpeg', 'bin')]) {
    if (dir && fs.existsSync(path.join(dir, exe))) return path.join(dir, exe);
  }
  const r = spawnSync(name, ['-version'], { windowsHide: true });
  return r.status === 0 ? name : null;
}
const FFMPEG = findTool('ffmpeg');
const FFPROBE = findTool('ffprobe');

// ── 잴 것들 ──
export function probe(file) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_name,channels,sample_rate:format=duration', '-of', 'json', file],
    { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return { ok: false, error: (r.stderr || '').trim().slice(0, 200) };
  const j = JSON.parse(r.stdout);
  const s = j.streams?.[0] ?? {};
  return { ok: true, codec: s.codec_name, channels: s.channels, rate: Number(s.sample_rate), sec: Number(j.format?.duration) };
}

export function loudness(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const s = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const num = (re) => { const m = s.match(re); return m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : NaN; };
  return { lufs: num(/I:\s+(-?[\d.]+|-inf) LUFS/), truePeak: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/) };
}

// 풀어 낸 PCM에서 처음으로 봉우리의 −20 dB를 넘는 곳까지의 시간(ms)과 표본 봉우리(dBFS)
export function attack(file) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'],
    { windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  const buf = r.stdout;
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const thr = peak * 0.1;
  let i = 0;
  while (i < x.length && Math.abs(x[i]) < thr) i++;
  return { leadMs: (i / 44100) * 1000, peakDb: 20 * Math.log10(peak || 1e-9) };
}

// ── 판정(음성 사례에서도 같은 함수를 쓴다) ──
export function judgeBgm(m) {
  const out = [];
  if (!(Math.abs(m.lufs - LIMITS.bgmLufs) <= LIMITS.bgmLufsTol)) out.push(`음량 ${m.lufs} LUFS가 ${LIMITS.bgmLufs}±${LIMITS.bgmLufsTol} 밖`);
  if (!(m.truePeak <= LIMITS.bgmTruePeak)) out.push(`True Peak ${m.truePeak} dBFS가 ${LIMITS.bgmTruePeak} 위`);
  if (!(m.sec >= LIMITS.bgmMinSec)) out.push(`길이 ${m.sec}초가 ${LIMITS.bgmMinSec}초보다 짧음`);
  return out;
}
export function judgeSfx(m) {
  const out = [];
  if (!(m.truePeak <= LIMITS.sfxTruePeak)) out.push(`True Peak ${m.truePeak} dBFS가 ${LIMITS.sfxTruePeak} 위`);
  if (!(m.peakDb >= LIMITS.sfxMinPeak)) out.push(`봉우리 ${m.peakDb.toFixed(1)} dBFS가 너무 작음(${LIMITS.sfxMinPeak} 미만)`);
  if (!(m.sec <= LIMITS.sfxMaxSec)) out.push(`길이 ${m.sec}초가 ${LIMITS.sfxMaxSec}초보다 김`);
  if (!(m.leadMs < LIMITS.sfxMaxLeadMs)) out.push(`앞 무음 ${m.leadMs.toFixed(1)}ms가 ${LIMITS.sfxMaxLeadMs}ms 이상`);
  return out;
}
export function judgeCredits(text, assets) {
  const out = [];
  if (!text.includes(KOGL_SENTENCE)) out.push('공공누리 출처 문구가 없다');
  for (const a of assets) {
    const rel = a.path.replace(/^assets\/audio\//, '');
    if (!text.includes(rel)) out.push(rel + ' 파일이 출처 문서에 없다');
    if (a.kind === 'bgm') {
      for (const id of (a.source.match(/[A-Za-z]\d-\d{3}-[\w]+/g) ?? [])) {
        if (!text.includes(id)) out.push(rel + '의 악구 ' + id + '가 출처 문서에 없다');
      }
    }
  }
  return out;
}
export function judgeManifest(manifest) {
  const out = [];
  const assets = manifest?.assets ?? [];
  const has = (p) => assets.some((a) => a.path === p);
  for (const n of BGM_NAMES) if (!has(`assets/audio/bgm/${n}.mp3`)) out.push(`배경음 ${n}.mp3가 목록에 없다`);
  for (const n of SFX_REQUIRED) if (!has(`assets/audio/sfx/${n}.mp3`)) out.push(`효과음 ${n}.mp3가 목록에 없다`);
  for (const a of assets) {
    const dir = a.path.match(/^assets\/audio\/(bgm|sfx)\/[\w-]+\.mp3$/)?.[1];
    if (!dir) out.push(a.path + ': 경로가 assets/audio/bgm|sfx/<이름>.mp3 모양이 아니다');
    else if (dir !== a.kind) out.push(a.path + ': kind가 ' + dir + '가 아니다');
    if (!(typeof a.license === 'string' && a.license.trim())) out.push(a.path + ': license가 비어 있다');
    if (a.commercialUse !== true) out.push(a.path + ': commercialUse가 true가 아니다');
    if (!(typeof a.source === 'string' && a.source.trim())) out.push(a.path + ': source가 비어 있다');
  }
  return out;
}

// ── 0. 음성 사례: 점검이 실제 잘못을 잡는지 ──
console.log('\n[0] 점검의 음성 사례');
check(FFMPEG && FFPROBE, 'ffmpeg·ffprobe를 찾음 ' + (FFMPEG ?? '(없음)'));
if (!FFMPEG || !FFPROBE) {
  console.log('\n실패: ffmpeg가 없으면 음량을 잴 수 없다');
  process.exit(1);
}
{
  const good = { path: 'assets/audio/bgm/start.mp3', kind: 'bgm', source: '악구 w3-190-010', license: 'x', commercialUse: true };
  check(judgeManifest({ assets: [good] }).some((s) => s.includes('hyangga')), '빠진 배경음 이름을 잡는다');
  check(judgeManifest({ assets: [{ ...good, commercialUse: false }] }).some((s) => s.includes('commercialUse')), '상업 이용 불가를 잡는다');
  check(judgeManifest({ assets: [{ ...good, kind: 'sfx' }] }).some((s) => s.includes('kind')), '폴더와 kind가 어긋남을 잡는다');
  check(judgeCredits(KOGL_SENTENCE + ' bgm/start.mp3', [good]).some((s) => s.includes('w3-190-010')), '출처 문서에 빠진 악구 번호를 잡는다');
  check(judgeCredits(KOGL_SENTENCE + ' w3-190-010', [good]).some((s) => s.includes('bgm/start.mp3')), '출처 문서에 빠진 파일 이름을 잡는다');
  check(judgeCredits('bgm/start.mp3 w3-190-010', [good]).some((s) => s.includes('공공누리')), '빠진 공공누리 문구를 잡는다');
  check(judgeCredits(KOGL_SENTENCE + ' bgm/start.mp3 w3-190-010', [good]).length === 0, '올바른 출처 문서는 통과한다');

  // 실제 소리 파일로: 너무 큰 배경음, 앞 무음이 긴 효과음, 풀리지 않는 파일
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-bgm-'));
  const make = (name, filter, dur) => {
    const f = path.join(tmp, name);
    spawnSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-t', String(dur), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', f], { windowsHide: true });
    return f;
  };
  const loud = make('loud.mp3', 'sine=frequency=440:sample_rate=44100,volume=7', 50);
  const lm = { ...loudness(loud), sec: probe(loud).sec };
  check(judgeBgm(lm).some((s) => s.includes('음량')), `너무 큰 배경음(${lm.lufs} LUFS)을 잡는다`);
  check(judgeBgm({ lufs: -20, truePeak: -0.5, sec: 60 }).some((s) => s.includes('True Peak')), '한도를 넘는 봉우리를 잡는다');
  const late = make('late.mp3', 'sine=frequency=880:sample_rate=44100,volume=4,adelay=120', 0.5);
  const am = { ...attack(late), ...loudness(late), sec: probe(late).sec };
  check(judgeSfx(am).some((s) => s.includes('앞 무음')), `앞 무음이 긴 효과음(${am.leadMs.toFixed(0)}ms)을 잡는다`);
  const quick = make('quick.mp3', 'sine=frequency=880:sample_rate=44100,volume=4', 0.5);
  const qm = { ...attack(quick), ...loudness(quick), sec: probe(quick).sec };
  check(judgeSfx(qm).length === 0, `곧바로 시작하는 효과음(${qm.leadMs.toFixed(1)}ms)은 통과한다`);
  const broken = path.join(tmp, 'broken.mp3');
  fs.writeFileSync(broken, 'not audio');
  check(!probe(broken).ok, '풀리지 않는 파일을 잡는다');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── 1. 자산 목록 ──
console.log('\n[1] 자산 목록 조각 assets/manifest.parts/audio.json');
const manifestPath = path.join(root, 'assets/manifest.parts/audio.json');
let manifest = { assets: [] };
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); pass('읽음'); } catch (e) { fail('읽을 수 없다 — ' + e.message); }
{
  const problems = judgeManifest(manifest);
  check(problems.length === 0, `약속한 이름·출처·사용권·상업 이용 (${manifest.assets.length}개)` + (problems.length ? ' — ' + problems.join('; ') : ''));
  const listed = new Set(manifest.assets.map((a) => a.path));
  const onDisk = ['bgm', 'sfx'].flatMap((d) => {
    const dir = path.join(root, 'assets/audio', d);
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')).map((f) => `assets/audio/${d}/${f}`) : [];
  });
  const orphans = onDisk.filter((p) => !listed.has(p));
  check(orphans.length === 0, '목록 밖 소리 파일이 없다' + (orphans.length ? ' — ' + orphans.join(', ') : ''));
}

// ── 2~4. 파일마다 ──
console.log('\n[2] 파일, 풀림, 음량, 시작');
const rows = [];
for (const a of manifest.assets) {
  const file = path.join(root, a.path);
  if (!fs.existsSync(file)) { fail(a.path + ': 파일이 없다'); continue; }
  const p = probe(file);
  if (!p.ok) { fail(a.path + ': 풀리지 않는다 — ' + p.error); continue; }
  if (p.codec !== 'mp3' || p.channels !== 1) { fail(`${a.path}: MP3 모노가 아니다(${p.codec}, ${p.channels}통로)`); continue; }
  const m = { ...loudness(file), sec: p.sec };
  let problems;
  if (a.kind === 'bgm') problems = judgeBgm(m);
  else { Object.assign(m, attack(file)); problems = judgeSfx(m); }
  rows.push({ path: a.path.replace('assets/audio/', ''), sec: m.sec.toFixed(2), lufs: m.lufs, tp: m.truePeak,
    lead: m.leadMs === undefined ? '' : m.leadMs.toFixed(1) + 'ms', kb: Math.round(fs.statSync(file).size / 1024) });
  check(problems.length === 0, a.path + (problems.length ? ' — ' + problems.join('; ') : ''));
}
console.log('\n  파일                    길이(초)  LUFS    TP(dBFS)  앞무음   KB');
for (const r of rows) {
  console.log('  ' + r.path.padEnd(22) + String(r.sec).padStart(8) + String(r.lufs).padStart(8) + String(r.tp).padStart(9) + r.lead.padStart(9) + String(r.kb).padStart(6));
}

// ── 5. 출처 문서 ──
console.log('\n[3] 출처 문서 assets/audio/CREDITS.md');
{
  let text = '';
  try { text = fs.readFileSync(path.join(root, 'assets/audio/CREDITS.md'), 'utf8'); pass('읽음'); } catch (e) { fail('읽을 수 없다 — ' + e.message); }
  const problems = judgeCredits(text, manifest.assets);
  check(problems.length === 0, '공공누리 문구, 모든 파일 이름, 배경음 악구 번호' + (problems.length ? ' — ' + problems.join('; ') : ''));
}

console.log(failures ? `\n실패 ${failures}건` : '\n모두 통과');
process.exit(failures ? 1 : 0);
