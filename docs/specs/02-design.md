# Login – Design

> **This file answers:** How is the app put together? (data, rules, screens,
> where the code lives)
> **Who:** The AI drafted it from `01-requirements.md`, the HRMS doc, and the
> interview. You review all of it.
>
> If this file and the requirements disagree, fix the requirements first,
> then this file.

## 1. Tables

The login module needs one table. The leave-request table lives in the Leave
Request design part below.

### `User` – one row per person who can log in

| Field | Type | Required? | What it holds |
|-------|------|-----------|---------------|
| `id` | number | auto | Unique number for the row |
| `name` | text | yes | Full name (doc 7.2) |
| `icNumber` | text | yes | Identity card number, format `xx-xxxxxx` (two digits, hyphen, six digits) |
| `email` | text | yes | Work email, unique, always ends `@budiman.com`. Used to log in. Stored lowercased |
| `passwordHash` | text | yes | bcrypt hash of the password — never the plain password (doc 7.1, 7.2) |
| `role` | text | yes | One of `EMPLOYEE`, `SUPERVISOR`, `HR`, `ADMIN` — exactly one role per user (doc 7.2) |
| `division` | text | yes | One of the fixed divisions in Reference A (doc 7.2) |
| `designation` | text | yes | Job title (doc 7.2) |
| `createdAt` | date | auto | Set automatically when the row is made |
| `failedAttempts` | number | auto | Wrong-password count for the lockout (AC-08). Starts at 0 |
| `lockedUntil` | date | no | When a lockout ends. `null` means not locked |

Rules on the table: `email` is the only way to log in and is `@unique`.
`failedAttempts` and `lockedUntil` exist only to serve the lockout — they are
written by the login action, read by nobody else.

The session itself is **not** stored in the database: it lives in a signed
cookie (see Business rule 6). The database needs nothing per login besides the
lockout fields.

## 2. Business rules

1. **One identity, one role.** A user is identified by their unique
   `@budiman.com` email and has exactly one role. The role is read from the
   database at login and written into the signed session; it is never taken
   from the browser afterwards.
2. **Nobody uses the system unsigned.** Every page except `/login` requires a
   valid session. Without one the visitor is redirected to `/login`
   (requirements U4, AC-04).
3. **A role sees its own home only.** `/employee` is for `EMPLOYEE` only,
   `/supervisor` for `SUPERVISOR`, `/hr` for `HR`, `/admin` for `ADMIN`. A
   signed-in user who opens another role's page is redirected to their **own**
   home page (U3, AC-03) — they are not shown a different role's data.
4. **Login is one server action.** The login form posts to a server action
   that: trims and lowercases the email (U10); rejects an email that does not
   match `@budiman.com` with a format message *before* touching the database
   (AC-07); looks up the user; checks the password with bcrypt. Whether the
   email does not exist or the password is wrong, the user sees exactly one
   wording: "Email or password is incorrect" (U6, AC-06). A correct password
   resets `failedAttempts` to 0 and `lockedUntil` to null.
5. **Five wrong passwords locks the account for 15 minutes.** Each wrong
   password (with a real email) raises `failedAttempts`. At 5, `lockedUntil`
   is set to now + 15 minutes. While locked, login is refused with a "try
   again later" message — even if the password is right (it must be, or the
   lockout teaches attackers which guesses failed). The lockout is per
   account; other accounts are unaffected (U7, AC-08).
6. **The session is a signed cookie, 8 hours, sliding.** The cookie named
   `session` holds a minimal payload — user id, role, expiry — signed with
   HMAC-SHA256 using `SESSION_SECRET` from `.env`. It carries no personal
   data and no password. Flags: `httpOnly`, `sameSite=Lax`, `path=/`,
   `secure` off in local dev (plain http) and on in production. A valid
   request whose session was issued more than 1 hour ago gets a fresh cookie
   (same 8-hour lifetime), so activity keeps a workday session alive while an
   abandoned one dies within 8 hours (U8, AC-09). An unsigned, tampered or
   expired cookie fails verification and is treated as signed out.
