-- =============================================================================
-- Migration: 0031_tasks.sql
-- Description: Task management with Kanban board support
-- Phase: 3.2 - Task Management & Kanban
-- =============================================================================

-- Task status enum
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'review', 'done');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Task priority enum
DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- TASKS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Task content
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Status and priority
  status task_status NOT NULL DEFAULT 'todo',
  priority task_priority NOT NULL DEFAULT 'medium',

  -- Assignment
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  creator_id UUID NOT NULL REFERENCES users(id),

  -- Dates
  due_date DATE,

  -- Metadata
  tags JSONB DEFAULT '[]',
  task_number INTEGER,  -- Auto-incremented per project

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add missing columns if they don't exist (for existing tables)
DO $$
BEGIN
  -- Add creator_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'creator_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN creator_id UUID REFERENCES users(id);
  END IF;

  -- Add task_number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'task_number'
  ) THEN
    ALTER TABLE tasks ADD COLUMN task_number INTEGER;
  END IF;

  -- Add tags
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'tags'
  ) THEN
    ALTER TABLE tasks ADD COLUMN tags JSONB DEFAULT '[]';
  END IF;

  -- Add due_date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE tasks ADD COLUMN due_date DATE;
  END IF;

  -- Add description
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'description'
  ) THEN
    ALTER TABLE tasks ADD COLUMN description TEXT;
  END IF;

  -- Add assignee_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'assignee_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- TASK AUDIT LOG
-- =============================================================================
CREATE TABLE IF NOT EXISTS task_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Task reference (nullable for deleted tasks)
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  task_title VARCHAR(255) NOT NULL,

  -- Action details
  action VARCHAR(50) NOT NULL,  -- 'created', 'updated', 'deleted', 'status_changed'
  user_id UUID NOT NULL REFERENCES users(id),
  user_name VARCHAR(255) NOT NULL,

  -- Change details
  details TEXT,
  reason TEXT,  -- For deletions
  signature_url TEXT,  -- Digital signature for deletions

  -- Status change tracking
  previous_status task_status,
  new_status task_status,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_id);

CREATE INDEX IF NOT EXISTS idx_task_audit_org ON task_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_task_audit_project ON task_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_task_audit_task ON task_audit_log(task_id);

-- =============================================================================
-- AUTO-INCREMENT TASK NUMBER TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION set_task_number()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(MAX(task_number), 0) + 1
  INTO NEW.task_number
  FROM tasks
  WHERE project_id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_task_number ON tasks;
CREATE TRIGGER trigger_set_task_number
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_number();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_audit_log ENABLE ROW LEVEL SECURITY;

-- Tasks policies
DROP POLICY IF EXISTS "tasks_tenant_isolation" ON tasks;
CREATE POLICY "tasks_tenant_isolation" ON tasks
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS "tasks_service_role_bypass" ON tasks;
CREATE POLICY "tasks_service_role_bypass" ON tasks
  FOR ALL
  USING (current_setting('role', true) = 'service_role');

-- Task audit log policies
DROP POLICY IF EXISTS "task_audit_tenant_isolation" ON task_audit_log;
CREATE POLICY "task_audit_tenant_isolation" ON task_audit_log
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS "task_audit_service_role_bypass" ON task_audit_log;
CREATE POLICY "task_audit_service_role_bypass" ON task_audit_log
  FOR ALL
  USING (current_setting('role', true) = 'service_role');

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT ALL ON tasks TO authenticated;
GRANT ALL ON tasks TO service_role;
GRANT ALL ON task_audit_log TO authenticated;
GRANT ALL ON task_audit_log TO service_role;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE tasks IS 'Project tasks with Kanban board support';
COMMENT ON COLUMN tasks.status IS 'Kanban column: todo, in_progress, review, done';
COMMENT ON COLUMN tasks.priority IS 'Task urgency: low, medium, high, critical';
COMMENT ON COLUMN tasks.task_number IS 'Auto-incremented task number per project';
COMMENT ON TABLE task_audit_log IS 'Audit trail for task changes including deletions with signatures';
