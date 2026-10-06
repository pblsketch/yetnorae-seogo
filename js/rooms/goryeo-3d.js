// 작품 방 「정석가」 3D 장면(spec 14). 부르는 쪽이 준 root에 무대를 짓고, 그리기는 부르는 쪽(세계 바탕)이 한다.
// 무대: 그림 판을 걸어 둔 뒷벽, 마루 널, 주춧돌 위 기둥 둘, 임 종이 인형, 돌 받침 위의 약속 탑(내세운 조건 카드가 판으로 쌓임),
// 구슬·끈·바위. 조건 카드를 내세우면 그 '될 수 없는 일'이 작은 장면으로 마루에 솟는다:
//   모래 벼랑에 심은 구운 밤과 돋은 싹, 바위에 새긴 옥 연꽃, 횃대에 건 무쇠 철릭, 쇠풀을 뜯는 무쇠 소.
// 소품은 gfx 꾸러미(js/world/gfx/t37-scenery.js)로 짓는다. 그리기 호출은 서른 안팎(목표 60회 이하), 그림자와 후처리는 없다.
// 화면 오른쪽 반은 방 패널이 덮으므로 무대를 화면 왼쪽 반 가운데로 민다(카메라 비율이 바뀌면 다시 맞춘다).
// 2D 겹(goryeo-2d.js)과 같은 손잡이를 돌려준다: placeCard, object, speak, showFinal, showMatch, dispose.
import { TOKENS } from '../world/palette.js';
import { paperDollCanvas } from '../world/sprites.js';
import { createFigure } from '../world/gfx/figures.js';
import { createScenery, disposeGroupGeometry } from '../world/gfx/t37-scenery.js';

const CAMERA = { position: [0, 2.1, 6.4], target: [0, 1.1, 0] };
const LEFT_CENTER_NDC = -0.52;   // 무대 가운데를 둘 화면 가로 자리(-1 왼쪽 끝 ~ 1 오른쪽 끝)
const SLAB = { w: 1.5, h: 0.3, d: 0.8, gap: 0.02 };
const ALTAR = { x: 0.55, top: 0.62 };
const ROCK = { x: 1.75, z: 0.55 };

