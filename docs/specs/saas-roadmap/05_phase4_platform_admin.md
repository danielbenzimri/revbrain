# Phase 4: Platform Admin Tools

## Overview

As the platform owner, you need visibility into your business: revenue, subscription health, customer support tools, and system monitoring. This phase builds the "god mode" dashboard.

---

## User Personas

| Role                       | Access Level         | Needs                                 |
| -------------------------- | -------------------- | ------------------------------------- |
| **System Admin**           | Full platform access | Revenue, all customers, system health |
| **Support Agent** (future) | Limited access       | Customer lookup, impersonation        |
| **Finance** (future)       | Read-only billing    | Revenue reports, invoices             |

---

## Deliverables

### 4.1 Revenue Dashboard

**User Story**: As a platform admin, I can see MRR, ARR, growth trends, and revenue breakdown.

**Key Metrics**:

- **MRR** (Monthly Recurring Revenue)
- **ARR** (Annual Recurring Revenue = MRR × 12)
- **Net Revenue** (after refunds)
- **Churn Rate** (% of customers lost)
- **ARPU** (Average Revenue Per User)

**Implementation**:

```typescript
// apps/server/src/services/revenue.service.ts

interface RevenueMetrics {
  mrr: number;
  arr: number;
  netRevenue: number;
  totalCustomers: number;
  activeSubscriptions: number;
  churnedThisMonth: number;
  churnRate: number;
  arpu: number;
  mrrGrowth: number; // vs last month
}

export class RevenueService {
  async getMetrics(): Promise<RevenueMetrics> {
    // Get all active subscriptions
    const activeSubscriptions = await db.query.subscriptions.findMany({
      where: eq(subscriptions.status, 'active'),
      with: { plan: true },
    });

    // Calculate MRR
    let mrr = 0;
    for (const sub of activeSubscriptions) {
      const monthlyPrice = sub.plan.interval === 'year' ? sub.plan.price / 12 : sub.plan.price;
      mrr += monthlyPrice;
    }

    // Get churned this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const churnedThisMonth = await db.query.subscriptions.findMany({
      where: and(eq(subscriptions.status, 'canceled'), gte(subscriptions.canceledAt, startOfMonth)),
    });

    // Get last month's MRR for growth calculation
    const lastMonthMRR = await this.getMRRForMonth(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const totalCustomers = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizations)
      .where(eq(organizations.isActive, true));

    return {
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      netRevenue: await this.getNetRevenue(),
      totalCustomers: totalCustomers[0].count,
      activeSubscriptions: activeSubscriptions.length,
      churnedThisMonth: churnedThisMonth.length,
      churnRate:
        lastMonthMRR > 0 ? (churnedThisMonth.length / activeSubscriptions.length) * 100 : 0,
      arpu: activeSubscriptions.length > 0 ? mrr / activeSubscriptions.length : 0,
      mrrGrowth: lastMonthMRR > 0 ? ((mrr - lastMonthMRR) / lastMonthMRR) * 100 : 0,
    };
  }

  async getRevenueChart(period: '7d' | '30d' | '90d' | '12m'): Promise<ChartData[]> {
    // Return daily/weekly/monthly revenue data points
  }

  async getRevenueByPlan(): Promise<PlanRevenue[]> {
    // Group revenue by plan for pie chart
  }

  private async getNetRevenue(): Promise<number> {
    const result = await db
      .select({ total: sql<number>`sum(amount_cents)` })
      .from(paymentHistory)
      .where(eq(paymentHistory.status, 'succeeded'));
    return (result[0]?.total || 0) / 100;
  }
}
```

**Frontend**:

