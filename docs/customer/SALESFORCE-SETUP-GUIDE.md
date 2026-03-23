# RevBrain — Salesforce Connection Setup Guide

> **Audience:** Salesforce administrators at your organization
> **Time required:** ~5 minutes (one-time setup)
> **Last updated:** March 2026 (Salesforce Spring '26)

---

## Why This Step Is Needed

Before your team can connect RevBrain to your Salesforce org, a Salesforce administrator must approve RevBrain as an authorized application. This is a standard Salesforce security feature that protects your organization from unauthorized third-party access.

This approval only needs to be done **once per Salesforce org**.

---

## Step-by-Step Instructions

### Step 1: Go to Setup

Log in to Salesforce as an administrator. Click the **gear icon** in the top-right corner, then select **Setup**.

### Step 2: Find Connected Apps OAuth Usage

In the Quick Find box (left sidebar), type **"OAuth"** and click **Connected Apps OAuth Usage** (under "Security" or "Apps").

> **Note:** Depending on your Salesforce version, this may be under **External Client App OAuth Usage** instead of "Connected Apps OAuth Usage." Both work the same way.

### Step 3: Find RevBrain

Look for **RevBrain** in the list.

- **If you see RevBrain:** Click **Install** or **Manage** next to it.
- **If you don't see RevBrain:** Someone from your team needs to attempt the connection first (click "Connect Salesforce" in RevBrain). After that attempt, RevBrain will appear in this list. Come back here and install it.

### Step 4: Approve RevBrain

Click **Install** (or **Approve**). Then configure the access policy:

**Option A — Recommended for most organizations:**

- Set **Permitted Users** to **"All users may self-authorize"**
- This allows any user with the appropriate Salesforce profile to connect RevBrain

**Option B — For stricter security (enterprise):**

- Set **Permitted Users** to **"Admin approved users are pre-authorized"**
- Then assign specific **Profiles** or **Permission Sets** that are allowed to use RevBrain
- Only users in those profiles/permission sets will be able to connect

### Step 5: Done

That's it! Your team can now connect RevBrain to this Salesforce org.

---

## What RevBrain Can Access

When a user connects RevBrain, they grant access to:

| Permission                                       | What It Means                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Access and manage your data (api)**            | RevBrain can read your CPQ configuration (products, rules, pricing) and write RCA configuration    |
| **Perform requests at any time (refresh_token)** | RevBrain can maintain access for the duration of the migration (weeks/months) without re-prompting |
| **Access your basic information (id)**           | RevBrain can see the name and email of the user who connected                                      |

RevBrain does **NOT** get:

- Access to your passwords or security settings
- The ability to modify user accounts or permissions
- Access to unrelated data (only Salesforce CPQ and Revenue Cloud objects)

---

## Revoking Access

You can revoke RevBrain's access at any time:

1. Go to **Setup → Connected Apps OAuth Usage**
2. Find **RevBrain**
3. Click **Manage** → **Block** or **Uninstall**

This immediately disconnects RevBrain from your Salesforce org.

---

## Common Issues

### "RevBrain hasn't been approved in this Salesforce org yet"

This error appears when a user tries to connect RevBrain before an administrator has completed the steps above. Follow Steps 1-4 to approve RevBrain.

### "User does not have permission to use this app"

This happens when:

- You chose Option B (admin-approved users) and the connecting user's profile isn't in the allowed list
- **Fix:** Add their profile or permission set to the RevBrain app's approved list

### "Unable to connect — redirected to SSO"

If your organization uses Single Sign-On (SSO), the user connecting may be redirected to your SSO provider instead of the Salesforce login page. This usually works fine. If it doesn't:

- Try using a custom login URL (e.g., `https://yourcompany.my.salesforce.com`) when connecting in RevBrain

---

## Need Help?

Contact RevBrain support at **support@revbrain.ai** or ask your RevBrain account representative.
