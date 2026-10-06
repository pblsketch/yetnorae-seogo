# 바깥에 내놓는 약속

이 게임에는 API가 없다. 바깥에서 기대는 것은 네 가지다: 배포되는 **정적 사이트** 자체, 브라우저에 남는 **저장 문서**, 학생이 내려받는 **결과 카드 PNG**, 그리고 게임·출처 화면·점검이 함께 읽는 **자산 목록**. 아래 약속을 바꾸면 이미 쓰고 있는 학생 기록, 내려받은 카드, 출처 화면이 영향을 받는다.

## 공통

- 모든 경로는 사이트 맨 위 기준 **상대 경로**다. 사이트가 하위 경로(`/<저장소 이름>/`)에 있어도 그대로 돈다.
- 모든 자원은 같은 사이트에서 온다. 게임은 바깥 주소로 요청하지 않으므로, 이 약속을 지키는 쪽도 바깥 자원을 요구하지 않는다.
- 글은 모두 UTF-8이고 한국어다. 옛 글자는 첫가끝 자모(U+1100–11FF, A960–A97F, D7B0–D7FF)로 쓴다. 한양 PUA 같은 사용자 영역 글자는 쓰지 않는다.

## 1. 정적 사이트

| | |
| --- | --- |
| 쓰는 쪽 | 학교 기기의 브라우저(가로로 든 휴대폰, 태블릿, 크롬북, PC) |
| 부르는 법 | 사이트 맨 위(`index.html`)를 http(s)로 연다 |
| 필요한 것 | ES 모듈과 import map을 지원하는 브라우저, 자바스크립트 켜짐. 3D는 WebGL2가 있을 때만 |
| 내놓는 것 | 이름 기록 화면에서 시작하는 한 가지 흐름. 주소 인자(`?…`, `#…`)는 아무 뜻이 없고 무시된다 |

| 오류 상황 | 결과 |
| --- | --- |
| `file://`로 열기 | 브라우저가 모듈 읽기를 막아 시작되지 않는다 |
| 자바스크립트 꺼짐 | "이 게임은 자바스크립트가 켜져 있어야 합니다." 안내만 보인다 |
| WebGL2 없음, 또는 3D 그림판 만들기 실패 | 그 창은 끝날 때까지 2D 그림 판으로 같은 규칙대로 진행한다 |
| 세로 화면 | "기기를 돌려 주세요"를 덮고 진행과 소리를 멈춘다. 가로로 돌리면 이어진다 |
| `assets/manifest.json`을 읽지 못함 | 모든 그림이 자리표시 그림이 되고 진행은 그대로다. 출처 화면의 쓴 곡·낭송·그림 목록이 빈다 |
| 낭송 조각·장구·종 소리 파일이 없음 | 그 박 자리에 합성 소리가 나고 박자는 그대로 간다 |

## 2. 저장 문서 `yetnorae-seogo-v1`

| | |
| --- | --- |
| 쓰는 쪽 | 같은 게임의 다음 버전(이어 하기), 점검 도구와 화면 그림 도구(상태를 넣을 때) |
| 자리 | 브라우저 로컬 저장소의 열쇠 **하나** `yetnorae-seogo-v1`, 값은 JSON 문자열 하나 |
| 쓰는 때 | 의미 있는 행동마다 문서 **전체**를 덮어쓴다(부분 쓰기 없음) |

맨 위 모양:

```js
{
  version: 1,                         // 정수. 모양이 바뀌면 올린다
  device: {                           // 기기 공통 설정(모든 이름 기록이 함께 씀)
    volume: { bgm: 0.6, voice: 1, sfx: 0.8 },   // 0~1
    muted: false, slashMode: false,
    textScale: 1,                     // 1 | 1.15 | 1.3
    reduceMotion: false,
    calibrationOffsetMs: 0,           // 박자 보정값(ms). 판정 때 탭 시각에서 뺀다
    calibrated: false,                // 이 기기에서 이어폰 안내·박자 맞추기를 지났는지
  },
  slots: { '<기록 id>': { id, name, appearance: 'a' | 'b', createdAt, updatedAt, progress } },
  lastSlotId: '<기록 id>' | null,
}
```

`progress`의 열쇠: `tutorialDone`, `wings[관 id]`(`state`, `shelfBound`, `basketDone`, `roomDone`, `bonusDone`, `uniqueActionIntroSeen`, `doneAt`, `placements.{shelf[3], basket[2], bonus[3]}`, `wrongCount`, `measured`), `prewaiting[관 id]`, `returned[관 id]`, `concepts[개념 id]`(`state`, `songs`), `keepsakes`, `rooms[관 id]`(방 기록 또는 `null`), `boss`(`state`, `stageWrong`, `unseen[노래 id]`의 `done`·`firstTryCorrect`·`journalHelp`·`singerGroupCorrect`), `ending`(`line`, `wing`, `conceptId`, `note`, `completed`, `completedAt`). 열쇠 하나하나의 값 집합은 `js/data/README.md`의 '저장 형식' 절에 있다.

