-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Defense-in-depth: Even if API layer is bypassed, database enforces access
-- ============================================================================

-- Helper function to get current user's organization_id
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT organization_id
  FROM public.users
  WHERE supabase_user_id = auth.uid()
  LIMIT 1
$$;

-- Helper function to check if current user is system_admin
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE supabase_user_id = auth.uid()
    AND role = 'system_admin'
  )
$$;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role
  FROM public.users
  WHERE supabase_user_id = auth.uid()
  LIMIT 1
$$;

-- ============================================================================
-- USERS TABLE RLS
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- System admins can do everything
CREATE POLICY "system_admins_full_access" ON public.users
  FOR ALL
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

-- Users can see other users in their organization
CREATE POLICY "users_view_same_org" ON public.users
  FOR SELECT
  USING (
    organization_id = public.get_user_org_id()
    OR public.is_system_admin()
  );

-- Users can update their own profile
CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE
  USING (supabase_user_id = auth.uid())
  WITH CHECK (supabase_user_id = auth.uid());

-- Org admins can insert users in their org (invites)
CREATE POLICY "org_admins_insert_users" ON public.users
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE supabase_user_id = auth.uid()
      AND is_org_admin = true
    )
  );

-- ============================================================================
-- ORGANIZATIONS TABLE RLS
-- ============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- System admins can do everything
CREATE POLICY "system_admins_full_access" ON public.organizations
  FOR ALL
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

-- Users can view their own organization
CREATE POLICY "users_view_own_org" ON public.organizations
  FOR SELECT
  USING (
    id = public.get_user_org_id()
    OR public.is_system_admin()
  );

-- ============================================================================
-- PLANS TABLE RLS
-- ============================================================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- System admins can do everything
CREATE POLICY "system_admins_full_access" ON public.plans
  FOR ALL
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

-- All authenticated users can view active plans
CREATE POLICY "users_view_active_plans" ON public.plans
  FOR SELECT
  USING (
    is_active = true
    AND auth.uid() IS NOT NULL
  );

-- ============================================================================
-- PROJECTS TABLE RLS
-- ============================================================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- System admins can do everything
CREATE POLICY "system_admins_full_access" ON public.projects
  FOR ALL
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

-- Users can view projects owned by users in their org
CREATE POLICY "users_view_org_projects" ON public.projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = public.projects.owner_id
      AND u.organization_id = public.get_user_org_id()
    )
    OR public.is_system_admin()
  );

-- Users can create projects (they become owner)
CREATE POLICY "users_create_projects" ON public.projects
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE supabase_user_id = auth.uid()
      AND id = public.projects.owner_id
    )
  );

-- Users can update/delete their own projects
CREATE POLICY "users_manage_own_projects" ON public.projects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE supabase_user_id = auth.uid()
      AND id = public.projects.owner_id
    )
  );

-- ============================================================================
-- AUDIT LOGS TABLE RLS
-- ============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- System admins can view all audit logs
CREATE POLICY "system_admins_view_all" ON public.audit_logs
  FOR SELECT
  USING (public.is_system_admin());

-- Users can view audit logs for their organization
CREATE POLICY "users_view_org_audit_logs" ON public.audit_logs
  FOR SELECT
  USING (
    organization_id = public.get_user_org_id()
    OR public.is_system_admin()
  );

-- Only system can insert audit logs (via service role)
-- Regular users cannot insert directly
CREATE POLICY "service_role_insert_audit" ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    -- This allows service role (used by Edge Functions) to insert
    -- auth.role() returns 'service_role' when using service key
    current_setting('role') = 'service_role'
    OR public.is_system_admin()
  );

-- ============================================================================
-- GRANT USAGE
-- ============================================================================
-- Ensure the helper functions are accessible
GRANT EXECUTE ON FUNCTION public.get_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
