import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { authenticateUser } from '../src/lib/auth'
import { login } from '../src/app/login/actions'

const prisma = new PrismaClient()

async function resetEmployees(): Promise<void> {
  await prisma.user.updateMany({
    where: {},
    data: { failedAttempts: 0, lockedUntil: null },
  })
}

before(async () => {
  await resetEmployees()
})

test('AC-08: 5 wrong passwords lock the account, 6th with the RIGHT password refused', async () => {
  await resetEmployees()
  const email = 'employee-1@budiman.com'

  for (let i = 1; i <= 5; i++) {
    const attempt = await authenticateUser(email, `wrongpass-${i}`)
    assert.deepEqual(attempt, { error: 'generic' }, `attempt ${i} is the usual generic error`)
  }

  const locked = await authenticateUser(email, 'password123')
  assert.deepEqual(locked, { error: 'locked' }, 'locked even though the password is right')

  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  assert.equal(user.failedAttempts, 5)
  assert.ok(user.lockedUntil && user.lockedUntil.getTime() > Date.now())
})

test('the lockout is per account — other users are unaffected', async () => {
  const other = await authenticateUser('supervisor-1@budiman.com', 'password123')
  assert.ok('user' in other, 'supervisor-1 still logs straight in')
})

test('the action maps locked to a "try again later" wording, not a credential hint', async () => {
  const form = new FormData()
  form.set('email', 'employee-1@budiman.com')
  form.set('password', 'password123')
  const state = await login(undefined, form)
  assert.match(state.message ?? '', /try again later/i)
  assert.doesNotMatch(state.message ?? '', /incorrect/i, 'not the credential error')
})

test('once the lock expires the right password works and clears both fields', async () => {
  await prisma.user.update({
    where: { email: 'employee-1@budiman.com' },
    data: { lockedUntil: new Date(Date.now() - 1000) }, // as if 15 min passed
  })
  const result = await authenticateUser('employee-1@budiman.com', 'password123')
  assert.ok('user' in result)
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'employee-1@budiman.com' },
  })
  assert.equal(user.failedAttempts, 0)
  assert.equal(user.lockedUntil, null)
})

test('a successful login before the lock clears the counters too', async () => {
  await resetEmployees()
  await authenticateUser('hr-1@budiman.com', 'wrongpass')
  const ok = await authenticateUser('hr-1@budiman.com', 'password123')
  assert.ok('user' in ok)
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'hr-1@budiman.com' } })
  assert.equal(user.failedAttempts, 0)
})

test('teardown', async () => {
  await resetEmployees()
  await prisma.$disconnect()
})