function labelCanvas(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = TOKENS.hanji;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = TOKENS.meokSoft;
  g.lineWidth = 6;
  g.strokeRect(3, 3, c.width - 6, c.height - 6);
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'serif';
  let size = 46;
  g.fillStyle = TOKENS.meok;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  do { g.font = '700 ' + size + 'px ' + font; size -= 2; } while (g.measureText(text).width > c.width - 40 && size > 18);
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  return c;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function createRoom3D({ THREE, root, camera, assets, reduceMotion }) {
  const owned = [];
  const own = (x) => { owned.push(x); return x; };
  const color = (hex) => new THREE.Color(hex);

  const group = new THREE.Group();
  group.name = 'rg-room';
  const stage = new THREE.Group();
  stage.name = 'rg-stage';
  group.add(stage);

  // ── 카메라(끝나면 돌려놓는다) ──
  const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone() };
  const target = new THREE.Vector3(...CAMERA.target);
  camera.up.set(0, 1, 0);
  camera.position.set(...CAMERA.position);
  camera.lookAt(target);

  // ── 빛(그리기 호출 없음) ──
  const ambient = new THREE.AmbientLight(0xffffff, 1.5);
  const sun = new THREE.DirectionalLight(0xfff3dd, 1.6);
  sun.position.set(2, 5, 4);
  group.add(ambient, sun);

  // ── 뒷벽: 2D와 같은 그림 판을 건다 ──
  const boardTex = assets?.texture?.('board/room-goryeo') ?? null;
  const backdrop = new THREE.Mesh(
    own(new THREE.PlaneGeometry(16, 9)),
    own(new THREE.MeshBasicMaterial({ map: boardTex, color: boardTex ? 0xffffff : color(TOKENS.hanjiDeep) })),
  );
  backdrop.name = 'rg-backdrop';
  backdrop.position.set(0, 2.2, -5);
  group.add(backdrop);

  // ── 마루와 기둥(gfx 꾸러미): 널 마루, 주춧돌 위 둥근 기둥, 마루 끝 귀틀 ──
  const sc = createScenery(THREE);
  sc.materials.setDancheong(1);
  const fb = sc.kit.builder();
  fb.box('floor', 16, 0.16, 12, { p: [0.3, -0.08, 2.5], color: '#b89a78', ao: 0, bevel: 0.02 });
  fb.box('wood', 16, 0.12, 0.22, { p: [0.3, 0.01, -1.6], color: '#5e4a3a', ao: 0 });
  for (const [x, z] of [[-2.8, -1.2], [3.2, -1.2]]) {
    fb.add('stone', sc.kit.cylinder(0.26, 0.32, 0.22, 8), { p: [x, 0.11, z], color: '#a49d90', ao: 0.4 });
    fb.add('wood', sc.kit.cylinder(0.14, 0.16, 3.2, 14), { p: [x, 1.82, z], color: '#6b5440' });
    fb.box('paint', 0.36, 0.14, 0.36, { p: [x, 3.45, z], color: '#5d6f62', ao: 0 });
  }
  const floorGroup = fb.build('rg-floor');
  stage.add(floorGroup);

  // ── 임 종이 인형 ──
  // 종이 카드 + 발밑 그림자 + 숨쉬기(gfx/figures.js). 마루 위(y = 0)에 발을 딛는다.
  const nimFigure = createFigure(THREE, { canvas: paperDollCanvas('nim', 256, 512), height: 2.05, reduceMotion, name: 'rg-nim', lean: 0.2 });
  nimFigure.root.position.set(-1.35, 0, 0.35);
  stage.add(nimFigure.root);
  const nim = nimFigure.card;

  // ── 약속 탑: 돌 받침(연꽃 받침돌 꼴) 위에 카드 판이 쌓인다 ──
  const ab = sc.kit.builder();
  ab.add('stone', sc.kit.cylinder(0.98, 1.05, 0.16, 8), { p: [ALTAR.x, 0.08, 0], color: '#9c968a', ao: 0.4 });
  ab.add('stone', sc.kit.cylinder(0.82, 0.92, 0.26, 8), { p: [ALTAR.x, 0.29, 0], color: '#aaa498', ao: 0.2 });
  ab.add('stone', sc.kit.cylinder(0.92, 0.8, 0.2, 8), { p: [ALTAR.x, ALTAR.top - 0.1, 0], color: '#b2ac9f', ao: 0 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ab.box('stone', 0.34, 0.12, 0.1, { p: [ALTAR.x + Math.cos(a) * 0.86, ALTAR.top - 0.17, Math.sin(a) * 0.86], r: [0, -a + Math.PI / 2, -0.3], color: '#a39d91', ao: 0 });
  }
  sc.kit.contactShadow(ab, { x: ALTAR.x, z: 0.05, w: 2.6, d: 2.0 });
  const altar = ab.build('rg-altar');
  stage.add(altar);
  const slabGeo = own(new THREE.BoxGeometry(SLAB.w, SLAB.h, SLAB.d));
  const slabMat = own(new THREE.MeshLambertMaterial({ color: color(TOKENS.hanji) }));
  const labelGeo = own(new THREE.PlaneGeometry(SLAB.w - 0.06, SLAB.h - 0.04));

  // ── 구슬·끈·바위(마지막 연) ──
  const rb = sc.kit.builder();
  sc.rock(rb, { x: 0, z: 0, s: 0.5, flat: 0.95, seed: 2, color: '#8d887e' });
  const rock = rb.build('rg-rock');
  rock.position.set(ROCK.x, -0.05, ROCK.z);
  rock.visible = false;
  const beadMat = own(new THREE.MeshLambertMaterial({ color: color(TOKENS.gold), emissive: color(TOKENS.gold), emissiveIntensity: 0.15 }));
  const bead = new THREE.Mesh(own(new THREE.IcosahedronGeometry(0.17, 1)), beadMat);
  bead.name = 'rg-bead';
  bead.visible = false;
  const string = new THREE.Mesh(own(new THREE.CylinderGeometry(0.012, 0.012, 4, 5)), own(new THREE.MeshLambertMaterial({ color: color(TOKENS.meok) })));
  string.name = 'rg-string';
  string.visible = false;
  stage.add(rock, bead, string);
  const BEAD_REST = 0.3 + 0.42 * 0.8 + 0.17;
  function setBeadY(y) {
    bead.position.set(ROCK.x, y, ROCK.z);
    string.position.set(ROCK.x, y + 2, ROCK.z); // 끈은 구슬 위로 이어진다(끊어지지 않는다)
  }

  // ── 될 수 없는 일: 카드마다 마루에 솟는 작은 장면(처음에는 숨어 있다) ──
  const scenes = {};
  // 장면은 무대 앞쪽 마루(카메라 쪽 빈자리)에 한 줄로 놓는다. 방 패널이 오른쪽 반을 덮으므로 보이는 왼쪽 반 안에 둔다
  function vignette(id, x, z, draw, size = 1) {
    const vb = sc.kit.builder();
    draw(vb);
    const g = vb.build('rg-scene-' + id);
    const holder = new THREE.Group();
    holder.position.set(x, 0, z);
    holder.add(g);
    holder.visible = false;
    holder.scale.setScalar(0.001);
    holder.userData.size = size;
    stage.add(holder);
    scenes[id] = holder;
  }
  // 모래 벼랑에 구운 밤 다섯 되를 심고, 그 밤에서 싹이 돋는다
  vignette('gueun-bam', -0.5, 1.1, (v) => {
    sc.rock(v, { x: 0, z: 0, s: 0.62, flat: 0.45, seed: 1, color: '#d8c49a' });
    sc.rock(v, { x: 0.35, z: -0.2, s: 0.38, flat: 0.7, seed: 3, color: '#cdb88c', shadow: false });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.25;
      v.box('wood', 0.11, 0.08, 0.1, { p: [Math.cos(a) * 0.28, 0.17, Math.sin(a) * 0.2], r: [0, a, 0.2], color: '#6a4330', ao: 0, bevel: 0.03 });
    }
    v.add('paint', sc.kit.cylinder(0.012, 0.016, 0.3, 5), { p: [0, 0.32, 0], color: '#5c7a4a', ao: 0 });
    v.box('paint', 0.14, 0.02, 0.07, { p: [0.06, 0.46, 0], r: [0, 0, 0.5], color: '#6f9157', ao: 0 });
    v.box('paint', 0.12, 0.02, 0.06, { p: [-0.05, 0.42, 0], r: [0, 0, -0.5], color: '#6f9157', ao: 0 });
  }, 0.75);
  // 바위 위에 옥으로 새긴 연꽃이 핀다
  vignette('ok-yeonkkot', 0.3, 1.3, (v) => {
    sc.rock(v, { x: 0, z: 0, s: 0.48, flat: 0.8, seed: 0, color: '#8f8a80' });
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + ring * 0.4;
        const r = ring ? 0.09 : 0.17;
        v.box('paint', 0.1, 0.2 - ring * 0.04, 0.03, { p: [Math.cos(a) * r, 0.5 + ring * 0.05, Math.sin(a) * r], r: [0, -a + Math.PI / 2, ring ? 0.25 : 0.55], color: ring ? '#a9d1bf' : '#7fb3a0', ao: 0, bevel: 0.012 });
      }
    }
    v.add('paint', sc.kit.cylinder(0.05, 0.05, 0.06, 8), { p: [0, 0.55, 0], color: '#d8c27a', ao: 0 });
  }, 0.65);
  // 횃대에 건 무쇠 철릭(쇠로 지은 옷)
  vignette('musoe-cheollik', 1.12, 1.15, (v) => {
    v.add('wood', sc.kit.cylinder(0.03, 0.04, 1.6, 8), { p: [-0.5, 0.8, 0], color: '#5e4a3a' });
    v.add('wood', sc.kit.cylinder(0.03, 0.04, 1.6, 8), { p: [0.5, 0.8, 0], color: '#5e4a3a' });
    v.add('wood', sc.kit.cylinder(0.025, 0.025, 1.3, 8), { p: [0, 1.52, 0], r: [0, 0, Math.PI / 2], color: '#5e4a3a' });
    for (const dx of [-0.5, 0.5]) v.box('wood', 0.3, 0.06, 0.3, { p: [dx, 0.03, 0], color: '#4f3f32', ao: 0 });
    // 철릭: 어깨에서 넓게 퍼지는 쇠빛 옷(몸판 + 소매 + 아래 주름)
    v.box('stone', 0.5, 0.42, 0.12, { p: [0, 1.28, 0.02], color: '#6a6e71', ao: 0 });
    v.box('stone', 0.9, 0.12, 0.12, { p: [0, 1.46, 0.02], color: '#5f6366', ao: 0 });
    for (let i = 0; i < 6; i++) v.box('stone', 0.12, 0.62, 0.1, { p: [-0.3 + i * 0.12, 0.78, 0.03 + (i % 2) * 0.02], r: [0, 0, (i - 2.5) * 0.06], color: i % 2 ? '#72767a' : '#63676a', ao: 0 });
    sc.kit.contactShadow(v, { x: 0, z: 0, w: 1.6, d: 0.7 });
  }, 0.48);
  // 쇠풀을 뜯는 무쇠 소: 둥근 몸통·등혹, 고개 숙인 머리와 뿔, 네 다리, 꼬리. 발치에 쇠풀
  vignette('musoe-so', 1.9, 0.9, (v) => {
    const iron = '#6c7073';
    const dark = '#55595c';
    v.box('stone', 0.95, 0.4, 0.42, { p: [0, 0.6, 0], color: iron, ao: 0, bevel: 0.1 });
    v.box('stone', 0.4, 0.18, 0.36, { p: [0.18, 0.84, 0], color: iron, ao: 0, bevel: 0.07 });
    v.box('stone', 0.32, 0.3, 0.3, { p: [0.62, 0.42, 0], r: [0, 0, -0.7], color: dark, ao: 0, bevel: 0.08 });
    v.box('stone', 0.16, 0.14, 0.2, { p: [0.78, 0.26, 0], r: [0, 0, -0.7], color: '#4a4e51', ao: 0, bevel: 0.04 });
    for (const dz of [-1, 1]) {
      v.add('stone', sc.kit.cylinder(0.012, 0.03, 0.2, 5), { p: [0.6, 0.62, dz * 0.18], r: [dz * 0.9, 0, -0.3], color: '#d8d2c2', ao: 0 });
      for (const dx of [-0.34, 0.3]) v.add('stone', sc.kit.cylinder(0.05, 0.06, 0.42, 6), { p: [dx, 0.21, dz * 0.13], color: dark, ao: 0.3 });
    }
    v.add('stone', sc.kit.cylinder(0.015, 0.025, 0.42, 5), { p: [-0.52, 0.52, 0], r: [0, 0, 0.45], color: dark, ao: 0 });
    for (let i = 0; i < 12; i++) v.add('stone', sc.kit.cylinder(0.004, 0.022, 0.16 + (i % 3) * 0.05, 4), { p: [0.82 + (i % 4) * 0.07, 0.08, -0.16 + Math.floor(i / 4) * 0.14], r: [0, 0, (i % 2 ? 0.2 : -0.15)], color: '#3f4447', ao: 0 });
    sc.kit.contactShadow(v, { x: 0.1, z: 0, w: 1.7, d: 0.8 });
  }, 0.6);
  function showScene(id) {
    const h = scenes[id];
    if (!h || h.visible) return;
    h.visible = true;
    const size = h.userData.size;
    tween(620, (k) => { h.scale.setScalar(Math.max(0.001, size * easeOut(k) * (1 + Math.sin(k * Math.PI) * 0.12))); }, () => h.scale.setScalar(size));
  }

  root.add(group);

  // ── 움직임 ──
  const tweens = new Set();
  function tween(ms, step, done) {
    if (reduceMotion()) { step(1); done?.(); return; }
    tweens.add({ start: performance.now(), ms, step, done });
  }

  let lastAspect = null;
  function layout() {
    if (camera.aspect === lastAspect) return;
    lastAspect = camera.aspect;
    if (!camera.isPerspectiveCamera) return;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = tan * camera.position.distanceTo(target) * camera.aspect;
    stage.position.x = LEFT_CENTER_NDC * halfW;
    // 뒷벽이 화면을 덮도록 16:9를 지키며 키운다
    const dist = camera.position.distanceTo(backdrop.position);
    const viewH = 2 * tan * dist * 1.08;
    const w = Math.max(viewH * camera.aspect * 1.08, viewH * 16 / 9);
    backdrop.scale.set(w / 16, (w * 9 / 16) / 9, 1);
  }

  let raf = 0;
  let shake = 0;
  let last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    layout();
    nimFigure.update(Math.min(0.1, last ? (now - last) / 1000 : 0), camera);
    last = now;
    for (const t of [...tweens]) {
      const k = Math.min(1, (now - t.start) / t.ms);
      t.step(k);
      if (k >= 1) { tweens.delete(t); t.done?.(); }
    }
    if (shake > 0 && !reduceMotion()) {
      shake = Math.max(0, shake - 1 / 40);
      nim.rotation.z = Math.sin(now / 45) * 0.08 * shake;
    }
  }
  layout();
  raf = requestAnimationFrame(frame);

  return {
    placeCard(card, index) {
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.name = 'rg-card-' + card.id;
      const tex = own(new THREE.CanvasTexture(labelCanvas(card.label)));
      tex.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(labelGeo, own(new THREE.MeshBasicMaterial({ map: tex })));
      label.position.set(0, 0, SLAB.d / 2 + 0.002);
      slab.add(label);
      const y = ALTAR.top + SLAB.h / 2 + index * (SLAB.h + SLAB.gap);
      slab.rotation.y = (index % 2 ? -1 : 1) * 0.06;
      slab.position.set(ALTAR.x, y + 1.6, 0);
      stage.add(slab);
      tween(520, (k) => { slab.position.y = y + 1.6 * (1 - easeOut(k)); });
      showScene(card.id);
    },
    object() { shake = 1; },
    speak() {},
    showFinal() {
      rock.visible = true;
      bead.visible = true;
      string.visible = true;
      setBeadY(BEAD_REST + 2.6);
      tween(1100, (k) => {
        // 떨어져 바위에 닿고, 한 번 살짝 튀었다가 앉는다
        const fall = Math.min(1, k / 0.7);
        let y = BEAD_REST + 2.6 * (1 - fall * fall);
        if (k > 0.7) y = BEAD_REST + Math.sin(((k - 0.7) / 0.3) * Math.PI) * 0.18;
        setBeadY(y);
      }, () => setBeadY(BEAD_REST));
    },
    showMatch() {
      tween(1200, (k) => { beadMat.emissiveIntensity = 0.15 + Math.sin(k * Math.PI) * 0.6; }, () => { beadMat.emissiveIntensity = 0.3; });
    },
    dispose() {
      cancelAnimationFrame(raf);
      tweens.clear();
      nimFigure.dispose();
      root.remove(group);
      disposeGroupGeometry(group);
      sc.dispose();
      for (const x of owned) x.dispose?.();
      owned.length = 0;
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.up.copy(saved.up);
      camera.updateMatrixWorld();
    },
  };
}
