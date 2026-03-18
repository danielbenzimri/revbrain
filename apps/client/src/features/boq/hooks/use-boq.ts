/**
 * BOQ Hooks
 *
 * React Query hooks for Bill of Quantities operations:
 * - Get BOQ items (flat and tree)
 * - CRUD operations
 * - Excel import
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// Types
export interface BOQItem {
  id: string;
  organizationId: string;
  projectId: string;
  parentId: string | null;
  code: string;
  description: string;
  unit: string | null;
  contractQuantity: number | null;
  unitPriceCents: number | null;
  level: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  children?: BOQItem[];
}

export interface CreateBOQItemInput {
  projectId: string;
  parentId?: string | null;
  code: string;
  description: string;
  unit?: string | null;
  contractQuantity?: number | null;
  unitPriceCents?: number | null;
  level?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateBOQItemInput {
  code?: string;
  description?: string;
  unit?: string | null;
  contractQuantity?: number | null;
  unitPriceCents?: number | null;
  level?: number;
  sortOrder?: number;
  isActive?: boolean;
  parentId?: string | null;
}

export interface ImportOptions {
  replace?: boolean;
  sheet?: string | number;
  startRow?: number;
  /** Multiple columns whose values are joined with dots to form the item code (e.g. ['A','B','C','D']) */
  codeColumns?: string[];
  columns?: {
    code?: string;
    description?: string;
    unit?: string;
    quantity?: string;
    unitPrice?: string;
  };
}

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: Array<{ row: number; code?: string; message: string }>;
  items: BOQItem[];
}

export interface BOQSummary {
  totalItems: number;
  categories: number;
  totalValueCents: number;
}

// Query keys
export const boqKeys = {
  all: ['boq'] as const,
  project: (projectId: string) => [...boqKeys.all, 'project', projectId] as const,
  tree: (projectId: string) => [...boqKeys.project(projectId), 'tree'] as const,
  flat: (projectId: string) => [...boqKeys.project(projectId), 'flat'] as const,
  summary: (projectId: string) => [...boqKeys.project(projectId), 'summary'] as const,
  item: (id: string) => [...boqKeys.all, 'item', id] as const,
};

/**
 * Get BOQ items as hierarchical tree
 */
export function useBOQTree(projectId: string | undefined) {
  return useQuery({
    queryKey: boqKeys.tree(projectId || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/boq/project/${projectId}/tree`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch BOQ tree');
      }

      const result = await response.json();
      return result.data as BOQItem[];
    },
    enabled: !!projectId,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Get BOQ items as flat list
 */
export function useBOQItems(projectId: string | undefined) {
  return useQuery({
    queryKey: boqKeys.flat(projectId || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/boq/project/${projectId}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch BOQ items');
      }

      const result = await response.json();
      return {
        items: result.data as BOQItem[],
        count: result.meta?.count || result.data.length,
      };
    },
    enabled: !!projectId,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Get single BOQ item by ID
 */
export function useBOQItem(id: string | undefined) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: boqKeys.item(id || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/boq/${id}`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch BOQ item');
      }

      const result = await response.json();
      return result.data as BOQItem;
    },
    enabled: !!id,
    placeholderData: () => {
      // Search flat list caches for matching BOQ item
      const queries = queryClient.getQueryCache().findAll({ queryKey: boqKeys.all });
      for (const query of queries) {
        const data = query.state.data as { items?: BOQItem[] } | undefined;
        const found = data?.items?.find((item) => item.id === id);
        if (found) return found;
      }
      return undefined;
    },
  });
}

/**
 * Create BOQ item
 */
