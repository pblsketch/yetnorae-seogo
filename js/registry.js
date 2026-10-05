// 관 모형, 작품 방, 화면 모듈을 모으는 단일 등록 지점.
// 각 작업은 이 파일을 고치지 않는다. 웨이브가 끝날 때 연결 단계가 import와 등록 줄을 더한다.

export const registry = {
  wings: {},    // 관 id → 관 모형 모듈 { create3D, create2D }
  rooms: {},    // 관 id → 작품 방 모듈 { start }
  screens: {},  // 화면 이름 → 화면 모듈 { show }
};

// ── 등록 (연결 단계가 아래에 더한다) ──
