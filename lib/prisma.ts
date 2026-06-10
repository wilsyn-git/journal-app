import { PrismaClient } from '@prisma/client'
import { applySqlitePragmas } from '@/lib/sqlitePragmas'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query'] : [],
    })

// Apply SQLite tuning once per fresh client. Fire-and-forget: connection is
// lazy, so this resolves on first use; failures are swallowed inside the helper.
if (!globalForPrisma.prisma) {
    void applySqlitePragmas(prisma)
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
