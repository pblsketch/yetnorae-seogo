// 재질 묶음: 역할마다 재질 하나를 만들어 모든 부분이 나눠 쓴다(그리기 호출과 셰이더 수를 아낀다).
// 먹빛 → 단청 걸이: 모든 재질이 같은 uniform(uDancheong) 하나를 본다. setDancheong(값)을 한 번 부르면 모두 바뀐다.
//   재질마다 '먹 바닥'(inkFloor)이 있다. 0이면 단청 값 0에서 완전히 먹빛(단청 칠, 초롱), 0.6이면 자연색이 조금 바랜 정도(나무, 돌).
//   palette.js의 dancheongColor(본색, 값)과 같은 뜻이다: 먹빛 = 밝기만 남긴 회색을 먹 쪽으로 조금 누른 색.
//
//   const mats = createMaterials(THREE, textures);
//   mats.get('wood')          // 역할 이름으로
//   mats.setDancheong(0.4)
//   mats.dispose()
//
// 역할: wood(나무 결, 꼭짓점 색으로 칠), paint(단청 칠·초롱 비단, 먹 바닥 0), plaster(회벽), roof(기와), stone(돌), ground(넓은 마당, 빛 없음),
//       floor(마루 널), paper(창호지, 안에서 은은히 밝음), books(책등, 인스턴스 색), foliage(종이 나무, 알파 자르기),
//       backdrop(수묵 산, 빛 없음·투명), contact(접지 그림자, 곱하기), glow(등불 번짐, 더하기)
import { TOKENS } from '../palette.js';

const INK_TINT = TOKENS.meokSoft;

// 재질에 먹빛 걸이를 단다. shared: { uDancheong, uInkTint } 공유 uniform. floor: 먹 바닥(0~1).
export function addInkHook(material, shared, floor = 0) {
  const uFloor = { value: floor };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uDancheong = shared.uDancheong;
    shader.uniforms.uInkTint = shared.uInkTint;
    shader.uniforms.uInkFloor = uFloor;
    shader.fragmentShader = 'uniform float uDancheong;\nuniform vec3 uInkTint;\nuniform float uInkFloor;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float inkL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 inkC = mix(vec3(inkL), uInkTint * (inkL / max(dot(uInkTint, vec3(0.299, 0.587, 0.114)), 1e-3)), 0.35);
        diffuseColor.rgb = mix(inkC, diffuseColor.rgb, clamp(uInkFloor + (1.0 - uInkFloor) * uDancheong, 0.0, 1.0));
      }`,
    );
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|ink-hook';
  material.userData.inkFloor = uFloor;
  return material;
}

export function createMaterials(THREE, textures) {
  const shared = { uDancheong: { value: 0 }, uInkTint: { value: new THREE.Color(INK_TINT) } };
  const made = new Map();

  const lambert = (opts, floor) => addInkHook(new THREE.MeshLambertMaterial(opts), shared, floor);

  const recipes = {
    wood: () => lambert({ map: textures.get('wood'), vertexColors: true }, 0.55),
    paint: () => lambert({ map: textures.get('hanji'), vertexColors: true }, 0),
    plaster: () => lambert({ map: textures.get('plaster'), vertexColors: true }, 0.7),
    roof: () => lambert({ map: textures.get('roof'), vertexColors: true }, 0.8),
    stone: () => lambert({ map: textures.get('stone'), vertexColors: true }, 0.75),
    // 넓은 마당 바닥: 빛 계산 없는 재질(평평한 땅은 어디나 같은 빛을 받는다). 화면을 넓게 덮으므로 가장 싸게 그린다
    ground: () => addInkHook(new THREE.MeshBasicMaterial({ map: textures.get('plaster'), vertexColors: true }), shared, 0.7),
    floor: () => lambert({ map: textures.get('planks'), vertexColors: true }, 0.6),
    // 창호지: 안쪽에서 빛이 비치는 듯 스스로 조금 밝다
    paper: () => lambert({ map: textures.get('hanji'), vertexColors: true, emissive: new THREE.Color(TOKENS.hanji), emissiveIntensity: 0.35 }, 0.85),
    // 책등: 인스턴스 색. 무늬는 한지 결
    books: () => lambert({ map: textures.get('hanji') }, 0.25),
    // 초롱: 비단 안에서 등불이 비친다. 단청 값에 따라 먹빛 → 청·홍
    lantern: () => lambert({ map: textures.get('hanji'), vertexColors: true, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.55 }, 0),
    foliage: () => lambert({ map: textures.get('foliage'), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true }, 0.2),
    backdrop: () => addInkHook(new THREE.MeshBasicMaterial({ map: textures.get('mountains'), transparent: true, depthWrite: false, vertexColors: true }), shared, 0.85),
    contact: () => new THREE.MeshBasicMaterial({ color: TOKENS.meok, map: textures.get('contact'), transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    glow: () => new THREE.MeshBasicMaterial({ map: textures.get('glow'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, toneMapped: false }),
  };

  function get(role) {
    if (made.has(role)) return made.get(role);
    const r = recipes[role];
    if (!r) throw new Error('[gfx] 모르는 재질 역할: ' + role);
    const m = r();
    m.name = 'gfx-' + role;
    made.set(role, m);
    return m;
  }

  function setDancheong(level) {
    shared.uDancheong.value = Math.min(1, Math.max(0, Number(level) || 0));
  }

  function dispose() {
    for (const m of made.values()) m.dispose();
    made.clear();
  }

  return { get, setDancheong, shared, dispose, roles: Object.keys(recipes) };
}
