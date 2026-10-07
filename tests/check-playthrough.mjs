// 처음부터 끝까지 완주 점검(T30, spec 2·3.2·5·6·7·10·11·12·13·14·15·19·20·21 '처음부터 끝까지 완주').
// 제품 그대로(index.html)를 새 기록으로 연다. 로컬 저장소에 상태를 넣지 않고, 학생이 하듯 실제 입력(마우스 누르기,
// 손가락 탭, 글자 입력)으로만 시작 화면 → 이어폰 안내·박자 맞추기 → 입구 튜토리얼 → 향가관 → 고려가요관 → 시조관
// → 가사관 → 사설시조관(관마다 재기, 칸·탑·바구니 꽂기, 작품 방, 판 카드) → 보스 세 단계 → 엔딩(한 줄, 관, 먹 개념,
// 한마디) → 마지막 카드까지 간다.
//
// 세 화면(spec 21):
//   휴대폰 가로 844×390 — 3D, 빗금 모드(손가락 탭)
//   크롬북 1366×768   — 3D, 박자 두드리기(마우스, 실제 박자 맞추기 포함)
//   태블릿 1180×820   — 강제 2D 그림 판(손가락 탭, 소리 끄기로 박자 없는 방식)
//
// 점검 도우미는 화면(DOM)과 세계 바탕이 내보이는 손잡이(자리의 화면 좌표, 학생 자리)를 읽어 무엇을 누를지 정하고,
// 노래 데이터로 노래가 어느 갈래인지 판단한다(학생이 감정서와 수첩으로 하는 판단을 대신한다). 누르기는 모두 실제 입력이다.
// 박자 방식에서는 '귀'(점검 도구가 소리 판에 예약되는 소리의 시각을 엿듣는 것)로 종소리와 박을 듣는다. 게임 상태는 바꾸지 않는다.
//
// 확인하는 것
//   - 관이 정해진 순서로만 열리고(앞 관을 마쳐야 다음 관), 건너뛰는 길이 없다
//   - 개념 열세 개가 덤이나 보스 없이 반드시 지나는 길만으로 모두 먹이 된다
//   - 판 카드 다섯 장과 마지막 카드를 실제로 내려받는다(내려받기 사건, PNG 서명·크기, 빈 그림이 아님, 담긴 글, 점수 말 없음)
//   - 콘솔 오류, 실패한 요청(404 포함, 예: 없는 낭송 조각), 바깥 요청이 없다. 낭송 조각 요청은 모두 낭송 목록에 있는 파일이다
// 음성 사례: 요청 감시가 일부러 낸 404·바깥 요청·콘솔 오류를 잡고, PNG 검사가 빈 그림·PNG 아닌 파일·크기 다른 그림·점수 말을 잡는다.
// 멈춤 잡기가 낭송 박이 오지 않는 두드리기, 장구 밖에 떨어진 탭, 확인 줄이 끊긴 화면을 진단과 함께 실패로 잡는다(LIMITS).
//
// 오래 걸린다(박자 두드리기는 낭송을 실제 시간으로 듣는다). 개발 중에만 PLAYTHROUGH_SETUP=phone|chromebook|tablet로 하나만 돌릴 수 있다.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { startServer, ROOT } from './lib/server.mjs';
import { openGame, VIEWPORTS } from './lib/browser.mjs';
import { songs } from '../js/data/songs/index.js';
import { SAVE_KEY } from '../js/core/save.js';
import { WING_TABLE, BOSS_TABLE, ROUTING } from '../js/data/song-table.js';
import { CONCEPTS, CONCEPT_IDS, SINGER_GROUPS } from '../js/data/concepts.js';
import { PLAY_WING_IDS, wingById, wingOfGenre } from '../js/data/wings.js';
import { remix } from '../js/data/remix.js';
import { interpretations as HYANGGA_INTERP } from '../js/data/rooms-hyangga.js';
import { room as GORYEO_ROOM } from '../js/data/rooms-goryeo.js';
import { roomSaseol } from '../js/data/rooms-saseol.js';
import * as R from '../js/core/rhythm.js';
import { joinFeet } from '../js/core/song-shape.js';

// spec 0절의 미션 문장(제품 데이터에서 가져오지 않고 명세에서 옮겨 적는다)
const MISSION_SPEC = '먹안개가 서고를 삼키기 전에, 흩어진 노래들을 제자리로 돌려보내 다시 불리게 하라.';
const SCORE_RE = /점수|등급|순위|랭킹|타이머|게임\s*오버|정답률|score|rank|grade/i;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CARD_W = 1600;
const CARD_H = 900;
const ACTION_OF = { hyangga: 'aa-door', goryeo: 'refrain-link', sijo: 'stairs', gasa: 'walk', saseol: 'rapid-unroll' };
const SHOTS = path.join(ROOT, 'tests', 'shots');

const song = (id) => songs.find((s) => s.id === id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
// 마지막 확인 줄의 시각과 글(한 화면 완주의 감시견이 본다)
const progress = { at: Date.now(), last: '' };
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
  progress.at = Date.now();
  progress.last = msg;
  return !!cond;
}

// 낭송 조각 목록(T28). 게임이 요청하는 낭송 조각은 모두 여기 있어야 한다.
const VOICE = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/audio/voice/manifest.json'), 'utf8'));
const VOICE_PATHS = new Set(VOICE.clips.map((c) => '/' + c.path.replace(/^\/+/, '')));

// ───────── PNG 읽기(점검 도구 안의 작은 풀개, 8비트 RGB·RGBA, 비월 없음) ─────────
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) return { ok: false, why: 'PNG 서명이 아님' };
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) return { ok: false, why: 'IHDR 없음' };
  const channels = { 2: 3, 6: 4 }[ihdr.color];
  if (ihdr.depth !== 8 || !channels || ihdr.interlace) return { ok: true, width: ihdr.width, height: ihdr.height, pixels: null, why: '풀지 않는 PNG 형식' };
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = ihdr.width * channels;
  const px = Buffer.alloc(stride * ihdr.height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < ihdr.height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = v & 0xff;
    }
    prev = out;
  }
  return { ok: true, width: ihdr.width, height: ihdr.height, channels, pixels: px };
}

// PNG 하나를 만든다(음성 사례용). fill(x, y) → [r, g, b]
export function encodePng(width, height, fill) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(width, 0); ih.writeUInt32BE(height, 4); ih[8] = 8; ih[9] = 2; ih[10] = 0; ih[11] = 0; ih[12] = 0;
  return Buffer.concat([PNG_SIG, chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c;
}

// 카드 PNG 검사: 서명, 크기, 빈 그림이 아님(가장 흔한 색이 대부분을 덮지 않고 색이 여럿), 담긴 글에 점수 말이 없음.
// 돌려주는 값: 문제 목록(비면 통과)
export function cardProblems(buf, { text = '', mustInclude = [] } = {}) {
  const out = [];
  const png = decodePng(buf);
  if (!png.ok) return [png.why];
  if (png.width !== CARD_W || png.height !== CARD_H) out.push('크기 ' + png.width + 'x' + png.height + ' ≠ ' + CARD_W + 'x' + CARD_H);
  if (!png.pixels) out.push(png.why);
  else {
    const count = new Map();
    let n = 0;
    const ch = png.channels;
    for (let y = 0; y < png.height; y += 3) {
      for (let x = 0; x < png.width; x += 3) {
        const o = (y * png.width + x) * ch;
        const k = (png.pixels[o] >> 4) + ',' + (png.pixels[o + 1] >> 4) + ',' + (png.pixels[o + 2] >> 4);
        count.set(k, (count.get(k) ?? 0) + 1);
        n++;
      }
    }
    const modal = Math.max(...count.values()) / n;
    if (modal > 0.9 || count.size < 12) out.push('빈 그림(가장 흔한 색 ' + Math.round(modal * 100) + '%, ' + count.size + '색)');
  }
  const words = String(text).match(new RegExp(SCORE_RE.source, 'gi'));
  if (words) out.push('점수 말: ' + words.join(','));
  if (!String(text).trim()) out.push('카드에 담긴 글이 없음');
  for (const t of mustInclude) if (!String(text).replace(/\s+/g, '').includes(String(t).replace(/\s+/g, ''))) out.push('빠진 글: ' + t);
  return out;
}

// ───────── 요청·오류 감시 ─────────
// page의 응답·실패한 요청·콘솔 오류를 모은다. 바깥 요청은 openGame이 모은다.
export function watchPage(game) {
  const w = { failed: [], voice: [], voiceMissing: [], console: [] };
  const { page } = game;
  page.on('response', (res) => {
    const u = new URL(res.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    if (u.pathname.startsWith('/assets/audio/voice/')) {
      w.voice.push(u.pathname);
      if (!VOICE_PATHS.has(decodeURIComponent(u.pathname))) w.voiceMissing.push(u.pathname);
    }
    if (res.status() >= 400) w.failed.push(res.status() + ' ' + u.pathname);
  });
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    w.failed.push('실패(' + (req.failure()?.errorText ?? '?') + ') ' + u);
  });
  w.problems = () => [...w.failed, ...game.errors, ...game.external.map((u) => '바깥 요청 ' + u), ...w.voiceMissing.map((p) => '목록에 없는 낭송 조각 ' + p)];
  return w;
}

