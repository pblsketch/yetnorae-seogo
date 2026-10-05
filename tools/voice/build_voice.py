# -*- coding: utf-8 -*-
"""낭송 조각(음보마다, 향가는 구마다)을 Fish Audio 유료 API로 만든다(spec 15, plan T27·T28).

    python tools/voice/build_voice.py --dry-run                       # 모든 노래: 조각 수·글자 수·예상 요금(API 부르지 않음)
    python tools/voice/build_voice.py --sample --voice narrator-a --only dongjitdal,jemangmaega
                                                                      # 후보 목소리 견본 + 박자 칸에 맞춰 이어 붙인 미리 듣기
    python tools/voice/build_voice.py [--voice <후보>] [--only id,id]   # 실제 조각(assets/audio/voice/…)과 생성 기록

키: 환경 변수 YETNORAE_FISH_API_KEY로만 받는다. 키를 화면·기록·파일 어디에도 쓰지 않고, 오류 글에서도 지운다.
    예) YETNORAE_FISH_API_KEY="$(cat "$LOCALAPPDATA/yetnorae/fish.key")" python tools/voice/build_voice.py …

흐름
1. node tools/voice/plan.mjs가 노래 데이터에서 조각 목록(글 = 그 음보의 reading)과 박자 칸(빠르기, 칸 길이)을 낸다.
2. 목소리: voices.json의 후보 설명으로 목소리 설계(voice-design-1)를 한 번 하고, 그 음성을 기준 음성으로 삼는다.
3. 조각마다 TTS(유료 모델, voices.json의 model). 받은 원본은 tools/voice_cache/(git 제외)에 글·목소리·설정의 해시로 둔다.
   같은 해시가 있으면 다시 부르지 않는다(이미 만든 조각은 다시 만들지 않는다).
4. 앞뒤 무음을 바짝 자르고, 칸(60/빠르기 초)의 FILL 비율 안에 들어가게 한다.
   길면 먼저 말 빠르기(prosody.speed)를 올려 다시 읽히고, 그래도 조금 길면 atempo로 줄인다.
5. 음량을 TARGET_LUFS에 맞추고(봉우리 한도), 모노 MP3로 쓴다.
6. 생성 기록: assets/audio/voice/manifest.json(조각마다 글·길이·칸·sha256), 자산 목록 조각 assets/manifest.parts/voice.json.
   --sample이면 assets/raw/voice-samples/<후보>/ 아래에 쓰고(git 제외) 자산 목록은 건드리지 않는다.
"""
import argparse
import base64
import concurrent.futures as cf
import difflib
import hashlib
import json
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

import numpy as np

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(ROOT, 'tools', 'voice_cache')
SAMPLES = os.path.join(ROOT, 'assets', 'raw', 'voice-samples')
PART = os.path.join(ROOT, 'assets', 'manifest.parts', 'voice.json')
CONFIG = os.path.join(HERE, 'voices.json')
API = 'https://api.fish.audio'
ENV_KEY = 'YETNORAE_FISH_API_KEY'

# ── 조정할 수 있는 값 ──
SR = 44100
BITRATE = '64k'
TARGET_LUFS = -18.0          # 조각 음량(배경음 −20 LUFS보다 조금 크게)
PEAK_MAX_DB = -1.5           # 표본 봉우리 한도
FILL = 0.92                  # 조각 길이 ≤ 칸 × FILL (다음 박 앞에 숨 쉴 틈)
RESPEAK_OVER = 1.10          # 자른 길이가 목표의 이 배를 넘으면 말 빠르기를 올려 다시 읽힌다
MAX_TTS_SPEED = 1.6          # 다시 읽힐 때 말 빠르기 상한
STRETCH_WARN = 1.15          # 마지막 atempo 배율이 이보다 크면 알린다(노래 tempo를 낮추라는 신호)
SPEED_WARN = 1.3             # 말 빠르기를 이보다 올려야 했으면 알린다
LEAD_PAD = 0.010             # 소리 시작 앞에 남길 틈(초) — 박에 바로 소리가 나도록 짧게
TAIL_PAD = 0.050             # 소리 끝 뒤에 남길 틈(초)
FADE_IN = 0.004
FADE_OUT = 0.025
GATE_BELOW_PEAK_DB = 38      # 10ms 구간 RMS가 가장 큰 구간보다 이만큼 작으면 무음으로 본다
GATE_FLOOR_DB = -55
PRICE_PER_MBYTE = 15.0       # USD / 100만 UTF-8 바이트(s2.1-pro·s2-pro·s1, 2026-10 문서)
DESIGN_PRICE = 0.01          # USD / 목소리 설계 요청 한 번
ASR_PRICE_PER_HOUR = 0.36    # USD / 음성 1시간(받아쓰기 점검)
ASR_MODEL = 'transcribe-1-pro'
SEC_PER_SYLLABLE = 0.22      # 미리 계산용: 차분한 낭송의 한 음절 길이(견본으로 잰 값으로 고친다)
SEC_PER_CLIP = 0.12          # 미리 계산용: 조각마다 더해지는 길이

