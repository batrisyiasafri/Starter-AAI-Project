# Login – Tasks

> **This file answers:** In what order do we build it, and how do we check each step?
> **Who:** The AI drafted it from `01-requirements.md` and `02-design.md`. You review it.
>
> Build one task at a time, in order. When a task is done, the AI changes its
> Status to Done. At the end, you check the whole app against the specs.
> If something is wrong, fix the spec first, then ask the AI to rebuild.
> Each task ends with one conventional commit (AGENTS.md).

**Priority.** Every task is **High**, **Medium** or **Low**. Do High first.
Do Low only if time is left, and only if you ask.

| Status | # | Task | Priority | Checks (from requirements §4) |
|--------|---|------|----------|-------------------------------|
| Done | 1 | Set up the database and the `User` table | High | Design §1 + AC-13 (setup) |
| Done | 2 | Seed the 6 demo users | High | AC-13, AC-10 (setup) |
| Done | 3 | Build the `/login` screen (form only) | High | AC-07 (form side), U1 (visible part) |
| Done | 4 | Sign and verify sessions (library) | High | AC-09 (sign/verify part), design §2 rules 6, 8 |
| Done | 5 | Role home stubs + signed-out redirects | High | AC-04, AC-03 (unsigned part) |
| Done | 6 | Log in: server action, session, errors | High | AC-01, AC-02, AC-06, AC-07, AC-11, AC-12, AC-10 |
| Done | 7 | Lock the account after 5 wrong passwords | High | AC-08 |
| Done | 8 | Log out | High | AC-05 |
| Done | 9 | Refresh the session on activity | High | AC-09 (sliding part) |
| Done | 10 | Make `/` redirect | Medium | U11 / design rule 10 |
| Done | 11 | Full pass against the acceptance checklist | High | AC-01 … AC-13, `npm run lint` |
| To do | 12 | LeaveRequest table + migration | High | leave design §1 (setup) |
| To do | 13 | Status/type constants + status chip | High | leave design §1, LR-5 |
| To do | 14 | Employee leave form + submit checks | High | AC-14 (form), AC-15, AC-16, AC-17, AC-18, AC-29 |
| To do | 15 | Employee's own list on `/employee` | High | AC-14 (list), AC-26 (employee) |
| To do | 16 | Request detail page + access matrix | High | AC-26, AC-31, AC-28 (confirm part) |
| To do | 17 | Withdraw | High | AC-18 (frees dates), AC-25, AC-28 |
| To do | 18 | Supervisor list on `/supervisor` | High | AC-26 (supervisor) |
| To do | 19 | Supervisor signs or rejects | High | AC-19, AC-20, AC-28 |
| To do | 20 | Send to HR | High | AC-21 |
| To do | 21 | HR shared queue on `/hr` | High | AC-21 (both officers), AC-27 |
| To do | 22 | HR decides + first decision wins | High | AC-22, AC-23, AC-24, AC-28 |
| To do | 23 | Admin table (view only) | Medium | AC-30 |
| To do | 24 | Full pass against the leave checklist | High | AC-14 … AC-31, `npm run lint` |

---

## Task 1 – Set up the database and the `User` table *(High)*

> The system needs somewhere to keep users before anything can log in.

- **Goal:** A SQLite file exists, managed by Prisma, with the `User` table from design §1 — every doc 7.2 field plus the two lockout fields, and `email` unique.
- **Files:** `prisma/schema.prisma`; `.env` (git-ignored: `DATABASE_URL`, `SESSION_SECRET` placeholder) and `.env.example`; creates `package.json` → `prisma.seed` pointer (no version changes).
- **Check:**
  • Run `npx prisma migrate dev --name init` — it reports the migration applied.
  • Open `npx prisma studio` — the `User` table is visible with all 11 fields; `email` is marked unique.
  • `.env` is **not** in `git status` (git-ignored); `.env.example` is.
  • Traces to: design §1, §7; doc 7.2.

## Task 2 – Seed the 6 demo users *(High)*

> Everyone must be able to test with the same accounts (requirements U9).

