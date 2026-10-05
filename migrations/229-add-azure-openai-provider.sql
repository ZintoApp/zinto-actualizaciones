-- Allow Azure OpenAI as a first-class AI credential provider.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'system_ai_credentials'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'system_ai_credentials' AND column_name = 'provider'
    ) THEN
        BEGIN
            ALTER TABLE system_ai_credentials DROP CONSTRAINT IF EXISTS system_ai_credentials_provider_check;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop system_ai_credentials_provider_check: %', SQLERRM;
        END;

        BEGIN
            ALTER TABLE system_ai_credentials
            ADD CONSTRAINT system_ai_credentials_provider_check
            CHECK (provider IN ('openai', 'openrouter', 'azure'));
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not add system_ai_credentials_provider_check: %', SQLERRM;
        END;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'company_ai_credentials'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'company_ai_credentials' AND column_name = 'provider'
    ) THEN
        BEGIN
            ALTER TABLE company_ai_credentials DROP CONSTRAINT IF EXISTS company_ai_credentials_provider_check;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop company_ai_credentials_provider_check: %', SQLERRM;
        END;

        BEGIN
            ALTER TABLE company_ai_credentials
            ADD CONSTRAINT company_ai_credentials_provider_check
            CHECK (provider IN ('openai', 'openrouter', 'azure'));
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not add company_ai_credentials_provider_check: %', SQLERRM;
        END;
    END IF;
END $$;
