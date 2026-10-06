// 그리기 비용 줄이기(T39): 세계 바탕(회랑·바깥)이 쓰는 '꼭짓점 빛' 재질 묶음과 소프트웨어 그리기 알아보기.
//
//   const textures = mipNearest(THREE, createTextures(THREE));
//   const materials = createRigLitMaterials(THREE, textures);   // createMaterials와 같은 모양(get, shared, setDancheong, dispose)
//   materials.setPreset('corridor' | 'wing')                     // 빛 묶음(lighting.js)을 바꿀 때 같이 부른다
//   const kit = createKit(THREE, { materials });
//
// 꼭짓점 빛: 빛을 받는 역할(wood, paint, plaster, roof, stone, floor, paper, books, lantern, foliage)을
// MeshBasicMaterial + 꼭짓점에서 한 번 계산한 램버트 빛(반구광 + 주광 + 보조광) + 먹빛 걸이로 그린다.
// 세계의 빛은 방향이 바뀌지 않고 법선에만 달려 있어 평평한 면에서는 픽셀마다 계산한 것과 같은 색이다.
// t35-wing.js의 관 재질과 같은 셈이지만 빛 값을 uniform으로 두어 회랑·관 묶음을 오갈 수 있다.
// SwiftShader에서 회랑 건축의 그리기 시간이 크게 줄었다(docs/engineering-notes.md '회랑과 바깥을 꼭짓점 빛으로').
//
// softwareRendering(): 그리기 판이 소프트웨어(SwiftShader, llvmpipe 등)인지. GPU를 쓸 수 없는 기기에서 Chrome이 이렇게 그린다.
//   그때는 다중 표본 앤티에일리어싱(MSAA)이 프레임 시간의 약 3분의 1을 먹으므로 세계·보스 그림판이 끈다.
import { createMaterials, addInkHook } from './materials.js';
import { LIGHT_PRESETS } from './lighting.js';
import { TOKENS } from '../palette.js';

// 빛 묶음의 색(lighting.js의 createLightRig과 같은 값)
const RIG_COLORS = { sky: 0xfff4e0, ground: 0x5a4e42, key: 0xfff0d8, fill: 0xc8d4e0 };

const LIT = {
  wood: { tex: 'wood', floor: 0.55 },
  paint: { tex: 'hanji', floor: 0 },
  plaster: { tex: 'plaster', floor: 0.7 },
  roof: { tex: 'roof', floor: 0.8 },
  stone: { tex: 'stone', floor: 0.75 },
  floor: { tex: 'planks', floor: 0.6 },
  // 창호지·초롱은 안에서 비치는 빛을 더한다(꾸러미 재질의 emissive와 같은 색·세기, 먹빛과 상관없이 더해진다)
  paper: { tex: 'hanji', floor: 0.85, emissive: [TOKENS.hanji, 0.35] },
  books: { tex: 'hanji', floor: 0.25, instanced: true },
  lantern: { tex: 'hanji', floor: 0, emissive: ['#ffd9a0', 0.55] },
  foliage: { tex: 'foliage', floor: 0.2, alpha: true },
};

// 무늬를 밉맵 한 장 안에서만 선형으로 거른다(삼선형 거르기는 SwiftShader에서 비싸다). textures.get을 감싼다.
export function mipNearest(THREE, textures) {
  return {
    ...textures,
    get(name) {
      const t = textures.get(name);
      if (t.generateMipmaps && t.minFilter !== THREE.LinearMipmapNearestFilter) { t.minFilter = THREE.LinearMipmapNearestFilter; t.needsUpdate = true; }
      return t;
    },
  };
}

// 재질에 uniform 꼭짓점 빛을 단다. L: { uSky, uGround, uKey, uKeyDir, uFill, uFillDir } 공유 uniform.
// emit: 빛을 곱한 뒤 더할 스스로 내는 빛(선형 RGB, 램버트 재질의 emissive와 같은 뜻)
export function addRigLight(material, L, emit = [0, 0, 0]) {
  const e = emit.map((x) => x.toFixed(4)).join(', ');
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, L);
    shader.vertexShader = 'uniform vec3 uSky;\nuniform vec3 uGround;\nuniform vec3 uKey;\nuniform vec3 uKeyDir;\nuniform vec3 uFill;\nuniform vec3 uFillDir;\nvarying vec3 vRigLight;\n'
      + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec3 rn = normal;
        #ifdef USE_INSTANCING
          rn = mat3( instanceMatrix ) * rn;
        #endif
        rn = normalize( mat3( modelMatrix ) * rn );
        vRigLight = mix( uGround, uSky, 0.5 * rn.y + 0.5 )
          + uKey * max( dot( rn, uKeyDir ), 0.0 )
          + uFill * max( dot( rn, uFillDir ), 0.0 );
      }`);
    shader.fragmentShader = 'varying vec3 vRigLight;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = diffuseColor.rgb * vRigLight + vec3( ${e} );`);
  };
  const key0 = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key0 ? key0() : '') + '|t39-rig-' + e;
  return material;
}

