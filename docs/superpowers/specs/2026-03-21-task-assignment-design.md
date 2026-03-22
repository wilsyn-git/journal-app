# Admin Task Assignment — Design Spec

**Date:** 2026-03-21
**Status:** Shipped (2026-03-21)
**Problem:** Admins have no way to assign actionable directives to users within the journal app. Tasks sent via email or Slack have no visibility into completion status. Users must check a separate tool for to-dos, adding friction to their daily workflow.

---

## Solution Overview

Add a task assignment system where admins create tasks, assign them to users/groups, and track completion — all within the existing journal app. Users see tasks in the dashboard sidebar alongside their calendar, keeping the journal front and center.

---

## 1. Data Model

### Task

```prisma
model Task {
  id             String           @id @default(uuid())
  organizationId String
  organization   Organization     @relation(fields: [organizationId], references: [id])
  title          String
  description    String?
  priority       Int              @default(1) // 0=URGENT, 1=NORMAL, 2=LOW
  assignmentMode String           @default("USER") // USER, GROUP, ALL
  groupId        String?          // original group if assigned via group
  createdById    String
  createdBy      User             @relation("TasksCreated", fields: [createdById], references: [id])
  dueDate        DateTime?
  archivedAt     DateTime?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  assignments    TaskAssignment[]

  @@index([organizationId, archivedAt])
}
```

### TaskAssignment

```prisma
model TaskAssignment {
  id          String    @id @default(uuid())
  taskId      String
  task        Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  completedAt DateTime?
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([taskId, userId])
  @@index([userId, completedAt])
}
```

### Existing Model Changes

The following fields must be added to existing models:

- **User:** `tasksCreated Task[] @relation("TasksCreated")` and `taskAssignments TaskAssignment[]`
- **Organization:** `tasks Task[]`

### Priority Mapping

Priority is stored as an integer for correct sort ordering:

| Value | Label | Display Color |
|-------|-------|---------------|
| 0 | URGENT | Red |
| 1 | NORMAL | Purple |
| 2 | LOW | Gray |

Use constants in code: `const PRIORITY = { URGENT: 0, NORMAL: 1, LOW: 2 } as const`

Ascending sort (`orderBy: { priority: 'asc' }`) produces: URGENT, NORMAL, LOW — the correct order.

### Key Decisions
- **`archivedAt`** instead of hard delete — nullable timestamp. Null = active. Preserves completion history.
- **`@@index([userId, completedAt])`** for fast dashboard queries ("my incomplete tasks").
- **`@@index([organizationId, archivedAt])`** for fast admin list queries.
- **`onDelete: Cascade`** on both relations — archiving handles the soft case; if a user is deleted, their assignments go too.
- **Priority as integer** — 0/1/2 for correct database sort ordering. Display labels mapped in code.
- **`assignmentMode` + `groupId`** — records original assignment intent so admin UI can show "Wellness group (3 users)" vs "Marie" vs "All users".
- **No `isRecurring`** in v1 — deferred (needs background job infrastructure).

### Timezone Handling
Due dates are stored as `DateTime` (midnight UTC of the due day). Overdue checks convert `dueDate` to a YYYY-MM-DD string via `toLocaleDateString('en-CA', { timeZone })` and compare against `getTodayForUser(timezone)`. A task is overdue when `dueDateStr < todayStr`. This avoids timezone-related premature overdue flags.

---

## 2. Admin Pages

### 2.1 Task List — `/admin/tasks`

A list view of all tasks for the organization.

**Layout:**
- Header row: "Tasks" title + Active/Archived filter tabs + "+ New Task" button
- Task rows, each showing:
  - Left border colored by priority (red = urgent/overdue, purple = normal, gray = low)
  - Title
  - Metadata line: due date, assignment target ("Marie" / "Wellness group (3 users)" / "All users (7 users)")
  - Priority label + completion count ("1 of 3 done")
- Overdue tasks get a subtle red background tint and "OVERDUE" label
- Each row is clickable, navigates to `/admin/tasks/[id]`

**Behavior:**
- Active tab shows non-archived tasks, sorted by: overdue first, then by priority (urgent > normal > low), then by due date ascending
- Archived tab shows archived tasks, sorted by `archivedAt` descending

### 2.2 Create Task — `/admin/tasks/new`

A single-step form that creates and assigns in one action.

**Fields:**
- **Title** — required text input
- **Description** — optional textarea
- **Priority** — segmented toggle: Low | Normal (default) | Urgent. Keyboard navigable with arrow keys.
- **Due Date** — optional date picker
- **Assign To** — segmented toggle with three modes:
  - **User** — dropdown of org users
  - **Group** — dropdown of org UserGroups
  - **All Users** — no selector needed
