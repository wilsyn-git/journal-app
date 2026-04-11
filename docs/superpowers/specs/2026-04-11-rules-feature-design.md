# Rules Feature — Design Spec

**Date:** 2026-04-11
**Status:** Approved

---

## Overview

A habit-tracking system where admins create rules organized by type (Daily, Weekly, custom intervals), assign them to users via fan-out (USER/GROUP/ALL), and users check them off each period. Streaks are tracked per-rule and per-type to motivate consistent compliance.

## Data Model

### RuleType

Admin-defined categories with reset schedules. Scoped to organization.

| Field | Type | Notes |
|-------|------|-------|
| id | String (uuid) | PK |
| name | String | e.g., "Daily", "Weekly", "Traveling" |
| description | String? | Optional explanation |
| resetMode | String | `DAILY`, `WEEKLY`, or `INTERVAL` |
| resetDay | Int? | Day of week for WEEKLY (0=Sunday). Null otherwise. |
| resetIntervalDays | Int? | For INTERVAL mode (e.g., every 3 days). Null otherwise. |
| resetIntervalStart | DateTime? | Start date for INTERVAL period counting. Null otherwise. |
| organizationId | String | FK → Organization |
| sortOrder | Int | Admin ordering, default 0 |
| createdAt | DateTime | |
| updatedAt | DateTime | |

Unique constraint: `[organizationId, name]`

### Rule

An individual rule within a type.

| Field | Type | Notes |
|-------|------|-------|
| id | String (uuid) | PK |
| title | String | e.g., "Morning meditation" |
| description | String? | Optional details |
| ruleTypeId | String | FK → RuleType |
| assignmentMode | String | `USER`, `GROUP`, or `ALL` |
| groupId | String? | FK → UserGroup, if GROUP mode |
| organizationId | String | FK → Organization |
| createdById | String | FK → User |
| isActive | Boolean | Soft disable without deleting, default true |
| sortOrder | Int | Ordering within type, default 0 |
| createdAt | DateTime | |
| updatedAt | DateTime | |

Index: `[ruleTypeId, sortOrder]`

### RuleAssignment

Fan-out records linking rules to individual users. Same pattern as TaskAssignment.

| Field | Type | Notes |
|-------|------|-------|
| id | String (uuid) | PK |
| ruleId | String | FK → Rule (cascade delete) |
| userId | String | FK → User (cascade delete) |
| createdAt | DateTime | |

Unique constraint: `[ruleId, userId]`
Index: `[userId]`

### RuleCompletion

Check-off records. One per rule assignment per reset period. Powers streak computation.

| Field | Type | Notes |
|-------|------|-------|
| id | String (uuid) | PK |
| ruleAssignmentId | String | FK → RuleAssignment (cascade delete) |
| userId | String | FK → User (for query convenience) |
| ruleId | String | FK → Rule (for query convenience) |
| periodKey | String | Identifies the period: `"2026-04-11"` (daily), `"2026-W15"` (weekly), `"interval-5"` (interval) |
| completedAt | DateTime | Timestamp of check-off |
| createdAt | DateTime | |

Unique constraint: `[ruleAssignmentId, periodKey]`
Index: `[userId, ruleId]`

## User Experience

### Sidebar Navigation

- "Rules" nav link appears alongside Write Today, My Stats, and Inventory
- Only visible when the user has at least one active rule assignment (implicit — no feature flag)
- Badge counter shows aggregate progress: completed/total across all types for active periods
- Links to `/rules`

### Rules Page (`/rules`)

- Rules grouped by type, each type as a collapsible section
- Section header: type name, progress (e.g., "2/4"), streak indicator (fire emoji + count), reset countdown ("Resets in 6h")
- Each rule: checkbox row with title, optional description, per-rule streak indicator
- Checking a box creates a RuleCompletion for the current period
- Unchecking removes the completion (within current period only — history is immutable)
- Bottom of each type section: "perfect streak" showing consecutive periods where ALL rules in that type were completed

### Reset Behavior

- **Daily:** resets at midnight in the user's timezone (`user.timezone` field already exists)
- **Weekly:** resets on the configured `resetDay` at midnight in user's timezone
- **Interval:** resets every N days from `resetIntervalStart`
- Reset is implicit — no cron job. Current period computed at render time.
- "Is this rule completed?" = "Does a RuleCompletion exist for this assignment + current periodKey?"

### Streak Calculation

- **Per-rule:** consecutive periods with a RuleCompletion record, working backwards from current period
- **Per-type ("perfect"):** consecutive periods where ALL assigned rules in that type have completions
- Computed on page load from RuleCompletion data
- Follows the same pattern as `calculateStreaks` in `lib/streaks.ts`

**Period key computation:**
- Daily: `YYYY-MM-DD` based on user timezone
- Weekly: `YYYY-WNN-Rd` where `d` is the reset day (e.g., `2026-W15-R0` for a Sunday-reset week). This avoids ambiguity when different weekly types reset on different days.
- Interval: `interval-N` where N = floor((today - startDate) / intervalDays)

## Admin Experience

### Rule Types (`/admin/rules/types`)

- List view: name, reset schedule description, rule count per type
- Create/edit form: name, description, reset mode picker (Daily/Weekly/Interval), reset day (if Weekly), interval days (if Interval)
- Delete only if no rules exist under the type
- Daily and Weekly types pre-seeded on first access to the page

### Rules per Type (`/admin/rules/types/[typeId]`)

- Drill into a type to manage its rules
- List view: rule title, assignment mode badge (User/Group/All), active status, completion stats for current period
- Create form: title, description, assignment mode, group picker (if GROUP), active toggle
- Edit form: same fields plus ability to deactivate
- Detail view: per-user completion stats for current period, overall completion rate

### Assignment Fan-out

- On rule creation, generate RuleAssignment records for targeted users (same logic as task assignments)
- ALL-mode rules: new users joining the org should receive assignments (hook into user creation)
- Admin can view assignment coverage from the rule detail page

### Completion Stats (Admin View)

- Per rule: how many assigned users completed it this period
- Per type: overall completion rate across all rules
- Per-user breakdown showing individual streaks

## Technical Approach

### New Files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Add RuleType, Rule, RuleAssignment, RuleCompletion models |
| `lib/rules.ts` | Period key computation, streak calculation, completion helpers |
| `app/rules/page.tsx` | User-facing rules page |
| `app/actions/rules.ts` | Server actions: toggle completion, admin CRUD |
| `app/admin/rules/` | Admin pages: type list, type detail, rule create/edit |

### Sidebar Integration

- Fetch rule assignments + current period completions in `dashboard/page.tsx` alongside existing task/inventory fetches
- Pass count data to render "Rules" nav link with badge counter
- Conditional rendering: only show when user has assignments

### Period Computation

```
getPeriodKey(ruleType: RuleType, userTimezone: string): string
```

Returns the current period key based on rule type config and user timezone. Used for:
- Determining which checkboxes are checked (query completions by periodKey)
- Creating new completions on check-off
- Computing reset countdown for display

### Streak Computation

Reuses the walk-backwards pattern from `calculateStreaks`:
1. Query RuleCompletion records for a rule assignment, ordered by periodKey descending
2. Starting from the previous period (current period is still open), check for consecutive completions
3. Return streak count

For per-type "perfect" streaks:
1. For each period, check if ALL assigned rules in that type have completions
2. Count consecutive "all complete" periods backwards

### Achievement Integration

Not in v1 scope. The data model supports it — RuleCompletion history provides all signals needed for future achievement definitions (e.g., "Complete all daily rules for 30 consecutive days").
