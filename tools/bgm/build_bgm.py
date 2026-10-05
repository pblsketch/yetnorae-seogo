# -*- coding: utf-8 -*-
"""국립국악원 악구(tools/music_src/)를 장소별 배경음 assets/audio/bgm/<이름>.mp3로 잇는다.

    python tools/bgm/build_bgm.py              # 아홉 곡 모두
    python tools/bgm/build_bgm.py boss ending  # 몇 곡만

순서(시리즈 나랏말ᄊᆞ미 bgm_build.py, 구운몽 make_bgm.py와 같은 방식)
1. 모노 44.1kHz로 읽는다.
2. 잇기
   - free(장단이 자유로운 곡): 앞뒤 무음을 숨 쉴 만큼만 남기고 0.04초 겹쳐 잇는다.
     되풀이 이음매는 끝 2.5초를 처음 2.5초에 겹쳐(등전력 크로스페이드) 끊김 없이 돈다.
   - metric(장단이 일정한 곡): 악구가 장단 경계에서 잘려 있으므로 0.01초만 겹쳐 잇고, 길이를 그대로 둔다
     (되풀이해도 박이 밀리지 않게). 이음매는 양끝 15ms만 여닫는다.
3. MIN_LEN보다 짧으면 악구 묶음을 되풀이해 늘린다.
4. 이득으로 TARGET_I LUFS에 맞추고, 튀는 봉우리만 리미터로 누른다. MP3로 줄인 뒤 다시 재서
   ±0.3 LU 안에 들 때까지 고친다.
5. MP3 모노 64kbps. 측정값은 tools/music_src/_bgm_build.json에 남긴다(커밋하지 않음).
"""
import json
import os
import sys

import numpy as np

from common import AUDIO, CFG, SR, SRC, encode_mp3, find, load, measure, run, write_wav

OUT = os.path.join(AUDIO, 'bgm')
TARGET_I = -20.0          # LUFS. 바꿀 수 있다(점검 tests/check-bgm.mjs의 범위도 함께).
TARGET_TP = -1.5          # dBFS. True Peak 한도
# 리미터 천장 −3 dBFS: MP3로 줄일 때 생기는 넘침까지 쳐서 True Peak가 −1.5 dBFS 아래에 머물게 한다
LIMIT = 'alimiter=limit=0.708:attack=5:release=80:level=false'
BITRATE = '64k'
MIN_LEN = 60.0            # 초. 이보다 짧은 곡은 되풀이해 늘린다
SEAM = {True: 2.5, False: 0.0}
JOIN = {True: 0.04, False: 0.01}
EDGE = 0.015


def trim(x, db=-50.0, head=0.10, tail=0.40):
    thr = 10 ** (db / 20)
    idx = np.flatnonzero(np.abs(x) > thr)
    if idx.size == 0:
        return x
    return x[max(0, idx[0] - int(head * SR)):min(len(x), idx[-1] + int(tail * SR))]


def xfade(a, b, d):
    n = min(int(d * SR), len(a), len(b))
    if n <= 0:
        return np.concatenate([a, b])
    t = np.linspace(0, np.pi / 2, n)
    return np.concatenate([a[:-n], a[-n:] * np.cos(t) + b[:n] * np.sin(t), b[n:]])


def loopify(x, d):
    """끝 d초를 처음 d초와 겹쳐 앞에 둔다. 결과의 끝 → 처음이 원래 이어지던 소리로 이어진다."""
    n = int(d * SR)
    if n <= 0:
        return x
    t = np.linspace(0, np.pi / 2, n)
    return np.concatenate([x[-n:] * np.cos(t) + x[:n] * np.sin(t), x[n:-n]])


def build(key, spec):
    free = spec['free']
    parts = [load(find(pid)) for pid in spec['ids']]
    if free:
        parts = [trim(p) for p in parts]
    body = parts[0]
    for p in parts[1:]:
        body = xfade(body, p, JOIN[free])
    unit = body
    while len(body) / SR < MIN_LEN + SEAM[free]:
        body = xfade(body, unit, JOIN[free])
    body = loopify(body, SEAM[free])
    sec = len(body) / SR
    tmp = os.path.join(SRC, f'_{key}.wav')
    write_wav(body, tmp)
    input_i, _ = measure(tmp)
    mp3 = os.path.join(OUT, f'{key}.mp3')
    aim = TARGET_I
    fade = f'afade=t=in:d={EDGE},afade=t=out:st={sec - EDGE:.4f}:d={EDGE}'
    for _ in range(5):
        cur = tmp
        for step in range(2):
            i_now, _ = measure(cur)
            nxt = os.path.join(SRC, f'_{key}_{step}.wav')
            r = run(['-y', '-i', cur, '-af', f'volume={aim - i_now:.2f}dB,{LIMIT}', '-c:a', 'pcm_f32le', nxt])
            if r.returncode:
                raise SystemExit(r.stderr[-2000:])
            if cur != tmp:
                os.remove(cur)
            cur = nxt
        encode_mp3(cur, mp3, BITRATE, fade)
        os.remove(cur)
        i, tp = measure(mp3)
        if abs(i - TARGET_I) <= 0.3 and tp <= TARGET_TP:
            break
        aim += TARGET_I - i
    os.remove(tmp)
    return {'ids': spec['ids'], 'sec': round(sec, 2), 'lufs': i, 'true_peak_dbfs': tp, 'input_lufs': input_i,
            'kb': round(os.path.getsize(mp3) / 1024), 'free': free, 'seam_s': SEAM[free]}


def main():
    os.makedirs(OUT, exist_ok=True)
    want = sys.argv[1:] or list(CFG['bgm'])
    rep_path = os.path.join(SRC, '_bgm_build.json')
    report = json.load(open(rep_path, encoding='utf-8')) if os.path.exists(rep_path) else {}
    for key in want:
        r = report[key] = build(key, CFG['bgm'][key])
        print(f"{key:9s} {r['sec']:7.2f}s  {r['lufs']:6.1f} LUFS  peak {r['true_peak_dbfs']:5.1f}  "
              f"{r['kb']:4d}KB  (원래 {r['input_lufs']} LUFS)")
    json.dump(report, open(rep_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
