import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { getEffectiveProfileIds } from '@/app/lib/data'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId, orgId } = auth.payload
    const effectiveProfileIds = await getEffectiveProfileIds(userId)

    const [prompts, categories, profileRules] = await Promise.all([
      prisma.prompt.findMany({
        where: { organizationId: orgId, isActive: true },
        select: {
          id: true,
          content: true,
          type: true,
          options: true,
          isGlobal: true,
          sortOrder: true,
          categoryId: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.promptCategory.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true },
      }),
      prisma.profileRule.findMany({
        where: { profileId: { in: effectiveProfileIds } },
        select: {
          id: true,
          profileId: true,
          categoryId: true,
          categoryString: true,
          minCount: true,
          maxCount: true,
          includeAll: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ])

    return apiSuccess({
      prompts,
      categories,
      profileRules,
      effectiveProfileIds,
    })
  } catch (error) {
    console.error('Prompts all error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to fetch prompts', 500)
  }
}
