# tools — 제작 도구

게임 실행에는 쓰이지 않는다. 자산과 문서를 만드는 도구이고, 결과물(가공본, 자산 목록 조각, 문서)만 커밋한다. 설치·내려받기·유료 서비스는 할 때마다 사용자 승인을 먼저 받는다.

## 맡는 것

| 폴더 | 도구 | 만드는 것 | 바깥 의존 |
| --- | --- | --- | --- |
| `voice/` | `plan.mjs`(노래 데이터 → 줄·조각·박자 칸 계획), `build_voice.py`(낭송), `voices.json`(목소리 후보와 승인 배정) | `assets/audio/voice/**/*.mp3`, `assets/audio/voice/manifest.json`, `assets/manifest.parts/voice.json`, 노래의 `tempo` | Fish Audio 유료 API, ffmpeg, `numpy`, `msgpack` |
| `art/` | `catalog.py`(그림 목록과 프롬프트), `jobs.py`, `genqueue.py`(묶음 생성), `gen.ps1`(Codex로 한 장), `process.py`(가공), `contact.py`(모아 보기), `fix_hyangga.py`, `prompts/` | `assets/img/**/*.webp`, `assets/manifest.parts/art.json` | Codex CLI 로그인, `numpy`, `Pillow` |
| `bgm/` | `fetch.py`(악구 내려받기), `build_bgm.py`, `build_sfx.py`, `write_docs.py`, `common.py`, `sources.json` | `assets/audio/bgm/`, `assets/audio/sfx/`, `assets/audio/CREDITS.md`, `assets/manifest.parts/audio.json` | 국립국악원 사이트, ffmpeg, `numpy`, `scipy` |
| `fonts/` | `build_fonts.py` | `assets/fonts/yetnorae-text-{400,700}.woff2`, `OFL.txt`, `coverage.json`, `assets/manifest.parts/font.json` | 원본 글꼴(시리즈 형제 저장소에서 복사), `fontTools`, `brotli` |
| `text/` | `review-doc.mjs`, `review-shots.mjs`, `compare-textbook.mjs` | `docs/글-확인-문서.md`, `docs/images/*.png`, 교과서 대조 출력 | 화면 그림은 Playwright, 대조는 교과서 추출본 |
| `manifest/` | `build.mjs` | `assets/manifest.json`(조각 합치기, 같은 경로가 두 번이면 실패) | — |

## 맡지 않는 것
- 게임 코드. 도구는 게임 모듈을 읽기만 한다(`plan.mjs`는 `voiceClips`·`buildGrid`를, `review-shots.mjs`는 `defaultProgress`를 그대로 불러 쓴다). 게임 쪽 계산과 다른 계산을 도구 안에 따로 두지 않는다.
- 원본 보관. 생성 원본과 캐시는 저장소 밖(`.gitignore`): `assets/raw/`(그림 원본, 목소리 기준 음성 백업 `voice-ref/`, 견본 `voice-samples/`, 모아 보기 `review/`), `tools/voice_cache/`, `tools/music_src/`, `tools/fonts_src/`.

