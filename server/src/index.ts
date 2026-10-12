import { PORT } from './lib/config.js';
import { createApp } from './app.js';
import { ensureSetupCode } from './routes/auth.js';
import { scheduleDailyBackup } from './lib/backup.js';
import { scheduleExpiryCheck } from './lib/notify.js';
import { prisma } from './lib/db.js';
import { ensureRoles } from './lib/roles.js';

await ensureSetupCode();
// Once (owner 12/10/2026: English first): accounts made before the language switch existed start in English.
if (!(await prisma.noticeKey.findUnique({ where: { key: 'once:lang-en' } }))) {
  await prisma.user.updateMany({ data: { lang: 'en' } });
  await prisma.noticeKey.create({ data: { key: 'once:lang-en' } });
}
await ensureRoles();
scheduleDailyBackup();
scheduleExpiryCheck();
createApp().listen(PORT, () => console.log(`YODO listening on :${PORT}`));
