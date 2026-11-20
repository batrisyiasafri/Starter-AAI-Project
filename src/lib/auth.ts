// The real access check: pages and actions call these, never the proxy.
// Design §2 rules 2, 3, 8 — the proxy redirect is convenience only.
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { prisma } from './db'
import { getSessionPayload } from './session'
import { ROLE_HOME, type Role } from './roles'

export { ROLE_HOME, type Role }

// Constant dummy hash: when the email is unknown we still run one bcrypt
// compare, so response time never reveals whether the account exists
// (requirements U6 "no user enumeration"). Cost must match the seed (10).
const DUMMY_HASH = '$2b$10$Kx/MLSwkJ5WbbLmmhy8iPezVZ6m.cQeEiyMf9G8pXP8bl1dHn774q'

const BUDIMAN_EMAIL = /^[^\s@]+@budiman\.com$/i

export type AuthFailure = { error: 'format' | 'generic' | 'locked' }
export type AuthResult = { user: CurrentUser } | AuthFailure

const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15

// Design §2 rule 4. Returns a result, never a message — the caller maps the
// failure kinds to their fixed wordings. 'format' fires before any
// database lookup, so it can name the domain without leaking accounts.
export async function authenticateUser(
  rawEmail: string,
  rawPassword: string,
): Promise<AuthResult> {
  const email = (rawEmail ?? '').trim().toLowerCase()

  if (!BUDIMAN_EMAIL.test(email)) {
    return { error: 'format' }
  }

  const user = await prisma.user.findUnique({ where: { email } })

  // Design §2 rule 5: while locked, refuse even the RIGHT password — a
  // working guess during a lockout would tip off the attacker.
  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { error: 'locked' }
  }

  const passwordMatches = await bcrypt.compare(
    rawPassword ?? '',
    user?.passwordHash ?? DUMMY_HASH,
  )

  if (!user || !passwordMatches) {
    if (user) {
      const failedAttempts = user.failedAttempts + 1
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts,
          lockedUntil:
            failedAttempts >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
              : user.lockedUntil,
        },
      })
    }
    return { error: 'generic' }
  }

  if (user.failedAttempts !== 0 || user.lockedUntil !== null) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    })
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as Role,
      division: user.division,
      designation: user.designation,
    },
  }
}

export type CurrentUser = {
  id: number
  name: string
  email: string
  role: Role
  division: string
  designation: string
}

// Null when the cookie is absent, tampered with, expired, or the user was
// deleted. Never trusts the browser's copy of the role — re-reads it.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const payload = await getSessionPayload()
  if (!payload) return null
  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    division: user.division,
    designation: user.designation,
  }
}

// Signed out → /login. Right route for the wrong role → that person's own
// home page (design §2 rule 3), so no other role's data ever renders.
// ?expired=1 breaks the proxy loop: a cookie can carry a valid signature but
// a user id that no longer exists (deleted account or re-seed) — the proxy
// trusts the signature, this page checks the database. Without the marker
// the proxy would bounce /login back to the home page forever.
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?expired=1')
  if (user.role !== role) redirect(ROLE_HOME[user.role])
  return user
}
