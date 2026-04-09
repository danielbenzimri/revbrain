/**
 * Settings collector — CPQ package settings (Custom Settings).
 *
 * Implements Extraction Spec Section 15 + Gap Analysis G-01, G-02:
 * - Discover SBQQ Custom Settings via Tooling API (dynamic, not hardcoded)
 * - Extract ALL field values from org-level records (not just record counts)
 * - Match fields to KNOWN_SETTINGS_MAP for human-readable labels
 * - Produce CPQSettingValue findings for each known setting
 * - Derive PluginStatus findings from settings + package detection (G-02)
 *
 * Tier 1 — failure → completed_warnings.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import type { DescribeResult } from '../salesforce/rest.ts';

// ============================================================================
// Known CPQ settings — regex patterns anchored to SBQQ__ prefix
// Matches against field API names from Describe results.
// See: Gap Analysis G-01 (v1.2, Audit fix A1 §2.1)
// ============================================================================

interface KnownSetting {
  pattern: RegExp;
  label: string;
  category: string;
}

const KNOWN_SETTINGS: KnownSetting[] = [
  // Quoting
  {
    pattern: /^SBQQ__.*(?:QuoteLineEditor|EnableQLE)/i,
    label: 'Quote Line Editor',
    category: 'Quoting',
  },
  { pattern: /^SBQQ__.*EnableQuoteTerms/i, label: 'Quote Terms', category: 'Quoting' },
  { pattern: /^SBQQ__.*GroupEnabled/i, label: 'Quote Line Groups', category: 'Quoting' },
  // Pricing
  { pattern: /^SBQQ__.*MultiCurrency/i, label: 'Multi-Currency', category: 'Pricing' },
  { pattern: /^SBQQ__.*ContractedPric/i, label: 'Contracted Pricing', category: 'Pricing' },
  { pattern: /^SBQQ__.*BlockPric/i, label: 'Block Pricing', category: 'Pricing' },
  { pattern: /^SBQQ__.*PriceDimension/i, label: 'Price Dimensions', category: 'Pricing' },
  // Subscription
  {
    pattern: /^SBQQ__.*SubscriptionProrat/i,
    label: 'Subscription Proration',
    category: 'Subscription',
  },
  { pattern: /^SBQQ__.*RenewalModel/i, label: 'Renewal Model', category: 'Subscription' },
  {
    pattern: /^SBQQ__.*SubscriptionTerm/i,
    label: 'Default Subscription Term',
    category: 'Subscription',
  },
  { pattern: /^SBQQ__.*CoTerminat/i, label: 'Co-Termination', category: 'Subscription' },
  // Sync
  { pattern: /^SBQQ__.*TwinField/i, label: 'Twin Fields', category: 'Sync' },
  // Performance
  {
    pattern: /^SBQQ__.*LargeQuoteThreshold/i,
    label: 'Large Quote Threshold',
    category: 'Performance',
  },
  // Plugins
  {
    pattern: /^SBQQ__.*(?:CalculatorPlugin|QCP)/i,
    label: 'Quote Calculator Plugin',
    category: 'Plugins',
  },
  { pattern: /^SBQQ__.*DocumentStorePlugin/i, label: 'Document Store Plugin', category: 'Plugins' },
  { pattern: /^SBQQ__.*PaymentGateway/i, label: 'Payment Gateway', category: 'Plugins' },
  { pattern: /^SBQQ__.*ExternalConfigurat/i, label: 'External Configurator', category: 'Plugins' },
  // Document Generation
  { pattern: /^SBQQ__.*DocumentFormat/i, label: 'Document Format', category: 'Documents' },
  { pattern: /^SBQQ__.*QuoteDocumentTemplate/i, label: 'Default Template', category: 'Documents' },
  // Approvals
  { pattern: /^SBQQ__.*ApprovalChaining/i, label: 'Approval Chaining', category: 'Approvals' },
];

// System/audit fields to skip when extracting setting values
const SKIP_FIELDS = new Set([
  'Id',
  'IsDeleted',
  'CreatedById',
  'CreatedDate',
  'LastModifiedById',
  'LastModifiedDate',
  'SystemModstamp',
  'SetupOwnerId',
  'Name',
]);

export class SettingsCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'settings',
      tier: 'tier1',
      timeoutMs: 5 * 60_000,
      requires: ['discovery'],
      domain: 'settings',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 15.2: Discover SBQQ Custom Settings via Tooling API
    // ================================================================
    this.ctx.progress.updateSubstep('settings', 'discover_settings');
    this.log.info('discovering_cpq_settings');

    const allSettingValues = new Map<string, unknown>(); // fieldApiName → value

    try {
      // Use DeveloperName (not QualifiedApiName which doesn't exist on all API versions)
      const settingsResult = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT DeveloperName, Description ' + "FROM CustomObject WHERE NamespacePrefix = 'SBQQ'",
        this.signal
      );

      const settingObjects: Array<{ name: string; description: string }> = [];

      for (const obj of settingsResult.records) {
        // Build API name from namespace + developer name
        const devName = obj.DeveloperName as string;
        const apiName = devName.endsWith('__c') ? `SBQQ__${devName}` : `SBQQ__${devName}__c`;
        try {
          // Test if this is a hierarchy Custom Setting by querying for SetupOwnerId
          // Only Custom Settings have this field; regular custom objects don't
          const testResult = await this.ctx.restApi.query<Record<string, unknown>>(
            `SELECT Id, SetupOwnerId FROM ${apiName} LIMIT 1`,
            this.signal
          );
          // If query succeeds with SetupOwnerId, it's a Custom Setting
          if (testResult.totalSize >= 0) {
            settingObjects.push({
              name: apiName,
              description: (obj.Description as string) || '',
            });
          }
        } catch {
          // SetupOwnerId not found = regular custom object, not a Setting — skip
        }
      }

      metrics.cpqSettingsDiscovered = settingObjects.length;

      // ================================================================
      // G-01: Extract ALL field values from org-level records
      // ================================================================
      this.ctx.progress.updateSubstep('settings', 'extract_field_values');

      for (const setting of settingObjects) {
        try {
          // Get Describe for this settings object to build full field list
          // Cache the result so we don't re-describe on every run
          let describe: DescribeResult | undefined;
          try {
            describe = this.ctx.describeCache.get(setting.name) as DescribeResult | undefined;
            if (!describe) {
              describe = await this.ctx.restApi.describe(setting.name, this.signal);
              this.ctx.describeCache.set(setting.name, describe);
            }
          } catch {
            // Describe failed — fall back to basic query (object may not be describable)
          }

          // Build field list from Describe (SOQL doesn't support SELECT *)
          const fieldNames = describe
            ? describe.fields.map((f) => f.name).filter((n) => !SKIP_FIELDS.has(n))
            : ['Id', 'SetupOwnerId', 'Name'];

          // Query org-level record (SetupOwnerId starts with '00D' = org ID)
          const records = await this.ctx.restApi.queryAll<Record<string, unknown>>(
            `SELECT ${fieldNames.join(', ')} FROM ${setting.name}`,
            this.signal
          );

          // Find the org-level default record
          const orgRecord = records.find((r) => {
            const ownerId = r.SetupOwnerId as string;
            return ownerId && ownerId.startsWith('00D');
          });

          // C-01: Detect override existence (profile + user level)
          const profileOverrides = records.filter((r) => {
            const oid = r.SetupOwnerId as string;
            return oid && oid.startsWith('00e');
          });
          const userOverrides = records.filter((r) => {
            const oid = r.SetupOwnerId as string;
            return oid && oid.startsWith('005');
          });
          const hasProfileOverrides = profileOverrides.length > 0;
          const hasUserOverrides = userOverrides.length > 0;

          // Produce the generic CPQSetting finding (backward compat)
          findings.push(
            createFinding({
              domain: 'settings',
              collector: 'settings',
              artifactType: 'CPQSetting',
              artifactName: setting.name,
              sourceType: 'object',
              findingType: 'cpq_setting',
              countValue: records.length,
              migrationRelevance: 'should-migrate',
              rcaTargetConcept: 'Revenue Settings',
              rcaMappingComplexity: 'transform',
              notes: `${records.length} records (org-level + overrides). ${setting.description}${hasProfileOverrides ? ` Profile overrides: ${profileOverrides.length}.` : ''}${hasUserOverrides ? ` User overrides: ${userOverrides.length}.` : ''}`,
            })
          );

          metrics[`setting_${setting.name}_records`] = records.length;

          // Extract field values from org-level record
          if (orgRecord && describe) {
            for (const field of describe.fields) {
              if (SKIP_FIELDS.has(field.name)) continue;
              const value = orgRecord[field.name];
              if (value !== null && value !== undefined) {
                allSettingValues.set(`${setting.name}.${field.name}`, value);
              }
            }

            // Match against KNOWN_SETTINGS_MAP and produce CPQSettingValue findings
            for (const field of describe.fields) {
              if (SKIP_FIELDS.has(field.name)) continue;
              const match = KNOWN_SETTINGS.find((ks) => ks.pattern.test(field.name));
              if (match) {
                const value = orgRecord[field.name];
                const displayValue = formatSettingValue(value, field.name);

                findings.push(
                  createFinding({
                    domain: 'settings',
                    collector: 'settings',
                    artifactType: 'CPQSettingValue',
                    artifactName: match.label,
                    artifactId: `${setting.name}.${field.name}`,
                    sourceType: 'object',
                    findingType: 'cpq_setting_value',
                    riskLevel: 'info',
                    rcaMappingComplexity: 'direct',
                    rcaTargetConcept: 'Revenue Settings',
                    migrationRelevance: 'should-migrate',
                    notes: `${match.label}: ${displayValue}`,
                    evidenceRefs: [
                      {
                        type: 'field-ref' as const,
                        value: `${setting.name}.${field.name}`,
                        label: displayValue,
                      },
                    ],
                  })
                );

                metrics[`cpqSetting_${match.label.replace(/\s+/g, '_')}`] = displayValue;
              }
            }
          }
        } catch (err) {
          this.log.warn(
            { setting: setting.name, error: (err as Error).message },
            'setting_extraction_failed'
          );
        }
      }

      // ================================================================
      // Strategy 4: Infer settings from field Describes when no Custom Settings found
      // CPQ stores config via managed package internals — we detect from field defaults
      // ================================================================
      const settingValueCount = findings.filter((f) => f.artifactType === 'CPQSettingValue').length;
      if (settingValueCount === 0) {
        this.ctx.progress.updateSubstep('settings', 'infer_from_describes');
        this.log.info('no_custom_settings_found_inferring_from_describes');

        // Multi-currency detection from CurrencyIsoCode on Quote
        const quoteDescribe = this.ctx.describeCache.get('SBQQ__Quote__c') as
          | DescribeResult
          | undefined;
        if (quoteDescribe) {
          const currencyField = quoteDescribe.fields.find((f) => f.name === 'CurrencyIsoCode');
          if (currencyField) {
            const currencies =
              currencyField.picklistValues?.filter((p) => p.active).map((p) => p.value) ?? [];
            findings.push(
              createFinding({
                domain: 'settings',
                collector: 'settings',
                artifactType: 'CPQSettingValue',
                artifactName: 'Multi-Currency',
                sourceType: 'inferred',
                findingType: 'cpq_setting_value',
                riskLevel: 'info',
                rcaMappingComplexity: 'transform',
                notes: `Multi-Currency: Enabled (${currencies.join(', ')})`,
                evidenceRefs: [
                  {
                    type: 'field-ref' as const,
                    value: 'CurrencyIsoCode',
                    label: `Enabled (${currencies.join(', ')})`,
                  },
                ],
              })
            );
            allSettingValues.set('MultiCurrency', currencies);
          }

          // Twin Fields: check if SBQQ fields have counterparts on Opportunity
          const oppDescribe = this.ctx.describeCache.get('Opportunity') as
            | DescribeResult
            | undefined;
          if (oppDescribe) {
            const sbqqOppFields = oppDescribe.fields.filter((f) => f.name.startsWith('SBQQ__'));
            if (sbqqOppFields.length > 0) {
              findings.push(
                createFinding({
                  domain: 'settings',
                  collector: 'settings',
                  artifactType: 'CPQSettingValue',
                  artifactName: 'Twin Fields',
                  sourceType: 'inferred',
                  findingType: 'cpq_setting_value',
                  riskLevel: 'info',
                  rcaMappingComplexity: 'direct',
                  notes: `Twin Fields: Enabled (${sbqqOppFields.length} SBQQ fields on Opportunity)`,
                  evidenceRefs: [
                    {
                      type: 'field-ref' as const,
                      value: 'Opportunity.SBQQ__*',
                      label: `Enabled (${sbqqOppFields.length} fields)`,
                    },
                  ],
                })
              );
              allSettingValues.set('TwinFields', true);
            }
          }

          // QLE detection: check if Quote Line Editor fields exist
          const qleFields = quoteDescribe.fields.filter(
            (f) => f.name.includes('LineItemsGrouped') || f.name.includes('LineItemsPrinted')
          );
          if (qleFields.length > 0) {
            findings.push(
              createFinding({
                domain: 'settings',
                collector: 'settings',
                artifactType: 'CPQSettingValue',
                artifactName: 'Quote Line Editor',
                sourceType: 'inferred',
                findingType: 'cpq_setting_value',
                riskLevel: 'info',
                rcaMappingComplexity: 'direct',
                notes: 'Quote Line Editor: Enabled (QLE fields detected on Quote object)',
                evidenceRefs: [
                  { type: 'field-ref' as const, value: 'SBQQ__Quote__c.QLE', label: 'Enabled' },
                ],
              })
            );
            allSettingValues.set('QLE', true);
          }

          // Contracted pricing: check if ContractedPrice object has data
          const cpDataCount = this.ctx.describeCache.get('SBQQ__ContractedPrice__c');
          if (cpDataCount) {
            findings.push(
              createFinding({
                domain: 'settings',
                collector: 'settings',
                artifactType: 'CPQSettingValue',
                artifactName: 'Contracted Pricing',
                sourceType: 'inferred',
                findingType: 'cpq_setting_value',
                riskLevel: 'info',
                rcaMappingComplexity: 'transform',
                notes: 'Contracted Pricing: Enabled (ContractedPrice object exists)',
                evidenceRefs: [
                  {
                    type: 'field-ref' as const,
                    value: 'SBQQ__ContractedPrice__c',
                    label: 'Enabled',
                  },
                ],
              })
            );
            allSettingValues.set('ContractedPricing', true);
          }

          // Subscription: check for subscription-related fields
          const subFields = quoteDescribe.fields.filter(
            (f) => f.name.includes('SubscriptionTerm') || f.name.includes('ContractingMethod')
          );
          const hasSubscription = subFields.length > 0;
          const contractingDefault = quoteDescribe.fields.find(
            (f) => f.name === 'SBQQ__ContractingMethod__c'
          )?.defaultValue;
          findings.push(
            createFinding({
              domain: 'settings',
              collector: 'settings',
              artifactType: 'CPQSettingValue',
              artifactName: 'Subscription Proration',
              sourceType: 'inferred',
              findingType: 'cpq_setting_value',
              riskLevel: 'info',
              notes: hasSubscription
                ? `Subscription: Enabled (Contracting: ${contractingDefault ?? 'default'})`
                : 'Subscription: Not detected',
              evidenceRefs: [
                {
                  type: 'field-ref' as const,
                  value: 'SBQQ__ContractingMethod__c',
                  label: (contractingDefault as string) ?? 'N/A',
                },
              ],
            })
          );
        }

        // Installed packages — read from Discovery cache
        const discoveredPackages = this.ctx.describeCache.get('_installedPackages') as
          | Array<{ namespace: string; name: string; version: string }>
          | undefined;
        if (discoveredPackages) {
          for (const pkg of discoveredPackages) {
            // Legacy CPQSettingValue finding (backward compat)
            findings.push(
              createFinding({
                domain: 'settings',
                collector: 'settings',
                artifactType: 'CPQSettingValue',
                artifactName: `Package: ${pkg.name}`,
                sourceType: 'inferred',
                findingType: 'cpq_setting_value',
                riskLevel: 'info',
                notes: `${pkg.name} (${pkg.namespace}) v${pkg.version}`,
                evidenceRefs: [
                  { type: 'field-ref' as const, value: pkg.namespace, label: `v${pkg.version}` },
                ],
              })
            );

            // C1: Canonical InstalledPackage finding with structured evidenceRefs
            // Enables sbaa version detection (P0-1) and package-level queries
            findings.push(
              createFinding({
                domain: 'settings',
                collector: 'settings',
                artifactType: 'InstalledPackage',
                artifactName: pkg.name,
                findingType: 'installed_package',
                sourceType: 'object',
                riskLevel: 'info',
                migrationRelevance: 'should-migrate',
                evidenceRefs: [
                  { type: 'field-ref' as const, label: 'Namespace', value: pkg.namespace },
                  { type: 'field-ref' as const, label: 'Version', value: pkg.version },
                ],
                notes: `${pkg.name} (${pkg.namespace}) v${pkg.version}`,
              })
            );
          }
        }
      }

      // ================================================================
      // C1: Canonical InstalledPackage findings (always emitted)
      // When settings were found from Custom Settings, the fallback path
      // above is skipped — so we emit InstalledPackage findings here too.
      // ================================================================
      const hasSettingsFromCustomObjects = settingValueCount > 0;
      if (hasSettingsFromCustomObjects) {
        const discoveredPackagesMain = this.ctx.describeCache.get('_installedPackages') as
          | Array<{ namespace: string; name: string; version: string }>
          | undefined;
        if (discoveredPackagesMain) {
          for (const pkg of discoveredPackagesMain) {
            findings.push(
              createFinding({
                domain: 'settings',
                collector: 'settings',
                artifactType: 'InstalledPackage',
                artifactName: pkg.name,
                findingType: 'installed_package',
                sourceType: 'object',
                riskLevel: 'info',
                migrationRelevance: 'should-migrate',
                evidenceRefs: [
                  { type: 'field-ref' as const, label: 'Namespace', value: pkg.namespace },
                  { type: 'field-ref' as const, label: 'Version', value: pkg.version },
                ],
                notes: `${pkg.name} (${pkg.namespace}) v${pkg.version}`,
              })
            );
          }
        }
      }

      // ================================================================
      // G-02: Derive PluginStatus findings from settings + packages
      // ================================================================
      this.ctx.progress.updateSubstep('settings', 'derive_plugin_status');

      const pluginFindings = this.derivePluginStatuses(allSettingValues);
      findings.push(...pluginFindings);
      metrics.pluginsDetected = pluginFindings.filter((f) => f.notes?.includes('Active')).length;
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'settings_discovery_failed');
      warnings.push(`Settings discovery failed: ${(err as Error).message}`);
    }

    this.log.info(
      {
        settings: metrics.cpqSettingsDiscovered,
        settingValues: findings.filter((f) => f.artifactType === 'CPQSettingValue').length,
        plugins: metrics.pluginsDetected,
        findings: findings.length,
      },
      'settings_complete'
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'settings',
        domain: 'settings',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }

  /**
   * G-02: Derive plugin statuses from settings field values + Discovery findings.
   *
   * Checks:
   * 1. QCP (Quote Calculator Plugin) — from settings field or Pricing collector
   * 2. Electronic Signature — from Discovery phantom packages
   * 3. Document Store Plugin — from settings field
   * 4. Payment Gateway — from settings field
   * 5. External Configurator — from settings field
   */
  private derivePluginStatuses(settingValues: Map<string, unknown>): AssessmentFindingInput[] {
    const plugins: AssessmentFindingInput[] = [];

    // Helper: check if any setting value matches a plugin pattern
    const findSettingValue = (pattern: RegExp): unknown => {
      for (const [key, value] of settingValues) {
        if (pattern.test(key) && value != null && value !== '' && value !== false) {
          return value;
        }
      }
      return null;
    };

    // 1. QCP
    const qcpValue = findSettingValue(/CalculatorPlugin|QCP/i);
    plugins.push(
      createFinding({
        domain: 'settings',
        collector: 'settings',
        artifactType: 'PluginStatus',
        artifactName: 'Quote Calculator Plugin (QCP)',
        sourceType: 'inferred',
        findingType: 'plugin_status',
        riskLevel: qcpValue ? 'high' : 'info',
        countValue: qcpValue ? 1 : 0,
        notes: qcpValue
          ? `Active — QCP class: ${String(qcpValue)}. Custom JavaScript pricing logic injected into every calculation. This fundamentally changes the complexity profile.`
          : 'Not Configured — no custom JavaScript calculation injection detected. Pricing logic uses standard Price Rules.',
        rcaMappingComplexity: qcpValue ? 'redesign' : 'direct',
      })
    );

    // 2. Electronic Signature — check Discovery's phantom packages
    // Discovery stores phantom packages in describeCache under '_phantomPackages'
    const phantomPackages = (this.ctx.describeCache.get('_phantomPackages') as string[]) ?? [];
    const hasDocuSign = phantomPackages.some((p) => p.includes('dsfs'));
    const hasAdobeSign = phantomPackages.some((p) => p.includes('echosign'));
    const esigProvider = hasDocuSign ? 'DocuSign' : hasAdobeSign ? 'Adobe Sign' : null;

    plugins.push(
      createFinding({
        domain: 'settings',
        collector: 'settings',
        artifactType: 'PluginStatus',
        artifactName: 'Electronic Signature',
        sourceType: 'inferred',
        findingType: 'plugin_status',
        riskLevel: esigProvider ? 'medium' : 'info',
        countValue: esigProvider ? 1 : 0,
        notes: esigProvider
          ? `Active (${esigProvider}) — document signing integration detected.`
          : 'Not Configured — no e-signature package detected.',
        rcaMappingComplexity: esigProvider ? 'transform' : 'direct',
      })
    );

    // 3. Document Store Plugin
    const docStoreValue = findSettingValue(/DocumentStorePlugin/i);
    plugins.push(
      createFinding({
        domain: 'settings',
        collector: 'settings',
        artifactType: 'PluginStatus',
        artifactName: 'Document Store Plugin',
        sourceType: 'inferred',
        findingType: 'plugin_status',
        riskLevel: 'info',
        countValue: docStoreValue ? 1 : 0,
        notes: docStoreValue
          ? `Active — class: ${String(docStoreValue)}`
          : 'Not Configured — standard document storage in use.',
        rcaMappingComplexity: 'direct',
      })
    );

    // 4. Payment Gateway
    const paymentValue = findSettingValue(/PaymentGateway/i);
    plugins.push(
      createFinding({
        domain: 'settings',
        collector: 'settings',
        artifactType: 'PluginStatus',
        artifactName: 'Payment Gateway',
        sourceType: 'inferred',
        findingType: 'plugin_status',
        riskLevel: paymentValue ? 'medium' : 'info',
        countValue: paymentValue ? 1 : 0,
        notes: paymentValue
          ? `Active — payment processing via CPQ detected.`
          : 'Not Configured — no payment processing via CPQ detected.',
        rcaMappingComplexity: paymentValue ? 'redesign' : 'direct',
      })
    );

    // 5. External Configurator
    const extConfigValue = findSettingValue(/ExternalConfigurat/i);
    plugins.push(
      createFinding({
        domain: 'settings',
        collector: 'settings',
        artifactType: 'PluginStatus',
        artifactName: 'External Configurator',
        sourceType: 'inferred',
        findingType: 'plugin_status',
        riskLevel: extConfigValue ? 'medium' : 'info',
        countValue: extConfigValue ? 1 : 0,
        notes: extConfigValue
          ? `Active — URL: ${String(extConfigValue)}`
          : 'Not Configured — standard CPQ configurator in use.',
        rcaMappingComplexity: extConfigValue ? 'redesign' : 'direct',
      })
    );

    // 6. Recommended Products Plugin
    const recProductsValue = findSettingValue(/RecommendedProduct|ProductRecommendation/i);
    plugins.push(
      createFinding({
        domain: 'settings',
        collector: 'settings',
        artifactType: 'PluginStatus',
        artifactName: 'Recommended Products Plugin',
        sourceType: 'inferred',
        findingType: 'plugin_status',
        riskLevel: 'info',
        countValue: recProductsValue ? 1 : 0,
        notes: recProductsValue ? `Active — class: ${String(recProductsValue)}` : 'Not Configured.',
        rcaMappingComplexity: recProductsValue ? 'transform' : 'direct',
      })
    );

    return plugins;
  }
}

/** Credential-like field name patterns — C-01 redaction policy */
const REDACT_FIELD_PATTERNS = /password|token|secret|key|credential|apikey/i;

/** Credential-like value patterns — heuristic redaction */
const REDACT_VALUE_PATTERNS = /^(sk-|xox-|AKIA|Bearer\s|eyJ)/;

/** Check if a field name + value should be redacted */
function shouldRedact(fieldName: string, value: unknown): boolean {
  if (REDACT_FIELD_PATTERNS.test(fieldName)) return true;
  if (typeof value === 'string' && REDACT_VALUE_PATTERNS.test(value)) return true;
  return false;
}

/** Format a setting value for display, with redaction for sensitive fields */
function formatSettingValue(value: unknown, fieldName?: string): string {
  if (fieldName && shouldRedact(fieldName, value)) return '[REDACTED]';
  if (value === true) return 'Enabled';
  if (value === false) return 'Disabled';
  if (value === null || value === undefined) return 'Not Set';
  if (typeof value === 'number') return String(value);
  const strValue = String(value) || 'Empty';
  // Heuristic: if value looks like a credential even without field name match
  if (REDACT_VALUE_PATTERNS.test(strValue)) return '[REDACTED]';
  return strValue;
}
