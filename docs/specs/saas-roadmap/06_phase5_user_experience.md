# Phase 5: User Experience Polish

## Overview

This phase focuses on the "nice to have" features that make users love your product: notifications, onboarding, help systems, and activity tracking. These features improve retention and reduce support load.

---

## Deliverables

### 5.1 In-App Notification System

**User Story**: As a user, I receive notifications for important events without leaving the app.

**Notification Types**:
| Type | Example | Channel |
|------|---------|---------|
| Team | "John invited you to Project X" | In-app, Email |
| Billing | "Your payment failed" | In-app, Email |
| System | "New feature: Dark mode is here" | In-app only |
| Activity | "Jane commented on your document" | In-app, Email (optional) |

**Database Schema**:

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'team', 'billing', 'system', 'activity'
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT, -- Where to navigate on click
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- User notification preferences
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  email_team BOOLEAN DEFAULT true,
  email_billing BOOLEAN DEFAULT true,
  email_activity BOOLEAN DEFAULT false,
  email_marketing BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Backend Service**:

```typescript
// apps/server/src/services/notification.service.ts

interface CreateNotificationInput {
  userId: string;
  type: 'team' | 'billing' | 'system' | 'activity';
  title: string;
  body?: string;
  actionUrl?: string;
  sendEmail?: boolean;
}

export class NotificationService {
  async create(input: CreateNotificationInput): Promise<Notification> {
    // Create in-app notification
    const [notification] = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
      })
      .returning();

    // Check if user wants email for this type
    if (input.sendEmail) {
      const prefs = await this.getUserPreferences(input.userId);
      const shouldEmail = this.shouldSendEmail(prefs, input.type);

      if (shouldEmail) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, input.userId),
        });

        await emailService.send({
          to: user!.email,
          subject: input.title,
          template: 'notification',
          data: {
            title: input.title,
            body: input.body,
            actionUrl: input.actionUrl,
          },
        });
      }
    }

    return notification;
  }

  async getUnread(userId: string): Promise<Notification[]> {
    return db.query.notifications.findMany({
      where: and(eq(notifications.userId, userId), isNull(notifications.readAt)),
      orderBy: [desc(notifications.createdAt)],
      limit: 50,
    });
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  }

  async markAllAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }

  private shouldSendEmail(prefs: NotificationPreferences, type: string): boolean {
    switch (type) {
      case 'team':
        return prefs.emailTeam;
      case 'billing':
        return prefs.emailBilling;
      case 'activity':
        return prefs.emailActivity;
      default:
        return false;
    }
  }
}
```

**Frontend - Notification Bell**:

```typescript
// apps/client/src/components/NotificationBell.tsx

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get('/notifications/unread'),
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifications?.length || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b flex justify-between items-center">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {notifications?.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No new notifications
            </div>
          ) : (
            notifications?.map((notif) => (
              <NotificationItem
                key={notif.id}
                notification={notif}
                onRead={() => markReadMutation.mutate(notif.id)}
              />
            ))
          )}
        </ScrollArea>
        <div className="p-3 border-t">
          <Button variant="ghost" className="w-full" asChild>
            <Link to="/notifications">View All</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({ notification, onRead }) {
  return (
    <div
      className={cn(
        'p-3 hover:bg-slate-50 cursor-pointer border-b',
        !notification.readAt && 'bg-blue-50'
      )}
      onClick={() => {
        onRead();
        if (notification.actionUrl) {
          navigate(notification.actionUrl);
        }
      }}
    >
      <div className="flex gap-3">
        <NotificationIcon type={notification.type} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{notification.title}</p>
          {notification.body && (
            <p className="text-sm text-slate-500 truncate">{notification.body}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            {formatTimeAgo(notification.createdAt)}
          </p>
        </div>
        {!notification.readAt && (
          <div className="h-2 w-2 bg-blue-500 rounded-full" />
        )}
      </div>
    </div>
  );
}
```

---

### 5.2 Notification Preferences

