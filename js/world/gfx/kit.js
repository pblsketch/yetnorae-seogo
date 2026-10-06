// 세계 소품 꾸러미: 모서리를 깎은 부분들을 재질 역할마다 하나의 기하로 합쳐 그린다(역할 하나 = 그리기 호출 하나).
// 같은 모양이 많이 되풀이되는 것(책등)은 InstancedMesh 하나로 그린다.
//
//   const kit = createKit(THREE, { materials });
//   const b = kit.builder();                    // 부분을 모으는 틀
//   kit.hanokFrame(b, { x0: 0, x1: 12, z: -2.6, posts: [0, 4, 8, 12] });
//   kit.giwaRoof(b, { x0: -1, x1: 13, zFront: -1.2, zBack: -3.2, yFront: 4.1, yBack: 4.9 });
//   kit.bookshelf(b, { x: 2, z: -2.4, width: 2.6 });
//   const group = b.build('corridor');          // THREE.Group(역할마다 Mesh 하나 + 책등 InstancedMesh)
//
// 좌표는 1 = 1m, +y 위. 소품 함수는 모두 '바닥 가운데'를 기준으로 놓고, 방향은 정면이 +z(카메라 쪽)다.
// 꼭짓점 색 = 부분 색 × 굽은 AO(바닥에 가까울수록, 아랫면일수록 어둡다). 무늬 좌표는 부분의 긴 축을 따라 m 단위로 잡는다.
import { TOKENS, mixHex } from '../palette.js';
import { seeded } from './textures.js';

// 역할마다 무늬 한 장이 덮는 크기(m): [u, v]. u는 부분의 긴 축 방향이다.
const TEX_SIZE = {
  wood: [2.0, 0.5], paint: [1.2, 1.2], plaster: [1.6, 1.6], ground: [1.6, 1.6], roof: [2.4, 1.4], stone: [1.6, 1.6],
  floor: [2.4, 1.2], paper: [0.9, 0.9], lantern: [0.6, 0.6], books: [0.3, 0.3], foliage: [1, 1], backdrop: [1, 1], contact: [1, 1], glow: [1, 1],
};

// 그리기 순서: 불투명 → 알파 자르기 → 투명(먼 배경 먼저)
const ORDER = { backdrop: -10, contact: 5, glow: 10 };

export const WOOD = {
  pillar: '#6b5440',     // 기둥(오래된 소나무)
  beam: '#5e4a3a',
  dark: '#3f3530',       // 문살·책장 틀
  light: '#a08468',      // 마루
  rafter: '#594638',
};

