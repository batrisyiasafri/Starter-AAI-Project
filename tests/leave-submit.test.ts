import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'
import {
  createLeaveRequestCore,
  createLeaveRequest,
} from '../src/app/employee/leave/new/actions'

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

let emp: { id: number; role: string }
let hr: { id: number; role: string }
let sup1Id: number

// Remove probe rows so the suite is re-runnable.
async function clearEmpRequests() {
  await prisma.leaveRequest.deleteMany({ where: { employeeId: emp.id } })
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
  await clearEmpRequests()
})

const baseInput = () => ({
  leaveType: 'ANNUAL',
  otherLeaveType: '',
  startDate: '2027-03-01',
  endDate: '2027-03-03',
  supervisorId: String(sup1Id),
})

test('AC-14: the leave form renders for a signed-in employee', async () => {
  const res = await get('/employee/leave/new', await cookieFor('employee-1@budiman.com'))
  assert.equal(res.status, 200)
  assert.match(res.html, /name="leaveType"/)
  assert.match(res.html, /name="startDate"/)
  assert.match(res.html, /name="endDate"/)
  assert.match(res.html, /name="supervisorId"/)
  assert.match(res.html, /name="otherLeaveType"/)
})

test('AC-15: the picker lists exactly the two same-division supervisors', async () => {
  const res = await get('/employee/leave/new', await cookieFor('employee-1@budiman.com'))
  const sups = await prisma.user.findMany({
    where: { role: 'SUPERVISOR', division: 'Finance' },
    orderBy: { id: 'asc' },
  })
  assert.equal(sups.length, 2, 'fixture: two Finance supervisors')
  for (const s of sups) {
    assert.ok(res.html.includes(`value="${s.id}"`), `option for ${s.name}`)
    assert.ok(res.html.includes(s.name), `name ${s.name} shown`)
  }
  assert.doesNotMatch(res.html, />HR 1</)
  assert.doesNotMatch(res.html, />Admin</)
})

test('signed-out visitors of the form go to /login; other roles bounce home', async () => {
  const out = await get('/employee/leave/new')
  assert.ok([301, 302, 303, 307, 308].includes(out.status))
  assert.match(out.location ?? '', /\/login/)

  const hrRes = await get('/employee/leave/new', await cookieFor('hr-1@budiman.com'))
  assert.ok([301, 302, 303, 307, 308].includes(hrRes.status))
  assert.match(hrRes.location ?? '', /\/hr/)
})

test('AC-16: end date before start is refused and names the dates', async () => {
  const r = await createLeaveRequestCore(emp, {
    ...baseInput(),
    startDate: '2027-03-05',
    endDate: '2027-03-04',
  })
  assert.ok('error' in r, 'expected an error')
  if ('error' in r) {
    assert.match(r.error, /end date/i)
    assert.match(r.error, /4 Mar 2027|5 Mar 2027/, 'names the dates')
  }
  assert.equal(await prisma.leaveRequest.count({ where: { employeeId: emp.id } }), 0)
})

test('AC-17: Other needs a description, and saves it when given', async () => {
  const bad = await createLeaveRequestCore(emp, {
    ...baseInput(),
    leaveType: 'OTHER',
    otherLeaveType: '',
  })
  assert.ok('error' in bad)

  const good = await createLeaveRequestCore(emp, {
    ...baseInput(),
    leaveType: 'OTHER',
    otherLeaveType: 'volunteering at the community centre',
  })
  assert.ok('ok' in good, JSON.stringify(good))
  const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: (good as { ok: true; id: number }).id } })
  assert.equal(row.otherLeaveType, 'volunteering at the community centre')
  await clearEmpRequests()
})

test('AC-17: Compassionate needs a description too (doc 7.2)', async () => {
  const bad = await createLeaveRequestCore(emp, {
    ...baseInput(),
    leaveType: 'COMPASSIONATE',
    otherLeaveType: '  ',
  })
  assert.ok('error' in bad)
  const good = await createLeaveRequestCore(emp, {
    ...baseInput(),
    leaveType: 'COMPASSIONATE',
    otherLeaveType: 'family bereavement',
  })
  assert.ok('ok' in good)
  await clearEmpRequests()
})

