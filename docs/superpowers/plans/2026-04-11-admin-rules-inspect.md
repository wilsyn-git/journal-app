# Admin Rules Status in Inspect View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a read-only rules status card when an admin inspects a user via `?viewUserId=...` on the dashboard.

**Architecture:** New server component `AdminRulesCard` renders all assigned rules grouped by type with completion status. Dashboard conditionally renders it for non-self views. No new data fetching — `ruleGroups` is already computed.

**Tech Stack:** Next.js server component, TypeScript, Tailwind CSS

---

### Task 1: Create AdminRulesCard component

**Files:**
- Create: `components/AdminRulesCard.tsx`

**Spec:** `docs/superpowers/specs/2026-04-11-admin-rules-inspect-design.md`

- [ ] **Step 1: Create `components/AdminRulesCard.tsx`**

```tsx
import { formatResetSchedule } from '@/lib/rules'

type RuleGroup = {
  ruleType: {
    name: string
    resetMode: string
    resetDay: number | null
    resetIntervalDays: number | null
  }
  rules: {
    assignmentId: string
    title: string
    isCompleted: boolean
  }[]
}

type Props = {
  ruleGroups: RuleGroup[]
}

export function AdminRulesCard({ ruleGroups }: Props) {
  const allRules = ruleGroups.flatMap(g => g.rules)
  if (allRules.length === 0) return null

  const completed = allRules.filter(r => r.isCompleted).length
  const total = allRules.length
  const allDone = completed === total

  return (
    <div className={`mb-6 rounded-xl border p-4 ${allDone ? 'border-green-500/20 bg-green-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Rules</span>
          <span className="text-xs text-gray-400">{completed}/{total}</span>
          {allDone && <span className="text-xs text-green-400">✓ Complete</span>}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="w-full bg-white/10 rounded-full h-1 mb-4">
        <div
          className={`h-1 rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-purple-500'}`}
          style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
        />
      </div>

      {/* Rule groups */}
      <div className="space-y-4">
        {ruleGroups.map(group => {
          const schedule = formatResetSchedule(group.ruleType)
          return (
            <div key={group.ruleType.name}>
              <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                {group.ruleType.name} <span className="normal-case">· {schedule}</span>
              </div>
              <div className="space-y-1">
                {group.rules.map(rule => (
                  <div
                    key={rule.assignmentId}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
                      rule.isCompleted ? 'text-green-300/70' : 'text-white'
                    }`}
                  >
                    <span className="text-sm flex-shrink-0">
                      {rule.isCompleted ? '✅' : '⬜'}
                    </span>
                    <span className={rule.isCompleted ? 'line-through' : ''}>
                      {rule.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `AdminRulesCard`

- [ ] **Step 3: Commit**

```bash
git add components/AdminRulesCard.tsx
git commit -m "feat: add read-only AdminRulesCard component"
```

---

### Task 2: Integrate AdminRulesCard into dashboard

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Add import**

At the top of `app/dashboard/page.tsx`, after the `DailyRulesCard` import (line 26), add:

```tsx
import { AdminRulesCard } from '@/components/AdminRulesCard'
```

- [ ] **Step 2: Add AdminRulesCard below DailyRulesCard**

In `app/dashboard/page.tsx`, find the block at lines 357-363:

```tsx
                    {isViewingSelf && dailyRules.length > 0 && (
                        <DailyRulesCard rules={dailyRules.map(r => ({
                            assignmentId: r.assignmentId,
                            title: r.title,
                            isCompleted: r.isCompleted,
                        }))} />
                    )}
```

Immediately after the closing `)}` on line 363, add:

```tsx
                    {!isViewingSelf && ruleGroups.length > 0 && (
                        <AdminRulesCard ruleGroups={ruleGroups.map(g => ({
                            ruleType: {
                                name: g.ruleType.name,
                                resetMode: g.ruleType.resetMode,
                                resetDay: g.ruleType.resetDay,
                                resetIntervalDays: g.ruleType.resetIntervalDays,
                            },
                            rules: g.rules.map(r => ({
                                assignmentId: r.assignmentId,
                                title: r.title,
                                isCompleted: r.isCompleted,
                            })),
                        }))} />
                    )}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: show rules status when admin inspects a user"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test admin inspect view**

1. Log in as admin
2. On `/dashboard`, select a user from the "Inspect User" dropdown
3. Verify the Rules card appears above journal entries showing all assigned rules grouped by type
4. Verify completed rules show ✅ with strikethrough, incomplete show ⬜
5. Verify progress bar and count are correct
6. Verify the card does NOT appear when viewing your own dashboard (DailyRulesCard should show instead)
7. Verify the card does NOT appear if the inspected user has no rule assignments
