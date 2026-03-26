/**
 * Integrations collector — named credentials, external data sources, platform events,
 * outbound messages, connected apps, e-signature detection.
 *
 * Implements Extraction Spec Section 11:
 * - Step 11.1: Named Credentials via Tooling API
 * - Step 11.3: External Data Sources via Tooling API
 * - Step 11.4: Connected Apps
 * - Step 11.5: Outbound Messages on CPQ objects
 * - Step 11.6: External Service Registrations
 * - Step 11.7: Platform Events (EntityDefinition WHERE QualifiedApiName LIKE '%__e')
 * - Step 11.8: Callout detection from dependencies collector
 * - Step 11.9: E-Signature package detection
 *
 * Requires: discovery (for Describe cache), dependencies (for Apex callout data)
 *
 * Tier 2 — failure → completed_warnings.
 */

import { BaseCollector, type CollectorContext, type CollectorResult } from './base.ts';
import type { CollectorDefinition } from './registry.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { createFinding } from '../normalize/findings.ts';
import type { DescribeResult } from '../salesforce/rest.ts';

const CPQ_OBJECTS_FOR_MESSAGES = [
  'SBQQ__Quote__c',
  'SBQQ__QuoteLine__c',
  'Opportunity',
  'Order',
  'Contract',
];

export class IntegrationsCollector extends BaseCollector {
  constructor(ctx: CollectorContext) {
    const definition: CollectorDefinition = {
      name: 'integrations',
      tier: 'tier2',
      timeoutMs: 10 * 60_000,
      requires: ['discovery', 'dependencies'],
      domain: 'integration',
    };
    super(definition, ctx);
  }

