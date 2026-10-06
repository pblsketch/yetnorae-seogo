// 2D 종이 인형 자리표시 그림. 그림 자산(sprite/student-a 등)이 없을 때 쓴다(「정석가」 방의 '임'처럼 그림이 없는 인물도).
// 한지를 오려 낸 듯한 테두리 안에 가는 먹 선과 옅은 옷 색으로 그린다. 그림 안에 글자는 없다(승인 화풍).
// 'student-a'(땋은 머리·저고리·바지), 'student-b'(짧은 머리), 'mentor'(갓·도포), 'nim'(쪽머리·저고리·치마), 그 밖은 가객(갓·두루마기).
import { TOKENS, mixHex } from './palette.js';

const LOOKS = {
  'student-a': { top: '#3f6b5e', bottom: '#4a4744', collar: TOKENS.hanji, hair: 'braid', skirt: false },
  'student-b': { top: '#46607a', bottom: '#4a4744', collar: TOKENS.hanji, hair: 'short', skirt: false },
  mentor: { top: '#6e6a62', bottom: '#6e6a62', collar: TOKENS.hanji, hair: 'gat', skirt: true, robe: true },
  nim: { top: '#e9dcc4', bottom: '#8a5a5a', collar: '#5c6b84', hair: 'jjok', skirt: true },
  singer: { top: '#d9cdb5', bottom: '#d9cdb5', collar: TOKENS.meokSoft, hair: 'gat', skirt: true, robe: true },
};

