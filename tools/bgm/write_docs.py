# -*- coding: utf-8 -*-
"""sources.json과 build_sfx.py의 RECIPES로 출처 문서와 자산 목록 조각을 다시 쓴다.

    python tools/bgm/write_docs.py   → assets/audio/CREDITS.md, assets/manifest.parts/audio.json

곡·효과음을 바꾸면 sources.json이나 RECIPES만 고치고 이 스크립트를 다시 돌린다(손으로 고치지 않는다).
"""
import json
import os

from common import CFG, ROOT
from build_sfx import RECIPES

KOGL = ("본 저작물은 '국립국악원'에서 공공누리 제1유형으로 개방한 '국악기 디지털 음원(작성자: 국립국악원)'을 "
        "이용하였으며, 해당 저작물은 '국립국악원, https://www.gugak.go.kr/digitaleum'에서 무료로 다운받으실 수 있습니다.")
KOGL_SHORT = '공공누리 제1유형(출처표시) — 국립국악원 「국악기 디지털 음원」'
SYNTH = '이 게임 제작자가 스크립트로 직접 합성(외부 음원 없음). 상업 이용 제한 없음'
DATE = CFG['download']['date']


def ids_text(ids):
    return ', '.join(f'`{i}`' for i in ids)


def credits():
    L = []
    L.append('# 소리 출처\n')
    L.append('이 폴더의 배경음 9곡과 장구·효과음 일부는 **국립국악원**이 **공공누리 제1유형(출처표시)**으로 개방한 '
             '「국악기 디지털 음원」(디지털 이음)의 악구 녹음을 잘라 잇거나 다듬어 만들었다. '
             '나머지 효과음은 이 게임을 만들며 스크립트로 직접 합성했다.\n')
    L.append('- 출처: 국립국악원 「국악기 디지털 음원」 악구 다운로드 — https://www.gugak.go.kr/digitaleum/front/phrase/list.do')
    L.append('- 이용 조건: 공공누리 제1유형(출처표시, 상업 이용·변경 가능) — https://www.kogl.or.kr/open/info/license_info/by.do')
    L.append('- 저작권자: 국립국악원. 이 게임은 국립국악원과 관계가 없으며, 국립국악원이 후원하거나 보증한 것이 아니다.')
    L.append(f'- 내려받은 날: {DATE}. 사이트 양식의 사용 목적은 '
             f"{CFG['download']['form']['usePurposeGb']}·{CFG['download']['form']['usePurpose']}으로 냈다"
             '(사용 목적 설문일 뿐이고, 공공누리 제1유형은 상업 이용도 허락한다).')
    L.append('- 도구: `tools/bgm/fetch.py`(내려받기) → `tools/bgm/build_bgm.py`(배경음) · `tools/bgm/build_sfx.py`(효과음) '
             '→ `tools/bgm/write_docs.py`(이 문서와 자산 목록). 원본 WAV는 `tools/music_src/`에 두고 커밋하지 않는다.\n')
    L.append('> ' + KOGL + '\n')

    L.append('## 배경음 (`bgm/`)\n')
    L.append('변경한 것: 번호 순서대로 악구 잇기, 되풀이 이음매 편집, 모노 변환, 음량 맞춤(약 −20 LUFS, 봉우리 리미터로 '
             'True Peak −1.5 dBFS 아래), MP3 64kbps로 줄이기.\n')
    L.append('- 장단이 자유로운 곡(free): 악구 앞뒤 무음을 줄이고 0.04초 겹쳐 이음, 끝 2.5초를 처음 2.5초에 겹쳐 되풀이 이음매를 없앰.')
    L.append('- 장단이 일정한 곡(metric): 장단 경계에서 잘린 악구를 0.01초 겹쳐 이음, 길이를 그대로 두어 되풀이해도 박이 밀리지 않음, '
             '양끝 15ms만 여닫음. 60초보다 짧으면 악구 묶음을 한 번 더 이어 늘림.\n')
    L.append('| 파일 | 쓰는 곳 | 악기 · 갈래 | 원곡(악곡) | 악구 번호 | 잇는 법 |')
    L.append('|---|---|---|---|---|---|')
    for key, t in CFG['bgm'].items():
        L.append(f"| bgm/{key}.mp3 | {t['use']} | {t['instrument']} · {t['genre']} | {t['piece']} | {ids_text(t['ids'])} | "
                 f"{'free' if t['free'] else 'metric'} |")
    L.append('')
    L.append('고른 까닭\n')
    for key, t in CFG['bgm'].items():
        L.append(f"- `{key}` — {t['why']}")
    L.append('')

    L.append('## 장구와 효과음 (`sfx/`)\n')
    L.append('녹음에서 자른 것은 타점 1.5ms 앞부터 잘라 소리가 곧바로 시작한다(두드리기 지연을 줄이려고). '
             '모두 모노 MP3 96kbps, 봉우리를 소리마다 정한 값에 맞추고 끝 30ms를 닫았다.\n')
    L.append('| 파일 | 쓰는 곳 | 만든 방식 | 원본(악구) | 다듬은 것 |')
    L.append('|---|---|---|---|---|')
    for name, r in RECIPES.items():
        src = f"`{r['src']}` {CFG['sfx_raw'][r['src']]}" if r['src'] else '—'
        L.append(f"| sfx/{name}.mp3 | {USE[name]} | {r['kind']} | {src} | {r['how']} |")
    L.append('')
    L.append(f'합성한 소리: {SYNTH}.')
    return '\n'.join(L) + '\n'


