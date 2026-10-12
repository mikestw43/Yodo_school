import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ensureSetupCode } from '../src/routes/auth.js';
import { DATA_DIR, UPLOAD_DIR } from '../src/lib/config.js';
import { parseCsv } from '../src/routes/importer.js';

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
    const t = await admin.post('/api/teachers').set(H).send({ image: PNG, prefix: 'นาง', firstName: 'ครูแอน', lastName: '', nickname: '', phone: '', email: '', lineId: '', specializations: ['Ballet'] });
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
      `11111111-1111-4111-8111-111111111111,YDO00050,ด.ช.,ต้นกล้า,สุขใจ,2017-01-02,"{Ballet,""Hip Hop""}",true,Active,${PNG},,,false,2026-09-30 10:00:00+00`,
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
    expect(fs.existsSync(path.join(UPLOAD_DIR, s.image.split('/').pop()))).toBe(true);
    expect(d.deletedStudentCodes).toContain('YDO00051');
    // the next new student continues after the highest code
    expect((await admin.post('/api/students').set(H).send(student())).body.code).toBe('YDO00052');
  });
});
