// assets/manifest.parts/*.json 조각을 assets/manifest.json 하나로 합친다. 같은 경로가 두 번 나오면 실패한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const partsDir = path.join(root, 'assets', 'manifest.parts');
const parts = fs.readdirSync(partsDir).filter((f) => f.endsWith('.json')).sort();
const seen = new Set();
const assets = [];
for (const f of parts) {
  const part = JSON.parse(fs.readFileSync(path.join(partsDir, f), 'utf8'));
  for (const a of part.assets ?? []) {
    if (seen.has(a.path)) { console.error('같은 경로가 두 번 나온다: ' + a.path + ' (' + f + ')'); process.exit(1); }
    seen.add(a.path);
    assets.push(a);
  }
}
fs.writeFileSync(path.join(root, 'assets', 'manifest.json'), JSON.stringify({ version: 1, parts, assets }, null, 2) + '\n');
console.log('assets/manifest.json: 조각 ' + parts.length + '개, 자산 ' + assets.length + '개');
