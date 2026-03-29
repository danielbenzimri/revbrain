-- Migration: 0043_avatars_bucket.sql
-- Purpose: Create tenant-isolated avatar storage bucket
-- Path convention: {org_id}/{user_id}.{ext}

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  2097152, -- 2MB max
  ARRAY['image/png', 'image/jpeg', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RLS POLICIES FOR AVATARS BUCKET
-- Org isolation: first folder component must match the user's organization_id.
-- Uses inline subquery (no dependency on get_user_org_id function).
-- ============================================================================

-- Policy: Org members can read avatars in their org folder
CREATE POLICY "avatars_org_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM users WHERE supabase_user_id = auth.uid()
  )
);

-- Policy: Org members can upload avatars in their org folder
CREATE POLICY "avatars_org_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM users WHERE supabase_user_id = auth.uid()
  )
);

-- Policy: Org members can update avatars in their org folder
CREATE POLICY "avatars_org_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM users WHERE supabase_user_id = auth.uid()
  )
);

-- Policy: Org members can delete avatars in their org folder
CREATE POLICY "avatars_org_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM users WHERE supabase_user_id = auth.uid()
  )
);
