import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'
import { sendToHrCore, sendToHr } from '../src/app/requests/[id]/actions'

// Task 20 (AC-21; LR-5/LR-7; FR-04): the owner sends their SIGNED request
// to the shared HR queue. Non-owners and wrong statuses are refused.
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

async function makeRow(start: string, end: string, status: string) {
  return prisma.leaveRequest.create({
    data: {
      employeeId: emp.id,
      supervisorId: sup1.id,
      leaveType: 'ANNUAL',
      startDate: D(start),
      endDate: D(end),
      status,
      signedAt: status === 'SIGNED' || status === 'PENDING_HR' ? new Date() : null,
    },
  })
}

before(async () => {
  await waitForServer()
  const [e, s, h] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'employee-1@budiman.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'supervisor-1@budiman.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'hr-1@budiman.com' } }),
  ])
  emp = { id: e.id, role: e.role }
  sup1 = { id: s.id, role: s.role }
  hr1 = { id: h.id, role: h.role }
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp.id } })
})

after(async () => {
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp.id } })
  await prisma.$disconnect()
})

test('AC-21: the owner sends a SIGNED request to HR', async () => {
  const a = await makeRow('2027-02-10', '2027-02-11', 'SIGNED')
  const r = await sendToHrCore(emp, a.id)
  assert.ok('ok' in r, JSON.stringify(r))
  const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.id } })
  assert.equal(row.status, 'PENDING_HR')
})

test('LR-5/LR-7: non-owner sends, and every status except SIGNED, are refused', async () => {
  const a = await makeRow('2027-02-15', '2027-02-16', 'SIGNED')
  assert.ok('error' in await sendToHrCore(sup1, a.id), 'supervisor cannot send')
  assert.ok('error' in await sendToHrCore(hr1, a.id), 'HR cannot send')

  const pending = await makeRow('2027-02-18', '2027-02-19', 'PENDING_SUPERVISOR')
  assert.ok('error' in await sendToHrCore(emp, pending.id), 'not yet signed')

  const approved = await makeRow('2027-02-20', '2027-02-21', 'APPROVED')
  assert.ok('error' in await sendToHrCore(emp, approved.id), 'already decided')
})

test('AC-21: the Send to HR button shows for the owner on a SIGNED request only', async () => {
  const a = await makeRow('2027-02-24', '2027-02-25', 'SIGNED')
  const owner = await get(`/requests/${a.id}`, await cookieFor('employee-1@budiman.com'))
  assert.match(owner.html, />Send to HR</)

  const sup = await get(`/requests/${a.id}`, await cookieFor('supervisor-1@budiman.com'))
  assert.doesNotMatch(sup.html, />Send to HR</)

  const pending = await makeRow('2027-02-26', '2027-02-27', 'PENDING_SUPERVISOR')
  const ownerPending = await get(`/requests/${pending.id}`, await cookieFor('employee-1@budiman.com'))
  assert.doesNotMatch(ownerPending.html, />Send to HR</)
})

test('AC-28: the success message after sending names the action', async () => {
  const a = await makeRow('2027-02-28', '2027-03-01', 'SIGNED')
  const res = await get(`/requests/${a.id}?done=sent`, await cookieFor('employee-1@budiman.com'))
  assert.match(res.html, /Sent to HR\./)
})

test('the sendToHr server action is wired as a function', () => {
  assert.equal(typeof sendToHr, 'function')
})
