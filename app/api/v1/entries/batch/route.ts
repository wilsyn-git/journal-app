import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { startOfDayInTimezone, endOfDayInTimezone, getUserTimezoneById } from '@/lib/timezone'

const batchSchema = z.object({
  entries: z.array(
    z.object({
      promptId: z.string().uuid(),
      answer: z.string().max(10000),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
  ).max(50),
})

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const body = await request.json()
    const parsed = batchSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', 'Invalid batch data', 422)
    }

    const { userId } = auth.payload
    const timezone = request.headers.get('x-timezone')
      || await getUserTimezoneById(userId)
    const errors: { promptId: string; date: string; error: string }[] = []
    let synced = 0

    for (const entry of parsed.data.entries) {
      try {
        const startOfDay = startOfDayInTimezone(entry.date, timezone)
        const endOfDay = endOfDayInTimezone(entry.date, timezone)

        const existing = await prisma.journalEntry.findFirst({
          where: {
            userId,
            promptId: entry.promptId,
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
        })

        if (existing) {
          await prisma.journalEntry.update({
            where: { id: existing.id },
            data: { answer: entry.answer, updatedAt: new Date() },
          })
        } else {
          await prisma.journalEntry.create({
            data: {
              userId,
              promptId: entry.promptId,
              answer: entry.answer,
            },
          })
        }
        synced++
      } catch (err) {
        errors.push({
          promptId: entry.promptId,
          date: entry.date,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return apiSuccess({ synced, errors })
  } catch (error) {
    console.error('Batch sync error:', error)
    return apiError('INTERNAL_ERROR', 'Batch sync failed', 500)
  }
}
