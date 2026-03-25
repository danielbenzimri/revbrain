/**
 * Salesforce Metadata API SOAP client.
 *
 * SOAP-based retrieve for:
 * - Approval process steps and entry criteria
 * - Flow XML with element details
 * - Page layout metadata
 * - Remote site settings
 *
 * See: Implementation Plan Task 2.5
 */

import type { SalesforceAuth } from './auth.ts';
import { logger } from '../lib/logger.ts';

/**
 * Build a SOAP retrieve request envelope.
 */
function buildRetrieveEnvelope(sessionId: string, packageXml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>${sessionId}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:retrieve>
      <met:retrieveRequest>
        <met:unpackaged>${packageXml}</met:unpackaged>
      </met:retrieveRequest>
    </met:retrieve>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Build a SOAP checkRetrieveStatus request.
 */
function buildCheckStatusEnvelope(sessionId: string, asyncResultId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>${sessionId}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:checkRetrieveStatus>
      <met:asyncProcessId>${asyncResultId}</met:asyncProcessId>
      <met:includeZip>true</met:includeZip>
    </met:checkRetrieveStatus>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Build package.xml content for metadata retrieve.
 */
export function buildPackageXml(
  members: Array<{ types: string; names: string[] }>,
  apiVersion: string = '62.0'
): string {
  const typesXml = members
    .map(
      ({ types, names }) =>
        `    <types>
${names.map((n) => `      <members>${n}</members>`).join('\n')}
      <name>${types}</name>
    </types>`
    )
    .join('\n');

  return `<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${typesXml}
    <version>${apiVersion}</version>
  </Package>`;
}

export class SalesforceMetadataApi {
  constructor(
    private auth: SalesforceAuth,
    private apiVersion: string = '62.0'
  ) {}

  /**
   * Retrieve metadata via SOAP API.
   * Returns the raw zip content as a base64 string.
   *
   * For v1, we parse specific metadata types (ApprovalProcess, Flow)
   * using fast-xml-parser after extracting from the zip.
   */
  async retrieve(
    members: Array<{ types: string; names: string[] }>,
    signal?: AbortSignal
  ): Promise<string | null> {
    const { accessToken, instanceUrl } = await this.auth.getAccessToken();
    const metadataUrl = `${instanceUrl}/services/Soap/m/${this.apiVersion}`;

    const packageXml = buildPackageXml(members, this.apiVersion);
    const envelope = buildRetrieveEnvelope(accessToken, packageXml);

    // Submit retrieve request
    const response = await fetch(metadataUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        SOAPAction: '""',
      },
      body: envelope,
      signal,
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body: body.slice(0, 500) }, 'soap_retrieve_failed');
      return null;
    }

    const responseXml = await response.text();

    // Extract asyncResultId from response
    const idMatch = responseXml.match(/<id>([^<]+)<\/id>/);
    if (!idMatch) {
      logger.error('soap_no_async_id');
      return null;
    }

    const asyncResultId = idMatch[1];

    // Poll for completion
    return this.pollRetrieveStatus(accessToken, metadataUrl, asyncResultId, signal);
  }

  private async pollRetrieveStatus(
    sessionId: string,
    metadataUrl: string,
    asyncResultId: string,
    signal?: AbortSignal
  ): Promise<string | null> {
    const maxWaitMs = 60_000; // 1 minute for metadata retrieves
    const startTime = Date.now();
    let pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      if (signal?.aborted) throw new Error('Metadata retrieve aborted');

      await new Promise((r) => setTimeout(r, pollInterval));
      pollInterval = Math.min(pollInterval * 1.5, 10_000);

      const envelope = buildCheckStatusEnvelope(sessionId, asyncResultId);
      const response = await fetch(metadataUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: '""',
        },
        body: envelope,
        signal,
      });

      const xml = await response.text();

      // Check if done
      if (xml.includes('<done>true</done>')) {
        // Extract zipFile content (base64)
        const zipMatch = xml.match(/<zipFile>([^<]+)<\/zipFile>/);
        if (zipMatch) {
          return zipMatch[1]; // base64 encoded zip
        }
        logger.warn('soap_retrieve_done_but_no_zip');
        return null;
      }
    }

    logger.warn({ asyncResultId }, 'soap_retrieve_timeout');
    return null;
  }
}
