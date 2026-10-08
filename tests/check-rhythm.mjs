// 소리와 박자 엔진 점검(T3).
//  1부 — js/core/rhythm.js를 Node에서 바로 시험한다: 박자 칸 배치, 판정 창 경계 안팎, 보정값 적용,
//        놓친 박 세기와 빗금 모드 권하기, 단위 하나 다시 듣기, 박자 보정 계산, 리믹스 지점 판정, 박자 없는 상태.
//  2부 — js/core/audio.js를 브라우저에서 시험한다(tests/pages/audio-test.html). 시험용 무음·삑 소리를
//        브라우저 안에서 만들어 일정 박자 배치, 배경음 줄이기, 멈춤·재개 때 단위 처음부터 다시, 첫 조작 전 무음을 본다.
// 시험용 노래는 형식만 갖춘 가짜이고 게임 데이터가 아니다.
import * as R from '../js/core/rhythm.js';
import { startServer } from './lib/server.mjs';
import { openGame } from './lib/browser.mjs';

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── 시험용 가짜 노래 ──
const feet = (n) => Array.from({ length: n }, (_, i) => ({ original: '가' + i, reading: '가' + i }));
const sijo = { id: 't-sijo', genre: 'sijo', units: [{ feet: feet(4), gloss: 'ㄱ' }, { feet: feet(4), gloss: 'ㄴ' }, { feet: feet(4), gloss: 'ㄷ' }] };
const sijoFast = { ...sijo, id: 't-sijo-fast', tempo: 120 };
const goryeo = {
  id: 't-goryeo', genre: 'goryeo',
  units: [{ lines: [{ feet: feet(3), gloss: 'ㄱ' }, { feet: feet(3), gloss: 'ㄴ' }] }, { lines: [{ feet: feet(3), gloss: 'ㄷ' }, { feet: feet(3), gloss: 'ㄹ' }] }],
};
const hyangga = { id: 't-hyangga', genre: 'hyangga', units: [0, 1, 2, 3].map((i) => ({ original: '향' + i, decipherment: '해' + i, reading: '소' + i, gloss: '풀' + i })) };
const gasa = { id: 't-gasa', genre: 'gasa', units: [0, 1, 2, 3].map(() => ({ feet: feet(4), gloss: 'ㄱ' })) };
const saseol = { id: 't-saseol', genre: 'saseol', units: [{ feet: feet(4), gloss: 'ㄱ' }, { feet: feet(9), gloss: 'ㄴ' }, { feet: feet(4), gloss: 'ㄷ' }] };

// ═════════════ 1부: rhythm.js ═════════════
console.log('— 조정 가능한 기본값');
ok(R.TAP_WINDOW_MS === 150, '두드리기 판정 창 기본값은 ±150ms');
ok(R.MISS_SUGGEST_SLASH === 3, '빗금 모드를 권하는 놓친 박 수 기본값은 3');
ok(R.CALIBRATION_BEATS === 8, '박자 보정 종소리는 여덟 번');
ok(R.CALIBRATION_SKIP_OFFSET_MS === 0, '보정을 건너뛰면 보정값 0');
ok(typeof R.DEFAULT_TEMPO === 'object' && ['hyangga', 'goryeo', 'sijo', 'gasa', 'saseol'].every((g) => R.DEFAULT_TEMPO[g] > 0), '갈래마다 기본 빠르기가 있다');
ok(R.REMIX_WINDOW_MS && R.REMIX_WINDOW_MS.before > 0 && R.REMIX_WINDOW_MS.after > 0, '리믹스 지점 판정 창이 있다');

console.log('— 빠르기');
ok(R.tempoOf(sijo) === R.DEFAULT_TEMPO.sijo, '빠르기가 없는 노래는 갈래 기본값');
ok(R.tempoOf(sijoFast) === 120, '노래의 tempo를 쓴다');
ok(R.tempoOf(sijoFast, { tempo: 90 }) === 90, '선택값 tempo가 가장 앞선다');

console.log('— 박자 칸 배치(시조)');
{
  const g = R.buildGrid(sijo, { tempo: 60, gapSec: 0.8 });
  ok(g.beatSec === 1, '60박/분이면 박 하나 1초');
  ok(g.beats.length === 12 && g.segments.length === 3, '시조 세 장 = 박 12개, 단위 셋');
  ok(g.beats.slice(0, 4).every((b, i) => near(b.time, i)), '한 장 안에서 박이 일정한 간격으로 놓인다');
  ok(near(g.segments[1].start, 4.8) && near(g.beats[4].time, 4.8), '다음 장은 앞 장 끝 + 단위 사이 쉼에서 시작');
  ok(near(g.duration, 13.6), '전체 길이 = 박 12개 + 쉼 둘');
  ok(g.beats[4].path === 'assets/audio/voice/t-sijo/1-0.mp3' && g.beats[11].path === 'assets/audio/voice/t-sijo/2-3.mp3', '박마다 약속된 낭송 조각 경로');
  ok(g.beats[6].unit === 1 && g.beats[6].foot === 2 && g.beats[6].line === null && g.beats[6].segment === 1, '박에 단위·음보·단위 번호가 붙는다');
  const fast = R.buildGrid(sijoFast, { gapSec: 0.8 });
  ok(near(fast.beatSec, 0.5) && near(fast.beats[1].time, 0.5), '노래별 빠르기(120)가 박 간격에 반영된다');
  const dflt = R.buildGrid(sijo);
  ok(near(dflt.segments[1].start - dflt.segments[0].start, 4 * dflt.beatSec + R.SEGMENT_GAP_SEC), '쉼 기본값은 SEGMENT_GAP_SEC');
}

console.log('— 박자 칸 배치(고려가요는 줄, 향가는 구)');
{
  const g = R.buildGrid(goryeo, { tempo: 60, gapSec: 0.5 });
  ok(g.segments.length === 4 && g.segments.every((s) => s.beats.length === 3), '고려가요는 줄마다 단위(두드리기는 줄 단위)');
  ok(g.segments[3].unit === 1 && g.segments[3].line === 1, '고려가요 단위에 연·줄 번호');
  ok(g.beats[3].path === 'assets/audio/voice/t-goryeo/0-1-0.mp3', '고려가요 조각 이름은 연-줄-음보');
  const h = R.buildGrid(hyangga, { tempo: 20, gapSec: 0.5 });
  ok(h.beats.length === 4 && h.segments.length === 4 && near(h.beatSec, 3), '향가는 구마다 박 하나(구 조각 하나)');
  ok(h.beats[2].path === 'assets/audio/voice/t-hyangga/2.mp3' && h.beats[2].foot === null, '향가 조각 이름은 구 번호');
}

