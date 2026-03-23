# User Timezone Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a database-backed timezone setting so all server-side date boundary logic uses the user's actual timezone, fixing duplicate prompts caused by UTC midnight misalignment.

**Architecture:** Add `timezone` field to User model, auto-detect from browser on first visit (write to DB if null), expose a searchable timezone picker in settings. Fix all date boundary queries (`getActivePrompts`, `getEntriesByDate`, `saveJournalResponse`, API `dayBounds`) to use timezone-aware helpers.

**Tech Stack:** Next.js 14, Prisma (SQLite), TypeScript, `Intl` API for timezone math (no external libraries)

**Spec:** `docs/superpowers/specs/2026-03-23-user-timezone-setting-design.md`

---

### Task 1: Add `timezone` field to User model and run migration

**Files:**
- Modify: `prisma/schema.prisma` (User model, around line 71)

- [ ] **Step 1: Add timezone field to schema**

In `prisma/schema.prisma`, add after the `bio` field (around line 80):

```prisma
timezone  String?
```

- [ ] **Step 2: Generate and run migration**

Run:
```bash
npx prisma migrate dev --name add_user_timezone
```

Expected: Migration created and applied. `prisma/migrations/` has a new directory.

- [ ] **Step 3: Verify schema**

Run:
```bash
npx prisma studio
```

Open User table, confirm `timezone` column exists and is nullable.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add timezone field to User model"
```

---

### Task 2: Implement timezone helpers in `lib/timezone.ts`

**Files:**
- Modify: `lib/timezone.ts`

This is the core building block — every other task depends on these helpers being correct.

- [ ] **Step 1: Implement `startOfDayInTimezone`**

Replace the placeholder function at lines 22-44 in `lib/timezone.ts`:

```typescript
/**
 * Returns a UTC Date representing midnight (00:00:00.000) in the given timezone
 * for the given YYYY-MM-DD date string.
 *
 * Example: startOfDayInTimezone("2026-03-23", "America/New_York")
 *   → 2026-03-23T04:00:00.000Z (midnight EDT = UTC+4h)
 */
export function startOfDayInTimezone(dateStr: string, timezone: string): Date {
    // Create a date at noon UTC to avoid any DST edge cases during parsing
    const [year, month, day] = dateStr.split('-').map(Number)
    const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

    // Get the UTC offset for this timezone at this date
    // by comparing the formatted date parts
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

    // Reconstruct what UTC time was when it was noon UTC, as seen in the target timezone
    const tzNoonMs = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond)
    const offsetMs = tzNoonMs - noonUtc.getTime()

    // Midnight in the target timezone = midnight local - offset = UTC equivalent
    const midnightLocal = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
    return new Date(midnightLocal - offsetMs)
}
```

- [ ] **Step 2: Add `endOfDayInTimezone`**

Add after `startOfDayInTimezone`:

```typescript
/**
 * Returns a UTC Date representing 23:59:59.999 in the given timezone
 * for the given YYYY-MM-DD date string.
 */
export function endOfDayInTimezone(dateStr: string, timezone: string): Date {
    const start = startOfDayInTimezone(dateStr, timezone)
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
}
```

- [ ] **Step 3: Add `getUserTimezoneById` helper**

Add to `lib/timezone.ts`:

```typescript
import { prisma } from "@/lib/prisma"

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
```

- [ ] **Step 4: Update `getUserTimezone` to support DB lookup**

Replace the existing `getUserTimezone` function (lines 5-8):

```typescript
/**
 * Get timezone for the current request context.
 * Priority: DB (if authenticated) → Cookie → Default
 */
