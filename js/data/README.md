# 데이터와 모듈 약속 (계약 문서)

이 문서는 **데이터 형식과 모듈 사이 약속의 유일한 기준**이다. 동작의 기준은 `spec.md`이고, 이 문서는 그 동작을 코드로 옮길 때 모두가 같은 모양을 쓰도록 정한다.

- 기계가 읽는 사본: `js/data/wings.js`(관·갈래·고유 동작), `js/data/concepts.js`(개념·향유층 무리), `js/data/song-table.js`(노래 id·노래 표·행선지 결과). 이 문서와 그 파일이 다르면 둘 다 고쳐 맞춘다.
- 약속을 코드로 옮긴 도우미: `js/core/song-shape.js`(글자 수 세기, 낭송 조각 경로, 감정서 계산), `js/core/validate.js`(검증기).
- 점검: `node tests/check-data.mjs`, `node tests/check-rights.mjs`.
- 새 필드, 새 사건 이름, 새 값이 필요하면 혼자 정하지 말고 작업 보고에 적는다. 연결 단계가 이 문서에 더한다.

번호는 따로 말이 없으면 **0부터** 센다(9구 = `unit: 8`). 화면에 보일 때만 1부터 센다.

---

## 1. 갈래와 관 설정

### 1.1 갈래 (`GENRES`)

| 갈래 id | 이름 | 단위 종류 | 단위 이름 |
| --- | --- | --- | --- |
| `hyangga` | 향가 | `gu` | 구 |
| `goryeo` | 고려가요 | `stanza` | 연 |
| `sijo` | 시조 | `jang` | 장 |
| `gasa` | 가사 | `haeng` | 행 |
| `saseol` | 사설시조 | `jang` | 장 |

### 1.2 관 (`WINGS`, spec 3.1)

| 순서 | 관 id | 이름 | 갈래 id | 고유 동작 id | 고유 동작 이름 |
| --- | --- | --- | --- | --- | --- |
| 0 | `entrance` | 입구 | — | — (튜토리얼은 `stairs`를 씀) | — |
| 1 | `hyangga` | 향가관 | `hyangga` | `aa-door` | '아아' 문 열기 |
| 2 | `goryeo` | 고려가요관 | `goryeo` | `refrain-link` | 후렴 고리 걸기 |
| 3 | `sijo` | 시조관 | `sijo` | `stairs` | 계단 오르기 |
| 4 | `gasa` | 가사관 | `gasa` | `walk` | 걷기 |
| 5 | `saseol` | 사설시조관 | `saseol` | `rapid-unroll` | 연타로 풀기 |

- 판을 하는 관 다섯의 id는 갈래 id와 같다.
- 보스전은 관이 아니다. 노래의 `roles`에서 낯선 노래의 자리를 적을 때만 자리 id `boss`를 쓴다.

---

## 2. 개념과 향유층 무리

### 2.1 개념 (`CONCEPTS`, spec 7.1)

사서 일지에 이 문장 그대로 보인다(교사 확인 대상).

| id | 갈래 | 문장 |
| --- | --- | --- |
| `hyangga-lines` | 향가 | 향가는 4구, 8구, 10구로 자란다 |
| `hyangga-442` | 향가 | 10구체는 4구·4구·2구로 나뉜다 |
| `hyangga-exclaim` | 향가 | 10구체 마지막 무리의 첫머리에 '아아' 같은 감탄사가 온다 |
| `goryeo-stanza` | 고려가요 | 대부분 여러 연으로 나뉜다 |
| `goryeo-refrain` | 고려가요 | 후렴구나 여음(뜻 없는 소리)이 들어간다 |
| `goryeo-3beat` | 고려가요 | 한 줄이 세 음보로 읽힌다 |
| `sijo-3jang` | 시조 | 초장·중장·종장, 세 장이다 |
| `sijo-4beat` | 시조 | 장마다 네 음보다 |
| `sijo-final3` | 시조 | 종장 첫 음보는 세 글자다 |
| `gasa-4beat` | 가사 | 네 음보가 끊이지 않고 이어진다 |
| `gasa-nolimit` | 가사 | 행의 수가 정해져 있지 않다 |
| `saseol-middle` | 사설시조 | 초장이나 중장이 길게 늘어난다 |
| `saseol-frame` | 사설시조 | 종장은 시조처럼 세 글자로 시작한다 |

개념 상태 값: `none` → `pencil` → `ink` (되돌아가지 않는다).

### 2.2 향유층 무리 (`SINGER_GROUPS`, spec 10.2)

엔딩의 가객 행렬도 이 순서로 지나간다.

| id | 이름 |
| --- | --- |
| `monk-hwarang` | 승려·화랑 |
| `court-goryeo` | 궁중·고려 백성 |
| `literati-gisaeng` | 사대부·기녀 |
| `literati-women` | 사대부·규방 여성 |
| `singer-commoner` | 가객·서민 |

### 2.3 향유층 (`SINGER_CLASSES`, 노래 `singer.class`)

`승려` · `화랑` · `민간` · `궁중` · `고려 백성` · `사대부` · `기녀` · `규방 여성` · `가객` · `서민`

---

## 3. 노래 id 목록과 노래 표

### 3.1 노래 id 목록 (모두 45편)

노래 글 작업은 **이 id만** 쓴다. 제목은 「」 없이 이 표 그대로 `title`에 쓰고, '발췌'가 있는 노래는 같은 글을 `excerpt`에 쓴다.

| 갈래 | id | 제목 | 발췌 |
| --- | --- | --- | --- |
| 시조 | `taesan` | 태산이 높다 하되 | |
| 향가 | `seodongyo` | 서동요 | |
| 향가 | `cheoyongga` | 처용가 | |
| 향가 | `chan-giparangga` | 찬기파랑가 | |
| 향가 | `jemangmaega` | 제망매가 | |
| 향가 | `heonhwaga` | 헌화가 | |
| 향가 | `mojukjirangga` | 모죽지랑가 | |
| 향가 | `anminga` | 안민가 | |
| 향가 | `wonwangsaengga` | 원왕생가 | |
| 고려가요 | `cheongsan-byeolgok` | 청산별곡 | |
| 고려가요 | `seogyeong-byeolgok` | 서경별곡 | |
| 고려가요 | `gasiri` | 가시리 | |
| 고려가요 | `jeongseokga` | 정석가 | |
| 고려가요 | `dongdong` | 동동 | 두 달치 |
| 고려가요 | `sangjeoga` | 상저가 | |
| 고려가요 | `jeongeupsa` | 정읍사 | |
| 고려가요 | `samogok` | 사모곡 | |
| 시조 | `cheongsanri-byeokgyesu` | 청산리 벽계수야 | |
| 시조 | `dongjitdal` | 동짓달 기나긴 밤을 | |
| 시조 | `ireondeul` | 이런들 어떠하며 | |
| 시조 | `imomi-jukgo` | 이 몸이 죽고 죽어 | |
| 시조 | `simnyeon-gyeongyeong` | 십 년을 경영하여 | |
| 시조 | `ihwa-wolbaek` | 이화에 월백하고 | |
| 시조 | `hanson-makdae` | 한 손에 막대 잡고 | |
| 시조 | `sakpung` | 삭풍은 나무 끝을 불고 | |
| 시조 | `obaengnyeon-doeupji` | 오백 년 도읍지를 | |
| 시조 | `eojeo-nae-iriyeo` | 어져 내 일이여 | |
| 시조 | `sinheum-sijo` | (출제 원문 확인 뒤 정함) 신흠의 한 수, 2021학년도 수능 | |
| 가사 | `myeonangjeongga` | 면앙정가 | 첫 대목 |
| 가사 | `gwandong-byeolgok` | 관동별곡 | 첫 대목 |
| 가사 | `gyuwonga` | 규원가 | |
| 가사 | `sangchungok` | 상춘곡 | |
| 가사 | `samiingok` | 사미인곡 | 첫 대목 |
| 가사 | `seonsangtan` | 선상탄 | |
| 가사 | `songmiingok` | 속미인곡 | 첫 대목 |
| 가사 | `nuhangsa` | 누항사 | 한 대목 |
| 가사 | `gapminga` | 갑민가 | 한 대목 |
| 사설시조 | `chang-naegoja` | 창 내고쟈 | |
| 사설시조 | `namodo-bahi` | 나모도 바히 돌도 | |
| 사설시조 | `daekdeul-dongnanji` | 댁들에 동난지이 사오 | |
| 사설시조 | `nimi-oma` | 님이 오마 하거늘 | |
| 사설시조 | `gwitturami` | 귀뚜라미 저 귀뚜라미 | |
| 사설시조 | `nonbat-gara` | 논밭 갈아 김매고 | |
| 사설시조 | `hansuma` | 한숨아 세한숨아 | |
| 사설시조 | `suneung-saseol` | (출제 원문 확인 뒤 정함) 2025·2026학년도 수능 출제작 한 편 | |

