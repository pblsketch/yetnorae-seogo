// WebGL 그림판 살림: 세계·보스·작품 방·모습 미리보기가 함께 쓴다.
//
//   releaseRenderer(renderer)                 그림판을 놓는다. dispose() 뒤 GPU 맥락까지 돌려준다(forceContextLoss).
//                                             브라우저는 한 창의 WebGL 맥락 수를 제한하고, 넘치면 가장 오래된 것(세계)을 잃게 한다.
//   watchContextLoss(canvas, { onLost, onRestored, onGiveUp, giveUpMs })
//                                             그림판을 잃으면(webglcontextlost: GPU 재시작, 드라이버 오류, 맥락 수 초과) onLost,
//                                             되찾으면(webglcontextrestored) onRestored, giveUpMs(TUNING.contextRestoreMs, 3초) 안에
//                                             되찾지 못하면 onGiveUp을 한 번 부른다. 되찾기를 허락하려면 lost 사건의 기본 동작을 막아야 한다.
//                                             Three.js가 먼저 붙인 듣기가 맥락을 다시 차린 뒤 onRestored가 불린다.
//                                             돌려주는 것: { lost(), dispose() }
//   pixelRatioNow(max)                        min(기기 픽셀 비율, max). 브라우저 확대·다른 화면(프로젝터)으로 옮기면 바뀐다.
//   watchPixelRatio(fn)                       기기 픽셀 비율이 바뀌면 fn(). 창 크기가 그대로여도(다른 화면으로 옮김) 알린다. 끄는 함수를 돌려준다.
import { TUNING } from './tuning.js';

export function releaseRenderer(renderer) {
  if (!renderer) return;
  try { renderer.dispose(); } catch (e) { console.error('[webgl] 그림판 치우기 실패', e); }
  let gl = null;
  try { gl = renderer.getContext?.() ?? null; } catch { gl = null; }
  // 이미 잃은 맥락에 loseContext를 다시 부르면 브라우저가 경고를 남긴다
  if (gl && typeof gl.isContextLost === 'function' && gl.isContextLost()) return;
  try { renderer.forceContextLoss(); } catch (e) { console.error('[webgl] 맥락 돌려주기 실패', e); }
}

export function watchContextLoss(canvas, { onLost = null, onRestored = null, onGiveUp = null, giveUpMs = TUNING.contextRestoreMs } = {}) {
  let lost = false;
  let timer = 0;
  let off = false;
  const handleLost = (e) => {
    e.preventDefault();   // 되찾기를 허락한다
    if (off || lost) return;
    lost = true;
    try { onLost?.(); } catch (err) { console.error('[webgl] 그림판 잃음 처리 실패', err); }
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      if (off || !lost) return;
      try { onGiveUp?.(); } catch (err) { console.error('[webgl] 2D로 바꾸기 실패', err); }
    }, giveUpMs);
  };
  const handleRestored = () => {
    if (off || !lost) return;
    lost = false;
    clearTimeout(timer);
    timer = 0;
    try { onRestored?.(); } catch (err) { console.error('[webgl] 그림판 되찾기 처리 실패', err); }
  };
  canvas.addEventListener('webglcontextlost', handleLost, false);
  canvas.addEventListener('webglcontextrestored', handleRestored, false);
  return {
    lost: () => lost,
    dispose() {
      off = true;
      clearTimeout(timer);
      timer = 0;
      canvas.removeEventListener('webglcontextlost', handleLost, false);
      canvas.removeEventListener('webglcontextrestored', handleRestored, false);
    },
  };
}

export function pixelRatioNow(max = TUNING.pixelRatioMax) {
  return Math.min(globalThis.devicePixelRatio || 1, max);
}

export function watchPixelRatio(fn) {
  if (typeof globalThis.matchMedia !== 'function') return () => {};
  let mq = null;
  const listen = (on) => {
    if (!mq) return;
    if (typeof mq.addEventListener === 'function') mq[on ? 'addEventListener' : 'removeEventListener']('change', onChange);
    else mq[on ? 'addListener' : 'removeListener']?.(onChange);   // 옛 사파리
  };
  function arm() {
    listen(false);
    mq = globalThis.matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`);
    listen(true);
  }
  function onChange() {
    arm();   // 새 비율로 다시 건다(이 질의는 한 비율만 본다)
    try { fn(); } catch (e) { console.error('[webgl] 픽셀 비율 따라가기 실패', e); }
  }
  arm();
  return () => { listen(false); mq = null; };
}
