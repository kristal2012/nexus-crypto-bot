-- Step 1: Drop the plaintext api_secret column
-- Note: Users will need to re-enter their API secrets after this migration
-- New secrets will be automatically encrypted via the encrypt-api-secret edge function

ALTER TABLE public.binance_api_keys 
DROP COLUMN IF EXISTS api_secret;

-- Step 2: Make api_secret_encrypted NOT NULL with a default empty string for existing records
-- This prevents plaintext storage while allowing existing records to remain
UPDATE public.binance_api_keys 
SET api_secret_encrypted = '' 
WHERE api_secret_encrypted IS NULL;

ALTER TABLE public.binance_api_keys
ALTER COLUMN api_secret_encrypted SET NOT NULL;

-- Add comment
COMMENT ON COLUMN public.binance_api_keys.api_secret_encrypted IS 'Encrypted Binance API secret using AES-256-GCM. Encryption key stored in BINANCE_ENCRYPTION_KEY environment variable. Empty string indicates user needs to re-enter their secret.';