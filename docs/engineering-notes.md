# 작업하며 알게 된 것

각 항목은 **증상 → 까닭 → 대응**이다. 대응 끝의 '확인'으로 고쳐졌는지 본다.

## 점검과 도구

### git worktree를 지우다 다른 프로젝트의 `tests/node_modules`가 사라졌다
- 증상: 병렬 작업용 worktree를 `git worktree remove --force`로 지웠더니, 이웃 시리즈 프로젝트의 `tests/node_modules` 내용이 통째로 지워졌다.
- 까닭: worktree의 `tests/node_modules`를 새로 설치하지 않고 다른 저장소의 것으로 Windows junction을 걸어 두었는데, 강제 지우기가 junction을 따라 들어가 그 안의 파일을 지웠다.
- 대응: worktree를 지우기 전에 그 worktree의 `tests/` 안에서 `cmd //c rmdir node_modules`로 junction만 지운다(`rmdir`은 junction 자체만 지우고 대상은 건드리지 않는다). 그다음 `git worktree remove <경로>`를 `--force` 없이 부른다. 지워지지 않으면 남은 파일을 확인하고 손으로 정리한다.
- 확인: junction을 지운 뒤 `ls tests/node_modules`가 '없음'을 내는지, 원래 저장소의 `tests/node_modules/playwright/package.json`이 그대로 있는지 본다.

### 전체 점검이 한 시간을 넘긴다
- 증상: `node tests/run-all.mjs`가 약 75분 걸린다. 그 가운데 크롬북 박자 두드리기 완주만 약 42분이다.
- 까닭: 박자 방식 완주는 실제 낭송을 실제 시간으로 듣고 친다. 37개 점검을 차례로 돌리고 첫 실패에서 멈춘다.
- 대응: 개발 중에는 고친 곳의 점검만 혼자 돌린다(`node tests/check-<이름>.mjs`). 완주 점검 하나만 보려면 `PLAYTHROUGH_SETUP=phone|chromebook|tablet`, 박마다 기록을 보려면 `PT_DEBUG=1`. 이 스위치로 얻은 통과는 완료 근거가 아니다. 전체 점검을 두 개 동시에 돌리지 않는다(같은 기기의 Chrome·CPU를 나눠 쓰면 박자 판정이 흔들린다). 전체 점검이 도는 동안 다른 Playwright 점검도 돌리지 않는다.
- 확인: 결과는 `tests/shots/run-all-<시각>.log` 끝의 `N/37 passed` 줄.

### 크롬북 박자 완주가 아무것도 찍지 않고 멈췄다
- 증상: 전체 점검 끝의 `check-playthrough` 크롬북 화면이 고려가요관에서 「서경별곡」 감정서를 찍은 뒤 55분 넘게 아무것도 찍지 않았다. 혼자 돌리면 통과했다.
- 까닭: 점검 도구 잘못이었다. 박자 방식 도우미는 마우스를 장구 위에 한 번 올려 두고 박마다 누르기만 한다. 부하가 걸려 박을 몇 번 놓치면(놓친 박 3개) 게임이 빗금을 권하고, 도우미는 '계속 두드리기'를 `locator.click`으로 누른다. 이때 마우스가 그 단추(두루마리 글 위)로 옮겨 가는데 도우미는 장구로 되돌아가지 않았다. 그 뒤의 탭이 모두 글(`m-text`)에 떨어져 같은 단위를 끝없이 다시 들었다. 낭송, 소리 판(`running`), 밝힘, 탭 시각(박에서 7~23ms)은 모두 정상이었다. 학생은 권유를 닫은 뒤 스스로 장구를 다시 누르므로 게임 결함이 아니다. 한 박을 4초씩 기다리는 루프가 2만 번까지 돌 수 있어서 멈춤이 실패로 드러나지 않았다.
- 대응: 장구가 아닌 단추를 누른 뒤에는 장구 자리를 다시 재고 마우스를 옮긴다. 박을 기다리는 페이지 함수가 장구 자리를 함께 돌려주어, 자리가 바뀌었으면 치기 전에 옮긴다. 탭마다 귀의 기록으로 장구에 떨어졌는지 보고 아니면 곧바로 실패한다. 끝없는 기다림에는 모두 상한을 두었다(`LIMITS`). 멈추면 재기 단계, 지금 음보, 소리 판 상태, 최근 탭 시각과 맞은 요소, 창·초점 상태, 최근 기록을 찍고 `tests/shots/playthrough-<화면>-stall-<시각>.png`를 남긴다.
- 확인: CPU를 가득 채운 채(`node` 스레드 16개) `PLAYTHROUGH_SETUP=chromebook PT_DEBUG=1`로 돌려 빗금 권유가 나와도 끝까지 가는지 본다. 끝 줄의 '다시 들은 음보', '±150ms 밖 탭'으로 놓친 박을 본다.

