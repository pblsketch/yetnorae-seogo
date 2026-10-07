# 지켜야 할 규칙

어기면 점검이 실패하거나, 화면이 깨지거나, 공개할 수 없게 되는 규칙만 적는다. 여기 적힌 것은 지금 실제로 지키고 있는 규칙이다.

## 1. 저장소와 커밋에 들어가면 안 되는 것

- **교과서 출판사 이름**(세 음절, 글자 번호 U+C9C0 U+D559 U+C0AC)은 저장소에 올라가는 어떤 파일의 이름과 내용, 커밋 글, 브랜치·태그 이름에도 쓰지 않는다. 점검 코드도 그 이름을 글자 그대로 쓰지 않고 `String.fromCodePoint(0xc9c0, 0xd559, 0xc0ac)`처럼 글자 번호로 만든다.
  - 위반 판정: `node tests/check-rights.mjs`가 추적 파일, 아직 추가하지 않은 파일(무시 목록 밖), 모든 커밋의 변경 내용과 커밋 글, 브랜치 이름을 NFC로 맞춰 찾는다. 하나라도 걸리면 실패다.
  - 출처 문구는 "고등학교 공통국어2 교과서 수록본", "고등학교 문학 교과서 수록본"처럼 쓴다.
- **교과서 파일(PDF)과 그 추출본**은 `design/` 아래에만 둔다. `design/`은 `.gitignore`에 있고, 점검용 서버도 그 경로를 내주지 않는다.
- **원본 자산**은 커밋하지 않는다: 그림 생성 원본(`assets/raw/art/`), 목소리 기준 음성 백업(`assets/raw/voice-ref/`), 낭송 캐시(`tools/voice_cache/`), 국악 원본 WAV(`tools/music_src/`), 원본 글꼴(`tools/fonts_src/`). 게임은 가공본만 쓴다.
- **Fish Audio API 키**는 어떤 파일, 커밋, 로그, 명령 출력에도 남기지 않는다(보관과 전달 방식은 아래 '환경 설정').
- `.gitignore`의 `design`, `.omc`, `.claude`, `tests/node_modules`, `tests/shots`, `assets/raw`, `tools/fonts_src`, `tools/music_src`, `tools/voice_cache`, `__pycache__`, `*.log` 줄을 지우지 않는다. 지우면 위의 것이 다음 `git add`에 섞인다.

## 2. 게임 코드에 넣으면 안 되는 것

- **바깥 주소 요청**: 글꼴, CDN, 분석 도구, 이미지 주소를 포함해 같은 사이트 밖으로 나가는 요청을 하나도 만들지 않는다. CSS의 `url(//…)`·`url(http…)`도 안 된다.
  - 위반 판정: `check-smoke`와 `check-playthrough`가 브라우저의 모든 요청을 모아 바깥 주소가 하나라도 있으면 실패한다. `check-fonts`는 CSS에서 바깥 `url()`을 찾는다. `check-boss`는 `js/boss/`·`js/data/remix.js`·`js/data/boss-text.js`·`css/boss.css`의 글에 `http://`·`https://`가 있으면(주석 안이라도, SVG 이름공간 주소만 빼고) 실패한다.
- **진행이나 장면을 바꾸는 주소 인자, 교사 기능, 숨은 미리보기 주소, 점검용 입구**를 만들지 않는다. 제품 코드는 `location.search`·`location.hash`·`URLSearchParams`를 읽지 않고, 점검을 위한 전역(`window.__…`)이나 흉내 함수를 두지 않는다.
  - 위반 판정: 점검마다 훑는 범위와 낱말이 다르다.
    - `check-engine`: 엔진 파일 `save.js`·`progress.js`·`judge.js`·`cards.js`·`contrast.js`에서 주석을 뺀 뒤 `location`·`URLSearchParams`·`document`·`window`·`localStorage`·`sessionStorage`·`navigator` 낱말을 찾는다. 진행 엔진의 공개 함수 이름에 `unlock`·`setState`·`setWing`·`skip`·`force`·`debug`·`cheat`가 있어도 실패한다.
    - `check-wingflow`: `js/play/*.js`의 글 전체(주석 포함)에서 `location.search`, `URLSearchParams`, `location.hash`, `__wf`·`__test`·`stub`을 찾는다.
    - `check-boss`: `js/boss/*.js`, `js/data/remix.js`, `js/data/boss-text.js`, `css/boss.css`의 글 전체(주석 포함)에서 같은 주소 인자 낱말과 `__b`·`__test`·`stub`, 바깥 주소를 찾는다.
    - `check-story`: `js/story/`의 **모든 파일**(확장자를 가리지 않음)과 `js/data/story.js`의 글 전체(주석 포함)에서 `location.search`·`location.hash`, `URLSearchParams`, `__test`, `window.__`를 찾는다.
