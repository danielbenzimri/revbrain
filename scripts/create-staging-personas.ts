#!/usr/bin/env npx tsx
/**
 * Create Staging Persona Accounts
 *
 * Provisions real Supabase Auth accounts for each test persona in the staging
 * project. These accounts enable the /v1/dev/persona-login endpoint to mint
 * real JWT sessions without exposing credentials to the client.
 *
 * Run: npx tsx scripts/create-staging-personas.ts
 *
 * Prerequisites:
 *   - .env.staging must exist with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - The staging Supabase project must be accessible
 *
 * What it does:
 *   1. For each persona: creates a Supabase Auth user (email-confirmed, no email sent)
 *   2. Skips personas that already have auth accounts (idempotent)
 *   3. Reports which accounts were created vs skipped
 *
 * The persona-login endpoint uses admin.generateLink() + verifyOtp() to mint
 * sessions — it does NOT need passwords. This script just ensures the auth
 * accounts exist so that flow works.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.staging') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.staging');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Persona {
  role: string;
  email: string;
  fullName: string;
}

const PERSONAS: Persona[] = [
  { role: 'system_admin', email: 'admin@revbrain.ai', fullName: 'System Admin' },
  { role: 'org_owner', email: 'david@test.org', fullName: 'David Levy (Org Owner)' },
  { role: 'admin', email: 'sarah@test.org', fullName: 'Sarah Cohen (Admin)' },
  { role: 'operator', email: 'mike@test.org', fullName: 'Mike Johnson (Operator)' },
  { role: 'reviewer', email: 'amy@test.org', fullName: 'Amy Chen (Reviewer)' },
];

async function main() {
  console.log(`\nProvisioning persona accounts on ${SUPABASE_URL}\n`);

  // List existing auth users to check what's already there
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list existing users:', listError.message);
    process.exit(1);
  }

  const existingEmails = new Set(existingUsers.users.map((u) => u.email?.toLowerCase()));

  let created = 0;
  let skipped = 0;

  for (const persona of PERSONAS) {
    if (existingEmails.has(persona.email.toLowerCase())) {
      console.log(`  ✓ ${persona.role.padEnd(14)} ${persona.email.padEnd(24)} (already exists)`);
      skipped++;
      continue;
    }

    // Create with a random password (never used — persona-login uses admin API)
    const password = randomBytes(24).toString('base64url');

    const { data, error } = await supabase.auth.admin.createUser({
      email: persona.email,
      password,
      email_confirm: true, // Skip email verification
      user_metadata: {
        full_name: persona.fullName,
        role: persona.role,
      },
    });

    if (error) {
      console.error(
        `  ✗ ${persona.role.padEnd(14)} ${persona.email.padEnd(24)} ERROR: ${error.message}`
      );
      continue;
    }

    console.log(
      `  + ${persona.role.padEnd(14)} ${persona.email.padEnd(24)} created (id: ${data.user.id})`
    );
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped (already existed)\n`);

  if (created > 0) {
    console.log(
      'NOTE: The persona-login endpoint uses Supabase Admin API to mint sessions.\n' +
        'No passwords are stored or needed. The accounts just need to exist.\n' +
        'Make sure PERSONA_LOGIN_SECRET is set in .env.staging and\n' +
        'VITE_PERSONA_LOGIN_ENABLED=true is set for the client.\n'
    );
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
