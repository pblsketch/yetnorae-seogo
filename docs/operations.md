# 운영 절차

명령은 저장소 맨 위(`옛 노래 서고/`)에서 Git Bash 기준으로 적었다. 설치·내려받기·유료 서비스·공개는 할 때마다 사용자 승인을 먼저 받는다.

## 1. 준비물

| 준비물 | 쓰는 곳 | 없으면 |
| --- | --- | --- |
| 정적 서버를 띄울 수단(파이썬 3의 `http.server` 등) | 게임 실행 | `index.html`을 파일로 열면 모듈 읽기가 막혀 실행되지 않는다 |
| Node(지금 제작 기기는 v24) | 점검 전부, 글 확인 문서, 자산 목록 합치기, 낭송 계획 | 점검을 돌릴 수 없다 |
| 설치된 Chrome | 화면 점검(Playwright가 `channel: 'chrome'`으로 연다) | 화면 점검이 시작되지 않는다 |
| `tests/node_modules`(Playwright 1.63.0) | 화면 점검, 화면 그림 도구 | `cd tests && npm ci`(승인 뒤) |
| ffmpeg·ffprobe | `check-bgm`, 낭송·배경음 도구 | `check-bgm` 실패. 찾는 순서는 `FFMPEG_BIN` 폴더 → `%USERPROFILE%/ffmpeg/bin` → PATH |
| 파이썬 3 + 도구별 패키지 | 낭송(`numpy`, `msgpack`), 효과음(`numpy`, `scipy`), 그림(`numpy`, `Pillow`), 글꼴(`fontTools`, woff2 압축용 `brotli`), 화면 그림 줄이기(`Pillow`, 없으면 줄이지 않음) | 그 도구만 못 돈다. 게임과 점검에는 필요 없다 |

## 2. 처음 한 번

```sh
git clone https://github.com/pblsketch/yetnorae-seogo.git "옛 노래 서고" && cd "옛 노래 서고"
cd tests && npm ci && cd ..                 # Playwright 설치(사용자 승인 뒤). 브라우저 내려받기는 필요 없다
node tests/check-smoke.mjs                  # 첫 화면이 열리고 바깥 요청·콘솔 오류가 없는지
```

- `npm ci`는 `tests/` 안에서만 한다. 저장소 맨 위에는 `package.json`이 없다.
- 이 저장소를 git worktree로 나눠 쓸 때 `tests/node_modules`를 다른 폴더에 junction으로 걸었다면, worktree를 지우기 **전에** 아래 순서를 지킨다.

```sh
cd <worktree>/tests && cmd //c rmdir node_modules && ls node_modules   # 'No such file'이 나와야 한다
cd <원래 저장소> && git worktree remove <worktree 경로>                  # --force를 쓰지 않는다
```

## 3. 실행

```sh
python -m http.server 8770      # 저장소 맨 위에서
# 브라우저로 http://127.0.0.1:8770 을 연다(가로 화면)
```

- 빌드, 패키지 설치가 필요 없다. 바꾼 파일은 새로 고침으로 바로 보인다.
- 학생 기기 기록을 지우려면 그 브라우저에서 사이트 데이터(로컬 저장소 열쇠 `yetnorae-seogo-v1`)를 지운다. 게임 안에서는 이름 기록마다 지우기(확인 한 번)가 있다.
- 2D 그림 판을 직접 보려면 WebGL을 끈 브라우저로 연다(예: Chrome을 `--disable-webgl --disable-webgl2 --disable-3d-apis`로 실행). 게임에는 2D로 바꾸는 스위치가 없다.

## 4. 점검

```sh
node tests/check-data.mjs        # 노래 데이터·노래 표·먹 가능성(브라우저 없음, 몇 초)
node tests/check-rights.mjs      # 출판사 이름·자산 사용권(브라우저 없음). 커밋 전에 꼭
node tests/check-<이름>.mjs      # 고친 곳의 점검 하나
node tests/run-all.mjs           # 전체 37개, 약 75분. 0으로 끝나야 완료
```

- 전체 점검은 첫 실패에서 멈추고, 결과는 `tests/shots/run-all-<시각>.log`에 남는다. 화면 점검의 스크린숏도 `tests/shots/`에 쌓인다(커밋하지 않음).
- 전체 점검이 도는 동안 다른 Playwright 점검이나 두 번째 전체 점검을 돌리지 않는다. 박자 판정이 흔들린다.
- 점검 하나를 손볼 때만 쓰는 스위치: `PLAYTHROUGH_SETUP=phone|chromebook|tablet`(완주 점검 한 화면만), `PT_DEBUG=1`(완주 박 기록), `MEASURE_ONLY=phone`(재기 점검의 화면 크기 부분만), `VOICE_OPTIONAL=1`(낭송 조각이 하나도 없을 때 '아직 없음'으로 넘김). 전체 점검은 `ONLY`나 인자를 받지 않는다.

