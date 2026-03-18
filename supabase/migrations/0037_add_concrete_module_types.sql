-- ============================================================================
-- ADD CONCRETE MODULE TYPES TO ENUM
-- Adds concrete_pavers, concrete_beams, concrete_slabs
-- ============================================================================

-- Add new enum values to module_type
ALTER TYPE module_type ADD VALUE IF NOT EXISTS 'concrete_pavers';
ALTER TYPE module_type ADD VALUE IF NOT EXISTS 'concrete_beams';
ALTER TYPE module_type ADD VALUE IF NOT EXISTS 'concrete_slabs';

-- Update comments
COMMENT ON TYPE module_type IS 'Engineering calculation module types including concrete_pavers, concrete_beams, and concrete_slabs';
