# Login – Design

> **This file answers:** How is the app put together? (data, rules, screens,
> where the code lives)
> **Who:** The AI drafted it from `01-requirements.md`, the HRMS doc, and the
> interview. You review all of it.
>
> If this file and the requirements disagree, fix the requirements first,
> then this file.

## 1. Tables

The login module needs one table. Leave-request tables arrive with the leave
module's own design spec.

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