LICENSE = ('Fish Audio 이용약관(2024-08-18 시행) "Your Use of Services" 조항: 유료 서비스(Paid Services) 이용자는 '
           '서비스를 상업적 용도로 쓸 수 있다. 유료 API(종량 과금) 모델로 만든 AI 합성 음성이며, '
           '실제 사람의 목소리를 본뜨지 않고 글 설명만으로 설계한 목소리다. 출처 화면에 AI 합성 음성임을 밝힌다.')

KEY = os.environ.get(ENV_KEY, '').strip()
FAKE = False                 # --self-test: API 대신 합성한 가짜 말소리로 나머지 과정을 모두 시험한다


def redact(text):
    s = str(text)
    if KEY:
        s = s.replace(KEY, '[지움]')
    return re.sub(r'(?i)(bearer\s+)[A-Za-z0-9._\-]+', r'\1[지움]', s)


def say(*parts):
    print(redact(' '.join(str(p) for p in parts)), flush=True)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()


def sha256_file(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def write_json(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


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


def atempo(x, factor):
    """음높이를 지키고 빠르기만 factor배로(1보다 크면 짧아진다)."""
    chain = []
    f = factor
    while f > 2.0:
        chain.append('atempo=2.0')
        f /= 2.0
    chain.append(f'atempo={f:.5f}')
    out = ff(['-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-af', ','.join(chain),
              '-f', 'f32le', '-'], data=x.astype(np.float32).tobytes())
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


# ── 소리 다듬기 ──

def trim(x):
    """앞뒤 무음을 바짝 자른다. 10ms 구간 RMS로 소리가 있는 첫·끝 구간을 찾는다."""
    hop = int(0.010 * SR)
    n = len(x) // hop
    if n == 0:
        return x, 0.0, 0.0
    frames = x[:n * hop].reshape(n, hop)
    db = 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=1)) + 1e-12)
    gate = max(db.max() - GATE_BELOW_PEAK_DB, GATE_FLOOR_DB)
    on = np.flatnonzero(db > gate)
    if not len(on):
        return x, 0.0, 0.0
    # 소리 시작: 첫 구간 안에서 표본 단위로 다시 찾는다(박에 정확히 닿게).
    first = on[0] * hop
    seg = np.abs(x[max(0, first - hop):first + hop])
    thr = 10 ** (gate / 20)
    hit = np.flatnonzero(seg > thr)
    start_sample = max(0, first - hop) + (int(hit[0]) if len(hit) else hop)
    s = max(0, start_sample - int(LEAD_PAD * SR))
    e = min(len(x), (on[-1] + 1) * hop + int(TAIL_PAD * SR))
    y = x[s:e].copy()
    fi, fo = int(FADE_IN * SR), int(FADE_OUT * SR)
    if len(y) > fi + fo:
        y[:fi] *= np.linspace(0, 1, fi)
        y[-fo:] *= np.linspace(1, 0, fo)
    return y, s / SR, (len(x) - e) / SR


