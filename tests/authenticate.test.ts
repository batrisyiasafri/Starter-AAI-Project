import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { authenticateUser } from '../src/lib/auth'
import { seed } from '../prisma/seed'

const prisma = new PrismaClient()

before(async () => {
  // Rows written by other suites may still reference these users
  // (employeeId/supervisorId/hrOfficerId) — clear them or the wipe below
  // dies on a foreign key.
  await prisma.leaveRequest.deleteMany()
  await prisma.user.deleteMany()
  await seed()
})

test('correct credentials return the user (AC-01)', async () => {
  const result = await authenticateUser('employee-1@budiman.com', 'password123')
  assert.ok('user' in result)
  assert.equal(result.user?.email, 'employee-1@budiman.com')
  assert.equal(result.user?.role, 'EMPLOYEE')
})

test('AC-11: spaces and capitals are trimmed and lowercased', async () => {
  const result = await authenticateUser('  EMPLOYEE-1@BUDIMAN.COM  ', 'password123')
  assert.ok('user' in result, 'should log in despite sloppy typing')
  assert.equal(result.user?.email, 'employee-1@budiman.com')
})

test('AC-07: non-@budiman.com emails get the format error before any lookup', async () => {
  const result = await authenticateUser('someone@gmail.com', 'password123')
  assert.deepEqual(result, { error: 'format' })
})

test('AC-06: wrong password and unknown email give the identical generic error', async () => {
  const wrongPassword = await authenticateUser('employee-1@budiman.com', 'wrongpass')
  const unknownEmail = await authenticateUser('nobody@budiman.com', 'password123')
  assert.deepEqual(wrongPassword, { error: 'generic' })
  assert.deepEqual(unknownEmail, { error: 'generic' })
})

test('empty or malformed input is rejected, not a crash', async () => {
  assert.deepEqual(await authenticateUser('', 'x'), { error: 'format' })
  assert.deepEqual(await authenticateUser('employee-1@budiman.com', ''), { error: 'generic' })
  assert.deepEqual(await authenticateUser('employee-1@budiman.comx', 'x'), { error: 'format' })
})

test('a deleted user cannot log in', async () => {
  const employee = await prisma.user.findUniqueOrThrow({
    where: { email: 'hr-2@budiman.com' },
  })
  await prisma.leaveRequest.deleteMany({
    where: {
      OR: [
        { employeeId: employee.id },
        { supervisorId: employee.id },
        { hrOfficerId: employee.id },
      ],
    },
  })
  await prisma.user.delete({ where: { id: employee.id } })
  const result = await authenticateUser('hr-2@budiman.com', 'password123')
  assert.deepEqual(result, { error: 'generic' })
  await seed() // restore demo data
})

test('teardown', async () => {
  await prisma.$disconnect()
})
