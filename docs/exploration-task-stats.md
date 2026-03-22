# Exploration: Task Stats Enhancement

**Date:** 2026-03-21
**Status:** Exploration (next session)

---

## Current State

- **Admin dashboard** — single stat card: "Open Tasks" count + overdue count
- **Admin task list** — per-task assignment pills with completion checkmarks
- **Admin task detail** — progress bar + per-user completion status
- **User stats page** — no task data at all (only journal habit streaks)

## Proposed Additions

### Admin Dashboard (`/admin`) — add completion rate card
- Second stat card: "Completion Rate" showing org-wide % of completed assignments
- Cheap query: `completed / total` from TaskAssignment
- High visibility, low effort

### User Stats Page (`/stats`) — add "Tasks" section
- Completed count (total tasks this user has finished)
- Completion rate (% of assigned tasks completed)
- Simple, no new infrastructure needed

### Deferred (v2)
- **Admin tasks page** — summary bar with completions-per-week bar chart
- **Admin task detail** — per-user time-to-complete, on-time vs late breakdown
- **User stats** — task completion streak, average response time
- **Priority impact** — compare completion rates across urgent/normal/low

## Data Available

All stats can be derived from the existing `TaskAssignment` model:
- `completedAt` (null = pending, set = done) for completion rates
- `completedAt - createdAt` for time-to-complete
- `completedAt vs task.dueDate` for on-time analysis
- `task.priority` for priority-based breakdowns
