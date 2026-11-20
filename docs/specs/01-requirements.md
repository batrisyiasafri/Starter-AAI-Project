# Login – Requirements

> **This file answers:** What should the app do, and why?
> **Source of truth:** `docs/Agentic AI - HRMS Doc.pdf` (sections 4, 5.3, 6 FR-01/FR-10, 7.1, 7.2, 7.5).
> This spec covers **login only**. The leave request flow gets its own spec.
>
> When the app's behaviour needs to change, update this file **first**.

## 1. The problem

Budiman Company's leave process moves from paper to a web app, and the app is
only allowed to be used by Budiman staff, each acting as exactly one role
(doc 5.3 rule 1). Without a login, nothing else in the system can be trusted:
who submitted a request, who signed it, who decided.

This module provides:

1. Login with the user's work email (`@budiman.com`) and password
2. A signed session cookie that remembers the signed-in user (8 hours, refreshed on activity)
3. One home page per role, with no access to another role's pages (FR-01)
4. Logout
5. Protection against password guessing (account lockout) and other basic OWASP Top 10 risks (FR-10)
6. The 6 demo users from doc 7.2, loaded by a seed script

## 2. Who uses it (roles)

Every user has exactly one role (doc 7.2). The role is stored on the user
account and decides which pages they can open.

| Role | Home page | What they do |
|------|-----------|--------------|
| **Employee** | `/employee` | Logs in, sees their name, role, division and a Logout button. Leave forms come in a later spec. |
| **Supervisor** | `/supervisor` | Logs in, sees their name, role, division and a Logout button. Signing comes in a later spec. |
| **HR** | `/hr` | Logs in, sees their name, role, division and a Logout button. Decisions come in a later spec. |
| **Admin** | `/admin` | Logs in, sees their name, role, division and a Logout button. View only, always. |

All four roles start at the same page: `/login`. Anyone who is not signed in
and opens any page is sent to `/login`.

## 3. User stories

- **U1. Sign in** *(High)*. As a Budiman user, I can log in with my `@budiman.com` email and my password so that I can use the system (doc 5.3 rule 1, FR-01).
- **U2. Land on my role's home page** *(High)*. As a signed-in user, I am taken to my own role's home page after login so that I see only what my role needs (FR-01).
- **U3. No access to other roles' pages** *(High)*. As a signed-in user, I cannot open another role's pages so that each person sees only the requests they need to act on (FR-01, goals 2).
- **U4. Nobody uses the system unsigned** *(High)*. As the system, I send any visitor who is not signed in to `/login` so that every action has a known user behind it (doc 5.3 rule 1).
- **U5. Sign out** *(High)*. As a signed-in user, I can log out from a button on every page so that the next person at my laptop is not me.
- **U6. Wrong credentials give no clues** *(High)*. As a user who mistypes their email or password, I see one generic error ("Email or password is incorrect") so that the app never reveals whether an email exists (OWASP, doc 7.5).
- **U7. Locked after repeated guessing** *(High)*. As the system, I lock an account for 15 minutes after 5 wrong passwords so that password guessing is not practical (OWASP A07/A09, FR-10; interview decision).
- **U8. Sessions expire** *(High)*. As the system, I let a signed-in session last 8 hours and refresh it on activity so that abandoned or stolen sessions die overnight (interview decision).
- **U9. Demo accounts work out of the box** *(High)*. As a developer, I can log in as each of the 6 demo users from doc 7.2 with password `password123` so that everyone tests the same accounts.
- **U10. Friendly email entry** *(Medium)*. As a user, I can type my email with extra spaces or capitals and still log in, because the app trims and lowercases it before checking.
- **U11. Signed-in users skip the login page** *(Medium)*. As a signed-in user, opening `/login` takes me straight to my role's home page so that I never see a form I don't need.

## 4. Acceptance checklist

