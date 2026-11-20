import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { RoleHome } from '@/components/RoleHome'
import { RequestList } from '@/components/RequestList'

// The shared HR queue (leave design §5, LR-11, interview Q5): both
// officers see the identical list — status in PENDING_HR, APPROVED,
// REJECTED_HR, pending first, decided below with the deciding officer.
const QUEUE_STATUSES = ['PENDING_HR', 'APPROVED', 'REJECTED_HR']

export default async function HrHome() {
  const user = await requireRole('HR')

  const rows = await prisma.leaveRequest.findMany({
    where: { status: { in: QUEUE_STATUSES } },
    orderBy: { submittedAt: 'desc' },
    include: {
      employee: { select: { name: true } },
      hrOfficer: { select: { name: true } },
    },
  })

  const requests = rows
    .map((r) => ({
      id: r.id,
      leaveType: r.leaveType,
      otherLeaveType: r.otherLeaveType,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      supervisorRemark: r.supervisorRemark,
      hrRemark: r.hrRemark,
      employeeName: r.employee.name,
      decidedByName: r.hrOfficer?.name,
      submittedAt: r.submittedAt,
    }))
    .sort(
      (a, b) =>
        (a.status === 'PENDING_HR' ? 0 : 1) - (b.status === 'PENDING_HR' ? 0 : 1) ||
        b.submittedAt.getTime() - a.submittedAt.getTime(),
    )

  return (
    <RoleHome user={user}>
      <h2 className="mt-10 text-lg font-medium text-[#1f2937]">
        Leave requests to decide
      </h2>
      <RequestList requests={requests} emptyMessage="No leave requests yet." />
    </RoleHome>
  )
}