- **점수, 등급, 순위, 랭킹, 타이머, 게임 오버, 정답률**과 그렇게 읽히는 말을 화면, 결과 카드, 데이터 글 어디에도 쓰지 않는다.
  - 위반 판정: 정적 검사마다 찾는 낱말이 다르다.
    - `check-wingflow`(`js/play/*.js`)와 `check-boss`(보스 파일): `/점수|등급|순위|타이머|게임 오버/`를 **주석까지** 찾는다. 주석에 "점수 없음"이라고 써도 실패한다.
    - `check-story`(`js/story/`의 모든 파일과 `js/data/story.js`): `/점수|등급|순위|랭킹|타이머|게임\s*오버|정답률|score|rank|grade/i`를 `//`로 시작하는 줄만 빼고 찾는다. 영어는 다른 낱말 안에 든 것(`upgrade`, `underscore`)도 걸린다.
    - `check-engine`: 엔진 소스의 낱말은 보지 않고, 카드 자료의 열쇠 이름(속까지)에서 `/score|grade|rank|point|percent|점수|등급|순위/i`를 찾는다.
    - 화면 글은 `check-story`, `check-boss`, `check-playthrough`, `check-card`가 화면과 카드에 그려진 글에서 찾는다.

## 3. 구조와 의존

- 빌드 없는 정적 웹 페이지다. 모든 스크립트는 ES 모듈이고, 번들러·트랜스파일러·패키지 관리자를 제품에 쓰지 않는다. 제품 코드가 기대는 바깥 코드는 `vendor/three/`의 Three.js 0.186.1 하나뿐이고, `index.html`의 import map(`"three": "./vendor/three/three.module.js"`)으로만 부른다.
- 폴더마다 맡는 일:
  - `js/core/` — 화면과 상관없는 엔진(저장, 진행, 판정, 박자, 소리, 사건 버스, 카드 자료, 노래 모양 도우미, 검증기). 저장소·시계·사건 내기·소리 판은 인자로 받는다. `save.js`·`progress.js`·`judge.js`·`cards.js`·`rhythm.js`·`song-shape.js`·`contrast.js`·`validate.js`는 Node에서 바로 import되어야 한다.
  - `js/world/` — 3D·2D 공간, 카메라, 조작, 화면 방향, 반반 틀, 방 무대. 관 모형은 `js/world/wings/<관 id>.js`. 다른 화면은 `js/world/world.js`만 부른다.
  - `js/measure/` 재기 화면, `js/play/` 관 한 판과 세션·수첩·일지·도감, `js/rooms/` 작품 방, `js/boss/` 보스전, `js/story/` 앱 흐름(시작 화면·입구·엔딩·설정), `js/result/` 결과 카드, `js/ui/` 출처 화면.
  - `js/data/` — 데이터만. 다른 `js/` 폴더를 import하지 않는다.
