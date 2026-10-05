// 고려가요관 3D 모형(spec 3.1·6·8·14·17). 저폴리 상자를 코드로 쌓고, 되풀이되는 것은 InstancedMesh 하나로 그린다.
// 그리기 호출: 고정 상자 1, 움직이는 상자 1, 고리 1, 끈 1, 등불 1, 울림 1, 먹안개 1, 현판 1, 묶인 제목 0~2 → 8~10회.
import { SONG_CATALOG } from '../../data/song-table.js';
import { TOKENS, dancheongColor, getDancheong, mixHex, onDancheong } from '../palette.js';
import {
  AREAS, FEET_PER_LINE, L3, MAX_LINKS, STANZA_ROOMS, TIMES,
  advance, applyEvent, createState, linkProgress, linkedRooms, litGaps, popProgress, slot3D,
} from './goryeo-state.js';

const CORD_SEGMENTS = 14;
const HOOK_COUNT = STANZA_ROOMS;
const LAMP_BEADS = STANZA_ROOMS * FEET_PER_LINE;
const LAMP_LANTERNS = STANZA_ROOMS;   // 틈 일곱
const LAMP_SEAMS = STANZA_ROOMS;
const DYNAMIC_MAX = 96;

// 색(먹빛 ↔ 단청은 dancheongColor가 가른다). 녹청·주홍은 누를 수 있는 것(칸, 바구니, 고리, 작품 방 문)에만 쓴다.
const C = {
  wall: TOKENS.hanji,
  paper: TOKENS.hanjiDeep,
  wood: TOKENS.meokSoft,
  woodLight: mixHex(TOKENS.hanjiDeep, TOKENS.meokSoft, 0.45),
  roof: TOKENS.meok,
  floor: mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.25),
  floorAlt: mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.32),
  ghost: mixHex(TOKENS.hanji, TOKENS.meokFog, 0.45),
  band: TOKENS.meok,
  gold: TOKENS.gold,
  nok: TOKENS.nokcheong,
  ju: TOKENS.juhong,
  lampOff: TOKENS.meokSoft,
  fog: TOKENS.meokSoft,
};

const litColor = (level) => mixHex(TOKENS.hanji, TOKENS.gold, 0.3 + 0.45 * level);

// 한지 결 자리표시 무늬(그림 자산 texture/goryeo가 오기 전까지)
function placeholderTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.strokeStyle = 'rgba(90, 86, 80, 0.10)';
  g.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 128;
    const y = rnd() * 128;
    const a = rnd() * Math.PI;
    const l = 4 + rnd() * 10;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 뿌연 둥근 얼룩(먹안개)
function fogTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function fontFamily() {
  return (typeof document !== 'undefined' && getComputedStyle(document.body).fontFamily) || 'serif';
}

// 글자판(현판, 묶인 제목)
function textPlane(THREE, w, h, draw, pxPerM = 256) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * pxPerM);
  c.height = Math.round(h * pxPerM);
  draw(c.getContext('2d'), c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05 }));
  return mesh;
}

