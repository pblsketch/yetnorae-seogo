// 결과 카드 그리기(spec 12). js/core/cards.js가 모은 카드 자료만 보고 고정 크기 캔버스에 그린다.
// 카드 배치는 글자 크기 설정과 상관없이 늘 같다(픽셀 값으로 고정). 긴 글은 줄을 바꾸고, 그래도 넘치면 글씨를 줄여 잘리지 않게 한다.
// 점수·등급·순위 같은 말은 쓰지 않는다. 그린 글은 모두 배치 기록(layout)에 남겨 점검이 읽을 수 있게 한다.
import { TOKENS } from '../world/palette.js';
import { paperDollCanvas } from '../world/sprites.js';
import { createAssets } from '../world/assets.js';
import { SONG_TABLE } from '../data/song-table.js';
import { songs as registeredSongs } from '../data/songs/index.js';
import { CARD_FILE_PREFIX } from '../core/cards.js';

export const CARD_SIZE = Object.freeze({ width: 1600, height: 900 });

// css/base.css의 글꼴 묶음과 같은 값. 화면에 base.css가 있으면 그 값을 읽어 쓴다.
const FALLBACK_FONTS = {
  body: "'YetnoraeText', 'Noto Serif KR', 'Nanum Myeongjo', serif",
  ui: "'YetnoraeUI', 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
};

// 카드에 쓰는 말. 점수처럼 읽히는 말(점수·등급·순위 등)은 쓰지 않는다.
const WORDS = {
  brand: '옛 노래 서고',
  wingKind: '판 카드',
  finalKind: '마지막 카드',
  apprentice: '견습 사서',
  shelfHead: '꽂은 칸 노래',
  conceptHead: '개념',
  conceptState: { ink: '먹', pencil: '연필', none: '아직' },
  roomHead: '작품 방',
  interpretationTag: '해석',
  bonus: { true: '덤 칸도 채웠다', false: '덤 칸은 아직 비어 있다' },
  wingDate: '판을 마친 날',
  finalDate: '서고를 완성한 날',
  noDate: '날짜 기록 없음',
  complete: '서고 완성',
  wingsHead: '다섯 관',
  bossHead: '낯선 노래 다섯 편',
  bossCols: ['노래', '처음 꽂을 때', '일지 도움', '누가 불렀을까'],
  first: { true: '맞힘', false: '다시 꽂음', null: '기록 없음' },
  help: { true: '받음', false: '안 받음' },
  singer: { true: '맞힘', false: '못 맞힘', null: '기록 없음' },
  inkHead: '먹으로 굳은 개념',
  inkNone: '아직 먹이 된 개념이 없다',
  endingHead: '나의 노래 한 줄',
  endingWing: '꽂은 관',
  endingConcept: '근거 개념',
  endingNote: '한마디',
  noRecord: '기록 없음',
  noRoom: '작품 방 기록이 없다',
  none: '없음',
};

// 「십 년을 경영하여」 방의 물건 이름(js/data/README.md 7.3)
const SIJO_THINGS = { na: '나', dal: '달', cheongpung: '청풍', gangsan: '강산', gold: '금붙이', robe: '관복', guest: '손님' };

const SEP = ' · ';

// ───────────────────────── 글꼴 ─────────────────────────

function fontStacks() {
  let body = '';
  let ui = '';
  if (typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(document.documentElement);
    body = cs.getPropertyValue('--font-body').trim();
    ui = cs.getPropertyValue('--font-ui').trim();
  }
  return { body: body || FALLBACK_FONTS.body, ui: ui || FALLBACK_FONTS.ui };
}

// 쓰는 글꼴을 미리 불러 두고(부분 글꼴이 오면 그것도), 문서의 글꼴 준비가 끝날 때까지 기다린다.
async function waitFonts(fonts) {
  const set = typeof document !== 'undefined' ? document.fonts : null;
  if (!set) return;
  const probes = [];
  for (const fam of [fonts.body, fonts.ui]) for (const w of [400, 700]) probes.push(set.load(`${w} 32px ${fam}`, '옛 노래 서고 가나다').catch(() => null));
  await Promise.all(probes);
  await set.ready;
}

// ───────────────────────── 글 배치 ─────────────────────────

// 글자 단위로 나눈다(한글 조합 문자와 이모지가 쪼개지지 않게).
function graphemes(s) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
  return Array.from(s);
}

