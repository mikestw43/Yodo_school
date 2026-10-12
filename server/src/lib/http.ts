import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export const bad = (code: string, msg?: string) => new HttpError(400, code, msg);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const conflict = (code: string) => new HttpError(409, code);

export function intParam(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: 'invalid_input', issues: err.issues });
  const e = err as { code?: string; type?: string };
  if (e?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'file_too_large' });
  if (e?.code === 'LIMIT_FILE_COUNT' || e?.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'too_many_files' });
  if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
}
