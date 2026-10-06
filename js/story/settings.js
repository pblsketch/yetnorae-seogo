// 설정 화면(spec 13 기기 공통 설정, 14 접근성): 배경음·낭송·효과음 크기, 소리 끄기, 빗금 모드, 글자 크기 3단계,
// 움직임 줄이기, 박자 다시 맞추기, 전체 화면(쓸 수 있는 기기에서만, 저장하지 않음).
// 바꾸면 곧바로 저장 엔진(device)에 저장하고 그 자리에서 적용한다.
//   - 소리: 소리 엔진의 setVolume·setMuted·setSlashMode(박자 없는 방식 신호는 엔진이 낸다)
//   - 글자 크기: 문서의 --text-scale, settings:text-scale 사건
//   - 움직임 줄이기: 세계 바탕의 움직임 상태(#app.reduce-motion), settings:reduce-motion 사건
// 시작 화면과 게임 중 어디서나 연다. 게임 중에는 '기록 목록으로', 서고 완성 뒤에는 '마지막 카드'도 둔다.
import { emit } from '../core/events.js';
import { TEXT_SCALES } from '../core/save.js';
import { setDeviceReduceMotion } from '../world/motion.js';
import { STORY } from '../data/story.js';
import { el, button } from './dom.js';
import { fullscreenButton } from './fullscreen.js';

const S = STORY.settings;

export function applyTextScale(value) {
  const v = TEXT_SCALES.includes(value) ? value : 1;
  document.documentElement.style.setProperty('--text-scale', String(v));
  return v;
}

// 저장된 기기 설정을 한 번에 적용한다(앱을 열 때).
export function applyDevice(device, audio) {
  applyTextScale(device?.textScale);
  setDeviceReduceMotion(!!device?.reduceMotion);
  audio?.applySettings?.(device ?? {});
}

// host: 띄울 곳. store: 저장 엔진. audio: 소리 엔진. onRecalibrate(): 박자 다시 맞추기를 연다(약속을 돌려준다).
// extras: [{ className, label, run }] — 게임 중에만 더하는 단추(기록 목록으로, 마지막 카드 등). 누르면 설정을 닫고 run().
// 돌려주는 것: { box, close() }
export function openSettings(host, { store, audio, onRecalibrate, onClose, extras = [] } = {}) {
  const device = () => store.data.device;
  const shade = el('div', 'story-settings-shade');
  const box = el('section', 'story-settings');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', S.title);
  const head = el('div', 'story-panel-head');
  const closeBtn = button('story-btn story-btn-quiet story-settings-close', S.close);
  head.append(el('h2', 'story-panel-title', S.title), closeBtn);
  const body = el('div', 'story-panel-body story-scroll');
  box.append(head, body);
  shade.append(box);
  host.append(shade);

  // ── 소리 크기 ──
  const volBox = el('fieldset', 'story-field');
  volBox.append(el('legend', 'story-field-title', S.volumeTitle));
  for (const ch of ['bgm', 'voice', 'sfx']) {
    const row = el('label', 'story-range');
    const name = el('span', 'story-range-name', S[ch]);
    const input = el('input', 'story-range-input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.05';
    input.dataset.setting = ch;
    input.value = String(device().volume[ch]);
    input.setAttribute('aria-label', S.volumeTitle + ' — ' + S[ch]);
    input.addEventListener('input', () => {
      const v = Math.min(1, Math.max(0, Number(input.value)));
      store.updateDevice({ volume: { [ch]: v } });
      audio?.setVolume?.(ch, v);
    });
    row.append(name, input);
    volBox.append(row);
  }
  body.append(volBox);

  // ── 켜고 끄기 ──
  function toggle(key, label, apply) {
    const row = el('label', 'story-check');
    const input = el('input', 'story-check-input');
    input.type = 'checkbox';
    input.dataset.setting = key;
    input.checked = !!device()[key];
    input.addEventListener('change', () => {
      store.updateDevice({ [key]: input.checked });
      apply(input.checked);
    });
    row.append(input, el('span', 'story-check-name', label));
    return row;
  }
  const checks = el('div', 'story-field story-checks');
  checks.append(
    toggle('muted', S.muted, (v) => audio?.setMuted?.(v)),
    toggle('slashMode', S.slashMode, (v) => audio?.setSlashMode?.(v)),
    toggle('reduceMotion', S.reduceMotion, (v) => {
      setDeviceReduceMotion(v);
      emit('settings:reduce-motion', { value: v });
    }),
  );
  body.append(checks);

  // ── 글자 크기 3단계 ──
  const scaleBox = el('fieldset', 'story-field');
  scaleBox.append(el('legend', 'story-field-title', S.textScaleTitle));
  const scaleRow = el('div', 'story-scales');
  const scaleBtns = S.textScales.map(({ value, label }) => {
    const b = button('story-btn story-scale', label);
    b.dataset.scale = String(value);
    b.style.setProperty('--scale-preview', String(value));
    b.addEventListener('click', () => {
      store.updateDevice({ textScale: value });
      applyTextScale(value);
      emit('settings:text-scale', { value });
      syncScales();
    });
    return b;
  });
  function syncScales() {
    for (const b of scaleBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.scale) === device().textScale));
  }
  syncScales();
  scaleRow.append(...scaleBtns);
  scaleBox.append(scaleRow);
  body.append(scaleBox);

  // ── 박자 다시 맞추기 ──
  const recal = button('story-btn story-recalibrate', S.recalibrate);
  recal.addEventListener('click', async () => {
    recal.disabled = true;
    try { await onRecalibrate?.(); } finally { recal.disabled = false; }
  });
  body.append(recal);

  // ── 전체 화면(저장하지 않는다. 켤 때마다 누른다) ──
  const fs = fullscreenButton('story-btn story-settings-fullscreen');
  if (fs) {
    const fsBox = el('div', 'story-field story-fs-field');
    fsBox.append(fs.el, el('p', 'story-hint', STORY.fullscreen.note));
    body.append(fsBox);
  }

  // ── 게임 중에만: 기록 목록으로, 마지막 카드 ──
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    fs?.dispose();
    shade.remove();
    onClose?.();
  };
  if (extras.length) {
    const more = el('div', 'story-field story-more');
    for (const x of extras) {
      const b = button('story-btn ' + x.className, x.label);
      b.addEventListener('click', () => { close(); x.run(); });
      more.append(b);
    }
    body.append(more);
  }
  body.append(el('p', 'story-note', S.note));

  closeBtn.addEventListener('click', close);
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  closeBtn.focus({ preventScroll: true });
  return { box, close };
}
