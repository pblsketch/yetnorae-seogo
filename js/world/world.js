// 세계 바탕의 바깥 손잡이. 다른 화면은 이 모듈만 부른다.
//
//   mount(container, opts)   세계를 container에 띄운다. opts: { wings, manifest, appearance: 'a'|'b', reduceMotion, onArrive }
//                              wings: 관 id → 관 모형 모듈(없으면 js/registry.js의 wings)
//                              manifest: 자산 목록(assets/manifest.json 모양). 없으면 모두 자리표시 그림
//                              onArrive({ position, anchor, place }): 탭·문·자리로 가서 멈췄을 때. anchor는
//                                { key: 'door', wing } | { key: 'slots'|'bonus', index } | { key: 'basket'|… } | null
//   enterWing(id) / enterCorridor()      관 안으로 / 회랑으로
//   setContext(label, handler)            오른쪽 아래 상황 버튼("잡기", "꽂기" 등). label이 없으면 숨긴다
//   openSplit(panelEl) / closeSplit()     반반 틀(왼쪽 디오라마, 오른쪽 패널). 여는 동안 이동 조작은 숨는다
//   setDancheong(id, level)               관마다 먹빛(0)~단청(1)
//   getMode()                             '3d' | '2d'
//   dispose()
//
// 사건: 사건 버스의 diorama:* 사건을 지금 관 모형의 react로 넘기고, wing:state로 관 문을 열고 닫는다.
// 화면 방향(orientation:*, audio:*)과 움직임 줄이기(settings:reduce-motion)는 screen.js·motion.js가 맡는다.
import * as THREE from 'three';
import { on } from '../core/events.js';
import { registry } from '../registry.js';
import { createAssets } from './assets.js';
import { createBoard2D } from './board2d.js';
import { createControls } from './controls.js';
import { detectMode, fallbackTo2D } from './mode.js';
import { installMotion, reduceMotion } from './motion.js';
import { getDancheong, onDancheong, setDancheongLevel } from './palette.js';
import { createScene3D } from './scene3d.js';
import { installScreen, isPaused, onPauseChange } from './screen.js';
import { TUNING } from './tuning.js';

export { reduceMotion, setDeviceReduceMotion, particleScale } from './motion.js';
export { getDancheong } from './palette.js';
export { isPaused } from './screen.js';

// 관 모형으로 넘기는 사건(js/data/README.md 8.1)
export const DIORAMA_EVENTS = [
  'diorama:fold', 'diorama:pillar-light', 'diorama:floor-fill', 'diorama:aa-door', 'diorama:stair-step',
  'diorama:refrain-link', 'diorama:walk-step', 'diorama:unroll', 'diorama:slot-set', 'diorama:shelf-bound',
  'diorama:pop-out', 'diorama:fog-recede', 'diorama:dancheong-restore',
];

let w = null;

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function loop(now) {
  if (!w) return;
  w.raf = requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0, (now - (w.last ?? now)) / 1000));
  w.last = now;
  if (isPaused() || document.hidden) return;
  for (const [id, t] of [...w.tweens]) {
    t.time += dt;
    const k = Math.min(1, t.time / TUNING.dancheongRestoreSeconds);
    setDancheongLevel(id, t.from + (1 - t.from) * k);
    if (k >= 1) w.tweens.delete(id);
  }
  w.host.frame(dt, w.split ? { x: 0, y: 0 } : w.controls.moveVector());
}

function restoreDancheong(id) {
  if (!w || !id || id === 'corridor') return;
  if (reduceMotion()) { setDancheongLevel(id, 1); return; }
  w.tweens.set(id, { from: getDancheong(id), time: 0 });
}

