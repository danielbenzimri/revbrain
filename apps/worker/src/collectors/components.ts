/**
 * Components collector — LWC, Aura, Visualforce, Static Resources (EXT-1.7).
 *
 * Implements gaps-doc §5 Gap 1.7 closure: extract source bundles
 * for the four classes of UI / static-asset metadata that the
 * pre-fix worker did not touch at all. These are the largest
 * silent-miss class in the extraction surface — customers move
 * UI logic into LWC + Aura when standard CPQ pages can't express
 * what they need, and any migration that ignores them is
 * systematically under-scoped.
 *
 * Strategy per the v1.1 audit:
 *   - LWC: query LightningComponentBundle + LightningComponentResource
 *   - Aura: query AuraDefinitionBundle + AuraDefinition
 *   - VF: query ApexPage + ApexComponent (NamespacePrefix = null)
 *   - Static Resources: query StaticResource WHERE BodyLength < 3 MB,
 *     then filter by file extension AND magic-byte sniff (NOT MIME
 *     type — see v1.1 fix in gaps-doc §5 Gap 1.7)
 *
 * Tier 2 — failure → completed_warnings. Per OQ-6 the four
 * sub-extractors are independent: failure of one does not block
 * the others. Each surfaces its own status in metrics so the
 * report can show "LWC ok / Aura degraded / VF ok / Static
 * Resources failed" instead of an opaque collector failure.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import { truncateWithFlag } from '../lib/truncate.ts';

/** Tokens that mark a bundle / resource as CPQ-related. */
const CPQ_TOKENS = /SBQQ__|sbaa__|blng__|Quote__c|QuoteLine__c|SBQQ\.\w+/;

/** File extensions we WILL extract the body of. */
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.html',
  '.json',
  '.css',
  '.xml',
  '.txt',
  '.md',
  '.svg',
  '.cmp',
  '.app',
  '.evt',
  '.intf',
]);

/** Per-component textValue truncation cap. */
const COMPONENT_BODY_CAP_BYTES = 262_144; // 256 KB

/**
 * Magic-byte sniff for known binary formats. Exported so the
 * follow-up SF-client raw-bytes refactor can wire it back into
 * `extractStaticResources` without re-deriving the byte patterns.
 * Currently unused at runtime (static resource body fetch is
 * deferred — see the comment in `extractStaticResources`).
 */
export function isBinaryByMagic(body: Buffer): boolean {
  if (body.length < 4) return false;
  const b0 = body[0]!,
    b1 = body[1]!,
    b2 = body[2]!,
    b3 = body[3]!;
  // PNG: 89 50 4E 47
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return true;
  // JPEG: FF D8 FF
  if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) return true;
  // PDF: 25 50 44 46
  if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46) return true;
  // ZIP / DOCX / XLSX / JAR: 50 4B 03 04
  if (b0 === 0x50 && b1 === 0x4b && b2 === 0x03 && b3 === 0x04) return true;
  // GIF: 47 49 46 38
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46 && b3 === 0x38) return true;
  return false;
}

type SubStatus = 'ok' | 'degraded' | 'failed';