console.log('— 조각 배치와 단위 하나 다시 듣기');
{
  const g = R.buildGrid(sijo, { tempo: 60, gapSec: 0.8 });
  const at = R.scheduleSegments(g, [0, 1, 2], 5);
  ok(at.length === 3 && near(at[0].at, 5) && near(at[1].at, 9.8) && near(at[2].at, 14.6), '단위 시작 시각이 칸을 따라 이어진다');
  const clips = R.clipSchedule(g, [1], 10);
  ok(clips.length === 4 && clips.every((c, i) => near(c.when, 10 + i) && c.path === 'assets/audio/voice/t-sijo/1-' + i + '.mp3'), '단위 하나만 다시: 둘째 장 조각 넷이 새 시작점에서 일정 박자로');
  const all = R.clipSchedule(g, [0, 1, 2], 0);
  ok(all.length === 12 && near(all[4].when, 4.8), '노래 전체 조각 배치');
  ok(R.segmentIndexOf(g, 2) === 2 && R.segmentIndexOf(R.buildGrid(goryeo), 1, 0) === 2, '단위 번호로 단위 찾기');
}

console.log('— 판정 창 경계');
{
  const j = (beat, tap, o = {}) => R.judgeTap(beat, tap, { offsetMs: 0, windowMs: 150, ...o });
  ok(j(1, 1.15).inside === true, '+150ms는 안(경계 포함)');
  ok(j(1, 0.85).inside === true, '-150ms는 안(경계 포함)');
  ok(j(1, 1.151).inside === false, '+151ms는 밖');
  ok(j(1, 0.849).inside === false, '-151ms는 밖');
  ok(near(j(1, 1.1).deltaMs, 100, 1e-3), '차이(ms)를 돌려준다');
  ok(R.judgeTap(1, 1.15).inside === true && R.judgeTap(1, 1.16).inside === false, '창을 주지 않으면 기본 ±150ms');
  ok(j(1, 1.2, { windowMs: 200 }).inside === true, '창을 바꿀 수 있다');
  console.log('— 보정값 적용(탭 시각에서 뺀다)');
  ok(j(1, 1.24, { offsetMs: 100 }).inside === true, '보정값 100: +240ms 탭은 보정 뒤 +140ms라 안');
  ok(j(1, 1.24).inside === false, '보정값 없으면 +240ms는 밖');
  ok(j(1, 0.84, { offsetMs: 100 }).inside === false, '보정값 100: -160ms 탭은 보정 뒤 -260ms라 밖(더하면 안으로 잘못 들어감)');
  ok(near(j(1, 1.25, { offsetMs: 100 }).deltaMs, 150, 1e-3) && j(1, 1.25, { offsetMs: 100 }).inside, '보정 뒤 정확히 +150ms는 안');
}

console.log('— 두드리기 회차: 놓친 박 세기와 빗금 모드 권하기');
{
  const g = R.buildGrid(sijo, { tempo: 60, gapSec: 0.8 });
  const s = R.createTapSession(g, { offsetMs: 0 });
  ok(s.tap(100).hit === false, '단위를 열기 전 탭은 인정하지 않는다');
  s.arm(0, 100);
  const t0 = s.tap(100.1);
  ok(t0.hit && t0.beat === 0 && t0.unit === 0 && t0.foot === 0, '열린 단위의 박 안 탭 인정');
  ok(s.tap(100.12).hit === false, '같은 박을 두 번 쳐도 한 번만');
  ok(s.tap(101).hit && s.tap(102.2).hit === false && s.tap(103).hit, '창 밖 탭(+200ms)은 인정하지 않는다');
  let r = s.close(0);
  ok(r.ok === false && r.missed === 1 && r.totalMissed === 1 && r.suggestSlash === false && r.replay === true, '박 하나 놓침 → 그 단위를 다시 듣는다, 아직 권하지 않음');
  ok(s.tap(102).hit === false, '닫힌 단위의 탭은 인정하지 않는다');
  s.arm(0, 200); // 단위 하나 다시 듣기: 새 시작점
  ok(s.tap(102).hit === false, '다시 들을 때는 새 시작점 기준(옛 시각은 밖)');
  [200, 201, 202, 203].forEach((t) => s.tap(t + 0.05));
  r = s.close(0);
  ok(r.ok === true && r.missed === 0 && r.replay === false && r.totalMissed === 1, '다시 들은 단위를 다 맞힘');
  ok(s.missesBySegment()[0] === 1, '단위마다 놓친 박 수를 센다');

  const s2 = R.createTapSession(g, {});
  s2.arm(1, 0); s2.tap(0); s2.tap(1);
  r = s2.close(1);
  ok(r.totalMissed === 2 && r.suggestSlash === false, '놓친 박 2: 아직 권하지 않음');
  s2.arm(1, 10); s2.tap(10); s2.tap(11); s2.tap(12);
  r = s2.close(1);
  ok(r.totalMissed === 3 && r.suggestSlash === true, '놓친 박이 3에 닿으면 빗금 모드를 권한다');
  s2.arm(1, 20);
  r = s2.close(1);
  ok(r.totalMissed === 7 && r.suggestSlash === false, '권하기는 한 번만');
  const s3 = R.createTapSession(g, { missLimit: 5 });
  s3.arm(0, 0); r = s3.close(0);
  ok(r.totalMissed === 4 && r.suggestSlash === false, '기준값을 바꿀 수 있다(5)');

  const s4 = R.createTapSession(g, { offsetMs: 80 });
  s4.arm(0, 0);
  const h = s4.tap(0.2);
  ok(h.hit && near(h.deltaMs, 120, 1e-3), '회차 판정에도 보정값을 뺀다');
  ok(s4.tap(1.24).hit === false, '보정 뒤 +160ms는 밖');
  s4.disarm(0);
  ok(s4.tap(2.08).hit === false, '멈춘(닫힌) 단위의 탭은 무시');
  ok(s4.tap(null).hit === false, '시각이 없는 탭(멈춤 중)은 무시');

  const s5 = R.createTapSession(R.buildGrid(hyangga, { tempo: 20 }), {});
  for (let i = 0; i < 4; i++) { s5.arm(i, i * 10); s5.tap(i * 10 + 0.01); s5.close(i); }
  ok(s5.done() === true, '모든 단위를 맞히면 끝(향가는 구마다)');
  ok(s.done() === false, '맞히지 않은 단위가 남으면 끝이 아님');
}