### `waitForFunction`이 조건이 거짓인데도 끝났다
- 증상: `check-world`의 탭 표시 점검이 가끔만 실패했다.
- 까닭: Playwright `page.waitForFunction`에 async 판별 함수를 주면 약속(Promise)이 돌아오는 순간 참으로 보고 값을 보지 않고 끝난다.
- 대응: 판별 함수는 동기로 쓴다. 프레임 사이 비교가 필요하면 페이지 안 변수에 앞 값을 두고 동기 함수에서 비교한다.
- 확인: 같은 점검을 여러 번 돌려 흔들리지 않는지 본다.

### `js/story/`에 아무 파일이나 두면 `check-story`가 실패한다
- 증상: `js/story/`에 메모나 문서 파일을 더했더니 `check-story`의 정적 검사가 실패했다.
- 까닭: 그 검사는 `js/story/`의 **모든 파일**(확장자를 가리지 않음)과 `js/data/story.js`를 읽는다. 주소 인자 읽기·점검용 전역(`location.search`·`location.hash`, `URLSearchParams`, `__test`, `window.__`)은 주석까지 포함한 글 전체에서 찾고, 평가를 매기는 말(한국어 낱말과 영어 `score`·`rank`·`grade`, 다른 낱말 안에 들어 있어도)은 `//`로 시작하는 줄만 빼고 찾는다.
- 대응: `js/story/` 안의 파일과 `js/data/story.js`에는 그 말들을 쓰지 않는다(주석에 주소 인자 낱말을 적어도 실패한다). `js/play/*.js`와 `js/boss/*.js`는 확장자는 가리지만 주석까지 검사하고, `/점수|등급|순위|타이머|게임 오버/`와 `stub`·`__test` 같은 낱말, (보스는) `http` 주소도 잡는다.
- 확인: `node tests/check-story.mjs`, `node tests/check-wingflow.mjs`, `node tests/check-boss.mjs`.

### 점검이 넣은 기록이 불러오자마자 바뀐다
- 증상: 시조관을 열어 둔 기록을 넣었는데 시조관이 잠겨 있다. 보스 2단계로 넣었는데 1단계로 시작한다.
- 까닭: 저장 엔진은 불러올 때 진행을 다시 계산한다. 관 상태는 앞 관이 `done`인지와 그 관의 `shelfBound`·`basketDone`·`roomDone`에서, 보스는 다섯 관 완료와 낯선 노래 다섯의 `done`에서, 개념은 저장된 상태와 확인한 노래 수 가운데 높은 쪽에서 나온다. 저장된 `state` 값은 믿지 않는다.
- 대응: 기록을 넣을 때 표시들을 서로 맞게 넣는다. 예시는 `tools/text/review-shots.mjs`의 `doneWing`.
- 확인: 넣은 뒤 `normalizeProgress`(`js/core/save.js`)를 Node에서 돌려 같은 상태가 나오는지 본다.

