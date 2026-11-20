# Budiman HRMS – Leave Request module

A training project that replaces Budiman Company's paper leave forms with a
web app. Four roles — Employee, Supervisor, HR, Admin — move each request from
submission to decision. The source of truth is
`docs/Agentic AI - HRMS Doc.pdf`; the specs in `docs/specs/` come second.

## Built with

Next.js 16 + TypeScript, Tailwind CSS, Prisma with SQLite, bcryptjs. Screens
and server logic live in one project, using server actions (no separate API).
Login uses a signed session cookie and hashed passwords. Versions are pinned
in `package.json` — do not upgrade them.

## Run it

- `npm install`, then `npm run dev` → http://localhost:3000
- `npm run lint` to check the code. Needs Node 20.9 or newer.

## Where things live

- `docs/Agentic AI - HRMS Doc.pdf` — the project document: what to build and why
- `docs/specs/` — the three agreed spec files (requirements, design, tasks)
- `docs/templates/` — blank copies of those specs, for starting a module
- `src/app/` — all screens and server code

## How to work

- Spec-driven: write and approve 01-requirements, 02-design, 03-tasks before
  building. When behaviour must change, fix the spec first, then the code.
- Build one task at a time, in order, High priority first. Login comes first.
- Every commit message is a conventional commit: `feat: add login page`,
  `fix: block end date before start date`, `docs: update design spec`.
- Security follows the OWASP Top 10 (doc section 7.5) in everything built,
  not just one screen.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