console.log('— 고려가요 여음·후렴: 박이 아닌 칸(판정 창 없음, 놓친 박으로 세지 않음)');
{
  // 줄 0: 박 셋 + 여음 하나(나ᄂᆞᆫ 자리), 줄 1: 후렴만(듣기만 하는 줄)
  const mk = (t, kind) => (kind ? { original: t, reading: t, kind } : { original: t, reading: t });
  const gy = {
    id: 't-goryeo-off', genre: 'goryeo',
    units: [{ lines: [
      { feet: [mk('가'), mk('나'), mk('다'), mk('라', 'yeoeum')], gloss: 'ㄱ' },
      { feet: [mk('후', 'refrain'), mk('렴', 'refrain')], gloss: 'ㄴ' },
    ] }],
  };
  const g = R.buildGrid(gy, { tempo: 60, gapSec: 0.8 });
  ok(g.beats.length === 6 && g.beats[3].offbeat === 'yeoeum' && g.beats[4].offbeat === 'refrain' && !g.beats[0].offbeat, '여음·후렴 칸도 낭송 칸으로 놓이고 offbeat 표시가 붙는다');
  ok(g.beats[3].path === 'assets/audio/voice/t-goryeo-off/0-0-3.mp3', '여음 칸의 낭송 조각 경로는 그대로(음보 번호)');
  const s = R.createTapSession(g, {});
  s.arm(0, 0);
  ok(s.tap(3).hit === false, '여음 칸 시각의 탭은 인정하지 않는다(판정 창이 없다)');
  [0, 1, 2].forEach((t) => s.tap(t));
  let r = s.close(0);
  ok(r.ok && r.missed === 0 && r.totalMissed === 0, '박 셋을 맞히면 여음 칸을 치지 않아도 그 줄을 마친다');
  ok(s.listenOnly(1) === true && s.listenOnly(0) === false, '후렴만 있는 줄은 듣기만 하는 단위다');
  s.arm(1, 10);
  ok(s.tap(10).hit === false && s.tap(11).hit === false, '후렴 줄에는 판정 창이 하나도 없다');
  r = s.close(1);
  ok(r.ok && r.missed === 0 && r.replay === false && r.suggestSlash === false, '후렴 줄은 아무것도 치지 않아도 놓친 박이 없다(다시 듣지 않음, 빗금 권유 없음)');
  ok(s.done() === true, '박 줄과 후렴 줄을 모두 마치면 끝');
  // 놓친 박 3개 권유가 여음·후렴 때문에 뜨지 않는다: 박을 모두 맞히고 후렴 줄을 여러 번 들어도 0
  const s2 = R.createTapSession(g, {});
  for (let k = 0; k < 3; k++) { s2.arm(1, k * 10); s2.close(1); }
  s2.arm(0, 50); s2.tap(53); r = s2.close(0);
  ok(r.totalMissed === 3 && r.missed === 3, '여음 칸만 친 줄은 박 셋을 모두 놓친 것으로 센다(여음 탭은 박이 아니다)');
  const s3 = R.createTapSession(g, {});
  for (let k = 0; k < 5; k++) { s3.arm(1, k * 10); const c = s3.close(1); if (c.suggestSlash || c.missed) { ok(false, '후렴 줄 때문에 놓친 박이 생겼다'); break; } }
  ok(s3.totalMissed() === 0, '후렴 줄만 다섯 번 들어도 놓친 박 0(빗금 권유 없음)');
  // 음성 사례: offbeat 표시를 지운 칸은 다시 판정 창이 열린다(점검이 차이를 알아본다)
  const g2 = R.buildGrid(gy, { tempo: 60, gapSec: 0.8 });
  delete g2.beats[3].offbeat;
  const s4 = R.createTapSession(g2, {});
  s4.arm(0, 0); [0, 1, 2].forEach((t) => s4.tap(t));
  ok(s4.close(0).missed === 1, '음성 사례: 여음 칸에 박 표시가 없으면 놓친 박 1로 센다');
  // 다른 갈래와 고려가요 표시 없는 줄은 바뀌지 않는다
  ok(R.buildGrid(goryeo, { tempo: 60 }).beats.every((b) => !b.offbeat) && R.buildGrid(sijo, { tempo: 60 }).beats.every((b) => !b.offbeat) && R.buildGrid(hyangga, { tempo: 20 }).beats.every((b) => !b.offbeat), '표시 없는 고려가요·시조·향가에는 offbeat 칸이 없다');
}

