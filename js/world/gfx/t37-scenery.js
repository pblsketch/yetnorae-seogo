// 작품 방과 보스 장면이 함께 쓰는 풍경 꾸러미(T37). gfx 꾸러미(textures·materials·kit) 위에 얹는다.
//  - createScenery(THREE): 무늬·재질·소품 틀을 한 벌 만들고, 꾸러미에 없는 역할 셋을 더한다.
//      thatch(볏짚 지붕), water(시냇물, 무늬가 흐른다), ink(빛 없는 먹 칠: 먼 산 덩이, 안개 띠)
//  - 소품: 모임지붕·초가지붕(hipRoof), 초가(thatchedHut), 정자(pavilion), 바위(rock), 시내(stream), 땅(groundDisc),
//          산 덩이(mountainMass), 먹 번짐 띠(mistBand)
// 좌표는 1 = 1m, +y 위, 정면 +z. 역할 하나 = 그리기 호출 하나(꾸러미 builder 규칙 그대로).
// 다 쓰면 scenery.dispose()로 무늬·재질·기하를 모두 치운다(장면의 Mesh 기하는 부르는 쪽이 치운다).
import { TOKENS, mixHex } from '../palette.js';
import { createTextures, seeded } from './textures.js';
import { createMaterials, addInkHook } from './materials.js';
import { createKit } from './kit.js';

// ───────── 더하는 무늬 ─────────

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// 볏짚: v(비탈 아래) 방향으로 짚 결, 가로로 새끼줄 띠. 밝은 회색(색은 꼭짓점 색으로)
function drawThatch(rnd) {
  const W = 256;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = 'rgb(214,214,214)';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const len = 10 + rnd() * 26;
    const v = 150 + rnd() * 105;
    g.strokeStyle = `rgba(${v | 0},${v | 0},${(v * 0.95) | 0},${0.35 + rnd() * 0.4})`;
    g.lineWidth = 0.8 + rnd() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 4, y + len);
    g.stroke();
  }
  // 새끼줄 띠 두 줄(이엉을 묶은 줄)
  for (const y0 of [64, 192]) {
    g.fillStyle = 'rgba(90,82,70,0.55)';
    g.fillRect(0, y0, W, 5);
    for (let x = 0; x < W; x += 7) {
      g.strokeStyle = 'rgba(60,55,48,0.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + 5, y0 + 5);
      g.stroke();
    }
  }
  return c;
}

// 시냇물: 엷은 청회색 바탕에 흐름과 직각인 먹 물결 붓질(v가 흐름 방향)
function drawWater(rnd) {
  const W = 128;
  const H = 256;
  const [c, g] = canvas(W, H);
  const gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, '#c9d3cf');
  gr.addColorStop(0.5, '#e4ebe6');
  gr.addColorStop(1, '#c9d3cf');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    const y = rnd() * H;
    const x = rnd() * W * 0.7;
    const len = 18 + rnd() * 50;
    g.strokeStyle = rnd() < 0.7 ? `rgba(70,84,82,${0.18 + rnd() * 0.25})` : 'rgba(255,255,255,0.7)';
    g.lineWidth = 0.8 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 2, y - 3 - rnd() * 3, x + len, y);
    g.stroke();
  }
  return c;
}

// 먹 덩이: 가운데가 짙고 가장자리가 번지는 먹(알파는 쓰지 않고 바탕 한지색으로 번진다)
function drawInk(rnd) {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = 'rgb(236,236,236)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 6 + rnd() * 30;
    const v = 170 + rnd() * 80;
    g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.12)`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    g.strokeStyle = `rgba(80,80,80,${0.08 + rnd() * 0.12})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 10, y + 10 + rnd() * 24);
    g.stroke();
  }
  return c;
}

