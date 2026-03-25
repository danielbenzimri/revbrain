/**
 * Context Definition field inventory (Context Blueprint).
 *
 * Builds the "Context Definition" that maps every extracted artifact
 * to its RCA equivalent, producing the field-level inventory that
 * the LLM uses for migration planning.
 *
 * The blueprint contains:
 * - Source CPQ field → Target RCA field mapping candidates
 * - Mapping complexity per field (direct, transform, redesign, no-equivalent)
 * - Custom field inventory requiring manual migration decisions
 * - Aggregate mapping coverage percentage
 *
 * See: Extraction Spec — Context Definition field inventory
 */

import type { CollectorContext, CollectorResult } from '../collectors/base.ts';

export interface ContextBlueprint {
  fields: FieldMapping[];
  coveragePercent: number;
  unmappedCount: number;
}

export interface FieldMapping {
  sourceObject: string;
  sourceField: string;
  targetObject?: string;
  targetField?: string;
  mappingComplexity: 'direct' | 'transform' | 'redesign' | 'no-equivalent';
  notes?: string;
}

/**
 * Build the Context Blueprint from extraction results.
 */
export async function buildContextBlueprint(
  _ctx: CollectorContext,
  _results: Map<string, CollectorResult>
): Promise<ContextBlueprint> {
  // TODO: Iterate over catalog findings to build source field inventory
  // TODO: Match source fields against known RCA field mappings
  // TODO: Classify unmapped fields by mapping complexity
  // TODO: Incorporate custom field findings from customizations collector
  // TODO: Calculate overall mapping coverage percentage
  // TODO: Write context blueprint to assessment_runs.context_blueprint JSONB

  return {
    fields: [],
    coveragePercent: 0,
    unmappedCount: 0,
  };
}
