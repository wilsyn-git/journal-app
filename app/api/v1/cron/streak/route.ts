import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPushNotification } from '@/lib/api/pushNotifications'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { startOfDayInTimezone, getTodayForUser, DEFAULT_TIMEZONE } from '@/lib/timezone'

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
                timezone: true,
                deviceSessions: {
                    where: { deviceToken: { not: null }, revokedAt: null },
                    select: { deviceToken: true },
                },
            },
        })

        for (const user of usersWithDevices) {
            // Check if user has entries today
            const timezone = user.timezone || DEFAULT_TIMEZONE
            const todayStr = getTodayForUser(timezone)
            const todayStart = startOfDayInTimezone(todayStr, timezone)

            const todayEntries = await prisma.journalEntry.count({
                where: {
                    userId: user.id,
                    createdAt: { gte: todayStart },
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
                    new Date(e.createdAt).toLocaleDateString('en-CA', { timeZone: timezone })
                )
            )
            const sortedDays = Array.from(uniqueDays).sort().reverse()

            // Check yesterday
            const yesterdayDate = new Date(todayStr + 'T12:00:00Z')
            yesterdayDate.setDate(yesterdayDate.getDate() - 1)
            const yesterdayStr = yesterdayDate.toISOString().split('T')[0]

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