- `sinheum-sijo`와 `suneung-saseol`은 아직 어느 작품인지 정하지 않은 자리다(spec 4.2). 표에는 `title: null`과 `pendingSelection`으로 적혀 있고, 노래 글 작업이 출제 원문을 확인해 고른 작품의 제목을 데이터 `title`에 쓴다. id는 그대로 둔다.
- 「갑민가」와 「누항사」의 '한 대목', 첫 대목들의 범위는 spec 4.2의 발췌 규칙(교과서 수록 범위, 수능은 출제 지문 범위)을 따른다.

### 3.2 노래 표 (spec 4.2, `WING_TABLE`·`BOSS_TABLE`)

| 관 | 칸 (세 편) | 길 잃은 노래 → 도착할 관 | 작품 방 | 덤 |
| --- | --- | --- | --- | --- |
| 입구 | 튜토리얼 `taesan` | — | — | — |
| 향가관 | 4구 층 `seodongyo`, 8구 층 `cheoyongga`, 10구 층 `chan-giparangga` | `gasiri` → `goryeo`, `cheongsanri-byeokgyesu` → `sijo` | `jemangmaega` | `heonhwaga`, `mojukjirangga`, `anminga` |
| 고려가요관 | `cheongsan-byeolgok`, `seogyeong-byeolgok`, `gasiri` | `dongjitdal` → `sijo`, `myeonangjeongga` → `gasa` | `jeongseokga` | `dongdong`, `sangjeoga`, `jeongeupsa` |
| 시조관 | `dongjitdal`, `ireondeul`, `imomi-jukgo` | `chang-naegoja` → `saseol`, `gwandong-byeolgok` → `gasa` | `simnyeon-gyeongyeong` | `ihwa-wolbaek`, `hanson-makdae`, `sakpung` |
| 가사관 | `myeonangjeongga`, `gwandong-byeolgok`, `gyuwonga` | `daekdeul-dongnanji` → `saseol`, `obaengnyeon-doeupji` → `sijo` | `sangchungok` | `samiingok`, `seonsangtan`, `songmiingok` |
| 사설시조관 | `namodo-bahi`, `daekdeul-dongnanji`, `chang-naegoja` | `nuhangsa` → `gasa`, `eojeo-nae-iriyeo` → `sijo` | `nimi-oma` | `gwitturami`, `nonbat-gara`, `hansuma` |
| 보스전 | 향가 `wonwangsaengga`, 고려가요 `samogok`, 시조 `sinheum-sijo`, 가사 `gapminga`, 사설시조 `suneung-saseol` | — | — | — |

- 향가관의 칸은 층이다. `shelfFloors: [4, 8, 10]`이 `shelf`와 같은 순서로 층의 구 수를 적는다. 층 노래의 구 수는 그 층과 같아야 한다.
- 보스 1단계 기본 순서(`unseenOrder`): `gasa` → `hyangga` → `goryeo` → `sijo` → `saseol`. 조정할 수 있지만 시조와 사설시조가 마지막 짝인 것은 고정이다.
- 보스 3단계 노래(`stage3SongId`)는 튜토리얼 노래 `taesan`이다. 보스를 마치면 시조관 '선대 사서의 자리'에 꽂힌다.

### 3.3 행선지 결과 (spec 4.3, `ROUTING`)

규칙: 길 잃은 노래가 바구니 판정을 통과했을 때, 도착할 관이 지금 관보다 뒤(아직 마치지 않은 관)이고 그 노래가 그 관의 칸 노래면 **미리 잰 대기**(`prewait`), 그 밖은 **돌아온 노래 선반**(`returned`)이다. 관은 순서대로만 열리므로 결과는 미리 정해진다. 검증기가 규칙으로 다시 계산해 아래 목록과 맞춰 본다.

| 관 | 미리 잰 상태로 기다리는 노래 | 돌아온 노래 선반 |
| --- | --- | --- |
| 고려가요관 | `gasiri` | |
| 시조관 | `dongjitdal` | `cheongsanri-byeokgyesu`, `obaengnyeon-doeupji`, `eojeo-nae-iriyeo` |
| 가사관 | `myeonangjeongga`, `gwandong-byeolgok` | `nuhangsa` |
| 사설시조관 | `chang-naegoja`, `daekdeul-dongnanji` | |

---

## 4. 노래 데이터 형식 (spec 4.4)

### 4.1 파일과 내보내기

- 갈래마다 파일 하나: `js/data/songs/<갈래 id>.js`. 그 갈래의 노래만 담는다.

  ```js
  // js/data/songs/sijo.js
  export const songs = [ /* 노래 객체 … */ ];
  ```

- 『분류 수첩』 쪽: `js/data/notebook-<갈래 id>.js`.

  ```js
  // js/data/notebook-sijo.js
  export const notebookPage = {
    genre: 'sijo',            // 파일의 갈래 id
    name: '시조',             // 쪽 제목
    body: ['문단', '문단'],    // 선대 사서의 갈래 설명(교사 확인 대상)
    lines: [                  // 오답 도움에서 반짝이는 줄(spec 6.4)
      { id: 'sijo-shape', conceptIds: ['sijo-3jang', 'sijo-4beat'], text: '…' },
    ],
  };
  ```

  `lines[].conceptIds`는 그 갈래의 개념 id만 쓴다. 오답이 난 노래의 갈래 쪽에서 관련 개념을 가진 줄이 반짝인다.

- 등록은 연결 단계가 `js/data/songs/index.js`에서 한다(`songs` 배열에 이어 붙이고 `notebook[갈래 id] = notebookPage`). 등록 전에도 `tests/check-data.mjs`는 갈래별 파일을 직접 읽어 검사한다.

### 4.2 필드

