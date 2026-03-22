# iOS Native App — REST API Design Spec

## Motivation

The journal app currently runs as a PWA from the iOS home screen. A native iOS app unlocks:

- **Push notifications** — streak protection reminders and task assignment alerts
- **Offline journaling** — write entries without connectivity, sync when back online
- **Native UX** — smoother animations, better feel than a webapp

The user (Sam) is comfortable with SwiftUI. His wife is the primary daily user.

## Approach

Add a REST API layer (`/api/v1/`) to the existing Next.js app. No separate service — the API wraps existing Prisma models and reuses the same data access logic that server actions use. Deploys on the same EC2 instance.

The iOS app is a separate SwiftUI project (not part of this codebase) that consumes this API.

## Scope (MVP)

### In Scope

- REST API with JWT auth + server-side refresh tokens
- Journal: view today's prompts, submit entries, browse history
- Tasks: view assigned tasks, mark complete with notes
- Stats: streaks, heatmap, badges, habit consistency
- Offline: prompt cache, entry queue, task cache
- Push notifications: streak protection, task assignment
- Admin: view/revoke device sessions per user

### Out of Scope (v1)

- Settings, password, profile management (web only)
- Word cloud, trend charts (web only)
- Admin functions from iOS
- Liked/favorited entries management
- Service worker improvements for the PWA

## Authentication

### Token Model

- **Access token:** Short-lived JWT (~1 hour), includes userId and orgId
- **Refresh token:** Long-lived (~30 days), stored server-side (hashed), enables silent re-auth
- Tokens stored in iOS Keychain on the device

### Login Flow

1. App opens → splash screen
2. First launch: login screen (email + password)
3. POST `/api/v1/auth/login` → returns `{accessToken, refreshToken, expiresIn}`
4. Tokens saved to Keychain
5. App fetches `/prompts/all` to populate offline cache
6. App registers APNs device token via POST `/devices`
7. User lands on main view

### Subsequent Launches

1. Splash screen
2. Check Keychain for tokens
3. Access token valid → main view
4. Access token expired → POST `/auth/refresh` → new access token → main view
5. Refresh token expired or revoked → login screen

### Session Revocation

- Admin can revoke device sessions from the web UI (per-session or all sessions for a user)
- Revocation sets `revokedAt` on the `DeviceSession` record
- Next API call returns 401 → iOS app clears Keychain → login screen
- Any 401 from any endpoint triggers this same re-login flow in the app

## API Endpoints

Base path: `/api/v1/`

All endpoints except `/auth/login` require `Authorization: Bearer <accessToken>` header.

### Auth

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/auth/login` | Authenticate with email + password, return tokens |
| POST | `/auth/refresh` | Exchange refresh token for new access + rotated refresh token |
| POST | `/auth/logout` | Invalidate refresh token / revoke device session |

**POST `/auth/login`**
- Request: `{email, password, deviceName}`
- Response: `{accessToken, refreshToken, expiresIn, user: {id, name, email}}`
- Validates credentials via bcrypt (same as existing NextAuth flow)
- Creates a `DeviceSession` record server-side

**POST `/auth/refresh`**
- Request: `{refreshToken}`
- Response: `{accessToken, refreshToken, expiresIn}` (rotated refresh token)
- Refresh token rotation: each use invalidates the old token and issues a new one
- Returns 401 if refresh token is expired, revoked, or already used (replay detection)

**POST `/auth/logout`**
- Request: `{refreshToken}`
- Sets `revokedAt` on the DeviceSession
- iOS app calls this when user taps "Sign Out", then clears Keychain

### Prompts

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/prompts/today` | Today's selected prompts for the authenticated user |
| GET | `/prompts/all` | All active prompts, categories, and profile rules (for offline cache) |

**GET `/prompts/today`**
- Runs the same deterministic selection algorithm (seeded by userId + date)
- Response: array of prompts with `{id, content, type, options, categoryName}`

