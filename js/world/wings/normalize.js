// 관 모형 손잡이 맞추기(js/data/README.md '연결 결정(F2) — 관 모형 손잡이').
// 다섯 관 모형은 따로 만들어져 떠도는 노래 자리와 재기 초점을 저마다 다른 이름으로 내놓는다.
// normalizeWing(모듈)은 create3D·create2D를 감싸, 돌려받은 손잡이를 한 가지 모양으로 맞춘다.
//
//   floatingSpots  떠도는(아직 잡지 않은) 노래가 머무는 자리 목록. 누를 자리(anchors)가 아니다.
//                  3D는 root 기준 THREE.Vector3(y는 떠 있는 높이), 2D는 그림 판 백분율 { x, y }.
//   measureFocus   재기 화면 왼쪽 반이 비출 곳.
//                  3D는 { target: Vector3, position?: Vector3 }(root 기준. position은 카메라 자리, 없으면 세계 바탕이 정한다),
//                  2D는 그림 판 백분율 { x, y }.
//   anchors        7.1의 누를 자리만 남긴다(옛 열쇠 floating·songs·focus는 뺀다).
//
// 옛 모양(먼저 찾는 순서): 손잡이에 floatingSpots·measureFocus가 있으면 그대로 쓴다.
//   향가관(T7) anchors.floating, handle.focus(점)
//   고려가요관(T8) anchors.songs, anchors.focus(3D { position, target }, 2D 백분율 사각형 → 가운데 점)
//   시조관(T9) areas.floating, areas.focus({ stairs, pillars, pavilion } → 세 점의 가운데)
//   가사관(T10) anchors.camera.measure({ position, target })
//   사설시조관(T11) spots.floatingSongs(점 또는 목록), spots.measureFocus(점)

const NORMALIZED = Symbol('normalizedWing');

// 누를 자리가 아니어서 anchors에서 빼는 옛 열쇠
const NOT_ANCHORS = new Set(['floating', 'songs', 'focus']);
// 맞춘 손잡이에 남기지 않는 옛 열쇠(같은 값이 두 이름으로 돌아다니지 않게)
const LEGACY_HANDLE_KEYS = new Set(['focus', 'spots', 'areas']);

// diorama:slot-set이 받는 자리 이름. 모든 관 모형이 다섯을 모두 받고, 해당 건축이 없으면 조용히 넘긴다.
export const SLOT_AREAS = Object.freeze(['shelf', 'bonus', 'basket', 'returned', 'mentor']);

const isNum = Number.isFinite;
const isPoint2D = (p) => !!p && isNum(p.x) && isNum(p.y);
const isPoint3D = (p) => isPoint2D(p) && isNum(p.z);

function toList(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function pickFloating(raw, isPoint) {
  const sources = [raw.floatingSpots, raw.anchors?.floating, raw.anchors?.songs, raw.areas?.floating, raw.spots?.floatingSongs];
  const found = sources.find((v) => v && toList(v).length > 0);
  return toList(found).filter(isPoint);
}

// 여러 점의 가운데(3D면 z까지)
function centroid(points, is3d, THREE) {
  const n = points.length;
  const sum = (k) => points.reduce((s, p) => s + p[k], 0) / n;
  if (!is3d) return { x: sum('x'), y: sum('y') };
  return THREE ? new THREE.Vector3(sum('x'), sum('y'), sum('z')) : { x: sum('x'), y: sum('y'), z: sum('z') };
}

function focus3D(raw, THREE) {
  const candidates = [raw.measureFocus, raw.focus, raw.anchors?.focus, raw.spots?.measureFocus, raw.anchors?.camera?.measure, raw.areas?.focus];
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    if (isPoint3D(c.target)) return isPoint3D(c.position) ? { target: c.target, position: c.position } : { target: c.target };
    if (isPoint3D(c)) return { target: c };
    // 시조관처럼 이름 붙은 점 여럿: 모두 보이게 가운데를 본다.
    const parts = Object.values(c).filter(isPoint3D);
    if (parts.length) return { target: centroid(parts, true, THREE) };
  }
  return null;
}

function focus2D(raw) {
  const candidates = [raw.measureFocus, raw.focus, raw.anchors?.focus, raw.spots?.measureFocus, raw.areas?.focus];
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    if (isPoint2D(c)) return { x: c.x, y: c.y };
    // 고려가요관 2D: 그림 판 백분율 사각형 → 가운데
    if (isNum(c.left) && isNum(c.top) && isNum(c.width) && isNum(c.height)) return { x: c.left + c.width / 2, y: c.top + c.height / 2 };
    const parts = Object.values(c).filter(isPoint2D);
    if (parts.length) return centroid(parts, false);
  }
  return null;
}

// 관 모형이 돌려준 손잡이 하나를 맞춘다. mode: '3d' | '2d'
export function normalizeHandle(raw, mode, ctx = {}) {
  if (!raw || typeof raw !== 'object') return raw ?? null;
  const is3d = mode === '3d';
  const anchors = {};
  for (const [k, v] of Object.entries(raw.anchors ?? {})) if (!NOT_ANCHORS.has(k)) anchors[k] = v;
  const handle = {};
  for (const [k, v] of Object.entries(raw)) if (!LEGACY_HANDLE_KEYS.has(k)) handle[k] = v;
  handle.anchors = anchors;
  handle.floatingSpots = pickFloating(raw, is3d ? isPoint3D : isPoint2D);
  handle.measureFocus = is3d ? focus3D(raw, ctx.THREE) : focus2D(raw);
  return handle;
}

// 관 모형 모듈({ create3D, create2D })을 맞춘 모양으로 감싼다. 이미 감싼 모듈은 그대로 돌려준다.
export function normalizeWing(mod) {
  if (!mod || mod[NORMALIZED]) return mod ?? null;
  const out = { ...mod };
  if (typeof mod.create3D === 'function') out.create3D = (ctx) => normalizeHandle(mod.create3D(ctx), '3d', ctx);
  if (typeof mod.create2D === 'function') out.create2D = (ctx) => normalizeHandle(mod.create2D(ctx), '2d', ctx);
  Object.defineProperty(out, NORMALIZED, { value: true });
  return Object.freeze(out);
}

export function isNormalizedWing(mod) {
  return !!mod?.[NORMALIZED];
}
