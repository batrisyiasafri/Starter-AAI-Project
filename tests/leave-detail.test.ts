import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'

// Task 16: /requests/[id] shows the whole record, and the LR-12 access
// matrix (owner, named supervisor, HR, Admin) runs on the server. No action
// buttons exist yet — that is later tasks. (AC-26 detail view, AC-31.)
const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const prisma = new PrismaClient()
const TEMP_EMAIL = 'temp-leave-detail@budiman.com'

async function get(path: string, cookie?: string) {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    headers: cookie ? { cookie } : undefined,
  })
  return {
    status: res.status,
    location: res.headers.get('location'),
    html: await res.text(),
  }
}

async function cookieFor(email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  return `session=${await signSession({
    userId: user.id,
    role: user.role,
    expiresAt: Date.now() + 60_000,
  })}`
}

async function waitForServer(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const res = await fetch(BASE + '/login')
      if (res.status < 500) return
    } catch {
      /* starting */
    }
    if (Date.now() > deadline) throw new Error('dev server did not start')
    await new Promise((r) => setTimeout(r, 1000))
  }
}

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)
const REDIRECTS = [301, 302, 303, 307, 308]

let emp1Id: number
let sup1Id: number
let hr1Id: number

// ids of probe rows
let R_pending = 0
let R_other = 0
let R_withdrawn = 0

async function clearAll() {
  const emails = ['employee-1@budiman.com', TEMP_EMAIL]
  const users = await prisma.user.findMany({ where: { email: { in: emails } } })
  await prisma.leaveRequest.deleteMany({
    where: { employeeId: { in: users.map((u) => u.id) } },
  })
  await prisma.user.deleteMany({ where: { email: TEMP_EMAIL } })
}

before(async () => {
  await waitForServer()
  ;[emp1Id, sup1Id, , hr1Id] = await Promise.all([
    prisma.user
      .findUniqueOrThrow({ where: { email: 'employee-1@budiman.com' } })
      .then((u) => u.id),
    prisma.user
      .findUniqueOrThrow({ where: { email: 'supervisor-1@budiman.com' } })
      .then((u) => u.id),
    prisma.user
      .findUniqueOrThrow({ where: { email: 'supervisor-2@budiman.com' } })
      .then((u) => u.id),
    prisma.user
      .findUniqueOrThrow({ where: { email: 'hr-1@budiman.com' } })
      .then((u) => u.id),
  ])
  await clearAll()

  await prisma.user.create({
    data: {
      email: TEMP_EMAIL,
      name: 'Temp Other Employee',
      icNumber: '90-123457',
      passwordHash:
        '$2b$10$Kx/MLSwkJ5WbbLmmhy8iPezVZ6m.cQeEiyMf9G8pXP8bl1dHn774q',
      role: 'EMPLOYEE',
      division: 'Finance',
      designation: 'Clerk',
    },
  })

  R_pending = (
    await prisma.leaveRequest.create({
      data: {
        employeeId: emp1Id,
        supervisorId: sup1Id,
        leaveType: 'ANNUAL',
        startDate: D('2027-06-01'),
        endDate: D('2027-06-03'),
        status: 'PENDING_SUPERVISOR',
      },
    })
  ).id
  R_other = (
    await prisma.leaveRequest.create({
      data: {
        employeeId: emp1Id,
        supervisorId: sup1Id,
        leaveType: 'OTHER',
        otherLeaveType: 'volunteering at the community centre',
        startDate: D('2027-07-10'),
        endDate: D('2027-07-12'),
        status: 'APPROVED',
        supervisorRemark: 'Enjoy',
        hrOfficerId: hr1Id,
        hrRemark: 'Approved, enjoy your volunteering',
        signedAt: D('2027-06-20'),
        decidedAt: D('2027-06-25'),
      },
    })
  ).id
  R_withdrawn = (
    await prisma.leaveRequest.create({
      data: {
        employeeId: emp1Id,
        supervisorId: sup1Id,
        leaveType: 'UNPAID',
        startDate: D('2027-10-01'),
        endDate: D('2027-10-02'),
        status: 'WITHDRAWN',
        withdrawnAt: D('2027-09-15'),
      },
    })
  ).id
})