```typescript
// apps/client/src/pages/admin/RevenueDashboard.tsx

export function RevenueDashboard() {
  const { data: metrics } = useQuery({
    queryKey: ['admin', 'revenue', 'metrics'],
    queryFn: () => api.get('/admin/revenue/metrics'),
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: chart } = useQuery({
    queryKey: ['admin', 'revenue', 'chart', period],
    queryFn: () => api.get('/admin/revenue/chart', { params: { period } }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Revenue Dashboard</h1>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="MRR"
          value={formatCurrency(metrics?.mrr)}
          change={metrics?.mrrGrowth}
          icon={DollarSign}
        />
        <MetricCard
          title="ARR"
          value={formatCurrency(metrics?.arr)}
          icon={TrendingUp}
        />
        <MetricCard
          title="Active Subscriptions"
          value={metrics?.activeSubscriptions}
          icon={Users}
        />
        <MetricCard
          title="Churn Rate"
          value={`${metrics?.churnRate?.toFixed(1)}%`}
          icon={UserMinus}
          negative
        />
      </div>

      {/* Revenue Chart */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Revenue Over Time</h2>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
        <RevenueChart data={chart} />
      </Card>

      {/* Revenue by Plan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="font-semibold mb-4">Revenue by Plan</h2>
          <PlanBreakdownChart data={metrics?.byPlan} />
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-4">Recent Transactions</h2>
          <RecentTransactions />
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, change, icon: Icon, negative = false }) {
  return (
    <Card className="p-4">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {change !== undefined && (
            <p className={cn(
              'text-sm mt-1',
              change >= 0 ? 'text-emerald-600' : 'text-red-600'
            )}>
              {change >= 0 ? '+' : ''}{change.toFixed(1)}% vs last month
            </p>
          )}
        </div>
        <div className={cn(
          'p-2 rounded-lg',
          negative ? 'bg-red-100' : 'bg-emerald-100'
        )}>
          <Icon className={cn(
            'h-5 w-5',
            negative ? 'text-red-600' : 'text-emerald-600'
          )} />
        </div>
      </div>
    </Card>
  );
}
```

---

### 4.2 Subscription Health Monitor

**User Story**: As a platform admin, I can identify at-risk subscriptions and take action.

**At-Risk Indicators**:

- Payment failed (1+ times)
- Trial ending soon (< 3 days)
- No activity in 30+ days
- Downgrade requested
- Cancel scheduled

```typescript
// apps/client/src/pages/admin/SubscriptionHealthPage.tsx

export function SubscriptionHealthPage() {
  const { data: atRisk } = useQuery({
    queryKey: ['admin', 'subscriptions', 'at-risk'],
    queryFn: () => api.get('/admin/subscriptions/at-risk'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Subscription Health</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <AlertCard
          title="Payment Issues"
          count={atRisk?.paymentFailed}
          severity="high"
          icon={AlertTriangle}
        />
        <AlertCard
          title="Trial Ending"
          count={atRisk?.trialEnding}
          severity="medium"
          icon={Clock}
        />
        <AlertCard
          title="Inactive (30d+)"
          count={atRisk?.inactive}
          severity="low"
          icon={Moon}
        />
        <AlertCard
          title="Cancellation Pending"
          count={atRisk?.cancelPending}
          severity="medium"
          icon={XCircle}
        />
      </div>

      {/* At-Risk Subscriptions Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Since</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {atRisk?.subscriptions.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{sub.organization.name}</p>
                    <p className="text-sm text-slate-500">{sub.organization.ownerEmail}</p>
                  </div>
                </TableCell>
                <TableCell>{sub.plan.name}</TableCell>
                <TableCell>
                  <IssueBadge issue={sub.issue} />
                </TableCell>
                <TableCell>{formatDate(sub.issueDate)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        Actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => openImpersonation(sub.organization.id)}>
                        Impersonate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEmailDialog(sub)}>
                        Send Email
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => extendTrial(sub.id)}>
                        Extend Trial
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => applyDiscount(sub.id)}>
                        Apply Discount
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
```

---

### 4.3 Manual Subscription Overrides

**User Story**: As a platform admin, I can manually adjust subscriptions for special cases (comp accounts, extended trials, custom pricing).

