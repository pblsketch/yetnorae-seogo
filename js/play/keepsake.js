// 기념품 카드 한 장(spec 8). 노래 한 편에 한 장이다.
//  - 물건 카드: 노래 속에 실제로 나오는 물건, 그 물건이 나오는 구절, 향유층 한 줄
//  - '노래 속 마음' 카드(keepsake.kind === 'mind'): 노래에 실제로 나오는 말, '노래 속 마음' 표시, 노래의 cardNote 한 줄
// 글은 모두 노래 데이터(keepsake, cardNote)에서 그대로 가져온다.
import { el, assetUrl, quoted } from './dom.js';
import { L } from './labels.js';

export function keepsakeCard(song, manifest) {
  const k = song?.keepsake ?? {};
  const kind = k.kind === 'mind' ? 'mind' : 'object';
  const card = el('article', 'play-keepsake');
  card.dataset.song = song.id;
  card.dataset.kind = kind;
  const figure = el('div', 'play-keepsake-art');
  const src = assetUrl(manifest, 'keepsake/' + song.id);
  if (src) {
    const img = el('img');
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    figure.append(img);
  } else {
    figure.append(el('span', 'play-keepsake-mark', kind === 'mind' ? '心' : '物'));
  }
  const kindLabel = el('p', 'play-keepsake-kind', kind === 'mind' ? L.kindMind : L.kindObject);
  const name = el('h3', 'play-keepsake-name', k.name ?? '');
  const from = el('p', 'play-keepsake-song', quoted(song.title));
  const phrase = el('blockquote', 'play-keepsake-phrase', k.phrase ?? '');
  card.append(figure, kindLabel, name, from, phrase);
  if (song.cardNote) card.append(el('p', 'play-keepsake-note', song.cardNote));
  if (k.classLine) card.append(el('p', 'play-keepsake-class', k.classLine));
  card.setAttribute('aria-label', (kind === 'mind' ? L.kindMind : L.kindObject) + ' ' + (k.name ?? '') + ', ' + quoted(song.title));
  return card;
}
