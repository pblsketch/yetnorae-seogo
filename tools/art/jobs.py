# 그림 목록(catalog.py)을 생성 작업 목록으로 펼친다. build_prompts.py·genqueue.py·process.py가 함께 쓴다.
from pathlib import Path
import catalog as C

ROOT = Path(__file__).resolve().parents[2]          # 저장소(작업 트리) 뿌리
RAW = ROOT / 'assets' / 'raw' / 'art'               # 생성 원본(저장소에 올리지 않음)
PROMPTS = ROOT / 'tools' / 'art' / 'prompts'


def style_dir():
    # 승인된 화풍 샘플. 작업 트리에 없으면 본 저장소의 assets/raw/style을 찾는다.
    for base in [ROOT, *ROOT.parents]:
        d = base / 'assets' / 'raw' / 'style'
        if (d / 'style_singer.png').exists():
            return d
    return None


def _job(group, id, prompt, size, ref, asset=None, transparent=True):
    return dict(key=f'{group}/{id}', group=group, id=id, prompt=prompt, size=size, ref=ref,
                asset=asset, transparent=transparent,
                prompt_path=PROMPTS / group / f'{id}.txt', raw_path=RAW / group / f'{id}.png')


def all_jobs():
    jobs = []
    for c in C.CHARACTERS:
        if c.get('reuse'):
            jobs.append(dict(_job('sprite', c['id'], None, None, None), reuse=c['reuse']))
            continue
        if c.get('no_sprite_frame'):
            prompt = ' '.join([c['subject'], C.STYLE, C.NO_MAGENTA, C.CHROMA])
        else:
            prompt = ' '.join([C.SPRITE_LEAD + c['subject'] + C.SPRITE_TAIL, C.STYLE, C.NO_MAGENTA, C.CHROMA])
        jobs.append(_job('sprite', c['id'], prompt, c.get('size', '1024x1536'), c.get('ref')))
    for s in C.SINGERS:
        if s.get('reuse'):
            jobs.append(dict(_job('singer', s['id'], None, None, None), reuse=s['reuse']))
            continue
        prompt = ' '.join([C.SPRITE_LEAD + s['subject'] + C.SPRITE_TAIL, C.STYLE, C.NO_MAGENTA, C.CHROMA])
        jobs.append(_job('singer', s['id'], prompt, '1024x1536', s.get('ref', 'style_singer')))
    for k in C.KEEPSAKES:
        lead = '' if k.get('mind') else C.KEEP_LEAD
        prompt = ' '.join([lead + k['subject'], C.STYLE, C.NO_MAGENTA, C.CHROMA])
        jobs.append(dict(_job('keepsake', k['id'], prompt, '1024x1024', k.get('ref', 'style_keepsake')),
                         mind=bool(k.get('mind'))))
    for t in C.TEXTURES:
        prompt = ' '.join([C.TEX_LEAD + t['subject'], C.STYLE])
        jobs.append(_job('texture', t['id'], prompt, '1024x1024', t.get('ref'), transparent=False))
    for b in C.BOARDS:
        prompt = ' '.join([C.BOARD_LEAD + b['subject'] + b.get('tail', C.BOARD_TAIL), C.STYLE])
        jobs.append(_job('board', b['id'], prompt, '1536x864', b.get('ref', 'style_wing'), transparent=False))
    for c in C.CARDS:
        prompt = ' '.join([c['subject'], C.STYLE])
        jobs.append(_job('card', c['id'], prompt, c['size'], c.get('ref')))
    return jobs
