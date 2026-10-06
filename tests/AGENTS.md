# tests — 자동 점검 묶음

## 맡는 것
- `run-all.mjs`: 전체 점검. `files`에 적은 37개를 차례로 띄우고 첫 실패에서 멈춘다. 출력 원본은 `shots/run-all-<시각>.log`, 끝 줄은 `N/37 passed`. 선택 실행(`ONLY`)이나 인자를 주면 실패로 끝난다.
- `check-<이름>.mjs`: 점검 하나. 혼자 `node tests/check-<이름>.mjs`로 돌고, 실패하면 0이 아닌 값으로 끝난다.
- `lib/server.mjs`(127.0.0.1 임의 포트 정적 서버, 요청 경로 기록, `design/`·`.git/` 등은 403), `lib/browser.mjs`(`openGame`: 설치된 Chrome, 3D는 SwiftShader, `disable3d`면 WebGL을 끈 브라우저, `seed`로 페이지 열기 전 로컬 저장소에 기록 넣기, 바깥 요청과 콘솔 오류 모으기, 화면 크기 `VIEWPORTS` phone 844×390 · chromebook 1366×768 · tablet 1180×820), `lib/woff2.mjs`(글꼴 파일의 cmap·GSUB·name 읽기).
- `pages/*.html`, `pages/*-page.js`: 모듈 하나를 따로 띄우는 점검 페이지. 페이지 안에서만 쓰는 전역(`window.__t` 등)과 가짜 소리 판·빠른 시계를 둔다.
- `fixtures/valid-set.mjs`(지어낸 글자로 만든 올바른 노래 묶음), `fixtures/negative/*.mjs`(검증기가 정해진 오류 코드로 실패해야 하는 음성 사례 하나씩).
- `package.json`·`package-lock.json`: Playwright 1.63.0 하나. `node_modules`는 이 폴더의 설치이고 커밋하지 않는다.

## 맡지 않는 것
- 제품 코드의 입구. 점검을 위해 제품에 주소 인자, 전역 변수, 흉내 함수, 2D 강제 스위치를 만들지 않는다. 점검 페이지의 전역은 `tests/pages/` 안에만 있다.
- 교과서 대조. `tools/text/compare-textbook.mjs`는 추출본이 있는 기기에서만 손으로 돌리고 `run-all`에 넣지 않는다(`check-compare-textbook`은 그 도구를 시험용 추출본으로 시험할 뿐이다).

## 불변식
- `check-smoke`를 뺀 모든 점검에 실제 실패를 잡는지 보는 음성 사례가 있다(가짜 위반을 만들어 검사기가 잡는지 확인). 새 점검에도 둔다.
- 점검을 흉내 내 통과시키지 않는다. 기대값을 제품에 맞춰 낮추지 않는다. 진짜 결함이면 제품을 고친다.
- 출판사 이름은 점검 코드에도 글자 그대로 쓰지 않고 `String.fromCodePoint(0xc9c0, 0xd559, 0xc0ac)`로 만든다.
- 상태 주입은 `openGame(url, { seed })`로 페이지가 열리기 **전에** 로컬 저장소에 넣는 방식만 쓴다(한 세션에 한 번, `sessionStorage` 표시로 다시 넣지 않음). 넣는 기록은 관 순서와 표시(`shelfBound`·`basketDone`·`roomDone`, 낯선 노래의 `done`)가 서로 맞아야 한다. 저장 엔진이 불러올 때 상태를 다시 계산하기 때문이다.
- `check-playthrough`는 상태를 넣지 않는다. 새 기록에서 실제 입력(마우스, 손가락 탭, 글자 입력)만으로 시작 화면부터 마지막 카드까지 간다. 세 화면: 844×390 3D 빗금(탭), 1366×768 3D 박자 두드리기(마우스, 실제 박자 맞추기 포함), 1180×820 강제 2D(탭, 소리 끔). 박자 방식은 점검 도구가 소리 판에 예약되는 소리의 시각을 엿들어('귀') 친다. 게임 상태는 바꾸지 않는다. 노래가 어느 갈래인지는 노래 데이터로 판단한다(학생이 감정서와 수첩으로 하는 판단을 대신함).
- `openGame`이 모으는 바깥 요청과 콘솔 오류는 화면 점검마다 0이어야 한다. 실패한 요청(404 포함)을 따로 모아 실패로 보는 것은 `check-playthrough`이고(낭송 목록에 없는 낭송 조각 요청도 실패), `check-room-hyangga`와 `check-rooms-in-flow`도 404를 센다. 다른 화면 점검은 404를 콘솔 오류로만 잡는다.
- 제품 소스 정적 검사는 점검마다 정규식이 다르다.
  - `check-engine`: 엔진 파일 넷에서 주석을 뺀 뒤 브라우저 전역 낱말(`location`, `document`, `window`, `localStorage` 등)만 찾는다. 매기는 말은 소스가 아니라 카드 자료의 열쇠 이름에서 `/score|grade|rank|point|percent|점수|등급|순위/i`로 찾는다.
  - `check-wingflow`(`js/play/*.js`)와 `check-boss`(`js/boss/*.js`, `js/data/remix.js`, `js/data/boss-text.js`, `css/boss.css`): 글 전체(주석 포함)에서 주소 인자 낱말, 점검용 낱말(`__wf`·`__b`·`__test`·`stub`), `/점수|등급|순위|타이머|게임 오버/`를 찾는다. 보스는 `http` 주소도 찾는다.
  - `check-story`(`js/story/`의 **모든 파일**과 `js/data/story.js`): 주소 인자·점검용 전역(`location.search|hash`, `URLSearchParams`, `__test`, `window.__`)은 글 전체(주석 포함)에서, 매기는 말 `/점수|등급|순위|랭킹|타이머|게임\s*오버|정답률|score|rank|grade/i`는 `//`로 시작하는 줄만 빼고 찾는다.