- **Assignment preview** — shows name pills of users who will receive the task (resolves group members)

**Buttons:** Right-justified. Cancel (secondary) | Create Task (primary).

**On submit:**
- Create the Task record
- Fan out TaskAssignment records for each target user (resolve group members at creation time)
- Redirect to `/admin/tasks`
- Show success toast

**Accessibility:**
- All form labels associated via `htmlFor`/`id`
- Segmented toggles use `role="radiogroup"` with `role="radio"` on each option, `aria-checked`, and arrow key navigation
- Focus ring on all interactive elements
- Error messages use `role="alert"`

### 2.3 Task Detail — `/admin/tasks/[id]`

Shows task details and per-user completion status.

**Layout:**
- Back link to `/admin/tasks`
- Header: title, priority badge, metadata (created date, due date, assignment target)
- Edit and Archive buttons (top-right)
- Description card
- Progress bar: visual bar + "1 of 3" text
- Assignment list: user rows showing:
  - Avatar initial circle
  - Name and email
  - Status badge: Completed (green checkmark + timestamp) / Pending (gray) / Overdue (red)
  - Completion notes shown inline below completed users (indented with purple left border)

**Sorting:** Completed users first, then pending, then overdue.

**Edit:** Opens the same form as create, pre-filled. Existing completions are preserved. Assignment changes are **additive only** — new users are added but existing assignments are never removed via edit. To remove a specific user's assignment, the admin would archive the task and create a new one. This avoids accidentally discarding completion data.

**Archive:** Sets `archivedAt` to now. Users no longer see the task. Task moves to Archived tab on list page. Reversible (unarchive from detail page when viewing archived tasks).

**Accessibility:**
- Progress bar has `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax` (total assignments)
- Status badges are not color-only — text labels ("Completed", "Pending", "Overdue") always present
- Assignment list uses semantic markup (not just styled divs)

---

## 3. User Dashboard Integration

### 3.1 Sidebar Tasks Section

Tasks appear in the existing sidebar, below the calendar, above the user info section.

**Layout:**
- Section header: "TASKS" label + badge count (e.g., "3")
- Compact task cards, collapsed by default:
  - Priority-colored checkbox (rounded square, not circle — distinguishes from priority dot)
  - Title (truncated with ellipsis)
  - Due date + priority label in small text below
- Click to expand inline (accordion — only one expanded at a time):
  - Shows description text
  - Optional "Completion notes" textarea (placeholder: "Completion notes (optional)")
  - "Complete" button (right-justified)
- Completed tasks shown at bottom: green checkmark, strikethrough title, reduced opacity

**Behavior:**
- Tasks sorted by: urgent first, then by due date (soonest first), then normal, then low
- Completing a task: server action fires, checkbox fills with green checkmark, task slides to bottom with strikethrough and fade
- Un-completing: click the green checkbox to revert (sets `completedAt` back to null)
- Completed tasks from more than 2 days ago are hidden from sidebar

**Empty state:** If the user has no task assignments, the Tasks section is hidden entirely — no empty "TASKS (0)" header. The banner also does not show.

**Accessibility:**
- Checkboxes use `role="checkbox"` with `aria-checked`
- Expand/collapse uses `aria-expanded` on the task card
- Completion notes textarea has `aria-label="Completion notes for [task title]"`
- Task section has `aria-label="Tasks"`

### 3.2 Notification Banner

A one-line banner at the top of the main content area when the user has incomplete tasks.

**Layout:**
- Purple tint background with purple border (matches app accent)
- Left: dot indicator + "You have **3 tasks** to review" + "1 urgent" in muted text
- Right: "View in sidebar" link + dismiss (X) button

**Behavior:**
- Only shows when there are incomplete (non-archived) task assignments for this user
- "View in sidebar" scrolls the sidebar to the tasks section (or opens the hamburger menu on mobile)
- Dismiss hides the banner for the current session (state managed in a client component within DashboardShell so it persists across page navigations)
- Does not show if all tasks are completed

**Accessibility:**
- Banner has `role="status"` and `aria-live="polite"` so screen readers announce it on load
- Dismiss button has `aria-label="Dismiss task notification"`
- "View in sidebar" is a proper `<button>` or `<a>`, not a styled div

### 3.3 Mobile

- Tasks appear in the hamburger sidebar drawer (existing DashboardShell pattern), same compact format
- Banner appears above journal content on mobile, same as desktop
- "View in sidebar" opens the hamburger menu

