'use client'

import { useEffect } from "react"
// import { setCookie } from "cookies-next" // Unused

export function TimezoneSync() {
    useEffect(() => {
        // Detect browser timezone
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

        // Check if cookie exists or differs? 
        // For simplicity, just overwrite it on mount. 
        // The middleware/server will pick it up on next request.
        // We set it for 365 days.

        // We use a small vanilla JS function or just document.cookie if we don't want a dep.
        // But cookies-next is popular. Wait, do we have cookies-next?
        // Let's use vanilla document.cookie to avoid adding dependencies if possible, 
        // OR assume we can add it.
        // Given the environment, vanilla is safer to avoid install steps if not needed.

        document.cookie = `user-timezone=${timezone}; path=/; max-age=31536000; SameSite=Lax`

    }, [])

    return null
}
