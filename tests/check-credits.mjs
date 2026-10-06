// 출처 화면 점검(spec 16.3·16.5, 14, 19-10·11). js/ui/credits.js와 js/data/credits.js를 본다.
//
// 확인하는 것
//  1) 데이터 맞춤: 화면에 적은 학자·책·옛 문헌·공개 자료가 노래의 출처 문구(citation·sourceNote)에 실제로 있는지,
//     거꾸로 노래 출처 문구의 『책』이 모두 화면(옛 문헌이나 학자의 책)에 있는지. 공공누리 문구가 소리 출처 문서와 같은지,
//     Three.js 저작권 줄이 vendor/three/LICENSE와 같은지, 글꼴 라이선스 파일이 있는지
//  2) 브라우저(점검 페이지 tests/pages/credits.html): 844×390·1366×768, 글자 크기 1·1.3에서
//     항목 열한 갈래가 모두 있고 필요한 말(교과서 노래 제목, 김완진, 옛 문헌, 공공누리 문구, Fish Audio 유료 요금제,
//     그림 생성 방식, OFL, Three.js MIT)이 보이는지, 노래마다 출처 45편·쓴 곡 목록, 출판사 이름 없음,
//     가로 넘침 없음, 몸통만 스크롤되어 끝까지 읽힘, 48px 이상 단추, '돌아가기'와 Esc가 go('start')를 부르고 화면을 치우는지
//  3) 앱 흐름(점검 페이지 tests/pages/credits-app.html — 연결 단계가 할 등록을 그 페이지 안에서만 해 본다):
//     시작 화면의 '출처' 문 → 출처 화면 → 돌아가기 → 시작 화면
//  4) 콘솔 오류와 바깥 주소 요청이 없는지
// 음성 사례: 지어낸 학자, 빠진 옛 문헌, 빠진 갈래, 출판사 이름, 불리지 않은 go를 실제로 잡는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { openGame, VIEWPORTS } from './lib/browser.mjs';
import { songs } from '../js/data/songs/index.js';
import { CREDITS } from '../js/data/credits.js';
import { buildCredits, buildAssetCredits, sourceText } from '../js/ui/credits.js';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const FORBIDDEN = String.fromCodePoint(0xc9c0, 0xd559, 0xc0ac);   // 출판사 이름(글자 그대로 쓰지 않는다)
const SECTIONS = ['textbook', 'scholars', 'old-texts', 'exam', 'references', 'songs', 'music', 'voice', 'art', 'fonts', 'code'];

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { failures++; console.error('✗ ' + msg); }
}

// ───────── 판단(순수 함수) ─────────
const titlesIn = (text) => [...String(text).matchAll(/『([^』]+)』/g)].map((m) => m[1]);
export function judgeSync(songList, credits) {
  const out = [];
  const all = songList.map(sourceText).join('\n');
  for (const p of credits.scholars.people) {
    if (!songList.some((s) => s.citation.includes(p.name))) out.push(`학자 '${p.name}'이 어느 노래의 출처 문구에도 없다`);
    for (const t of p.works.flatMap(titlesIn)) if (!all.includes('『' + t + '』')) out.push(`학자의 책 『${t}』이 노래 출처 문구에 없다`);
  }
  for (const b of credits.oldTexts.books) if (!all.includes('『' + b + '』')) out.push(`옛 문헌 『${b}』이 노래 출처 문구에 없다`);
  for (const r of credits.references.items) if (!all.includes(r)) out.push(`공개 자료 '${r}'가 노래 출처 문구에 없다`);
  const listed = new Set([...credits.oldTexts.books, ...credits.scholars.people.flatMap((p) => p.works.flatMap(titlesIn))]);
  for (const t of new Set(titlesIn(all))) if (!listed.has(t)) out.push(`노래 출처 문구의 『${t}』이 출처 화면에 없다`);
  return out;
}
export const missingSections = (present) => SECTIONS.filter((s) => !present.includes(s));
export const hasForbidden = (text) => String(text).includes(FORBIDDEN) || String(text).normalize('NFC').includes(FORBIDDEN);

