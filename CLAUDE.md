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
    (Changed 12/10/2026: this month's newest receipt may be edited or deleted, see below.)
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
- 12/10/2026 (mockup AK3oUFwu5F5z9WekyYfaBG, answers "1 ok 2 ok 3 ย้ายด้วย ทำได้เลย"): Users, Permissions and Audit Log
  left the side menu and the phone menu: they are in the account menu under "จัดการระบบ"/"System" (`ADMIN` in AppShell.tsx,
  shown by right). Pages opened from the account menu have a Back button (`PageHeader back` / `BackButton` in ui.tsx:
  back where you came from, else the dashboard): company, users, permissions, audit log (profile settings had its own).
  Company page: rows close together (the form card no longer stretches to the picture column), a logo upload has its
  empty margin cut (`tidyImage(file, true)`), so it prints big; an older logo must be uploaded again.
  Owner 12/10/2026: phone hamburger on the LEFT before the logo (menu slides in from the left, like the computer);
  PIN pad full size (keys 76 px, bigger dots) and quicker: keys react on touch (`onPointerDown`), no see-through blur
  behind the sign-in PIN card, a spinner instead of the dots while the PIN is checked and the app opens.
- 12/10/2026 (owner): Company settings has a typed "receiver's name" under the signature (`Setting.receiptSignName`,
  `signName` in `/settings/company`); receipts print it under the signature line, empty = the person who issued the
  receipt (`receivedByName`). The payer box in the payment window starts empty (empty = the student's name on the receipt).
- 12/10/2026 courses (mockup WTr5LoqwQAEnSrKDuzZiMi, owner "ตามนี้" = all my suggestions): history in `CoursePurchase`
  (kind buy = a receipt line or a purchase without payment, kind extend = free extension; `fromStart/fromExpiry` = the
  period before), the `Enrollment` keeps the current period. `POST /courses/buy` (routes/courses.ts, students 'edit',
  + receipts 'add' with a payment): several courses, ONE receipt (`Receipt` totals, lines = its purchases, receipt shows
  one row per course with its discount), discount per line in % or baht (no whole-bill discount), a renewal while the
  course still runs starts the day after it ends (`nextStart` in client lib/courses.ts) and keeps the start. Payment
  window has a remark printed on the receipt. Cancelling a receipt cancels its lines and takes their period back
  (`cancelPurchases`). `POST /courses/extend` = new right `courses` 'edit' (menu key `courses`: view = Courses page;
  Partner view+edit, Admin view, added once to existing roles by ensureRoles). Old enrollments/receipts were copied into
  the history once at start (`ensureCourseHistory`, key `once:course-history`). Screens: "Buy courses" window
  (`openBuy`, `CourseHosts` in components/yodo/courses.tsx; the student list's add button opens it), student details
  tabs Details / Courses (current courses with days left, Renew / Extend / fix dates, purchase history with receipt
  numbers, paid in total), Courses page `/courses` (menu after Students: ending soon (= `Setting.expiryDays`) / not ended /
  ended in 30 days / all, renew + extend per row, name -> `/students?view=<id>`), class cards: bought / not ended / ending
  soon + list in the class panel, dashboard card "courses ending within n days". Expiry bell notices open /courses.
  Money in the history only for receipts or money 'view'. The old "Edit enrollment" window only fixes dates/remark or
  removes from the class (no payment there now).
- 12/10/2026 (mockup RsAi2pW17acWGcTG5oKwRc; owner: "ของเดือนที่แล้วก็ลบไม่ได้, ที่เหลือโอเค, Admin owner ทำได้"): the NEWEST
  receipt of the CURRENT month (no receipt after it, not cancelled; `isNewest` in routes/receipts.ts, `editable` from
  `GET /receipts/:id`) can be edited (`PUT /receipts/:id`: per-line price + discount %/baht, method, date within the same
  month, payer, remark, slip; courses and their dates stay, delete and buy again for that) or deleted
  (`POST /receipts/:id/delete`: its courses are taken back, a class joined with that receipt is left again
  (`removePurchases`), its number goes to the next receipt). Last month's and older receipts: cancel only. The newest one
  shows Edit / Delete instead of Cancel. Right = receipts 'edit' (permissions chip "แก้ไข/ลบใบล่าสุด"): Admin on (once,
  key `once:receipts-edit-admin`), Owner/SuperAdmin always, Partner off until the Owner ticks it.
  Class panel (phones had no way back): a Back button over the cover (`class-back`).
- 12/10/2026 (owner): student email is optional (checked only when typed). The title dropdowns (students, teachers) show
  both languages ("ด.ญ. / Miss", `bothLang` in lib/i18n.ts); values stay the Thai choices. A Thai first name always shows
  its Thai title, also on English screens (`prefixed`: "ด.ญ. ธริดา", never "Miss ธริดา"). Once at start
  (`ensureThaiPrefixes` in server lib/prefixes.ts, key `once:prefix-th`, audited as "System"), English/other titles
  (Miss, Master, Mr., Ms., Mrs., เด็กหญิง, น.ส. ...) became the Thai choice by age (under 15 = ด.ญ./ด.ช.; no birthday =
  child, owner: most are ด.ญ.); the importer does the same.
- 12/10/2026 (mockup EDWWyApdMLcXxo59hcMiR3; owner "1 ok, 2 B, 3 คอร์สไม่มีแล้ว มีแต่ class"): tapping a receipt (list, after
  buying, a student's history) opens its DETAILS page `/receipts/$id` (routes/_authenticated/_shell/receipts_.$id.tsx:
  student link, payer, classes with period and discount, totals, remark, method, slip (tap = big), status) with
  `ReceiptActions` (Edit / Delete for this month's newest, Cancel for older) and "View PDF / Print" (`openReceipt`; the
  full-screen PDF window now only has Back, TH/EN and Print). The receipts page keeps its month in `?month=`.
  Menu "คอร์ส" renamed "วันหมดอายุ" / "Expiry dates" (route stays `/courses`, key `courses`) and comes after "คลาส".
  The word "คอร์ส"/"course" is gone from the screens: it is "คลาส"/"class" everywhere (buy = "ซื้อคลาส", renew =
  "ต่ออายุ", receipt column "ระยะเวลา"/"Length"); only the school's terms text keeps its own wording.
- 12/10/2026 speed (owner: clicks felt slow/stuck over the internet): every page change waited for `GET /me` (route
  `beforeLoad`) and the first visit of each page waited for its own script file. Now `getMeCached()` (lib/api.ts) answers
  from the last result and refreshes in the background (401 -> /auth; cleared on sign-in/out), the client is one bundle
  (`autoCodeSplitting: false`, ~280 KB gzipped, cached forever) and the server gzips responses (`compression`).
  Measured on a simulated 150 ms / 5 Mbit link: opening a student 1.5 s -> 0.4 s, /data 34 KB -> 4 KB.
- 13/10/2026 email receipts (mockup R4EUKR2FJGuQcf4Xjytzm8; owner "1 Gmail 2 เอา 3 กดเอง 4 ใช่", then "แนบไฟล์ / ไม่ต้องใส่เบอร์
  หรือให้ reply กลับ / คงบรรทัดชื่อเล่นไว้ / ทำได้เลย"): receipt details page has "แชร์" (the phone's share sheet with the PDF,
  computers download it; `GET /receipts/:id/pdf?lang=`, server PDF `lib/receipt-pdf.ts` = pdfkit + Sarabun in
  `server/assets`, copied into the Docker image) and "ส่งทางอีเมล" (`components/yodo/receipt-send.tsx`: to = student email,
  editable, up to 5; TH/EN = email + PDF language, starts in the app's; optional extra message; preview
  `GET /receipts/:id/email-preview`; `POST /receipts/:id/email`, receipts 'view'; sent list `ReceiptEmail`, audited). Sent
  only when pressed. Email text `lib/receipt-mail.ts`: greeting always "Dear Customer," / "เรียน ท่านลูกค้า" (owner 13/10/2026), thank you +
  PDF attached, classes + total, "We look forward to seeing <nickname> in class.", signer + company; NO phone, NO
  "reply to us" lines (owner). Gmail SMTP with an app password typed by the owner in Company settings ("ส่งใบเสร็จทางอีเมล"
  card, company 'edit', `Setting.mailUser/mailFromName/mailPass` encrypted by lib/crypto.ts, only the last 4 shown, never
  audited; "send a test to myself"). Tests use MAIL_OUT_DIR (.eml files); never tried against real Gmail from the dev box.

- 13/10/2026 (mockup YR8QPLjiGoo5pySRiGDaqL; owner "1 ok, 2 เลือกสีได้ดำหรือน้ำเงิน รวมถึงความหนาเส้น, 3 ไม่ต้อง"): Company
  settings receiver's signature = "อัปโหลดรูป" OR "เซ็นเอง" (`DrawSign` in company.tsx: finger/mouse on `SignCanvas`, ink
  black/blue (`INKS`), line thin/medium/thick (`WIDTHS`), then `tidyImage` like an upload: transparent PNG, margins cut).
  The stamp stays upload only (owner).
- 13/10/2026 (mockup Hfv2W8caQnfymebnMUxPa7; owner "A แล้วเปลี่ยนทั้งหมด"): rows of action icons became ONE round
  "more" button (`RowActions` in components/yodo/ui.tsx: Ellipsis icon, aria-label "จัดการ <name>", menu items, delete
  last in red after a line; shows only what the person may do). Top right of the card on phones (after the status), the
  Actions column on computers: students, teachers, classes, users, roles. Single-icon buttons elsewhere stay.
  Owner 13/10/2026 (mockup GXNwxvH8UoN7sg5ZVmH5bn, option 2): "ซื้อคลาส" uses the Ticket icon (the person-plus looked like "add a person").
- 13/10/2026 (mockup LvtGtwLMozBxzAzQ3G1wRX; owner "1 ok 2 ใช่ 3 การ์ด ทำได้เลย"): receipt details page easier to read: amount
  big in its own box with method / date / remark (first on phones), one row per class (name, "ลด x" chip, months + period,
  full price under the amount), totals top to bottom; buttons Share, Email, View PDF (full width on phones) and the "more"
  button with Edit / Delete (newest) or Cancel (older) (`ReceiptActions` = RowActions, testIds receipt-edit/-delete/-cancel).
  Expiry dates page: "All" first and open by default; `?show=soon` (dashboard card, expiry bell notices) opens "Ending soon".
  Classes page: smaller cards (low cover, price · teacher on one line, 3 small counts, 3-4 a row, 12 a page; tap a card =
  the class panel) and a Cards / Table switch (`yodo-classes-view` in localStorage, default cards; table 25 a page, phones
  get short rows with the three numbers).
- 13/10/2026 (owner): the name pill at the top right shows the person's nickname, else the first name (`short` in `useMe`,
  AppShell.tsx); the open account menu keeps the full name.
- 17/10/2026 (owner): student details have no Sign button any more (sign from Edit, the form's SignBox); Edit and View PDF
  sit apart (footer gap). The old sign-only window (`SignDocumentBody`) is gone.
- 17/10/2026 (mockup 2o1pdZZR6AXvK63C3a4rsf; owner "1 ok 2 ok 3 อยู่ต่อ ทำได้เลย"):
  - Phones: no hamburger; a bottom menu bar like a phone app (`BottomNav` in AppShell.tsx): the pages the person may open,
    up to 5 as they are, more = the first 4 (ภาพรวม, นักเรียน, คลาส, วันหมดอายุ) + "เพิ่มเติม"/"More" (Ellipsis) opening the
    rest from the bottom (ครู, ปฏิทิน, ใบเสร็จ). Open page = pink pill; a page from More marks More. Computers keep the side menu.
  - "Clear classes and receipts" card in Company settings, Owner only (`ClearCard`, `routes/cleardata.ts`,
    `GET/POST /admin/clear-courses`, typed "ลบทั้งหมด"/"DELETE ALL"): deletes every class + calendar session, enrollment,
    purchase history, receipt + sent-email list (numbers restart at 0001); students/teachers/users/company stay. Backup
    `yodo-*-before-clear.db` first (before-* backups are never pruned); one audit row with the counts. The card stays.
    (Owner asked to clear the test classes/receipts; an automatic clear at start was refused by my tooling, so the Owner
    presses this himself.)

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
  receipts, company, money, courses. Rights and roles: Owner only (`requireOwner`).
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
- 19/10/2026 outage: YODO and FinHR both "This site can't be reached" from outside, QuickConnect still worked, no new code since
  63ebbb2. Fixed by the owner running the DSM task `tailscale-funnel` (Run) via QuickConnect: the Tailscale serve/funnel
  setting was lost again (same as FinHR 10/10/2026).
- 19/10/2026 (owner did it): DSM task `tailscale-watchdog` (root, daily every 5 min 00:00-23:55): if `tailscale funnel status`
  lacks 127.0.0.1:8090 or 127.0.0.1:8092 it runs `serve reset` + both funnels and appends "<date> fixed" to
  /volume2/docker/funnel-fix.log; otherwise does nothing. Option offered for later: Cloudflare Tunnel + own domain
  (new address = passkeys and Google origin set up again).

## Testing
1. `cd server && npx tsc --noEmit && npx vitest run`
2. `cd client && npx tsc --noEmit && npx vite build`
3. Clean install like the NAS: copy the repo files to a scratch folder, `npm ci` + build in client and server.
4. Browser: `node e2e/run.mjs` (Playwright, Chromium at /opt/pw-browsers, phone 390x844 + computer 1366x900, fresh data folder).
