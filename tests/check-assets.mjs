// 그림 자산 점검(spec 17, plan T26, js/data/README.md 11).
// 1) 그림 자산 목록 조각(assets/manifest.parts/art.json)의 항목마다 파일이 있고, 파일 머리의 형식·크기·투명 여부가 적힌 값과 같은지
// 2) 투명해야 할 그림(종이 인형·기념품·카드 장식)은 투명하고, 바탕 그림(재질 무늬·그림 판)은 불투명한지
// 3) 게임이 부르는 그림 이름이 모두 있는지: 학생 두 생김새·선대 사서·좀·좀 대왕, 지금 노래 데이터의 모든 노래의 가객과 기념품,
//    관(입구 포함)마다 재질 무늬, 그림 판(입구·회랑·다섯 관·작품 방 다섯·보스·엔딩), 카드 장식
// 4) 사용권 필드(출처·사용권 문구·상업 이용), 프롬프트 파일, 원본 해시
// 5) assets/img 안에 목록에 없는 파일이 없는지
// 6) 브라우저로 그림을 실제로 풀어 크기, 모서리·가운데의 투명함, 남은 자홍 바탕을 확인한다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

let failures = 0;
const pass = (msg) => console.log('  ✓ ' + msg);
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

// ── 이름 규칙 ──
export const CHARACTER_NAMES = ['sprite/student-a', 'sprite/student-b', 'sprite/mentor', 'sprite/jom', 'sprite/jom-king'];
export const ROOM_BOARDS = (wingIds) => wingIds.map((id) => 'board/room-' + id);
export const CARD_NAMES = ['card/frame', 'card/keepsake'];

// 투명해야 하는 그림: 종이 인형, 기념품, 카드 장식. 재질 무늬와 그림 판은 불투명하다.
export function expectAlpha(name) {
  return /^(sprite|keepsake|card)\//.test(name);
}

export function requiredNames(songs, wings) {
  const play = wings.filter((w) => w.genre).map((w) => w.id);
  return [
    ...CHARACTER_NAMES,
    ...songs.map((s) => 'sprite/singer-' + s.id),
    ...songs.map((s) => 'keepsake/' + s.id),
    ...wings.map((w) => 'texture/' + w.id),
    'board/entrance', 'board/corridor', ...play.map((id) => 'board/' + id), ...ROOM_BOARDS(play), 'board/boss', 'board/ending',
    ...CARD_NAMES,
  ];
}

// ── 파일 머리 읽기(WebP·PNG) ──
export function parseImageHeader(buf) {
  if (!buf || buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    const chunks = [];
    for (let off = 12; off + 8 <= buf.length;) {
      const id = buf.toString('ascii', off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      chunks.push(id);
      off += 8 + size + (size % 2);
    }
    if (chunk === 'VP8X') {
      const flags = buf[20];
      const width = 1 + buf.readUIntLE(24, 3);
      const height = 1 + buf.readUIntLE(27, 3);
      return { format: 'webp', width, height, alpha: (flags & 0x10) !== 0 && (chunks.includes('ALPH') || chunks.includes('VP8L')) };
    }
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { format: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, alpha: ((b >> 28) & 1) === 1 };
    }
    if (chunk === 'VP8 ') {
      return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, alpha: false };
    }
    return null;
  }
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    const colorType = buf[25];
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 };
  }
  return null;
}

const nameOf = (p) => (/^assets\/img\/(.+)\.(webp|png)$/.exec(p) ?? [])[1] ?? null;
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

