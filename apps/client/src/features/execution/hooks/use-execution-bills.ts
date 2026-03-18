/**
 * Execution Bills Hooks
 *
 * React Query hooks for contractor execution bill operations:
 * - Bill CRUD operations
 * - Workflow transitions (submit, review, approve, reject, reopen)
 * - Bill items from BOQ
 * - Measurements tracking
 * - Summary & export
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// ============================================================================
// TYPES
// ============================================================================

export type BillStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

export interface Bill {
  id: string;
  organizationId: string;
  projectId: string;
  billNumber: number;
  status: BillStatus;
  periodStart: string | null;
  periodEnd: string | null;
  remarks: string | null;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  contractorSignatureUrl: string | null;
  inspectorSignatureUrl: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface BillItem {
  id: string;
  billId: string;
  boqItemId: string;
  boqCode: string;
  description: string;
  unit: string | null;
  unitPriceCents: number;
  previousQuantity: number;
  currentQuantity: number;
  cumulativeQuantity: number;
  discountPercent: number;
  remarks: string | null;
  isException: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  measurements?: Measurement[];
}

export interface BillWithItems extends Bill {
  items: BillItem[];
}

export interface Measurement {
  id: string;
  billItemId: string;
  location: string | null;
  quantity: number;
  remarks: string | null;
  createdAt: string;
  createdBy: string;
}

export interface CreateBillInput {
  projectId: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  remarks?: string | null;
}

export interface UpdateBillInput {
  periodStart?: string | null;
  periodEnd?: string | null;
  remarks?: string | null;
}

export interface UpdateBillItemInput {
  currentQuantity?: number;
  discountPercent?: number;
  remarks?: string | null;
  isException?: boolean;
}

export interface AddMeasurementInput {
  location?: string | null;
  quantity: number;
  remarks?: string | null;
}

export interface BillSummary {
  totalBills: number;
  draftCount: number;
  submittedCount: number;
  underReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalValueCents: number;
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

export const billKeys = {
  all: ['execution-bills'] as const,
  project: (projectId: string) => [...billKeys.all, 'project', projectId] as const,
  list: (projectId: string, page: number) =>
    [...billKeys.project(projectId), 'list', page] as const,
  detail: (id: string) => [...billKeys.all, 'detail', id] as const,
  summary: (projectId: string) => [...billKeys.project(projectId), 'summary'] as const,
  measurements: (itemId: string) => [...billKeys.all, 'measurements', itemId] as const,
};

// ============================================================================
// BILL QUERIES
// ============================================================================

/**
 * Get bills for a project with pagination
 */
export function useBills(
  projectId: string | undefined,
  options?: { limit?: number; offset?: number }
) {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  return useQuery({
    queryKey: billKeys.list(projectId || '', Math.floor(offset / limit)),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${apiUrl}/v1/execution/bills/project/${projectId}?limit=${limit}&offset=${offset}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch bills');
      }

      const result = await response.json();
      return {
        bills: result.data as Bill[],
        pagination: result.pagination as PaginationInfo,
      };
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

/**
 * Get a single bill with items
 * Uses placeholderData from list cache for instant rendering
 */
export function useBill(id: string | undefined) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: billKeys.detail(id || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/${id}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch bill');
      }

      const result = await response.json();
      return result.data as BillWithItems;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
    placeholderData: () => {
      // Search all bill list caches for matching bill
      const queries = queryClient.getQueryCache().findAll({ queryKey: billKeys.all });
      for (const query of queries) {
        const data = query.state.data as { bills?: Bill[] } | undefined;
        const found = data?.bills?.find((b) => b.id === id);
        if (found) return { ...found, items: [] } as BillWithItems;
      }
      return undefined;
    },
  });
}

/**
 * Get project bill summary
 */
export function useBillSummary(projectId: string | undefined) {
  return useQuery({
    queryKey: billKeys.summary(projectId || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/project/${projectId}/summary`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch bill summary');
      }

      const result = await response.json();
      return result.data as BillSummary;
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

/**
 * Get measurements for a bill item
 */
export function useMeasurements(itemId: string | undefined) {
  return useQuery({
    queryKey: billKeys.measurements(itemId || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/items/${itemId}/measurements`, {
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch measurements');
      }

      const result = await response.json();
      return result.data as Measurement[];
    },
    enabled: !!itemId,
  });
}

