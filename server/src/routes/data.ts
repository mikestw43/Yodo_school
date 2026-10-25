import { Router, type Request } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import type { DanceClass, Enrollment, Position, Schedule, Student, Teacher, User } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { bad, notFound } from '../lib/http.js';
import { MENU_KEYS, can, displayName, isOwner, requireAuth, requireOwner, requirePerm } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { storeImage } from '../lib/images.js';
import { isDate } from '../lib/dates.js';
import { fdate, notifyAll } from '../lib/notify.js';
import { optEmail, optPhone, username } from './auth.js';
import { dropPins } from './pin.js';
import { purchaseOut, seesMoney } from './courses.js';

// The school's data, in the same shape the old app's pages used (src/lib/yodo-store.tsx on the client).
export const router = Router();

const list = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const iso = (d: Date) => d.toISOString();

export const studentOut = (s: Student) => ({
  id: s.id, code: s.code, prefix: s.prefix, firstName: s.firstName, lastName: s.lastName, nickname: s.nickname, dob: s.dob,
  nationality: s.nationality, nationalityOther: s.nationalityOther, religion: s.religion, religionOther: s.religionOther,
  ethnicity: s.ethnicity, ethnicityOther: s.ethnicityOther, address: s.address, phone: s.phone,
  email: s.email, lineId: s.lineId, emergencyName: s.emergencyName, emergencyPhone: s.emergencyPhone, relationship: s.relationship,
  image: s.image, interested: list(s.interested), hasExperience: s.hasExperience, experienceDetail: s.experienceDetail,
  source: s.source, sourceOther: s.sourceOther, status: s.status, createdAt: iso(s.createdAt), signature: s.signature, signedAt: s.signedAt,
});
const teacherOut = (t: Teacher) => ({
  id: t.id, image: t.image, prefix: t.prefix, firstName: t.firstName, lastName: t.lastName, nickname: t.nickname, phone: t.phone,
  email: t.email, lineId: t.lineId, specializations: list(t.specializations), status: t.status,
});
const classOut = (c: DanceClass) => ({ id: c.id, name: c.name, teacherId: c.teacherId ?? '', description: c.description, image: c.image, status: c.status, disabled: c.disabled, price: c.price, months: c.months, weeks: c.weeks, days: c.days ? c.days.split(',') : [], startTime: c.startTime, endTime: c.endTime });
const enrollmentOut = (e: Enrollment) => ({
  id: e.id, studentId: e.studentId, classId: e.classId, joinedAt: iso(e.joinedAt), purchaseDate: e.purchaseDate, startDate: e.startDate,
  expiryDate: e.expiryDate, remark: e.remark, receiptImage: e.receiptImage,
});
const scheduleOut = (s: Schedule) => ({ id: s.id, classId: s.classId, date: s.date, start: s.startTime, end: s.endTime });
const positionOut = (p: Position) => ({ id: p.id, name: p.name, description: p.description, isSystem: p.isSystem, kind: p.kind });
const userOut = (u: User) => ({
  id: u.id, firstName: u.firstName, lastName: u.lastName, nickname: u.nickname, username: u.username, password: '', email: u.email,
  phone: u.phone, positionId: u.positionId ?? '', image: u.image, status: u.status, createdAt: iso(u.createdAt), superadmin: u.role === 'superadmin',
});

const emptyPerms = () => Object.fromEntries(MENU_KEYS.map((k) => [k, { view: false, add: false, edit: false, delete: false }]));

