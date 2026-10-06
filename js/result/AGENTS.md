# js/result — 결과 카드 PNG

## 맡는 것
- `card.js`: 카드 자료를 1600×900 캔버스에 그리기(`renderCard(data, { canvas?, manifest? }) → { canvas, layout }`), PNG 만들기(`cardToBlob`), 파일 이름(`cardFileName`), 내려받기(`saveBlob`, `downloadCard`). 카드에 쓰는 말 `WORDS`와 「십 년을 경영하야」 물건 이름 `SIJO_THINGS`.
- `card-view.js`: 카드 미리 보기와 내려받기 버튼 `showCard(container, source, { manifest?, onClose? }) → { ready, download(), refresh(), layout, canvas, dispose() }`.

## 맡지 않는 것
- 카드에 무엇을 담을지 모으는 일. 자료는 언제나 `js/core/cards.js`의 `buildWingCard(record, 관 id)`·`buildFinalCard(record)` 결과만 받는다. 기록을 직접 읽지 않는다.
- 카드를 언제 띄울지(한 판 흐름, 엔딩, 설정의 '마지막 카드'가 정한다).
- 카드 그림 저장. 그림은 어디에도 저장하지 않는다.

## 불변식
- 카드에 학생을 평가해 매기는 값과 그렇게 읽히는 말을 쓰지 않는다. 보스 기록은 '맞힘 / 다시 꽂음', '받음 / 안 받음', '맞힘 / 못 맞힘'처럼 사실만 적는다. 새 말은 `WORDS`에만 더한다.
- 배치는 픽셀로 고정이다. 글자 크기 설정과 상관없이 늘 같은 자리에 그린다.
- 긴 글(엔딩 한 줄, 한마디, 해석 문장)은 줄을 바꾸고, 그래도 넘치면 글씨를 줄여 상자 안에 넣는다. 잘리는 글이 없어야 한다.
- 그린 글과 그림은 모두 `layout.items`에 남긴다(글: `{ type: 'text', role, ref?, text, size, font, box, lines }`, 그림: `{ type: 'image', role: 'student', name, placeholder, … }`). 점검이 이것으로 담긴 글, 잘림, 매기는 말을 확인하므로, 캔버스에만 그리고 `layout`에 남기지 않는 글을 만들지 않는다.
- `source`에 **함수**를 주면 내려받을 때마다 지금의 기록으로 다시 모아 다시 그린다. 판 카드의 '덤'이 나중에 바뀌는 것은 이 때문이다. 자료가 `null`이면 내려받기 버튼 없이 안내만 보인다.
- 파일 이름은 자료의 `fileName`(`옛노래서고_<이름>_<관 이름>.png`, `옛노래서고_<이름>_마지막.png`)을 쓰고, 파일 이름에 쓸 수 없는 글자(`\ / : * ? " < > |`)만 `_`로 바꾼다.
- 학생 그림은 기록의 `appearance`로 `sprite/student-a` 또는 `-b`를 고른다. 자산 목록이 없거나 그림이 없으면 자리표시 종이 인형을 그린다. 카드 장식은 `card/frame`(1600×900, 가운데 투명).

## 구현 방식
- 그리기 전에 `document.fonts.ready`를 기다린다. 글꼴은 문서의 `--font-body`·`--font-ui`를 읽고, base.css가 없는 곳에서는 `FALLBACK_FONTS`를 쓴다. 이 값은 `css/base.css`의 글꼴 묶음과 같아야 한다.
- 색은 `js/world/palette.js`의 `TOKENS`를 쓴다(CSS 변수를 캔버스에서 쓸 수 없으므로).
- 판 카드의 작품 방 칸: 「제망매가」 고른 해석('해석' 표시), 「정석가」 마지막 조건 카드, 「십 년을 경영하야」 세 칸·집 밖·해석 문장('해석' 표시), 「상춘곡」 모은 시어, 「님이 오마 하거늘」 나의 예측.
- 화면 낭독기용 설명은 `layout`의 글을 이어 붙여 만든다.
- `WORDS`와 `SIJO_THINGS`는 교사 확인 대상이라 글 확인 문서가 이 파일에서 읽는다. 고치면 글 확인 문서를 다시 만든다.
- 스타일은 `css/result.css`(미리 보기 화면만).

## 점검
- `node tests/check-card.mjs`(`tests/pages/card.html`): 판 카드와 마지막 카드를 실제로 내려받아 PNG 서명과 크기, 그려진 글(이름, 관, 해석, 보스 기록, 엔딩 글), 긴 글이 잘리지 않는지, 매기는 말이 없는지, 다시 내려받으면 지금 기록으로 다시 그리는지, 두 모습의 학생 그림. 음성 사례 포함.
- 완주 점검이 판 카드 다섯과 마지막 카드를 실제로 내려받아 빈 그림이 아닌지 본다.
