// /employee/leave/new (Leave Request design §4, U12/AC-14): the submit form
// for employees only. requireRole is the real gate (the proxy is
// convenience); the picker lists only SUPERVISORs from the employee's own
// division (LR-2) — the names never leave the server as data the form
// chooses freely.
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logout } from '@/app/login/actions'
import { keepAlive } from '@/app/actions/session'
import { SessionRefresher } from '@/components/SessionRefresher'
import { SuccessBanner } from '@/components/SuccessBanner'
import { LeaveForm } from './LeaveForm'
import Link from 'next/link'

export default async function NewLeaveRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>
}) {
  const user = await requireRole('EMPLOYEE')
  const { done } = await searchParams

  const supervisors = await prisma.user.findMany({
    where: { role: 'SUPERVISOR', division: user.division },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef0ee] px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[18%] top-[14%] h-16 w-16 rounded-full bg-white/60" />
        <div className="absolute right-[32%] top-[9%] h-20 w-20 rounded-full bg-white/50" />
        <div className="absolute right-[24%] top-[15%] h-28 w-28 rounded-full bg-white/60" />
        <div className="absolute -left-28 -top-28 h-80 w-80 rounded-[45%] bg-white/40" />
        <div className="absolute -bottom-40 -left-24 h-96 w-[70%] rounded-[45%] bg-white/50" />
        <div className="absolute -right-32 -bottom-44 h-96 w-[60%] rounded-[45%] bg-white/40" />
      </div>

      <div className="relative w-full max-w-2xl rounded-3xl border border-[#dfe3df] bg-[#fafbfa] p-8 shadow-[0_24px_60px_-24px_rgba(31,41,55,0.25)] sm:p-10">
        <SessionRefresher keepAlive={keepAlive} />
        <header className="flex items-center justify-between">
          <Link href="/employee" className="flex items-center gap-2.5">
            <span className="h-6 w-6 rounded-full bg-[#23a55a]" />
            <span className="text-lg font-semibold text-[#1f2937]">
              Budiman HRMS
            </span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-full border border-[#dfe3df] bg-white px-5 py-2 text-sm font-medium text-[#1f2937] transition-colors hover:bg-[#f0f2f0]"
            >
              Log out
            </button>
          </form>
        </header>

        <section className="mt-10">
          <SuccessBanner done={done} />
          <Link
            href="/employee"
            className="text-sm text-[#6b7280] hover:text-[#1f2937]"
          >
            ← Back to my requests
          </Link>
          <h1 className="mt-2 text-2xl font-medium text-[#1f2937]">
            New leave request
          </h1>
          <p className="mt-2 text-sm text-[#6b7280]">
            Fill in the dates and pick your supervisor. You get a chance to
            confirm before it is sent.
          </p>
          <LeaveForm supervisors={supervisors} />
        </section>
      </div>
    </main>
  )
}