// 너비 안에서 줄을 바꾼다. 띄어쓰기에서 먼저 끊고, 한 낱말이 너비보다 길면 글자 사이에서 끊는다. 글자는 하나도 버리지 않는다.
function wrap(ctx, text, maxW) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  const fits = (s) => ctx.measureText(s).width <= maxW;
  for (const word of words) {
    const tryLine = cur ? cur + ' ' + word : word;
    if (fits(tryLine)) { cur = tryLine; continue; }
    if (cur) lines.push(cur);
    cur = '';
    if (fits(word)) { cur = word; continue; }
    for (const ch of graphemes(word)) {
      if (!cur || fits(cur + ch)) cur += ch;
      else { lines.push(cur); cur = ch; }
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function createPainter(ctx, fonts) {
  const items = [];
  const fontOf = (face, size, weight) => `${weight} ${size}px ${fonts[face] ?? fonts.ui}`;

  // 주어진 크기에서 몇 줄, 얼마 높이가 되는지.
  function measure(text, { face = 'ui', weight = 400, size, lh = 1.3, w }) {
    ctx.font = fontOf(face, size, weight);
    const lines = wrap(ctx, text, w);
    return { lines, height: lines.length * size * lh };
  }

  // 상자에 맞춰 그린다. 넘치면 글씨를 한 단계씩 줄여, 잘리는 일은 없다(배치는 정해진 글자 수 안에서 이 일이 거의 없도록 잡았다).
  function text(role, value, box, opt = {}) {
    const { face = 'ui', weight = 400, size = 24, lh = 1.3, align = 'left', valign = 'top', color = TOKENS.meok, ref, extra } = opt;
    const str = String(value ?? '');
    let s = size;
    let m = measure(str, { face, weight, size: s, lh, w: box.w });
    while (m.height > box.h + 0.01 && s > 6) {
      s -= 1;
      m = measure(str, { face, weight, size: s, lh, w: box.w });
    }
    const font = fontOf(face, s, weight);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const lineH = s * lh;
    const top = valign === 'middle' ? box.y + (box.h - m.height) / 2 : valign === 'bottom' ? box.y + box.h - m.height : box.y;
    const lines = m.lines.map((line, i) => {
      const w = ctx.measureText(line).width;
      const x = align === 'center' ? box.x + (box.w - w) / 2 : align === 'right' ? box.x + box.w - w : box.x;
      const y = top + i * lineH;
      ctx.fillText(line, x, y + lineH / 2);
      return { text: line, x, y, w, h: lineH };
    });
    const item = { type: 'text', role, text: str, size: s, font, box: { ...box }, lines };
    if (ref !== undefined) item.ref = ref;
    if (extra) Object.assign(item, extra);
    items.push(item);
    return item;
  }

  function image(role, name, placeholder, rect) {
    items.push({ type: 'image', role, name, placeholder, ...rect });
  }

  return { ctx, items, text, measure, image };
}

// ───────────────────────── 그림 조각 ─────────────────────────

// 한지 결: 늘 같은 무늬가 나오도록 정해진 씨앗으로 섬유를 흩뿌린다(같은 자료면 같은 그림).
function paper(ctx, w, h) {
  ctx.fillStyle = TOKENS.hanji;
  ctx.fillRect(0, 0, w, h);
  let seed = 20261005;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  ctx.save();
  ctx.strokeStyle = TOKENS.hanjiDeep;
  ctx.lineCap = 'round';
  for (let i = 0; i < 420; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 6 + rnd() * 26;
    const a = rnd() * Math.PI;
    ctx.globalAlpha = 0.35 + rnd() * 0.4;
    ctx.lineWidth = 0.6 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 6, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

// 먹 테두리 두 줄과 네 귀퉁이의 작은 단청 꺾쇠.
function frame(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = TOKENS.meok;
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.strokeStyle = TOKENS.meokSoft;
  ctx.lineWidth = 1;
  ctx.strokeRect(34, 34, w - 68, h - 68);
  const corner = (x, y, dx, dy, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + dx * 26, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * 26);
    ctx.stroke();
  };
  corner(40, 40, 1, 1, TOKENS.nokcheong);
  corner(w - 40, 40, -1, 1, TOKENS.juhong);
  corner(40, h - 40, 1, -1, TOKENS.juhong);
  corner(w - 40, h - 40, -1, -1, TOKENS.nokcheong);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rule(ctx, x1, x2, y) {
  ctx.save();
  ctx.strokeStyle = TOKENS.meokFog;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

// 완료 표시: 녹청 동그라미 안의 먹 꺾임 / 아직이면 빈 동그라미.
function doneMark(ctx, cx, cy, r, done) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = done ? TOKENS.nokcheong : TOKENS.meokFog;
  ctx.fillStyle = done ? TOKENS.nokcheong : 'transparent';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (done) ctx.fill();
  ctx.stroke();
  if (done) {
    ctx.strokeStyle = TOKENS.hanji;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.38);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.35);
    ctx.stroke();
  }
  ctx.restore();
}

// 학생 그림: 기록의 생김새(a|b)에 맞는 종이 인형. 그림 자산이 있으면 그것을, 없으면 자리표시 종이 인형을 쓴다.
async function studentImage(appearance, manifest) {
  const name = 'sprite/student-' + (appearance === 'b' ? 'b' : 'a');
  const url = manifest ? createAssets(manifest).image(name) : null;
  if (url && typeof Image === 'function') {
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { name, source: img, width: img.naturalWidth, height: img.naturalHeight, placeholder: false };
    } catch {
      // 자리표시로 넘어간다
    }
  }
  const c = paperDollCanvas(name.slice('sprite/'.length), 256, 512);
  return { name, source: c, width: c.width, height: c.height, placeholder: true };
}

function drawStudent(p, student, rect) {
  const { ctx } = p;
  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 18);
  ctx.fillStyle = TOKENS.hanjiDeep;
  ctx.fill();
  ctx.strokeStyle = TOKENS.meokSoft;
  ctx.lineWidth = 2;
  ctx.stroke();
  const pad = 16;
  const k = Math.min((rect.w - pad * 2) / student.width, (rect.h - pad * 2) / student.height);
  const w = student.width * k;
  const h = student.height * k;
  const x = rect.x + (rect.w - w) / 2;
  const y = rect.y + (rect.h - h) / 2;
  ctx.drawImage(student.source, x, y, w, h);
  ctx.restore();
  p.image('student', student.name, student.placeholder, { x, y, w, h });
}

