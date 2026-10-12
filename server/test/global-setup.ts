import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Fresh data folder and database for every test run.
export default function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yodo-test-'));
  process.env.DATA_DIR = dir;
  process.env.DATABASE_URL = `file:${path.join(dir, 'yodo.db')}`;
  process.env.MAIL_OUT_DIR = path.join(dir, 'mail-out'); // e-mails are written to files, never sent
  execSync('npx prisma db push --skip-generate', { stdio: 'ignore', env: process.env });
  return () => fs.rmSync(dir, { recursive: true, force: true });
}
