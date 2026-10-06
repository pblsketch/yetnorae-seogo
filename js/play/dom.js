// 한 판 화면들이 함께 쓰는 작은 도우미: 요소 만들기, 자산 그림 주소, 겹 창(대화 상자·화면).
import { L } from './labels.js';

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

export function button(className, text, label) {
  const b = el('button', className, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

const ROOT = new URL('../../', import.meta.url);

// 자산 목록에 있는 그림의 주소(없으면 null). name은 README 11.2의 그림 이름(예: 'keepsake/gasiri').
export function assetUrl(manifest, name) {
  for (const a of manifest?.assets ?? []) {
    const m = /^assets\/img\/(.+)\.(webp|png|jpg|jpeg)$/i.exec(a?.path ?? '');
    if (m && m[1] === name) return new URL(a.path, ROOT).href;
  }
  return null;
}

// 화면을 덮는 겹 창. 제목과 닫기 단추, 스크롤되는 몸통을 둔다. 돌려주는 것: { box, body, close() }
export function openPanel(host, { kind, title, onClose }) {
  const box = el('section', 'play-panel');
  box.dataset.panel = kind;
  box.dataset.worldCover = '';   // 창이 세계를 거의 다 덮는다: 세계 바탕은 그리지 않는다(js/world/world.js '가림')
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', title);
  const head = el('div', 'play-panel-head');
  const h = el('h2', 'play-panel-title', title);
  const closeBtn = button('play-panel-close', L.close);
  head.append(h, closeBtn);
  const body = el('div', 'play-panel-body play-scroll');
  box.append(head, body);
  host.append(box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    box.remove();
    onClose?.();
  };
  closeBtn.addEventListener('click', close);
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  closeBtn.focus({ preventScroll: true });
  return { box, head, body, close };
}

export const songTitle = (song) => song?.title ?? '';
export const quoted = (title) => '「' + title + '」';
