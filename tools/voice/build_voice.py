# -*- coding: utf-8 -*-
"""낭송 조각(음보마다, 향가는 구마다)을 Fish Audio 유료 API로 만든다(spec 15, plan T27·T28, 추가 제안 F5).

    python tools/voice/build_voice.py --dry-run                       # 모든 노래: 줄 수·조각 수·글자 수·예상 요금(API 부르지 않음)
    python tools/voice/build_voice.py --self-test                     # API 없이 가짜 말소리로 줄 자르기·빠르기·기록·미리 듣기 시험
    python tools/voice/build_voice.py --tempo-probe --voice narrator-a2,narrator-b2 [--write-tempo]
                                                                      # 노래마다 가장 긴 음보가 들어 있을 줄만 읽혀 자연 빠르기를 잰다
    python tools/voice/build_voice.py --sample --voice narrator-a2 --only dongjitdal,jemangmaega --out <폴더> --prefix v2-
                                                                      # 후보 목소리 견본 + 미리 듣기(박자 칸·딸깍·줄 그대로)
    python tools/voice/build_voice.py [--only id,id] [--write-tempo] [--max-usd 3]
                                                                      # 실제 조각(assets/audio/voice/…)과 생성 기록. 목소리는 승인 배정
                                                                      # (voices.json approved: default + bySong, 노래마다 목소리)
    python tools/voice/build_voice.py --per-foot --lines <줄 목록.json> --dry-run      # 경계가 어긋난 줄만 음보마다 따로: 요청 수·요금
    python tools/voice/build_voice.py --per-foot --lines <줄 목록.json> --backup <폴더> --max-usd 0.3
                                                                      # 그 줄의 조각만 바꾼다(cut: per-foot). 바꾸기 전 조각은 --backup에

키: 환경 변수 YETNORAE_FISH_API_KEY로만 받는다. 키를 화면·기록·파일 어디에도 쓰지 않고, 오류 글에서도 지운다.
    예) YETNORAE_FISH_API_KEY="$(cat "$LOCALAPPDATA/yetnorae/fish.key")" python tools/voice/build_voice.py …

흐름(F5부터: 줄 단위로 읽히고 음보 경계에서 자른다)
1. node tools/voice/plan.mjs가 노래 데이터에서 줄 목록(시조·사설시조 장, 가사 행, 고려가요 줄, 향가 구)과
   그 줄의 음보 조각(글 = 그 음보의 reading), 박자 칸(빠르기, 칸 길이)을 낸다.
2. 목소리: voices.json의 후보 설명으로 목소리 설계(voice-design-1)를 한 번 하고, 그 음성을 기준 음성으로 삼는다.
   승인한 후보는 기준 음성 해시(referenceSha256)로 묶는다. 설계 캐시가 없으면 assets/raw/voice-ref/(git 제외 백업)에서
   되살리고, 그것도 없으면 다시 설계하지 않고 멈춘다. 실제 조각은 노래마다 승인 배정된 목소리로 읽힌다(T28).
3. 줄마다 TTS 한 번(유료 모델). 줄의 음보 reading을 띄어 이은 글을 자연스러운 한국어 말투 그대로 읽힌다.
   받은 원본은 tools/voice_cache/(git 제외)에 글·목소리·설정의 해시로 둔다. 같은 해시가 있으면 다시 부르지 않는다.
4. 줄 소리를 받아쓰기(Fish ASR, 낱말 시각)로 듣고 음보 경계 시각을 정한다. 받아쓰기가 글과 너무 다르면
   음절 수 비율로 어림한다. 어느 쪽이든 그 근처에서 소리가 가장 작은 곳을 찾아 자른다(cut: asr·energy, 향가 구는 whole).
5. 조각마다 앞뒤 무음을 다듬고 아주 짧게 페이드한다. 빠르게 줄이거나(atempo) 빨리 읽히지 않는다.
   음량은 줄 하나에 같은 이득을 주어 TARGET_LUFS에 맞춘다(줄 안의 자연스러운 셈여림을 지킨다).
6. 노래마다 자연 빠르기 = 내림(60 × FILL ÷ 가장 긴 음보 조각 초). --write-tempo면 노래 데이터의 tempo에 쓴다.
   실제 조각은 노래 데이터의 tempo 칸 안에 들어야 하고, 넘치면 멈추고 --write-tempo를 권한다.
7. 생성 기록: assets/audio/voice/manifest.json, 자산 목록 조각 assets/manifest.parts/voice.json.
   --sample이면 --out(기본 assets/raw/voice-samples/) 아래에 쓰고(git 제외) 자산 목록·노래 데이터는 건드리지 않는다.
"""
import argparse
import base64
import concurrent.futures as cf
import difflib
import hashlib
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.request
import wave

import numpy as np

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(ROOT, 'tools', 'voice_cache')
SAMPLES = os.path.join(ROOT, 'assets', 'raw', 'voice-samples')
REF_BACKUP = os.path.join(ROOT, 'assets', 'raw', 'voice-ref')   # 승인한 기준 음성 백업(git 제외)
SONGS_DIR = os.path.join(ROOT, 'js', 'data', 'songs')
PART = os.path.join(ROOT, 'assets', 'manifest.parts', 'voice.json')
CONFIG = os.path.join(HERE, 'voices.json')
PRONOUNCE = os.path.join(HERE, 'pronounce.json')   # 낭송용 발음 표기 표(TTS에 보내는 글에만 쓴다. 화면 글은 그대로)
API = 'https://api.fish.audio'
ENV_KEY = 'YETNORAE_FISH_API_KEY'

# ── 조정할 수 있는 값 ──
SR = 44100
BITRATE = '64k'
TARGET_LUFS = -18.0          # 줄 음량(배경음 −20 LUFS보다 조금 크게)
PEAK_MAX_DB = -1.5           # 표본 봉우리 한도
FILL = 0.92                  # 가장 긴 조각 ≤ 칸 × FILL (다음 박 앞에 숨 쉴 틈) — 자연 빠르기를 정하는 비율
MAX_TEMPO = 120              # 자연 빠르기 상한(박/분)
LEAD_PAD = 0.010             # 소리 시작 앞에 남길 틈(초) — 박에 바로 소리가 나도록 짧게
LEAD_MAX = 0.050             # 조각 앞에서 큰 소리(봉우리 −30dB)가 나기까지의 한도(초). 줄 가운데에서 자른 조각은
                             # 앞 음보에서 이어진 숨·여린 첫소리(ㅎ·ㅅ)를 지키려고 줄 전체 기준 문턱으로만 다듬으므로
                             # 음보마다 따로 읽힐 때(30ms)보다 조금 넉넉하다. 박 판정 창(±150ms)에 견주면 작다
TAIL_PAD = 0.050             # 소리 끝 뒤에 남길 틈(초)
FADE_IN = 0.005              # 조각 앞 페이드(초)
FADE_OUT = 0.020             # 조각 뒤 페이드(초)
GATE_BELOW_PEAK_DB = 38      # 10ms 구간 RMS가 줄에서 가장 큰 구간보다 이만큼 작으면 무음으로 본다
GATE_FLOOR_DB = -55
HOP = 0.010                  # 음량 곡선 간격(초)
CUT_WINDOW_ASR = 0.06        # 받아쓰기로 정한 경계 둘레에서 가장 조용한 곳을 찾는 폭(±초). 넓히면 낱말 안의
                             # 닫힘소리(ㅂ·ㄷ·ㄱ)·마찰음(ㅅ)의 짧은 골짜기를 경계로 잘못 고른다
CUT_WINDOW_SYL = 0.9         # 음절 비율로 어림한 경계는 평균 음절 길이 × 이 값(±)
CUT_PULL_DB = 12.0           # 어림한 경계에서 창 끝까지 멀어질 때 더하는 벌점(dB)
MIN_PIECE = 0.12             # 조각 하나의 최소 길이(초)
PIECE_MIN_SEC = 0.15         # 받아쓰기로 자른 조각이 이보다 짧으면 받아쓰기 시각을 믿지 않는다(점검의 빈 조각 한도와 같다)
PIECE_RATIO_LOW = 0.35       # 받아쓰기로 자른 조각 길이의 몫 ÷ 음절 수의 몫이 이보다 작거나
PIECE_RATIO_HIGH = 2.5       # (두 음절 이상인 조각이) 이보다 크면 음절 비율로 다시 자른다. 실제 낭송은 0.57~1.52(1~99%)
ASR_MIN_MATCH = 0.4          # 받아쓰기 글과 줄 글의 글자 맞춤 비율(difflib)
ASR_COUNT_TOL = 0.15         # 받아쓰기 음절 수와 줄 글 음절 수의 차이 한도(비율)
                             # 둘 다 넘지 못하면(다른 말로 헛들음) 받아쓰기 시각을 쓰지 않는다. 그때는 한 번 더 듣고,
                             # 그래도 안 되면 음절 비율로 어림한다
LINE_GAP = 0.6               # '줄 그대로' 미리 듣기의 줄 사이 쉼(초)
PRICE_PER_MBYTE = 15.0       # USD / 100만 UTF-8 바이트(s2.1-pro·s2-pro·s1, 2026-10 문서)
DESIGN_PRICE = 0.01          # USD / 목소리 설계 요청 한 번
ASR_PRICE_PER_HOUR = 0.36    # USD / 음성 1시간(받아쓰기)
ASR_MODEL = 'transcribe-1-pro'
SEC_PER_SYLLABLE = 0.22      # 미리 계산용: 자연 낭송의 한 음절 길이
PROBE_LINES = 2              # --tempo-probe: 노래마다 읽힐 줄 수(가장 긴 음보가 있을 줄)
MAX_USD = 3.0                # 한 번 실행에서 쓸 돈의 한도(USD). --max-usd로 바꾼다

LICENSE = ('Fish Audio 이용약관(2024-08-18 시행) "Your Use of Services" 조항: 유료 서비스(Paid Services) 이용자는 '
           '서비스를 상업적 용도로 쓸 수 있다. 유료 API(종량 과금) 모델로 만든 AI 합성 음성이며, '
           '실제 사람의 목소리를 본뜨지 않고 글 설명만으로 설계한 목소리다. 출처 화면에 AI 합성 음성임을 밝힌다.')

KEY = os.environ.get(ENV_KEY, '').strip()
FAKE = False                 # --self-test: API 대신 합성한 가짜 말소리로 나머지 과정을 모두 시험한다
SPEND = {'ttsBytes': 0, 'design': 0, 'asrSec': 0.0}
SPEND_LOCK = threading.Lock()
TTS_LOCKS = {}


def redact(text):
    s = str(text)
    if KEY:
        s = s.replace(KEY, '[지움]')
    return re.sub(r'(?i)(bearer\s+)[A-Za-z0-9._\-]+', r'\1[지움]', s)


def load_pronounce(path=None):
    """낭송용 발음 표기 표: [(바꿀 글, 읽힐 글)]. 받아쓰기로 실제로 다른 소리로 읽힌다고 확인한 옛 표기만 둔다(예: 뫼 → 뭬).
    바꾼 글은 한글 음절 수가 같아야 한다(음보 길이·자르기 맞춤이 그대로이도록)."""
    path = path or PRONOUNCE
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8') as f:
        rules = json.load(f).get('rules') or []
    out = []
    for r in rules:
        a, b = r.get('from'), r.get('to')
        if not (isinstance(a, str) and isinstance(b, str) and hangul_only(a) and hangul_only(b)):
            raise SystemExit(f'낭송용 발음 표기 표({rel(path)})의 규칙이 이상하다: {r}')
        if len(hangul_only(a)) != len(hangul_only(b)):
            raise SystemExit(f'낭송용 발음 표기 표: "{a}" → "{b}"는 음절 수가 달라 쓸 수 없다')
        out.append((a, b))
    return out


def pronounce(text, rules=None):
    """화면 글(오늘 소리) → TTS에 보낼 글. 표의 규칙을 차례로 모두 바꾼다."""
    for a, b in (PRON if rules is None else rules):
        text = text.replace(a, b)
    return text


def say(*parts):
    print(redact(' '.join(str(p) for p in parts)), flush=True)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()


def sha256_file(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def rel(path):
    """저장소 기준 경로(다른 드라이브면 그대로)."""
    try:
        return os.path.relpath(path, ROOT)
    except ValueError:
        return path


def write_json(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def spent(kind, amount):
    with SPEND_LOCK:
        SPEND[kind] += amount


def spend_usd():
    return (SPEND['ttsBytes'] / 1e6 * PRICE_PER_MBYTE + SPEND['design'] * DESIGN_PRICE
            + SPEND['asrSec'] / 3600 * ASR_PRICE_PER_HOUR)


# ── ffmpeg ──

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


FFMPEG = None
FFPROBE = None


def ff(args, data=None):
    p = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-v', 'error'] + args, input=data, capture_output=True)
    if p.returncode:
        raise RuntimeError('ffmpeg 실패: ' + p.stderr.decode('utf-8', 'replace')[-800:])
    return p.stdout


def decode(audio_bytes):
    """받은 소리(wav·mp3)를 모노 44.1kHz float64로 푼다."""
    with tempfile.NamedTemporaryFile(delete=False, suffix='.bin') as t:
        t.write(audio_bytes)
        name = t.name
    try:
        out = ff(['-i', name, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'])
    finally:
        os.unlink(name)
    return np.frombuffer(out, dtype=np.float32).astype(np.float64)


def lufs(x):
    """EBU R128 통합 음량. 400ms보다 짧으면 0.4초가 되도록 같은 소리를 이어 잰다(짧은 조각용)."""
    y = x
    while len(y) < int(0.45 * SR):
        y = np.concatenate([y, x])
    with tempfile.NamedTemporaryFile(delete=False, suffix='.f32') as t:
        t.write(y.astype(np.float32).tobytes())
        name = t.name
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', name,
                            '-af', 'ebur128', '-f', 'null', '-'], capture_output=True)
    finally:
        os.unlink(name)
    s = p.stderr.decode('utf-8', 'replace')
    s = s[s.rfind('Summary:'):]
    m = re.search(r'I:\s+(-?[\d.]+|-inf) LUFS', s)
    if not m or m.group(1) == '-inf':
        return None
    return float(m.group(1))


def encode_mp3(x, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ff(['-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', BITRATE,
        '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '1', path],
       data=np.clip(x, -1, 1).astype(np.float32).tobytes())


def probe_sec(path):
    p = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of',
                        'default=noprint_wrappers=1:nokey=1', path], capture_output=True, text=True)
    return float(p.stdout.strip())


def wav_bytes(x):
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    return buf.getvalue()


# ── 소리 다듬기 ──

def frame_db(x):
    """10ms 간격 RMS(dB). 돌려주는 값: (db 배열, 구간 길이 표본 수)"""
    hop = int(HOP * SR)
    n = len(x) // hop
    if n == 0:
        return np.array([-120.0]), hop
    frames = x[:n * hop].reshape(n, hop)
    return 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=1)) + 1e-12), hop


def line_gate(db):
    return max(db.max() - GATE_BELOW_PEAK_DB, GATE_FLOOR_DB)


