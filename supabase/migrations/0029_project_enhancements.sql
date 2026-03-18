-- Migration: 0029_project_enhancements.sql
-- Purpose: Enhance projects table for legacy migration (Phase 1.1)
-- Adds: organization link, contract metadata, discount config, status workflow
-- Date: 2026-02-10

-- ============================================================================
-- ADD ORGANIZATION LINK
-- ============================================================================

-- Add organization_id column (nullable initially for migration)
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Populate organization_id from owner's organization
UPDATE projects p
SET organization_id = u.organization_id
FROM users u
WHERE p.owner_id = u.id
AND p.organization_id IS NULL;

-- Make organization_id NOT NULL after population
ALTER TABLE projects
ALTER COLUMN organization_id SET NOT NULL;

-- Add index for organization lookup
CREATE INDEX IF NOT EXISTS idx_projects_organization ON projects(organization_id);

-- ============================================================================
-- ADD CONTRACT METADATA
-- ============================================================================

-- Contract identification
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS contract_number VARCHAR(50);

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS contract_date DATE;

-- Contract period
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS start_date DATE;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS end_date DATE;

-- Contract parties
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS contractor_name VARCHAR(255);

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS contractor_id VARCHAR(50); -- Business ID / Tax ID

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS client_id VARCHAR(50); -- Business ID / Tax ID

-- Contract value (in cents to avoid floating point issues)
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS contract_value_cents BIGINT DEFAULT 0;

-- ============================================================================
-- ADD DISCOUNT CONFIGURATION
-- ============================================================================

-- Global discount for the entire project (percentage)
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS global_discount_percent DECIMAL(5,2) DEFAULT 0;

-- Chapter-specific discounts (JSONB: { "chapter_code": discount_percent })
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS chapter_discounts JSONB DEFAULT '{}';

-- ============================================================================
-- ADD STATUS WORKFLOW
-- ============================================================================

-- Project status
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
-- Statuses: draft, active, on_hold, completed, cancelled

-- Status timestamps
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- ============================================================================
-- ADD ADDITIONAL METADATA
-- ============================================================================

-- Project location
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS location TEXT;

-- Project notes (internal)
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Custom fields for flexibility
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS if not already enabled
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "projects_org_access" ON projects;

-- Create organization-based access policy
CREATE POLICY "projects_org_access" ON projects
  FOR ALL USING (organization_id = public.get_user_org_id());

-- ============================================================================
-- INDEXES FOR COMMON QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_contract_number ON projects(contract_number);
CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date);

-- ============================================================================
-- TRIGGER FOR updated_at
-- ============================================================================

-- Create trigger if not exists
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
