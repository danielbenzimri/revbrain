# Legacy Module Migration Specification

## 1. Overview

### 1.1 Goal

Migrate 17+ engineering calculation modules from the legacy client to the new SaaS platform using a "Lift and Shift" strategy - minimal code changes, maximum functionality preservation.

### 1.2 Strategy

- **Phase 1**: Create adapter infrastructure (data transformation layer)
- **Phase 2**: Migrate first module as proof of concept
- **Phase 3**: Parallel migration of remaining modules
- **Phase 4**: Incremental refactoring (post-migration)

### 1.3 Principles

1. Preserve calculation logic exactly as-is
2. Only modify data loading/saving touch points
3. Use lazy loading for bundle optimization
4. Maintain backward compatibility with legacy data formats

---

## 2. Architecture

### 2.1 Component Hierarchy

```
ProjectDetailPage
└── TabsContent value="modules"
    └── ModulesTab
        ├── ModuleSelector (grid of available modules)
        └── LegacyModuleWrapper
            ├── Data fetching (React Query hooks)
            ├── Data transformation (legacy ↔ new format)
            └── LegacyModule (lazy loaded)
                └── Original legacy component (minimal changes)
```

### 2.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        New SaaS Platform                         │
├─────────────────────────────────────────────────────────────────┤
│  React Query Hooks                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ useProject()    │  │ useBOQItems()   │  │ useCalcResults()│ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │           │
│           ▼                    ▼                    ▼           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              LegacyDataAdapter                            │  │
│  │  • transformToLegacyProject()                            │  │
│  │  • transformToLegacyBOQ()                                │  │
│  │  • transformFromLegacyCalcResults()                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│           │                    │                    │           │
│           ▼                    ▼                    ▼           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Legacy Module (e.g., PavingView)            │  │
│  │  • Receives: projectData, boqItems, callbacks            │  │
│  │  • Returns: calculation results via onSave callback      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

### 3.1 New Table: `calculation_results`

```sql
CREATE TABLE calculation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Module identification
  module_type VARCHAR(50) NOT NULL,  -- 'landscaping', 'earthworks', 'paving', etc.
  module_version INTEGER DEFAULT 1,   -- For future schema migrations

  -- The actual calculation data (preserved exactly as legacy format)
  data JSONB NOT NULL,

  -- Metadata
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Ensure one result per module per project
  UNIQUE(project_id, module_type)
);

-- RLS Policy
ALTER TABLE calculation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their org calculation results"
  ON calculation_results FOR ALL
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

-- Index for fast lookups
CREATE INDEX idx_calc_results_project ON calculation_results(project_id);
CREATE INDEX idx_calc_results_module ON calculation_results(project_id, module_type);
```

### 3.2 Module Types Enum

```typescript
type ModuleType =
  | 'landscaping' // LandscapingView (1MB)
  | 'bezeq' // BezeqView (telecom)
  | 'earthworks' // EarthworksView
  | 'demolition' // DemolitionView
  | 'curb' // CurbEditor
  | 'paving' // PavingView
  | 'gardening' // GardeningView
  | 'irrigation' // IrrigationSchematicEditor
  | 'gravity_walls' // GravityWallsView
  | 'reinforced_walls' // ReinforcedWallsView
  | 'cladding_walls' // CladdingWallsView
  | 'piles' // PilesView
  | 'rock_bolts' // RockBoltsView
  | 'concrete_columns' // ConcreteColumnsView
  | 'exceptions' // ExceptionsView
  | 'regie' // RegieView
  | 'traffic_signs' // TrafficSignsView
  | 'pipes'; // PipesModule
```

---

## 4. Type Mappings

### 4.1 ProjectMetadata (Legacy → New)

