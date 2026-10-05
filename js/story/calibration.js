// 처음 켜는 기기의 이어폰 안내와 박자 맞추기(spec 15, 20).
// 종소리 여덟 번(소리 엔진 playCalibration)을 따라 치게 해 보정값을 계산하고(rhythm.js calibrationOffset) 기기 설정에 저장한다.
// 건너뛰면 보정값 0으로 저장한다. 어느 쪽이든 calibrated: true가 되어 이 기기에서는 다시 묻지 않는다(설정에서 다시 맞춘다).
import { calibrationOffset, CALIBRATION_BEATS, CALIBRATION_SKIP_OFFSET_MS } from '../core/rhythm.js';
import { STORY } from '../data/story.js';
import { el, button } from './dom.js';

const F = STORY.firstRun;

// host: 띄울 곳. step: 'earphone'(처음 켤 때) | 'calibrate'(설정에서 다시 맞출 때).
// onOffset(ms): 보정값이 정해지면 부른다(지금 세션의 박자 손잡이에 알리기).
// 돌려주는 약속은 단계를 마치거나 건너뛰면 끝난다.
export function runCalibration(host, { audio, store, step = 'earphone', onOffset } = {}) {
  return new Promise((resolve) => {
    const shade = el('div', 'story-firstrun');
    shade.setAttribute('role', 'dialog');
    shade.setAttribute('aria-modal', 'true');
    const card = el('section', 'story-firstrun-card');
    const body = el('div', 'story-firstrun-body story-scroll');
    const actions = el('div', 'story-actions');
    card.append(body, actions);
    shade.append(card);
    host.append(shade);
    let playing = null;

    const finish = (offsetMs) => {
      playing?.stop?.();
      playing = null;
      store.updateDevice({ calibrationOffsetMs: offsetMs, calibrated: true });
      onOffset?.(offsetMs);
      shade.remove();
      resolve(offsetMs);
    };

    function showEarphone() {
      shade.dataset.step = 'earphone';
      shade.setAttribute('aria-label', F.earphoneTitle);
      body.replaceChildren(el('h2', 'story-h', F.earphoneTitle), ...F.earphone.map((t) => el('p', 'story-p', t)));
      const next = button('story-btn story-next', F.earphoneNext);
      next.addEventListener('click', showCalibrate, { once: true });
      actions.replaceChildren(next);
      next.focus({ preventScroll: true });
    }

    function showCalibrate() {
      shade.dataset.step = 'calibrate';
      shade.setAttribute('aria-label', F.calTitle);
      const bells = el('div', 'story-cal-bells');
      bells.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < CALIBRATION_BEATS; i++) bells.append(el('span', 'story-cal-bell'));
      const status = el('p', 'story-cal-status');
      status.setAttribute('aria-live', 'polite');
      body.replaceChildren(el('h2', 'story-h', F.calTitle), el('p', 'story-p', F.calText), bells, status);
      const start = button('story-btn story-cal-start', F.calStart);
      const tap = button('story-btn story-cal-tap', F.calTap);
      tap.disabled = true;
      const skip = button('story-btn story-btn-quiet story-cal-skip', F.calSkip);
      actions.replaceChildren(skip, start, tap);
      skip.addEventListener('click', () => finish(CALIBRATION_SKIP_OFFSET_MS));

      let taps = [];
      const marks = [...bells.children];
      tap.addEventListener('pointerdown', (e) => {
        if (!playing) return;
        const t = audio?.tap?.(e.timeStamp);
        if (typeof t === 'number') {
          taps.push(t);
          marks[Math.min(marks.length - 1, taps.length - 1)]?.classList.add('is-on');
        }
      });
      tap.addEventListener('keydown', (e) => {
        if (!playing || (e.key !== ' ' && e.key !== 'Enter')) return;
        e.preventDefault();
        const t = audio?.tap?.(e.timeStamp);
        if (typeof t === 'number') { taps.push(t); marks[Math.min(marks.length - 1, taps.length - 1)]?.classList.add('is-on'); }
      });

      start.addEventListener('click', async () => {
        try { audio?.unlock?.(); } catch { /* 소리 판을 열 수 없음 */ }
        if (!audio?.playCalibration) { status.textContent = F.calLocked; return; }
        taps = [];
        marks.forEach((m) => m.classList.remove('is-on'));
        start.disabled = true;
        tap.disabled = false;
        tap.focus({ preventScroll: true });
        status.textContent = F.calListening;
        playing = audio.playCalibration();
        const r = await playing.finished;
        playing = null;
        tap.disabled = true;
        start.disabled = false;
        if (!shade.isConnected) return;
        if (!r?.completed) { status.textContent = F.calLocked; start.textContent = F.calAgain; return; }
        const res = calibrationOffset(r.bells, taps);
        if (!res.ok) { status.textContent = F.calRetry; start.textContent = F.calAgain; return; }
        status.textContent = F.calOk;
        const done = button('story-btn story-next story-cal-done', F.calDone);
        done.addEventListener('click', () => finish(res.offsetMs), { once: true });
        actions.replaceChildren(start, done);
        done.focus({ preventScroll: true });
      });
      start.focus({ preventScroll: true });
    }

    if (step === 'calibrate') showCalibrate();
    else showEarphone();
  });
}
