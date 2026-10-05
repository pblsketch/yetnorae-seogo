// 시작 화면(spec 2-1, 13): 이름 기록 목록(이름, 모습, '서고 완성'), 새 기록(이름 1~12자, 모습 a|b), 같은 이름이면 이어 할지 묻기,
// 모습 바꾸기, 지우기(확인 한 번), 설정과 출처 화면으로 가는 문. 기록 보호(비밀번호)는 없다(spec 13).
import { NAME_LIMITS, validateName } from '../core/save.js';
import { STORY } from '../data/story.js';
import { el, button, spriteImg, confirmBox } from './dom.js';

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

  // ── 새 기록 폼 ──
  let look = 'a';
  const nameId = 'story-name-' + Math.random().toString(36).slice(2, 7);
  const label = el('label', 'story-label', T.nameLabel);
  label.htmlFor = nameId;
  const input = el('input', 'story-input story-name-input');
  input.id = nameId;
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = T.namePlaceholder;
  const lookTitle = el('p', 'story-label', T.lookTitle);
  const looks = el('div', 'story-looks');
  looks.setAttribute('role', 'group');
  looks.setAttribute('aria-label', T.lookTitle);
  const lookBtns = ['a', 'b'].map((k) => {
    const b = button('story-look', null, T.looks[k]);
    b.dataset.appearance = k;
    b.append(spriteImg(manifest, 'sprite/student-' + k, 'story-look-img'), el('span', 'story-look-name', T.looks[k]));
    b.addEventListener('click', () => { look = k; syncLooks(); });
    return b;
  });
  const syncLooks = () => lookBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.appearance === look)));
  syncLooks();
  looks.append(...lookBtns);
  const msg = el('p', 'story-msg');
  msg.setAttribute('aria-live', 'polite');
  const create = button('story-btn story-create', T.create);
  create.type = 'submit';
  form.append(el('h2', 'story-h', T.newTitle), label, input, lookTitle, looks, msg, create);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const v = validateName(input.value);
    if (!v.ok) {
      msg.textContent = v.reason === 'too-long' ? T.nameLong(NAME_LIMITS.nameMax) : T.nameEmpty;
      return;
    }
    const r = store.createRecord(v.name, { appearance: look });
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
      const thumb = spriteImg(manifest, 'sprite/student-' + r.appearance, 'story-record-thumb', T.lookOf(r.name));
      thumb.dataset.appearance = r.appearance;
      const info = el('div', 'story-record-info');
      const nameRow = el('p', 'story-record-title');
      nameRow.append(el('span', 'story-record-name', r.name));
      if (r.completed) nameRow.append(el('span', 'story-badge', T.complete));
      const btns = el('div', 'story-record-btns');
      const open = button('story-btn story-record-open', T.continue, r.name + ' ' + T.continue);
      const lookBtn = button('story-btn story-btn-quiet story-record-look', T.changeLook, r.name + ' ' + T.changeLook);
      const del = button('story-btn story-btn-quiet story-record-delete', T.delete, r.name + ' ' + T.delete);
      open.addEventListener('click', () => onOpen?.(r.id));
      lookBtn.addEventListener('click', () => {
        store.setAppearance(r.id, r.appearance === 'a' ? 'b' : 'a');
        refresh();
      });
      del.addEventListener('click', async () => {
        const yes = await confirmBox(root, { kind: 'delete', title: T.deleteTitle, text: T.deleteText(r.name), yes: T.deleteYes, no: T.deleteNo });
        if (yes) store.deleteRecord(r.id, { confirmed: true });
        refresh();
      });
      btns.append(open, lookBtn, del);
      info.append(nameRow, btns);
      li.append(thumb, info);
      ul.append(li);
    }
    listBox.append(ul);
  }
  refresh();

  return { root, refresh, dispose: () => root.remove() };
}
