// Run by deploy/update.sh before every update: `node dist/backup-cli.js`.
import fs from 'node:fs';
import { DB_FILE } from './lib/config.js';
import { backupNow } from './lib/backup.js';
import { prisma } from './lib/db.js';

if (!fs.existsSync(DB_FILE)) {
  console.log('no database yet, nothing to back up');
  process.exit(0);
}
backupNow(process.argv[2] ?? 'predeploy')
  .then((f) => { console.log('backup written:', f); return prisma.$disconnect(); })
  .catch((e) => { console.error('backup failed:', e); process.exit(1); });
