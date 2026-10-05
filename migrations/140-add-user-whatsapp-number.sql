-- Add whatsapp_number column to users table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'whatsapp_number'
    ) THEN
        ALTER TABLE users ADD COLUMN whatsapp_number TEXT;
        RAISE NOTICE 'Added whatsapp_number column to users table';
    END IF;
END $$;

