/**
 * Work Logs Hooks
 *
 * React Query hooks for daily work log operations:
 * - Work log CRUD operations
 * - Status workflow (submit, approve, revert)
 * - Signature capture (contractor & inspector)
 * - Attachments
 * - Calendar and date range queries
 * - Summary & export
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// ============================================================================
// TYPES
// ============================================================================

export type WeatherType =
  | 'sunny'
  | 'cloudy'
  | 'rainy'
  | 'stormy'
  | 'snowy'
  | 'foggy'
  | 'windy'
  | 'hot'
  | 'cold';
export type WorkLogStatus = 'draft' | 'submitted' | 'approved';

// Enhanced resource entry (new structure)
export interface WorkLogResourceEntry {
  id?: string;
  type: string;
  contractorCount: number;
  supervisorCount: number;
}

// Legacy resource entry (backwards compatibility)
export interface ResourceEntry {
  trade: string;
  count: number;
  hours: number;
}

export interface EquipmentEntry {
  name: string;
  count: number;
  hours: number;
}

export interface WorkLogAttachment {
  id: string;
  name: string;
  type: string;
  url: string;
  uploadedAt: string;
}

export interface WorkLogAuditEntry {
  id: string;
  userName: string;
  company: string;
  role: string;
  action: string;
  timestamp: string;
}

export interface WorkLog {
  id: string;
  organizationId: string;
  projectId: string;
  logDate: string;
  logNumber: number | null;
  status: WorkLogStatus;
  weatherType: WeatherType | null;
  weatherTempCelsius: number | null;
  // Enhanced resources (new)
  contractorResources: WorkLogResourceEntry[];
  externalResources: WorkLogResourceEntry[];
  // Legacy resources
  resources: ResourceEntry[];
  equipment: EquipmentEntry[];
  // Dual descriptions
  contractorWorkDescription: string | null;
  supervisorWorkDescription: string | null;
  // Dual notes
  contractorNotes: string | null;
  supervisorNotes: string | null;
  // Legacy fields
  activities: string | null;
  issues: string | null;
  safetyNotes: string | null;
  // Additional fields
  trafficControllersInfo: string | null;
  exactAddress: string | null;
  attachments: WorkLogAttachment[];
  auditLog: WorkLogAuditEntry[];
  // Signatures
  contractorSignatureUrl: string | null;
  contractorSignedBy: string | null;
  contractorSignedAt: string | null;
  inspectorSignatureUrl: string | null;
  inspectorSignedBy: string | null;
  inspectorSignedAt: string | null;
  // Metadata
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkLogInput {
  projectId: string;
  logDate: string;
  weatherType?: WeatherType | null;
  weatherTempCelsius?: number | null;
  // Enhanced resources (new)
  contractorResources?: WorkLogResourceEntry[];
  externalResources?: WorkLogResourceEntry[];
  // Legacy resources
  resources?: ResourceEntry[];
  equipment?: EquipmentEntry[];
  // Dual descriptions
  contractorWorkDescription?: string | null;
  supervisorWorkDescription?: string | null;
  // Dual notes
  contractorNotes?: string | null;
  supervisorNotes?: string | null;
  // Legacy fields
  activities?: string | null;
  issues?: string | null;
  safetyNotes?: string | null;
  // Additional fields
  trafficControllersInfo?: string | null;
  exactAddress?: string | null;
}

export interface UpdateWorkLogInput {
  logDate?: string;
  status?: WorkLogStatus;
  weatherType?: WeatherType | null;
  weatherTempCelsius?: number | null;
  // Enhanced resources (new)
  contractorResources?: WorkLogResourceEntry[];
  externalResources?: WorkLogResourceEntry[];
  // Legacy resources
  resources?: ResourceEntry[];
  equipment?: EquipmentEntry[];
  // Dual descriptions
  contractorWorkDescription?: string | null;
  supervisorWorkDescription?: string | null;
  // Dual notes
  contractorNotes?: string | null;
  supervisorNotes?: string | null;
  // Legacy fields
  activities?: string | null;
  issues?: string | null;
  safetyNotes?: string | null;
  // Additional fields
  trafficControllersInfo?: string | null;
  exactAddress?: string | null;
  attachments?: WorkLogAttachment[];
}

export interface WorkLogSummary {
  totalLogs: number;
  signedByContractor: number;
  signedByInspector: number;
  totalWorkerHours: number;
  totalEquipmentHours: number;
  // Extended summary
  draftCount?: number;
  submittedCount?: number;
  approvedCount?: number;
  totalContractorResources?: number;
  totalExternalResources?: number;
}

export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const workLogKeys = {
  all: ['work-logs'] as const,
  project: (projectId: string) => [...workLogKeys.all, 'project', projectId] as const,
  list: (projectId: string, page: number, status?: WorkLogStatus) =>
    [...workLogKeys.project(projectId), 'list', page, status ?? 'all'] as const,
  detail: (id: string) => [...workLogKeys.all, 'detail', id] as const,
  byDate: (projectId: string, date: string) =>
    [...workLogKeys.project(projectId), 'date', date] as const,
  dateRange: (projectId: string, startDate: string, endDate: string) =>
    [...workLogKeys.project(projectId), 'range', startDate, endDate] as const,
  summary: (projectId: string) => [...workLogKeys.project(projectId), 'summary'] as const,
};

// ============================================================================
// WORK LOG QUERIES
// ============================================================================

/**
 * Get work logs for a project with pagination and optional status filter
 */