- **Goal:** `npm run db:seed` inserts the 6 users from design Reference B, each with `password123` hashed by bcrypt; re-running it updates instead of duplicating.
- **Files:** `prisma/seed.ts`; `package.json` (add `db:seed` script only).
- **Check:**
  • Run `npm run db:seed` twice — still exactly 6 rows, no duplicates.
  • In `npx prisma studio`, every `passwordHash` starts with `$2` and a text search for `password123` finds nothing (AC-13).
  • The 6 emails match doc 7.2 exactly.
  • Traces to: U9, AC-13; design §2 rule 9, Reference B.

## Task 3 – Build the `/login` screen (form only) *(High)*

> Users need somewhere to type their credentials; nothing checks them yet.

- **Goal:** `/login` renders an email field, a password field, a Sign in button, and shows the format hint / generic error slots from design §4. No register or reset links. Submitting says the generic error (hard-wired for now — Task 6 makes it real).
- **Files:** `src/app/login/page.tsx`, `src/app/login/actions.ts` (stub `login` action).
- **Check:**
  • Open http://localhost:3000/login — the form shows as in design §4, nothing else.
  • Submit any values — the generic error text appears.
  • Traces to: U1, AC-06/AC-07 (wording); design §4.

## Task 4 – Sign and verify sessions (library) *(High)*

> The signed session cookie is the thread that ties every later task together.

- **Goal:** Server-only helpers that (a) sign a `{userId, role, expiresAt}` payload with HMAC-SHA256 from `SESSION_SECRET` and verify it — tampered, wrong-secret, or expired payloads return "not signed in"; (b) create/refresh/clear the `session` cookie with `httpOnly`, `sameSite=Lax`, `path=/`, `secure` on in production; (c) `getCurrentUser()` and `requireRole()` for pages.
- **Files:** `src/lib/db.ts`, `src/lib/session.ts`, `src/lib/auth.ts`.
- **Check:**
  • Run a throwaway `npx tsx` snippet: sign a payload, verify → payload back; flip one character → verify fails; set `expiresAt` in the past → verify fails.
  • A missing `SESSION_SECRET` makes the helper throw at once (design §6).
  • Traces to: U8, AC-09 (crypto part), U4; design §2 rules 6, 8, §5, §6.

## Task 5 – Role home stubs + signed-out redirects *(High)*

> Each role gets its own page, and nobody gets in without a session.

- **Goal:** `/employee`, `/supervisor`, `/hr`, `/admin` render the shared stub (name, role, division, designation, Logout button, "leave requests come in the next task" placeholder). A signed-out visitor to any of them — or via `/` for now — is redirected to `/login`; proxy makes the redirect quick, `requireRole` makes it real.
- **Files:** `src/components/RoleHome.tsx`; the four `page.tsx` files; `src/proxy.ts` (redirects only, per design rule 8).
- **Check:**
  • With no cookie, open `/employee`, `/hr`, `/admin` — all redirect to `/login` (AC-04).
  • In dev tools, manually set a `session` cookie signed with the dev `SESSION_SECRET` for `employee-1`'s id/role: `/employee` shows the stub; `/admin` sends you back to `/employee`, and the Admin home never renders (AC-03).
  • Tamper one character of the cookie — you're signed out again.
  • Traces to: U2, U3, U4, AC-03, AC-04; design §2 rules 2, 3, 8, §4.

## Task 6 – Log in: server action, session, errors *(High)*

> The heart of the module: real credentials, real session, no clues.

- **Goal:** The login action trims/lowercases the email, rejects non-`@budiman.com` with the format message before any lookup, checks the bcrypt hash, creates the session cookie and redirects to the user's own home. Unknown email or wrong password give the identical generic error (design rule 4). `/login` with a valid session redirects to that role's home.
- **Files:** `src/app/login/actions.ts` (real `login`), `src/lib/auth.ts` (login helper as needed).
- **Check:**
  • `employee-1@budiman.com` / `password123` → `/employee` stub with "Employee 1", *Employee*, *Finance* (AC-01).
  • Sign in as each of the other 4 demo users → each lands on its own home (AC-02, AC-10).
  • Wrong password vs unknown email → identical error wording (AC-06); `someone@gmail.com` → format message (AC-07); `  EMPLOYEE-1@BUDIMAN.COM ` → logs in (AC-11); open `/login` while signed in → home page (AC-12).
  • Traces to: U1, U2, U6, U9, U10, U11; design §2 rules 1, 4, 10, §6.

