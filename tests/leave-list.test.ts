import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'

// Task 15: the /employee home becomes the employee's own list (LR-11:
// employeeId = me, newest first), with status chips, remarks, links to the
// detail page, a "New request" button and an empty state (AC-14 list side,
// AC-26 employee part).
const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const prisma = new PrismaClient()
const TEMP_EMAIL = 'temp-leave-list@budiman.com'

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

let emp1Id: number
let tempId: number

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)

async function clearEmp1() {
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp1Id } })
}

async function clearTemp() {
  if (tempId) {
    await prisma.leaveRequest.deleteMany({ where: { employeeId: tempId } })
  }
  await prisma.user.deleteMany({ where: { email: TEMP_EMAIL } })
}

before(async () => {
  await waitForServer()
  emp1Id = (
    await prisma.user.findUniqueOrThrow({
      where: { email: 'employee-1@budiman.com' },
    })
  ).id
  await clearEmp1()
  await clearTemp()
})

after(async () => {
  await clearEmp1()
  await clearTemp()
  await prisma.$disconnect()
})

test('AC-14 (list side): empty list shows the empty state and the New request button', async () => {
  const res = await get('/employee', await cookieFor('employee-1@budiman.com'))
  assert.equal(res.status, 200)
  assert.match(res.html, /New request/)
  assert.match(res.html, /No leave requests yet/i)
})

test('AC-14: rows render newest first with chips, dates, remarks, description and detail links', async () => {
  const older = await prisma.leaveRequest.create({
    data: {
      employeeId: emp1Id,
      supervisorId: (
        await prisma.user.findUniqueOrThrow({
          where: { email: 'supervisor-1@budiman.com' },
        })
      ).id,
      leaveType: 'ANNUAL',
      startDate: D('2027-06-01'),
      endDate: D('2027-06-03'),
      status: 'PENDING_SUPERVISOR',
      submittedAt: new Date(Date.now() - 3600_000),
    },
  })
  const newer = await prisma.leaveRequest.create({
    data: {
      employeeId: emp1Id,
      supervisorId: (
        await prisma.user.findUniqueOrThrow({
          where: { email: 'supervisor-1@budiman.com' },
        })
      ).id,
      leaveType: 'OTHER',
      otherLeaveType: 'volunteering at the community centre',
      startDate: D('2027-07-10'),
      endDate: D('2027-07-12'),
      status: 'APPROVED',
      supervisorRemark: 'Enjoy',
      hrRemark: 'Approved, enjoy your volunteering',
      submittedAt: new Date(),
    },
  })

  const res = await get('/employee', await cookieFor('employee-1@budiman.com'))
  assert.equal(res.status, 200)
  // doc 5.2 status words render exactly
  assert.match(res.html, /Pending supervisor/)
  assert.match(res.html, /Approved/)
  // dates in the agreed format
  assert.match(res.html, /1 Jun 2027/)
  assert.match(res.html, /3 Jun 2027/)
  assert.match(res.html, /10 Jul 2027/)
  assert.match(res.html, /12 Jul 2027/)
  // description and remarks where present
  assert.ok(res.html.includes('volunteering at the community centre'))
  assert.ok(res.html.includes('Approved, enjoy your volunteering'))
  // rows link to the detail page
  assert.match(res.html, new RegExp(`/requests/${older.id}`))
  assert.match(res.html, new RegExp(`/requests/${newer.id}`))
  // newest first
  const iNewer = res.html.indexOf(`/requests/${newer.id}`)
  const iOlder = res.html.indexOf(`/requests/${older.id}`)
  assert.ok(iNewer < iOlder, 'newest row must appear first')
})

test('AC-26 (employee part): only my own rows — another employee\'s request never shows', async () => {
  const temp = await prisma.user.create({
    data: {
      email: TEMP_EMAIL,
      name: 'Temp Other Employee',
      icNumber: '90-123456',
      passwordHash:
        '$2b$10$Kx/MLSwkJ5WbbLmmhy8iPezVZ6m.cQeEiyMf9G8pXP8bl1dHn774q',
      role: 'EMPLOYEE',
      division: 'Finance',
      designation: 'Clerk',
    },
  })
  tempId = temp.id
  await prisma.leaveRequest.create({
    data: {
      employeeId: tempId,
      supervisorId: (
        await prisma.user.findUniqueOrThrow({
          where: { email: 'supervisor-1@budiman.com' },
        })
      ).id,
      leaveType: 'ANNUAL',
      startDate: D('2027-09-01'),
      endDate: D('2027-09-02'),
      status: 'PENDING_SUPERVISOR',
    },
  })
  await prisma.leaveRequest.create({
    data: {
      employeeId: emp1Id,
      supervisorId: (
        await prisma.user.findUniqueOrThrow({
          where: { email: 'supervisor-1@budiman.com' },
        })
      ).id,
      leaveType: 'UNPAID',
      startDate: D('2027-06-01'),
      endDate: D('2027-06-03'),
      status: 'PENDING_SUPERVISOR',
    },
  })

  const mine = await get('/employee', await cookieFor('employee-1@budiman.com'))
  assert.doesNotMatch(mine.html, /Temp Other Employee/)
  assert.doesNotMatch(mine.html, /1 Sep(tember)? 2027/, "another employee's dates must not leak")

  const theirs = await get('/employee', await cookieFor(TEMP_EMAIL))
  assert.equal(theirs.status, 200)
  assert.match(theirs.html, /1 Sep(tember)? 2027/)
  assert.doesNotMatch(theirs.html, /1 Jun 2027/, "employee-1's dates must not leak")
})

test('AC-26: past decisions stay visible — Withdrawn and Rejected rows with remarks', async () => {
  await prisma.leaveRequest.create({
    data: {
      employeeId: emp1Id,
      supervisorId: (
        await prisma.user.findUniqueOrThrow({
          where: { email: 'supervisor-1@budiman.com' },
        })
      ).id,
      leaveType: 'UNPAID',
      startDate: D('2027-10-01'),
      endDate: D('2027-10-02'),
      status: 'WITHDRAWN',
      withdrawnAt: new Date(),
    },
  })
  await prisma.leaveRequest.create({
    data: {
      employeeId: emp1Id,
      supervisorId: (
        await prisma.user.findUniqueOrThrow({
          where: { email: 'supervisor-1@budiman.com' },
        })
      ).id,
      leaveType: 'MATERNITY',
      startDate: D('2027-11-01'),
      endDate: D('2027-11-30'),
      status: 'REJECTED_SUPERVISOR',
      supervisorRemark: 'Not this quarter, sorry',
    },
  })

  const res = await get('/employee', await cookieFor('employee-1@budiman.com'))
  assert.match(res.html, /Withdrawn/)
  assert.match(res.html, /Rejected by supervisor/)
  assert.ok(res.html.includes('Not this quarter, sorry'))
})
