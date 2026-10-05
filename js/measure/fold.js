// 접기(spec 5.3): 단위 경계가 지워진 글줄에서 경계를 눌러 접는다.
// 실제 단위 경계에서만 접히고, 아닌 곳은 흔들리기만 하며 기록이 남지 않는다. 결과는 단위 수.
// 단위가 하나뿐인 노래는 접을 곳이 없으므로 '접을 곳이 없다'로 끝낸다(접을 곳이 남아 있으면 그 버튼도 흔들린다).
import { emit as busEmit } from '../core/events.js';
import { shake } from './view.js';
import { L } from './labels.js';

export function runFold({ song, view, controls, setHint, signal, grey = false, emit = busEmit }) {
  const n = song.units.length;
  const folded = new Set();   // 접힌 경계: 그 앞 단위 번호
  const isBoundary = (a, b) => a && b && a.u !== b.u;

  return new Promise((resolve, reject) => {
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'm-none m-fold-none';
    none.textContent = L.foldNone;
    controls.replaceChildren(none);
    setHint(L.foldHint);

    function finish() {
      cleanup();
      setHint(L.foldDone);
      resolve({ units: folded.size + 1 });
    }
    function cleanup() {
      none.removeEventListener('click', onNone);
      signal?.removeEventListener('abort', onAbort);
    }
    function onAbort() { cleanup(); reject(signal.reason ?? new DOMException('중단', 'AbortError')); }
    function onNone() {
      if (folded.size === n - 1) finish();
      else shake(none);
    }
    // 지금 쪽에 접을 경계가 남았는가(쪽 끝 틈 포함)
    const pageHasWork = ([a, e]) => {
      const ps = view.pieces;
      for (let i = a; i < Math.min(e, ps.length - 1); i++) if (isBoundary(ps[i], ps[i + 1]) && !folded.has(ps[i].u)) return true;
      return false;
    };

    view.setMode({
      flow: true,
      interactive: 'gap',
      grey,
      decorateGap(el, a) { el.classList.toggle('is-folded', folded.has(a.u) && isBoundary(a, view.pieces[a.index + 1])); },
      onGap(a, b, el) {
        if (!isBoundary(a, b)) { shake(el); return; }
        if (folded.has(a.u)) return;
        folded.add(a.u);
        el.classList.add('is-folded');
        emit('diorama:fold', { unit: a.u });
        if (folded.size === n - 1) { finish(); return; }
        if (!pageHasWork(view.range)) view.goToPageWhere(pageHasWork);
      },
    });
    if (!pageHasWork(view.range)) view.goToPageWhere(pageHasWork);
    none.addEventListener('click', onNone);
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
