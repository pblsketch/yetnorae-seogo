// 화질 단계(자동, T39). 세계 3D 그림이 오래 느리면 한 단계씩 가볍게 그린다. 바깥 설정이나 저장 값은 없다.
//
//   단계 0 '기본'       픽셀 비율 = min(기기 비율, 1.5)
//   단계 1 '가볍게'     픽셀 비율 × 0.8(그리는 픽셀이 약 3분의 2)
//   단계 2 '가장 가볍게' 픽셀 비율 × 0.65(약 절반 아래), 꾸밈 겹(관 사이 종이 나무, 먼 수묵 산)을 숨긴다
//
// 정하는 법(TUNING.quality):
//   - 세계가 실제로 그린 프레임만 잰다. 가림(보스·입구·엔딩·판 카드·수첩 창), 회전 안내, 숨은 창 동안은 재지 않는다.
//   - 장면이 바뀌면(관·회랑 들어가기, 방 무대 열고 닫기, 반반 틀, 가림이 풀림) 처음 settleSec(2.5초)는 버린다(셰이더 엮기·첫 짓기 끊김).
//   - 그 뒤 windowSec(5초) 동안의 평균 fps가 lowFps(18) 아래면 한 단계 내린다. 한 프레임이 0.25초를 넘으면(짓기·탭 바꿈 같은 끊김)
//     그 프레임은 셈에서 뺀다. 내린 뒤에는 다시 settleSec을 기다린다.
//   - 단계는 내려가기만 한다(같은 창이 열려 있는 동안). 오르내림을 되풀이하지 않게 하고, 점검과 수업 중 화면이 들쑥날쑥하지 않게 한다.
//     창을 새로 열면 0에서 다시 시작한다.
//   - 2D 그림 판은 재지 않는다.
// 바뀌면 onQualityChange로 알린다. 세계 3D(scene3d.js)가 그리기 판 픽셀 비율과 꾸밈 겹을 바꾼다.
import { TUNING } from './tuning.js';

export const QUALITY_TIERS = Object.freeze([
  Object.freeze({ tier: 0, name: '기본', pixelScale: 1, decor: true }),
  Object.freeze({ tier: 1, name: '가볍게', pixelScale: 0.8, decor: true }),
  Object.freeze({ tier: 2, name: '가장 가볍게', pixelScale: 0.65, decor: false }),
]);

let tier = 0;
const listeners = new Set();

export function qualityTier() {
  return tier;
}

export function qualityInfo() {
  return { ...QUALITY_TIERS[tier] };
}

export function onQualityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function stepDown(fps) {
  if (tier >= QUALITY_TIERS.length - 1) return false;
  tier++;
  console.info(`[world] 화질 단계를 '${QUALITY_TIERS[tier].name}'(으)로 낮춤: 평균 ${fps.toFixed(1)}fps`);
  for (const fn of [...listeners]) {
    try { fn(QUALITY_TIERS[tier]); } catch (e) { console.error('[world] 화질 단계 바꾸기 실패', e); }
  }
  return true;
}

// 프레임 재개. add(초)는 세계가 그린 프레임마다, reset()은 장면이 바뀔 때 부른다.
export function createQualityMeter({ enabled = true } = {}) {
  const Q = TUNING.quality;
  let settle = 0;
  let time = 0;
  let frames = 0;
  const reset = () => { settle = 0; time = 0; frames = 0; };
  return {
    reset,
    add(dt) {
      if (!enabled || !(dt > 0)) return;
      if (settle < Q.settleSec) { settle += dt; return; }
      if (dt > Q.hitchSec) return;
      time += dt;
      frames++;
      if (time < Q.windowSec) return;
      const fps = frames / time;
      time = 0;
      frames = 0;
      if (fps < Q.lowFps && stepDown(fps)) reset();
    },
    dispose() { reset(); },
  };
}