export function useWorkLogs(
  projectId: string | undefined,
  options?: { limit?: number; offset?: number; status?: WorkLogStatus }
) {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const status = options?.status;

  return useQuery({
    queryKey: workLogKeys.list(projectId || '', Math.floor(offset / limit), status),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      let url = `${apiUrl}/v1/work-logs/project/${projectId}?limit=${limit}&offset=${offset}`;
      if (status) {
        url += `&status=${status}`;
      }
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch work logs');
      }

      const result = await response.json();
      return {
        workLogs: result.data as WorkLog[],
        pagination: result.pagination as PaginationInfo,
      };
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

/**
 * Get a single work log by ID
 * Uses placeholderData from list cache for instant rendering
 */
export function useWorkLog(id: string | undefined) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: workLogKeys.detail(id || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/${id}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch work log');
      }

      const result = await response.json();
      return result.data as WorkLog;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
    placeholderData: () => {
      // Search all work log list caches for matching entry
      const queries = queryClient.getQueryCache().findAll({ queryKey: workLogKeys.all });
      for (const query of queries) {
        const data = query.state.data as { workLogs?: WorkLog[] } | undefined;
        const found = data?.workLogs?.find((wl) => wl.id === id);
        if (found) return found;
      }
      return undefined;
    },
  });
}

/**
 * Get work log for a specific date
 */
export function useWorkLogByDate(projectId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: workLogKeys.byDate(projectId || '', date || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/project/${projectId}/date/${date}`, {
        headers,
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch work log');
      }

      const result = await response.json();
      return result.data as WorkLog;
    },
    enabled: !!projectId && !!date,
    staleTime: 30 * 1000,
  });
}

/**
 * Get work logs for a date range (for calendar view)
 */
export function useWorkLogsByDateRange(
  projectId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined
) {
  return useQuery({
    queryKey: workLogKeys.dateRange(projectId || '', startDate || '', endDate || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${apiUrl}/v1/work-logs/project/${projectId}/date-range?startDate=${startDate}&endDate=${endDate}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch work logs');
      }

      const result = await response.json();
      return result.data as WorkLog[];
    },
    enabled: !!projectId && !!startDate && !!endDate,
    staleTime: 30 * 1000,
  });
}

/**
 * Get project work log summary
 */
export function useWorkLogSummary(projectId: string | undefined) {
  return useQuery({
    queryKey: workLogKeys.summary(projectId || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/project/${projectId}/summary`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch work log summary');
      }

      const result = await response.json();
      return result.data as WorkLogSummary;
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// WORK LOG MUTATIONS
// ============================================================================

/**
 * Create a new work log
 */
export function useCreateWorkLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWorkLogInput) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create work log');
      }

      const result = await response.json();
      return result.data as WorkLog;
    },
    onSuccess: (workLog) => {
      queryClient.invalidateQueries({ queryKey: workLogKeys.project(workLog.projectId) });
    },
  });
}

/**
 * Update a work log
 */
export function useUpdateWorkLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      projectId,
      data,
    }: {
      id: string;
      projectId: string;
      data: UpdateWorkLogInput;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update work log');
      }

      const result = await response.json();
      return { workLog: result.data as WorkLog, projectId };
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: workLogKeys.detail(id) });
      const previousDetail = queryClient.getQueryData(workLogKeys.detail(id));

      queryClient.setQueryData(workLogKeys.detail(id), (old: WorkLog | undefined) => {
        if (!old) return old;
        return { ...old, ...data, updatedAt: new Date().toISOString() };
      });

      return { previousDetail };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(workLogKeys.detail(id), context.previousDetail);
      }
    },
    onSettled: (result) => {
      if (result) {
        queryClient.invalidateQueries({ queryKey: workLogKeys.project(result.projectId) });
        queryClient.invalidateQueries({ queryKey: workLogKeys.detail(result.workLog.id) });
      }
    },
  });
}

/**
 * Delete a work log
 */
