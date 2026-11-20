// The shared list of requests (leave design §5): each home page passes its
// role-scoped rows (LR-11 — the query scopes, not the browser), and every
// row links to /requests/[id]. Rows show type, dates, status chip, and
// remarks where present.
import Link from 'next/link'
import { StatusChip } from './StatusChip'
import { LEAVE_TYPES, fmtLeaveDate, type LeaveTypeCode } from '@/lib/leave'

export type RequestListRow = {
  id: number
  leaveType: string
  otherLeaveType?: string | null
  startDate: Date
  endDate: Date
  status: string
  supervisorRemark?: string | null
  hrRemark?: string | null
  // Shown when a role views someone else's requests (supervisor/HR/admin).
  employeeName?: string
  // Admin table only (FR-08): the named supervisor is listed too.
  supervisorName?: string
  // Shown under the chip on decided HR rows (LR-11: "with the officer's
  // name").
  decidedByName?: string
}

export function RequestList({
  requests,
  emptyMessage = 'No leave requests yet.',
}: {
  requests: RequestListRow[]
  emptyMessage?: string
}) {
  if (requests.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-[#dfe3df] bg-white p-5 text-sm text-[#6b7280]">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-[#dfe3df] bg-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[#dfe3df] text-xs uppercase tracking-wide text-[#6b7280]">
            <th className="px-5 py-3 font-medium">Type</th>
            <th className="px-5 py-3 font-medium">Dates</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const typeLabel =
              LEAVE_TYPES[r.leaveType as LeaveTypeCode] ?? r.leaveType
            const remarks = [r.supervisorRemark, r.hrRemark]
              .filter((x): x is string => Boolean(x))
              .join(' / ')
            return (
              <tr key={r.id} className="border-b border-[#dfe3df] last:border-b-0">
                <td className="px-5 py-3">
                  <Link
                    href={`/requests/${r.id}`}
                    className="font-medium text-[#1f2937] hover:text-[#1c8b4b] hover:underline"
                  >
                    {typeLabel}
                    {r.employeeName ? (
                      <span className="block text-xs font-normal text-[#6b7280]">
                        {r.employeeName}
                      </span>
                    ) : null}
                    {r.supervisorName ? (
                      <span className="block text-xs font-normal text-[#6b7280]">
                        {`Supervisor: ${r.supervisorName}`}
                      </span>
                    ) : null}
                    {r.otherLeaveType ? (
                      <span className="block text-xs font-normal text-[#6b7280]">
                        {r.otherLeaveType}
                      </span>
                    ) : null}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[#1f2937]">
                  {fmtLeaveDate(r.startDate)} – {fmtLeaveDate(r.endDate)}
                </td>
                <td className="px-5 py-3">
                  <StatusChip status={r.status} />
                  {r.decidedByName ? (
                    <span className="mt-1 block text-xs font-normal text-[#6b7280]">
                      {`Decided by ${r.decidedByName}`}
                    </span>
                  ) : null}
                </td>
                <td className="px-5 py-3 text-[#6b7280]">{remarks || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
