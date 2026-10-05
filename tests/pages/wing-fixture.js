// 점검 전용 자리표시 관 모형. js/data/README.md 7.1의 관 모형 약속을 가장 작게 따른다.
// 받은 ctx와 사건을 calls에 적어 두어 점검 도구가 세계 바탕의 약속 이행을 확인한다.
// globalThis.__fixtureHeavy에 수를 넣으면 그만큼 상자를 더 만들어 그리기 호출 예산 초과(음성 사례)를 만든다.
export const calls = { create3D: [], create2D: [], react: [], update: 0, dispose: 0 };

export function create3D(ctx) {
  calls.create3D.push({
    keys: Object.keys(ctx).sort(),
    wingId: ctx.wing?.id,
    restored: ctx.restored,
    rootIsGroup: !!ctx.root?.isGroup,
    hasTexture: typeof ctx.assets?.texture === 'function',
    hasImage: typeof ctx.assets?.image === 'function',
    reduceMotion: ctx.reduceMotion(),
  });
  const { THREE, root } = ctx;
  const heavy = Number(globalThis.__fixtureHeavy) || 0;
  const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const mats = [];
  for (let i = 0; i < 1 + heavy; i++) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x8d8a85 });
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((i % 10) - 4.5, 0.4 + Math.floor(i / 10) * 0.9, -3);
    root.add(mesh);
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  return {
    anchors: {
      slots: [V(-3, 0, -2), V(0, 0, -2), V(3, 0, -2)],
      bonus: [V(-3, 0, 1), V(0, 0, 1), V(3, 0, 1)],
      basket: V(4, 0, 3),
      returnedShelf: V(-4, 0, 3),
      roomDoor: V(0, 0, -5),
      entrance: V(0, 0, 4),
      nextDoor: V(5, 0, -5),
      camera: { position: V(0, 8, 12), target: V(0, 0, 0) },
    },
    react(name, detail) { calls.react.push({ name, detail }); },
    update() { calls.update++; },
    dispose() { calls.dispose++; geo.dispose(); mats.forEach((m) => m.dispose()); },
  };
}

export function create2D(ctx) {
  calls.create2D.push({
    keys: Object.keys(ctx).sort(),
    wingId: ctx.wing?.id,
    restored: ctx.restored,
    isElement: ctx.container instanceof HTMLElement,
    reduceMotion: ctx.reduceMotion(),
  });
  const art = document.createElement('div');
  art.className = 'fixture-art';
  ctx.container.append(art);
  return {
    anchors: {
      slots: [{ x: 25, y: 60 }, { x: 50, y: 60 }, { x: 75, y: 60 }],
      basket: { x: 85, y: 80 },
      roomDoor: { x: 50, y: 30 },
    },
    react(name, detail) { calls.react.push({ name, detail }); },
    dispose() { calls.dispose++; art.remove(); },
  };
}