router.get('/data', requireAuth, async (req, res) => {
  const [students, teachers, classes, enrollments, schedules, scheduleStudents, positions, perms, users, purchases, setting] = await Promise.all([
    prisma.student.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.teacher.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.danceClass.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.enrollment.findMany({ orderBy: { joinedAt: 'asc' } }),
    prisma.schedule.findMany({ orderBy: { date: 'asc' } }),
    prisma.scheduleStudent.findMany(),
    prisma.position.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.positionPermission.findMany(),
    prisma.user.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.coursePurchase.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.setting.findUnique({ where: { id: 1 } }),
  ]);
  const receiptNos = new Map((await prisma.receipt.findMany({ select: { id: true, no: true } })).map((r) => [r.id, r.no]));
  const live = students.filter((s) => !s.deletedAt);
  const liveIds = new Set(live.map((s) => s.id));
  const permissions: Record<string, Record<string, { view: boolean; add: boolean; edit: boolean; delete: boolean }>> = {};
  for (const p of positions) permissions[p.id] = emptyPerms();
  for (const r of perms) {
    const m = permissions[r.positionId];
    if (m && r.menuKey in m) m[r.menuKey] = { view: r.canView, add: r.canAdd, edit: r.canEdit, delete: r.canDelete };
  }
  // Staff accounts are only listed to those who may see the Users page (the menu needs everyone's own name only).
  const seeUsers = await can(req.user, 'users', 'view');
  const money = await seesMoney(req);
  // The SuperAdmin (Dev) account and its role are hidden from everyone else (owner 12/10/2026).
  const dev = req.user!.role === 'superadmin';
  const shownPositions = positions.filter((p) => dev || p.kind !== 'superadmin');
  const shownUsers = users.filter((u) => u.id === req.user!.id || dev || u.role !== 'superadmin');
  res.json({
    students: live.map(studentOut),
    deletedStudentCodes: students.filter((s) => s.deletedAt).map((s) => s.code),
    teachers: teachers.map(teacherOut),
    classes: classes.map(classOut),
    enrollments: enrollments.filter((e) => liveIds.has(e.studentId)).map(enrollmentOut),
    // Course history (owner 12/10/2026); amounts only for those who may see money.
    purchases: purchases.filter((p) => liveIds.has(p.studentId)).map((p) => purchaseOut(p, money, receiptNos.get(p.receiptId) ?? '')),
    expiryDays: setting?.expiryDays ?? 14,
    schedules: schedules.map(scheduleOut),
    scheduleStudents: scheduleStudents.filter((x) => liveIds.has(x.studentId)),
    positions: shownPositions.map(positionOut),
    systemUsers: (seeUsers ? shownUsers : users.filter((u) => u.id === req.user!.id)).map(userOut),
    permissions: Object.fromEntries(Object.entries(permissions).filter(([pid]) => shownPositions.some((p) => p.id === pid))),
    owner: await isOwner(req.user),
  });
});

// ---------- helpers ----------
const id = z.string().uuid();
const date = z.string().refine((v) => v === '' || isDate(v), 'date_format');
const text = (max = 200) => z.string().trim().max(max);
const img = z.string().max(12_000_000);
const status = z.enum(['Active', 'Disabled']);
const param = (req: Request) => id.parse(req.params.id);

async function liveStudent(sid: string) {
  const s = await prisma.student.findFirst({ where: { id: sid, deletedAt: null } });
  if (!s) throw notFound();
  return s;
}
const studentLabel = (s: Student) => [s.code, s.firstName, s.lastName].filter(Boolean).join(' ');
const teacherLabel = (t: Teacher) => [t.firstName, t.lastName].filter(Boolean).join(' ');

export function nextStudentCode(codes: string[]) {
  const max = codes.reduce((m, c) => Math.max(m, parseInt(c.replace('YDO', ''), 10) || 0), 0);
  return 'YDO' + String(max + 1).padStart(5, '0');
}

// ---------- students ----------
export const studentBody = z.object({
  prefix: text(30), firstName: text(100).min(1), lastName: text(100), nickname: text(100), dob: date,
  nationality: text(60), nationalityOther: text(100), religion: text(60), religionOther: text(100).default(''),
  ethnicity: text(60).default(''), ethnicityOther: text(100).default(''), address: text(1000), phone: text(20), email: text(255),
  lineId: text(100), emergencyName: text(200), emergencyPhone: text(20), relationship: text(100), image: img,
  interested: z.array(text(60)).max(30), hasExperience: z.boolean(), experienceDetail: text(1000), source: text(300), sourceOther: text(200),
});
const studentData = (b: z.infer<typeof studentBody>) => ({ ...b, image: storeImage(b.image), interested: JSON.stringify(b.interested) });

