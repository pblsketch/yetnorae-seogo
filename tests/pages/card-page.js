// 점검 페이지: 결과 카드 화면을 단독으로 띄우고, 점검 도구가 들여다볼 손잡이를 window.__t에 둔다.
// 기록은 점검 도구가 로컬 저장소에 넣은 것을 저장 엔진으로 읽는다. 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
import { createStore } from '../../js/core/save.js';
import { buildWingCard, buildFinalCard } from '../../js/core/cards.js';
import * as card from '../../js/result/card.js';
import { showCard } from '../../js/result/card-view.js';

// 부를 때마다 저장소에서 다시 읽는다(다시 내려받기가 '지금의 기록'을 쓰는지 보려고).
function store() {
  const s = createStore({ storage: localStorage });
  s.load();
  return s;
}
const record = () => store().currentRecord();

// 기기 설정의 글자 크기를 화면에 적용한다(카드 배치가 이 값과 상관없는지 본다).
const applyTextScale = (v) => document.documentElement.style.setProperty('--text-scale', String(v));
applyTextScale(store().data.device.textScale);

// 내려받은 PNG(base64)를 다시 풀어, 상자마다 바탕(한지)과 확연히 다른 화소 수를 센다.
async function inkCounts(b64, boxes) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  const bg = [0xf3, 0xea, 0xd6];
  return boxes.map((b) => {
    const x = Math.max(0, Math.floor(b.x));
    const y = Math.max(0, Math.floor(b.y));
    const w = Math.max(1, Math.min(c.width - x, Math.ceil(b.w)));
    const h = Math.max(1, Math.min(c.height - y, Math.ceil(b.h)));
    const d = g.getImageData(x, y, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
      if (dist > 120) n++;
    }
    return n;
  });
}

// 그린 결과를 PNG base64로(점검 페이지 안에서 바로 화소를 볼 때).
async function canvasBase64(canvas) {
  const blob = await card.cardToBlob(canvas);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s);
}

window.__t = {
  card,
  showCard,
  record,
  store,
  applyTextScale,
  wingCard: (w) => buildWingCard(record(), w),
  finalCard: () => buildFinalCard(record()),
  inkCounts,
  canvasBase64,
  ready: true,
};
