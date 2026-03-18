-- ============================================================================
-- Support Tickets System
-- Enables users to create and track support tickets, admins to manage them
-- ============================================================================

-- Support tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ticket reference (human-readable)
  ticket_number VARCHAR(20) NOT NULL UNIQUE,

  -- Content
  subject VARCHAR(255) NOT NULL,
  description TEXT,

  -- Status workflow: open -> in_progress -> waiting_customer -> resolved -> closed
  status VARCHAR(50) NOT NULL DEFAULT 'open',

  -- Priority: low, medium, high, urgent
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',

  -- Category for routing (billing, technical, feature_request, account, other)
  category VARCHAR(50) DEFAULT 'other',

  -- Ownership
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Assignment (admin who is handling the ticket)
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Ticket messages/replies (conversation thread)
CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,

  -- Who sent the message
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_type VARCHAR(20) NOT NULL, -- 'user', 'admin', 'system'

  -- Content
  content TEXT NOT NULL,

  -- Optional attachments (URLs or file references)
  attachments JSONB DEFAULT '[]',

  -- Internal notes (visible only to admins)
  is_internal BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Metadata (e.g., email message ID for syncing)
  metadata JSONB DEFAULT '{}'
);

-- Sequence for ticket numbers
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1000;

-- Function to generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ticket_number := 'TIC-' || nextval('ticket_number_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate ticket number
DROP TRIGGER IF EXISTS set_ticket_number ON support_tickets;
CREATE TRIGGER set_ticket_number
  BEFORE INSERT ON support_tickets
  FOR EACH ROW
  WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
  EXECUTE FUNCTION generate_ticket_number();

-- Function to update ticket timestamps
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();

  -- Track first response time
  IF NEW.first_response_at IS NULL
     AND OLD.first_response_at IS NULL
     AND (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = NEW.id AND sender_type = 'admin' AND NOT is_internal) > 0 THEN
    NEW.first_response_at := now();
  END IF;

  -- Track resolution time
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at := now();
  END IF;

  -- Track close time
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    NEW.closed_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for timestamp updates
DROP TRIGGER IF EXISTS ticket_timestamp_update ON support_tickets;
CREATE TRIGGER ticket_timestamp_update
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_org ON support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender ON ticket_messages(sender_id);

-- Row Level Security
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

-- Policies for support_tickets
-- Users can view their own tickets
CREATE POLICY support_tickets_user_select ON support_tickets
  FOR SELECT
  USING (user_id = auth.uid() OR organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  ));

-- Users can create tickets
CREATE POLICY support_tickets_user_insert ON support_tickets
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own open tickets (e.g., close them)
CREATE POLICY support_tickets_user_update ON support_tickets
  FOR UPDATE
  USING (user_id = auth.uid() AND status IN ('open', 'waiting_customer'));

-- Policies for ticket_messages
-- Users can view messages on their tickets (except internal notes)
CREATE POLICY ticket_messages_user_select ON ticket_messages
  FOR SELECT
  USING (
    NOT is_internal AND
    ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
  );

-- Users can add messages to their tickets
CREATE POLICY ticket_messages_user_insert ON ticket_messages
  FOR INSERT
  WITH CHECK (
    ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid()) AND
    sender_type = 'user' AND
    NOT is_internal
  );

-- Service role bypass for admin operations
-- (Admins use service role, so RLS is bypassed)
