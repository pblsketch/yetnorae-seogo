// 움직임 줄이기 전역 상태. 기기 설정(저장의 device.reduceMotion)과 브라우저의 prefers-reduced-motion 가운데
// 하나라도 켜져 있으면 줄인다. 켜지면 #app에 reduce-motion 클래스를 붙이고 settings:reduce-motion을 낸다.
// 다른 모듈은 reduceMotion()으로 지금 값을 읽거나 그 사건을 듣는다.
import { emit, on } from '../core/events.js';
import { TUNING } from './tuning.js';

const SAVE_KEY = 'yetnorae-seogo-v1';

let installed = false;
let device = false;
let prefers = false;
let effective = false;
let emitting = false;

function readDeviceSetting() {
  try {
    return !!JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')?.device?.reduceMotion;
  } catch {
    return false;
  }
}

function applyClass() {
  document.getElementById('app')?.classList.toggle('reduce-motion', effective);
}

function send() {
  emitting = true;
  try { emit('settings:reduce-motion', { value: effective }); } finally { emitting = false; }
}

// 값을 다시 계산한다. heard는 바깥에서 받은 사건 값(그 값과 결과가 같으면 다시 알리지 않는다).
function update(heard) {
  const before = effective;
  effective = device || prefers;
  applyClass();
  if (heard !== undefined) {
    if (effective !== heard) send();
  } else if (effective !== before) {
    send();
  }
}

// 한 번만 설치된다. device를 주면 그 값을 기기 설정으로 쓰고, 없으면 저장된 기기 설정을 읽는다.
export function installMotion(options = {}) {
  if (installed) {
    if (options.device !== undefined) setDeviceReduceMotion(options.device);
    else applyClass();
    return;
  }
  installed = true;
  device = options.device !== undefined ? !!options.device : readDeviceSetting();
  const mql = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  prefers = !!mql?.matches;
  mql?.addEventListener('change', (e) => { prefers = e.matches; update(); });
  // 설정 화면이 알리는 값은 기기 설정 값이다.
  on('settings:reduce-motion', (d) => {
    if (emitting) return;
    device = !!d?.value;
    update(device);
  });
  update();
}

// 설정 화면이 기기 설정을 바꿀 때 부른다.
export function setDeviceReduceMotion(value) {
  device = !!value;
  if (!installed) installMotion({ device });
  else update();
}

export function reduceMotion() {
  return effective;
}

// 파티클 수에 곱할 비율. 움직임 줄이기면 줄어든다.
export function particleScale() {
  return effective ? TUNING.particleScaleReduced : 1;
}
