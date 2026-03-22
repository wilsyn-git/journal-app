import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPushNotification } from '@/lib/api/pushNotifications'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'

export async function POST(request: NextRequest) {
    // Simple shared secret auth for cron endpoints
    const cronSecret = request.headers.get('x-cron-secret')
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
        return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
    }

    try {
        // Get all users with active device sessions
        const usersWithDevices = await prisma.user.findMany({
            where: {
                deviceSessions: {
                    some: {
                        deviceToken: { not: null },
                        revokedAt: null,
                    },
                },
            },
            select: {
                id: true,
                deviceSessions: {
                    where: { deviceToken: { not: null }, revokedAt: null },
                    select: { deviceToken: true },
                },
            },
        })

        for (const user of usersWithDevices) {
            // Check if user has entries today
            const now = new Date()
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)

            const todayEntries = await prisma.journalEntry.count({
                where: {
                    userId: user.id,
                    createdAt: { gte: startOfDay },
                },
            })

            if (todayEntries > 0) continue

            // Check if user has an active streak > 1
            const recentEntries = await prisma.journalEntry.findMany({
                where: { userId: user.id },
                select: { createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 30,
            })

            const uniqueDays = new Set(
                recentEntries.map((e) =>
                    e.createdAt.toISOString().split('T')[0]
                )
            )
            const sortedDays = Array.from(uniqueDays).sort().reverse()

            // Check yesterday
            const yesterday = new Date(now)
            yesterday.setDate(yesterday.getDate() - 1)
            const yesterdayStr = yesterday.toISOString().split('T')[0]

            if (!sortedDays.includes(yesterdayStr)) continue

            // Count consecutive days ending yesterday
            let streak = 1
            for (let i = 0; i < sortedDays.length - 1; i++) {
                const d1 = new Date(sortedDays[i])
                const d2 = new Date(sortedDays[i + 1])
                const diff = Math.round(
                    (d1.getTime() - d2.getTime()) / (1000 * 3600 * 24)
                )
                if (diff === 1) streak++
                else break
            }

            if (streak > 1) {
                const tokens = user.deviceSessions
                    .map((s) => s.deviceToken)
                    .filter((t): t is string => t !== null)

                await sendPushNotification(
                    tokens,
                    'myJournal',
                    `Don't break your ${streak}-day streak — take a minute to journal today.`,
                    { type: 'streak_reminder' }
                )
            }
        }

        return apiSuccess({ success: true })
    } catch (error) {
        console.error('Streak cron error:', error)
        return apiError('INTERNAL_ERROR', 'Streak check failed', 500)
    }
}
