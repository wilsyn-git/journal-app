import { cookies } from "next/headers"

export const DEFAULT_TIMEZONE = "America/New_York"

export async function getUserTimezone() {
    const cookieStore = await cookies()
    return cookieStore.get("user-timezone")?.value || DEFAULT_TIMEZONE
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

export function startOfDayInTimezone(date: Date, timezone: string): Date {
    // This is tricky. We want a Date object that represents 00:00:00 in the Target Timezone.
    // But Date objects are absolute.
    // So we want the timestamp where it IS midnight in that timezone.

    // 1. Get the date string in that timezone: "2024-01-25"
    const dateStr = date.toLocaleDateString("en-CA", { timeZone: timezone })

    // 2. Parse it back regarding that timezone.
    // There isn't a native "parse in timezone" in JS without libraries like date-fns-tz or luxon.
    // Hack: Append 00:00:00 and the offset?

    // Easier hack with Intl:
    // We already have the YYYY-MM-DD string.
    // Creating a Date from "YYYY-MM-DD" usually treats it as UTC.
    // If we want the absolute time that corresponds to Midnight in New York:
    // It's "2024-01-25T05:00:00Z" (if EST).

    // Let's use `Intl.DateTimeFormat` parts to manually reconstruct if needed, or rely on a simpler approach:
    // Just work with Strings for logic, and use the DB's absolute time for queries.

    return new Date() // Placeholder if not needed yet.
}
