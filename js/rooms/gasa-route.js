// 「상춘곡」 길: 머무는 곳 사이 꺾인 길(점 목록)을 길이로 나눠 길 위치(0~4)를 점으로 바꾼다.
// 2D(그림 판 백분율)와 3D(바닥 좌표 x, z) 모두 쓴다. DOM에 기대지 않는다.

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// segments: 머무는 곳 k에서 k+1까지의 점 목록 [[x, y], …] 네 개(첫 점 = 곳 k, 끝 점 = 곳 k+1)
export function createRoute(segments) {
  const segs = segments.map((pts) => {
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + dist(pts[i - 1], pts[i]));
    return { pts, lens, length: lens[lens.length - 1] };
  });
  const total = segs.reduce((s, g) => s + g.length, 0);

  function onSeg(g, f) {
    const target = Math.min(1, Math.max(0, f)) * g.length;
    let i = 1;
    while (i < g.pts.length - 1 && g.lens[i] < target) i++;
    const a = g.pts[i - 1];
    const b = g.pts[i];
    const span = g.lens[i] - g.lens[i - 1] || 1;
    const t = (target - g.lens[i - 1]) / span;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  // 길 위치 s(0 ~ 곳 수-1) → 점
  function point(s) {
    const max = segs.length;
    const v = Math.min(max, Math.max(0, s));
    const k = Math.min(max - 1, Math.floor(v));
    return onSeg(segs[k], v - k);
  }

  // 길 위치 s까지 걸은 길이의 비율(0~1)
  function walkedRatio(s) {
    const max = segs.length;
    const v = Math.min(max, Math.max(0, s));
    const k = Math.min(max - 1, Math.floor(v));
    let len = 0;
    for (let i = 0; i < k; i++) len += segs[i].length;
    len += segs[k].length * (v - k);
    return total ? len / total : 0;
  }

  // 길 전체를 촘촘히 고른 점(3D 길 띠용)
  function samples(step = 0.5) {
    const out = [];
    segs.forEach((g, k) => {
      const n = Math.max(1, Math.ceil(g.length / step));
      for (let i = k === 0 ? 0 : 1; i <= n; i++) out.push({ p: onSeg(g, i / n), s: k + i / n });
    });
    return out;
  }

  const all = () => segs.flatMap((g, k) => (k === 0 ? g.pts : g.pts.slice(1)));
  return { point, walkedRatio, samples, all, stops: () => [segs[0].pts[0], ...segs.map((g) => g.pts[g.pts.length - 1])] };
}