### 소리 점검과 배경음 점검에 ffmpeg가 필요하다
- 증상: 다른 기기에서 `check-bgm`이 '음량을 잴 수 없다'로 실패한다.
- 까닭: `check-bgm`은 ffmpeg·ffprobe로 음량과 길이를 잰다. `FFMPEG_BIN` 폴더, `%USERPROFILE%/ffmpeg/bin`(시리즈가 쓰는 자리), PATH 순으로 찾는다. 낭송·배경음 도구도 같은 순서로 찾는다.
- 대응: ffmpeg 설치는 사용자 승인 뒤에 하고, PATH에 없으면 `FFMPEG_BIN`을 준다. `check-voice`는 MP3 프레임 머리를 직접 읽어 길이를 재므로 ffmpeg 없이도 본 점검은 돈다(실제 MP3 시험 하나만 건너뛴다).

### 점검용 Playwright는 이 저장소의 것이고 설치된 Chrome을 쓴다
- `tests/node_modules`는 이 저장소의 Playwright 1.63.0 설치다(`tests/package.json`, `package-lock.json`). 점검은 `channel: 'chrome'`으로 기기에 설치된 Chrome을 열므로 Playwright 브라우저 내려받기(`npx playwright install`)가 필요 없다.
- 3D 점검은 `--use-angle=swiftshader`로 GPU 없이 그리고, 2D 점검은 `--disable-webgl --disable-webgl2 --disable-3d-apis`로 연다. 제품에는 2D를 강제하는 스위치가 없다.

## 같이 고쳐야 하는 짝

한쪽만 고치면 조용히 어긋나거나 점검이 실패한다.

| 고치는 곳 | 함께 고칠 곳 | 어긋나면 |
| --- | --- | --- |
| `css/base.css`의 색 토큰 | `js/world/palette.js`의 `TOKENS` | 3D 재질·카드·종이 인형 색이 화면과 달라진다. `check-world` 실패 |
| `css/base.css`의 글꼴 묶음(`--font-body`·`--font-ui`) | `js/result/card.js`의 `FALLBACK_FONTS` | base.css가 없는 쪽(점검 페이지 등)에서 카드 글꼴이 달라진다 |
| 저장 열쇠 `SAVE_KEY`(`js/core/save.js`) | `js/world/motion.js`의 `SAVE_KEY`(움직임 줄이기를 저장에서 직접 읽음) | 움직임 줄이기 설정이 다시 열 때 사라진다 |
| `defaultDevice().volume`(`save.js`) | `DEFAULT_VOLUME`(`js/core/audio.js`) | 처음 소리 크기가 저장값과 다르다 |
| 글꼴에 넣을 파일 범위(`tools/fonts/build_fonts.py`의 `TEXT_GLOBS`) | `tests/check-fonts.mjs`의 `shippedTextFiles` | 글꼴에 없는 글자를 점검이 못 잡거나 엉뚱하게 잡는다 |
| 새 글 파일 | `tools/text/review-doc.mjs`의 `SOURCES`와 `tests/check-review-doc.mjs`의 `TEXT_FILES` | 교사 확인 문서에서 그 글이 빠지거나 점검이 실패한다 |
| 노래 글(연 나눔·단위 수) | `js/data/rooms-goryeo.js`의 `finalUnit`·`echo`, `rooms-gasa.js`의 `unit`, `rooms-saseol`이 기대는 `nimi-oma` 중장의 `reversal.fromFoot` | 방이 엉뚱한 연을 보이거나 반전을 미리 드러낸다(`check-room-*`, `check-saseol`이 잡는다) |
| 노래 데이터의 `tempo` | 그 노래의 낭송 조각 전부(다시 만들기) | `check-voice`가 기록의 칸과 지금 칸이 다르다고 실패 |
| 고려가요 음보의 `kind`(여음·후렴·되풀이 머리) | 같은 노래 `features.refrains`의 구간, `tests/check-goryeo.mjs`의 `METRIC` | 검증기 `FORM`이나 `check-goryeo`가 실패한다. 구간만 고치면 두드릴 박에 여음이 남는다 |
| 고려가요 음보 경계(나누는 자리) | 그 줄의 낭송 조각(캐시로 다시 자르기)과 `--write-tempo` | `check-voice`가 조각 수·글이 어긋난다고 실패 |
| `assets/manifest.parts/*.json` | `node tools/manifest/build.mjs`로 `assets/manifest.json` 다시 합치기 | 게임이 새 그림·소리를 모르고 자리표시를 쓴다 |

