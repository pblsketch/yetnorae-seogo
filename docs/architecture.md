# 시스템 구성

## 경계: 무엇이 안으로 들어오고 무엇이 나가지 않는가

**실행할 때.** 게임은 한 사이트에서 내놓는 정적 파일 묶음(`index.html`, `manifest.webmanifest`, `css/`, `js/`, `assets/`, `vendor/three/`)이고, 모든 계산은 학생 브라우저 안에서 한다. 서버 쪽 코드, 계정, 바깥 API가 없다.

- 경계를 넘어 **들어오는 것**: 같은 사이트의 정적 파일 GET 요청뿐이다. ES 모듈과 CSS, `assets/manifest.json`(자산 목록. 세션이 한 번, 출처 화면이 열릴 때 따로 한 번 읽는다), 그림(`webp`), 낭송·배경음·효과음(`mp3`), 부분 글꼴(`woff2`).
- 경계를 넘어 **나가는 것**: 없다. 학생 기록은 그 브라우저의 로컬 저장소 열쇠 `yetnorae-seogo-v1` 하나에만 있고, 결과 카드 PNG는 브라우저 내려받기로 학생 기기에 떨어진다. 분석 도구, CDN, 바깥 글꼴이 없다.
- `file://`로 열면 브라우저가 모듈과 자산 읽기를 막으므로, 언제나 정적 서버(로컬이면 `python -m http.server`)로 연다.

**만들 때.** 저장소 밖의 서비스와 파일이 자산을 만든다. 이 의존은 실행 경계를 넘지 않는다. 만들어진 가공본과 출처 기록만 커밋된다.

| 바깥 의존 | 쓰는 도구 | 저장소에 남는 것 | 남지 않는 것 |
| --- | --- | --- | --- |
| Fish Audio 유료 API(모델 s2.1-pro, 목소리 설계, 받아쓰기) | `tools/voice/build_voice.py` | `assets/audio/voice/**/*.mp3`, 생성 기록 `assets/audio/voice/manifest.json`, 노래 데이터의 `tempo` | API 키, 응답 원본(`tools/voice_cache/`), 기준 음성 백업(`assets/raw/voice-ref/`) |
| Codex CLI 내장 이미지 생성 | `tools/art/gen.ps1` 외 | `assets/img/**/*.webp`, 프롬프트 `tools/art/prompts/` | 생성 원본 PNG(`assets/raw/art/`) |
| 국립국악원 「국악기 디지털 음원」(공공누리 제1유형) | `tools/bgm/` | `assets/audio/bgm/`, `assets/audio/sfx/`, `assets/audio/CREDITS.md` | 원본 WAV(`tools/music_src/`) |
| Noto Serif KR 가변 글꼴(SIL OFL 1.1, 시리즈 형제 저장소에서 복사) | `tools/fonts/build_fonts.py` | `assets/fonts/yetnorae-text-{400,700}.woff2`, `OFL.txt`, `coverage.json` | 원본 TTF(`tools/fonts_src/`) |
| 교과서 PDF와 추출본 | `tools/text/compare-textbook.mjs`(손으로 돌림) | 노래 데이터의 원문·풀이(교과서 그대로) | PDF, 추출본(`design/source/`) |

**점검할 때.** Node가 `tests/check-*.mjs`를 하나씩 띄운다. 화면 점검은 `tests/lib/server.mjs`가 127.0.0.1 임의 포트에서 저장소 맨 위를 내놓고, `tests/lib/browser.mjs`가 Playwright로 **설치된 Chrome**(`channel: 'chrome'`)을 연다. 3D는 SwiftShader로 그리고, 2D 점검은 WebGL을 끈 브라우저로 연다.

## 구성 요소와 의존 방향

화살표는 import 방향이다(왼쪽이 오른쪽에 기댄다). 거꾸로 가는 import는 없다.