// ───────────────────────── 자료에서 글로 ─────────────────────────

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function songTitle(id) {
  if (!id) return null;
  return registeredSongs.find((s) => s?.id === id)?.title ?? SONG_TABLE.catalog?.[id]?.title ?? null;
}

const textOr = (v) => (typeof v === 'string' && v.trim() ? v : WORDS.noRecord);
const wordText = (w) => (typeof w === 'string' ? w : w?.text ?? w?.word ?? '');

// 작품 방 기록(spec 9) → 칸 이름과 글. 해석이면 tag: true.
function roomFields(room) {
  if (!room || typeof room !== 'object') return [{ ref: 'none', label: '', text: WORDS.noRoom }];
  const interp = room.isInterpretation === true;
  switch (room.room) {
    case 'hyangga':
      return [{ ref: 'interpretation', label: '고른 해석', text: textOr(room.interpretationText), tag: interp }];
    case 'goryeo':
      return [{ ref: 'condition', label: '내세운 조건', text: textOr(room.lastConditionText) }];
    case 'sijo': {
      const names = (ids) => (Array.isArray(ids) ? ids.map((id) => SIJO_THINGS[id] ?? id).filter(Boolean) : []);
      const inside = names(room.rooms);
      const outside = names(room.outside);
      return [
        { ref: 'rooms', label: '세 칸', text: inside.length ? inside.join(SEP) : WORDS.none },
        { ref: 'outside', label: '집 밖', text: outside.length ? outside.join(SEP) : WORDS.none },
        { ref: 'interpretation', label: '해석 문장', text: textOr(room.interpretationText), tag: interp },
      ];
    }
    case 'gasa': {
      const words = Array.isArray(room.words) ? room.words.map(wordText).filter(Boolean) : [];
      return [{ ref: 'words', label: '모은 시어', text: words.length ? words.join(SEP) : WORDS.none }];
    }
    case 'saseol':
      return [{ ref: 'prediction', label: '나의 예측', text: textOr(room.predictionText) }];
    default:
      return [{ ref: 'none', label: '', text: WORDS.noRoom }];
  }
}

