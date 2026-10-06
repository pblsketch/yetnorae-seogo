// 시작 화면(spec 2-1, 13): 이름 기록 목록(이름, 모습, '서고 완성'), 새 기록(이름 1~12자, 모습 a|b), 같은 이름이면 이어 할지 묻기,
// 모습 바꾸기, 지우기(확인 한 번), 결과 카드 다시 받기, 설정·출처 화면으로 가는 문과 전체 화면 단추. 기록 보호(비밀번호)는 없다(spec 13).
// 모습: 3D를 쓰는 기기에서는 게임 속 3D 인물의 미리보기(고르기)와 3/4 자세 정지 그림(기록 목록), 2D 기기에서는 승인된 그림(look-picker.js).
// 결과 카드(spec 12): 마친 관마다 판 카드, 서고를 완성했으면 마지막 카드. 내려받을 때마다 그 기록의 지금 상태로 다시 그린다.
import { NAME_LIMITS, validateName } from '../core/save.js';
import { buildWingCard, buildFinalCard } from '../core/cards.js';
import { PLAY_WING_IDS, wingById } from '../data/wings.js';
import { STORY } from '../data/story.js';
import { showCard } from '../result/card-view.js';
import { createPortraitStage, cachedPortrait } from '../world/portrait.js';
import { el, button, spriteImg, confirmBox } from './dom.js';
import { createLookPicker, lookName } from './look-picker.js';
import { fullscreenButton } from './fullscreen.js';

const T = STORY.start;

