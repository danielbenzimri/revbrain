# RevBrain Authentication System Specification

## Multi-Tenant Invite-Only Hybrid Architecture

> **Version**: 1.0  
> **Last Updated**: 2026-01-31  
> **Status**: Approved for Implementation

---

## 1. Executive Summary

RevBrain uses an **invite-only, multi-tenant authentication system** with a hybrid architecture:

- **Supabase Auth**: Handles credentials, password hashing, JWT generation, email delivery
- **Local PostgreSQL**: Stores business data (organizations, roles, permissions) via Drizzle ORM
- **Multi-Tenant**: Organizations have independent user pools with seat limits
- **Hierarchical Invites**: System admins onboard orgs, org admins invite their teams

---

## 2. Architecture Overview

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          REVBRAIN PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  system_admin   │     │  system_admin   │     │  system_admin   │       │
│  │  (Platform Ops) │     │                 │     │                 │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │ onboards              │                       │                │
│           ▼                       ▼                       ▼                │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  Organization   │     │  Organization   │     │  Organization   │       │
│  │  ABC Construct  │     │  XYZ Clients    │     │  123 Corp       │       │
│  │  (contractor)   │     │  (client)       │     │  (contractor)   │       │
│  │  Seats: 10/10   │     │  Seats: 3/5     │     │  Seats: 7/20    │       │
│  ├─────────────────┤     ├─────────────────┤     ├─────────────────┤       │
│  │ contractor_ceo  │     │ client_owner    │     │ contractor_ceo  │       │
│  │   ↓ invites     │     │   ↓ invites     │     │   ↓ invites     │       │
│  │ contractor_pm   │     │ client_pm       │     │ contractor_pm   │       │
│  │ exec_engineer   │     │ inspector       │     │ quantity_surv   │       │
│  │ quantity_surv   │     │                 │     │                 │       │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘       │
│           │                       │                       │                │
│           └───────────────────────┼───────────────────────┘                │
│                                   ▼                                        │
│                    ┌───────────────────────────────┐                       │
│                    │     Project: Tower Build      │                       │
│                    │     (Cross-Org Workspace)     │                       │
│                    │  Members from multiple orgs   │                       │
│                    └───────────────────────────────┘                       │
│                              (Phase 2)                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Technical Stack Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (apps/client)                               │
│                         React + Vite + TypeScript                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  LoginPage     │  SetPasswordPage  │  Dashboard  │  Admin: Onboard/Invite   │
│                │  (magic link)     │             │                          │
└───────┬────────┴─────────┬─────────┴──────┬──────┴────────────┬─────────────┘
        │                  │                │                   │
        │ signInWithPassword│ setSession()  │ Bearer token      │ API calls
        ▼                  ▼                ▼                   ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE AUTH SERVICE                               │
│  • Password hashing      • JWT generation       • Email delivery (magic links)│
│  • Token refresh         • Password reset       • Session management          │
└───────────────────────────────────────────────────────────────────────────────┘
        │                                                         ▲
        │ JWT Token                                               │ Admin SDK
        ▼                                                         │
┌───────────────────────────────────────────────────────────────────────────────┐
│                          BACKEND (apps/server)                                │
│                          Hono + TypeScript                                    │
├───────────────────────────────────────────────────────────────────────────────┤
│  Middleware:                    │  Endpoints:                                 │
│  • JWT verification (local)     │  • POST /v1/admin/onboard                  │
│  • RBAC (role-based access)     │  • POST /v1/org/invite                     │
│  • Rate limiting                │  • POST /v1/org/invite/resend              │
│  • Request logging              │  • POST /v1/auth/activate                  │
│                                 │  • GET  /v1/auth/me                        │
│                                 │  • GET  /v1/org/users                      │
└─────────────────────────────────┴─────────────────────────────────────────────┘
        │
        │ Drizzle ORM (@revbrain/database)
        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         LOCAL POSTGRESQL DATABASE                             │
