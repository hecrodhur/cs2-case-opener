import puppeteer from 'puppeteer-core';

const FRONT = 'http://localhost:8090';
const API = 'http://localhost:3000';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  [' + extra + ']' : ''));
};

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const apiResponses = [];
page.on('response', (r) => {
  if (r.url().includes('/api/')) apiResponses.push({ status: r.status(), url: r.url().split('?')[0], method: r.request().method() });
});

// 1. SPA loads from the static origin
await page.goto(FRONT + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));
const title = await page.title();
check('SPA loads from static origin', title.length > 0, title);

// 2. register through the UI (cross-origin POST + preflight)
const username = 'cors_' + Date.now().toString(36);
const setNative = (sel, value) => page.evaluate(({ sel, value }) => {
  const el = document.querySelector(sel);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, { sel, value });

// click the login link in the navbar (client-side nav to /auth)
await page.evaluate(() => {
  const a = [...document.querySelectorAll('a,button')].find((x) => /log ?in|sign ?in/i.test(x.textContent));
  a && a.click();
});
await new Promise((r) => setTimeout(r, 800));
const regTab = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.auth-card button')].find((x) => /register|sign ?up/i.test(x.textContent));
  if (b) { b.click(); return true; }
  return false;
});
await new Promise((r) => setTimeout(r, 400));
const nInputs = await page.$$eval('.auth-card input', (els) => els.length);
if (nInputs >= 2) {
  await page.evaluate((u) => {
    const els = document.querySelectorAll('.auth-card input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(els[0], u);
    els[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(els[1], 'secret123');
    els[1].dispatchEvent(new Event('input', { bubbles: true }));
  }, username);
}
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.auth-card button')].find((x) => x.type === 'submit' || /register|create/i.test(x.textContent));
  b && b.click();
});
await new Promise((r) => setTimeout(r, 2500));

const meUser = await page.evaluate(() => window.localStorage.getItem('cs2co_token'));
check('register succeeded (token stored)', Boolean(meUser));

// 3. cross-origin GET /api/auth/me with Bearer (verify via API response list)
const meRes = apiResponses.filter((r) => r.url.endsWith('/api/auth/me'));
check('cross-origin GET /api/auth/me 200', meRes.some((r) => r.status === 200), JSON.stringify(meRes.slice(-2)));

// 4. SSE connection from cross-origin (EventSource to :3000)
const sse = apiResponses.filter((r) => r.url.endsWith('/api/realtime'));
check('cross-origin SSE /api/realtime 200', sse.some((r) => r.status === 200), JSON.stringify(sse.slice(-1)));

// 5. no 4xx/5xx on /api from the browser (excluding the expected pre-login 401 /me)
const bad = apiResponses.filter((r) => r.status >= 400 && !(r.status === 401 && r.url.endsWith('/api/auth/me') && r.method === 'GET'));
check('no unexpected API errors', bad.length === 0, JSON.stringify(bad.slice(0, 5)));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\nRESULT: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
