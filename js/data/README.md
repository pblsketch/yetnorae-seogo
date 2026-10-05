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
| 시조 | `simnyeon-gyeongyeong` | 십 년을 경영하야 | |
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

## 추가 제안(T4) — 세계 바탕

세계 바탕 작업(T4)이 정한 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았다.

### 세계 바탕 손잡이 — `js/world/world.js`

```js
mount(container, { wings, manifest, appearance, reduceMotion, onArrive })
enterWing(관 id) · enterCorridor()
setContext(label, handler)        // 오른쪽 아래 상황 버튼. label이 없으면 숨김. Enter·Space도 같은 동작
openSplit(panelEl) · closeSplit() // 반반 틀. 여는 동안 이동 조작·상황 버튼이 숨고 탭 이동이 멈춘다
setDancheong(관 id, 0~1) · getDancheong(관 id)
getMode() → '3d' | '2d'
dispose()
// 그 밖: reduceMotion(), setDeviceReduceMotion(v), particleScale(), shake(초) → 줄이기면 false,
//        getAnchors(), getThree() → { THREE, scene, camera, renderer, root } | null, toScreen(p), getStats(), isPaused()
```

- `wings`를 주지 않으면 `js/registry.js`의 `wings`를 쓴다.
- `manifest`는 `assets/manifest.json`을 읽은 객체다. 세계 바탕은 목록을 스스로 내려받지 않는다(없는 파일 요청이 콘솔 오류가 되지 않도록). 연결 단계가 넘긴다. 없으면 모든 그림이 자리표시다.
- `appearance`는 저장의 `appearance`(`'a'` | `'b'`)이고, 학생 종이 인형 `sprite/student-<a|b>`를 고른다.
- `onArrive({ position, anchor, place })`: 탭·문·자리로 가서 멈추거나 조이스틱·키보드 이동을 멈췄을 때 부른다.
  - `position`: 3D는 세계 좌표 `{ x, z }`(m), 2D는 그림 판 백분율 `{ x, y }`
  - `anchor`: 가까운 자리. `{ key: 'door', wing }`(회랑의 관 문) · `{ key: 'slots' | 'bonus', index }` · `{ key: 'basket' | 'returnedShelf' | 'roomDoor' | 'entrance' | 'nextDoor' | 'mentorSeat' }` · `null`
  - `place`: `'corridor'` 또는 관 id
- 단청: 마친 관은 부르는 쪽이 `setDancheong(id, 1)`로 알린다. `diorama:dancheong-restore`를 받으면 지금 관의 단청을 0→1로 천천히 올린다(움직임 줄이기면 바로).
- 관 문: `wing:state`의 `state`가 `'locked'`면 닫히고, 그 밖은 열린다. 처음에는 입구만 열려 있다.

### 그림 이름

- 2D 회랑 그림 판: `board/corridor` (11.2 `board/<장면 이름>`을 따른다)

### 2D 관 모형의 자리

- 2D `anchors`의 자리마다 세계 바탕이 48px 이상의 누를 수 있는 자리를 만들어 준다(관 모형이 따로 만들 필요 없음).
- 오른쪽 아래 상황 버튼이 그림 판의 대략 `x > 78%`, `y > 78%`를 덮을 수 있으므로 그 구석에는 자리를 두지 않는다.
- 학생은 그림 판 `y` 40~95% 띠 안에서만 걷는다. 그보다 위의 자리를 누르면 그 아래까지 걸어가서 도착을 알린다.

### 사건

- 세계 바탕이 내는 사건: `orientation:pause`·`orientation:resume`, 그와 함께 `audio:pause`·`audio:resume`(`reason: 'orientation'`).
- `settings:reduce-motion`: 설정 화면이 내면 세계 바탕이 기기 설정 값으로 받는다. 세계 바탕도 실제 적용 값(기기 설정 또는 브라우저 선호)이 바뀌면 낸다. 브라우저 선호 때문에 받은 값과 실제 값이 다르면 실제 값을 한 번 더 낸다.

## 추가 제안(T19) — 결과 카드

결과 카드 작업(T19)이 정한 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### 모듈

| 파일 | 내보내는 것 |
| --- | --- |
| `js/result/card.js` | `CARD_SIZE`(1600×900), `renderCard(data, { canvas?, manifest? })` → `{ canvas, layout }`, `cardToBlob(canvas)`, `cardFileName(data)`, `saveBlob(blob, 이름)`, `downloadCard(data, opts)` |
| `js/result/card-view.js` | `showCard(container, source, { manifest?, onClose? })` → `{ ready, download(), refresh(), layout, canvas, dispose() }` |

- `data`는 `buildWingCard`·`buildFinalCard`(js/core/cards.js)의 결과만 쓴다. `source`에 **함수**(`() => buildWingCard(store.currentRecord(), 관 id)`)를 주면 내려받을 때마다 지금의 기록으로 다시 모아 다시 그린다(spec 12). 자료가 `null`이면 내려받기 버튼 없이 안내만 보인다.
- 카드 배치는 픽셀로 고정이라 글자 크기 설정과 상관없다. 글꼴은 `css/base.css`의 `--font-body`·`--font-ui`를 읽고 `document.fonts.ready`를 기다린 뒤 그린다.
- 학생 그림은 기록의 `appearance`로 `sprite/student-<a|b>`를 고른다. `manifest`(자산 목록)를 넘기면 그 그림을, 없으면 자리표시 종이 인형을 쓴다.
- 파일 이름은 `data.fileName`(spec 12 기본값)을 쓰고, 파일 이름에 쓸 수 없는 글자(`\ / : * ? " < > |`)만 `_`로 바꾼다.
- `layout.items`: 그린 글 `{ type: 'text', role, ref?, text, size, font, box, lines: [{ text, x, y, w, h }] }`과 그림 `{ type: 'image', role: 'student', name, placeholder, x, y, w, h }`. 점검(`tests/check-card.mjs`)이 이것으로 담긴 글·잘림·점수 말을 확인한다.
- 화면 스타일은 `css/result.css`. 연결 단계가 `index.html`에 붙인다.

## 추가 제안(F1) — 노래 속 마음 카드, 교과서 밖 원문 이어 붙이기

사용자 결정에 따라 F1이 더한 것이다. 연결 단계가 확인해 본문(4.2·4.3·4.7)에 옮긴다. 위의 정의는 바꾸지 않았다. 검증기(`js/core/validate.js`)는 이미 이 약속대로 검사한다.

### 기념품 종류 — `keepsake.kind` (spec 8)

```js
{ kind: 'mind', name: '서러운 님을 보내는 마음', word: '셜온 님', phrase: '셜온 님 보내ᄋᆞᆸ노니', classLine: '…' }
```

| 값 | 뜻 |
| --- | --- |
| `'object'` | 노래 속에 실제로 나오는 물건 카드. **`kind`가 없으면 이것이다**(기존 노래는 고치지 않는다) |
| `'mind'` | 노래에 물건이 나오지 않을 때의 **'노래 속 마음' 카드**. 화면은 카드에 '노래 속 마음'이라고 표시한다 |

- `word`·`phrase` 규칙(4.7)은 두 종류 모두 같다. `'mind'`의 `word`는 마음을 담은, 노래 글에 **그대로 나오는** 말이다(물건 낱말 대신).
- `name`은 카드 제목이다(예: '서러운 님을 보내는 마음').
- `'mind'` 카드의 짧은 설명 한 줄은 노래의 `cardNote`(4.2)에 적는다. 화면은 마음 카드에 이 줄을 함께 보인다.
- 쓰는 노래: 「가시리」(`gasiri`, '셜온 님'), 「어져 내 일이여」(`eojeo-nae-iriyeo`, '글이는 情'). 그 밖의 노래는 `'mind'`를 쓰지 않는다(갈래 점검이 막는다).
- 검증기: `kind`가 `object`·`mind` 밖이면 `KEEPSAKE`.

### 교과서 밖 원문 이어 붙이기 — 단위 `beyondTextbook`·`sourceNote` (spec 9 「상춘곡」)

