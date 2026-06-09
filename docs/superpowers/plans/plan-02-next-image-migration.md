# Task 2: Migrate `<img>` to `next/image`

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all `<img>` tags with Next.js `<Image>` component for automatic optimization (lazy loading, responsive sizing, format conversion).

**Architecture:** All images in this app are either small logos (32x32 or 24x24) or user avatars (32x32). We'll use `next/image` with explicit width/height for these fixed-size images. Since images come from `/uploads/` (local filesystem), we need no remote pattern config — Next.js handles local `public/` images natively.

**Tech Stack:** Next.js 16 `next/image`, TypeScript

---

### Files

- Modify: `app/page.tsx` (line 21 — logo)
- Modify: `app/dashboard/page.tsx` (lines 164, 212 — logo + avatar)
- Modify: `components/DashboardShell.tsx` (line 59 — logo)
- Modify: `app/stats/page.tsx` (line 66 — logo)
- Modify: `app/settings/page.tsx` (line 52 — logo)

### Context

All `<img>` usages in the codebase:

1. **`app/page.tsx:21`** — `<img src={org.logoUrl} alt="Logo" className="w-8 h-8 object-contain" />`
2. **`app/dashboard/page.tsx:164`** — `<img src={brandingOrg.logoUrl} alt="Logo" className="w-6 h-6 object-contain" />`
3. **`app/dashboard/page.tsx:212`** — `<img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />`
4. **`components/DashboardShell.tsx:59`** — `<img src={logoUrl} alt="Logo" className="w-6 h-6 object-contain" />`
5. **`app/stats/page.tsx:66`** — `<img src={org.logoUrl} alt="Logo" className="w-6 h-6 object-contain" />`
6. **`app/settings/page.tsx:52`** — `<img src={org.logoUrl} alt="Logo" className="w-6 h-6 object-contain" />`

**Not migrating:** `app/settings/ProfileForm.tsx` uses `<img>` for a client-side blob URL preview — `next/image` doesn't support blob URLs well, so leave it as `<img>`.

All logo/avatar images are stored in `public/uploads/` (local filesystem). No `remotePatterns` config is needed — Next.js handles `public/` images natively.

---

- [ ] **Step 1: Update `app/page.tsx` — landing page logo**

Add the import and replace the `<img>`:

```typescript
// Add to imports at top of file:
import Image from "next/image";

// Replace line 21:
// OLD: {org?.logoUrl && <img src={org.logoUrl} alt="Logo" className="w-8 h-8 object-contain" />}
// NEW:
{org?.logoUrl && <Image src={org.logoUrl} alt="Logo" width={32} height={32} className="object-contain" />}
```

- [ ] **Step 2: Update `app/dashboard/page.tsx` — sidebar logo and avatar**

Add the import and replace both `<img>` tags:

```typescript
// Add to imports:
import Image from "next/image";

// Replace line 164 (sidebar logo):
// OLD: {brandingOrg?.logoUrl && <img src={brandingOrg.logoUrl} alt="Logo" className="w-6 h-6 object-contain" />}
// NEW:
{brandingOrg?.logoUrl && <Image src={brandingOrg.logoUrl} alt="Logo" width={24} height={24} className="object-contain" />}

// Replace line 212 (avatar):
// OLD: <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
// NEW:
<Image src={avatarUrl} alt="Avatar" width={32} height={32} className="w-full h-full object-cover" />
```

- [ ] **Step 3: Update `components/DashboardShell.tsx` — mobile header logo**

```typescript
// Add to imports:
import Image from "next/image";

// Replace line 59:
// OLD: {logoUrl && <img src={logoUrl} alt="Logo" className="w-6 h-6 object-contain" />}
// NEW:
{logoUrl && <Image src={logoUrl} alt="Logo" width={24} height={24} className="object-contain" />}
```

- [ ] **Step 4: Update `app/stats/page.tsx` — stats sidebar logo**

```typescript
// Add to imports:
import Image from "next/image";

// Replace line 66:
// OLD: {org?.logoUrl && <img src={org.logoUrl} alt="Logo" className="w-6 h-6 object-contain" />}
// NEW:
{org?.logoUrl && <Image src={org.logoUrl} alt="Logo" width={24} height={24} className="object-contain" />}
```

- [ ] **Step 5: Update `app/settings/page.tsx` — settings sidebar logo**

```typescript
// Add to imports:
import Image from "next/image";

// Replace line 52:
// OLD: {org?.logoUrl && <img src={org.logoUrl} alt="Logo" className="w-6 h-6 object-contain" />}
// NEW:
{org?.logoUrl && <Image src={org.logoUrl} alt="Logo" width={24} height={24} className="object-contain" />}
```

- [ ] **Step 6: Verify no remaining `<img>` tags (except ProfileForm blob preview)**

Run: `grep -rn '<img ' app/ components/ --include="*.tsx" --include="*.ts"`
Expected: No results (all migrated).

- [ ] **Step 7: Verify the build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds. No warnings about unoptimized images.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx app/dashboard/page.tsx components/DashboardShell.tsx app/stats/page.tsx app/settings/page.tsx
git commit -m "perf: migrate all <img> tags to next/image for automatic optimization

Replaces 5 instances of <img> with Next.js Image component across
landing page, dashboard, sidebar, and stats pages. Enables automatic
lazy loading, WebP/AVIF conversion, and responsive sizing.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
