# Phase 0: User Management Foundation

## Overview

Before adding billing or advanced features, the basic user lifecycle must work flawlessly. This phase fixes gaps in authentication flows and establishes the foundation for team collaboration.

---

## Current State

| Feature            | Status     | Location                    |
| ------------------ | ---------- | --------------------------- |
| Login              | ✅ Works   | Supabase Auth               |
| Signup             | ✅ Works   | Supabase Auth               |
| Password Reset     | ❌ Missing | No UI/flow                  |
| Email Verification | ❌ Missing | Not enforced                |
| User Invitation    | ⚠️ Partial | Creates user, no email sent |
| Session Management | ❌ Missing | No UI to view/revoke        |
| Account Deletion   | ❌ Missing | No self-service             |
| Profile Update     | ⚠️ Basic   | Name only, no avatar        |

---

## Deliverables

### 0.1 Password Reset Flow

**User Story**: As a user who forgot my password, I can reset it via email.

**Flow**:

```
1. User clicks "Forgot Password" on login page
2. User enters email
3. Backend calls Supabase auth.resetPasswordForEmail()
4. Supabase sends email with magic link
5. User clicks link → redirected to /reset-password?token=xxx
6. User enters new password
7. Backend calls auth.updateUser({ password })
8. User redirected to login with success message
```

**Implementation**:

1. **Frontend - Forgot Password Page** (`/forgot-password`)

   ```typescript
   // apps/client/src/pages/auth/ForgotPasswordPage.tsx
   - Email input form
   - Submit calls POST /api/auth/forgot-password
   - Success: "Check your email" message
   - Error: Generic "If account exists..." (security)
   ```

2. **Frontend - Reset Password Page** (`/reset-password`)

   ```typescript
   // apps/client/src/pages/auth/ResetPasswordPage.tsx
   - New password input (with confirmation)
   - Password strength indicator
   - Submit calls POST /api/auth/reset-password
   - Redirect to login on success
   ```

3. **Backend - Auth Routes**

   ```typescript
   // apps/server/src/v1/routes/auth.ts

   POST /auth/forgot-password
   - Input: { email }
   - Call supabase.auth.resetPasswordForEmail(email, { redirectTo })
   - Always return 200 (don't reveal if email exists)

   POST /auth/reset-password
   - Input: { password } (token in header/cookie from redirect)
   - Call supabase.auth.updateUser({ password })
   - Return success/error
   ```

4. **Email Template** (Supabase Dashboard)
   - Customize the reset password email template
   - Include app branding
   - Set redirect URL to `{APP_URL}/reset-password`

**Acceptance Criteria**:

- [ ] User can request password reset
- [ ] Email is received within 30 seconds
- [ ] Link works and allows password change
- [ ] Old password no longer works
- [ ] Rate limited to prevent abuse (3 requests/hour)

---

### 0.2 Email Verification

**User Story**: As a platform owner, I want to ensure users verify their email addresses.

**Flow**:

```
1. User signs up
2. Supabase sends verification email automatically
3. User clicks verification link
4. Supabase marks email as verified
5. App checks email_confirmed_at before allowing access
```

**Implementation**:

1. **Supabase Configuration**

   ```
   Dashboard → Authentication → Email Templates
   - Enable "Confirm signup" email
   - Customize template with branding
   - Set redirect URL
   ```

2. **Frontend - Verification Required Page**

   ```typescript
   // apps/client/src/pages/auth/VerifyEmailPage.tsx
   - "Please verify your email" message
   - "Resend verification email" button
   - Check verification status periodically
   ```

3. **Frontend - Auth Guard Update**

   ```typescript
   // apps/client/src/guards/AuthGuard.tsx
   - Check user.email_confirmed_at
   - If not verified, redirect to /verify-email
   - Allow resend functionality
   ```

4. **Backend - Resend Verification**
   ```typescript
   POST /auth/resend-verification
   - Rate limited (1 per minute)
   - Call supabase.auth.resend({ type: 'signup', email })
   ```

**Acceptance Criteria**:

- [ ] New signups receive verification email
- [ ] Unverified users cannot access protected routes
- [ ] Users can resend verification email
- [ ] Verified status persists across sessions

---

### 0.3 User Invitation System

**User Story**: As an org admin, I can invite team members via email who receive a link to join.

**Current Problem**: `CreateUserDrawer` creates a user record but doesn't send an actual email invitation.

**Flow**:

```
1. Org admin enters invitee email + role
2. Backend creates invitation record (NOT user record yet)
3. Backend sends invitation email with secure token
4. Invitee clicks link → /accept-invite?token=xxx
5. If new user: signup form (password only, email pre-filled)
6. If existing user: just accept and join org
7. User record created/updated, added to org
8. Invitation marked as accepted
```

**Database Changes**:

```sql
-- New table: invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  role TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(email, organization_id)  -- One pending invite per email per org
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
```

**Implementation**:

