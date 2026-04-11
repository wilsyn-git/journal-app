# Journaling App

A daily journaling platform with admin-managed prompts, task assignment, analytics, and multi-user support. Built with Next.js 16, designed for organizations where one admin guides many users through structured reflection.

## Key Features

### Smart Dashboard
- **Dynamic Prompts**: Admin-configurable questions (Text, Checkbox, Radio, Range slider) served daily via profile rules
- **Recency Suppression**: Prompts shown in the last 4 days are excluded from selection, ensuring variety across a pool of 100+ prompts
- **Timezone Aware**: "Today" is calculated based on the user's timezone (stored in DB, auto-detected on first visit, configurable in Settings)
- **Prompt Reordering**: Drag-and-drop interface for prompt ordering within categories

### Task Assignment
- **Admin-Assigned Tasks**: Create tasks with priority (Urgent/Normal/Low), optional due dates, and assign to individual users, groups, or all users
- **Dashboard Integration**: Tasks appear in the sidebar with inline completion notes
- **Completion Tracking**: Admin detail page shows per-user status with progress bar
- **Notification Banner**: Users see a dismissable banner when they have pending tasks

### Rules (Habit Tracking)
- **Admin-Defined Rule Types**: Create rule categories with configurable reset schedules (Daily, Weekly, or custom N-day intervals)
- **Flexible Assignment**: Assign rules to individual users, groups, or all users (same fan-out pattern as tasks)
- **User Check-Off**: Users see a `/rules` page with grouped checklists, checking off rules per period
- **Streak Tracking**: Per-rule and per-type "perfect" streaks motivate consistent compliance
- **Implicit Reset**: No cron jobs — period boundaries computed at render time using the user's timezone
- **Admin Stats**: Per-rule completion rates and per-user breakdown on admin detail pages

### Analytics
- **Contribution Heatmap**: GitHub-style journaling history
- **Word Cloud**: Visual representation of frequent themes
- **Time of Day**: Entry distribution patterns
- **Trend Charts**: Mood/energy tracking over time from Range prompts
- **Badge System**: Achievement badges for streaks and milestones

### Admin Tools
- **User Management**: Create users, monitor last activity, safe deletion with backup
- **Prompt Management**: Category-based prompt editor with profile rules (min/max random selection per category)
- **Groups & Profiles**: Assign users to groups, link profiles with prompt rules
- **Task Management**: Create, edit, archive tasks with completion matrix view
- **Rules Management**: Type-first navigation — manage rule types and their reset schedules, then drill in to manage individual rules per type
- **Branding**: Custom site name and logo per organization
- **Backup/Restore**: Full system export (gzipped JSON with binary assets) and restore with merge/overwrite modes

### Security
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **Auth Checks**: Middleware protects all app routes by default, admin role verification on admin pages, session ownership on user actions
- **Path Traversal Protection**: Validated file paths on restore/upload operations
- **Sensitive Data Exclusion**: Password hashes excluded from admin exports

### Accessibility (WCAG 2.2)
- Skip navigation link
- Proper form labels (htmlFor/id) across all forms
- Dialog ARIA attributes and Escape key handlers
- Screen reader announcements for errors and status changes
- Keyboard-visible focus indicators
- Color contrast compliance (AA)
- Accessible charts and data visualizations

### SEO
- robots.txt and sitemap.xml via Next.js Metadata API
- Per-page metadata with unique titles
- Open Graph and Twitter card support

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| Database | SQLite via Prisma 6 |
| Auth | NextAuth.js v5 (Credentials provider) |
| Styling | TailwindCSS 4 |
| Email | AWS SES |
| Process Manager | PM2 |

## Requirements

- **Node.js 22.x** (pinned via `.node-version` and `engines` field)
- Use `fnm` or `nvm` to manage Node versions

## Getting Started

1. **Clone and install:**
   ```bash
   git clone https://github.com/wilsyn-git/journal-app.git
   cd journal-app
   npm install
   ```

2. **Setup environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your DATABASE_URL, NEXTAUTH_SECRET, AWS SES credentials
   ```

3. **Initialize database:**
   ```bash
   npx prisma generate
   npx prisma db push
   npx prisma db seed  # Optional: seed initial data
   ```

4. **Run development server:**
   ```bash
   npm run dev
   ```

5. **Open browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
app/
  actions/          Server actions (journal, tasks, rules, profiles, groups, prompts, users)
  admin/            Admin pages (dashboard, users, prompts, profiles, groups, tasks, rules, branding, tools)
  rules/            User-facing rules check-off page
  dashboard/        User journal dashboard
  stats/            Analytics page
  settings/         User profile settings and timezone preference
  lib/              Data fetching (data.ts, analytics.ts)
components/
  admin/            Admin UI components (TaskForm, PromptEditor, ProfileRulesManager, etc.)
  stats/            Chart components (WordCloud, TrendChart, TimeOfDayChart, etc.)
  providers/        Context providers (Branding, Toast)
  TaskSidebar.tsx   User-facing task list
  TaskBanner.tsx    Task notification banner
  DashboardShell.tsx  Layout shell with sidebar
lib/
  prisma.ts         Prisma client singleton
  timezone.ts       Timezone utilities
  auth-helpers.ts   Session/user resolution
  taskConstants.ts  Task priority and assignment mode constants
  ruleConstants.ts  Rule reset modes and day labels
  rules.ts          Period key computation, streak calculation, rule query helpers
prisma/
  schema.prisma     Database schema
scripts/
  simulatePrompts.sh  Validate prompt variety across N days
```

## Deployment

Production runs on EC2 via PM2:

```bash
ssh your-server
cd /path/to/journal-app
pm2 stop journal-app
# If schema changes: backup first
# tar czf ~/journal-app_$(date +%Y%m%d_%H%M%S).tar.gz journal-app/
git pull origin main
npm install
npx prisma migrate deploy   # Apply pending migrations (safe, additive only)
npx prisma generate          # Regenerate client for new schema fields
npm run build
pm2 restart journal-app
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md) for planned improvements including rate limiting, route protection whitelist, Prisma 7 upgrade, and structured logging.

## License

MIT