def speech_span(x, gate=None):
    """소리가 있는 첫 표본과 끝 표본(끝은 뒤 틈 포함). 무음이면 None."""
    db, hop = frame_db(x)
    gate = line_gate(db) if gate is None else gate
    on = np.flatnonzero(db > gate)
    if not len(on):
        return None
    # 소리 시작: 첫 구간 안에서 표본 단위로 다시 찾는다(박에 정확히 닿게).
    first = on[0] * hop
    seg = np.abs(x[max(0, first - hop):first + hop])
    hit = np.flatnonzero(seg > 10 ** (gate / 20))
    start = max(0, first - hop) + (int(hit[0]) if len(hit) else hop)
    end = min(len(x), (on[-1] + 1) * hop)
    return start, end


def finish_piece(x, gate):
    """잘라 낸 조각: 앞뒤 무음을 다듬고(앞 LEAD_PAD, 뒤 TAIL_PAD 남김) 짧게 페이드한다."""
    span = speech_span(x, gate)
    if span is None:
        y = x.copy()
    else:
        s = max(0, span[0] - int(LEAD_PAD * SR))
        e = min(len(x), span[1] + int(TAIL_PAD * SR))
        y = x[s:e].copy()
    fi, fo = int(FADE_IN * SR), int(FADE_OUT * SR)
    if len(y) > fi + fo:
        y[:fi] *= np.linspace(0, 1, fi)
        y[-fo:] *= np.linspace(1, 0, fo)
    return y


def hangul_only(s):
    return re.sub(r'[^가-힣]', '', s or '')


def syllables(s):
    return len(hangul_only(s))


PRON = []                    # main에서 load_pronounce()로 채운다(자체 시험은 따로 넣는다)


def similarity(a, b):
    a, b = hangul_only(a), hangul_only(b)
    if not a and not b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def asr_boundaries(words, feet):
    """받아쓰기 낱말 시각으로 음보 경계 시각(초)과 찾을 폭을 정한다. 돌려주는 값: [(시각, 폭 시작, 폭 끝)]. 줄 글과 받아쓰기 글을 글자(음절) 단위로 맞추어
    (difflib) 음보 경계 음절이 받아쓰기의 어느 음절 사이에 오는지 찾는다. 받아쓰기가 몇 글자 더하거나 빼도 된다.
    소리 나는 대로 적은 받아쓰기(물아일체 → 무라일체)는 글자가 달라 맞춤 비율이 낮지만 음절 수는 같으므로,
    음절 수가 ASR_COUNT_TOL 안이면 음절 순서대로 맞춘다. 둘 다 아니면 None.
    words: [{text, start, end}], feet: 음보 글 목록"""
    words = [w for w in (words or []) if syllables(w['text']) > 0 and w['end'] >= w['start']]
    reading = ''.join(hangul_only(f) or '가' for f in feet)
    heard = ''.join(hangul_only(w['text']) for w in words)
    if not words or not reading:
        return None
    sm = difflib.SequenceMatcher(None, reading, heard, autojunk=False)
    if sm.ratio() >= ASR_MIN_MATCH:
        ops = sm.get_opcodes()
    elif abs(len(heard) - len(reading)) <= max(1, ASR_COUNT_TOL * len(reading)):
        ops = [('replace', 0, len(reading), 0, len(heard))]
    else:
        return None
    # 받아쓰기 음절 경계 j(0..len(heard))의 시각: 낱말 안은 고르게 나누고, 낱말 사이는 틈의 가운데.
    # 찾을 폭: 낱말 안이면 ±CUT_WINDOW_ASR, 낱말 사이면 받아쓰기가 들은 틈 전체(앞뒤로 CUT_WINDOW_ASR 더).
    times = [words[0]['start']]
    spans = [(words[0]['start'] - CUT_WINDOW_ASR, words[0]['start'] + CUT_WINDOW_ASR)]
    for i, w in enumerate(words):
        n = syllables(w['text'])
        for k in range(1, n):
            t = w['start'] + (w['end'] - w['start']) * k / n
            times.append(t)
            spans.append((t - CUT_WINDOW_ASR, t + CUT_WINDOW_ASR))
        if i + 1 < len(words):
            times.append((w['end'] + words[i + 1]['start']) / 2)
            spans.append((w['end'] - CUT_WINDOW_ASR, words[i + 1]['start'] + CUT_WINDOW_ASR))
        else:
            times.append(w['end'])
            spans.append((w['end'] - CUT_WINDOW_ASR, w['end'] + CUT_WINDOW_ASR))

    def heard_index(b):
        for tag, i1, i2, j1, j2 in ops:
            if i1 <= b <= i2 and (i1 < b < i2 or tag == 'equal' or b == i1):
                return j1 + (b - i1) * (j2 - j1) / (i2 - i1) if i2 > i1 else j1
        return len(heard) * b / len(reading)

    out = []
    acc = 0
    for f in feet[:-1]:
        acc += len(hangul_only(f) or '가')
        j = min(max(heard_index(acc), 0), len(heard))
        lo = int(math.floor(j))
        hi = min(lo + 1, len(heard))
        t = times[lo] + (times[hi] - times[lo]) * (j - lo)
        near = spans[int(round(j))]
        out.append((t, min(near[0], t - CUT_WINDOW_ASR), max(near[1], t + CUT_WINDOW_ASR)))
    if any(b[0] <= a[0] for a, b in zip(out, out[1:])):
        return None
    return out


def piece_trouble(pieces, counts):
    """잘라 낸 조각이 말이 안 되는 곳(받아쓰기 낱말 시각이 엉뚱할 때 생긴다). 없으면 None.
    조각이 PIECE_MIN_SEC보다 짧거나, 조각 길이의 몫이 음절 수의 몫보다 PIECE_RATIO_LOW배 작거나,
    두 음절 이상인 조각이 PIECE_RATIO_HIGH배 크면(다른 음보를 삼킴) 문제로 본다. 한 음절 음보 뒤의 쉼표 쉼은 길 수 있어 크기는 보지 않는다."""
    lens = [len(p) / SR for p in pieces]
    total, syl = sum(lens), sum(counts)
    for i, (sec, n) in enumerate(zip(lens, counts)):
        ratio = (sec / total) / (n / syl) if total > 0 else 0
        if sec < PIECE_MIN_SEC:
            return f'음보 {i} 조각이 {sec:.2f}s로 너무 짧다'
        if ratio < PIECE_RATIO_LOW:
            return f'음보 {i} 조각이 음절 몫의 {ratio:.2f}배'
        if n >= 2 and ratio > PIECE_RATIO_HIGH:
            return f'음보 {i} 조각이 음절 몫의 {ratio:.2f}배'
    return None


def cut_line(x, feet, words=None):
    """줄 소리 x를 음보 len(feet)개로 자른다(feet: 음보 글 목록).
    받아쓰기 시각으로 자른 결과가 말이 안 되면(piece_trouble) 음절 비율로 다시 자른다.
    돌려주는 값: (조각 목록, 방법 'asr'|'energy'|'whole', 경계 초 목록)"""
    counts = [max(1, syllables(f)) for f in feet]
    db, hop = frame_db(x)
    gate = line_gate(db)
    span = speech_span(x, gate)
    if span is None:
        raise RuntimeError('줄 소리가 비었다')
    s0, e0 = span
    if len(counts) == 1:
        return [finish_piece(x[max(0, s0 - int(LEAD_PAD * SR)):min(len(x), e0 + int(TAIL_PAD * SR))], gate)], 'whole', []
    smooth = np.convolve(db, np.ones(3) / 3, mode='same')
    syl = (e0 - s0) / SR / max(1, sum(counts))

    def by_syllables():
        width = max(0.12, CUT_WINDOW_SYL * syl)
        acc = 0
        out = []
        for c in counts[:-1]:
            acc += c
            t = s0 / SR + (e0 - s0) / SR * acc / sum(counts)
            out.append((t, t - width, t + width))
        return out

    def place(expected):
        cuts = []
        prev = s0 / SR
        for k, (t, w_lo, w_hi) in enumerate(expected):
            nxt = expected[k + 1][0] if k + 1 < len(expected) else e0 / SR
            width = max(t - w_lo, w_hi - t)
            lo = max(w_lo, prev + MIN_PIECE)
            hi = min(w_hi, nxt - MIN_PIECE / 2, e0 / SR - MIN_PIECE)
            if hi <= lo:
                best = min(max(t, prev + MIN_PIECE), e0 / SR - MIN_PIECE)
            else:
                i0, i1 = int(lo / HOP), int(hi / HOP) + 1
                idx = np.arange(i0, min(i1, len(smooth)))
                if not len(idx):
                    best = t
                else:
                    centers = (idx + 0.5) * HOP
                    cost = smooth[idx] + CUT_PULL_DB * np.abs(centers - t) / width
                    best = float(centers[int(np.argmin(cost))])
            cuts.append(best)
            prev = best
        edges = [max(0, s0 - int(LEAD_PAD * SR))] + [int(c * SR) for c in cuts] + [min(len(x), e0 + int(TAIL_PAD * SR))]
        return [finish_piece(x[edges[i]:edges[i + 1]], gate) for i in range(len(counts))], cuts

    expected = asr_boundaries(words, feet) if words else None
    if expected:
        pieces, cuts = place(expected)
        if piece_trouble(pieces, counts) is None:
            return pieces, 'asr', cuts
    pieces, cuts = place(by_syllables())
    return pieces, 'energy', cuts


def line_gain(pieces):
    """줄 하나에 같은 이득: 음량을 TARGET_LUFS로, 봉우리는 PEAK_MAX_DB 아래로."""
    joined = np.concatenate(pieces)
    measured = lufs(joined)
    peak = np.abs(joined).max() + 1e-12
    gain_db = (TARGET_LUFS - measured) if measured is not None else 0.0
    gain_db = min(gain_db, PEAK_MAX_DB - 20 * np.log10(peak))
    return 10 ** (gain_db / 20), measured, gain_db


def natural_tempo(longest_sec):
    """가장 긴 조각이 칸의 FILL 안에 들어가는 가장 빠른 정수 빠르기(박/분)."""
    return max(1, min(MAX_TEMPO, int(math.floor(60 * FILL / longest_sec))))


# ── Fish Audio ──

class ApiError(RuntimeError):
    pass


ACCOUNT = {}
ACCOUNT_LOCK = threading.Lock()


def get_json(path):
    req = urllib.request.Request(API + path, headers={'Authorization': 'Bearer ' + KEY})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raise ApiError(f'Fish Audio HTTP {e.code} ({path}): ' + redact(e.read().decode('utf-8', 'replace'))[:300]) from None


def account_check():
    """돈이 드는 첫 요청 앞에서 한 번: 유료 이용자인지(상업 이용 조건), API 충전액이 남았는지 본다.
    플랫폼 구독(package)과 API 충전액(api-credit)은 따로 관리된다. 계정 번호·금액은 기록하지 않는다."""
    with ACCOUNT_LOCK:
        if ACCOUNT:
            return ACCOUNT
        credit = get_json('/wallet/self/api-credit')
        package = get_json('/wallet/self/package')
        info = {'apiCredit': float(credit.get('credit') or 0), 'toppedUp': float(credit.get('cumulative_top_up') or 0) > 0,
                'packageType': package.get('type') or '알 수 없음'}
        paid = info['toppedUp'] or info['packageType'] not in ('free', '알 수 없음')
        if not paid:
            raise SystemExit('이 계정은 유료 이용 기록이 없습니다(구독 종류: ' + info['packageType'] + ', API 충전 이력 없음). '
                             'Fish Audio 이용약관상 상업 이용은 유료 서비스 이용자만 됩니다. '
                             'https://fish.audio/app/developers 에서 API 충전액을 결제한 뒤 다시 돌리세요.')
        if info['apiCredit'] <= 0:
            raise SystemExit('API 충전액이 0입니다. 플랫폼 구독 크레딧과 API 충전액은 따로입니다. '
                             'https://fish.audio/app/developers 에서 충전한 뒤 다시 돌리세요.')
        ACCOUNT.update(info)
        say(f'계정 확인: 유료 이용(구독 {info["packageType"]}, API 충전 이력 있음) · API 충전액 남음')
        return ACCOUNT


def request(path, payload, model, kind='json', timeout=180):
    if not KEY:
        raise SystemExit(f'환경 변수 {ENV_KEY}가 없습니다. 키는 환경 변수로만 받습니다(--dry-run·--self-test는 키 없이 됩니다).')
    if spend_usd() >= MAX_USD:
        raise SystemExit(f'쓴 돈(추정 ${spend_usd():.4f})이 한도 ${MAX_USD:g}에 닿아 더 부르지 않는다(만든 것은 캐시에 남는다).')
    account_check()
    import msgpack
    if kind == 'msgpack':
        body = msgpack.packb(payload, use_bin_type=True)
        ctype = 'application/msgpack'
    else:
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        ctype = 'application/json'
    last = None
    for attempt in range(5):
        req = urllib.request.Request(API + path, data=body, headers={
            'Authorization': 'Bearer ' + KEY, 'Content-Type': ctype, 'model': model})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            detail = redact(e.read().decode('utf-8', 'replace'))[:400]
            last = ApiError(f'Fish Audio HTTP {e.code} ({path}, model={model}): {detail}')
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 * (attempt + 1))
                continue
            raise last from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = ApiError(f'Fish Audio 연결 실패({path}): {redact(e)}')
            time.sleep(2 * (attempt + 1))
    raise last


