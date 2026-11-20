import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'
import {
  withdrawRequestCore,
  signRequestCore,
  sendToHrCore,
  approveRequestCore,
  rejectByHrCore,
} from '../src/app/requests/[id]/actions'

// Task 23 (AC-30; LR-11, LR-13; FR-08, doc 5.3 rule 6): the admin table
// lists every record — including the ones that never reached HR — and the
// admin touches none: no buttons render, and a POSTed action is refused.
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
let sup2: { id: number; role: string }
let hr1: { id: number; role: string }
let admin: { id: number; role: string }

async function makeRow(args: {
  status: string
  startDate: string
  endDate: string
  supervisorId?: number
  supervisorRemark?: string
  hrOfficerId?: number
  hrRemark?: string
  signedAt?: boolean
  decidedAt?: boolean
  withdrawnAt?: boolean
}) {
  return prisma.leaveRequest.create({
    data: {
      employeeId: emp.id,
      supervisorId: args.supervisorId ?? sup1.id,
      leaveType: 'ANNUAL',
      startDate: D(args.startDate),
      endDate: D(args.endDate),
      status: args.status,
      supervisorRemark: args.supervisorRemark ?? null,
      hrOfficerId: args.hrOfficerId ?? null,
      hrRemark: args.hrRemark ?? null,
      signedAt: args.signedAt ? new Date() : null,
      decidedAt: args.decidedAt ? new Date() : null,
      withdrawnAt: args.withdrawnAt ? new Date() : null,
    },
  })
}

// One row per status, each with its own unique start date.
const SEED = [
  { status: 'PENDING_SUPERVISOR', startDate: '2027-05-01', endDate: '2027-05-02' },
  { status: 'SIGNED', startDate: '2027-05-04', endDate: '2027-05-05', supervisorId: undefined, signedAt: true },
  { status: 'PENDING_HR', startDate: '2027-05-07', endDate: '2027-05-08', signedAt: true },
  { status: 'APPROVED', startDate: '2027-05-10', endDate: '2027-05-11', signedAt: true, hrOfficerId: true, decidedAt: true },
  { status: 'REJECTED_SUPERVISOR', startDate: '2027-05-13', endDate: '2027-05-14', supervisorRemark: 'quarter close' },
  { status: 'REJECTED_HR', startDate: '2027-05-16', endDate: '2027-05-17', signedAt: true, hrOfficerId: true, hrRemark: 'business needs us', decidedAt: true },
  { status: 'WITHDRAWN', startDate: '2027-05-19', endDate: '2027-05-20', withdrawnAt: true },
] as const

let seeded: { id: number; status: string }[]

async function seed() {
  seeded = []
  for (const s of SEED) {
    const row = await makeRow({
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
      supervisorId: 'supervisorId' in s ? (s as { supervisorId?: number }).supervisorId ?? sup2.id : sup1.id,
      supervisorRemark: 'supervisorRemark' in s ? (s as { supervisorRemark?: string }).supervisorRemark : undefined,
      hrOfficerId: 'hrOfficerId' in s && (s as { hrOfficerId?: boolean }).hrOfficerId ? hr1.id : undefined,
      hrRemark: 'hrRemark' in s ? (s as { hrRemark?: string }).hrRemark : undefined,
      signedAt: 'signedAt' in s,
      decidedAt: 'decidedAt' in s,
      withdrawnAt: 'withdrawnAt' in s,
    })
    seeded.push({ id: row.id, status: s.status })
  }
}

before(async () => {
  await waitForServer()
  const [e, s1, s2, h1, a] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'employee-1@budiman.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'supervisor-1@budiman.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'supervisor-2@budiman.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'hr-1@budiman.com' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'admin@budiman.com' } }),
  ])
  emp = { id: e.id, role: e.role }
  sup1 = { id: s1.id, role: s1.role }
  sup2 = { id: s2.id, role: s2.role }
  hr1 = { id: h1.id, role: h1.role }
  admin = { id: a.id, role: a.role }
  await prisma.leaveRequest.deleteMany({})
  await seed()
})