7. **Logout deletes the cookie.** The header's Logout button posts a server
   action that clears the cookie and redirects to `/login` (U5). Back-button
   navigation afterwards shows no page data, because the server re-checks on
   every render (AC-05).
8. **The check that counts happens on the server, twice over.** `proxy.ts`
   does quick redirect checks (no session → `/login`; session → skip
   `/login`) purely so users don't briefly flash protected screens — Next.js
   16 documents Proxy as *not* an authorization layer. Every role's page then
   verifies the signed cookie and the role again in server code before
   rendering anything (U3, U4).
9. **Accounts exist only from the seed script.** The 6 demo users in
   Reference B are inserted with bcrypt-hashed `password123`. There is no
   registration, no user-management screen, no password reset (requirements
   §5). "Reset a password" means re-running the seed (upsert by email).
10. **Root redirects.** `/` sends visitors to `/login`, and signed-in users
    to their role's home — one home page per role, as FR-01 requires.

## 3. Technology

Fixed by HRMS doc 7.1 and `package.json` (pinned — do not upgrade):

| Part | Choice | In plain words |
|------|--------|----------------|
| Web framework | Next.js 16 (App Router) + TypeScript | Screens and server logic in one project; server actions for the two forms (login, logout) — no separate API |
| Database | SQLite via Prisma 6 | One file, no database server; Prisma keeps queries parameterised (safe from SQL injection) |
| Styling | Tailwind CSS 4 | Styles sit next to each screen |
| Password hashing | bcryptjs 3 | Hashes at its default cost; a dependency-free pure-JS bcrypt |
| Session signing | Node's built-in `node:crypto` (HMAC-SHA256) | Signs the session cookie. Chosen over the auth guide's jose/iron-session because `package.json` is pinned and Node already ships HMAC — no new dependency. This is my call, flag it if you disagree |
| Seed script | `tsx` (already a dev dependency) | Runs the seed that loads the 6 demo users |
| Proxy | `src/proxy.ts` | Next.js 16's new name for middleware (was `middleware.ts`) — only for optimistic redirect checks (rule 8) |

## 4. Screens (routes)

| Route | Who | What it shows | Status |
|-------|-----|---------------|--------|
| `/login` | Nobody (signed-in users are bounced to their home, U11) | Email + password form, "Email or password is incorrect" error, "try again later" when locked, `@budiman.com` format hint. No links to register or reset | To do |
| `/` | Anyone | Redirect only: to `/login`, or to the visitor's role home when signed in | To do |
| `/employee` | `EMPLOYEE` | Stub home: name, role, division, designation, Logout button, and a "leave requests come in the next task" placeholder | To do |
| `/supervisor` | `SUPERVISOR` | Same stub home with that user's details | To do |
| `/hr` | `HR` | Same stub home with that user's details | To do |
| `/admin` | `ADMIN` | Same stub home with that user's details | To do |

There are deliberately no other routes in this module.

### Visual design (reference: `src/image/login.webp`)

The workshop reference image sets the look for every screen. It changes
appearance only — routes, actions, checks and wording of messages are
untouched.

- **Palette:** page background `#eef0ee` with a few soft translucent circle
  shapes; card `#fafbfa`; borders `#dfe3df`; main text `#1f2937`, secondary
  text `#6b7280`; primary green `#23a55a` (hover `#1c8b4b`); error text stays
  red for legibility.
- **Shapes:** cards are rounded 24 px (`rounded-3xl`) with a soft shadow and
  a hairline border; text inputs and the primary button are pills
  (`rounded-full`); info tiles are `rounded-2xl`. System sans font.
- **`/login`:** a centred, wide two-panel card. Left panel is decorative —
  green dot + "Budiman HRMS" wordmark top-left and a soft cluster of circles
  where the mockup's illustration sits (pure CSS, no image assets). Right
  panel: "Login" heading, subtitle giving the `@budiman.com` hint, Email
  label + pill input, Password label + pill input with a show/hide eye, and
  the green pill submit button labelled "Sign in". Error and locked messages
  render as plain red text above the button.