교과서 수록 대목 뒤에 옛 문헌 원문을 이어 붙일 때, 이어 붙인 단위(행·장·연·구)마다 표시와 출처를 단다.

```js
// sangchungok의 units[21] (교과서 대목 21행 바로 다음 행)
{
  beyondTextbook: true,
  sourceNote: '위키문헌 「상춘곡」 원문(『불우헌집』 수록). 띄어쓰기·음보 나눔·현대어 풀이는 제작진이 씀',
  feet: [ /* … */ ],
  gloss: '…',
}
```

- `beyondTextbook`: 이어 붙인 단위에만 `true`로 쓴다(다른 값은 쓰지 않는다). 화면은 이 단위에 **'교과서 밖 원문'**이라고 표시하고, 그 옆에 `sourceNote`를 보인다.
- `sourceNote`: 그 단위의 출처 문구(비어 있지 않은 글). `beyondTextbook: true`인 단위에만, 그리고 반드시 쓴다.
- 이어 붙인 단위는 **노래 끝에 모여** 있어야 한다. 교과서 대목은 앞에 그대로 두고 고치지 않는다.
- 교과서 노래(`textbook-common2`·`textbook-literature`)에만 쓴다. 노래의 `citation`은 교과서 출처 문구 그대로 두고, 이어 붙인 대목의 출처와 범위는 `citationNote`(필수)와 단위의 `sourceNote`에 적는다.
- 확인 상태는 노래 하나에 하나뿐이므로, 이어 붙인 단위가 있으면 노래는 **`pending`**이다(교과서 대목은 대조를 마쳤어도). 어느 부분을 대조했는지는 `citationNote`에 적는다. 교사가 이어 붙인 부분까지 확인하면 `verified`로 바꾼다.
- 검증기: 값·자리·출처가 틀리면 `FIELD`, 이어 붙인 단위가 있는데 `pending`이 아니면 `CITATION`.
- 낭송·두드리기·걷기는 이어 붙인 단위도 다른 단위와 똑같이 다룬다(단위 번호도 그대로 이어진다).
- 지금 쓰는 노래: 「상춘곡」(`sangchungok`) 22~39행. 교과서 21행 뒤에 위키문헌 원문의 '화풍(和風)이 건ᄃᆞᆺ 부러'부터 끝 '아모타 백년행락(百年行樂)이 이만ᄒᆞᆫᄃᆞᆯ 엇지ᄒᆞ리'까지 18행(시냇가 술자리, 산봉우리, 공명·부귀를 멀리하는 마무리).

## 추가 제안(T11) — 관 모형의 덧자리

사설시조관 모형(T11)이 정한 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았다.

- 관 모형 `handle`에 선택 열쇠 `spots`를 더한다. `anchors`와 같은 좌표계(3D는 `root` 기준 `THREE.Vector3`, 2D는 백분율 `{ x, y }`)이고, **세계 바탕은 이것으로 누를 자리를 만들지 않는다**(도착 판정에도 쓰지 않는다).
  - `spots.floatingSongs`: 떠도는 노래가 머무는 곳(한 판 화면이 노래를 띄우는 자리)
  - `spots.measureFocus`: 재기 화면의 왼쪽 반(디오라마)이 바라볼 곳. 사설시조관은 늘어난 가운데 층 한가운데다.
- `anchors`의 열쇠는 7.1 그대로다. 위 두 자리를 `anchors`에 넣지 않은 까닭은 2D에서 이름표 없는 누를 자리가 생기기 때문이다.

## 추가 제안(T8) — 고려가요관 모형

고려가요관 모형(T8)이 정한 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### 자리(`anchors`) 열쇠 더하기

| 열쇠 | 3D | 2D | 뜻 |
| --- | --- | --- | --- |
| `songs` | `THREE.Vector3` 목록 | `{ x, y }` 목록 | 떠다니는 노래 자리. 세계 바탕이 다른 자리처럼 다룬다(2D 누를 자리, 도착 알림 `{ key: 'songs', index }`) |
| `focus` | `{ position, target }`(`camera`와 같은 모양) | `{ left, top, width, height }`(그림 판 백분율 사각형) | 재기 화면 왼쪽 반이 비출 곳(연 방 줄과 복도). 점이 아니어서 누를 자리를 만들지 않는다. 세계 바탕은 아직 쓰지 않고, 3D `getAnchors()`에서도 빠진다 |

### 반응의 약속

- `diorama:refrain-link`의 연 번호는 방 번호 `unit % 7`로 그린다(연 방 일곱 칸). 같은 연 안의 후렴(`from.unit === to.unit`)은 그 방 고리에 작은 고리로 처진다. 한꺼번에 12개까지 보이고, 넘으면 오래된 것부터 거둔다.
- 재기 흔적(후렴 고리, 음보 구슬, 접힌 경계 빛)은 `diorama:slot-set`·`diorama:shelf-bound`가 오면 걷힌다. `diorama:pillar-light`가 `{ unit: 0, line: 0, foot: 0 }`으로 오면 음보 구슬만 새로 시작한다.
- `diorama:pop-out`을 받으면 갈래 모양으로 삐져나온 모습을 2.2초 보인 뒤 그 자리를 빈 책등으로 되돌린다(`slot-set`을 따로 내지 않아도 된다).
- `diorama:shelf-bound { area: 'shelf' }`가 오면 작품 방 「정석가」 문이 열린다. `diorama:dancheong-restore`도 먹안개를 걷는다.
- 관 모형은 `ctx.restored` 말고는 판 상태를 모른다. 판 도중에 관을 나갔다 다시 들어오면 한 판 화면이 지금 상태(`slot-set`, `shelf-bound`, `fog-recede`)를 다시 내 주어야 꽂힌 책등·묶음·먹안개가 맞게 보인다.

## 추가 제안(T9) — 시조관 모형

시조관 모형(T9)이 쓰는 값이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았다.

### `diorama:slot-set`의 `area` 값 더하기

| `area` | `index` | 뜻 |
| --- | --- | --- |
| `mentor` | `0` | 시조관 '선대 사서의 자리'(spec 10.2 3단계). 보스를 마치면 `{ area: 'mentor', index: 0, songId: 'taesan' }`. 그 전에는 제목 없는 빈 책등이다 |
| `returned` | `0`~`3` | 돌아온 노래 선반(spec 6.7)의 자리. 꽂히면 제목이 바로 보인다 |

- 관 모형은 진행 기록을 읽지 않는다. 관에 (다시) 들어온 뒤 놓인 상태를 보이려면 부르는 쪽이 `enterWing` 다음에 `diorama:slot-set`(칸·덤·바구니·`mentor`·`returned`)과 `diorama:shelf-bound`를 차례로 다시 낸다. 단청은 `setDancheong`, 먹안개는 `ctx.restored`(마친 관이면 처음부터 없음)로 정해진다.
- 모르는 `area`는 조용히 넘긴다(다른 관 모형은 `mentor`·`returned`를 무시해도 된다).

### 관 모형 `handle.areas` (누를 자리가 아닌 곳)

`anchors`에 넣으면 세계 바탕이 누를 자리를 만들므로, 누를 자리가 아닌 곳은 `handle.areas`에 둔다(좌표 형식은 `anchors`와 같다).

| 열쇠 | 뜻 |
| --- | --- |
| `floating` | 떠도는 노래가 떠 있을 자리 목록 |
| `focus` | 재기 화면 왼쪽 반이 비출 곳. 시조관은 `{ stairs, pillars, pavilion }` |

### 시조관이 사건을 보이는 방식

