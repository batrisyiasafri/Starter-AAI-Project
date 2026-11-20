import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { RoleHome } from '@/components/RoleHome'
import { RequestList } from '@/components/RequestList'

// The supervisor's "sign it" pile (leave design §5, LR-11): rows where
// supervisorId = me, pending on top, history below. The scoping is this
// query; a request naming another supervisor never reaches this page.
export default async function SupervisorHome() {
  const user = await requireRole('SUPERVISOR')

  const rows = await prisma.leaveRequest.findMany({
    where: { supervisorId: user.id },
    orderBy: { submittedAt: 'desc' },
    include: { employee: { select: { name: true } } },
  })

  // Pending on top of the history (design §5); both groups newest first.
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
      submittedAt: r.submittedAt,
    }))
    .sort(
      (a, b) =>
        (a.status === 'PENDING_SUPERVISOR' ? 0 : 1) -
          (b.status === 'PENDING_SUPERVISOR' ? 0 : 1) ||
        b.submittedAt.getTime() - a.submittedAt.getTime(),
    )

  return (
    <RoleHome user={user}>
      <h2 className="mt-10 text-lg font-medium text-[#1f2937]">
        Leave requests for me to review
      </h2>
      <RequestList requests={requests} emptyMessage="No leave requests yet." />
    </RoleHome>
  )
}
