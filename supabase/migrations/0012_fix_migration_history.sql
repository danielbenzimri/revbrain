-- Historical migration to fix duplicate key issue
-- Originally 0006_slimy_vertigo.sql, renamed to fix numbering conflict
-- Columns were already added by 0006_modern_user_fields.sql
-- This migration is a no-op but kept for history
SELECT 1;