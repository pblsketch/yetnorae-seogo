// 3D를 쓸 수 있는지 감지한다(spec 14). Three.js 0.186은 WebGL2만 쓰므로 WebGL2가 없으면 게임 전체가 2D 그림 판이다.
// 제품에는 이것을 바꾸는 스위치가 없다. 점검은 브라우저의 3D 기능을 끈 채 연다.
let cached = null;

function hasWebGL2() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

// '3d' | '2d'. 한 번 정하면 그 창에서는 바뀌지 않는다.
export function detectMode() {
  if (!cached) cached = hasWebGL2() ? '3d' : '2d';
  return cached;
}

// 3D 그림판을 만들다 실패하면 2D로 내려간다.
export function fallbackTo2D() {
  cached = '2d';
}