## 소리·낭송

### 음보마다 따로 읽힌 낭송이 한국어처럼 들리지 않았다
- 증상: 음보 조각을 하나씩 TTS로 만들어 이어 붙인 첫 견본을 사용자가 '한국어 원어민 말투가 아니다'라고 했다.
- 까닭: 낱말 두세 개짜리 글을 따로 읽히면 억양과 호흡이 매번 처음부터 시작한다.
- 대응(지금 방식): 줄 하나(시조·사설시조 장, 가사 행, 고려가요 줄, 향가 구)를 한 번에 읽히고, Fish 받아쓰기(ASR)의 낱말 시각으로 음보 경계를 찾은 뒤 그 둘레 ±60ms에서 가장 조용한 곳을 자른다(`cut: 'asr'`). 받아쓰기가 다른 말로 들으면 무음을 뺀 소리로 한 번 더 듣고, 그래도 안 되면 음절 수 비율로 어림해 자른다(`cut: 'energy'`, 귀로 확인할 조각). 받아쓰기로 자른 조각이 0.15초보다 짧거나 음절 몫에 비해 너무 짧거나(0.35배 아래) 너무 길면(두 음절 이상에서 2.5배 위) 그 줄은 음절 비율로 다시 자른다. 두 방법 모두 말이 안 되게 잘리면 음보 사이에 쉼표를 넣은 글로 한 번 더 읽힌다. 향가 구와 음보가 하나인 줄은 자르지 않는다(`cut: 'whole'`). 빨리 읽히거나 늘이지 않는다(`ttsSpeed`·`stretch`는 1).
- 확인: 도구가 끝에 '듣기 대신 점검'으로 받아쓰기 일치 0.6 아래 줄과 `energy` 조각을 알리고, 글 확인 문서의 '먼저 들어 볼 낭송'에 모인다.

### 목소리를 다시 만들 수 없다
- 증상: 캐시를 지운 뒤 낭송 도구가 '다시 설계하지 않고 멈춘다'며 끝난다.
- 까닭: 목소리는 글 설명으로 설계한 것이라 같은 seed로 다시 설계해도 같은 목소리라는 보장이 없다. 그래서 승인한 두 목소리(`narrator-a2`, `narrator-b2`)는 기준 음성 WAV의 sha256(`voices.json`의 `referenceSha256`)으로 묶었다.
- 대응: 설계 캐시(`tools/voice_cache/ref/`)가 없으면 도구가 `assets/raw/voice-ref/<후보 id>-reference.wav` 백업에서 되살린다. 백업이 없거나 해시가 다르면 멈춘다. 백업을 지우거나 덮지 않는다. 다른 기기에서 조각을 더 만들려면 이 백업을 사용자에게서 받아 같은 자리에 둔다.

