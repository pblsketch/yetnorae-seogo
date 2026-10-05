// 낭송 조각 점검(spec 15, plan T28, js/data/README.md 10·11).
// 1) 노래 데이터의 모든 음보(향가는 구, 고려가요는 연-줄-음보)에 조각 파일이 있고, 남는 조각·노래 폴더가 없는지
// 2) 조각마다 길이가 박자 칸(60 / 빠르기 초) 안에 드는지. 길이는 MP3 프레임 머리를 직접 읽어 잰다(빠르고 ffmpeg가 필요 없다)
// 3) 생성 기록(assets/audio/voice/manifest.json): 출처 Fish Audio, 유료 모델, 승인된 목소리, 사용권, 조각마다 글·길이·칸·sha256이 실제와 같은지
// 4) 자산 목록 조각(assets/manifest.parts/voice.json): 조각마다 항목 하나, kind voice, 출처·사용권·상업 이용
// 조각이 하나도 없으면: VOICE_OPTIONAL=1일 때만 '아직 없음'으로 넘어가고(종료 0), 아니면 실패한다.
// 음성 사례: 임시 폴더에 가짜 노래·조각을 만들어, 빠진 조각·남는 조각·칸 넘침·해시·글 어긋남·목록 누락·무료 모델을 잡는지 본다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { voiceClips } from '../js/core/song-shape.js';
import { tempoOf } from '../js/core/rhythm.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const VOICE_DIR = 'assets/audio/voice';
const DURATION_TOL = 0.005;        // 칸 비교 여유(초)
const RECORD_TOL = 0.06;           // 생성 기록의 길이와 잰 길이의 차이 한도(초)
const MIN_CLIP_SEC = 0.15;         // 이보다 짧으면 빈 조각으로 본다

let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ── MP3 길이: 프레임 머리를 세고, Xing/Info 머리가 있으면 그 프레임 수와 LAME 앞뒤 채움을 쓴다 ──
const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

export function mp3Duration(buf) {
  let off = 0;
  if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    off = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  }
  let frames = 0;
  let samples = 0;
  let rate = 0;
  while (off + 4 <= buf.length) {
    const h = buf.readUInt32BE(off);
    const ver = (h >>> 19) & 3;
    const layer = (h >>> 17) & 3;
    const brIdx = (h >>> 12) & 15;
    const srIdx = (h >>> 10) & 3;
    const ok = ((h >>> 21) & 0x7ff) === 0x7ff && ver !== 1 && layer === 1 && brIdx !== 0 && brIdx !== 15 && srIdx !== 3;
    if (!ok) {
      if (frames === 0) { off++; continue; }
      break;
    }
    const sr = RATES[ver][srIdx];
    const br = BITRATES[ver === 3 ? 1 : 2][brIdx] * 1000;
    const spf = ver === 3 ? 1152 : 576;
    const len = Math.floor(((ver === 3 ? 144 : 72) * br) / sr) + ((h >>> 9) & 1);
    if (frames === 0) {
      const mono = ((h >>> 6) & 3) === 3;
      const tagOff = off + 4 + (ver === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17));
      const tag = buf.toString('latin1', tagOff, tagOff + 4);
      if ((tag === 'Xing' || tag === 'Info') && tagOff + 12 <= buf.length) {
        const flags = buf.readUInt32BE(tagOff + 4);
        let p = tagOff + 8;
        let count = null;
        if (flags & 1) { count = buf.readUInt32BE(p); p += 4; }
        if (flags & 2) p += 4;
        if (flags & 4) p += 100;
        if (flags & 8) p += 4;
        if (count !== null) {
          let trim = 0;
          if (p + 24 <= buf.length && /^(LAME|Lavc|Lavf)/.test(buf.toString('latin1', p, p + 4))) {
            const d = buf.readUIntBE(p + 21, 3);
            trim = (d >>> 12) + (d & 0xfff);
          }
          return Math.max(0, count * spf - trim) / sr;
        }
      }
    }
    frames++;
    samples += spf;
    rate = sr;
    off += len;
  }
  return frames ? samples / rate : null;
}

