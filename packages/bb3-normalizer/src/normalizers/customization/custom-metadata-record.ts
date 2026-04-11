/**
 * CustomMetadataRecordIR normalizer (EXT-1.3).
 *
 * Spec: §5.3 CustomMetadataTypeIR + extension for record-level
 * granularity. The pre-EXT-1.3 collector emitted only one finding
 * per CMT TYPE; post-fix it ALSO emits one finding per CMT
 * RECORD with `findingType: 'custom_metadata_record'` and the
 * record's serialized values in `evidenceRefs`. This normalizer
 * produces an IR node per record so downstream BBs (BB-4
 * segmentation, BB-5 disposition) can plan migrations against
 * individual rule entries instead of opaque type counts.
 *
 * Identity: `(parentTypeName, developerName)`. The `developerName`
 * is the per-record name, NOT the type name. Two records of the
 * same type with different developer names hash to different
 * node ids; the §8.3 distinctness invariant is satisfied at the
 * per-record level.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';
import type { IRNodeBase } from '@revbrain/migration-ir-contract';
import type { NormalizerFn } from '../registry.ts';
import { buildBaseNode } from '../base.ts';

export interface CustomMetadataRecordIR extends IRNodeBase {
  nodeType: 'CustomMetadataRecord';
  /** The CMT type API name (e.g. `MyRulesEngine__mdt`). */
  parentTypeName: string;
  /** The per-record developer name (the second segment of artifactName). */
  developerName: string;
  /** The MasterLabel from the record, or developerName if absent. */
  label: string;
  /** Field values serialized to `{name: string; value: string}` pairs. */
  fieldValues: Array<{ name: string; value: string }>;
}

export const normalizeCustomMetadataRecord: NormalizerFn = (finding: AssessmentFindingInput) => {
  // artifactName is `<typeDevName>.<recordDevName>` from the
  // EXT-1.3 collector. Split safely.
  const parts = finding.artifactName.split('.');
  const parentTypeDevName = parts[0] ?? finding.artifactName;
  const developerName = parts[1] ?? finding.artifactName;
  const parentTypeName = `${parentTypeDevName}__mdt`;

  // EXT-1.3 wave-2 fix — read MasterLabel from a structured
  // evidence-ref the collector emits with `value: 'masterLabel'`
  // (the older normalizer parsed `notes.split('record:')[1]` which
  // coupled the consumer to the producer's free-text format and
  // broke contentHash determinism if anyone touched the notes
  // string). Fall back to developerName if the ref is missing
  // (e.g. for findings emitted by an older collector version).
  const labelRef = finding.evidenceRefs.find(
    (r) => r.type === 'field-ref' && r.value === 'masterLabel'
  );
  const label = labelRef?.label ?? developerName;

  // Field values come from the field-ref evidenceRefs the
  // collector emits. Each ref carries `value: '<typeApi>.<field>'`
  // and `label: '<actual data>'`.
  const fieldValues = finding.evidenceRefs
    .filter((r) => r.type === 'field-ref' && r.value.startsWith(`${parentTypeName}.`))
    .map((r) => ({
      name: r.value.slice(parentTypeName.length + 1),
      value: r.label ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const stableIdentity = { parentTypeName, developerName };
  const semanticPayload = { ...stableIdentity, label, fieldValues };

  const base = buildBaseNode({
    finding,
    nodeType: 'CustomMetadataRecord',
    stableIdentity,
    semanticPayload,
    developerName,
  });

  const node: CustomMetadataRecordIR = {
    ...base,
    nodeType: 'CustomMetadataRecord',
    parentTypeName,
    developerName,
    label,
    fieldValues,
  };
  return { nodes: [node] };
};
