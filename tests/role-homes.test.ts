import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { signSession } from '../src/lib/session'

const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const prisma = new PrismaClient()

const ROLE_PATHS = ['/employee', '/supervisor', '/hr', '/admin'] as const

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

test('AC-04: signed-out visitors cannot open role pages', async () => {
  for (const path of ROLE_PATHS) {
    const res = await get(path)
    assert.ok([301, 302, 303, 307, 308].includes(res.status), `${path} → ${res.status}`)
    assert.match(res.location ?? '', /\/login/, `${path} redirects to /login`)
  }
})

test('a valid session sees its own stub home with name, role, division', async () => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'employee-1@budiman.com' },
  })
  const cookie = `session=${await signSession({ userId: user.id, role: user.role, expiresAt: Date.now() + 60_000 })}`
  const res = await get('/employee', cookie)
  assert.equal(res.status, 200)
  assert.match(res.html, /Employee 1/)
  assert.match(res.html, /Finance/)
  assert.match(res.html, /Accounts Clerk/)
  assert.match(res.html, /Log out|Logout/)
})

test('AC-03: a wrong-role page never renders — bounce to own home', async () => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'employee-1@budiman.com' },
  })
  const cookie = `session=${await signSession({ userId: user.id, role: user.role, expiresAt: Date.now() + 60_000 })}`
  const res = await get('/admin', cookie)
  assert.ok([301, 302, 303, 307, 308].includes(res.status))
  assert.match(res.location ?? '', /\/employee/)
  assert.doesNotMatch(res.html, /Admin Manager/)
})

test('a tampered cookie is treated as signed out', async () => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'employee-1@budiman.com' },
  })
  const token = await signSession({ userId: user.id, role: user.role, expiresAt: Date.now() + 60_000 })
  const dot = token.lastIndexOf('.')
  const flipped = token.slice(0, dot + 1) + (token[dot + 1] === 'a' ? 'b' : 'a') + token.slice(dot + 2)
  const res = await get('/employee', `session=${flipped}`)
  assert.match(res.location ?? '', /\/login/)
})

test('AC-12: a signed-in user is bounced off /login', async () => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'employee-1@budiman.com' },
  })
  const cookie = `session=${await signSession({ userId: user.id, role: user.role, expiresAt: Date.now() + 60_000 })}`
  const res = await get('/login', cookie)
  assert.match(res.location ?? '', /\/employee/)
})

test('a valid cookie for a deleted user does not redirect-loop (AC-04 edge)', async () => {
  // The failure this prevents: proxy trusts the signature and sends the
  // visitor to their home; the page re-checks the database, finds no user,
  // and redirects to /login — where the proxy bounces them home again.
  const cookie = `session=${await signSession({ userId: 999999, role: 'EMPLOYEE', expiresAt: Date.now() + 60_000 })}`

  // Follow the chain by hand: it must terminate at /login, not oscillate.
  let path = '/employee'
  const seen: string[] = []
  for (let hop = 0; hop < 6; hop++) {
    const res = await get(path, cookie)
    if (![301, 302, 303, 307, 308].includes(res.status)) break
    const location = res.location ?? ''
    seen.push(location)
    assert.ok(
      !(seen.includes('/login') && seen.includes('/employee')),
      `redirect loop detected: ${seen.join(' -> ')}`,
    )
    if (location.startsWith('/login?') || location === '/login') break
    path = location.split('?')[0]
  }
  // Final state: the login page must actually render for this visitor
  const final = await get('/login?expired=1', cookie)
  assert.ok([200, 307].includes(final.status))
  if (final.status === 307) {
    assert.fail('proxy must not bounce the expired-session login page to a home page')
  }
  assert.match(final.html, /Sign in/)
})

test('teardown', async () => {
  await prisma.$disconnect()
})
