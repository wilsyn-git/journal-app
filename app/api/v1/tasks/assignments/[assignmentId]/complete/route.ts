import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'

const completeSchema = z.object({
  notes: z.string().optional(),
})

type RouteParams = { params: Promise<{ assignmentId: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { assignmentId } = await params
    const body = await request.json().catch(() => ({}))
    const parsed = completeSchema.safeParse(body)

    const { userId, orgId } = auth.payload

    const assignment = await prisma.taskAssignment.findUnique({
      where: { id: assignmentId },
      include: { task: true },
    })

    if (!assignment) {
      return apiError('NOT_FOUND', 'Assignment not found', 404)
    }

    if (assignment.task.organizationId !== orgId) {
      return apiError('FORBIDDEN', 'Access denied', 403)
    }

    if (assignment.userId !== userId) {
      return apiError('FORBIDDEN', 'Access denied', 403)
    }

    // Idempotent: if already completed, return success
    if (assignment.completedAt) {
      return apiSuccess({ success: true })
    }

    await prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: {
        completedAt: new Date(),
        ...(parsed.success && parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      },
    })

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Task complete error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to complete task', 500)
  }
}
