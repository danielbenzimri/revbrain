/**
 * Phase 2 — `requireFinding` / `optionalFinding` primitive.
 *
 * Spec: `docs/PDF-AND-GRAPH-DECISIONS.md` Phase 2 + Phase 3.
 *
 * The report assembler historically plugs silent defaults everywhere
 * (`?? 0`, `?? ''`, `?? 'Unknown'`) on ~105 sites. The PR that lands
 * Phase 3 migrates those sites to this primitive, which makes the
 * distinction between "required" and "legitimately optional"
 * explicit AND fails loudly at render time when a REQUIRED finding
 * is missing from the extraction.
 *
 * Why not just fail at the `?? 0` site? Because silent zeros cause
 * customer-facing PDFs to print things like "0 price rules" when
 * the collector failed to run, making the output look correct but
 * be entirely wrong (§8.3 class of bug, same as the 3102/0 graph
 * defect).
 *
 * The two primitives:
 *
 *   - `requireFinding(ctx, key, extractor)` — extracts a value from
 *     the findings bag for a KNOWN key. If the finding is missing
 *     OR the extractor returns `null` / `undefined`, the section
 *     is marked "unavailable" and a banner is pushed onto the
 *     report. The caller gets a typed fallback (usually `null`),
 *     not a silent zero.
 *
 *   - `optionalFinding(ctx, key, extractor, fallback)` — same shape
 *     but the caller declares an explicit fallback (usually `0` or
 *     the empty string) WITH a rationale. The rationale is logged
 *     so reviewers can see which absences are legitimate business
 *     semantics ("zero discount schedules = org has no pricing
 *     rules, expected") vs silent gaps.
 *
 * Both functions take an `AssembleReportContext` that carries the
 * running list of banners + the findings bag. The assembler
 * constructs one context at entry and threads it through.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';

/**
 * Classification of a finding site — either `required` (absence =
 * banner), `optional-explicit` (absence = fallback WITH rationale)
 * or `legitimately-zero` (absence = zero, documented at the site).
 */
export type FindingClassification = 'required' | 'optional-explicit' | 'legitimately-zero';

/** Banner shape — surfaced by the assembler into ReportData.reportBanners. */
export interface MissingFindingBanner {
  section: string;
  key: string;
  message: string;
}

/**
 * Context carried through the assembler for required/optional
 * lookups. Construct once at the top of `assembleReport()` and
 * thread through every section.
 */
export interface AssembleReportContext {
  findings: AssessmentFindingInput[];
  byType: Map<string, AssessmentFindingInput[]>;
  missingBanners: MissingFindingBanner[];
  /**
   * Diagnostic log of every `optionalFinding` rationale the
   * assembler relied on. Useful for PR reviewers to sanity-check
   * that every silent-default site actually passed through the
   * primitive.
   */
  optionalRationales: Array<{
    section: string;
    key: string;
    rationale: string;
    usedFallback: boolean;
  }>;
}

/**
 * Build the context once at the top of `assembleReport()`.
 */
export function buildAssembleReportContext(
  findings: AssessmentFindingInput[]
): AssembleReportContext {
  const byType = new Map<string, AssessmentFindingInput[]>();
  for (const f of findings) {
    if (!byType.has(f.artifactType)) byType.set(f.artifactType, []);
    byType.get(f.artifactType)!.push(f);
  }
  return {
    findings,
    byType,
    missingBanners: [],
    optionalRationales: [],
  };
}

/**
 * REQUIRED finding lookup. Returns the extracted value, or `null`
 * (+ pushes a banner) if the finding is missing. Sections that
 * call `requireFinding` and receive `null` should render a
 * "section unavailable" placeholder rather than fabricating data.
 *
 * @param ctx     The assembler context.
 * @param section Human-readable section name for the banner.
 * @param key     The finding key — usually `artifactType[:artifactName]`.
 *                When `key` is just an artifactType, the first finding
 *                of that type is used (matches the legacy `getOne`
 *                behavior). When `key` is `artifactType:artifactName`,
 *                an exact-name match is required.
 * @param extractor A function that pulls the needed value from the
 *                  finding. MUST return `null` when the value is
 *                  missing on the found finding.
 */
export function requireFinding<T>(
  ctx: AssembleReportContext,
  section: string,
  key: string,
  extractor: (f: AssessmentFindingInput) => T | null
): T | null {
  const finding = lookupFinding(ctx, key);
  if (finding === null) {
    ctx.missingBanners.push({
      section,
      key,
      message: `Required finding '${key}' is missing from the extraction. Section '${section}' will render as "unavailable".`,
    });
    return null;
  }
  const value = extractor(finding);
  if (value === null || value === undefined) {
    ctx.missingBanners.push({
      section,
      key,
      message: `Required finding '${key}' was found but its value extractor returned null. Section '${section}' will render as "unavailable".`,
    });
    return null;
  }
  return value;
}

/**
 * OPTIONAL finding lookup with an explicit fallback. The rationale
 * is logged to `ctx.optionalRationales` so PR reviewers can audit
 * every silent-default site.
 */
export function optionalFinding<T>(
  ctx: AssembleReportContext,
  section: string,
  key: string,
  extractor: (f: AssessmentFindingInput) => T | null,
  fallback: T,
  rationale: string
): T {
  const finding = lookupFinding(ctx, key);
  if (finding === null) {
    ctx.optionalRationales.push({
      section,
      key,
      rationale,
      usedFallback: true,
    });
    return fallback;
  }
  const value = extractor(finding);
  if (value === null || value === undefined) {
    ctx.optionalRationales.push({
      section,
      key,
      rationale,
      usedFallback: true,
    });
    return fallback;
  }
  ctx.optionalRationales.push({
    section,
    key,
    rationale,
    usedFallback: false,
  });
  return value;
}

/** Internal — look up the first finding matching the key. */
function lookupFinding(ctx: AssembleReportContext, key: string): AssessmentFindingInput | null {
  const colonIdx = key.indexOf(':');
  if (colonIdx === -1) {
    const bucket = ctx.byType.get(key);
    return bucket && bucket.length > 0 ? bucket[0]! : null;
  }
  const artifactType = key.slice(0, colonIdx);
  const artifactName = key.slice(colonIdx + 1);
  const bucket = ctx.byType.get(artifactType);
  if (!bucket) return null;
  return bucket.find((f) => f.artifactName === artifactName) ?? null;
}