1. **Schema & Migration**

   ```typescript
   // packages/database/src/schema/invitations.ts
   export const invitations = pgTable('invitations', {
     id: uuid('id').primaryKey().defaultRandom(),
     email: text('email').notNull(),
     organizationId: uuid('organization_id')
       .notNull()
       .references(() => organizations.id),
     role: text('role').notNull(),
     invitedBy: uuid('invited_by')
       .notNull()
       .references(() => users.id),
     token: text('token').notNull().unique(),
     expiresAt: timestamp('expires_at').notNull(),
     acceptedAt: timestamp('accepted_at'),
     createdAt: timestamp('created_at').notNull().defaultNow(),
   });
   ```

2. **Backend - Invitation Service**

   ```typescript
   // apps/server/src/services/invitation.service.ts

   class InvitationService {
     async createInvitation(data: {
       email: string;
       organizationId: string;
       role: string;
       invitedBy: string;
     }): Promise<Invitation> {
       // Check if user already in org
       // Check if pending invitation exists
       // Generate secure token (crypto.randomBytes)
       // Set expiry (7 days)
       // Create invitation record
       // Send email (Phase 1 - for now just return token)
       return invitation;
     }

     async acceptInvitation(token: string, userId: string): Promise<void> {
       // Validate token exists and not expired
       // Check if already accepted
       // Add user to organization with specified role
       // Mark invitation as accepted
     }

     async listPendingInvitations(orgId: string): Promise<Invitation[]> {
       // Return all pending invitations for org
     }

     async revokeInvitation(invitationId: string): Promise<void> {
       // Delete invitation record
     }
   }
   ```

3. **Backend - Invitation Routes**

   ```typescript
   // apps/server/src/v1/routes/invitations.ts

   POST /orgs/:orgId/invitations
   - Auth: org_admin or higher
   - Input: { email, role }
   - Creates invitation, sends email
   - Returns: { invitation, inviteUrl }

   GET /orgs/:orgId/invitations
   - Auth: org_admin or higher
   - Returns: pending invitations list

   DELETE /orgs/:orgId/invitations/:id
   - Auth: org_admin or higher
   - Revokes invitation

   POST /invitations/accept
   - Auth: public (token-based)
   - Input: { token, password? }
   - Accepts invitation, creates/links user
   ```

4. **Frontend - Accept Invitation Page**

   ```typescript
   // apps/client/src/pages/auth/AcceptInvitePage.tsx
   - Parse token from URL
   - Fetch invitation details (org name, role)
   - If user logged in: "Join {org} as {role}?" button
   - If not logged in: signup form (email pre-filled, disabled)
   - On submit: accept invitation → redirect to org dashboard
   ```

5. **Update CreateUserDrawer**
   ```typescript
   // Change from creating user directly to creating invitation
   // Show pending invitations in the drawer
   // Allow resend/revoke
   ```

**Acceptance Criteria**:

- [ ] Admin can invite users by email
- [ ] Invitation email is sent (Phase 1)
- [ ] Invitation link works for new users (signup)
- [ ] Invitation link works for existing users (join)
- [ ] Invitations expire after 7 days
- [ ] Admin can see pending invitations
- [ ] Admin can revoke pending invitations
- [ ] Cannot invite same email twice to same org

---

### 0.4 Session Management

**User Story**: As a security-conscious user, I can view and revoke my active sessions.

**Implementation**:

1. **Frontend - Security Settings Page**

   ```typescript
   // apps/client/src/pages/settings/SecurityPage.tsx
   - List active sessions (device, location, last active)
   - "Sign out all other sessions" button
   - Individual session revoke button
   ```

2. **Backend Integration**

   ```typescript
   // Supabase provides session management
   GET /auth/sessions
   - Returns list of active sessions

   DELETE /auth/sessions/:id
   - Revokes specific session

   DELETE /auth/sessions
   - Revokes all sessions except current
   ```

**Note**: Supabase's session management is limited. For MVP, implement "Sign out everywhere" which invalidates all refresh tokens.

**Acceptance Criteria**:

- [ ] User can see they're logged in
- [ ] User can sign out from all devices
- [ ] Sign out works across all sessions

---

### 0.5 Account Deletion (GDPR)

**User Story**: As a user, I can delete my account and all associated data.

**Flow**:

```
1. User goes to Settings → Delete Account
2. User confirms by typing "DELETE"
3. Backend soft-deletes user (isActive = false)
4. Backend removes user from all organizations
5. After 30 days grace period: hard delete (background job - Phase 7)
```

**Implementation**:

1. **Frontend - Delete Account Section**

   ```typescript
   // apps/client/src/pages/settings/AccountPage.tsx
   - Warning message about data loss
   - Confirmation input (type "DELETE")
   - Submit button (disabled until confirmed)
   ```

2. **Backend - Account Deletion**
   ```typescript
   DELETE /users/me
   - Soft delete user (isActive = false)
   - Remove from all org memberships
   - Clear sessions
   - Queue hard delete for 30 days later
   - Send confirmation email
   ```

**Acceptance Criteria**:

- [ ] User can request account deletion
- [ ] Deletion requires explicit confirmation
- [ ] User removed from all organizations
- [ ] User cannot log in after deletion
- [ ] Confirmation email sent

---

### 0.6 Profile Management

**User Story**: As a user, I can update my profile information and avatar.

**Implementation**:

1. **Frontend - Profile Page**

   ```typescript
   // apps/client/src/pages/settings/ProfilePage.tsx
   - Full name input
   - Avatar upload (Supabase Storage - Phase 7, or external URL for MVP)
   - Phone number (optional)
   - Timezone preference
   - Language preference
   ```

2. **Backend - Profile Update**
   ```typescript
   PATCH /users/me
   - Input: { fullName, avatarUrl, phone, timezone, language }
   - Updates user record
   - Returns updated user
   ```

**Acceptance Criteria**:

- [ ] User can update their name
- [ ] User can set avatar URL
- [ ] Preferences are persisted
- [ ] Changes reflect immediately in UI

---

## Database Migrations

```sql
-- Migration: 0014_user_management_foundation.sql

-- 1. Invitations table
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_invitations_email_org ON invitations(email, organization_id)
  WHERE accepted_at IS NULL;
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_org ON invitations(organization_id);

-- 2. Add columns to users table for better profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. RLS for invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invitations for their orgs"
  ON invitations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage invitations"
  ON invitations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND organization_id = invitations.organization_id
      AND role IN ('contractor_ceo', 'client_owner', 'system_admin')
    )
  );
```

---

## API Endpoints Summary

| Method | Path                      | Auth     | Description               |
| ------ | ------------------------- | -------- | ------------------------- |
| POST   | /auth/forgot-password     | Public   | Request password reset    |
| POST   | /auth/reset-password      | Public   | Reset password with token |
| POST   | /auth/resend-verification | Public   | Resend verification email |
| GET    | /auth/sessions            | User     | List active sessions      |
| DELETE | /auth/sessions            | User     | Sign out all sessions     |
| POST   | /orgs/:id/invitations     | OrgAdmin | Create invitation         |
| GET    | /orgs/:id/invitations     | OrgAdmin | List pending invitations  |
| DELETE | /orgs/:id/invitations/:id | OrgAdmin | Revoke invitation         |
| POST   | /invitations/accept       | Public   | Accept invitation         |
| GET    | /invitations/:token       | Public   | Get invitation details    |
| PATCH  | /users/me                 | User     | Update profile            |
| DELETE | /users/me                 | User     | Delete account            |

---

## Frontend Routes Summary

| Path               | Component          | Auth   |
| ------------------ | ------------------ | ------ |
| /forgot-password   | ForgotPasswordPage | Public |
| /reset-password    | ResetPasswordPage  | Public |
| /verify-email      | VerifyEmailPage    | Public |
| /accept-invite     | AcceptInvitePage   | Public |
| /settings/profile  | ProfilePage        | User   |
| /settings/security | SecurityPage       | User   |
| /settings/account  | AccountPage        | User   |

---

## Testing Checklist

### Password Reset

- [ ] Request reset for existing email
- [ ] Request reset for non-existing email (same response)
- [ ] Click reset link within expiry
- [ ] Click expired reset link
- [ ] Reset password successfully
- [ ] Login with new password
- [ ] Old password rejected

### Email Verification

- [ ] New signup receives verification email
- [ ] Unverified user blocked from app
- [ ] Verification link works
- [ ] Resend verification works
- [ ] Rate limiting on resend

### Invitations

- [ ] Admin can create invitation
- [ ] Invitation email sent
- [ ] New user can accept (signup flow)
- [ ] Existing user can accept (join flow)
- [ ] Expired invitation rejected
- [ ] Duplicate invitation prevented
- [ ] Revoke invitation works
- [ ] Invitation list shows pending

### Account Deletion

- [ ] Deletion requires confirmation
- [ ] User soft-deleted
- [ ] User removed from orgs
- [ ] User cannot login
- [ ] Confirmation email sent

---

## Dependencies

- **Phase 1 (Email)**: Invitations require email sending capability
- For MVP, invitations can return the invite URL directly (admin shares manually)
- Email integration in Phase 1 will enable automatic sending

---

## Files to Create

```
apps/client/src/pages/auth/
├── ForgotPasswordPage.tsx
├── ResetPasswordPage.tsx
├── VerifyEmailPage.tsx
└── AcceptInvitePage.tsx

apps/client/src/pages/settings/
├── ProfilePage.tsx
├── SecurityPage.tsx
└── AccountPage.tsx

apps/server/src/v1/routes/
├── auth.ts (extend)
└── invitations.ts (new)

apps/server/src/services/
└── invitation.service.ts

packages/database/src/schema/
└── invitations.ts

supabase/migrations/
└── 0014_user_management_foundation.sql
```

---

## Success Metrics

- Password reset completion rate > 90%
- Email verification rate > 80%
- Invitation acceptance rate > 70%
- Zero password reset security incidents
