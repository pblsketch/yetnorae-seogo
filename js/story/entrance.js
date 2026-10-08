// 입구(spec 2-2, 5.6, 11): 먹빛으로 바랜 서고, 선대 사서의 편지(노래가 뒤섞였다는 전제)와 먹안개 속 목소리, 미션 문장
// (spec 0 그대로), 그리고 「태산이 높다 하되」로 형식 분석 익히기. 분석 화면(openMeasure)이 ① 연·장·행·구 나누기 →
// ② 음보 나누기 → ③ 계단 오르기를 하나씩 손가락으로 보여 주고(입구는 고유 동작 대신 튜토리얼 동작 stairs),
// ④ 갈래 판별은 시조를 가리키며 안내한다. 마치면 이 노래는 '선대 사서의 첫 노래'로 일지에
// 담기고(어느 칸도 차지하지 않는다) 향가관이 열린다(진행 엔진 completeTutorial).
// 낭송 음성은 아직 없으므로 목소리는 글줄로 보인다.
import { openMeasure } from '../measure/measure.js';
import { openGenreContrast } from '../play/contrast-panel.js';
import { SONG_TABLE } from '../data/song-table.js';
import { MISSION, STORY } from '../data/story.js';
import { el, button, spriteImg, boardUrl, quoted } from './dom.js';

const E = STORY.entrance;

function frame(host, manifest, step) {
  const root = el('section', 'story-entrance story-scene');
  root.dataset.worldCover = '';   // 입구 장면이 세계를 덮는 동안 세계 바탕은 그리지 않는다(world.js '가림')
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', E.place);
  root.dataset.step = step;
  const backdrop = el('div', 'story-backdrop is-faded');
  const bg = boardUrl(manifest, 'entrance');
  if (bg) backdrop.style.backgroundImage = `url("${bg}")`;
  backdrop.append(el('div', 'story-fog'));
  const card = el('div', 'story-card story-scroll');
  const actions = el('div', 'story-actions');
  root.append(backdrop, card, actions);
  host.append(root);
  return { root, card, actions };
}

// 편지·목소리·미션을 차례로 보인다. reread면 튜토리얼 없이 닫기로 끝난다(회랑의 입구 문에서 다시 읽기).
// 돌려주는 약속: 튜토리얼을 마치고 '회랑으로'를 누르면(또는 다시 읽기를 닫으면) 끝난다. signal이 중단되면 치우고 끝난다.
export function runEntrance({ host, session, manifest, signal, reread = false } = {}) {
  return new Promise((resolve) => {
    const f = frame(host, manifest, reread ? 'letter' : 'scene');
    const { root, card, actions } = f;
    let measureAc = null;
    const end = () => {
      measureAc?.abort(new DOMException('입구를 떠남', 'AbortError'));
      root.remove();
      session.root?.classList.remove('is-measuring');
      signal?.removeEventListener('abort', end);
      resolve();
    };
    if (signal?.aborted) { end(); return; }
    signal?.addEventListener('abort', end, { once: true });

    const next = (label, fn) => {
      const b = button('story-btn story-next', label);
      b.addEventListener('click', fn, { once: true });
      actions.replaceChildren(b);
      b.focus({ preventScroll: true });
    };

    function scene() {
      root.dataset.step = 'scene';
      card.replaceChildren(el('h2', 'story-h', E.place), el('p', 'story-p', E.scene));
      next(E.next, letter);
    }

    function letter() {
      root.dataset.step = 'letter';
      const paper = el('div', 'story-letter');
      paper.append(...E.letter.map((t) => el('p', 'story-letter-line', t)));
      card.replaceChildren(el('h2', 'story-h', E.letterTitle), paper);
      next(E.next, voice);
    }

    function voice() {
      root.dataset.step = 'voice';
      const mentor = spriteImg(manifest, 'sprite/mentor', 'story-mentor is-fogged');
      const lines = el('div', 'story-voice');
      lines.append(...E.voice.map((t) => el('p', 'story-voice-line', t)));
      const row = el('div', 'story-voice-row');
      row.append(mentor, lines);
      card.replaceChildren(el('h2', 'story-h', E.voiceTitle), row);
      next(E.next, mission);
    }

    function mission() {
      root.dataset.step = 'mission';
      const m = el('p', 'story-mission', MISSION);
      card.replaceChildren(el('h2', 'story-h', E.missionTitle), m);
      if (reread) {
        const close = button('story-btn story-close', E.rereadClose);
        close.addEventListener('click', end, { once: true });
        actions.replaceChildren(close);
        return;
      }
      const song = session.songById(SONG_TABLE.tutorial);
      card.append(el('p', 'story-p', E.tutorialIntro), el('p', 'story-song-name', E.tutorialSong + ' ' + quoted(song?.title ?? '')));
      const start = button('story-btn story-tutorial-start', E.tutorialStart);
      start.addEventListener('click', tutorial, { once: true });
      actions.replaceChildren(start);
      start.focus({ preventScroll: true });
    }

    async function tutorial() {
      root.dataset.step = 'tutorial';
      root.hidden = true;
      const song = session.songById(SONG_TABLE.tutorial);
      measureAc = new AbortController();
      session.world.setContext(null);
      session.root.classList.add('is-measuring');
      let finished = false;
      try {
        await openMeasure({
          song,
          wing: 'entrance',
          world: session.world,
          rhythm: session.rhythm,
          setSlashMode: session.setSlashMode,
          notebook: session.notebook,
          notebookGlow: session.glows,
          // 입구는 공통 동작(①·②)과 튜토리얼 동작(③ 계단)을 처음 보는 곳이다.
          introSeen: { common: false, unique: false },
          onIntroSeen: () => {},
          // ④ 갈래 판별을 안내하며 한 번 해 본다(시조). 다른 갈래를 고르면 관과 같이 고른 갈래와 맞대어 본 뒤 다시 고른다.
          // 튜토리얼의 판별은 기록하지 않는다(관의 오답 수에도 들지 않는다).
          decideGuide: song?.genre,
          decide: async (genre, sheet) => {
            if (genre === song?.genre) return { correct: true, note: E.decideNote };
            await openGenreContrast(session.root, { song, sheet, genre, notebook: session.notebook, neutral: true, signal: measureAc?.signal });
            return { correct: false };
          },
          reduceMotion: () => session.world.reduceMotion(),
          signal: measureAc.signal,
        });
        finished = true;
      } catch (e) {
        if (e?.name !== 'AbortError') console.error('[story] 튜토리얼 형식 분석 실패', e);
      } finally {
        session.root.classList.remove('is-measuring');
        measureAc = null;
      }
      if (!root.isConnected) return;
      root.hidden = false;
      if (!finished) { mission(); return; }
      session.progress.completeTutorial();
      done();
    }

    function done() {
      root.dataset.step = 'done';
      // 갈래를 판별하면 이 노래의 단위 이름이 드러난다(분석하는 동안은 '부분'). 관에서도 판별에서 맞힐 때 드러난다.
      card.replaceChildren(el('h2', 'story-h', E.doneTitle), el('p', 'story-p story-reveal', E.unitReveal), ...E.done.map((t) => el('p', 'story-p', t)));
      const go = button('story-btn story-to-corridor', E.toCorridor);
      go.addEventListener('click', end, { once: true });
      actions.replaceChildren(go);
      go.focus({ preventScroll: true });
    }

    if (reread) letter();
    else scene();
  });
}
