import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { startOfDayInTimezone, endOfDayInTimezone, resolveApiTimezone } from '@/lib/timezone'

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
    const timezone = await resolveApiTimezone(request, userId)
    const entries = parsed.data.entries

    if (entries.length === 0) {
      return apiSuccess({ synced: 0 })
    }

    // Build date ranges for all entries
    const dateRanges = entries.map((entry) => ({
      promptId: entry.promptId,
      date: entry.date,
      startOfDay: startOfDayInTimezone(entry.date, timezone),
      endOfDay: endOfDayInTimezone(entry.date, timezone),
    }))

    // Batch lookup: fetch all existing entries matching any (promptId, date) combo
    const existing = await prisma.journalEntry.findMany({
      where: {
        userId,
        OR: dateRanges.map((r) => ({
          promptId: r.promptId,
          createdAt: { gte: r.startOfDay, lte: r.endOfDay },
        })),
      },
    })

    // Build lookup map keyed by "promptId|date"
    const existingMap = new Map<string, typeof existing[0]>()
    for (const entry of existing) {
      for (const r of dateRanges) {
        if (
          entry.promptId === r.promptId &&
          entry.createdAt >= r.startOfDay &&
          entry.createdAt <= r.endOfDay
        ) {
          existingMap.set(`${r.promptId}|${r.date}`, entry)
          break
        }
      }
    }

    // Deduplicate: last entry wins for each promptId+date combo
    const deduped = new Map<string, typeof entries[0]>()
    for (const entry of entries) {
      deduped.set(`${entry.promptId}|${entry.date}`, entry)
    }

    // Build all operations and execute in a single transaction
    const operations = [...deduped.entries()].map(([key, entry]) => {
      const match = existingMap.get(key)
      if (match) {
        return prisma.journalEntry.update({
          where: { id: match.id },
          data: { answer: entry.answer, updatedAt: new Date() },
        })
      }
      return prisma.journalEntry.create({
        data: {
          userId,
          promptId: entry.promptId,
          answer: entry.answer,
        },
      })
    })

    await prisma.$transaction(operations)

    return apiSuccess({ synced: deduped.size })
  } catch (error) {
    console.error('Batch sync error:', error)
    return apiError('INTERNAL_ERROR', 'Batch sync failed', 500)
  }
}
