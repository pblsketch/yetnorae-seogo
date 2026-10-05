// '아아' 문 열기(향가관, spec 5.4): 마지막 구 무리의 첫머리에서 감탄사를 찾아 누른다.
// 첫머리 말만 문을 두드릴 수 있고, 다른 말은 흔들리기만 한다. 감탄사가 있으면 문이 열리고, 없으면 닫힌 채다.
// 마지막 무리: 10구체는 9구(4·4·2의 마지막 무리), 그 밖의 노래는 마지막 단위.
// 증거: { action: 'aa-door', applicable: true, present, unit }
import { deriveActionEvidence } from '../../core/song-shape.js';
import { ACTION_TEXT } from '../labels.js';
import { shake } from '../view.js';
import { el, guard, pause, setup } from './common.js';

const T = ACTION_TEXT['aa-door'];

export function headUnit(song) {
  const n = song.units.length;
  return song.genre === 'hyangga' && n === 10 ? 8 : n - 1;
}

export function start(ctx) {
  const { song, signal } = ctx;
  const { view, controls, setHint, emit, own } = setup(ctx);
  const target = headUnit(song);
  const evidence = deriveActionEvidence('aa-door', song);
  const isHead = (p) => p.kind === 'word' && p.u === target && p.w === 0 && p.f === 0 && (p.l === null || p.l === 0);

  return new Promise((resolve, reject) => {
    const unguard = guard(signal, (e) => { unguard(); reject(e); });
    let knocked = false;
    const door = el('div', 'm-door');
    door.setAttribute('aria-hidden', 'true');
    const leafL = el('span', 'm-door-leaf');
    const leafR = el('span', 'm-door-leaf');
    door.append(leafL, leafR);
    const msg = el('p', 'm-action-msg', '');
    const box = el('div', 'm-action-row');
    box.dataset.introTarget = '';
    box.append(door, msg);
    controls.replaceChildren(box);
    setHint(T.hint);

    view.setMode({
      flow: false,
      interactive: 'word',
      decorateWord(w, p) {
        w.classList.toggle('is-target', p.u === target);
        w.classList.toggle('is-head', knocked && isHead(p));
      },
      async onWord(p, w) {
        if (knocked) return;
        if (!isHead(p)) { shake(w); return; }
        knocked = true;
        view.refresh();
        door.classList.toggle('is-open', evidence.present);
        msg.textContent = evidence.present ? T.open : T.shut;
        emit('diorama:aa-door', { present: evidence.present, unit: evidence.unit });
        await pause(500);
        unguard();
        own?.remove();
        resolve(evidence);
      },
    });
    view.goTo((p) => p.u === target);
  });
}
