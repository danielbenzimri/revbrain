/**
 * Signature Upload Hook
 *
 * React Query mutation for uploading signatures to storage.
 */
import { useMutation } from '@tanstack/react-query';
import { getAuthHeaders } from '@/lib/auth-headers';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

// ============================================================================
// TYPES
// ============================================================================

export interface SignatureUploadParams {
  entityType: 'bill' | 'measurement' | 'work_log';
  entityId: string;
  dataUrl: string;
}

export interface SignatureUploadResult {
  path: string;
  url: string;
}

// ============================================================================
// API
// ============================================================================

async function uploadSignature(params: SignatureUploadParams): Promise<SignatureUploadResult> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${apiUrl}/v1/storage/signatures`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'Failed to upload signature');
  }

  return data.data;
}

// ============================================================================
// HOOK
// ============================================================================

export function useSignatureUpload() {
  return useMutation({
    mutationFn: uploadSignature,
  });
}