def level(x):
    """음량을 TARGET_LUFS로, 봉우리는 PEAK_MAX_DB 아래로."""
    measured = lufs(x)
    peak = np.abs(x).max() + 1e-12
    gain_db = (TARGET_LUFS - measured) if measured is not None else 0.0
    gain_db = min(gain_db, PEAK_MAX_DB - 20 * np.log10(peak))
    return x * 10 ** (gain_db / 20), measured, gain_db


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
        raise SystemExit(f'환경 변수 {ENV_KEY}가 없습니다. 키는 환경 변수로만 받습니다(--dry-run은 키 없이 됩니다).')
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
    """목소리 설계 한 번(캐시). 돌려주는 값: { audio(bytes), text, sha256, id, durationMs, cacheKey }"""
    if FAKE:
        audio = fake_speech(12, 1.0)
        return {'audio': audio, 'text': cand['referenceText'], 'sha256': hashlib.sha256(audio).hexdigest(),
                'id': 'self-test', 'durationMs': None, 'cacheKey': 'self-test'}
    spec = {'instruction': cand['instruction'], 'reference_text': cand['referenceText'], 'language': 'ko',
            'n': 1, 'seed': cand['seed'], 'speed': cand.get('speed', 1)}
    key = digest({'model': cfg['designModel'], **spec})[:16]
    path = os.path.join(CACHE, 'ref', f'{cid}-{key}.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            got = json.load(f)
    else:
        say(f'목소리 설계: {cid} (voice-design-1, seed {cand["seed"]})')
        result = json.loads(request('/v1/voice-design', spec, cfg['designModel']))
        got = result['candidates'][0]
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(got, f, ensure_ascii=False)
    audio = base64.b64decode(got['audio_base64'])
    return {'audio': audio, 'text': got.get('text') or cand['referenceText'], 'sha256': hashlib.sha256(audio).hexdigest(),
            'id': got.get('id'), 'durationMs': got.get('duration_ms'), 'cacheKey': key}


def tts(text, ref, cid, cand, cfg, speed):
    """조각 하나의 원본 소리(캐시)."""
    params = dict(cfg['tts'])
    full = (cand.get('direction', '') + ' ' + text).strip()
    stamp = digest({'model': cfg['model'], 'text': full, 'ref': ref['sha256'], 'params': params, 'speed': speed})
    if FAKE:
        return fake_speech(len(hangul_only(text)) or 1, speed), stamp, False
    path = os.path.join(CACHE, 'raw', stamp[:2], stamp + '.' + params.get('format', 'wav'))
    if os.path.exists(path):
        with open(path, 'rb') as f:
            return f.read(), stamp, True
    payload = {'text': full, 'references': [{'audio': ref['audio'], 'text': ref['text']}],
               'prosody': {'speed': speed, 'volume': 0}, 'normalize': True, **params}
    audio = request('/v1/tts', payload, cfg['model'], kind='msgpack')
    if len(audio) < 1000:
        raise ApiError(f'소리가 너무 짧게 왔다({len(audio)}바이트): {text}')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(audio)
    return audio, stamp, False


def asr(mp3_path):
    sha = sha256_file(mp3_path)
    path = os.path.join(CACHE, 'asr', sha + '.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)['text']
    with open(mp3_path, 'rb') as f:
        audio = f.read()
    got = json.loads(request('/v1/asr', {'audio': audio, 'language': 'ko', 'ignore_timestamps': True}, ASR_MODEL, kind='msgpack'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'text': got.get('text', '')}, f, ensure_ascii=False)
    return got.get('text', '')


def hangul_only(s):
    return re.sub(r'[^가-힣]', '', s or '')


def similarity(a, b):
    a, b = hangul_only(a), hangul_only(b)
    if not a and not b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


# ── 자체 시험(--self-test) ──

def fake_speech(syllables, speed):
    """API 없이 쓰는 가짜 말소리(WAV 바이트): 앞 0.3초·뒤 0.45초 무음 사이에 음절마다 소리 덩어리 하나."""
    import io
    import wave
    rng = np.random.default_rng(syllables)
    per = 0.22 / speed
    n = int((0.12 / speed + syllables * per) * SR)
    t = np.arange(n) / SR
    env = 0.55 + 0.45 * np.sin(np.pi * ((t / per) % 1.0)) ** 2
    voice = sum(np.sin(2 * np.pi * f * t) / k for k, f in enumerate((180, 360, 540, 900), 1)) * env * 0.25
    x = np.concatenate([rng.normal(0, 1e-4, int(0.3 * SR)), voice, rng.normal(0, 1e-4, int(0.45 * SR))])
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    return buf.getvalue()


def self_test(cfg):
    """네트워크 없이 자르기·칸 맞추기·음량·MP3·생성 기록·미리 듣기를 확인한다. 실패하면 0이 아닌 값으로 끝낸다."""
    global FAKE, SAMPLES
    FAKE = True
    tmp = tempfile.mkdtemp(prefix='voice-self-test-')
    SAMPLES = tmp
    cid = next(iter(cfg['candidates']))
    plan = load_plan(['dongjitdal', 'jemangmaega', 'nonbat-gara'])
    plan['only'] = ['dongjitdal', 'jemangmaega', 'nonbat-gara']
    rows = run_build(plan, cid, cfg, True, 4, False)
    bad = []
    with open(os.path.join(tmp, cid, 'assets', 'audio', 'voice', 'manifest.json'), encoding='utf-8') as f:
        man = json.load(f)
    if len(man['clips']) != sum(len(s['clips']) for s in plan['songs']):
        bad.append('생성 기록의 조각 수가 계획과 다르다')
    for e in man['clips']:
        path = os.path.join(tmp, cid, e['path'])
        if sha256_file(path) != e['sha256']:
            bad.append(e['path'] + ': sha256 불일치')
        if e['duration'] > e['slotSec']:
            bad.append(f'{e["path"]}: 칸 넘침 {e["duration"]} > {e["slotSec"]}')
        x = decode(open(path, 'rb').read())
        thr = np.abs(x).max() * 10 ** (-30 / 20)
        lead = np.flatnonzero(np.abs(x) > thr)[0] / SR
        if lead > 0.03:
            bad.append(f'{e["path"]}: 앞 무음 {lead * 1000:.0f}ms')
        loud = lufs(x)
        if loud is None or abs(loud - TARGET_LUFS) > 1.5:
            bad.append(f'{e["path"]}: 음량 {loud} LUFS')
    for name in [f'{cid}-dongjitdal-tempo50.mp3', f'{cid}-dongjitdal-tempo50-beat.mp3', f'{cid}-jemangmaega-gu0.mp3']:
        if not os.path.exists(os.path.join(tmp, name)):
            bad.append('미리 듣기 없음: ' + name)
    pv = probe_sec(os.path.join(tmp, f'{cid}-dongjitdal-tempo50.mp3'))
    want = 0.5 + plan['songs'][0]['duration'] + 0.8 if plan['songs'][0]['id'] == 'dongjitdal' else None
    if want and abs(pv - want) > 0.1:
        bad.append(f'미리 듣기 길이 {pv:.2f}s ≠ 박자 칸 {want:.2f}s')
    if not any(r['ttsSpeed'] > 1 for r in rows):
        bad.append('긴 조각을 다시 빠르게 읽히는 길을 지나지 않았다')
    shutil.rmtree(tmp, ignore_errors=True)
    if bad:
        for b in bad[:30]:
            say('  ✗ ' + b)
        raise SystemExit(f'자체 시험 실패 {len(bad)}건')
    say('')
    say(f'자체 시험 통과: 조각 {len(man["clips"])}개 — 칸 안, 앞 무음 30ms 이하, 음량 {TARGET_LUFS}±1.5 LUFS, sha256, 미리 듣기 길이')


# ── 계획 ──

def load_plan(only, tempo=None):
    args = ['node', os.path.join(HERE, 'plan.mjs')]
    if only:
        args += ['--only', ','.join(only)]
    if tempo:
        args += ['--tempo', str(tempo)]
    p = subprocess.run(args, cwd=ROOT, capture_output=True)
    if p.returncode:
        raise SystemExit('계획을 만들지 못함: ' + p.stderr.decode('utf-8', 'replace')[-800:])
    return json.loads(p.stdout.decode('utf-8'))


def dry_run(plan, cfg, voices, use_asr):
    by_genre = {}
    totals = {'songs': 0, 'clips': 0, 'chars': 0, 'syllables': 0, 'bytes': 0, 'billed': 0, 'cached': 0}
    risky = []
    for song in plan['songs']:
        g = by_genre.setdefault(song['genre'], {'songs': 0, 'clips': 0, 'chars': 0, 'bytes': 0})
        g['songs'] += 1
        totals['songs'] += 1
        worst = 0
        for c in song['clips']:
            text = c['text']
            g['clips'] += 1
            g['chars'] += len(text)
            g['bytes'] += len(text.encode('utf-8'))
            totals['clips'] += 1
            totals['chars'] += len(text)
            totals['syllables'] += c['syllables']
            totals['bytes'] += len(text.encode('utf-8'))
            for cid in voices:
                direction = cfg['candidates'][cid].get('direction', '')
                totals['billed'] += len((direction + ' ' + text).strip().encode('utf-8'))
            est = SEC_PER_CLIP + c['syllables'] * SEC_PER_SYLLABLE
            worst = max(worst, est / (song['slotSec'] * FILL))
        if worst > STRETCH_WARN:
            need = max(SEC_PER_CLIP + c['syllables'] * SEC_PER_SYLLABLE for c in song['clips']) / FILL / STRETCH_WARN
            risky.append((song['id'], song['genre'], song['tempo'], worst, int(60 / need)))
    say(f'목소리 {", ".join(voices)} · 모델 {cfg["model"]}(유료) · 노래 {totals["songs"]}편')
    say('\n갈래      노래  조각   글자(공백 포함)  UTF-8 바이트')
    for gid, g in by_genre.items():
        say(f'{gid:<8}{g["songs"]:>5}{g["clips"]:>6}{g["chars"]:>14}{g["bytes"]:>14}')
    say(f'{"합계":<7}{totals["songs"]:>5}{totals["clips"]:>6}{totals["chars"]:>14}{totals["bytes"]:>14}  (음절 {totals["syllables"]})')
    tts_cost = totals['billed'] / 1e6 * PRICE_PER_MBYTE
    retry_cost = tts_cost  # 최악: 모든 조각을 한 번 더 읽힘(말 빠르기 올림)
    design_cost = DESIGN_PRICE * len(voices)
    est_sec = totals['clips'] * SEC_PER_CLIP + totals['syllables'] * SEC_PER_SYLLABLE
    asr_cost = est_sec / 3600 * ASR_PRICE_PER_HOUR * len(voices) if use_asr else 0
    say(f'\n요금 추정(USD, 목소리 {len(voices)}개): 지시 꼬리표 포함 {totals["billed"]} 바이트 × ${PRICE_PER_MBYTE}/100만 바이트 = ${tts_cost:.4f}')
    say(f'  + 다시 읽힘 최악 ${retry_cost:.4f} + 목소리 설계 ${design_cost:.2f}' + (f' + 받아쓰기 점검 ${asr_cost:.4f}' if use_asr else ''))
    say(f'  = 최대 약 ${tts_cost + retry_cost + design_cost + asr_cost:.2f} (캐시에 있는 조각은 다시 부르지 않으므로 0)')
    say(f'  예상 낭송 길이 약 {est_sec / 60:.1f}분(목소리 하나)')
    if risky:
        say(f'\n칸 위험(음절 수 추정, 한 음절 {SEC_PER_SYLLABLE}s): 칸 안에 넣으려면 {STRETCH_WARN}배 넘게 줄여야 할 노래')
        for sid, gid, tempo, worst, rec in risky:
            say(f'  {sid:<24}{gid:<8} 빠르기 {tempo} → 가장 긴 조각 {worst:.2f}배 · 권장 빠르기 ≤ {rec}')


# ── 조각 만들기 ──

def build_clip(clip, song, ref, cid, cand, cfg):
    target = song['slotSec'] * FILL
    base = cand.get('speed', 1)
    audio, stamp, cached = tts(clip['text'], ref, cid, cand, cfg, base)
    x, lead, tail = trim(decode(audio))
    natural = len(x) / SR
    speed = base
    calls = 0 if cached else 1
    if natural > target * RESPEAK_OVER:
        speed = round(min(MAX_TTS_SPEED, base * natural / target * 1.02), 2)
        audio2, stamp, cached2 = tts(clip['text'], ref, cid, cand, cfg, speed)
        calls += 0 if cached2 else 1
        x, lead, tail = trim(decode(audio2))
    spoken = len(x) / SR
    stretch = 1.0
    if spoken > target:
        stretch = spoken / target
        x = atempo(x, stretch)
        if len(x) / SR > target:
            x = x[:int(target * SR)]
            x[-int(FADE_OUT * SR):] *= np.linspace(1, 0, int(FADE_OUT * SR))
    x, measured, gain = level(x)
    return {'x': x, 'stamp': stamp, 'natural': natural, 'speed': speed, 'stretch': stretch, 'calls': calls,
            'lufsBefore': measured, 'gainDb': gain}


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


def run_build(plan, cid, cfg, sample, jobs, use_asr):
    cand = cfg['candidates'][cid]
    account = {'packageType': '자체 시험', 'toppedUp': False} if FAKE else account_check()
    ref = design_voice(cid, cand, cfg)
    say(f'기준 음성 준비: {cid} · 설계 id {ref["id"]} · {ref["durationMs"]}ms · sha256 {ref["sha256"][:12]}…')
    out_root = os.path.join(SAMPLES, cid) if sample else ROOT
    if sample:
        os.makedirs(SAMPLES, exist_ok=True)
        with open(os.path.join(SAMPLES, f'{cid}-reference.wav'), 'wb') as f:
            f.write(ref['audio'])
    manifest_path = os.path.join(out_root, 'assets', 'audio', 'voice', 'manifest.json')
    old = {}
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding='utf-8') as f:
            old = {c['path']: c for c in json.load(f).get('clips', [])}

    work = [(song, clip) for song in plan['songs'] for clip in song['clips']]
    results = {}
    errors = []
    with cf.ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = {pool.submit(build_clip, clip, song, ref, cid, cand, cfg): (song, clip) for song, clip in work}
        for i, fut in enumerate(cf.as_completed(futures), 1):
            song, clip = futures[fut]
            try:
                results[clip['path']] = fut.result()
            except Exception as e:  # noqa: BLE001 — 한 조각의 실패를 모아 끝에 알린다
                errors.append(f'{clip["path"]}: {redact(e)}')
            if i % 20 == 0 or i == len(work):
                say(f'  … {i}/{len(work)}')
    if errors:
        for e in errors[:20]:
            say('  ✗ ' + e)
        raise SystemExit(f'조각 {len(errors)}개를 만들지 못함(만든 것은 캐시에 남아 다시 돌리면 이어서 만든다).')

    entries = dict(old)
    rows = []
    calls = 0
    for song in plan['songs']:
        song_dir = os.path.join(out_root, 'assets', 'audio', 'voice', song['id'])
        wanted = set()
        clips_x = {}
        for clip in song['clips']:
            r = results[clip['path']]
            calls += r['calls']
            path = os.path.join(out_root, clip['path'])
            encode_mp3(r['x'], path)
            wanted.add(os.path.basename(path))
            clips_x[clip['path']] = r['x']
            dur = probe_sec(path)
            entry = {
                'path': clip['path'], 'songId': song['id'], 'unit': clip['unit'], 'line': clip['line'], 'foot': clip['foot'],
                'text': clip['text'], 'duration': round(dur, 4), 'slotSec': round(song['slotSec'], 4), 'tempo': song['tempo'],
                'naturalSec': round(r['natural'], 3), 'ttsSpeed': r['speed'], 'stretch': round(r['stretch'], 3),
                'sha256': sha256_file(path), 'generation': r['stamp'],
            }
            if use_asr:
                heard = asr(path)
                entry['asr'] = heard
                entry['asrMatch'] = round(similarity(clip['text'], heard), 3)
            entries[clip['path']] = entry
            rows.append(entry)
        # 이 노래 폴더의 남는 조각은 지운다.
        for f in os.listdir(song_dir):
            if f.endswith('.mp3') and f not in wanted:
                os.remove(os.path.join(song_dir, f))
                entries.pop('assets/audio/voice/' + song['id'] + '/' + f, None)
                say('  남는 조각 지움: ' + song['id'] + '/' + f)
        if sample:
            tag = f'{cid}-{song["id"]}-tempo{song["tempo"]:g}'
            assemble(song, clips_x, os.path.join(SAMPLES, tag + '.mp3'))
            assemble(song, clips_x, os.path.join(SAMPLES, tag + '-beat.mp3'), click=True)
            if song['genre'] == 'hyangga':
                first = song['clips'][0]['path']
                one = {**song, 'duration': song['slotSec'], 'schedule': [s for s in song['schedule'] if s['path'] == first]}
                assemble(one, clips_x, os.path.join(SAMPLES, f'{cid}-{song["id"]}-gu0.mp3'))
    # 데이터에 없는 노래의 조각(전체를 돌릴 때만)
    if not plan.get('only'):
        voice_root = os.path.join(out_root, 'assets', 'audio', 'voice')
        for d in os.listdir(voice_root):
            if os.path.isdir(os.path.join(voice_root, d)) and d not in plan['allSongIds']:
                shutil.rmtree(os.path.join(voice_root, d))
                say('  남는 노래 폴더 지움: ' + d)
        entries = {p: e for p, e in entries.items() if e['songId'] in plan['allSongIds']}

    generator = {
        'service': 'Fish Audio API', 'model': cfg['model'], 'plan': f'유료 API 충전(종량 과금) · 플랫폼 구독 {account["packageType"]}',
        'voice': cid, 'voiceLabel': cand['label'], 'voiceDesignModel': cfg['designModel'], 'voiceDesignSeed': cand['seed'],
        'voiceDesignId': ref['id'], 'referenceSha256': ref['sha256'], 'instruction': cand['instruction'],
        'referenceText': cand['referenceText'], 'direction': cand.get('direction', ''), 'tts': cfg['tts'],
        'fill': FILL, 'targetLufs': TARGET_LUFS, 'peakMaxDb': PEAK_MAX_DB, 'bitrate': BITRATE,
    }
    clips_sorted = sorted(entries.values(), key=lambda e: (e['songId'], e['path']))
    write_json(manifest_path, {'version': 1, 'source': 'Fish Audio', 'generator': generator, 'license': LICENSE,
                               'commercialUse': True, 'clips': clips_sorted})
    if not sample:
        part = {'version': 1, 'assets': [{
            'path': e['path'], 'kind': 'voice',
            'source': f'Fish Audio TTS API({cfg["model"]}) — AI 합성 낭송',
            'generator': f'tools/voice/build_voice.py · 모델 {cfg["model"]} · 목소리 {cid}({cfg["designModel"]} seed {cand["seed"]}, 기준 음성 sha256 {ref["sha256"][:12]}) · 유료 API',
            'license': LICENSE, 'commercialUse': True, 'notes': e['text'],
        } for e in clips_sorted]}
        write_json(PART, part)

    report(rows, plan, calls)
    return rows


def report(rows, plan, calls):
    say(f'\n새로 부른 TTS {calls}번(나머지는 캐시).')
    say('조각                                   글                 칸(s)  자연(s)  말빠르기  줄임   최종(s)' + ('  받아쓰기' if rows and 'asr' in rows[0] else ''))
    for e in rows:
        mark = ''
        if e['stretch'] > STRETCH_WARN or e['ttsSpeed'] > SPEED_WARN:
            mark = '  ← 빠름'
        if e['duration'] > e['slotSec']:
            mark = '  ← 칸 넘침'
        asr_txt = f'  {e["asrMatch"]:.2f} "{e["asr"]}"' if 'asr' in e else ''
        say(f'{e["path"].replace("assets/audio/voice/", ""):<36}{e["text"]:<16}{e["slotSec"]:>7.2f}{e["naturalSec"]:>8.2f}'
            f'{e["ttsSpeed"]:>9.2f}{e["stretch"]:>7.2f}{e["duration"]:>9.3f}{asr_txt}{mark}')
    for song in plan['songs']:
        mine = [e for e in rows if e['songId'] == song['id']]
        if not mine:
            continue
        nat = max(e['naturalSec'] for e in mine)
        rec = 60 / (nat / FILL / STRETCH_WARN)
        over = sum(1 for e in mine if e['duration'] > e['slotSec'])
        fast = sum(1 for e in mine if e['stretch'] > STRETCH_WARN or e['ttsSpeed'] > SPEED_WARN)
        say(f'{song["id"]}: 빠르기 {song["tempo"]:g}(칸 {song["slotSec"]:.2f}s) · 조각 {len(mine)} · 칸 넘침 {over} · 빠르게 읽힌 조각 {fast}'
            f' · 가장 긴 자연 낭송 {nat:.2f}s → 자연스럽게 들어갈 빠르기 ≤ {rec:.0f}')


def main():
    global FFMPEG, FFPROBE
    ap = argparse.ArgumentParser(description='낭송 조각 만들기(Fish Audio)')
    ap.add_argument('--only', default='', help='노래 id(쉼표로 여럿)')
    ap.add_argument('--voice', default=None, help='voices.json의 후보 id(없으면 승인된 목소리)')
    ap.add_argument('--dry-run', action='store_true', help='조각 수·글자 수·예상 요금만(API를 부르지 않음)')
    ap.add_argument('--sample', action='store_true', help='후보 견본: assets/raw/voice-samples/에 쓰고 미리 듣기를 이어 붙임')
    ap.add_argument('--tempo', type=float, default=None, help='견본 미리 듣기용 빠르기(박/분). 실제 조각에는 쓰지 않는다')
    ap.add_argument('--asr', action='store_true', help='만든 조각을 받아쓰기(transcribe)로 들어 보고 글과 비교')
    ap.add_argument('--jobs', type=int, default=4, help='동시에 보낼 요청 수(기본 4)')
    ap.add_argument('--self-test', action='store_true', help='API 없이 가짜 말소리로 나머지 과정을 시험(임시 폴더)')
    a = ap.parse_args()

    with open(CONFIG, encoding='utf-8') as f:
        cfg = json.load(f)
    if cfg['model'].endswith('-free'):
        raise SystemExit('무료 모델은 상업 이용이 안 됩니다. voices.json의 model을 유료 모델로 두세요.')
    if a.self_test:
        FFMPEG, FFPROBE = tool('ffmpeg'), tool('ffprobe')
        self_test(cfg)
        return
    only = [s for s in a.only.split(',') if s.strip()]
    if a.tempo and not a.sample:
        raise SystemExit('--tempo는 --sample과 함께만 씁니다(실제 빠르기는 노래 데이터의 tempo로 정한다).')
    plan = load_plan(only, a.tempo)
    plan['only'] = only

    if a.voice:
        if a.voice not in cfg['candidates']:
            raise SystemExit('모르는 목소리 후보: ' + a.voice + ' (있는 것: ' + ', '.join(cfg['candidates']) + ')')
        voices = [a.voice]
    elif cfg.get('approved'):
        voices = [cfg['approved']]
    elif a.dry_run:
        voices = [cfg['approved']] if cfg.get('approved') else list(cfg['candidates'])[:1]
    else:
        raise SystemExit('승인된 목소리가 없습니다. --voice <후보>로 고르거나(견본은 --sample) voices.json의 approved를 채우세요.')
    if not a.dry_run and not a.sample and not cfg.get('approved'):
        raise SystemExit('승인 전에는 실제 조각을 만들지 않습니다. 견본은 --sample로 만드세요.')
    if not a.dry_run and not a.sample and voices[0] != cfg['approved']:
        raise SystemExit('실제 조각은 승인된 목소리(' + cfg['approved'] + ')로만 만듭니다.')

    if a.dry_run:
        dry_run(plan, cfg, voices, a.asr)
        return
    FFMPEG, FFPROBE = tool('ffmpeg'), tool('ffprobe')
    run_build(plan, voices[0], cfg, a.sample, a.jobs, a.asr)


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:  # noqa: BLE001 — 키가 섞이지 않게 지운 뒤에만 보인다
        sys.stderr.write(redact(traceback.format_exc()))
        sys.exit(1)
