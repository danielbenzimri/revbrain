-- ============================================================================
-- CALCULATION RESULTS TABLE
-- Stores calculation state for legacy engineering modules
-- ============================================================================

-- Create enum for module types
CREATE TYPE module_type AS ENUM (
  'landscaping',
  'bezeq',
  'earthworks',
  'demolition',
  'curb',
  'paving',
  'gardening',
  'irrigation',
  'gravity_walls',
  'reinforced_walls',
  'cladding_walls',
  'piles',
  'rock_bolts',
  'concrete_columns',
  'exceptions',
  'regie',
  'traffic_signs',
  'pipes'
);

-- Create calculation_results table
CREATE TABLE calculation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Module identification
  module_type module_type NOT NULL,
  module_version INTEGER DEFAULT 1,

  -- The actual calculation data (preserved exactly as legacy format)
  data JSONB NOT NULL DEFAULT '{}',

  -- Metadata
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Ensure one result per module per project
  UNIQUE(project_id, module_type)
);

-- Indexes for fast lookups
CREATE INDEX idx_calc_results_project ON calculation_results(project_id);
CREATE INDEX idx_calc_results_org ON calculation_results(organization_id);
CREATE INDEX idx_calc_results_module ON calculation_results(project_id, module_type);

-- Enable RLS
ALTER TABLE calculation_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view calculation results for projects in their organization
CREATE POLICY "Users can view own org calculation results"
  ON calculation_results FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can insert calculation results for projects in their organization
CREATE POLICY "Users can create calculation results in own org"
  ON calculation_results FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can update calculation results for projects in their organization
CREATE POLICY "Users can update own org calculation results"
  ON calculation_results FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Users can delete calculation results for projects in their organization
CREATE POLICY "Users can delete own org calculation results"
  ON calculation_results FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- System admin bypass policy
CREATE POLICY "System admins can manage all calculation results"
  ON calculation_results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER set_calculation_results_updated_at
  BEFORE UPDATE ON calculation_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE calculation_results IS 'Stores calculation state for legacy engineering modules per project';
COMMENT ON COLUMN calculation_results.module_type IS 'Type of calculation module (landscaping, paving, etc.)';
COMMENT ON COLUMN calculation_results.data IS 'Full calculation state preserved in legacy format as JSONB';
COMMENT ON COLUMN calculation_results.module_version IS 'Schema version for future migrations';