export async function getUserTimezone(userId?: string): Promise<string> {
    // 1. Try database if userId provided
    if (userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { timezone: true }
        })
        if (user?.timezone) return user.timezone
    }

    // 2. Fall back to cookie
    const cookieStore = await cookies()
    return cookieStore.get("user-timezone")?.value || DEFAULT_TIMEZONE
}
```

- [ ] **Step 5: Manually verify helpers**

Create a temporary test script or use the Next.js console to verify:
- `startOfDayInTimezone("2026-03-23", "America/New_York")` → should be `2026-03-23T04:00:00.000Z` (EDT)
- `startOfDayInTimezone("2026-03-23", "America/Los_Angeles")` → should be `2026-03-23T07:00:00.000Z` (PDT)
- `startOfDayInTimezone("2026-01-15", "America/New_York")` → should be `2026-01-15T05:00:00.000Z` (EST, no DST)
- `endOfDayInTimezone("2026-03-23", "America/New_York")` → should be `2026-03-24T03:59:59.999Z`

- [ ] **Step 6: Commit**

```bash
git add lib/timezone.ts
git commit -m "feat: implement timezone-aware date helpers and DB-backed timezone resolution"
```

---

### Task 3: Fix recency suppression in `getActivePrompts()`

**Files:**
- Modify: `app/lib/data.ts` (lines 94-108)

This is the primary bug fix — the reason prompts are duplicating.

- [ ] **Step 1: Import the new helpers**

At the top of `app/lib/data.ts`, ensure these are imported:

```typescript
import { getUserTimezoneById, startOfDayInTimezone, getTodayForUser } from "@/lib/timezone"
```

- [ ] **Step 2: Fix the recency suppression query**

Replace lines 94-108 in `app/lib/data.ts`:

```typescript
// Before (broken UTC midnight):
// const today = new Date(dateStr || new Date().toISOString().split('T')[0])
// const suppressionStart = new Date(today)
// suppressionStart.setDate(suppressionStart.getDate() - RECENCY_SUPPRESSION_DAYS)

// After (timezone-aware):
const timezone = await getUserTimezoneById(userId)
const todayStr = dateStr || getTodayForUser(timezone)
const todayStart = startOfDayInTimezone(todayStr, timezone)

// Calculate suppression start date string
const suppressionDate = new Date(todayStr + 'T12:00:00Z') // noon to avoid DST issues
suppressionDate.setDate(suppressionDate.getDate() - RECENCY_SUPPRESSION_DAYS)
const suppressionDateStr = suppressionDate.toISOString().split('T')[0]
const suppressionStart = startOfDayInTimezone(suppressionDateStr, timezone)

const recentEntries = await prisma.journalEntry.findMany({
    where: {
        userId,
        createdAt: {
            gte: suppressionStart,
            lt: todayStart
        }
    },
    select: { promptId: true },
    distinct: ['promptId']
})
```

- [ ] **Step 3: Verify the fix scenario**

Mental walkthrough: User in `America/New_York` journals at 9:40 PM on March 22.
- Entry `createdAt` = `2026-03-23T01:40:00Z`
- Next day (March 23), `todayStart` = `startOfDayInTimezone("2026-03-23", "America/New_York")` = `2026-03-23T04:00:00Z`
- Recency query: `createdAt >= suppressionStart AND createdAt < 2026-03-23T04:00:00Z`
- The 01:40 UTC entry is less than 04:00 UTC → it IS captured by the recency filter
- Prompts from March 22 are now correctly suppressed

- [ ] **Step 4: Commit**

```bash
git add app/lib/data.ts
git commit -m "fix: use timezone-aware boundaries in recency suppression query"
```

---

### Task 4: Fix `getEntriesByDate()`

**Files:**
- Modify: `app/lib/data.ts` (lines 262-290)
- Modify: `app/dashboard/page.tsx` (lines 147, 166 — callers)

- [ ] **Step 1: Update `getEntriesByDate` signature and implementation**

Replace lines 262-290 in `app/lib/data.ts`:

```typescript
export async function getEntriesByDate(userId: string, dateStr: string, timezone?: string) {
    const tz = timezone || await getUserTimezoneById(userId)
    const start = startOfDayInTimezone(dateStr, tz)
    const end = endOfDayInTimezone(dateStr, tz)

    return await prisma.journalEntry.findMany({
        where: {
            userId,
            createdAt: {
                gte: start,
                lte: end
            }
        },
        include: {
            prompt: true
        }
    });
}
```

Also import `endOfDayInTimezone` at the top of the file if not already imported.

- [ ] **Step 2: Update callers in dashboard**

In `app/dashboard/page.tsx`, the `timezone` variable is already available (line 73 of the Promise.all). Pass it to the calls at lines 147 and 166:

Line 147: `const rawEntries = await getEntriesByDate(targetUserId, targetDate, timezone);`
Line 166: `const todayEntries = await getEntriesByDate(targetUserId, today, timezone);`

- [ ] **Step 3: Commit**

```bash
git add app/lib/data.ts app/dashboard/page.tsx
git commit -m "fix: use timezone-aware day boundaries in getEntriesByDate"
```

---

### Task 5: Fix `saveJournalResponse()` duplicate check

**Files:**
- Modify: `app/actions/journal.ts` (lines 92-108)

- [ ] **Step 1: Import helpers**

At top of `app/actions/journal.ts`, add:

```typescript
import { getUserTimezoneById, startOfDayInTimezone, endOfDayInTimezone, getTodayForUser } from "@/lib/timezone"
```

- [ ] **Step 2: Fix the day boundary logic**

Replace lines 92-95 in `app/actions/journal.ts`:

```typescript
// Before (server-local time):
// const now = new Date();
// const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
// const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