router.post('/students', requirePerm('students', 'add'), async (req, res) => {
  // A signature drawn in the add form comes with the student (owner 12/10/2026).
  const b = studentBody.extend({ id: id.optional(), signature: img.optional(), signedAt: date.optional() }).parse(req.body);
  const { id: sid, signature, signedAt, ...rest } = b;
  const signed = signature && signedAt ? { signature: storeImage(signature), signedAt } : {};
  const s = await prisma.$transaction(async (db) => {
    const codes = (await db.student.findMany({ select: { code: true } })).map((x) => x.code);
    return db.student.create({ data: { ...(sid ? { id: sid } : {}), code: nextStudentCode(codes), ...studentData(rest), ...signed } });
  });
  await audit(req, 'insert', 'students', s.id, studentLabel(s), null, s);
  res.status(201).json(studentOut(s));
});

router.put('/students/:id', requirePerm('students', 'edit'), async (req, res) => {
  const before = await liveStudent(param(req));
  const after = await prisma.student.update({ where: { id: before.id }, data: studentData(studentBody.parse(req.body)) });
  await audit(req, 'update', 'students', after.id, studentLabel(after), before, after);
  res.json(studentOut(after));
});

router.post('/students/:id/status', requirePerm('students', 'edit'), async (req, res) => {
  const before = await liveStudent(param(req));
  const after = await prisma.student.update({ where: { id: before.id }, data: { status: z.object({ status }).parse(req.body).status } });
  await audit(req, 'update', 'students', after.id, studentLabel(after), before, after);
  res.json(studentOut(after));
});

router.post('/students/:id/sign', requirePerm('students', 'edit'), async (req, res) => {
  const b = z.object({ signature: img, signedAt: date }).parse(req.body);
  const before = await liveStudent(param(req));
  const after = await prisma.student.update({ where: { id: before.id }, data: { signature: storeImage(b.signature), signedAt: b.signedAt } });
  await audit(req, 'update', 'students', after.id, studentLabel(after), before, after);
  res.json(studentOut(after));
});

// Soft delete: the code stays used so it is never given again.
router.delete('/students/:id', requirePerm('students', 'delete'), async (req, res) => {
  const before = await liveStudent(param(req));
  await prisma.student.update({ where: { id: before.id }, data: { deletedAt: new Date() } });
  await audit(req, 'delete', 'students', before.id, studentLabel(before), before, null);
  res.json({ ok: true });
});

// ---------- enrollments (a student's classes) ----------
const enrollBody = z.object({ classId: id, purchaseDate: date, startDate: date, expiryDate: date, remark: text(1000), receiptImage: img });
const enrollLabel = async (e: { studentId: string; classId: string }) => {
  const [s, c] = await Promise.all([prisma.student.findUnique({ where: { id: e.studentId } }), prisma.danceClass.findUnique({ where: { id: e.classId } })]);
  return { s, c, label: [s ? `${s.code} ${s.firstName}` : '', c?.name ?? ''].join(' → ') };
};

router.post('/enrollments', requirePerm('students', 'edit'), async (req, res) => {
  const b = enrollBody.extend({ id: id.optional(), studentId: id }).parse(req.body);
  await liveStudent(b.studentId);
  if (!(await prisma.danceClass.findUnique({ where: { id: b.classId } }))) throw notFound();
  if (await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId: b.studentId, classId: b.classId } } })) throw bad('already_enrolled');
  const { id: eid, ...rest } = b;
  const e = await prisma.enrollment.create({ data: { ...(eid ? { id: eid } : {}), ...rest, receiptImage: storeImage(rest.receiptImage) } });
  const { label } = await enrollLabel(e);
  await audit(req, 'insert', 'enrollments', e.id, label, null, e);
  void notifyAll({ kind: 'enrollment', ref: `enrollment:${e.id}`, url: '/students', text: (l) => ({ title: l === 'th' ? 'ลงทะเบียนคลาสใหม่' : 'New class enrollment', body: label }) });
  res.status(201).json(enrollmentOut(e));
});

