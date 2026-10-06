// 가사관·사설시조관 소품(T36). kit.js의 모으는 틀(builder)에 부분을 더하는 함수들이다.
// 꾸러미의 재질 역할 가운데 다섯(wood, paint, roof, stone, contact)만 쓴다. 소품을 아무리 많이 더해도 그리기 호출은
// 역할 수만큼이고, SwiftShader에서는 그리기 호출 하나마다 고정 비용(약 2ms)이 들어 역할 수를 일부러 줄였다.
// 회벽·창호지·초롱은 'paint'(한지 무늬, 먹 바닥 0)에 밝은 색으로, 마루는 'wood'로 그린다. kit.js의 함수는 고치지 않고 위에 얹는다.
//
//   const props = createT36Props(THREE, kit);
//   props.hipRoof(b, { x, z, y, w, d, h });        // 모임지붕(정자)
//   props.pavilion(b, { x, z });                   // 물가 정자
//   props.pond(b, { x, z, rx, rz });               // 연못(물빛은 단청 값을 따라 먹빛 → 옥빛)
//   props.thatch(b, { x, z, y, w, d, h });         // 초가 이엉(빵처럼 둥근 지붕과 새끼줄)
//   props.wallRun(b, { x0, z0, x1, z1, h });       // 돌 기단 + 회벽 + 기와 담장
//   props.cutout(b, { x, z, kind, color });        // 종이 오린 장터 사람(얇게 오린 종이 두 겹)
//   const g = props.unitBox(0.08)                  // 무늬 좌표가 있는 깎은 상자(InstancedMesh용, 1×1×1)
//
// 좌표는 1 = 1m, +y 위, 정면 +z. 모양은 씨앗이 있어서 늘 같다.
import { TOKENS, mixHex } from '../palette.js';
import { seeded } from './textures.js';
import { WOOD } from './kit.js';
import { LIGHT_PRESETS } from './lighting.js';
import { addInkHook } from './materials.js';

export const T36_COLORS = {
  paint: '#5d6f62',      // 뇌록(건축 단청, 가라앉은 녹색)
  accent: '#7d4a3c',     // 석간주
  water: '#7f9a98',      // 연못 물빛(먹빛에서는 회색)
  lotus: '#6f8a5a',
  straw: '#b39a6a',      // 이엉·짚
  mud: '#b8a07a',        // 흙벽
  onggi: '#5e3f2c',      // 옹기
  hill: '#8f9a86',       // 먼 둔덕(먹빛 초록)
  rock: '#8e8a82',
};