│  • organizations (id, name, type, seat_limit, seat_used, ...)                │
│  • users (id, org_id, email, role, is_org_admin, is_active, ...)            │
│  • audit_logs (user_id, action, metadata, ...)                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. User Journeys

### 3.1 System Admin Onboards New Organization

```
1. system_admin logs into admin dashboard
2. Clicks "Onboard Organization"
3. Fills form: org name, type (contractor/client), seat limit, admin email, admin name
4. System creates org + invites first admin (atomic transaction)
5. First admin (CEO/Owner) receives magic link email
6. Admin clicks link → sets password → lands in dashboard as org admin
```

### 3.2 Org Admin Invites Team Member

```
1. contractor_ceo logs in
2. Goes to Settings → Team → Invite User
3. Enters email, name, role (limited to their org's role group)
4. System checks seat limit (hard fail with grace, or warning)
5. Creates user in Supabase + local DB (inactive)
6. Team member receives magic link email
7. Team member sets password → account activated → dashboard
```

### 3.3 Regular User Login

```
1. User goes to /login
2. Enters email + password
3. Supabase validates credentials → returns JWT
4. Frontend calls /v1/auth/me with JWT
5. Backend verifies JWT, checks isActive, returns user profile
6. User lands in dashboard
```

---

## 4. Data Model

### 4.1 Organizations Table

```typescript
// packages/database/src/schema.ts

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Identity
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(), // url-friendly

  // Type determines which roles are available
  type: varchar('type', { length: 50 }).notNull(), // 'contractor' | 'client'

  // Seat management
  seatLimit: integer('seat_limit').notNull().default(5),
  seatUsed: integer('seat_used').notNull().default(0),

  // Status
  isActive: boolean('is_active').notNull().default(true),

  // Audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'), // system_admin who onboarded
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationType = 'contractor' | 'client';
```

### 4.2 Users Table

```typescript
export const users = pgTable('users', {
  // Primary key
  id: uuid('id').primaryKey().defaultRandom(),

  // Link to Supabase Auth (CRITICAL: must be unique)
  supabaseUserId: uuid('supabase_user_id').notNull().unique(),

  // Organization membership
  organizationId: uuid('organization_id')
    .references(() => organizations.id)
    .notNull(),

  // Basic info
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),

  // Role within organization
  role: varchar('role', { length: 50 }).notNull(),
  // Values: 'system_admin' | contractor roles | client roles

  // Org admin flag (CEO/Owner can invite)
  isOrgAdmin: boolean('is_org_admin').notNull().default(false),

  // Account status
  isActive: boolean('is_active').notNull().default(false),

  // Relationships
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### 4.3 Audit Logs Table

```typescript
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Actor (null if system or unauthenticated)
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  organizationId: uuid('organization_id').references(() => organizations.id, {
    onDelete: 'set null',
  }),

  // Action
  action: varchar('action', { length: 100 }).notNull(),
  // Values: 'org.created', 'user.invited', 'user.activated', 'user.login',
  //         'user.logout', 'user.password_changed', 'invite.resent', 'user.deactivated'

  // Context
  targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),

  // Timestamp
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
```

### 4.4 Role Definitions

```typescript
// packages/contract/src/index.ts

// Organization types
export type OrganizationType = 'contractor' | 'client';

// Role groups
export const CONTRACTOR_ROLES = [
  'contractor_ceo',
  'contractor_pm',
  'execution_engineer',
  'quantity_surveyor',
  'quality_controller',
] as const;

export const CLIENT_ROLES = [
  'client_owner',
  'client_pm',
  'inspector',
  'quality_assurance',
  'accounts_controller',
] as const;

export const SYSTEM_ROLES = ['system_admin'] as const;

