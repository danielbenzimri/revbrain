-- Migration: 0028_storage_buckets.sql
-- Purpose: Create Supabase Storage buckets for legacy migration
-- Buckets: signatures, project-files, chat-attachments, thumbnails
-- Date: 2026-02-10

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

-- Signatures bucket (bill approvals, measurements, work logs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signatures',
  'signatures',
  false,
  1048576, -- 1MB max
  ARRAY['image/png', 'image/jpeg', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Project files bucket (documents, drawings, photos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,
  104857600, -- 100MB max
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/zip',
    'text/plain',
    'text/csv',
    'application/dxf',
    'application/dwg',
    'image/vnd.dwg',
    'image/x-dwg'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Chat attachments bucket (images, files shared in chat)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  26214400, -- 25MB max
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'video/mp4', 'video/webm'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Thumbnails bucket (auto-generated previews)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'thumbnails',
  'thumbnails',
  false,
  524288, -- 512KB max
  ARRAY['image/png', 'image/jpeg', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RLS POLICIES FOR SIGNATURES BUCKET
-- ============================================================================

-- Policy: Organization members can read signatures in their org
CREATE POLICY "signatures_org_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
);

-- Policy: Organization members can upload signatures
CREATE POLICY "signatures_org_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
);

-- Policy: Organization members can delete their own signatures
CREATE POLICY "signatures_org_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
);

-- ============================================================================
-- RLS POLICIES FOR PROJECT-FILES BUCKET
-- ============================================================================

-- Policy: Organization members can read project files in their org
CREATE POLICY "project_files_org_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
);

-- Policy: Organization members can upload project files
CREATE POLICY "project_files_org_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
);

-- Policy: Organization members can update project files
CREATE POLICY "project_files_org_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
);

-- Policy: Organization members can delete project files
CREATE POLICY "project_files_org_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
);

-- ============================================================================
-- RLS POLICIES FOR CHAT-ATTACHMENTS BUCKET
-- ============================================================================

-- Policy: Chat group members can read attachments in their groups
-- Path format: {org_id}/{group_id}/{filename}
CREATE POLICY "chat_attachments_member_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
  AND (
    -- Check if user is member of the chat group
    EXISTS (
      SELECT 1 FROM chat_groups cg
      WHERE cg.id::text = (storage.foldername(name))[2]
      AND cg.organization_id = get_user_org_id()
      AND (
        cg.is_private = false
        OR auth.uid() = ANY(cg.members)
      )
    )
  )
);

-- Policy: Chat group members can upload attachments
CREATE POLICY "chat_attachments_member_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
  AND (
    EXISTS (
      SELECT 1 FROM chat_groups cg
      WHERE cg.id::text = (storage.foldername(name))[2]
      AND cg.organization_id = get_user_org_id()
      AND auth.uid() = ANY(cg.members)
    )
  )
);

-- Policy: Chat group admins can delete attachments
CREATE POLICY "chat_attachments_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
  AND (
    EXISTS (
      SELECT 1 FROM chat_groups cg
      WHERE cg.id::text = (storage.foldername(name))[2]
      AND cg.organization_id = get_user_org_id()
      AND auth.uid() = ANY(cg.admins)
    )
  )
);

-- ============================================================================
-- RLS POLICIES FOR THUMBNAILS BUCKET
-- ============================================================================

-- Policy: Organization members can read thumbnails in their org
CREATE POLICY "thumbnails_org_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'thumbnails'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
);

-- Policy: System can insert thumbnails (service role or authenticated with org access)
CREATE POLICY "thumbnails_org_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'thumbnails'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
);

-- Policy: Organization members can delete thumbnails
CREATE POLICY "thumbnails_org_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'thumbnails'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM organizations WHERE id = get_user_org_id()
  )
);

-- ============================================================================
-- HELPER COMMENT
-- ============================================================================
-- Storage path conventions:
-- signatures:        {org_id}/{entity_type}/{entity_id}/{timestamp}.{ext}
-- project-files:     {org_id}/{project_id}/{folder_path}/{filename}
-- chat-attachments:  {org_id}/{group_id}/{message_id}/{filename}
-- thumbnails:        {org_id}/{source_bucket}/{original_path_hash}.{ext}
