import { PrismaClient } from '@prisma/client'

// One Prisma client for the whole server. Cached on globalThis so Next's
// hot reload in dev doesn't open a new connection on every edit.
const globalForPrisma = globalThis as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
