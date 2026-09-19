import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:3000';
const username = 'cdp_' + Date.now().toString(36);

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
page.on('dialog', (d) => d.accept().catch(() => {}));

// 1. register via UI
await page.goto(BASE + '/auth', { waitUntil: 'networkidle0' });
await page.click('.link-btn'); // switch to register mode
await new Promise((r) => setTimeout(r, 200));
const inputs = await page.$$('.auth-card input');
if (inputs.length >= 2) {
  await inputs[0].click();
  await inputs[0].type(username, { delay: 5 });
  await inputs[1].type('secret123', { delay: 5 });
}
await page.click('.auth-card button[type="submit"]');
await page.waitForNetworkIdle().catch(() => {});
await new Promise((r) => setTimeout(r, 800));

let me = await page.evaluate(() => localStorage.getItem('cs2co_token'));
if (!me) {
  const err = await page.$eval('.form-error', (el) => el.textContent).catch(() => 'no error box');
  console.log('register failed, form error:', err);
  process.exit(1);
}
console.log('token after register: yes');

// 2. go to an affordable case (find one via API)
const cases = await page.evaluate(async () => {
  const t = localStorage.getItem('cs2co_token');
  const r = await fetch('/api/cases?limit=200', { headers: { Authorization: 'Bearer ' + t } });
  return (await r.json()).items;
});
const affordable = cases.filter((c) => c.cost_cents && Number(c.cost_cents) <= 2000);
affordable.sort((a, b) => Number(a.cost_cents) - Number(b.cost_cents));
const target = affordable[0];
console.log('opening case:', target.id, target.name, target.cost_cents);

await page.goto(BASE + '/case/' + target.id, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 600));

// 3. click open
const openBtn = await page.$('button.btn-primary');
if (!openBtn) throw new Error('open button not found');
await openBtn.click();

// 4. reel should appear
await page.waitForSelector('.reel', { timeout: 8000 });
console.log('reel: mounted');
await new Promise((r) => setTimeout(r, 500));
const stripTransform = await page.$eval('.reel-strip', (el) => getComputedStyle(el).transform);
console.log('strip mid-spin transform:', stripTransform.slice(0, 40));

// 5. wait for result card (Collect)
await page.waitForSelector('.result-card', { timeout: 20000 });
const resultTitle = await page.$eval('.result-title', (el) => el.textContent);
console.log('RESULT:', resultTitle);
const finalTransform = await page.$eval('.reel-strip', (el) => getComputedStyle(el).transform).catch(() => 'n/a');
console.log('strip final transform:', String(finalTransform).slice(0, 40));

// 6. collect (click the Collect button by text)
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.result-actions button')];
  const collect = btns.find((b) => b.textContent.trim() === 'Collect');
  if (!collect) throw new Error('collect button not found');
  collect.click();
});
await new Promise((r) => setTimeout(r, 1000));
console.log('reel gone after collect:', (await page.$('.reel')) === null);

// 7. inventory count + inspect modal
await page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 800));
const invCount = await page.$eval('.inv-summary span', (el) => el.textContent).catch(() => 'n/a');
console.log('inventory summary:', invCount);
const invCard = await page.$('.inv-cell .item-card');
if (invCard) {
  await invCard.click();
  await page.waitForSelector('.inspect', { timeout: 4000 });
  const inspectName = await page.$eval('.inspect-name', (el) => el.textContent);
  console.log('inspect modal:', inspectName.trim());
  await page.click('.inspect .modal-close');
  await new Promise((r) => setTimeout(r, 300));
}
// 8. admin console page loads (login gate visible for non-admin)
await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 500));
const adminGate = await page.$eval('.page-error', (el) => el.textContent).catch(() => 'n/a');
console.log('admin gate for non-admin:', adminGate);

// 401 = pre-login probe of /api/auth/me (by design)
const realErrors = errors.filter((e) => !/favicon|404|401|ERR_ABORTED/.test(e));
console.log('js errors:', realErrors.length ? realErrors : 'none');

await browser.close();
process.exit(realErrors.length ? 1 : 0);