// All roles
export type ContractorRole = (typeof CONTRACTOR_ROLES)[number];
export type ClientRole = (typeof CLIENT_ROLES)[number];
export type SystemRole = (typeof SYSTEM_ROLES)[number];
export type UserRole = ContractorRole | ClientRole | SystemRole;

// Org admin roles (can invite)
export const ORG_ADMIN_ROLES: UserRole[] = ['contractor_ceo', 'client_owner'];

// Get roles available for an org type
export function getRolesForOrgType(type: OrganizationType): UserRole[] {
  return type === 'contractor' ? [...CONTRACTOR_ROLES] : [...CLIENT_ROLES];
}

// Get org type for a role
export function getOrgTypeForRole(role: UserRole): OrganizationType | null {
  if (CONTRACTOR_ROLES.includes(role as ContractorRole)) return 'contractor';
  if (CLIENT_ROLES.includes(role as ClientRole)) return 'client';
  return null;
}
```

---

## 5. Permission Matrix

### 5.1 Invite Permissions

| Actor            | Can Invite                                   | Constraints                          |
| ---------------- | -------------------------------------------- | ------------------------------------ |
| `system_admin`   | `contractor_ceo`, `client_owner`             | Creates org + first admin atomically |
| `contractor_ceo` | All contractor roles except `contractor_ceo` | Within own org, respects seat limit  |
| `client_owner`   | All client roles except `client_owner`       | Within own org, respects seat limit  |
| All other roles  | Nobody                                       | -                                    |

### 5.2 Seat Limit Enforcement

```typescript
const GRACE_SEATS = 1;

function checkSeatAvailability(org: Organization): {
  canInvite: boolean;
  warning?: string;
  seatsRemaining: number;
} {
  const remaining = org.seatLimit - org.seatUsed;

  if (remaining > GRACE_SEATS) {
    return { canInvite: true, seatsRemaining: remaining };
  }

  if (remaining > 0) {
    return {
      canInvite: true,
      warning: `Only ${remaining} seat(s) remaining. Consider upgrading.`,
      seatsRemaining: remaining,
    };
  }

  if (remaining > -GRACE_SEATS) {
    return {
      canInvite: true,
      warning: `⚠️ Seat limit exceeded. Please upgrade within 7 days.`,
      seatsRemaining: remaining,
    };
  }

  return {
    canInvite: false,
    warning: 'Seat limit reached. Upgrade your plan to invite more users.',
    seatsRemaining: remaining,
  };
}
```

---

## 6. API Specification

### 6.1 Endpoints Summary

| Method | Endpoint                | Auth       | Permission     | Description              |
| ------ | ----------------------- | ---------- | -------------- | ------------------------ |
| POST   | `/v1/admin/onboard`     | Required   | `system_admin` | Create org + first admin |
| POST   | `/v1/org/invite`        | Required   | Org admin      | Invite user to my org    |
| POST   | `/v1/org/invite/resend` | Required   | Org admin      | Resend invitation        |
| GET    | `/v1/org/users`         | Required   | Org member     | List users in my org     |
| POST   | `/v1/auth/activate`     | Required\* | Any            | Activate account         |
| GET    | `/v1/auth/me`           | Required   | Any            | Get current user profile |
| GET    | `/health`               | None       | -              | Health check             |

\*Uses special middleware that allows inactive users

### 6.2 Endpoint Details

#### POST /v1/admin/onboard

Creates a new organization and invites the first admin (atomic).

**Request:**

```json
{
  "organization": {
    "name": "ABC Construction Ltd",
    "type": "contractor",
    "seatLimit": 10
  },
  "admin": {
    "email": "ceo@abc-construction.com",
    "fullName": "John Smith",
    "role": "contractor_ceo"
  }
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "uuid",
      "name": "ABC Construction Ltd",
      "slug": "abc-construction-ltd",
      "type": "contractor",
      "seatLimit": 10,
      "seatUsed": 1
    },
    "admin": {
      "id": "uuid",
      "email": "ceo@abc-construction.com",
      "fullName": "John Smith",
      "role": "contractor_ceo",
      "isOrgAdmin": true,
      "isActive": false
    },
    "invitationSent": true
  }
}
```

#### POST /v1/org/invite

Invites a new user to the caller's organization.

**Request:**

```json
{
  "email": "pm@abc-construction.com",
  "fullName": "Jane Doe",
  "role": "contractor_pm"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "pm@abc-construction.com",
      "fullName": "Jane Doe",
      "role": "contractor_pm"
    },
    "seatsRemaining": 8,
    "warning": null
  }
}
```

#### POST /v1/auth/activate

Activates the current user's account after they set their password.

**Request:** (empty body, uses JWT)

**Response (200):**

```json
{
  "success": true,
  "message": "Account activated successfully"
}
```

#### GET /v1/auth/me

Returns the authenticated user's profile.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "pm@abc-construction.com",
    "fullName": "Jane Doe",
    "role": "contractor_pm",
    "isOrgAdmin": false,
    "isActive": true,
    "organization": {
      "id": "uuid",
      "name": "ABC Construction Ltd",
      "type": "contractor"
    }
  }
}
```

