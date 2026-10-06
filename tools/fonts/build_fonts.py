# -*- coding: utf-8 -*-
"""게임에 쓰인 글자만 남긴 부분 글꼴(woff2)을 만든다(spec 16.6, 시리즈 방식).

    python tools/fonts/build_fonts.py

원본 글꼴(SIL Open Font License 1.1)은 tools/fonts_src/에 둔다(저장소에는 올리지 않음).
  - NotoSerifKR-VF.ttf   Noto Serif KR 가변 글꼴  https://github.com/google/fonts/tree/main/ofl/notoserifkr
  - OFL-NotoSerifKR.txt  그 라이선스 전문
이 도구는 내려받지 않는다. 없으면 시리즈의 다른 게임(구운몽 tools/fonts_src/)에서 복사해 오세요.

글이나 데이터를 고쳐 새 글자가 생겼다면 이 도구를 다시 돌리세요. `node tests/check-fonts.mjs`가
게임 글의 글자가 모두 글꼴에 있는지 보고, 빠진 글자가 있으면 실패합니다.

만드는 것(css/base.css의 @font-face와 이름이 같다)
  - assets/fonts/yetnorae-text-400.woff2  본문(보통 굵기)
  - assets/fonts/yetnorae-text-700.woff2  본문(굵게)
  - assets/fonts/OFL.txt                  라이선스 전문(OFL은 글꼴과 함께 배포하도록 요구한다)
  - assets/fonts/coverage.json            담은 글자와 원본 글꼴에 없어 기기 글꼴로 그려지는 글자 기록

글꼴 하나(YetnoraeText)가 본문을 맡고, 같은 파일을 옛한글 자모·한자 범위(unicode-range)로만 묶은
YetnoraeUI가 화면 글(고딕 계열 기기 글꼴)의 옛 표기와 향찰을 맡는다.

옛한글: 게임 글에는 첫소리·가운뎃소리·끝소리 자모(U+1100–11FF, A960–A97F, D7B0–D7FF)를 이어 쓴 옛 글자가 있다.
Noto Serif KR은 이 자모를 GSUB의 ljmo·vjmo·tjmo(그리고 ccmp)로 한 글자 모양으로 모은다. 부분 글꼴에도
그 기능과 바뀐 모양(대체 글리프)이 남도록 layout_features=['*']로 모든 기능을 남기고, 끝에 남았는지 확인한다.

OFL은 고친 글꼴(부분 글꼴 포함)에 원래 이름을 그대로 쓰지 않게 하므로 글꼴 이름을 Yetnorae…로 바꾼다.
Noto Serif KR에 없는 드문 한자(향찰의 이체자 등)는 브라우저가 기기 글꼴로 대신 그린다(시리즈와 같음).
"""
import glob
import json
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'tools', 'fonts_src')
OUT = os.path.join(ROOT, 'assets', 'fonts')
SOURCE_FONT = os.path.join(SRC, 'NotoSerifKR-VF.ttf')
SOURCE_OFL = os.path.join(SRC, 'OFL-NotoSerifKR.txt')

FAMILY = 'Yetnorae Text'
WEIGHTS = (400, 700)          # css에서 쓰는 굵기(font-weight 400, 700)
OLD_JAMO_FEATURES = ('ljmo', 'vjmo', 'tjmo', 'ccmp')

# 게임 글이 담긴 파일(tests/check-fonts.mjs의 SHIPPED_TEXT와 같은 범위)
TEXT_GLOBS = ('js/**/*.js', 'css/*.css', 'index.html', 'manifest.webmanifest')
# 글에는 없어도 화면에 나올 수 있는 기호
EXTRA = '「」『』〈〉《》·…—–→←↑↓“”‘’○●◇◆☆★'


def shipped_files():
    out = []
    for g in TEXT_GLOBS:
        out += glob.glob(os.path.join(ROOT, g), recursive=True)
    return sorted(set(out))


def ks_hangul():
    """기록 이름처럼 학생이 쓰는 글을 위해 KS X 1001의 현대 한글 2,350자를 함께 담는다."""
    out = []
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                out.append(bytes([hi, lo]).decode('euc-kr'))
            except UnicodeDecodeError:
                pass
    return set(out)


def used_chars():
    chars = set(chr(c) for c in range(0x20, 0x7F))
    for f in shipped_files():
        with open(f, encoding='utf-8') as fh:
            chars |= set(fh.read())
    chars |= set(EXTRA)
    chars |= ks_hangul()
    return sorted(c for c in chars if c >= ' ')