**GET `/prompts/all`**
- Returns everything needed to run prompt selection offline
- Response: `{prompts, categories, profileRules, effectiveProfileIds}`
- `effectiveProfileIds` includes the user's direct profiles + group-inherited profiles (needed by the selection algorithm)
- Category names resolved from the relation, not the legacy `categoryString` field
- iOS app caches this in SwiftData

### Journal Entries

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/entries?date=YYYY-MM-DD` | Entries for a specific date |
| GET | `/entries?from=YYYY-MM-DD&to=YYYY-MM-DD` | Entries in a date range |
| POST | `/entries` | Create or update a single entry |
| POST | `/entries/batch` | Sync multiple offline entries |

**POST `/entries`**
- Request: `{promptId, answer, date}` where `date` is a `YYYY-MM-DD` string
- Upsert logic: queries by userId + promptId + createdAt within the day range (matching existing `saveJournalResponse()` behavior)
- Note: The `date` field on JournalEntry is a DateTime, not a date string. The API normalizes the incoming date to match the existing createdAt-range query pattern used by the web app. A future migration may clean up the date field, but the API abstracts this from clients.

**POST `/entries/batch`**
- Request: `{entries: [{promptId, answer, date, updatedAt}]}`
- Processes each as an upsert
- Returns: `{synced: number, errors: [{promptId, date, error}]}`
- Key for offline sync — iOS app queues entries and posts them all when connectivity returns

### Tasks

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/tasks` | Active tasks assigned to the user |
| PATCH | `/tasks/assignments/:assignmentId/complete` | Mark task assignment complete |

**GET `/tasks`**
- Returns tasks assigned to user (via TaskAssignment) that are not archived
- Response is a flattened join: `{taskId, assignmentId, title, description, priority, dueDate, completedAt, notes}`
- `taskId` is the Task record; `assignmentId` is the TaskAssignment record (used for the complete endpoint)

**PATCH `/tasks/assignments/:assignmentId/complete`**
- Request: `{notes?: string}`
- Sets `completedAt` on the TaskAssignment (matches existing `completeTask()` which takes an assignmentId)
- Idempotent: if already completed, returns success without modifying
- Queued offline if no connectivity

### Stats

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/stats` | User's stats for the MVP subset |

**GET `/stats`**
- Response: `{currentStreak, maxStreak, totalEntries, daysCompleted, avgWords, heatmap, badges, taskStats}`
- Computed server-side using the same `getUserStats()` logic
- Excludes word cloud and trend charts (web only for v1)
- Cached on iOS for offline viewing

### Device Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/devices` | Register APNs device token |
| DELETE | `/devices/:token` | Unregister device token |

**POST `/devices`**
- Request: `{deviceToken, deviceName}`
- Associates the APNs token with the user's DeviceSession
- Called on login and whenever the APNs token refreshes

## Database Changes

### New Model: DeviceSession

```prisma
model DeviceSession {
  id           String    @id @default(uuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceToken  String?
  refreshToken String    @unique
  deviceName   String
  lastActiveAt DateTime  @default(now())
  createdAt    DateTime  @default(now())
  revokedAt    DateTime?

  @@index([userId])
  @@index([refreshToken])
}
```

- `refreshToken` is stored hashed (SHA256)
- `revokedAt` null = active session; set = revoked by admin or user logout
- `deviceToken` is the APNs token for push notifications (nullable — user may deny push permission)
- `deviceName` is user-facing (e.g., "Sam's iPhone")
- Cascade delete: removing a user cleans up their sessions

### User Model Addition

Add relation to User model:

```prisma
deviceSessions DeviceSession[]
```

## Push Notifications

### Infrastructure

- Server sends directly to APNs (Apple Push Notification service) — no Firebase needed for iOS-only
- Use `apn` or `@parse/node-apn` npm package
- Requires Apple Developer account, APNs key (.p8 file), team ID, bundle ID

### Triggers

**Streak Protection:**
- Cron job runs in the evening (configurable per user timezone)
- Checks if user has any entries today
- If no entries AND active streak > 1 day:
  - Push: "Don't break your {X}-day streak — take a minute to journal today."
- Runs via PM2 cron or node-cron within the Next.js process

