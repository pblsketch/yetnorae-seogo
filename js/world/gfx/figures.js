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
//
// 절차 3D 인물(figures-3d.js): createFigure·createCharacter는 그림 이름(url의 sprite/<이름>.webp, sprite, kind)에
// 3D 조립법이 있으면 3D 인물을, 없으면 위의 종이 카드를 돌려준다. 부르는 곳을 고치지 않아도 학생·선대 사서·가객 45명·좀·좀 대왕이
// 3D로 선다. 두 손잡이는 같은 모양이다(root, card, shadow, material.userData.ink, update, setTexture, dispose).
// 종이 카드를 꼭 써야 하면 procedural: false, 또는 createPaperCard를 부른다.
import { TOKENS } from '../palette.js';
import { buildProceduralFigure, hasProceduralFigure, buildCrowd } from './figures-3d.js';

export { hasProceduralFigure, RECIPES as FIGURE_RECIPES } from './figures-3d.js';

export const FIGURE_HEIGHT = {
  student: 1.62,
  singer: 1.62,
  mentor: 1.7,
  nim: 1.6,
  jom: 0.7,
  jomKing: 3.2,
};

// 그림 주소나 이름에서 인물 이름을 읽는다: '…/assets/img/sprite/singer-taesan.webp' → 'singer-taesan'
const SPRITE_RE = /(?:^|\/)sprite\/([a-z0-9-]+)\.(?:webp|png|jpe?g)(?:[?#].*)?$/i;
export function spriteKind({ kind = null, sprite = null, url = null, texture = null } = {}) {
  if (kind) return kind;
  if (sprite) return String(sprite).replace(/^sprite\//, '');
  const src = url ?? texture?.image?.currentSrc ?? texture?.image?.src ?? null;
  const m = typeof src === 'string' ? SPRITE_RE.exec(src) : null;
  return m ? m[1] : null;
}

// 그림 원본에서 몸이 차지하는 위아래 여백(그림마다 조금 다르지만 같은 생성 규칙이라 비슷하다)
const FOOT_MARGIN = 0.02;

// 발밑 그림자 무늬는 묶음(pool)마다 하나를 나눠 쓴다(figures-3d.js 머리글 '나눠 쓰는 자원의 묶음')
const shadowPools = new Map();   // pool → { tex, users }
const shadowKey = (pool) => (typeof pool === 'string' && pool ? pool : 'main');
function contactTexture(THREE, pool) {
  const key = shadowKey(pool);
  let entry = shadowPools.get(key);
  if (!entry) {
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
    entry = { tex: new THREE.CanvasTexture(c), users: 0 };
    shadowPools.set(key, entry);
  }
  entry.users++;
  return entry.tex;
}
function releaseContactTexture(pool) {
  const key = shadowKey(pool);
  const entry = shadowPools.get(key);
  if (!entry) return;
  if (--entry.users <= 0) { entry.tex.dispose(); shadowPools.delete(key); }
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

// 인물 하나. 그림에 3D 조립법이 있으면 3D 인물(createCharacter), 없으면 종이 카드다.
//   url(그림 주소), sprite('sprite/mentor' 같은 이름), kind 가운데 하나로 인물을 알아본다. procedural: false면 늘 종이 카드.
export function createFigure(THREE, opts = {}) {
  const kind = opts.procedural === false ? null : spriteKind(opts);
  if (kind && hasProceduralFigure(kind)) return createCharacter(THREE, { ...opts, kind });
  return createPaperCard(THREE, opts);
}

// 종이 카드 인물. url(그림 주소) 또는 canvas(자리표시 그림) 가운데 하나를 준다.
export function createPaperCard(THREE, { url = null, canvas = null, texture = null, height = FIGURE_HEIGHT.student, reduceMotion = () => false, edge = 0.024, shadow = true, lean = 0.35, name = 'figure', phase = 0, pool = 'main' } = {}) {
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

  const shadowMesh = shadow ? contactShadowMesh(THREE, name, pool) : null;
  if (shadowMesh) root.add(shadowMesh);
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
    disposeShadow(shadowMesh);
    root.removeFromParent();
  }

  return { root, card, shadow: shadowMesh, material: mat, update, setTexture, dispose, get aspect() { return aspect; } };
}

// 발밑 접지 그림자(둥근 번짐 카드). 종이 카드와 3D 인물이 같이 쓴다.
export function contactShadowMesh(THREE, name = 'figure', pool = 'main') {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: TOKENS.meok, map: contactTexture(THREE, pool), transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  );
  m.name = name + '-shadow';
  m.position.y = 0.015;
  m.renderOrder = 6;
  m.userData.pool = shadowKey(pool);
  return m;
}

function disposeShadow(m) {
  if (!m) return;
  m.geometry.dispose();
  m.material.dispose();
  releaseContactTexture(m.userData.pool);
}

// 인물 하나: kind(또는 그림 이름)에 절차 3D 조립법(figures-3d.js RECIPES)이 있으면 3D 인물, 없으면 종이 카드(createPaperCard).
//   kind: 'student-a' | 'student-b' | 'mentor' | 'jom' | 'jom-king' | 'singer-<노래 id>' | 'look:<생김새>' | 그 밖(종이 카드).
//   나머지 인자는 createFigure와 같다. height를 빼면 FIGURE_HEIGHT에서 고른다(좀 0.7, 좀 대왕 3.2, 선대 사서 1.7, 그 밖 1.62).
//   faceCamera: 3D 인물이 오래 서 있으면 카메라 쪽으로 비스듬히 돌아선다(세계 true, 길을 걷는 방 false).
//   detail: 둘레 나눔 배수(1 = 가까이, 멀리 서는 인물은 0.55쯤으로 삼각형을 줄인다).
//   3D 인물의 update(dt, camera, { moving, dir, speed })는 dir·speed를 주지 않으면 root가 움직인 거리로 스스로 잰다.
//   flip·lean·edge는 종이 카드만 쓴다.
//   card: 3D 인물에서는 발 가운데를 축으로 하는 묶음이다. update 뒤에 card.rotation·position을 더하면 그 프레임만 흔들린다(종이 카드와 같은 쓰임).
//   material.userData.ink.value: 0 = 먹빛 회색, 1 = 제 빛깔(종이 카드와 같은 쓰임).
//   pool: 재질·무늬·기하를 나눠 쓰는 묶음(figures-3d.js 머리글). 세계와 따로 자기 그림판을 가진 화면(보스)은 자기 이름을 준다.
export function createCharacter(THREE, { kind = null, height = null, reduceMotion = () => false, shadow = true, name = 'figure', phase = 0, faceCamera = true, detail = 1, pool = 'main', ...card } = {}) {
  const k = kind && hasProceduralFigure(kind) ? kind : (card.procedural === false ? null : spriteKind(card));
  if (!k || !hasProceduralFigure(k)) return createPaperCard(THREE, { ...card, height: height ?? FIGURE_HEIGHT.student, reduceMotion, shadow, name, phase, pool });
  const h = height ?? defaultHeight(k);
  const fig = buildProceduralFigure(THREE, { kind: k, height: h, reduceMotion, name, phase, faceCamera, detail, pool });
  const shadowMesh = shadow ? contactShadowMesh(THREE, name, pool) : null;
  if (shadowMesh) {
    const s = h / fig.designHeight;
    shadowMesh.scale.set(fig.shadowSize[0] * s, 1, fig.shadowSize[1] * s);
    fig.root.add(shadowMesh);
  }
  let inkValue = 1;
  const ink = {
    get value() { return inkValue; },
    set value(v) { inkValue = v; fig.setInk(v); },
  };
  return {
    kind: 'procedural',
    figure: k,
    root: fig.root,
    card: fig.sway,
    body: fig,
    shadow: shadowMesh,
    material: { userData: { ink } },
    update: fig.update,
    setTexture() {},   // 3D 인물은 그림을 쓰지 않는다
    dispose() {
      disposeShadow(shadowMesh);
      fig.dispose();
    },
    get aspect() { return 0.45; },
    get triangles() { return fig.triangles; },
  };
}

function defaultHeight(kind) {
  if (kind === 'jom') return FIGURE_HEIGHT.jom;
  if (kind === 'jom-king') return FIGURE_HEIGHT.jomKing;
  if (kind === 'mentor') return FIGURE_HEIGHT.mentor;
  return FIGURE_HEIGHT.student;
}

// 인물 무리(엔딩 행렬, 줄 세우기처럼 한꺼번에 많이 보일 때): 서 있는 몸을 합친 기하 하나 + 먹 테두리 하나 + 발밑 그림자 인스턴스 하나,
// 몇 명이든 그리기 호출 셋이다. 멀리 보는 간단한 몸(detail 0.55)이 기본이다.
//   members: [{ kind, x, z, y = 0, yaw = 0(정면 +z), height, phase }]. kind에 조립법이 없는 사람은 빠진다.
//   update(dt): 사람마다 다른 위상으로 작게 들썩인다(움직임 줄이기면 멈춘다).
//   outline: false면 먹 테두리를 빼서 그리기 호출 둘, 삼각형 약 절반(아주 멀리 서는 무리).
export function createFigureCrowd(THREE, members, { detail = 0.55, reduceMotion = () => false, shadow = true, outline = true, name = 'crowd' } = {}) {
  const crowd = buildCrowd(THREE, members.map((m) => ({ ...m, height: m.height ?? defaultHeight(m.kind) })), { detail, name, outline });
  let shadows = null;
  if (shadow && crowd.members.length) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: TOKENS.meok, map: contactTexture(THREE, 'main'), transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    shadows = new THREE.InstancedMesh(geo, mat, crowd.members.length);
    shadows.name = name + '-shadow';
    shadows.renderOrder = 6;
    const m4 = new THREE.Matrix4();
    crowd.members.forEach((m, i) => {
      const s = (m.height ?? FIGURE_HEIGHT.student) / FIGURE_HEIGHT.student;
      m4.makeScale(0.78 * s, 1, 0.5 * s).setPosition(m.x ?? 0, (m.y ?? 0) + 0.015, m.z ?? 0);
      shadows.setMatrixAt(i, m4);
    });
    shadows.instanceMatrix.needsUpdate = true;
    crowd.root.add(shadows);
  }
  return {
    root: crowd.root,
    members: crowd.members,
    triangles: crowd.triangles,
    update(dt) { crowd.update(dt, reduceMotion()); },
    dispose() {
      if (shadows) {
        shadows.geometry.dispose();
        shadows.material.dispose();
        shadows.dispose();
        releaseContactTexture('main');
      }
      crowd.dispose();
    },
  };
}