| 구성 | 맡는 일 | 기대는 쪽 |
| --- | --- | --- |
| `index.html` → `js/main.js` | import map으로 `three`를 `vendor/three/`에 묶고, 등록된 `start` 화면을 연다 | `js/registry.js` |
| `js/registry.js` | 관 모형 다섯(`normalizeWing`으로 감쌈), 작품 방 다섯, 화면(`start`·`play`·`notebook`·`journal`·`collection`·`boss`·`credits`)을 모으는 단일 등록 지점 | world/wings, rooms, play, boss, story, ui |
| `js/story/` | 앱 흐름: 시작 화면(이름 기록) → 처음 켜는 기기의 이어폰 안내·박자 맞추기 → 입구 튜토리얼 → 회랑과 관 → 보스 문 → 보스 → 엔딩 → 서고 완성. 설정 화면 | play/session, core(save·audio·cards), result, registry, data/story |
| `js/play/` | 앱 하나에 하나뿐인 **세션**(저장 엔진·진행 엔진·소리 엔진·세계 바탕 하나씩)과 관 한 판 흐름, 수첩·일지·도감 화면, 가객·기념품 연출 | core, world, measure, result, registry(방), data |
| `js/measure/` | 형식 분석 화면(코드 이름 재기): ① 연·장·행·구 나누기(접기) → ② 음보 나누기(두드리기 또는 빗금) → ③ 고유 동작 → 분석표(감정서) → ④ 갈래 판별(관·입구, 맞고 틀림은 부르는 쪽이 정함) | core(rhythm·song-shape·events), data. 세계 바탕은 인자로 받음 |
| `js/rooms/` | 작품 방 다섯. `start(ctx)` → `{ completed, record }` | core(events), world/assets, data(rooms-*). 소리 엔진은 인자로 받음 |
| `js/boss/` | 보스전 세 단계 | measure, core(rhythm), data(remix·boss-text). 진행 엔진·소리 엔진은 세션으로 받음 |
| `js/result/` | 결과 카드 PNG 그리기와 내려받기 | core/cards의 자료, world(palette·sprites·assets) |
| `js/ui/credits.js` | 출처 화면. 목록을 노래 데이터와 자산 목록에서 그때그때 만든다 | data(songs·credits), `assets/manifest.json` |
| `js/world/` | 세계 바탕 `world.js`(바깥 손잡이): 3D 장면(`scene3d.js`) 또는 2D 그림 판(`board2d.js`), 조작, 화면 방향 멈춤, 움직임 줄이기, 반반 틀, 방 무대. 관 모형 `wings/` | three, core/events, data/wings, registry(관 모형) |
| `js/core/` | 화면 없는 엔진: 저장(`save`), 진행(`progress`), 판정 규칙(`judge`), 박자(`rhythm`), 소리(`audio`), 사건 버스(`events`), 카드 자료(`cards`), 노래 모양(`song-shape`), 맞대어 보기 규칙(`contrast`), 검증기(`validate`) | data만 |
| `js/data/` | 노래 45편, 노래 표, 관·갈래·개념, 수첩·이야기·방·보스·출처 글 | 없음(데이터끼리만) |

`js/core/events.js`의 사건 버스는 모든 화면 모듈이 함께 쓰는 단 하나의 신호 통로다. 진행 엔진은 진행 사건(`wing:state`, `concept:changed`, `help:*`, `save:failed`)만 내고, 디오라마 반응 사건(`diorama:*`)은 화면이 낸다. 세계 바탕이 `diorama:*`를 받아 지금 관 모형의 `react`로 넘긴다. 관 모형은 사건 버스를 직접 듣지 않고 진행 기록도 읽지 않는다.

## 3D와 2D 두 갈래

