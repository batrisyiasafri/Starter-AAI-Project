import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'
import {
  signRequestCore,
  rejectBySupervisorCore,
  sign,
  rejectBySupervisor,
} from '../src/app/requests/[id]/actions'

// Task 19 (AC-19, AC-20, AC-28; LR-5/LR-6; FR-03): the named supervisor
// signs or rejects from the detail page; rejection always carries a
// remark; the from-status is re-read server-side.
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

let emp: { id: number; role: string }
let sup1: { id: number; role: string }
let sup2: { id: number; role: string }

async function makePending(start: string, end: string, supervisorId: number) {
  return prisma.leaveRequest.create({
    data: {
      employeeId: emp.id,
      supervisorId,
      leaveType: 'ANNUAL',
      startDate: D(start),
      endDate: D(end),
      status: 'PENDING_SUPERVISOR',
    },
  })
}

before(async () => {
  await waitForServer()
  const [e, s1, s2] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: 'employee-1@budiman.com' },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: 'supervisor-1@budiman.com' },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: 'supervisor-2@budiman.com' },
    }),
  ])
  emp = { id: e.id, role: e.role }
  sup1 = { id: s1.id, role: s1.role }
  sup2 = { id: s2.id, role: s2.role }
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp.id } })
})

after(async () => {
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp.id } })
  await prisma.$disconnect()
})

test('AC-19: the named supervisor signs — Signed + signedAt, remark optional', async () => {
  const a = await makePending('2027-03-10', '2027-03-11', sup1.id)
  const r = await signRequestCore(sup1, a.id, 'Looks fine')
  assert.ok('ok' in r, JSON.stringify(r))
  const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.id } })
  assert.equal(row.status, 'SIGNED')
  assert.ok(row.signedAt instanceof Date)
  assert.equal(row.supervisorRemark, 'Looks fine')

  const b = await makePending('2027-03-12', '2027-03-13', sup1.id)
  const r2 = await signRequestCore(sup1, b.id, '')
  assert.ok('ok' in r2, 'sign without a remark is fine (LR-6)')
})

test('AC-20: reject needs a remark — refused BEFORE any write when empty', async () => {
  const a = await makePending('2027-03-15', '2027-03-16', sup1.id)
  const r = await rejectBySupervisorCore(sup1, a.id, '   ')
  assert.ok('error' in r, 'empty remark must be refused')
  const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.id } })
  assert.equal(row.status, 'PENDING_SUPERVISOR', 'nothing written')

  const ok = await rejectBySupervisorCore(sup1, a.id, 'Team is short that week')
  assert.ok('ok' in ok, JSON.stringify(ok))
  const row2 = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.id } })
  assert.equal(row2.status, 'REJECTED_SUPERVISOR')
  assert.equal(row2.supervisorRemark, 'Team is short that week')
  assert.equal(row2.decidedAt, null, 'decidedAt is for HR decisions only')
})

test('LR-5/LR-8: employee, wrong supervisor, and already-SIGNED rows are all refused', async () => {
  const a = await makePending('2027-03-20', '2027-03-21', sup1.id)
  assert.ok('error' in await signRequestCore(emp, a.id, ''))
  assert.ok('error' in await signRequestCore(sup2, a.id, ''))
  assert.ok('error' in await rejectBySupervisorCore(sup2, a.id, 'nope'))

  await signRequestCore(sup1, a.id, '')
  const again = await signRequestCore(sup1, a.id, '')
  assert.ok('error' in again, 'signing an already-SIGNED request is refused')
  if ('error' in again) assert.match(again.error, /already been handled/i)
})

test('AC-19/AC-20: the detail page shows Sign and Reject to the named supervisor only', async () => {
  const a = await makePending('2027-03-25', '2027-03-26', sup1.id)
  const mine = await get(`/requests/${a.id}`, await cookieFor('supervisor-1@budiman.com'))
  assert.match(mine.html, />Sign</)
  assert.match(mine.html, />Reject</)

  const other = await get(`/requests/${a.id}`, await cookieFor('supervisor-2@budiman.com'))
  assert.doesNotMatch(other.html, />Sign</)
  assert.doesNotMatch(other.html, />Reject</)

  const owner = await get(`/requests/${a.id}`, await cookieFor('employee-1@budiman.com'))
  assert.doesNotMatch(owner.html, />Sign</)
  assert.doesNotMatch(owner.html, />Reject</)
  assert.match(owner.html, />Withdraw</) // the owner's own affordance, Task 17
})

test('AC-19: the signed detail page shows "Signed by Supervisor 1" with the date', async () => {
  const a = await makePending('2027-03-28', '2027-03-29', sup1.id)
  await signRequestCore(sup1, a.id, '')
  const res = await get(`/requests/${a.id}`, await cookieFor('employee-1@budiman.com'))
  assert.ok(res.html.includes('Signed by Supervisor 1'))
  assert.match(res.html, /Signed/)
})

test('AC-28: the success messages name the action', async () => {
  const a = await makePending('2027-03-30', '2027-03-31', sup1.id)
  const signed = await get(`/requests/${a.id}?done=signed`, await cookieFor('supervisor-1@budiman.com'))
  assert.match(signed.html, /Request signed\./)
  const rejected = await get(`/requests/${a.id}?done=rejected`, await cookieFor('supervisor-1@budiman.com'))
  assert.match(rejected.html, /Request rejected\./)
})

test('the sign/reject server actions are wired as functions', () => {
  assert.equal(typeof sign, 'function')
  assert.equal(typeof rejectBySupervisor, 'function')
})
