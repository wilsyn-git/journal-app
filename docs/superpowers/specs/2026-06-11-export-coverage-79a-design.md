# Admin export coverage — #79a

**Date:** 2026-06-11
**Branch:** `fix/export-coverage-79a`
**Scope:** Complete the admin full-backup export (`app/api/admin/export/route.ts`) so it includes every org-scoped data model, and extract the data-gathering into a testable collector. This is the additive half of #79; the restore/import path (#79b) is a separate later design.

## Context

`app/api/admin/export/route.ts` is a 157-line inline `GET` handler that auth-checks (ADMIN only), runs 9 org-scoped `findMany` calls, enriches org logos and user avatars to base64 from the filesystem, wraps the result in a `meta`+`data` object (`meta.version: "1.0"`), gzips, and returns it as a download.

Currently exported: `organizations`, `users` (with `password`/`resetToken`/`resetTokenExpiry` omitted), `profiles`, `groups`, `prompts`, `categories`, `rules` (= the **legacy `ProfileRule`** model), `entries` (`JournalEntry`), `avatars` (`UserAvatar`).

**Unexported (the gap):** `Task`, `TaskAssignment`, `UserAchievement`, `UserInventory`, `StreakFreezeUsage`, and the entire newer rule engine — `RuleType`, `Rule`, `RuleAssignment`, `RuleCompletion`. `DeviceSession` is intentionally left out (ephemeral push tokens + security-sensitive).

Decisions (brainstormed): **full completeness** (include the rule engine, not just the three tracker-named items) and **extract a testable collector**.

## Goals / Non-goals

**Goal:** The admin export is a complete org backup — every persistent, non-sensitive org-scoped model — and the gathering logic is unit-testable.

**Non-goals:** the per-user export routes (`app/api/admin/export-user`, `app/api/user/export`); export-route consolidation (#44); restore/import (#79b); pagination/streaming for large collections (a known scale concern, noted but not addressed); any change to auth, compression, or filename behavior.

## Org-scoping (verified against `prisma/schema.prisma`)

| Collection | Model | `where` |
|-----------|-------|---------|
| `tasks` | `Task` | `{ organizationId }` |
| `taskAssignments` | `TaskAssignment` | `{ task: { organizationId } }` |
| `achievements` | `UserAchievement` | `{ user: { organizationId } }` |
| `inventory` | `UserInventory` | `{ user: { organizationId } }` |
| `streakFreezeUsage` | `StreakFreezeUsage` | `{ user: { organizationId } }` |
| `ruleEngine.ruleTypes` | `RuleType` | `{ organizationId }` |
| `ruleEngine.rules` | `Rule` | `{ organizationId }` |
| `ruleEngine.ruleAssignments` | `RuleAssignment` | `{ rule: { organizationId } }` |
| `ruleEngine.ruleCompletions` | `RuleCompletion` | `{ rule: { organizationId } }` |

Existing collections keep their current `where` clauses and the `users` `omit`.

## Design

### `lib/export/collectOrgBackup.ts` (new)

```typescript
export async function collectOrgBackup(db: PrismaClient, organizationId: string): Promise<OrgBackupData>
```

- Runs all org-scoped `findMany` calls (existing nine + the new ones) and returns a single plain `data` object. No `meta`, and **no filesystem/base64 work** — that stays in the route, keeping this function pure-DB and unit-testable.
- Returns the existing keys plus `tasks`, `taskAssignments`, `achievements`, `inventory`, `streakFreezeUsage`, and a nested `ruleEngine: { ruleTypes, rules, ruleAssignments, ruleCompletions }`. The nested key avoids colliding with the legacy top-level `rules` (= `ProfileRule`), which is left untouched for backward compatibility.
- `OrgBackupData` is an exported interface describing the shape (arrays typed loosely as the corresponding Prisma row types or `unknown[]` where convenient) so #79b can consume it.
- Param typed as `PrismaClient`; the test passes a partial mock cast to `PrismaClient` (chosen over a hand-written structural interface given ~17 models).

### `app/api/admin/export/route.ts` (modify)

- Replace the nine inline `findMany` blocks (current lines ~24–70) with `const data = await collectOrgBackup(prisma, organizationId)`.
- Keep the existing logo/avatar base64 enrichment, applied on top of `data.organizations` and `data.avatars`; substitute the enriched arrays into the final object.
- Build `backupData` from `data` (with enriched orgs/avatars) plus `meta`, bumping `meta.version` to `"1.1"` (additive superset; #79b restore must accept `"1.0"` and `"1.1"`).
- Auth check, gzip, filename, and error handling unchanged.

## Error handling

`collectOrgBackup` does no I/O beyond Prisma; a DB error propagates and is caught by the route's existing `try/catch` → `500 Internal Server Error` (with the error logged). The base64 enrichment keeps its existing per-file `try/catch` that warns and falls back to the un-enriched row.

## Testing

**`tests/lib/collectOrgBackup.test.ts`** (unit, mocked Prisma):
- Build a mock `db` where every used model has `findMany: vi.fn().mockResolvedValue([<sentinel>])`.
- Assert the returned object contains every expected top-level key and the nested `ruleEngine.{ruleTypes,rules,ruleAssignments,ruleCompletions}` keys.
- Assert each `findMany` was called with the correct org-scoped `where` from the table above (e.g. `taskAssignment.findMany` with `{ where: { task: { organizationId } } }`).
- Assert `user.findMany` was called with the `omit` for `password`, `resetToken`, `resetTokenExpiry`.

## Verification (before merge)

- `npm test` green (new collector test + existing suite).
- `npm run build` green; `npx tsc --noEmit` clean for the route and collector.
- Manual smoke (optional, needs admin login): trigger the admin export; confirm the downloaded `.json.gz` decompresses and contains the new collections with `meta.version: "1.1"`.

## Deployment

Standard code deploy (backup DB → `git pull` → `npm run build` → `pm2 restart journal-app`). No migration, no new dependencies, no env changes.

## Tracker updates (on completion)

Update #79 in `docs/issuesMerged.md` and `ISSUES.md`: export coverage now complete (tasks, achievements, inventory, full rule engine); residual is now only the user-facing restore (#79b).
