-- Add org_type and billing_contact_email to organizations
-- org_type: distinguishes SI partners from future end-clients
-- billing_contact_email: used for invoice delivery

ALTER TABLE organizations
  ADD COLUMN org_type varchar(20) NOT NULL DEFAULT 'si_partner';

ALTER TABLE organizations
  ADD COLUMN billing_contact_email text;