- `diorama:stair-step`: 종장으로 오르는 첫 계단(세 칸)을 `step`마다 한 칸씩 밝히고 등불이 올라선다. `step: 1`이 오면 새로 오르는 것으로 보고 앞서 밝힌 칸을 끈다. `step`이 3을 넘으면(`total` 4 이상) 세 칸을 넘는 '맞지 않는 계단'이 하나씩(최대 넷) 드러난다.
- `diorama:pillar-light`: 장 = 층, 음보 = 앞기둥(층마다 넷). 어느 층의 첫 음보(`foot: 0`)가 오면 그 층 기둥을 끄고 다시 세고, 초장 첫 음보면 모두 끈다. 향가처럼 `foot: null`이면 구 번호로 열두 기둥을 돌아가며 켠다.
- `diorama:fold`: 그 장(층)의 창방이 잠깐 빛난다.
- `diorama:pop-out`: `genre`마다 모양이 다르다 — 사설시조는 중장만 서가 밖으로 길게, 가사는 조각이 줄줄이 길게, 향가는 4·4·2 탑 모양으로 위로, 고려가요는 같은 조각이 나란히, 시조는 세 장이 통째로 앞으로. 바구니에서는 책이 들리고 행선지 표시가 지워진다.
- `diorama:floor-fill`·`aa-door`·`refrain-link`·`walk-step`·`unroll`: 시조관에는 해당 건축이 없어 연출하지 않는다(오류 없이 넘긴다).

## 추가 제안(T7) — 향가관 모형

향가관 모형(`js/world/wings/hyangga.js`, 2D는 `hyangga-board.js`, 공통 상태는 `hyangga-shared.js`)이 쓴 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았고 새 사건 이름도 없다.

### 자리 더하기

| 열쇠 | 값 | 뜻 |
| --- | --- | --- |
| `anchors.floating` | 자리 다섯(3D `Vector3`, 2D `{ x, y }`) | 떠도는 노래(칸 노래 셋, 길 잃은 노래 둘)가 떠 있는 자리. 3D의 `y`는 떠 있는 높이이고 학생은 그 아래 땅(`x`, `z`)에 선다. 도착하면 `{ key: 'floating', index }` |
| `handle.focus` | 3D `Vector3`, 2D `{ x, y }` | 재기 화면 왼쪽 반이 비출 곳(탑 가운데). 세계 바탕은 아직 이 값을 꺼내 주지 않는다 |

- 2D 그림 판의 자리 이름표(`board2d.js`의 `ANCHOR_LABELS`)에 `floating: '떠도는 노래'`를 더해야 한다. 없으면 누를 수 있는 자리의 이름표가 열쇠 이름 그대로 보인다.
- 향가관의 `slots`는 4·8·10구 층 순서이고, 3D·2D 모두 그 층 서가 아래 땅의 층 이름 비석 앞 자리다.

### 반응 사건을 받는 방식

- `diorama:floor-fill`의 `gu`는 지금까지 센 구 수(절대값)다. 4구까지는 4구 층, 8구까지는 8구 층, 그 뒤는 10구 층이 차오른다. `gu`가 1 이하로 오면 새 노래를 세기 시작한 것으로 보고 '아아' 문을 닫는다.
- `diorama:aa-door`: `present: true`면 문이 열리고 문 뒤 두 칸(9·10구 자리)이 빛난다. `present: false`면 문은 닫힌 채 표지가 먹안개 빛으로 흐려지고 살짝 흔들린다.
- `diorama:pop-out`은 같은 자리에 `diorama:slot-set`이 다시 올 때까지 삐져나온 모양을 유지한다. 바구니에서 삐져나온 노래는 행선지 표가 지워진다.
- `diorama:shelf-bound`(`area: 'shelf'`)가 오면 작품 방 문이 열리고, 세 층의 책을 금빛 실이 잇고, 제목이 나타난다.
- 다른 관의 고유 동작 사건(`stair-step`, `refrain-link`, `walk-step`, `unroll`)은 받아서 넘긴다(보이는 반응 없음).

### 스타일

- 2D 그림 판 스타일은 `css/wing-hyangga.css`다. 모형이 이 파일의 `<link>`가 없으면 스스로 머리에 붙이지만, 연결 단계가 `index.html`에 링크를 더하는 편이 깜박임이 없다.

## 추가 제안(T5) — 재기 화면

재기 화면 작업(T5)이 정한 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### 재기 화면 손잡이 — `js/measure/measure.js`

```js
openMeasure(ctx) → Promise<감정서>   // 6절 모양. 중단 신호면 AbortError로 끝난다
```

| `ctx` 열쇠 | 뜻 |
| --- | --- |
| `song` | 노래 객체 |
| `wing` | 지금 관 id. 그 관의 고유 동작을 쓴다. 입구 튜토리얼은 `'entrance'`(`tutorialAction`인 `stairs`) |
| `mode` | `'wing'`(기본) · `'boss'` — 보스는 다섯 고유 동작을 도구로 골라 쓰고, 수첩 대신 일지를 연다 |
| `world` | 세계 바탕 손잡이(`openSplit`·`closeSplit`). 없으면 `container`에 붙인다 |
| `rhythm` | `{ engine, buildGrid?, createTapSession?, offsetMs? }` — 소리 엔진 하나와 박자 함수(없으면 `js/core/rhythm.js`의 것). `offsetMs`는 저장의 `device.calibrationOffsetMs` |
| `noBeat` | 처음 박자 없는 방식인지(없으면 `engine.noBeat.value`). 그 뒤로는 `rhythm:no-beat`를 따른다 |
| `setSlashMode(v)` | 빗금 권유를 받아들였을 때 부른다. 설정 저장은 부르는 쪽이 한다(없으면 `engine.setSlashMode`) |
| `preMeasured` | 미리 잰 노래. 감정서 객체, `{ action: 동작 id }`, 또는 `true`(그 노래의 `stray` 역할 가운데 `to`가 지금 관인 것의 관 동작으로 계산). 감정서가 채워진 채 열린다 |
| `notebook` · `notebookGlow` | 갈래 id → 수첩 쪽(`js/data/songs/index.js`의 `notebook`), 이미 받은 도움 `[{ wing, genre, conceptIds }]`. 열려 있는 동안 `help:notebook-glow`도 듣는다 |
| `journal` · `journalGlow` | 보스 일지: `{ concepts }`(저장의 `progress.concepts`), 반짝일 개념 id. `help:journal-glow`·`concept:changed`도 듣는다 |
| `introSeen` · `onIntroSeen(kind)` | 첫 사용 안내 깃발 `{ common, unique }`(false면 보인다). 본 뒤 `onIntroSeen('common' \| 'unique')`를 부른다. 저장은 부르는 쪽: `unique` ↔ `wings[관].uniqueActionIntroSeen`, `common`은 첫 노래(튜토리얼) 하나뿐이므로 `tutorialDone` 등으로 정한다 |
| `reduceMotion()` | 움직임 줄이기(없으면 `world.reduceMotion()`·`#app.reduce-motion`) |
| `signal` | 중단 신호(나가기). 중단되면 반반 틀을 닫는다 |

- 보스 결과에는 `action`(마지막으로 쓴 도구) 말고도 `actions`(쓴 도구의 증거 모두, 쓴 순서)가 더 붙는다. 관에서는 `actions`가 없다.
- 감정서 글의 단위 이름은 갈래 단위 이름(장·구·연·행)을 쓰고, 보스에서는 갈래가 드러나지 않게 '덩이'라고 쓴다.
- 화면 글(버튼, 안내, 감정서 문구)은 `js/measure/labels.js`에 모았다. 스타일은 `css/measure.css`이고 `index.html`에 연결해야 한다(연결 단계).

### 고유 동작 `ctx` 더하기(7.2)

재기 화면은 고유 동작에 `{ view, controls, setHint, emit, getNoBeat }`를 더 넘긴다(두루마리 글 보기, 조작 자리, 안내 한 줄, 사건 내기, 지금 박자 없는 방식인지). 이것들이 없으면 동작 모듈이 `container` 안에 스스로 만든다.

### 반응 사건의 세부(8.1)

- `diorama:fold { unit }`의 `unit`은 접힌 경계 **앞** 단위 번호다(초장과 중장 사이 = 0).
- `diorama:pillar-light`는 두드리기에서 판정 창 안의 박마다, 빗금에서는 음보 끝 빗금마다 낸다. 놓쳐서 다시 듣는 단위는 다시 낸다.
- `diorama:floor-fill { gu }`는 향가 구 하나를 마칠 때마다 낸다(지금까지 마친 구 수).
- `diorama:refrain-link`: 한 자리를 누르면 지금 쪽에 보이는 같은 구절 자리가 모두 이어지며, 고리마다 하나씩 낸다. 같은 구절의 첫 고리는 `from`과 `to`가 같다.
- `diorama:aa-door { present, unit }`의 `unit`은 감탄사가 없으면 `null`이다.