// After (timezone-aware):
const timezone = await getUserTimezoneById(userId)
const todayStr = getTodayForUser(timezone)
const startOfDay = startOfDayInTimezone(todayStr, timezone)
const endOfDay = endOfDayInTimezone(todayStr, timezone)
```

- [ ] **Step 3: Commit**

```bash
git add app/actions/journal.ts
git commit -m "fix: use timezone-aware day boundaries in saveJournalResponse duplicate check"
```

---

### Task 6: Fix REST API `dayBounds()` and timezone fallbacks

**Files:**
- Modify: `app/api/v1/entries/route.ts` (lines 13-19 — `dayBounds`)
- Modify: `app/api/v1/entries/batch/route.ts` (lines 34-36)
- Modify: `app/api/v1/prompts/today/route.ts` (line 14)
- Modify: `app/api/v1/stats/route.ts` (line 14)

- [ ] **Step 1: Fix `dayBounds` in entries route**

In `app/api/v1/entries/route.ts`, replace the `dayBounds` function (lines 13-19):

```typescript
import { startOfDayInTimezone, endOfDayInTimezone, getUserTimezoneById, DEFAULT_TIMEZONE } from '@/lib/timezone'

function dayBoundsForTimezone(dateStr: string, timezone: string) {
  const startOfDay = startOfDayInTimezone(dateStr, timezone)
  const endOfDay = endOfDayInTimezone(dateStr, timezone)
  return { startOfDay, endOfDay }
}
```

Update the GET handler to resolve timezone:

```typescript
const timezone = request.headers.get('x-timezone')
  || await getUserTimezoneById(userId)
  || DEFAULT_TIMEZONE
```

Update all `dayBounds(...)` calls to `dayBoundsForTimezone(..., timezone)`.

- [ ] **Step 2: Fix batch route**

In `app/api/v1/entries/batch/route.ts`, replace the inline day boundary logic (lines 34-36) with the same timezone-aware approach:

```typescript
import { startOfDayInTimezone, endOfDayInTimezone, getUserTimezoneById, DEFAULT_TIMEZONE } from '@/lib/timezone'
```

In the POST handler, resolve timezone once:
```typescript
const timezone = request.headers.get('x-timezone')
  || await getUserTimezoneById(userId)
  || DEFAULT_TIMEZONE
```

Replace lines 34-36:
```typescript
const startOfDay = startOfDayInTimezone(entry.date, timezone)
const endOfDay = endOfDayInTimezone(entry.date, timezone)
```

- [ ] **Step 3: Update prompts/today and stats fallback**

In `app/api/v1/prompts/today/route.ts`, change line 14:
```typescript
const timezone = request.headers.get('x-timezone')
  || await getUserTimezoneById(userId)
```

In `app/api/v1/stats/route.ts`, change line 14:
```typescript
const timezone = request.headers.get('x-timezone')
  || await getUserTimezoneById(userId)
```

Remove `DEFAULT_TIMEZONE` imports from these files if no longer used directly (the helpers handle the fallback internally).

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/entries/route.ts app/api/v1/entries/batch/route.ts app/api/v1/prompts/today/route.ts app/api/v1/stats/route.ts
git commit -m "fix: use timezone-aware day boundaries in REST API routes"
```

