# Architecture — myJournal

> Last updated: 2026-04-14

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Database | SQLite via Prisma 6 |
| Auth | NextAuth 5 (beta 30) |
| Email | AWS SES |
| Push | @parse/node-apn |
| Validation | Zod 4 |
| Deployment | EC2 + PM2 |

## Directory Layout

```
app/                    # Next.js App Router
  (auth)/               # Auth group (login, forgot-password, reset-password)
  about/                # Public about page
  actions/              # Server actions
  admin/                # Admin pages (users, prompts, tasks, rules, settings)
  api/                  # REST API routes (iOS client)
  dashboard/            # Main user dashboard
  inventory/            # User inventory (streak freezes, items)
  rules/                # User-facing rules/habits page
  stats/                # User statistics
components/             # React components (~25 top-level files + subdirs)
  admin/                # Admin-specific components
  providers/            # Context providers
  stats/                # Stats display components
lib/                    # Business logic & utilities (~14 files)
  api/                  # API route helpers
  email/                # Email templates & sending
prisma/                 # Schema, migrations, seed
public/                 # Static assets
scripts/                # Utility scripts
types/                  # TypeScript type definitions
```

## Data Models (Key Entities)

- **User** — credentials, role (ADMIN/USER), org membership, profile, avatar
- **Organization** — multi-tenant container
- **JournalEntry** — user writings linked to prompts, with word count & mood
- **Prompt / PromptCategory** — admin-managed writing prompts with recency suppression
- **Profile / ProfileRule** — user profile questions and custom rules
- **Rule / RuleType / RuleAssignment / RuleCompletion** — habit tracking with DAILY/WEEKLY/INTERVAL resets, streak tracking
- **Task / TaskAssignment** — directive tasks with priority (URGENT/NORMAL/LOW), deadlines, completion
- **UserAchievement** — tiered achievement/badge system
- **UserInventory** — consumable items (streak freezes)
- **StreakFreezeUsage** — streak protection records
- **DeviceSession** — iOS push notification tokens & refresh tokens

## Key Features

1. **Journaling** — daily prompted journaling with category-based prompt selection, 4-day recency suppression, SHA-256 PRNG for variety
2. **Rules/Habits** — admin-defined habit checklist with daily/weekly/interval reset modes, streaks, calendar dot indicators, historical completion view
3. **Task Assignment** — admin assigns tasks with priority and deadlines; "reflection bridge" connects task completion to journal entries
4. **Achievement Engine** — tiered achievement system replacing original hardcoded badges
5. **Streak System** — journal streaks with freeze items, recovery mechanics, inventory
6. **Admin Dashboard** — user management, prompt CRUD, task management, rules management, user inspection (with rules status view)
7. **iOS REST API** — authenticated endpoints for mobile client
8. **Multi-tenancy** — organization-scoped data (partially implemented, ~70% schema / ~50% query coverage)

## Architecture Patterns

- **Server Actions** for mutations (app/actions/)
- **Server Components** as default, Client Components only where interactivity needed
- **Prisma singleton** via lib/prisma.ts
- **Timezone-aware** operations via lib/timezone.ts
- **Role-based access** with admin checks in server actions and API routes
- **Date-aware rules** — `getUserRulesWithStatus` accepts optional date for historical lookups; interactive toggles only for current user on today, read-only view for past days and admin inspection