### 고려가요 음보를 낱말 안에서 나눴더니 낭송을 새로 사야 했다
- 증상: '가시리잇고'를 '가시리 / 잇고'로 나누자 낭송 도구가 그 줄을 캐시에 없는 새 글로 보고 유료 요청을 하려 했다.
- 까닭: 낭송 도구는 줄 글을 음보 `reading`을 빈칸으로 이어 만들고, 그 글의 해시로 캐시를 찾는다. 낱말 안에서 나누면 빈칸이 하나 생겨 다른 글이 된다.
- 대응: 낱말 안에서 나눈 뒤 조각에 `joined: true`를 단다. 줄 글은 `joinFeet`처럼 그 앞을 붙여 이으므로 읽힐 글이 그대로이고, 캐시의 줄 소리를 받아쓰기 시각으로 다시 자르기만 한다. 띄어 쓴 곳의 나눔을 옮기는 것(예: 예전 '두어리마 / ᄂᆞᄂᆞᆫ'을 '두어리 / 마ᄂᆞᄂᆞᆫ'으로)이나, 이 표시 없이 낱말 안을 나눠 띄어 읽혔던 줄에 `joined`를 다는 것(「청산별곡」 '살어리 / 랏다')은 줄 글이 바뀌어 그 줄만 새로 산다. 낱말 안 나눔에 `joined`가 빠지면 두루마리에 원문에 없는 빈칸이 생기므로, 점검은 음보를 이은 글을 원문 줄 글 사본과 맞댄다.
- 확인: 낭송 도구 실행의 끝 줄 '이번에 쓴 돈'이 새로 산 줄만큼인지, 나눈 줄의 조각이 `cut: 'asr'`로 잘렸는지 보고 그 조각을 들어 본다.

### 빠르기를 바꾸면 조각을 다시 만들어야 한다
- 까닭: 조각 하나의 길이는 그 노래의 박자 칸(60 / tempo초)을 넘으면 안 된다(`check-voice`는 칸 + 0.005초까지 허용). 노래의 `tempo`는 가장 긴 조각이 칸의 92%(`FILL`)에 들도록 계산한 자연 빠르기이고, 생성 기록은 만들 때의 `tempo`와 칸 길이를 적어 둔다. `check-voice`는 기록의 `tempo`가 노래 데이터와 같은지도 본다.
- 대응: 노래 데이터의 `tempo`를 손으로 고치지 않는다. 낭송을 다시 만들 때 `--write-tempo`로 그 목소리의 자연 빠르기를 다시 쓰게 한다. 이 플래그 없이 가장 긴 조각이 노래 데이터 빠르기의 칸(60 / tempo초)을 넘으면 도구가 멈춘다.

### 보스 2단계 판정 창이 두 개 있다
- 증상: 진행 엔진의 `REMIX_TAP_WINDOW_MS`(앞 500·뒤 1500ms)를 바꿨는데 보스 2단계 판정이 그대로다.
- 까닭: 보스는 박자 엔진의 리믹스 회차(`createRemixSession`, `REMIX_WINDOW_MS` 앞 700·뒤 1500ms)로만 탭을 판정하고, 그 결과를 진행 엔진에 '줄 번호' 입력(`{ line, switchLines }`)으로 넘긴다. 진행 엔진의 `tapMs` 입력 경로와 `judgeRemixTap`·`REMIX_TAP_WINDOW_MS`는 제품에서 쓰이지 않는다.
- 대응: 판정 창은 `js/core/rhythm.js`의 `REMIX_WINDOW_MS`에서 바꾼다.

### 낭송 조각이 없어도 게임이 멈추지 않는다
- 소리 엔진은 조각을 불러오지 못하면 `audio:missing`을 경로마다 한 번 내고 그 박 자리에 합성 딸깍 소리를 낸다. 장구(`janggu`)와 종(`bell`) 파일이 없으면 합성 소리로 대신한다. 그래서 낭송 없이 점검을 돌려도 진행은 되지만, 완주 점검은 목록에 없는 낭송 조각 요청과 404를 실패로 본다.
- 첫 조작 전에는 소리 판(AudioContext)을 만들지 않는다. 그 전의 배경음 요청은 기억했다가 첫 조작에 튼다. 점검에서 소리를 확인하려면 먼저 페이지를 한 번 누른다.

## 화면과 세계

### 2D 그림 판에 영어 열쇠 이름이 보인다
- 까닭: 2D 누를 자리는 세계 바탕이 관 모형의 `anchors` 열쇠마다 만들고, 이름표는 `js/world/board2d.js`의 `ANCHOR_LABELS`에서 찾는다. 없는 열쇠는 '자리'로 보인다.
- 대응: 관 모형에 새 누를 자리 열쇠를 더하면 `ANCHOR_LABELS`에 한국어 이름을 더한다. 누를 자리가 아닌 점(떠도는 노래 자리, 재기 초점)은 `anchors`에 넣지 말고 `floatingSpots`·`measureFocus`로 내놓는다. 넣으면 2D에 이름표 없는 누를 자리가 생긴다.

