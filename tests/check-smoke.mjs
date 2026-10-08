// 기본 점검: 첫 화면이 오류 없이 열리고, 바깥 주소로 요청하지 않으며, Three.js를 불러올 수 있다.
import { startServer } from './lib/server.mjs';
import { openGame, assert } from './lib/browser.mjs';

const server = await startServer();
let game;
try {
  game = await openGame(server.url);
  const { page } = game;
  await page.waitForSelector('#app');
  // #app 틀은 index.html에 처음부터 있고 내용은 모듈이 채운다. 채워질 때까지 기다린 뒤 읽는다(못 채우면 아래 검사가 실패한다).
  await page.waitForFunction(() => (document.querySelector('#app')?.textContent ?? '').trim().length > 0, null, { timeout: 15000 }).catch(() => {});
  const text = await page.textContent('#app');
  assert(text.trim().length > 0, '첫 화면에 내용이 있다');
  const threeOk = await page.evaluate(async () => { const THREE = await import('three'); return typeof THREE.Scene === 'function'; });
  assert(threeOk, 'import map으로 Three.js를 불러온다');
  assert(game.external.length === 0, '바깥 주소 요청이 없다 (' + game.external.join(', ') + ')');
  assert(game.errors.length === 0, '콘솔 오류가 없다 (' + game.errors.join(' | ') + ')');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await game?.close();
  await server.close();
}
