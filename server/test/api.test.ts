import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ensureSetupCode } from '../src/routes/auth.js';
import { DATA_DIR, UPLOAD_DIR } from '../src/lib/config.js';
import { parseCsv } from '../src/routes/importer.js';
import { thaiPrefix } from '../src/lib/prefixes.js';

const app = createApp();
type Agent = ReturnType<typeof request.agent>;
const H = { 'x-yodo': '1' };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function login(identifier: string, password: string) {
  const a = request.agent(app);
  const r = await a.post('/api/auth/login').set(H).send({ identifier, password });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return a;
}
const student = (over: Record<string, unknown> = {}) => ({
  prefix: 'ด.ญ.', firstName: 'มะลิ', lastName: 'ใจดี', nickname: 'ลิลี่', dob: '2018-05-01', nationality: 'ไทย', nationalityOther: '',
  religion: 'พุทธ', address: '', phone: '0812345678', email: '', lineId: '', emergencyName: 'แม่', emergencyPhone: '0899999999',
  relationship: 'แม่', image: '', interested: ['Ballet'], hasExperience: false, experienceDetail: '', source: 'Facebook', sourceOther: '', ...over,
});

let admin: Agent;
let classId = '';
let studentId = '';

describe('first-run setup and sign-in', () => {
  it('needs the code from the data folder', async () => {
    await ensureSetupCode();
    expect((await request(app).get('/api/setup/status')).body.needsSetup).toBe(true);
    const body = { firstName: 'Owner', lastName: 'Yodo', username: 'owner', password: 'secret1' };
    expect((await request(app).post('/api/setup').set(H).send({ ...body, code: '00000000' })).status).toBe(403);
    const code = fs.readFileSync(path.join(DATA_DIR, 'setup-code.txt'), 'utf8').trim();
    expect((await request(app).post('/api/setup').set(H).send({ ...body, code })).status).toBe(200);
    expect(fs.existsSync(path.join(DATA_DIR, 'setup-code.txt'))).toBe(false);
    expect((await request(app).post('/api/setup').set(H).send({ ...body, code })).status).toBe(403);
  });
  it('signs in with username, refuses wrong passwords and requests without the header', async () => {
    expect((await request(app).post('/api/auth/login').set(H).send({ identifier: 'owner', password: 'nope' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ identifier: 'owner', password: 'secret1' })).status).toBe(403);
    admin = await login('OWNER', 'secret1');
    const me = (await admin.get('/api/me')).body;
    expect(me.superadmin).toBe(true);
    expect(me.positionName).toBe('SuperAdmin');
    expect((await request(app).get('/api/data')).status).toBe(401);
  });
});

