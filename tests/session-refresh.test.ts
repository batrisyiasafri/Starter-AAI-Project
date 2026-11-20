import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import {
  signSession,
  verifySession,
  cookieOptions,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '../src/lib/session'

const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const HOUR = 60 * 60 * 1000
const prisma = new PrismaClient()

async function get(path: string, cookie?: string) {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    headers: cookie ? { cookie } : undefined,
  })
  return {
    status: res.status,
    location: res.headers.get('location'),
    setCookie: res.headers.get('set-cookie'),
    html: await res.text(),
  }
}

async function cookieFor(email: string, ageMs: number): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  // ageMs = how long ago the cookie was issued; the token's expiresAt is
  // derived the same way createSession derives it (issued + 8h).
  const token = await signSession({
    userId: user.id,
    role: user.role,
    expiresAt: Date.now() - ageMs + SESSION_MAX_AGE_SECONDS * 1000,
  })
  return `${SESSION_COOKIE}=${token}`
}

// Call the keepAlive server action the way the client component does: the
// action id is serialized in the page's flight payload (keepAlive arrives
// at SessionRefresher as a prop), and the POST body is the JSON arguments
// array. This proves the real wiring end to end over HTTP.
async function callKeepAlive(cookie: string) {
  const page = await fetch(BASE + '/employee', {
    redirect: 'manual',
    headers: { cookie },
  })
  const html = await page.text()
  const actionMatch = html.match(
    /\\"id\\":\\"([0-9a-f]+)\\",\\"bound\\":null,\\"name\\":\\"keepAlive\\"/,
  )
  if (!actionMatch) throw new Error('keepAlive action id not found in page payload')

  return fetch(BASE + '/employee', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie,
      'next-action': actionMatch[1],
      origin: BASE,
      'content-type': 'text/plain;charset=UTF-8',
    },
    body: '[]',
  })
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

test('AC-09 part 1: the session cookie carries httpOnly, SameSite=Lax, path=/ and 8h maxAge', () => {
  assert.equal(cookieOptions.httpOnly, true)
  assert.equal(cookieOptions.sameSite, 'lax')
  assert.equal(cookieOptions.path, '/')
  assert.equal(cookieOptions.maxAge, SESSION_MAX_AGE_SECONDS)
  assert.equal(SESSION_MAX_AGE_SECONDS, 8 * 60 * 60)
  // plain http in local dev; HTTPS-only in production
  assert.equal(cookieOptions.secure, process.env.NODE_ENV === 'production')
})

test('AC-09 part 3: a signed cookie whose expiry has passed is rejected — redirect to /login', async () => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'employee-1@budiman.com' },
  })
  const token = await signSession({
    userId: user.id,
    role: user.role,
    expiresAt: Date.now() - 1000,
  })
  const res = await get('/employee', `${SESSION_COOKIE}=${token}`)
  assert.ok([301, 302, 303, 307, 308].includes(res.status))
  assert.match(res.location ?? '', /\/login/)
})

test('AC-09 part 2: an active-but-old cookie is re-issued with a fresh 8-hour expiry', async () => {
  // Issued 2 hours ago → shouldRefresh must fire.
  const res = await callKeepAlive(await cookieFor('employee-1@budiman.com', 2 * HOUR))
  assert.equal(res.status, 200, 'keepAlive should succeed')
  const setCookie = res.headers.get('set-cookie')
  assert.ok(setCookie, 'a stale-active cookie must be re-issued')
  const newToken = setCookie!.match(/session=([^;]+)/)?.[1]
  assert.ok(newToken, 're-issued Set-Cookie must carry a session token')
  const payload = await verifySession(newToken!)
  assert.ok(payload, 're-issued token must verify')
  const fresh = payload!.expiresAt - Date.now()
  assert.ok(
    fresh > (SESSION_MAX_AGE_SECONDS - 60) * 1000,
    `re-issued cookie must expire ~8h out, got ${Math.round(fresh / 1000)}s`,
  )
})

test('AC-09: a freshly issued cookie is NOT needlessly re-issued', async () => {
  const res = await callKeepAlive(await cookieFor('employee-1@budiman.com', 60_000))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('set-cookie'), null, 'fresh cookie must pass through untouched')
})

test('teardown', async () => {
  await prisma.$disconnect()
})
