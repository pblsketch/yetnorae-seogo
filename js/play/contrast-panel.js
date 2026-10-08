// 맞대어 보기 창(오답 뒤): 노래 한 편의 분석표를 학생이 고른 것(갈래 판별에서 고른 갈래, 또는 향가관 탑의 층)과 견주어 본다.
//   왼쪽: 그 노래의 분석표 줄(누를 수 있다). 오른쪽: 고른 갈래의 『분류 수첩』 쪽 줄(탑이면 '이 층은 … 구로 된' 줄을 더한다).
//   어긋나는 줄을 누르면 그 줄과 같은 개념을 가장 좁게 설명하는 수첩 줄이 짝으로 밝아지고, 아래 단추('손에 다시 들기',
//   갈래 판별이면 '다시 판별하기')로 창을 닫는다.
//   어긋나지 않는 줄을 누르면 살짝 흔들릴 뿐 아무것도 남지 않는다. 같은 노래에서 두 번 그러면 어긋나는 줄이 살짝 빛난다.
//   짚을 줄이 없으면(found가 빈 갈래 판별) 분석표와 고른 갈래 쪽을 나란히 보이기만 하고 '다시 판별하기'를 바로 둔다.
//   오른쪽 위 닫기 단추(X)나 Esc를 누르면 그대로 닫힌다. 3D·2D가 같은 DOM이다.
// 판정과 기록은 진행 엔진이 이미 했다. 이 창은 아무것도 저장하지 않고 오답 수에도 들지 않는다.
// 어느 줄이 어긋나는지는 js/core/contrast.js의 mismatches가 정한다(부르는 쪽이 넘긴다).
import { sheetLines } from '../measure/sheet.js';
import { NEUTRAL_UNIT } from '../measure/text.js';
import { mismatches, pairedLineIds } from '../core/contrast.js';
import { genreById } from '../data/wings.js';
import { el, button, closeButton } from './dom.js';
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

// 갈래 판별에서 틀렸을 때: 고른 갈래(genre)와 분석표를 맞대어 본다. 짚을 줄은 mismatches(노래, { genre }, 분석표의 동작)이고
// 없으면 짝짓기 없이 나란히 보인다. 돌려주는 것: Promise<'paired' | 'compared' | 'closed'>
export function openGenreContrast(host, { song, sheet, genre, notebook = {}, neutral = true, signal = null } = {}) {
  const actionIds = (sheet?.actions ?? [sheet?.action]).filter(Boolean).map((a) => a.action);
  const target = { genre };
  return openContrast(host, {
    song, sheet, neutral, target, signal,
    found: mismatches(song, target, actionIds),
    page: notebook?.[genre] ?? { name: genreById(genre)?.name ?? '', lines: [] },
    decide: true,
  });
}

// host: 창을 붙일 곳. song·sheet: 노래와 그 분석표. neutral: 단위를 '부분'으로 부를지(드러나기 전의 노래).
// found: [{ lineKind, conceptId, action? }]. page: 대상 갈래의 수첩 쪽. target: { genre } | { towerUnits }.
// decide: 갈래 판별에서 연 창(안내·단추 글이 판별에 맞고, found가 비어도 연다).
// 돌려주는 것: Promise<'paired' | 'compared' | 'closed'>
export function openContrast(host, { song, sheet, neutral = true, found = [], page = null, target = {}, signal = null, decide = false } = {}) {
  return new Promise((resolve) => {
    const pairless = decide && !found.length;
    const pageName = page?.name ?? genreById(target?.genre)?.name ?? '';
    const box = el('section', 'play-contrast');
    box.dataset.song = song.id;
    box.dataset.mode = decide ? 'decide' : 'place';
    if (pairless) box.dataset.pairless = '';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', L.contrastTitle(song.title));
    const opener = document.activeElement;
    const title = el('h2', 'play-contrast-title', L.contrastTitle(song.title));
    // 오른쪽 위 X(교사 의견 2026-10-07: 짝을 짓기 전에는 닫는 단추가 없었다). 닫으면 Esc와 같이 노래는 손에 그대로다
    const closeBtn = closeButton('play-contrast-close');
    const head = el('div', 'play-contrast-head');
    head.append(title, closeBtn);
    const prompt = el('p', 'play-contrast-prompt', !decide ? L.contrastPrompt : pairless ? L.contrastNoPair(pageName) : L.contrastPromptGenre(pageName));
    const status = el('p', 'play-contrast-status');
    status.setAttribute('aria-live', 'polite');

    // 왼쪽: 분석표 줄
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
    right.append(el('h3', 'play-contrast-sub', tower ? L.contrastFloor(target.towerUnits) : L.contrastPage(pageName)));
    const rightList = el('ul', 'play-contrast-lines');
    const pageLines = [
      ...(tower ? [{ id: 'floor', conceptIds: ['hyangga-lines'], text: L.floorLine(target.towerUnits, neutral ? NEUTRAL_UNIT : '구') }] : []),
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
    const back = button('play-contrast-back', decide ? L.contrastRetry : L.contrastBack);
    back.hidden = !pairless;
    actions.append(back);
    box.append(head, prompt, sides, status, actions);
    host.append(box);

    let misses = 0;
    let paired = false;
    let closed = false;

    function close(how) {
      if (closed) return;
      const hadFocus = box.contains(document.activeElement);
      closed = true;
      box.remove();
      signal?.removeEventListener('abort', onAbort);
      // 초점을 창이 열리기 전 자리로 돌려준다(그 자리가 아직 있으면)
      if ((hadFocus || document.activeElement === document.body) && opener?.isConnected && opener !== document.body) {
        try { opener.focus({ preventScroll: true }); } catch { /* 초점을 줄 수 없음 */ }
      }
      resolve(how);
    }
    closeBtn.addEventListener('click', () => close('closed'));
    const onAbort = () => close('closed');
    if (signal?.aborted) { close('closed'); return; }
    signal?.addEventListener('abort', onAbort, { once: true });

    items.forEach(({ b, concepts }) => {
      b.addEventListener('click', () => {
        if (paired) return;
        if (pairless) { shakeEl(b); return; }   // 짚을 줄이 없는 판별: 나란히 견주어 보기만 한다
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
        status.textContent = decide ? L.contrastFoundGenre : L.contrastFound;
        back.hidden = false;
        back.focus({ preventScroll: true });
      });
    });
    back.addEventListener('click', () => close(pairless ? 'compared' : 'paired'));

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
