-- Migration: Domain Tables for Legacy Migration
-- Phase 0.1: Core business domain tables
--
-- Tables created:
-- 1. boq_items - Bill of Quantities (hierarchical)
-- 2. bills - Contractor billing submissions
-- 3. bill_items - Individual bill line items
-- 4. measurements - Quantity approval records
-- 5. work_logs - Daily site reports
-- 6. tasks - Kanban task management
-- 7. chat_groups - Team chat channels
-- 8. chat_messages - Chat messages
-- 9. project_files - Document/media storage metadata
-- 10. walls - Engineering wall calculations
-- 11. paving_areas - Paving layer calculations
-- 12. earthwork_calculations - Cut/fill volume calculations

-- ============================================
-- 1. BOQ Items (Bill of Quantities)
-- ============================================
CREATE TABLE IF NOT EXISTS boq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES boq_items(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  unit VARCHAR(20),
  contract_quantity DECIMAL(15,4),
  unit_price_cents BIGINT,
  level INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(project_id, code)
);

CREATE INDEX idx_boq_items_project ON boq_items(project_id);
CREATE INDEX idx_boq_items_parent ON boq_items(parent_id);
CREATE INDEX idx_boq_items_org ON boq_items(organization_id);

-- ============================================
-- 2. Bills (Contractor Submissions)
-- ============================================
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bill_number INTEGER NOT NULL,
  period_start DATE,
  period_end DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- Status: draft, submitted, under_review, approved, rejected

  -- Contractor signature
  contractor_signature_url TEXT,
  contractor_signed_at TIMESTAMPTZ,
  contractor_signed_by UUID REFERENCES users(id),

  -- Inspector signature
  inspector_signature_url TEXT,
  inspector_signed_at TIMESTAMPTZ,
  inspector_signed_by UUID REFERENCES users(id),

  -- Amounts (calculated)
  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,

  -- Metadata
  remarks TEXT,
  rejection_reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  UNIQUE(project_id, bill_number)
);

CREATE INDEX idx_bills_project ON bills(project_id);
CREATE INDEX idx_bills_org ON bills(organization_id);
CREATE INDEX idx_bills_status ON bills(status);

-- ============================================
-- 3. Bill Items (Line Items)
-- ============================================
CREATE TABLE IF NOT EXISTS bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  boq_item_id UUID REFERENCES boq_items(id) ON DELETE SET NULL,
  boq_code VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  unit VARCHAR(20),

  -- Quantities
  previous_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  current_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  cumulative_quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  contract_quantity DECIMAL(15,4),

  -- Pricing
  unit_price_cents BIGINT NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  amount_cents BIGINT NOT NULL DEFAULT 0,

  -- Flags
  is_exception BOOLEAN NOT NULL DEFAULT false,
  exception_reason TEXT,
  remarks TEXT,

  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX idx_bill_items_boq ON bill_items(boq_item_id);

-- ============================================
-- 4. Measurements (Quantity Approvals)
-- ============================================
CREATE TABLE IF NOT EXISTS measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_item_id UUID NOT NULL REFERENCES bill_items(id) ON DELETE CASCADE,
  location TEXT,
  quantity DECIMAL(15,4) NOT NULL,

  -- Measurement details
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  measured_by UUID NOT NULL REFERENCES users(id),

  -- Approval
  approval_signature_url TEXT,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,

  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_measurements_bill_item ON measurements(bill_item_id);

-- ============================================
-- 5. Work Logs (Daily Site Reports)
-- ============================================
CREATE TABLE IF NOT EXISTS work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,

  -- Weather
  weather_type VARCHAR(20),
  -- Types: sunny, cloudy, rainy, stormy, windy
  weather_temp_celsius INTEGER,

  -- Resources (JSONB arrays)
  resources JSONB NOT NULL DEFAULT '[]',
  -- Structure: [{ trade: string, count: number, hours: number }]
  equipment JSONB NOT NULL DEFAULT '[]',
  -- Structure: [{ name: string, count: number, hours: number }]

  -- Activities
  activities TEXT,
  issues TEXT,
  safety_notes TEXT,

  -- Contractor signature
  contractor_signature_url TEXT,
  contractor_signed_at TIMESTAMPTZ,
  contractor_signed_by UUID REFERENCES users(id),

  -- Inspector signature
  inspector_signature_url TEXT,
  inspector_signed_at TIMESTAMPTZ,
  inspector_signed_by UUID REFERENCES users(id),

  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(project_id, log_date)
);