## 불변식
- **Fish Audio 키**는 환경 변수 `YETNORAE_FISH_API_KEY`로만 받는다. 명령 한 줄에만 넘긴다: `YETNORAE_FISH_API_KEY="$(cat "$LOCALAPPDATA/yetnorae/fish.key")" python tools/voice/build_voice.py …`. 도구는 키를 화면·기록·파일에 쓰지 않고 오류 글에서도 지운다(`redact`). 키를 출력하거나 다른 파일로 옮기는 코드를 더하지 않는다.
- 돈이 드는 요청 앞에서 계정이 유료 이용(API 충전 이력)인지와 충전액을 확인하고, 아니면 멈춘다. 요청마다 앞에서 이번 실행에서 쓴 돈(추정)이 `--max-usd`(기본 3 USD)에 닿았는지 보고 닿았으면 멈춘다. 요청을 `--jobs`(기본 4)개씩 동시에 보내므로 이미 보낸 요청만큼 조금 넘을 수 있다. 만든 것은 캐시에 남는다.
- 실제 낭송 조각은 `voices.json`의 승인 배정(`approved.default`, `approved.bySong`)대로만 만든다. 승인한 후보(`narrator-a2`, `narrator-b2`)의 `seed`·`instruction`·`referenceText`를 바꾸지 않는다(다른 목소리가 된다). 기준 음성은 `referenceSha256`으로 묶여 있고, 설계 캐시가 없으면 `assets/raw/voice-ref/<후보 id>-reference.wav`에서 되살리며, 그것도 없거나 해시가 다르면 다시 설계하지 않고 멈춘다.
- 낭송은 줄 단위로 읽힌 뒤 받아쓰기 낱말 시각으로 음보를 자르고(`cut: 'asr'`), 안 되면 음절 비율(`'energy'`), 그래도 안 되면 쉼표를 넣어 다시 읽힌다. 향가 구와 음보가 하나인 줄은 자르지 않는다(`'whole'`). 빨리 읽히거나 늘이지 않는다(`ttsSpeed`·`stretch` = 1). 92%(`FILL`)는 자연 빠르기를 계산하는 목표 비율이다(`내림(60 × FILL ÷ 가장 긴 조각 초)`). 지켜야 하는 한도는 조각 길이 ≤ 박자 칸(60 / tempo초)이고(`check-voice`는 0.005초 여유), `--write-tempo` 없이 가장 긴 조각이 노래 데이터 빠르기의 칸을 넘으면 도구가 멈춘다.
- 그림 프롬프트는 영어(ASCII)로만 쓰고, 화풍 문단은 승인된 샘플(`prompts/style_*.txt`)의 문구를 그대로 쓴다. 그림 안에 글자가 없어야 한다. 인물·기념품·카드 장식은 자홍(#FF00FF) 바탕으로 만들고 `process.py`가 빼서 투명하게 한다.
- `gen.ps1`은 최소 설정만 둔 임시 `CODEX_HOME`을 쓰고, 로그인 토큰 복사본을 끝에 지운다.
- 국악 음원은 `sources.json`에 적은 악구만 받고, 공공누리 제1유형 출처 문구를 `CREDITS.md`와 자산 목록에 남긴다. 그 문구는 `js/data/credits.js`와 같아야 한다.
- 부분 글꼴은 원본의 GSUB 기능(`ljmo`·`vjmo`·`tjmo`·`ccmp`)과 바뀐 모양을 모두 남긴다(옛한글이 한 글자로 모이게). 글꼴 이름은 OFL에 따라 `Yetnorae Text`로 바꾼다. 담는 글자 범위(`TEXT_GLOBS`)는 `tests/check-fonts.mjs`의 `shippedTextFiles`와 같아야 한다.
- 글 확인 문서는 도구로만 만든다. 새 글 파일을 더하면 `review-doc.mjs`의 `SOURCES`와 `tests/check-review-doc.mjs`의 `TEXT_FILES`에 함께 더한다. 문서에 출판사 이름이 들어가면 안 된다.
- `review-shots.mjs`는 화면에 가려고 이 도구 안에서만 로컬 저장소에 기록을 넣는다(제품에는 그런 입구가 없다). 넣는 기록은 관 표시와 순서가 맞아야 한다(`doneWing`).
- 교과서 대조 도구는 추출본을 `YETNORAE_TEXTBOOK_EXTRACT` → 원래 저장소의 `design/source/extract` → 이 저장소의 `design/source/extract` 순으로 찾고, 없으면 건너뛰었다고 알린다. 추출본의 한양 PUA 옛 글자는 `HYPUA_MAP`(공통국어2에 나온 18자, 추출본과 데이터를 맞대어 찾은 표, 공식 표 아님)으로 풀고, 표에 없는 글자는 '풀지 못한 PUA 글자'로 알린다. 파일 이름 패턴으로 교과서를 찾고(`공통국어2`, `문학`), 출판사 이름을 코드에 쓰지 않는다.

## 구현 방식
- 낭송: `build_voice.py --dry-run`(요금 계산, 키 없음) → `--self-test`(API 없이 가짜 말소리로 자르기·기록 시험) → 실제. 견본은 `--sample --voice <후보> --only <id> --out <폴더>`, 빠르기 재기는 `--tempo-probe --voice <후보,…> [--write-tempo]`. 응답 원본은 글·목소리·설정의 해시로 `tools/voice_cache/`에 두어 같은 줄을 다시 사지 않는다. 끝에 받아쓰기 일치 0.6 아래 줄과 `energy` 조각을 알린다.
- 그림: `genqueue.py "<묶음>/*" -j 4`가 `catalog.py`로 프롬프트를 다시 쓰고 `gen.ps1`을 부른다. 하나만 다시 만들 때 `--force`(이전 원본은 `.v<번호>.png`). 그다음 `process.py`. 같은 가객의 노래들은 같은 그림을 노래 id마다 다른 이름으로 둔다.
- 배경음: 장단이 자유로운 곡(free)은 악구 앞뒤 무음을 줄이고 겹쳐 잇고 끝을 처음에 겹쳐 되풀이 이음매를 없앤다. 장단이 일정한 곡(metric)은 길이를 그대로 두어 되풀이해도 박이 밀리지 않게 한다. 음량은 약 −20 LUFS, 봉우리 −1.5 dBFS 아래, MP3 64kbps.
- ffmpeg는 `FFMPEG_BIN` 폴더 → `%USERPROFILE%/ffmpeg/bin` → PATH 순으로 찾는다.
- 도구를 돌린 뒤에는 `node tools/manifest/build.mjs`로 자산 목록을 다시 합치고, 글이나 낭송 기록이 바뀌었으면 `node tools/text/review-doc.mjs`를 돌린다.

## 점검
- 도구 결과는 `check-voice`(조각 수·칸 길이·생성 기록·승인 배정·기준 음성 해시), `check-assets`(목록과 파일, 크기·형식, 사용권, 게임이 부르는 이름), `check-bgm`(파일, 출처 문서, 음량 범위), `check-fonts`(게임 글자 전부, GSUB 기능, 기기 글꼴 10자 목록), `check-review-doc`(문서가 최신이고 빠진 글이 없는지), `check-compare-textbook`(대조 도구 자체), `check-rights`(자산 목록의 사용권, 출판사 이름)가 본다.
- 낭송 도구는 `--self-test`로, 승인 배정과 기준 음성 고정은 `self_test_assignment`로 네트워크 없이 시험한다.
