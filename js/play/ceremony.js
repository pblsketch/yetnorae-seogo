// 칸·탑·덤이 묶인 뒤의 연출(spec 8): 세 노래의 가객이 2D 종이 인형으로 하나씩 나와 한 소절을 부르고,
// 이어서 기념품 카드 석 장을 남긴다. 설화에 바탕한 장면(legend)에는 '전해지는 이야기'를 붙인다.
// 가객 이름과 소절 글, 기념품 글은 모두 노래 데이터에서 그대로 가져온다.
import { buildGrid } from '../core/rhythm.js';
import { joinFeet } from '../core/song-shape.js';
import { paperDollCanvas } from '../world/sprites.js';
import { el, button, assetUrl, quoted } from './dom.js';
import { keepsakeCard } from './keepsake.js';
import { L } from './labels.js';

// 노래의 첫 소절(첫 단위, 고려가요는 첫 줄)의 원문
export function firstLine(song) {
  const u = song?.units?.[0];
  if (!u) return '';
  if (song.genre === 'hyangga') return u.original ?? '';
  const feet = song.genre === 'goryeo' ? u.lines?.[0]?.feet : u.feet;
  return joinFeet(feet ?? [], 'original');
}

// 가객 이름 머리. 지은이가 전해지는 귀속(singer.traditional)이면 '전하는 작자: '를 앞에 붙인다(이름은 그대로 .play-singer-name).
export function singerHeading(singer) {
  const h = el('h3', 'play-singer-heading');
  const prefix = L.singerPrefix(singer);
  if (prefix) h.append(el('span', 'play-singer-traditional', prefix));
  h.append(el('span', 'play-singer-name', singer?.name ?? ''));
  return h;
}

// host:연출을 띄울 요소. list: 노래 객체 셋. engine: 소리 엔진(한 소절을 낸다). signal: 중단 신호.
// lead: 첫 가객 카드 위에 보일 한 줄(칸이 묶일 때 드러나는 단위 이름, 없으면 생략).
// 학생이 '도감에 담기'를 누르면 끝난다(중단되면 바로 끝난다).
export function playCeremony(host, { list, manifest, engine, signal, reduceMotion = () => false, lead = null }) {
  return new Promise((resolve) => {
    let box = null;
    let sound = null;
    const stopSound = () => { try { sound?.stop?.(); } catch { /* 이미 멈춤 */ } sound = null; };
    const finish = () => {
      stopSound();
      box?.remove();
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    if (signal?.aborted) { resolve(); return; }
    signal?.addEventListener('abort', finish, { once: true });

    function showSinger(i) {
      stopSound();
      box?.remove();
      if (i >= list.length) { showKeepsakes(); return; }
      const s = list[i];
      box = el('section', 'play-singers' + (reduceMotion() ? ' is-still' : ''));
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', L.singersTitle);
      const card = el('article', 'play-singer');
      card.dataset.song = s.id;
      const doll = el('img', 'play-singer-doll');
      doll.alt = '';
      doll.src = assetUrl(manifest, 'sprite/singer-' + s.id) ?? paperDollCanvas('singer').toDataURL();
      const info = el('div', 'play-singer-info');
      info.append(el('p', 'play-singer-count', L.singersTitle + ' (' + (i + 1) + '/' + list.length + ')'));
      if (s.legend === true) info.append(el('p', 'play-legend', L.legend));
      info.append(
        singerHeading(s.singer),
        el('p', 'play-singer-class', s.singer?.class ?? ''),
        el('p', 'play-singer-song', quoted(s.title)),
        el('blockquote', 'play-singer-line', firstLine(s)),
      );
      card.append(doll, info);
      const next = button('play-next', L.nextSinger);
      next.addEventListener('click', () => showSinger(i + 1), { once: true });
      if (lead && i === 0) box.append(el('p', 'play-reveal', lead));
      box.append(card, next);
      host.append(box);
      next.focus({ preventScroll: true });
      // 한 소절을 부른다(첫 단위). 소리를 낼 수 없으면 조용히 넘어간다.
      try {
        if (engine?.play) sound = engine.play(buildGrid(s), [0]);
      } catch { sound = null; }
    }

    function showKeepsakes() {
      box = el('section', 'play-keepsakes');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', L.keepsakesTitle);
      const grid = el('div', 'play-keepsake-row play-scroll');
      for (const s of list) grid.append(keepsakeCard(s, manifest));
      const done = button('play-close', L.keepsakesDone);
      done.addEventListener('click', finish, { once: true });
      box.append(el('h2', 'play-keepsakes-title', L.keepsakesTitle), grid, done);
      host.append(box);
      done.focus({ preventScroll: true });
    }

    showSinger(0);
  });
}