// container: 채울 곳. store: 읽어 둔 저장 엔진. manifest: 자산 목록(학생 그림).
// onOpen(recordId): 그 기록으로 들어간다. onSettings(): 설정을 연다. onCredits: 있으면 출처 문을 둔다.
// 돌려주는 것: { root, refresh(), dispose() }
export function renderStart(container, { store, manifest, onOpen, onSettings, onCredits = null, saveNotice = null } = {}) {
  const root = el('div', 'story-start');
  const top = el('header', 'story-start-top');
  const titles = el('div', 'story-start-titles');
  titles.append(el('h1', 'story-title', STORY.title), el('p', 'story-subtitle', STORY.subtitle));
  const doors = el('div', 'story-start-doors');
  const fs = fullscreenButton('story-btn story-btn-quiet story-open-fullscreen');
  if (fs) doors.append(fs.el);
  const settingsBtn = button('story-btn story-btn-quiet story-open-settings', T.settings);
  settingsBtn.addEventListener('click', () => onSettings?.());
  doors.append(settingsBtn);
  if (onCredits) {
    const credits = button('story-btn story-btn-quiet story-open-credits', T.credits);
    credits.addEventListener('click', () => onCredits());
    doors.append(credits);
  }
  top.append(titles, doors);

  const main = el('div', 'story-start-main');
  // ── 기록 목록 ──
  const listBox = el('section', 'story-start-records story-scroll');
  listBox.setAttribute('aria-label', T.recordsTitle);
  // ── 새 기록 ──
  const form = el('form', 'story-start-new story-scroll');
  form.setAttribute('aria-label', T.newTitle);
  form.noValidate = true;
  main.append(listBox, form);

  const notice = el('p', 'story-notice');
  notice.setAttribute('role', 'status');
  if (saveNotice) notice.textContent = saveNotice;
  else notice.hidden = true;
  root.append(top, notice, main);
  container.append(root);

  // 모습 미리보기 무대(3D를 못 쓰면 null → 승인된 그림). 화면 하나에 그림판 하나를 함께 쓴다.
  const stage = createPortraitStage();
  root.dataset.lookRender = stage ? '3d' : '2d';

  // ── 새 기록 폼 ──
  const nameId = 'story-name-' + Math.random().toString(36).slice(2, 7);
  const label = el('label', 'story-label', T.nameLabel);
  label.htmlFor = nameId;
  const input = el('input', 'story-input story-name-input');
  input.id = nameId;
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = T.namePlaceholder;
  const lookTitle = el('p', 'story-label', T.lookTitle);
  const picker = createLookPicker({ stage, manifest, value: 'a' });
  const msg = el('p', 'story-msg');
  msg.setAttribute('aria-live', 'polite');
  const create = button('story-btn story-create', T.create);
  create.type = 'submit';
  form.append(el('h2', 'story-h', T.newTitle), label, input, lookTitle, picker.root, msg, create);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const v = validateName(input.value);
    if (!v.ok) {
      msg.textContent = v.reason === 'too-long' ? T.nameLong(NAME_LIMITS.nameMax) : T.nameEmpty;
      return;
    }
    const r = store.createRecord(v.name, { appearance: picker.value });
    if (r.status === 'created') { onOpen?.(r.record.id); return; }
    if (r.status === 'exists') {
      const yes = await confirmBox(root, { kind: 'continue', title: T.existsTitle, text: T.existsText(r.record.name), yes: T.existsYes, no: T.existsNo });
      if (yes) onOpen?.(r.record.id);
      else input.focus({ preventScroll: true });
      return;
    }
    msg.textContent = T.nameEmpty;
  });

  // ── 기록 목록 ──
  function refresh() {
    const list = store.listRecords();
    listBox.replaceChildren(el('h2', 'story-h', T.recordsTitle));
    if (!list.length) { listBox.append(el('p', 'story-records-none', T.recordsNone)); return; }
    const ul = el('ul', 'story-records');
    for (const r of list) {
      const li = el('li', 'story-record');
      li.dataset.id = r.id;
      const thumb = lookThumb(r);
      const info = el('div', 'story-record-info');
      const nameRow = el('p', 'story-record-title');
      nameRow.append(el('span', 'story-record-name', r.name));
      if (r.completed) nameRow.append(el('span', 'story-badge', T.complete));
      const btns = el('div', 'story-record-btns');
      const open = button('story-btn story-record-open', T.continue, r.name + ' ' + T.continue);
      const lookBtn = button('story-btn story-btn-quiet story-record-look', T.changeLook, r.name + ' ' + T.changeLook);
      const del = button('story-btn story-btn-quiet story-record-delete', T.delete, r.name + ' ' + T.delete);
      const cards = cardsOf(r.id);
      const cardsBtn = cards.length ? button('story-btn story-btn-quiet story-record-cards', T.cards, r.name + ' ' + T.cards) : null;
      cardsBtn?.addEventListener('click', () => openCards(r.id, r.name));
      open.addEventListener('click', () => onOpen?.(r.id));
      lookBtn.addEventListener('click', () => openLookChange(r));
      del.addEventListener('click', async () => {
        const yes = await confirmBox(root, { kind: 'delete', title: T.deleteTitle, text: T.deleteText(r.name), yes: T.deleteYes, no: T.deleteNo });
        if (yes) store.deleteRecord(r.id, { confirmed: true });
        refresh();
      });
      btns.append(...[open, cardsBtn, lookBtn, del].filter(Boolean));
      info.append(nameRow, btns);
      li.append(thumb, info);
      ul.append(li);
    }
    listBox.append(ul);
  }

  // 기록 목록의 작은 그림: 3D 기기는 게임 속 인물의 3/4 자세 정지 그림, 2D 기기는 승인된 그림
  function lookThumb(r) {
    const alt = T.lookOf(r.name, lookName(r.appearance));
    let img;
    if (stage) {
      img = el('img', 'story-record-thumb');
      img.alt = alt;
      img.draggable = false;
      const ready = cachedPortrait(r.appearance);
      if (ready) img.src = ready;
      else stage.portrait(r.appearance).then((url) => { if (url) img.src = url; });
    } else {
      img = spriteImg(manifest, 'sprite/student-' + r.appearance, 'story-record-thumb', alt);
    }
    img.dataset.appearance = r.appearance;
    img.dataset.render = stage ? '3d' : '2d';
    return img;
  }

  // ── 모습 바꾸기: 새 기록과 같은 고르기를 상자에 띄운다. '이 모습으로 바꾸기'를 눌러야 저장한다 ──
  function openLookChange(r) {
    root.querySelector('.story-look-shade')?.remove();
    const shade = el('div', 'story-look-shade');
    const box = el('section', 'story-look-change story-scroll');
    box.dataset.id = r.id;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', T.changeLookTitle(r.name));
    const pick = createLookPicker({ stage, manifest, value: r.appearance, label: T.changeLookTitle(r.name) });
    const cancel = button('story-btn story-btn-quiet story-look-cancel', T.changeLookCancel);
    const apply = button('story-btn story-look-apply', T.changeLookApply);
    const actions = el('div', 'story-confirm-actions');
    actions.append(cancel, apply);
    box.append(el('h2', 'story-confirm-title', T.changeLookTitle(r.name)), el('p', 'story-confirm-text', T.changeLookNote), pick.root, actions);
    shade.append(box);
    root.append(shade);
    // 상자가 떠 있는 동안 뒤의 새 기록 고르기는 멈춘다(그림판은 한 번에 한 칸만 움직인다)
    picker.pause(true);
    const close = (changed) => {
      pick.dispose();
      shade.remove();
      picker.pause(false);
      if (changed) refresh();
      root.querySelector(`.story-record[data-id="${r.id}"] .story-record-look`)?.focus({ preventScroll: true });
    };
    cancel.addEventListener('click', () => close(false), { once: true });
    apply.addEventListener('click', () => {
      if (pick.value !== r.appearance) store.setAppearance(r.id, pick.value);
      close(pick.value !== r.appearance);
    }, { once: true });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });
    pick.focus();
  }

  // ── 결과 카드 다시 받기 ──
  // 그 기록으로 만들 수 있는 카드: 마친 관마다 판 카드(관 순서), 서고를 완성했으면 마지막 카드.
  function cardsOf(id) {
    const p = store.getRecord(id)?.progress;
    if (!p) return [];
    const out = PLAY_WING_IDS.filter((w) => p.wings?.[w]?.state === 'done').map((w) => ({ kind: 'wing', wing: w, label: T.wingCard(wingById(w).name) }));
    if (p.ending?.completed) out.push({ kind: 'final', wing: null, label: T.finalCard });
    return out;
  }

  // 카드를 만들 자료를 지금의 기록에서 다시 모은다(내려받을 때마다 부른다).
  const cardSource = (id, c) => () => {
    const record = store.getRecord(id);
    return c.kind === 'final' ? buildFinalCard(record) : buildWingCard(record, c.wing);
  };

  // 카드 고르기 상자. 고르면 그 위에 카드 화면을 띄우고, 카드를 닫으면 고르기 상자로 돌아온다.
  function openCards(id, name) {
    root.querySelector('.story-cards-shade')?.remove();
    const shade = el('div', 'story-cards-shade');
    const box = el('section', 'story-cards story-scroll');
    box.dataset.id = id;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', T.cardsTitle(name));
    const list = el('div', 'story-cards-list');
    for (const c of cardsOf(id)) {
      const b = button('story-btn story-card-pick', c.label, name + ' ' + c.label);
      b.dataset.card = c.kind;
      if (c.wing) b.dataset.wing = c.wing;
      b.addEventListener('click', () => openCard(shade, id, name, c));
      list.append(b);
    }
    const close = button('story-btn story-btn-quiet story-cards-close', T.cardsClose);
    const actions = el('div', 'story-confirm-actions');
    actions.append(close);
    box.append(el('h2', 'story-confirm-title', T.cardsTitle(name)), el('p', 'story-confirm-text', T.cardsNote), list, actions);
    shade.append(box);
    root.append(shade);
    const done = () => { shade.remove(); refresh(); };
    close.addEventListener('click', done, { once: true });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !shade.querySelector('.story-record-card')) done(); });
    (list.querySelector('button') ?? close).focus({ preventScroll: true });
  }

  function openCard(shade, id, name, c) {
    shade.querySelector('.story-record-card')?.remove();
    const host = el('section', 'story-record-card');
    host.dataset.card = c.kind;
    if (c.wing) host.dataset.wing = c.wing;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', name + ' ' + c.label);
    shade.append(host);
    const back = () => {
      view.dispose();
      host.remove();
      shade.querySelector('.story-card-pick[data-card="' + c.kind + '"]' + (c.wing ? '[data-wing="' + c.wing + '"]' : ''))?.focus({ preventScroll: true });
    };
    const view = showCard(host, cardSource(id, c), { manifest, onClose: back });
  }

  refresh();

  return {
    root,
    refresh,
    dispose: () => {
      picker.dispose();
      fs?.dispose();
      stage?.dispose();
      root.remove();
    },
  };
}