```typescript
// Legacy format (types.ts)
interface LegacyProjectMetadata {
  name: string;
  contractNumber: string;
  contractorName: string;
  clientName: string;
  startDate: string;
  status: 'active' | 'completed' | 'hold';
  workOrderDate: string;
  originalDuration: number;
  originalScope: number;
  discountRate: number;
  discountType: 'global' | 'per_chapter';
  chapterDiscounts?: { [chapterCode: string]: number };
  logoClientUrl?: string;
  logoContractorUrl?: string;
}

// New format (from API)
interface Project {
  id: string;
  name: string;
  contractNumber: string | null;
  contractorName: string | null;
  clientName: string | null;
  startDate: string | null;
  endDate: string | null;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled';
  contractValueCents: number;
  globalDiscountPercent: number;
  chapterDiscounts: Record<string, number> | null;
  // ... other fields
}

// Transformation function
function transformToLegacyProject(project: Project): LegacyProjectMetadata {
  return {
    name: project.name,
    contractNumber: project.contractNumber || '',
    contractorName: project.contractorName || '',
    clientName: project.clientName || '',
    startDate: project.startDate || '',
    status:
      project.status === 'on_hold'
        ? 'hold'
        : project.status === 'cancelled'
          ? 'completed'
          : project.status,
    workOrderDate: project.startDate || '',
    originalDuration: 12, // Default, could add to project schema
    originalScope: project.contractValueCents / 100,
    discountRate: project.globalDiscountPercent,
    discountType: project.chapterDiscounts ? 'per_chapter' : 'global',
    chapterDiscounts: project.chapterDiscounts || undefined,
  };
}
```

### 4.2 BOQItem (Legacy ↔ New)

```typescript
// Legacy format
interface LegacyBOQItem {
  code: string; // e.g., "01.02.03.004"
  description: string;
  unit: string;
  contractQuantity: number;
  unitPrice: number;
}

// New format (from API)
interface BOQItem {
  id: string;
  projectId: string;
  parentId: string | null;
  code: string;
  description: string;
  unit: string | null;
  contractQuantity: number;
  unitPriceCents: number;
  // ... hierarchy fields
}

// Transformation (bidirectional)
function transformToLegacyBOQ(items: BOQItem[]): LegacyBOQItem[] {
  return items.map((item) => ({
    code: item.code,
    description: item.description,
    unit: item.unit || '',
    contractQuantity: item.contractQuantity,
    unitPrice: item.unitPriceCents / 100,
  }));
}

function transformFromLegacyBOQ(items: LegacyBOQItem[], projectId: string): Partial<BOQItem>[] {
  return items.map((item) => ({
    projectId,
    code: item.code,
    description: item.description,
    unit: item.unit,
    contractQuantity: item.contractQuantity,
    unitPriceCents: Math.round(item.unitPrice * 100),
  }));
}
```

---

## 5. API Endpoints

### 5.1 Calculation Results CRUD

```typescript
// GET /v1/projects/:projectId/calculations
// Returns all calculation results for a project
interface GetCalculationsResponse {
  calculations: {
    id: string;
    moduleType: ModuleType;
    data: unknown; // Module-specific JSONB
    updatedAt: string;
  }[];
}

// GET /v1/projects/:projectId/calculations/:moduleType
// Returns specific module calculation
interface GetCalculationResponse {
  calculation: {
    id: string;
    moduleType: ModuleType;
    data: unknown;
    updatedAt: string;
  } | null;
}

// PUT /v1/projects/:projectId/calculations/:moduleType
// Create or update calculation results
interface SaveCalculationRequest {
  data: unknown; // The entire module state as JSONB
}

interface SaveCalculationResponse {
  calculation: {
    id: string;
    moduleType: ModuleType;
    updatedAt: string;
  };
}

// DELETE /v1/projects/:projectId/calculations/:moduleType
// Clear calculation results for a module
```

---

## 6. Frontend Implementation

### 6.1 File Structure

