# Geometrix

> **High-performance, vendor-agnostic full-stack application with hexagonal architecture**

Geometrix achieves "Day 1 Velocity without sacrificing Year 2 Scalability" by combining the speed of Backend-as-a-Service (Supabase) with the architectural rigor of a custom microservices platform.

## 🎯 Core Philosophy

We reject the binary choice between "Speed" and "Quality." Instead, we:

- ✅ **Use Supabase** for undifferentiated infrastructure (Auth, Postgres, Edge Runtime)
- ✅ **Don't Trust Supabase** - Core business logic never imports vendor SDKs directly
- ✅ **Stay Vendor Agnostic** - Can migrate to AWS/GCP/Azure in 1-2 days

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  ADAPTER LAYER (Infrastructure)                             │
│  ├─ Supabase Edge Functions (Deno)                         │
│  ├─ AWS Lambda (Node.js) ← Alternative                     │
│  └─ Docker Container ← Alternative                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  INTERFACE LAYER (API)                                      │
│  ├─ Hono (Standard HTTP)                                   │
│  ├─ Routing & Validation (Zod)                             │
│  ├─ Authentication (JWT)                                   │
│  └─ Rate Limiting                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  CORE LAYER (Business Logic)                               │
│  ├─ Services (Pure Logic)                                  │
│  ├─ Database (Drizzle ORM)                                 │
│  └─ Shared Contracts (Zod Schemas)                         │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Repository Structure

```
geometrix/
├── apps/
│   ├── server/          # Hono backend (vendor-agnostic)
│   └── client/          # React frontend (to be implemented)
├── packages/
│   ├── contract/        # Shared types & Zod schemas
│   ├── database/        # Drizzle ORM & migrations
│   └── ui/              # Design system (to be implemented)
├── providers/
│   └── supabase/        # Supabase-specific config
├── supabase/
│   ├── config.toml      # Supabase project config
│   └── functions/
│       ├── import_map.json  # Deno module resolution
│       └── api/             # Edge Function adapter
└── turbo.json           # Monorepo build pipeline
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0
- **pnpm** ≥ 8.0.0
- **Supabase CLI** ([Install](https://supabase.com/docs/guides/cli))
- **Docker** (for local Supabase)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd geometrix

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start local Supabase (includes Postgres, Auth, Edge Functions)
supabase start

# Generate database migrations
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### Verify Installation

```bash
# Health check
curl http://localhost:54321/functions/v1/api/v1/health

# Expected response:
# {"status":"ok","env":"development","timestamp":"...","region":"local"}
```

## 🔧 Development Workflow

### Running Locally

```bash
# Terminal 1: Supabase (Postgres + Auth + Edge Functions)
supabase start

# Terminal 2: Watch mode for backend changes
pnpm dev
```

The API will be available at:

- **Edge Function**: `http://localhost:54321/functions/v1/api`
- **Supabase Studio**: `http://localhost:54323`

### Database Migrations

```bash
# 1. Modify schema in packages/database/src/schema.ts

# 2. Generate migration SQL
pnpm db:generate

# 3. Review generated SQL in packages/database/drizzle/

# 4. Apply migration
pnpm db:migrate

# 5. Open Drizzle Studio to verify
cd packages/database
pnpm db:studio
```

### Testing

```bash
# Run all tests
pnpm test

# Unit tests only (fast, mocked database)
pnpm test:unit

# Integration tests (requires local Supabase)
pnpm test:integration

# Watch mode
pnpm test -- --watch
```

## 🔐 Security Features

### 1. Rate Limiting

- **Auth endpoints**: 10 requests/minute
- **API endpoints**: 1000 requests/minute
- Uses client IP for key generation

### 2. CORS Protection

```typescript
// Configured in apps/server/src/index.ts
origin: [
  'https://app.geometrixlabs.com', // Production
  'http://localhost:5173', // Development
];
```

### 3. Row-Level Security (RLS)

