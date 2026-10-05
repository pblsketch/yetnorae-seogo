// 화면 약속(README 7.4)으로 여는 한 판 화면. 연결 단계가 js/registry.js의 screens.play로 등록한다.
// 기록을 읽어 판 중인 관이 있으면 그 관으로, 아니면 회랑으로 이어 간다(spec 20).
// ctx.params.session이 있으면 그 세션(앱에 하나)을 쓰고, 없으면 새로 만든다.
import { createSession } from './session.js';

export function show(container, ctx = {}) {
  let session = ctx.params?.session ?? null;
  let disposed = false;
  const own = !session;
  const ready = (async () => {
    if (!session) session = await createSession({ container });
    if (disposed) { if (own) session.dispose(); return null; }
    const wing = ctx.params?.wing;
    if (wing) session.playWing(wing);
    else session.resume();
    return session;
  })().catch((e) => { console.error('[play] 한 판 화면을 열지 못함', e); return null; });
  return {
    ready,
    dispose() {
      disposed = true;
      if (own) session?.dispose();
    },
  };
}