// 목록·파일·노래 데이터를 받아 문제 목록을 돌려준다(부르는 쪽이 파일 읽기를 넘긴다 → 음성 사례 시험 가능).
export function judge({ manifest, readFile, listFiles, fileExists, songs, wings }) {
  const out = [];
  const assets = manifest?.assets;
  if (!Array.isArray(assets)) return ['목록이 { assets: [...] } 모양이 아니다'];
  const names = new Map();
  for (const a of assets) {
    const where = a?.path ?? '(경로 없음)';
    if (a?.kind !== 'image') { out.push(where + ': kind가 image가 아니다'); continue; }
    const name = nameOf(a.path ?? '');
    if (!name) { out.push(where + ': assets/img/<이름>.webp|png 꼴이 아니다'); continue; }
    if (names.has(name)) out.push(where + ': 같은 그림 이름이 두 번 있다');
    names.set(name, a);
    if (!nonEmpty(a.source)) out.push(where + ': source(출처)가 비어 있다');
    if (!nonEmpty(a.license)) out.push(where + ': license(사용권)가 비어 있다');
    if (a.commercialUse !== true) out.push(where + ': commercialUse가 true가 아니다');
    if (!nonEmpty(a.prompt) || !fileExists(a.prompt)) out.push(where + ': 프롬프트 파일(prompt)이 없다');
    if (!/^[0-9a-f]{64}$/.test(a.rawSha256 ?? '')) out.push(where + ': 원본 해시(rawSha256)가 sha256 꼴이 아니다');
    const buf = readFile(a.path);
    if (!buf) { out.push(where + ': 파일이 없다'); continue; }
    const h = parseImageHeader(buf);
    if (!h) { out.push(where + ': WebP·PNG로 읽을 수 없다'); continue; }
    const d = a.image ?? {};
    const ext = a.path.endsWith('.png') ? 'png' : 'webp';
    if (h.format !== ext || d.format !== h.format) out.push(where + `: 형식이 다르다(파일 ${h.format}, 확장자 ${ext}, 목록 ${d.format})`);
    if (h.width !== d.width || h.height !== d.height) out.push(where + `: 크기가 다르다(파일 ${h.width}×${h.height}, 목록 ${d.width}×${d.height})`);
    if (h.alpha !== d.alpha) out.push(where + `: 투명 여부가 목록과 다르다(파일 ${h.alpha})`);
    if (h.alpha !== expectAlpha(name)) out.push(where + (expectAlpha(name) ? ': 투명해야 하는데 투명 채널이 없다' : ': 바탕 그림인데 투명 채널이 있다'));
    if (/^board\//.test(name) && Math.abs(h.width / h.height - 16 / 9) > 0.01) out.push(where + ': 그림 판이 16:9가 아니다');
    if (/^texture\//.test(name) && h.width !== h.height) out.push(where + ': 재질 무늬가 정사각이 아니다');
  }
  for (const n of requiredNames(songs, wings)) if (!names.has(n)) out.push('게임이 부르는 그림이 목록에 없다: ' + n);
  for (const f of listFiles()) if (!assets.some((a) => a.path === f)) out.push('목록에 없는 그림 파일: ' + f);
  return out;
}

// ── 음성 사례: 점검이 실제 실패를 잡는지 ──
function fakeWebp(w, h, alpha) {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0); b.writeUInt32LE(32, 4); b.write('WEBP', 8);
  b.write('VP8X', 12); b.writeUInt32LE(10, 16); b[20] = alpha ? 0x10 : 0;
  b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3);
  b.write(alpha ? 'ALPH' : 'VP8 ', 30); b.writeUInt32LE(0, 34);
  return b;
}

