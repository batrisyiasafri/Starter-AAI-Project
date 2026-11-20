// Signed session cookie per docs/specs/02-design.md §2 rule 6.
// Payload: { userId, role, expiresAt } — nothing else (no PII, no password).
// Signed with HMAC-SHA256 from SESSION_SECRET via Node's built-in crypto.
// Server code only: cookies() below is unavailable in client components.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'session'
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60 // 8 hours (requirements U8)
export const SESSION_REFRESH_AFTER_SECONDS = 60 * 60 // re-issue once an hour old

export type SessionPayload = {
  userId: number
  role: string
  expiresAt: number // epoch ms
}

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32 || secret.startsWith('replace-with')) {
    // Fail loudly — never sign with a guessable default (design §6).
    throw new Error('SESSION_SECRET is missing or unset — copy .env.example to .env and set a random 32-byte hex string')
  }
  return Buffer.from(secret, 'utf8')
}

function hmac(body: string): string {
  return createHmac('sha256', getSecret()).update(body).digest('base64url')
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${hmac(body)}`
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)

  const expected = Buffer.from(hmac(body))
  const received = Buffer.from(signature)
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as SessionPayload
    if (
      typeof payload.userId !== 'number' ||
      typeof payload.role !== 'string' ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt <= Date.now()
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
}

// True when the cookie was last issued (or renewed) more than an hour ago.
// Callers derive the last-issued moment from the payload's expiresAt.
export function shouldRefresh(expiresAt: number): boolean {
  const lastIssued = expiresAt - SESSION_MAX_AGE_SECONDS * 1000
  return Date.now() - lastIssued > SESSION_REFRESH_AFTER_SECONDS * 1000
}

// Exported for the AC-09 flag test; still only createSession writes it.
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production', // plain http in local dev
  maxAge: SESSION_MAX_AGE_SECONDS,
}

export async function createSession(userId: number, role: string): Promise<void> {
  const token = await signSession({
    userId,
    role,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  })
  ;(await cookies()).set(SESSION_COOKIE, token, cookieOptions)
}

export async function destroySession(): Promise<void> {
  ;(await cookies()).delete(SESSION_COOKIE)
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? ''
  return verifySession(token)
}

// Task 9: re-issue a fresh 8-hour cookie while the user keeps the tab active.
export async function refreshSession(payload: SessionPayload): Promise<void> {
  if (!shouldRefresh(payload.expiresAt)) return
  await createSession(payload.userId, payload.role)
}