def design_voice(cid, cand, cfg):
    """목소리 설계 한 번(캐시). 돌려주는 값: { audio(bytes), text, sha256, id, durationMs, cacheKey }
    캐시가 없으면 백업(REF_BACKUP/<후보>-reference.wav)에서 되살린다. 후보에 승인한 기준 음성 해시(referenceSha256)가
    있으면 그 해시와 같아야 하고, 캐시도 백업도 없으면 다시 설계하지 않고 멈춘다(같은 seed라도 같은 목소리라는 보장이 없다).
    새로 설계했거나 되살린 기준 음성은 백업에 남긴다."""
    if FAKE:
        audio, _ = fake_line(['가나다라마', '바사아자', '차카타파하가'], 1.0, seed=cand.get('seed', 0))
        return {'audio': audio, 'text': cand['referenceText'], 'sha256': hashlib.sha256(audio).hexdigest(),
                'id': 'self-test', 'durationMs': None, 'cacheKey': 'self-test'}
    spec = {'instruction': cand['instruction'], 'reference_text': cand['referenceText'], 'language': 'ko',
            'n': 1, 'seed': cand['seed'], 'speed': cand.get('speed', 1)}
    key = digest({'model': cfg['designModel'], **spec})[:16]
    path = os.path.join(CACHE, 'ref', f'{cid}-{key}.json')
    pinned = cand.get('referenceSha256')
    backup_wav = os.path.join(REF_BACKUP, f'{cid}-reference.wav')
    backup_meta = os.path.join(REF_BACKUP, f'{cid}-reference.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            got = json.load(f)
    elif os.path.exists(backup_wav):
        with open(backup_wav, 'rb') as f:
            audio = f.read()
        meta = {}
        if os.path.exists(backup_meta):
            with open(backup_meta, encoding='utf-8') as f:
                meta = json.load(f)
        got = {'audio_base64': base64.b64encode(audio).decode('ascii'), 'id': meta.get('voiceDesignId') or cand.get('voiceDesignId'),
               'text': meta.get('text') or cand['referenceText'], 'duration_ms': meta.get('durationMs')}
        if pinned and hashlib.sha256(audio).hexdigest() != pinned:
            raise SystemExit(f'{cid}: 백업한 기준 음성의 sha256이 승인한 값({pinned[:12]}…)과 다르다 — {backup_wav}')
        say(f'기준 음성 되살림: {cid} ← 백업 {rel(backup_wav)}')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(got, f, ensure_ascii=False)
    elif pinned:
        raise SystemExit(f'{cid}: 승인한 기준 음성(sha256 {pinned[:12]}…)의 설계 캐시도 백업({rel(backup_wav)})도 없다. '
                         '다시 설계하면 다른 목소리가 될 수 있어 멈춘다. 백업을 되살린 뒤 다시 돌리세요.')
    else:
        say(f'목소리 설계: {cid} ({cfg["designModel"]}, seed {cand["seed"]})')
        result = json.loads(request('/v1/voice-design', spec, cfg['designModel']))
        spent('design', 1)
        got = result['candidates'][0]
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(got, f, ensure_ascii=False)
    audio = base64.b64decode(got['audio_base64'])
    sha = hashlib.sha256(audio).hexdigest()
    if pinned and sha != pinned:
        raise SystemExit(f'{cid}: 기준 음성의 sha256({sha[:12]}…)이 승인한 값({pinned[:12]}…)과 다르다(캐시 {path}).')
    if not os.path.exists(backup_wav):
        os.makedirs(REF_BACKUP, exist_ok=True)
        with open(backup_wav, 'wb') as f:
            f.write(audio)
        write_json(backup_meta, {'candidate': cid, 'voiceDesignId': got.get('id'), 'text': got.get('text') or cand['referenceText'],
                                 'durationMs': got.get('duration_ms'), 'sha256': sha})
    return {'audio': audio, 'text': got.get('text') or cand['referenceText'], 'sha256': sha,
            'id': got.get('id'), 'durationMs': got.get('duration_ms'), 'cacheKey': key}


def assignment(cfg, song_ids):
    """승인된 노래마다 목소리 배정 → {노래 id: 후보 id}. 승인 전이면 None.
    approved는 { default: 후보, bySong: { 노래 id: 후보 } }(T28). 예전 모양(후보 id 글 하나)이면 모든 노래가 그 목소리다."""
    ap = cfg.get('approved')
    if not ap:
        return None
    if isinstance(ap, str):
        ap = {'default': ap, 'bySong': {}}
    by = ap.get('bySong') or {}
    unknown = [s for s in by if s not in song_ids]
    if unknown:
        raise SystemExit('승인 배정(voices.json approved.bySong)에 노래 데이터에 없는 노래 id: ' + ', '.join(unknown))
    out = {s: by.get(s, ap.get('default')) for s in song_ids}
    bad = sorted({str(v) for v in out.values() if v not in cfg['candidates']})
    if bad:
        raise SystemExit('승인 배정에 후보에 없는 목소리: ' + ', '.join(bad))
    return out


def tts_text(text, cand):
    """TTS에 보내는(청구되는) 글: 후보의 direction + 글."""
    return (cand.get('direction', '') + ' ' + text).strip()


def tts_stamp(full, ref_sha, cand, cfg):
    """원본 소리 캐시의 해시(글·모델·기준 음성·설정·말 빠르기)."""
    return digest({'model': cfg['model'], 'text': full, 'ref': ref_sha, 'params': dict(cfg['tts']), 'speed': cand.get('speed', 1)})


def tts_cache_path(stamp, cfg):
    return os.path.join(CACHE, 'raw', stamp[:2], stamp + '.' + cfg['tts'].get('format', 'wav'))


RESERVED = [0.0]             # 보냈지만 아직 셈하지 않은 요청의 돈(동시 요청이 한도를 넘지 않게 미리 잡아 둔다)


def reserve(usd):
    """요청 하나를 보내기 전에: 쓴 돈 + 보내는 중인 요청 + 이 요청이 --max-usd를 넘으면 보내지 않고 멈춘다."""
    with SPEND_LOCK:
        if spend_usd() + RESERVED[0] + usd > MAX_USD + 1e-12:
            raise SystemExit(f'이 요청(추정 ${usd:.5f})을 보내면 한도 ${MAX_USD:g}를 넘는다(쓴 돈 ${spend_usd():.4f}, '
                             f'보내는 중 ${RESERVED[0]:.4f}). 더 부르지 않는다(만든 것은 캐시에 남는다).')
        RESERVED[0] += usd


def release(usd):
    with SPEND_LOCK:
        RESERVED[0] = max(0.0, RESERVED[0] - usd)


def tts(text, ref, cand, cfg):
    """줄 하나(--per-foot면 음보 하나)의 원본 소리(캐시). 말 빠르기는 후보의 speed(기본 1) 그대로 — 빨리 읽히지 않는다."""
    params = dict(cfg['tts'])
    speed = cand.get('speed', 1)
    full = tts_text(text, cand)
    stamp = tts_stamp(full, ref['sha256'], cand, cfg)
    if FAKE:
        return fake_line(text.split(), speed, seed=int(stamp[:6], 16))[0], stamp, False
    path = tts_cache_path(stamp, cfg)
    with SPEND_LOCK:
        lock = TTS_LOCKS.setdefault(stamp, threading.Lock())
    with lock:   # 같은 글(예: 되풀이 줄)을 여러 일꾼이 한꺼번에 부르지 않게 한다
        return tts_once(path, full, ref, params, speed, cfg, stamp)


def tts_once(path, full, ref, params, speed, cfg, stamp):
    if os.path.exists(path):
        with open(path, 'rb') as f:
            return f.read(), stamp, True
    payload = {'text': full, 'references': [{'audio': ref['audio'], 'text': ref['text']}],
               'prosody': {'speed': speed, 'volume': 0}, 'normalize': True, **params}
    cost = len(full.encode('utf-8')) / 1e6 * PRICE_PER_MBYTE
    reserve(cost)
    try:
        audio = request('/v1/tts', payload, cfg['model'], kind='msgpack')
        spent('ttsBytes', len(full.encode('utf-8')))
    finally:
        release(cost)
    if len(audio) < 1000:
        raise ApiError(f'소리가 너무 짧게 왔다({len(audio)}바이트): {full}')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(audio)
    return audio, stamp, False


def asr(audio_bytes, seconds, timestamps=False, fake_words=None):
    """받아쓰기(캐시). 돌려주는 값: { text, words: [{text, start, end}] }"""
    if FAKE:
        return {'text': ' '.join(w['text'] for w in (fake_words or [])), 'words': fake_words or []}
    sha = hashlib.sha256(audio_bytes).hexdigest()
    path = os.path.join(CACHE, 'asr', sha + ('-ts' if timestamps else '') + '.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            got = json.load(f)
        return {'text': got.get('text', ''), 'words': got.get('words', [])}
    got = json.loads(request('/v1/asr', {'audio': audio_bytes, 'language': 'ko', 'ignore_timestamps': not timestamps},
                             ASR_MODEL, kind='msgpack'))
    spent('asrSec', seconds)
    text = re.sub(r'<\|[^|]*\|>', '', got.get('text', '')).strip()
    words = [{'text': s.get('text', ''), 'start': float(s.get('start', 0)), 'end': float(s.get('end', 0))}
             for s in (got.get('segments') or [])]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'text': text, 'words': words}, f, ensure_ascii=False)
    return {'text': text, 'words': words}


# ── 가짜 말소리(--self-test) ──

def fake_line(word_texts, speed, seed=0):
    """API 없이 쓰는 가짜 줄 소리(WAV 바이트)와 낱말 시각. 음절마다 길이가 조금씩 다른 소리 덩어리,
    낱말 사이에는 짧게 작아지는 곳(완전한 무음은 아님)을 둔다. 실제 말처럼 낱말 안 둘째 음절 앞에는
    닫힘소리(ㅂ·ㄷ·ㄱ)의 짧은 완전 무음을 두어, 낱말 사이 쉼보다 더 깊은 골짜기가 낱말 안에 생기게 한다.
    앞 0.3초·뒤 0.45초 무음."""
    rng = np.random.default_rng(seed)
    parts = [rng.normal(0, 1e-4, int(0.3 * SR))]
    t = 0.3
    words = []
    for wi, text in enumerate(word_texts):
        n = syllables(text)
        start = t
        for si in range(max(1, n)):
            if si == 1:
                k = int(0.045 * SR)
                parts.append(rng.normal(0, 1e-5, k))
                t += k / SR
            per = rng.uniform(0.17, 0.27) / speed
            k = int(per * SR)
            tt = np.arange(k) / SR
            env = 0.35 + 0.65 * np.sin(np.pi * tt / per) ** 2
            f0 = rng.uniform(150, 210)
            parts.append(sum(np.sin(2 * np.pi * f0 * h * tt) / h for h in (1, 2, 3, 5)) * env * 0.25)
            t += k / SR
        words.append({'text': text if n else '가', 'start': round(start, 2), 'end': round(t, 2)})
        if wi + 1 < len(word_texts):
            k = int(rng.uniform(0.04, 0.09) * SR)
            parts.append(rng.normal(0, 0.004, k))
            t += k / SR
    parts.append(rng.normal(0, 1e-4, int(0.45 * SR)))
    return wav_bytes(np.concatenate(parts)), words


# ── 계획 ──

def load_plan(only, tempo=None, tempos=None):
    args = ['node', os.path.join(HERE, 'plan.mjs')]
    if only:
        args += ['--only', ','.join(only)]
    if tempo:
        args += ['--tempo', str(tempo)]
    if tempos:
        args += ['--tempos', ','.join(f'{k}={v}' for k, v in tempos.items())]
    p = subprocess.run(args, cwd=ROOT, capture_output=True)
    if p.returncode:
        raise SystemExit('계획을 만들지 못함: ' + p.stderr.decode('utf-8', 'replace')[-800:])
    return json.loads(p.stdout.decode('utf-8'))


def clip_map(song):
    return {c['path']: c for c in song['clips']}


def probe_lines(song, n=PROBE_LINES):
    """가장 긴 음보가 들어 있을 줄 n개. 음보의 무게 = 음절 수 + 쉼표·말줄임 같은 쉼 하나에 2(쉼이 들어가 길어진다).
    무게가 큰 줄부터, 같으면 짧은 줄부터 고르고, 가장 무거운 음보보다 1 넘게 가벼운 줄은 고르지 않는다."""
    cm = clip_map(song)

    def weight(line):
        return max(cm[p]['syllables'] + 2 * len(re.findall(r'[,.!?…·]', cm[p]['text'])) for p in line['clips'])

    ranked = sorted(song['lines'], key=lambda l: (-weight(l), len(l['text'].encode('utf-8'))))
    top = weight(ranked[0])
    return [l for l in ranked if weight(l) >= top - 1][:n]


def dry_run(plan, cfg, columns):
    """columns: [(이름, {노래 id: 후보 id})] — 배정마다 한 번씩 읽힌다고 보고 요금을 어림한다."""
    by_genre = {}
    totals = {'songs': 0, 'lines': 0, 'clips': 0, 'syllables': 0, 'bytes': 0, 'billed': 0, 'probe': 0}
    for song in plan['songs']:
        g = by_genre.setdefault(song['genre'], {'songs': 0, 'lines': 0, 'clips': 0, 'bytes': 0})
        g['songs'] += 1
        g['lines'] += len(song['lines'])
        g['clips'] += len(song['clips'])
        totals['songs'] += 1
        totals['lines'] += len(song['lines'])
        totals['clips'] += len(song['clips'])
        totals['syllables'] += sum(c['syllables'] for c in song['clips'])
        for line in song['lines']:
            b = len(line['text'].encode('utf-8'))
            g['bytes'] += b
            totals['bytes'] += b
            for _, assign in columns:
                cand = cfg['candidates'][assign[song['id']]]
                totals['billed'] += len(tts_text(line['text'], cand).encode('utf-8'))
        totals['probe'] += sum(len(l['text'].encode('utf-8')) for l in probe_lines(song))
    voices = sorted({c for _, a in columns for c in a.values()})
    say(f'목소리 {", ".join(name for name, _ in columns)}({", ".join(voices)}) · 모델 {cfg["model"]}(유료) · 노래 {totals["songs"]}편 · 줄 단위로 읽힘')
    say('\n갈래      노래   줄  조각  UTF-8 바이트')
    for gid, g in by_genre.items():
        say(f'{gid:<8}{g["songs"]:>5}{g["lines"]:>5}{g["clips"]:>6}{g["bytes"]:>14}')
    say(f'{"합계":<7}{totals["songs"]:>5}{totals["lines"]:>5}{totals["clips"]:>6}{totals["bytes"]:>14}  (음절 {totals["syllables"]})')
    tts_cost = totals['billed'] / 1e6 * PRICE_PER_MBYTE
    est_sec = totals['syllables'] * SEC_PER_SYLLABLE
    asr_cost = est_sec / 3600 * ASR_PRICE_PER_HOUR * len(columns)
    say(f'\n요금 추정(USD, 배정 {len(columns)}벌): 전체 {totals["billed"]} 바이트 × ${PRICE_PER_MBYTE}/100만 바이트 = ${tts_cost:.4f}'
        f' + 받아쓰기(경계 시각) ${asr_cost:.4f} + 목소리 설계 ${DESIGN_PRICE * len(voices):.2f}')
    say(f'  빠르기 재기(--tempo-probe, 노래마다 줄 {PROBE_LINES}개): 목소리 하나 {totals["probe"]} 바이트 = ${totals["probe"] / 1e6 * PRICE_PER_MBYTE:.4f}')
    say(f'  캐시에 있는 줄은 다시 부르지 않으므로 0. 예상 낭송 길이 약 {est_sec / 60:.1f}분(목소리 하나)')


# ── 줄 읽히고 자르기 ──

