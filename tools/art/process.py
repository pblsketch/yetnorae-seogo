# 생성 원본(assets/raw/art)을 게임용 가공본(assets/img)으로 만들고 자산 목록 조각(assets/manifest.parts/art.json)을 쓴다(T26).
# 사용: python tools/art/process.py
#   - 인물·기념품·카드 장식: 자홍(#FF00FF) 바탕을 빼서 투명하게 하고(가장자리 색 되돌림), 내용에 맞춰 자른 뒤 줄인다.
#   - 재질 무늬: 이음매가 보이면 반 칸 밀어 겹치는 방식으로 이음매를 없앤다.
#   - 그림 판: 16:9로 맞춰 1600×900으로 줄인다.
#   - 가객은 같은 사람(같은 이름 모를 무리)의 그림 하나를 노래 id마다 sprite/singer-<노래 id>로 놓는다(README 11.2).
# 노래 목록(가객·기념품)은 js/data/songs/index.js에서 읽는다.
import hashlib, json, subprocess, sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalog as C  # noqa: E402
from jobs import all_jobs, style_dir, ROOT  # noqa: E402
import fix_hyangga  # noqa: E402

IMG = ROOT / 'assets' / 'img'
PART = ROOT / 'assets' / 'manifest.parts' / 'art.json'

SPRITE_H = 768          # 종이 인형 높이(px)
KEEPSAKE = 512          # 기념품 정사각 한 변
TEXTURE = 512           # 재질 무늬 한 변
BOARD = (1600, 900)     # 그림 판
CARD = {'frame': (1600, 900), 'keepsake': (640, 960)}

EXTRA_NOTES = {'board/hyangga': ' — 탑의 칸 수(아래부터 4·8·10, 맨 위층 마지막 두 칸 앞에 문)는 생성 뒤 tools/art/fix_hyangga.py로 맞춤'}

LICENSE = ('OpenAI Codex CLI의 이미지 생성(image_gen)으로 이 프로젝트를 위해 만든 그림이다. '
           'OpenAI 이용 약관에 따라 생성물의 권리는 만든 사람에게 있고 상업적으로 쓸 수 있다.')
SOURCE = 'Codex 이미지 생성(Codex CLI image_gen)'


