// 엔딩(spec 2-5, 11, 12): 선대 사서가 돌아오고, 가객 행렬이 spec 2절 순서(SINGER_GROUPS)로 지나가고, 행렬 끝에 빈자리가 남는다.
// 학생은 자기 노래 한 줄(1~40자)을 짓고, 꽂을 관을 고르고, 그 관 갈래의 먹 개념 하나를 근거로 고르고, 원하면 한마디(0~60자)를 쓴다.
// 꽂으면 서고가 완성되고(진행 엔진 completeEnding) 마지막 카드를 그 자리에서 내려받는다(showCard). 어떤 선택도 채점하지 않는다.
// 무리마다 그 시대 관의 칸 노래 가객을 종이 인형으로 세운다(3D·2D 모두 같은 그림 판 연출).
import { TUNABLES } from '../core/progress.js';
import { buildFinalCard } from '../core/cards.js';
import { SONG_TABLE } from '../data/song-table.js';
import { PLAY_WING_IDS, wingById } from '../data/wings.js';
import { SINGER_GROUPS, conceptsOfGenre } from '../data/concepts.js';
import { STORY } from '../data/story.js';
import { showCard } from '../result/card-view.js';
import { el, button, spriteImg, boardUrl, charCount } from './dom.js';

const N = STORY.ending;

// 행렬의 무리와 관은 같은 시대 순서다(승려·화랑 = 향가관 … 가객·서민 = 사설시조관).
export function processionGroups(table = SONG_TABLE) {
  return SINGER_GROUPS.map((g, i) => ({ ...g, wing: PLAY_WING_IDS[i], songIds: [...(table.wings[PLAY_WING_IDS[i]]?.shelf ?? [])] }));
}

// 엔딩 입력 검사(채점이 아니라 꽂을 수 있는지만). 돌려주는 것: { ok, problem }
export function checkEnding({ line, wing, conceptId, note }, concepts, limits = TUNABLES) {
  const lineLen = charCount(String(line ?? '').trim());
  const noteLen = charCount(String(note ?? '').trim());
  if (lineLen > limits.endingLineMax) return { ok: false, problem: 'line-long' };
  if (noteLen > limits.endingNoteMax) return { ok: false, problem: 'note-long' };
  if (lineLen < limits.endingLineMin) return { ok: false, problem: 'line-empty' };
  if (!PLAY_WING_IDS.includes(wing)) return { ok: false, problem: 'wing' };
  const c = conceptsOfGenre(wingById(wing).genre).find((x) => x.id === conceptId);
  if (!c || concepts?.[c.id]?.state !== 'ink') return { ok: false, problem: 'concept' };
  return { ok: true, problem: null };
}