```typescript
// apps/server/src/v1/routes/admin.ts

/**
 * Extend trial period
 * POST /admin/subscriptions/:id/extend-trial
 */
admin.post('/subscriptions/:id/extend-trial', async (c) => {
  const { id } = c.req.param();
  const { days } = await c.req.json<{ days: number }>();

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, id),
  });

  if (!subscription?.stripeSubscriptionId) {
    return c.json({ error: 'Subscription not found' }, 404);
  }

  // Update in Stripe
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    trial_end: Math.floor(Date.now() / 1000) + days * 24 * 60 * 60,
  });

  // Log the action
  await auditLogService.log({
    action: 'subscription.trial_extended',
    resourceType: 'subscription',
    resourceId: id,
    metadata: { days },
    userId: c.get('user').id,
  });

  return c.json({ success: true });
});

/**
 * Apply discount/coupon
 * POST /admin/subscriptions/:id/apply-discount
 */
admin.post('/subscriptions/:id/apply-discount', async (c) => {
  const { id } = c.req.param();
  const { couponId, percentOff, durationMonths } = await c.req.json();

  // Create or use existing Stripe coupon
  let coupon;
  if (couponId) {
    coupon = couponId;
  } else {
    const newCoupon = await stripe.coupons.create({
      percent_off: percentOff,
      duration: 'repeating',
      duration_in_months: durationMonths,
    });
    coupon = newCoupon.id;
  }

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, id),
  });

  await stripe.subscriptions.update(subscription!.stripeSubscriptionId!, {
    coupon,
  });

  return c.json({ success: true });
});

/**
 * Cancel subscription immediately
 * POST /admin/subscriptions/:id/cancel
 */
admin.post('/subscriptions/:id/cancel', async (c) => {
  const { id } = c.req.param();
  const { reason, refund } = await c.req.json();

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, id),
  });

  // Cancel in Stripe
  await stripe.subscriptions.cancel(subscription!.stripeSubscriptionId!);

  // Optionally issue refund
  if (refund) {
    const invoices = await stripe.invoices.list({
      subscription: subscription!.stripeSubscriptionId!,
      limit: 1,
    });

    if (invoices.data[0]?.payment_intent) {
      await stripe.refunds.create({
        payment_intent: invoices.data[0].payment_intent as string,
        reason: 'requested_by_customer',
      });
    }
  }

  await auditLogService.log({
    action: 'subscription.admin_canceled',
    resourceType: 'subscription',
    resourceId: id,
    metadata: { reason, refund },
    userId: c.get('user').id,
  });

  return c.json({ success: true });
});

/**
 * Create complimentary subscription
 * POST /admin/orgs/:orgId/comp-subscription
 */
admin.post('/orgs/:orgId/comp-subscription', async (c) => {
  const { orgId } = c.req.param();
  const { planId, reason, expiresAt } = await c.req.json();

  // Create subscription with $0 price
  // ... implementation

  return c.json({ success: true });
});
```

---

### 4.4 User Impersonation

**User Story**: As a support admin, I can "log in as" a customer to debug issues.

**Security Requirements**:

- Clearly indicate impersonation mode in UI
- Log all impersonation sessions
- Auto-expire impersonation after 30 minutes
- Cannot impersonate other admins

```typescript
// apps/server/src/v1/routes/admin.ts

/**
 * Start impersonation session
 * POST /admin/impersonate/:userId
 */
admin.post('/impersonate/:userId', async (c) => {
  const adminUser = c.get('user');
  const { userId } = c.req.param();

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!targetUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Cannot impersonate other admins
  if (targetUser.role === 'system_admin') {
    return c.json({ error: 'Cannot impersonate system admins' }, 403);
  }

  // Create impersonation token
  const impersonationToken = await createImpersonationToken({
    adminId: adminUser.id,
    targetUserId: userId,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
  });

  // Log impersonation start
  await auditLogService.log({
    action: 'admin.impersonation_started',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      targetEmail: targetUser.email,
      targetOrg: targetUser.organizationId,
    },
    userId: adminUser.id,
  });

  return c.json({
    token: impersonationToken,
    user: targetUser,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
});

/**
 * End impersonation session
 * POST /admin/impersonate/end
 */
admin.post('/impersonate/end', async (c) => {
  // Clear impersonation token
  // Log impersonation end
  return c.json({ success: true });
});
```

**Frontend**:

```typescript
// apps/client/src/components/ImpersonationBanner.tsx

export function ImpersonationBanner() {
  const { impersonation, endImpersonation } = useAuth();

  if (!impersonation) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-amber-500 text-amber-950 px-4 py-2 z-50 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <EyeOff className="h-4 w-4" />
        <span className="font-medium">
          Impersonating: {impersonation.targetUser.email}
        </span>
        <span className="text-amber-800">
          (expires in {formatTimeRemaining(impersonation.expiresAt)})
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-700 hover:bg-amber-600"
        onClick={endImpersonation}
      >
        End Impersonation
      </Button>
    </div>
  );
}
```

---

### 4.5 Webhook Event Logs

**User Story**: As a platform admin, I can debug webhook issues by viewing the event log.

```typescript
// apps/client/src/pages/admin/WebhookLogsPage.tsx

export function WebhookLogsPage() {
  const [filters, setFilters] = useState({
    eventType: '',
    status: '',
    dateRange: 'last24h',
  });

  const { data: logs } = useQuery({
    queryKey: ['admin', 'webhook-logs', filters],
    queryFn: () => api.get('/admin/webhook-logs', { params: filters }),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Webhook Events</h1>
        <Button variant="outline" onClick={() => reprocessFailed()}>
          Reprocess Failed
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Events" value={logs?.stats.total} />
        <StatCard title="Processed" value={logs?.stats.processed} color="green" />
        <StatCard title="Failed" value={logs?.stats.failed} color="red" />
        <StatCard title="Pending" value={logs?.stats.pending} color="amber" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={filters.eventType} onChange={...}>
          <option value="">All Events</option>
          <option value="checkout.session.completed">Checkout Complete</option>
          <option value="invoice.payment_succeeded">Payment Succeeded</option>
          <option value="invoice.payment_failed">Payment Failed</option>
          <option value="customer.subscription.updated">Subscription Updated</option>
        </Select>

        <Select value={filters.status}>
          <option value="">All Status</option>
          <option value="processed">Processed</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </Select>
      </div>

      {/* Event List */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs?.events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <code className="text-sm">{event.eventType}</code>
                </TableCell>
                <TableCell>
                  <StatusBadge status={event.processedAt ? 'processed' : event.error ? 'failed' : 'pending'} />
                </TableCell>
                <TableCell>{formatDate(event.createdAt)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEvent(event)}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onReprocess={() => reprocessEvent(selectedEvent.id)}
      />
    </div>
  );
}
```

---

### 4.6 System Health Dashboard

**User Story**: As a platform admin, I can monitor system health and uptime.

```typescript
// apps/client/src/pages/admin/SystemHealthPage.tsx

export function SystemHealthPage() {
  const { data: health } = useQuery({
    queryKey: ['admin', 'system-health'],
    queryFn: () => api.get('/admin/system-health'),
    refetchInterval: 30000, // Every 30 seconds
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">System Health</h1>

      {/* Overall Status */}
      <Card className={cn(
        'p-6',
        health?.status === 'healthy' ? 'bg-emerald-50 border-emerald-200' :
        health?.status === 'degraded' ? 'bg-amber-50 border-amber-200' :
        'bg-red-50 border-red-200'
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-12 w-12 rounded-full flex items-center justify-center',
            health?.status === 'healthy' ? 'bg-emerald-100' : 'bg-red-100'
          )}>
            {health?.status === 'healthy' ? (
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-red-600" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {health?.status === 'healthy' ? 'All Systems Operational' : 'Issues Detected'}
            </h2>
            <p className="text-slate-600">Last checked: {formatDate(health?.checkedAt)}</p>
          </div>
        </div>
      </Card>

      {/* Service Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ServiceStatusCard
          name="API Server"
          status={health?.services.api}
          latency={health?.latencies.api}
        />
        <ServiceStatusCard
          name="Database"
          status={health?.services.database}
          latency={health?.latencies.database}
        />
        <ServiceStatusCard
          name="Stripe"
          status={health?.services.stripe}
          latency={health?.latencies.stripe}
        />
        <ServiceStatusCard
          name="Email (Resend)"
          status={health?.services.email}
          latency={health?.latencies.email}
        />
        <ServiceStatusCard
          name="Supabase Auth"
          status={health?.services.supabase}
          latency={health?.latencies.supabase}
        />
        <ServiceStatusCard
          name="Background Jobs"
          status={health?.services.jobs}
        />
      </div>

      {/* Error Rate Chart */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Error Rate (24h)</h2>
        <ErrorRateChart data={health?.errorRate} />
      </Card>

      {/* Recent Errors */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Recent Errors</h2>
        <RecentErrorsList errors={health?.recentErrors} />
      </Card>
    </div>
  );
}
```

