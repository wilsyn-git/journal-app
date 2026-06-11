# Admin Export Coverage (#79a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin backup export complete (all org-scoped models incl. the rule engine) via a testable `collectOrgBackup` collector.

**Architecture:** Extract all data-gathering from the inline export route into `lib/export/collectOrgBackup.ts` (pure-DB, unit-testable with a mocked Prisma), add the missing collections, and wire the route to it while keeping the filesystem base64 enrichment in the route. One feature branch (`fix/export-coverage-79a`, already created). No DB/schema/migration changes, no new dependencies.

**Tech Stack:** TypeScript, Next.js route handler, Prisma (`@/lib/prisma`, `@prisma/client` types), Vitest, `@/` alias.

**Spec:** `docs/superpowers/specs/2026-06-11-export-coverage-79a-design.md`

---

## File Structure

- `lib/export/collectOrgBackup.ts` — **create**: `collectOrgBackup(db, orgId)` returning the full `data` object; `OrgBackupData` type.
- `tests/lib/collectOrgBackup.test.ts` — **create**: mocked-Prisma unit tests (collections present, org-scoped, user `omit`).
- `app/api/admin/export/route.ts` — **modify**: use the collector; keep base64 enrichment; bump `meta.version` to `"1.1"`.

---

## Task 1: `collectOrgBackup` collector (#79a)

**Files:**
- Create: `lib/export/collectOrgBackup.ts`
- Test: `tests/lib/collectOrgBackup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/collectOrgBackup.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { collectOrgBackup } from '@/lib/export/collectOrgBackup'

function makeDb() {
  const model = () => ({ findMany: vi.fn().mockResolvedValue([]) })
  return {
    organization: { findMany: vi.fn().mockResolvedValue([{ id: 'org1' }]) },
    user: model(),
    profile: model(),
    userGroup: model(),
    prompt: model(),
    promptCategory: model(),
    profileRule: model(),
    journalEntry: model(),
    userAvatar: model(),
    task: model(),
    taskAssignment: model(),
    userAchievement: model(),
    userInventory: model(),
    streakFreezeUsage: model(),
    ruleType: model(),
    rule: model(),
    ruleAssignment: model(),
    ruleCompletion: model(),
  }
}

describe('collectOrgBackup', () => {
  it('returns every expected collection key, including the nested ruleEngine', async () => {
    const db = makeDb()
    const result = await collectOrgBackup(db as unknown as PrismaClient, 'org1')

    for (const key of [
      'organizations', 'users', 'profiles', 'groups', 'prompts', 'categories',
      'rules', 'entries', 'avatars', 'tasks', 'taskAssignments', 'achievements',
      'inventory', 'streakFreezeUsage', 'ruleEngine',
    ]) {
      expect(result).toHaveProperty(key)
    }
    expect(result.ruleEngine).toHaveProperty('ruleTypes')
    expect(result.ruleEngine).toHaveProperty('rules')
    expect(result.ruleEngine).toHaveProperty('ruleAssignments')
    expect(result.ruleEngine).toHaveProperty('ruleCompletions')
  })

  it('scopes each collection to the organization', async () => {
    const db = makeDb()
    await collectOrgBackup(db as unknown as PrismaClient, 'org1')

    expect(db.task.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
    expect(db.taskAssignment.findMany).toHaveBeenCalledWith({ where: { task: { organizationId: 'org1' } } })
    expect(db.userAchievement.findMany).toHaveBeenCalledWith({ where: { user: { organizationId: 'org1' } } })
    expect(db.userInventory.findMany).toHaveBeenCalledWith({ where: { user: { organizationId: 'org1' } } })
    expect(db.streakFreezeUsage.findMany).toHaveBeenCalledWith({ where: { user: { organizationId: 'org1' } } })
    expect(db.ruleType.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
    expect(db.rule.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
    expect(db.ruleAssignment.findMany).toHaveBeenCalledWith({ where: { rule: { organizationId: 'org1' } } })
    expect(db.ruleCompletion.findMany).toHaveBeenCalledWith({ where: { rule: { organizationId: 'org1' } } })
  })

  it('omits sensitive fields from the users query', async () => {
    const db = makeDb()
    await collectOrgBackup(db as unknown as PrismaClient, 'org1')

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org1' },
        omit: { password: true, resetToken: true, resetTokenExpiry: true },
      }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/collectOrgBackup.test.ts`
