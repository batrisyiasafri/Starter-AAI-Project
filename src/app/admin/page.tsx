import { requireRole } from '@/lib/auth'
import { RoleHome } from '@/components/RoleHome'

export default async function AdminHome() {
  const user = await requireRole('ADMIN')
  return <RoleHome user={user} />
}
