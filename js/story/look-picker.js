// 견습 사서 모습 고르기(spec 13). 새 기록 만들기와 '모습 바꾸기' 상자가 함께 쓴다.
// 카드 하나가 통째로 누르는 자리다(라디오 묶음: 화살표로 옮기고, 고른 카드에만 Tab이 멈춘다).
// 고른 카드는 굵은 테두리와 체크 표시, '고른 모습' 글로 알린다(색만으로 알리지 않는다).
// 3D를 쓰는 기기에서는 게임 속 3D 인물을 미리보기로 보인다(js/world/portrait.js). 고른 카드는 천천히 돌고 고를 때 한 번 인사하며,
// 고르지 않은 카드는 3/4 자세로 멈춘 채 흐리다. 2D 기기에서는 승인된 그림을 같은 이름으로 보인다. 저장 값은 'a' | 'b' 그대로다.
import { STORY } from '../data/story.js';
import { el, button, spriteImg } from './dom.js';

const T = STORY.start;
export const LOOKS = ['a', 'b'];

const SVG_NS = 'http://www.w3.org/2000/svg';

function checkMark() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'story-look-check');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M4 10.5l4 4 8-9');
  svg.append(path);
  return svg;
}

// 모습 이름(화면 글). 기록 목록의 작은 그림 설명에도 쓴다.
export const lookName = (k) => T.looks[k === 'b' ? 'b' : 'a'].name;

// stage: createPortraitStage()의 결과(없으면 그림). value: 처음 고른 모습. onChange(k): 고를 때.
// 돌려주는 것: { root, get value(), set(k), focus(), pause(on), dispose() }
export function createLookPicker({ stage = null, manifest = null, value = 'a', label = T.lookTitle, onChange = null } = {}) {
  let current = value === 'b' ? 'b' : 'a';
  const root = el('div', 'story-looks');
  root.setAttribute('role', 'radiogroup');
  root.setAttribute('aria-label', label);
  root.dataset.render = stage ? '3d' : '2d';

  const cards = LOOKS.map((k) => {
    const b = button('story-look');
    b.dataset.appearance = k;
    b.setAttribute('role', 'radio');
    const art = el('span', 'story-look-art');
    let view = null;
    if (stage) {
      const c = el('canvas', 'story-look-canvas');
      c.setAttribute('aria-hidden', 'true');
      art.append(c);
      view = stage.attach(c, k);
    } else {
      art.append(spriteImg(manifest, 'sprite/student-' + k, 'story-look-img'));
    }
    const text = el('span', 'story-look-text');
    text.append(el('span', 'story-look-name', T.looks[k].name), el('span', 'story-look-line', T.looks[k].line));
    const mark = el('span', 'story-look-mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.append(checkMark(), el('span', 'story-look-mark-text', T.lookChosen));
    b.append(art, text, mark);
    b.addEventListener('click', () => choose(k, true));
    b.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = LOOKS[(LOOKS.indexOf(k) + step + LOOKS.length) % LOOKS.length];
      choose(next, true);
      cards.find((c) => c.k === next)?.b.focus({ preventScroll: true });
    });
    root.append(b);
    return { k, b, view };
  });

  let paused = false;
  function sync(greet) {
    for (const c of cards) {
      const on = c.k === current;
      c.b.setAttribute('aria-checked', String(on));
      c.b.tabIndex = on ? 0 : -1;
      c.view?.setSelected(on && !paused, { greet });
    }
  }

  function choose(k, fromUser) {
    const was = current;
    current = k === 'b' ? 'b' : 'a';
    sync(fromUser && was !== current);
    if (fromUser) onChange?.(current);
  }

  sync(false);

  return {
    root,
    get value() { return current; },
    set(k) { choose(k, false); },
    focus() { cards.find((c) => c.k === current)?.b.focus({ preventScroll: true }); },
    // 다른 고르기 상자가 위에 떠 있는 동안 미리보기를 멈춘다(고른 표시는 그대로)
    pause(on) { paused = !!on; sync(false); },
    dispose() { for (const c of cards) c.view?.detach(); },
  };
}
