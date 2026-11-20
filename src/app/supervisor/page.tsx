import { requireRole } from '@/lib/auth'
import { RoleHome } from '@/components/RoleHome'

export default async function SupervisorHome() {
  const user = await requireRole('SUPERVISOR')
  return <RoleHome user={user} />
}
