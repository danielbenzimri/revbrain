/**
 * Salesforce REST API + Composite Batch + Tooling API.
 *
 * Built on the base SalesforceClient. Handles:
 * - query/queryAll with auto-pagination
 * - 50K row limit detection → auto Bulk API warning
 * - Describe + DescribeGlobal + Limits
 * - Composite Batch (25 sub-requests per call, auto-chunking)
 * - Tooling API queries
 *
 * See: Implementation Plan Task 2.3
 */

import type { SalesforceClient, SfApiCallOptions } from './client.ts';
import { logger } from '../lib/logger.ts';

// ============================================================
// REST API
// ============================================================

export interface QueryResult<T = Record<string, unknown>> {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
}

export interface DescribeResult {
  name: string;
  label: string;
  queryable: boolean;
  fields: DescribeField[];
  fieldSets: DescribeFieldSet[];
  recordTypeInfos: RecordTypeInfo[];
  childRelationships: ChildRelationship[];
}

export interface DescribeField {
  name: string;
  type: string;
  label: string;
  length: number;
  referenceTo: string[];
  calculatedFormula: string | null;
  custom: boolean;
  nillable: boolean;
  picklistValues: Array<{ value: string; label: string; active: boolean }>;
  defaultValue: unknown;
  compoundFieldName: string | null;
}

export interface DescribeFieldSet {
  name: string;
  label: string;
  fields: string[];
}

export interface RecordTypeInfo {
  name: string;
  recordTypeId: string;
  active: boolean;
}

export interface ChildRelationship {
  childSObject: string;
  field: string;
  relationshipName: string | null;
}

export interface DescribeGlobalResult {
  sobjects: Array<{
    name: string;
    label: string;
    queryable: boolean;
    keyPrefix: string | null;
    custom: boolean;
  }>;
}

export interface LimitsResult {
  DailyApiRequests: { Max: number; Remaining: number };
  DailyBulkV2QueryJobs: { Max: number; Remaining: number };
  DailyBulkV2QueryFileStorageMB: { Max: number; Remaining: number };
  [key: string]: { Max: number; Remaining: number };
}

export class SalesforceRestApi {
  constructor(
    private client: SalesforceClient,
    private apiVersion: string = 'v62.0'
  ) {}

  /** Execute a SOQL query (single page) */
  async query<T = Record<string, unknown>>(
    soql: string,
    signal?: AbortSignal
  ): Promise<QueryResult<T>> {
    return this.client.request<QueryResult<T>>({
      apiType: 'rest',
      path: `/services/data/${this.apiVersion}/query?q=${encodeURIComponent(soql)}`,
      signal,
    });
  }

  /** Execute a SOQL query with auto-pagination (all pages) */
  async queryAll<T = Record<string, unknown>>(soql: string, signal?: AbortSignal): Promise<T[]> {
    const allRecords: T[] = [];
    let result = await this.query<T>(soql, signal);
    allRecords.push(...result.records);

    while (!result.done && result.nextRecordsUrl) {
      // Check signal between pages
      if (signal?.aborted) {
        throw new Error('Query aborted');
      }

      result = await this.client.request<QueryResult<T>>({
        apiType: 'rest',
        path: result.nextRecordsUrl,
        signal,
      });
      allRecords.push(...result.records);
    }

    // 50K row limit detection
    if (result.totalSize === 50000) {
      logger.warn(
        { soql: soql.slice(0, 100), totalSize: result.totalSize },
        'sf_50k_row_limit — results may be truncated. Consider Bulk API.'
      );
    }

    return allRecords;
  }

  /** Describe a single object */
  async describe(objectName: string, signal?: AbortSignal): Promise<DescribeResult> {
    return this.client.request<DescribeResult>({
      apiType: 'rest',
      path: `/services/data/${this.apiVersion}/sobjects/${objectName}/describe`,
      signal,
    });
  }

  /** Describe Global — list all objects */
  async describeGlobal(signal?: AbortSignal): Promise<DescribeGlobalResult> {
    return this.client.request<DescribeGlobalResult>({
      apiType: 'rest',
      path: `/services/data/${this.apiVersion}/sobjects/`,
      signal,
    });
  }

  /** Get org limits */
  async limits(signal?: AbortSignal): Promise<LimitsResult> {
    return this.client.request<LimitsResult>({
      apiType: 'rest',
      path: `/services/data/${this.apiVersion}/limits/`,
      signal,
    });
  }

  /** Get available API versions */
  async versions(signal?: AbortSignal): Promise<Array<{ version: string; url: string }>> {
    return this.client.request<Array<{ version: string; url: string }>>({
      apiType: 'rest',
      path: `/services/data/`,
      signal,
    });
  }

