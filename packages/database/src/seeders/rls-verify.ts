/**
 * RLS Verification Suite
 *
 * Post-seed verification that confirms Row-Level Security policies
 * correctly isolate tenant data. Authenticates as seed users and
 * verifies cross-tenant visibility.
 *
 * 10 checks from DATABASE-SEEDER-SPEC.md §11.
 *
 * Note: Must work against both staging and production Supabase.
 */
import { createClient } from '@supabase/supabase-js';
import {
  SEED_USERS,
  SEED_ORGANIZATIONS,
  SEED_PROJECTS,
  SEED_TICKETS,
  MOCK_IDS,
} from '@revbrain/seed-data';

export interface RLSCheckResult {
  check: string;
  expected: string;
  actual: string;
  passed: boolean;
}

/**
 * Run all RLS verification checks.
 * Requires SUPABASE_URL and seed users to have auth accounts.
 */
export async function verifyRLS(options?: {
  password?: string;
}): Promise<{ results: RLSCheckResult[]; passed: number; failed: number }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY required for RLS verification');
  }

  const password = options?.password || process.env.SEED_PASSWORD || 'RevBrain-Dev-2026!';
  const results: RLSCheckResult[] = [];

  // Derive expected counts from seed data (not hardcoded)
  const acmeOrgId = MOCK_IDS.ORG_ACME;
  const betaOrgId = MOCK_IDS.ORG_BETA;
  const acmeProjectCount = SEED_PROJECTS.filter((p) => p.organizationId === acmeOrgId).length;
  const acmeTicketCount = SEED_TICKETS.filter((t) => t.organizationId === acmeOrgId).length;
  const acmeUserEmails = SEED_USERS.filter((u) => u.organizationId === acmeOrgId);

  // Helper: create authenticated Supabase client
  async function clientAs(email: string) {
    const client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
    return client;
  }

  // Helper: add check result
  function check(name: string, expected: string, actual: string) {
    results.push({ check: name, expected, actual, passed: expected === actual });
  }

  try {
    // === Checks 1-4: Acme org_owner ===
    console.log('  Authenticating as david@acme.com (Acme org_owner)...');
    const acmeClient = await clientAs('david@acme.com');

    // Check 1: Acme org_owner can read Acme org
    const { data: acmeOrgs } = await acmeClient
      .from('organizations')
      .select('id')
      .eq('id', acmeOrgId);
    check('1. Acme owner reads Acme org', 'Yes', acmeOrgs && acmeOrgs.length > 0 ? 'Yes' : 'No');

    // Check 2: Acme org_owner cannot read Beta org
    const { data: betaOrgs } = await acmeClient
      .from('organizations')
      .select('id')
      .eq('id', betaOrgId);
    check('2. Acme owner cannot read Beta org', '0', String(betaOrgs?.length || 0));

    // Check 3: Acme org_owner can read Acme projects
    const { data: acmeProjects } = await acmeClient
      .from('projects')
      .select('id')
      .eq('organization_id', acmeOrgId);
    check(
      '3. Acme owner reads Acme projects',
      String(acmeProjectCount),
      String(acmeProjects?.length || 0)
    );

    // Check 4: Acme org_owner cannot read Beta projects
    const { data: betaProjects } = await acmeClient
      .from('projects')
      .select('id')
      .eq('organization_id', betaOrgId);
    check('4. Acme owner cannot read Beta projects', '0', String(betaProjects?.length || 0));

    await acmeClient.auth.signOut();

    // === Checks 5-6: Beta org_owner ===
    console.log('  Authenticating as lisa@beta-ind.com (Beta org_owner)...');
    const betaClient = await clientAs('lisa@beta-ind.com');

    // Check 5: Beta org_owner can read Beta org
    const { data: betaOwnOrg } = await betaClient
      .from('organizations')
      .select('id')
      .eq('id', betaOrgId);
    check(
      '5. Beta owner reads Beta org',
      'Yes',
      betaOwnOrg && betaOwnOrg.length > 0 ? 'Yes' : 'No'
    );

    // Check 6: Beta org_owner cannot read Acme org
    const { data: betaSeesAcme } = await betaClient
      .from('organizations')
      .select('id')
      .eq('id', acmeOrgId);
    check('6. Beta owner cannot read Acme org', '0', String(betaSeesAcme?.length || 0));

    await betaClient.auth.signOut();

    // === Checks 7-8: System admin (uses service role for admin queries) ===
    // System admin accesses data via the server (service_role), not directly via client.
    // We verify the service_role can see all data.
    console.log('  Verifying system admin access (service role)...');
    const serviceClient = createClient(
      supabaseUrl!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    // Check 7: System admin can read all orgs
    const { data: allOrgs } = await serviceClient.from('organizations').select('id');
    check(
      '7. System admin reads all orgs',
      String(SEED_ORGANIZATIONS.length),
      String(allOrgs?.length || 0)
    );

    // Check 8: System admin can read all users
    const { data: allUsers } = await serviceClient.from('users').select('id');
    check(
      '8. System admin reads all users',
      String(SEED_USERS.length),
      String(allUsers?.length || 0)
    );

    // === Check 9: Pending user cannot authenticate ===
    console.log('  Verifying pending user cannot authenticate...');
    const pendingClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: pendingError } = await pendingClient.auth.signInWithPassword({
      email: 'pending@acme.com',
      password,
    });
    check(
      '9. Pending user cannot authenticate',
      'Auth fails',
      pendingError ? 'Auth fails' : 'Auth succeeds'
    );

    // === Check 10: Ticket messages inherit tenant scoping ===
    console.log('  Verifying ticket message scoping...');
    const acmeClient2 = await clientAs('david@acme.com');
    const { data: acmeTickets } = await acmeClient2
      .from('support_tickets')
      .select('id')
      .eq('organization_id', acmeOrgId);
    const acmeTicketIds = acmeTickets?.map((t) => t.id) || [];

    if (acmeTicketIds.length > 0) {
      const { data: messages } = await acmeClient2.from('ticket_messages').select('id, ticket_id');
      // All messages should belong to Acme tickets only
      const nonAcmeMessages = (messages || []).filter((m) => !acmeTicketIds.includes(m.ticket_id));
      check(
        '10. Ticket messages scoped to tenant',
        '0 non-Acme messages',
        `${nonAcmeMessages.length} non-Acme messages`
      );
    } else {
      check('10. Ticket messages scoped to tenant', 'N/A (no tickets)', 'N/A (no tickets)');
    }

    await acmeClient2.auth.signOut();
  } catch (err) {
    results.push({
      check: 'ERROR',
      expected: 'No errors',
      actual: err instanceof Error ? err.message : String(err),
      passed: false,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return { results, passed, failed };
}