## Task 7 – Lock the account after 5 wrong passwords *(High)*

> Stop password guessing (OWASP, FR-10) without telling an attacker anything.

- **Goal:** Each wrong password for a real email raises `failedAttempts`; at 5, `lockedUntil` = now + 15 minutes; while locked, login is refused with "try again later" even for the right password; a successful login clears both fields (design rule 5).
- **Files:** `src/app/login/actions.ts`; `src/app/login/page.tsx` (locked message).
- **Check:**
  • 5 wrong passwords for `employee-1@budiman.com`, then a 6th attempt with the **correct** password → still refused, "try again later" (AC-08).
  • Meanwhile `supervisor-1@budiman.com` / `password123` still logs straight in (lockout is per account).
  • Wait 15 minutes (or set `lockedUntil` to the past in Prisma Studio) → the correct password works and `failedAttempts` is back to 0.
  • Traces to: U7, AC-08; design §2 rule 5, §6.

## Task 8 – Log out *(High)*

> Leaving must actually end the session (U5).

- **Goal:** The Logout button on every home posts a `logout` server action that clears the cookie and redirects to `/login`.
- **Files:** `src/app/login/actions.ts` (add `logout`), `src/components/RoleHome.tsx`.
- **Check:**
  • Sign in, click Logout → `/login`, and the `session` cookie is gone from dev tools (AC-05).
  • Press the browser Back button → no page data appears; reopening `/employee` redirects to `/login`.
  • Traces to: U5, AC-05; design §2 rule 7.

## Task 9 – Refresh the session on activity *(High)*

> 8 hours from last use, not from login (interview decision).

- **Goal:** Any served page re-issues the cookie with a fresh 8-hour expiry if the current one was issued more than an hour ago (design rule 6).
- **Files:** `src/proxy.ts` (read-only check there) + the refresh call in `src/lib/auth.ts`/home layout, whichever the Next 16 docs put the cookie-write in (cookie writes need a server context — verify against the bundled auth guide when building).
- **Check:**
  • Sign in; dev tools show the `session` cookie expiring ~8 hours out, flagged `httpOnly`, `sameSite=Lax` (AC-09 part 1).
  • Edit the cookie's expiry in dev tools to 10 minutes out, browse a page, wait >1s: expiry jumps back to ~8 hours (AC-09 part 2).
  • Set the expiry into the past manually → next request redirects to `/login` (AC-09 part 3).
  • Traces to: U8, AC-09; design §2 rule 6.

## Task 10 – Make `/` redirect *(Medium)*

> The starter page must stop being the home page; one home per role (FR-01).

- **Goal:** `/` redirects signed-out visitors to `/login` and signed-in users to their role's home (design rule 10).
- **Files:** `src/app/page.tsx` (replaces the starter page).
- **Check:**
  • Signed out, open http://localhost:3000/ → lands on `/login`.
  • Signed in as `hr-1@budiman.com`, open `/` → lands on `/hr`.
  • Traces to: U4, U11; design §2 rule 10.

## Task 11 – Full pass against the acceptance checklist *(High)*

> The doc's step 6 ("Check") for this module: walk every AC by hand.

- **Goal:** All 13 checks in requirements §4 pass on a fresh database, and lint is clean.
- **Files:** none new — fix whatever fails (spec first if behaviour was wrong).
- **Check:**
  • Delete the SQLite file, re-run Tasks 1–2's commands, sign in, and walk AC-01 … AC-13 top to bottom with the demo accounts, ticking each "To do" to Done.
  • `npm run lint` reports no errors.
  • Traces to: FR-01, FR-10; the whole of requirements §4.

---

# Leave Request – Tasks

