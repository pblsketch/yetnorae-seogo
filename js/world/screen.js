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

// ───────── 전체 화면(Fullscreen API) ─────────
// 문서 뿌리(<html>)를 전체 화면으로 띄운다. #app만 띄우면 body에 붙은 회전 안내가 전체 화면 밖에 남아 가려지기 때문이다.
// 설정을 저장하지 않는다. 전체 화면은 언제나 사용자의 누르기로만 들어간다(브라우저 규칙).
// 접두사 없는 API를 먼저 쓰고, 없으면 webkit 접두사(옛 Safari·안드로이드 브라우저)를 쓴다.
// iPhone Safari처럼 문서 전체 화면을 못 쓰는 곳은 fullscreenSupported()가 false이고, 부르는 쪽은 단추를 아예 두지 않는다.
// 들어갈 때 가로로 잠그기(screen.orientation.lock)를 한 번 해 보고, 안 되면 조용히 넘긴다(안드로이드 크롬에서 된다).
const fsListeners = new Set();
let fsInstalled = false;
let lockedByUs = false;

function fsElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

export function fullscreenSupported() {
  const root = document.documentElement;
  const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? false;
  return !!enabled && typeof (root.requestFullscreen ?? root.webkitRequestFullscreen) === 'function';
}

export function isFullscreen() {
  return !!fsElement();
}

function fsChanged() {
  const on = isFullscreen();
  if (!on && lockedByUs) {
    lockedByUs = false;
    try { screen.orientation?.unlock?.(); } catch { /* 잠그지 못한 기기 */ }
  }
  // 세계 바탕은 ResizeObserver로 그리기 판 크기를 다시 맞춘다. 회전 안내는 창 크기로 다시 판단한다.
  if (installed) check();
  for (const fn of [...fsListeners]) fn(on);
}

function installFullscreen() {
  if (fsInstalled) return;
  fsInstalled = true;
  // Esc, 시스템 뒤로 가기 몸짓으로 나가도 단추 이름과 그림이 따라 바뀐다.
  document.addEventListener('fullscreenchange', fsChanged);
  document.addEventListener('webkitfullscreenchange', fsChanged);
}

// 전체 화면이 바뀔 때 fn(켜졌는지)를 부른다. 돌려준 함수로 끊는다.
export function onFullscreenChange(fn) {
  installFullscreen();
  fsListeners.add(fn);
  return () => fsListeners.delete(fn);
}

// 사용자의 누르기 안에서 부른다. 돌려주는 약속은 바뀐 뒤의 상태(true = 전체 화면)로 끝난다. 실패해도 던지지 않는다.
export async function toggleFullscreen() {
  installFullscreen();
  if (!fullscreenSupported()) return false;
  try {
    if (isFullscreen()) {
      const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
      await exit?.call(document);
    } else {
      const root = document.documentElement;
      const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
      await request.call(root, { navigationUI: 'hide' });
      const lock = screen.orientation?.lock;
      if (typeof lock === 'function') {
        try {
          await lock.call(screen.orientation, 'landscape');
          lockedByUs = true;
        } catch { /* 데스크톱·iPad 등 잠글 수 없는 기기 */ }
      }
    }
  } catch { /* 브라우저가 거절함(누르기 밖 호출 등) */ }
  return isFullscreen();
}
