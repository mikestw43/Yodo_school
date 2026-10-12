import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from './config.js';
import { bad } from './http.js';

// Pictures (profile photos, class covers, receipts, signatures) arrive from the browser as data URLs
// and are kept as files; the database only holds "/api/files/<name>".
export const FILE_PREFIX = '/api/files/';
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX = 8 * 1024 * 1024;

export const fileName = (v: string) => (v.startsWith(FILE_PREFIX) ? v.slice(FILE_PREFIX.length) : '');
export const isFileName = (n: string) => /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(n);

export function storeImage(v: string | undefined | null): string {
  if (!v) return '';
  if (v.startsWith(FILE_PREFIX)) {
    const n = fileName(v);
    if (!isFileName(n) || !fs.existsSync(path.join(UPLOAD_DIR, n))) throw bad('bad_image');
    return v;
  }
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(v);
  const ext = m ? TYPES[m[1]!] : undefined;
  if (!m || !ext) throw bad('bad_image');
  const buf = Buffer.from(m[2]!, 'base64');
  if (!buf.length || buf.length > MAX) throw bad('bad_image');
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return FILE_PREFIX + name;
}
