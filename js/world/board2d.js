// 2D 그림 판(spec 14): 3D를 쓸 수 없는 기기에서 게임 전체를 이것으로 한다.
// 16:9 그림 판 위에 겹을 쌓는다: 관 그림(관 모형 create2D가 채움) → 누를 수 있는 자리 → 학생 종이 인형과 도착 표시.
// 3D와 같은 관 모형 약속(js/data/README.md 7.1)과 같은 조작을 쓴다. 좌표는 그림 판 기준 백분율 { x, y }이다.
import { WINGS, wingById } from '../data/wings.js';
import { getDancheong, meanDancheong } from './palette.js';
import { paperDollCanvas } from './sprites.js';
import { TUNING } from './tuning.js';

// 누를 자리 이름표. 관 모형이 쓰는 자리 열쇠는 모두 여기에 한국어 이름이 있어야 한다(영어 열쇠가 화면에 보이지 않게).
// floating·songs는 맞추기 전(normalizeWing을 거치지 않은) 관 모형이 anchors에 넣던 떠도는 노래 자리다.
const ANCHOR_LABELS = {
  slots: '칸',
  bonus: '덤 칸',
  basket: '바구니',
  returnedShelf: '돌아온 노래 선반',
  roomDoor: '작품 방 문',
  entrance: '기다리는 노래 자리',
  nextDoor: '다음 관 문',
  mentorSeat: '선대 사서의 자리',
  floating: '떠도는 노래',
  songs: '떠도는 노래',
};
const ANCHOR_LABEL_UNKNOWN = '자리';

const ASPECT = 16 / 9;
// 걸을 수 있는 띠(백분율)
const WALK = {
  corridor: { x0: 3, x1: 97, y0: 76, y1: 94 },
  wing: { x0: 4, x1: 96, y0: 40, y1: 95 },
};
const DOOR_Y = 50;

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

const doorX = (i) => 9 + i * (82 / (WINGS.length - 1));

