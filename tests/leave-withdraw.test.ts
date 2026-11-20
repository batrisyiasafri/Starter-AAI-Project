import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'
import {
  withdrawRequestCore,
  withdraw,
} from '../src/app/requests/[id]/actions'

// Task 17 (AC-25, AC-18, AC-28, U21/U22; LR-4/8/14): the owner withdraws a
// PENDING_SUPERVISOR request behind the confirm step; Withdrawn frees the
// dates; a SIGNED request cannot be withdrawn; non-owners cannot either.
const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const prisma = new PrismaClient()
const TEMP_EMAIL = 'temp-leave-withdraw@budiman.com'

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
let hr: { id: number; role: string }
let sup1Id: number
let tempId = 0

async function clearAll() {
  const users = await prisma.user.findMany({
    where: { email: { in: ['employee-1@budiman.com', TEMP_EMAIL] } },
  })
  await prisma.leaveRequest.deleteMany({
    where: { employeeId: { in: users.map((u) => u.id) } },
  })
  await prisma.user.deleteMany({ where: { email: TEMP_EMAIL } })
}

before(async () => {
  await waitForServer()
  const e = await prisma.user.findUniqueOrThrow({
    where: { email: 'employee-1@budiman.com' },
  })
  emp = { id: e.id, role: e.role }
  const h = await prisma.user.findUniqueOrThrow({
    where: { email: 'hr-1@budiman.com' },
  })
  hr = { id: h.id, role: h.role }
  sup1Id = (
    await prisma.user.findUniqueOrThrow({
      where: { email: 'supervisor-1@budiman.com' },
    })
  ).id
  await clearAll()
  const temp = await prisma.user.create({
    data: {
      email: TEMP_EMAIL,
      name: 'Temp Withdraw Stranger',
      icNumber: '90-123458',
      passwordHash:
        '$2b$10$Kx/MLSwkJ5WbbLmmhy8iPezVZ6m.cQeEiyMf9G8pXP8bl1dHn774q',
      role: 'EMPLOYEE',
      division: 'Finance',
      designation: 'Clerk',
    },
  })
  tempId = temp.id
})

after(async () => {
  await clearAll()
  await prisma.$disconnect()
})

async function makePending(start: string, end: string) {
  return prisma.leaveRequest.create({
    data: {
      employeeId: emp.id,
      supervisorId: sup1Id,
      leaveType: 'ANNUAL',
      startDate: D(start),
      endDate: D(end),
      status: 'PENDING_SUPERVISOR',
    },
  })
}

test('AC-25: the owner withdraws their own pending request — Withdrawn + withdrawnAt', async () => {
  const r = await makePending('2027-05-01', '2027-05-02')
  const result = await withdrawRequestCore(emp, r.id)
  assert.ok('ok' in result, JSON.stringify(result))
  const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: r.id } })
  assert.equal(row.status, 'WITHDRAWN')
  assert.ok(row.withdrawnAt instanceof Date, 'withdrawnAt stamped')
})

test('AC-18: a withdrawn request releases its dates for a new request', async () => {
  const a = await makePending('2027-12-01', '2027-12-05')
  const { createLeaveRequestCore } = await import(
    '../src/app/employee/leave/new/actions'
  )
  const blocked = await createLeaveRequestCore(emp, {
    leaveType: 'ANNUAL',
    otherLeaveType: '',
    startDate: '2027-12-03',
    endDate: '2027-12-04',
    supervisorId: String(sup1Id),
  })
  assert.ok('error' in blocked, 'overlap blocks before withdrawal')
  await withdrawRequestCore(emp, a.id)
  const free = await createLeaveRequestCore(emp, {
    leaveType: 'ANNUAL',
    otherLeaveType: '',
    startDate: '2027-12-03',
    endDate: '2027-12-04',
    supervisorId: String(sup1Id),
  })
  assert.ok('ok' in free, 'withdrawal frees the dates')
})

test('LR-1/LR-5: a non-owner employee and an HR officer cannot withdraw', async () => {
  const r = await makePending('2027-04-01', '2027-04-02')
  const byStranger = await withdrawRequestCore(
    { id: tempId, role: 'EMPLOYEE' },
    r.id,
  )
  assert.ok('error' in byStranger)
  const byHr = await withdrawRequestCore(hr, r.id)
  assert.ok('error' in byHr)
  const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: r.id } })
  assert.equal(row.status, 'PENDING_SUPERVISOR', 'unchanged')
})

test('AC-25/LR-5: a SIGNED request cannot be withdrawn', async () => {
  const r = await makePending('2027-04-10', '2027-04-11')
  await prisma.leaveRequest.update({
    where: { id: r.id },
    data: { status: 'SIGNED', signedAt: new Date() },
  })
  const result = await withdrawRequestCore(emp, r.id)
  assert.ok('error' in result)
  const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: r.id } })
  assert.equal(row.status, 'SIGNED', 'unchanged')
})

test('AC-25: Withdraw shows on a pending detail page and not on a signed one', async () => {
  const pending = await makePending('2027-04-20', '2027-04-21')
  const signed = await makePending('2027-04-25', '2027-04-26')
  await prisma.leaveRequest.update({
    where: { id: signed.id },
    data: { status: 'SIGNED', signedAt: new Date() },
  })
  const cookie = await cookieFor('employee-1@budiman.com')

  const p = await get(`/requests/${pending.id}`, cookie)
  assert.equal(p.status, 200)
  assert.match(p.html, />Withdraw</)

  const s = await get(`/requests/${signed.id}`, cookie)
  assert.equal(s.status, 200)
  assert.doesNotMatch(s.html, />Withdraw</)
})

test('AC-28: the success message after withdrawing names the action', async () => {
  const res = await get('/employee?done=withdrawn', await cookieFor('employee-1@budiman.com'))
  assert.match(res.html, /Request withdrawn\./)
})

test('the withdraw server action is wired as a function', async () => {
  assert.equal(typeof withdraw, 'function')
})