### 관 모형은 판 상태를 모른다
- 증상: 판 도중에 관을 나갔다 들어오면 꽂힌 책과 묶음이 사라져 보인다.
- 까닭: 관 모형은 `ctx.restored`(마친 관인지) 말고는 진행 기록을 읽지 않는다.
- 대응: 관에 들어온 직후 한 판 화면이 지금 상태를 사건으로 다시 낸다: `diorama:slot-set`(칸·덤·판정 전 바구니, 돌아온 노래 0~3, 보스를 마쳤으면 시조관 `mentor`) → 묶였으면 `diorama:shelf-bound` → `diorama:fog-recede`. 바구니에서 이미 보낸 노래는 다시 그리지 않는다.

### 세계 바탕은 자산 목록을 스스로 읽지 않는다
- 까닭: 없는 파일 요청이 콘솔 오류가 되지 않도록 세계 바탕·관 모형·방은 목록을 내려받지 않고, 세션이 한 번 읽은 목록을 넘겨받는다.
- 대응: 새 화면에서 그림을 쓰려면 세션의 `manifest`를 받아 `createAssets(manifest)`(`js/world/assets.js`)로 찾는다. 목록에 없는 그림은 `null`이고, 부르는 쪽이 자리표시 그림을 쓴다.

### 회랑 처마가 관 화면을 가린다
- 증상: 회랑에 기와 처마(높이 약 5m)를 올리자 관 안 화면 아래쪽이 처마와 벽으로 덮였다.
- 까닭: 관 모형의 카메라(`anchors.camera`, 관 원점 기준 z 9~13m)가 세계 좌표로 회랑 북쪽 벽(z −2.6) 바로 위에 선다. 예전 회랑 벽은 3.2m라 시야 밑으로 숨었다.
- 대응: 회랑 건축을 `gallery`와 `grounds` 두 무리로 나누고(`js/world/corridor-art.js`), `gallery`(벽·처마·서가·초롱·난간)와 현판은 회랑에서만 보인다(`scene3d.js`의 `updateBackground`). 마당·바닥돌·나무·수묵 병풍은 관 안에서도 보인다. 현판은 처마 밑에서도 보이게 y 3.36에 두고 처마 끝을 4.1m 위로 올렸다.
- 확인: `tests/shots/gfx-capture.mjs`로 관 화면을 찍어 아래쪽이 관 바닥인지 본다.

### 회랑 건축을 처음에 다 지으면 `check-ui`가 가끔 실패한다
- 증상: `check-ui`가 떠도는 노래(`.play-song`)를 20초 동안 누르지 못하고 멈췄다.
- 까닭: 점검은 관에 들어간 뒤 300ms만 기다렸다가 '관 들어가기 글'이 있으면 닫는다. 회랑 건축(부분 수백 개)과 새 셰이더를 세계를 띄울 때 한꺼번에 만들자 글이 300ms보다 늦게 떠서 닫히지 않고 노래를 가렸다(기준 약 100ms → 약 300ms).
- 대응: `scene3d.js`가 `grounds`는 두 번째 프레임에 짓고 `renderer.compileAsync`로 셰이더를 엮은 뒤 붙이며, `gallery`는 처음 회랑을 그릴 때 짓는다. 관에서 시작하면 회랑 건축은 짓지 않는다. 종이 인형 테두리 표본도 8방향으로 줄였다.
- 확인: 관에 들어간 뒤 글이 뜨기까지 SwiftShader에서 약 150ms.