## 연결 결정(F2) — 관 모형 손잡이

다섯 관 모형(T7~T11)이 7.1과 '추가 제안(T4)'에 없던 두 가지(떠도는 노래 자리, 재기 초점)를 저마다 다른 이름으로 내놓아서, 연결 단계(F2)가 한 가지 모양으로 정했다. 위의 '추가 제안(T7)·(T8)·(T9)·(T11)'에 적힌 모양은 관 모형이 **안에서** 쓰는 옛 모양으로 남고, 바깥(세계 바탕, 한 판 화면, 재기 화면)은 아래 모양만 본다.

### 맞추는 곳 — `js/world/wings/normalize.js`

- `normalizeWing(모듈)`이 `create3D`·`create2D`를 감싸서, 돌려받은 손잡이를 아래 모양으로 맞춘다. 이미 감싼 모듈은 그대로 돌려준다(`isNormalizedWing(모듈)`로 알 수 있다).
- `js/registry.js`의 `wings`에는 다섯 관 모형을 모두 `normalizeWing`으로 감싸 등록한다. 세계 바탕은 받은 모듈을 그대로 쓰므로, 점검 페이지처럼 감싸지 않은 모듈을 직접 넘기면 옛 모양이 그대로 보인다.

### 맞춘 손잡이

| 열쇠 | 3D | 2D | 뜻 |
| --- | --- | --- | --- |
| `anchors` | 7.1과 같다 | 7.1과 같다 | **누를 자리만** 둔다. 옛 열쇠 `floating`(T7)·`songs`(T8)·`focus`(T8)는 빠진다 |
| `floatingSpots` | `root` 기준 `THREE.Vector3` 목록(`y`는 떠 있는 높이) | 그림 판 백분율 `{ x, y }` 목록 | 떠도는(아직 잡지 않은) 노래가 머무는 자리. 관마다 **다섯 이상**(칸 노래 셋, 길 잃은 노래 둘). 2D는 상황 버튼 구석(`x > 78`이면서 `y > 78`)을 피한다 |
| `measureFocus` | `{ target: Vector3, position?: Vector3 }`(`root` 기준) | 그림 판 백분율 `{ x, y }` | 재기 화면 왼쪽 반(디오라마)이 비출 곳. 3D `position`은 카메라 자리이고, 없으면 세계 바탕이 `target` 앞 위(`TUNING.measureOffset`)에서 본다 |
| `react`·`update`·`dispose` | 7.1과 같다 | 7.1과 같다 | |

- **떠도는 노래 자리는 누를 자리(`anchors`)가 아니다.** 세계 바탕은 이것으로 2D 누를 자리를 만들지 않고, 도착 알림(`onArrive`의 `anchor`)에도 쓰지 않는다. 한 판 화면이 이 자리에 잡을 수 있는 노래를 스스로 그리고 누르게 한다.
- 옛 열쇠 `focus`·`spots`·`areas`는 맞춘 손잡이에 남기지 않는다(같은 값이 두 이름으로 돌아다니지 않게). 관 모형이 따로 내놓은 그 밖의 열쇠(예: 점검용 `info`)는 그대로 둔다.
- 관 모형이 이 열쇠를 직접 내놓으면 그것이 먼저다. 없으면 옛 모양에서 옮긴다.

| 관 | 떠도는 노래 자리 ← | 재기 초점 ← |
| --- | --- | --- |
| 향가관(T7) | `anchors.floating` | `handle.focus`(점) |
| 고려가요관(T8) | `anchors.songs` | `anchors.focus` — 3D `{ position, target }`, 2D 백분율 사각형 `{ left, top, width, height }`는 가운데 점 |
| 시조관(T9) | `areas.floating` | `areas.focus`의 세 점(`stairs`·`pillars`·`pavilion`)의 가운데 |
| 가사관(T10) | `handle.floatingSpots`(직접) | 3D `anchors.camera.measure`(`{ position, target }`), 2D `handle.measureFocus`(직접) |
| 사설시조관(T11) | `spots.floatingSongs`(점 하나 또는 목록) | `spots.measureFocus`(점) |

### `diorama:slot-set`의 자리 이름

- `area`는 `shelf` · `bonus` · `basket` · `returned` · `mentor` 다섯이다(`SLOT_AREAS`). '추가 제안(T9)'의 `returned`(`index` 0~3, 돌아온 노래 선반)와 `mentor`(`index` 0, 시조관 '선대 사서의 자리', 보스를 마치면 `songId: 'taesan'`)를 본문으로 받아들인다.
- **모든 관 모형이 다섯을 모두 받는다.** 해당하는 건축이 없으면 오류 없이 넘긴다(지금 `returned`를 그리는 관은 시조관·가사관, `mentor`를 그리는 관은 시조관뿐이다). 그 밖의 `area`도 조용히 넘긴다.

### 세계 바탕(`js/world/world.js`)

- `getWingHandle()` → 지금 관 모형의 손잡이(등록된 관 모형이면 위의 맞춘 모양). 회랑이거나 만들지 못했으면 `null`.
- `openSplit(panelEl)`: 지금 관 모형에 `measureFocus`가 있으면 왼쪽 반이 그곳을 비춘다. 3D는 카메라가 `target`을 바라보고(`position`이 있으면 그 자리에서), 2D는 그림 판을 16:9 그대로 왼쪽 칸을 꽉 채우게 키우고 초점이 칸 가운데에 오도록 민다(그림 판 가장자리가 칸 안으로 들어오지 않는 만큼만). `closeSplit()`이면 원래대로 돌아간다. `measureFocus`가 없으면 전과 같다.
- 2D 누를 자리 이름표(`board2d.js`의 `ANCHOR_LABELS`)는 모든 자리 열쇠에 한국어 이름이 있다. 맞추지 않은 관 모형의 `floating`·`songs`는 '떠도는 노래'이고, 이름표가 없는 열쇠는 '자리'로 보인다(영어 열쇠가 화면에 나오지 않는다).

## 추가 제안(T26) — 그림 자산

그림 작업(T26)이 정한 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### 그림 이름(11.2에 더하는 것)

| 그림 | 이름 |
| --- | --- |
| 작품 방 그림 판 | `board/room-<관 id>` (예: `board/room-sijo`는 「십 년을 경영하여」 방) |
| 보스전·엔딩 그림 판 | `board/boss`, `board/ending` |
| 바탕 한지 무늬 | `texture/hanji` (관 재질 무늬와 따로, 판·종이 바탕용) |
| 회랑 재질 무늬 | `texture/corridor` (관 id가 아니지만 회랑 벽에 쓴다) |
| 카드 장식 | `card/frame`(16:9 결과 카드 테두리, 1600×900, 가운데 투명), `card/keepsake`(기념품 카드 세로 테두리, 640×960, 가운데 투명) |

- 확장자는 모두 `webp`다. 종이 인형(`sprite/*`)·기념품(`keepsake/*`)·카드 장식(`card/*`)은 투명 바탕이고, 재질 무늬(`texture/*`, 512×512 바둑판 무늬)와 그림 판(`board/*`, 1600×900)은 불투명하다.
- 종이 인형은 높이 768px이고, 내용에 맞춰 자르되 둘레에 약 2%의 투명 여백을 두었다(발 밑 여백도 같다). 좀은 512×512, 좀 대왕은 768×768 정사각이다. 기념품은 512×512 정사각이다.
- 기념품의 `keepsake.kind === 'mind'`(「가시리」, 「어져 내 일이여」)도 같은 이름 `keepsake/<노래 id>`에 글자 없는 상징 그림이 있다.
- 가객 그림은 11.2대로 노래마다 `sprite/singer-<노래 id>`가 있다. 같은 사람(또는 같은 '이름 모를 ~' 무리)의 노래들은 같은 그림 파일을 이름만 달리해 둔다(git은 같은 내용을 한 번만 저장한다).