export function createRigLitMaterials(THREE, textures, { preset = 'corridor' } = {}) {
  const kitMaterials = createMaterials(THREE, textures);
  const L = {
    uSky: { value: new THREE.Vector3() }, uGround: { value: new THREE.Vector3() },
    uKey: { value: new THREE.Vector3() }, uKeyDir: { value: new THREE.Vector3() },
    uFill: { value: new THREE.Vector3() }, uFillDir: { value: new THREE.Vector3() },
  };
  const c = new THREE.Color();
  // 램버트와 같은 값: 빛 색(선형) × 세기 ÷ π (three의 BRDF_Lambert)
  const put = (u, hex, k) => { c.set(hex).multiplyScalar(k / Math.PI); u.value.set(c.r, c.g, c.b); };
  function setPreset(name) {
    const p = LIGHT_PRESETS[name] ?? LIGHT_PRESETS.corridor;
    put(L.uSky, RIG_COLORS.sky, p.hemi);
    put(L.uGround, RIG_COLORS.ground, p.hemi);
    put(L.uKey, RIG_COLORS.key, p.key);
    put(L.uFill, RIG_COLORS.fill, p.fill);
    L.uKeyDir.value.set(...p.keyDir).normalize();
    L.uFillDir.value.set(...p.fillDir).normalize();
  }
  setPreset(preset);

  const made = new Map();
  function get(role) {
    const r = LIT[role];
    if (!r) return kitMaterials.get(role);
    if (made.has(role)) return made.get(role);
    const m = new THREE.MeshBasicMaterial({
      map: r.tex ? textures.get(r.tex) : null,
      vertexColors: !r.instanced,
      ...(r.alpha ? { alphaTest: 0.5, side: THREE.DoubleSide } : {}),
    });
    const em = r.emissive ? new THREE.Color(r.emissive[0]).multiplyScalar(r.emissive[1]) : null;
    addRigLight(m, L, em ? [em.r, em.g, em.b] : undefined);
    addInkHook(m, kitMaterials.shared, r.floor);
    m.name = 't39-rig-' + role;
    made.set(role, m);
    return m;
  }

  return {
    get,
    setPreset,
    light: L,
    shared: kitMaterials.shared,
    setDancheong: (v) => kitMaterials.setDancheong(v),
    roles: kitMaterials.roles,
    dispose() { for (const m of made.values()) m.dispose(); made.clear(); kitMaterials.dispose(); },
  };
}

// 소프트웨어 그리기인지(창마다 한 번 잰다). 작은 그림판 하나로 그리기 판 이름을 읽고 바로 놓는다.
let software = null;
export function softwareRendering() {
  if (software !== null) return software;
  software = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
      software = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(name);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    software = false;
  }
  return software;
}

