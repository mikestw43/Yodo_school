import crypto from 'node:crypto';
import { secrets } from './config.js';

// Secrets typed into the app (the Gmail app password) are stored encrypted with the key in DATA_DIR/secrets.json
// (copied from FinHR).
// Format: "v1:" + base64(iv | tag | ciphertext), AES-256-GCM.
const key = Buffer.from(secrets.encryptionKey, 'base64');

export function encrypt(plain: string) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

export function decrypt(stored: string) {
  if (!stored) return '';
  const raw = Buffer.from(stored.slice(3), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