def build_line(line, song, ref, cand, cfg, use_asr=True):
    """줄 하나를 읽히고 음보 조각으로 자른다. 돌려주는 값: { pieces: {경로: 소리}, method, stamp, cached, natural, asr, spoken }
    받아쓰기로도 음절 비율로도 말이 안 되게 잘리면(목소리가 음보를 이어 읽어 소리에 경계가 없을 때, 예: '유덕하신님,')
    음보 사이에 쉼표를 넣은 글로 한 번 더 읽힌다(spoken에 실제로 읽힌 글을 남긴다)."""
    cm = clip_map(song)
    paths = line['clips']
    feet = [cm[p]['text'] for p in paths]
    said_feet = [pronounce(f) for f in feet]   # 받아쓰기 맞춤은 실제로 읽힌 글로
    counts = [max(1, syllables(f)) for f in feet]
    if use_asr == 'multi' and len(paths) == 1:
        use_asr = False   # 빠르기 재기: 자를 일이 없는 줄(향가 구 등)은 받아쓰기를 부르지 않는다

    def read(text):
        audio, stamp, cached = tts(pronounce(text), ref, cand, cfg)
        x = decode(audio)
        heard = None
        words = None
        if use_asr:
            fake_words = None
            if FAKE:
                fake_words = fake_line(text.split(), cand.get('speed', 1), seed=int(stamp[:6], 16))[1]
            heard = asr(audio, len(x) / SR, timestamps=len(paths) > 1, fake_words=fake_words)
            words = heard['words'] if len(paths) > 1 else None
            if words is not None and asr_boundaries(words, said_feet) is None and not FAKE:
                # 헛들은 받아쓰기(다른 말 등): 앞뒤 무음을 뺀 소리로 한 번 더 듣는다(다른 소리라 캐시도 따로).
                s0, e0 = speech_span(x)
                again = asr(wav_bytes(x[s0:e0]), (e0 - s0) / SR, timestamps=True)
                shifted = [{**w, 'start': w['start'] + s0 / SR, 'end': w['end'] + s0 / SR} for w in again['words']]
                if asr_boundaries(shifted, said_feet) is not None:
                    heard, words = {**again, 'words': shifted}, shifted
        pieces, method, cuts = cut_line(x, said_feet, words)
        return {'x': x, 'stamp': stamp, 'cached': cached, 'heard': heard, 'pieces': pieces, 'method': method, 'cuts': cuts,
                'spoken': text, 'tts': pronounce(text)}

    got = read(line['text'])
    if len(paths) > 1 and piece_trouble(got['pieces'], counts) is not None:
        again = read(', '.join(feet))
        if piece_trouble(again['pieces'], counts) is None:
            again['cached'] = again['cached'] and got['cached']
            got = again
    x = got['x']
    gain, measured, gain_db = line_gain(got['pieces'])
    out = {p: piece * gain for p, piece in zip(paths, got['pieces'])}
    natural_line = speech_span(x)
    whole = x[max(0, natural_line[0] - int(LEAD_PAD * SR)):natural_line[1] + int(TAIL_PAD * SR)] * gain
    heard = got['heard']
    return {'pieces': out, 'method': got['method'], 'cuts': got['cuts'], 'stamp': got['stamp'], 'cached': got['cached'],
            'whole': whole, 'asr': heard['text'] if heard else None, 'lufsBefore': measured, 'gainDb': gain_db,
            'spoken': got['spoken'], 'tts': got['tts']}


def synth_lines(work, ref, cand, cfg, jobs, use_asr=True):
    """work: [(song, line)] → { (songId, lineKey): build_line 결과 }"""
    results = {}
    errors = []
    with cf.ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = {pool.submit(build_line, line, song, ref, cand, cfg, use_asr): (song, line) for song, line in work}
        for i, fut in enumerate(cf.as_completed(futures), 1):
            song, line = futures[fut]
            try:
                results[(song['id'], line['key'])] = fut.result()
            except Exception as e:  # noqa: BLE001 — 한 줄의 실패를 모아 끝에 알린다
                errors.append(f'{song["id"]} {line["key"]}: {redact(e)}')
            if i % 20 == 0 or i == len(work):
                say(f'  … 줄 {i}/{len(work)}')
    if errors:
        for e in errors[:20]:
            say('  ✗ ' + e)
        raise SystemExit(f'줄 {len(errors)}개를 만들지 못함(만든 것은 캐시에 남아 다시 돌리면 이어서 만든다).')
    return results


def longest_clip(song, results):
    best = (0.0, None)
    for line in song['lines']:
        r = results.get((song['id'], line['key']))
        if not r:
            continue
        for p, x in r['pieces'].items():
            if len(x) / SR > best[0]:
                best = (len(x) / SR, p)
    return best


# ── 노래 데이터에 빠르기 쓰기 ──

def set_tempo_in_source(src, song_id, tempo):
    """노래 파일 글에서 id가 song_id인 노래 객체에 `tempo: N,`을 쓴다(있으면 바꾸고, 없으면 genre 줄 다음에 넣는다)."""
    lines = src.split('\n')
    at = next((i for i, l in enumerate(lines) if re.fullmatch(r"(\s*)id: '" + re.escape(song_id) + r"',", l)), None)
    if at is None:
        raise ValueError('노래를 찾지 못함: ' + song_id)
    indent = re.match(r'\s*', lines[at]).group(0)
    close = indent[:-2] + '}'
    end = next(i for i in range(at, len(lines)) if lines[i].startswith(close) and not lines[i].startswith(close + ' '))
    value = f'{indent}tempo: {tempo},'
    for i in range(at, end):
        if re.fullmatch(re.escape(indent) + r'tempo: [\d.]+,', lines[i]):
            lines[i] = value
            return '\n'.join(lines)
    g = next((i for i in range(at, end) if re.fullmatch(re.escape(indent) + r"genre: '[a-z]+',", lines[i])), None)
    if g is None:
        raise ValueError('genre 줄을 찾지 못함: ' + song_id)
    lines.insert(g + 1, value)
    return '\n'.join(lines)


def write_tempos(tempos, songs_dir=None):
    """{노래 id: 빠르기}를 js/data/songs/<갈래>.js에 쓴다."""
    songs_dir = songs_dir or SONGS_DIR
    left = dict(tempos)
    for name in sorted(os.listdir(songs_dir)):
        if not name.endswith('.js') or name == 'index.js':
            continue
        path = os.path.join(songs_dir, name)
        with open(path, encoding='utf-8') as f:
            src = f.read()
        changed = src
        for sid in list(left):
            if re.search(r"\n\s*id: '" + re.escape(sid) + r"',\n", changed):
                changed = set_tempo_in_source(changed, sid, left.pop(sid))
        if changed != src:
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(changed)
    if left:
        raise SystemExit('노래 파일에서 찾지 못한 노래: ' + ', '.join(left))


# ── 빠르기 재기(--tempo-probe) ──

def synth_assigned(songs, assign, cfg, jobs, use_asr=True, pick_lines=None):
    """노래마다 배정된 목소리로 줄을 읽힌다. assign: {노래 id: 후보 id}. 돌려주는 값: (결과, {후보 id: 기준 음성})"""
    results = {}
    refs = {}
    for cid in sorted({assign[s['id']] for s in songs}):
        cand = cfg['candidates'][cid]
        refs[cid] = design_voice(cid, cand, cfg)
        mine = [s for s in songs if assign[s['id']] == cid]
        work = [(s, l) for s in mine for l in (pick_lines(s) if pick_lines else s['lines'])]
        say(f'{cid}: 노래 {len(mine)}편 · 줄 {len(work)}개')
        results.update(synth_lines(work, refs[cid], cand, cfg, jobs, use_asr))
    return results, refs


def tempo_probe(plan, columns, cfg, jobs, write):
    """columns: [(이름, {노래 id: 후보 id})]. 배정마다 재고, 노래마다 가장 느린 쪽을 쓴다."""
    table = {s['id']: {'song': s, 'by': {}} for s in plan['songs']}
    for name, assign in columns:
        say(f'\n{name}: 노래마다 가장 긴 음보가 있을 줄을 읽혀 잰다')
        results, _ = synth_assigned(plan['songs'], assign, cfg, jobs, use_asr='multi', pick_lines=probe_lines)
        for s in plan['songs']:
            table[s['id']]['by'][name] = longest_clip(s, results)
    say('\n노래                      갈래     전 빠르기  ' + '  '.join(f'{c:>22}' for c, _ in columns) + '  → 자연 빠르기')
    tempos = {}
    for sid, row in table.items():
        s = row['song']
        longest = max(v[0] for v in row['by'].values())
        tempos[sid] = natural_tempo(longest)
        cols = '  '.join(f'{v[0]:>6.2f}s {v[1].rsplit("/", 1)[-1]:>14}' for v in row['by'].values())
        say(f'{sid:<26}{s["genre"]:<9}{s["tempo"]:>8g}  {cols}  → {tempos[sid]:>3} (칸 {60 / tempos[sid]:.2f}s)')
    if write:
        write_tempos(tempos)
        say(f'\n노래 데이터에 빠르기를 썼다: {len(tempos)}편 (js/data/songs/*.js의 tempo)')
    return tempos


# ── 조각 만들기 ──

def assemble(song, clips_x, out_path, click=False, lead=0.5, tail=0.8):
    """게임이 놓는 그대로(plan.schedule의 when) 조각을 칸에 놓아 이어 붙인다."""
    total = lead + song['duration'] + tail
    y = np.zeros(int(total * SR) + SR)
    for s in song['schedule']:
        x = clips_x[s['path']]
        a = int((lead + s['when']) * SR)
        y[a:a + len(x)] += x
        if click:
            n = int(0.012 * SR)
            t = np.arange(n) / SR
            y[a:a + n] += 0.06 * np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 400)
    peak = np.abs(y).max()
    if peak > 0.95:
        y *= 0.95 / peak
    encode_mp3(y[:int(total * SR)], out_path)


def assemble_natural(song, results, out_path, lead=0.4, tail=0.6):
    """박자 칸 없이 줄 소리를 그대로 이어 붙인다(줄 사이 LINE_GAP 쉼)."""
    parts = [np.zeros(int(lead * SR))]
    for i, line in enumerate(song['lines']):
        parts.append(results[(song['id'], line['key'])]['whole'])
        parts.append(np.zeros(int((LINE_GAP if i + 1 < len(song['lines']) else tail) * SR)))
    y = np.concatenate(parts)
    peak = np.abs(y).max()
    if peak > 0.95:
        y *= 0.95 / peak
    encode_mp3(y, out_path)


def voice_info(cid, cand, ref, cfg):
    """생성 기록의 목소리 한 개 설명."""
    return {'label': cand['label'], 'designModel': cfg['designModel'], 'designSeed': cand['seed'], 'designId': ref['id'],
            'referenceSha256': ref['sha256'], 'instruction': cand['instruction'], 'referenceText': cand['referenceText'],
            'direction': cand.get('direction', ''), 'ttsSpeed': cand.get('speed', 1)}


def run_build(plan, assign, cfg, sample, jobs, write_tempo=False, tempo_override=None, prefix='', label=None):
    """assign: {노래 id: 후보 id}(실제 조각은 승인 배정, 견본은 한 목소리 또는 승인 배정).
    label: 견본 폴더 이름(없으면 목소리가 하나일 때 그 후보 id, 여럿이면 'approved')."""
    used = sorted({assign[s['id']] for s in plan['songs']})
    label = label or (used[0] if len(used) == 1 else 'approved')
    account = {'packageType': '자체 시험', 'toppedUp': False} if FAKE else account_check()
    out_root = os.path.join(SAMPLES, prefix + label) if sample else ROOT

    results, refs = synth_assigned(plan['songs'], assign, cfg, jobs)
    for cid, ref in refs.items():
        say(f'기준 음성: {cid} · 설계 id {ref["id"]} · {ref["durationMs"]}ms · sha256 {ref["sha256"][:12]}…')
        if sample:
            os.makedirs(SAMPLES, exist_ok=True)
            with open(os.path.join(SAMPLES, f'{prefix}{cid}-reference.wav'), 'wb') as f:
                f.write(ref['audio'])

    # 노래마다 자연 빠르기와 쓸 빠르기
    natural = {s['id']: natural_tempo(longest_clip(s, results)[0]) for s in plan['songs']}
    if sample:
        use = {sid: (tempo_override or t) for sid, t in natural.items()}
    elif write_tempo:
        write_tempos(natural)
        use = natural
    else:
        use = {s['id']: s['tempo'] for s in plan['songs']}
        over = [(s['id'], s['tempo'], natural[s['id']]) for s in plan['songs'] if natural[s['id']] < s['tempo']
                and longest_clip(s, results)[0] > 60 / s['tempo']]
        if over:
            for sid, t, n in over:
                say(f'  ✗ {sid}: 노래 데이터의 빠르기 {t:g}의 칸에 가장 긴 조각이 들어가지 않는다(자연 빠르기 {n})')
            raise SystemExit('칸을 넘는 노래가 있다. --write-tempo로 노래 데이터의 빠르기를 자연 빠르기로 고친 뒤 다시 돌리세요.')
    plan2 = load_plan(plan.get('only'), tempos=use)
    songs2 = {s['id']: s for s in plan2['songs']}

    manifest_path = os.path.join(out_root, 'assets', 'audio', 'voice', 'manifest.json')
    old = {}
    old_voices = {}
    old_per_foot = None
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding='utf-8') as f:
            got = json.load(f)
        old = {c['path']: c for c in got.get('clips', [])}
        old_voices = (got.get('generator') or {}).get('voices') or {}
        old_per_foot = (got.get('generator') or {}).get('perFoot')
    entries = dict(old)
    rows = []
    calls = sum(1 for r in results.values() if not r['cached'])
    for song0 in plan['songs']:
        song = songs2[song0['id']]
        cid = assign[song['id']]
        cand = cfg['candidates'][cid]
        cm = clip_map(song)
        song_dir = os.path.join(out_root, 'assets', 'audio', 'voice', song['id'])
        wanted = set()
        clips_x = {}
        for line in song['lines']:
            r = results[(song['id'], line['key'])]
            for p in line['clips']:
                clip = cm[p]
                x = r['pieces'][p]
                path = os.path.join(out_root, p)
                encode_mp3(x, path)
                wanted.add(os.path.basename(path))
                clips_x[p] = x
                dur = probe_sec(path)
                entry = {
                    'path': p, 'songId': song['id'], 'voice': cid, 'unit': clip['unit'], 'line': clip['line'], 'foot': clip['foot'],
                    'text': clip['text'], 'duration': round(dur, 4), 'slotSec': round(song['slotSec'], 4), 'tempo': song['tempo'],
                    'naturalSec': round(len(x) / SR, 3), 'ttsSpeed': cand.get('speed', 1), 'stretch': 1,
                    'lineText': r['spoken'], 'cut': r['method'], 'lineGainDb': round(r['gainDb'], 2),
                    'sha256': sha256_file(path), 'generation': r['stamp'],
                }
                if r['tts'] != r['spoken']:
                    entry['spokenText'] = r['tts']     # 낭송용 발음 표기로 실제로 읽힌 글
                if r['asr'] is not None:
                    entry['lineAsr'] = r['asr']
                    entry['lineAsrMatch'] = round(similarity(r['tts'], r['asr']), 3)
                entries[p] = entry
                rows.append(entry)
        for f in os.listdir(song_dir):
            if f.endswith('.mp3') and f not in wanted:
                os.remove(os.path.join(song_dir, f))
                entries.pop('assets/audio/voice/' + song['id'] + '/' + f, None)
                say('  남는 조각 지움: ' + song['id'] + '/' + f)
        if sample:
            tag = f'{prefix}{cid}-{song["id"]}-tempo{song["tempo"]:g}'
            assemble(song, clips_x, os.path.join(SAMPLES, tag + '.mp3'))
            assemble(song, clips_x, os.path.join(SAMPLES, tag + '-beat.mp3'), click=True)
            assemble_natural(song, results, os.path.join(SAMPLES, f'{prefix}{cid}-{song["id"]}-natural.mp3'))
            if song['genre'] == 'hyangga':
                first = song['clips'][0]['path']
                one = {**song, 'duration': song['slotSec'], 'schedule': [s for s in song['schedule'] if s['path'] == first]}
                assemble(one, clips_x, os.path.join(SAMPLES, f'{prefix}{cid}-{song["id"]}-gu0.mp3'))
    if not plan.get('only'):
        voice_root = os.path.join(out_root, 'assets', 'audio', 'voice')
        for d in os.listdir(voice_root):
            if os.path.isdir(os.path.join(voice_root, d)) and d not in plan['allSongIds']:
                shutil.rmtree(os.path.join(voice_root, d))
                say('  남는 노래 폴더 지움: ' + d)
        entries = {p: e for p, e in entries.items() if e['songId'] in plan['allSongIds']}

    clips_sorted = sorted(entries.values(), key=lambda e: (e['songId'], e['path']))
    voices = {**old_voices, **{cid: voice_info(cid, cfg['candidates'][cid], ref, cfg) for cid, ref in refs.items()}}
    voices = {cid: v for cid, v in sorted(voices.items()) if any(e.get('voice') == cid for e in clips_sorted)}
    ap = cfg.get('approved')
    if sample:
        record = {'sample': {sid: assign[sid] for sid in sorted(assign) if sid in songs2}}
    else:
        record = ap if isinstance(ap, dict) else {'default': ap, 'bySong': {}}
    generator = {
        'service': 'Fish Audio API', 'model': cfg['model'], 'plan': f'유료 API 충전(종량 과금) · 플랫폼 구독 {account["packageType"]}',
        'assignment': record, 'voices': voices, 'tts': cfg['tts'],
        'method': METHOD,
        'fill': FILL, 'targetLufs': TARGET_LUFS, 'peakMaxDb': PEAK_MAX_DB, 'bitrate': BITRATE,
    }
    if PRON:
        generator['pronounce'] = [{'from': a_, 'to': b_} for a_, b_ in PRON]
    if old_per_foot and any(e.get('cut') == 'per-foot' for e in clips_sorted):
        generator['perFoot'] = {**old_per_foot, 'clips': sum(1 for e in clips_sorted if e.get('cut') == 'per-foot')}
    write_json(manifest_path, {'version': 1, 'source': 'Fish Audio', 'generator': generator, 'license': LICENSE,
                               'commercialUse': True, 'clips': clips_sorted})
    if not sample:
        write_part(clips_sorted, voices, cfg, PART)

    report(rows, plan2, calls, natural)
    return rows, natural, results


