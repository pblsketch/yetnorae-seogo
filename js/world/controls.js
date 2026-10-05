// 조작(spec 14): 탭 이동, 왼쪽 아래 떠다니는 조이스틱(터치에서만, 엄지가 닿은 자리에 생김),
// 끌어 돌리기, 키보드(WASD·방향키 이동, Enter·Space 상황 버튼), 오른쪽 아래 상황 버튼 하나.
// 3D와 2D가 함께 쓴다. 무엇을 할지는 onTap·onRotate를 넘긴 쪽이 정한다.
import { TUNING } from './tuning.js';

const MOVE_CODES = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};
const CONTEXT_CODES = new Set(['Enter', 'NumpadEnter', 'Space']);

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

// view: 탭과 끌기를 받는 세계 영역, hud: 조이스틱을 띄울 겹, safe: 상황 버튼을 둘 16:9 안전 상자
export function createControls({ view, hud, safe, onTap, onRotate }) {
  const controls = el('div', 'world-controls');
  const joy = el('div', 'world-joystick');
  const knob = el('div', 'world-joystick__knob');
  joy.setAttribute('aria-hidden', 'true');
  joy.append(knob);
  controls.append(joy);
  hud.append(controls);

  const contextButton = el('button', 'world-context');
  contextButton.type = 'button';
  contextButton.hidden = true;
  safe.append(contextButton);

  let enabled = true;
  let contextHandler = null;
  const keys = new Set();
  let stick = null;     // 조이스틱을 쥔 손가락 { id, ox, oy, vx, vy, moved, t }
  let pointer = null;   // 탭인지 끌기인지 가리는 중인 손가락·마우스 { id, x0, y0, x, dragging, slop }

  function hideStick() {
    joy.classList.remove('is-active');
    knob.style.transform = '';
    stick = null;
  }

  function fireContext() {
    if (enabled && contextHandler) contextHandler();
  }

  function onDown(e) {
    if (!enabled) return;
    if (e.target.closest?.('button, a, input, [data-hotspot]')) return;   // 누를 수 있는 것은 스스로 처리
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (stick || pointer) return;   // 손가락 하나만 받는다
    const r = view.getBoundingClientRect();
    const rx = (e.clientX - r.left) / r.width;
    const ry = (e.clientY - r.top) / r.height;
    const touch = e.pointerType === 'touch';
    try { view.setPointerCapture(e.pointerId); } catch { /* 이미 놓친 손가락 */ }
    if (touch && rx < TUNING.joystickZone.right && ry > TUNING.joystickZone.top) {
      const hr = hud.getBoundingClientRect();
      stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, vx: 0, vy: 0, moved: false, t: performance.now() };
      joy.style.left = (e.clientX - hr.left) + 'px';
      joy.style.top = (e.clientY - hr.top) + 'px';
      joy.classList.add('is-active');
      e.preventDefault();
      return;
    }
    pointer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, dragging: false, slop: touch ? TUNING.tapSlop.touch : TUNING.tapSlop.mouse };
  }

  function onMove(e) {
    if (stick && e.pointerId === stick.id) {
      const R = TUNING.joystickRadius;
      let dx = e.clientX - stick.ox;
      let dy = e.clientY - stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > 8) stick.moved = true;
      if (len > R) { dx *= R / len; dy *= R / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = 0.15;
      const m = Math.min(1, len / R);
      stick.vx = m < dead ? 0 : dx / R;
      stick.vy = m < dead ? 0 : -dy / R;
      return;
    }
    if (pointer && e.pointerId === pointer.id) {
      if (!pointer.dragging && Math.hypot(e.clientX - pointer.x0, e.clientY - pointer.y0) > pointer.slop) pointer.dragging = true;
      if (pointer.dragging) onRotate(e.clientX - pointer.x);
      pointer.x = e.clientX;
    }
  }

  function onUp(e) {
    if (stick && e.pointerId === stick.id) {
      const tap = !stick.moved && performance.now() - stick.t < 400;
      hideStick();
      if (tap && e.type === 'pointerup' && enabled) onTap(e.clientX, e.clientY);
      return;
    }
    if (pointer && e.pointerId === pointer.id) {
      const tap = !pointer.dragging && e.type === 'pointerup';
      pointer = null;
      if (tap && enabled) onTap(e.clientX, e.clientY);
    }
  }

  function onKeyDown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], .world-panel')) return;
    const dir = MOVE_CODES[e.code];
    if (dir) {
      if (!enabled) return;
      keys.add(dir);
      e.preventDefault();
      return;
    }
    if (CONTEXT_CODES.has(e.code)) {
      if (t?.closest?.('button, a, [role="button"]')) return;   // 초점 받은 버튼은 스스로 눌린다
      if (!enabled || !contextHandler || e.repeat) return;
      e.preventDefault();
      fireContext();
    }
  }

  function onKeyUp(e) {
    const dir = MOVE_CODES[e.code];
    if (dir) keys.delete(dir);
  }

  function clearKeys() {
    keys.clear();
  }

  contextButton.addEventListener('click', fireContext);
  view.addEventListener('pointerdown', onDown);
  view.addEventListener('pointermove', onMove);
  view.addEventListener('pointerup', onUp);
  view.addEventListener('pointercancel', onUp);
  view.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);

  return {
    // 이번 프레임의 이동 입력. x 오른쪽, y 앞(화면 위쪽). 길이는 1 이하.
    moveVector() {
      if (!enabled) return { x: 0, y: 0 };
      if (stick) return { x: stick.vx, y: stick.vy };
      let x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      let y = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
      if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) { keys.clear(); hideStick(); pointer = null; }
    },
    setContext(label, handler) {
      if (!label) {
        contextButton.hidden = true;
        contextButton.textContent = '';
        contextHandler = null;
        return;
      }
      contextButton.textContent = String(label);
      contextButton.hidden = false;
      contextHandler = typeof handler === 'function' ? handler : null;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      controls.remove();
      contextButton.remove();
    },
  };
}
