import { requireRole } from '@/lib/auth'
import { RoleHome } from '@/components/RoleHome'

export default async function EmployeeHome() {
  const user = await requireRole('EMPLOYEE')
  return <RoleHome user={user} />
}