METHOD = ('줄 단위 낭송을 받아쓰기 낱말 시각(없으면 음절 비율)과 소리 골짜기로 음보마다 자름 · '
          '경계가 어긋난 줄은 음보마다 따로 읽힘(cut: per-foot, --per-foot) · 늘이거나 줄이지 않음')


def write_part(clips_sorted, voices, cfg, part_path):
    """자산 목록 조각(assets/manifest.parts/voice.json): 조각마다 항목 하나."""
    def gen(e):
        v = voices[e['voice']]
        return (f'tools/voice/build_voice.py · 모델 {cfg["model"]} · 목소리 {e["voice"]}({v["designModel"]} seed {v["designSeed"]}, '
                f'기준 음성 sha256 {v["referenceSha256"][:12]}) · 유료 API')
    part = {'version': 1, 'assets': [{
        'path': e['path'], 'kind': 'voice',
        'source': f'Fish Audio TTS API({cfg["model"]}) — AI 합성 낭송',
        'generator': gen(e), 'license': LICENSE, 'commercialUse': True, 'notes': e['text'],
    } for e in clips_sorted]}
    write_json(part_path, part)


def report(rows, plan, calls, natural):
    say(f'\n새로 부른 TTS(줄) {calls}번(나머지는 캐시).')
    say('조각                                   글                 칸(s)   길이(s)  자름' + ('  줄 받아쓰기' if rows and 'lineAsr' in rows[0] else ''))
    for e in rows:
        mark = '  ← 칸 넘침' if e['duration'] > e['slotSec'] else ''
        asr_txt = f'  {e["lineAsrMatch"]:.2f}' if 'lineAsr' in e else ''
        say(f'{e["path"].replace("assets/audio/voice/", ""):<36}{e["text"]:<16}{e["slotSec"]:>7.2f}{e["duration"]:>9.3f}  {e["cut"]:<6}{asr_txt}{mark}')
    for song in plan['songs']:
        mine = [e for e in rows if e['songId'] == song['id']]
        if not mine:
            continue
        longest = max(mine, key=lambda e: e['naturalSec'])
        over = sum(1 for e in mine if e['duration'] > e['slotSec'])
        say(f'{song["id"]}: 빠르기 {song["tempo"]:g}(칸 {song["slotSec"]:.2f}s) · 조각 {len(mine)} · 칸 넘침 {over}'
            f' · 가장 긴 조각 {longest["naturalSec"]:.2f}s({longest["path"].rsplit("/", 1)[-1]}) → 자연 빠르기 {natural[song["id"]]}')


ASR_LOW = 0.6                # 듣기 대신 점검: 줄 받아쓰기 일치가 이보다 낮으면 들어 볼 줄로 알린다


def qa_report(rows):
    """듣기 대신 점검(받아쓰기): 받아쓰기 일치가 낮은 줄, 음절 비율로 어림해 자른(cut 'energy') 조각을 알린다.
    돌려주는 값: { low: [(노래, 줄 글, 일치, 받아쓰기)], energy: [경로], songs: {노래: (평균 일치, 가장 낮은 일치)} }"""
    lines = {}
    for e in rows:
        if 'lineAsrMatch' in e:
            lines[(e['songId'], e['unit'], e['line'])] = (e['lineText'], e['lineAsrMatch'], e['lineAsr'])
    songs = {}
    for (sid, _, _), (_, m, _) in lines.items():
        songs.setdefault(sid, []).append(m)
    low = sorted([(sid, t, m, h) for (sid, _, _), (t, m, h) in lines.items() if m < ASR_LOW], key=lambda r: r[2])
    energy = [e['path'] for e in rows if e['cut'] == 'energy']
    summary = {sid: (sum(v) / len(v), min(v)) for sid, v in songs.items()}
    say(f'\n듣기 대신 점검(받아쓰기): 줄 {len(lines)}개 · 일치 {ASR_LOW} 아래 {len(low)}줄 · 음절 비율로 자른 조각 {len(energy)}개')
    for sid, (avg, mn) in sorted(summary.items(), key=lambda kv: kv[1][0]):
        say(f'  {sid:<26} 평균 일치 {avg:.2f} · 가장 낮은 줄 {mn:.2f}')
    for sid, t, m, h in low:
        say(f'  낮음 {m:.2f}  {sid}: "{t}" → 받아쓰기 "{h}"')
    for p in energy:
        say('  음절 비율로 자름(들어 볼 것): ' + p)
    return {'low': low, 'energy': energy, 'songs': summary}


def check_previews(paths, texts, use_asr):
    """미리 듣기가 무음이 아닌지(ffmpeg volumedetect), 받아쓰기가 글과 비슷한지."""
    bad = []
    for path in paths:
        p = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'],
                           capture_output=True)
        s = p.stderr.decode('utf-8', 'replace')
        m = re.search(r'mean_volume:\s*(-?[\d.]+) dB', s)
        mx = re.search(r'max_volume:\s*(-?[\d.]+) dB', s)
        mean = float(m.group(1)) if m else -999
        peak = float(mx.group(1)) if mx else -999
        line = f'{os.path.basename(path)}: 평균 {mean:.1f} dB · 봉우리 {peak:.1f} dB'
        if mean < -45 or peak < -20:
            bad.append(line + ' — 너무 조용하다(무음?)')
        if use_asr and path in texts:
            with open(path, 'rb') as f:
                audio = f.read()
            heard = asr(audio, probe_sec(path))['text']
            sim = similarity(texts[path], heard)
            line += f' · 받아쓰기 일치 {sim:.2f} "{heard[:60]}"'
            # 박자 칸 미리 듣기는 쉼이 길어 받아쓰기가 다른 말(일본어 등)로 헛듣는 일이 있어 알리기만 한다.
            # 판정은 박자 칸 없이 줄 그대로 이은 미리 듣기(-natural)로 한다.
            if sim < 0.6 and path.endswith('-natural.mp3'):
                bad.append(line + ' — 받아쓰기가 글과 많이 다르다')
            elif sim < 0.6:
                line += ' (알림: 쉼이 긴 미리 듣기라 받아쓰기가 헛들었을 수 있다)'
        say('  ' + line)
    return bad


# ── 음보마다 따로 읽히기(--per-foot) ──
# 줄을 한 번에 읽혀 자르면 경계가 어긋나는 줄(받아쓰기 낱말 시각이 밀리거나, 음보가 이어 읽혀 소리에 골짜기가 없음)이 있다.
# 그런 줄만 골라 음보(향가는 구, 고려가요 여음·후렴도)마다 그 음보의 오늘 소리를 TTS 한 번씩 읽힌다. 자를 일이 없다.
# 목소리·모델·설정은 줄 단위와 같고(승인 배정), 다듬기는 'whole' 조각과 같다(그 소리 기준 문턱, 앞 LEAD_PAD·뒤 TAIL_PAD,
# 짧은 페이드). 음량은 같은 노래의 다른 조각(같은 목소리)의 조각별 음량 가운데값에 맞춘다(봉우리 PEAK_MAX_DB 아래).
# 조각 경로·이름은 그대로라 게임이 부르는 이름(voiceClipPath)이 바뀌지 않는다. 생성 기록에는 cut: 'per-foot',
# spokenText(실제로 읽힌 글)를 남긴다. 바꾸기 전의 조각과 생성 기록은 --backup 폴더에 같은 경로로 남긴다(되돌리기용).

FOOT_SEC_PER_SYL = (0.10, 0.45)   # 음보 소리 길이 ÷ 음절 수가 이 밖이면 '들어 볼 것'으로 알린다


FOOT_TAIL_MIN = 0.010             # 칸을 조금 넘는 조각은 뒤 틈만 이만큼까지 줄여 칸에 넣는다(말소리는 그대로)


def foot_piece(x, tail=TAIL_PAD):
    """음보 하나를 따로 읽힌 소리를 다듬는다. 줄이 음보 하나뿐인 'whole' 조각과 같은 방법(tail: 소리 끝 뒤에 남길 틈)."""
    db, _ = frame_db(x)
    gate = line_gate(db)
    span = speech_span(x, gate)
    if span is None:
        raise RuntimeError('소리가 비었다')
    s0, e0 = span
    y = x[max(0, s0 - int(LEAD_PAD * SR)):min(len(x), e0 + int(tail * SR))].copy()
    fi, fo = int(FADE_IN * SR), int(FADE_OUT * SR)
    if len(y) > fi + fo:
        y[:fi] *= np.linspace(0, 1, fi)
        y[-fo:] *= np.linspace(1, 0, fo)
    return y


def per_foot_spec(path):
    """--lines 파일(JSON): {"lines": [[노래 id, 줄 key], …], "context": {조각 경로: 덧붙일 글}}.
    줄 key는 plan.mjs의 줄 key(고려가요 '<연>-<줄>', 나머지 '<단위>-', 향가 '<구>-'). context는 아주 짧은 음보(한 음절 등)를
    따로 읽혔을 때 소리가 이상하면 쉼표 같은 가벼운 맥락을 붙여 다시 읽히는 데 쓴다(조각 글은 그대로, spokenText에 남는다)."""
    with open(path, encoding='utf-8') as f:
        spec = json.load(f)
    lines = []
    for pair in spec.get('lines') or []:
        if not (isinstance(pair, list) and len(pair) == 2):
            raise SystemExit(f'--lines: 줄은 [노래 id, 줄 key] 모양이어야 한다: {pair}')
        if tuple(pair) not in lines:
            lines.append(tuple(pair))
    if not lines:
        raise SystemExit('--lines: 줄 목록(lines)이 비었다')
    return lines, dict(spec.get('context') or {})


def per_foot_items(plan, lines, context, assign, cfg):
    """다시 읽힐 음보 목록: [{song, line, path, clip, spoken, full, cid, cand}]"""
    songs = {s['id']: s for s in plan['songs']}
    items = []
    for sid, key in lines:
        song = songs.get(sid)
        if not song:
            raise SystemExit(f'--lines: 노래 데이터에 없는 노래: {sid}')
        line = next((l for l in song['lines'] if l['key'] == key), None)
        if not line:
            raise SystemExit(f'--lines: {sid}에 줄 {key}가 없다(있는 줄: {", ".join(l["key"] for l in song["lines"][:6])} …)')
        cid = assign[sid]
        cand = cfg['candidates'][cid]
        cm = clip_map(song)
        for p in line['clips']:
            spoken = pronounce(cm[p]['text']) + context.get(p, '')
            items.append({'song': song, 'line': line, 'path': p, 'clip': cm[p], 'spoken': spoken,
                          'full': tts_text(spoken, cand), 'cid': cid, 'cand': cand})
    used = {it['path'] for it in items}
    stray = [p for p in context if p not in used]
    if stray:
        raise SystemExit('--lines의 context에 줄 목록 밖 조각: ' + ', '.join(stray))
    return items


def per_foot_cost(items, cfg):
    """요청 수와 요금 추정(키 없이). 같은 목소리·같은 글은 한 번만 부른다. 캐시 해시는 승인 후보의 referenceSha256으로 미리 셈한다."""
    reqs = {}
    for it in items:
        ref_sha = it['cand'].get('referenceSha256')
        reqs.setdefault((it['cid'], it['full']), tts_stamp(it['full'], ref_sha, it['cand'], cfg) if ref_sha else None)
    new = {k: st for k, st in reqs.items() if not (st and os.path.exists(tts_cache_path(st, cfg)))}
    nbytes = sum(len(full.encode('utf-8')) for (_, full) in new)
    short = [it for it in items if syllables(it['clip']['text']) <= 1]
    retry = sum(len((it['full'] + ',').encode('utf-8')) for it in short)
    return {'feet': len(items), 'requests': len(reqs), 'cached': len(reqs) - len(new), 'new': len(new), 'bytes': nbytes,
            'usd': nbytes / 1e6 * PRICE_PER_MBYTE, 'short': len(short), 'retryUsd': retry / 1e6 * PRICE_PER_MBYTE}