// 길게 합친 무리를 x 구간으로 나눈다(화면 밖 구간은 three의 시야 거르기로 그리지 않는다).
// 회랑처럼 100m 가까이 뻗은 무리는 역할마다 그물 하나라 화면에 일부만 보여도 모든 꼭짓점을 처리한다(SwiftShader에서 비싸다).
// 색인 없는 그물(kit builder가 짓는 꼴)은 삼각형 가운데의 x로, InstancedMesh는 인스턴스 자리의 x로 나눈다.
// edges: 구간 경계 x(오름차순). 원래 그물은 무리에서 빼고 버린다. 구간마다 이름 끝에 '#번호'를 붙인다.
export function splitByX(THREE, group, edges) {
  const bin = (x) => { let k = 0; while (k < edges.length && x >= edges[k]) k++; return k; };
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh) continue;
    const parts = [];
    if (mesh.isInstancedMesh) {
      const m = new THREE.Matrix4();
      const c = new THREE.Color();
      const lists = new Map();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        const k = bin(m.elements[12]);
        if (!lists.has(k)) lists.set(k, []);
        lists.get(k).push(i);
      }
      if (lists.size < 2) continue;
      for (const [k, ids] of lists) {
        const part = new THREE.InstancedMesh(mesh.geometry, mesh.material, ids.length);
        ids.forEach((i, j) => {
          mesh.getMatrixAt(i, m);
          part.setMatrixAt(j, m);
          if (mesh.instanceColor) { mesh.getColorAt(i, c); part.setColorAt(j, c); }
        });
        part.instanceMatrix.needsUpdate = true;
        if (part.instanceColor) part.instanceColor.needsUpdate = true;
        part.computeBoundingSphere();
        parts.push([k, part]);
      }
    } else {
      const g = mesh.geometry;
      if (g.index) continue;
      const pos = g.attributes.position;
      const tris = new Map();
      for (let t = 0; t < pos.count / 3; t++) {
        const x = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3;
        const k = bin(x);
        if (!tris.has(k)) tris.set(k, []);
        tris.get(k).push(t);
      }
      if (tris.size < 2) continue;
      for (const [k, list] of tris) {
        const ng = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(g.attributes)) {
          const n = attr.itemSize;
          const arr = new attr.array.constructor(list.length * 3 * n);
          list.forEach((t, j) => arr.set(attr.array.subarray(t * 3 * n, (t + 1) * 3 * n), j * 3 * n));
          ng.setAttribute(name, new THREE.BufferAttribute(arr, n, attr.normalized));
        }
        ng.computeBoundingSphere();
        parts.push([k, new THREE.Mesh(ng, mesh.material)]);
      }
      g.dispose();
    }
    for (const [k, part] of parts) {
      part.name = mesh.name + '#' + k;
      part.renderOrder = mesh.renderOrder;
      part.matrixAutoUpdate = false;
      part.matrix.copy(mesh.matrix);
      part.matrixWorldNeedsUpdate = true;
      group.add(part);
    }
    group.remove(mesh);
  }
  return group;
}

// 먹안개·번짐 카드용 둥근 판: PlaneGeometry(1, 1)과 같은 무늬 좌표(가운데 0.5)인데 가장자리를 둥글게 잘랐다.
// 둥근 번짐 무늬는 네 귀와 바깥 테가 거의 투명한데도 SwiftShader는 그 픽셀을 다 칠한다.
// 반지름 0.48이면 네모 판의 약 72%만 칠한다(잘린 테의 무늬 불투명도가 0.05 아래라 경계가 보이지 않는다).
export function fogDisc(THREE, radius = 0.48, segments = 24) {
  const g = new THREE.CircleGeometry(radius, segments);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + 0.5, p.getY(i) + 0.5);
  uv.needsUpdate = true;
  return g;
}