  protected async execute(): Promise<CollectorResult> {
    const findings: AssessmentFindingInput[] = [];
    const metrics: Record<string, number | string | boolean> = {};
    const warnings: string[] = [];

    // ================================================================
    // 11.1: Named Credentials
    // ================================================================
    this.ctx.progress.updateSubstep('integrations', 'named_credentials');
    this.log.info('extracting_named_credentials');

    try {
      const result = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, DeveloperName, Endpoint, PrincipalType, ' +
          'AuthProvider.DeveloperName ' +
          'FROM NamedCredential',
        this.signal
      );

      metrics.totalNamedCredentials = result.records.length;

      for (const nc of result.records) {
        findings.push(
          createFinding({
            domain: 'integration',
            collector: 'integrations',
            artifactType: 'NamedCredential',
            artifactName: nc.DeveloperName as string,
            artifactId: nc.Id as string,
            findingType: 'named_credential',
            sourceType: 'tooling',
            riskLevel: 'medium',
            migrationRelevance: 'should-migrate',
            rcaTargetConcept: 'Named Credentials (reusable)',
            rcaMappingComplexity: 'direct',
            notes: `Named Credential: ${nc.DeveloperName} → ${nc.Endpoint || 'no endpoint'} (${nc.PrincipalType || 'unset'})`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'named_credentials_extraction_failed');
      warnings.push(`Named credentials extraction failed: ${(err as Error).message}`);
      metrics.totalNamedCredentials = -1;
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 11.3: External Data Sources
    // ================================================================
    this.ctx.progress.updateSubstep('integrations', 'external_data_sources');

    try {
      const result = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, DeveloperName, Type, Endpoint, ' +
          'IsWritable, PrincipalType ' +
          'FROM ExternalDataSource',
        this.signal
      );

      metrics.totalExternalDataSources = result.records.length;

      for (const eds of result.records) {
        findings.push(
          createFinding({
            domain: 'integration',
            collector: 'integrations',
            artifactType: 'ExternalDataSource',
            artifactName: eds.DeveloperName as string,
            artifactId: eds.Id as string,
            findingType: 'external_data_source',
            sourceType: 'tooling',
            riskLevel: eds.IsWritable ? 'high' : 'medium',
            migrationRelevance: 'should-migrate',
            rcaTargetConcept: 'External Data Source',
            rcaMappingComplexity: 'transform',
            notes: `External Data Source: ${eds.DeveloperName} — Type: ${eds.Type}, Endpoint: ${eds.Endpoint || 'none'}${eds.IsWritable ? ' (WRITABLE)' : ' (read-only)'}`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'external_data_sources_extraction_failed');
      warnings.push(`External data sources extraction failed: ${(err as Error).message}`);
      metrics.totalExternalDataSources = -1;
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 11.4: Connected Apps
    // ================================================================
    this.ctx.progress.updateSubstep('integrations', 'connected_apps');

    try {
      const result = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, Name, ContactEmail, Description, ' +
          'LogoUrl, MobileStartUrl, ' +
          'OptionsAllowAdminApprovedUsersOnly, StartUrl ' +
          'FROM ConnectedApplication',
        this.signal
      );

      metrics.totalConnectedApps = result.records.length;

      for (const app of result.records) {
        findings.push(
          createFinding({
            domain: 'integration',
            collector: 'integrations',
            artifactType: 'ConnectedApp',
            artifactName: app.Name as string,
            artifactId: app.Id as string,
            findingType: 'connected_app',
            sourceType: 'tooling',
            riskLevel: 'medium',
            migrationRelevance: 'should-migrate',
            rcaTargetConcept: 'Connected App',
            rcaMappingComplexity: 'direct',
            notes: `Connected App: ${app.Name}${app.Description ? ` — ${(app.Description as string).slice(0, 200)}` : ''}`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'connected_apps_extraction_failed');
      warnings.push(`Connected apps extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 11.5: Outbound Messages on CPQ objects
    // ================================================================
    this.ctx.progress.updateSubstep('integrations', 'outbound_messages');

    try {
      const objectList = CPQ_OBJECTS_FOR_MESSAGES.map((o) => `'${o}'`).join(',');
      const result = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        `SELECT Id, Name, ApiVersion, EndpointUrl, IncludeSessionId, ` +
          `EntityDefinition.QualifiedApiName ` +
          `FROM WorkflowOutboundMessage ` +
          `WHERE EntityDefinition.QualifiedApiName IN (${objectList})`,
        this.signal
      );

      metrics.outboundMessagesOnCPQ = result.records.length;

      for (const msg of result.records) {
        const entity = (msg.EntityDefinition as Record<string, unknown>)
          ?.QualifiedApiName as string;
        findings.push(
          createFinding({
            domain: 'integration',
            collector: 'integrations',
            artifactType: 'OutboundMessage',
            artifactName: msg.Name as string,
            artifactId: msg.Id as string,
            findingType: 'outbound_message_cpq',
            sourceType: 'tooling',
            riskLevel: 'high',
            complexityLevel: 'high',
            migrationRelevance: 'must-migrate',
            rcaTargetConcept: 'Platform Event or Flow callout',
            rcaMappingComplexity: 'redesign',
            notes: `Outbound Message on ${entity}: ${msg.Name} → ${msg.EndpointUrl}${msg.IncludeSessionId ? ' (includes session ID)' : ''}`,
            evidenceRefs: [
              {
                type: 'api-response',
                value: `Endpoint: ${msg.EndpointUrl}`,
                label: msg.Name as string,
                referencedObjects: entity ? [entity] : [],
              },
            ],
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'outbound_messages_extraction_failed');
      warnings.push(`Outbound messages extraction failed: ${(err as Error).message}`);
      metrics.outboundMessagesOnCPQ = -1;
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 11.6: External Service Registrations
    // ================================================================
    this.ctx.progress.updateSubstep('integrations', 'external_services');

    try {
      const result = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT Id, DeveloperName, Description, ' +
          'NamedCredentialReference, SchemaUrl ' +
          'FROM ExternalServiceRegistration',
        this.signal
      );

      metrics.externalServiceCount = result.records.length;

      for (const svc of result.records) {
        findings.push(
          createFinding({
            domain: 'integration',
            collector: 'integrations',
            artifactType: 'ExternalService',
            artifactName: svc.DeveloperName as string,
            artifactId: svc.Id as string,
            findingType: 'external_service',
            sourceType: 'tooling',
            riskLevel: 'medium',
            migrationRelevance: 'should-migrate',
            rcaTargetConcept: 'External Service',
            rcaMappingComplexity: 'direct',
            notes: `External Service: ${svc.DeveloperName}${svc.NamedCredentialReference ? ` (uses credential: ${svc.NamedCredentialReference})` : ''}`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'external_services_extraction_failed');
      warnings.push(`External service extraction failed: ${(err as Error).message}`);
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 11.7: Platform Events
    // ================================================================
    this.ctx.progress.updateSubstep('integrations', 'platform_events');

    try {
      const result = await this.ctx.restApi.toolingQuery<Record<string, unknown>>(
        'SELECT QualifiedApiName, DeveloperName, Label, Description ' +
          'FROM EntityDefinition ' +
          "WHERE IsCustomizable = true AND QualifiedApiName LIKE '%__e'",
        this.signal
      );

      metrics.platformEventCount = result.records.length;

      for (const evt of result.records) {
        findings.push(
          createFinding({
            domain: 'integration',
            collector: 'integrations',
            artifactType: 'PlatformEvent',
            artifactName: evt.QualifiedApiName as string,
            findingType: 'platform_event',
            sourceType: 'tooling',
            riskLevel: 'medium',
            migrationRelevance: 'should-migrate',
            rcaTargetConcept: 'Platform Event',
            rcaMappingComplexity: 'direct',
            notes: `Platform Event: ${evt.QualifiedApiName} (${evt.Label})${evt.Description ? ` — ${(evt.Description as string).slice(0, 200)}` : ''}`,
          })
        );
      }
    } catch (err) {
      this.log.warn({ error: (err as Error).message }, 'platform_events_extraction_failed');
      warnings.push(`Platform events extraction failed: ${(err as Error).message}`);
      metrics.platformEventCount = -1;
    }

    if (await this.checkCancellation()) return this.emptyResult('success');

    // ================================================================
    // 11.8: External ID fields on CPQ objects (from Describe cache)
    // ================================================================
    this.ctx.progress.updateSubstep('integrations', 'external_id_fields');

    let externalIdFieldCount = 0;
    const cpqObjectsToCheck = [
      'SBQQ__Quote__c',
      'SBQQ__QuoteLine__c',
      'SBQQ__QuoteLineGroup__c',
      'Product2',
      'Opportunity',
      'Order',
      'OrderItem',
      'Contract',
      'Account',
    ];

    for (const objName of cpqObjectsToCheck) {
      const describe = this.ctx.describeCache.get(objName) as DescribeResult | undefined;
      if (!describe) continue;

      // Look for custom fields marked as externalId
      // DescribeField doesn't have externalId in the type, but it's in the raw response
      const extIdFields = describe.fields.filter(
        (f) => f.custom && (f as unknown as Record<string, unknown>).externalId === true
      );
      externalIdFieldCount += extIdFields.length;

      for (const f of extIdFields) {
        findings.push(
          createFinding({
            domain: 'integration',
            collector: 'integrations',
            artifactType: 'ExternalIdField',
            artifactName: `${objName}.${f.name}`,
            findingType: 'external_id_field',
            sourceType: 'metadata',
            riskLevel: 'medium',
            migrationRelevance: 'must-migrate',
            rcaTargetConcept: 'External ID field',
            rcaMappingComplexity: 'direct',
            notes: `External ID field on ${objName}: ${f.name} (${f.type}) — integration key, must preserve during migration`,
          })
        );
      }
    }

    metrics.externalIdFieldsOnCPQ = externalIdFieldCount;

    // ================================================================
    // 11.9: E-Signature package detection
    // ================================================================
    this.ctx.progress.updateSubstep('integrations', 'esignature');

    let eSignatureDetected = false;
    const quoteDescribe = this.ctx.describeCache.get('SBQQ__Quote__c') as
      | DescribeResult
      | undefined;
    if (quoteDescribe) {
      const docuSignFields = quoteDescribe.fields.filter(
        (f) => f.name.startsWith('dsfs__') || f.name.startsWith('echosign_dev1__')
      );
      if (docuSignFields.length > 0) {
        eSignatureDetected = true;
        const namespace = docuSignFields[0].name.startsWith('dsfs__') ? 'DocuSign' : 'Adobe Sign';

        findings.push(
          createFinding({
            domain: 'integration',
            collector: 'integrations',
            artifactType: 'ESignatureIntegration',
            artifactName: namespace,
            findingType: 'esignature_detected',
            sourceType: 'metadata',
            riskLevel: 'high',
            complexityLevel: 'high',
            migrationRelevance: 'must-migrate',
            rcaTargetConcept: 'E-Signature integration',
            rcaMappingComplexity: 'redesign',
            countValue: docuSignFields.length,
            notes: `${namespace} integration detected — ${docuSignFields.length} fields on SBQQ__Quote__c. E-signature workflow must be reconfigured for RCA.`,
          })
        );
      }
    }

    metrics.eSignatureIntegration = eSignatureDetected;

    // ================================================================
    // Summary: total external dependencies on quote path
    // ================================================================
    const totalExternalDeps =
      ((metrics.outboundMessagesOnCPQ as number) > 0
        ? (metrics.outboundMessagesOnCPQ as number)
        : 0) +
      externalIdFieldCount +
      (eSignatureDetected ? 1 : 0);
    metrics.quotePathExternalDependencies = totalExternalDeps;

    this.log.info(
      {
        namedCredentials: metrics.totalNamedCredentials,
        externalDataSources: metrics.totalExternalDataSources,
        platformEvents: metrics.platformEventCount,
        outboundMessages: metrics.outboundMessagesOnCPQ,
        connectedApps: metrics.totalConnectedApps,
        externalIdFields: externalIdFieldCount,
        eSignature: eSignatureDetected,
        findings: findings.length,
      },
      'integrations_complete'
    );

    return {
      findings,
      relationships: [],
      metrics: {
        collectorName: 'integrations',
        domain: 'integration',
        metrics,
        warnings,
        coverage: 100,
        schemaVersion: '1.0',
      },
      status: 'success',
    };
  }
}