- `js/core/`는 `js/data/`와 자기 폴더만 import한다. `js/world/`, `js/play/` 같은 화면 폴더를 import하면 Node 점검(`check-engine`, `check-rhythm`, `check-data`)이 깨진다.
- 관 모형, 작품 방, 화면은 `js/registry.js`에 등록해야만 앱에 나타난다. 관 모형은 반드시 `normalizeWing(모듈)`으로 감싸 등록한다. 갈래별 노래 파일과 수첩 쪽은 `js/data/songs/index.js`에 등록한다.
- 모듈 사이 신호는 `js/core/events.js`의 `on`/`emit`으로만 주고받는다. 사건 이름은 `js/data/README.md`의 '사건' 절과 그 뒤 추가 절에 적힌 것만 쓰고, 새 이름을 쓰려면 그 문서에 먼저 더한다. 전역 변수를 만들지 않는다.
- 진행 엔진은 디오라마 사건(`diorama:*`)을 내지 않는다. 엔진이 내는 사건은 `wing:state`, `concept:changed`, `help:notebook-glow`, `help:journal-glow`, `save:failed`뿐이다. 디오라마 사건은 화면(한 판 흐름, 재기, 보스)이 낸다.
- 진행 상태는 진행 엔진의 공개 함수로만 바꾼다. 화면이 `progress` 객체의 값을 직접 고치지 않는다.

## 4. 데이터와 글

- 노래 데이터의 모양은 `js/data/README.md`가 유일한 기준이고, 검증기(`js/core/validate.js`)가 약속 밖의 필드를 막는다. 노래 id, 제목, 갈래, 발췌, 역할은 `js/data/song-table.js`와 정확히 같아야 한다(`check-data`의 `TABLE`).
- 노래마다 `citation`과 `verification`이 있어야 한다. `verification: 'verified'`는 두 경우에만 쓴다: 교과서 수록 노래의 글이 교과서 추출본과 글자 단위로 맞는 것을 대조 도구로 확인했을 때(어떻게 대조했는지 `citationNote`에 적는다), 또는 교사가 대조해 확인했다고 알려 주었을 때. 교과서 밖 노래는 교사 확인으로만 `verified`가 된다. 교과서 대목 뒤에 이어 붙인 단위(`beyondTextbook: true`)가 하나라도 있으면 그 노래는 `pending`이다.
- 교과서 밖 원문, 해독, 풀이는 기억으로 쓰지 않는다. 찾은 자료의 출처를 `citation`(화면에 보임)과 `citationNote`(제작 메모)에 적고 `pending`으로 둔다. 출처를 찾지 못하면 데이터에 넣지 않고 사용자에게 알린다.
- 교사가 확인할 글(대사, 설명, 해석 문장, 화면의 짧은 글)은 코드 안에 흩어 쓰지 않고 정해진 글 파일에 둔다: `js/data/`의 `story.js`·`boss-text.js`·`remix.js`·`concepts.js`·`wings.js`·`credits.js`·`rooms-*.js`·`notebook-*.js`, 그리고 `js/measure/labels.js`, `js/play/labels.js`, `js/result/card.js`의 `WORDS`·`SIJO_THINGS`. 새 글 파일을 만들면 `tools/text/review-doc.mjs`의 `SOURCES`와 `tests/check-review-doc.mjs`의 `TEXT_FILES` **두 곳**에 더한다.
- 글 파일이나 노래 데이터를 고친 뒤에는 `node tools/text/review-doc.mjs`로 `docs/글-확인-문서.md`를 다시 만든다. 다시 만들지 않으면 `check-review-doc`가 실패한다. 이 문서를 손으로 고치지 않는다.
- 게임 글에 새 글자가 생기면 `python tools/fonts/build_fonts.py`로 글꼴을 다시 만든다. 빠진 글자가 있으면 `check-fonts`가 실패한다.
- `js/data/rooms-*.js`의 해석 id(`interpretationId` 등)는 저장된 기록이 가리키므로 글을 고쳐도 id는 바꾸지 않는다.
- 자산 목록 조각(`assets/manifest.parts/*.json`)을 고치면 `node tools/manifest/build.mjs`로 `assets/manifest.json`을 다시 합친다. 항목마다 `path`, `kind`(`image`·`voice`·`bgm`·`sfx`·`font`·`other`), 비어 있지 않은 `source`와 `license`, `commercialUse: true`가 있어야 한다(`check-rights`). 상업적으로 쓸 수 없거나 사용권이 불분명한 그림·소리·글꼴은 넣지 않는다.

## 5. 화면과 스타일

