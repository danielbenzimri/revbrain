# Phase 7: Infrastructure Extras

## Overview

This phase covers the "plumbing" that makes a SaaS reliable and scalable: background jobs, file storage, search, feature flags, and analytics. These are enablers for other features rather than user-facing features themselves.

---

## Deliverables

### 7.1 Background Jobs System

**Why Needed**:

- Sending emails (don't block requests)
- Processing data exports
- Scheduled tasks (trial reminders, cleanup)
- Webhook retries
- Heavy computations

**Options**:

| Solution           | Pros                                   | Cons              | Cost                   |
| ------------------ | -------------------------------------- | ----------------- | ---------------------- |
| **Inngest**        | Serverless, great DX, built-in retries | New technology    | Free tier, then $50/mo |
| **Trigger.dev**    | Open source, good DX                   | Self-host or pay  | Free tier available    |
| **BullMQ + Redis** | Battle-tested, full control            | Self-manage Redis | Redis hosting cost     |
| **pg-boss**        | Uses Postgres, no extra infra          | Less features     | Free                   |

**Recommendation**: Start with **Inngest** for simplicity, or **BullMQ** if you want full control.

**Implementation with Inngest**:

```typescript
// apps/server/src/lib/inngest.ts
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'revbrain',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// apps/server/src/jobs/index.ts
import { inngest } from '../lib/inngest';

// Define job functions
export const sendEmail = inngest.createFunction(
  { id: 'send-email', retries: 3 },
  { event: 'email/send' },
  async ({ event }) => {
    const { to, subject, template, data } = event.data;
    await emailService.send({ to, subject, template, data });
  }
);

export const processDataExport = inngest.createFunction(
  { id: 'data-export', retries: 1 },
  { event: 'org/data-export' },
  async ({ event, step }) => {
    const { jobId } = event.data;

    // Step 1: Collect data
    const data = await step.run('collect-data', async () => {
      return await collectOrgData(jobId);
    });

    // Step 2: Create ZIP
    const zipBuffer = await step.run('create-zip', async () => {
      return await createZipFile(data);
    });

    // Step 3: Upload
    const fileUrl = await step.run('upload', async () => {
      return await uploadToStorage(zipBuffer);
    });

    // Step 4: Notify user
    await step.run('notify', async () => {
      await sendExportReadyEmail(jobId, fileUrl);
    });
  }
);

export const trialEndingReminder = inngest.createFunction(
  { id: 'trial-ending-reminder' },
  { cron: '0 9 * * *' }, // Every day at 9 AM
  async () => {
    const endingTrials = await getTrialsEndingIn(3); // 3 days
    for (const sub of endingTrials) {
      await inngest.send({
        name: 'email/send',
        data: {
          to: sub.ownerEmail,
          subject: 'Your trial ends in 3 days',
          template: 'trial-ending',
          data: { trialEndDate: sub.trialEnd },
        },
      });
    }
  }
);

export const cleanupExpiredInvitations = inngest.createFunction(
  { id: 'cleanup-invitations' },
  { cron: '0 0 * * *' }, // Every day at midnight
  async () => {
    await db.delete(invitations).where(lt(invitations.expiresAt, new Date()));
  }
);

// apps/server/src/index.ts
import { serve } from 'inngest/hono';
import * as jobs from './jobs';

// Serve Inngest functions
app.on(
  ['GET', 'POST', 'PUT'],
  '/api/inngest',
  serve({
    client: inngest,
    functions: Object.values(jobs),
  })
);
```

**Triggering Jobs**:

```typescript
// Instead of calling emailService directly:
await inngest.send({
  name: 'email/send',
  data: { to, subject, template, data },
});

// Instead of processing synchronously:
await inngest.send({
  name: 'org/data-export',
  data: { jobId: export.id },
});
```

---

### 7.2 File Storage

**Use Cases**:

- User avatars
- Organization logos
- Document uploads
- Data exports
- Attachments

**Options**:

| Solution             | Pros                       | Cons             |
| -------------------- | -------------------------- | ---------------- |
| **Supabase Storage** | Already integrated, simple | Tied to Supabase |
| **Cloudflare R2**    | Cheap, S3-compatible, fast | Newer service    |
| **AWS S3**           | Industry standard, mature  | Complex pricing  |
| **Uploadthing**      | Great DX for uploads       | Limited features |

**Recommendation**: Use **Supabase Storage** (already in stack) or **Cloudflare R2** for cost.

**Implementation with Supabase Storage**:

```typescript
// apps/server/src/services/storage.service.ts
import { supabase } from '../lib/supabase';

export class StorageService {
  private bucketName = 'uploads';

  async upload(file: File, path: string, options?: { public?: boolean }): Promise<string> {
    const { data, error } = await supabase.storage.from(this.bucketName).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) throw error;

    if (options?.public) {
      const { data: urlData } = supabase.storage.from(this.bucketName).getPublicUrl(data.path);
      return urlData.publicUrl;
    }

    return data.path;
  }

  async getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(this.bucketName)
      .createSignedUrl(path, expiresIn);

    if (error) throw error;
    return data.signedUrl;
  }

  async delete(path: string): Promise<void> {
    const { error } = await supabase.storage.from(this.bucketName).remove([path]);

    if (error) throw error;
  }
}

export const storageService = new StorageService();
```

**Upload API Endpoint**:

```typescript
// apps/server/src/v1/routes/uploads.ts

uploads.post('/avatar', authMiddleware, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  // Validate file
  if (!file.type.startsWith('image/')) {
    return c.json({ error: 'File must be an image' }, 400);
  }

  if (file.size > 5 * 1024 * 1024) {
    // 5MB limit
    return c.json({ error: 'File too large (max 5MB)' }, 400);
  }

  const userId = c.get('user').id;
  const ext = file.name.split('.').pop();
  const path = `avatars/${userId}.${ext}`;

  const url = await storageService.upload(file, path, { public: true });

  // Update user record
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, userId));

  return c.json({ url });
});
```

**Frontend Upload Component**:

```typescript
// apps/client/src/components/FileUpload.tsx

interface FileUploadProps {
  accept?: string;
  maxSize?: number;
  onUpload: (url: string) => void;
  endpoint: string;
}

export function FileUpload({
  accept = 'image/*',
  maxSize = 5 * 1024 * 1024,
  onUpload,
  endpoint,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSize) {
      setError(`File too large (max ${maxSize / 1024 / 1024}MB)`);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.upload(endpoint, formData);
      onUpload(response.url);
    } catch (err) {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={uploading}
        className="hidden"
        id="file-upload"
      />
      <label
        htmlFor="file-upload"
        className={cn(
          'cursor-pointer border-2 border-dashed rounded-lg p-4 flex items-center justify-center',
          uploading && 'opacity-50 cursor-wait'
        )}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Upload className="h-5 w-5 mr-2" />
            Click to upload
          </>
        )}
      </label>
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
}
```

---

### 7.3 Search Infrastructure

**When Needed**:

- Full-text search across content
- Faceted search/filtering
- Autocomplete/suggestions
- Search analytics

**Options**:

| Solution           | Best For                  | Cost             |
| ------------------ | ------------------------- | ---------------- |
| **PostgreSQL FTS** | Simple search, low volume | Free             |
| **Meilisearch**    | Great DX, fast, self-host | Free (self-host) |
| **Typesense**      | Similar to Meilisearch    | Free (self-host) |
| **Algolia**        | Best features, hosted     | $$$$             |
| **ElasticSearch**  | Complex needs, scale      | Complex          |

**Recommendation**: Start with **PostgreSQL Full-Text Search**, add Meilisearch when needed.

**PostgreSQL FTS Implementation**:

```sql
-- Add search vector column
ALTER TABLE projects ADD COLUMN search_vector tsvector;

-- Create index
CREATE INDEX idx_projects_search ON projects USING GIN(search_vector);

-- Update trigger
CREATE OR REPLACE FUNCTION update_project_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.description, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_search_update
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_project_search_vector();
```

```typescript
// apps/server/src/v1/routes/search.ts

search.get('/', authMiddleware, async (c) => {
  const { q, type } = c.req.query();
  const orgId = c.get('user').organizationId;

  if (!q || q.length < 2) {
    return c.json({ results: [] });
  }

  const searchQuery = q.split(' ').join(' & '); // AND search

  const results = await db.execute(sql`
    SELECT id, name, description, 'project' as type,
           ts_rank(search_vector, to_tsquery('english', ${searchQuery})) as rank
    FROM projects
    WHERE organization_id = ${orgId}
      AND search_vector @@ to_tsquery('english', ${searchQuery})
    ORDER BY rank DESC
    LIMIT 20
  `);

  return c.json({ results });
});
```

---

### 7.4 Feature Flags

**Use Cases**:

- Gradual rollouts
- A/B testing
- Kill switches
- Beta features
- Plan-based features

**Options**:

| Solution         | Pros                   | Cons             |
| ---------------- | ---------------------- | ---------------- |
| **LaunchDarkly** | Full-featured          | Expensive        |
| **Flagsmith**    | Open source, self-host | Setup complexity |
| **PostHog**      | Flags + analytics      | Learning curve   |
| **DIY**          | Simple, no deps        | Limited features |

**Simple DIY Implementation**:

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,

  -- Targeting
  enabled BOOLEAN DEFAULT false,
  rollout_percentage INTEGER DEFAULT 0, -- 0-100
  target_plans TEXT[], -- ['pro', 'enterprise']
  target_orgs UUID[], -- Specific orgs
  target_users UUID[], -- Specific users

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```typescript
// apps/server/src/services/feature-flag.service.ts

export class FeatureFlagService {
  private cache = new Map<string, FeatureFlag>();
  private cacheExpiry = 60000; // 1 minute
  private lastFetch = 0;

  async isEnabled(
    key: string,
    context: { userId?: string; orgId?: string; planCode?: string }
  ): Promise<boolean> {
    await this.refreshCacheIfNeeded();

    const flag = this.cache.get(key);
    if (!flag) return false;

    // Global disable
    if (!flag.enabled) return false;

    // Specific user targeting
    if (flag.targetUsers?.includes(context.userId!)) return true;

    // Specific org targeting
    if (flag.targetOrgs?.includes(context.orgId!)) return true;

    // Plan targeting
    if (flag.targetPlans?.includes(context.planCode!)) return true;

    // Percentage rollout (deterministic by userId)
    if (flag.rolloutPercentage > 0 && context.userId) {
      const hash = this.hashUserId(context.userId);
      return hash < flag.rolloutPercentage;
    }

    return false;
  }

  private hashUserId(userId: string): number {
    // Simple hash to 0-100
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash << 5) - hash + userId.charCodeAt(i);
    }
    return Math.abs(hash) % 100;
  }

  private async refreshCacheIfNeeded() {
    if (Date.now() - this.lastFetch < this.cacheExpiry) return;

    const flags = await db.query.featureFlags.findMany();
    this.cache.clear();
    for (const flag of flags) {
      this.cache.set(flag.key, flag);
    }
    this.lastFetch = Date.now();
  }
}

export const featureFlagService = new FeatureFlagService();
```

**Usage**:

```typescript
// In route handler
app.get('/new-feature', authMiddleware, async (c) => {
  const user = c.get('user');

  const enabled = await featureFlagService.isEnabled('new_dashboard', {
    userId: user.id,
    orgId: user.organizationId,
    planCode: user.plan?.code,
  });

  if (!enabled) {
    return c.json({ error: 'Feature not available' }, 403);
  }

  // ... feature logic
});

// In frontend
function Dashboard() {
  const { data: flags } = useFeatureFlags();

  if (flags?.newDashboard) {
    return <NewDashboard />;
  }

  return <OldDashboard />;
}
```

---

### 7.5 Analytics Pipeline

**What to Track**:

- Page views
- Feature usage
- Conversion funnel
- Error rates
- Performance metrics

**Options**:

| Solution           | Pros                         | Cons      |
| ------------------ | ---------------------------- | --------- |
| **PostHog**        | All-in-one, self-host option | Complex   |
| **Mixpanel**       | Great for product analytics  | Expensive |
| **Amplitude**      | Similar to Mixpanel          | Expensive |
| **Plausible**      | Simple, privacy-focused      | Limited   |
| **DIY + Metabase** | Full control, cheap          | More work |

**PostHog Implementation**:

```typescript
// apps/client/src/lib/analytics.ts
import posthog from 'posthog-js';

export function initAnalytics() {
  posthog.init(process.env.VITE_POSTHOG_KEY!, {
    api_host: 'https://app.posthog.com',
    loaded: (posthog) => {
      if (import.meta.env.DEV) posthog.opt_out_capturing();
    },
  });
}

export function identify(user: User) {
  posthog.identify(user.id, {
    email: user.email,
    name: user.fullName,
    organization: user.organizationId,
    plan: user.plan?.code,
    role: user.role,
  });
}

export function track(event: string, properties?: Record<string, unknown>) {
  posthog.capture(event, properties);
}

export function page(name: string) {
  posthog.capture('$pageview', { page: name });
}

// Usage
track('project_created', { projectType: 'survey' });
track('subscription_started', { plan: 'pro', interval: 'monthly' });
track('feature_used', { feature: 'export', format: 'pdf' });
```

**Server-Side Analytics**:

```typescript
// apps/server/src/lib/analytics.ts
import { PostHog } from 'posthog-node';

const posthog = new PostHog(process.env.POSTHOG_KEY!, {
  host: 'https://app.posthog.com',
});

export function trackServerEvent(
  userId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  posthog.capture({
    distinctId: userId,
    event,
    properties,
  });
}

// Track important backend events
trackServerEvent(user.id, 'api_key_created');
trackServerEvent(user.id, 'webhook_received', { type: event.type });
trackServerEvent(user.id, 'subscription_canceled', { reason });
```

---

### 7.6 A/B Testing

**Built on Feature Flags + Analytics**:

```typescript
// apps/server/src/services/experiment.service.ts

interface Experiment {
  key: string;
  variants: string[];
  weights: number[]; // Must sum to 100
}

export class ExperimentService {
  async getVariant(experimentKey: string, userId: string): Promise<string | null> {
    const experiment = await db.query.experiments.findFirst({
      where: eq(experiments.key, experimentKey),
    });

    if (!experiment || !experiment.enabled) return null;

    // Deterministic assignment based on userId
    const hash = this.hashUserId(userId + experimentKey);
    let cumulative = 0;

    for (let i = 0; i < experiment.variants.length; i++) {
      cumulative += experiment.weights[i];
      if (hash < cumulative) {
        return experiment.variants[i];
      }
    }

    return experiment.variants[0];
  }
}

// Usage
const variant = await experimentService.getVariant('pricing_page_v2', user.id);
// variant = 'control' | 'variant_a' | 'variant_b'

// Track exposure
track('experiment_exposure', {
  experiment: 'pricing_page_v2',
  variant,
});
```

---

## Files to Create

```
apps/server/src/
├── lib/
│   ├── inngest.ts
│   └── posthog.ts
├── services/
│   ├── storage.service.ts
│   ├── search.service.ts
│   ├── feature-flag.service.ts
│   └── experiment.service.ts
├── jobs/
│   ├── index.ts
│   ├── email.job.ts
│   ├── data-export.job.ts
│   ├── trial-reminder.job.ts
│   └── cleanup.job.ts
├── v1/routes/
│   ├── uploads.ts
│   └── search.ts

apps/client/src/
├── lib/
│   └── analytics.ts
├── components/
│   ├── FileUpload.tsx
│   └── SearchInput.tsx
├── hooks/
│   ├── use-feature-flag.ts
│   └── use-analytics.ts

packages/database/src/schema/
├── feature-flags.ts
└── experiments.ts
```

---

## Infrastructure Costs Summary

| Service          | Free Tier     | Paid              |
| ---------------- | ------------- | ----------------- |
| Inngest          | 25k events/mo | $50/mo            |
| Supabase Storage | 1GB           | $0.021/GB         |
| PostHog          | 1M events/mo  | $0/mo (self-host) |
| Meilisearch      | Self-host     | Cloud: $30/mo     |

**Total Additional Cost**: ~$50-100/month for modest usage

---

## Testing Checklist

### Background Jobs

- [ ] Email jobs process and retry on failure
- [ ] Data export completes for large orgs
- [ ] Scheduled jobs run on time
- [ ] Failed jobs are logged

### File Storage

- [ ] Upload works for valid files
- [ ] Invalid files rejected
- [ ] File size limits enforced
- [ ] Signed URLs expire correctly

### Feature Flags

- [ ] Flags can be toggled
- [ ] Percentage rollout is consistent per user
- [ ] Plan targeting works
- [ ] Cache invalidates properly

### Analytics

- [ ] Events track correctly
- [ ] User identification works
- [ ] Server events captured
- [ ] No tracking in dev mode

---

## Success Metrics

- Job failure rate < 1%
- File upload success rate > 99%
- Search latency p95 < 200ms
- Analytics event delivery > 99%
