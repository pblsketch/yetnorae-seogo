# -*- coding: utf-8 -*-
"""국립국악원 「국악기 디지털 음원」(디지털 이음) 악구 가운데 sources.json에 적은 것만 내려받는다.

    python tools/bgm/fetch.py          → tools/music_src/<악구 번호>*.wav (git에 넣지 않음, .gitignore)

- 이용 조건: 공공누리 제1유형(출처표시, 상업 이용·변경 가능). 사용자가 2026-10-05 내려받기를 승인했다.
- 사이트 양식대로 사용 목적·기관명을 함께 보낸다(sources.json의 download.form, 시리즈 선례와 같은 값).
- 이미 받은 악구는 건너뛴다. 한 번에 30개까지 묶어 받는다(사이트 한도).
- 받은 뒤 악구 번호마다 파일이 하나씩 있는지 확인하고, 빠지면 0이 아닌 값으로 끝낸다.
"""
import http.cookiejar
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import zipfile

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'tools', 'music_src')
B = 'https://www.gugak.go.kr/digitaleum/'
CFG = json.load(open(os.path.join(HERE, 'sources.json'), encoding='utf-8'))


def all_ids():
    ids = [i for t in CFG['bgm'].values() for i in t['ids']]
    ids += list(CFG['sfx_raw'].keys())
    return ids


def opener():
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [('User-Agent', 'Mozilla/5.0'), ('Referer', B + 'front/phrase/list.do')]
    op.open(B + 'front/phrase/list.do', timeout=60).read()
    return op


def have(pid):
    return [f for f in os.listdir(OUT) if f.lower().startswith(pid.lower()) and f.lower().endswith('.wav')]


def save(body, disp, first):
    if body[:2] == b'PK':
        z = zipfile.ZipFile(io.BytesIO(body))
        for n in z.namelist():
            base = os.path.basename(n)
            if base:
                open(os.path.join(OUT, base), 'wb').write(z.read(n))
                print('  ', base, z.getinfo(n).file_size)
    else:
        fn = urllib.parse.unquote(disp.split('filename=')[-1].strip('"; ')) if 'filename=' in disp else first + '.wav'
        open(os.path.join(OUT, os.path.basename(fn)), 'wb').write(body)
        print('  ', fn, len(body))


def main():
    os.makedirs(OUT, exist_ok=True)
    ids = all_ids()
    todo = [i for i in ids if not have(i)]
    print('악구', len(ids), '받을 것', len(todo))
    op = opener() if todo else None
    for k in range(0, len(todo), 30):
        chunk = todo[k:k + 30]
        data = dict(CFG['download']['form'], arrId=','.join(chunk), id='')
        path = 'cmmn/file/phrase/downloads.do'
        if len(chunk) == 1:
            path = 'cmmn/file/phrase/download.do'
            data['id'] = chunk[0]
        for attempt in range(5):
            try:
                r = op.open(B + path, urllib.parse.urlencode(data).encode(), timeout=300)
                body = r.read()
                break
            except Exception as e:  # 사이트가 연결을 자주 끊는다
                print('다시 시도', attempt + 1, e)
                time.sleep(5 * (attempt + 1))
                op = opener()
        else:
            raise SystemExit('내려받기 실패')
        save(body, r.headers.get('Content-Disposition', ''), chunk[0])
        time.sleep(1)
    missing = [i for i in ids if len(have(i)) != 1]
    if missing:
        raise SystemExit(f'빠지거나 겹친 악구: {missing}')
    print('모두 있음', len(ids))


if __name__ == '__main__':
    main()
