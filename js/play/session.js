// 앱 하나에 하나뿐인 한 판 세션. 다른 화면(입구, 보스, 엔딩, 기록 화면)도 이것을 함께 쓴다.
//   createSession({ container, storage?, rooms?, wings?, manifest?, audioDeps?, clues? }) → Promise<세션>
//   세션: { store, progress, audio, world, manifest, songs, songById, notebook,
//          playWing(관 id), enterCorridor(), resume(), openNotebook(), openJournal(), openCollection(), dispose() }
//
// - 저장 엔진(store) 하나와 그 기록의 진행 엔진(progress) 하나를 만든다. 저장소는 로컬 저장소이고, 쓸 수 없으면(SecurityError 등)
//   이번 창 메모리로만 진행한다. 저장 실패 신호(save:failed)가 오면 "이 기기에 저장되지 않아요…"를 한 번만 알린다.
// - 소리 엔진 하나: 첫 조작에 소리 판을 열고(attachUnlock), 기기 설정을 적용하고, 장소마다 배경음을 튼다.
//   창이 숨으면 audio:pause, 돌아오면 audio:resume(reason: 'hidden').
// - 세계 바탕을 자산 목록(assets/manifest.json, 한 번만 읽는다)과 등록된 관 모형으로 띄운다.
// - 관 문과 단청은 기록에 맞춰 세계에 알린다(처음 띄울 때 wing:state를 기록 그대로 다시 낸다).
// 주소 인자나 점검용 입구는 없다. 점검은 로컬 저장소에 기록을 넣는 방식만 쓴다.
import * as bus from '../core/events.js';
import * as world from '../world/world.js';
import { createStore } from '../core/save.js';
import { openRecord } from '../core/progress.js';
import { createAudioEngine } from '../core/audio.js';
import { SONG_TABLE } from '../data/song-table.js';
import { PLAY_WING_IDS, wingById } from '../data/wings.js';
import { songs as registeredSongs, notebook as registeredNotebook } from '../data/songs/index.js';
import { registry } from '../registry.js';
import { el, button, openPanel } from './dom.js';
import { renderNotebook, renderJournal, renderCollection } from './screens.js';
import { createWingPlay } from './wing.js';
import { L } from './labels.js';

// 로컬 저장소. 사생활 보호 모드 등에서 읽기만 해도 오류(SecurityError)가 나면 null(이번 창 메모리로만 진행).
export function safeLocalStorage() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

// 자산 목록은 한 번만 읽는다. 읽지 못하면 null(모든 그림이 자리표시).
let manifestPromise = null;
export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(new URL('../../assets/manifest.json', import.meta.url))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return manifestPromise;
}

