// 점검 페이지: 제품과 같은 길(로컬 저장소, 등록된 관 모형, 실제 노래)로 한 판 세션을 띄우고 보스전 화면을 연다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다. 제품과 다른 점은 셋뿐이다.
//  - 소리: 낭송 조각은 '없는 파일'로, 배경음·효과음은 짧은 무음 버퍼로 돌려준다(파일 요청과 콘솔 오류가 없게).
//  - 박자 칸을 빨리 돌린다: 세션의 박자 손잡이(rhythm)에 빠르기 240, 단위 사이 쉼 0.2초의 buildGrid·buildRemixGrid를 끼운다.
//  - 자동 탭: 소리 엔진이 리믹스의 바뀌는 지점 단위를 낼 때(onSegmentStart) '바뀌었다' 단추에 pointerdown을 보낸다.
//    skipPoints의 지점은 한 번 일부러 놓치고, wrongAtSegments의 단위가 시작될 때는 지점이 아닌 곳을 한 번 탭한다.
// 점검 도구가 들여다볼 손잡이를 window.__b에 둔다.
import * as events from '../../js/core/events.js';
import * as R from '../../js/core/rhythm.js';
import { DIORAMA_EVENTS } from '../../js/world/world.js';
import { createSession } from '../../js/play/session.js';
import { show, start } from '../../js/boss/boss.js';

const log = [];
for (const name of [...DIORAMA_EVENTS, 'help:journal-glow', 'concept:changed', 'save:failed', 'rhythm:no-beat']) {
  events.on(name, (detail) => log.push({ name, detail: JSON.parse(JSON.stringify(detail ?? {})) }));
}

const audioDeps = {
  loadBuffer: async (path, c) => {
    if (path.startsWith('assets/audio/voice/')) throw new Error('낭송 조각 없음(점검)');
    return c.createBuffer(1, Math.max(1, Math.round(c.sampleRate * 0.03)), c.sampleRate);
  },
};

const auto = { remix: true, skipPoints: [], wrongAtSegments: [], plays: [], taps: [] };
const fogSeen = new Set();
const goCalls = [];

function tapSwitch(kind) {
  const b = document.querySelector('.boss .boss-remix-tap');
  if (!b) return;
  auto.taps.push(kind);
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }));
}

window.__b = { ready: false, log, auto, fogSeen, goCalls, events };
try {
  const app = document.getElementById('app');
  const session = await createSession({ container: app, audioDeps });
  session.rhythm.buildGrid = (song, o = {}) => R.buildGrid(song, { tempo: 240, gapSec: 0.2, ...o });
  session.rhythm.buildRemixGrid = (remix, getSong) => R.buildRemixGrid(remix, (id) => { const s = getSong(id); return s ? { ...s, tempo: 240 } : null; }, { gapSec: 0.2 });

  const play = session.audio.play;
  session.audio.play = (grid, segs, opts = {}) => {
    const remixGrid = Array.isArray(grid?.switches);
    if (remixGrid) auto.plays.push(segs ? segs.slice() : null);
    return play(grid, segs, {
      ...opts,
      onSegmentStart: (s) => {
        opts.onSegmentStart?.(s);
        if (!remixGrid || !auto.remix) return;
        const wi = auto.wrongAtSegments.indexOf(s.segment);
        if (wi >= 0) { auto.wrongAtSegments.splice(wi, 1); tapSwitch('wrong'); }
        const point = grid.switches.indexOf(s.segment);
        if (point < 0) return;
        const si = auto.skipPoints.indexOf(point);
        if (si >= 0) { auto.skipPoints.splice(si, 1); return; }
        tapSwitch('point-' + point);
      },
    });
  };

  // 먹안개 상태(data-fog)가 지나간 값을 모은다
  new MutationObserver(() => {
    const f = document.querySelector('.boss')?.dataset.fog;
    if (f) fogSeen.add(f);
  }).observe(app, { attributes: true, subtree: true, attributeFilter: ['data-fog'], childList: true });

  // 점검 페이지 주소에 via=start가 있으면 앱 흐름(README '추가 제안(T18)')처럼 start(ctx)로 연다(점검 페이지 전용).
  if (new URLSearchParams(location.search).get('via') === 'start') {
    const host = document.createElement('div');
    host.className = 'story-boss-host';
    host.style.cssText = 'position:absolute;inset:0;z-index:35';
    session.root.append(host);
    const ac = new AbortController();
    const via = { result: null, error: null, ac, host };
    start({ session, container: host, signal: ac.signal, go: () => goCalls.push({ name: 'go' }), params: { session } })
      .then((r) => { via.result = r; }, (e) => { via.error = e?.name ?? String(e); });
    Object.assign(window.__b, { session, via, ready: true });
  } else {
    const screen = show(app, { params: { session }, go: (name, params) => goCalls.push({ name, hasSession: params?.session === session }) });
    Object.assign(window.__b, { session, screen, ready: true });
  }
} catch (e) {
  window.__b.error = String(e?.stack ?? e);
  console.error(e);
}