router.put('/enrollments/:id', requirePerm('students', 'edit'), async (req, res) => {
  const b = enrollBody.parse(req.body);
  const before = await prisma.enrollment.findUnique({ where: { id: param(req) } });
  if (!before) throw notFound();
  await liveStudent(before.studentId);
  if (!(await prisma.danceClass.findUnique({ where: { id: b.classId } }))) throw notFound();
  if (b.classId !== before.classId && (await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId: before.studentId, classId: b.classId } } }))) throw bad('already_enrolled');
  const after = await prisma.enrollment.update({ where: { id: before.id }, data: { ...b, receiptImage: storeImage(b.receiptImage) } });
  const { label } = await enrollLabel(after);
  await audit(req, 'update', 'enrollments', after.id, label, before, after);
  void notifyAll({ kind: 'enrollment', ref: `enrollment:${after.id}`, url: '/students', text: (l) => ({ title: l === 'th' ? 'แก้ไขการลงทะเบียน' : 'Enrollment changed', body: label }) });
  res.json(enrollmentOut(after));
});

// Leaving a class also takes the student off that class's sessions.
router.post('/enrollments/remove', requirePerm('students', 'edit'), async (req, res) => {
  const b = z.object({ studentId: id, classId: id }).parse(req.body);
  const e = await prisma.enrollment.findUnique({ where: { studentId_classId: b } });
  if (!e) throw notFound();
  const sched = (await prisma.schedule.findMany({ where: { classId: b.classId }, select: { id: true } })).map((s) => s.id);
  await prisma.$transaction([
    prisma.enrollment.delete({ where: { id: e.id } }),
    prisma.scheduleStudent.deleteMany({ where: { studentId: b.studentId, scheduleId: { in: sched } } }),
  ]);
  const { label } = await enrollLabel(e);
  await audit(req, 'delete', 'enrollments', e.id, label, e, null);
  res.json({ ok: true });
});

// ---------- teachers ----------
const teacherBody = z.object({
  image: img, prefix: text(30), firstName: text(100).min(1), lastName: text(100), nickname: text(100), phone: text(20),
  email: text(255), lineId: text(100), specializations: z.array(text(60)).max(30),
});
const teacherData = (b: z.infer<typeof teacherBody>) => ({ ...b, image: storeImage(b.image), specializations: JSON.stringify(b.specializations) });
async function liveTeacher(tid: string) {
  const t = await prisma.teacher.findFirst({ where: { id: tid, deletedAt: null } });
  if (!t) throw notFound();
  return t;
}

router.post('/teachers', requirePerm('teachers', 'add'), async (req, res) => {
  const { id: tid, ...rest } = teacherBody.extend({ id: id.optional() }).parse(req.body);
  const t = await prisma.teacher.create({ data: { ...(tid ? { id: tid } : {}), ...teacherData(rest) } });
  await audit(req, 'insert', 'teachers', t.id, teacherLabel(t), null, t);
  res.status(201).json(teacherOut(t));
});
router.put('/teachers/:id', requirePerm('teachers', 'edit'), async (req, res) => {
  const before = await liveTeacher(param(req));
  const after = await prisma.teacher.update({ where: { id: before.id }, data: teacherData(teacherBody.parse(req.body)) });
  await audit(req, 'update', 'teachers', after.id, teacherLabel(after), before, after);
  res.json(teacherOut(after));
});
router.post('/teachers/:id/status', requirePerm('teachers', 'edit'), async (req, res) => {
  const before = await liveTeacher(param(req));
  const after = await prisma.teacher.update({ where: { id: before.id }, data: { status: z.object({ status }).parse(req.body).status } });
  await audit(req, 'update', 'teachers', after.id, teacherLabel(after), before, after);
  res.json(teacherOut(after));
});
router.delete('/teachers/:id', requirePerm('teachers', 'delete'), async (req, res) => {
  const before = await liveTeacher(param(req));
  await prisma.teacher.update({ where: { id: before.id }, data: { deletedAt: new Date() } });
  await audit(req, 'delete', 'teachers', before.id, teacherLabel(before), before, null);
  res.json({ ok: true });
});

