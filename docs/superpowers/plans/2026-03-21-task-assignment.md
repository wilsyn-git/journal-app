# Task Assignment Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-assigned tasks to the journal app — admin CRUD, user dashboard sidebar integration, completion tracking.

**Architecture:** New Task + TaskAssignment Prisma models with fan-out assignment. Admin pages follow existing `/admin/prompts` patterns. User-facing tasks live in the dashboard sidebar. Server actions in `app/actions/tasks.ts`.

**Tech Stack:** Next.js 16, Prisma 6/SQLite, TailwindCSS 4, Server Actions, existing toast system.

**Spec:** `docs/superpowers/specs/2026-03-21-task-assignment-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `app/actions/tasks.ts` | Server actions: createTask, updateTask, archiveTask, unarchiveTask, completeTask, uncompleteTask |
| `app/admin/tasks/page.tsx` | Admin task list with Active/Archived tabs |
| `app/admin/tasks/new/page.tsx` | Unified create+assign form |
| `app/admin/tasks/[id]/page.tsx` | Task detail: progress bar, user completion list, edit/archive |
| `app/admin/tasks/[id]/edit/page.tsx` | Edit task form (pre-filled TaskForm in edit mode) |
| `components/admin/TaskForm.tsx` | Reusable form component (create + edit modes) |
| `components/TaskSidebar.tsx` | User-facing sidebar task list (accordion cards, completion) |
| `components/TaskBanner.tsx` | Notification banner above journal ("You have 3 tasks") |
| `lib/taskConstants.ts` | Priority constants and helpers |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add Task, TaskAssignment models + reverse relations on User, Organization |
| `components/admin/AdminSidebar.tsx` | Add "Tasks" nav link |
| `app/admin/page.tsx` | Add task stat card + query |
| `app/dashboard/page.tsx` | Add TaskSidebar to sidebar content, TaskBanner to main content, fetch task data |

---

## Task 1: Schema + Constants

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/taskConstants.ts`

- [ ] **Step 1: Add Task and TaskAssignment models to schema**

Add after the ProfileRule model in `prisma/schema.prisma`:

```prisma
model Task {
  id             String           @id @default(uuid())
  organizationId String
  organization   Organization     @relation(fields: [organizationId], references: [id])
  title          String
  description    String?
  priority       Int              @default(1)
  assignmentMode String           @default("USER")
  groupId        String?
  createdById    String
  createdBy      User             @relation("TasksCreated", fields: [createdById], references: [id])
  dueDate        DateTime?
  archivedAt     DateTime?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  assignments    TaskAssignment[]

  @@index([organizationId, archivedAt])
}

model TaskAssignment {
  id          String    @id @default(uuid())
  taskId      String
  task        Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation("TaskAssignments", fields: [userId], references: [id], onDelete: Cascade)
  completedAt DateTime?
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([taskId, userId])
  @@index([userId, completedAt])
}
```

Add reverse relations to existing models:
- In `Organization` model: add `tasks Task[]`
- In `User` model: add `tasksCreated Task[] @relation("TasksCreated")` and `taskAssignments TaskAssignment[] @relation("TaskAssignments")`

**Note:** The named relation `"TaskAssignments"` is used because User already has other relations. This is a deliberate choice in the plan — use named relations consistently for both the model definition and the reverse relation.

- [ ] **Step 2: Push schema to dev database**

Run: `eval "$(fnm env)" && fnm use 22 && npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Create task constants**

Create `lib/taskConstants.ts`:

```typescript
export const PRIORITY = {
  URGENT: 0,
  NORMAL: 1,
  LOW: 2,
} as const

export type PriorityValue = typeof PRIORITY[keyof typeof PRIORITY]

export const PRIORITY_LABELS: Record<PriorityValue, string> = {
  [PRIORITY.URGENT]: 'Urgent',
  [PRIORITY.NORMAL]: 'Normal',
  [PRIORITY.LOW]: 'Low',
}

export const PRIORITY_COLORS: Record<PriorityValue, { border: string; text: string; bg: string }> = {
  [PRIORITY.URGENT]: { border: 'border-red-500', text: 'text-red-400', bg: 'bg-red-500' },
  [PRIORITY.NORMAL]: { border: 'border-primary', text: 'text-primary', bg: 'bg-primary' },
  [PRIORITY.LOW]: { border: 'border-zinc-600', text: 'text-gray-400', bg: 'bg-zinc-600' },
}

export const ASSIGNMENT_MODES = {
  USER: 'USER',
  GROUP: 'GROUP',
  ALL: 'ALL',
} as const
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `eval "$(fnm env)" && fnm use 22 && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma lib/taskConstants.ts
git commit -m "feat(tasks): add Task/TaskAssignment schema and priority constants"
```