```typescript
// apps/client/src/pages/settings/NotificationsPage.tsx

export function NotificationsPage() {
  const { data: prefs } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api.get('/users/me/notification-preferences'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<NotificationPrefs>) =>
      api.patch('/users/me/notification-preferences', data),
    onSuccess: () => {
      toast.success('Preferences saved');
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Notification Preferences</h1>

      <Card className="p-6 space-y-6">
        <h2 className="font-semibold">Email Notifications</h2>

        <div className="space-y-4">
          <PreferenceToggle
            label="Team updates"
            description="Invitations, role changes, member updates"
            checked={prefs?.emailTeam}
            onChange={(v) => updateMutation.mutate({ emailTeam: v })}
          />

          <PreferenceToggle
            label="Billing alerts"
            description="Payment confirmations, failures, subscription changes"
            checked={prefs?.emailBilling}
            onChange={(v) => updateMutation.mutate({ emailBilling: v })}
          />

          <PreferenceToggle
            label="Activity notifications"
            description="Comments, mentions, updates to your work"
            checked={prefs?.emailActivity}
            onChange={(v) => updateMutation.mutate({ emailActivity: v })}
          />

          <PreferenceToggle
            label="Marketing & news"
            description="Product updates, tips, and promotional content"
            checked={prefs?.emailMarketing}
            onChange={(v) => updateMutation.mutate({ emailMarketing: v })}
          />
        </div>
      </Card>
    </div>
  );
}
```

---

### 5.3 Onboarding Wizard

**User Story**: As a new user, I'm guided through initial setup to ensure success.

**Onboarding Steps**:

1. Complete profile (name, avatar)
2. Organization setup (name, type)
3. Invite team members (optional)
4. Quick product tour (interactive)

