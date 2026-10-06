// 전체 점검. 명시된 목록의 점검을 차례로 실행하고, 하나라도 실패하면 종료 1이다.
// 선택 실행이나 생략 인자는 받지 않는다. 출력 원본은 shots/run-all-<시각>.log에 남긴다.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('./', import.meta.url));

// ── 점검 목록 (연결 단계가 등록한다) ──
const files = [
  'check-smoke.mjs',
  'check-data.mjs',
  'check-rights.mjs',
  'check-engine.mjs',
  'check-rhythm.mjs',
  'check-world.mjs',
  'check-hyangga.mjs',
  'check-goryeo.mjs',
  'check-sijo.mjs',
  'check-gasa.mjs',
  'check-saseol.mjs',
  'check-compare-textbook.mjs',
  'check-bgm.mjs',
  'check-assets.mjs',
  'check-card.mjs',
  'check-measure.mjs',
  'check-wing-hyangga.mjs',
  'check-wing-goryeo.mjs',
  'check-wing-sijo.mjs',
  'check-wing-gasa.mjs',
  'check-wing-saseol.mjs',
  'check-wing-contract.mjs',
  'check-wingflow.mjs',
  'check-room-hyangga.mjs',
  'check-room-goryeo.mjs',
  'check-room-sijo.mjs',
  'check-room-gasa.mjs',
  'check-room-saseol.mjs',
  'check-rooms-in-flow.mjs',
  'check-boss.mjs',
  'check-story.mjs',
  'check-voice.mjs',
  'check-fonts.mjs',
  'check-credits.mjs',
  'check-review-doc.mjs',
];

fs.mkdirSync(path.join(here, 'shots'), { recursive: true });
const logPath = path.join(here, 'shots', 'run-all-' + new Date().toISOString().replace(/[:.]/g, '-') + '.log');
const output = fs.createWriteStream(logPath);
const log = (s) => { console.log(s); output.write(s + '\n'); };
log('전체 실행 로그: ' + logPath);
let failed = false;
const rows = [];
try {
  if (process.env.ONLY || process.argv.length > 2) throw Error('전체 점검은 선택 실행이나 생략 인자를 받지 않는다');
  for (const file of files) {
    const started = Date.now();
    log('\n▶ ' + file);
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [file], { cwd: here, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (c) => { process.stdout.write(c); output.write(c); });
      child.stderr.on('data', (c) => { process.stderr.write(c); output.write(c); });
      child.on('error', (e) => { log('실행 실패: ' + e.message); resolve(-1); });
      child.on('close', (status) => resolve(status ?? -1));
    });
    const row = (code === 0 ? 'PASS ' : 'FAIL ') + file + ' (exit ' + code + ', ' + ((Date.now() - started) / 1000).toFixed(1) + '초)';
    rows.push(row);
    log(row);
    if (code !== 0) { failed = true; break; }
  }
} catch (e) { failed = true; log('✗ ' + e.message); }
log('\n' + rows.join('\n'));
log(rows.filter((s) => s.startsWith('PASS')).length + '/' + files.length + ' passed');
await new Promise((r) => output.end(r));
process.exit(failed || rows.length !== files.length ? 1 : 0);
