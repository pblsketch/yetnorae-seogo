// 모듈 사이의 신호를 잇는 단일 이벤트 버스. 사건 이름 목록은 js/data/README.md의 '사건' 절이 기준이다.
const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(fn);
  return () => off(name, fn);
}

export function off(name, fn) {
  handlers.get(name)?.delete(fn);
}

export function emit(name, detail) {
  for (const fn of [...(handlers.get(name) ?? [])]) {
    try { fn(detail); } catch (e) { console.error('[events]', name, e); }
  }
}

export function clearAll() {
  handlers.clear();
}
