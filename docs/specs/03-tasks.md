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