// ───────────────────────── 공통 머리 ─────────────────────────

function header(p, kindText, x, w) {
  p.text('card-kind', kindText, { x, y: 56, w: 400, h: 34 }, { size: 24, color: TOKENS.meokSoft });
  p.text('brand', WORDS.brand, { x: x + w - 320, y: 56, w: 320, h: 34 }, { face: 'body', size: 24, weight: 700, align: 'right', color: TOKENS.meokSoft });
}

// ───────────────────────── 판 카드 ─────────────────────────

function drawWingCard(p, data, student) {
  const { ctx } = p;
  const L = { x: 64, w: 360 };
  const R = { x: 470, w: 1070 };

  // 왼쪽: 학생, 기록 이름, 날짜
  drawStudent(p, student, { x: 104, y: 96, w: 280, h: 400 });
  p.text('record-name', data.recordName, { x: L.x, y: 512, w: L.w, h: 70 }, { face: 'body', weight: 700, size: 44, align: 'center', valign: 'middle', lh: 1.2 });
  p.text('apprentice', WORDS.apprentice, { x: L.x, y: 586, w: L.w, h: 32 }, { size: 22, align: 'center', color: TOKENS.meokSoft });
  const date = formatDate(data.date);
  p.text('date', date ? WORDS.wingDate + ' ' + date : WORDS.noDate, { x: L.x, y: 776, w: L.w, h: 70 }, { size: 22, align: 'center', valign: 'bottom', color: TOKENS.meokSoft });

  // 머리: 카드 종류, 관 이름
  header(p, WORDS.wingKind, R.x, R.w);
  p.text('wing-name', data.wingName, { x: R.x, y: 96, w: 760, h: 84 }, { face: 'body', weight: 700, size: 64, valign: 'middle', lh: 1.2 });
  rule(ctx, R.x, R.x + R.w, 196);

  // 꽂은 칸 노래 세 편
  p.text('head', WORDS.shelfHead, { x: R.x, y: 210, w: 400, h: 32 }, { size: 22, color: TOKENS.meokSoft });
  const songs = Array.isArray(data.shelfSongs) ? data.shelfSongs : [];
  const cellW = 340;
  const gap = (R.w - cellW * 3) / 2;
  songs.slice(0, 3).forEach((s, i) => {
    const x = R.x + i * (cellW + gap);
    ctx.save();
    roundRect(ctx, x, 248, cellW, 76, 10);
    ctx.fillStyle = TOKENS.hanjiDeep;
    ctx.fill();
    ctx.strokeStyle = TOKENS.meok;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    p.text('shelf-song', '「' + (s.title ?? s.id) + '」', { x: x + 14, y: 254, w: cellW - 28, h: 64 }, { face: 'body', weight: 700, size: 28, align: 'center', valign: 'middle', lh: 1.15, ref: s.id });
  });

  // 개념 상태(연필/먹)
  p.text('head', WORDS.conceptHead, { x: R.x, y: 340, w: 400, h: 32 }, { size: 22, color: TOKENS.meokSoft });
  const concepts = Array.isArray(data.concepts) ? data.concepts : [];
  const rowH = Math.min(48, 150 / Math.max(1, concepts.length));
  concepts.forEach((c, i) => {
    const y = 378 + i * rowH;
    const state = WORDS.conceptState[c.state] ? c.state : 'none';
    const chip = { x: R.x, y: y + 5, w: 76, h: rowH - 10 };
    ctx.save();
    roundRect(ctx, chip.x, chip.y, chip.w, chip.h, chip.h / 2);
    if (state === 'ink') {
      ctx.fillStyle = TOKENS.meok;
      ctx.fill();
    } else {
      ctx.lineWidth = 2;
      ctx.strokeStyle = TOKENS.meokSoft;
      if (state === 'none') ctx.setLineDash([5, 4]);
      ctx.stroke();
    }
    ctx.restore();
    p.text('concept-state', WORDS.conceptState[state], { x: chip.x + 6, y: chip.y + 2, w: chip.w - 12, h: chip.h - 4 }, { size: 20, weight: 700, align: 'center', valign: 'middle', lh: 1.1, color: state === 'ink' ? TOKENS.hanji : TOKENS.meok, ref: c.id });
    p.text('concept', c.text, { x: R.x + 96, y: y + 3, w: R.w - 96, h: rowH - 6 }, { face: 'body', size: 26, valign: 'middle', lh: 1.2, ref: c.id });
  });

  // 작품 방의 기록(spec 9)
  const roomId = SONG_TABLE.wings?.[data.wingId]?.room;
  const roomTitle = songTitle(roomId);
  p.text('room-title', WORDS.roomHead + (roomTitle ? ' 「' + roomTitle + '」' : ''), { x: R.x, y: 540, w: R.w, h: 34 }, { size: 22, color: TOKENS.meokSoft });
  drawRoom(p, roomFields(data.room), { x: R.x, y: 582, w: R.w, h: 180 });

  // 덤
  const bonusDone = data.bonusDone === true;
  doneMark(ctx, R.x + 14, 800, 13, bonusDone);
  p.text('bonus', WORDS.bonus[bonusDone], { x: R.x + 40, y: 780, w: 900, h: 40 }, { size: 26, valign: 'middle', lh: 1.2, extra: { done: bonusDone } });
}