// ============================================================================
// BILL MUTATIONS
// ============================================================================

/**
 * Create a new bill
 */
export function useCreateBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBillInput) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create bill');
      }

      const result = await response.json();
      return result.data as Bill;
    },
    onSuccess: (bill) => {
      queryClient.invalidateQueries({ queryKey: billKeys.project(bill.projectId) });
    },
  });
}

/**
 * Update a bill (draft only)
 */
export function useUpdateBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateBillInput }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update bill');
      }

      const result = await response.json();
      return result.data as Bill;
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: billKeys.detail(id) });
      const previous = queryClient.getQueryData(billKeys.detail(id));

      queryClient.setQueryData(billKeys.detail(id), (old: BillWithItems | undefined) => {
        if (!old) return old;
        return { ...old, ...data, updatedAt: new Date().toISOString() };
      });

      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(billKeys.detail(id), context.previous);
      }
    },
    onSettled: (bill) => {
      if (bill) {
        queryClient.invalidateQueries({ queryKey: billKeys.project(bill.projectId) });
        queryClient.invalidateQueries({ queryKey: billKeys.detail(bill.id) });
      }
    },
  });
}

/**
 * Delete a bill (draft only)
 */
export function useDeleteBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete bill');
      }

      return { id, projectId };
    },
    onMutate: async ({ id, projectId }) => {
      // Optimistically remove from all list pages
      const queryKeys = queryClient
        .getQueryCache()
        .findAll({ queryKey: billKeys.project(projectId) })
        .map((q) => q.queryKey);

      const previousData: Record<string, unknown> = {};
      for (const key of queryKeys) {
        previousData[JSON.stringify(key)] = queryClient.getQueryData(key);
        queryClient.setQueryData(
          key,
          (old: { bills: Bill[]; pagination: PaginationInfo } | undefined) => {
            if (!old?.bills) return old;
            return {
              ...old,
              bills: old.bills.filter((b) => b.id !== id),
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
      queryClient.invalidateQueries({ queryKey: billKeys.project(variables.projectId) });
    },
  });
}

// ============================================================================
// WORKFLOW MUTATIONS
// ============================================================================

/**
 * Submit a bill for review
 */
export function useSubmitBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      contractorSignatureUrl,
    }: {
      id: string;
      contractorSignatureUrl?: string;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/${id}/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ contractorSignatureUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to submit bill');
      }

      const result = await response.json();
      return result.data as Bill;
    },
    onSuccess: (bill) => {
      queryClient.invalidateQueries({ queryKey: billKeys.project(bill.projectId) });
      queryClient.invalidateQueries({ queryKey: billKeys.detail(bill.id) });
    },
  });
}

/**
 * Start review of a submitted bill
 */
export function useStartReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/${id}/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to start review');
      }

      const result = await response.json();
      return result.data as Bill;
    },
    onSuccess: (bill) => {
      queryClient.invalidateQueries({ queryKey: billKeys.project(bill.projectId) });
      queryClient.invalidateQueries({ queryKey: billKeys.detail(bill.id) });
    },
  });
}

/**
 * Approve a bill
 */
export function useApproveBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      inspectorSignatureUrl,
    }: {
      id: string;
      inspectorSignatureUrl?: string;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/${id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ inspectorSignatureUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to approve bill');
      }

      const result = await response.json();
      return result.data as Bill;
    },
    onSuccess: (bill) => {
      queryClient.invalidateQueries({ queryKey: billKeys.project(bill.projectId) });
      queryClient.invalidateQueries({ queryKey: billKeys.detail(bill.id) });
    },
  });
}

/**
 * Reject a bill
 */
export function useRejectBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/${id}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to reject bill');
      }

      const result = await response.json();
      return result.data as Bill;
    },
    onSuccess: (bill) => {
      queryClient.invalidateQueries({ queryKey: billKeys.project(bill.projectId) });
      queryClient.invalidateQueries({ queryKey: billKeys.detail(bill.id) });
    },
  });
}

