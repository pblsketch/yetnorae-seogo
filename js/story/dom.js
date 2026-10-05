// 이야기 화면들이 함께 쓰는 작은 도우미: 요소 만들기, 그림 주소, 스타일 붙이기, 확인 상자, 알림 한 줄.
import { el, button, assetUrl, quoted } from '../play/dom.js';
import { paperDollCanvas } from '../world/sprites.js';

export { el, button, assetUrl, quoted };

// 글자 수는 유니코드 글자 단위로 센다(진행 엔진과 같은 방식).
export const charCount = (s) => [...String(s ?? '')].length;

// css/story.css가 문서에 없으면 붙인다(연결 단계가 index.html에 더하면 그것을 쓴다). 다 읽으면 끝나는 약속.
let stylePromise = null;
export function ensureStyle() {
  if (stylePromise) return stylePromise;
  const found = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => /css\/story\.css$/.test(l.getAttribute('href') ?? ''));
  if (found) { stylePromise = Promise.resolve(); return stylePromise; }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../../css/story.css', import.meta.url).href;
  stylePromise = new Promise((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
  });
  document.head.append(link);
  return stylePromise;
}

// 종이 인형 그림(자산 목록에 없으면 자리표시 그림)
export function spriteImg(manifest, name, className, alt = '') {
  const img = el('img', className);
  img.alt = alt;
  img.draggable = false;
  const kind = name.startsWith('sprite/student-') ? name.slice('sprite/'.length) : name === 'sprite/mentor' ? 'mentor' : 'singer';
  img.src = assetUrl(manifest, name) ?? paperDollCanvas(kind).toDataURL();
  return img;
}

// 그림 판 바탕(없으면 null)
export const boardUrl = (manifest, name) => assetUrl(manifest, 'board/' + name);

// 한 번 묻는 확인 상자. 돌려주는 약속: 예면 true, 아니요면 false.
export function confirmBox(host, { kind, title, text, yes, no }) {
  return new Promise((resolve) => {
    const shade = el('div', 'story-confirm-shade');
    const box = el('section', 'story-confirm');
    box.dataset.kind = kind;
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title);
    const yesBtn = button('story-btn story-confirm-yes', yes);
    const noBtn = button('story-btn story-btn-quiet story-confirm-no', no);
    const actions = el('div', 'story-confirm-actions');
    actions.append(noBtn, yesBtn);
    box.append(el('h2', 'story-confirm-title', title), el('p', 'story-confirm-text', text), actions);
    shade.append(box);
    host.append(shade);
    const done = (v) => { shade.remove(); resolve(v); };
    yesBtn.addEventListener('click', () => done(true), { once: true });
    noBtn.addEventListener('click', () => done(false), { once: true });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(false); });
    noBtn.focus({ preventScroll: true });
  });
}

// 잠깐 보이는 알림 한 줄
export function toast(host, text, ms = 6000) {
  const t = el('p', 'story-toast', text);
  t.setAttribute('role', 'status');
  host.append(t);
  setTimeout(() => t.remove(), ms);
  return t;
}