def per_foot_dry_run(items, nlines, cfg):
    c = per_foot_cost(items, cfg)
    songs = sorted({it['song']['id'] for it in items})
    say(f'음보마다 따로 읽히기(--per-foot): 노래 {len(songs)}편 · 줄 {nlines}개 · 음보 조각 {c["feet"]}개 · 모델 {cfg["model"]}(유료)')
    say(f'  요청: 서로 다른 (목소리, 글) {c["requests"]}개 = 캐시에 있음 {c["cached"]} + 새로 부름 {c["new"]}')
    say(f'  요금 추정(USD): {c["bytes"]} 바이트 × ${PRICE_PER_MBYTE}/100만 바이트 = ${c["usd"]:.4f} (받아쓰기·목소리 설계 부르지 않음)')
    say(f'  한 음절 음보 {c["short"]}개를 쉼표를 붙여 한 번씩 더 읽혀도 +${c["retryUsd"]:.4f}')
    say(f'  한도(--max-usd) ${MAX_USD:g} ' + ('안' if c['usd'] <= MAX_USD else '넘음 — 실제로 돌리면 요청 없이 멈춘다'))
    return c


def lufs_of_file(path):
    with open(path, 'rb') as f:
        return lufs(decode(f.read()))


def song_lufs_targets(items, out_root, jobs=8):
    """노래마다 음량 목표(LUFS): 그 노래에서 줄 단위로 만든 조각(같은 목소리)의 조각별 음량 가운데값.
    음보마다 읽은 조각(생성 기록의 cut per-foot와 이번에 만들 조각)은 빼므로, 같은 줄을 다시 돌려도 목표가 같다.
    그 노래에 줄 단위 조각이 없으면 같은 목소리의 모든 노래의 줄 단위 조각 가운데값, 그것도 없으면 TARGET_LUFS."""
    man_path = os.path.join(out_root, 'assets', 'audio', 'voice', 'manifest.json')
    entries = json.load(open(man_path, encoding='utf-8')).get('clips', []) if os.path.exists(man_path) else []
    skip = {it['path'] for it in items} | {e['path'] for e in entries if e.get('cut') == 'per-foot'}
    songs = {it['song']['id']: it['song'] for it in items}
    voice_of = {it['song']['id']: it['cid'] for it in items}
    cache = {}

    def measure(paths):
        todo = [p for p in paths if p not in cache and os.path.exists(os.path.join(out_root, p))]
        with cf.ThreadPoolExecutor(max_workers=jobs) as pool:
            for p, v in zip(todo, pool.map(lambda q: lufs_of_file(os.path.join(out_root, q)), todo)):
                cache[p] = v
        return [cache[p] for p in paths if cache.get(p) is not None]

    out = {}
    for sid, song in songs.items():
        vals = measure([c['path'] for c in song['clips'] if c['path'] not in skip])
        if vals:
            out[sid] = (float(np.median(vals)), len(vals), '같은 노래')
            continue
        pool_v = measure([e['path'] for e in entries if e.get('voice') == voice_of[sid] and e['path'] not in skip])
        out[sid] = (float(np.median(pool_v)), len(pool_v), '같은 목소리 모든 노래') if pool_v else (TARGET_LUFS, 0, '기본값')
    return out


def run_per_foot(plan, assign, cfg, spec_path, jobs, backup_dir, out_root=None, part_path=None, credit_wait=0):
    """--lines의 줄을 음보마다 따로 읽혀 그 줄의 조각만 바꾼다. 돌려주는 값: { written: [경로], skipped: [(노래, 줄, 까닭)], rows }"""
    out_root = out_root or ROOT
    part_path = part_path or PART
    lines, context = per_foot_spec(spec_path)
    items = per_foot_items(plan, lines, context, assign, cfg)
    cost = per_foot_dry_run(items, len(lines), cfg)
    if cost['usd'] > MAX_USD:
        raise SystemExit(f'요금 추정 ${cost["usd"]:.4f}가 한도 ${MAX_USD:g}를 넘어 요청하지 않고 멈춘다.')
    account = {'packageType': '자체 시험'} if FAKE else account_check()
    credit0 = None if FAKE else ACCOUNT.get('apiCredit')
    refs = {cid: design_voice(cid, cfg['candidates'][cid], cfg) for cid in sorted({it['cid'] for it in items})}
    uniq = {}
    for it in items:
        uniq.setdefault((it['cid'], it['full']), it)
    say(f'\n요청 {len(uniq)}개(캐시에 있으면 부르지 않음) · 동시 {jobs}')
    got = {}
    errors = []
    with cf.ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = {pool.submit(tts, it['spoken'], refs[it['cid']], it['cand'], cfg): k for k, it in uniq.items()}
        for i, fut in enumerate(cf.as_completed(futures), 1):
            k = futures[fut]
            try:
                got[k] = fut.result()
            except Exception as e:  # noqa: BLE001 — 하나의 실패를 모아 끝에 알린다
                errors.append(f'{k[1]}: {redact(e)}')
            if i % 25 == 0 or i == len(uniq):
                say(f'  … {i}/{len(uniq)}')
    if errors:
        for e in errors[:20]:
            say('  ✗ ' + e)
        raise SystemExit(f'요청 {len(errors)}개 실패(받은 것은 캐시에 남아 다시 돌리면 이어서 만든다). 조각은 바꾸지 않았다.')
    calls = sum(1 for _, _, cached in got.values() if not cached)

    targets = song_lufs_targets(items, out_root, jobs=max(4, jobs))
    tmp = tempfile.mkdtemp(prefix='voice-per-foot-')
    rows = []
    try:
        for it in items:
            audio, stamp, _ = got[(it['cid'], it['full'])]
            raw = decode(audio)
            target = targets[it['song']['id']][0]
            slot = it['song']['slotSec']
            fp = os.path.join(tmp, it['path'])
            tail = TAIL_PAD
            while True:
                x = foot_piece(raw, tail)
                measured = lufs(x)
                peak = np.abs(x).max() + 1e-12
                gain_db = (target - measured) if measured is not None else 0.0
                gain_db = min(gain_db, PEAK_MAX_DB - 20 * np.log10(peak))
                y = x * 10 ** (gain_db / 20)
                encode_mp3(y, fp)
                dur = probe_sec(fp)
                shorter = tail - (dur - slot) - 0.003
                if dur <= slot or tail <= FOOT_TAIL_MIN or shorter < FOOT_TAIL_MIN:
                    break
                tail = shorter      # 칸을 조금 넘으면 뒤 틈만 줄인다(말소리는 그대로, 늘이거나 줄이지 않음)
            sp = speech_span(y)
            speech = (sp[1] - sp[0]) / SR if sp else 0.0
            n = max(1, syllables(it['clip']['text']))
            notes = []
            if dur > it['song']['slotSec']:
                notes.append(f'칸 넘침 {dur:.3f}s > {it["song"]["slotSec"]:.3f}s')
            if not (FOOT_SEC_PER_SYL[0] <= speech / n <= FOOT_SEC_PER_SYL[1]):
                notes.append(f'음절당 {speech / n:.2f}s — 들어 볼 것')
            if n <= 1:
                notes.append('한 음절 — 들어 볼 것')
            if tail < TAIL_PAD:
                notes.append(f'칸에 넣으려고 뒤 틈 {TAIL_PAD * 1000:.0f}→{tail * 1000:.0f}ms')
            rows.append({**it, 'tmp': fp, 'x': y, 'dur': dur, 'stamp': stamp, 'gainDb': gain_db, 'lufsBefore': measured,
                         'lufs': lufs(y), 'target': target, 'speech': speech, 'notes': notes, 'tail': tail})
        # 줄마다: 한 조각이라도 칸을 넘으면 그 줄은 바꾸지 않는다(이웃 조각과 경계가 맞물리므로 줄째로)
        by_line = {}
        for r in rows:
            by_line.setdefault((r['song']['id'], r['line']['key']), []).append(r)
        skipped = [(sid, key, '; '.join(n for r in rs for n in r['notes'] if n.startswith('칸 넘침')))
                   for (sid, key), rs in by_line.items() if any(r['dur'] > r['song']['slotSec'] for r in rs)]
        skip_keys = {(s, k) for s, k, _ in skipped}
        write_rows = [r for r in rows if (r['song']['id'], r['line']['key']) not in skip_keys]

        # 되돌리기용 백업: 처음 바꾸는 파일만(같은 백업 폴더로 다시 돌리면 맨 처음 것을 지킨다)
        manifest_path = os.path.join(out_root, 'assets', 'audio', 'voice', 'manifest.json')
        os.makedirs(backup_dir, exist_ok=True)
        for src, rp in ((manifest_path, 'assets/audio/voice/manifest.json'), (part_path, 'assets/manifest.parts/voice.json')):
            dst = os.path.join(backup_dir, rp)
            if os.path.exists(src) and not os.path.exists(dst):
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)
        for r in write_rows:
            src = os.path.join(out_root, r['path'])
            dst = os.path.join(backup_dir, r['path'])
            if os.path.exists(src) and not os.path.exists(dst):
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)
        for r in write_rows:
            dst = os.path.join(out_root, r['path'])
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(r['tmp'], dst)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    with open(manifest_path, encoding='utf-8') as f:
        man = json.load(f)
    entries = {c['path']: c for c in man.get('clips', [])}
    for r in write_rows:
        song, clip = r['song'], r['clip']
        entries[r['path']] = {
            'path': r['path'], 'songId': song['id'], 'voice': r['cid'], 'unit': clip['unit'], 'line': clip['line'], 'foot': clip['foot'],
            'text': clip['text'], 'duration': round(r['dur'], 4), 'slotSec': round(song['slotSec'], 4), 'tempo': song['tempo'],
            'naturalSec': round(len(r['x']) / SR, 3), 'ttsSpeed': r['cand'].get('speed', 1), 'stretch': 1,
            'lineText': r['line']['text'], 'spokenText': r['spoken'], 'cut': 'per-foot', 'gainDb': round(r['gainDb'], 2),
            'lufs': round(r['lufs'], 2) if r['lufs'] is not None else None, 'sha256': sha256_file(os.path.join(out_root, r['path'])),
            'generation': r['stamp'],
        }
        if r['tail'] < TAIL_PAD:
            entries[r['path']]['tailPadSec'] = round(r['tail'], 3)
    clips_sorted = sorted(entries.values(), key=lambda e: (e['songId'], e['path']))
    g = man.get('generator') or {}
    voices = dict(g.get('voices') or {})
    for cid, ref in refs.items():
        voices.setdefault(cid, voice_info(cid, cfg['candidates'][cid], ref, cfg))
    g['voices'] = voices
    g['method'] = METHOD
    if PRON:
        g['pronounce'] = [{'from': a_, 'to': b_} for a_, b_ in PRON]
    g['perFoot'] = {'what': '경계가 어긋난 줄을 음보마다 따로 읽힘(cut: per-foot)', 'leadPadSec': LEAD_PAD, 'tailPadSec': TAIL_PAD,
                    'tailPadMinSec': FOOT_TAIL_MIN,
                    'loudness': '같은 노래의 다른 조각(같은 목소리)의 조각별 LUFS 가운데값에 맞춤(그 노래를 모두 다시 만들면 같은 목소리 다른 노래), 봉우리 peakMaxDb 아래',
                    'clips': sum(1 for e in clips_sorted if e.get('cut') == 'per-foot')}
    man['generator'] = g
    man['clips'] = clips_sorted
    write_json(manifest_path, man)
    write_part(clips_sorted, voices, cfg, part_path)

    say('\n조각                                   글              읽힌 글          칸(s)   길이(s)  LUFS(목표)   알림')
    for r in rows:
        mark = '  [줄 건너뜀]' if (r['song']['id'], r['line']['key']) in skip_keys else ''
        lu = f'{r["lufs"]:.1f}' if r['lufs'] is not None else '?'
        say(f'{r["path"].replace("assets/audio/voice/", ""):<36}{r["clip"]["text"]:<14}{r["spoken"]:<14}{r["song"]["slotSec"]:>7.2f}'
            f'{r["dur"]:>9.3f}  {lu:>5}({r["target"]:.1f})  {"; ".join(r["notes"])}{mark}')
    for sid, (t, n, src) in sorted(targets.items()):
        say(f'  음량 목표 {sid}: {t:.1f} LUFS({src} 조각 {n}개의 가운데값)')
    say(f'\n바꾼 조각 {len(write_rows)}개(줄 {len(by_line) - len(skipped)}개) · 새로 부른 TTS {calls}번 · 백업 {rel(backup_dir)}')
    for sid, key, why in skipped:
        say(f'  ✗ 줄 건너뜀(옛 조각 그대로): {sid} {key} — {why}')
    if credit0 is not None and calls:
        # 충전액 자체는 쓰지 않고 차이(실제 차감)만 알린다. 반영이 늦을 수 있어 credit_wait초까지 10초마다 다시 읽는다.
        try:
            waited = 0
            while True:
                delta = credit0 - float(get_json('/wallet/self/api-credit').get('credit') or 0)
                if delta > 0 or waited >= credit_wait:
                    break
                time.sleep(10)
                waited += 10
            say(f'충전액 차이(실제 차감, {waited}초 기다림{", 반영이 늦으면 0일 수 있음" if delta <= 0 else ""}): {delta:.6f}')
        except Exception as e:  # noqa: BLE001 — 알림일 뿐
            say('충전액 차이를 읽지 못함: ' + redact(e))
    return {'written': [r['path'] for r in write_rows], 'skipped': skipped, 'rows': rows, 'calls': calls}


# ── 자체 시험(--self-test) ──