// ───────── '귀': 소리 판에 예약되는 소리를 엿듣는다(점검 도구 전용, 게임 상태는 바꾸지 않는다) ─────────
// 멈춤 진단에 쓰려고 누른 시각(소리 판 시계), 소리 판 상태 바뀜, 창 숨김·초점 바뀜도 적어 둔다(듣기만 한다).
function installEars() {
  const Orig = window.AudioContext;
  if (!Orig || window.__ears) return;
  const ears = { ctx: null, starts: [], taps: [], tapCount: 0, events: [] };
  Object.defineProperty(window, '__ears', { value: ears });
  const mark = (what) => { ears.events.push({ at: Math.round(performance.now()), what, t: ears.ctx ? +ears.ctx.currentTime.toFixed(3) : null }); if (ears.events.length > 60) ears.events.shift(); };
  // 소리 버퍼가 어느 파일에서 왔는지(불러온 주소 → 풀어낸 버퍼). 낭송 조각(audio/voice/)만 박으로 듣는다.
  // 박 알림(장구 한 번)·장구·종 같은 효과음과 딸깍 대신 소리는 박이 아니다.
  const urlOf = new WeakMap();
  const origFetch = window.fetch;
  window.fetch = async function (...a) {
    const res = await origFetch.apply(this, a);
    const url = res.url;
    const ab = res.arrayBuffer.bind(res);
    res.arrayBuffer = async () => { const b = await ab(); urlOf.set(b, url); return b; };
    return res;
  };
  window.AudioContext = class extends Orig {
    constructor(...a) {
      super(...a);
      ears.ctx = this;
      mark('소리 판 ' + this.state);
      this.addEventListener('statechange', () => mark('소리 판 ' + this.state));
    }
    decodeAudioData(ab, ...rest) {
      const url = urlOf.get(ab);
      return super.decodeAudioData(ab, ...rest).then((buf) => { if (url) urlOf.set(buf, url); return buf; });
    }
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
    // ahead: 미리 예약한 소리(낭송·박). 장구처럼 누르자마자 내는 소리는 false. voice: 낭송 조각 파일의 소리
    const src = urlOf.get(this.buffer) ?? '';
    const rec = { when: when || this.context.currentTime, dur: this.buffer?.duration ?? 0, ahead: when > this.context.currentTime, voice: src.includes('/audio/voice/'), src: src.replace(/^.*\/audio\//, '') };
    this.__ear = rec;
    ears.starts.push(rec);
    return start.call(this, when, ...rest);
  };
  // 예약을 거둔 소리(놓친 단위에서 멈춤, 회전 멈춤)는 그 시각이 와도 울리지 않는다
  const stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (...a) {
    if (this.__ear && this.__ear.stoppedAt === undefined) this.__ear.stoppedAt = a.length && a[0] > this.context.currentTime ? a[0] : this.context.currentTime;
    return stop.apply(this, a);
  };
  window.addEventListener('pointerdown', (ev) => {
    if (!ears.ctx) return;
    // 소리 엔진이 탭 시각을 셈하는 방식과 같게(사건 시각만큼 되돌림) 적는다. n: 그때까지 예약된 소리 수
    const lag = Math.max(0, performance.now() - ev.timeStamp) / 1000;
    ears.taps.push({ i: ears.tapCount++, t: ears.ctx.currentTime - lag, n: ears.starts.length, on: String(ev.target?.className ?? '') });
    if (ears.taps.length > 500) ears.taps.shift();
  }, true);
  document.addEventListener('visibilitychange', () => mark('창 ' + document.visibilityState));
  window.addEventListener('blur', () => mark('초점 잃음'));
  window.addEventListener('focus', () => mark('초점 얻음'));
}

// ───────── 멈춤 잡기: 끝없이 기다리지 않고 멈춘 자리를 진단한 뒤 실패한다 ─────────
// 가장 긴 두드리기(「상춘곡」)가 다시 듣기 없이 약 6분, 가장 긴 확인 줄 사이(보스 2·3단계)가 약 10분이다.
export const LIMITS = {
  idleTurns: 10,              // 낭송 박이 오지 않은 4초 차례가 이만큼 이어지면(약 40초) 멈춤
  beatPhaseMs: 15 * 60000,    // 두드리기 한 번(노래 한 편)의 상한
  remixMs: 15 * 60000,        // 보스 2단계 박자 방식의 상한
  measureMs: 25 * 60000,      // 재기 한 번(접기부터 감정서까지)의 상한
  waitMs: 90000,              // 재기 화면에 누를 것이 없는 상태가 이어지는 상한
  silentMs: 20 * 60000,       // 한 화면 완주에서 확인 줄(✓·✗)이 하나도 나오지 않는 상한
};

// 최근 기록(박마다 본 것 등). PT_DEBUG면 바로 찍고, 아니어도 멈춤 진단 때 끝 부분을 보인다.
const trail = [];
function note(line) {
  const s = new Date().toISOString().slice(11, 23) + ' ' + line;
  trail.push(s);
  if (trail.length > 200) trail.shift();
  if (process.env.PT_DEBUG) console.log('  ' + s);
}

// 페이지 안에서 지금 상태를 모은다(멈춤 진단). 혼자 서는 함수여야 한다(페이지로 넘겨진다).
async function stallState() {
  const e = window.__ears;
  const ctx = e?.ctx ?? null;
  const t0 = ctx ? ctx.currentTime : null;
  await new Promise((r) => setTimeout(r, 500));
  const t1 = ctx ? ctx.currentTime : null;
  const shown = (el) => !!el && !el.hidden && !el.closest('[hidden]') && el.getBoundingClientRect().width > 0;
  const key = (w) => [w.dataset.u, w.dataset.l, w.dataset.f].join('|');
  const m = document.querySelector('.measure');
  let measure = null;
  if (m) {
    const words = [...m.querySelectorAll('.m-text .m-word')];
    const cur = m.querySelector('.m-text .m-word.is-current');
    const listen = m.querySelector('.m-listen');
    measure = {
      step: m.dataset.step ?? null,
      tapMode: m.dataset.tapMode ?? null,
      hint: m.querySelector('.m-hint')?.textContent ?? null,
      page: m.querySelector('.m-page')?.textContent ?? null,
      layer: m.querySelector('.m-layer')?.dataset.layer ?? null,
      current: cur ? { key: key(cur), text: cur.textContent } : null,
      wordsOnPage: words.length ? key(words[0]) + ' … ' + key(words.at(-1)) + ' (' + words.length + ')' : '없음',
      lit: words.filter((w) => w.classList.contains('is-lit')).length,
      listen: listen ? { shown: shown(listen), disabled: listen.disabled } : null,
      drum: shown(m.querySelector('.m-drum')),
      controls: [...(m.querySelector('.m-controls')?.querySelectorAll('button') ?? [])].map((b) => b.className + (b.disabled ? '(꺼짐)' : '')),
      suggest: shown(m.querySelector('.m-suggest')),
      intro: m.querySelector('.m-intro')?.dataset.intro ?? null,
    };
  }
  let audio = '소리 판 없음(귀가 없거나 아직 만들지 않음)';
  if (ctx) {
    const starts = e.starts;
    // 누른 시각을 그 전에 예약된 소리 가운데 가장 가까운 것에 대 본다(ms, 늦으면 양수)
    const taps = e.taps.slice(-10).map((tp) => {
      let best = null;
      for (const s of starts.slice(0, tp.n)) if (s.ahead && (best === null || Math.abs(tp.t - s.when) < Math.abs(tp.t - best))) best = s.when;
      return { ago: +(t1 - tp.t).toFixed(1), deltaMs: best === null ? null : Math.round((tp.t - best) * 1000), on: tp.on.slice(0, 20) };
    });
    const last = starts.at(-1);
    const nextVoice = starts.filter((s) => s.voice && s.when > t1 && !(s.stoppedAt !== undefined && s.stoppedAt <= s.when)).sort((a, b) => a.when - b.when)[0];
    audio = {
      state: ctx.state,
      currentTime: +t1.toFixed(3),
      advancedIn500ms: +(t1 - t0).toFixed(3),
      scheduled: starts.length,
      lastStart: last ? { inSec: +(last.when - t1).toFixed(2), dur: +last.dur.toFixed(2) } : null,
      upcoming: starts.filter((s) => s.when > t1).length,
      nextVoice: nextVoice ? { inSec: +(nextVoice.when - t1).toFixed(2), src: nextVoice.src } : null,
      taps,
    };
  }
  return {
    place: document.querySelector('.play')?.dataset.place ?? null,
    boss: document.querySelector('.boss')?.dataset.stage ?? null,
    measure,
    audio,
    pageState: {
      visibility: document.visibilityState,
      focus: document.hasFocus(),
      portraitOverlay: shown(document.querySelector('.rotate-overlay')),
      appInert: !!document.getElementById('app')?.inert,
      dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(shown).map((d) => d.className),
      toasts: [...document.querySelectorAll('.story-toast, .play-toast')].filter(shown).map((t) => t.textContent.trim().slice(0, 40)),
      context: (() => { const b = document.querySelector('.world-context'); return b && !b.hidden ? b.textContent : null; })(),
    },
    events: e ? e.events.slice(-10) : null,
  };
}

// 감시견: 확인 줄이 LIMITS.silentMs 동안 나오지 않으면 진단을 남기고 실패로 세고 close()를 부른다(완주에서는
// 브라우저를 닫아 기다리던 조작이 모두 거절되게 한다). 그 뒤 hardStopMs 안에 disarm()되지 않으면 점검을 끝낸다.
function watchSilence(page, S, close, { hardStopMs = 120000 } = {}) {
  let hardStop = null;
  const dog = { fired: false };
  const timer = setInterval(async () => {
    if (dog.fired || Date.now() - progress.at < LIMITS.silentMs) return;
    dog.fired = true;
    clearInterval(timer);
    failures++;
    await stall(page, S, '확인 줄이 ' + Math.round(LIMITS.silentMs / 1000) + '초 동안 나오지 않음(마지막: ' + progress.last + ')');
    hardStop = setTimeout(() => { console.error('✗ ' + S.label + ': 감시견이 멈춘 뒤에도 끝나지 않아 점검을 끝낸다'); process.exit(1); }, hardStopMs);
    await close();
  }, Math.min(5000, Math.max(50, LIMITS.silentMs / 4)));
  dog.stop = () => clearInterval(timer);
  dog.disarm = () => { clearInterval(timer); if (hardStop) clearTimeout(hardStop); };
  return dog;
}

// 장구 탭이 예약된 박에서 얼마나 떨어졌는지(ms, 늦으면 양수). from: 이 번호 뒤의 탭만. 페이지로 넘겨진다.
function tapTiming(from) {
  const e = window.__ears;
  if (!e?.ctx) return null;
  const d = [];
  for (const tp of e.taps) {
    if (tp.i < from || !tp.on.includes('m-drum')) continue;
    let best = null;
    for (const s of e.starts.slice(0, tp.n)) if (s.ahead && s.voice && (best === null || Math.abs(tp.t - s.when) < Math.abs(tp.t - best))) best = s.when;
    if (best !== null) d.push(Math.round((tp.t - best) * 1000));
  }
  const sorted = [...d].sort((a, b) => a - b);
  return { next: e.tapCount, n: d.length, median: sorted[sorted.length >> 1] ?? null, max: sorted.at(-1) ?? null, over150: d.filter((x) => Math.abs(x) > 150).length };
}

// page.evaluate 같은 약속을 ms 안에 끝나지 않으면 timedOut 오류로 거절한다(렌더러가 멈추면 evaluate는 끝없이 기다린다)
function within(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error(ms / 1000 + '초 안에 답이 없음'), { timedOut: true })), ms); })]).finally(() => clearTimeout(t));
}

// 멈춤을 진단해 찍고(상태, 최근 기록, 그림) 던질 오류를 돌려준다.
async function stall(page, S, why) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shot = path.join(SHOTS, 'playthrough-' + S.id + '-stall-' + stamp + '.png');
  console.error((S.expected ? '· (예상한 멈춤) ' : '✗ ') + S.label + ' 멈춤: ' + why);
  try {
    const st = await within(page.evaluate(stallState), 15000);
    console.error('   상태:\n' + Object.entries(st).map(([k, v]) => '     ' + k + ': ' + JSON.stringify(v)).join('\n'));
  } catch (e) { console.error('   상태를 읽지 못함: ' + e.message); }
  try {
    await within(page.screenshot({ path: shot, timeout: 15000 }), 20000);
    console.error('   그림: ' + path.relative(ROOT, shot));
  } catch (e) { console.error('   그림을 남기지 못함: ' + e.message); }
  console.error('   최근 기록(끝 25줄):\n' + trail.slice(-25).map((l) => '     ' + l).join('\n'));
  const err = new Error(why);
  err.diagnosed = true;
  return err;
}

