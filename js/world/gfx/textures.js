// 손으로 그린 듯한 캔버스 무늬(바깥 그림 파일 없이 코드로 만든다).
// 무늬는 대부분 밝은 회갈색 결만 담고, 색은 재질 색이나 꼭짓점 색으로 입힌다. 그래야 무늬 한 장을 여러 부분이 나눠 쓴다.
// 같은 씨앗이면 언제나 같은 그림이 나온다(점검 스크린숏이 흔들리지 않게).
//
//   const tex = createTextures(THREE);
//   tex.get('wood')      // 나뭇결(결이 u 방향으로 흐른다)
//   tex.dispose()
//
// 이름: hanji(한지 섬유), wood(오래된 나뭇결), planks(마루 널), roof(기와 골), stone(돌 쌓기), plaster(회벽),
//       foliage(종이 오린 나무 두 칸: 왼쪽 소나무, 오른쪽 꽃나무), mountains(수묵 병풍 산 세 줄), contact(접지 그림자), glow(등불 번짐)
import { TOKENS } from '../palette.js';

// 씨앗 있는 난수(mulberry32)
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

// 잔 얼룩: 낮은 해상도 무작위 점을 크게 늘려 부드러운 얼룩을 만든다.
function mottle(g, w, h, rnd, { cells = 8, lo = 0, hi = 30, alpha = 0.35 } = {}) {
  const [c, cg] = canvas(cells, cells);
  const img = cg.createImageData(cells, cells);
  for (let i = 0; i < cells * cells; i++) {
    const v = lo + rnd() * (hi - lo);
    img.data.set([v, v, v, 255], i * 4);
  }
  cg.putImageData(img, 0, 0);
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = 'multiply';
  g.imageSmoothingEnabled = true;
  g.drawImage(c, 0, 0, w, h);
  g.restore();
}

function speckle(g, w, h, rnd, n, color, size = 1) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(rnd() * w, rnd() * h, size * (0.5 + rnd()), size * (0.5 + rnd()));
}

// ───────── 그리기 함수들 ─────────

function drawHanji(rnd) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = TOKENS.hanji;
  g.fillRect(0, 0, 256, 256);
  mottle(g, 256, 256, rnd, { cells: 6, lo: 215, hi: 255, alpha: 0.6 });
  // 닥 섬유: 가늘고 굽은 선
  for (let i = 0; i < 220; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const len = 8 + rnd() * 30;
    const a = rnd() * Math.PI * 2;
    g.strokeStyle = rnd() < 0.6 ? 'rgba(150,130,100,0.18)' : 'rgba(255,252,240,0.5)';
    g.lineWidth = 0.4 + rnd() * 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  speckle(g, 256, 256, rnd, 90, 'rgba(120,100,80,0.25)', 1.2);
  return c;
}

