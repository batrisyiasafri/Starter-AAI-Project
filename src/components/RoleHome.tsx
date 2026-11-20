// The shared stub home for all four roles (docs/specs/02-design.md §4 +
// Visual design): same shell as /login — soft grey background, centred
// rounded card, wordmark header, outline "Log out" pill.
import type { ReactNode } from 'react'
import type { CurrentUser } from '@/lib/auth'
import { logout } from '@/app/login/actions'
import { keepAlive } from '@/app/actions/session'
import { SessionRefresher } from './SessionRefresher'

const ROLE_LABEL: Record<string, string> = {
  EMPLOYEE: 'Employee',
  SUPERVISOR: 'Supervisor',
  HR: 'HR',
  ADMIN: 'Admin',
}

export function RoleHome({
  user,
  banner,
  children,
}: {
  user: CurrentUser
  banner?: ReactNode
  children?: ReactNode
}) {
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

      <div className="relative w-full max-w-3xl rounded-3xl border border-[#dfe3df] bg-[#fafbfa] p-8 shadow-[0_24px_60px_-24px_rgba(31,41,55,0.25)] sm:p-10">
        <SessionRefresher keepAlive={keepAlive} />
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-6 rounded-full bg-[#23a55a]" />
            <span className="text-lg font-semibold text-[#1f2937]">
              Budiman HRMS
            </span>
          </div>
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
          {banner}
          <h1 className="text-2xl font-medium text-[#1f2937]">{user.name}</h1>
          <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#dfe3df] bg-white p-5">
              <dt className="text-xs uppercase tracking-wide text-[#6b7280]">
                Role
              </dt>
              <dd className="mt-1 text-sm font-medium text-[#1f2937]">
                {ROLE_LABEL[user.role] ?? user.role}
              </dd>
            </div>
            <div className="rounded-2xl border border-[#dfe3df] bg-white p-5">
              <dt className="text-xs uppercase tracking-wide text-[#6b7280]">
                Division
              </dt>
              <dd className="mt-1 text-sm font-medium text-[#1f2937]">
                {user.division}
              </dd>
            </div>
            <div className="rounded-2xl border border-[#dfe3df] bg-white p-5">
              <dt className="text-xs uppercase tracking-wide text-[#6b7280]">
                Designation
              </dt>
              <dd className="mt-1 text-sm font-medium text-[#1f2937]">
                {user.designation}
              </dd>
            </div>
          </dl>
          {children ?? (
            <p className="mt-8 rounded-2xl border border-dashed border-[#dfe3df] bg-white p-5 text-sm text-[#6b7280]">
              Leave requests come in the next task.
            </p>
          )}
        </section>
      </div>
    </main>
  )
}
