# YODO — notes for future sessions

YODO = management app for the owner's ballet / dance school (students, classes, teachers, calendar, staff accounts,
audit log, bell + phone notifications). Rebuilt on 12/10/2026 from the owner's Lovable app (TanStack Start + Supabase)
so it runs on the owner's NAS like FinHR (`mikestw43/finance-hr-app`, read-only reference: copy from it, never reinvent).

## How to work with the owner (must follow)
- The owner does not code. Talk to him in Thai, plainly. Code and file names stay English.
- Show a mockup (Artifact) before changing any look or wording; wait for "ทำได้เลย". Artifact comments do not reach
  you, ask him to reply in chat. List the decisions he must make, numbered.
- Icons only from lucide-react (app and mockups). Never emoji or text symbols as icons.
- Never ask for or accept secrets (keys, passwords, Google client secret). A Google client ID is not secret.
- Report tests as a short table. Never say "done" without running them.
- Merge own PRs into `main` after tests pass (the NAS tracks `main`). Never merge into a live/production branch without asking.
- After each delivery: say the version to look for (short hash, shown at the bottom of the profile menu) and send screenshots.
- Keep this file up to date with every decision the owner makes (with the date).

## Owner's decisions
- 12/10/2026: rebuild like FinHR (NAS, own SQLite database, Docker, auto-update from `main`); **the look stays exactly
  like the Lovable app** (pink theme, Cormorant/Nunito fonts, sidebar + hamburger menu on phones). Lovable is no longer used.
- 12/10/2026: only the **students** in Lovable are real data; teachers/classes/users there were test data and are not moved.
  Students come over with the Import page (profile menu > "นำเข้านักเรียน", SuperAdmin only, CSV/JSON export of the
  Lovable `students` table, keeps ids/codes/pictures, skips codes that exist, safe to run twice).
- 12/10/2026 (mockup approved, artifact 49c5UnqUsYztJPZ1187BjN): PIN + Face ID + Google sign-in copied from FinHR.
  PIN 4 or 6 digits, each person picks; Face ID only after a PIN; auto-lock default "never" (person can pick: when I
  leave the app (15 s grace) / 1-60 min); Google only for existing accounts whose profile email matches the Gmail
  (linked by Google id at the first sign-in, `User.googleSub`), no self sign-up. Google client ID: SuperAdmin card on
  the profile settings page (`PUT /settings/google`, `Setting` row 1); the same client ID as FinHR works once the
  :8443 address is added as an allowed JavaScript origin in Google Cloud. Files: server `routes/pin.ts` (cookie
  `yodo_pin`), `routes/signin.ts` (passkeys rpName YODO, user handle `yodo-user-<id>`), client `components/yodo/Pin.tsx`
  (PinPad, PinLogin, SecurityCard = "การเข้าสู่ระบบของฉัน" card with the change-password row, AutoLock in
  `_authenticated/route.tsx` so the settings page locks too), `lib/signin.ts`. Password change/admin reset/disable/
  delete drops the person's PINs. Every way of signing in goes through `finishLogin` (audit row with `method`).
- 12/10/2026 (mockup approved, artifact TkjwRTADaAChHoy1dYTxm9): Thai / English everywhere. Owner's answers: default
  ENGLISH (new accounts `lang` "en"; accounts made before were switched to English once at start, key `once:lang-en`);
  TH/EN button next to the bell (phone header + computer top right, also on the sign-in page), one tap, kept with the
  account (`PATCH /me/lang`, the server's value wins after sign-in); typed data is never translated, stored choices
  (prefix, nationality, religion, source, status) keep their stored value and show `opt(value)`; PDFs (student
  document, receipt) FOLLOW the chosen language. How: every visible text is `L("ไทย", "English")` (client
  `src/lib/i18n.ts`, never at module top level); the page tree under the root is keyed by the language so a switch
  redraws everything; dates via `fd`/`fdt`/`fMonthYear`/`fDayMonth`. Bell notices are written in each person's
  language (`notifyAll({ text: (lang) => ... })`). Thai menu names: ภาพรวม, นักเรียน, คลาส, ครู, ปฏิทิน,
  ผู้ใช้ระบบ, สิทธิ์, ประวัติการแก้ไข. e2e checks that English pages show no Thai except typed data.

- 12/10/2026 notifications (mockup JG3Qrzbf9Fa5YhEhsRF1ti; owner's answers): NO new kinds (still enrollment new/changed,
  new session, class ending soon); expiry warning days set by the SuperAdmin (default 7, 1-60, `Setting.expiryDays`,
  `PUT /settings/notices`); who gets them: still everyone (owner: "leave it for now", permission-based sending is open);
  each person turns kinds off (`User.noticeOff`, `GET/PUT /me/notices`, notifyAll skips them); bell: X per notice +
  "Remove read" (`POST /notices/delete`, `Notice.deletedAt`). Profile settings card "การแจ้งเตือน"
  (`components/yodo/NoticeSettings.tsx`): this device's state (on / off with a turn-on button / blocked / iPhone needs
  Home Screen / unsupported), my devices with last reached time and remove, "Send a test". App-icon number = unread
  count sent with each push (sw.js setAppBadge) and set by the bell when the app is open.