// 돌려주는 약속: '서고로 돌아가기'를 누르면 끝난다. signal이 중단되면 치우고 끝난다.
export function runEnding({ host, session, manifest, signal } = {}) {
  return new Promise((resolve) => {
    const P = session.progress;
    const root = el('section', 'story-ending story-scene');
    root.dataset.worldCover = '';   // 엔딩은 화면 전체를 덮는다: 세계 바탕은 그리지 않는다(world.js '가림')
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', N.place);
    const backdrop = el('div', 'story-backdrop');
    const bg = boardUrl(manifest, 'ending');
    if (bg) backdrop.style.backgroundImage = `url("${bg}")`;
    const card = el('div', 'story-card story-scroll');
    const actions = el('div', 'story-actions');
    root.append(backdrop, card, actions);
    host.append(root);
    let cardView = null;

    const end = () => {
      cardView?.dispose();
      root.remove();
      signal?.removeEventListener('abort', end);
      resolve();
    };
    if (signal?.aborted) { end(); return; }
    signal?.addEventListener('abort', end, { once: true });

    const next = (fn) => {
      const b = button('story-btn story-next', N.next);
      b.addEventListener('click', fn, { once: true });
      actions.replaceChildren(b);
      b.focus({ preventScroll: true });
    };

    // 1. 선대 사서가 돌아온다
    function back() {
      root.dataset.step = 'return';
      const row = el('div', 'story-voice-row');
      const lines = el('div', 'story-voice');
      lines.append(...N.returnLines.map((t) => el('p', 'story-p', t)));
      row.append(spriteImg(manifest, 'sprite/mentor', 'story-mentor', '선대 사서'), lines);
      card.replaceChildren(el('h2', 'story-h', N.returnTitle), row);
      next(procession);
    }

    // 2·3. 가객 행렬과 빈자리
    function procession() {
      root.dataset.step = 'procession';
      const row = el('div', 'story-procession');
      row.setAttribute('aria-label', N.processionTitle);
      processionGroups().forEach((g, i) => {
        const group = el('figure', 'story-group');
        group.dataset.group = g.id;
        group.dataset.wing = g.wing;
        group.style.setProperty('--i', String(i));
        const dolls = el('div', 'story-group-dolls');
        for (const id of g.songIds) {
          const s = session.songById(id);
          const img = spriteImg(manifest, 'sprite/singer-' + id, 'story-singer', s?.singer?.name ?? '');
          img.dataset.song = id;
          dolls.append(img);
        }
        group.append(dolls, el('figcaption', 'story-group-name', g.name));
        row.append(group);
      });
      const empty = el('figure', 'story-empty-spot');
      empty.style.setProperty('--i', String(SINGER_GROUPS.length));
      empty.append(el('div', 'story-empty-mark'), el('figcaption', 'story-group-name', N.emptySpotLabel));
      row.append(empty);
      card.replaceChildren(el('h2', 'story-h', N.processionTitle), el('p', 'story-p', N.processionText), row, el('p', 'story-p', N.emptySpot), el('p', 'story-p story-mentor-line', N.mentorInvite));
      next(write);
    }

    // 4~7. 한 줄 짓기, 관, 근거(먹 개념), 한마디, 꽂기
    function write() {
      root.dataset.step = 'write';
      const choice = { line: '', wing: null, conceptId: null, note: '' };
      let touched = false;

      const lineId = 'story-line-' + Math.random().toString(36).slice(2, 7);
      const lineLabel = el('label', 'story-label', N.lineLabel);
      lineLabel.htmlFor = lineId;
      const lineInput = el('input', 'story-input story-line-input');
      lineInput.id = lineId;
      lineInput.type = 'text';
      lineInput.autocomplete = 'off';
      lineInput.placeholder = N.linePlaceholder;
      const lineCount = el('span', 'story-count');

      const wingBox = el('div', 'story-wing-choice');
      wingBox.setAttribute('role', 'group');
      wingBox.setAttribute('aria-label', N.wingTitle);
      const wingBtns = PLAY_WING_IDS.map((w) => {
        const b = button('story-choice', wingById(w).name);
        b.dataset.wing = w;
        b.addEventListener('click', () => {
          if (choice.wing !== w) choice.conceptId = null;
          choice.wing = w;
          drawConcepts();
          sync();
        });
        return b;
      });
      wingBox.append(...wingBtns);

      const conceptBox = el('div', 'story-concept-choice');
      conceptBox.setAttribute('role', 'group');
      conceptBox.setAttribute('aria-label', N.conceptTitle);

      const noteId = 'story-note-' + Math.random().toString(36).slice(2, 7);
      const noteLabel = el('label', 'story-label', N.noteLabel);
      noteLabel.htmlFor = noteId;
      const noteInput = el('textarea', 'story-input story-note-input');
      noteInput.id = noteId;
      noteInput.rows = 2;
      noteInput.placeholder = N.notePlaceholder;
      const noteCount = el('span', 'story-count');

      const msg = el('p', 'story-msg');
      msg.setAttribute('aria-live', 'polite');
      const shelve = button('story-btn story-shelve', N.shelve);

      function drawConcepts() {
        if (!choice.wing) { conceptBox.replaceChildren(el('p', 'story-hint', N.conceptPickWing)); return; }
        const list = conceptsOfGenre(wingById(choice.wing).genre);
        const inked = list.filter((c) => P.conceptState(c.id) === 'ink');
        const btns = list.map((c) => {
          const ink = P.conceptState(c.id) === 'ink';
          const b = button('story-choice story-concept', c.text);
          b.dataset.concept = c.id;
          b.dataset.state = P.conceptState(c.id);
          b.disabled = !ink;
          b.addEventListener('click', () => { choice.conceptId = c.id; sync(); });
          return b;
        });
        conceptBox.replaceChildren(...btns);
        if (!inked.length) conceptBox.append(el('p', 'story-hint', N.conceptNone));
      }

      function sync() {
        choice.line = lineInput.value;
        choice.note = noteInput.value;
        for (const b of wingBtns) b.setAttribute('aria-pressed', String(b.dataset.wing === choice.wing));
        for (const b of conceptBox.querySelectorAll('[data-concept]')) b.setAttribute('aria-pressed', String(b.dataset.concept === choice.conceptId));
        lineCount.textContent = N.lineCount(charCount(choice.line.trim()), TUNABLES.endingLineMax);
        noteCount.textContent = N.lineCount(charCount(choice.note.trim()), TUNABLES.endingNoteMax);
        const r = checkEnding(choice, P.progress.concepts);
        shelve.disabled = !r.ok;
        msg.textContent = r.problem === 'line-long' ? N.lineLong(TUNABLES.endingLineMax)
          : r.problem === 'note-long' ? N.noteLong(TUNABLES.endingNoteMax)
            : r.problem === 'line-empty' && touched ? N.lineEmpty : '';
      }
      lineInput.addEventListener('input', () => { touched = true; sync(); });
      noteInput.addEventListener('input', sync);
      shelve.addEventListener('click', () => {
        sync();
        if (shelve.disabled) return;
        const r = P.completeEnding({ line: choice.line, wing: choice.wing, conceptId: choice.conceptId, note: choice.note });
        if (!r.ok) { msg.textContent = N.lineEmpty; return; }
        complete();
      });

      const lineRow = el('div', 'story-input-row');
      lineRow.append(lineInput, lineCount);
      const noteRow = el('div', 'story-input-row');
      noteRow.append(noteInput, noteCount);
      card.replaceChildren(
        el('h2', 'story-h', N.writeTitle),
        lineLabel, lineRow,
        el('p', 'story-label', N.wingTitle), wingBox,
        el('p', 'story-label', N.conceptTitle), conceptBox,
        noteLabel, noteRow,
        msg,
      );
      actions.replaceChildren(shelve);
      drawConcepts();
      sync();
      lineInput.focus({ preventScroll: true });
    }

    // 서고 완성 → 마지막 카드
    function complete() {
      root.dataset.step = 'complete';
      root.classList.add('is-complete');
      const cardHost = el('div', 'story-card-host');
      card.replaceChildren(el('h2', 'story-h story-complete', N.completeTitle), el('p', 'story-p', N.completeText), cardHost);
      // '서고로 돌아가기'는 카드의 내려받기 단추 옆에 둔다(작은 화면에서 카드를 크게 보이려고).
      cardView = showCard(cardHost, () => buildFinalCard(session.store.currentRecord()), { manifest, onClose: end });
      const go = cardHost.querySelector('.card-view-close');
      if (go) {
        go.textContent = N.toLibrary;
        go.classList.add('story-to-library');
        actions.replaceChildren();
        actions.hidden = true;
      } else {
        const b = button('story-btn story-to-library', N.toLibrary);
        b.addEventListener('click', end, { once: true });
        actions.replaceChildren(b);
      }
    }

    back();
  });
}
