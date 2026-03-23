# User Timezone Setting — Design Spec

## Motivation

The journal app has a UTC date boundary bug that causes duplicate prompts. The recency suppression query in `app/lib/data.ts:94-108` uses `new Date("2026-03-23")` which resolves to UTC midnight (`2026-03-23T00:00:00.000Z`). When US timezone users journal in the evening, their `createdAt` timestamps cross the UTC midnight boundary (e.g., 9:40 PM Eastern = 01:40 AM UTC the next day). The recency filter can't see these entries, so yesterday's prompts aren't suppressed and duplicates appear.

The root cause: timezone is stored only in a browser cookie, not in the database. Server-side date logic either ignores timezone entirely or uses server-local time. This affects multiple code paths beyond just recency suppression.

## Approach

Add a `timezone` field to the User model, auto-detect it on first visit, let users override it in settings, and fix all server-side date boundary logic to use it.

## Scope

### In Scope

- Database: `timezone` field on User model
- Auto-detection: save browser-detected timezone to DB on first visit (if field is null)
- Settings UI: searchable timezone picker on `/settings`
- Fix: recency suppression in `getActivePrompts()` — timezone-aware boundaries
- Fix: `getEntriesByDate()` — timezone-aware start/end of day
- Fix: `saveJournalResponse()` duplicate check — timezone-aware day boundaries
- Fix: complete `startOfDayInTimezone()` and add `endOfDayInTimezone()` in `lib/timezone.ts`
- Update `getUserTimezone()` to read from DB with cookie/default fallback chain
- REST API fallback: `/api/v1/` routes fall back to DB timezone when `x-timezone` header is absent

### Out of Scope

- Per-entry timezone storage (entries keep UTC `createdAt`)
- Timezone display in journal history (formatting-only concern, not a correctness issue)
- Backfilling timezone for existing users (auto-detect handles this on next visit)

## Database

Add to User model in `prisma/schema.prisma`:

```prisma
timezone  String?   // IANA timezone identifier, e.g. "America/New_York"
```

Nullable. `null` means "not yet detected — auto-detect on next visit."

Migration: `ALTER TABLE User ADD COLUMN timezone TEXT;` — no data backfill needed.

## Auto-Detection Flow

Current state: `TimezoneSync` client component detects browser timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` and writes it to a cookie.

New behavior:

1. `TimezoneSync` continues detecting browser timezone and setting the cookie (for immediate use before page reload)
2. On mount, if user is authenticated, call a new server action `setUserTimezone(timezone)`
3. The server action only writes to DB if `user.timezone` is `null` — once set, it never auto-overwrites
4. Only the settings page can change a non-null timezone

## Timezone Resolution Order

`getUserTimezone()` changes from cookie-only to a priority chain:

1. **Database** `user.timezone` (if authenticated and non-null) — source of truth
2. **Cookie** `user-timezone` (fallback for unauthenticated or not-yet-detected)
3. **Default** `America/New_York` (last resort)

For server actions and data queries that already have `userId`, a new helper `getUserTimezoneById(userId)` queries the DB directly.

## Settings UI

Add a "Timezone" section to `/settings` page, below the existing profile section.

**Component: searchable timezone picker**
- Input field that filters the IANA timezone list as user types
- Matches against city name, region, and common abbreviations
- Each option displays: `America/New_York (EDT, UTC-4)` format
- Current timezone shown when not actively searching
- Uses `Intl.supportedValuesOf('timeZone')` for the full list (native, no library needed)
- Save triggers a server action that updates `user.timezone`

## Date Boundary Fixes

### `lib/timezone.ts` — Core Helpers

Complete the placeholder `startOfDayInTimezone()` and add `endOfDayInTimezone()`:

```typescript
export function startOfDayInTimezone(dateStr: string, timezone: string): Date {
    // Given "2026-03-23" and "America/New_York":
    // Returns the UTC Date object representing 2026-03-23T00:00:00 in New_York
    // Which is 2026-03-23T04:00:00.000Z (EDT)
}

export function endOfDayInTimezone(dateStr: string, timezone: string): Date {
    // Returns the UTC Date object representing 2026-03-23T23:59:59.999 in New_York
    // Which is 2026-03-24T03:59:59.999Z (EDT)
}
```

Implementation approach: use `Intl.DateTimeFormat` to calculate the UTC offset for the given timezone and date, then construct the correct UTC timestamp. No external library needed.

### `getActivePrompts()` — Recency Suppression (`app/lib/data.ts:94-108`)

Before (broken):
```typescript
const today = new Date(dateStr || new Date().toISOString().split('T')[0])
// → 2026-03-23T00:00:00.000Z (UTC midnight)
```

After:
```typescript
const timezone = await getUserTimezoneById(userId)
const todayStr = dateStr || getTodayForUser(timezone)
const todayStart = startOfDayInTimezone(todayStr, timezone)
const suppressionStartStr = // todayStr minus RECENCY_SUPPRESSION_DAYS
const suppressionStart = startOfDayInTimezone(suppressionStartStr, timezone)
```

Query changes: `gte: suppressionStart, lt: todayStart` — now using timezone-aware boundaries.

### `getEntriesByDate()` (`app/lib/data.ts:262-290`)

Before (broken — uses server-local time):
```typescript
const start = new Date(year, month, day, 0, 0, 0, 0)
const end = new Date(year, month, day, 23, 59, 59, 999)
```

After:
```typescript
const timezone = await getUserTimezoneById(userId)
const start = startOfDayInTimezone(dateStr, timezone)
const end = endOfDayInTimezone(dateStr, timezone)
```

Signature change: add `userId` parameter (or pass timezone directly).

### `saveJournalResponse()` — Duplicate Check (`app/actions/journal.ts:92-108`)

Before (broken — uses server-local time):
```typescript
const now = new Date()
const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
```

After:
```typescript
const timezone = await getUserTimezoneById(userId)
const todayStr = getTodayForUser(timezone)
const startOfDay = startOfDayInTimezone(todayStr, timezone)
const endOfDay = endOfDayInTimezone(todayStr, timezone)
```

### REST API Routes

`/api/v1/prompts/today` and `/api/v1/stats` currently read `x-timezone` header with `DEFAULT_TIMEZONE` fallback. Change fallback to DB-stored timezone:

```typescript
const timezone = request.headers.get('x-timezone')
    || (await getUserTimezoneById(userId))
    || DEFAULT_TIMEZONE
```

## Testing Considerations

- Unit tests for `startOfDayInTimezone` / `endOfDayInTimezone` across DST boundaries
- Test recency suppression with evening entries in US timezones (the exact scenario from the bug)
- Test auto-detection: verify DB write only happens when `timezone` is null
- Test settings override: verify manual setting persists and auto-detect doesn't overwrite