export function useCreateBOQItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBOQItemInput) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/boq`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to create BOQ item');
      }

      const result = await response.json();
      return result.data as BOQItem;
    },
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey: boqKeys.flat(newItem.projectId) });
      const previous = queryClient.getQueryData(boqKeys.flat(newItem.projectId));

      queryClient.setQueryData(
        boqKeys.flat(newItem.projectId),
        (old: { items: BOQItem[]; count: number } | undefined) => {
          if (!old) return old;
          const optimistic: BOQItem = {
            id: `temp-${Date.now()}`,
            organizationId: '',
            projectId: newItem.projectId,
            parentId: newItem.parentId ?? null,
            code: newItem.code,
            description: newItem.description,
            unit: newItem.unit ?? null,
            contractQuantity: newItem.contractQuantity ?? null,
            unitPriceCents: newItem.unitPriceCents ?? null,
            level: newItem.level ?? 0,
            sortOrder: newItem.sortOrder ?? old.items.length,
            isActive: newItem.isActive ?? true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return { items: [...old.items, optimistic], count: old.count + 1 };
        }
      );

      return { previous };
    },
    onError: (_err, newItem, context) => {
      if (context?.previous) {
        queryClient.setQueryData(boqKeys.flat(newItem.projectId), context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: boqKeys.project(variables.projectId) });
    },
  });
}

/**
 * Update BOQ item
 */
export function useUpdateBOQItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateBOQItemInput }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/boq/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update BOQ item');
      }

      const result = await response.json();
      return result.data as BOQItem;
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: boqKeys.item(id) });
      const previousItem = queryClient.getQueryData(boqKeys.item(id));

      queryClient.setQueryData(boqKeys.item(id), (old: BOQItem | undefined) => {
        if (!old) return old;
        return { ...old, ...data, updatedAt: new Date().toISOString() };
      });

      return { previousItem };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousItem) {
        queryClient.setQueryData(boqKeys.item(id), context.previousItem);
      }
    },
    onSettled: (item) => {
      if (item) {
        queryClient.invalidateQueries({ queryKey: boqKeys.project(item.projectId) });
        queryClient.invalidateQueries({ queryKey: boqKeys.item(item.id) });
      }
    },
  });
}

/**
 * Delete BOQ item
 */
export function useDeleteBOQItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/boq/${id}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete BOQ item');
      }

      return { id, projectId };
    },
    onMutate: async ({ id, projectId }) => {
      await queryClient.cancelQueries({ queryKey: boqKeys.flat(projectId) });
      const previous = queryClient.getQueryData(boqKeys.flat(projectId));

      queryClient.setQueryData(
        boqKeys.flat(projectId),
        (old: { items: BOQItem[]; count: number } | undefined) => {
          if (!old) return old;
          return {
            items: old.items.filter((item) => item.id !== id),
            count: old.count - 1,
          };
        }
      );

      return { previous };
    },
    onError: (_err, { projectId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(boqKeys.flat(projectId), context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: boqKeys.project(variables.projectId) });
    },
  });
}

/**
 * Import BOQ from Excel file
 */
export function useImportBOQ() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      file,
      options,
    }: {
      projectId: string;
      file: File;
      options?: ImportOptions;
    }) => {
      const headers = await getAuthHeaders();
      // Remove Content-Type for multipart/form-data - browser sets it with boundary
      delete (headers as Record<string, string>)['Content-Type'];

      const formData = new FormData();
      formData.append('file', file);
      if (options) {
        formData.append('options', JSON.stringify(options));
      }

      const response = await fetch(`${apiUrl}/v1/boq/import/${projectId}`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        const importResult: ImportResult = {
          success: false,
          imported: result.data?.imported || 0,
          errors: result.error?.details || result.data?.errors || [],
          items: [],
        };
        return importResult;
      }

      return {
        success: true,
        imported: result.data.imported,
        errors: [],
        items: result.data.items,
      } as ImportResult;
    },
    onSuccess: (result, variables) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: boqKeys.project(variables.projectId) });
      }
    },
  });
}

/**
 * Get BOQ summary statistics
 */
export function useBOQSummary(projectId: string | undefined) {
  return useQuery({
    queryKey: boqKeys.summary(projectId || ''),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/boq/project/${projectId}/summary`, { headers });

      if (!response.ok) {
        throw new Error('Failed to fetch BOQ summary');
      }

      const result = await response.json();
      return result.data as BOQSummary;
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

/**
 * Export BOQ to Excel file
 */
export function useExportBOQ() {
  return useMutation({
    mutationFn: async ({ projectId, projectName }: { projectId: string; projectName?: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/boq/project/${projectId}/export`, { headers });

      if (!response.ok) {
        throw new Error('Failed to export BOQ');
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = projectName ? `boq-${projectName}.xlsx` : `boq-${projectId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return true;
    },
  });
}
