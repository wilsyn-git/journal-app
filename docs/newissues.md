# New Issues — Codebase & Architecture Review (2026-06-09)

Findings from a full review of the codebase and architecture docs, covering usability, performance, and scale. Issues already tracked in `ISSUES.md`, `docs/journal-app-audit.md`, `docs/622026_review.md`, or `docs/roadmap.md` are excluded — this file contains only **new** findings.

Severity: **HIGH** = fix soon (data integrity, data loss, or security scoping) · **MED** = meaningful improvement · **LOW** = polish / housekeeping.

---

## 1. Correctness & Data Integrity (Scale)

### N1.1 [HIGH] Race condition in streak freeze/shield earning — ✅ Fixed 2026-06-09 (fix/priority-hardening)
**Resolution:** Extracted to `lib/inventoryEarning.ts` `processFirstEntryEarning`, running the day-check + both counter updates in one `prisma.$transaction`. Also made idempotent via a `lastEarnedDay` stamp in metadata (guards against double/concurrent earn). Wired into `submitEntry`. Covered by `tests/lib/inventoryEarning.test.ts` (incl. concurrency + same-args-double-call regression tests). Fixed the pre-existing first-day double-count bug as a side effect.
**Where:** `app/actions/journal.ts:94-166`
Earning logic is a non-transactional read-modify-write: the code reads the earning counter/quantity, checks it, then updates separately. Two concurrent journal saves can both read the same counter value, causing lost updates or missed rewards. Only the initial creates are wrapped in a transaction.
**Fix:** Wrap the full earning flow (count check + upsert + conditional update) in `prisma.$transaction()`, or use atomic `{ increment: n }` updates with a conditional `where`.

### N1.2 [HIGH] Race condition in streak recovery inventory spend — ✅ Fixed 2026-06-09 (fix/priority-hardening)
**Resolution:** Extracted to `lib/streakSpend.ts` `spendStreakRecovery`, using a guarded `updateMany` (`quantity: { gte: cost }` in WHERE) + usage-row inserts in one transaction; insufficient balance rolls the whole spend back. Also validates `frozenDate` keys (`YYYY-MM-DD`) and no longer wipes earning metadata on spend (preserves `earningCounter`/`lastEarnedDay`). Wired into `useStreakRecovery`. Covered by `tests/lib/streakSpend.test.ts`.
**Follow-up — ✅ Fixed 2026-06-09 (fix/security-residuals):** the SECOND spend path at `app/api/v1/inventory/streak-freeze/use/route.ts` (the iOS API route) had the same overdraft + metadata-wipe pattern. Now routes through `spendStreakRecovery(prisma, …)`, mapping `{ error }`→`apiError(…,400)` and `{ success }`→`apiSuccess`, wrapped in try/catch. Overdraft and metadata-wipe both eliminated.
**Where:** `app/actions/inventory.ts:25-29`
`useStreakRecovery()` reads inventory quantity, checks availability, then decrements. Concurrent calls can both pass the check and overdraft inventory (negative freezes/shields).
**Fix:** Use a transaction with a conditional update (`updateMany` with `quantity: { gte: cost }` in the `where`, then verify `count === 1`), or `{ decrement }` guarded the same way.

### N1.3 [HIGH] Admin user queries are not scoped to organization — ✅ Fixed 2026-06-09 (fix/priority-hardening)
**Resolution:** Added `where: { organizationId: session.user.organizationId }` to both admin `findMany` queries; `app/admin/users/page.tsx` also gained a session/org auth guard it previously lacked entirely.
**Follow-up — ✅ Fixed 2026-06-09 (fix/security-residuals):** `app/dashboard/page.tsx` now validates the `?viewUserId=` target's `organizationId === session.user.organizationId` (and that the target exists) BEFORE any target-scoped read; on mismatch it `redirect('/dashboard')` to a safe self-view. Verified the guard runs before the `Promise.all` of target reads.
**Where:** `app/dashboard/page.tsx:81`, `app/admin/users/page.tsx:10`
When an admin views the dashboard or the admin users page, `prisma.user.findMany()` runs with no `organizationId` filter — it fetches **all** users in the database. Today with one org this is "only" an unbounded query; the moment a second org exists it becomes a cross-tenant data leak.
**Fix:** Add `where: { organizationId: session.user.organizationId }` to both queries.

