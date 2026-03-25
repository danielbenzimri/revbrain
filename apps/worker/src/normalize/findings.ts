/**
 * Finding factory — creates AssessmentFinding records for DB insertion.
 *
 * All collectors use this factory to ensure consistent finding structure,
 * proper finding_key generation, and LLM-readiness metadata.
 *
 * See: Implementation Plan Task 1.4
 */

import {
  type AssessmentFindingInput,
  type AssessmentDomain,
  type EvidenceRef,
  generateFindingKey,
} from '@revbrain/contract';

interface CreateFindingParams {
  domain: AssessmentDomain;
  collector: string;
  artifactType: string;
  artifactName: string;
  artifactId?: string;
  sourceType: 'object' | 'metadata' | 'tooling' | 'bulk-usage' | 'inferred';
  sourceRef?: string;
  // Finding key parts
  findingType?: string;
  metricName?: string;
  scope?: string;
  // Classification
  riskLevel?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  complexityLevel?: 'very-high' | 'high' | 'medium' | 'low';
  migrationRelevance?: 'must-migrate' | 'should-migrate' | 'optional' | 'not-applicable';
  rcaTargetConcept?: string;
  rcaMappingComplexity?: 'direct' | 'transform' | 'redesign' | 'no-equivalent';
  // Data
  detected?: boolean;
  countValue?: number;
  textValue?: string;
  usageLevel?: 'high' | 'medium' | 'low' | 'dormant';
  evidenceRefs?: EvidenceRef[];
  notes?: string;
}

/**
 * Create a finding with auto-generated finding_key.
 * Returns a validated AssessmentFindingInput ready for DB insertion.
 */
export function createFinding(params: CreateFindingParams): AssessmentFindingInput {
  const findingKey = generateFindingKey({
    collector: params.collector,
    artifactType: params.artifactType,
    recordId: params.artifactId,
    findingType: params.findingType,
    metricName: params.metricName,
    scope: params.scope,
  });

  return {
    domain: params.domain,
    collectorName: params.collector,
    artifactType: params.artifactType,
    artifactName: params.artifactName,
    artifactId: params.artifactId,
    findingKey,
    sourceType: params.sourceType,
    sourceRef: params.sourceRef,
    detected: params.detected ?? true,
    countValue: params.countValue,
    textValue: params.textValue,
    usageLevel: params.usageLevel,
    riskLevel: params.riskLevel,
    complexityLevel: params.complexityLevel,
    migrationRelevance: params.migrationRelevance,
    rcaTargetConcept: params.rcaTargetConcept,
    rcaMappingComplexity: params.rcaMappingComplexity,
    evidenceRefs: params.evidenceRefs ?? [],
    notes: params.notes,
    schemaVersion: '1.0',
  };
}
