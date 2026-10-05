// 화면 방향(spec 14·20). 가로 전용이다. 세로로 들면 "기기를 돌려 주세요"를 덮고 모든 진행을 멈추며,
// orientation:pause와 audio:pause({ reason: 'orientation' })를 낸다. 가로로 돌아오면 resume을 낸다.
import { emit } from '../core/events.js';

let installed = false;
let paused = false;
let overlay = null;
const listeners = new Set();

function portraitNow() {
  return window.innerHeight > window.innerWidth;
}

function check() {
  const p = portraitNow();
  if (p === paused) return;
  paused = p;
  overlay.hidden = !p;
  document.documentElement.classList.toggle('is-portrait', p);
  const app = document.getElementById('app');
  if (app) app.inert = p;   // 덮인 동안 뒤의 화면은 누를 수 없다
  if (p) {
    emit('orientation:pause', {});
    emit('audio:pause', { reason: 'orientation' });
  } else {
    emit('orientation:resume', {});
    emit('audio:resume', { reason: 'orientation' });
  }
  for (const fn of [...listeners]) fn(p);
}

// 한 번만 설치된다. 회전 안내는 body에 붙여 어떤 화면 위에서도 덮는다.
export function installScreen() {
  if (installed) return;
  installed = true;
  overlay = document.createElement('div');
  overlay.className = 'rotate-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '화면 방향 안내');
  overlay.hidden = true;
  overlay.innerHTML = '<div class="rotate-overlay__device" aria-hidden="true"></div><p class="rotate-overlay__text">기기를 돌려 주세요</p>';
  document.body.append(overlay);
  window.addEventListener('resize', check);
  window.matchMedia?.('(orientation: portrait)').addEventListener('change', check);
  window.screen?.orientation?.addEventListener?.('change', check);
  check();
}

// 지금 세로라서 멈춘 상태인지.
export function isPaused() {
  return paused;
}

// 멈춤/이어 하기가 바뀔 때 fn(paused)를 부른다. 돌려준 함수로 끊는다.
export function onPauseChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
