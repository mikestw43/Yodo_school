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
const env = { ...process.env, DATA_DIR: DATA, DATABASE_URL: `file:${DATA}/yodo.db`, APP_PORT: String(PORT), PUBLIC_DIR: path.join(ROOT, 'client/dist'), EXTRA_DIR: path.join(ROOT, 'web') };

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
  await page.request.patch(`${BASE}/api/me/lang`, { headers: { 'x-yodo': '1' }, data: { lang: 'th' } });
  await page.reload();

  // sign out and back in through the login form
  await page.getByTitle('เมนูโปรไฟล์').click();
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
  await page.getByTitle('เมนูโปรไฟล์').click();
  await page.getByText('ออกจากระบบ').click();
  await page.waitForURL('**/auth');
  await page.waitForURL(BASE + '/', { timeout: 10000 }).then(() => check('Face ID signs in on the PIN screen', true), () => check('Face ID signs in on the PIN screen', false));

  // without Face ID: the PIN pad, a wrong PIN, then the right one
  await page.evaluate(() => localStorage.removeItem('yodo-passkey'));
  await page.getByTitle('เมนูโปรไฟล์').click();
  await page.getByText('ออกจากระบบ').click();
  await page.waitForURL('**/auth');
  await page.getByText('ใส่ PIN เพื่อเข้าใช้งาน').waitFor();
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
  await page.getByTitle('เมนูโปรไฟล์').click();
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
  await pp.goto(BASE + '/');
  await pp.getByLabel('เปิดเมนู').click();
  await pp.waitForTimeout(500);
  await pp.screenshot({ path: `${SHOTS}/p9-menu.png` });

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
  for (const [pth, name] of [['/', 'e1-dashboard'], ['/students', 'e2-students'], ['/classes', 'e3-classes'], ['/teachers', 'e4-teachers'], ['/calendar', 'e5-calendar'], ['/users', 'e6-users'], ['/permissions', 'e7-permissions'], ['/audit-log', 'e8-audit'], ['/settings', 'e9-settings'], ['/import', 'e10-import']]) {
    await page.goto(BASE + pth);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    const text = (await page.evaluate(() => document.body.innerText)).replace(TYPED, '');
    const thai = [...new Set(text.match(/[\u0E00-\u0E7F][\u0E00-\u0E7F .]*/g) ?? [])].slice(0, 6);
    // the audit log shows what was typed into old records, which may be Thai
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