- 12/10/2026 student form (mockup RXeGPUbEKAFFQYRbCdWc3A, "ทำได้เลย"): prefixes ด.ช./ด.ญ./นาย/นาง/นางสาว;
  nationality (ไทย, Singaporean, Other + typed), NEW ethnicity (`Student.ethnicity`/`ethnicityOther`: ไทย, จีน, Other
  + typed), religion (พุทธ, คริสต์, อิสลาม, Other + typed `religionOther`); interested classes = the fixed list
  `DANCE_TYPES` (Ballet, Jazz, Contemporary, Kpop, HipHop shown "Hip Hop", Acting, Singing), several, plus "Other"
  with typed classes kept as extra items in `interested` (no longer taken from the class list); experience "yes"
  shows a "Please specify" box; how did you hear = several choices stored joined ", " in `source` (+ `sourceOther`
  when Other). Import also fills in a missing photo/signature for students already there (Lovable JSON export
  with image/signature; owner was given the Lovable prompt).

## Layout
- `server/`: Node 22, Express 5, TypeScript, Prisma 6 + SQLite, zod, vitest + supertest. Entry `src/index.ts`, app `src/app.ts`.
  - `routes/auth.ts` first-run setup code (`DATA_DIR/setup-code.txt`), login (username or profile email), me, password.
  - `routes/data.ts` `GET /data` (everything the pages need, same shape as the old Lovable store) + every change endpoint.
  - `routes/notices.ts` bell, push devices, pictures (`GET /files/:name`, signed-in only).
  - `routes/importer.ts` Lovable students import.
  - `lib/auth.ts` cookie `yodo_session` (own name: FinHR shares the NAS host name), permissions per position.
  - `lib/audit.ts` audit rows in the OLD app's shape (snake_case `old_data`/`new_data`, pictures as `img:<md5>`).
  - `lib/notify.ts` bell rows per user + Web Push (VAPID keys in `DATA_DIR/push.json`), expiry warnings (7 days, once).
  - `lib/images.ts` pictures arrive as data URLs and are stored as files in `DATA_DIR/uploads` (`/api/files/<uuid>.<ext>`).
- `client/`: the Lovable code (React 19, Vite, TanStack Router file routes, Tailwind 4, shadcn/ui) as a plain SPA.
  - `src/lib/yodo-store.tsx` keeps the old store API (optimistic changes, reload from server on error); talks to `src/lib/api.ts`.
  - Every request sends `x-yodo: 1` (server refuses changes without it).
  - `src/routeTree.gen.ts` is generated by the router plugin on `vite build`/`vite dev` and committed.
  - `public/sw.js` service worker for notifications only, no caching, no fetch handler.
- `deploy/`: `start.sh` (backup, `prisma db push` WITHOUT `--accept-data-loss`, start), `update.sh` (NAS auto update),
  `nas/setup.sh` + Thai `nas/README.md`.

## Rules that must not break
- Ids are text UUIDs (records from Lovable keep theirs). Dates are `YYYY-MM-DD` strings in Asia/Bangkok.
- Student codes `YDO00001` are given by the server and never reused (soft-deleted students keep theirs).
- Soft delete (`deletedAt`) for students, teachers, users; every change audited with before/after.
- Every endpoint checks the position permission (`requirePerm(menu, action)`) and that the row exists.
  SuperAdmin or a system position (`isSystem`) = everything. Menus: dashboard, students, classes, teachers, calendar, users, auditlog.
- Fields can be added to `schema.prisma`, never removed or renamed.
- Dates shown dd/mm/yyyy Christian era.

## NAS
- Port **8092** (FinHR 8090). Folder `/volume2/docker/yodo/{app,data}`. Task Scheduler `YODO update` every 5 min.
- HTTPS: Tailscale Funnel `--https=8443 8092` -> `https://mikenas.tail4afc1d.ts.net:8443`, in the same `tailscale-funnel`
  task as FinHR's 443.
- Own deploy key (GitHub allows one per repo).
- Installed 12/10/2026 (owner, Windows PowerShell + ssh; first build failed on an out-of-sync client lockfile, fixed in
  77b2c74: always check `npm ci` + build from a clean copy before pushing). Task Scheduler `YODO update` runs every 5 min.
- Funnel ON 12/10/2026: both DSM tasks `tailscale-funnel` and `tailscale-funnel-b...` (at boot, `sleep 90` first) use
  `TS=/var/packages/Tailscale/target/bin/tailscale` and now have `$TS funnel --bg --https=8443 8092` after FinHR's
  `$TS funnel --bg 8090`. Owner confirmed both apps open from outside.

## Testing
1. `cd server && npx tsc --noEmit && npx vitest run`
2. `cd client && npx tsc --noEmit && npx vite build`
3. Clean install like the NAS: copy the repo files to a scratch folder, `npm ci` + build in client and server.
4. Browser: `node e2e/run.mjs` (Playwright, Chromium at /opt/pw-browsers, phone 390x844 + computer 1366x900, fresh data folder).