---

## 4. The Reflection Bridge

On task completion, the optional notes textarea is the connection between tasks and journaling.

**v1 behavior:** Notes are stored on the `TaskAssignment.notes` field. Admin can see them on the task detail page. Notes are standalone — they do not automatically create a JournalEntry.

**Future consideration (v2):** A toggle "Add to today's journal?" that creates a JournalEntry linked to a special "Task Reflection" prompt. Deferred because it requires a new prompt type and changes to the journal entry model.

---

## 5. Server Actions

All task actions live in `app/actions/tasks.ts`:

- `createTask(formData)` — creates Task + fans out TaskAssignments. Requires admin.
- `updateTask(taskId, formData)` — updates task fields. Existing completions preserved. Requires admin.
- `archiveTask(taskId)` — sets `archivedAt`. Requires admin.
- `unarchiveTask(taskId)` — clears `archivedAt`. Requires admin.
- `completeTask(assignmentId, notes?)` — sets `completedAt` to now, optionally saves notes. Requires authenticated user who owns the assignment.
- `uncompleteTask(assignmentId)` — clears `completedAt` but preserves notes. Requires authenticated user who owns the assignment.

All actions validate org membership. Admin actions use `ensureAdmin()` from `app/actions/helpers.ts`. User-facing actions (`completeTask`, `uncompleteTask`) must verify `task.organizationId === session.user.organizationId` in addition to assignment ownership to prevent cross-org access.

---

## 6. Data Queries

### Dashboard (user-facing)
```typescript
// Fetch user's incomplete + recently completed task assignments
const assignments = await prisma.taskAssignment.findMany({
  where: {
    userId,
    task: {
      archivedAt: null,
      organizationId
    }
  },
  include: {
    task: true
  }
})

// Sort in application code: incomplete first, then by priority (asc), then due date
const sorted = assignments.sort((a, b) => {
  // Incomplete before completed
  if (!a.completedAt && b.completedAt) return -1
  if (a.completedAt && !b.completedAt) return 1
  // By priority (lower number = higher priority)
  if (a.task.priority !== b.task.priority) return a.task.priority - b.task.priority
  // By due date (soonest first, null last)
  if (a.task.dueDate && !b.task.dueDate) return -1
  if (!a.task.dueDate && b.task.dueDate) return 1
  if (a.task.dueDate && b.task.dueDate) return a.task.dueDate.getTime() - b.task.dueDate.getTime()
  return 0
})
```

### Admin task list
```typescript
const tasks = await prisma.task.findMany({
  where: {
    organizationId,
    archivedAt: null  // or { not: null } for archived tab
  },
  include: {
    assignments: { select: { completedAt: true } },
    createdBy: { select: { name: true } }
  },
  orderBy: [
    { priority: 'asc' },    // urgent first
    { dueDate: 'asc' },     // soonest due first
    { createdAt: 'desc' }
  ]
})
// Overdue tasks sorted to top in application code using timezone-aware date comparison
```

### Admin task detail
```typescript
prisma.task.findUnique({
  where: { id: taskId },
  include: {
    assignments: {
      include: {
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { completedAt: 'asc' }
    }
  }
})
```

---

## 7. Admin Dashboard Integration

Add a task summary card to the existing admin dashboard (`/admin/page.tsx`):
- "Open Tasks" count
- "Overdue" count (in red if > 0)
- Clickable, navigates to `/admin/tasks`

Add "Tasks" link to the admin sidebar navigation (`AdminSidebar.tsx`).

---

## 8. What Does NOT Change

- Journal prompt system (selection, rotation, recency suppression)
- Existing dashboard layout (tasks are additive, sidebar section + banner)
- User profile, settings, or stats pages
- Authentication model
- Database schema for existing models (additive only — new Task + TaskAssignment tables)

---

## 9. Testing Strategy

1. **Admin flow:** Create task with each assignment mode (user, group, all). Verify assignments fan out correctly.
2. **Edit/archive:** Edit a task after some users complete it — verify completions preserved. Archive and verify users no longer see it.
3. **User flow:** Log in as assigned user, verify task appears in sidebar and banner. Complete with notes. Verify checkmark, strikethrough, notes saved.
4. **Overdue:** Create a task with past due date, verify overdue styling on both admin and user side.
5. **Accessibility:** Tab through all admin forms, verify keyboard navigation on segmented toggles, verify screen reader announcements on banner and status changes.
6. **Mobile:** Verify tasks appear in hamburger sidebar, banner shows above journal.
