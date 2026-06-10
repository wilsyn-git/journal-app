# Task Completion → Admin Acknowledgement → User Confirmation → Next-Day Archive

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation plan

## Summary

Today, completing a task only sets `TaskAssignment.completedAt`. Nothing surfaces the
completion to an admin, and nothing ever archives the task — completed tasks linger
indefinitely in both the admin list and the user dashboard.

This feature adds a lightweight acknowledgement workflow:

1. A user completes a task → it appears in an **in-app queue** on the admin home, with a
   count **badge** in the admin nav.
2. An admin **acknowledges** the completion (optionally attaching a short note).
3. The user sees a **toast popup** on their next dashboard load confirming the
   acknowledgement (shown exactly once), including the admin's note if present.
4. The task **auto-archives the next day** — lazily, the first time anyone loads the
   admin tasks page or the user dashboard on a new day.

## Goals

- Give admins visibility into completed tasks and an explicit sign-off step.
- Close the loop back to the user so they know their completion was seen.
- Stop completed tasks from accumulating forever — archive them a day after sign-off.
- Reuse existing infrastructure (toast system, per-user timezone helpers, `Task.archivedAt`).
- Ship as pure app code — **no new scheduler / cron / prod infra.**

## Non-Goals

- No iOS push to the admin (in-app queue + badge only).
- No realtime/websocket/polling — everything remains server-rendered, surfaced on next load.
- No dedicated multi-assignee acknowledgement UI. Tasks are effectively single-assignee in
  practice; multi-assignee is handled by a safe rule (archive only once **all** assignees are
  acknowledged) but gets no special UI.
- No email notifications.

## Design Decisions (resolved during brainstorming)

| Decision | Choice |
| --- | --- |
| Admin notification channel | In-app queue + count badge (no push) |
| Multi-assignee archive | Optimize for single-assignee; archive whole task once **all** assignments acknowledged |
| User popup | Existing toast + **optional admin note** |
| Archive trigger | **Lazy on next visit** (no scheduler exists on the EC2 box; pure app code) |
| Acknowledgement state storage | Fields on `TaskAssignment` (not a new model) |

## Data Model

Extend **`TaskAssignment`** (`prisma/schema.prisma`). Completion already lives here, so the
acknowledgement state belongs alongside it.

New fields (all nullable, additive — no data migration of existing rows needed):

```prisma
model TaskAssignment {
  // ...existing fields: id, taskId, userId, completedAt, notes, createdAt, updatedAt
  acknowledgedAt       DateTime?   // set when an admin acknowledges this completion
  acknowledgedById     String?     // the admin (User.id) who acknowledged
  acknowledgementNote  String?     // optional short message shown to the user
  userNotifiedAt       DateTime?   // set once the user's confirmation toast has been shown
}
```

`Task.archivedAt` is **unchanged** — it remains the archive flag; this feature simply sets it
automatically (in addition to the existing manual archive button).

Add an index to keep the admin-queue and user-toast queries cheap:

```prisma
@@index([acknowledgedAt])           // user-toast query: acknowledgedAt != null, userNotifiedAt == null
// completedAt is already covered for the queue query via existing [userId, completedAt] index;
// the admin queue filters by org through the Task relation.
```

Migration: forward-only `prisma migrate` adding nullable columns. Safe for prod (no backfill).

### Assignment lifecycle

```
pending            completedAt == null
  → completed      completedAt set            → enters admin queue
  → acknowledged   acknowledgedAt set         → leaves admin queue, queues user toast
  → user-notified  userNotifiedAt set         → toast shown once
  → (next day)     Task.archivedAt set        → disappears from admin list + dashboard
```

## Component 1 — Completion → Admin Queue

`completeTask()` (`app/actions/tasks.ts:236`) is **unchanged** — it already sets `completedAt`.

The "queue" is a query, not a stored list. For the admin's org:

```
TaskAssignment where:
  completedAt   != null
  acknowledgedAt == null
  task.archivedAt == null
  task.organizationId == orgId
include: task (title), user (name)
order by completedAt asc
```

**Surfacing:**

- **Admin home (`app/admin/page.tsx`):** a new "Completions awaiting acknowledgement" card
  listing each pending item — user name, task title, completed-at, and an **Acknowledge**
  control (button + optional note input). Empty state hides the card or shows "All caught up."
- **Admin nav (`components/admin/AdminSidebar.tsx` — confirm exact path during planning):** a
  count badge on the **Tasks** item showing the number of pending acknowledgements, so it's
  visible from any admin page.

## Component 2 — Admin Acknowledges

New server action in `app/actions/tasks.ts`:

```ts
acknowledgeCompletion(assignmentId: string, note?: string)
```

