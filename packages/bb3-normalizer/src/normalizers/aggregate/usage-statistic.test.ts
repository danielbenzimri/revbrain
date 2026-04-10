import { normalizeUsageStatistic } from './usage-statistic.ts';
import type { AssessmentFindingInput } from '@revbrain/contract';
import { runBaselineSuite } from '../__test-helpers__/baseline.ts';

function validUS(over: Partial<AssessmentFindingInput> = {}): AssessmentFindingInput {
  return {
    domain: 'usage',
    collectorName: 'usage',
    artifactType: 'UsageStatistic',
    artifactName: 'quotes-90d',
    findingKey: 'us-1',
    sourceType: 'bulk-usage',
    detected: true,
    countValue: 1200,
    evidenceRefs: [],
    schemaVersion: '1.0',
    ...over,
  };
}

runBaselineSuite({
  fn: normalizeUsageStatistic,
  taskId: 'PH6.13',
  nodeType: 'UsageStatistic',
  validFinding: validUS,
  malformedFinding: null,
  renameMutation: (f) => ({ ...f, artifactId: 'a0V3x00000newid' }),
  contentChangeMutation: (f) => ({ ...f, countValue: (f.countValue ?? 0) + 100 }),
});
