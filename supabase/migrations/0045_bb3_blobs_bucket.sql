-- ============================================================
-- BB-3 blob storage bucket (PH9 §8.2)
-- ============================================================
-- Purpose: Content-addressable storage for large source blobs
-- extracted from CustomComputationIR.rawSource (and any future
-- big-blob IR types). The BB-3 normalizer extracts these via
-- splitLargeBlobs() so the persisted IRGraph carries content
-- hashes instead of inline source — keeps assessment_runs.ir_graph
-- rows small and lets BB-17 re-assessment compare graphs by hash
-- without fetching the body.
--
-- Object keys: {organization_id}/{contentHash}.txt
--   - Per-tenant prefix isolates blobs across organizations
--   - .txt suffix gets us text/plain in the Supabase admin UI
--   - contentHash is full SHA-256 (43-char URL-safe base64)
--
-- Access: service_role only. The worker is the sole writer
-- (during BB-3 extraction). Future BB-17 reads via the same
-- BlobStore interface using the same service-role auth.
--
-- See: docs/MIGRATION-PLANNER-BB3-DESIGN.md §8.2
--      apps/worker/src/pipeline/supabase-blob-store.ts
-- ============================================================

-- 100MB max per blob (matches the project-files bucket cap).
-- Real Apex / QCP scripts top out at a few MB; the 100MB ceiling
-- is for safety, not normal operation. The 100KB SPLIT THRESHOLD
-- (set in DEFAULT_BLOB_SPLIT_THRESHOLD_BYTES) decides what gets
-- externalized in the first place.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bb3-blobs',
  'bb3-blobs',
  false,
  104857600,
  ARRAY['text/plain', 'text/plain; charset=utf-8', 'application/octet-stream']
) ON CONFLICT (id) DO NOTHING;

-- Service-role full access — no client-side reads or writes.
-- The worker uses its service_role JWT; future BB-17 will use
-- the same. RLS denies everything else.
CREATE POLICY "bb3-blobs service_role full access"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'bb3-blobs')
  WITH CHECK (bucket_id = 'bb3-blobs');

COMMENT ON POLICY "bb3-blobs service_role full access" ON storage.objects IS
  'BB-3 blob storage: per-tenant content-addressable Apex/QCP source. Service-role only.';
