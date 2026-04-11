/**
 * registerAllNormalizers() — wire every per-type normalizer into the
 * dispatcher registry.
 *
 * Spec: §6.1 Stage 3, §7 mapping table.
 *
 * Called by the pipeline entry (`normalize()`) and by integration
 * tests. Maintains the `artifactType → normalizer` routing table
 * and the not-modeled-v1 + unknown-artifact fallbacks.
 *
 * Idempotent: safe to call multiple times — re-registers via
 * `resetRegistry()` first so tests that share state don't
 * accidentally double-register.
 */

import { registerNormalizer, resetRegistry, setFallbackNormalizer } from './registry.ts';
import { isNotModeledV1, normalizeNotModeled } from './fallback/not-modeled.ts';
import { normalizeUnknownArtifact } from './fallback/unknown.ts';

// Pricing
import { normalizePricingRule } from './pricing/price-rule.ts';
import { normalizePriceCondition } from './pricing/price-condition.ts';
import { normalizePriceAction } from './pricing/price-action.ts';
import { normalizeDiscountSchedule } from './pricing/discount-schedule.ts';
import { normalizeDiscountTier } from './pricing/discount-tier.ts';
import { normalizeSummaryVariable } from './pricing/summary-variable.ts';
import { normalizeBlockPrice } from './pricing/block-price.ts';
import { normalizeContractedPrice } from './pricing/contracted-price.ts';
import { normalizeLookupQuery } from './pricing/lookup-query.ts';
import { normalizeCustomScript } from './pricing/custom-script.ts';

// Catalog
import { normalizeProduct } from './catalog/product.ts';
import { normalizeBundleStructure } from './catalog/bundle-structure.ts';
import { normalizeBundleOption } from './catalog/bundle-option.ts';
import { normalizeBundleFeature } from './catalog/bundle-feature.ts';
import { normalizeConfigConstraint } from './catalog/config-constraint.ts';
import { normalizeConfigurationAttribute } from './catalog/configuration-attribute.ts';

// Formula / Customization
import { normalizeFormulaField } from './formula/formula-field.ts';
import { normalizeValidationRule } from './formula/validation-rule.ts';
import { normalizeCustomMetadataType } from './customization/custom-metadata.ts';
import { normalizeCustomMetadataRecord } from './customization/custom-metadata-record.ts';
import { normalizeRecordType } from './customization/record-type.ts';

// Automation
import { normalizeApexClass } from './automation/apex-class.ts';
import { normalizeApexTrigger } from './automation/apex-trigger.ts';
import { normalizeFlow } from './automation/flow.ts';
import { normalizeWorkflowRule } from './automation/workflow-rule.ts';
import { normalizeOutboundMessage } from './automation/outbound-message.ts';

// Approvals / Templates / Integrations
import { normalizeCustomAction } from './approvals/custom-action.ts';
import { normalizeApprovalProcess } from './approvals/approval-process.ts';
import { normalizeApprovalChainRule } from './approvals/approval-chain-rule.ts';
import { normalizeDocumentTemplate } from './templates/document-template.ts';
import { normalizeQuoteTermBlock } from './templates/quote-term-block.ts';
import { normalizeNamedCredential } from './integrations/named-credential.ts';
import { normalizeExternalDataSource } from './integrations/external-data-source.ts';
import { normalizeConnectedApp } from './integrations/connected-app.ts';
import { normalizePlatformEvent } from './integrations/platform-event.ts';

// Aggregate / Settings / Localization
import { normalizeLocalizationBundle } from './localization/localization-bundle.ts';
import { normalizeUsageStatistic } from './aggregate/usage-statistic.ts';
import { normalizeOrgFingerprint } from './aggregate/org-fingerprint.ts';
import { normalizeCPQSettingsBundle } from './settings/cpq-settings-bundle.ts';

/**
 * Register every Wave 1–3 normalizer keyed by the artifactType the
 * collectors emit. Idempotent — safe to call multiple times.
 */