All tables have `deny_all` policy by default. Enable specific policies in Supabase Studio.

### 4. Structured Logging

Every request logs:

- Unique request ID
- Method, path, status
- Duration in milliseconds
- User agent

## 📦 Deployment

### Production Deployment

```bash
# 1. Set environment variables in Supabase Dashboard
# - DATABASE_URL (use port 6543 for pooler!)
# - SUPABASE_SERVICE_ROLE_KEY

# 2. Apply database migrations
pnpm db:migrate

# 3. Deploy Edge Function
supabase functions deploy api --project-ref <your-project-ref>

# 4. Verify deployment
curl https://<project-ref>.supabase.co/functions/v1/api/v1/health
```

### CI/CD (GitHub Actions)

See `.github/workflows/deploy.yml` for automated deployment pipeline:

1. Lint & Type Check
2. Run Tests
3. Apply Migrations
4. Deploy Backend
5. Deploy Frontend

## 🔄 Vendor Migration (Exit Strategy)

If you need to leave Supabase:

### Option 1: AWS

```bash
# 1. Database: Switch to RDS
export DATABASE_URL="postgresql://user:pass@rds-endpoint:6543/db"
pnpm db:migrate

# 2. Compute: Deploy to App Runner
docker build -t geometrix-api apps/server
aws apprunner create-service --source-configuration file://apprunner.json

# 3. Auth: Update middleware
# Edit apps/server/src/middleware/auth.ts to use Clerk/Auth0
```

### Option 2: Self-Hosted

```bash
# 1. Run Postgres anywhere
docker run -p 5432:5432 postgres:15

# 2. Run API in Docker
docker build -t geometrix-api .
docker run -p 3000:3000 geometrix-api

# 3. Update auth middleware
```

**Impact**: 3-5 files to modify, 1-2 days for experienced team.

## 🧪 Testing Strategy

### Unit Tests (Vitest)

- **Target**: 100% coverage of business logic
- **Speed**: <50ms per test
- **Mocking**: Database layer mocked

```typescript
// Example: apps/server/src/v1/services/__tests__/example.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('ProfileService', () => {
  it('should create a profile', async () => {
    // Test implementation
  });
});
```

### Integration Tests

- **Target**: API routes + real database
- **Environment**: Local Supabase container
- **Coverage**: Authentication, CRUD operations

## 📊 Monitoring & Observability

### Structured Logs

All logs are JSON-formatted for easy parsing:

```json
{
  "level": "info",
  "requestId": "uuid",
  "method": "POST",
  "path": "/v1/profiles",
  "status": 201,
  "duration_ms": 45,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Health Checks

- **Endpoint**: `/v1/health`
- **Use**: Load balancer health checks, uptime monitoring

### Error Tracking

- All errors include request ID for tracing
- Stack traces logged server-side only
- Client receives sanitized error messages

## 🎓 Key Concepts

### Hexagonal Architecture

- **Core**: Business logic (services, domain models)
- **Ports**: Interfaces (HTTP routes, database contracts)
- **Adapters**: Infrastructure (Supabase, AWS, etc.)

### Vendor Agnostic Design

- Core logic imports from `@geometrix/contract`, not `@supabase/supabase-js`
- Infrastructure adapters are thin wrappers
- Swapping vendors = updating adapters only

### Type Safety

- Zod schemas define API contracts
- TypeScript types inferred from schemas
- Client and server share same types

## 📚 Additional Resources

- [Hono Documentation](https://hono.dev)
- [Drizzle ORM](https://orm.drizzle.team)
- [Supabase Docs](https://supabase.com/docs)
- [Turborepo Guide](https://turbo.build/repo/docs)

## 🤝 Contributing

1. Create a feature branch
2. Make changes
3. Run tests: `pnpm test`
4. Submit PR

## 📄 License

MIT

---

**Built with ❤️ using Hexagonal Architecture**