export function mount(container, opts = {}) {
  if (w) dispose();
  installScreen();
  installMotion(opts.reduceMotion !== undefined ? { device: opts.reduceMotion } : {});

  const root = el('div', 'world');
  const view = el('div', 'world-view');
  const panel = el('div', 'world-panel');
  const hud = el('div', 'world-hud');
  const safeArea = el('div', 'world-safe-area');
  const safe = el('div', 'world-safe');
  safeArea.append(safe);
  hud.append(safeArea);
  root.append(view, panel, hud);
  container.append(root);

  const fine = window.matchMedia?.('(pointer: fine)');
  const syncPointer = () => root.classList.toggle('pointer-fine', !!fine?.matches);
  syncPointer();
  fine?.addEventListener('change', syncPointer);

  const wings = opts.wings ?? registry.wings;
  const common = {
    view,
    appearance: opts.appearance ?? 'a',
    getWingModule: (id) => wings?.[id] ?? null,
    reduceMotion,
    onArrive: (a) => { try { opts.onArrive?.(a); } catch (e) { console.error('[world] onArrive 처리 실패', e); } },
  };

  let host = null;
  let assets = null;
  if (detectMode() === '3d') {
    try {
      assets = createAssets(opts.manifest ?? null, THREE);
      host = createScene3D({ ...common, assets });
    } catch (e) {
      console.warn('[world] 3D를 열 수 없어 2D 그림 판으로 바꾼다', e);
      view.replaceChildren();
      assets?.dispose();
      fallbackTo2D();
    }
  }
  if (!host) {
    assets = createAssets(opts.manifest ?? null);
    host = createBoard2D({ ...common, assets });
  }
  root.dataset.mode = host.mode;

  const controls = createControls({
    view,
    hud,
    safe,
    onTap: (x, y) => { if (w && !w.split && !isPaused()) host.tapAt(x, y); },
    onRotate: (dx) => { if (w && !w.split) host.rotateBy(dx); },
  });

  const offs = [];
  for (const name of DIORAMA_EVENTS) {
    offs.push(on(name, (detail) => {
      host.forward(name, detail);
      if (name === 'diorama:dancheong-restore') restoreDancheong(host.getPlace());
    }));
  }
  offs.push(on('wing:state', (d) => host.setWingState(d?.wing, d?.state)));
  offs.push(onDancheong((id) => host.dancheongChanged(id)));
  offs.push(onPauseChange((paused) => controls.setEnabled(!paused && !w?.split)));
  offs.push(() => fine?.removeEventListener('change', syncPointer));
  if (isPaused()) controls.setEnabled(false);

  w = { root, view, panel, host, assets, controls, offs, split: false, raf: 0, last: null, tweens: new Map() };
  w.raf = requestAnimationFrame(loop);
  return api;
}

export function enterWing(wingId) {
  return w ? w.host.enterWing(wingId) : false;
}

export function enterCorridor() {
  w?.host.enterCorridor();
}

export function setContext(label, handler) {
  w?.controls.setContext(label, handler);
}

export function openSplit(panelEl) {
  if (!w) return null;
  w.split = true;
  w.root.classList.add('is-split');
  w.panel.replaceChildren(...(panelEl ? [panelEl] : []));
  w.controls.setEnabled(false);
  w.host.clearTarget();
  w.host.resize();
  return w.panel;
}

export function closeSplit() {
  if (!w) return;
  w.split = false;
  w.root.classList.remove('is-split');
  w.panel.replaceChildren();
  w.controls.setEnabled(!isPaused());
  w.host.resize();
}

export function setDancheong(wingId, level) {
  w?.tweens.delete(wingId);
  setDancheongLevel(wingId, level);
}

export function getMode() {
  return w ? w.host.mode : detectMode();
}

// 흔들림. 움직임 줄이기면 하지 않고 false를 돌려준다.
export function shake(seconds) {
  return w ? w.host.shake(seconds) : false;
}

export function moveTo(point) { return w?.host.moveTo(point) ?? null; }
export function getPlace() { return w?.host.getPlace() ?? null; }
export function getPlayer() { return w?.host.getPlayer() ?? null; }
export function getMarker() { return w?.host.getMarker() ?? null; }
export function getCamera() { return w?.host.getCamera() ?? null; }
export function resetCamera() { w?.host.resetCamera(); }
// 지금 관 모형의 상호작용 자리. 3D는 세계 좌표 { x, y, z }, 2D는 그림 판 백분율 { x, y }.
export function getAnchors() { return w?.host.getAnchors() ?? null; }
// 3D일 때 작품 방 등이 쓸 { THREE, scene, camera, renderer, root }. 2D면 null.
export function getThree() { return w?.host.getThree() ?? null; }
export function getStats() { return w?.host.getStats() ?? null; }
// 세계 좌표(3D) 또는 그림 판 백분율(2D)을 화면 좌표로.
export function toScreen(p) { return w?.host.toScreen(p) ?? null; }

export function dispose() {
  if (!w) return;
  cancelAnimationFrame(w.raf);
  w.offs.forEach((off) => off());
  w.controls.dispose();
  w.host.dispose();
  w.assets?.dispose();
  w.root.remove();
  w = null;
}

const api = {
  mount, enterWing, enterCorridor, setContext, openSplit, closeSplit, setDancheong, getDancheong, getMode, dispose,
  shake, moveTo, getPlace, getPlayer, getMarker, getCamera, resetCamera, getAnchors, getThree, getStats, toScreen,
};
