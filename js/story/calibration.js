// 처음 켜는 기기의 이어폰 안내와 박자 맞추기(spec 15, 20).
// 종소리 여덟 번(소리 엔진 playCalibration)을 따라 치게 해 보정값을 계산하고(rhythm.js calibrationOffset) 기기 설정에 저장한다.
// 건너뛰면 보정값 0으로 저장한다. 어느 쪽이든 calibrated: true가 되어 이 기기에서는 다시 묻지 않는다(설정에서 다시 맞춘다).
// '시작'을 누르면 종과 같은 간격(0.8초)으로 '셋 · 둘 · 하나'를 크게 보이고 딱 소리(종이 아님)를 낸 뒤 종이 울린다(교사 결정
// 2026-10-07: 알림 없이 종이 시작되었다). 세는 동안 친 것은 종과 짝짓지 않는다. 움직임 줄이기면 세는 글자만 바뀐다(움직임 없음).
import { calibrationOffset, CALIBRATION_BEATS, CALIBRATION_SKIP_OFFSET_MS, CALIBRATION_INTERVAL_SEC } from '../core/rhythm.js';
import { STORY } from '../data/story.js';
import { el, button } from './dom.js';

const F = STORY.firstRun;
// 첫 종보다 이만큼(종 간격의 절반, 짝짓기 한계와 같다) 앞서 친 것은 세는 동안의 탭으로 보고 버린다
const EARLY_SEC = CALIBRATION_INTERVAL_SEC / 2;

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
      // 세는 말(셋 · 둘 · 하나): 크게, 종이 시작되면 숨는다
      const count = el('p', 'story-cal-count');
      count.setAttribute('aria-live', 'assertive');
      count.hidden = true;
      body.replaceChildren(el('h2', 'story-h', F.calTitle), el('p', 'story-p', F.calText), bells, status);
      card.append(count);
      const start = button('story-btn story-cal-start', F.calStart);
      const tap = button('story-btn story-cal-tap', F.calTap);
      tap.disabled = true;
      const skip = button('story-btn story-btn-quiet story-cal-skip', F.calSkip);
      actions.replaceChildren(skip, start, tap);
      skip.addEventListener('click', () => finish(CALIBRATION_SKIP_OFFSET_MS));

      let taps = [];
      const marks = [...bells.children];
      // 종을 짝지을 탭만 모은다: 종소리 시각이 정해지기 전과 세는 동안(첫 종보다 EARLY_SEC 넘게 앞선 탭)은 버린다
      const take = (t) => {
        if (typeof t !== 'number') return;
        const b = playing?.bells?.() ?? [];
        if (!b.length || t < b[0] - EARLY_SEC) return;
        taps.push(t);
        marks[Math.min(marks.length - 1, taps.length - 1)]?.classList.add('is-on');
      };
      tap.addEventListener('pointerdown', (e) => {
        if (!playing) return;
        take(audio?.tap?.(e.timeStamp));
      });
      tap.addEventListener('keydown', (e) => {
        if (!playing || (e.key !== ' ' && e.key !== 'Enter')) return;
        e.preventDefault();
        if (e.repeat) return;   // 누른 채 있는 키의 되풀이는 탭이 아니다
        take(audio?.tap?.(e.timeStamp));
      });

      const showCount = (n) => {
        count.hidden = false;
        count.dataset.n = String(n);
        count.textContent = F.calCount[n] ?? String(n);
        // 움직임 줄이기가 아니면 글자가 한 번 튀어 오른다(CSS). 같은 글자를 다시 보일 때도 다시 튀게 한다
        count.classList.remove('is-pop');
        void count.offsetWidth;
        count.classList.add('is-pop');
      };
      const resetRun = () => {
        taps = [];
        marks.forEach((m) => m.classList.remove('is-on'));
        count.hidden = true;
        status.textContent = F.calReady;
      };

      start.addEventListener('click', async () => {
        try { audio?.unlock?.(); } catch { /* 소리 판을 열 수 없음 */ }
        if (!audio?.playCalibration) { status.textContent = F.calLocked; return; }
        resetRun();
        start.disabled = true;
        tap.disabled = false;
        tap.focus({ preventScroll: true });
        // 셋 · 둘 · 하나(종과 같은 간격, 딱 소리) 뒤에 종 여덟 번. 멈췄다 재개하면 세기부터 다시 내므로 그 전의 탭은 버린다
        playing = audio.playCalibration({
          onRestart: resetRun,
          onBeat: (b) => {
            if (b.kind === 'count') showCount(b.n);
            else if (b.index === 0) { count.hidden = true; status.textContent = F.calListening; }
          },
        });
        const r = await playing.finished;
        playing = null;
        count.hidden = true;
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