export function createBoard2D({ view, assets, appearance = 'a', getWingModule, reduceMotion, onArrive }) {
  const board = el('div', 'board');
  const art = el('div', 'board-art');
  const hotspots = el('div', 'board-hotspots');
  const actors = el('div', 'board-actors');
  const marker = el('div', 'board-marker');
  marker.hidden = true;
  const doll = el('img', 'board-player');
  doll.alt = '';
  const kind = 'student-' + (appearance === 'b' ? 'b' : 'a');
  doll.src = assets.image('sprite/' + kind) ?? paperDollCanvas(kind).toDataURL();
  actors.append(marker, doll);
  board.append(art, hotspots, actors);
  view.append(board);

  const doorState = new Map(WINGS.map((w) => [w.id, w.id === 'entrance' ? 'open' : 'locked']));
  let place = 'corridor';
  let wingHandle = null;
  let wingArt = null;
  let target = null;        // { x, y, anchor }
  let freeMoving = false;
  let frames = 0;
  let measureFocusOn = false;
  const player = { x: 8, y: 86 };
  let facing = 1;

  function walk() {
    return place === 'corridor' ? WALK.corridor : WALK.wing;
  }

  function clamp(p) {
    const b = walk();
    return { x: Math.min(b.x1, Math.max(b.x0, p.x)), y: Math.min(b.y1, Math.max(b.y0, p.y)) };
  }

  function placeDoll() {
    doll.style.left = player.x + '%';
    doll.style.top = player.y + '%';
    doll.style.transform = `translate(-50%, -100%) scaleX(${facing})`;
  }

  function showMarker(p) {
    marker.style.left = p.x + '%';
    marker.style.top = p.y + '%';
    marker.hidden = false;
  }

  function setLevel(node, level) {
    node.style.setProperty('--dancheong', String(level));
  }

  // ── 재기 초점(반반 틀) ──
  // 관 모형의 measureFocus(그림 판 백분율)가 있으면 그림 판을 왼쪽 칸을 꽉 채우도록 키우고, 초점이 칸 가운데에 오도록 민다.
  // 그림 판 가장자리가 칸 안으로 들어오지 않게 민 거리를 제한한다. 초점이 없거나 반반 틀이 아니면 원래 크기로 둔다.
  function applyMeasureFocus() {
    const f = measureFocusOn && place !== 'corridor' ? wingHandle?.measureFocus : null;
    const vw = view.clientWidth;
    const vh = view.clientHeight;
    if (!f || typeof f.x !== 'number' || typeof f.y !== 'number' || !vw || !vh) {
      board.classList.remove('is-focused');
      for (const k of ['width', 'left', 'top']) board.style.removeProperty(k);
      return;
    }
    const bw = Math.max(vw, vh * ASPECT);
    const bh = bw / ASPECT;
    const left = Math.min(0, Math.max(vw - bw, vw / 2 - (f.x / 100) * bw));
    const top = Math.min(0, Math.max(vh - bh, vh / 2 - (f.y / 100) * bh));
    board.classList.add('is-focused');
    board.style.width = bw + 'px';
    // .board는 translate(-50%, -50%)로 가운데를 맞추므로 왼쪽 위 대신 가운데 자리를 준다.
    board.style.left = left + bw / 2 + 'px';
    board.style.top = top + bh / 2 + 'px';
  }
  const focusObserver = new ResizeObserver(() => { if (measureFocusOn) applyMeasureFocus(); });
  focusObserver.observe(view);

  // ── 회랑(그림 판 기본 장면) ──
  function buildCorridor() {
    art.replaceChildren();
    hotspots.replaceChildren();
    const scene = el('div', 'board-scene board-scene--corridor');
    const bg = assets.image('board/corridor');
    if (bg) scene.style.backgroundImage = `url("${bg}")`;
    scene.append(el('div', 'board-scene__wall'), el('div', 'board-scene__floor'));
    art.append(scene);
    WINGS.forEach((w, i) => {
      const b = el('button', 'board-door');
      b.type = 'button';
      b.dataset.wing = w.id;
      b.dataset.hotspot = 'door';
      b.dataset.state = doorState.get(w.id);
      b.style.left = doorX(i) + '%';
      b.style.top = DOOR_Y + '%';
      setLevel(b, getDancheong(w.id));
      const name = el('span', 'board-door__name');
      name.textContent = w.name;
      b.append(name);
      b.setAttribute('aria-label', w.name + (doorState.get(w.id) === 'locked' ? ' (잠김)' : ''));
      b.addEventListener('click', () => go({ x: doorX(i), y: WALK.corridor.y0 + 2 }, { key: 'door', wing: w.id }));
      hotspots.append(b);
    });
    setLevel(board, meanDancheong());
  }

  // ── 관 안 ──
  function buildHotspots(anchors) {
    hotspots.replaceChildren();
    if (!anchors) return;
    for (const [key, v] of Object.entries(anchors)) {
      if (key === 'camera' || !v) continue;
      const list = Array.isArray(v) ? v : [v];
      list.forEach((p, index) => {
        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
        const b = el('button', 'board-hotspot');
        b.type = 'button';
        b.dataset.hotspot = key;
        b.dataset.anchor = key;
        if (Array.isArray(v)) b.dataset.index = String(index);
        b.style.left = p.x + '%';
        b.style.top = p.y + '%';
        const label = (ANCHOR_LABELS[key] ?? ANCHOR_LABEL_UNKNOWN) + (Array.isArray(v) ? ' ' + (index + 1) : '');
        b.setAttribute('aria-label', label);
        b.title = label;
        const anchor = Array.isArray(v) ? { key, index } : { key };
        b.addEventListener('click', () => go(p, anchor));
        hotspots.append(b);
      });
    }
  }

  function unmountWing() {
    if (wingHandle) {
      try { wingHandle.dispose?.(); } catch (e) { console.error('[world] 관 모형 치우기 실패', e); }
    }
    wingHandle = null;
    wingArt?.remove();
    wingArt = null;
  }

  function enterWing(id) {
    const wing = wingById(id);
    if (!wing) return false;
    unmountWing();
    place = id;
    art.replaceChildren();
    wingArt = el('div', 'board-scene board-scene--wing');
    wingArt.dataset.wing = id;
    const bg = assets.image('board/' + id);
    if (bg) wingArt.style.backgroundImage = `url("${bg}")`;
    art.append(wingArt);
    const mod = getWingModule(id);
    if (typeof mod?.create2D === 'function') {
      try {
        wingHandle = mod.create2D({ container: wingArt, wing, assets, restored: getDancheong(id) >= 1, reduceMotion }) ?? null;
      } catch (e) {
        console.error('[world] 관 모형 만들기 실패', id, e);
        wingHandle = null;
      }
    } else {
      const name = el('p', 'board-scene__name');
      name.textContent = wing.name;
      wingArt.append(name);
    }
    buildHotspots(wingHandle?.anchors);
    applyMeasureFocus();
    setLevel(board, getDancheong(id));
    target = null;
    marker.hidden = true;
    freeMoving = false;
    Object.assign(player, { x: 50, y: 90 });
    placeDoll();
    return true;
  }

  function enterCorridor(fromWing = null) {
    const i = WINGS.findIndex((w) => w.id === (fromWing ?? place));
    unmountWing();
    place = 'corridor';
    buildCorridor();
    applyMeasureFocus();
    target = null;
    marker.hidden = true;
    freeMoving = false;
    Object.assign(player, { x: i >= 0 ? doorX(i) : 8, y: 86 });
    placeDoll();
  }

  function go(p, anchor = null) {
    const c = clamp(p);
    target = { ...c, anchor };
    showMarker(c);
    freeMoving = false;
    return c;
  }

  function anchorNear(pos) {
    if (place === 'corridor') {
      const i = WINGS.findIndex((_, k) => Math.abs(doorX(k) - pos.x) < 4);
      return i >= 0 && pos.y < WALK.corridor.y0 + 4 ? { key: 'door', wing: WINGS[i].id } : null;
    }
    const a = wingHandle?.anchors;
    if (!a) return null;
    let best = null;
    let bestD = TUNING.arriveAnchorRadius2D;
    for (const [key, v] of Object.entries(a)) {
      if (key === 'camera' || !v) continue;
      (Array.isArray(v) ? v : [v]).forEach((p, index) => {
        if (!p || typeof p.x !== 'number') return;
        const d = Math.hypot((p.x - pos.x) * ASPECT, p.y - pos.y);
        if (d < bestD) { bestD = d; best = Array.isArray(v) ? { key, index } : { key }; }
      });
    }
    return best;
  }

  function arrive(anchor) {
    marker.hidden = true;
    target = null;
    onArrive?.({ position: { x: player.x, y: player.y }, anchor: anchor ?? anchorNear(player), place });
  }

  function tapAt(clientX, clientY) {
    const r = board.getBoundingClientRect();
    return go({ x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 });
  }

  function frame(dt, input) {
    frames++;
    const speed = TUNING.boardSpeed;   // 그림 판 높이의 %/s. 가로 1%는 높이 1/ASPECT%와 같은 길이
    if (input.x || input.y) {
      const n = clamp({ x: player.x + (input.x * speed * dt) / ASPECT, y: player.y - input.y * speed * dt });
      if (Math.abs(input.x) > 0.05) facing = input.x < 0 ? -1 : 1;
      Object.assign(player, n);
      target = null;
      marker.hidden = true;
      freeMoving = true;
    } else {
      if (freeMoving) { freeMoving = false; arrive(null); }
      if (target) {
        const dx = (target.x - player.x) * ASPECT;
        const dy = target.y - player.y;
        const len = Math.hypot(dx, dy);
        const step = speed * dt;
        if (Math.abs(dx) > 0.05) facing = dx < 0 ? -1 : 1;
        if (len <= step || len < 0.05) {
          player.x = target.x;
          player.y = target.y;
          arrive(target.anchor);
        } else {
          player.x += (dx / len) * step / ASPECT;
          player.y += (dy / len) * step;
        }
      }
    }
    placeDoll();
    if (wingHandle?.update) {
      try { wingHandle.update(dt); } catch (e) { console.error('[world] 관 모형 update 실패', e); }
    }
  }

  function toScreen(p) {
    const r = board.getBoundingClientRect();
    return { x: r.left + (p.x / 100) * r.width, y: r.top + (p.y / 100) * r.height };
  }

  buildCorridor();
  placeDoll();

  return {
    mode: '2d',
    frame,
    tapAt,
    rotateBy() {},   // 그림 판은 돌리지 않는다
    enterWing,
    enterCorridor,
    moveTo: (p) => go(p),
    resize() { applyMeasureFocus(); },
    render() {},
    setMeasureFocus(on) {
      measureFocusOn = !!on;
      applyMeasureFocus();
    },
    forward(name, detail) {
      if (!wingHandle?.react) return;
      try { wingHandle.react(name, detail); } catch (e) { console.error('[world] 관 모형 react 실패', name, e); }
    },
    setWingState(id, state) {
      if (!doorState.has(id) || !state) return;
      doorState.set(id, state);
      const b = hotspots.querySelector(`.board-door[data-wing="${id}"]`);
      if (b) {
        b.dataset.state = state;
        b.setAttribute('aria-label', wingById(id).name + (state === 'locked' ? ' (잠김)' : ''));
      }
    },
    dancheongChanged(id) {
      const b = hotspots.querySelector(`.board-door[data-wing="${id}"]`);
      if (b) setLevel(b, getDancheong(id));
      setLevel(board, place === 'corridor' ? meanDancheong() : getDancheong(place));
    },
    shake(seconds = 0.4) {
      if (reduceMotion()) return false;
      board.classList.remove('is-shaking');
      void board.offsetWidth;
      board.style.setProperty('--shake-time', seconds + 's');
      board.classList.add('is-shaking');
      return true;
    },
    resetCamera() {},
    clearTarget() {
      target = null;
      marker.hidden = true;
    },
    getPlace: () => place,
    getPlayer: () => ({ x: player.x, y: player.y }),
    getMarker: () => ({ visible: !marker.hidden, x: (target?.x ?? parseFloat(marker.style.left)) || 0, y: (target?.y ?? parseFloat(marker.style.top)) || 0 }),
    getCamera: () => ({ yaw: 0, position: null, distanceToDesired: 0 }),
    getAnchors() {
      const a = wingHandle?.anchors;
      if (!a) return null;
      const out = {};
      for (const [k, v] of Object.entries(a)) if (k !== 'camera' && v) out[k] = v;
      return out;
    },
    getWingHandle: () => wingHandle,
    getThree: () => null,
    getStats: () => ({ drawCalls: 0, triangles: 0, frames, pixelRatio: 1, shadows: false }),
    getBoard: () => board,
    toScreen,
    dispose() {
      focusObserver.disconnect();
      unmountWing();
      board.remove();
    },
  };
}