- **Role homes:** same shell — background, centred card. Header row inside
  the card: wordmark left, "Log out" pill button (outline style) right. Body:
  the person's name as heading, three info tiles (Role, Division,
  Designation), and the "leave requests come in the next task" placeholder
  tile.
- **Deliberately not copied from the mockup** (requirements §5 exclusions,
  confirmed in interview): Google/GitHub buttons, "Reset Password",
  Terms/Privacy links and the sign-up line — they have no behaviour, so they
  are omitted rather than faked. The mockup's "Continue" label stays "Sign
  in", which is the wording the test contract and the requirements use.

## 5. Where the code lives

| Folder / file | What's in it |
|---------------|--------------|
| `prisma/schema.prisma` | The `User` model (section 1), SQLite datasource |
| `prisma/seed.ts` | Upserts the 6 demo users from Reference B with hashed `password123` |
| `src/proxy.ts` | Next 16 proxy: the two optimistic redirect checks of rule 8 (not the security boundary) |
| `src/app/login/page.tsx` | The login form (client component for the submit-pending state; the checking is all server-side) |
| `src/app/login/actions.ts` | Server actions: `login` (rule 4, 5) and `logout` (rule 7) |
| `src/app/employee/page.tsx` | Employee home — calls `requireRole('EMPLOYEE')` then renders the stub |
| `src/app/supervisor/page.tsx` | Supervisor home — `requireRole('SUPERVISOR')` |
| `src/app/hr/page.tsx` | HR home — `requireRole('HR')` |
| `src/app/admin/page.tsx` | Admin home — `requireRole('ADMIN')` |
| `src/app/page.tsx` | Root: redirect per rule 10 (replaces the starter page) |
| `src/components/RoleHome.tsx` | The shared stub home (name, role, division, Logout form) used by the four pages |
| `src/lib/db.ts` | The one Prisma client, shared across the server |
| `src/lib/session.ts` | Sign/verify the cookie payload, create/refresh/clear the cookie (rules 6–7). Marked `server-only` so it can never be imported into client code |
| `src/lib/auth.ts` | `getCurrentUser()` (verify cookie, load user) and `requireRole(role)` (rules 2–3, the real check) |
| `.env` (git-ignored) + `.env.example` | `DATABASE_URL` (the SQLite file) and `SESSION_SECRET` (a random 32-byte string; `.env.example` carries a placeholder only) |

## 6. Security (in plain words)

- **Every page checks again on the server.** `getCurrentUser()` verifies the
  cookie's HMAC signature and expiry, then loads the user from the database;
  `requireRole()` confirms the role matches the page. The proxy's redirect is
  convenience, never the check (rule 8). Tampering with the cookie (e.g.
  editing the role inside it) breaks the signature → signed out.
- **Passwords** go in and out only as bcrypt hashes (OWASP A07/A02). The
  plain password exists in one variable during the login action and is never
  logged or stored.
- **Guessing is slowed, errors are vague.** Lockout after 5 fails (rule 5);
  one error wording for both failure kinds (rule 4); email-format validation
  happens before any account lookup so it cannot confirm accounts either.
- **The cookie is unreachable to scripts and other sites**: `httpOnly`
  (no JavaScript), `sameSite=Lax` (not sent on cross-site POSTs), `Secure` in
  production (OWASP A05/A01).
- **Forms are server actions**, which Next.js protects against CSRF by
  default — both login and logout go through them; there are no hand-rolled
  API routes (doc 7.1).
- **No raw SQL.** All database access goes through Prisma's parameterised
  queries (OWASP A03).
- **Secrets stay out of the repo**: `.env` is git-ignored; only the
  `.env.example` placeholder is committed. A missing `SESSION_SECRET` fails
  startup loudly rather than signing with a guessable default.
- **No injection of anything into pages**: user details are rendered as text
  by React (escaped by default), never as HTML (OWASP A03).
- Demo data is made-up (doc 7.2), so a leaked SQLite file exposes nothing real.

## 7. Commands

