import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:3000';
const ts = Date.now().toString(36);
const userA = 'e2eA_' + ts;
const userB = 'e2eB_' + ts;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  [' + extra + ']' : '')); }
};
const setNative = (page, selector, value) => page.evaluate(({ selector, value }) => {
  const el = document.querySelector(selector);
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}, { selector, value });
const clickBtn = (page, text) => page.evaluate((t) => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t || b.textContent.trim().startsWith(t));
  if (!btn) return false;
  btn.click();
  return true;
}, text);
const termText = (page) => page.evaluate(() => [...document.querySelectorAll('.term') , ...document.querySelectorAll('.term-out, .term-err, .term-cmd')].flatMap((e) => []).concat([...document.querySelectorAll('.term-out, .term-err, .term-cmd')]).map((e) => e.textContent.trim()).filter(Boolean));

const httpErrors = [];
const pageErrors = [];
async function makeUser(context, username) {
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(username + ': ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => pageErrors.push(username + ' pageerror: ' + e.message));
  page.on('response', async (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) {
      let body = '';
      try { body = (await r.text()).slice(0, 150); } catch {}
      httpErrors.push(username + ' ' + r.status() + ' ' + r.url().replace(BASE, '') + ' ' + body);
    }
  });
  await page.goto(BASE + '/auth', { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  const linkBtn = await page.$('.link-btn');
  if (linkBtn) { await linkBtn.click(); await sleep(400); }
  const inputs = await page.$$('.auth-card input');
  if (inputs.length >= 2) {
    await inputs[0].click();
    await inputs[0].type(username, { delay: 2 });
    await inputs[1].type('secret123', { delay: 2 });
  }
  await page.click('.auth-card button[type="submit"]');
  await sleep(1500);
  const token = await page.evaluate(() => localStorage.getItem('cs2co_token'));
  if (!token) throw new Error('registration failed for ' + username);
  return page;
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
const ctxA = await browser.createBrowserContext();
const ctxB = await browser.createBrowserContext();
const pageA = await makeUser(ctxA, userA);
const pageB = await makeUser(ctxB, userB);
console.log('users ready:', userA, userB);

// ---------- 1. BOT BATTLE WITH DUPLICATES + REPLAY ----------
await pageA.goto(BASE + '/battles', { waitUntil: 'domcontentloaded' });
await sleep(1200);
check('battles page: create tab', await clickBtn(pageA, 'Create battle'));
await sleep(500);
const picked = await pageA.evaluate(() => {
  const btns = [...document.querySelectorAll('.case-pick-btn')];
  if (!btns.length) return false;
  btns[0].click();
  btns[0].click();
  return true;
});
await sleep(300);
check('case picked twice (duplicates allowed)', picked && await pageA.$eval('.case-pick-count', (el) => el.textContent.trim() === '2'));
await pageA.evaluate(() => {
  const radios = [...document.querySelectorAll('input[name="opp"]')];
  if (radios[1]) radios[1].click();
});
await sleep(200);
await clickBtn(pageA, 'Battle the bot');
await sleep(3000);
const replayState = await pageA.evaluate(() => {
  const verdict = document.querySelector('.replay-verdict');
  const totals = [...document.querySelectorAll('.replay-total')].map((t) => t.textContent.trim());
  const rounds = document.querySelectorAll('.battle-round').length;
  return { verdict: verdict ? verdict.textContent.trim() : null, totals, rounds };
});
check('bot battle replay verdict', !!replayState.verdict, JSON.stringify(replayState));
check('bot battle 2 rounds', replayState.rounds === 2, 'rounds=' + replayState.rounds);
check('replay totals rendered', replayState.totals.length === 2 && /\$/.test(replayState.totals[0]), JSON.stringify(replayState.totals));
check('verdict win/lose/draw', /won|lost|Draw/i.test(replayState.verdict ?? ''), replayState.verdict ?? '');

// ---------- 2. INBOX ----------
await pageA.goto(BASE + '/inbox', { waitUntil: 'domcontentloaded' });
await sleep(1200);
const inbox = await pageA.evaluate(() => {
  const items = [...document.querySelectorAll('.inbox-item')];
  return {
    count: items.length,
    hasBattle: items.some((i) => i.textContent.includes('Bot battle finished')),
    hasViewBtn: [...document.querySelectorAll('.inbox-item button')].some((b) => b.textContent.includes('View battle')),
  };
});
check('inbox battle notification', inbox.hasBattle, JSON.stringify(inbox));
check('inbox notification interactive (View battle)', inbox.hasViewBtn);
await pageA.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await sleep(1000);
const badge = await pageA.$eval('.bell-badge', (el) => el.textContent.trim()).catch(() => null);
check('navbar inbox badge', badge != null && Number(badge) >= 1, 'badge=' + badge);
await pageA.goto(BASE + '/inbox', { waitUntil: 'domcontentloaded' });
await sleep(1000);
await clickBtn(pageA, 'View battle');
await sleep(4000); // replay auto-plays 2 rounds before verdict
check('View battle deep-links to replay', pageA.url().includes('/battles') && !!(await pageA.$('.replay-verdict')), pageA.url());

// ---------- 3. FRIENDS + GIFT + TRADE ----------
await pageA.goto(BASE + '/friends', { waitUntil: 'domcontentloaded' });
await sleep(1200);
check('friend input accepts username', await setNative(pageA, 'input[placeholder="username"]', userB));
await sleep(200);
await clickBtn(pageA, 'Add friend');
await sleep(800);
await pageB.goto(BASE + '/friends', { waitUntil: 'domcontentloaded' });
await sleep(1500);
check('B accepts friend request', await clickBtn(pageB, 'Accept'));
await sleep(1500);
const bAfterAccept = await pageB.evaluate(() => ({
  err: document.querySelector('.form-error')?.textContent ?? null,
  friends: [...document.querySelectorAll('.friend-name')].map((e) => e.textContent.trim()),
}));
console.log('DBG B after accept:', JSON.stringify(bAfterAccept));
// A's friends list polls every 5s; wait for the refetch
await sleep(6500);
const friends = await pageA.evaluate(() => [...document.querySelectorAll('.friend-name')].map((e) => e.textContent.trim()));
check('A sees friend B', friends.some((f) => f.toLowerCase() === userB.toLowerCase()), friends.join(','));
// give A 2+ items via API so gift + trade + bulk sell have content
const openCases = await pageA.evaluate(async () => {
  const tok = localStorage.getItem('cs2co_token');
  const res = await fetch('/api/cases', { headers: { Authorization: 'Bearer ' + tok } });
  const j = await res.json();
  const cheap = (j.items || []).filter((x) => x.cost_cents != null && x.cost_cents < 300);
  let n = 0;
  for (const c of cheap.slice(0, 2)) {
    await fetch('/api/cases/' + c.id + '/open', { method: 'POST', headers: { Authorization: 'Bearer ' + tok } });
    n++;
  }
  return n;
});
await sleep(1500);
check('A has items for social tests', openCases === 2, 'opened=' + openCases);
// reload so the inventory query picks up the freshly opened items
await pageA.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await sleep(1500);
check('gift picker opens', await clickBtn(pageA, '🎁 Gift') && !!(await pageA.$('.picker-item')));
if (await pageA.$('.picker-item')) {
  await (await pageA.$$('.picker-item'))[0].click();
  await sleep(1500);
}
console.log('DBG A after gift click:', await pageA.evaluate(() => ({
  err: document.querySelector('.form-error')?.textContent ?? null,
  pickerOpen: !!document.querySelector('.item-picker'),
})));
await pageB.goto(BASE + '/inbox', { waitUntil: 'domcontentloaded' });
await sleep(1200);
const bInboxItems = await pageB.evaluate(() => [...document.querySelectorAll('.inbox-item')].map((i) => i.textContent.trim().slice(0, 80)));
console.log('DBG B inbox:', JSON.stringify(bInboxItems));
check('B received gift notification', bInboxItems.some((t) => /gift|sent you/i.test(t)), JSON.stringify(bInboxItems));
await pageA.goto(BASE + '/friends', { waitUntil: 'domcontentloaded' });
await sleep(1500);
check('trade modal opens', await clickBtn(pageA, '🔄 Trade') && !!(await pageA.$('.trade-modal')));
await sleep(1000);
const myCell = await pageA.$('.trade-col .trade-cell');
if (myCell) { await myCell.click(); await sleep(500); }
await clickBtn(pageA, 'Send trade offer');
await sleep(1500);
console.log('DBG A after trade send:', await pageA.evaluate(() => ({
  err: document.querySelector('.form-error')?.textContent ?? null,
  modalOpen: !!document.querySelector('.trade-modal'),
})));
await pageB.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await sleep(1500);
await pageB.goto(BASE + '/friends', { waitUntil: 'domcontentloaded' });
await sleep(1500);
const pendingTrades = await pageB.evaluate(() => [...document.querySelectorAll('.trade-row')].length);
check('B sees pending trade', pendingTrades >= 1, 'rows=' + pendingTrades);
const tradeAccept = await pageB.evaluate(() => {
  const row = [...document.querySelectorAll('.trade-row')].find((r) => r.querySelector('button'));
  const btn = row && [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Accept');
  if (!btn) return false;
  btn.click();
  return true;
});
check('B accepts trade', tradeAccept);
await sleep(1000);
// A gifted one item and traded one away; open 2 more for the bulk-sell test
await pageA.evaluate(async () => {
  const tok = localStorage.getItem('cs2co_token');
  const res = await fetch('/api/cases', { headers: { Authorization: 'Bearer ' + tok } });
  const j = await res.json();
  const cheap = (j.items || []).filter((x) => x.cost_cents != null && x.cost_cents < 300);
  for (const c of cheap.slice(0, 2)) {
    await fetch('/api/cases/' + c.id + '/open', { method: 'POST', headers: { Authorization: 'Bearer ' + tok } });
  }
});
await sleep(500);

// ---------- 4. INVENTORY BULK SELL ----------
await pageA.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' });
await sleep(1500);
await clickBtn(pageA, 'Select items');
await sleep(500);
const cells = await pageA.$$('.inv-cell');
if (cells.length >= 2) {
  await cells[0].click();
  await cells[1].click();
  await sleep(500);
}
const bulkBar = await pageA.$eval('.bulk-bar', (el) => el.textContent.trim()).catch(() => null);
check('bulk bar shows selection', bulkBar != null && bulkBar.includes('2') && /\$/.test(bulkBar), bulkBar ?? 'no bulk bar');
await clickBtn(pageA, 'Sell all');
await sleep(1500);
const toast = await pageA.$eval('.toast-ok', (el) => el.textContent.trim()).catch(() => null);
check('bulk sell toast', toast != null && /Sold 2/.test(toast), toast ?? '');

// ---------- 5. LEADERBOARD SORT ----------
await pageA.goto(BASE + '/leaderboard', { waitUntil: 'domcontentloaded' });
await sleep(1200);
const sortClicked = await clickBtn(pageA, 'Best drop');
await sleep(800);
const rows = await pageA.evaluate(() => document.querySelectorAll('.table tbody tr').length);
check('leaderboard sort tabs', sortClicked && rows > 0, 'rows=' + rows);

// ---------- 6. ADMIN ----------
await pageA.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
await sleep(1500);
check('admin gate shown', !!(await pageA.$('.admin-gate input')));
let tabs = [];
let unlockInfo = null;
for (let attempt = 0; attempt < 3 && !tabs.includes('console'); attempt++) {
  const gi = await pageA.$('.admin-gate input');
  if (!gi) break;
  await gi.click();
  await gi.type('hola67', { delay: 5 });
  await sleep(300);
  const resP = pageA.waitForResponse((r) => r.url().includes('/api/admin/unlock') && r.request().method() === 'POST', { timeout: 8000 }).catch(() => null);
  await pageA.evaluate(() => {
    const b = document.querySelector('.admin-gate button');
    if (b) b.click();
  });
  const res = await resP;
  unlockInfo = res ? { status: res.status(), body: (await res.text().catch(() => '')).slice(0, 120) } : { status: 'no-response' };
  await sleep(3000);
  tabs = await pageA.evaluate(() => [...document.querySelectorAll('.tabs .tab')].map((t) => t.textContent.trim()));
}
console.log('DBG admin unlock:', JSON.stringify(unlockInfo), 'tabs:', JSON.stringify(tabs));
check('admin panel unlocked', tabs.includes('console'), tabs.join(','));
// wait for the password panel (depends on stats query)
let pwReady = false;
for (let i = 0; i < 10 && !pwReady; i++) {
  pwReady = !!(await pageA.$('.pw-row input'));
  if (!pwReady) await sleep(500);
}
check('admin password form rendered', pwReady);
if (pwReady) {
  // verify a candidate password actually unlocks the admin panel (node-side, no browser)
  const unlockStatus = async (pw) => {
    const r = await fetch(BASE + '/api/admin/unlock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    return r.status;
  };
  const changePw = async (cur, npw) => {
    await setNative(pageA, '.pw-row input:nth-child(1)', cur);
    await setNative(pageA, '.pw-row input:nth-child(2)', npw);
    await sleep(250);
    const vals = await pageA.evaluate(() => [...document.querySelectorAll('.pw-row input')].map((i) => i.value));
    if (vals[0] !== cur || vals[1] !== npw) return { ok: false, vals };
    await clickBtn(pageA, 'Change password');
    await sleep(1200);
    return { ok: true, vals };
  };
  const c1 = await changePw('hola67', 'hola67x');
  check('admin password change works', c1.ok && (await unlockStatus('hola67x')) === 200, JSON.stringify(c1));
  // always restore the default password so the suite never locks itself out
  await changePw('hola67x', 'hola67');
  const restored = (await unlockStatus('hola67')) === 200;
  check('admin password restored to default', restored);
  if (!restored) console.log('WARNING: admin password is NOT hola67 - reset it via the DB before rerunning!');
}
// console commands
await clickBtn(pageA, 'console');
await sleep(1000);
const runCmd = async (cmd) => {
  const inp = await pageA.$('.term-field');
  if (!inp) return;
  await inp.click();
  await pageA.keyboard.type(cmd, { delay: 8 });
  await pageA.keyboard.press('Enter');
  await sleep(900);
};
const caseName = await pageA.evaluate(async () => {
  const tok = localStorage.getItem('cs2co_token');
  const res = await fetch('/api/cases', { headers: { Authorization: 'Bearer ' + tok } });
  const j = await res.json();
  return (j.items || [])[0]?.name ?? 'case';
});
await runCmd('/users');
await runCmd('/top');
await runCmd('/search knife');
await runCmd('/caseinfo ' + caseName);
await runCmd('/tx ' + userA);
await runCmd('/help');
const term = await termText(pageA);
check('admin /users lists A', term.some((l) => l.includes(userA)), '');
check('admin /top output', term.some((l) => /openings/.test(l)));
check('admin /search knife output', term.some((l) => /knife|no items/i.test(l)));
check('admin /caseinfo output', term.some((l) => /cost:/.test(l)));
check('admin /tx output', term.some((l) => /\+|\(|purchase|sale|no transactions/i.test(l)));
check('admin /help output', term.some((l) => /\/(stats|audit|users)/.test(l)));

console.log('\nDBG http errors:', JSON.stringify(httpErrors.slice(0, 10)));
console.log('DBG page errors:', JSON.stringify(pageErrors.slice(0, 5)));
await browser.close();
console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
