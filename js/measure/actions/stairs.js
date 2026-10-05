// 계단 오르기(시조관, 입구 튜토리얼, spec 5.4): 종장 첫 음보를 글자마다 누르면 계단을 한 칸씩 오른다.
// 장으로 된 노래(시조·사설시조)가 아니면 종장이 없어 계단이 놓이지 않는다('해당 없음'도 증거).
// 증거: { action: 'stairs', applicable, syllables }
import { deriveActionEvidence } from '../../core/song-shape.js';
import { ACTION_TEXT } from '../labels.js';
import { syllableChars } from '../text.js';
import { button, el, guard, pause, setup } from './common.js';

const T = ACTION_TEXT.stairs;

export function start(ctx) {
  const { song, signal } = ctx;
  const { view, controls, setHint, emit, own } = setup(ctx);
  const evidence = deriveActionEvidence('stairs', song);
  const last = song.units.length - 1;

  return new Promise((resolve, reject) => {
    const unguard = guard(signal, (e) => { unguard(); reject(e); });
    const end = async () => { await pause(400); unguard(); own?.remove(); resolve(evidence); };

    if (!evidence.applicable) {
      view.setMode({ flow: false, interactive: null });
      const msg = el('p', 'm-action-msg', T.absent);
      const ok = button('m-none', T.ok);
      ok.dataset.introTarget = '';
      const row = el('div', 'm-action-row');
      row.append(ok, msg);
      controls.replaceChildren(row);
      setHint(T.absent);
      ok.addEventListener('click', () => { ok.disabled = true; end(); }, { once: true });
      return;
    }

    const letters = syllableChars(song.units[last].feet[0].reading);
    const total = letters.length;
    let step = 0;
    view.setMode({
      flow: false,
      interactive: null,
      decorateWord(w, p) { w.classList.toggle('is-target', p.kind === 'word' && p.u === last && p.f === 0); },
    });
    view.goTo((p) => p.u === last);
    setHint(T.hint);

    const stairs = el('div', 'm-stairs');
    stairs.dataset.introTarget = '';
    stairs.style.setProperty('--steps', String(total));
    letters.forEach((ch, i) => {
      const b = button('m-letter', ch);
      b.style.setProperty('--i', String(i));
      b.setAttribute('aria-label', (i + 1) + '번째 글자 ' + ch);
      b.addEventListener('click', () => {
        if (b.classList.contains('is-done')) return;
        b.classList.add('is-done');
        step++;
        stairs.style.setProperty('--climbed', String(step));
        emit('diorama:stair-step', { step, total });
        if (step === total) { setHint(T.done); end(); }
      });
      stairs.append(b);
    });
    controls.replaceChildren(stairs);
  });
}