**Task Assigned:**
- When `createTask()` server action completes, look up assigned users' device tokens
- Push: "New task: {title}"
- Triggered inline, not via cron

### Notification Payload

```json
{
  "aps": {
    "alert": {
      "title": "myJournal",
      "body": "Don't break your 12-day streak..."
    },
    "sound": "default",
    "badge": 1
  },
  "type": "streak_reminder | task_assigned",
  "taskId": "optional-for-deep-linking"
}
```

## Offline Strategy

### Prompt Cache

- On app open with connectivity: GET `/prompts/all` → store in SwiftData
- Prompts, categories, and profile rules cached locally
- The deterministic selection algorithm (seeded SHA256 of userId + dateStr) runs client-side
- Same prompts shown regardless of connectivity
- **Recency suppression caveat:** The server-side algorithm suppresses prompts shown in the last 4 days by querying recent entries. When offline, the iOS app applies the same suppression using locally cached entries. If the cache is stale (e.g., entries submitted on web aren't synced yet), the offline selection may differ slightly from what the server would pick. This is acceptable — the prompts will still be valid, just potentially less varied.

### Entry Queue

- Journal entries saved to SwiftData immediately as user types
- Each queued entry: `{promptId, answer, date, updatedAt, synced: bool}`
- When connectivity available: POST `/entries/batch` with all unsynced entries
- Server upserts — last write wins on conflicts (rare with single-user-per-device)
- Mark entries as synced on success

### Task Cache

- Active tasks cached in SwiftData on each fetch
- Task completions queued offline with timestamp
- Synced via PATCH when online
- If task was already completed on web, server ignores (idempotent)

### Stats Cache

- Stats fetched fresh when online, stored in SwiftData
- Displayed from cache when offline
- Not computed locally — server-side only

## Admin UI Changes

### User Management — Device Sessions

On the existing user management page, add per-user:

- **Active Sessions** section showing:
  - Device name
  - Last active timestamp
  - Created timestamp
- **Revoke** button per session
- **Revoke All** button per user

Revoking sets `revokedAt = now()` — does not delete the record (audit trail).

## Security Considerations

- Refresh tokens hashed before storage (never stored in plaintext)
- Access tokens are stateless JWTs validated on every request
- All API routes validate the access token and extract userId from it
- Rate limiting on `/auth/login` to prevent brute force (429 with `Retry-After` header)
- APNs device tokens are per-device, per-user — revocation clears push capability
- All endpoints scoped to the authenticated user's data only (no cross-user access)

## Error Responses

Standard error format across all endpoints:

```json
{
  "error": {
    "code": "UNAUTHORIZED | NOT_FOUND | VALIDATION_ERROR | RATE_LIMITED | INTERNAL_ERROR",
    "message": "Human-readable description"
  }
}
```

- 401: Invalid/expired token → iOS app triggers re-login
- 403: Valid token but insufficient permissions
- 422: Validation error (missing fields, invalid format)
- 429: Rate limited (login attempts) — includes `Retry-After` header
- 500: Server error

## Timezone Handling

The existing web app reads timezone from a browser cookie (`user-timezone`). The iOS app sends timezone via a `X-Timezone` request header (e.g., `America/Chicago`). API endpoints that need timezone-sensitive computation (stats, prompts/today, streak checks) read from this header, falling back to the user's stored timezone preference or `America/New_York` as a default.

The iOS app sets this header automatically from `TimeZone.current.identifier`.

## Notes

- `isLiked` is returned on journal entries as a read-only field. The iOS app displays it but cannot toggle it (out of scope for v1).
- Prompt `type` includes TEXT, RADIO, CHECKBOX, and RANGE. The stats endpoint excludes RANGE trend data for v1, but the prompts endpoints return all types so entries can still be submitted for RANGE prompts.
- The `POST /entries/batch` endpoint uses simple "last write wins" — it does not compare `updatedAt` timestamps. The `updatedAt` field in the batch request is stored on the entry but not used for conflict resolution. This is acceptable given single-user-per-device usage.
