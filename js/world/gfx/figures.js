// 종이 인형 무대: 승인된 2D 인물 그림(sprite/*.webp)을 3D에 '얇은 종이 카드'로 세운다.
//  - 카드는 세로축으로만 카메라를 본다(바닥에 선 채로). 카메라 쪽으로 조금 젖혀 위에서 봐도 납작해 보이지 않는다.
//  - 그림 둘레에 한지색 오린 테두리를 셰이더로 만든다(그림 파일은 그대로, 8방향 표본).
//  - 알파: 그림을 미리 곱한 알파(premultiplied)로 올리고 셰이더에서 되돌려 나눈다. 가장자리 검은 테가 생기지 않는다.
//    테두리 바깥은 알파 0.5로 잘라(discard) 깊이 정렬 문제 없이 불투명하게 그린다.
//  - 발밑 접지 그림자(둥근 번짐), 가만히 있을 때 숨쉬기·살랑임, 걸을 때 종이 인형처럼 콩콩 뛰는 걸음.
//    움직임 줄이기(reduceMotion())면 숨쉬기·걸음 흔들림을 모두 끈다.
//  - 키는 m 단위로 준다(FIGURE_HEIGHT). 건물(문 높이 2.6m, 기둥 3.6m)과 눈높이가 맞게 학생 1.62m 기준.
//
//   const fig = createFigure(THREE, { url, canvas, height: 1.62, reduceMotion, textures });
//   scene.add(fig.root);  fig.root.position.copy(발 자리);
//   fig.update(dt, camera, { moving: true, flip: false });
//   fig.dispose();
import { TOKENS } from '../palette.js';

export const FIGURE_HEIGHT = {
  student: 1.62,
  singer: 1.62,
  mentor: 1.7,
  nim: 1.6,
  jom: 0.7,
};

// 그림 원본에서 몸이 차지하는 위아래 여백(그림마다 조금 다르지만 같은 생성 규칙이라 비슷하다)
const FOOT_MARGIN = 0.02;

let shadowTex = null;
let shadowUsers = 0;
function contactTexture(THREE) {
  if (!shadowTex) {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    const wide = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    wide.addColorStop(0, 'rgba(255,255,255,0.7)');
    wide.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    wide.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = wide;
    g.fillRect(0, 0, S, S);
    const core = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.2);
    core.addColorStop(0, 'rgba(255,255,255,0.45)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, S, S);
    shadowTex = new THREE.CanvasTexture(c);
  }
  shadowUsers++;
  return shadowTex;
}

// 종이 카드 재질: 미리 곱한 알파 되돌리기 + 한지 테두리 + 알파 자르기
export function paperCardMaterial(THREE, map, { edge = 0.022, paper = TOKENS.hanji, ink = 1 } = {}) {
  const mat = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, toneMapped: false, fog: true });
  const uEdge = { value: new THREE.Vector2(edge, edge * 0.5) };
  const uPaper = { value: new THREE.Color(paper) };
  const uInk = { value: ink };
  mat.userData.edge = uEdge;
  mat.userData.paper = uPaper;
  mat.userData.ink = uInk;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEdge = uEdge;
    shader.uniforms.uPaper = uPaper;
    shader.uniforms.uInk = uInk;
    shader.fragmentShader = 'uniform vec2 uEdge;\nuniform vec3 uPaper;\nuniform float uInk;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 texel = texture2D(map, vMapUv);
        float a = texel.a;
        vec3 col = texel.rgb / max(a, 1e-4);
        // 오린 테두리: 둘레 8방향에서 그림이 있으면 종이
        float ring = 0.0;
        for (int i = 0; i < 8; i++) {
          float ang = float(i) * 0.7853982;
          ring = max(ring, texture2D(map, vMapUv + vec2(cos(ang), sin(ang)) * uEdge).a);
        }
        ring = max(ring, texture2D(map, vMapUv + vec2(0.0, -1.0) * uEdge * 0.5).a);
        float inner = smoothstep(0.3, 0.7, a);
        float outer = smoothstep(0.25, 0.6, ring);
        // 종이 결: 화면 좌표 대신 그림 좌표로 잔 얼룩
        float grain = fract(sin(dot(floor(vMapUv * 180.0), vec2(12.9898, 78.233))) * 43758.5453);
        vec3 paperC = uPaper * (0.94 + 0.06 * grain);
        // 테두리 안쪽 끝에 아주 얇은 먹 그늘(종이가 겹친 느낌)
        float lip = outer * (1.0 - inner) * smoothstep(0.0, 0.5, a) * 0.35;
        vec3 outC = mix(paperC, col, inner) * (1.0 - lip);
        diffuseColor.rgb *= mix(vec3(dot(outC, vec3(0.299, 0.587, 0.114))), outC, uInk);
        diffuseColor.a *= max(inner, outer);
        if (diffuseColor.a < 0.5) discard;
        diffuseColor.a = 1.0;
      #endif`,
    );
  };
  mat.customProgramCacheKey = () => 'paper-card';
  return mat;
}

