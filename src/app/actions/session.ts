'use server'

// Design §2 rule 6 (AC-09): an active session never expires mid-use —
// any served page re-issues the cookie with a fresh 8 hours once the
// current one is older than an hour.
//
// Why a server action and not the page render itself: Next 16 does not
// allow setting cookies during Server Component rendering (see
// node_modules/next/dist/docs — cookies.md); writes belong in server
// functions. The proxy stays read-only (design rule 8).
import { getSessionPayload, refreshSession } from '@/lib/session'

export async function keepAlive(): Promise<void> {
  const payload = await getSessionPayload()
  if (!payload) return
  await refreshSession(payload)
}