| Command | What it does |
|---------|--------------|
| `npm install` | Install the pinned dependencies |
| `npx prisma migrate dev --name init` | Create the SQLite file and the `User` table (first run; `migrate dev` afterwards when the schema changes) |
| `npm run db:seed` | Load the 6 demo users (runs `prisma db seed` → `prisma/seed.ts`). Safe to re-run: it upserts by email, which is also the password-reset procedure |
| `npm run dev` | Start the app at http://localhost:3000 |
| `npm run lint` | Check the code |

(`npm run db:seed` is a new script line to add to `package.json`, pointing at
`prisma db seed` — the script itself stays under `prisma.seed` in that file.
No dependency versions change.)

---

# Reference

## Reference A. Fixed choices

- **Roles:** `EMPLOYEE`, `SUPERVISOR`, `HR`, `ADMIN` — one per user
- **Divisions:** Finance, Human Resources, Information Technology, Operations, Marketing
- **Designations** (choices per division, doc 7.2): Finance → Finance Manager, Accountant, Accounts Clerk · Human Resources → HR Manager, HR Officer, HR Assistant · Information Technology → IT Manager, Software Developer, IT Support Officer · Operations → Operations Manager, Operations Supervisor, Operations Executive · Marketing → Marketing Manager, Marketing Executive, Marketing Assistant

(Login only needs these for the home-page display and the seed; the leave
module will reuse them.)

## Reference B. Demo data

From doc 7.2 — the seed script loads exactly these rows; everyone's password
is `password123`, stored hashed:

| Email | Name | IC No. | Role | Division | Designation |
|-------|------|--------|------|----------|-------------|
| `employee-1@budiman.com` | Employee 1 | 00-148888 | EMPLOYEE | Finance | Accounts Clerk |
| `supervisor-1@budiman.com` | Supervisor 1 | 00-157777 | SUPERVISOR | Finance | Finance Manager |
| `supervisor-2@budiman.com` | Supervisor 2 | 00-166666 | SUPERVISOR | Finance | Accountant |
| `hr-1@budiman.com` | HR 1 | 00-175555 | HR | Human Resources | HR Officer |
| `hr-2@budiman.com` | HR 2 | 00-184444 | HR | Human Resources | HR Officer |
| `admin@budiman.com` | Admin | 00-193333 | ADMIN | Admin | Admin Manager |

---

# Leave Request – Design

> **This file answers:** How is the leave flow put together? (data, rules,
> screens, where the code lives)
> **Who:** The AI drafted it from the Leave Request part of
> `01-requirements.md`, the HRMS doc, and the interview. You review all of it.
>
> If this part and the Leave Request requirements disagree, fix the
> requirements first, then this part.

## 1. Tables

### `LeaveRequest` – one row per request (doc 7.2)

| Field | Type | Required? | What it holds |
|-------|------|-----------|---------------|
| `id` | number | auto | Unique number for the row |
| `employeeId` | number | yes | The user asking for leave — links to `User.id` |
| `supervisorId` | number | yes | The user who must sign — links to `User.id`; same division, role SUPERVISOR (LR-2) |
| `leaveType` | text | yes | One of the five codes in Reference C (doc 7.2) |
| `otherLeaveType` | text | no | What the leave is for; required when the type is `OTHER` — and also when it is `COMPASSIONATE` (doc 7.2 leave types: "the employee must write what is for") |
| `startDate` | date | yes | First day of leave; past dates allowed (LR-3) |
| `endDate` | date | yes | Last day of leave; never before `startDate` |
| `status` | text | yes | One of the seven values below — set by the server only, never taken from the browser |
| `supervisorRemark` | text | no | Supervisor's reason; required when rejecting (LR-6) |
| `hrOfficerId` | number | no | The HR user who decided — links to `User.id`; set on Approved / Rejected by HR |
| `hrRemark` | text | no | HR's reason; required when HR rejects (LR-9) |
| `submittedAt` | date | auto | Set when the request is created |
| `signedAt` | date | no | When the supervisor signed |
| `decidedAt` | date | no | When HR decided |
| `withdrawnAt` | date | no | When the employee withdrew |