// ── 판정(실제 저장소와 음성 사례가 함께 쓴다) ──
// songs: 노래 데이터, approved: 승인된 목소리 id(없으면 null)
// 돌려주는 값: { clipCount, expectedCount, problems: [글], rows: [{ path, sec, slot }] }
export function judgeVoice({ root: base, songs, approved }) {
  const problems = [];
  const rows = [];
  const voiceRoot = path.join(base, VOICE_DIR);
  const expected = new Map();   // 경로 → { song, text, slot }
  for (const song of songs) {
    const slot = 60 / tempoOf(song);
    for (const c of voiceClips(song)) expected.set(c.path, { song, text: c.text, slot });
  }
  const onDisk = [];
  const songIds = new Set(songs.map((s) => s.id));
  if (fs.existsSync(voiceRoot)) {
    for (const d of fs.readdirSync(voiceRoot, { withFileTypes: true })) {
      if (d.isFile()) {
        if (d.name !== 'manifest.json') problems.push(`남는 파일: ${VOICE_DIR}/${d.name}`);
        continue;
      }
      if (!songIds.has(d.name)) problems.push(`노래 데이터에 없는 노래 폴더: ${VOICE_DIR}/${d.name}`);
      for (const f of fs.readdirSync(path.join(voiceRoot, d.name))) onDisk.push(`${VOICE_DIR}/${d.name}/${f}`);
    }
  }
  const clipCount = onDisk.length;
  if (clipCount === 0) return { clipCount, expectedCount: expected.size, problems, rows };

  // 1) 빠진 조각, 남는 조각
  const missing = [...expected.keys()].filter((p) => !onDisk.includes(p));
  if (missing.length) problems.push(`조각이 없다 ${missing.length}개: ` + missing.slice(0, 8).join(', ') + (missing.length > 8 ? ' …' : ''));
  for (const p of onDisk) if (!expected.has(p)) problems.push('남는 조각(노래 데이터에 없는 음보): ' + p);

  // 2) 길이와 칸
  const measured = new Map();
  for (const p of onDisk.filter((x) => expected.has(x))) {
    const buf = fs.readFileSync(path.join(base, p));
    const sec = mp3Duration(buf);
    const { slot } = expected.get(p);
    measured.set(p, { sec, hash: sha256(buf) });
    rows.push({ path: p, sec, slot });
    if (sec === null) { problems.push(p + ': MP3로 읽히지 않는다'); continue; }
    if (sec < MIN_CLIP_SEC) problems.push(`${p}: 너무 짧다(${sec.toFixed(3)}s)`);
    if (sec > slot + DURATION_TOL) problems.push(`${p}: 박자 칸을 넘는다(${sec.toFixed(3)}s > 칸 ${slot.toFixed(3)}s)`);
  }

  // 3) 생성 기록
  const recPath = path.join(voiceRoot, 'manifest.json');
  let rec = null;
  try { rec = JSON.parse(fs.readFileSync(recPath, 'utf8')); } catch (e) { problems.push('생성 기록을 읽을 수 없다: ' + VOICE_DIR + '/manifest.json — ' + e.message); }
  if (rec) {
    const g = rec.generator ?? {};
    if (rec.version !== 1) problems.push('생성 기록: version이 1이 아니다');
    if (!String(rec.source ?? '').includes('Fish Audio')) problems.push('생성 기록: source가 Fish Audio가 아니다');
    if (!nonEmpty(rec.license)) problems.push('생성 기록: license(사용권)가 비어 있다');
    if (rec.commercialUse !== true) problems.push('생성 기록: commercialUse가 true가 아니다');
    if (!nonEmpty(g.model)) problems.push('생성 기록: generator.model이 없다');
    else if (/-free$/.test(g.model)) problems.push('생성 기록: 무료 모델(' + g.model + ')은 상업 이용이 안 된다');
    if (!nonEmpty(g.plan)) problems.push('생성 기록: generator.plan(요금제)이 없다');
    if (!nonEmpty(g.voice)) problems.push('생성 기록: generator.voice(목소리)가 없다');
    else if (!approved) problems.push('승인된 목소리가 없다(tools/voice/voices.json의 approved)');
    else if (g.voice !== approved) problems.push(`생성 기록의 목소리(${g.voice})가 승인된 목소리(${approved})와 다르다`);
    if (!nonEmpty(g.referenceSha256)) problems.push('생성 기록: 기준 음성 해시(generator.referenceSha256)가 없다');
    const clips = Array.isArray(rec.clips) ? rec.clips : [];
    const byPath = new Map();
    for (const c of clips) {
      if (byPath.has(c.path)) problems.push('생성 기록: 같은 조각이 두 번 — ' + c.path);
      byPath.set(c.path, c);
      if (!measured.has(c.path)) problems.push('생성 기록에만 있는 조각: ' + c.path);
    }
    for (const [p, m] of measured) {
      const c = byPath.get(p);
      const exp = expected.get(p);
      if (!c) { problems.push('생성 기록에 없는 조각: ' + p); continue; }
      if (c.text !== exp.text) problems.push(`${p}: 기록의 글 "${c.text}"이 노래 데이터의 오늘 소리 "${exp.text}"와 다르다`);
      if (c.sha256 !== m.hash) problems.push(p + ': sha256이 기록과 다르다');
      if (typeof c.duration !== 'number' || (m.sec !== null && Math.abs(c.duration - m.sec) > RECORD_TOL)) problems.push(`${p}: 기록의 길이(${c.duration})가 잰 길이(${m.sec?.toFixed(3)})와 다르다`);
      if (typeof c.slotSec !== 'number' || Math.abs(c.slotSec - exp.slot) > 1e-3) problems.push(`${p}: 기록의 칸(${c.slotSec})이 지금 빠르기의 칸(${exp.slot.toFixed(3)})과 다르다 — 빠르기를 바꿨으면 다시 만든다`);
    }
  }

  // 4) 자산 목록 조각
  const partPath = path.join(base, 'assets/manifest.parts/voice.json');
  let part = null;
  try { part = JSON.parse(fs.readFileSync(partPath, 'utf8')); } catch (e) { problems.push('자산 목록 조각을 읽을 수 없다: assets/manifest.parts/voice.json — ' + e.message); }
  if (part) {
    const assets = Array.isArray(part.assets) ? part.assets : [];
    const listed = new Map();
    for (const a of assets) {
      if (listed.has(a.path)) problems.push('자산 목록: 같은 경로가 두 번 — ' + a.path);
      listed.set(a.path, a);
      if (!measured.has(a.path) && !onDisk.includes(a.path)) problems.push('자산 목록에만 있는 조각: ' + a.path);
      if (a.kind !== 'voice') problems.push(`자산 목록 ${a.path}: kind가 voice가 아니다`);
      if (!String(a.source ?? '').includes('Fish Audio')) problems.push(`자산 목록 ${a.path}: source에 Fish Audio가 없다`);
      if (!nonEmpty(a.license)) problems.push(`자산 목록 ${a.path}: license가 비어 있다`);
      if (a.commercialUse !== true) problems.push(`자산 목록 ${a.path}: commercialUse가 true가 아니다`);
    }
    const unlisted = onDisk.filter((p) => !listed.has(p));
    if (unlisted.length) problems.push(`자산 목록에 없는 조각 ${unlisted.length}개: ` + unlisted.slice(0, 5).join(', '));
  }
  return { clipCount, expectedCount: expected.size, problems, rows };
}

