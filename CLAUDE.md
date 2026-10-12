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
- After each delivery: say the version to look for (short hash, shown at the bottom of the account menu, top right) and send screenshots.
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
  with image/signature; owner was given the Lovable prompt). Photos/signatures/ethnicity of the 37 real students came
  from the owner's old AppSheet export (register.xlsx + images zip): converted to a JSON import file in the scratchpad
  and handed to the owner (signature = AppSheet `sign`, owner OK'd; AppSheet classes/teachers/timetable NOT imported,
  owner's decision). Names show "prefix + space + first name" in both languages ("ด.ญ. มะลิ"), owner 12/10/2026.
- 12/10/2026 student list (owner): no eye button; tapping a row (computer) or card (phone) opens the details, which
  hold Edit / Sign / Print PDF (row action buttons stop the tap). Application page 2 shows the student photo
  portrait 40x53 mm under the logo like the old AppSheet PDF; pictures stored as `/api/files/...` are accepted in the
  print window (`picUrl` in `lib/student-print.ts`, made absolute), signatures too (before, only data URLs showed).
- 12/10/2026 layout (mockup GpHsdGnLjRgT59gzbGhqrx, "ทำได้เลย"): computer side menu folds to icons with a button beside
  the logo (`PanelLeftClose/Open`, kept per device in localStorage `yodo-nav-collapsed`); the account menu (name,
  role, profile settings, import, sign out, version) moved to the top right (`AccountMenu` in AppShell.tsx: name pill
  on computers, round picture on phones before the hamburger; the hamburger sheet holds only the pages). Student list:
  25 per page, the code sits under the name (no code column).
- 12/10/2026 application form (mockup MPUpN3ejrfCaTGXUy96eHy, owner chose design A, "ทำได้เลย"): page 2 = logo +
  "ใบสมัครเรียน" + student code + applied-on date (createdAt, Bangkok) on the left, photo 35x45 mm on the right, then 4
  sections (student, contact, emergency contact, dance) of label-over-value fields with dotted lines on a 6-column grid
  (`formSections()` in `lib/student-print.ts`, used by both the print window and `student-document.tsx`); fonts Noto
  Sans/Serif Thai. ONE signature for both pages, label under the line "ผู้สมัคร / ผู้ปกครอง" (`signerLabel`). It is drawn
  either at the end of the student form (`useSignCanvas`, add form sends `signature`/`signedAt` with `POST /students`,
  edit form calls `/students/:id/sign` after the save) or in the details' sign dialog (one box, at the end of page 2;
  page 1 shows the same one). Form labels no longer say "(automatic)" (student ID, age).
