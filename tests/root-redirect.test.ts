import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'

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

before(async () => {
  await waitForServer()
})

test('U11: signed-out visitors landing on / go to /login', async () => {
  const res = await get('/')
  assert.ok([301, 302, 303, 307, 308].includes(res.status))
  assert.match(res.location ?? '', /\/login/)
})

test('U11/AC-02: hr-1 opening / lands on /hr, never the starter page', async () => {
  const res = await get('/', await cookieFor('hr-1@budiman.com'))
  assert.ok([301, 302, 303, 307, 308].includes(res.status))
  assert.match(res.location ?? '', /\/hr/)
  assert.doesNotMatch(res.html, /Nothing is built yet/)
})

test('U11/AC-02: employee-1 opening / lands on /employee', async () => {
  const res = await get('/', await cookieFor('employee-1@budiman.com'))
  assert.ok([301, 302, 303, 307, 308].includes(res.status))
  assert.match(res.location ?? '', /\/employee/)
})

test('teardown', async () => {
  await prisma.$disconnect()
})
