/**
 * Project Files Hooks
 *
 * React Query hooks for project document/file operations:
 * - List project files
 * - Upload files
 * - Delete files
 * - Move files between folders
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// ============================================================================
// TYPES
// ============================================================================

export interface ProjectFile {
  id: string;
  organizationId: string;
  projectId: string;
  fileName: string;
  fileType: string | null;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string | null;
  thumbnailPath: string | null;
  previewPath: string | null;
  folderPath: string;
  metadata: Record<string, unknown>;
  uploadedBy: string;
  createdAt: string;
}

export interface ProjectFilesResponse {
  files: ProjectFile[];
  total: number;
}

export interface UploadFileInput {
  projectId: string;
  file: File;
  folderPath?: string;
}

export interface MoveFileInput {
  fileId: string;
  projectId: string;
  newFolderPath: string;
}

export interface UpdateFileMetadataInput {
  fileId: string;
  projectId: string;
  metadata: Record<string, unknown>;
}

export interface UploadFileWithMetadataInput extends UploadFileInput {
  metadata?: Record<string, unknown>;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const projectFilesKeys = {
  all: ['project-files'] as const,
  lists: () => [...projectFilesKeys.all, 'list'] as const,
  list: (projectId: string) => [...projectFilesKeys.lists(), projectId] as const,
  detail: (fileId: string) => [...projectFilesKeys.all, 'detail', fileId] as const,
};

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all files for a project
 */
export function useProjectFiles(projectId: string) {
  return useQuery({
    queryKey: projectFilesKeys.list(projectId),
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/files`, {
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to fetch files');
      }

      const result = await response.json();
      return result.data as ProjectFilesResponse;
    },
    enabled: !!projectId,
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Upload a file to a project
 */
export function useUploadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, file, folderPath = '/' }: UploadFileInput) => {
      console.log('[useUploadFile] Starting mutation:', {
        projectId,
        fileName: file.name,
        folderPath,
      });

      const headers = await getAuthHeaders();
      console.log('[useUploadFile] Got auth headers');

      // Remove Content-Type to let browser set it with boundary for FormData
      delete (headers as Record<string, string>)['Content-Type'];

      const formData = new FormData();
      formData.append('file', file);
      formData.append('folderPath', folderPath);

      console.log(
        '[useUploadFile] Making POST request to:',
        `${apiUrl}/v1/projects/${projectId}/files`
      );

      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/files`, {
        method: 'POST',
        headers,
        body: formData,
      });

      console.log('[useUploadFile] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to upload file');
      }

      const result = await response.json();
      console.log('[useUploadFile] Upload success:', result.data?.id);
      return result.data as ProjectFile;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectFilesKeys.list(projectId) });
    },
  });
}

/**
 * Delete a file from a project
 */
export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fileId, projectId }: { fileId: string; projectId: string }) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/files/${fileId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete file');
      }

      return { fileId, projectId };
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectFilesKeys.list(projectId) });
    },
    onError: (_, { projectId }) => {
      // Invalidate cache on error (e.g. 404) to remove ghost files from the UI
      queryClient.invalidateQueries({ queryKey: projectFilesKeys.list(projectId) });
    },
  });
}

/**
 * Move a file to a different folder
 */
export function useMoveFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fileId, projectId, newFolderPath }: MoveFileInput) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/files/${fileId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ folderPath: newFolderPath }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to move file');
      }

      const result = await response.json();
      return result.data as ProjectFile;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectFilesKeys.list(projectId) });
    },
  });
}

/**
 * Get download URL for a file
 */
export function useFileDownloadUrl(fileId: string, projectId: string) {
  return useQuery({
    queryKey: [...projectFilesKeys.detail(fileId), 'download'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/files/${fileId}/download`, {
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to get download URL');
      }

      const result = await response.json();
      return result.data.url as string;
    },
    enabled: !!fileId && !!projectId,
  });
}

/**
 * Update file metadata (layer styles, drone imagery config, etc.)
 */
export function useUpdateFileMetadata() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fileId, projectId, metadata }: UpdateFileMetadataInput) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/files/${fileId}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ metadata }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update file metadata');
      }

      const result = await response.json();
      return result.data as ProjectFile;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectFilesKeys.list(projectId) });
    },
  });
}

/**
 * Upload a file with metadata (for drone imagery with bounds/position)
 */
export function useUploadFileWithMetadata() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      file,
      folderPath = '/',
      metadata,
    }: UploadFileWithMetadataInput) => {
      const headers = await getAuthHeaders();
      // Remove Content-Type to let browser set it with boundary for FormData
      delete (headers as Record<string, string>)['Content-Type'];

      const formData = new FormData();
      formData.append('file', file);
      formData.append('folderPath', folderPath);
      if (metadata) {
        formData.append('metadata', JSON.stringify(metadata));
      }

      const response = await fetch(`${apiUrl}/v1/projects/${projectId}/files`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to upload file');
      }

      const result = await response.json();
      return result.data as ProjectFile;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectFilesKeys.list(projectId) });
    },
  });
}