// 수묵 병풍(한 번에 칠하기): kit.inkScreen과 같은 자리·크기·나무 테·접지 그림자인데,
// 한지 바탕과 산 두 겹(먼 산·가까운 산, 투명 카드 둘)을 판 하나의 셰이더에서 한 번에 칠한다.
// 관 뒤 병풍은 관 화면 위쪽을 넓게 덮어서 세 겹을 따로 칠하던 비용이 컸다(SwiftShader에서 겹마다 픽셀을 다시 칠한다).
//   const screens = createInkScreens(THREE, materials, textures);   // materials: createRigLitMaterials의 묶음
//   screens.add(kit, b, { x, z, panels, panelW, height });           // 나무 테·그림자는 b(꾸러미 틀)에, 한지·산 판은 screens에 모은다
//   group.add(screens.build('corridor-screens'))
export function createInkScreens(THREE, materials, textures, { fold = 0.28, frame = '#3f3530' } = {}) {
  const quads = [];   // { corners: [Vector3 x4], normal, u0, u1, y0, y1, H }
  function add(kit, b, { x, z, panels = 8, panelW = 2.2, height = 4.2 }) {
    const total = panels * panelW * Math.cos(fold);
    let px = x - total / 2;
    for (let i = 0; i < panels; i++) {
      const a = i % 2 ? fold : -fold;
      const w = panelW;
      const cx = px + (w * Math.cos(fold)) / 2;
      const cz = z + (i % 2 ? 0 : (w * Math.sin(fold)) / 2) - (i % 2 ? (w * Math.sin(fold)) / 2 : 0);
      const M = b.matrixOf([cx, 0, cz], [0, a, 0]);
      const pw = w - 0.08;
      const y0 = 0.12;
      const y1 = height - 0.08;
      const corners = [[-pw / 2, y0], [pw / 2, y0], [pw / 2, y1], [-pw / 2, y1]].map(([lx, ly]) => new THREE.Vector3(lx, ly, 0).applyMatrix4(M));
      const normal = new THREE.Vector3(0, 0, 1).applyMatrix3(new THREE.Matrix3().getNormalMatrix(M)).normalize();
      quads.push({ corners, normal, u0: i / panels, u1: (i + 1) / panels, y0, y1, H: height });
      // 나무 테(kit.inkScreen과 같다)
      for (const [dx, dy, sw, sh] of [[0, height - 0.05, w, 0.1], [0, 0.08, w, 0.16], [-w / 2 + 0.04, height / 2, 0.08, height], [w / 2 - 0.04, height / 2, 0.08, height]]) {
        const m = M.clone().multiply(new THREE.Matrix4().makeTranslation(dx, dy, 0.03));
        b.add('wood', kit.chamferBox(sw, sh, 0.08, 0.015), { matrix: m, color: frame, ao: 0.3 });
      }
      px += w * Math.cos(fold);
    }
    kit.contactShadow(b, { x, z: z + 0.3, w: total + 1, d: 1.6, strength: 1 });
  }

  let material = null;
  function screenMaterial() {
    if (material) return material;
    const paper = materials.get('paper');   // 꼭짓점 빛·먹빛 걸이·창호지 스스로 빛이 달린 한지 재질
    material = paper.clone();
    material.onBeforeCompile = paper.onBeforeCompile;
    material.customProgramCacheKey = () => paper.customProgramCacheKey() + '|t39-ink-screen';
    const mountains = textures.get('mountains');
    const inner = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      inner.call(material, shader, renderer);
      shader.uniforms.uMountains = { value: mountains };
      shader.vertexShader = 'attribute vec3 aScreen;\nvarying vec3 vScreen;\n' + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n      vScreen = aScreen;');
      // aScreen = (병풍 전체에서 가로 자리 0~1, 바닥에서 높이 m, 병풍 높이 m)
      shader.fragmentShader = 'uniform sampler2D uMountains;\nvarying vec3 vScreen;\n' + shader.fragmentShader.replace('#include <alphamap_fragment>', `{
        float H = vScreen.z;
        float tf = ( vScreen.y - 0.32 * H ) / ( 0.6 * H );
        if ( tf > 0.0 && tf < 1.0 ) {
          vec4 far = texture2D( uMountains, vec2( vScreen.x * 1.6, mix( 0.6707, 0.996, tf ) ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, far.rgb, far.a );
        }
        float tn = ( vScreen.y - 0.1 ) / ( 0.55 * H );
        if ( tn > 0.0 && tn < 1.0 ) {
          vec4 near = texture2D( uMountains, vec2( vScreen.x * 1.2 + 0.3, mix( 0.004, 0.3293, tn ) ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, near.rgb, near.a );
        }
      }
      #include <alphamap_fragment>`);
    };
    material.name = 't39-ink-screen';
    return material;
  }

  function build(name = 'ink-screens') {
    const n = quads.length * 6;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const scr = new Float32Array(n * 3);
    const paperCol = new THREE.Color('#f1e8d4').multiplyScalar(0.92);
    let o = 0;
    for (const q of quads) {
      const pw = q.corners[0].distanceTo(q.corners[1]);
      const ph = q.y1 - q.y0;
      const local = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const c = q.corners[k];
        const [s, t] = local[k];
        pos.set([c.x, c.y, c.z], o * 3);
        nor.set([q.normal.x, q.normal.y, q.normal.z], o * 3);
        col.set([paperCol.r, paperCol.g, paperCol.b], o * 3);
        // 한지 결 무늬(0.9m 한 장, kit의 paper 역할과 같은 크기)
        uv.set([(s * pw) / 0.9 + (c.x * 0.37) % 1, (t * ph) / 0.9], o * 2);
        scr.set([q.u0 + s * (q.u1 - q.u0), q.y0 + t * ph, q.H], o * 3);
        o++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aScreen', new THREE.BufferAttribute(scr, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, screenMaterial());
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  return { add, build, dispose() { material?.dispose(); } };
}