| 필드 | 필수 | 값 |
| --- | --- | --- |
| `id` | 예 | 3.1 목록의 id(영문 소문자·숫자와 하이픈) |
| `title` | 예 | 「」 없이 쓴 제목. 노래 표의 제목과 같아야 한다 |
| `excerpt` | 발췌일 때 | '첫 대목', '한 대목', '두 달치'. 노래 표와 같아야 하고, 발췌가 아니면 쓰지 않는다 |
| `genre` | 예 | `hyangga` · `goryeo` · `sijo` · `gasa` · `saseol` |
| `singer` | 예 | `{ name, class, traditional? }` (4.6) |
| `sourceType` | 예 | `textbook-common2` · `textbook-literature` · `old-text` · `exam` |
| `citation` | 예 | 출처 문구(spec 16). 교과서는 "고등학교 공통국어2 교과서 수록본"처럼 출판사 이름 없이. 해독·풀이를 빌렸으면 학자와 책 |
| `citationNote` | 아니요 | 제작 메모(화면에 안 보임). 보스 낯선 노래의 `singerGroups` 근거, 발췌 범위 근거 등 |
| `verification` | 예 | `verified` 또는 `pending` |
| `decipherment` | 향가만 | `{ scholar, book }` — 해독한 학자와 책. 구마다의 해독문은 `units[].decipherment` |
| `units` | 예 | 형식 단위 목록(4.3). 원문·오늘 소리·풀이는 모두 단위 안에 둔다 |
| `features` | 예 | 형식 증거 표시(4.4). 없으면 `{}` |
| `evidences` | 예 | 판정을 통과할 때 확인해 주는 개념 id 목록(4.5) |
| `singerGroups` | 낯선 노래만 | 보스 '누가 불렀을까'에서 정답으로 인정하는 무리 id 목록(2.2). 하나 이상, 겹치지 않게 |
| `keepsake` | 예 | `{ name, word, phrase, classLine }` (4.7) |
| `legend` | 아니요 | 설화에 바탕한 장면이 있으면 `true`. 화면에 '전해지는 이야기'로 표시한다 |
| `roles` | 예 | 관 id와 역할의 짝 목록(4.8) |
| `tempo` | 아니요 | 낭송 빠르기(1분당 박 수). 없으면 소리 엔진의 기본값 |
| `cardNote` | 아니요 | 기념품·판 카드에 덧붙이는 한 줄. 예: 「정읍사」의 '백제 노래, 고려 궁중에서 불리며 여음이 붙어 전해짐' |

이 밖의 필드는 쓰지 않는다(검증기가 막는다).

**spec 4.4의 `original`·`reading`·`gloss`는 어디에?** 단위와 글이 어긋나지 않도록 모두 `units` 안에 둔다. 노래 전체 글이 필요하면 `songText(song, 'original' | 'reading' | 'gloss' | 'decipherment')`(`js/core/song-shape.js`)로 이어 붙인다.

- `original`: 화면에 보이는 원문. 옛 표기 그대로이고, 향가는 향찰이다.
- `reading`: 낭송용 '오늘 소리' 표기. 원문을 오늘날 발음대로 옮겨 적는다. 낭송 조각은 이 글로 만든다.
- `gloss`: 현대어 풀이.

### 4.3 단위 (`units`)

음보 하나는 `{ original, reading }`이다(둘 다 비어 있지 않은 글).

**향가 — 구(`gu`)**: 음보가 없다. 구마다 한 조각으로 낭송하고, 두드리기도 구마다 한다.

```js
{ original: '향찰', decipherment: '해독문(학자 표기)', reading: '오늘 소리(해독문 기준)', gloss: '풀이' }
```

**고려가요 — 연(`stanza`)**: 연 안에 줄이 있고, 음보는 줄마다 적는다. 두드리기는 줄 단위로 한다.

```js
{ lines: [ { feet: [ { original, reading }, … ], gloss: '이 줄의 풀이' }, … ] }
```

**시조·사설시조 — 장(`jang`), 가사 — 행(`haeng`)**

```js
{ feet: [ { original, reading }, … ], gloss: '이 장(행)의 풀이' }
```

### 4.4 형식 증거 (`features`)

갈래마다 쓸 수 있는 열쇠가 정해져 있다. 다른 열쇠는 쓰지 않는다.

| 갈래 | 열쇠 | 값 |
| --- | --- | --- |
| 향가 | `grouping` | 10구체만, 반드시 `[4, 4, 2]`(4·4·2 무리 나눔) |
| 향가 | `exclamation` | 10구체만, 있으면 `{ unit: 8, text }`. 마지막 무리 첫머리(9구)의 감탄사. `text`는 그 구 `reading`의 첫머리와 같아야 한다(예: `'아아'`) |
| 고려가요 | `refrains` | 하나 이상. `[{ kind: 'refrain' \| 'yeoeum', text, ranges: [{ unit, line, from, to }] }]`. 후렴구(`refrain`)나 여음(`yeoeum`, 뜻 없는 소리) 한 가지마다 항목 하나, 그것이 나오는 자리마다 구간 하나. `from`·`to`는 그 줄의 음보 번호(둘 다 포함) |
| 시조 | `finalFirstFoot` | `{ syllables: 3 }` — 종장 첫 음보 글자 수. 데이터에서 센 값과 같아야 한다 |
| 사설시조 | `finalFirstFoot` | 시조와 같다 |
| 사설시조 | `stretched` | 4음보보다 긴 장의 번호 목록(오름차순). 예: 중장만 늘어났으면 `[1]` |
| 가사 | (없음) | `{}` |

글자 수는 **종장 첫 음보의 `reading`**으로 센다. 완성형 한글, 한자, 옛한글 첫소리 자모를 한 글자로 친다(`syllableCount`).

### 4.5 형식 규칙과 증거 개념 (`evidences`)

**갈래 형식 규칙**(spec 4.4, 검증기 `FORM`)

- 시조: 3장, 장마다 4음보, 종장 첫 음보 3음절
- 사설시조: 3장, 종장 첫 음보 3음절, 초장이나 중장 가운데 하나 이상이 4음보보다 길다
- 향가: 4구, 8구, 10구 가운데 하나. 구마다 `original`·`decipherment`·`reading`·`gloss`
- 고려가요: 연 하나 이상, 연마다 줄 하나 이상, 줄마다 음보 표시와 `gloss`. 후렴·여음 구간 하나 이상
- 가사: 행 넷 이상, 4음보 행이 80% 이상(`GASA_FOUR_FOOT_MIN_RATIO`, 조정 가능)

**`evidences`는 features·units에서 나오는 개념의 부분집합**이어야 한다(검증기 `EVIDENCE`, `deriveConcepts`). 비어 있으면 안 되고, 자기 갈래 개념만 쓴다. 각 개념이 나오는 조건은 다음과 같다.

| 개념 | 나오는 조건 |
| --- | --- |
| `hyangga-lines` | 구 수가 4·8·10 가운데 하나 |
| `hyangga-442` | 10구이고 `grouping`이 `[4,4,2]` |
| `hyangga-exclaim` | 위 조건에 더해 `exclamation`이 `{ unit: 8 }`이고 9구 `reading`이 그 글자로 시작 |
| `goryeo-stanza` | 연이 둘 이상 |
| `goryeo-refrain` | `refrains`가 하나 이상 |
| `goryeo-3beat` | 모든 줄 가운데 3음보 줄이 80% 이상(`GORYEO_THREE_FOOT_MIN_RATIO`, 조정 가능) |
| `sijo-3jang` | 3장 |
| `sijo-4beat` | 3장이고 장마다 4음보 |
| `sijo-final3` | 3장이고 종장 첫 음보 3음절 |
| `gasa-nolimit` | 행이 넷 이상 |
| `gasa-4beat` | 행이 넷 이상이고 4음보 행이 80% 이상 |
| `saseol-middle` | 3장이고 초장이나 중장이 4음보보다 김 |
| `saseol-frame` | 3장이고 종장 첫 음보 3음절 |