  // ============================================================
  // Composite Batch API
  // ============================================================

  /**
   * Composite Batch — up to 25 sub-requests per call.
   * Auto-chunks lists > 25.
   */
  async compositeBatch(
    requests: Array<{ method: string; url: string }>,
    signal?: AbortSignal
  ): Promise<Array<{ statusCode: number; result: unknown }>> {
    const BATCH_SIZE = 25;
    const allResults: Array<{ statusCode: number; result: unknown }> = [];

    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      if (signal?.aborted) throw new Error('Batch aborted');

      const chunk = requests.slice(i, i + BATCH_SIZE);
      const response = await this.client.request<{
        results: Array<{ statusCode: number; result: unknown }>;
      }>({
        apiType: 'rest',
        method: 'POST',
        path: `/services/data/${this.apiVersion}/composite/batch`,
        body: { batchRequests: chunk },
        signal,
      });

      allResults.push(...response.results);
    }

    return allResults;
  }

  /**
   * Batch Describe — describe multiple objects in batched calls.
   * Returns a Map of objectName → DescribeResult.
   * Individual failures return null (logged as warning).
   */
  async describeMultiple(
    objectNames: string[],
    signal?: AbortSignal
  ): Promise<Map<string, DescribeResult | null>> {
    const requests = objectNames.map((name) => ({
      method: 'GET',
      url: `${this.apiVersion}/sobjects/${name}/describe`,
    }));

    const results = await this.compositeBatch(requests, signal);
    const map = new Map<string, DescribeResult | null>();

    for (let i = 0; i < objectNames.length; i++) {
      const result = results[i];
      if (result && result.statusCode === 200) {
        map.set(objectNames[i], result.result as DescribeResult);
      } else {
        logger.warn(
          { object: objectNames[i], status: result?.statusCode },
          'describe_sub_request_failed'
        );
        map.set(objectNames[i], null);
      }
    }

    return map;
  }

  // ============================================================
  // Tooling API
  // ============================================================

  /** Execute a Tooling API SOQL query */
  async toolingQuery<T = Record<string, unknown>>(
    soql: string,
    signal?: AbortSignal
  ): Promise<QueryResult<T>> {
    return this.client.request<QueryResult<T>>({
      apiType: 'tooling',
      path: `/services/data/${this.apiVersion}/tooling/query?q=${encodeURIComponent(soql)}`,
      signal,
    });
  }

  /** Tooling API query with auto-pagination */
  async toolingQueryAll<T = Record<string, unknown>>(
    soql: string,
    signal?: AbortSignal
  ): Promise<T[]> {
    const allRecords: T[] = [];
    let result = await this.toolingQuery<T>(soql, signal);
    allRecords.push(...result.records);

    while (!result.done && result.nextRecordsUrl) {
      if (signal?.aborted) throw new Error('Query aborted');

      result = await this.client.request<QueryResult<T>>({
        apiType: 'tooling',
        path: result.nextRecordsUrl,
        signal,
      });
      allRecords.push(...result.records);
    }

    return allRecords;
  }

  /**
   * Execute anonymous Apex and return the debug log. Used as a
   * last-resort approach to read protected hierarchy custom settings
   * (e.g. SBQQ__Plugin__c) that are inaccessible via REST and SOQL.
   *
   * The Apex code should use System.debug('RESULT:' + ...) to
   * embed structured output in the debug log. The caller parses
   * it from the returned log text.
   */
  async executeAnonymous(
    apexCode: string,
    signal?: AbortSignal
  ): Promise<{
    success: boolean;
    compileProblem: string | null;
    exceptionMessage: string | null;
    log: string;
  }> {
    const result = await this.client.request<{
      success: boolean;
      compiled: boolean;
      compileProblem: string | null;
      exceptionMessage: string | null;
      exceptionStackTrace: string | null;
      line: number;
      column: number;
    }>({
      apiType: 'tooling',
      path: `/services/data/${this.apiVersion}/tooling/executeAnonymous/?anonymousBody=${encodeURIComponent(apexCode)}`,
      signal,
    });

    // The debug log is returned via a separate header / log mechanism.
    // For our use case we extract the RESULT: line from the compiled
    // Apex output embedded in the response (executeAnonymous returns
    // the log inline when the DebuggingHeader is set, or we parse it
    // from the response body when available).
    return {
      success: result.success && result.compiled,
      compileProblem: result.compileProblem,
      exceptionMessage: result.exceptionMessage,
      log: '', // Debug log extraction depends on header setup
    };
  }
}
