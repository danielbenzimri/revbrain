/**
 * SegmenterOptions Zod validation — reject invalid config before
 * any graph processing. Spec §3.2, Task SEG-1.1.
 */

import { z } from 'zod';
import type { SegmenterOptions } from '@revbrain/migration-ir-contract';
import { InvalidOptionsError } from './errors.ts';

const positiveInt = z.number().int().positive();
const positiveNumber = z.number().positive();
const nonNegativeNumber = z.number().min(0);

const SegmenterOptionsSchema = z
  .object({
    thresholds: z
      .object({
        largeSegment: positiveInt.optional(),
        heavyWave: positiveNumber.optional(),
        maxArticulationHints: positiveInt.optional(),
      })
      .optional(),
    weights: z.record(z.string(), positiveNumber).optional(),
    authorityScores: z.record(z.string(), nonNegativeNumber).optional(),
    enableHeuristics: z.boolean().optional(),
  })
  .strict()
  .optional();

/**
 * Validate and normalize SegmenterOptions. Returns a clean copy
 * with defaults applied. Throws InvalidOptionsError on bad input.
 */
export function validateOptions(raw?: SegmenterOptions): SegmenterOptions {
  const result = SegmenterOptionsSchema.safeParse(raw ?? {});
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new InvalidOptionsError(issues);
  }
  return (result.data ?? {}) as SegmenterOptions;
}
