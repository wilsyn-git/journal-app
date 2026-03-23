import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { startOfDayInTimezone, endOfDayInTimezone, getUserTimezoneById } from '@/lib/timezone'

const entrySchema = z.object({
  promptId: z.string().uuid(),
  answer: z.string().max(10000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

function dayBoundsForTimezone(dateStr: string, timezone: string) {
  const startOfDay = startOfDayInTimezone(dateStr, timezone)
  const endOfDay = endOfDayInTimezone(dateStr, timezone)
  return { startOfDay, endOfDay }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  const { userId } = auth.payload
  const timezone = request.headers.get('x-timezone')
    || await getUserTimezoneById(userId)
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  try {
    let where: Record<string, unknown> = { userId }

    if (date) {
      const { startOfDay, endOfDay } = dayBoundsForTimezone(date, timezone)
      where.createdAt = { gte: startOfDay, lte: endOfDay }
    } else if (from && to) {
      const { startOfDay } = dayBoundsForTimezone(from, timezone)
      const { endOfDay } = dayBoundsForTimezone(to, timezone)
      where.createdAt = { gte: startOfDay, lte: endOfDay }
    }

    const entries = await prisma.journalEntry.findMany({
      where,
      include: {
        prompt: {
          select: { id: true, content: true, type: true, options: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return apiSuccess(
      entries.map((e) => ({
        id: e.id,
        promptId: e.promptId,
        prompt: e.prompt,
        answer: e.answer,
        isLiked: e.isLiked,
        date: e.createdAt.toISOString().split('T')[0],
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error('Entries GET error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to fetch entries', 500)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const body = await request.json()
    const parsed = entrySchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', 'Invalid entry data', 422)
    }

    const { userId } = auth.payload
    const timezone = request.headers.get('x-timezone')
      || await getUserTimezoneById(userId)
    const { promptId, answer, date } = parsed.data

    const { startOfDay, endOfDay } = dayBoundsForTimezone(date, timezone)

    const existing = await prisma.journalEntry.findFirst({
      where: {
        userId,
        promptId,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    })

    if (existing) {
      await prisma.journalEntry.update({
        where: { id: existing.id },
        data: { answer, updatedAt: new Date() },
      })
    } else {
      await prisma.journalEntry.create({
        data: { userId, promptId, answer },
      })
    }

    return apiSuccess({ success: true }, 200)
  } catch (error) {
    console.error('Entry POST error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to save entry', 500)
  }
}