### N1.4 [HIGH] Admin mutations don't verify target belongs to the admin's org — ✅ Mostly fixed 2026-06-09 (fix/priority-hardening)
**Resolution:** Added `lib/adminGuards.ts` (deliberately NOT `'use server'`) with org-ownership guards `requireAdminForUser/Group/Prompts/Category`, each checking role==='ADMIN' AND target `organizationId` match. Applied to by-id mutations in `users.ts` (updateUser, deleteUser), `auth.ts` (changePassword admin path), `groups.ts` (updateUserGroup, deleteGroup, updateGroupProfiles, addUserToGroup [+ target-user org check], removeUserFromGroup), and `prompts.ts` (deletePromptCategory, updatePrompt, togglePrompt, deletePrompt, reorderPrompts).
**Residual cross-org vectors — ✅ Mostly fixed 2026-06-09 (fix/security-residuals):**
- ✅ Added `requireAdminForProfiles(profileIds)` guard to `lib/adminGuards.ts` (mirrors `requireAdminForPrompts`) and applied it to ALL profile-connection paths: `updateGroupProfiles` (single + multi), `createGroup`, and `updateUserProfiles` — an admin can no longer attach another org's profile.
- ✅ `resolveCategory` moved to `lib/categoryUtils.ts` and org-scoped (`findFirst({ id, organizationId })`); a foreign/invalid `categoryId` resolves to `{ categoryId: null, categoryString: 'General' }` instead of attaching. Protects `createPrompt`/`updatePrompt`/`addProfileRule`/`updateProfileRule`. Covered by `tests/lib/resolveCategory.test.ts`. (Note: `helpers.ts` can't re-export it — `'use server'` files only allow async-function exports — so callers import from `@/lib/categoryUtils` directly.)
- ⬜ STILL OPEN (LOW): `removeUserFromGroup` doesn't org-check the `userId` (disconnect no-ops on a foreign user — low impact). `createGroup` also connects initial users by email with no org check (separate, lower-confidence vector). Tracked for a future pass.
**Where:** `app/actions/users.ts:66-68` (similar patterns in `prompts.ts`, `groups.ts`); root cause in `app/actions/helpers.ts:6-11`
`ensureAdmin()` only checks the global `role === 'ADMIN'` — mutation actions never verify the target record's `organizationId` matches the admin's. An Org A admin could modify Org B users/prompts/groups by ID. Related to (but distinct from) audit issues 1.4/1.6, which cover missing role checks; this is missing **ownership** checks.
**Fix:** In each admin mutation, load the target record and reject if `target.organizationId !== session.user.organizationId`. Consider a shared `ensureAdminForOrg(targetOrgId)` helper.

### N1.5 [MED] JournalEntry uniqueness is not timezone-aware
**Where:** `prisma/schema.prisma:217` (`@@unique([userId, promptId, date])`)
`date` is a DateTime while "today" is computed per user timezone in application code. The DB constraint and the app's notion of a user-day can disagree (especially around timezone changes or midnight boundaries), so duplicate same-day entries can slip past or legitimate entries can collide.
**Fix:** Store the user-day as a `String` `YYYY-MM-DD` (already user-timezone-scoped at write time) and put the unique constraint on that, matching how `RuleCompletion.periodKey` works.

### N1.6 [MED] All-users rule/task assignment has no bounds
**Where:** `app/actions/rules.ts:34-38`, `app/actions/tasks.ts:27-31`
`resolveAssignmentUserIds(..., ALL)` does an unbounded `findMany()` over users then creates N assignment rows synchronously in one request. Fine at current scale; at hundreds/thousands of users this becomes a slow request with a large transaction.
**Fix:** Batch the inserts (`createMany` in chunks) and log assignment counts; add a sanity cap with a warning.

### N1.7 [LOW] `StreakFreezeUsage.frozenDate` string is unvalidated
**Where:** `prisma/schema.prisma:256`, write path in `useStreakRecovery()`
`frozenDate` is a free-form String with no validation that it's a `YYYY-MM-DD` value. A bad write would silently corrupt frozen-day display.
**Fix:** Validate with `/^\d{4}-\d{2}-\d{2}$/` before insert (a small shared `assertDateKey()` helper would also serve `periodKey` writes).

### N1.8 [LOW] No data archival/retention strategy
**Where:** schema-wide; `DEPLOYMENT.md`
`JournalEntry` and `RuleCompletion` grow unbounded on a single SQLite file on EC2. Not urgent, but worth a documented plan (and pairs with the existing backup issue 66).
**Fix:** Document a retention/export approach in `DEPLOYMENT.md` (e.g., yearly export to S3); revisit if the DB file or query times grow.

### N1.9 [LOW] Weekly calendar `'all'` is unreachable when rules have mixed reset days
**Where:** `lib/rules.ts` `computeRuleCalendarStatus` (weekly branch), threshold `count >= weeklyAssignments.length`
Weekly completions are keyed `week-<resetDate>-R<resetDay>`, and the calendar buckets them by `<resetDate>` — which is partitioned by reset weekday (a date encodes its weekday, so completions for different reset days never share a bucket). But the `'all'` threshold compares each bucket's count against `weeklyAssignments.length` (the count of **all** weekly rules, across every reset day). So if a user has weekly rules with different reset days (e.g., one Sunday-reset, one Wednesday-reset), no single date bucket can ever reach the total, and the calendar shows `'partial'` even when every rule due on that reset day was completed — `'all'` becomes unreachable. Only affects users who mix weekly reset days; with the default uniform Sunday reset it behaves correctly. **Pre-existing**, not introduced by the N2.1 refactor (the refactor preserved this behavior exactly). NOTE: this is the issue earlier mislabeled a "Sunday collision/overwrite" — there is no overwrite, since distinct keys can never collapse to the same date bucket.
**Fix:** Compute the threshold per reset-day group: for each date bucket, compare its completed count against the number of weekly assignments sharing that reset day (e.g., group `weeklyAssignments` by `ruleType.resetDay` and size the `'all'` check against the matching group), rather than against the global weekly count.

---

## 2. Performance

### N2.1 [HIGH] `getRuleCalendarData` does O(dates × assignments) filtering — ✅ Fixed 2026-06-09 (fix/n2.1-rule-calendar-and-n4.1-docs)
**Resolution:** Extracted the pure transform into `computeRuleCalendarStatus(assignments)` and replaced the nested per-date `.filter().some()` scans with single-pass `Map<periodKey, count>` builds (daily + weekly), iterated once to classify `'all'`/`'partial'`. Now O(total completions). The `@@unique([ruleAssignmentId, periodKey])` constraint guarantees one completion per (assignment, period), so counting rows is exactly equivalent to the old distinct-assignment count — output is byte-for-byte identical. Weekly keys are validated before counting (symmetric with daily). Covered by `tests/lib/ruleCalendarData.test.ts` (11 cases: all/partial/empty, n=1 boundary, multi-date, malformed daily+weekly keys, mixed buckets).
**Where:** `lib/rules.ts:361-363`, `383-385`
For every calendar date, the code re-scans all rule assignments and their completions with nested `.filter()/.some()`. With a year of dates and many rules this is the most expensive computation on dashboard load.
**Fix:** Build a `Map<periodKey, Set<assignmentId>>` from completions once, then iterate dates with O(1) lookups.

### N2.2 [MED] Dashboard critical path serializes achievement evaluation
**Where:** `app/dashboard/page.tsx:125-142`
After the first `Promise.all`, achievement evaluation runs serially (two separate `userAchievement.findMany()` calls plus sequential upserts in `lib/achievementEvaluator.ts`) before the second `Promise.all` for rules/calendar data starts. The rule queries don't depend on achievements.
**Fix:** Run achievement evaluation in parallel with the rule/calendar queries; merge the two achievement fetches into one query partitioned in memory; batch the upserts with `$transaction`.

### N2.3 [MED] Cron streak reminder is N+1 over users
**Where:** `app/api/v1/cron/streak/route.ts:53-57`
The cron route iterates all users with active devices and queries each user's recent entries individually. Linear in users per run, all sequential.
**Fix:** Process users in parallel batches (e.g., chunks of 10–20 with `Promise.all`), or precompute streak status in a single grouped query.

### N2.4 [LOW] Missing indexes on Prompt lookup columns
**Where:** `prisma/schema.prisma` (Prompt model), used by `app/lib/data.ts:152-169`
`getActivePrompts()` filters by `categoryId` and legacy `categoryString` but the Prompt model has no index on either, so lookups scan the org's prompt table.
**Fix:** Add `@@index([organizationId, categoryId])` and `@@index([organizationId, categoryString])`.

### N2.5 [LOW] Task assignment query over-fetches task fields
**Where:** `app/dashboard/page.tsx:101-107`
`include: { task: true }` pulls every Task column into the dashboard payload; the sidebar needs only a handful of fields.
**Fix:** Use `select` for the fields the UI renders.

### N2.6 [LOW] SQLite production settings unverified
**Where:** `prisma/schema.prisma` datasource; `DEPLOYMENT.md`
Production runs SQLite under PM2. SQLite serializes writes globally; with concurrent server actions (journal autosave + rule toggles), write latency will grow before anything else does.
**Fix:** Confirm WAL mode and a sensible `busy_timeout` are enabled in production; document in `DEPLOYMENT.md`. Note Postgres as the escape hatch if concurrent users grow.

---

## 3. Usability

### N3.1 [HIGH] Journal autosave failures are effectively silent — ✅ Fixed 2026-06-09 (fix/priority-hardening)
**Resolution:** Rewrote `JournalEditor` with a sticky `hasError` flag: on save failure it shows a persistent "Save failed — your latest changes are not saved." banner + a Retry button (re-saves all dirty prompts) that stays until a save succeeds; "Saved HH:MM" now persists until the next edit. Error survives a sibling prompt's concurrent save (multi-prompt regression test). Covered by `tests/components/journalEditor.test.tsx`.
**Where:** `components/JournalEditor.tsx:51-60`, `90-100`
On save failure the status flips to 'error' for 2 seconds, then resets to 'idle'; the error is only `console.error`'d. A user can keep typing for minutes with nothing persisting and never know. Compounding it, the "Saved" confirmation also disappears after 2 seconds, so there's no persistent signal of save state at all.
**Fix:** Keep the error state visible until a save succeeds, with a "Retry" affordance; persist "Saved · HH:MM" until the next edit instead of clearing to idle.

### N3.2 [HIGH] No unsaved-changes protection on navigation — ✅ Fixed 2026-06-09 (fix/priority-hardening)
**Resolution:** Added a `beforeunload` handler that warns while any prompt is dirty or a save is in flight (read via refs so it sees live state), and a `visibilitychange → hidden` flush that immediately persists pending debounced saves. Dirty state tracked per-prompt in a ref, cleared only when the current value's save succeeds. Covered by `tests/components/journalEditor.test.tsx`.
**Where:** `components/JournalEditor.tsx`
The 1-second debounce plus in-flight saves mean closing the tab or navigating right after typing loses text, with no `beforeunload` warning and no pending-state check.
**Fix:** Add a `beforeunload` handler when current text differs from last-saved text or a save is in flight; flush the debounce on `visibilitychange`/blur.

### N3.3 [MED] Dashboard goes stale across midnight — ✅ Fixed 2026-06-09 (fix/daily-flow-ux)
**Resolution:** Added `components/MidnightRefreshNotice.tsx` (mount-only, rendered in `app/dashboard/page.tsx`). At the next midnight in the user's timezone — and on `visibilitychange`/`focus`, covering slept-through-midnight tabs — it fires a persistent (`duration: 0`) info toast "New day started — showing yesterday's view" with a Refresh button calling `router.refresh()`. No silent auto-refresh, so an in-progress journal entry is never clobbered. Covered by `tests/components/midnightRefreshNotice.test.tsx` (incl. a cross-timezone America/New_York case).
**Where:** `app/dashboard/page.tsx:45-65`, `components/CalendarSidebar.tsx`
"Today" is computed server-side at render. A user with the dashboard open past midnight (common for an evening journaling habit) keeps writing into yesterday's view until they manually refresh.
**Fix:** Client-side timer that fires at the next midnight in the user's timezone and calls `router.refresh()` (or shows a "New day — refresh" toast).

### N3.4 [MED] Rule checkboxes have no optimistic update — ✅ Fixed 2026-06-09 (fix/daily-flow-ux)
**Resolution:** Added shared client hook `components/hooks/useRuleToggle.ts` (`useOptimistic` + `useTransition` + error toast). `RuleCheckbox` and `DailyRulesCard.RuleRow` now flip the checkbox instantly on tap and auto-revert with an error toast on failure (the `⏳` spinner branch is gone). Covered by `tests/components/ruleCheckbox.test.tsx` and `tests/components/dailyRulesCard.test.tsx`.
**Where:** `components/RuleCheckbox.tsx:25-35`, `components/DailyRulesCard.tsx:35-50`
Toggling a rule disables the control until the server round-trip completes; the check doesn't appear immediately. On slow connections it feels like the tap didn't register — and this is the highest-frequency interaction in the app.
**Fix:** Use `useOptimistic` (the pattern already exists in `PastJournalView.tsx`) and revert with an error toast on failure.

### N3.5 [MED] Using a streak freeze has no confirmation, and failures offer no retry — ✅ Fixed 2026-06-09 (fix/daily-flow-ux)
**Resolution:** `StreakFreezeBanner` now requires an explicit second tap — the first "Recover" tap reveals a "Confirm: {cost}" button (showing the freeze/shield cost) plus Cancel. Failures, previously a silent no-op, now surface an error toast and revert to the Recover button as the retry path. Covered by `tests/components/streakFreezeBanner.test.tsx`.
**Where:** `components/StreakFreezeBanner.tsx:40-65`
"Recover" immediately spends scarce freezes/shields with no confirmation of the cost; if the action fails, the user has no retry path short of reloading.
**Fix:** Confirm with an explicit cost breakdown ("This uses X freezes and Y shields"); on failure show the error with a "Try again" button.

### N3.6 [MED] Freeze vs. shield mechanics are never explained in the UI
**Where:** `components/StreakFreezeItem.tsx`, `StreakShieldItem.tsx`, `StreakFreezeBanner.tsx`
The inventory shows earning progress (`counter/interval`) and the banner offers to spend items, but nothing in the UI explains what a freeze does vs. a shield, or how the earning counter increments.
**Fix:** Add a "How it works" expandable/info tooltip in the inventory page covering both item types and the earning rule.

### N3.7 [MED] Like-button visibility on past entries is inconsistent
**Where:** `components/PastJournalView.tsx`
The like control renders only when `isAdmin || optimisticLiked` — a non-admin user can see a like they can't interact with, and the feature's intent (admin feedback? bookmark?) isn't legible from the UI.
**Fix:** Decide the intent; render the control consistently for whichever role owns it (e.g., always for admins, read-only heart indicator for users).

### N3.8 [MED] Timezone change applies instantly with no undo
**Where:** `app/settings/TimezonePicker.tsx:80-100`
Selecting a timezone persists immediately. Since this silently shifts how entry dates are computed, an accidental selection has real consequences and no rollback. (The double-submit issue is already tracked; this is about confirmation/undo.)
**Fix:** Toast with an "Undo" window, or a one-line preview ("Daily entries will roll over at midnight {tz}") plus confirm.

### N3.9 [MED] `updateProfile` throws instead of returning errors
**Where:** `app/actions/settings.ts:20-50`, `app/settings/ProfileForm.tsx`
Avatar validation failures are thrown rather than returned as `{ error }` like every other action, so the client error path is inconsistent and server failures can leave the form stuck in "Saving…".
**Fix:** Return `{ error }` from `updateProfile`, handle it in the form with a toast; validate MIME type client-side before upload.

### N3.10 [LOW] Heatmap legend prop exists but renders nothing
**Where:** `components/ContributionHeatmap.tsx:30-60`
`showLegend` is accepted but no legend content is rendered, so users have no key for the green/blue/purple color encoding.
**Fix:** Render the legend (or remove the dead prop); enrich the cell `title` to include rule status alongside word count.

### N3.11 [LOW] Journal history sidebar renders nothing when empty
**Where:** `components/JournalHistoryList.tsx:15-25`
Early-returns on `dates.length === 0` with no placeholder — new users see a blank region. (The audit's 5.7 covers *generic* empty states; this one is *missing* entirely.)
**Fix:** Render "No journal entries yet" with a small icon.

### N3.12 [LOW] Login form doesn't state the password minimum
**Where:** `app/login/page.tsx:30-45`
`minLength={6}` is enforced but never communicated; users discover it via browser validation bounce.
**Fix:** Helper text under the field ("Minimum 6 characters") on signup/login forms.

### N3.13 [LOW] Achievement toasts can't be dismissed
**Where:** `components/AchievementToasts.tsx:15-25`
Multiple unlocks queue toasts at 800ms intervals with no dismiss control.
**Fix:** Add an X / click-to-dismiss on each toast.

### N3.14 [LOW] Task sidebar notes risk loss; expanded state not persisted
**Where:** `components/TaskSidebar.tsx:80-110`
Notes live in local state and can be lost if the user navigates before blur; expanded task collapses on refresh.
**Fix:** Debounced autosave on note input with a status indicator; optionally persist `expandedId` in URL/localStorage.

---

## 4. Documentation Drift & Hygiene

### N4.1 [HIGH] Docs contradict each other on the auth stack — ✅ Fixed 2026-06-09 (fix/n2.1-rule-calendar-and-n4.1-docs)
**Resolution:** Root cause was structural, not a wrong claim — the offending file is entirely a ScoringApp reference doc (Better Auth is *correct for ScoringApp*), just mislocated in journal-app's `docs/` with a weak banner. Rewriting it to NextAuth would have falsified a valid reference. Instead relocated it (see N4.2) and added a loud banner stating journal-app uses NextAuth v5. README.md and ARCHITECTURE.md were already correct and unchanged (except a discoverability pointer added to ARCHITECTURE.md).
**Where:** `README.md:72`, `ARCHITECTURE.md:13` vs `docs/architecture-and-decisions.md`
README/ARCHITECTURE correctly say NextAuth v5 (Credentials); `architecture-and-decisions.md` describes Better Auth + Prisma adapter (carried over from ScoringApp). Anyone using the latter doc gets the wrong mental model for sessions and route protection.
**Fix:** Make all docs state NextAuth v5; see N4.2 for the structural fix.

### N4.2 [MED] ScoringApp content dominates a journal-app doc — ✅ Fixed 2026-06-09 (fix/n2.1-rule-calendar-and-n4.1-docs)
**Resolution:** `git mv docs/architecture-and-decisions.md → docs/reference/scoringappPatterns.md` (history preserved) with a strong "this is ScoringApp, not journal-app" banner, plus a pointer line in `ARCHITECTURE.md`. Resolved together with N4.1.
**Where:** `docs/architecture-and-decisions.md`
Most of the file (tech stack, route protection, accessibility, SEO sections) describes ScoringApp, with only a header note saying it's a cross-reference. It's the source of the N4.1 contradiction.
**Fix:** Move ScoringApp material to `docs/reference/scoringappPatterns.md` with a clear banner; keep `architecture-and-decisions.md` journal-app-only.

### N4.3 [HIGH] DEPLOYMENT.md installs the wrong Node version — ✅ Fixed 2026-06-09 (fix/priority-hardening)
**Resolution:** Changed `setup_20.x` → `setup_22.x` to match `package.json` engines (`>=22.0.0 <23.0.0`).
**Where:** `DEPLOYMENT.md:24` vs `package.json` engines
The guide installs Node 20 (`setup_20.x`) but `package.json` pins `>=22.0.0 <23.0.0`. A fresh deploy following the guide fails (or runs on an unsupported runtime). **Verified.**
**Fix:** Change to `setup_22.x`.

### N4.4 [MED] DEPLOYMENT.md documents a nonexistent email env var — ✅ Fixed 2026-06-09 (fix/priority-hardening)
**Resolution:** Renamed `SOURCE_EMAIL` → `EMAIL_FROM` in DEPLOYMENT.md (confirmed code reads `EMAIL_FROM`; `SOURCE_EMAIL` referenced nowhere).
**Where:** `DEPLOYMENT.md:61` vs `lib/email/index.ts:23`
The guide sets `SOURCE_EMAIL`, but the code reads `EMAIL_FROM` (default `noreply@myjournal.com`) — following the guide means production email silently uses the fallback sender. **Verified.**
**Fix:** Rename to `EMAIL_FROM` in DEPLOYMENT.md.

### N4.5 [MED] Route-protection docs describe the wrong mechanism
**Where:** `docs/architecture-and-decisions.md` (Route Protection section)
Describes Better Auth session tokens and a public-route whitelist from ScoringApp; the real `proxy.ts`/`auth.config.ts` use NextAuth and rely heavily on per-page checks (the audit's 1.9 already flags coverage gaps as a security issue).
**Fix:** Rewrite the section for journal-app's actual mechanism and link the audit issue as a known limitation.

### N4.6 [MED] NEXTAUTH env vars under-documented for setup
**Where:** `GETTING_STARTED.md`, `README.md:94`, `DEPLOYMENT.md:51-62`
`NEXTAUTH_SECRET` appears in the deploy guide but the getting-started path doesn't cover it, and `NEXTAUTH_URL` requirements (must match the production domain) aren't stated anywhere.
**Fix:** Add both vars with one-line explanations to GETTING_STARTED.md and DEPLOYMENT.md.

### N4.7 [LOW] README overstates accessibility status
**Where:** `README.md:51-58`
README claims WCAG 2.2 features (proper labels, SR announcements) while the audit tracks 36 open a11y issues including exactly those gaps.
**Fix:** Reword to "WCAG 2.2 target" and link to the audit section.

### N4.8 [LOW] No docs index; feature docs are scattered
**Where:** `docs/`
Task assignment alone spans four files (assessment, exploration, design spec, plan); rules similarly. There's no "start here" map, and stale exploration docs sit beside current specs.
**Fix:** Add a short `docs/INDEX.md` mapping each feature to its authoritative doc and marking exploration files as archived.

---

## Suggested priority order

1. **Transactions for inventory/earning** (N1.1, N1.2) — silent data corruption under concurrency.
2. **Org scoping in admin queries/mutations** (N1.3, N1.4) — must land before any second organization exists.
3. **Autosave failure visibility + unsaved-changes guard** (N3.1, N3.2) — the only true data-loss UX risks in the core flow.
4. **Deployment doc fixes** (N4.3, N4.4) — verified, five-minute fixes that prevent a broken fresh deploy.
5. **Rule calendar O(n×m) + dashboard parallelization** (N2.1, N2.2) — biggest dashboard latency wins.
6. Everything else as scheduled maintenance.
