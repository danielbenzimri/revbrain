/**
 * Collector registry — defines all collectors with tiers, timeouts, dependencies.
 *
 * Used by the pipeline orchestrator to determine execution order,
 * tier gating, and dependency validation.
 *
 * See: Implementation Plan Task 8.1
 */

export interface CollectorDefinition {
  name: string;
  tier: 'tier0' | 'tier1' | 'tier2';
  timeoutMs: number;
  requires: string[];
  domain: string;
}

export const COLLECTOR_REGISTRY: CollectorDefinition[] = [
  // Tier 0 — mandatory (any failure → run fails)
  { name: 'discovery', tier: 'tier0', timeoutMs: 5 * 60_000, requires: [], domain: 'discovery' },
  {
    name: 'catalog',
    tier: 'tier0',
    timeoutMs: 15 * 60_000,
    requires: ['discovery'],
    domain: 'catalog',
  },
  {
    name: 'pricing',
    tier: 'tier0',
    timeoutMs: 20 * 60_000,
    requires: ['discovery'],
    domain: 'pricing',
  },
  {
    name: 'usage',
    tier: 'tier0',
    timeoutMs: 45 * 60_000,
    requires: ['discovery'],
    domain: 'usage',
  },

  // Tier 1 — important (failure → completed_warnings, min 50% must succeed)
  {
    name: 'dependencies',
    tier: 'tier1',
    timeoutMs: 15 * 60_000,
    requires: ['discovery'],
    domain: 'dependency',
  },
  {
    name: 'customizations',
    tier: 'tier1',
    timeoutMs: 10 * 60_000,
    requires: ['discovery'],
    domain: 'customization',
  },
  {
    name: 'settings',
    tier: 'tier1',
    timeoutMs: 5 * 60_000,
    requires: ['discovery'],
    domain: 'settings',
  },
  {
    name: 'order-lifecycle',
    tier: 'tier1',
    timeoutMs: 20 * 60_000,
    requires: ['discovery'],
    domain: 'order-lifecycle',
  },

  // Tier 2 — optional (failure → completed_warnings, minor coverage gap)
  {
    name: 'templates',
    tier: 'tier2',
    timeoutMs: 10 * 60_000,
    requires: ['discovery'],
    domain: 'templates',
  },
  {
    name: 'approvals',
    tier: 'tier2',
    timeoutMs: 10 * 60_000,
    requires: ['discovery'],
    domain: 'approvals',
  },
  {
    name: 'integrations',
    tier: 'tier2',
    timeoutMs: 10 * 60_000,
    requires: ['discovery', 'dependencies'],
    domain: 'integration',
  },
  {
    name: 'localization',
    tier: 'tier2',
    timeoutMs: 10 * 60_000,
    requires: ['discovery'],
    domain: 'localization',
  },
];

/** Get collectors by tier */
export function getCollectorsByTier(tier: 'tier0' | 'tier1' | 'tier2'): CollectorDefinition[] {
  return COLLECTOR_REGISTRY.filter((c) => c.tier === tier);
}

/** Get a collector definition by name */
export function getCollector(name: string): CollectorDefinition | undefined {
  return COLLECTOR_REGISTRY.find((c) => c.name === name);
}

/** Validate that all required collectors have completed */
export function validateDependencies(
  collectorName: string,
  completedCollectors: Set<string>
): { satisfied: boolean; missing: string[] } {
  const definition = getCollector(collectorName);
  if (!definition) return { satisfied: false, missing: [collectorName] };

  const missing = definition.requires.filter((r) => !completedCollectors.has(r));
  return { satisfied: missing.length === 0, missing };
}
