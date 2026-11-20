'use client'

// Mounts on every role home and pings the keepAlive server action once,
// so browsing re-issues the session cookie (design §2 rule 6, AC-09).
// The action arrives as a prop from the server component — the client
// never chooses what to call.
import { useEffect } from 'react'

export function SessionRefresher({
  keepAlive,
}: {
  keepAlive: () => Promise<void>
}) {
  useEffect(() => {
    // Keep-alive errors must never break the page the user is reading.
    keepAlive().catch(() => {})
  }, [keepAlive])
  return null
}
