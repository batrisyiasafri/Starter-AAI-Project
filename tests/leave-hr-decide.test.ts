import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'
import {
  approveRequestCore,
  rejectByHrCore,
  approve,
  rejectByHr,
} from '../src/app/requests/[id]/actions'

// Task 22 (AC-22, AC-23, AC-24, AC-28; LR-5/9/10; FR-05; interview Q4):
// any HR officer decides PENDING_HR rows; the decision records the
// officer; a late second officer is refused and nothing changes.
const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const prisma = new PrismaClient()

async function get(path: string, cookie?: string) {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    headers: cookie ? { cookie } : undefined,
  })
  return { status: res.status, location: res.headers.get('location'), html: await res.text() }
}

async function cookieFor(email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  return `session=${await signSession({ userId: user.id, role: user.role, expiresAt: Date.now() + 60_000 })}`
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

let emp: { id: number; role: string }
let sup1: { id: number; role: string }
let hr1: { id: number; role: string }
let hr2: { id: number; role: string }
let admin: { id: number; role: string }

async function makePendingHr(start: string, end: string) {
  return prisma.leaveRequest.create({
    data: {
      employeeId: emp.id,
      supervisorId: sup1.id,
      leaveType: 'ANNUAL',
      startDate: D(start),
      endDate: D(end),
      status: 'PENDING_HR',
      signedAt: new Date(),
    },
  })
}

before(async () => {
  await waitForServer()
  const [e, s, h1, h2, a] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'employee-1@budiman.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'supervisor-1@budiman.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'hr-1@budiman.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'hr-2@budiman.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'admin@budiman.com' } }),
  ])
  emp = { id: e.id, role: e.role }
  sup1 = { id: s.id, role: s.role }
  hr1 = { id: h1.id, role: h1.role }
  hr2 = { id: h2.id, role: h2.role }
  admin = { id: a.id, role: a.role }
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp.id } })
})

after(async () => {
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp.id } })
  await prisma.$disconnect()
})

test('AC-22: hr-1 approves — Approved, hrOfficerId + decidedAt recorded', async () => {
  const a = await makePendingHr('2027-02-01', '2027-02-02')
  const r = await approveRequestCore(hr1, a.id)
  assert.ok('ok' in r, JSON.stringify(r))
  const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.id } })
  assert.equal(row.status, 'APPROVED')
  assert.equal(row.hrOfficerId, hr1.id)
  assert.ok(row.decidedAt instanceof Date)
})

test('AC-23: reject needs a remark; with one it records officer, remark and date', async () => {
  const a = await makePendingHr('2027-02-05', '2027-02-06')
  assert.ok('error' in await rejectByHrCore(hr2, a.id, '  '), 'empty remark refused')
  let row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.id } })
  assert.equal(row.status, 'PENDING_HR', 'nothing written')

  const r = await rejectByHrCore(hr2, a.id, 'Business needs us that week')
  assert.ok('ok' in r, JSON.stringify(r))
  row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.id } })
  assert.equal(row.status, 'REJECTED_HR')
  assert.equal(row.hrOfficerId, hr2.id)
  assert.equal(row.hrRemark, 'Business needs us that week')
  assert.ok(row.decidedAt instanceof Date)

  // visible to the employee and to admin on the detail page
  for (const email of ['employee-1@budiman.com', 'admin@budiman.com']) {
    const res = await get(`/requests/${a.id}`, await cookieFor(email))
    assert.ok(res.html.includes('Business needs us that week'), `${email} sees the remark`)
    assert.ok(res.html.includes('Decided by HR 2'), `${email} sees the officer`)
  }
})

test('AC-24: the late second officer is refused and nothing changes', async () => {
  const a = await makePendingHr('2027-02-10', '2027-02-11')
  assert.ok('ok' in await approveRequestCore(hr1, a.id))
  const late = await approveRequestCore(hr2, a.id)
  assert.ok('error' in late, 'late approve refused')
  if ('error' in late) {
    assert.match(late.error, /decided by HR 1 \(Approved\)/, 'names who decided')
  }
  const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.id } })
  assert.equal(row.hrOfficerId, hr1.id, 'officer unchanged')
  assert.equal(row.status, 'APPROVED', 'status unchanged')
})

test('LR-13/security: employee, supervisor and Admin cannot decide', async () => {
  const a = await makePendingHr('2027-02-15', '2027-02-16')
  assert.ok('error' in await approveRequestCore(emp, a.id))
  assert.ok('error' in await approveRequestCore(sup1, a.id))
  assert.ok('error' in await approveRequestCore(admin, a.id), 'LR-13: admin never acts')
  assert.ok('error' in await rejectByHrCore(admin, a.id, 'nope'))
  const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.id } })
  assert.equal(row.status, 'PENDING_HR')
})

test('AC-22: the detail page offers Approve/Reject to HR only, while Pending HR', async () => {
  const a = await makePendingHr('2027-02-20', '2027-02-21')
  const hr = await get(`/requests/${a.id}`, await cookieFor('hr-1@budiman.com'))
  assert.match(hr.html, />Approve</)
  assert.match(hr.html, />Reject</)

  const empRes = await get(`/requests/${a.id}`, await cookieFor('employee-1@budiman.com'))
  assert.doesNotMatch(empRes.html, />Approve</)
  assert.doesNotMatch(empRes.html, />Reject</)

  assert.ok('ok' in await approveRequestCore(hr1, a.id))
  const decided = await get(`/requests/${a.id}`, await cookieFor('hr-2@budiman.com'))
  assert.doesNotMatch(decided.html, />Approve</, 'no buttons on a decided request')
})

test('AC-22/AC-28: decided rows leave the pending section and the banners name the action', async () => {
  const pending = await makePendingHr('2027-02-24', '2027-02-25')
  const decided = await makePendingHr('2027-02-26', '2027-02-27')
  await approveRequestCore(hr1, decided.id)

  const queue = await get('/hr', await cookieFor('hr-1@budiman.com'))
  assert.ok(
    queue.html.indexOf('24 Feb 2027') < queue.html.indexOf('26 Feb 2027'),
    'approved row sits below the pending one',
  )

  const approvedBanner = await get(`/requests/${pending.id}?done=approved`, await cookieFor('hr-1@budiman.com'))
  assert.match(approvedBanner.html, /Request approved\./)
  const rejectedBanner = await get(`/requests/${pending.id}?done=rejected`, await cookieFor('hr-1@budiman.com'))
  assert.match(rejectedBanner.html, /Request rejected\./)
})

test('the approve/rejectByHr server actions are wired as functions', () => {
  assert.equal(typeof approve, 'function')
  assert.equal(typeof rejectByHr, 'function')
})