Expected: FAIL — cannot find module `@/lib/export/collectOrgBackup`.

- [ ] **Step 3: Write the implementation**

Create `lib/export/collectOrgBackup.ts`:

```typescript
import type { PrismaClient } from '@prisma/client'

/**
 * Gathers a complete, organization-scoped backup of all persistent, non-sensitive
 * models (#79a). Returns the plain `data` object only — no `meta`, and no
 * filesystem/base64 work (logo/avatar enrichment stays in the route). Pure DB
 * access so it can be unit-tested with a mocked Prisma client.
 *
 * `rules` is the legacy `ProfileRule` model (kept for backward compatibility);
 * the newer rule engine is nested under `ruleEngine` to avoid the name clash.
 * DeviceSession is intentionally excluded (ephemeral push tokens + secrets).
 */
export async function collectOrgBackup(db: PrismaClient, organizationId: string) {
    const organizations = await db.organization.findMany({ where: { id: organizationId } })

    const users = await db.user.findMany({
        where: { organizationId },
        omit: { password: true, resetToken: true, resetTokenExpiry: true },
        include: { profiles: { select: { id: true } }, groups: { select: { id: true } } },
    })

    const profiles = await db.profile.findMany({
        where: { organizationId },
        include: { groups: { select: { id: true } } },
    })

    const groups = await db.userGroup.findMany({ where: { organizationId } })
    const prompts = await db.prompt.findMany({ where: { organizationId } })
    const categories = await db.promptCategory.findMany({ where: { organizationId } })
    const rules = await db.profileRule.findMany({ where: { profile: { organizationId } } })
    const entries = await db.journalEntry.findMany({ where: { user: { organizationId } } })
    const avatars = await db.userAvatar.findMany({ where: { user: { organizationId } } })

    const tasks = await db.task.findMany({ where: { organizationId } })
    const taskAssignments = await db.taskAssignment.findMany({ where: { task: { organizationId } } })
    const achievements = await db.userAchievement.findMany({ where: { user: { organizationId } } })
    const inventory = await db.userInventory.findMany({ where: { user: { organizationId } } })
    const streakFreezeUsage = await db.streakFreezeUsage.findMany({ where: { user: { organizationId } } })

    const ruleTypes = await db.ruleType.findMany({ where: { organizationId } })
    const engineRules = await db.rule.findMany({ where: { organizationId } })
    const ruleAssignments = await db.ruleAssignment.findMany({ where: { rule: { organizationId } } })
    const ruleCompletions = await db.ruleCompletion.findMany({ where: { rule: { organizationId } } })

    return {
        organizations,
        users,
        profiles,
        groups,
        prompts,
        categories,
        rules,
        entries,
        avatars,
        tasks,
        taskAssignments,
        achievements,
        inventory,
        streakFreezeUsage,
        ruleEngine: {
            ruleTypes,
            rules: engineRules,
            ruleAssignments,
            ruleCompletions,
        },
    }
}

/** Shape of the export `data` object. Inferred so it always matches the query selections (used by #79b restore). */
export type OrgBackupData = Awaited<ReturnType<typeof collectOrgBackup>>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/collectOrgBackup.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `lib/export/collectOrgBackup.ts`. (If Prisma's `omit` option is rejected, note it — but the existing route already uses `omit` against this Prisma client, so it is supported.)

- [ ] **Step 6: Commit**

```bash
git add lib/export/collectOrgBackup.ts tests/lib/collectOrgBackup.test.ts
git commit -m "feat(export): add org-scoped collectOrgBackup collector (#79a)"
```

---

## Task 2: Wire the export route to the collector (#79a)

**Files:**
- Modify: `app/api/admin/export/route.ts`

No unit test for this task (the route does auth + filesystem + gzip; its data logic is `collectOrgBackup`, covered in Task 1). Verified by build + Task 3 smoke.

- [ ] **Step 1: Add the import**

In `app/api/admin/export/route.ts`, add after the existing imports:

```typescript
import { collectOrgBackup } from "@/lib/export/collectOrgBackup"
```

- [ ] **Step 2: Replace the inline findMany blocks with the collector call**

Delete the nine inline `findMany` blocks (the `const organizations = ...` through `const avatars = ...` assignments, currently lines ~24–70) and replace them with a single call right after `const organizationId = user.organizationId`:

```typescript
        const organizationId = user.organizationId

        const data = await collectOrgBackup(prisma, organizationId)
