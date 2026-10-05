// 결과 카드 화면 부품(spec 12). 카드를 미리 보여 주고, 내려받기 버튼을 누르면 그 자리에서 PNG로 내려받는다.
// source에 함수(() => 카드 자료)를 주면 내려받을 때마다 지금의 기록으로 다시 모아 다시 그린다
// (기록 화면에서 다시 내려받으면 그 사이에 한 덤이 판 카드에 반영된다).
import { renderCard, cardToBlob, cardFileName, saveBlob } from './card.js';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// 그린 글을 이어 화면 낭독기에 읽어 줄 설명으로 쓴다.
function describe(layout) {
  return layout.items.filter((it) => it.type === 'text').map((it) => it.text).join(', ');
}

// container: 화면이 채울 요소. source: 카드 자료 또는 카드 자료를 돌려주는 함수(buildWingCard/buildFinalCard 결과).
// opts.manifest: 자산 목록(학생 그림). opts.onClose: 주면 '닫기' 버튼을 둔다.
// 돌려주는 것: { ready, download(), refresh(), layout, canvas, dispose() }
export function showCard(container, source, { manifest = null, onClose = null } = {}) {
  const resolve = () => (typeof source === 'function' ? source() : source);
  const root = el('section', 'card-view');
  root.setAttribute('aria-label', '결과 카드');
  container.replaceChildren(root);

  let disposed = false;
  let layout = null;
  let busy = null;
  const data0 = resolve();

  if (!data0) {
    root.append(el('p', 'card-view-empty', '아직 만들 수 있는 카드가 없어요.'));
    if (onClose) {
      const close = el('button', 'card-view-close', '닫기');
      close.type = 'button';
      close.addEventListener('click', () => onClose());
      const actions = el('div', 'card-view-actions');
      actions.append(close);
      root.append(actions);
    }
    return {
      ready: Promise.resolve(),
      download: async () => null,
      refresh: async () => null,
      get layout() { return null; },
      get canvas() { return null; },
      dispose() { disposed = true; root.remove(); },
    };
  }

  const frameBox = el('div', 'card-view-frame');
  const canvas = el('canvas', 'card-view-canvas');
  canvas.setAttribute('role', 'img');
  frameBox.append(canvas);
  const actions = el('div', 'card-view-actions');
  const button = el('button', 'card-view-download', '그림으로 내려받기');
  button.type = 'button';
  actions.append(button);
  if (onClose) {
    const close = el('button', 'card-view-close', '닫기');
    close.type = 'button';
    close.addEventListener('click', () => onClose());
    actions.append(close);
  }
  const status = el('p', 'card-view-status');
  status.setAttribute('aria-live', 'polite');
  root.append(frameBox, actions, status);

  async function draw(data) {
    const r = await renderCard(data, { canvas, manifest });
    layout = r.layout;
    canvas.setAttribute('aria-label', describe(layout));
    return r;
  }

  // 지금의 기록으로 다시 그린다(미리 보기만).
  async function refresh() {
    const data = resolve();
    if (!data || disposed) return null;
    return draw(data);
  }

  // 지금의 기록으로 다시 그려 내려받는다.
  async function download() {
    if (busy) return busy;
    busy = (async () => {
      button.disabled = true;
      status.textContent = '카드를 그리고 있어요.';
      try {
        const data = resolve();
        if (!data) {
          status.textContent = '아직 만들 수 있는 카드가 없어요.';
          return null;
        }
        await draw(data);
        const blob = await cardToBlob(canvas);
        const fileName = cardFileName(data);
        if (!disposed) saveBlob(blob, fileName);
        status.textContent = '내려받았어요. ' + fileName;
        return { blob, fileName, layout };
      } catch (e) {
        status.textContent = '카드를 만들지 못했어요. 다시 눌러 주세요.';
        throw e;
      } finally {
        button.disabled = false;
        busy = null;
      }
    })();
    return busy;
  }

  button.addEventListener('click', () => { download().catch(() => {}); });
  const ready = draw(data0).catch(() => { status.textContent = '카드를 그리지 못했어요.'; });

  return {
    ready,
    download,
    refresh,
    get layout() { return layout; },
    get canvas() { return canvas; },
    dispose() {
      disposed = true;
      root.remove();
    },
  };
}
