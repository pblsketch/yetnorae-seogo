// 앱 흐름(spec 2, 3.2, 13, 20). 시작 화면부터 엔딩까지 장면을 잇는다.
//   시작 화면 → (처음 켜는 기기: 이어폰 안내·박자 맞추기) → 입구(튜토리얼을 마치지 않았으면)
//   → 회랑과 관(한 판 세션 js/play/session.js) → 다섯 관을 마치면 회랑 안쪽에 보스 문 → 보스(registry.screens.boss)
//   → 보스를 마치면 엔딩 → 서고 완성(관은 다시 들어갈 수 있고, 보스·엔딩은 다시 하지 않는다. 마지막 카드는 다시 받는다)
// 다시 열면 시작 화면에서 기록을 골라 있던 자리로 이어 간다(진행 엔진 resumeInfo). 보스 도중이면 회랑의 열린 보스 문 앞에서 이어 간다.
// 저장 엔진 하나와 소리 엔진 하나를 앱 전체가 함께 쓰고, 기록을 고를 때마다 그 기록의 한 판 세션을 새로 띄운다.
// 주소 인자나 점검용 입구는 없다.
import { createStore } from '../core/save.js';
import { createAudioEngine } from '../core/audio.js';
import { PLAY_WING_IDS } from '../data/wings.js';
import { buildFinalCard } from '../core/cards.js';
import { STORY } from '../data/story.js';
import { registry } from '../registry.js';
import { createSession, safeLocalStorage, loadManifest } from '../play/session.js';
import { showCard } from '../result/card-view.js';
import { installScreen } from '../world/screen.js';
import { el, button, spriteImg, ensureStyle, toast } from './dom.js';
import { applyDevice, openSettings } from './settings.js';
import { runCalibration } from './calibration.js';
import { renderStart } from './start-view.js';
import { fullscreenButton } from './fullscreen.js';
import { runEntrance } from './entrance.js';
import { runEnding } from './ending.js';

// 조정할 수 있는 값
export const STORY_TUNING = Object.freeze({
  jomMs: 6500,         // 먹안개 속 좀이 보이는 시간
  toastMs: 7000,
});

let app = null;   // 앱 하나

