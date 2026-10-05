// 관 모형, 작품 방, 화면 모듈을 모으는 단일 등록 지점.
// 각 작업은 이 파일을 고치지 않는다. 웨이브가 끝날 때 연결 단계가 import와 등록 줄을 더한다.
import { normalizeWing } from './world/wings/normalize.js';
import * as hyanggaWing from './world/wings/hyangga.js';
import * as goryeoWing from './world/wings/goryeo.js';
import * as sijoWing from './world/wings/sijo.js';
import * as gasaWing from './world/wings/gasa.js';
import * as saseolWing from './world/wings/saseol.js';
import * as hyanggaRoom from './rooms/hyangga.js';
import * as goryeoRoom from './rooms/goryeo.js';
import * as sijoRoom from './rooms/sijo.js';
import * as gasaRoom from './rooms/gasa.js';
import * as saseolRoom from './rooms/saseol.js';
import * as playScreen from './play/play-screen.js';
import { notebookScreen, journalScreen, collectionScreen } from './play/screens.js';
import * as startScreen from './story/start.js';

export const registry = {
  wings: {},    // 관 id → 관 모형 모듈 { create3D, create2D }
  rooms: {},    // 관 id → 작품 방 모듈 { start }
  screens: {},  // 화면 이름 → 화면 모듈 { show }
};

// ── 등록 (연결 단계가 아래에 더한다) ──

// 관 모형: 저마다 다른 손잡이 모양을 normalizeWing이 한 가지로 맞춘다(README '연결 결정(F2)').
registry.wings.hyangga = normalizeWing(hyanggaWing);
registry.wings.goryeo = normalizeWing(goryeoWing);
registry.wings.sijo = normalizeWing(sijoWing);
registry.wings.gasa = normalizeWing(gasaWing);
registry.wings.saseol = normalizeWing(saseolWing);

// 작품 방
registry.rooms.hyangga = hyanggaRoom;
registry.rooms.goryeo = goryeoRoom;
registry.rooms.sijo = sijoRoom;
registry.rooms.gasa = gasaRoom;
registry.rooms.saseol = saseolRoom;

// 화면
registry.screens.play = playScreen;
registry.screens.notebook = notebookScreen;
registry.screens.journal = journalScreen;
registry.screens.collection = collectionScreen;
// 시작 화면(앱 흐름의 첫 장면, T18)
registry.screens.start = startScreen;