## 구현 방식
- Playwright `page.waitForFunction`의 판별 함수는 동기로 쓴다. async 함수는 약속이 돌아오는 순간 참으로 보고 끝나서 점검이 가끔만 실패한다.
- 3D 점검은 GPU 없이 SwiftShader로 돌고, 그리기 호출 수는 세계의 `getStats()`로 잰다.
- 소리가 있는 점검 페이지는 가짜 소리 판(`createContext`)과 빠른 박자 칸을 끼워 실제 시간을 줄인다. 완주 점검만 실제 시간으로 듣는다(크롬북 약 42분).
- 완주 점검은 끝없이 기다리지 않는다. `check-playthrough.mjs`의 `LIMITS`: 지금 음보가 바뀌지 않는 4초 차례 10번, 두드리기 한 편 15분, 보스 2단계 15분, 재기 한 번 25분, 재기 화면에 누를 것이 없는 상태 90초, 페이지 함수의 답 30초, 한 화면에서 확인 줄이 나오지 않는 시간 20분(감시견, 브라우저를 닫아 실패로 끝낸다). 걸리면 재기 단계·지금 음보·소리 판 상태·최근 탭 시각과 맞은 요소·창과 초점 상태·최근 기록을 찍고 `shots/playthrough-<화면>-stall-<시각>.png`를 남긴다. 최근 기록은 `PT_DEBUG` 없이도 모아 두었다가 이때 보인다.
- 박자 방식 도우미는 마우스를 장구 위에 두고 누르기만 한다. 다른 단추(듣기, 빗금 권유의 '계속 두드리기')를 누른 뒤에는 반드시 장구로 되돌린다. 탭마다 귀의 기록으로 장구에 떨어졌는지 확인하고, 아니면 곧바로 실패한다. 단추를 누르면 마우스가 그 단추로 옮겨 가고 되돌리지 않으면 뒤의 탭이 모두 글에 떨어져 같은 단위를 끝없이 다시 듣는다.
- 새 점검을 만들면 `run-all.mjs`의 `files`에 넣는다. 넣지 않으면 전체 점검에 들지 않는다. 지금 목록은 첫 화면 점검(`check-smoke`)으로 시작하고, 가장 오래 걸리는 화면 점검과 완주 점검(`check-ui`, `check-playthrough`)이 맨 뒤다.
- 스크린숏과 로그는 `shots/`(커밋하지 않음)에 쓴다.
- 개발용 스위치: `PLAYTHROUGH_SETUP=phone|chromebook|tablet`, `PT_DEBUG=1`, `MEASURE_ONLY=phone`, `VOICE_OPTIONAL=1`. 이것을 켜고 얻은 통과는 완료 근거가 아니다.
- ffmpeg·ffprobe가 필요한 점검: `check-bgm`(없으면 실패). `check-voice`는 MP3 프레임 머리를 직접 읽어 ffmpeg 없이도 돈다.

## 점검을 돌릴 때
- 처음 한 번 `cd tests && npm ci`(사용자 승인 뒤). 브라우저 내려받기는 필요 없다(설치된 Chrome).
- 전체 점검은 약 75분 걸린다. 다른 전체 점검이나 Playwright 점검과 동시에 돌리지 않는다(박자 판정이 흔들린다).
- 이 저장소를 git worktree로 나눠 쓸 때 worktree의 `node_modules`가 junction이면, worktree를 지우기 전에 그 `tests/` 안에서 `cmd //c rmdir node_modules`로 junction을 먼저 지우고 사라졌는지 확인한다. `git worktree remove`에 `--force`를 쓰지 않는다(강제 지우기가 junction을 따라가 다른 저장소의 `node_modules` 내용을 지운 일이 있다).