test('AC-18: overlapping active request blocks; withdrawal frees the dates', async () => {
  const a = await createLeaveRequestCore(emp, {
    ...baseInput(),
    startDate: '2027-12-01',
    endDate: '2027-12-05',
  })
  assert.ok('ok' in a)
  const b = await createLeaveRequestCore(emp, {
    ...baseInput(),
    startDate: '2027-12-04',
    endDate: '2027-12-08',
  })
  assert.ok('error' in b, 'overlap must be refused')
  if ('error' in b) assert.match(b.error, /1 Dec 2027.*5 Dec 2027/)

  await prisma.leaveRequest.update({
    where: { id: (a as { ok: true; id: number }).id },
    data: { status: 'WITHDRAWN' },
  })
  const b2 = await createLeaveRequestCore(emp, {
    ...baseInput(),
    startDate: '2027-12-04',
    endDate: '2027-12-08',
  })
  assert.ok('ok' in b2, 'withdrawal frees the dates')
  await clearEmpRequests()
})

test('AC-18: a rejected earlier request frees its dates; Approved still blocks', async () => {
  const a = await createLeaveRequestCore(emp, {
    ...baseInput(),
    startDate: '2028-01-10',
    endDate: '2028-01-12',
  })
  await prisma.leaveRequest.update({
    where: { id: (a as { ok: true; id: number }).id },
    data: { status: 'REJECTED_SUPERVISOR', supervisorRemark: 'no' },
  })
  const reuse = await createLeaveRequestCore(emp, {
    ...baseInput(),
    startDate: '2028-01-10',
    endDate: '2028-01-12',
  })
  assert.ok('ok' in reuse)
  await prisma.leaveRequest.update({
    where: { id: (reuse as { ok: true; id: number }).id },
    data: { status: 'APPROVED', hrOfficerId: hr.id, decidedAt: new Date() },
  })
  const blocked = await createLeaveRequestCore(emp, {
    ...baseInput(),
    startDate: '2028-01-11',
    endDate: '2028-01-13',
  })
  assert.ok('error' in blocked, 'Approved still blocks')
  await clearEmpRequests()
})

test('AC-29: past dates are accepted; only rule is end >= start', async () => {
  const past = new Date(Date.now() - 9 * 24 * 3600_000).toISOString().slice(0, 10)
  const past2 = new Date(Date.now() - 8 * 24 * 3600_000).toISOString().slice(0, 10)
  const r = await createLeaveRequestCore(emp, {
    ...baseInput(),
    startDate: past,
    endDate: past2,
  })
  assert.ok('ok' in r, JSON.stringify(r))
  await clearEmpRequests()
})

test('LR-1/LR-2: non-employees and out-of-division supervisors are refused', async () => {
  const notEmp = await createLeaveRequestCore(hr, baseInput())
  assert.ok('error' in notEmp)

  const hrAsSup = await createLeaveRequestCore(emp, {
    ...baseInput(),
    supervisorId: String(hr.id),
  })
  assert.ok('error' in hrAsSup)

  const missing = await createLeaveRequestCore(emp, {
    ...baseInput(),
    supervisorId: '999999',
  })
  assert.ok('error' in missing)

  assert.equal(typeof createLeaveRequest, 'function')
  await clearEmpRequests()
})

test('AC-14: a clean submit creates the row', async () => {
  const r = await createLeaveRequestCore(emp, baseInput())
  assert.ok('ok' in r)
  const row = await prisma.leaveRequest.findUniqueOrThrow({
    where: { id: (r as { ok: true; id: number }).id },
  })
  assert.equal(row.status, 'PENDING_SUPERVISOR')
  assert.equal(row.supervisorId, sup1Id)
  assert.equal(row.employeeId, emp.id)
  await clearEmpRequests()
})

test('teardown', async () => {
  await clearEmpRequests()
  await prisma.$disconnect()
})
