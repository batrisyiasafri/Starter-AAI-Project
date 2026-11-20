import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { seed } from '../prisma/seed'

const prisma = new PrismaClient()

const DEMO_EMAILS = [
  'employee-1@budiman.com',
  'supervisor-1@budiman.com',
  'supervisor-2@budiman.com',
  'hr-1@budiman.com',
  'hr-2@budiman.com',
  'admin@budiman.com',
]

test('seeding loads exactly the 6 demo users from doc 7.2', async () => {
  // Leave rows left by other suites would block the user wipe (FK).
  await prisma.leaveRequest.deleteMany()
  await prisma.user.deleteMany()
  await seed()
  const users = await prisma.user.findMany({ orderBy: { email: 'asc' } })
  assert.deepEqual(
    users.map((u) => u.email),
    [...DEMO_EMAILS].sort(),
  )
})

test('passwords are stored as bcrypt hashes, never as password123', async () => {
  // Leave rows left by other suites would block the user wipe (FK).
  await prisma.leaveRequest.deleteMany()
  await prisma.user.deleteMany()
  await seed()
  const users = await prisma.user.findMany()
  for (const user of users) {
    assert.ok(user.passwordHash.startsWith('$2'), `${user.email} hash prefix`)
    assert.ok(!(await bcrypt.compare('anything-else', user.passwordHash)))
  }
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM User WHERE passwordHash LIKE '%password123%'`,
  )
  assert.equal(Number(rows[0].n), 0, 'no plain password stored')
})

test('the demo password is password123 (verifies against the hash)', async () => {
  // Leave rows left by other suites would block the user wipe (FK).
  await prisma.leaveRequest.deleteMany()
  await prisma.user.deleteMany()
  await seed()
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'employee-1@budiman.com' },
  })
  assert.ok(await bcrypt.compare('password123', user.passwordHash))
})

test('re-running the seed does not duplicate rows (upsert by email)', async () => {
  // Leave rows left by other suites would block the user wipe (FK).
  await prisma.leaveRequest.deleteMany()
  await prisma.user.deleteMany()
  await seed()
  await seed()
  assert.equal(await prisma.user.count(), 6)
})

test('teardown', async () => {
  await prisma.$disconnect()
})