---

## Task 2: Server Actions

**Files:**
- Create: `app/actions/tasks.ts`
- Reference: `app/actions/prompts.ts` (follow same patterns)

- [ ] **Step 1: Create server actions file**

Create `app/actions/tasks.ts` with these actions:

```typescript
'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ensureAdmin } from './helpers'
import { auth } from '@/auth'
import { resolveUserId } from '@/lib/auth-helpers'
import { PRIORITY, ASSIGNMENT_MODES } from '@/lib/taskConstants'
```

Implement these functions following the pattern from `app/actions/prompts.ts`:

**`createTask(formData: FormData)`**
- Call `ensureAdmin()`, extract organizationId via `(session?.user as any)?.organizationId`
- Parse: title, description, priority (parseInt), dueDate, assignmentMode, targetId (userId or groupId)
- Validate: title required
- Create Task record
- Fan out TaskAssignment records based on assignmentMode:
  - USER: create one assignment for targetId
  - GROUP: query group members, create assignment for each
  - ALL: query all org users, create assignment for each
- Use `prisma.$transaction` for atomicity
- `revalidatePath('/admin/tasks')` and `revalidatePath('/dashboard')`

**`updateTask(taskId: string, formData: FormData)`**
- Call `ensureAdmin()`, extract organizationId via `(session?.user as any)?.organizationId`
- Verify task belongs to org
- Update title, description, priority, dueDate
- Additive assignment logic: if assignmentMode/target provided, resolve the new target's user IDs, query existing assignment userIds for this task, compute the set difference (new users only), create TaskAssignment records only for users who don't already have one. Never remove existing assignments.
- `revalidatePath('/admin/tasks')` and `revalidatePath('/dashboard')`

**`archiveTask(taskId: string)`**
- Call `ensureAdmin()`, verify task belongs to org
- Set `archivedAt` to `new Date()`
- `revalidatePath('/admin/tasks')` and `revalidatePath('/dashboard')`

**`unarchiveTask(taskId: string)`**
- Call `ensureAdmin()`, verify task belongs to org
- Set `archivedAt` to `null`
- `revalidatePath('/admin/tasks')`

**`completeTask(assignmentId: string, notes?: string)`**
- Call `auth()`, resolve userId
- Fetch assignment with task, verify `task.organizationId === session.user.organizationId` and `assignment.userId === userId`
- Set `completedAt` to `new Date()`, save notes if provided
- `revalidatePath('/dashboard')`

**`uncompleteTask(assignmentId: string)`**
- Same auth checks as completeTask
- Set `completedAt` to `null` (preserve notes)
- `revalidatePath('/dashboard')`

- [ ] **Step 2: Verify TypeScript compiles**

Run: `eval "$(fnm env)" && fnm use 22 && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/actions/tasks.ts
git commit -m "feat(tasks): add server actions for task CRUD and completion"
```

---

## Task 3: Admin Task List Page

**Files:**
- Create: `app/admin/tasks/page.tsx`
- Modify: `components/admin/AdminSidebar.tsx` (add nav link)
- Reference: `app/admin/prompts/page.tsx` (follow patterns)

- [ ] **Step 1: Add Tasks link to AdminSidebar**

In `components/admin/AdminSidebar.tsx`, add a "Tasks" link after the "Users" link, following the existing link pattern with `linkClass()`.

- [ ] **Step 2: Create admin task list page**

Create `app/admin/tasks/page.tsx`:
- Auth check + admin role guard (same pattern as prompts page)
- Accept `searchParams` for `?tab=archived` filter
- Fetch tasks with assignment counts:
  ```typescript
  const isArchived = tab === 'archived'
  const tasks = await prisma.task.findMany({
    where: { organizationId: orgId, archivedAt: isArchived ? { not: null } : null },
    include: {
      assignments: { select: { completedAt: true } },
      createdBy: { select: { name: true } }
    },
    orderBy: isArchived
      ? [{ archivedAt: 'desc' }]
      : [{ priority: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }]
  })
  ```
- **Post-query sort for active tab:** Partition overdue tasks to the top in application code. Use timezone-aware comparison: convert `task.dueDate` to date string via `toLocaleDateString('en-CA', { timeZone })`, compare against `getTodayForUser(timezone)`. Tasks where `dueDateStr < todayStr` are overdue. Sort: overdue first, then by priority (asc), then by due date (asc).
- Render: header with Active/Archived tabs + "+ New Task" button
- Task rows with: priority left border, title, metadata line (due date, assignment info), priority label, completion count
- Overdue tasks get subtle red background tint
- Each row links to `/admin/tasks/[id]`

- [ ] **Step 3: Verify in browser**

