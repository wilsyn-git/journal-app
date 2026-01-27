'use client'

import { useEffect } from "react"
import { updateLastActive } from "@/app/lib/activity-actions"

export function ActivityTracker() {
    useEffect(() => {
        // Fire on mount (page load)
        updateLastActive()

        // Optional: Set up an interval if the user stays on the page for a long time
        // const interval = setInterval(updateLastActive, 30 * 60 * 1000) // Every 30 mins
        // return () => clearInterval(interval)
    }, [])

    return null
}
