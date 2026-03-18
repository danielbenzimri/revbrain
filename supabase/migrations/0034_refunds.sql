-- Migration: Add refund tracking to payment_history
-- Description: Adds columns to track refund details for full and partial refunds

-- Add refund tracking columns to payment_history
ALTER TABLE payment_history
ADD COLUMN stripe_refund_id TEXT,
ADD COLUMN refunded_amount_cents INTEGER,
ADD COLUMN refunded_at TIMESTAMPTZ,
ADD COLUMN refund_reason TEXT;

-- Index for looking up payments by refund ID
CREATE INDEX idx_payment_history_stripe_refund_id
ON payment_history(stripe_refund_id)
WHERE stripe_refund_id IS NOT NULL;

-- Add comment documenting status values
COMMENT ON COLUMN payment_history.status IS 'Payment status: succeeded, failed, pending, refunded, partially_refunded';