// ───────── 화면 도우미 ─────────
function makeUi(page, S) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const has = (sel) => ev((s) => !!document.querySelector(s), sel);
  const waitFn = (fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
  const waitSel = (sel, timeout = 20000) => waitFn((s) => !!document.querySelector(s), sel, timeout);
  const waitGone = (sel, timeout = 20000) => waitFn((s) => !document.querySelector(s), sel, timeout);
  // 실제 입력으로 누른다(보이고, 가려지지 않고, 멈춘 뒤). 손가락 화면이면 탭.
  async function press(sel, timeout = 20000) {
    const loc = page.locator(sel).first();
    if (S.touch) await loc.tap({ timeout });
    else await loc.click({ timeout });
  }
  async function pressAt(x, y) {
    if (S.touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  }
  const saved = () => ev((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE_KEY);
  const record = async () => { const d = await saved(); return d?.slots?.[d.lastSlotId] ?? null; };
  const place = () => ev(() => document.querySelector('.play')?.dataset.place ?? null);
  async function waitContext(prefix, timeout = 30000) {
    await waitFn((l) => { const b = document.querySelector('.world-context'); return !!b && !b.hidden && b.textContent.startsWith(l); }, prefix, timeout);
  }
  return { ev, has, waitFn, waitSel, waitGone, press, pressAt, saved, record, place, waitContext };
}

// ───────── 재기 화면(실제 입력) ─────────
// 지금 무엇을 누를지 정한다(페이지 안). info: { action, aaUnit, ranges, tool }
function measureNext(info) {
  const root = document.querySelector('.measure');
  if (!root) return { kind: 'done' };
  const sel = (e) => {
    if (e.matches('button.m-gap, button.m-word')) return '.measure .m-text button.' + (e.classList.contains('m-gap') ? 'm-gap' : 'm-word') + '[data-i="' + e.dataset.i + '"]';
    return null;
  };
  const intro = root.querySelector('.m-intro .m-intro-ok');
  if (intro) return { kind: 'intro', sel: '.measure .m-intro .m-intro-ok', intro: root.querySelector('.m-intro').dataset.intro };
  const suggest = root.querySelector('.m-suggest:not([hidden]) .m-suggest-no');
  if (suggest) return { kind: 'suggest', sel: '.measure .m-suggest-no' };
  const step = root.dataset.step;
  const next = root.querySelector('.m-next');
  const nextOk = next && !next.disabled && !next.closest('[hidden]');
  if (step === 'fold') {
    const gap = [...root.querySelectorAll('.m-text button.m-gap:not(.is-folded)')].find((g) => g.dataset.u !== g.dataset.nu);
    if (gap) return { kind: 'fold', sel: sel(gap) };
    if (nextOk) return { kind: 'page', sel: '.measure .m-next' };
    if (root.querySelector('button.m-fold-none')) return { kind: 'fold-none', sel: '.measure button.m-fold-none' };
  } else if (step === 'tap') {
    if (root.dataset.tapMode === 'beat') return { kind: 'beat' };
    if (root.dataset.tapMode === 'slash') {
      const groups = new Map();
      for (const w of root.querySelectorAll('.m-text button.m-word')) {
        const k = w.dataset.u + '|' + w.dataset.l + '|' + w.dataset.f;
        if (!groups.has(k) || Number(w.dataset.w) > Number(groups.get(k).dataset.w)) groups.set(k, w);
      }
      const target = [...groups.values()].find((w) => !w.classList.contains('has-slash'));
      if (target) return { kind: 'slash', sel: sel(target) };
      if (nextOk) return { kind: 'page', sel: '.measure .m-next' };
    }
  } else if (step === 'tools') {
    if (!info.toolUsed) return { kind: 'tool', sel: '.measure .m-tool[data-action="' + info.tool + '"]' };
    const f = root.querySelector('.m-finish');
    if (f && !f.disabled) return { kind: 'finish', sel: '.measure .m-finish' };
  } else if (step === 'action') {
    const box = root.querySelector('.m-action');
    if (!box) return { kind: 'wait' };
    const act = box.dataset.action;
    const none = box.querySelector('button.m-none:not([disabled])');
    if (act === 'stairs') {
      const l = box.querySelector('button.m-letter:not(.is-done)');
      if (l) return { kind: 'letter', sel: '.measure .m-action button.m-letter:not(.is-done)' };
      if (none) return { kind: 'none', sel: '.measure .m-action button.m-none' };
    } else if (act === 'aa-door') {
      const head = [...root.querySelectorAll('.m-text button.m-word.is-target')].find((w) => w.dataset.w === '0' && w.dataset.f === '0' && (w.dataset.l === '' || w.dataset.l === '0'));
      if (head) return { kind: 'aa', sel: sel(head) };
      if (nextOk) return { kind: 'page', sel: '.measure .m-next' };
    } else if (act === 'refrain-link') {
      if (!info.ranges.length) { if (none) return { kind: 'none', sel: '.measure .m-action button.m-none' }; }
      const inRange = (w) => info.ranges.some((r) => r.unit === Number(w.dataset.u) && r.line === Number(w.dataset.l) && Number(w.dataset.f) >= r.from && Number(w.dataset.f) <= r.to);
      const w = [...root.querySelectorAll('.m-text button.m-word:not(.is-linked)')].find(inRange);
      if (w) return { kind: 'refrain', sel: sel(w) };
      // 마지막 쪽까지 왔는데 앞쪽에 아직 잇지 않은 후렴이 남았으면(누르기가 빗나간 경우 등) 첫 쪽으로 되돌아가 다시 찾는다
      const prev = root.querySelector('.m-prev');
      const prevOk = prev && !prev.disabled && !prev.closest('[hidden]');
      if (info.rewinding && prevOk) return { kind: 'page-back', sel: '.measure .m-prev' };
      if (nextOk) return { kind: 'page', sel: '.measure .m-next' };
      if (prevOk) return { kind: 'page-back', sel: '.measure .m-prev' };
    } else if (act === 'walk') {
      const b = box.querySelector('button.m-walk-step');
      if (b && !b.disabled) return { kind: 'walk', sel: '.measure .m-action button.m-walk-step' };
    } else if (act === 'rapid-unroll') {
      const b = box.querySelector('button.m-unroll-btn');
      if (b && !b.disabled) return { kind: 'unroll', sel: '.measure .m-action button.m-unroll-btn' };
      if (none) return { kind: 'none', sel: '.measure .m-action button.m-none' };
    }
  } else if (step === 'sheet') {
    return { kind: 'sheet', sel: '.measure .m-finish', sheet: root.querySelector('.m-side')?.textContent ?? '' };
  }
  return { kind: 'wait' };
}

// 박자 두드리기: 귀로 낭송을 듣고(소리 판에 예약된 낭송 조각의 시각) 그 조각이 울리는 때에 장구를 친다.
// 화면의 '지금 울리는 음보' 표시는 입구·향가관과 다시 듣기에서만 보이므로 기대지 않는다. 박 알림(새로 시작할 때의
// 장구 한 번)은 효과음이라 낭송 조각이 아니므로 치지 않는다. 고려가요 여음·후렴 조각에 친 탭은 판정 창 밖이라 무시된다.
// 한 단위에서 박을 놓치면 게임이 그 단위에서 멈추고 다시 들려준다(실패 아님). 예약을 거둔 조각(멈춘 단위 뒤)은 치지 않는다.
// 빗금 권유는 '계속 칠래요'로 넘긴다. '같은 걸음으로 넘기기'는 누르지 않고 끝까지 친다.
async function beatTapping(page, ui, S, stats) {
  const drumBox = async () => (await page.locator('.measure .m-drum').boundingBox());
  if (await ui.ev(() => { const b = document.querySelector('.measure .m-listen'); return !!b && !b.disabled; })) await ui.press('.measure .m-listen');
  // 마우스는 장구 위에 둔 채 누르기만 한다(박마다 옮기면 그만큼 늦게 친다). 다른 단추(듣기, 빗금 권유의
  // '계속 칠래요')를 누르면 마우스가 그 단추로 가므로, 그 뒤에는 장구 자리를 다시 재고 장구 위로 옮긴다.
  // 옮기지 않으면 그 뒤의 탭이 모두 장구 밖에 떨어져 같은 단위를 끝없이 다시 듣는다.
  let box = null;
  const toDrum = async () => {
    box = await drumBox();
    if (!S.touch && box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  };
  await toDrum();
  const started = Date.now();
  const tapsBefore = stats.taps;
  const tapFrom = await ui.ev(() => window.__ears?.tapCount ?? 0);
  // 이 시각 뒤에 울리는 낭송 조각만 친다(앞 노래·앞 단계에서 예약된 것은 듣지 않는다)
  let after = await ui.ev(() => window.__ears?.ctx?.currentTime ?? 0);
  const heard = new Set();   // 이번 노래에서 친 낭송 조각(다시 울리면 그 단위를 놓쳐 다시 듣는 것)
  let lastLanded = -1;       // 마지막으로 확인한 탭 기록 번호
  let idle = 0;
  for (;;) {
    if (Date.now() - started > LIMITS.beatPhaseMs) {
      throw await stall(page, S, '두드리기가 ' + LIMITS.beatPhaseMs / 60000 + '분 안에 끝나지 않음(이번 노래에서 ' + (stats.taps - tapsBefore) + '번 침, 탭 시각 ' + JSON.stringify(await within(ui.ev(tapTiming, tapFrom), 10000).catch(() => null)) + ')');
    }
    // 다음 낭송 조각이 울리는 때, 또는 단계 바뀜·빗금 권유·듣기 단추를 기다린다(4초까지)
    const r = await within(page.evaluate((afterT) => new Promise((resolve) => {
      const look = () => {
        const m = document.querySelector('.measure');
        if (!m || m.dataset.step !== 'tap' || m.dataset.tapMode !== 'beat') return { kind: 'end' };
        if (m.querySelector('.m-suggest:not([hidden])')) return { kind: 'suggest' };
        const l = m.querySelector('.m-listen');
        if (l && !l.disabled) return { kind: 'listen' };
        const e = window.__ears;
        if (!e?.ctx) return null;
        const t = e.ctx.currentTime;
        let next = null;
        for (const s of e.starts) {
          if (!s.voice || s.when <= afterT + 1e-4) continue;
          if (s.stoppedAt !== undefined && s.stoppedAt <= s.when) continue;   // 거둔 예약
          if (!next || s.when < next.when) next = s;
        }
        if (next && t >= next.when - 0.004) {
          const d = m.querySelector('.m-drum')?.getBoundingClientRect();
          return { kind: 'beat', when: next.when, src: next.src, lateMs: Math.round((t - next.when) * 1000), drum: d && d.width ? { x: d.x, y: d.y, width: d.width, height: d.height } : null };
        }
        return null;
      };
      const t0 = performance.now();
      const poll = () => {
        const v = look();
        if (v) { resolve(v); return; }
        if (performance.now() - t0 > 4000) { resolve({ kind: 'idle' }); return; }
        setTimeout(poll, 2);
      };
      poll();
    }), after), 30000).catch(async (e) => {
      if (e.timedOut) throw await stall(page, S, '페이지가 30초 동안 답하지 않음(렌더러가 멈췄을 수 있음)');
      throw e;
    });
    note('박 ' + JSON.stringify(r));
    if (r.kind === 'idle') {
      if (++idle >= LIMITS.idleTurns) throw await stall(page, S, '두드리기에서 낭송 박이 ' + idle * 4 + '초 동안 오지 않음');
      continue;
    }
    idle = 0;
    if (r.kind === 'end') {
      const tt = await within(ui.ev(tapTiming, tapFrom), 10000).catch(() => null);
      note('두드리기 끝: 탭 시각 ' + JSON.stringify(tt));
      if (tt) { stats.lateTaps = (stats.lateTaps ?? 0) + tt.over150; stats.worstTapMs = Math.max(stats.worstTapMs ?? 0, Math.abs(tt.max ?? 0), Math.abs(tt.median ?? 0)); }
      return;
    }
    if (r.kind === 'suggest') { stats.suggest++; await ui.press('.measure .m-suggest-no'); await toDrum(); continue; }
    if (r.kind === 'listen') { await ui.press('.measure .m-listen'); await toDrum(); continue; }
    if (r.kind === 'beat') {
      after = r.when;
      if (heard.has(r.src)) { stats.replayFeet = (stats.replayFeet ?? 0) + 1; note('다시 듣기 ' + r.src); }
      heard.add(r.src);
      // 장구 자리가 바뀌었으면(쪽 다시 나누기, 안내 글 줄바꿈, 넘기기 단추 등) 치기 전에 그리로 옮긴다
      if (r.drum && (!box || Math.abs(r.drum.x - box.x) > 1 || Math.abs(r.drum.y - box.y) > 1 || Math.abs(r.drum.width - box.width) > 1 || Math.abs(r.drum.height - box.height) > 1)) {
        box = r.drum;
        if (!S.touch) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        note('장구 자리 다시 잼');
      }
      if (!box) await toDrum();
      if (!box) continue;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      if (S.touch) await page.touchscreen.tap(x, y);
      else { await page.mouse.down(); await page.mouse.up(); }
      stats.taps++;
      // 방금 탭이 어디에 떨어졌는지 귀의 기록으로 본다(장구 밖이면 같은 단위를 끝없이 다시 듣게 된다)
      const landed = await page.evaluate(() => {
        const last = window.__ears?.ctx ? window.__ears.taps.at(-1) : null;
        return last ? { i: last.i, on: last.on } : null;
      });
      if (landed && landed.i !== lastLanded) {
        lastLanded = landed.i;
        if (!landed.on.includes('m-drum')) throw await stall(page, S, '탭이 장구가 아닌 곳(' + (landed.on || '이름 없는 요소') + ')에 떨어짐');
      }
    }
  }
}

// 재기 하나를 끝까지(접기 → 두드리기·빗금 → 고유 동작 → 감정서). 돌려주는 값: { intros, sheet, steps }
async function solveMeasure(page, ui, S, info, stats) {
  const intros = [];
  const steps = [];
  let sheet = '';
  info = { ...info, toolUsed: false };
  const started = Date.now();
  let waitSince = null;
  for (let guard = 0; guard < 4000;) {
    if (Date.now() - started > LIMITS.measureMs) throw await stall(page, S, '재기가 ' + LIMITS.measureMs / 60000 + '분 안에 끝나지 않음 ' + JSON.stringify(steps));
    const n = await ui.ev(measureNext, info);
    if (n.kind === 'done') return { intros, sheet, steps };
    if (steps.at(-1) !== n.kind) { steps.push(n.kind); note('재기 ' + n.kind); }
    if (n.kind === 'wait') {
      waitSince ??= Date.now();
      if (Date.now() - waitSince > LIMITS.waitMs) throw await stall(page, S, '재기 화면에 누를 것이 ' + LIMITS.waitMs / 1000 + '초 동안 없음 ' + JSON.stringify(steps));
      await sleep(60);
      continue;
    }
    waitSince = null;
    guard++;
    if (n.kind === 'beat') { await beatTapping(page, ui, S, stats); continue; }
    if (n.kind === 'intro') intros.push(n.intro);
    if (n.kind === 'sheet') sheet = n.sheet;
    if (n.kind === 'tool') info.toolUsed = true;
    if (n.kind === 'page-back') info.rewinding = true;
    else if (n.kind === 'page' || n.kind === 'refrain') info.rewinding = false;
    try {
      await ui.press(n.sel, 8000);
    } catch (e) {
      // 누를 것이 그사이 바뀌었으면(쪽 넘김, 단계 바뀜) 다시 본다
      if (!(await ui.has('.measure'))) return { intros, sheet, steps };
      stats.retries++;
      if (stats.retries > 200) throw e;
    }
    if (n.kind === 'walk') await ui.waitFn(() => { const b = document.querySelector('.measure .m-action button.m-walk-step'); return !b || !b.disabled; }, null, 60000);
  }
  throw await stall(page, S, '재기에서 4000번 눌러도 끝나지 않음 ' + JSON.stringify(steps));
}

function actionInfo(actionId, s, tool = null) {
  return { action: actionId, tool, ranges: (s.features?.refrains ?? []).flatMap((r) => r.ranges) };
}

// ───────── 3D 걷기: 바닥을 눌러 목표 자리까지 간다 ─────────
// 학생처럼 화면에 보이는 바닥을 누른다. 목표가 화면 밖이면 목표 쪽으로 보이는 만큼 먼저 간다.
async function walk3D(page, ui, target, near = 0.6) {
  let d = Infinity;
  let tapped = false;
  for (let i = 0; i < 30; i++) {
    await ui.ev(async () => { window.__ptWorld = await import('/js/world/world.js'); });
    const s = await ui.ev((t) => Promise.resolve(window.__ptWorld).then((w) => {
      const p = w.getPlayer();
      const view = document.querySelector('.world-view').getBoundingClientRect();
      const dist = Math.hypot(t.x - p.x, t.z - p.z);
      for (const k of [1, 0.75, 0.5, 0.35, 0.2, 0.1]) {
        const q = { x: p.x + (t.x - p.x) * k, y: 0, z: p.z + (t.z - p.z) * k };
        const sp = w.toScreen(q);
        if (!sp) continue;
        const inside = sp.x > view.left + 40 && sp.x < view.right - 40 && sp.y > view.top + 70 && sp.y < view.bottom - 50;
        const hit = inside ? document.elementFromPoint(sp.x, sp.y) : null;
        if (inside && hit && hit.closest('.world-view') && !hit.closest('button')) return { d: dist, x: sp.x, y: sp.y };
      }
      return { d: dist, x: null };
    }), target);
    d = s.d;
    if (d < near && tapped) return d;
    if (s.x === null) throw new Error('걸어갈 바닥 점을 찾지 못함');
    await ui.pressAt(s.x, s.y);
    tapped = true;
    // 도착할 때까지(도착하면 도착 표시가 사라진다)
    await ui.waitFn(() => !window.__ptWorld.getMarker().visible, null, 30000);
  }
  return d;
}

// 회랑에서 관 문으로 가 들어간다
async function enterWingFromCorridor(page, ui, S, wingId) {
  const name = wingById(wingId).name;
  if (S.disable3d) {
    await ui.press(`.board-door[data-wing="${wingId}"]`);
  } else {
    const i = ['entrance', ...PLAY_WING_IDS].indexOf(wingId);
    await walk3D(page, ui, { x: i * 16, z: -1.6 });
  }
  await ui.waitContext('들어가기 — ' + name);
  await ui.press('.world-context');
  await ui.waitFn((w) => document.querySelector('.play')?.dataset.place === w, wingId, 30000);
}

// 들어가기 글·먹안개 속 좀이 있으면 닫는다(좀은 누를 수 없고 저절로 사라진다)
async function closeWingIntro(ui) {
  if (await ui.has('.story-wing-intro')) {
    await ui.press('.story-wing-intro .story-wing-intro-close');
    await ui.waitGone('.story-wing-intro');
  }
}

// 떠도는(또는 입구에서 기다리는) 노래를 잡아 잰다
// 떠도는 노래 단추는 늘 둥실거려서(play-float) Playwright의 click·tap이 '멈춘 요소'를 기다리다 시간이 다 된다.
// 학생처럼 지금 보이는 자리의 가운데를 누른다. 그 자리 맨 위가 그 단추일 때만 누르고, 잡기 안내가 뜰 때까지 다시 본다.
async function pressFloatingSong(ui, id) {
  const sel = `.play-song[data-song="${id}"]`;
  await ui.waitSel(sel);
  for (let k = 0; k < 20; k++) {
    const pt = await ui.ev((s) => {
      const b = document.querySelector(s);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return top && (top === b || b.contains(top)) ? { x, y } : null;
    }, sel);
    if (pt) {
      await ui.pressAt(pt.x, pt.y);
      try { await ui.waitContext('잡기', 15000); return; } catch { /* 빗나갔으면 다시 */ }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('떠도는 노래 「' + id + '」를 누르지 못함');
}

async function catchAndMeasure(page, ui, S, wingId, id, stats) {
  await pressFloatingSong(ui, id);
  // 잡기 단추를 누르는 사이 재기 화면이 이미 열렸으면(단추가 사라져 Playwright가 기다리다 끝남) 그대로 잇는다
  try { await ui.press('.world-context'); } catch (e) { if (!(await ui.has('.world.is-split .measure'))) throw e; }
  await ui.waitSel('.world.is-split .measure', 20000);
  const r = await solveMeasure(page, ui, S, actionInfo(ACTION_OF[wingId], song(id)), stats);
  await ui.waitSel(`.play-hand-song[data-song="${id}"]`, 20000);
  return r;
}

async function openSpot(ui, sel, label) {
  await ui.press(sel);
  await ui.waitContext(label);
  await ui.press('.world-context');
}

async function placeInto(ui, area, index, id, to = null) {
  const sel = area === 'basket' ? '.play-spine[data-area="basket"][data-index="0"]' : `.play-spine[data-area="${area}"][data-index="${index}"]`;
  const wrongBefore = await wrongTotal(ui);
  await openSpot(ui, sel, '꽂기');
  await ui.waitSel('.play-dialog');
  await ui.press(`.play-dialog .play-pick[data-song="${id}"]`);
  if (area === 'basket') {
    await ui.waitSel('.play-dialog .play-dest');
    await ui.press(`.play-dialog .play-dest[data-wing="${to}"]`);
  }
  await ui.waitGone('.play-dialog', 10000);
  // 판정에서 돌아온 노래가 있으면(오답 수가 늘면) 맞대어 보기 창이 뜰 수 있다. 실제 입력으로 푼다
  if ((await wrongTotal(ui)) > wrongBefore) await resolveContrast(ui);
}

// 기록의 관 오답 수 합(판정에서 돌아온 노래가 있었는지 보는 데만 쓴다)
async function wrongTotal(ui) {
  const rec = await ui.record();
  return PLAY_WING_IDS.reduce((n, w) => n + (rec?.progress?.wings?.[w]?.wrongCount ?? 0), 0);
}

// 맞대어 보기 창(오답 뒤): 감정서 줄을 위에서부터 차례로 실제로 눌러, 짝이 지어지면 '손에 다시 들기'를 누른다.
// 어긋나지 않는 줄은 흔들리기만 하므로 다음 줄로 간다(두 번 뒤에는 어긋나는 줄이 살짝 빛나지만 차례대로 눌러도 닿는다).
// 돌아온 노래마다 창이 하나씩이고, 어긋나는 줄이 없는 노래는 창이 열리지 않는다. 창이 더 뜨지 않을 때까지 푼다.
async function resolveContrast(ui) {
  for (let panels = 0; panels < 4; panels++) {
    const appeared = await ui.waitSel('.play-contrast', 4000).then(() => true, () => false);
    if (!appeared) return panels;
    const song = await ui.ev(() => document.querySelector('.play-contrast')?.dataset.song ?? null);
    const n = await ui.ev(() => document.querySelectorAll('.play-contrast .play-contrast-line').length);
    for (let i = 0; i < n; i++) {
      if (await ui.has('.play-contrast .play-contrast-back:not([hidden])')) break;
      const sel = `.play-contrast li:nth-child(${i + 1}) > .play-contrast-line`;
      if (!(await ui.ev((s) => { const b = document.querySelector(s); return !!b && !b.disabled; }, sel))) continue;
      await ui.press(sel);
    }
    if (!(await ui.has('.play-contrast .play-contrast-back:not([hidden])'))) throw new Error('맞대어 보기 창을 풀지 못함: ' + song);
    await ui.press('.play-contrast .play-contrast-back');
    await ui.waitFn((x) => document.querySelector('.play-contrast')?.dataset.song !== x || !document.querySelector('.play-contrast'), song, 10000);
  }
  return 4;
}

// 가객 → 기념품 연출을 넘긴다
async function ceremony(ui) {
  await ui.waitSel('.play-singers', 20000);
  for (let i = 0; i < 6 && (await ui.has('.play-singers .play-singer')); i++) {
    const id = await ui.ev(() => document.querySelector('.play-singers .play-singer')?.dataset.song);
    await ui.press('.play-singers .play-next');
    await ui.waitFn((x) => document.querySelector('.play-singers .play-singer')?.dataset.song !== x, id, 20000);
  }
  await ui.waitSel('.play-keepsakes', 20000);
  await ui.press('.play-keepsakes .play-close');
  await ui.waitGone('.play-keepsakes');
}

// 카드 내려받기: 실제 단추를 누르고 내려받기 사건을 기다린다. 돌려주는 값: { name, buf, text }
async function downloadCard(page, ui, scopeSel) {
  await ui.waitSel(scopeSel + ' .card-view-download:not([disabled])', 30000);
  await ui.waitFn((s) => (document.querySelector(s + ' canvas')?.getAttribute('aria-label') ?? '').length > 0, scopeSel, 30000);
  const text = await ui.ev((s) => document.querySelector(s + ' canvas').getAttribute('aria-label'), scopeSel);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), ui.press(scopeSel + ' .card-view-download')]);
  const file = await dl.path();
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(file), text };
}

// ───────── 작품 방 다섯(실제 입력) ─────────
const ROOMS = {
  async hyangga(ui) {
    await ui.waitSel('.rh-room .rh-start', 30000);
    await ui.press('.rh-room .rh-start');
    await ui.waitFn(() => document.querySelector('.rh-room')?.dataset.phase === 'catch', null, 30000);
    for (let i = 0; i < 8; i++) {
      await ui.waitFn((u) => document.querySelector('.rh-room')?.dataset.unit === String(u) || document.querySelector('.rh-room')?.dataset.phase !== 'catch', i, 60000);
      if ((await ui.ev(() => document.querySelector('.rh-room')?.dataset.phase)) !== 'catch') break;
      await ui.press('.rh-room .rh-act');
      await ui.waitFn((u) => document.querySelector('.rh-room')?.dataset.unit !== String(u) || document.querySelector('.rh-room')?.dataset.phase !== 'catch', i, 60000);
    }
    await ui.waitFn(() => document.querySelector('.rh-room')?.dataset.phase === 'sweep', null, 60000);
    for (let k = 0; k < 12 && (await ui.ev(() => document.querySelector('.rh-room')?.dataset.phase)) === 'sweep'; k++) {
      const before = await ui.ev(() => document.querySelector('.rh-room').dataset.swept);
      await ui.press('.rh-room .rh-act');
      await ui.waitFn((b) => document.querySelector('.rh-room')?.dataset.swept !== b || document.querySelector('.rh-room')?.dataset.phase !== 'sweep', before, 60000);
    }
    await ui.waitFn(() => document.querySelector('.rh-room')?.dataset.phase === 'ask', null, 90000);
    await ui.press(`.rh-room .rh-choice[data-id="${HYANGGA_INTERP[0].id}"]`);
    await ui.press('.rh-room .rh-confirm');
    return [HYANGGA_INTERP[0].text];
  },
  async goryeo(ui) {
    await ui.waitSel('.room-goryeo button.rg-card', 30000);
    for (const c of [GORYEO_ROOM.cards[0], GORYEO_ROOM.cards[2]]) {
      await ui.waitFn(() => document.querySelector('.room-goryeo')?.dataset.step === 'pick', null, 90000);
      await ui.press(`.room-goryeo button.rg-card[data-card-id="${c.id}"]`);
      await ui.waitFn((id) => document.querySelector('.room-goryeo .rg-slip')?.dataset.cardId === id, c.id, 30000);
    }
    await ui.press('.room-goryeo button.rg-to-final', 90000);
    await ui.waitFn(() => document.querySelector('.room-goryeo')?.dataset.step === 'final', null, 90000);
    await ui.press('.room-goryeo button.rg-discover', 90000);
    await ui.waitFn(() => document.querySelector('.room-goryeo')?.dataset.step === 'discover', null, 90000);
    await ui.press(`.room-goryeo button.rg-tab[data-unit="${GORYEO_ROOM.echo.unit}"]`);
    await ui.waitSel('.room-goryeo.is-match', 30000);
    await ui.press('.room-goryeo button.rg-finish', 90000);
    return [GORYEO_ROOM.cards[2].label];
  },
  async sijo(ui) {
    await ui.waitFn(() => document.querySelector('.room-sijo')?.dataset.phase === 'place', null, 90000);
    for (const [item, slot] of [['dal', 0], ['na', 1], ['cheongpung', 2]]) {
      await ui.press(`.room-sijo .sj-item[data-item="${item}"]`);
      await ui.press(`.room-sijo .sj-slot[data-slot="${slot}"]`);
    }
    await ui.press('.room-sijo .sj-confirm');
    await ui.waitFn(() => document.querySelector('.room-sijo')?.dataset.phase === 'reveal', null, 90000);
    await ui.waitFn(() => { const b = document.querySelector('.room-sijo .sj-next'); return !!b && !b.disabled && !b.hidden; }, null, 90000);
    await ui.press('.room-sijo .sj-next');
    await ui.waitFn(() => document.querySelector('.room-sijo')?.dataset.phase === 'gangsan', null, 90000);
    await ui.press('.room-sijo .sj-item[data-item="gangsan"]');
    await ui.press('.room-sijo .sj-slot[data-slot="outside"]');
    await ui.waitFn(() => document.querySelector('.room-sijo')?.dataset.phase === 'pullback', null, 90000);
    await ui.waitFn(() => { const b = document.querySelector('.room-sijo .sj-next'); return !!b && !b.disabled && !b.hidden; }, null, 90000);
    await ui.press('.room-sijo .sj-next');
    await ui.waitFn(() => document.querySelector('.room-sijo')?.dataset.phase === 'interpret', null, 90000);
    await ui.press('.room-sijo .sj-finish');
    return ['달 · 나 · 청풍', '강산'];
  },
  async gasa(ui) {
    await ui.waitSel('.rg-room .rg-begin', 30000);
    await ui.press('.rg-room .rg-begin');
    const words = [];
    for (let guard = 0; guard < 400; guard++) {
      const ph = await ui.ev(() => document.querySelector('.rg-room')?.dataset.phase ?? null);
      if (ph === null) break;
      if (ph === 'walk' || ph === 'collect') {
        if (ph === 'collect') {
          const chip = await ui.ev(() => { const c = document.querySelector('.rg-room .rg-chip:not(.is-taken):not(.rg-letgo)'); return c ? { id: c.dataset.wordId, text: c.textContent } : null; });
          const taken = await ui.ev(() => document.querySelectorAll('.rg-room .rg-chip.is-taken').length);
          if (chip && taken === 0) {
            await ui.press(`.rg-room .rg-chip[data-word-id="${chip.id}"]`);
            words.push(chip.text);
            await ui.waitFn((i) => !document.querySelector(`.rg-room .rg-chip[data-word-id="${i}"]`) || document.querySelector(`.rg-room .rg-chip[data-word-id="${i}"]`).classList.contains('is-taken'), chip.id);
          }
        }
        await ui.waitFn(() => { const b = document.querySelector('.rg-room .rg-step'); return !b || !b.disabled; }, null, 90000);
        const u = await ui.ev(() => document.querySelector('.rg-room')?.dataset.unit ?? null);
        if (u === null) break;
        if (!(await ui.has('.rg-room .rg-step'))) continue;
        await ui.press('.rg-room .rg-step');
        await ui.waitFn((n) => !document.querySelector('.rg-room') || document.querySelector('.rg-room').dataset.unit !== n || ['letgo', 'finale'].includes(document.querySelector('.rg-room').dataset.phase), u, 90000);
        await ui.waitFn(() => !document.querySelector('.rg-room') || document.querySelector('.rg-room').dataset.busy !== '1', null, 90000);
      } else if (ph === 'letgo') {
        const ids = await ui.ev(() => [...document.querySelectorAll('.rg-room .rg-letgo:not(.is-gone)')].map((c) => c.dataset.wordId));
        for (const id of ids) await ui.press(`.rg-room .rg-letgo[data-word-id="${id}"]`);
        await ui.waitFn(() => document.querySelector('.rg-room')?.dataset.phase !== 'letgo', null, 60000);
      } else if (ph === 'finale') {
        await ui.press('.rg-room .rg-finish');
        break;
      } else {
        await sleep(100);
      }
    }
    return words;
  },
  async saseol(ui) {
    await ui.waitSel('.rs-room .rs-start', 30000);
    await ui.press('.rs-room .rs-start');
    await ui.waitFn(() => document.querySelector('.rs-room')?.dataset.phase === 'run', null, 30000);
    for (let i = 0; i < 400 && (await ui.ev(() => document.querySelector('.rs-room')?.dataset.phase)) === 'run'; i++) {
      const mode = await ui.ev(() => document.querySelector('.rs-room')?.dataset.runMode);
      if (mode === 'beat') { await sleep(250); continue; }   // 박자 방식은 낭송이 저절로 달린다(두드림은 덤)
      try { await ui.press('.rs-room .rs-run', 5000); } catch { /* 달리기가 끝났다 */ }
    }
    await ui.waitFn(() => document.querySelector('.rs-room')?.dataset.phase === 'predict', null, 120000);
    await ui.press('.rs-room .rs-choice[data-id="nim"]');
    await ui.waitFn(() => document.querySelector('.rs-room')?.dataset.phase === 'reveal', null, 30000);
    await ui.press('.rs-room .rs-next', 90000);
    await ui.waitFn(() => document.querySelector('.rs-room')?.dataset.phase === 'final', null, 90000);
    await ui.press('.rs-room .rs-finish', 90000);
    return [roomSaseol.candidates.find((c) => c.id === 'nim').text];
  },
};


// 화면을 덮는 장면(보스, 엔딩) 위로 다른 것이 비치지 않는지: 남은 알림, 한 판 위 띠 단추가 그 점에서 보이면 문제
function coverProblems(sceneSel) {
  const out = [];
  const scene = document.querySelector(sceneSel);
  if (!scene) return ['장면 없음 ' + sceneSel];
  const r = scene.getBoundingClientRect();
  if (r.left > 1 || r.top > 1 || r.right < innerWidth - 1 || r.bottom < innerHeight - 1) out.push('화면 전체를 덮지 않음 ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
  for (const e of document.querySelectorAll('.story-toast, .play-hud button, .play-toast')) {
    const b = e.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    // 누를 수 없게 해 둔 알림도 보이면 문제이므로 잠깐 누를 수 있게 하고 맨 위에 있는지 본다
    const before = e.style.getPropertyValue('pointer-events');
    e.style.setProperty('pointer-events', 'auto', 'important');
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (before) e.style.setProperty('pointer-events', before); else e.style.removeProperty('pointer-events');
    if (top && (top === e || e.contains(top))) out.push('장면 위로 보임: ' + e.className + ' "' + e.textContent.trim().slice(0, 16) + '"');
  }
  return out;
}

// ───────── 보스 ─────────
// 보스 2단계 박자 방식: 리믹스를 들으며 갈래가 바뀌는 단위가 시작될 때 '바뀌었다'를 탭한다.
// 지금 낭송 줄(.boss-remix-now)의 글로 어느 단위인지 알아듣는다(학생이 귀로 듣는 것과 같은 정보).
const REMIX_GRID = R.buildRemixGrid(remix, song);
const REMIX_TEXT = REMIX_GRID.segments.map((seg) => {
  const s = song(seg.songId);
  const u = s.units[seg.unit];
  if (s.genre === 'hyangga') return u.reading;
  if (s.genre === 'goryeo') return joinFeet(u.lines[seg.line].feet, 'reading');   // 낱말 안 나눔(joined)은 붙여 잇는다(보스 화면과 같은 글)
  return u.feet.map((f) => f.reading).join(' ');
});

async function remixBeat(page, ui, S, stats) {
  const switchTexts = REMIX_GRID.switches.map((i) => REMIX_TEXT[i]);
  const started = Date.now();
  let idle = 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (Date.now() - started > LIMITS.remixMs) throw await stall(page, S, '보스 2단계가 ' + LIMITS.remixMs / 60000 + '분 안에 끝나지 않음');
    const st =await ui.ev(() => ({ stage: document.querySelector('.boss')?.dataset.stage, listen: (() => { const b = document.querySelector('.boss .boss-remix-listen'); return !!b && !b.disabled; })() }));
    if (st.stage !== 'stage2') return;
    if (st.listen) { await ui.press('.boss .boss-remix-listen'); continue; }
    // 다음 줄이 바뀔 때까지(바뀌는 즉시)
    const r = await page.evaluate((prevText) => new Promise((resolve) => {
      const look = () => {
        if (document.querySelector('.boss')?.dataset.stage !== 'stage2') return { kind: 'end' };
        const l = document.querySelector('.boss .boss-remix-listen');
        if (l && !l.disabled) return { kind: 'listen' };
        const t = document.querySelector('.boss .boss-remix-now')?.textContent ?? '';
        if (t && t !== prevText) return { kind: 'line', text: t };
        return null;
      };
      const v = look();
      if (v) { resolve(v); return; }
      const mo = new MutationObserver(() => { const x = look(); if (x) { mo.disconnect(); clearTimeout(tm); resolve(x); } });
      mo.observe(document.querySelector('.boss') ?? document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-stage', 'disabled'] });
      const tm = setTimeout(() => { mo.disconnect(); resolve(look() ?? { kind: 'idle' }); }, 5000);
    }), stats.lastLine ?? null);
    note('리믹스 ' + JSON.stringify(r));
    if (r.kind === 'end') return;
    if (r.kind === 'idle') {
      if (++idle >= LIMITS.idleTurns) throw await stall(page, S, '보스 2단계에서 낭송 줄이 ' + idle * 5 + '초 동안 바뀌지 않음');
    } else idle = 0;
    if (r.kind !== 'line') { stats.lastLine = null; continue; }
    stats.lastLine = r.text;
    if (switchTexts.includes(r.text)) {
      const box = await page.locator('.boss .boss-remix-tap').boundingBox();
      if (box) {
        if (S.touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        stats.remixTaps++;
      }
    }
  }
  throw await stall(page, S, '2단계가 2000번 차례 안에 끝나지 않음');
}

async function runBoss(page, ui, S, stats) {
  await ui.press('.story-boss-door');
  await ui.waitSel('.story-boss-host .boss', 30000);
  const cov = await ui.ev(coverProblems, '.story-boss-host');
  ok(cov.length === 0, S.label + ' 보스 화면이 회랑의 알림과 위 띠를 모두 덮는다 ' + JSON.stringify(cov));
  const passIntro = async (stage) => {
    await ui.waitFn((s) => document.querySelector('.boss')?.dataset.stage === s, stage, 60000);
    await ui.waitFn(() => !!document.querySelector('.boss .boss-go, .boss .boss-song, .boss .boss-remix, .boss .boss-swallowed'), null, 30000);
    if (await ui.has('.boss .boss-go')) await ui.press('.boss .boss-go');
  };
  await passIntro('stage1');
  const order = BOSS_TABLE.unseenOrder.map((g) => BOSS_TABLE.unseen[g]);
  const seen = [];
  const tools = ['stairs', 'rapid-unroll', 'aa-door', 'stairs', 'rapid-unroll'];
  for (let k = 0; k < order.length; k++) {
    await ui.waitSel('.boss .boss-song[data-song]', 60000);
    const id = await ui.ev(() => document.querySelector('.boss .boss-song').dataset.song);
    seen.push(id);
    ok(await ui.ev(() => [...document.querySelectorAll('.boss .boss-slot')].every((b) => b.disabled)), S.label + ' 보스 1단계 「' + song(id).title + '」: 재기 전에는 꽂을 수 없다');
    await ui.press('.boss .boss-measure');
    await ui.waitSel('.boss .measure.is-boss', 20000);
    await solveMeasure(page, ui, S, actionInfo(null, song(id), tools[k]), stats);
    await ui.waitFn(() => [...document.querySelectorAll('.boss .boss-slot')].some((b) => !b.disabled), null, 20000);
    await ui.press(`.boss .boss-slot[data-wing="${wingOfGenre(song(id).genre).id}"]`);
    await ui.waitSel('.boss .boss-singer', 20000);
    await ui.press(`.boss .boss-singer .boss-group[data-group="${song(id).singerGroups[0]}"]`);
    await ui.waitSel('.boss .boss-singer-answer', 20000);
    await ui.press('.boss .boss-next');
    await ui.waitFn((x) => document.querySelector('.boss .boss-song')?.dataset.song !== x, id, 60000);
  }
  ok(same(seen, order), S.label + ' 보스 1단계: 낯선 노래 다섯 편이 정해진 순서로 나온다 ' + JSON.stringify(seen));

  // 2단계
  await passIntro('stage2');
  await ui.waitSel('.boss .boss-remix', 30000);
  const mode = await ui.ev(() => document.querySelector('.boss .boss-remix').dataset.mode);
  ok(mode === (S.beat ? 'beat' : 'line'), S.label + ' 보스 2단계: ' + (S.beat ? '박자 방식(낭송을 들으며 탭)' : '박자 없는 방식(글줄 탭)') + ' ' + mode);
  if (mode === 'beat') {
    await remixBeat(page, ui, S, stats);
  } else {
    for (const s of REMIX_GRID.switches) {
      const sel = `.boss .boss-remix-row[data-seg="${s}"]`;
      await ui.press(sel);
    }
  }

  // 3단계
  await passIntro('stage3');
  await ui.waitSel('.boss .boss-swallowed', 30000);
  await ui.press('.boss .boss-measure');
  await ui.waitSel('.boss .measure.is-boss', 20000);
  await solveMeasure(page, ui, S, actionInfo(null, song('taesan'), 'stairs'), stats);
  await ui.waitFn(() => [...document.querySelectorAll('.boss .boss-slot')].some((b) => !b.disabled), null, 20000);
  await ui.press('.boss .boss-slot[data-wing="sijo"]');
  await ui.waitFn(() => document.querySelector('.boss')?.dataset.mentor === 'free', null, 30000);
  await ui.waitSel('.boss .boss-finish', 30000);
  await ui.press('.boss .boss-finish');
}

// ───────── 한 화면의 완주 ─────────
async function runSetup(server, S) {
  const started = Date.now();
  const L = S.label;
  console.log('\n══════ ' + L + ' ══════');
  const game = await openGame(server.url, { viewport: S.viewport, disable3d: S.disable3d, touch: S.touch });
  const watch = watchPage(game);
  const { page, context } = game;
  const ui = makeUi(page, S);
  const stats = { taps: 0, retries: 0, suggest: 0, remixTaps: 0 };
  const cards = [];
  trail.length = 0;
  progress.at = Date.now();
  const dog = watchSilence(page, S, async () => {
    try { await game.close(); } catch { /* 이미 닫힘 */ }
  });
  try {
    if (S.beat) { await context.addInitScript(installEars); await page.reload(); }
    await ui.waitSel('.story-start', 30000);
    ok(await ui.has('.story-records-none'), L + ': 새 기기, 기록이 하나도 없다(상태를 넣지 않았다)');
    ok((await ui.saved()) === null || Object.keys((await ui.saved()).slots ?? {}).length === 0, L + ': 로컬 저장소에 기록이 없다');

    // 설정: 빗금 모드 또는 소리 끄기
    if (S.setting) {
      await ui.press('.story-open-settings');
      await ui.waitSel('.story-settings');
      await ui.press(`.story-settings input[data-setting="${S.setting}"]`);
      ok((await ui.saved())?.device?.[S.setting] === true, L + ': 시작 화면 설정에서 ' + S.setting + '를 켠다');
      await ui.press('.story-settings .story-settings-close');
      await ui.waitGone('.story-settings');
    }

    // 새 기록: 이름 입력, 모습 고르기
    await page.locator('.story-name-input').pressSequentially(S.name, { delay: 20 });
    await ui.press(`.story-look[data-appearance="${S.look}"]`);
    await ui.press('.story-create');

    // 처음 켜는 기기: 이어폰 안내, 박자 맞추기
    await ui.waitSel('.story-firstrun[data-step="earphone"]');
    await ui.press('.story-firstrun .story-next');
    await ui.waitSel('.story-firstrun[data-step="calibrate"]');
    if (S.beat) await calibrate(page, ui, S);
    else await ui.press('.story-cal-skip');
    await ui.waitGone('.story-firstrun', 30000);
    const rec0 = await ui.record();
    ok(rec0?.name === S.name && rec0?.appearance === S.look, L + ': 새 기록(이름, 고른 모습) ' + JSON.stringify({ name: rec0?.name, look: rec0?.appearance }));
    if (S.beat) {
      const off = (await ui.saved()).device.calibrationOffsetMs;
      ok((await ui.saved()).device.calibrated === true && Math.abs(off) < 200, L + ': 종소리 여덟 번을 따라 쳐서 박자 보정값을 저장한다 (' + off + 'ms)');
    }

    // 입구 이야기 → 미션 → 튜토리얼
    await ui.waitSel('.story-entrance', 30000);
    for (let i = 0; i < 20 && !(await ui.has('.story-tutorial-start')); i++) {
      await ui.press('.story-entrance .story-next');
      await sleep(80);
    }
    const mission = await ui.ev(() => document.querySelector('.story-entrance .story-mission')?.textContent ?? null);
    ok(mission?.trim() === MISSION_SPEC, L + ': 미션 문장이 spec 0절 그대로다');
    await ui.press('.story-tutorial-start');
    await ui.waitSel('.world.is-split .measure', 30000);
    const tut = await solveMeasure(page, ui, S, actionInfo('stairs', song('taesan')), stats);
    ok(same(tut.intros, ['fold', 'tap', 'unique']), L + ': 튜토리얼은 접기 → 두드리기 → 계단 순서로 하나씩 안내한다 ' + JSON.stringify(tut.intros));
    await ui.waitSel('.story-entrance[data-step="done"]', 30000);
    await ui.press('.story-to-corridor');
    await ui.waitGone('.story-entrance');
    await ui.waitFn(() => document.querySelector('.play')?.dataset.place === 'corridor', null, 30000);
    let rec = await ui.record();
    ok(rec.progress.tutorialDone && rec.progress.wings.hyangga.state === 'open' && PLAY_WING_IDS.slice(1).every((w) => rec.progress.wings[w].state === 'locked'), L + ': 튜토리얼을 마치면 향가관만 열린다');
    if (S.disable3d) {
      // 음성 사례: 잠긴 고려가요관 문으로 가도 들어갈 수 없다
      await ui.press('.board-door[data-wing="goryeo"]');
      await sleep(2500);
      const c = await ui.ev(() => { const b = document.querySelector('.world-context'); return b && !b.hidden ? b.textContent : ''; });
      ok(!c.includes('들어가기'), L + ': (음성) 잠긴 관 문 앞에서는 들어가기가 뜨지 않는다 ' + JSON.stringify(c));
    }
    await enterWingFromCorridor(page, ui, S, 'hyangga');

    // ── 다섯 관 ──
    for (const [wi, W] of PLAY_WING_IDS.entries()) {
      const wl = L + ' ' + wingById(W).name;
      await ui.waitFn((w) => document.querySelector('.play')?.dataset.place === w, W, 30000);
      await closeWingIntro(ui);
      rec = await ui.record();
      const states = PLAY_WING_IDS.map((w) => rec.progress.wings[w].state);
      ok(same(states, PLAY_WING_IDS.map((_, i) => (i < wi ? 'done' : i === wi ? 'open' : 'locked'))), wl + ': 앞 관은 마쳤고 이 관만 열렸고 뒤 관은 잠겼다 ' + JSON.stringify(states));
      const t = WING_TABLE[W];
      const pool = [...t.shelf, ...t.stray.map((s) => s.songId)];

      // 1. 떠도는 노래와 입구에서 기다리는 노래를 모두 잡아 잰다
      const floating = await ui.ev(() => [...document.querySelectorAll('.play-song')].map((e) => ({ id: e.dataset.song, pre: e.classList.contains('is-premeasured') })));
      ok(same(floating.map((f) => f.id).sort(), [...pool].sort()), wl + ': 칸 노래와 길 잃은 노래 다섯 편이 떠다니거나 입구에서 기다린다 ' + JSON.stringify(floating));
      const premeasured = floating.filter((f) => f.pre).map((f) => f.id).sort();
      ok(same(premeasured, [...(ROUTING.prewait[W] ?? [])].filter((id) => t.shelf.includes(id)).sort()), wl + ': 앞 관에서 보낸 노래는 입구에서 연필 표시로 기다린다 ' + JSON.stringify(premeasured));
      let first = true;
      for (const f of floating) {
        const r = await catchAndMeasure(page, ui, S, W, f.id, stats);
        if (f.pre) ok(r.steps[0] === 'sheet', wl + ': 미리 잰 「' + song(f.id).title + '」은 감정서가 채워진 채로 온다');
        else if (first) { ok(same(r.intros, ['unique']), wl + ': 관에 처음 들어와 처음 재면 고유 동작 안내 하나만 본다 ' + JSON.stringify(r.intros)); first = false; }
        ok(r.sheet.length > 0 && !SCORE_RE.test(r.sheet), wl + ': 「' + song(f.id).title + '」 감정서(점수 없음)');
      }

      // 2. 꽂기: 갈래가 이 관이면 칸(향가관은 구 수에 맞는 층), 아니면 바구니에 갈 관과 함께
      const hand = await ui.ev(() => [...document.querySelectorAll('.play-hand-song')].map((e) => e.dataset.song));
      ok(same([...hand].sort(), [...pool].sort()), wl + ': 잰 노래 다섯 편이 손에 있다');
      const shelfIds = hand.filter((id) => song(id).genre === wingById(W).genre);
      const strays = hand.filter((id) => song(id).genre !== wingById(W).genre);
      for (const id of strays) await placeInto(ui, 'basket', 0, id, wingOfGenre(song(id).genre).id);
      await ui.waitFn((w) => !document.querySelector('.play-spine[data-area="basket"]'), W, 30000);
      for (const [i, id] of shelfIds.entries()) {
        const index = t.shelfFloors ? t.shelfFloors.indexOf(song(id).units.length) : i;
        await placeInto(ui, 'shelf', index, id);
      }
      await ceremony(ui);
      rec = await ui.record();
      const ws = rec.progress.wings[W];
      ok(ws.shelfBound && ws.basketDone && ws.wrongCount === 0, wl + ': 칸(탑)이 묶이고 바구니 판정을 통과한다');

      // 3. 작품 방
      await openSpot(ui, '.play-goto[data-anchor="roomDoor"]', '작품 방');
      await ui.waitSel('.play-room .play-room-body > *', 30000);
      const roomTexts = await ROOMS[W](ui);
      await ui.waitSel('.play-card', 120000);

      // 4. 판 카드 내려받기
      rec = await ui.record();
      const card = await downloadCard(page, ui, '.play-card');
      const want = ['옛노래서고', S.name, wingById(W).name].join('_') + '.png';
      const probs = cardProblems(card.buf, { text: card.text, mustInclude: [S.name, wingById(W).name, ...t.shelf.map((id) => song(id).title), ...roomTexts] });
      ok(card.name === want && probs.length === 0, wl + ': 판 카드 PNG를 내려받는다(' + card.name + ') ' + probs.join(' / '));
      cards.push(card.name);
      fs.writeFileSync(path.join(SHOTS, 'playthrough-' + S.id + '-' + W + '.png'), card.buf);
      await ui.press('.play-card .card-view-close');
      await ui.waitGone('.play-card');
      ok(rec.progress.wings[W].state === 'done' && (wi === PLAY_WING_IDS.length - 1 || rec.progress.wings[PLAY_WING_IDS[wi + 1]].state === 'open'), wl + ': 판을 마치고 다음 관이 열린다');
      if (wi < PLAY_WING_IDS.length - 2) ok(rec.progress.wings[PLAY_WING_IDS[wi + 2]].state === 'locked', wl + ': 그다음 관은 아직 잠겨 있다(건너뛰기 없음)');

      // 5. 다음 관으로(마지막 관이면 회랑으로)
      if (wi < PLAY_WING_IDS.length - 1) {
        const next = PLAY_WING_IDS[wi + 1];
        await openSpot(ui, '.play-goto[data-anchor="nextDoor"]', '다음 관으로 — ' + wingById(next).name);
      } else {
        await ui.press('.play-btn-leave');
        await ui.waitFn(() => document.querySelector('.play')?.dataset.place === 'corridor', null, 30000);
      }
    }

    // ── 보스 전: 개념 열세 개가 모두 먹(덤·보스 없이) ──
    rec = await ui.record();
    const notInk = CONCEPT_IDS.filter((c) => rec.progress.concepts[c]?.state !== 'ink');
    ok(notInk.length === 0, L + ': 덤과 보스 없이 반드시 지나는 길만으로 개념 열세 개가 모두 먹이 된다 ' + JSON.stringify(notInk));
    ok(PLAY_WING_IDS.every((w) => !rec.progress.wings[w].bonusDone), L + ': 덤은 하나도 하지 않았다');
    await ui.waitSel('.story-boss-door[data-state="open"]', 30000);

    // ── 보스 ──
    await runBoss(page, ui, S, stats);
    rec = await ui.record();
    ok(rec.progress.boss.state === 'done', L + ': 보스 세 단계를 마친다');
    const bossRec = Object.values(rec.progress.boss.unseen);
    ok(bossRec.length === 5 && bossRec.every((u) => u.done && u.firstTryCorrect === true && u.singerGroupCorrect === true && u.journalHelp === false), L + ': 낯선 노래 다섯 편의 기록(처음에 맞힘, 무리 맞음, 일지 도움 없음)');

    // ── 엔딩 ──
    await ui.waitSel('.story-ending[data-step="return"]', 60000);
    const cov = await ui.ev(coverProblems, '.story-ending');
    ok(cov.length === 0, L + ': 엔딩이 화면 전체를 덮는다(위 띠 단추·회랑 장면·알림이 비치지 않음) ' + JSON.stringify(cov));
    await ui.press('.story-ending .story-next');
    await ui.waitSel('.story-ending[data-step="procession"]', 30000);
    const groups = await ui.ev(() => [...document.querySelectorAll('.story-procession > *')].map((e) => e.dataset.group ?? (e.classList.contains('story-empty-spot') ? 'empty' : '?')));
    ok(same(groups, [...SINGER_GROUPS.map((g) => g.id), 'empty']), L + ': 가객 행렬이 정해진 순서로 지나가고 끝에 빈자리');
    await ui.press('.story-ending .story-next');
    await ui.waitSel('.story-ending[data-step="write"]', 30000);
    await page.locator('.story-line-input').pressSequentially(S.line, { delay: 15 });
    await ui.press(`.story-wing-choice [data-wing="${S.endWing}"]`);
    const conceptId = CONCEPTS.find((c) => c.genre === wingById(S.endWing).genre).id;
    await ui.press(`.story-concept-choice [data-concept="${conceptId}"]`);
    if (S.note) await page.locator('.story-note-input').pressSequentially(S.note, { delay: 15 });
    await ui.press('.story-shelve');
    await ui.waitSel('.story-ending[data-step="complete"] .card-view-download', 30000);
    rec = await ui.record();
    ok(rec.progress.ending.completed === true && rec.progress.ending.line === S.line && rec.progress.ending.wing === S.endWing && rec.progress.ending.conceptId === conceptId && rec.progress.ending.note === (S.note ?? ''),
      L + ': 엔딩 선택(한 줄, 관, 먹 개념, 한마디)이 기록되고 서고가 완성된다');
    const fin = await downloadCard(page, ui, '.story-ending');
    const finProbs = cardProblems(fin.buf, { text: fin.text, mustInclude: [S.name, S.line, ...(S.note ? [S.note] : [])] });
    ok(fin.name === '옛노래서고_' + S.name + '_마지막.png' && finProbs.length === 0, L + ': 마지막 카드 PNG를 내려받는다(' + fin.name + ') ' + finProbs.join(' / '));
    fs.writeFileSync(path.join(SHOTS, 'playthrough-' + S.id + '-final.png'), fin.buf);
    cards.push(fin.name);
    await ui.press('.story-ending .story-to-library');
    await ui.waitGone('.story-ending');
    await ui.waitFn(() => document.querySelector('.play')?.dataset.place === 'corridor', null, 30000);

    rec = await ui.record();
    ok(CONCEPT_IDS.every((c) => rec.progress.concepts[c].state === 'ink') && PLAY_WING_IDS.every((w) => rec.progress.wings[w].state === 'done'), L + ': 마친 기록: 다섯 관 완료, 개념 모두 먹');
    ok(cards.length === 6, L + ': 카드 여섯 장(판 카드 다섯, 마지막 하나)을 내려받았다 ' + JSON.stringify(cards));
    const scoreOnScreen = (await ui.ev(() => document.body.innerText)).match(new RegExp(SCORE_RE.source, 'gi'));
    ok(!scoreOnScreen, L + ': 화면에 점수 말이 없다');
  } catch (e) {
    failures++;
    console.error('✗ ' + L + ' 진행 실패: ' + (e?.stack ?? e).toString().split('\n').slice(0, 3).join(' | '));
    if (!e?.diagnosed && !dog.fired) {
      try { await page.screenshot({ path: path.join(SHOTS, 'playthrough-' + S.id + '-fail.png'), timeout: 15000 }); } catch { /* 그림 못 남김 */ }
      try { console.error('   지금: ' + JSON.stringify(await ui.ev(() => ({ place: document.querySelector('.play')?.dataset.place, step: document.querySelector('.measure')?.dataset.step, ctx: document.querySelector('.world-context')?.textContent, dialogs: [...document.querySelectorAll('[role="dialog"]')].map((d) => d.className), playClass: document.querySelector('.play')?.className, songs: [...document.querySelectorAll('.play-song')].map((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { id: b.dataset.song, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), vis: cs.visibility, disp: cs.display, op: cs.opacity, pe: cs.pointerEvents, top: top === b || b.contains(top) ? 'self' : (top?.className || top?.tagName) }; }) })))); } catch { /* 페이지 닫힘 */ }
      if (trail.length) console.error('   최근 기록(끝 15줄):\n' + trail.slice(-15).map((l) => '     ' + l).join('\n'));
    }
  } finally {
    dog.stop();
  }
  const voiceCount = watch.voice.length;
  const probs = watch.problems();
  ok(probs.length === 0, L + ': 콘솔 오류·실패한 요청(404 포함)·바깥 요청·목록에 없는 낭송 조각 요청이 없다 ' + probs.slice(0, 6).join(' | '));
  if (S.beat || S.voiceExpected) ok(voiceCount > 0, L + ': 낭송 조각을 실제로 불러왔다(' + voiceCount + '건, 모두 낭송 목록 안)');
  const sec = Math.round((Date.now() - started) / 1000);
  console.log(`  (${L}: ${Math.floor(sec / 60)}분 ${sec % 60}초, 탭 ${stats.taps}, 다시 본 누르기 ${stats.retries}, 빗금 권유 ${stats.suggest}, 리믹스 탭 ${stats.remixTaps}, 낭송 조각 요청 ${voiceCount}` + (S.beat ? `, 다시 들은 음보 ${stats.replayFeet ?? 0}, ±150ms 밖 탭 ${stats.lateTaps ?? 0}, 가장 먼 탭 ${stats.worstTapMs ?? 0}ms` : '') + ')');
  try { await game.close(); } catch { /* 감시견이 이미 닫음 */ }
  dog.disarm();
  return sec;
}

// 박자 맞추기: 종소리(귀로 들은 예약 시각)에 맞춰 여덟 번 친다. 맞추지 못하면 다시 한다.
async function calibrate(page, ui, S) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await ui.ev(() => window.__ears.starts.length);
    await ui.press('.story-cal-start');
    // 종 여덟 번이 예약될 때까지
    await ui.waitFn((n) => window.__ears.starts.length >= n + 8, before, 20000);
    // 새로 예약된 소리 가운데 같은 소리(길이가 같은 것) 여덟 번이 종소리다
    const bells = await ui.ev((n) => {
      const groups = new Map();
      for (const s of window.__ears.starts.slice(n)) { const k = s.dur.toFixed(3); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s.when); }
      const g = [...groups.values()].find((x) => x.length >= 8);
      return g ? g.sort((a, b) => a - b).slice(0, 8) : null;
    }, before);
    if (!bells) throw new Error('종소리 여덟 번을 듣지 못함');
    const box = await page.locator('.story-cal-tap').boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (!S.touch) await page.mouse.move(x, y);
    for (let i = 0; i < 8; i++) {
      // 그 종이 울릴 때까지 기다렸다가(소리 판 시계) 친다
      await page.evaluate((when) => new Promise((resolve) => {
        const e = window.__ears;
        const tick = () => { if (e.ctx.currentTime >= when) resolve(); else setTimeout(tick, 2); };
        tick();
      }), bells[i]);
      if (S.touch) await page.touchscreen.tap(x, y);
      else { await page.mouse.down(); await page.mouse.up(); }
    }
    await ui.waitFn(() => !!document.querySelector('.story-cal-done') || !document.querySelector('.story-cal-start')?.disabled, null, 20000);
    if (await ui.has('.story-cal-done')) { await ui.press('.story-cal-done'); return; }
  }
  throw new Error('박자 맞추기에 실패');
}