형식이 틀린 노래는 `FORM` 오류만 먼저 보이고, 형식을 고친 뒤에 `EVIDENCE`를 본다.

**먹 가능성**(spec 7.3, 검증기 `INK`): 개념마다 **반드시 지나는 길**(튜토리얼, 칸, 길 잃은 노래, 작품 방)의 서로 다른 노래 두 편 이상이 그 개념을 `evidences`에 가져야 한다. 덤과 보스 노래는 세지 않는다. 그래서 노래 글 작업은 나올 수 있는 개념을 빠뜨리지 않고 적는 것이 좋다.

### 4.6 가객 (`singer`)

```js
{ name: '황진이', class: '기녀' }
{ name: '이름 모를 고려 백성', class: '고려 백성' }
{ name: '허난설헌', class: '규방 여성', traditional: true }   // 전해지는 귀속(예: 「규원가」)
```

- 이름이 없으면 `name`을 '이름 모를 ~'로 쓴다.
- `class`는 2.3의 향유층 가운데 하나다.

### 4.7 기념품 (`keepsake`)

```js
{ name: '춘풍 이불', word: '니불', phrase: '春風 니불 아레', classLine: '향유층 한 줄(갈래 수준의 사실만)' }
```

- `name`: 카드에 보이는 물건 이름.
- `word`: 노래 글에 **실제로 나오는 그대로의** 물건 낱말. 원문(향가는 해독문 포함)이나 풀이에 있어야 한다.
- `phrase`: 그 물건이 나오는 구절. `word`를 품고, 노래 글(원문·해독문·오늘 소리·풀이) 어딘가에 그대로 있어야 한다.
- 비교할 때 공백은 무시한다. 인물 전기에 기댄 물건은 쓰지 않는다(spec 8).

### 4.8 역할 (`roles`)

```js
[{ wing: 'goryeo', role: 'stray', to: 'sijo' }, { wing: 'sijo', role: 'shelf' }]
```

| 역할 | `wing` | 덧붙임 |
| --- | --- | --- |
| `tutorial` | `entrance` | |
| `shelf` | 관 id | 향가관 층은 노래 표의 `shelfFloors`로 정해지므로 적지 않는다 |
| `stray` | 섞여 든 관 id | `to`: 도착할 관 id |
| `room` | 관 id | |
| `bonus` | 관 id | |
| `unseen` | `boss` | `singerGroups` 필수 |

`roles`는 노래 표가 정하는 역할과 **정확히 같아야** 한다(순서는 상관없다).

### 4.9 예시 노래

아래는 **형식을 보이기 위한 예시**다. 글자는 대조 전이고 게임 데이터가 아니다. 실제 글과 출처는 시조 노래 글 작업이 교과서나 옛 문헌에서 옮겨 적는다. `tests/check-data.mjs`가 이 예시를 검증기에 넣어 문서와 검증기가 어긋나지 않는지 확인한다.

```json example-song
{
  "id": "dongjitdal",
  "title": "동짓달 기나긴 밤을",
  "genre": "sijo",
  "singer": { "name": "황진이", "class": "기녀" },
  "sourceType": "old-text",
  "citation": "(예시) 옛 가집 원문. 실제 출처 문구는 노래 글 작업이 적는다",
  "verification": "pending",
  "units": [
    {
      "feet": [
        { "original": "동지ㅅ달", "reading": "동짓달" },
        { "original": "기나긴 밤을", "reading": "기나긴 밤을" },
        { "original": "한 허리를", "reading": "한 허리를" },
        { "original": "버혀 내여", "reading": "버혀 내어" }
      ],
      "gloss": "(예시 풀이) 동짓달 긴긴밤의 한가운데를 베어 내어"
    },
    {
      "feet": [
        { "original": "春風", "reading": "춘풍" },
        { "original": "니불 아레", "reading": "니불 아래" },
        { "original": "서리서리", "reading": "서리서리" },
        { "original": "너헛다가", "reading": "너헛다가" }
      ],
      "gloss": "(예시 풀이) 봄바람처럼 따뜻한 이불 아래에 굽이굽이 서려 넣어 두었다가"
    },
    {
      "feet": [
        { "original": "어론 님", "reading": "어른 님" },
        { "original": "오신 날 밤이여든", "reading": "오신 날 밤이거든" },
        { "original": "구뷔구뷔", "reading": "구뷔구뷔" },
        { "original": "펴리라", "reading": "펴리라" }
      ],
      "gloss": "(예시 풀이) 사랑하는 임이 오신 날 밤에 굽이굽이 펴리라"
    }
  ],
  "features": { "finalFirstFoot": { "syllables": 3 } },
  "evidences": ["sijo-3jang", "sijo-4beat", "sijo-final3"],
  "keepsake": {
    "name": "춘풍 이불",
    "word": "니불",
    "phrase": "春風 니불 아레",
    "classLine": "(예시) 시조는 사대부와 기녀가 함께 즐겨 부른 노래였다"
  },
  "legend": false,
  "roles": [
    { "wing": "goryeo", "role": "stray", "to": "sijo" },
    { "wing": "sijo", "role": "shelf" }
  ]
}
```

---

## 5. 리믹스 데이터 (spec 10.2 2단계)

파일 `js/data/remix.js`(보스전 작업이 만든다).

```js
export const remix = {
  fragments: [   // 이 순서대로 이어 붙인다. 조각 다섯, 바뀌는 지점은 조각 사이의 넷
    { genre: 'gasa', songId: 'gyuwonga', from: 0, to: 1 },
    { genre: 'hyangga', songId: 'seodongyo', from: 0, to: 1 },
    // … 갈래마다 하나씩, 모두 다섯
  ],
};
```

- 갈래마다 정확히 한 조각, 모두 다섯이다. 순서는 배열 순서이고 무작위는 없다.
- `songId`는 그 갈래 관의 **칸 노래**여야 한다(배운 노래만 나온다).
- `from`·`to`는 그 노래의 단위 번호(둘 다 포함)다. 향가는 구, 고려가요는 연, 시조·사설시조는 장, 가사는 행이다.
- 바뀌는 지점은 따로 적지 않는다. 조각 `i`의 끝과 조각 `i+1`의 시작 사이가 지점 `i`(0~3)다. 지점의 시각은 소리 엔진이 낭송 조각 배치에서 계산한다.

---

## 6. 재기의 증거 (감정서)

재기는 노래가 실제로 가진 모양대로 이끌기 때문에, 다 잰 감정서는 언제나 노래 데이터에서 계산한 값과 같다. 계산 함수는 `js/core/song-shape.js`에 있고, 재기 화면은 같은 모양의 객체를 만들어야 한다.

```js
// deriveSheet(song, actionId)
{
  songId: 'dongjitdal',
  fold: { units: 3 },                                 // 접기: 단위 수
  tap: { mode: 'feet', feet: [4, 4, 4] },             // 두드리기·빗금(같은 증거)
  action: { action: 'stairs', applicable: true, syllables: 3 },
}
```

