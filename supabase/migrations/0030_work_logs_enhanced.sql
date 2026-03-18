-- Migration: Work Logs Enhanced
-- Adds missing fields to match legacy app functionality
--
-- Changes:
-- 1. Add status field with workflow (draft → submitted → approved)
-- 2. Add log_number for sequential numbering
-- 3. Split resources into contractor_resources + external_resources
-- 4. Add dual description fields (contractor + supervisor)
-- 5. Add dual notes fields (contractor + supervisor)
-- 6. Add traffic_controllers_info
-- 7. Add exact_address
-- 8. Add attachments (JSONB)
-- 9. Add audit_log (JSONB)

-- ============================================
-- Add new columns to work_logs
-- ============================================

-- Status workflow
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';
-- Status values: 'draft', 'submitted', 'approved'

-- Sequential log number per project
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS log_number INTEGER;

-- Split resources into contractor and external
-- Contractor resources: מנהל עבודה, פועלים, רתך, etc.
-- Structure: [{ type: string, contractorCount: number, supervisorCount: number }]
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS contractor_resources JSONB NOT NULL DEFAULT '[]';

-- External resources: פקחי תנועה, יועץ בטיחות, etc.
-- Structure: [{ type: string, contractorCount: number, supervisorCount: number }]
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS external_resources JSONB NOT NULL DEFAULT '[]';

-- Dual description fields
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS contractor_work_description TEXT;
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS supervisor_work_description TEXT;

-- Dual notes fields
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS contractor_notes TEXT;
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS supervisor_notes TEXT;

-- Traffic controllers info
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS traffic_controllers_info TEXT;

-- Exact address/location
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS exact_address TEXT;

-- Attachments
-- Structure: [{ id: string, name: string, type: string, url: string, uploadedAt: string }]
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]';

-- Audit log
-- Structure: [{ id: string, userName: string, company: string, role: string, action: string, timestamp: string }]
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS audit_log JSONB NOT NULL DEFAULT '[]';

-- ============================================
-- Migrate existing data
-- ============================================

-- Copy existing 'resources' to 'contractor_resources' with new structure
-- Old: [{ trade: string, count: number, hours: number }]
-- New: [{ type: string, contractorCount: number, supervisorCount: number }]
UPDATE work_logs
SET contractor_resources = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'type', elem->>'trade',
        'contractorCount', (elem->>'count')::int,
        'supervisorCount', 0
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(COALESCE(resources, '[]'::jsonb)) AS elem
)
WHERE resources IS NOT NULL AND resources != '[]'::jsonb;

-- Copy existing 'activities' to 'contractor_work_description'
UPDATE work_logs
SET contractor_work_description = activities
WHERE activities IS NOT NULL;

-- Copy existing 'issues' to 'contractor_notes' (issues + safety combined)
UPDATE work_logs
SET contractor_notes = CASE
  WHEN issues IS NOT NULL AND safety_notes IS NOT NULL
    THEN issues || E'\n\nהערות בטיחות:\n' || safety_notes
  WHEN issues IS NOT NULL
    THEN issues
  WHEN safety_notes IS NOT NULL
    THEN 'הערות בטיחות: ' || safety_notes
  ELSE NULL
END
WHERE issues IS NOT NULL OR safety_notes IS NOT NULL;

-- Set status based on signatures
UPDATE work_logs
SET status = CASE
  WHEN inspector_signed_at IS NOT NULL THEN 'approved'
  WHEN contractor_signed_at IS NOT NULL THEN 'submitted'
  ELSE 'draft'
END;

-- Generate log numbers per project (ordered by date)
WITH numbered_logs AS (
  SELECT
    id,
    project_id,
    ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY log_date, created_at) as rn
  FROM work_logs
)
UPDATE work_logs w
SET log_number = nl.rn
FROM numbered_logs nl
WHERE w.id = nl.id;

-- ============================================
-- Add function for auto-generating log numbers
-- ============================================

CREATE OR REPLACE FUNCTION generate_work_log_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.log_number IS NULL THEN
    SELECT COALESCE(MAX(log_number), 0) + 1
    INTO NEW.log_number
    FROM work_logs
    WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS work_log_number_trigger ON work_logs;

-- Create trigger for new logs
CREATE TRIGGER work_log_number_trigger
  BEFORE INSERT ON work_logs
  FOR EACH ROW
  EXECUTE FUNCTION generate_work_log_number();

-- ============================================
-- Add indexes for new columns
-- ============================================

CREATE INDEX IF NOT EXISTS idx_work_logs_status ON work_logs(status);
CREATE INDEX IF NOT EXISTS idx_work_logs_log_number ON work_logs(project_id, log_number);

-- ============================================
-- Add check constraint for status
-- ============================================

ALTER TABLE work_logs DROP CONSTRAINT IF EXISTS work_logs_status_check;
ALTER TABLE work_logs ADD CONSTRAINT work_logs_status_check
  CHECK (status IN ('draft', 'submitted', 'approved'));

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON COLUMN work_logs.status IS 'Workflow status: draft, submitted, approved';
COMMENT ON COLUMN work_logs.log_number IS 'Sequential number within project';
COMMENT ON COLUMN work_logs.contractor_resources IS 'Contractor manpower: [{type, contractorCount, supervisorCount}]';
COMMENT ON COLUMN work_logs.external_resources IS 'External resources: [{type, contractorCount, supervisorCount}]';
COMMENT ON COLUMN work_logs.contractor_work_description IS 'Work description by contractor';
COMMENT ON COLUMN work_logs.supervisor_work_description IS 'Work description by supervisor/inspector';
COMMENT ON COLUMN work_logs.contractor_notes IS 'Notes by contractor';
COMMENT ON COLUMN work_logs.supervisor_notes IS 'Notes by supervisor/inspector';
COMMENT ON COLUMN work_logs.traffic_controllers_info IS 'Traffic controller details';
COMMENT ON COLUMN work_logs.exact_address IS 'Exact work location address';
COMMENT ON COLUMN work_logs.attachments IS 'File attachments: [{id, name, type, url, uploadedAt}]';
COMMENT ON COLUMN work_logs.audit_log IS 'Action history: [{id, userName, company, role, action, timestamp}]';
