import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { RoleHome } from '@/components/RoleHome'
import { SuccessBanner } from '@/components/SuccessBanner'
import { RequestList } from '@/components/RequestList'
import Link from 'next/link'

// The employee's own list (LR-11: employeeId = me, newest first — FR-06,
// U18). The scoping is in this query; the browser never picks whose rows
// appear.
export default async function EmployeeHome({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>
}) {
  const user = await requireRole('EMPLOYEE')
  const { done } = await searchParams

  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId: user.id },
    orderBy: { submittedAt: 'desc' },
  })

  return (
    <RoleHome user={user} banner={<SuccessBanner done={done} />}>
      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-lg font-medium text-[#1f2937]">
          My leave requests
        </h2>
        <Link
          href="/employee/leave/new"
          className="rounded-full bg-[#23a55a] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1c8b4b]"
        >
          New request
        </Link>
      </div>
      <RequestList requests={requests} />
    </RoleHome>
  )
}
