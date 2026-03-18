-- =============================================================================
-- Migration 0033: Performance Indexes
-- Add composite indexes for frequently-queried patterns
-- =============================================================================

-- BOQ Items: queried by project, sorted by sort_order
CREATE INDEX IF NOT EXISTS idx_boq_items_project_sort
  ON boq_items (project_id, sort_order);

-- BOQ Items: parent lookup for tree queries
CREATE INDEX IF NOT EXISTS idx_boq_items_parent
  ON boq_items (parent_id) WHERE parent_id IS NOT NULL;

-- Bills: queried by project + status (list page with filters)
CREATE INDEX IF NOT EXISTS idx_bills_project_status
  ON bills (project_id, status);

-- Bill Items: queried by bill ID (detail page)
CREATE INDEX IF NOT EXISTS idx_bill_items_bill
  ON bill_items (bill_id);

-- Work Logs: queried by project + date (calendar view, list sorted by date)
CREATE INDEX IF NOT EXISTS idx_work_logs_project_date
  ON work_logs (project_id, log_date DESC);

-- Work Logs: queried by project + status (filtered lists)
CREATE INDEX IF NOT EXISTS idx_work_logs_project_status
  ON work_logs (project_id, status);

-- Tasks: queried by project + status (kanban board columns)
CREATE INDEX IF NOT EXISTS idx_tasks_project_status
  ON tasks (project_id, status);

-- Tasks: queried by assignee (my tasks view)
CREATE INDEX IF NOT EXISTS idx_tasks_assignee
  ON tasks (assignee_id) WHERE assignee_id IS NOT NULL;

-- Tasks: sorted within status columns
CREATE INDEX IF NOT EXISTS idx_tasks_project_sort
  ON tasks (project_id, sort_order);

-- Task Audit Log: queried by project (audit log view)
CREATE INDEX IF NOT EXISTS idx_task_audit_project
  ON task_audit_log (project_id, created_at DESC);

-- Projects: queried by organization (all project listings)
CREATE INDEX IF NOT EXISTS idx_projects_org
  ON projects (organization_id, status);