after(async () => {
  await prisma.leaveRequest.deleteMany({})
  await prisma.$disconnect()
})

test('AC-30: the admin sees every record, including those that never reached HR', async () => {
  const res = await get('/admin', await cookieFor('admin@budiman.com'))
  assert.equal(res.status, 200)
  const labels = [
    'Pending supervisor',
    'Signed',
    'Pending HR',
    'Approved',
    'Rejected by supervisor',
    'Rejected by HR',
    'Withdrawn',
  ]
  for (const label of labels) {
    assert.ok(res.html.includes(label), `status ${label} visible`)
  }
  // the seven unique start dates prove all seven rows are listed
  for (const day of [1, 4, 7, 10, 13, 16, 19]) {
    assert.ok(res.html.includes(`${day} May 2027`), `row starting ${day} May 2027 listed`)
  }
})

test('AC-30: rows name the employee, the supervisor and the deciding officer', async () => {
  const res = await get('/admin', await cookieFor('admin@budiman.com'))
  assert.ok(res.html.includes('Employee 1'), 'employee named')
  assert.ok(res.html.includes('Supervisor: Supervisor 1'), 'supervisor named')
  assert.ok(res.html.includes('Supervisor: Supervisor 2'), 'the SIGNED row names its supervisor')
  assert.ok(res.html.includes('Decided by HR 1'), 'deciding officer named')
  assert.ok(res.html.includes('quarter close'), 'supervisor remark shown')
  assert.ok(res.html.includes('business needs us'), 'hr remark shown')
})

test('LR-13: no action buttons or transition forms anywhere on /admin', async () => {
  const res = await get('/admin', await cookieFor('admin@budiman.com'))
  // The only form on any role home is the sign-out form (Task 8). A
  // transition form would carry the request's hidden id / a remark field.
  assert.doesNotMatch(res.html, /name="id"/, 'no transition form')
  assert.doesNotMatch(res.html, /name="remark"/, 'no remark field')
  assert.doesNotMatch(res.html, />(Withdraw|Sign|Reject|Approve|Send to HR|Confirm)</)
})

test('AC-30/security: only Admin opens /admin; others bounce to their own home', async () => {
  for (const [email, home] of [
    ['employee-1@budiman.com', /\/employee/],
    ['supervisor-1@budiman.com', /\/supervisor/],
    ['hr-1@budiman.com', /\/hr/],
  ] as const) {
    const res = await get('/admin', await cookieFor(email))
    assert.ok([301, 302, 303, 307, 308].includes(res.status), `${email} redirected`)
    assert.match(res.location ?? '', home, `${email} lands on own home`)
  }
  const out = await get('/admin')
  assert.match(out.location ?? '', /\/login/)
})

test('LR-13: a transition action POSTed while signed in as Admin is refused', async () => {
  const byStatus = (s: string) => seeded.find((r) => r.status === s)!.id
  assert.ok('error' in await withdrawRequestCore(admin, byStatus('PENDING_SUPERVISOR')))
  assert.ok('error' in await signRequestCore(admin, byStatus('PENDING_SUPERVISOR'), 'ok'))
  assert.ok('error' in await sendToHrCore(admin, byStatus('SIGNED')))
  assert.ok('error' in await approveRequestCore(admin, byStatus('PENDING_HR')))
  assert.ok('error' in await rejectByHrCore(admin, byStatus('PENDING_HR'), 'no'))

  for (const [status, expect] of [
    ['PENDING_SUPERVISOR', 'PENDING_SUPERVISOR'],
    ['SIGNED', 'SIGNED'],
    ['PENDING_HR', 'PENDING_HR'],
  ] as const) {
    const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: byStatus(status) } })
    assert.equal(row.status, expect, 'status unchanged')
    assert.equal(row.hrOfficerId, null, 'no officer recorded')
  }
})

test('an empty register shows the empty message', async () => {
  await prisma.leaveRequest.deleteMany({})
  const res = await get('/admin', await cookieFor('admin@budiman.com'))
  assert.match(res.html, /No leave records yet\./)
  await seed() // leave rows for any later assertion runs
})
