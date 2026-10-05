// 고유 동작 모듈이 함께 쓰는 도우미.
// 고유 동작 ctx(js/data/README.md 7.2): { song, container, noBeat, rhythm, signal }
// 재기 화면이 부를 때는 더해서 { view, controls, setHint, emit }을 넘긴다. 없으면 container 안에 스스로 만든다.
import { emit as busEmit } from '../../core/events.js';
import { createTextView } from '../view.js';

export function button(className, text) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  return b;
}

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// 재기 화면 밖에서 단독으로 불렸을 때 쓸 글 보기·조작 자리
export function setup(ctx) {
  const emit = ctx.emit ?? busEmit;
  if (ctx.view && ctx.controls) {
    return { view: ctx.view, controls: ctx.controls, setHint: ctx.setHint ?? (() => {}), emit, own: null };
  }
  const box = el('div', 'm-action-standalone');
  const hint = el('p', 'm-hint');
  const area = el('div', 'm-text');
  const controls = el('div', 'm-controls m-action');
  box.append(hint, area, controls);
  ctx.container.append(box);
  const view = createTextView(area, { song: ctx.song });
  return { view, controls, setHint: (t) => { hint.textContent = t; }, emit, own: box };
}

// 중단 신호를 약속으로. 동작이 끝나면 떼어 낸다.
export function guard(signal, reject) {
  const onAbort = () => reject(signal.reason ?? new DOMException('중단', 'AbortError'));
  if (signal?.aborted) { onAbort(); return () => {}; }
  signal?.addEventListener('abort', onAbort, { once: true });
  return () => signal?.removeEventListener('abort', onAbort);
}

export const pause = (ms) => new Promise((r) => setTimeout(r, ms));
