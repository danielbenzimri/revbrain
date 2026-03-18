# Phase 1: Email Infrastructure

## Overview

Email is the backbone of SaaS communication. Before implementing billing (which requires receipts, failed payment alerts) or invitations (which require invite emails), we need a robust email system.

---

## Why Email First?

1. **Invitations need email** (Phase 0 creates invitations, Phase 1 sends them)
2. **Billing needs email** (receipts, payment failures, subscription changes)
3. **Transactional emails are table stakes** (password reset, welcome, etc.)
4. **Professional emails build trust** (custom domain, branded templates)

---

## Technology Choice: Resend

**Why Resend over SendGrid/Mailgun**:

- Modern DX (React Email for templates)
- Simple pricing ($0 for 3k emails/month, then $20/month)
- Excellent TypeScript SDK
- Built-in analytics
- Easy domain verification

**Alternative**: SendGrid (more enterprise, complex), Postmark (excellent deliverability)

---

## Deliverables

### 1.1 Email Service Setup

**Implementation**:

1. **Install Dependencies**

   ```bash
   pnpm add resend @react-email/components -w --filter @geometrix/server
   ```

2. **Environment Configuration**

   ```env
   # .env
   RESEND_API_KEY=re_xxxxx
   EMAIL_FROM=Geometrix <hello@geometrix.io>
   EMAIL_REPLY_TO=support@geometrix.io
   ```

3. **Email Service Interface** (Hexagonal Pattern)

   ```typescript
   // packages/contract/src/ports/email.port.ts
   export interface EmailPort {
     send(options: SendEmailOptions): Promise<EmailResult>;
     sendBatch(emails: SendEmailOptions[]): Promise<EmailResult[]>;
   }

   export interface SendEmailOptions {
     to: string | string[];
     subject: string;
     template: EmailTemplate;
     data: Record<string, unknown>;
     replyTo?: string;
   }

   export type EmailTemplate =
     | 'welcome'
     | 'invite'
     | 'password-reset'
     | 'email-verification'
     | 'payment-receipt'
     | 'payment-failed'
     | 'subscription-changed'
     | 'trial-ending'
     | 'trial-ended';

   export interface EmailResult {
     id: string;
     success: boolean;
     error?: string;
   }
   ```

4. **Resend Adapter**

   ```typescript
   // apps/server/src/adapters/resend-email.adapter.ts
   import { Resend } from 'resend';
   import type { EmailPort, SendEmailOptions, EmailResult } from '@geometrix/contract';

   export class ResendEmailAdapter implements EmailPort {
     private client: Resend;
     private fromAddress: string;

     constructor(apiKey: string, fromAddress: string) {
       this.client = new Resend(apiKey);
       this.fromAddress = fromAddress;
     }

     async send(options: SendEmailOptions): Promise<EmailResult> {
       try {
         const html = await this.renderTemplate(options.template, options.data);

         const result = await this.client.emails.send({
           from: this.fromAddress,
           to: options.to,
           subject: options.subject,
           html,
           replyTo: options.replyTo,
         });

         return {
           id: result.data?.id || '',
           success: true,
         };
       } catch (error) {
         console.error('[Email] Send failed:', error);
         return {
           id: '',
           success: false,
           error: error instanceof Error ? error.message : 'Unknown error',
         };
       }
     }

     async sendBatch(emails: SendEmailOptions[]): Promise<EmailResult[]> {
       return Promise.all(emails.map((email) => this.send(email)));
     }

     private async renderTemplate(
       template: EmailTemplate,
       data: Record<string, unknown>
     ): Promise<string> {
       // Import and render React Email template
       const templates = await import('../emails');
       const Template = templates[template];
       return render(Template(data));
     }
   }
   ```

5. **Dependency Injection**

   ```typescript
   // apps/server/src/services/index.ts
   import { ResendEmailAdapter } from '../adapters/resend-email.adapter';

   export const emailService = new ResendEmailAdapter(
     process.env.RESEND_API_KEY!,
     process.env.EMAIL_FROM!
   );
   ```

**Acceptance Criteria**:

- [ ] Resend account created and API key configured
- [ ] Domain verified in Resend (for deliverability)
- [ ] Email service can send basic emails
- [ ] Error handling and logging in place

---

### 1.2 Email Templates

**Using React Email** for type-safe, component-based email templates.

1. **Install React Email**

   ```bash
   pnpm add @react-email/components react-email -w --filter @geometrix/server
   ```

