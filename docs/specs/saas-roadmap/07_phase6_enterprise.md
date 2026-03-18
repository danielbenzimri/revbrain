# Phase 6: Enterprise Features

## Overview

Enterprise customers have different needs: security (SSO), branding (white-label), compliance (audit, data export), and custom contracts. These features enable you to close larger deals and move upmarket.

**Note**: These features are typically "Enterprise Plan" upsells - they justify higher pricing.

---

## Deliverables

### 6.1 SSO/SAML Integration

**User Story**: As an enterprise IT admin, I can configure SSO so employees log in with corporate credentials.

**How SAML Works**:

```
1. User visits app.revbrain.io
2. App detects user's domain is configured for SSO
3. App redirects to corporate IdP (Okta, Azure AD, etc.)
4. User authenticates with corporate credentials
5. IdP redirects back with SAML assertion
6. App validates assertion and creates session
```

**Providers to Support**:

- Okta
- Azure AD
- Google Workspace
- OneLogin
- Generic SAML 2.0

**Database Schema**:

```sql
-- SSO configuration per organization
CREATE TABLE sso_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) UNIQUE,

  -- SAML settings
  provider TEXT NOT NULL, -- 'okta', 'azure', 'google', 'custom'
  saml_issuer TEXT,
  saml_sso_url TEXT,
  saml_certificate TEXT, -- Public cert from IdP

  -- Domain mapping
  email_domains TEXT[] NOT NULL, -- ['acme.com', 'acme.co.uk']

  -- Settings
  enforce_sso BOOLEAN DEFAULT false, -- Block password login
  auto_provision BOOLEAN DEFAULT true, -- Create users on first login
  default_role TEXT DEFAULT 'member',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_sso_domains ON sso_configurations
  USING GIN (email_domains);
```

**Implementation using WorkOS** (recommended for simplicity):

```typescript
// apps/server/src/lib/workos.ts
import { WorkOS } from '@workos-inc/node';

export const workos = new WorkOS(process.env.WORKOS_API_KEY);

// apps/server/src/v1/routes/sso.ts
import { workos } from '../../lib/workos';

/**
 * Initiate SSO login
 * GET /auth/sso?email=user@acme.com
 */
sso.get('/auth/sso', async (c) => {
  const email = c.req.query('email');
  const domain = email?.split('@')[1];

  // Find SSO config for domain
  const ssoConfig = await db.query.ssoConfigurations.findFirst({
    where: arrayContains(ssoConfigurations.emailDomains, [domain]),
  });

  if (!ssoConfig) {
    return c.json({ error: 'SSO not configured for this domain' }, 400);
  }

  // Get authorization URL from WorkOS
  const authorizationUrl = workos.sso.getAuthorizationURL({
    organization: ssoConfig.workosOrgId,
    redirectURI: `${process.env.APP_URL}/auth/sso/callback`,
    state: JSON.stringify({ email, orgId: ssoConfig.organizationId }),
  });

  return c.redirect(authorizationUrl);
});

/**
 * SSO callback
 * GET /auth/sso/callback
 */
sso.get('/auth/sso/callback', async (c) => {
  const code = c.req.query('code');
  const state = JSON.parse(c.req.query('state') || '{}');

  // Exchange code for profile
  const { profile } = await workos.sso.getProfileAndToken({
    code,
    clientID: process.env.WORKOS_CLIENT_ID!,
  });

  // Find or create user
  let user = await db.query.users.findFirst({
    where: eq(users.email, profile.email),
  });

  if (!user) {
    const ssoConfig = await db.query.ssoConfigurations.findFirst({
      where: eq(ssoConfigurations.organizationId, state.orgId),
    });

    if (!ssoConfig?.autoProvision) {
      return c.redirect(`${process.env.APP_URL}/auth/sso-error?reason=no_account`);
    }

    // Auto-provision user
    [user] = await db
      .insert(users)
      .values({
        email: profile.email,
        fullName: profile.firstName + ' ' + profile.lastName,
        organizationId: state.orgId,
        role: ssoConfig.defaultRole,
        ssoId: profile.id,
      })
      .returning();
  }

  // Create session (using Supabase or custom JWT)
  const session = await createSession(user);

  return c.redirect(`${process.env.APP_URL}/dashboard?token=${session.token}`);
});
```