Navigate to http://localhost:3000/admin/tasks — should render empty state "No tasks yet" with the "+ New Task" button.

- [ ] **Step 4: Commit**

```bash
git add app/admin/tasks/page.tsx components/admin/AdminSidebar.tsx
git commit -m "feat(tasks): add admin task list page with sidebar nav"
```

---

## Task 4: Admin Create Task Form

**Files:**
- Create: `app/admin/tasks/new/page.tsx`
- Create: `components/admin/TaskForm.tsx`
- Reference: `app/admin/groups/new/page.tsx`

- [ ] **Step 1: Create TaskForm component**

Create `components/admin/TaskForm.tsx` as a client component (`'use client'`):
- Props: `{ users, groups, onSubmit, initialData?, mode: 'create' | 'edit' }`
- Fields: title (text input), description (textarea), priority (segmented toggle 0/1/2), dueDate (date input), assignmentMode (segmented toggle USER/GROUP/ALL), target selector (user dropdown or group dropdown, conditional on mode)
- Assignment preview: show name pills of resolved users
- Buttons: right-justified, Cancel (link to `/admin/tasks`) | Create/Save (primary)
- Segmented toggles: `role="radiogroup"` with `role="radio"` options, `aria-checked`, keyboard arrow navigation
- All labels associated via `htmlFor`/`id`
- Use `useToast()` for success/error feedback
- Use `useTransition` for pending state on submit button
- Validation error messages use `role="alert"`

- [ ] **Step 2: Create the new task page**

Create `app/admin/tasks/new/page.tsx`:
- Server component, auth check + admin guard
- Fetch org users and groups for the form selectors
- Render TaskForm with `mode="create"` and the `createTask` action

- [ ] **Step 3: Test in browser**

Navigate to http://localhost:3000/admin/tasks/new — fill out form, create a task assigned to a user. Verify it appears on the task list.

- [ ] **Step 4: Commit**

```bash
git add components/admin/TaskForm.tsx app/admin/tasks/new/page.tsx
git commit -m "feat(tasks): add create task form with assignment targeting"
```

---

## Task 5: Admin Task Detail Page

**Files:**
- Create: `app/admin/tasks/[id]/page.tsx`

- [ ] **Step 1: Create task detail page**

Create `app/admin/tasks/[id]/page.tsx`:
- Server component, auth check + admin guard
- Fetch task with assignments and user details:
  ```typescript
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { completedAt: 'asc' }
      }
    }
  })
  ```
- Verify `task.organizationId === orgId`, else `notFound()`
- Render: back link, header (title + priority badge + metadata), Edit/Archive buttons
- Description card
- Progress bar: `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax`
- Assignment list: avatar initial, name, email, status badge (Completed green / Pending gray / Overdue red)
- Completion notes shown inline below completed users (indented, purple left border)
- Sort: completed first, then pending, then overdue
- Edit button links to `/admin/tasks/[id]/edit`
- Archive button calls `archiveTask` server action

- [ ] **Step 2: Create edit task page**

Create `app/admin/tasks/[id]/edit/page.tsx`:
- Server component, auth check + admin guard
- Fetch task by ID, verify org ownership, `notFound()` if not found
- Fetch org users and groups for the form selectors
- Render `<TaskForm mode="edit" initialData={task} />` with the `updateTask` action
- Add this file to the File Map

- [ ] **Step 3: Test in browser**

Navigate to a created task's detail page. Verify progress bar, user list, status badges render correctly. Click Edit — verify form pre-fills.

- [ ] **Step 4: Commit**

```bash
git add app/admin/tasks/[id]/page.tsx app/admin/tasks/[id]/edit/page.tsx
git commit -m "feat(tasks): add task detail and edit pages"
```

---

## Task 6: Admin Dashboard Stats

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Add task stats to admin dashboard**

In `app/admin/page.tsx`:
- Add task count queries to the existing `Promise.all` block:
  ```typescript
  prisma.task.count({ where: { organizationId, archivedAt: null } }),
  prisma.taskAssignment.count({
    where: {
      completedAt: null,
      task: { organizationId, archivedAt: null, dueDate: { lt: new Date() } }
    }
  })
  ```
  Note: The overdue count uses UTC comparison here, which is an acceptable approximation for a dashboard stat card.
- Add a stat card in the existing grid following the glass-card pattern:
  - Title: "Open Tasks"
  - Value: active task count
  - Secondary: overdue count in red (if > 0)
  - Link to `/admin/tasks`

- [ ] **Step 2: Verify in browser**

