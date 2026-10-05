# 향가관 그림 판의 탑 칸 수를 4·8·10으로 맞춘다(T26). 이미지 생성이 칸 수를 정확히 세지 못해서,
# 가공본(assets/img/board/hyangga.webp)에서 한 칸을 떼어 같은 폭 안에 칸을 하나 더 늘어 놓는다.
# process.py가 1600×900으로 줄인 그림에 부른다. 좌표는 지금 원본(assets/raw/art/board/hyangga.png) 기준이며, 원본을 다시 만들면 좌표도 다시 잰다.
from PIL import Image

# 좌표를 잰 원본의 sha256. 원본이 바뀌면 고치지 않고 알린다(잘못된 자리를 덮지 않도록).
RAW_SHA256 = '400d6103d446b5c0568347d8a419c07bd3982e63b4ca1e6d4dde0138151139d0'

# (왼쪽 x, 오른쪽 x, 위 y, 아래 y, 지금 칸 수, 바꿀 칸 수, 떼어 쓸 칸 번호)
ROWS = [
    (585.0, 861.5, 254, 331, 7, 8, 3),   # 맨 위층 문 앞: 7칸 → 8칸(문 뒤 2칸과 합쳐 10칸)
    (607.5, 985.0, 421, 498, 7, 8, 3),   # 가운데 층: 7칸 → 8칸
]


def fix(im):
    im = im.convert('RGB')
    for xa, xb, ya, yb, n, m, k in ROWS:
        p = (xb - xa) / n
        cell = im.crop((round(xa + k * p), ya, round(xa + (k + 1) * p), yb))
        strip = Image.new('RGB', (cell.width * m, yb - ya))
        for i in range(m):
            strip.paste(cell, (i * cell.width, 0))
        strip = strip.resize((round(xb - xa), yb - ya), Image.LANCZOS)
        im.paste(strip, (round(xa), ya))
    return im