// 나뭇결: 결이 가로(u)로 흐르는 밝은 회색. 옹이 몇 개.
function drawWood(rnd, w = 512, h = 128) {
  const [c, g] = canvas(w, h);
  g.fillStyle = grey(222);
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const y0 = rnd() * h;
    const amp = 1 + rnd() * 4;
    const freq = 0.004 + rnd() * 0.01;
    const ph = rnd() * 10;
    g.strokeStyle = rnd() < 0.7 ? grey(150 + rnd() * 50, 0.25 + rnd() * 0.3) : grey(250, 0.35);
    g.lineWidth = 0.6 + rnd() * 1.8;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.3;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const x = rnd() * w;
    const y = rnd() * h;
    for (let r = 10; r > 1; r -= 2.2) {
      g.strokeStyle = grey(120, 0.25);
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(x, y, r * 2.4, r, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  mottle(g, w, h, rnd, { cells: 10, lo: 190, hi: 255, alpha: 0.5 });
  return c;
}

// 마루 널: 세로(v) 방향으로 널 여섯 줄, 줄마다 이음매 자리가 다르다.
function drawPlanks(rnd) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rows = 6;
  const rh = S / rows;
  const wood = drawWood(rnd, 512, 128);
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 300;
    while (x < S) {
      const len = 220 + rnd() * 260;
      const tone = 0.86 + rnd() * 0.18;
      g.save();
      g.beginPath();
      g.rect(x, r * rh, len, rh);
      g.clip();
      g.drawImage(wood, x - rnd() * 300, r * rh - 20 - rnd() * 40, 1100, rh + 80);
      g.fillStyle = `rgba(${tone > 1 ? 255 : 40},${tone > 1 ? 250 : 30},${tone > 1 ? 240 : 20},${Math.abs(1 - tone) * 0.8})`;
      g.fillRect(x, r * rh, len, rh);
      g.restore();
      // 널 끝 이음매
      g.fillStyle = grey(70, 0.55);
      g.fillRect(x + len - 1.5, r * rh, 1.5, rh);
      x += len;
    }
    // 널 사이 틈과 모서리 빛
    g.fillStyle = grey(60, 0.6);
    g.fillRect(0, r * rh, S, 2);
    g.fillStyle = grey(255, 0.25);
    g.fillRect(0, r * rh + 2, S, 1.5);
  }
  // 오래 밟힌 자리: 가운데가 조금 밝게 닳았다
  const wear = g.createLinearGradient(0, 0, 0, S);
  wear.addColorStop(0, 'rgba(0,0,0,0.06)');
  wear.addColorStop(0.5, 'rgba(255,250,235,0.08)');
  wear.addColorStop(1, 'rgba(0,0,0,0.06)');
  g.fillStyle = wear;
  g.fillRect(0, 0, S, S);
  return c;
}

// 기와 골: u = 용마루 방향, v = 비탈 아래 방향. 수키와(볼록)와 암키와(오목) 줄이 번갈아 서고, 가로 겹침 그늘이 진다.
function drawRoof(rnd) {
  const S = 256;
  const [c, g] = canvas(S, S);
  const cols = 8;
  const cw = S / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * cw;
    // 암키와(오목, 넓은 골)
    const gr = g.createLinearGradient(x, 0, x + cw, 0);
    gr.addColorStop(0, grey(150));
    gr.addColorStop(0.5, grey(205));
    gr.addColorStop(1, grey(150));
    g.fillStyle = gr;
    g.fillRect(x, 0, cw, S);
    // 수키와(볼록, 좁은 등)
    const sx = x + cw * 0.78;
    const sw = cw * 0.44;
    const sg = g.createLinearGradient(sx - sw / 2, 0, sx + sw / 2, 0);
    sg.addColorStop(0, grey(70));
    sg.addColorStop(0.35, grey(235));
    sg.addColorStop(1, grey(85));
    g.fillStyle = sg;
    g.fillRect(sx - sw / 2, 0, sw, S);
  }
  // 겹침 그늘(기와 한 장 길이마다)
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const y = (r + 1) * (S / rows);
    const sh = g.createLinearGradient(0, y - 14, 0, y);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = sh;
    g.fillRect(0, y - 14, S, 14);
    g.fillStyle = grey(255, 0.25);
    g.fillRect(0, y % S, S, 1.5);
  }
  mottle(g, S, S, rnd, { cells: 8, lo: 170, hi: 255, alpha: 0.45 });
  speckle(g, S, S, rnd, 160, 'rgba(40,40,40,0.18)', 1.4);
  return c;
}

// 돌 쌓기: 줄마다 너비가 다른 장대석, 줄눈, 잔 점
function drawStone(rnd) {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = grey(120);
  g.fillRect(0, 0, S, S);
  const rows = 4;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 80;
    while (x < S) {
      const w = 60 + rnd() * 90;
      const v = 175 + rnd() * 50;
      g.fillStyle = grey(v);
      g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
      // 위 모서리 빛, 아래 그늘(깎은 돌 느낌)
      g.fillStyle = grey(255, 0.25);
      g.fillRect(x + 2, r * rh + 2, w - 4, 3);
      g.fillStyle = grey(0, 0.18);
      g.fillRect(x + 2, r * rh + rh - 6, w - 4, 4);
      x += w;
    }
  }
  mottle(g, S, S, rnd, { cells: 12, lo: 160, hi: 255, alpha: 0.5 });
  speckle(g, S, S, rnd, 500, 'rgba(60,60,60,0.25)', 1.2);
  speckle(g, S, S, rnd, 200, 'rgba(255,255,255,0.25)', 1);
  return c;
}