Demo accounts (doc 7.2): `employee-1@budiman.com`, `supervisor-1@budiman.com`,
`supervisor-2@budiman.com`, `hr-1@budiman.com`, `hr-2@budiman.com`,
`admin@budiman.com` — everyone's password is `password123`.

| Status | ID | Check | How to test |
|--------|----|-------|-------------|
| Done | AC-01 (U1) | Correct email + password logs the user in | • Open `/login`<br>• Sign in as `employee-1@budiman.com` / `password123`<br>• You should land on `/employee` showing "Employee 1", role *Employee*, division *Finance*, and a Logout button |
| Done | AC-02 (U2) | Each role lands on its own home page | • Log out, then sign in as `supervisor-1@budiman.com` → `/supervisor`; `hr-1@budiman.com` → `/hr`; `admin@budiman.com` → `/admin`. Each page shows that user's name, role and division |
| Done | AC-03 (U3) | Another role's pages are blocked | • Signed in as `employee-1@budiman.com`, open `/admin` directly<br>• You should be denied (redirected to `/employee` or shown an access-denied page), **not** see the Admin home |
| Done | AC-04 (U4) | Unsigned visitors cannot use the system | • Log out (or delete the session cookie)<br>• Open `/employee`, `/hr` and `/admin` directly<br>• Each should redirect to `/login` |
| Done | AC-05 (U5) | Logout ends the session | • Sign in, click Logout<br>• You should be back at `/login`<br>• Press the browser Back button — you should **not** get back into a page; pressing a home-page URL should redirect to `/login` |
| Done | AC-06 (U6) | Wrong credentials give one generic error, no user enumeration | • Open `/login`<br>• Try `employee-1@budiman.com` / `wrongpass` — note the error<br>• Try `nobody@budiman.com` / `password123` — the error must be **the same wording** |
| Done | AC-07 (U6) | Only `@budiman.com` emails are accepted | • Open `/login`<br>• Try `someone@gmail.com` / any password<br>• You should see a validation message that the email must end with `@budiman.com` (this fires before the password check, so it is allowed to be specific) |
| Done | AC-08 (U7) | 5 wrong passwords lock the account for 15 minutes | • As `employee-1@budiman.com`, enter a wrong password 5 times<br>• On the 6th attempt you should see a "try again later" message instead of the password check<br>• Sign in as `supervisor-1@budiman.com` — still works (lockout is per account, not system-wide) |
| Done | AC-09 (U8) | Sessions last 8 hours, refreshed on activity | • Sign in, note the session cookie's expiry in the browser dev tools: about 8 hours ahead, `httpOnly`, `sameSite=Lax`<br>• Reload a page — the expiry should move ~8 hours ahead again<br>• Manually set the cookie's expiry in the past, reload → redirected to `/login` |
| Done | AC-10 (U9) | All 6 demo accounts work | • Sign in once as each of the 6 demo users with `password123`<br>• Each lands on the home page of the role listed in section 2 |
| Done | AC-11 (U10) | Email is trimmed and lowercased | • Sign in as `  EMPLOYEE-1@BUDIMAN.COM ` (spaces and capitals)<br>• You should land on `/employee` |
| Done | AC-12 (U11) | Signed-in users are bounced off `/login` | • While signed in, open `/login`<br>• You should be redirected to your role's home page |
| Done | AC-13 (U6, security) | Passwords are stored hashed, never plain text | • Open the SQLite database file and look at the users table<br>• The password column should show bcrypt hashes (`$2…` strings), and a search for `password123` should find nothing |

## 5. Not included (for now)

Deliberately left out — do not build these as part of login:

- Registration or self-service accounts (interview: seed data only)
- User management screens for the Admin (Admin is view only, doc 5.3 rule 6)
- Forgot password / password reset screens (interview: reset means re-running the seed script)
- Changing your own password
- "Remember me" option (the session is always 8 hours, sliding)
- Multi-factor authentication
- Any leave request screens, statuses or rules — these get their own spec (FR-02 to FR-08)
