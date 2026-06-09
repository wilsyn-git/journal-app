'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/providers/ToastProvider'

function dayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
}

function msUntilNextMidnight(timezone: string): number {
  const time = new Date().toLocaleTimeString('en-GB', { timeZone: timezone, hour12: false })
  const [h, m, s] = time.split(':').map(Number)
  const elapsed = h * 3600 + m * 60 + s
  return (86400 - elapsed) * 1000 + 1000 // +1s buffer to land just past midnight
}

type Props = {
  timezone: string
  /** The YYYY-MM-DD the server rendered as "today". */
  renderedDay: string
}

export function MidnightRefreshNotice({ timezone, renderedDay }: Props) {
  const router = useRouter()
  const { addToast } = useToast()
  const notifiedRef = useRef(false)

  useEffect(() => {
    const maybeNotify = () => {
      if (notifiedRef.current) return
      if (dayInTimezone(timezone) === renderedDay) return
      notifiedRef.current = true
      addToast(
        'info',
        <span className="flex items-center gap-3">
          ☀️ New day started — showing yesterday&apos;s view.
          <button
            onClick={() => router.refresh()}
            className="underline font-semibold whitespace-nowrap"
          >
            Refresh →
          </button>
        </span>,
        0, // persist until dismissed
      )
    }

    const timeoutId = setTimeout(maybeNotify, msUntilNextMidnight(timezone))

    const onVisible = () => {
      if (document.visibilityState === 'visible') maybeNotify()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', maybeNotify)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', maybeNotify)
    }
  }, [timezone, renderedDay, addToast, router])

  return null
}