### 관 화면 프레임이 떨어지자 `check-ui`가 떠도는 노래를 누르지 못했다
- 증상: `check-ui`의 '관 화면 점검'이 `.play-song` 누르기에서 20초를 넘겼다. Playwright 기록은 'element is not stable'.
- 까닭: 떠도는 노래 단추는 CSS로 위아래로 떠다니고(`play-float`), Playwright는 두 프레임 동안 자리가 같아야 누른다. 떠다니는 끝에서 잠깐 멈출 때 그 판정이 맞는데, 관 화면에 넓은 마당 바닥면과 겹 나무를 더하자 SwiftShader에서 35fps가 10fps 아래로 떨어져 멈춘 두 프레임을 거의 잡지 못했다.
- 대응: 넓은 마당 바닥면을 빼고(바탕색이 마당), 관 자리 바닥돌은 둘레 테만, 종이 나무는 두 겹, 무늬 비등방 필터는 1. 향가관 시작 화면 18fps(바깥 무리를 끄면 32fps).
- 확인: 관 화면에서 rAF 수를 세고, `check-ui`를 돌린다.

### 승인된 종이 인형 색이 톤 매핑으로 바뀐다
- 까닭: 세계 그리기 판은 `NeutralToneMapping`을 쓴다(`js/world/gfx/lighting.js`). 톤 매핑은 모든 재질에 걸린다.
- 대응: 승인 그림을 그대로 보여야 하는 재질(종이 인형 카드, 현판)은 `toneMapped: false`. 새 인물은 `gfx/figures.js`의 `createFigure`로 만들면 그렇게 된다.

### 작품 방 스타일이 다른 방에 번졌다
- 증상: 「정석가」 방 패널 모양이 「상춘곡」 방에서 바뀌었다.
- 까닭: 두 방 CSS가 같은 머리(`rg-`)의 클래스를 썼고, 다섯 방 CSS가 모두 `index.html`에 함께 붙는다.
- 대응: 두 방의 규칙을 각 방 뿌리 클래스 아래로 묶었다(`.room-goryeo …`, `.rg-room …`). 나머지 방은 그 방만 쓰는 머리글자(`rh-`, `sj-`, `rs-`)로 갈라져 있다. 새 방 규칙은 뿌리 클래스 아래에 두거나 다른 방과 겹치지 않는 머리글자를 쓴다.

### 옛 글자가 기기 글꼴로 흩어져 보인다
- 까닭: 화면 글은 고딕 계열 기기 글꼴을 쓰고, 옛한글 자모·한자 범위(`unicode-range`)만 부분 글꼴 `YetnoraeUI`로 그린다. 완성형 글자 뒤에 끝소리 자모가 붙은 옛 글자(예: 「모죽지랑가」 해독의 '허ᇰ')는 완성형 부분이 기기 글꼴로 가서 한 글자로 모이지 않는다.
- 대응: 그런 글은 본문 글꼴(`--font-body`, `YetnoraeText`)로 보인다.

## 글꼴

- 부분 글꼴은 `python tools/fonts/build_fonts.py`가 `tools/fonts_src/NotoSerifKR-VF.ttf`에서 만든다. 원본은 저장소에 없고 시리즈 형제 저장소(구운몽의 `tools/fonts_src/`)에서 복사해 온다. 도구는 내려받지 않는다.
- 옛한글은 첫가끝 자모를 이어 쓴 글자라, 원본 글꼴의 GSUB 기능(`ljmo`·`vjmo`·`tjmo`·`ccmp`)과 바뀐 모양이 부분 글꼴에 남아야 한 글자로 모인다. 도구는 모든 기능을 남기고 끝에 남았는지 확인한다. 다른 도구로 글꼴을 줄이면 옛 글자가 자모로 흩어진다.
- 글꼴에 넣는 글자: 게임 글(`js/**/*.js`, `css/*.css`, `index.html`, `manifest.webmanifest`)의 모든 글자와 KS X 1001 현대 한글 2,350자(학생이 입력할 이름용).
- 10자는 Noto Serif KR에 없어 기기 글꼴로 그려진다: 향찰 이체자 9자(内 夘 扵 数 湌 肹 过 隠 髙)와 연필 표시 ✎. `tests/check-fonts.mjs`의 `FALLBACK`에 적혀 있다. 그 밖의 글자가 빠지면 점검이 실패하므로 그때 글꼴을 다시 만든다. 이 목록의 글자가 더는 안 쓰이면 점검이 목록을 고치라고 실패한다.