**Self-Service SSO Configuration UI**:

```typescript
// apps/client/src/pages/settings/SSOPage.tsx

export function SSOPage() {
  const { data: ssoConfig } = useQuery({
    queryKey: ['sso-config'],
    queryFn: () => api.get('/org/sso'),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => api.put('/org/sso', data),
  });

  // Only show for enterprise plans
  if (!plan?.features?.sso) {
    return <UpgradePrompt feature="SSO" />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Single Sign-On (SSO)</h1>

      <Card className="p-6">
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Identity Provider
              </label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectItem value="okta">Okta</SelectItem>
                <SelectItem value="azure">Azure AD</SelectItem>
                <SelectItem value="google">Google Workspace</SelectItem>
                <SelectItem value="custom">Custom SAML</SelectItem>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Email Domains
              </label>
              <Input
                placeholder="acme.com, acme.co.uk"
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">
                Users with these email domains will be redirected to SSO
              </p>
            </div>

            {provider === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    SAML SSO URL
                  </label>
                  <Input value={samlSsoUrl} onChange={...} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    SAML Certificate
                  </label>
                  <Textarea value={samlCert} onChange={...} rows={4} />
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={enforceSso} onCheckedChange={setEnforceSso} />
              <label className="text-sm">
                Require SSO (block password login)
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={autoProvision} onCheckedChange={setAutoProvision} />
              <label className="text-sm">
                Auto-provision new users on first login
              </label>
            </div>
          </div>

          <div className="mt-6">
            <Button type="submit">Save SSO Configuration</Button>
          </div>
        </form>
      </Card>

      {/* Service Provider Details (for IdP configuration) */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Service Provider Details</h2>
        <p className="text-sm text-slate-500 mb-4">
          Use these values when configuring your Identity Provider
        </p>

        <div className="space-y-3 font-mono text-sm">
          <div>
            <label className="text-slate-500">ACS URL:</label>
            <CopyableText text={`${APP_URL}/auth/sso/callback`} />
          </div>
          <div>
            <label className="text-slate-500">Entity ID:</label>
            <CopyableText text={`${APP_URL}/saml/metadata`} />
          </div>
          <div>
            <label className="text-slate-500">SP Certificate:</label>
            <Button variant="outline" size="sm" onClick={downloadCert}>
              Download
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
```

---

### 6.2 Custom Domains

**User Story**: As an enterprise customer, I can access the app via my own domain (app.acme.com).

**How It Works**:

