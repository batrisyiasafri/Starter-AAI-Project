// Next.js 16 Proxy (the renamed middleware): optimistic redirect checks ONLY.
// The real access check is requireRole() in src/lib/auth.ts — see design §2
// rule 8 and the Next 16 proxy docs ("not a full session management or
// authorization solution"). This file must not touch the database.
import { NextResponse, type NextRequest } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/session'
import { ROLE_HOME, type Role } from '@/lib/roles'

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const payload = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value ?? '',
  )

  // Unknown role in a signed cookie = as good as signed out (and would
  // otherwise redirect /login to itself forever).
  const home = payload ? (ROLE_HOME[payload.role as Role] ?? null) : null
  if (!payload || !home) {
    if (pathname === '/login') return NextResponse.next()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (pathname === '/login') {
    // /login?expired=1 is how requireRole lands a user whose cookie passed
    // the signature check but whose account is gone — always render the
    // form for them, do not bounce to home (loop). See design §2 rules 2–3.
    if (searchParams.get('expired')) return NextResponse.next()
    return NextResponse.redirect(new URL(home, request.url))
  }

  if (pathname === '/' || pathname !== home) {
    return NextResponse.redirect(new URL(home, request.url))
  }
  return NextResponse.next()
}

export const config = {
  // Only the auth-relevant routes — never /_next/static or public assets.
  matcher: ['/', '/login', '/employee', '/supervisor', '/hr', '/admin'],
}
