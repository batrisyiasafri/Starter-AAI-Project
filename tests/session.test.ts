import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  signSession,
  verifySession,
  sessionExpiresAt,
  shouldRefresh,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '../src/lib/session'

const payload = { userId: 7, role: 'EMPLOYEE', expiresAt: Date.now() + 60_000 }

test('a signed session verifies back to its payload (no personal data)', async () => {
  const token = await signSession(payload)
  const verified = await verifySession(token)
  assert.deepEqual(verified, payload)
  // the payload carries only id, role and expiry
  assert.deepEqual(Object.keys(payload).sort(), ['expiresAt', 'role', 'userId'])
})

test('flipping one character fails verification', async () => {
  const token = await signSession(payload)
  const i = token.indexOf('.')
  const tampered = token.slice(0, i + 1) + (token[i + 1] === 'a' ? 'b' : 'a') + token.slice(i + 2)
  assert.equal(await verifySession(tampered), null)
})

test('a payload signed with another secret fails verification', async () => {
  const original = process.env.SESSION_SECRET
  process.env.SESSION_SECRET = 'c0ffee'.repeat(16)
  const forged = await signSession(payload)
  process.env.SESSION_SECRET = original
  assert.equal(await verifySession(forged), null)
})

test('an expired session fails verification', async () => {
  const token = await signSession({ ...payload, expiresAt: Date.now() - 1000 })
  assert.equal(await verifySession(token), null)
})

test('garbage cookie values fail verification', async () => {
  assert.equal(await verifySession(''), null)
  assert.equal(await verifySession('nonsense'), null)
  assert.equal(await verifySession('a.b'), null)
})

test('a missing or placeholder SESSION_SECRET throws loudly, never signs with a default', async () => {
  const original = process.env.SESSION_SECRET
  try {
    for (const bad of [undefined, '', 'short', 'replace-with-a-random-32-byte-hex-string']) {
      if (bad === undefined) delete process.env.SESSION_SECRET
      else process.env.SESSION_SECRET = bad
      await assert.rejects(
        () => signSession(payload),
        /SESSION_SECRET/,
        `should refuse to sign with secret ${JSON.stringify(bad)}`,
      )
    }
  } finally {
    process.env.SESSION_SECRET = original
  }
})

test('session constants match the requirements', async () => {
  assert.equal(SESSION_COOKIE, 'session')
  assert.equal(SESSION_MAX_AGE_SECONDS, 8 * 60 * 60) // 8 hours (U8)
  assert.ok(sessionExpiresAt() instanceof Date)
  assert.ok(sessionExpiresAt().getTime() > Date.now())
})

test('sessions issued over 1 hour ago are due for refresh, fresh ones are not', async () => {
  const HOUR = 60 * 60 * 1000
  // shouldRefresh takes the cookie's expiresAt; issuedAt = expiresAt - 8h
  const issued2hAgo = Date.now() + 8 * HOUR - 2 * HOUR
  const issued30minAgo = Date.now() + 8 * HOUR - 30 * 60 * 1000
  assert.equal(shouldRefresh(issued2hAgo), true)
  assert.equal(shouldRefresh(issued30minAgo), false)
})