console.log('— 쉼에 두드리기 칸(교사 결정 2026-10-07): 음보 조각 뒤 쉼, 판정 창은 쉼에');
{
  ok(R.TAP_PAUSE_SEC === 1 && R.TAP_PAUSE_LEAD_MS === 150 && R.TAP_PAUSE_AFTER_MS === 150, '쉼 1초, 판정 창은 조각 끝 150ms 앞부터 쉼 끝 150ms 뒤까지(기본값)');
  ok(R.TAP_READY_SEC > 0 && R.TAP_READY_SOUND === 'tick' && R.TAP_READY_SOUND !== 'janggu' && R.TAP_READY_SOUND !== 'bell', "새로 시작할 때 '준비' 소리는 장구·종과 다른 딱 소리");
  const g = R.buildPauseGrid(sijo);
  ok(g.pause === true && g.beats.length === 12 && g.segments.length === 3 && g.segments.every((s) => s.beats.length === 4), '시조 세 장 = 음보 12개, 단위 셋(장)');
  ok(g.beats.every((b) => b.pauseSec === 1 && !b.offbeat) && g.beats[5].path === 'assets/audio/voice/t-sijo/1-1.mp3', '음보마다 조각 경로와 쉼 1초');
  ok(near(g.tailSec, 0.15 + R.PAUSE_TAIL_SEC) && near(R.buildPauseGrid(sijo, { offsetMs: 200 }).tailSec, 0.15 + 0.2 + R.PAUSE_TAIL_SEC) && near(R.buildPauseGrid(sijo, { offsetMs: -200 }).tailSec, 0.15 + R.PAUSE_TAIL_SEC), '단위의 끝은 마지막 창이 닫힌 뒤(늦게 치는 기기의 보정값만큼 더 기다린다)');
  ok(g.countInSec === R.TAP_READY_SEC && g.countInSound === 'tick', "칸은 '준비' 소리와 그 뒤 첫 음보까지의 시간을 싣는다");
  ok(R.segmentIndexOf(R.buildPauseGrid(goryeo), 1, 0) === 2 && R.buildPauseGrid(hyangga).beats.length === 4, '고려가요는 줄, 향가는 구마다 조각 하나');
  ok(sijo.tempo === undefined && JSON.stringify(R.buildPauseGrid({ ...sijo, tempo: 240 }).beats) === JSON.stringify(g.beats), '쉼 칸은 노래 빠르기(tempo)를 쓰지 않는다');
  // 시각: 조각 길이 + 쉼이 이어진다
  const dur = [0.4, 0.7, 0.5, 0.9];
  const tm = R.pauseSegmentTiming(g, 0, 10, (b) => dur[b.foot]);
  ok(near(tm.beats[0].when, 10) && near(tm.beats[0].clipEnd, 10.4) && near(tm.beats[0].pauseEnd, 11.4) && near(tm.beats[1].when, 11.4), '음보 조각이 끝나면 쉼 1초, 그 뒤 다음 음보');
  ok(near(tm.beats[3].pauseEnd, 10 + 2.5 + 4) && near(tm.end, tm.beats[3].pauseEnd + g.tailSec), '단위 끝 = 마지막 쉼 끝 + 꼬리');
  ok(near(R.pauseSegmentTiming(g, 0, 0).beats[1].when, R.PAUSE_FALLBACK_CLIP_SEC + 1), '조각 길이를 모르면 어림 길이');
  // 판정 창
  const s = R.createPauseTapSession(g, { offsetMs: 0 });
  ok(s.tap(10.6).hit === false, '단위를 열기 전 탭은 인정하지 않는다');
  s.arm(0, 10, tm);
  let r = s.tap(10.1);
  ok(r.hit === false && r.outside === true, '첫 음보를 읽는 동안(조각 끝 300ms 앞)의 탭은 창 밖(놓친 것이 아니라 안내만)');
  ok(s.tap(10.4 - 0.151).hit === false, '조각 끝 151ms 앞은 밖');
  r = s.tap(10.4 - 0.15);
  ok(r.hit && r.foot === 0 && r.unit === 0, '조각 끝 150ms 앞은 안(경계 포함)');
  r = s.tap(10.9);
  ok(r.hit === false && r.again === true, '같은 쉼에 두 번 쳐도 한 번만(두 번째는 again)');
  ok(s.tap(tm.beats[1].pauseEnd + 0.15).hit === true, '쉼 끝 150ms 뒤까지 안(경계 포함)');
  ok(s.tap(tm.beats[2].pauseEnd + 0.151).hit === false, '쉼 끝 151ms 뒤는 밖');
  r = s.close(0);
  ok(r.ok === false && r.missed === 2 && JSON.stringify(r.missedBeats) === '[2,3]' && r.replay === true && r.totalMissed === 2 && r.suggestSlash === false, '쉼에 치지 않은 음보만 놓친 것(창 밖 탭은 세지 않는다) → 그 단위를 다시 듣는다');
  s.arm(1, 30, R.pauseSegmentTiming(g, 1, 30, (b) => dur[b.foot]));
  r = s.close(1);
  ok(r.totalMissed === 6 && r.suggestSlash === true, '놓친 음보가 모두 3에 닿으면 빗금을 한 번 권한다');
  // 보정값은 탭 시각에서 뺀다
  const so = R.createPauseTapSession(g, { offsetMs: 100 });
  so.arm(0, 0, R.pauseSegmentTiming(g, 0, 0, () => 0.5));
  ok(so.tap(1.5 + 0.15 + 0.1).hit === true, '보정값 100: 쉼 끝 250ms 뒤 탭도 보정 뒤 150ms라 안');
  ok(so.tap(2.0 - 0.15).hit === false, '보정값 100: 둘째 조각 끝 150ms 앞 탭은 보정 뒤 250ms 앞이라 밖(첫 쉼 창도 지났다)');
  // 고려가요 여음·후렴: 쉼 없이 이어 읽고 판정 창이 없다
  const mk = (t, kind) => (kind ? { original: t, reading: t, kind } : { original: t, reading: t });
  const gy = { id: 't-goryeo-p', genre: 'goryeo', units: [{ lines: [
    { feet: [mk('가'), mk('나'), mk('다'), mk('라', 'yeoeum')], gloss: 'ㄱ' },
    { feet: [mk('후', 'refrain'), mk('렴', 'refrain')], gloss: 'ㄴ' },
  ] }] };
  const pg = R.buildPauseGrid(gy);
  ok(pg.beats[3].offbeat === 'yeoeum' && pg.beats[3].pauseSec === 0 && pg.beats[4].pauseSec === 0 && pg.beats[2].pauseSec === 1, '여음·후렴 조각 뒤에는 쉼이 없다');
  const t2 = R.pauseSegmentTiming(pg, 1, 0, () => 0.5);
  ok(near(t2.beats[1].when, 0.5) && near(t2.beats[1].pauseEnd, 1.0), '후렴 조각은 쉼 없이 이어 읽는다');
  const sg = R.createPauseTapSession(pg, {});
  ok(sg.listenOnly(1) && !sg.listenOnly(0), '후렴만 있는 줄은 듣기만 하는 단위');
  sg.arm(1, 0, t2);
  ok(sg.tap(0.5).outside === true && sg.close(1).missed === 0, '후렴 줄에는 판정 창이 없고 놓친 음보도 없다');
  const t0 = R.pauseSegmentTiming(pg, 0, 0, () => 0.5);
  sg.arm(0, 0, t0);
  [0, 1, 2].forEach((k) => sg.tap(t0.beats[k].clipEnd + 0.3));
  ok(sg.tap(t0.beats[3].clipEnd).hit === false && sg.close(0).ok === true, '박 셋을 쉼에 치면 여음을 치지 않아도 그 줄을 마친다(여음 끝에는 창이 없다)');
  // 음성 사례: 예전처럼 음보가 시작할 때(조각 시작) 치면 쉼 칸에서는 하나도 인정되지 않는다
  const old = R.createPauseTapSession(g, {});
  old.arm(0, 10, tm);
  const onset = tm.beats.map((b) => old.tap(b.when + 0.2));
  ok(onset.every((x) => x.hit === false && x.outside) && old.close(0).missed === 4, '음성 사례: 음보를 읽기 시작할 때(시작 200ms 뒤) 친 탭(예전 방식)은 모두 창 밖이다');
  // 음성 사례: 예전 박자 회차(음보 시작 ±150ms)였다면 쉼 가운데 탭은 하나도 인정되지 않는다(점검이 두 창을 가른다)
  const oldGrid = R.buildGrid(sijo, { tempo: 60, gapSec: 0.8 });
  const os = R.createTapSession(oldGrid, {});
  os.arm(0, 10);
  ok([0, 1, 2, 3].every((k) => os.tap(10 + k + 0.6).hit === false), '음성 사례: 음보 시작 기준 창이라면 쉼 가운데(시작 600ms 뒤) 탭은 밖이다');
}