def self_test(cfg):
    """네트워크 없이 줄 자르기·자연 빠르기·음량·MP3·생성 기록·미리 듣기·빠르기 쓰기를 확인한다. 실패하면 0이 아닌 값으로 끝낸다."""
    global FAKE, SAMPLES
    FAKE = True
    bad = []
    # 1) 자르기: 가짜 줄(경계를 알고 있음)을 받아쓰기 시각으로, 받아쓰기 없이 음절 비율로 자른다.
    rng = np.random.default_rng(7)
    pool = [chr(0xAC00 + int(i)) for i in rng.integers(0, 11172, size=400)]
    worst = {'asr': 0.0, 'energy': 0.0, 'misheard': 0.0, 'bogus': 0.0}
    for trial in range(24):
        feet = [''.join(rng.choice(pool, size=int(n))) for n in rng.integers(2, 7, size=int(rng.integers(2, 6)))]
        audio, words = fake_line(feet, 1.0, seed=100 + trial)
        x = decode(audio)
        truth = [(words[i]['end'] + words[i + 1]['start']) / 2 for i in range(len(words) - 1)]
        # 헛들은 받아쓰기: 낱말마다 한 글자를 바꾸고, 첫 낱말에는 한 글자를 더 듣는다(음절 수가 달라짐).
        misheard = [{**w, 'text': ('아' if i == 0 else '') + w['text'][:-1] + '흐'} for i, w in enumerate(words)]
        # 엉뚱한 낱말 시각: 앞 낱말들이 줄 끝 20%에 몰려 있다(받아쓰기가 여러 낱말을 한 덩어리로 들은 경우)
        t_end = words[-1]['end']
        bogus = [{**w, 'start': t_end * (0.8 + 0.2 * w['start'] / t_end), 'end': t_end * (0.8 + 0.2 * w['end'] / t_end)} for w in words]
        for mode, given in (('asr', words), ('energy', None), ('misheard', misheard), ('bogus', bogus)):
            pieces, method, cuts = cut_line(x, feet, given)
            if method != ('energy' if mode in ('energy', 'bogus') else 'asr'):
                bad.append(f'자르기 {trial}: 방법 {method} ({mode})')
            if len(pieces) != len(feet):
                bad.append(f'자르기 {trial}: 조각 {len(pieces)}개 ≠ 음보 {len(feet)}개')
            for c, t in zip(cuts, truth):
                worst[mode] = max(worst[mode], abs(c - t))
    if worst['asr'] > 0.05:
        bad.append(f'받아쓰기 시각으로 자른 경계가 참 경계에서 {worst["asr"] * 1000:.0f}ms 벗어났다(한도 50ms)')
    if worst['misheard'] > 0.08:
        bad.append(f'몇 글자 헛들은 받아쓰기로 자른 경계가 참 경계에서 {worst["misheard"] * 1000:.0f}ms 벗어났다(한도 80ms)')
    # 받아쓰기 없이 음절 비율로만 어림하면 낱말 안의 닫힘소리 골짜기를 고를 수 있어 거칠다(받아쓰기를 못 쓸 때만 쓰고,
    # 보고에 'energy'로 남겨 들어 보게 한다). 한 음절 남짓(350ms) 안에만 들면 된다.
    if worst['energy'] > 0.35:
        bad.append(f'음절 비율로 자른 경계가 참 경계에서 {worst["energy"] * 1000:.0f}ms 벗어났다(한도 350ms)')
    if worst['bogus'] > 0.35:
        bad.append(f'엉뚱한 받아쓰기 시각을 버리고 다시 자른 경계가 참 경계에서 {worst["bogus"] * 1000:.0f}ms 벗어났다(한도 350ms)')
    # 받아쓰기가 글과 크게 다르면(다른 말로 헛들음) 그 시각을 쓰지 않는다
    if asr_boundaries([{'text': '가가', 'start': 0.1, 'end': 0.5}], ['가가가', '가가가가', '가가가']) is not None:
        bad.append('받아쓰기가 글과 크게 다른데도 그 시각을 썼다')
    phon = asr_boundaries([{'text': '무라일체어니', 'start': 0.0, 'end': 1.2}, {'text': '흥이에', 'start': 1.3, 'end': 1.9},
                           {'text': '달을쏘냐', 'start': 2.0, 'end': 2.8}], ['물아일체어니', '흥이애', '다를소냐'])
    if not phon or abs(phon[0][0] - 1.25) > 0.01 or abs(phon[1][0] - 1.95) > 0.01:
        bad.append(f'소리 나는 대로 적은 받아쓰기의 경계를 못 찾았다: {phon}')
    if asr_boundaries([{'text': '白髪に', 'start': 0.1, 'end': 0.5}, {'text': '妾', 'start': 0.5, 'end': 0.9}], ['백발이', '제 몬져']) is not None:
        bad.append('한글이 없는 받아쓰기(다른 말)의 시각을 썼다')
    # 2) 빠르기 쓰기: 노래 데이터 사본(js/data)에 두 번 쓰고(두 번째는 바꾸기) node로 다시 읽는다.
    tmp = tempfile.mkdtemp(prefix='voice-self-test-')
    try:
        data_copy = os.path.join(tmp, 'data')
        shutil.copytree(os.path.join(ROOT, 'js', 'data'), data_copy)
        songs_copy = os.path.join(data_copy, 'songs')
        plan_all = load_plan([])
        want = {s['id']: 10 + i for i, s in enumerate(plan_all['songs'])}
        write_tempos(want, songs_copy)
        write_tempos({k: v + 1 for k, v in want.items()}, songs_copy)
        n = 0
        for name in os.listdir(songs_copy):
            with open(os.path.join(songs_copy, name), encoding='utf-8') as f:
                n += len(re.findall(r'\n\s*tempo: [\d.]+,\n', f.read()))
        if n != len(want):
            bad.append(f'빠르기 쓰기: tempo 줄 {n}개 ≠ 노래 {len(want)}편')
        url = 'file:///' + os.path.join(songs_copy, 'index.js').replace('\\', '/')
        probe = f'const m = await import({json.dumps(url)}); console.log(JSON.stringify(Object.fromEntries(m.songs.map((s) => [s.id, s.tempo]))));'
        p = subprocess.run(['node', '--input-type=module', '-e', probe], capture_output=True)
        if p.returncode:
            bad.append('빠르기를 쓴 노래 파일을 node가 읽지 못한다: ' + p.stderr.decode('utf-8', 'replace')[-300:])
        else:
            got = json.loads(p.stdout.decode('utf-8'))
            if any(got.get(k) != v + 1 for k, v in want.items()):
                bad.append('빠르기를 쓴 노래 파일의 tempo가 쓴 값과 다르다')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    # 3) 견본 만들기 전체(가짜 말소리)
    tmp = tempfile.mkdtemp(prefix='voice-self-test-')
    SAMPLES = tmp
    # 노래마다 목소리 배정(승인 배정과 같은 모양): 「동짓달」만 둘째 후보, 나머지는 첫째 후보
    c1, c2 = list(cfg['candidates'])[:2]
    ids = ['dongjitdal', 'jemangmaega', 'nonbat-gara', 'jeongseokga']
    assign = {sid: (c2 if sid == 'dongjitdal' else c1) for sid in ids}
    plan = load_plan(ids)
    plan['only'] = ids
    rows, natural, _ = run_build(plan, assign, cfg, True, 4, prefix='v2-')
    with open(os.path.join(tmp, 'v2-approved', 'assets', 'audio', 'voice', 'manifest.json'), encoding='utf-8') as f:
        man = json.load(f)
    if len(man['clips']) != sum(len(s['clips']) for s in plan['songs']):
        bad.append('생성 기록의 조각 수가 계획과 다르다')
    gv = man['generator'].get('voices') or {}
    if sorted(gv) != sorted({c1, c2}) or any(not v.get('referenceSha256') for v in gv.values()):
        bad.append(f'생성 기록의 목소리 목록이 배정과 다르다: {sorted(gv)}')
    elif gv[c1]['referenceSha256'] == gv[c2]['referenceSha256']:
        bad.append('두 목소리의 기준 음성 해시가 같다')
    for e in man['clips']:
        if e.get('voice') != assign[e['songId']]:
            bad.append(f'{e["path"]}: 목소리 {e.get("voice")} ≠ 배정 {assign[e["songId"]]}')
        path = os.path.join(tmp, 'v2-approved', e['path'])
        if sha256_file(path) != e['sha256']:
            bad.append(e['path'] + ': sha256 불일치')
        if e['duration'] > e['slotSec']:
            bad.append(f'{e["path"]}: 칸 넘침 {e["duration"]} > {e["slotSec"]}')
        if e['stretch'] != 1 or e['ttsSpeed'] > 1:
            bad.append(f'{e["path"]}: 자연 빠르기가 아니다')
        if e['text'] not in e['lineText']:
            bad.append(f'{e["path"]}: 줄 글에 음보 글이 없다')
        one = sum(1 for o in man['clips'] if o['songId'] == e['songId'] and o['lineText'] == e['lineText'] and o['unit'] == e['unit'] and o['line'] == e['line']) == 1
        if e['cut'] != ('whole' if one else 'asr'):
            bad.append(f'{e["path"]}: 자른 방법 {e["cut"]}')
        if e['tempo'] != natural[e['songId']]:
            bad.append(f'{e["path"]}: 빠르기 {e["tempo"]} ≠ 자연 빠르기 {natural[e["songId"]]}')
        x = decode(open(path, 'rb').read())
        thr = np.abs(x).max() * 10 ** (-30 / 20)
        lead = np.flatnonzero(np.abs(x) > thr)[0] / SR
        if lead > LEAD_MAX:
            bad.append(f'{e["path"]}: 앞 무음 {lead * 1000:.0f}ms')
    for sid in ids:
        mine = [e for e in man['clips'] if e['songId'] == sid]
        longest = max(e['duration'] for e in mine)
        t = natural[sid]
        if not (longest <= 60 / t * FILL + 0.03 and longest > 60 / (t + 1) * FILL - 0.03):
            bad.append(f'{sid}: 자연 빠르기 {t}가 가장 긴 조각 {longest:.3f}s와 맞지 않는다')
    for sid in ids:
        lines = [e for e in man['clips'] if e['songId'] == sid]
        by_line = {}
        for e in lines:
            by_line.setdefault(e['lineText'], set()).add(e['lineGainDb'])
        if any(len(v) != 1 for v in by_line.values()):
            bad.append(f'{sid}: 한 줄 안의 조각 음량 이득이 다르다')
    for sid in ids:
        for suffix in (f'-tempo{natural[sid]}.mp3', f'-tempo{natural[sid]}-beat.mp3', '-natural.mp3'):
            if not os.path.exists(os.path.join(tmp, f'v2-{assign[sid]}-{sid}{suffix}')):
                bad.append('미리 듣기 없음: ' + f'v2-{assign[sid]}-{sid}{suffix}')
    if not os.path.exists(os.path.join(tmp, f'v2-{assign["jemangmaega"]}-jemangmaega-gu0.mp3')):
        bad.append('향가 첫 구 미리 듣기 없음')
    plan_d = load_plan(['dongjitdal'], tempos={'dongjitdal': natural['dongjitdal']})['songs'][0]
    pv = probe_sec(os.path.join(tmp, f'v2-{c2}-dongjitdal-tempo{natural["dongjitdal"]}.mp3'))
    want = 0.5 + plan_d['duration'] + 0.8
    if abs(pv - want) > 0.1:
        bad.append(f'미리 듣기 길이 {pv:.2f}s ≠ 박자 칸 {want:.2f}s')
    bad += check_previews([os.path.join(tmp, f'v2-{c2}-dongjitdal-natural.mp3')], {}, False)
    # 빠르기 재기: 고른 줄만 읽혀도 같은 자르기를 거치므로, 잰 빠르기는 전체로 잰 자연 빠르기보다 느리지 않다.
    tp = tempo_probe(plan, [('배정', assign)], cfg, 4, False)
    for sid in ids:
        if not isinstance(tp.get(sid), int) or tp[sid] < natural[sid]:
            bad.append(f'빠르기 재기 {sid}: {tp.get(sid)} (전체 자연 빠르기 {natural[sid]})')
    qa = qa_report(rows)
    if qa['energy'] or qa['low']:
        bad.append(f'가짜 말소리인데 받아쓰기 점검이 문제를 알렸다: {qa["energy"][:3]} {qa["low"][:3]}')
    shutil.rmtree(tmp, ignore_errors=True)
    bad += self_test_assignment(cfg)
    bad += self_test_per_foot(cfg)
    if bad:
        for b in bad[:30]:
            say('  ✗ ' + b)
        raise SystemExit(f'자체 시험 실패 {len(bad)}건')
    say('')
    say(f'자체 시험 통과: 자르기 경계 오차 받아쓰기 {worst["asr"] * 1000:.0f}ms·헛들은 받아쓰기 {worst["misheard"] * 1000:.0f}ms·'
        f'엉뚱한 시각을 버림 {worst["bogus"] * 1000:.0f}ms·'
        f'음절 비율 {worst["energy"] * 1000:.0f}ms, '
        f'빠르기 쓰기(노래 파일 사본), 조각 {len(man["clips"])}개 — 자연 빠르기 칸 안, 늘이거나 줄이지 않음, 앞 무음 {LEAD_MAX * 1000:.0f}ms 이하, '
        f'줄마다 같은 음량 이득, sha256, 미리 듣기(박자·딸깍·줄 그대로) 길이와 소리')


def self_test_assignment(cfg):
    """승인 배정 읽기와 기준 음성 고정(백업에서 되살리기·해시 맞추기·다시 설계 막기)을 네트워크 없이 시험한다."""
    global FAKE, CACHE, REF_BACKUP
    bad = []
    ids = ['gasiri', 'jemangmaega', 'dongjitdal']
    c1, c2 = list(cfg['candidates'])[:2]
    got = assignment({**cfg, 'approved': {'default': c1, 'bySong': {'gasiri': c2}}}, ids)
    if got != {'gasiri': c2, 'jemangmaega': c1, 'dongjitdal': c1}:
        bad.append(f'승인 배정 읽기: {got}')
    if assignment({**cfg, 'approved': c1}, ids) != {s: c1 for s in ids}:
        bad.append('예전 모양(후보 id 하나)의 승인을 모든 노래에 쓰지 않았다')
    if assignment({**cfg, 'approved': None}, ids) is not None:
        bad.append('승인 전인데 배정이 나왔다')
    for wrong, what in (({'default': c1, 'bySong': {'eopneun-norae': c2}}, '없는 노래 id'),
                        ({'default': 'narrator-zz', 'bySong': {}}, '없는 후보')):
        try:
            assignment({**cfg, 'approved': wrong}, ids)
            bad.append(f'승인 배정에 {what}가 있는데 멈추지 않았다')
        except SystemExit:
            pass
    saved = (FAKE, CACHE, REF_BACKUP)
    tmp = tempfile.mkdtemp(prefix='voice-self-test-ref-')
    try:
        FAKE = False
        CACHE, REF_BACKUP = os.path.join(tmp, 'cache'), os.path.join(tmp, 'backup')
        audio = fake_line(['가나다', '라마바'], 1.0, seed=3)[0]
        sha = hashlib.sha256(audio).hexdigest()
        cand = {**cfg['candidates'][c1], 'referenceSha256': sha, 'voiceDesignId': 'self-test-id'}
        try:
            design_voice(c1, cand, cfg)
            bad.append('승인한 기준 음성의 캐시도 백업도 없는데 다시 설계하려 했다')
        except SystemExit:
            pass
        os.makedirs(REF_BACKUP)
        with open(os.path.join(REF_BACKUP, f'{c1}-reference.wav'), 'wb') as f:
            f.write(audio)
        ref = design_voice(c1, cand, cfg)
        if ref['sha256'] != sha or ref['id'] != 'self-test-id' or not os.listdir(os.path.join(CACHE, 'ref')):
            bad.append('백업에서 기준 음성을 되살리지 못했다')
        if design_voice(c1, cand, cfg)['sha256'] != sha:
            bad.append('되살린 캐시를 다시 읽지 못했다')
        try:
            design_voice(c1, {**cand, 'referenceSha256': '0' * 64}, cfg)
            bad.append('기준 음성 해시가 승인한 값과 다른데 멈추지 않았다')
        except SystemExit:
            pass
    finally:
        FAKE, CACHE, REF_BACKUP = saved
        shutil.rmtree(tmp, ignore_errors=True)
    return bad