// ---------- classes ----------
const classBody = z.object({
  name: text(200).min(1), teacherId: z.union([id, z.literal('')]), description: text(2000), image: img,
  status: z.enum(['Active', 'Inactive']), price: z.number().min(0).max(10_000_000).nullable(),
  months: z.number().int().min(0).max(120).default(1),
  weeks: z.number().int().min(0).max(52).default(0),
  days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).max(7).default([]),
  startTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_format'), z.literal('')]).default(''),
  endTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_format'), z.literal('')]).default(''),
}).refine((b) => b.months + b.weeks > 0, { message: 'class_length', path: ['months'] });
async function classData(b: z.infer<typeof classBody>) {
  if (b.teacherId) await liveTeacher(b.teacherId);
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return { ...b, days: order.filter((d) => b.days.includes(d as never)).join(','), teacherId: b.teacherId || null, image: storeImage(b.image) };
}
async function getClass(cid: string) {
  const c = await prisma.danceClass.findUnique({ where: { id: cid } });
  if (!c) throw notFound();
  return c;
}
router.post('/classes', requirePerm('classes', 'add'), async (req, res) => {
  const { id: cid, ...rest } = z.object({ id: id.optional() }).passthrough().parse(req.body);
  const c = await prisma.danceClass.create({ data: { ...(cid ? { id: cid } : {}), ...(await classData(classBody.parse(rest))) } });
  await audit(req, 'insert', 'classes', c.id, c.name, null, c);
  res.status(201).json(classOut(c));
});
router.put('/classes/:id', requirePerm('classes', 'edit'), async (req, res) => {
  const before = await getClass(param(req));
  const after = await prisma.danceClass.update({ where: { id: before.id }, data: await classData(classBody.parse(req.body)) });
  await audit(req, 'update', 'classes', after.id, after.name, before, after);
  res.json(classOut(after));
});
router.post('/classes/:id/disabled', requirePerm('classes', 'edit'), async (req, res) => {
  const before = await getClass(param(req));
  const after = await prisma.danceClass.update({ where: { id: before.id }, data: { disabled: z.object({ disabled: z.boolean() }).parse(req.body).disabled } });
  await audit(req, 'update', 'classes', after.id, after.name, before, after);
  res.json(classOut(after));
});

// ---------- calendar ----------
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_format');
const scheduleLabel = async (s: Schedule) => `${(await prisma.danceClass.findUnique({ where: { id: s.classId } }))?.name ?? ''} ${s.date} ${s.startTime}`.trim();

router.post('/schedules', requirePerm('calendar', 'add'), async (req, res) => {
  const { items } = z.object({ items: z.array(z.object({ id: id.optional(), classId: id, date: z.string().refine(isDate, 'date_format'), start: time, end: time })).min(1).max(400) }).parse(req.body);
  for (const cid of new Set(items.map((i) => i.classId))) await getClass(cid);
  const made: Schedule[] = [];
  for (const i of items) {
    const s = await prisma.schedule.create({ data: { ...(i.id ? { id: i.id } : {}), classId: i.classId, date: i.date, startTime: i.start, endTime: i.end } });
    made.push(s);
    await audit(req, 'insert', 'schedules', s.id, await scheduleLabel(s), null, s);
  }
  const c = await getClass(items[0]!.classId);
  const first = made[0]!;
  const when = `${c.name} · ${fdate(first.date)} ${first.startTime}-${first.endTime}${made.length > 1 ? ` (+${made.length - 1})` : ''}`;
  void notifyAll({ kind: 'schedule', ref: `schedule:${first.id}`, url: '/calendar', text: (l) => ({ title: l === 'th' ? 'มีตารางเรียนใหม่' : 'New class session', body: when }) });
  res.status(201).json(made.map(scheduleOut));
});