/**
 * Reopen a rejected bill
 */
export function useReopenBill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/${id}/reopen`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to reopen bill');
      }

      const result = await response.json();
      return result.data as Bill;
    },
    onSuccess: (bill) => {
      queryClient.invalidateQueries({ queryKey: billKeys.project(bill.projectId) });
      queryClient.invalidateQueries({ queryKey: billKeys.detail(bill.id) });
    },
  });
}

// ============================================================================
// BILL ITEMS MUTATIONS
// ============================================================================

/**
 * Add BOQ items to a bill
 */
export function useAddBillItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ billId, boqItemIds }: { billId: string; boqItemIds: string[] }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/${billId}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ boqItemIds }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to add items');
      }

      const result = await response.json();
      return result.data as BillItem[];
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: billKeys.detail(variables.billId) });
    },
  });
}

/**
 * Update a bill item
 */
export function useUpdateBillItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      billId,
      data,
    }: {
      itemId: string;
      billId: string;
      data: UpdateBillItemInput;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/items/${itemId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update item');
      }

      const result = await response.json();
      return { item: result.data as BillItem, billId };
    },
    onMutate: async ({ itemId, billId, data }) => {
      await queryClient.cancelQueries({ queryKey: billKeys.detail(billId) });
      const previous = queryClient.getQueryData(billKeys.detail(billId));

      queryClient.setQueryData(billKeys.detail(billId), (old: BillWithItems | undefined) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((item) =>
            item.id === itemId ? { ...item, ...data, updatedAt: new Date().toISOString() } : item
          ),
        };
      });

      return { previous };
    },
    onError: (_err, { billId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(billKeys.detail(billId), context.previous);
      }
    },
    onSettled: (result) => {
      if (result) {
        queryClient.invalidateQueries({ queryKey: billKeys.detail(result.billId) });
      }
    },
  });
}

/**
 * Delete a bill item
 */
export function useDeleteBillItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, billId }: { itemId: string; billId: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/items/${itemId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete item');
      }

      return { itemId, billId };
    },
    onMutate: async ({ itemId, billId }) => {
      await queryClient.cancelQueries({ queryKey: billKeys.detail(billId) });
      const previous = queryClient.getQueryData(billKeys.detail(billId));

      queryClient.setQueryData(billKeys.detail(billId), (old: BillWithItems | undefined) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((item) => item.id !== itemId),
        };
      });

      return { previous };
    },
    onError: (_err, { billId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(billKeys.detail(billId), context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: billKeys.detail(variables.billId) });
    },
  });
}

// ============================================================================
// MEASUREMENTS MUTATIONS
// ============================================================================

/**
 * Add a measurement to a bill item
 */
export function useAddMeasurement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      billId,
      data,
    }: {
      itemId: string;
      billId: string;
      data: AddMeasurementInput;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/items/${itemId}/measurements`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to add measurement');
      }

      const result = await response.json();
      return { measurement: result.data as Measurement, itemId, billId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: billKeys.detail(result.billId) });
      queryClient.invalidateQueries({ queryKey: billKeys.measurements(result.itemId) });
    },
  });
}

/**
 * Delete a measurement
 */
export function useDeleteMeasurement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      measurementId,
      itemId,
      billId,
    }: {
      measurementId: string;
      itemId: string;
      billId: string;
    }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/measurements/${measurementId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete measurement');
      }

      return { measurementId, itemId, billId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: billKeys.detail(result.billId) });
      queryClient.invalidateQueries({ queryKey: billKeys.measurements(result.itemId) });
    },
  });
}

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Export a bill to Excel
 */
export function useExportBill() {
  return useMutation({
    mutationFn: async ({ billId, billNumber }: { billId: string; billNumber?: number }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/execution/bills/${billId}/export`, { headers });

      if (!response.ok) {
        throw new Error('Failed to export bill');
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = billNumber ? `bill-${billNumber}.xlsx` : `bill-${billId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return true;
    },
  });
}