```typescript
// apps/client/src/features/onboarding/OnboardingWizard.tsx

interface OnboardingState {
  currentStep: number;
  completedSteps: string[];
  skipped: boolean;
}

const ONBOARDING_STEPS = [
  { id: 'profile', title: 'Complete Your Profile', component: ProfileStep },
  { id: 'organization', title: 'Set Up Your Organization', component: OrgStep },
  { id: 'team', title: 'Invite Your Team', component: TeamStep, optional: true },
  { id: 'tour', title: 'Quick Tour', component: TourStep },
];

export function OnboardingWizard() {
  const [state, setState] = useState<OnboardingState>({
    currentStep: 0,
    completedSteps: [],
    skipped: false,
  });

  const { data: user } = useAuth();
  const completeMutation = useMutation({
    mutationFn: () => api.post('/users/me/complete-onboarding'),
  });

  // Check if already onboarded
  if (user?.metadata?.onboardingComplete) {
    return null;
  }

  const currentStepConfig = ONBOARDING_STEPS[state.currentStep];
  const StepComponent = currentStepConfig.component;

  const handleNext = () => {
    const newCompletedSteps = [...state.completedSteps, currentStepConfig.id];

    if (state.currentStep === ONBOARDING_STEPS.length - 1) {
      // Complete onboarding
      completeMutation.mutate();
      return;
    }

    setState({
      ...state,
      currentStep: state.currentStep + 1,
      completedSteps: newCompletedSteps,
    });
  };

  const handleSkip = () => {
    if (currentStepConfig.optional) {
      handleNext();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl">
        {/* Progress Bar */}
        <div className="p-4 border-b">
          <div className="flex gap-2">
            {ONBOARDING_STEPS.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  'flex-1 h-2 rounded-full',
                  index < state.currentStep ? 'bg-emerald-500' :
                  index === state.currentStep ? 'bg-emerald-300' :
                  'bg-slate-200'
                )}
              />
            ))}
          </div>
          <p className="text-sm text-slate-500 mt-2">
            Step {state.currentStep + 1} of {ONBOARDING_STEPS.length}
          </p>
        </div>

        {/* Step Content */}
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">{currentStepConfig.title}</h2>
          <StepComponent onNext={handleNext} />
        </div>

        {/* Actions */}
        <div className="p-4 border-t flex justify-between">
          {currentStepConfig.optional && (
            <Button variant="ghost" onClick={handleSkip}>
              Skip for now
            </Button>
          )}
          <div className="flex-1" />
          <Button onClick={handleNext}>
            {state.currentStep === ONBOARDING_STEPS.length - 1 ? 'Get Started' : 'Continue'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

**Profile Step**:

```typescript
function ProfileStep({ onNext }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    fullName: user?.fullName || '',
    avatarUrl: user?.avatarUrl || '',
  });

  const updateMutation = useMutation({
    mutationFn: (data) => api.patch('/users/me', data),
    onSuccess: () => onNext(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <AvatarUpload
          value={formData.avatarUrl}
          onChange={(url) => setFormData(f => ({ ...f, avatarUrl: url }))}
        />
        <div className="flex-1">
          <Input
            label="Full Name"
            value={formData.fullName}
            onChange={(e) => setFormData(f => ({ ...f, fullName: e.target.value }))}
            placeholder="John Doe"
          />
        </div>
      </div>

      <Button
        onClick={() => updateMutation.mutate(formData)}
        disabled={!formData.fullName}
      >
        Save & Continue
      </Button>
    </div>
  );
}
```

**Product Tour** (using driver.js or similar):

```typescript
function TourStep({ onNext }) {
  useEffect(() => {
    const driver = new Driver({
      animate: true,
      opacity: 0.75,
      onReset: () => onNext(),
    });

    driver.defineSteps([
      {
        element: '#sidebar',
        popover: {
          title: 'Navigation',
          description: 'Access all features from the sidebar',
        },
      },
      {
        element: '#project-list',
        popover: {
          title: 'Your Projects',
          description: 'All your projects appear here',
        },
      },
      {
        element: '#create-button',
        popover: {
          title: 'Create New',
          description: 'Click here to create a new project',
        },
      },
      {
        element: '#settings-link',
        popover: {
          title: 'Settings',
          description: 'Manage your profile and organization settings',
        },
      },
    ]);

    driver.start();

    return () => driver.destroy();
  }, [onNext]);

  return (
    <div className="text-center">
      <p className="text-slate-600">
        Let's take a quick tour of the app. Click "Next" on each tooltip to continue.
      </p>
    </div>
  );
}
```

---

### 5.4 Activity Feed

**User Story**: As a user, I can see recent activity in my organization.

```typescript
// apps/client/src/pages/ActivityPage.tsx

export function ActivityPage() {
  const { data: activity, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['activity'],
    queryFn: ({ pageParam = 0 }) =>
      api.get('/activity', { params: { offset: pageParam, limit: 20 } }),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Activity</h1>

      <div className="space-y-0">
        {activity?.pages.flatMap(page => page.items).map((item, index, arr) => {
          const showDate = index === 0 ||
            !isSameDay(new Date(item.createdAt), new Date(arr[index - 1].createdAt));

          return (
            <Fragment key={item.id}>
              {showDate && (
                <div className="py-4">
                  <span className="text-sm font-medium text-slate-500">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
              )}
              <ActivityItem item={item} />
            </Fragment>
          );
        })}
      </div>

      {hasNextPage && (
        <Button
          variant="outline"
          className="w-full mt-4"
          onClick={() => fetchNextPage()}
        >
          Load More
        </Button>
      )}
    </div>
  );
}

function ActivityItem({ item }) {
  return (
    <div className="flex gap-4 py-3 border-b">
      <Avatar className="h-8 w-8">
        <AvatarImage src={item.user.avatarUrl} />
        <AvatarFallback>{item.user.initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <p className="text-sm">
          <span className="font-medium">{item.user.fullName}</span>
          {' '}{formatActivityAction(item)}
        </p>
        <p className="text-xs text-slate-500">
          {formatTimeAgo(item.createdAt)}
        </p>
      </div>
    </div>
  );
}

function formatActivityAction(item: ActivityItem): string {
  switch (item.action) {
    case 'project.created': return `created project "${item.metadata.projectName}"`;
    case 'user.invited': return `invited ${item.metadata.email} to the team`;
    case 'member.removed': return `removed ${item.metadata.memberName} from the team`;
    case 'settings.updated': return 'updated organization settings';
    default: return item.action;
  }
}
```

---

### 5.5 Help Center Integration

**Options**:

1. **Intercom** - Full-featured, expensive
2. **Crisp** - Good balance, affordable
3. **Help Scout** - Great for email-first support
4. **Self-hosted docs** - Docusaurus/GitBook

**Implementation (Crisp example)**:

```typescript
// apps/client/src/components/HelpWidget.tsx

declare global {
  interface Window {
    $crisp: unknown[];
    CRISP_WEBSITE_ID: string;
  }
}

export function HelpWidget() {
  const { user, org } = useAuth();

  useEffect(() => {
    // Load Crisp
    window.$crisp = [];
    window.CRISP_WEBSITE_ID = process.env.VITE_CRISP_WEBSITE_ID!;

    const script = document.createElement('script');
    script.src = 'https://client.crisp.chat/l.js';
    script.async = true;
    document.head.appendChild(script);

    // Set user data
    script.onload = () => {
      if (user) {
        window.$crisp.push(['set', 'user:email', user.email]);
        window.$crisp.push(['set', 'user:nickname', user.fullName]);
        window.$crisp.push([
          'set',
          'session:data',
          [
            ['organization', org?.name],
            ['plan', org?.plan?.name],
            ['role', user.role],
          ],
        ]);
      }
    };

    return () => {
      // Cleanup
    };
  }, [user, org]);

  return null;
}
```

**Help Button in UI**:

```typescript
// apps/client/src/components/HelpButton.tsx

export function HelpButton() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <HelpCircle className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => window.open('/docs', '_blank')}>
          <Book className="h-4 w-4 mr-2" />
          Documentation
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.$crisp.push(['do', 'chat:open'])}>
          <MessageCircle className="h-4 w-4 mr-2" />
          Contact Support
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open('/changelog', '_blank')}>
          <Sparkles className="h-4 w-4 mr-2" />
          What's New
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openFeedbackModal()}>
          <ThumbsUp className="h-4 w-4 mr-2" />
          Give Feedback
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

