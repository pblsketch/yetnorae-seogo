// 작품 방 「님이 오마 하거늘」의 2D 그림 판(board/room-saseol, 3D를 쓸 수 없을 때).
// 그림 판 위에 학생 종이 인형, 발자국, 길 끝에 서 있는 것을 가리는 거무희뜩한 그림자를 겹친다.
// 공개하면 그림자가 걷히고 그림 판의 삼대 묶음이 드러난다. 3D와 같은 규칙, 같은 순서다.
import { paperDollCanvas } from '../world/sprites.js';

// 그림 판(1600×900) 안의 자리, 백분율
const FIGURE = { left: 63.6, top: 6.5, width: 7.8, height: 34.5 };   // 길 끝 삼대 묶음을 덮는 자리
const FOCUS = { x: 0.58, y: 0.55 };                                  // 칸이 좁을 때 가운데에 둘 곳
// 학생이 달리는 길: [x, y(발 밑), 키(그림 판 높이에 대한 %)]
const PATH = [[45, 97, 30], [49, 82, 24], [54, 67, 18], [59, 55, 13], [62.4, 47.5, 10.5]];
const MAX_STEPS = 40;

function along(p) {
  const t = Math.min(1, Math.max(0, p)) * (PATH.length - 1);
  const i = Math.min(PATH.length - 2, Math.floor(t));
  const k = t - i;
  return PATH[i].map((a, j) => a + (PATH[i + 1][j] - a) * k);
}

export function createRoomBoard2D({ host, assets, appearance = 'a', reduceMotion = () => false }) {
  const stage = document.createElement('div');
  stage.className = 'rs-board';
  const url = assets?.image?.('board/room-saseol') ?? null;
  if (url) stage.style.backgroundImage = 'url("' + url + '")';
  else stage.classList.add('is-placeholder');

  const veil = document.createElement('div');
  veil.className = 'rs-veil';
  const glow = document.createElement('div');
  glow.className = 'rs-glow';
  for (const e of [veil, glow]) {
    e.style.left = FIGURE.left + '%';
    e.style.top = FIGURE.top + '%';
    e.style.width = FIGURE.width + '%';
    e.style.height = FIGURE.height + '%';
  }
  const steps = document.createElement('div');
  steps.className = 'rs-steps';

  const runner = document.createElement('img');
  runner.className = 'rs-runner';
  runner.alt = '';
  runner.src = assets?.image?.('sprite/student-' + appearance) ?? paperDollCanvas('student-' + appearance, 128, 256).toDataURL();
  stage.append(glow, veil, steps, runner);
  host.append(stage);

  let progress = 0;
  function place() {
    const [x, y, h] = along(progress);
    runner.style.left = x + '%';
    runner.style.top = y + '%';
    runner.style.height = h + '%';
  }
  place();

  // 칸을 꽉 채우되(16:9 유지) 길과 서 있는 것이 칸 안에 오도록 민다
  function layout() {
    const W = host.clientWidth;
    const H = host.clientHeight;
    if (!W || !H) return;
    const s = Math.max(W / 16, H / 9);
    const w = 16 * s;
    const h = 9 * s;
    const left = Math.min(0, Math.max(W - w, W / 2 - FOCUS.x * w));
    const top = Math.min(0, Math.max(H - h, H / 2 - FOCUS.y * h));
    Object.assign(stage.style, { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px' });
  }
  layout();
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(layout);
    ro.observe(host);
  }

  const hop = () => {
    if (reduceMotion()) return;
    runner.classList.remove('is-hop');
    void runner.offsetWidth;   // 같은 움직임을 다시 시작한다
    runner.classList.add('is-hop');
  };

  return {
    setProgress(p) { progress = p; place(); hop(); },
    step() { hop(); },
    hit() {
      if (steps.childElementCount >= MAX_STEPS) return;
      const [x, y] = along(progress);
      const d = document.createElement('span');
      d.className = 'rs-step';
      d.style.left = (x + (steps.childElementCount % 2 ? 0.8 : -0.8)) + '%';
      d.style.top = (y - 0.6) + '%';
      steps.append(d);
      hop();
    },
    stop() { progress = 1; place(); },
    reveal() {
      veil.classList.add('is-gone');
      glow.classList.add('is-on');
    },
    setPanelFraction() {},
    dispose() {
      ro?.disconnect();
      stage.remove();
    },
  };
}
