// Role names and their home routes — single source, used by auth.ts and
// proxy.ts so the optimistic and real checks can never drift apart.
export type Role = 'EMPLOYEE' | 'SUPERVISOR' | 'HR' | 'ADMIN'

export const ROLE_HOME: Record<Role, string> = {
  EMPLOYEE: '/employee',
  SUPERVISOR: '/supervisor',
  HR: '/hr',
  ADMIN: '/admin',
}
