// 첫 사용 안내(spec 5.6): 손가락 그림이 누를 곳을 가리키며 한 동작씩 보여 준다.
// 움직임 줄이기면 손가락이 움직이지 않고 그 자리에 머문다.
import { L } from './labels.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function fingerSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 64');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  // 위를 가리키는 검지와 주먹 쥔 손
  path.setAttribute('d', 'M18 6a5 5 0 0 1 10 0v22l3-1a5 5 0 0 1 4 1l3 2a6 6 0 0 1 2 5v12c0 9-6 15-15 15h-3c-6 0-10-3-13-8L4 40a4 4 0 0 1 6-5l8 7V6z');
  path.setAttribute('class', 'm-finger-hand');
  svg.append(path);
  return svg;
}

// root: 재기 화면 바탕(position: relative). target: 가리킬 요소(없으면 가운데)
// 돌려주는 약속은 '해 볼게요'를 누르면 끝난다. signal이 중단되면 안내를 치우고 거절된다.
export function showIntro(root, { kind, target, reduceMotion = false, signal } = {}) {
  return new Promise((resolve, reject) => {
    const box = document.createElement('div');
    box.className = 'm-intro';
    box.dataset.intro = kind;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '처음 해 보는 동작 안내');
    const finger = document.createElement('div');
    finger.className = 'm-finger' + (reduceMotion ? ' is-still' : '');
    finger.append(fingerSvg());
    const card = document.createElement('div');
    card.className = 'm-intro-card';
    const p = document.createElement('p');
    p.className = 'm-intro-text';
    p.textContent = L.intro[kind] ?? '';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'm-intro-ok';
    ok.textContent = L.introOk;
    card.append(p, ok);
    box.append(finger, card);
    root.append(box);

    const rr = root.getBoundingClientRect();
    const tr = target?.getBoundingClientRect?.();
    const x = tr && tr.width ? tr.left + tr.width / 2 - rr.left : rr.width / 2;
    const y = tr && tr.height ? tr.top + tr.height / 2 - rr.top : rr.height / 2;
    finger.style.left = Math.round(Math.max(24, Math.min(rr.width - 24, x))) + 'px';
    finger.style.top = Math.round(Math.max(8, Math.min(rr.height - 56, y))) + 'px';
    box.classList.toggle('card-top', y > rr.height / 2);
    target?.classList?.add('is-intro-target');

    const cleanup = () => {
      target?.classList?.remove('is-intro-target');
      box.remove();
      signal?.removeEventListener('abort', onAbort);
    };
    function onAbort() { cleanup(); reject(signal.reason ?? new DOMException('중단', 'AbortError')); }
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    ok.addEventListener('click', () => { cleanup(); resolve(); }, { once: true });
    ok.focus();
  });
}