describe('school data', () => {
  it('teachers and classes', async () => {
    // the nickname is required (owner 25/10/2026)
    const noNick = await admin.post('/api/teachers').set(H).send({ image: '', prefix: 'นาง', firstName: 'ครูแอน', lastName: '', nickname: '  ', phone: '', email: '', lineId: '', specializations: [] });
    expect(noNick.status).toBe(400);
    const t = await admin.post('/api/teachers').set(H).send({ image: PNG, prefix: 'นาง', firstName: 'ครูแอน', lastName: '', nickname: 'แอน', phone: '', email: '', lineId: '', specializations: ['Ballet'] });
    expect(t.status).toBe(201);
    expect(t.body.image).toMatch(/^\/api\/files\/[a-f0-9-]+\.png$/);
    expect(t.body.specializations).toEqual(['Ballet']);
    // the picture is a file, readable only when signed in
    expect((await admin.get(t.body.image)).status).toBe(200);
    expect((await request(app).get(t.body.image)).status).toBe(401);
    const c = await admin.post('/api/classes').set(H).send({ name: 'Ballet Kids', teacherId: t.body.id, description: '', image: '', status: 'Active', price: 2500 });
    expect(c.status).toBe(201);
    classId = c.body.id;
    expect((await admin.post('/api/classes').set(H).send({ name: 'x', teacherId: '00000000-0000-4000-8000-000000000000', description: '', image: '', status: 'Active', price: null })).status).toBe(404);
  });

  it('students get codes that are never reused', async () => {
    const a = await admin.post('/api/students').set(H).send(student());
    expect(a.status).toBe(201);
    expect(a.body.code).toBe('YDO00001');
    const b = await admin.post('/api/students').set(H).send(student({ firstName: 'ดาว' }));
    expect(b.body.code).toBe('YDO00002');
    expect((await admin.delete(`/api/students/${b.body.id}`).set(H)).status).toBe(200);
    const c = await admin.post('/api/students').set(H).send(student({ firstName: 'ฟ้า' }));
    expect(c.body.code).toBe('YDO00003');
    studentId = a.body.id;
    const d = (await admin.get('/api/data')).body;
    expect(d.students.map((s: { code: string }) => s.code)).toEqual(['YDO00001', 'YDO00003']);
    expect(d.deletedStudentCodes).toEqual(['YDO00002']);
    expect((await admin.put(`/api/students/${b.body.id}`).set(H).send(student())).status).toBe(404);
    expect((await admin.post('/api/students').set(H).send(student({ dob: '01/05/2018' }))).status).toBe(400);
    // a signature drawn in the add form is saved with the student
    const g = await admin.post('/api/students').set(H).send({ ...student({ firstName: 'เซ็น' }), signature: PNG, signedAt: '2026-10-12' });
    expect(g.status).toBe(201);
    expect(g.body.signature).toMatch(/^\/api\/files\//);
    expect(g.body.signedAt).toBe('2026-10-12');
  });

  it('enrollments, sessions and who can be put on them', async () => {
    const e = await admin.post('/api/enrollments').set(H).send({ studentId, classId, purchaseDate: '2026-10-01', startDate: '2026-10-01', expiryDate: '2026-12-31', remark: '', receiptImage: PNG });
    expect(e.status).toBe(201);
    expect((await admin.post('/api/enrollments').set(H).send({ studentId, classId, purchaseDate: '', startDate: '', expiryDate: '', remark: '', receiptImage: '' })).status).toBe(400);
    const s = await admin.post('/api/schedules').set(H).send({ items: [{ classId, date: '2026-10-20', start: '16:00', end: '17:00' }] });
    expect(s.status).toBe(201);
    const sid = s.body[0].id;
    expect((await admin.post(`/api/schedules/${sid}/students`).set(H).send({ studentId })).status).toBe(201);
    const other = (await admin.get('/api/data')).body.students.find((x: { id: string }) => x.id !== studentId).id;
    expect((await admin.post(`/api/schedules/${sid}/students`).set(H).send({ studentId: other })).status).toBe(400);
    // leaving the class takes the student off its sessions
    expect((await admin.post('/api/enrollments/remove').set(H).send({ studentId, classId })).status).toBe(200);
    expect((await admin.get('/api/data')).body.scheduleStudents).toEqual([]);
    // everyone got bell notices
    const n = (await admin.get('/api/notices')).body;
    expect(n.items.map((x: { kind: string }) => x.kind)).toEqual(expect.arrayContaining(['enrollment', 'schedule']));
    expect((await admin.post('/api/notices/read').set(H).send({ all: true })).body.unread).toBe(0);
  });

  it('audit log keeps old and new values in the old app shape', async () => {
    const r = (await admin.get('/api/audit-log')).body;
    const del = r.logs.find((l: { action: string; table_name: string }) => l.action === 'delete' && l.table_name === 'students');
    expect(del.old_data.first_name).toBe('ดาว');
    expect(del.old_data.interested).toEqual(['Ballet']);
    const t = r.logs.find((l: { table_name: string }) => l.table_name === 'teachers');
    expect(t.new_data.image).toMatch(/^img:/);
    expect(r.logs.some((l: { action: string }) => l.action === 'login')).toBe(true);
  });
});

describe('roles and receipts (owner 12/10/2026)', () => {
  it('Owner, Partner and Admin exist; the SuperAdmin is hidden; only the Owner edits rights', async () => {
    const d = (await admin.get('/api/data')).body;
    const kinds = d.positions.map((p: { kind: string }) => p.kind);
    for (const k of ['superadmin', 'owner', 'partner', 'admin']) expect(kinds).toContain(k);
    expect(d.owner).toBe(true);
    const partner = d.positions.find((p: { kind: string }) => p.kind === 'partner');
    const adminRole = d.positions.find((p: { kind: string }) => p.kind === 'admin');
    expect(d.permissions[adminRole.id].receipts).toEqual({ view: true, add: true, edit: true, delete: false });
    const u = await admin.post('/api/users').set(H).send({ firstName: 'Pat', lastName: '', nickname: '', username: 'pat', password: 'secret3', email: '', phone: '', positionId: partner.id, image: '' });
    expect(u.status).toBe(201);
    const pat = await login('pat', 'secret3');
    const pd = (await pat.get('/api/data')).body;
    expect(pd.owner).toBe(false);
    expect(pd.positions.some((p: { kind: string }) => p.kind === 'superadmin')).toBe(false);
    expect(pd.systemUsers.some((x: { superadmin: boolean }) => x.superadmin)).toBe(false);
    expect((await pat.put(`/api/positions/${adminRole.id}/permissions`).set(H).send({})).status).toBe(403);
    expect((await pat.post('/api/positions').set(H).send({ name: 'Teacher', description: '' })).status).toBe(403);
    expect((await admin.post('/api/positions').set(H).send({ name: 'Teacher', description: '' })).status).toBe(201);
    expect((await admin.delete(`/api/positions/${adminRole.id}`).set(H)).status).toBe(400); // built-in roles stay
  });
  it('buying courses: several in one receipt, % or baht off, renewals, cancel takes the period back, free extensions', async () => {
    const c = await admin.post('/api/classes').set(H).send({ name: 'Course 6m', teacherId: '', description: '', image: '', status: 'Active', price: 10000, months: 6 });
    expect(c.body.months).toBe(6);
    const j = await admin.post('/api/classes').set(H).send({ name: 'Jazz 3m', teacherId: '', description: '', image: '', status: 'Active', price: 4500, months: 3 });
    const line = (classId: string, startDate: string, expiryDate: string, price: number, discountType: string, discountValue: number) => ({ classId, startDate, expiryDate, price, discountType, discountValue });
    const pay = (date: string) => ({ date, method: 'transfer', payer: 'คุณแม่', slip: PNG, remark: 'ชุดฟรี 1 ชุด' });
    const buy = (lines: unknown[], date: string, who = admin) => who.post('/api/courses/buy').set(H).send({ studentId, lines, pay: pay(date) });
    const r1 = await buy([line(c.body.id, '2026-10-12', '2027-04-11', 10000, 'pct', 10), line(j.body.id, '2026-10-12', '2027-01-11', 4500, 'baht', 500)], '2026-10-12');
    expect(r1.status, JSON.stringify(r1.body)).toBe(201);
    expect(r1.body.receipt.no).toBe('RC2610-0001');
    expect(r1.body.receipt.amount).toBe(13000);
    expect(r1.body.receipt.discount).toBe(1500);
    const full = (await admin.get(`/api/receipts/${r1.body.receipt.id}`)).body;
    expect(full.receipt.lines.map((l: { item: string; amount: number }) => [l.item, l.amount])).toEqual([['Course 6m', 9000], ['Jazz 3m', 4000]]);
    expect(full.receipt.remark).toBe('ชุดฟรี 1 ชุด');
    const en6 = () => admin.get('/api/data').then((r) => r.body.enrollments.find((e: { classId: string }) => e.classId === c.body.id));
    // renewed before the end: the start stays, the expiry moves on
    const r2 = await buy([line(c.body.id, '2027-04-12', '2027-10-11', 10000, 'baht', 0)], '2026-10-13');
    expect(r2.body.receipt.no).toBe('RC2610-0002');
    expect(await en6()).toMatchObject({ startDate: '2026-10-12', expiryDate: '2027-10-11' });
    expect((await buy([line(j.body.id, '2027-01-12', '2027-04-11', 4500, 'baht', 0)], '2026-11-01')).body.receipt.no).toBe('RC2611-0001');
    expect((await buy([line(c.body.id, '2027-10-12', '2028-04-11', 10000, 'pct', 150)], '2026-10-14')).status).toBe(400);
    expect((await buy([line(c.body.id, '2027-10-12', '2028-04-11', 10000, 'baht', 20000)], '2026-10-14')).status).toBe(400);
    expect((await buy([line(c.body.id, '2027-10-12', '2028-04-11', 10000, 'baht', 0), line(c.body.id, '2027-10-12', '2028-04-11', 10000, 'baht', 0)], '2026-10-14')).status).toBe(400);
    // cancelling the renewal takes its period back
    await admin.post(`/api/receipts/${r2.body.receipt.id}/cancel`).set(H).send({ reason: 'ผิด' }).expect(200);
    expect((await admin.post(`/api/receipts/${r2.body.receipt.id}/cancel`).set(H).send({})).status).toBe(400);
    expect((await en6()).expiryDate).toBe('2027-04-11');
    expect((await buy([line(c.body.id, '2027-04-12', '2027-10-11', 10000, 'baht', 500)], '2026-10-20')).body.receipt.no).toBe('RC2610-0003'); // never reused
    // a free extension, kept in the history
    const e6 = await en6();
    expect((await admin.post('/api/courses/extend').set(H).send({ enrollmentId: e6.id, expiryDate: '2027-10-01', reason: 'x' })).status).toBe(400);
    expect((await admin.post('/api/courses/extend').set(H).send({ enrollmentId: e6.id, expiryDate: '2027-10-18', reason: 'ครูป่วย' })).status).toBe(201);
    const hist = (await admin.get('/api/data')).body.purchases.filter((p: { enrollmentId: string }) => p.enrollmentId === e6.id);
    expect(hist.map((p: { kind: string; cancelled: boolean }) => `${p.kind}${p.cancelled ? '-x' : ''}`)).toEqual(['buy', 'buy-x', 'buy', 'extend']);
    expect(hist[3]).toMatchObject({ fromExpiry: '2027-10-11', expiryDate: '2027-10-18', reason: 'ครูป่วย' });
    const sum = (await admin.get('/api/receipts/summary?month=2026-10')).body;
    expect(sum).toMatchObject({ total: 22500, count: 2, cancelled: 1, transfer: 22500 });
    // the dashboard trend line: one point per month, oldest first, cancelled receipts left out (owner 26/10/2026)
    const trend = (await admin.get('/api/receipts/trend?months=24')).body as { month: string; total: number }[];
    expect(trend).toHaveLength(24);
    expect(trend.find((t) => t.month === '2026-10')?.total).toBe(22500);
    expect(trend.map((t) => t.month)).toEqual([...trend.map((t) => t.month)].sort());
    const list = (await admin.get('/api/receipts?month=2026-10')).body;
    expect(list.map((x: { no: string }) => x.no)).toEqual(['RC2610-0003', 'RC2610-0002', 'RC2610-0001']);
    // company details come with a receipt; an Admin may issue but not cancel or extend, and sees no money in the history
    await admin.put('/api/settings/company').set(H).send({ name: 'YODO Co., Ltd.', nameEn: 'YODO', address: 'Bangkok', phone: '02', email: '', taxId: '1234567890123', branch: 'HQ', logo: '', sign: '', stamp: PNG, signName: 'ครูพร' }).expect(200);
    expect((await admin.get('/api/settings/company')).body).toMatchObject({ stamp: expect.stringMatching(/^\/api\/files\/.+\.png$/), signName: 'ครูพร' });
    expect((await admin.put('/api/settings/company').set(H).send({ name: '', nameEn: '', address: '', phone: '', email: '', taxId: '12', branch: '', logo: '', sign: '' })).status).toBe(400);
    expect((await admin.get(`/api/receipts/${r1.body.receipt.id}`)).body.company.taxId).toBe('1234567890123');
    // e-mail: needs the school's Gmail first; the app password never comes back, only its last 4 characters
    const rid = r1.body.receipt.id;
    expect((await admin.post(`/api/receipts/${rid}/email`).set(H).send({ to: 'mum@example.com', lang: 'en' })).body.error).toBe('mail_not_set');
    const ms = await admin.put('/api/settings/mail').set(H).send({ user: 'yodo.school@gmail.com', fromName: 'YODO Dance', pass: 'abcd efgh ijkl mnop' });
    expect(ms.body).toEqual({ user: 'yodo.school@gmail.com', fromName: 'YODO Dance', passSet: true, passLast4: 'mnop' });
    expect(JSON.stringify((await admin.get('/api/settings/mail')).body)).not.toContain('abcd');
    expect((await admin.put('/api/settings/mail').set(H).send({ user: 'yodo.school@gmail.com', fromName: 'YODO Dance', pass: '' })).body.passLast4).toBe('mnop'); // empty = keep
    expect((await admin.post(`/api/receipts/${rid}/email`).set(H).send({ to: 'not-an-email', lang: 'en' })).status).toBe(400);
    const sent = await admin.post(`/api/receipts/${rid}/email`).set(H).send({ to: 'mum@example.com, dad@example.com', lang: 'en', note: 'See you on Saturday' });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const outDir = process.env.MAIL_OUT_DIR!;
    const eml = fs.readdirSync(outDir).map((f) => fs.readFileSync(path.join(outDir, f), 'utf8')).join('\n');
    expect(eml).toContain('Your receipt RC2610-0001');
    expect(eml).toContain('Receipt-RC2610-0001.pdf');
    expect(eml).toContain('application/pdf');
    expect(eml).toContain('mum@example.com');
    expect((await admin.get(`/api/receipts/${rid}`)).body.emails[0]).toMatchObject({ to: 'mum@example.com, dad@example.com', lang: 'en' });
    const pdf = await admin.get(`/api/receipts/${rid}/pdf?lang=th`).buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on('data', (d: Buffer) => b.push(d)); res.on('end', () => cb(null, Buffer.concat(b))); });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((await admin.get(`/api/receipts/${rid}/email-preview?lang=th`)).body.subject).toContain('ใบเสร็จรับเงิน RC2610-0001');
    const audits = JSON.stringify((await admin.get('/api/audit-log')).body);
    expect(audits).not.toContain('mnop');
    const adminRole = (await admin.get('/api/data')).body.positions.find((p: { kind: string }) => p.kind === 'admin');
    await admin.post('/api/users').set(H).send({ firstName: 'Ann', lastName: '', nickname: '', username: 'ann', password: 'secret4', email: '', phone: '', positionId: adminRole.id, image: '' }).expect(201);
    const ann = await login('ann', 'secret4');
    expect((await buy([line(j.body.id, '2027-04-12', '2027-07-11', 4500, 'baht', 0)], '2026-10-21', ann)).status).toBe(201);
    const last = (await ann.get('/api/receipts?month=2026-10')).body[0];
    expect((await ann.post(`/api/receipts/${last.id}/cancel`).set(H).send({})).status).toBe(403);
    expect((await ann.post('/api/courses/extend').set(H).send({ enrollmentId: e6.id, expiryDate: '2027-12-01' })).status).toBe(403);
    expect((await ann.put('/api/settings/company').set(H).send({})).status).toBe(403);
    expect((await ann.get('/api/receipts/summary?month=2026-10')).status).toBe(200);
    expect((await ann.get('/api/data')).body.purchases[0].amount).toBeDefined(); // Admin may view receipts

    // the newest receipt of THIS month can be edited and deleted (number reused); older or last month's ones cannot
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const k = await admin.post('/api/classes').set(H).send({ name: 'Kpop 1m', teacherId: '', description: '', image: '', status: 'Active', price: 3000, months: 1 });
    const kb = await buy([line(k.body.id, today, today, 3000, 'baht', 0)], today);
    expect(kb.status).toBe(201);
    const kid = kb.body.receipt.id;
    const kfull = (await admin.get(`/api/receipts/${kid}`)).body;
    expect(kfull.editable).toBe(true);
    const lastMonth = new Date(Date.parse(today.slice(0, 8) + '01') - 864e5).toISOString().slice(0, 10);
    expect((await ann.put(`/api/receipts/${kid}`).set(H).send({ date: lastMonth, method: 'cash', lines: [{ id: kfull.receipt.lines[0].id, price: 3000, discountType: 'baht', discountValue: 0 }] })).status).toBe(400);
    const ed = await ann.put(`/api/receipts/${kid}`).set(H).send({ date: today, method: 'cash', payer: 'พ่อ', remark: 'ok', lines: [{ id: kfull.receipt.lines[0].id, price: 3000, discountType: 'pct', discountValue: 10 }] });
    expect(ed.status, JSON.stringify(ed.body)).toBe(200);
    expect(ed.body).toMatchObject({ amount: 2700, discount: 300, method: 'cash', payer: 'พ่อ', remark: 'ok', slip: '' });
    const kb2 = await buy([line(k.body.id, today, today, 3000, 'baht', 0)], today);
    expect((await admin.get(`/api/receipts/${kid}`)).body.editable).toBe(false);
    expect((await admin.post(`/api/receipts/${kid}/delete`).set(H).send({})).status).toBe(400);
    expect((await admin.post(`/api/receipts/${kb2.body.receipt.id}/delete`).set(H).send({})).status).toBe(200);
    expect((await admin.get(`/api/receipts/${kb2.body.receipt.id}`)).status).toBe(404);
    const kb3 = await buy([line(k.body.id, today, today, 3000, 'baht', 0)], today);
    expect(kb3.body.receipt.no).toBe(kb2.body.receipt.no); // the number is used again
    // deleting the receipt that put the student in the class takes them out again
    await admin.post(`/api/receipts/${kb3.body.receipt.id}/delete`).set(H).expect(200);
    await ann.post(`/api/receipts/${kid}/delete`).set(H).expect(200);
    const after = (await admin.get('/api/data')).body;
    expect(after.enrollments.some((e: { classId: string }) => e.classId === k.body.id)).toBe(false);
    expect(after.purchases.some((p: { classId: string }) => p.classId === k.body.id)).toBe(false);
    const old = await buy([line(k.body.id, lastMonth, lastMonth, 3000, 'baht', 0)], lastMonth);
    expect((await admin.get(`/api/receipts/${old.body.receipt.id}`)).body.editable).toBe(false); // last month's: final
    expect((await admin.post(`/api/receipts/${old.body.receipt.id}/delete`).set(H).send({})).status).toBe(400);
  });
});

