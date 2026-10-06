// 먹빛 → 단청 색 상태(spec 3.1·17). 관마다 0(먹빛)~1(단청이 다 돌아옴) 값을 하나씩 둔다.
// 이 파일은 DOM에 기대지 않아 Node에서도 읽을 수 있다.
import { WING_IDS } from '../data/wings.js';

// css/base.css의 색 토큰과 같은 값(3D 재질처럼 CSS 변수를 못 쓰는 곳에서 쓴다). 점검이 두 값을 맞춰 본다.
export const TOKENS = {
  hanji: '#f3ead6',
  hanjiDeep: '#e6d9bb',
  meok: '#2b2b2b',
  meokSoft: '#5a5650',
  meokFog: '#8d8a85',
  nokcheong: '#2f7d6d',
  juhong: '#b83f2a',
  gold: '#b88a2a',
};

const levels = new Map(WING_IDS.map((id) => [id, 0]));
const listeners = new Set();

export function getDancheong(wingId) {
  return levels.get(wingId) ?? 0;
}

export function setDancheongLevel(wingId, level) {
  if (!levels.has(wingId)) return;
  const v = Math.min(1, Math.max(0, Number(level) || 0));
  if (levels.get(wingId) === v) return;
  levels.set(wingId, v);
  for (const fn of [...listeners]) fn(wingId, v);
}

// 단청 상태가 바뀔 때 부른다. 돌려준 함수로 끊는다.
export function onDancheong(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 판을 하는 관들의 평균 단청 값(회랑 분위기에 쓴다).
export function meanDancheong() {
  const ids = WING_IDS.filter((id) => id !== 'entrance');
  return ids.reduce((s, id) => s + getDancheong(id), 0) / ids.length;
}

function toRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

export function mixHex(a, b, t) {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}

// 색을 먹빛으로: 밝기만 남긴 회색을 먹 쪽으로 조금 눌러 준다.
export function inkOf(hex) {
  const [r, g, b] = toRgb(hex);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return mixHex(toHex([y, y, y]), TOKENS.meokSoft, 0.35);
}

// 단청 값(0~1)에 맞춘 색. 0이면 먹빛, 1이면 본래 색.
export function dancheongColor(hex, level) {
  return mixHex(inkOf(hex), hex, Math.min(1, Math.max(0, level)));
}
