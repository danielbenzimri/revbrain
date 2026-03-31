# V3 to V4 Delta Summary

> Generated: 2026-03-31T10:59:18.926Z
> Source: assessment-results.json (809 findings)

## Validation Gate

- ReportConsistencyValidator (V17-V24): **ALL PASSED**
- Errors: 0
- Warnings: 0

## Key Metric Deltas (V3 vs V4)

| Metric | V3 Value | V4 Value | Change | Rationale |
|--------|----------|----------|--------|-----------|
| Active Products | 38 (proxy from category subtotals) | 176 (inferred) | +138 | V4 counts all Product2 findings; V3 only summed category subtotals. Source: inferred from extraction |
| Total Products | ~38 (was same as active) | 179 | +141 | V4 correctly distinguishes total vs active |
| Bundle-capable Products | Not reported | 76 | New metric | Products with ConfigurationType in (Allowed, Required) |
| Product Options | Not reported | 475 | New metric | SBQQ__ProductOption__c count |
| Top Product % (max) | >100% (117%) | 30% | Fixed | V3 used wrong denominator (Quote Templates=6 instead of totalQuotes=23) |
| All Top Products <= 100% | No | Yes | Fixed | totalQuotes denominator corrected |
| sbaa Version | "Not installed" | "v" | Fixed | Three-level fallback: InstalledPackage -> OrgFingerprint -> CPQSettingValue |
| sbaa Installed | Unknown | true | Detected | Package namespace found in installed packages |
| Approval Rules | "not detected" (0) | 0 | Still 0 (sbaa objects may not be accessible) | sbaa describe may have been skipped; approval objects not queryable in this org |
| Active Users (warning) | 0 in warning, 1 in panel | 1 in both | Reconciled | Single source (ReportCounts.activeUsers) used everywhere |
| Active Users Source | Unknown | UserBehavior | Explicit | UserAdoption primary, UserBehavior fallback |
| Total Quotes | 6 (was Quote Templates count!) | 23 | Fixed | V3 matched "Quote Templates" DataCount; V4 specifically matches "Quotes (90d)" / "Quotes (all)" |
| Flow Count (Active) | 44 | 44 | Unchanged | Verified against SOQL (T6) |
| Validation Rules | 25 | 25 | Unchanged | Verified against SOQL (T7) |

## Structural Changes

1. **Package filtering (Section 4.2):** "Package:" entries removed from Core Settings. Packages appear only in dedicated Installed Packages section (Section 4.1).
2. **Bundle label:** Changed from "Bundles" to "Bundle-capable Products" for accuracy.
3. **Conditional labels:** "Products Extracted" shown when activeProductSource is inferred; "Active Products" shown only when IsActive field is available.
4. **Active user reconciliation:** Low-volume warning and At-a-Glance panel now use identical count from ReportCounts.
5. **Appendix D coverage:** Product Catalog coverage reflects actual extraction depth (Full/Partial/Minimal).
6. **Complexity rationale:** References actual counts instead of generic text; no "no product options" contradiction.

## Items Unchanged

- CPQ Version: 232.2.0
- Active Price Rules: 20 of 28
- Active Product Rules: 37 of 38
- Apex Classes: 67
- Triggers: 5