router.delete('/schedules/:id', requirePerm('calendar', 'delete'), async (req, res) => {
  const s = await prisma.schedule.findUnique({ where: { id: param(req) } });
  if (!s) throw notFound();
  await prisma.$transaction([prisma.scheduleStudent.deleteMany({ where: { scheduleId: s.id } }), prisma.schedule.delete({ where: { id: s.id } })]);
  await audit(req, 'delete', 'schedules', s.id, await scheduleLabel(s), s, null);
  res.json({ ok: true });
});

// Only students who are enrolled in the session's class (and active) can be put on it.
router.post('/schedules/:id/students', requirePerm('calendar', 'edit'), async (req, res) => {
  const { studentId } = z.object({ studentId: id }).parse(req.body);
  const s = await prisma.schedule.findUnique({ where: { id: param(req) } });
  if (!s) throw notFound();
  const st = await liveStudent(studentId);
  if (st.status !== 'Active' || !(await prisma.enrollment.findUnique({ where: { studentId_classId: { studentId, classId: s.classId } } }))) throw bad('not_enrolled');
  const key = { scheduleId: s.id, studentId };
  if (await prisma.scheduleStudent.findUnique({ where: { scheduleId_studentId: key } })) return void res.json({ ok: true });
  await prisma.scheduleStudent.create({ data: key });
  await audit(req, 'insert', 'schedule_students', `${s.id}:${studentId}`, `${st.code} ${st.firstName} → ${await scheduleLabel(s)}`, null, { schedule_id: s.id, student_id: studentId }, true);
  res.status(201).json({ ok: true });
});

router.delete('/schedules/:id/students/:studentId', requirePerm('calendar', 'edit'), async (req, res) => {
  const key = { scheduleId: param(req), studentId: id.parse(req.params.studentId) };
  const row = await prisma.scheduleStudent.findUnique({ where: { scheduleId_studentId: key } });
  if (!row) throw notFound();
  await prisma.scheduleStudent.delete({ where: { scheduleId_studentId: key } });
  const [s, st] = await Promise.all([prisma.schedule.findUnique({ where: { id: key.scheduleId } }), prisma.student.findUnique({ where: { id: key.studentId } })]);
  await audit(req, 'delete', 'schedule_students', `${key.scheduleId}:${key.studentId}`, `${st ? `${st.code} ${st.firstName}` : ''} → ${s ? await scheduleLabel(s) : ''}`, { schedule_id: key.scheduleId, student_id: key.studentId }, null, true);
  res.json({ ok: true });
});

