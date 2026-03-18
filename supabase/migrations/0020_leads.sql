-- ============================================================================
-- LEADS TABLE
-- Enterprise lead capture and CRM functionality
-- ============================================================================

-- Create leads table for enterprise contact form submissions
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact Information
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50),
  company_name VARCHAR(255),
  company_size VARCHAR(50), -- '1-10', '11-50', '51-200', '200+'
  message TEXT,

  -- Lead Status Pipeline
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  -- Statuses: 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'proposal' | 'negotiation' | 'won' | 'lost'

  -- Source Tracking
  source VARCHAR(50) DEFAULT 'website',
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),

  -- CRM Fields
  notes TEXT,
  interest_level VARCHAR(20), -- 'low' | 'medium' | 'high' | 'very_high'
  estimated_value INTEGER, -- Estimated deal value in cents
  next_follow_up_at TIMESTAMPTZ,

  -- Calendly Integration
  calendly_event_uri TEXT,
  scheduled_at TIMESTAMPTZ,

  -- Assignment & Conversion
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  converted_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create lead activities table for activity tracking
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,

  -- Activity Details
  activity_type VARCHAR(50) NOT NULL,
  -- Types: 'status_change' | 'note_added' | 'email_sent' | 'call_logged' |
  --        'meeting_scheduled' | 'follow_up_set' | 'assigned' | 'converted'

  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB,

  -- Actor
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(contact_email);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads(next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);

-- Update trigger for leads
CREATE OR REPLACE FUNCTION update_lead_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_leads_updated_at ON leads;
CREATE TRIGGER trigger_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_updated_at();

-- Row Level Security for leads (system_admin only for now)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies - System admins can manage all leads
CREATE POLICY leads_system_admin_all ON leads
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.supabase_user_id = auth.uid()
      AND u.role = 'system_admin'
    )
  );

CREATE POLICY lead_activities_system_admin_all ON lead_activities
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.supabase_user_id = auth.uid()
      AND u.role = 'system_admin'
    )
  );

-- Insert is allowed from public (for contact form) via service role
-- Note: Public submissions will bypass RLS via service role key

COMMENT ON TABLE leads IS 'Enterprise lead capture and CRM for sales pipeline management';
COMMENT ON TABLE lead_activities IS 'Activity log for lead interactions and status changes';
