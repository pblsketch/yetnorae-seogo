// 작품 방 「정석가」 3D 장면(spec 14). 부르는 쪽이 준 root에 저폴리 무대를 짓고, 그리기는 부르는 쪽(세계 바탕)이 한다.
// 무대: 그림 판을 걸어 둔 뒷벽, 마루, 기둥 둘, 임 종이 인형, 약속 탑(내세운 조건 카드가 판으로 쌓임), 구슬·끈·바위.
// 그리기 호출은 스무 번 안팎(목표 60회 이하), 그림자와 후처리는 없다.
// 화면 오른쪽 반은 방 패널이 덮으므로 무대를 화면 왼쪽 반 가운데로 민다(카메라 비율이 바뀌면 다시 맞춘다).
// 2D 겹(goryeo-2d.js)과 같은 손잡이를 돌려준다: placeCard, object, speak, showFinal, showMatch, dispose.
import { TOKENS } from '../world/palette.js';
import { paperDollCanvas } from '../world/sprites.js';

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

  // ── 마루와 기둥 ──
  const floor = new THREE.Mesh(own(new THREE.BoxGeometry(16, 0.16, 12)), own(new THREE.MeshLambertMaterial({ color: color(TOKENS.hanjiDeep) })));
  floor.name = 'rg-floor';
  floor.position.set(0.3, -0.08, 2.5); // 앞쪽으로 넉넉히 깔아 화면 아래가 비지 않게
  stage.add(floor);

  const pillars = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 8)), own(new THREE.MeshLambertMaterial({ color: color(TOKENS.meokSoft) })), 2);
  pillars.name = 'rg-pillars';
  const m = new THREE.Matrix4();
  [[-2.8, -1.2], [3.2, -1.2]].forEach(([x, z], i) => { m.makeTranslation(x, 1.6, z); pillars.setMatrixAt(i, m); });
  stage.add(pillars);

  // ── 임 종이 인형 ──
  const nimTex = own(new THREE.CanvasTexture(paperDollCanvas('nim')));
  nimTex.colorSpace = THREE.SRGBColorSpace;
  const nim = new THREE.Mesh(own(new THREE.PlaneGeometry(1.1, 2.2)), own(new THREE.MeshBasicMaterial({ map: nimTex, transparent: true, alphaTest: 0.4 })));
  nim.name = 'rg-nim';
  nim.position.set(-1.35, 1.1, 0.35);
  stage.add(nim);

  // ── 약속 탑: 받침 위에 카드 판이 쌓인다 ──
  const altar = new THREE.Mesh(own(new THREE.CylinderGeometry(0.85, 0.95, ALTAR.top, 8)), own(new THREE.MeshLambertMaterial({ color: color(TOKENS.meokSoft) })));
  altar.name = 'rg-altar';
  altar.position.set(ALTAR.x, ALTAR.top / 2, 0);
  stage.add(altar);
  const slabGeo = own(new THREE.BoxGeometry(SLAB.w, SLAB.h, SLAB.d));
  const slabMat = own(new THREE.MeshLambertMaterial({ color: color(TOKENS.hanji) }));
  const labelGeo = own(new THREE.PlaneGeometry(SLAB.w - 0.06, SLAB.h - 0.04));

  // ── 구슬·끈·바위(마지막 연) ──
  const rock = new THREE.Mesh(own(new THREE.DodecahedronGeometry(0.42, 0)), own(new THREE.MeshLambertMaterial({ color: color(TOKENS.meokFog) })));
  rock.name = 'rg-rock';
  rock.position.set(ROCK.x, 0.3, ROCK.z);
  rock.scale.set(1.2, 0.8, 1);
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
  function frame(now) {
    raf = requestAnimationFrame(frame);
    layout();
    for (const t of [...tweens]) {
      const k = Math.min(1, (now - t.start) / t.ms);
      t.step(k);
      if (k >= 1) { tweens.delete(t); t.done?.(); }
    }
    if (shake > 0 && !reduceMotion()) {
      shake = Math.max(0, shake - 1 / 40);
      nim.rotation.z = Math.sin(now / 45) * 0.08 * shake;
    } else nim.rotation.z = 0;
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
      root.remove(group);
      for (const x of owned) x.dispose?.();
      owned.length = 0;
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.up.copy(saved.up);
      camera.updateMatrixWorld();
    },
  };
}