export function paperDollCanvas(kind = 'student-a', width = 128, height = 256) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  const s = width / 128;
  g.scale(s, s * (height / width) / 2);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const L = LOOKS[kind] ?? LOOKS.singer;
  const ink = TOKENS.meok;

  // 몸 윤곽(오려 낼 모양): 머리, 몸통·소매, 아래옷
  const head = new Path2D();
  head.ellipse(64, 50, 17, 20, 0, 0, Math.PI * 2);
  const body = new Path2D();
  body.moveTo(52, 70);
  body.quadraticCurveTo(36, 74, 30, 92);    // 왼 어깨
  body.lineTo(22, 140);                       // 왼 소매 바깥
  body.quadraticCurveTo(26, 150, 38, 146);    // 소매 끝
  body.lineTo(42, 112);
  body.lineTo(44, 136);
  if (L.skirt) {
    body.quadraticCurveTo(30, 200, 26, 238);
    body.lineTo(102, 238);
    body.quadraticCurveTo(98, 200, 84, 136);
  } else {
    body.lineTo(44, 150);
    body.lineTo(40, 234);
    body.lineTo(62, 234);
    body.lineTo(64, 168);
    body.lineTo(66, 234);
    body.lineTo(88, 234);
    body.lineTo(84, 150);
    body.lineTo(84, 136);
  }
  body.lineTo(86, 112);
  body.lineTo(90, 146);
  body.quadraticCurveTo(102, 150, 106, 140);
  body.lineTo(98, 92);
  body.quadraticCurveTo(92, 74, 76, 70);
  body.closePath();
  const hat = new Path2D();
  if (L.hair === 'gat') {
    hat.ellipse(64, 34, 34, 6, 0, 0, Math.PI * 2);
    hat.rect(50, 12, 28, 22);
  }

  // 1) 오린 종이 테두리: 같은 모양을 한지색으로 두껍게
  g.fillStyle = TOKENS.hanji;
  g.strokeStyle = TOKENS.hanji;
  g.lineWidth = 10;
  for (const p of [body, head, hat]) { g.stroke(p); g.fill(p); }
  g.strokeStyle = mixHex(TOKENS.hanjiDeep, TOKENS.meokFog, 0.35);
  g.lineWidth = 1;
  g.save();
  g.globalAlpha = 0.5;
  for (const p of [body, head]) g.stroke(p);
  g.restore();

  // 2) 아래옷과 저고리(옅은 색, 아래가 조금 짙은 바림)
  const grad = (top, y0, y1) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, mixHex(top, TOKENS.hanji, 0.15));
    gr.addColorStop(1, mixHex(top, TOKENS.meok, 0.18));
    return gr;
  };
  g.save();
  g.clip(body);
  g.fillStyle = grad(L.bottom, 120, 240);
  g.fillRect(0, 120, 128, 130);
  g.fillStyle = grad(L.top, 70, L.robe ? 240 : 140);
  if (L.robe) {
    g.fillRect(0, 60, 128, 190);
  } else {
    g.beginPath();
    g.moveTo(20, 70);
    g.lineTo(108, 70);
    g.lineTo(108, 150);
    g.quadraticCurveTo(64, 138, 20, 150);
    g.fill();
  }
  // 소매 끝동
  g.fillStyle = mixHex(L.collar, TOKENS.hanji, 0.1);
  g.fillRect(18, 136, 24, 14);
  g.fillRect(86, 136, 24, 14);
  g.restore();

  // 3) 먹 선: 몸 윤곽, 깃, 고름, 옷 주름
  g.strokeStyle = ink;
  g.lineWidth = 2.2;
  g.stroke(body);
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(54, 72);
  g.lineTo(64, 100);
  g.lineTo(76, 72);
  g.stroke();
  g.fillStyle = L.collar;
  g.beginPath();
  g.moveTo(55, 72);
  g.lineTo(64, 96);
  g.lineTo(73, 72);
  g.lineTo(68, 72);
  g.lineTo(64, 86);
  g.lineTo(60, 72);
  g.closePath();
  g.fill();
  g.fillStyle = mixHex(L.collar === TOKENS.hanji ? '#7a4a3c' : L.collar, TOKENS.hanji, 0.1);
  g.beginPath();
  g.moveTo(64, 100);
  g.quadraticCurveTo(60, 120, 56, 128);
  g.lineTo(60, 129);
  g.quadraticCurveTo(64, 118, 66, 101);
  g.fill();
  g.strokeStyle = 'rgba(43,43,43,0.45)';
  g.lineWidth = 1;
  for (const [x0, y0, x1, y1] of [[36, 100, 32, 132], [92, 100, 96, 132], [52, 160, 46, 230], [76, 160, 82, 230], [64, 150, 64, 232]]) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo((x0 + x1) / 2 + 2, (y0 + y1) / 2, x1, y1);
    g.stroke();
  }
  // 신
  g.fillStyle = ink;
  for (const fx of L.skirt ? [52, 76] : [51, 77]) {
    g.beginPath();
    g.ellipse(fx, 238, 9, 3.5, 0, 0, Math.PI * 2);
    g.fill();
  }

  // 4) 얼굴과 머리
  g.fillStyle = '#f6ecdc';
  g.fill(head);
  g.strokeStyle = ink;
  g.lineWidth = 1.6;
  g.stroke(head);
  g.fillStyle = ink;
  if (L.hair === 'braid' || L.hair === 'short' || L.hair === 'jjok') {
    g.beginPath();
    g.ellipse(64, 42, 18.5, 14, 0, Math.PI, Math.PI * 2);
    g.quadraticCurveTo(70, 38, 64, 34);
    g.quadraticCurveTo(56, 40, 45.5, 44);
    g.fill();
  }
  if (L.hair === 'braid') {
    g.beginPath();
    g.moveTo(78, 52);
    g.quadraticCurveTo(86, 80, 82, 118);
    g.lineTo(78, 118);
    g.quadraticCurveTo(80, 82, 74, 56);
    g.fill();
    g.fillStyle = '#8a3f35';
    g.fillRect(77, 114, 7, 8);
  } else if (L.hair === 'jjok') {
    g.beginPath();
    g.ellipse(78, 58, 8, 6, 0.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = TOKENS.gold;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(68, 60);
    g.lineTo(90, 55);
    g.stroke();
  } else if (L.hair === 'gat') {
    g.fillStyle = 'rgba(43,43,43,0.85)';
    g.fill(hat);
    g.strokeStyle = 'rgba(43,43,43,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(48, 34);
    g.quadraticCurveTo(50, 62, 56, 70);
    g.moveTo(80, 34);
    g.quadraticCurveTo(78, 62, 72, 70);
    g.stroke();
  }
  // 눈썹·눈·입: 아주 가는 선
  g.strokeStyle = ink;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(55, 49); g.lineTo(60, 48.5);
  g.moveTo(68, 48.5); g.lineTo(73, 49);
  g.stroke();
  for (const ex of [58, 70]) {
    g.beginPath();
    g.arc(ex, 54, 1.4, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#a0524a';
  g.beginPath();
  g.moveTo(61, 62); g.quadraticCurveTo(64, 63.5, 67, 62);
  g.stroke();
  return c;
}
