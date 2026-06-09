import { prisma as globalPrisma } from '@/lib/prisma'
import type { PrismaClient } from '@prisma/client'

export async function resolveCategory(
    organizationId: string,
    categoryId?: string | null,
    categoryString?: string | null,
    db: PrismaClient = globalPrisma
): Promise<{ categoryId: string | null; categoryString: string }> {
    if (categoryId) {
        const cat = await db.promptCategory.findFirst({ where: { id: categoryId, organizationId } });
        if (!cat) {
            return { categoryId: null, categoryString: 'General' };
        }
        return { categoryId: cat.id, categoryString: cat.name };
    }

    if (categoryString) {
        const cat = await db.promptCategory.findUnique({
            where: { organizationId_name: { organizationId, name: categoryString } }
        });
        return { categoryId: cat?.id || null, categoryString };
    }

    return { categoryId: null, categoryString: 'General' };
}