console.log('— 박자 보정 계산');
{
  const bells = R.calibrationBells({ startAt: 2, intervalSec: 0.8 });
  ok(bells.length === 8 && near(bells[0], 2) && near(bells[7], 2 + 7 * 0.8), '종소리 여덟 번의 시각');
  let c = R.calibrationOffset(bells, bells.map((b) => b + 0.06));
  ok(c.ok && c.offsetMs === 60 && c.matched === 8, '모두 60ms 늦으면 보정값 60');
  const d = [50, 70, 60, 60, 40, 80, 60, 60];
  c = R.calibrationOffset(bells, bells.map((b, i) => b + d[i] / 1000));
  ok(c.ok && c.offsetMs === 60, '보정값은 차이의 중앙값(고른 탭이면 평균과 같다)');
  // 첫 종은 미리 알 수 없어 늦게 반응하기 쉽다. 그 탭 하나가 보정값을 끌고 가지 않는다(중앙값)
  const late = [300, 40, 40, 40, 40, 40, 40, 40];
  c = R.calibrationOffset(bells, bells.map((b, i) => b + late[i] / 1000));
  const mean = Math.round(late.reduce((a, b) => a + b, 0) / late.length);
  ok(c.ok && c.offsetMs === 40, '첫 종에 늦게 반응한 탭 하나는 보정값을 바꾸지 않는다(중앙값 40)');
  ok(mean !== 40 && mean === 73, '음성 사례: 평균이었다면 그 탭 하나로 보정값이 ' + mean + 'ms가 된다');
  c = R.calibrationOffset(bells, bells.slice(0, 7).map((b, i) => b + [10, 20, 30, 40, 50, 60, 70][i] / 1000));
  ok(c.ok && c.offsetMs === 40 && c.matched === 7, '짝이 홀수면 가운데 값');
  c = R.calibrationOffset(bells, bells.map((b) => b - 0.03));
  ok(c.ok && c.offsetMs === -30, '일찍 치면 음수 보정값');
  c = R.calibrationOffset(bells, [0, ...bells.map((b) => b + 0.04)]);
  ok(c.ok && c.offsetMs === 40 && c.matched === 8, '종과 먼 탭은 버린다');
  c = R.calibrationOffset(bells, [...bells.map((b) => b + 0.04), bells[3] + 0.3]);
  ok(c.offsetMs === 40, '한 종에 탭이 둘이면 가까운 것만');
  c = R.calibrationOffset(bells, bells.slice(0, 3).map((b) => b + 0.05));
  ok(c.ok === false && c.offsetMs === 0, '맞은 탭이 너무 적으면 보정 실패, 0');
  c = R.calibrationOffset(bells, []);
  ok(c.ok === false && c.offsetMs === R.CALIBRATION_SKIP_OFFSET_MS, '건너뛰면 0');
  const cg = R.calibrationGrid({ intervalSec: 0.5 });
  ok(cg.beats.length === 8 && cg.segments.length === 1 && cg.beats.every((b) => b.sound === 'bell' && b.path === null) && near(cg.beats[3].time, 1.5), '보정용 박자 칸(종소리 여덟)');
  ok(R.CALIBRATION_COUNTDOWN === 3, "종 앞에 '셋 · 둘 · 하나'를 센다(기본 3)");
  const cd = R.calibrationGrid({ intervalSec: 0.8, countdown: 3 });
  ok(cd.beats.length === 11 && cd.beats.slice(0, 3).every((b, i) => b.cue === 'count' && b.n === 3 - i && b.sound === R.TAP_READY_SOUND) && cd.beats.slice(3).every((b) => b.sound === 'bell' && !b.cue), '세는 박 셋(딱 소리, 3·2·1) 뒤에 종 여덟');
  ok(near(cd.beats[1].time - cd.beats[0].time, 0.8) && near(cd.beats[3].time, 2.4), '세는 박은 종과 같은 0.8초 간격이고 첫 종은 세 번째 셈 0.8초 뒤');
  // 세는 동안의 탭(셋·둘·하나에 맞춰 친 것)은 종과 짝짓지 않는다: 첫 종과 800ms 이상 떨어져 400ms 한계 밖이다
  const cb = cd.beats.filter((b) => b.sound === 'bell').map((b) => 10 + b.time);
  const countTaps = cd.beats.filter((b) => b.cue).map((b) => 10 + b.time);
  c = R.calibrationOffset(cb, [...countTaps, ...cb.map((b) => b + 0.05)]);
  ok(c.ok && c.offsetMs === 50 && c.matched === 8, '셋·둘·하나에 맞춰 친 탭은 보정값에 들지 않는다');
}

console.log('— 걷기 한 걸음: 노래 빠르기로 장구 네 번(낭송을 다시 내지 않는다)');
{
  const w = R.walkStepGrid(gasa, { tempo: 40 });
  ok(R.WALK_STEP_BEATS === 4 && w.beats.length === 4 && w.segments.length === 1, '한 걸음 = 박 넷');
  ok(w.beats.every((b) => b.sound === 'janggu' && b.path === null), '걸음의 박은 장구 소리이고 낭송 조각이 없다');
  ok(near(w.beatSec, 1.5) && near(w.beats[3].time, 4.5), '박 간격은 노래 빠르기(40 → 1.5초)');
  ok(near(R.walkStepGrid({ ...gasa, tempo: 30 }).beatSec, 2), '빠르기를 주지 않으면 노래의 tempo');
  const voice = R.buildGrid(gasa, { tempo: 40 }).segments[0];
  ok(R.buildGrid(gasa, { tempo: 40 }).beats.filter((b) => voice.beats.includes(b.index)).every((b) => b.path), '음성 사례: 낭송 칸의 박에는 조각 경로가 있다(걷기 칸과 구별된다)');
}