> The build order for the Leave Request part of the specs. **AC-nn from
> AC-14 upward** refers to the Leave Request acceptance checklist in
> `01-requirements.md`; **LR-n** refers to the business rules in the Leave
> Request part of `02-design.md`. Same rules as the login tasks: build one
> task at a time, in order, High first; fix the spec first if behaviour was
> wrong; one conventional commit per task.

## Task 12 – LeaveRequest table + migration *(High)*

> The module needs somewhere to keep requests before anything else exists.

- **Goal:** A `LeaveRequest` model with every field from leave design §1
  (status, type, dates, remarks, officer id, the four timestamps) and
  relations to `User`, created by a real migration. `status` and `leaveType`
  are plain strings in SQLite — values are enforced in code from Task 13 on.
- **Files:** `prisma/schema.prisma`; new migration folder under
  `prisma/migrations/`.
- **Check:**
  • `npx prisma migrate dev --name leave_request` reports the migration applied.
  • In `npx prisma studio`, `LeaveRequest` shows all 15 fields including
    `employeeId`, `supervisorId`, `hrOfficerId`.
  • A throwaway `npx tsx` snippet creates one row (annual leave, two dates,
    status `PENDING_SUPERVISOR`), reads it back, deletes it.
  • Traces to: leave design §1; doc 7.2.
- **Commit:** `feat: add leave request table`

## Task 13 – Status/type constants + status chip *(High)*

> One place says what the seven statuses and five leave types are and what
> they look like, so no screen invents its own spelling.

- **Goal:** `src/lib/leave.ts` exports the leave types and statuses with
  their display names (doc 5.2 wording + "Withdrawn"), chip colours, and
  the LR-5 transition table with `assertAllowedTransition(action, user,
  request)`; `StatusChip` renders any status as a coloured pill **with the
  status word always visible**.
- **Files:** `src/lib/leave.ts`, `src/components/StatusChip.tsx`.
- **Check:**
  • A throwaway `npx tsx` snippet prints all 7 status labels and 5 type
    labels — the doc 5.2 words plus "Withdrawn" (interview Q2), and the
    doc 7.2 type names.
  • `assertAllowedTransition` accepts the 7 legal transitions and throws on
    an illegal one (e.g. Sign from `SIGNED`).
  • `npm run lint` clean.
  • Traces to: leave design §1, LR-5.
- **Commit:** `feat: add leave statuses and types`

## Task 14 – Employee leave form + submit checks *(High)*

> The heart of FR-02: the paper form becomes a screen, and every rule in
> LR-1…LR-4 is checked on the server before a row exists.

- **Goal:** `/employee/leave/new` renders the form from leave design §4
  (type select, conditional "what is it for" field, start/end dates,
  supervisor dropdown of own-division supervisors) with the inline confirm
  step; `createLeaveRequest` refuses non-employees, wrong-division or
  wrong-role supervisor ids, end-before-start, missing description on
  Other or Compassionate leave, and overlapping dates — and on success redirects to
  `/employee?done=submitted` with the green banner.
- **Files:** `src/app/employee/leave/new/page.tsx`,
  `src/app/employee/leave/new/actions.ts`, `src/components/SuccessBanner.tsx`,
  `src/app/employee/page.tsx` (banner hook), `tests/leave-submit.test.ts`.
- **Check:**
  • AC-14 (form side), AC-15, AC-16, AC-17, AC-18, AC-29 as written.
  • The saved row in `prisma studio` has the right fields and
    `PENDING_SUPERVISOR`; tampering the hidden supervisor id to an
    out-of-division user id is refused (AC-31 part).
  • Traces to: U12, U13, U22, U23; LR-1 … LR-4; FR-02.
- **Commit:** `feat: employee leave request form`

## Task 15 – Employee's own list on `/employee` *(High)*

> Goal 1 and 3: the employee can finally answer "where is my request?"

- **Goal:** The `/employee` placeholder becomes the employee's own request
  list, newest first, using the query-scoped rules of LR-11 — status chips,
  remarks where present, rows linking to the (not yet built) detail page,
  and a "New request" button.
