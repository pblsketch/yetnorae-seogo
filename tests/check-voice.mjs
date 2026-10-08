// 낭송 조각 점검(spec 15, plan T28, js/data/README.md 10·11).
// 1) 노래 데이터의 모든 음보(향가는 구, 고려가요는 연-줄-음보)에 조각 파일이 있고, 남는 조각·노래 폴더가 없는지
// 0) 노래마다 낭송 빠르기(tempo)가 노래 데이터에 있는지. 빠르기는 갈래 기본값이 아니라 그 노래의 가장 긴 음보가
//    자연 빠르기로 칸에 들어가도록 노래마다 정한다(js/data/README.md '추가 제안(F5)')
// 2) 조각마다 길이가 박자 칸(60 / 그 노래의 빠르기 초) 안에 드는지. 길이는 MP3 프레임 머리를 직접 읽어 잰다(빠르고 ffmpeg가 필요 없다)
//    조각은 줄(장·행·줄·구)을 한 번에 읽힌 소리를 음보 경계에서 자른 것이거나, 경계가 어긋난 줄을 음보마다 따로 읽힌 것
//    (cut: per-foot, 읽힌 글 spokenText = 그 음보의 글)이어야 하고, 빠르게 줄이거나(stretch) 빨리 읽히면 안 된다
// 3) 생성 기록(assets/audio/voice/manifest.json): 출처 Fish Audio, 유료 모델, 승인된 목소리, 사용권, 조각마다 글·길이·칸·sha256이 실제와 같은지
//    목소리는 노래마다 승인 배정(tools/voice/voices.json approved: { default, bySong })대로여야 한다. 조각마다 기록한 voice가
//    그 노래의 배정과 같고, 생성 기록의 목소리 목록(generator.voices)에 그 목소리의 기준 음성 해시가 있으며,
//    voices.json 후보에 승인한 기준 음성 해시(referenceSha256)가 있으면 그것과 같아야 한다(T28)
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
// 조각을 만든 방법: 줄을 읽혀 받아쓰기 시각으로 자름(asr)·음절 비율로 자름(energy)·자르지 않음(whole)·
// 경계가 어긋난 줄을 음보마다 따로 읽힘(per-foot, tools/voice/build_voice.py --per-foot)
const CUTS = ['asr', 'energy', 'whole', 'per-foot'];

// ── 낭송용 발음 표기(tools/voice/pronounce.json): TTS에 보낸 글에만 쓰는 바꿈 표. 화면 글은 그대로 ──
const hangulOnly = (s) => String(s ?? '').replace(/[^가-힣]/g, '');
export function judgePronounce(rules) {
  const problems = [];
  for (const r of rules) {
    if (!nonEmpty(r?.from) || !nonEmpty(r?.to) || !hangulOnly(r.from) || !hangulOnly(r.to)) problems.push('낭송용 발음 표기 규칙이 이상하다: ' + JSON.stringify(r));
    else if (hangulOnly(r.from).length !== hangulOnly(r.to).length) problems.push(`낭송용 발음 표기 "${r.from}" → "${r.to}"는 음절 수가 다르다`);
  }
  return problems;
}
export const pronounce = (text, rules) => rules.reduce((t, r) => t.split(r.from).join(r.to), String(text ?? ''));

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

// ── 노래마다 빠르기 ──
// 돌려주는 값: [글] — 빠르기가 없거나 이상한 노래
export function judgeTempo(songs) {
  const problems = [];
  for (const song of songs) {
    const t = song.tempo;
    if (t === undefined) problems.push(`${song.id}: 노래 데이터에 낭송 빠르기(tempo)가 없다(갈래 기본값을 쓰지 않는다 — tools/voice/build_voice.py --tempo-probe --write-tempo)`);
    else if (!(typeof t === 'number' && Number.isFinite(t) && t >= 6 && t <= 160)) problems.push(`${song.id}: 빠르기 ${t}가 이상하다(6~160 박/분)`);
  }
  return problems;
}

// ── 승인 배정 ──
// approved: { default: 후보 id, bySong: { 노래 id: 후보 id } } 또는 예전 모양(후보 id 글 하나 — 모든 노래가 그 목소리)
export function voiceFor(approved, songId) {
  if (!approved) return null;
  if (typeof approved === 'string') return approved;
  return approved.bySong?.[songId] ?? approved.default ?? null;
}

