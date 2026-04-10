/**
 * React Query hooks for assessment extraction runs.
 *
 * - useAssessmentRuns: list runs for a project
 * - useAssessmentStatus: latest run status with adaptive polling
 * - useStartAssessmentRun: trigger a new run
 * - useCancelAssessmentRun: cancel a running run
 * - useAssessmentFindings: paginated findings for a run
 *
 * See: Implementation Plan Task 13.3
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssessmentRunResponse {
  runId: string;
  status: string;
  projectId: string;
  connectionId: string;
  mode: string;
  progress: Record<string, unknown>;
  error: string | null;
  durationMs: number | null;
  apiCallsUsed: number | null;
  recordsExtracted: number | null;
  completenessPct: number | null;
  findingsCount: number | null;
  /** PH8.5: BB-3 IR graph node count. Null until BB-3 has stored a graph for this run. */
  irNodeCount?: number | null;
  createdAt: string;
  dispatchedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelRequestedAt: string | null;
}

export interface AssessmentFindingResponse {
  id: string;
  runId: string;
  domain: string;
  collectorName: string;
  artifactType: string;
  artifactName: string;
  artifactId: string | null;
  findingKey: string;
  sourceType: string;
  riskLevel: string | null;
  complexityLevel: string | null;
  migrationRelevance: string | null;
  rcaTargetConcept: string | null;
  rcaMappingComplexity: string | null;
  usageLevel: string | null;
  sourceRef: string | null;
  evidenceRefs: unknown[];
  notes: string | null;
  countValue: number | null;
  textValue: string | null;
  createdAt: string;
}

// Terminal statuses — stop polling when reached
const TERMINAL_STATUSES = new Set(['completed', 'completed_warnings', 'failed', 'cancelled']);

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const assessmentKeys = {
  all: ['assessment'] as const,
  runs: (projectId: string) => [...assessmentKeys.all, 'runs', projectId] as const,
  status: (projectId: string) => [...assessmentKeys.all, 'status', projectId] as const,
  findings: (runId: string, domain?: string) =>
    [...assessmentKeys.all, 'findings', runId, domain ?? 'all'] as const,
};

// ---------------------------------------------------------------------------
// Query: List runs for a project
// ---------------------------------------------------------------------------

export function useAssessmentRuns(projectId: string | undefined) {
  return useQuery({
    queryKey: assessmentKeys.runs(projectId || ''),
    queryFn: async (): Promise<AssessmentRunResponse[]> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/assessment/runs`, {
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error(`Failed to fetch assessment runs: ${response.status}`);
      }

      const json = await response.json();
      return json.data ?? [];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Query: Latest run status with adaptive polling
// ---------------------------------------------------------------------------

export function useAssessmentStatus(projectId: string | undefined) {
  return useQuery({
    queryKey: assessmentKeys.status(projectId || ''),
    queryFn: async (): Promise<AssessmentRunResponse | null> => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/assessment/status`, {
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to fetch assessment status: ${response.status}`);
      }

      const json = await response.json();
      return json.data ?? null;
    },
    enabled: !!projectId,
    // Adaptive polling: 5s while active, stop when terminal
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      if (TERMINAL_STATUSES.has(data.status)) return false;
      return 5_000;
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: Trigger a new assessment run
// ---------------------------------------------------------------------------

export function useStartAssessmentRun(projectId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/assessment/run`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'full' }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        const message = json?.error?.message || `Failed to start assessment: ${response.status}`;
        throw new Error(message);
      }

      const json = await response.json();
      return json.data as AssessmentRunResponse;
    },
    onSuccess: () => {
      // Invalidate both runs list and status to trigger refetch
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: assessmentKeys.runs(projectId) });
        queryClient.invalidateQueries({ queryKey: assessmentKeys.status(projectId) });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: Cancel an assessment run
// ---------------------------------------------------------------------------

export function useCancelAssessmentRun(projectId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (runId: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${apiUrl}/v1/projects/${projectId}/assessment/runs/${runId}/cancel`,
        {
          method: 'POST',
          headers,
        }
      );

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        const message = json?.error?.message || `Failed to cancel assessment: ${response.status}`;
        throw new Error(message);
      }

      const json = await response.json();
      return json.data as AssessmentRunResponse;
    },
    onSuccess: () => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: assessmentKeys.runs(projectId) });
        queryClient.invalidateQueries({ queryKey: assessmentKeys.status(projectId) });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Query: Findings for a run (with optional domain filter)
// ---------------------------------------------------------------------------

export function useAssessmentFindings(
  projectId: string | undefined,
  runId: string | undefined,
  domain?: string
) {
  return useQuery({
    queryKey: assessmentKeys.findings(runId || '', domain),
    queryFn: async (): Promise<{
      data: AssessmentFindingResponse[];
      pagination: { total: number; limit: number; offset: number; hasMore: boolean };
    }> => {
      const params = new URLSearchParams({ limit: '2000' });
      if (domain) params.set('domain', domain);

      const headers = await getAuthHeaders();
      const response = await fetch(
        `${apiUrl}/v1/projects/${projectId}/assessment/runs/${runId}/findings?${params}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch findings: ${response.status}`);
      }

      const json = await response.json();
      return {
        data: json.data ?? [],
        pagination: json.pagination ?? { total: 0, limit: 2000, offset: 0, hasMore: false },
      };
    },
    enabled: !!projectId && !!runId,
    staleTime: 60_000, // Findings don't change after extraction
  });
}

// ---------------------------------------------------------------------------
// Mutation: Generate assessment report and trigger download
// ---------------------------------------------------------------------------

export function useGenerateReport(projectId: string | undefined) {
  return useMutation({
    mutationFn: async (runId: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${apiUrl}/v1/projects/${projectId}/assessment/runs/${runId}/report`,
        {
          method: 'POST',
          headers,
        }
      );

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        const message = json?.error?.message || `Failed to generate report: ${response.status}`;
        throw new Error(message);
      }

      const json = await response.json();
      const reportHtml = json.data?.reportHtml;

      if (reportHtml) {
        // Trigger download of the HTML report
        const blob = new Blob([reportHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cpq-assessment-${runId.slice(0, 8)}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Also open in new tab for print-to-PDF
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(reportHtml);
          printWindow.document.close();
        }
      }

      return json.data;
    },
  });
}