- **Files:** `src/app/employee/page.tsx`, `src/components/RequestList.tsx`,
  `tests/leave-list.test.ts`.
- **Check:**
  • AC-14 (list side), AC-26 (employee part): only `employee-1`'s own rows;
    empty-state message when there are none.
  • Status words render exactly as the doc 5.2 names.
  • Traces to: U18; LR-11; FR-06.
- **Commit:** `feat: employee leave list`

## Task 16 – Request detail page + access matrix *(High)*

> One page shows a whole request, and only the people who should see it
> can. Actions render here in later tasks; nobody acts yet.

- **Goal:** `/requests/[id]` shows the full record (type and description,
  dates, status chip, submitted/signed/decided/withdrawn dates, both
  remarks, deciding officer). The LR-12 matrix runs on the server before
  render: owner, named supervisor, HR, Admin pass; everyone else is
  redirected to their own home. `ConfirmAction` (button → inline confirm
  row with optional remark field) is built and used by nothing yet.
- **Files:** `src/app/requests/[id]/page.tsx`,
  `src/components/ConfirmAction.tsx`, `tests/leave-detail.test.ts`,
  `src/proxy.ts` (route matchers).
- **Check:**
  • AC-26 (detail view), AC-31: signed-out → `/login`; `supervisor-2`
    opening a request naming *Supervisor 1* → denied to their own home.
  • With no actions built yet, no page shows an action button.
  • Traces to: U18; LR-12; AC-31 (FR-10).
- **Commit:** `feat: leave request detail page`

## Task 17 – Withdraw *(High)*

> The escape hatch from interview Q2, and the key that frees blocked dates.

- **Goal:** The owner can withdraw their own `PENDING_SUPERVISOR` request
  from the detail page, behind the confirm step, with a success banner;
  status `Withdrawn` + `withdrawnAt`; the dates become reusable (LR-4);
  a `SIGNED` request offers no Withdraw button.
- **Files:** `src/app/requests/[id]/actions.ts` (`withdraw`),
  `src/app/requests/[id]/page.tsx`, `tests/leave-withdraw.test.ts`.
- **Check:**
  • AC-25 and AC-18 exactly as written; AC-28 (withdraw row).
  • A POST of `withdraw` by a non-owner, by HR, or on a `SIGNED` request is
    refused by the server.
  • Traces to: U21, U22; LR-4, LR-8, LR-14.
- **Commit:** `feat: withdraw pending leave request`

## Task 18 – Supervisor list on `/supervisor` *(High)*

> The supervisor's "waiting for me" list — paper's "sign it" pile.

- **Goal:** `/supervisor` lists the requests where `supervisorId = me`,
  pending on top, history below, with status and remarks (LR-11).
- **Files:** `src/app/supervisor/page.tsx`, `tests/leave-supervisor-list.test.ts`.
- **Check:**
  • AC-26 (supervisor part): `supervisor-1` never sees a request naming
    *Supervisor 2*, and vice versa.
  • Traces to: U18; LR-11; FR-06.
- **Commit:** `feat: supervisor leave list`

## Task 19 – Supervisor signs or rejects *(High)*

> FR-03: the decision that moves the request forward — or ends it.

- **Goal:** On the detail page the named supervisor can **Sign** or
  **Reject** (remark required for rejection, absent for signing), each
  behind the confirm step with a success banner; both actions re-read the
  row and enforce the from-status (LR-5, LR-6).
- **Files:** `src/app/requests/[id]/actions.ts` (`sign`,
  `rejectBySupervisor`), `src/app/requests/[id]/page.tsx`,
  `tests/leave-supervisor-decide.test.ts`.
- **Check:**
  • AC-19, AC-20, AC-28 (sign/reject rows).
  • Empty remark on reject is refused before any write; `sign` by the
    employee or another supervisor is refused; `sign` on an already-`SIGNED`
    request is refused.
  • Traces to: U14; LR-5, LR-6; FR-03.
- **Commit:** `feat: supervisor sign or reject`

## Task 20 – Send to HR *(High)*

