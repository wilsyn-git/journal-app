# Batch Sync N+1 Fix

**Issue:** #41
**Date:** 2026-04-06

## Problem

`app/api/v1/entries/batch/route.ts` processes up to 50 entries sequentially with individual queries — up to 100 DB round-trips per request. This is the main mobile sync endpoint.

## Solution

Replace the sequential loop with:

1. **One `findMany`** — fetch all existing entries for the user matching any (promptId, date) combo in the batch
2. **One `$transaction`** — all creates and updates in a single atomic write

## Error Handling

- Transaction rolls back entirely on any failure — no partial syncs
- Endpoint returns 500 with clear error on failure
- Client retries the full batch

## Edge Cases

- Empty entries array: return `{ synced: 0 }` immediately
- Duplicate promptId+date in same batch: last one wins

## What Doesn't Change

- Request/response schema (`{ synced, errors }`)
- Validation, auth, timezone handling
- Max 50 entries per batch
