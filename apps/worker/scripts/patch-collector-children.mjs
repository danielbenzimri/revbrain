#!/usr/bin/env node
/**
 * Phase 4.1 one-shot helper — simulates the collector-side fix
 * for PriceCondition / PriceAction / DiscountTier / BundleOption /
 * BundleFeature / BundleStructure emissions on a cached staging
 * findings JSON, so we can validate the BB-3 edge pipeline
 * end-to-end without waiting on a fresh staging extraction.
 *
 * The real fix lives in apps/worker/src/collectors/{pricing,catalog}.ts;
 * a fresh extraction will emit these findings naturally. This script
 * only exists so Phase 4.1 validation completes in seconds.
 *
 * What it does:
 *   - Reads the cached assessment-results.json
 *   - For every SBQQ__PriceRule__c, fabricates 2 PriceConditions +
 *     1 PriceAction pointing at the rule's artifactId
 *   - For every SBQQ__DiscountSchedule__c, fabricates 3 DiscountTiers
 *   - For every bundle-capable Product2 (ConfigurationType = Required
 *     or Allowed), fabricates 1 BundleStructure + 2 BundleOptions +
 *     1 BundleFeature keyed by the product's ProductCode
 *
 * This is a SYNTHETIC validation helper, not a production tool.
 *
 * Usage:
 *   node apps/worker/scripts/patch-collector-children.mjs \
 *     --input=apps/worker/output/assessment-results.json \
 *     --output=apps/worker/output/assessment-results-with-children.json
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v];
  })
);

if (!args.input || !args.output) {
  console.error('Usage: node patch-collector-children.mjs --input=<path> --output=<path>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(args.input, 'utf-8'));
const findings = raw.findings ?? [];

let added = 0;

function push(f) {
  findings.push(f);
  added += 1;
}

// ---- Pricing children: 2 conditions + 1 action per rule ------------------
const rules = findings.filter((f) => f.artifactType === 'SBQQ__PriceRule__c');
for (const rule of rules) {
  for (let i = 0; i < 2; i++) {
    push({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__PriceCondition__c',
      artifactName: `${rule.artifactName} Cond ${i + 1}`,
      artifactId: `${rule.artifactId}-cond-${i + 1}`,
      findingKey: `synthetic:cond:${rule.artifactId}:${i + 1}`,
      sourceType: 'object',
      detected: true,
      countValue: i + 1,
      textValue: i === 0 ? '100' : 'Active',
      notes: i === 0 ? 'greater than' : 'equals',
      evidenceRefs: [{ type: 'record-id', value: rule.artifactId }],
      schemaVersion: '1.0',
    });
  }
  push({
    domain: 'pricing',
    collectorName: 'pricing',
    artifactType: 'SBQQ__PriceAction__c',
    artifactName: `${rule.artifactName} Action`,
    artifactId: `${rule.artifactId}-act-1`,
    findingKey: `synthetic:act:${rule.artifactId}`,
    sourceType: 'object',
    detected: true,
    countValue: 1,
    textValue: '20',
    notes: 'set discount percent',
    evidenceRefs: [{ type: 'record-id', value: rule.artifactId }],
    schemaVersion: '1.0',
  });
}

// ---- Pricing children: 3 tiers per discount schedule --------------------
const schedules = findings.filter((f) => f.artifactType === 'SBQQ__DiscountSchedule__c');
for (const sched of schedules) {
  for (let i = 0; i < 3; i++) {
    push({
      domain: 'pricing',
      collectorName: 'pricing',
      artifactType: 'SBQQ__DiscountTier__c',
      artifactName: `${sched.artifactName} Tier ${i + 1}`,
      artifactId: `${sched.artifactId}-tier-${i + 1}`,
      findingKey: `synthetic:tier:${sched.artifactId}:${i + 1}`,
      sourceType: 'object',
      detected: true,
      countValue: i * 10,
      textValue: String(5 * (i + 1)),
      evidenceRefs: [{ type: 'record-id', value: sched.artifactId }],
      schemaVersion: '1.0',
    });
  }
}

// ---- Catalog children: bundle-capable products → BundleStructure + opts/features ---
// Identify bundle-capable products via the existing Product2 findings.
// In the cache, only a handful are marked as configurable (we don't
// have the raw config type in the finding, so we use the ones with
// complexityLevel === 'medium' as a proxy — the collector sets that
// exactly for Required/Allowed configuration type).
const products = findings.filter((f) => f.artifactType === 'Product2');
const bundleProducts = products.filter((p) => p.complexityLevel === 'medium');
for (const p of bundleProducts) {
  const productCode =
    p.evidenceRefs?.find((r) => r.value === 'Product2.ProductCode' && typeof r.label === 'string')
      ?.label ??
    p.artifactId ??
    p.findingKey;
  push({
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'BundleStructure',
    artifactName: p.artifactName,
    artifactId: p.artifactId,
    findingKey: `synthetic:bs:${p.artifactId}`,
    sourceType: 'object',
    detected: true,
    notes: 'Required',
    evidenceRefs: [{ type: 'field-ref', value: 'Product2.ProductCode', label: productCode }],
    schemaVersion: '1.0',
  });
  for (let i = 0; i < 2; i++) {
    push({
      domain: 'catalog',
      collectorName: 'catalog',
      artifactType: 'SBQQ__ProductOption__c',
      artifactName: `${p.artifactName} Opt ${i + 1}`,
      artifactId: `${p.artifactId}-opt-${i + 1}`,
      findingKey: `synthetic:opt:${p.artifactId}:${i + 1}`,
      sourceType: 'object',
      detected: true,
      countValue: i + 1,
      notes: 'Component',
      evidenceRefs: [
        { type: 'object-ref', value: productCode },
        {
          type: 'field-ref',
          value: 'OptionalSKU.ProductCode',
          label: `${productCode}-ADDON-${i + 1}`,
        },
      ],
      schemaVersion: '1.0',
    });
  }
  push({
    domain: 'catalog',
    collectorName: 'catalog',
    artifactType: 'SBQQ__ProductFeature__c',
    artifactName: `${p.artifactName} Feature`,
    artifactId: `${p.artifactId}-feat-1`,
    findingKey: `synthetic:feat:${p.artifactId}`,
    sourceType: 'object',
    detected: true,
    countValue: 1,
    notes: 'Storage',
    evidenceRefs: [{ type: 'object-ref', value: productCode }],
    schemaVersion: '1.0',
  });
}

writeFileSync(args.output, JSON.stringify(raw, null, 2));

console.log(`Injected ${added} synthetic collector-shape findings`);
console.log(`  ${rules.length} price rules → ${rules.length * 3} pricing children`);
console.log(`  ${schedules.length} discount schedules → ${schedules.length * 3} tier findings`);
console.log(
  `  ${bundleProducts.length} bundle products → ${bundleProducts.length * 4} catalog children`
);
console.log(`Total findings: ${findings.length}`);
console.log(`Output: ${args.output}`);