CREATE INDEX idx_work_logs_project ON work_logs(project_id);
CREATE INDEX idx_work_logs_org ON work_logs(organization_id);
CREATE INDEX idx_work_logs_date ON work_logs(log_date);

-- ============================================
-- 6. Tasks (Kanban)
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Status & Priority
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  -- Status: todo, in_progress, review, done
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  -- Priority: low, medium, high, urgent

  -- Assignment
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date DATE,

  -- Organization
  tags JSONB NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_org ON tasks(organization_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);

-- ============================================
-- 7. Chat Groups
-- ============================================
CREATE TABLE IF NOT EXISTS chat_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Access control
  is_private BOOLEAN NOT NULL DEFAULT false,
  members UUID[] NOT NULL DEFAULT '{}',
  admins UUID[] NOT NULL DEFAULT '{}',

  -- Activity
  last_message_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_groups_org ON chat_groups(organization_id);
CREATE INDEX idx_chat_groups_project ON chat_groups(project_id);

-- ============================================
-- 8. Chat Messages
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),

  -- Content
  content TEXT,
  message_type VARCHAR(20) NOT NULL DEFAULT 'text',
  -- Types: text, image, file, location, voice, system

  -- Attachments
  file_url TEXT,
  file_name VARCHAR(255),
  file_size_bytes BIGINT,
  thumbnail_url TEXT,

  -- Location
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  location_name TEXT,

  -- Reply/Thread
  reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,

  -- Reactions (JSONB: { "👍": ["user_id_1"], "❤️": ["user_id_2"] })
  reactions JSONB NOT NULL DEFAULT '{}',

  -- Status
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_group ON chat_messages(group_id);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);

-- ============================================
-- 9. Project Files (Documents/Media)
-- ============================================
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- File info
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(50),
  -- Types: document, image, video, audio, dxf, pdf, spreadsheet, other
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  mime_type VARCHAR(100),

  -- Thumbnails & previews
  thumbnail_path TEXT,
  preview_path TEXT,

  -- Organization
  folder_path VARCHAR(500) NOT NULL DEFAULT '/',

  -- Metadata (JSONB for flexible data like EXIF, DXF layers, etc.)
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Audit
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_files_project ON project_files(project_id);
CREATE INDEX idx_project_files_org ON project_files(organization_id);
CREATE INDEX idx_project_files_folder ON project_files(folder_path);
CREATE INDEX idx_project_files_type ON project_files(file_type);

-- ============================================
-- 10. Walls (Engineering Calculations)
-- ============================================
CREATE TABLE IF NOT EXISTS walls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Wall identification
  wall_type VARCHAR(30) NOT NULL,
  -- Types: cladding, gravity, reinforced
  name VARCHAR(100) NOT NULL,

  -- Sections (JSONB array of section definitions)
  sections JSONB NOT NULL DEFAULT '[]',

  -- Calculated results (cached)
  calculated_volume DECIMAL(15,4),
  calculated_area DECIMAL(15,4),
  rebar_weight_kg DECIMAL(15,4),
  concrete_volume DECIMAL(15,4),

  -- BOQ sync
  boq_sync_at TIMESTAMPTZ,

  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_walls_project ON walls(project_id);
CREATE INDEX idx_walls_org ON walls(organization_id);
CREATE INDEX idx_walls_type ON walls(wall_type);

-- ============================================
-- 11. Paving Areas
-- ============================================
CREATE TABLE IF NOT EXISTS paving_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Area identification
  name VARCHAR(100) NOT NULL,

  -- Layers (JSONB array of layer definitions)
  -- Structure: [{ material: string, thickness_cm: number, unit_price_cents: number }]
  layers JSONB NOT NULL DEFAULT '[]',

  -- DXF reference
  dxf_file_id UUID REFERENCES project_files(id) ON DELETE SET NULL,

  -- Calculated results (cached)
  total_area_sqm DECIMAL(15,4),
  calculated_quantities JSONB NOT NULL DEFAULT '{}',
  -- Structure: { material_name: { volume: number, cost_cents: number } }

  -- BOQ sync
  boq_sync_at TIMESTAMPTZ,

  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_paving_areas_project ON paving_areas(project_id);
CREATE INDEX idx_paving_areas_org ON paving_areas(organization_id);

