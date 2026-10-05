// 갈래별 노래 묶음과 수첩 글을 모은다. 각 작업은 이 파일을 고치지 않는다. 연결 단계가 등록한다.
import { songs as hyangga } from './hyangga.js';
import { songs as goryeo } from './goryeo.js';
import { songs as sijo } from './sijo.js';
import { songs as gasa } from './gasa.js';
import { songs as saseol } from './saseol.js';
import { notebookPage as nbHyangga } from '../notebook-hyangga.js';
import { notebookPage as nbGoryeo } from '../notebook-goryeo.js';
import { notebookPage as nbSijo } from '../notebook-sijo.js';
import { notebookPage as nbGasa } from '../notebook-gasa.js';
import { notebookPage as nbSaseol } from '../notebook-saseol.js';

export const songs = [];      // 모든 노래(갈래별 파일의 배열을 이어 붙인다)
export const notebook = {};   // 갈래 id → 『분류 수첩』 쪽

// ── 등록 (연결 단계가 아래에 더한다) ──
songs.push(...hyangga, ...goryeo, ...sijo, ...gasa, ...saseol);
Object.assign(notebook, { hyangga: nbHyangga, goryeo: nbGoryeo, sijo: nbSijo, gasa: nbGasa, saseol: nbSaseol });