2. **Template Structure**

   ```
   apps/server/src/emails/
   ├── index.ts              # Export all templates
   ├── components/
   │   ├── Layout.tsx        # Common layout wrapper
   │   ├── Button.tsx        # CTA button
   │   ├── Footer.tsx        # Unsubscribe, company info
   │   └── Logo.tsx          # Brand logo
   └── templates/
       ├── Welcome.tsx
       ├── Invite.tsx
       ├── PasswordReset.tsx
       ├── EmailVerification.tsx
       ├── PaymentReceipt.tsx
       ├── PaymentFailed.tsx
       ├── SubscriptionChanged.tsx
       ├── TrialEnding.tsx
       └── TrialEnded.tsx
   ```

3. **Base Layout Component**

   ```tsx
   // apps/server/src/emails/components/Layout.tsx
   import { Html, Head, Body, Container, Section, Img, Text, Link } from '@react-email/components';

   interface LayoutProps {
     children: React.ReactNode;
     previewText?: string;
   }

   export function Layout({ children, previewText }: LayoutProps) {
     return (
       <Html>
         <Head />
         {previewText && <span style={{ display: 'none' }}>{previewText}</span>}
         <Body style={bodyStyle}>
           <Container style={containerStyle}>
             {/* Header with Logo */}
             <Section style={headerStyle}>
               <Img src="https://geometrix.io/logo.png" width="150" alt="Geometrix" />
             </Section>

             {/* Content */}
             <Section style={contentStyle}>{children}</Section>

             {/* Footer */}
             <Section style={footerStyle}>
               <Text style={footerTextStyle}>Geometrix Inc. | 123 Main St, City</Text>
               <Link href="{{unsubscribe_url}}" style={linkStyle}>
                 Unsubscribe
               </Link>
             </Section>
           </Container>
         </Body>
       </Html>
     );
   }

   const bodyStyle = {
     backgroundColor: '#f6f9fc',
     fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
   };

   const containerStyle = {
     margin: '0 auto',
     padding: '20px 0',
     maxWidth: '600px',
   };

   // ... other styles
   ```

4. **Welcome Email Template**

   ```tsx
   // apps/server/src/emails/templates/Welcome.tsx
   import { Text, Button, Section } from '@react-email/components';
   import { Layout } from '../components/Layout';

   interface WelcomeEmailProps {
     userName: string;
     orgName: string;
     loginUrl: string;
   }

   export function Welcome({ userName, orgName, loginUrl }: WelcomeEmailProps) {
     return (
       <Layout previewText={`Welcome to Geometrix, ${userName}!`}>
         <Text style={headingStyle}>Welcome to Geometrix! 🎉</Text>

         <Text style={textStyle}>Hi {userName},</Text>

         <Text style={textStyle}>
           Your organization <strong>{orgName}</strong> is all set up and ready to go. We're excited
           to have you on board!
         </Text>

         <Section style={buttonContainerStyle}>
           <Button style={buttonStyle} href={loginUrl}>
             Get Started
           </Button>
         </Section>

         <Text style={textStyle}>
           If you have any questions, just reply to this email - we're here to help.
         </Text>

         <Text style={signatureStyle}>— The Geometrix Team</Text>
       </Layout>
     );
   }

   export default Welcome;
   ```

5. **Invitation Email Template**

   ```tsx
   // apps/server/src/emails/templates/Invite.tsx
   import { Text, Button, Section } from '@react-email/components';
   import { Layout } from '../components/Layout';

   interface InviteEmailProps {
     inviterName: string;
     orgName: string;
     role: string;
     inviteUrl: string;
     expiresIn: string; // e.g., "7 days"
   }

   export function Invite({ inviterName, orgName, role, inviteUrl, expiresIn }: InviteEmailProps) {
     return (
       <Layout previewText={`${inviterName} invited you to join ${orgName}`}>
         <Text style={headingStyle}>You've been invited! 🎊</Text>

         <Text style={textStyle}>
           <strong>{inviterName}</strong> has invited you to join <strong>{orgName}</strong> as a{' '}
           <strong>{role}</strong>.
         </Text>

         <Section style={buttonContainerStyle}>
           <Button style={buttonStyle} href={inviteUrl}>
             Accept Invitation
           </Button>
         </Section>

         <Text style={smallTextStyle}>
           This invitation expires in {expiresIn}. If you weren't expecting this invitation, you can
           safely ignore this email.
         </Text>
       </Layout>
     );
   }

   export default Invite;
   ```

