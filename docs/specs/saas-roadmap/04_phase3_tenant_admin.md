# Phase 3: Tenant Admin Experience

## Overview

The tenant admin (organization owner) needs a complete self-service dashboard to manage their team, billing, and settings without contacting support. This phase builds the "Settings" area of the app.

---

## User Personas

| Role                                        | Permissions      | Needs                              |
| ------------------------------------------- | ---------------- | ---------------------------------- |
| **Org Owner** (contractor_ceo/client_owner) | Full org control | Team management, billing, settings |
| **Org Admin** (future role)                 | Limited admin    | Team management, no billing        |
| **Regular Member**                          | No admin access  | View own profile only              |

---

## Deliverables

### 3.0a Tenant Data Isolation (RLS Policies)

**User Story**: As a platform owner, I need to guarantee that organizations can never access each other's data.

**Why this is a prerequisite**: Before building org-scoped features (team management, usage dashboards, org settings), every data table must have Row Level Security (RLS) policies that enforce tenant isolation at the database level — not just in application code.

**Scope**:

1. **Audit existing tables** — Identify all tables that hold tenant-scoped data (projects, documents, users, etc.)

2. **RLS policies per table**:

   ```sql
   -- Example: projects table
   ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

   -- Users can only see projects belonging to their organization
   CREATE POLICY "Tenant isolation for projects"
     ON projects FOR ALL
     USING (
       organization_id = (
         SELECT organization_id FROM users WHERE id = auth.uid()
       )
     );
   ```

3. **System admin bypass** — system_admin role should be able to access all tenants:

   ```sql
   CREATE POLICY "System admin full access"
     ON projects FOR ALL
     USING (
       EXISTS (
         SELECT 1 FROM users
         WHERE id = auth.uid() AND role = 'system_admin'
       )
     );
   ```

4. **Service role bypass** — Backend service operations (migrations, cron jobs) use the service_role key which bypasses RLS by default.

**Tables to cover** (audit all, at minimum):

- `projects`
- `documents` / `files`
- `users` (scoped view: members can see other members in their org)
- `invitations` (already has RLS from Phase 0)
- `audit_logs` (new in Phase 3)
- Any domain-specific tables (calculations, reports, etc.)

**Acceptance Criteria**:

- [ ] All tenant-scoped tables have RLS enabled
- [ ] User from org A cannot query data from org B (verified via test)
- [ ] system_admin can access all tenants
- [ ] Service role operations (backend) are unaffected
- [ ] Existing API endpoints continue to work

---

### 3.0b Role Hierarchy & Authorization Middleware

**User Story**: As a platform owner, I need backend enforcement of what each role can do — not just frontend route guards.

**Current state**: Frontend uses `<ProtectedRoute requiredRoles={[...]}>`but the backend has ad-hoc role checks (or none) per route.

**Role hierarchy**:

```
system_admin > contractor_ceo / client_owner > project_manager > worker
```

**Implementation**:

1. **Role definition & hierarchy**:

   ```typescript
   // packages/contract/src/roles.ts
   export const ROLE_HIERARCHY: Record<string, number> = {
     system_admin: 100,
     contractor_ceo: 80,
     client_owner: 80,
     project_manager: 50,
     worker: 10,
   };

   export function hasMinimumRole(userRole: string, requiredRole: string): boolean {
     return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? Infinity);
   }
   ```

2. **Backend authorization middleware**:

   ```typescript
   // apps/server/src/middleware/authorize.ts
   import { createMiddleware } from 'hono/factory';
   import { hasMinimumRole } from '@geometrix/contract';

   export function requireRole(...roles: string[]) {
     return createMiddleware(async (c, next) => {
       const user = c.get('user');
       const authorized = roles.some((role) => hasMinimumRole(user.role, role));
       if (!authorized) {
         return c.json({ error: 'Insufficient permissions' }, 403);
       }
       await next();
     });
   }
   ```

3. **Apply to routes**:

   ```typescript
   // Example usage in routes
   org.patch('/members/:id', requireRole('contractor_ceo', 'client_owner'), async (c) => { ... });
   org.delete('/members/:id', requireRole('contractor_ceo', 'client_owner'), async (c) => { ... });
   org.patch('/settings', requireRole('contractor_ceo', 'client_owner'), async (c) => { ... });
   admin.use('*', requireRole('system_admin'));
   ```

