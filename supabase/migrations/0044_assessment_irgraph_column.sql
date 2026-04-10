-- ============================================================
-- BB-3 IR Graph persistence (PH8.2)
-- ============================================================
-- Adds a nullable JSONB column to assessment_runs that stores
-- the BB-3 IRGraph payload (the deterministic intermediate
-- representation produced after extraction).
--
-- Design notes:
--   * Nullable so existing rows are unaffected. Backfill is not
--     required — old runs simply have no graph.
--   * JSONB not JSON so large payloads get TOAST compression and
--     existing jsonb GIN indexing helpers apply if we need them.
--   * Column-level encryption is out of scope for this migration;
--     it is tracked in docs/TECH-DEBT.md and will land alongside
--     the object-storage split for large CustomComputationIR.rawSource
--     blobs (§8.2 sensitivity policy).
--   * RLS inherits from assessment_runs' existing policies — no
--     new policy needed since the column lives on the same row.
--
-- See: docs/MIGRATION-PLANNER-BB3-DESIGN.md §6.4 persistence,
--      docs/MIGRATION-PLANNER-BB3-TASKS.md PH8.2
-- Schema source: packages/database/src/schema.ts assessmentRuns.irGraph
-- ============================================================

ALTER TABLE assessment_runs
  ADD COLUMN IF NOT EXISTS ir_graph JSONB;

COMMENT ON COLUMN assessment_runs.ir_graph IS
  'BB-3 IRGraph payload (canonical-JSON round-trippable). Nullable until the run completes normalization.';