```
apps/client/src/features/legacy/
├── components/
│   ├── LegacyModuleWrapper.tsx    # Data fetching + transformation wrapper
│   ├── ModulesTab.tsx             # Module selection grid
│   ├── ModuleCard.tsx             # Individual module card
│   └── ModuleLoadingState.tsx     # Skeleton/loading UI
├── hooks/
│   ├── use-calculation-results.ts # React Query hooks for calc results
│   ├── use-legacy-adapter.ts      # Data transformation hooks
│   └── use-module-registry.ts     # Available modules registry
├── modules/                       # Lazy-loaded legacy modules
│   ├── index.ts                   # Dynamic imports
│   ├── GardeningView.tsx          # Copied from legacy (with minimal changes)
│   ├── PavingView.tsx
│   ├── EarthworksView.tsx
│   └── ... (other modules)
├── types/
│   ├── legacy-types.ts            # Copied from legacy types.ts
│   └── module-registry.ts         # Module metadata types
└── utils/
    ├── transform-project.ts       # Project data transformations
    ├── transform-boq.ts           # BOQ transformations
    └── transform-calculations.ts  # Calculation result transformations
```

### 6.2 Module Registry

```typescript
// features/legacy/types/module-registry.ts
import { LucideIcon } from 'lucide-react';

export interface ModuleDefinition {
  type: ModuleType;
  name: string;
  nameHe: string;
  description: string;
  icon: LucideIcon;
  category: 'infrastructure' | 'landscaping' | 'structures' | 'utilities' | 'other';
  size: 'small' | 'medium' | 'large'; // For loading indicator
  requiredData: ('project' | 'boq' | 'bills')[];
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

// features/legacy/hooks/use-module-registry.ts
export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    type: 'gardening',
    name: 'Gardening',
    nameHe: 'גינון והשקיה',
    description: 'Irrigation systems and planting calculations',
    icon: Flower,
    category: 'landscaping',
    size: 'small',
    requiredData: ['project', 'boq'],
    component: lazy(() => import('../modules/GardeningView')),
  },
  {
    type: 'paving',
    name: 'Paving',
    nameHe: 'ריצוף',
    description: 'Paving and surface calculations',
    icon: Grid3X3,
    category: 'infrastructure',
    size: 'medium',
    requiredData: ['project', 'boq'],
    component: lazy(() => import('../modules/PavingView')),
  },
  // ... etc
];
```

### 6.3 LegacyModuleWrapper Component

```typescript
// features/legacy/components/LegacyModuleWrapper.tsx
import { Suspense } from 'react';
import { useProject } from '@/features/projects/hooks/use-project-api';
import { useBOQItems } from '@/features/boq/hooks/use-boq';
import { useCalculationResult, useSaveCalculation } from '../hooks/use-calculation-results';
import { transformToLegacyProject, transformToLegacyBOQ } from '../utils';
import { ModuleDefinition } from '../types/module-registry';
import { ModuleLoadingState } from './ModuleLoadingState';

interface Props {
  projectId: string;
  module: ModuleDefinition;
  onClose: () => void;
}

export function LegacyModuleWrapper({ projectId, module, onClose }: Props) {
  // Fetch data from new API
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: boqData, isLoading: boqLoading } = useBOQItems(projectId);
  const { data: calcResult } = useCalculationResult(projectId, module.type);
  const saveMutation = useSaveCalculation();

  // Transform to legacy format
  const legacyProject = project ? transformToLegacyProject(project) : null;
  const legacyBOQ = boqData?.items ? transformToLegacyBOQ(boqData.items) : [];

  // Save handler - stores calculation results to API
  const handleSave = async (data: unknown) => {
    await saveMutation.mutateAsync({
      projectId,
      moduleType: module.type,
      data,
    });
  };

  // Auto-save on changes (debounced)
  const handleAutoSave = useDebouncedCallback(handleSave, 2000);

  if (projectLoading || boqLoading) {
    return <ModuleLoadingState moduleName={module.nameHe} size={module.size} />;
  }

  if (!project || !legacyProject) {
    return <div>Project not found</div>;
  }

  const ModuleComponent = module.component;

  return (
    <div className="h-full">
      {/* Header with close button */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <module.icon className="h-6 w-6" />
          <h2 className="text-xl font-bold">{module.nameHe}</h2>
        </div>
        <Button variant="ghost" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Legacy module */}
      <Suspense fallback={<ModuleLoadingState moduleName={module.nameHe} size={module.size} />}>
        <ModuleComponent
          projectData={legacyProject}
          boqItems={legacyBOQ}
          initialData={calcResult?.data}
          onSave={handleSave}
          onAutoSave={handleAutoSave}
        />
      </Suspense>
    </div>
  );
}
```

