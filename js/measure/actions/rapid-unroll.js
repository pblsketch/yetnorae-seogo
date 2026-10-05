// 연타로 풀기(사설시조관, spec 5.4): 가운데 단위를 여러 번 두드리면 두루마리가 음보 하나씩 풀린다.
// 세 장으로 된 노래(시조·사설시조)가 아니면 가운데 장이 없다('해당 없음'도 증거).
// 박자에 기대지 않으므로 박자 없는 방식에서도 똑같이 한다. 박자 방식이면 두드릴 때 장구 소리를 낸다.
// 증거: { action: 'rapid-unroll', applicable, middleFeet, overFour }
import { deriveActionEvidence } from '../../core/song-shape.js';
import { ACTION_TEXT } from '../labels.js';
import { button, el, guard, pause, setup } from './common.js';

const T = ACTION_TEXT['rapid-unroll'];

export function start(ctx) {
  const { song, signal, rhythm } = ctx;
  const { view, controls, setHint, emit, own } = setup(ctx);
  const evidence = deriveActionEvidence('rapid-unroll', song);
  const noBeat = () => (typeof ctx.getNoBeat === 'function' ? ctx.getNoBeat() : !!ctx.noBeat);

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

    const total = song.units[1].feet.length;
    let unrolled = 0;
    view.setMode({
      flow: false,
      interactive: null,
      decorateWord(w, p) {
        w.classList.toggle('is-rolled', p.kind === 'word' && p.u === 1 && p.f >= unrolled);
        w.classList.toggle('is-lit', p.kind === 'word' && p.u === 1 && p.f < unrolled);
      },
    });
    view.goTo((p) => p.u === 1);
    setHint(T.hint);

    const tap = button('m-unroll-btn', T.tap);
    tap.dataset.introTarget = '';
    const roll = el('div', 'm-unroll');
    roll.setAttribute('aria-hidden', 'true');
    const count = el('span', 'm-unroll-count', T.count(0));
    const row = el('div', 'm-action-row');
    row.append(tap, roll, count);
    controls.replaceChildren(row);

    tap.addEventListener('click', () => {
      if (unrolled >= total) return;
      unrolled++;
      roll.style.setProperty('--unrolled', String(Math.min(unrolled, 40)));
      count.textContent = T.count(unrolled);
      if (!noBeat()) rhythm?.engine?.sfx?.('janggu');
      view.goTo((p) => p.u === 1 && p.f === Math.min(unrolled, total - 1));
      view.refresh();
      emit('diorama:unroll', { unit: 1, feet: unrolled });
      if (unrolled === total) { tap.disabled = true; setHint(T.done); end(); }
    });
  });
}