**Acceptance Criteria**:

- [ ] Role hierarchy defined in shared contract package
- [ ] `requireRole()` middleware reusable across all routes
- [ ] All org-admin endpoints enforce role checks server-side
- [ ] All system-admin endpoints enforce role checks server-side
- [ ] Worker cannot access admin endpoints (verified via test)
- [ ] Proper 403 response with clear error message

---

### 3.1 Team Management Page

**User Story**: As an org admin, I can view all team members, invite new ones, change roles, and remove members.

**UI Design**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Team Members                                    [Invite Member] │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 👤 John Smith                    Owner        ●  Active     │ │
│ │    john@acme.com                 Joined Jan 2024            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 👤 Jane Doe            [Role ▼]  Admin       ●  Active  [⋮]│ │
│ │    jane@acme.com                 Joined Feb 2024            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 📧 pending@email.com            Member    ◐  Pending   [⋮] │ │
│ │    Invited by John Smith         Expires in 5 days          │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ 3 of 5 seats used                              [Upgrade Plan]   │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation**:

```typescript
// apps/client/src/pages/settings/TeamPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InviteMemberDialog } from './InviteMemberDialog';

interface TeamMember {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: 'active' | 'inactive' | 'pending';
  joinedAt?: string;
  avatarUrl?: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  expiresAt: string;
}

export function TeamPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: team } = useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => api.get('/org/members'),
  });

  const { data: invitations } = useQuery({
    queryKey: ['team', 'invitations'],
    queryFn: () => api.get('/org/invitations'),
  });

  const { data: subscription } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => api.get('/billing/subscription'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch(`/org/members/${userId}`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/org/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) => api.delete(`/org/invitations/${inviteId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team'] }),
  });

  const members = team?.members || [];
  const pending = invitations?.invitations || [];
  const seatLimit = subscription?.plan?.limits?.maxUsers || 5;
  const seatsUsed = members.length;
  const canInvite = seatsUsed < seatLimit;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Team Members</h1>
          <p className="text-slate-500">
            Manage who has access to your organization
          </p>
        </div>
        <Button
          onClick={() => setInviteOpen(true)}
          disabled={!canInvite}
        >
          Invite Member
        </Button>
      </div>

      {/* Seat usage */}
      <Card className="p-4 bg-slate-50">
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-600">
            {seatsUsed} of {seatLimit} seats used
          </span>
          {!canInvite && (
            <Button variant="link" size="sm" onClick={() => navigate('/settings/billing')}>
              Upgrade for more seats
            </Button>
          )}
        </div>
        <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full"
            style={{ width: `${(seatsUsed / seatLimit) * 100}%` }}
          />
        </div>
      </Card>

      {/* Active members */}
      <div className="space-y-2">
        {members.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            onRoleChange={(role) => updateRoleMutation.mutate({ userId: member.id, role })}
            onRemove={() => removeMemberMutation.mutate(member.id)}
            isCurrentUser={member.id === currentUser.id}
          />
        ))}
      </div>

      {/* Pending invitations */}
      {pending.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mt-8">Pending Invitations</h2>
          <div className="space-y-2">
            {pending.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                onRevoke={() => revokeInviteMutation.mutate(invite.id)}
                onResend={() => resendInviteMutation.mutate(invite.id)}
              />
            ))}
          </div>
        </>
      )}

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  );
}
```

**API Endpoints**:

```typescript
// apps/server/src/v1/routes/org.ts

// List organization members
GET /org/members
Response: {
  members: TeamMember[];
  total: number;
}

// Update member role
PATCH /org/members/:userId
Body: { role: string }
Auth: org_admin+

// Remove member from organization
DELETE /org/members/:userId
Auth: org_admin+ (cannot remove self if owner)