**두드리기 증거 `tap`**
- 향가: `{ mode: 'gu', gu: 10 }` (구 수)
- 고려가요: `{ mode: 'lines', feet: [[3,3,3], [3,3,3]] }` (연마다 줄마다 음보 수)
- 나머지: `{ mode: 'feet', feet: [4, 4, 4] }` (단위마다 음보 수)

**고유 동작 증거 `action`** — `applicable: false`가 '해당 없음'이고, 그것도 증거다(spec 5.4).

| 동작 | 증거 | 예 |
| --- | --- | --- |
| `aa-door` | `{ action, applicable: true, present, unit }` — 감탄사가 있다/없다, 있으면 그 구 번호 | `{ present: true, unit: 8 }` |
| `refrain-link` | `{ action, applicable: true, present, ranges }` — 후렴이 있다(구간 목록)/없다 | `{ present: false, ranges: [] }` |
| `stairs` | `{ action, applicable, syllables }` — 종장 첫 음보 글자 수. 장 갈래가 아니면 `applicable: false`(종장 없음), `syllables: null` | `{ applicable: true, syllables: 3 }` |
| `walk` | `{ action, applicable: true, steps, stopsAtThree }` — 걸은 단위 수, 세 단위에서 멈추는지 | `{ steps: 12, stopsAtThree: false }` |
| `rapid-unroll` | `{ action, applicable, middleFeet, overFour }` — 3장 갈래의 가운데 장 음보 수와 4음보를 넘는지. 3장 갈래가 아니면 `applicable: false` | `{ applicable: true, middleFeet: 9, overFour: true }` |

미리 잰 노래(spec 4.3)는 바구니를 보낸 관의 고유 동작으로 잰 감정서를 그대로 들고 온다.

---

## 7. 모듈 약속

### 7.1 관 모형 — `js/world/wings/<관 id>.js`

```js
export function create3D(ctx) { … return handle; }
export function create2D(ctx) { … return handle; }
```

**3D `ctx`**
| 열쇠 | 뜻 |
| --- | --- |
| `THREE` | Three.js 모듈 |
| `root` | 모형을 붙일 `THREE.Group`. 원점은 관 바닥 가운데, 1 = 1m, +y 위, +z 카메라 쪽 |
| `wing` | `WINGS`의 그 관 항목 |
| `assets` | `{ texture(name) → THREE.Texture \| null, image(name) → 주소 \| null }`. 없으면 자리표시 무늬를 쓴다 |
| `restored` | 단청색이 이미 돌아왔는지(마친 관에 다시 들어올 때 `true`) |
| `reduceMotion()` | 움직임 줄이기 상태(부를 때마다 지금 값) |

**2D `ctx`**: `root` 대신 `container`(모형이 채울 HTML 요소, 16:9)이고, `THREE`는 없다. 나머지는 같다.

**돌려주는 `handle`**
| 열쇠 | 뜻 |
| --- | --- |
| `react(eventName, detail)` | 8.1의 `diorama:*` 사건을 받아 연출한다. 모르는 사건은 조용히 넘긴다 |
| `update(dt)` | (선택) 프레임마다 부른다. `dt`는 초 |
| `dispose()` | 만든 것을 모두 치운다 |
| `anchors` | 상호작용 자리. 3D는 `root` 기준 `THREE.Vector3`, 2D는 `container` 기준 백분율 `{ x, y }` |

`anchors` 열쇠: `slots`(칸 자리 셋, 향가관은 4·8·10구 층 순), `bonus`(덤 자리 셋), `basket`, `returnedShelf`, `roomDoor`, `entrance`(미리 잰 노래가 기다리는 자리), `nextDoor`, `camera`(`{ position, target }`, 2D는 없음), 시조관만 `mentorSeat`(선대 사서의 자리).

세계 바탕(T4)이 사건 버스의 `diorama:*` 사건을 받아 지금 관 모형의 `react`로 넘긴다. 모형은 사건 버스를 직접 듣지 않는다.

### 7.2 고유 동작 — `js/measure/actions/<동작 id>.js`

```js
export function start(ctx) { … return Promise<evidence>; }
```

- `ctx`: `{ song, container, noBeat, rhythm, signal }` — `container`는 오른쪽 두루마리 패널, `noBeat`은 박자 없는 방식(소리 끔·빗금 모드), `rhythm`은 소리·박자 엔진 손잡이, `signal`은 중단 신호(`AbortSignal`, 회전 멈춤이나 나가기).
- 결과는 6절의 `action` 증거 객체이고, `deriveActionEvidence(동작 id, song)`과 같아야 한다.
- 다른 갈래의 노래도 지금 관의 동작으로 잰다. 해당 없으면 `applicable: false`로 끝낸다.
- 동작 중에는 8.1의 반응 사건을 낸다.

### 7.3 작품 방 — `js/rooms/<관 id>.js`

```js
export function start(ctx) { … return Promise<{ completed: true, record }>; }
```

- `ctx`: `{ song, container, mode: '3d' | '2d', three?, noBeat, reduceMotion, rhythm, signal }` — `three`는 3D일 때 `{ THREE, root, camera }`. `signal`이 중단되면 Promise는 `AbortError`로 끝나고, 방은 다음에 처음부터 다시 한다(spec 20).
- 방이 쓰는 글(해석 문장, 조건 카드, 시어, 후보)은 `js/data/rooms-<관 id>.js`에 둔다(교사 확인 대상). 아래 `…Id`는 그 파일에서 정한 id다.
- `record`는 결과 카드와 저장에 그대로 들어간다(spec 9). 해석은 채점하지 않으므로 정답 여부를 담지 않는다.

| 관 | 방 | `record` |
| --- | --- | --- |
| `hyangga` | 「제망매가」 | `{ room: 'hyangga', interpretationId, interpretationText, isInterpretation: true }` |
| `goryeo` | 「정석가」 | `{ room: 'goryeo', lastConditionId, lastConditionText }` |
| `sijo` | 「십 년을 경영하여」 | `{ room: 'sijo', rooms: [물건 id ×3], outside: [물건 id …], interpretationId, interpretationText, isInterpretation: true }` |
| `gasa` | 「상춘곡」 | `{ room: 'gasa', words: [모은 시어 …] }` |
| `saseol` | 「님이 오마 하거늘」 | `{ room: 'saseol', predictionId: 'nim' \| 'other-person' \| 'jujuri-samdae', predictionText }` |

「십 년을 경영하여」의 물건 id: `na`(나), `dal`(달), `cheongpung`(청풍), `gangsan`(강산), `gold`(금붙이), `robe`(관복), `guest`(손님).

### 7.4 화면 — `show(container, ctx)`

```js
export function show(container, ctx = {}) { … return { dispose() }; }
```

- `container`는 화면이 채울 HTML 요소다. `ctx`는 `{ go(화면 이름, params), params }`이고 없을 수도 있다(`js/main.js`는 `start` 화면을 `ctx` 없이 연다).
- 화면은 `js/registry.js`의 `screens`에 이름으로 등록한다. `start`(시작 화면)는 정해진 이름이고, 나머지 이름은 만드는 작업이 정해 보고에 적는다.
- 돌려준 `dispose()`는 화면을 떠날 때 부른다.

---

## 8. 사건 (`js/core/events.js`)

`on(name, fn)` / `emit(name, detail)`. 아래 이름만 쓴다.

### 8.1 디오라마 반응 (관 모형의 `react`로 넘어간다)