export function create3D(ctx) {
  const { THREE, root, wing } = ctx;
  const wingId = wing?.id ?? 'goryeo';
  const reduce = () => !!ctx.reduceMotion?.();
  const state = createState({ restored: !!ctx.restored || getDancheong(wingId) >= 1 });
  let level = ctx.restored ? Math.max(1, getDancheong(wingId)) : getDancheong(wingId);
  let time = 0;

  const group = new THREE.Group();
  group.name = 'goryeo-wing';
  root.add(group);
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  const ZERO = V(0, 0, 0);
  const UP = V(0, 1, 0);

  function setBox(mesh, i, b) {
    e.set(b.r?.[0] ?? 0, b.r?.[1] ?? 0, b.r?.[2] ?? 0);
    q.setFromEuler(e);
    m4.compose(V(...b.p), q, V(...b.s));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(dancheongColor(b.c, level)));
  }

  // ── 고정 상자: 연 방들, 복도, 서가 틀, 바구니, 돌아온 노래 선반, 받침대, 다음 관 문 ──
  const statics = [];
  const tags = {};
  const add = (p, s, c, r, tag) => { if (tag) tags[tag] = statics.length; statics.push({ p, s, c, r }); };

  // 관 바닥(마루 널 8×8장. 한 장으로 깔면 결 무늬가 크게 늘어나 얼룩처럼 보인다)
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) add([-5.6 + i * 1.6, 0.005, -5.6 + j * 1.6], [1.58, 0.02, 1.58], (i + j) % 2 ? C.floor : C.floorAlt);
  }

  // 똑같은 연 방 일곱: 모두 같은 함수로 같은 모양을 찍는다
  const R = L3.room;
  const zr = (R.zFront + R.zBack) / 2;
  const slope = Math.atan2(0.6, 1.0);
  for (let i = 0; i < STANZA_ROOMS; i++) {
    const x = L3.roomX(i);
    add([x, 0.1, zr], [R.w + 0.1, 0.2, R.d + 0.1], C.woodLight);                       // 바닥 단
    add([x, 0.2 + R.h / 2, R.zBack], [R.w, R.h, 0.08], C.wall);                         // 뒷벽
    add([x - R.w / 2, 0.2 + R.h / 2, zr], [0.08, R.h, R.d], C.wall);                    // 옆벽
    add([x + R.w / 2, 0.2 + R.h / 2, zr], [0.08, R.h, R.d], C.wall);
    add([x - 0.425, 0.2 + R.h / 2, R.zFront], [0.35, R.h, 0.06], C.paper);              // 앞 창살벽
    add([x + 0.425, 0.2 + R.h / 2, R.zFront], [0.35, R.h, 0.06], C.paper);
    add([x, 1.38, R.zFront], [0.5, 0.36, 0.06], C.paper);                               // 문 위 벽
    add([x - R.w / 2, 0.2 + R.h / 2, R.zFront], [0.1, R.h, 0.1], C.wood);               // 기둥
    add([x + R.w / 2, 0.2 + R.h / 2, R.zFront], [0.1, R.h, 0.1], C.wood);
    add([x, 1.8, zr + 0.5], [R.w + 0.3, 0.08, 1.17], C.roof, [slope, 0, 0]);    // 앞 지붕
    add([x, 1.8, zr - 0.5], [R.w + 0.3, 0.08, 1.17], C.roof, [-slope, 0, 0]);    // 뒤 지붕
    add([x, 2.12, zr], [R.w + 0.35, 0.1, 0.12], C.roof);                         // 용마루
    add([x, 1.52, R.zFront + 0.03], [R.w - 0.1, 0.06, 0.06], C.wood);                   // 고리 걸이 도리
  }

  // 복도(방 앞을 잇는 마루)와 등롱 기둥
  const CO = L3.corridor;
  add([(CO.x0 + CO.x1) / 2, CO.top / 2, (CO.z0 + CO.z1) / 2], [CO.x1 - CO.x0, CO.top, CO.z1 - CO.z0], C.woodLight);
  add([(CO.x0 + CO.x1) / 2, CO.top + 0.03, CO.z1], [CO.x1 - CO.x0, 0.06, 0.06], C.wood);
  for (let g = 0; g < LAMP_LANTERNS; g++) add([L3.gapX(g), 0.6, L3.lanternZ], [0.07, 1.0, 0.07], C.wood);

  // 작품 방 「정석가」: 더 큰 방, 문기둥(주홍)·인방(녹청)은 누를 수 있는 문이라 단청색
  const D = L3.roomDoor;
  const dz = (D.zFront + D.zBack) / 2;
  add([D.x, 0.1, dz], [D.w + 0.1, 0.2, D.d + 0.1], C.woodLight);
  add([D.x, 0.2 + D.h / 2, D.zBack], [D.w, D.h, 0.08], C.wall);
  add([D.x - D.w / 2, 0.2 + D.h / 2, dz], [0.08, D.h, D.d], C.wall);
  add([D.x + D.w / 2, 0.2 + D.h / 2, dz], [0.08, D.h, D.d], C.wall);
  add([D.x - 0.68, 0.2 + D.h / 2, D.zFront], [0.34, D.h, 0.06], C.paper);
  add([D.x + 0.68, 0.2 + D.h / 2, D.zFront], [0.34, D.h, 0.06], C.paper);
  add([D.x - 0.47, 0.2 + D.h / 2, D.zFront + 0.02], [0.12, D.h, 0.12], C.ju, null, 'roomDoorPost');
  add([D.x + 0.47, 0.2 + D.h / 2, D.zFront + 0.02], [0.12, D.h, 0.12], C.ju);
  add([D.x, 1.78, D.zFront + 0.02], [1.08, 0.16, 0.14], C.nok, null, 'roomDoorLintel');
  add([D.x, 2.05, dz + 0.55], [D.w + 0.4, 0.08, 1.3], C.roof, [slope, 0, 0]);
  add([D.x, 2.05, dz - 0.55], [D.w + 0.4, 0.08, 1.3], C.roof, [-slope, 0, 0]);
  add([D.x, 2.36, dz], [D.w + 0.45, 0.1, 0.12], C.roof);

  // 칸·덤 서가 틀
  for (const area of ['shelf', 'bonus']) {
    const s = L3.shelves[area];
    const W = s.pitch * 3 - 0.1;
    const yTop = s.y0 + s.innerH;
    add([s.cx, s.y0 / 2, s.cz], [W, s.y0, s.depth], C.wood);                                       // 받침
    add([s.cx, yTop + 0.05, s.cz], [W, 0.1, s.depth], C.wood);                                      // 윗판
    add([s.cx, (s.y0 + yTop) / 2, s.cz - s.depth / 2], [W, s.innerH, 0.04], C.wall);                // 뒤판
    add([s.cx - W / 2, (s.y0 + yTop) / 2, s.cz], [0.08, s.innerH + 0.1, s.depth], C.wood);
    add([s.cx + W / 2, (s.y0 + yTop) / 2, s.cz], [0.08, s.innerH + 0.1, s.depth], C.wood);
    for (const k of [-0.5, 0.5]) add([s.cx + k * s.pitch, (s.y0 + yTop) / 2, s.cz], [0.05, s.innerH, s.depth - 0.04], C.wood);
    for (let i = 0; i < 3; i++) {
      add([s.cx + (i - 1) * s.pitch, s.y0 + 0.02, s.cz + s.depth / 2], [s.compW * 0.9, 0.04, 0.04], area === 'shelf' ? C.nok : C.ju, null, area === 'shelf' && i === 0 ? 'shelfTrim' : null);
    }
  }

  // 바구니(두 자리)
  const B = L3.basket;
  add([B.cx, 0.04, B.cz], [B.w, 0.08, B.d], C.woodLight);
  add([B.cx, B.h / 2, B.cz + B.d / 2], [B.w, B.h, 0.05], C.nok, null, 'basketFront');
  add([B.cx, B.h / 2, B.cz - B.d / 2], [B.w, B.h, 0.05], C.woodLight);
  add([B.cx - B.w / 2, B.h / 2, B.cz], [0.05, B.h, B.d], C.woodLight);
  add([B.cx + B.w / 2, B.h / 2, B.cz], [0.05, B.h, B.d], C.woodLight);
  for (const y of [0.15, 0.3]) add([B.cx, y, B.cz + B.d / 2 + 0.03], [B.w, 0.03, 0.02], C.wood);   // 엮은 결

  // 돌아온 노래 선반(낮은 선반과 빈 책등 둘)
  const RS = L3.returnedShelf;
  add([RS.cx, 0.35, RS.cz], [0.9, 0.7, 0.45], C.wood);
  add([RS.cx, 0.72, RS.cz], [1.0, 0.06, 0.5], C.woodLight);
  add([RS.cx - 0.15, 0.95, RS.cz - 0.1], [0.14, 0.42, 0.04], C.ghost);
  add([RS.cx + 0.12, 0.95, RS.cz - 0.1], [0.14, 0.42, 0.04], C.ghost);

  // 기다리는 노래 받침대(미리 잰 노래 자리)
  const LE = L3.lectern;
  add([LE.x, 0.4, LE.z], [0.12, 0.8, 0.12], C.wood);
  add([LE.x, 0.84, LE.z], [0.7, 0.05, 0.45], C.woodLight, [-0.35, 0, 0]);

  // 다음 관 문(오른쪽 앞)
  const ND = L3.nextDoor;
  add([ND.x, 1.1, ND.z - 0.55], [0.14, 2.2, 0.14], C.ju);
  add([ND.x, 1.1, ND.z + 0.55], [0.14, 2.2, 0.14], C.ju);
  add([ND.x, 2.25, ND.z], [0.18, 0.16, 1.4], C.nok);

  const wingTex = ctx.assets?.texture?.('texture/' + wingId) ?? track(placeholderTexture(THREE));
  const staticMat = track(new THREE.MeshLambertMaterial({ map: wingTex }));
  const staticGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const staticMesh = new THREE.InstancedMesh(staticGeo, staticMat, statics.length);
  staticMesh.name = 'goryeo-static';
  staticMesh.frustumCulled = false;
  staticMesh.userData.tags = tags;
  staticMesh.userData.base = statics.map((b) => b.c);
  group.add(staticMesh);
  function paintStatics() {
    statics.forEach((b, i) => setBox(staticMesh, i, b));
    staticMesh.instanceMatrix.needsUpdate = true;
    staticMesh.instanceColor.needsUpdate = true;
  }

  // ── 움직이는 상자: 책등, 묶음 실, 금박, 삐져나온 모양, 바구니 행선지 표, 작품 방 문짝 ──
  const dynMat = track(new THREE.MeshLambertMaterial());
  const dynMesh = new THREE.InstancedMesh(staticGeo, dynMat, DYNAMIC_MAX);
  dynMesh.name = 'goryeo-dynamic';
  dynMesh.frustumCulled = false;
  dynMesh.setColorAt(0, col.set('#ffffff'));
  group.add(dynMesh);

  const TO_COLORS = { hyangga: C.gold, goryeo: C.nok, sijo: C.ju, gasa: C.wood, saseol: C.roof };

  // 갈래마다 다른 '삐져나온 모양'(spec 6.1). 칸 앞(+z)과 위로 튀어나온다. k는 0~1.
  function popPieces(sl, genre, k) {
    const { x, y, z, w, h, d } = sl;
    const out = [];
    const third = h / 3;
    switch (genre) {
      case 'saseol':   // 사설시조: 가운데 장(중장)만 길게 늘어나 서가 밖으로 튀어나온다
        out.push({ p: [x, y + third, z], s: [w, third - 0.02, d], c: C.paper });
        out.push({ p: [x, y, z + 0.65 * k], s: [w * 1.05, third - 0.02, d + 1.3 * k], c: C.woodLight });
        out.push({ p: [x, y - third, z], s: [w, third - 0.02, d], c: C.paper });
        break;
      case 'sijo':     // 시조: 짧은 세 장이 한 덩이로 앞으로 기울어 빠진다
        for (let j = 0; j < 3; j++) out.push({ p: [x, y + (1 - j) * third * 0.8, z + 0.45 * k], s: [w, third * 0.72, d * 0.8], c: C.paper, r: [0.35 * k, 0, 0] });
        break;
      case 'gasa':     // 가사: 끝없이 이어져 위로 길게 솟는다
        out.push({ p: [x, y + 0.8 * k, z + 0.15 * k], s: [w * 0.9, h + 1.6 * k, d * 0.9], c: C.paper, r: [0.12 * k, 0, 0] });
        break;
      case 'hyangga':  // 향가: 층이 쌓인 탑 모양으로 위로 솟는다
        [1.5, 1.15, 0.8].forEach((f, j) => out.push({ p: [x, y - third + j * third + 0.6 * k, z + 0.25 * k], s: [w * f, third * 0.9, d * 0.9], c: C.paper }));
        break;
      case 'goryeo':   // 고려가요: 똑같은 연 덩이가 옆으로 줄지어 빠진다
        for (let j = 0; j < 4; j++) out.push({ p: [x + (j - 1.5) * (0.06 + 0.32 * k), y, z + 0.4 * k], s: [w * 0.85, h * 0.5, d * 0.6], c: C.paper });
        break;
      default:
        out.push({ p: [x, y, z + 0.5 * k], s: [w, h, d], c: C.paper });
    }
    return out;
  }

  function dynamicBoxes() {
    const out = [];
    for (const area of Object.keys(AREAS)) {
      for (let i = 0; i < AREAS[area]; i++) {
        const sl = slot3D(area, i);
        const pop = state.pops.find((p) => p.area === area && p.index === i);
        const filled = state.slots[area][i];
        if (pop) {
          out.push(...popPieces(sl, pop.genre, popProgress(pop)));
        } else if (filled) {
          // 꽂힌 노래: 제목 없는 책등(제목은 묶인 뒤에 나타난다, spec 8)
          out.push({ p: [sl.x, sl.y, sl.z], s: [sl.w, sl.h, sl.d], c: C.paper });
          for (const f of [-0.36, 0.36]) out.push({ p: [sl.x, sl.y + f * sl.h, sl.z + sl.d / 2 + 0.005], s: [sl.w + 0.01, 0.035, 0.02], c: C.band });
          if (area === 'basket' && filled.to) out.push({ p: [sl.x, sl.y + sl.h / 2 + 0.08, sl.z + sl.d / 2], s: [0.16, 0.12, 0.02], c: TO_COLORS[filled.to] ?? C.wood });
        } else if (area !== 'basket') {
          // 빈자리: 제목 없는 빈 책등
          out.push({ p: [sl.x, sl.y, sl.z - sl.d / 2 + 0.03], s: [sl.w * 0.92, sl.h * 0.96, 0.04], c: C.ghost });
        }
      }
    }
    for (const area of ['shelf', 'bonus']) {
      if (!state.bound[area]) continue;
      const s = L3.shelves[area];
      const a = slot3D(area, 0);
      const front = a.z + a.d / 2 + 0.035;
      for (const f of [0.1, 0.84]) out.push({ p: [s.cx, s.y0 + a.h * f, front], s: [s.pitch * 2.4, 0.025, 0.025], c: C.band });   // 묶음 실
      for (let i = 0; i < 3; i++) {
        const sl = slot3D(area, i);
        out.push({ p: [sl.x, sl.y + sl.h * 0.44, sl.z + sl.d / 2 + 0.008], s: [sl.w * 0.75, 0.06, 0.01], c: C.gold });   // 금박
      }
    }
    // 작품 방 문짝 둘: 닫힘 → 열림(안쪽으로 젖힌다)
    const k = state.doorLevel;
    for (const side of [-1, 1]) {
      out.push({
        p: [D.x + side * (0.21 + 0.18 * k), 0.2 + 0.7, D.zFront - 0.25 * k],
        s: [0.42, 1.4, 0.05],
        c: C.roof,
        r: [0, side * -1.25 * k, 0],
      });
    }
    return out.slice(0, DYNAMIC_MAX);
  }

  function paintDynamic() {
    const list = dynamicBoxes();
    list.forEach((b, i) => setBox(dynMesh, i, b));
    dynMesh.count = list.length;
    dynMesh.instanceMatrix.needsUpdate = true;
    dynMesh.instanceColor.needsUpdate = true;
  }

  // ── 고리: 방마다 고리 걸이(작은 고리) + 걸린 후렴 고리(끈 양 끝) ──
  const ringGeo = track(new THREE.TorusGeometry(1, 0.22, 6, 14));
  const ringMat = track(new THREE.MeshLambertMaterial());
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, HOOK_COUNT + MAX_LINKS * 2);
  rings.name = 'goryeo-rings';
  rings.frustumCulled = false;
  rings.setColorAt(0, col.set('#ffffff'));
  group.add(rings);

  // ── 끈: 고리 사이를 복도 쪽으로 처지며 잇는 마디들 ──
  const cordGeo = track(new THREE.CylinderGeometry(0.022, 0.022, 1, 5));
  const cordMat = track(new THREE.MeshLambertMaterial());
  const cords = new THREE.InstancedMesh(cordGeo, cordMat, MAX_LINKS * CORD_SEGMENTS);
  cords.name = 'goryeo-cords';
  cords.frustumCulled = false;
  cords.count = 0;
  cords.setColorAt(0, col.set('#ffffff'));
  group.add(cords);

  const hookPos = (room) => V(L3.roomX(room), L3.hookY, L3.hookZ);

  // 끈 k번째의 곡선(이차 베지어). 두 방 사이 복도로 처진다. 같은 방이면 작은 고리 모양으로 처진다.
  function cordCurve(l, slot) {
    let A = hookPos(l.a);
    let B = hookPos(l.b);
    if (l.same) { A = A.clone().add(V(-0.2, 0, 0)); B = B.clone().add(V(0.2, 0, 0)); }
    const tier = slot % 3;
    const span = Math.abs(B.x - A.x);
    const midY = l.same ? 0.85 : Math.max(0.55, 1.0 - 0.04 * span) - 0.1 * tier;
    const midZ = -3.55 + 0.18 * tier;
    const M = V((A.x + B.x) / 2, midY, midZ);
    const Cc = V(2 * M.x - (A.x + B.x) / 2, 2 * M.y - (A.y + B.y) / 2, 2 * M.z - (A.z + B.z) / 2);
    return (t) => {
      const u = 1 - t;
      return V(u * u * A.x + 2 * u * t * Cc.x + t * t * B.x, u * u * A.y + 2 * u * t * Cc.y + t * t * B.y, u * u * A.z + 2 * u * t * Cc.z + t * t * B.z);
    };
  }

  function paintLinks() {
    const linked = linkedRooms(state);
    // 고리 걸이
    for (let i = 0; i < HOOK_COUNT; i++) {
      const p = hookPos(i);
      m4.compose(V(p.x, p.y + 0.1, p.z + 0.02), q.identity(), V(0.06, 0.06, 0.06));
      rings.setMatrixAt(i, m4);
      rings.setColorAt(i, col.set(dancheongColor(linked.has(i) ? C.ju : C.wood, level)));
    }
    let r = HOOK_COUNT;
    let seg = 0;
    state.links.forEach((l, k) => {
      const curve = cordCurve(l, k);
      const prog = linkProgress(l);
      const shown = Math.ceil(prog * CORD_SEGMENTS);
      for (let sIdx = 0; sIdx < CORD_SEGMENTS; sIdx++) {
        const p0 = curve(sIdx / CORD_SEGMENTS);
        const p1 = curve((sIdx + 1) / CORD_SEGMENTS);
        const dir = p1.clone().sub(p0);
        const len = dir.length();
        if (sIdx < shown && len > 1e-6) {
          q.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
          m4.compose(p0.clone().add(p1).multiplyScalar(0.5), q, V(1, len * 1.02, 1));
        } else {
          m4.compose(p0, q.identity(), ZERO);
        }
        cords.setMatrixAt(seg, m4);
        cords.setColorAt(seg, col.set(dancheongColor(C.nok, level)));
        seg++;
      }
      // 끈 양 끝에 걸린 후렴 고리(끈이 다 이어지면 끝 고리도 걸린다)
      const ends = [curve(0), curve(1)];
      ends.forEach((p, j) => {
        const on = j === 0 || prog >= 1;
        const sc = on ? 0.1 : 0;
        m4.compose(V(p.x, p.y - 0.02, p.z + 0.04), q.identity(), V(sc, sc, sc));
        rings.setMatrixAt(r, m4);
        rings.setColorAt(r, col.set(dancheongColor(C.ju, level)));
        r++;
      });
    });
    rings.count = r;
    cords.count = seg;
    rings.instanceMatrix.needsUpdate = true;
    rings.instanceColor.needsUpdate = true;
    cords.instanceMatrix.needsUpdate = true;
    if (cords.instanceColor) cords.instanceColor.needsUpdate = true;
  }

  // ── 등불: 방마다 음보 구슬 셋(두드리기), 틈마다 등롱(후렴 울림), 접힌 경계의 빛줄기 ──
  const lampGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const lampMat = track(new THREE.MeshBasicMaterial());
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, LAMP_BEADS + LAMP_LANTERNS + LAMP_SEAMS);
  lamps.name = 'goryeo-lamps';
  lamps.frustumCulled = false;
  lamps.setColorAt(0, col.set('#ffffff'));
  group.add(lamps);

  function paintLamps() {
    const lit = litColor(level);
    const off = dancheongColor(C.lampOff, level);
    let i = 0;
    for (let room = 0; room < STANZA_ROOMS; room++) {
      for (let f = 0; f < FEET_PER_LINE; f++) {
        const on = state.beads.has(room + ':' + f);
        const s = on ? 0.11 : 0.08;
        m4.compose(V(L3.roomX(room) + (f - 1) * L3.beadDx, L3.beadY, L3.beadZ), q.identity(), V(s, s, s));
        lamps.setMatrixAt(i, m4);
        lamps.setColorAt(i, col.set(on ? lit : off));
        i++;
      }
    }
    const gaps = litGaps(state);
    for (let g = 0; g < LAMP_LANTERNS; g++) {
      const on = gaps.has(g) || (g === LAMP_LANTERNS - 1 && state.roomOpen);
      m4.compose(V(L3.gapX(g), L3.lanternY, L3.lanternZ), q.identity(), V(0.2, 0.26, 0.2));
      lamps.setMatrixAt(i, m4);
      lamps.setColorAt(i, col.set(on ? lit : off));
      i++;
    }
    for (let room = 0; room < STANZA_ROOMS; room++) {
      const on = state.seams.has(room);
      m4.compose(V(L3.seamX(room), 0.95, R.zFront - 0.02), q.identity(), on ? V(0.06, 1.4, 0.06) : ZERO);
      lamps.setMatrixAt(i, m4);
      lamps.setColorAt(i, col.set(lit));
      i++;
    }
    lamps.instanceMatrix.needsUpdate = true;
    lamps.instanceColor.needsUpdate = true;
  }

  // ── 후렴 울림: 복도를 따라 지나가는 고리 물결 ──
  const rippleGeo = track(new THREE.TorusGeometry(1, 0.06, 6, 20));
  const rippleMat = track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }));
  const ripples = new THREE.InstancedMesh(rippleGeo, rippleMat, 4);
  ripples.name = 'goryeo-ripples';
  ripples.frustumCulled = false;
  ripples.count = 0;
  group.add(ripples);

  function paintRipples() {
    rippleMat.color.set(litColor(level));
    state.ripples.forEach((rp, i) => {
      const t = Math.min(1, rp.age / TIMES.ripple);
      const ax = L3.roomX(rp.a);
      const bx = rp.a === rp.b ? ax + 0.01 : L3.roomX(rp.b);
      const x = ax + (bx - ax) * t;
      const sc = 0.25 + 0.35 * Math.sin(Math.PI * t);
      e.set(0, Math.PI / 2, 0);
      q.setFromEuler(e);
      m4.compose(V(x, 0.9, -3.6), q, V(sc, sc, sc));
      ripples.setMatrixAt(i, m4);
    });
    ripples.count = state.ripples.length;
    ripples.instanceMatrix.needsUpdate = true;
  }

  // ── 먹안개 ──
  const fogTex = track(fogTexture(THREE));
  const fogMat = track(new THREE.MeshBasicMaterial({ map: fogTex, color: C.fog, transparent: true, opacity: 0.55, depthWrite: false }));
  const fogGeo = track(new THREE.PlaneGeometry(1, 1));
  const FOG = [
    { p: [-3.5, 0.2, -0.5], s: 6, flat: true }, { p: [2.5, 0.25, 1.5], s: 6.5, flat: true }, { p: [-1, 0.3, 3.5], s: 5.5, flat: true },
    { p: [4, 0.2, -1.5], s: 5, flat: true }, { p: [-4.5, 0.25, 3], s: 5, flat: true },
    { p: [-3, 1.0, -2.4], s: 5, flat: false }, { p: [1.5, 1.1, -2.5], s: 5.5, flat: false }, { p: [4.6, 1.0, -2.3], s: 4, flat: false },
  ];
  const fog = new THREE.InstancedMesh(fogGeo, fogMat, FOG.length);
  fog.name = 'goryeo-fog';
  fog.frustumCulled = false;
  group.add(fog);

  function paintFog() {
    fogMat.opacity = 0.55 * state.fogLevel;
    fog.visible = state.fogLevel > 0.001;
    FOG.forEach((f, i) => {
      const drift = reduce() ? 0 : Math.sin(time * 0.25 + i * 1.7) * 0.35;
      e.set(f.flat ? -Math.PI / 2 : 0, 0, 0);
      q.setFromEuler(e);
      m4.compose(V(f.p[0] + drift, f.p[1], f.p[2]), q, V(f.s, f.flat ? f.s : f.s * 0.45, 1));
      fog.setMatrixAt(i, m4);
    });
    fog.instanceMatrix.needsUpdate = true;
  }

  // ── 현판 「정석가」 ──
  const plaque = textPlane(THREE, 0.9, 0.3, (g, w, h) => {
    g.fillStyle = TOKENS.meok;
    g.fillRect(0, 0, w, h);
    g.fillStyle = TOKENS.hanji;
    g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = TOKENS.meok;
    g.font = `bold ${Math.round(h * 0.55)}px ${fontFamily()}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('「정석가」', w / 2, h / 2 + 2);
  });
  plaque.name = 'goryeo-plaque';
  plaque.position.set(D.x, 2.12, D.zFront + 0.4);
  plaque.rotation.x = -0.15;
  group.add(plaque);
  track(plaque.geometry); track(plaque.material); track(plaque.material.map);

  // ── 묶인 칸의 제목(묶이기 전에는 없다) ──
  const titles = {};
  function showTitles(area) {
    if (titles[area]) { group.remove(titles[area]); titles[area].geometry.dispose(); titles[area].material.map.dispose(); titles[area].material.dispose(); }
    const ids = state.bound[area];
    if (!ids) { delete titles[area]; return; }
    const s = L3.shelves[area];
    const a = slot3D(area, 0);
    const W = s.pitch * 3;
    const H = a.h * 0.62;
    const mesh = textPlane(THREE, W, H, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      ids.forEach((id, i) => {
        const t = (SONG_CATALOG[id]?.title ?? '').replace(/\s+/g, '');
        if (!t) return;
        const size = Math.min(w / 3 * 0.24, (h * 0.92) / t.length);
        g.fillStyle = TOKENS.meok;
        g.font = `bold ${Math.round(size)}px ${fontFamily()}`;
        g.textAlign = 'center';
        g.textBaseline = 'top';
        const cx = (i + 0.5) * (w / 3);
        [...t].forEach((ch, j) => g.fillText(ch, cx, h * 0.04 + j * size));
      });
    });
    mesh.name = 'goryeo-titles-' + area;
    mesh.position.set(s.cx, s.y0 + a.h * 0.47, a.z + a.d / 2 + 0.012);
    group.add(mesh);
    titles[area] = mesh;
  }

  function paintAll() {
    paintStatics();
    paintDynamic();
    paintLinks();
    paintLamps();
    paintRipples();
    paintFog();
  }
  paintAll();

  const offDancheong = onDancheong((id, v) => {
    if (id !== wingId) return;
    level = v;
    paintAll();
  });

  const anchors = {
    slots: [0, 1, 2].map((i) => { const s = slot3D('shelf', i); return V(s.x, s.y, s.z + 0.55); }),
    bonus: [0, 1, 2].map((i) => { const s = slot3D('bonus', i); return V(s.x, s.y, s.z + 0.5); }),
    basket: V(B.cx, 0.4, B.cz + 0.6),
    returnedShelf: V(RS.cx, 0.7, RS.cz + 0.5),
    roomDoor: V(D.x, 0.9, D.zFront + 0.6),
    entrance: V(LE.x, 0.85, LE.z),
    nextDoor: V(ND.x - 0.4, 1.0, ND.z),
    // 추가 제안(T8): 떠다니는 노래 자리, 재기 화면 왼쪽 반이 비출 곳(연 방 줄과 복도)
    songs: L3.songs.map(([x, z]) => V(x, 1.2, z)),
    focus: { position: V(-0.4, 4.4, 3.2), target: V(-0.4, 1.0, -3.9) },
    camera: { position: V(0, 7.4, 9.2), target: V(0, 0.8, -1.6) },
  };

  return {
    anchors,
    react(name, detail) {
      if (!applyEvent(state, name, detail)) return;
      if (name === 'diorama:shelf-bound') showTitles(detail.area);
      advance(state, 0, reduce());
      paintDynamic();
      paintLinks();
      paintLamps();
      paintRipples();
      paintFog();
    },
    update(dt) {
      time += dt;
      const changed = advance(state, dt, reduce());
      if (changed) {
        paintDynamic();
        paintLinks();
        paintLamps();
        paintRipples();
      }
      if (changed || (state.fogLevel > 0 && !reduce())) paintFog();
    },
    dispose() {
      offDancheong();
      for (const area of Object.keys(titles)) { titles[area].geometry.dispose(); titles[area].material.map.dispose(); titles[area].material.dispose(); }
      root.remove(group);
      for (const d of disposables) d?.dispose?.();
      for (const m of [staticMesh, dynMesh, rings, cords, lamps, ripples, fog]) m.dispose?.();
    },
  };
}
