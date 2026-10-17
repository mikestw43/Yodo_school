import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_DIR } from './config.js';
import { prisma } from './db.js';

const KEEP = 30;

// VACUUM INTO writes a consistent copy even while the app is running.
export async function backupNow(reason = 'manual') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = path.join(BACKUP_DIR, `yodo-${stamp}-${reason}.db`);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('yodo-') && f.endsWith('.db') && !f.includes('-before-')).sort(); // before-* backups are kept
  for (const f of all.slice(0, Math.max(0, all.length - KEEP))) fs.unlinkSync(path.join(BACKUP_DIR, f));
  return file;
}

// Daily backup at about 03:00 Bangkok time.
export function scheduleDailyBackup() {
  let lastDay = '';
  setInterval(async () => {
    const now = new Date(Date.now() + 7 * 3600e3);
    const day = now.toISOString().slice(0, 10);
    if (now.getUTCHours() === 3 && day !== lastDay) {
      lastDay = day;
      try { console.log('backup:', await backupNow('daily')); } catch (e) { console.error('backup failed', e); }
    }
  }, 60_000).unref();
}
