// 관 내부 꾸러미(T35): 향가관·고려가요관·시조관 모형이 gfx 꾸러미를 함께 쓰는 얇은 층.
// 관 모형은 세계의 그림 도구를 넘겨받지 않으므로(ctx에 없다) 관마다 무늬·재질·소품 틀을 하나씩 만들고 치울 때 함께 치운다.
//
//   const gfx = createWingGfx(THREE, { assets: ctx.assets, wingId: 'hyangga' });
//   const later = gfx.deferred(() => buildArt(gfx));   // 두 번째 프레임에 짓는다(관 들어가기 글이 늦지 않게)
//   update(dt) { later.tick(root); gfx.setDancheong(getDancheong(wingId)); }
//   dispose() { later.dispose(); gfx.dispose(); }
//
// 덧붙이는 것
//   - boxMaterial(무늬): 크기를 바꾼 상자 인스턴스(InstancedMesh)에 무늬가 늘어나지 않게, 인스턴스 크기로 무늬 좌표를 다시 잡는 재질.
//     색은 인스턴스 색(이미 먹빛 → 단청으로 칠한 값)을 그대로 쓰므로 먹빛 걸이는 달지 않는다.
//   - bevelBox: 모서리를 깎은 단위 상자(인스턴스 상자를 '날 선 회색 상자'로 보이지 않게)
//   - transformed(b, 행렬): 꾸러미 소품 함수를 돌리거나 옮겨서 넣는 틀(지붕 뒷면, 옆을 보는 소품)
//   - roofStone: 석탑 옥개석(네 귀가 들린 얕은 돌 지붕), stoneLantern: 석등, softSpot: 먹안개용 둥근 번짐 무늬
//   - mural(): 관 그림 자산(texture/<관>)을 단청 무늬 판으로. 먹빛 걸이(먹 바닥 0)를 달아 단청 값 0에서는 먹빛이다.
import { createTextures, seeded } from './textures.js';
import { createMaterials, addInkHook } from './materials.js';
import { createKit, WOOD } from './kit.js';
import { mixHex, TOKENS } from '../palette.js';
import { LIGHT_PRESETS } from './lighting.js';

export { WOOD };

// 인스턴스 상자의 무늬 좌표: 면마다 인스턴스 크기(m)로 잡고, 긴 쪽이 u(나뭇결 방향)가 되게 한다.
function scaledUvHook(material, tile) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#if defined( USE_MAP ) && defined( USE_INSTANCING )
      {
        vec3 tsc = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
        vec3 tlp = position * tsc;
        vec3 tan = abs( normal );
        vec2 tq = tan.x > 0.5 ? tlp.zy : ( tan.y > 0.5 ? tlp.xz : tlp.xy );
        vec2 tdim = tan.x > 0.5 ? tsc.zy : ( tan.y > 0.5 ? tsc.xz : tsc.xy );
        if ( tdim.y > tdim.x ) tq = tq.yx;
        vMapUv = tq / ${tile.toFixed(3)} + fract( instanceMatrix[ 3 ].xz * 0.37 );
      }
#endif`);
  };
  material.customProgramCacheKey = () => 't35-scaled-uv-' + tile;
  return material;
}