---

## 7. Security Requirements

### 7.1 Critical DO NOTs

```
❌ DO NOT store passwords in local database (Supabase handles this)
❌ DO NOT expose SUPABASE_SERVICE_ROLE_KEY to frontend
❌ DO NOT allow self-registration (invite-only)
❌ DO NOT use standard authMiddleware for /auth/activate (use AllowInactive variant)
❌ DO NOT skip JWT expiration checks
❌ DO NOT leave tokens in URL hash after reading
❌ DO NOT trust JWT role claims for authorization (verify against local DB)
❌ DO NOT allow org admins to invite users outside their org type
❌ DO NOT allow inviting roles higher than actor's level
❌ DO NOT skip input validation on any endpoint
```

### 7.2 Critical DOs

```
✅ ALWAYS use authMiddlewareAllowInactive for /auth/activate
✅ ALWAYS verify JWT locally using SUPABASE_JWT_SECRET
✅ ALWAYS normalize emails (lowercase, trim)
✅ ALWAYS validate with Zod before processing
✅ ALWAYS rollback if Supabase succeeds but local DB fails
✅ ALWAYS clear URL hash after extracting tokens
✅ ALWAYS check isActive before allowing resource access
✅ ALWAYS rate limit auth endpoints
✅ ALWAYS log to audit_logs for security events
✅ ALWAYS use FRONTEND_URL env var for redirects
✅ ALWAYS increment seatUsed on successful invite
✅ ALWAYS decrement seatUsed if user is deactivated
```

### 7.3 Rate Limits

| Endpoint Pattern    | Limit | Window     |
| ------------------- | ----- | ---------- |
| `/v1/auth/*`        | 15    | 15 minutes |
| `/v1/admin/onboard` | 10    | 1 hour     |
| `/v1/org/invite`    | 30    | 15 minutes |
| All other `/v1/*`   | 1000  | 1 minute   |

---

## 8. Implementation Phases

### Phase 1: Auth Foundation (This Sprint)

**Database:**

- [ ] `organizations` table
- [ ] `users` table with `organization_id`
- [ ] `audit_logs` table
- [ ] Migration files

**Backend:**

- [ ] JWT verification middleware (standard + allow-inactive)
- [ ] RBAC middleware
- [ ] Supabase admin client
- [ ] Audit logging utility
- [ ] `POST /v1/admin/onboard` - system admin onboards org
- [ ] `POST /v1/org/invite` - org admin invites team
- [ ] `POST /v1/org/invite/resend` - resend invitation
- [ ] `POST /v1/auth/activate` - activate account
- [ ] `GET /v1/auth/me` - get profile
- [ ] `GET /v1/org/users` - list org users

**Frontend:**

