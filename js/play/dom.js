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

// 오른쪽 위 닫기 단추(X, 이름 '닫기'). 획은 CSS(.x-close)로 그린다
export function closeButton(className) {
  const b = button(className + ' x-close', null, L.close);
  b.title = L.close;
  return b;
}

// 화면을 덮는 겹 창. 제목과 오른쪽 위 닫기 단추(X), 스크롤되는 몸통을 둔다. 돌려주는 것: { box, body, close() }
// 닫기 단추·Esc로 닫고, 닫으면 창을 열 때 초점이 있던 곳(위 띠의 단추)으로 초점을 돌려준다.
export function openPanel(host, { kind, title, onClose }) {
  const opener = typeof document !== 'undefined' ? document.activeElement : null;
  const box = el('section', 'play-panel');
  box.dataset.panel = kind;
  box.dataset.worldCover = '';   // 창이 세계를 거의 다 덮는다: 세계 바탕은 그리지 않는다(js/world/world.js '가림')
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', title);
  const head = el('div', 'play-panel-head');
  const h = el('h2', 'play-panel-title', title);
  const closeBtn = closeButton('play-panel-close');
  head.append(h, closeBtn);
  const body = el('div', 'play-panel-body play-scroll');
  box.append(head, body);
  host.append(box);
  let closed = false;
  // Esc는 초점이 창 밖(몸통 글을 눌러 초점이 문서로 간 때)이어도 닫는다
  const onKey = (e) => {
    if (!box.isConnected) { document.removeEventListener('keydown', onKey); return; }   // 바깥에서 치운 창
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // 다른 창(설정 등)에 초점이 있으면 그 창의 Esc다
    const a = document.activeElement;
    if (a && a !== document.body && !box.contains(a)) return;
    e.preventDefault();
    close();
  };
  const close = () => {
    if (closed) return;
    const hadFocus = box.contains(document.activeElement);
    closed = true;
    document.removeEventListener('keydown', onKey);
    box.remove();
    onClose?.();
    // 초점이 창 안에 있었으면(또는 창과 함께 사라졌으면) 연 단추로 돌려준다
    if ((hadFocus || document.activeElement === document.body) && opener?.isConnected && opener !== document.body) {
      try { opener.focus({ preventScroll: true }); } catch { /* 초점을 줄 수 없음 */ }
    }
  };
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  closeBtn.focus({ preventScroll: true });
  return { box, head, body, close };
}

export const songTitle = (song) => song?.title ?? '';
export const quoted = (title) => '「' + title + '」';
