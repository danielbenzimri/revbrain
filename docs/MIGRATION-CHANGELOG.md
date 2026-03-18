# RevBrain Migration Changelog

Tracks all changes made while transforming the Geometrix codebase into RevBrain.
This file serves as a reference for pending database migrations and completed work.

---

## [2026-03-18] Initial Fork & Cleanup

### Removed — Engineering Calculation Modules

- Deleted 22 legacy calculation modules from `apps/client/src/features/modules/legacy/`
- Removed `apps/dxf-parser/` (DXF file parsing app)
- Removed server routes: `calculations.ts`, `dxf.ts`
- Removed server repositories: `calculation-result.repository.ts`, `module-spreadsheet.repository.ts`
- Removed server service: `dxf.service.ts`
- Removed client hooks/utils/components: `use-calculations.ts`, `LegacyModuleWrapper.tsx`, `ModulesTab.tsx`, `create-lazy-wrapper.tsx`, `dxf-parser-api.ts`, `module-telemetry.ts`, `ProjectFilesContext.tsx`, `use-cloud-file-upload.ts`, `use-legacy-state.ts`
- Removed `WorkspacePage.tsx` and `ModulesPage.tsx` from project workspace
- Removed modules/workspace navigation from sidebar and routes
- Removed engineering locale files (`engineering.json`)

### Removed — Engineering Database Tables (code only, not yet migrated)

- `walls` table definition
- `paving_areas` table definition
- `earthwork_calculations` table definition
- `calculation_results` table definition
- `module_spreadsheets` table definition
- Related Drizzle relations removed from schema

### Removed — Engineering Contract Types

- `ModuleType` union type (32 module types)
- `CalculationResultRepository` interface
- `ModuleSpreadsheetRepository` interface
- Related entity/input types
- Removed `calculationResults` and `moduleSpreadsheets` from `Repositories` interface

### Removed — Heavy Client Dependencies

- `three`, `@react-three/drei`, `@react-three/fiber` (3D rendering)
- `konva`, `react-konva` (Canvas drawing)
- `leaflet`, `@types/leaflet` (Maps)
- `dxf-parser`, `dxf-json`, `dxf-viewer` (CAD parsing)
- `pdf-lib`, `react-pdf` (PDF handling)
- `exifr` (EXIF data)
- `proj4`, `@types/proj4` (Coordinate projection)
- `@fortune-sheet/react` (Spreadsheets)
- `3d-tiles-renderer` (3D tiles)
- `react-is`, `@types/three` (Unused)

### Removed — Tests & CI/CD

- 5 e2e test specs (drainage, gravity-walls, paving, modules-migration)
- DXF parser deploy job from GitHub Actions
- Removed `.github/` directory entirely (CI/CD to be added later)

### Removed — Build Artifacts

- `.turbo/` cache directories
- `coverage/` directories
- `dist/` directories
- `.vercel/` project configs

### Updated — Billing Hook

- `use-billing-data.ts`: Removed dependency on calculations API, now uses local state only
- TODO: Wire to dedicated billing persistence API

---

## [2026-03-18] Rename Geometrix → RevBrain

### Package Names

- `@geometrix/contract` → `@revbrain/contract`
- `@geometrix/database` → `@revbrain/database`
- `@geometrix/server` → `@revbrain/server`
- Root package: `geometrix` → `revbrain`

### Branding

- All UI text: `GEOMETRIX` / `Geometrix` → `REVBRAIN` / `RevBrain`
- Storage keys: `geometrix_*` → `revbrain_*`
- IndexedDB names: `geometrix-*` → `revbrain-*`

### Domains & Emails

- `geometrixlabs.com` → `revbrain.com`
- `geometrix.io` → `revbrain.io`
- `noreply@geometrixlabs.com` → `noreply@revbrain.com`
- `sales@geometrixlabs.com` → `sales@revbrain.com`

### Config

- `.env.example` updated
- `supabase/config.toml` updated
- `supabase/functions/import_map.json` updated
- `supabase/templates/*.html` updated (auth email templates)
- Shell scripts updated

---

## [2026-03-18] Role System Overhaul

### Old Roles (Geometrix — Construction)

| Role                  | Type       | Description               |
| --------------------- | ---------- | ------------------------- |
| `system_admin`        | System     | Platform super admin      |
| `contractor_ceo`      | Contractor | CEO / org admin           |
| `contractor_pm`       | Contractor | Project Manager           |
| `execution_engineer`  | Contractor | Execution Engineer        |
| `quantity_surveyor`   | Contractor | Quantity Surveyor         |
| `quality_controller`  | Contractor | Quality Controller        |
| `client_owner`        | Client     | Project Owner / org admin |
| `client_pm`           | Client     | Project Manager (Client)  |
| `inspector`           | Client     | Inspector                 |
| `quality_assurance`   | Client     | Quality Assurance         |
| `accounts_controller` | Client     | Accounts Controller       |

### New Roles (RevBrain — Revenue Operations)

| Role           | Scope        | Description                              |
| -------------- | ------------ | ---------------------------------------- |
| `system_admin` | Global       | Platform super admin                     |
| `org_owner`    | Organization | Tenant owner, billing, full access       |
| `admin`        | Organization | Full operational access, all projects    |
| `operator`     | Project      | Does migration work on assigned projects |
| `reviewer`     | Project      | View-only + remarks on assigned projects |

### Changes Made (Code)

- Updated contract types: role constants, schemas, helper functions
- Removed `OrganizationType` (`contractor` / `client`) distinction
- Removed `UserGroup` type and `getRoleGroup()` function
- Updated RBAC middleware (`canInviteRole` simplified)
- Updated all client components with role checks
- Updated mock data, translations, invite flow
- Updated auth store default role fallback

### Pending — Database Migration

When connecting to Supabase, the following SQL migration is needed:

```sql
-- Update existing user roles to new values
-- (Map old roles to closest new equivalents)
UPDATE users SET role = 'org_owner' WHERE role IN ('contractor_ceo', 'client_owner');
UPDATE users SET role = 'admin' WHERE role IN ('contractor_pm', 'client_pm');
UPDATE users SET role = 'operator' WHERE role IN ('execution_engineer', 'quantity_surveyor', 'inspector');
UPDATE users SET role = 'reviewer' WHERE role IN ('quality_controller', 'quality_assurance', 'accounts_controller');

-- Remove org type column from organizations (no longer contractor/client split)
-- ALTER TABLE organizations DROP COLUMN IF EXISTS type;

-- The users.is_org_admin column can be derived from role = 'org_owner'
-- Consider removing it or keeping for backward compat
```

### Pending — Project Membership Table

The `operator` and `reviewer` roles are project-scoped. A new table is needed:

```sql
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('operator', 'reviewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
```

---

## Pending — Database Migrations Summary

These changes exist in the Drizzle schema code but have **not yet been applied** to any database. They will be applied when connecting to a Supabase project.

1. **Drop tables**: `walls`, `paving_areas`, `earthwork_calculations`, `calculation_results`, `module_spreadsheets`
2. **Update user roles**: Map old construction roles → new RevBrain roles
3. **Create `project_members` table**: For project-scoped role assignments
4. **Consider removing**: `organizations.type` column, `users.is_org_admin` column
