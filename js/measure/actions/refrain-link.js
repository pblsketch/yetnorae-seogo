// 후렴 고리 걸기(고려가요관, spec 5.4): 연마다 되풀이되는 구절을 눌러 고리로 잇는다.
// 되풀이 구절(후렴구·여음)의 한 자리를 누르면 지금 쪽에 보이는 같은 구절 자리가 모두 고리로 이어진다.
// 되풀이 구절이 아닌 말은 흔들리기만 한다. 되풀이 구절이 없는 노래는 '되풀이되는 구절이 없다'로 끝낸다
// (구절이 남아 있으면 그 버튼은 흔들리기만 한다).
// 증거: { action: 'refrain-link', applicable: true, present, ranges }
// 사건: 고리 하나마다 diorama:refrain-link { from, to }. 같은 구절의 첫 고리는 from과 to가 같다.
import { deriveActionEvidence } from '../../core/song-shape.js';
import { ACTION_TEXT } from '../labels.js';
import { shake } from '../view.js';
import { button, el, guard, pause, setup } from './common.js';

const T = ACTION_TEXT['refrain-link'];

export function start(ctx) {
  const { song, signal } = ctx;
  const { view, controls, setHint, emit, own } = setup(ctx);
  const evidence = deriveActionEvidence('refrain-link', song);
  // 구간 목록: features 순서 그대로, 어느 구절(item)의 것인지 함께
  const ranges = [];
  (song.features?.refrains ?? []).forEach((r, item) => (r.ranges ?? []).forEach((g) => ranges.push({ ...g, item })));
  const linked = new Set();
  const lastOf = new Map();   // 구절 → 마지막으로 고리를 건 구간
  const rangeAt = (p) => ranges.findIndex((g) => p.kind === 'word' && g.unit === p.u && g.line === p.l && p.f >= g.from && p.f <= g.to);

  return new Promise((resolve, reject) => {
    const unguard = guard(signal, (e) => { unguard(); reject(e); });
    let finished = false;
    const msg = el('p', 'm-action-msg', '');
    const none = button('m-none', T.none);
    const row = el('div', 'm-action-row');
    row.append(none, msg);
    controls.replaceChildren(row);
    setHint(T.hint);

    async function finish(text) {
      finished = true;
      msg.textContent = text;
      await pause(400);
      unguard();
      own?.remove();
      resolve(evidence);
    }

    none.addEventListener('click', () => {
      if (finished) return;
      if (ranges.length === 0) finish(T.noneDone);
      else shake(none);
    });

    const onPage = (k) => {
      const [a, e] = view.range;
      return view.pieces.slice(a, e).some((p) => rangeAt(p) === k);
    };
    const pageHasWork = ([a, e]) => view.pieces.slice(a, e).some((p) => { const k = rangeAt(p); return k >= 0 && !linked.has(k); });

    view.setMode({
      flow: false,
      interactive: 'word',
      decorateWord(w, p) {
        const k = rangeAt(p);
        w.classList.toggle('is-linked', k >= 0 && linked.has(k));
      },
      onWord(p, w) {
        if (finished) return;
        const k = rangeAt(p);
        if (k < 0) { shake(w); return; }
        if (linked.has(k)) return;
        const item = ranges[k].item;
        // 지금 쪽에 보이는 같은 구절 자리를 모두 잇는다(누른 자리부터)
        const chain = [k, ...ranges.map((_, j) => j).filter((j) => j !== k && ranges[j].item === item && !linked.has(j) && onPage(j))];
        for (const j of chain) {
          linked.add(j);
          const to = { unit: ranges[j].unit, line: ranges[j].line };
          const prev = lastOf.get(item);
          emit('diorama:refrain-link', { from: prev ? { unit: prev.unit, line: prev.line } : to, to });
          lastOf.set(item, ranges[j]);
        }
        view.refresh();
        if (linked.size === ranges.length) { finish(T.done); return; }
        if (!pageHasWork(view.range)) view.goToPageWhere(pageHasWork);
      },
    });
  });
}