## 5. 내용을 고친 뒤 다시 만드는 순서

노래 글, 이야기·방·보스·수첩 글, 화면 글을 고친 뒤에는 이 순서로 돌린다. 앞 단계의 결과를 뒤 단계가 읽으므로 순서를 바꾸면 뒤 단계가 낡은 것을 담는다.

```sh
node tests/check-data.mjs                         # 1. 데이터가 형식·노래 표·먹 가능성에 맞는지
python tools/fonts/build_fonts.py                 # 2. 새 글자가 생겼으면 글꼴(원본은 tools/fonts_src/)
node tools/manifest/build.mjs                     # 3. 자산 목록 조각이 바뀌었으면 합치기(글꼴 도구도 조각을 쓴다)
node tools/text/review-doc.mjs                    # 4. 글 확인 문서(데이터·글 파일·낭송 기록을 읽는다)
node tools/text/review-shots.mjs                  # 5. 보스·엔딩 화면이 바뀌었을 때만 그림 다시 찍기(Playwright 필요)
node tests/check-fonts.mjs && node tests/check-review-doc.mjs && node tests/check-credits.mjs
```

- 노래 글의 단위 수나 연 나눔이 바뀌면 그 노래의 낭송 조각도 다시 만든다(아래 6). 낭송 기록이 바뀌면 4를 다시 돌린다.
- 교과서 수록본과 대조(추출본이 있는 제작 기기에서만): `node tools/text/compare-textbook.mjs [--only 노래id,…] [--with-gloss]`. 추출본 폴더는 `YETNORAE_TEXTBOOK_EXTRACT`로 줄 수 있다. 대조 결과(일치·어긋남)는 커밋 글에 남긴다.
- 교사가 노래를 확인해 주면 그 노래의 `verification`을 `'verified'`로 바꾸고 4를 다시 돌린다.

## 6. 낭송 조각 만들기(유료)

```sh
python tools/voice/build_voice.py --dry-run                     # 줄 수·조각 수·예상 요금. 키 없이 됨
python tools/voice/build_voice.py --self-test                   # API 없이 가짜 말소리로 자르기·기록 시험
YETNORAE_FISH_API_KEY="$(cat "$LOCALAPPDATA/yetnorae/fish.key")" \
  python tools/voice/build_voice.py --only <노래id,…> --write-tempo --max-usd 3
node tools/manifest/build.mjs && node tools/text/review-doc.mjs
node tests/check-voice.mjs
```

- 키는 그 명령 한 줄에만 넘긴다. 키 파일 내용을 화면에 내지 않는다.
- 실제 조각은 `tools/voice/voices.json`의 승인 배정(`approved.default`, `approved.bySong`)대로만 만든다. `--voice`는 견본(`--sample`)과 빠르기 재기(`--tempo-probe`)에만 쓴다.
- 이미 받은 줄은 `tools/voice_cache/`에 있어 다시 돈을 쓰지 않는다. 목소리 기준 음성은 `assets/raw/voice-ref/`에서 되살린다. 둘 다 저장소 밖이므로 다른 기기에서는 사용자에게 받아 같은 자리에 둔다.
- 쓴 돈이 한도(`--max-usd`, 기본 3 USD)에 닿으면 도구가 멈춘다(동시 요청 때문에 조금 넘을 수 있으니 한도를 여유 있게 정하지 않는다). 만든 것은 캐시에 남으므로 승인을 받아 한도를 올린 뒤 같은 명령을 다시 돌리면 이어서 만든다.
- 끝에 도구가 알리는 '받아쓰기 일치 0.6 아래 줄'과 '음절 비율로 자른 조각'은 글 확인 문서의 '먼저 들어 볼 낭송'에 모이고, 사람이 귀로 확인한다.
- **경계가 어긋난 줄만 음보마다 따로 읽히기**(교사 승인 뒤): 줄 목록 JSON(`{"lines": [[노래 id, 줄 key], …], "context": {}}`, 예: `design/voice-audit/regen-lines.json`)을 만들고

  ```sh
  python tools/voice/build_voice.py --per-foot --lines <줄 목록> --dry-run --max-usd 0.3      # 요청 수·요금(키 없이)
  YETNORAE_FISH_API_KEY="$(cat "$LOCALAPPDATA/yetnorae/fish.key")" \
    python tools/voice/build_voice.py --per-foot --lines <줄 목록> --backup design/voice-audit/backup-<시각> --max-usd 0.3 --credit-wait 150
  node tools/manifest/build.mjs && node tools/text/review-doc.mjs && node tests/check-voice.mjs
  ```

  그 줄의 조각만 바뀌고(`cut: 'per-foot'`), 바꾸기 전 조각과 생성 기록·자산 목록 조각은 `--backup` 폴더에 같은 경로로 남는다. 되돌리려면 그 폴더의 `assets/`를 저장소 맨 위에 그대로 덮어 쓰고 `node tools/manifest/build.mjs`를 다시 돌린다. 한 음절 음보가 이상하게 나오면 줄 목록의 `context`에 `{"<조각 경로>": ","}`를 넣어 그 음보만 쉼표를 붙여 다시 읽힌다. `--credit-wait`는 끝에 충전액의 차이(실제 차감)만 알린다(충전액 자체는 쓰지 않는다). 음보마다 읽은 줄 전체 목록은 `design/voice-audit/regen-lines-all.json`이고, 음량 목표는 줄 단위 조각만 보고 정하므로 같은 목록으로 다시 돌려도 결과가 같다.
