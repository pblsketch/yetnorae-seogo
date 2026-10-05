// 시조관 모형(js/data/README.md 7.1 관 모형 약속). 3층 정자(초장·중장·종장), 층마다 계단참 둘(3장 6구),
// 종장으로 오르는 첫 계단 세 칸(계단 오르기), 박마다 불이 켜지는 기둥, 칸 셋, '선대 사서의 자리'.
// 상태는 sijo-model.js가, 그리기는 sijo-3d.js(Three.js)와 sijo-2d.js(SVG 그림 판)가 맡는다.
export { create3D } from './sijo-3d.js';
export { create2D } from './sijo-2d.js';
