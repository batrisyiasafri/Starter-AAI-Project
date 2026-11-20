# Login – Requirements

> **This file answers:** What should the app do, and why?
> **Source of truth:** `docs/Agentic AI - HRMS Doc.pdf` (sections 4, 5.3, 6 FR-01/FR-10, 7.1, 7.2, 7.5).
> This spec covers **login**. The leave request flow is covered in the
> Leave Request part at the bottom of this file.
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
- Any leave request screens, statuses or rules — covered by the Leave Request part below (FR-02 to FR-08)

---

# Leave Request – Requirements

> **This file answers:** What must the leave module do, and how do we check it?
> **Source of truth:** `docs/Agentic AI - HRMS Doc.pdf` (sections 4, 5.1–5.3,
> 6 FR-02…FR-08 and FR-10, 7.2, 7.5) and the interview of 20 Nov 2026 (Q1–Q6).
> This part covers the leave request flow. The login part above is unchanged.
>
> When leave behaviour must change, update this part **first**, then design,
> then code.

## 1. The problem

Budiman's leave still runs on paper (doc 2): forms get lost or delayed,
employees cannot see where their request is, and HR has no single list of
requests waiting for a decision. Login is built; the paper form now needs a
home.

This part of the module provides:

1. A leave form for employees — leave type, start and end dates, and a
   supervisor picked from their own division (doc 5.3 rule 3, FR-02)
2. The named supervisor signs or rejects; a rejection needs a remark
   (doc 5.2, FR-03)
3. The employee sends a signed request to the shared HR queue (FR-04)
4. Either HR officer decides; the system records who; a rejection needs a
   remark (doc 5.3 rule 5, FR-05)
5. Each role sees its current and past requests with status and remarks
   (FR-06); the admin sees every record, view only (FR-08)
6. Every action asks for confirmation first and shows a success message
   afterwards (FR-07)
7. Withdrawal of a still-unsigned request, so a submitted mistake is not a
   dead end (interview Q2). This adds one status beyond doc 5.2:
   **Withdrawn**
8. Overlapping duplicate requests blocked (interview Q3)
9. Past-dated requests allowed — the only date rule is end ≥ start
   (interview Q6); no day balances are tracked (interview Q1)

## 2. Who uses it (roles)

| Role | Where they work in this module | What they do here |
|------|-------------------------------|-------------------|
| **Employee** | `/employee`, `/employee/leave/new`, `/requests/[id]` | Submits a request, tracks its status, withdraws it while still Pending supervisor, sends a signed request to HR |
| **Supervisor** | `/supervisor`, `/requests/[id]` | Signs or rejects the requests naming them; a rejection needs a remark |
| **HR** | `/hr`, `/requests/[id]` | Approves or rejects any request in the shared HR queue; the officer who decides is recorded |
| **Admin** | `/admin` | Sees every leave record, including requests that never reached HR. Never acts |

Supervisors, HR and Admin never submit leave themselves (doc 5.3 rule 2).
All pages still require the login session from the login part above.

## 3. User stories

- **U12. Submit a leave request** *(High)*. As an Employee, I fill in the leave type, start and end dates, and my supervisor, and submit — replacing the paper form (FR-02, doc 5.3 rule 3).
- **U13. Supervisor choices are my division's** *(High)*. As an Employee, the supervisor picker shows only Supervisor users from my own division, so I can't send a request to the wrong department (FR-02, doc 5.3 rule 3).
- **U14. Sign or reject** *(High)*. As a Supervisor, I sign or reject the requests sent to me; a rejection must carry a remark so the employee knows why (doc 5.2, FR-03).
- **U15. Send to HR** *(High)*. As an Employee, once my request is signed I send it to the shared HR queue (doc 5.3 rule 5, FR-04).
- **U16. HR decision** *(High)*. As an HR officer, I approve or reject any request in the HR queue; a rejection must carry a remark, and my name is recorded as the decider (FR-05, doc 5.3 rule 5).
- **U17. First decision wins** *(High)*. As the system, I refuse a decision on a request that was already decided, and tell the late officer who decided and when (interview Q4).
- **U18. Status is visible everywhere** *(High)*. As any role, I see my current and past requests with status and remarks, so nothing gets lost (FR-06, goal 3).
- **U19. HR shares one list** *(High)*. As an HR officer, I see everything that reached the HR stage, including what my fellow officer already decided (interview Q5).
- **U20. Confirm, then confirm it worked** *(High)*. As any role, I am asked to confirm before an action takes effect, and I see a success message after it (FR-07).
- **U21. Withdraw an unsigned request** *(High)*. As an Employee, I withdraw my request while it is still Pending supervisor; it stays in the lists as Withdrawn (interview Q2).
- **U22. No double-booking** *(High)*. As the system, I refuse a new request whose dates overlap one of the same employee's requests that is active or Approved; withdrawing frees the dates (interview Q3).
- **U23. Past dates allowed** *(High)*. As an Employee, I can submit a request that already started — e.g. after a bereavement; the only date rule is end ≥ start (interview Q6).
- **U24. Rejected means start again** *(High)*. As an Employee, a rejection is final; I submit a fresh request rather than reopening the old one (doc 5.2 "Final", interview).
- **U25. Admin sees everything** *(Medium)*. As the Admin, I see every leave record, view only, and change nothing (FR-08, doc 5.3 rule 6).

## 4. Acceptance checklist (leave request)

All checks use the demo accounts from §4 above (password `password123`).
"Studio" means `npx prisma studio`. IDs continue from the login checklist.

