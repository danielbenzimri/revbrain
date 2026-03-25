/**
 * Dynamic SOQL query builder from Describe results.
 *
 * Never hardcodes field lists. Builds queries from:
 * 1. Wishlist of desired fields
 * 2. Describe result (what actually exists + is accessible)
 * 3. Dynamic filtering for FLS, compound fields, query length
 *
 * See: Extraction Spec Section 18, Implementation Plan Task 2.6
 */

import type { DescribeField, DescribeResult } from './rest.ts';
import { logger } from '../lib/logger.ts';

interface SafeQueryResult {
  query: string;
  skippedFields: string[];
  includedFields: string[];
}

/**
 * Build a safe SOQL query by filtering wishlist against Describe.
 */
export function buildSafeQuery(
  objectName: string,
  wishlistFields: string[],
  describeResult: DescribeResult,
  options?: {
    whereClause?: string;
    orderBy?: string;
  }
): SafeQueryResult {
  const accessibleFieldNames = new Set(describeResult.fields.map((f) => f.name));
  const compoundFieldNames = new Set(
    describeResult.fields.filter((f) => f.compoundFieldName).map((f) => f.compoundFieldName!)
  );

  const safeFields: string[] = [];
  const skippedFields: string[] = [];

  for (const field of wishlistFields) {
    // Skip compound parent fields (Address, Geolocation) — use component fields instead
    if (compoundFieldNames.has(field)) {
      const components = describeResult.fields
        .filter((f) => f.compoundFieldName === field)
        .map((f) => f.name);
      safeFields.push(...components);
      continue;
    }

    if (accessibleFieldNames.has(field)) {
      safeFields.push(field);
    } else {
      skippedFields.push(field);
    }
  }

  // Deduplicate (compound expansion might add duplicates)
  const uniqueFields = [...new Set(safeFields)];

  if (skippedFields.length > 0) {
    logger.warn(
      { object: objectName, skippedFields, count: skippedFields.length },
      'query_fields_skipped'
    );
  }

  // Validate field names (alphanumeric + underscores only)
  for (const field of uniqueFields) {
    if (!/^[A-Za-z0-9_]+$/.test(field)) {
      throw new Error(`Invalid field name: ${field}`);
    }
  }

  let query = `SELECT ${uniqueFields.join(', ')} FROM ${objectName}`;
  if (options?.whereClause) query += ` WHERE ${options.whereClause}`;
  if (options?.orderBy) query += ` ORDER BY ${options.orderBy}`;

  // Query length check
  if (query.length > 90_000) {
    logger.warn({ object: objectName, length: query.length }, 'query_approaching_100k_limit');
  }

  return {
    query,
    skippedFields,
    includedFields: uniqueFields,
  };
}

/**
 * Split a query into core + extended if too many formula fields.
 * Returns two queries that can be joined by ID in the app layer.
 */
export function splitQuery(
  objectName: string,
  fields: string[],
  describeResult: DescribeResult,
  options?: { whereClause?: string; orderBy?: string }
): { core: SafeQueryResult; extended?: SafeQueryResult } {
  // Separate formula fields from non-formula
  const formulaFields = new Set(
    describeResult.fields.filter((f) => f.calculatedFormula).map((f) => f.name)
  );

  const coreFields = ['Id', ...fields.filter((f) => !formulaFields.has(f) && f !== 'Id')];
  const extFields = ['Id', ...fields.filter((f) => formulaFields.has(f))];

  const core = buildSafeQuery(objectName, coreFields, describeResult, options);

  if (extFields.length > 1) {
    // More than just Id
    const extended = buildSafeQuery(objectName, extFields, describeResult, options);
    return { core, extended };
  }

  return { core };
}

/**
 * Get all SBQQ__ fields from a Describe result.
 * Useful for objects where we want "all CPQ fields" dynamically.
 */
export function getAllSbqqFields(describeResult: DescribeResult): string[] {
  return describeResult.fields.filter((f) => f.name.startsWith('SBQQ__')).map((f) => f.name);
}

/**
 * Get all custom (non-managed-package) fields.
 */
export function getCustomFields(describeResult: DescribeResult): DescribeField[] {
  return describeResult.fields.filter(
    (f) => f.custom && !f.name.startsWith('SBQQ__') && !f.name.startsWith('sbaa__')
  );
}