---

### Task 7: Add `setUserTimezone` server action and update `TimezoneSync`

**Files:**
- Modify: `app/actions/settings.ts`
- Modify: `components/TimezoneSync.tsx`

- [ ] **Step 1: Add server action for setting timezone**

Add to `app/actions/settings.ts`:

```typescript
export async function setUserTimezone(timezone: string) {
    const session = await auth()
    if (!session?.user) throw new Error("Unauthorized")

    const userId = await resolveUserId(session)
    if (!userId) throw new Error("User not found")

    // Validate timezone is a real IANA timezone
    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone })
    } catch {
        throw new Error("Invalid timezone")
    }

    await prisma.user.update({
        where: { id: userId },
        data: { timezone }
    })

    revalidatePath("/dashboard")
    revalidatePath("/settings")
    return { success: true }
}
```

- [ ] **Step 2: Add auto-detect server action (only writes if null)**

Add to `app/actions/settings.ts`:

```typescript
export async function autoDetectTimezone(timezone: string) {
    const session = await auth()
    if (!session?.user) return // Silently return if not authenticated

    const userId = await resolveUserId(session)
    if (!userId) return

    // Only set if user hasn't set one yet
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true }
    })

    if (user?.timezone) return // Already set, don't overwrite

    // Validate
    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone })
    } catch {
        return // Invalid timezone, silently ignore
    }

    await prisma.user.update({
        where: { id: userId },
        data: { timezone }
    })
}
```

- [ ] **Step 3: Update `TimezoneSync` to write to DB**

Replace `components/TimezoneSync.tsx`:

```typescript
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
```

- [ ] **Step 4: Commit**

```bash
git add app/actions/settings.ts components/TimezoneSync.tsx
git commit -m "feat: add timezone auto-detection with DB persistence"
```

---

### Task 8: Add timezone picker to settings page

**Files:**
- Create: `app/settings/TimezonePicker.tsx`
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Create the `TimezonePicker` client component**

Create `app/settings/TimezonePicker.tsx`:

```typescript
'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { setUserTimezone } from '@/app/actions/settings'
import { useToast } from '@/components/providers/ToastProvider'

type Props = {
    currentTimezone: string | null
}

function getTimezoneLabel(tz: string): string {
    try {
        const now = new Date()
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            timeZoneName: 'shortOffset',
        })
        const parts = formatter.formatToParts(now)
        const offset = parts.find(p => p.type === 'timeZoneName')?.value || ''
        return `${tz.replace(/_/g, ' ')} (${offset})`
    } catch {
        return tz
    }
}

export function TimezonePicker({ currentTimezone }: Props) {
    const [search, setSearch] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const [selected, setSelected] = useState(currentTimezone || '')
    const [isPending, setIsPending] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const { addToast } = useToast()

    const allTimezones = useMemo(() => {
        try {
            return Intl.supportedValuesOf('timeZone')
        } catch {
            // Fallback for older environments
            return []
        }
    }, [])

    const filtered = useMemo(() => {
        if (!search) return allTimezones.slice(0, 20)
        const lower = search.toLowerCase().replace(/\s+/g, '_')
        return allTimezones
            .filter(tz => tz.toLowerCase().includes(lower))
            .slice(0, 20)
    }, [search, allTimezones])

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
                setSearch('')
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSelect = async (tz: string) => {
        setSelected(tz)
        setIsOpen(false)
        setSearch('')
        setIsPending(true)

        try {
            await setUserTimezone(tz)
            addToast('success', 'Timezone updated')
        } catch {
            addToast('error', 'Failed to update timezone')
            setSelected(currentTimezone || '')
        } finally {
            setIsPending(false)
        }
    }

    return (
        <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-400 mb-1">Timezone</label>
            <div
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white cursor-pointer hover:border-white/20 transition-colors flex items-center justify-between"
                onClick={() => {
                    setIsOpen(!isOpen)
                    if (!isOpen) {
                        setTimeout(() => inputRef.current?.focus(), 0)
                    }
                }}
            >
                <span className={selected ? 'text-white' : 'text-gray-500'}>
                    {isPending ? 'Saving...' : selected ? getTimezoneLabel(selected) : 'Select timezone...'}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl max-h-64 overflow-hidden">
                    <div className="p-2 border-b border-white/10">
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search city or region..."
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                        />
                    </div>
                    <div className="overflow-y-auto max-h-48">
                        {filtered.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500">No timezones found</div>
                        ) : (
                            filtered.map(tz => (
                                <button
                                    key={tz}
                                    onClick={() => handleSelect(tz)}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
                                        tz === selected ? 'bg-blue-500/20 text-blue-300' : 'text-gray-300'
                                    }`}
                                >
                                    {getTimezoneLabel(tz)}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 2: Add timezone section to settings page**