| 사건 | `detail` | 언제 |
| --- | --- | --- |
| `diorama:fold` | `{ unit }` | 접기에서 실제 경계가 접힘 |
| `diorama:pillar-light` | `{ unit, line, foot }` (`line`은 고려가요만, 향가는 `foot: null`) | 두드리기·빗금에서 박 하나 인정 → 기둥 불 |
| `diorama:floor-fill` | `{ gu }` (지금까지 센 구 수) | 향가 구를 셀 때 탑 층이 차오름 |
| `diorama:aa-door` | `{ present, unit }` | '아아' 문 열기 결과 |
| `diorama:stair-step` | `{ step, total }` (`step`은 1부터) | 계단 오르기 한 칸 |
| `diorama:refrain-link` | `{ from: { unit, line }, to: { unit, line } }` | 후렴 고리 하나 걸림 |
| `diorama:walk-step` | `{ step }` (걸은 단위 수, 1부터) | 걷기 한 걸음 |
| `diorama:unroll` | `{ unit, feet }` (지금까지 풀린 음보 수) | 연타로 풀기 |
| `diorama:slot-set` | `{ area: 'shelf' \| 'bonus' \| 'basket', index, songId \| null, to? }` | 자리에 꽂거나 뺌(바구니는 `to`) |
| `diorama:shelf-bound` | `{ area: 'shelf' \| 'bonus', songIds }` | 칸·탑·덤이 묶임(제본, 금박) |
| `diorama:pop-out` | `{ area, index, songId, genre }` | 판정에서 틀린 노래가 삐져나옴. `genre`로 모양 차이를 보인다 |
| `diorama:fog-recede` | `{}` | 먹안개가 물러남 |
| `diorama:dancheong-restore` | `{}` | 판을 마쳐 단청색이 돌아옴 |

### 8.2 그 밖의 사건

| 사건 | `detail` | 내는 쪽 → 듣는 쪽 |
| --- | --- | --- |
| `orientation:pause` | `{}` | 화면 → 모두. 세로로 돌림. 모든 진행 중 동작을 멈춘다 |
| `orientation:resume` | `{}` | 화면 → 모두. 가로로 돌아옴. 진행 중이던 단위를 처음부터 |
| `audio:pause` | `{ reason: 'orientation' \| 'hidden' \| 'menu' }` | → 소리 엔진 |
| `audio:resume` | `{ reason }` | → 소리 엔진 |
| `save:failed` | `{ reason: 'unavailable' \| 'quota' \| 'unknown' }` | 저장 → 한 판 화면(한 번 알림) |
| `settings:reduce-motion` | `{ value: boolean }` | 설정 → 모두 |
| `settings:text-scale` | `{ value: 1 \| 1.15 \| 1.3 }` | 설정 → 모두 |
| `rhythm:no-beat` | `{ value: boolean, reason: 'muted' \| 'slash' \| null }` | 소리 엔진 → 재기·방·보스. 박자 없는 방식으로 바뀜/돌아옴 |
| `help:notebook-glow` | `{ wing, genre, conceptIds }` | 진행 엔진 → 수첩. 관 오답이 기준(3) 이상 |
| `help:journal-glow` | `{ stage, conceptIds, songId? }` | 진행 엔진 → 일지. 보스 같은 단계 틀림이 기준(3) 이상 |
| `concept:changed` | `{ conceptId, state, songs }` | 진행 엔진 → 일지·카드. 연필·먹 전환 |
| `wing:state` | `{ wing, state }` | 진행 엔진 → 세계. 관이 열리거나 끝남 |

---

## 9. 저장 형식 (spec 13)

로컬 저장소 열쇠 **하나**: `yetnorae-seogo-v1`. 값은 아래 JSON이다.

```js
{
  version: 1,
  device: {
    volume: { bgm: 0.6, voice: 1, sfx: 0.8 },   // 0~1
    muted: false,               // 소리 끄기(spec 14 접근성)
    slashMode: false,           // 빗금 모드
    textScale: 1,               // 1 | 1.15 | 1.3
    reduceMotion: false,        // 켜거나 브라우저의 움직임 줄이기 선호가 있으면 적용
    calibrationOffsetMs: 0,     // 박자 보정값. 판정할 때 탭 시각에서 뺀다. 건너뛰면 0
    calibrated: false,          // 이 기기에서 이어폰 안내·박자 맞추기 단계를 지났는지(마쳤거나 건너뜀)
  },
  slots: {
    '<기록 id>': {
      id: '<기록 id>',          // 만들 때 정하는 고유 문자열(예: 's-' + 시각 36진수 + 난수)
      name: '별명',             // 앞뒤 공백을 뺀 이름, 1~12자, 기기 안에서 하나뿐
      appearance: 'a',          // 견습 사서 생김새: 'a' | 'b'. 기본 'a'
      createdAt: '2026-10-05T09:00:00.000Z',
      updatedAt: '2026-10-05T09:30:00.000Z',
      progress: { … },          // 아래
    },
  },
  lastSlotId: null,             // 마지막으로 연 기록 id
}
```

- `appearance`: 새 기록을 만들 때 견습 사서의 생김새 둘 가운데 하나를 고른다. `a`는 승인된 화풍 샘플의 생김새, `b`는 성별이 덜 드러나는 생김새다. 기본값은 `a`이고, 게임 속 학생 종이 인형과 결과 카드에 쓰며, 기록 화면에서 나중에 바꿀 수 있다. 그림 이름은 11.2절.

### 9.1 `progress`

```js
{
  tutorialDone: false,          // 입구는 관 상태를 갖지 않는다
  wings: {                      // 판을 하는 관 다섯 모두
    hyangga: {
      state: 'locked',          // 'locked' | 'open' | 'done'
      shelfBound: false,        // 칸(향가관은 탑) 묶음
      basketDone: false,        // 바구니 판정 통과
      roomDone: false,          // 작품 방 완료
      bonusDone: false,         // 덤 칸 묶음
      uniqueActionIntroSeen: false,
      doneAt: null,             // 판을 마친 시각(ISO 문자열)
      placements: {
        shelf: [null, null, null],   // 칸 자리(향가관은 4·8·10구 층 순). null 또는 { songId, fixed }
        basket: [null, null],        // null 또는 { songId, to, fixed }
        bonus: [null, null, null],   // null 또는 { songId, fixed }
      },
      wrongCount: 0,            // 이 관의 오답 수(삐져나온 노래 하나 = 1)
      measured: [],             // 이 관에서 재기를 마친 노래 id(감정서는 데이터에서 다시 계산)
    },
    // goryeo, sijo, gasa, saseol도 같은 모양
  },
  prewaiting: { goryeo: [], sijo: [], gasa: [], saseol: [] },  // 관 id → 미리 잰 상태로 기다리는 노래 id
  returned: { sijo: [], gasa: [] },                            // 관 id → '돌아온 노래' 선반의 노래 id
  concepts: {                   // 개념 13개 모두
    'sijo-3jang': { state: 'none', songs: [] },   // state: 'none' | 'pencil' | 'ink', songs: 확인해 준 서로 다른 노래 id
  },
  keepsakes: [],                // 받은 기념품 카드의 노래 id(받은 순서)
  rooms: { hyangga: null, goryeo: null, sijo: null, gasa: null, saseol: null },  // 작품 방 record(7.3)
  boss: {
    state: 'locked',            // 'locked' | 'stage1' | 'stage2' | 'stage3' | 'done'
    stageWrong: 0,              // 지금 단계에서 틀린 수(일지 도움 기준)
    unseen: {                   // 낯선 노래 다섯 모두
      wonwangsaengga: { done: false, firstTryCorrect: null, journalHelp: false, singerGroupCorrect: null },
    },
  },
  ending: { line: '', wing: null, conceptId: null, note: '', completed: false, completedAt: null },
}
```