console.log('— 리믹스(보스 2단계) 지점 판정');
{
  const songs = { 't-gasa': gasa, 't-hyangga': hyangga, 't-goryeo': goryeo, 't-sijo': sijo, 't-saseol': saseol };
  const remix = { fragments: [
    { genre: 'gasa', songId: 't-gasa', from: 0, to: 1 },
    { genre: 'hyangga', songId: 't-hyangga', from: 0, to: 1 },
    { genre: 'goryeo', songId: 't-goryeo', from: 0, to: 0 },
    { genre: 'sijo', songId: 't-sijo', from: 0, to: 0 },
    { genre: 'saseol', songId: 't-saseol', from: 1, to: 1 },
  ] };
  const g = R.buildRemixGrid(remix, (id) => songs[id], { gapSec: 0.5 });
  ok(g.segments.length === 2 + 2 + 2 + 1 + 1, '조각마다 단위를 이어 붙인다');
  ok(g.switches.length === 4 && g.switches.join(',') === '2,4,6,7', '바뀌는 지점 넷 = 다음 조각 첫 단위');
  ok(near(g.segments[2].beatSec, 60 / R.tempoOf(hyangga)) && near(g.segments[0].beatSec, 60 / R.tempoOf(gasa)), '조각마다 그 노래의 빠르기');
  ok(g.beats.find((b) => b.segment === 7).path === 'assets/audio/voice/t-saseol/1-0.mp3', '조각의 낭송 조각 경로');
  ok(R.remixReplaySegments(g, 2).join(',') === '5,6', '놓친 지점 다시 듣기 = 앞 조각 끝 단위 + 뒤 조각 첫 단위');
  let threw = false;
  try { R.buildRemixGrid({ fragments: [{ genre: 'sijo', songId: 'nope', from: 0, to: 0 }] }, (id) => songs[id]); } catch { threw = true; }
  ok(threw, '모르는 노래 조각은 오류');

  const s = R.createRemixSession(g, { offsetMs: 0 });
  const plan = R.scheduleSegments(g, g.segments.map((x) => x.index), 0);
  plan.forEach(({ segment, at }) => s.arm(segment, at));
  const P = g.switches.map((seg) => plan.find((p) => p.segment === seg).at);
  ok(near(R.remixSwitchTimes(g, 0)[0], P[0]), '지점 시각 계산');
  ok(s.tap(P[0] + 0.3).kind === 'hit', '지점 바로 뒤 탭 = 맞음');
  ok(s.tap(P[0] + 0.5).kind === 'repeat', '이미 맞힌 지점 근처 탭은 틀림이 아님');
  ok(s.tap((P[0] + P[1]) / 2).kind === 'wrong', '지점과 먼 곳 탭 = 틀림');
  ok(s.tap(P[1] - R.REMIX_WINDOW_MS.before / 1000 + 0.01).kind === 'hit', '지점 조금 앞(창 안) = 맞음');
  ok(s.tap(P[2] + R.REMIX_WINDOW_MS.after / 1000 + 0.1).kind === 'wrong', '창 뒤로 넘으면 틀림');
  const so = R.createRemixSession(g, { offsetMs: 200 });
  plan.forEach(({ segment, at }) => so.arm(segment, at));
  ok(so.tap(P[3] + R.REMIX_WINDOW_MS.after / 1000 + 0.15).kind === 'hit', '리믹스 판정에도 보정값을 뺀다');
  s.tap(P[3] + 0.2);
  ok(s.missedPoints().join(',') === '2', '놓친 지점 목록');
  ok(s.done() === false, '놓친 지점이 있으면 끝이 아님');
  const re = R.scheduleSegments(g, R.remixReplaySegments(g, 2), 100);
  re.forEach(({ segment, at }) => s.arm(segment, at));
  const np = re.find((p) => p.segment === 6).at;
  ok(s.tap(P[2] + 0.2).kind === 'wrong', '다시 들을 때 옛 시각 탭은 틀림');
  ok(s.tap(np + 0.2).kind === 'hit' && s.done(), '다시 들은 지점을 맞히면 끝');
  ok(s.tap(null).kind === 'ignored', '시각 없는 탭은 무시');
}

console.log('— 박자 없는 상태');
ok(JSON.stringify(R.noBeatState({ muted: false, slashMode: false })) === '{"value":false,"reason":null}', '소리 켬·빗금 끔 → 박자 있음');
ok(JSON.stringify(R.noBeatState({ muted: true, slashMode: false })) === '{"value":true,"reason":"muted"}', '소리 끔 → 박자 없음(muted)');
ok(JSON.stringify(R.noBeatState({ muted: false, slashMode: true })) === '{"value":true,"reason":"slash"}', '빗금 모드 → 박자 없음(slash)');
ok(R.noBeatState({ muted: true, slashMode: true }).value === true, '둘 다면 박자 없음');

console.log('— 음성 사례: 점검이 실제 틀림을 잡는가');
{
  // 보정값을 빼지 않고 더하는 잘못된 판정이라면 위의 '-160ms 탭' 사례가 안으로 들어간다.
  const wrong = (beat, tap, off) => Math.abs((tap + off / 1000 - beat) * 1000) <= 150;
  ok(wrong(1, 0.84, 100) === true && R.judgeTap(1, 0.84, { offsetMs: 100 }).inside === false, '부호가 틀린 보정은 이 점검에서 걸린다');
  // 창 경계를 '미만'으로 잘못 비교하면 정확히 150ms가 밖으로 나간다.
  const strict = (beat, tap) => Math.abs((tap - beat) * 1000) < 150 - 1e-9;
  ok(strict(1, 1.15) === false && R.judgeTap(1, 1.15).inside === true, '경계를 빼먹는 비교는 이 점검에서 걸린다');
}

