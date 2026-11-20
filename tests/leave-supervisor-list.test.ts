import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'

// Task 18 (AC-26 supervisor part; LR-11): /supervisor lists only requests
// naming that supervisor — pending on top, history below, with the
// employee's name so the supervisor knows whose it is.
const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const prisma = new PrismaClient()

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

let emp1Id: number
let sup1Id: number
let sup2Id: number
let R_s2_pending = 0

async function clearAll() {
  await prisma.leaveRequest.deleteMany({})
}

before(async () => {
  await waitForServer()
  ;[emp1Id, sup1Id, sup2Id] = await Promise.all([
    prisma.user
      .findUniqueOrThrow({ where: { email: 'employee-1@budiman.com' } })
      .then((u) => u.id),
    prisma.user
      .findUniqueOrThrow({ where: { email: 'supervisor-1@budiman.com' } })
      .then((u) => u.id),
    prisma.user
      .findUniqueOrThrow({ where: { email: 'supervisor-2@budiman.com' } })
      .then((u) => u.id),
  ])
  await clearAll()
  // supervisor-1 gets one pending and one decided history row
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
  await prisma.leaveRequest.create({
    data: {
      employeeId: emp1Id,
      supervisorId: sup1Id,
      leaveType: 'UNPAID',
      startDate: D('2027-05-01'),
      endDate: D('2027-05-02'),
      status: 'APPROVED',
      supervisorRemark: 'Fine',
      hrRemark: 'Approved',
      submittedAt: new Date(Date.now() - 72 * 3600_000),
    },
  })
  // supervisor-2's own row
  R_s2_pending = (
    await prisma.leaveRequest.create({
      data: {
        employeeId: emp1Id,
        supervisorId: sup2Id,
        leaveType: 'MATERNITY',
        startDate: D('2027-08-01'),
        endDate: D('2027-08-02'),
        status: 'PENDING_SUPERVISOR',
      },
    })
  ).id
})

after(async () => {
  await clearAll()
  await prisma.$disconnect()
})

test('AC-26: supervisor-1 sees own rows with employee name, pending above history', async () => {
  const res = await get('/supervisor', await cookieFor('supervisor-1@budiman.com'))
  assert.equal(res.status, 200)
  assert.match(res.html, /1 Jun 2027/) // pending
  assert.match(res.html, /1 May 2027/) // history
  assert.match(res.html, /Employee 1/)
  // pending row before the history row
  const iPending = res.html.indexOf('1 Jun 2027')
  const iHistory = res.html.indexOf('1 May 2027')
  assert.ok(iPending < iHistory, 'pending must render above history')
})

test('AC-26: a request naming Supervisor 2 never appears for supervisor-1', async () => {
  const res = await get('/supervisor', await cookieFor('supervisor-1@budiman.com'))
  assert.doesNotMatch(res.html, /1 Aug 2027/, "supervisor-2's request leaked")
  assert.doesNotMatch(res.html, /Maternity leave/)
})

test('AC-26: and vice versa — supervisor-2 sees only their own', async () => {
  const res = await get('/supervisor', await cookieFor('supervisor-2@budiman.com'))
  assert.equal(res.status, 200)
  assert.match(res.html, /1 Aug 2027/)
  assert.doesNotMatch(res.html, /1 Jun 2027/)
  assert.doesNotMatch(res.html, /1 May 2027/)
})

test('a supervisor with nothing assigned sees the empty state', async () => {
  await prisma.leaveRequest.delete({ where: { id: R_s2_pending } })
  const res = await get('/supervisor', await cookieFor('supervisor-2@budiman.com'))
  assert.equal(res.status, 200)
  assert.match(res.html, /No leave requests yet/i)
})