// ---------- positions and permissions ----------
const positionBody = z.object({ name: text(100).min(1), description: text(500) });
async function editablePosition(pid: string) {
  const p = await prisma.position.findUnique({ where: { id: pid } });
  if (!p) throw notFound();
  if (p.isSystem) throw bad('system_position');
  return p;
}
// Built-in roles (Partner, Admin) keep their kind; only roles the Owner added can be deleted.
async function deletablePosition(pid: string) {
  const p = await editablePosition(pid);
  if (p.kind) throw bad('builtin_role');
  return p;
}
router.post('/positions', requireOwner, async (req, res) => {
  const { id: pid, ...b } = positionBody.extend({ id: id.optional() }).parse(req.body);
  const p = await prisma.position.create({ data: { ...(pid ? { id: pid } : {}), ...b } });
  await audit(req, 'insert', 'positions', p.id, p.name, null, p);
  res.status(201).json(positionOut(p));
});
router.put('/positions/:id', requireOwner, async (req, res) => {
  const before = await editablePosition(param(req));
  const after = await prisma.position.update({ where: { id: before.id }, data: positionBody.parse(req.body) });
  await audit(req, 'update', 'positions', after.id, after.name, before, after);
  res.json(positionOut(after));
});
router.delete('/positions/:id', requireOwner, async (req, res) => {
  const p = await deletablePosition(param(req));
  if (await prisma.user.count({ where: { positionId: p.id, deletedAt: null } })) throw bad('position_in_use');
  await prisma.$transaction([prisma.positionPermission.deleteMany({ where: { positionId: p.id } }), prisma.position.delete({ where: { id: p.id } })]);
  await audit(req, 'delete', 'positions', p.id, p.name, p, null);
  res.json({ ok: true });
});
const flags = z.object({ view: z.boolean(), add: z.boolean(), edit: z.boolean(), delete: z.boolean() });
router.put('/positions/:id/permissions', requireOwner, async (req, res) => {
  const p = await editablePosition(param(req));
  const body = z.record(z.enum(MENU_KEYS), flags).parse(req.body);
  for (const [menuKey, f] of Object.entries(body)) {
    const key = { positionId: p.id, menuKey };
    const before = await prisma.positionPermission.findUnique({ where: { positionId_menuKey: key } });
    const data = { canView: f.view, canAdd: f.add, canEdit: f.edit, canDelete: f.delete };
    const after = await prisma.positionPermission.upsert({ where: { positionId_menuKey: key }, create: { ...key, ...data }, update: data });
    await audit(req, before ? 'update' : 'insert', 'position_permissions', `${p.id}:${menuKey}`, `${p.name} · ${menuKey}`, before, after);
  }
  res.json({ ok: true });
});

// ---------- system users (staff accounts) ----------
const userBody = z.object({
  firstName: text(100), lastName: text(100), nickname: text(100), username, password: z.string().max(100),
  email: optEmail, phone: optPhone, positionId: z.union([id, z.literal('')]), image: img,
});
async function userData(b: z.infer<typeof userBody>, selfId?: string, req?: Request, keepPositionId?: string | null) {
  const pos = b.positionId ? await prisma.position.findUnique({ where: { id: b.positionId } }) : null;
  if (b.positionId && !pos) throw bad('unknown_position');
  const changed = !!pos && pos.id !== keepPositionId;
  if (changed && pos.kind === 'superadmin' && req?.user?.role !== 'superadmin') throw bad('unknown_position');
  if (changed && pos.isSystem && req && !(await isOwner(req.user))) throw bad('owner_only');
  const taken = await prisma.user.findFirst({ where: { username: b.username, ...(selfId ? { id: { not: selfId } } : {}) } });
  if (taken) throw bad('username_taken');
  return {
    firstName: b.firstName, lastName: b.lastName, nickname: b.nickname, username: b.username, email: b.email, phone: b.phone,
    positionId: b.positionId || null, image: storeImage(b.image),
  };
}
async function liveUser(uid: string) {
  const u = await prisma.user.findFirst({ where: { id: uid, deletedAt: null } });
  if (!u) throw notFound();
  return u;
}
router.post('/users', requirePerm('users', 'add'), async (req, res) => {
  const b = userBody.extend({ password: z.string().min(6).max(100) }).parse(req.body);
  const u = await prisma.user.create({ data: { ...(await userData(b, undefined, req)), passwordHash: await bcrypt.hash(b.password, 12) } });
  await audit(req, 'insert', 'profiles', u.id, u.username, null, u);
  res.status(201).json(userOut(u));
});
router.put('/users/:id', requirePerm('users', 'edit'), async (req, res) => {
  const before = await liveUser(param(req));
  const b = userBody.parse(req.body);
  if (b.password && b.password.length < 6) throw bad('password_too_short');
  // A SuperAdmin keeps the system position (never lock the owner out by accident).
  if (before.role === 'superadmin' && b.positionId !== (before.positionId ?? '')) {
    const sys = b.positionId ? await prisma.position.findUnique({ where: { id: b.positionId } }) : null;
    if (!sys?.isSystem) throw bad('superadmin_position');
  }
  const after = await prisma.user.update({
    where: { id: before.id },
    data: { ...(await userData(b, before.id, req, before.positionId)), ...(b.password ? { passwordHash: await bcrypt.hash(b.password, 12), tokenVersion: { increment: 1 } } : {}) },
  });
  if (b.password) await dropPins(after.id, after.id === req.user!.id ? req : undefined);
  await audit(req, 'update', 'profiles', after.id, after.username, before, after);
  res.json(userOut(after));
});
router.post('/users/:id/status', requirePerm('users', 'edit'), async (req, res) => {
  const before = await liveUser(param(req));
  const s = z.object({ status }).parse(req.body).status;
  if (s === 'Disabled' && before.id === req.user!.id) throw bad('cannot_disable_self');
  if (s === 'Disabled' && before.role === 'superadmin') throw bad('cannot_disable_superadmin');
  const after = await prisma.user.update({ where: { id: before.id }, data: { status: s, ...(s === 'Disabled' ? { tokenVersion: { increment: 1 } } : {}) } });
  if (s === 'Disabled') await dropPins(after.id);
  await audit(req, 'update', 'profiles', after.id, after.username, before, after);
  res.json(userOut(after));
});
router.delete('/users/:id', requirePerm('users', 'delete'), async (req, res) => {
  const before = await liveUser(param(req));
  if (before.id === req.user!.id) throw bad('cannot_delete_self');
  if (before.role === 'superadmin') throw bad('cannot_delete_superadmin');
  // The username is freed (renamed) so it can be used again for a new account.
  await prisma.user.update({ where: { id: before.id }, data: { deletedAt: new Date(), username: `${before.username}#deleted-${Date.now()}`, tokenVersion: { increment: 1 } } });
  await dropPins(before.id);
  await prisma.passkey.updateMany({ where: { userId: before.id, deletedAt: null }, data: { deletedAt: new Date() } });
  await audit(req, 'delete', 'profiles', before.id, before.username, before, null);
  res.json({ ok: true });
});

