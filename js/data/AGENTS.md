# js/data — 노래와 글 데이터

모양의 기준은 이 폴더의 `README.md`(데이터와 모듈 약속)다. 필드 하나, 값 하나를 더하려면 그 문서와 검증기(`js/core/validate.js`)를 함께 고친다. 아래는 이 폴더를 고칠 때 지켜야 할 것이다.

## 맡는 것
| 파일 | 내용 | 교사 확인 대상 |
| --- | --- | --- |
| `songs/<갈래 id>.js` | 그 갈래의 노래(`export const songs = [...]`). 원문·오늘 소리·풀이·해독은 모두 `units` 안에 | 오늘 소리, 제작진 풀이, 음보 나눔, `pending` 원문 |
| `songs/index.js` | 갈래별 노래와 수첩 쪽 등록(`songs`, `notebook`) | — |
| `song-table.js` | 노래 id 목록(`SONG_CATALOG`), 노래 표(`WING_TABLE`, `BOSS_TABLE`), 행선지 결과(`ROUTING`) | — |
| `wings.js` | 갈래 다섯, 관 여섯(입구 포함)과 순서, 고유 동작 다섯 | 관·동작 이름 |
| `concepts.js` | 개념 13개와 일지 문장, 향유층 무리 다섯, 향유층 | 일지 문장 |
| `notebook-<갈래 id>.js` | 『분류 수첩』 쪽(설명 문단, 오답 도움에 반짝일 줄과 그 개념) | 전부 |
| `rooms-<관 id>.js` | 작품 방 글(해석 문장, 조건 카드, 시어, 예측 후보, 물건 이름) | 전부 |
| `story.js` | 미션 문장 `MISSION`, 편지·목소리·들어가기 글·좀·단서·엔딩 글·화면 글 `STORY` | 전부 |
| `boss-text.js` | 보스 글과 화자 | 전부 |
| `remix.js` | 보스 2단계 리믹스 조각 다섯과 순서 | 조각 선택 |
| `credits.js` | 출처 화면 고정 글 | 전부 |

## 맡지 않는 것
- 계산과 화면. 이 폴더의 파일은 데이터만 내보내고 `js/` 다른 폴더를 import하지 않는다(데이터끼리는 된다).
- 낭송 빠르기 정하기. 노래의 `tempo`는 낭송 도구(`--write-tempo`)가 쓴다. 손으로 고치면 낭송 조각과 어긋난다.

