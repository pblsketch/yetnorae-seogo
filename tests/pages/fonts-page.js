// 점검 페이지: 제품 글꼴(css/base.css의 --font-body·--font-ui)로 옛 글자를 그려 너비를 잰다.
// 이 파일은 tests/ 아래에만 있고 제품 흐름에서는 쓰지 않는다.
const SIZE = 40;

function stack(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 한 묶음(옛 글자)과 그 자모를 따로따로 그린 너비의 합을 잰다.
function measure(font, cluster) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = font;
  const whole = ctx.measureText(cluster).width;
  const loose = [...cluster].reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
  return { whole, loose };
}

// DOM에서 그린 너비(제품 화면과 같은 길)
function domWidth(family, text) {
  const s = document.createElement('span');
  s.style.cssText = `font-family:${family};font-size:${SIZE}px;white-space:pre;display:inline-block;line-height:1`;
  s.textContent = text;
  document.getElementById('app').append(s);
  const w = s.getBoundingClientRect().width;
  s.remove();
  return w;
}

// 같은 글자를 두 글꼴로 그려 화소가 다른지 본다(부분 글꼴이 아니라 기기 글꼴로 그려졌는지 가리려고).
function pixels(font, text) {
  const c = document.createElement('canvas');
  c.width = SIZE * 3;
  c.height = SIZE * 2;
  const g = c.getContext('2d');
  g.font = font;
  g.fillStyle = '#000';
  g.textBaseline = 'middle';
  g.fillText(text, 4, SIZE);
  return g.getImageData(0, 0, c.width, c.height).data;
}
function differs(a, b) {
  for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return true;
  return false;
}

window.__fonts = {
  // 본문 글꼴만으로 그린 것과 기기 명조(serif)로 그린 것이 다른 글자 수
  distinct(clusters) {
    return clusters.filter((c) => differs(pixels(`400 ${SIZE}px YetnoraeText`, c), pixels(`400 ${SIZE}px serif`, c))).length;
  },
  SIZE,
  // clusters: 옛 글자 목록. 글꼴을 다 읽은 뒤 잰다.
  async run(clusters) {
    const body = stack('--font-body');
    const ui = stack('--font-ui');
    const sample = clusters.join('');
    const loaded = [];
    for (const w of [400, 700]) {
      const faces = await document.fonts.load(`${w} ${SIZE}px ${body}`, sample);
      loaded.push(...faces.map((f) => `${f.family}|${f.weight}|${f.status}`));
      const uiFaces = await document.fonts.load(`${w} ${SIZE}px ${ui}`, sample);
      loaded.push(...uiFaces.map((f) => `${f.family}|${f.weight}|${f.status}`));
    }
    await document.fonts.ready;
    const rows = [];
    for (const c of clusters) {
      for (const [face, fam] of [['body', body], ['ui', ui]]) {
        for (const w of [400, 700]) {
          const m = measure(`${w} ${SIZE}px ${fam}`, c);
          rows.push({ cluster: c, face, weight: w, ...m });
        }
      }
      rows.push({ cluster: c, face: 'dom-body', weight: 400, whole: domWidth(body, c), loose: [...c].reduce((s, ch) => s + domWidth(body, ch), 0) });
    }
    return {
      body, ui, loaded,
      checkBody: document.fonts.check(`400 ${SIZE}px YetnoraeText`, sample),
      checkUi: document.fonts.check(`400 ${SIZE}px YetnoraeUI`, sample),
      rows,
    };
  },
};
document.documentElement.dataset.ready = '1';
