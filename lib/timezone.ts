import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"

export const DEFAULT_TIMEZONE = "America/New_York"

/**
 * Get timezone for the current request context.
 * Priority: DB (if authenticated) → Cookie → Default
 */
export async function getUserTimezone(userId?: string): Promise<string> {
    if (userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { timezone: true }
        })
        if (user?.timezone) return user.timezone
    }

    const cookieStore = await cookies()
    return cookieStore.get("user-timezone")?.value || DEFAULT_TIMEZONE
}

/**
 * Get timezone for a specific user by ID. Falls back to DEFAULT_TIMEZONE.
 * Use this in server actions and data queries where you have userId.
 */
export async function getUserTimezoneById(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true }
    })
    return user?.timezone || DEFAULT_TIMEZONE
}

/**
 * Resolve timezone for API routes.
 * Priority: x-timezone header → DB lookup by userId → DEFAULT_TIMEZONE
 */
export async function resolveApiTimezone(request: { headers: { get(name: string): string | null } }, userId: string): Promise<string> {
    return request.headers.get('x-timezone') || await getUserTimezoneById(userId)
}

export function toUserDate(date: Date, timezone: string) {
    // Return a string YYYY-MM-DD based on the user's timezone
    return date.toLocaleDateString("en-CA", { timeZone: timezone })
}

export function getTodayForUser(timezone: string) {
    // Returns { dateStr: YYYY-MM-DD, timestamp: Date }
    const now = new Date()
    const dateStr = now.toLocaleDateString("en-CA", { timeZone: timezone })
    return dateStr
}

/**
 * Returns a UTC Date representing midnight (00:00:00.000) in the given timezone
 * for the given YYYY-MM-DD date string.
 *
 * Example: startOfDayInTimezone("2026-03-23", "America/New_York")
 *   → 2026-03-23T04:00:00.000Z (midnight EDT = UTC+4h)
 */
export function startOfDayInTimezone(dateStr: string, timezone: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number)
    const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    })

    const parts = formatter.formatToParts(noonUtc)
    const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value)

    const tzYear = get('year')
    const tzMonth = get('month')
    const tzDay = get('day')
    const tzHour = get('hour') === 24 ? 0 : get('hour')
    const tzMinute = get('minute')
    const tzSecond = get('second')

    const tzNoonMs = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond)
    const offsetMs = tzNoonMs - noonUtc.getTime()

    const midnightLocal = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
    return new Date(midnightLocal - offsetMs)
}

/**
 * Returns a UTC Date representing 23:59:59.999 in the given timezone
 * for the given YYYY-MM-DD date string.
 *
 * Uses next-day-start-minus-1ms to correctly handle DST transitions
 * (spring-forward 23h days and fall-back 25h days).
 */
export function endOfDayInTimezone(dateStr: string, timezone: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number)
    const nextDate = new Date(Date.UTC(year, month - 1, day + 1))
    const nextDateStr = nextDate.toISOString().split('T')[0]
    const nextDayStart = startOfDayInTimezone(nextDateStr, timezone)
    return new Date(nextDayStart.getTime() - 1)
}
