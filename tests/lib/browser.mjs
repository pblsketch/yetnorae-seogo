// 점검용 브라우저 도우미. 설치된 Chrome을 쓰고, 바깥 주소 요청과 콘솔 오류를 모은다.
import { chromium } from 'playwright';

export const VIEWPORTS = {
  phone: { width: 844, height: 390 },      // 휴대폰 가로
  chromebook: { width: 1366, height: 768 },
  tablet: { width: 1180, height: 820 },
};

// options.disable3d: 3D(WebGL)를 끈 브라우저로 2D 그림 판을 강제한다(제품에는 입구가 없다).
// options.seed: 페이지가 열리기 전에 로컬 저장소에 넣을 { key: value } (점검 도구 전용 상태 주입).
export async function openGame(baseUrl, options = {}) {
  const args = options.disable3d ? ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ channel: 'chrome', headless: options.headless !== false, args });
  const context = await browser.newContext({ viewport: options.viewport ?? VIEWPORTS.chromebook, hasTouch: !!options.touch, acceptDownloads: true });
  const external = [];
  const errors = [];
  context.on('request', (req) => { const u = req.url(); if (!u.startsWith(baseUrl) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
  if (options.seed) {
    await context.addInitScript((seed) => {
      if (sessionStorage.getItem('__seeded')) return;
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      sessionStorage.setItem('__seeded', '1');
    }, options.seed);
  }
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(baseUrl + (options.path ?? ''));
  return { browser, context, page, external, errors, close: () => browser.close() };
}

export function assert(cond, msg) {
  if (!cond) throw new Error('✗ ' + msg);
  console.log('✓ ' + msg);
}