- 12/10/2026 signing + PDF (mockup 6AhYbMtwqaPBREcrPdZsTM, "ทำได้เลย"): signing never skips the terms. One `SignBox`
  (components/yodo/student-document.tsx) at the end of the student form AND in the details' "Sign document / Sign
  again" window (small window, no longer the whole application): the 9 terms in a scroll box, two ticks "อ่านและยอมรับ
  ข้อตกลงและเงื่อนไขแล้ว" and (owner's addition) "ข้อมูลที่ให้ไว้ถูกต้องตามความเป็นจริง", the sign box opens only when both
  are ticked (ticks are not stored). Details button "ดู PDF" opens the application full screen in the app (Back +
  "พิมพ์ / บันทึกเป็น PDF", which opens the print window); nothing prints by itself any more.
  Owner 12/10/2026: tick wording = `agreeText`/`correctText` in lib/student-print.ts ("ข้าพเจ้าได้อ่านและยอมรับข้อตกลงและ
  เงื่อนไขของโรงเรียนด้านบนแล้ว" / "ขอยืนยันว่าข้อมูลที่กรอกในใบสมัครทั้งหมดถูกต้องตามความเป็นจริง", English given by the
  owner). The PDF view hides the details window while open (a window under it blocked scrolling). Tapping the photo in
  the details opens it big.
  Owner 12/10/2026 (mockup board "Ticks"): the application shows the two statements as tick lines, split by page: page 1
  under term 9 = `agreeText`, page 2 under the dance section above the signature = `correctText`; ticked whenever the
  student has a signature (signing needs both ticks; the 37 AppSheet students with their old signature show ticked,
  owner's choice), empty boxes when not signed (`Tick` in student-document.tsx, `BOX_SVG` in the print window).
  Owner 12/10/2026: the sign box has its own TH/EN switch beside "School terms and conditions" (terms + the two statements
  only, starts in the app's language, not saved; `terms(lang)`/`agreeText(lang)`/`correctText(lang)`), and its clear
  button reads "Sign" in English (Thai stays "เซ็นใหม่"); the details button and window title too ("Sign"). The
  terms switch changes only the terms and the two statements (owner: the rest stays in the app's language).
  Phones (owner 12/10/2026, layout broke): the in-app application keeps its A4 layout and is shrunk to the screen width
  (CSS `zoom` from a ResizeObserver in `StudentDocument`); the on-screen terms are numbered like the print.
- 12/10/2026 roles + receipts (mockup 3gLnsvQrxnGWHKpPmbRxBA, "ทำได้เลย"; built 12/10/2026):
  - Roles = positions with `Position.kind`: superadmin (the first-run "SuperAdmin", hidden from everyone but the Dev; the
    owner's own account stays SuperAdmin), owner (isSystem, full access, locked), partner, admin (seeded by
    `ensureRoles()` in lib/roles.ts on start and after setup, with board 1's defaults), "" = roles the Owner adds. ONLY the
    Owner/SuperAdmin (`isOwner`/`requireOwner` in lib/auth.ts) adds/renames/deletes roles and edits rights; built-in roles
    cannot be deleted; only the Owner gives a full-access role. `GET /data` hides the SuperAdmin role and account from
    others and returns `owner`. Permissions page = one table, menus x roles, chips (`ROWS` in permissions.tsx).
    New menu keys: receipts (view / add = issue / delete = cancel), company (view / edit), money (view = dashboard money).
  - Class price is the WHOLE course (`DanceClass.price`) with `months` (course length, default 1; old per-month prices
    were left for the owner to fix). The add-to-class window fills the expiry = start + months − 1 day until typed.
  - Payment box in the add-to-class window (receipts 'add'): price (from the class, editable), discount, amount,
    cash / transfer / card, payment date, payer (default the emergency contact), slip for transfers; "บันทึกและออกใบเสร็จ"
    saves the enrollment, then `POST /receipts` (routes/receipts.ts) and opens the receipt. Editing an enrollment lists
    its receipts and can take a new payment.
  - Receipt numbers RC + YYMM + "-" + 4 digits from the receipt date, restart monthly, never skipped (`@@unique([ym, seq])`);
    never deleted, only cancelled (`/receipts/:id/cancel`, reason, kept, struck through, not counted). No VAT (owner).
  - Receipt document `receiptHtml()` in lib/receipt-print.ts (A4, company details, amount in Thai/English words), shown in
    the app by `ReceiptHost` (components/yodo/receipt.tsx, `openReceipt(id)`, iframe scaled to fit phones) with its own
    TH/EN switch (owner: "ใบเสร็จขอ Eng"), print and cancel. Receipts page `/receipts` (month arrows, total, count,
    cash/transfer/card, cancelled; menu between Calendar and Users). Company settings page `/company` (account menu):
    name TH/EN, address, phone, email, 13-digit tax ID, branch, logo (empty = YODO), receiver's signature (optional),
    stored in `Setting`. Dashboard money card for `money` 'view'.

- 12/10/2026 logo (mockup QFcV981guVTjmRcjm56uxN, answers "1 ok 2 YODO 3 เปลี่ยน 4 YODO", "ทำได้เลย"): the school's own
  logo with the motto "You Only Dance Once" (`src/assets/yodo-logo.png`, made transparent from the owner's picture) on
  the computer side menu (folded = the Y dancer `yodo-mark.png`), the phone header and the sign-in page; dashboard hero
  small text = "You Only Dance Once"; app name "YODO" (manifest); app icons/favicon = the Y dancer on #fff6f7;
  receipt fallback name "YODO". Company settings: NEW stamp picture (`Setting.receiptStamp`, `stamp` in
  `/settings/company`), printed left of the receiver's signature. Logo/signature/stamp uploads keep transparency
  (`PicUpload` in company.tsx; signature + stamp go through `lib/tidyImage.ts` copied from FinHR: paper made
  transparent, margins cut, PNG). Before, the JPEG editor made a transparent signature black.
- 12/10/2026 speed (owner: clicks felt slow/stuck over the internet): every page change waited for `GET /me` (route
  `beforeLoad`) and the first visit of each page waited for its own script file. Now `getMeCached()` (lib/api.ts) answers
  from the last result and refreshes in the background (401 -> /auth; cleared on sign-in/out), the client is one bundle
  (`autoCodeSplitting: false`, ~280 KB gzipped, cached forever) and the server gzips responses (`compression`).
  Measured on a simulated 150 ms / 5 Mbit link: opening a student 1.5 s -> 0.4 s, /data 34 KB -> 4 KB.

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
  SuperAdmin or a system position (`isSystem`) = everything. Menus: dashboard, students, classes, teachers, calendar, users, auditlog,
  receipts, company, money. Rights and roles: Owner only (`requireOwner`).
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