1. Customer adds CNAME: `app.acme.com` → `custom.revbrain.io`
2. We provision SSL cert (via Let's Encrypt/Cloudflare)
3. App detects custom domain and applies org's branding

**Database**:

```sql
ALTER TABLE organizations ADD COLUMN custom_domain TEXT UNIQUE;
ALTER TABLE organizations ADD COLUMN custom_domain_verified BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN custom_domain_ssl_status TEXT;
```

**Verification Flow**:

```typescript
// apps/server/src/v1/routes/org.ts

/**
 * Add custom domain
 * POST /org/custom-domain
 */
org.post('/custom-domain', async (c) => {
  const { domain } = await c.req.json();
  const orgId = c.get('user').organizationId;

  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');

  await db
    .update(organizations)
    .set({
      customDomain: domain,
      customDomainVerified: false,
      metadata: sql`metadata || ${JSON.stringify({ domainVerificationToken: verificationToken })}`,
    })
    .where(eq(organizations.id, orgId));

  return c.json({
    verificationRecord: {
      type: 'TXT',
      name: `_revbrain-verification.${domain}`,
      value: verificationToken,
    },
    cnameRecord: {
      type: 'CNAME',
      name: domain,
      value: 'custom.revbrain.io',
    },
  });
});

/**
 * Verify custom domain
 * POST /org/custom-domain/verify
 */
org.post('/custom-domain/verify', async (c) => {
  const orgId = c.get('user').organizationId;

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org?.customDomain) {
    return c.json({ error: 'No custom domain configured' }, 400);
  }

  // Check DNS records
  const txtRecords = await dns.resolveTxt(`_revbrain-verification.${org.customDomain}`);
  const expectedToken = org.metadata?.domainVerificationToken;

  const verified = txtRecords.flat().includes(expectedToken);

  if (!verified) {
    return c.json({ error: 'DNS verification failed', verified: false });
  }

  // Provision SSL (via Cloudflare API or Let's Encrypt)
  await provisionSSL(org.customDomain);

  await db
    .update(organizations)
    .set({
      customDomainVerified: true,
      customDomainSslStatus: 'active',
    })
    .where(eq(organizations.id, orgId));

  return c.json({ verified: true });
});
```

**Reverse Proxy Configuration** (nginx/Caddy):

```nginx
# Handle custom domains
server {
    listen 443 ssl;
    server_name *.custom.revbrain.io;

    # Dynamic SSL from Cloudflare or Let's Encrypt
    ssl_certificate /etc/certs/$host/cert.pem;
    ssl_certificate_key /etc/certs/$host/key.pem;

    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Custom-Domain $host;
    }
}
```

---

### 6.3 White-Label / Custom Branding

**User Story**: As an enterprise customer, I can customize the app's appearance with my brand.

**Customizable Elements**:

- Logo
- Primary color
- Favicon
- Email templates
- Login page background
- App name (in title, emails)

**Database**:

```sql
CREATE TABLE org_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) UNIQUE,

  -- Visual branding
  logo_url TEXT,
  logo_dark_url TEXT, -- For dark mode
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#10b981', -- emerald-500
  secondary_color TEXT,

  -- Text branding
  app_name TEXT, -- Shown in title, emails
  support_email TEXT,

  -- Login page
  login_background_url TEXT,
  login_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Branding Context Provider**:

```typescript
// apps/client/src/contexts/BrandingContext.tsx

interface Branding {
  logoUrl: string;
  primaryColor: string;
  appName: string;
  // ...
}

const defaultBranding: Branding = {
  logoUrl: '/logo.svg',
  primaryColor: '#10b981',
  appName: 'RevBrain',
};

export const BrandingContext = createContext<Branding>(defaultBranding);

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState<Branding>(defaultBranding);

  useEffect(() => {
    // Detect custom domain or org-specific branding
    const customDomain = window.location.hostname;

    if (customDomain !== 'app.revbrain.io') {
      // Fetch branding for custom domain
      api.get(`/branding?domain=${customDomain}`)
        .then(setBranding)
        .catch(() => setBranding(defaultBranding));
    } else if (user?.organizationId) {
      // Fetch org branding for logged-in users
      api.get('/org/branding')
        .then(setBranding)
        .catch(() => {});
    }
  }, [user]);

  // Apply CSS variables
  useEffect(() => {
    document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
    document.title = branding.appName;

    // Update favicon
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon && branding.faviconUrl) {
      favicon.href = branding.faviconUrl;
    }
  }, [branding]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}
```

**Branding Settings UI**:

```typescript
// apps/client/src/pages/settings/BrandingPage.tsx

