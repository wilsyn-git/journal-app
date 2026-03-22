# ScoringApp — Architecture & Design Decisions

> **Note:** This documents the ScoringApp (a separate project), kept here as a cross-reference for reusable patterns. For journal-app specific architecture, see the codebase and spec files in `docs/superpowers/specs/`.

A reference document capturing the patterns, decisions, and rationale behind ScoringApp. Intended for cross-referencing when building or evaluating other projects.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 16 (App Router) | Server components, file-based routing, built-in image optimization |
| Language | TypeScript (strict mode) | Catch errors at compile time, self-documenting interfaces |
| Database | SQLite via Prisma 7 | Zero-ops, single-file DB, perfect for single-server deployment |
| Auth | Better Auth + Prisma adapter | Replaced NextAuth — simpler API, database-backed sessions, active maintenance |
| Styling | TailwindCSS 4 | Utility-first, no CSS files to manage, dark theme via class strategy |
| Validation | Zod | Runtime schema validation for all API inputs |
| Dates | date-fns | Tree-shakeable, no moment.js bloat |

### Why Better Auth over NextAuth

NextAuth (auth.js v5) was deprecated and had a confusing migration path. Better Auth provides a cleaner API, first-class Prisma adapter, and database-backed sessions out of the box. Sessions expire after 7 days with a 1-day refresh threshold — no JWT complexity.

### Why SQLite

Single-server deployment makes SQLite ideal. No connection pooling, no separate database process, trivial backups (`sqlite3 .backup`). The DB is ~0.18MB with real usage data and grows at roughly 6KB per game. SQLite handles hundreds of MB without tuning — we'd outgrow the EC2 instance long before outgrowing SQLite.

### Why Prisma 7

Prisma 7 uses `prisma.config.ts` instead of env auto-loading. CLI config and runtime config are separate. Env vars must be explicitly imported (`import 'dotenv/config'` in the config file). This is a breaking change from Prisma 5/6 worth noting when referencing this project.

## Architecture

### Multi-Tenancy Model

Everything is scoped to **Organizations**:

```
Organization
  ├── Members (users with login credentials)
  ├── Players (lightweight game participants)
  ├── Games (sessions with rounds and scores)
  ├── House Rules (per-module org-level config)
  └── Invites (email-based org invitations)
```

**Users vs Players** is a key distinction:
- **Users** have email/password credentials and can log in
- **Players** are game participants — they can be guests (no account) or linked to a user
- A user joining an org automatically gets a player record
- Guest players can be linked to user accounts later

This separation means you can track scores for people who never create an account, which removes friction for casual game nights.

### Game Module System

The core architectural pattern. Each game module is a self-contained plugin implementing the `GameModule` interface:

```typescript
interface GameModule {
  metadata: ModuleMetadata        // id, name, variants, player limits, description
  computeScore(entry, variant?, houseRules?): number  // pure scoring function
  RoundEntryComponent: React.FC   // UI for entering round scores
  ScoreboardRowComponent: React.FC // display a player's round in the scoreboard
  PlayerStatsComponent: React.FC  // aggregated stats display
  isGameOver(totals, houseRules?, variant?, config?): boolean
  statDefinitions: StatDefinition[]  // metadata for stat columns
}
```

**Key decisions:**
- **Metadata as JSON** — module-specific data (round details, game config) stored as JSON strings in the database. Keeps the schema generic while allowing module-specific richness.
- **Pure computation** — `computeScore()` is a pure function. No side effects, easy to test.
- **Registry pattern** — modules register in a plain `Record<string, GameModule>` object. No class hierarchy, no plugin framework. Simple import and go.
- **Generic templates** — three reusable templates (Win/Loss, Score Tracker, Live Counter) cover most games without custom module code. Custom modules (Flip 7, Lorcana, Cafebara) add game-specific scoring logic and stats.

### Data Conventions

- Module metadata and stats stored as **JSON strings** — use parse/stringify helpers
- **Prisma transactions** for multi-step DB operations (e.g., creating a game with participants)
- All API input validated with **Zod schemas** at the route handler level
- Dates stored as ISO strings in API responses, `Date` objects internally

## Route Protection

Next.js 16 uses `proxy.ts` (not `middleware.ts`) for route-level protection:

- **Stateless cookie check** — looks for Better Auth session token, no DB lookup in proxy
- **Public routes whitelist** — `/login`, `/register`, `/invite`, `/forgot-password`, `/api/auth`, etc.
- **Redirect with callback** — unauthenticated requests redirect to `/login?callbackUrl=<original_path>`
- **Excludes static assets** — `_next/static`, `_next/image`, favicon, public files skip the proxy entirely

API routes have a second layer: `lib/api/authorize-game.ts` checks org membership via Prisma before allowing game operations.

## Security

### HTTP Headers (next.config.ts)

