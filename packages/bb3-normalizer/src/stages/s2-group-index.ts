/**
 * Stage 2 — Group & index.
 *
 * Spec: §6.1 Stage 2.
 *
 * Builds three lookup maps from the validated finding list so later
 * stages can find findings by `findingKey`, `artifactType`, or
 * `collectorName` in O(1). Detects duplicate `findingKey` (the I2
 * input invariant) and hard-fails if it's violated — per spec, that's
 * a guaranteed property of the extraction layer and a violation
 * points at a bug upstream of BB-3.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import { BB3InputError } from '@revbrain/migration-ir-contract';

export interface FindingIndex {
  /** Lookup by the finding's globally-unique key. */
  byFindingKey: ReadonlyMap<string, AssessmentFindingInput>;
  /** Lookup by `artifactType` — many findings per type. */
  byArtifactType: ReadonlyMap<string, readonly AssessmentFindingInput[]>;
  /** Lookup by `collectorName` — many findings per collector. */
  byCollector: ReadonlyMap<string, readonly AssessmentFindingInput[]>;
  /**
   * PH9.2 — Lookup by Salesforce record id (`artifactId`).
   * Child nodes carry raw Salesforce record-ids in their evidenceRefs
   * (e.g. `PriceCondition.ownerRule.id` starts as a raw record-id);
   * Stage 4 uses this index to resolve them to the parent finding
   * that became a real normalized node. Omitted findings (no
   * `artifactId`) do not appear in this map.
   */
  byArtifactId: ReadonlyMap<string, AssessmentFindingInput>;
  /**
   * PH9.2 — Lookup by `artifactName`. Multiple findings may share
   * the same name across collectors (e.g. a `PriceRule` seen by
   * both the `pricing` and `dependency` collectors); the value is
   * the first-seen finding, sufficient for the synthetic-id
   * resolution pattern used by Stage 4 (e.g. `bundle:${code}` →
   * look up the BundleStructure finding by its productCode).
   */
  byArtifactName: ReadonlyMap<string, AssessmentFindingInput>;
}

/**
 * Build the finding indices. Duplicate `findingKey` values
 * hard-fail with `BB3InputError` — see §4.5 invariant I2.
 */
export function buildFindingIndex(findings: AssessmentFindingInput[]): FindingIndex {
  const byFindingKey = new Map<string, AssessmentFindingInput>();
  const byArtifactType = new Map<string, AssessmentFindingInput[]>();
  const byCollector = new Map<string, AssessmentFindingInput[]>();
  const byArtifactId = new Map<string, AssessmentFindingInput>();
  const byArtifactName = new Map<string, AssessmentFindingInput>();

  for (const finding of findings) {
    if (byFindingKey.has(finding.findingKey)) {
      throw new BB3InputError(
        `duplicate findingKey '${finding.findingKey}' — extraction layer violated invariant I2`,
        { code: 'BB3_GI001', findingKey: finding.findingKey }
      );
    }
    byFindingKey.set(finding.findingKey, finding);

    const typeList = byArtifactType.get(finding.artifactType);
    if (typeList) typeList.push(finding);
    else byArtifactType.set(finding.artifactType, [finding]);

    const collectorList = byCollector.get(finding.collectorName);
    if (collectorList) collectorList.push(finding);
    else byCollector.set(finding.collectorName, [finding]);

    if (finding.artifactId !== undefined && !byArtifactId.has(finding.artifactId)) {
      byArtifactId.set(finding.artifactId, finding);
    }
    // First-seen wins — duplicates are a normal cross-collector artifact
    // and Stage 4's merge handles them at the node level.
    if (!byArtifactName.has(finding.artifactName)) {
      byArtifactName.set(finding.artifactName, finding);
    }
  }

  return {
    byFindingKey,
    byArtifactType,
    byCollector,
    byArtifactId,
    byArtifactName,
  };
}