// 인물 하나. url(그림 주소) 또는 canvas(자리표시 그림) 가운데 하나를 준다.
export function createFigure(THREE, { url = null, canvas = null, texture = null, height = FIGURE_HEIGHT.student, reduceMotion = () => false, edge = 0.024, shadow = true, lean = 0.35, name = 'figure', phase = 0 } = {}) {
  const root = new THREE.Group();
  root.name = name;
  const pivot = new THREE.Group();   // 발 가운데를 축으로 흔든다
  root.add(pivot);

  let map = texture;
  let aspect = 0.5;
  let ownsMap = false;
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5 - FOOT_MARGIN, 0);
  const applyAspect = (img) => {
    if (img?.width && img?.height) aspect = img.width / img.height;
    card.scale.set(height * aspect, height, 1);
    if (shadowMesh) shadowMesh.scale.set(Math.max(0.5, height * aspect * 0.95), 1, Math.max(0.28, height * aspect * 0.42));
    mat.userData.edge.value.set(edge, edge * aspect);
  };
  if (!map && url) {
    map = new THREE.TextureLoader().load(url, (t) => applyAspect(t.image));
    ownsMap = true;
  } else if (!map && canvas) {
    map = new THREE.CanvasTexture(canvas);
    ownsMap = true;
  }
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    if (ownsMap) map.premultiplyAlpha = true;
    map.anisotropy = 4;
  }
  const mat = paperCardMaterial(THREE, map, { edge });
  const card = new THREE.Mesh(geo, mat);
  card.name = name + '-card';
  pivot.add(card);

  let shadowMesh = null;
  if (shadow) {
    shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: TOKENS.meok, map: contactTexture(THREE), transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    shadowMesh.name = name + '-shadow';
    shadowMesh.position.y = 0.015;
    shadowMesh.renderOrder = 6;
    root.add(shadowMesh);
  }
  applyAspect(map?.image ?? canvas);

  let time = phase;
  let flipped = false;
  let step = 0;
  const camLocal = new THREE.Vector3();

  function update(dt, camera, { moving = false, flip = null } = {}) {
    const calm = reduceMotion();
    time += dt;
    if (flip !== null) flipped = flip;
    // 세로축으로만 카메라를 본다
    if (camera) {
      camLocal.copy(camera.position);
      root.parent?.worldToLocal(camLocal);
      const dx = camLocal.x - root.position.x;
      const dz = camLocal.z - root.position.z;
      pivot.rotation.y = Math.atan2(dx, dz);
      const pitch = Math.atan2(camLocal.y - (root.position.y + height * 0.6), Math.hypot(dx, dz));
      card.rotation.x = -Math.max(0, pitch) * lean;
    }
    card.scale.x = (flipped ? -1 : 1) * height * aspect;
    if (calm) {
      card.position.y = 0;
      card.rotation.z = 0;
      card.scale.y = height;
      step = 0;
      return;
    }
    if (moving) {
      // 종이 인형 걸음: 작게 콩콩, 좌우로 살짝 기울기
      step += dt * 9.5;
      card.position.y = Math.abs(Math.sin(step)) * 0.045;
      card.rotation.z = Math.sin(step) * 0.05;
      card.scale.y = height;
    } else {
      step = 0;
      card.position.y = 0;
      card.rotation.z = Math.sin(time * 1.1) * 0.012;
      card.scale.y = height * (1 + Math.sin(time * 2.0) * 0.006);
    }
  }

  function setTexture(t) {
    if (ownsMap) map?.dispose();
    map = t;
    ownsMap = false;
    mat.map = t;
    mat.needsUpdate = true;
    applyAspect(t?.image);
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
    if (ownsMap) map?.dispose();
    if (shadowMesh) {
      shadowMesh.geometry.dispose();
      shadowMesh.material.dispose();
      if (--shadowUsers <= 0) { shadowTex?.dispose(); shadowTex = null; shadowUsers = 0; }
    }
    root.removeFromParent();
  }

  return { root, card, shadow: shadowMesh, material: mat, update, setTexture, dispose, get aspect() { return aspect; } };
}
