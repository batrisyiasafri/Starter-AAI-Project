// Design §2 rule 10 (U4, U11): there is no public home page — `/` only ever
// sends people where they belong. The proxy redirects first; this page is
// the real server-side check (design rule 8) for when it is bypassed.
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { ROLE_HOME } from '@/lib/roles'

export default async function RootRedirect() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  redirect(ROLE_HOME[user.role])
}