// 꼭짓점 빛(관 화면 전용): 세계 빛 묶음의 'wing' 값(반구광 + 주광 + 보조광)과 같은 램버트 빛을 꼭짓점에서 한 번 계산한다.
// 방향광과 반구광은 법선에만 달려 있어 평평한 면에서는 픽셀마다 계산한 것과 같은 색이 된다.
// 소프트웨어 그리기(SwiftShader)에서 픽셀마다 빛을 계산하는 램버트 재질이 관 화면 비용의 큰 몫이어서 이렇게 바꾼다.
// 빛이 없는 재질(MeshBasicMaterial)에 단다. boost는 스스로 내는 빛(창호지·초롱)을 더하는 값이다.
function vertexLightHook(THREE, material, boost = [0, 0, 0]) {
  const P = LIGHT_PRESETS.wing;
  const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => (x / l).toFixed(4)).join(', '); };
  const lin = (hex, k) => new THREE.Color(hex).multiplyScalar(k / Math.PI);
  const v3 = (c) => `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`;
  const sky = lin(0xfff4e0, P.hemi);
  const ground = lin(0x5a4e42, P.hemi);
  const key = lin(0xfff0d8, P.key);
  const fill = lin(0xc8d4e0, P.fill);
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.vertexShader = 'varying vec3 vT35Light;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec3 tn = normal;
        #ifdef USE_INSTANCING
          tn = mat3( instanceMatrix ) * tn;
        #endif
        tn = normalize( mat3( modelMatrix ) * tn );
        vT35Light = mix( ${v3(ground)}, ${v3(sky)}, 0.5 * tn.y + 0.5 )
          + ${v3(key)} * max( dot( tn, vec3( ${unit(P.keyDir)} ) ), 0.0 )
          + ${v3(fill)} * max( dot( tn, vec3( ${unit(P.fillDir)} ) ), 0.0 )
          + vec3( ${boost.map((x) => x.toFixed(3)).join(', ')} );
      }`);
    shader.fragmentShader = 'varying vec3 vT35Light;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n      diffuseColor.rgb *= vT35Light;');
  };
  const key0 = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key0 ? key0() : '') + '|t35-vlight-' + boost.join(',');
  return material;
}

let bevelGeo = null;

export function createWingGfx(THREE, { assets = null, wingId = '' } = {}) {
  // 무늬는 관마다 따로 만든다. 소프트웨어 그리기에서 삼선형 거르기가 비싸서(관 화면 비용의 큰 몫),
  // 밉맵 한 장 안에서만 선형으로 거른다(LinearMipmapNearest). 세계의 무늬(회랑)는 건드리지 않는다.
  const base = createTextures(THREE);
  const textures = {
    ...base,
    get(name) {
      const t = base.get(name);
      if (t.minFilter !== THREE.LinearMipmapNearestFilter && t.generateMipmaps) { t.minFilter = THREE.LinearMipmapNearestFilter; t.needsUpdate = true; }
      return t;
    },
  };
  const kitMaterials = createMaterials(THREE, textures);
  // 빛을 받는 역할은 꼭짓점 빛 + 먹빛 걸이를 단 MeshBasicMaterial로 바꿔 쓴다(먹 바닥 값은 꾸러미 재질과 같다).
  // 투명·빛 없는 역할(contact, glow, backdrop, ground)은 꾸러미 재질 그대로.
  const LIT = {
    wood: { tex: 'wood', floor: 0.55 },
    paint: { tex: null, floor: 0 },
    plaster: { tex: 'plaster', floor: 0.7 },
    roof: { tex: 'roof', floor: 0.8 },
    stone: { tex: 'stone', floor: 0.75 },
    floor: { tex: 'planks', floor: 0.6 },
    paper: { tex: 'hanji', floor: 0.85, boost: [0.3, 0.29, 0.26] },
    books: { tex: 'hanji', floor: 0.25, instanced: true },
    lantern: { tex: null, floor: 0, boost: [0.55, 0.45, 0.3] },
    foliage: { tex: 'foliage', floor: 0.2, alpha: true },
  };
  const litMade = new Map();
  // fresh: 따로 쓸 새 재질(색을 따로 바꾸는 부분, 예: 시조관 지붕). 치우는 것은 부르는 쪽이 맡는다
  function litMaterial(role, fresh = false) {
    if (!fresh && litMade.has(role)) return litMade.get(role);
    const r = LIT[role];
    const m = new THREE.MeshBasicMaterial({
      map: r.tex ? textures.get(r.tex) : null,
      vertexColors: !r.instanced,
      ...(r.alpha ? { alphaTest: 0.5, side: THREE.DoubleSide } : {}),
    });
    vertexLightHook(THREE, m, r.boost);
    addInkHook(m, kitMaterials.shared, r.floor);
    m.name = 't35-lit-' + role;
    if (!fresh) litMade.set(role, m);
    return m;
  }
  const materials = {
    get: (role) => (LIT[role] ? litMaterial(role) : kitMaterials.get(role)),
    fresh: (role) => litMaterial(role, true),
    shared: kitMaterials.shared,
    setDancheong: (v) => kitMaterials.setDancheong(v),
    dispose() { for (const m of litMade.values()) m.dispose(); litMade.clear(); kitMaterials.dispose(); },
  };
  const kit = createKit(THREE, { materials });
  const own = [];
  const keep = (x) => { own.push(x); return x; };

  function boxMaterial(name = 'hanji', { tile = 1.2, color = '#ffffff' } = {}) {
    const m = new THREE.MeshBasicMaterial({ map: textures.get(name), color });
    m.name = 't35-box-' + name;
    scaledUvHook(m, tile);
    return keep(vertexLightHook(THREE, m));
  }

  // 모서리를 깎은 단위 상자(1×1×1). 무늬 좌표는 재질이 인스턴스 크기로 잡으므로 uv가 없어도 된다.
  function bevelBox() {
    if (!bevelGeo) {
      const g = kit.chamferBox(1, 1, 1, 0.07).clone();
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      bevelGeo = g;
    }
    return bevelGeo;
  }

  // 관 그림 자산을 단청 무늬 판 재질로. 자산이 없으면(점검 페이지) 꾸러미의 단청 칠 재질로 대신한다.
  let muralMat = null;
  function mural() {
    if (muralMat) return muralMat;
    const tex = assets?.texture?.('texture/' + wingId) ?? null;
    if (!tex) { muralMat = materials.get('paint'); return muralMat; }
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    muralMat = keep(addInkHook(vertexLightHook(THREE, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true })), materials.shared, 0));
    muralMat.name = 't35-mural-' + wingId;
    return muralMat;
  }

  // 꾸러미 소품 함수를 행렬 하나로 옮기거나 돌려 넣는 틀. kit.giwaRoof(transformed(b, M), {...})처럼 쓴다.
  function transformed(b, M) {
    const t = {
      add(role, geo, opts = {}) {
        const local = opts.matrix ?? b.matrixOf(opts.p, opts.r, opts.s);
        b.add(role, geo, { ...opts, matrix: M.clone().multiply(local) });
      },
      box(role, w, h, d, opts = {}) {
        t.add(role, kit.chamferBox(w, h, d, opts.bevel ?? Math.min(w, h, d) * 0.14), opts);
      },
      instance(role, geo, opts = {}) {
        const local = opts.matrix ?? b.matrixOf(opts.p, opts.r, opts.s);
        b.instance(role, geo, { ...opts, matrix: M.clone().multiply(local) });
      },
      matrixOf: b.matrixOf,
    };
    return t;
  }
  const placeAt = (x, y, z, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));

  // 석탑 옥개석: 가운데가 솟고 네 귀가 들린 얕은 돌 지붕(윗면 + 처마 두께 + 밑면). 가운데 아래가 원점.
  const roofStoneCache = new Map();
  function roofStoneGeometry(w, d, rise, lift, thick, n = 10) {
    const key = [w, d, rise, lift, thick, n].join(',');
    if (roofStoneCache.has(key)) return roofStoneCache.get(key);
    const pos = [];
    const idx = [];
    const topY = (u, v) => {
      const m = Math.max(Math.abs(u), Math.abs(v));
      const t = Math.min(Math.abs(u), Math.abs(v));
      return rise * (1 - m) ** 1.35 + lift * m ** 3 * t ** 2.2;
    };
    const ring = [];
    // 윗면(격자)
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const u = -1 + (2 * i) / n;
        const v = -1 + (2 * j) / n;
        pos.push((u * w) / 2, topY(u, v), (v * d) / 2);
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i;
        idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    }
    // 둘레(처마 두께): 윗면 가장자리에서 thick만큼 아래로
    for (let i = 0; i < n; i++) ring.push([i, 0]);
    for (let j = 0; j < n; j++) ring.push([n, j]);
    for (let i = n; i > 0; i--) ring.push([i, n]);
    for (let j = n; j > 0; j--) ring.push([0, j]);
    const base = pos.length / 3;
    ring.forEach(([i, j]) => {
      const u = -1 + (2 * i) / n;
      const v = -1 + (2 * j) / n;
      const y = topY(u, v);
      pos.push((u * w) / 2, y, (v * d) / 2, (u * w) / 2 * 0.985, y - thick, (v * d) / 2 * 0.985);
    });
    const R = ring.length;
    for (let k = 0; k < R; k++) {
      const a = base + k * 2;
      const b = base + ((k + 1) % R) * 2;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    // 밑면(둘레 아래 점들을 가운데로 모은 부채꼴)
    const c = pos.length / 3;
    pos.push(0, -thick * 0.6, 0);
    for (let k = 0; k < R; k++) {
      const a = base + k * 2 + 1;
      const b = base + ((k + 1) % R) * 2 + 1;
      idx.push(c, a, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const out = g.toNonIndexed();
    out.computeVertexNormals();
    g.dispose();
    roofStoneCache.set(key, out);
    return out;
  }
  function roofStone(b, { x, y, z, w, d, rise = 0.3, lift = 0.16, thick = 0.12, color = '#a8a297' }) {
    b.add('stone', roofStoneGeometry(w, d, rise, lift, thick), { p: [x, y, z], color, ao: 0.15 });
    return { top: y + rise };
  }

  // 석등: 하대석·간주석·화사석(불 창 넷)·옥개석·보주. (x, z)는 바닥 가운데. glows에 불빛 자리를 넣는다.
  function stoneLantern(b, glows, { x, z, scale = 1, color = '#a29d93' }) {
    const s = scale;
    b.box('stone', 0.62 * s, 0.14 * s, 0.62 * s, { p: [x, 0.07 * s, z], color, ao: 0.5 });
    b.add('stone', kit.cylinder(0.2 * s, 0.3 * s, 0.16 * s, 8), { p: [x, 0.22 * s, z], color });
    b.add('stone', kit.cylinder(0.09 * s, 0.11 * s, 0.62 * s, 8), { p: [x, 0.61 * s, z], color });
    b.add('stone', kit.cylinder(0.3 * s, 0.18 * s, 0.14 * s, 8), { p: [x, 0.99 * s, z], color });
    // 화사석: 네 기둥 사이로 불이 보인다
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('stone', 0.08 * s, 0.34 * s, 0.08 * s, { p: [x + dx * 0.12 * s, 1.23 * s, z + dz * 0.12 * s], color, ao: 0 });
    b.add('lantern', kit.cylinder(0.11 * s, 0.11 * s, 0.26 * s, 6), { p: [x, 1.22 * s, z], color: '#f2c27a', ao: 0 });
    roofStone(b, { x, y: 1.44 * s, z, w: 0.62 * s, d: 0.62 * s, rise: 0.16 * s, lift: 0.07 * s, thick: 0.06 * s, color });
    b.add('stone', kit.cylinder(0.035 * s, 0.07 * s, 0.12 * s, 6), { p: [x, 1.66 * s, z], color });
    b.add('stone', kit.cylinder(0.06 * s, 0.03 * s, 0.1 * s, 6), { p: [x, 1.77 * s, z], color });
    if (glows) glows.push({ x, y: 1.22 * s, z: z + 0.2, size: 0.9 * s });
    kit.contactShadow(b, { x, z, w: 1.1 * s, d: 1.0 * s, strength: 0.9 });
  }

  // 반쯤 비치는 둥근 번짐(먹안개용). 가운데가 진하고 가장자리가 사라진다.
  function softSpot(size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const gr = g.createRadialGradient(r, r, 1, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    const t = keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // 무거운 건축은 두 번째 프레임에 짓는다. 첫 프레임은 반응하는 부분만 그려 관 들어가기 글이 늦지 않게 한다.
  function deferred(build, { frames = 2 } = {}) {
    let n = 0;
    let group = null;
    let parent = null;
    return {
      tick(root) {
        if (group || ++n < frames) return false;
        group = build();
        parent = root;
        if (group) root.add(group);
        return true;
      },
      get group() { return group; },
      now(root) { n = frames; return this.tick(root); },
      dispose() {
        if (!group) return;
        parent?.remove(group);
        group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
        group = null;
      },
    };
  }

  return {
    THREE, textures, materials, kit, seeded, mixHex,
    boxMaterial, bevelBox, mural, litHook: (m, boost) => vertexLightHook(THREE, m, boost), inkHook: (m, floor = 0) => addInkHook(m, materials.shared, floor), hasMuralArt: () => !!assets?.image?.('texture/' + wingId), transformed, placeAt, roofStone, roofStoneGeometry, stoneLantern, softSpot, deferred,
    setDancheong: (v) => materials.setDancheong(v),
    dispose() {
      for (const o of own) o.dispose?.();
      own.length = 0;
      for (const g of roofStoneCache.values()) g.dispose();
      roofStoneCache.clear();
      materials.dispose();
      kit.dispose();
      textures.dispose();
    },
  };
}
