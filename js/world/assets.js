// 관 모형에 넘기는 자산 손잡이(js/data/README.md 7.1 assets, 11.2 그림 이름).
// 자산 목록(assets/manifest.json 모양)에 있는 그림만 주소를 돌려주고, 없으면 null이다(부르는 쪽이 자리표시 무늬를 쓴다).
// 목록을 스스로 내려받지 않는다. 없는 파일 요청이 콘솔 오류를 내지 않도록, 부르는 쪽이 목록을 넘긴다.
const ROOT = new URL('../../', import.meta.url);

export function createAssets(manifest, THREE = null) {
  const paths = new Map();
  for (const a of manifest?.assets ?? []) {
    const m = /^assets\/img\/(.+)\.(webp|png|jpg|jpeg)$/i.exec(a?.path ?? '');
    if (m && (a.kind === 'image' || !a.kind)) paths.set(m[1], a.path);
  }
  const textures = new Map();

  function image(name) {
    const p = paths.get(name);
    return p ? new URL(p, ROOT).href : null;
  }

  function texture(name) {
    if (!THREE) return null;
    const url = image(name);
    if (!url) return null;
    if (!textures.has(name)) {
      const tex = new THREE.TextureLoader().load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      textures.set(name, tex);
    }
    return textures.get(name);
  }

  function dispose() {
    for (const t of textures.values()) t.dispose();
    textures.clear();
  }

  return { image, texture, dispose };
}