describe('positions and permissions', () => {
  it('a staff member only does what their position allows', async () => {
    const p = await admin.post('/api/positions').set(H).send({ name: 'ครูประจำ', description: '' });
    expect(p.status).toBe(201);
    const u = await admin.post('/api/users').set(H).send({ firstName: 'Mai', lastName: '', nickname: '', username: 'mai', password: 'secret2', email: 'mai@yodo.test', phone: '', positionId: p.body.id, image: '' });
    expect(u.status).toBe(201);
    expect((await admin.post('/api/users').set(H).send({ firstName: '', lastName: '', nickname: '', username: 'mai', password: 'secret2', email: '', phone: '', positionId: '', image: '' })).status).toBe(400);
    const mai = await login('mai@yodo.test', 'secret2'); // email works too
    expect((await mai.post('/api/students').set(H).send(student())).status).toBe(403);
    expect((await mai.get('/api/audit-log')).status).toBe(403);
    // her own account only in the users list
    expect((await mai.get('/api/data')).body.systemUsers).toHaveLength(1);
    const none = { view: false, add: false, edit: false, delete: false };
    await admin.put(`/api/positions/${p.body.id}/permissions`).set(H).send({ students: { view: true, add: true, edit: false, delete: false }, auditlog: none }).expect(200);
    expect((await mai.post('/api/students').set(H).send(student({ firstName: 'จากใหม่' }))).status).toBe(201);
    expect((await mai.delete(`/api/students/${studentId}`).set(H)).status).toBe(403);
    // the system position cannot be edited, an in-use position cannot be deleted
    const sys = (await admin.get('/api/data')).body.positions.find((x: { isSystem: boolean }) => x.isSystem);
    expect((await admin.put(`/api/positions/${sys.id}/permissions`).set(H).send({})).status).toBe(400);
    expect((await admin.delete(`/api/positions/${p.body.id}`).set(H)).status).toBe(400);
    // disabling signs her out
    await admin.post(`/api/users/${u.body.id}/status`).set(H).send({ status: 'Disabled' }).expect(200);
    expect((await mai.get('/api/me')).status).toBe(401);
    const me = (await admin.get('/api/me')).body;
    expect((await admin.delete(`/api/users/${me.id}`).set(H)).status).toBe(400);
  });

  it('password change signs out other sessions', async () => {
    const other = await login('owner', 'secret1');
    expect((await admin.post('/api/me/password').set(H).send({ current: 'wrong', next: 'secret9' })).status).toBe(400);
    await admin.post('/api/me/password').set(H).send({ current: 'secret1', next: 'secret9' }).expect(200);
    expect((await admin.get('/api/me')).status).toBe(200);
    expect((await other.get('/api/me')).status).toBe(401);
  });
});