export function createT36Props(THREE, kit) {
  const cache = new Map();
  const UP = new THREE.Vector3(0, 1, 0);
  const V0 = new THREE.Vector3();
  const V1 = new THREE.Vector3();
  const Q = new THREE.Quaternion();

  function once(key, make) {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  }

  // 깎은 단위 상자에 상자 투영 무늬 좌표를 붙인다(InstancedMesh의 기하로 쓴다. kit.chamferBox는 uv를 지운다).
  function unitBox(bevel = 0.08) {
    return once('unitBox' + bevel, () => {
      const g = kit.chamferBox(1, 1, 1, bevel).clone();
      const P = g.attributes.position;
      const N = g.attributes.normal;
      const uv = new Float32Array(P.count * 2);
      for (let i = 0; i < P.count; i++) {
        const nx = Math.abs(N.getX(i));
        const ny = Math.abs(N.getY(i));
        const nz = Math.abs(N.getZ(i));
        let u;
        let v;
        if (nx >= ny && nx >= nz) { u = P.getZ(i); v = P.getY(i); } else if (ny >= nz) { u = P.getX(i); v = P.getZ(i); } else { u = P.getX(i); v = P.getY(i); }
        uv[i * 2] = u + 0.5;
        uv[i * 2 + 1] = v + 0.5;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      return g;
    });
  }

  // 두 점을 잇는 둥근 막대(서까래, 새끼줄, 용마루 선)
  function rod(b, role, p0, p1, r, color, seg = 5, opts = {}) {
    V0.set(...p0);
    V1.set(...p1);
    const len = V0.distanceTo(V1);
    if (len < 1e-4) return;
    const dir = V1.clone().sub(V0).normalize();
    Q.setFromUnitVectors(UP, dir);
    const mid = V0.clone().add(V1).multiplyScalar(0.5);
    const m = new THREE.Matrix4().compose(mid, Q.clone(), new THREE.Vector3(1, len, 1));
    b.add(role, kit.cylinder(r, r, 1, seg), { matrix: m, color, ao: opts.ao ?? 0, shade: opts.shade ?? 1 });
  }

  // 자리 + 방향(y축 돌림) + 기울임(그 방향의 긴 축을 따라)을 한 행렬로
  function orient(p, yaw = 0, tilt = 0, roll = 0) {
    const m = new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]);
    m.multiply(new THREE.Matrix4().makeRotationY(yaw));
    if (tilt) m.multiply(new THREE.Matrix4().makeRotationX(tilt));
    if (roll) m.multiply(new THREE.Matrix4().makeRotationZ(roll));
    return m;
  }

  // ───────── 지붕 ─────────

  // 모임지붕: 네 면이 꼭대기에서 만나고, 처마는 오목하게 처지며 네 귀가 들린다(앙곡·안허리).
  // (x, y, z)는 처마선 가운데 높이, w·d는 처마 끝 너비·깊이, h는 꼭대기까지 높이
  function hipRoof(b, { x, y, z, w, d, h, lift = 0.32, flare = 0.25, sag = 0.14, color = '#5a5650', ns = 5, nt = 8, finial = true }) {
    const apex = [x, y + h, z];
    const C = [[x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x + w / 2, z - d / 2], [x - w / 2, z - d / 2]];
    const pos = [];
    const uvs = [];
    const point = (A, B, t, s) => {
      const ex = A[0] + (B[0] - A[0]) * t;
      const ez = A[1] + (B[1] - A[1]) * t;
      let px = ex + (apex[0] - ex) * s;
      let pz = ez + (apex[2] - ez) * s;
      let py = y + (apex[1] - y) * s - sag * Math.sin(Math.PI * s) * (1 - s * 0.3);
      const c = (1 - Math.min(t, 1 - t) * 2) ** 2;
      const k = (1 - s) ** 2 * c;
      py += lift * k;
      const rx = px - x;
      const rz = pz - z;
      const rl = Math.hypot(rx, rz) || 1;
      px += (rx / rl) * flare * k;
      pz += (rz / rl) * flare * k;
      return [px, py, pz];
    };
    for (let f = 0; f < 4; f++) {
      const A = C[f];
      const B = C[(f + 1) % 4];
      const edge = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const slant = Math.hypot(h, (f % 2 ? w : d) / 2);
      const grid = [];
      for (let j = 0; j <= ns; j++) {
        const row = [];
        for (let i = 0; i <= nt; i++) {
          const t = i / nt;
          const s = j / ns;
          // 꼭대기로 갈수록 면이 좁아지므로 t를 가운데로 모은다
          row.push({ p: point(A, B, t, s), uv: [((t - 0.5) * (1 - s) * edge) / 2.4 + 0.5, (s * slant) / 1.4] });
        }
        grid.push(row);
      }
      for (let j = 0; j < ns; j++) {
        for (let i = 0; i < nt; i++) {
          const a = grid[j][i];
          const bq = grid[j][i + 1];
          const c = grid[j + 1][i];
          const dq = grid[j + 1][i + 1];
          // 바깥(위)을 보는 감김
          for (const v of [a, bq, dq, a, dq, c]) { pos.push(...v.p); uvs.push(...v.uv); }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    // 감김이 거꾸로면(법선이 아래) 뒤집는다
    if (g.attributes.normal.getY(0) < 0) {
      const p = g.attributes.position.array;
      const u = g.attributes.uv.array;
      for (let i = 0; i < p.length; i += 9) {
        for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
      }
      for (let i = 0; i < u.length; i += 6) {
        for (let k = 0; k < 2; k++) [u[i + 2 + k], u[i + 4 + k]] = [u[i + 4 + k], u[i + 2 + k]];
      }
      g.computeVertexNormals();
    }
    b.add('roof', g, { color, uv: 'keep', ao: 0 });
    // 추녀마루(네 귀에서 꼭대기로 오르는 선)와 막새
    for (let f = 0; f < 4; f++) {
      const A = C[f];
      const B = C[(f + 1) % 4];
      let prev = point(A, B, 0, 0);
      for (let j = 1; j <= ns; j++) {
        const cur = point(A, B, 0, j / ns);
        rod(b, 'roof', [prev[0], prev[1] + 0.06, prev[2]], [cur[0], cur[1] + 0.06, cur[2]], 0.07, mixHex(color, '#000000', 0.25), 6);
        prev = cur;
      }
      const count = Math.max(3, Math.round(Math.hypot(B[0] - A[0], B[1] - A[1]) / 0.32));
      for (let i = 1; i < count; i++) {
        const [px, py, pz] = point(A, B, i / count, 0);
        b.add('roof', kit.cylinder(0.06, 0.06, 0.1, 6), { p: [px, py + 0.01, pz], r: [f % 2 ? 0 : Math.PI / 2, 0, f % 2 ? Math.PI / 2 : 0], color: mixHex(color, '#000000', 0.3), ao: 0 });
      }
    }
    if (finial) {
      // 절병통(꼭대기 장식)
      b.add('roof', kit.cylinder(0.12, 0.18, 0.16, 8), { p: [apex[0], apex[1] + 0.02, apex[2]], color: mixHex(color, '#000000', 0.2), ao: 0 });
      b.add('roof', kit.cylinder(0.05, 0.12, 0.22, 8), { p: [apex[0], apex[1] + 0.2, apex[2]], color: mixHex(color, '#000000', 0.2), ao: 0 });
    }
    return { apex };
  }

  // 초가 이엉: 길쭉한 반구(빵 모양)와 그 위를 묶은 새끼줄. (x, y, z)는 처마 높이 가운데
  function thatch(b, { x, y, z, w, d, h, color = T36_COLORS.straw, ropes = 5, yaw = 0 }) {
    const dome = once('dome', () => {
      const g = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
      g.deleteAttribute('uv');
      return g;
    });
    const M = orient([x, y, z], yaw);
    b.add('wood', dome, { matrix: M.clone().multiply(new THREE.Matrix4().makeScale(w / 2, h, d / 2)), color, ao: 0, shade: 1.08 });
    // 처마 끝 두께(이엉 끝단)
    b.add('wood', kit.cylinder(1, 1, 1, 16), { matrix: M.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, -0.06, 0), new THREE.Quaternion(), new THREE.Vector3(w / 2 + 0.03, 0.14, d / 2 + 0.03))), color: mixHex(color, '#3a3020', 0.25), ao: 0 });
    // 새끼줄: 앞뒤로 넘어가는 줄 여럿
    const rope = mixHex(color, '#2b2b2b', 0.55);
    for (let k = 0; k < ropes; k++) {
      const fx = -0.8 + (1.6 * k) / Math.max(1, ropes - 1);
      let prev = null;
      for (let j = 0; j <= 6; j++) {
        const a = -Math.PI / 2 + (Math.PI * j) / 6;
        const lz = Math.sin(a);
        const r = Math.sqrt(Math.max(0, 1 - fx * fx));
        const lp = new THREE.Vector3(fx * (w / 2), Math.cos(a) * r * h + 0.02, lz * r * (d / 2)).applyMatrix4(M);
        if (prev) rod(b, 'wood', [prev.x, prev.y, prev.z], [lp.x, lp.y, lp.z], 0.018, rope, 4);
        prev = lp;
      }
    }
  }

  // 담장: 돌 기단 + 회벽 + 기와 지붕(용마루와 두 비탈). (x0,z0)→(x1,z1) 한 줄
  function wallRun(b, { x0, z0, x1, z1, h = 1.8, depth = 0.34, plaster = '#d9cfbb', stone = '#8f8a80', roof = '#7a766e' }) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.05) return;
    const yaw = -Math.atan2(z1 - z0, x1 - x0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const at = (y, tilt = 0, dz = 0) => {
      const m = orient([cx, y, cz], yaw, tilt);
      if (dz) m.multiply(new THREE.Matrix4().makeTranslation(0, 0, dz));
      return m;
    };
    const baseH = Math.min(0.55, h * 0.3);
    b.box('stone', L, baseH, depth + 0.1, { matrix: at(baseH / 2), color: stone, ao: 0.5, bevel: 0.04 });
    b.box('paint', L, h - baseH - 0.12, depth, { matrix: at(baseH + (h - baseH - 0.12) / 2), color: plaster, ao: 0.15, bevel: 0.03 });
    // 기와 비탈 둘과 용마루
    for (const s of [-1, 1]) b.box('roof', L + 0.08, 0.06, depth * 0.62 + 0.08, { matrix: at(h - 0.03, s * 0.45, s * 0.15), color: roof, ao: 0 });
    b.box('roof', L + 0.12, 0.09, 0.13, { matrix: at(h + 0.05), color: mixHex(roof, '#000000', 0.2), ao: 0 });
  }

  // ───────── 땅과 물 ─────────

  // 깎은 바위(이십면체를 흔든 것). seed마다 모양이 다르다
  function rockGeo(seed) {
    return once('rock' + (seed % 6), () => {
      const g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
      const rnd = seeded(seed * 17 + 3);
      const P = g.attributes.position;
      const jitter = new Map();
      for (let i = 0; i < P.count; i++) {
        const k = [P.getX(i), P.getY(i), P.getZ(i)].map((v) => v.toFixed(3)).join(',');
        if (!jitter.has(k)) jitter.set(k, 0.75 + rnd() * 0.4);
        const s = jitter.get(k);
        P.setXYZ(i, P.getX(i) * s, Math.max(-0.2, P.getY(i)) * s, P.getZ(i) * s);
      }
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      return g;
    });
  }

  function rock(b, { x, y = 0, z, s = 0.4, sy = 0.6, seed = 1, color = T36_COLORS.rock, yaw = 0 }) {
    b.add('stone', rockGeo(seed), { p: [x, y + s * sy * 0.15, z], r: [0, yaw, 0], s: [s, s * sy, s * (0.8 + (seed % 3) * 0.12)], color, ao: 0.45 });
  }

  // 먼 둔덕: 낮은 반구를 흔든 것(먹빛 초록, 단청이 돌아오면 봄빛)
  function hill(b, { x, z, w, h, d, seed = 1, color = T36_COLORS.hill }) {
    const g = once('hill' + seed, () => {
      const geo = new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      const rnd = seeded(seed * 29 + 5);
      const P = geo.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const y = P.getY(i);
        const k = 1 + (rnd() - 0.5) * 0.25 * (1 - y);
        P.setXYZ(i, P.getX(i) * k, y * (0.85 + rnd() * 0.3), P.getZ(i) * k);
      }
      const out = geo.toNonIndexed();
      out.deleteAttribute('uv');
      out.computeVertexNormals();
      return out;
    });
    b.add('paint', g, { p: [x, -0.02, z], s: [w / 2, h, d / 2], color, ao: 0.2 });
  }

  // 연못: 고르지 않은 둥근 물면, 둘레 돌, 물결 줄, 연잎
  function pond(b, { x, z, rx, rz, seed = 3, color = T36_COLORS.water, lotus = 5, rim = true }) {
    const rnd = seeded(seed * 13 + 1);
    const N = 26;
    const radius = [];
    for (let i = 0; i < N; i++) radius.push(0.88 + rnd() * 0.2);
    const pt = (i, k = 1) => {
      const a = (i / N) * Math.PI * 2;
      const r = radius[i % N] * k;
      return [x + Math.cos(a) * rx * r, z + Math.sin(a) * rz * r];
    };
    const pos = [];
    const uv = [];
    for (let i = 0; i < N; i++) {
      const [ax, az] = pt(i);
      const [bx, bz] = pt(i + 1);
      pos.push(x, 0.03, z, bx, 0.03, bz, ax, 0.03, az);
      uv.push(0.5, 0.5, 0.5 + (bx - x) / (rx * 2), 0.5 + (bz - z) / (rz * 2), 0.5 + (ax - x) / (rx * 2), 0.5 + (az - z) / (rz * 2));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) {
      // 위를 보게 감김을 뒤집는다
      const p = g.attributes.position.array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
      g.computeVertexNormals();
    }
    b.add('paint', g, { color, uv: 'keep', ao: 0 });
    // 물가 그늘(물면보다 조금 큰 먹빛 테)
    kit.contactShadow(b, { x, z, w: rx * 2.5, d: rz * 2.6, strength: 0.7 });
    // 물결: 가는 밝은 줄
    for (let k = 0; k < 6; k++) {
      const wx = x + (rnd() - 0.5) * rx * 1.1;
      const wz = z + (rnd() - 0.5) * rz * 1.0;
      b.box('paint', 0.5 + rnd() * 0.6, 0.012, 0.035, { p: [wx, 0.045, wz], r: [0, (rnd() - 0.5) * 0.4, 0], color: '#f4efe2', ao: 0, bevel: 0.004 });
    }
    // 연잎
    for (let k = 0; k < lotus; k++) {
      const lx = x + (rnd() - 0.5) * rx * 1.2;
      const lz = z + (rnd() - 0.5) * rz * 1.1;
      b.add('paint', kit.cylinder(0.2, 0.2, 0.02, 9), { p: [lx, 0.05, lz], s: [0.8 + rnd() * 0.6, 1, 0.8 + rnd() * 0.5], color: T36_COLORS.lotus, ao: 0 });
    }
    if (rim) {
      for (let i = 0; i < N; i += 2) {
        const [px, pz] = pt(i, 1.08);
        rock(b, { x: px, z: pz, s: 0.18 + rnd() * 0.16, sy: 0.55, seed: i + seed, yaw: rnd() * 3 });
      }
    }
  }

  // 디딤돌 하나(납작하고 고르지 않은 돌). y는 윗면 높이
  function flatStone(b, { x, z, y = 0.06, s = 0.5, seed = 1, color = '#a29d92' }) {
    const g = once('flat' + (seed % 5), () => makeSteppingStoneGeo(THREE, seed));
    b.add('stone', g, { p: [x, y - 0.06, z], r: [0, seed * 1.3, 0], s: [s, 1, s * 0.8], color, ao: 0.3 });
  }

  // ───────── 건물 ─────────

  // 물가 정자: 돌 기단, 마루, 둥근 기둥 넷, 계자 난간, 창방 단청, 모임지붕
  function pavilion(b, { x, z, size = 2.4, height = 2.3, base = 0.45, paint = T36_COLORS.paint, accent = T36_COLORS.accent, roofColor = '#55524d', lantern = true, ground = 0 }) {
    const half = size / 2;
    // 기단(두 단)
    b.box('stone', size + 0.9, base * 0.55, size + 0.9, { p: [x, ground + base * 0.275, z], color: '#8f8a80', ao: 0.5, bevel: 0.04 });
    b.box('stone', size + 0.5, base * 0.45, size + 0.5, { p: [x, ground + base * 0.55 + base * 0.225, z], color: '#9a958c', ao: 0.2, bevel: 0.03 });
    b.box('wood', size + 0.2, 0.1, size + 0.2, { p: [x, ground + base + 0.05, z], color: WOOD.light, ao: 0 });
    const y0 = ground + base + 0.1;
    const px = [x - half, x + half];
    const pz = [z - half, z + half];
    for (const ax of px) {
      for (const az of pz) {
        b.add('wood', kit.cylinder(0.11, 0.13, height, 12), { p: [ax, y0 + height / 2, az], color: WOOD.pillar });
        b.box('paint', 0.3, 0.14, 0.3, { p: [ax, y0 + height + 0.07, az], color: paint });
      }
    }
    // 창방(네 변)과 단청 띠
    for (const az of pz) {
      b.box('wood', size + 0.3, 0.2, 0.18, { p: [x, y0 + height - 0.1, az], color: WOOD.beam });
      b.box('paint', size + 0.3, 0.06, 0.19, { p: [x, y0 + height - 0.24, az], color: accent, ao: 0 });
    }
    for (const ax of px) {
      b.box('wood', 0.18, 0.2, size + 0.3, { p: [ax, y0 + height - 0.1, z], color: WOOD.beam });
      b.box('paint', 0.19, 0.06, size + 0.3, { p: [ax, y0 + height - 0.24, z], color: accent, ao: 0 });
    }
    // 계자 난간(앞을 뺀 세 변은 막고, 앞 가운데는 오르는 자리)
    const rail = (ax0, az0, ax1, az1) => {
      const len = Math.hypot(ax1 - ax0, az1 - az0);
      const yaw = -Math.atan2(az1 - az0, ax1 - ax0);
      const cx = (ax0 + ax1) / 2;
      const cz = (az0 + az1) / 2;
      b.box('wood', len, 0.05, 0.07, { matrix: orient([cx, y0 + 0.55, cz], yaw), color: WOOD.dark, ao: 0 });
      b.box('wood', len, 0.04, 0.05, { matrix: orient([cx, y0 + 0.18, cz], yaw), color: WOOD.dark, ao: 0 });
      const n = Math.max(2, Math.round(len / 0.32));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        b.box('wood', 0.03, 0.36, 0.03, { p: [ax0 + (ax1 - ax0) * t, y0 + 0.37, az0 + (az1 - az0) * t], color: WOOD.dark, ao: 0, bevel: 0.006 });
      }
    };
    rail(px[0], pz[0], px[1], pz[0]);
    rail(px[0], pz[0], px[0], pz[1]);
    rail(px[1], pz[0], px[1], pz[1]);
    rail(px[0], pz[1], x - 0.4, pz[1]);
    rail(x + 0.4, pz[1], px[1], pz[1]);
    // 지붕
    hipRoof(b, { x, y: y0 + height + 0.32, z, w: size + 1.5, d: size + 1.5, h: 1.05, color: roofColor });
    if (lantern) paperLantern(b, { x: x + half - 0.25, y: y0 + height - 0.55, z: z + half, scale: 0.55 });
    if (!ground) kit.contactShadow(b, { x, z: z + 0.2, w: size + 2.2, d: size + 2, strength: 0.8 });
  }

  // 옹기 항아리(돌림판 모양). (x, y, z)는 바닥 가운데
  function jar(b, { x, y = 0, z, h = 0.5, r = 0.22, color = T36_COLORS.onggi }) {
    const g = once('jar', () => {
      const prof = [[0.0, 0], [0.62, 0], [0.82, 0.12], [1.0, 0.45], [0.95, 0.72], [0.7, 0.9], [0.62, 0.96], [0.66, 1.0], [0.0, 1.0]].map(([px, py]) => new THREE.Vector2(px, py));
      const geo = new THREE.LatheGeometry(prof, 10).toNonIndexed();
      geo.deleteAttribute('uv');
      geo.computeVertexNormals();
      return geo;
    });
    b.add('stone', g, { p: [x, y, z], s: [r, h, r], color, ao: 0.35, shade: 1.1 });
  }

  // 종이 오린 사람(장터 사람들). 색 겹과 그보다 조금 큰 한지 테두리 겹 둘. facing은 y축 돌림
  // kind: 'yangban'(갓, 긴 도포, 부채), 'jige'(지게 진 장사꾼), 'woman'(머리에 광주리), 'child'
  function cutout(b, { x, z, kind = 'jige', color = '#4a5a72', skin = '#e8d9bf', facing = 0, scale = 1 }) {
    const shapes = personShapes(kind);
    const depth = 0.025;
    const M = orient([x, 0, z], facing);
    M.multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    for (const { key, shape, part } of shapes) {
      const g = once('cut' + kind + key, () => {
        const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 }).toNonIndexed();
        geo.deleteAttribute('uv');
        geo.computeVertexNormals();
        return geo;
      });
      const c = part === 'skin' ? skin : part === 'hat' ? TOKENS.meok : part === 'load' ? T36_COLORS.straw : part === 'white' ? '#ece4d2' : part === 'skirt' ? '#9a4f3f' : color;
      // 한지 테두리: 조금 크게, 조금 뒤에
      b.add('paint', g, { matrix: M.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, -0.03, -0.03), new THREE.Quaternion(), new THREE.Vector3(1.07, 1.04, 1))), color: '#f6f0e2', ao: 0 });
      b.add('paint', g, { matrix: M.clone(), color: c, ao: 0.1 });
    }
    kit.contactShadow(b, { x, z, w: 0.9 * scale, d: 0.5 * scale, strength: 0.8 });
  }

  // 사람 오린 모양(높이 약 1.6m, 발이 y=0). 부분마다 모양 하나
  function personShapes(kind) {
    return once('shapes' + kind, () => {
      const S = (pts) => { const s = new THREE.Shape(); pts.forEach(([px, py], i) => (i ? s.lineTo(px, py) : s.moveTo(px, py))); s.closePath(); return s; };
      const circle = (cx, cy, r) => { const s = new THREE.Shape(); s.absarc(cx, cy, r, 0, Math.PI * 2, false); return s; };
      const out = [];
      if (kind === 'child') {
        out.push({ key: 'body', part: 'body', shape: S([[-0.2, 0], [0.2, 0], [0.16, 0.7], [0.1, 0.82], [-0.1, 0.82], [-0.16, 0.7]]) });
        out.push({ key: 'head', part: 'skin', shape: circle(0, 0.95, 0.13) });
        out.push({ key: 'hair', part: 'hat', shape: S([[-0.04, 1.05], [0.04, 1.05], [0.02, 1.16], [-0.02, 1.16]]) });
        return out;
      }
      if (kind === 'woman') {
        out.push({ key: 'skirt', part: 'skirt', shape: S([[-0.36, 0], [0.36, 0], [0.2, 0.78], [-0.2, 0.78]]) });
        out.push({ key: 'top', part: 'white', shape: S([[-0.2, 0.76], [0.2, 0.76], [0.17, 1.12], [-0.17, 1.12]]) });
        out.push({ key: 'head', part: 'skin', shape: circle(0, 1.27, 0.14) });
        out.push({ key: 'basket', part: 'load', shape: S([[-0.32, 1.4], [0.32, 1.4], [0.26, 1.62], [-0.26, 1.62]]) });
        out.push({ key: 'arm', part: 'white', shape: S([[0.15, 1.08], [0.24, 1.1], [0.3, 1.42], [0.24, 1.43]]) });
        return out;
      }
      if (kind === 'yangban') {
        // 뒤로 젖힌 거드름: 몸을 조금 기울이고 부채를 든다
        out.push({ key: 'robe', part: 'white', shape: S([[-0.32, 0], [0.34, 0], [0.24, 1.1], [-0.18, 1.14]]) });
        out.push({ key: 'sash', part: 'body', shape: S([[-0.2, 0.86], [0.26, 0.84], [0.26, 0.9], [-0.2, 0.92]]) });
        out.push({ key: 'head', part: 'skin', shape: circle(0.02, 1.3, 0.14) });
        out.push({ key: 'brim', part: 'hat', shape: S([[-0.34, 1.42], [0.38, 1.47], [0.38, 1.5], [-0.34, 1.45]]) });
        out.push({ key: 'crown', part: 'hat', shape: S([[-0.1, 1.44], [0.14, 1.46], [0.12, 1.66], [-0.08, 1.64]]) });
        out.push({ key: 'fan', part: 'load', shape: S([[0.3, 1.0], [0.62, 1.32], [0.52, 1.42], [0.34, 1.06]]) });
        return out;
      }
      // 지게 진 장사꾼: 지게 다리와 짐
      out.push({ key: 'body', part: 'body', shape: S([[-0.22, 0], [0.22, 0], [0.2, 1.08], [-0.2, 1.08]]) });
      out.push({ key: 'head', part: 'skin', shape: circle(0, 1.24, 0.14) });
      out.push({ key: 'band', part: 'white', shape: S([[-0.14, 1.3], [0.14, 1.3], [0.14, 1.36], [-0.14, 1.36]]) });
      out.push({ key: 'jige', part: 'load', shape: S([[-0.38, 0.1], [-0.3, 0.1], [-0.2, 1.5], [-0.28, 1.5]]) });
      out.push({ key: 'load', part: 'load', shape: S([[-0.62, 0.9], [-0.18, 0.9], [-0.16, 1.62], [-0.58, 1.66]]) });
      return out;
    });
  }

  // 장터 좌판: 기둥 넷, 짚 깔개 상, 물건(항아리, 꾸러미). 차양 천은 부르는 쪽이 따로 그린다
  function stall(b, { x, z, h = 1.8, w = 1.6, d = 1.0, goods = ['jar', 'bundle', 'jar'], seed = 1 }) {
    const rnd = seeded(seed * 7 + 11);
    for (const dx of [-w / 2 + 0.06, w / 2 - 0.06]) {
      for (const dz of [-d / 2 + 0.06, d / 2 - 0.06]) b.box('wood', 0.09, h, 0.09, { p: [x + dx, h / 2, z + dz], color: WOOD.pillar });
    }
    b.box('wood', w, 0.08, d, { p: [x, 0.62, z], color: WOOD.light });
    b.box('wood', w - 0.1, 0.5, 0.04, { p: [x, 0.33, z + d / 2 - 0.05], color: WOOD.beam, ao: 0.3 });
    b.box('wood', w - 0.12, 0.03, d - 0.12, { p: [x, 0.675, z], color: T36_COLORS.straw, ao: 0, bevel: 0.006 });
    goods.forEach((kind, i) => {
      const gx = x - w / 2 + 0.3 + (i * (w - 0.6)) / Math.max(1, goods.length - 1);
      const gz = z + (rnd() - 0.5) * 0.2;
      if (kind === 'jar') jar(b, { x: gx, y: 0.69, z: gz, h: 0.32 + rnd() * 0.12, r: 0.14 + rnd() * 0.04 });
      else if (kind === 'bundle') b.box('wood', 0.3, 0.18, 0.24, { p: [gx, 0.79, gz], color: T36_COLORS.straw, ao: 0, r: [0, rnd(), 0] });
      else if (kind === 'fish') for (let k = 0; k < 3; k++) b.box('paint', 0.36, 0.05, 0.1, { p: [gx, 0.72 + k * 0.05, gz + (k - 1) * 0.12], r: [0, 0.3 * (k - 1), 0], color: '#8d9aa0', ao: 0 });
      else if (kind === 'shoes') for (let k = 0; k < 2; k++) b.box('wood', 0.12, 0.06, 0.28, { p: [gx + (k - 0.5) * 0.15, 0.72, gz], color: T36_COLORS.straw, ao: 0 });
      else if (kind === 'yeot') for (let k = 0; k < 4; k++) b.add('wood', kit.cylinder(0.025, 0.025, 0.42, 5), { p: [gx + (k - 1.5) * 0.07, 0.73, gz], r: [Math.PI / 2, 0.2 * (k - 1.5), 0], color: '#c79a52', ao: 0 });
    });
    kit.contactShadow(b, { x, z, w: w + 0.6, d: d + 0.6, strength: 0.85 });
  }

  // 등줄: 처진 새끼줄에 작은 종이 초롱을 단다
  function lanternString(b, { from, to, sag = 0.5, count = 4, scale = 0.45 }) {
    const P = (t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t - sag * Math.sin(Math.PI * t), from[2] + (to[2] - from[2]) * t];
    const N = 8;
    for (let i = 0; i < N; i++) rod(b, 'wood', P(i / N), P((i + 1) / N), 0.012, WOOD.dark, 4);
    for (let k = 1; k <= count; k++) {
      const [lx, ly, lz] = P(k / (count + 1));
      paperLantern(b, { x: lx, y: ly - 0.42 * scale - 0.12, z: lz, scale, red: k % 2 === 0 });
    }
  }

  // 종이 초롱(청사초롱 꼴): 'paint' 역할에 밝은 비단 색으로. (x, y, z)는 초롱 몸 가운데
  function paperLantern(b, { x, y, z, scale = 1, red = false }) {
    const s = scale;
    const top = red ? '#b8552f' : '#3d5f86';
    const bottom = red ? '#e8c27a' : '#c2533a';
    b.add('paint', kit.cylinder(0.2 * s, 0.2 * s, 0.22 * s, 8), { p: [x, y + 0.11 * s, z], color: top, ao: 0, shade: 1.15 });
    b.add('paint', kit.cylinder(0.2 * s, 0.17 * s, 0.24 * s, 8), { p: [x, y - 0.12 * s, z], color: bottom, ao: 0, shade: 1.25 });
    b.add('wood', kit.cylinder(0.12 * s, 0.22 * s, 0.07 * s, 8), { p: [x, y + 0.255 * s, z], color: WOOD.dark, ao: 0 });
    b.add('wood', kit.cylinder(0.012, 0.012, 0.4 * s, 4), { p: [x, y + 0.48 * s, z], color: WOOD.dark, ao: 0 });
    b.add('paint', kit.cylinder(0.02 * s, 0.035 * s, 0.2 * s, 5), { p: [x, y - 0.34 * s, z], color: '#a8432e', ao: 0 });
  }

  // 창살 문(띠살): 나무 틀과 살, 뒤의 창호지('paint'에 한지색). 아래 가운데가 (x, y, z), 정면 +z
  function lattice(b, { x, y, z, w = 1.2, h = 1.8, cols = 5, frame = WOOD.dark, yaw = 0 }) {
    const M = orient([x, y, z], yaw);
    const at = (dx, dy, dz) => M.clone().multiply(new THREE.Matrix4().makeTranslation(dx, dy, dz));
    const t = 0.07;
    b.box('paint', w - 2 * t, h - 2 * t, 0.01, { matrix: at(0, h / 2, -0.02), color: '#f1e9d6', ao: 0, bevel: 0.002 });
    b.box('wood', w, t, 0.09, { matrix: at(0, t / 2, 0), color: frame });
    b.box('wood', w, t, 0.09, { matrix: at(0, h - t / 2, 0), color: frame });
    b.box('wood', t, h, 0.09, { matrix: at(-w / 2 + t / 2, h / 2, 0), color: frame });
    b.box('wood', t, h, 0.09, { matrix: at(w / 2 - t / 2, h / 2, 0), color: frame });
    const iw = w - 2 * t;
    const ih = h - 2 * t;
    for (let i = 1; i < cols; i++) b.box('wood', 0.022, ih, 0.03, { matrix: at(-iw / 2 + (iw * i) / cols, h / 2, 0.01), color: frame, ao: 0, bevel: 0.004 });
    for (const k of [0.14, 0.5, 0.86]) for (const d of [-0.03, 0.03]) b.box('wood', iw, 0.02, 0.03, { matrix: at(0, t + ih * k + d, 0.012), color: frame, ao: 0, bevel: 0.004 });
  }

  // 종이 소나무(민화 솔): 굽은 줄기와 납작한 구름 같은 솔잎 덩이 여럿('paint' 역할이라 먹빛 → 초록)
  function pine(b, { x, z, h = 3.2, seed = 1, lean = 0.25, color = '#4f6b4c' }) {
    const rnd = seeded(seed * 53 + 7);
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      pts.push([x + Math.sin(t * 2.4 + seed) * lean * t * h * 0.3 + lean * t * h * 0.15, t * h * 0.85, z + Math.cos(t * 1.7) * 0.05]);
    }
    for (let i = 0; i < 4; i++) rod(b, 'wood', pts[i], pts[i + 1], 0.13 - i * 0.025, '#5a4636', 6, { ao: 0.3 });
    const disc = once('pineDisc', () => {
      const g = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      return g;
    });
    const n = 4 + ((rnd() * 2) | 0);
    for (let k = 0; k < n; k++) {
      const t = 0.45 + (k / (n - 1)) * 0.55;
      const [px, py, pz] = pts[Math.min(4, Math.round(t * 4))];
      const side = k % 2 ? 1 : -1;
      const r = (0.9 - t * 0.4) * h * 0.32;
      b.add('paint', disc, { p: [px + side * r * 0.45 * (k < n - 1 ? 1 : 0), py + (t - 0.8) * 0.3, pz + (rnd() - 0.5) * 0.2], s: [r, r * 0.32, r * 0.7], color: mixHex(color, '#2b2b2b', k % 2 ? 0.15 : 0), ao: 0 });
    }
    kit.contactShadow(b, { x: x + lean * h * 0.1, z, w: h * 0.5, d: h * 0.3, strength: 0.7 });
  }

  // 꽃나무(봄의 매화·도화): 굽은 가지와 둥근 꽃 덩이
  function blossom(b, { x, z, h = 2.6, seed = 2, color = '#e3b5a8' }) {
    const rnd = seeded(seed * 61 + 3);
    const base = [x, 0, z];
    const top = [x + (rnd() - 0.5) * 0.4, h * 0.55, z];
    rod(b, 'wood', base, top, 0.1, '#5a4636', 6, { ao: 0.3 });
    const blob = once('blob', () => {
      const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      return g;
    });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rnd();
      const r = h * 0.28;
      const end = [top[0] + Math.cos(a) * r, top[1] + 0.25 + rnd() * h * 0.25, top[2] + Math.sin(a) * r * 0.5];
      rod(b, 'wood', top, end, 0.045, '#5a4636', 5);
      const s = h * (0.17 + rnd() * 0.08);
      b.add('paint', blob, { p: end, s: [s, s * 0.8, s], color: mixHex(color, '#ffffff', rnd() * 0.3), ao: 0 });
    }
    kit.contactShadow(b, { x, z, w: h * 0.6, d: h * 0.35, strength: 0.7 });
  }

  function dispose() {
    for (const g of cache.values()) {
      if (g?.isBufferGeometry) g.dispose();
    }
    cache.clear();
  }

  return { unitBox, rod, orient, hipRoof, thatch, wallRun, rock, hill, pond, flatStone, pavilion, jar, cutout, stall, lanternString, paperLantern, lattice, pine, blossom, dispose };
}

