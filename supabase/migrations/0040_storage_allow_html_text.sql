-- Migration: 0040_storage_allow_html_text.sql
-- Purpose: Add text/html to project-files bucket for sketch storage
-- Also ensures application/octet-stream is present (from migration 0035)
-- Date: 2026-03-09

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
  'text/html',
  'application/dxf',
  'application/dwg',
  'image/vnd.dwg',
  'image/x-dwg',
  'application/octet-stream'
]
WHERE id = 'project-files';