def load_songs():
    js = ("import { songs } from './js/data/songs/index.js';"
          "console.log(JSON.stringify(songs.map(s => ({ id: s.id, title: s.title, singer: s.singer, keepsake: s.keepsake }))));")
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=str(ROOT), capture_output=True, text=True,
                         encoding='utf-8', check=True).stdout
    return json.loads(out)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def key_magenta(im):
    """자홍 바탕을 알파로 바꾸고, 반투명 가장자리의 섞인 자홍을 덜어 원래 색을 되돌린다."""
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g                       # 자홍스러움: 바탕은 약 255, 그림은 0 이하
    alpha = 1.0 - np.clip((m - 40.0) / (190.0 - 40.0), 0.0, 1.0)
    key = np.array([255.0, 0.0, 255.0], dtype=np.float32)
    al = np.maximum(alpha, 1e-3)[..., None]
    rgb = (a - (1.0 - alpha)[..., None] * key) / al
    rgb = np.where(alpha[..., None] > 0.98, a, rgb)
    rgb = np.clip(rgb, 0, 255)
    # 남은 자홍 기운(빨강·파랑이 초록보다 많이 높은 가장자리)을 누른다
    spill = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1] - 25.0, 0, None)
    edge = (alpha < 0.98)[..., None]
    rgb = np.where(edge, rgb - np.stack([spill, np.zeros_like(spill), spill], -1), rgb)
    alpha = np.where(alpha < 0.04, 0.0, alpha)
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def crop_alpha(im, pad_ratio=0.02):
    bbox = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bbox:
        raise ValueError('투명하게 만든 뒤 남은 그림이 없다')
    x0, y0, x1, y1 = bbox
    pad = int(max(x1 - x0, y1 - y0) * pad_ratio)
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def fit_square(im, side):
    w, h = im.size
    s = max(w, h)
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.paste(im, ((s - w) // 2, (s - h) // 2))
    return canvas.resize((side, side), Image.LANCZOS)


def _tile_axis(a, axis):
    """한 방향으로 끝 띠를 앞 띠에 겹쳐 섞는다. 결과의 마지막 줄 다음에 첫 줄이 원본에서처럼 이어진다."""
    a = np.moveaxis(a, axis, 1)
    n = a.shape[1]
    b = n // 8
    main = a[:, :n - b].copy()
    tail = a[:, n - b:]
    w = np.linspace(0.0, 1.0, b, dtype=np.float32)[None, :, None]
    main[:, :b] = tail * (1 - w) + main[:, :b] * w
    return np.moveaxis(main, 1, axis)


def seamless(im):
    """가장자리가 이어지지 않는 방향만 끝 띠를 겹쳐 섞어 바둑판으로 이어지게 한다(겹친 만큼 조금 작아진다)."""
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    inner_x = np.mean(np.abs(np.diff(a, axis=1)))
    inner_y = np.mean(np.abs(np.diff(a, axis=0)))
    fixed = False
    if np.mean(np.abs(a[:, 0] - a[:, -1])) > inner_x * 1.8:
        a = _tile_axis(a, 1)
        fixed = True
    if np.mean(np.abs(a[0] - a[-1])) > inner_y * 1.8:
        a = _tile_axis(a, 0)
        fixed = True
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
    if fixed:  # 정사각으로 되돌린다
        s = min(out.size)
        out = out.crop((0, 0, s, s))
    return out, fixed


def save_webp(im, path, quality=86):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, 'WEBP', quality=quality, method=6, alpha_quality=90)


def rel(p):
    return Path(p).resolve().relative_to(ROOT).as_posix()


def main():
    songs = load_songs()
    if IMG.exists():  # 지난 가공본을 지우고 새로 만든다(없어진 노래의 그림이 남지 않게)
        for f in IMG.rglob('*.webp'):
            f.unlink()
    sdir = style_dir()
    jobs = {j['key']: j for j in all_jobs()}
    entries = []
    built = {}  # job key → (가공 그림, 원본 경로)
    missing = []

    for key, j in jobs.items():
        src = (sdir / f"{j['reuse']}.png") if j.get('reuse') else j['raw_path']
        if not src or not Path(src).exists():
            missing.append(key)
            continue
        im = Image.open(src)
        g = j['group']
        if g in ('sprite', 'singer'):
            out = crop_alpha(key_magenta(im))
            if j['id'] in ('jom', 'jom-king'):
                out = fit_square(out, KEEPSAKE if j['id'] == 'jom' else 768)
            else:
                out = out.resize((round(out.width * SPRITE_H / out.height), SPRITE_H), Image.LANCZOS)
        elif g == 'keepsake':
            out = fit_square(crop_alpha(key_magenta(im), 0.04), KEEPSAKE)
        elif g == 'card':
            out = key_magenta(im).resize(CARD[j['id']], Image.LANCZOS)
        elif g == 'texture':
            sq = im.convert('RGB')
            s = min(sq.size)
            sq = sq.crop(((sq.width - s) // 2, (sq.height - s) // 2, (sq.width - s) // 2 + s, (sq.height - s) // 2 + s))
            sq, _ = seamless(sq)
            out = sq.resize((TEXTURE, TEXTURE), Image.LANCZOS)
        elif g == 'board':
            rgb = im.convert('RGB')
            tw = rgb.height * 16 / 9
            if rgb.width > tw:
                x0 = int((rgb.width - tw) / 2)
                rgb = rgb.crop((x0, 0, x0 + int(tw), rgb.height))
            else:
                th = rgb.width * 9 / 16
                y0 = int((rgb.height - th) / 2)
                rgb = rgb.crop((0, y0, rgb.width, y0 + int(th)))
            out = rgb.resize(BOARD, Image.LANCZOS)
            if j['id'] == 'hyangga':
                if sha(src) == fix_hyangga.RAW_SHA256:
                    out = fix_hyangga.fix(out)
                else:
                    print('경고: 향가관 그림 판 원본이 바뀌어 탑 칸 수 맞춤 좌표를 다시 재야 한다(tools/art/fix_hyangga.py)')
        built[key] = (out, src)

    def add(path, key, note, kind_note):
        j = jobs[key]
        out, src = built[key]
        q = 80 if j['group'] == 'board' else 86
        save_webp(out, path, q)
        ref = j.get('reuse') or j.get('ref')
        prompt = f"tools/art/prompts/{j['reuse']}.txt" if j.get('reuse') else rel(j['prompt_path'])
        entries.append({
            'path': rel(path),
            'kind': 'image',
            'source': SOURCE,
            'generator': 'tools/art/gen.ps1(gpt-image, 품질 high)' + (f' · 화풍 참조 {ref}' if ref else '') +
                         (' · 승인된 화풍 샘플을 그대로 가공' if j.get('reuse') else ''),
            'license': LICENSE,
            'commercialUse': True,
            'notes': f'{kind_note}: {note}' + EXTRA_NOTES.get(key, ''),
            'prompt': prompt,
            'rawSha256': sha(src),
            'image': {'format': 'webp', 'width': out.width, 'height': out.height, 'alpha': out.mode == 'RGBA'},
        })

    if missing:
        print('원본이 없는 그림:', ', '.join(missing))

    NAMES = {'student-a': '견습 사서(생김새 a)', 'student-b': '견습 사서(생김새 b)', 'mentor': '선대 사서',
             'jom': '좀', 'jom-king': '좀 대왕'}
    for c in C.CHARACTERS:
        k = f"sprite/{c['id']}"
        if k in built:
            add(IMG / 'sprite' / f"{c['id']}.webp", k, NAMES[c['id']], '인물')

    problems = []
    for s in songs:
        name = s['singer']['name']
        sid = C.SINGER_IDS.get(name)
        if not sid:
            problems.append(f"가객 그림이 정해지지 않은 이름: {name}({s['id']})")
            continue
        k = f'singer/{sid}'
        if k in built:
            add(IMG / 'sprite' / f"singer-{s['id']}.webp", k, f"{name}(「{s['title']}」)", '가객')
    for s in songs:
        k = f"keepsake/{s['id']}"
        if k in built:
            ks = s.get('keepsake') or {}
            mind = (ks.get('kind') == 'mind') or jobs[k].get('mind')
            add(IMG / 'keepsake' / f"{s['id']}.webp", k,
                f"{ks.get('name', '')}(「{s['title']}」)", '노래 속 마음 상징' if mind else '기념품')
        elif k not in jobs:
            problems.append(f"기념품 그림 목록에 없는 노래: {s['id']}")
    for t in C.TEXTURES:
        k = f"texture/{t['id']}"
        if k in built:
            add(IMG / 'texture' / f"{t['id']}.webp", k, t['id'], '재질 무늬')
    for b in C.BOARDS:
        k = f"board/{b['id']}"
        if k in built:
            add(IMG / 'board' / f"{b['id']}.webp", k, b['id'], '2D 그림 판')
    for c in C.CARDS:
        k = f"card/{c['id']}"
        if k in built:
            add(IMG / 'card' / f"{c['id']}.webp", k, c['id'], '카드 장식')

    PART.parent.mkdir(parents=True, exist_ok=True)
    PART.write_text(json.dumps({'version': 1, 'assets': entries}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'가공 {len(entries)}개 → {rel(PART)}')
    for p in problems:
        print('문제:', p)
    if problems or missing:
        sys.exit(1)


if __name__ == '__main__':
    main()