export function BrandingPage() {
  // Only for enterprise plans
  if (!plan?.features?.customBranding) {
    return <UpgradePrompt feature="Custom Branding" />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Branding</h1>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Logo</h2>
        <div className="flex gap-8">
          <LogoUploader
            label="Light Mode Logo"
            value={branding.logoUrl}
            onChange={(url) => update({ logoUrl: url })}
          />
          <LogoUploader
            label="Dark Mode Logo"
            value={branding.logoDarkUrl}
            onChange={(url) => update({ logoDarkUrl: url })}
          />
          <LogoUploader
            label="Favicon"
            value={branding.faviconUrl}
            onChange={(url) => update({ faviconUrl: url })}
            hint="32x32px recommended"
          />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Colors</h2>
        <div className="grid grid-cols-2 gap-4">
          <ColorPicker
            label="Primary Color"
            value={branding.primaryColor}
            onChange={(color) => update({ primaryColor: color })}
          />
          <ColorPicker
            label="Secondary Color"
            value={branding.secondaryColor}
            onChange={(color) => update({ secondaryColor: color })}
          />
        </div>
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Preview</h3>
          <BrandingPreview branding={branding} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Text</h2>
        <div className="space-y-4">
          <Input
            label="App Name"
            value={branding.appName}
            onChange={(e) => update({ appName: e.target.value })}
            placeholder="Your Company"
          />
          <Input
            label="Support Email"
            value={branding.supportEmail}
            onChange={(e) => update({ supportEmail: e.target.value })}
            placeholder="support@yourcompany.com"
          />
        </div>
      </Card>
    </div>
  );
}
```

---

### 6.4 Advanced Audit Logs

**Enterprise audit log requirements**:

- Longer retention (1+ years vs 90 days)
- More detail (IP, user agent, request body)
- Export capability (CSV, JSON)
- Integration with SIEM tools

```typescript
// Enhanced audit log entry
interface EnterpriseAuditLog {
  id: string;
  timestamp: Date;
  actor: {
    id: string;
    email: string;
    role: string;
    impersonatedBy?: string; // If admin was impersonating
  };
  action: string;
  resource: {
    type: string;
    id: string;
    name?: string;
  };
  changes?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  context: {
    ipAddress: string;
    userAgent: string;
    requestId: string;
    sessionId: string;
  };
  metadata?: Record<string, unknown>;
}

// Export endpoint
admin.get('/org/audit-logs/export', async (c) => {
  const { format, startDate, endDate } = c.req.query();

  const logs = await db.query.auditLogs.findMany({
    where: and(
      eq(auditLogs.organizationId, c.get('user').organizationId),
      gte(auditLogs.createdAt, new Date(startDate)),
      lte(auditLogs.createdAt, new Date(endDate))
    ),
    orderBy: [desc(auditLogs.createdAt)],
  });

  if (format === 'csv') {
    const csv = convertToCSV(logs);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-log-${startDate}-${endDate}.csv"`,
      },
    });
  }

  return c.json(logs);
});
```

---

### 6.5 Data Export (GDPR)

**User Story**: As an enterprise customer, I can export all my organization's data.

```typescript
// apps/server/src/v1/routes/org.ts

/**
 * Request data export
 * POST /org/data-export
 */
org.post('/data-export', async (c) => {
  const orgId = c.get('user').organizationId;

  // Create export job (async - can take minutes for large orgs)
  const job = await db
    .insert(dataExportJobs)
    .values({
      organizationId: orgId,
      requestedBy: c.get('user').id,
      status: 'pending',
    })
    .returning();

  // Queue background job
  await jobQueue.add('data-export', { jobId: job[0].id });

  return c.json({
    jobId: job[0].id,
    status: 'pending',
    message: 'Export started. You will receive an email when ready.',
  });
});

/**
 * Get export status/download
 * GET /org/data-export/:jobId
 */
org.get('/data-export/:jobId', async (c) => {
  const { jobId } = c.req.param();

  const job = await db.query.dataExportJobs.findFirst({
    where: eq(dataExportJobs.id, jobId),
  });

  if (!job) {
    return c.json({ error: 'Export not found' }, 404);
  }

  if (job.status === 'completed') {
    // Generate signed download URL
    const downloadUrl = await generateSignedUrl(job.fileUrl);
    return c.json({ status: 'completed', downloadUrl, expiresAt: job.expiresAt });
  }

  return c.json({ status: job.status });
});
```

**Background Job**:

```typescript
// apps/server/src/jobs/data-export.job.ts