Like `User.role` in the login part, `status` and `leaveType` are plain
strings in SQLite (SQLite has no enum); the allowed values live in
`src/lib/leave.ts` and every write goes through the server checks below.
Dates come from `<input type="date">`, are stored as DateTime (midnight
UTC), and display as "1 Dec 2026".

**Statuses** — doc 5.2's six, plus Withdrawn (interview Q2):

| Stored value | Display name | Meaning | Final? | Set by |
|--------------|--------------|---------|--------|--------|
| `PENDING_SUPERVISOR` | Pending supervisor | Submitted, waiting for the supervisor | no | System (on submit) |
| `SIGNED` | Signed | Supervisor signed; employee can send it to HR | no | Named supervisor |
| `PENDING_HR` | Pending HR | Sent to HR, waiting for a decision | no | Employee (owner) |
| `APPROVED` | Approved | HR approved it | yes | Any HR officer |
| `REJECTED_SUPERVISOR` | Rejected by supervisor | Supervisor rejected, remark stored | yes | Named supervisor |
| `REJECTED_HR` | Rejected by HR | HR rejected, remark stored | yes | Any HR officer |
| `WITHDRAWN` | Withdrawn | Employee withdrew while still pending | yes | Employee (owner) |

**Reference C. Leave types** (doc 7.2): `ANNUAL` Annual leave · `MATERNITY`
Maternity leave · `UNPAID` Unpaid leave · `COMPASSIONATE` Compassionate
leave (family emergency or bereavement — requires `otherLeaveType`) ·
`OTHER` Other (requires `otherLeaveType`).

## 2. Business rules (leave)

Numbered **LR-n** so they never get confused with the login rules 1–10.

1. **LR-1. Employees only create.** The create action requires the session
   user's role to be `EMPLOYEE`; supervisors, HR and Admin cannot create a
   request by any route (doc 5.3 rule 2, U12).
2. **LR-2. The supervisor is verified on the server.** The submitted
   `supervisorId` must reference a user with role `SUPERVISOR` in the same
   division as the submitting employee, or the action is refused — the
   dropdown is convenience, never the check (U13).