// 디딤돌 기하(납작하고 가장자리가 고르지 않은 원기둥, 윗면이 조금 볼록). 바닥이 y=0, 윗면 약 0.12, 지름 1
export function makeSteppingStoneGeo(THREE, seed = 1) {
  const g = new THREE.CylinderGeometry(0.5, 0.54, 0.12, 11, 1);
  const rnd = seeded(seed * 41 + 9);
  const P = g.attributes.position;
  const rim = [];
  for (let i = 0; i < 12; i++) rim.push(0.86 + rnd() * 0.22);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    const z = P.getZ(i);
    const y = P.getY(i);
    const a = Math.atan2(z, x);
    const k = rim[Math.round(((a + Math.PI) / (Math.PI * 2)) * 11) % 12];
    const r = Math.hypot(x, z);
    P.setXYZ(i, x * k, y + 0.06 + (y > 0 ? 0.025 * (1 - r * 2) : 0), z * k);
  }
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  g.dispose();
  return out;
}

// ───────── 구운 빛(baked lighting) ─────────
// SwiftShader에서는 빛 계산 재질(Lambert)이 화면을 넓게 덮을수록 프레임을 크게 먹는다(빛 셋 × 픽셀).
// 관 안의 빛(lighting.js의 'wing' 묶음: 반구광 + 주광 + 보조광)은 방향이 바뀌지 않으므로,
// 꼭짓점마다 그 빛을 미리 계산해 꼭짓점 색에 곱해 두고 빛 없는 재질(MeshBasic)로 그린다. 보이는 색은 Lambert와 거의 같고
// 픽셀 비용은 절반쯤이다. 먹빛 → 단청 걸이는 꾸러미 재질과 같은 uniform을 본다.
const RIG = { sky: 0xfff4e0, ground: 0x5a4e42, key: 0xfff0d8, fill: 0xc8d4e0 };