Applied to all routes:
- `X-Content-Type-Options: nosniff` — prevents MIME-sniffing
- `X-Frame-Options: DENY` — blocks iframe embedding (clickjacking)
- `X-XSS-Protection: 1; mode=block` — legacy XSS filter
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` — disables unused device APIs

### API Authorization

- Every game API route verifies org membership before allowing operations
- Shared `authorize-game.ts` helper uses Prisma composite key lookup (`userId_orgId`)
- Admin-only operations (org settings, member management) check `role === 'admin'`

## Accessibility (WCAG 2.1)

### Modal (components/ui/Modal.tsx)
- `role="dialog"` + `aria-modal="true"`
- `aria-labelledby` links dialog to its heading
- **Focus trap** — Tab cycles within modal, Shift+Tab wraps from first to last element
- **Focus restore** — saves `activeElement` on open, restores on close
- Escape key closes modal
- Body scroll locked while open
- Close button has `aria-label="Close"`

### Form Inputs (components/ui/Input.tsx)
- `aria-invalid="true"` when error present (omitted when valid)
- `aria-describedby` links input to its error message via auto-generated ID
- Error messages have `role="alert"` for screen reader announcement
- `<label htmlFor>` explicitly binds labels to inputs

### Navigation (components/layout/Nav.tsx)
- **Skip link** — `<a href="#main-content">` visually hidden until focused, allows keyboard users to bypass nav
- `aria-current="page"` on active nav links
- Mobile hamburger has `aria-label="Toggle menu"`
- All touch targets minimum 44px (WCAG 2.5)

### Breadcrumbs (components/layout/Breadcrumbs.tsx)
- Semantic `<nav aria-label="Breadcrumb">` with `<ol>` list
- Separator (`›`) has `aria-hidden="true"` — screen readers skip it
- Current page (last item) rendered as plain text, not a link

### Error Boundaries
- Two-level: root (`app/error.tsx`) and app layout (`app/(app)/error.tsx`)
- Generic user-facing message ("Something went wrong")
- Reset callback to retry rendering
- No sensitive error details exposed to users

## UX Design Decisions

### In-Context Guidance Over Help Pages

We evaluated building a `/help` page and decided against it. Modern users don't seek out help pages — they expect the UI to teach them as they go. Instead:

- **Enriched empty states** — every "No X yet" message includes context on what to do next, following the Org > Players > Games flow
- **Post-org-creation nudge** — new orgs hide the games section entirely and show the player form prominently with a hint. Games appear once 2+ players exist.
- **Disabled CTAs** — buttons that would lead to dead ends (Play, New Game, Start First Game) are disabled with explanatory text rather than letting users hit a wall.

### Compact UI

Frequently-used screens minimize scrolling:
- Game lists use single-card rows instead of separate cards per game
- Module picker uses compact rows with inline descriptions
- Stats tables are dense with minimal chrome

### Progressive Disclosure

- New orgs see only the Players section — no games list, no Play buttons
- Once players are added, the full org page layout appears
- Generic template descriptions only show in the game creation wizard (not on compact game rows elsewhere)

## SEO & Web Presence

- `robots.ts` — allows public pages, disallows authenticated routes
- `sitemap.ts` — public routes with change frequency and priority
- OpenGraph metadata on root layout
- `manifest.json` for PWA-like behavior
- Images use `next/image` for automatic optimization and lazy loading

## Production Deployment

| Component | Setup |
|-----------|-------|
| Server | AWS EC2 (also hosts journal-app) |
| Process manager | PM2 (`pm2 restart scoringapp`) |
| Reverse proxy | Nginx on port 3001 |
| SSL | Let's Encrypt |
| Domain | scoringapp.net (GoDaddy DNS) |
| Email | AWS SES (sandbox mode, instance role auth) |
| Analytics | Google Analytics (production only, gated by `NODE_ENV`) |
| Monitoring | PM2 process monitoring |

### Deploy Process

```bash
ssh little
cd /home/ubuntu/scoringapp
git pull origin main
npm install        # full install, devDeps needed for build
npm run build
pm2 restart scoringapp
```

**Important:** Never use `npm install --production` — dev dependencies (TypeScript, etc.) are required for `next build`.

### Backup Strategy (planned)

Daily encrypted backup of `scoring.db` + `.env.local` to S3. These are the only two files not reproducible from git. Recovery: clone repo, install, build, restore payload from S3, start PM2.

## Patterns Worth Reusing

1. **Module/plugin architecture** — define an interface, register implementations in a plain object, render dynamically. No framework needed.
2. **Users vs lightweight participants** — separate auth identity from domain entities. Reduces friction.
3. **JSON metadata columns** — keep the schema generic, store module-specific data as JSON. Parse/stringify helpers keep it clean.
4. **Proxy-based route protection** — single stateless check, no DB in middleware, public route whitelist.
5. **Empty states as onboarding** — every empty state is a teaching moment, not a dead end.
6. **State-derived UX modes** — new org vs. established org layout derived from data, no persisted flags or dismiss cookies.
7. **Two-level error boundaries** — root catches catastrophic failures, app layout catches component-level errors.
8. **Security headers in config** — set once, applied everywhere, no per-route management.
