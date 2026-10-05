# 사용자 확인용 모아 보기(접촉 인화지)를 만든다(T26). 가공본(assets/img)을 묶음별로 한 장에 모은다.
# 사용: python tools/art/contact.py [출력 폴더(기본 assets/raw/review)]
# 저장소에 올리지 않는 assets/raw 아래에 쓴다.
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
IMG = ROOT / 'assets' / 'img'


def font(size):
    for f in ['C:/Windows/Fonts/malgun.ttf', 'C:/Windows/Fonts/arial.ttf']:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def sheet(files, cell, cols, out, title):
    rows = (len(files) + cols - 1) // cols
    cw, ch = cell
    lab = 28
    W, H = cols * cw, rows * (ch + lab) + 50
    s = Image.new('RGB', (W, H), (243, 234, 214))
    d = ImageDraw.Draw(s)
    d.text((10, 10), title, fill=(43, 43, 43), font=font(26))
    for i, f in enumerate(files):
        x, y = (i % cols) * cw, 50 + (i // cols) * (ch + lab)
        im = Image.open(f).convert('RGBA')
        im.thumbnail((cw - 10, ch - 10))
        bg = Image.new('RGBA', (cw, ch), (226, 214, 190, 255))
        # 투명한 자리가 보이도록 옅은 바둑판
        dd = ImageDraw.Draw(bg)
        for yy in range(0, ch, 16):
            for xx in range(0, cw, 16):
                if (xx // 16 + yy // 16) % 2:
                    dd.rectangle([xx, yy, xx + 15, yy + 15], fill=(236, 226, 204, 255))
        bg.alpha_composite(im, ((cw - im.width) // 2, (ch - im.height) // 2))
        s.paste(bg.convert('RGB'), (x, y))
        d.text((x + 6, y + ch + 2), f.stem, fill=(43, 43, 43), font=font(18))
    out.parent.mkdir(parents=True, exist_ok=True)
    s.save(out, quality=88)
    print('모아 보기:', out)


def main():
    outdir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'assets' / 'raw' / 'review'
    sp = sorted((IMG / 'sprite').glob('*.webp'))
    chars = [f for f in sp if not f.stem.startswith('singer-')]
    # 가객은 같은 그림이 여러 노래에 놓이므로 그림마다 한 번만(첫 노래 이름으로) 보인다
    seen, singers = set(), []
    for f in sorted(f for f in sp if f.stem.startswith('singer-')):
        h = f.read_bytes()
        if h in seen:
            continue
        seen.add(h)
        singers.append(f)
    sheet(chars, (300, 420), 5, outdir / '1-characters.jpg', 'characters (student-a, student-b, mentor, jom, jom-king)')
    sheet(singers, (240, 360), 9, outdir / '2-singers.jpg', f'singers ({len(singers)} distinct, file name = first song id)')
    sheet(sorted((IMG / 'keepsake').glob('*.webp')), (260, 280), 9, outdir / '3-keepsakes.jpg', 'keepsakes (file name = song id)')
    sheet(sorted((IMG / 'board').glob('*.webp')), (480, 300), 4, outdir / '4-boards.jpg', '2D boards')
    sheet(sorted((IMG / 'texture').glob('*.webp')) + sorted((IMG / 'card').glob('*.webp')), (320, 320), 5,
          outdir / '5-textures-cards.jpg', 'textures + card frames')


if __name__ == '__main__':
    main()
