-- Add age column to users (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'age') THEN
        ALTER TABLE "users" ADD COLUMN "age" integer;
    END IF;
END $$;
