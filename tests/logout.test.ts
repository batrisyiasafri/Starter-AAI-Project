import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'
import { logout } from '../src/app/login/actions'

const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const prisma = new PrismaClient()

// The accounts matching each home page path (design §4).
const HOMES = [
  ['/employee', 'employee-1@budiman.com'],
  ['/supervisor', 'supervisor-1@budiman.com'],
  ['/hr', 'hr-1@budiman.com'],
  ['/admin', 'admin@budiman.com'],
] as const

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
  const token = await signSession({
    userId: user.id,
    role: user.role,
    expiresAt: Date.now() + 60_000,
  })
  return `session=${token}`
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

test('AC-05: logout is an exported server action, not a dead button', () => {
  assert.equal(typeof logout, 'function')
})

test('AC-05: the Log out control is a server-action form submit on every home', async () => {
  for (const [path, email] of HOMES) {
    const res = await get(path, await cookieFor(email))
    assert.equal(res.status, 200, `${path} should render for its own role`)
    // A plain <button type="button"> does nothing; the button must live
    // inside a <form> so clicking it posts the logout server action.
    assert.match(
      res.html,
      /<form[^>]*>[\s\S]*?Log out[\s\S]*?<\/form>/,
      `${path} must render Log out inside a form`,
    )
  }
})

test('teardown', async () => {
  await prisma.$disconnect()
})