6. **Password Reset Email**

   ```tsx
   // apps/server/src/emails/templates/PasswordReset.tsx
   interface PasswordResetProps {
     resetUrl: string;
     expiresIn: string;
   }

   export function PasswordReset({ resetUrl, expiresIn }: PasswordResetProps) {
     return (
       <Layout previewText="Reset your Geometrix password">
         <Text style={headingStyle}>Reset your password</Text>

         <Text style={textStyle}>
           We received a request to reset your password. Click the button below to choose a new
           password:
         </Text>

         <Section style={buttonContainerStyle}>
           <Button style={buttonStyle} href={resetUrl}>
             Reset Password
           </Button>
         </Section>

         <Text style={smallTextStyle}>
           This link expires in {expiresIn}. If you didn't request a password reset, you can safely
           ignore this email.
         </Text>
       </Layout>
     );
   }
   ```

7. **Payment Failed Email** (for Phase 2)

   ```tsx
   // apps/server/src/emails/templates/PaymentFailed.tsx
   interface PaymentFailedProps {
     userName: string;
     amount: string;
     updatePaymentUrl: string;
     retryDate: string;
   }

   export function PaymentFailed({
     userName,
     amount,
     updatePaymentUrl,
     retryDate,
   }: PaymentFailedProps) {
     return (
       <Layout previewText="Action required: Payment failed">
         <Text style={headingStyle}>Payment Failed ⚠️</Text>

         <Text style={textStyle}>Hi {userName},</Text>

         <Text style={textStyle}>
           We couldn't process your payment of <strong>{amount}</strong>. Please update your payment
           method to avoid service interruption.
         </Text>

         <Section style={buttonContainerStyle}>
           <Button style={buttonStyle} href={updatePaymentUrl}>
             Update Payment Method
           </Button>
         </Section>

         <Text style={smallTextStyle}>We'll automatically retry the payment on {retryDate}.</Text>
       </Layout>
     );
   }
   ```

**Acceptance Criteria**:

- [ ] All core templates created
- [ ] Templates render correctly (test with react-email preview)
- [ ] Templates are mobile-responsive
- [ ] Brand colors and logo in place
- [ ] Unsubscribe link working (for marketing emails)

---

### 1.3 Email Sending Integration

**Connect email to existing flows**:

1. **Update Invitation Service** (from Phase 0)

   ```typescript
   // apps/server/src/services/invitation.service.ts
   import { emailService } from './index';

   async createInvitation(data: CreateInvitationInput): Promise<Invitation> {
     // ... create invitation record ...

     // Send invitation email
     await emailService.send({
       to: data.email,
       subject: `${inviter.fullName} invited you to join ${org.name}`,
       template: 'invite',
       data: {
         inviterName: inviter.fullName,
         orgName: org.name,
         role: data.role,
         inviteUrl: `${APP_URL}/accept-invite?token=${invitation.token}`,
         expiresIn: '7 days',
       },
     });

     return invitation;
   }
   ```

2. **Password Reset Email**

   ```typescript
   // apps/server/src/v1/routes/auth.ts
   app.post('/auth/forgot-password', async (c) => {
     const { email } = await c.req.json();

     // Generate reset token via Supabase
     const { error } = await supabase.auth.resetPasswordForEmail(email, {
       redirectTo: `${APP_URL}/reset-password`,
     });

     // Supabase handles the email, but we could customize:
     // await emailService.send({
     //   to: email,
     //   subject: 'Reset your password',
     //   template: 'password-reset',
     //   data: { resetUrl, expiresIn: '1 hour' },
     // });

     // Always return success (don't reveal if email exists)
     return c.json({ success: true });
   });
   ```

3. **Welcome Email on Signup**
   ```typescript
   // After user signs up and verifies email
   async function onUserVerified(user: User, org: Organization) {
     await emailService.send({
       to: user.email,
       subject: 'Welcome to Geometrix!',
       template: 'welcome',
       data: {
         userName: user.fullName,
         orgName: org.name,
         loginUrl: `${APP_URL}/login`,
       },
     });
   }
   ```

**Acceptance Criteria**:

- [ ] Invitation emails sent automatically
- [ ] Password reset emails working
- [ ] Welcome email sent on first login
- [ ] Emails logged for debugging
- [ ] Failed emails don't crash the flow (graceful degradation)

---

### 1.4 Email Preview & Testing

1. **React Email Dev Server** (for template development)

   ```json
   // package.json scripts
   {
     "scripts": {
       "email:dev": "email dev --dir apps/server/src/emails/templates"
     }
   }
   ```

