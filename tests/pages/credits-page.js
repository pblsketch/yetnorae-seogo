// 점검 페이지: 출처 화면을 앱 흐름과 같은 약속(show(container, { go, params: { back: 'start' } }))으로 연다.
// go가 불리면 화면을 치우고 기록을 남긴다(앱의 openCredits와 같은 순서). 이 파일은 tests/ 아래에만 있다.
import { show } from '../../js/ui/credits.js';

const app = document.getElementById('app');
const log = { goCalls: [], handle: null };
window.__credits = log;

window.__credits.open = async (scale = 1) => {
  document.documentElement.style.setProperty('--text-scale', String(scale));
  log.handle?.dispose();
  app.replaceChildren();
  log.handle = show(app, {
    go: (...args) => { log.goCalls.push(args); log.handle?.dispose(); log.handle = null; },
    params: { back: 'start' },
  });
  await log.handle.ready;
  return true;
};
document.documentElement.dataset.ready = '1';
