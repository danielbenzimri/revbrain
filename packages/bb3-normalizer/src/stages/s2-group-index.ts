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
  byFindingKey: Map<string, AssessmentFindingInput>;
  /** Lookup by `artifactType` — many findings per type. */
  byArtifactType: Map<string, AssessmentFindingInput[]>;
  /** Lookup by `collectorName` — many findings per collector. */
  byCollector: Map<string, AssessmentFindingInput[]>;
}

/**
 * Build the three finding indices. Duplicate `findingKey` values
 * hard-fail with `BB3InputError` — see §4.5 invariant I2.
 */
export function buildFindingIndex(findings: AssessmentFindingInput[]): FindingIndex {
  const byFindingKey = new Map<string, AssessmentFindingInput>();
  const byArtifactType = new Map<string, AssessmentFindingInput[]>();
  const byCollector = new Map<string, AssessmentFindingInput[]>();

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
  }

  return { byFindingKey, byArtifactType, byCollector };
}