### 6.4 ModulesTab Component

```typescript
// features/legacy/components/ModulesTab.tsx
import { useState } from 'react';
import { MODULE_REGISTRY } from '../hooks/use-module-registry';
import { ModuleCard } from './ModuleCard';
import { LegacyModuleWrapper } from './LegacyModuleWrapper';
import { ModuleDefinition } from '../types/module-registry';

interface Props {
  projectId: string;
}

export function ModulesTab({ projectId }: Props) {
  const [activeModule, setActiveModule] = useState<ModuleDefinition | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = [
    { id: 'all', name: 'הכל', nameEn: 'All' },
    { id: 'infrastructure', name: 'תשתיות', nameEn: 'Infrastructure' },
    { id: 'landscaping', name: 'גינון', nameEn: 'Landscaping' },
    { id: 'structures', name: 'מבנים', nameEn: 'Structures' },
    { id: 'utilities', name: 'מערכות', nameEn: 'Utilities' },
  ];

  const filteredModules = categoryFilter === 'all'
    ? MODULE_REGISTRY
    : MODULE_REGISTRY.filter(m => m.category === categoryFilter);

  // If a module is active, show full-screen module view
  if (activeModule) {
    return (
      <LegacyModuleWrapper
        projectId={projectId}
        module={activeModule}
        onClose={() => setActiveModule(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Category filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map(cat => (
          <Button
            key={cat.id}
            variant={categoryFilter === cat.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter(cat.id)}
          >
            {cat.name}
          </Button>
        ))}
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredModules.map(module => (
          <ModuleCard
            key={module.type}
            module={module}
            projectId={projectId}
            onClick={() => setActiveModule(module)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 7. Module Migration Checklist

### 7.1 Per-Module Changes Required

For each legacy module, the following changes are needed:

| Change                  | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| Remove localStorage     | Replace `localStorage.getItem/setItem` with props    |
| Remove contexts         | Replace `useCalculationResults()` with props         |
| Add onSave callback     | Call `props.onSave(data)` when state changes         |
| Add onAutoSave callback | Call `props.onAutoSave(data)` on significant changes |
| Accept initialData prop | Initialize state from `props.initialData`            |
| Fix imports             | Update any incompatible imports                      |
| Remove user switching   | Use `currentUser` from props if needed               |

### 7.2 Module-Specific Props Interface

```typescript
// Standard props interface for all legacy modules
interface LegacyModuleProps {
  // Required data
  projectData: LegacyProjectMetadata;
  boqItems: LegacyBOQItem[];

  // Module state persistence
  initialData?: unknown; // Previous calculation state
  onSave: (data: unknown) => void; // Save to server
  onAutoSave?: (data: unknown) => void; // Debounced auto-save