// 작품 방 칸들을 위에서 아래로 쌓는다. 모두 들어갈 때까지 같은 크기로 함께 줄인다.
function drawRoom(p, fields, region) {
  const labelW = 170;
  const valueX = region.x + labelW + 20;
  const valueW = region.w - labelW - 20;
  const gap = 10;
  const tagH = 34;
  const plan = (size) => {
    const rows = fields.map((f) => {
      const v = p.measure(f.text, { face: 'body', size, lh: 1.35, w: valueW });
      const l = f.label ? p.measure(f.label, { size: 20, lh: 1.3, w: labelW }) : { height: 0 };
      const leftH = l.height + (f.tag ? tagH + 6 : 0);
      return { f, valueH: v.height, labelH: l.height, h: Math.max(v.height, leftH) };
    });
    return { rows, total: rows.reduce((s, r) => s + r.h, 0) + gap * (rows.length - 1) };
  };
  let size = 26;
  let pl = plan(size);
  while (pl.total > region.h && size > 14) pl = plan(--size);
  let y = region.y;
  for (const r of pl.rows) {
    if (r.f.label) p.text('room-label', r.f.label, { x: region.x, y, w: labelW, h: r.labelH }, { size: 20, lh: 1.3, color: TOKENS.meokSoft, ref: r.f.ref });
    if (r.f.tag) {
      const tag = { x: region.x, y: y + r.labelH + 6, w: 64, h: tagH };
      const { ctx } = p;
      ctx.save();
      roundRect(ctx, tag.x, tag.y, tag.w, tag.h, 6);
      ctx.lineWidth = 2;
      ctx.strokeStyle = TOKENS.meok;
      ctx.stroke();
      ctx.restore();
      p.text('interpretation-tag', WORDS.interpretationTag, { x: tag.x + 4, y: tag.y + 2, w: tag.w - 8, h: tag.h - 4 }, { size: 20, weight: 700, align: 'center', valign: 'middle', lh: 1.1, ref: r.f.ref });
    }
    p.text('room-text', r.f.text, { x: valueX, y, w: valueW, h: Math.max(r.valueH, 1) }, { face: 'body', size, lh: 1.35, ref: r.f.ref });
    y += r.h + gap;
  }
}

// ───────────────────────── 마지막 카드 ─────────────────────────

