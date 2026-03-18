-- ============================================================================
-- DRAINAGE CHANNELS PERSISTENCE SUPPORT
-- Adds version column for optimistic locking, deleted_at for soft delete,
-- and module_spreadsheets table for per-module spreadsheet storage.
-- ============================================================================

-- Add 'drainage_channels' to module_type enum if not already present
ALTER TYPE module_type ADD VALUE IF NOT EXISTS 'drainage_channels';

-- --------------------------------------------------------------------------
-- 1. Add `version` column for optimistic locking
-- --------------------------------------------------------------------------
ALTER TABLE calculation_results
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN calculation_results.version IS 'Optimistic locking counter, incremented on every successful update';

-- --------------------------------------------------------------------------
-- 2. Add `deleted_at` column for soft delete
-- --------------------------------------------------------------------------
ALTER TABLE calculation_results
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN calculation_results.deleted_at IS 'Soft delete timestamp, NULL means active';

-- Partial index for fast lookups excluding soft-deleted rows
CREATE INDEX IF NOT EXISTS idx_calc_results_active
  ON calculation_results(project_id, module_type)
  WHERE deleted_at IS NULL;

-- --------------------------------------------------------------------------
-- 3. Create module_spreadsheets table
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS module_spreadsheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id UUID NOT NULL REFERENCES calculation_results(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- Index for fast lookup by calculation, excluding soft-deleted
CREATE INDEX IF NOT EXISTS idx_module_spreadsheets_calc_id
  ON module_spreadsheets(calculation_id)
  WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE module_spreadsheets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for module_spreadsheets
-- Users can view spreadsheets for calculations in their organization
CREATE POLICY "Users can view own org spreadsheets"
  ON module_spreadsheets FOR SELECT
  USING (
    calculation_id IN (
      SELECT cr.id FROM calculation_results cr
      WHERE cr.organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create spreadsheets in own org"
  ON module_spreadsheets FOR INSERT
  WITH CHECK (
    calculation_id IN (
      SELECT cr.id FROM calculation_results cr
      WHERE cr.organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update own org spreadsheets"
  ON module_spreadsheets FOR UPDATE
  USING (
    calculation_id IN (
      SELECT cr.id FROM calculation_results cr
      WHERE cr.organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete own org spreadsheets"
  ON module_spreadsheets FOR DELETE
  USING (
    calculation_id IN (
      SELECT cr.id FROM calculation_results cr
      WHERE cr.organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- System admin bypass
CREATE POLICY "System admins can manage all spreadsheets"
  ON module_spreadsheets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

-- Auto-update updated_at trigger
CREATE TRIGGER set_module_spreadsheets_updated_at
  BEFORE UPDATE ON module_spreadsheets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE module_spreadsheets IS 'Stores per-module spreadsheet data, linked to calculation_results';
COMMENT ON COLUMN module_spreadsheets.calculation_id IS 'FK to calculation_results, cascades on delete';
COMMENT ON COLUMN module_spreadsheets.data IS 'Spreadsheet cell data as JSONB (rows, columns, formulas)';