// 먹 안개 번짐(가운데가 짙은 둥근 번짐, 알파)
function drawMist() {
  const S = 128;
  const [c, g] = canvas(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.4)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

// ───────── 꾸러미 한 벌 ─────────

// 빛 없는 꼴로 바꿀 수 있는 역할과 그 무늬·먹 바닥(materials.js의 같은 역할과 맞춘다)
const UNLIT = { wood: ['wood', 0.55], paint: ['hanji', 0], plaster: ['plaster', 0.7], roof: ['roof', 0.8], stone: ['stone', 0.75], floor: ['planks', 0.6], books: ['hanji', 0.25], thatch: ['thatch', 0.7] };

// unlit: 빛 계산 없이(MeshBasic) 그릴 역할 이름 목록. 어두운 밤 장면처럼 빛의 결이 작고 넓은 면이 많은 곳에서
//   SwiftShader 채움 비용을 크게 줄인다(굽은 AO·아랫면 그늘은 꼭짓점 색에 그대로 남는다).
// 무늬 거르기: 밉맵 두 층을 섞는 삼선형 대신 가까운 층 하나만 읽는다(SwiftShader에서 무늬 읽기가 넓은 면의 가장 큰 비용이었다.
//   「십 년을 경영하야」 가까운 화면에서 약 1.4배). 결의 차이는 눈에 띄지 않는다.
// untextured: 빛은 받되 무늬 없이(꼭짓점 색만) 그릴 역할. 화면을 꽉 채우는 가까운 면에 쓴다.
export function createScenery(THREE, { seed = 37, unlit = [], untextured = [] } = {}) {
  const baseTextures = createTextures(THREE);
  const cheap = (t) => { if (t && t.minFilter !== THREE.LinearMipmapNearestFilter) { t.minFilter = THREE.LinearMipmapNearestFilter; t.needsUpdate = true; } return t; };
  const textures = { ...baseTextures, get: (name) => cheap(baseTextures.get(name)) };
  const materials = createMaterials(THREE, textures);
  const extraTex = new Map();
  const extraMat = new Map();
  const tex = (name, draw, repeat = true) => {
    if (extraTex.has(name)) return extraTex.get(name);
    const t = new THREE.CanvasTexture(draw(seeded(seed + name.length * 53)));
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 1;
    t.minFilter = THREE.LinearMipmapNearestFilter;
    extraTex.set(name, t);
    return t;
  };
  const recipes = {
    thatch: () => addInkHook(new THREE.MeshLambertMaterial({ map: tex('thatch', drawThatch), vertexColors: true }), materials.shared, 0.7),
    water: () => new THREE.MeshBasicMaterial({ map: tex('water', drawWater), vertexColors: true }),
    ink: () => new THREE.MeshBasicMaterial({ map: tex('ink', drawInk), vertexColors: true }),
    // 무늬 없는 빛 없는 칠(넓은 땅): SwiftShader에서 넓은 면의 무늬 읽기가 가장 비싸므로 꼭짓점 색만 쓴다
    plain: () => new THREE.MeshBasicMaterial({ vertexColors: true }),
    mist: () => new THREE.MeshBasicMaterial({ map: tex('mist', drawMist, false), transparent: true, depthWrite: false, vertexColors: true, opacity: 0.85 }),
  };
  const get = (role) => {
    if (extraMat.has(role)) return extraMat.get(role);
    if (untextured.includes(role) && UNLIT[role]) {
      const m = addInkHook(new THREE.MeshLambertMaterial({ vertexColors: true }), materials.shared, UNLIT[role][1]);
      m.name = 'gfx-' + role + '-flat';
      extraMat.set(role, m);
      return m;
    }
    if (unlit.includes(role) && UNLIT[role]) {
      const [texName, floor] = UNLIT[role];
      const map = texName === 'thatch' ? tex('thatch', drawThatch) : textures.get(texName);
      const m = addInkHook(new THREE.MeshBasicMaterial({ map, vertexColors: role !== 'books' }), materials.shared, floor);
      m.name = 'gfx-' + role + '-unlit';
      extraMat.set(role, m);
      return m;
    }
    if (recipes[role]) {
      const m = recipes[role]();
      m.name = 'gfx-' + role;
      extraMat.set(role, m);
      return m;
    }
    return materials.get(role);
  };
  // 꾸러미 builder가 역할 이름으로 재질을 찾으므로, 더한 역할도 같은 이름표로 내놓는다
  const matProxy = { get, setDancheong: materials.setDancheong, shared: materials.shared };
  const kit = createKit(THREE, { materials: matProxy });
  // 같은 쪽 그리기 순서: 안개 띠는 먼 배경(-10) 뒤, 접지(5) 앞
  const mistOrder = 3;

  function build(b, name) {
    const g = b.build(name);
    for (const m of g.children) if (m.material === extraMat.get('mist')) m.renderOrder = mistOrder;
    return g;
  }

  function dispose() {
    kit.dispose();
    materials.dispose();
    textures.dispose();
    for (const m of extraMat.values()) m.dispose();
    for (const t of extraTex.values()) t.dispose();
    extraMat.clear();
    extraTex.clear();
  }

  return { THREE, textures, materials: matProxy, kit, build, waterTexture: () => tex('water', drawWater), dispose, ...props(THREE, kit) };
}

// ───────── 소품 ─────────

function props(THREE, kit) {
  // 높이 면(격자) 하나를 지붕 판으로: 윗면 + 아랫면 + 둘레 띠. f(X, Z) → 높이. uvOf(X, Z, y) → [u, v]
  function slab(f, { A, B, seg = 16, thick = 0.14, uvOf }) {
    const n = seg + 1;
    const top = [];
    const uv = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const X = -A + (2 * A * i) / seg;
        const Z = -B + (2 * B * j) / seg;
        const y = f(X, Z);
        top.push([X, y, Z]);
        uv.push(uvOf(X, Z, y));
      }
    }
    const pos = [];
    const uvs = [];
    const idx = [];
    const push = (p, t) => { pos.push(...p); uvs.push(...t); return pos.length / 3 - 1; };
    const T = top.map((p, k) => push(p, uv[k]));
    const D = top.map((p, k) => push([p[0], p[1] - thick, p[2]], uv[k]));
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * n + i;
        const bq = a + n;
        idx.push(T[a], T[bq], T[a + 1], T[a + 1], T[bq], T[bq + 1]);
        idx.push(D[a], D[a + 1], D[bq], D[a + 1], D[bq + 1], D[bq]);
      }
    }
    // 둘레 띠: 처마 끝 두께
    const ring = [];
    for (let i = 0; i < seg; i++) ring.push(i);
    for (let j = 0; j < seg; j++) ring.push(j * n + seg);
    for (let i = seg; i > 0; i--) ring.push(seg * n + i);
    for (let j = seg; j > 0; j--) ring.push(j * n);
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k];
      const c = ring[(k + 1) % ring.length];
      idx.push(T[a], T[c], D[a], T[c], D[c], D[a]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const out = g.toNonIndexed();
    g.dispose();
    return out;
  }

  // 지붕. style: 'giwa'(오목한 모임지붕, 처마 끝이 들림) | 'thatch'(둥글게 부푼 초가지붕).
  // (x, z): 가운데, y: 처마 높이, w·d: 집 너비·깊이, h: 처마에서 꼭대기까지, overhang: 처마 내밈
  function hipRoof(b, { x, z, y, w, d, h, overhang = 0.6, style = 'giwa', color, lift = 0.4, rotY = 0, seg = 18, thick }) {
    const A = w / 2 + overhang;
    const B = d / 2 + overhang;
    const R = Math.max(0, A - B);   // 용마루 반 길이
    const thatch = style === 'thatch';
    const f = (X, Z) => {
      const dx = Math.max(0, Math.abs(X) - R) / B;
      const dz = Math.abs(Z) / B;
      if (thatch) {
        const r = Math.min(1, (dx ** 3.2 + dz ** 3.2) ** (1 / 3.2));
        return h * Math.pow(Math.max(0, 1 - r ** 2.1), 0.62);
      }
      const r = Math.min(1, Math.max(dx, dz));
      const corner = Math.pow(Math.min(dx, dz), 2.2);
      return h * Math.pow(1 - r, 1.45) + lift * corner * r;
    };
    const uvOf = (X, Z, yy) => {
      const ang = Math.atan2(X, Z);
      const per = (A + B) * 2;
      const r = Math.min(1, Math.max(Math.max(0, Math.abs(X) - R) / B, Math.abs(Z) / B));
      return thatch ? [ang * per / (Math.PI * 2) / 1.2, (1 - r) * Math.hypot(B, h) / 1.0 + yy * 0.1] : [ang * per / (Math.PI * 2) / 2.4, (1 - r) * Math.hypot(B, h) / 1.4];
    };
    const geo = slab(f, { A, B, seg, thick: thick ?? (thatch ? 0.32 : 0.16), uvOf });
    b.add(thatch ? 'thatch' : 'roof', geo, { p: [x, y, z], r: [0, rotY, 0], color: color ?? (thatch ? '#c8ad78' : '#5b5853'), uv: 'keep', ao: 0 });
    if (thatch) {
      // 용마름(꼭대기를 덮은 짚 마름): 둥근 굵은 띠
      b.add('thatch', kit.cylinder(0.16, 0.16, Math.max(0.4, R * 2 + 0.5), 8), { p: [x, y + h - 0.02, z], r: [0, rotY, Math.PI / 2], color: mixHex(color ?? '#c8ad78', '#3a3128', 0.3), ao: 0 });
    } else if (R > 0.05) {
      b.box('roof', R * 2 + 0.3, 0.2, 0.3, { p: [x, y + h + 0.06, z], r: [0, rotY, 0], color: mixHex(color ?? '#5b5853', '#000000', 0.2), ao: 0 });
    } else {
      // 모임지붕 꼭대기 절병통
      b.add('roof', kit.cylinder(0.05, 0.16, 0.32, 8), { p: [x, y + h + 0.12, z], color: mixHex(color ?? '#5b5853', '#000000', 0.25), ao: 0 });
      b.add('roof', kit.cylinder(0.12, 0.05, 0.16, 8), { p: [x, y + h + 0.34, z], color: mixHex(color ?? '#5b5853', '#000000', 0.25), ao: 0 });
    }
  }

  // 초가: 돌 기단, 둥근 기둥, 흙벽(회벽), 띠살 창호, 초가지붕. bays: 칸 수. 정면 +z. open: 앞이 트인 칸(시조 방)
  function thatchedHut(b, { x = 0, z = 0, bays = 3, bayW = 2.2, depth = 2.6, wall = 2.0, base = 0.42, open = false, doors = true, roofColor = '#c4a874', rotY = 0 }) {
    const W = bays * bayW;
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(1, 1, 1));
    const at = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(M).toArray();
    const r = [0, rotY, 0];
    // 기단(막돌 쌓기) + 섬돌
    b.box('stone', W + 0.9, base, depth + 0.9, { p: at(0, base / 2, 0), r, color: '#a49d90', ao: 0.5, bevel: 0.05 });
    b.box('stone', 1.0, base * 0.5, 0.5, { p: at(0, base * 0.25, depth / 2 + 0.7), r, color: '#9a948a', ao: 0.4, bevel: 0.04 });
    const y0 = base;
    // 기둥
    const xs = Array.from({ length: bays + 1 }, (_, i) => -W / 2 + i * bayW);
    for (const px of xs) {
      for (const pz of [depth / 2, -depth / 2]) {
        b.add('wood', kit.cylinder(0.1, 0.12, wall, 10), { p: at(px, y0 + wall / 2, pz), color: '#6e5843' });
      }
    }
    // 도리·인방
    b.box('wood', W + 0.4, 0.18, 0.2, { p: at(0, y0 + wall + 0.05, depth / 2), r, color: '#5e4a3a' });
    b.box('wood', W + 0.4, 0.18, 0.2, { p: at(0, y0 + wall + 0.05, -depth / 2), r, color: '#5e4a3a' });
    // 뒷벽과 옆벽(흙벽)
    b.box('plaster', W, wall, 0.14, { p: at(0, y0 + wall / 2, -depth / 2 + 0.02), r, color: '#ddd0b4', ao: 0.3 });
    for (const sx of [-W / 2, W / 2]) b.box('plaster', 0.14, wall, depth, { p: at(sx, y0 + wall / 2, 0), r, color: '#d6c8aa', ao: 0.3 });
    if (open) {
      // 칸막이(안쪽 벽)
      for (const px of xs.slice(1, -1)) b.box('plaster', 0.12, wall, depth - 0.2, { p: at(px, y0 + wall / 2, -0.05), r, color: '#d9ccb0', ao: 0.3 });
      // 방바닥(장판색)
      b.box('floor', W - 0.1, 0.06, depth - 0.1, { p: at(0, y0 + 0.03, 0), r, color: '#cdb48a', ao: 0 });
    } else {
      // 앞벽: 칸마다 띠살 문 하나, 흙벽
      b.box('plaster', W, wall, 0.12, { p: at(0, y0 + wall / 2, depth / 2 - 0.02), r, color: '#e2d6bb', ao: 0.3 });
      if (doors) {
        for (let i = 0; i < bays; i++) {
          const cx = -W / 2 + bayW * (i + 0.5);
          const p = at(cx, 0, depth / 2 + 0.06);
          kit.latticeWindow(b, { x: p[0], y: y0 + 0.15, z: p[2], w: bayW * 0.42, h: wall * 0.72, pattern: 'tti', cols: 4 });
        }
      }
      // 툇마루
      b.box('floor', W + 0.3, 0.1, 0.6, { p: at(0, y0 + 0.05, depth / 2 + 0.36), r, color: '#a08468', ao: 0.2 });
    }
    hipRoof(b, { x, z, y: y0 + wall + 0.1, w: W, d: depth, h: 1.25, overhang: 0.75, style: 'thatch', color: roofColor, rotY });
    kit.contactShadow(b, { x, z, w: W + 2.4, d: depth + 2.2, strength: 1 });
    return { top: y0 + wall + 1.35, width: W };
  }

  // 정자: 장대석 기단, 기둥, 계자 난간, 모임지붕. 정면 +z. size: 한 변
  function pavilion(b, { x = 0, z = 0, size = 3.2, height = 2.5, paint = '#7d4a3c', accent = '#5d6f62', roofColor = '#5b5853', six = false }) {
    const base = 0.55;
    b.box('stone', size + 0.9, base, size + 0.9, { p: [x, base / 2, z], color: '#9e978b', ao: 0.5, bevel: 0.05 });
    b.box('stone', size + 1.0, 0.07, size + 1.0, { p: [x, base + 0.035, z], color: '#b4ad9f', ao: 0, bevel: 0.02 });
    b.box('floor', size + 0.2, 0.12, size + 0.2, { p: [x, base + 0.13, z], color: '#a08468', ao: 0 });
    const hs = size / 2;
    const posts = [];
    const n = six ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = six ? (i / 6) * Math.PI * 2 : Math.PI / 4 + (i / 4) * Math.PI * 2;
      const rr = six ? hs : hs * Math.SQRT2;
      posts.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
    }
    const y0 = base + 0.19;
    for (const [px, pz] of posts) {
      b.add('wood', kit.cylinder(0.12, 0.14, height, 12), { p: [px, y0 + height / 2, pz], color: paint });
      b.add('stone', kit.cylinder(0.2, 0.24, 0.16, 8), { p: [px, y0 + 0.02, pz], color: '#a8a195', ao: 0 });
    }
    // 창방(기둥머리 잇는 보)과 난간
    for (let i = 0; i < n; i++) {
      const [ax, az] = posts[i];
      const [bx, bz] = posts[(i + 1) % n];
      const len = Math.hypot(bx - ax, bz - az);
      const rotY = -Math.atan2(bz - az, bx - ax);
      b.box('paint', len, 0.22, 0.2, { p: [(ax + bx) / 2, y0 + height - 0.05, (az + bz) / 2], r: [0, rotY, 0], color: accent, ao: 0 });
      // 앞(+z) 가운데는 드나드는 자리로 비운다
      const front = (az + bz) / 2 > z + hs * 0.5;
      if (!front) {
        b.box('wood', len, 0.07, 0.08, { p: [(ax + bx) / 2, y0 + 0.62, (az + bz) / 2], r: [0, rotY, 0], color: '#5e4a3a', ao: 0 });
        b.box('wood', len, 0.05, 0.06, { p: [(ax + bx) / 2, y0 + 0.28, (az + bz) / 2], r: [0, rotY, 0], color: '#5e4a3a', ao: 0 });
        for (let k = 1; k < 6; k++) {
          const t = k / 6;
          b.box('wood', 0.04, 0.34, 0.04, { p: [ax + (bx - ax) * t, y0 + 0.45, az + (bz - az) * t], color: '#5e4a3a', ao: 0 });
        }
      }
    }
    hipRoof(b, { x, z, y: y0 + height + 0.05, w: size + 0.2, d: size + 0.2, h: 1.35, overhang: 0.95, style: 'giwa', color: roofColor, lift: 0.55 });
    kit.contactShadow(b, { x, z, w: size + 3, d: size + 2.6, strength: 1 });
  }

  // 바위: 깎인 다면체(꼭짓점을 흔든 정이십면체). 납작하게 앉힌다
  const rockGeos = [];
  function rockGeo(seed) {
    const k = seed % 4;
    if (rockGeos[k]) return rockGeos[k];
    const rnd = seeded(91 + k * 17);
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    const seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(3)).join(',');
      if (!seen.has(key)) seen.set(key, 0.78 + rnd() * 0.38);
      const s = seen.get(key);
      p.setXYZ(i, p.getX(i) * s, Math.max(-0.35, p.getY(i)) * s, p.getZ(i) * s);
    }
    const out = g.toNonIndexed();
    g.dispose();
    out.deleteAttribute('uv');
    out.computeVertexNormals();
    rockGeos[k] = out;
    return out;
  }
  function rock(b, { x, y = 0, z, s = 0.5, flat = 0.6, seed = 1, color = '#8f8a80', rotY = 0, shadow = true }) {
    b.add('stone', rockGeo(seed), { p: [x, y + s * 0.2 * flat, z], r: [0, rotY + seed, 0], s: [s * 1.15, s * flat, s], color, ao: 0.35 });
    if (shadow) kit.contactShadow(b, { x, z, w: s * 3, d: s * 2.4, strength: 0.7 });
  }

  // 시내: 점 목록(x, z)을 따라 흐르는 띠(water 역할) + 물가 돌. 무늬 v가 흐름 방향
  function stream(b, { points, width = 2.2, y = 0.02, rocks = true, seed = 3 }) {
    const pos = [];
    const uvs = [];
    const idx = [];
    let s = 0;
    const rnd = seeded(seed);
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)];
      const c = points[Math.min(points.length - 1, i + 1)];
      const dx = c[0] - a[0];
      const dz = c[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l;
      const nz = dx / l;
      if (i > 0) s += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      const w = width * (0.85 + 0.3 * Math.sin(i * 1.7));
      for (const sg of [-1, 1]) {
        pos.push(points[i][0] + nx * w / 2 * sg, y, points[i][1] + nz * w / 2 * sg);
        uvs.push(sg < 0 ? 0 : 1, s / 3);
      }
      if (rocks && i % 2 === 0) {
        for (const sg of [-1, 1]) {
          if (rnd() < 0.35) continue;
          rock(b, { x: points[i][0] + nx * (w / 2 + 0.15) * sg, z: points[i][1] + nz * (w / 2 + 0.15) * sg, s: 0.22 + rnd() * 0.3, seed: (i * 7 + (sg > 0 ? 3 : 0)) | 0, color: '#a39d91', shadow: false });
        }
      }
    }
    for (let i = 0; i < points.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const out = g.toNonIndexed();
    g.dispose();
    // 물가 젖은 흙(조금 넓고 어두운 띠)
    b.add('water', out, { color: '#ffffff', uv: 'keep', ao: 0 });
    return out;
  }

  // 땅: 가운데는 color, 가장자리로 갈수록 바탕(fade) 색으로 녹는 원판(테 넷). 빛 없는 plain 역할(무늬 없이 꼭짓점 색만: 채움이 가장 싸다)
  // 무늬는 tile(m)마다 한 번 되풀이한다(비스듬히 보는 넓은 면이라 잔 무늬를 피한다)
  function flatUv(g, tile) {
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
    return g;
  }
  function groundDisc(b, { x = 0, z = 0, r = 30, color = '#cfc3a6', fade = TOKENS.hanji, rings = 4, sy = 1, sx = 1, tile = 7, role = 'plain' }) {
    const inner = r * 0.45;
    b.add(role, flatUv(new THREE.CircleGeometry(inner, 40).rotateX(-Math.PI / 2).toNonIndexed(), tile), { p: [x, 0, z], s: [sx, 1, sy], color, ao: 0, uv: 'keep' });
    for (let k = 0; k < rings; k++) {
      const r0 = inner + ((r - inner) * k) / rings;
      const r1 = inner + ((r - inner) * (k + 1)) / rings;
      const g = flatUv(new THREE.RingGeometry(r0, r1, 40, 1).rotateX(-Math.PI / 2).toNonIndexed(), tile);
      b.add(role, g, { p: [x, -0.002 * (k + 1), z], s: [sx, 1, sy], color: mixHex(color, fade, (k + 1) / (rings + 0.6)), ao: 0, uv: 'keep' });
    }
  }

  // 산 덩이: 둥근 밑동에서 솟은 높이 면. 꼭대기는 짙은 먹, 밑동은 한지색으로 번진다(먹 번짐). 메시 하나(재질 ink)
  // height(x, z) → 그 자리 높이를 내놓는 함수도 함께 돌려준다(길이 산을 따라 오를 때 쓴다).
  function mountainMass(materials, { x, z, r, h, seed = 5, top = '#4a4740', foot = TOKENS.hanji, peaks = 3, seg = 40, power = 1.25 }) {
    const rnd = seeded(seed);
    const bumps = Array.from({ length: peaks }, (_, i) => ({ a: rnd() * Math.PI * 2, d: i === 0 ? 0 : 0.25 + rnd() * 0.3, k: i === 0 ? 1 : 0.45 + rnd() * 0.3, w: i === 0 ? 1 : 0.35 + rnd() * 0.2 }));
    const height = (px, pz) => {
      const dx = (px - x) / r;
      const dz = (pz - z) / r;
      let y = 0;
      for (const b of bumps) {
        const cx = Math.cos(b.a) * b.d;
        const cz = Math.sin(b.a) * b.d;
        const d = Math.hypot(dx - cx, dz - cz) / b.w;
        y = Math.max(y, b.k * Math.pow(Math.max(0, 1 - d), power));
      }
      return y * h;
    };
    // 둥근 격자(가운데에서 바깥으로 테): 산 밑동 바깥의 평평한 땅을 그리지 않는다
    const g = new THREE.RingGeometry(0.001, r, seg, Math.round(seg * 0.45)).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const ct = new THREE.Color(top);
    const cf = new THREE.Color(foot);
    const c = new THREE.Color();
    const n = seeded(seed + 9);
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i) + x;
      const pz = p.getZ(i) + z;
      const y = height(px, pz);
      const jag = y > 0.05 ? (n() - 0.5) * 0.12 * h * 0.08 : 0;
      p.setY(i, y + jag - 0.04);
      const t = Math.min(1, Math.max(0, y / h));
      c.copy(cf).lerp(ct, Math.pow(t, 0.7) * (0.85 + n() * 0.15));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.translate(x, 0, z);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, materials.get('ink'));
    mesh.name = 'mountain-mass';
    mesh.matrixAutoUpdate = false;
    return { mesh, height };
  }

  // 수묵 먼 산 두 줄(꾸러미 inkBackdrop의 가벼운 꼴): 먼 줄(엷음)과 가까운 줄(짙음). 투명 판이 겹치는 넓이를 줄인다
  function inkRanges(b, { x0, x1, z, height = 14, gap = 10, y = -2, rows = [0, 2], color = '#ffffff' }) {
    const L = x1 - x0;
    rows.forEach((row, k) => {
      const v0 = 1 - (row + 1) / 3;
      const v1 = 1 - row / 3;
      const far = k === 0;
      const h = far ? height * 1.15 : height * 0.72;
      b.add('backdrop', kit.card(0, v0 + 0.002, L / (far ? 55 : 34), v1 - 0.002), { p: [(x0 + x1) / 2, y, z - (far ? gap : 0)], s: [L, h, 1], color, uv: 'keep', ao: 0 });
    });
  }

  // 먹 안개 띠: 땅 가까이 깔린 엷은 번짐 카드 몇 장(카메라 쪽을 보는 넓은 판, 알파). 꼭 필요한 곳만
  function mistBand(b, { x0, x1, z, y = 0.6, h = 2.2, count = 4, color = TOKENS.hanji, seed = 2 }) {
    const rnd = seeded(seed);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const w = ((x1 - x0) / count) * 2.2;
      b.add('mist', kit.card(), { p: [x0 + (x1 - x0) * t, y - h * 0.45, z + (rnd() - 0.5) * 1.5], s: [w, h, 1], color, uv: 'keep', ao: 0 });
    }
  }

  return { hipRoof, thatchedHut, pavilion, rock, stream, groundDisc, mountainMass, mistBand, inkRanges };
}

// 장면 무리 안의 Mesh 기하를 모두 치운다(재질·무늬는 scenery.dispose가 치운다)
export function disposeGroupGeometry(group) {
  group?.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
}
