# Exploration: Admin Task Assignment Feature

**Date:** 2026-03-21
**Status:** Exploration (no implementation planned yet)

---

## Concept

Give admins the ability to assign tasks to users, displayed on the user's dashboard alongside their journal prompts. Tasks would have priority levels — urgent, normal, low.

## How This Fits the Existing Architecture

Prompts and Tasks are fundamentally different and should remain separate models.

**Prompts** are reflective questions — configured once, served daily via profile/rule rotation, answered through text/checkbox inputs. Impersonal, no urgency, no deadlines.

**Tasks** are directive actions — they have an assignee, a deadline, a completion state, and a priority. Inherently personal ("Sam, do this by Friday").

Shoehorning tasks into the Prompt model would be a mistake. The profile/rule/category system that governs prompt rotation has no meaningful application to tasks. Tasks should be a separate model with their own assignment, completion, and querying logic.

## Data Model

```
model Task {
  id             String    @id @default(uuid())
  organizationId String
  organization   Organization @relation(...)
  title          String
  description    String?
  priority       String    @default("NORMAL")  // URGENT, NORMAL, LOW
  createdById    String
  createdBy      User      @relation("TasksCreated", ...)
  dueDate        DateTime?
  isRecurring    Boolean   @default(false)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  assignments    TaskAssignment[]
}

model TaskAssignment {
  id          String    @id @default(uuid())
  taskId      String
  task        Task      @relation(...)
  userId      String
  user        User      @relation(...)
  completedAt DateTime?
  notes       String?   // optional completion notes
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@unique([taskId, userId])
}
```

### Key Decisions
- **Separate assignment table** — one Task maps to many users (via group fan-out at creation), each with their own completion state
- **Priority as string enum** — URGENT/NORMAL/LOW matches existing role pattern. Three levels is enough for journaling context.
- **No `isActive`** — tasks are temporal (created, completed, archived), unlike prompts which live forever

## Dashboard Integration

**Recommended: separate section, not interleaved with prompts.**

- Prompts and tasks have different interaction models (type to answer vs click to complete). Mixing them creates confusing UX.
- Urgent tasks above the journal form ("see this before you start journaling")
- Normal/low tasks below the form or in the sidebar
- Sidebar is an interesting option: calendar looks backward, tasks look forward

**Admin side:** `/admin/tasks` page following existing CRUD patterns. Task stat card on admin dashboard ("12 open tasks, 3 overdue").

## Completion Tracking

- Checkbox/toggle on the task card fires `completeTask(assignmentId)` server action
- Allow un-completing (mistakes happen)
- Optional completion notes — "What did you learn?" bridges tasks and journaling
- Do NOT tie task completion to journal entry submission — they are independent workflows

## Notification Strategy

- **v1: In-app only.** Badge count ("3 tasks"), visual styling for overdue (red text)
- **Later: Email for urgent tasks only** via existing AWS SES infrastructure
- No daily nag emails. No notification preference system in v1.

## Value Proposition

Users already open this app daily to journal. Co-locating tasks eliminates friction of checking a second app. Admin already controls what questions users answer; now they also control what actions users take.

## The Reflection Bridge

The key differentiator from a generic todo app. On task completion, offer a toggle: "Add completion notes to today's journal?" This pipes the completion context into a JournalEntry, bridging directive action and personal reflection. Without this, tasks are just checkboxes — with it, they become structured journaling prompts tied to real actions.

## UX Principles

**Journaling is calm. Tasks must not introduce productivity anxiety.**

- **Sidebar placement:** Tasks go in the existing sidebar, below the calendar. Calendar looks backward (history), tasks look forward (obligations). Same sidebar, two time directions.
- **Urgency styling:** Subtle glow effect or soft left-border accent for urgent tasks — not harsh red. Match the app's glassmorphism aesthetic.
- **Low priority:** De-emphasized with reduced opacity until hovered.
- **Completion:** Server action, no page reload. Smooth transition (fade/slide) on check-off.
- **Mobile:** Tasks appear in the existing hamburger menu sidebar, not a separate drawer.

## Admin Assignment Flow

Three assignment modes:
- **Single user** — admin picks a user from dropdown
- **Group** — admin picks a UserGroup, assignments fan out at creation time (not lazily)
- **All users** — fan out to all org members at creation time

Admin sees a completion matrix: task rows x user columns with completed/pending status. Filter by overdue, by user, by group.

## Scope Boundaries

### Build (v1)
- Separate Task + TaskAssignment models
- Admin CRUD at `/admin/tasks`
- Assignment to individual users or fan-out from groups
- Dashboard display as separate section
- Simple checkbox completion with optional notes
- In-app indicators for overdue/urgent

### Defer (v2)
- Recurring tasks (needs background job infrastructure)
- Email notifications
- Task types / module pattern

### Avoid
- Subtasks, dependencies, kanban
- User-created tasks (admin-only keeps it organizational)
- Coupling task completion with journal submission
- Anything that makes this a project management tool

### Litmus Test
If an admin would currently send this directive via email/Slack and then have no visibility into whether it was done, the in-app task is valuable. If it needs collaboration, threads, or file attachments, it belongs in Asana.