export async function createSession({
  container,
  storage,
  rooms = registry.rooms,
  wings = registry.wings,
  manifest,
  audioDeps,
  songs = registeredSongs,
  notebook = registeredNotebook,
  clues = () => [],
} = {}) {
  if (!container) throw new Error('한 판 세션: container가 필요하다');
  const offs = [];

  // ── 화면 겹(세계 위) ──
  const root = el('div', 'play');
  root.dataset.place = 'corridor';
  const hudBox = el('header', 'play-hud');
  const placeName = el('p', 'play-hud-place', L.corridor);
  const btns = el('div', 'play-hud-btns');
  const extras = el('div', 'play-hud-extras');
  const nbBtn = button('play-btn', L.notebook);
  nbBtn.dataset.open = 'notebook';
  const jBtn = button('play-btn', L.journal);
  jBtn.dataset.open = 'journal';
  const cBtn = button('play-btn', L.collection);
  cBtn.dataset.open = 'collection';
  btns.append(nbBtn, jBtn, cBtn, extras);
  hudBox.append(placeName, btns);
  const layer = el('div', 'play-layer');
  const notices = el('div', 'play-notices');
  root.append(hudBox, layer, notices);

  // ── 저장 실패 알림(한 번만) ──
  let noticeShown = false;
  function showSaveNotice() {
    if (noticeShown) return;
    noticeShown = true;
    const n = el('div', 'play-notice');
    n.setAttribute('role', 'alert');
    const close = button('play-notice-close', L.close);
    close.addEventListener('click', () => n.remove());
    n.append(el('p', 'play-notice-text', L.saveFailed), close);
    notices.append(n);
  }
  offs.push(bus.on('save:failed', showSaveNotice));

  // ── 기록 ──
  const store = createStore({ storage: storage === undefined ? safeLocalStorage() : storage });
  store.load();
  const record = store.currentRecord();
  const progress = record ? openRecord(store, record.id) : null;
  const device = store.data.device;

  // ── 소리 ──
  const audio = createAudioEngine(audioDeps);
  const detachUnlock = audio.attachUnlock(document);
  audio.applySettings(device);
  const rhythm = { engine: audio, offsetMs: device.calibrationOffsetMs ?? 0 };
  const setSlashMode = (v) => {
    store.updateDevice({ slashMode: !!v });
    audio.setSlashMode(!!v);
  };
  let hiddenPaused = false;
  const onVisibility = () => {
    if (document.hidden && !hiddenPaused) {
      hiddenPaused = true;
      bus.emit('audio:pause', { reason: 'hidden' });
    } else if (!document.hidden && hiddenPaused) {
      hiddenPaused = false;
      bus.emit('audio:resume', { reason: 'hidden' });
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ── 오답 도움(수첩 반짝임). 이번 창에서 받은 도움을 모아 수첩과 재기 화면에 넘긴다 ──
  const glows = [];
  offs.push(bus.on('help:notebook-glow', (d) => { if (d) glows.push({ wing: d.wing, genre: d.genre, conceptIds: [...(d.conceptIds ?? [])] }); }));

  // ── 세계 ──
  const mf = manifest !== undefined ? manifest : await loadManifest();
  const songMap = new Map(songs.map((s) => [s.id, s]));
  let current = null;   // 지금 관 한 판
  world.mount(container, {
    wings,
    manifest: mf,
    appearance: record?.appearance ?? 'a',
    reduceMotion: device.reduceMotion,
    onArrive: (a) => (current ? current.onArrive(a) : corridorArrive(a)),
  });
  container.append(root);
  for (const w of PLAY_WING_IDS) {
    const state = progress?.wingState(w) ?? 'locked';
    bus.emit('wing:state', { wing: w, state });
    world.setDancheong(w, state === 'done' ? 1 : 0);
  }

  // ── 위 띠 ──
  const hud = {
    extras,
    setPlace: (name) => { placeName.textContent = name; },
    glow: (on) => nbBtn.classList.toggle('is-glow', !!on),
  };

  // ── 겹 창(수첩·일지·도감·다시 듣기): 한 번에 하나 ──
  let panel = null;
  const session = {
    root, layer, hud, store, progress, audio, world, rhythm, setSlashMode, glows, rooms, notebook,
    table: SONG_TABLE,
    manifest: mf,
    songs,
    songById: (id) => songMap.get(id) ?? null,
    trackPanel: (p) => { panel = p; },
    forgetPanel: (p) => { if (panel === p) panel = null; },
    closePanel: () => { const p = panel; panel = null; p?.close(); },
    playWing,
    enterCorridor,
    resume,
    openNotebook,
    openJournal,
    openCollection,
    dispose,
  };

  function open(kind, title, fill) {
    session.closePanel();
    const p = openPanel(root, { kind, title, onClose: () => session.forgetPanel(p) });
    panel = p;
    fill(p.body);
    return p;
  }

  function openNotebook() {
    const genre = current ? wingById(current.wingId)?.genre ?? null : null;
    return open('notebook', L.notebookTitle, (body) => renderNotebook(body, { notebook, glows, genre }));
  }
  function openJournal() {
    return open('journal', L.journalTitle, (body) => renderJournal(body, { progress: progress?.progress, songs: songMap, clues: clues() ?? [], tutorialSongId: SONG_TABLE.tutorial }));
  }
  function openCollection() {
    return open('collection', L.collectionTitle, (body) => renderCollection(body, { progress: progress?.progress, songs: songMap, manifest: mf }));
  }
  nbBtn.addEventListener('click', () => { openNotebook(); hud.glow(false); });
  jBtn.addEventListener('click', () => openJournal());
  cBtn.addEventListener('click', () => openCollection());

  // ── 관과 회랑 ──
  function leaveCurrent() {
    session.closePanel();
    current?.dispose();
    current = null;
  }

  // 관 한 판을 연다. 잠긴 관이나 기록이 없으면 { ok: false }.
  function playWing(wingId) {
    if (!progress) return { ok: false, reason: 'no-record' };
    if (!PLAY_WING_IDS.includes(wingId)) return { ok: false, reason: 'bad-wing' };
    if (!progress.canEnter(wingId)) return { ok: false, reason: 'locked' };
    leaveCurrent();
    current = createWingPlay(session, wingId);
    return { ok: true };
  }

  function enterCorridor() {
    leaveCurrent();
    world.enterCorridor();
    world.setContext(null);
    audio.playBgm('entrance');
    root.dataset.place = 'corridor';
    delete root.dataset.wingState;
    hud.setPlace(L.corridor);
    layer.replaceChildren();
    extras.replaceChildren();
    return { ok: true };
  }

  // 회랑: 열린 관 문 앞에 서면 '들어가기'
  function corridorArrive(a) {
    const w = a?.anchor?.key === 'door' ? a.anchor.wing : null;
    if (w && PLAY_WING_IDS.includes(w) && progress?.canEnter(w)) {
      world.setContext(L.enter + ' — ' + wingById(w).name, () => { world.setContext(null); playWing(w); });
    } else {
      world.setContext(null);
    }
  }

  // 다시 열었을 때: 판 중인 관이 있으면 그 관으로(작품 방은 처음부터), 아니면 회랑.
  // 입구·보스·엔딩 장면은 그 화면을 만드는 작업이 resumeInfo로 이어 받는다.
  function resume() {
    const info = progress?.resumeInfo() ?? null;
    if (info?.scene === 'wing') return playWing(info.wing);
    return enterCorridor();
  }

  function dispose() {
    leaveCurrent();
    for (const off of offs) off?.();
    document.removeEventListener('visibilitychange', onVisibility);
    detachUnlock?.();
    world.dispose();
    audio.dispose();
    root.remove();
  }

  return session;
}