- 화면 글은 모두 한국어다. 2D 누를 자리 이름표도 한국어여야 한다(`js/world/board2d.js`의 `ANCHOR_LABELS`에 없는 열쇠는 '자리'로 보이고, `check-wing-contract`가 영어 이름표를 잡는다).
- 스타일은 모듈마다 `css/<모듈>.css`에 두고 `index.html`에 링크한다. 색은 `css/base.css`의 토큰(`--hanji`, `--hanji-deep`, `--meok`, `--meok-soft`, `--meok-fog`, `--nokcheong`, `--juhong`, `--gold`)만 쓴다. 단청색(녹청·주홍)은 누를 수 있는 것에만 쓴다.
- 색 토큰을 바꾸면 `js/world/palette.js`의 `TOKENS`도 같은 값으로 바꾼다(`check-world`가 두 값을 맞춰 본다).
- 작품 방 스타일의 규칙은 모두 그 방만의 범위에 둔다: 방 뿌리 클래스 아래(`css/room-goryeo.css`는 `.room-goryeo …`, `css/room-gasa.css`는 `.rg-room …`)이거나, 그 방만 쓰는 머리글자의 클래스(「제망매가」 `rh-`, 「십 년을 경영하야」 `sj-`, 「님이 오마 하거늘」 `rs-`). 두 방이 같은 머리글자를 쓰거나 범위 밖에 규칙을 쓰면 다른 방에 번진다(다섯 방 CSS가 `index.html`에 함께 붙는다).
- 글자 크기는 `--text-scale`(1, 1.15, 1.3)을 따르고, 세 단계 모두에서 넘치지 않아야 한다(`check-ui`). 결과 카드는 예외로 픽셀 고정이다.
- 움직임 줄이기는 `#app`의 `reduce-motion` 클래스와 `settings:reduce-motion` 사건으로 알린다. 카메라 이동, 흔들림, 파티클을 쓰는 코드는 이 상태를 읽어 줄인다.
- 누를 수 있는 것은 48px 이상이다. 화면은 16:9 안전 상자 기준이고, 높이는 `100dvh`, 노치는 `env(safe-area-inset-*)`로 피한다. 2D 그림 판의 오른쪽 아래 구석(가로 78% 너머이면서 세로 78% 너머)에는 상황 버튼이 있으므로 누를 것을 두지 않는다.
- 성능 상한: 관 하나의 그리기 호출 60회 이하, 픽셀 비율 1.5 이하, 실시간 그림자와 후처리 없음(`check-world`, `check-wing-*`가 잰다).

## 6. 점검(완료 조건)

- 완료와 공개의 조건은 `node tests/run-all.mjs`가 0으로 끝나는 것이다. `run-all`은 명시한 목록을 차례로 돌리고 첫 실패에서 멈춘다. 선택 실행이나 건너뛰기 인자는 받지 않는다(`ONLY` 환경 변수나 인자가 있으면 실패로 끝난다).
- 점검 파일은 `tests/check-<이름>.mjs`이고 혼자 `node tests/check-<이름>.mjs`로 돌 수 있어야 하며, 실패하면 0이 아닌 값으로 끝난다. 새 점검은 `tests/run-all.mjs`의 `files` 목록에 넣어야 전체 점검에 든다.
- 점검마다 실제 실패를 잡는지 보는 음성 사례를 함께 둔다.
- 점검을 흉내 내 통과시키지 않는다. 진짜 결함이면 제품을 고친다. 점검을 위해 제품 코드에 입구를 만들지 않는다.
- 상태 주입은 점검 도구가 페이지를 열기 전에 로컬 저장소에 기록을 넣는 방식(`tests/lib/browser.mjs`의 `seed`)만 쓴다. 넣는 기록은 관 순서와 표시(`shelfBound`·`basketDone`·`roomDone`)가 서로 맞아야 한다.
- 상태를 넣지 않는 완주 점검(`check-playthrough`)이 세 화면(844×390 3D 빗금, 1366×768 3D 박자 두드리기, 1180×820 강제 2D)에서 모두 통과해야 한다.

## 7. 커밋, 브랜치, 사람 확인