// 조각이 하나도 없을 때의 판정
export function emptyVerdict(env) {
  return env.VOICE_OPTIONAL === '1'
    ? { ok: true, msg: '낭송 조각: 아직 없음(VOICE_OPTIONAL=1이라 넘어감)' }
    : { ok: false, msg: '낭송 조각이 하나도 없다(아직 만들지 않았으면 VOICE_OPTIONAL=1로 넘길 수 있다)' };
}

// ── 음성 사례 ──

function findFfmpeg() {
  const exe = 'ffmpeg' + (process.platform === 'win32' ? '.exe' : '');
  for (const dir of [process.env.FFMPEG_BIN, path.join(os.homedir(), 'ffmpeg', 'bin')]) {
    if (dir && fs.existsSync(path.join(dir, exe))) return path.join(dir, exe);
  }
  return spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0 ? 'ffmpeg' : null;
}

// 가짜 MP3: MPEG1 Layer III 128kbps 44.1kHz 모노 프레임(417바이트)을 sec초 분량 이어 붙인다.
function fakeMp3(sec, seed = 0) {
  const frames = Math.max(1, Math.round((sec * 44100) / 1152));
  const frame = Buffer.alloc(417);
  frame.writeUInt32BE(0xfffb90c0, 0);
  frame[100] = seed & 0xff;
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

function makeFixture() {
  const songs = [
    { id: 'gaga-sijo', genre: 'sijo', tempo: 60, units: [{ feet: [{ original: '가', reading: '가나' }, { original: '다', reading: '다라' }] }] },
    { id: 'gaga-hyangga', genre: 'hyangga', units: [{ reading: '마바사' }, { reading: '아자차' }] },
    { id: 'gaga-goryeo', genre: 'goryeo', units: [{ lines: [{ feet: [{ original: '카', reading: '카타' }] }] }] },
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-voice-'));
  const clips = [];
  const parts = [];
  for (const song of songs) {
    const slot = 60 / tempoOf(song);
    voiceClips(song).forEach((c, i) => {
      const buf = fakeMp3(slot * 0.8, i + 1);
      fs.mkdirSync(path.join(dir, path.dirname(c.path)), { recursive: true });
      fs.writeFileSync(path.join(dir, c.path), buf);
      clips.push({ path: c.path, songId: song.id, text: c.text, duration: mp3Duration(buf), slotSec: slot, sha256: sha256(buf) });
      parts.push({ path: c.path, kind: 'voice', source: 'Fish Audio TTS API', license: '유료 이용 상업 허용', commercialUse: true });
    });
  }
  const rec = {
    version: 1, source: 'Fish Audio', license: '유료 이용 상업 허용', commercialUse: true,
    generator: { model: 's2.1-pro', plan: '유료 API', voice: 'narrator-a', referenceSha256: 'ab' }, clips,
  };
  const write = () => {
    fs.writeFileSync(path.join(dir, VOICE_DIR, 'manifest.json'), JSON.stringify(rec));
    fs.mkdirSync(path.join(dir, 'assets/manifest.parts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'assets/manifest.parts/voice.json'), JSON.stringify({ version: 1, assets: parts }));
  };
  write();
  return { dir, songs, rec, parts, write };
}

function selfTest() {
  console.log('\n[0] 점검기 자체 시험(가짜 노래·조각)');
  const same = (f) => {
    const fx = makeFixture();
    try { return f(fx); } finally { fs.rmSync(fx.dir, { recursive: true, force: true }); }
  };
  const run = (fx, approved = 'narrator-a') => judgeVoice({ root: fx.dir, songs: fx.songs, approved }).problems;
  const has = (problems, word) => problems.some((p) => p.includes(word));

  same((fx) => {
    const p = run(fx);
    check(p.length === 0, '올바른 조각 묶음은 통과한다' + (p.length ? ' — ' + p.join('; ') : ''));
    check(judgeVoice({ root: fx.dir, songs: fx.songs, approved: 'narrator-a' }).clipCount === 5, '향가는 구마다, 고려가요는 연-줄-음보마다 조각을 센다(5개)');
  });
  same((fx) => { fs.rmSync(path.join(fx.dir, VOICE_DIR, 'gaga-hyangga/1.mp3')); check(has(run(fx), '조각이 없다'), '빠진 조각을 잡는다'); });
  same((fx) => { fs.writeFileSync(path.join(fx.dir, VOICE_DIR, 'gaga-sijo/0-9.mp3'), fakeMp3(0.5)); check(has(run(fx), '남는 조각'), '남는 조각을 잡는다'); });
  same((fx) => { fs.mkdirSync(path.join(fx.dir, VOICE_DIR, 'old-song')); check(has(run(fx), '노래 폴더'), '데이터에 없는 노래 폴더를 잡는다'); });
  same((fx) => {
    const buf = fakeMp3(1.3);
    const p = 'assets/audio/voice/gaga-sijo/0-1.mp3';
    fs.writeFileSync(path.join(fx.dir, p), buf);
    const c = fx.rec.clips.find((x) => x.path === p);
    Object.assign(c, { duration: mp3Duration(buf), sha256: sha256(buf) });
    fx.write();
    check(has(run(fx), '박자 칸을 넘는다'), '칸(빠르기 60 → 1초)을 넘는 조각을 잡는다');
  });
  same((fx) => { fs.writeFileSync(path.join(fx.dir, VOICE_DIR, 'gaga-sijo/0-0.mp3'), fakeMp3(0.8, 99)); check(has(run(fx), 'sha256'), '기록과 다른 파일(sha256)을 잡는다'); });
  same((fx) => { fx.rec.clips[0].text = '엉뚱한 글'; fx.write(); check(has(run(fx), '오늘 소리'), '노래 데이터와 다른 글로 만든 조각을 잡는다'); });
  same((fx) => { fx.rec.clips[0].slotSec = 1.2; fx.write(); check(has(run(fx), '지금 빠르기의 칸'), '빠르기가 바뀐 뒤 다시 만들지 않은 조각을 잡는다'); });
  same((fx) => { fx.rec.generator.model = 's2.1-pro-free'; fx.write(); check(has(run(fx), '무료 모델'), '무료 모델로 만든 기록을 잡는다'); });
  same((fx) => { check(has(run(fx, null), '승인된 목소리가 없다'), '승인 전 목소리로 만든 조각을 잡는다'); check(has(run(fx, 'narrator-b'), '승인된 목소리'), '승인하지 않은 목소리를 잡는다'); });
  same((fx) => { fx.parts.pop(); fx.write(); check(has(run(fx), '자산 목록에 없는 조각'), '자산 목록에서 빠진 조각을 잡는다'); });
  same((fx) => { fx.parts[0].commercialUse = false; fx.write(); check(has(run(fx), 'commercialUse'), '상업 이용 표시가 없는 항목을 잡는다'); });
  same((fx) => { fs.rmSync(path.join(fx.dir, VOICE_DIR, 'manifest.json')); check(has(run(fx), '생성 기록을 읽을 수 없다'), '생성 기록이 없으면 잡는다'); });
  same((fx) => { fs.writeFileSync(path.join(fx.dir, VOICE_DIR, 'gaga-sijo/0-0.mp3'), 'not audio'); check(has(run(fx), 'MP3로 읽히지 않는다'), '풀리지 않는 파일을 잡는다'); });
  check(Math.abs(mp3Duration(fakeMp3(1.0)) - 1.0) < 0.03, 'MP3 프레임으로 길이를 잰다(1초 ±0.03)');
  // 도구(tools/voice/build_voice.py)와 같은 설정으로 만든 실제 MP3(Xing·LAME 머리 있음)로 길이 재기를 맞춰 본다.
  const ffmpeg = findFfmpeg();
  if (ffmpeg) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-voice-mp3-'));
    const f = path.join(tmp, 'a.mp3');
    spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '0.8', '-ac', '1',
      '-c:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '1', f], { windowsHide: true });
    const sec = fs.existsSync(f) ? mp3Duration(fs.readFileSync(f)) : null;
    check(sec !== null && Math.abs(sec - 0.8) < 0.01, `실제 MP3(Xing·LAME 머리)의 길이를 잰다(0.8초 → ${sec?.toFixed(4)})`);
    fs.rmSync(tmp, { recursive: true, force: true });
  } else console.log('  · ffmpeg가 없어 실제 MP3 길이 재기 시험은 건너뜀');
  check(emptyVerdict({}).ok === false && emptyVerdict({ VOICE_OPTIONAL: '1' }).ok === true && emptyVerdict({ VOICE_OPTIONAL: '0' }).ok === false,
    '조각이 없을 때는 VOICE_OPTIONAL=1일 때만 통과한다');
}

// ── 실제 저장소 ──
async function main() {
  selfTest();

  console.log('\n[1] 실제 낭송 조각 ' + VOICE_DIR);
  const { songs } = await import('../js/data/songs/index.js');
  let approved = null;
  try { approved = JSON.parse(fs.readFileSync(path.join(root, 'tools/voice/voices.json'), 'utf8')).approved ?? null; } catch { /* 없으면 승인 없음 */ }
  const r = judgeVoice({ root, songs, approved });
  if (r.clipCount === 0) {
    const v = emptyVerdict(process.env);
    check(v.ok, v.msg + ` (노래 ${songs.length}편, 만들 조각 ${r.expectedCount}개)`);
    for (const p of r.problems) fail(p);
  } else {
    check(r.problems.length === 0, `조각 ${r.clipCount}/${r.expectedCount}개 · 칸 안 · 생성 기록 · 자산 목록` + (r.problems.length ? '' : ''));
    for (const p of r.problems.slice(0, 40)) console.log('      - ' + p);
    if (r.problems.length > 40) console.log('      … 그 밖에 ' + (r.problems.length - 40) + '개');
    const tight = r.rows.filter((x) => x.sec !== null).sort((a, b) => b.sec / b.slot - a.sec / a.slot).slice(0, 5);
    for (const t of tight) console.log(`      칸을 가장 많이 채운 조각: ${t.path.replace(VOICE_DIR + '/', '')} ${t.sec.toFixed(3)}s / ${t.slot.toFixed(2)}s`);
  }

  console.log(failures ? `\n실패 ${failures}건` : '\n모두 통과');
  process.exit(failures ? 1 : 0);
}

main();