창이 열릴 때 `js/world/mode.js`가 WebGL2를 한 번 확인한다(Three.js 0.186은 WebGL2만 쓴다). 있으면 3D, 없거나 3D 그림판을 만들다 실패하면 그 창이 끝날 때까지 2D다. 쓰는 도중 그림판을 잃고(GPU 재시작 등) 3초 안에 되찾지 못해도 그 창은 2D로 가고, 세계는 지금 자리에서 2D 그림 판으로 바뀌며 판 중인 관에 다시 들어간다(`js/world/webgl.js`, `world.js` '그림판 잃음'). 저장하지 않으므로 다음 창은 다시 확인한다. 두 갈래는 같은 약속을 쓴다.

- 관 모형: 모듈마다 `create3D(ctx)`와 `create2D(ctx)`가 같은 모양의 손잡이(`anchors`, `floatingSpots`, `measureFocus`, `react`, `update`, `dispose`)를 돌려준다.
- 작품 방: `ctx.mode`가 `'3d'`면 세계가 `openRoom(el)`으로 빈 무대(`{ THREE, root, camera }`)를 빌려주고 그 칸에만 그린다. `'2d'`면 방이 자기 그림 판을 그린다. 「십 년을 경영하야」 방은 3D에서도 자기 그림판을 따로 만든다.
- 보스: 3D는 보스 화면 안의 작은 그림판, 2D는 `board/boss` 그림 위 DOM 겹.
- 규칙, 진행, 저장, 카드는 두 갈래가 같은 엔진을 쓰므로 다르지 않다.

## 대표 흐름 1: 학생이 시조관 칸의 셋째 자리에 노래를 꽂는다

0. **갈래 판별**(교사 결정 2026-10-08): 그 노래는 먼저 형식 분석의 ④에서 시조로 판별되어 손에 있다(`progress.decideGenre('sijo', songId, 'sijo')` → `measured`). 다른 갈래로 판별한 노래는 행선지와 함께 바구니에 저절로 담기므로 칸에 꽂을 수 없다(엔진이 `other-genre`·`not-decided`로 막는다).
1. **조작**: `world/controls.js`가 탭을 받아 학생을 걷게 하고, 멈추면 `onArrive({ anchor: { key: 'slots', index: 2 } })`를 부른다. `play/wing.js`가 오른쪽 아래 상황 버튼을 '꽂기'로 바꾼다.
2. **꽂기**: '꽂기'를 누르면 `wing.js`가 진행 엔진 `progress.place('sijo', 'shelf', 2, songId)`를 부른다. 엔진은 자리를 바꾸고 `save()`를 부르며, 이것은 저장 엔진 `touchRecord` → `localStorage.setItem('yetnorae-seogo-v1', 문서 전체 JSON)`으로 이어진다. 화면은 `diorama:slot-set`을 내고, 세계가 시조관 모형의 `react`로 넘겨 빈 책등 자리에 책을 세운다.
3. **판정**: 세 자리가 다 찼으므로 `wing.js`가 `progress.judge('sijo', 'shelf')`를 부른다. 엔진은 `judge.js`의 `judgeArea`로 자리마다 맞는지 보고, 맞은 자리를 고정하고 틀린 자리를 비우며 관 오답 수를 늘린다(3 이상이면 `help:notebook-glow`). 판별한 노래만 꽂히므로 시조관 칸은 언제나 맞고, 틀린 자리는 향가관 탑의 층에서만 생긴다. 모두 맞으면 `shelfBound`, 세 노래의 개념 확인(`concept:changed`), 기념품 지급을 하고 저장한다.
4. **연출**: 돌아온 노래마다 화면이 `diorama:pop-out { genre }`을 내 갈래 모양대로 삐져나오게 하고, 묶였으면 `diorama:shelf-bound`·`diorama:fog-recede` 뒤에 가객 연출(`play/ceremony.js`, 낭송 한 소절)과 기념품 카드를 띄운다. 작품 방 문이 열린다.
5. **판의 끝**: 방을 마치면 `progress.completeRoom` → 칸·바구니·방 표시가 다 있으므로 관이 `done`, 다음 관이 `open`(`wing:state`), 다섯 관을 다 마쳤으면 보스가 `stage1`. 화면은 `diorama:dancheong-restore` → 판 카드(`core/cards.buildWingCard` → `result/card.js`가 1600×900 캔버스에 그림) → 다음 관 배경음을 잠깐 틀어 문틈 소리를 낸 뒤 덤 노래를 띄운다.