읽는 쪽이 지켜야 할 것:
- **상태는 다시 계산된다.** 불러올 때 관 상태는 순서와 세 표시(`shelfBound`·`basketDone`·`roomDone`)에서, 보스 상태는 다섯 관 완료와 낯선 노래 다섯의 `done`에서, 개념 상태는 저장된 상태와 `songs` 수 가운데 높은 쪽에서, `ending.completed`는 보스 완료에서 다시 나온다. 상태를 넣는 쪽은 이 표시들을 서로 맞게 넣어야 넣은 상태가 그대로 보인다.
- 약속 밖의 열쇠와 값은 버려진다. 모자란 열쇠는 기본값으로 채워진다.
- 이름은 기기 안에서 하나뿐이다(NFC, 앞뒤 공백 뺀 뒤 1~12자). 게임은 새 기록을 만들 때만 이름이 겹치는지 보고, 불러올 때는 보지 않는다. 그래서 상태를 넣는 쪽이 같은 이름의 기록 둘을 넣으면 둘 다 남고, 이름으로 찾을 때는 먼저 나오는 것만 잡힌다. 넣는 쪽이 이름을 겹치지 않게 한다.
- 방 기록(`rooms[관 id]`)의 해석 id는 `js/data/rooms-*.js`의 id를 가리킨다. 글은 바뀌어도 id는 바뀌지 않는다.

| 오류 상황 | 결과 |
| --- | --- |
| 저장소를 쓸 수 없음(읽기부터 보안 오류) | `save:failed { reason: 'unavailable' }`, 알림 한 번, 이번 창 메모리로만 |
| 저장소 가득 참 | `save:failed { reason: 'quota' }`, 알림 한 번, 메모리의 진행은 그대로 |
| JSON이 깨졌거나 `version`을 옮길 수 없음 | 새 문서로 시작하고 다음 저장에서 덮어쓴다 |
| 옛 버전이고 옮기는 함수가 있음 | `MIGRATIONS`로 옮겨 읽는다(지금은 버전 1뿐이라 옮기는 함수가 없다) |
| **더 새 버전**(`version` > 1) | 덮어쓰지 않는다. 이번 창 메모리로만 진행하고 `save:failed { reason: 'unknown' }` |
| 두 창이 같은 기록을 씀 | 막지 않는다. 나중에 저장한 창의 문서가 남는다 |

## 3. 결과 카드 PNG

| | |
| --- | --- |
| 쓰는 쪽 | 학생(내려받아 제출), 교사(디브리핑) |
| 부르는 법 | 판을 마친 순간(판 카드, 그때 한 번뿐), 엔딩 뒤(마지막 카드), 서고 완성 뒤 게임 중 설정 화면의 '마지막 카드'(마지막 카드 다시 받기) |
| 내놓는 것 | PNG, 1600×900 픽셀 고정(글자 크기 설정과 상관없음) |
| 파일 이름 | `옛노래서고_<이름>_<관 이름>.png`, `옛노래서고_<이름>_마지막.png`. 이름 안의 `\ / : * ? " < > |`는 `_`로 바뀐다 |
| 담는 것 | 판 카드: 이름, 관 이름, 칸 노래 세 편, 그 갈래 개념의 연필/먹, 작품 방 기록('해석' 표시 포함), 덤 여부, 그 관을 마친 날짜. 마지막 카드: 이름, 다섯 관 완료, 먹 개념, 낯선 노래 다섯의 처음 맞힘·일지 도움·누가 불렀을까 맞힘, 엔딩의 한 줄·관·근거 개념·한마디, 서고 완성 날짜 |
| 담지 않는 것 | 학생을 평가해 매기는 값과 그렇게 읽히는 말 |

- 카드 그림은 저장하지 않는다. 내려받기를 누를 때마다 **그 순간의 기록**으로 다시 그린다. 마지막 카드는 서고 완성 뒤 다시 받을 수 있어 그때의 기록으로 다시 그려진다. 판 카드는 판을 마친 순간에만 받을 수 있고, 뒤에 다시 받는 길이 없다.
- 긴 한 줄과 한마디는 줄을 바꾸고, 그래도 넘치면 글씨를 줄여 잘리지 않게 그린다.

