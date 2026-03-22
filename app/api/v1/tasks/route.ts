import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload

    const assignments = await prisma.taskAssignment.findMany({
      where: { userId },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            priority: true,
            dueDate: true,
            archivedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const tasks = assignments
      .filter((a) => !a.task.archivedAt)
      .map((a) => ({
        taskId: a.task.id,
        assignmentId: a.id,
        title: a.task.title,
        description: a.task.description,
        priority: a.task.priority,
        dueDate: a.task.dueDate?.toISOString() || null,
        completedAt: a.completedAt?.toISOString() || null,
        notes: a.notes,
      }))

    return apiSuccess(tasks)
  } catch (error) {
    console.error('Tasks GET error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to fetch tasks', 500)
  }
}