describe('import from the old app', () => {
  it('reads CSV with quotes, new lines, Postgres arrays and pictures', () => {
    const rows = parseCsv('code,first_name,address\nYDO1,"A, B","line1\nline2 ""q"""\n');
    expect(rows).toEqual([{ code: 'YDO1', first_name: 'A, B', address: 'line1\nline2 "q"' }]);
  });
  it('adds the students once, keeping ids, codes and pictures', async () => {
    const csv = [
      'id,code,prefix,first_name,last_name,dob,interested,has_experience,status,image,signature,signed_at,del_flg,created_at',
      `11111111-1111-4111-8111-111111111111,YDO00050,ด.ช.,ต้นกล้า,สุขใจ,2017-01-02,"{Ballet,""Hip Hop""}",true,Active,"${PNG}",,,false,2026-09-30 10:00:00+00`,
      '22222222-2222-4222-8222-222222222222,YDO00051,,ลบแล้ว,,,{},false,Active,,,,true,2026-09-30 10:00:00+00',
      '33333333-3333-4333-8333-333333333333,YDO00001,,ซ้ำรหัส,,,{},false,Active,,,,false,2026-09-30 10:00:00+00',
    ].join('\n');
    const dry = await admin.post('/api/import/students?dry=1').set({ ...H, 'content-type': 'text/plain' }).send(csv);
    expect(dry.body).toMatchObject({ total: 3, added: 2 });
    const r = await admin.post('/api/import/students').set({ ...H, 'content-type': 'text/plain' }).send(csv);
    expect(r.body.added).toBe(2);
    expect(r.body.skipped).toEqual([{ code: 'YDO00001', reason: 'exists' }]);
    const again = await admin.post('/api/import/students').set({ ...H, 'content-type': 'text/plain' }).send(csv);
    expect(again.body.added).toBe(0);
    const d = (await admin.get('/api/data')).body;
    const s = d.students.find((x: { code: string }) => x.code === 'YDO00050');
    expect(s).toMatchObject({ id: '11111111-1111-4111-8111-111111111111', interested: ['Ballet', 'Hip Hop'], hasExperience: true, dob: '2017-01-02' });
    expect(s.image).toMatch(/^\/api\/files\/.+\.png$/);
    expect(fs.existsSync(path.join(UPLOAD_DIR, s.image.split('/').pop()))).toBe(true);
    expect(s.createdAt).toBe('2026-09-30T10:00:00.000Z');
    expect(d.deletedStudentCodes).toContain('YDO00051');
    // the next new student continues after the highest code
    expect((await admin.post('/api/students').set(H).send(student())).body.code).toBe('YDO00052');
  });
});

