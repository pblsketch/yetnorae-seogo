# 그림을 한꺼번에 다시 만들 수 있는 묶음 실행기(T26).
# 사용: python tools/art/genqueue.py [묶음/id 또는 글로브 ...] [--force] [-j 4] [--prompts-only]
#   예: python tools/art/genqueue.py "keepsake/*" -j 4
#       python tools/art/genqueue.py keepsake/cheongsan-byeolgok --force   (이전 원본은 .v<번호>.png로 남긴다)
# 프롬프트 파일(tools/art/prompts/<묶음>/<id>.txt)을 catalog.py에서 먼저 다시 쓴 뒤, gen.ps1(Codex CLI image_gen)을 부른다.
import argparse, fnmatch, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobs import all_jobs, style_dir, ROOT, RAW  # noqa: E402

TIMEOUT = 300  # 한 장 생성의 시간 제한(초). 보통 1~2분이 걸린다


def write_prompts(jobs):
    for j in jobs:
        if not j.get('prompt'):
            continue
        if any(ord(ch) > 127 for ch in j['prompt']):
            raise SystemExit(f"프롬프트에 영어가 아닌 글자가 있다: {j['key']}")
        j['prompt_path'].parent.mkdir(parents=True, exist_ok=True)
        j['prompt_path'].write_text(j['prompt'] + '\n', encoding='ascii')


def run(j, force, sdir):
    raw = j['raw_path']
    if raw.exists() and not force:
        return f'SKIP {j["key"]}'
    raw.parent.mkdir(parents=True, exist_ok=True)
    if raw.exists():
        n = 1
        while raw.with_suffix(f'.v{n}.png').exists():
            n += 1
        raw.rename(raw.with_suffix(f'.v{n}.png'))
    name = 'yn_' + j['key'].replace('/', '_')
    tmp = raw.with_suffix('.new.png')
    cmd = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(ROOT / 'tools/art/gen.ps1'),
           '-Name', name, '-PromptFile', str(j['prompt_path']), '-Out', str(tmp), '-Size', j['size']]
    if j.get('ref') and sdir:
        cmd += ['-Image', str(sdir / f"{j['ref']}.png"), '-RefMode', 'style']
    log = RAW / 'logs' / f'{name}.log'
    log.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    for attempt in (1, 2):  # Codex가 가끔 시작한 채 멈추므로 시간 제한을 두고 한 번 더 해 본다
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8',
                             errors='replace', cwd=str(ROOT))
        try:
            out, _ = p.communicate(timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            subprocess.run(['taskkill', '/PID', str(p.pid), '/T', '/F'], capture_output=True)
            p.communicate()
            out = f'시간 초과({TIMEOUT}초), 시도 {attempt}'
        log.write_text(out, encoding='utf-8')
        if tmp.exists():
            tmp.replace(raw)
            return f'OK   {j["key"]} ({time.time() - t0:.0f}s)'
    return f'FAIL {j["key"]} ({time.time() - t0:.0f}s) 로그: {log}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('patterns', nargs='*')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('-j', type=int, default=4)
    ap.add_argument('--prompts-only', action='store_true')
    a = ap.parse_args()
    jobs = all_jobs()
    write_prompts(jobs)
    if a.prompts_only:
        return
    todo = [j for j in jobs if j.get('prompt') and (not a.patterns or any(fnmatch.fnmatch(j['key'], p) for p in a.patterns))]
    sdir = style_dir()
    if sdir is None:
        print('경고: 승인된 화풍 샘플(assets/raw/style)을 찾지 못해 참조 없이 만든다')
    j = max(1, min(a.j, 5))  # 동시에 5개를 넘기지 않는다
    with ThreadPoolExecutor(j) as ex:
        for line in ex.map(lambda x: run(x, a.force, sdir), todo):
            print(line, flush=True)


if __name__ == '__main__':
    main()