function selfTest() {
  console.log('\n[0] 점검이 실패를 잡는지(음성 사례)');
  const songs = [{ id: 's1' }];
  const wings = [{ id: 'entrance', genre: null }, { id: 'w1', genre: 'g1' }];
  const files = new Map();
  const assets = [];
  const add = (name, w, h, alpha) => {
    const p = `assets/img/${name}.webp`;
    files.set(p, fakeWebp(w, h, alpha));
    assets.push({ path: p, kind: 'image', source: 'x', license: 'y', commercialUse: true, prompt: 'p.txt', rawSha256: 'a'.repeat(64), image: { format: 'webp', width: w, height: h, alpha } });
  };
  for (const n of requiredNames(songs, wings)) {
    if (/^board\//.test(n)) add(n, 1600, 900, false);
    else if (/^texture\//.test(n)) add(n, 512, 512, false);
    else add(n, 300, 600, true);
  }
  const run = (m, fs2 = files) => judge({
    manifest: m, songs, wings, readFile: (p) => fs2.get(p) ?? null, listFiles: () => [...fs2.keys()], fileExists: (p) => p === 'p.txt',
  });
  const good = { assets };
  const goodProblems = run(good);
  check(goodProblems.length === 0, '올바른 시험 목록은 통과한다' + (goodProblems.length ? ' — ' + goodProblems.join('; ') : ''));
  const clone = () => ({ assets: assets.map((a) => ({ ...a, image: { ...a.image } })) });
  let m = clone(); m.assets = m.assets.filter((a) => a.path !== 'assets/img/sprite/singer-s1.webp');
  check(run(m).some((p) => p.includes('sprite/singer-s1')), '노래의 가객 그림이 빠지면 잡는다');
  m = clone(); m.assets = m.assets.filter((a) => a.path !== 'assets/img/keepsake/s1.webp');
  check(run(m).some((p) => p.includes('keepsake/s1')), '노래의 기념품 그림이 빠지면 잡는다');
  m = clone(); m.assets.find((a) => a.path.includes('student-b')).image.width = 999;
  check(run(m).some((p) => p.includes('크기가 다르다')), '적힌 크기와 파일 크기가 다르면 잡는다');
  m = clone(); m.assets.find((a) => a.path.includes('board/boss')).commercialUse = false;
  check(run(m).some((p) => p.includes('commercialUse')), '상업 이용 불가를 잡는다');
  m = clone(); m.assets.find((a) => a.path.includes('mentor')).license = '';
  check(run(m).some((p) => p.includes('license')), '빈 사용권을 잡는다');
  const f2 = new Map(files); f2.delete('assets/img/sprite/jom.webp');
  check(run(clone(), f2).some((p) => p.includes('jom.webp: 파일이 없다')), '목록의 파일이 없으면 잡는다');
  const f3 = new Map(files); f3.set('assets/img/sprite/mentor.webp', fakeWebp(300, 600, false));
  check(run(clone(), f3).some((p) => p.includes('투명')), '투명해야 할 그림이 불투명하면 잡는다');
  const f4 = new Map(files); f4.set('assets/img/board/stray.webp', fakeWebp(16, 9, false));
  check(run(clone(), f4).some((p) => p.includes('목록에 없는 그림 파일')), '목록 밖 파일을 잡는다');
  check(parseImageHeader(Buffer.from('not an image at all, just some text')) === null, '그림이 아닌 파일은 읽지 않는다');
  const sprite = { path: 's', name: 'sprite/x', w: 10, h: 20, alpha: true };
  const okPx = { path: 's', w: 10, h: 20, corners: [0, 0, 0, 0], center: 255, clear: 0.5, solid: 0.4, magenta: 0 };
  check(judgePixels(sprite, okPx).length === 0, '올바른 종이 인형 픽셀은 통과한다');
  check(judgePixels(sprite, { ...okPx, magenta: 0.05 }).length === 1, '남은 자홍 바탕을 잡는다');
  check(judgePixels(sprite, { ...okPx, corners: [255, 0, 0, 0] }).length === 1, '투명하지 않은 모서리를 잡는다');
  check(judgePixels(sprite, { ...okPx, clear: 0, solid: 1 }).length === 1, '바탕을 빼지 않은 그림을 잡는다');
  check(judgePixels({ ...sprite, name: 'board/x', alpha: false }, { ...okPx, solid: 0.9 }).length === 1, '구멍 난 바탕 그림을 잡는다');
  check(judgePixels({ ...sprite, name: 'card/x' }, { ...okPx, center: 255 }).length === 1, '가운데가 막힌 카드 장식을 잡는다');
}

// 브라우저에서 잰 픽셀 통계로 문제를 고른다. it: { path, name, w, h, alpha }, r: 잰 값
export function judgePixels(it, r) {
  const bad = [];
  if (r.error) return [r.path + ': 풀 수 없다 ' + r.error];
  if (r.w !== it.w || r.h !== it.h) bad.push(`${r.path}: 풀린 크기 ${r.w}×${r.h}`);
  if (r.magenta > 0.003) bad.push(`${r.path}: 자홍 바탕이 남았다(${(r.magenta * 100).toFixed(2)}%)`);
  if (!it.alpha) {
    if (r.solid < 0.999) bad.push(`${r.path}: 바탕 그림에 투명한 곳이 있다`);
    return bad;
  }
  if (/^card\//.test(it.name)) {
    if (r.center !== 0) bad.push(`${r.path}: 카드 장식 가운데가 투명하지 않다`);
    if (r.solid < 0.01) bad.push(`${r.path}: 카드 장식의 테두리가 거의 없다`);
  } else {
    if (r.corners.some((a) => a > 16)) bad.push(`${r.path}: 모서리가 투명하지 않다(${r.corners.join(',')})`);
    if (r.clear < 0.08) bad.push(`${r.path}: 투명한 바탕이 거의 없다(${(r.clear * 100).toFixed(1)}%)`);
    if (r.solid < 0.03) bad.push(`${r.path}: 그림 내용이 거의 없다(${(r.solid * 100).toFixed(1)}%)`);
  }
  return bad;
}

// ── 브라우저로 실제 픽셀 확인 ──
async function pixelCheck(assets) {
  console.log('\n[3] 그림을 실제로 풀어 보기(브라우저)');
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { fail('playwright를 불러올 수 없다'); return; }
  const { startServer } = await import('./lib/server.mjs');
  const server = await startServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(server.url + 'assets/manifest.parts/art.json');
    const items = assets.map((a) => ({ path: a.path, name: nameOf(a.path), w: a.image?.width, h: a.image?.height, alpha: expectAlpha(nameOf(a.path)) }));
    const results = await page.evaluate(async (items) => {
      const out = [];
      for (const it of items) {
        try {
          const blob = await (await fetch('/' + it.path)).blob();
          const bmp = await createImageBitmap(blob);
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          const g = c.getContext('2d');
          g.drawImage(bmp, 0, 0);
          const { data } = g.getImageData(0, 0, bmp.width, bmp.height);
          const at = (x, y) => data[(y * bmp.width + x) * 4 + 3];
          let clear = 0, solid = 0, magenta = 0, n = 0;
          for (let i = 0; i < data.length; i += 4 * 7) {
            n++;
            const a = data[i + 3];
            if (a === 0) clear++;
            if (a >= 250) solid++;
            if (a > 200 && data[i] > 200 && data[i + 2] > 200 && data[i + 1] < 90) magenta++;
          }
          const W = bmp.width - 1, H = bmp.height - 1;
          out.push({ path: it.path, w: bmp.width, h: bmp.height, corners: [at(0, 0), at(W, 0), at(0, H), at(W, H)], center: at(W >> 1, H >> 1), clear: clear / n, solid: solid / n, magenta: magenta / n });
        } catch (e) { out.push({ path: it.path, error: String(e) }); }
      }
      return out;
    }, items);
    const bad = [];
    for (const r of results) bad.push(...judgePixels(items.find((i) => i.path === r.path), r));
    for (const b of bad) fail(b);
    check(bad.length === 0, `그림 ${results.length}개를 풀어 크기·투명함·남은 자홍 바탕 확인`);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function main() {
  selfTest();

  console.log('\n[1] 자산 목록 조각 assets/manifest.parts/art.json');
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.parts/art.json'), 'utf8')); pass('읽음'); } catch (e) { fail('읽을 수 없다 — ' + e.message); }
  if (!manifest) { console.log(`\n실패 ${failures}건`); process.exit(1); }

  const { songs } = await import('../js/data/songs/index.js');
  const { WINGS } = await import('../js/data/wings.js');
  const listFiles = () => {
    const out = [];
    const walk = (d) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else out.push(path.relative(root, p).split(path.sep).join('/'));
      }
    };
    walk(path.join(root, 'assets/img'));
    return out;
  };
  const problems = judge({
    manifest, songs, wings: WINGS, listFiles,
    readFile: (p) => { try { return fs.readFileSync(path.join(root, p)); } catch { return null; } },
    fileExists: (p) => fs.existsSync(path.join(root, p)),
  });
  for (const p of problems) fail(p);
  const req = requiredNames(songs, WINGS);
  check(problems.length === 0, `그림 ${manifest.assets.length}개: 파일·형식·크기·투명 여부·사용권, 노래 ${songs.length}편의 가객·기념품 포함 필수 이름 ${req.length}개`);

  console.log('\n[2] 학생 두 생김새가 서로 다른 그림인지');
  const sa = fs.readFileSync(path.join(root, 'assets/img/sprite/student-a.webp'));
  const sb = fs.readFileSync(path.join(root, 'assets/img/sprite/student-b.webp'));
  check(!sa.equals(sb), 'student-a와 student-b가 다르다');

  await pixelCheck(manifest.assets);

  console.log(failures ? `\n실패 ${failures}건` : '\n모두 통과');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