- `fixed: true`는 판정을 통과해 고정된 자리다. 판정 전 자리는 `false`이고 자유롭게 빼고 꽂는다.
- 미리 잰 노래가 그 관 칸에 묶이면 `prewaiting`에서 빼지 않아도 된다(묶인 칸이 우선). 엔진이 정한다.
- 결과 카드는 그림을 저장하지 않고 이 기록으로 다시 그린다(spec 12).
- 서고 완성 = `ending.completed`. 시작 화면의 '서고 완성' 표시도 이것을 본다.
- `version`이 다르면 저장 엔진이 처리 경로를 둔다(처리 방식은 저장 엔진 작업이 정한다).

---

## 10. 낭송 조각 이름 (spec 15)

번호는 모두 0부터다. 확장자는 `.mp3`다. `voiceClipPath`·`voiceClips`(`js/core/song-shape.js`)가 이 규칙을 만든다.

| 갈래 | 경로 |
| --- | --- |
| 향가 (구마다 한 조각) | `assets/audio/voice/<노래 id>/<구 번호>.mp3` |
| 고려가요 (줄의 음보마다) | `assets/audio/voice/<노래 id>/<연 번호>-<줄 번호>-<음보 번호>.mp3` |
| 시조·사설시조·가사 (음보마다) | `assets/audio/voice/<노래 id>/<단위 번호>-<음보 번호>.mp3` |

예: 「동짓달」 종장 첫 음보 → `assets/audio/voice/dongjitdal/2-0.mp3`. 조각의 글은 그 음보(향가는 구)의 `reading`이다.

---

## 11. 자산 목록

### 11.1 형식

작업마다 조각 `assets/manifest.parts/<이름>.json`(예: `art.json`, `voice.json`, `audio.json`)을 만들고, 마무리 통합이 `assets/manifest.json`으로 합친다. 둘 다 같은 모양이다.

```json
{
  "version": 1,
  "assets": [
    {
      "path": "assets/img/sprite/student-a.webp",
      "kind": "image",
      "source": "Codex 이미지 생성",
      "generator": "생성 조건 요약(선택)",
      "license": "사용권 문구",
      "commercialUse": true,
      "notes": ""
    }
  ]
}
```

| 열쇠 | 필수 | 값 |
| --- | --- | --- |
| `path` | 예 | 저장소 기준 경로 |
| `kind` | 예 | `image` · `voice` · `bgm` · `sfx` · `font` · `other` |
| `source` | 예 | 어디서 왔는지(원곡·원본, 서비스 이름) |
| `generator` | 아니요 | 만든 도구·설정·요금제 |
| `license` | 예 | 비어 있지 않은 사용권 문구(예: 공공누리 제1유형 출처 문구) |
| `commercialUse` | 예 | 반드시 `true`(spec 19-12) |
| `notes` | 아니요 | 메모 |

`tests/check-rights.mjs`가 `license`가 비어 있지 않고 `commercialUse === true`인지 확인한다.

### 11.2 그림 이름

`assets/img/` 아래, 확장자는 그림 작업이 정한다(`webp` 또는 `png`).

| 그림 | 이름 |
| --- | --- |
| 견습 사서(학생) 종이 인형 — 생김새 둘 | `sprite/student-a`, `sprite/student-b` (저장의 `appearance`와 짝) |
| 선대 사서 | `sprite/mentor` |
| 좀, 좀 대왕 | `sprite/jom`, `sprite/jom-king` |
| 가객 | `sprite/singer-<노래 id>` |
| 관 재질 무늬 | `texture/<관 id>` |
| 2D 그림 판 | `board/<장면 이름>` (예: `board/hyangga`, `board/entrance`) |
| 기념품 | `keepsake/<노래 id>` |
| 카드 장식 | `card/<이름>` |

학생 종이 인형과 결과 카드의 학생 그림은 언제나 두 생김새(`a`·`b`)를 모두 갖춘다.

---

## 12. 검증기와 오류 코드

`node tests/check-data.mjs`가 실제 데이터와 시험용 묶음(`tests/fixtures/`)을 함께 검사한다. 노래가 하나도 없는 갈래는 '아직 없음'으로 넘어가고, 한 편이라도 들어오면 그 갈래의 표 노래가 모두 있어야 하며 모두 올바르고 개념이 먹이 될 수 있어야 한다.

| 코드 | 뜻 |
| --- | --- |
| `FIELD` | 필드가 없거나 값이 약속한 집합 밖 |
| `FORM` | 갈래 형식 규칙 위반 |
| `EVIDENCE` | `evidences`가 features·units에서 나오지 않음 |
| `KEEPSAKE` | 기념품 물건·구절이 노래 글에 없음 |
| `CITATION` | `citation` 또는 `verification` 없음 |
| `TABLE` | 노래가 노래 표와 어긋남(모르는 id, 갈래, 제목, 발췌, 역할, 향가 층) |
| `ROUTING` | 행선지 결과 목록이 규칙과 어긋남 |
| `TABLE_SHAPE` | 노래 표 자체가 spec 4.2의 모양과 어긋남 |
| `MISSING` | 갈래 노래가 들어왔는데 표 노래가 빠짐 |
| `DUPLICATE` | 같은 id의 노래가 둘 이상 |
| `INK` | 반드시 지나는 길만으로 먹이 될 수 없는 개념 |
| `REMIX` | 리믹스 형식 위반 |
| `NOTEBOOK` | 수첩 쪽 형식 위반 |

---

## 추가 제안(T2) — 진행과 기록 엔진

T2가 정한 처리 방식이다. 위 절의 이름과 모양은 바꾸지 않았고, 새 사건 이름도 없다.

### 모듈

| 파일 | 내보내는 것 |
| --- | --- |
| `js/core/save.js` | `SAVE_KEY`, `SAVE_VERSION`, `NAME_LIMITS`, `MIGRATIONS`, `defaultProgress()`, `normalizeData()`, `validateName()`, `createStore({ storage, emit, now, makeId })` |
| `js/core/progress.js` | `TUNABLES`, `createProgress({ progress, songs, table, emit, now, save, tunables })`, `openRecord(store, recordId, opts)` |
| `js/core/judge.js` | `judgeArea`, `routeStray`, `judgeUnseenPlacement`, `judgeSingerGroup`, `judgeRemixTap`, `judgeRemixLine`, `judgeStage3Placement`, `REMIX_TAP_WINDOW_MS` |
| `js/core/cards.js` | `buildWingCard(record, wingId)`, `buildFinalCard(record)` — 판 카드·마지막 카드 자료(점수 없음), 파일 이름 포함 |

- 브라우저에서는 `createStore({ storage: localStorage })`처럼 저장소를 넣는다. 엔진 파일은 `window`·`localStorage`·주소를 직접 읽지 않는다.
- 행동은 모두 `{ ok, reason?, … }`을 돌려준다. 막힌 행동(`ok: false`)은 아무것도 바꾸지 않고 저장하지 않는다.
- 판정 결과의 `returned: [{ index, songId, genre, to? }]`로 화면이 `diorama:pop-out`을 낸다. 디오라마 사건은 엔진이 내지 않는다(엔진은 `wing:state`, `concept:changed`, `help:*`, `save:failed`만 낸다).

