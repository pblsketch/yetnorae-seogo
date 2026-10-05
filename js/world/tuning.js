// 세계 바탕의 조정 가능한 값(spec 22). 느낌을 보고 바꿀 수 있다.
export const TUNING = {
  drawCallBudget: 60,        // 관 하나의 그리기 호출 상한(spec 14·22)
  pixelRatioMax: 1.5,        // 픽셀 비율 상한(spec 14·22)
  yawLimit: 0.6,             // 끌어 돌리기 제한 각도(라디안, 약 34도). 좌우 같은 값
  yawPerPixel: 0.005,        // 끈 거리 1px당 도는 각도
  moveSpeed: 3.2,            // 3D 걷는 빠르기(m/s)
  boardSpeed: 42,            // 2D 그림 판 걷는 빠르기(그림 판 높이의 %/s)
  cameraFollow: 4,           // 카메라가 따라붙는 세기(클수록 빨리 붙는다)
  tapSlop: { mouse: 6, touch: 12 },   // 이만큼 넘게 움직이면 탭이 아니라 끌기
  joystickRadius: 48,        // 조이스틱 손잡이가 움직이는 반지름(px)
  joystickZone: { right: 0.45, top: 0.4 },  // 조이스틱이 생기는 왼쪽 아래 영역(보기 영역 너비·높이 비율)
  particleScaleReduced: 0.3, // 움직임 줄이기에서 파티클 비율
  dancheongRestoreSeconds: 1.6,  // 단청이 돌아오는 연출 시간
  arriveAnchorRadius: 1.5,   // 3D: 이 거리 안에 멈추면 그 자리에 도착한 것으로 본다(m)
  arriveAnchorRadius2D: 7,   // 2D: 같은 기준(그림 판 높이의 %)
  measureOffset: [0, 4.2, 9.5],  // 3D 반반 틀: 관 모형이 카메라 자리를 주지 않을 때 재기 초점에서 카메라까지(x, y, z m)
};
