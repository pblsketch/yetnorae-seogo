# -*- coding: utf-8 -*-
"""장구 소리와 효과음 assets/audio/sfx/<이름>.mp3를 만든다.

    python tools/bgm/build_sfx.py

- '녹음'인 것은 국립국악원 악구(tools/music_src/, sources.json의 sfx_raw)에서 한 타(打)만 잘라 낸다.
  타점 앞 1.5ms부터 자르므로 소리가 바로 시작한다(탭 지연을 줄이려고).
- '합성'인 것은 이 스크립트가 numpy·scipy로 직접 만든다(난수 씨앗 고정이라 다시 돌려도 같다).
  외부 음원을 쓰지 않으므로 사용권 문제가 없다.
- 모두 모노 44.1kHz, 봉우리를 정한 값(PEAK)에 맞춘 뒤 MP3 96kbps.
- 무엇으로 만들었는지는 RECIPES의 'kind'·'src'·'how'에 적고 _sfx_build.json과 CREDITS.md에 옮긴다.
"""
import json
import os

import numpy as np
from scipy import signal

from common import AUDIO, SR, SRC, encode_mp3, find, load, write_wav

OUT = os.path.join(AUDIO, 'sfx')
BITRATE = '96k'
rng = np.random.default_rng(29)


# ---------- 녹음에서 한 타 자르기 ----------

def onset(x, t, win=0.04, frac=0.1):
    """t초 근처(±win)에서 처음으로 그 구간 최댓값의 frac를 넘는 표본 위치."""
    a, b = int((t - win) * SR), int((t + win) * SR)
    seg = np.abs(x[a:b])
    return a + int(np.flatnonzero(seg >= seg.max() * frac)[0])


def cut(pid, t, dur, fade, pre=0.0015):
    """악구 pid의 t초 근처 타점에서 dur초를 잘라 끝 fade초를 지수 곡선으로 줄인다."""
    x = load(find(pid))
    s = onset(x, t) - int(pre * SR)
    y = x[s:s + int(dur * SR)].copy()
    n = int(fade * SR)
    y[-n:] *= np.exp(-np.linspace(0, 6, n))
    y[:int(pre * SR)] *= np.linspace(0, 1, int(pre * SR))
    return y


# ---------- 합성 도구 ----------