## 대표 흐름 2: 낭송의 쉼에 두드리기

1. 재기 화면이 `rhythm.buildPauseGrid(song)`으로 쉼 칸을 만든다. 음보(향가는 구)마다 낭송 조각 경로(`assets/audio/voice/<노래>/<단위>-<음보>.mp3`)와 그 뒤의 쉼(1초, 고려가요 여음·후렴은 0)이 붙는다. 노래 빠르기(`tempo`)는 쓰지 않는다.
2. 소리 엔진(`core/audio.js`, Web Audio)이 '준비' 딱 소리 1초 뒤부터 조각을 제 길이대로 이어 예약하고(조각 끝 → 쉼 → 다음 조각), 단위의 시각은 그 단위 조각을 불러왔을 때 정한다(`pauseSegmentTiming`). 낭송 동안 배경음을 0.3배로 줄인다. 조각 파일이 없으면 `audio:missing`을 한 번 내고 그 자리에 딸깍 소리를 낸 뒤 쉼을 둔다.
3. 탭은 `createPauseTapSession`이 판정한다. 기기의 박자 보정값을 뺀 탭 시각이 그 음보의 [조각 끝 −150ms, 쉼 끝 +150ms] 안이면 인정하고, 인정한 음보 뒤에 빗금을 긋고 `diorama:pillar-light`를 낸다. 낭송 중(창 밖)의 탭은 안내만 한다. 단위가 끝나면 쉼을 놓친 단위만 다시 듣게 한다.
   (다시 듣기·작품 방·보스는 `rhythm.buildGrid`의 일정한 박자 칸(박 하나 `60 / tempo`초)으로 이어 읽는다. 보스 2단계 갈래 바뀜 탭은 `createRemixSession`이 판정한다.)
4. 세로로 돌리면 `screen.js`가 `orientation:pause`·`audio:pause`를 내고, 소리 엔진이 모든 재생과 판정을 멈춘다. 가로로 돌아오면 진행 중이던 단위를 처음부터 다시 낸다.
5. 소리를 끄거나 빗금 모드면 소리 엔진이 `rhythm:no-beat`를 내고, 재기·방·보스가 박자 없는 방식(빗금, 누를 때마다 한 걸음 등)으로 바뀐다.

## 제작 흐름: 데이터에서 배포 파일까지

```
js/data/songs/*.js ──┬─> tools/voice/plan.mjs ─> build_voice.py ─> assets/audio/voice/**, voice/manifest.json, manifest.parts/voice.json, 노래의 tempo
                     ├─> tools/art/catalog.py ─> genqueue.py(gen.ps1) ─> process.py ─> assets/img/**, manifest.parts/art.json
                     ├─> tools/fonts/build_fonts.py ─> assets/fonts/*.woff2, manifest.parts/font.json
                     └─> tools/text/review-doc.mjs (+ review-shots.mjs) ─> docs/글-확인-문서.md, docs/images/
tools/bgm/fetch.py ─> build_bgm.py · build_sfx.py ─> write_docs.py ─> assets/audio/{bgm,sfx}, CREDITS.md, manifest.parts/audio.json
assets/manifest.parts/*.json ─> tools/manifest/build.mjs ─> assets/manifest.json ─> (실행 시) 세션·출처 화면이 한 번 읽음
```

`plan.mjs`는 게임 엔진의 `voiceClips`·`buildGrid`를 그대로 불러 조각 이름과 박자 칸을 만들므로, 낭송 조각과 게임의 박자 칸은 같은 계산에서 나온다. 게임은 낭송 생성 기록(`assets/audio/voice/manifest.json`)을 읽지 않는다. 그 파일은 점검(`check-voice`)과 글 확인 문서가 읽는다.