// ───────── 음성 사례 ─────────
async function negatives(server) {
  console.log('— 음성 사례: 점검 도우미가 실제 실패를 잡는다');
  // PNG 검사
  const blank = encodePng(CARD_W, CARD_H, () => [243, 234, 214]);
  ok(cardProblems(blank, { text: '하늘 향가관' }).some((p) => p.startsWith('빈 그림')), '(음성) 한 색뿐인 PNG를 빈 그림으로 잡는다');
  const varied = encodePng(CARD_W, CARD_H, (x, y) => [(x * 7) & 255, (y * 5) & 255, ((x + y) * 3) & 255]);
  ok(cardProblems(varied, { text: '하늘 향가관' }).length === 0, '여러 색 PNG와 보통 글은 통과한다(검사 자체가 늘 실패하지 않는다)');
  ok(cardProblems(varied, { text: '하늘 향가관 점수 90' }).some((p) => p.startsWith('점수 말')), '(음성) 카드 글에 점수 말이 있으면 잡는다');
  ok(cardProblems(varied, { text: '하늘', mustInclude: ['향가관'] }).some((p) => p.startsWith('빠진 글')), '(음성) 카드에 있어야 할 글이 빠지면 잡는다');
  ok(cardProblems(encodePng(800, 450, (x, y) => [x & 255, y & 255, 9]), { text: '하늘' }).some((p) => p.startsWith('크기')), '(음성) 크기가 다른 PNG를 잡는다');
  ok(cardProblems(Buffer.from('PNG 아님, 그냥 글'), { text: '하늘' }).some((p) => p.includes('서명')), '(음성) PNG가 아닌 파일을 잡는다');

  // 요청·오류 감시: 일부러 404(없는 낭송 조각), 바깥 요청, 콘솔 오류를 낸다
  const game = await openGame(server.url, { viewport: VIEWPORTS.chromebook, disable3d: true });
  const watch = watchPage(game);
  try {
    await game.page.waitForSelector('.story-start', { timeout: 30000 });
    ok(watch.problems().length === 0, '처음 연 시작 화면에서는 감시가 아무것도 잡지 않는다 ' + watch.problems().join(' | '));
    await game.page.evaluate(async () => {
      await fetch('assets/audio/voice/no-such-song/0-0.mp3').catch(() => {});
      const img = new Image();
      img.src = 'http://example.invalid/x.png';
      await new Promise((r) => { img.onerror = r; img.onload = r; setTimeout(r, 3000); });
      console.error('점검용 콘솔 오류');
    });
    await sleep(300);
    const p = watch.problems();
    ok(p.some((x) => x.startsWith('404 /assets/audio/voice/no-such-song/0-0.mp3')), '(음성) 없는 낭송 조각 요청의 404를 잡는다');
    ok(p.some((x) => x.startsWith('목록에 없는 낭송 조각')), '(음성) 낭송 목록에 없는 조각 요청을 잡는다');
    ok(p.some((x) => x.startsWith('바깥 요청 http://example.invalid')), '(음성) 바깥 주소 요청을 잡는다');
    ok(p.some((x) => x.includes('점검용 콘솔 오류')), '(음성) 콘솔 오류를 잡는다');

    // 멈춤 잡기: 지금 음보가 바뀌지 않는 두드리기 화면(점검이 붙인 가짜)을 끝없이 기다리지 않는다
    const S = { id: 'negative', label: '(음성 사례: 일부러 멈춘 화면)', touch: false, expected: true };
    const saved = { ...LIMITS };
    await game.page.evaluate(() => {
      const m = document.createElement('section');
      m.className = 'measure pt-fake';
      m.dataset.step = 'tap';
      m.dataset.tapMode = 'beat';
      m.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff';
      m.innerHTML = '<div class="m-text"><button class="m-word is-current" data-u="0" data-l="" data-f="0">멈춘 말</button></div><div class="m-controls"><button class="m-drum">장구</button></div>';
      document.body.append(m);
    });
    try {
      const st = await game.page.evaluate(stallState);
      ok(st.measure?.step === 'tap' && st.measure?.tapMode === 'beat' && st.measure?.current?.key === '0||0' && st.pageState.visibility === 'visible',
        '멈춤 진단이 재기 단계·두드리기 방식·지금 음보·창 상태를 읽는다 ' + JSON.stringify(st.measure));
      LIMITS.idleTurns = 2;
      const t0 = Date.now();
      let err = null;
      try { await beatTapping(game.page, makeUi(game.page, S), S, { taps: 0, suggest: 0 }); } catch (e) { err = e; }
      ok(err?.diagnosed === true && Date.now() - t0 < 60000, '(음성) 음보가 바뀌지 않는 두드리기를 끝없이 기다리지 않고 진단을 남기고 실패한다 (' + (err?.message ?? '실패하지 않음') + ')');

      // 장구 밖에 떨어지는 탭: 장구를 다른 것이 덮고 있으면 첫 탭에서 곧바로 잡는다(귀를 달고 소리 판을 만들어
      // 0.8초 뒤에 낭송 조각 하나를 예약한다. 그 앞에 박 알림 같은 장구 소리도 예약해 귀가 박으로 듣지 않는지 본다)
      await game.page.evaluate(installEars);
      const fakeBeat = await game.page.evaluate(async () => {
        const c = new AudioContext();
        const voice = await c.decodeAudioData(await (await fetch('assets/audio/voice/taesan/0-0.mp3')).arrayBuffer());
        const janggu = await c.decodeAudioData(await (await fetch('assets/audio/sfx/janggu.mp3')).arrayBuffer());
        const cover = document.createElement('div');
        cover.className = 'pt-cover';
        cover.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:100000';
        document.body.append(cover);
        const at = (buf, when) => { const s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination); s.start(when); };
        at(janggu, c.currentTime + 0.1);
        at(voice, c.currentTime + 0.8);
        return window.__ears.starts.map((s) => ({ voice: s.voice, src: s.src }));
      });
      ok(fakeBeat.length === 2 && !fakeBeat[0].voice && fakeBeat[1].voice && fakeBeat[1].src === 'voice/taesan/0-0.mp3', '귀는 낭송 조각만 박으로 듣고 장구(박 알림) 소리는 박으로 듣지 않는다 ' + JSON.stringify(fakeBeat));
      err = null;
      try { await beatTapping(game.page, makeUi(game.page, S), S, { taps: 0, suggest: 0 }); } catch (e) { err = e; }
      ok(err?.diagnosed === true && /장구가 아닌 곳\(pt-cover\)/.test(err.message), '(음성) 장구 밖에 떨어진 탭을 첫 탭에서 잡는다 (' + (err?.message ?? '실패하지 않음') + ')');
      await game.page.evaluate(() => document.querySelector('.pt-cover')?.remove());

      // 감시견: 확인 줄이 끊기면 진단하고 닫는다(여기서는 닫는 대신 알림만 받는다)
      LIMITS.silentMs = 400;
      const before = failures;
      let closed;
      const fired = new Promise((r) => { closed = r; });
      progress.at = Date.now();
      const dog = watchSilence(game.page, S, async () => closed(true), { hardStopMs: 60000 });
      const got = await Promise.race([fired, sleep(30000).then(() => false)]);
      dog.disarm();
      const counted = failures - before;
      failures = before;
      ok(got === true && dog.fired && counted === 1, '(음성) 확인 줄이 끊긴 화면을 감시견이 잡아 실패로 세고 닫는다');
    } finally {
      Object.assign(LIMITS, saved);
      trail.length = 0;
      await game.page.evaluate(() => document.querySelector('.pt-fake')?.remove()).catch(() => {});
    }
  } finally {
    await game.close();
  }
}

