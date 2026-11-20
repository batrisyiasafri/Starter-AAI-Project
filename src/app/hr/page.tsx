import { requireRole } from '@/lib/auth'
import { RoleHome } from '@/components/RoleHome'

export default async function HrHome() {
  const user = await requireRole('HR')
  return <RoleHome user={user} />
}