- 작업은 `master`에서 한다. 이 저장소의 git 사용자는 저장소 설정(`pblsketch`)을 쓴다.
- 커밋 글은 한국어로 `유형: 설명`(유형은 `feat`·`fix`·`test`·`docs`·`chore`·`merge`) 꼴로 쓰고, 끝 줄에 `Co-Authored-By:` 줄을 둔다. 커밋 글에도 출판사 이름은 없다.
- 커밋 앞에 `node tests/check-rights.mjs`가 0으로 끝나야 한다. 출판사 이름이 한 번 커밋되면 이력을 다시 써야 하므로, 발견하면 더 커밋하지 않고 사용자에게 알린다.
- 다음은 할 때마다 사용자에게 먼저 묻는다: 프로그램·패키지 설치(npm, Playwright, 파이썬 패키지, ffmpeg), 바깥 파일 내려받기(국악 음원, 글꼴 원본 등), GitHub 저장소 만들기·올리기(push)·Pages 켜기, 유료 서비스 사용과 지출.
- 그림 화풍과 낭송 목소리는 사용자 승인 뒤에만 대량으로 만든다. 승인할 때마다 날짜, 결정, 덧붙인 지시, 샘플 원본의 해시를 저장소의 승인 기록 파일에 남긴다(원본은 저장소 밖이므로 그 기록이 승인의 근거다). 지금 승인된 것: 화풍(2026-10-05, 한지 종이 인형·가는 먹선·단청색은 조금·그림 안 글자 없음), 낭송 목소리(2026-10-06, `narrator-a2` 여성 화자 13편, `narrator-b2` 나머지).
- git worktree를 쓸 때 `git worktree remove`에 `--force`를 쓰지 않는다. worktree의 `tests/node_modules`가 다른 폴더를 가리키는 연결(Windows junction)이면 먼저 그 연결을 지운다: 그 worktree의 `tests/` 안에서 `cmd //c rmdir node_modules`를 하고 `ls node_modules`로 사라졌는지 확인한 뒤 `git worktree remove <경로>`를 부른다.

## 8. 이름 짓기

- 노래 id: 영문 소문자·숫자·하이픈(`dongjitdal`, `chan-giparangga`). 노래 id 목록은 `js/data/song-table.js`의 `SONG_CATALOG`에 있는 것만 쓴다.
- 판을 하는 관 id는 갈래 id와 같다(`hyangga`·`goryeo`·`sijo`·`gasa`·`saseol`). 입구는 `entrance`, 보스 자리는 `boss`(노래의 `roles`에서만).
- 낭송 조각: `assets/audio/voice/<노래 id>/<구>.mp3`(향가), `<연>-<줄>-<음보>.mp3`(고려가요), `<단위>-<음보>.mp3`(나머지). 번호는 0부터.
- 그림: `assets/img/sprite/…`, `texture/<관 id>`, `board/<장면>`, `keepsake/<노래 id>`, `card/<이름>`, 확장자 `webp`.
- 배경음 `assets/audio/bgm/<관 id 또는 장면>.mp3`, 효과음 `assets/audio/sfx/<janggu|bell|place|bind|gold|basket|fog>.mp3`.
- 화면 등록 이름: `start`, `play`, `notebook`, `journal`, `collection`, `boss`, `credits`.

## 9. 환경 설정

- Fish Audio 키는 `%LOCALAPPDATA%/yetnorae/fish.key` 한 곳에만 두고, 쓸 때마다 명령 앞에서 환경 변수로 넘긴다: `YETNORAE_FISH_API_KEY="$(cat "$LOCALAPPDATA/yetnorae/fish.key")" <명령>`. 키를 `echo`하거나 파일로 복사하거나 셸 설정에 영구로 넣지 않는다.
- 낭송 도구는 `--max-usd`(기본 3 USD) 안에서만 돈을 쓴다. 이 한도를 올리려면 사용자에게 먼저 묻는다.
- 점검의 개발용 스위치(`PLAYTHROUGH_SETUP`, `PT_DEBUG`, `MEASURE_ONLY`, `VOICE_OPTIONAL`)는 점검 하나를 손볼 때만 쓴다. 이 값을 켠 채 얻은 통과는 완료 근거가 아니다.
