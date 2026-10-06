// 전체 화면 단추(시작 화면, 게임 중 위 띠, 설정). 실제 전체 화면 다루기는 js/world/screen.js가 맡는다.
// 단추의 이름과 그림이 지금 상태를 따른다: 꺼져 있으면 '전체 화면'(바깥을 향한 네 귀), 켜져 있으면 '전체 화면 끄기'(안을 향한 네 귀).
// Esc나 시스템 뒤로 가기 몸짓으로 나가도 fullscreenchange를 듣고 따라 바뀐다.
// 전체 화면을 쓸 수 없는 기기(iPhone Safari 등)에서는 단추를 만들지 않는다(null). 설정은 저장하지 않는다.
import { STORY } from '../data/story.js';
import { fullscreenSupported, isFullscreen, onFullscreenChange, toggleFullscreen } from '../world/screen.js';
import { el, button } from './dom.js';

const F = STORY.fullscreen;
const SVG_NS = 'http://www.w3.org/2000/svg';
// 꺼짐: 네 귀가 바깥으로 / 켜짐: 네 귀가 안으로
const PATHS = {
  enter: 'M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5',
  exit: 'M8 3v5H3M17 8h-5V3M12 17v-5h5M3 12h5v5',
};

function icon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('class', 'story-fs-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  svg.append(path);
  return { svg, path };
}

export const canFullscreen = () => fullscreenSupported();

// className: 단추 모양(예: 'story-btn story-btn-quiet', 'play-btn'). compact면 좁은 화면에서 그림만 보이고 이름은 읽어 주기로만 남는다.
// 돌려주는 것: { el, dispose() } 또는 쓸 수 없으면 null
export function fullscreenButton(className, { compact = false } = {}) {
  if (!fullscreenSupported()) return null;
  const b = button(className + ' story-fs' + (compact ? ' story-fs-compact' : ''));
  const { svg, path } = icon();
  const label = el('span', 'story-fs-label');
  b.append(svg, label);
  function sync(on = isFullscreen()) {
    b.dataset.fullscreen = on ? 'on' : 'off';
    const text = on ? F.off : F.on;
    label.textContent = text;
    b.setAttribute('aria-label', text);
    b.title = text;
    path.setAttribute('d', on ? PATHS.exit : PATHS.enter);
  }
  let seen = false;
  const off = onFullscreenChange((on) => {
    if (b.isConnected) seen = true;
    else if (seen) { off(); return; }   // 화면에서 사라진 단추는 더 듣지 않는다
    sync(on);
  });
  b.addEventListener('click', async () => { sync(await toggleFullscreen()); });
  sync();
  return { el: b, dispose: () => { off(); } };
}