## 불변식
- **노래 표는 확정된 것이다.** `song-table.js`의 칸·길 잃은 노래·행선지·작품 방·덤·낯선 노래와 그 결과(미리 잰 노래 6편, 돌아온 노래 4편)를 사용자 승인 없이 바꾸지 않는다. 노래 데이터의 `roles`, `title`, `genre`, `excerpt`는 이 표와 정확히 같아야 한다.
- 노래 id는 `SONG_CATALOG`에 있는 것만 쓴다. 영문 소문자·숫자·하이픈이다. 낯선 노래 자리 `sinheum-sijo`, `suneung-saseol`은 출제작을 고르기 전의 자리 이름이라 id는 그대로 두고 고른 작품 제목을 `title`에 쓴다.
- 향가관 층 노래(`shelfFloors: [4, 8, 10]`)의 구 수는 그 층과 같다.
- 형식 규칙: 시조 3장·장마다 4음보·종장 첫 음보 3음절, 사설시조 3장·종장 첫 음보 3음절·초장이나 중장이 4음보보다 김, 향가 4·8·10구(10구체는 `grouping: [4,4,2]`, 감탄사는 9구 `unit: 8`), 고려가요 연과 줄·줄마다 음보·후렴이나 여음 하나 이상, 가사 4행 이상·4음보 행 80% 이상. 글자 수는 오늘 소리로 센다.
- `evidences`는 그 노래의 형식 표시와 단위에서 실제로 나오는 개념의 부분집합이고, 자기 갈래 개념만이다. 13개 개념 모두가 반드시 지나는 길(튜토리얼, 칸, 길 잃은 노래, 작품 방)의 서로 다른 노래 두 편 이상으로 먹이 될 수 있어야 한다. 노래나 `evidences`를 바꾸면 이 조건을 다시 확인한다.
- 모든 노래에 `citation`과 `verification`이 있다. 교과서 수록 노래는 교과서 그대로 옮기고 `citation`에 "고등학교 공통국어2 교과서 수록본"처럼 쓴다. 출판사 이름은 어디에도 쓰지 않는다. 교과서 밖 원문·해독·풀이는 기억으로 쓰지 않고 찾은 자료에서 옮겨 출처를 적고 `pending`으로 둔다. 출처가 약한 자료(백과 위키, 카페 글)에서 옮겼으면 `citationNote`에 그 사실을 적는다. `verified`는 교과서 추출본과 글자 대조로 맞춘 교과서 노래, 또는 교사가 확인했다고 알려 준 노래에만 쓴다.
- 교과서 대목 뒤에 이어 붙인 단위는 노래 끝에 모아 `beyondTextbook: true`와 `sourceNote`를 달고, 그 노래는 `pending`이다. 교과서 대목은 고치지 않는다.
- 향가 해독은 김완진 해독을 쓴다(`decipherment: { scholar, book }`).
- 기념품의 `word`와 `phrase`는 노래 글(원문·해독문·오늘 소리·풀이) 어딘가에 공백만 빼고 그대로 있어야 한다. 인물 전기에 기댄 물건은 쓰지 않는다. '노래 속 마음' 카드(`kind: 'mind'`)는 「가시리」와 「어져 내 일이여」만 쓴다.
- 방 글의 id, 해석 id, 개념 id, 무리 id는 저장된 기록이 가리키므로 글을 고쳐도 id는 바꾸지 않는다.
- 미션 문장 `MISSION`은 한 글자도 바꾸지 않는다.
- 리믹스 조각은 갈래마다 정확히 하나, 모두 다섯이고, 노래는 그 갈래 관의 **칸 노래**여야 한다. 시조와 사설시조 조각은 붙여 놓지 않는다.
- 글 파일과 노래 데이터에는 평가를 매기는 말을 쓰지 않는다(보스·이야기 글은 점검이 소스를 훑는다).

## 구현 방식
- 노래 글을 바꾸면 다른 곳의 번호도 따라 바뀐다. 함께 볼 곳: `rooms-goryeo.js`의 `finalUnit`·`echo`(「정석가」 마지막 연, 「서경별곡」 같은 연), `rooms-gasa.js`의 시어 `unit`과 머무는 곳 범위, 「님이 오마 하거늘」 중장의 `reversal.fromFoot`·`glossBefore`, `remix.js`의 `from`·`to`(예: 「찬기파랑가」 9~10구), 그 노래의 낭송 조각(단위·음보 수가 바뀌면 다시 만든다), 기념품 `phrase`.
- 새 갈래 파일이나 새 글 파일을 더하면 `songs/index.js`에 등록하고, 글 파일이면 `tools/text/review-doc.mjs`의 `SOURCES`와 `tests/check-review-doc.mjs`의 `TEXT_FILES`에도 더한다.
- 데이터를 고친 뒤 순서: `node tests/check-data.mjs` → 새 글자가 있으면 `python tools/fonts/build_fonts.py` → `node tools/text/review-doc.mjs` → `node tests/check-fonts.mjs`, `node tests/check-review-doc.mjs`, `node tests/check-credits.mjs`. 교과서 노래는 추출본이 있으면 `node tools/text/compare-textbook.mjs --only <id>`로 대조한다.
- `README.md` 안의 예시 노래(`json example-song` 블록)는 `check-data`가 검증기로 돌려 본다. 약속을 바꾸면 이 예시도 맞게 고친다.

## 점검
- `node tests/check-data.mjs`: 관·개념·노래 표의 모양, README 예시 노래, 실제 데이터의 형식·표 일치·출처·기념품·먹 가능성·리믹스·수첩, 시험용 음성 사례(`tests/fixtures/negative/`)가 저마다 정해진 오류 코드로 실패하는지.
- `node tests/check-hyangga.mjs`, `check-goryeo`, `check-sijo`, `check-gasa`, `check-saseol`: 갈래별 노래 글의 세부(해독자, 감탄사, 후렴, 종장, 이어 붙인 대목, 반전 표시 등).
- `node tests/check-review-doc.mjs`: 이 폴더의 모든 글이 글 확인 문서에 있고 문서가 최신인지.
