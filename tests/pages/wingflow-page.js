// 점검 페이지: 한 판 화면(js/play/session.js)을 제품과 같은 길(로컬 저장소, 등록된 관 모형, 실제 노래)로 띄운다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다. 다른 점은 둘뿐이다.
//  - 소리: 낭송 조각은 '없는 파일'로, 배경음·효과음은 짧은 무음 버퍼로 돌려준다(파일 요청과 콘솔 오류가 없게).
//  - 작품 방: 아직 만들어지지 않은 방 대신 점검용 방을 끼운다. '점검: 방 마치기'를 누르면 README 7.3 모양의 기록으로 끝난다.
//    주소에 rooms=none이 있으면 점검용 방을 끼우지 않는다(등록되지 않은 방의 자리표시를 보는 음성 사례).
// 점검 도구가 들여다볼 손잡이를 window.__wf에 둔다.
import * as events from '../../js/core/events.js';
import { DIORAMA_EVENTS } from '../../js/world/world.js';
import { createSession } from '../../js/play/session.js';

const log = [];
for (const name of [...DIORAMA_EVENTS, 'help:notebook-glow', 'concept:changed', 'wing:state', 'save:failed', 'audio:pause', 'audio:resume']) {
  events.on(name, (detail) => log.push({ name, detail: JSON.parse(JSON.stringify(detail ?? {})) }));
}

const RECORDS = {
  hyangga: { room: 'hyangga', interpretationId: 'test', interpretationText: '점검용 해석', isInterpretation: true },
  goryeo: { room: 'goryeo', lastConditionId: 'test', lastConditionText: '점검용 조건' },
  sijo: { room: 'sijo', rooms: ['na', 'dal', 'cheongpung'], outside: ['gangsan'], interpretationId: 'test', interpretationText: '점검용 해석', isInterpretation: true },
  gasa: { room: 'gasa', words: ['점검'] },
  saseol: { room: 'saseol', predictionId: 'nim', predictionText: '점검용 예측' },
};

const roomCalls = [];
function stubRoom(wingId) {
  return {
    start(ctx) {
      roomCalls.push({ wing: wingId, song: ctx.song?.id, mode: ctx.mode, hasContainer: !!ctx.container, hasRhythm: !!ctx.rhythm?.engine, hasSignal: !!ctx.signal });
      return new Promise((resolve, reject) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'stub-room-done';
        b.textContent = '점검: 방 마치기';
        b.addEventListener('click', () => resolve({ completed: true, record: RECORDS[wingId] }), { once: true });
        ctx.container.append(b);
        ctx.signal?.addEventListener('abort', () => reject(ctx.signal.reason ?? new DOMException('중단', 'AbortError')), { once: true });
      });
    },
  };
}

const noRooms = new URLSearchParams(location.search).get('rooms') === 'none';
const rooms = noRooms ? {} : Object.fromEntries(['hyangga', 'goryeo', 'sijo', 'gasa', 'saseol'].map((w) => [w, stubRoom(w)]));

const audioDeps = {
  loadBuffer: async (path, c) => {
    if (path.startsWith('assets/audio/voice/')) throw new Error('낭송 조각 없음(점검)');
    return c.createBuffer(1, Math.max(1, Math.round(c.sampleRate * 0.03)), c.sampleRate);
  },
};

window.__wf = { ready: false, log, roomCalls, events };
try {
  const session = await createSession({ container: document.getElementById('app'), rooms, audioDeps });
  session.resume();
  Object.assign(window.__wf, { session, ready: true });
} catch (e) {
  window.__wf.error = String(e?.stack ?? e);
  console.error(e);
}
