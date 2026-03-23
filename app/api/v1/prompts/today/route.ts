import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { getActivePrompts, getEffectiveProfileIds } from '@/app/lib/data'
import { getUserTimezoneById } from '@/lib/timezone'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId, orgId } = auth.payload
    const timezone = request.headers.get('x-timezone')
      || await getUserTimezoneById(userId)
    const profileIds = await getEffectiveProfileIds(userId)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
    const prompts = await getActivePrompts(userId, orgId, profileIds, today)

    // Resolve category names for the response
    const categoryIds = [...new Set(prompts.map((p) => p.categoryId).filter(Boolean))]
    const categories = categoryIds.length > 0
      ? await prisma.promptCategory.findMany({
          where: { id: { in: categoryIds as string[] } },
          select: { id: true, name: true },
        })
      : []
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

    return apiSuccess(
      prompts.map((p) => ({
        id: p.id,
        content: p.content,
        type: p.type,
        options: p.options,
        sortOrder: p.sortOrder,
        categoryId: p.categoryId,
        categoryName: p.categoryId ? categoryMap.get(p.categoryId) || null : null,
      }))
    )
  } catch (error) {
    console.error('Prompts today error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to fetch prompts', 500)
  }
}
