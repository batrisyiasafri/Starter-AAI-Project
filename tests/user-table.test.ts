import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

test('User table exists and can be queried', async () => {
  const users = await prisma.user.findMany()
  assert.ok(Array.isArray(users))
})

test('User rows carry all design fields with defaults', async () => {
  const email = `t1-probe-${Date.now()}@budiman.com`
  const user = await prisma.user.create({
    data: {
      name: 'Probe',
      icNumber: '00-000001',
      email,
      passwordHash: '$2b$10$placeholdernotarealhash',
      role: 'EMPLOYEE',
      division: 'Finance',
      designation: 'Accounts Clerk',
    },
  })
  assert.ok(user.id > 0)
  assert.equal(user.failedAttempts, 0)
  assert.equal(user.lockedUntil, null)
  assert.ok(user.createdAt instanceof Date)
  await prisma.user.delete({ where: { id: user.id } })
})

test('email is unique — a duplicate is rejected', async () => {
  const email = `t1-dup-${Date.now()}@budiman.com`
  const base = {
    name: 'Dup A',
    icNumber: '00-000002',
    email,
    passwordHash: '$2b$10$placeholdernotarealhash',
    role: 'EMPLOYEE',
    division: 'Finance',
    designation: 'Accounts Clerk',
  }
  await prisma.user.create({ data: base })
  await assert.rejects(
    () => prisma.user.create({ data: { ...base, name: 'Dup B' } }),
    (err: { code?: string }) => err.code === 'P2002',
  )
  await prisma.user.deleteMany({ where: { email } })
})

test('teardown', async () => {
  await prisma.$disconnect()
})