// ───────── 실행 ─────────
const SETUPS = [
  { id: 'phone', label: '휴대폰 844×390 3D 빗금', viewport: VIEWPORTS.phone, disable3d: false, touch: true, beat: false, setting: 'slashMode', name: '바다', look: 'b', line: '바람이 책장을 넘기면 노래가 다시 깨어난다', endWing: 'sijo', note: '' , voiceExpected: true },
  { id: 'chromebook', label: '크롬북 1366×768 3D 두드리기', viewport: VIEWPORTS.chromebook, disable3d: false, touch: false, beat: true, setting: null, name: '하늘', look: 'a', line: '먹안개 걷힌 서고에 내 노래 한 줄', endWing: 'gasa', note: '네 박자로 걸어 보니 끝이 없었다' },
  { id: 'tablet', label: '태블릿 1180×820 강제 2D', viewport: VIEWPORTS.tablet, disable3d: true, touch: true, beat: false, setting: 'muted', name: '구름', look: 'b', line: '아아 다시 부르니 노래가 돌아온다', endWing: 'hyangga', note: '감탄사로 시작해 보았다', voiceExpected: true },
];

export { coverProblems, SETUPS, runSetup, solveMeasure, beatTapping, makeUi, installEars, catchAndMeasure, measureNext, actionInfo, calibrate, remixBeat };
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const only = process.env.PLAYTHROUGH_SETUP ?? null;
  const server = await startServer();
  const durations = {};
  try {
    await negatives(server);
    for (const S of SETUPS) {
      if (only && S.id !== only) continue;
      durations[S.id] = await runSetup(server, S);
    }
    const ext = server.requests.filter((r) => !r.startsWith('/'));
    ok(ext.length === 0, '서버 밖 요청 없음');
  } catch (e) {
    failures++;
    console.error('✗ 점검 도중 오류: ' + (e?.stack ?? e));
  } finally {
    await server.close();
  }

  console.log('\n걸린 시간: ' + Object.entries(durations).map(([k, s]) => k + ' ' + Math.floor(s / 60) + '분 ' + (s % 60) + '초').join(', '));
  if (only) console.log('(개발용: ' + only + ' 하나만 돌렸다. 전체 점검은 세 화면 모두 돌린다)');
  if (failures) {
    console.error('\n완주 점검 실패 ' + failures + '건');
    process.exit(1);
  }
  console.log('\n완주 점검 통과');
}
