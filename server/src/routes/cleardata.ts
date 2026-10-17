import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { bad } from '../lib/http.js';
import { requireOwner } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { backupNow } from '../lib/backup.js';

// "Clear classes and receipts" (owner 17/10/2026, mockup 2o1pdZZR6AXvK63C3a4rsf): the Owner presses it in Company
// settings and types "ลบทั้งหมด" / "DELETE ALL". Removes every class with its calendar sessions, every class purchase
// (enrollments + history) and every receipt with its sent-email list, so receipt numbers start again at 0001.
// Students, teachers, users and company settings stay. A backup is written first (kept, never pruned).
export const router = Router();

async function counts() {
  const [classes, sessions, enrollments, purchases, receipts] = await Promise.all([
    prisma.danceClass.count(), prisma.schedule.count(), prisma.enrollment.count(), prisma.coursePurchase.count(), prisma.receipt.count(),
  ]);
  return { classes, sessions, enrollments, purchases, receipts };
}

router.get('/admin/clear-courses', requireOwner, async (_req, res) => {
  res.json(await counts());
});

router.post('/admin/clear-courses', requireOwner, async (req, res) => {
  const { confirm } = z.object({ confirm: z.string() }).parse(req.body);
  if (!['ลบทั้งหมด', 'DELETE ALL'].includes(confirm.trim())) throw bad('confirm_text');
  const before = await counts();
  const backup = await backupNow('before-clear');
  await prisma.$transaction([
    prisma.scheduleStudent.deleteMany({}),
    prisma.schedule.deleteMany({}),
    prisma.receiptEmail.deleteMany({}),
    prisma.coursePurchase.deleteMany({}),
    prisma.receipt.deleteMany({}),
    prisma.enrollment.deleteMany({}),
    prisma.danceClass.deleteMany({}),
  ]);
  await audit(req, 'delete', 'classes', 'all', 'ล้างข้อมูลคลาสและใบเสร็จ', { ...before, backup: backup.split(/[\\/]/).pop() }, null, true);
  res.json({ ok: true, removed: before });
});
