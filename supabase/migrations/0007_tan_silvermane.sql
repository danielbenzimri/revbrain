-- Add password_hash column to users (idempotent)
-- Note: This column was later removed in 0008
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_hash') THEN
        ALTER TABLE "users" ADD COLUMN "password_hash" text;
    END IF;
END $$;