### 자산 목록 항목에 더한 열쇠(art.json)

| 열쇠 | 값 |
| --- | --- |
| `prompt` | 생성에 쓴 프롬프트 파일(`tools/art/prompts/...txt`) |
| `rawSha256` | 생성 원본(`assets/raw/art/`, 저장소 밖) PNG의 sha256 |
| `image` | `{ format, width, height, alpha }` — `tests/check-assets.mjs`가 파일 머리와 맞춰 본다 |

## 추가 제안(T13) — 작품 방 「정석가」

작품 방 「정석가」(`js/rooms/goryeo.js`)가 쓴 것이다. 연결 단계가 확인해 본문(7.3)에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### 방 `ctx`에 더하는 선택 열쇠

| 열쇠 | 뜻 |
| --- | --- |
| `manifest` | 자산 목록(`assets/manifest.json`을 읽은 객체). 방이 `createAssets`로 2D 그림 판 `board/room-goryeo`와 3D 뒷벽 무늬를 꺼낸다. 없으면 자리표시 무늬 |
| `assets` | 이미 만든 자산 손잡이(`createAssets`의 결과). 있으면 `manifest`보다 먼저 쓰고, 방은 이것을 치우지 않는다 |
| `songs` | 노래 목록. 없으면 `js/data/songs/index.js`의 등록된 노래에서 「서경별곡」을 찾는다 |

- `reduceMotion`은 함수(`() => boolean`)와 참거짓 값 모두 받는다.
- `rhythm`은 `{ engine, buildGrid? }`(재기 화면과 같은 모양)이고, 엔진 자체를 넘겨도 된다. 방은 카드를 낼 때 그 연을, 마지막에 구슬 연과 「서경별곡」 같은 연을 `engine.play(grid, [그 연의 줄들])`로 낭송한다. 듣기만 하는 낭송이라 박자 없는 방식에서도 길이 같다.
- 3D(`three: { THREE, root, camera }`)에서는 방이 카메라 자리를 바꾸고, 끝나거나 중단되면 원래대로 돌려놓는다. 그리기는 부르는 쪽이 한다. `container`에는 투명한 겹(왼쪽 말풍선·쪽지, 오른쪽 패널)이 올라가므로 장면 위에 겹쳐 놓는다.
- 방 글은 `js/data/rooms-goryeo.js`의 `room`이다. 카드는 노래의 연·줄 번호(`unit`, `lines`, `conditionLine`)만 가리키고, 화면은 노래 데이터의 원문과 풀이를 그대로 보인다. 마지막 연은 `finalUnit: 5`, 같은 사설은 `echo: { songId: 'seogyeong-byeolgok', unit: 1 }`이다. 노래 데이터가 교과서 수록본으로 바뀌어 연 나눔이 달라지면 이 번호를 고친다(`tests/check-room-goryeo.mjs`가 어긋남을 잡는다).
- 스타일은 `css/room-goryeo.css`. 방이 이 파일의 `<link>`가 없으면 스스로 머리에 붙이지만, 연결 단계가 `index.html`에 더하는 편이 깜박임이 없다.

## 추가 제안(T12) — 작품 방 「제망매가」

작품 방 「제망매가」(T12)가 정한 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의(7.3의 `ctx`와 `record`)는 바꾸지 않았고, 새 사건 이름도 없다.

### 방 `ctx` 더하기(선택)

| 열쇠 | 뜻 |
| --- | --- |
| `assets` | 관 모형 `ctx.assets`와 같은 손잡이(`image(name)`). 2D 그림 판 `board/room-hyangga`를 찾는다 |
| `manifest` | `assets`가 없을 때 자산 목록 객체. 방이 `js/world/assets.js`의 `createAssets`로 그림을 찾는다 |

- 둘 다 없으면 2D는 자리표시 풍경(그림 없음)으로 그린다. 방은 자산 목록을 스스로 내려받지 않는다.
- `reduceMotion`은 함수(`() => boolean`)든 값이든 받는다.

### 3D에서 방이 기대는 것

- `ctx.container`는 3D 캔버스와 **같은 자리, 같은 크기**로 겹쳐 있어야 한다. 누를 자리(잎·무더기)는 DOM 단추이고, 장면의 점을 `ctx.three.camera`로 투영해 `container` 위에 놓는다.
- 방은 `ctx.three.root`에 모형 묶음 하나를 붙이고, 끝나거나 중단되면 떼어 내고 치운다. `camera`는 방 동안 빌려 쓰고 끝나면 처음 자리(위치·방향·시야각)로 되돌린다. 그리기는 부르는 쪽(세계 바탕)이 프레임마다 한다.
- 재질은 빛 계산이 없는 것만 써서 장면의 빛과 상관없이 보인다. 그리기 호출은 방 모형만 약 28회다.

### 기록의 해석 id(`interpretationId`)

`js/data/rooms-hyangga.js`의 `interpretations`: `overcome`(슬픔을 이겨 냄), `endure`(견디겠다는 다짐), `both`(둘 다). 글은 고쳐도 id는 바꾸지 않는다(저장된 기록과 맞추기 위해). 자유 서술 답은 두지 않았다(7.3의 `interpretationText`가 데이터 파일의 글이어야 하므로).

### 스타일

- `css/room-hyangga.css`. 방이 이 파일의 `<link>`가 없으면 스스로 머리에 붙이지만, 연결 단계가 `index.html`에 링크를 더하는 편이 깜박임이 없다.

## 추가 제안(T6) — 관 한 판 흐름

한 판 흐름 작업(T6)이 정한 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### 모듈

| 파일 | 내보내는 것 |
| --- | --- |
| `js/play/session.js` | `createSession({ container, storage?, rooms?, wings?, manifest?, audioDeps?, songs?, notebook?, clues? })` → `Promise<세션>`, `safeLocalStorage()`, `loadManifest()` |
| `js/play/wing.js` | `createWingPlay(세션, 관 id)`(세션의 `playWing`이 부른다), `PLAY_TUNING` |
| `js/play/play-screen.js` | 화면 약속(7.4) `show(container, ctx)` — 이어 하기(`resume`) 또는 `ctx.params.wing` 관으로 연다 |
| `js/play/screens.js` | `renderNotebook`·`renderJournal`·`renderCollection`·`renderListen`, 화면 약속 모양의 `notebookScreen`·`journalScreen`·`collectionScreen` |
| `js/play/ceremony.js` · `keepsake.js` · `labels.js` · `dom.js` | 가객·기념품 연출, 기념품 카드 한 장, 화면 글, 작은 도우미 |

- 세션: `{ store, progress, audio, world, manifest, songs, songById(id), notebook, rhythm, playWing(관 id), enterCorridor(), resume(), openNotebook(), openJournal(), openCollection(), dispose() }`. 앱 하나에 세션 하나(저장 엔진·진행 엔진·소리 엔진·세계 바탕 하나씩)를 두고 입구·보스·엔딩 화면이 함께 쓴다.
- `storage`를 주지 않으면 `safeLocalStorage()`(읽기만 해도 오류가 나면 `null` → 이번 창 메모리로만)를 쓴다. `rooms`·`wings`를 주지 않으면 `js/registry.js`의 것을 쓴다. `audioDeps`는 `createAudioEngine`에 그대로 넘긴다.
- 화면 등록 이름 제안: `screens.play = play-screen.js`. 스타일은 `css/play.css`(연결 단계가 `index.html`에 붙인다).

### 약속