- **Auth:** admin-role-guarded (mirror the existing admin action guards; reject non-admins).
- **Effect:** sets `acknowledgedAt = new Date()`, `acknowledgedById = session.user.id`, and
  `acknowledgementNote = note?.trim() || null`.
- **Validation:** the assignment must belong to the admin's org and be completed
  (`completedAt != null`); ignore/no-op if already acknowledged.
- **Revalidate:** `/admin` (and `/admin/tasks`). The user's toast surfaces on their next
  dashboard load — no cross-user revalidation needed.

## Component 3 — User Confirmation Popup

On dashboard load (`app/dashboard/page.tsx`), query the current user's assignments where
`acknowledgedAt != null AND userNotifiedAt == null` (and task not archived), including task
title and acknowledger name.

A small client component — mirroring `components/AchievementToasts.tsx` — receives those
pending confirmations and, on mount:

1. Fires one toast per item via the existing `ToastProvider` (`success` type):
   `"{adminName} acknowledged your completion of “{taskTitle}” ✅"`, with the
   note appended on a second line when present.
2. Calls a new server action `markAcknowledgementsSeen(assignmentIds: string[])` that stamps
   `userNotifiedAt = new Date()` (scoped to the current user) so each confirmation shows
   exactly once.

No new toast UI is needed — reuse `ToastProvider` and the `AchievementToasts` pattern.

## Component 4 — Next-Day Auto-Archive (Lazy)

A new helper, e.g. `archiveAcknowledgedTasks(orgId)` in `app/actions/tasks.ts` (or a small
`lib/tasks/archive.ts`), runs at the **top of the data-loading path** for both:

- the admin tasks page (`app/admin/tasks/page.tsx`), and
- the user dashboard (`app/dashboard/page.tsx`).

Whichever loads first on a new day performs the archive; the other is then a no-op.

**Archive rule (per task):** set `Task.archivedAt = new Date()` when **every** assignment of
the task satisfies:

- `acknowledgedAt != null`, **and**
- `acknowledgedAt < startOfToday(in that assignee's timezone)`.

i.e. all assignees are acknowledged **and** the most recent acknowledgement is before the
current local day. For the common single-assignee case this is simply: "acknowledged, and it
happened before today."

**Timezone:** use `lib/timezone.ts` — for each assignment, resolve the assignee's timezone
(`getUserTimezoneById(userId)`, default `America/New_York`), compute
`startOfDayInTimezone(getTodayForUser(tz), tz)`, and compare `acknowledgedAt` against it. This
matches the app's existing daily-reset / streak boundaries. (Single-assignee → one timezone;
multi-assignee → each assignment checked against its own assignee's day.)

The helper should be cheap: filter candidate tasks to those that are unarchived and have at
least one acknowledged assignment before doing per-assignee timezone math.

## Edge Cases

- **Un-complete after acknowledgement:** once `acknowledgedAt` is set, `uncompleteTask()`
  (`app/actions/tasks.ts:263`) must refuse (the completion has been signed off). Return a clear
  error; the UI should reflect that an acknowledged task can't be un-completed.
- **Same-day double archive:** guarded by `archivedAt == null` filter — archiving is idempotent.
- **Note length:** cap `acknowledgementNote` (e.g. 280 chars) and trim; empty → null.
- **Acknowledged but un-completed earlier in the flow:** acknowledgement requires
  `completedAt != null`; the action no-ops otherwise.
- **Manual archive still works:** the existing admin archive button is untouched; auto-archive
  just sets the same field.

## Testing

Vitest (existing `npm test`). Focus on pure/unit-testable logic:

- `archiveAcknowledgedTasks`: archives a single-assignee task acknowledged yesterday; does
  **not** archive one acknowledged today; does **not** archive a multi-assignee task until all
  assignments are acknowledged-before-today; respects per-assignee timezone boundaries.
- `acknowledgeCompletion`: sets fields; rejects non-admin; no-ops on already-acknowledged or
  not-completed; enforces org scoping; trims/caps note.
- `markAcknowledgementsSeen`: stamps `userNotifiedAt`; scoped to current user; idempotent.
- `uncompleteTask`: refuses when acknowledged.

Component rendering (admin queue card, user toast trigger) verified manually on the dev server
plus the existing component-test patterns where they exist.

## Assumptions to confirm during planning

- Exact admin sidebar component path/structure for the badge (`components/admin/AdminSidebar.tsx`
  per earlier exploration — verify).
- Whether the admin home card or the `/admin/tasks` rows is the better acknowledge surface — the
  design puts the queue on admin home; inline acknowledge on `/admin/tasks` rows can be added if
  desired, but is out of scope unless requested.
- Confirm `markAcknowledgementsSeen` runs reliably (client effect → server action) without a
  flash; fall back to stamping `userNotifiedAt` during the server render if the effect proves
  flaky.
