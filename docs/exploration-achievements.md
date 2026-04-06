# Achievements System — Exploration Notes

**Date:** 2026-04-06
**Status:** Needs design

---

## Current State

Five hardcoded badges in `app/lib/analytics.ts:128-163`. No database model, no persistence. Computed fresh on every page load from raw entry data.

| Badge | Condition | Problem |
|-------|-----------|---------|
| Early Bird | 5 entries between 4AM-8AM | Arbitrary threshold, no tiers |
| Night Owl | 5 entries between 10PM-4AM | Same |
| On a Roll | 7-day max streak | Redundant with streak display |
| Dedicated | 100 total answers | Can't un-earn, but technically recomputed |
| Wordsmith | Avg word count > 50 (with 5+ entries) | Can un-unlock if avg drops |

**Problems:**
- No persistence — achievements are recomputed, not earned. No "moment of achievement."
- Some can un-unlock (Wordsmith) which feels wrong.
- No rewards — unlocking a badge does nothing.
- No tiers — 7-day streak and 100-day streak get the same badge.
- No discoverability — users don't know what achievements exist or why they'd chase them.
- No infrastructure — adding achievements means editing a hardcoded array.

## Open Questions

1. **Primary purpose** — Motivation loop vs. recognition/delight vs. inventory fuel? (Likely a blend, but which leads?)
2. **Achievement definition** — How are they defined? Database-driven? Config file? Still code but structured?
3. **Tracking** — When is an achievement "earned"? Persisted in DB so it can't un-unlock? Or still derived?
4. **Rewards** — Should achievements grant inventory items (freezes, shields, future items)?
5. **Tiers** — Should achievements have levels (7-day streak → 30-day → 100-day)?
6. **Visibility** — Should locked achievements be visible (with progress) or hidden until earned?
7. **Which achievements to keep** — The current five may not be the right set. Need to decide what behaviors we actually want to recognize.

## Next Step

Decide which current achievements to keep/cut, then design the system that manages them.
