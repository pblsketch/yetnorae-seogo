// 맞대어 보기 창(오답 뒤): 판정에서 돌아온 노래 한 편을 학생이 고른 자리와 견주어 본다.
//   왼쪽: 그 노래의 감정서 줄(누를 수 있다). 오른쪽: 그 자리의 『분류 수첩』 쪽 줄(탑이면 '이 층은 … 덩이' 줄을 더한다).
//   어긋나는 줄을 누르면 그 줄과 같은 개념을 가장 좁게 설명하는 수첩 줄이 짝으로 밝아지고, '손에 다시 들기'로 창을 닫는다.
//   어긋나지 않는 줄을 누르면 살짝 흔들릴 뿐 아무것도 남지 않는다. 같은 노래에서 두 번 그러면 어긋나는 줄이 살짝 빛난다.
//   Esc를 누르면 그대로 닫힌다(노래는 이미 손에 돌아와 있다). 3D·2D가 같은 DOM이다.
// 판정과 기록은 진행 엔진이 이미 했다. 이 창은 아무것도 저장하지 않고 오답 수에도 들지 않는다.
// 어느 줄이 어긋나는지는 js/core/contrast.js의 mismatches가 정한다(부르는 쪽이 넘긴다). 비어 있으면 이 창을 열지 않는다.
import { sheetLines } from '../measure/sheet.js';
import { pairedLineIds } from '../core/contrast.js';
import { el, button } from './dom.js';
import { L } from './labels.js';

// 같은 노래에서 어긋나지 않는 줄을 이만큼 누르면 어긋나는 줄을 살짝 밝혀 준다(여전히 학생이 눌러야 한다)
export const CONTRAST_NUDGE_AFTER = 2;

const FOCUSABLE = 'button:not([disabled])';

function shakeEl(node) {
  node.classList.remove('is-shake');
  void node.offsetWidth;
  node.classList.add('is-shake');
  clearTimeout(node._shakeTimer);
  node._shakeTimer = setTimeout(() => node.classList.remove('is-shake'), 450);
}

// host: 창을 붙일 곳. song·sheet: 노래와 그 감정서. neutral: 단위를 '덩이'로 부를지(드러나기 전의 노래).
// found: [{ lineKind, conceptId, action? }]. page: 대상 갈래의 수첩 쪽. target: { genre } | { towerUnits }.
// 돌려주는 것: Promise<'paired' | 'closed'>
export function openContrast(host, { song, sheet, neutral = true, found = [], page = null, target = {}, signal = null } = {}) {
  return new Promise((resolve) => {
    const box = el('section', 'play-contrast');
    box.dataset.song = song.id;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', L.contrastTitle(song.title));
    const title = el('h2', 'play-contrast-title', L.contrastTitle(song.title));
    const prompt = el('p', 'play-contrast-prompt', L.contrastPrompt);
    const status = el('p', 'play-contrast-status');
    status.setAttribute('aria-live', 'polite');

    // 왼쪽: 감정서 줄
    const left = el('div', 'play-contrast-side play-contrast-sheet');
    left.append(el('h3', 'play-contrast-sub', L.contrastSheet));
    const leftList = el('ul', 'play-contrast-lines');
    const lineConcepts = (line) => found
      .filter((m) => m.lineKind === line.kind && (line.kind !== 'action' || m.action === line.action))
      .map((m) => m.conceptId);
    const items = sheetLines(sheet, song, { neutral }).map((line) => {
      const li = el('li');
      const b = button('play-contrast-line', line.text);
      b.dataset.kind = line.kind;
      if (line.action) b.dataset.action = line.action;
      li.append(b);
      leftList.append(li);
      return { b, concepts: lineConcepts(line) };
    });
    left.append(leftList);

    // 오른쪽: 그 자리의 수첩 쪽(탑이면 층 줄을 앞에)
    const right = el('div', 'play-contrast-side play-contrast-page');
    const tower = Number.isInteger(target?.towerUnits);
    right.append(el('h3', 'play-contrast-sub', tower ? L.contrastFloor(target.towerUnits) : L.contrastPage(page?.name ?? '')));
    const rightList = el('ul', 'play-contrast-lines');
    const pageLines = [
      ...(tower ? [{ id: 'floor', conceptIds: ['hyangga-lines'], text: L.floorLine(target.towerUnits) }] : []),
      ...(page?.lines ?? []),
    ];
    const rights = pageLines.map((line) => {
      const li = el('li', 'play-contrast-note', line.text);
      li.dataset.lineId = line.id;
      rightList.append(li);
      return { li, id: line.id };
    });
    right.append(rightList);

    const sides = el('div', 'play-contrast-sides');
    sides.append(left, right);
    const actions = el('div', 'play-contrast-actions');
    const back = button('play-contrast-back', L.contrastBack);
    back.hidden = true;
    actions.append(back);
    box.append(title, prompt, sides, status, actions);
    host.append(box);

    let misses = 0;
    let paired = false;
    let closed = false;

    function close(how) {
      if (closed) return;
      closed = true;
      box.remove();
      signal?.removeEventListener('abort', onAbort);
      resolve(how);
    }
    const onAbort = () => close('closed');
    if (signal?.aborted) { close('closed'); return; }
    signal?.addEventListener('abort', onAbort, { once: true });

    items.forEach(({ b, concepts }) => {
      b.addEventListener('click', () => {
        if (paired) return;
        if (!concepts.length) {
          // 어긋나지 않는 줄: 흔들림만. 기록도 실패를 뜻하는 말도 없다
          shakeEl(b);
          misses += 1;
          if (misses >= CONTRAST_NUDGE_AFTER && !box.classList.contains('is-nudged')) {
            box.classList.add('is-nudged');
            for (const it of items) if (it.concepts.length) it.b.classList.add('is-hint');
            status.textContent = L.contrastNudge;
          }
          return;
        }
        paired = true;
        b.classList.add('is-pair');
        b.setAttribute('aria-pressed', 'true');
        // 그 어긋남의 개념을 가장 좁게 설명하는 수첩 줄만 짝으로 밝힌다(같은 개념을 함께 묶은 넓은 줄은 빼고)
        const pairIds = pairedLineIds(concepts, pageLines);
        for (const r of rights) if (pairIds.includes(r.id)) r.li.classList.add('is-pair');
        for (const it of items) if (it.b !== b) it.b.disabled = true;
        status.textContent = L.contrastFound;
        back.hidden = false;
        back.focus({ preventScroll: true });
      });
    });
    back.addEventListener('click', () => close('paired'));

    // 키보드: Tab은 창 안에서만 돈다. Esc는 창을 닫는다(노래는 이미 손에 있다. 막히는 일이 없게)
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close('closed'); return; }
      if (e.key !== 'Tab') return;
      const list = [...box.querySelectorAll(FOCUSABLE)].filter((n) => !n.hidden);
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i < 0 || i >= list.length - 1 ? 0 : i + 1);
      e.preventDefault();
      list[next].focus({ preventScroll: true });
    });
    items[0]?.b.focus({ preventScroll: true });
  });
}
