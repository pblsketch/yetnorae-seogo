// 걷기(가사관, spec 5.4): 네 박마다 한 걸음, 노래 단위가 이어지는 동안 회랑을 걷는다.
// '한 걸음'을 누를 때마다 그 단위의 줄을 밝히고, 박자 방식이면 노래 빠르기로 장구 네 번을 들으며 한 걸음 나아간다
// (낭송은 두드리기에서 이미 들었으므로 다시 내지 않는다). 박자 없는 방식이면 소리 없이 걷는다.
// 단위가 끝나면 걸음이 멈춘다. 세 걸음에서 멈추는지, 계속 이어지는지가 증거다.
// 증거: { action: 'walk', applicable: true, steps, stopsAtThree }
import { deriveActionEvidence } from '../../core/song-shape.js';
import * as R from '../../core/rhythm.js';
import { ACTION_TEXT } from '../labels.js';
import { button, el, guard, pause, setup } from './common.js';

const T = ACTION_TEXT.walk;

export function start(ctx) {
  const { song, signal, rhythm } = ctx;
  const { view, controls, setHint, emit, own } = setup(ctx);
  const evidence = deriveActionEvidence('walk', song);
  const n = song.units.length;
  const engine = rhythm?.engine ?? null;
  const noBeat = () => (typeof ctx.getNoBeat === 'function' ? ctx.getNoBeat() : !!ctx.noBeat);
  let grid = null;
  let steps = 0;
  let current = -1;

  return new Promise((resolve, reject) => {
    let playing = null;
    const unguard = guard(signal, (e) => { playing?.stop(); unguard(); reject(e); });
    const path = el('div', 'm-walk-path');
    path.setAttribute('aria-hidden', 'true');
    const walker = el('span', 'm-walker');
    path.append(walker);
    const count = el('span', 'm-walk-count', '0');
    const stepBtn = button('m-walk-step', T.step);
    stepBtn.dataset.introTarget = '';
    const row = el('div', 'm-action-row');
    row.append(stepBtn, path, count);
    controls.replaceChildren(row);
    setHint(T.hint);

    view.setMode({
      flow: false,
      interactive: null,
      decorateWord(w, p) { w.classList.toggle('is-current', p.u === current); w.classList.toggle('is-lit', p.u < current); },
    });

    stepBtn.addEventListener('click', async () => {
      if (stepBtn.disabled || steps >= n) return;
      stepBtn.disabled = true;
      current = steps;
      steps++;
      path.style.setProperty('--walked', String(Math.min(steps, 12)));
      count.textContent = String(steps);
      view.goTo((p) => p.u === current);
      view.refresh();
      emit('diorama:walk-step', { step: steps });
      // 박자 방식이면 장구 네 번(노래 빠르기)을 듣는 동안 걷는다(네 박에 한 걸음)
      if (!noBeat() && engine?.unlocked) {
        try {
          // 빠르기는 박자 손잡이의 칸(점검 페이지는 빠른 칸을 끼운다)에서 읽는다
          grid ??= R.walkStepGrid(song, { tempo: (rhythm.buildGrid ?? R.buildGrid)(song).tempo });
          stepBtn.textContent = T.walking;
          playing = engine.play(grid);
          await playing.finished;
        } catch { /* 소리가 없어도 걷는다 */ }
        playing = null;
        stepBtn.textContent = T.step;
      }
      if (signal?.aborted) return;
      if (steps >= n) {
        current = n;
        view.refresh();
        setHint(T.stop);
        stepBtn.disabled = true;
        await pause(400);
        unguard();
        own?.remove();
        resolve(evidence);
        return;
      }
      stepBtn.disabled = false;
    });
  });
}