// 승인 배정 자체가 이상한 곳: 노래 데이터에 없는 노래 id, 후보에 없는 목소리
export function judgeApproval(approved, songs, candidates = null) {
  const problems = [];
  if (!approved || typeof approved === 'string') return problems;
  const ids = new Set(songs.map((s) => s.id));
  const unknown = Object.keys(approved.bySong ?? {}).filter((id) => !ids.has(id));
  if (unknown.length) problems.push('승인 배정(approved.bySong)에 노래 데이터에 없는 노래 id: ' + unknown.join(', '));
  if (!nonEmpty(approved.default)) problems.push('승인 배정에 나머지 노래의 목소리(approved.default)가 없다');
  if (candidates) {
    const bad = [...new Set([approved.default, ...Object.values(approved.bySong ?? {})])].filter((v) => v && !(v in candidates));
    if (bad.length) problems.push('승인 배정에 후보에 없는 목소리: ' + bad.join(', '));
  }
  return problems;
}

// ── 판정(실제 저장소와 음성 사례가 함께 쓴다) ──
// songs: 노래 데이터, approved: 승인 배정(없으면 null), pinned: { 후보 id: 승인한 기준 음성 sha256 }
// 돌려주는 값: { clipCount, expectedCount, problems: [글], rows: [{ path, sec, slot }] }
export function judgeVoice({ root: base, songs, approved, pinned = {}, rules = [] }) {
  const problems = [...judgeApproval(approved, songs), ...judgePronounce(rules)];
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
    if (!approved) problems.push('승인된 목소리가 없다(tools/voice/voices.json의 approved)');
    const gv = g.voices && typeof g.voices === 'object' ? g.voices : null;
    if (!gv || !Object.keys(gv).length) problems.push('생성 기록: 목소리 목록(generator.voices)이 없다');
    else {
      for (const [v, info] of Object.entries(gv)) {
        if (!nonEmpty(info?.referenceSha256)) problems.push(`생성 기록: 목소리 ${v}의 기준 음성 해시(referenceSha256)가 없다`);
        else if (pinned[v] && info.referenceSha256 !== pinned[v]) problems.push(`생성 기록: 목소리 ${v}의 기준 음성 해시가 승인한 값(voices.json의 referenceSha256)과 다르다`);
      }
    }
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
      if (approved) {
        const want = voiceFor(approved, exp.song.id);
        if (c.voice !== want) problems.push(`${p}: 기록의 목소리(${c.voice ?? '없음'})가 승인된 목소리 배정(${want})과 다르다`);
      }
      if (gv && c.voice && !gv[c.voice]) problems.push(`${p}: 목소리 ${c.voice}가 생성 기록의 목소리 목록(generator.voices)에 없다`);
      if (c.text !== exp.text) problems.push(`${p}: 기록의 글 "${c.text}"이 노래 데이터의 오늘 소리 "${exp.text}"와 다르다`);
      if (c.sha256 !== m.hash) problems.push(p + ': sha256이 기록과 다르다');
      if (typeof c.duration !== 'number' || (m.sec !== null && Math.abs(c.duration - m.sec) > RECORD_TOL)) problems.push(`${p}: 기록의 길이(${c.duration})가 잰 길이(${m.sec?.toFixed(3)})와 다르다`);
      if (typeof c.slotSec !== 'number' || Math.abs(c.slotSec - exp.slot) > 1e-3) problems.push(`${p}: 기록의 칸(${c.slotSec})이 지금 빠르기의 칸(${exp.slot.toFixed(3)})과 다르다 — 빠르기를 바꿨으면 다시 만든다`);
      if (c.tempo !== tempoOf(exp.song)) problems.push(`${p}: 기록의 빠르기(${c.tempo})가 노래 데이터의 빠르기(${tempoOf(exp.song)})와 다르다`);
      if (typeof c.stretch === 'number' && Math.abs(c.stretch - 1) > 1e-3) problems.push(`${p}: 자연 빠르기가 아니다 — 소리를 ${c.stretch}배로 줄였다`);
      if (typeof c.ttsSpeed === 'number' && c.ttsSpeed > 1 + 1e-3) problems.push(`${p}: 자연 빠르기가 아니다 — 말 빠르기 ${c.ttsSpeed}로 빨리 읽혔다`);
      if (!nonEmpty(c.lineText) || !c.lineText.includes(exp.text)) problems.push(`${p}: 줄 단위로 읽힌 기록(lineText)이 없거나 이 음보의 글을 담지 않는다`);
      if (!CUTS.includes(c.cut)) problems.push(`${p}: 자른 방법(cut: ${CUTS.join('·')})이 없다`);
      // 음보마다 따로 읽힌 조각(per-foot): 실제로 읽힌 글(spokenText)이 이 음보의 글을 발음 표기 표로 바꾼 것이어야 한다(뒤에 쉼표 같은 가벼운 맥락만 허용)
      const said = pronounce(exp.text, rules);
      if (c.cut === 'per-foot' && !(nonEmpty(c.spokenText) && c.spokenText.startsWith(said) && /^[\s,.…!?]*$/.test(c.spokenText.slice(said.length)))) {
        problems.push(`${p}: 음보마다 읽힌 조각인데 읽힌 글(spokenText "${c.spokenText ?? ''}")이 이 음보의 글 "${said}"(낭송용 발음 표기 적용, 뒤 쉼표 정도만 허용)이 아니다`);
      }
      // 줄 단위 조각: 실제로 읽힌 글(spokenText, 없으면 lineText)이 줄 글을 발음 표기 표로 바꾼 것이어야 한다(표를 바꾼 뒤 다시 만들지 않으면 잡힌다)
      if (c.cut !== 'per-foot' && nonEmpty(c.lineText) && (c.spokenText ?? c.lineText) !== pronounce(c.lineText, rules)) {
        problems.push(`${p}: 실제로 읽힌 글 "${c.spokenText ?? c.lineText}"이 낭송용 발음 표기 표를 따른 "${pronounce(c.lineText, rules)}"와 다르다 — 표를 바꿨으면 그 줄을 다시 만든다`);
      }
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
    { id: 'gaga-hyangga', genre: 'hyangga', tempo: 18, units: [{ reading: '마바사' }, { reading: '아자차' }] },
    { id: 'gaga-goryeo', genre: 'goryeo', tempo: 48, units: [{ lines: [{ feet: [{ original: '카', reading: '카타' }] }] }] },
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
      const lineText = voiceClips(song).filter((x) => x.unit === c.unit && x.line === c.line).map((x) => x.text).join(' ');
      clips.push({ path: c.path, songId: song.id, voice: 'narrator-a', text: c.text, duration: mp3Duration(buf), slotSec: slot, tempo: tempoOf(song),
        ttsSpeed: 1, stretch: 1, lineText, cut: song.genre === 'hyangga' ? 'whole' : 'asr', sha256: sha256(buf) });
      parts.push({ path: c.path, kind: 'voice', source: 'Fish Audio TTS API', license: '유료 이용 상업 허용', commercialUse: true });
    });
  }
  const rec = {
    version: 1, source: 'Fish Audio', license: '유료 이용 상업 허용', commercialUse: true,
    generator: { model: 's2.1-pro', plan: '유료 API', voices: { 'narrator-a': { referenceSha256: 'ab' } } }, clips,
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
  const run = (fx, approved = 'narrator-a', pinned = {}, rules = []) => judgeVoice({ root: fx.dir, songs: fx.songs, approved, pinned, rules }).problems;
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
  same((fx) => { fx.rec.clips[1].stretch = 1.2; fx.write(); check(has(run(fx), '자연 빠르기가 아니다'), '소리를 줄여(stretch) 칸에 넣은 조각을 잡는다'); });
  same((fx) => { fx.rec.clips[1].ttsSpeed = 1.3; fx.write(); check(has(run(fx), '빨리 읽혔다'), '말 빠르기를 올려 읽힌 조각을 잡는다'); });
  same((fx) => { fx.rec.clips[0].tempo = 50; fx.write(); check(has(run(fx), '기록의 빠르기'), '노래 데이터와 다른 빠르기로 만든 조각을 잡는다'); });
  same((fx) => { delete fx.rec.clips[0].lineText; fx.write(); check(has(run(fx), 'lineText'), '줄 단위로 읽히지 않은(음보 따로) 조각을 잡는다'); });
  same((fx) => { fx.rec.clips[0].lineText = '다른 줄'; fx.write(); check(has(run(fx), 'lineText'), '다른 줄에서 잘라 온 조각을 잡는다'); });
  same((fx) => { delete fx.rec.clips[0].cut; fx.write(); check(has(run(fx), '자른 방법'), '자른 방법이 기록되지 않은 조각을 잡는다'); });
  same((fx) => { fx.rec.clips[0].cut = 'guess'; fx.write(); check(has(run(fx), '자른 방법'), '모르는 자른 방법(cut: guess)을 잡는다'); });
  // 음보마다 따로 읽힌 조각(cut: per-foot)
  same((fx) => {
    Object.assign(fx.rec.clips[0], { cut: 'per-foot', spokenText: fx.rec.clips[0].text });
    Object.assign(fx.rec.clips[1], { cut: 'per-foot', spokenText: fx.rec.clips[1].text + ',' });
    fx.write();
    const p = run(fx);
    check(p.length === 0, '음보마다 따로 읽힌 조각(cut: per-foot, 읽힌 글 = 음보 글, 뒤 쉼표 허용)은 통과한다' + (p.length ? ' — ' + p.join('; ') : ''));
  });
  same((fx) => { Object.assign(fx.rec.clips[0], { cut: 'per-foot' }); fx.write(); check(has(run(fx), '읽힌 글(spokenText'), '읽힌 글(spokenText)이 없는 per-foot 조각을 잡는다'); });
  same((fx) => { Object.assign(fx.rec.clips[0], { cut: 'per-foot', spokenText: fx.rec.clips[0].lineText }); fx.write(); check(has(run(fx), '읽힌 글(spokenText'), '줄 전체를 읽혀 놓고 per-foot로 기록한 조각을 잡는다'); });
  same((fx) => { Object.assign(fx.rec.clips[0], { cut: 'per-foot', spokenText: fx.rec.clips[1].text }); fx.write(); check(has(run(fx), '읽힌 글(spokenText'), '다른 음보 글로 읽힌 per-foot 조각을 잡는다'); });
  same((fx) => { Object.assign(fx.rec.clips[0], { cut: 'per-foot', spokenText: fx.rec.clips[0].text, lineText: '다른 줄' }); fx.write(); check(has(run(fx), 'lineText'), 'per-foot 조각도 줄 글(lineText)에 이 음보 글이 없으면 잡는다'); });
  // 낭송용 발음 표기 표('나' → '라'): 가짜 시조 첫 음보 '가나', 줄 '가나 다라'
  const rule = [{ from: '나', to: '라' }];
  same((fx) => {
    Object.assign(fx.rec.clips[0], { cut: 'per-foot', spokenText: '가라' });
    Object.assign(fx.rec.clips[1], { spokenText: '가라 다라' });
    fx.write();
    const p = run(fx, 'narrator-a', {}, rule);
    check(p.length === 0, '낭송용 발음 표기 표대로 읽힌 조각(음보마다·줄 단위)은 통과한다' + (p.length ? ' — ' + p.join('; ') : ''));
  });
  same((fx) => { Object.assign(fx.rec.clips[0], { cut: 'per-foot', spokenText: '가나' }); fx.write(); check(has(run(fx, 'narrator-a', {}, rule), '낭송용 발음 표기 적용'), '발음 표기 표를 따르지 않고 읽힌 per-foot 조각을 잡는다'); });
  same((fx) => { fx.write(); check(has(run(fx, 'narrator-a', {}, rule), '표를 바꿨으면'), '발음 표기 표를 바꾼 뒤 다시 만들지 않은 줄 단위 조각을 잡는다'); });
  same((fx) => { check(has(run(fx, 'narrator-a', {}, [{ from: '나', to: '라라' }]), '음절 수가 다르다'), '음절 수가 바뀌는 발음 표기 규칙을 잡는다'); });
  same((fx) => {
    check(judgeTempo(fx.songs).length === 0, '노래마다 빠르기가 있으면 통과한다');
    const noTempo = fx.songs.map((s, i) => (i === 1 ? { ...s, tempo: undefined } : s));
    check(judgeTempo(noTempo).some((p) => p.includes('gaga-hyangga') && p.includes('없다')), '빠르기가 없는 노래(갈래 기본값)를 잡는다');
    check(judgeTempo([{ id: 'x', tempo: 0.5 }, { id: 'y', tempo: '50' }]).length === 2, '이상한 빠르기(너무 느림·글)를 잡는다');
  });
  same((fx) => { check(has(run(fx, null), '승인된 목소리가 없다'), '승인 전 목소리로 만든 조각을 잡는다'); check(has(run(fx, 'narrator-b'), '승인된 목소리'), '승인하지 않은 목소리를 잡는다'); });
  // 노래마다 목소리 배정(T28)
  const mixed = { default: 'narrator-a', bySong: { 'gaga-hyangga': 'narrator-b' } };
  same((fx) => {
    check(run(fx, { default: 'narrator-a', bySong: {} }).length === 0, '배정 모양(default·bySong)의 승인도 읽는다');
    check(has(run(fx, mixed), '승인된 목소리 배정(narrator-b)'), '배정과 다른 목소리로 만든 노래(향가만 b인데 a로 만듦)를 잡는다');
    for (const c of fx.rec.clips) if (c.songId === 'gaga-hyangga') c.voice = 'narrator-b';
    fx.rec.generator.voices['narrator-b'] = { referenceSha256: 'cd' };
    fx.write();
    const p = run(fx, mixed);
    check(p.length === 0, '노래마다 배정대로 만든 조각 묶음은 통과한다' + (p.length ? ' — ' + p.join('; ') : ''));
    check(has(run(fx, 'narrator-a'), '승인된 목소리 배정(narrator-a)'), '한 목소리 승인인데 다른 목소리가 섞이면 잡는다');
    check(has(run(fx, mixed, { 'narrator-b': 'ef' }), '승인한 값'), '기준 음성 해시가 승인한 값과 다른 목소리를 잡는다');
    check(run(fx, mixed, { 'narrator-a': 'ab', 'narrator-b': 'cd' }).length === 0, '기준 음성 해시가 승인한 값과 같으면 통과한다');
    delete fx.rec.generator.voices['narrator-b'];
    fx.write();
    check(has(run(fx, mixed), '목소리 목록(generator.voices)에 없다'), '목소리 목록에 없는 목소리로 만든 조각을 잡는다');
  });
  same((fx) => { delete fx.rec.generator.voices; fx.write(); check(has(run(fx), '목소리 목록(generator.voices)이 없다'), '목소리 목록이 없는 생성 기록을 잡는다'); });
  same((fx) => { delete fx.rec.clips[0].voice; fx.write(); check(has(run(fx), '기록의 목소리(없음)'), '목소리를 기록하지 않은 조각을 잡는다'); });
  same((fx) => {
    check(has(run(fx, { default: 'narrator-a', bySong: { 'eopneun-norae': 'narrator-b' } }), '노래 데이터에 없는 노래 id'), '승인 배정의 없는 노래 id를 잡는다');
    check(judgeApproval({ default: 'narrator-a', bySong: { 'gaga-sijo': 'narrator-zz' } }, fx.songs, { 'narrator-a': {} }).some((p) => p.includes('후보에 없는 목소리')), '승인 배정의 후보에 없는 목소리를 잡는다');
    check(voiceFor('narrator-a', 'x') === 'narrator-a' && voiceFor(mixed, 'gaga-hyangga') === 'narrator-b' && voiceFor(mixed, 'gaga-sijo') === 'narrator-a' && voiceFor(null, 'x') === null,
      '노래마다 배정된 목소리를 고른다(예전 모양 글 하나도)');
  });
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
  let candidates = {};
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'tools/voice/voices.json'), 'utf8'));
    approved = cfg.approved ?? null;
    candidates = cfg.candidates ?? {};
  } catch { /* 없으면 승인 없음 */ }
  let rules = [];
  try { rules = JSON.parse(fs.readFileSync(path.join(root, 'tools/voice/pronounce.json'), 'utf8')).rules ?? []; } catch { /* 없으면 바꿈 없음 */ }
  console.log('      낭송용 발음 표기: ' + (rules.length ? rules.map((r) => `${r.from}→${r.to}`).join(', ') : '없음'));
  const pinned = Object.fromEntries(Object.entries(candidates).filter(([, c]) => nonEmpty(c.referenceSha256)).map(([k, c]) => [k, c.referenceSha256]));
  const ap = judgeApproval(approved, songs, candidates);
  check(ap.length === 0, '승인 배정(tools/voice/voices.json approved)이 노래 데이터·후보와 맞는다');
  for (const p of ap) console.log('      - ' + p);
  if (approved && typeof approved === 'object') {
    const count = {};
    for (const s of songs) count[voiceFor(approved, s.id)] = (count[voiceFor(approved, s.id)] ?? 0) + 1;
    console.log('      배정: ' + Object.entries(count).map(([v, n]) => `${v} ${n}편`).join(' · '));
  }
  const tp = judgeTempo(songs);
  check(tp.length === 0, `노래 ${songs.length}편 모두 노래마다 낭송 빠르기(tempo)가 있다`);
  for (const p of tp.slice(0, 12)) console.log('      - ' + p);
  if (tp.length > 12) console.log('      … 그 밖에 ' + (tp.length - 12) + '개');
  const r = judgeVoice({ root, songs, approved, pinned, rules });
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
