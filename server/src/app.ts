import compression from 'compression';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import { EXTRA_DIR, PUBLIC_DIR } from './lib/config.js';
import { errorHandler, notFound } from './lib/http.js';
import { loadUser, requireAppHeader } from './lib/auth.js';
import { router as auth } from './routes/auth.js';
import { router as data } from './routes/data.js';
import { router as notices } from './routes/notices.js';
import { router as importer } from './routes/importer.js';
import { router as pin } from './routes/pin.js';
import { router as signin } from './routes/signin.js';
import { router as receipts } from './routes/receipts.js';
import { router as courses } from './routes/courses.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 'loopback, linklocal, uniquelocal'); // nginx / Tailscale / DSM reverse proxy
  app.disable('x-powered-by');
  // Smaller downloads over the internet (Tailscale Funnel): scripts, styles and data are sent gzipped (owner 12/10/2026: slow).
  app.use(compression());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.get('/healthz', (_req, res) => { res.type('text').send('ok\n'); });

  const api = express.Router();
  api.use(cookieParser());
  api.use(loadUser);
  api.use(requireAppHeader);
  api.use(importer); // reads its own (large) body before the JSON parser
  api.use(express.json({ limit: '40mb' })); // pictures arrive inside the form as data URLs
  api.use((_req, res, next) => { if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store'); next(); });
  api.use(auth);
  api.use(pin);
  api.use(signin);
  api.use(data);
  api.use(receipts);
  api.use(courses);
  api.use(notices);
  api.use((_req, _res, next) => next(notFound()));
  api.use(errorHandler);
  app.use('/api', api);

  // version.txt lives in /web.
  app.use(express.static(EXTRA_DIR, { index: false, setHeaders: (res, p) => {
    if (/\.(html|txt)$/.test(p)) res.setHeader('Cache-Control', 'no-store');
  } }));

  // The React app: hashed assets cache forever, index.html never.
  app.use(express.static(PUBLIC_DIR, { index: false, setHeaders: (res, p) => {
    if (p.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } }));
  const indexHtml = path.join(PUBLIC_DIR, 'index.html');
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    if (!fs.existsSync(indexHtml)) return res.status(503).send('client not built');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(indexHtml);
  });
  return app;
}
