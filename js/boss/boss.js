// 보스전 「서고의 밤」(spec 10). 다섯 관을 모두 마치면 열리는 세 단계.
//   1단계 낯선 노래 다섯: 회색 글줄 → 재기(다섯 고유 동작을 도구로, 수첩 대신 일지) → 다섯 관 자리에 꽂기(노래마다 바로 판정)
//          → 맞으면 '누가 불렀을까?'(다섯 무리, 틀려도 정답 무리를 보이고 다음으로)
//   2단계 엉킨 낭송: 리믹스(js/data/remix.js)에서 갈래가 바뀌는 순간 짚기(js/boss/remix-stage.js)
//   3단계 좀 대왕: 「태산이 높다 하되」를 다시 재어 시조 자리에 꽂으면 좀 대왕이 흩어지고 선대 사서가 풀려난다
// 틀리면 먹안개가 잠시 짙어진다. 같은 단계에서 기준(3)만큼 틀리면 진행 엔진이 일지 도움 신호를 내고 일지가 반짝인다.
// 시간 제한도, 판이 끝나 버리는 실패도, 매기는 값도 없다. 무작위도 없다(노래 순서는 진행 엔진과 노래 표가 정한다).
// 판정과 기록은 모두 진행 엔진(js/core/progress.js)이 한다. 이 화면은 엔진의 결과를 보이기만 한다.
// 이어 하기(spec 20): 마친 단계와 1단계 노래별 기록은 엔진이 저장해 두고, 진행 중이던 노래·2단계·3단계는 처음부터 한다.
//
//   start(ctx) → Promise<{ completed, reason?, already? }>
//     ctx.session    한 판 세션(js/play/session.js). progress·audio·rhythm·world·songById·manifest·setSlashMode를 쓴다
//     ctx.container  보스 화면을 붙일 곳(없으면 session.root). 화면을 꽉 덮는다
//     ctx.signal     중단 신호. 중단되면 AbortError로 끝난다
//     ctx.rhythm     박자 손잡이(없으면 session.rhythm). { engine, buildGrid?, buildRemixGrid?, createRemixSession?, offsetMs? }
//   앱 흐름(README '추가 제안(T18)')은 start를 쓴다: ctx = { session, container(.story-boss-host), signal, go, params }.
//   끝나면(마쳤든 나갔든 약속이 끝나면) 앱이 leaveBoss()를 부르고, 보스를 마쳤으면 엔딩을 연다.
//   show(container, ctx)  화면 약속(README 7.4). ctx.session·ctx.params.session이 없으면 세션을 만든다.
//     마치면 ctx.go('ending', { session }), 닫혀 있거나 나가면 ctx.go('play', { session }).
import * as bus from '../core/events.js';
import { songText } from '../core/song-shape.js';
import { SONG_TABLE } from '../data/song-table.js';
import { PLAY_WING_IDS, wingById } from '../data/wings.js';
import { SINGER_GROUPS } from '../data/concepts.js';
import { remix as REMIX } from '../data/remix.js';
import { BOSS_TEXT as T, BOSS_SPEAKERS } from '../data/boss-text.js';
import { openMeasure } from '../measure/measure.js';
import { graphemes } from '../measure/text.js';
import { detectMode } from '../world/mode.js';
import { createSession } from '../play/session.js';
import { createScene2D } from './scene2d.js';
import { el, button, waitClick, waitPick, wingShape, createJournalDrawer } from './dom.js';
import { runRemixStage } from './remix-stage.js';

// 조정할 수 있는 값
export const BOSS_TUNING = Object.freeze({
  fogPulseMs: 1400,   // 틀린 뒤 먹안개가 짙어져 있는 시간(연출)
  erasedEvery: 3,     // 3단계 '지워진 글줄': 이 수마다 두 글자를 지운다(정해진 무늬)
});

const STAGES = ['stage1', 'stage2', 'stage3'];
const groupName = (id) => SINGER_GROUPS.find((g) => g.id === id)?.name ?? id;