export class ComponentsCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'components',
      tier: 'tier2',
      timeoutMs: 10 * 60_000,
      requires: ['discovery'],
      domain: 'customization',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // EXT-1.7b — LWC
    const lwcStatus = await this.extractLwc(findings, metrics, warnings);
    metrics.lwcStatus = lwcStatus;

    if (await this.checkCancellation())
      return {
        findings,
        relationships: [],
        metrics: this.buildMetrics(metrics, warnings),
        status: 'partial',
      };

    // EXT-1.7b — Aura
    const auraStatus = await this.extractAura(findings, metrics, warnings);
    metrics.auraStatus = auraStatus;

    if (await this.checkCancellation())
      return {
        findings,
        relationships: [],
        metrics: this.buildMetrics(metrics, warnings),
        status: 'partial',
      };

    // EXT-1.7c — Visualforce
    const vfStatus = await this.extractVisualforce(findings, metrics, warnings);
    metrics.vfStatus = vfStatus;

    if (await this.checkCancellation())
      return {
        findings,
        relationships: [],
        metrics: this.buildMetrics(metrics, warnings),
        status: 'partial',
      };

    // EXT-1.7c — Static Resources
    const srStatus = await this.extractStaticResources(findings, metrics, warnings);
    metrics.staticResourceStatus = srStatus;

    const failures = [lwcStatus, auraStatus, vfStatus, srStatus].filter(
      (s) => s === 'failed'
    ).length;
    const status: 'success' | 'partial' = failures > 0 ? 'partial' : 'success';

    return {
      findings,
      relationships: [],
      metrics: this.buildMetrics(metrics, warnings),
      status,
    };
  }

  private buildMetrics(metrics: Record<string, number | string | boolean>, warnings: string[]) {
    return {
      collectorName: 'components',
      domain: 'customization' as const,
      metrics,
      warnings,
      coverage: 100,
      schemaVersion: '1.0',
    };
  }

  /** EXT-1.7b — LightningComponentBundle + LightningComponentResource. */
  private async extractLwc(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): Promise<SubStatus> {
    try {
      const bundles = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, DeveloperName, NamespacePrefix, ApiVersion FROM LightningComponentBundle WHERE NamespacePrefix = null',
        this.signal
      );
      metrics.lwcBundleCount = bundles.records.length;
      let cpqRelated = 0;

      for (const bundle of bundles.records) {
        const bundleId = bundle.Id as string;
        const bundleName = bundle.DeveloperName as string;

        // Per-bundle: fetch every resource (file) belonging to it.
        let resources: Array<Record<string, unknown>> = [];
        try {
          const r = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
            `SELECT Id, FilePath, Format, Source FROM LightningComponentResource WHERE LightningComponentBundleId = '${bundleId}'`,
            this.signal
          );
          resources = r.records;
        } catch (err) {
          warnings.push(`LWC ${bundleName}: resource fetch failed — ${(err as Error).message}`);
          continue;
        }

        // Concatenate all source for the CPQ-detection scan.
        const aggregateSource = resources.map((r) => (r.Source as string) || '').join('\n');
        const isCpqRelated = CPQ_TOKENS.test(aggregateSource);
        if (isCpqRelated) cpqRelated++;

        // Bundle-level finding
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'components',
            artifactType: 'LightningComponentBundle',
            artifactName: bundleName,
            artifactId: bundleId,
            findingType: 'lwc_bundle',
            sourceType: 'tooling',
            riskLevel: isCpqRelated ? 'medium' : 'info',
            complexityLevel: isCpqRelated ? 'medium' : 'low',
            migrationRelevance: isCpqRelated ? 'should-migrate' : 'optional',
            countValue: resources.length,
            notes: `LWC bundle: ${bundleName} (${resources.length} files)${isCpqRelated ? ' — references CPQ tokens' : ''}`,
          })
        );

        if (!isCpqRelated || !this.ctx.config.codeExtractionEnabled) continue;

        // Per-file findings, body-extracted (CPQ-related only)
        for (const r of resources) {
          const filePath = r.FilePath as string;
          const source = (r.Source as string) || '';
          const truncated = truncateWithFlag(source, COMPONENT_BODY_CAP_BYTES);
          findings.push(
            createFinding({
              domain: 'customization',
              collector: 'components',
              artifactType: 'LightningComponentBundle',
              artifactName: `${bundleName}:${filePath}`,
              artifactId: r.Id as string,
              findingType: 'lwc_resource',
              sourceType: 'tooling',
              textValue: truncated.value,
              notes:
                `LWC resource: ${filePath}` +
                (truncated.wasTruncated
                  ? ` (truncated from ${truncated.originalBytes} bytes)`
                  : ''),
            })
          );
        }
      }
      metrics.lwcCpqRelatedBundleCount = cpqRelated;
      return 'ok';
    } catch (err) {
      warnings.push(`LWC extraction failed: ${(err as Error).message}`);
      return 'failed';
    }
  }

  /** EXT-1.7b — AuraDefinitionBundle + AuraDefinition. */
  private async extractAura(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): Promise<SubStatus> {
    try {
      const bundles = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, DeveloperName, NamespacePrefix, ApiVersion FROM AuraDefinitionBundle WHERE NamespacePrefix = null',
        this.signal
      );
      metrics.auraBundleCount = bundles.records.length;
      let cpqRelated = 0;

      for (const bundle of bundles.records) {
        const bundleId = bundle.Id as string;
        const bundleName = bundle.DeveloperName as string;

        let definitions: Array<Record<string, unknown>> = [];
        try {
          const r = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
            `SELECT Id, DefType, Source FROM AuraDefinition WHERE AuraDefinitionBundleId = '${bundleId}'`,
            this.signal
          );
          definitions = r.records;
        } catch (err) {
          warnings.push(`Aura ${bundleName}: definition fetch failed — ${(err as Error).message}`);
          continue;
        }

        const aggregateSource = definitions.map((d) => (d.Source as string) || '').join('\n');
        const isCpqRelated = CPQ_TOKENS.test(aggregateSource);
        if (isCpqRelated) cpqRelated++;

        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'components',
            artifactType: 'AuraDefinitionBundle',
            artifactName: bundleName,
            artifactId: bundleId,
            findingType: 'aura_bundle',
            sourceType: 'tooling',
            riskLevel: isCpqRelated ? 'medium' : 'info',
            complexityLevel: isCpqRelated ? 'medium' : 'low',
            migrationRelevance: isCpqRelated ? 'should-migrate' : 'optional',
            countValue: definitions.length,
            notes: `Aura bundle: ${bundleName} (${definitions.length} files)${isCpqRelated ? ' — references CPQ tokens' : ''}`,
          })
        );

        if (!isCpqRelated || !this.ctx.config.codeExtractionEnabled) continue;

        for (const d of definitions) {
          const defType = d.DefType as string;
          const source = (d.Source as string) || '';
          const truncated = truncateWithFlag(source, COMPONENT_BODY_CAP_BYTES);
          findings.push(
            createFinding({
              domain: 'customization',
              collector: 'components',
              artifactType: 'AuraDefinitionBundle',
              artifactName: `${bundleName}:${defType}`,
              artifactId: d.Id as string,
              findingType: 'aura_definition',
              sourceType: 'tooling',
              textValue: truncated.value,
              notes:
                `Aura definition: ${defType}` +
                (truncated.wasTruncated
                  ? ` (truncated from ${truncated.originalBytes} bytes)`
                  : ''),
            })
          );
        }
      }
      metrics.auraCpqRelatedBundleCount = cpqRelated;
      return 'ok';
    } catch (err) {
      warnings.push(`Aura extraction failed: ${(err as Error).message}`);
      return 'failed';
    }
  }

  /** EXT-1.7c — Visualforce pages and components. */
  private async extractVisualforce(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): Promise<SubStatus> {
    let pageCount = 0;
    let pageCpqCount = 0;
    let componentCount = 0;
    let componentCpqCount = 0;
    let degraded = false;

    // VF pages
    try {
      const pages = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, Name, Markup, ApiVersion FROM ApexPage WHERE NamespacePrefix = null',
        this.signal
      );
      pageCount = pages.records.length;
      for (const p of pages.records) {
        const markup = (p.Markup as string) || '';
        const isCpqRelated = CPQ_TOKENS.test(markup);
        if (isCpqRelated) pageCpqCount++;
        const truncated = truncateWithFlag(markup, COMPONENT_BODY_CAP_BYTES);
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'components',
            artifactType: 'ApexPage',
            artifactName: p.Name as string,
            artifactId: p.Id as string,
            findingType: 'visualforce_page',
            sourceType: 'tooling',
            riskLevel: isCpqRelated ? 'high' : 'info',
            complexityLevel: isCpqRelated ? 'high' : 'low',
            migrationRelevance: isCpqRelated ? 'must-migrate' : 'optional',
            rcaTargetConcept: isCpqRelated ? 'LWC migration' : undefined,
            rcaMappingComplexity: isCpqRelated ? 'redesign' : undefined,
            textValue:
              this.ctx.config.codeExtractionEnabled && isCpqRelated ? truncated.value : undefined,
            notes:
              `Visualforce page: ${p.Name as string}` +
              (isCpqRelated ? ' — references CPQ' : '') +
              (truncated.wasTruncated ? ` (truncated from ${truncated.originalBytes} bytes)` : ''),
          })
        );
      }
    } catch (err) {
      warnings.push(`VF page extraction failed: ${(err as Error).message}`);
      degraded = true;
    }

    // VF components
    try {
      const components = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, Name, Markup, ApiVersion FROM ApexComponent WHERE NamespacePrefix = null',
        this.signal
      );
      componentCount = components.records.length;
      for (const c of components.records) {
        const markup = (c.Markup as string) || '';
        const isCpqRelated = CPQ_TOKENS.test(markup);
        if (isCpqRelated) componentCpqCount++;
        const truncated = truncateWithFlag(markup, COMPONENT_BODY_CAP_BYTES);
        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'components',
            artifactType: 'ApexComponent',
            artifactName: c.Name as string,
            artifactId: c.Id as string,
            findingType: 'visualforce_component',
            sourceType: 'tooling',
            riskLevel: isCpqRelated ? 'high' : 'info',
            complexityLevel: isCpqRelated ? 'high' : 'low',
            migrationRelevance: isCpqRelated ? 'must-migrate' : 'optional',
            rcaTargetConcept: isCpqRelated ? 'LWC migration' : undefined,
            rcaMappingComplexity: isCpqRelated ? 'redesign' : undefined,
            textValue:
              this.ctx.config.codeExtractionEnabled && isCpqRelated ? truncated.value : undefined,
            notes:
              `Visualforce component: ${c.Name as string}` +
              (isCpqRelated ? ' — references CPQ' : '') +
              (truncated.wasTruncated ? ` (truncated from ${truncated.originalBytes} bytes)` : ''),
          })
        );
      }
    } catch (err) {
      warnings.push(`VF component extraction failed: ${(err as Error).message}`);
      degraded = true;
    }

    metrics.vfPageCount = pageCount;
    metrics.vfPageCpqCount = pageCpqCount;
    metrics.vfComponentCount = componentCount;
    metrics.vfComponentCpqCount = componentCpqCount;
    return degraded ? 'degraded' : 'ok';
  }

  /**
   * EXT-1.7c — Static Resource INVENTORY (no body fetch).
   *
   * Body fetch for static resources requires a raw-text REST call
   * (`/sobjects/StaticResource/<Id>/Body`) that returns octet-stream
   * bytes, not JSON. The current SalesforceRestApi client only
   * supports JSON responses. Adding raw-bytes support is a separate
   * client refactor that pairs with the spill-to-storage design from
   * gaps-doc OQ-2 — for THIS card, we ship inventory only and
   * mark the body extraction as a follow-up in TECH-DEBT.
   *
   * Inventory still produces a finding per resource with name,
   * size, content type, and CPQ-token check on the NAME (the
   * body would catch more, but the name is enough to flag the
   * obvious cases like `sbqqHelpers.js` or `cpq_overrides.css`).
   */
  private async extractStaticResources(
    findings: AssessmentFindingInput[],
    metrics: Record<string, number | string | boolean>,
    warnings: string[]
  ): Promise<SubStatus> {
    try {
      const result = await this.ctx.restApi.queryAll<Record<string, unknown>>(
        `SELECT Id, Name, ContentType, BodyLength FROM StaticResource WHERE NamespacePrefix = null AND BodyLength < ${3 * 1024 * 1024}`,
        this.signal
      );
      metrics.staticResourceCount = result.length;
      let cpqRelated = 0;

      for (const r of result) {
        const id = r.Id as string;
        const name = r.Name as string;
        const bodyLen = r.BodyLength as number;
        const contentType = (r.ContentType as string) || '';
        // Primary signal: file extension on Name. SF doesn't store
        // an extension on the metadata row but customers usually
        // include it (e.g. `MyHelpers.js`).
        const lowerName = name.toLowerCase();
        const ext = lowerName.includes('.') ? '.' + lowerName.split('.').pop() : '';
        const isTextByExtension = TEXT_EXTENSIONS.has(ext);
        const isCpqRelated = /sbqq|cpq|quote/i.test(name);
        if (isCpqRelated) cpqRelated++;

        findings.push(
          createFinding({
            domain: 'customization',
            collector: 'components',
            artifactType: 'StaticResource',
            artifactName: name,
            artifactId: id,
            findingType: 'static_resource',
            sourceType: 'tooling',
            riskLevel: isCpqRelated ? 'medium' : 'info',
            complexityLevel: 'low',
            migrationRelevance: isCpqRelated ? 'should-migrate' : 'optional',
            countValue: bodyLen,
            notes:
              `Static resource: ${name} (${bodyLen} bytes, ${contentType})` +
              (isTextByExtension ? ' — text-extension' : ' — non-text-extension') +
              (isCpqRelated ? ' — CPQ-related (name match)' : '') +
              ' (body inventory only — body fetch deferred to spill-to-storage refactor)',
          })
        );
      }
      metrics.staticResourceCpqRelatedCount = cpqRelated;
      return 'ok';
    } catch (err) {
      warnings.push(`Static resource extraction failed: ${(err as Error).message}`);
      return 'failed';
    }
  }
}

// EXT-1.7c follow-up: static resource body fetch is deferred until
// the SF REST client is extended to handle raw-bytes responses
// (separate refactor). The `isBinaryByMagic` helper above is
// exported for that follow-up — once raw-bytes lands, the static
// resource extractor can fetch the body and use the helper to
// reject binaries.
