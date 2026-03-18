-- Migration: 0035_storage_mime_types.sql
-- Purpose: Add application/octet-stream to project-files bucket
-- Reason: Browsers send application/octet-stream for DXF and other unknown file types
-- Date: 2026-02-18

-- Update project-files bucket to allow application/octet-stream
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
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
  'image/x-dwg',
  'application/octet-stream' -- Generic binary - browsers use this for unknown types like DXF
]
WHERE id = 'project-files';