function drawFinalCard(p, data, student) {
  const { ctx } = p;
  const L = { x: 56, w: 340 };
  const R = { x: 430, w: 1116 };

  // 왼쪽: 학생, 기록 이름, 서고 완성, 다섯 관, 날짜
  drawStudent(p, student, { x: 116, y: 66, w: 220, h: 306 });
  p.text('record-name', data.recordName, { x: L.x, y: 382, w: L.w, h: 60 }, { face: 'body', weight: 700, size: 40, align: 'center', valign: 'middle', lh: 1.2 });
  const pill = { x: L.x + (L.w - 180) / 2, y: 452, w: 180, h: 46 };
  ctx.save();
  roundRect(ctx, pill.x, pill.y, pill.w, pill.h, 10);
  ctx.fillStyle = TOKENS.meok;
  ctx.fill();
  ctx.restore();
  p.text('complete', WORDS.complete, { x: pill.x + 8, y: pill.y + 4, w: pill.w - 16, h: pill.h - 8 }, { face: 'body', size: 26, weight: 700, align: 'center', valign: 'middle', lh: 1.15, color: TOKENS.hanji });

  p.text('head', WORDS.wingsHead, { x: L.x + 24, y: 512, w: 300, h: 30 }, { size: 20, color: TOKENS.meokSoft });
  const wings = Array.isArray(data.wings) ? data.wings : [];
  wings.forEach((w, i) => {
    const y = 548 + i * 44;
    doneMark(ctx, L.x + 40, y + 20, 13, w.done === true);
    p.text('wing-done', w.name, { x: L.x + 66, y, w: 250, h: 40 }, { face: 'body', size: 24, valign: 'middle', lh: 1.2, ref: w.id, extra: { done: w.done === true } });
  });
  const date = formatDate(data.date);
  p.text('date', date ? WORDS.finalDate + ' ' + date : WORDS.noDate, { x: L.x, y: 780, w: L.w, h: 66 }, { size: 20, align: 'center', valign: 'bottom', color: TOKENS.meokSoft });

  header(p, WORDS.finalKind, R.x, R.w);

  // 보스 1단계 낯선 노래 다섯 편: 처음에 맞혔는지, 일지 도움, 누가 불렀을까(spec 10.2·12)
  p.text('head', WORDS.bossHead, { x: R.x, y: 100, w: 590, h: 30 }, { size: 22, color: TOKENS.meokSoft });
  const cols = [
    { x: R.x, w: 190 },
    { x: R.x + 196, w: 130 },
    { x: R.x + 332, w: 116 },
    { x: R.x + 454, w: 136 },
  ];
  WORDS.bossCols.forEach((label, i) => {
    p.text('boss-col', label, { x: cols[i].x + 4, y: 136, w: cols[i].w - 8, h: 30 }, { size: 18, weight: 700, align: i === 0 ? 'left' : 'center', valign: 'middle', lh: 1.2, color: TOKENS.meokSoft });
  });
  rule(ctx, R.x, R.x + 590, 172);
  const boss = Array.isArray(data.boss) ? data.boss : [];
  const rowH = Math.min(68, 340 / Math.max(1, boss.length));
  boss.forEach((b, i) => {
    const y = 178 + i * rowH;
    if (i % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = TOKENS.hanjiDeep;
      ctx.fillRect(R.x, y, 590, rowH);
      ctx.restore();
    }
    const cell = (c) => ({ x: cols[c].x + 4, y: y + 4, w: cols[c].w - 8, h: rowH - 8 });
    p.text('boss-title', b.title ?? b.songId, cell(0), { face: 'body', size: 24, weight: 700, valign: 'middle', lh: 1.15, ref: b.songId });
    p.text('boss-first', WORDS.first[String(b.firstTryCorrect)] ?? WORDS.noRecord, cell(1), { size: 22, align: 'center', valign: 'middle', lh: 1.15, ref: b.songId });
    p.text('boss-help', WORDS.help[String(b.journalHelp === true)], cell(2), { size: 22, align: 'center', valign: 'middle', lh: 1.15, ref: b.songId });
    p.text('boss-singer', WORDS.singer[String(b.singerGroupCorrect)] ?? WORDS.noRecord, cell(3), { size: 22, align: 'center', valign: 'middle', lh: 1.15, ref: b.songId });
  });

  // 먹 개념 목록
  const inkX = R.x + 626;
  const inkW = R.x + R.w - inkX;
  p.text('head', WORDS.inkHead, { x: inkX, y: 100, w: inkW, h: 30 }, { size: 22, color: TOKENS.meokSoft });
  const inks = Array.isArray(data.inkConcepts) ? data.inkConcepts : [];
  const listTop = 140;
  const listH = 410;
  if (!inks.length) {
    p.text('ink-none', WORDS.inkNone, { x: inkX, y: listTop, w: inkW, h: 40 }, { face: 'body', size: 22, color: TOKENS.meokSoft });
  } else {
    const gap = 5;
    const textX = inkX + 20;
    const textW = inkW - 20;
    const total = (size) => inks.reduce((s, c) => s + p.measure(c.text, { face: 'body', size, lh: 1.28, w: textW }).height, 0) + gap * (inks.length - 1);
    let size = 22;
    while (total(size) > listH && size > 12) size--;
    let y = listTop;
    for (const c of inks) {
      const h = p.measure(c.text, { face: 'body', size, lh: 1.28, w: textW }).height;
      ctx.save();
      ctx.fillStyle = TOKENS.meok;
      ctx.beginPath();
      ctx.arc(inkX + 6, y + size * 0.64, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      p.text('ink-concept', c.text, { x: textX, y, w: textW, h }, { face: 'body', size, lh: 1.28, ref: c.id, extra: { genre: c.genre } });
      y += h + gap;
    }
  }

  // 엔딩: 나의 노래 한 줄, 고른 관, 근거 개념, 한마디
  const e = data.ending ?? {};
  rule(ctx, R.x, R.x + R.w, 566);
  p.text('head', WORDS.endingHead, { x: R.x, y: 578, w: 400, h: 30 }, { size: 20, color: TOKENS.meokSoft });
  p.text('ending-line', e.line ?? '', { x: R.x, y: 612, w: R.w, h: 110 }, { face: 'body', weight: 700, size: 40, lh: 1.3 });
  p.text('label', WORDS.endingWing, { x: R.x, y: 730, w: 90, h: 36 }, { size: 20, valign: 'middle', color: TOKENS.meokSoft });
  p.text('ending-wing', e.wingName ?? WORDS.noRecord, { x: R.x + 94, y: 730, w: 170, h: 36 }, { face: 'body', size: 26, weight: 700, valign: 'middle', lh: 1.2 });
  p.text('label', WORDS.endingConcept, { x: R.x + 280, y: 730, w: 100, h: 36 }, { size: 20, valign: 'middle', color: TOKENS.meokSoft });
  p.text('ending-concept', e.conceptText ?? WORDS.noRecord, { x: R.x + 384, y: 730, w: R.w - 384, h: 36 }, { face: 'body', size: 24, valign: 'middle', lh: 1.2 });
  if (typeof e.note === 'string' && e.note.trim()) {
    p.text('label', WORDS.endingNote, { x: R.x, y: 778, w: 90, h: 32 }, { size: 20, valign: 'middle', color: TOKENS.meokSoft });
    p.text('ending-note', e.note, { x: R.x + 94, y: 776, w: R.w - 94, h: 76 }, { face: 'body', size: 25, lh: 1.3 });
  }
}

// ───────────────────────── 내보내기 ─────────────────────────

// 카드를 그린다. data는 buildWingCard/buildFinalCard의 결과. opts.canvas를 주면 그 캔버스에 그린다.
// opts.manifest: 자산 목록(있으면 학생 그림 자산을 쓴다). 돌려주는 layout.items에 그린 글과 그림이 모두 있다.
export async function renderCard(data, { canvas = null, manifest = null } = {}) {
  if (!data || (data.kind !== 'wing' && data.kind !== 'final')) throw new TypeError('결과 카드 자료가 없다');
  const fonts = fontStacks();
  await waitFonts(fonts);
  const student = await studentImage(data.appearance, manifest);
  const c = canvas ?? document.createElement('canvas');
  c.width = CARD_SIZE.width;
  c.height = CARD_SIZE.height;
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  paper(ctx, c.width, c.height);
  frame(ctx, c.width, c.height);
  const p = createPainter(ctx, fonts);
  if (data.kind === 'wing') drawWingCard(p, data, student);
  else drawFinalCard(p, data, student);
  const layout = { kind: data.kind, width: c.width, height: c.height, fileName: cardFileName(data), items: p.items };
  return { canvas: c, layout };
}

export function cardToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG를 만들 수 없다'))), 'image/png');
  });
}

// 파일 이름 기본값(spec 12, js/core/cards.js가 정함). 파일 이름에 쓸 수 없는 글자만 '_'로 바꾼다.
export function cardFileName(data) {
  const raw = data?.fileName
    || CARD_FILE_PREFIX + '_' + (data?.recordName ?? '') + '_' + (data?.kind === 'final' ? '마지막' : data?.wingName ?? '') + '.png';
  return String(raw).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
}

// 내려받기를 일으킨다(브라우저의 내려받기 창 또는 바로 저장).
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// 지금 자료로 다시 그려 PNG로 내려받는다.
export async function downloadCard(data, opts = {}) {
  const { canvas, layout } = await renderCard(data, opts);
  const blob = await cardToBlob(canvas);
  const fileName = cardFileName(data);
  saveBlob(blob, fileName);
  return { blob, fileName, canvas, layout };
}
