/**
 * Segmenter error types — typed, structured errors for input
 * validation and invariant enforcement.
 *
 * Task: SEG-1.1.
 */

export class DanglingEdgeError extends Error {
  constructor(
    public readonly edges: Array<{
      sourceId: string;
      targetId: string;
      edgeType: string;
      endpoint: 'source' | 'target';
    }>
  ) {
    const first10 = edges.slice(0, 10);
    const summary = first10
      .map((e) => `${e.edgeType} ${e.sourceId}→${e.targetId} (${e.endpoint} missing)`)
      .join('; ');
    super(
      `DanglingEdgeError: ${edges.length} edge(s) reference missing nodes. First 10: ${summary}`
    );
    this.name = 'DanglingEdgeError';
  }
}

export class DuplicateNodeIdError extends Error {
  constructor(public readonly duplicateIds: string[]) {
    super(
      `DuplicateNodeIdError: ${duplicateIds.length} duplicate node IDs: ${duplicateIds.slice(0, 5).join(', ')}`
    );
    this.name = 'DuplicateNodeIdError';
  }
}

export class UnclassifiedEdgeTypeError extends Error {
  constructor(public readonly edgeType: string) {
    super(
      `UnclassifiedEdgeTypeError: edge type '${edgeType}' is not in STRONG ∪ ORDERING ∪ HAZARD`
    );
    this.name = 'UnclassifiedEdgeTypeError';
  }
}

export class IncompatibleSchemaError extends Error {
  constructor(
    public readonly actual: string,
    public readonly supported: string
  ) {
    super(
      `IncompatibleSchemaError: graph irSchemaVersion '${actual}' is not compatible with segmenter (supports '${supported}')`
    );
    this.name = 'IncompatibleSchemaError';
  }
}

export class InvalidOptionsError extends Error {
  constructor(public readonly details: string) {
    super(`InvalidOptionsError: ${details}`);
    this.name = 'InvalidOptionsError';
  }
}

export class SegmenterInvariantError extends Error {
  constructor(
    public readonly invariantId: string,
    message: string
  ) {
    super(`SegmenterInvariantError [${invariantId}]: ${message}`);
    this.name = 'SegmenterInvariantError';
  }
}