  // Optional (module-specific)
  currentUser?: LegacyUser;
  bills?: LegacyBill[];
  quantityPages?: QuantityPage[];
  onUpdateQuantityPages?: (pages: QuantityPage[]) => void;
  exceptionsCalculations?: ExceptionItemCalculation[];
}
```

---

## 8. Migration Order

### Phase 2: First Module (Proof of Concept)

1. **GardeningView** - Small (20KB), good test case

### Phase 3a: Simple Modules

2. PipesModule - Part of GardeningView
3. TrafficSignsView - Simple calculations
4. RegieView - Day labor tracking

### Phase 3b: Medium Modules

5. PavingView - Common, visual
6. CurbEditor - 3D component test
7. GravityWallsView - Wall calculations
8. ReinforcedWallsView - Similar to gravity walls
9. CladdingWallsView - Similar structure

### Phase 3c: Complex Modules

10. EarthworksView (300KB) - Volume calculations
11. DemolitionView (246KB) - Tracking
12. ExceptionsView (107KB) - Special items
13. ConcreteColumnsView - Structural
14. PilesView - Foundation
15. RockBoltsView - Geotechnical

### Phase 3d: Heavy Modules

16. BezeqView (338KB) - Telecom infrastructure
17. LandscapingView (1MB) - Full landscaping suite
18. IrrigationSchematicEditor - Complex UI

### Phase 3e: 3D/CAD Viewers

19. LeafletDxfViewer (265KB)
20. ThreeDViewer components

---

## 9. Testing Strategy

### 9.1 Unit Tests

- Test data transformations (legacy ↔ new)
- Test module registry configuration
- Test React Query hooks

### 9.2 Integration Tests

- Test module loading with real project data
- Test save/load cycle
- Test auto-save functionality

### 9.3 Visual Regression Tests

- Compare legacy vs migrated module output
- Test with known calculation inputs

### 9.4 E2E Tests

```typescript
// e2e/legacy-modules.spec.ts
test('can load and use gardening module', async ({ page }) => {
  await page.goto('/projects/test-project?tab=modules');

  // Select module
  await page.click('text=גינון והשקיה');

  // Wait for module to load
  await expect(page.locator('.gardening-view')).toBeVisible();

  // Make a change
  await page.fill('[data-testid="quantity-input"]', '100');

  // Verify auto-save
  await expect(page.locator('text=Saved')).toBeVisible({ timeout: 5000 });

  // Reload and verify persistence
  await page.reload();
  await page.click('text=גינון והשקיה');
  await expect(page.locator('[data-testid="quantity-input"]')).toHaveValue('100');
});
```

---

## 10. Rollout Plan

### Week 1: Infrastructure

- [ ] Create database migration
- [ ] Create API endpoints
- [ ] Create React Query hooks
- [ ] Create data transformation utilities
- [ ] Create LegacyModuleWrapper component
- [ ] Create ModulesTab component
- [ ] Add "Modules" tab to ProjectDetailPage

### Week 2: First Module + Simple Modules

- [ ] Migrate GardeningView (proof of concept)
- [ ] Test full save/load cycle
- [ ] Migrate PipesModule, TrafficSignsView, RegieView

### Week 3: Medium Modules

- [ ] Migrate PavingView, CurbEditor
- [ ] Migrate wall modules (Gravity, Reinforced, Cladding)

### Week 4: Complex + Heavy Modules

- [ ] Migrate EarthworksView, DemolitionView
- [ ] Migrate BezeqView, LandscapingView

### Week 5: 3D Viewers + Polish

- [ ] Migrate LeafletDxfViewer
- [ ] Integration testing
- [ ] Performance optimization
- [ ] Documentation

---

## 11. Success Criteria

1. **Functionality**: All migrated modules produce identical calculation results
2. **Performance**: Module load time < 3s on 4G connection
3. **Persistence**: Data correctly saves and loads from server
4. **Multi-tenancy**: Data properly isolated per organization
5. **UX**: Seamless transition between new UI and legacy modules

---

## 12. Risks and Mitigations

| Risk                   | Impact               | Mitigation                      |
| ---------------------- | -------------------- | ------------------------------- |
| Large bundle sizes     | Slow loading         | Lazy loading + code splitting   |
| Context dependencies   | Migration complexity | Create adapter layer            |
| localStorage conflicts | Data loss            | Clear migration, fallback logic |
| 3D library issues      | Visual bugs          | Test thoroughly, fallback views |
| Hebrew/RTL issues      | Display problems     | Preserve existing RTL handling  |

---

## Appendix A: Legacy Types Reference

See: `apps/client-legacy/types.ts` for full type definitions.

## Appendix B: Module Dependency Map

```
GardeningView
├── PipesModule (embedded)
├── BOQItem[]
└── ProjectMetadata

PavingView
├── BOQItem[]
├── ProjectMetadata
└── QuantityPage[]

BillingView (already migrated)
├── Bill[]
├── BOQItem[]
├── ProjectMetadata
└── QuantityPage[]

LandscapingView (largest)
├── All GardeningView deps
├── All PavingView deps
├── IrrigationSchematicEditor
└── Multiple sub-modules
```