describe('PIN, Google and Face ID sign-in', () => {
  it('a PIN works only on the device that set it, and five wrong ones remove it', async () => {
    const a = await login('owner', 'secret9');
    expect((await a.post('/api/me/pin').set(H).send({ pin: '12345' })).status).toBe(400); // 4 or 6 digits
    await a.post('/api/me/pin').set(H).send({ pin: '4321' }).expect(200);
    expect((await a.get('/api/me/pin')).body.on).toBe(true);
    // signed out on this device: the pad knows who it is for
    await a.post('/api/auth/logout').set(H).send({}).expect(200);
    expect((await a.get('/api/me')).status).toBe(401);
    expect((await a.get('/api/auth/pin')).body).toMatchObject({ on: true, name: 'Owner' });
    expect((await a.post('/api/auth/pin').set(H).send({ pin: '1111' })).body.error).toBe('wrong_pin');
    await a.post('/api/auth/pin').set(H).send({ pin: '4321' }).expect(200);
    expect((await a.get('/api/me')).status).toBe(200);
    // another device has no PIN
    expect((await request(app).get('/api/auth/pin')).body.on).toBe(false);
    await a.post('/api/auth/logout').set(H).send({});
    for (let i = 0; i < 4; i++) expect((await a.post('/api/auth/pin').set(H).send({ pin: '0000' })).body.error).toBe('wrong_pin');
    expect((await a.post('/api/auth/pin').set(H).send({ pin: '0000' })).body.error).toBe('pin_locked');
    expect((await a.get('/api/auth/pin')).body.on).toBe(false);
  });

  it('changing the password removes the PINs on other devices', async () => {
    const phone = await login('owner', 'secret9');
    await phone.post('/api/me/pin').set(H).send({ pin: '111111' }).expect(200);
    const pc = await login('owner', 'secret9');
    await pc.post('/api/me/pin').set(H).send({ pin: '2222' }).expect(200);
    await pc.post('/api/me/password').set(H).send({ current: 'secret9', next: 'secret8' }).expect(200);
    expect((await phone.get('/api/auth/pin')).body.on).toBe(false);
    expect((await pc.get('/api/me/pin')).body.on).toBe(true);
    admin = pc;
  });

  it('Google signs in only an existing account whose profile email matches', async () => {
    const { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } = await import('jose');
    const { setGoogleKeysForTest } = await import('../src/routes/signin.js');
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    setGoogleKeysForTest(createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k', alg: 'RS256' }] }));
    const cid = '1234-abc.apps.googleusercontent.com';
    const token = (email: string, sub: string, aud = cid) => new SignJWT({ email, email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'k' }).setIssuer('https://accounts.google.com').setAudience(aud).setSubject(sub).setExpirationTime('5m').sign(privateKey);
    expect((await request(app).get('/api/auth/options')).body.googleClientId).toBe('');
    expect((await request(app).post('/api/auth/google').set(H).send({ credential: await token('x@gmail.com', '1') })).body.error).toBe('google_not_set_up');
    expect((await admin.put('/api/settings/google').set(H).send({ googleClientId: 'not-an-id' })).status).toBe(400);
    await admin.put('/api/settings/google').set(H).send({ googleClientId: cid }).expect(200);
    expect((await request(app).get('/api/auth/options')).body.googleClientId).toBe(cid);
    // nobody has this email yet
    expect((await request(app).post('/api/auth/google').set(H).send({ credential: await token('owner@gmail.com', 'g-1') })).body.error).toBe('google_no_account');
    const me = (await admin.get('/api/me')).body;
    await admin.patch('/api/me').set(H).send({ firstName: me.firstName, lastName: me.lastName, nickname: me.nickname, email: 'Owner@Gmail.com', phone: '', image: me.image }).expect(200);
    const g = request.agent(app);
    await g.post('/api/auth/google').set(H).send({ credential: await token('owner@gmail.com', 'g-1') }).expect(200);
    expect((await g.get('/api/me')).body.googleLinked).toBe(true);
    // a token for another app is refused
    expect((await request(app).post('/api/auth/google').set(H).send({ credential: await token('owner@gmail.com', 'g-1', 'other.apps.googleusercontent.com') })).status).toBe(401);
    // a different Google account with the same email cannot take over a linked account
    expect((await request(app).post('/api/auth/google').set(H).send({ credential: await token('owner@gmail.com', 'g-2') })).body.error).toBe('google_no_account');
  });

  it('Face ID needs https and a signed-in person to add one', async () => {
    expect((await admin.post('/api/me/passkeys/options').set({ ...H, origin: 'http://192.168.1.100:8092' }).send({})).body.error).toBe('passkey_needs_https');
    const o = await admin.post('/api/me/passkeys/options').set({ ...H, origin: 'https://mikenas.tail4afc1d.ts.net:8443' }).send({});
    expect(o.body.rp).toMatchObject({ name: 'YODO', id: 'mikenas.tail4afc1d.ts.net' });
    expect((await request(app).post('/api/me/passkeys/options').set({ ...H, origin: 'https://x.test' }).send({})).status).toBe(401);
    expect((await request(app).post('/api/auth/passkey').set({ ...H, origin: 'https://x.test' }).send({ response: {} })).body.error).toBe('passkey_expired');
  });
});

describe('Thai / English', () => {
  it('new accounts start in English; the language is kept with the account and used for notices', async () => {
    expect((await admin.get('/api/me')).body.lang).toBe('en');
    expect((await admin.patch('/api/me/lang').set(H).send({ lang: 'xx' })).status).toBe(400);
    const d = (await admin.get('/api/data')).body;
    const cls = d.classes[0].id, st = d.students[0].id;
    await admin.patch('/api/me/lang').set(H).send({ lang: 'th' }).expect(200);
    expect((await admin.get('/api/me')).body.lang).toBe('th');
    await admin.post('/api/schedules').set(H).send({ items: [{ classId: cls, date: '2026-11-02', start: '10:00', end: '11:00' }] }).expect(201);
    await admin.patch('/api/me/lang').set(H).send({ lang: 'en' }).expect(200);
    await admin.post('/api/schedules').set(H).send({ items: [{ classId: cls, date: '2026-11-03', start: '10:00', end: '11:00' }] }).expect(201);
    const titles = (await admin.get('/api/notices')).body.items.map((n: { title: string }) => n.title);
    expect(titles.slice(0, 2)).toEqual(['New class session', 'มีตารางเรียนใหม่']);
    expect(st).toBeTruthy();
  });
});

describe('import: the real Lovable export format', () => {
  it('reads dd/mm/yyyy dates, t/f, comma lists and rows without an id', async () => {
    const csv = [
      'code,prefix,first_name,last_name,nickname,dob,nationality,nationality_other,religion,address,phone,email,line_id,emergency_name,emergency_phone,relationship,interested,has_experience,experience_detail,source,source_other,status,created_at',
      'YDO00101,ด.ญ.,ทดลอง,นำเข้า,ทด,31/10/2023,ไทย,"",พุทธ,"12/3 ซอย 4, กทม",0811111111,a@b.co,"",แม่,0822222222,แม่,"Ballet, Jazz",t,Ballet,Facebook,"",Active,25/01/2026 07:00',
    ].join('\n');
    const r = await admin.post('/api/import/students').set({ ...H, 'content-type': 'text/plain' }).send(csv);
    expect(r.body).toMatchObject({ total: 1, added: 1 });
    const s = (await admin.get('/api/data')).body.students.find((x: { code: string }) => x.code === 'YDO00101');
    expect(s).toMatchObject({ dob: '2023-10-31', interested: ['Ballet', 'Jazz'], hasExperience: true, address: '12/3 ซอย 4, กทม', createdAt: '2026-01-25T00:00:00.000Z' });
  });
});

describe('notification settings and the bell', () => {
  it('a person can turn kinds off, remove notices, and the SuperAdmin sets the expiry warning days', async () => {
    const d = (await admin.get('/api/data')).body;
    const cls = d.classes[0].id;
    expect((await admin.get('/api/me/notices')).body).toEqual({ off: [], expiryDays: 7 });
    expect((await admin.put('/api/me/notices').set(H).send({ off: ['nope'] })).status).toBe(400);
    await admin.put('/api/me/notices').set(H).send({ off: ['schedule'] }).expect(200);
    const before = (await admin.get('/api/notices')).body.items.length;
    await admin.post('/api/schedules').set(H).send({ items: [{ classId: cls, date: '2026-11-04', start: '10:00', end: '11:00' }] }).expect(201);
    expect((await admin.get('/api/notices')).body.items.length).toBe(before); // turned off: nothing new
    await admin.put('/api/me/notices').set(H).send({ off: [] }).expect(200);
    await admin.post('/api/schedules').set(H).send({ items: [{ classId: cls, date: '2026-11-05', start: '10:00', end: '11:00' }] }).expect(201);
    const list = (await admin.get('/api/notices')).body;
    expect(list.items.length).toBe(before + 1);
    // remove one, then every read one
    const id = list.items[0].id;
    expect((await admin.post('/api/notices/delete').set(H).send({ ids: [id] })).status).toBe(200);
    expect((await admin.get('/api/notices')).body.items.some((n: { id: number }) => n.id === id)).toBe(false);
    await admin.post('/api/notices/read').set(H).send({ all: true });
    await admin.post('/api/notices/delete').set(H).send({ read: true });
    expect((await admin.get('/api/notices')).body).toMatchObject({ unread: 0, items: [] });
    // expiry days: SuperAdmin only, 1-60
    expect((await admin.put('/api/settings/notices').set(H).send({ expiryDays: 0 })).status).toBe(400);
    await admin.put('/api/settings/notices').set(H).send({ expiryDays: 14 }).expect(200);
    expect((await admin.get('/api/me/notices')).body.expiryDays).toBe(14);
    expect((await admin.get('/api/push/devices')).body).toEqual([]);
  });
});

describe('import: pictures for students already there', () => {
  it('fills in a missing photo and signature, never overwrites one', async () => {
    const json = JSON.stringify([{ code: 'YDO00101', first_name: 'ทดลอง', image: PNG, signature: PNG, signed_at: '2026-10-01', ethnicity: 'ไทย' }, { code: 'YDO00050', first_name: 'ต้นกล้า', image: PNG }]);
    const dry = await admin.post('/api/import/students?dry=1').set({ ...H, 'content-type': 'text/plain' }).send(json);
    const s50 = (await admin.get('/api/data')).body.students.find((x: { code: string }) => x.code === 'YDO00050');
    expect(s50?.image, JSON.stringify(s50)).toMatch(/files/);
    expect(dry.body).toMatchObject({ added: 0, pictures: 1 }); // YDO00050 already has a photo
    await admin.post('/api/import/students').set({ ...H, 'content-type': 'text/plain' }).send(json).expect(200);
    const s = (await admin.get('/api/data')).body.students.find((x: { code: string }) => x.code === 'YDO00101');
    expect(s.image).toMatch(/^\/api\/files\//);
    expect(s).toMatchObject({ signedAt: '2026-10-01', firstName: 'ทดลอง', ethnicity: 'ไทย' });
    expect((await admin.post('/api/import/students').set({ ...H, 'content-type': 'text/plain' }).send(json)).body.pictures).toBe(0);
  });
});

describe('student titles back to Thai (owner 12/10/2026)', () => {
  it('maps English and other spellings to the Thai choices by age', () => {
    const t = '2026-10-13';
    expect(thaiPrefix('Miss', '2020-01-01', t)).toBe('ด.ญ.');
    expect(thaiPrefix('Miss', '1990-01-01', t)).toBe('นางสาว');
    expect(thaiPrefix('Miss', '', t)).toBe('ด.ญ.'); // no birthday: most students are children
    expect(thaiPrefix('Master', '2018-01-01', t)).toBe('ด.ช.');
    expect(thaiPrefix('Mr.', '2015-01-01', t)).toBe('ด.ช.');
    expect(thaiPrefix('Mr.', '1980-01-01', t)).toBe('นาย');
    expect(thaiPrefix('Mrs.', '1980-01-01', t)).toBe('นาง');
    expect(thaiPrefix('เด็กหญิง', '2019-01-01', t)).toBe('ด.ญ.');
    expect(thaiPrefix('น.ส.', '2000-01-01', t)).toBe('นางสาว');
    expect(thaiPrefix('ด.ญ.', '2019-01-01', t)).toBeNull();
    expect(thaiPrefix('Dr.', '1980-01-01', t)).toBeNull();
  });
});

describe('clear classes and receipts (owner 17/10/2026)', () => {
  it('only the Owner, only with the typed word; backup first; students stay', async () => {
    const p = await admin.post('/api/positions').set(H).send({ name: 'ทดสอบล้าง', description: '' });
    await admin.post('/api/users').set(H).send({ firstName: 'Nok', lastName: '', nickname: '', username: 'nok', password: 'secret3', email: '', phone: '', positionId: p.body.id, image: '' }).expect(201);
    const nok = await login('nok', 'secret3');
    expect((await nok.post('/api/admin/clear-courses').set(H).send({ confirm: 'ลบทั้งหมด' })).status).toBe(403);
    const before = (await admin.get('/api/admin/clear-courses')).body;
    expect(before.classes).toBeGreaterThan(0);
    const students = (await admin.get('/api/data')).body.students.length;
    expect((await admin.post('/api/admin/clear-courses').set(H).send({ confirm: 'ลบ' })).status).toBe(400);
    const r = await admin.post('/api/admin/clear-courses').set(H).send({ confirm: 'ลบทั้งหมด' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await admin.get('/api/admin/clear-courses')).body).toEqual({ classes: 0, sessions: 0, enrollments: 0, purchases: 0, receipts: 0 });
    const d = (await admin.get('/api/data')).body;
    expect(d.students.length).toBe(students);
    expect(d.classes).toHaveLength(0);
    const fs = await import('node:fs');
    const { BACKUP_DIR } = await import('../src/lib/config.js');
    expect(fs.readdirSync(BACKUP_DIR).some((f: string) => f.includes('-before-clear'))).toBe(true);
  });
});

describe('class length in weeks, days and time (owner 25/10/2026)', () => {
  it('keeps months + weeks, ordered days and the time; refuses an empty length', async () => {
    const base = { name: 'Weeks', teacherId: '', description: '', image: '', status: 'Active', price: 3000 };
    expect((await admin.post('/api/classes').set(H).send({ ...base, months: 0, weeks: 0 })).status).toBe(400);
    expect((await admin.post('/api/classes').set(H).send({ ...base, months: 0, weeks: 8, startTime: '25:00' })).status).toBe(400);
    const r = await admin.post('/api/classes').set(H).send({ ...base, months: 1, weeks: 2, days: ['sat', 'mon'], startTime: '17:00', endTime: '18:30' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ months: 1, weeks: 2, days: ['mon', 'sat'], startTime: '17:00', endTime: '18:30' });
    const d = (await admin.get('/api/data')).body;
    expect(d.expiryDays).toBe(14);
  });
});

describe('chat with support (owner 25/10/2026)', () => {
  it('a user writes, only the SuperAdmin answers, the details stay with the SuperAdmin', async () => {
    const d = (await admin.get('/api/data')).body;
    const pos = d.positions.find((p: { isSystem: boolean }) => !p.isSystem) ?? d.positions[0];
    const u = await admin.post('/api/users').set(H).send({ firstName: 'Ploy', lastName: 'Chat', nickname: 'พลอย', username: 'ploy', password: 'secret9', email: '', phone: '', positionId: pos.id, image: '' });
    expect(u.status, JSON.stringify(u.body)).toBe(201);
    const ploy = await login('ploy', 'secret9');
    expect((await ploy.post('/api/support/me').set(H).send({ text: '' })).status).toBe(400);
    const m = await ploy.post('/api/support/me').set(H).send({ text: 'ปฏิทินเด้ง', image: PNG, page: '/calendar', device: 'phone', version: 'abc1234' });
    expect(m.status).toBe(201);
    expect(m.body.page).toBeUndefined(); // the user never sees the details line
    expect((await admin.get('/api/support/unread')).body).toEqual({ unread: 1, support: true });
    // the SuperAdmin got a bell row that opens the conversation
    const bell = (await admin.get('/api/notices')).body;
    expect(JSON.stringify(bell)).toContain(`/support/${u.body.id}`);
    // others cannot see the inbox or answer
    expect((await ploy.get('/api/support/rooms')).status).toBe(403);
    expect((await ploy.post(`/api/support/rooms/${u.body.id}`).set(H).send({ text: 'x' })).status).toBe(403);
    const rooms = (await admin.get('/api/support/rooms')).body.rooms;
    expect(rooms[0]).toMatchObject({ userId: u.body.id, name: 'พลอย', unread: 1 });
    const room = (await admin.get(`/api/support/rooms/${u.body.id}`)).body;
    expect(room.messages[0]).toMatchObject({ text: 'ปฏิทินเด้ง', page: '/calendar', device: 'phone', version: 'abc1234' });
    expect(room.messages[0].image).toMatch(/^\/api\/files\//);
    expect((await admin.get('/api/support/unread')).body.unread).toBe(0);
    expect((await admin.post(`/api/support/rooms/${u.body.id}`).set(H).send({ text: 'กำลังแก้ให้ครับ' })).status).toBe(201);
    expect((await ploy.get('/api/support/unread')).body.unread).toBe(1);
    const mine = (await ploy.get('/api/support/me')).body.messages;
    expect(mine.map((x: { fromAdmin: boolean }) => x.fromAdmin)).toEqual([false, true]);
    expect(mine[0].read).toBe(true); // the SuperAdmin read it
    expect(JSON.stringify(mine)).not.toContain('abc1234');
    expect((await ploy.get('/api/support/unread')).body.unread).toBe(0);
    // a picture must be a new upload, never an existing file
    expect((await ploy.post('/api/support/me').set(H).send({ image: room.messages[0].image })).status).toBe(400);
  });
});
