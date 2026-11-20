import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { RoleHome } from '@/components/RoleHome'
import { RequestList } from '@/components/RequestList'

// FR-08 + doc 5.3 rule 6 (LR-11, LR-13): the admin sees the whole
// register — every record, including the PENDING_SUPERVISOR and SIGNED
// ones that never reached HR — and touches none. No action renders here;
// the actions themselves refuse an ADMIN actor (the server check is the
// control, the missing buttons are just the polish).
export default async function AdminHome() {
  const user = await requireRole('ADMIN')

  const rows = await prisma.leaveRequest.findMany({
    orderBy: { submittedAt: 'desc' },
    include: {
      employee: { select: { name: true } },
      supervisor: { select: { name: true } },
      hrOfficer: { select: { name: true } },
    },
  })

  const requests = rows.map((r) => ({
    id: r.id,
    leaveType: r.leaveType,
    otherLeaveType: r.otherLeaveType,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    supervisorRemark: r.supervisorRemark,
    hrRemark: r.hrRemark,
    employeeName: r.employee.name,
    supervisorName: r.supervisor.name,
    decidedByName: r.hrOfficer?.name,
  }))

  return (
    <RoleHome user={user}>
      <h2 className="mt-10 text-lg font-medium text-[#1f2937]">
        All leave records
      </h2>
      <RequestList requests={requests} emptyMessage="No leave records yet." />
    </RoleHome>
  )
}
