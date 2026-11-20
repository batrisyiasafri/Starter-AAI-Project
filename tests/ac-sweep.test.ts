import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { authenticateUser } from '../src/lib/auth'
import { signSession } from '../src/lib/session'

// Task 11 sweep (server half): every demo account authenticates with the
// real bcrypt check (AC-10, AC-01), each role's home renders the right
// person (AC-02), and sloppy emails pass (AC-11). The real browser form
// path for all 6 was walked in the IAB browser; the cookie/session half is
// proven by session-refresh + role-homes suites.
const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const prisma = new PrismaClient()

const DEMO = [
  ['employee-1@budiman.com', '/employee', 'Employee 1', 'Finance'],
  ['supervisor-1@budiman.com', '/supervisor', 'Supervisor 1', 'Finance'],
  ['supervisor-2@budiman.com', '/supervisor', 'Supervisor 2', 'Finance'],
  ['hr-1@budiman.com', '/hr', 'HR 1', 'Human Resources'],
  ['hr-2@budiman.com', '/hr', 'HR 2', 'Human Resources'],
  ['admin@budiman.com', '/admin', 'Admin', 'Admin'],
] as const

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

before(async () => {
  await waitForServer()
  // Deterministic starting point: this sweep checks sign-in, not lockout.
  await prisma.user.updateMany({ data: { failedAttempts: 0, lockedUntil: null } })
})

test('AC-10/AC-01: all 6 demo accounts authenticate with password123 (real bcrypt)', async () => {
  for (const [email] of DEMO) {
    const result = await authenticateUser(email, 'password123')
    assert.ok(result.user, `${email} should authenticate, got an error result`)
    assert.equal(result.user!.email, email)
  }
})

test('AC-02: each demo account sees its own home with its name and division', async () => {
  for (const [email, path, name, division] of DEMO) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    const token = await signSession({
      userId: user.id,
      role: user.role,
      expiresAt: Date.now() + 60_000,
    })
    const res = await fetch(BASE + path, {
      redirect: 'manual',
      headers: { cookie: `session=${token}` },
    })
    assert.equal(res.status, 200, `${email}: own home renders`)
    const html = await res.text()
    assert.match(html, new RegExp(name), `${email}: shows ${name}`)
    assert.match(html, new RegExp(division), `${email}: shows ${division}`)
    assert.match(html, /Log out/)
  }
})

test('AC-11: spaces and capitals in the email still authenticate', async () => {
  const result = await authenticateUser(
    '  EMPLOYEE-1@BUDIMAN.COM  ',
    'password123',
  )
  assert.ok(result.user, 'sloppy email must authenticate')
  assert.equal(result.user!.email, 'employee-1@budiman.com')
})

test('teardown', async () => {
  await prisma.$disconnect()
})
