// 학생이 입력한 글의 글자 세기(이름 1~12자, 엔딩 한 줄 1~40자, 한마디 0~60자). 화면 없는 도우미라 Node에서도 바로 import된다.
//
//   cleanText(s)       NFC로 맞추고 앞뒤 공백을 뺀다. 저장하고 비교하는 글은 모두 이 모양이다(같은 이름 찾기, 엔딩 글).
//   graphemeCount(s)   눈에 보이는 글자 단위(확장 자소 덩어리)로 센다. 사람 셋을 이음표로 이은 가족 이모지는 1자,
//                      첫가끝 자모로 풀어 쓴 한글 한 글자(첫소리+가운뎃소리+끝소리)도 1자다. 코드 포인트나 UTF-16 길이로 세지 않는다.
//                      Intl.Segmenter가 없는 브라우저(옛 사파리)에서는 fallbackGraphemeCount로 어림한다.
//   fallbackGraphemeCount(s)
//                      Intl.Segmenter 없이 세는 어림: 결합 부호·이음표(ZWJ)로 이어진 것·이모지 피부색·태그 문자·국기 짝·
//                      한글 가운뎃소리·끝소리 자모를 앞 글자에 붙여 센다.
//
// 결과 카드(js/result/card.js)의 줄 나누기도 같은 단위(Intl.Segmenter)로 글자를 나눈다.
// 글꼴 점검(check-fonts)은 게임 소스의 모든 글자를 글꼴에 있어야 할 글자로 보므로, 이 파일은 특수 글자를 글자 그대로 쓰지 않고 코드 포인트 수로 다룬다.

let segmenter;   // 한 번 만들어 다시 쓴다(없으면 null)
function getSegmenter() {
  if (segmenter === undefined) {
    try {
      segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
    } catch {
      segmenter = null;
    }
  }
  return segmenter;
}

export function cleanText(s) {
  return String(s ?? '').normalize('NFC').trim();
}

export function graphemeCount(s) {
  const str = String(s ?? '');
  if (!str) return 0;
  const seg = getSegmenter();
  if (!seg) return fallbackGraphemeCount(str);
  let n = 0;
  for (const _ of seg.segment(str)) n++;
  return n;
}

const MARK = /^\p{M}$/u;   // 결합 부호(이체 선택자 포함)
const ZWJ = 0x200d;
const inRange = (cp, a, b) => cp >= a && cp <= b;
// 앞 글자에 붙는 코드 포인트: 결합 부호, 이모지 피부색, 태그 문자, 한글 가운뎃소리·끝소리(첫가끝, 확장 B 포함)
function extendsPrevious(ch, cp) {
  return MARK.test(ch)
    || inRange(cp, 0x1f3fb, 0x1f3ff)
    || inRange(cp, 0xe0020, 0xe007f)
    || inRange(cp, 0x1160, 0x11ff)
    || inRange(cp, 0xd7b0, 0xd7ff);
}
const isRegional = (cp) => inRange(cp, 0x1f1e6, 0x1f1ff);   // 국기 글자(둘이 한 짝)

export function fallbackGraphemeCount(s) {
  let n = 0;
  let joinNext = false;       // 앞이 이음표(ZWJ)면 이 글자는 앞 덩어리에 붙는다
  let regionalOpen = false;   // 국기 짝의 첫 글자를 막 셌다
  for (const ch of String(s ?? '')) {
    const cp = ch.codePointAt(0);
    if (cp === ZWJ) { joinNext = n > 0; continue; }
    if (n > 0 && (joinNext || extendsPrevious(ch, cp))) { joinNext = false; continue; }
    joinNext = false;
    if (isRegional(cp)) {
      if (regionalOpen) { regionalOpen = false; continue; }
      regionalOpen = true;
    } else {
      regionalOpen = false;
    }
    n++;
  }
  return n;
}
