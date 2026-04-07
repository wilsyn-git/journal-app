'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function ensureAdmin() {
    const session = await auth()
    if (session?.user?.role !== 'ADMIN') {
        throw new Error("Unauthorized: Admin access required")
    }
    return session!
}

export async function resolveCategory(
    organizationId: string,
    categoryId?: string | null,
    categoryString?: string | null
): Promise<{ categoryId: string | null; categoryString: string }> {
    if (categoryId) {
        const cat = await prisma.promptCategory.findUnique({ where: { id: categoryId } });
        return { categoryId, categoryString: cat?.name || 'General' };
    }

    if (categoryString) {
        const cat = await prisma.promptCategory.findUnique({
            where: { organizationId_name: { organizationId, name: categoryString } }
        });
        return { categoryId: cat?.id || null, categoryString };
    }

    return { categoryId: null, categoryString: 'General' };
}