def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def band(x, lo, hi, order=4):
    sos = signal.butter(order, [lo, hi], btype='bandpass', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def lowpass(x, f, order=4):
    return signal.sosfilt(signal.butter(order, f, btype='lowpass', fs=SR, output='sos'), x)


def env(dur, attack, decay):
    t = t_axis(dur)
    e = np.exp(-t / decay)
    na = max(1, int(attack * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def place_at(buf, y, at):
    i = int(at * SR)
    end = min(len(buf), i + len(y))
    buf[i:end] += y[:end - i]
    return buf


# ---------- 효과음 ----------

def bell():
    """박자 맞추기 종소리: 작은 놋쇠 종. 맑은 타격음 + 종의 비조화 배음."""
    dur, f0 = 1.1, 1046.5   # 도(C6)
    t = t_axis(dur)
    y = np.zeros_like(t)
    for ratio, amp, dec in [(1.0, 1.0, 0.55), (2.0, 0.45, 0.30), (2.76, 0.35, 0.22), (3.94, 0.22, 0.14),
                            (5.40, 0.12, 0.09), (0.5, 0.18, 0.70)]:
        y += amp * np.sin(2 * np.pi * f0 * ratio * t + rng.uniform(0, 1)) * np.exp(-t / dec)
    strike = band(rng.standard_normal(len(t)), 2500, 9000) * np.exp(-t / 0.004) * 0.6
    e = np.ones_like(t)
    e[:int(0.0015 * SR)] = np.linspace(0, 1, int(0.0015 * SR))
    return (y + strike) * e


def gold():
    """금박: 높은 반짝임 네 번이 잇달아 울린다."""
    dur = 0.85
    y = np.zeros(int(dur * SR))
    for k, (f, at) in enumerate([(2637, 0.0), (3520, 0.045), (3136, 0.095), (4699, 0.15)]):
        tt = t_axis(0.6)
        p = sum(a * np.sin(2 * np.pi * f * r * tt) for r, a in [(1, 1.0), (2.41, 0.35), (3.9, 0.15)])
        p *= np.exp(-tt / (0.18 - 0.02 * k))
        p[:int(0.001 * SR)] *= np.linspace(0, 1, int(0.001 * SR))
        place_at(y, p * (1 - 0.15 * k), at)
    air = band(rng.standard_normal(len(y)), 5000, 12000) * env(dur, 0.002, 0.12) * 0.12
    return y + air


def bind():
    """실 묶음: 실이 쓸리는 '스윽' 두 번 + 매듭이 조여지는 작은 '톡'."""
    dur = 0.5
    y = np.zeros(int(dur * SR))
    for at, d, lo, hi, g in [(0.0, 0.16, 1800, 6000, 1.0), (0.17, 0.2, 2200, 7500, 0.8)]:
        n = band(rng.standard_normal(int(d * SR)), lo, hi)
        tt = t_axis(d)
        e = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 0.6
        e[:int(0.003 * SR)] = np.maximum(e[:int(0.003 * SR)], np.linspace(0.3, 0.5, int(0.003 * SR)))
        place_at(y, n * e * g, at)
    tick_t = t_axis(0.05)
    tick = (np.sin(2 * np.pi * 1700 * tick_t) * 0.7 + band(rng.standard_normal(len(tick_t)), 2000, 8000)) \
        * np.exp(-tick_t / 0.008)
    place_at(y, tick * 1.6, 0.39)
    return y


def pop():
    """틀린 노래가 삐져나옴: 뽁 하고 튀어나온 뒤 작게 한 번 더 통."""
    dur = 0.32
    y = np.zeros(int(dur * SR))
    for at, f1, f2, d, g in [(0.0, 950, 320, 0.09, 1.0), (0.14, 700, 380, 0.06, 0.35)]:
        tt = t_axis(d)
        f = f2 + (f1 - f2) * np.exp(-tt / 0.018)
        ph = 2 * np.pi * np.cumsum(f) / SR
        p = np.sin(ph) * np.exp(-tt / (d / 3))
        p[:int(0.0008 * SR)] *= np.linspace(0, 1, int(0.0008 * SR))
        click = band(rng.standard_normal(len(tt)), 1500, 6000) * np.exp(-tt / 0.003) * 0.3
        place_at(y, (p + click) * g, at)
    return y


def page():
    """책장 넘김: 종이가 바스락거리며 휘었다가 '착' 하고 내려앉는다."""
    dur = 0.55
    n = len(t_axis(dur))
    noise = band(rng.standard_normal(n), 900, 7000)
    # 바스락: 거친 진폭 변화
    crinkle = np.abs(lowpass(rng.standard_normal(n), 60)) * 4
    tt = t_axis(dur)
    shape = np.interp(tt, [0, 0.01, 0.18, 0.36, 0.42, 0.55], [0.35, 0.8, 1.0, 0.6, 0.2, 0.0])
    y = noise * shape * (0.4 + crinkle)
    flap_t = t_axis(0.08)
    flap = band(rng.standard_normal(len(flap_t)), 300, 3000) * np.exp(-flap_t / 0.015)
    place_at(y, flap * 1.4, 0.38)
    y[:int(0.001 * SR)] *= np.linspace(0, 1, int(0.001 * SR))
    return y


def basket():
    """바구니: 대나무 바구니에 노래가 담기며 바스락 + 장구 궁편의 낮은 '쿵'(녹음)."""
    kung = cut('m1-250-a01', 15.012, 0.6, 0.35)
    kung /= np.abs(kung).max()
    dur = 0.6
    y = np.zeros(int(dur * SR))
    for at in [0.0, 0.018, 0.041, 0.07, 0.095, 0.13]:
        tt = t_axis(0.03)
        c = band(rng.standard_normal(len(tt)), 2500, 8000) * np.exp(-tt / 0.006)
        place_at(y, c * rng.uniform(0.4, 0.8), at)
    place_at(y, kung * 0.9, 0.0)
    return y


def fog():
    """먹안개가 물러남: 징 한 번(녹음)을 길게 울리다 사라지게."""
    y = cut('i4-601-q01', 1.602, 2.8, 2.2)
    return lowpass(y, 5000, 2)


RECIPES = {
    'janggu': dict(kind='녹음', peak=-3.0, src='m1-250-a01',
                   make=lambda: cut('m1-250-a01', 27.510, 0.7, 0.45),
                   how='「시조 초중장 장단」 27.51초의 덩(궁편·채편을 함께 친 타) 한 타, 0.7초'),
    'janggu-soft': dict(kind='녹음', peak=-9.0, src='m1-250-a01',
                        make=lambda: cut('m1-250-a01', 18.077, 0.26, 0.18),
                        how='「시조 초중장 장단」 18.08초의 채편 잔가락 한 타, 0.26초'),
    'place': dict(kind='녹음', peak=-4.0, src='m1-250-a01',
                  make=lambda: cut('m1-250-a01', 32.496, 0.5, 0.3),
                  how='「시조 초중장 장단」 32.50초의 덕-쿵(채편 뒤 궁편) 0.5초. 책을 칸에 꽂는 \'탁\''),
    'bell': dict(kind='합성', peak=-3.0, src=None, make=bell,
                 how='작은 종: 도(C6) 기본음과 종의 비조화 배음 6개, 짧은 타격 잡음'),
    'bind': dict(kind='합성', peak=-6.0, src=None, make=bind,
                 how='띠 잡음 두 번(실이 쓸림) + 짧은 사인 \'톡\'(매듭)'),
    'gold': dict(kind='합성', peak=-8.0, src=None, make=gold,
                 how='높은 사인 배음 묶음 네 개가 45~55ms 간격으로 반짝임 + 공기 잡음'),
    'basket': dict(kind='녹음+합성', peak=-5.0, src='m1-250-a01', make=basket,
                   how='「시조 초중장 장단」 15.01초의 궁편 \'쿵\' 0.6초 + 합성 바스락 6번'),
    'fog': dict(kind='녹음', peak=-6.0, src='i4-601-q01', make=fog,
                how='「자진삼채」 1.60초의 징 한 타를 2.8초로 자르고 길게 줄임, 5kHz 위를 조금 깎음'),
    'pop': dict(kind='합성', peak=-6.0, src=None, make=pop,
                how='음높이가 떨어지는 사인 \'뽁\' + 작은 되튐'),
    'page': dict(kind='합성', peak=-10.0, src=None, make=page,
                 how='띠 잡음을 거칠게 흔든 바스락 + 낮은 \'착\''),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    report = {}
    for name, r in RECIPES.items():
        y = r['make']()
        n = int(0.03 * SR)          # 끝 30ms를 닫아 잘린 울림이 '딱' 하지 않게
        y[-n:] *= np.linspace(1, 0, n)
        y = y / np.abs(y).max() * 10 ** (r['peak'] / 20)
        tmp = os.path.join(SRC, f'_sfx_{name}.wav')
        write_wav(y, tmp)
        mp3 = os.path.join(OUT, f'{name}.mp3')
        encode_mp3(tmp, mp3, BITRATE)
        os.remove(tmp)
        report[name] = {'kind': r['kind'], 'src': r['src'], 'how': r['how'], 'sec': round(len(y) / SR, 3),
                        'peak_dbfs': r['peak'], 'kb': round(os.path.getsize(mp3) / 1024, 1)}
        print(f"{name:12s} {r['kind']:6s} {len(y) / SR:5.2f}s peak {r['peak']:5.1f}  {report[name]['kb']}KB")
    json.dump(report, open(os.path.join(SRC, '_sfx_build.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