- **낭송용 발음 표기**: 낭송이 옛 표기를 다른 소리로 읽으면(예: '뫼'를 '뿌·삐'처럼) `design/voice-audit/syllable_audit.py`로 같은 종류를 전체에서 찾고, 후보 표기를 `design/voice-audit/pron_trial.py`로 두 목소리에 짧게 시험해(`--dry-run`으로 요금 먼저) 받아쓰기로 고른 뒤 `tools/voice/pronounce.json`에 규칙을 더한다. 그 글자가 든 줄을 `--per-foot`로 다시 만들고(칸을 넘으면 그 음보에 `context`로 뒤 쉼표), `node tools/manifest/build.mjs && node tools/text/review-doc.mjs && node tests/check-voice.mjs && node tests/check-review-doc.mjs`.

## 7. 그림 만들기

```sh
python tools/art/genqueue.py "keepsake/*" -j 4          # 프롬프트를 catalog.py에서 다시 쓰고 gen.ps1로 원본 생성 → assets/raw/art/
python tools/art/genqueue.py keepsake/<노래id> --force  # 하나만 다시(이전 원본은 .v<번호>.png로 남음)
python tools/art/process.py                             # 원본 → assets/img/**/*.webp, assets/manifest.parts/art.json
python tools/art/contact.py                              # 모아 보기(확인용)
node tools/manifest/build.mjs && node tests/check-assets.mjs
```

- Codex CLI 로그인이 필요하다. 다른 codex를 쓰려면 `YETNORAE_CODEX_BIN`, 모델을 바꾸려면 `YETNORAE_CODEX_MODEL`.
- 새 그림은 승인된 화풍(`tools/art/prompts/style_*.txt`의 문구)을 그대로 쓴다. 화풍을 바꾸려면 샘플을 다시 승인받는다.

## 8. 배경음과 효과음

```sh
python tools/bgm/fetch.py        # 국립국악원 악구 내려받기 → tools/music_src/(사용자 승인 뒤, 이미 받은 것은 건너뜀)
python tools/bgm/build_bgm.py    # 관마다 배경음 → assets/audio/bgm/
python tools/bgm/build_sfx.py    # 효과음 → assets/audio/sfx/
python tools/bgm/write_docs.py   # assets/audio/CREDITS.md와 자산 목록 조각
node tools/manifest/build.mjs && node tests/check-bgm.mjs && node tests/check-credits.mjs
```

- 쓸 악구는 `tools/bgm/sources.json`에 적는다. 출처 문구(공공누리 제1유형)는 `CREDITS.md`와 `js/data/credits.js`의 문구가 같아야 한다(`check-credits`).

## 9. 커밋

```sh
node tests/check-rights.mjs && node tests/check-data.mjs
git add <파일> && git commit     # 한국어 '유형: 설명', 끝 줄 Co-Authored-By. 출판사 이름 없음
```

- 저장소 git 사용자는 이미 저장소 설정으로 정해져 있다(`pblsketch`). 바꾸지 않는다.
- `git push`는 하지 않는다. 원격 저장소가 아직 없다.

## 10. 공개(GitHub Pages)

- 저장소: https://github.com/pblsketch/yetnorae-seogo (공개), 기본 가지 `main`. 사이트: https://pblsketch.github.io/yetnorae-seogo/
- Pages는 `main`의 맨 위 폴더를 그대로 내놓는다(빌드 없음, `.nojekyll`로 Jekyll 처리를 끈다). 모든 경로가 상대 경로라 하위 경로 `/yetnorae-seogo/`에서도 돈다.
- 배포 순서: `node tests/run-all.mjs`가 0으로 끝난 것을 확인 → `node tests/check-rights.mjs` → `git push origin main`. 몇 분 뒤 `gh api repos/pblsketch/yetnorae-seogo/pages/builds/latest`의 `status`가 `built`이고 `commit`이 올린 커밋인지 본다.
- 확인: 공개 주소를 브라우저로 열어 시작 화면, 새 기록, 이어폰 안내까지 오는지, 콘솔 오류·실패한 요청·바깥 요청이 없는지 본다.
- 올리기(push)는 할 때마다 사용자 승인을 받는다. 교과서 밖 노래 글은 공개된 뒤에도 교사 확인 중이며, 확인이 끝나면 `verified`로 바꿔 다시 올린다.
