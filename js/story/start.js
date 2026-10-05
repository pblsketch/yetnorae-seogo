// 시작 화면(화면 약속 README 7.4, 등록 이름 start). js/main.js가 ctx 없이 연다.
// 시작 화면은 앱 흐름(js/story/app.js)의 첫 장면이다. 여기서 앱을 띄우면 기록 고르기부터 엔딩까지 이어진다.
import { startApp } from './app.js';

export function show(container, ctx = {}) {
  const ready = startApp(container).catch((e) => {
    console.error('[story] 앱을 열지 못함', e);
    return null;
  });
  return {
    ready,
    dispose() {},
  };
}
