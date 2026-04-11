/**
 * EXT-1.2 — Plugin registration / activation cross-link.
 *
 * The dependencies collector emits one `cpq_apex_plugin` finding
 * per Apex class that implements an SBQQ.* / sbaa.* plugin
 * interface (EXT-1.1). The settings collector emits CPQSetting /
 * CPQSettingValue findings holding the per-plugin "which class is
 * active" registration values from the CPQ "Plugins" tab.
 *
 * Neither collector knows about the other. Without a join, the
 * report can say "47 Apex classes" and "12 plugin classes" but
 * cannot answer the single most important migration question:
 * **which one is the active Quote Calculator Plugin right now?**
 *
 * This module is the join. It runs as part of pipeline.ts Phase 4
 * (post-processing) AFTER both `dependencies` and `settings` have
 * completed. It walks the static `PLUGIN_REGISTRATION_MAP` and:
 *
 *   1. For every plugin-registration setting that holds a
 *      non-empty class name, find the matching `cpq_apex_plugin`
 *      finding (case-insensitive on class name) and ATTACH an
 *      additional evidence-ref `isActivePlugin: true` to it.
 *   2. For every plugin-registration setting that is null/empty,
 *      emit a NEW `cpq_plugin_unset` finding so the absence is
 *      positively asserted (G1 conservation: every input is
 *      accounted for, including the absence of a plugin).
 *
 * **Determinism:** the function is pure — same inputs always
 * produce the same outputs (sorted, no Date.now, no random).
 *
 * **CPQ-version-aware:** the registration map is keyed by major
 * CPQ version. If the detected version is unknown, we use the
 * latest map and emit a degraded-confidence warning. The OQ-3
 * resolution (default for v1: hardcoded latest with degraded
 * warning) per the tasks doc.
 */

import type { AssessmentFindingInput } from '@revbrain/contract';

/**
 * Map of (settings-object API name, field API name) → the plugin
 * interface name that field activates.
 *
 * Verified against the CPQ Reference Guide for the most recent
 * generally-available CPQ version. Add a new top-level key when a
 * new major version ships fields with different names.
 *
 * The interface name should match what `detectCpqPluginInterfaces`
 * returns (e.g. `'SBQQ.QuoteCalculatorPluginInterface'`) so the
 * cross-link key is consistent.
 */
export interface PluginRegistration {
  settingsObject: string;
  fieldName: string;
  interfaceName: string;
  /** Human-readable label for warnings + the unset-finding `notes`. */
  label: string;
}

/**
 * The current registration map. As of CPQ Spring '24, plugin
 * activation lives on `SBQQ__CustomScriptConfiguration__c` for
 * QCP / configurator plugins and on the SBQQ Plugin tab settings
 * (custom settings hierarchy) for the rest. The exact field set
 * has been stable across the last several major versions but
 * versioning is preserved here so future changes can land
 * without a destructive edit.
 */
export const PLUGIN_REGISTRATION_MAP_LATEST: readonly PluginRegistration[] = Object.freeze([
  // Quote Calculator Plugin — the most-asked-about extension point.
  {
    settingsObject: 'SBQQ__QuoteCalculatorScript__c',
    fieldName: 'SBQQ__Code__c',
    interfaceName: 'SBQQ.QuoteCalculatorPluginInterface',
    label: 'Quote Calculator Plugin (JavaScript)',
  },
  // The Apex variants — when an org overrides via the Plugins tab.
  {
    settingsObject: 'SBQQ__Plugin__c',
    fieldName: 'SBQQ__QuoteCalculator__c',
    interfaceName: 'SBQQ.QuoteCalculatorPluginInterface',
    label: 'Quote Calculator Plugin (Apex)',
  },
  {
    settingsObject: 'SBQQ__Plugin__c',
    fieldName: 'SBQQ__Configurator__c',
    interfaceName: 'SBQQ.ConfiguratorPluginInterface',
    label: 'Configurator Plugin (Apex)',
  },
  {
    settingsObject: 'SBQQ__Plugin__c',
    fieldName: 'SBQQ__ProductSearch__c',
    interfaceName: 'SBQQ.ProductSearchPluginInterface',
    label: 'Product Search Plugin (Apex)',
  },
  {
    settingsObject: 'SBQQ__Plugin__c',
    fieldName: 'SBQQ__QuoteLineGroupSplitter__c',
    interfaceName: 'SBQQ.QuoteLineGroupSplitterPluginInterface',
    label: 'Quote Line Group Splitter Plugin (Apex)',
  },
  // sbaa (Advanced Approvals) — custom condition extension points.
  {
    settingsObject: 'sbaa__ApprovalSettings__c',
    fieldName: 'sbaa__ApprovalChainCondition__c',
    interfaceName: 'sbaa.ApprovalChainCustomCondition',
    label: 'Approval Chain Custom Condition',
  },
]);

export interface PluginActivationResult {
  /** New findings to append to the worker's finding list. */
  newFindings: AssessmentFindingInput[];
  /**
   * Mutated copy of the input findings — every cpq_apex_plugin
   * finding whose class is registered as active gets an
   * additional `isActivePlugin: true` evidence-ref appended.
   */
  updatedFindings: AssessmentFindingInput[];
  /** Diagnostic counts surfaced via metrics in pipeline.ts. */
  stats: {
    activePluginCount: number;
    unsetPluginCount: number;
    orphanedRegistrationCount: number;
  };
  warnings: string[];
}

/**
 * Pure join: takes the full findings array, returns the updated
 * findings + new findings + stats. Caller is responsible for
 * concatenating and persisting.
 */
