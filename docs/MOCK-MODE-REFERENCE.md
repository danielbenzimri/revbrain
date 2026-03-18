# Mock Mode System — Reference from Procure

> **Purpose**: Document the mock mode pattern from Procure so we can implement the same system in RevBrain.
>
> **Source**: `/Users/danielaviram/repos/Procure`

---

## How It Works

### Activation

A single environment variable `USE_MOCK_DATA=true` controls the entire system. Combined with `AUTH_MODE=mock` and absence of `DATABASE_URL`, the server runs entirely in-memory with no external dependencies.

```bash
# .env.local (full mock mode — no DB, no auth service)
USE_MOCK_DATA=true
AUTH_MODE=mock
# DATABASE_URL intentionally absent

# .env.dev (real mode — connects to Supabase)
USE_MOCK_DATA=false
AUTH_MODE=jwt
DATABASE_URL=postgresql://...
```

### Server-Side Architecture

```
Request → Auth Middleware → Route Handler → Mock or Real
                ↓                              ↓
          AUTH_MODE=mock              if (useMockData()) {
          → mock user from             return MOCK_DATA
            header/default            } else {
          AUTH_MODE=jwt                return db.query(...)
          → Supabase JWT              }
```

**Key design decisions:**

1. **Same routes** — no separate `/mock/` endpoints. Every route checks `useMockData()` and branches.
2. **No dependency injection** — each route handler has an inline `if (useMockData())` check. Simple, visible, debuggable.
3. **In-memory data** — mock data is TypeScript constants imported from `src/mocks/*.mock.ts`. No HTTP calls, instant responses.
4. **Mock service layer** — a `MockDataService` class provides query methods (filtering, pagination, aggregation) that mirror the real repository API.

### Route Handler Pattern

Every route follows this pattern:

```typescript
import { MOCK_SUPPLIERS } from '../../mocks/suppliers.mock';

const useMockData = () => {
  const envMock = getEnv('USE_MOCK_DATA', 'true') === 'true';
  return isRunningMockMode() && envMock;
};

router.openapi(listRoute, async (c) => {
  if (useMockData()) {
    let items = [...MOCK_SUPPLIERS];
    // Apply same filters as real query
    if (status) items = items.filter((s) => s.status === status);
    const total = items.length;
    items = items.slice(offset, offset + limit);
    return c.json({ success: true, data: { items, total, hasMore: offset + limit < total } });
  }

  // Real database query
  const repos = c.get('repos');
  const result = await repos.suppliers.findByTenant(tenantId, { status, limit, offset });
  return c.json({ success: true, data: result });
});
```

### Mock Auth

When `AUTH_MODE=mock`:

- Auth middleware reads `X-Mock-User-Email` header (or defaults to admin)
- Returns a hardcoded user from `MOCK_USERS` dictionary
- No JWT validation, no Supabase calls

```typescript
// In auth middleware
if (authMode === 'mock') {
  const email = c.req.header('X-Mock-User-Email') || 'admin@acme.com';
  const mockUser = MOCK_USERS[email];
  c.set('user', mockUser);
  return next();
}
```

### Client-Side Mock

- `VITE_AUTH_MODE=mock` detected in React providers
- `initializeMockAuth()` auto-logs in with `MOCK_USERS.admin`
- Role switching via `window.setDevRole('buyer')` in browser console
- LocalStorage persistence so dev doesn't re-login on refresh

---

## Mock Data Structure

### Files (12 mock data files in `src/mocks/`)

| File                      | Entity            | Count | Depth                                                             |
| ------------------------- | ----------------- | ----- | ----------------------------------------------------------------- |
| `suppliers.mock.ts`       | Suppliers         | 10    | Full business context (contracts, catalog, incidents, compliance) |
| `purchase-orders.mock.ts` | Purchase Orders   | 9     | Line items with qty, price, production status                     |
| `signals.mock.ts`         | Risk Signals      | 20+   | Types, severity, decision context                                 |
| `invoices.mock.ts`        | Invoices          | 3     | 3-way matching (PO/GRN/Invoice)                                   |
| `dashboard.mock.ts`       | Dashboard KPIs    | 1     | Aggregated metrics for home screen                                |
| `agents.mock.ts`          | AI Agent profiles | —     | Activity logs, autonomy levels                                    |
| `contracts.mock.ts`       | Legal agreements  | —     | MSA, NDA, SLA with extracted clauses                              |
| `shipments.mock.ts`       | Shipments         | —     | Tracking, coordinates, ETAs                                       |
| `ledger.mock.ts`          | Financial ledger  | —     | SKU-level line items                                              |
| `documents.mock.ts`       | Smart documents   | —     | Lifecycle phases, completion %                                    |
| `risks.mock.ts`           | Global risks      | —     | Categories, probability/impact                                    |
| `playbooks.mock.ts`       | Action strategies | —     | Workflow steps, conditions                                        |

### Data Realism

- Relational IDs for cross-references (`s-001`, `po-2024-001`)
- Realistic business metrics (OTD 98%, quality 99.9%)
- Temporal data with date helpers (`MINS_AGO(5)`, `TEN_DAYS_AGO`)
- Status enums matching real database schema
- Nested relationships (supplier → contracts → clauses)
- Currency, geolocation, compliance tracking

### Mock Data Service

A centralized `MockDataService` class provides 21+ query methods:

```typescript
interface MockDataService {
  getSuppliers(tenantId?: string): SupplierExtended[];
  getSupplierById(id: string): SupplierExtended | undefined;
  getSuppliersPaginated(options): PaginatedResult<SupplierExtended>;
  getPurchaseOrders(): PurchaseOrderExtended[];
  getSignals(): SignalExtended[];
  getSupplierWithSignals(id: string): SupplierWithSignals;
  // ... 15 more methods
}
```

---

## Database Seeder

Separate from mock data. A `seed.ts` script populates a real database with minimal starter data:

```bash
pnpm db:seed  # runs tsx src/seed.ts
```

Seeds: 1 tenant, 1 admin user, 4 suppliers. This is for database testing, not for demo. The rich demo experience comes from mock data files.

---

## What to Implement in RevBrain

### Phase 1: Server Mock Mode

1. Add `USE_MOCK_DATA` and `AUTH_MODE` env vars
2. Create `src/mocks/` directory with mock data files
3. Create `useMockData()` helper
4. Add mock branch to each route handler
5. Update auth middleware for mock mode

### Phase 2: Mock Data for RevBrain Entities

- **Organizations** — 2 orgs (Acme Corp, Beta Inc)
- **Users** — 1 per role (system_admin, org_owner, admin, operator, reviewer)
- **Projects** — 3-4 migration projects at different stages
- **Project Members** — operator/reviewer assignments
- **Dashboard metrics** — project progress, migration stats

### Phase 3: Client Mock Mode

- Auto-login with mock user on `VITE_AUTH_MODE=mock`
- Role switcher in dev mode
- Window helpers for debugging

### Phase 4: Database Seeder

- `pnpm db:seed` for minimal real-DB testing data
- Separate from mock data (mock = in-memory, seed = database)

---

## Key Design Principles from Procure

1. **One flag controls everything** — `USE_MOCK_DATA=true` is the single source of truth
2. **Same routes, different data source** — no mock-specific API endpoints
3. **Mock data is rich and realistic** — not just `{ name: "test" }` stubs
4. **In-memory, no dependencies** — mock mode needs no DB, no auth service, no network
5. **Filtering/pagination works** — mock service replicates real query behavior
6. **Client and server aligned** — both use the same env var convention
7. **Instant startup** — server boots in <1s in mock mode (no DB connection wait)