// Transfer ownership
POST /org/transfer-ownership
Body: { newOwnerId: string }
Auth: owner only
```

**Acceptance Criteria**:

- [ ] Can view all org members
- [ ] Can see pending invitations
- [ ] Can change member roles
- [ ] Can remove members (except self if owner)
- [ ] Can revoke pending invitations
- [ ] Can resend invitation emails
- [ ] Seat limit enforced
- [ ] Owner cannot be removed

---

### 3.2 Billing Portal Access

**User Story**: As an org admin, I can access Stripe's hosted billing portal to manage payment methods and view invoices.

**Implementation** (already in Phase 2, add UI):

```typescript
// apps/client/src/pages/settings/BillingPage.tsx
// Add to existing page

<Card className="p-6">
  <h2 className="font-semibold mb-2">Payment Method</h2>
  <p className="text-slate-500 text-sm mb-4">
    Manage your payment method and billing details.
  </p>
  <Button
    variant="outline"
    onClick={() => portalMutation.mutate()}
    disabled={!subscription}
  >
    <CreditCard className="h-4 w-4 mr-2" />
    Manage Payment Method
  </Button>
</Card>

<Card className="p-6">
  <h2 className="font-semibold mb-2">Invoices</h2>
  <p className="text-slate-500 text-sm mb-4">
    View and download your billing history.
  </p>
  <Button
    variant="outline"
    onClick={() => portalMutation.mutate()}
    disabled={!subscription}
  >
    <FileText className="h-4 w-4 mr-2" />
    View Invoices
  </Button>
</Card>
```

---

### 3.3 Organization Settings Page

**User Story**: As an org admin, I can update organization name, logo, and other settings.

```typescript
// apps/client/src/pages/settings/OrganizationPage.tsx
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

interface OrgSettings {
  name: string;
  logoUrl?: string;
  website?: string;
  address?: string;
  timezone?: string;
}

