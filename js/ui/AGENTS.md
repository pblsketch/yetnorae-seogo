# js/ui — 출처 화면

## 맡는 것
- `credits.js`: 출처 화면(화면 이름 `credits`). `show(container, { go, params: { back: 'start' } }) → { dispose(), ready }`. '돌아가기'(`.credits-back`)나 Esc를 누르면 `go(params.back ?? 'start')`를 한 번 부른다. `ready`는 자산 목록을 읽어 쓴 곡·낭송·그림 출처를 채운 뒤 끝난다.
- 목록을 만드는 순수 함수 `buildCredits(songs)`(교과서 노래, 교과서 밖 원문을 이어 붙인 노래, 학자별 노래, 옛 문헌별 노래, 수능 지문, 공개 자료, 노래마다 출처)와 `buildAssetCredits`(자산 목록에서 쓴 곡·낭송·그림), `sourceText(song)`(화면에 보이는 출처 문구 = `citation` + 이어 붙인 단위의 `sourceNote`).
- 화면 갈래 열한 개: `textbook`, `scholars`, `old-texts`, `exam`, `references`, `songs`, `music`, `voice`, `art`, `fonts`, `code`(`section.credits-section[data-section]`).

## 맡지 않는 것
- 고정 글. 제목, 안내 문장, 학자·옛 문헌·공개 자료 이름, 공공누리 문구, 음성 서비스와 요금제 설명, 그림 생성 방식, 글꼴·프로그램 라이선스 줄은 모두 `js/data/credits.js`의 `CREDITS`에 있다(교사 확인 대상).
- 출처 사실 자체. 노래의 출처는 노래 데이터, 자산의 출처는 `assets/manifest.json`이 정한다. 이 화면은 그것을 모아 보일 뿐이다.
- 시작 화면의 '출처' 단추(앱 흐름 몫, 이 화면이 등록되어 있을 때만 보인다).

## 불변식
- 출판사 이름이 화면에 없다. 교과서는 "고등학교 공통국어2 교과서 수록본", "고등학교 문학 교과서 수록 작품"으로만 쓴다.
- 화면에 적는 학자·책·옛 문헌·공개 자료 이름은 노래 출처 문구에 **실제로 있는 것만** 쓴다(지어낸 이름이 없어야 한다). 거꾸로 노래 출처 문구에 나오는 『책』은 모두 화면(옛 문헌 목록이나 학자의 책)에 나와야 한다. 새 노래가 새 『책』을 인용하면 `CREDITS.oldTexts.books` 등에 더한다.
- 제작 메모(`citationNote`)는 화면에 넣지 않는다.
- 바깥 주소로 요청하지 않는다. 주소는 글로만 보인다. 자산 목록은 같은 사이트의 `assets/manifest.json`을 한 번 읽고, 읽지 못하면 쓴 곡·낭송·그림 목록만 빈다.
- 공공누리 출처 문구는 `assets/audio/CREDITS.md`의 문구와 같아야 하고, Three.js 저작권 줄은 `vendor/three/LICENSE`와 같아야 한다.
- 몸통만 스크롤되어 끝까지 읽혀야 하고, 글자 크기 1.3에서도 가로로 넘치지 않으며, 단추는 48px 이상이다.

## 구현 방식
- 목록은 열 때마다 노래 데이터와 자산 목록에서 다시 만든다. 그래서 노래나 자산이 바뀌어도 이 화면 코드는 고칠 필요가 없다.
- 스타일은 `css/credits.css`.

## 점검
- `node tests/check-credits.mjs`: 데이터 맞춤(화면의 이름 ↔ 노래 출처 문구, 공공누리 문구, Three.js 저작권 줄, 글꼴 라이선스 파일), 브라우저에서 844×390·1366×768과 글자 크기 1·1.3으로 열한 갈래와 필요한 말, 노래마다 출처 45편, 출판사 이름 없음, 넘침 없음, 돌아가기·Esc, 시작 화면 → 출처 → 돌아가기(`tests/pages/credits-app.html`), 콘솔 오류와 바깥 요청 없음. 음성 사례(지어낸 학자, 빠진 옛 문헌, 빠진 갈래, 출판사 이름) 포함.