export function useDeleteWorkLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete work log');
      }

      return { id, projectId };
    },
    onMutate: async ({ id, projectId }) => {
      // Cancel and save list queries for rollback
      const listQueries = queryClient
        .getQueryCache()
        .findAll({ queryKey: workLogKeys.project(projectId) })
        .map((q) => q.queryKey);

      const previousData: Record<string, unknown> = {};
      for (const key of listQueries) {
        await queryClient.cancelQueries({ queryKey: key });
        previousData[JSON.stringify(key)] = queryClient.getQueryData(key);
        queryClient.setQueryData(
          key,
          (old: { workLogs: WorkLog[]; pagination: PaginationInfo } | undefined) => {
            if (!old?.workLogs) return old;
            return {
              ...old,
              workLogs: old.workLogs.filter((wl) => wl.id !== id),
              pagination: { ...old.pagination, total: old.pagination.total - 1 },
            };
          }
        );
      }

      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        for (const [key, data] of Object.entries(context.previousData)) {
          queryClient.setQueryData(JSON.parse(key), data);
        }
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: workLogKeys.project(variables.projectId) });
    },
  });
}

// ============================================================================
// STATUS WORKFLOW MUTATIONS
// ============================================================================

/**
 * Submit a work log (draft → submitted)
 */
export function useSubmitWorkLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/${id}/submit`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to submit work log');
      }

      const result = await response.json();
      return { workLog: result.data as WorkLog, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: workLogKeys.project(result.projectId) });
      queryClient.invalidateQueries({ queryKey: workLogKeys.detail(result.workLog.id) });
    },
  });
}

/**
 * Approve a work log (submitted → approved)
 */
export function useApproveWorkLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/${id}/approve`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to approve work log');
      }

      const result = await response.json();
      return { workLog: result.data as WorkLog, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: workLogKeys.project(result.projectId) });
      queryClient.invalidateQueries({ queryKey: workLogKeys.detail(result.workLog.id) });
    },
  });
}

/**
 * Revert a work log to draft
 */
export function useRevertWorkLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/${id}/revert`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to revert work log');
      }

      const result = await response.json();
      return { workLog: result.data as WorkLog, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: workLogKeys.project(result.projectId) });
      queryClient.invalidateQueries({ queryKey: workLogKeys.detail(result.workLog.id) });
    },
  });
}

// ============================================================================
// SIGNATURE MUTATIONS
// ============================================================================

/**
 * Sign work log as contractor
 */
export function useSignAsContractor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      projectId,
      signatureUrl,
    }: {
      id: string;
      projectId: string;
      signatureUrl: string;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/${id}/sign/contractor`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ signatureUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to sign work log');
      }

      const result = await response.json();
      return { workLog: result.data as WorkLog, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: workLogKeys.project(result.projectId) });
      queryClient.invalidateQueries({ queryKey: workLogKeys.detail(result.workLog.id) });
    },
  });
}

/**
 * Sign work log as inspector
 */
export function useSignAsInspector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      projectId,
      signatureUrl,
    }: {
      id: string;
      projectId: string;
      signatureUrl: string;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/${id}/sign/inspector`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ signatureUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to sign work log');
      }

      const result = await response.json();
      return { workLog: result.data as WorkLog, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: workLogKeys.project(result.projectId) });
      queryClient.invalidateQueries({ queryKey: workLogKeys.detail(result.workLog.id) });
    },
  });
}

// ============================================================================
// ATTACHMENT MUTATIONS
// ============================================================================

/**
 * Add an attachment to a work log
 */
export function useAddAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      projectId,
      attachment,
    }: {
      id: string;
      projectId: string;
      attachment: WorkLogAttachment;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/${id}/attachments`, {
        method: 'POST',
        headers,
        body: JSON.stringify(attachment),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to add attachment');
      }

      const result = await response.json();
      return { workLog: result.data as WorkLog, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: workLogKeys.project(result.projectId) });
      queryClient.invalidateQueries({ queryKey: workLogKeys.detail(result.workLog.id) });
    },
  });
}

/**
 * Remove an attachment from a work log
 */
export function useRemoveAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workLogId,
      projectId,
      attachmentId,
    }: {
      workLogId: string;
      projectId: string;
      attachmentId: string;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${apiUrl}/v1/work-logs/${workLogId}/attachments/${attachmentId}`,
        {
          method: 'DELETE',
          headers,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to remove attachment');
      }

      const result = await response.json();
      return { workLog: result.data as WorkLog, projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: workLogKeys.project(result.projectId) });
      queryClient.invalidateQueries({ queryKey: workLogKeys.detail(result.workLog.id) });
    },
  });
}

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Export a single work log to Excel
 */
export function useExportWorkLog() {
  return useMutation({
    mutationFn: async ({ workLogId, logDate }: { workLogId: string; logDate?: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/work-logs/${workLogId}/export`, { headers });

      if (!response.ok) {
        throw new Error('Failed to export work log');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = logDate ? `work-log-${logDate}.xlsx` : `work-log-${workLogId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return true;
    },
  });
}

/**
 * Export work logs for a date range to Excel
 */
export function useExportWorkLogRange() {
  return useMutation({
    mutationFn: async ({
      projectId,
      startDate,
      endDate,
    }: {
      projectId: string;
      startDate: string;
      endDate: string;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${apiUrl}/v1/work-logs/project/${projectId}/export?startDate=${startDate}&endDate=${endDate}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error('Failed to export work logs');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `work-logs-${startDate}-to-${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return true;
    },
  });
}
