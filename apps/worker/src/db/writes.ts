/**
 * Provenance-based batch writes for collector findings.
 *
 * Pattern: within a single transaction:
 * 1. Delete previous findings for THIS collector (by collector_name)
 * 2. Delete relationships referencing those findings
 * 3. Insert fresh findings (batches of 1000)
 * 4. Insert intra-collector relationships
 * 5. Upsert collector metrics
 *
 * See: Architecture Spec Section 11.4, Implementation Plan Task 1.5
 */

import type postgres from 'postgres';
import type {
  AssessmentFindingInput,
  AssessmentRelationshipInput,
  CollectorMetricsInput,
} from '@revbrain/contract';
import { logger } from '../lib/logger.ts';

const DEFAULT_BATCH_SIZE = 1000;

interface WriteCollectorDataParams {
  sql: postgres.Sql;
  runId: string;
  organizationId: string;
  collectorName: string;
  findings: AssessmentFindingInput[];
  relationships?: AssessmentRelationshipInput[];
  metrics?: CollectorMetricsInput;
  batchSize?: number;
}

/**
 * Write all collector output in a single transaction.
 * Provenance-based: deletes old data for this collector before inserting.
 *
 * Retries 3 times on connection errors.
 */
export async function writeCollectorData(params: WriteCollectorDataParams): Promise<void> {
  const {
    sql,
    runId,
    organizationId,
    collectorName,
    findings,
    relationships = [],
    metrics,
    batchSize = DEFAULT_BATCH_SIZE,
  } = params;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Use raw SQL via the postgres.js transaction API
      // postgres.js transaction — tx is callable as tagged template at runtime
      // but TransactionSql type doesn't expose call signatures. Cast to Sql.
      await sql.begin(async (tx) => {
        const q = tx as unknown as postgres.Sql;

        // 1. Get IDs of existing findings for this collector
        const existingFindings = await q`
          SELECT id FROM assessment_findings
          WHERE run_id = ${runId} AND collector_name = ${collectorName}
        `;

        if (existingFindings.length > 0) {
          const ids = existingFindings.map((f) => f.id as string);

          // 2. Delete relationships referencing this collector's findings
          await q`
            DELETE FROM assessment_relationships
            WHERE run_id = ${runId}
              AND (source_finding_id = ANY(${ids}) OR target_finding_id = ANY(${ids}))
          `;

          // 3. Delete the findings themselves
          await q`
            DELETE FROM assessment_findings
            WHERE run_id = ${runId} AND collector_name = ${collectorName}
          `;
        }

        // 4. Insert fresh findings in batches
        for (let i = 0; i < findings.length; i += batchSize) {
          const batch = findings.slice(i, i + batchSize);
          const values = batch.map((f) => ({
            run_id: runId,
            domain: f.domain,
            collector_name: f.collectorName,
            artifact_type: f.artifactType,
            artifact_name: f.artifactName,
            artifact_id: f.artifactId ?? null,
            finding_key: f.findingKey,
            source_type: f.sourceType,
            source_ref: f.sourceRef ?? null,
            detected: f.detected ?? true,
            count_value: f.countValue ?? null,
            text_value: f.textValue ?? null,
            usage_level: f.usageLevel ?? null,
            risk_level: f.riskLevel ?? null,
            complexity_level: f.complexityLevel ?? null,
            migration_relevance: f.migrationRelevance ?? null,
            rca_target_concept: f.rcaTargetConcept ?? null,
            rca_mapping_complexity: f.rcaMappingComplexity ?? null,
            evidence_refs: JSON.stringify(f.evidenceRefs ?? []),
            notes: f.notes ?? null,
            organization_id: organizationId,
            schema_version: f.schemaVersion ?? '1.0',
          }));

          await q`INSERT INTO assessment_findings ${q(values)}`;
        }

        // 5. Insert intra-collector relationships
        for (let i = 0; i < relationships.length; i += batchSize) {
          const batch = relationships.slice(i, i + batchSize);
          const values = batch.map((r) => ({
            run_id: runId,
            source_finding_id: r.sourceFindingId,
            target_finding_id: r.targetFindingId,
            relationship_type: r.relationshipType,
            description: r.description ?? null,
          }));

          await q`INSERT INTO assessment_relationships ${q(values)}`;
        }

        // 6. Upsert collector metrics
        if (metrics) {
          await q`
            INSERT INTO collector_metrics (
              run_id, collector_name, domain, metrics, warnings,
              coverage, duration_ms, schema_version
            ) VALUES (
              ${runId}, ${metrics.collectorName}, ${metrics.domain},
              ${JSON.stringify(metrics.metrics)}::jsonb,
              ${JSON.stringify(metrics.warnings ?? [])}::jsonb,
              ${metrics.coverage ?? 0}, ${metrics.durationMs ?? null},
              ${metrics.schemaVersion ?? '1.0'}
            )
            ON CONFLICT (run_id, collector_name) DO UPDATE SET
              domain = EXCLUDED.domain,
              metrics = EXCLUDED.metrics,
              warnings = EXCLUDED.warnings,
              coverage = EXCLUDED.coverage,
              duration_ms = EXCLUDED.duration_ms,
              schema_version = EXCLUDED.schema_version,
              collected_at = NOW()
          `;
        }
      });

      logger.info(
        {
          collectorName,
          findingsCount: findings.length,
          relationshipsCount: relationships.length,
          hasMetrics: !!metrics,
        },
        'collector_data_written'
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn({ attempt, error: lastError.message, collectorName }, 'collector_write_retry');
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw new Error(`Failed to write collector data after 3 attempts: ${lastError?.message}`);
}
