# Staging UI Fix Plan

> **Date:** 2026-04-09
> **Problem:** Overview page shows "No data available yet" in staging mode. SF connection flow blocked.
> **Root cause:** Commit `d218b75` (March 29) eliminated mock data fallbacks in staging mode, but real API data fetching was never added to replace it.
> **Impact:** Cannot connect Salesforce through the UI, which blocks fresh extraction and V2.1 PDF generation.

## Root Cause Analysis

The `OverviewPage.tsx` has this code (line 611-617):

```typescript
const data = useMemo(() => {
  if (!id) return null;
  if (isMockMode) {
    return getMockProjectWorkspaceData(id);
  }
  return null;  // ← BUG: staging mode always returns null
}, [id, isMockMode]);
```

When `data` is null, line 638 renders "No data available yet." — hiding the entire Overview including the SF connection cards.

## Fix Required

The OverviewPage needs to build its `data` from real API responses (project details + SF connections + assessment status) when not in mock mode. The mock data structure (`ProjectWorkspaceData`) defines what fields are needed — we just need to populate them from API calls.

## Tasks

| # | Task | Description | Files |
|---|------|-------------|-------|
| 1 | **Build real data fetcher for OverviewPage** | Use existing hooks (`useSalesforceConnections`, `useProject`) to construct `ProjectWorkspaceData` from real API responses. Health strip, connection cards, recent activity — all from API. | `OverviewPage.tsx` |
| 2 | **Verify SF connection flow works** | Test: click Connect → OAuth redirect → callback → connection stored. Use Playwright to verify end-to-end. | Playwright test |
| 3 | **Verify 403 errors are non-blocking** | The 403s on `audit`, `tenants`, `stats` are admin-only routes. Confirm they don't block normal user flow. | Console check |

## Immediate Workaround

While the proper fix is built, the Salesforce connection can be initiated via direct URL navigation. The OAuth endpoint doesn't depend on the Overview page rendering.
