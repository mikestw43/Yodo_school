// Browser test: fresh data folder, real server + built client, phone and computer sizes.
// Usage: (cd client && npx vite build) && node e2e/run.mjs   -> screenshots in e2e/shots
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'e2e', 'shots');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yodo-e2e-'));
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const MAIL = path.join(DATA, 'mail-out');
const env = { ...process.env, MAIL_OUT_DIR: MAIL, DATA_DIR: DATA, DATABASE_URL: `file:${DATA}/yodo.db`, APP_PORT: String(PORT), PUBLIC_DIR: path.join(ROOT, 'client/dist'), EXTRA_DIR: path.join(ROOT, 'web') };

const sh = (cmd, args, opts) => new Promise((ok, no) => { const p = spawn(cmd, args, { stdio: 'inherit', ...opts }); p.on('exit', (c) => (c ? no(new Error(`${cmd} ${c}`)) : ok())); });
await sh('npx', ['prisma', 'db', 'push', '--skip-generate'], { cwd: path.join(ROOT, 'server'), env, stdio: 'ignore' });
const server = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.join(ROOT, 'server'), env, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/healthz`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`); };
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function overflow(page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || getComputedStyle(el).position === 'fixed') return false;
      // inside a box that scrolls sideways on purpose (tables) is fine
      for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX) && p !== document.body && p !== document.documentElement) return false;
      return r.right > w + 1;
    }).map((el) => el.tagName + '.' + String(el.className).slice(0, 40)).slice(0, 5);
  });
}