| Status | ID | Check | How to test |
|--------|----|-------|-------------|
| Done | AC-14 (U12) | Employee submits a request | • Sign in as `employee-1@budiman.com` → `/employee` shows an (empty) list and a **New request** button<br>• New request: type *Annual leave*, tomorrow → day after, supervisor *Supervisor 1* → confirm<br>• Success message appears; the list row reads **Pending supervisor**<br>• Sign in as `supervisor-1@budiman.com`: the same request is in their list |
| Done | AC-15 (U13) | Picker shows only same-division supervisors | • Open the form as `employee-1` (Finance)<br>• The supervisor dropdown lists exactly *Supervisor 1* and *Supervisor 2*<br>• No HR, Admin, or user from another division appears |
| Done | AC-16 (U12) | End date cannot precede start | • In the form, set end before start → submit<br>• A validation error names the dates; studio shows no new row |
| Done | AC-17 (U12) | "Other" and "Compassionate" need a description | • Choose type *Other*, leave the description empty → submit is refused with a message<br>• Fill "volunteering at the community centre" → saved; the detail page shows the description<br>• Choose *Compassionate leave* with an empty description → also refused (doc 7.2: compassionate leave — "the employee must write what is for"); fill it → saved |
| Done | AC-18 (U22) | Overlapping dates blocked; withdrawal and rejection free them | • Submit request A for 1–5 Dec → succeeds<br>• Submit request B for 4–8 Dec → refused, message names A's dates<br>• Withdraw A → submit B again → now it succeeds<br>• Submit C for 1–5 Dec and have the supervisor reject it → those dates are free again (interview Q3: only active + Approved block) |
| Done | AC-19 (U14) | Supervisor signs | • Sign in as `supervisor-1@budiman.com`, open the request, **Sign** → confirm → success message<br>• Status becomes **Signed**; as `employee-1` the detail page shows "Signed by Supervisor 1" with the date |
| Done | AC-20 (U14) | Supervisor rejects with a required remark | • Employee submits to *Supervisor 2*; `supervisor-2@budiman.com` clicks **Reject** with an empty remark → refused<br>• Reject with a remark → status **Rejected by supervisor**; the employee sees the remark<br>• The rejected request offers no reopen button, and the employee can submit a fresh one (U24) |
| Done | AC-21 (U15) | Employee sends a signed request to HR | • On a Signed request as `employee-1`, click **Send to HR** → confirm → success message, status **Pending HR**<br>• Both `hr-1@budiman.com` and `hr-2@budiman.com` see it in their list |
| Done | AC-22 (U16) | HR approves; officer recorded | • `hr-1` opens the Pending HR request, **Approve** → confirm → status **Approved**<br>• The record shows "Decided by HR 1" and the date, to employee, supervisor and admin<br>• The request leaves the pending section of the HR list |
| Done | AC-23 (U16) | HR rejects with a required remark | • On another Pending HR request, `hr-2` clicks **Reject** with an empty remark → refused<br>• Reject with a remark → **Rejected by HR**; remark and "Decided by HR 2" are visible to employee, supervisor and admin |
| Done | AC-24 (U17) | A late second decision is refused | • Open the same Pending HR request in two browser tabs, signed in as `hr-1` and `hr-2`<br>• `hr-1` approves<br>• `hr-2` clicks Approve on the stale tab → refused with "already decided by HR 1"; status, officer and date are unchanged |
| Done | AC-25 (U21) | Withdraw only while pending | • A Pending supervisor request as `employee-1` shows **Withdraw** → confirm → status **Withdrawn**, still listed<br>• A Signed request shows no Withdraw button |
| Done | AC-26 (U18) | Each role sees its own list | • `employee-1` sees all their own requests (current and past, including Withdrawn/Rejected with remarks)<br>• `supervisor-1` sees only requests naming them — a request sent to *Supervisor 2* never appears for `supervisor-1` |
| Done | AC-27 (U19) | HR list includes decided requests | • With some Approved and Rejected by HR requests existing, both `hr-1` and `hr-2` see them below the pending ones, each showing which officer decided |
| Done | AC-28 (U20) | Confirm before, success after | • Perform submit, sign, reject, withdraw, send to HR, approve: each first shows a confirm step (nothing changes until confirmed), then shows a success message naming the action |
| Done | AC-29 (U23) | Past dates accepted | • Submit a request starting last week → it saves and shows **Pending supervisor** with those dates |
| Done | AC-30 (U25) | Admin is view only | • `admin@budiman.com` opens `/admin`: every leave record is listed, including Pending supervisor and Signed ones that never reached HR<br>• No action button exists anywhere on `/admin` |
| Done | AC-31 (FR-10) | Outsiders and wrong roles are refused | • Signed out, open `/requests/<any id>` and `/employee/leave/new` → redirected to `/login`<br>• `supervisor-2` opens the detail page of a request naming *Supervisor 1* → access denied (not their request)<br>• `hr-1` tries to reach `/employee/leave/new` → denied (wrong role)<br>• Tamper the form's hidden supervisor id to an id from another division → submit refused |

## 5. Not included (for now) — leave request

Deliberately left out — do not build these as part of this module:

- Leave balances, day quotas, or counting days (interview Q1: HR judges)
- Editing a submitted request (interview Q2: withdraw and submit again)
- Reopening or appealing a rejection — rejections are final (U24)
- Supervisors, HR or Admin submitting leave for themselves (doc 5.3 rule 2)
- Email or any notification; nothing "pings" an approver
- Working-day or public-holiday maths — dates are calendar days, weekends
  count, exactly as on the paper form
- Admin filters, export, or search beyond a sorted table (Low; spec first, FR-09)
- "My supervisor is away" delegation rules — not in the doc
