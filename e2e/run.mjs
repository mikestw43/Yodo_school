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

  // sign out and back in through the login form
  await page.getByTitle('เมนูโปรไฟล์').click();
  const ver = await page.getByText(/^เวอร์ชัน /).first().textContent({ timeout: 5000 }).catch(() => '');
  check('profile menu shows the version', !!ver, ver ?? '');
  await page.getByText('ออกจากระบบ').click();
  await page.waitForURL('**/auth');
  await page.fill('#identifier', 'mike');
  await page.fill('#password', 'wrong');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByText('Username หรือรหัสผ่านไม่ถูกต้อง').waitFor();
  check('wrong password says so in Thai', true);
  await page.screenshot({ path: `${SHOTS}/02-login.png` });
  await page.fill('#password', 'secret1');
  await page.getByRole('button', { name: 'Sign In' }).click();
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
  await page.getByText('Username').first().waitFor();
  const nick = page.locator('label:has-text("ชื่อเล่น") + *').locator('input').first();
  if (await nick.count()) await nick.fill('ไมค์');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await page.getByText('บันทึกโปรไฟล์แล้ว').waitFor().then(() => check('profile save works', true), () => check('profile save works', false));

  // student detail opens
  await page.goto(BASE + '/students');
  await page.getByText('มะลิ').locator('visible=true').first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/14-student-detail.png` });

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