def self_test_per_foot(cfg):
    """--per-foot를 가짜 말소리로: 임시 사본(노래 하나의 조각·생성 기록·자산 목록 조각)에서 줄 하나를 바꾸고, 바뀐 조각·백업·
    생성 기록(cut per-foot, spokenText, sha256)·칸·앞 무음·다른 줄은 그대로인지, 다시 돌려도 백업이 맨 처음 것인지,
    요금 한도 미리 잡기(reserve)가 한도를 넘는 요청을 막는지 본다."""
    global MAX_USD, PRON
    bad = []
    tmp = tempfile.mkdtemp(prefix='voice-self-test-pf-')
    saved_max = MAX_USD
    saved_pron = PRON
    try:
        # 낭송용 발음 표기: 바꾸기, 음절 수가 다른 규칙은 막기, 실제 표 읽기
        if pronounce('님을 뫼셔 뫼히', [('뫼', '뭬')]) != '님을 뭬셔 뭬히':
            bad.append('낭송용 발음 표기를 글에 적용하지 못했다')
        write_json(os.path.join(tmp, 'pron-bad.json'), {'rules': [{'from': '뫼', 'to': '므웨'}]})
        try:
            load_pronounce(os.path.join(tmp, 'pron-bad.json'))
            bad.append('음절 수가 바뀌는 낭송용 발음 표기 규칙을 막지 않았다')
        except SystemExit:
            pass
        load_pronounce()
        PRON = [('가시', '가씨')]   # 아래 음보마다 읽기에서 읽힌 글(spokenText)이 표를 따르는지 본다
        sid = 'gasiri'
        plan = load_plan([sid])
        song = plan['songs'][0]
        line = next(l for l in song['lines'] if len(l['clips']) >= 3)
        root = os.path.join(tmp, 'root')
        vdir = os.path.join(root, 'assets', 'audio', 'voice')
        shutil.copytree(os.path.join(ROOT, 'assets', 'audio', 'voice', sid), os.path.join(vdir, sid))
        shutil.copy2(os.path.join(ROOT, 'assets', 'audio', 'voice', 'manifest.json'), os.path.join(vdir, 'manifest.json'))
        part = os.path.join(root, 'assets', 'manifest.parts', 'voice.json')
        os.makedirs(os.path.dirname(part))
        shutil.copy2(PART, part)
        first = line['clips'][0]
        spec = os.path.join(tmp, 'lines.json')
        write_json(spec, {'lines': [[sid, line['key']]], 'context': {first: ','}})
        before = {c['path']: sha256_file(os.path.join(root, c['path'])) for c in song['clips']}
        assign = assignment(cfg, plan['allSongIds'])
        backup = os.path.join(tmp, 'backup')
        res = run_per_foot(plan, assign, cfg, spec, 2, backup, out_root=root, part_path=part)
        with open(os.path.join(vdir, 'manifest.json'), encoding='utf-8') as f:
            ent = {c['path']: c for c in json.load(f)['clips']}
        if sorted(res['written']) != sorted(line['clips']):
            bad.append(f'음보마다 읽기: 바꾼 조각 {res["written"]} ≠ 줄의 조각 {line["clips"]}')
        cm = clip_map(song)
        for p in line['clips']:
            e = ent.get(p, {})
            fp = os.path.join(root, p)
            if e.get('cut') != 'per-foot' or e.get('text') != cm[p]['text'] or cm[p]['text'] not in (e.get('lineText') or ''):
                bad.append(f'음보마다 읽기 {p}: 생성 기록(cut {e.get("cut")}, 글 {e.get("text")}, 줄 글 {e.get("lineText")})')
            if e.get('spokenText') != pronounce(cm[p]['text']) + (',' if p == first else ''):
                bad.append(f'음보마다 읽기 {p}: 읽힌 글(spokenText) {e.get("spokenText")}')
            if e.get('sha256') != sha256_file(fp) or sha256_file(fp) == before[p]:
                bad.append(f'음보마다 읽기 {p}: 파일이 바뀌지 않았거나 sha256이 기록과 다르다')
            bk = os.path.join(backup, p)
            if not os.path.exists(bk) or sha256_file(bk) != before[p]:
                bad.append(f'음보마다 읽기 {p}: 백업이 없거나 바꾸기 전 파일이 아니다')
            if e.get('duration', 99) > song['slotSec']:
                bad.append(f'음보마다 읽기 {p}: 칸 넘침 {e.get("duration")}')
            x = decode(open(fp, 'rb').read())
            lead = np.flatnonzero(np.abs(x) > np.abs(x).max() * 10 ** (-30 / 20))[0] / SR
            if lead > LEAD_MAX:
                bad.append(f'음보마다 읽기 {p}: 앞 무음 {lead * 1000:.0f}ms')
        for c in song['clips']:
            if c['path'] not in line['clips'] and sha256_file(os.path.join(root, c['path'])) != before[c['path']]:
                bad.append(f'음보마다 읽기: 목록 밖 조각이 바뀌었다 {c["path"]}')
        with open(part, encoding='utf-8') as f:
            listed = [x['path'] for x in json.load(f)['assets']]
        if any(listed.count(p) != 1 for p in line['clips']):
            bad.append('음보마다 읽기: 자산 목록 조각에 바꾼 조각이 한 번씩 있지 않다')
        if not os.path.exists(os.path.join(backup, 'assets', 'audio', 'voice', 'manifest.json')):
            bad.append('음보마다 읽기: 생성 기록 백업이 없다')
        run_per_foot(plan, assign, cfg, spec, 2, backup, out_root=root, part_path=part)
        if any(sha256_file(os.path.join(backup, p)) != before[p] for p in line['clips']):
            bad.append('음보마다 읽기: 다시 돌렸더니 백업이 맨 처음 파일이 아니게 됐다')
        # 요금 한도 미리 잡기
        MAX_USD = 0.001
        reserve(0.0006)
        try:
            reserve(0.0006)
            bad.append('한도를 넘는 동시 요청을 미리 막지 않았다')
        except SystemExit:
            pass
        release(0.0006)
        reserve(0.0006)
        release(0.0006)
    except SystemExit as e:
        bad.append(f'음보마다 읽기 자체 시험이 멈췄다: {e}')
    finally:
        MAX_USD = saved_max
        PRON = saved_pron
        RESERVED[0] = 0.0
        shutil.rmtree(tmp, ignore_errors=True)
    return bad


def main():
    global FFMPEG, FFPROBE, SAMPLES, MAX_USD, PRON
    ap = argparse.ArgumentParser(description='낭송 조각 만들기(Fish Audio, 줄 단위로 읽히고 음보마다 자름)')
    ap.add_argument('--only', default='', help='노래 id(쉼표로 여럿)')
    ap.add_argument('--voice', default=None, help='voices.json의 후보 id(없으면 승인 배정). 견본·빠르기 재기에만 쓴다. --tempo-probe는 쉼표로 여럿')
    ap.add_argument('--dry-run', action='store_true', help='줄 수·조각 수·글자 수·예상 요금만(API를 부르지 않음)')
    ap.add_argument('--sample', action='store_true', help='후보 견본: --out에 쓰고 미리 듣기를 이어 붙임(노래 데이터는 그대로)')
    ap.add_argument('--out', default=None, help='견본을 쓸 폴더(기본 assets/raw/voice-samples)')
    ap.add_argument('--prefix', default='', help='견본 파일 이름 앞머리(예: v2-)')
    ap.add_argument('--tempo', type=float, default=None, help='견본 미리 듣기용 빠르기(박/분). 없으면 노래마다 자연 빠르기')
    ap.add_argument('--tempo-probe', action='store_true', help='노래마다 가장 긴 음보가 있을 줄만 읽혀 자연 빠르기를 잰다')
    ap.add_argument('--write-tempo', action='store_true', help='잰 자연 빠르기를 노래 데이터(js/data/songs/*.js)의 tempo에 쓴다')
    ap.add_argument('--asr', action='store_true', help='견본 미리 듣기를 받아쓰기로 들어 보고 글과 비교(실제 조각은 줄 받아쓰기 점검을 늘 알린다)')
    ap.add_argument('--max-usd', type=float, default=MAX_USD, help=f'이번 실행에서 쓸 돈의 한도(USD, 기본 {MAX_USD:g}). 넘을 요청은 보내지 않고 멈춘다')
    ap.add_argument('--jobs', type=int, default=4, help='동시에 보낼 요청 수(기본 4)')
    ap.add_argument('--self-test', action='store_true', help='API 없이 가짜 말소리로 나머지 과정을 시험(임시 폴더)')
    ap.add_argument('--per-foot', action='store_true', help='--lines의 줄만 음보마다 따로 읽혀 그 줄의 조각을 바꾼다(cut: per-foot)')
    ap.add_argument('--lines', default=None, help='--per-foot 줄 목록 JSON: {"lines": [[노래 id, 줄 key], …], "context": {조각 경로: 덧붙일 글}}')
    ap.add_argument('--credit-wait', type=int, default=0, help='--per-foot: 끝에 충전액 차이(실제 차감)가 반영될 때까지 기다릴 초(10초마다 읽음)')
    ap.add_argument('--backup', default=None, help='--per-foot: 바꾸기 전 조각·생성 기록을 같은 경로로 남길 폴더(git 밖, 예: design/voice-audit/backup-<시각>)')
    a = ap.parse_args()

    with open(CONFIG, encoding='utf-8') as f:
        cfg = json.load(f)
    PRON = load_pronounce()
    if cfg['model'].endswith('-free'):
        raise SystemExit('무료 모델은 상업 이용이 안 됩니다. voices.json의 model을 유료 모델로 두세요.')
    if a.self_test:
        FFMPEG, FFPROBE = tool('ffmpeg'), tool('ffprobe')
        self_test(cfg)
        return
    if a.per_foot:
        if not a.lines:
            raise SystemExit('--per-foot에는 --lines <줄 목록 JSON>이 필요합니다.')
        if a.voice or a.sample or a.write_tempo or a.tempo_probe or a.only:
            raise SystemExit('--per-foot는 승인 배정대로 --lines의 줄만 만듭니다(--voice·--sample·--write-tempo·--tempo-probe·--only와 함께 쓰지 않음).')
        MAX_USD = a.max_usd
        lines, context = per_foot_spec(a.lines)
        song_ids = sorted({sid for sid, _ in lines})
        plan = load_plan(song_ids)
        approved = assignment(cfg, plan['allSongIds'])
        if not approved:
            raise SystemExit('승인된 목소리가 없습니다(voices.json approved).')
        items = per_foot_items(plan, lines, context, approved, cfg)
        if a.dry_run:
            per_foot_dry_run(items, len(lines), cfg)
            return
        if not a.backup:
            raise SystemExit('--per-foot에는 --backup <폴더>가 필요합니다(바꾸기 전 조각을 남겨 되돌릴 수 있게).')
        FFMPEG, FFPROBE = tool('ffmpeg'), tool('ffprobe')
        run_per_foot(plan, approved, cfg, a.lines, a.jobs, os.path.abspath(a.backup), credit_wait=a.credit_wait)
        say(f'\n이번에 쓴 돈(추정): ${spend_usd():.4f} (TTS {SPEND["ttsBytes"]} 바이트, 설계 {SPEND["design"]}번, 받아쓰기 {SPEND["asrSec"]:.0f}초)')
        return
    only = [s for s in a.only.split(',') if s.strip()]
    if a.tempo and not a.sample:
        raise SystemExit('--tempo는 --sample과 함께만 씁니다(실제 빠르기는 노래 데이터의 tempo로 정한다).')
    if a.out:
        if not a.sample:
            raise SystemExit('--out은 --sample과 함께만 씁니다.')
        SAMPLES = os.path.abspath(a.out)
    plan = load_plan(only)
    plan['only'] = only

    MAX_USD = a.max_usd
    picked = [v.strip() for v in (a.voice or '').split(',') if v.strip()]
    for v in picked:
        if v not in cfg['candidates']:
            raise SystemExit('모르는 목소리 후보: ' + v + ' (있는 것: ' + ', '.join(cfg['candidates']) + ')')
    approved = assignment(cfg, plan['allSongIds'])
    if a.tempo_probe:
        if picked:
            columns = [(cid, {s['id']: cid for s in plan['songs']}) for cid in picked]
        elif approved:
            columns = [('승인 배정', approved)]
        else:
            raise SystemExit('--tempo-probe에는 --voice <후보,후보>가 필요합니다(승인된 목소리가 없음).')
        FFMPEG, FFPROBE = tool('ffmpeg'), tool('ffprobe')
        tempo_probe(plan, columns, cfg, a.jobs, a.write_tempo)
        say(f'\n이번에 쓴 돈(추정): ${spend_usd():.4f} (TTS {SPEND["ttsBytes"]} 바이트, 설계 {SPEND["design"]}번, 받아쓰기 {SPEND["asrSec"]:.0f}초)')
        return
    if picked:
        if not a.dry_run and not a.sample:
            raise SystemExit('실제 조각은 승인 배정(voices.json approved)대로만 만듭니다. --voice는 견본(--sample)·빠르기 재기에만 씁니다.')
        assign = {s['id']: picked[0] for s in plan['songs']}
    elif approved:
        assign = approved
    elif a.dry_run:
        assign = {s['id']: list(cfg['candidates'])[-1] for s in plan['songs']}
    else:
        raise SystemExit('승인된 목소리가 없습니다. 견본은 --voice <후보> --sample로 만들고, 실제 조각은 voices.json의 approved를 채운 뒤 만드세요.')
    if a.sample and a.write_tempo:
        raise SystemExit('--write-tempo는 견본(--sample)과 함께 쓰지 않습니다(--tempo-probe나 실제 조각에서 씁니다).')

    if a.dry_run:
        dry_run(plan, cfg, [('승인 배정' if approved and not picked else picked[0] if picked else '마지막 후보', assign)])
        return
    FFMPEG, FFPROBE = tool('ffmpeg'), tool('ffprobe')
    rows, natural, results = run_build(plan, assign, cfg, a.sample, a.jobs, a.write_tempo, a.tempo, a.prefix)
    if not a.sample:
        qa_report(rows)
    if a.sample:
        say('\n미리 듣기 확인(무음 아님' + (', 받아쓰기' if a.asr else '') + ')')
        texts = {}
        paths = []
        for s in plan['songs']:
            t = a.tempo or natural[s['id']]
            reading = ' '.join(l['text'] for l in s['lines'])
            for suffix in (f'-tempo{t:g}.mp3', f'-tempo{t:g}-beat.mp3', '-natural.mp3'):
                pth = os.path.join(SAMPLES, f'{a.prefix}{assign[s["id"]]}-{s["id"]}{suffix}')
                paths.append(pth)
                if not suffix.endswith('-beat.mp3'):
                    texts[pth] = reading
        bad = check_previews(paths, texts, a.asr)
        if bad:
            for b in bad:
                say('  ✗ ' + b)
            raise SystemExit('미리 듣기 확인 실패')
    say(f'\n이번에 쓴 돈(추정): ${spend_usd():.4f} (TTS {SPEND["ttsBytes"]} 바이트, 설계 {SPEND["design"]}번, 받아쓰기 {SPEND["asrSec"]:.0f}초)')


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:  # noqa: BLE001 — 키가 섞이지 않게 지운 뒤에만 보인다
        sys.stderr.write(redact(traceback.format_exc()))
        sys.exit(1)
