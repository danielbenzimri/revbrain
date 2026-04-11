#!/usr/bin/env node
/**
 * One-shot patch: retroactively apply the EXT-CC4 collector fix
 * (artifactType: 'ApexClass' → 'ThirdPartyPackagedApexClass') on
 * a previously-cached staging findings JSON, so we can regenerate
 * the PDF without re-running a full staging extraction.
 *
 * This is a VALIDATION helper, not a permanent script. The real
 * fix is in `apps/worker/src/collectors/dependencies.ts` — a fresh
 * extraction will naturally produce the new artifactType. This
 * script exists so we can validate Phase 1 Action 5 (PDF page
 * count drops back to ~37-40) without waiting on a staging run.
 *
 * Usage:
 *   node apps/worker/scripts/patch-third-party-apex.mjs \
 *     --input apps/worker/output/assessment-results.json \
 *     --output apps/worker/output/assessment-results-patched.json
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v];
  })
);

if (!args.input || !args.output) {
  console.error('Usage: node patch-third-party-apex.mjs --input=<path> --output=<path>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(args.input, 'utf-8'));
const findings = raw.findings ?? [];

let patched = 0;
for (const f of findings) {
  // The cached JSON doesn't include the transient `findingType`
  // field from createFinding — it was folded into `findingKey`
  // at construction time. Match on the findingKey suffix instead.
  if (
    f.artifactType === 'ApexClass' &&
    typeof f.findingKey === 'string' &&
    f.findingKey.includes('apex_third_party_packaged')
  ) {
    f.artifactType = 'ThirdPartyPackagedApexClass';
    // Keep findingKey consistent with the new artifactType so any
    // downstream consumer that splits the key also sees the fix.
    f.findingKey = f.findingKey.replace(':ApexClass:', ':ThirdPartyPackagedApexClass:');
    patched += 1;
  }
}

writeFileSync(args.output, JSON.stringify(raw, null, 2));

console.log(`Patched ${patched} finding(s) from ApexClass → ThirdPartyPackagedApexClass`);
console.log(`Total findings: ${findings.length}`);
console.log(`Output: ${args.output}`);
