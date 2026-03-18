-- ============================================================================
-- Migration: Storage Tracking
-- Description: Add storage usage tracking to organizations for limit enforcement
-- ============================================================================

-- Add storage tracking column to organizations
-- Using BIGINT for bytes to support large storage (up to 9 exabytes)
ALTER TABLE organizations
ADD COLUMN storage_used_bytes BIGINT NOT NULL DEFAULT 0;

-- Add check constraint to ensure non-negative storage
ALTER TABLE organizations
ADD CONSTRAINT storage_used_bytes_non_negative CHECK (storage_used_bytes >= 0);

-- Add index for storage queries (useful for admin dashboards, reports)
CREATE INDEX idx_organizations_storage_used
ON organizations (storage_used_bytes DESC)
WHERE storage_used_bytes > 0;

-- Add comment for documentation
COMMENT ON COLUMN organizations.storage_used_bytes IS
  'Total storage used by this organization in bytes. Updated on file upload/delete.';

-- ============================================================================
-- Helper function to update storage usage (atomic increment/decrement)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_org_storage(
  org_id UUID,
  bytes_delta BIGINT
) RETURNS BIGINT AS $$
DECLARE
  new_total BIGINT;
BEGIN
  UPDATE organizations
  SET storage_used_bytes = GREATEST(0, storage_used_bytes + bytes_delta)
  WHERE id = org_id
  RETURNING storage_used_bytes INTO new_total;

  RETURN COALESCE(new_total, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (will be called from Edge Functions)
GRANT EXECUTE ON FUNCTION update_org_storage(UUID, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_org_storage(UUID, BIGINT) TO service_role;