after(async () => {
  await clearAll()
  await prisma.$disconnect()
})

test('AC-26: the owner sees the whole record — type, description, dates, chip, timestamps, remarks, officer', async () => {
  const res = await get(`/requests/${R_other}`, await cookieFor('employee-1@budiman.com'))
  assert.equal(res.status, 200)
  assert.match(res.html, /Other/)
  assert.ok(res.html.includes('volunteering at the community centre'))
  assert.match(res.html, /10 Jul 2027/)
  assert.match(res.html, /12 Jul 2027/)
  assert.match(res.html, /Approved/)
  assert.match(res.html, /Submitted/)
  assert.match(res.html, /Signed/)
  assert.match(res.html, /20 Jun 2027/)
  assert.match(res.html, /Decided/)
  assert.ok(res.html.includes('Approved, enjoy your volunteering'))
  assert.ok(res.html.includes('Decided by HR 1'))
})

test('the owner sees the withdrawn date on a withdrawn request', async () => {
  const res = await get(`/requests/${R_withdrawn}`, await cookieFor('employee-1@budiman.com'))
  assert.equal(res.status, 200)
  assert.match(res.html, /Withdrawn/)
  assert.match(res.html, /15 Sep 2027/)
})

test('AC-26: the named supervisor sees the request, including whose it is', async () => {
  const res = await get(`/requests/${R_pending}`, await cookieFor('supervisor-1@budiman.com'))
  assert.equal(res.status, 200)
  assert.match(res.html, /Employee 1/)
  assert.match(res.html, /Annual leave/)
})

test('AC-31: a supervisor not named on the request is bounced to their own home', async () => {
  const res = await get(`/requests/${R_pending}`, await cookieFor('supervisor-2@budiman.com'))
  assert.ok(REDIRECTS.includes(res.status), `expected redirect, got ${res.status}`)
  assert.match(res.location ?? '', /\/supervisor/)
  assert.doesNotMatch(res.html, /Employee 1/)
})

test('AC-31: an employee who is not the owner is bounced to their own home', async () => {
  const res = await get(`/requests/${R_pending}`, await cookieFor(TEMP_EMAIL))
  assert.ok(REDIRECTS.includes(res.status), `expected redirect, got ${res.status}`)
  assert.match(res.location ?? '', /\/employee/)
  assert.doesNotMatch(res.html, /Annual leave/)
})

test('AC-26: any HR officer and Admin may open any request', async () => {
  for (const email of ['hr-1@budiman.com', 'hr-2@budiman.com', 'admin@budiman.com']) {
    const res = await get(`/requests/${R_other}`, await cookieFor(email))
    assert.equal(res.status, 200, `${email} should see the detail page`)
    assert.match(res.html, /Approved/)
  }
})

test('AC-31: signed-out visitors of a detail page go to /login', async () => {
  const res = await get(`/requests/${R_pending}`)
  assert.ok(REDIRECTS.includes(res.status))
  assert.match(res.location ?? '', /\/login/)
})

test('an unknown id is a 404, not a leak', async () => {
  const res = await get(`/requests/999999`, await cookieFor('employee-1@budiman.com'))
  assert.equal(res.status, 404)
})

test('supervisor/HR action buttons are not built yet (Tasks 19/20/22 own those)', async () => {
  // Task 16 built no actions at all; Task 17 legitimately added Withdraw
  // for the owner (checked in leave-withdraw.test.ts). Sign/Reject/Send
  // to HR/Approve must stay absent until their own tasks.
  const res = await get(`/requests/${R_pending}`, await cookieFor('employee-1@budiman.com'))
  assert.doesNotMatch(res.html, />(Sign|Reject|Approve|Send to HR|Confirm)</)
})