In `app/settings/page.tsx`, import the component:

```typescript
import { TimezonePicker } from "./TimezonePicker"
```

Add a new section after the Profile section (after the closing `</div>` on line 76, before the Security section):

```tsx
<div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8">
    <h2 className="text-xl font-semibold mb-4 text-gray-200">Preferences</h2>
    <TimezonePicker currentTimezone={user.timezone} />
    <p className="text-xs text-gray-500 mt-2">
        Used to determine your journal day boundaries. Auto-detected on first visit.
    </p>
</div>
```

Note: `user.timezone` will be available from the Prisma query since we added it to the schema in Task 1. No query changes needed — Prisma returns all scalar fields by default with `findUnique`.

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`

1. Navigate to `/settings`
2. Confirm the "Preferences" section appears with the timezone picker
3. Search for a timezone (e.g., "Chicago")
4. Select it — verify toast shows "Timezone updated"
5. Refresh — verify the selected timezone persists

- [ ] **Step 4: Commit**

```bash
git add app/settings/TimezonePicker.tsx app/settings/page.tsx
git commit -m "feat: add searchable timezone picker to settings page"
```

---

### Task 9: Update `getUserTimezone` callers to pass userId

**Files:**
- Modify: `app/dashboard/page.tsx` (line 73)

- [ ] **Step 1: Pass userId to getUserTimezone in dashboard**

In `app/dashboard/page.tsx`, line 73 currently calls `getUserTimezone()` with no args. Update to pass `targetUserId`:

```typescript
getUserTimezone(targetUserId),
```

This ensures the dashboard uses the DB-stored timezone for the user being viewed (important for admin viewing other users).

- [ ] **Step 2: Verify no other callers need updating**

Other callers of `getUserTimezone()`:
- `app/lib/analytics.ts:31` — this is inside `getUserStats()` which doesn't have a userId param readily available. Since it's called from the dashboard where timezone is already resolved, this is acceptable to leave using the cookie fallback for now. The analytics formatting is display-only and not a correctness issue.
- `app/admin/tasks/page.tsx:26` and `app/admin/tasks/[id]/page.tsx:35` — these use timezone for display/overdue checks. The cookie fallback is acceptable here since admin is always viewing in their own timezone.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: pass userId to getUserTimezone for DB-backed resolution"
```

---

### Task 10: End-to-end verification

**Files:** None (testing only)

- [ ] **Step 1: Test the core bug scenario**

Run `npm run dev`. Test with the exact scenario from the bug report:

1. Go to settings, set timezone to `America/New_York`
2. Journal some entries (they'll be stored with current UTC `createdAt`)
3. Navigate to dashboard — entries should show for the correct day
4. Check that the recency suppression works: answered prompts should not reappear tomorrow

- [ ] **Step 2: Test auto-detection for new/existing users**

1. In Prisma Studio, set a user's `timezone` to `null`
2. Refresh the app — `TimezoneSync` should auto-detect and save to DB
3. Check Prisma Studio — `timezone` should now be populated
4. Change timezone in settings to something different
5. Refresh — auto-detect should NOT overwrite the manual setting

- [ ] **Step 3: Test settings UI**

1. Open `/settings`
2. Search for "Pacific" — should show relevant results
3. Select `America/Los_Angeles`
4. Refresh — should persist
5. Search for a nonsense string — should show "No timezones found"

- [ ] **Step 4: Build check**

Run:
```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit any fixes found during testing**

If any issues are found, fix and commit with descriptive messages.