- [ ] Update `RemoteAuthAdapter` with `setSession()`
- [ ] `SetPasswordPage` - handle magic link, set password
- [ ] `OnboardOrganizationPage` - system admin UI
- [ ] `InviteUserPage` - org admin UI
- [ ] Update router with new routes
- [ ] Update `ProtectedRoute` for role checks

**Contracts:**

- [ ] Auth schemas (email, password, invite)
- [ ] Role definitions and helpers
- [ ] New error codes

### Phase 2: Project Collaboration (Future)

- [ ] `project_members` table
- [ ] Cross-org user search
- [ ] Project invite endpoints
- [ ] Project member management UI

### Phase 3: Advanced Features (Future)

- [ ] SSO/SAML integration
- [ ] Billing/subscription management
- [ ] Admin dashboard for system_admin
- [ ] User deactivation/reactivation
- [ ] Org settings management

---

## 9. File Manifest

| Path                                                               | Action | Description                              |
| ------------------------------------------------------------------ | ------ | ---------------------------------------- |
| **Shared Contract**                                                |        |                                          |
| `packages/contract/src/index.ts`                                   | MODIFY | Add auth schemas, role defs, error codes |
| **Database**                                                       |        |                                          |
| `packages/database/src/schema.ts`                                  | MODIFY | Add organizations, users, audit_logs     |
| `packages/database/drizzle/XXXX_auth.sql`                          | NEW    | Generated migration                      |
| **Backend**                                                        |        |                                          |
| `apps/server/src/types/index.ts`                                   | NEW    | JWT payload, context types               |
| `apps/server/src/lib/supabase.ts`                                  | NEW    | Supabase admin client                    |
| `apps/server/src/lib/audit.ts`                                     | NEW    | Audit logging utility                    |
| `apps/server/src/lib/seats.ts`                                     | NEW    | Seat limit logic                         |
| `apps/server/src/middleware/auth.ts`                               | MODIFY | Real JWT verification                    |
| `apps/server/src/middleware/rbac.ts`                               | NEW    | Role-based access control                |
| `apps/server/src/v1/routes/admin.ts`                               | NEW    | System admin endpoints                   |
| `apps/server/src/v1/routes/org.ts`                                 | NEW    | Org management endpoints                 |
| `apps/server/src/v1/routes/auth.ts`                                | NEW    | Auth endpoints                           |
| `apps/server/src/v1/routes/index.ts`                               | MODIFY | Mount new routes                         |
| **Frontend**                                                       |        |                                          |
| `apps/client/src/lib/adapters/remote/auth.ts`                      | MODIFY | Add setSession()                         |
| `apps/client/src/types/services.ts`                                | MODIFY | Update AuthAdapter                       |
| `apps/client/src/lib/validation.ts`                                | NEW    | Password validation                      |
| `apps/client/src/features/auth/pages/SetPasswordPage.tsx`          | NEW    | Magic link handler                       |
| `apps/client/src/features/admin/pages/OnboardOrganizationPage.tsx` | NEW    | Onboard UI                               |
| `apps/client/src/features/org/pages/InviteUserPage.tsx`            | NEW    | Invite UI                                |
| `apps/client/src/features/org/pages/TeamPage.tsx`                  | NEW    | Team list                                |
| `apps/client/src/app/router.tsx`                                   | MODIFY | Add routes                               |
| **Config**                                                         |        |                                          |
| `.env.example`                                                     | MODIFY | Add SUPABASE_JWT_SECRET, FRONTEND_URL    |

---

## 10. Environment Variables

### Backend (.env)

```env
# Existing
DATABASE_URL=postgresql://...

# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret  # NEW

# App
FRONTEND_URL=http://localhost:5173   # NEW
NODE_ENV=development
```

### Frontend (apps/client/.env)

```env
# Existing
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:54321/functions/v1/api
```

---

## 11. Supabase Configuration

### Dashboard Settings

