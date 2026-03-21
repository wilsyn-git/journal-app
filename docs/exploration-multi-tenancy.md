# Exploration: Multi-Tenancy for Journal App

**Date:** 2026-03-21
**Status:** Exploration (no implementation planned yet)

---

## Current State

The journal-app has **partial multi-tenant scaffolding** — more than single-tenant but not enough for real multi-tenancy.

### Already Org-Scoped
- Schema has `organizationId` on User, Prompt, PromptCategory, Profile, UserGroup
- Admin page queries consistently filter by `session.user.organizationId`
- Server actions (createPrompt, createProfile, createGroup, etc.) write correct orgId
- Branding system (siteName, logoUrl) is per-org

### What Breaks with Two Orgs
1. **`getActiveOrganization()`** picks the org with the most users — whoever's bigger wins branding
2. **Admin users list** (`/admin/users/page.tsx`) has no org filter — admin sees ALL users globally
3. **`ensureAdmin()`** checks role globally — an Org A admin could edit Org B's prompts
4. **`addUserToGroup`** can cross org boundaries by email
5. **Dashboard's `AdminUserSelector`** fetches all users without org filter

### Readiness Assessment
| Area | Readiness |
|------|-----------|
| Schema | ~70% |
| Server actions (writes) | ~60% |
| Admin page queries (reads) | ~50% |
| Public-facing layer | ~0% |

## What "Org" Means for Journaling

Possible interpretations: classroom, therapy group, family, company wellness program.

Common thread: **one organizer, many participants, organizer controls the prompts.** This matches the existing admin/user model. Full isolation between orgs makes sense (no cross-org features needed).

## Auth Changes Needed

### Current
- NextAuth with Credentials provider
- Admin creates users manually, no self-registration
- AWS SES for welcome/reset emails
- `User.role` is global (ADMIN or USER)

### Required for Multi-Tenancy
- **Self-registration** — signup page for org creators
- **Org creation flow** — register → create org → become admin
- **Invite system** — reuse existing SES/token infrastructure
- **Per-org roles** — `User.role` becomes a `Member` join table (userId + orgId + role)

### The Big Structural Change
`User.organizationId` (singular FK) and `User.role` (global) need to become a `Member` table. This is the most disruptive change — every `session.user.organizationId` and `ensureAdmin()` call needs updating.

### Auth Library
ScoringApp moved to Better Auth, but journal-app's NextAuth works fine. Not worth swapping unless hitting pain points.

## Data Isolation Check

| Model | Has organizationId? | Multi-tenant safe? |
|-------|--------------------|--------------------|
| Organization | N/A | Yes |
| User | Yes (singular FK) | Partially — blocks multi-org membership |
| Prompt | Yes | Yes |
| PromptCategory | Yes | Yes |
| Profile | Yes | Yes |
| ProfileRule | No (via Profile) | Yes (implicit) |
| UserGroup | Yes | Yes |
| JournalEntry | No (via User) | Yes (implicit) |
| UserAvatar | No (via User) | Yes |

## Migration Path

1. Create `Member` table. For each existing User, create a Member record with current orgId + role.
2. Keep `User.organizationId` and `User.role` temporarily or drop and update all queries.
3. Fix `getActiveOrganization()` — replace with session-based org resolution.
4. Add org filters to ~5 unscoped queries.
5. Add ownership checks to mutations.
6. Build registration/org-creation flow.

Existing data stays intact — journal entries, prompts, profiles all already have correct org associations.

## Effort Estimate

**2-3 focused weeks for full multi-tenancy.**

| Task | Estimate |
|------|----------|
| Member model + migration | 1-2 days |
| Auth flow (registration, org creation, invites) | 3-5 days |
| Scoping fixes (org filters, ownership checks) | 2-3 days |
| `getActiveOrganization()` replacement | 1 day |
| Org switcher UI (if multi-org) | 2-3 days |
| Testing | 2-3 days |

### Biggest Risks
- Session/JWT changes — miss one auth check and you have a security hole
- SQLite write concurrency with many orgs
- SES sandbox sending limits for self-registration emails

## Recommended Approach: Start Minimal

**3-4 day project that gets 80% of the value:**
1. Fix the ~5 unscoped queries (add org filters)
2. Fix `getActiveOrganization()`
3. Add org-ownership checks to mutations
4. Manually seed second org + admin via script
5. Skip self-registration, invite flows, multi-org membership

Build the full system only if the use case materializes.

## Alternative: Infrastructure Isolation

If it's just "a friend wants their own journal" — a Docker image or one-click deploy template is dramatically simpler than application-level multi-tenancy. Each deployment gets its own SQLite DB, its own admin. Zero cross-tenant security concerns.
