// 2D 종이 인형 자리표시 그림. 그림 자산(sprite/student-a 등)이 오기 전까지 쓴다.
// 한지 바탕을 오려 낸 듯한 테두리에 먹 선으로 그린다. 'student-a', 'student-b', 'mentor', 그 밖은 가객 모양.
import { TOKENS } from './palette.js';

export function paperDollCanvas(kind = 'student-a', width = 128, height = 256) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  const s = width / 128;
  g.scale(s, s);
  g.lineJoin = 'round';

  // 몸(한복 윤곽): 오려 낸 종이 테두리 → 먹 선 → 옷 색
  const body = new Path2D();
  body.moveTo(64, 92);
  body.bezierCurveTo(30, 100, 24, 150, 20, 236);
  body.lineTo(108, 236);
  body.bezierCurveTo(104, 150, 98, 100, 64, 92);
  const head = new Path2D();
  head.arc(64, 64, 30, 0, Math.PI * 2);

  g.fillStyle = TOKENS.hanji;
  g.strokeStyle = TOKENS.hanji;
  g.lineWidth = 12;
  g.stroke(body);
  g.stroke(head);
  g.fill(body);
  g.fill(head);

  g.strokeStyle = TOKENS.meok;
  g.lineWidth = 4;
  g.fillStyle = kind === 'mentor' ? TOKENS.meokSoft : kind.startsWith('student') ? TOKENS.hanjiDeep : TOKENS.meokFog;
  g.fill(body);
  g.stroke(body);
  g.fillStyle = TOKENS.hanji;
  g.fill(head);
  g.stroke(head);

  // 머리 모양으로 생김새를 나눈다(a: 땋은 머리, b: 짧은 머리, 선대 사서: 갓)
  g.fillStyle = TOKENS.meok;
  if (kind === 'student-a') {
    g.beginPath();
    g.arc(64, 58, 31, Math.PI * 1.05, Math.PI * 1.95);
    g.fill();
    g.fillRect(86, 60, 8, 60);
  } else if (kind === 'student-b') {
    g.beginPath();
    g.arc(64, 56, 31, Math.PI, Math.PI * 2);
    g.fill();
  } else if (kind === 'mentor') {
    g.fillRect(22, 34, 84, 6);
    g.fillRect(46, 12, 36, 24);
  } else {
    g.beginPath();
    g.arc(64, 54, 30, Math.PI, Math.PI * 2);
    g.fill();
  }
  // 눈과 옷깃
  g.fillRect(52, 66, 5, 5);
  g.fillRect(71, 66, 5, 5);
  g.beginPath();
  g.moveTo(50, 104);
  g.lineTo(64, 132);
  g.lineTo(78, 104);
  g.lineWidth = 3;
  g.stroke();
  return c;
}