1. **Authentication → URL Configuration**
   - Site URL: `http://localhost:5173` (dev) / `https://app.revbrain.io` (prod)
   - Redirect URLs: Add `/set-password` path

2. **Authentication → Email Templates → Invite User**
   - Customize with RevBrain branding
   - Include organization name in email

3. **Authentication → Settings**
   - Enable email confirmations: OFF (using invite flow)
   - Secure email change: ON

### Email Template (Invite)

```html
<h2>Welcome to RevBrain!</h2>
<p>You've been invited to join <strong>{{ .Data.organization_name }}</strong>.</p>
<p>Click below to set up your account:</p>
<a href="{{ .ConfirmationURL }}" style="...">Accept Invitation</a>
<p>This link expires in 24 hours.</p>
```

---

## 12. Testing Checklist

### System Admin Flows

- [ ] Can create org + admin atomically
- [ ] Rollback works if Supabase succeeds but DB fails
- [ ] Cannot create duplicate org slugs
- [ ] Cannot assign non-admin role as first user
- [ ] Audit log created for org.created

### Org Admin Flows

- [ ] Can invite users within own org type
- [ ] Cannot invite to other org types
- [ ] Cannot invite own role level (CEO can't invite CEO)
- [ ] Seat limit enforced (warning at limit, hard fail after grace)
- [ ] seatUsed incremented on invite
- [ ] Audit log created for user.invited

### Activation Flow

- [ ] Magic link works from email
- [ ] Tokens cleared from URL immediately
- [ ] Password validation enforced
- [ ] Account activated after password set
- [ ] Audit log created for user.activated
- [ ] User redirected to dashboard

### Login Flow

- [ ] Valid credentials succeed
- [ ] Invalid credentials fail gracefully
- [ ] Inactive account blocked (with helpful message)
- [ ] JWT verified correctly
- [ ] lastLoginAt updated

### Authorization

- [ ] Unauthenticated requests return 401
- [ ] Inactive users blocked on protected routes
- [ ] Role checks enforced per endpoint
- [ ] Users only see own org's data

---

## 13. Glossary

| Term                   | Definition                                             |
| ---------------------- | ------------------------------------------------------ |
| **Organization (Org)** | A customer account (contractor firm or client company) |
| **Org Admin**          | User with `isOrgAdmin=true`, can invite team members   |
| **Seat**               | License for one user in an organization                |
| **Seat Limit**         | Maximum users allowed in an organization               |
| **Magic Link**         | One-time URL sent via email for passwordless auth      |
| **Activate**           | Process of setting password and enabling account       |
| **Onboard**            | System admin creating a new org + first admin          |

---

## Appendix A: Migration SQL

```sql
-- 0002_auth_system.sql

-- Organizations
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(100) NOT NULL UNIQUE,
  "type" varchar(50) NOT NULL,
  "seat_limit" integer DEFAULT 5 NOT NULL,
  "seat_used" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

-- Users
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supabase_user_id" uuid NOT NULL UNIQUE,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "email" varchar(255) NOT NULL UNIQUE,
  "full_name" varchar(255) NOT NULL,
  "role" varchar(50) NOT NULL,
  "is_org_admin" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "invited_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "activated_at" timestamp with time zone,
  "last_login_at" timestamp with time zone
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
  "action" varchar(100) NOT NULL,
  "target_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "metadata" jsonb,
  "ip_address" varchar(45),
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_users_supabase_id" ON "users"("supabase_user_id");
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
CREATE INDEX IF NOT EXISTS "idx_users_org_id" ON "users"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_orgs_slug" ON "organizations"("slug");
CREATE INDEX IF NOT EXISTS "idx_audit_user_id" ON "audit_logs"("user_id");
CREATE INDEX IF NOT EXISTS "idx_audit_org_id" ON "audit_logs"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "audit_logs"("created_at");
```

---

_End of Specification_