// ═════════════ 2부: audio.js (브라우저) ═════════════
console.log('— 브라우저: 소리 엔진');
const server = await startServer();
let game;
try {
  game = await openGame(server.url, { path: 'tests/pages/audio-test.html' });
  const { page } = game;
  await page.waitForFunction(() => window.__audioTest?.ready === true, null, { timeout: 15000 });

  // 첫 조작 전
  let st = await page.evaluate(() => window.__audioTest.beforeGesture());
  ok(st.factoryCalls === 0 && st.unlocked === false, '첫 조작 전에는 소리 판(AudioContext)을 만들지 않는다');
  ok(st.sfxThrew === false && st.started === 0, '첫 조작 전 효과음·배경음 요청은 소리 없이 넘어간다');
  ok(st.playLocked === true, '첫 조작 전 낭송 재생은 시작되지 않는다');

  await page.mouse.click(20, 20);
  await page.waitForFunction(() => window.__audioTest.engine.unlocked === true, null, { timeout: 5000 });
  st = await page.evaluate(() => window.__audioTest.afterGesture());
  ok(st.factoryCalls === 1 && st.ctxState === 'running', '첫 조작에서 소리 판을 열고 실행한다');
  ok(st.bgmLoop === true && st.bgmName === 'bgm:sijo', '조작 전에 요청한 관 배경음이 조작 뒤 반복 재생된다');

  // 일정 박자 배치 + 없는 조각 + 줄이기
  st = await page.evaluate(() => window.__audioTest.schedulingCase());
  ok(st.count === 8, '두 장 = 조각 8개 재생 예약');
  ok(st.withinSegment.every((d) => Math.abs(d - 0.25) < 0.002), '한 장 안의 조각이 박 간격(0.25초)으로 놓인다 ' + JSON.stringify(st.withinSegment));
  ok(Math.abs(st.segmentGap - (4 * 0.25 + 0.3)) < 0.002, '다음 장은 박 4개 + 쉼 뒤에 시작 (' + st.segmentGap + ')');
  ok(st.names.join(',') === st.expected.join(','), '조각 순서가 박자 칸과 같다');
  ok(st.missing.includes('assets/audio/voice/t-sijo/1-2.mp3'), '없는 조각은 audio:missing 사건으로 알린다');
  ok(st.names[6] === 'click', '없는 조각 자리에는 딸깍 소리가 박자 칸에 맞춰 난다');
  ok(st.duckTargetDuring < 0.5 && st.duckValueDuring < 0.6, '낭송 중 배경음이 작아진다 (목표 ' + st.duckTargetDuring + ', 값 ' + st.duckValueDuring + ')');
  ok(st.duckTargetAfter === 1 && st.duckValueAfter > 0.9, '낭송이 끝나면 배경음이 돌아온다 (' + st.duckValueAfter + ')');
  ok(st.completed === true, '재생이 끝까지 간다');

  // 멈춤과 재개: 진행 중 단위를 처음부터
  st = await page.evaluate(() => window.__audioTest.pauseCase());
  ok(st.pausedState === 'suspended' && st.enginePaused === true, '회전 멈춤 신호에 소리 판이 멈춘다');
  ok(st.stoppedFuture === true, '멈출 때 예약된 낭송 조각을 모두 멈춘다');
  ok(st.tapWhilePaused === null && st.judgeWhilePaused === false, '멈춘 동안 탭 판정을 하지 않는다');
  ok(st.restartSegment === 1, '재개 때 진행 중이던 단위(둘째 장)를 알린다');
  ok(st.afterResume.slice(0, 4).join(',') === 't-sijo/1-0,t-sijo/1-1,click,t-sijo/1-3', '재개하면 진행 중이던 단위를 처음부터 다시 낸다 ' + st.afterResume.join(','));
  ok(st.afterResume.slice(4).join(',') === 't-sijo/2-0,t-sijo/2-1,t-sijo/2-2,t-sijo/2-3', '그 뒤 다음 단위로 이어진다');
  ok(st.resumeStartOk === true, '다시 낸 단위는 재개 뒤 시각에 예약된다');
  ok(st.rearmedHit === true, '다시 낸 단위의 박은 새 시작점 기준으로 판정한다');
  ok(st.completed === true && st.closedOk === true, '재개 뒤 끝까지 가고 단위 판정이 된다');

  // 손가락 기기에서 소리 판 열기(가짜 소리 판: 활성화 안에서만 resume이 된다)
  console.log('— 손가락 기기에서 소리 판 열기');
  st = await page.evaluate(() => window.__audioTest.unlockCase());
  ok(st.afterTouchDown.made === false && st.afterTouchDown.unlocked === false, '손가락 pointerdown(활성화 아님)으로는 소리 판을 열지 않는다 ' + JSON.stringify(st.afterTouchDown));
  ok(st.afterFailed.state === 'suspended' && st.afterFailed.unlocked === false, '활성화 밖에서 resume이 실패하면 열린 것으로 보지 않는다(unlocked는 소리 판이 돌 때만) ' + JSON.stringify(st.afterFailed));
  ok(st.voiceWhileSuspended === 0, '소리 판이 돌기 전에는 낭송을 예약하지 않고 기다린다');
  ok(st.afterUp.state === 'running' && st.afterUp.unlocked === true && st.afterUp.voice === 4, '뒤의 손가락 pointerup(활성화)이 소리 판을 돌리고 기다리던 낭송을 낸다 ' + JSON.stringify(st.afterUp));
  ok(st.playedAfterUnlock === true, '기다리던 낭송이 끝까지 간다');
  ok(st.detachedAfterRunning === true, '소리 판이 돌면 조작을 더 듣지 않는다');
  ok(st.interruptedUnlocked === false && st.afterInterrupt.state === 'running' && st.afterInterrupt.resumed, '멈춤 까닭 없이 멈추면(interrupted) 다시 조작을 기다려 돌린다 ' + JSON.stringify(st.afterInterrupt));
  ok(st.pausedNoResume === true && st.pausedUnlocked === true, '메뉴로 멈춘 동안에는 조작이 소리 판을 돌리지 않는다(열린 것으로 본다)');
  ok(st.resumeFailedWaits === true && st.resumedByTap === true, '재개가 활성화 밖이라 실패하면 다음 조작으로 돈다');
  ok(st.mouseDown === true, '마우스 pointerdown은 활성화라 바로 돈다');
  ok(st.oldStuck.state === 'suspended' && st.oldStuck.oldUnlocked === true, '음성 사례: 예전 방식(첫 조작에 떼어 냄, 소리 판만 있으면 열림)은 손가락 기기에서 멈춘 채 열린 것으로 본다 ' + JSON.stringify(st.oldStuck));

  console.log('— 막 끝난 단위에서 멈추기, 박 알림, 단위 끝에서 멈추기');
  st = await page.evaluate(() => window.__audioTest.pauseEndCase());
  ok(st.closedOk === true && st.completed === true, '단위가 막 끝난 뒤 멈춰도 그 단위의 친 박은 그대로 인정된다');
  ok(st.oldMissed === 4, '음성 사례: 끝을 내기 전에 회차를 닫으면 친 박이 모두 놓친 것이 된다(' + st.oldMissed + ')');
  st = await page.evaluate(() => window.__audioTest.countInCase());
  ok(st.countIns === 1 && Math.abs(st.countInAt - 0.15) < 1e-6, '새로 시작할 때 장구 한 번으로 박을 알린다 ' + JSON.stringify({ countIns: st.countIns, at: st.countInAt }));
  ok(Math.abs(st.firstVoiceAt - st.countInAt - st.beatSec) < 1e-6, '박이 1.5초보다 짧으면 첫 박은 박 알림 한 박 뒤 ' + st.firstVoiceAt);
  ok(st.beats === 12 && st.completed === true, '박 알림은 박(onBeat)이 아니다: 세 장 박 12개만 알린다 (' + st.beats + ')');
  ok(st.allCountIns === 1 && JSON.stringify(st.segStarts) === '[0,1,2]', '이어 내는 단위 사이에는 박 알림이 없다');
  ok(st.lead >= 0.45 + 0.5 && st.earlyHit === true, '판정 회차는 박 알림 전에 열려 보정값이 음수여도 첫 박 판정 창이 잘리지 않는다 (앞서 연 시간 ' + st.lead.toFixed(2) + '초)');
  ok(st.afterResume === 2 && st.completed2 === true, '멈췄다 재개하면 다시 박 알림 뒤에 진행 중이던 단위를 낸다');
  st = await page.evaluate(() => window.__audioTest.countInSlowCase());
  ok(Math.abs(st.gap - 1.5) < 1e-6 && Math.abs(st.beatSec - 3.75) < 1e-6, '느린 노래(박 3.75초)의 박 알림은 첫 박 1.5초 앞(min(박 길이, 1.5초)) ' + JSON.stringify(st));
  ok(st.gap < st.beatSec, '음성 사례: 박 길이만큼 앞이었다면 알림 뒤 ' + st.beatSec + '초가 비었다(점검이 차이를 알아본다)');
  ok(st.armBeforeCountIn === true && st.completed === true, '느린 노래에서도 판정 회차는 박 알림보다 먼저 열린다');
  console.log('— 쉼에 두드리기 칸: 조각 길이 + 쉼, 준비 소리, 시각을 정할 때 여는 판정 회차');
  st = await page.evaluate(() => window.__audioTest.pauseGridCase());
  const vw = [1.15, 2.55, 4.15, 5.65, 7.35, 9.88, 11.38, 13.28, 14.78];
  ok(st.ready.length === 1 && Math.abs(st.ready[0] - 0.15) < 1e-6, "새로 시작할 때 '준비' 딱 소리 한 번 " + JSON.stringify(st.ready));
  ok(st.voiceWhen.every((w, i) => Math.abs(w - vw[i]) < 1e-3), '첫 음보는 준비 1초 뒤, 음보마다 조각 길이 + 쉼 1초 뒤 다음 음보, 단위 사이는 마지막 쉼 + 꼬리 + 틈 ' + JSON.stringify(st.voiceWhen));
  ok(st.voiceNames.slice(4, 6).join(',') === 'voice/t-sijo/1-0,voice/t-sijo/1-2' && st.clickWhen.length === 1 && Math.abs(st.clickWhen[0] - 8.85) < 1e-3, '없는 조각 자리에는 딸깍 소리, 그 뒤 쉼은 딸깍 소리 길이로 센다 ' + JSON.stringify(st.clickWhen));
  ok(st.beat0 && Math.abs(st.beat0.clipEnd - 1.55) < 1e-3 && Math.abs(st.beat0.pauseEnd - 2.55) < 1e-3, '박 알림(onBeat)에 조각 끝·쉼 끝 시각이 실린다 ' + JSON.stringify(st.beat0));
  ok(st.arms.length === 3 && st.arms.every((a) => a.beats === 4 && a.now < a.firstOpen - 0.5), '판정 회차는 단위마다 시각표와 함께, 첫 창이 열리기 넉넉히 전에 열린다 ' + JSON.stringify(st.arms));
  ok(st.closes.length === 3 && st.closes.every((c) => c.ok && c.missed === 0) && st.completed === true, '쉼 가운데 친 탭으로 세 단위를 모두 마친다(마지막 음보 창이 단위 끝 판정 전에 닫힌다) ' + JSON.stringify(st.closes));
  ok(JSON.stringify(st.restarts) === '[0]' && st.readyAfter === st.readyBefore + 1 && st.rearmed === 2 && st.completed2 === true, "멈췄다 재개하면 '준비' 소리부터 다시, 진행 중이던 단위를 새 시각에 다시 연다 " + JSON.stringify({ restarts: st.restarts, readyBefore: st.readyBefore, readyAfter: st.readyAfter, rearmed: st.rearmed }));
  st = await page.evaluate(() => window.__audioTest.stopOnEndCase());
  ok(JSON.stringify(st.starts) === '[0]' && st.reason === 'stopped', '단위 끝에서 멈추면 다음 단위를 내지 않는다 ' + JSON.stringify(st));
  ok(st.laterFed > 0 && st.laterStopped === true, '미리 예약해 둔 다음 단위 소리도 멈춘다');
  st = await page.evaluate(() => window.__audioTest.calibrationRestartCase());
  ok(st.restarts === 1 && st.completed === true && st.bells === 4, '박자 보정 종소리를 멈췄다 재개하면 onRestart를 부른다 ' + JSON.stringify(st));

  // 박자 없는 상태 신호, 음량, 효과음, 보정 재생, 실제 404
  st = await page.evaluate(() => window.__audioTest.miscCase());
  ok(JSON.stringify(st.noBeat) === JSON.stringify([{ value: true, reason: 'muted' }, { value: false, reason: null }, { value: true, reason: 'slash' }, { value: false, reason: null }]), '소리 끔·빗금 모드가 rhythm:no-beat로 알려진다 ' + JSON.stringify(st.noBeat));
  ok(st.masterMuted === 0 && st.masterOn === 1, '소리 끔은 전체 음량 0');
  ok(st.vol.bgm === 0.6 && st.vol.voice === 1 && st.vol.sfx === 0.8, '음량 셋의 기본값(배경음·낭송·효과음)');
  ok(st.volSet === 0.25 && st.volClamped === 1, '음량을 바꾸고 0~1로 자른다');
  ok(st.tapTime > 0 && st.tapSound === 'sfx:janggu', '두드리면 장구 소리와 소리 판 시각');
  ok(st.bells.length === 8 && st.bells.every((b, i) => i === 0 || Math.abs(b - st.bells[i - 1] - 0.2) < 0.002), '박자 보정 종소리 여덟 번을 일정 간격으로 낸다');
  ok(st.bellSound === 'sfx:bell', '종소리는 효과음 bell');
  ok(st.calNames.slice(0, 3).join(',') === 'tick,tick,tick' && st.calNames.slice(3).every((n) => n === 'sfx:bell') && st.calNames.length === 11, "종 여덟 번 앞에 '셋 · 둘 · 하나' 딱 소리 셋(종이 아님) " + st.calNames.join(','));
  ok(st.countAt.length === 3 && st.countAt.every((t, i) => Math.abs((st.countAt[i + 1] ?? st.firstBellAt) - t - 0.2) < 0.002) && Math.abs(st.bells[0] - st.firstBellAt) < 1e-6, '세는 소리는 종과 같은 간격이고, 보정의 종 시각(bells)에는 들지 않는다 ' + JSON.stringify({ countAt: st.countAt, firstBell: st.firstBellAt, bell0: st.bells[0] }));
  ok(st.calBeats.join(',') === 'count3,count2,count1,bell0,bell1,bell2,bell3,bell4,bell5,bell6,bell7', '세기·종마다 알림(onBeat)이 온다(화면의 셋·둘·하나) ' + st.calBeats.join(','));
  ok(st.tickMissing === false, "딱 소리는 합성만 한다(없는 파일 'tick.mp3'를 찾지 않는다)");
  ok(st.fetch404Missing === true && st.fetch404Completed === true, '실제 없는 파일도 오류 없이 알림 + 딸깍 대체');
  ok(st.sfxMissing === true, '없는 효과음은 알리고 넘어간다');

  const errs = game.errors.filter((e) => !/404|Failed to load resource/.test(e));
  ok(errs.length === 0, '콘솔 오류가 없다 (' + errs.join(' | ') + ')');
  ok(game.external.length === 0, '바깥 주소 요청이 없다');
} catch (e) {
  failures++;
  console.error('✗ 브라우저 점검 중 오류: ' + (e?.stack ?? e));
} finally {
  await game?.close();
  await server.close();
}

if (failures) { console.error('\n실패 ' + failures + '건'); process.exitCode = 1; }
else console.log('\n소리와 박자 엔진 점검 통과');
