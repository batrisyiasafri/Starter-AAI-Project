import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'

// Task 21 (AC-21 both-officers half, AC-27; LR-11; FR-05/FR-06): /hr is the
// shared queue — PENDING_HR, APPROVED, REJECTED_HR, pending first, decided
// below with the deciding officer's name. Identical for hr-1 and hr-2.
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

let emp1Id: number
let sup1Id: number
let hr1Id: number
let hr2Id: number

async function mk(start: string, end: string, status: string, extra: Record<string, unknown> = {}) {
  return prisma.leaveRequest.create({
    data: {
      employeeId: emp1Id,
      supervisorId: sup1Id,
      leaveType: 'ANNUAL',
      startDate: D(start),
      endDate: D(end),
      status,
      ...extra,
    },
  })
}

before(async () => {
  await waitForServer()
  ;[emp1Id, sup1Id, hr1Id, hr2Id] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'employee-1@budiman.com' } }).then((u) => u.id),
    prisma.user.findUniqueOrThrow({ where: { email: 'supervisor-1@budiman.com' } }).then((u) => u.id),
    prisma.user.findUniqueOrThrow({ where: { email: 'hr-1@budiman.com' } }).then((u) => u.id),
    prisma.user.findUniqueOrThrow({ where: { email: 'hr-2@budiman.com' } }).then((u) => u.id),
  ])
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp1Id } })
  await mk('2027-02-01', '2027-02-02', 'PENDING_HR', {
    submittedAt: new Date(),
  })
  await mk('2027-01-05', '2027-01-06', 'APPROVED', {
    hrOfficerId: hr1Id,
    decidedAt: D('2027-01-07'),
    submittedAt: new Date(Date.now() - 48 * 3600_000),
  })
  await mk('2027-01-08', '2027-01-09', 'REJECTED_HR', {
    hrOfficerId: hr2Id,
    hrRemark: 'Business needs us that week',
    decidedAt: D('2027-01-10'),
    submittedAt: new Date(Date.now() - 24 * 3600_000),
  })
  // must NOT appear on /hr:
  await mk('2027-01-20', '2027-01-21', 'SIGNED', { signedAt: new Date() })
  await mk('2027-01-25', '2027-01-26', 'PENDING_SUPERVISOR')
})

after(async () => {
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp1Id } })
  await prisma.$disconnect()
})

for (const email of ['hr-1@budiman.com', 'hr-2@budiman.com']) {
  test(`AC-21/AC-27: ${email} sees the shared queue — pending first, decided below with the officer`, async () => {
    const res = await get('/hr', await cookieFor(email))
    assert.equal(res.status, 200)
    // pending + both decided rows
    assert.match(res.html, /1 Feb 2027/)
    assert.match(res.html, /5 Jan 2027/)
    assert.match(res.html, /8 Jan 2027/)
    // deciding officer's name on decided rows
    assert.ok(res.html.includes('Decided by HR 1'))
    assert.ok(res.html.includes('Decided by HR 2'))
    assert.ok(res.html.includes('Business needs us that week'))
    // pending renders above decided
    assert.ok(
      res.html.indexOf('1 Feb 2027') < res.html.indexOf('5 Jan 2027'),
      'pending first',
    )
    // not-yet-HR rows never reach this queue
    assert.doesNotMatch(res.html, /20 Jan 2027/, 'SIGNED must not show')
    assert.doesNotMatch(res.html, /25 Jan 2027/, 'PENDING_SUPERVISOR must not show')
  })
}

test('AC-27: the two officers see the identical list', async () => {
  const [a, b] = await Promise.all([
    get('/hr', await cookieFor('hr-1@budiman.com')),
    get('/hr', await cookieFor('hr-2@budiman.com')),
  ])
  const rows = (html: string) =>
    [...html.matchAll(/\/requests\/(\d+)/g)].map((m) => m[1]).join(',')
  assert.equal(rows(a.html), rows(b.html))
})

test('a non-HR role is bounced off /hr (already enforced; pinned here)', async () => {
  const res = await get('/hr', await cookieFor('employee-1@budiman.com'))
  assert.ok([301, 302, 303, 307, 308].includes(res.status))
  assert.match(res.location ?? '', /\/employee/)
})