// ───────── 1. 데이터 맞춤 ─────────
console.log('[1] 출처 화면의 글과 데이터');
{
  const problems = judgeSync(songs, CREDITS);
  ok(problems.length === 0, '학자·책·옛 문헌·공개 자료가 노래 출처 문구와 맞음' + (problems.length ? ' — ' + problems.join('; ') : ''));
  const d = buildCredits(songs);
  ok(d.textbook.flatMap((g) => g.songs).length === songs.filter((s) => s.sourceType.startsWith('textbook')).length, `교과서 노래 ${d.textbook.flatMap((g) => g.songs).length}편이 모두 교과서 항목에 있음`);
  ok(d.textbook.every((g) => /^고등학교 .+ 교과서 수록/.test(g.label)), '교과서는 "고등학교 ○○ 교과서 수록…"으로만 적음');
  ok(d.scholars.find((p) => p.name === '김완진')?.songs.length === songs.filter((s) => s.genre === 'hyangga').length, '김완진 해독을 따른 향가가 모두 보임');
  ok(d.oldTexts.every((b) => b.songs.length > 0), '옛 문헌마다 그 문헌의 노래가 하나 이상');
  ok(d.perSong.length === songs.length, `노래마다 출처 ${d.perSong.length}편`);
  const creditsMd = fs.readFileSync(path.join(root, 'assets/audio/CREDITS.md'), 'utf8');
  ok(creditsMd.includes(CREDITS.music.kogl), '공공누리 출처 문구가 assets/audio/CREDITS.md와 같음');
  const lic = fs.readFileSync(path.join(root, 'vendor/three/LICENSE'), 'utf8');
  const copy = /Copyright © .+/.exec(lic)?.[0];
  ok(copy && CREDITS.code.lines.some((l) => l.includes('Three.js') && l.includes('MIT') && l.includes(copy)), `Three.js 저작권 줄이 vendor/three/LICENSE와 같음(${copy})`);
  ok(fs.existsSync(path.join(root, 'assets/fonts/OFL.txt')) && CREDITS.fonts.license.includes('assets/fonts/OFL.txt'), '글꼴 라이선스 파일(assets/fonts/OFL.txt)이 있고 화면이 그 자리를 알려 줌');
  const parts = ['audio', 'voice', 'art'].map((n) => JSON.parse(fs.readFileSync(path.join(root, `assets/manifest.parts/${n}.json`), 'utf8')));
  const a = buildAssetCredits({ assets: parts.flatMap((p) => p.assets) });
  ok(a.music.length === parts[0].assets.length, `쓴 곡 목록 ${a.music.length}개(배경음·효과음 모두)`);
  ok(/Fish Audio/.test(a.voiceSource ?? '') && /Fish Audio/.test(CREDITS.voice.lead) && /유료/.test(CREDITS.voice.lead) && /상업/.test(CREDITS.voice.lead), '낭송: Fish Audio 유료 요금제와 상업 이용');
  ok(/Codex/.test(a.artSource ?? '') && /AI 이미지 생성/.test(CREDITS.art.lead), '그림: 생성 방식(Codex 이미지 생성)');
  const allText = JSON.stringify(CREDITS) + JSON.stringify(d) + fs.readFileSync(path.join(root, 'js/ui/credits.js'), 'utf8');
  ok(!hasForbidden(allText), '출처 화면의 글과 코드에 출판사 이름 없음');
}

console.log('\n[음성 사례]');
{
  const fake = JSON.parse(JSON.stringify(CREDITS));
  fake.scholars.people.push({ name: '홍길동', role: '풀이', works: ['『없는 책』'] });
  const p1 = judgeSync(songs, fake);
  ok(p1.some((s) => s.includes('홍길동')) && p1.some((s) => s.includes('없는 책')), '지어낸 학자와 책을 잡는다');
  const fake2 = JSON.parse(JSON.stringify(CREDITS));
  fake2.oldTexts.books = fake2.oldTexts.books.filter((b) => b !== '청구영언');
  ok(judgeSync(songs, fake2).some((s) => s.includes('『청구영언』이 출처 화면에 없다')), '노래 출처에 있는데 화면에서 빠진 옛 문헌을 잡는다');
  const fakeSongs = songs.map((s) => (s.id === 'taesan' ? { ...s, citation: s.citation + ' 『새로 찾은 문헌』' } : s));
  ok(judgeSync(fakeSongs, CREDITS).some((s) => s.includes('새로 찾은 문헌')), '노래에 새 문헌이 생기면 잡는다');
  ok(missingSections(SECTIONS.filter((s) => s !== 'music')).join() === 'music', '빠진 갈래(배경음)를 잡는다');
  ok(hasForbidden('고등학교 문학 ' + FORBIDDEN + ' 교과서') && !hasForbidden('고등학교 문학 교과서 수록본'), '출판사 이름을 잡는다');
}