Navigate to http://localhost:3000/admin — verify task stat card appears in the grid.

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat(tasks): add task stats to admin dashboard"
```

---

## Task 7: User Dashboard — Sidebar Tasks

**Files:**
- Create: `components/TaskSidebar.tsx`
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Create TaskSidebar component**

Create `components/TaskSidebar.tsx` as a client component (`'use client'`):
- Props: `{ assignments }` — array of TaskAssignment with included Task
- Renders "TASKS" header with badge count (incomplete only)
- Compact task cards, collapsed by default, accordion expand (one at a time)
- Each card: priority-colored checkbox (rounded square), title, due date
- Expanded: description, optional notes textarea, Complete button (right-justified)
- Completed tasks at bottom: green checkmark, strikethrough, reduced opacity
- Hide completed tasks older than 2 days
- Checkbox toggles: `completeTask` / `uncompleteTask` server actions
- Accessibility: `role="checkbox"` with `aria-checked`, `aria-expanded` on cards, `aria-label` on notes textarea
- Sort: incomplete first, then by priority (asc), then by due date (soonest first)
- If no assignments, render nothing (hide entire section)

- [ ] **Step 2: Integrate into dashboard page**

In `app/dashboard/page.tsx`:
- Add task assignment query to the existing `Promise.all`:
  ```typescript
  prisma.taskAssignment.findMany({
    where: {
      userId: targetUserId,
      task: { archivedAt: null, organizationId }
    },
    include: { task: true }
  })
  ```
- Add `<TaskSidebar assignments={taskAssignments} />` to the SidebarContent, after the CalendarSidebar (line ~210) and before the user info footer (line ~213)
- Import TaskSidebar

- [ ] **Step 3: Test in browser**

Log in as a user with assigned tasks. Verify tasks appear in sidebar, expand/collapse works, completion works.

- [ ] **Step 4: Commit**

```bash
git add components/TaskSidebar.tsx app/dashboard/page.tsx
git commit -m "feat(tasks): add task sidebar to user dashboard"
```

---

## Task 8: User Dashboard — Notification Banner

**Files:**
- Create: `components/TaskBanner.tsx`
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Create TaskBanner component**

Create `components/TaskBanner.tsx` as a client component (`'use client'`):
- Props: `{ totalTasks, urgentCount }`
- Renders one-line banner: purple tint bg, "You have **N tasks** to review", urgent count if > 0
- "View in sidebar" button (scrolls sidebar to tasks section or opens hamburger on mobile)
- Dismiss X button (state managed in component via useState, persists for session)
- `role="status"` and `aria-live="polite"` on banner
- `aria-label="Dismiss task notification"` on X button
- Returns null if totalTasks === 0 or dismissed

- [ ] **Step 2: Integrate into dashboard page**

In `app/dashboard/page.tsx`:
- Calculate `incompleteTasks` and `urgentCount` from the task assignments fetched in Task 7
- Add `<TaskBanner totalTasks={incompleteTasks} urgentCount={urgentCount} />` as the first element in the main content area (before the journal form)

- [ ] **Step 3: Test in browser**

Log in as a user with tasks. Verify banner shows above journal, dismiss works, "View in sidebar" scrolls.

- [ ] **Step 4: Commit**

```bash
git add components/TaskBanner.tsx app/dashboard/page.tsx
git commit -m "feat(tasks): add task notification banner to dashboard"
```

---

## Task 9: Final Integration + Polish

**Files:**
- Various files from previous tasks

- [ ] **Step 1: Verify full TypeScript compilation**

Run: `eval "$(fnm env)" && fnm use 22 && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Test full admin flow**

1. Navigate to `/admin/tasks` — empty state
2. Create task assigned to a single user — verify redirect, task appears in list
3. Create task assigned to a group — verify fan-out (multiple assignments)
4. Create task assigned to all users — verify fan-out
5. Click into detail page — verify progress bar, user list
6. Edit task — verify changes saved, completions preserved
7. Archive task — verify it moves to Archived tab

- [ ] **Step 3: Test full user flow**

1. Log in as assigned user
2. Verify banner shows above journal
3. Verify tasks in sidebar with correct priority colors
4. Expand a task — verify description, notes field
5. Complete a task with notes — verify checkmark, strikethrough
6. Uncomplete — verify reverts, notes preserved
7. Dismiss banner — verify it stays dismissed during session

- [ ] **Step 4: Test accessibility**

1. Tab through admin create form — all fields reachable, segmented toggles navigable with arrow keys
2. Tab through sidebar tasks — checkboxes focusable, expand/collapse keyboard accessible
3. Screen reader: banner announced on load, status changes announced

- [ ] **Step 5: Test mobile**

1. Resize browser narrow
2. Verify tasks in hamburger sidebar
3. Verify banner above journal on mobile

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(tasks): final integration polish and accessibility"
```
