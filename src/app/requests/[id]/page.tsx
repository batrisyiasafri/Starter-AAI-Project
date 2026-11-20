// /requests/[id] (leave design §4, LR-12): one page shows a whole request
// to exactly the owner, the named supervisor, any HR officer and Admin.
// The matrix below runs BEFORE anything renders; action buttons arrive in
// later tasks and render nothing here yet.
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, ROLE_HOME } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logout } from '@/app/login/actions'
import { keepAlive } from '@/app/actions/session'
import { SessionRefresher } from '@/components/SessionRefresher'
import { StatusChip } from '@/components/StatusChip'
import { ConfirmAction } from '@/components/ConfirmAction'
import { SuccessBanner } from '@/components/SuccessBanner'
import { LEAVE_TYPES, fmtLeaveDate, type LeaveTypeCode } from '@/lib/leave'
import {
  withdraw,
  sign,
  rejectBySupervisor,
  sendToHr,
  approve,
  rejectByHr,
} from './actions'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#dfe3df] bg-white p-5">
      <dt className="text-xs uppercase tracking-wide text-[#6b7280]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-[#1f2937]">{children}</dd>
    </div>
  )
}

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ done?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?expired=1')
  const { done } = await searchParams

  const { id } = await params
  const idNum = Number(id)
  if (!Number.isInteger(idNum) || idNum <= 0) notFound()

  const request = await prisma.leaveRequest.findUnique({
    where: { id: idNum },
    include: {
      employee: { select: { name: true } },
      supervisor: { select: { name: true } },
      hrOfficer: { select: { name: true } },
    },
  })
  if (!request) notFound()

  // LR-12 access matrix — server-side, before render (OWASP A01, AC-31).
  const mayView =
    user.role === 'ADMIN' ||
    user.role === 'HR' ||
    request.employeeId === user.id ||
    (user.role === 'SUPERVISOR' && request.supervisorId === user.id)
  if (!mayView) redirect(ROLE_HOME[user.role])

  const typeLabel = LEAVE_TYPES[request.leaveType as LeaveTypeCode] ?? request.leaveType

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
          <SuccessBanner done={done} />
          <Link
            href={ROLE_HOME[user.role]}
            className="text-sm text-[#6b7280] hover:text-[#1f2937]"
          >
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-medium text-[#1f2937]">
            Leave request #{request.id}
          </h1>
          <p className="mt-2 text-sm text-[#6b7280]">
            {request.employee.name} · to {request.supervisor.name}
          </p>

          <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Type">
              {typeLabel}
              {request.otherLeaveType ? (
                <span className="mt-1 block text-sm font-normal text-[#6b7280]">
                  {request.otherLeaveType}
                </span>
              ) : null}
            </Field>
            <Field label="Status">
              <StatusChip status={request.status} />
            </Field>
            <Field label="Dates">
              {fmtLeaveDate(request.startDate)} – {fmtLeaveDate(request.endDate)}
            </Field>
            <Field label="Submitted">{fmtLeaveDate(request.submittedAt)}</Field>
            {request.signedAt ? (
              <Field label="Signed">
                {fmtLeaveDate(request.signedAt)}
                <span className="mt-1 block text-sm font-normal text-[#6b7280]">
                  {`Signed by ${request.supervisor.name}`}
                </span>
              </Field>
            ) : null}
            {request.decidedAt ? (
              <Field label="Decided">
                {fmtLeaveDate(request.decidedAt)}
                {request.hrOfficer ? (
                  <span className="mt-1 block text-sm font-normal text-[#6b7280]">
                    {`Decided by ${request.hrOfficer.name}`}
                  </span>
                ) : null}
              </Field>
            ) : null}
            {request.withdrawnAt ? (
              <Field label="Withdrawn">{fmtLeaveDate(request.withdrawnAt)}</Field>
            ) : null}
            {request.supervisorRemark ? (
              <Field label="Supervisor remark">{request.supervisorRemark}</Field>
            ) : null}
            {request.hrRemark ? (
              <Field label="HR remark">{request.hrRemark}</Field>
            ) : null}
          </dl>

          {/* LR-5 display rule: the owner may withdraw only while pending.
              Hiding is polish — withdraw() re-checks on the server. */}
          {user.role === 'EMPLOYEE' && request.employeeId === user.id ? (
            <div className="mt-8 space-y-4">
              {request.status === 'PENDING_SUPERVISOR' ? (
                <ConfirmAction
                  action={withdraw}
                  label="Withdraw"
                  confirmLabel="Confirm withdraw"
                  hidden={{ id: request.id }}
                />
              ) : null}
              {/* LR-7: the last mile — the owner sends a signed request
                  to the shared HR queue. */}
              {request.status === 'SIGNED' ? (
                <ConfirmAction
                  action={sendToHr}
                  label="Send to HR"
                  confirmLabel="Confirm send"
                  hidden={{ id: request.id }}
                />
              ) : null}
            </div>
          ) : null}

          {/* LR-5/LR-6 display rule: only the named supervisor may sign or
              reject, only while pending. sign() and rejectBySupervisor()
              re-check everything on the server. */}
          {user.role === 'SUPERVISOR' &&
          request.supervisorId === user.id &&
          request.status === 'PENDING_SUPERVISOR' ? (
            <div className="mt-8 space-y-4">
              <ConfirmAction
                action={sign}
                label="Sign"
                confirmLabel="Confirm sign"
                hidden={{ id: request.id }}
                remarkLabel="Remark (optional)"
              />
              <ConfirmAction
                action={rejectBySupervisor}
                label="Reject"
                confirmLabel="Confirm reject"
                hidden={{ id: request.id }}
                remarkLabel="Reason for rejection"
                remarkRequired
              />
            </div>
          ) : null}

          {/* LR-9 display rule: any HR officer decides a Pending HR request;
              the first decision wins — the guarded update in the action is
              the control, and LR-13 means Admin sees no buttons at all. */}
          {user.role === 'HR' && request.status === 'PENDING_HR' ? (
            <div className="mt-8 space-y-4">
              <ConfirmAction
                action={approve}
                label="Approve"
                confirmLabel="Confirm approve"
                hidden={{ id: request.id }}
              />
              <ConfirmAction
                action={rejectByHr}
                label="Reject"
                confirmLabel="Confirm reject"
                hidden={{ id: request.id }}
                remarkLabel="Reason for rejection"
                remarkRequired
              />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
