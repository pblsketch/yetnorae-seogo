# -*- coding: utf-8 -*-
"""배경음·효과음 도구가 함께 쓰는 것: 경로, ffmpeg 찾기, 읽기·쓰기, 음량 재기."""
import json
import os
import re
import shutil
import subprocess
import sys

import numpy as np

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, 'tools', 'music_src')
AUDIO = os.path.join(ROOT, 'assets', 'audio')
SR = 44100
CFG = json.load(open(os.path.join(HERE, 'sources.json'), encoding='utf-8'))


def tool(name):
    """PATH에 없으면 시리즈가 쓰는 자리(%USERPROFILE%/ffmpeg/bin)에서 찾는다. FFMPEG_BIN으로 바꿀 수 있다."""
    exe = name + ('.exe' if os.name == 'nt' else '')
    for d in [os.environ.get('FFMPEG_BIN', ''), os.path.expanduser('~/ffmpeg/bin')]:
        if d and os.path.isfile(os.path.join(d, exe)):
            return os.path.join(d, exe)
    found = shutil.which(name)
    if not found:
        raise SystemExit(f'{name}을(를) 찾지 못함. PATH나 FFMPEG_BIN을 확인하세요.')
    return found


FFMPEG = tool('ffmpeg')


def find(pid):
    """악구 번호로 원본 WAV를 찾는다(사이트가 붙이는 꼬리 'g', '-Yangum' 같은 것을 허용)."""
    stem = pid.lower()
    hits = [f for f in os.listdir(SRC) if f.lower().endswith('.wav') and f.lower().startswith(stem)]
    if len(hits) != 1:
        raise SystemExit(f'악구 파일을 찾지 못함: {pid} → {hits} (먼저 python tools/bgm/fetch.py)')
    return os.path.join(SRC, hits[0])


def load(path):
    """모노 44.1kHz float64로 읽는다(두 통로는 평균)."""
    p = subprocess.run([FFMPEG, '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)


def run(args):
    return subprocess.run([FFMPEG, '-hide_banner', '-nostats'] + args, capture_output=True, text=True,
                          encoding='utf-8', errors='replace')


def write_wav(x, path):
    pcm = np.clip(x, -1, 1).astype(np.float32)
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-c:a', 'pcm_f32le', path], input=pcm.tobytes(), check=True)


def encode_mp3(src, dst, bitrate, af=None):
    args = ['-y', '-i', src]
    if af:
        args += ['-af', af]
    args += ['-ar', str(SR), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', bitrate,
             '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '1', dst]
    r = run(args)
    if r.returncode:
        raise SystemExit(r.stderr[-2000:])


def measure(path):
    """EBU R128 통합 음량(LUFS)과 True Peak(dBFS)."""
    r = run(['-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    s = r.stderr[r.stderr.rfind('Summary:'):]
    i = float(re.search(r'I:\s+(-?[\d.]+|-inf) LUFS', s).group(1).replace('-inf', '-99'))
    tp = float(re.search(r'Peak:\s+(-?[\d.]+|-inf) dBFS', s).group(1).replace('-inf', '-99'))
    return i, tp