- **관 문 맞추기**: 세계를 띄울 때 세션이 기록의 관 상태를 `wing:state`로 한 번씩 다시 내고(세계 바탕은 처음에 입구만 열려 있으므로), 마친 관은 `world.setDancheong(관, 1)`로 알린다.
- **들어올 때 다시 그리기**: `enterWing` 다음에 `diorama:slot-set`(칸·덤·판정 전 바구니, `returned` 0~3, 보스를 마쳤으면 시조관 `mentor`), 묶였으면 `diorama:shelf-bound`와 `diorama:fog-recede`를 차례로 낸다. 바구니에서 이미 보낸(고정된) 노래는 다시 그리지 않는다.
- **삐져나옴**: 판정에서 돌아온 노래마다 `diorama:pop-out`을 내고, `PLAY_TUNING.popOutMs`(2.4초) 뒤 그 자리가 여전히 비어 있으면 `slot-set { songId: null }`을 낸다. 바구니에서 보낸 노래는 `sentMs`(1.2초) 뒤 `slot-set { area: 'basket', songId: null }`.
- **첫 사용 안내 깃발**: 재기 화면에 `introSeen: { common: progress.tutorialDone, unique: wings[관].uniqueActionIntroSeen }`을 넘기고, `onIntroSeen('unique')`면 `markUniqueActionIntroSeen(관)`을 부른다. 공통 동작 안내는 입구 튜토리얼 몫이다.
- **미리 잰 노래**: 입구에서 기다리는 노래(`waitingAt(관)` 가운데 아직 잡지 않은 것)를 잡으면 `preMeasured: true`로 재기 화면을 열고, 마치면 `markMeasured`로 손에 든다. 손에 든 노래 = 그 관의 `measured` 가운데 아직 꽂지 않은 것(판을 마친 관은 덤 노래).
- **작품 방 ctx 더하기**(7.3): `manifest`(자산 목록)를 더 넘긴다. 3D일 때 `three`는 세계 바탕의 `{ THREE, root(지금 관 모형 root), camera }`이지만, 방은 화면을 덮는 `container` 안에 스스로 장면을 만든다(그 위로 세계는 보이지 않는다). 방이 등록되지 않았으면 자리표시와 '방에서 나가기'만 보이고 마칠 길이 없다.
- **판의 끝**: `diorama:dancheong-restore` → 판 카드(`showCard`, 자료는 `buildWingCard(store.currentRecord(), 관)`) → 다음 관 문틈 소리(다음 관 배경음을 `leakMs` 동안 틀었다가 되돌린다) → 덤 노래가 떠다닌다.
- **창 숨김**: `visibilitychange`에서 `audio:pause`/`audio:resume`(`reason: 'hidden'`)을 낸다.
- **저장 실패 알림**: `save:failed`를 처음 받을 때 한 번만 "이 기기에 저장되지 않아요. 이번 창에서만 이어집니다"를 보인다(불러올 때 저장소를 쓸 수 없어도).
- **회랑**: 회랑에서 열린 관 문 앞에 서면 상황 버튼 '들어가기 — 관 이름'. 입구 문은 다루지 않는다(입구 작업 몫).

## 추가 제안(T16) — 작품 방 「님이 오마 하거늘」

작품 방 작업(T16)이 쓴 것이다. 연결 단계가 확인해 본문(7.3)에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### 방 `ctx`에 더해 받는 것(모두 선택)

| 열쇠 | 뜻 |
| --- | --- |
| `assets` | 관 모형 `ctx.assets`와 같은 손잡이(`{ image(name), texture(name) }`, `js/world/assets.js`의 `createAssets`). 2D 그림 판 `board/room-saseol`과 학생 종이 인형 `sprite/student-<a\|b>`를 여기서 찾는다. 없으면 자리표시 그림이다 |
| `manifest` | `assets`가 없을 때 자산 목록 객체를 주면 방이 손잡이를 만든다 |
| `appearance` | 저장의 `appearance`(`'a'` \| `'b'`). 없으면 `'a'` |

- `rhythm`은 재기 화면과 같은 모양 `{ engine, buildGrid?, createTapSession?, offsetMs? }`을 받는다('추가 제안(T5)'). 엔진을 바로 넘겨도 된다. `reduceMotion`은 함수나 참거짓 값 모두 받는다.
- 3D(`ctx.three = { THREE, root, camera }`)일 때 방은 `root`에 물체 묶음 하나를 붙이고 카메라를 움직인다. 그리기는 부르는 쪽이 매 프레임 한다. 방이 끝나거나 중단되면 묶음을 떼고 카메라를 처음 자리로 돌린다. 방이 열려 있는 동안 세계 바탕은 카메라를 따로 움직이지 않아야 한다.
- 방 화면은 `container`를 꽉 채운다(왼쪽 장면, 오른쪽 글 판). 3D에서는 왼쪽 장면 칸이 투명이라 아래 그림판이 보인다.
- 스타일은 `css/room-saseol.css`. 방이 이 파일의 `<link>`가 없으면 스스로 머리에 붙이지만, 연결 단계가 `index.html`에 링크를 더하는 편이 깜박임이 없다.
- 방의 흐름: 초장 → 중장 음보 0 ~ `reversal.fromFoot - 1` 달리기 → 예측 → 반전 음보와 중장 전체 풀이 공개 → 종장 → 완료. 박자 방식은 중장을 `RUN_CHUNK_FEET`(6, 조정 가능) 음보씩 낭송하며 두드리고, 놓친 박은 실패가 아니다. 박자 없는 방식(또는 도중에 `rhythm:no-beat`가 참이 되거나 소리 판이 잠겨 있으면)은 누를 때마다 한 음보씩 달린다.

## 추가 제안(T14) — 작품 방 「십 년을 경영하야」

작품 방 작업(T14, `js/rooms/sijo.js`)이 정한 것이다. 연결 단계가 확인해 본문(7.3)에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### `ctx` 더하기와 읽는 방식

| 열쇠 | 뜻 |
| --- | --- |
| `manifest` 또는 `assets` | 자산 목록(`assets/manifest.json`을 읽은 객체) 또는 `createAssets(목록)`(`js/world/assets.js`)의 손잡이. 2D 그림 판 `board/room-sijo`와 송순 그림 `sprite/singer-simnyeon-gyeongyeong`을 찾는다. 없으면 자리표시 그림을 쓴다 |
| `three` | 3D일 때 `three.THREE`만 쓴다(없으면 `import('three')`). 방은 `container` 안에 **자기 그림판(WebGLRenderer)·장면·카메라**를 따로 만들고 끝나면 치운다. `three.root`·`three.camera`는 쓰지 않는다. 3D를 만들 수 없으면 2D로 한다 |
| `reduceMotion` | 함수(`() => boolean`)나 값 모두 받는다. 없으면 `#app.reduce-motion`을 본다 |
| `noBeat` | 처음 값. 그 뒤로는 `rhythm:no-beat`를 따른다. 박자 없는 방식이면 낭송이 끝나기를 기다리지 않고 '다음'이 열린다 |
| `rhythm` | `{ engine, buildGrid? }`. 초장(시작)·중장(송순의 배치)·종장(강산을 밖에 둘 때)을 `engine.play(grid, [장])`으로 낭송하고, 놓을 때 `engine.sfx('place')`를 낸다 |

- 방이 화면을 다 채운다고 보고 `container` 안을 꽉 채운다(`position: absolute; inset: 0`). 스타일은 `css/room-sijo.css`이고, 문서에 없으면 방이 스스로 `<link>`를 붙인다(연결 단계가 `index.html`에 더하면 깜박임이 없다).
- 회전 멈춤(`orientation:pause`/`resume`)이면 물러나는 연출도 멈췄다가 이어 간다.

### 기록 값(7.3 그대로)

- `rooms`: 칸 번호 순서(첫째·둘째·셋째 칸)의 물건 id 셋. 강산은 들어가지 않는다.
- `outside`: 집 밖에 **놓은 순서**의 물건 id. 방을 마치면 언제나 `gangsan`이 들어 있다. 놓지 않고 남긴 물건은 어디에도 적지 않는다.
- `interpretationId`(`js/data/rooms-sijo.js`): `as-written`(나·달·청풍, 순서 무관) · `nature-swapped`(재물·벼슬 없이 손님이 한 칸) · `worldly`(금붙이나 관복을 들였고 달이나 청풍이 남음) · `worldly-only`(금붙이나 관복을 들였고 달도 청풍도 없음). 규칙은 `js/rooms/sijo-logic.js`의 `interpretationIdFor`.
- 노래 데이터의 제목은 「십 년을 경영하야」(원문 표기)다. 7.3 표의 「십 년을 경영하여」는 같은 방이다.

