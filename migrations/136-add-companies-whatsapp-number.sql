-- Add whatsapp_number column to companies table for registration contact
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'whatsapp_number'
    ) THEN
        ALTER TABLE companies ADD COLUMN whatsapp_number TEXT;
        RAISE NOTICE 'Added whatsapp_number column to companies table';
    END IF;
END $$;