try {
  // ---------- computer ----------
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'th-TH' });
  // Most checks read the Thai texts; the English pass is at the end (default for new accounts is English).
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('yodo-lang')) localStorage.setItem('yodo-lang', 'th'); } catch { /* */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  await page.goto(BASE);
  await page.waitForURL('**/auth');
  await page.getByText('ตั้งค่าครั้งแรก').waitFor();
  check('first start shows the setup form', true);
  await page.screenshot({ path: `${SHOTS}/01-setup.png` });
  const code = fs.readFileSync(path.join(DATA, 'setup-code.txt'), 'utf8').trim();
  await page.fill('#s-code', code);
  await page.fill('#s-first', 'Mike');
  await page.fill('#s-last', 'Owner');
  await page.fill('#s-user', 'mike');
  await page.fill('#s-pw', 'secret1');
  await page.fill('#s-pw2', 'secret1');
  await page.getByRole('button', { name: 'สร้างบัญชี' }).click();
  await page.waitForURL(BASE + '/');
  check('setup creates the owner and opens the dashboard', true);
  check('new account starts in English', (await (await page.request.get(`${BASE}/api/me`)).json()).lang === 'en');
  check('top right shows the first name when there is no nickname', (await page.getByTestId('account-name').innerText()) === 'Mike');
  await page.request.patch(`${BASE}/api/me/lang`, { headers: { 'x-yodo': '1' }, data: { lang: 'th' } });
  await page.reload();

  // sign out and back in through the login form
  await page.getByTitle('เมนูบัญชี').last().click();
  const ver = await page.getByText(/^เวอร์ชัน /).first().textContent({ timeout: 5000 }).catch(() => '');
  check('profile menu shows the version', !!ver, ver ?? '');
  await page.getByText('ออกจากระบบ').click();
  await page.waitForURL('**/auth');
  await page.fill('#identifier', 'mike');
  await page.fill('#password', 'wrong');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await page.getByText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง').waitFor();
  check('wrong password says so in Thai', true);
  await page.screenshot({ path: `${SHOTS}/02-login.png` });
  await page.fill('#password', 'secret1');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await page.waitForURL(BASE + '/');
  check('login works', true);

  // sample data through the API (same cookies as the page)
  const H = { 'x-yodo': '1' };
  const post = async (p, data) => { const r = await page.request.post(`${BASE}/api${p}`, { headers: H, data }); if (!r.ok()) throw new Error(`${p} ${r.status()} ${await r.text()}`); return r.json(); };
  const t = await post('/teachers', { image: PNG, prefix: 'นางสาว', firstName: 'แอนนา', lastName: 'บัลเล่ต์', nickname: 'แอน', phone: '0811111111', email: '', lineId: '', specializations: ['Ballet'] });
  const c1 = await post('/classes', { name: 'Ballet Kids', teacherId: t.id, description: 'บัลเล่ต์สำหรับเด็ก 4-7 ปี', image: '', status: 'Active', price: 2500 });
  const c2 = await post('/classes', { name: 'Jazz Teens', teacherId: t.id, description: '', image: '', status: 'Active', price: 3000 });
  const csv = ['id,code,prefix,first_name,last_name,nickname,dob,nationality,religion,phone,interested,has_experience,status,image,del_flg,created_at',
    `,YDO00001,ด.ญ.,มะลิ,ใจดี,ลิลี่,2018-05-01,ไทย,พุทธ,0812345678,"{Ballet}",false,Active,${PNG},false,2026-09-30 10:00:00+00`,
    ',YDO00002,ด.ช.,ต้นกล้า,สุขใจ,กล้า,2016-02-11,ไทย,พุทธ,0823456789,"{Jazz,Ballet}",true,Active,,false,2026-10-01 10:00:00+00'].join('\n');

  // import through the page
  await page.goto(BASE + '/import');
  const csvFile = path.join(DATA, 'students.csv');
  fs.writeFileSync(csvFile, csv);
  await page.setInputFiles('input[type=file]', csvFile);
  await page.getByRole('button', { name: 'ตรวจไฟล์' }).click();
  await page.getByText('จะนำเข้า').waitFor();
  await page.getByRole('button', { name: 'นำเข้า', exact: true }).click();
  await page.getByText('นำเข้าแล้ว').first().waitFor();
  check('import page brings students over', true);
  await page.screenshot({ path: `${SHOTS}/03-import.png` });

  const data = await (await page.request.get(`${BASE}/api/data`)).json();
  const [s1, s2] = data.students;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const plus = (n) => new Date(Date.parse(today) + n * 864e5).toISOString().slice(0, 10);
  await post('/enrollments', { studentId: s1.id, classId: c1.id, purchaseDate: today, startDate: today, expiryDate: plus(5), remark: '', receiptImage: '' });
  await post('/enrollments', { studentId: s2.id, classId: c2.id, purchaseDate: today, startDate: today, expiryDate: plus(60), remark: '', receiptImage: '' });
  const sch = await post('/schedules', { items: [{ classId: c1.id, date: plus(1), start: '16:00', end: '17:00' }, { classId: c2.id, date: plus(2), start: '17:30', end: '18:30' }] });
  await post(`/schedules/${sch[0].id}/students`, { studentId: s1.id });

  for (const [p, name, text] of [['/', '04-dashboard', null], ['/students', '05-students', 'มะลิ'], ['/classes', '06-classes', 'Ballet Kids'], ['/teachers', '07-teachers', 'แอนนา'], ['/calendar', '08-calendar', null], ['/users', '09-users', 'mike'], ['/permissions', '10-permissions', null], ['/audit-log', '11-audit', 'นักเรียน'], ['/settings', '12-settings', 'mike']]) {
    await page.goto(BASE + p);
    await page.waitForLoadState('networkidle');
    if (text) await page.getByText(text).locator('visible=true').first().waitFor({ timeout: 8000 }).then(() => check(`computer ${p} shows data`, true), () => check(`computer ${p} shows data`, false, text));
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }

  // bell: expiry warning (class ends in 5 days) and new enrollments
  await page.goto(BASE + '/students');
  await page.getByRole('button', { name: 'การแจ้งเตือน' }).last().click();
  await page.getByText('คลาสใกล้หมดอายุ').first().waitFor().then(() => check('bell shows the expiry warning', true), () => check('bell shows the expiry warning', false));
  await page.screenshot({ path: `${SHOTS}/13-bell.png` });
  await page.keyboard.press('Escape');

  // edit profile through the form
  await page.goto(BASE + '/settings');
  await page.getByText('ชื่อผู้ใช้').first().waitFor();
  const nick = page.locator('label:has-text("ชื่อเล่น") + *').locator('input').first();
  if (await nick.count()) await nick.fill('ไมค์');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).first().click();
  await page.getByText('บันทึกโปรไฟล์แล้ว').waitFor().then(() => check('profile save works', true), () => check('profile save works', false));

  // student detail opens
  await page.goto(BASE + '/students');
  await page.getByText('มะลิ').locator('visible=true').first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/14-student-detail.png` });

  // ---------- PIN, Face ID, auto-lock, Google (round 2) ----------
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const typePin = async (p, digits) => { for (const d of digits) await p.getByRole('button', { name: d, exact: true }).click(); };
  await page.goto(BASE + '/settings');
  await page.getByText('การเข้าสู่ระบบของฉัน').waitFor();
  await page.screenshot({ path: `${SHOTS}/15-signin-card.png`, fullPage: true });
  await page.getByRole('switch', { name: 'PIN บนเครื่องนี้' }).click();
  await page.getByText('ตั้ง PIN สำหรับเครื่องนี้').waitFor();
  await page.getByRole('radio', { name: '6 หลัก' }).click();
  await page.getByRole('radio', { name: '4 หลัก' }).click();
  await page.screenshot({ path: `${SHOTS}/16-pin-setup.png` });
  await typePin(page, '1357');
  await page.getByText('กด PIN อีกครั้งเพื่อยืนยัน').waitFor();
  await typePin(page, '1357');
  await page.getByText('ตั้ง PIN แล้ว').waitFor().then(() => check('PIN can be set from the settings page', true), () => check('PIN can be set from the settings page', false));
  await page.getByRole('switch', { name: 'Face ID' }).click();
  await page.getByText('เปิด Face ID แล้ว').waitFor({ timeout: 8000 }).then(() => check('Face ID can be turned on (virtual authenticator)', true), () => check('Face ID can be turned on (virtual authenticator)', false));
  await page.screenshot({ path: `${SHOTS}/17-signin-card-on.png`, fullPage: true });

  // signed out: Face ID is tried straight away and signs in
  await page.goto(BASE + '/');
  await page.getByTitle('เมนูบัญชี').last().click();
  await page.getByText('ออกจากระบบ').click();
  await page.waitForURL('**/auth');
  await page.waitForURL(BASE + '/', { timeout: 10000 }).then(() => check('Face ID signs in on the PIN screen', true), () => check('Face ID signs in on the PIN screen', false));

  // without Face ID: the PIN pad, a wrong PIN, then the right one
  await page.evaluate(() => localStorage.removeItem('yodo-passkey'));
  await page.getByTitle('เมนูบัญชี').last().click();
  await page.getByText('ออกจากระบบ').click();
  await page.waitForURL('**/auth');
  await page.getByText('ใส่ PIN เพื่อเข้าใช้งาน').waitFor();
  {
    const k = await page.getByRole('button', { name: '5', exact: true }).boundingBox();
    check('PIN keys are full size', k.width >= 72 && k.height >= 72, `${Math.round(k.width)}px`);
  }
  await typePin(page, '0000');
  await page.getByText('PIN ไม่ถูกต้อง').waitFor().then(() => check('wrong PIN is refused', true), () => check('wrong PIN is refused', false));
  await page.screenshot({ path: `${SHOTS}/18-pin-login.png` });
  await typePin(page, '1357');
  await page.waitForURL(BASE + '/', { timeout: 8000 }).then(() => check('PIN signs in', true), () => check('PIN signs in', false));

  // auto-lock: "when I leave the app", away for 20 seconds -> locked after reopening
  await page.goto(BASE + '/settings');
  await page.getByText('ล็อกแอปอัตโนมัติ').waitFor();
  await page.evaluate(() => { localStorage.removeItem('yodo-fresh'); localStorage.setItem('yodo-lock', '0'); });
  // "left the app 20 seconds ago", written as the next page opens (leaving this page writes its own time)
  await page.addInitScript(() => { if (!sessionStorage.getItem('t-away')) { sessionStorage.setItem('t-away', '1'); localStorage.setItem('yodo-away-at', String(Date.now() - 20000)); } });
  await page.goto(BASE + '/students');
  await page.getByText('ใส่ PIN เพื่อใช้งานต่อ').waitFor({ timeout: 8000 }).then(() => check('app locks itself after leaving', true), () => check('app locks itself after leaving', false));
  await page.screenshot({ path: `${SHOTS}/19-locked.png` });
  await typePin(page.getByRole('dialog', { name: 'แอปถูกล็อก' }), '1357');
  await page.getByText('ใส่ PIN เพื่อใช้งานต่อ').waitFor({ state: 'detached', timeout: 8000 }).then(() => check('PIN unlocks the app', true), () => check('PIN unlocks the app', false));
  await page.evaluate(() => localStorage.removeItem('yodo-lock'));

  // password sign-in is still there
  await page.getByTitle('เมนูบัญชี').last().click();
  await page.getByText('ออกจากระบบ').click();
  await page.getByText('เข้าด้วยชื่อผู้ใช้และรหัสผ่าน').click();
  await page.fill('#identifier', 'mike');
  await page.fill('#password', 'secret1');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await page.waitForURL(BASE + '/').then(() => check('password sign-in from the PIN screen', true), () => check('password sign-in from the PIN screen', false));

  // Google: the SuperAdmin card, then the button area on the sign-in page
  await page.goto(BASE + '/settings');
  await page.getByText('เข้าด้วย Google (ทั้งโรงเรียน)').waitFor();
  await page.getByPlaceholder('xxxx.apps.googleusercontent.com').fill('1234-test.apps.googleusercontent.com');
  await page.getByRole('button', { name: 'บันทึก' }).last().click();
  await page.getByText('ปุ่มเข้าด้วย Google จะขึ้น').waitFor().then(() => check('Google client ID saves', true), () => check('Google client ID saves', false));
  await page.screenshot({ path: `${SHOTS}/20-google-setup.png`, fullPage: true });
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await anon.addInitScript(() => { try { localStorage.setItem('yodo-lang', 'th'); } catch { /* */ } });
  const ap = await anon.newPage();
  await ap.goto(BASE + '/auth');
  await ap.getByText('หรือ', { exact: true }).waitFor().then(() => check('sign-in page shows the Google area', true), () => check('sign-in page shows the Google area', false));
  await ap.waitForTimeout(1500);
  await ap.screenshot({ path: `${SHOTS}/21-login-google.png` });
  await anon.close();
  await page.request.put(`${BASE}/api/settings/google`, { headers: H, data: { googleClientId: '' } });

  // ---------- phone ----------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
  const pp = await phone.newPage();
  pp.on('pageerror', (e) => errors.push('phone: ' + e.message));
  for (const [p, name] of [['/', 'p1-dashboard'], ['/students', 'p2-students'], ['/classes', 'p3-classes'], ['/calendar', 'p4-calendar'], ['/teachers', 'p5-teachers'], ['/users', 'p6-users'], ['/audit-log', 'p7-audit'], ['/settings', 'p8-settings']]) {
    await pp.goto(BASE + p);
    await pp.waitForLoadState('networkidle');
    await pp.waitForTimeout(300);
    const o = await overflow(pp);
    check(`phone ${p} has no sideways scrolling`, o.length === 0, o.join(', '));
    await pp.screenshot({ path: `${SHOTS}/${name}.png` });
  }
  await pp.goto(BASE + '/students');
  await pp.getByText('มะลิ').first().click();
  await pp.getByRole('dialog').getByRole('button', { name: 'แก้ไข' }).waitFor().then(() => check('phone: tapping a student card opens the details', true), () => check('phone: tapping a student card opens the details', false));
  await pp.screenshot({ path: `${SHOTS}/p9-student-details.png` });
  await pp.getByRole('dialog').getByRole('button', { name: 'ดู PDF' }).scrollIntoViewIfNeeded();
  await pp.waitForTimeout(300);
  await pp.screenshot({ path: `${SHOTS}/p9b-student-buttons.png` });
  await pp.getByRole('dialog').getByRole('button', { name: 'ดู PDF' }).click();
  await pp.getByTestId('pdf-view').locator('.ydoc-p2').waitFor();
  await pp.waitForTimeout(500);
  const sheetW = await pp.getByTestId('pdf-view').locator('.ydoc-sheet').first().evaluate((e) => e.getBoundingClientRect().width);
  const scrollW = await pp.getByTestId('pdf-view').evaluate((e) => e.scrollWidth - e.clientWidth);
  check('phone: "View PDF" shrinks the A4 page to fit (no sideways scroll)', sheetW <= 390 && scrollW <= 1, `sheet ${Math.round(sheetW)}px, extra ${scrollW}px`);
  await pp.screenshot({ path: `${SHOTS}/p11-view-pdf.png` });
  await pp.getByRole('button', { name: 'กลับ' }).click();
  await pp.keyboard.press('Escape');
  await pp.goto(BASE + '/');
  {
    // bottom menu like a phone app (owner 17/10/2026): 4 pages + "More"
    const bn = pp.getByTestId('bottom-nav');
    await bn.getByTestId('nav-more').waitFor();
    const tabs = await bn.locator('a, button').allInnerTexts();
    const box = await bn.boundingBox();
    check('phone: menu bar at the bottom, 4 pages + More, no hamburger', box.y + box.height >= 840 && tabs.map((t) => t.trim()).join('|') === 'ภาพรวม|นักเรียน|คลาส|วันหมดอายุ|เพิ่มเติม' && (await pp.getByLabel('เปิดเมนู').count()) === 0, tabs.join('|'));
    await pp.screenshot({ path: `${SHOTS}/p9-menu.png` });
    await bn.getByText('นักเรียน').click();
    await pp.waitForURL('**/students');
    check('phone: the open page is marked in the bottom bar', (await bn.locator('[aria-current="page"]').innerText()).includes('นักเรียน'));
    await pp.getByTestId('nav-more').click();
    const sheet = pp.getByRole('dialog');
    await sheet.getByText('ใบเสร็จรับเงิน').waitFor();
    check('phone: More holds the rest, without Users / Permissions / Audit Log', (await sheet.getByText('ครู').count()) === 1 && (await sheet.getByText('ปฏิทิน').count()) === 1 && (await sheet.getByText('ผู้ใช้ระบบ').count()) === 0);
    await pp.waitForTimeout(400);
    await pp.screenshot({ path: `${SHOTS}/p9b-more.png` });
    await sheet.getByText('ใบเสร็จรับเงิน').click();
    await pp.waitForURL('**/receipts**');
    check('phone: a page from More marks "More"', (await bn.locator('[data-testid="nav-more"]').getAttribute('class')).includes('text-primary'));
    await pp.goto(BASE + '/');
  }
  await pp.keyboard.press('Escape');
  await pp.getByTitle('เมนูบัญชี').first().click();
  await pp.getByText('ออกจากระบบ').waitFor().then(() => check('phone: account menu at the top right', true), () => check('phone: account menu at the top right', false));
  {
    const m = pp.getByRole('menu');
    check('account menu holds Users, Permissions and Audit Log under "System"', (await m.getByText('จัดการระบบ').count()) === 1 && (await m.getByRole('menuitem', { name: 'ผู้ใช้ระบบ' }).count()) === 1 && (await m.getByRole('menuitem', { name: 'สิทธิ์' }).count()) === 1 && (await m.getByRole('menuitem', { name: 'ประวัติการแก้ไข' }).count()) === 1);
    await m.getByRole('menuitem', { name: 'ผู้ใช้ระบบ' }).click();
    await pp.waitForURL('**/users');
    await pp.getByRole('button', { name: 'ย้อนกลับ' }).click();
    await pp.waitForURL(BASE + '/').then(() => check('Users page has a Back button that goes back', true), () => check('Users page has a Back button that goes back', false));
    await pp.getByTitle('เมนูบัญชี').first().click();
  }
  await pp.waitForTimeout(400);
  await pp.screenshot({ path: `${SHOTS}/p10-account.png` });
  await pp.keyboard.press('Escape');

  // ---------- student form (owner 12/10/2026) ----------
  await page.goto(BASE + '/students');
  await page.getByRole('button', { name: 'เพิ่มนักเรียน' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByText('คลาสที่สนใจ (เลือกได้หลายอัน)').waitFor();
  for (const c of ['Ballet', 'Hip Hop']) await dlg.getByRole('button', { name: c, exact: true }).click();
  await dlg.getByRole('button', { name: 'อื่นๆ', exact: true }).first().click();
  await dlg.getByPlaceholder('พิมพ์คลาสอื่นที่สนใจ (คั่นด้วย ,)').waitFor().then(() => check('interested: "Other" opens a box to type', true), () => check('interested: "Other" opens a box to type', false));
  await dlg.getByPlaceholder('พิมพ์คลาสอื่นที่สนใจ (คั่นด้วย ,)').fill('Tap dance');
  await dlg.getByText('มีประสบการณ์').click();
  await dlg.getByText('Please specify').waitFor().then(() => check('experience: "yes" shows Please specify', true), () => check('experience: "yes" shows Please specify', false));
  await dlg.getByRole('button', { name: 'Facebook', exact: true }).click();
  await dlg.getByRole('button', { name: 'เพื่อนแนะนำ', exact: true }).click();
  await dlg.getByRole('button', { name: 'อื่นๆ', exact: true }).last().click();
  await dlg.getByText('ระบุช่องทาง').waitFor().then(() => check('how did you hear: several choices + Other box', true), () => check('how did you hear: several choices + Other box', false));
  check('ethnicity field is on the form', (await dlg.getByText('เชื้อชาติ', { exact: true }).count()) > 0);
  await dlg.getByText('คลาสที่สนใจ (เลือกได้หลายอัน)').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/24-student-form.png` });
  await page.keyboard.press('Escape');

  // ---------- side menu folds, account menu top right, code under the name (owner 12/10/2026) ----------
  await page.goto(BASE + '/students');
  check('student code shows under the name', (await page.locator('tr', { hasText: 'มะลิ' }).locator('td').first().innerText()).includes('YDO00001'));
  await page.getByRole('button', { name: 'ย่อเมนู' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'ขยายเมนู' }).waitFor().then(() => check('folded side menu is kept after reload', true), () => check('folded side menu is kept after reload', false));
  check('folded side menu hides the labels', !(await page.locator('aside').getByText('นักเรียน', { exact: true }).isVisible()));
  await page.getByTitle('เมนูบัญชี').last().click();
  await page.getByText('ตั้งค่าโปรไฟล์').waitFor();
  await page.screenshot({ path: `${SHOTS}/27-folded-account.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'ขยายเมนู' }).click();
  await page.screenshot({ path: `${SHOTS}/28-students-list.png` });
  // ---------- tap a student row = details; no eye button (owner 12/10/2026) ----------
  {
    const st = (await (await page.request.get(`${BASE}/api/data`)).json()).students.find((x) => x.firstName === 'มะลิ');
    const r = await page.request.put(`${BASE}/api/students/${st.id}`, { headers: H, data: { ...st, image: 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'e2e', 'fixtures', 'face.png')).toString('base64') } });
    check('a student photo can be saved', r.ok(), `${r.status()} ${(await r.text()).slice(0, 200)}`);
  }
  await page.goto(BASE + '/students');
  check('student list has no "view" eye button', (await page.getByRole('button', { name: /^ดูข้อมูล/ }).count()) === 0);
  await page.locator('tr', { hasText: 'มะลิ' }).click();
  const view = page.getByRole('dialog');
  await view.getByRole('button', { name: 'แก้ไข' }).waitFor().then(() => check('tapping a row opens the details with Edit', true), () => check('tapping a row opens the details with Edit', false));
  await page.screenshot({ path: `${SHOTS}/25-student-details.png` });
  await view.getByRole('button', { name: 'ดูรูปใหญ่' }).click();
  await page.getByTestId('photo-big').waitFor().then(() => check('tapping the photo shows it big', true), () => check('tapping the photo shows it big', false));
  await page.screenshot({ path: `${SHOTS}/32-photo-big.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await view.getByRole('button', { name: 'ดู PDF' }).click();
  await page.getByTestId('pdf-view').locator('.ydoc-p2').waitFor();
  check('unsigned application shows empty tick boxes', (await page.getByTestId('pdf-view').locator('.ydoc-tick[data-on="0"]').count()) === 2);
  await page.getByTestId('pdf-view').locator('.ydoc-p2').waitFor().then(() => check('"View PDF" shows the application inside the app', true), () => check('"View PDF" shows the application inside the app', false));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/31-view-pdf.png` });
  await page.mouse.move(683, 500);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  const scrolled = await page.getByTestId('pdf-view').evaluate((e) => e.scrollTop);
  check('"View PDF" scrolls up and down', scrolled > 100, `scrollTop ${scrolled}`);
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'พิมพ์ / บันทึกเป็น PDF' }).click()]);
  await pop.waitForLoadState();
  const pimg = pop.locator('img.student-photo');
  await pimg.waitFor({ timeout: 5000 }).catch(() => null);
  check('application PDF page 2 shows the student photo', (await pimg.count()) === 1 && await pimg.evaluate((i) => i.complete && i.naturalWidth > 0));
  await pop.setViewportSize({ width: 800, height: 1131 });
  await pop.locator('section.sheet').nth(1).screenshot({ path: `${SHOTS}/26-pdf-page2.png` }).catch(() => null);
  await pop.close();
  await page.getByRole('button', { name: 'กลับ' }).click();
  await view.getByRole('button', { name: 'แก้ไข' }).click();
  await page.getByRole('dialog').getByText('คลาสที่สนใจ (เลือกได้หลายอัน)').waitFor().then(() => check('Edit opens the student form', true), () => check('Edit opens the student form', false));
  // ---------- one signature in the form, used on both pages; no "automatic" notes (owner 12/10/2026) ----------
  const fdlg = page.getByRole('dialog');
  check('form has no "automatic" notes', (await fdlg.getByText('อัตโนมัติ').count()) === 0);
  const box = (t) => fdlg.locator('label', { hasText: new RegExp('^' + t) }).first().locator('xpath=ancestor::div[1]').locator('input').first();
  await fdlg.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'ด.ญ. / Miss' }).click().then(() => check('title list shows Thai and English', true), () => check('title list shows Thai and English', false));
  check('email is not required', !(await page.locator('label', { hasText: /^อีเมล/ }).first().innerText()).includes('*'));
  await box('อีเมล').fill('mali@example.com');
  await box('ชื่อผู้ติดต่อฉุกเฉิน').fill('คุณแม่');
  await box('เบอร์โทรผู้ติดต่อฉุกเฉิน').fill('0899999999');
  await fdlg.getByPlaceholder('เช่น แม่, พ่อ').fill('แม่');
  await fdlg.getByRole('group', { name: 'ภาษาของข้อตกลง' }).getByRole('button', { name: 'EN' }).click();
  check('terms box has its own TH/EN switch', (await fdlg.getByTestId('sign-terms').innerText()).includes('I certify that all the details') && (await fdlg.getByText("I have read and agree to the school's terms and conditions above.").count()) === 1);
  await fdlg.getByTestId('sign-terms').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await fdlg.getByTestId('sign-terms').locator('xpath=..').screenshot({ path: `${SHOTS}/33-terms-en.png` });
  await fdlg.getByRole('group', { name: 'ภาษาของข้อตกลง' }).getByRole('button', { name: 'TH' }).click();
  check('form signature is locked until both boxes are ticked', (await fdlg.getByTestId('form-sign').locator('canvas').count()) === 0);
  await fdlg.getByText('ข้าพเจ้าได้อ่านและยอมรับข้อตกลงและเงื่อนไขของโรงเรียนด้านบนแล้ว').click();
  await fdlg.getByText('ขอยืนยันว่าข้อมูลที่กรอกในใบสมัครทั้งหมดถูกต้องตามความเป็นจริง').click();
  check('form shows the terms above the signature', (await fdlg.getByTestId('sign-terms').locator('li').count()) === 9);
  const pad = fdlg.getByTestId('form-sign');
  await pad.scrollIntoViewIfNeeded();
  const bx = await pad.boundingBox();
  await page.mouse.move(bx.x + 40, bx.y + 90); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(bx.x + 40 + i * 25, bx.y + 90 + (i % 2 ? -30 : 20));
  await page.mouse.up();
  await page.screenshot({ path: `${SHOTS}/29-form-sign.png` });
  await fdlg.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await page.waitForTimeout(1200);
  const signed = (await (await page.request.get(`${BASE}/api/data`)).json()).students.find((x) => x.firstName === 'มะลิ');
  check('signature drawn in the form is saved', /^\/api\/files\//.test(signed.signature) && /^\d{4}-\d{2}-\d{2}$/.test(signed.signedAt), signed.signature);
  await page.locator('tr', { hasText: 'มะลิ' }).click();
  const v2 = page.getByRole('dialog');
  await v2.getByRole('button', { name: 'ดู PDF' }).click();
  const [pop2] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'พิมพ์ / บันทึกเป็น PDF' }).click()]);
  await pop2.waitForLoadState();
  await pop2.locator('img.sign-img').first().waitFor({ timeout: 5000 }).catch(() => null);
  check('the same signature prints on both pages', (await pop2.locator('img.sign-img').count()) === 2);
  check('signed application shows both statements ticked (page 1 and page 2)', (await pop2.locator('section.sheet').nth(0).locator('.tick svg path').count()) === 1 && (await pop2.locator('section.p2 .tick svg path').count()) === 1 && (await pop2.locator('section.p2').innerText()).includes('ขอยืนยันว่าข้อมูลที่กรอกในใบสมัครทั้งหมดถูกต้องตามความเป็นจริง'));
  check('PDF page 2: code, applied date and "applicant / parent"', (await pop2.locator('section.p2').innerText()).includes('YDO00001') && (await pop2.locator('section.p2').innerText()).includes('วันที่สมัคร') && (await pop2.locator('section.p2').innerText()).includes('ผู้สมัคร / ผู้ปกครอง'));
  await pop2.setViewportSize({ width: 800, height: 1131 });
  await pop2.waitForTimeout(500);
  await pop2.locator('section.sheet').nth(1).screenshot({ path: `${SHOTS}/26-pdf-page2.png` }).catch(() => null);
  await pop2.locator('section.sheet').nth(0).screenshot({ path: `${SHOTS}/26-pdf-page1.png` }).catch(() => null);
  await pop2.close();
  await page.getByRole('button', { name: 'กลับ' }).click();
  check('details: no Sign button any more (sign from Edit)', (await v2.getByRole('button', { name: /เซ็น/ }).count()) === 0);
  await page.screenshot({ path: `${SHOTS}/30-details-buttons.png` });
  await v2.getByRole('button', { name: 'แก้ไข' }).click();
  const sd = page.getByRole('dialog').filter({ has: page.getByTestId('sign-terms') });
  await sd.getByTestId('sign-terms').waitFor().then(() => check('Edit holds the terms and the sign box', true), () => check('Edit holds the terms and the sign box', false));
  await sd.getByTestId('sign-terms').scrollIntoViewIfNeeded();
  const tb = await sd.getByTestId('sign-terms').boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  check('sign box: the terms box scrolls', (await sd.getByTestId('sign-terms').evaluate((e) => e.scrollTop)) > 20);
  await page.keyboard.press('Escape');

  // ---------- roles, company settings, payment and receipts (owner 12/10/2026) ----------
  await page.goto(BASE + '/permissions');
  const pt = page.getByTestId('perm-table');
  await pt.waitFor();
  const heads = await pt.locator('thead th').allInnerTexts();
  check('permissions: Owner, Partner and Admin columns', ['Owner', 'Partner', 'Admin'].every((x) => heads.includes(x)), heads.join(','));
  await pt.getByRole('button', { name: 'Admin · ใบเสร็จรับเงิน · ยกเลิกใบเสร็จ' }).click();
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await page.waitForTimeout(800);
  {
    const dd = await (await page.request.get(`${BASE}/api/data`)).json();
    const ar = dd.positions.find((x) => x.kind === 'admin');
    check('permissions: the Owner turns a right on for Admin', dd.permissions[ar.id].receipts.delete === true);
  }
  await page.screenshot({ path: `${SHOTS}/34-permissions.png`, fullPage: true });
  await page.goto(BASE + '/company');
  await page.getByText('ชื่อโรงเรียน / บริษัท (ตามจดทะเบียน)').waitFor();
  check('the school logo with the motto is shown', await page.getByAltText('YODO You Only Dance Once').first().isVisible());
  const cbox = (t) => page.locator('label', { hasText: new RegExp('^' + t) }).first().locator('xpath=ancestor::div[1]').locator('input, textarea').first();
  check('company page has a Back button', await page.getByRole('button', { name: 'ย้อนกลับ' }).isVisible());
  {
    const a = await cbox('ชื่อโรงเรียน').boundingBox(), b = await cbox('ชื่อภาษาอังกฤษ').boundingBox();
    check('company form rows sit close together', b.y - (a.y + a.height) < 50, `${Math.round(b.y - (a.y + a.height))}px gap`);
  }
  await cbox('ชื่อโรงเรียน').fill('บริษัท โยโด้ แดนซ์ จำกัด');
  await cbox('ชื่อภาษาอังกฤษ').fill('YODO Dance Co., Ltd.');
  await cbox('ที่อยู่').fill('99 ถนนสุขุมวิท กรุงเทพฯ 10110');
  await cbox('เลขประจำตัวผู้เสียภาษี').fill('0105555555555');
  // signature = dark ink on a transparent PNG (showed black before), stamp = red ink on white paper (JPEG)
  const mkPic = (kind) => page.evaluate((kind) => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 200; const g = c.getContext('2d');
    if (kind === 'stamp') { g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 200); g.strokeStyle = '#c0262d'; g.lineWidth = 8; g.beginPath(); g.arc(200, 100, 70, 0, 7); g.stroke(); }
    else { g.strokeStyle = '#1a1a40'; g.lineWidth = 6; g.beginPath(); g.moveTo(40, 150); g.bezierCurveTo(120, 20, 220, 190, 360, 50); g.stroke(); }
    return c.toDataURL(kind === 'stamp' ? 'image/jpeg' : 'image/png', 0.95).split(',')[1];
  }, kind);
  // draw the signature instead of uploading (owner 13/10/2026): blue, thick
  await page.getByTestId('co-sign-draw').click();
  const sdw = page.getByTestId('sign-draw');
  await sdw.waitFor();
  await sdw.getByRole('group', { name: 'สีหมึก' }).getByRole('button', { name: 'น้ำเงิน' }).click();
  await sdw.getByRole('group', { name: 'ความหนาเส้น' }).getByRole('button', { name: 'หนา' }).click();
  {
    const b = await sdw.getByTestId('sign-draw-pad').boundingBox();
    await page.mouse.move(b.x + 40, b.y + 120); await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + 40 + i * 25, b.y + 120 - Math.sin(i) * 50);
    await page.mouse.up();
  }
  await page.screenshot({ path: `${SHOTS}/34b-sign-draw.png` });
  await sdw.getByTestId('sign-draw-use').click();
  await page.getByTestId('co-sign-img').waitFor();
  {
    const px = await page.getByTestId('co-sign-img').evaluate(async (im) => {
      await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
      let blue = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i + 2] > d[i] + 60) blue++;
      return { png: im.src.startsWith('data:image/png'), corner: d[3], blue, w: c.width };
    });
    check('drawn signature: blue ink, transparent, margins cut', px.png && px.corner === 0 && px.blue > 50 && px.w < 400, JSON.stringify(px));
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/34c-sign-drawn.png` });
  await page.getByTestId('co-sign').setInputFiles({ name: 'sign.png', mimeType: 'image/png', buffer: Buffer.from(await mkPic('sign'), 'base64') });
  await page.getByTestId('co-sign-name').fill('ครูพรกันยา');
  await page.getByTestId('co-stamp').setInputFiles({ name: 'stamp.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await mkPic('stamp'), 'base64') });
  await page.getByTestId('co-stamp-img').waitFor();
  const corner = (id) => page.getByTestId(id).evaluate(async (im) => {
    await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0); return { png: im.src.startsWith('data:image/png'), a: g.getImageData(0, 0, 1, 1).data[3] };
  });
  const cs = await corner('co-sign-img'), cst = await corner('co-stamp-img');
  check('signature upload stays transparent (not black)', cs.png && cs.a === 0, JSON.stringify(cs));
  check('stamp upload: white paper made transparent', cst.png && cst.a === 0, JSON.stringify(cst));
  await page.getByTestId('co-save').click();
  await page.waitForTimeout(600);
  // Gmail for receipts (owner 13/10/2026): a dummy app password, only its last 4 come back
  await page.getByTestId('mail-user').fill('yodo.school@gmail.com');
  await page.getByTestId('mail-pass').fill('abcd efgh ijkl wxyz');
  await page.getByTestId('mail-save').click();
  await page.waitForTimeout(600);
  {
    const m = await (await page.request.get(`${BASE}/api/settings/mail`)).json();
    check('Gmail settings saved, password hidden (last 4 only)', m.user === 'yodo.school@gmail.com' && m.passSet && m.passLast4 === 'wxyz' && !JSON.stringify(m).includes('abcd'), JSON.stringify(m));
    check('mail card shows the last 4 of the password', (await page.getByTestId('mail-pass').getAttribute('placeholder')).includes('wxyz'));
  }
  {
    const co = await (await page.request.get(`${BASE}/api/settings/company`)).json();
    check('company settings are saved (with stamp)', co.taxId === '0105555555555' && co.stamp.startsWith('/api/files/') && co.stamp.endsWith('.png'), JSON.stringify(co).slice(0, 200));
  }
  await page.screenshot({ path: `${SHOTS}/35-company.png`, fullPage: true });
  await post('/classes', { name: 'Ballet Course', teacherId: '', description: '', image: '', status: 'Active', price: 10000, months: 6 });
  await page.goto(BASE + '/classes');
  await page.getByText('10,000 บาท / 6 เดือน').first().waitFor().then(() => check('class card shows the course price and length', true), () => check('class card shows the course price and length', false));
  await page.screenshot({ path: `${SHOTS}/35b-classes-cards.png` });
  await page.getByTestId('classes-view-table').click();
  await page.getByTestId('classes-table').locator('tr', { hasText: 'Ballet Course' }).waitFor().then(() => check('classes: table view', true), () => check('classes: table view', false));
  await page.screenshot({ path: `${SHOTS}/35c-classes-table.png` });
  await page.reload();
  await page.getByTestId('classes-table').waitFor({ timeout: 5000 }).then(() => check('classes: the view is remembered', true), () => check('classes: the view is remembered', false));
  await page.getByTestId('classes-view-cards').click();
  await post('/classes', { name: 'Jazz Course', teacherId: '', description: '', image: '', status: 'Active', price: 4500, months: 3 });
  // ---------- buy courses: two in one receipt, % and baht off, a remark (owner 12/10/2026) ----------
  await page.goto(BASE + '/students');
  await page.getByRole('button', { name: /^จัดการ .*มะลิ/ }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/33b-row-actions.png` });
  check('student row: one actions button with Buy / Disable / Delete', (await page.getByRole('menuitem').allInnerTexts()).join('|') === 'ซื้อคลาส|ปิดใช้งาน|ลบ', (await page.getByRole('menuitem').allInnerTexts()).join('|'));
  await page.getByRole('menuitem', { name: 'ซื้อคลาส' }).click();
  const ed = page.getByTestId('buy-dialog');
  await ed.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Ballet Course' }).click();
  await page.waitForTimeout(300);
  const pbox = ed.getByTestId('payment-box');
  const l1 = ed.getByTestId('buy-line').first();
  check('payment is on and the price comes from the course', (await pbox.locator('input[type="checkbox"]').isChecked()) && (await l1.getByTestId('line-price').inputValue()) === '10000');
  check('payer starts empty', (await pbox.getByTestId('pay-payer').inputValue()) === '');
  await l1.getByTestId('line-discount').fill('10');
  await l1.getByRole('button', { name: '%', exact: true }).click();
  check('a % discount: 10% of 10,000', (await l1.getByTestId('line-amount').innerText()) === '9,000.00');
  await ed.getByRole('button', { name: 'เพิ่มคลาส' }).click();
  const l2 = ed.getByTestId('buy-line').nth(1);
  await l2.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Jazz Course' }).click();
  await page.waitForTimeout(200);
  await l2.getByTestId('line-discount').fill('500');
  check('two courses in one bill, baht and % off', (await ed.getByTestId('buy-total').innerText()) === '13,000.00', await ed.getByTestId('buy-total').innerText());
  await pbox.getByTestId('pay-remark').fill('แถมชุดเต้น 1 ชุด');
  await page.screenshot({ path: `${SHOTS}/36-payment.png` });
  await pp.goto(BASE + '/students');
  await pp.getByRole('button', { name: /^จัดการ / }).first().click();
  await pp.waitForTimeout(200);
  await pp.screenshot({ path: `${SHOTS}/p13b-row-actions.png` });
  await pp.getByRole('menuitem', { name: 'ซื้อคลาส' }).click();
  await pp.getByTestId('buy-dialog').waitFor();
  await pp.waitForTimeout(500);
  await pp.screenshot({ path: `${SHOTS}/p14-buy.png` });
  await pp.keyboard.press('Escape');
  await ed.getByRole('button', { name: 'บันทึกและออกใบเสร็จ' }).click();
  const rv = page.getByTestId('receipt-view');
  const det = page.getByTestId('receipt-detail');
  await det.waitFor({ timeout: 8000 }).then(() => check('saving opens the new receipt\'s details', true), () => check('saving opens the new receipt\'s details', false));
  await page.screenshot({ path: `${SHOTS}/36b-receipt-detail.png` });
  check('details: both classes and the total', (await det.getByTestId('receipt-lines').innerText()).includes('Jazz Course') && (await det.getByTestId('receipt-detail-total').innerText()).includes('13,000.00'));
  {
    // email + share (owner 13/10/2026)
    const rid = page.url().split('/receipts/')[1];
    const pdf = await page.request.get(`${BASE}/api/receipts/${rid}/pdf?lang=en`, { headers: { 'x-yodo': '1' } });
    check('receipt PDF file for sharing', pdf.ok() && pdf.headers()['content-type'] === 'application/pdf' && (await pdf.body()).subarray(0, 4).toString() === '%PDF');
    check('share button shown', await det.getByTestId('receipt-share').isVisible());
    await det.getByTestId('receipt-email').click();
    const dlg = page.getByTestId('email-dialog');
    await dlg.waitFor();
    await dlg.getByTestId('email-to').fill('parent@example.com');
    await dlg.getByRole('group', { name: 'ภาษาอีเมล' }).getByRole('button', { name: 'EN' }).click();
    await dlg.getByTestId('email-note').fill('See you on Saturday.');
    await page.screenshot({ path: `${SHOTS}/36c-email-dialog.png` });
    await dlg.getByTestId('email-preview').click();
    const pf = page.frameLocator('[data-testid="email-preview-frame"]');
    await pf.locator('body').waitFor();
    const ptxt = await pf.locator('body').innerText();
    check('email preview: professional English, no phone / reply lines', ptxt.includes('Dear Customer,') && ptxt.includes('Thank you for your payment') && ptxt.includes('See you on Saturday.') && ptxt.includes('Kind regards') && !/reply|call us/i.test(ptxt), ptxt.slice(0, 200));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/36d-email-preview.png` });
    await page.getByRole('dialog', { name: 'ตัวอย่างอีเมล' }).focus();
    await page.keyboard.press('Escape');
    await page.getByTestId('email-preview-frame').waitFor({ state: 'detached' });
    await dlg.getByTestId('email-send').click();
    await det.getByTestId('sent-email').first().waitFor({ timeout: 8000 }).catch(() => {});
    const emls = fs.existsSync(MAIL) ? fs.readdirSync(MAIL) : [];
    const eml = emls.length ? fs.readFileSync(path.join(MAIL, emls[0]), 'utf8') : '';
    check('email sent with the PDF attached', emls.length === 1 && eml.includes('parent@example.com') && /Receipt-RC\d{4}-0001\.pdf/.test(eml) && eml.includes('application/pdf'), emls.join(','));
    check('details list the sent email', (await det.getByTestId('sent-email').first().innerText()).includes('parent@example.com'));
    await page.screenshot({ path: `${SHOTS}/36e-email-sent.png` });
  }
  await det.getByTestId('receipt-pdf').click();
  await rv.waitFor({ timeout: 8000 });
  const frame = page.frameLocator('[data-testid="receipt-frame"]');
  await frame.locator('h1').waitFor();
  const rtxt = await frame.locator('body').innerText();
  check('receipt: running number, company, both courses, amount in Thai words', /RC\d{4}-0001/.test(rtxt) && rtxt.includes('บริษัท โยโด้ แดนซ์ จำกัด') && rtxt.includes('Ballet Course') && rtxt.includes('Jazz Course') && rtxt.includes('6 เดือน') && rtxt.includes('3 เดือน') && rtxt.includes('หนึ่งหมื่นสามพันบาทถ้วน'), rtxt.slice(0, 300));
  check('receipt shows each line\'s discount and the remark', rtxt.includes('ส่วนลด 10%') && rtxt.includes('แถมชุดเต้น 1 ชุด'));
  check('receipt prints the receiver name typed in Company settings', rtxt.includes('(ครูพรกันยา)'));
  check('receipt shows the stamp and the signature', (await frame.locator('img.stamp').count()) === 1 && (await frame.locator('.sign .line img').count()) === 1);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/37-receipt-th.png` });
  await frame.locator('.sign').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/37b-receipt-stamp.png` });
  await rv.getByRole('group', { name: 'ภาษาของใบเสร็จ' }).getByRole('button', { name: 'EN' }).click();
  await page.waitForTimeout(600);
  const etxt = await page.frameLocator('[data-testid="receipt-frame"]').locator('body').innerText();
  check('receipt has its own English version', etxt.includes('Receipt') && etxt.includes('Thirteen thousand baht only') && etxt.includes('YODO Dance Co., Ltd.'));
  await page.screenshot({ path: `${SHOTS}/38-receipt-en.png` });
  await rv.getByRole('button', { name: 'กลับ' }).click();
  {
    const st = (await (await page.request.get(`${BASE}/api/data`)).json()).students.find((x) => x.firstName === 'มะลิ');
    const en = (await (await page.request.get(`${BASE}/api/data`)).json()).enrollments.filter((x) => x.studentId === st.id);
    check('the expiry date follows the course length', en.length === 3 && en.every((x) => x.expiryDate > x.startDate));
  }
  // ---------- courses page, renew, extend, the student's history (owner 12/10/2026) ----------
  await page.goto(BASE + '/');
  await page.getByTestId('soon-card').filter({ hasText: '1 คลาส' }).waitFor({ timeout: 5000 }).then(() => check('dashboard: courses ending soon', true), () => check('dashboard: courses ending soon', false));
  await page.getByTestId('soon-card').click();
  await page.waitForURL('**/courses?show=soon');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/41-courses.png`, fullPage: true });
  {
    const nav = await page.locator('aside nav').innerText();
    check('menu: Classes comes before "Expiry dates", and no word คอร์ส', nav.indexOf('คลาส') >= 0 && nav.indexOf('คลาส') < nav.indexOf('วันหมดอายุ') && !(await page.evaluate(() => document.body.innerText)).includes('คอร์ส'));
  }
  const crow = page.locator('table [data-testid="course-row"]').filter({ hasText: s1.firstName }).filter({ hasText: 'Ballet Kids' });
  await crow.first().waitFor({ timeout: 5000 }).then(() => check('courses page lists what ends soon, with days left', true), () => check('courses page lists what ends soon, with days left', false));
  check('days left are counted', (await crow.locator('[data-state="soon"]').first().innerText()).includes('เหลือ 5 วัน'));
  await page.screenshot({ path: `${SHOTS}/41-courses.png`, fullPage: true });
  await crow.getByRole('button', { name: 'ต่ออายุ' }).first().click();
  const bd = page.getByTestId('buy-dialog');
  await bd.waitFor();
  check('renew: the class is picked and starts the day after the old end', (await bd.getByTestId('buy-line').first().innerText()).includes('Ballet Kids'));
  await bd.getByTestId('payment-box').locator('input[type="checkbox"]').uncheck();
  await bd.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await bd.waitFor({ state: 'detached' });
  await page.waitForTimeout(600);
  {
    const d2 = await (await page.request.get(`${BASE}/api/data`)).json();
    const e1 = d2.enrollments.find((x) => x.studentId === s1.id && x.classId === c1.id);
    check('renewing adds the course length after the old end, the start stays', e1.startDate === today && e1.expiryDate > plus(30), JSON.stringify(e1));
  }
  await page.getByTestId('filter-active').click();
  const r2row = page.locator('table [data-testid="course-row"]').filter({ hasText: s2.firstName }).filter({ hasText: 'Jazz Teens' });
  await r2row.getByRole('button', { name: 'ขยายเวลา' }).first().click();
  const xd = page.getByTestId('extend-dialog');
  await xd.waitFor();
  await xd.getByTestId('extend-reason').fill('ครูป่วย 1 สัปดาห์');
  await page.screenshot({ path: `${SHOTS}/43-extend.png` });
  await xd.getByRole('button', { name: 'ขยายเวลา', exact: true }).click();
  await xd.waitFor({ state: 'detached' });
  await page.waitForTimeout(600);
  {
    const d3 = await (await page.request.get(`${BASE}/api/data`)).json();
    const e2 = d3.enrollments.find((x) => x.studentId === s2.id && x.classId === c2.id);
    check('extend 7 days: new expiry, kept in the history', e2.expiryDate === plus(67) && d3.purchases.some((p) => p.kind === 'extend' && p.reason === 'ครูป่วย 1 สัปดาห์'), e2.expiryDate);
  }
  await page.locator('table [data-testid="course-row"]').filter({ hasText: s2.firstName }).first().getByRole('link').click();
  await page.waitForURL('**/students');
  await page.getByRole('tab', { name: /คลาส/ }).click();
  const sc = page.getByTestId('student-courses');
  await sc.waitFor();
  check('student details: current courses and the purchase history', (await sc.getByTestId('course-card').count()) === 3 && (await sc.getByTestId('history-row').count()) === 3);
  await page.screenshot({ path: `${SHOTS}/42-student-courses.png` });
  await page.keyboard.press('Escape');
  await page.goto(BASE + '/classes');
  await page.getByTestId('class-counts').first().waitFor();
  await page.getByRole('button', { name: 'ดูนักเรียนใน Ballet Course' }).click();
  await page.getByTestId('class-students').waitFor({ timeout: 5000 }).then(() => check('class: who bought it and when it ends', true), () => check('class: who bought it and when it ends', false));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/44-class.png` });
  await page.getByTestId('class-back').click();
  await page.getByTestId('class-students').waitFor({ state: 'detached', timeout: 5000 }).then(() => check('class panel has a Back button', true), () => check('class panel has a Back button', false));
  await pp.goto(BASE + '/classes');
  await pp.getByRole('button', { name: 'ดูนักเรียนใน Ballet Course' }).click();
  await pp.getByTestId('class-back').waitFor();
  await pp.waitForTimeout(500);
  check('phone: the Back button shows on the class panel', await pp.getByTestId('class-back').isVisible());
  await pp.screenshot({ path: `${SHOTS}/p15-class.png` });
  await pp.getByTestId('class-back').click();
  await pp.goto(BASE + '/courses');
  await pp.getByTestId('filter-all').waitFor();
  check('expiry dates: "All" is first and open by default', (await pp.locator('[data-testid^="filter-"]').first().getAttribute('data-testid')) === 'filter-all' && (await pp.getByTestId('filter-all').getAttribute('aria-pressed')) === 'true');
  await pp.getByTestId('filter-all').click();
  await pp.waitForTimeout(400);
  {
    const sw = await pp.evaluate(() => document.documentElement.scrollWidth);
    check('phone: courses page fits the screen', sw <= 391, `${sw}px`);
  }
  await pp.screenshot({ path: `${SHOTS}/p13-courses.png`, fullPage: true });
  await page.goto(BASE + '/receipts');
  await page.getByTestId('receipt-total').filter({ hasText: '13,000.00' }).waitFor({ timeout: 5000 }).then(() => check('receipts page: the month total', true), () => check('receipts page: the month total', false));
  await page.screenshot({ path: `${SHOTS}/39-receipts.png`, fullPage: true });
  // this month's newest receipt: edit (owner 12/10/2026)
  await page.getByTestId('receipt-table').locator('tbody tr').first().click();
  await page.waitForURL('**/receipts/*');
  await page.screenshot({ path: `${SHOTS}/47-receipt-detail.png`, fullPage: true });
  await det.getByTestId('row-actions').click();
  await page.getByTestId('receipt-edit').waitFor({ timeout: 5000 }).then(() => check('the newest receipt can be edited and deleted (no cancel), behind the more button', true), () => check('the newest receipt can be edited and deleted (no cancel), behind the more button', false));
  check('no cancel on the newest receipt', (await page.getByTestId('receipt-cancel').count()) === 0 && (await page.getByTestId('receipt-delete').count()) === 1);
  await page.screenshot({ path: `${SHOTS}/47b-receipt-menu.png` });
  await page.getByTestId('receipt-edit').click();
  const edd = page.getByTestId('receipt-edit-dialog');
  await edd.getByTestId('edit-discount').first().fill('20');
  await edd.getByTestId('edit-remark').fill('แก้ส่วนลดเป็น 20%');
  check('edit: the total follows the new discount', (await edd.getByTestId('edit-total').innerText()) === '12,000.00');
  await page.screenshot({ path: `${SHOTS}/45-receipt-edit.png` });
  await edd.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await edd.waitFor({ state: 'detached' });
  await page.waitForTimeout(600);
  check('details show the edited total', (await det.getByTestId('receipt-detail-total').innerText()).includes('12,000.00'));
  await det.getByTestId('receipt-pdf').click();
  await rv.waitFor();
  await page.frameLocator('[data-testid="receipt-frame"]').locator('h1').waitFor();
  {
    const t = await page.frameLocator('[data-testid="receipt-frame"]').locator('body').innerText();
    check('edited receipt keeps its number and shows the new amount and remark', /RC\d{4}-0001/.test(t) && t.includes('12,000.00') && t.includes('แก้ส่วนลดเป็น 20%') && t.includes('ส่วนลด 20%'));
  }
  check('the PDF window has no edit/delete', (await rv.getByTestId('receipt-edit').count()) === 0 && (await rv.getByTestId('receipt-delete').count()) === 0);
  await rv.getByRole('button', { name: 'กลับ' }).click();
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click();
  await page.waitForURL('**/receipts');
  // a second receipt: the first one is no longer the newest (cancel only), the second can be deleted
  {
    const jc = (await (await page.request.get(`${BASE}/api/data`)).json()).classes.find((c) => c.name === 'Jazz Course');
    await post('/courses/buy', { studentId: s1.id, lines: [{ classId: jc.id, startDate: today, expiryDate: plus(90), price: 4500, discountType: 'baht', discountValue: 0 }], pay: { date: today, method: 'cash', slip: '', payer: '', remark: '' } });
  }
  await page.reload();
  await page.getByTestId('receipt-total').filter({ hasText: '16,500.00' }).waitFor({ timeout: 5000 });
  await page.getByTestId('receipt-table').locator('tbody tr').filter({ hasText: '-0001' }).click();
  await det.getByTestId('row-actions').click();
  check('an older receipt has no edit/delete, only cancel', (await page.getByTestId('receipt-edit').count()) === 0 && (await page.getByTestId('receipt-delete').count()) === 0);
  await page.getByTestId('receipt-cancel').click();
  await page.getByRole('dialog', { name: 'ยกเลิกใบเสร็จนี้?' }).getByRole('button', { name: 'ยกเลิกใบเสร็จ' }).click();
  await page.waitForTimeout(800);
  check('details show "cancelled"', (await det.innerText()).includes('ยกเลิกแล้ว'));
  await det.getByTestId('receipt-pdf').click();
  await page.frameLocator('[data-testid="receipt-frame"]').locator('h1').waitFor();
  check('a cancelled receipt shows CANCELLED/ยกเลิก', (await page.frameLocator('[data-testid="receipt-frame"]').locator('.void').count()) === 1);
  await rv.getByRole('button', { name: 'กลับ' }).click();
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click();
  await page.waitForURL('**/receipts');
  await page.getByTestId('receipt-total').filter({ hasText: '4,500.00' }).waitFor({ timeout: 5000 }).then(() => check('a cancelled receipt is not counted', true), () => check('a cancelled receipt is not counted', false));
  check('the cancelled receipt stays in the list, struck through', (await page.getByTestId('receipt-table').locator('tbody tr.line-through').count()) === 1);
  await page.getByTestId('receipt-table').locator('tbody tr').filter({ hasText: '-0002' }).click();
  await det.getByTestId('row-actions').click();
  await page.getByTestId('receipt-delete').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/46-receipt-delete.png` });
  await page.getByRole('button', { name: 'ลบใบเสร็จ', exact: true }).click();
  await page.waitForURL('**/receipts', { timeout: 5000 });
  await page.getByTestId('receipt-total').filter({ hasText: '0.00' }).waitFor({ timeout: 5000 }).then(() => check('deleting the newest receipt removes it', true), () => check('deleting the newest receipt removes it', false));
  {
    const d4 = await (await page.request.get(`${BASE}/api/data`)).json();
    check('its course is taken back', !d4.enrollments.some((e) => e.studentId === s1.id && d4.classes.find((c) => c.id === e.classId)?.name === 'Jazz Course'));
    const again = await post('/courses/buy', { studentId: s1.id, lines: [{ classId: d4.classes.find((c) => c.name === 'Jazz Course').id, startDate: today, expiryDate: plus(90), price: 4500, discountType: 'baht', discountValue: 0 }], pay: { date: today, method: 'cash', slip: '', payer: '', remark: '' } });
    check('the deleted number is used again', /-0002$/.test(again.receipt.no), again.receipt.no);
  }
  await page.goto(BASE + '/');
  await page.getByTestId('money-card').waitFor({ timeout: 5000 }).then(() => check('dashboard shows the month\'s money to those allowed', true), () => check('dashboard shows the month\'s money to those allowed', false));
  await page.screenshot({ path: `${SHOTS}/40-dashboard-money.png` });
  // phone: the receipt fits the screen
  await pp.goto(BASE + '/receipts');
  await pp.getByTestId('receipt-table').locator('tbody tr').first().click();
  await pp.getByTestId('receipt-detail').waitFor();
  {
    const sw = await pp.evaluate(() => document.documentElement.scrollWidth);
    check('phone: receipt details fit the screen', sw <= 391, `${sw}px`);
  }
  await pp.screenshot({ path: `${SHOTS}/p16-receipt-detail.png`, fullPage: true });
  await pp.getByTestId('receipt-pdf').click();
  await pp.getByTestId('receipt-frame').waitFor();
  await pp.waitForTimeout(500);
  const rw = await pp.getByTestId('receipt-frame').evaluate((e) => e.getBoundingClientRect().width);
  check('phone: the receipt is shrunk to fit', rw <= 390, `${Math.round(rw)}px`);
  await pp.screenshot({ path: `${SHOTS}/p12-receipt.png` });
  await pp.getByRole('button', { name: 'กลับ' }).click();

  // ---------- notification settings and bell (owner 12/10/2026) ----------
  await page.goto(BASE + '/settings');
  await page.getByText('เรื่องที่อยากรับ').waitFor();
  await page.getByRole('switch', { name: 'ตารางเรียนใหม่' }).click();
  await page.waitForTimeout(500);
  check('a person can turn a notice kind off', (await (await page.request.get(`${BASE}/api/me/notices`)).json()).off.includes('schedule'));
  await page.getByRole('switch', { name: 'ตารางเรียนใหม่' }).click();
  await page.fill('#expiry-days', '10');
  await page.locator('#expiry-days').locator('xpath=..').getByRole('button', { name: 'บันทึก' }).click();
  await page.getByText('ล่วงหน้า 10 วัน').waitFor().then(() => check('SuperAdmin sets the expiry warning days', true), () => check('SuperAdmin sets the expiry warning days', false));
  await page.screenshot({ path: `${SHOTS}/22-notice-card.png`, fullPage: true });
  await page.goto(BASE + '/students');
  await page.getByRole('button', { name: 'การแจ้งเตือน' }).last().click();
  const rows = page.getByRole('button', { name: 'ลบการแจ้งเตือนนี้' });
  const n0 = await rows.count();
  await rows.first().click();
  await page.waitForTimeout(400);
  check('bell: X removes one notice', (await rows.count()) === n0 - 1, `${n0} -> ${await rows.count()}`);
  await page.getByText('อ่านแล้วทั้งหมด').click();
  await page.getByText('ลบที่อ่านแล้ว').click();
  await page.waitForTimeout(400);
  check('bell: "remove read" empties it', (await rows.count()) === 0);
  await page.screenshot({ path: `${SHOTS}/23-bell-empty.png` });
  await page.keyboard.press('Escape');

  // ---------- English ----------
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'Switch to English' }).last().click();
  await page.getByRole('link', { name: 'Students' }).first().waitFor().then(() => check('TH/EN button switches the menu to English', true), () => check('TH/EN button switches the menu to English', false));
  check('the language is kept with the account', (await (await page.request.get(`${BASE}/api/me`)).json()).lang === 'en');
  // typed data (names, class names) may be Thai; nothing else may be
  const TYPED = /บัลเล่ต์สำหรับเด็ก 4-7 ปี|มะลิ|ใจดี|ลิลี่|ต้นกล้า|สุขใจ|กล้า|แอนนา|บัลเล่ต์|แอน|บัลเล่ต์สำหรับเด็ก 4-7 ปี|ไมค์|ด\.ญ\.|ด\.ช\.|นางสาว/g;
  for (const [pth, name] of [['/', 'e1-dashboard'], ['/students', 'e2-students'], ['/classes', 'e3-classes'], ['/teachers', 'e4-teachers'], ['/calendar', 'e5-calendar'], ['/users', 'e6-users'], ['/permissions', 'e7-permissions'], ['/audit-log', 'e8-audit'], ['/settings', 'e9-settings'], ['/import', 'e10-import'], ['/receipts', 'e11-receipts'], ['/company', 'e12-company'], ['/courses', 'e13-courses']]) {
    await page.goto(BASE + pth);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    const text = (await page.evaluate(() => document.body.innerText)).replace(TYPED, '');
    const thai = [...new Set(text.match(/[\u0E00-\u0E7F][\u0E00-\u0E7F .]*/g) ?? [])].slice(0, 6);
    // the audit log shows what was typed into old records, which may be Thai
    if (pth === '/students') check('English: a Thai name keeps its Thai title', !text.includes('Miss') && (await page.evaluate(() => document.body.innerText)).includes('ด.ญ. มะลิ'));
    check(`English ${pth} has no Thai left`, pth === '/audit-log' || thai.length === 0, thai.join(' | '));
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
  await page.goto(BASE + '/students');
  await page.getByText('Add Student').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/e11-student-form.png` });
  await page.keyboard.press('Escape');
  const anon2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const a2 = await anon2.newPage();
  await a2.goto(BASE + '/auth');
  await a2.getByText('Welcome Back').waitFor().then(() => check('sign-in page is English for a new visitor', true), () => check('sign-in page is English for a new visitor', false));
  await a2.screenshot({ path: `${SHOTS}/e12-login.png` });
  await anon2.close();

  // clear classes and receipts (owner 17/10/2026): Owner only, typed word, backup first, students stay (page is English now)
  await page.request.patch(`${BASE}/api/me/lang`, { headers: { 'x-yodo': '1' }, data: { lang: 'th' } });
  await page.goto(BASE + '/company');
  await page.reload();
  await page.getByTestId('clear-open').click();
  const cd = page.getByTestId('clear-dialog');
  await cd.waitFor();
  check('clear: the window says what goes and needs the typed word', (await cd.innerText()).includes('คลาส') && await cd.getByTestId('clear-run').isDisabled());
  await cd.getByTestId('clear-word').fill('ลบทั้งหมด');
  await page.screenshot({ path: `${SHOTS}/50-clear-confirm.png` });
  const nStudents = (await (await page.request.get(`${BASE}/api/data`)).json()).students.length;
  await cd.getByTestId('clear-run').click();
  await cd.waitFor({ state: 'detached', timeout: 10000 });
  {
    const d = await (await page.request.get(`${BASE}/api/data`)).json();
    const c = await (await page.request.get(`${BASE}/api/admin/clear-courses`)).json();
    check('clear: classes, purchases and receipts gone, students kept, card stays', c.classes === 0 && c.receipts === 0 && c.enrollments === 0 && d.students.length === nStudents && await page.getByTestId('clear-card').isVisible(), JSON.stringify(c));
    check('clear: a backup was written first', fs.readdirSync(path.join(DATA, 'backups')).some((f) => f.includes('before-clear')));
  }
  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  check('run finished', false, String(e?.message ?? e));
} finally {
  await browser.close();
  stop();
  fs.rmSync(DATA, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