export function createKit(THREE, { materials }) {
  const geoCache = new Map();

  // 모서리를 깎은 상자(가로 w, 높이 h, 깊이 d, 깎는 폭 b). 가운데가 원점. 면마다 평평한 법선이라 깎인 면이 빛을 받는다.
  function chamferBox(w, h, d, b = 0.02) {
    b = Math.max(0.001, Math.min(b, w / 4, h / 4, d / 4));
    const key = [w, h, d, b].map((v) => v.toFixed(3)).join(',');
    if (geoCache.has(key)) return geoCache.get(key);
    // 아주 가는 부분(창살, 작은 판)은 깎아도 보이지 않으므로 평범한 상자(삼각형 12개)로
    if (Math.min(w, h, d) < 0.05 || b < 0.004) {
      const plain = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      plain.deleteAttribute('uv');
      geoCache.set(key, plain);
      return plain;
    }
    // 단면은 네모 그대로(삼각형 28개): 앞뒤 둘레 여덟 모서리만 깎고, 깊이 방향 네 모서리는 둔다.
    // 굵은 부분(0.2m 넘음)만 단면 모서리도 깎는다(삼각형 60개).
    const iw = w / 2 - b;
    const ih = h / 2 - b;
    const c = Math.min(w, h) > 0.2 ? b * 0.6 : 0;
    const s = new THREE.Shape();
    if (c > 0) {
      s.moveTo(-iw + c, -ih);
      s.lineTo(iw - c, -ih);
      s.lineTo(iw, -ih + c);
      s.lineTo(iw, ih - c);
      s.lineTo(iw - c, ih);
      s.lineTo(-iw + c, ih);
      s.lineTo(-iw, ih - c);
      s.lineTo(-iw, -ih + c);
    } else {
      s.moveTo(-iw, -ih);
      s.lineTo(iw, -ih);
      s.lineTo(iw, ih);
      s.lineTo(-iw, ih);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -(d - 2 * b) / 2);
    const out = g.index ? g.toNonIndexed() : g;
    out.deleteAttribute('uv');
    out.computeVertexNormals();
    geoCache.set(key, out);
    return out;
  }

  function cylinder(rTop, rBottom, h, seg = 12) {
    const key = 'cyl' + [rTop, rBottom, h, seg].join(',');
    if (geoCache.has(key)) return geoCache.get(key);
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1).toNonIndexed();
    g.deleteAttribute('uv');
    geoCache.set(key, g);
    return g;
  }

  // ───────── 모으는 틀 ─────────
  function builder() {
    const parts = new Map();   // role → [{ geo, matrix, color, uv }]
    const instanced = new Map();   // role → { geo, items: [{ matrix, color }] }
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const E = new THREE.Euler();

    function matrixOf(p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
      E.set(r[0], r[1], r[2]);
      Q.setFromEuler(E);
      return new THREE.Matrix4().compose(new THREE.Vector3(...p), Q.clone(), new THREE.Vector3(...s));
    }

    // geo: 위치·법선이 있는 기하(색인 없음 권장). opts: p(자리), r(돌림), s(크기), color(부분 색), shade(곱할 밝기),
    //   ao(바닥 AO 세기 0~1, 기본 0.4), uv: 'box'(기본, 긴 축 따라) | 'keep'(기하의 uv를 그대로)
    function add(role, geo, opts = {}) {
      if (!parts.has(role)) parts.set(role, []);
      parts.get(role).push({ geo, matrix: opts.matrix ?? matrixOf(opts.p, opts.r, opts.s), color: opts.color ?? '#ffffff', shade: opts.shade ?? 1, ao: opts.ao ?? 0.4, uv: opts.uv ?? 'box', uvScale: opts.uvScale ?? 1 });
    }

    function box(role, w, h, d, opts = {}) {
      add(role, chamferBox(w, h, d, opts.bevel ?? Math.min(w, h, d) * 0.14), opts);
    }

    function instance(role, geo, opts) {
      if (!instanced.has(role)) instanced.set(role, { geo, items: [] });
      instanced.get(role).items.push({ matrix: opts.matrix ?? matrixOf(opts.p, opts.r, opts.s), color: opts.color ?? '#ffffff' });
    }

    function build(name = 'kit') {
      const group = new THREE.Group();
      group.name = name;
      const col = new THREE.Color();
      const v = new THREE.Vector3();
      const n = new THREE.Vector3();
      const nm = new THREE.Matrix3();
      for (const [role, list] of parts) {
        let count = 0;
        for (const it of list) count += it.geo.attributes.position.count;
        const pos = new Float32Array(count * 3);
        const nor = new Float32Array(count * 3);
        const uvs = new Float32Array(count * 2);
        const cols = new Float32Array(count * 3);
        const [tu, tv] = TEX_SIZE[role] ?? [1, 1];
        let o = 0;
        for (const it of list) {
          const P = it.geo.attributes.position;
          const N = it.geo.attributes.normal;
          const U = it.geo.attributes.uv;
          nm.getNormalMatrix(it.matrix);
          col.set(it.color);
          // 긴 축(무늬 결 방향): 부분의 실제 크기로 고른다
          if (!it.geo.boundingBox) it.geo.computeBoundingBox();
          const bb = it.geo.boundingBox;
          const sc = new THREE.Vector3();
          it.matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
          const size = [(bb.max.x - bb.min.x) * Math.abs(sc.x), (bb.max.y - bb.min.y) * Math.abs(sc.y), (bb.max.z - bb.min.z) * Math.abs(sc.z)];
          const long = size.indexOf(Math.max(...size));
          for (let i = 0; i < P.count; i++, o++) {
            v.fromBufferAttribute(P, i);
            n.fromBufferAttribute(N, i);
            // 무늬 좌표(지역 좌표 × 크기, m 단위)
            if (it.uv === 'keep' && U) {
              uvs[o * 2] = U.getX(i);
              uvs[o * 2 + 1] = U.getY(i);
            } else {
              const lx = v.x * sc.x;
              const ly = v.y * sc.y;
              const lz = v.z * sc.z;
              const ax = Math.abs(n.x) > Math.abs(n.y) ? (Math.abs(n.x) > Math.abs(n.z) ? 0 : 2) : Math.abs(n.y) > Math.abs(n.z) ? 1 : 2;
              let a;
              let b;
              let aAxis;
              if (ax === 0) { a = lz; b = ly; aAxis = 2; } else if (ax === 1) { a = lx; b = lz; aAxis = 0; } else { a = lx; b = ly; aAxis = 0; }
              const bAxis = ax === 0 ? 1 : ax === 1 ? 2 : 1;
              if (bAxis === long && aAxis !== long) [a, b] = [b, a];
              uvs[o * 2] = (a / tu) * it.uvScale + (it.matrix.elements[12] * 0.37) % 1;
              uvs[o * 2 + 1] = (b / tv) * it.uvScale + (it.matrix.elements[14] * 0.53) % 1;
            }
            v.applyMatrix4(it.matrix);
            n.applyMatrix3(nm).normalize();
            pos.set([v.x, v.y, v.z], o * 3);
            nor.set([n.x, n.y, n.z], o * 3);
            // 굽은 AO: 바닥 가까이 어둡게, 아랫면 어둡게
            const ground = 1 - it.ao * (1 - Math.min(1, Math.max(0, v.y / 0.9)) ** 1.5);
            const under = n.y < -0.5 ? 0.72 : 1;
            const k = it.shade * ground * under;
            cols.set([col.r * k, col.g * k, col.b * k], o * 3);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, materials.get(role));
        mesh.name = name + '-' + role;
        mesh.renderOrder = ORDER[role] ?? 0;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
      for (const [role, { geo, items }] of instanced) {
        const mesh = new THREE.InstancedMesh(geo, materials.get(role), items.length);
        items.forEach((it, i) => {
          mesh.setMatrixAt(i, it.matrix);
          mesh.setColorAt(i, col.set(it.color));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.name = name + '-' + role;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
      return group;
    }

    return { add, box, instance, build, matrixOf, parts, instanced };
  }

  // ───────── 소품 ─────────

  // 접지 그림자(바닥 위 둥근 번짐). w·d는 그림자 크기(m)
  function contactShadow(b, { x, z, w, d, y = 0.012, strength = 1 }) {
    const g = flatQuad();
    b.add('contact', g, { p: [x, y, z], s: [w, 1, d], color: '#ffffff', shade: strength, ao: 0, uv: 'keep' });
  }

  let quadGeo = null;
  function flatQuad() {
    if (!quadGeo) {
      quadGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).toNonIndexed();
    }
    return quadGeo;
  }

  // 세운 사각 카드(정면 +z). 무늬 칸 [u0, v0, u1, v1]을 줄 수 있다. 아래 가운데가 원점.
  function card(u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).toNonIndexed();
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return g;
  }

  // 한옥 뼈대: 기둥(주춧돌 위 둥근 기둥), 창방, 공포(주두 + 첨차 두 단), 장혀·도리, 서까래 끝.
  // posts: 기둥 x 목록. z: 벽 줄. height: 기둥 높이. 앞(+z)으로 서까래가 eave만큼 나간다.
  function hanokFrame(b, { posts, z, height = 3.6, eave = 1.35, paint = TOKENS.nokcheong, accent = TOKENS.juhong, rafterGap = 0.34 }) {
    const x0 = Math.min(...posts);
    const x1 = Math.max(...posts);
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    for (const x of posts) {
      // 주춧돌(덤벙주초처럼 조금 거친 팔각)
      b.add('stone', cylinder(0.27, 0.32, 0.22, 8), { p: [x, 0.11, z], ao: 0.5, shade: 0.95 });
      // 둥근 기둥: 위가 조금 가늘다(민흘림)
      b.add('wood', cylinder(0.155, 0.175, height - 0.22, 14), { p: [x, 0.22 + (height - 0.22) / 2, z], color: WOOD.pillar });
      // 주두(기둥머리 받침)
      b.box('paint', 0.42, 0.18, 0.42, { p: [x, height + 0.36, z], color: paint });
      b.box('paint', 0.34, 0.06, 0.34, { p: [x, height + 0.25, z], color: mixHex(paint, '#222222', 0.3) });
      // 첨차 두 단(벽 줄을 따라 좌우로 뻗는 팔): 끝을 깎은 모양은 짧은 상자 둘로
      b.box('paint', 1.1, 0.13, 0.22, { p: [x, height + 0.52, z], color: accent });
      b.box('paint', 0.18, 0.1, 0.24, { p: [x - 0.6, height + 0.5, z], color: mixHex(accent, '#222222', 0.25) });
      b.box('paint', 0.18, 0.1, 0.24, { p: [x + 0.6, height + 0.5, z], color: mixHex(accent, '#222222', 0.25) });
      b.box('paint', 1.6, 0.13, 0.22, { p: [x, height + 0.66, z], color: paint });
      // 쇠서(앞으로 내민 소 혀 모양 부재)
      b.box('paint', 0.16, 0.12, 0.62, { p: [x, height + 0.58, z + 0.32], r: [0.25, 0, 0], color: accent });
    }
    // 창방: 기둥머리를 잇는 큰 보. 아래 띠는 단청 머리초 대신 녹청 띠
    b.box('wood', len + 0.5, 0.28, 0.26, { p: [cx, height + 0.02, z], color: WOOD.beam });
    b.box('paint', len + 0.5, 0.06, 0.27, { p: [cx, height - 0.1, z], color: paint, ao: 0 });
    // 장혀와 도리
    b.box('wood', len + 0.9, 0.2, 0.24, { p: [cx, height + 0.82, z], color: WOOD.beam });
    b.add('wood', cylinder(0.14, 0.14, len + 1.2, 10), { p: [cx, height + 1.0, z], r: [0, 0, Math.PI / 2], color: WOOD.beam });
    // 서까래 끝: 도리에서 앞으로 비스듬히 내려가는 둥근 나무
    const n = Math.floor((len + 1.0) / rafterGap);
    const slope = 0.24;
    const rlen = Math.hypot(eave, eave * slope);
    for (let i = 0; i <= n; i++) {
      const x = x0 - 0.5 + i * rafterGap;
      b.add('wood', cylinder(0.055, 0.06, rlen, 5), { p: [x, height + 1.08 - eave * slope / 2, z + eave / 2], r: [Math.PI / 2 + Math.atan(slope), 0, 0], color: WOOD.rafter, ao: 0 });
      // 서까래 마구리(끝면): 단청 점
      b.box('paint', 0.1, 0.1, 0.02, { p: [x, height + 1.08 - eave * slope, z + eave + 0.01], r: [Math.atan(slope), 0, 0], color: paint, ao: 0 });
    }
    // 평고대(서까래 끝을 잇는 가는 띠)
    b.box('wood', len + 1.2, 0.08, 0.1, { p: [cx, height + 1.12 - eave * slope, z + eave - 0.02], color: WOOD.rafter, ao: 0 });
    return { top: height + 1.12, eaveY: height + 1.08 - eave * slope, eaveZ: z + eave };
  }

  // 기와 지붕: 앞(처마)에서 뒤(용마루)로 오르는 오목한 면. 양 끝은 들리고(앙곡) 앞으로 나온다(안허리).
  // 막새 줄과 용마루(끝 망와 포함)를 붙인다.
  function giwaRoof(b, { x0, x1, zFront, zBack, yFront, yBack, lift = 0.35, flare = 0.35, sag = 0.12, color = '#55524d', ridge = true, segX = null }) {
    const nx = segX ?? Math.max(8, Math.ceil((x1 - x0) / 0.6));
    const ns = 6;
    const pos = [];
    const uv = [];
    const idx = [];
    const L = x1 - x0;
    const D = Math.hypot(zBack - zFront, yBack - yFront);
    const pt = (t, s) => {
      const end = Math.max(0, (Math.min(t, 1 - t) * L < 2.2) ? 1 - Math.min(t, 1 - t) * L / 2.2 : 0) ** 2;
      const x = x0 + t * L;
      const z = zFront + (zBack - zFront) * s + flare * end * (1 - s);
      const y = yFront + (yBack - yFront) * s - sag * Math.sin(Math.PI * s) + lift * end * (1 - s) ** 1.5;
      return [x, y, z];
    };
    for (let j = 0; j <= ns; j++) {
      for (let i = 0; i <= nx; i++) {
        const t = i / nx;
        const s = j / ns;
        pos.push(...pt(t, s));
        uv.push((t * L) / TEX_SIZE.roof[0], (s * D) / TEX_SIZE.roof[1]);
      }
    }
    for (let j = 0; j < ns; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const bq = a + nx + 1;
        idx.push(a, a + 1, bq, a + 1, bq + 1, bq);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 감김 순서는 앞면(법선)이 위·앞을 보게 잡았다(카메라는 위에서 본다)
    const ng = g.toNonIndexed();
    b.add('roof', ng, { color, uv: 'keep', ao: 0 });
    // 막새(처마 끝 기와 마구리): 짧은 원기둥 줄
    const count = Math.floor(L / 0.3);
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const [x, y, z] = pt(t, 0);
      b.add('roof', cylinder(0.075, 0.075, 0.14, 6), { p: [x, y + 0.02, z + 0.02], r: [Math.PI / 2 - 0.35, 0, 0], color: mixHex(color, '#000000', 0.25), uv: 'box', ao: 0 });
    }
    if (ridge) {
      // 용마루: 층층이 쌓은 적새 + 위 수키와
      const [, ry, rz] = pt(0.5, 1);
      b.box('roof', L - 0.4, 0.28, 0.36, { p: [(x0 + x1) / 2, ry + 0.1, rz], color: mixHex(color, '#000000', 0.2), ao: 0 });
      b.box('roof', L - 0.2, 0.12, 0.28, { p: [(x0 + x1) / 2, ry + 0.3, rz], color: mixHex(color, '#ffffff', 0.08), ao: 0 });
      for (const ex of [x0 + 0.25, x1 - 0.25]) {
        b.box('roof', 0.34, 0.5, 0.42, { p: [ex, ry + 0.3, rz], r: [0, 0, ex < (x0 + x1) / 2 ? 0.25 : -0.25], color: mixHex(color, '#000000', 0.15), ao: 0 });
      }
    }
    return { front: pt(0.5, 0), back: pt(0.5, 1) };
  }

  // 창살 창(띠살·정자살): 틀, 살, 뒤의 창호지. 아래 가운데가 원점, 정면 +z
  function latticeWindow(b, { x, y, z, w = 1.4, h = 1.2, pattern = 'grid', cols = 6, rows = 5, frame = WOOD.dark }) {
    const t = 0.07;
    b.box('wood', w, t, 0.1, { p: [x, y + t / 2, z], color: frame });
    b.box('wood', w, t, 0.1, { p: [x, y + h - t / 2, z], color: frame });
    b.box('wood', t, h, 0.1, { p: [x - w / 2 + t / 2, y + h / 2, z], color: frame });
    b.box('wood', t, h, 0.1, { p: [x + w / 2 - t / 2, y + h / 2, z], color: frame });
    const bar = 0.024;
    const iw = w - 2 * t;
    const ih = h - 2 * t;
    for (let i = 1; i < cols; i++) b.box('wood', bar, ih, 0.04, { p: [x - iw / 2 + (iw * i) / cols, y + h / 2, z + 0.01], color: frame, bevel: 0.004, ao: 0 });
    if (pattern === 'grid') {
      for (let j = 1; j < rows; j++) b.box('wood', iw, bar, 0.04, { p: [x, y + t + (ih * j) / rows, z + 0.012], color: frame, bevel: 0.004, ao: 0 });
    } else {
      // 띠살: 위·가운데·아래에만 가로살 묶음
      for (const k of [0.12, 0.5, 0.88]) for (const d of [-0.03, 0, 0.03]) b.box('wood', iw, bar * 0.8, 0.04, { p: [x, y + t + ih * k + d, z + 0.012], color: frame, bevel: 0.004, ao: 0 });
    }
    b.box('paper', iw, ih, 0.01, { p: [x, y + h / 2, z - 0.025], color: '#fffaf0', ao: 0, bevel: 0.002 });
  }

  // 책장: 틀과 칸, 책등(인스턴스). 정면 +z, 아래 가운데가 (x, 0, z)
  let bookGeo = null;
  const BOOK_COLORS = ['#3b4a5e', '#6b3a32', '#8a7356', '#4d5a4a', '#c9b892', '#5b4d63', '#2f3640', '#a0522d', '#d8c7a3', '#556b6b'];
  function bookshelf(b, { x, z, width = 2.6, height = 2.4, depth = 0.42, levels = 5, seed = 1, fill = 0.85 }) {
    const rnd = seeded(seed * 977 + 13);
    const t = 0.06;
    b.box('wood', width, t * 1.4, depth, { p: [x, height - t * 0.7, z], color: WOOD.dark });
    b.box('wood', width + 0.08, 0.12, depth + 0.04, { p: [x, 0.06, z], color: WOOD.dark });
    b.box('wood', t, height, depth, { p: [x - width / 2 + t / 2, height / 2, z], color: WOOD.dark });
    b.box('wood', t, height, depth, { p: [x + width / 2 - t / 2, height / 2, z], color: WOOD.dark });
    b.box('wood', t, height, depth, { p: [x, height / 2, z], color: WOOD.dark, shade: 0.9 });
    b.box('wood', width, height, 0.03, { p: [x, height / 2, z - depth / 2 + 0.015], color: '#2c2420', ao: 0.2 });
    const lh = (height - 0.12 - t * 1.4) / levels;
    if (!bookGeo) bookGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let l = 0; l < levels; l++) {
      const y0 = 0.12 + l * lh;
      if (l > 0) b.box('wood', width - 0.02, 0.035, depth - 0.02, { p: [x, y0, z], color: WOOD.dark, ao: 0 });
      for (const side of [-1, 1]) {
        let bx = x + (side < 0 ? -width / 2 + t : t / 2) + 0.01;
        const end = bx + width / 2 - t * 1.5 - 0.02;
        while (bx < end) {
          if (rnd() > fill) { bx += 0.05 + rnd() * 0.12; continue; }
          const stack = rnd() < 0.08;
          const bc = BOOK_COLORS[(rnd() * BOOK_COLORS.length) | 0];
          const col = mixHex(bc, '#d9cfbd', rnd() * 0.25);
          if (stack) {
            // 눕혀 쌓은 책 몇 권
            const n = 2 + ((rnd() * 4) | 0);
            const bw = 0.22 + rnd() * 0.06;
            if (bx + bw > end) break;
            for (let k = 0; k < n; k++) {
              b.instance('books', bookGeo, { p: [bx + bw / 2, y0 + 0.02 + k * 0.035 + 0.0175, z + 0.02], r: [0, (rnd() - 0.5) * 0.15, 0], s: [bw, 0.032, depth * 0.75], color: mixHex(BOOK_COLORS[(rnd() * BOOK_COLORS.length) | 0], '#d9cfbd', 0.2) });
            }
            bx += bw + 0.02;
            continue;
          }
          const bw = 0.045 + rnd() * 0.045;
          const bh = Math.min(lh - 0.06, lh * (0.55 + rnd() * 0.35));
          const lean = rnd() < 0.06 ? 0.18 : 0;
          if (bx + bw > end) break;
          b.instance('books', bookGeo, { p: [bx + bw / 2 + lean * bh * 0.3, y0 + 0.02 + bh / 2, z + 0.02 + (rnd() - 0.5) * 0.03], r: [0, 0, -lean], s: [bw, bh, depth * (0.6 + rnd() * 0.2)], color: col });
          bx += bw + 0.002 + lean * bh * 0.6;
        }
      }
    }
    contactShadow(b, { x, z: z + 0.1, w: width + 0.5, d: depth + 0.6, strength: 0.9 });
  }

  // 돌 기단: 장대석 단(앞이 +z). x0~x1, 높이 h, 앞 z
  function stoneBase(b, { x0, x1, z, h = 0.3, depth = 0.5, color = '#9a958c' }) {
    b.box('stone', x1 - x0, h, depth, { p: [(x0 + x1) / 2, h / 2, z - depth / 2], color, ao: 0.5, bevel: 0.03 });
    b.box('stone', x1 - x0 + 0.06, 0.06, depth + 0.06, { p: [(x0 + x1) / 2, h + 0.03, z - depth / 2], color: mixHex(color, '#ffffff', 0.12), ao: 0, bevel: 0.015 });
  }

  // 청사초롱: 위는 청사, 아래는 홍사, 나무 뚜껑과 받침, 고리. (x, y, z)는 초롱 몸 가운데
  function lantern(b, glows, { x, y, z, scale = 1 }) {
    const s = scale;
    const blue = '#2d4f7c';
    const red = '#b8352a';
    b.add('lantern', cylinder(0.2 * s, 0.2 * s, 0.22 * s, 8), { p: [x, y + 0.11 * s, z], color: blue, ao: 0 });
    b.add('lantern', cylinder(0.2 * s, 0.2 * s, 0.24 * s, 8), { p: [x, y - 0.12 * s, z], color: red, ao: 0 });
    b.add('lantern', cylinder(0.16 * s, 0.2 * s, 0.05 * s, 8), { p: [x, y - 0.265 * s, z], color: blue, ao: 0 });
    b.add('wood', cylinder(0.12 * s, 0.22 * s, 0.07 * s, 8), { p: [x, y + 0.255 * s, z], color: WOOD.dark, ao: 0 });
    b.add('wood', cylinder(0.22 * s, 0.17 * s, 0.04 * s, 8), { p: [x, y - 0.31 * s, z], color: WOOD.dark, ao: 0 });
    b.add('wood', cylinder(0.012, 0.012, 0.5 * s, 4), { p: [x, y + 0.53 * s, z], color: WOOD.dark, ao: 0 });
    // 술(아래로 늘어진 붉은 실)
    b.add('lantern', cylinder(0.02 * s, 0.035 * s, 0.22 * s, 5), { p: [x, y - 0.44 * s, z], color: red, ao: 0 });
    if (glows) glows.push({ x, y, z: z + 0.25, size: 1.3 * s });
  }

  // 등불 번짐 카드(더하기 섞기). 카메라 쪽을 보는 평면들
  function glowCards(b, glows) {
    for (const g of glows) b.add('glow', card(), { p: [g.x, g.y - g.size / 2, g.z], s: [g.size, g.size, 1], uv: 'keep', ao: 0 });
  }

  // 종이 오린 나무: 정면을 보는 카드 세 겹(가운데 크고 뒤 둘은 조금 작고 어둡게). kind: 'pine' | 'blossom'
  function paperTree(b, { x, z, h = 4, kind = 'pine', seed = 1, facing = 0, layers: layerCount = 3 }) {
    const rnd = seeded(seed * 31 + 7);
    const cell = kind === 'pine' ? [0, 0, 0.5, 1] : [0.5, 0, 1, 1];
    const all = [
      { dz: -0.35, dx: (rnd() - 0.5) * 0.6, k: 0.82, shade: 0.72, flip: rnd() < 0.5 },
      { dz: -0.18, dx: (rnd() - 0.5) * 0.5, k: 0.9, shade: 0.85, flip: rnd() < 0.5 },
      { dz: 0, dx: 0, k: 1, shade: 1, flip: rnd() < 0.5 },
    ];
    // layers: 겹 수(1~3). 알파 자르기 카드는 겹칠수록 비싸다(SwiftShader에서 특히)
    const layers = all.slice(3 - Math.max(1, Math.min(3, layerCount)));
    for (const L of layers) {
      const hh = h * L.k;
      const c = L.flip ? card(cell[2], cell[1], cell[0], cell[3]) : card(...cell);
      b.add('foliage', c, { p: [x + L.dx, 0, z + L.dz], r: [0, facing, 0], s: [hh, hh, 1], uv: 'keep', shade: L.shade, ao: 0.25 });
    }
    contactShadow(b, { x, z, w: h * 0.45, d: h * 0.25, strength: 0.8 });
  }

  // 수묵 병풍 산: 무늬의 세 줄을 겹겹이 세운다. 먼 줄일수록 뒤에, 높이 크게. 가로로 길게 되풀이(무늬가 이어진다)
  function inkBackdrop(b, { x0, x1, z, height = 14, depthGap = 9, y = -0.5 }) {
    const L = x1 - x0;
    const rows = [
      { row: 0, dz: -2 * depthGap, h: height * 1.25, rep: L / 60, shade: 1.0 },
      { row: 1, dz: -depthGap, h: height, rep: L / 45, shade: 1.0 },
      { row: 2, dz: 0, h: height * 0.7, rep: L / 32, shade: 1.0 },
    ];
    for (const r of rows) {
      const v0 = 1 - (r.row + 1) / 3;
      const v1 = 1 - r.row / 3;
      const g = card(0, v0 + 0.002, r.rep, v1 - 0.002);
      b.add('backdrop', g, { p: [(x0 + x1) / 2, y, z + r.dz], s: [L, r.h, 1], uv: 'keep', shade: r.shade, ao: 0 });
    }
  }

  // 수묵 병풍: 접힌 폭(panels)이 지그재그로 선 큰 병풍. 폭마다 한지 바탕 + 먼 산·가까운 산 두 겹 + 나무 테.
  // 위에서 내려다보는 카메라에서도 보이는 '배경 막'이다. (x, z)는 병풍 아래 가운데, 정면 +z
  function inkScreen(b, { x, z, panels = 8, panelW = 2.2, height = 4.2, fold = 0.28, frame = WOOD.dark }) {
    const total = panels * panelW * Math.cos(fold);
    let px = x - total / 2;
    for (let i = 0; i < panels; i++) {
      const a = i % 2 ? fold : -fold;
      const w = panelW;
      const cx = px + (w * Math.cos(fold)) / 2;
      const cz = z + (i % 2 ? 0 : (w * Math.sin(fold)) / 2) - (i % 2 ? (w * Math.sin(fold)) / 2 : 0);
      const u0 = i / panels;
      const u1 = (i + 1) / panels;
      // 한지 바탕
      b.add('paper', card(), { p: [cx, 0.12, cz], r: [0, a, 0], s: [w - 0.08, height - 0.2, 1], color: '#f1e8d4', ao: 0, shade: 0.92 });
      // 먼 산(위), 가까운 산(아래)
      b.add('backdrop', card(u0 * 1.6, 2 / 3 + 0.004, u1 * 1.6, 1 - 0.004), { p: [cx + Math.sin(a) * 0.02, height * 0.32, cz + Math.cos(a) * 0.02], r: [0, a, 0], s: [w - 0.1, height * 0.6, 1], uv: 'keep', ao: 0 });
      b.add('backdrop', card(u0 * 1.2 + 0.3, 0.004, u1 * 1.2 + 0.3, 1 / 3 - 0.004), { p: [cx + Math.sin(a) * 0.04, 0.1, cz + Math.cos(a) * 0.04], r: [0, a, 0], s: [w - 0.1, height * 0.55, 1], uv: 'keep', ao: 0 });
      // 나무 테
      const M = b.matrixOf([cx, 0, cz], [0, a, 0]);
      for (const [dx, dy, sw, sh] of [[0, height - 0.05, w, 0.1], [0, 0.08, w, 0.16], [-w / 2 + 0.04, height / 2, 0.08, height], [w / 2 - 0.04, height / 2, 0.08, height]]) {
        const m = M.clone().multiply(new THREE.Matrix4().makeTranslation(dx, dy, 0.03));
        b.add('wood', chamferBox(sw, sh, 0.08, 0.015), { matrix: m, color: frame, ao: 0.3 });
      }
      px += w * Math.cos(fold);
    }
    contactShadow(b, { x, z: z + 0.3, w: total + 1, d: 1.6, strength: 1 });
  }

  return { builder, chamferBox, inkScreen, cylinder, card, flatQuad, contactShadow, hanokFrame, giwaRoof, latticeWindow, bookshelf, stoneBase, lantern, glowCards, paperTree, inkBackdrop, dispose() { for (const g of geoCache.values()) g.dispose(); geoCache.clear(); quadGeo?.dispose(); bookGeo?.dispose(); } };
}