> FR-04: the employee's last mile — from signed to the HR queue.

- **Goal:** On a `SIGNED` request the owner can **Send to HR** behind the
  confirm step; status becomes `PENDING_HR` with a success banner; the
  shared HR query now includes it.
- **Files:** `src/app/requests/[id]/actions.ts` (`sendToHr`),
  `src/app/requests/[id]/page.tsx`, `tests/leave-send-hr.test.ts`.
- **Check:**
  • AC-21 as written (queue half is confirmed in Task 21).
  • Sending by a non-owner, or from any status other than `SIGNED`, is
    refused.
  • Traces to: U15; LR-5, LR-7; FR-04.
- **Commit:** `feat: send signed request to HR`

## Task 21 – HR shared queue on `/hr` *(High)*

> HR's single list of requests waiting for a decision — the third paper
> problem, gone.

- **Goal:** `/hr` shows status in {`PENDING_HR`, `APPROVED`,
  `REJECTED_HR`}, pending first and decided below with the deciding
  officer's name (LR-11). Both officers see the identical list (Q5).
- **Files:** `src/app/hr/page.tsx`, `tests/leave-hr-queue.test.ts`.
- **Check:**
  • AC-21 (both officers see a freshly sent request), AC-27.
  • Requests still `PENDING_SUPERVISOR`/`SIGNED` do not appear.
  • Traces to: U18, U19; LR-11; FR-05, FR-06.
- **Commit:** `feat: HR shared queue`

## Task 22 – HR decides + first decision wins *(High)*

> FR-05 plus interview Q4: real decisions, recorded officer, and no
> silent overwrites between the two officers.

- **Goal:** Any HR officer can **Approve** or **Reject** (remark required)
  a `PENDING_HR` request from the detail page, behind the confirm step.
  The action records `hrOfficerId` and `decidedAt`, re-reads the row
  inside the transaction, and refuses a late second officer with "already
  decided by <name> (<status>)".
- **Files:** `src/app/requests/[id]/actions.ts` (`approve`, `rejectByHr`),
  `src/app/requests/[id]/page.tsx`, `tests/leave-hr-decide.test.ts`.
- **Check:**
  • AC-22, AC-23, AC-24, AC-28 (decide rows) exactly as written.
  • Empty remark on reject refused; `approve` POSTed by an employee,
    supervisor or Admin is refused; a second decision on a final request is
    refused and changes nothing in the database.
  • Traces to: U16, U17; LR-5, LR-9, LR-10; FR-05.
- **Commit:** `feat: HR approve or reject`

## Task 23 – Admin table (view only) *(Medium)*

> FR-08 and doc 5.3 rule 6: the admin sees every record and touches none.

- **Goal:** `/admin` lists every leave record — including
  `PENDING_SUPERVISOR` and `SIGNED` ones that never reached HR — with
  employee, supervisor, dates, type, status chip, and deciding officer.
  No buttons anywhere (LR-13).
- **Files:** `src/app/admin/page.tsx`, `tests/leave-admin.test.ts`.
- **Check:**
  • AC-30 as written; a transition action POSTed while signed in as Admin
    is refused.
  • Traces to: U25; LR-11, LR-13; FR-08.
- **Commit:** `feat: admin leave records table`

## Task 24 – Full pass against the leave checklist *(High)*

> The doc's step 6 ("Check") for this module: walk every leave AC by hand
> and prove the security checks bite.

- **Goal:** All 18 leave checks (AC-14 … AC-31) pass on a fresh database,
  the `tests/leave-*.test.ts` suite passes, and lint is clean.
- **Files:** none new — fix whatever fails (spec first if behaviour was
  wrong).
- **Check:**
  • Delete the SQLite file, re-run Task 12's migration and `npm run db:seed`,
    sign in with the demo accounts, and walk AC-14 … AC-31 top to bottom,
    ticking each "To do" to Done.
  • `npm run lint` reports no errors.
  • Traces to: FR-02 … FR-08, FR-10; the whole of the leave requirements §4.
- **Commit:** `test: leave request acceptance pass`