export async function processDataExport(jobId: string) {
  const job = await db.query.dataExportJobs.findFirst({
    where: eq(dataExportJobs.id, jobId),
  });

  try {
    await db
      .update(dataExportJobs)
      .set({ status: 'processing' })
      .where(eq(dataExportJobs.id, jobId));

    const orgId = job!.organizationId;

    // Collect all data
    const data = {
      organization: await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      }),
      users: await db.query.users.findMany({
        where: eq(users.organizationId, orgId),
      }),
      // ... all other org data
      auditLogs: await db.query.auditLogs.findMany({
        where: eq(auditLogs.organizationId, orgId),
      }),
      exportedAt: new Date().toISOString(),
    };

    // Create ZIP file
    const zip = new AdmZip();
    zip.addFile('organization.json', Buffer.from(JSON.stringify(data.organization, null, 2)));
    zip.addFile('users.json', Buffer.from(JSON.stringify(data.users, null, 2)));
    // ... add all files

    // Upload to storage
    const fileUrl = await uploadToStorage(`exports/${orgId}/${jobId}.zip`, zip.toBuffer());

    // Update job
    await db
      .update(dataExportJobs)
      .set({
        status: 'completed',
        fileUrl,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      })
      .where(eq(dataExportJobs.id, jobId));

    // Send email notification
    await emailService.send({
      to: job!.requestedByEmail,
      subject: 'Your data export is ready',
      template: 'data-export-ready',
      data: { downloadUrl: `${APP_URL}/settings/data-export/${jobId}` },
    });
  } catch (error) {
    await db
      .update(dataExportJobs)
      .set({ status: 'failed', error: error.message })
      .where(eq(dataExportJobs.id, jobId));
  }
}
```

---

### 6.6 SLA Monitoring (Optional)

For enterprise customers with SLA commitments:

```typescript
// Track uptime and response times
interface SLAMetrics {
  uptime: number; // percentage
  avgResponseTime: number; // ms
  p99ResponseTime: number; // ms
  incidents: Incident[];
}

// Public status page: status.revbrain.io
// Consider using: Statuspage.io, Instatus, or self-hosted
```

---

## Enterprise Plan Feature Gating

```typescript
// apps/server/src/middleware/feature-gate.ts

export function requireFeature(feature: string) {
  return async (c: Context, next: Next) => {
    const org = c.get('organization');
    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, org.planId),
    });

    if (!plan?.features?.[feature]) {
      return c.json(
        {
          error: 'Feature not available',
          upgrade: true,
          feature,
        },
        403
      );
    }

    await next();
  };
}

// Usage
app.get('/org/sso', requireFeature('sso'), ssoHandler);
app.get('/org/branding', requireFeature('customBranding'), brandingHandler);
```

---

## Files to Create

```
apps/server/src/
├── lib/
│   └── workos.ts
├── v1/routes/
│   ├── sso.ts
│   └── branding.ts
├── services/
│   ├── sso.service.ts
│   └── data-export.service.ts
├── jobs/
│   └── data-export.job.ts

apps/client/src/
├── pages/settings/
│   ├── SSOPage.tsx
│   ├── CustomDomainPage.tsx
│   ├── BrandingPage.tsx
│   └── DataExportPage.tsx
├── contexts/
│   └── BrandingContext.tsx
├── components/
│   └── UpgradePrompt.tsx

packages/database/src/schema/
├── sso-configurations.ts
├── org-branding.ts
└── data-export-jobs.ts
```

---

## Third-Party Services

| Feature            | Recommended Service | Cost                  |
| ------------------ | ------------------- | --------------------- |
| SSO/SAML           | WorkOS              | $125/connection/month |
| Custom Domains SSL | Cloudflare          | Free-$20/month        |
| Status Page        | Instatus            | $20/month             |

**Alternative**: Implement SAML directly using `saml2-js` library (more complex, no cost).

---

## Success Metrics

- SSO setup completion rate > 90%
- Custom domain verification success > 95%
- Data export completes in < 5 minutes for 95% of orgs
- Zero security incidents with SSO