USE = {
    'janggu': '음보 두드리기 센 타',
    'janggu-soft': '두드리기 여린 타',
    'place': '책을 칸에 꽂음·뺌',
    'bell': '박자 맞추기 종소리(여덟 번)',
    'bind': '칸 제본(실 묶음)',
    'gold': '덤 칸 금박',
    'basket': '바구니에 담음',
    'fog': '먹안개가 물러남',
    'pop': '판정에서 틀린 노래가 삐져나옴',
    'page': '수첩·일지 책장 넘김',
}


def manifest():
    assets = []
    for key, t in CFG['bgm'].items():
        assets.append({
            'path': f'assets/audio/bgm/{key}.mp3', 'kind': 'bgm',
            'source': f"국립국악원 「국악기 디지털 음원」 {t['instrument']} {t['genre']} {t['piece']} 악구 {', '.join(t['ids'])}",
            'generator': 'tools/bgm/build_bgm.py (악구 잇기, 되풀이 이음매, −20 LUFS, 모노 MP3 64kbps)',
            'license': KOGL, 'commercialUse': True,
            'notes': f"{t['use']}. 내려받은 날 {DATE}",
        })
    for name, r in RECIPES.items():
        rec = r['src'] is not None
        assets.append({
            'path': f'assets/audio/sfx/{name}.mp3', 'kind': 'sfx',
            'source': (f"국립국악원 「국악기 디지털 음원」 {CFG['sfx_raw'][r['src']]} 악구 {r['src']}"
                       + (' + 직접 합성' if r['kind'] != '녹음' else '')) if rec else '직접 합성',
            'generator': f"tools/bgm/build_sfx.py — {r['how']}",
            'license': KOGL if rec else SYNTH, 'commercialUse': True,
            'notes': USE[name] + (f'. 내려받은 날 {DATE}' if rec else ''),
        })
    return {'version': 1, 'assets': assets}


def main():
    cpath = os.path.join(ROOT, 'assets', 'audio', 'CREDITS.md')
    open(cpath, 'w', encoding='utf-8', newline='\n').write(credits())
    mdir = os.path.join(ROOT, 'assets', 'manifest.parts')
    os.makedirs(mdir, exist_ok=True)
    mpath = os.path.join(mdir, 'audio.json')
    open(mpath, 'w', encoding='utf-8', newline='\n').write(json.dumps(manifest(), ensure_ascii=False, indent=2) + '\n')
    print('씀', cpath, mpath)


if __name__ == '__main__':
    main()