2. **Test Email Endpoint** (development only)

   ```typescript
   // apps/server/src/v1/routes/dev.ts
   if (process.env.NODE_ENV === 'development') {
     app.post('/dev/test-email', async (c) => {
       const { template, to, data } = await c.req.json();

       const result = await emailService.send({
         to: to || 'test@example.com',
         subject: `Test: ${template}`,
         template,
         data,
       });

       return c.json(result);
     });
   }
   ```

3. **Email Logs Table** (optional but recommended)
   ```sql
   CREATE TABLE email_logs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     to_address TEXT NOT NULL,
     subject TEXT NOT NULL,
     template TEXT NOT NULL,
     status TEXT NOT NULL, -- 'sent', 'failed', 'bounced'
     provider_id TEXT,
     error TEXT,
     metadata JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```

**Acceptance Criteria**:

- [ ] Can preview templates locally with hot reload
- [ ] Can send test emails in development
- [ ] Email sends are logged
- [ ] Can debug failed emails

---

### 1.5 Domain Configuration

**For production deliverability**:

1. **Resend Domain Setup**
   - Add domain in Resend dashboard
   - Add DNS records (DKIM, SPF, DMARC)
   - Verify domain
   - Set as default sending domain

2. **DNS Records to Add**

   ```
   Type: TXT
   Name: @
   Value: v=spf1 include:_spf.resend.com ~all

   Type: TXT
   Name: resend._domainkey
   Value: (provided by Resend)

   Type: TXT
   Name: _dmarc
   Value: v=DMARC1; p=none; rua=mailto:dmarc@geometrix.io
   ```

3. **Environment Variables**

   ```env
   # Production
   EMAIL_FROM=Geometrix <hello@geometrix.io>
   EMAIL_REPLY_TO=support@geometrix.io

   # Development (use Resend's test domain)
   EMAIL_FROM=Geometrix <onboarding@resend.dev>
   ```

---

## Directory Structure

```
apps/server/src/
├── adapters/
│   └── resend-email.adapter.ts
├── emails/
│   ├── index.ts
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── Button.tsx
│   │   ├── Footer.tsx
│   │   └── Logo.tsx
│   └── templates/
│       ├── Welcome.tsx
│       ├── Invite.tsx
│       ├── PasswordReset.tsx
│       ├── EmailVerification.tsx
│       ├── PaymentReceipt.tsx
│       ├── PaymentFailed.tsx
│       ├── SubscriptionChanged.tsx
│       ├── TrialEnding.tsx
│       └── TrialEnded.tsx
└── services/
    └── email.service.ts

packages/contract/src/ports/
└── email.port.ts
```

---

## Email Template Checklist

| Template             | Trigger                        | Priority         |
| -------------------- | ------------------------------ | ---------------- |
| Welcome              | First login after verification | High             |
| Invite               | Admin invites user             | High             |
| Password Reset       | User requests reset            | High             |
| Email Verification   | User signs up                  | High             |
| Payment Receipt      | Successful payment             | High (Phase 2)   |
| Payment Failed       | Payment fails                  | High (Phase 2)   |
| Subscription Changed | Plan upgrade/downgrade         | Medium (Phase 2) |
| Trial Ending         | 3 days before trial ends       | Medium (Phase 2) |
| Trial Ended          | Trial expires                  | Medium (Phase 2) |
| Weekly Summary       | Every Monday                   | Low (Phase 5)    |
| Inactivity Reminder  | No login for 14 days           | Low (Phase 5)    |

---

## Testing Checklist

- [ ] Send email to real inbox (not just logs)
- [ ] Email renders correctly in Gmail
- [ ] Email renders correctly in Outlook
- [ ] Email renders correctly on mobile
- [ ] Links in emails work
- [ ] Unsubscribe link works
- [ ] Emails don't go to spam (check SpamAssassin score)
- [ ] Rate limiting works (don't send 100 emails/second)

---

## Dependencies

- **Requires**: Phase 0 (invitation flow needs email)
- **Enables**: Phase 2 (billing needs email for receipts)

---

## Cost Estimate

| Provider | Free Tier   | Paid              |
| -------- | ----------- | ----------------- |
| Resend   | 3,000/month | $20/month for 50k |
| SendGrid | 100/day     | $15/month for 40k |
| Postmark | 100/month   | $10/month for 10k |

**Recommendation**: Start with Resend free tier, upgrade as needed.

---

## Success Metrics

- Email delivery rate > 98%
- Email open rate > 40% (transactional)
- Spam complaint rate < 0.1%
- Average delivery time < 30 seconds