## 추가 제안(T15) — 작품 방 「상춘곡」

작품 방 「상춘곡」(T15)이 정한 것이다. 연결 단계가 확인해 본문(7.3)에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### 작품 방 `ctx` 더하기(7.3)

| 열쇠 | 뜻 |
| --- | --- |
| `manifest` | (선택) 자산 목록 객체(`assets/manifest.json`을 읽은 것). 2D는 `board/room-<관 id>`, 3D·2D 걷는 사람은 `sprite/student-<a\|b>`를 여기서 찾는다. 없으면 자리표시 그림 |
| `assets` | (선택) `createAssets(manifest)` 손잡이를 이미 만들었으면 이것을 넘겨도 된다(`manifest`가 먼저) |
| `appearance` | (선택) 저장의 `appearance`(`'a'` \| `'b'`). 없으면 `'a'` |

- `reduceMotion`은 값(`boolean`)이나 함수(`() => boolean`) 둘 다 받는다. 방은 `settings:reduce-motion`도 듣는다.
- `noBeat`은 처음 값이고, 그 뒤로는 `rhythm:no-beat`를 따른다. `rhythm`은 '추가 제안(T5)'의 재기 화면과 같은 모양 `{ engine, buildGrid? }`이다.
- 3D에서 `three`(`{ THREE, root, camera }`)를 넘기면 방은 `root`에 무리(group) 하나를 붙이고 카메라를 움직일 뿐, 그리기는 부르는 쪽이 한다. 그때 장면 칸 바탕은 투명하다. 방 장면은 원점 둘레 약 ±35m를 쓰므로 부르는 쪽은 비어 있는(또는 관 모형을 숨긴) `root`를 넘긴다. `three`가 없으면 방이 장면 칸 안에 그림판을 스스로 만든다. 3D를 만들지 못하면 같은 방을 2D로 이어 간다.
- 스타일 `css/room-gasa.css`는 방이 스스로 붙인다(한 번만). 연결 단계가 `index.html`에 넣어도 겹치지 않는다.
- 방은 받은 `container`를 가득 채우고(`position: absolute; inset: 0`), 마치거나 중단되면 자기가 만든 것을 모두 치운다. 오른쪽 아래 상황 버튼 구석(가로 78%·세로 78% 너머)에는 누를 것을 두지 않는다.

### 방 글 — `js/data/rooms-gasa.js`

- `roomGasa.stations`: 머무는 곳 다섯(작품 차례: `hut` 수간모옥 1~13행, `pavilion` 정자 14~21행, `stream` 시냇가 22~30행, `peak` 산봉우리 31~35행, `ending` 마무리 36~39행). 교과서 대목은 정자에서 끝나고, 시냇가부터 교과서 밖 원문이다.
- 곳마다 `words`(모을 시어 `{ id, text, unit }`). `text`는 그 행 원문에 그대로 있다. 마무리를 뺀 네 곳에서 하나 이상 모아야 다음 곳으로 걷는다.
- `record.words`는 모은 시어의 `text`를 **방 글 차례(작품 차례)**로 담는다. 누른 차례와 상관없다. 그래서 길이는 4 이상 19 이하다.
- `letGo`(36행 공명·부귀를 떠나보내기)와 `finale`(안빈낙도 마무리 글)도 이 파일에 있다. 해석 고르기는 없다(채점·선택 없음).

## 추가 제안(T18) — 시작 화면, 입구, 이야기, 엔딩과 앱 흐름

이야기·앱 흐름 작업(T18)이 정한 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### 모듈과 등록

| 파일 | 내보내는 것 |
| --- | --- |
| `js/story/start.js` | 화면 약속(7.4) `show(container, ctx)`. **`registry.screens.start`로 등록했다.** `js/main.js`가 ctx 없이 열면 앱 흐름을 띄운다 |
| `js/story/app.js` | `startApp(container)` — 앱 하나의 흐름(시작 화면 → 처음 켜는 기기 → 입구 → 회랑·관 → 보스 문 → 보스 → 엔딩 → 서고 완성), `STORY_TUNING` |
| `js/story/start-view.js` | `renderStart(container, { store, manifest, onOpen, onSettings, onCredits?, saveNotice? })` |
| `js/story/settings.js` | `openSettings(host, { store, audio, onRecalibrate, onClose, extras })`, `applyDevice(device, audio)`, `applyTextScale(v)` |
| `js/story/calibration.js` | `runCalibration(host, { audio, store, step: 'earphone' \| 'calibrate', onOffset })` |
| `js/story/entrance.js` | `runEntrance({ host, session, manifest, signal, reread? })` |
| `js/story/ending.js` | `runEnding({ host, session, manifest, signal })`, `processionGroups()`, `checkEnding(choice, concepts)` |
| `js/data/story.js` | `MISSION`(spec 0 그대로), `STORY`(편지, 목소리, 들어가기 글, 좀, 단서, 엔딩 글, 화면 글 — 교사 확인 대상) |

- 스타일은 `css/story.css`. 앱이 이 파일의 `<link>`가 없으면 스스로 머리에 붙이고 다 읽은 뒤 그린다. 연결 단계가 `index.html`에 더해도 겹치지 않는다.
- 앱은 저장 엔진 하나와 소리 엔진 하나를 시작 화면부터 끝까지 함께 쓰고, 기록을 고를 때마다 그 기록의 한 판 세션을 새로 띄운다(기록 목록으로 돌아가면 세션을 치운다).

### 한 판 세션 갈고리(`js/play/session.js`, 주지 않으면 전과 같다)

| 열쇠 | 뜻 |
| --- | --- |
| `store` | 이미 읽은 저장 엔진. 주면 세션이 다시 읽지 않는다(두 엔진이 같은 저장소를 서로 덮어쓰지 않게) |
| `audio` | 앱 하나의 소리 엔진. 주면 첫 조작 잠금 풀기와 치우기는 앱이 맡는다 |
| `onCorridorArrive(a)` | 회랑 도착을 세션보다 먼저 본다. `true`를 돌려주면 세션은 다루지 않는다. 앱은 입구 문(편지 다시 읽기)에 쓴다 |

- 사서 일지의 이야기 단서는 세션의 `clues()` 선택 열쇠로 넘긴다(마친 관마다 `STORY.clues[관 id]` 하나, 관 순서).

### 보스 화면 약속(`registry.screens.boss`, 보스 작업이 만든다)

- 앱은 다섯 관을 모두 마친 기록에서만 회랑에 보스 문(`.story-boss-door`)을 띄우고, 누르면 보스 화면을 연다. 보스 진행 중에 다시 열면 바로 보스 화면을 연다. 보스를 마쳤거나 서고가 완성되면 문은 닫힌 채(`data-state="done"`) 다시 열리지 않는다.
- 모듈은 둘 가운데 하나를 내놓는다.
  - `start(ctx)` → 약속. 끝나면(마쳤든 나갔든) 앱이 이어 받는다.
  - `show(container, ctx)` → `{ dispose() }`. 끝낼 때 `ctx.go(이름)`을 부른다(이름은 보지 않는다).
- `ctx`: `{ session, container, signal, go(), params: { session } }`. `container`는 화면을 덮는 자리(`.story-boss-host`)다. 세션(진행 엔진·소리·세계)은 앱 하나의 것을 함께 쓴다.
- 끝나면 앱이 `progress.leaveBoss()`를 부르고 회랑으로 돌아간다. 그때 `progress.boss.state === 'done'`이면 엔딩을 연다. 등록되지 않았으면 문을 눌러도 알림만 보인다.

### 출처 화면(`registry.screens.credits`, 출처 작업이 만든다)

- 등록되어 있을 때만 시작 화면에 '출처' 단추가 보인다. 화면 약속(7.4) `show(container, { go, params: { back: 'start' } })`로 열고, `go()`를 부르면 시작 화면으로 돌아간다.

