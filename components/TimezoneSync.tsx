'use client'

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function TimezoneSync() {
    const router = useRouter()

    useEffect(() => {
        // Detect browser timezone
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

        // Check if cookie exists and matches
        const cookieMatch = document.cookie.split('; ').find(row => row.startsWith('user-timezone='))
        const currentCookieValue = cookieMatch ? cookieMatch.split('=')[1] : null

        if (currentCookieValue !== timezone) {
            // Set cookie
            document.cookie = `user-timezone=${timezone}; path=/; max-age=31536000; SameSite=Lax`

            // Refresh to ensure server renders with correct timezone
            console.log('Timezone mismatch or missing. Refreshing...')
            router.refresh()
        }

    }, [router])

    return null
}
