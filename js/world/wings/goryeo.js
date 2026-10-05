// 고려가요관 모형(js/data/README.md 7.1 관 모형 약속).
// 똑같이 생긴 작은 연 방이 줄지어 있고, 방 앞 복도에서 후렴이 울린다(spec 3.1).
// 고유 동작 '후렴 고리 걸기'(diorama:refrain-link)가 오면 두 방에 고리가 걸리고 복도를 따라 끈이 이어진다.
// 3D는 goryeo-3d.js, 2D 그림 판은 goryeo-2d.js가 그리고, 사건 처리와 배치는 goryeo-state.js가 함께 맡는다.
export { create3D } from './goryeo-3d.js';
export { create2D } from './goryeo-2d.js';
