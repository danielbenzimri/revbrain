-- ============================================================================
-- FIX: Ensure version and deleted_at columns exist on calculation_results
--
-- Migration 0038 may have been recorded as applied without the ALTER TABLE
-- statements actually executing. This migration is idempotent and will
-- add the missing columns if they don't exist.
-- ============================================================================

-- Add version column for optimistic locking (if missing)
ALTER TABLE calculation_results
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Add deleted_at column for soft delete (if missing)
ALTER TABLE calculation_results
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Ensure partial index exists for fast lookups excluding soft-deleted rows
CREATE INDEX IF NOT EXISTS idx_calc_results_active
  ON calculation_results(project_id, module_type)
  WHERE deleted_at IS NULL;

-- Ensure module_spreadsheets table exists (from 0038)
CREATE TABLE IF NOT EXISTS module_spreadsheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id UUID NOT NULL REFERENCES calculation_results(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_module_spreadsheets_calc_id
  ON module_spreadsheets(calculation_id)
  WHERE deleted_at IS NULL;