### 5.6 Feedback Collection

```typescript
// apps/client/src/components/FeedbackModal.tsx

export function FeedbackModal({ open, onOpenChange }) {
  const [type, setType] = useState<'bug' | 'feature' | 'other'>('feature');
  const [message, setMessage] = useState('');
  const [includeScreenshot, setIncludeScreenshot] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async (data) => {
      // Option 1: Send to your backend
      return api.post('/feedback', data);

      // Option 2: Send directly to Slack webhook
      // return fetch(SLACK_WEBHOOK, { method: 'POST', body: JSON.stringify(...) });
    },
    onSuccess: () => {
      toast.success('Thank you for your feedback!');
      onOpenChange(false);
      setMessage('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Help us improve by sharing your thoughts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {['bug', 'feature', 'other'].map((t) => (
              <Button
                key={t}
                variant={type === t ? 'default' : 'outline'}
                size="sm"
                onClick={() => setType(t)}
              >
                {t === 'bug' && <Bug className="h-4 w-4 mr-1" />}
                {t === 'feature' && <Lightbulb className="h-4 w-4 mr-1" />}
                {t === 'other' && <MessageSquare className="h-4 w-4 mr-1" />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>

          <Textarea
            placeholder="Tell us more..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />

          <div className="flex items-center gap-2">
            <Checkbox
              checked={includeScreenshot}
              onCheckedChange={setIncludeScreenshot}
            />
            <label className="text-sm text-slate-600">
              Include screenshot of current page
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => submitMutation.mutate({
              type,
              message,
              url: window.location.href,
              screenshot: includeScreenshot ? captureScreenshot() : null,
            })}
            disabled={!message || submitMutation.isPending}
          >
            {submitMutation.isPending ? 'Sending...' : 'Send Feedback'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Database Schema Summary

```sql
-- notifications
-- notification_preferences
-- activity_log (might already exist as audit_logs)
-- feedback (optional - or use external service)
```

---

## Files to Create

```
apps/client/src/
├── components/
│   ├── NotificationBell.tsx
│   ├── HelpWidget.tsx
│   ├── HelpButton.tsx
│   └── FeedbackModal.tsx
├── features/onboarding/
│   ├── OnboardingWizard.tsx
│   ├── steps/
│   │   ├── ProfileStep.tsx
│   │   ├── OrgStep.tsx
│   │   ├── TeamStep.tsx
│   │   └── TourStep.tsx
├── pages/
│   ├── ActivityPage.tsx
│   ├── NotificationsPage.tsx
│   └── settings/NotificationsPage.tsx

apps/server/src/
├── services/
│   ├── notification.service.ts
│   └── activity.service.ts
├── v1/routes/
│   ├── notifications.ts
│   └── activity.ts
```

---

## Success Metrics

- Onboarding completion rate > 80%
- Notification click-through rate > 30%
- Support ticket volume reduced by 20%
- User retention (30-day) improved by 10%