| 오류 상황 | 결과 |
| --- | --- |
| 카드 자료가 없음(그 관을 아직 마치지 않음 등) | 내려받기 버튼 없이 안내만 보인다 |
| 그 기록이 지워짐 | 카드를 다시 그릴 수 없다(자료가 함께 지워진다) |
| 학생 그림이 자산 목록에 없음 | 자리표시 종이 인형으로 그린다 |

## 4. 자산 목록 `assets/manifest.json`

| | |
| --- | --- |
| 쓰는 쪽 | 게임(세션이 한 번 읽어 세계·관 모형·방·카드에 넘김), 출처 화면, 권리·자산 점검 |
| 만드는 법 | `assets/manifest.parts/*.json`(도구마다 하나: `art`, `audio`, `font`, `voice`)을 `node tools/manifest/build.mjs`가 이름 순으로 합친다. 손으로 고치지 않는다 |

```json
{ "version": 1, "parts": ["art.json", "audio.json", "font.json", "voice.json"],
  "assets": [ { "path": "assets/img/sprite/student-a.webp", "kind": "image", "source": "…", "generator": "…",
                "license": "…", "commercialUse": true, "notes": "" } ] }
```

| 열쇠 | 반드시 | 값 |
| --- | --- | --- |
| `path` | 예 | 저장소 기준 경로. 목록 전체에서 하나뿐 |
| `kind` | 예 | `image` · `voice` · `bgm` · `sfx` · `font` · `other` |
| `source` | 예 | 원곡·원본·서비스 이름(비어 있지 않음) |
| `license` | 예 | 사용권 문구(비어 있지 않음, 예: 공공누리 제1유형 출처 문구) |
| `commercialUse` | 예 | 반드시 `true` |
| `generator`, `notes` | 아니요 | 만든 도구·설정·요금제, 메모(낭송은 그 조각의 글). 그림은 `prompt`, `rawSha256`, `image { format, width, height, alpha }`를 더 가진다 |

- 게임은 경로가 `assets/img/<이름>.(webp|png|jpg|jpeg)`이고 `kind`가 `'image'`이거나 비어 있는 항목만 그림으로 찾는다(`kind`가 없는 항목은 `check-rights`에서 실패하므로 실제로는 `'image'`만 쓴다). 그림 이름은 `sprite/student-a`, `sprite/student-b`, `sprite/mentor`, `sprite/jom`, `sprite/jom-king`, `sprite/singer-<노래 id>`, `texture/<entrance·corridor·hanji·관 id>`, `board/<entrance·corridor·관 id·room-<관 id>·boss·ending>`, `keepsake/<노래 id>`, `card/frame`, `card/keepsake`다.
- 학생 그림은 언제나 두 모습(`a`·`b`)을 모두 갖춘다.

| 오류 상황 | 결과 |
| --- | --- |
| 조각 둘에 같은 `path` | 합치기 도구가 실패로 끝나고 목록을 쓰지 않는다 |
| `license`가 비거나 `commercialUse`가 `true`가 아님 | `check-rights` 실패(공개 불가) |
| 목록에 있는데 파일이 없음, 파일 크기·형식이 기록과 다름 | `check-assets` 실패 |
| 게임 데이터가 부르는 그림이 목록에 없음 | 게임은 자리표시 그림을 쓰고, `check-assets`는 실패한다 |

## 5. 낭송 조각

| | |
| --- | --- |
| 쓰는 쪽 | 게임의 소리 엔진 |
| 자리 | 향가 `assets/audio/voice/<노래 id>/<구>.mp3`, 고려가요 `…/<연>-<줄>-<음보>.mp3`, 나머지 `…/<단위>-<음보>.mp3`(번호는 0부터) |
| 내용 | 그 음보(향가는 구)의 '오늘 소리'를 읽은 MP3. 길이는 그 노래 박자 칸(60 / `tempo`초)에 여유 0.005초를 더한 것 이하(`check-voice`가 지킴). 노래의 빠르기는 가장 긴 조각이 칸의 92%에 들도록 정한 값이라 실제 조각은 대개 그보다 짧다 |
| 생성 기록 | `assets/audio/voice/manifest.json`(게임은 읽지 않음. 점검과 글 확인 문서가 읽음) |

| 오류 상황 | 결과 |
| --- | --- |
| 조각 파일이 없음 | 그 박 자리에 딸깍 소리, `audio:missing` 사건(경로마다 한 번) |
| 조각이 박자 칸(+0.005초)보다 김 | `check-voice` 실패. 그 노래를 `--write-tempo`로 다시 만든다 |