export async function startApp(container) {
  if (app) return app;
  await ensureStyle();
  installScreen();   // 가로 전용: 시작 화면에서도 세로면 '기기를 돌려 주세요'(spec 14)
  const store = createStore({ storage: safeLocalStorage() });
  store.load();
  const audio = createAudioEngine();
  audio.attachUnlock(document);
  applyDevice(store.data.device, audio);
  const manifest = await loadManifest();

  let session = null;
  let game = null;        // 지금 기록의 화면 겹과 정리할 것들
  let startView = null;
  let settings = null;

  app = { store, audio, get session() { return session; } };

  // ───────── 시작 화면 ─────────
  function showStart() {
    leaveGame();
    startView?.dispose();
    startView = null;
    container.replaceChildren();
    const credits = registry.screens.credits;
    startView = renderStart(container, {
      store,
      manifest,
      saveNotice: store.failure === 'unavailable' ? STORY.start.saveFailed : null,
      onOpen: (id) => { store.selectRecord(id); enterGame(); },
      onSettings: () => openDeviceSettings(container),
      onCredits: credits && typeof credits.show === 'function' ? () => openCredits(credits) : null,
    });
    audio.playBgm('start');
  }

  function openCredits(mod) {
    startView?.dispose();
    startView = null;
    container.replaceChildren();
    let handle = null;
    const back = () => { handle?.dispose?.(); showStart(); };
    handle = mod.show(container, { go: back, params: { back: 'start' } });
  }

  // 설정. 게임 중이면 '기록 목록으로', 서고 완성 뒤에는 '마지막 카드'도 둔다.
  function openDeviceSettings(host, extras = []) {
    settings?.close();
    settings = openSettings(host, {
      store,
      audio,
      extras,
      onClose: () => { settings = null; },
      onRecalibrate: () => runCalibration(host, { audio, store, step: 'calibrate', onOffset: setOffset }),
    });
  }

  function setOffset(ms) {
    if (session?.rhythm) session.rhythm.offsetMs = ms;
  }

  // ───────── 기록으로 들어가기 ─────────
  async function enterGame() {
    startView?.dispose();
    startView = null;
    container.replaceChildren();
    if (!store.data.device.calibrated) await runCalibration(container, { audio, store, step: 'earphone', onOffset: setOffset });

    const ac = new AbortController();
    const layer = el('div', 'story-layer');
    game = { ac, layer, observer: null, introsShown: new Set(), bossHost: null, bossHandle: null, scene: null };
    const g = game;
    session = await createSession({
      container,
      store,
      audio,
      manifest,
      clues: () => cluesFor(session),
      onCorridorArrive,
    });
    if (game !== g) { session?.dispose(); return; }
    container.append(layer);
    addHud();
    g.observer = new MutationObserver(() => onPlace(session.root.dataset.place));
    g.observer.observe(session.root, { attributes: true, attributeFilter: ['data-place'] });
    route();
  }

  function leaveGame() {
    settings?.close();
    if (!game) return;
    const g = game;
    game = null;
    g.ac.abort(new DOMException('기록 목록으로', 'AbortError'));
    g.observer?.disconnect();
    closeBoss(g, false);
    g.layer.remove();
    session?.dispose();
    session = null;
  }

  // 다시 열었을 때 어디서 이어 갈지(spec 20)
  function route() {
    const P = session.progress;
    const info = P?.resumeInfo() ?? { scene: 'entrance' };
    if (info.scene === 'wing') { session.resume(); return; }
    session.enterCorridor();
    if (info.scene === 'entrance' && !P.progress.tutorialDone) { playEntrance(); return; }
    // 보스 도중(다섯 관을 마치면 엔진이 곧바로 stage1로 둔다)이면 보스로 곧장 가지 않고 회랑에서 열린 보스 문을 보인다.
    // 문으로 들어가면 진행 엔진 enterBoss()가 마친 단계와 노래 기록은 두고 하던 노래부터 잇는다(spec 20).
    if (info.scene === 'boss') { syncBossDoor('corridor'); return; }
    if (info.scene === 'ending') { playEnding(); return; }
    if (info.scene === 'complete') say(STORY.complete.corridor);
  }

  // ───────── 위 띠: 전체 화면, 설정(게임 중에는 기록 목록으로·마지막 카드도) ─────────
  function addHud() {
    const btns = session.root.querySelector('.play-hud-btns');
    // 전체 화면을 쓸 수 없는 기기에서는 단추가 없다. 좁은 화면에서는 그림만 보이고 이름은 읽어 주기로 남는다.
    const fs = fullscreenButton('play-btn story-hud-fullscreen', { compact: true });
    if (fs) (btns ?? session.root).append(fs.el);
    const b = button('play-btn story-hud-settings', STORY.hud.settings);
    b.addEventListener('click', () => {
      const extras = [{ className: 'story-go-home', label: STORY.start.recordsTitle + ' 보기', run: () => showStart() }];
      if (session?.progress?.isCompleted()) extras.unshift({ className: 'story-open-final', label: STORY.hud.finalCard, run: () => showFinalCard() });
      openDeviceSettings(game.layer, extras);
    });
    (btns ?? session.root).append(b);
  }

  function say(text) {
    if (game) toast(game.layer, text, STORY_TUNING.toastMs);
  }

  // ───────── 장소가 바뀔 때: 보스 문, 관 들어가기 글, 먹안개 속 좀 ─────────
  function onPlace(place) {
    if (!game) return;
    syncBossDoor(place);
    game.layer.querySelector('.story-wing-intro')?.remove();
    const P = session.progress;
    if (!P || P.isCompleted()) return;
    if (PLAY_WING_IDS.includes(place)) {
      const ws = P.progress.wings[place];
      const fresh = ws.state === 'open' && !ws.shelfBound && ws.measured.length === 0
        && ![...ws.placements.shelf, ...ws.placements.basket].some(Boolean);
      if (fresh && !game.introsShown.has(place)) {
        game.introsShown.add(place);
        showWingIntro(place);
      }
      if (ws.state !== 'done') showJom('wing');
    } else if (place === 'corridor' && P.progress.tutorialDone && !P.isBossOpen()) {
      showJom('corridor');
    }
  }

  function showWingIntro(wingId) {
    const box = el('section', 'story-wing-intro');
    box.dataset.wing = wingId;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', STORY.wingIntro[wingId]);
    const close = button('story-btn story-wing-intro-close', STORY.wingIntroClose);
    close.addEventListener('click', () => box.remove(), { once: true });
    box.append(el('p', 'story-wing-intro-text', STORY.wingIntro[wingId]), close);
    game.layer.append(box);
  }

  function showJom(kind) {
    game.layer.querySelector('.story-jom')?.remove();
    const j = el('figure', 'story-jom');
    j.append(spriteImg(manifest, 'sprite/jom', 'story-jom-img', STORY.jom.alt), el('figcaption', 'story-jom-text', STORY.jom[kind]));
    game.layer.append(j);
    const g = game;
    setTimeout(() => { if (game === g) j.remove(); }, STORY_TUNING.jomMs);
  }

  // ───────── 회랑의 문: 입구(편지 다시 읽기), 보스 문 ─────────
  function onCorridorArrive(a) {
    if (a?.anchor?.key === 'door' && a.anchor.wing === 'entrance' && session?.progress?.progress.tutorialDone) {
      session.world.setContext(STORY.entrance.doorLabel, () => {
        session.world.setContext(null);
        runEntrance({ host: game.layer, session, manifest, signal: game.ac.signal, reread: true });
      });
      return true;
    }
    return false;
  }

  function syncBossDoor(place = session?.root.dataset.place) {
    if (!game) return;
    const P = session.progress;
    let door = game.layer.querySelector('.story-boss-door');
    const busy = !!game.layer.querySelector('.story-ending, .story-boss-host');
    const show = place === 'corridor' && !!P?.isBossOpen() && !busy;
    if (!show) { door?.remove(); return; }
    const done = P.progress.boss.state === 'done' || P.isCompleted();
    if (!door) {
      door = button('story-boss-door');
      door.addEventListener('click', () => { if (!door.disabled) openBoss(); });
      game.layer.append(door);
      if (!done && !game.bossToldOpen) { game.bossToldOpen = true; say(STORY.boss.opened); }
    }
    door.dataset.state = done ? 'done' : 'open';
    door.disabled = done;
    door.textContent = done ? STORY.boss.doorDone : STORY.boss.doorOpen;
  }

  // ───────── 보스(다른 작업의 화면 모듈) ─────────
  const bossModule = () => {
    const m = registry.screens.boss;
    return m && (typeof m.start === 'function' || typeof m.show === 'function') ? m : null;
  };

  // 보스 화면 약속(README '추가 제안(T18)'): start(ctx) → 약속, 또는 show(container, ctx) → { dispose }.
  // ctx: { session, container, signal, go(이름), params: { session } }. 끝나면(약속이 끝나거나 go를 부르면) 보스 상태를 보고
  // 보스를 마쳤으면 엔딩으로, 아니면 회랑으로 돌아간다.
  function openBoss() {
    const P = session?.progress;
    if (!game || !P || P.isCompleted() || P.progress.boss.state === 'done' || !P.isBossOpen()) return;
    const mod = bossModule();
    if (!mod) { say(STORY.boss.notReady); return; }
    const g = game;
    closeBoss(g, false);
    // 회랑에서 띄운 알림(예: '다섯 관을 모두 마쳤다')이 보스 화면 위에 남지 않게 거둔다
    g.layer.querySelectorAll('.story-toast').forEach((t) => t.remove());
    const host = el('div', 'story-boss-host');
    host.dataset.worldCover = '';   // 세계를 꽉 덮는다: 세계 바탕은 그리지 않는다(world.js '가림')
    g.layer.append(host);
    g.bossHost = host;
    g.layer.querySelector('.story-boss-door')?.remove();
    const bossAc = new AbortController();
    const onAbort = () => bossAc.abort(g.ac.signal.reason);
    g.ac.signal.addEventListener('abort', onAbort, { once: true });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      g.ac.signal.removeEventListener('abort', onAbort);
      closeBoss(g, true);
    };
    const ctx = { session, container: host, signal: bossAc.signal, go: () => finish(), params: { session } };
    g.bossAbort = bossAc;
    try {
      if (typeof mod.start === 'function') {
        Promise.resolve(mod.start(ctx)).catch((e) => { if (e?.name !== 'AbortError') console.error('[story] 보스 화면 실패', e); }).then(finish);
      } else {
        g.bossHandle = mod.show(host, ctx) ?? null;
      }
    } catch (e) {
      console.error('[story] 보스 화면을 열지 못함', e);
      finish();
    }
  }

  function closeBoss(g, andRoute) {
    if (!g?.bossHost) return;
    g.bossAbort?.abort(new DOMException('보스 화면을 닫음', 'AbortError'));
    g.bossHandle?.dispose?.();
    g.bossHost.remove();
    g.bossHost = null;
    g.bossHandle = null;
    g.bossAbort = null;
    if (!andRoute || game !== g) return;
    session.progress.leaveBoss();
    session.enterCorridor();
    if (session.progress.progress.boss.state === 'done') playEnding();
  }

  // ───────── 입구와 엔딩 ─────────
  async function playEntrance() {
    const g = game;
    await runEntrance({ host: g.layer, session, manifest, signal: g.ac.signal });
    if (game !== g) return;
    session.enterCorridor();
  }

  async function playEnding() {
    const g = game;
    g.layer.querySelector('.story-boss-door')?.remove();
    g.layer.querySelectorAll('.story-toast').forEach((t) => t.remove());
    await runEnding({ host: g.layer, session, manifest, signal: g.ac.signal });
    if (game !== g) return;
    session.enterCorridor();
    say(STORY.complete.corridor);
  }

  // 서고 완성 뒤 마지막 카드 다시 받기(지금의 기록으로 다시 그린다)
  function showFinalCard() {
    if (!game) return;
    const box = el('section', 'story-final-card');
    box.dataset.worldCover = '';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', STORY.hud.finalCardTitle);
    game.layer.append(box);
    const view = showCard(box, () => buildFinalCard(store.currentRecord()), { manifest, onClose: () => { view.dispose(); box.remove(); } });
  }

  function cluesFor(s) {
    const P = s?.progress;
    if (!P) return [];
    return PLAY_WING_IDS.filter((w) => P.wingState(w) === 'done').map((w) => STORY.clues[w]);
  }

  showStart();
  return app;
}