## 글과 교과서 대조

- `docs/글-확인-문서.md`는 `node tools/text/review-doc.mjs`가 만든다. 노래 데이터, 글 파일, 낭송 배정이나 생성 기록 가운데 하나라도 바뀌면 문서를 다시 만들어야 `check-review-doc`가 통과한다. 문서는 줄 끝(CRLF/LF)과 상관없이 같은 내용으로 만들어진다. 보스·엔딩 화면 그림은 `node tools/text/review-shots.mjs`가 만들며(Playwright 필요), 화면이 바뀌었을 때만 다시 찍는다.
- 교과서 PDF에서 뽑은 글에는 옛 글자가 첫가끝 자모가 아니라 **한양 PUA** 코드(옛 한글 조판의 사용자 영역 글자 한 칸)로 들어 있다. `tools/text/compare-textbook.mjs`는 공통국어2 추출본에 나오는 18자를 `HYPUA_MAP`으로 자모로 풀어 대조한다. 이 표는 추출본과 데이터를 맞대어 거꾸로 찾은 것이지 공식 표가 아니다. 표에 없는 PUA 글자는 '풀지 못한 PUA 글자'로 알리고 그 자리는 어긋남으로 나온다. 문학 교과서가 오면 새 PUA 글자가 나올 수 있으니, 어긋남이 PUA 때문인지 먼저 본다.
- 교과서 대조 도구는 `run-all`에 넣지 않았다(추출본이 있는 제작 기기에서만 돈다). 추출본은 `YETNORAE_TEXTBOOK_EXTRACT` 환경 변수, 원래 저장소의 `design/source/extract`, 이 저장소의 `design/source/extract` 순으로 찾고, 없으면 건너뛰었다고 출력한다. `check-compare-textbook`은 도구 자체를 시험용 추출본으로 시험할 뿐이다.

## 그림

- 그림 도구 `tools/art/gen.ps1`은 Codex CLI(`codex exec`)에 내장 이미지 생성을 한 번 시킨다. 전역 `~/.codex` 설정(플러그인·MCP)을 쓰면 시작이 몇 분씩 멈추므로 최소 설정만 둔 임시 `CODEX_HOME`을 만들고, 로그인 토큰을 잠깐 복사했다가 끝에 지운다. 데스크톱 앱의 codex를 먼저 쓰고 `YETNORAE_CODEX_BIN`으로 바꿀 수 있다.
- 프롬프트는 영어(ASCII)로만 쓴다. 명령문 안에 그대로 넣어 넘기므로 한글이 섞이면 깨진다. 프롬프트 파일을 codex에게 읽게 하면 샌드박스가 파일 읽기를 막아 생성이 안 된다.
- 인물·기념품·카드 장식은 자홍(#FF00FF) 바탕으로 만들게 하고 `process.py`가 그 바탕을 빼서 투명하게 한다. 그래서 프롬프트에 '대상 안에 자홍을 쓰지 말라'는 줄이 있다.
- 기념품의 악기·도구는 구조가 틀리기 쉽다(화풍 샘플의 해금은 활과 줄이 틀렸다). 프롬프트에 구조를 구체적으로 적고 눈으로 확인해 틀리면 다시 만든다(`genqueue.py <묶음/id> --force`, 이전 원본은 `.v<번호>.png`로 남는다).
- 같은 가객(같은 '이름 모를 ~' 무리 포함)의 노래들은 같은 그림을 노래 id마다 다른 이름으로 둔다(git은 같은 내용을 한 번만 저장한다).