// ---------- audit log ----------
router.get('/audit-log', requirePerm('auditlog', 'view'), async (_req, res) => {
  const [logs, students, classes, teachers, positions, schedules, users] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.student.findMany({ select: { id: true, code: true, prefix: true, firstName: true, lastName: true } }),
    prisma.danceClass.findMany({ select: { id: true, name: true } }),
    prisma.teacher.findMany({ select: { id: true, prefix: true, firstName: true, lastName: true } }),
    prisma.position.findMany({ select: { id: true, name: true } }),
    prisma.schedule.findMany({ select: { id: true, classId: true, date: true, startTime: true } }),
    prisma.user.findMany(),
  ]);
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const join = (...p: string[]) => p.filter(Boolean).join(' ').trim();
  const thDate = (v: string) => v.split('-').reverse().join('/');
  res.json({
    logs: logs.map((l) => ({
      id: l.id, created_at: iso(l.createdAt), actor_id: l.actorId, actor_name: l.actorName, action: l.action, table_name: l.tableName,
      record_label: l.recordLabel, old_data: l.oldData ? JSON.parse(l.oldData) : null, new_data: l.newData ? JSON.parse(l.newData) : null,
    })),
    lookups: {
      student_id: Object.fromEntries(students.map((s) => [s.id, `${s.code} ${join(s.prefix, s.firstName, s.lastName)}`.trim()])),
      class_id: Object.fromEntries(className),
      teacher_id: Object.fromEntries(teachers.map((t) => [t.id, join(t.prefix, t.firstName, t.lastName)])),
      position_id: Object.fromEntries(positions.map((p) => [p.id, p.name])),
      schedule_id: Object.fromEntries(schedules.map((s) => [s.id, `${className.get(s.classId) ?? 'คลาส'} ${thDate(s.date)} ${s.startTime}`])),
    },
    actors: Object.fromEntries(users.map((u) => [u.id, join(u.firstName, u.lastName) || displayName(u)])),
  });
});