export async function start(ctx = {}) {
  const session = ctx.session;
  if (!session) throw new Error('보스전: 세션이 필요하다');
  const host = ctx.container ?? session.root;
  const P = session.progress;
  const table = session.table ?? SONG_TABLE;
  const songById = (id) => session.songById?.(id) ?? null;
  const rhythm = ctx.rhythm ?? session.rhythm ?? null;
  const engine = rhythm?.engine ?? session.audio ?? null;
  const reduceMotion = () => !!(session.world?.reduceMotion?.() ?? document.getElementById('app')?.classList.contains('reduce-motion'));

  // 나가기와 바깥 중단을 하나로 묶는다
  const ac = new AbortController();
  const signal = ac.signal;
  let left = false;
  const onOuterAbort = () => ac.abort(ctx.signal.reason ?? new DOMException('중단', 'AbortError'));
  if (ctx.signal?.aborted) throw ctx.signal.reason ?? new DOMException('중단', 'AbortError');
  ctx.signal?.addEventListener('abort', onOuterAbort, { once: true });

  // ── 화면 뼈대 ──
  const root = el('section', 'boss');
  root.setAttribute('aria-label', T.title);
  Object.assign(root.dataset, { fog: 'normal', king: 'hidden', mentor: 'trapped', stage: 'locked' });
  // 보스 화면은 세계를 꽉 덮는다: 세계 바탕은 이 표시가 있는 동안 그리지 않는다(js/world/world.js '가림')
  root.dataset.worldCover = '';
  const sceneHost = el('div', 'boss-scene');
  const ui = el('div', 'boss-ui');
  const top = el('header', 'boss-top');
  const stageName = el('p', 'boss-stage-name', T.title);
  const topBtns = el('div', 'boss-top-btns');
  const leaveBtn = button('boss-leave', T.leave);
  top.append(stageName, topBtns);
  const mid = el('div', 'boss-mid');
  const speech = el('p', 'boss-speech');
  speech.setAttribute('aria-live', 'polite');
  speech.hidden = true;
  const shelf = el('div', 'boss-shelf');
  shelf.setAttribute('role', 'group');
  shelf.hidden = true;
  const slots = new Map();
  PLAY_WING_IDS.forEach((w, i) => {
    const wing = wingById(w);
    const b = button('boss-slot');
    b.dataset.wing = w;
    b.dataset.genre = wing.genre;
    b.dataset.index = String(i);
    b.setAttribute('aria-label', wing.name + ' 자리');
    b.append(wingShape(wing.genre), el('span', 'boss-slot-name', wing.name), el('span', 'boss-slot-book'));
    b.disabled = true;
    shelf.append(b);
    slots.set(w, b);
  });
  ui.append(top, mid, speech, shelf);
  const panel = el('div', 'boss-panel');
  root.append(sceneHost, ui, panel);
  host.append(root);
  // 한 판 화면의 위 띠(수첩 단추 포함)는 보스 동안 숨긴다: 수첩은 닫히고 일지만 보인다(spec 10.1)
  const hudHosts = [...new Set([host, session.root].filter(Boolean))];
  for (const h of hudHosts) h.classList.add('has-boss');

  // ── 장면(3D 또는 2D 그림 판) ──
  let scene = null;
  const wantMode = session.world?.getMode?.() ?? detectMode();
  if (wantMode === '3d') {
    try {
      const { createScene3D } = await import('./scene3d.js');
      scene = createScene3D(sceneHost, { manifest: session.manifest, reduceMotion });
    } catch (e) {
      console.warn('[boss] 3D 장면을 만들 수 없어 2D 그림 판으로 바꾼다', e);
      sceneHost.replaceChildren();
      scene = null;
    }
  }
  if (!scene) scene = createScene2D(sceneHost, { manifest: session.manifest });
  root.dataset.mode = scene.mode;

  // ── 일지(수첩은 닫힌다, spec 10.1) ──
  const journal = createJournalDrawer(root, {
    concepts: P?.progress?.concepts ?? {},
    onGlow: () => { if (!speech.hidden || STAGES.includes(root.dataset.stage)) say('mentor', helpText()); },
  });
  topBtns.append(journal.button, leaveBtn);
  leaveBtn.addEventListener('click', () => { left = true; ac.abort(new DOMException('보스전에서 나감', 'AbortError')); });

  // ── 작은 도우미 ──
  function say(speaker, text) {
    speech.replaceChildren();
    if (!text) { speech.hidden = true; return; }
    if (speaker && BOSS_SPEAKERS[speaker]) speech.append(el('span', 'boss-speaker', BOSS_SPEAKERS[speaker]));
    speech.append(el('span', 'boss-speech-text', text));
    speech.dataset.speaker = speaker ?? '';
    speech.hidden = false;
  }
  function helpText() {
    const s = root.dataset.stage;
    return s === 'stage2' ? T.stage2.help : s === 'stage3' ? T.stage3.help : T.stage1.help;
  }
  let fogTimer = 0;
  function fogPulse() {
    root.dataset.fog = 'thick';
    scene.setFog('thick');
    engine?.sfx?.('fog');
    clearTimeout(fogTimer);
    fogTimer = setTimeout(() => { root.dataset.fog = 'normal'; scene.setFog('normal'); }, BOSS_TUNING.fogPulseMs);
  }
  function setKing(v) { root.dataset.king = v; scene.setKing(v); }
  function setMentor(v) { root.dataset.mentor = v; scene.setMentor(v); }
  function setStage(s) {
    root.dataset.stage = s;
    stageName.textContent = T.stages[s]?.name ?? T.title;
  }
  function card(className) {
    const c = el('div', 'boss-card ' + className);
    mid.replaceChildren(c);
    return c;
  }
  function cardBody(c) {
    const b = el('div', 'boss-card-body boss-scroll');
    c.append(b);
    return b;
  }
  function showShelf(on) {
    shelf.hidden = !on;
  }
  function enableSlots(on) {
    for (const b of slots.values()) b.disabled = !on;
  }
  function clearSlots() {
    for (const [w, b] of slots) {
      b.classList.remove('is-filled', 'is-wrong');
      b.querySelector('.boss-slot-book').textContent = '';
      scene.setFilled(PLAY_WING_IDS.indexOf(w), false);
    }
  }
  function fillSlot(w, title) {
    const b = slots.get(w);
    b.classList.add('is-filled');
    b.querySelector('.boss-slot-book').textContent = title;
    scene.setFilled(PLAY_WING_IDS.indexOf(w), true);
  }
  function shakeSlot(w) {
    const b = slots.get(w);
    b.classList.remove('is-wrong');
    void b.offsetWidth;
    b.classList.add('is-wrong');
  }

  // 재기 화면(보스 방식): 오른쪽 반에 연다. 왼쪽 반에는 장면이 남는다.
  async function measure(song) {
    journal.close();
    root.classList.add('is-measuring');
    scene.resize();
    try {
      return await openMeasure({
        song,
        mode: 'boss',
        container: panel,
        rhythm,
        setSlashMode: session.setSlashMode,
        journal: { concepts: P.progress.concepts },
        journalGlow: journal.glowing(),
        reduceMotion,
        signal,
      });
    } finally {
      root.classList.remove('is-measuring');
      panel.replaceChildren();
      scene.resize();
    }
  }

  // 단계 안내: 이야기 몇 줄과 '시작하기'
  async function intro(stage) {
    setStage(stage);
    showShelf(false);
    say(null, '');
    const s = T.stages[stage];
    const c = card('boss-intro');
    c.dataset.stage = stage;
    c.append(el('h2', 'boss-card-title', s.name));
    const body = cardBody(c);
    for (const line of s.lines) {
      const p = el('p', 'boss-line');
      p.dataset.speaker = line.speaker;
      p.append(el('span', 'boss-speaker', BOSS_SPEAKERS[line.speaker] ?? ''), el('span', 'boss-line-text', line.text));
      body.append(p);
    }
    const go = button('boss-go', s.go);
    c.append(el('div', 'boss-card-actions', null));
    c.lastChild.append(go);
    go.focus?.();
    await waitClick(go, signal);
  }

  // 관 자리를 고를 때까지(비활성 자리는 넘긴다)
  const pickSlot = () => waitPick(shelf, '.boss-slot', signal).then((b) => b.dataset.wing);

  // ───────── 1단계 ─────────
  async function stage1() {
    await intro('stage1');
    const order = (table.boss.unseenOrder ?? []).map((g) => table.boss.unseen[g]);
    while (P.progress.boss.state === 'stage1') {
      const id = P.currentUnseen();
      const song = songById(id);
      if (!song) throw new Error('보스전: 낯선 노래가 없다 ' + id);
      clearSlots();
      enableSlots(false);
      showShelf(true);
      const c = card('boss-song');
      c.dataset.song = id;
      c.append(el('p', 'boss-card-label', T.stage1.unseenLabel + ' ' + (order.indexOf(id) + 1) + ' / ' + order.length));
      const text = el('p', 'boss-song-text', songText(song, 'original').replace(/\s*\n\s*/g, ' '));
      cardBody(c).append(text);
      const actions = el('div', 'boss-card-actions');
      const mBtn = button('boss-measure', T.stage1.measure);
      actions.append(mBtn);
      c.append(actions);
      say('mentor', T.stage1.needMeasure);
      await waitClick(mBtn, signal);
      await measure(song);
      mBtn.hidden = true;
      enableSlots(true);
      say('mentor', T.stage1.pickSlot);

      // 꽂기: 노래마다 바로 판정(spec 10.2)
      for (;;) {
        const w = await pickSlot();
        const r = P.bossPlaceUnseen(id, w);
        if (!r.ok) continue;
        if (r.correct) {
          fillSlot(w, song.title ?? '');
          engine?.sfx?.('place');
          break;
        }
        fogPulse();
        shakeSlot(w);
        say('fog', r.help ? T.stage1.help : T.stage1.wrong);
      }
      enableSlots(false);
      say('mentor', T.stage1.right);

      // 누가 불렀을까?
      const sc = card('boss-singer');
      sc.dataset.song = id;
      sc.append(el('h2', 'boss-card-title', T.stage1.singerQuestion), el('p', 'boss-card-lead', T.stage1.singerLead));
      const groups = el('div', 'boss-groups');
      for (const g of SINGER_GROUPS) {
        const b = button('boss-group', g.name);
        b.dataset.group = g.id;
        groups.append(b);
      }
      sc.append(groups);
      let res = null;
      while (!res?.ok) {
        const pick = await waitPick(groups, '.boss-group', signal);
        res = P.bossChooseSinger(id, pick.dataset.group);
        if (res.ok) pick.classList.add('is-picked');
      }
      for (const b of groups.querySelectorAll('.boss-group')) {
        b.disabled = true;
        if (res.answer.includes(b.dataset.group)) b.classList.add('is-answer');
      }
      const ans = el('p', 'boss-singer-answer');
      ans.dataset.correct = String(res.correct);
      ans.append(
        el('span', 'boss-singer-feedback', res.correct ? T.stage1.singerRight : T.stage1.singerOther),
        el('span', 'boss-singer-names', T.stage1.answerLead + ': ' + res.answer.map(groupName).join(', ')),
      );
      const next = button('boss-next', res.stage === 'stage1' ? T.stage1.next : T.stage1.toStage2);
      groups.replaceWith(ans);
      const act = el('div', 'boss-card-actions');
      act.append(next);
      sc.append(act);
      say(null, '');
      await waitClick(next, signal);
    }
    clearSlots();
  }

  // ───────── 2단계 ─────────
  async function stage2() {
    await intro('stage2');
    const c = card('boss-remix-card');
    const box = el('div', 'boss-remix-box');
    c.append(box);
    say(null, '');
    await runRemixStage({
      box,
      P,
      remix: REMIX,
      songById,
      engine,
      rhythm: rhythm ?? {},
      signal,
      onWrong: (help) => { fogPulse(); say('fog', help ? T.stage2.help : T.stage2.wrong); },
      onFound: () => say('mentor', T.stage2.found),
    });
  }

  // ───────── 3단계 ─────────
  async function stage3() {
    setKing('present');
    await intro('stage3');
    const id = table.boss.stage3SongId;
    const song = songById(id);
    if (!song) throw new Error('보스전: 3단계 노래가 없다 ' + id);
    clearSlots();
    enableSlots(false);
    showShelf(true);
    const c = card('boss-swallowed');
    c.dataset.song = id;
    c.append(el('p', 'boss-card-label', T.stage3.swallowedLabel));
    const line = el('p', 'boss-swallowed-text');
    graphemes(songText(song, 'original').replace(/\s*\n\s*/g, ' ')).forEach((ch, i) => {
      const s = el('span', i % BOSS_TUNING.erasedEvery !== 0 && ch.trim() ? 'is-erased' : 'boss-char', ch);
      line.append(s);
    });
    cardBody(c).append(line);
    const actions = el('div', 'boss-card-actions');
    const mBtn = button('boss-measure', T.stage3.measure);
    actions.append(mBtn);
    c.append(actions);
    say('king', T.stage3.needMeasure);
    await waitClick(mBtn, signal);
    await measure(song);
    mBtn.hidden = true;
    enableSlots(true);
    say('mentor', T.stage3.pickSlot);
    for (;;) {
      const w = await pickSlot();
      const r = P.bossPlaceStage3(w);
      if (!r.ok) continue;
      if (r.correct) { fillSlot(w, song.title ?? ''); break; }
      fogPulse();
      shakeSlot(w);
      say('king', r.help ? T.stage3.help : T.stage3.wrong);
    }
    enableSlots(false);
    // 선대 사서의 자리(시조관): 엔진은 보스를 마친 것으로 기록했고, 관 모형에는 이 사건으로 알린다
    bus.emit('diorama:slot-set', { area: 'mentor', index: 0, songId: id });
    engine?.sfx?.('gold');
    setKing('scattered');
    setMentor('free');
    say('king', T.stage3.kingScatter);
  }

  // ───────── 마침 ─────────
  async function finale(already) {
    setStage('done');
    stageName.textContent = T.title;
    setKing('scattered');
    setMentor('free');
    showShelf(false);
    const txt = already ? T.already : T.finale;
    const c = card('boss-finale');
    c.append(el('h2', 'boss-card-title', txt.title));
    const body = cardBody(c);
    if (already) body.append(el('p', 'boss-line', txt.body));
    else {
      for (const l of txt.lines) {
        const p = el('p', 'boss-line');
        p.append(el('span', 'boss-speaker', BOSS_SPEAKERS[l.speaker] ?? ''), el('span', 'boss-line-text', l.text));
        body.append(p);
      }
      body.append(el('p', 'boss-note', T.stage3.mentorSeat));
      say('mentor', T.stage3.mentorFree);
    }
    const fin = button('boss-finish', txt.finish);
    const act = el('div', 'boss-card-actions');
    act.append(fin);
    c.append(act);
    await waitClick(fin, signal);
  }

  // 다섯 관을 마치기 전: 놀 수 있는 것은 없고 돌아가기만 있다
  async function locked() {
    root.classList.add('is-locked');
    topBtns.remove();
    shelf.remove();
    const c = card('boss-locked');
    c.append(el('h2', 'boss-card-title', T.locked.title), el('p', 'boss-line', T.locked.body));
    const back = button('boss-leave', T.locked.back);
    const act = el('div', 'boss-card-actions');
    act.append(back);
    c.append(act);
    await waitClick(back, signal);
  }

  try {
    if (!P || !P.isBossOpen()) {
      await locked();
      return { completed: false, reason: 'locked' };
    }
    const entered = P.enterBoss();
    if (!entered.ok) {
      if (entered.reason === 'done' || entered.reason === 'completed') {
        await finale(true);
        return { completed: true, already: true };
      }
      await locked();
      return { completed: false, reason: entered.reason };
    }
    session.world?.setContext?.(null);
    engine?.playBgm?.('boss');
    for (let guard = 0; guard < 10; guard++) {
      const st = P.progress.boss.state;
      if (st === 'stage1') await stage1();
      else if (st === 'stage2') await stage2();
      else if (st === 'stage3') await stage3();
      else break;
    }
    if (P.progress.boss.state !== 'done') throw new Error('보스전: 단계가 끝나지 않았다 ' + P.progress.boss.state);
    await finale(false);
    return { completed: true };
  } catch (e) {
    if (left && e?.name === 'AbortError') return { completed: false, reason: 'left' };
    throw e;
  } finally {
    clearTimeout(fogTimer);
    ctx.signal?.removeEventListener('abort', onOuterAbort);
    if (!signal.aborted) ac.abort(new DOMException('보스전 화면을 닫음', 'AbortError'));
    P?.leaveBoss?.();
    journal.dispose();
    scene.dispose();
    root.remove();
    for (const h of hudHosts) h.classList.remove('has-boss');
  }
}

// 화면 약속(README 7.4). 연결 단계가 js/registry.js의 screens에 'boss'로 등록한다.
export function show(container, ctx = {}) {
  let session = ctx.session ?? ctx.params?.session ?? null;
  const own = !session;
  const ac = new AbortController();
  ctx.signal?.addEventListener('abort', () => ac.abort(ctx.signal.reason), { once: true });
  let disposed = false;
  let handedOff = false;
  const ready = (async () => {
    if (!session) session = await createSession({ container });
    if (disposed) { if (own) session.dispose(); return null; }
    const res = await start({ session, signal: ac.signal });
    if (disposed) return res;
    const next = res.completed && !session.progress?.isCompleted() ? 'ending' : 'play';
    if (typeof ctx.go === 'function') {
      handedOff = true;
      ctx.go(next, { session });
    } else if (next === 'play') {
      session.enterCorridor?.();
    }
    return res;
  })().catch((e) => {
    if (e?.name !== 'AbortError') console.error('[boss] 보스전 화면을 열지 못함', e);
    return null;
  });
  return {
    ready,
    dispose() {
      disposed = true;
      ac.abort(new DOMException('화면을 떠남', 'AbortError'));
      if (own && !handedOff) session?.dispose();
    },
  };
}
