/**
 * Cross-collector relationship building.
 *
 * Merges relationship edges from all collectors into a unified graph,
 * deduplicates edges, and resolves cross-domain references.
 *
 * Examples of cross-collector relationships:
 * - Product → PriceRule (catalog → pricing)
 * - ProductRule → ApexTrigger (catalog → dependencies)
 * - Template → Product (templates → catalog)
 * - ApprovalRule → User/Queue (approvals → org)
 *
 * See: Extraction Spec — Post-processing, relationship graph
 */

import type { CollectorContext, CollectorResult } from '../collectors/base.ts';
import type { AssessmentFindingInput, AssessmentRelationshipInput } from '@revbrain/contract';
import { logger } from '../lib/logger.ts';

const log = logger.child({ component: 'relationships' });

interface FindingIndex {
  byKey: Map<string, AssessmentFindingInput>;
  byArtifactId: Map<string, AssessmentFindingInput>;
  byDomain: Map<string, AssessmentFindingInput[]>;
  byArtifactType: Map<string, AssessmentFindingInput[]>;
}

/**
 * Build cross-collector relationships from all collector results.
 */
export async function buildRelationships(
  _ctx: CollectorContext,
  results: Map<string, CollectorResult>
): Promise<RelationshipGraph> {
  log.info('building_relationships');

  // 1. Collect all findings and existing relationships
  const allFindings: AssessmentFindingInput[] = [];
  const existingEdges: AssessmentRelationshipInput[] = [];

  for (const [, result] of results) {
    if (result.status === 'failed') continue;
    allFindings.push(...result.findings);
    existingEdges.push(...result.relationships);
  }

  // 2. Build index for fast lookup
  const index = buildFindingIndex(allFindings);

  // 3. Discover cross-domain edges from evidence refs
  const crossDomainEdges = discoverCrossRefs(allFindings, index);

  // 4. Merge & deduplicate
  const allEdges = deduplicateEdges([...existingEdges, ...crossDomainEdges]);

  // 5. Compute stats
  const stats = computeGraphStats(allFindings, allEdges);

  log.info(
    {
      totalFindings: allFindings.length,
      existingEdges: existingEdges.length,
      crossDomainEdges: crossDomainEdges.length,
      dedupedEdges: allEdges.length,
      ...stats,
    },
    'relationships_complete'
  );

  return { edges: allEdges, stats };
}

/** Index findings for fast cross-referencing */
function buildFindingIndex(findings: AssessmentFindingInput[]): FindingIndex {
  const index: FindingIndex = {
    byKey: new Map(),
    byArtifactId: new Map(),
    byDomain: new Map(),
    byArtifactType: new Map(),
  };

  for (const f of findings) {
    index.byKey.set(f.findingKey, f);

    if (f.artifactId) {
      index.byArtifactId.set(f.artifactId, f);
    }

    if (!index.byDomain.has(f.domain)) index.byDomain.set(f.domain, []);
    index.byDomain.get(f.domain)!.push(f);

    if (!index.byArtifactType.has(f.artifactType)) index.byArtifactType.set(f.artifactType, []);
    index.byArtifactType.get(f.artifactType)!.push(f);
  }

  return index;
}

/**
 * Discover cross-domain relationships by analyzing evidence_refs.
 *
 * When a finding's evidence_refs reference objects that belong to findings
 * in other collectors, that's a cross-domain relationship.
 */