```

- [ ] **Step 3: Point the base64 enrichment at `data`**

The enrichment blocks currently reference the local `organizations` and `avatars` variables. Update them to read from `data`:

```typescript
        const organizationsWithLogos = await Promise.all(data.organizations.map(async (org) => {
            if (org.logoUrl) {
                try {
                    const filePath = join(publicDir, org.logoUrl)
                    const buffer = await fs.readFile(filePath)
                    return { ...org, base64Data: `data:image/png;base64,${buffer.toString('base64')}` }
                } catch (e) {
                    console.warn(`Failed to export logo for org ${org.id}`, e)
                }
            }
            return org
        }))

        const avatarsWithImages = await Promise.all(data.avatars.map(async (av) => {
            if (av.url) {
                try {
                    const filePath = join(publicDir, av.url)
                    const buffer = await fs.readFile(filePath)
                    return { ...av, base64Data: `data:image/jpeg;base64,${buffer.toString('base64')}` }
                } catch (e) {
                    console.warn(`Failed to export avatar ${av.id}`, e)
                }
            }
            return av
        }))
```

- [ ] **Step 4: Rebuild the backup object from `data` and bump the version**

Replace the `backupData` construction so it spreads all collected `data` and overrides the two enriched arrays, with `meta.version` bumped to `"1.1"`:

```typescript
        const backupData = {
            meta: {
                version: "1.1",
                date: new Date().toISOString(),
                exportedBy: user.email,
                compression: "gzip"
            },
            data: {
                ...data,
                organizations: organizationsWithLogos,
                avatars: avatarsWithImages
            }
        }
```

- [ ] **Step 5: Fix the primary-org lookup reference**

Later in the file, the filename logic references the old local `organizations`. Update it to use `data.organizations`:

```typescript
        const primaryOrg = data.organizations.find(o => o.id === user.organizationId) || data.organizations[0]
```

- [ ] **Step 6: Type-check the route**

Run: `npx tsc --noEmit`
Expected: no errors related to `app/api/admin/export/route.ts`. (`data.organizations` / `data.avatars` carry the inferred Prisma row types, so `org.logoUrl` / `av.url` / `o.id` resolve.)

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/export/route.ts
git commit -m "feat(export): export all org collections via collector, bump backup to v1.1 (#79a)"
```

---

## Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, including `tests/lib/collectOrgBackup.test.ts`.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 3: Update issue trackers**

In `docs/issuesMerged.md` and `ISSUES.md`, update the #79 PARTIAL entry: export coverage is now complete (tasks, achievements, inventory, full rule engine; backup `meta.version` 1.1). The remaining residual is only the user-facing restore (#79b). Keep #79 listed as PARTIAL (restore still open) but note #79a done.

```bash
git add docs/issuesMerged.md ISSUES.md
git commit -m "docs(export): #79a export coverage complete; restore (#79b) still open"
```

---

## Self-Review Notes

- **Spec coverage:** collector with all collections + org-scoping + `omit` → Task 1; route rewire + base64 enrichment kept + version bump → Task 2; verification + trackers → Task 3. The `ruleEngine` nesting and `DeviceSession` exclusion are in the Task 1 implementation.
- **Type consistency:** `collectOrgBackup(db: PrismaClient, organizationId: string)` defined in Task 1, called as `collectOrgBackup(prisma, organizationId)` in Task 2. `OrgBackupData` inferred. The returned `data` keys (`organizations`, `avatars`, `ruleEngine`, …) match the route's `...data` spread and `data.organizations`/`data.avatars` references.
- **No placeholders:** every code step shows complete code; every run step has its command and expected result.