### 저장

- 버전이 같으면 읽고, `MIGRATIONS`로 옮길 수 있는 옛 버전은 옮긴다. 읽을 수 없거나 옮길 수 없는 옛 버전은 새로 시작해 다음 저장에서 덮어쓴다. **더 새 버전**은 덮어쓰지 않고 이번 창 메모리로만 진행하며 `save:failed { reason: 'unknown' }`을 낸다.
- `save:failed`는 저장에 실패할 때마다 낸다(알림을 한 번만 보이는 것은 화면 몫). 저장소를 쓸 수 없으면 불러올 때도 낸다. 지금 상태는 `store.failure`로 물을 수 있다.
- 불러올 때 바로잡기: 관 상태는 순서와 표시(`shelfBound`·`basketDone`·`roomDone`)에서 다시 계산한다. 앞 관을 마치지 않았으면 잠기고, 세 표시가 다 있으면 `done`이다. 다섯 관을 마치지 않았으면 보스는 `locked`, 다 마쳤으면 적어도 `stage1`이다. 보스를 마치지 않았으면 `ending.completed`는 `false`다. 개념은 저장된 상태와 노래 수에서 나오는 상태 가운데 높은 쪽이다. **점검 도구가 상태를 넣을 때는 이 표시들을 맞춰 넣는다.**

### 진행

- 다섯 관을 다 마치는 순간 `boss.state`가 `stage1`이 된다(보스가 열림).
- 칸·덤이 묶이면 세 편의 기념품을 `keepsakes`에 더한다. 덤이 묶여도 개념을 확인한다(먹 가능성은 덤 없이도 보장된다).
- 미리 잰 노래는 칸에 묶여도 `prewaiting`에서 빼지 않는다. 입구에서 기다리는 노래는 `waitingAt(관)`으로 묻는다.
- 보스 1단계에서 맞게 꽂은 뒤 '누가 불렀을까'를 고르기 전의 상태, 2단계에서 찾은 지점은 저장하지 않는다. 나갔다 오면 그 노래(2단계)를 다시 한다. `firstTryCorrect`는 처음 꽂을 때 정해지고 바뀌지 않는다.
- 보스 2단계 판정 창 기본값은 지점 앞 500ms, 뒤 1500ms(`REMIX_TAP_WINDOW_MS`, 조정 가능)이고, 탭 시각은 박자 보정값을 뺀 낭송 시각으로 넘긴다.
- 카드의 날짜는 판 카드가 그 관의 `doneAt`, 마지막 카드가 `ending.completedAt`이다.

## 추가 제안(T3)

소리와 박자 엔진(T3)이 쓰는 이름과 약속이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않는다.

### 사건 더하기

| 사건 | `detail` | 내는 쪽 → 듣는 쪽 |
| --- | --- | --- |
| `audio:missing` | `{ path, kind: 'voice' \| 'bgm' \| 'sfx' }` | 소리 엔진 → (알림·점검). 소리 파일을 불러오지 못함. 경로마다 한 번만 낸다. 낭송 조각이 없으면 그 박 자리에 딸깍 소리를 내고 박자 칸은 그대로 간다 |

### 배경음·효과음 파일 이름(T29가 따른다)

| 소리 | 경로 |
| --- | --- |
| 배경음 | `assets/audio/bgm/<이름>.mp3` — 관 id(`hyangga` 등), 그 밖의 장면은 `entrance`, `boss` 같은 이름. 반복 재생한다 |
| 효과음 | `assets/audio/sfx/<이름>.mp3` — `janggu`(장구), `bell`(박자 보정 종), `place`(꽂기), `bind`(제본), `gold`(금박), `basket`(바구니), `fog`(먹안개) |

`janggu`와 `bell` 파일이 없으면 엔진이 합성 소리로 대신한다.

### 박자 칸

- 두드리기·다시 듣기 단위: 향가는 구(박 하나), 고려가요는 줄, 시조·사설시조는 장, 가사는 행.
- 노래에 `tempo`가 없을 때의 기본 빠르기는 `js/core/rhythm.js`의 `DEFAULT_TEMPO`(갈래마다, 조정 가능)다. 단위 사이 쉼은 `SEGMENT_GAP_SEC`.
- 리믹스의 바뀌는 지점 `i`의 시각은 조각 `i+1`의 첫 박이 나오는 때다. 그 앞 `REMIX_WINDOW_MS.before`, 뒤 `REMIX_WINDOW_MS.after` 안의 탭이 맞음이고, 어느 지점 근처도 아닌 탭이 '틀림'이다. 이미 맞힌 지점 근처의 탭은 틀림으로 세지 않는다.

### 소리·박자 손잡이(`ctx.rhythm`)

재기·방·보스가 받는 `rhythm`은 `createAudioEngine()`으로 만든 엔진 하나(앱 전체에 하나)와 `js/core/rhythm.js`의 함수다. 쓰는 차례:

1. `grid = buildGrid(song)` → `session = createTapSession(grid, { offsetMs: device.calibrationOffsetMs })`
2. 단위마다 `await engine.play(grid, [단위], { judge: session }).finished` → `session.close(단위)`. `replay`가 참이면 같은 단위를 다시, `suggestSlash`가 참이면 빗금 모드를 권한다.
3. 탭은 `session.tap(engine.tap(event.timeStamp))`. 멈춘 동안 `engine.tap`은 `null`을 돌려주고 판정은 무시한다.
4. 회전 멈춤(`orientation:pause`)과 재개는 엔진이 스스로 듣는다. 재개하면 진행 중이던 단위를 처음부터 다시 내고 `judge.arm`을 다시 부른다.
5. 첫 조작 전에는 소리 판이 없다. 앱 시작 때 `engine.attachUnlock(document)` 한 번, 저장을 읽은 뒤 `engine.applySettings(device)`.

## 추가 제안(T24)

연결 단계가 확정할 때까지의 제안이다. 위의 정의는 바꾸지 않는다.

### 작품 방 반전 표시 — 장 단위 `reversal` (사설시조 「님이 오마 하거늘」만)

작품 방(spec 9)은 늘어난 중장을 달리다가 반전(주추리 삼대) 바로 앞에서 멈추고 예측을 받는다. 방이 원문을 직접 뒤지지 않도록 노래 데이터의 중장 단위에 반전 자리를 적는다.

```js
// nimi-oma의 units[1] (중장)
{
  feet: [ /* 음보 36개 */ ],
  gloss: '중장 전체 풀이(반전 포함)',
  reversal: {
    fromFoot: 30,          // 반전이 시작되는 음보 번호(0부터). 30 = '上年 七月'. 그 앞 음보(29)는 '흘긧 보니'
    glossBefore: '…',      // 반전 앞(음보 0~29)까지만의 풀이. 예측 전에 보여 줄 수 있는 글
  },
}
```

- `features`에는 갈래마다 쓸 수 있는 열쇠가 정해져 있어(4.4), 반전 자리는 장 단위 필드로 둔다. 지금 검증기는 장 단위의 다른 열쇠를 막지 않는다.
- 음보 0~29를 연타로 달리고 멈춘 뒤 예측, 그다음 음보 30~35와 종장을 공개한다.
- `tests/check-saseol.mjs`가 이 표시를 확인한다: `fromFoot` 앞 음보에는 '주추리'가 없고 뒤에는 있으며, `glossBefore`에 반전이 드러나지 않는다.
