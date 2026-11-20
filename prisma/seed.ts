// Loads the 6 demo users from docs/specs/02-design.md Reference B (doc 7.2).
// Upserts by email, so re-running is safe — this is also the "reset a
// password" procedure (requirements §5: forgot password is out of scope).
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEMO_PASSWORD = 'password123' // demo-only, hashed before storage

type DemoUser = {
  email: string
  name: string
  icNumber: string
  role: 'EMPLOYEE' | 'SUPERVISOR' | 'HR' | 'ADMIN'
  division: string
  designation: string
}

const DEMO_USERS: DemoUser[] = [
  {
    email: 'employee-1@budiman.com',
    name: 'Employee 1',
    icNumber: '00-148888',
    role: 'EMPLOYEE',
    division: 'Finance',
    designation: 'Accounts Clerk',
  },
  {
    email: 'supervisor-1@budiman.com',
    name: 'Supervisor 1',
    icNumber: '00-157777',
    role: 'SUPERVISOR',
    division: 'Finance',
    designation: 'Finance Manager',
  },
  {
    email: 'supervisor-2@budiman.com',
    name: 'Supervisor 2',
    icNumber: '00-166666',
    role: 'SUPERVISOR',
    division: 'Finance',
    designation: 'Accountant',
  },
  {
    email: 'hr-1@budiman.com',
    name: 'HR 1',
    icNumber: '00-175555',
    role: 'HR',
    division: 'Human Resources',
    designation: 'HR Officer',
  },
  {
    email: 'hr-2@budiman.com',
    name: 'HR 2',
    icNumber: '00-184444',
    role: 'HR',
    division: 'Human Resources',
    designation: 'HR Officer',
  },
  {
    email: 'admin@budiman.com',
    name: 'Admin',
    icNumber: '00-193333',
    role: 'ADMIN',
    division: 'Admin',
    designation: 'Admin Manager',
  },
]

export async function seed(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10) // bcryptjs default cost
  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        icNumber: user.icNumber,
        role: user.role,
        division: user.division,
        designation: user.designation,
        passwordHash,
      },
      create: { ...user, passwordHash },
    })
  }
}

// Run directly: npm run db:seed (prisma db seed → tsx prisma/seed.ts)
if (process.argv[1] && process.argv[1].includes('seed.ts')) {
  seed()
    .then(() => console.log('Seeded the 6 demo users.'))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