### 정한 동작

- 처음 켜는 기기(`device.calibrated === false`)는 기록을 고른 뒤 이어폰 안내와 박자 맞추기(종 여덟 번)를 한다. 건너뛰면 `calibrationOffsetMs: 0`. 마치거나 건너뛰면 `calibrated: true`. 설정의 '박자 다시 맞추기'는 같은 화면의 둘째 단계부터 열고, 정한 값을 지금 세션의 `rhythm.offsetMs`에도 넣는다.
- 설정은 시작 화면과 게임 중(위 띠 '설정') 어디서나 연다. 게임 중 설정에는 '이름 기록 보기'(시작 화면으로)와, 서고 완성 뒤에는 '마지막 카드'(`buildFinalCard`를 지금의 기록으로 다시 그림)가 더 있다.
- 이어 하기는 진행 엔진 `resumeInfo()`를 따른다: 판 중인 관이 있으면 그 관으로, 튜토리얼 전이면 입구, 보스 중이면 보스, 보스를 마쳤으면 엔딩, 서고 완성이면 회랑.
- 관에 들어갈 때 그 관이 아직 손대지 않은 상태(재거나 꽂은 노래가 없음)면 들어가기 글(`.story-wing-intro`)을 보인다. 마치지 않은 관과 보스가 열리기 전 회랑에서는 먹안개 속 좀(`sprite/jom`)이 잠깐 보인다(누를 수 없음, 움직임 줄이기면 움직이지 않음).
- 엔딩 행렬의 무리 i는 관 i(같은 시대 순서)이고, 그 관 칸 노래 셋의 가객 그림(`sprite/singer-<노래 id>`)을 세운다. 근거 개념은 그 관 갈래 개념을 모두 보이되 먹이 아닌 것은 누를 수 없다.

## 추가 제안(T17) — 보스전 「서고의 밤」

보스전 작업(T17)이 정한 것이다. 연결 단계가 확인해 본문에 옮긴다. 위의 정의는 바꾸지 않았고, 새 사건 이름도 없다.

### 모듈

| 파일 | 내보내는 것 |
| --- | --- |
| `js/boss/boss.js` | `start(ctx)` → `Promise<{ completed, reason?, already? }>`, 화면 약속(7.4) `show(container, ctx)`, `BOSS_TUNING` |
| `js/boss/remix-stage.js` | `runRemixStage(ctx)`(2단계), `remixLines(grid, songById)` |
| `js/boss/scene3d.js` · `scene2d.js` | 보스 장면(3D는 보스 화면 안의 작은 그림판 따로, 2D는 `board/boss` 위 DOM 겹) |
| `js/boss/dom.js` | 작은 도우미, 관 자리 모양, 사서 일지 서랍 |
| `js/data/remix.js` · `js/data/boss-text.js` | 리믹스(5절), 보스 글·대사(`BOSS_TEXT`, `BOSS_SPEAKERS`, 교사 확인 대상) |

- 화면 등록 이름 제안: `screens.boss = js/boss/boss.js`. 앱 흐름('추가 제안(T18)')은 `start(ctx)`를 쓴다. `ctx = { session, container, signal, go, params }` 가운데 `session`·`container`·`signal`만 본다. 약속은 마치면 `{ completed: true }`, 닫혀 있거나 나가면 `{ completed: false, reason: 'locked' | 'left' }`로 끝나고, 중단 신호면 `AbortError`로 끝난다. 끝날 때 보스 화면은 스스로 치우고 `progress.leaveBoss()`도 부른다(앱이 다시 불러도 해가 없다).
- `show(container, ctx)`는 `ctx.session` 또는 `ctx.params.session`을 쓰고(없으면 세션을 만든다) 끝나면 `ctx.go('ending' | 'play', { session })`.
- 스타일 `css/boss.css`(연결 단계가 `index.html`에 붙인다). 보스 화면은 `container`를 꽉 덮고(`z-index: 28`), 보스 동안 `container`와 `session.root`에 `has-boss`를 붙여 한 판 위 띠(『분류 수첩』 단추)를 숨긴다(spec 10.1).
- 배경음 이름 `boss`(`assets/audio/bgm/boss.mp3`, 소리 작업 몫). 효과음은 `fog`(틀림), `place`, `gold`.

### 2단계 판정은 한 곳에서(T2·T3 판정 창 맞추기)

- 진행 엔진의 `REMIX_TAP_WINDOW_MS`(앞 500ms·뒤 1500ms)와 박자 엔진의 `REMIX_WINDOW_MS`(앞 700ms·뒤 1500ms)가 따로 있다. 보스는 **박자 엔진의 리믹스 회차(`createRemixSession`, `REMIX_WINDOW_MS`)로만 탭을 판정**하고, 그 결과를 진행 엔진 `bossStage2Tap`의 글줄 방식 입력으로 넘긴다: 맞힌 지점이면 `{ line: 그 지점의 단위 번호, switchLines: grid.switches }`, 틀림이면 `{ line: -1, switchLines }`. 이미 맞힌 지점 근처(`repeat`)는 넘기지 않는다.
- 박자 없는 방식(소리 끔·빗금 모드·소리 판을 열 수 없음)은 이어 붙은 글줄(단위마다 한 줄, `reading`)을 보여 주고, 누른 줄의 단위 번호를 같은 모양으로 넘긴다.
- 그래서 진행 엔진의 `tapMs` 입력과 `REMIX_TAP_WINDOW_MS`는 보스에서 쓰이지 않는다. 연결 단계가 둘 중 하나로 정리할 때 엔진 쪽을 지워도 보스는 바뀌지 않는다.
- 틀림에 실을 관련 개념(`conceptIds`)은 틀린 탭이 난 조각(또는 누른 줄)의 갈래 개념이다.
- 놓친 지점은 한 바퀴가 끝나면 그 앞뒤 단위(`remixReplaySegments`)를 바로 다시 들려주고, 그래도 남으면 '놓친 곳 다시 듣기' 단추로 다시 듣는다.

### 박자 손잡이(`rhythm`) 더하기

- 재기 화면의 `{ engine, buildGrid?, createTapSession?, offsetMs? }`에 선택 열쇠 `buildRemixGrid(remix, getSong)`·`createRemixSession(grid, opts)`를 더한다. 없으면 `js/core/rhythm.js`의 것. 점검 페이지가 빠른 박자 칸을 끼우는 데 쓴다.

### 단계와 기록

- 1단계: 노래는 진행 엔진의 `currentUnseen()` 차례(노래 표 `unseenOrder`)로 나온다. 재기 전에는 관 자리 다섯이 눌리지 않는다. 재기는 `openMeasure({ mode: 'boss', container: 보스 화면 오른쪽 반, journal, journalGlow })`이고 세계 바탕의 반반 틀은 쓰지 않는다. 맞게 꽂은 뒤 '누가 불렀을까?'에서 고른 무리와 정답 무리(`singerGroups`, 여럿일 수 있음)를 함께 보인다.
- 3단계 다시 재기도 보스 방식(다섯 도구, 일지)이다. 재기 화면이 도구를 시조 것만으로 줄이는 방법이 없어서 그렇다(계단 오르기는 다섯 가운데 하나로 쓸 수 있다). 시조 자리에 꽂으면 진행 엔진이 `boss.state = 'done'`을 기록하고, 보스 화면이 `diorama:slot-set { area: 'mentor', index: 0, songId: 'taesan' }`을 낸다(시조관이 지금 관이 아니면 받을 모형이 없고, 시조관에 들어갈 때 한 판 화면이 다시 낸다).
- 이어 하기: 진행 엔진의 `enterBoss()`를 따른다. 1단계 '누가 불렀을까' 전, 2단계, 3단계 도중에 나가면 그 노래·단계를 다시 재기(2단계는 처음)부터 한다.
- 그림 이름은 11.2의 `sprite/jom`·`sprite/jom-king`·`sprite/mentor`, '추가 제안(T26)'의 `board/boss`를 쓴다.
