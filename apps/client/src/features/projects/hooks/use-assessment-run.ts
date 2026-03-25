/**
 * React Query hooks for assessment extraction runs.
 *
 * - useAssessmentRuns: list runs for a project
 * - useAssessmentRunStatus: poll status (5s → 15s adaptive)
 * - useStartAssessmentRun: trigger a new run
 * - useCancelAssessmentRun: cancel a running run
 *
 * See: Implementation Plan Task 11.1
 */

// TODO: Implement when assessment API routes are wired (Task 9.1)
// Hooks will follow the same pattern as use-salesforce-connection.ts:
// - useQuery for reads with polling
// - useMutation for trigger/cancel
// - Optimistic updates for cancel
// - Error handling with toast notifications
// - Translations (en + he)

export function useAssessmentRuns(_projectId: string) {
  // TODO: useQuery to GET /:projectId/assessment/runs
  return { data: [], isLoading: false, error: null };
}

export function useAssessmentRunStatus(_runId: string | null) {
  // TODO: useQuery with refetchInterval: adaptive (5s → 15s after 5min)
  // Stop polling on terminal status
  return { data: null, isLoading: false, error: null };
}

export function useStartAssessmentRun(_projectId: string) {
  // TODO: useMutation to POST /:projectId/assessment/run
  // With Idempotency-Key header
  return { mutate: () => {}, isPending: false, error: null };
}

export function useCancelAssessmentRun(_runId: string) {
  // TODO: useMutation to POST /:projectId/assessment/runs/:runId/cancel
  // Optimistic update for UI responsiveness
  return { mutate: () => {}, isPending: false, error: null };
}
