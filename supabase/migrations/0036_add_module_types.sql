-- ============================================================================
-- ADD MISSING MODULE TYPES TO ENUM
-- Adds simple_earthworks, drainage, mse_walls, street_lighting
-- ============================================================================

-- Add new enum values to module_type
ALTER TYPE module_type ADD VALUE IF NOT EXISTS 'simple_earthworks';
ALTER TYPE module_type ADD VALUE IF NOT EXISTS 'drainage';
ALTER TYPE module_type ADD VALUE IF NOT EXISTS 'mse_walls';
ALTER TYPE module_type ADD VALUE IF NOT EXISTS 'street_lighting';

-- Update comments
COMMENT ON TYPE module_type IS 'Engineering calculation module types including simple_earthworks, drainage, mse_walls, and street_lighting';
