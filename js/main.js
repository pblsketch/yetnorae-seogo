// 진입점. 등록된 시작 화면을 연다. 시작 화면이 아직 없으면 준비 중 안내를 보인다.
import { registry } from './registry.js';

const app = document.getElementById('app');

function boot() {
  const start = registry.screens.start;
  if (start && typeof start.show === 'function') {
    start.show(app);
    return;
  }
  app.innerHTML = '<p style="padding:2rem">옛 노래 서고를 준비하고 있어요.</p>';
}

boot();