export function registerAllNormalizers(): void {
  resetRegistry();

  // Pricing
  registerNormalizer('SBQQ__PriceRule__c', normalizePricingRule);
  registerNormalizer('SBQQ__PriceCondition__c', normalizePriceCondition);
  registerNormalizer('SBQQ__PriceAction__c', normalizePriceAction);
  registerNormalizer('SBQQ__DiscountSchedule__c', normalizeDiscountSchedule);
  registerNormalizer('SBQQ__DiscountTier__c', normalizeDiscountTier);
  registerNormalizer('SBQQ__SummaryVariable__c', normalizeSummaryVariable);
  registerNormalizer('SBQQ__BlockPrice__c', normalizeBlockPrice);
  registerNormalizer('SBQQ__ContractedPrice__c', normalizeContractedPrice);
  registerNormalizer('SBQQ__LookupQuery__c', normalizeLookupQuery);
  registerNormalizer('SBQQ__CustomScript__c', normalizeCustomScript);

  // Catalog
  registerNormalizer('Product2', normalizeProduct);
  registerNormalizer('BundleStructure', normalizeBundleStructure);
  registerNormalizer('SBQQ__ProductOption__c', normalizeBundleOption);
  registerNormalizer('SBQQ__ProductFeature__c', normalizeBundleFeature);
  registerNormalizer('SBQQ__ProductRule__c', normalizeConfigConstraint);
  registerNormalizer('SBQQ__OptionConstraint__c', normalizeConfigConstraint);
  registerNormalizer('SBQQ__ConfigurationAttribute__c', normalizeConfigurationAttribute);

  // Formula / Customization
  registerNormalizer('FormulaField', normalizeFormulaField);
  registerNormalizer('ValidationRule', normalizeValidationRule);
  registerNormalizer('CustomMetadataType', normalizeCustomMetadataType);
  registerNormalizer('CustomMetadataRecord', normalizeCustomMetadataRecord);
  registerNormalizer('RecordType', normalizeRecordType);

  // Automation
  registerNormalizer('ApexClass', normalizeApexClass);
  registerNormalizer('ApexTrigger', normalizeApexTrigger);
  registerNormalizer('Flow', normalizeFlow);
  registerNormalizer('WorkflowRule', normalizeWorkflowRule);
  registerNormalizer('OutboundMessage', normalizeOutboundMessage);

  // Approvals
  registerNormalizer('SBQQ__CustomAction__c', normalizeCustomAction);
  registerNormalizer('ApprovalProcess', normalizeApprovalProcess);
  registerNormalizer('sbaa__ApprovalChainRule__c', normalizeApprovalChainRule);

  // Templates
  registerNormalizer('SBQQ__QuoteTemplate__c', normalizeDocumentTemplate);
  registerNormalizer('SBQQ__QuoteTerm__c', normalizeQuoteTermBlock);

  // Integrations
  registerNormalizer('NamedCredential', normalizeNamedCredential);
  registerNormalizer('ExternalDataSource', normalizeExternalDataSource);
  registerNormalizer('ConnectedApp', normalizeConnectedApp);
  registerNormalizer('PlatformEvent', normalizePlatformEvent);

  // Aggregate / Settings / Localization
  registerNormalizer('LocalizationBundle', normalizeLocalizationBundle);
  registerNormalizer('UsageStatistic', normalizeUsageStatistic);
  registerNormalizer('OrgFingerprint', normalizeOrgFingerprint);
  registerNormalizer('CPQSettingValue', normalizeCPQSettingsBundle);

  // Fallback: any artifactType on the not-modeled-v1 list routes to
  // `normalizeNotModeled`; everything else falls through to the
  // default unknown-artifact fallback. The dispatcher's fallback
  // function decides based on `isNotModeledV1(finding.artifactType)`.
  setFallbackNormalizer((finding, context) => {
    if (isNotModeledV1(finding.artifactType)) {
      return normalizeNotModeled(finding, context);
    }
    return normalizeUnknownArtifact(finding, context);
  });
}