// 법선 하나에 대한 빛의 세기(선형 RGB, Lambert의 확산 반사와 같은 식: 빛 / π)
export function createLightBaker(THREE, preset = 'wing') {
  const p = LIGHT_PRESETS[preset] ?? LIGHT_PRESETS.wing;
  const sky = new THREE.Color(RIG.sky);
  const ground = new THREE.Color(RIG.ground);
  const key = new THREE.Color(RIG.key).multiplyScalar(p.key);
  const fill = new THREE.Color(RIG.fill).multiplyScalar(p.fill);
  const kd = new THREE.Vector3(...p.keyDir).normalize();
  const fd = new THREE.Vector3(...p.fillDir).normalize();
  const out = new THREE.Color();
  const tmp = new THREE.Color();
  function at(nx, ny, nz) {
    const w = 0.5 * ny + 0.5;
    out.copy(ground).lerp(sky, w).multiplyScalar(p.hemi);
    const dk = Math.max(0, nx * kd.x + ny * kd.y + nz * kd.z);
    const df = Math.max(0, nx * fd.x + ny * fd.y + nz * fd.z);
    out.add(tmp.copy(key).multiplyScalar(dk)).add(tmp.copy(fill).multiplyScalar(df));
    return out.multiplyScalar(1 / Math.PI);
  }
  // 기하의 꼭짓점 색에 빛을 곱한다(색이 없으면 흰색에서 시작). 같은 기하를 두 번 굽지 않는다.
  function bake(geo) {
    if (geo.userData.baked) return geo;
    const N = geo.attributes.normal;
    const n = geo.attributes.position.count;
    let C = geo.attributes.color;
    if (!C) {
      C = new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3);
      geo.setAttribute('color', C);
    }
    for (let i = 0; i < n; i++) {
      const c = at(N.getX(i), N.getY(i), N.getZ(i));
      C.setXYZ(i, C.getX(i) * c.r, C.getY(i) * c.g, C.getZ(i) * c.b);
    }
    C.needsUpdate = true;
    geo.userData.baked = true;
    return geo;
  }
  return { at, bake };
}