def rename(font, family):
    for rec in font['name'].names:
        if rec.nameID in (1, 4, 16, 21):
            rec.string = family
        elif rec.nameID == 6:
            rec.string = family.replace(' ', '')
        elif rec.nameID == 3:
            rec.string = family.replace(' ', '') + ';subset'


def features_of(font):
    if 'GSUB' not in font:
        return set()
    return set(fr.FeatureTag for fr in font['GSUB'].table.FeatureList.FeatureRecord)


def build(text, weight, out):
    font = TTFont(SOURCE_FONT)
    font = instancer.instantiateVariableFont(font, {'wght': weight})
    cmap = font.getBestCmap()
    missing = [c for c in text if ord(c) not in cmap and c.strip()]
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']   # 옛한글을 모으는 ljmo·vjmo·tjmo·ccmp를 남긴다
    opts.layout_scripts = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(text))
    sub.subset(font)
    lost = [t for t in OLD_JAMO_FEATURES if t not in features_of(font)]
    if lost:
        raise SystemExit(f'부분 글꼴에서 옛한글 기능이 빠졌다: {lost}')
    rename(font, FAMILY)
    font.flavor = 'woff2'
    font.save(out)
    glyphs = len(font.getGlyphOrder())
    print(f'{os.path.basename(out)}: 글자 {len(text)}개, 글리프 {glyphs}개, {os.path.getsize(out) // 1024}KB, '
          f'원본에 없는 글자 {len(missing)}개' + (f' ({"".join(missing)})' if missing else ''))
    return missing, glyphs


def main():
    for p in (SOURCE_FONT, SOURCE_OFL):
        if not os.path.exists(p):
            raise SystemExit(f'원본이 없다: {os.path.relpath(p, ROOT)} — 시리즈의 tools/fonts_src/에서 복사해 오세요(내려받지 않는다).')
    os.makedirs(OUT, exist_ok=True)
    text = used_chars()
    missing = []
    files = {}
    for w in WEIGHTS:
        name = f'yetnorae-text-{w}.woff2'
        missing, glyphs = build(text, w, os.path.join(OUT, name))
        files[name] = {'weight': w, 'glyphs': glyphs}
    with open(os.path.join(OUT, 'OFL.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('옛 노래 서고의 부분 글꼴 Yetnorae Text(yetnorae-text-*.woff2)는 Noto Serif KR에서 게임에 쓰인 글자만 남겨 만든 것이다.\n')
        f.write('원래 글꼴과 같이 SIL Open Font License 1.1을 따른다. 아래는 원래 글꼴의 라이선스 전문이다.\n\n')
        f.write('===== Noto Serif KR =====\n')
        with open(SOURCE_OFL, encoding='utf-8') as src:
            f.write(src.read().strip() + '\n')
    coverage = {
        'version': 1,
        'family': FAMILY,
        'source': 'Noto Serif KR (NotoSerifKR-VF.ttf, SIL OFL 1.1)',
        'files': files,
        'features': list(OLD_JAMO_FEATURES),
        'chars': len(text),
        'missingInSource': ''.join(missing),
        'note': '원본 글꼴에 없는 글자는 브라우저가 기기 글꼴로 대신 그린다. tests/check-fonts.mjs가 이 목록을 따로 확인한다.',
    }
    with open(os.path.join(OUT, 'coverage.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(coverage, f, ensure_ascii=False, indent=2)
        f.write('\n')
    # 자산 목록 조각(README 11.1). 연결 단계가 tools/manifest/build.mjs로 assets/manifest.json에 합친다.
    part = {'version': 1, 'assets': [{
        'path': f'assets/fonts/{name}',
        'kind': 'font',
        'source': 'Noto Serif KR(Google Fonts, NotoSerifKR-VF.ttf)에서 게임에 쓰인 글자만 남긴 부분 글꼴',
        'generator': f'tools/fonts/build_fonts.py — fontTools 부분 글꼴, 굵기 {info["weight"]} 고정, 모든 OpenType 기능(옛한글 ljmo·vjmo·tjmo·ccmp 포함) 유지, 글꼴 이름을 {FAMILY}로 바꿈',
        'license': 'SIL Open Font License 1.1(상업 이용·수정·재배포 가능, 수정본은 원래 이름을 쓰지 않음). 라이선스 전문: assets/fonts/OFL.txt',
        'commercialUse': True,
        'notes': f'글자 {len(text)}자, 글리프 {info["glyphs"]}개',
    } for name, info in files.items()]}
    with open(os.path.join(ROOT, 'assets', 'manifest.parts', 'font.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(part, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('assets/fonts/OFL.txt, coverage.json, assets/manifest.parts/font.json 씀')


if __name__ == '__main__':
    main()