function discoverCrossRefs(
  findings: AssessmentFindingInput[],
  index: FindingIndex
): AssessmentRelationshipInput[] {
  const edges: AssessmentRelationshipInput[] = [];

  for (const finding of findings) {
    if (!finding.evidenceRefs?.length) continue;

    for (const ref of finding.evidenceRefs) {
      // Check referencedObjects — these are SF object API names
      if (ref.referencedObjects) {
        for (const objName of ref.referencedObjects) {
          // Find findings that ARE this object (by artifactId or type)
          const target = index.byArtifactId.get(objName);
          if (target && target.domain !== finding.domain) {
            edges.push({
              sourceFindingId: finding.findingKey, // Using findingKey as proxy until DB IDs exist
              targetFindingId: target.findingKey,
              relationshipType: 'references',
              description: `${finding.artifactName} references ${target.artifactName}`,
            });
          }
        }
      }

      // Check referencedFields — field refs can link customizations to other domains
      if (ref.referencedFields) {
        for (const fieldRef of ref.referencedFields) {
          // Parse "ObjectName.FieldName" format
          const dotIdx = fieldRef.indexOf('.');
          if (dotIdx === -1) continue;
          const objName = fieldRef.slice(0, dotIdx);

          // Find findings about this object in a different domain
          const targets = (index.byArtifactType.get(objName) || []).filter(
            (t) => t.domain !== finding.domain
          );

          for (const target of targets.slice(0, 3)) {
            edges.push({
              sourceFindingId: finding.findingKey,
              targetFindingId: target.findingKey,
              relationshipType: 'same-field-used-in',
              description: `Field ${fieldRef} used in both ${finding.domain} and ${target.domain}`,
            });
          }
        }
      }
    }
  }

  // Build Product → PriceRule edges from naming patterns
  const products = index.byArtifactType.get('Product2') || [];
  const priceRules = index.byArtifactType.get('PriceRule') || [];

  for (const rule of priceRules) {
    // If rule notes mention product-related targets
    if (rule.notes?.includes('product') || rule.rcaTargetConcept?.includes('Product')) {
      for (const product of products.slice(0, 5)) {
        edges.push({
          sourceFindingId: product.findingKey,
          targetFindingId: rule.findingKey,
          relationshipType: 'triggers',
          description: `Product may trigger price rule ${rule.artifactName}`,
        });
      }
    }
  }

  // Build Apex/Flow → CPQ dependencies
  const apexClasses = index.byArtifactType.get('ApexClass') || [];
  const triggers = index.byArtifactType.get('ApexTrigger') || [];
  const codeFindings = [...apexClasses, ...triggers];

  for (const codeFinding of codeFindings) {
    // If code references SBQQ objects, link to catalog/pricing
    if (codeFinding.notes?.includes('SBQQ') || codeFinding.textValue?.includes('SBQQ')) {
      const catalogFindings = (index.byDomain.get('catalog') || []).slice(0, 3);
      for (const cat of catalogFindings) {
        edges.push({
          sourceFindingId: codeFinding.findingKey,
          targetFindingId: cat.findingKey,
          relationshipType: 'depends-on',
          description: `${codeFinding.artifactName} depends on CPQ object ${cat.artifactName}`,
        });
      }
    }
  }

  return edges;
}

/** Deduplicate edges by source+target+type */
function deduplicateEdges(edges: AssessmentRelationshipInput[]): AssessmentRelationshipInput[] {
  const seen = new Set<string>();
  const deduped: AssessmentRelationshipInput[] = [];

  for (const edge of edges) {
    const key = `${edge.sourceFindingId}|${edge.targetFindingId}|${edge.relationshipType}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(edge);
    }
  }

  return deduped;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  crossDomainEdgeCount: number;
  connectedDomains: number;
  isolatedDomains: string[];
}

export interface RelationshipGraph {
  edges: AssessmentRelationshipInput[];
  stats: GraphStats;
}

function computeGraphStats(
  findings: AssessmentFindingInput[],
  edges: AssessmentRelationshipInput[]
): GraphStats {
  const domains = new Set(findings.map((f) => f.domain));
  const connectedDomainSet = new Set<string>();

  // Build a quick findingKey→domain lookup
  const keyToDomain = new Map<string, string>();
  for (const f of findings) {
    keyToDomain.set(f.findingKey, f.domain);
  }

  let crossDomainCount = 0;
  for (const edge of edges) {
    const srcDomain = keyToDomain.get(edge.sourceFindingId);
    const tgtDomain = keyToDomain.get(edge.targetFindingId);
    if (srcDomain) connectedDomainSet.add(srcDomain);
    if (tgtDomain) connectedDomainSet.add(tgtDomain);
    if (srcDomain && tgtDomain && srcDomain !== tgtDomain) {
      crossDomainCount++;
    }
  }

  const isolatedDomains = [...domains].filter((d) => !connectedDomainSet.has(d));

  return {
    nodeCount: findings.length,
    edgeCount: edges.length,
    crossDomainEdgeCount: crossDomainCount,
    connectedDomains: connectedDomainSet.size,
    isolatedDomains,
  };
}