-- ============================================
-- 12. Earthwork Calculations
-- ============================================
CREATE TABLE IF NOT EXISTS earthwork_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Calculation identification
  name VARCHAR(100) NOT NULL,
  method VARCHAR(20) NOT NULL,
  -- Methods: cross_section, grid, triangulation, average_end_area

  -- Sections (JSONB array of cross-section data)
  sections JSONB NOT NULL DEFAULT '[]',

  -- DXF reference
  dxf_file_id UUID REFERENCES project_files(id) ON DELETE SET NULL,

  -- Calculated results (cached)
  total_cut_volume DECIMAL(15,4),
  total_fill_volume DECIMAL(15,4),
  net_volume DECIMAL(15,4),

  -- BOQ sync
  boq_sync_at TIMESTAMPTZ,

  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_earthwork_project ON earthwork_calculations(project_id);
CREATE INDEX idx_earthwork_org ON earthwork_calculations(organization_id);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE boq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE walls ENABLE ROW LEVEL SECURITY;
ALTER TABLE paving_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE earthwork_calculations ENABLE ROW LEVEL SECURITY;

-- Helper function (if not exists)
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.users WHERE supabase_user_id = auth.uid()
$$;

-- BOQ Items: Org members can CRUD
CREATE POLICY "boq_items_org_access" ON boq_items
  FOR ALL USING (organization_id = public.get_user_org_id());

-- Bills: Org members can CRUD
CREATE POLICY "bills_org_access" ON bills
  FOR ALL USING (organization_id = public.get_user_org_id());

-- Bill Items: Access through bill (join check)
CREATE POLICY "bill_items_org_access" ON bill_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bills b
      WHERE b.id = bill_items.bill_id
      AND b.organization_id = public.get_user_org_id()
    )
  );

-- Measurements: Access through bill item chain
CREATE POLICY "measurements_org_access" ON measurements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bill_items bi
      JOIN bills b ON b.id = bi.bill_id
      WHERE bi.id = measurements.bill_item_id
      AND b.organization_id = public.get_user_org_id()
    )
  );

-- Work Logs: Org members can CRUD
CREATE POLICY "work_logs_org_access" ON work_logs
  FOR ALL USING (organization_id = public.get_user_org_id());

-- Tasks: Org members can CRUD
CREATE POLICY "tasks_org_access" ON tasks
  FOR ALL USING (organization_id = public.get_user_org_id());

-- Chat Groups: Org members can read, members can write
CREATE POLICY "chat_groups_org_read" ON chat_groups
  FOR SELECT USING (organization_id = public.get_user_org_id());

CREATE POLICY "chat_groups_member_write" ON chat_groups
  FOR ALL USING (
    organization_id = public.get_user_org_id()
    AND (
      NOT is_private
      OR (SELECT auth.uid()) = ANY(members)
      OR (SELECT auth.uid()) = ANY(admins)
    )
  );

-- Chat Messages: Group members can access
CREATE POLICY "chat_messages_group_access" ON chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM chat_groups cg
      WHERE cg.id = chat_messages.group_id
      AND cg.organization_id = public.get_user_org_id()
      AND (
        NOT cg.is_private
        OR auth.uid() = ANY(cg.members)
        OR auth.uid() = ANY(cg.admins)
      )
    )
  );

-- Project Files: Org members can CRUD
CREATE POLICY "project_files_org_access" ON project_files
  FOR ALL USING (organization_id = public.get_user_org_id());

-- Walls: Org members can CRUD
CREATE POLICY "walls_org_access" ON walls
  FOR ALL USING (organization_id = public.get_user_org_id());

-- Paving Areas: Org members can CRUD
CREATE POLICY "paving_areas_org_access" ON paving_areas
  FOR ALL USING (organization_id = public.get_user_org_id());

-- Earthwork Calculations: Org members can CRUD
CREATE POLICY "earthwork_org_access" ON earthwork_calculations
  FOR ALL USING (organization_id = public.get_user_org_id());

-- ============================================
-- TRIGGERS for updated_at
-- ============================================

-- Reusable trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_boq_items_updated_at BEFORE UPDATE ON boq_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bill_items_updated_at BEFORE UPDATE ON bill_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_work_logs_updated_at BEFORE UPDATE ON work_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_groups_updated_at BEFORE UPDATE ON chat_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_files_updated_at BEFORE UPDATE ON project_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_walls_updated_at BEFORE UPDATE ON walls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_paving_areas_updated_at BEFORE UPDATE ON paving_areas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_earthwork_updated_at BEFORE UPDATE ON earthwork_calculations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