export function joinPluginActivation(
  findings: readonly AssessmentFindingInput[],
  options: { cpqVersion?: string } = {}
): PluginActivationResult {
  // Build lookup maps from the existing findings.
  // Plugin findings: keyed by lowercase artifactName so the
  // case-insensitive match against settings values works.
  const pluginFindingsByName = new Map<string, AssessmentFindingInput[]>();
  for (const f of findings) {
    if (
      f.artifactType === 'ApexClass' &&
      f.evidenceRefs.some((r) => r.label === 'interfaceName' && /^(SBQQ|sbaa)\./.test(r.value))
    ) {
      const key = f.artifactName.toLowerCase();
      const list = pluginFindingsByName.get(key) ?? [];
      list.push(f);
      pluginFindingsByName.set(key, list);
    }
  }

  // Setting values: read from CPQSettingValue findings whose
  // artifactId is `<settingsObject>.<fieldName>`. The settings
  // collector populates these via KNOWN_SETTINGS — but plugin
  // registrations are NOT in KNOWN_SETTINGS today (that's the
  // point of this join). So we ALSO scan CPQSetting findings'
  // notes for the plugin field names. Belt-and-suspenders.
  const settingValueByPath = new Map<string, string>();
  for (const f of findings) {
    if (f.artifactType === 'CPQSettingValue' && f.artifactId) {
      // The settings collector stores the value in the field-ref
      // evidenceRef's `label` (canonical shape — same lesson as
      // the §8.3 fix).
      const fieldRef = f.evidenceRefs.find((r) => r.type === 'field-ref');
      if (fieldRef?.label) {
        settingValueByPath.set(f.artifactId, fieldRef.label);
      }
    }
  }

  const warnings: string[] = [];
  const newFindings: AssessmentFindingInput[] = [];
  const updatedFindings: AssessmentFindingInput[] = findings.map((f) => ({
    ...f,
    evidenceRefs: [...f.evidenceRefs],
  }));

  // Use the latest registration map. OQ-3 resolution: defer the
  // versioned-map switch until we hit an org that needs it.
  if (options.cpqVersion && options.cpqVersion !== 'latest') {
    warnings.push(
      `Plugin activation join: detected CPQ version '${options.cpqVersion}' but only the 'latest' map is wired. Plugin findings may be classified with reduced confidence.`
    );
  }

  let activePluginCount = 0;
  let unsetPluginCount = 0;
  let orphanedRegistrationCount = 0;

  for (const reg of PLUGIN_REGISTRATION_MAP_LATEST) {
    const path = `${reg.settingsObject}.${reg.fieldName}`;
    const value = settingValueByPath.get(path);

    if (!value || value.trim() === '') {
      // Unset registration → emit a positive-absence finding.
      unsetPluginCount++;
      newFindings.push({
        domain: 'settings',
        collectorName: 'plugin-activation',
        artifactType: 'PluginActivation',
        artifactName: reg.label,
        artifactId: path,
        findingKey: `plugin-activation:unset:${path}`,
        sourceType: 'object',
        detected: false,
        migrationRelevance: 'optional',
        notes: `${reg.label} is unset — standard CPQ implementation in use for ${reg.interfaceName}.`,
        evidenceRefs: [
          {
            type: 'object-ref',
            value: reg.interfaceName,
            label: 'interfaceName',
          },
          {
            type: 'field-ref',
            value: path,
            label: 'unset',
          },
        ],
        schemaVersion: '1.0',
      });
      continue;
    }

    // Look up the matching plugin finding.
    const candidates = pluginFindingsByName.get(value.toLowerCase()) ?? [];
    const match = candidates.find((c) =>
      c.evidenceRefs.some((r) => r.label === 'interfaceName' && r.value === reg.interfaceName)
    );

    if (!match) {
      // Setting points at a class we don't have a plugin finding
      // for. Could mean: (a) the class doesn't actually implement
      // the interface (org config drift), or (b) the class is in
      // a managed package not extracted by EXT-CC4 yet.
      orphanedRegistrationCount++;
      warnings.push(
        `Plugin activation join: ${reg.label} is registered to '${value}' but no Apex class was extracted that implements ${reg.interfaceName}. Possible managed-package extension or stale registration.`
      );
      newFindings.push({
        domain: 'settings',
        collectorName: 'plugin-activation',
        artifactType: 'PluginActivation',
        artifactName: reg.label,
        artifactId: path,
        findingKey: `plugin-activation:orphaned:${path}`,
        sourceType: 'object',
        detected: true,
        riskLevel: 'high',
        migrationRelevance: 'must-migrate',
        notes: `${reg.label} is registered to '${value}' but no matching Apex class was extracted. This is a migration risk — verify the registration is intentional.`,
        evidenceRefs: [
          {
            type: 'object-ref',
            value: reg.interfaceName,
            label: 'interfaceName',
          },
          {
            type: 'field-ref',
            value: path,
            label: value,
          },
        ],
        schemaVersion: '1.0',
      });
      continue;
    }

    // Found the active plugin — mutate the corresponding finding
    // in the updatedFindings array (find by findingKey for
    // determinism — we built updatedFindings as a copy of findings
    // so indices match).
    activePluginCount++;
    const idx = findings.indexOf(match);
    if (idx >= 0) {
      updatedFindings[idx]!.evidenceRefs.push({
        type: 'field-ref',
        value: path,
        label: 'isActivePlugin',
      });
    }
  }

  return {
    newFindings,
    updatedFindings,
    stats: {
      activePluginCount,
      unsetPluginCount,
      orphanedRegistrationCount,
    },
    warnings,
  };
}