export function OrganizationPage() {
  const { data: org } = useQuery({
    queryKey: ['org', 'settings'],
    queryFn: () => api.get('/org/settings'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<OrgSettings>) => api.patch('/org/settings', data),
    onSuccess: () => {
      toast.success('Settings updated');
      queryClient.invalidateQueries({ queryKey: ['org'] });
    },
  });

  const form = useForm<OrgSettings>({
    defaultValues: org,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organization Settings</h1>
        <p className="text-slate-500">Manage your organization details</p>
      </div>

      <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}>
        <Card className="p-6 space-y-6">
          {/* Organization Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Organization Name
            </label>
            <Input {...form.register('name')} />
          </div>

          {/* Logo */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Logo
            </label>
            <div className="flex items-center gap-4">
              {org?.logoUrl ? (
                <img src={org.logoUrl} className="h-16 w-16 rounded" />
              ) : (
                <div className="h-16 w-16 bg-slate-100 rounded flex items-center justify-center">
                  <Building2 className="h-8 w-8 text-slate-400" />
                </div>
              )}
              <Button type="button" variant="outline" size="sm">
                Upload Logo
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Recommended: 256x256px PNG or JPG
            </p>
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Website
            </label>
            <Input {...form.register('website')} placeholder="https://" />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Address
            </label>
            <Input {...form.register('address')} />
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Timezone
            </label>
            <TimezoneSelect {...form.register('timezone')} />
          </div>

          <div className="pt-4 border-t">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </Card>
      </form>

      {/* Danger Zone */}
      <Card className="p-6 border-red-200">
        <h2 className="font-semibold text-red-600 mb-2">Danger Zone</h2>
        <p className="text-sm text-slate-500 mb-4">
          Permanently delete this organization and all its data.
        </p>
        <Button variant="destructive" size="sm">
          Delete Organization
        </Button>
      </Card>
    </div>
  );
}
```

**API Endpoints**:

```typescript
// GET /org/settings - Get org settings
// PATCH /org/settings - Update org settings
// DELETE /org - Delete organization (with confirmation)
```

---

### 3.4 Usage Dashboard

**User Story**: As an org admin, I can see how my team is using the platform.

```typescript
// apps/client/src/pages/settings/UsagePage.tsx

export function UsagePage() {
  const { data: usage } = useQuery({
    queryKey: ['org', 'usage'],
    queryFn: () => api.get('/org/usage'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Usage & Limits</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Team Members */}
        <UsageCard
          title="Team Members"
          current={usage?.members.current}
          limit={usage?.members.limit}
          icon={Users}
        />

        {/* Projects (if applicable) */}
        <UsageCard
          title="Projects"
          current={usage?.projects.current}
          limit={usage?.projects.limit}
          icon={Folder}
        />

        {/* Storage (if applicable) */}
        <UsageCard
          title="Storage"
          current={usage?.storage.current}
          limit={usage?.storage.limit}
          unit="GB"
          icon={HardDrive}
        />
      </div>

      {/* Usage history chart */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Activity This Month</h2>
        <UsageChart data={usage?.activity} />
      </Card>

      {/* Current plan features */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Your Plan Features</h2>
        <FeatureList features={usage?.planFeatures} />
      </Card>
    </div>
  );
}

function UsageCard({ title, current, limit, unit = '', icon: Icon }) {
  const percentage = limit ? (current / limit) * 100 : 0;
  const isNearLimit = percentage > 80;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <Icon className="h-5 w-5 text-slate-400" />
        <span className="font-medium">{title}</span>
      </div>
      <div className="text-2xl font-bold">
        {current}{unit} <span className="text-slate-400 text-lg">/ {limit}{unit}</span>
      </div>
      <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isNearLimit ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </Card>
  );
}
```

---

### 3.5 Audit Log Viewer

**User Story**: As an org admin, I can see a log of important actions taken in my organization.

**Database** (if not already exists):

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL, -- 'user.invited', 'member.removed', 'settings.updated'
  resource_type TEXT, -- 'user', 'project', 'settings'
  resource_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);
```

**Implementation**:

```typescript
// apps/client/src/pages/settings/AuditLogPage.tsx

export function AuditLogPage() {
  const [filters, setFilters] = useState({
    action: '',
    user: '',
    dateRange: 'last7days',
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['org', 'audit-logs', filters],
    queryFn: () => api.get('/org/audit-logs', { params: filters }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-slate-500">Track all important actions in your organization</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={filters.action} onValueChange={(v) => setFilters(f => ({...f, action: v}))}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All actions</SelectItem>
            <SelectItem value="user.invited">User invited</SelectItem>
            <SelectItem value="member.removed">Member removed</SelectItem>
            <SelectItem value="role.changed">Role changed</SelectItem>
            <SelectItem value="settings.updated">Settings updated</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.dateRange} onValueChange={(v) => setFilters(f => ({...f, dateRange: v}))}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="last7days">Last 7 days</SelectItem>
            <SelectItem value="last30days">Last 30 days</SelectItem>
            <SelectItem value="last90days">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Log entries */}
      <Card>
        <div className="divide-y">
          {logs?.items.map((log) => (
            <div key={log.id} className="p-4 hover:bg-slate-50">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{formatAction(log.action)}</p>
                  <p className="text-sm text-slate-500">
                    {log.user?.fullName || 'System'} • {formatDate(log.createdAt)}
                  </p>
                </div>
                <ActionIcon action={log.action} />
              </div>
              {log.metadata && (
                <div className="mt-2 text-sm text-slate-600 bg-slate-50 p-2 rounded">
                  {formatMetadata(log.metadata)}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function formatAction(action: string): string {
  const actions: Record<string, string> = {
    'user.invited': 'Team member invited',
    'member.removed': 'Team member removed',
    'role.changed': 'Member role changed',
    'settings.updated': 'Organization settings updated',
    'subscription.created': 'Subscription started',
    'subscription.canceled': 'Subscription canceled',
  };
  return actions[action] || action;
}
```

---

### 3.6 Settings Navigation

**Unified settings sidebar**:

```typescript
// apps/client/src/components/layout/SettingsSidebar.tsx

const settingsNav = [
  {
    label: 'Account',
    items: [
      { href: '/settings/profile', label: 'Profile', icon: User },
      { href: '/settings/security', label: 'Security', icon: Shield },
      { href: '/settings/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Organization',
    adminOnly: true,
    items: [
      { href: '/settings/org', label: 'General', icon: Building2 },
      { href: '/settings/team', label: 'Team', icon: Users },
      { href: '/settings/billing', label: 'Billing', icon: CreditCard },
      { href: '/settings/usage', label: 'Usage', icon: BarChart2 },
      { href: '/settings/audit-log', label: 'Audit Log', icon: ScrollText },
    ],
  },
];

export function SettingsSidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const isAdmin = ['contractor_ceo', 'client_owner', 'system_admin'].includes(user.role);

  return (
    <aside className="w-64 border-r bg-white">
      <nav className="p-4 space-y-6">
        {settingsNav.map((section) => {
          if (section.adminOnly && !isAdmin) return null;

          return (
            <div key={section.label}>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {section.label}
              </h3>
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                        location.pathname === item.href
                          ? 'bg-slate-100 text-slate-900'
                          : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
```

---

## API Endpoints Summary

| Method | Path                    | Auth   | Description         |
| ------ | ----------------------- | ------ | ------------------- |
| GET    | /org/members            | Member | List org members    |
| PATCH  | /org/members/:id        | Admin  | Update member role  |
| DELETE | /org/members/:id        | Admin  | Remove member       |
| POST   | /org/transfer-ownership | Owner  | Transfer ownership  |
| GET    | /org/settings           | Admin  | Get org settings    |
| PATCH  | /org/settings           | Admin  | Update org settings |
| DELETE | /org                    | Owner  | Delete organization |
| GET    | /org/usage              | Member | Get usage stats     |
| GET    | /org/audit-logs         | Admin  | Get audit logs      |

---

## Files to Create

```
apps/client/src/
├── pages/settings/
│   ├── SettingsLayout.tsx
│   ├── ProfilePage.tsx       (Phase 0)
│   ├── SecurityPage.tsx      (Phase 0)
│   ├── TeamPage.tsx          (NEW)
│   ├── OrganizationPage.tsx  (NEW)
│   ├── BillingPage.tsx       (Phase 2)
│   ├── UsagePage.tsx         (NEW)
│   └── AuditLogPage.tsx      (NEW)
├── components/settings/
│   ├── SettingsSidebar.tsx
│   ├── MemberCard.tsx
│   ├── InviteCard.tsx
│   ├── InviteMemberDialog.tsx
│   └── UsageCard.tsx

apps/server/src/
├── middleware/
│   └── authorize.ts          (NEW - role hierarchy middleware)
├── v1/routes/
│   └── org.ts (extend)
├── services/
│   ├── audit-log.service.ts
│   └── usage.service.ts

packages/contract/src/
└── roles.ts                   (NEW - role hierarchy definition)

supabase/migrations/
└── XXXX_tenant_rls_policies.sql  (NEW - RLS for all tenant-scoped tables)
```

---

## Testing Checklist

### Tenant Data Isolation (RLS)

- [ ] All tenant-scoped tables have RLS enabled
- [ ] User from org A cannot SELECT data from org B
- [ ] User from org A cannot INSERT/UPDATE/DELETE data in org B
- [ ] system_admin can access all tenant data
- [ ] Service role (backend) bypasses RLS
- [ ] Existing API endpoints return correct scoped data

### Role Hierarchy & Authorization

- [ ] Role hierarchy defined and shared between client/server
- [ ] requireRole() middleware blocks unauthorized access with 403
- [ ] Worker cannot hit org-admin endpoints
- [ ] Regular user cannot hit system-admin endpoints
- [ ] Role checks are server-side (not just frontend guards)

### Team Management

- [ ] Can view all members
- [ ] Can invite new member (within seat limit)
- [ ] Cannot invite beyond seat limit
- [ ] Can change member role
- [ ] Cannot demote self if owner
- [ ] Can remove member
- [ ] Cannot remove self
- [ ] Can revoke invitation
- [ ] Can resend invitation

### Organization Settings

- [ ] Can update org name
- [ ] Can upload logo
- [ ] Changes persist
- [ ] Validation works

### Usage & Audit

- [ ] Usage stats display correctly
- [ ] Progress bars show correct percentage
- [ ] Audit logs load
- [ ] Filters work
- [ ] Pagination works

---

## Success Metrics

- Org admin can complete team management tasks without support
- < 5% of support tickets about billing (Stripe portal handles it)
- Audit log queries < 200ms