function drawPlaster(rnd) {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = grey(240);
  g.fillRect(0, 0, S, S);
  mottle(g, S, S, rnd, { cells: 7, lo: 205, hi: 255, alpha: 0.7 });
  mottle(g, S, S, rnd, { cells: 23, lo: 225, hi: 255, alpha: 0.5 });
  // 아래로 흐른 빗물 자국
  for (let i = 0; i < 10; i++) {
    const x = rnd() * S;
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, 'rgba(120,110,90,0.12)');
    gr.addColorStop(1, 'rgba(120,110,90,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 2 + rnd() * 6, S * (0.3 + rnd() * 0.7));
  }
  speckle(g, S, S, rnd, 120, 'rgba(90,80,70,0.2)', 1);
  return c;
}

// 종이 오린 나무: 칸 둘(512×512 두 장을 가로로). 오린 가장자리는 한지색 테두리로 남긴다.
function drawFoliage(rnd) {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  const rim = TOKENS.hanji;
  const cutout = (draw) => {
    // 같은 모양을 한지색으로 두껍게 한 번, 본 색으로 한 번: 오려 낸 종이 테두리가 남는다
    g.save();
    draw(true);
    g.restore();
    g.save();
    draw(false);
    g.restore();
  };
  // 왼쪽: 소나무. 굽은 줄기와 납작한 솔잎 덩어리 층
  const trunk = (rimPass) => {
    g.lineCap = 'round';
    g.strokeStyle = rimPass ? rim : '#6b5d50';
    g.lineWidth = rimPass ? 34 : 24;
    g.beginPath();
    g.moveTo(250, 512);
    g.bezierCurveTo(230, 400, 300, 330, 250, 230);
    g.bezierCurveTo(220, 170, 260, 120, 240, 70);
    g.stroke();
    g.lineWidth = rimPass ? 18 : 10;
    for (const [x0, y0, x1, y1] of [[262, 300, 380, 250], [250, 230, 140, 190], [245, 150, 340, 120], [252, 360, 140, 330]]) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2, y0 - 30, x1, y1);
      g.stroke();
    }
  };
  const clumps = [[390, 240, 110, 34], [130, 180, 100, 32], [340, 110, 105, 30], [240, 60, 90, 30], [130, 322, 95, 30], [250, 200, 80, 26]];
  const needles = (rimPass) => {
    for (const [x, y, rx, ry] of clumps) {
      g.fillStyle = rimPass ? rim : '#5c6b5f';
      g.beginPath();
      // 위가 둥글고 아래가 평평한 구름 모양 덩어리
      g.moveTo(x - rx, y + ry * 0.4);
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const bx = x - rx + t * rx * 2;
        g.quadraticCurveTo(bx - rx / 6, y - ry * (0.9 + 0.3 * Math.sin(t * 9)), bx, y - ry * 0.2);
      }
      g.lineTo(x + rx, y + ry * 0.4);
      g.closePath();
      if (rimPass) {
        g.strokeStyle = rim;
        g.lineWidth = 12;
        g.stroke();
      }
      g.fill();
      if (!rimPass) {
        // 솔잎 결: 짧은 먹선
        g.strokeStyle = 'rgba(20,28,24,0.55)';
        g.lineWidth = 1.5;
        for (let n = 0; n < 40; n++) {
          const px = x - rx * 0.9 + rnd() * rx * 1.8;
          const py = y - ry * 0.4 + rnd() * ry * 0.7;
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px + (rnd() - 0.5) * 10, py - 6 - rnd() * 6);
          g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x - rx * 0.8, y - ry * 0.7, rx * 1.6, ry * 0.25);
      }
    }
  };
  cutout((r) => { trunk(r); needles(r); });

  // 오른쪽: 꽃나무(매화). 가는 가지와 흰·분홍 꽃잎 송이
  g.save();
  g.translate(512, 0);
  const branches = [];
  const grow = (x, y, a, len, depth) => {
    const x1 = x + Math.cos(a) * len;
    const y1 = y + Math.sin(a) * len;
    branches.push([x, y, x1, y1, depth]);
    if (depth < 4) {
      grow(x1, y1, a - 0.35 - rnd() * 0.3, len * 0.7, depth + 1);
      grow(x1, y1, a + 0.3 + rnd() * 0.3, len * 0.66, depth + 1);
    }
  };
  grow(256, 512, -Math.PI / 2 - 0.08, 150, 0);
  const blossoms = branches.filter((b) => b[4] >= 2).flatMap(([, , x, y]) => Array.from({ length: 4 }, () => [x + (rnd() - 0.5) * 50, y + (rnd() - 0.5) * 40, 6 + rnd() * 7]));
  const drawBranches = (rimPass) => {
    g.lineCap = 'round';
    for (const [x0, y0, x1, y1, d] of branches) {
      g.strokeStyle = rimPass ? rim : '#6a5a50';
      g.lineWidth = (rimPass ? 10 : 0) + Math.max(3, 22 - d * 5);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  };
  const drawFlowers = (rimPass) => {
    for (const [x, y, r] of blossoms) {
      g.fillStyle = rimPass ? rim : rnd() < 0.5 ? '#e7b9b4' : '#f2dcd2';
      g.beginPath();
      g.arc(x, y, r + (rimPass ? 4 : 0), 0, Math.PI * 2);
      g.fill();
      if (!rimPass) {
        g.fillStyle = '#b8524a';
        g.beginPath();
        g.arc(x, y, r * 0.25, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  drawBranches(true);
  drawFlowers(true);
  drawBranches(false);
  drawFlowers(false);
  g.restore();
  return c;
}

// 수묵 병풍 산: 세 줄(위 = 먼 산, 아래 = 가까운 산). 산 아래쪽은 안개로 흐려진다(알파).
function drawMountains(rnd) {
  const W = 512;
  const H = 384;
  const [c, g] = canvas(W, H);
  const rowH = H / 3;
  const tones = ['#9c9890', '#6f6b64', '#46433e'];
  for (let r = 0; r < 3; r++) {
    const y0 = r * rowH;
    g.save();
    g.beginPath();
    g.rect(0, y0, W, rowH);
    g.clip();
    const peaks = 4 + r * 2;
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      let h = 0;
      for (let k = 1; k <= 3; k++) h += Math.sin(t * Math.PI * (peaks / k) + r * 1.7 + k) / k;
      h = 0.45 + 0.35 * h / 1.8 + (rnd() - 0.5) * 0.04;
      // 이음매가 보이지 않게 양 끝 높이를 맞춘다
      const edge = Math.min(1, Math.min(t, 1 - t) * 8);
      h = h * edge + 0.45 * (1 - edge);
      pts.push([t * W, y0 + rowH * (1 - Math.min(0.92, Math.max(0.12, h)))]);
    }
    const body = g.createLinearGradient(0, y0, 0, y0 + rowH);
    body.addColorStop(0, tones[r]);
    body.addColorStop(0.55, tones[r] + 'cc');
    body.addColorStop(1, tones[r] + '00');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(0, y0 + rowH);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(W, y0 + rowH);
    g.closePath();
    g.fill();
    // 먹 번짐 능선: 짙은 먹 선을 능선 따라 한 번
    g.strokeStyle = 'rgba(30,28,26,0.35)';
    g.lineWidth = 2.5 - r * 0.4;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    // 준법(산의 결): 능선에서 아래로 짧은 붓질
    g.strokeStyle = 'rgba(30,28,26,0.18)';
    g.lineWidth = 1.2;
    for (let n = 0; n < 90; n++) {
      const [x, y] = pts[(rnd() * pts.length) | 0];
      g.beginPath();
      g.moveTo(x, y + 4);
      g.lineTo(x + (rnd() - 0.5) * 14, y + 14 + rnd() * 30);
      g.stroke();
    }
    g.restore();
  }
  return c;
}

// 접지 그림자: 가운데가 짙은 둥근 번짐(넓은 번짐 + 좁은 핵)
function drawContact() {
  const S = 128;
  const [c, g] = canvas(S, S);
  const wide = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  wide.addColorStop(0, 'rgba(255,255,255,0.65)');
  wide.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  wide.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = wide;
  g.fillRect(0, 0, S, S);
  const core = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.22);
  core.addColorStop(0, 'rgba(255,255,255,0.35)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, S, S);
  return c;
}

function drawGlow() {
  const S = 128;
  const [c, g] = canvas(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,236,190,0.9)');
  gr.addColorStop(0.3, 'rgba(255,214,150,0.35)');
  gr.addColorStop(1, 'rgba(255,200,130,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

const PAINTERS = {
  hanji: { draw: drawHanji, repeat: true, srgb: true },
  wood: { draw: (r) => drawWood(r), repeat: true, srgb: true },
  planks: { draw: drawPlanks, repeat: true, srgb: true },
  roof: { draw: drawRoof, repeat: true, srgb: true },
  stone: { draw: drawStone, repeat: true, srgb: true },
  plaster: { draw: drawPlaster, repeat: true, srgb: true },
  foliage: { draw: drawFoliage, repeat: false, srgb: true },
  mountains: { draw: drawMountains, repeat: false, srgb: true, wrapS: true },
  contact: { draw: drawContact, repeat: false, srgb: false },
  glow: { draw: drawGlow, repeat: false, srgb: true },
};

export const TEXTURE_NAMES = Object.keys(PAINTERS);

export function createTextures(THREE, { seed = 7, anisotropy = 1 } = {}) {
  const made = new Map();
  function get(name) {
    if (made.has(name)) return made.get(name);
    const p = PAINTERS[name];
    if (!p) throw new Error('[gfx] 모르는 무늬: ' + name);
    const tex = new THREE.CanvasTexture(p.draw(seeded(seed + name.length * 101 + name.charCodeAt(0))));
    if (p.srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (p.repeat || p.wrapS) tex.wrapS = THREE.RepeatWrapping;
    if (p.repeat) tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = anisotropy;
    tex.name = 'gfx-' + name;
    made.set(name, tex);
    return tex;
  }
  function dispose() {
    for (const t of made.values()) t.dispose();
    made.clear();
  }
  return { get, dispose, count: () => made.size };
}

// ───────── 덧붙임(T39) ─────────

// 화강암: 쌓은 돌 줄눈 없이 한 덩이 돌의 결. 검은 운모, 흰 석영, 옅은 장석 알갱이가 고르게 박혀 있고 큰 얼룩이 은은하다.
// 꼭짓점 색(돌 색)에 곱해지므로 밝은 회색 바탕으로 그린다. 석탑 탑신·옥개석(향가관)이 쓴다.
function drawGranite(rnd) {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = grey(212);
  g.fillRect(0, 0, S, S);
  mottle(g, S, S, rnd, { cells: 10, lo: 185, hi: 255, alpha: 0.55 });
  speckle(g, S, S, rnd, 900, 'rgba(150,146,140,0.45)', 1.6);
  speckle(g, S, S, rnd, 1300, 'rgba(48,46,44,0.5)', 1.1);
  speckle(g, S, S, rnd, 700, 'rgba(255,255,255,0.55)', 1.2);
  speckle(g, S, S, rnd, 350, 'rgba(206,182,160,0.4)', 1.5);
  return c;
}
PAINTERS.granite = { draw: drawGranite, repeat: true, srgb: true };
TEXTURE_NAMES.push('granite');