3. **LR-3. Form rules.** `leaveType` must be one of Reference C;
   `otherLeaveType` is required when the type is `OTHER` (doc 7.2 field
   table) or `COMPASSIONATE` (doc 7.2 leave types: "the employee must
   write what is for"); dates are real and `endDate` ≥ `startDate`; past
   dates are allowed — no other date policy (U12, U23, interview Q6).
4. **LR-4. No double-booking** (interview Q3). Before insert, the employee
   must have no request in status `PENDING_SUPERVISOR`, `SIGNED`,
   `PENDING_HR` or `APPROVED` whose dates overlap inclusively
   (`newStart ≤ existingEnd AND newEnd ≥ existingStart`). Refusal names the
   existing request's dates. `WITHDRAWN` and the two rejections free the
   dates (U22).
5. **LR-5. One status machine, enforced in code.** Every action declares
   who may do it, from which status, to which status — and the server
   **re-reads the row inside the action** and refuses if the status has
   moved on (interview Q4). The late officer gets "already decided by
   <name> (<status>)" and never overwrites the first decision.

   | Action | Who | From status | To status |
   |--------|-----|-------------|-----------|
   | Submit | Owner | — (new row) | `PENDING_SUPERVISOR` |
   | Sign | Named supervisor | `PENDING_SUPERVISOR` | `SIGNED` (+`signedAt`) |
   | Reject | Named supervisor, remark required | `PENDING_SUPERVISOR` | `REJECTED_SUPERVISOR` |
   | Withdraw | Owner | `PENDING_SUPERVISOR` | `WITHDRAWN` (+`withdrawnAt`) |
   | Send to HR | Owner | `SIGNED` | `PENDING_HR` |
   | Approve | Any HR officer | `PENDING_HR` | `APPROVED` (+`hrOfficerId`, `decidedAt`) |
   | Reject | Any HR officer, remark required | `PENDING_HR` | `REJECTED_HR` (+`hrOfficerId`, `hrRemark`, `decidedAt`) |

6. **LR-6. Sign carries no remark; supervisor rejection does.** The named
   supervisor only can do either; an empty remark is refused before the
   write (FR-03, U14).
7. **LR-7. Sending to HR is the owner's move,** allowed only from `SIGNED`
   (doc 5.3 rule 5, FR-04). It puts the request in the shared HR queue.
8. **LR-8. Withdrawal is the owner's move,** allowed only from
   `PENDING_SUPERVISOR` (interview Q2). `Withdrawn` has no other path in,
   and no path out.
9. **LR-9. HR decides either way;** rejection requires a non-empty
   `hrRemark`; the deciding officer and `decidedAt` are recorded (FR-05,
   doc 5.3 rule 5).
10. **LR-10. Decided means done.** Final statuses accept no further action
    (doc 5.2 "Final"); a rejected employee submits a fresh request — no
    reopen, no appeal (U24).
11. **LR-11. Lists are scoped by the query, not the browser.** Employee
    list: `employeeId = me`. Supervisor list: `supervisorId = me`. HR list
    (shared, both officers identical, interview Q5): status in `PENDING_HR`,
    `APPROVED`, `REJECTED_HR` — pending first, decided below with the
    officer's name. Admin: every row (FR-06, FR-08).
12. **LR-12. Detail page access matrix.** `/requests/[id]` may be opened by
    exactly: the owner, the named supervisor, any HR officer, and Admin.
    Anyone else is redirected to their own home — the check runs in server
    code before anything renders (OWASP A01, AC-31). Action buttons render
    only for the viewer/status combinations LR-5 allows; hiding is display
    polish, the server re-check is the control.
13. **LR-13. Admin never acts.** No action is written for ADMIN; one
    POSTed anyway is refused.
14. **LR-14. Confirm, then success** (FR-07). Every action shows an inline
    confirm step first (nothing happens until "Confirm"; remark fields sit
    inside the confirm row when required), then redirects with a green
    success banner naming the action ("Request submitted", "Sent to HR",
    …). Browser `confirm()` popups are not used.
15. **LR-15. Nothing is deleted.** Withdrawn and rejected requests stay in
    their role's list with status and remark, forever (goal 3, U18).

## 3. Technology (leave additions)

Everything stays as the login part's §3 — Next.js 16 server actions, Prisma,
Tailwind, the signed session cookie and `requireRole()`; **no new
dependencies** (`package.json` is pinned). The module adds one constants
file (`src/lib/leave.ts`) as the single source for types, statuses, labels
and the LR-5 transition table, and `<input type="date">` fields for dates.

## 4. Screens (routes) — leave module

| Route | Who | What it shows | Status |
|-------|-----|---------------|--------|
| `/employee` (extended) | `EMPLOYEE` | RoleHome shell + own request list, newest first, with status chip and remarks, a "New request" button, and success banners (replaces the "leave requests come in the next task" placeholder) | To do |
| `/employee/leave/new` | `EMPLOYEE` | The leave form: type select; "what the leave is for" text (shown for Other and Compassionate leave); start/end date fields; supervisor select listing own-division supervisors; validation errors above the form; inline confirm step before submit | To do |
| `/supervisor` (extended) | `SUPERVISOR` | Own list: requests naming them, pending on top, history below with status and remarks | To do |
| `/hr` (extended) | `HR` | The shared queue (LR-11): Pending HR first, decided below with the deciding officer's name — identical for both officers | To do |
| `/admin` (extended) | `ADMIN` | Every leave record in one table — employee, supervisor, dates, type, status, decider — no buttons anywhere (FR-08) | To do |
| `/requests/[id]` | Owner · named supervisor · HR · Admin | Full record: type and description, dates, status chip, submitted/signed/decided/withdrawn dates, both remarks, deciding officer. Renders only the action buttons this viewer may use at this status (LR-5), each behind the inline confirm | To do |

The RoleHome shell, palette, cards and pill buttons are the login part's
visual design unchanged; new pieces are the list rows and small **status
chips**. Chip colours (Pending supervisor `#b45309` amber, Signed and
Pending HR `#1d4ed8` blue, Approved `#23a55a` green, Rejected `#b91c1c`
red, Withdrawn `#6b7280` grey) are decoration — the status **word** always
shows next to the colour.

`src/proxy.ts` matchers grow to cover the new routes for the quick
signed-out redirect; the real check stays `requireRole()` + the per-action
server checks, exactly as the login part's rule 8 established.

## 5. Where the code lives (leave module)

| Folder / file | What's in it |
|---------------|--------------|
| `prisma/schema.prisma` | `LeaveRequest` model (this part's §1) with relations to `User` |
| `src/lib/leave.ts` | `LEAVE_TYPES`, `STATUSES`, display labels, chip colours, and the LR-5 transition table + `assertAllowedTransition()` used by every action |
| `src/components/StatusChip.tsx` | Status word in a coloured pill |
| `src/components/RequestList.tsx` | The shared list/table of requests (rows link to the detail page); each home page passes its role-scoped rows |
| `src/components/SuccessBanner.tsx` | Green banner driven by a `?done=<action>` redirect param |
| `src/components/ConfirmAction.tsx` | Client piece: button → inline confirm row (remark field when the action needs one) → posts the server action |
| `src/app/employee/page.tsx` | Own list + "New request" button (replaces the stub body) |
| `src/app/employee/leave/new/page.tsx` | The leave form |
| `src/app/employee/leave/new/actions.ts` | `createLeaveRequest` — LR-1 … LR-4 |
| `src/app/requests/[id]/page.tsx` | Detail page + LR-12 access matrix |
| `src/app/requests/[id]/actions.ts` | `withdraw`, `sign`, `rejectBySupervisor`, `sendToHr`, `approve`, `rejectByHr` — LR-5 … LR-10 |
| `src/app/supervisor/page.tsx` | Supervisor queue list (replaces stub) |
| `src/app/hr/page.tsx` | HR shared queue (replaces stub) |
| `src/app/admin/page.tsx` | Admin table, view only (replaces stub) |
| `src/proxy.ts` | Extended route matchers — optimistic redirect only, as before |
| `tests/leave-*.test.ts` | Black-box tests following the existing `tests/` convention (node:test against the dev server) |

## 6. Security (leave module, OWASP Top 10 — FR-10)

- **Every action checks four things on the server, in order:** a valid
  session (login part's rules), the right role, the right row (owner /
  named supervisor / HR), and the required current status — re-read inside
  the action, so a stale screen can never overwrite a decision (LR-5,
  interview Q4).
- **The browser sends intent, never facts.** Transition forms (sign,
  reject, withdraw, send, approve) carry the request id and an optional
  remark only — `status`, `hrOfficerId`, and `employeeId` are never taken
  from input. The create form's `supervisorId` is re-verified on the server
  against division and role (LR-2), so a tampered dropdown is refused.
- **No IDOR:** the detail access matrix (LR-12) and query-scoped lists
  (LR-11) mean another person's request never reaches another person's
  browser — not even hidden in HTML.
- **Remarks and descriptions are text**, stored as text, rendered by React
  (escaped by default); no raw SQL anywhere — all queries go through
  Prisma's parameterised API (OWASP A03).
- **Forms are server actions** → CSRF protection by default, matching the
  login part; there are no hand-rolled API routes.
- **Error messages stay minimal** ("This action is not allowed",
  "already decided by HR 1") and only carry the detail a legitimately
  involved viewer is entitled to.
- Session lifetime, lockout and cookie flags are the login part's,
  unchanged — this module adds no new way around them.

## 7. Commands (additions)

| Command | What it does |
|---------|--------------|
| `npx prisma migrate dev --name leave_request` | Create the `LeaveRequest` table (run once per developer) |

`npm run dev`, `npm run lint` and `npm run db:seed` are unchanged; the demo
users from Reference B are the leave module's test accounts too.