// ───────── 2·3. 브라우저 ─────────
const server = await startServer();
const externalAll = [];
const errorsAll = [];
try {
  console.log('\n[2] 출처 화면(점검 페이지)');
  for (const [vpName, vp] of [['phone', VIEWPORTS.phone], ['chromebook', VIEWPORTS.chromebook]]) {
    const g = await openGame(server.url, { path: 'tests/pages/credits.html', viewport: vp, touch: vpName === 'phone' });
    try {
      await g.page.waitForFunction(() => document.documentElement.dataset.ready === '1');
      for (const scale of [1, 1.3]) {
        const tag = `${vp.width}×${vp.height} 글자 ${scale}`;
        await g.page.evaluate((s) => window.__credits.open(s), scale);
        const info = await g.page.evaluate(() => {
          const r = document.querySelector('.credits');
          const body = r.querySelector('.credits-body');
          const back = r.querySelector('.credits-back');
          const det = r.querySelector('.credits-details');
          det.open = true;
          const rect = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
          const sections = [...r.querySelectorAll('.credits-section')].map((s) => s.dataset.section);
          const text = r.innerText;
          const scroll = { sh: body.scrollHeight, ch: body.clientHeight };
          body.scrollTop = body.scrollHeight;
          const last = r.querySelector('.credits-section[data-section="code"]');
          const lastVisible = rect(last).b <= rect(body).b + 1 && rect(last).y >= rect(body).y - 1;
          const smallTargets = [...r.querySelectorAll('button, summary')].filter((e) => { const b = e.getBoundingClientRect(); return b.width < 48 || b.height < 48; }).map((e) => e.className);
          const overflowX = [...r.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.className).slice(0, 5);
          return {
            sections, text, textContent: r.textContent, scroll, lastVisible, smallTargets, overflowX,
            back: rect(back), vw: innerWidth, vh: innerHeight,
            perSong: r.querySelectorAll('.credits-details [data-song]').length,
            music: r.querySelectorAll('.credits-music .credits-item').length,
            pageScroll: document.scrollingElement.scrollHeight > innerHeight + 1,
          };
        });
        ok(missingSections(info.sections).length === 0, `${tag}: 갈래 ${SECTIONS.length}개가 모두 있음` + (missingSections(info.sections).length ? ' — 빠짐: ' + missingSections(info.sections).join(', ') : ''));
        const need = [
          '고등학교 공통국어2 교과서 수록본', '고등학교 문학 교과서 수록 작품', '「제망매가」', '「상춘곡」', '「십 년을 경영하야」', '교과서 밖 원문',
          '김완진', '『향가해독법연구』', '『삼국유사』', '『악장가사』', '『악학궤범』', '『청구영언』', '『가곡원류』', '『송강가사』',
          '한국교육과정평가원', CREDITS.music.kogl, '공공누리 제1유형', 'Fish Audio', '유료 요금제', '상업적으로', 'AI', '글 설명만으로 설계한',
          'AI 이미지 생성', 'Codex', 'SIL Open Font License', 'Noto Serif KR', 'Three.js', 'MIT',
        ];
        const lacking = need.filter((w) => !info.text.includes(w));
        ok(lacking.length === 0, `${tag}: 필요한 말이 화면에 보임` + (lacking.length ? ' — 없음: ' + lacking.join(' / ') : ''));
        ok(info.perSong === songs.length, `${tag}: 노래마다 출처 ${info.perSong}편(펼쳐 봄)`);
        ok(info.music === 19, `${tag}: 쓴 곡 ${info.music}개(배경음 9, 효과음 10)`);
        ok(!hasForbidden(info.textContent), `${tag}: 출판사 이름 없음`);
        ok(info.overflowX.length === 0, `${tag}: 가로로 넘치는 것 없음` + (info.overflowX.length ? ' — ' + info.overflowX.join(', ') : ''));
        ok(!info.pageScroll && info.scroll.sh > info.scroll.ch && info.lastVisible, `${tag}: 몸통만 스크롤되어 끝(프로그램)까지 읽힘(${info.scroll.ch}/${info.scroll.sh}px)`);
        ok(info.back.w >= 48 && info.back.h >= 48 && info.back.r <= info.vw && info.back.b <= info.vh && info.back.y >= 0, `${tag}: '돌아가기'가 화면 안, ${Math.round(info.back.w)}×${Math.round(info.back.h)}px`);
        ok(info.smallTargets.length === 0, `${tag}: 누르는 것 모두 48px 이상` + (info.smallTargets.length ? ' — ' + info.smallTargets.join(', ') : ''));
      }
      // 돌아가기와 Esc
      await g.page.evaluate(() => window.__credits.open(1));
      await g.page.click('.credits-back');
      let st = await g.page.evaluate(() => ({ calls: window.__credits.goCalls, left: !!document.querySelector('.credits') }));
      ok(st.calls.length === 1 && st.calls[0][0] === 'start' && !st.left, `${vpName}: '돌아가기'가 go('start')를 부르고 화면을 치움`);
      await g.page.evaluate(() => window.__credits.open(1));
      await g.page.keyboard.press('Escape');
      await g.page.keyboard.press('Escape');   // 치운 뒤에는 다시 부르지 않는다
      st = await g.page.evaluate(() => ({ calls: window.__credits.goCalls, left: !!document.querySelector('.credits') }));
      ok(st.calls.length === 2 && !st.left, `${vpName}: Esc도 돌아가고, 치운 뒤에는 다시 부르지 않음`);
      // 음성 사례: 화면에서 갈래 하나를 지우면 잡는다
      await g.page.evaluate(() => window.__credits.open(1));
      const cut = await g.page.evaluate(() => { document.querySelector('[data-section="voice"]').remove(); return [...document.querySelectorAll('.credits-section')].map((s) => s.dataset.section); });
      ok(missingSections(cut).join() === 'voice', `${vpName}: 음성 사례 — 화면에서 지운 갈래(낭송)를 잡는다`);
      externalAll.push(...g.external);
      errorsAll.push(...g.errors);
    } finally { await g.close(); }
  }

  console.log('\n[3] 앱 흐름: 시작 화면 → 출처 → 돌아가기');
  {
    const g = await openGame(server.url, { path: 'tests/pages/credits-app.html', viewport: VIEWPORTS.chromebook });
    try {
      await g.page.waitForSelector('.story-open-credits', { timeout: 20000 });
      ok(true, "시작 화면에 '출처' 문이 보임");
      await g.page.click('.story-open-credits');
      await g.page.waitForSelector('.credits [data-section="code"]');
      ok(await g.page.locator('.story-start').count() === 0, '출처 화면이 시작 화면을 대신함');
      await g.page.waitForFunction(() => document.querySelectorAll('.credits-music .credits-item').length > 0);
      ok(true, '앱 안에서도 쓴 곡 목록을 자산 목록에서 채움');
      await g.page.click('.credits-back');
      await g.page.waitForSelector('.story-start');
      ok(await g.page.locator('.credits').count() === 0, "'돌아가기'로 시작 화면에 돌아옴");
      externalAll.push(...g.external);
      errorsAll.push(...g.errors);
    } finally { await g.close(); }
  }
} catch (e) {
  ok(false, '브라우저 점검 실패 — ' + e.message);
} finally {
  await server.close();
}
console.log('\n[4] 콘솔과 요청');
ok(externalAll.length === 0, '바깥 주소 요청 없음' + (externalAll.length ? ' — ' + externalAll.slice(0, 3).join(', ') : ''));
ok(errorsAll.length === 0, '콘솔 오류 없음' + (errorsAll.length ? ' — ' + errorsAll.slice(0, 3).join(' | ') : ''));

console.log(failures ? `\n실패 ${failures}건` : '\n모두 통과');
process.exit(failures ? 1 : 0);
