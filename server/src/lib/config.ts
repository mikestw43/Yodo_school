import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Everything that must survive a redeploy lives in DATA_DIR (a Docker volume):
// the SQLite file, uploads, backups and the generated secrets.
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const DB_FILE = path.join(DATA_DIR, 'yodo.db');

for (const d of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR]) fs.mkdirSync(d, { recursive: true });

if (!process.env.DATABASE_URL) process.env.DATABASE_URL = `file:${DB_FILE}`;

type Secrets = { jwtSecret: string; encryptionKey: string };

// Generated once on first start and kept in the data folder. The encryption
// key must never change after real data exists, or encrypted fields become
// unreadable, so it is created now even though this stage does not use it.
function loadSecrets(): Secrets {
  const file = path.join(DATA_DIR, 'secrets.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const s: Secrets = {
    jwtSecret: crypto.randomBytes(48).toString('base64url'),
    encryptionKey: crypto.randomBytes(32).toString('base64'),
  };
  fs.writeFileSync(file, JSON.stringify(s, null, 2), { mode: 0o600 });
  return s;
}

export const secrets = loadSecrets();
export const PORT = Number(process.env.APP_PORT ?? 3000);
export const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR ?? '../client/dist');
export const EXTRA_DIR = path.resolve(process.env.EXTRA_DIR ?? '../web');
