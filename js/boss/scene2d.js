// 보스전 2D 그림 판(spec 14: 3D가 안 되는 기기에서도 좀 대왕까지 끝까지 간다).
// 그림 판 board/boss 위에 먹안개 두 겹, 좀, 좀 대왕, 선대 사서를 DOM 겹으로 올린다.
// 상태(먹안개 짙음, 좀 대왕 있음·흩어짐, 선대 사서 갇힘·풀림)는 보스 화면 뿌리의 data-* 속성으로 정해지고
// 움직임은 css/boss.css가 맡는다(움직임 줄이기면 멈춘다).
import { createAssets } from '../world/assets.js';
import { paperDollCanvas } from '../world/sprites.js';
import { el } from './dom.js';

// 좀이 기어 다니는 자리(그림 판 백분율). 정해진 자리이고 무작위는 없다.
const JOM_SPOTS = [
  { x: 12, y: 34, r: -20 }, { x: 22, y: 58, r: 15 }, { x: 80, y: 30, r: 160 }, { x: 88, y: 52, r: 200 }, { x: 64, y: 70, r: 100 },
];

export function createScene2D(host, { manifest = null } = {}) {
  const assets = createAssets(manifest);
  const board = el('div', 'boss-board');
  const bg = assets.image('board/boss');
  if (bg) board.style.backgroundImage = 'url("' + bg + '")';
  else board.classList.add('is-placeholder');

  const fogA = el('div', 'boss-fog boss-fog-a');
  const fogB = el('div', 'boss-fog boss-fog-b');

  const picture = (name, className, fallback) => {
    const url = assets.image(name);
    if (url) {
      const img = el('img', className);
      img.src = url;
      img.alt = '';
      img.draggable = false;
      return img;
    }
    const box = el('div', className + ' is-placeholder');
    if (fallback) box.append(fallback());
    return box;
  };

  const jomBox = el('div', 'boss-joms');
  JOM_SPOTS.forEach((s, i) => {
    const j = picture('sprite/jom', 'boss-jom');
    j.style.left = s.x + '%';
    j.style.top = s.y + '%';
    j.style.setProperty('--r', s.r + 'deg');
    j.style.setProperty('--i', String(i));
    jomBox.append(j);
  });
  const king = picture('sprite/jom-king', 'boss-king');
  const mentor = picture('sprite/mentor', 'boss-mentor', () => paperDollCanvas('mentor', 128, 256));

  board.append(fogA, jomBox, king, mentor, fogB);
  host.append(board);

  return {
    mode: '2d',
    // 상태는 뿌리의 data-* 속성으로 그린다(css/boss.css). 아래는 3D와 같은 손잡이를 맞추려는 빈 함수다.
    setFog() {},
    setKing() {},
    setMentor() {},
    setFilled() {},
    resize() {},
    stats: () => ({ mode: '2d' }),
    dispose() {
      board.remove();
      assets.dispose();
    },
  };
}