**Backend Health Check Endpoint**:

```typescript
// apps/server/src/v1/routes/admin.ts

admin.get('/system-health', async (c) => {
  const checks = await Promise.allSettled([
    // Database check
    db.execute(sql`SELECT 1`).then(() => ({ service: 'database', status: 'healthy' })),

    // Stripe check
    stripe.customers.list({ limit: 1 }).then(() => ({ service: 'stripe', status: 'healthy' })),

    // Email check (just verify API key is valid)
    resend.domains.list().then(() => ({ service: 'email', status: 'healthy' })),

    // Supabase check
    supabase.auth.getSession().then(() => ({ service: 'supabase', status: 'healthy' })),
  ]);

  const services: Record<string, 'healthy' | 'unhealthy'> = {};
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  for (const check of checks) {
    if (check.status === 'fulfilled') {
      services[check.value.service] = 'healthy';
    } else {
      services[check.reason?.service || 'unknown'] = 'unhealthy';
      overallStatus = 'degraded';
    }
  }

  return c.json({
    status: overallStatus,
    services,
    checkedAt: new Date().toISOString(),
  });
});
```

---

## Admin Navigation

```typescript
// apps/client/src/components/admin/AdminSidebar.tsx

const adminNav = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/revenue', label: 'Revenue', icon: DollarSign },
  { href: '/admin/subscriptions', label: 'Subscription Health', icon: HeartPulse },
  { href: '/admin/tenants', label: 'Organizations', icon: Building2 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/plans', label: 'Plans', icon: CreditCard },
  { href: '/admin/webhooks', label: 'Webhook Logs', icon: Webhook },
  { href: '/admin/system', label: 'System Health', icon: Activity },
  { href: '/admin/audit', label: 'Audit Log', icon: ScrollText },
];
```

---

## API Endpoints Summary

| Method | Path                                    | Description               |
| ------ | --------------------------------------- | ------------------------- |
| GET    | /admin/revenue/metrics                  | Get revenue metrics       |
| GET    | /admin/revenue/chart                    | Get revenue chart data    |
| GET    | /admin/subscriptions/at-risk            | Get at-risk subscriptions |
| POST   | /admin/subscriptions/:id/extend-trial   | Extend trial              |
| POST   | /admin/subscriptions/:id/apply-discount | Apply discount            |
| POST   | /admin/subscriptions/:id/cancel         | Cancel subscription       |
| POST   | /admin/impersonate/:userId              | Start impersonation       |
| POST   | /admin/impersonate/end                  | End impersonation         |
| GET    | /admin/webhook-logs                     | Get webhook event logs    |
| POST   | /admin/webhook-logs/:id/reprocess       | Reprocess failed event    |
| GET    | /admin/system-health                    | Get system health status  |

---

## Files to Create

```
apps/client/src/pages/admin/
├── RevenueDashboard.tsx
├── SubscriptionHealthPage.tsx
├── WebhookLogsPage.tsx
├── SystemHealthPage.tsx
└── components/
    ├── MetricCard.tsx
    ├── RevenueChart.tsx
    ├── ServiceStatusCard.tsx
    └── EventDetailModal.tsx

apps/server/src/services/
├── revenue.service.ts
├── health.service.ts
└── impersonation.service.ts
```

---

## Testing Checklist

- [ ] Revenue metrics calculate correctly
- [ ] At-risk subscriptions identified correctly
- [ ] Trial extension works
- [ ] Discount application works
- [ ] Impersonation starts correctly
- [ ] Impersonation banner shows
- [ ] Impersonation expires after 30 minutes
- [ ] Webhook logs display correctly
- [ ] Failed webhooks can be reprocessed
- [ ] System health checks all services

---

## Success Metrics

- Admin can resolve 80% of support issues without code access
- Mean time to identify payment issues < 1 hour
- System health page loads in < 1 second
- Zero unauthorized impersonation incidents
