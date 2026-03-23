'use client'

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { autoDetectTimezone } from "@/app/actions/settings"

export function TimezoneSync() {
    const router = useRouter()

    useEffect(() => {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

        // Set cookie for immediate server-side use
        const cookieMatch = document.cookie.split('; ').find(row => row.startsWith('user-timezone='))
        const currentCookieValue = cookieMatch ? cookieMatch.split('=')[1] : null

        if (currentCookieValue !== timezone) {
            document.cookie = `user-timezone=${timezone}; path=/; max-age=31536000; SameSite=Lax`
            router.refresh()
        }

        // Also persist to DB if not yet set
        autoDetectTimezone(timezone).catch(() => {
            // Silently ignore — not critical
        })
    }, [router])

    return null
}
