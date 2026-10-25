import { PORT } from './lib/config.js';
import { createApp } from './app.js';
import { ensureSetupCode } from './routes/auth.js';
import { scheduleDailyBackup } from './lib/backup.js';
import { scheduleExpiryCheck } from './lib/notify.js';
import { prisma } from './lib/db.js';
import { ensureRoles } from './lib/roles.js';
import { ensureCourseHistory } from './routes/courses.js';
import { ensureThaiPrefixes } from './lib/prefixes.js';

await ensureSetupCode();
// Once (owner 12/10/2026: English first): accounts made before the language switch existed start in English.
if (!(await prisma.noticeKey.findUnique({ where: { key: 'once:lang-en' } }))) {
  await prisma.user.updateMany({ data: { lang: 'en' } });
  await prisma.noticeKey.create({ data: { key: 'once:lang-en' } });
}
// Once (owner 25/10/2026): "ending soon" warns 14 days ahead instead of 7 (still changeable in profile settings).
if (!(await prisma.noticeKey.findUnique({ where: { key: 'once:expiry-14' } }))) {
  await prisma.setting.updateMany({ where: { id: 1, expiryDays: 7 }, data: { expiryDays: 14 } });
  await prisma.noticeKey.create({ data: { key: 'once:expiry-14' } });
}
await ensureRoles();
await ensureCourseHistory();
await ensureThaiPrefixes();
scheduleDailyBackup();
scheduleExpiryCheck();
createApp().listen(PORT, () => console.log(`YODO listening on :${PORT}`));
