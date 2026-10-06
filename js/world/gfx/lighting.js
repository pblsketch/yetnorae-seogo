// 빛과 그리기 설정: 반구광(하늘·땅) + 주광(왼쪽 앞 위, 따뜻함) + 보조광(오른쪽 뒤, 서늘함). 그림자 맵과 후처리는 쓰지 않는다.
// 접지는 kit.contactShadow와 figures의 발밑 번짐이 맡는다.
// 톤 매핑은 NeutralToneMapping(three 0.186): 한지·먹 색 토큰의 색상을 거의 바꾸지 않고 밝은 쪽만 눌러 준다.
// 종이 인형 그림과 현판처럼 승인된 색 그대로여야 하는 재질은 toneMapped: false로 둔다.
//
//   applyRenderSettings(renderer)
//   const rig = createLightRig(THREE, scene);   rig.setPreset('corridor' | 'wing' | 'room')
//   setFog(scene, 'corridor', color)
import { TOKENS } from '../palette.js';

export const LIGHT_PRESETS = {
  corridor: { hemi: 1.55, key: 1.9, fill: 0.55, keyDir: [-5, 9, 7], fillDir: [6, 4, -6] },
  wing: { hemi: 1.75, key: 1.6, fill: 0.5, keyDir: [-6, 12, 8], fillDir: [7, 5, -6] },
  room: { hemi: 1.9, key: 1.2, fill: 0.4, keyDir: [-4, 8, 6], fillDir: [5, 4, -5] },
};

// 장면마다 안개 거리(m). 가까운 것은 또렷하고 먼 산은 바탕색에 녹는다.
export const FOG_PRESETS = {
  corridor: { near: 16, far: 62 },
  wing: { near: 26, far: 110 },
};

export function applyRenderSettings(renderer, THREE) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = false;
}

export function createLightRig(THREE, scene) {
  const hemi = new THREE.HemisphereLight(0xfff4e0, 0x5a4e42, 1.6);
  hemi.name = 'gfx-hemi';
  const key = new THREE.DirectionalLight(0xfff0d8, 1.8);
  key.name = 'gfx-key';
  const fill = new THREE.DirectionalLight(0xc8d4e0, 0.5);
  fill.name = 'gfx-fill';
  scene.add(hemi, key, fill, key.target, fill.target);
  let follow = null;

  function setPreset(name) {
    const p = LIGHT_PRESETS[name] ?? LIGHT_PRESETS.corridor;
    hemi.intensity = p.hemi;
    key.intensity = p.key;
    fill.intensity = p.fill;
    key.userData.dir = p.keyDir;
    fill.userData.dir = p.fillDir;
    aim(follow);
  }

  // 방향광은 '방향'만 의미가 있지만, 자리를 따라 옮겨 두면 나중에 그림자를 켜도 덜 어긋난다.
  function aim(at) {
    follow = at;
    const o = at ?? { x: 0, y: 0, z: 0 };
    for (const l of [key, fill]) {
      const d = l.userData.dir ?? [0, 1, 0];
      l.position.set(o.x + d[0], o.y + d[1], o.z + d[2]);
      l.target.position.set(o.x, o.y, o.z);
    }
  }

  setPreset('corridor');
  return {
    hemi, key, fill, setPreset, aim,
    dispose() { scene.remove(hemi, key, fill, key.target, fill.target); },
  };
}

export function setFog(scene, preset, color = TOKENS.hanji) {
  const p = FOG_PRESETS[preset] ?? FOG_PRESETS.corridor;
  if (!scene.fog) return;
  scene.fog.near = p.near;
  scene.fog.far = p.far;
  scene.fog.color.set(color);
}