// 구운 빛 재질: 빛 없는 MeshBasic + 무늬 + 꼭짓점 색 + 먹빛 걸이(먹 바닥은 materials.js와 같다)
const BAKED_ROLES = { wood: ['wood', 0.55], paint: ['hanji', 0], roof: ['roof', 0.8], stone: ['stone', 0.75], floor: ['planks', 0.6] };

export function createBakedMaterials(THREE, textures, materials) {
  const made = new Map();
  function get(role) {
    if (made.has(role)) return made.get(role);
    const r = BAKED_ROLES[role];
    if (!r) return null;
    const m = addInkHook(new THREE.MeshBasicMaterial({ map: textures.get(r[0]), vertexColors: true }), materials.shared, r[1]);
    m.name = 't36-baked-' + role;
    made.set(role, m);
    return m;
  }
  // kit 틀이 지은 무리(이름 '<name>-<역할>')의 빛 재질을 구운 빛 재질로 바꾼다. 투명한 것(접지 그림자 등)은 그대로
  function convert(group, baker) {
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const role = o.name.slice(group.name.length + 1);
      const m = get(role);
      if (!m) return;
      baker.bake(o.geometry);
      o.material = m;
    });
    return group;
  }
  function dispose() {
    for (const m of made.values()) m.dispose();
    made.clear();
  }
  return { get, convert, dispose };
}

// 꾸러미 무늬를 받되, 축소 필터를 '가까운 밉맵 한 장에서 선형'으로 바꿔 준다(삼선형의 절반 표본).
// SwiftShader에서 화면을 넓게 덮는 무늬 재질의 픽셀 비용을 줄인다. 무늬 묶음 자체는 그대로다.
export function cheapFilter(THREE, textures) {
  const get = textures.get;
  return {
    ...textures,
    get(name) {
      const t = get(name);
      if (t.minFilter !== THREE.LinearMipmapNearestFilter && t.generateMipmaps !== false) {
        t.minFilter = THREE.LinearMipmapNearestFilter;
        t.needsUpdate = true;
      }
      return t;
    },
  };
}
